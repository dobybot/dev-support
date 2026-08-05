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

export function Diagram({ source, title }: { source: string; title?: string }) {
  const { data } = useRun()
  const panel = useOptionalReadingPanel()
  const dark = useDarkMode()
  const host = useRef<HTMLDivElement>(null)
  const [result, setResult] = useState<DiagramRenderResult | null>(null)
  const [error, setError] = useState<Error | null>(null)

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
  }, [source, nodeMapKey, title, dark, clickable])

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
      <div className="overflow-x-auto p-4">
        <div ref={host} className="ld-diagram" />
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
