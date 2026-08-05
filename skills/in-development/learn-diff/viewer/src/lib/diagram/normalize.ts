/**
 * เตรียม source ก่อนส่งให้ engine — แทรก classDef ของ class มาตรฐานที่ยังไม่ถูกประกาศ
 * ไฟล์นี้ไม่ import mermaid และไม่แตะ DOM (เทสต์ได้ใน environment node)
 */

import { BUILTIN_CLASSES } from './subset'
import { builtinClassDefs } from './theme'

/** ชื่อ class ที่ source ประกาศ classDef ไว้เอง */
function declaredClasses(lines: string[]): Set<string> {
  const names = new Set<string>()
  for (const raw of lines) {
    const match = /^classDef\s+([A-Za-z_][A-Za-z0-9_,-]*)\s+/.exec(raw.trim())
    if (!match) continue
    for (const name of match[1].split(',')) names.add(name.trim())
  }
  return names
}

/** ตำแหน่งบรรทัดแรกที่ไม่ใช่ comment/บรรทัดว่าง = บรรทัด `flowchart …` */
function headerIndex(lines: string[]): number {
  return lines.findIndex((raw) => {
    const line = raw.trim()
    return line !== '' && !line.startsWith('%%')
  })
}

/**
 * คืน source ที่พร้อมวาด · ถ้าไม่มีบรรทัด header (source พัง) จะคืนของเดิมไปตรง ๆ
 * ให้ engine เป็นคนบ่น แทนที่จะไปแก้อะไรบนของที่อ่านไม่ออกอยู่แล้ว
 */
export function normalizeDiagramSource(source: string, options: { dark: boolean }): string {
  const lines = source.replace(/\r\n/g, '\n').split('\n')
  const header = headerIndex(lines)
  if (header < 0) return source

  const declared = declaredClasses(lines)
  const defs = builtinClassDefs(options.dark)
  const inject = BUILTIN_CLASSES.filter((name) => !declared.has(name)).map(
    (name) => `  classDef ${name} ${defs[name]}`,
  )
  if (inject.length === 0) return lines.join('\n')

  return [...lines.slice(0, header + 1), ...inject, ...lines.slice(header + 1)].join('\n')
}
