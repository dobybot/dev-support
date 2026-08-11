import type { RunData } from '@/shared/types'

/**
 * ตรรกะล้วนของ reading-list panel — ไม่มี React, ไม่มี DOM (เทสต์อยู่ที่ test/reading-panel.test.ts)
 *
 * reading list คือของชิ้นเดียวที่ diff viewer ให้ไม่ได้: ลำดับการอ่านที่ "คนที่เพิ่งอ่านทั้ง change"
 * เลือกมาให้ รวมถึงโค้ดที่ PR **ไม่ได้แตะ** · panel จึงเรียงตามลำดับที่ agent เขียน
 * ไม่ใช่เรียงตามไฟล์/เลขบรรทัด (SPEC-v3 → user story 15)
 */

/**
 * สิ่งที่ panel เปิดได้ · `file` = ชื่อไฟล์ในเนื้อความที่ไม่มี id ของตัวเอง
 *
 * `file.focusLine` (CONTRACT-f12 §4.1): บรรทัดที่ต้อง flash highlight ตอนกระโดดมาจาก go-to-definition
 * หรือจากการคลิกรายการ reference — ไม่ใช่ "ช่วงที่ agent เลือกให้อ่าน" (นั่นคือ from/to) จึงแยกฟิลด์
 *
 * `references`: เปิดจาก Shift+F12 หรือปุ่ม "แสดง references ทั้งหมด" — เต็ม panel จัดกลุ่มตามไฟล์
 * (§4.1) ไม่ผ่าน `resolveTarget` เหมือน list/file เพราะข้อมูลมาจาก endpoint `/references` ไม่ใช่ run.json
 */
export type PanelTarget =
  | { kind: 'list'; listId: string }
  | { kind: 'file'; path: string; from: number | null; to: number | null; focusLine?: number }
  | { kind: 'references'; path: string; line: number; col: number; symbol: string }
  /** synthetic reading list ของ uncovered hunks (SPEC-reading-checklist) — เนื้อ span สร้างสด
      จาก coverage ฝั่ง component (ไม่อยู่ใน run.json จึงไม่ผ่าน resolveTarget)
      `hash` = hunk ที่กดมา (ถ้ามี) — panel เลื่อนไปหาการ์ดใบนั้น ไม่ใช่แค่เปิดรายการทิ้งไว้ */
  | { kind: 'uncovered'; hash?: string }

/** ช่วงโค้ดหนึ่งก้อนในรูปที่ panel ใช้ — `null` = ทั้งไฟล์ */
export interface PanelSpan {
  path: string
  from: number | null
  to: number | null
  kind: 'changed' | 'context'
  why: string
}

export function targetKey(target: PanelTarget): string {
  switch (target.kind) {
    case 'list':
      return `list:${target.listId}`
    case 'file':
      // focusLine เข้าคีย์ด้วย: กระโดดมาจาก reference คนละบรรทัดของไฟล์/ช่วงเดียวกัน ต้องนับเป็นก้าวใหม่
      // (ไม่งั้นย้อนกลับข้ามจุดที่เพิ่งดูไปเงียบ ๆ)
      return `file:${target.path}:${target.from ?? ''}-${target.to ?? ''}:${target.focusLine ?? ''}`
    case 'references':
      // เปิดซ้ำจุดเดิม (ตำแหน่ง cursor เดิมเป๊ะ) ไม่นับก้าวใหม่ (CONTRACT-f12 §4.1)
      // symbol เข้าคีย์ด้วย — ตำแหน่งเดียวกันคนละ symbol (ไฟล์ถูก reindex/คนละ commit) ต้องเป็นคนละก้าว
      return `refs\0${target.path}\0${target.line}\0${target.col}\0${target.symbol}`
    case 'uncovered':
      // รายการเดียวต่อ run แต่ hunk ที่กดมาเข้าคีย์ด้วย: กดคนละ hunk = คนละก้าว (ต้องเลื่อนไปหามัน)
      // ไม่งั้นปุ่ม "เปิดอ่าน" ของทุก hunk หลังใบแรกกลายเป็น dead click — ไม่มีอะไรเปลี่ยนเลย
      return `uncovered:${target.hash ?? ''}`
  }
}

