import { ChevronDown, ChevronRight } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { useReadingPanelState } from '@/components/run/panel-context'
import { useRun } from '@/components/run/run-context'
import { ApiClientError, fetchReferences, type ReferenceGroup, type ReferenceHit } from '@/lib/api'
import { baseName } from '@/lib/reading-panel'
import { useAsync } from '@/lib/use-async'

/**
 * รายการ find-references (Shift+F12) — CONTRACT-f12 §4.1, §5 (agent C)
 *
 * เต็ม panel เหมือน reading list ธรรมดา (ได้ back/forward history ฟรี) จัดกลุ่มตามไฟล์
 * ชั้น "มั่นใจ" (confident) แสดงเปิดอยู่เสมอ ส่วน "ยืนยันไม่ได้" (unconfirmed) พับไว้พร้อมจำนวน —
 * ห้ามซ่อนทิ้งเด็ดขาด เพราะ false negative อันตรายกว่า noise (issue #36 → หลักตัดสิน)
 */

/** เกิน 5 วินาทีถือว่านานพอจะบอกผู้อ่านว่า index ยังไม่พร้อม (issue #36 user story 19) */
const SLOW_INDEX_MS = 5000

function ReferenceRow({ hit, onJump }: { hit: ReferenceHit; onJump: (line: number) => void }) {
  return (
    <button
      type="button"
      onClick={() => onJump(hit.line)}
      className="flex w-full items-start gap-2 rounded px-2 py-1 text-left hover:bg-muted"
    >
      <span className="mt-0.5 shrink-0 font-mono text-[10px] text-muted-foreground tabular-nums">{hit.line}</span>
      <code className="min-w-0 flex-1 truncate font-mono text-xs">{hit.context}</code>
    </button>
  )
}

function ReferenceFileGroup({ group, onJump }: { group: ReferenceGroup; onJump: (path: string, line: number) => void }) {
  const confident = group.refs.filter((r) => r.confidence === 'confident')
  const unconfirmed = group.refs.filter((r) => r.confidence === 'unconfirmed')
  const [showUnconfirmed, setShowUnconfirmed] = useState(false)

  return (
    <section className="overflow-hidden rounded-lg border">
      <header className="border-b bg-muted/50 px-3 py-1.5">
        <p className="truncate font-mono text-xs" title={group.path}>
          {group.path}
          <span className="ml-2 text-muted-foreground">{group.refs.length} จุด</span>
        </p>
      </header>
      <div className="p-1">
        {confident.map((hit, i) => (
          <ReferenceRow key={`c-${i}`} hit={hit} onJump={(line) => onJump(group.path, line)} />
        ))}
        {unconfirmed.length > 0 ? (
          <div className="mt-1 border-t pt-1">
            <button
              type="button"
              onClick={() => setShowUnconfirmed((v) => !v)}
              className="flex w-full items-center gap-1 rounded px-2 py-1 text-left text-[11px] text-muted-foreground hover:bg-muted"
            >
              {showUnconfirmed ? (
                <ChevronDown className="size-3" aria-hidden />
              ) : (
                <ChevronRight className="size-3" aria-hidden />
              )}
              ชื่อตรงแต่ยืนยันไม่ได้ ({unconfirmed.length})
            </button>
            {showUnconfirmed
              ? unconfirmed.map((hit, i) => (
                  <ReferenceRow key={`u-${i}`} hit={hit} onJump={(line) => onJump(group.path, line)} />
                ))
              : null}
          </div>
        ) : null}
      </div>
    </section>
  )
}

export function ReferencesPanel({
  path,
  line,
  col,
  symbol,
}: {
  path: string
  line: number
  col: number
  symbol: string
}) {
  const { run } = useRun()
  const panel = useReadingPanelState()

  const load = useCallback(() => fetchReferences(run.id, { path, line, col }), [run.id, path, line, col])
  const refs = useAsync(load, ['references', run.id, path, line, col])

  // เกิน 5 วิยังไม่มา = บอกตรง ๆ ว่า index ยังสร้างไม่เสร็จ ไม่ใช่แค่ "กำลังโหลด" เฉย ๆ (issue #36 user story 19)
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    setSlow(false)
    if (!refs.loading) return
    const timer = window.setTimeout(() => setSlow(true), SLOW_INDEX_MS)
    return () => window.clearTimeout(timer)
  }, [refs.loading, path, line, col])

  const totalConfident = useMemo(
    () => (refs.data?.groups ?? []).reduce((n, g) => n + g.refs.filter((r) => r.confidence === 'confident').length, 0),
    [refs.data],
  )

  const jump = useCallback(
    (jumpPath: string, jumpLine: number) => {
      // เปิดทั้งไฟล์ (เหมือนเปิดจากชื่อไฟล์ในเนื้อความ) — ผู้อ่านต้องเห็นบริบทรอบจุดเรียกใช้ ไม่ใช่แค่บรรทัดเดียว
      // focusLine ไว้ flash highlight ตำแหน่งที่คลิกมา — scrollTop ของรายการ references ถูกบันทึกอัตโนมัติ
      // ผ่าน reportScroll ของ ReadingPanel เอง ไม่ต้องส่งเองที่นี่
      panel.openTarget({ kind: 'file', path: jumpPath, from: null, to: null, focusLine: jumpLine })
    },
    [panel],
  )

  return (
    <div className="space-y-3">
      <div className="rounded-lg border bg-muted/30 px-3 py-2 text-xs">
        <p className="font-mono">
          references ของ <span className="font-semibold">{symbol}</span>
        </p>
        <p className="mt-0.5 truncate text-muted-foreground" title={`${path}:${line}`}>
          จาก {baseName(path)}:{line}
        </p>
      </div>

      {refs.loading && !refs.data ? (
        <p className="px-1 py-4 text-xs text-muted-foreground">
          {slow ? 'index ของ repo นี้ยังสร้างไม่เสร็จ — รอสักครู่…' : 'กำลังหา references…'}
        </p>
      ) : null}

      {refs.error && !refs.data ? (
        <div className="rounded-lg border border-red-400 bg-red-50 px-3 py-2 text-xs dark:bg-red-950/30">
          <p className="font-medium text-red-900 dark:text-red-200">หา references ไม่ได้</p>
          <p className="mt-1 text-red-900/90 dark:text-red-200/90">{refs.error.message}</p>
          <p className="mt-1 font-mono opacity-70">
            {refs.error instanceof ApiClientError ? refs.error.code : 'client_error'}
          </p>
        </div>
      ) : null}

      {refs.data && refs.data.total === 0 ? (
        <div className="rounded-lg border px-3 py-3 text-xs">
          <p className="font-medium">ไม่พบการเรียกใช้ใน repo</p>
          <p className="mt-1 text-muted-foreground">
            อาจถูกเรียกแบบ dynamic (เช่น <code className="font-mono">getattr</code>, URL routing, หรือ template)
            ซึ่ง index แบบ syntactic นี้มองไม่เห็น — ไม่ได้แปลว่าเป็น dead code แน่นอน
          </p>
        </div>
      ) : null}

      {refs.data && refs.data.total > 0 ? (
        <>
          <p className="px-1 text-[11px] text-muted-foreground">
            {refs.data.total} จุด · {refs.data.groups.length} ไฟล์ · มั่นใจ {totalConfident} จุด
          </p>
          <div className="space-y-2">
            {refs.data.groups.map((group) => (
              <ReferenceFileGroup key={group.path} group={group} onJump={jump} />
            ))}
          </div>
        </>
      ) : null}
    </div>
  )
}
