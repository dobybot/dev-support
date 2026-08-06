import { syntaxTree } from '@codemirror/language'
import { StateEffect, StateField, type Extension } from '@codemirror/state'
import {
  Decoration,
  EditorView,
  ViewPlugin,
  keymap,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view'

import type { CodeLanguage } from '@/shared/languages'
import { EMPTY_META, fileLineAt, lineMetaField } from './decorations'

/**
 * go to definition (F12 / Cmd-click) และ find references (Shift-F12) ฝั่ง editor
 *
 * ที่นี่ทำแค่ "ตัดสินว่าตำแหน่งไหนคือ identifier แล้วยิงเป็น plain data ออกไป" —
 * การ resolve จริงเป็นงานของ index ฝั่ง server (issue #36) · กติกากำแพงยังเดิม:
 * CodeMirror ไม่โผล่ออกนอกโฟลเดอร์นี้ สิ่งที่ข้ามออกไปมีแค่ NavRequest ซึ่งเป็น
 * ตัวเลข/สตริงล้วน
 *
 * การตัดสินว่า identifier หรือไม่ใช้ syntax tree ที่ editor มีอยู่แล้ว **ไม่ยิง API**
 * เพราะ Cmd-hover เกิดถี่มาก (ทุก mousemove) — string/comment/keyword จึงตกไปเองโดย
 * ไม่ต้องมี list คำสงวนของแต่ละภาษา
 */

/** คำขอ navigation หนึ่งครั้ง — ตำแหน่งเป็นเลขบรรทัดของ "ไฟล์จริง" ณ commit ที่ pin ไว้ */
export interface NavRequest {
  /** F12 / Cmd-click = definition · Shift-F12 = references · Alt-F12 = peek references ใต้บรรทัด */
  action: 'definition' | 'references' | 'peek'
  /** 1-based ทั้งคู่ · col นับเป็น UTF-16 code unit ตรงกับที่ CodeMirror ใช้ */
  line: number
  col: number
  /** identifier ใต้ cursor — ตัดจาก syntax ฝั่ง client (ตัวเดียวกับที่ underline) */
  symbol: string
}

export interface NavConfig {
  language: CodeLanguage | null
  onNavigate?: (req: NavRequest) => void
  /** false = ปิดทั้งหมด (ฝั่ง base ของ split view — index มีชุดเดียวที่ pinned commit) */
  navigable?: boolean
}

/**
 * กล่องใส่ config ที่ editor เขียนทับได้ — callback ของ React เปลี่ยน identity ทุก render
 * ถ้าผูก config เข้ากับ extension ตรง ๆ ก็ต้อง reconfigure ทุกครั้งโดยไม่ได้อะไรเพิ่ม
 */
export interface NavConfigRef {
  current: NavConfig
}

/** ภาษาที่ index ฝั่ง server รองรับ — ภาษาอื่นไม่ underline และไม่ตอบสนอง */
const NAV_LANGUAGES: ReadonlySet<CodeLanguage> = new Set<CodeLanguage>([
  'python',
  'javascript',
  'jsx',
  'typescript',
  'tsx',
  'vue',
])

/**
 * ชื่อ node ของ lezer ที่นับเป็น identifier (javascript/jsx/typescript/vue ใช้ grammar เดียวกัน
 * ส่วน python ใช้ VariableName/PropertyName เหมือนกัน) — node ของ string/comment/keyword
 * ไม่อยู่ในชุดนี้จึงตกไปเอง
 */
const IDENTIFIER_NODES: ReadonlySet<string> = new Set([
  'VariableName',
  'VariableDefinition',
  'PropertyName',
  'PropertyDefinition',
  'TypeName',
  'TypeDefinition',
  'JSXIdentifier',
  'Identifier',
])

const IDENTIFIER_TEXT = /^[A-Za-z_$][A-Za-z0-9_$]*$/

const IS_MAC =
  typeof navigator !== 'undefined' && /Mac|iP(hone|ad|od)/.test(navigator.platform || navigator.userAgent)

/** modifier ของ "กดค้างแล้วคลิกเพื่อกระโดด" — Cmd บน mac, Ctrl ที่เหลือ (ตามธรรมเนียม editor) */
function hasNavModifier(event: { metaKey: boolean; ctrlKey: boolean }): boolean {
  return IS_MAC ? event.metaKey : event.ctrlKey
}

function isNavModifierKey(key: string): boolean {
  return IS_MAC ? key === 'Meta' : key === 'Control'
}

interface IdentifierRange {
  from: number
  to: number
  text: string
}

/**
 * คำที่ตำแหน่ง pos โดยไม่พึ่ง syntax tree — ใช้เฉพาะตอน grammar ของภาษายังโหลดไม่เสร็จ
 * (languages.ts import แบบ dynamic) ซึ่งช่วงนั้น tree มีแต่ node เดียวทั้งเอกสาร
 */
function wordAt(state: EditorView['state'], pos: number): IdentifierRange | null {
  const line = state.doc.lineAt(pos)
  const offset = pos - line.from
  const text = line.text
  let from = offset
  let to = offset
  while (from > 0 && IDENTIFIER_TEXT.test(text[from - 1])) from -= 1
  while (to < text.length && IDENTIFIER_TEXT.test(text[to])) to += 1
  const word = text.slice(from, to)
  if (!IDENTIFIER_TEXT.test(word)) return null
  return { from: line.from + from, to: line.from + to, text: word }
}

function identifierAt(state: EditorView['state'], pos: number): IdentifierRange | null {
  const tree = syntaxTree(state)
  for (const side of [1, -1] as const) {
    const node = tree.resolveInner(pos, side)
    // ยังไม่มี grammar (หรือภาษาที่ไม่มี parser) — ทั้งเอกสารเป็น node เดียว
    if (node.parent === null && node.from === 0 && node.to === state.doc.length) return wordAt(state, pos)
    if (!IDENTIFIER_NODES.has(node.name)) continue
    const text = state.doc.sliceString(node.from, node.to)
    if (!IDENTIFIER_TEXT.test(text)) continue
    return { from: node.from, to: node.to, text }
  }
  return null
}

function enabled(config: NavConfig): boolean {
  return (
    config.onNavigate !== undefined &&
    config.navigable !== false &&
    config.language !== null &&
    NAV_LANGUAGES.has(config.language)
  )
}

/**
 * identifier ที่กดได้จริงที่ตำแหน่งนี้ — null เมื่อไม่ใช่ identifier หรืออยู่บนแถวที่ไม่มีตัวตน
 * ในไฟล์ ณ pinned commit (แถว filler กับแถวที่ถูกลบ ซึ่งเลขบรรทัดเป็นของฝั่ง base)
 */
function navTargetAt(
  view: EditorView,
  pos: number,
): { range: IdentifierRange; line: number; col: number } | null {
  const range = identifierAt(view.state, pos)
  if (!range) return null
  const meta = view.state.field(lineMetaField, false) ?? EMPTY_META
  const docLine = view.state.doc.lineAt(range.from)
  const kind = meta.lines?.[docLine.number - 1]?.kind
  if (kind === 'del' || kind === 'filler') return null
  const fileLine = fileLineAt(meta, docLine.number)
  if (fileLine === null) return null
  return { range, line: fileLine, col: range.from - docLine.from + 1 }
}

function dispatchNav(
  view: EditorView,
  ref: NavConfigRef,
  pos: number,
  action: NavRequest['action'],
): boolean {
  const config = ref.current
  if (!enabled(config)) return false
  const target = navTargetAt(view, pos)
  if (!target) return false
  config.onNavigate?.({ action, line: target.line, col: target.col, symbol: target.range.text })
  return true
}

const linkMark = Decoration.mark({ class: 'cm-ld-nav-link' })

/** ช่วง identifier ที่กำลังขีดเส้นใต้อยู่ (null = ไม่มี) */
const setHoverRange = StateEffect.define<IdentifierRange | null>()

/**
 * เก็บเส้นใต้ไว้ใน state ไม่ใช่ในตัว ViewPlugin: การเปลี่ยนของมันมาจาก event ของ DOM
 * (mousemove/keydown) ซึ่งอยู่นอกวงจร update ของ view — ผ่าน state field แบบนี้จึงสั่ง
 * วาดใหม่ด้วย dispatch ธรรมดาได้ ไม่ต้องแตะ API ภายในของ CodeMirror
 */
const hoverField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, tr) {
    let next = tr.docChanged ? Decoration.none : value
    for (const effect of tr.effects) {
      if (!effect.is(setHoverRange)) continue
      next = effect.value === null ? Decoration.none : Decoration.set([linkMark.range(effect.value.from, effect.value.to)])
    }
    return next
  },
  provide: (field) => EditorView.decorations.from(field),
})

