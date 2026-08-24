import type { RunEventStatus } from '@/lib/use-run-events'
import { cn } from '@/lib/utils'

interface Props {
  status: RunEventStatus
  /** จำนวน section ที่มีไฟล์แล้ว / ทั้งหมดที่ประกาศไว้ */
  written: number
  total: number
}

/**
 * สถานะการสร้างเนื้อหาใน header — ผู้อ่านต้องแยกออกว่า "ยังเขียนไม่เสร็จ" กับ "หายไป" คนละเรื่อง
 * และต้องรู้ว่าหน้ากำลังรับ update สดอยู่ไหม (สายหลุด = สิ่งที่เห็นอาจเก่าแล้ว)
 */
export function LiveStatus({ status, written, total }: Props) {
  const done = written >= total
  const label =
    status === 'offline'
      ? 'สายอัปเดตสดหลุด — กำลังลองต่อใหม่ ถ้าไม่กลับมาเองให้ refresh'
      : status === 'connecting'
        ? 'กำลังต่อสายอัปเดตสด…'
        : done
          ? 'เขียนครบทุกหน้าแล้ว'
          : 'กำลังเขียนอยู่ — หน้าใหม่จะขึ้นเอง'

  return (
    <span className="flex items-center gap-1.5" title={label}>
      <span
        className={cn(
          'inline-flex size-2 rounded-full',
          status === 'offline' && 'bg-red-500',
          status === 'connecting' && 'bg-muted-foreground',
          status === 'live' && (done ? 'bg-emerald-500' : 'animate-pulse bg-amber-500'),
        )}
      />
      <span>
        {written}/{total} หน้า
      </span>
      {status !== 'live' ? <span>· {label}</span> : done ? null : <span>· กำลังเขียน</span>}
    </span>
  )
}
