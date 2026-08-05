import { RangeSetBuilder, StateEffect, StateField } from '@codemirror/state'
import {
  Decoration,
  EditorView,
  GutterMarker,
  ViewPlugin,
  gutter,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view'

import type { CodeLine, CodeLineKind } from '@/lib/diff'

/**
 * สีของบรรทัดที่ diff แตะ + หมุดของ reading list — เป็น decoration/gutter marker ล้วน ๆ
 * (นี่คือเหตุผลที่ SPEC-v3 เลือก CodeMirror แทน Shiki/Prism ตั้งแต่แรก)
 *
 * decoration ถูกสร้าง **เฉพาะช่วงที่มองเห็น** ผ่าน ViewPlugin ไม่ใช่ทั้งเอกสาร
 * ไฟล์หมื่นบรรทัดจึงกางได้โดยไม่ต้องสร้าง range หมื่นอัน (ตั๋ว: "กางไฟล์ใหญ่แล้วไม่หน่วง")
 */

/** หมุด = ช่วงหนึ่งใน reading list ที่อยู่ในไฟล์นี้ เลขบรรทัดเป็นของฝั่ง head */
export interface CodePin {
  /** ลำดับที่จะโชว์ (1-based แล้ว) */
  label: string
  from: number
  to: number
  kind: 'changed' | 'context'
  /** ข้อความ tooltip — "อ่านอันนี้ทำไม" ของช่วงนั้น */
  title: string
}

export interface LineMeta {
  /** เมตาต่อบรรทัดของเอกสาร (index 0 = บรรทัดที่ 1) — null = เอกสารธรรมดาไม่มี diff */
  lines: CodeLine[] | null
  /** เลขบรรทัดแรกฝั่ง head เมื่อไม่มี `lines` */
  firstLine: number
  pins: CodePin[]
}

export const EMPTY_META: LineMeta = { lines: null, firstLine: 1, pins: [] }

export const setLineMeta = StateEffect.define<LineMeta>()

export const lineMetaField = StateField.define<LineMeta>({
  create: () => EMPTY_META,
  update(value, tr) {
    for (const effect of tr.effects) if (effect.is(setLineMeta)) return effect.value
    return value
  },
})

/** เลขบรรทัดของ "ไฟล์จริง" ที่บรรทัดที่ n ของเอกสาร (null = แถว filler ที่ไม่มีตัวตนในไฟล์) */
export function fileLineAt(meta: LineMeta, docLine: number): number | null {
  if (!meta.lines) return meta.firstLine + docLine - 1
  return meta.lines[docLine - 1]?.number ?? null
}

/** ตรงข้ามกับ fileLineAt — ใช้ตอนสั่งเลื่อนไปหาหมุด (แถวที่ถูกลบไม่นับ) */
export function docLineForFileLine(meta: LineMeta, fileLine: number): number | null {
  if (!meta.lines) return fileLine - meta.firstLine + 1
  for (let i = 0; i < meta.lines.length; i += 1) {
    const line = meta.lines[i]
    if (line.kind !== 'del' && line.number === fileLine) return i + 1
  }
  return null
}

const LINE_CLASS: Record<CodeLineKind, string> = {
  same: '',
  add: 'cm-ld-add',
  del: 'cm-ld-del',
  filler: 'cm-ld-filler',
}

function pinAt(meta: LineMeta, fileLine: number | null): CodePin | null {
  if (fileLine === null) return null
  return meta.pins.find((pin) => fileLine >= pin.from && fileLine <= pin.to) ?? null
}

function buildDecorations(view: EditorView): DecorationSet {
  const meta = view.state.field(lineMetaField, false) ?? EMPTY_META
  if (!meta.lines && meta.pins.length === 0) return Decoration.none

  const builder = new RangeSetBuilder<Decoration>()
  for (const { from, to } of view.visibleRanges) {
    let pos = from
    while (pos <= to) {
      const line = view.state.doc.lineAt(pos)
      const kind = meta.lines?.[line.number - 1]?.kind ?? 'same'
      const pin = pinAt(meta, fileLineAt(meta, line.number))
      const classes = [LINE_CLASS[kind], pin ? 'cm-ld-pinned' : '', pin?.kind === 'changed' ? 'cm-ld-pinned-changed' : '']
        .filter(Boolean)
        .join(' ')
      if (classes) builder.add(line.from, line.from, Decoration.line({ class: classes }))
      if (line.to + 1 > to) break
      pos = line.to + 1
    }
  }
  return builder.finish()
}

export const lineDecorations = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view)
    }

    update(update: ViewUpdate) {
      const metaChanged = update.transactions.some((tr) =>
        tr.effects.some((effect) => effect.is(setLineMeta)),
      )
      if (update.docChanged || update.viewportChanged || metaChanged) {
        this.decorations = buildDecorations(update.view)
      }
    }
  },
  { decorations: (plugin) => plugin.decorations },
)

class PinMarker extends GutterMarker {
  readonly pin: CodePin

  constructor(pin: CodePin) {
    super()
    this.pin = pin
  }

  toDOM(): Node {
    const el = document.createElement('span')
    el.className = `cm-ld-pin${this.pin.kind === 'changed' ? ' cm-ld-pin-changed' : ''}`
    el.textContent = this.pin.label
    el.title = this.pin.title
    return el
  }
}

/**
 * แถบหมุดฝั่งซ้ายสุด — "ช่วงอื่นของไฟล์นี้ในรายการเดียวกัน" ยังเห็นอยู่หลังกางทั้งไฟล์
 * (ตั๋ว: กางแล้วต้องไม่หลุดจากลำดับการอ่าน · user story 19)
 */
export const pinGutter = gutter({
  class: 'cm-ld-pin-gutter',
  lineMarker(view, line) {
    const meta = view.state.field(lineMetaField, false)
    if (!meta || meta.pins.length === 0) return null
    const docLine = view.state.doc.lineAt(line.from).number
    const fileLine = fileLineAt(meta, docLine)
    if (fileLine === null) return null
    const pin = meta.pins.find((item) => item.from === fileLine)
    return pin ? new PinMarker(pin) : null
  },
  initialSpacer: () => new PinMarker({ label: '9', from: 0, to: 0, kind: 'context', title: '' }),
})
