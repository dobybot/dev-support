import { ArrowLeft, ArrowRight, ChevronsDownUp, ChevronsUpDown, CircleHelp, Columns2, CornerUpLeft, Maximize2, Minimize2, Rows3, Search, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { CodeView, SplitCodeView, type CodeControls } from '@/components/run/code-view'
import { useReadingPanelState } from '@/components/run/panel-context'
import { ReferencesPanel } from '@/components/run/references-panel'
import { useRun } from '@/components/run/run-context'
import { useCodeNavigation } from '@/components/run/use-code-navigation'
import { ApiClientError, fetchDiff, fetchFile } from '@/lib/api'
import type { CodePin } from '@/lib/code'
import { buildRows, docText, splitDocs, unifiedDoc, type DiffMode } from '@/lib/diff'
import { baseName, fileIndex, resolveTarget, type PanelSpan } from '@/lib/reading-panel'
import { useAsync } from '@/lib/use-async'
import { cn } from '@/lib/utils'

/**
 * Reading-list panel — ของชิ้นที่ diff viewer ให้ไม่ได้
 *
 * แสดง "ลำดับการอ่าน" ที่ agent เลือกไว้: ช่วงโค้ดข้ามไฟล์ เรียงตามที่ agent เขียน
 * (ไม่ใช่เรียงตามไฟล์) ทุกช่วงมีหนึ่งบรรทัดว่า "อ่านอันนี้ทำไม" และรวมโค้ดที่ PR ไม่ได้แตะด้วย
 *
 * ข้อบังคับเชิงเลย์เอาต์: panel นี้เป็น flex sibling ของเนื้อหา — มัน **ดันเนื้อหาให้แคบลง**
 * ไม่ใช่ลอยทับ (ห้ามใช้ fixed/absolute กับตัวกล่อง) เพราะผู้อ่านต้องเห็นคำอธิบายกับโค้ดพร้อมกัน
 *
 * ทุกช่วง "กางเป็นทั้งไฟล์" ได้ที่เดิม (user story 18) โดยยังคงสีของ diff ไว้ และยังเห็นหมุด
 * ของช่วงอื่นในไฟล์เดียวกัน — การซูมออกต้องไม่ทำให้หลุดจากลำดับการอ่าน (user story 19)
 */

const TONE: Record<PanelSpan['kind'], { label: string; frame: string; head: string; badge: string; code: string }> = {
  // "แก้แล้ว" กับ "ของเดิม" ต้องแยกออกจากกันด้วยตาเปล่า — ผู้อ่านห้ามสับสนว่าอันไหนคือพฤติกรรมใหม่
  changed: {
    label: 'PR นี้แก้',
    frame: 'border-amber-400 dark:border-amber-800',
    head: 'bg-amber-50 dark:bg-amber-950/40',
    badge: 'border-amber-500 bg-amber-100 text-amber-900 dark:bg-amber-900/60 dark:text-amber-100',
    code: 'bg-amber-50/40 dark:bg-amber-950/15',
  },
  // ตัวแสดงเดียวกันเป๊ะ ต่างแค่ "ไม่ลงสี" — ไม่ใช่โค้ดคนละทาง (SPEC-v3 → Viewer UI)
  context: {
    label: 'ของเดิม (บริบท)',
    frame: 'border-border',
    head: 'bg-muted/50',
    badge: 'border-border bg-muted text-muted-foreground',
    code: '',
  },
}

/** ช่วงที่ยาวกว่านี้ (หรือกางทั้งไฟล์) ให้ editor สูงคงที่แล้ว scroll เอง — CodeMirror จะได้ virtualize */
const TALL_SPAN_LINES = 60
const TALL_HEIGHT = '65vh'

function rangeLabel(span: PanelSpan): string {
  if (span.from == null) return 'ทั้งไฟล์'
  if (span.to == null || span.to === span.from) return `บรรทัด ${span.from}`
  return `บรรทัด ${span.from}–${span.to}`
}

function spanDomId(index: number): string {
  return `ld-span-${index}`
}

/** ปุ่มเล็กในหัว/ท้ายการ์ด — หน้าตาเดียวกันหมด */
function MiniButton({
  label,
  onClick,
  active,
  children,
}: {
  label: string
  onClick: () => void
  active?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        'flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-muted',
        active && 'bg-foreground/85 text-background hover:bg-foreground/85',
      )}
    >
      {children}
    </button>
  )
}

