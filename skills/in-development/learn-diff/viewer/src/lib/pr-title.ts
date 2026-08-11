/**
 * ชื่อ run ที่ viewer เอาไปแสดง — heading, topbar และ document.title ใช้ที่นี่ที่เดียว (issue #42)
 *
 * viewer ประกอบ `PR #N — ` ให้เองเสมอ แต่ run.json ที่ agent generate มาบางไฟล์ใส่ prefix
 * มาแล้ว ทำให้ได้ "PR #280 — PR #280 — …" · แก้ฝั่งอ่านเพื่อให้ run เก่าที่มีอยู่แสดงถูกทันที
 * โดยไม่ต้อง regenerate (user story 6) — ฝั่งเขียนกำชับไว้ใน SKILL.md อีกชั้น
 */

/** ชื่อ app ที่ใช้เป็น document.title ตอนไม่ได้อยู่ในหน้า run — ต้องตรงกับ <title> ใน index.html */
export const APP_TITLE = 'learn-diff viewer'

/**
 * `PR #<n>` + separator หัวข้อความ · separator รับ em/en dash, hyphen และ colon
 * (เว้นวรรครอบ separator มีหรือไม่มีก็ได้ — agent เขียนไม่เหมือนกันทุกครั้ง)
 * ไม่มี separator = ไม่ใช่ prefix ของหัวข้อ (เช่น title ที่ชื่อว่า "PR #280" เฉย ๆ) จึงไม่แตะ
 */
const PR_PREFIX = /^\s*PR\s*#(\d+)\s*[—–\-:]\s*/i

/**
 * ตัด prefix "PR #<n> —" ออกจาก title **เมื่อเลขตรงกับ pr.number เท่านั้น** — เลขไม่ตรงคือ
 * ข้อมูลคนละตัว (อ้าง PR อื่นในชื่อเรื่อง) ตัดทิ้งเท่ากับกลืนข้อมูลของผู้เขียน · prefix ซ้อนกัน
 * หลายชั้นตัดจนหมด แต่พอเจอชั้นที่เลขไม่ตรงก็หยุดทันที
 */
export function stripPrPrefix(title: string, prNumber: number): string {
  let result = title
  for (;;) {
    const match = PR_PREFIX.exec(result)
    if (!match || Number(match[1]) !== prNumber) return result
    const next = result.slice(match[0].length)
    // ตัดแล้วไม่เหลืออะไร = prefix คือทั้งหมดที่มี — คืนของเดิมดีกว่าโชว์หัวข้อว่าง
    if (next.trim() === '') return result
    result = next
  }
}

/** หัวเรื่องของ run ที่ประกอบครั้งเดียว — ใช้ทั้ง heading ใหญ่และ topbar */
export function runHeading(prNumber: number, title: string): string {
  return `PR #${prNumber} — ${stripPrPrefix(title, prNumber)}`
}

/** ชื่อแท็บ browser ของหน้า run (issue #41) — แยก run ออกจากกันตอนเปิดหลายแท็บ */
export function runDocumentTitle(prNumber: number, title: string): string {
  return `${runHeading(prNumber, title)} · ${APP_TITLE}`
}
