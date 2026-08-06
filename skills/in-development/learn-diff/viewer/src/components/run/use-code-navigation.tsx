import { X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { useReadingPanelState } from '@/components/run/panel-context'
import { PeekReferences } from '@/components/run/peek-references'
import { useRun } from '@/components/run/run-context'
import { ApiClientError, fetchDefinition, type DefinitionTarget } from '@/lib/api'
import type { CodeControls, NavRequest } from '@/lib/code'
import { showToast } from '@/lib/toast'

/**
 * ตัวกลางของ code navigation ฝั่ง client (issue #36, CONTRACT-f12 §4.3)
 *
 * รับ NavRequest จากกำแพง CodeMirror (F12 / Shift+F12 / Cmd+click — plain data ล้วน)
 * แล้วแปลงเป็นการกระทำของ reading panel:
 * - references → เปิด target ชนิด references (panel component fetch เอง — รอ index ในนั้น)
 * - peek (Alt+F12) → กางรายการ references เป็น block widget ใต้บรรทัดใน code view แบบ VSCode
 *   (การทดลองจาก issue #36 — ไม่แตะ history ของ panel จนกว่าจะคลิกรายการ)
 * - definition exact → กระโดดเลย + toast แถมปุ่ม "ดูทั้งหมด" เมื่อมี candidate หลายตัว (story 12)
 * - definition ambiguous → เปิด candidate list ให้เลือก (ไม่เดาพาไปผิดที่ — story 11)
 * - definition none → toast "ไม่พบใน repo (อาจเป็น library ภายนอก)" ไม่เปิด panel (story 17)
 * - index ยังไม่พร้อม → server ค้างรอให้เงียบ ๆ · ฝั่งนี้แค่จับเวลา เกิน 5 วิ ค่อย toast (story 19)
 *
 * hook นี้เป็นของ "หนึ่งไฟล์ต้นทาง" (path ของ SpanCard ที่ยิง) — ผู้เรียก render `overlay`
 * ไว้ในตัวเองด้วย เพื่อให้ candidate list โผล่เฉพาะการ์ดที่กดจริง
 */

/** เกิน 5 วินาทีถือว่านานพอจะบอกผู้อ่านว่ากำลังรอ index — ก่อนหน้านั้นรอเงียบ ๆ (story 19) */
const SLOW_INDEX_MS = 5000

const KIND_LABEL: Record<DefinitionTarget['kind'], string> = {
  function: 'function',
  class: 'class',
  method: 'method',
  variable: 'variable',
  import: 'import',
  other: 'อื่น ๆ',
}

interface CandidateState {
  symbol: string
  candidates: DefinitionTarget[]
  /** true = เปิดจากปุ่ม show all หลัง resolve exact แล้ว (แค่เปลี่ยนหัวข้อความ) */
  showAll: boolean
}

function CandidateList({
  state,
  onPick,
  onClose,
}: {
  state: CandidateState
  onPick: (target: DefinitionTarget) => void
  onClose: () => void
}) {
  // Esc ปิด list ก่อนถึงมือ handler ปิด panel (ตัดหน้าโดย preventDefault ตาม convention ของช่องค้นหา)
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      event.preventDefault()
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed right-4 bottom-4 z-50 flex max-h-[60vh] w-[26rem] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-lg border bg-background shadow-xl"
      data-nav-candidates
    >
      <header className="flex items-center gap-2 border-b bg-muted/50 px-3 py-2">
        <p className="min-w-0 flex-1 truncate text-xs">
          {state.showAll ? 'definition ทั้งหมดของ ' : 'เลือก definition ของ '}
          <span className="font-mono font-semibold">{state.symbol}</span>
          <span className="ml-1 text-muted-foreground">({state.candidates.length} ที่)</span>
        </p>
        <button
          type="button"
          onClick={onClose}
          title="ปิดรายการ (Esc)"
          aria-label="ปิดรายการ"
          className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      </header>
      <div className="flex-1 overflow-y-auto p-1">
        {state.candidates.map((candidate, i) => (
          <button
            key={`${candidate.path}:${candidate.line}:${i}`}
            type="button"
            onClick={() => onPick(candidate)}
            className="block w-full rounded px-2 py-1.5 text-left hover:bg-muted"
          >
            <p className="truncate font-mono text-xs" title={`${candidate.path}:${candidate.line}`}>
              {candidate.path}
              <span className="ml-1 text-muted-foreground">:{candidate.line}</span>
              <span className="ml-2 rounded border px-1 text-[10px] text-muted-foreground">
                {KIND_LABEL[candidate.kind]}
              </span>
            </p>
            <code className="mt-0.5 block truncate font-mono text-[11px] text-muted-foreground">
              {candidate.context.trim()}
            </code>
          </button>
        ))}
      </div>
    </div>
  )
}

/** peek หนึ่งกล่องที่กำลังกางอยู่ — node เป็น DOM ที่ฝากไว้กับกำแพง CodeMirror (portal เข้าไป render) */
interface PeekState {
  symbol: string
  line: number
  col: number
  node: HTMLElement
}

