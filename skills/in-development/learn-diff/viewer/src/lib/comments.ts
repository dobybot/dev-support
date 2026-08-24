import type { CommentCreatedResponse, CommentsResponse, PrComment } from '@/shared/types'

/**
 * การจับคู่ comment ของ PR เข้ากับบรรทัดในกล่องโค้ด — ฟังก์ชันล้วน แยกจาก React (issue #49)
 *
 * จุดนี้ผิดแล้วเงียบที่สุดในฟีเจอร์ทั้งอัน: badge ขึ้นผิดบรรทัด/ผิดไฟล์ ผู้อ่านจะไม่มีทางรู้เลย
 * ว่ามีคนทักไว้แล้ว แล้วก็ทักซ้ำ (user story 5) — จึงแยกออกมาเป็นฟังก์ชันที่เทสต์ได้ตรง ๆ
 */

export type LineComments = ReadonlyMap<string, ReadonlyMap<number, PrComment[]>>

/** ไม่มี comment ในไฟล์นั้น — object เดียวใช้ร่วมกัน (identity คงที่ = ไม่สั่ง CodeMirror อัปเดตเปล่า) */
export const NO_COUNTS: Readonly<Record<number, number>> = Object.freeze({})

/**
 * review comment → path → บรรทัด → รายการ comment (เรียงตามเวลาสร้าง)
 *
 * comment ที่ไม่มี path/line (GitHub ตอบ null เมื่อ comment หลุดจาก diff จนตำแหน่งหาย)
 * ถูกทิ้งจาก map นี้ **โดยตั้งใจ**: การเดาบรรทัดให้มันเท่ากับปักหมุดผิดที่ ซึ่งแย่กว่าไม่ปัก
 * (ตัว comment ยังเห็นได้ในหน้า PR บน GitHub — และเรามีลิงก์ไปที่นั่นเสมอ)
 */
export function groupByLine(comments: readonly PrComment[]): LineComments {
  const byPath = new Map<string, Map<number, PrComment[]>>()
  for (const comment of comments) {
    if (comment.path === null || comment.line === null) continue
    const lines = byPath.get(comment.path) ?? new Map<number, PrComment[]>()
    const list = lines.get(comment.line) ?? []
    list.push(comment)
    lines.set(comment.line, list)
    byPath.set(comment.path, lines)
  }
  for (const lines of byPath.values()) {
    for (const list of lines.values()) list.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }
  return byPath
}

/** จำนวน comment ต่อบรรทัดของไฟล์เดียว — รูปแบบที่แถบ gutter ใช้ตรง ๆ */
export function countsByPath(grouped: LineComments): ReadonlyMap<string, Readonly<Record<number, number>>> {
  const result = new Map<string, Record<number, number>>()
  for (const [path, lines] of grouped) {
    const counts: Record<number, number> = {}
    for (const [line, list] of lines) counts[line] = list.length
    result.set(path, counts)
  }
  return result
}

/** comment ระดับ PR เรียงเก่า→ใหม่ (บทสนทนาอ่านจากบนลงล่างเหมือนในหน้า PR) */
export function sortIssueComments(comments: readonly PrComment[]): PrComment[] {
  return [...comments].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

/** ผู้อ่านเป็นเจ้าของ comment นี้ไหม — ใช้ตัดสินว่าจะโชว์ปุ่มแก้/ลบ (สิทธิ์จริง GitHub ตัดสิน) */
export function isOwn(comment: PrComment, viewer: string | null): boolean {
  return viewer !== null && comment.author !== '' && comment.author === viewer
}

/** แทนที่ comment เดิมด้วยตัวที่เพิ่งแก้ / เติมตัวใหม่ต่อท้าย — ไม่ต้อง refetch ทั้งชุด */
export function upsertComment(state: CommentsResponse, comment: PrComment): CommentsResponse {
  const key = comment.kind === 'review' ? 'review' : 'issue'
  const list = state[key]
  const index = list.findIndex((item) => item.id === comment.id)
  const next = index === -1 ? [...list, comment] : list.map((item) => (item.id === comment.id ? comment : item))
  return { ...state, [key]: next }
}

/**
 * ข้อความบอกผลของการส่ง comment ที่ผูกบรรทัด — "ส่งแล้ว" ที่ไม่บอกปลายทางคือความคลุมเครือ
 * (user story 11) และเหตุผลที่ *ผิด* แย่กว่านั้น: บรรทัดที่ server เทียบ diff ไม่ได้ต้องไม่ถูก
 * ประกาศว่า "ไม่อยู่ใน diff" เพราะไม่มีใครรู้ — เหตุผลจริงมาจาก server พร้อมวิธีแก้อยู่แล้ว
 */
export function commentResultMessage(res: CommentCreatedResponse, path: string, line: number): string {
  if (!res.fellBackToIssue) return `ส่ง review comment ที่ ${path}:${line} ขึ้น PR แล้ว`
  if (res.fallback?.kind === 'diff-unavailable') {
    const why = res.fallback.reason ? ` (${res.fallback.reason})` : ''
    return `เทียบ diff ของ PR ไม่ได้${why} — ส่งเป็น comment ระดับ PR พร้อมลิงก์มาที่ ${path}:${line} ให้แล้ว`
  }
  return `บรรทัด ${line} ไม่อยู่ใน diff ของ PR — ส่งเป็น comment ระดับ PR พร้อมลิงก์ให้แล้ว`
}

export function removeCommentFrom(state: CommentsResponse, kind: PrComment['kind'], id: number): CommentsResponse {
  const key = kind === 'review' ? 'review' : 'issue'
  return { ...state, [key]: state[key].filter((item) => item.id !== id) }
}
