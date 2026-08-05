import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  DEFAULT_DIFF_MODE,
  readStoredDiffMode,
  writeStoredDiffMode,
  type DiffMode,
} from '@/lib/diff'
import {
  EMPTY_HISTORY,
  canGoBack,
  canGoForward,
  clampPanelWidth,
  currentTarget,
  goBack,
  goForward,
  pushTarget,
  readStoredWidth,
  writeStoredWidth,
  type PanelHistory,
  type PanelTarget,
} from '@/lib/reading-panel'

/**
 * state ของ code panel — อยู่ที่ RunLayout เส้นเดียวต่อ run
 * เพราะ panel ต้องรอดข้ามการสลับ section (user story 29) ส่วน <Outlet/> เปลี่ยนไปเรื่อย
 */
export interface ReadingPanelState {
  open: boolean
  target: PanelTarget | null
  /** ความกว้างที่ใช้จริงตอนนี้ (ผ่าน clamp ตามขนาดจอแล้ว) */
  width: number
  canBack: boolean
  canForward: boolean
  /** unified (ค่าเริ่มต้น) หรือ side-by-side — เป็นค่าของผู้อ่าน ไม่ใช่ของไฟล์ (user story 21) */
  diffMode: DiffMode
  setDiffMode(mode: DiffMode): void
  openTarget(target: PanelTarget): void
  close(): void
  back(): void
  forward(): void
  /** ระหว่างลาก: persist = false · ปล่อยเมาส์แล้วค่อยจำ */
  setWidth(width: number, persist?: boolean): void
}

function viewport(): number {
  return typeof window === 'undefined' ? 1440 : window.innerWidth
}

export function useReadingPanel(runId: string): ReadingPanelState {
  const [history, setHistory] = useState<PanelHistory>(EMPTY_HISTORY)
  const [open, setOpen] = useState(false)
  const [viewportWidth, setViewportWidth] = useState(viewport)
  // ความกว้างที่ "ผู้อ่านขอ" เก็บไว้ดิบ ๆ แล้ว clamp ตอนแสดงผลเท่านั้น —
  // ถ้าเก็บค่าที่ clamp แล้ว การย่อหน้าต่างครั้งเดียวจะกินความกว้างที่ตั้งไว้หายถาวร
  const [desiredWidth, setDesiredWidth] = useState(() =>
    readStoredWidth(typeof window === 'undefined' ? null : window.localStorage, viewport()),
  )
  // โหมด diff ก็เป็นของผู้อ่านเช่นกัน — ข้ามไฟล์ ข้าม run และข้าม session
  const [diffMode, setDiffModeState] = useState<DiffMode>(() =>
    typeof window === 'undefined' ? DEFAULT_DIFF_MODE : readStoredDiffMode(window.localStorage),
  )
  const firstRun = useRef(true)

  // ย้าย run = ประวัติของ run เดิมใช้ไม่ได้แล้ว (reading list id เป็นของแต่ละ run)
  // ส่วนความกว้างเป็นค่าของ "ผู้อ่าน" ไม่ใช่ของ run — ไม่รีเซ็ต
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false
      return
    }
    setHistory(EMPTY_HISTORY)
    setOpen(false)
  }, [runId])

  const openTarget = useCallback((target: PanelTarget) => {
    setHistory((prev) => pushTarget(prev, target))
    setOpen(true)
  }, [])

  const close = useCallback(() => setOpen(false), [])
  const back = useCallback(() => setHistory((prev) => goBack(prev)), [])
  const forward = useCallback(() => setHistory((prev) => goForward(prev)), [])

  const setDiffMode = useCallback((mode: DiffMode) => {
    setDiffModeState(mode)
    writeStoredDiffMode(window.localStorage, mode)
  }, [])

  const setWidth = useCallback((next: number, persist = true) => {
    const clamped = clampPanelWidth(next, viewport())
    setDesiredWidth(clamped)
    if (persist) writeStoredWidth(window.localStorage, clamped)
  }, [])

  useEffect(() => {
    const onResize = () => setViewportWidth(viewport())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const target = currentTarget(history)
  const width = clampPanelWidth(desiredWidth, viewportWidth)

  return useMemo(
    () => ({
      open: open && target !== null,
      target,
      width,
      canBack: canGoBack(history),
      canForward: canGoForward(history),
      diffMode,
      setDiffMode,
      openTarget,
      close,
      back,
      forward,
      setWidth,
    }),
    [open, target, width, history, diffMode, setDiffMode, openTarget, close, back, forward, setWidth],
  )
}
