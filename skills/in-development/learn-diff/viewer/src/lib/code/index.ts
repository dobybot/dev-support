import type { CodeLine } from '@/lib/diff'
import type { CodeLanguage } from '@/shared/languages'
import { docLineForFileLine, type CodePin } from './decorations'
import { createEditor, type EditorHandle } from './editor'
import type { NavRequest } from './navigation'

/**
 * ตัวแสดงโค้ดของ viewer — CodeMirror อยู่หลังกำแพงนี้ทั้งหมด (เหมือน mermaid ที่อยู่หลัง lib/diagram)
 *
 * ทำไมต้องเป็น CodeMirror: ของที่ต่อคิวอยู่ — หมุดของ reading list, การไฮไลต์บรรทัดที่ PR แก้,
 * และคอมเมนต์/คำถามแบบ inline — ล้วนเป็น gutter marker กับ decoration ซึ่ง CodeMirror มีให้
 * อยู่แล้ว ส่วน Shiki/Prism ต้องสร้างเองทั้งหมด · การ virtualize ของมันยังทำให้ "กางทั้งไฟล์"
 * ถูกด้วย: ไฟล์หมื่นบรรทัดวาดเฉพาะส่วนที่มองเห็น
 *
 * ห้าม import '@/lib/code/<ไฟล์>' จากนอกโฟลเดอร์นี้ (มีเทสต์คุมไว้ที่ test/code.test.ts)
 */

export type { CodePin, NavRequest }

export interface CodeViewOptions {
  /** เนื้อโค้ดของช่วงที่ขอ (ไม่มี newline ปิดท้าย) */
  text: string
  language: CodeLanguage | null
  /**
   * เลขบรรทัดของบรรทัดแรกใน `text` ที่ commit ที่ pin ไว้
   * gutter ต้องตรงกับ commit เป๊ะ ๆ ผู้อ่านจะได้อ้างเลขบรรทัดใน review comment ได้ (user story 24)
   */
  firstLine: number
  dark: boolean
  /**
   * เมตาต่อบรรทัดของโหมด diff (จาก lib/diff) — ไม่ส่ง = เอกสารธรรมดา
   * เลขบรรทัดของแต่ละแถวมาจากที่นี่ เพราะแถวที่ถูกลบใช้เลขฝั่ง base ไม่ใช่ฝั่ง head
   */
  lines?: CodeLine[] | null
  /** ช่วงอื่นของ reading list ที่อยู่ในไฟล์เดียวกัน */
  pins?: CodePin[]
  /** ความสูงคงที่ของ editor เช่น '60vh' — ทำให้ CodeMirror scroll เองและ virtualize ได้จริง */
  height?: string | null
  /** บรรทัด (เลขฝั่ง head) ที่ต้องเห็นตั้งแต่แรกเปิด — มีผลตอนสร้าง editor เท่านั้น */
  scrollToLine?: number | null
  /**
   * ผู้อ่านขอ go to definition (F12 / Cmd-click) หรือ find references (Shift-F12)
   * ไม่ส่ง = ปิดฟีเจอร์ (ไม่ underline ตอน Cmd-hover ด้วย) — เข้ากันได้กับผู้เรียกเดิม
   */
  onNavigate?: (req: NavRequest) => void
  /** false = ปิด navigation ของมุมมองนี้ แม้จะส่ง onNavigate มา */
  navigable?: boolean
}

/** สิ่งที่สั่งได้จากภายนอกโดยไม่ต้องรู้ว่าเป็นมุมมองเดี่ยวหรือสองฝั่ง (panel ถือ ref แบบนี้) */
export interface CodeControls {
  /** เปิดช่องค้นหาในไฟล์ (เทียบเท่ากด Cmd/Ctrl-F ตอน editor โฟกัสอยู่) */
  openSearch(): void
  /**
   * เลื่อนไปบรรทัดของไฟล์จริง (เลขฝั่ง head) — ปุ่มหมุดของ panel เรียกตัวนี้
   * `flash` = กะพริบบรรทัดปลายทางให้เห็นว่าลงตรงไหน (การกระโดดจาก definition/references)
   */
  scrollToLine(line: number, options?: { flash?: boolean }): void
  /**
   * กางกล่อง peek (block widget แบบ VSCode) ใต้บรรทัดของไฟล์จริง (เลขฝั่ง head)
   * `dom` เป็น plain DOM element ที่ผู้เรียกเป็นเจ้าของเนื้อหา (เช่น render ผ่าน React portal) —
   * มุมมองสองฝั่งกางที่ฝั่งขวา (pinned commit) ตามขอบเขตเดียวกับ navigation
   */
  openPeek(line: number, dom: HTMLElement): void
  /** ปิดกล่อง peek (ไม่มีอยู่ = ไม่ทำอะไร) */
  closePeek(): void
  destroy(): void
}

export interface CodeViewHandle extends CodeControls {
  update(next: CodeViewOptions): void
}

function applyHeight(el: HTMLElement, height: string | null | undefined): void {
  el.style.height = height ?? ''
}

export function mountCodeView(container: HTMLElement, options: CodeViewOptions): CodeViewHandle {
  applyHeight(container, options.height)
  const editor = createEditor(container, options)
  let current = options

  return {
    update(next) {
      if (next.height !== current.height) applyHeight(container, next.height)
      editor.update(next)
      current = next
    },
    openSearch: () => editor.openSearch(),
    scrollToLine: (line, scrollOptions) => editor.scrollToFileLine(line, scrollOptions),
    openPeek: (line, dom) => editor.openPeek(line, dom),
    closePeek: () => editor.closePeek(),
    destroy: () => editor.destroy(),
  }
}

