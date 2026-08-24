import { StateEffect, StateField, type Extension } from '@codemirror/state'
import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view'

/**
 * Peek widget แบบ VSCode (Alt+F12) — block widget กางใต้บรรทัดใน code view (issue #36 → การทดลองแยก)
 *
 * กติกากำแพงยังเดิม: CodeMirror ไม่โผล่ออกนอกโฟลเดอร์นี้ · สิ่งที่ข้ามกำแพงเข้ามาคือ
 * **plain DOM element** ที่ฝั่ง React เป็นเจ้าของเนื้อหา (render ผ่าน portal) — ที่นี่แค่หา
 * ตำแหน่งบรรทัดแล้วฝากกล่องไว้ใต้บรรทัดนั้นด้วย block widget ของ CodeMirror
 *
 * ความสูงของกล่อง **คงที่** โดยตั้งใจ: block widget ที่สูงเปลี่ยนไปมา (ตอนเนื้อหาโหลดเสร็จ)
 * ทำให้ height map ของ virtualization สั่นและ scroll กระตุก — ล็อกความสูงตายตัวแล้วให้
 * เนื้อหาข้างใน scroll เองตัดปัญหาทั้งก้อน
 */

const PEEK_HEIGHT_PX = 288

class PeekWidget extends WidgetType {
  private readonly dom: HTMLElement

  constructor(dom: HTMLElement) {
    super()
    this.dom = dom
  }

  override eq(other: PeekWidget): boolean {
    return other.dom === this.dom
  }

  override toDOM(view: EditorView): HTMLElement {
    const wrap = document.createElement('div')
    wrap.className = 'cm-ld-peek'
    // content ของ editor กว้างกว่า viewport ได้ (โหมดไม่ wrap / บรรทัดยาว) — ตรึงกล่องให้กว้าง
    // เท่าที่ตามองเห็นแล้ว sticky ไว้ซ้ายสุด ไม่งั้นปุ่มปิดลอยไปอยู่สุดขอบขวาของบรรทัดที่ยาวที่สุด
    // (กล่องอยู่ใน content ซึ่งเริ่มหลัง gutter — ต้องหักความกว้าง gutter ออกไม่งั้นล้นขวา)
    const gutter = view.scrollDOM.querySelector<HTMLElement>('.cm-gutters')?.offsetWidth ?? 0
    wrap.style.width = `${Math.max(0, view.scrollDOM.clientWidth - gutter)}px`
    wrap.appendChild(this.dom)
    return wrap
  }

  override get estimatedHeight(): number {
    return PEEK_HEIGHT_PX
  }

  /** event ทั้งหมดในกล่องเป็นของเนื้อหา React ข้างใน — CodeMirror ห้ามตีความเป็นการแก้/เลือกข้อความ */
  override ignoreEvent(): boolean {
    return true
  }
}

interface PeekSpec {
  /** ตำแหน่ง (offset ท้ายบรรทัด) ที่กล่องกางอยู่ข้างใต้ */
  pos: number
  dom: HTMLElement
}

const setPeek = StateEffect.define<PeekSpec | null>()

const peekField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, tr) {
    // เอกสารถูกเขียนใหม่ (สลับไฟล์/โหมด diff) = บรรทัดที่กล่องเกาะอยู่ไม่มีความหมายแล้ว — ปิดทิ้ง
    let next = tr.docChanged ? Decoration.none : value
    for (const effect of tr.effects) {
      if (!effect.is(setPeek)) continue
      next =
        effect.value === null
          ? Decoration.none
          : Decoration.set([
              Decoration.widget({ widget: new PeekWidget(effect.value.dom), block: true, side: 1 }).range(
                effect.value.pos,
              ),
            ])
    }
    return next
  },
  provide: (field) => EditorView.decorations.from(field),
})

const peekTheme = EditorView.baseTheme({
  '.cm-ld-peek': {
    height: `${PEEK_HEIGHT_PX}px`,
    position: 'sticky',
    left: '0',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    borderTop: '2px solid rgb(59, 130, 246)',
    borderBottom: '2px solid rgb(59, 130, 246)',
  },
  '.cm-ld-peek > *': { flex: '1', minHeight: '0' },
})

/** เปิด peek ใต้แถวที่ระบุ (เลขแถวของเอกสาร) — เรียกซ้ำแทนที่อันเดิมเสมอ (peek มีได้ทีละอัน) */
export function openPeekAt(view: EditorView, docLine: number, dom: HTMLElement): void {
  if (docLine < 1 || docLine > view.state.doc.lines) return
  const line = view.state.doc.line(docLine)
  view.dispatch({ effects: setPeek.of({ pos: line.to, dom }) })
  // ให้เห็นทั้งบรรทัดต้นทางและหัวกล่องพร้อมกัน — เลื่อนให้บรรทัดอยู่ค่อนบนของ viewport
  view.dispatch({ effects: EditorView.scrollIntoView(line.from, { y: 'start', yMargin: 48 }) })
}

export function closePeek(view: EditorView): void {
  view.dispatch({ effects: setPeek.of(null) })
}

export const peekSupport: Extension = [peekField, peekTheme]
