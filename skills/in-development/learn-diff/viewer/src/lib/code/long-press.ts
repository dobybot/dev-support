/**
 * state machine ของ "กดค้าง" (issue #43) — ฟังก์ชันล้วน ไม่แตะ DOM และไม่รู้จัก CodeMirror
 *
 * ตัวที่ผูก pointer event จริงอยู่ใน `navigation.ts` (แหล่งเดียวกับ Cmd-click เดิม) ที่นี่รับแต่
 * เหตุการณ์ที่แปลงเป็นตัวเลขแล้ว เพื่อให้กฎ "ค้างครบเวลา + นิ่งพอ = ติด" เทสต์ได้โดยไม่ต้องมี
 * เบราว์เซอร์
 *
 * กฎที่สำคัญที่สุดคือ **การยกเลิกต้องง่ายกว่าการติด**: ปล่อยก่อนเวลา ขยับเกินระยะ หรือมีนิ้วที่สอง
 * ลงมา = ยกเลิกทั้งหมด เพราะทางที่ผู้ใช้เดินทุกวัน (แตะ, ลากเลือกข้อความ, หนีบซูม) ต้องไม่ถูก
 * เมนูเด้งขวาง — long-press เป็นช่องทางเสริม ไม่ใช่ช่องทางหลัก
 */

/** พิกัดบนจอ (client coords) — ประกาศเองเพื่อให้ไฟล์นี้ไม่ผูกกับใครเลย */
export interface PressPoint {
  x: number
  y: number
}

export type LongPressStatus = 'idle' | 'pressing' | 'fired' | 'cancelled'

export interface LongPressState {
  status: LongPressStatus
  /** นิ้ว/เมาส์ที่กำลังจับตาอยู่ — null เมื่อไม่ได้กดอะไร */
  pointerId: number | null
  /** จุดที่เริ่มกด (พิกัด client) — เมนูเปิดที่จุดนี้ ไม่ใช่จุดที่นิ้วดริฟต์ไป */
  origin: PressPoint | null
  startedAt: number
}

export const LONG_PRESS_IDLE: LongPressState = {
  status: 'idle',
  pointerId: null,
  origin: null,
  startedAt: 0,
}

export interface LongPressConfig {
  /** เวลาที่ต้องค้าง — 500ms คือค่าที่ระบบปฏิบัติการใช้กับ long-press ทั่วไป */
  delayMs: number
  /** ระยะที่ยังถือว่านิ่ง — เผื่อนิ้วสั่น แต่ต้องน้อยพอที่การเริ่มลากเลือกข้อความจะยกเลิกได้ */
  slopPx: number
}

export const LONG_PRESS: LongPressConfig = { delayMs: 500, slopPx: 10 }

export type LongPressEvent =
  | { kind: 'down'; pointerId: number; x: number; y: number; at: number }
  | { kind: 'move'; pointerId: number; x: number; y: number }
  | { kind: 'up'; pointerId: number }
  | { kind: 'cancel'; pointerId: number }
  /** นาฬิกาเดินถึงแล้ว — ผู้เรียกตั้ง timer เอง state machine ไม่จับเวลาให้ */
  | { kind: 'tick'; at: number }

export interface LongPressResult {
  state: LongPressState
  /** ไม่ null = ถึงเวลาเปิดเมนูที่จุดนี้ (เกิดได้ครั้งเดียวต่อการกดหนึ่งครั้ง) */
  fire: PressPoint | null
}

function pressing(pointerId: number, x: number, y: number, at: number): LongPressState {
  return { status: 'pressing', pointerId, origin: { x, y }, startedAt: at }
}

function cancelled(state: LongPressState): LongPressState {
  return { status: 'cancelled', pointerId: state.pointerId, origin: state.origin, startedAt: state.startedAt }
}

/**
 * เดินหนึ่งก้าวของ state machine — ไม่มี side effect ผู้เรียกดูจาก state ที่คืนมาว่าจะ
 * ตั้ง/ล้าง timer (status === 'pressing' = ต้องมี timer เดินอยู่)
 */
export function longPressReduce(
  state: LongPressState,
  event: LongPressEvent,
  config: LongPressConfig = LONG_PRESS,
): LongPressResult {
  switch (event.kind) {
    case 'down': {
      // นิ้วที่สองลงมาระหว่างกดค้าง = ผู้ใช้กำลังจะหนีบซูม/ทำอย่างอื่น ไม่ใช่กดค้าง
      if (state.status === 'pressing' || state.status === 'fired') {
        return { state: cancelled(state), fire: null }
      }
      return { state: pressing(event.pointerId, event.x, event.y, event.at), fire: null }
    }
    case 'move': {
      if (state.status !== 'pressing' || state.pointerId !== event.pointerId || !state.origin) {
        return { state, fire: null }
      }
      const dist = Math.hypot(event.x - state.origin.x, event.y - state.origin.y)
      // เทียบกับ "จุดที่เริ่มกด" เสมอ ไม่ใช่จุดล่าสุด — ไม่งั้นการลากช้า ๆ ทีละ px จะไม่มีวันยกเลิก
      if (dist <= config.slopPx) return { state, fire: null }
      return { state: cancelled(state), fire: null }
    }
    case 'up':
    case 'cancel': {
      if (state.pointerId !== event.pointerId) return { state, fire: null }
      return { state: LONG_PRESS_IDLE, fire: null }
    }
    case 'tick': {
      if (state.status !== 'pressing' || !state.origin) return { state, fire: null }
      if (event.at - state.startedAt < config.delayMs) return { state, fire: null }
      return {
        state: { status: 'fired', pointerId: state.pointerId, origin: state.origin, startedAt: state.startedAt },
        fire: state.origin,
      }
    }
  }
}
