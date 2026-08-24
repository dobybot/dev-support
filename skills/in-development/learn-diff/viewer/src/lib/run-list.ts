import type { RunSummary } from '@/shared/types'

/**
 * ตรรกะล้วนของหน้าแรก (วันที่, ชื่อ repo, การค้นหา) — แยกออกจาก React เพื่อให้เทสต์ได้จริง
 * (SPEC-v3 → Testing Decisions ห้ามเทสต์ระดับ component)
 */

/** ชื่อโฟลเดอร์ของ repo — path เต็มยาวเกินกว่าจะกวาดตาได้ในรายการยาว ๆ */
export function repoName(repoPath: string): string {
  const parts = repoPath.split(/[\\/]+/).filter((s) => s !== '')
  return parts[parts.length - 1] ?? repoPath
}

/**
 * ชื่อ repo ที่ควรแสดง — worktree ทำให้ basename เป็นชื่อ branch ไม่ใช่ชื่อ repo (issue #21)
 * registry รุ่นใหม่มี `repoName` (ชื่อ repo ตัวจริงจาก git) ให้ใช้ก่อน · entry เก่า fallback
 * ไป basename แบบเดิม
 */
export function displayRepoName(run: Pick<RunSummary, 'repoPath' | 'repoName'>): string {
  return run.repoName ?? repoName(run.repoPath)
}

/** commit สั้นแบบเดียวกับที่ git แสดง — ผู้อ่านต้องเทียบกับ `git log` ได้ด้วยตา */
export function shortCommit(commit: string): string {
  return commit.slice(0, 9)
}

/**
 * ช่วง `base…head` แบบสั้น — base เปลี่ยนความหมายของทั้ง run (merge-base ขยับตาม base branch)
 * จึงต้องเห็นคู่กับ head เสมอ · run เก่าที่ไม่มี baseCommit ยังแสดงได้: เหลือ head ตัวเดียว
 */
export function formatCommitRange(base: string | undefined, head: string): string {
  return base ? `${shortCommit(base)}…${shortCommit(head)}` : shortCommit(head)
}

const DATE_FMT = new Intl.DateTimeFormat('th-TH-u-ca-gregory', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

/**
 * วันที่ของ run — ปฏิทินเกรกอเรียนโดยตั้งใจ (default ของ th-TH เป็น พ.ศ. ซึ่งชนกับปีใน
 * PR/commit ที่ทุกอย่างรอบตัวใช้ ค.ศ.) · ของใหม่ในสัปดาห์นี้บอกเป็น "กี่วันก่อน" แทน
 */
export function formatRunDate(iso: string | undefined, now: Date = new Date()): string {
  if (!iso) return '—'
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return '—'
  const days = Math.floor((startOfDay(now) - startOfDay(at)) / 86_400_000)
  if (days === 0) return 'วันนี้'
  if (days === 1) return 'เมื่อวาน'
  if (days > 1 && days < 7) return `${days} วันก่อน`
  return DATE_FMT.format(at)
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

const DATETIME_FMT = new Intl.DateTimeFormat('th-TH-u-ca-gregory', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

/** วัน+เวลา (ปฏิทินเดียวกับ formatRunDate) — ใช้กับเวลาที่ server จะปิดตัวเอง */
export function formatDateTime(iso: string | undefined): string {
  if (!iso) return '—'
  const at = new Date(iso)
  return Number.isNaN(at.getTime()) ? '—' : DATETIME_FMT.format(at)
}

/** ค้นด้วยคำเดียวข้ามทุกช่องที่ผู้อ่านน่าจะจำได้: เลข PR, ชื่อเรื่อง, ชื่อ repo, sha */
export function matchesQuery(run: RunSummary, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (q === '') return true
  const haystack = [
    run.title,
    run.pr?.title,
    `#${run.pr?.number}`,
    String(run.pr?.number ?? ''),
    run.id,
    run.repoPath,
    // ทั้งชื่อ repo ตัวจริงและชื่อโฟลเดอร์ worktree — ผู้อ่านอาจจำได้อันใดอันหนึ่ง
    run.repoName,
    repoName(run.repoPath),
    run.commit,
  ]
    .filter((s): s is string => typeof s === 'string' && s !== '')
    .join(' ')
    .toLowerCase()
  return q.split(/\s+/).every((term) => haystack.includes(term))
}

export function filterRuns(runs: RunSummary[], query: string): RunSummary[] {
  return runs.filter((run) => matchesQuery(run, query))
}
