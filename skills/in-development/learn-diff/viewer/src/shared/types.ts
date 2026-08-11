/**
 * Content contract ของ learn-diff v3 — shared ระหว่าง server (อ่าน/validate) กับ app (render)
 *
 * ต่อ 1 run agent เขียนลง `<repo>/.learn-diff/<slug>/`:
 *   run.json      — structured data ทั้งหมด (ไฟล์นี้)
 *   index.md      — หน้า PM altitude
 *   NN-<slug>.md  — section page
 *   99-verify.md  — คำถาม + verification checklist
 *
 * รายละเอียด format + directive ที่ใช้ได้: ../../references/content-format.md
 */

import type { CodeLanguage } from './languages'

/** ระดับความลึกที่ผู้อ่านต้องลงกับส่วนนั้น (DEVELOPMENT.md → Core principles ข้อ 2) */
export type BoxLevel = 'blackbox' | 'greybox' | 'whitebox'

/** `index` = หน้าแรก, `verify` = หน้าคำถาม/checklist, ที่เหลือเป็น section ปกติ */
export type SectionKind = 'index' | 'section' | 'verify'

export interface RunSection {
  /** ใช้เป็นทั้ง URL segment และชื่อไฟล์ (ไม่มีนามสกุล) — [a-z0-9-] เท่านั้น */
  id: string
  title: string
  /** ชื่อไฟล์ markdown ใน content dir; default = `${id}.md` */
  file?: string
  kind?: SectionKind
  box?: BoxLevel
  /** บรรทัดสรุปใต้หัวข้อ (markdown inline) */
  subtitle?: string
  /** id ของ reading list ที่เป็น "ทางเข้าโค้ด" ของ section นี้ */
  readingList?: string
}

export interface BoxMapRow {
  id: string
  title: string
  /**
   * ไฟล์หลักที่เกี่ยวข้อง — โชว์ใต้ชื่อแถว · string = ข้อความพร้อมแสดง (basename คั่นด้วย ' · ')
   * หรือเป็น array ของ basename ให้ viewer join ให้เอง (issue #33)
   */
  files?: string | string[]
  box: BoxLevel
  /** เหตุผลของการจัดกล่อง (markdown inline) — blackbox สั้น ๆ อธิบายจบในแถวได้เลย */
  reason: string
  /** section id ที่แถวนี้ลิงก์ไป (blackbox ที่ไม่มีหน้าแยกจะไม่มีค่านี้) */
  section?: string
  readingList?: string
}

/** ขอ+ทำ / ขอ+ไม่ได้ทำ / ไม่ได้ขอ+ทำ — ตามหลัก intent reconciliation ของ skill */
export type ReconStatus = 'done' | 'missing' | 'unrequested'

export interface ReconRow {
  status: ReconStatus
  /** อ้างอิงสเปก/ตั๋ว เช่น "D3, US26" (ว่างได้สำหรับหมวด unrequested) */
  ref?: string
  /** สิ่งที่ขอ / สิ่งที่ขาด / สิ่งที่ทำเกิน (markdown inline) */
  what: string
  /** ยืนยันที่ / สถานะจริง / ความเสี่ยง (markdown inline) */
  note?: string
}

export interface ReadingSpan {
  path: string
  /** บรรทัดเริ่ม–จบ (1-based, inclusive) ที่ commit ที่ pin ไว้ */
  from: number
  to: number
  kind: 'changed' | 'context'
  /** "อ่านอันนี้ทำไม" หนึ่งบรรทัด */
  why: string
}

export interface ReadingList {
  id: string
  title: string
  spans: ReadingSpan[]
}

export interface RunPr {
  number: number
  title: string
  url?: string
}

export interface RunData {
  schemaVersion: 1
  id: string
  title: string
  /** บรรทัดสถิติใต้ชื่อ run (markdown inline) */
  subtitle?: string
  pr: RunPr
  /** commit ที่ pin ไว้ = head ของ PR */
  commit: string
  /**
   * commit ฐานของ PR (merge-base ของ base branch กับ head) — ไม่มีก็ยังอ่าน run ได้
   * แต่จะเทียบ diff ไม่ได้: ตัวแสดงโค้ดจะไม่ลงสีบรรทัดที่เปลี่ยน และสลับ side-by-side ไม่ได้
   */
  baseCommit?: string
  /** ISO 8601 */
  generatedAt: string
  sections: RunSection[]
  boxMap?: BoxMapRow[]
  reconciliation?: ReconRow[]
  readingLists?: ReadingList[]
  /** node id ใน mermaid → reading list id */
  nodeMap?: Record<string, string>
}

