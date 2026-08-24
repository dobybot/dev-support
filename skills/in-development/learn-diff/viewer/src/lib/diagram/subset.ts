/**
 * Subset ของ mermaid ที่ agent เขียนได้ — parser/checker แบบ deterministic
 *
 * เหตุผลที่ต้องมี (SPEC-v3 → Diagrams): contract ที่เสถียรคือ "ข้อความ mermaid" ไม่ใช่ JSON
 * ที่เราคิดขึ้นเอง แต่ถ้าปล่อยให้ใช้ mermaid ได้ทั้งภาษา วันที่อยากเปลี่ยน engine ก็เปลี่ยนไม่ได้จริง
 * ต่อให้ interface บอกว่าเปลี่ยนได้ · ไฟล์นี้จึงเป็น "กฎ" ไม่ใช่ "ข้อแนะนำ" — เขียนนอก subset
 * แล้วผู้อ่านจะเห็นแถบแดงบนไดอะแกรม
 *
 * subset ที่อนุญาต (ฉบับมนุษย์อ่าน: ../../../../references/diagram-mermaid.md):
 *   flowchart <LR|RL|TB|TD|BT>    ← บรรทัดแรกเท่านั้น
 *   direction <LR|RL|TB|TD|BT>    ← ใน subgraph
 *   node: A[..] A(..) A([..]) A{..}
 *   edge: --> --- -.-> -.-  ทั้งแบบมีป้ายและไม่มีป้าย (`-- ป้าย -->`, `-->|ป้าย|`, `-. ป้าย .->`)
 *   subgraph <id> [ชื่อ] … end
 *   classDef <ชื่อ> <style>
 *   class <A,B> <ชื่อ>
 *   %% comment
 *
 * ไฟล์นี้ไม่ import mermaid และไม่แตะ DOM — เทสต์ได้ใน environment node
 */

/** class ที่ renderer เตรียม style ให้แล้ว — agent ใช้ได้เลยโดยไม่ต้องประกาศสีเอง */
export const BUILTIN_CLASSES = ['changed', 'risk', 'external'] as const

export type BuiltinClass = (typeof BUILTIN_CLASSES)[number]

export const DIRECTIONS = ['LR', 'RL', 'TB', 'TD', 'BT'] as const

export interface DiagramViolation {
  /** เลขบรรทัดใน source (1-based) */
  line: number
  /** ข้อความบรรทัดนั้น (ตัดช่องว่างหัวท้ายแล้ว) */
  text: string
  /** อธิบายว่าผิดกฎข้อไหนและให้เขียนแทนด้วยอะไร (ภาษาไทย — ผู้อ่านเห็นบนหน้า) */
  message: string
}

export interface ParsedDiagram {
  direction: string | null
  /** node id ทุกตัวที่ปรากฏใน source เรียงตามลำดับที่เจอครั้งแรก */
  nodes: string[]
  /** id ของ subgraph */
  subgraphs: string[]
  /** ชื่อ class ที่ source ประกาศ classDef เอง */
  classDefs: string[]
  /** ชื่อ class ที่ถูกเอาไปใช้จริงด้วยคำสั่ง `class` */
  classUsages: string[]
  violations: DiagramViolation[]
}

/** อักขระแทนที่ตอน mask — ต้องยาว 1 ตัวและไม่ใช่อักขระที่ปรากฏใน syntax จริง */
const MASK = '\u0001'

/**
 * แทนที่เนื้อในวงเล็บ/ในเครื่องหมาย `|…|` ด้วยอักขระกลาง ๆ ความยาวเท่าเดิม
 * เพื่อให้การหาตัวดำเนินการของเส้นเชื่อมไม่ไปสะดุดข้อความในป้ายชื่อ (label อาจมี `-` หรือ `>` ได้)
 */
