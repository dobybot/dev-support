import { useState } from 'react'
import { Link } from 'react-router-dom'

import { ErrorBox, Loading } from '@/components/run/status'
import { ThemeToggle } from '@/components/theme-toggle'
import { fetchHealth, fetchRuns } from '@/lib/api'
import { displayRepoName, filterRuns, formatCommitRange, formatDateTime, formatRunDate, repoName } from '@/lib/run-list'
import { useAsync } from '@/lib/use-async'
import type { HealthResponse, RunSummary } from '@/shared/types'

/**
 * หน้าแรก — run ทุกอันที่เคยสร้างไว้ ข้ามทุก repo (SPEC-v3 user story 31–33)
 *
 * run ไม่ใช่ของใช้แล้วทิ้ง: การกลับไปอ่านคำอธิบายของเดือนที่แล้วต้องเป็นการ "กด" ไม่ใช่การ "ขุด"
 * registry จึงเป็นรายการเดียวข้าม repo และเรียงใหม่สุดขึ้นก่อน
 */
export function HomePage() {
  const { data, error, loading } = useAsync(fetchRuns, [])
  const health = useAsync(fetchHealth, [])
  const [query, setQuery] = useState('')

  const runs = data?.runs ?? []
  const shown = filterRuns(runs, query)

  return (
    <main className="mx-auto w-full max-w-4xl px-8 py-12">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">learn-diff</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            run ที่เคยสร้างไว้ทั้งหมด — ข้ามทุก repo ในเครื่องนี้
          </p>
        </div>
        <div className="flex items-center gap-3">
          {runs.length > 0 ? (
            <span className="text-xs text-muted-foreground">{runs.length} run</span>
          ) : null}
          <ThemeToggle />
        </div>
      </header>

      {runs.length > 3 ? (
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="ค้นหา: เลข PR, ชื่อเรื่อง, ชื่อ repo, sha"
          className="mt-6 w-full rounded-lg border bg-transparent px-3 py-2 text-sm outline-none focus:border-foreground/40"
        />
      ) : null}

      {loading && !data ? <Loading label="กำลังอ่าน registry…" /> : null}
      {error && !data ? <ErrorBox error={error} title="อ่านรายการ run ไม่ได้" /> : null}

      {data && runs.length === 0 ? (
        <p className="mt-8 rounded-lg border border-dashed px-5 py-8 text-center text-sm text-muted-foreground">
          ยังไม่มี run ที่ลงทะเบียนไว้ — สั่ง <code className="font-mono">/learn-diff</code> บน PR สักใบก่อน
        </p>
      ) : null}

      {data && runs.length > 0 && shown.length === 0 ? (
        <p className="mt-8 rounded-lg border border-dashed px-5 py-8 text-center text-sm text-muted-foreground">
          ไม่มี run ที่ตรงกับ “{query}”
        </p>
      ) : null}

      <ul className="mt-6 space-y-2">
        {shown.map((run) => (
          <li key={run.id}>
            <RunCard run={run} />
          </li>
        ))}
      </ul>

      <ServerFooter health={health.data} />
    </main>
  )
}

function RunCard({ run }: { run: RunSummary }) {
  const missing = run.available === false
  return (
    <div className="rounded-lg border transition-colors hover:bg-muted/50">
      <Link to={`/r/${run.id}`} className="block px-4 pt-3">
        <div className="flex items-baseline justify-between gap-3">
          <span className="min-w-0">
            <span className="font-mono text-sm text-muted-foreground">PR #{run.pr.number}</span>{' '}
            <span className="font-medium">{run.title}</span>
          </span>
          <span
            className="shrink-0 text-xs text-muted-foreground"
            title={run.createdAt ?? undefined}
          >
            {formatRunDate(run.createdAt)}
          </span>
        </div>
        {run.pr.title && run.pr.title !== run.title ? (
          <div className="mt-0.5 truncate text-sm text-muted-foreground">{run.pr.title}</div>
        ) : null}
      </Link>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 pb-3 pt-1.5 text-xs text-muted-foreground">
        {/* ชื่อ repo ตัวจริงนำ · ถ้า run มาจาก worktree (basename ต่างจากชื่อ repo) โชว์โฟลเดอร์กำกับ (issue #21) */}
        <span title={run.repoPath}>
          {displayRepoName(run)}
          {displayRepoName(run) !== repoName(run.repoPath) ? (
            <span className="text-muted-foreground/70"> · {repoName(run.repoPath)}</span>
          ) : null}
        </span>
        {/* base…head — base เปลี่ยนความหมายของ run จึงโชว์คู่กันตั้งแต่หน้าแรก (issue #17) */}
        <span
          className="font-mono"
          title={run.baseCommit ? `base ${run.baseCommit} → ${run.commit}` : run.commit}
        >
          {formatCommitRange(run.baseCommit, run.commit)}
        </span>
        {/* ลิงก์ออกนอกแอปต้องอยู่นอก <Link> — <a> ซ้อน <a> เป็น markup ที่เบราว์เซอร์แยกให้ไม่ได้ */}
        {run.pr.url ? (
          <a
            href={run.pr.url}
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2 hover:text-foreground"
          >
            เปิด PR บน GitHub
          </a>
        ) : null}
        {missing ? (
          <span
            className="rounded-full border border-amber-500 px-1.5 text-[10px] leading-4 text-amber-700 dark:text-amber-300"
            title={`ไม่พบ run.json ที่ ${run.contentDir}`}
          >
            ไฟล์หาย
          </span>
        ) : null}
      </div>
    </div>
  )
}

/**
 * สถานะของ process ที่กำลังเปิดหน้านี้อยู่ — ผู้อ่านต้องรู้ว่ามันจะปิดตัวเองเมื่อไร
 * และสั่งรันใหม่ยังไงเมื่อมันปิดไปแล้ว (user story 40, 42)
 */
function ServerFooter({ health }: { health: HealthResponse | null }) {
  if (!health) return null
  const command =
    health.root.includes(' ') ? `pnpm --dir "${health.root}" dev` : `pnpm --dir ${health.root} dev`
  return (
    <footer className="mt-12 border-t pt-4 text-xs text-muted-foreground">
      <p>
        server pid {health.pid} · registry <span className="font-mono">{health.registry}</span>
        {health.idleShutdownAt ? (
          <> · ปิดตัวเองถ้าไม่มีใครเรียกถึง {formatDateTime(health.idleShutdownAt)}</>
        ) : null}
      </p>
      <p className="mt-1">
        สั่งรันเอง: <code className="font-mono">{command}</code>
      </p>
    </footer>
  )
}
