/**
 * Toast กลางแบบเบาที่สุด — pub/sub ใน module เดียว ไม่พึ่ง dependency ใหม่
 *
 * มีไว้เพราะ code navigation (issue #36) ต้องบอก "ทางตัน" ที่ไม่ใช่ error ของ UI ไหนโดยเฉพาะ
 * (definition ไม่อยู่ใน repo, index ยังไม่พร้อม) — ผู้ยิงอยู่ลึกใน SpanCard แต่ตัวแสดงต้องลอย
 * เหนือทั้งหน้า จึงคุยกันผ่าน store ตัวนี้แทนการหิ้ว state ขึ้นไปหลายชั้น
 *
 * ตัวแสดงคือ <ToastHost> (components/run/toast-host.tsx) — mount ครั้งเดียวที่ RunLayout
 */

export interface ToastAction {
  label: string
  onClick: () => void
}

export interface Toast {
  id: number
  message: string
  /** ปุ่มแถมท้าย toast เช่น "ดู candidate ทั้งหมด" (user story 12) */
  action?: ToastAction
}

export const TOAST_DURATION_MS = 5000

type Listener = (toasts: readonly Toast[]) => void

let toasts: readonly Toast[] = []
let nextId = 1
const listeners = new Set<Listener>()

function emit(): void {
  for (const listener of listeners) listener(toasts)
}

export function showToast(message: string, action?: ToastAction): number {
  const id = nextId++
  toasts = [...toasts, { id, message, action }]
  emit()
  return id
}

export function dismissToast(id: number): void {
  if (!toasts.some((t) => t.id === id)) return
  toasts = toasts.filter((t) => t.id !== id)
  emit()
}

export function subscribeToasts(listener: Listener): () => void {
  listeners.add(listener)
  listener(toasts)
  return () => {
    listeners.delete(listener)
  }
}
