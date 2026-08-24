import { HighlightStyle } from '@codemirror/language'
import type { Extension } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { tags as t } from '@lezer/highlight'

/**
 * สีทั้งหมดของตัวแสดงโค้ดอยู่ในไฟล์นี้ไฟล์เดียว (เหมือนที่ diagram/theme.ts ทำกับไดอะแกรม)
 * เปลี่ยน engine ทีหลัง = เขียน mapping ชุดนี้ใหม่ชุดเดียว ไม่ต้องไล่หา class ทั่วแอป
 */

interface Palette {
  /** พื้นหลังบรรทัดที่ PR เพิ่ม/แก้ */
  addBg: string
  /** พื้นหลังบรรทัดที่ PR ลบ */
  delBg: string
  /** แถวว่างที่เติมให้สองฝั่งของ split ตรงกัน — ต้องดูออกว่า "ไม่ใช่โค้ด" */
  fillerBg: string
  /** เส้น/ตัวเลขของหมุด reading list */
  pin: string
  pinChanged: string
  pinBg: string
  comment: string
  keyword: string
  string: string
  number: string
  fn: string
  type: string
  property: string
  operator: string
  invalid: string
  gutter: string
  gutterActive: string
  border: string
  selection: string
  matchBg: string
}

const LIGHT: Palette = {
  addBg: '#e6ffec',
  delBg: '#ffebe9',
  fillerBg: '#f3f4f6',
  pin: '#9ca3af',
  pinChanged: '#b45309',
  pinBg: 'rgba(180, 83, 9, 0.10)',
  comment: '#6a737d',
  keyword: '#b31d28',
  string: '#0a7d33',
  number: '#0550ae',
  fn: '#6f42c1',
  type: '#953800',
  property: '#0550ae',
  operator: '#24292f',
  invalid: '#cf222e',
  gutter: '#9aa0a6',
  gutterActive: '#3c4043',
  border: '#e5e7eb',
  selection: '#cfe3ff',
  matchBg: '#fde68a',
}

const DARK: Palette = {
  addBg: 'rgba(46, 160, 67, 0.18)',
  delBg: 'rgba(248, 81, 73, 0.16)',
  fillerBg: 'rgba(110, 118, 129, 0.10)',
  pin: '#6e7681',
  pinChanged: '#fbbf24',
  pinBg: 'rgba(251, 191, 36, 0.12)',
  comment: '#8b949e',
  keyword: '#ff7b72',
  string: '#7ee787',
  number: '#79c0ff',
  fn: '#d2a8ff',
  type: '#ffa657',
  property: '#79c0ff',
  operator: '#c9d1d9',
  invalid: '#ff7b72',
  gutter: '#6e7681',
  gutterActive: '#c9d1d9',
  border: '#30363d',
  selection: '#1f3a5f',
  matchBg: '#5a4a12',
}

function highlightStyle(p: Palette): HighlightStyle {
  return HighlightStyle.define([
    { tag: [t.comment, t.lineComment, t.blockComment, t.docComment], color: p.comment, fontStyle: 'italic' },
    { tag: [t.keyword, t.moduleKeyword, t.controlKeyword, t.operatorKeyword], color: p.keyword },
    { tag: [t.bool, t.null, t.atom, t.self], color: p.number },
    { tag: [t.number, t.integer, t.float], color: p.number },
    { tag: [t.string, t.special(t.string), t.regexp, t.escape], color: p.string },
    { tag: [t.function(t.variableName), t.function(t.propertyName), t.labelName], color: p.fn },
    { tag: [t.typeName, t.className, t.namespace, t.tagName], color: p.type },
    { tag: [t.propertyName, t.attributeName, t.definition(t.propertyName)], color: p.property },
    { tag: [t.operator, t.punctuation, t.separator, t.bracket, t.derefOperator], color: p.operator },
    { tag: [t.meta, t.processingInstruction, t.annotation], color: p.comment },
    { tag: t.heading, color: p.keyword, fontWeight: 'bold' },
    { tag: [t.link, t.url], color: p.property, textDecoration: 'underline' },
    { tag: t.strong, fontWeight: 'bold' },
    { tag: t.emphasis, fontStyle: 'italic' },
    { tag: t.invalid, color: p.invalid },
  ])
}

