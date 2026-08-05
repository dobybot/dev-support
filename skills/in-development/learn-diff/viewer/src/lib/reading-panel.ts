import type { RunData } from '@/shared/types'

/**
 * ตรรกะล้วนของ reading-list panel — ไม่มี React, ไม่มี DOM (เทสต์อยู่ที่ test/reading-panel.test.ts)
 *
 * reading list คือของชิ้นเดียวที่ diff viewer ให้ไม่ได้: ลำดับการอ่านที่ "คนที่เพิ่งอ่านทั้ง change"
 * เลือกมาให้ รวมถึงโค้ดที่ PR **ไม่ได้แตะ** · panel จึงเรียงตามลำดับที่ agent เขียน
 * ไม่ใช่เรียงตามไฟล์/เลขบรรทัด (SPEC-v3 → user story 15)
 */

/** สิ่งที่ panel เปิดได้ · `file` = ชื่อไฟล์ในเนื้อความที่ไม่มี id ของตัวเอง */
export type PanelTarget =
  | { kind: 'list'; listId: string }
  | { kind: 'file'; path: string; from: number | null; to: number | null }

/** ช่วงโค้ดหนึ่งก้อนในรูปที่ panel ใช้ — `null` = ทั้งไฟล์ */
export interface PanelSpan {
  path: string
  from: number | null
  to: number | null
  kind: 'changed' | 'context'
  why: string
}

export function targetKey(target: PanelTarget): string {
  return target.kind === 'list'
    ? `list:${target.listId}`
    : `file:${target.path}:${target.from ?? ''}-${target.to ?? ''}`
}

/* ── ประวัติการเปิด ─────────────────────────────────────────────────────────
   เปิดได้ทีละรายการเดียว + ย้อนกลับได้ (SPEC-v3 → Viewer UI)
   tab หรือ panel ซ้อนกันถูกปฏิเสธไว้แล้ว: กองรายการที่เปิดค้างแข่งกับลำดับที่ agent เลือกมา */

export interface PanelHistory {
  entries: PanelTarget[]
  /** -1 = ยังไม่เคยเปิดอะไรเลย */
  index: number
}

export const EMPTY_HISTORY: PanelHistory = { entries: [], index: -1 }

/** กันประวัติโตไม่จำกัดในการอ่านยาว ๆ — ตัวเก่าสุดหลุดออกทางหัว */
export const MAX_HISTORY = 50

export function currentTarget(history: PanelHistory): PanelTarget | null {
  return history.entries[history.index] ?? null
}

/**
 * เปิดรายการใหม่ = แทนที่ของเดิม แล้วตัดประวัติฝั่งหน้าทิ้ง (เหมือน history ของ browser)
 * เปิดอันเดิมซ้ำไม่นับเป็นก้าวใหม่ ไม่งั้นกดปุ่มเดิมสองครั้งแล้ว "ย้อนกลับ" จะไม่ขยับ
 */
export function pushTarget(history: PanelHistory, target: PanelTarget): PanelHistory {
  const current = currentTarget(history)
  if (current && targetKey(current) === targetKey(target)) return history
  const kept = history.entries.slice(0, history.index + 1)
  const entries = [...kept, target].slice(-MAX_HISTORY)
  return { entries, index: entries.length - 1 }
}

export function canGoBack(history: PanelHistory): boolean {
  return history.index > 0
}

export function canGoForward(history: PanelHistory): boolean {
  return history.index >= 0 && history.index < history.entries.length - 1
}

export function goBack(history: PanelHistory): PanelHistory {
  return canGoBack(history) ? { ...history, index: history.index - 1 } : history
}

export function goForward(history: PanelHistory): PanelHistory {
  return canGoForward(history) ? { ...history, index: history.index + 1 } : history
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

export function readStoredWidth(store: WidthStore | null, viewportWidth: number): number {
  let raw: string | null = null
  try {
    raw = store?.getItem(PANEL_WIDTH_KEY) ?? null
  } catch {
    raw = null
  }
  const parsed = raw === null ? Number.NaN : Number(raw)
  return clampPanelWidth(Number.isFinite(parsed) ? parsed : DEFAULT_PANEL_WIDTH, viewportWidth)
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

export function resolveTarget(data: RunData, target: PanelTarget): ResolvedList {
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
