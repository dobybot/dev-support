import type { PanelSpan } from '@/lib/reading-panel'
import type { CoverageBaseFile, ReadingList, RunData, RunSection } from '@/shared/types'

/**
 * ตรรกะล้วนของ reading checklist + coverage meter (SPEC-reading-checklist) — ไม่มี React ไม่มี DOM
 * เทสต์อยู่ที่ test/read-state.test.ts ตามกฎ "logic เป็นฟังก์ชันล้วน ไม่มีเทสต์ระดับ component"
 *
 * สองปัญหาที่แยกจากกัน:
 * 1. ผู้อ่านอ่านอะไรไปแล้วบ้าง (checkbox ต่อ span + prose ต่อ section) — วัดกับ content ที่ curate มา
 * 2. เห็นครบทั้ง diff หรือยัง (coverage) — วัดกับ `git diff` ไม่ใช่กับ reading list
 */

/* ── span identity: content hash ไม่ใช่ authored id ──────────────────────────
   ReadingSpan ไม่มี id และไม่เพิ่ม — identity คือ hash(path:from:to) คิดฝั่ง client
   บรรทัดเลื่อน = hash เปลี่ยน = กลับเป็นยังไม่อ่าน ซึ่งเป็น semantic ที่ถูก (story 4):
   บรรทัดที่เลื่อนคือโค้ดคนละก้อน ต้องอ่านใหม่ · span เดียวกันในสองรายการแชร์ hash เดียว
   = สถานะอ่านเดียว ("อ่านแล้ว" เป็นของโค้ด ไม่ใช่ของ list entry) */

/** FNV-1a 32-bit เป็น hex 8 ตัว — ต้องการแค่ความนิ่งข้าม session ไม่ใช่ crypto */
export function spanHash(path: string, from: number, to: number): string {
  const input = `${path}:${from}:${to}`
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

/* ── persistence: raw intent เท่านั้น ────────────────────────────────────────
   เก็บเฉพาะสิ่งที่ผู้อ่านกดเอง (hash ที่ติ๊ก, section ที่กดอ่านจบ) — ค่าที่คำนวณได้
   (รวมยอด, เปอร์เซ็นต์, coverage) ห้ามลง storage ตามกฎ intent-not-derived ของ DEVELOPMENT.md */

export interface StoredReadState {
  v: 1
  /** hash ของ span ที่ติ๊กว่าอ่านแล้ว */
  spans: string[]
  /** section id ที่กด "อ่านหน้านี้จบแล้ว" */
  sections: string[]
}

export const EMPTY_READ_STATE: StoredReadState = { v: 1, spans: [], sections: [] }

/** หนึ่ง key ต่อ run — สอง run บน repo เดียวกันไม่แชร์เครื่องหมาย (story 15) */
export function readStateKey(runId: string): string {
  return `learn-diff:read-state:${runId}`
}

/** interface แบบเดียวกับ WidthStore ของ reading-panel — mock ในเทสต์ได้โดยไม่ต้องมี DOM */
export interface ReadStateStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

/** ค่าเสีย/version ไม่ตรง = ทิ้งทั้งก้อน กลายเป็น "ยังไม่อ่าน" ไม่ใช่ crash (story 16) */
export function readStoredReadState(store: ReadStateStore | null, runId: string): StoredReadState {
  let raw: string | null = null
  try {
    raw = store?.getItem(readStateKey(runId)) ?? null
  } catch {
    raw = null
  }
  if (raw === null) return EMPTY_READ_STATE
  try {
    const parsed = JSON.parse(raw) as unknown
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      (parsed as { v?: unknown }).v !== 1 ||
      !Array.isArray((parsed as { spans?: unknown }).spans) ||
      !Array.isArray((parsed as { sections?: unknown }).sections)
    ) {
      return EMPTY_READ_STATE
    }
    const spans = (parsed as { spans: unknown[] }).spans.filter((s): s is string => typeof s === 'string')
    const sections = (parsed as { sections: unknown[] }).sections.filter(
      (s): s is string => typeof s === 'string',
    )
    return { v: 1, spans, sections }
  } catch {
    return EMPTY_READ_STATE
  }
}

