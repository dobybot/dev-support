import { Maximize, Minus, Plus } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { useOptionalReadingPanel } from '@/components/run/panel-context'
import { useRun } from '@/components/run/run-context'
import {
  clearDiagram,
  renderDiagram,
  type DiagramNodeHit,
  type DiagramRenderResult,
  type DiagramViolation,
} from '@/lib/diagram'
import { useDarkMode } from '@/lib/use-dark-mode'
import { usePanZoom } from '@/lib/use-pan-zoom'

/**
 * ``` ```mermaid ``` ``` ในเนื้อหา → ไดอะแกรมที่ layout ให้เอง
 *
 * component นี้ไม่รู้จัก mermaid — คุยกับตัววาดผ่าน `renderDiagram()` ทางเดียว (src/lib/diagram)
 * node ที่มีใน `nodeMap` ของ run.json จะถูกทำเครื่องหมายว่า "มีโค้ดให้อ่านต่อ"
 */

const CLASS_LEGEND: Record<string, { label: string; swatch: string }> = {
  changed: { label: 'PR นี้แตะ', swatch: 'bg-amber-100 border-amber-700 dark:bg-amber-950' },
  risk: { label: 'จุดเสี่ยง / ยังไม่ได้ทำ', swatch: 'bg-red-100 border-red-700 dark:bg-red-950' },
  external: {
    label: 'ระบบภายนอก',
    swatch: 'border-dashed bg-neutral-100 border-neutral-400 dark:bg-neutral-800',
  },
}

function Legend({ classes, linked }: { classes: string[]; linked: number }) {
  const items = classes.filter((name) => name in CLASS_LEGEND)
  if (items.length === 0 && linked === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t px-4 py-2 text-xs text-muted-foreground">
      {/* กล่องที่กดได้ต้องดูออกว่ากดได้ ไม่งั้นทางเข้าโค้ดที่ดีที่สุดในหน้าไม่มีใครเจอ */}
      {linked > 0 ? (
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-4 rounded-sm border border-neutral-400 bg-white underline decoration-dotted dark:bg-neutral-900" />
          กล่องที่ขีดเส้นใต้ = กดเพื่ออ่านโค้ด ({linked} กล่อง)
        </span>
      ) : null}
      {items.map((name) => (
        <span key={name} className="flex items-center gap-1.5">
          <span className={`inline-block h-3 w-4 rounded-sm border ${CLASS_LEGEND[name].swatch}`} />
          {CLASS_LEGEND[name].label}
        </span>
      ))}
      <span className="flex items-center gap-1.5">
        <span className="inline-block h-3 w-4 rounded-sm border border-neutral-400 bg-white dark:bg-neutral-900" />
        ของเดิมที่ไม่ถูกแตะ
      </span>
      {/* gesture ที่มองไม่เห็นเท่ากับไม่มี — บอกไว้ตรงนี้เพราะบนมือถือไม่มี cursor ให้เดา */}
      <span>ลากเพื่อเลื่อน · หนีบสองนิ้วเพื่อซูม</span>
    </div>
  )
}