function maskLabels(line: string): string {
  const out = line.split('')
  let depth = 0
  let inPipe = false
  for (let i = 0; i < out.length; i++) {
    const ch = out[i]
    if (!inPipe && (ch === '[' || ch === '(' || ch === '{')) {
      depth++
      continue
    }
    if (!inPipe && (ch === ']' || ch === ')' || ch === '}')) {
      depth = Math.max(0, depth - 1)
      continue
    }
    if (depth === 0 && ch === '|') {
      inPipe = !inPipe
      continue
    }
    if (depth > 0 || inPipe) out[i] = MASK
  }
  return out.join('')
}

/** ตัวดำเนินการเส้นเชื่อมที่อนุญาต เรียงจากยาวไปสั้น (ตัวยาวต้องถูกจับก่อน) */
const EDGE_OPS: { re: RegExp; label: string }[] = [
  { re: /^-\.\s.*?\s\.->/, label: 'dotted-with-label' },
  { re: /^--\s.*?\s-->/, label: 'solid-with-label' },
  { re: /^-\.->/, label: 'dotted' },
  { re: /^-\.-(?!-)/, label: 'dotted-line' },
  { re: /^-->/, label: 'solid' },
  { re: /^---(?!-)/, label: 'line' },
]

/** เส้นเชื่อมนอก subset ที่เจอบ่อย — ดักไว้เพื่อให้ข้อความบอกได้ตรง ๆ ว่าให้ใช้อะไรแทน */
const REJECTED_OPS: { re: RegExp; message: string }[] = [
  { re: /^={2,}>/, message: 'เส้นหนา `==>` ไม่อยู่ใน subset — ใช้ `-->` แล้วเน้นด้วย class `changed` แทน' },
  { re: /^={3,}/, message: 'เส้นหนา `===` ไม่อยู่ใน subset — ใช้ `---`' },
  { re: /^<--/, message: 'หัวลูกศรย้อน `<--` ไม่อยู่ใน subset — สลับข้างแล้วใช้ `-->`' },
  {
    re: /^o--[ox-]|^--o(?=\s|$)|^x--[ox-]|^--x(?=\s|$)/,
    message: 'ปลายเส้นแบบ `o`/`x` ไม่อยู่ใน subset — ใช้ `-->` หรือ `---`',
  },
  { re: /^-{4,}/, message: 'เส้นยาว (`----`) ไม่อยู่ใน subset — ความยาวเส้นปล่อยให้ layout จัดเอง' },
]

const NODE_ID = /^[A-Za-z_][A-Za-z0-9_-]*$/

/** รูปทรง node ที่อนุญาต: A[..] A(..) A([..]) A{..} */
const NODE_TOKEN = /^([A-Za-z_][A-Za-z0-9_-]*)(?:\(\[[\s\S]*\]\)|\[[\s\S]*\]|\([\s\S]*\)|\{[\s\S]*\})?$/

