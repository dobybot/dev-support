import path from 'node:path'

import { pythonIndexer } from './lang/python'
import { typescriptIndexer } from './lang/typescript'
import { vueIndexer } from './lang/vue'
import type { FileIndex, SymbolHit } from './types'

/**
 * สัญญาที่ indexer ของแต่ละภาษาต้องทำตาม — เพิ่มภาษาใหม่ = เขียนไฟล์เดียวใน `lang/`
 * แล้วต่อท้าย `LANGUAGE_INDEXERS` โดยไม่แตะแกนกลาง (issue #36 user story 23)
 */
export interface LanguageIndexer {
  /** id ภาษา — โผล่ใน response.language */
  readonly language: string
  /** นามสกุลที่รับ (lowercase รวมจุด) เช่น ['.ts', '.tsx', '.js'] */
  readonly extensions: readonly string[]
  /** โหลด grammar wasm (lazy, ครั้งเดียวต่อ process) — เรียกซ้ำได้ */
  init(): Promise<void>
  /**
   * parse เนื้อไฟล์หนึ่งไฟล์ (blob ณ pinned commit) → ข้อมูลต่อไฟล์
   * ต้อง pure ต่อ input — ห้ามแตะ filesystem/working tree (index ทำงานบน commit ที่ pin ไว้เท่านั้น)
   * throw ได้ถ้าไฟล์ parse พัง — index-store จับ ข้ามไฟล์นั้น แล้ว log เตือน
   */
  indexFile(path: string, text: string): FileIndex
  /** identifier ที่ครอบตำแหน่ง (1-based) — null ถ้าตรงนั้นไม่ใช่ identifier */
  symbolAt(text: string, line: number, col: number): SymbolHit | null
}

/**
 * ลำดับสำคัญ: นามสกุลซ้ำกันให้ตัวแรกชนะ
 */
export const LANGUAGE_INDEXERS: readonly LanguageIndexer[] = [pythonIndexer, typescriptIndexer, vueIndexer]

/** map นามสกุล → indexer สร้างครั้งเดียว (registry เป็นค่าคงที่ตลอด process) */
const byExtension = new Map<string, LanguageIndexer>()
for (const indexer of LANGUAGE_INDEXERS) {
  for (const ext of indexer.extensions) {
    if (!byExtension.has(ext)) byExtension.set(ext, indexer)
  }
}

/** indexer ที่รับผิดชอบไฟล์นี้ — null = ภาษาที่ยังไม่รองรับ (endpoint ตอบ unsupported_language) */
export function indexerFor(filePath: string): LanguageIndexer | null {
  return byExtension.get(path.posix.extname(filePath).toLowerCase()) ?? null
}

/** นามสกุลทั้งหมดที่ index สนใจ — index-store ใช้กรองรายชื่อไฟล์ก่อนอ่าน blob */
export function indexedExtensions(): readonly string[] {
  return [...byExtension.keys()]
}
