import { createContext, useContext } from 'react'

import type { RunEvents } from '@/lib/use-run-events'
import type { RunResponse } from '@/shared/types'

export const RunContext = createContext<RunResponse | null>(null)

/** ข้อมูล run ที่ layout โหลดไว้แล้ว — component ลูกทุกตัวอ่านจากตรงนี้ ไม่ fetch ซ้ำ */
export function useRun(): RunResponse {
  const value = useContext(RunContext)
  if (!value) throw new Error('useRun ต้องอยู่ภายใต้ RunContext.Provider')
  return value
}

/** สำหรับชิ้นส่วนที่ถูกใช้ทั้งในและนอก run (เช่น markdown ที่ render จากหน้าอื่น) */
export function useOptionalRun(): RunResponse | null {
  return useContext(RunContext)
}

const IDLE_EVENTS: RunEvents = { status: 'connecting', lastChange: null, connectedAt: 0 }

/**
 * สาย SSE เส้นเดียวของ run เปิดที่ layout แล้วส่งต่อลงมาทางนี้
 * (เปิดสายแยกต่อ component = หลายสาย/หลาย watcher ต่อ run โดยไม่จำเป็น)
 */
export const RunEventsContext = createContext<RunEvents>(IDLE_EVENTS)

export function useRunChanges(): RunEvents {
  return useContext(RunEventsContext)
}