/**
 * ขีดเส้นใต้ตอนกด modifier ค้างแล้ว hover — ต้องฟัง keydown/keyup ด้วย ไม่ใช่แค่ mousemove
 * เพราะผู้ใช้กด Cmd ค้างทีหลังโดยเมาส์ไม่ขยับก็ต้องเห็นเส้น (และปล่อยแล้วต้องหายทันที)
 */
function hoverLinks(ref: NavConfigRef): Extension {
  return ViewPlugin.fromClass(
    class {
      private pos: number | null = null
      private modifier = false
      private shown: IdentifierRange | null = null
      private readonly view: EditorView

      constructor(view: EditorView) {
        this.view = view
        this.view.dom.addEventListener('mousemove', this.onMouseMove)
        this.view.dom.addEventListener('mouseleave', this.onMouseLeave)
        window.addEventListener('keydown', this.onKey)
        window.addEventListener('keyup', this.onKey)
        window.addEventListener('blur', this.onBlur)
      }

      update(update: ViewUpdate): void {
        // เอกสารถูกเขียนใหม่ยกก้อนตอนสลับไฟล์ — ตำแหน่งเมาส์เดิมชี้คำอื่นไปแล้ว
        if (update.docChanged) {
          this.shown = null
          this.pos = null
        }
      }

      destroy(): void {
        this.view.dom.removeEventListener('mousemove', this.onMouseMove)
        this.view.dom.removeEventListener('mouseleave', this.onMouseLeave)
        window.removeEventListener('keydown', this.onKey)
        window.removeEventListener('keyup', this.onKey)
        window.removeEventListener('blur', this.onBlur)
      }

      private readonly onMouseMove = (event: MouseEvent): void => {
        this.modifier = hasNavModifier(event)
        this.pos = this.view.posAtCoords({ x: event.clientX, y: event.clientY })
        this.recompute()
      }

      private readonly onMouseLeave = (): void => {
        this.pos = null
        this.recompute()
      }

      private readonly onKey = (event: KeyboardEvent): void => {
        if (!isNavModifierKey(event.key)) return
        this.modifier = event.type === 'keydown'
        this.recompute()
      }

      private readonly onBlur = (): void => {
        this.modifier = false
        this.recompute()
      }

      private recompute(): void {
        const next = this.compute()
        // เทียบก่อนค่อย dispatch: mousemove ยิงถี่มาก แต่ผลลัพธ์เปลี่ยนแค่ตอนข้ามคำ
        if (next?.from === this.shown?.from && next?.to === this.shown?.to) return
        this.shown = next
        this.view.dispatch({ effects: setHoverRange.of(next) })
      }

      private compute(): IdentifierRange | null {
        if (!this.modifier || this.pos === null || !enabled(ref.current)) return null
        return navTargetAt(this.view, this.pos)?.range ?? null
      }
    },
  )
}