/** หนึ่งบรรทัดใน registry (`$LEARN_DIFF_HOME/runs.json`) */
export interface RegistryEntry {
  id: string
  /** root ของ repo ที่ PR นี้อยู่ — file API (#7) resolve path เทียบกับตัวนี้ */
  repoPath: string
  /**
   * ชื่อ repo ตัวจริง (โฟลเดอร์ของ git common dir) — worktree ทำให้ basename(repoPath)
   * เป็นชื่อ branch ไม่ใช่ชื่อ repo (issue #21) · register-run.mjs เติมให้ตอนลงทะเบียน ·
   * entry เก่าไม่มี field นี้ — ผู้อ่านทุกฝั่งต้อง fallback ไป basename(repoPath)
   */
  repoName?: string
  /** โฟลเดอร์ที่มี run.json (absolute หรือ relative กับ repoPath) */
  contentDir: string
  commit: string
  /** commit ฐานของ PR — register-run.mjs คัดลอกมาจาก run.json ให้ (ดู RunData.baseCommit) */
  baseCommit?: string
  pr: RunPr
  title: string
  /** ISO 8601 */
  createdAt: string
}

/** run ที่ผ่านการ resolve path แล้ว — ค่าที่ API ส่งออก */
export interface RunSummary extends Omit<RegistryEntry, 'contentDir'> {
  contentDir: string
  /**
   * ยังมี run.json อยู่ที่ contentDir ไหม — เติมค่าโดย `/api/runs` เท่านั้น
   * (worktree ที่ถูกลบทิ้งทำให้ registry ค้าง — หน้ารายการต้องบอกก่อนกด ไม่ใช่ให้ไปเจอ error)
   */
  available?: boolean
}

export interface ContentWarning {
  code: string
  message: string
  where?: string
}

export interface RunResponse {
  run: RunSummary
  data: RunData
  /** section id ที่มีไฟล์อยู่จริงแล้ว — ที่เหลือคือ pending (ticket #5 ใช้ต่อ) */
  written: string[]
  warnings: ContentWarning[]
}

export interface PageResponse {
  runId: string
  sectionId: string
  markdown: string
}

/**
 * ผลของ file API (`/api/runs/<id>/file?path=…&from=…&to=…`)
 *
 * เนื้อโค้ดไม่เคยถูกฝังใน content ที่ agent เขียน — server อ่านจาก commit ที่ pin ไว้
 * ด้วย `git show <commit>:<path>` ทุกครั้งที่ขอ เลขบรรทัดจึงตรงกับ PR เสมอ
 */
export interface FileResponse {
  runId: string
  /** commit ที่อ่านมา (= run.commit) */
  commit: string
  /** path เทียบกับ root ของ repo หลัง normalize แล้ว (posix separator) */
  path: string
  /** ช่วงบรรทัดที่ส่งกลับ (1-based, inclusive) */
  from: number
  to: number
  /** จำนวนบรรทัดทั้งไฟล์ที่ commit นี้ — ใช้ตรวจว่าช่วงที่อ้างยัง valid ไหม */
  totalLines: number
  /** ขนาดไฟล์ทั้งไฟล์ (bytes) ที่ commit นี้ */
  bytes: number
  /** ภาษาไว้ทำ syntax highlighting (ดู shared/languages.ts) — null = plain text */
  language: CodeLanguage | null
  /** บรรทัด from..to ต่อกันด้วย `\n` — ไม่มี newline ปิดท้าย */
  text: string
}

export interface RunsResponse {
  runs: RunSummary[]
}

/**
 * ผลของ diff API (`/api/runs/<id>/diff?path=…`) — hunk ทั้งไฟล์ ระหว่าง baseCommit กับ commit
 *
 * ทำไมต้องส่ง hunk แทนที่จะส่ง diff ที่ render มาแล้ว: ฝั่งแอปมีเนื้อไฟล์ฝั่งใหม่อยู่แล้ว
 * (จาก file API) จึงประกอบได้ทั้งแบบ unified และ side-by-side จากชุดเดียวกัน โดยไม่ต้องขน
 * เนื้อไฟล์ฝั่งเก่ามาทั้งไฟล์ — บรรทัดฝั่งเก่าที่ต้องใช้จริงมีแค่บรรทัดที่ถูกลบ/ถูกแทน
 */
export type DiffStatus = 'added' | 'removed' | 'modified' | 'unchanged' | 'binary' | 'unavailable'

export interface DiffHunk {
  /** บรรทัดแรกฝั่ง base ของ hunk นี้ (1-based) — hunk ที่เป็นการเพิ่มล้วนชี้บรรทัดถัดจากจุดแทรก */
  oldStart: number
  /** บรรทัดฝั่ง base ที่หายไป (ข้อความจริง — ฝั่งแอปไม่มีไฟล์เก่า) */
  oldLines: string[]
  /** บรรทัดแรกฝั่ง head ของ hunk นี้ (1-based) — hunk ที่เป็นการลบล้วนชี้บรรทัดถัดจากจุดที่ลบ */
  newStart: number
  /** จำนวนบรรทัดฝั่ง head ที่เพิ่ม/ถูกแทน (ข้อความอ่านจาก file API ได้ จึงส่งแค่จำนวน) */
  newCount: number
}

