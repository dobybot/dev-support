import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useParams } from 'react-router-dom'

import { InlineMd } from '@/components/run/inline-md'
import { LiveStatus } from '@/components/run/live-status'
import { ReadingPanelContext } from '@/components/run/panel-context'
import { ReadStateContext } from '@/components/run/read-state-context'
import { ReadingPanel } from '@/components/run/reading-panel'
import { RunContext, RunEventsContext } from '@/components/run/run-context'
import { ErrorBox, Loading, Warnings } from '@/components/run/status'
import { ToastHost } from '@/components/run/toast-host'
import { ThemeToggle } from '@/components/theme-toggle'
import { fetchRun } from '@/lib/api'
import type { SectionReadStatus } from '@/lib/read-state'
import { displayRepoName, formatCommitRange, formatRunDate, shortCommit } from '@/lib/run-list'
import { useAsync } from '@/lib/use-async'
import { useReadState } from '@/lib/use-read-state'
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

/**
 * icon สถานะการอ่านต่อ section ใน nav (SPEC-reading-checklist story 6):
 * ○ ยังไม่อ่าน / ◐ อ่าน prose แล้ว / ● อ่าน prose + span ครบ · ใช้ slot เดียวกับ "รอเขียน"
 * (generation state ชนะระหว่าง section ยัง pending — ตัวเรียกเป็นคนเลือก)
 */
const READ_STATUS_META: Record<SectionReadStatus, { glyph: string; label: string }> = {
  unread: { glyph: '○', label: 'ยังไม่ได้อ่าน' },
  prose: { glyph: '◐', label: 'อ่านเนื้อหาแล้ว — โค้ดยังอ่านไม่ครบ' },
  done: { glyph: '●', label: 'อ่านครบแล้ว' },
}

