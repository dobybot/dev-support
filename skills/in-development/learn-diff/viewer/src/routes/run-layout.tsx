import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useParams } from 'react-router-dom'

import { CommentsContext } from '@/components/run/comments-context'
import { InlineMd } from '@/components/run/inline-md'
import { LiveStatus } from '@/components/run/live-status'
import { ReadingPanelContext } from '@/components/run/panel-context'
import { PrComments } from '@/components/run/pr-comments'
import { ReadingPanel } from '@/components/run/reading-panel'
import { RunContext, RunEventsContext } from '@/components/run/run-context'
import { ErrorBox, Loading, Warnings } from '@/components/run/status'
import { ToastHost } from '@/components/run/toast-host'
import { ThemeToggle } from '@/components/theme-toggle'
import { fetchRun } from '@/lib/api'
import { APP_TITLE, runDocumentTitle, runHeading } from '@/lib/pr-title'
import { displayRepoName, formatCommitRange, formatRunDate, shortCommit } from '@/lib/run-list'
import { useAsync } from '@/lib/use-async'
import { useComments } from '@/lib/use-comments'
import { useReadingPanel } from '@/lib/use-reading-panel'
import { useRunEvents } from '@/lib/use-run-events'
import { cn } from '@/lib/utils'

/**
 * เปลือกของ run — header + section nav + code panel อยู่ตรงนี้ทั้งหมด เนื้อหาสลับผ่าน <Outlet/>
 * การเดินไปมาระหว่าง section จึงเปลี่ยนแค่ pane เดียว panel ที่เปิดค้างไว้จึงรอดข้ามหน้า
 * (user story 29) — state ของ panel อยู่ที่นี่ ไม่ใช่ในหน้า
 *
 * สาย SSE เปิดที่นี่เส้นเดียวต่อ run แล้วส่งต่อให้ลูกผ่าน RunEventsContext
 */
const NAV_COLLAPSED_KEY = 'learn-diff:nav-collapsed'

/**
 * สถานะพับ/กางของ nav ซ้าย — อยู่ที่เปลือกจึงรอดข้ามการสลับ section เอง
 * และจำลง localStorage เพราะเป็นค่าของ "ผู้อ่าน" ไม่ใช่ของ run (แบบเดียวกับความกว้าง panel)
 */
function useNavCollapsed(): [boolean, () => void] {
  const [collapsed, setCollapsed] = useState(
    () => typeof window !== 'undefined' && window.localStorage.getItem(NAV_COLLAPSED_KEY) === '1',
  )
  const toggle = useCallback(() => {
    setCollapsed((value) => {
      const next = !value
      window.localStorage.setItem(NAV_COLLAPSED_KEY, next ? '1' : '0')
      return next
    })
  }, [])
  return [collapsed, toggle]
}

/** compare URL ของ GitHub จาก pr.url — เดาได้เฉพาะ url รูป /pull/N เท่านั้น ไม่ใช่ = ไม่ลิงก์ */
function compareUrl(prUrl: string | undefined, base: string, head: string): string | null {
  if (!prUrl || !/\/pull\/\d+/.test(prUrl)) return null
  return `${prUrl.replace(/\/pull\/\d+.*$/, '')}/compare/${base}...${head}`
}

