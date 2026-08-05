import { useCallback, useEffect, useRef, useState } from 'react'

export interface AsyncState<T> {
  data: T | null
  error: Error | null
  /** โหลดครั้งแรกของ key นี้ — ยังไม่มีอะไรให้อ่านเลย */
  loading: boolean
  /** โหลดทับของเดิม (เช่นเพราะ SSE บอกว่าไฟล์เปลี่ยน) — ของเดิมยังอยู่บนจอ */
  refreshing: boolean
  reload: () => void
}

interface Internal<T> {
  key: string
  data: T | null
  error: Error | null
  loading: boolean
  refreshing: boolean
}

/**
 * โหลดข้อมูลจาก API — ผลของ request ที่ถูกแทนที่แล้วจะถูกทิ้งเสมอ
 *
 * `reload()` มีไว้ให้ SSE เรียกเมื่อไฟล์บนดิสก์เปลี่ยน: โหลดทับ **โดยไม่ล้างของเดิม**
 * เพื่อไม่ให้หน้าที่กำลังอ่านอยู่กะพริบเป็น "กำลังโหลด…" ทุกครั้งที่ agent เขียนไฟล์
 * และถ้าโหลดทับแล้วพลาด (เช่น agent เขียน run.json ค้างครึ่งไฟล์) ของเดิมก็ยังอยู่ให้อ่านต่อ
 * ส่วนการเปลี่ยน deps (ย้าย run / ย้าย section) คือของคนละชิ้น — ล้างทิ้งแล้วโหลดใหม่ตามปกติ
 */
export function useAsync<T>(load: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  const key = JSON.stringify(deps)
  const [nonce, setNonce] = useState(0)
  const [state, setState] = useState<Internal<T>>({
    key,
    data: null,
    error: null,
    loading: true,
    refreshing: false,
  })
  const seq = useRef(0)

  useEffect(() => {
    const id = ++seq.current
    setState((prev) =>
      prev.key === key
        ? { ...prev, refreshing: true }
        : { key, data: null, error: null, loading: true, refreshing: false },
    )
    load().then(
      (data) => {
        if (seq.current === id) {
          setState({ key, data, error: null, loading: false, refreshing: false })
        }
      },
      (error: unknown) => {
        if (seq.current !== id) return
        const err = error instanceof Error ? error : new Error(String(error))
        setState((prev) => ({
          key,
          data: prev.key === key ? prev.data : null,
          error: err,
          loading: false,
          refreshing: false,
        }))
      },
    )
    return () => {
      // request ที่ยังค้างอยู่ถือว่าถูกยกเลิก — ผลของมันต้องไม่ทับ state ปัจจุบัน
      seq.current++
    }
    // `load` ต้องถูก useCallback ให้ตรงกับ deps ชุดนี้จากฝั่งผู้เรียกเอง
  }, [key, nonce])

  const reload = useCallback(() => setNonce((n) => n + 1), [])

  return {
    data: state.data,
    error: state.error,
    loading: state.loading,
    refreshing: state.refreshing,
    reload,
  }
}
