import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

import type { LanguageIndexer } from '../registry'
import type {
  Definition,
  DefinitionKind,
  FileIndex,
  IdentifierOccurrence,
  ImportBinding,
  SymbolHit,
} from '../types'
import { Language, Parser, type Node } from 'web-tree-sitter'

/**
 * Indexer ของ TS/JS (CONTRACT-f12 §2.1) — syntactic ล้วน ไม่ resolve type
 *
 * grammar มาจาก `@vscode/tree-sitter-wasm` ซึ่ง ship เฉพาะไฟล์ wasm ไม่มี postinstall/native build
 * จึงลงได้ด้วย `pnpm install` ปกติของทีม (issue #36 user story 21)
 */

/** ไฟล์ .ts ล้วนใช้ grammar typescript · ที่เหลือใช้ tsx เพราะต้องอ่าน JSX ได้ */
const TSX_EXTENSIONS = new Set(['.tsx', '.jsx', '.js', '.mjs'])

/** ภาษาที่รายงานออกไปใน response — .ts/.tsx เป็น typescript ที่เหลือเป็น javascript */
const TS_EXTENSIONS = new Set(['.ts', '.tsx'])

/**
 * node ที่ถือเป็น "identifier หนึ่งตัว" — tree-sitter คัด string/comment ออกให้แล้วโดยธรรมชาติ
 * เพราะเนื้อใน string เป็น `string_fragment` ไม่ใช่ identifier
 *
 * `property_identifier` รวมด้วยตั้งใจ: คนอ่าน PR ถาม "ใครเรียก method นี้" บ่อยกว่าถามหา
 * เฉพาะตัวแปร local — ยึดหลัก false negative อันตรายกว่า noise
 */
const IDENTIFIER_TYPES = new Set([
  'identifier',
  'type_identifier',
  'property_identifier',
  'shorthand_property_identifier',
  'shorthand_property_identifier_pattern',
])

const require_ = createRequire(import.meta.url)

let ready: Promise<void> | null = null
let tsParser: Parser | null = null
let tsxParser: Parser | null = null

async function loadParsers(): Promise<void> {
  await Parser.init()
  const load = async (grammar: string): Promise<Parser> => {
    // อ่านเป็น bytes เองแบบเดียวกับ python.ts — path ใน pnpm store resolve ผ่าน require.resolve
    // ได้แน่นอนกว่า และสองไฟล์นี้ต้องโหลด grammar ทางเดียวกัน ไม่งั้นคอมเมนต์ฝั่งหนึ่งขัดกับโค้ดอีกฝั่ง
    const wasm = readFileSync(require_.resolve(`@vscode/tree-sitter-wasm/wasm/tree-sitter-${grammar}.wasm`))
    const parser = new Parser()
    parser.setLanguage(await Language.load(wasm))
    return parser
  }
  ;[tsParser, tsxParser] = await Promise.all([load('typescript'), load('tsx')])
}

function parserFor(filePath: string): Parser {
  if (tsParser === null || tsxParser === null) {
    throw new Error('เรียก indexFile ก่อน init() — grammar ยังไม่ถูกโหลด')
  }
  return TSX_EXTENSIONS.has(extOf(filePath)) ? tsxParser : tsParser
}

function extOf(filePath: string): string {
  return path.posix.extname(filePath).toLowerCase()
}

function languageOf(filePath: string): string {
  return TS_EXTENSIONS.has(extOf(filePath)) ? 'typescript' : 'javascript'
}

/** ตัดเครื่องหมายคำพูดออกจาก node ชนิด `string` ของ grammar */
function stringValue(node: Node | null): string | null {
  if (node === null) return null
  const raw = node.text
  if (raw.length < 2) return null
  const quote = raw[0]
  if (quote !== '"' && quote !== "'" && quote !== '`') return null
  return raw.slice(1, -1)
}

/**
 * ก้อนที่ควรถือเป็น "definition ทั้งก้อน" — ไต่จาก declarator ขึ้นไปถึง statement จริง
 * เพื่อให้ `from`/`to` ครอบ `export const x = () => {…}` ทั้งอัน ไม่ใช่แค่ตัว declarator
 */
function statementOf(node: Node): Node {
  let current = node
  while (
    current.parent !== null &&
    (current.parent.type === 'variable_declaration' ||
      current.parent.type === 'lexical_declaration' ||
      current.parent.type === 'export_statement')
  ) {
    current = current.parent
  }
  return current
}

function defineAt(nameNode: Node, kind: DefinitionKind, block: Node): Definition {
  return {
    name: nameNode.text,
    kind,
    line: nameNode.startPosition.row + 1,
    col: nameNode.startPosition.column + 1,
    from: block.startPosition.row + 1,
    to: block.endPosition.row + 1,
  }
}