/** บรรทัดที่กำลังกะพริบหลังกระโดดมาถึง (docLine) — null = ไม่มี */
const setFlashLine = StateEffect.define<number | null>()

const flashDecoration = Decoration.line({ class: 'cm-ld-flash' })

const flashField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, tr) {
    let next = value.map(tr.changes)
    for (const effect of tr.effects) {
      if (!effect.is(setFlashLine)) continue
      const docLine = effect.value
      next =
        docLine === null || docLine < 1 || docLine > tr.state.doc.lines
          ? Decoration.none
          : Decoration.set([flashDecoration.range(tr.state.doc.line(docLine).from)])
    }
    return next
  },
  provide: (field) => EditorView.decorations.from(field),
})

/** ระยะเวลาที่ไฮไลต์ค้างไว้ — นานพอให้ตาจับได้ว่าลงที่บรรทัดไหน สั้นพอที่จะไม่กวนตอนอ่านต่อ */
const FLASH_MS = 1600

/**
 * สั่งกะพริบบรรทัด (เลขแถวของเอกสาร) — เรียกซ้ำได้ อันใหม่แทนที่อันเก่าเสมอ
 * คืน timer id ให้ผู้เรียกยกเลิกตอน destroy
 */
export function flashDocLine(view: EditorView, docLine: number): ReturnType<typeof setTimeout> {
  view.dispatch({ effects: setFlashLine.of(docLine) })
  return setTimeout(() => {
    // editor อาจถูกทิ้งไปแล้วระหว่างรอ — dispatch ตอนนั้นจะ throw
    try {
      view.dispatch({ effects: setFlashLine.of(null) })
    } catch {
      // ไม่มีอะไรต้องทำ: view ตายแล้ว decoration ก็หายไปพร้อมกัน
    }
  }, FLASH_MS)
}

