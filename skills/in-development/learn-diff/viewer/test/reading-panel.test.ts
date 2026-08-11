import { describe, expect, it } from 'vitest'

import {
  DEFAULT_PANEL_WIDTH,
  EMPTY_HISTORY,
  MAX_HISTORY,
  MIN_PANEL_WIDTH,
  PANEL_WIDTH_KEY,
  backGoesToReferences,
  baseName,
  canGoBack,
  canGoForward,
  clampPanelWidth,
  currentScrollTop,
  currentTarget,
  fileIndex,
  goBack,
  goBackToReading,
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
    expect(next.entries.map((e) => targetKey(e.target))).toEqual([targetKey(list), targetKey(third)])
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

describe('targetKey ของ target ชนิด references และ file ที่มี focusLine (CONTRACT-f12 §4.1)', () => {
  it('references ที่ตำแหน่ง cursor เดียวกันเป๊ะคือ target เดียวกัน', () => {
    const a: PanelTarget = { kind: 'references', path: 'a.ts', line: 10, col: 5, symbol: 'foo' }
    const b: PanelTarget = { kind: 'references', path: 'a.ts', line: 10, col: 5, symbol: 'foo' }
    expect(targetKey(a)).toBe(targetKey(b))
  })

  // adjudication finding 4: ตำแหน่งเดิมแต่ symbol เปลี่ยน (ไฟล์ถูก reindex/คนละ commit) = คนละก้าว
  it('references ตำแหน่งเดียวกันแต่คนละ symbol คือคนละ target', () => {
    const a: PanelTarget = { kind: 'references', path: 'a.ts', line: 10, col: 5, symbol: 'foo' }
    const b: PanelTarget = { kind: 'references', path: 'a.ts', line: 10, col: 5, symbol: 'bar' }
    expect(targetKey(a)).not.toBe(targetKey(b))
  })

  it('references คนละตำแหน่งคือคนละ target', () => {
    const a: PanelTarget = { kind: 'references', path: 'a.ts', line: 10, col: 5, symbol: 'foo' }
    const b: PanelTarget = { kind: 'references', path: 'a.ts', line: 20, col: 5, symbol: 'foo' }
    expect(targetKey(a)).not.toBe(targetKey(b))
  })

  it('ไฟล์เดียวกัน ช่วงเดียวกัน แต่ focusLine ต่างกัน = คนละ target (กระโดดมาจากคนละ reference)', () => {
    const a: PanelTarget = { kind: 'file', path: 'a.ts', from: null, to: null, focusLine: 5 }
    const b: PanelTarget = { kind: 'file', path: 'a.ts', from: null, to: null, focusLine: 9 }
    expect(targetKey(a)).not.toBe(targetKey(b))
  })
})

describe('uncovered target (SPEC-reading-checklist story 12) — คนละ hunk = คนละก้าว', () => {
  it('กด "เปิดอ่าน" ของคนละ hunk ต้องไม่ถูกยุบเป็นก้าวเดียว (ไม่งั้นเป็นคลิกตาย)', () => {
    const first: PanelTarget = { kind: 'uncovered', hash: 'aaaaaaaa' }
    const second: PanelTarget = { kind: 'uncovered', hash: 'bbbbbbbb' }
    expect(targetKey(first)).not.toBe(targetKey(second))

    const history = pushTarget(pushTarget(EMPTY_HISTORY, first), second)
    expect(history.entries.map((e) => targetKey(e.target))).toEqual([targetKey(first), targetKey(second)])
    expect(currentTarget(history)).toEqual(second)
  })

  it('hunk เดิมซ้ำ = ก้าวเดิม · ไม่ระบุ hunk (เปิดทั้งรายการ) ก็ยังเป็น target ของตัวเอง', () => {
    const same: PanelTarget = { kind: 'uncovered', hash: 'aaaaaaaa' }
    expect(pushTarget(pushTarget(EMPTY_HISTORY, same), { ...same }).entries).toHaveLength(1)
    expect(targetKey({ kind: 'uncovered' })).not.toBe(targetKey(same))
  })
})

describe('ปุ่มกลับสองชั้น (CONTRACT-f12 §4.1)', () => {
  const reading: PanelTarget = { kind: 'file', path: 'reading.ts', from: 1, to: 10 }
  const refsTarget: PanelTarget = { kind: 'references', path: 'reading.ts', line: 3, col: 4, symbol: 'foo' }
  const jump1: PanelTarget = { kind: 'file', path: 'caller1.ts', from: null, to: null, focusLine: 5 }
  const jump2: PanelTarget = { kind: 'file', path: 'caller2.ts', from: null, to: null, focusLine: 9 }

  it('backGoesToReferences: true เมื่อ entry ก่อนหน้าคือ references', () => {
    const h = history(reading, refsTarget, jump1)
    expect(backGoesToReferences(h)).toBe(true)
  })

  it('backGoesToReferences: false เมื่อ entry ก่อนหน้าไม่ใช่ references', () => {
    const h = history(reading, jump1)
    expect(backGoesToReferences(h)).toBe(false)
  })

  it('goBackToReading ข้าม references และ file ที่มี focusLine ทีเดียว กลับไปที่อ่านค้างไว้', () => {
    const h = history(reading, refsTarget, jump1, jump2)
    const back = goBackToReading(h)
    expect(currentTarget(back)).toEqual(reading)
  })

  it('ไม่มีที่อ่านค้างไว้ก่อนหน้า = ไม่ทำอะไร (เดิมอยู่ที่เดิม)', () => {
    const h = history(refsTarget, jump1)
    expect(goBackToReading(h)).toBe(h)
  })

  it('เปิดจุดกระโดดตรง ๆ โดยไม่มี reading ก่อนหน้าเลย = ไม่มีที่กลับ', () => {
    const h = history(jump1)
    expect(goBackToReading(h)).toBe(h)
  })
})

describe('scroll restore ต่อ entry (CONTRACT-f12 §4.1)', () => {
  const a: PanelTarget = { kind: 'list', listId: 'rl-a' }
  const b: PanelTarget = { kind: 'list', listId: 'rl-b' }

  it('entry ใหม่เอี่ยมเริ่มที่ 0', () => {
    const h = pushTarget(EMPTY_HISTORY, a)
    expect(currentScrollTop(h)).toBe(0)
  })

  it('openTarget บันทึก scrollTop ของ entry ที่กำลังจะออกจากมันไว้ก่อน push', () => {
    let h = pushTarget(EMPTY_HISTORY, a)
    h = pushTarget(h, b, 240)
    const back = goBack(h)
    expect(currentTarget(back)).toEqual(a)
    expect(currentScrollTop(back)).toBe(240)
  })

  it('goForward ก็คืน scrollTop ที่จำไว้ของ entry นั้นเหมือนกัน', () => {
    let h = pushTarget(EMPTY_HISTORY, a)
    h = pushTarget(h, b, 240)
    const back = goBack(h)
    const forward = goForward(back)
    expect(currentTarget(forward)).toEqual(b)
    // entry b ยังไม่เคยถูกออกจากมันเลย (ยังไม่ push ทับ) — ยังเป็น 0
    expect(currentScrollTop(forward)).toBe(0)
  })

  it('history ว่างคือ scrollTop 0', () => {
    expect(currentScrollTop(EMPTY_HISTORY)).toBe(0)
  })

  // adjudication finding 2: back แล้ว forward (โดยไม่ push) ต้องไม่ทำตำแหน่ง scroll หาย
  it('goBack บันทึก scroll ของ entry ที่กำลังออก — forward กลับมาแล้วได้ตำแหน่งเดิม', () => {
    let h = pushTarget(EMPTY_HISTORY, a)
    h = pushTarget(h, b, 500) // ออกจาก a ที่ 500
    const back = goBack(h, 320) // ออกจาก b ที่ 320
    expect(currentTarget(back)).toEqual(a)
    expect(currentScrollTop(back)).toBe(500)
    const forward = goForward(back, 700) // ผู้อ่านเลื่อน a ต่อเป็น 700 แล้วค่อย forward
    expect(currentTarget(forward)).toEqual(b)
    expect(currentScrollTop(forward)).toBe(320)
    const backAgain = goBack(forward)
    expect(currentScrollTop(backAgain)).toBe(700)
  })

  it('goBackToReading ก็บันทึก scroll ของ entry ที่กำลังออกเช่นกัน', () => {
    const reading: PanelTarget = { kind: 'file', path: 'reading.ts', from: 1, to: 10 }
    const refsTarget: PanelTarget = { kind: 'references', path: 'reading.ts', line: 3, col: 4, symbol: 'foo' }
    let h = pushTarget(EMPTY_HISTORY, reading)
    h = pushTarget(h, refsTarget, 150)
    const back = goBackToReading(h, 640)
    expect(currentTarget(back)).toEqual(reading)
    expect(currentScrollTop(back)).toBe(150)
    // เดินหน้ากลับไปที่ references ต้องได้ 640 ที่เพิ่งบันทึก ไม่ใช่ 0
    expect(currentScrollTop(goForward(back))).toBe(640)
  })

  it('goBack/goForward/goBackToReading ที่ขยับไม่ได้ ยังคืน object เดิมเป๊ะ (identity ใช้ตัดสินปุ่ม)', () => {
    const h = pushTarget(EMPTY_HISTORY, a)
    expect(goBack(h, 123)).toBe(h)
    expect(goForward(h, 123)).toBe(h)
    expect(goBackToReading(h, 123)).toBe(h)
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
