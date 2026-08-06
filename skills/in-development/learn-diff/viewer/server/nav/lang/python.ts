/**
 * Indexer ภาษา Python — CONTRACT-f12 §2.1
 *
 * ใช้ tree-sitter (wasm) แทน regex เพราะต้องแยก identifier จริงออกจาก string/comment ให้ได้
 * (issue #36: "ระดับความแม่น syntactic") · ไม่ resolve type และไม่เดา class hierarchy
 *
 * grammar wasm มาจาก `@vscode/tree-sitter-wasm` ซึ่ง ship ไฟล์ wasm ล้วน ไม่มี postinstall
 * — เงื่อนไขของ user story 21 (ลงด้วย `pnpm install` ปกติ ไม่ต้องมี toolchain บนเครื่อง)
 */

import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

import { Language, Parser } from 'web-tree-sitter'
import type { Node, Tree } from 'web-tree-sitter'

import type { LanguageIndexer } from '../registry'
import type { Definition, FileIndex, IdentifierOccurrence, ImportBinding, SymbolHit } from '../types'

const require = createRequire(import.meta.url)

/** parser ตัวเดียวต่อ process — parse เป็น synchronous ทั้งหมด จึงไม่มีสอง parse ซ้อนกัน */
let parser: Parser | null = null
/** init เป็น idempotent: เก็บ promise ก้อนแรกไว้ ให้ผู้เรียกทีหลังรอก้อนเดิม */
let initialized: Promise<void> | null = null

async function init(): Promise<void> {
  initialized ??= (async () => {
    await Parser.init()
    // อ่านเป็น bytes เอง (ไม่ส่ง path ให้ Language.load) — path ของ wasm ใน node_modules
    // ขึ้นกับ layout ของ pnpm store ซึ่ง resolve ผ่าน `require.resolve` ได้แน่นอนกว่า
    const wasm = readFileSync(require.resolve('@vscode/tree-sitter-wasm/wasm/tree-sitter-python.wasm'))
    const language = await Language.load(wasm)
    const created = new Parser()
    created.setLanguage(language)
    parser = created
  })()
  return initialized
}

function parse(text: string): Tree {
  if (parser === null) throw new Error('python indexer ยังไม่ init (ต้องเรียก init() ก่อน)')
  const tree = parser.parse(text)
  if (tree === null) throw new Error('tree-sitter parse ไฟล์ Python ไม่สำเร็จ')
  return tree
}

/**
 * ตำแหน่งของ tree-sitter เป็น 0-based และ column เป็นหน่วย UTF-16 code unit
 * (web-tree-sitter parse จาก JS string) — ตรงกับที่ CodeMirror ใช้ จึงแค่ +1 ให้เป็น 1-based
 */
function nameOf(node: Node): { line: number; col: number; endCol: number } {
  return {
    line: node.startPosition.row + 1,
    col: node.startPosition.column + 1,
    endCol: node.endPosition.column + 1,
  }
}

/** ช่วงบรรทัดทั้งก้อน — นับ decorator เป็นส่วนหนึ่งของ definition ด้วย (`@app.route` ฯลฯ) */
function blockRange(node: Node): { from: number; to: number } {
  const outer = node.parent?.type === 'decorated_definition' ? node.parent : node
  return { from: outer.startPosition.row + 1, to: outer.endPosition.row + 1 }
}

/** def ที่อยู่ใน body ของ class โดยตรง = method (ไม่ไล่ข้าม function เพราะ nested def ไม่ใช่ method) */
function isMethod(node: Node): boolean {
  return node.parent?.type === 'block' && node.parent.parent?.type === 'class_definition'
}

/** ชื่อ module ดิบตามที่เขียนในโค้ด — เก็บจุดนำหน้าของ relative import ไว้ให้ resolver ตีความเอง */
function moduleSpecifier(node: Node): string {
  return node.text
}

/**
 * ชื่อที่ `import`/`from ... import` ผูกเข้ามาในไฟล์
 *
 * - `import a.b.c` ผูกชื่อ `a` (ไม่ใช่ `c`) — ตาม semantics ของ Python
 * - `import a.b as ab` / `from m import d as e` ผูกชื่อหลัง alias
 * - `from m import *` เก็บเป็น localName `'*'` ไว้เฉย ๆ ให้ resolver รู้ว่าไฟล์นี้ดึงชื่อจาก m แบบเหมารวม
 */
