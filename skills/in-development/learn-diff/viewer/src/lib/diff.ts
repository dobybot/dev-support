import type { DiffHunk } from '@/shared/types'

/**
 * ตรรกะล้วนของการแสดง diff — ไม่มี React, ไม่มี CodeMirror (เทสต์อยู่ที่ test/diff.test.ts)
 *
 * ที่มาของข้อมูล: server ส่ง hunk ของไฟล์ทั้งไฟล์มา (base → head) ส่วนเนื้อบรรทัดฝั่งใหม่
 * มาจาก file API แยกกัน ไฟล์นี้คือที่ที่สองอย่างนั้นถูกประกอบกลับเป็น "แถว" ที่วาดได้
 *
 * แถวชุดเดียวใช้ได้ทั้งสองโหมด (SPEC-v3 → Viewer UI: one code path, not two):
 *   unified   = เรียงแถวลงในเอกสารเดียว
 *   split     = จับคู่แถวลบกับแถวเพิ่ม แล้วเติมแถวว่างให้สองฝั่งสูงเท่ากัน
 */

export type DiffRowKind = 'same' | 'add' | 'del'

export interface DiffRow {
  kind: DiffRowKind
  /** เลขบรรทัดฝั่ง base (null สำหรับบรรทัดที่เพิ่มใหม่) */
  oldNumber: number | null
  /** เลขบรรทัดฝั่ง head = commit ที่ pin ไว้ (null สำหรับบรรทัดที่ถูกลบ) */
  newNumber: number | null
  text: string
}

/** หนึ่งบรรทัดในเอกสารที่ส่งให้ตัวแสดงโค้ด — `filler` คือแถวว่างไว้ให้สองฝั่ง split ตรงกัน */
export type CodeLineKind = DiffRowKind | 'filler'

export interface CodeLine {
  kind: CodeLineKind
  /** เลขที่จะโชว์ใน gutter — null = ไม่โชว์ (แถว filler) */
  number: number | null
  text: string
}

export interface RowInput {
  /** เลขบรรทัด (ฝั่ง head) ของ `lines[0]` */
  firstLine: number
  /** เนื้อบรรทัดฝั่ง head เท่าที่โหลดมา (ช่วงเดียว หรือทั้งไฟล์ตอนกาง) */
  lines: string[]
  /** จำนวนบรรทัดทั้งไฟล์ฝั่ง head */
  totalLines: number
  hunks: DiffHunk[]
}

/**
 * แถวของหน้าต่างที่กำลังแสดงอยู่ — บรรทัดนอกช่วงถูกข้ามด้วยการกระโดด ไม่ใช่วนทีละบรรทัด
 * (ไฟล์แสนบรรทัดที่เปิดดูแค่ 20 บรรทัดต้องไม่จ่ายค่าไฟล์ทั้งไฟล์)
 *
 * บรรทัดที่ถูกลบไม่มีที่อยู่ฝั่ง head จึงถูกผูกไว้กับ "บรรทัดถัดจากจุดที่ลบ" และแสดงก็ต่อเมื่อ
 * จุดนั้นอยู่ในหน้าต่าง — ไม่งั้นการเปิดช่วง 61–79 จะเห็นบรรทัดที่ถูกลบจากท้ายไฟล์โผล่มาด้วย
 */
