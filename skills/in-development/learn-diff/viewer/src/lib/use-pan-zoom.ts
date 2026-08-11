import { useCallback, useEffect, useRef, useState } from 'react'

import {
  IDENTITY_VIEWPORT,
  contentOrigin,
  isIdentityViewport,
  movedBeyond,
  panBy,
  pinchViewport,
  viewportTransform,
  zoomAt,
  type Point,
  type Viewport,
} from './pan-zoom'

/**
 * ผูก pointer event ชุดเดียวให้กล่องหนึ่งกล่อง "ลากเลื่อน + หนีบซูม" ได้ทั้งเมาส์และนิ้ว (issue #40)
 *
 * ทำไม pointer events ชุดเดียว ไม่ใช่ mouse* + touch* สองชุด: touch device สมัยใหม่ยิง pointer
 * event ครบทุกอย่างอยู่แล้ว การเขียนสองชุดแปลว่ามีสองที่ให้พังคนละแบบ · คณิตทั้งหมดอยู่ใน
 * `pan-zoom.ts` (ฟังก์ชันล้วน มีเทสต์) ที่นี่เหลือแค่เรื่องที่เทสต์อัตโนมัติไม่ได้: การจับ event,
 * การแปลงพิกัด และการเขียน transform ลง DOM
 *
 * transform เขียนลง element ตรง ๆ ระหว่างลาก **ไม่ผ่าน React state** — pointermove ยิง 60+
 * ครั้งต่อวินาที การ re-render ทุกเฟรมทำให้ทั้งหน้า (รวมกล่องโค้ดที่เปิดอยู่) หน่วง · state
 * ถูกอัปเดตเฉพาะตอนจบ gesture เพื่อให้ปุ่มรีเซ็ต/ตัวเลข % ตรงกับของจริง
 */

/** ระดับการซูมต่อการกดปุ่มหนึ่งครั้ง — ~25% ต่อครั้ง กดสามทีได้เท่าตัว */
const BUTTON_ZOOM_STEP = 1.25

/** ความไวของ wheel/trackpad — deltaY หน่วย px แปลงเป็น factor แบบ exponential ให้ซูมนุ่ม */
const WHEEL_ZOOM_SENSITIVITY = 0.0025

interface PanGesture {
  kind: 'pan'
  pointerId: number
  from: Point
  start: Viewport
}

interface PinchGesture {
  kind: 'pinch'
  ids: [number, number]
  from: [Point, Point]
  start: Viewport
}

type Gesture = PanGesture | PinchGesture

export interface PanZoom {
  /** กล่องที่จับ gesture และตัดส่วนที่ล้น — ต้องมี CSS `touch-action: none` (คลาส .ld-viewport) */
  frameRef: React.RefObject<HTMLDivElement | null>
  /** ของข้างในที่ถูก transform — เนื้อหาจริง (SVG) อยู่ข้างใต้ตัวนี้ */
  contentRef: React.RefObject<HTMLDivElement | null>
  scale: number
  /** เคยเลื่อน/ซูมไปแล้วหรือยัง — ใช้ตัดสินว่าจะโชว์ปุ่มรีเซ็ตไหม */
  transformed: boolean
  zoomIn: () => void
  zoomOut: () => void
  reset: () => void
}

