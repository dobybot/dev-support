import { describe, expect, it } from 'vitest'

import {
  DEFAULT_PANEL_WIDTH,
  EMPTY_HISTORY,
  MAX_HISTORY,
  MIN_PANEL_WIDTH,
  PANEL_WIDTH_KEY,
  baseName,
  canGoBack,
  canGoForward,
  clampPanelWidth,
  currentTarget,
  fileIndex,
  goBack,
  goForward,
  pushTarget,
  readStoredWidth,
  resolveTarget,
  targetKey,
  writeStoredWidth,
  type PanelHistory,
  type PanelSpan,
  type PanelTarget,
  type WidthStore,
} from '../src/lib/reading-panel'
import type { RunData } from '../src/shared/types'

/**
 * เทสต์ระดับ component / การลาก panel ไม่อยู่ในแผน (SPEC-v3 → Testing Decisions)
 * ที่เทสต์ได้จริงคือกฎล้วน ๆ ที่ panel ใช้ตัดสินใจ — ลำดับ, ประวัติ, ดัชนีไฟล์, ขอบเขตความกว้าง
 */

const list: PanelTarget = { kind: 'list', listId: 'rl-a' }
const other: PanelTarget = { kind: 'list', listId: 'rl-b' }
const third: PanelTarget = { kind: 'list', listId: 'rl-c' }

function history(...targets: PanelTarget[]): PanelHistory {
  return targets.reduce(pushTarget, EMPTY_HISTORY)
}

describe('targetKey', () => {
  it('แยก reading list ออกจากกันด้วย id', () => {
    expect(targetKey(list)).not.toBe(targetKey(other))
  })

  it('ไฟล์เดียวกันคนละช่วง = คนละเป้าหมาย', () => {
    const a: PanelTarget = { kind: 'file', path: 'a.py', from: 1, to: 10 }
    const b: PanelTarget = { kind: 'file', path: 'a.py', from: 11, to: 20 }
    const whole: PanelTarget = { kind: 'file', path: 'a.py', from: null, to: null }
    expect(new Set([targetKey(a), targetKey(b), targetKey(whole)]).size).toBe(3)
  })
})

describe('ประวัติของ panel', () => {
  it('เริ่มต้นว่าง = ไม่มีอะไรเปิดอยู่ และย้อนไม่ได้ทั้งสองทาง', () => {
    expect(currentTarget(EMPTY_HISTORY)).toBeNull()
    expect(canGoBack(EMPTY_HISTORY)).toBe(false)
    expect(canGoForward(EMPTY_HISTORY)).toBe(false)
  })

  it('เปิดรายการที่สองแทนที่รายการแรก แล้วย้อนกลับได้', () => {
    const h = history(list, other)
    expect(currentTarget(h)).toEqual(other)
    expect(canGoBack(h)).toBe(true)

    const back = goBack(h)
    expect(currentTarget(back)).toEqual(list)
    expect(canGoForward(back)).toBe(true)
    expect(currentTarget(goForward(back))).toEqual(other)
  })

  it('เปิดอันเดิมซ้ำไม่นับเป็นก้าวใหม่', () => {
    const h = history(list, list, list)
    expect(h.entries).toHaveLength(1)
    expect(canGoBack(h)).toBe(false)
  })

  it('ย้อนกลับแล้วเปิดอันใหม่ = ตัดประวัติฝั่งหน้าทิ้ง', () => {
    const h = goBack(history(list, other))
    const next = pushTarget(h, third)
    expect(next.entries.map((t) => targetKey(t))).toEqual([targetKey(list), targetKey(third)])
    expect(canGoForward(next)).toBe(false)
  })

  it('ย้อนเกินปลายทั้งสองข้างไม่ทำให้สถานะเพี้ยน', () => {
    const h = history(list)
    expect(goBack(h)).toBe(h)
    expect(goForward(h)).toBe(h)
  })

  it('ประวัติไม่โตเกิน MAX_HISTORY และตัวล่าสุดยังอยู่ท้ายเสมอ', () => {
    let h = EMPTY_HISTORY
    for (let i = 0; i < MAX_HISTORY + 10; i++) h = pushTarget(h, { kind: 'list', listId: `rl-${i}` })
    expect(h.entries).toHaveLength(MAX_HISTORY)
    expect(currentTarget(h)).toEqual({ kind: 'list', listId: `rl-${MAX_HISTORY + 9}` })
  })
})

