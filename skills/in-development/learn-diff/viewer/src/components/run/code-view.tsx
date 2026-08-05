import { useEffect, useRef } from 'react'

import {
  mountCodeView,
  mountSplitCodeView,
  type CodeControls,
  type CodePin,
  type CodeViewHandle,
  type SplitCodeViewHandle,
} from '@/lib/code'
import type { CodeLine } from '@/lib/diff'
import { useDarkMode } from '@/lib/use-dark-mode'
import type { CodeLanguage } from '@/shared/languages'

/**
 * โค้ดจาก commit ที่ pin ไว้ (ผลของ file API) หนึ่งก้อน
 *
 * component นี้ไม่รู้จัก CodeMirror — คุยกับตัวแสดงผ่าน mountCodeView()/mountSplitCodeView()
 * ทางเดียว (src/lib/code) · editor ตัวเดิมถูกใช้ซ้ำเมื่อเนื้อหาเปลี่ยน (update) แทนที่จะสร้างใหม่
 * เพราะ panel สลับไฟล์บ่อยมาก และการสร้าง editor ใหม่ทิ้ง state ทั้งหมดรวมถึงช่องค้นหา
 */
export function CodeView({
  text,
  language,
  firstLine,
  lines,
  pins,
  height,
  scrollToLine,
  className,
  viewRef,
}: {
  text: string
  language: CodeLanguage | null
  firstLine: number
  /** เมตาต่อบรรทัดของโหมด diff (จาก lib/diff) — ไม่ส่ง = โค้ดธรรมดา */
  lines?: CodeLine[] | null
  pins?: CodePin[]
  /** ความสูงคงที่ เช่น '60vh' — โหมดกางทั้งไฟล์ใช้ เพื่อให้ CodeMirror scroll/virtualize เอง */
  height?: string | null
  /** บรรทัดที่ต้องเห็นตั้งแต่แรกเปิด (มีผลตอน mount) */
  scrollToLine?: number | null
  className?: string
  /** ที่ให้ผู้เรียกเก็บ handle ไว้สั่ง openSearch() / scrollToLine() เอง */
  viewRef?: React.RefObject<CodeControls | null>
}) {
  const host = useRef<HTMLDivElement>(null)
  const handle = useRef<CodeViewHandle | null>(null)
  const dark = useDarkMode()

  useEffect(() => {
    const container = host.current
    if (!container) return
    handle.current = mountCodeView(container, {
      text,
      language,
      firstLine,
      lines,
      pins,
      height,
      scrollToLine,
      dark,
    })
    if (viewRef) viewRef.current = handle.current
    return () => {
      handle.current?.destroy()
      handle.current = null
      if (viewRef) viewRef.current = null
    }
    // สร้างครั้งเดียวต่อการ mount โดยตั้งใจ — การเปลี่ยนค่าเป็นหน้าที่ของ effect ข้างล่าง
    // (ค่าตั้งต้นอ่านจาก closure รอบแรกเท่านั้น จึงไม่ใส่ไว้ใน deps)
  }, [])

  useEffect(() => {
    handle.current?.update({ text, language, firstLine, lines, pins, height, dark })
  }, [text, language, firstLine, lines, pins, height, dark])

  return <div ref={host} className={className} />
}

/**
 * มุมมอง diff สองฝั่ง — คนละ mount function กับ CodeView จึงเป็นคนละ component
 * (สลับโหมดแล้ว React unmount ตัวเก่าและสร้างตัวใหม่ให้เอง ซึ่งเป็นสิ่งที่ต้องการพอดี)
 */
export function SplitCodeView({
  left,
  right,
  language,
  pins,
  height,
  scrollToLine,
  className,
  viewRef,
}: {
  left: CodeLine[]
  right: CodeLine[]
  language: CodeLanguage | null
  pins?: CodePin[]
  height?: string | null
  /** บรรทัดที่ต้องเห็นตั้งแต่แรกเปิด (มีผลตอน mount) */
  scrollToLine?: number | null
  className?: string
  viewRef?: React.RefObject<CodeControls | null>
}) {
  const host = useRef<HTMLDivElement>(null)
  const handle = useRef<SplitCodeViewHandle | null>(null)
  const dark = useDarkMode()

  useEffect(() => {
    const container = host.current
    if (!container) return
    handle.current = mountSplitCodeView(container, {
      left,
      right,
      language,
      pins,
      height,
      scrollToLine,
      dark,
    })
    if (viewRef) viewRef.current = handle.current
    return () => {
      handle.current?.destroy()
      handle.current = null
      if (viewRef) viewRef.current = null
    }
  }, [])

  useEffect(() => {
    handle.current?.update({ left, right, language, pins, height, dark })
  }, [left, right, language, pins, height, dark])

  return <div ref={host} className={className} />
}

export type { CodeControls, CodeViewHandle }