/** เป้าหมายที่เป็น "จุดกระโดดชั่วคราว" ไม่ใช่ที่อ่านหลัก — ใช้ตัดสิน goBackToReading */
function isNavigationTarget(target: PanelTarget): boolean {
  return target.kind === 'references' || (target.kind === 'file' && target.focusLine != null)
}

/* ── ประวัติการเปิด ─────────────────────────────────────────────────────────
   เปิดได้ทีละรายการเดียว + ย้อนกลับได้ (SPEC-v3 → Viewer UI)
   tab หรือ panel ซ้อนกันถูกปฏิเสธไว้แล้ว: กองรายการที่เปิดค้างแข่งกับลำดับที่ agent เลือกมา */

/** entry หนึ่งรายการของประวัติ พร้อมตำแหน่ง scroll ของมันตอนออกจากมัน (CONTRACT-f12 §4.1) */
export interface PanelHistoryEntry {
  target: PanelTarget
  scrollTop: number
}

export interface PanelHistory {
  entries: PanelHistoryEntry[]
  /** -1 = ยังไม่เคยเปิดอะไรเลย */
  index: number
}

export const EMPTY_HISTORY: PanelHistory = { entries: [], index: -1 }

/** กันประวัติโตไม่จำกัดในการอ่านยาว ๆ — ตัวเก่าสุดหลุดออกทางหัว */
export const MAX_HISTORY = 50

export function currentTarget(history: PanelHistory): PanelTarget | null {
  return history.entries[history.index]?.target ?? null
}

/** scroll ที่จำไว้ของ entry ปัจจุบัน — hook เอาไป set ให้ scroller แทนการ reset เป็น 0 เสมอ */
export function currentScrollTop(history: PanelHistory): number {
  return history.entries[history.index]?.scrollTop ?? 0
}

/**
 * เปิดรายการใหม่ = แทนที่ของเดิม แล้วตัดประวัติฝั่งหน้าทิ้ง (เหมือน history ของ browser)
 * เปิดอันเดิมซ้ำไม่นับเป็นก้าวใหม่ ไม่งั้นกดปุ่มเดิมสองครั้งแล้ว "ย้อนกลับ" จะไม่ขยับ
 *
 * `leavingScrollTop` = scrollTop ของ entry ปัจจุบันตอนกำลังจะออกจากมัน — บันทึกไว้ก่อน push
 * เพื่อให้กลับมาที่เดิมได้ (CONTRACT-f12 §4.1) · entry ใหม่เอี่ยมเริ่มที่ 0 เสมอ
 */
/** บันทึก scrollTop ลง entry ปัจจุบัน (ตอนกำลังจะออกจากมัน) — ใช้ร่วมกันทุกทางออก: push/back/forward */
function recordScroll(history: PanelHistory, leavingScrollTop: number): PanelHistoryEntry[] {
  if (history.index < 0) return history.entries
  return history.entries.map((entry, i) => (i === history.index ? { ...entry, scrollTop: leavingScrollTop } : entry))
}

export function pushTarget(history: PanelHistory, target: PanelTarget, leavingScrollTop = 0): PanelHistory {
  const current = currentTarget(history)
  if (current && targetKey(current) === targetKey(target)) return history
  const kept = recordScroll(history, leavingScrollTop).slice(0, history.index + 1)
  const entries = [...kept, { target, scrollTop: 0 }].slice(-MAX_HISTORY)
  return { entries, index: entries.length - 1 }
}

export function canGoBack(history: PanelHistory): boolean {
  return history.index > 0
}

export function canGoForward(history: PanelHistory): boolean {
  return history.index >= 0 && history.index < history.entries.length - 1
}