function collectImports(root: Node, imports: ImportBinding[]): void {
  // เดินทั้ง tree ไม่ใช่แค่ statement ระดับ module — `if TYPE_CHECKING:`, `try/except ImportError`
  // และ import ในฟังก์ชัน เป็น pattern ปกติของ Python จริง ถ้ามองไม่เห็นก็เท่ากับไฟล์นั้น
  // "ไม่ได้ import อะไรเลย" (definition ตอบ ambiguous, references ตกชั้นเป็น unconfirmed ทั้งไฟล์)
  const stack: Node[] = [root]
  while (stack.length > 0) {
    const stmt = stack.pop()!
    if (stmt.type !== 'import_statement' && stmt.type !== 'import_from_statement') {
      for (const child of stmt.namedChildren) {
        if (child !== null) stack.push(child)
      }
      continue
    }
    if (stmt.type === 'import_statement') {
      for (const target of stmt.childrenForFieldName('name')) {
        if (target === null) continue
        const line = target.startPosition.row + 1
        if (target.type === 'aliased_import') {
          const source = target.childForFieldName('name')
          const alias = target.childForFieldName('alias')
          if (source === null || alias === null) continue
          imports.push({
            localName: alias.text,
            importedName: null,
            source: moduleSpecifier(source),
            resolvedPath: null,
            line,
          })
          // การใช้งานจริงเป็นแบบ qualified (`pc.make_thing`) — cursor อยู่บนชื่อปลาย ไม่ใช่ alias
          // จึงเก็บ binding "ทั้ง module" (sentinel '*') ไว้ให้ resolver หาชื่อในไฟล์ต้นทางได้ด้วย
          imports.push({ localName: '*', importedName: null, source: moduleSpecifier(source), resolvedPath: null, line })
        } else if (target.type === 'dotted_name') {
          const first = target.namedChildren[0]
          if (!first) continue
          imports.push({
            localName: first.text,
            importedName: null,
            source: moduleSpecifier(target),
            resolvedPath: null,
            line,
          })
          // `import pkg.core` ตามด้วย `pkg.core.make_thing(…)` — เหตุผลเดียวกับ aliased ข้างบน
          imports.push({ localName: '*', importedName: null, source: moduleSpecifier(target), resolvedPath: null, line })
        }
      }
      continue
    }
    const moduleNode = stmt.childForFieldName('module_name')
    const source = moduleNode === null ? '' : moduleSpecifier(moduleNode)
    const line = stmt.startPosition.row + 1
    if (stmt.namedChildren.some((child) => child?.type === 'wildcard_import')) {
      imports.push({ localName: '*', importedName: null, source, resolvedPath: null, line })
      continue
    }
    for (const target of stmt.childrenForFieldName('name')) {
      if (target === null) continue
      if (target.type === 'aliased_import') {
        const original = target.childForFieldName('name')
        const alias = target.childForFieldName('alias')
        if (original === null || alias === null) continue
        imports.push({
          localName: alias.text,
          importedName: original.text,
          source,
          resolvedPath: null,
          line: target.startPosition.row + 1,
        })
      } else if (target.type === 'dotted_name') {
        imports.push({
          localName: target.text,
          importedName: target.text,
          source,
          resolvedPath: null,
          line: target.startPosition.row + 1,
        })
      }
    }
  }
}

/** ชื่อฝั่งซ้ายของ assignment — รองรับ `a = 1`, `a: int = 1` และ `a, b = f()` */
function assignedNames(left: Node, out: Node[]): void {
  if (left.type === 'identifier') {
    out.push(left)
    return
  }
  if (left.type === 'pattern_list' || left.type === 'tuple_pattern' || left.type === 'list_pattern') {
    for (const child of left.namedChildren) {
      if (child !== null) assignedNames(child, out)
    }
  }
}

/**
 * ตัวแปรระดับ module เท่านั้น (ตาม contract) — ตัวแปรใน function เป็น local
 * ที่ไม่มีใครกระโดดข้ามไฟล์มาหา แต่จะโผล่ใน identifiers อยู่แล้วในฐานะ occurrence
 */
function collectModuleVariables(root: Node, definitions: Definition[]): void {
  for (const stmt of root.namedChildren) {
    if (stmt?.type !== 'expression_statement') continue
    for (const expr of stmt.namedChildren) {
      if (expr?.type !== 'assignment') continue
      const left = expr.childForFieldName('left')
      if (left === null) continue
      const names: Node[] = []
      assignedNames(left, names)
      for (const name of names) {
        definitions.push({
          name: name.text,
          kind: 'variable',
          ...nameOf(name),
          from: stmt.startPosition.row + 1,
          to: stmt.endPosition.row + 1,
        })
      }
    }
  }
}

/**
 * เดินทั้ง tree ครั้งเดียวเก็บ def (function/class ทุกระดับ) กับ occurrence ของ identifier
 *
 * ไม่ใช้ recursion เพราะไฟล์ที่ nest ลึกผิดปกติจะทำ stack ล้นทั้ง dev server
 * — ที่นี่ผิดพลาดได้แค่ไฟล์เดียวไม่ควรล้มทั้ง process
 */