export interface FileDiffResponse {
  runId: string
  /** path เทียบ root ของ repo (posix) */
  path: string
  /** head = commit ที่ run pin ไว้ */
  commit: string
  /** null = ไม่รู้ base (run.json ไม่มี baseCommit) */
  baseCommit: string | null
  status: DiffStatus
  hunks: DiffHunk[]
  addedLines: number
  removedLines: number
  /** เหตุผลภาษาไทยเมื่อ status = 'unavailable' — โชว์ให้ผู้อ่านรู้ว่าต้องแก้อะไร */
  reason?: string
}

/**
 * ผลของ coverage-base API (`/api/runs/<id>/coverage-base`) — ช่วงบรรทัดที่เปลี่ยนต่อไฟล์
 * ของทั้ง PR (base → commit ที่ pin ไว้) คิดจาก commit range เดียวกับ diff API
 *
 * ฝั่งแอปเอาไป intersect กับ span ของ reading list เพื่อวัด coverage — วัดกับ `git diff`
 * ไม่ใช่กับ reading list (SPEC-reading-checklist → Coverage computation) · บรรทัดที่ถูกลบล้วน
 * ไม่นับ (Out of Scope: coverage วัดเฉพาะบรรทัดที่มีอยู่ที่ commit ที่ pin ไว้)
 */
export interface CoverageRange {
  /** 1-based, inclusive — เลขบรรทัดฝั่ง head */
  from: number
  to: number
}

export interface CoverageBaseFile {
  /** path เทียบ root ของ repo (posix) */
  path: string
  ranges: CoverageRange[]
}

export interface CoverageBaseResponse {
  runId: string
  commit: string
  /** null = เทียบไม่ได้ (ไม่มี baseCommit / base ยังไม่ fetch) — ดู reason */
  baseCommit: string | null
  files: CoverageBaseFile[]
  /** เหตุผลภาษาไทยเมื่อเทียบไม่ได้ — files ว่างพร้อมกันเสมอ */
  reason?: string
}

/**
 * SSE ที่ `/api/runs/<id>/events` — agent เขียนไฟล์ระหว่างที่ผู้อ่านเปิดหน้าอยู่
 * event แรกคือ `ready` (บอกว่าเฝ้าโฟลเดอร์ไหนอยู่) จากนั้นเป็น `change` ทุกครั้งที่ไฟล์เปลี่ยน
 */
export interface RunReadyEvent {
  runId: string
  contentDir: string
  /** ISO 8601 */
  at: string
}

export interface RunChangeEvent {
  runId: string
  /** ชื่อไฟล์ใน content dir ที่ถูกเพิ่ม/แก้/ลบ นับจาก event ที่แล้ว */
  files: string[]
  /** run.json เปลี่ยนไหม — ถ้าเปลี่ยน section list/metadata อาจเปลี่ยนตาม */
  runFileChanged: boolean
  /** ISO 8601 */
  at: string
}

/**
 * `/api/health` — ใช้ตอบคำถามเดียวว่า "มี server ของ learn-diff รันอยู่แล้วหรือยัง"
 * `scripts/serve.mjs` ยิงตัวนี้ก่อนเสมอ เจอแล้วใช้ต่อ ไม่เจอค่อยสั่งรันใหม่ (SPEC-v3 user story 41)
 */
export interface HealthResponse {
  ok: true
  service: 'learn-diff-viewer'
  schemaVersion: 1
  registry: string
  /**
   * LEARN_DIFF_HOME ที่ resolve แล้วของ process นี้ — `serve.mjs --stop` ใช้เทียบว่า
   * ตัวที่กำลังจะปิดเป็น instance ของ home เดียวกันจริง ไม่ใช่ instance อื่นบนพอร์ต default
   */
  home: string
  pid: number
  /** โฟลเดอร์ viewer ที่ process นี้รันอยู่ — ใช้ประกอบคำสั่ง "สั่งรันเอง" ให้ผู้อ่าน */
  root: string
  /** ISO 8601 — เวลาที่ process เริ่ม */
  startedAt: string
  uptimeMs: number
  /** จำนวน run ใน registry (null = อ่าน registry ไม่ได้ — health ต้องไม่ล้มเพราะเรื่องนี้) */
  runs: number | null
  /** ms ที่ปล่อยให้ว่างได้ก่อนปิดตัวเอง (null = ไม่ได้ตั้งเวลาไว้, 0 = ปิดการนับถอยหลัง) */
  idleTimeoutMs: number | null
  /** ISO 8601 — จะปิดตัวเองเมื่อไรถ้าไม่มี request เพิ่ม (null = ไม่ได้นับถอยหลัง) */
  idleShutdownAt: string | null
}

export interface ApiErrorBody {
  error: { code: string; message: string }
}
