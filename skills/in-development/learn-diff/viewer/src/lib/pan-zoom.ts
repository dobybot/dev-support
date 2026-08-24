/**
 * คณิตของ "เลื่อน/ซูมภาพหนึ่งอัน" (issue #40 — ใช้กับไดอะแกรม)
 *
 * ทั้งไฟล์เป็นฟังก์ชันล้วน ไม่แตะ DOM และไม่รู้จัก mermaid — ตัวที่ผูก pointer event จริง
 * อยู่ที่ `use-pan-zoom.ts` ส่วนการวาดยังเป็นงานของ `src/lib/diagram` เหมือนเดิม
 * (pan/zoom เป็นเรื่องของ "กล่องที่มอง" ไม่ใช่ของ engine ที่วาด)
 *
 * transform ที่ใช้จริงคือ `translate(x, y) scale(s)` บน element ที่ `transform-origin` อยู่มุม
 * ซ้ายบน — ดังนั้นจุดในเนื้อหา c จะปรากฏบนจอที่ `x + s·c` ทุกฟังก์ชันข้างล่างยึดสูตรนี้ตัวเดียว
 * พิกัดทั้งหมดเป็น "พิกัดในกล่อง" (client coords ลบมุมซ้ายบนของกล่อง) หน่วย px
 */

export interface Point {
  x: number
  y: number
}

export interface Viewport {
  scale: number
  /** ระยะเลื่อนหน่วย px ในระบบพิกัดของกล่อง (ไม่ใช่ของเนื้อหา) */
  x: number
  y: number
}

export const IDENTITY_VIEWPORT: Viewport = { scale: 1, x: 0, y: 0 }

/**
 * ขอบเขตการซูม — ต่ำกว่านี้ตัวหนังสือในกล่องอ่านไม่ออกอยู่ดี สูงกว่านี้หลงทางง่าย
 * (ปุ่มรีเซ็ตมีไว้เพราะยังไงคนก็ซูมจนหลง)
 */
export const MIN_SCALE = 0.4
export const MAX_SCALE = 4

/** ระยะที่ยังนับว่า "แตะ" ไม่ใช่ "ลาก" — นิ้วสั่น 2-3px เป็นเรื่องปกติ ถ้าไม่เผื่อไว้ node จะกดไม่ติด */
export const TAP_SLOP_PX = 6

export function clampScale(scale: number): number {
  // NaN เทียบอะไรก็เป็น false — Math.min/max จะปล่อยผ่านทั้งที่ภาพจะหายไปทั้งอัน
  // (ค่าอนันต์ไม่ต้องกันเป็นพิเศษ: clamp ลงขอบบน/ล่างได้ตรงตัวอยู่แล้ว)
  if (Number.isNaN(scale)) return 1
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale))
}

/** ยังไม่ถูกแตะเลย — ใช้ตัดสินว่าจะโชว์ปุ่ม "รีเซ็ตมุมมอง" ไหม (ปุ่มที่กดแล้วไม่เกิดอะไร = dead click) */
export function isIdentityViewport(v: Viewport): boolean {
  return v.scale === 1 && v.x === 0 && v.y === 0
}

export function panBy(v: Viewport, dx: number, dy: number): Viewport {
  return { scale: v.scale, x: v.x + dx, y: v.y + dy }
}

/** จุดในเนื้อหา (พิกัดก่อน transform) ที่อยู่ใต้จุดบนจอ */
export function contentPointAt(v: Viewport, screen: Point): Point {
  return { x: (screen.x - v.x) / v.scale, y: (screen.y - v.y) / v.scale }
}

/** ตำแหน่งบนจอของจุดในเนื้อหา — ตรงข้ามกับ contentPointAt */
export function screenPointOf(v: Viewport, content: Point): Point {
  return { x: v.x + content.x * v.scale, y: v.y + content.y * v.scale }
}

/**
 * ซูมโดยตรึงจุด focus บนจอไว้กับที่ (นิ้ว/เมาส์ชี้ตรงไหน ตรงนั้นต้องไม่ขยับ)
 * `factor` คูณกับ scale เดิมแล้ว clamp — การเลื่อนคิดจาก scale **หลัง clamp** เสมอ
 * ไม่งั้นพอชนขอบซูมแล้วภาพจะไหลออกจากนิ้วทีละนิด
 */
