import { defaultKeymap } from '@codemirror/commands'
import { syntaxHighlighting } from '@codemirror/language'
import { highlightSelectionMatches, openSearchPanel, search, searchKeymap } from '@codemirror/search'
import { Compartment, EditorState } from '@codemirror/state'
import { EditorView, highlightSpecialChars, keymap, lineNumbers } from '@codemirror/view'

import type { CodeLine } from '@/lib/diff'
import type { CodeLanguage } from '@/shared/languages'
import {
  EMPTY_META,
  docLineForFileLine,
  fileLineAt,
  lineDecorations,
  lineMetaField,
  pinGutter,
  setLineMeta,
  type CodePin,
  type LineMeta,
} from './decorations'
import { languageExtension } from './languages'
import { codeTheme } from './theme'

/** editor หนึ่งตัว — ตัวประกอบร่วมของทั้งมุมมองเดี่ยว, unified และสองฝั่งของ split */
export interface EditorOptions {
  /** เนื้อเอกสารที่จะแสดง (ไม่มี newline ปิดท้าย) */
  text: string
  language: CodeLanguage | null
  /** เลขบรรทัดของบรรทัดแรกเมื่อไม่มี `lines` — gutter ต้องตรงกับ commit ที่ pin ไว้ */
  firstLine: number
  dark: boolean
  /** เมตาต่อบรรทัด (โหมด diff) — ไม่ส่ง = เอกสารธรรมดา เลขบรรทัดไล่จาก firstLine */
  lines?: CodeLine[] | null
  pins?: CodePin[]
  /** ปิด line wrapping (โหมด split ต้องปิด ไม่งั้นสองฝั่งเลื่อนไม่ตรงกัน) */
  wrap?: boolean
  /**
   * บรรทัด (เลขฝั่ง head) ที่ต้องการให้เห็นตั้งแต่แรกเปิด — ใช้ตอนกางทั้งไฟล์
   * ส่งผ่าน `scrollTo` ของ CodeMirror เอง ไม่ใช่สั่ง scroll ทีหลัง เพราะ dispatch ภายใน
   * ที่ตามมา (เช่นตอน grammar ของภาษาโหลดเสร็จ) จะดึง scroll กลับไปที่ anchor เดิม = หัวไฟล์
   */
  scrollToLine?: number | null
  /** เหมือน scrollToLine แต่ระบุเป็น "แถวที่เท่าไรของเอกสาร" — โหมด split ใช้ เพราะสองฝั่ง
   *  แถวตรงกันอยู่แล้ว ส่วนเลขบรรทัดของฝั่งซ้ายเป็นของ base จึงแปลจากเลขฝั่ง head ตรง ๆ ไม่ได้ */
  scrollToDocLine?: number | null
}

function metaOf(options: EditorOptions): LineMeta {
  const pins = options.pins ?? []
  const lines = options.lines ?? null
  if (!lines && pins.length === 0) return { ...EMPTY_META, firstLine: options.firstLine }
  return { lines, firstLine: options.firstLine, pins }
}

/** gutter เลขบรรทัด — โหมด diff อ่านเลขจากเมตา (แถว filler ไม่มีเลข) */
function gutterFor(meta: LineMeta) {
  return lineNumbers({
    formatNumber: (n) => {
      const fileLine = fileLineAt(meta, n)
      return fileLine === null ? '' : String(fileLine)
    },
  })
}

export interface EditorHandle {
  view: EditorView
  update(next: EditorOptions): void
  openSearch(): void
  /** เลื่อนไปยังบรรทัดของ "ไฟล์จริง" (เลขฝั่ง head) — ใช้โดยหมุดของ reading list */
  scrollToFileLine(fileLine: number): void
  destroy(): void
}

