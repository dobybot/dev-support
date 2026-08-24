import type { Root } from 'mdast'
import { visit } from 'unist-util-visit'

/**
 * แปลง remark-directive node → element ธรรมดาที่มี `data-ld` บอกชนิด
 *
 * ทำไมไม่ใช้ custom tag name (`<ld-note>`): react-markdown map component ตาม
 * tag name ของ HTML เท่านั้น การใช้ `div`/`span` + data attribute จึงเป็นทางที่
 * ไม่ต้องหลอก type และยัง degrade เป็น HTML ที่อ่านได้ถ้ามีใครเอา markdown ไป render ที่อื่น
 *
 * ชุด directive ที่อนุญาต: ../../references/content-format.md
 */

/** container (`:::name`) — เนื้อในเป็น markdown ต่อได้ */
const CONTAINERS = new Set(['tldr', 'note', 'question', 'answer', 'checklist'])
/** leaf (`::name[label]`) — หนึ่งบรรทัด */
const LEAVES = new Set(['verify', 'divider', 'reconciliation', 'box-map'])
/** inline (`:name[label]{...}`) */
const TEXTS = new Set(['file', 'read'])

interface DirectiveNode {
  type: string
  name: string
  attributes?: Record<string, string | null | undefined> | null
  data?: {
    hName?: string
    hProperties?: Record<string, unknown>
  }
}

function apply(node: DirectiveNode, tagName: string, props: Record<string, unknown>): void {
  const data = node.data ?? (node.data = {})
  data.hName = tagName
  data.hProperties = { ...(data.hProperties ?? {}), ...props }
}

function attrs(node: DirectiveNode): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(node.attributes ?? {})) {
    if (typeof value === 'string') out[key] = value
  }
  return out
}

/** token ของ diffstat: `+2,644` / `−62` (ยอมทั้ง minus จริงและ hyphen) ต้องเป็นคำโดด ๆ */
const DIFFSTAT_TOKEN = /(?<=^|[\s(])([+−-]\d[\d,]*)(?=$|[\s).,;:/])/g

/**
 * ลงสี `+N` / `−N` ใน subtitle (issue #29) — วิธี viewer-side ล้วน ไม่แตะ schema
 *
 * กันการทาสีมั่ว: จะแตะ text node ก็ต่อเมื่อในสตริงเดียวกันมี**ทั้งเครื่องหมายบวกและลบ**
 * (คู่แบบ GitHub `+2,644 / −62`) — ตัวเลขติดลบเดี่ยว ๆ ในประโยคทั่วไปจึงไม่ถูกทา
 * เปิดใช้เฉพาะ subtitle เท่านั้น (ผ่าน prop `diffstat` ของ InlineMd) ไม่ใช่ทุก prose
 */
export function remarkDiffstatColors() {
  return (tree: Root): void => {
    visit(tree, 'text', (node, index, parent) => {
      if (!parent || index === undefined) return
      const value = (node as { value: string }).value
      const tokens = value.match(DIFFSTAT_TOKEN)
      if (!tokens) return
      const hasAdd = tokens.some((t) => t.startsWith('+'))
      const hasDel = tokens.some((t) => !t.startsWith('+'))
      if (!hasAdd || !hasDel) return

      const out: unknown[] = []
      let last = 0
      DIFFSTAT_TOKEN.lastIndex = 0
      for (const match of value.matchAll(DIFFSTAT_TOKEN)) {
        const at = match.index ?? 0
        if (at > last) out.push({ type: 'text', value: value.slice(last, at) })
        const token = match[0]
        out.push({
          // node ที่ mdast ไม่รู้จัก + data.hName → to-hast render เป็น element ให้เอง
          // (กลไกเดียวกับ directive ข้างบน)
          type: 'diffstat',
          children: [{ type: 'text', value: token }],
          data: {
            hName: 'span',
            hProperties: { 'data-ld': token.startsWith('+') ? 'diffstat-add' : 'diffstat-del' },
          },
        })
        last = at + token.length
      }
      if (last < value.length) out.push({ type: 'text', value: value.slice(last) })
      parent.children.splice(index, 1, ...(out as typeof parent.children))
      return index + out.length
    })
  }
}

export function remarkLearnDiff() {
  return (tree: Root): void => {
    visit(tree, (node) => {
      const kind = node.type
      if (kind !== 'containerDirective' && kind !== 'leafDirective' && kind !== 'textDirective') {
        return
      }
      const directive = node as unknown as DirectiveNode
      const name = directive.name
      const a = attrs(directive)

      const allowed =
        (kind === 'containerDirective' && CONTAINERS.has(name)) ||
        (kind === 'leafDirective' && LEAVES.has(name)) ||
        (kind === 'textDirective' && TEXTS.has(name))

      if (!allowed) {
        // directive ที่ไม่รู้จักต้อง "ดัง" ไม่ใช่หายไปเงียบ ๆ (SPEC-v3 → loud validation)
        apply(directive, kind === 'textDirective' ? 'span' : 'div', {
          'data-ld': 'unknown',
          'data-name': `${kind === 'containerDirective' ? ':::' : kind === 'leafDirective' ? '::' : ':'}${name}`,
        })
        return
      }

      switch (name) {
        case 'note':
          apply(directive, 'div', { 'data-ld': 'note', 'data-type': a.type ?? 'info' })
          break
        case 'question':
          apply(directive, 'div', { 'data-ld': 'question', 'data-qid': a.id ?? '' })
          break
        case 'file':
          apply(directive, 'span', {
            'data-ld': 'file',
            'data-path': a.path ?? '',
            'data-lines': a.lines ?? '',
          })
          break
        case 'read':
          apply(directive, 'span', { 'data-ld': 'read', 'data-list': a.list ?? '' })
          break
        default:
          apply(directive, kind === 'textDirective' ? 'span' : 'div', { 'data-ld': name })
      }
    })
  }
}