export function writeStoredReadState(store: ReadStateStore | null, runId: string, state: StoredReadState): void {
  try {
    store?.setItem(readStateKey(runId), JSON.stringify(state))
  } catch {
    // โหมดส่วนตัว/โควตาเต็ม: จำไม่ได้ก็อ่านต่อได้ แค่เครื่องหมายไม่รอดข้าม session
  }
}

/** hash/section ที่ไม่มีในเนื้อหาแล้ว (regenerate) ถูก drop — เรียกก่อน write เมื่อรู้ชุดที่มีจริง */
export function pruneReadState(
  state: StoredReadState,
  knownSpans: ReadonlySet<string>,
  knownSections: ReadonlySet<string>,
): StoredReadState {
  return {
    v: 1,
    spans: state.spans.filter((hash) => knownSpans.has(hash)),
    sections: state.sections.filter((id) => knownSections.has(id)),
  }
}

/* ── reducer: การกดของผู้อ่าน ──────────────────────────────────────────────── */

export function toggleSpanRead(state: StoredReadState, hash: string): StoredReadState {
  const spans = state.spans.includes(hash)
    ? state.spans.filter((h) => h !== hash)
    : [...state.spans, hash]
  return { ...state, spans }
}

/** mark-all ของทั้งรายการ — ติ๊ก/ล้างทีเดียว ไม่ใช่ N คลิก (story 2) */
export function setSpansRead(state: StoredReadState, hashes: readonly string[], read: boolean): StoredReadState {
  if (read) {
    const merged = new Set(state.spans)
    for (const hash of hashes) merged.add(hash)
    return { ...state, spans: [...merged] }
  }
  const drop = new Set(hashes)
  return { ...state, spans: state.spans.filter((h) => !drop.has(h)) }
}

export function toggleSectionRead(state: StoredReadState, sectionId: string): StoredReadState {
  const sections = state.sections.includes(sectionId)
    ? state.sections.filter((id) => id !== sectionId)
    : [...state.sections, sectionId]
  return { ...state, sections }
}

/* ── rollups: สถานะ section + progress ของทั้ง run (derived เสมอ ไม่เก็บ) ──── */

export function listSpanHashes(list: ReadingList): string[] {
  return list.spans.map((span) => spanHash(span.path, span.from, span.to))
}

/** hash ของทุก span ใน reading list ทุกรายการ — unique (span ซ้ำสองรายการนับหนึ่ง) */
export function allListSpanHashes(data: RunData): Set<string> {
  const hashes = new Set<string>()
  for (const list of data.readingLists ?? []) {
    for (const hash of listSpanHashes(list)) hashes.add(hash)
  }
  return hashes
}

/** unread ○ / prose ◐ / done ● — "code read" derive จาก checkbox ไม่มี bookkeeping แยก (story 7) */
export type SectionReadStatus = 'unread' | 'prose' | 'done'

export function sectionReadStatus(
  data: RunData,
  state: StoredReadState,
  section: RunSection,
): SectionReadStatus {
  if (!state.sections.includes(section.id)) return 'unread'
  const list = section.readingList
    ? (data.readingLists ?? []).find((item) => item.id === section.readingList)
    : undefined
  // section ที่ไม่มี reading list ไม่มี state ที่สาม — prose จบ = จบ
  if (!list || list.spans.length === 0) return 'done'
  const checked = new Set(state.spans)
  return listSpanHashes(list).every((hash) => checked.has(hash)) ? 'done' : 'prose'
}

export interface RunProgress {
  sectionsRead: number
  sectionsTotal: number
  spansRead: number
  spansTotal: number
}

/** progress ผ่าน content ที่ curate มา — นับเป็นจำนวน ไม่ใช่แค่ % (story 9) */
export function runProgress(data: RunData, state: StoredReadState): RunProgress {
  const sectionIds = new Set(data.sections.map((s) => s.id))
  const known = allListSpanHashes(data)
  const sectionsRead = state.sections.filter((id) => sectionIds.has(id)).length
  const spansRead = state.spans.filter((hash) => known.has(hash)).length
  return {
    sectionsRead,
    sectionsTotal: data.sections.length,
    spansRead,
    spansTotal: known.size,
  }
}

/* ── coverage math: วัดกับ diff ไม่ใช่กับ reading list ─────────────────────── */