export function useCodeNavigation(
  path: string,
  /** handle ของ editor ที่ยิง NavRequest มา — ต้องมีถึงจะเปิด peek (Alt+F12) ได้ */
  editorRef?: React.RefObject<CodeControls | null>,
): {
  onNavigate: (req: NavRequest) => void
  overlay: React.ReactNode
} {
  const { run } = useRun()
  const panel = useReadingPanelState()
  const [candidateState, setCandidateState] = useState<CandidateState | null>(null)
  const [peekState, setPeekState] = useState<PeekState | null>(null)
  // เลขรอบของ request ล่าสุด — กด F12 ซ้ำเร็ว ๆ แล้วผลของรอบเก่าที่เพิ่งมาถึงต้องถูกทิ้ง ไม่พาไปผิดที่
  const seq = useRef(0)

  const closePeek = useCallback(() => {
    editorRef?.current?.closePeek()
    setPeekState(null)
  }, [editorRef])

  const jumpTo = useCallback(
    (target: DefinitionTarget) => {
      // เปิดช่วงของ definition ทั้งก้อน (from–to) แล้ว flash ที่บรรทัดชื่อ symbol (§4.3)
      panel.openTarget({ kind: 'file', path: target.path, from: target.from, to: target.to, focusLine: target.line })
    },
    [panel],
  )

  const onNavigate = useCallback(
    (req: NavRequest) => {
      setCandidateState(null)
      if (req.action === 'peek') {
        // Alt+F12: กางรายการ references ใต้บรรทัดแทนการเปิดเต็ม panel — ไม่แตะ history เลย
        // node เดียวต่อ peek: ฝากกับกำแพง CodeMirror แล้ว portal เนื้อหาเข้าไป (ดู overlay ข้างล่าง)
        const editor = editorRef?.current
        if (!editor) return
        const node = document.createElement('div')
        editor.openPeek(req.line, node)
        setPeekState({ symbol: req.symbol, line: req.line, col: req.col, node })
        return
      }
      if (req.action === 'references') {
        // panel component fetch /references เอง (loading + รอ index อยู่ในนั้น — §4.1)
        panel.openTarget({ kind: 'references', path, line: req.line, col: req.col, symbol: req.symbol })
        return
      }

      const round = ++seq.current
      // รอเงียบ ๆ ระหว่าง server ค้างรอ index — เกิน 5 วิ ค่อยบอก (ไม่ใช่ error แค่ช้า)
      const slowTimer = window.setTimeout(() => {
        if (seq.current === round) showToast('index ของ repo นี้ยังสร้างไม่เสร็จ — กำลังรอผลอยู่…')
      }, SLOW_INDEX_MS)

      fetchDefinition(run.id, { path, line: req.line, col: req.col })
        .then((res) => {
          if (seq.current !== round) return
          if (res.resolution === 'exact' && res.resolved) {
            jumpTo(res.resolved)
            // show all ได้แม้ resolve แล้ว (story 12) — candidates ติดมากับ response อยู่แล้ว ไม่ยิงซ้ำ
            if (res.candidates.length > 1) {
              showToast(`ไปที่ definition ของ ${res.symbol} แล้ว`, {
                label: `ดูทั้งหมด ${res.candidates.length} ที่`,
                onClick: () =>
                  setCandidateState({ symbol: res.symbol, candidates: res.candidates, showAll: true }),
              })
            }
            return
          }
          if (res.resolution === 'ambiguous' && res.candidates.length > 0) {
            setCandidateState({ symbol: res.symbol, candidates: res.candidates, showAll: false })
            return
          }
          showToast(`ไม่พบ definition ของ ${res.symbol} ใน repo (อาจเป็น library ภายนอก)`)
        })
        .catch((err: unknown) => {
          if (seq.current !== round) return
          // "ตำแหน่งนั้นไม่ใช่ identifier" เกิดได้ปกติ (กด F12 บน whitespace) — บอกเบา ๆ พอ
          if (err instanceof ApiClientError && err.code === 'no_symbol_at_position') {
            showToast('ตำแหน่ง cursor ไม่ได้อยู่บน identifier — เลื่อนไปวางบนชื่อก่อนกด F12')
            return
          }
          showToast(`หา definition ไม่ได้: ${err instanceof Error ? err.message : String(err)}`)
        })
        .finally(() => window.clearTimeout(slowTimer))
    },
    [panel, path, run.id, jumpTo, editorRef],
  )

  const overlay = (
    <>
      {candidateState ? (
        <CandidateList
          state={candidateState}
          onPick={(target) => {
            setCandidateState(null)
            jumpTo(target)
          }}
          onClose={() => setCandidateState(null)}
        />
      ) : null}
      {/* เนื้อหา peek — portal เข้า node ที่ฝากไว้กับกำแพง CodeMirror (openPeek) */}
      {peekState
        ? createPortal(
            <PeekReferences
              path={path}
              line={peekState.line}
              col={peekState.col}
              symbol={peekState.symbol}
              onJump={(jumpPath, jumpLine) => {
                // กระโดดผ่านเส้นทางเดิมของ panel (เปิดทั้งไฟล์ + flash) — ได้ปุ่มกลับสองชั้นฟรี
                closePeek()
                panel.openTarget({ kind: 'file', path: jumpPath, from: null, to: null, focusLine: jumpLine })
              }}
              onClose={closePeek}
            />,
            peekState.node,
          )
        : null}
    </>
  )

  return { onNavigate, overlay }
}