/**
 * ทุกทางออกจาก entry (ไม่ใช่แค่ pushTarget) ต้องบันทึก scroll ของ entry ที่กำลังออก — CONTRACT-f12 §4.1
 * ไม่งั้น back แล้ว forward (หรือเลื่อนรายการ references ก่อนกด "กลับไปอ่านต่อ") ตำแหน่งหายเป็น 0
 * · default = ค่าที่จำไว้เดิม เพื่อให้ผู้เรียกที่ไม่มี scroll สด (เช่นเทสต์เดิม) ไม่ทำค่าเก่าพัง
 */
export function goBack(history: PanelHistory, leavingScrollTop = currentScrollTop(history)): PanelHistory {
  if (!canGoBack(history)) return history
  return { entries: recordScroll(history, leavingScrollTop), index: history.index - 1 }
}

export function goForward(history: PanelHistory, leavingScrollTop = currentScrollTop(history)): PanelHistory {
  if (!canGoForward(history)) return history
  return { entries: recordScroll(history, leavingScrollTop), index: history.index + 1 }
}

/**
 * ปุ่ม "กลับไปอ่านต่อ" (CONTRACT-f12 §4.1) — เดินถอย index ไปหา entry ล่าสุดที่ไม่ใช่จุดกระโดด
 * ชั่วคราว (references / file ที่มี focusLine) แล้ว jump ตรงไปที่นั่นทีเดียว ข้าม entry คั่นกลาง
 * ทั้งหมด ต่างจาก goBack ที่ถอยทีละก้าว · ไม่เจอที่อ่านมาก่อนหน้า = ไม่ทำอะไร (ไม่มีที่ให้กลับ)
 */
export function goBackToReading(history: PanelHistory, leavingScrollTop = currentScrollTop(history)): PanelHistory {
  for (let i = history.index - 1; i >= 0; i -= 1) {
    if (!isNavigationTarget(history.entries[i].target)) {
      return { entries: recordScroll(history, leavingScrollTop), index: i }
    }
  }
  // ไม่มีที่ให้กลับ = คืน object เดิมเป๊ะ — hook ใช้ identity ตัดสิน `canGoBackToReading`
  return history
}

/** ปุ่ม "กลับไปรายการอ้างอิง" ใช้ label นี้ตัดสินว่าจะโชว์ไหม — entry ก่อนหน้าเป็น references พอดี */
export function backGoesToReferences(history: PanelHistory): boolean {
  const prev = history.entries[history.index - 1]
  return prev?.target.kind === 'references'
}

/* ── ความกว้าง ─────────────────────────────────────────────────────────────
   panel ดันเนื้อหาให้แคบลง ไม่ใช่ลอยทับ — ความกว้างจึงต้องเหลือที่ให้ prose อ่านได้เสมอ */

export const MIN_PANEL_WIDTH = 360
/** ที่ที่ต้องเหลือไว้ให้เนื้อหา ไม่ว่าจะลากยังไง */
export const MIN_CONTENT_WIDTH = 520
export const DEFAULT_PANEL_WIDTH = 560
export const PANEL_WIDTH_KEY = 'learn-diff:panel-width'

export function clampPanelWidth(width: number, viewportWidth: number): number {
  const max = Math.max(MIN_PANEL_WIDTH, viewportWidth - MIN_CONTENT_WIDTH)
  if (!Number.isFinite(width)) return Math.min(DEFAULT_PANEL_WIDTH, max)
  return Math.round(Math.min(Math.max(width, MIN_PANEL_WIDTH), max))
}

/** เก็บข้าม run และข้าม session — ผู้อ่านไม่ต้องลากใหม่ทุกครั้ง (user story 7) */
export interface WidthStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

/**
 * คืนค่าดิบที่จำไว้ ไม่ clamp ตามจอ — clamp ทำตอนแสดงผลเท่านั้น (issue #18)
 * ถ้า clamp ตรงนี้ การเปิดในหน้าต่างแคบครั้งเดียวจะกินความกว้างที่ตั้งไว้หายถาวร
 * (ค่า 760 กลายเป็น 360 ใน state ทั้งที่ localStorage ยังจำ 760)
 */