export interface LineRange {
  from: number
  to: number
}

function rangeLines(range: LineRange): number {
  return Math.max(0, range.to - range.from + 1)
}

/** รวมช่วงที่ทับ/ติดกันเป็นก้อนเดียว — เรียงตาม from */
export function mergeRanges(ranges: readonly LineRange[]): LineRange[] {
  const sorted = [...ranges]
    .filter((r) => r.to >= r.from)
    .sort((a, b) => a.from - b.from || a.to - b.to)
  const merged: LineRange[] = []
  for (const range of sorted) {
    const last = merged[merged.length - 1]
    if (last && range.from <= last.to + 1) {
      last.to = Math.max(last.to, range.to)
    } else {
      merged.push({ ...range })
    }
  }
  return merged
}

/** base − remove (ทั้งสองฝั่งควร merge มาก่อน) — ใช้หา "ช่วงที่ไม่มี span ไหนครอบ" */
export function subtractRanges(base: readonly LineRange[], remove: readonly LineRange[]): LineRange[] {
  const result: LineRange[] = []
  for (const range of base) {
    let pieces: LineRange[] = [{ ...range }]
    for (const cut of remove) {
      const next: LineRange[] = []
      for (const piece of pieces) {
        if (cut.to < piece.from || cut.from > piece.to) {
          next.push(piece)
          continue
        }
        if (cut.from > piece.from) next.push({ from: piece.from, to: cut.from - 1 })
        if (cut.to < piece.to) next.push({ from: cut.to + 1, to: piece.to })
      }
      pieces = next
    }
    result.push(...pieces)
  }
  return result
}

/** hunk ที่ไม่มี reading list span (kind 'changed') ครอบเลย — เตือนเรื่อง curation ไม่ใช่เรื่องผู้อ่าน */
export interface UncoveredHunk {
  path: string
  from: number
  to: number
  /** hash แบบเดียวกับ span ปกติ — synthetic span จึง persist และนับ coverage ได้ (story 12, 14) */
  hash: string
}

export interface CoverageInfo {
  /** จำนวนบรรทัดที่เปลี่ยนทั้ง PR (ฝั่ง head — ไม่นับบรรทัดที่ถูกลบล้วน) */
  totalChanged: number
  /** บรรทัดที่เปลี่ยนซึ่งผู้อ่านอ่านผ่าน span ที่ติ๊กแล้ว */
  coveredChanged: number
  /** จำนวนเต็ม · 100 เฉพาะตอนอ่านครบจริง ๆ เท่านั้น · ไม่มีบรรทัดเปลี่ยนเลย = 100 */
  pct: number
  uncovered: UncoveredHunk[]
}

/**
 * path ของ span มาจาก run.json ที่ agent เขียน ส่วน path ของ diff มาจาก git (canonical เสมอ)
 * — ฝั่ง server ทุกทางเดินผ่าน `repoRelativePath` อยู่แล้ว ("./src/x.py" เปิดไฟล์ได้ปกติ)
 * ถ้าฝั่ง coverage เทียบด้วย string ตรง ๆ span แบบนั้นจะกลายเป็น "ไม่ครอบอะไรเลย" เงียบ ๆ
 * แล้วโยนความผิดให้ curation ของ agent ทั้งที่เป็นแค่รูปแบบ path
 */
export function normalizePath(raw: string): string {
  const out: string[] = []
  for (const part of raw.replace(/\\/g, '/').split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..' && out.length > 0 && out[out.length - 1] !== '..') out.pop()
    else out.push(part)
  }
  return out.join('/')
}

/** uncovered ชุดเดิมไหม (เทียบด้วย hash) — ผู้เรียกฝั่ง React ใช้คงความนิ่งของ array identity */
export function sameUncovered(a: readonly UncoveredHunk[], b: readonly UncoveredHunk[]): boolean {
  return a.length === b.length && a.every((hunk, i) => hunk.hash === b[i].hash)
}

