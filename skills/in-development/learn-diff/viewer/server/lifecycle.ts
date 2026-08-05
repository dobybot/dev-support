/**
 * อายุของ process — server ตัวนี้เป็น "บริการเล็ก ๆ ที่รันค้างไว้" ไม่ใช่คำสั่งที่รันแล้วจบ
 *
 * กติกาตาม SPEC-v3 → Delivery model: หนึ่งเครื่องมี server ตัวเดียว พอร์ตเดียว และตัวจับเวลา
 * ตัวเดียว · การเรียก `/learn-diff` ครั้งที่สองต้องเจอตัวเดิมผ่าน `/api/health` แล้วใช้ต่อ
 * (ตัวตัดสินใจอยู่ที่ `scripts/serve.mjs`) ส่วนตัวที่ไม่มีใครใช้แล้วต้องปิดตัวเอง ไม่ใช่ค้างข้ามวัน
 *
 * นิยามของ "ว่าง" คือ **ไม่มี request เข้ามาเลย** ตามที่สเปกเขียนไว้ตรง ๆ (target: 4 ชั่วโมง)
 * สาย SSE ที่เปิดค้างไว้ไม่นับเป็นการใช้งาน เพราะแท็บที่ถูกลืมไว้จะกลายเป็นตัวกันไม่ให้ปิดตลอดไป
 * ซึ่งขัดกับเหตุผลทั้งหมดที่มีตัวจับเวลานี้ · แท็บที่ยังเปิดอยู่ตอน server ปิดจะขึ้นสถานะ offline
 * แล้วต่อสายเองใหม่เมื่อผู้อ่านสั่งรัน server อีกครั้งด้วยคำสั่งที่พิมพ์ไว้ให้
 */

/** 4 ชั่วโมงตาม SPEC-v3 */
export const DEFAULT_IDLE_MS = 4 * 60 * 60 * 1000

/** override ด้วย LEARN_DIFF_IDLE_MS (มิลลิวินาที) — 0 = ไม่ปิดตัวเอง */
export function configuredIdleMs(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.LEARN_DIFF_IDLE_MS
  if (raw === undefined || raw.trim() === '') return DEFAULT_IDLE_MS
  const value = Number(raw)
  if (!Number.isFinite(value) || value < 0) return DEFAULT_IDLE_MS
  return Math.floor(value)
}

export interface IdleTimer {
  /** 0 = ปิดการนับถอยหลังไว้ */
  readonly timeoutMs: number
  /** มี request เข้ามา — เริ่มนับใหม่ */
  touch(): void
  /** epoch ms ที่จะปิดตัวเองถ้าไม่มี request เพิ่ม (null = ไม่ได้นับถอยหลัง) */
  shutdownAt(): number | null
  /** เลิกนับ (server ปิดไปแล้ว / เทสต์จบ) */
  stop(): void
}

export interface IdleTimerOptions {
  timeoutMs: number
  onIdle: () => void
  /** ฉีดนาฬิกาเข้ามาได้เพื่อเทสต์ */
  now?: () => number
}

/**
 * ตัวจับเวลา "ไม่มีใครเรียกแล้ว"
 *
 * ตั้ง timer ทีเดียวแล้วต่ออายุตอนมันดังจริง แทนที่จะ clear/set ใหม่ทุก request —
 * หนึ่งหน้าของ viewer ยิงหลายสิบ request (asset + API) การรื้อ timer ทุกครั้งคือค่าใช้จ่ายเปล่า
 */
export function createIdleTimer(options: IdleTimerOptions): IdleTimer {
  const { timeoutMs, onIdle } = options
  const now = options.now ?? Date.now
  let lastTouch = now()
  let handle: ReturnType<typeof setTimeout> | null = null
  let stopped = false

  function arm(delay: number): void {
    if (stopped || timeoutMs <= 0) return
    handle = setTimeout(fire, Math.max(delay, 1))
    // ตัวจับเวลาต้องไม่เป็นเหตุผลให้ process มีชีวิตอยู่ต่อ — server ต่างหากที่เป็น
    handle.unref?.()
  }

  function fire(): void {
    handle = null
    if (stopped) return
    const remaining = lastTouch + timeoutMs - now()
    if (remaining > 0) {
      arm(remaining)
      return
    }
    stopped = true
    onIdle()
  }

  arm(timeoutMs)

  return {
    timeoutMs,
    touch() {
      lastTouch = now()
      if (!stopped && handle === null) arm(timeoutMs)
    },
    shutdownAt() {
      if (stopped || timeoutMs <= 0) return null
      return lastTouch + timeoutMs
    },
    stop() {
      stopped = true
      if (handle !== null) {
        clearTimeout(handle)
        handle = null
      }
    },
  }
}

/**
 * ตัวจับเวลาของ process นี้ — `/api/health` อ่านจากตรงนี้เพื่อบอกว่าจะปิดตัวเองเมื่อไร
 * (ในเทสต์ที่ mount API เปล่า ๆ จะไม่มีใครตั้งไว้ ค่าที่ตอบกลับจึงเป็น null)
 */
let active: IdleTimer | null = null

export function setActiveIdleTimer(timer: IdleTimer | null): void {
  active = timer
}

export function activeIdleTimer(): IdleTimer | null {
  return active
}