function editorTheme(p: Palette, dark: boolean): Extension {
  return EditorView.theme(
    {
      '&': {
        color: 'inherit',
        backgroundColor: 'transparent',
        fontSize: '12px',
        height: '100%',
      },
      '.cm-scroller': {
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        lineHeight: '1.6',
        // ต้องมีคู่กับการกำหนดความสูงให้ตัว editor (โหมดกางทั้งไฟล์) ไม่งั้น CodeMirror
        // จะยืดจนสุดเอกสารแทนที่จะ scroll เอง แล้ว virtualization ก็ไม่ทำงาน
        overflow: 'auto',
      },
      '.cm-content': { padding: '8px 0' },
      '&.cm-focused': { outline: 'none' },
      '.cm-gutters': {
        backgroundColor: 'transparent',
        color: p.gutter,
        border: 'none',
        borderRight: `1px solid ${p.border}`,
        paddingRight: '4px',
      },
      '.cm-lineNumbers .cm-gutterElement': { padding: '0 8px 0 12px', minWidth: '3ch' },
      '.cm-activeLineGutter': { backgroundColor: 'transparent', color: p.gutterActive },
      '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection': {
        backgroundColor: p.selection,
      },
      '.cm-selectionMatch': { backgroundColor: p.matchBg },
      '.cm-searchMatch': { backgroundColor: p.matchBg, outline: `1px solid ${p.border}` },
      '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: p.matchBg, outline: `1px solid ${p.fn}` },
      // panel ค้นหาเป็นส่วนหนึ่งของ editor — ต้องดูเป็นของแอปเดียวกัน ไม่ใช่ของแถมสีเทา
      '.cm-panels': {
        backgroundColor: 'transparent',
        color: 'inherit',
        borderBottom: `1px solid ${p.border}`,
      },
      '.cm-panel.cm-search': { padding: '6px 8px', fontSize: '12px' },
      '.cm-panel.cm-search input, .cm-panel.cm-search button': {
        fontSize: '12px',
        border: `1px solid ${p.border}`,
        borderRadius: '4px',
        padding: '2px 6px',
        backgroundColor: 'transparent',
        color: 'inherit',
      },
      '.cm-panel.cm-search label': { fontSize: '11px' },

      // ── diff ────────────────────────────────────────────────────────────
      // สีอยู่ที่ "ทั้งบรรทัด" ไม่ใช่ที่ตัวอักษร: ผู้อ่านต้องกวาดตาแล้วเห็นทันทีว่า
      // ตรงไหนคือของใหม่ โดยไม่ต้องอ่านเนื้อโค้ดก่อน
      '.cm-line.cm-ld-add': { backgroundColor: p.addBg },
      '.cm-line.cm-ld-del': { backgroundColor: p.delBg },
      '.cm-line.cm-ld-filler': {
        backgroundColor: p.fillerBg,
        // แถวเติมต้องอ่านออกว่า "ไม่มีบรรทัดนี้ในไฟล์ฝั่งนี้" ไม่ใช่บรรทัดว่าง
        backgroundImage: `repeating-linear-gradient(135deg, transparent 0 5px, ${p.border} 5px 6px)`,
      },

      // ── หมุดของ reading list ────────────────────────────────────────────
      '.cm-ld-pin-gutter': { paddingLeft: '2px' },
      '.cm-ld-pin': {
        display: 'inline-block',
        minWidth: '14px',
        textAlign: 'center',
        borderRadius: '3px',
        border: `1px solid ${p.pin}`,
        color: p.pin,
        fontSize: '9px',
        lineHeight: '13px',
      },
      '.cm-ld-pin-changed': { borderColor: p.pinChanged, color: p.pinChanged, fontWeight: 'bold' },
      '.cm-line.cm-ld-pinned': { boxShadow: `inset 2px 0 0 ${p.pin}` },
      '.cm-line.cm-ld-pinned-changed': { boxShadow: `inset 2px 0 0 ${p.pinChanged}` },
    },
    { dark },
  )
}

export function codeTheme(dark: boolean): { highlight: HighlightStyle; theme: Extension } {
  const palette = dark ? DARK : LIGHT
  return { highlight: highlightStyle(palette), theme: editorTheme(palette, dark) }
}