describe('ความกว้างของ panel', () => {
  it('ไม่แคบกว่าขั้นต่ำ และเหลือที่ให้เนื้อหาเสมอ', () => {
    expect(clampPanelWidth(50, 1600)).toBe(MIN_PANEL_WIDTH)
    expect(clampPanelWidth(5000, 1600)).toBe(1600 - 520)
    expect(clampPanelWidth(600, 1600)).toBe(600)
  })

  it('จอแคบกว่าที่ควรจะเป็นก็ยังคืนค่าที่ใช้ได้ ไม่ใช่ค่าติดลบ', () => {
    expect(clampPanelWidth(800, 600)).toBe(MIN_PANEL_WIDTH)
  })

  it('อ่านค่าดิบที่จำไว้ข้าม session — ไม่ clamp ตอนอ่าน (issue #18)', () => {
    const store = new Map<string, string>([[PANEL_WIDTH_KEY, '720']])
    const fake: WidthStore = {
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => void store.set(k, v),
    }
    // คืนค่าดิบเสมอ แม้จอปัจจุบันแคบ — จอกว้างขึ้นทีหลังต้องได้ค่าเดิมคืน
    expect(readStoredWidth(fake)).toBe(720)

    writeStoredWidth(fake, 640)
    expect(store.get(PANEL_WIDTH_KEY)).toBe('640')
  })

  it('เปิดในจอแคบไม่กินค่าที่จำไว้ — clamp ที่ตอนแสดงผลตามจอขณะนั้น (issue #18)', () => {
    const store = new Map<string, string>([[PANEL_WIDTH_KEY, '760']])
    const fake: WidthStore = {
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => void store.set(k, v),
    }
    const stored = readStoredWidth(fake)
    expect(stored).toBe(760)
    expect(clampPanelWidth(stored, 800)).toBe(MIN_PANEL_WIDTH)
    expect(clampPanelWidth(stored, 1500)).toBe(760)
  })

  it('ไม่เคยจำไว้ / ค่าเสีย = ค่าเริ่มต้น', () => {
    const empty: WidthStore = { getItem: () => null, setItem: () => {} }
    const junk: WidthStore = { getItem: () => 'ไม่ใช่ตัวเลข', setItem: () => {} }
    expect(readStoredWidth(empty)).toBe(DEFAULT_PANEL_WIDTH)
    expect(readStoredWidth(junk)).toBe(DEFAULT_PANEL_WIDTH)
    expect(readStoredWidth(null)).toBe(DEFAULT_PANEL_WIDTH)
  })

  it('storage ที่ throw (โหมดส่วนตัว) ไม่ทำให้พัง', () => {
    const hostile: WidthStore = {
      getItem: () => {
        throw new Error('nope')
      },
      setItem: () => {
        throw new Error('nope')
      },
    }
    expect(readStoredWidth(hostile)).toBe(DEFAULT_PANEL_WIDTH)
    expect(() => writeStoredWidth(hostile, 500)).not.toThrow()
  })
})

const runData: RunData = {
  schemaVersion: 1,
  id: 'demo',
  title: 'demo',
  pr: { number: 1, title: 'demo' },
  commit: 'a'.repeat(40),
  generatedAt: '2026-08-04T00:00:00.000Z',
  sections: [{ id: 'index', title: 'ภาพรวม' }],
  readingLists: [
    {
      id: 'rl-a',
      title: 'ตามเส้นทางของ request',
      spans: [
        { path: 'b/second.py', from: 10, to: 20, kind: 'changed', why: 'จุดที่เปลี่ยนพฤติกรรม' },
        { path: 'a/first.py', from: 1, to: 5, kind: 'context', why: 'ของเดิมที่ต้องรู้ก่อน' },
        { path: 'b/second.py', from: 90, to: 99, kind: 'changed', why: 'ปลายทาง' },
      ],
    },
  ],
}

describe('resolveTarget', () => {
  it('คืนช่วงตามลำดับที่ agent เขียน ไม่ใช่เรียงตามไฟล์/เลขบรรทัด', () => {
    const resolved = resolveTarget(runData, { kind: 'list', listId: 'rl-a' })
    expect(resolved.title).toBe('ตามเส้นทางของ request')
    expect(resolved.spans.map((s) => `${s.path}:${s.from}`)).toEqual([
      'b/second.py:10',
      'a/first.py:1',
      'b/second.py:90',
    ])
    expect(resolved.spans.map((s) => s.kind)).toEqual(['changed', 'context', 'changed'])
    expect(resolved.spans.every((s) => s.why !== '')).toBe(true)
  })

  it('id ที่ไม่มีอยู่จริงต้องบอกให้เห็น ไม่ใช่เงียบ', () => {
    const resolved = resolveTarget(runData, { kind: 'list', listId: 'rl-หาย' })
    expect(resolved.missingListId).toBe('rl-หาย')
    expect(resolved.spans).toEqual([])
  })

  it('ไฟล์ที่อ้างในเนื้อความกลายเป็นช่วงเดี่ยว ๆ ที่ใช้ตัวแสดงเดียวกัน', () => {
    const resolved = resolveTarget(runData, { kind: 'file', path: 'a/first.py', from: 3, to: 9 })
    expect(resolved.spans).toHaveLength(1)
    expect(resolved.spans[0]).toMatchObject({ path: 'a/first.py', from: 3, to: 9, kind: 'context' })
    expect(resolved.title).toContain('a/first.py')
  })

  it('ไฟล์ทั้งไฟล์ = ไม่มีช่วง', () => {
    const resolved = resolveTarget(runData, { kind: 'file', path: 'a/first.py', from: null, to: null })
    expect(resolved.spans[0]).toMatchObject({ from: null, to: null })
  })
})

describe('ดัชนีไฟล์ที่ปักหมุด', () => {
  const spans: PanelSpan[] = resolveTarget(runData, { kind: 'list', listId: 'rl-a' }).spans

  it('เรียงตามที่เจอครั้งแรก และรวมช่วงของไฟล์เดียวกันเข้าด้วยกัน', () => {
    expect(fileIndex(spans)).toEqual([
      { path: 'b/second.py', count: 2, firstSpan: 0 },
      { path: 'a/first.py', count: 1, firstSpan: 1 },
    ])
  })

  it('รายการว่างก็ไม่พัง', () => {
    expect(fileIndex([])).toEqual([])
  })

  it('ชื่อสั้นที่โชว์บนหมุดคือชื่อไฟล์', () => {
    expect(baseName('services/dobybot/etax/utils/x.py')).toBe('x.py')
    expect(baseName('x.py')).toBe('x.py')
  })
})
