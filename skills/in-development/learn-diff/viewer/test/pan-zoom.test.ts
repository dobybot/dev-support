import { describe, expect, it } from 'vitest'

import {
  IDENTITY_VIEWPORT,
  MAX_SCALE,
  MIN_SCALE,
  clampScale,
  contentOrigin,
  contentPointAt,
  isIdentityViewport,
  midpoint,
  movedBeyond,
  panBy,
  pinchViewport,
  screenPointOf,
  viewportTransform,
  zoomAt,
  type Point,
  type Viewport,
} from '../src/lib/pan-zoom'

/**
 * คณิตของการเลื่อน/ซูมไดอะแกรม (#40) — ทดสอบเฉพาะ external behavior ของฟังก์ชันล้วน
 * ตาม Testing Decisions ของสเปก · การผูก pointer event จริงกับ DOM ตรวจด้วยมือบนมือถือ
 */

const near = (a: number, b: number) => expect(a).toBeCloseTo(b, 6)
const nearPoint = (a: Point, b: Point) => {
  near(a.x, b.x)
  near(a.y, b.y)
}

describe('เลื่อนภาพ', () => {
  it('ระยะเลื่อนสะสมทีละครั้ง และไม่แตะ scale', () => {
    const once = panBy(IDENTITY_VIEWPORT, 30, -10)
    const twice = panBy(once, -5, 40)
    expect(twice).toEqual({ scale: 1, x: 25, y: 30 })
  })

  it('เลื่อนแล้วจุดในเนื้อหาขยับตามระยะที่เลื่อน (ไม่ขึ้นกับ scale)', () => {
    const zoomed: Viewport = { scale: 2, x: 0, y: 0 }
    const moved = panBy(zoomed, 15, 25)
    nearPoint(screenPointOf(moved, { x: 10, y: 10 }), {
      x: screenPointOf(zoomed, { x: 10, y: 10 }).x + 15,
      y: screenPointOf(zoomed, { x: 10, y: 10 }).y + 25,
    })
  })

  it('viewport เริ่มต้นคือ "ยังไม่ถูกแตะ" แต่ขยับนิดเดียวก็ไม่ใช่แล้ว', () => {
    expect(isIdentityViewport(IDENTITY_VIEWPORT)).toBe(true)
    expect(isIdentityViewport(panBy(IDENTITY_VIEWPORT, 1, 0))).toBe(false)
    expect(isIdentityViewport(zoomAt(IDENTITY_VIEWPORT, 1.25, { x: 0, y: 0 }))).toBe(false)
  })
})

describe('ซูมโดยตรึงจุด focus', () => {
  it('จุดใต้นิ้วอยู่ที่เดิมหลังซูมเข้า', () => {
    const start: Viewport = { scale: 1, x: 12, y: -8 }
    const focus = { x: 120, y: 90 }
    const content = contentPointAt(start, focus)
    const zoomed = zoomAt(start, 2, focus)
    expect(zoomed.scale).toBe(2)
    nearPoint(screenPointOf(zoomed, content), focus)
  })

  it('จุดใต้นิ้วอยู่ที่เดิมหลังซูมออกด้วย', () => {
    const start: Viewport = { scale: 2.5, x: -40, y: 60 }
    const focus = { x: 33, y: 210 }
    const content = contentPointAt(start, focus)
    nearPoint(screenPointOf(zoomAt(start, 0.5, focus), content), focus)
  })

  it('ซูมสองครั้งติดกันเท่ากับซูมทีเดียวด้วยผลคูณ (ถ้า focus จุดเดียวกัน)', () => {
    const start: Viewport = { scale: 1, x: 5, y: 5 }
    const focus = { x: 200, y: 100 }
    const twice = zoomAt(zoomAt(start, 1.25, focus), 1.6, focus)
    const once = zoomAt(start, 2, focus)
    near(twice.scale, once.scale)
    nearPoint(twice, once)
  })
})

describe('ขอบเขตการซูม', () => {
  it('clamp อยู่ในช่วงที่กำหนด', () => {
    expect(clampScale(100)).toBe(MAX_SCALE)
    expect(clampScale(0.001)).toBe(MIN_SCALE)
    expect(clampScale(1.5)).toBe(1.5)
    // ค่าพังจากการหารด้วยศูนย์ต้องไม่ทำให้ภาพหายไปเลย
    expect(clampScale(Number.NaN)).toBe(1)
    expect(clampScale(Number.POSITIVE_INFINITY)).toBe(MAX_SCALE)
  })

  it('ซูมทะลุขอบบนแล้วหยุดที่ขอบ และจุด focus ยังไม่ขยับ', () => {
    const start: Viewport = { scale: 3, x: 10, y: 10 }
    const focus = { x: 80, y: 40 }
    const content = contentPointAt(start, focus)
    const zoomed = zoomAt(start, 10, focus)
    expect(zoomed.scale).toBe(MAX_SCALE)
    nearPoint(screenPointOf(zoomed, content), focus)
  })

  it('ซูมทะลุขอบล่างแล้วหยุดที่ขอบ และจุด focus ยังไม่ขยับ', () => {
    const start: Viewport = { scale: 0.5, x: -20, y: 5 }
    const focus = { x: 150, y: 150 }
    const content = contentPointAt(start, focus)
    const zoomed = zoomAt(start, 0.01, focus)
    expect(zoomed.scale).toBe(MIN_SCALE)
    nearPoint(screenPointOf(zoomed, content), focus)
  })

  it('factor ที่ไม่ใช่ตัวเลขบวกถือว่าไม่ซูม', () => {
    const start: Viewport = { scale: 1.5, x: 3, y: 4 }
    expect(zoomAt(start, 0, { x: 10, y: 10 })).toEqual(start)
    expect(zoomAt(start, Number.NaN, { x: 10, y: 10 })).toEqual(start)
  })
})

