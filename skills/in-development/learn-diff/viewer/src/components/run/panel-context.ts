import { createContext, useContext } from 'react'

import { DEFAULT_DIFF_MODE } from '@/lib/diff'
import type { ReadingPanelState } from '@/lib/use-reading-panel'

/**
 * ทางเดียวที่ทุกอย่างในหน้า (ชื่อไฟล์ในเนื้อความ, ปุ่มของ section, แถว box map, node ในไดอะแกรม)
 * ใช้เปิดโค้ด — `openTarget()` · ตัวที่เรียกไม่ต้องรู้ว่า panel วาดยังไงหรืออยู่ที่ไหน
 */
const CLOSED: ReadingPanelState = {
  open: false,
  target: null,
  width: 0,
  canBack: false,
  canForward: false,
  diffMode: DEFAULT_DIFF_MODE,
  setDiffMode: () => {},
  openTarget: () => {},
  close: () => {},
  back: () => {},
  forward: () => {},
  setWidth: () => {},
}

export const ReadingPanelContext = createContext<ReadingPanelState | null>(null)

export function useReadingPanelState(): ReadingPanelState {
  return useContext(ReadingPanelContext) ?? CLOSED
}

/** null เมื่อ component ถูก render นอก run (เช่น markdown ที่ไม่มี panel) — ผู้เรียกตัดสินใจเอง */
export function useOptionalReadingPanel(): ReadingPanelState | null {
  return useContext(ReadingPanelContext)
}
