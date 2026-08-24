import { useEffect, useState } from 'react'

import type { RunChangeEvent } from '@/shared/types'

export type RunEventStatus = 'connecting' | 'live' | 'offline'

export interface RunEvents {
  status: RunEventStatus
  /** event ล่าสุด — component ที่สนใจ effect กับตัวนี้แล้วโหลดของตัวเองใหม่ */
  lastChange: RunChangeEvent | null
  /** เพิ่มขึ้นทุกครั้งที่ต่อสายติด (รวมการต่อใหม่หลังสายหลุด) */
  connectedAt: number
}

/**
 * ต่อ SSE ของ run แล้วรายงานว่าไฟล์เปลี่ยนอะไรบ้าง
 *
 * EventSource ต่อใหม่ให้เองเมื่อสายหลุด (server restart ตอนแก้ viewer เป็นเรื่องปกติ)
 * จึงไม่มี retry เขียนเองตรงนี้ — มีแค่การรายงานสถานะให้ header เอาไปโชว์
 */
export function useRunEvents(runId: string): RunEvents {
  const [status, setStatus] = useState<RunEventStatus>('connecting')
  const [lastChange, setLastChange] = useState<RunChangeEvent | null>(null)
  const [connectedAt, setConnectedAt] = useState(0)

  useEffect(() => {
    if (!runId) return
    setStatus('connecting')
    setLastChange(null)

    const source = new EventSource(`/api/runs/${encodeURIComponent(runId)}/events`)

    const onReady = (): void => {
      setStatus('live')
      // ไฟล์อาจเปลี่ยนไปแล้วระหว่างที่ยังต่อสายไม่ติด — บอกให้ผู้ใช้ hook โหลดสภาพจริงใหม่
      setConnectedAt(Date.now())
    }
    const onChange = (event: MessageEvent<string>): void => {
      try {
        setLastChange(JSON.parse(event.data) as RunChangeEvent)
      } catch {
        // event ที่ parse ไม่ออกแปลว่า contract เพี้ยน — ปล่อยผ่านดีกว่าทำหน้าพัง
      }
    }
    const onError = (): void => {
      // ไม่ว่าจะกำลังต่อใหม่หรือปิดสายถาวร ตอนนี้ก็ "ไม่ได้รับสด" เหมือนกัน — บอกตามจริง
      setStatus('offline')
    }

    source.addEventListener('ready', onReady)
    source.addEventListener('change', onChange)
    source.addEventListener('error', onError)
    // server เฝ้าโฟลเดอร์ไม่ได้แล้ว (เช่นถูกลบทิ้ง) — นับเป็นสายหลุดเหมือนกัน
    source.addEventListener('fatal', onError)

    return () => {
      source.removeEventListener('ready', onReady)
      source.removeEventListener('change', onChange)
      source.removeEventListener('error', onError)
      source.removeEventListener('fatal', onError)
      source.close()
    }
  }, [runId])

  return { status, lastChange, connectedAt }
}