const REJECTED_SHAPES: { re: RegExp; message: string }[] = [
  { re: /\{\{/, message: 'รูปทรง `{{…}}` (hexagon) ไม่อยู่ใน subset — ใช้ `[…]` `(…)` `([…])` หรือ `{…}`' },
  { re: /\[\[/, message: 'รูปทรง `[[…]]` ไม่อยู่ใน subset — ใช้ `[…]`' },
  { re: /\[\(/, message: 'รูปทรง `[(…)]` (ฐานข้อมูล) ไม่อยู่ใน subset — ใช้ `[…]` แล้วเขียนในป้ายว่าเป็น DB' },
  { re: /\[[/\\]/, message: 'รูปทรงเอียง/สี่เหลี่ยมคางหมู ไม่อยู่ใน subset — ใช้ `[…]` หรือ `{…}`' },
  { re: /\(\(/, message: 'รูปทรง `((…))` (วงกลม) ไม่อยู่ใน subset — ใช้ `([…])`' },
  { re: />[^-]*\]/, message: 'รูปทรงธง `>…]` ไม่อยู่ใน subset — ใช้ `[…]`' },
  {
    re: /:::/,
    message: 'ใส่ class ติดกับ node แบบ `A:::changed` ไม่อยู่ใน subset — ใช้บรรทัด `class A changed` แยก',
  },
]

/** statement ที่ห้ามทั้งบรรทัด พร้อมเหตุผล */
const REJECTED_STATEMENTS: { re: RegExp; message: string }[] = [
  {
    re: /^click\b/,
    message:
      'คำสั่ง `click` ห้ามใช้ — การกด node มาจาก `nodeMap` ใน run.json (ไม่ต้องพึ่ง securityLevel: loose)',
  },
  { re: /^style\b/, message: 'คำสั่ง `style` (สีรายตัว) ห้ามใช้ — ใช้ `class` กับ class ที่มีให้แล้ว' },
  { re: /^linkStyle\b/, message: 'คำสั่ง `linkStyle` ห้ามใช้ — หน้าตาเส้นเป็นเรื่องของ viewer' },
  { re: /^%%\{/, message: 'init directive `%%{…}%%` ห้ามใช้ — ธีมและ config ตั้งจากฝั่ง viewer' },
  { re: /^---\s*$/, message: 'front matter `---` ห้ามใช้ — ตั้ง config ที่ viewer' },
  {
    re: /^(sequenceDiagram|classDiagram|stateDiagram(-v2)?|erDiagram|journey|gantt|pie|mindmap|timeline|quadrantChart|gitGraph|C4Context|sankey|xychart|block|architecture)\b/,
    message: 'รองรับเฉพาะ `flowchart` เท่านั้น — ไดอะแกรมชนิดอื่นไม่อยู่ใน subset',
  },
]

interface ParseState {
  nodes: string[]
  seen: Set<string>
}

function addNode(state: ParseState, id: string) {
  if (state.seen.has(id)) return
  state.seen.add(id)
  state.nodes.push(id)
}

/**
 * แยกบรรทัด statement (node/edge) ออกเป็น token ของ node กับตัวดำเนินการเส้นเชื่อม
 * คืน violation ถ้าเจอตัวดำเนินการหรือรูปทรงนอก subset
 */
function parseStatement(
  line: string,
  lineNo: number,
  state: ParseState,
  violations: DiagramViolation[],
) {
  const masked = maskLabels(line)
  /** ช่วง [เริ่ม, จบ) ของแต่ละ token — เก็บเป็นตำแหน่ง เพราะต้องใช้ทั้งข้อความจริงและตัวที่ mask แล้ว */
  const spans: [number, number][] = []
  let start = 0
  let i = 0
  let sawEdge = false

  while (i < masked.length) {
    const rest = masked.slice(i)
    const rejected = REJECTED_OPS.find((op) => op.re.test(rest))
    if (rejected) {
      violations.push({ line: lineNo, text: line, message: rejected.message })
      return
    }
    const op = EDGE_OPS.find((candidate) => candidate.re.test(rest))
    if (op) {
      const matched = op.re.exec(rest)![0]
      spans.push([start, i])
      sawEdge = true
      i += matched.length
      // ป้ายแบบ `-->|ข้อความ|` ต่อท้ายตัวดำเนินการได้
      const pipe = /^\s*\|[\s\S]*?\|/.exec(masked.slice(i))
      if (pipe) i += pipe[0].length
      start = i
      continue
    }
    if (rest.startsWith('-') || rest.startsWith('=') || rest.startsWith('<')) {
      violations.push({
        line: lineNo,
        text: line,
        message: `เส้นเชื่อมนอก subset — ใช้ได้แค่ \`-->\` \`---\` \`-.->\` \`-.-\` (พร้อมป้ายแบบ \`-- ป้าย -->\` หรือ \`-->|ป้าย|\`)`,
      })
      return
    }
    i++
  }
  spans.push([start, line.length])

  if (masked.includes('&')) {
    violations.push({
      line: lineNo,
      text: line,
      message: 'การเชื่อมหลายตัวด้วย `&` ไม่อยู่ใน subset — เขียนแยกทีละเส้น',
    })
    return
  }
  if (masked.includes(';')) {
    violations.push({
      line: lineNo,
      text: line,
      message: 'ปิดท้ายด้วย `;` ไม่อยู่ใน subset — หนึ่ง statement ต่อหนึ่งบรรทัด',
    })
    return
  }

  for (const [from, to] of spans) {
    const token = line.slice(from, to).trim()
    // ตรวจรูปทรงบนตัวที่ mask แล้ว — ป้ายชื่ออาจมี `>` หรือ `[` อยู่ข้างในได้โดยไม่ผิดกฎ
    const maskedToken = masked.slice(from, to).trim()
    if (!token) {
      violations.push({
        line: lineNo,
        text: line,
        message: 'เส้นเชื่อมต้องมี node ทั้งสองฝั่ง',
      })
      return
    }
    const shape = REJECTED_SHAPES.find((s) => s.re.test(maskedToken))
    if (shape) {
      violations.push({ line: lineNo, text: line, message: shape.message })
      continue
    }
    const match = NODE_TOKEN.exec(token)
    if (!match) {
      violations.push({
        line: lineNo,
        text: line,
        message: sawEdge
          ? `อ่าน node "${token}" ไม่ออก — เขียนเป็น \`id[ป้าย]\` (id ใช้ได้แค่ a-z A-Z 0-9 _ -)`
          : `บรรทัดนี้ไม่ใช่ statement ที่ subset รองรับ — ดู references/diagram-mermaid.md`,
      })
      continue
    }
    addNode(state, match[1])
  }
}

/** อ่าน source ตาม subset · ผลลัพธ์ใช้ทั้งตรวจกฎและหา node id ให้ nodeMap */
export function parseDiagram(source: string): ParsedDiagram {
  const violations: DiagramViolation[] = []
  const state: ParseState = { nodes: [], seen: new Set() }
  const subgraphs: string[] = []
  const classDefs: string[] = []
  const classUsages: string[] = []
  const assignments: { targets: string[]; className: string; line: number; text: string }[] = []
  let direction: string | null = null
  let headerSeen = false
  let depth = 0

  const lines = source.replace(/\r\n/g, '\n').split('\n')

  lines.forEach((raw, index) => {
    const lineNo = index + 1
    const line = raw.trim()
    if (!line) return
    if (line.startsWith('%%') && !line.startsWith('%%{')) return

    const rejected = REJECTED_STATEMENTS.find((s) => s.re.test(line))
    if (rejected) {
      violations.push({ line: lineNo, text: line, message: rejected.message })
      return
    }

    if (!headerSeen) {
      headerSeen = true
      const header = /^(flowchart|graph)\s+([A-Za-z]{2})$/.exec(line)
      if (!header) {
        violations.push({
          line: lineNo,
          text: line,
          message: 'บรรทัดแรกต้องเป็น `flowchart <LR|RL|TB|TD|BT>`',
        })
        return
      }
      if (header[1] === 'graph') {
        violations.push({
          line: lineNo,
          text: line,
          message: '`graph` เป็นชื่อเก่า — ใช้ `flowchart` แทน',
        })
      }
      const dir = header[2].toUpperCase()
      if (!(DIRECTIONS as readonly string[]).includes(dir)) {
        violations.push({
          line: lineNo,
          text: line,
          message: `ทิศทาง "${dir}" ไม่รองรับ — ใช้ ${DIRECTIONS.join(', ')}`,
        })
        return
      }
      direction = dir
      return
    }

    if (/^end$/.test(line)) {
      if (depth === 0) {
        violations.push({ line: lineNo, text: line, message: '`end` เกินมา — ไม่มี `subgraph` ที่ค้างอยู่' })
        return
      }
      depth--
      return
    }

    const subgraph = /^subgraph\s+(.+)$/.exec(line)
    if (subgraph) {
      depth++
      const rest = subgraph[1].trim()
      const withTitle = /^([A-Za-z_][A-Za-z0-9_-]*)\s*\[[\s\S]*\]$/.exec(rest)
      if (withTitle) {
        subgraphs.push(withTitle[1])
      } else if (NODE_ID.test(rest)) {
        subgraphs.push(rest)
      } else {
        violations.push({
          line: lineNo,
          text: line,
          message: 'subgraph ต้องเขียนเป็น `subgraph <id> [ชื่อที่จะแสดง]` — ต้องมี id เพราะ class อ้างจาก id',
        })
      }
      return
    }

    const dirLine = /^direction\s+([A-Za-z]{2})$/.exec(line)
    if (dirLine) {
      const dir = dirLine[1].toUpperCase()
      if (!(DIRECTIONS as readonly string[]).includes(dir)) {
        violations.push({
          line: lineNo,
          text: line,
          message: `ทิศทาง "${dir}" ไม่รองรับ — ใช้ ${DIRECTIONS.join(', ')}`,
        })
      }
      return
    }

    const classDef = /^classDef\s+([A-Za-z_][A-Za-z0-9_-]*)\s+(.+)$/.exec(line)
    if (classDef) {
      classDefs.push(classDef[1])
      return
    }

    const classUse = /^class\s+([A-Za-z_][A-Za-z0-9_,\s-]*?)\s+([A-Za-z_][A-Za-z0-9_-]*)$/.exec(line)
    if (classUse) {
      classUsages.push(classUse[2])
      assignments.push({
        targets: classUse[1].split(',').map((t) => t.trim()).filter(Boolean),
        className: classUse[2],
        line: lineNo,
        text: line,
      })
      return
    }
    if (/^class\b/.test(line)) {
      violations.push({
        line: lineNo,
        text: line,
        message: 'เขียน `class <id,id> <ชื่อ class>` (id คั่นด้วยจุลภาค ไม่มีวงเล็บ)',
      })
      return
    }

    parseStatement(line, lineNo, state, violations)
  })

  if (!headerSeen) {
    violations.push({ line: 1, text: '', message: 'diagram ว่าง — ต้องมี `flowchart <ทิศทาง>` อย่างน้อย' })
  }
  if (depth > 0) {
    violations.push({
      line: lines.length,
      text: '',
      message: `มี \`subgraph\` ที่ยังไม่ได้ปิดด้วย \`end\` อยู่ ${depth} อัน`,
    })
  }

  // class ที่ใช้ต้องมีให้จริง และต้องชี้ไปที่ node/subgraph ที่มีอยู่จริง
  // ทั้งสองกรณี mermaid จะเงียบสนิท — ผลคือ "หน้าตาไม่เน้นให้" โดยไม่มีใครรู้ว่าพัง
  const known = new Set<string>([...BUILTIN_CLASSES, ...classDefs])
  const targets = new Set<string>([...state.nodes, ...subgraphs])
  const reported = new Set<string>()
  // ถ้ามี statement ที่อ่านไม่ผ่านอยู่แล้ว รายชื่อ node ยังไม่ครบ — การไล่เช็ค target ต่อ
  // จะได้แต่ error ลูกโซ่ที่ไม่ใช่สาเหตุจริง แก้อันแรกแล้วค่อยว่ากันใหม่
  const trustNodeList = violations.length === 0
  for (const use of assignments) {
    if (!known.has(use.className) && !reported.has(use.className)) {
      reported.add(use.className)
      violations.push({
        line: use.line,
        text: use.text,
        message: `class "${use.className}" ไม่มีอยู่จริง — ใช้ ${BUILTIN_CLASSES.join(' / ')} หรือประกาศด้วย \`classDef\` ก่อน`,
      })
    }
    for (const target of use.targets) {
      if (!trustNodeList || targets.has(target)) continue
      violations.push({
        line: use.line,
        text: use.text,
        message: `\`class\` ชี้ไปที่ "${target}" ซึ่งไม่มีใน diagram นี้ — สะกด id ให้ตรงกับที่ประกาศไว้`,
      })
    }
  }

  return {
    direction,
    nodes: state.nodes,
    subgraphs,
    classDefs,
    classUsages,
    violations,
  }
}