/** สลับ unified ↔ side-by-side · เป็นค่าของผู้อ่านทั้งแอป ไม่ใช่ของการ์ดใบนี้ใบเดียว */
function DiffModeToggle({ mode, onChange }: { mode: DiffMode; onChange: (mode: DiffMode) => void }) {
  return (
    <span
      className="flex items-center gap-0.5 rounded border p-0.5"
      title="โหมดการแสดง diff — จำไว้ข้ามไฟล์และข้ามครั้งที่เปิด"
      data-diff-mode={mode}
    >
      <MiniButton label="diff แบบรวมคอลัมน์เดียว" onClick={() => onChange('unified')} active={mode === 'unified'}>
        <Rows3 className="size-3" aria-hidden />
        รวม
      </MiniButton>
      <MiniButton label="diff แบบซ้าย-ขวา" onClick={() => onChange('split')} active={mode === 'split'}>
        <Columns2 className="size-3" aria-hidden />
        ซ้าย-ขวา
      </MiniButton>
    </span>
  )
}

/** นานเท่านี้ก่อน flash highlight ของจุดที่กระโดดมาจาง (go-to-definition / คลิก reference) หายไป */
const FOCUS_FLASH_MS = 1800

function SpanCard({
  index,
  span,
  runId,
  pins,
  focusLine,
}: {
  index: number
  span: PanelSpan
  runId: string
  /** ทุกช่วงของ "ไฟล์นี้" ในรายการเดียวกัน (รวมช่วงนี้ด้วย) — โผล่เป็นหมุดตอนกางทั้งไฟล์ */
  pins: CodePin[]
  /** บรรทัดที่ต้อง flash highlight — มาจาก navigation (F12 / คลิก reference) ไม่ใช่ agent (CONTRACT-f12 §4.3) */
  focusLine?: number
}) {
  const panel = useReadingPanelState()
  const tone = TONE[span.kind]
  const editor = useRef<CodeControls | null>(null)
  // F12 / Shift+F12 / Cmd+click จากกำแพง CodeMirror → definition/references (issue #36, §4.3)
  // ส่ง editor ref ให้ด้วย เพื่อให้ Alt+F12 กาง peek widget ใต้บรรทัดใน editor ตัวที่กดได้
  const nav = useCodeNavigation(span.path, editor)
  const [expanded, setExpanded] = useState(false)
  // pin ชั่วคราวที่จางหายเอง — ใช้กลไก pin ที่มีอยู่แล้วแทนการเปิด seam ใหม่เข้าไปในกำแพง CodeMirror
  const [flashPin, setFlashPin] = useState<CodePin | null>(null)

  const load = useCallback(
    () => fetchFile(runId, expanded ? { path: span.path } : { path: span.path, from: span.from, to: span.to }),
    [runId, span.path, span.from, span.to, expanded],
  )
  const file = useAsync(load, [runId, span.path, span.from, span.to, expanded])

  // diff เป็นของ "ไฟล์" ไม่ใช่ของช่วง — ขอทั้งไฟล์ครั้งเดียวแล้วใช้ได้ทั้งตอนย่อและตอนกาง
  const loadDiff = useCallback(() => fetchDiff(runId, span.path), [runId, span.path])
  const diff = useAsync(loadDiff, ['diff', runId, span.path])

  const hunks = useMemo(() => diff.data?.hunks ?? [], [diff.data])
  // ช่วง context ไม่ลงสี (SPEC-v3) — ยกเว้นตอนกางทั้งไฟล์ ซึ่งเป็นจังหวะที่คำถาม
  // "แล้ว PR แตะตรงไหนของไฟล์นี้บ้าง" สำคัญที่สุด
  const coloured = hunks.length > 0 && (span.kind === 'changed' || expanded)

  const rows = useMemo(() => {
    if (!file.data || !coloured) return null
    return buildRows({
      firstLine: file.data.from,
      lines: file.data.text.split('\n'),
      totalLines: file.data.totalLines,
      hunks,
    })
  }, [file.data, coloured, hunks])

  const unified = useMemo(
    () => (rows && panel.diffMode === 'unified' ? unifiedDoc(rows) : null),
    [rows, panel.diffMode],
  )
  const split = useMemo(() => (rows && panel.diffMode === 'split' ? splitDocs(rows) : null), [rows, panel.diffMode])
  const shownPins = useMemo(() => {
    const base = expanded ? pins : []
    return flashPin ? [...base, flashPin] : expanded ? base : undefined
  }, [expanded, pins, flashPin])

  const lineCount = file.data ? file.data.to - file.data.from + 1 : 0
  const height = expanded || lineCount > TALL_SPAN_LINES ? TALL_HEIGHT : null

  // กางแล้วต้องยังยืนอยู่ที่เดิม: เลื่อนไปบรรทัดแรกของช่วงที่กำลังอ่าน ไม่ใช่หัวไฟล์
  // deps รวม unified/split ด้วย เพราะเอกสารถูกสร้างใหม่เมื่อ diff โหลดเสร็จหรือสลับโหมด —
  // ทุกครั้งที่เอกสารเปลี่ยน ต้องกลับมายืนที่ช่วงเดิม ไม่ใช่หัวไฟล์
  useEffect(() => {
    if (!expanded || !file.data || span.from == null) return
    editor.current?.scrollToLine(span.from)
  }, [expanded, file.data, span.from, unified, split])

  // จุดที่กระโดดมาจาก go-to-definition / คลิก reference (CONTRACT-f12 §4.3) — เลื่อนไปแล้ว flash
  // ผ่านกลไก pin ที่มีอยู่แล้ว (ไม่เปิด seam ใหม่เข้ากำแพง CodeMirror) แล้วจางหายเอง
  useEffect(() => {
    // scrollToLine ตรงนี้ครอบเคสที่การ์ดถูก reuse (ไฟล์เดิมเปิดอยู่แล้ว กระโดดไปบรรทัดอื่น) —
    // เคส "การ์ดเพิ่ง mount" ใช้ prop `scrollToLine` ของ CodeView แทน เพราะการเรียกทันทีตอน
    // CodeMirror ยังไม่ measure ครั้งแรกจะหาย (ตำแหน่งถูก clamp เป็น 0) ส่วนกลไกตอนสร้าง editor
    // เชื่อถือได้ (พิสูจน์แล้วจากโหมดกางทั้งไฟล์)
    if (focusLine == null || !file.data) return
    editor.current?.scrollToLine(focusLine)
    setFlashPin({
      label: '→',
      from: focusLine,
      to: focusLine,
      kind: 'changed',
      title: 'ตำแหน่งที่กระโดดมา',
    })
    const timer = window.setTimeout(() => setFlashPin(null), FOCUS_FLASH_MS)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ตั้งใจไม่รวม unified/split: flash ครั้งเดียวตอนกระโดดมา ไม่ใช่ทุกครั้งที่เอกสารเปลี่ยน
  }, [focusLine, file.data])

  return (
    <article
      id={spanDomId(index)}
      data-span-kind={span.kind}
      data-expanded={expanded ? 'true' : 'false'}
      className={cn('overflow-hidden rounded-lg border', tone.frame)}
    >
      <header className={cn('border-b px-3 py-2', tone.frame, tone.head)}>
        <div className="flex items-start gap-2">
          <span className="mt-0.5 shrink-0 rounded bg-foreground/85 px-1.5 py-0.5 font-mono text-[10px] leading-4 text-background">
            {index + 1}
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-mono text-xs break-all">
              {span.path}
              <span className="ml-2 text-muted-foreground">
                {expanded ? `ทั้งไฟล์ (ช่วงที่อ่าน ${rangeLabel(span)})` : rangeLabel(span)}
              </span>
            </p>
            {/* "อ่านอันนี้ทำไม" — ห้ามให้ผู้อ่านจ้องโค้ดโดยไม่รู้ว่ามันตอบคำถามอะไร (user story 12) */}
            <p className="mt-1 text-xs leading-relaxed">{span.why}</p>
          </div>
          <span
            className={cn('mt-0.5 shrink-0 rounded-full border px-1.5 text-[10px] leading-4', tone.badge)}
          >
            {tone.label}
          </span>
        </div>

        {/* หมุดของช่วงอื่นในไฟล์เดียวกัน — กางแล้วยังกระโดดกลับเข้าลำดับการอ่านได้ */}
        {expanded && pins.length > 0 ? (
          <nav className="mt-2 flex flex-wrap items-center gap-1" data-span-pins>
            <span className="text-[10px] text-muted-foreground">หมุดในไฟล์นี้:</span>
            {pins.map((pin) => (
              <button
                key={`${pin.label}:${pin.from}`}
                type="button"
                title={pin.title}
                onClick={() => editor.current?.scrollToLine(pin.from)}
                className={cn(
                  'rounded border px-1.5 py-0.5 font-mono text-[10px] hover:bg-muted',
                  pin.kind === 'changed' && 'border-amber-500 text-amber-800 dark:text-amber-200',
                )}
              >
                #{pin.label} {pin.from}
                {pin.to !== pin.from ? `–${pin.to}` : ''}
              </button>
            ))}
          </nav>
        ) : null}
      </header>

      {file.loading && !file.data ? (
        <p className="px-3 py-4 text-xs text-muted-foreground">กำลังอ่านโค้ดจาก commit…</p>
      ) : null}
      {file.error && !file.data ? (
        <div className="px-3 py-3 text-xs text-red-800 dark:text-red-200">
          <p className="font-medium">อ่านช่วงนี้ไม่ได้</p>
          <p className="mt-1 opacity-90">{file.error.message}</p>
          <p className="mt-1 font-mono opacity-70">
            {file.error instanceof ApiClientError ? file.error.code : 'client_error'}
          </p>
        </div>
      ) : null}
      {file.data ? (
        <div className={cn(!coloured && tone.code)}>
          {split ? (
            <SplitCodeView
              viewRef={editor}
              left={split.left}
              right={split.right}
              language={file.data.language}
              pins={shownPins}
              height={height}
              scrollToLine={expanded ? span.from : (focusLine ?? null)}
              onNavigate={nav.onNavigate}
            />
          ) : (
            <CodeView
              viewRef={editor}
              text={unified ? docText(unified) : file.data.text}
              lines={unified}
              language={file.data.language}
              firstLine={file.data.from}
              pins={shownPins}
              height={height}
              scrollToLine={expanded ? span.from : (focusLine ?? null)}
              onNavigate={nav.onNavigate}
            />
          )}
        </div>
      ) : null}

      {/* candidate list ของ go-to-definition — โผล่เฉพาะการ์ดที่กดจริง */}
      {nav.overlay}

      {file.data ? (
        <footer className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t px-3 py-1 text-[11px] text-muted-foreground">
          <span className="font-mono">
            {file.data.language ?? 'text'} ·{' '}
            {expanded
              ? `ทั้งไฟล์ ${file.data.totalLines} บรรทัด`
              : `${lineCount} บรรทัด จากทั้งไฟล์ ${file.data.totalLines}`}
          </span>
          {coloured && diff.data ? (
            <span className="font-mono" title="จำนวนบรรทัดที่ต่างจาก base ทั้งไฟล์">
              <span className="text-green-700 dark:text-green-400">+{diff.data.addedLines}</span>{' '}
              <span className="text-red-700 dark:text-red-400">−{diff.data.removedLines}</span>
            </span>
          ) : null}
          {/* บอกให้รู้ว่าทำไมไม่มีสี — "ไม่มี diff" กับ "เทียบไม่ได้" คนละเรื่อง แก้คนละแบบ */}
          {diff.data?.status === 'unavailable' && (span.kind === 'changed' || expanded) ? (
            <span className="text-amber-700 dark:text-amber-400" title={diff.data.reason}>
              เทียบ diff ไม่ได้
            </span>
          ) : null}

          <span className="ml-auto flex items-center gap-1">
            {coloured ? <DiffModeToggle mode={panel.diffMode} onChange={panel.setDiffMode} /> : null}
            <MiniButton
              label={expanded ? 'ย่อกลับเป็นช่วงที่ agent เลือก' : 'กางเป็นทั้งไฟล์'}
              onClick={() => setExpanded((value) => !value)}
              active={expanded}
            >
              {expanded ? (
                <ChevronsDownUp className="size-3" aria-hidden />
              ) : (
                <ChevronsUpDown className="size-3" aria-hidden />
              )}
              {expanded ? 'ย่อ' : 'ทั้งไฟล์'}
            </MiniButton>
            <MiniButton label="ค้นหาในโค้ดก้อนนี้ (⌘F)" onClick={() => editor.current?.openSearch()}>
              <Search className="size-3" aria-hidden />
              ค้นหา
            </MiniButton>
          </span>
        </footer>
      ) : null}
    </article>
  )
}

