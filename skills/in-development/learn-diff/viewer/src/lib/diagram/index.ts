/**
 * ขอบเขตของ "ตัววาดไดอะแกรม" — ทางเข้าเดียวของทั้งแอป
 *
 * ทุกอย่างที่เกี่ยวกับการวาดผ่าน `renderDiagram()` ตัวเดียว รับ container + source + nodeMap
 * ตาม SPEC-v3 → Diagrams · engine จริง (mermaid) อยู่หลัง ./engine-mermaid.ts ไฟล์เดียว
 * เปลี่ยน engine = เขียนไฟล์นั้นใหม่ ไม่ต้องแตะ component
 *
 * การกด node **ไม่ใช้** คำสั่ง `click` ของ mermaid (ซึ่งต้องเปิด securityLevel: loose)
 * แต่เดินบน SVG ที่ได้แล้วผูก handler เอง โดยดูจาก `nodeMap` — วิธีนี้ทำงานเหมือนเดิม
 * ถึงเปลี่ยน engine
 */

import { engineNodeElements, engineNodeId, renderToSvg } from './engine-mermaid'
import { normalizeDiagramSource } from './normalize'
import { parseDiagram, type DiagramViolation } from './subset'

export { BUILTIN_CLASSES, parseDiagram } from './subset'
export type { DiagramViolation, ParsedDiagram } from './subset'

/** node ที่ผูกกับ reading list แล้ว — ตั๋ว #8/#9 เอาไปเปิด code panel */
export interface DiagramNodeHit {
  nodeId: string
  readingList: string
}

export interface RenderDiagramOptions {
  /** กล่องที่จะวาดลงไป — เนื้อในเดิมถูกแทนที่ทั้งหมด */
  container: HTMLElement
  /** ข้อความ mermaid ตาม subset (ดู ./subset.ts) */
  source: string
  /** node id → reading list id (มาจาก run.json) */
  nodeMap?: Record<string, string>
  /** ป้ายกำกับสำหรับ screen reader */
  title?: string
  dark?: boolean
  /** ถ้าไม่ส่งมา node จะไม่กดได้ — กดแล้วไม่เกิดอะไรคือสิ่งที่แย่ที่สุด */
  onNodeClick?: (hit: DiagramNodeHit) => void
}

export interface DiagramRenderResult {
  /** node id ที่ engine วาดออกมาจริง */
  nodeIds: string[]
  /** node ที่มี reading list และถูกผูก handler แล้ว */
  linked: DiagramNodeHit[]
  /** ชื่อ class ที่ diagram นี้ใช้จริง (ไม่ซ้ำ) — หน้าเว็บเอาไปทำคำอธิบายสี */
  usedClasses: string[]
  /** จุดที่เขียนหลุด subset — แสดงให้ผู้อ่านเห็น ไม่ใช่กลืนเงียบ ๆ */
  violations: DiagramViolation[]
}

export class DiagramRenderError extends Error {
  readonly source: string

  constructor(message: string, source: string) {
    super(message)
    this.name = 'DiagramRenderError'
    this.source = source
  }
}

let counter = 0

/** id ต้องไม่ซ้ำทั้งหน้า เพราะ engine เอาไปทำ CSS selector ของ style ที่แนบมากับ SVG */
function nextId(): string {
  counter += 1
  return `ld-diagram-${counter}`
}

/** ล้างกล่อง (ใช้ตอน component unmount / ก่อนวาดรอบใหม่) */
export function clearDiagram(container: HTMLElement) {
  container.replaceChildren()
}

function decorate(el: Element, hit: DiagramNodeHit, onNodeClick?: (hit: DiagramNodeHit) => void) {
  el.setAttribute('data-reading-list', hit.readingList)
  el.classList.add('ld-node-link')
  if (!onNodeClick) return
  el.setAttribute('role', 'button')
  el.setAttribute('tabindex', '0')
  el.classList.add('ld-node-clickable')
  el.addEventListener('click', () => onNodeClick(hit))
  el.addEventListener('keydown', (event) => {
    const key = (event as KeyboardEvent).key
    if (key !== 'Enter' && key !== ' ') return
    event.preventDefault()
    onNodeClick(hit)
  })
}

/**
 * วาดไดอะแกรมลง container · เรียกซ้ำได้ (วาดทับของเดิม)
 * throw `DiagramRenderError` เมื่อ engine อ่าน source ไม่ออก
 */
export async function renderDiagram(
  options: RenderDiagramOptions,
): Promise<DiagramRenderResult> {
  const { container, source, nodeMap = {}, title, dark = false, onNodeClick } = options
  const parsed = parseDiagram(source)

  let svg: string
  try {
    svg = await renderToSvg(nextId(), normalizeDiagramSource(source, { dark }), { dark })
  } catch (error) {
    throw new DiagramRenderError(
      error instanceof Error ? error.message : String(error),
      source,
    )
  }

  container.innerHTML = svg
  const root = container.querySelector('svg')
  if (!root) throw new DiagramRenderError('engine ไม่ได้คืน SVG กลับมา', source)

  root.removeAttribute('height')
  root.setAttribute('class', `${root.getAttribute('class') ?? ''} ld-diagram-svg`.trim())
  if (title) root.setAttribute('aria-label', title)
  root.setAttribute('role', 'img')

  const nodeIds: string[] = []
  const linked: DiagramNodeHit[] = []
  for (const el of engineNodeElements(root)) {
    const nodeId = engineNodeId(el)
    if (!nodeId) continue
    nodeIds.push(nodeId)
    const readingList = nodeMap[nodeId]
    if (!readingList) continue
    const hit = { nodeId, readingList }
    decorate(el, hit, onNodeClick)
    linked.push(hit)
  }

  return {
    nodeIds,
    linked,
    usedClasses: [...new Set(parsed.classUsages)],
    violations: parsed.violations,
  }
}