/** ค่าที่เป็นฟังก์ชันทำให้ `const f = () => {}` ถูกนับเป็น function ไม่ใช่ variable */
function isFunctionValue(node: Node | null): boolean {
  return node !== null && (node.type === 'arrow_function' || node.type === 'function_expression' || node.type === 'function' || node.type === 'generator_function')
}

/** ทุกชื่อที่ถูก bind ใน pattern (รวม destructuring ซ้อน) */
function patternNames(node: Node, out: Node[]): void {
  if (node.type === 'identifier' || node.type === 'shorthand_property_identifier_pattern') {
    out.push(node)
    return
  }
  if (node.type === 'pair_pattern') {
    const value = node.childForFieldName('value')
    if (value !== null) patternNames(value, out)
    return
  }
  if (node.type === 'object_pattern' || node.type === 'array_pattern' || node.type === 'rest_pattern' || node.type === 'object_assignment_pattern' || node.type === 'assignment_pattern') {
    for (const child of node.namedChildren) {
      if (child !== null) patternNames(child, out)
    }
  }
}

/**
 * node ที่เปิด scope ใหม่ให้ชื่อที่ประกาศข้างใน — resolve ใช้ช่วงบรรทัดของ scope ตัดสินว่า
 * def ตัวไหน "มองเห็นได้" จากตำแหน่ง cursor (ดู `scopeFrom`/`scopeTo` ใน types.ts)
 *
 * ละเอียดแค่ระดับ function/class พอ: block scope ของ `const` ใน if/for ไม่ได้เพิ่มความถูกต้อง
 * ที่คนอ่านสังเกตได้ แต่ทำให้ตกหล่นง่ายขึ้น — และ "เห็นกว้างไป" ปลอดภัยกว่า "มองไม่เห็น"
 */
const SCOPE_TYPES = new Set([
  'function_declaration',
  'generator_function_declaration',
  'function_expression',
  'generator_function',
  'function',
  'arrow_function',
  'method_definition',
  'class_declaration',
  'abstract_class_declaration',
  'class',
  'class_body',
])

/** ฟังก์ชันทุกทรง — parameter ของมันคือ def ที่มี scope เป็นตัวฟังก์ชันเอง */
const FUNCTION_TYPES = new Set([
  'function_declaration',
  'generator_function_declaration',
  'function_expression',
  'generator_function',
  'function',
  'arrow_function',
  'method_definition',
])

interface Scope {
  from: number
  to: number
}

function scopeOf(node: Node): Scope {
  return { from: node.startPosition.row + 1, to: node.endPosition.row + 1 }
}

function indexFile(filePath: string, text: string): FileIndex {
  const tree = parserFor(filePath).parse(text)
  if (tree === null) throw new Error('tree-sitter parse ไม่คืน tree')

  const definitions: Definition[] = []
  const identifiers: IdentifierOccurrence[] = []
  const imports: ImportBinding[] = []

  const walk = (node: Node, scope: Scope): void => {
    if (IDENTIFIER_TYPES.has(node.type)) {
      identifiers.push({
        name: node.text,
        line: node.startPosition.row + 1,
        col: node.startPosition.column + 1,
        endCol: node.endPosition.column + 1,
      })
    }

    // ชื่อของตัวฟังก์ชัน/คลาสเองอยู่ใน scope ข้างนอก ส่วน parameter อยู่ใน scope ของฟังก์ชันนั้น
    collectDefinition(node, definitions, scope)
    if (FUNCTION_TYPES.has(node.type)) collectParameters(node, definitions, scopeOf(node))
    collectImport(node, imports)

    const inner = SCOPE_TYPES.has(node.type) ? scopeOf(node) : scope
    for (const child of node.namedChildren) {
      if (child !== null) walk(child, inner)
    }
  }
  walk(tree.rootNode, scopeOf(tree.rootNode))

  return { path: filePath, language: languageOf(filePath), definitions, identifiers, imports }
}

/**
 * parameter เป็น definition เต็มตัว — ไม่นับมันแปลว่า F12 บน callback ที่ชื่อชนกับ util
 * จะกระโดดออกนอกไฟล์แบบ `exact` ทั้งที่เป็นคนละตัว (issue #36: ห้ามผิดแบบมั่นใจ)
 */
function collectParameters(fn: Node, out: Definition[], scope: Scope): void {
  const params = fn.childForFieldName('parameters')
  // arrow function ที่มี parameter ตัวเดียวไม่มีวงเล็บ: `x => …` — ชื่ออยู่ที่ field `parameter`
  const bare = fn.childForFieldName('parameter')
  const list = params !== null ? params.namedChildren : bare !== null ? [bare] : []

  for (const param of list) {
    if (param === null) continue
    const target =
      param.type === 'required_parameter' || param.type === 'optional_parameter'
        ? param.childForFieldName('pattern')
        : param
    if (target === null) continue
    const names: Node[] = []
    patternNames(target, names)
    for (const name of names) out.push({ ...defineAt(name, 'variable', param), scopeFrom: scope.from, scopeTo: scope.to })
  }
}

