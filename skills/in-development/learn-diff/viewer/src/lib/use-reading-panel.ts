import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

import {
  DEFAULT_DIFF_MODE,
  readStoredDiffMode,
  writeStoredDiffMode,
  type DiffMode,
} from '@/lib/diff'
import {
  EMPTY_HISTORY,
  NO_PAGE_SCROLL,
  backGoesToReferences,
  canGoBack,
  canGoForward,
  clampPanelWidth,
  currentScrollTop,
  currentTarget,
  goBack,
  goBackToReading,
  goForward,
  pageScrollTransition,
  pushTarget,
  readStoredWidth,
  writeStoredWidth,
  type PageScrollState,
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
  /** true = ปุ่ม "ย้อนกลับ" ตอนนี้พาไปที่รายการ references (label เปลี่ยนความหมาย — CONTRACT-f12 §4.1) */
  backGoesToReferences: boolean
  /** true = มีที่อ่านค้างให้กลับไปได้ (entry ที่ไม่ใช่ references/file-focusLine อยู่ก่อนหน้า) */
  canGoBackToReading: boolean
  /** scrollTop ที่จำไว้ของ entry ปัจจุบัน — component set ให้ scroller แทนการ reset เป็น 0 เสมอ */
  scrollTop: number
  /**
   * component (scroller div ของ ReadingPanel) เรียกทุกครั้งที่ผู้อ่านเลื่อน — hook เก็บไว้เป็นค่าล่าสุด
   * เฉย ๆ (ไม่ trigger re-render) แล้วใช้ตอน `openTarget` บันทึกลง entry ที่กำลังจะออกจากมัน
   * (CONTRACT-f12 §4.1) — ผู้เรียก `openTarget` เองไม่ต้องรู้เรื่อง scroll เลย
   */
  reportScroll(scrollTop: number): void
  /** unified (ค่าเริ่มต้น) หรือ side-by-side — เป็นค่าของผู้อ่าน ไม่ใช่ของไฟล์ (user story 21) */
  diffMode: DiffMode
  setDiffMode(mode: DiffMode): void
  openTarget(target: PanelTarget): void
  close(): void
  back(): void
  forward(): void
  /** ปุ่ม "กลับไปอ่านต่อ" — ข้าม entry ที่เป็นจุดกระโดดชั่วคราวทั้งหมดทีเดียว */
  backToReading(): void
  /** ระหว่างลาก: persist = false · ปล่อยเมาส์แล้วค่อยจำ */
  setWidth(width: number, persist?: boolean): void
  /** อ่านเต็มหน้าจอ (issue #30) — ซ่อน sidebar+เนื้อหา ไม่ใช่ Fullscreen API ของ browser */
  fullscreen: boolean
  toggleFullscreen(): void
}

function viewport(): number {
  return typeof window === 'undefined' ? 1440 : window.innerWidth
}