/** ปุ่มช่วยเหลือ: popover สรุป shortcut ของ code navigation (#36) — ไม่มี popover lib ใน repo จึงเป็น state + div เบา ๆ */
function NavHelpButton() {
  const [open, setOpen] = useState(false)
  const shortcuts: [string, string][] = [
    ['Cmd+click / F12', 'ไปที่ definition — เจอหลาย candidate จะมี list ให้เลือก + ปุ่ม show all'],
    ['Shift+F12', 'references เต็ม panel จัดกลุ่มตามไฟล์ (ชั้น "ยืนยันไม่ได้" พับไว้) คลิกแล้ว jump + flash พร้อมปุ่มกลับสองชั้น'],
    ['Alt+F12', 'peek — กล่อง references ใต้บรรทัด (Esc ปิดเฉพาะ peek)'],
    ['Cmd+hover', 'ขีดเส้นใต้บอกจุดที่กดได้'],
  ]
  return (
    <span className="relative">
      <IconButton label="วิธีใช้ code navigation" onClick={() => setOpen((v) => !v)}>
        <CircleHelp className="size-3.5" aria-hidden />
      </IconButton>
      {open ? (
        <>
          <button
            type="button"
            aria-label="ปิดคำอธิบาย"
            className="fixed inset-0 z-20 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="absolute top-full right-0 z-30 mt-1.5 w-72 rounded-md border bg-popover p-3 text-popover-foreground shadow-md">
            <p className="mb-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
              code navigation
            </p>
            <dl className="space-y-2 text-xs">
              {shortcuts.map(([keys, desc]) => (
                <div key={keys}>
                  <dt className="font-mono font-medium">{keys}</dt>
                  <dd className="mt-0.5 text-muted-foreground">{desc}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-2 border-t pt-2 text-[11px] text-muted-foreground">
              ใน diff view ใช้ได้เฉพาะฝั่งใหม่ (pinned commit)
            </p>
          </div>
        </>
      ) : null}
    </span>
  )
}

/** ปุ่มเล็กในหัว panel — เหมือนกันหมดทั้ง ย้อนกลับ/ถัดไป/ปิด */
function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className="rounded-md border p-1 text-muted-foreground hover:bg-muted disabled:pointer-events-none disabled:opacity-35"
    >
      {children}
    </button>
  )
}

export function ReadingPanel() {
  const panel = useReadingPanelState()
  const { data, run } = useRun()
  const scroller = useRef<HTMLDivElement>(null)
  const { close, setWidth, fullscreen, toggleFullscreen } = panel

  const isReferences = panel.target?.kind === 'references'
  // `resolveTarget` รับแค่ list/file — target ชนิด references render ผ่าน <ReferencesPanel> แทน (§4.1)
  const resolved = useMemo(
    () => (panel.target && !isReferences ? resolveTarget(data, panel.target as Exclude<typeof panel.target, { kind: 'references' }>) : null),
    [data, panel.target, isReferences],
  )
  const files = useMemo(() => (resolved ? fileIndex(resolved.spans) : []), [resolved])
  const targetLabel = panel.target
    ? panel.target.kind === 'list'
      ? panel.target.listId
      : panel.target.kind === 'references'
        ? `refs:${panel.target.path}:${panel.target.line}:${panel.target.col}`
        : `${panel.target.path}:${panel.target.from ?? ''}-${panel.target.to ?? ''}:${panel.target.focusLine ?? ''}`
    : ''
  // บรรทัดที่ต้อง flash highlight — มีความหมายเฉพาะตอนเปิด target เดียวที่ไม่ใช่ list (kind='file')
  const focusLine = panel.target?.kind === 'file' ? panel.target.focusLine : undefined

  // หมุดต่อไฟล์ คิดครั้งเดียวต่อรายการ — การ์ดทุกใบของไฟล์เดียวกันเห็นหมุดชุดเดียวกัน
  // (ต้องเป็น memo: array ใหม่ทุก render จะสั่ง CodeMirror update ทุกครั้งที่ panel ขยับ)
  const pinsByFile = useMemo(() => {
    const map = new Map<string, CodePin[]>()
    resolved?.spans.forEach((span, i) => {
      if (span.from == null) return
      const pins = map.get(span.path) ?? []
      pins.push({
        label: String(i + 1),
        from: span.from,
        to: span.to ?? span.from,
        kind: span.kind,
        title: span.why,
      })
      map.set(span.path, pins)
    })
    return map
  }, [resolved])

  // Esc ปิด panel · แต่ Esc ที่ถูกใช้ไปแล้ว (เช่นปิดช่องค้นหาของ CodeMirror) ต้องไม่ปิดตามไปด้วย
  // ตอนเต็มหน้าจอ Esc ครั้งแรกออกจากเต็มหน้าจอก่อน ครั้งที่สองค่อยปิด (issue #30)
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      if (fullscreen) toggleFullscreen()
      else close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close, fullscreen, toggleFullscreen])

  // เปลี่ยน entry = คืน scroll ของ entry นั้นให้ (entry ใหม่เอี่ยมคือ 0 อยู่แล้วจาก pushTarget — CONTRACT-f12 §4.1)
  // `panel.scrollTop` มาจาก history เท่านั้น (ไม่ใช่ live scroll) จึงเปลี่ยนพอดีตอน entry เปลี่ยนเท่านั้น
  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = panel.scrollTop
  }, [targetLabel, panel.scrollTop])

  // จำ scrollTop สดไว้ตลอดเวลา — ใช้ตอน openTarget บันทึกลง entry ที่กำลังจะออกจากมัน (ไม่ throttle เพราะแค่เขียนลง ref)
  const onScroll = useCallback(() => {
    if (scroller.current) panel.reportScroll(scroller.current.scrollTop)
  }, [panel])

  const onHandleDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault()
      const handle = event.currentTarget
      handle.setPointerCapture(event.pointerId)
      document.body.style.userSelect = 'none'
      document.body.style.cursor = 'col-resize'

      const move = (e: PointerEvent) => setWidth(window.innerWidth - e.clientX, false)
      const up = (e: PointerEvent) => {
        handle.releasePointerCapture(e.pointerId)
        handle.removeEventListener('pointermove', move)
        handle.removeEventListener('pointerup', up)
        document.body.style.userSelect = ''
        document.body.style.cursor = ''
        // จำไว้ตอนปล่อยมือครั้งเดียว ไม่ใช่ทุก pixel ที่ลาก
        setWidth(window.innerWidth - e.clientX, true)
      }
      handle.addEventListener('pointermove', move)
      handle.addEventListener('pointerup', up)
    },
    [setWidth],
  )

  const jumpTo = useCallback((spanIndex: number) => {
    const container = scroller.current
    const target = container?.querySelector<HTMLElement>(`#${spanDomId(spanIndex)}`)
    if (!container || !target) return
    // เลื่อนแบบทันที ไม่ใช่ smooth: CodeMirror ในช่วงอื่น ๆ วัดขนาดตัวเองอยู่ตลอด
    // การ scroll ที่มันทำระหว่างนั้นยกเลิก smooth scroll ทิ้ง แล้วหมุดก็ "กดแล้วไม่ไปไหน"
    container.scrollTop = target.offsetTop - 8
  }, [])

  if (!panel.open || !panel.target || (!isReferences && !resolved)) return null

  // ปุ่ม "ย้อนกลับ" ตอนนี้พาไปที่รายการ references — เปลี่ยนแค่ label/icon ตัวเดียวกับปุ่มเดิม (§4.1)
  const backLabel = panel.backGoesToReferences ? 'กลับไปรายการอ้างอิง' : 'รายการก่อนหน้า'

  return (
    <div
      className={cn('relative shrink-0 border-l bg-background', fullscreen && 'w-full flex-1')}
      // เต็มหน้าจอ = ปล่อยให้ flex ยืดเอง — desiredWidth ไม่ถูกแตะ ออกแล้วได้ความกว้างเดิมคืน
      style={fullscreen ? undefined : { width: `${panel.width}px` }}
      data-reading-panel
    >
      {/* ขอบซ้ายลากได้ — อยู่ในกล่องของ panel เอง จึงไม่เคยทับเนื้อหา · เต็มหน้าจอไม่มีอะไรให้ลาก */}
      {fullscreen ? null : (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="ลากเพื่อปรับความกว้าง panel"
          onPointerDown={onHandleDown}
          className="absolute inset-y-0 -left-1 z-10 w-2 cursor-col-resize hover:bg-ring/40 active:bg-ring/60"
        />
      )}

      <div className="sticky top-0 flex h-screen flex-col">
        <header className="border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="mr-auto text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
              {isReferences ? 'references' : 'ลำดับการอ่าน'}
            </span>
            <NavHelpButton />
            {/* กลับไปอ่านต่อ — โผล่เฉพาะตอนมีที่อ่านค้างอยู่ก่อนจุดกระโดด (§4.1) */}
            {panel.canGoBackToReading ? (
              <IconButton label="กลับไปอ่านต่อ" onClick={panel.backToReading}>
                <CornerUpLeft className="size-3.5" aria-hidden />
              </IconButton>
            ) : null}
            <IconButton label={backLabel} onClick={panel.back} disabled={!panel.canBack}>
              <ArrowLeft className="size-3.5" aria-hidden />
            </IconButton>
            <IconButton label="รายการถัดไป" onClick={panel.forward} disabled={!panel.canForward}>
              <ArrowRight className="size-3.5" aria-hidden />
            </IconButton>
            <IconButton
              label={fullscreen ? 'ออกจากเต็มหน้าจอ (Esc)' : 'อ่านเต็มหน้าจอ'}
              onClick={toggleFullscreen}
            >
              {fullscreen ? (
                <Minimize2 className="size-3.5" aria-hidden />
              ) : (
                <Maximize2 className="size-3.5" aria-hidden />
              )}
            </IconButton>
            <IconButton label="ปิด panel (Esc)" onClick={panel.close}>
              <X className="size-3.5" aria-hidden />
            </IconButton>
          </div>

          {!isReferences && resolved ? (
            <>
              <h2 className="mt-1.5 text-sm leading-snug font-semibold">{resolved.title}</h2>
              <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                {resolved.spans.length} ช่วง · {files.length} ไฟล์ · commit {run.commit.slice(0, 9)}
              </p>

              {/* ดัชนีไฟล์ปักหมุด — กระโดดข้ามไฟล์ในรายการนี้ได้โดยไม่เสียลำดับ (user story 17) */}
              {files.length > 0 ? (
                <nav className="mt-2 flex flex-wrap gap-1">
                  {files.map((entry) => (
                    <button
                      key={entry.path}
                      type="button"
                      onClick={() => jumpTo(entry.firstSpan)}
                      title={entry.path}
                      className="max-w-full truncate rounded border px-1.5 py-0.5 font-mono text-[11px] hover:bg-muted"
                    >
                      {baseName(entry.path)}
                      {entry.count > 1 ? (
                        <span className="ml-1 text-muted-foreground">×{entry.count}</span>
                      ) : null}
                    </button>
                  ))}
                </nav>
              ) : null}
            </>
          ) : null}
        </header>

        <div ref={scroller} onScroll={onScroll} className="relative flex-1 space-y-3 overflow-y-auto p-3">
          {isReferences && panel.target.kind === 'references' ? (
            <ReferencesPanel
              path={panel.target.path}
              line={panel.target.line}
              col={panel.target.col}
              symbol={panel.target.symbol}
            />
          ) : null}

          {!isReferences && resolved?.missingListId ? (
            <div className="rounded-lg border border-red-400 bg-red-50 px-4 py-3 text-sm dark:bg-red-950/30">
              <p className="font-semibold text-red-900 dark:text-red-200">
                ไม่พบ reading list "{resolved.missingListId}"
              </p>
              <p className="mt-1 text-xs text-red-900/90 dark:text-red-200/90">
                มีที่อ้างถึง id นี้ แต่ไม่มีนิยามใน run.json — บอก agent ให้แก้
              </p>
            </div>
          ) : null}
          {!isReferences
            ? resolved?.spans.map((span, i) => (
                <SpanCard
                  key={`${span.path}:${span.from}:${i}`}
                  index={i}
                  span={span}
                  runId={run.id}
                  pins={pinsByFile.get(span.path) ?? []}
                  focusLine={resolved.spans.length === 1 ? focusLine : undefined}
                />
              ))
            : null}
        </div>
      </div>
    </div>
  )
}
