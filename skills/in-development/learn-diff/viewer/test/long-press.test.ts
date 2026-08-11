import { describe, expect, it } from 'vitest'

import {
  LONG_PRESS,
  LONG_PRESS_IDLE,
  longPressReduce,
  type LongPressEvent,
  type LongPressState,
} from '../src/lib/code/long-press'

/**
 * state machine ของการกดค้างในกล่องโค้ด (#43) — ทดสอบเฉพาะ external behavior ของฟังก์ชันล้วน
 * ตาม Testing Decisions ของสเปก · การผูก pointer event เข้ากับ CodeMirror จริงตรวจด้วยมือ
 *
 * สิ่งที่เทสต์ชุดนี้ล็อกไว้คือ "การยกเลิกต้องง่ายกว่าการติด" — ทางเดินปกติ (แตะ, ลากเลือกข้อความ,
 * หนีบซูม) ต้องไม่ทำให้เมนูเด้ง
 */

const T0 = 1_000_000

/** เดินหลายเหตุการณ์ติดกัน แล้วคืนสถานะสุดท้าย + จุดที่เมนูถูกสั่งเปิด (ถ้ามี) */
function run(events: LongPressEvent[], from: LongPressState = LONG_PRESS_IDLE) {
  let state = from
  const fires: { x: number; y: number }[] = []
  for (const event of events) {
    const result = longPressReduce(state, event)
    state = result.state
    if (result.fire) fires.push(result.fire)
  }
  return { state, fires }
}

const down = (x = 100, y = 200, at = T0, pointerId = 1): LongPressEvent => ({
  kind: 'down',
  pointerId,
  x,
  y,
  at,
})
const tick = (at: number): LongPressEvent => ({ kind: 'tick', at })

describe('กดค้างจนติด', () => {
  it('ค้างครบเวลาโดยไม่ขยับ = เปิดเมนูที่จุดที่เริ่มกด', () => {
    const { state, fires } = run([down(120, 240), tick(T0 + LONG_PRESS.delayMs)])
    expect(state.status).toBe('fired')
    expect(fires).toEqual([{ x: 120, y: 240 }])
  })

  it('ขยับนิดเดียว (นิ้วสั่น) ยังติด และเมนูยังเปิดที่จุดเริ่มกด ไม่ใช่จุดที่ดริฟต์ไป', () => {
    const { fires } = run([
      down(100, 200),
      { kind: 'move', pointerId: 1, x: 104, y: 203 },
      tick(T0 + 600),
    ])
    expect(fires).toEqual([{ x: 100, y: 200 }])
  })

  it('เปิดได้ครั้งเดียวต่อการกดหนึ่งครั้ง (tick ซ้ำไม่เปิดซ้ำ)', () => {
    const { fires } = run([down(), tick(T0 + 500), tick(T0 + 900)])
    expect(fires).toHaveLength(1)
  })

  it('ปล่อยนิ้วหลังเมนูเปิดแล้วกลับสู่สถานะว่าง ไม่ยกเลิกเมนู', () => {
    const { state, fires } = run([down(), tick(T0 + 500), { kind: 'up', pointerId: 1 }])
    expect(fires).toHaveLength(1)
    expect(state).toEqual(LONG_PRESS_IDLE)
  })
})

describe('การยกเลิก', () => {
  it('ปล่อยก่อนครบเวลา = ไม่ติด (ปล่อยให้เป็นการแตะ/คลิกตามปกติ)', () => {
    const { state, fires } = run([down(), { kind: 'up', pointerId: 1 }, tick(T0 + 900)])
    expect(fires).toEqual([])
    expect(state).toEqual(LONG_PRESS_IDLE)
  })

  it('ขยับเกินระยะ = ยกเลิก แม้จะค้างครบเวลาทีหลัง (คือการลากเลือกข้อความ)', () => {
    const { state, fires } = run([
      down(100, 200),
      { kind: 'move', pointerId: 1, x: 100, y: 240 },
      tick(T0 + 900),
    ])
    expect(state.status).toBe('cancelled')
    expect(fires).toEqual([])
  })

  it('ลากช้า ๆ ทีละนิดก็ยังยกเลิก — วัดจากจุดที่เริ่มกดเสมอ', () => {
    const drift: LongPressEvent[] = [3, 6, 9, 12].map((d) => ({
      kind: 'move',
      pointerId: 1,
      x: 100 + d,
      y: 200,
    }))
    const { state, fires } = run([down(100, 200), ...drift, tick(T0 + 900)])
    expect(state.status).toBe('cancelled')
    expect(fires).toEqual([])
  })

  it('นิ้วที่สองลงมา (กำลังจะหนีบซูม) = ยกเลิก', () => {
    const { state, fires } = run([down(100, 200), down(160, 260, T0 + 80, 2), tick(T0 + 900)])
    expect(state.status).toBe('cancelled')
    expect(fires).toEqual([])
  })

  it('pointercancel (ระบบยึด gesture ไปทำ scroll) = ยกเลิก', () => {
    const { state, fires } = run([down(), { kind: 'cancel', pointerId: 1 }, tick(T0 + 900)])
    expect(state).toEqual(LONG_PRESS_IDLE)
    expect(fires).toEqual([])
  })

  it('นาฬิกาเดินยังไม่ครบ = ยังไม่ติด แต่ยังรออยู่', () => {
    const { state, fires } = run([down(), tick(T0 + LONG_PRESS.delayMs - 1)])
    expect(state.status).toBe('pressing')
    expect(fires).toEqual([])
  })

  it('เหตุการณ์ของนิ้วอื่นไม่ทำให้การกดที่จับตาอยู่เพี้ยน', () => {
    const { state, fires } = run([
      down(100, 200),
      { kind: 'move', pointerId: 9, x: 999, y: 999 },
      { kind: 'up', pointerId: 9 },
      tick(T0 + 600),
    ])
    expect(state.status).toBe('fired')
    expect(fires).toEqual([{ x: 100, y: 200 }])
  })
})

describe('เริ่มใหม่หลังจบรอบ', () => {
  it('กดใหม่หลังยกเลิกด้วยการขยับ ยังติดได้ตามปกติ', () => {
    const first = run([down(100, 200), { kind: 'move', pointerId: 1, x: 100, y: 300 }])
    expect(first.state.status).toBe('cancelled')
    const second = run([down(10, 20, T0 + 5000), tick(T0 + 5600)], first.state)
    expect(second.fires).toEqual([{ x: 10, y: 20 }])
  })

  it('เวลาของรอบใหม่นับจากการกดครั้งใหม่ ไม่ใช่ครั้งก่อน', () => {
    const first = run([down(100, 200, T0), { kind: 'up', pointerId: 1 }])
    const second = run([down(50, 50, T0 + 10_000), tick(T0 + 10_100)], first.state)
    expect(second.fires).toEqual([])
    expect(second.state.status).toBe('pressing')
  })

  it('ตั้งค่าเวลา/ระยะเองได้ (ค่ามาตรฐานไม่ใช่ของตายตัวใน logic)', () => {
    const config = { delayMs: 100, slopPx: 2 }
    const pressed = longPressReduce(LONG_PRESS_IDLE, down(0, 0), config).state
    const moved = longPressReduce(pressed, { kind: 'move', pointerId: 1, x: 3, y: 0 }, config)
    expect(moved.state.status).toBe('cancelled')
    const fired = longPressReduce(pressed, tick(T0 + 100), config)
    expect(fired.fire).toEqual({ x: 0, y: 0 })
  })
})