export function useReadingPanel(runId: string): ReadingPanelState {
  const [history, setHistory] = useState<PanelHistory>(EMPTY_HISTORY)
  const [open, setOpen] = useState(false)
  // เต็มหน้าจอเป็นค่าชั่วคราวเหมือน open — ไม่จำลง localStorage
  const [fullscreen, setFullscreen] = useState(false)
  const [viewportWidth, setViewportWidth] = useState(viewport)
  // ความกว้างที่ "ผู้อ่านขอ" เก็บไว้ดิบ ๆ แล้ว clamp ตอนแสดงผลเท่านั้น —
  // ถ้าเก็บค่าที่ clamp แล้ว การย่อหน้าต่างครั้งเดียวจะกินความกว้างที่ตั้งไว้หายถาวร
  const [desiredWidth, setDesiredWidth] = useState(() =>
    readStoredWidth(typeof window === 'undefined' ? null : window.localStorage),
  )
  // โหมด diff ก็เป็นของผู้อ่านเช่นกัน — ข้ามไฟล์ ข้าม run และข้าม session
  const [diffMode, setDiffModeState] = useState<DiffMode>(() =>
    typeof window === 'undefined' ? DEFAULT_DIFF_MODE : readStoredDiffMode(window.localStorage),
  )
  const firstRun = useRef(true)
  // scrollTop สดของ scroller ปัจจุบัน — ไม่ผ่าน state เพราะไม่ควร re-render ทุกครั้งที่เลื่อน
  const liveScrollRef = useRef(0)
  // ตำแหน่ง scroll ของหน้าหลักที่จำไว้ตอนเข้าเต็มหน้าจอ (issue #39) — ไม่ผ่าน state เช่นกัน
  const pageScrollRef = useRef<PageScrollState>(NO_PAGE_SCROLL)
  // ค่าที่รอ scroll กลับหลัง React วาดคอลัมน์เนื้อหากลับมาแล้ว (ก่อนหน้านั้นเอกสารยังหดอยู่ — browser clamp ทิ้ง)
  const pendingRestoreRef = useRef<number | null>(null)

  // ย้าย run = ประวัติของ run เดิมใช้ไม่ได้แล้ว (reading list id เป็นของแต่ละ run)
  // ส่วนความกว้างเป็นค่าของ "ผู้อ่าน" ไม่ใช่ของ run — ไม่รีเซ็ต
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false
      return
    }
    setHistory(EMPTY_HISTORY)
    setOpen(false)
    setFullscreen(false)
    // หน้าใหม่เริ่มที่บนสุดอยู่แล้ว — ตำแหน่งที่จำไว้ของ run เก่าคืนไปก็ผิดที่
    pageScrollRef.current = NO_PAGE_SCROLL
    pendingRestoreRef.current = null
  }, [runId])

  const openTarget = useCallback((target: PanelTarget) => {
    setHistory((prev) => pushTarget(prev, target, liveScrollRef.current))
    setOpen(true)
  }, [])
  const reportScroll = useCallback((scrollTop: number) => {
    liveScrollRef.current = scrollTop
  }, [])

  /** ทางออกจากเต็มหน้าจอทุกทางผ่านที่นี่ — คิดครั้งเดียวว่าจะคืน scroll ไหม แล้วฝากไว้ให้ layout effect ทำ */
  const movePageScroll = useCallback((event: 'enter-fullscreen' | 'exit-fullscreen' | 'close') => {
    const result = pageScrollTransition(
      pageScrollRef.current,
      event,
      typeof window === 'undefined' ? 0 : window.scrollY,
    )
    pageScrollRef.current = result.state
    if (result.restoreTo !== null) pendingRestoreRef.current = result.restoreTo
  }, [])

  const close = useCallback(() => {
    movePageScroll('close')
    setOpen(false)
    setFullscreen(false)
  }, [movePageScroll])
  // อ่าน `fullscreen` จาก closure ไม่ใช่ใน updater — StrictMode เรียก updater ซ้ำสองรอบ
  // side effect (จำ/คืน scroll) ที่อยู่ในนั้นจึงทำงานสองครั้ง
  const toggleFullscreen = useCallback(() => {
    movePageScroll(fullscreen ? 'exit-fullscreen' : 'enter-fullscreen')
    setFullscreen(!fullscreen)
  }, [fullscreen, movePageScroll])

  // คืนตำแหน่งหลัง DOM commit แล้วเท่านั้น (useLayoutEffect) — คอลัมน์เนื้อหากลับมา เอกสารสูงพอ
  // ให้ scroll กลับได้จริง · ทำก่อน browser วาด จึงไม่เห็นการกระโดด
  useLayoutEffect(() => {
    const target = pendingRestoreRef.current
    if (target === null) return
    pendingRestoreRef.current = null
    window.scrollTo(0, target)
  })
  // ส่ง scroll สดของ entry ที่กำลังออกไปให้ทุกทางออก — ไม่งั้น back แล้ว forward ตำแหน่งหาย (§4.1)
  const back = useCallback(() => setHistory((prev) => goBack(prev, liveScrollRef.current)), [])
  const forward = useCallback(() => setHistory((prev) => goForward(prev, liveScrollRef.current)), [])
  const backToReading = useCallback(() => setHistory((prev) => goBackToReading(prev, liveScrollRef.current)), [])

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
      backGoesToReferences: backGoesToReferences(history),
      canGoBackToReading: goBackToReading(history) !== history,
      scrollTop: currentScrollTop(history),
      reportScroll,
      diffMode,
      setDiffMode,
      openTarget,
      close,
      back,
      forward,
      backToReading,
      setWidth,
      fullscreen,
      toggleFullscreen,
    }),
    [
      open,
      target,
      width,
      history,
      reportScroll,
      diffMode,
      setDiffMode,
      openTarget,
      close,
      back,
      forward,
      backToReading,
      setWidth,
      fullscreen,
      toggleFullscreen,
    ],
  )
}