export function readStoredWidth(store: WidthStore | null): number {
  let raw: string | null = null
  try {
    raw = store?.getItem(PANEL_WIDTH_KEY) ?? null
  } catch {
    raw = null
  }
  const parsed = raw === null ? Number.NaN : Number(raw)
  return Number.isFinite(parsed) ? parsed : DEFAULT_PANEL_WIDTH
}

export function writeStoredWidth(store: WidthStore | null, width: number): void {
  try {
    store?.setItem(PANEL_WIDTH_KEY, String(Math.round(width)))
  } catch {
    // โหมดส่วนตัว/โควตาเต็ม: จำความกว้างไม่ได้ก็ไม่ควรทำให้ panel พัง
  }
}

/* ── สิ่งที่ panel จะแสดง ──────────────────────────────────────────────────── */

export interface ResolvedList {
  title: string
  spans: PanelSpan[]
  /** id ที่อ้างถึงแต่ไม่มีใน run.json — ต้องโชว์ให้เห็น ห้ามเงียบ (คลิกตายคือผลลัพธ์ที่แย่ที่สุด) */
  missingListId?: string
}

/**
 * resolve เฉพาะ `list`/`file` — target ชนิด `references` ไม่ผ่านที่นี่ (ไม่มี "resolved list" ให้มัน)
 * และ `uncovered` ก็ไม่ผ่าน (เนื้อ span มาจาก coverage ไม่ใช่ run.json) —
 * component เลือก render ทางอื่นตั้งแต่ก่อนเรียกฟังก์ชันนี้
 */
export function resolveTarget(
  data: RunData,
  target: Exclude<PanelTarget, { kind: 'references' } | { kind: 'uncovered' }>,
): ResolvedList {
  if (target.kind === 'file') {
    const range = target.from == null ? '' : ` บรรทัด ${target.from}${target.to && target.to !== target.from ? `–${target.to}` : ''}`
    return {
      title: `${target.path}${range}`,
      spans: [
        {
          path: target.path,
          from: target.from,
          to: target.to,
          kind: 'context',
          why: 'เปิดจากชื่อไฟล์ในเนื้อความ — ไม่ใช่ลำดับการอ่านที่ agent จัดไว้',
        },
      ],
    }
  }
  const list = (data.readingLists ?? []).find((item) => item.id === target.listId)
  if (!list) {
    return { title: target.listId, spans: [], missingListId: target.listId }
  }
  return {
    title: list.title,
    spans: list.spans.map((span) => ({
      path: span.path,
      from: span.from,
      to: span.to,
      kind: span.kind,
      why: span.why,
    })),
  }
}

export interface FileIndexEntry {
  path: string
  /** จำนวนช่วงของไฟล์นี้ในรายการ */
  count: number
  /** ลำดับของช่วงแรกของไฟล์นี้ — ใช้กระโดด */
  firstSpan: number
}

/**
 * ดัชนีไฟล์ที่ปักหมุดไว้หัว panel (user story 17)
 * เรียงตาม "เจอครั้งแรกที่ไหน" ไม่ใช่เรียงตามชื่อ — ต้องตรงกับลำดับที่อ่านจริง
 */
export function fileIndex(spans: PanelSpan[]): FileIndexEntry[] {
  const byPath = new Map<string, FileIndexEntry>()
  spans.forEach((span, i) => {
    const found = byPath.get(span.path)
    if (found) found.count += 1
    else byPath.set(span.path, { path: span.path, count: 1, firstSpan: i })
  })
  return [...byPath.values()]
}

/** `services/dobybot/etax/utils/x.py` → `x.py` (หัวข้อในดัชนีไฟล์) */
export function baseName(path: string): string {
  const parts = path.split('/')
  return parts[parts.length - 1] || path
}