/** เขียนหลุด subset = ต้องเห็น ไม่ใช่ปล่อยผ่าน (ดู src/lib/diagram/subset.ts) */
function Violations({ items }: { items: DiagramViolation[] }) {
  if (items.length === 0) return null
  return (
    <div className="border-b border-red-300 bg-red-50 px-4 py-2 text-xs text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
      <p className="font-semibold">mermaid หลุดจาก subset ที่อนุญาต ({items.length} จุด)</p>
      <ul className="mt-1 space-y-0.5">
        {items.map((item, i) => (
          <li key={i}>
            {item.line > 0 ? <span className="font-mono">บรรทัด {item.line}: </span> : null}
            {item.message}
            {item.text ? <span className="ml-1 font-mono opacity-70">— {item.text}</span> : null}
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * ปุ่มซูมสำหรับเมาส์/คีย์บอร์ด — นิ้วใช้หนีบเอา แต่ desktop ไม่มี gesture นั้น
 * (ปุ่มรีเซ็ตโผล่เฉพาะตอนภาพถูกเลื่อน/ซูมไปแล้ว — ปุ่มที่กดแล้วไม่เกิดอะไรคือ dead click)
 */
function ViewportControls({
  scale,
  transformed,
  onZoomIn,
  onZoomOut,
  onReset,
}: {
  scale: number
  transformed: boolean
  onZoomIn: () => void
  onZoomOut: () => void
  onReset: () => void
}) {
  const button =
    'flex size-7 items-center justify-center rounded border bg-background/80 text-muted-foreground backdrop-blur hover:bg-muted hover:text-foreground'
  return (
    <div className="ld-viewport-controls absolute top-2 right-2 z-10 flex items-center gap-1">
      {transformed ? (
        <>
          <span className="rounded border bg-background/80 px-1.5 py-0.5 text-[10px] text-muted-foreground backdrop-blur">
            {Math.round(scale * 100)}%
          </span>
          <button type="button" onClick={onReset} className={button} title="รีเซ็ตมุมมอง" aria-label="รีเซ็ตมุมมอง">
            <Maximize className="size-3.5" aria-hidden />
          </button>
        </>
      ) : null}
      <button type="button" onClick={onZoomOut} className={button} title="ซูมออก" aria-label="ซูมออก">
        <Minus className="size-3.5" aria-hidden />
      </button>
      <button type="button" onClick={onZoomIn} className={button} title="ซูมเข้า" aria-label="ซูมเข้า">
        <Plus className="size-3.5" aria-hidden />
      </button>
    </div>
  )
}

export function Diagram({ source, title }: { source: string; title?: string }) {
  const { data } = useRun()
  const panel = useOptionalReadingPanel()
  const dark = useDarkMode()
  const host = useRef<HTMLDivElement>(null)
  const [result, setResult] = useState<DiagramRenderResult | null>(null)
  const [error, setError] = useState<Error | null>(null)
  // ลากเลื่อน/หนีบซูม (#40) — คณิตอยู่ใน lib/pan-zoom.ts, การผูก event อยู่ใน lib/use-pan-zoom.ts
  const view = usePanZoom()
  const resetView = view.reset

  // nodeMap เป็น object ใหม่ทุกครั้งที่ run ถูกโหลดซ้ำ (SSE) — เทียบด้วยเนื้อหา ไม่ใช่ identity
  // ไม่งั้นทุกครั้งที่ agent เขียนไฟล์ ไดอะแกรมทุกอันในหน้าจะถูกวาดใหม่ทั้งที่ไม่มีอะไรเปลี่ยน
  const nodeMapKey = JSON.stringify(data.nodeMap ?? {})
  const nodeMapRef = useRef(data.nodeMap)
  nodeMapRef.current = data.nodeMap
  // handler ผ่าน ref ด้วยเหตุผลเดียวกัน: identity ของ panel เปลี่ยนทุกครั้งที่ประวัติ/ความกว้างขยับ
  // ถ้าใส่ลง dependency ตรง ๆ การลากปรับความกว้าง panel จะสั่งวาดไดอะแกรมใหม่ทั้งหน้า
  const openRef = useRef(panel?.openTarget)
  openRef.current = panel?.openTarget
  const clickable = panel !== null

  useEffect(() => {
    const container = host.current
    if (!container) return
    let cancelled = false
    setError(null)
    setResult(null)
    // รูปถูกวาดใหม่ทั้งอัน (เปลี่ยน source/ธีม) = ตำแหน่งที่เลื่อนค้างไว้ไม่มีความหมายแล้ว
    resetView()

    // กด node = เปิดลำดับการอ่านของ node นั้นใน panel ด้านขวา (user story 4)
    // ไม่ได้ใช้คำสั่ง `click` ของ mermaid (ที่ต้องเปิด securityLevel: loose) — ตัววาดเดินบน SVG
    // ที่ได้แล้วผูก handler เองจาก nodeMap ดู src/lib/diagram/index.ts
    const onNodeClick = clickable
      ? (hit: DiagramNodeHit) => openRef.current?.({ kind: 'list', listId: hit.readingList })
      : undefined

    renderDiagram({ container, source, nodeMap: nodeMapRef.current, title, dark, onNodeClick })
      .then((rendered) => {
        if (cancelled) return
        setResult(rendered)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        clearDiagram(container)
        setError(err instanceof Error ? err : new Error(String(err)))
      })

    return () => {
      cancelled = true
      clearDiagram(container)
    }
  }, [source, nodeMapKey, title, dark, clickable, resetView])

  // กล่องของไดอะแกรมต้องอยู่ใน DOM เสมอ แม้ตอนพัง — ถ้าเอาออกตอน error ref จะกลายเป็น null
  // แล้วรอบที่ agent แก้ source ให้ถูก (ผ่าน SSE) จะไม่มีที่ให้วาด รูปก็ไม่มีวันกลับมา
  return (
    <figure className={`my-6 overflow-hidden rounded-lg border ${error ? 'border-red-400' : ''}`}>
      {error ? (
        <figcaption className="border-b border-red-400 bg-red-50 px-4 py-1.5 text-xs text-red-800 dark:bg-red-950/40 dark:text-red-200">
          วาดไดอะแกรมไม่สำเร็จ — {error.message}
        </figcaption>
      ) : title ? (
        <figcaption className="border-b bg-muted/60 px-4 py-1.5 text-xs text-muted-foreground">
          {title}
        </figcaption>
      ) : null}
      {error ? null : <Violations items={result?.violations ?? []} />}
      {/* กล่องมองภาพ: จับ gesture + ตัดส่วนที่ล้น · ของข้างในถูก transform ทั้งก้อน
          (ตอน error ยังต้องมีอยู่ เพราะ host คือที่ที่รอบวาดถัดไปจะลงมา) */}
      {/* ตอน error กลับไปเป็นกล่องเลื่อนธรรมดา — touch-action ของ viewport จะกินการเลื่อนหน้า
          ทับ source ยาว ๆ ที่แสดงแทนรูปโดยไม่ได้อะไรกลับมา */}
      <div ref={view.frameRef} className={`relative p-4 ${error ? 'overflow-x-auto' : 'ld-viewport'}`}>
        {error || !result ? null : (
          <ViewportControls
            scale={view.scale}
            transformed={view.transformed}
            onZoomIn={view.zoomIn}
            onZoomOut={view.zoomOut}
            onReset={view.reset}
          />
        )}
        <div ref={view.contentRef} className="ld-viewport-content">
          <div ref={host} className="ld-diagram" />
        </div>
        {error ? (
          <pre className="font-mono text-xs leading-relaxed">{source}</pre>
        ) : !result ? (
          <p className="text-xs text-muted-foreground">กำลังวาดไดอะแกรม…</p>
        ) : null}
      </div>
      {error ? null : (
        <Legend
          classes={result?.usedClasses ?? []}
          linked={clickable ? (result?.linked.length ?? 0) : 0}
        />
      )}
    </figure>
  )
}