export function buildRows({ firstLine, lines, totalLines, hunks }: RowInput): DiffRow[] {
  const lastLine = firstLine + lines.length - 1
  const textAt = (n: number): string => lines[n - firstLine] ?? ''
  const rows: DiffRow[] = []

  const pushSameRun = (startNew: number, startOld: number, count: number): void => {
    const lo = Math.max(startNew, firstLine)
    const hi = Math.min(startNew + count - 1, lastLine)
    for (let n = lo; n <= hi; n += 1) {
      rows.push({ kind: 'same', newNumber: n, oldNumber: startOld + (n - startNew), text: textAt(n) })
    }
  }

  const ordered = [...hunks].sort((a, b) => a.newStart - b.newStart || a.oldStart - b.oldStart)
  let newLine = 1
  let oldLine = 1

  for (const hunk of ordered) {
    if (hunk.newStart > newLine) {
      pushSameRun(newLine, oldLine, hunk.newStart - newLine)
      oldLine += hunk.newStart - newLine
      newLine = hunk.newStart
    }
    // จุดแทรก/จุดลบอยู่ในหน้าต่างไหม (`lastLine + 1` = ลบท้ายช่วงพอดี)
    const showDeletions = hunk.newStart >= firstLine && hunk.newStart <= lastLine + 1
    for (const text of hunk.oldLines) {
      if (showDeletions) rows.push({ kind: 'del', oldNumber: oldLine, newNumber: null, text })
      oldLine += 1
    }
    for (let i = 0; i < hunk.newCount; i += 1) {
      if (newLine >= firstLine && newLine <= lastLine) {
        rows.push({ kind: 'add', newNumber: newLine, oldNumber: null, text: textAt(newLine) })
      }
      newLine += 1
    }
  }

  if (newLine <= totalLines) pushSameRun(newLine, oldLine, totalLines - newLine + 1)
  return rows
}

/** เอกสารเดียวเรียงตามลำดับจริง — บรรทัดที่ถูกลบแทรกอยู่ก่อนบรรทัดที่มาแทน */
export function unifiedDoc(rows: DiffRow[]): CodeLine[] {
  return rows.map((row) => ({
    kind: row.kind,
    number: row.kind === 'del' ? row.oldNumber : row.newNumber,
    text: row.text,
  }))
}

/**
 * สองฝั่งที่ "แถวตรงกัน" — บรรทัดที่ถูกแทนจับคู่กันทีละบรรทัด ที่เหลือเติม filler
 *
 * ความสูงต่อแถวต้องเท่ากันทั้งสองฝั่ง มุมมองนี้จึงปิด line wrapping (ดู lib/code/index.ts)
 */
export function splitDocs(rows: DiffRow[]): { left: CodeLine[]; right: CodeLine[] } {
  const left: CodeLine[] = []
  const right: CodeLine[] = []
  const filler = (): CodeLine => ({ kind: 'filler', number: null, text: '' })

  let i = 0
  while (i < rows.length) {
    if (rows[i].kind === 'same') {
      const row = rows[i]
      left.push({ kind: 'same', number: row.oldNumber, text: row.text })
      right.push({ kind: 'same', number: row.newNumber, text: row.text })
      i += 1
      continue
    }
    const dels: DiffRow[] = []
    const adds: DiffRow[] = []
    while (i < rows.length && rows[i].kind === 'del') dels.push(rows[i++])
    while (i < rows.length && rows[i].kind === 'add') adds.push(rows[i++])
    const height = Math.max(dels.length, adds.length)
    for (let k = 0; k < height; k += 1) {
      const del = dels[k]
      const add = adds[k]
      left.push(del ? { kind: 'del', number: del.oldNumber, text: del.text } : filler())
      right.push(add ? { kind: 'add', number: add.newNumber, text: add.text } : filler())
    }
  }
  return { left, right }
}

export function docText(lines: CodeLine[]): string {
  return lines.map((line) => line.text).join('\n')
}

/* ── โหมดการแสดง diff ───────────────────────────────────────────────────────
   ค่าเริ่มต้นคือ unified และเป็นค่าของ "ผู้อ่าน" ไม่ใช่ของไฟล์ —
   สลับครั้งเดียวแล้วต้องอยู่ยาวข้ามไฟล์ ข้าม run และข้าม session (user story 21) */

export type DiffMode = 'unified' | 'split'

export const DIFF_MODE_KEY = 'learn-diff:diff-mode'
export const DEFAULT_DIFF_MODE: DiffMode = 'unified'

export interface PreferenceStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export function readStoredDiffMode(store: PreferenceStore | null): DiffMode {
  try {
    return store?.getItem(DIFF_MODE_KEY) === 'split' ? 'split' : DEFAULT_DIFF_MODE
  } catch {
    return DEFAULT_DIFF_MODE
  }
}

export function writeStoredDiffMode(store: PreferenceStore | null, mode: DiffMode): void {
  try {
    store?.setItem(DIFF_MODE_KEY, mode)
  } catch {
    // โหมดส่วนตัว/โควตาเต็ม: จำโหมดไม่ได้ก็ไม่ควรทำให้ panel พัง
  }
}
