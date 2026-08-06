import { X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { TOAST_DURATION_MS, dismissToast, subscribeToasts, type Toast } from '@/lib/toast'
import { cn } from '@/lib/utils'

/**
 * ตัวแสดง toast กลาง — mount ครั้งเดียวที่ RunLayout (คู่กับ store ใน src/lib/toast.ts)
 *
 * ลอยมุมล่างขวาแบบ fixed (ข้อห้าม fixed/absolute ของ reading panel ใช้กับ "ตัวกล่อง panel"
 * ที่ต้องดันเนื้อหา — toast เป็นข้อความชั่วคราวที่ตั้งใจลอยทับและหายเอง คนละหน้าที่กัน)
 */
function ToastCard({ toast }: { toast: Toast }) {
  // จับเวลาหายเองต่อใบ — ใบที่มีปุ่ม action ก็หายตามเวลาเดียวกัน (กดได้ระหว่างที่ยังอยู่)
  useEffect(() => {
    const timer = window.setTimeout(() => dismissToast(toast.id), TOAST_DURATION_MS)
    return () => window.clearTimeout(timer)
  }, [toast.id])

  return (
    <div
      role="status"
      className="pointer-events-auto flex max-w-sm items-start gap-2 rounded-lg border bg-background px-3 py-2 text-xs shadow-lg"
    >
      <p className="min-w-0 flex-1 leading-relaxed">{toast.message}</p>
      {toast.action ? (
        <button
          type="button"
          onClick={() => {
            dismissToast(toast.id)
            toast.action?.onClick()
          }}
          className="shrink-0 rounded border px-1.5 py-0.5 font-medium hover:bg-muted"
        >
          {toast.action.label}
        </button>
      ) : null}
      <button
        type="button"
        onClick={() => dismissToast(toast.id)}
        title="ปิดข้อความนี้"
        aria-label="ปิดข้อความนี้"
        className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted"
      >
        <X className="size-3" aria-hidden />
      </button>
    </div>
  )
}

export function ToastHost({ className }: { className?: string }) {
  const [toasts, setToasts] = useState<readonly Toast[]>([])
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    const unsubscribe = subscribeToasts((next) => {
      if (mounted.current) setToasts(next)
    })
    return () => {
      mounted.current = false
      unsubscribe()
    }
  }, [])

  if (toasts.length === 0) return null

  return (
    <div
      className={cn('pointer-events-none fixed right-4 bottom-4 z-50 flex flex-col items-end gap-2', className)}
      data-toast-host
    >
      {toasts.map((toast) => (
        <ToastCard key={toast.id} toast={toast} />
      ))}
    </div>
  )
}
