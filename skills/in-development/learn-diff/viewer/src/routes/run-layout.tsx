import { useCallback, useEffect } from 'react'
import { Link, NavLink, Outlet, useParams } from 'react-router-dom'

import { InlineMd } from '@/components/run/inline-md'
import { LiveStatus } from '@/components/run/live-status'
import { ReadingPanelContext } from '@/components/run/panel-context'
import { ReadingPanel } from '@/components/run/reading-panel'
import { RunContext, RunEventsContext } from '@/components/run/run-context'
import { ErrorBox, Loading, Warnings } from '@/components/run/status'
import { fetchRun } from '@/lib/api'
import { formatRunDate, repoName, shortCommit } from '@/lib/run-list'
import { useAsync } from '@/lib/use-async'
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
export function RunLayout() {
  const { runId = '' } = useParams()
  const load = useCallback(() => fetchRun(runId), [runId])
  const { data, error, loading, reload } = useAsync(load, [runId])
  const events = useRunEvents(runId)
  const panel = useReadingPanel(runId)
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

  return (
    <RunContext.Provider value={data}>
      <RunEventsContext.Provider value={events}>
        <ReadingPanelContext.Provider value={panel}>
          {/* panel เป็น flex sibling ของเนื้อหา ไม่ใช่ overlay — เปิดแล้วเนื้อหา "แคบลง" ไม่ใช่ "ถูกบัง"
              (ตอนปิด เนื้อหากลับไปอยู่กึ่งกลางที่ max-w-6xl เหมือนเดิม) */}
          <div className="flex min-h-screen w-full">
            <div className="min-w-0 flex-1">
              <div className={cn('flex w-full gap-8 px-8 py-8', panel.open ? 'max-w-none' : 'mx-auto max-w-6xl')}>
                <aside className="sticky top-8 hidden h-fit w-56 shrink-0 lg:block">
                  <Link to="/" className="text-xs text-muted-foreground underline underline-offset-2">
                    ← run ทั้งหมด
                  </Link>
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
                              title={isWritten ? undefined : 'ยังเขียนไม่เสร็จ'}
                              className={({ isActive }) =>
                                cn(
                                  'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted',
                                  isActive && 'bg-muted font-medium',
                                  !isWritten && 'text-muted-foreground',
                                )
                              }
                            >
                              <span className="min-w-0 flex-1 truncate">{section.title}</span>
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

                <main className="min-w-0 flex-1">
                  <header className="border-b pb-4">
                    <h1 className="text-2xl font-semibold tracking-tight">
                      PR #{run.pr.number} — {data.data.title}
                    </h1>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      {/* commit ที่ pin ไว้ = สิ่งที่ทุกเลขบรรทัดในหน้านี้อ้างถึง ต้องเห็นตลอด (user story 34) */}
                      <span className="font-mono" title={`commit ที่อ่านอยู่: ${run.commit}`}>
                        commit {shortCommit(run.commit)}
                      </span>
                      {prUrl ? (
                        <a href={prUrl} className="underline underline-offset-2" target="_blank" rel="noreferrer">
                          PR #{run.pr.number} บน GitHub
                        </a>
                      ) : null}
                      <span title={run.repoPath}>{repoName(run.repoPath)}</span>
                      <span title={run.createdAt ?? undefined}>{formatRunDate(run.createdAt)}</span>
                      <LiveStatus
                        status={events.status}
                        written={written.length}
                        total={data.data.sections.length}
                      />
                    </div>
                    {data.data.subtitle ? (
                      <div className="mt-2 text-sm text-muted-foreground">
                        <InlineMd>{data.data.subtitle}</InlineMd>
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
        </ReadingPanelContext.Provider>
      </RunEventsContext.Provider>
    </RunContext.Provider>
  )
}