describe('หนีบสองนิ้ว', () => {
  it('scale มาจากอัตราส่วนระยะสองนิ้ว', () => {
    const from: [Point, Point] = [
      { x: 100, y: 100 },
      { x: 200, y: 100 },
    ]
    const to: [Point, Point] = [
      { x: 50, y: 100 },
      { x: 250, y: 100 },
    ]
    expect(pinchViewport(IDENTITY_VIEWPORT, from, to).scale).toBeCloseTo(2, 6)
  })

  it('จุดกึ่งกลางของสองนิ้วตรึงเนื้อหาไว้ที่เดิมเมื่อไม่ได้เลื่อนมือ', () => {
    const start: Viewport = { scale: 1, x: 0, y: 0 }
    const from: [Point, Point] = [
      { x: 100, y: 60 },
      { x: 200, y: 140 },
    ]
    const center = midpoint(from[0], from[1])
    const content = contentPointAt(start, center)
    // แยกนิ้วออกจากกันโดยจุดกึ่งกลางอยู่ที่เดิม
    const to: [Point, Point] = [
      { x: 50, y: 20 },
      { x: 250, y: 180 },
    ]
    const pinched = pinchViewport(start, from, to)
    expect(pinched.scale).toBeCloseTo(2, 6)
    nearPoint(screenPointOf(pinched, content), center)
  })

  it('เลื่อนสองนิ้วโดยไม่เปลี่ยนระยะ = เลื่อนภาพเฉย ๆ', () => {
    const start: Viewport = { scale: 1.5, x: 7, y: -3 }
    const from: [Point, Point] = [
      { x: 100, y: 100 },
      { x: 160, y: 100 },
    ]
    const to: [Point, Point] = [
      { x: 130, y: 180 },
      { x: 190, y: 180 },
    ]
    const pinched = pinchViewport(start, from, to)
    expect(pinched.scale).toBeCloseTo(1.5, 6)
    nearPoint(pinched, { x: start.x + 30, y: start.y + 80 })
  })

  it('หนีบพร้อมเลื่อน: จุดกึ่งกลางเนื้อหาเดิมไปอยู่ใต้จุดกึ่งกลางใหม่ของสองนิ้ว', () => {
    const start: Viewport = { scale: 1, x: 0, y: 0 }
    const from: [Point, Point] = [
      { x: 100, y: 100 },
      { x: 200, y: 100 },
    ]
    const to: [Point, Point] = [
      { x: 130, y: 60 },
      { x: 330, y: 60 },
    ]
    const content = contentPointAt(start, midpoint(from[0], from[1]))
    const pinched = pinchViewport(start, from, to)
    nearPoint(screenPointOf(pinched, content), midpoint(to[0], to[1]))
  })

  it('สองนิ้วทับกันสนิทตอนเริ่ม = ยังไม่ซูม (ไม่ระเบิดเป็นอนันต์)', () => {
    const same: [Point, Point] = [
      { x: 50, y: 50 },
      { x: 50, y: 50 },
    ]
    const apart: [Point, Point] = [
      { x: 0, y: 0 },
      { x: 100, y: 100 },
    ]
    expect(pinchViewport(IDENTITY_VIEWPORT, same, apart).scale).toBe(1)
  })

  it('คิดจาก viewport ตอนเริ่มหนีบเสมอ — ส่งเฟรมเดิมซ้ำได้ผลเท่าเดิม', () => {
    const start: Viewport = { scale: 1, x: 0, y: 0 }
    const from: [Point, Point] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ]
    const to: [Point, Point] = [
      { x: 0, y: 0 },
      { x: 150, y: 0 },
    ]
    expect(pinchViewport(start, from, to)).toEqual(pinchViewport(start, from, to))
  })
})

describe('แยกแตะออกจากลาก', () => {
  it('ขยับไม่เกินระยะเผื่อนิ้วสั่นยังเป็นการแตะ', () => {
    expect(movedBeyond({ x: 0, y: 0 }, { x: 3, y: 3 })).toBe(false)
    expect(movedBeyond({ x: 10, y: 10 }, { x: 10, y: 10 })).toBe(false)
  })

  it('ขยับเกินระยะกลายเป็นการลาก', () => {
    expect(movedBeyond({ x: 0, y: 0 }, { x: 0, y: 12 })).toBe(true)
  })

  it('ตั้งระยะเองได้', () => {
    expect(movedBeyond({ x: 0, y: 0 }, { x: 0, y: 12 }, 20)).toBe(false)
  })
})

