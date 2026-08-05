/**
 * ช่วงบรรทัดที่เขียนไว้ในเนื้อความ (`:file[...]{lines="61-79"}`)
 *
 * เดิมไฟล์นี้เคยสร้าง URL ไปหน้าโค้ดชั่วคราว `/r/<run>/_file` ของตั๋ว #7 ·
 * ตั๋ว #8 ย้ายโค้ดเข้ามาอยู่ใน panel ข้างเนื้อหาแล้ว การเปิดโค้ดจึงไม่ใช่การเปลี่ยนหน้าอีกต่อไป
 * (ดู `openTarget()` ใน components/run/panel-context.ts)
 */
export interface LineRange {
  from: number | null
  to: number | null
}

/** `"61-79"` / `"61"` / undefined → ช่วงบรรทัด (ค่าที่อ่านไม่ออกถือว่าไม่ได้ระบุ) */
export function parseLineRange(lines: string | undefined | null): LineRange {
  if (!lines) return { from: null, to: null }
  const match = /^\s*(\d+)\s*(?:[-–]\s*(\d+))?\s*$/.exec(lines)
  if (!match) return { from: null, to: null }
  const from = Number(match[1])
  const to = match[2] ? Number(match[2]) : from
  return { from, to }
}