/** style ของเส้นใต้และไฮไลต์กะพริบ — อยู่ที่นี่เพื่อให้ทั้งฟีเจอร์จบในไฟล์เดียว */
const navigationTheme = EditorView.baseTheme({
  '.cm-ld-nav-link': {
    textDecoration: 'underline',
    textUnderlineOffset: '2px',
    cursor: 'pointer',
  },
  '&light .cm-line.cm-ld-flash': { backgroundColor: 'rgba(250, 204, 21, 0.35)' },
  '&dark .cm-line.cm-ld-flash': { backgroundColor: 'rgba(250, 204, 21, 0.22)' },
  '.cm-line.cm-ld-flash': { transition: 'background-color 300ms ease-out' },
})

/**
 * ส่วนที่ต้องมีเสมอ ไม่ขึ้นกับว่าเปิด navigation หรือไม่ — การกระโดดมาที่บรรทัดพร้อมไฮไลต์
 * ถูกสั่งจากภายนอก (คลิกรายการ references) ได้แม้ editor ตัวนั้นจะไม่ให้กด F12
 */
export const flashHighlight: Extension = [flashField, navigationTheme]

/** keymap + Cmd-click — ใส่ครั้งเดียวตอนสร้าง editor แล้วอ่าน config ผ่าน ref ตลอดอายุ */
export function navigation(ref: NavConfigRef): Extension {
  return [
    keymap.of([
      {
        key: 'F12',
        run: (view) => dispatchNav(view, ref, view.state.selection.main.head, 'definition'),
      },
      {
        key: 'Shift-F12',
        run: (view) => dispatchNav(view, ref, view.state.selection.main.head, 'references'),
      },
      {
        key: 'Alt-F12',
        run: (view) => dispatchNav(view, ref, view.state.selection.main.head, 'peek'),
      },
    ]),
    EditorView.domEventHandlers({
      mousedown(event, view) {
        if (!hasNavModifier(event)) return false
        const pos = view.posAtCoords({ x: event.clientX, y: event.clientY })
        if (pos === null) return false
        if (!dispatchNav(view, ref, pos, 'definition')) return false
        // กัน CodeMirror ตีความเป็นการเลือกข้อความ/วาง cursor ซ้อนทับการกระโดด
        event.preventDefault()
        return true
      },
    }),
    hoverField,
    hoverLinks(ref),
  ]
}
