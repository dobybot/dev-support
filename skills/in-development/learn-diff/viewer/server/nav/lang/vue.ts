/**
 * Vue SFC indexer — CONTRACT-f12 §2.1 (issue #36 user story 15)
 *
 * ไม่ parse Vue เอง: ดึงเฉพาะบล็อก `<script>` / `<script setup>` ออกมาแล้ว delegate ให้ indexer
 * ของ TS/JS · ตำแหน่งที่คืนออกไปเป็นเลขบรรทัด/คอลัมน์ของไฟล์ .vue จริงเสมอ (ผู้บริโภคไม่รู้เรื่อง offset)
 *
 * วิธีชดเชย offset: แทนที่จะบวก `lineOffset` ทีหลัง (ซึ่งต้องไล่แก้ทุก field ของทุก type และพลาดง่าย
 * เวลาเพิ่ม field ใหม่) เราสร้าง "masked source" ที่ยาวเท่าไฟล์เดิมเป๊ะ ๆ — อักขระนอกบล็อก script
 * ถูกแทนด้วยช่องว่าง โดยคง `\n` / `\r` ไว้ทุกตัว — ตำแหน่งที่ TS indexer คืนมาจึงตรงกับไฟล์ .vue
 * อยู่แล้วโดยไม่ต้องแปลง (รวมคอลัมน์ของบรรทัดแรกของบล็อกที่เขียนต่อท้าย `<script>` บรรทัดเดียวกัน)
 * และรองรับหลายบล็อก (`<script setup>` + `<script>`) ได้ในการ parse รอบเดียว
 */

import { indexerFor, type LanguageIndexer } from '../registry'
import type { FileIndex } from '../types'

/** ภาษาของบล็อก script ที่ delegate ให้ TS indexer ได้ — นอกเหนือจากนี้ (coffee, ฯลฯ) ข้ามทั้งบล็อก */
const SCRIPT_LANGS = new Set(['ts', 'typescript', 'tsx', 'js', 'javascript', 'jsx'])

const SCRIPT_BLOCK = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi
const LANG_ATTR = /\blang\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i

/**
 * indexer ของ TS/JS ที่เราพึ่ง — หาแบบ lazy ผ่าน registry (ไม่ import ตรง) เพื่อไม่ผูกกับชื่อ export
 * ของไฟล์ `lang/typescript.ts` และให้ vue ยังโหลดได้แม้ registry ยังไม่มี TS indexer
 */
function scriptIndexer(): LanguageIndexer | null {
  const indexer = indexerFor('__vue_script__.ts')
  return indexer && indexer.language !== 'vue' ? indexer : null
}

/** เนื้อไฟล์ที่เหลือไว้เฉพาะบล็อก script — ความยาวและตำแหน่งทุกอักขระตรงกับไฟล์เดิม */
function maskNonScript(text: string): { masked: string; hasScript: boolean } {
  // เริ่มจากไฟล์ที่ถูกลบทิ้งหมด (คง newline) แล้วค่อยแปะเนื้อ script กลับตามตำแหน่งเดิม
  const chars = new Array<string>(text.length)
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    chars[i] = ch === '\n' || ch === '\r' ? ch : ' '
  }

  let hasScript = false
  SCRIPT_BLOCK.lastIndex = 0
  for (let match = SCRIPT_BLOCK.exec(text); match; match = SCRIPT_BLOCK.exec(text)) {
    const [, attrs, body] = match
    const lang = LANG_ATTR.exec(attrs ?? '')
    const langValue = (lang?.[1] ?? lang?.[2] ?? lang?.[3] ?? '').trim().toLowerCase()
    // ไม่มี lang = TS/JS ตามค่าเริ่มต้นของ SFC
    if (langValue && !SCRIPT_LANGS.has(langValue)) continue

    // ท้าย open tag: attrs ห้ามมี '>' ตาม regex อยู่แล้ว ตัวแรกที่เจอจึงเป็นตัวปิด `<script ...>`
    const start = match.index + match[0].indexOf('>') + 1
    for (let i = 0; i < body.length; i++) chars[start + i] = body[i]
    hasScript = true
  }

  return { masked: chars.join(''), hasScript }
}

