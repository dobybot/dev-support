/**
 * ตัด `# <title>` บรรทัดแรกทิ้ง ถ้ามันซ้ำกับ `sections[].title` ที่หน้า section แสดงเป็น
 * หัวข้ออยู่แล้ว (issue #19) — content-format ห้ามเปิดไฟล์ด้วย h1 ซ้ำ แต่ agent เผลอเขียนได้ง่าย
 * viewer จึงกลืนให้แทนที่จะแสดงชื่อเดิมสองครั้งซ้อนกัน · h1 ที่ข้อความไม่ตรง title ไม่ถูกแตะ
 */
export function stripDuplicateH1(markdown: string, title: string): string {
  const lines = markdown.split('\n')
  let i = 0
  while (i < lines.length && lines[i].trim() === '') i++
  const match = i < lines.length ? /^#\s+(.+?)\s*$/.exec(lines[i]) : null
  if (!match || normalize(match[1]) !== normalize(title)) return markdown
  return lines.slice(i + 1).join('\n')
}

/** เทียบแบบไม่สนช่องว่างซ้ำ/หัวท้าย — กันเคส agent เว้นวรรคไม่เป๊ะ แต่ไม่หลวมไปกว่านั้น */
function normalize(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}