export function createEditor(container: HTMLElement, options: EditorOptions): EditorHandle {
  const languageSlot = new Compartment()
  const themeSlot = new Compartment()
  const gutterSlot = new Compartment()
  const pinSlot = new Compartment()
  const wrapSlot = new Compartment()

  const { highlight, theme } = codeTheme(options.dark)
  let meta = metaOf(options)

  const initialDoc =
    options.scrollToDocLine ??
    (options.scrollToLine == null ? null : docLineForFileLine(meta, options.scrollToLine))
  const initialText = EditorState.create({ doc: options.text })
  const scrollTo =
    initialDoc !== null && initialDoc >= 1 && initialDoc <= initialText.doc.lines
      ? EditorView.scrollIntoView(initialText.doc.line(initialDoc).from, { y: 'start', yMargin: 12 })
      : undefined

  const view = new EditorView({
    parent: container,
    scrollTo,
    state: EditorState.create({
      doc: options.text,
      extensions: [
        lineMetaField.init(() => meta),
        gutterSlot.of(gutterFor(meta)),
        pinSlot.of(meta.pins.length > 0 ? [pinGutter] : []),
        lineDecorations,
        highlightSpecialChars(),
        wrapSlot.of(options.wrap === false ? [] : EditorView.lineWrapping),
        // อ่านอย่างเดียวแบบ "ยังเลือก/ค้นหาได้": readOnly กันการแก้ ส่วน editable ยังจริง
        // ถ้าปิด editable ด้วย editor จะโฟกัสไม่ได้ แล้ว Cmd-F ของ searchKeymap ก็จะไม่ทำงาน
        EditorState.readOnly.of(true),
        EditorState.tabSize.of(4),
        search({ top: true }),
        highlightSelectionMatches(),
        keymap.of([...searchKeymap, ...defaultKeymap]),
        themeSlot.of([theme, syntaxHighlighting(highlight)]),
        languageSlot.of([]),
      ],
    }),
  })

  let current = options
  let alive = true
  let languageSeq = 0

  const applyLanguage = (language: CodeLanguage | null): void => {
    const seq = ++languageSeq
    void languageExtension(language).then((ext) => {
      // โหลดช้ากว่าที่ผู้ใช้เปลี่ยนไฟล์ = ผลลัพธ์ตกรุ่น ต้องทิ้ง ไม่งั้นจะได้ grammar ของไฟล์ก่อนหน้า
      if (!alive || seq !== languageSeq) return
      view.dispatch({ effects: languageSlot.reconfigure(ext ?? []) })
    })
  }
  applyLanguage(options.language)

  return {
    view,
    update(next) {
      if (!alive) return
      const nextMeta = metaOf(next)
      const metaChanged =
        nextMeta.lines !== meta.lines || nextMeta.firstLine !== meta.firstLine || nextMeta.pins !== meta.pins
      if (next.text !== current.text) {
        // เก็บตำแหน่งที่ผู้อ่านอยู่ไว้ก่อน: เอกสารถูกเขียนใหม่ทั้งก้อนทุกครั้งที่ diff โหลดเสร็จ
        // หรือสลับ unified ↔ side-by-side ซึ่งยังเป็น "ไฟล์เดิม" อยู่ — ดีดกลับไปหัวไฟล์
        // ตอนนั้นเท่ากับดึงผู้อ่านออกจากบรรทัดที่กำลังอ่านโดยไม่มีเหตุผล
        const keepTop = view.scrollDOM.scrollTop
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: next.text },
          selection: { anchor: 0 },
          effects: metaChanged ? [setLineMeta.of(nextMeta)] : [],
        })
        view.scrollDOM.scrollTop = keepTop
      } else if (metaChanged) {
        view.dispatch({ effects: setLineMeta.of(nextMeta) })
      }
      if (metaChanged) {
        meta = nextMeta
        view.dispatch({
          effects: [
            gutterSlot.reconfigure(gutterFor(nextMeta)),
            pinSlot.reconfigure(nextMeta.pins.length > 0 ? [pinGutter] : []),
          ],
        })
      }
      if ((next.wrap === false) !== (current.wrap === false)) {
        view.dispatch({
          effects: wrapSlot.reconfigure(next.wrap === false ? [] : EditorView.lineWrapping),
        })
      }
      if (next.dark !== current.dark) {
        const swapped = codeTheme(next.dark)
        view.dispatch({
          effects: themeSlot.reconfigure([swapped.theme, syntaxHighlighting(swapped.highlight)]),
        })
      }
      if (next.language !== current.language) applyLanguage(next.language)
      current = next
    },
    openSearch() {
      if (!alive) return
      view.focus()
      openSearchPanel(view)
    },
    /**
     * เลื่อนสองชั้นโดยตั้งใจ: ตั้ง scrollTop จาก height map ให้เห็นผลทันทีในเฟรมนี้เลย
     * แล้วค่อยฝาก scrollIntoView ไว้ให้ CodeMirror จัดตำแหน่งให้เป๊ะตอนวัดขนาดรอบถัดไป
     *
     * ถ้ามีแต่ scrollIntoView อย่างเดียว การ "กางทั้งไฟล์" จะไม่เลื่อนไปไหนเมื่อ browser
     * ยังไม่ได้วาดเฟรมใหม่ (measure ของ CodeMirror ผูกกับ animation frame) — ผู้อ่านจะเจอ
     * หัวไฟล์แทนที่จะเป็นช่วงที่กำลังอ่านอยู่
     */
    scrollToFileLine(fileLine) {
      if (!alive) return
      const docLine = docLineForFileLine(meta, fileLine)
      if (docLine === null || docLine < 1 || docLine > view.state.doc.lines) return
      const line = view.state.doc.line(docLine)
      view.dispatch({ effects: EditorView.scrollIntoView(line.from, { y: 'start', yMargin: 12 }) })
      try {
        view.scrollDOM.scrollTop = Math.max(0, view.lineBlockAt(line.from).top - 12)
      } catch {
        // ตำแหน่งอยู่นอกช่วงที่ height map รู้จัก — ปล่อยให้ scrollIntoView จัดการอย่างเดียว
      }
    },
    destroy() {
      alive = false
      view.destroy()
    },
  }
}