export function zoomAt(v: Viewport, factor: number, focus: Point): Viewport {
  const wanted = Number.isFinite(factor) && factor > 0 ? v.scale * factor : v.scale
  const scale = clampScale(wanted)
  const ratio = scale / v.scale
  return {
    scale,
    x: focus.x - (focus.x - v.x) * ratio,
    y: focus.y - (focus.y - v.y) * ratio,
  }
}

/** กล่องบนจอเท่าที่คณิตในไฟล์นี้ต้องรู้ — subset ของ DOMRect (ที่นี่ยังไม่แตะ DOM) */
export interface BoxOrigin {
  left: number
  top: number
}

/**
 * ระยะจากมุมซ้ายบนของ "กล่องที่จับ gesture" ถึง **จุดกำเนิดของเนื้อหา** (ก่อน transform)
 *
 * ทุกฟังก์ชันข้างบนยึดว่าพิกัดที่ส่งเข้ามาวัดจากจุดกำเนิดของเนื้อหา แต่ pointer event ให้มาเป็น
 * ระยะจากขอบกล่อง — ถ้ากล่องมี padding/border สองระบบนี้ต่างกันคงที่ P และการซูมจะคลาดไป
 * P·(1−r) ทุกครั้ง (r = scale ใหม่/เก่า) จุดใต้นิ้วจึงไม่ถูกตรึงจริง · pan ไม่รู้สึกเพราะเป็น
 * delta ล้วน ซึ่งเป็นเหตุผลที่บั๊กแบบนี้รอดสายตาได้นาน
 *
 * วัดจากของจริงแทนการ hardcode ค่า padding: `transform-origin` อยู่มุมซ้ายบน การ scale จึงไม่
 * ขยับขอบซ้าย/บนของเนื้อหาเลย ระยะที่เหลือหลังหักการเลื่อน (v.x, v.y) ออกคือ P พอดี
 */
export function contentOrigin(frame: BoxOrigin, content: BoxOrigin, v: Viewport): Point {
  return { x: content.left - frame.left - v.x, y: content.top - frame.top - v.y }
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

export function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

/**
 * หนีบสองนิ้ว: scale มาจากอัตราส่วนระยะสองนิ้ว และภาพเลื่อนตามจุดกึ่งกลางที่ขยับด้วย
 * (คนหนีบแล้วเลื่อนมือไปด้วยเสมอ ถ้าไม่ตามจุดกึ่งกลาง ภาพจะสะบัดหลุดมือ)
 *
 * คิดจาก viewport **ตอนเริ่มหนีบ** ทุกเฟรม ไม่ใช่สะสมทีละเฟรม — สะสมแล้วเศษปัดจะพอกขึ้นเรื่อย ๆ
 * จนปล่อยนิ้วแล้วภาพไม่กลับมาที่เดิม
 */
export function pinchViewport(
  start: Viewport,
  from: readonly [Point, Point],
  to: readonly [Point, Point],
): Viewport {
  const startDist = distance(from[0], from[1])
  // สองนิ้วทับกันสนิท = อัตราส่วนระเบิด — ถือว่ายังไม่ซูม รอให้แยกนิ้วก่อน
  const factor = startDist < 1 ? 1 : distance(to[0], to[1]) / startDist
  const from2 = midpoint(from[0], from[1])
  const to2 = midpoint(to[0], to[1])
  const zoomed = zoomAt(start, factor, from2)
  return panBy(zoomed, to2.x - from2.x, to2.y - from2.y)
}

/** ขยับเกินระยะที่ยังถือว่าแตะหรือยัง (ใช้แยก tap ออกจาก drag) */
export function movedBeyond(a: Point, b: Point, slop: number = TAP_SLOP_PX): boolean {
  return distance(a, b) > slop
}

export function viewportTransform(v: Viewport): string {
  return `translate(${v.x}px, ${v.y}px) scale(${v.scale})`
}
