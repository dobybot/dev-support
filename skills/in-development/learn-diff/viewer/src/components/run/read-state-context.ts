import { createContext, useContext } from 'react'

import type { ReadStateValue } from '@/lib/use-read-state'

/**
 * read state (checklist + coverage) ของ run — host ที่ RunLayout ตัวเดียว
 * (SPEC-reading-checklist → Code structure: หนึ่ง hook แชร์ผ่าน context เหมือน reading panel)
 */
export const ReadStateContext = createContext<ReadStateValue | null>(null)

export function useReadStateValue(): ReadStateValue {
  const value = useContext(ReadStateContext)
  if (!value) throw new Error('useReadStateValue ต้องอยู่ภายใต้ ReadStateContext.Provider')
  return value
}

/** null เมื่ออยู่นอก run (เช่น component ที่ถูก reuse ที่อื่น) — ผู้เรียกซ่อน UI เอง */
export function useOptionalReadState(): ReadStateValue | null {
  return useContext(ReadStateContext)
}