/**
 * intersect span ของ reading list กับช่วงที่เปลี่ยนจริงของ diff
 *
 * - เฉพาะ span kind 'changed' เท่านั้นที่นับ (ทั้งฝั่ง coverage และฝั่ง uncovered) —
 *   context span อยู่นอก diff โดยนิยาม
 * - `uncovered` ไม่ขึ้นกับ checked เลย (story 13: เตือนได้ตั้งแต่ยังไม่ติ๊กอะไร)
 * - synthetic span (จาก uncovered hunk) ที่ถูกติ๊ก นับเข้า coveredChanged ด้วย
 *   เพื่อให้ meter ไปถึง 100% ได้จริง (story 14)
 */
export function computeCoverage(
  data: RunData,
  files: readonly CoverageBaseFile[],
  checked: ReadonlySet<string>,
): CoverageInfo {
  // span ที่เปลี่ยนของแต่ละไฟล์ พร้อม hash — จากทุก reading list
  // key เป็น path ที่ normalize แล้ว (ให้ตรงกับ path จาก git) แต่ **hash คิดจาก path ดิบเสมอ**
  // เพราะ checkbox ในการ์ดก็คิดจาก path ดิบ — สอง identity ต้องไม่แยกกัน
  const spansByPath = new Map<string, { range: LineRange; hash: string }[]>()
  for (const list of data.readingLists ?? []) {
    for (const span of list.spans) {
      if (span.kind !== 'changed') continue
      const entry = { range: { from: span.from, to: span.to }, hash: spanHash(span.path, span.from, span.to) }
      const key = normalizePath(span.path)
      const bucket = spansByPath.get(key)
      if (bucket) bucket.push(entry)
      else spansByPath.set(key, [entry])
    }
  }

  let totalChanged = 0
  let coveredChanged = 0
  const uncovered: UncoveredHunk[] = []

  for (const file of files) {
    const changed = mergeRanges(file.ranges)
    totalChanged += changed.reduce((sum, r) => sum + rangeLines(r), 0)

    const spans = spansByPath.get(normalizePath(file.path)) ?? []

    // uncovered: ช่วงเปลี่ยนที่ไม่มี span ไหนครอบ — ไม่สน checked
    const fileUncovered = subtractRanges(changed, mergeRanges(spans.map((s) => s.range)))
    for (const range of fileUncovered) {
      uncovered.push({ path: file.path, from: range.from, to: range.to, hash: spanHash(file.path, range.from, range.to) })
    }

    // covered: union ของ (span ที่ติ๊ก ∩ ช่วงเปลี่ยน) + uncovered hunk ที่ติ๊ก (synthetic)
    const checkedRanges = spans.filter((s) => checked.has(s.hash)).map((s) => s.range)
    for (const range of fileUncovered) {
      if (checked.has(spanHash(file.path, range.from, range.to))) checkedRanges.push(range)
    }
    const coveredRanges = subtractRanges(changed, subtractRanges(changed, mergeRanges(checkedRanges)))
    coveredChanged += coveredRanges.reduce((sum, r) => sum + rangeLines(r), 0)
  }

  // 100 สงวนไว้ให้ "อ่านครบจริง" เท่านั้น — ปัดขึ้นเป็น 100 ตอนเหลือ 1 บรรทัดจาก 400 คือการลบ
  // สัญญาณเดียวที่ meter นี้มีหน้าที่ส่ง (story 10) และขัดกับตัวเลขนับที่โชว์ข้าง ๆ กันเอง
  const pct =
    totalChanged === 0
      ? 100
      : coveredChanged >= totalChanged
        ? 100
        : Math.min(99, Math.round((coveredChanged / totalChanged) * 100))
  return { totalChanged, coveredChanged, pct, uncovered }
}

/* ── synthetic reading list ของ uncovered hunks ────────────────────────────── */

export const UNCOVERED_WHY = 'โค้ดส่วนนี้ไม่อยู่ใน reading list ไหนเลย'
export const UNCOVERED_LIST_TITLE = 'โค้ดที่ reading list ไม่ครอบคลุม'

/** หนึ่ง span ต่อหนึ่ง hunk, kind 'changed' — ใช้ hash scheme เดียวกับ span ปกติ */
export function syntheticSpans(uncovered: readonly UncoveredHunk[]): PanelSpan[] {
  return uncovered.map((hunk) => ({
    path: hunk.path,
    from: hunk.from,
    to: hunk.to,
    kind: 'changed' as const,
    why: UNCOVERED_WHY,
  }))
}