function collectDefinition(node: Node, out: Definition[], scope: Scope): void {
  const found: Definition[] = []
  definitionsOf(node, found)
  for (const def of found) out.push({ ...def, scopeFrom: scope.from, scopeTo: scope.to })
}

function definitionsOf(node: Node, out: Definition[]): void {
  const name = node.childForFieldName('name')

  switch (node.type) {
    case 'function_declaration':
    case 'generator_function_declaration':
    case 'function_signature':
      if (name !== null) out.push(defineAt(name, 'function', statementOf(node)))
      return
    case 'class_declaration':
    case 'abstract_class_declaration':
      if (name !== null) out.push(defineAt(name, 'class', statementOf(node)))
      return
    case 'interface_declaration':
    case 'type_alias_declaration':
    case 'enum_declaration':
    case 'module':
    case 'internal_module':
      // type/interface/namespace ไม่มี kind ของตัวเองใน contract — 'other' คือช่องที่เตรียมไว้
      if (name !== null) out.push(defineAt(name, 'other', statementOf(node)))
      return
    case 'method_definition':
    case 'method_signature':
    case 'abstract_method_signature':
      if (name !== null) out.push(defineAt(name, 'method', node))
      return
    case 'public_field_definition':
    case 'property_signature': {
      if (name === null) return
      const value = node.childForFieldName('value')
      out.push(defineAt(name, isFunctionValue(value) ? 'method' : 'variable', node))
      return
    }
    case 'variable_declarator': {
      if (name === null) return
      const block = statementOf(node)
      if (name.type === 'identifier') {
        out.push(defineAt(name, isFunctionValue(node.childForFieldName('value')) ? 'function' : 'variable', block))
        return
      }
      // destructuring: `const { a, b: c } = …` bind หลายชื่อพร้อมกัน
      const names: Node[] = []
      patternNames(name, names)
      for (const bound of names) out.push(defineAt(bound, 'variable', block))
      return
    }
    default:
      return
  }
}

/**
 * import ทุกทาง: `import`, re-export ที่มี `from`, และ `const x = require('…')`
 *
 * `resolvedPath` เป็น `null` เสมอตรงนี้ — indexFile ต้อง pure ต่อไฟล์เดียวตาม §2.1 จึงไม่รู้จัก
 * รายชื่อไฟล์ทั้ง repo หรือ tsconfig · ผู้เรียก (resolve.ts) เติมให้ผ่าน `ts-imports.ts`
 */
function collectImport(node: Node, out: ImportBinding[]): void {
  const line = node.startPosition.row + 1

  if (node.type === 'lexical_declaration' || node.type === 'variable_declaration') {
    for (const declarator of node.namedChildren) {
      if (declarator === null || declarator.type !== 'variable_declarator') continue
      const source = requireSource(declarator.childForFieldName('value'))
      if (source === null) continue
      const name = declarator.childForFieldName('name')
      if (name === null) continue
      if (name.type === 'identifier') {
        out.push({ localName: name.text, importedName: null, source, resolvedPath: null, line })
        continue
      }
      // `const { a, b: c } = require('m')` — key คือชื่อใน module ต้นทาง, value คือชื่อที่ใช้ในไฟล์นี้
      for (const entry of name.namedChildren) {
        if (entry === null) continue
        if (entry.type === 'shorthand_property_identifier_pattern') {
          out.push({ localName: entry.text, importedName: entry.text, source, resolvedPath: null, line })
          continue
        }
        if (entry.type !== 'pair_pattern') continue
        const key = entry.childForFieldName('key')
        const value = entry.childForFieldName('value')
        if (key === null || value === null || value.type !== 'identifier') continue
        out.push({ localName: value.text, importedName: key.text, source, resolvedPath: null, line })
      }
    }
    return
  }

  if (node.type !== 'import_statement' && node.type !== 'export_statement') return
  const source = stringValue(node.childForFieldName('source'))
  if (source === null) return

  const before = out.length
  for (const child of node.namedChildren) {
    if (child === null) continue
    switch (child.type) {
      case 'namespace_export': {
        // `export * as ns from './x'` — ผูกชื่อ ns กับ module ต้นทางทั้งก้อน (เหมือน namespace import)
        const alias = child.namedChildren.find((n) => n !== null && n.type === 'identifier')
        if (alias) out.push({ localName: alias.text, importedName: null, source, resolvedPath: null, line })
        break
      }
      case 'import_clause':
        for (const part of child.namedChildren) {
          if (part === null) continue
          if (part.type === 'identifier') {
            // default import — ชื่อจริงใน module ต้นทางไม่ใช่ชื่อนี้ จึงเป็น null ตาม §2.2
            out.push({ localName: part.text, importedName: null, source, resolvedPath: null, line })
          } else if (part.type === 'namespace_import') {
            const alias = part.namedChildren.find((n) => n !== null && n.type === 'identifier')
            if (alias) out.push({ localName: alias.text, importedName: null, source, resolvedPath: null, line })
          } else if (part.type === 'named_imports') {
            collectSpecifiers(part, source, line, out)
          }
        }
        break
      case 'named_imports':
        collectSpecifiers(child, source, line, out)
        break
      case 'export_clause':
        // re-export (`export { a as b } from './x'`) ผูกชื่อกับ module ต้นทางเหมือนกัน —
        // เก็บไว้ให้ชั้นความมั่นใจของ references มองเห็นไฟล์ที่ส่งต่อ symbol
        collectSpecifiers(child, source, line, out)
        break
      default:
        break
    }
  }

  // `export * from './x'` — grammar ไม่มี clause ให้เกาะ (ตัว `*` เป็น token นิรนาม) จึงเหลือ
  // export_statement ที่มี source แต่ไม่ผูกชื่อใดเลย · เก็บเป็น binding "ทั้ง module"
  // (localName '*' sentinel เดียวกับ `from m import *` ของ Python) ให้ resolve/importsFrom
  // ไล่ตามเข้าไปหาชื่อในไฟล์ต้นทางได้ — barrel แบบ star คือ pattern ที่พบบ่อยที่สุดของ frontend
  if (node.type === 'export_statement' && out.length === before) {
    out.push({ localName: '*', importedName: null, source, resolvedPath: null, line })
  }
}