function SectionReadIcon({ status }: { status: SectionReadStatus }) {
  const meta = READ_STATUS_META[status]
  return (
    <span
      title={meta.label}
      aria-label={meta.label}
      data-read-status={status}
      className="shrink-0 text-[11px] leading-5 text-muted-foreground"
    >
      {meta.glyph}
    </span>
  )
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
  // read state (checklist + coverage) — host ที่นี่เพื่อให้ nav/header/span card/coverage view
  // เห็น source of truth เดียวกัน (SPEC-reading-checklist → Code structure)
  const readState = useReadState(runId, data?.data ?? null)
  const [navCollapsed, toggleNav] = useNavCollapsed()
  const { lastChange, connectedAt } = events

  // ไฟล์ไหนเปลี่ยนก็ตาม สถานะ "เขียนแล้ว/ยังไม่เขียน" ของทั้ง run เปลี่ยนตามได้เสมอ
  // (ไฟล์ใหม่โผล่ = section นั้นเลิก pending, run.json เปลี่ยน = section list เปลี่ยน)
  // connectedAt ครอบช่วงก่อนสายจะติด ซึ่งเป็นช่วงเดียวที่ event หายได้
  useEffect(() => {
    if (lastChange || connectedAt) reload()
  }, [lastChange, connectedAt, reload])

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
  const { progress, coverage, coverageReason } = readState
  const verifySection = data.data.sections.find((section) => section.kind === 'verify')
  // header render จาก run.json โดยตรง (registry แค่คัดลอกมา) จึงอ่านจาก data.data ก่อน
  const baseCommit = data.data.baseCommit ?? run.baseCommit
  const compare = baseCommit ? compareUrl(prUrl, baseCommit, run.commit) : null

  return (
    <RunContext.Provider value={data}>
      <RunEventsContext.Provider value={events}>
        <ReadingPanelContext.Provider value={panel}>
        <ReadStateContext.Provider value={readState}>
          {/* panel เป็น flex sibling ของเนื้อหา ไม่ใช่ overlay — เปิดแล้วเนื้อหา "แคบลง" ไม่ใช่ "ถูกบัง"
              (ตอนปิด เนื้อหากลับไปอยู่กึ่งกลางที่ max-w-6xl เหมือนเดิม) */}
          <div className="flex min-h-screen w-full">
            {/* อ่านเต็มหน้าจอ (issue #30): ซ่อนคอลัมน์ sidebar+เนื้อหาทั้งก้อน panel จึงยืดเต็มแถวเอง */}
            <div className={cn('min-w-0 flex-1', panel.fullscreen && 'hidden')}>
              <div className={cn('flex w-full gap-8 px-8 py-8', panel.open ? 'max-w-none' : 'mx-auto max-w-6xl')}>
                {/* พับได้ (issue #27) — ตอนพับเหลือ rail แคบ ๆ ที่มีปุ่มกางกลับ ไม่หายไปทั้งแถบ
                    ไม่พับอัตโนมัติตอน code panel เปิด (ยังไม่ตัดสินใจ — ดู issue) */}
                <aside
                  className={cn('sticky top-8 hidden h-fit shrink-0 lg:block', navCollapsed ? 'w-8' : 'w-56')}
                >
                  <button
                    type="button"
                    onClick={toggleNav}
                    title={navCollapsed ? 'กางเมนู section' : 'พับเมนู section'}
                    className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    {navCollapsed ? (
                      <PanelLeftOpen className="size-4" aria-hidden />
                    ) : (
                      <PanelLeftClose className="size-4" aria-hidden />
                    )}
                  </button>
                  {navCollapsed ? null : (
                    <>
                      <div className="mt-3">
                        <Link to="/" className="text-xs text-muted-foreground underline underline-offset-2">
                          ← run ทั้งหมด
                        </Link>
                      </div>
                      <nav className="mt-4">
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
                                  {/* slot เดียว: ระหว่างยังไม่เขียน "รอเขียน" ชนะ · เขียนแล้วโชว์สถานะการอ่าน
                                      (SPEC-reading-checklist → UI placement) */}
                                  {isWritten ? (
                                    <SectionReadIcon status={readState.statusOf(section.id)} />
                                  ) : (
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
                    </>
                  )}
                </aside>

                <main className="min-w-0 flex-1">
                  <header className="border-b pb-4">
                    <div className="flex items-start justify-between gap-3">
                      <h1 className="text-2xl font-semibold tracking-tight">
                        PR #{run.pr.number} — {data.data.title}
                      </h1>
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
                      {/* progress ผ่าน content ที่ curate มา — นับเป็นจำนวน ไม่ใช่แค่ % (story 8, 9) */}
                      <span data-read-progress title="ความคืบหน้าการอ่านของ run นี้">
                        อ่านแล้ว {progress.sectionsRead}/{progress.sectionsTotal} หน้า
                        {progress.spansTotal > 0
                          ? ` · ${progress.spansRead}/${progress.spansTotal} spans`
                          : ''}
                      </span>
                      {/* coverage วัดกับ diff จริง — คลิกไปหน้า verify ที่มี coverage view (story 10) */}
                      {coverage ? (
                        verifySection ? (
                          <Link
                            to={`/r/${run.id}/${verifySection.id}`}
                            className="underline underline-offset-2"
                            title="เปิด coverage view — โค้ดที่เปลี่ยนแต่ reading list ไม่ครอบคลุม"
                            data-coverage-pct={coverage.pct}
                          >
                            coverage {coverage.pct}%
                          </Link>
                        ) : (
                          <span data-coverage-pct={coverage.pct}>coverage {coverage.pct}%</span>
                        )
                      ) : coverageReason ? (
                        /* วัดไม่ได้ต้องดังพอ ๆ กับวัดได้ — ไม่งั้นแยกไม่ออกจาก "ไม่มีฟีเจอร์นี้" */
                        <span
                          className="text-amber-700 dark:text-amber-400"
                          title={`วัด coverage ไม่ได้ — ${coverageReason}`}
                          data-coverage-unavailable
                        >
                          coverage วัดไม่ได้
                        </span>
                      ) : null}
                    </div>
                    {data.data.subtitle ? (
                      <div className="mt-2 text-sm text-muted-foreground">
                        <InlineMd diffstat>{data.data.subtitle}</InlineMd>
                      </div>
                    ) : null}
                  </header>

                  <Warnings items={data.warnings} />
                  <Outlet />
                </main>
              </div>
            </div>
            <ReadingPanel />
          </div>
          {/* ทางตันของ code navigation (definition ไม่อยู่ใน repo / รอ index) โผล่ที่นี่ — issue #36 */}
          <ToastHost />
        </ReadStateContext.Provider>
        </ReadingPanelContext.Provider>
      </RunEventsContext.Provider>
    </RunContext.Provider>
  )
}