/** บล็อกที่ไม่ใช่ template — เนื้อข้างในต้องไม่ถูกสแกนซ้ำในรอบ template */
const NON_TEMPLATE_BLOCK = /<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi
const MUSTACHE = /\{\{([\s\S]*?)\}\}/g
/** binding ของ template: `@click="…"`, `:prop="…"`, `v-if="…"` (รวมรูปย่อ `#slot`) */
const DYNAMIC_ATTR = /(?:@|:|#|v-)[A-Za-z0-9_:.\-[\]]*\s*=\s*("[^"]*"|'[^']*')/g

/**
 * เนื้อไฟล์ที่เหลือไว้เฉพาะ *expression* ของ template — ความยาว/ตำแหน่งตรงกับไฟล์เดิมเหมือน mask ของ script
 *
 * ใน Vue 3 `<script setup>` ผู้เรียกหลักของฟังก์ชันคือ template — ถ้าไม่นับ occurrence ฝั่งนี้เลย
 * Shift+F12 จะตอบ "1 reference (ตัวมันเอง)" แล้วคนอ่านสรุปว่าเป็น dead code ทั้งที่ปุ่มบนหน้าจอเรียกอยู่
 * (issue #36: false negative อันตรายกว่า noise) · สแกนแยกรอบจาก script เพื่อให้ expression ที่ parse
 * ไม่ผ่าน (เช่น `v-for="a in b"` ที่ไม่ใช่ statement เดี่ยว) ไม่ไปกระทบ definition ของบล็อก script
 */
function maskTemplateExpressions(text: string): { masked: string; hasExpression: boolean } {
  const chars = new Array<string>(text.length)
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    chars[i] = ch === '\n' || ch === '\r' ? ch : ' '
  }

  const skip: [number, number][] = []
  NON_TEMPLATE_BLOCK.lastIndex = 0
  for (let m = NON_TEMPLATE_BLOCK.exec(text); m; m = NON_TEMPLATE_BLOCK.exec(text)) {
    skip.push([m.index, m.index + m[0].length])
  }
  const inSkipped = (at: number): boolean => skip.some(([from, to]) => at >= from && at < to)

  let hasExpression = false
  const unmask = (start: number, body: string): void => {
    for (let i = 0; i < body.length; i++) chars[start + i] = body[i]
    if (body.trim() !== '') hasExpression = true
  }

  MUSTACHE.lastIndex = 0
  for (let m = MUSTACHE.exec(text); m; m = MUSTACHE.exec(text)) {
    if (inSkipped(m.index)) continue
    unmask(m.index + 2, m[1] ?? '')
  }

  DYNAMIC_ATTR.lastIndex = 0
  for (let m = DYNAMIC_ATTR.exec(text); m; m = DYNAMIC_ATTR.exec(text)) {
    if (inSkipped(m.index)) continue
    const quoted = m[1] ?? ''
    // +1 ข้ามอัญประกาศเปิด — เก็บเฉพาะเนื้อ expression ข้างใน
    unmask(m.index + m[0].lastIndexOf(quoted) + 1, quoted.slice(1, -1))
  }

  return { masked: chars.join(''), hasExpression }
}

/**
 * occurrence ที่ template เรียกใช้ — ไม่เอา definition/import ของรอบนี้ (template ประกาศอะไรไม่ได้
 * และ expression ที่ parse เพี้ยนอาจให้ def ปลอม) เอาเฉพาะ identifier ซึ่งเป็นสิ่งที่ references ต้องการ
 */
function templateIdentifiers(indexer: LanguageIndexer, path: string, text: string): FileIndex['identifiers'] {
  const { masked, hasExpression } = maskTemplateExpressions(text)
  if (!hasExpression) return []
  try {
    return indexer.indexFile(path, masked).identifiers
  } catch {
    // template ที่ parse ไม่ผ่านไม่ควรทำให้ทั้งไฟล์หลุดจาก index — ยอมเสีย occurrence ฝั่ง template
    return []
  }
}

function emptyIndex(path: string): FileIndex {
  return { path, language: 'vue', definitions: [], identifiers: [], imports: [] }
}

/** ผู้บริโภคคาดหวัง identifier เรียงตามตำแหน่งในไฟล์ — script กับ template มาคนละรอบจึงต้องรวมแล้วเรียงใหม่ */
function sortByPosition(identifiers: FileIndex['identifiers']): FileIndex['identifiers'] {
  return [...identifiers].sort((a, b) => a.line - b.line || a.col - b.col)
}

export const vueIndexer: LanguageIndexer = {
  language: 'vue',
  extensions: ['.vue'],

  async init() {
    // TS indexer อาจยังไม่ลงทะเบียน (เช่นตอน test เฉพาะบางภาษา) — ปล่อยผ่าน แล้วไปพังตอน indexFile
    await scriptIndexer()?.init()
  },

  indexFile(path, text) {
    const indexer = scriptIndexer()
    if (!indexer) throw new Error('vue indexer ต้องมี typescript indexer ใน LANGUAGE_INDEXERS')

    const { masked, hasScript } = maskNonScript(text)
    const fromTemplate = templateIdentifiers(indexer, path, text)
    // SFC ที่มีแต่ <template>/<style> ไม่ต้อง parse บล็อก script — แต่ occurrence ฝั่ง template ยังนับ
    if (!hasScript) return { ...emptyIndex(path), identifiers: sortByPosition(fromTemplate) }

    const index = indexer.indexFile(path, masked)
    // ผลลัพธ์ต้องรายงานตัวเองเป็น .vue ไม่ใช่ภาษาของบล็อกข้างใน (response.language ตาม §1)
    return {
      ...index,
      path,
      language: 'vue',
      identifiers: sortByPosition([...index.identifiers, ...fromTemplate]),
    }
  },

  symbolAt(text, line, col) {
    const indexer = scriptIndexer()
    if (!indexer) return null

    const { masked, hasScript } = maskNonScript(text)
    const inScript = hasScript ? indexer.symbolAt(masked, line, col) : null
    if (inScript !== null) return inScript

    // cursor อยู่ใน template — F12/Shift+F12 จากปุ่มที่ผูก handler ไว้ต้องใช้ได้เหมือนกัน
    const template = maskTemplateExpressions(text)
    return template.hasExpression ? indexer.symbolAt(template.masked, line, col) : null
  },
}