function collectSpecifiers(clause: Node, source: string, line: number, out: ImportBinding[]): void {
  for (const spec of clause.namedChildren) {
    if (spec === null) continue
    if (spec.type !== 'import_specifier' && spec.type !== 'export_specifier') continue
    const name = spec.childForFieldName('name')
    if (name === null) continue
    const alias = spec.childForFieldName('alias')
    out.push({
      localName: (alias ?? name).text,
      importedName: name.text,
      source,
      resolvedPath: null,
      line,
    })
  }
}

/** `require('mod')` → specifier · อย่างอื่น (รวม dynamic import ที่ไม่ใช่ literal) = null */
function requireSource(value: Node | null): string | null {
  if (value === null || value.type !== 'call_expression') return null
  const callee = value.childForFieldName('function')
  if (callee === null || callee.text !== 'require') return null
  const args = value.childForFieldName('arguments')
  const first = args?.namedChildren[0] ?? null
  return first !== null && first.type === 'string' ? stringValue(first) : null
}

/**
 * identifier ใต้ cursor — ลองตำแหน่ง cursor ก่อน ถ้าไม่โดนค่อยถอยหนึ่งตัวอักษร
 * (cursor ที่ "ท้ายคำ" พอดีเป็นเคสปกติของ editor: `loadRun|` ต้องได้ loadRun)
 */
function symbolAt(text: string, line: number, col: number): SymbolHit | null {
  if (tsParser === null || tsxParser === null) {
    throw new Error('เรียก symbolAt ก่อน init() — grammar ยังไม่ถูกโหลด')
  }
  // ไม่รู้ path ตรงนี้ (ตาม interface §2.1) จึงเดา: tsx อ่านได้ทั้ง JSX และ TS ส่วนใหญ่
  // ถ้ามันสะดุด (เช่น type assertion `<T>x` ที่มีแต่ใน .ts ล้วน) ค่อยลอง grammar typescript
  let tree = tsxParser.parse(text)
  if (tree === null || tree.rootNode.hasError) {
    const fallback = tsParser.parse(text)
    if (fallback !== null && !fallback.rootNode.hasError) tree = fallback
  }
  if (tree === null) return null

  const row = line - 1
  for (const column of [col - 1, col - 2]) {
    if (column < 0) continue
    const node = tree.rootNode.descendantForPosition({ row, column })
    if (node !== null && IDENTIFIER_TYPES.has(node.type)) {
      return {
        name: node.text,
        line: node.startPosition.row + 1,
        col: node.startPosition.column + 1,
        endCol: node.endPosition.column + 1,
      }
    }
  }
  return null
}

export const typescriptIndexer: LanguageIndexer = {
  language: 'typescript',
  extensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs'],
  init(): Promise<void> {
    ready ??= loadParsers()
    return ready
  },
  indexFile,
  symbolAt,
}
