import type { RunSection } from './types'

/**
 * ชื่อไฟล์ markdown ของ section — default คือ `<id>.md`
 *
 * ทั้ง server (ตอนอ่าน/ตรวจไฟล์) และ app (ตอนแปลง event จาก SSE เป็น "หน้าไหนต้องโหลดใหม่")
 * ต้องคิดชื่อไฟล์ตรงกัน จึงอยู่ใน shared/ ไม่ใช่ฝั่งใดฝั่งหนึ่ง
 */
export function sectionFileName(section: RunSection): string {
  return section.file ?? `${section.id}.md`
}