function walk(root: Node, definitions: Definition[], identifiers: IdentifierOccurrence[]): void {
  interface Scope {
    from: number
    to: number
  }
  const scopeOf = (node: Node): Scope => ({
    from: node.startPosition.row + 1,
    to: node.endPosition.row + 1,
  })

  // scope เดินมากับ node เพราะ stack แบบ iterative ไม่มี call stack ให้ยึด — resolve ใช้ช่วงนี้
  // ตัดสินว่า def ตัวไหนมองเห็นได้จากตำแหน่ง cursor (method ของคนละ class / nested def ต้องไม่ชนะ)
  const stack: { node: Node; scope: Scope }[] = [{ node: root, scope: scopeOf(root) }]
  while (stack.length > 0) {
    const { node, scope } = stack.pop()!
    if (node.type === 'identifier') {
      identifiers.push({ name: node.text, ...nameOf(node) })
      // identifier เป็น leaf — ไม่ต้องลงต่อ
      continue
    }
    if (node.type === 'function_definition' || node.type === 'class_definition') {
      const name = node.childForFieldName('name')
      if (name !== null) {
        definitions.push({
          name: name.text,
          kind: node.type === 'class_definition' ? 'class' : isMethod(node) ? 'method' : 'function',
          ...nameOf(name),
          ...blockRange(node),
          scopeFrom: scope.from,
          scopeTo: scope.to,
        })
      }
      // parameter อยู่ใน scope ของฟังก์ชันตัวเอง — ไม่นับเป็น def แปลว่า F12 บน parameter
      // ที่ชื่อชนกับ util จะกระโดดออกนอกไฟล์แบบมั่นใจแต่ผิด
      if (node.type === 'function_definition') collectParameters(node, definitions, scopeOf(node))
    }
    const inner =
      node.type === 'function_definition' || node.type === 'class_definition' ? scopeOf(node) : scope
    for (const child of node.namedChildren) {
      // string/comment ถูกตัดตรงนี้ — ข้างในไม่มี node ชนิด identifier อยู่แล้ว ยกเว้น
      // interpolation ของ f-string ซึ่งเป็น identifier จริงและควรนับ จึงไม่ข้าม string ทั้งก้อน
      if (child !== null) stack.push({ node: child, scope: inner })
    }
  }
}

/** ชื่อของ parameter แต่ละตัว — ข้ามชนิดที่ผูกชื่อไม่ได้ (เช่น `/` กับ `*` ที่คั่นชนิด parameter) */
function collectParameters(fn: Node, definitions: Definition[], scope: { from: number; to: number }): void {
  const params = fn.childForFieldName('parameters')
  if (params === null) return
  for (const param of params.namedChildren) {
    if (param === null) continue
    const name = param.type === 'identifier' ? param : param.namedChildren.find((c) => c?.type === 'identifier')
    if (!name) continue
    definitions.push({
      name: name.text,
      kind: 'variable',
      ...nameOf(name),
      from: param.startPosition.row + 1,
      to: param.endPosition.row + 1,
      scopeFrom: scope.from,
      scopeTo: scope.to,
    })
  }
}

function indexFile(filePath: string, text: string): FileIndex {
  const tree = parse(text)
  try {
    const definitions: Definition[] = []
    const identifiers: IdentifierOccurrence[] = []
    const imports: ImportBinding[] = []
    walk(tree.rootNode, definitions, identifiers)
    collectModuleVariables(tree.rootNode, definitions)
    collectImports(tree.rootNode, imports)
    // เรียงตามตำแหน่งในไฟล์ — walk ใช้ stack จึงคืนลำดับสลับ และผู้บริโภคคาดหวัง line asc
    identifiers.sort((a, b) => a.line - b.line || a.col - b.col)
    definitions.sort((a, b) => a.line - b.line || a.col - b.col)
    return { path: filePath, language: pythonIndexer.language, definitions, identifiers, imports }
  } finally {
    // web-tree-sitter จองหน่วยความจำฝั่ง wasm — ไม่ปล่อยเองคือ leak ตลอดอายุ process
    tree.delete()
  }
}

function symbolAt(text: string, line: number, col: number): SymbolHit | null {
  const tree = parse(text)
  try {
    const row = line - 1
    const at = (column: number): Node | null => {
      if (column < 0) return null
      const node: Node | null = tree.rootNode.descendantForPosition({ row, column })
      return node !== null && node.type === 'identifier' ? node : null
    }
    // cursor ที่วางชิดท้ายคำ (คลิกหลังตัวอักษรสุดท้าย) ต้องยังนับว่าอยู่บนคำนั้น — เหมือน editor ทั่วไป
    const node = at(col - 1) ?? at(col - 2)
    if (node === null) return null
    return { name: node.text, ...nameOf(node) }
  } finally {
    tree.delete()
  }
}

export const pythonIndexer: LanguageIndexer = {
  language: 'python',
  extensions: ['.py', '.pyi'],
  init,
  indexFile,
  symbolAt,
}