export function usePanZoom(): PanZoom {
  const frameRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const viewport = useRef<Viewport>(IDENTITY_VIEWPORT)
  const [scale, setScale] = useState(1)
  const [transformed, setTransformed] = useState(false)

  const apply = useCallback((next: Viewport) => {
    viewport.current = next
    const content = contentRef.current
    if (content) content.style.transform = viewportTransform(next)
  }, [])

  /** ให้ปุ่ม/ตัวเลขที่ React วาดตรงกับ transform จริง — เรียกตอนจบ gesture ไม่ใช่ทุกเฟรม */
  const sync = useCallback(() => {
    setScale(viewport.current.scale)
    setTransformed(!isIdentityViewport(viewport.current))
  }, [])

  /**
   * จุดบนจอ (client coords) → พิกัดที่ `pan-zoom.ts` ใช้ ซึ่งวัดจาก **จุดกำเนิดของเนื้อหา**
   * ไม่ใช่ขอบกล่อง — กล่องมี padding อยู่ (`p-4`) ถ้าวัดจากขอบ การซูมจะคลาดไปเท่ากับ padding
   * ทุกครั้ง (ดู `contentOrigin`) · วัดใหม่ทุกครั้งเพราะขนาด/padding เปลี่ยนได้ตาม breakpoint
   */
  const viewPoint = useCallback((clientX: number, clientY: number): Point => {
    const frame = frameRef.current
    if (!frame) return { x: 0, y: 0 }
    const rect = frame.getBoundingClientRect()
    const content = contentRef.current
    const origin = content
      ? contentOrigin(rect, content.getBoundingClientRect(), viewport.current)
      : { x: 0, y: 0 }
    return { x: clientX - rect.left - origin.x, y: clientY - rect.top - origin.y }
  }, [])

  /** กลางกล่อง — จุด focus ของปุ่มซูม (ซูมด้วยปุ่มไม่มีนิ้วให้ตรึง) */
  const center = useCallback((): Point => {
    const frame = frameRef.current
    if (!frame) return { x: 0, y: 0 }
    const rect = frame.getBoundingClientRect()
    return viewPoint(rect.left + frame.clientWidth / 2, rect.top + frame.clientHeight / 2)
  }, [viewPoint])

  const zoomBy = useCallback(
    (factor: number, focus?: Point) => {
      apply(zoomAt(viewport.current, factor, focus ?? center()))
      sync()
    },
    [apply, center, sync],
  )

  const zoomIn = useCallback(() => zoomBy(BUTTON_ZOOM_STEP), [zoomBy])
  const zoomOut = useCallback(() => zoomBy(1 / BUTTON_ZOOM_STEP), [zoomBy])
  const reset = useCallback(() => {
    apply(IDENTITY_VIEWPORT)
    sync()
  }, [apply, sync])

  useEffect(() => {
    const frame = frameRef.current
    if (!frame) return

    /** นิ้ว/เมาส์ที่กดอยู่ตอนนี้ (พิกัดในกล่อง) — เกินหนึ่ง = หนีบ */
    const pointers = new Map<number, Point>()
    let gesture: Gesture | null = null
    // ขยับเกิน threshold แล้วหรือยัง — ตัวนี้คือสิ่งเดียวที่กัน "ลากแล้วกลายเป็นกด node"
    let dragged = false

    const pointAt = (event: PointerEvent): Point => viewPoint(event.clientX, event.clientY)

    const twoPointers = (ids: [number, number]): [Point, Point] | null => {
      const a = pointers.get(ids[0])
      const b = pointers.get(ids[1])
      return a && b ? [a, b] : null
    }

    const setDragging = (on: boolean): void => {
      frame.classList.toggle('ld-viewport-panning', on)
    }

    const endGesture = (): void => {
      gesture = null
      setDragging(false)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      sync()
    }

    /** นิ้วที่เหลืออยู่หนึ่งนิ้วหลังปล่อยไปหนึ่ง — ลากต่อจากตำแหน่งปัจจุบัน ไม่ใช่กระโดด */
    const regrab = (): void => {
      const [id] = [...pointers.keys()]
      const from = pointers.get(id)
      if (id === undefined || !from) return
      gesture = { kind: 'pan', pointerId: id, from, start: viewport.current }
    }

    function onMove(event: PointerEvent): void {
      if (!pointers.has(event.pointerId) || !gesture) return
      pointers.set(event.pointerId, pointAt(event))

      if (gesture.kind === 'pinch') {
        const now = twoPointers(gesture.ids)
        if (!now) return
        event.preventDefault()
        apply(pinchViewport(gesture.start, gesture.from, now))
        return
      }

      if (gesture.pointerId !== event.pointerId) return
      const now = pointers.get(event.pointerId)
      if (!now) return
      // ยังไม่เกิน threshold = ยังไม่ขยับภาพเลย ไม่งั้นการแตะ node จะเขยื้อนภาพ 2-3 px ทุกครั้ง
      if (!dragged) {
        if (!movedBeyond(gesture.from, now)) return
        dragged = true
        setDragging(true)
      }
      event.preventDefault()
      apply(panBy(gesture.start, now.x - gesture.from.x, now.y - gesture.from.y))
    }

    function onUp(event: PointerEvent): void {
      if (!pointers.delete(event.pointerId)) return
      if (pointers.size === 0) {
        endGesture()
        return
      }
      if (pointers.size === 1) regrab()
    }

    const fromControls = (target: EventTarget | null): boolean =>
      target instanceof Element && target.closest('.ld-viewport-controls') !== null

    const onDown = (event: PointerEvent): void => {
      // เมาส์ปุ่มขวา/กลางไม่ใช่การลาก (ปุ่มขวาต้องเหลือไว้ให้เมนูของเบราว์เซอร์)
      if (event.pointerType === 'mouse' && event.button !== 0) return
      // ปุ่มซูมลอยอยู่ในกล่องเดียวกัน — กดปุ่มไม่ใช่การเริ่มลากภาพ
      if (fromControls(event.target)) {
        // แต่ต้องล้างร่องรอยการลากครั้งก่อนด้วย ไม่งั้น click ของปุ่มโดนกลืนแทน node (dead click)
        dragged = false
        return
      }
      const point = pointAt(event)
      pointers.set(event.pointerId, point)

      if (pointers.size === 1) {
        dragged = false
        gesture = { kind: 'pan', pointerId: event.pointerId, from: point, start: viewport.current }
        window.addEventListener('pointermove', onMove, { passive: false })
        window.addEventListener('pointerup', onUp)
        window.addEventListener('pointercancel', onUp)
        return
      }

      if (pointers.size === 2) {
        const ids = [...pointers.keys()] as [number, number]
        const from = twoPointers(ids)
        if (!from) return
        // หนีบไม่มีวันเป็น "แตะ" — ตั้ง dragged ทันทีเพื่อไม่ให้ปล่อยนิ้วแล้วไปเปิด node
        dragged = true
        setDragging(true)
        gesture = { kind: 'pinch', ids, from, start: viewport.current }
      }
    }

    /**
     * ลากจบแล้ว click ยังตามมาเสมอ (เบราว์เซอร์ยิงให้ถ้า down/up อยู่บน element เดียวกัน) —
     * ต้องกลืนทิ้งตอน capture ก่อนถึง handler ของ node ไม่งั้นลากภาพทีเดียว panel เด้งเปิด
     */
    const onClickCapture = (event: MouseEvent): void => {
      if (fromControls(event.target)) return
      if (!dragged) return
      dragged = false
      event.stopPropagation()
      event.preventDefault()
    }

    /**
     * wheel = ซูมเฉพาะตอนกด ctrl/cmd (trackpad ของ mac ส่ง ctrlKey มาให้เองตอนหนีบสองนิ้ว)
     * — wheel เปล่าปล่อยผ่านให้หน้า scroll ตามปกติ ไม่งั้นไดอะแกรมกลายเป็นหลุมดักการเลื่อนหน้า
     */
    const onWheel = (event: WheelEvent): void => {
      if (!event.ctrlKey && !event.metaKey) return
      event.preventDefault()
      const focus = viewPoint(event.clientX, event.clientY)
      apply(zoomAt(viewport.current, Math.exp(-event.deltaY * WHEEL_ZOOM_SENSITIVITY), focus))
      sync()
    }

    frame.addEventListener('pointerdown', onDown)
    frame.addEventListener('click', onClickCapture, { capture: true })
    frame.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      frame.removeEventListener('pointerdown', onDown)
      frame.removeEventListener('click', onClickCapture, { capture: true })
      frame.removeEventListener('wheel', onWheel)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [apply, sync, viewPoint])

  return { frameRef, contentRef, scale, transformed, zoomIn, zoomOut, reset }
}