/**
 * กล่องจริงมี padding (`p-4` = 16px) จุดกำเนิดของเนื้อหาจึงไม่ใช่ขอบกล่อง — ถ้าตัวที่ผูก event
 * ส่งพิกัดที่วัดจากขอบกล่องเข้ามาตรง ๆ การซูมจะคลาดไป P·(1−r) ทุกครั้งโดยที่ pan ยังดูปกติดี
 * เทสต์ชุดนี้จำลองการต่อจริงทั้งเส้น (ขอบกล่อง → พิกัดของคณิต → ตำแหน่งบนจอ) ไม่ใช่แค่ invariant
 * ในระบบพิกัดของตัวเอง
 */
describe('จุดกำเนิดของเนื้อหาเทียบกับขอบกล่อง', () => {
  const PADDING = 16
  const frame = { left: 40, top: 100 }
  /** ตำแหน่งจริงของ `.ld-viewport-content` บนจอเมื่อ viewport เป็นค่า v (scale ไม่ขยับขอบซ้าย/บน) */
  const contentBox = (v: Viewport) => ({ left: frame.left + PADDING + v.x, top: frame.top + PADDING + v.y })
  /** พิกัดที่ตัวผูก event ควรส่งให้คณิต: ระยะจากขอบกล่อง หัก padding ที่วัดได้ออก */
  const viewPoint = (clientX: number, clientY: number, v: Viewport): Point => {
    const origin = contentOrigin(frame, contentBox(v), v)
    return { x: clientX - frame.left - origin.x, y: clientY - frame.top - origin.y }
  }
  /** ตำแหน่งจริงบนจอของจุดในเนื้อหา — ต้องบวก padding กลับเข้าไปเสมอ */
  const onScreen = (v: Viewport, content: Point): Point => {
    const s = screenPointOf(v, content)
    return { x: frame.left + PADDING + s.x, y: frame.top + PADDING + s.y }
  }

  it('วัด padding ของกล่องได้ ไม่ว่าภาพจะถูกเลื่อน/ซูมไปเท่าไร', () => {
    for (const v of [IDENTITY_VIEWPORT, { scale: 2.5, x: -80, y: 30 }, { scale: 0.5, x: 12, y: -60 }]) {
      nearPoint(contentOrigin(frame, contentBox(v), v), { x: PADDING, y: PADDING })
    }
  })

  it('ซูมแล้วจุดใต้นิ้ว *บนจอจริง* ไม่ขยับ (ไม่ใช่แค่ในระบบพิกัดของคณิตเอง)', () => {
    const start: Viewport = IDENTITY_VIEWPORT
    // เล็งมุมซ้ายบนของเนื้อหาพอดี — จุดที่เผยความคลาดของ padding ชัดที่สุด
    const finger = { x: frame.left + PADDING, y: frame.top + PADDING }
    const focus = viewPoint(finger.x, finger.y, start)
    const content = contentPointAt(start, focus)
    nearPoint(content, { x: 0, y: 0 })
    const zoomed = zoomAt(start, 2, focus)
    nearPoint(onScreen(zoomed, content), finger)
  })

  it('ซูมสุดเพดานจากจุดกลางกล่องก็ยังตรึงจุดนั้นบนจอ', () => {
    const start: Viewport = { scale: 1, x: 5, y: -7 }
    const finger = { x: frame.left + 260, y: frame.top + 180 }
    const focus = viewPoint(finger.x, finger.y, start)
    const content = contentPointAt(start, focus)
    const zoomed = zoomAt(start, 10, focus)
    expect(zoomed.scale).toBe(MAX_SCALE)
    nearPoint(onScreen(zoomed, content), finger)
  })

  it('หนีบสองนิ้วก็ตรึงจุดกึ่งกลางบนจอจริงเช่นกัน', () => {
    const start: Viewport = { scale: 1, x: 0, y: 0 }
    const fingersFrom: [Point, Point] = [
      { x: frame.left + 100, y: frame.top + 100 },
      { x: frame.left + 200, y: frame.top + 100 },
    ]
    const fingersTo: [Point, Point] = [
      { x: frame.left + 50, y: frame.top + 100 },
      { x: frame.left + 250, y: frame.top + 100 },
    ]
    const from = fingersFrom.map((p) => viewPoint(p.x, p.y, start)) as [Point, Point]
    const to = fingersTo.map((p) => viewPoint(p.x, p.y, start)) as [Point, Point]
    const content = contentPointAt(start, midpoint(from[0], from[1]))
    const pinched = pinchViewport(start, from, to)
    expect(pinched.scale).toBeCloseTo(2, 6)
    nearPoint(onScreen(pinched, content), midpoint(fingersTo[0], fingersTo[1]))
  })
})

describe('transform ที่เขียนลง CSS', () => {
  it('เลื่อนก่อนแล้วค่อยขยาย (ต้องตรงกับ transform-origin มุมซ้ายบน)', () => {
    expect(viewportTransform({ scale: 1.5, x: 10, y: -20 })).toBe('translate(10px, -20px) scale(1.5)')
  })
})