export interface SplitCodeViewOptions {
  /** ฝั่งซ้าย = ก่อน PR (base) · ฝั่งขวา = commit ที่ pin ไว้ */
  left: CodeLine[]
  right: CodeLine[]
  language: CodeLanguage | null
  dark: boolean
  pins?: CodePin[]
  height?: string | null
  /** บรรทัด (เลขฝั่ง head) ที่ต้องเห็นตั้งแต่แรกเปิด — มีผลตอนสร้าง editor เท่านั้น */
  scrollToLine?: number | null
  /**
   * ผู้อ่านขอ navigation — wire เข้า **ฝั่งขวาเท่านั้น** (pinned commit)
   * ฝั่ง base ไม่ underline และไม่ตอบสนอง เพราะ index มีชุดเดียวที่ commit ที่ pin ไว้
   */
  onNavigate?: (req: NavRequest) => void
}

export interface SplitCodeViewHandle extends CodeControls {
  update(next: SplitCodeViewOptions): void
}

function docTextOf(lines: CodeLine[]): string {
  return lines.map((line) => line.text).join('\n')
}

/**
 * มุมมองสองฝั่งสำหรับการเขียนใหม่ยกก้อน (user story 20)
 *
 * สองฝั่งถูกจับให้ "แถวตรงกัน" มาแล้วจาก lib/diff (แถว filler) หน้าที่ของที่นี่คือทำให้มัน
 * **ยังตรงกันตอนเลื่อน**: ปิด line wrapping (บรรทัดยาวฝั่งเดียวจะดันทุกแถวหลังจากนั้นเหลื่อมทันที)
 * แล้วผูก scroll สองฝั่งเข้าหากัน
 */
export function mountSplitCodeView(
  container: HTMLElement,
  options: SplitCodeViewOptions,
): SplitCodeViewHandle {
  container.classList.add('ld-split')
  const leftHost = document.createElement('div')
  const rightHost = document.createElement('div')
  leftHost.className = 'ld-split-side'
  rightHost.className = 'ld-split-side'
  container.append(leftHost, rightHost)
  applyHeight(leftHost, options.height)
  applyHeight(rightHost, options.height)

  const common = { firstLine: 1, wrap: false }
  // แปลง "บรรทัดฝั่ง head" เป็น "แถวที่เท่าไร" ครั้งเดียวจากฝั่งขวา แล้วใช้เลขแถวเดียวกันทั้งสองฝั่ง
  const startRow =
    options.scrollToLine == null
      ? null
      : docLineForFileLine({ lines: options.right, firstLine: 1, pins: [] }, options.scrollToLine)
  const left = createEditor(leftHost, {
    ...common,
    language: options.language,
    dark: options.dark,
    text: docTextOf(options.left),
    lines: options.left,
    scrollToDocLine: startRow,
  })
  const right = createEditor(rightHost, {
    ...common,
    language: options.language,
    dark: options.dark,
    text: docTextOf(options.right),
    lines: options.right,
    pins: options.pins,
    scrollToDocLine: startRow,
    onNavigate: options.onNavigate,
  })

  /**
   * เลื่อนฝั่งหนึ่ง อีกฝั่งตามทันที — ไม่งั้น "เทียบซ้ายขวา" ก็ไม่เหลืออะไรให้เทียบ
   *
   * กันลูปด้วยการ "เทียบก่อนค่อยเซ็ต" ไม่ใช่ด้วยธงกันชนแบบตั้งเวลา: การตั้ง scrollTop
   * ทำให้อีกฝั่งยิง scroll กลับมาก็จริง แต่รอบนั้นจะเห็นว่าค่าเท่ากันแล้วจึงหยุดเอง
   * (ธงที่ปลดใน rAF พังทันทีที่ browser หยุดวาด — แล้วสองฝั่งก็เลื่อนหลุดกันถาวร)
   */
  const link = (from: EditorHandle, to: EditorHandle): (() => void) => {
    const handler = (): void => {
      const source = from.view.scrollDOM
      const target = to.view.scrollDOM
      if (target.scrollTop !== source.scrollTop) target.scrollTop = source.scrollTop
      if (target.scrollLeft !== source.scrollLeft) target.scrollLeft = source.scrollLeft
    }
    from.view.scrollDOM.addEventListener('scroll', handler, { passive: true })
    return () => from.view.scrollDOM.removeEventListener('scroll', handler)
  }
  const unlink = [link(left, right), link(right, left)]

  let current = options

  return {
    update(next) {
      if (next.height !== current.height) {
        applyHeight(leftHost, next.height)
        applyHeight(rightHost, next.height)
      }
      left.update({
        ...common,
        language: next.language,
        dark: next.dark,
        text: docTextOf(next.left),
        lines: next.left,
      })
      right.update({
        ...common,
        language: next.language,
        dark: next.dark,
        text: docTextOf(next.right),
        lines: next.right,
        pins: next.pins,
        onNavigate: next.onNavigate,
      })
      current = next
    },
    // ค้นหา = ค้นในโค้ดฝั่งใหม่ ซึ่งเป็นฝั่งที่ผู้อ่านกำลังทำความเข้าใจ
    openSearch: () => right.openSearch(),
    scrollToLine: (line, scrollOptions) => right.scrollToFileLine(line, scrollOptions),
    // peek กางที่ฝั่งขวา (pinned commit) — ฝั่ง base ไม่ตอบสนอง ตามขอบเขตเดียวกับ navigation
    openPeek: (line, dom) => right.openPeek(line, dom),
    closePeek: () => right.closePeek(),
    destroy() {
      for (const off of unlink) off()
      left.destroy()
      right.destroy()
      leftHost.remove()
      rightHost.remove()
      container.classList.remove('ld-split')
    },
  }
}
