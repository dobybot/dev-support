import { ChevronDown, ChevronRight, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { useRun } from '@/components/run/run-context'
import { ApiClientError, fetchReferences, type ReferenceGroup } from '@/lib/api'
import { baseName } from '@/lib/reading-panel'
import { useAsync } from '@/lib/use-async'

/**
 * เนื้อหาของ peek widget (Alt+F12) — รายการ references กางใต้บรรทัดใน code view แบบ VSCode
 * (issue #36 → การทดลอง peek แยก worktree)
 *
 * component นี้ถูก render ผ่าน portal เข้าไปใน DOM node ที่ฝากไว้กับกำแพง CodeMirror
 * (`CodeControls.openPeek`) — มันจึงไม่รู้จัก CodeMirror เลย แค่เป็นกล่อง HTML ธรรมดา
 * ที่บังเอิญไปโผล่ใต้บรรทัดโค้ด · ต่างจาก ReferencesPanel ตรงที่ไม่ยุ่งกับ history ของ
 * reading panel เลย: เปิด-ปิดอยู่กับที่ ไม่พาผู้อ่านไปไหนจนกว่าจะคลิกรายการ (ตอนนั้นค่อย
 * มอบงานกระโดดให้ผู้เรียกผ่าน `onJump` ซึ่งใช้เส้นทางเดิมของ panel — ได้ปุ่มกลับสองชั้นฟรี)
 *
 * Esc ปิด peek ก่อนถึงมือ handler ปิด panel — ฟังแบบ capture บน window เพื่อชิงตัดหน้า
 * listener แบบ bubble ของ ReadingPanel (ซึ่งเช็ค defaultPrevented อยู่แล้ว)
 */

/** เกิน 5 วินาทีถือว่านานพอจะบอกผู้อ่านว่า index ยังไม่พร้อม (issue #36 user story 19) */
const SLOW_INDEX_MS = 5000

function PeekFileGroup({
  group,
  onJump,
}: {
  group: ReferenceGroup
  onJump: (path: string, line: number) => void
}) {
  const confident = group.refs.filter((r) => r.confidence === 'confident')
  const unconfirmed = group.refs.filter((r) => r.confidence === 'unconfirmed')
  const [showUnconfirmed, setShowUnconfirmed] = useState(false)

  const row = (hit: (typeof group.refs)[number], key: string) => (
    <button
      key={key}
      type="button"
      onClick={() => onJump(group.path, hit.line)}
      className="flex w-full items-start gap-2 rounded px-2 py-0.5 text-left hover:bg-muted"
    >
      <span className="mt-0.5 shrink-0 font-mono text-[10px] text-muted-foreground tabular-nums">{hit.line}</span>
      <code className="min-w-0 flex-1 truncate font-mono text-[11px]">{hit.context}</code>
    </button>
  )

  return (
    <section>
      <header className="sticky top-0 bg-muted/80 px-2 py-0.5 backdrop-blur-sm">
        <p className="truncate font-mono text-[10px] text-muted-foreground" title={group.path}>
          {group.path}
          <span className="ml-1.5">{group.refs.length} จุด</span>
        </p>
      </header>
      {confident.map((hit, i) => row(hit, `c-${i}`))}
      {unconfirmed.length > 0 ? (
        <>
          <button
            type="button"
            onClick={() => setShowUnconfirmed((v) => !v)}
            className="flex w-full items-center gap-1 rounded px-2 py-0.5 text-left text-[10px] text-muted-foreground hover:bg-muted"
          >
            {showUnconfirmed ? (
              <ChevronDown className="size-3" aria-hidden />
            ) : (
              <ChevronRight className="size-3" aria-hidden />
            )}
            ชื่อตรงแต่ยืนยันไม่ได้ ({unconfirmed.length})
          </button>
          {showUnconfirmed ? unconfirmed.map((hit, i) => row(hit, `u-${i}`)) : null}
        </>
      ) : null}
    </section>
  )
}

export function PeekReferences({
  path,
  line,
  col,
  symbol,
  onJump,
  onClose,
}: {
  path: string
  line: number
  col: number
  symbol: string
  /** ผู้อ่านคลิกรายการ — ผู้เรียกพาไปที่ตำแหน่งนั้น (แล้วปิด peek เอง) */
  onJump: (path: string, line: number) => void
  onClose: () => void
}) {
  const { run } = useRun()

  const load = useCallback(() => fetchReferences(run.id, { path, line, col }), [run.id, path, line, col])
  const refs = useAsync(load, ['peek-references', run.id, path, line, col])

  const [slow, setSlow] = useState(false)
  useEffect(() => {
    setSlow(false)
    if (!refs.loading) return
    const timer = window.setTimeout(() => setSlow(true), SLOW_INDEX_MS)
    return () => window.clearTimeout(timer)
  }, [refs.loading, path, line, col])

  // Esc ปิด peek ก่อนใคร — capture phase บน window มาก่อน listener แบบ bubble ของ panel เสมอ
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      event.preventDefault()
      onClose()
    }
    window.addEventListener('keydown', onKey, { capture: true })
    return () => window.removeEventListener('keydown', onKey, { capture: true })
  }, [onClose])

  const totalConfident = useMemo(
    () => (refs.data?.groups ?? []).reduce((n, g) => n + g.refs.filter((r) => r.confidence === 'confident').length, 0),
    [refs.data],
  )

  return (
    <div className="flex h-full min-h-0 flex-col bg-background text-foreground" data-peek-references>
      <header className="flex shrink-0 items-center gap-2 border-b bg-muted/50 px-2 py-1">
        <p className="min-w-0 flex-1 truncate text-[11px]">
          references ของ <span className="font-mono font-semibold">{symbol}</span>
          {refs.data ? (
            <span className="ml-1.5 text-muted-foreground">
              {refs.data.total} จุด · {refs.data.groups.length} ไฟล์ · มั่นใจ {totalConfident} จุด
            </span>
          ) : null}
          <span className="ml-1.5 text-muted-foreground">(จาก {baseName(path)}:{line})</span>
        </p>
        <button
          type="button"
          onClick={onClose}
          title="ปิด peek (Esc)"
          aria-label="ปิด peek"
          className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-1">
        {refs.loading && !refs.data ? (
          <p className="px-2 py-3 text-[11px] text-muted-foreground">
            {slow ? 'index ของ repo นี้ยังสร้างไม่เสร็จ — รอสักครู่…' : 'กำลังหา references…'}
          </p>
        ) : null}

        {refs.error && !refs.data ? (
          <div className="px-2 py-2 text-[11px]">
            <p className="font-medium text-red-900 dark:text-red-200">หา references ไม่ได้</p>
            <p className="mt-0.5 text-red-900/90 dark:text-red-200/90">{refs.error.message}</p>
            <p className="mt-0.5 font-mono opacity-70">
              {refs.error instanceof ApiClientError ? refs.error.code : 'client_error'}
            </p>
          </div>
        ) : null}

        {refs.data && refs.data.total === 0 ? (
          <div className="px-2 py-2 text-[11px]">
            <p className="font-medium">ไม่พบการเรียกใช้ใน repo</p>
            <p className="mt-0.5 text-muted-foreground">
              อาจถูกเรียกแบบ dynamic (เช่น <code className="font-mono">getattr</code>, URL routing, template)
              ซึ่ง index แบบ syntactic มองไม่เห็น — ไม่ได้แปลว่าเป็น dead code
            </p>
          </div>
        ) : null}

        {refs.data && refs.data.total > 0
          ? refs.data.groups.map((group) => <PeekFileGroup key={group.path} group={group} onJump={onJump} />)
          : null}
      </div>
    </div>
  )
}
