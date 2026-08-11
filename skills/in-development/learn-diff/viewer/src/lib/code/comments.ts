import { StateEffect, StateField, type Extension } from '@codemirror/state'
import { EditorView, GutterMarker, gutter } from '@codemirror/view'

import { EMPTY_META, fileLineAt, lineMetaField } from './decorations'

/**
 * แถบเปิดกล่อง comment ต่อบรรทัด (issue #49) — gutter ล้วน ๆ ไม่มี logic ของ GitHub อยู่ที่นี่
 *
 * ทำไมต้องเป็น gutter ไม่ใช่การกดบนตัวโค้ด: บนโค้ดมีเจ้าของอยู่แล้วสองคน — การเลือกข้อความ
 * และ navigation (Cmd-click / กดค้างบน symbol ของ #43) การเอา comment ไปแย่งตำแหน่งเดียวกัน
 * แปลว่าทุกครั้งที่ผู้อ่านแตะโค้ดต้องมีใครสักคนแพ้ · แยก target ให้ขาด: **comment เปิดจาก gutter,
 * navigation เปิดจาก symbol** (ข้อกำหนดใน Further Notes ของสเปก)
 *
 * สิ่งที่ข้ามกำแพงออกไปมีแค่ CommentRequest ซึ่งเป็นตัวเลข/บูลีนล้วน เหมือน NavRequest
 */

/** ผู้อ่านกดที่แถบ comment ของบรรทัดหนึ่ง — line เป็นเลขบรรทัดของไฟล์จริง ณ commit ที่ pin ไว้ */
export interface CommentRequest {
  line: number
  /** บรรทัดนี้มี comment อยู่แล้วกี่อัน (0 = กดเพื่อเขียนใหม่) */
  count: number
}

export interface CommentConfig {
  /** จำนวน comment ต่อบรรทัด (เลขบรรทัดฝั่ง head) — บรรทัดที่ไม่มีไม่ต้องใส่ */
  counts?: Readonly<Record<number, number>>
  onComment?: (req: CommentRequest) => void
}

export interface CommentConfigRef {
  current: CommentConfig
}

/** จำนวน comment ต่อบรรทัดอยู่ใน state เพราะมันเปลี่ยนหลังส่ง/refresh โดยที่เอกสารไม่เปลี่ยน */
export const setCommentCounts = StateEffect.define<Readonly<Record<number, number>>>()

const commentCountsField = StateField.define<Readonly<Record<number, number>>>({
  create: () => ({}),
  update(value, tr) {
    for (const effect of tr.effects) if (effect.is(setCommentCounts)) return effect.value
    return value
  },
})

class CommentMarker extends GutterMarker {
  private readonly count: number

  constructor(count: number) {
    super()
    this.count = count
  }

  override eq(other: CommentMarker): boolean {
    return other.count === this.count
  }

  override toDOM(): Node {
    const el = document.createElement('span')
    el.className = this.count > 0 ? 'cm-ld-comment cm-ld-comment-has' : 'cm-ld-comment'
    // มี comment แล้วโชว์จำนวน · ยังไม่มีโชว์ + (จาง ๆ จนกว่าจะ hover — บนมือถือเห็นตลอด)
    el.textContent = this.count > 0 ? String(this.count) : '+'
    el.title =
      this.count > 0 ? `${this.count} comment ที่บรรทัดนี้ — กดเพื่ออ่าน/ตอบ` : 'เขียน comment ที่บรรทัดนี้'
    return el
  }
}

/** บรรทัดของไฟล์จริงที่ตำแหน่งนี้ — แถว filler/แถวที่ถูกลบไม่มีตัวตนที่ pinned commit จึงคอมเมนต์ไม่ได้ */
function fileLineOf(view: EditorView, pos: number): number | null {
  const meta = view.state.field(lineMetaField, false) ?? EMPTY_META
  const docLine = view.state.doc.lineAt(pos).number
  const kind = meta.lines?.[docLine - 1]?.kind
  if (kind === 'del' || kind === 'filler') return null
  return fileLineAt(meta, docLine)
}

const commentTheme = EditorView.baseTheme({
  '.cm-ld-comment-gutter': { cursor: 'pointer', minWidth: '1.4em' },
  '.cm-ld-comment': {
    display: 'inline-block',
    minWidth: '1.2em',
    textAlign: 'center',
    borderRadius: '3px',
    fontSize: '10px',
    lineHeight: '1.4',
    // จาง ๆ ไว้ก่อน: แถบที่ตะโกนอยู่ทุกบรรทัดจะแย่งสายตาไปจากโค้ด
    opacity: '0.28',
  },
  '.cm-ld-comment-gutter:hover .cm-ld-comment': { opacity: '0.9' },
  '.cm-ld-comment-has': {
    opacity: '1',
    backgroundColor: 'rgb(59, 130, 246)',
    color: 'white',
    fontWeight: '600',
  },
})

/**
 * แถบ comment — ใส่เฉพาะตอนที่ผู้เรียกเปิดฟีเจอร์ (ไม่มี onComment = ไม่มีแถบ ไม่กินที่)
 * การกดถูกจับที่ gutter เท่านั้น จึงไม่ชนกับ pointer handler ของ navigation ที่อยู่บนตัวโค้ด
 */
export function commentGutter(ref: CommentConfigRef): Extension {
  return [
    commentCountsField,
    commentTheme,
    gutter({
      class: 'cm-ld-comment-gutter',
      lineMarker(view, line) {
        const fileLine = fileLineOf(view, line.from)
        if (fileLine === null) return null
        return new CommentMarker(view.state.field(commentCountsField)[fileLine] ?? 0)
      },
      // ต้องมี spacer ไม่งั้นความกว้างของ gutter ขยับตามเนื้อหาที่เลื่อนผ่าน = โค้ดทั้งก้อนขยับตาม
      initialSpacer: () => new CommentMarker(0),
      lineMarkerChange: (update) =>
        update.transactions.some((tr) => tr.effects.some((effect) => effect.is(setCommentCounts))),
      domEventHandlers: {
        click(view, line) {
          const fileLine = fileLineOf(view, line.from)
          if (fileLine === null) return false
          const config = ref.current
          if (!config.onComment) return false
          config.onComment({ line: fileLine, count: config.counts?.[fileLine] ?? 0 })
          return true
        },
      },
    }),
  ]
}