export function RunLayout() {
  const { runId = '' } = useParams()
  const load = useCallback(() => fetchRun(runId), [runId])
  const { data, error, loading, reload } = useAsync(load, [runId])
  const events = useRunEvents(runId)
  const panel = useReadingPanel(runId)
  // comment ของ PR อยู่ที่เปลือกเหมือน panel — badge ในกล่องโค้ดกับกล่องท้ายหน้าใช้ชุดเดียวกัน
  // และไม่ถูกดึงใหม่ทุกครั้งที่เปลี่ยน section (issue #49)
  const comments = useComments(runId)
  const [navCollapsed, toggleNav] = useNavCollapsed()
  const { lastChange, connectedAt } = events

  // ไฟล์ไหนเปลี่ยนก็ตาม สถานะ "เขียนแล้ว/ยังไม่เขียน" ของทั้ง run เปลี่ยนตามได้เสมอ
  // (ไฟล์ใหม่โผล่ = section นั้นเลิก pending, run.json เปลี่ยน = section list เปลี่ยน)
  // connectedAt ครอบช่วงก่อนสายจะติด ซึ่งเป็นช่วงเดียวที่ event หายได้
  useEffect(() => {
    if (lastChange || connectedAt) reload()
  }, [lastChange, connectedAt, reload])

  // ชื่อแท็บ = ชื่อ run (issue #41) — เปิดหลาย run พร้อมกันแล้วแยกออกโดยไม่ต้องคลิกเข้าไปดู
  // ออกจากหน้า run แล้วคืนเป็นชื่อ app (หน้า list ยังระบุตัวได้ — user story 4)
  // เป็น string ทั้งคู่ (ไม่ใช่ object) — reload จาก SSE ทุกรอบจึงไม่สั่งตั้งชื่อใหม่โดยไม่จำเป็น
  const heading = data ? runHeading(data.run.pr.number, data.data.title) : null
  const docTitle = data ? runDocumentTitle(data.run.pr.number, data.data.title) : null
  useEffect(() => {
    if (!docTitle) return
    document.title = docTitle
    return () => {
      document.title = APP_TITLE
    }
  }, [docTitle])

  if (loading && !data) return <Loading label="กำลังโหลด run…" />
  if (error && !data) {
    return (
      <main className="mx-auto w-full max-w-3xl px-8 py-12">
        <ErrorBox error={error} title={`เปิด run "${runId}" ไม่ได้`} />
        <Link to="/" className="text-sm underline underline-offset-2">
          ← กลับไปรายการ run
        </Link>
      </main>
    )
  }
  if (!data) return null

  const { run, written } = data
  const prUrl = run.pr.url
  // header render จาก run.json โดยตรง (registry แค่คัดลอกมา) จึงอ่านจาก data.data ก่อน
  const baseCommit = data.data.baseCommit ?? run.baseCommit
  const compare = baseCommit ? compareUrl(prUrl, baseCommit, run.commit) : null

  return (
    <RunContext.Provider value={data}>
      <RunEventsContext.Provider value={events}>
        <ReadingPanelContext.Provider value={panel}>
          <CommentsContext.Provider value={comments}>
            {/* panel เป็น flex sibling ของเนื้อหา ไม่ใช่ overlay — เปิดแล้วเนื้อหา "แคบลง" ไม่ใช่ "ถูกบัง"
                (ตอนปิด เนื้อหากลับไปอยู่กึ่งกลางที่ max-w-6xl เหมือนเดิม) */}
            <div className="flex min-h-screen w-full">
              {/* อ่านเต็มหน้าจอ (issue #30): ซ่อนคอลัมน์ sidebar+เนื้อหาทั้งก้อน panel จึงยืดเต็มแถวเอง */}
              <div className={cn('min-w-0 flex-1', panel.fullscreen && 'hidden')}>
                {/* topbar บาง sticky (issue #46) — ที่อยู่ถาวรของปุ่มพับ/กาง + ทางกลับไปหน้ารายการ
                    ทำให้ sidebar ที่พับแล้ว "หายทั้งแถบ" ได้โดยไม่เสีย navigation (user story 8)
                    และชื่อ PR ย่อยังบอกได้ตลอดว่าอยู่ run ไหนตอน scroll ลึก (user story 9) */}
                <div className="sticky top-0 z-30 flex h-11 w-full items-center gap-3 border-b bg-background/95 px-8 backdrop-blur">
                  {/* ปุ่มโผล่เฉพาะจอที่มี sidebar จริง — จอแคบกว่านั้น sidebar ซ่อนอยู่แล้ว กดไปก็ไม่มีอะไรเกิด */}
                  <button
                    type="button"
                    onClick={toggleNav}
                    title={navCollapsed ? 'กางเมนู section' : 'พับเมนู section'}
                    className="hidden shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground lg:block"
                  >
                    {navCollapsed ? (
                      <PanelLeftOpen className="size-4" aria-hidden />
                    ) : (
                      <PanelLeftClose className="size-4" aria-hidden />
                    )}
                  </button>
                  <Link
                    to="/"
                    className="shrink-0 text-xs text-muted-foreground underline underline-offset-2"
                  >
                    ← run ทั้งหมด
                  </Link>
                  <span className="min-w-0 truncate text-xs text-muted-foreground" title={heading ?? undefined}>
                    {heading}
                  </span>
                </div>
                <div className={cn('flex w-full gap-8 px-8 py-8', panel.open ? 'max-w-none' : 'mx-auto max-w-6xl')}>
                  {/* พับได้ (issue #27) — พับแล้วหายทั้งแถบ ไม่เหลือ rail ว่าง เนื้อหา reflow เต็มที่
                      (issue #46) ปุ่มกางกลับย้ายไปอยู่บน topbar
                      ไม่พับอัตโนมัติตอน code panel เปิด (ยังไม่ตัดสินใจ — ดู issue) */}
                  {navCollapsed ? null : (
                    <aside className="sticky top-14 hidden h-fit w-56 shrink-0 lg:block">
                      <nav>
                        <ul className="space-y-1">
                          {data.data.sections.map((section) => {
                            const isWritten = written.includes(section.id)
                            return (
                              <li key={section.id}>
                                {/* section ที่ยังไม่เขียนก็กดเข้าไปได้ — หน้าบอกว่ารออยู่ แล้วขึ้นเองเมื่อเขียนเสร็จ */}
                                <NavLink
                                  to={`/r/${run.id}/${section.id}`}
                                  end
                                  title={isWritten ? section.title : `${section.title} — ยังเขียนไม่เสร็จ`}
                                  className={({ isActive }) =>
                                    cn(
                                      'flex items-start gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted',
                                      isActive && 'bg-muted font-medium',
                                      !isWritten && 'text-muted-foreground',
                                    )
                                  }
                                >
                                  {/* ชื่อยาวตัดที่ 2 บรรทัด ไม่หั่นกลางคำ (issue #28) — คำไทยแบ่งตามขอบคำ
                                      เพราะ index.html ประกาศ lang="th" ไว้แล้ว */}
                                  <span className="min-w-0 flex-1 line-clamp-2">{section.title}</span>
                                  {isWritten ? null : (
                                    <span className="shrink-0 rounded-full border border-dashed px-1.5 text-[10px] leading-4">
                                      รอเขียน
                                    </span>
                                  )}
                                </NavLink>
                              </li>
                            )
                          })}
                        </ul>
                      </nav>
                    </aside>
                  )}

                  <main className="min-w-0 flex-1">
                    <header className="border-b pb-4">
                      <div className="flex items-start justify-between gap-3">
                        {/* ประกอบ "PR #N — " ฝั่ง viewer ที่เดียว — title ใน run.json ที่มี prefix มาแล้ว
                            ถูก strip ทิ้งก่อน ไม่งั้นได้ "PR #280 — PR #280 — …" (issue #42) */}
                        <h1 className="text-2xl font-semibold tracking-tight">{heading}</h1>
                        {/* ปุ่มธีม (issue #31) อยู่แถวหัวเรื่อง — sidebar พับได้แล้ว (issue #27)
                            จึงวางใน header ที่เห็นตลอดแทน */}
                        <div className="shrink-0">
                          <ThemeToggle />
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        {/* commit ที่ pin ไว้ = สิ่งที่ทุกเลขบรรทัดในหน้านี้อ้างถึง ต้องเห็นตลอด (user story 34)
                            และ base ต้องเห็นคู่กัน (issue #17) — merge-base ขยับตาม base branch
                            run สอง run ที่ head เดียวกันแต่ base ต่างกันคือคนละ diff */}
                        {baseCommit ? (
                          compare ? (
                            <a
                              href={compare}
                              target="_blank"
                              rel="noreferrer"
                              className="font-mono underline underline-offset-2"
                              title={`เทียบจาก base ${baseCommit} ถึง commit ${run.commit}`}
                            >
                              {formatCommitRange(baseCommit, run.commit)}
                            </a>
                          ) : (
                            <span
                              className="font-mono"
                              title={`เทียบจาก base ${baseCommit} ถึง commit ${run.commit}`}
                            >
                              {formatCommitRange(baseCommit, run.commit)}
                            </span>
                          )
                        ) : (
                          <>
                            <span className="font-mono" title={`commit ที่อ่านอยู่: ${run.commit}`}>
                              commit {shortCommit(run.commit)}
                            </span>
                            <span className="text-amber-700 dark:text-amber-400">
                              ไม่ได้ pin base — เทียบ diff ไม่ได้
                            </span>
                          </>
                        )}
                        {prUrl ? (
                          <a href={prUrl} className="underline underline-offset-2" target="_blank" rel="noreferrer">
                            PR #{run.pr.number} บน GitHub
                          </a>
                        ) : null}
                        <span title={run.repoPath}>{displayRepoName(run)}</span>
                        <span title={run.createdAt ?? undefined}>{formatRunDate(run.createdAt)}</span>
                        <LiveStatus
                          status={events.status}
                          written={written.length}
                          total={data.data.sections.length}
                        />
                      </div>
                      {data.data.subtitle ? (
                        <div className="mt-2 text-sm text-muted-foreground">
                          <InlineMd diffstat>{data.data.subtitle}</InlineMd>
                        </div>
                      ) : null}
                    </header>

                    <Warnings items={data.warnings} />
                    <Outlet />
                    {/* จดคำถามภาพรวมได้ตรงที่อ่านจบพอดี — ขึ้น GitHub จริงเพื่อให้ agent รอบถัดไปอ่านต่อได้ */}
                    <PrComments />
                  </main>
                </div>
              </div>
              <ReadingPanel />
            </div>
            {/* ทางตันของ code navigation (definition ไม่อยู่ใน repo / รอ index) โผล่ที่นี่ — issue #36
                และผลการส่ง comment ขึ้น GitHub — issue #49 */}
            <ToastHost />
          </CommentsContext.Provider>
        </ReadingPanelContext.Provider>
      </RunEventsContext.Provider>
    </RunContext.Provider>
  )
}
