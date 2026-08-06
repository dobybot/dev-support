/**
 * Type ของ code navigation (go to definition / find references) — CONTRACT-f12 §2.2 และ §3
 *
 * ไฟล์นี้เก็บสองกลุ่มที่ไม่ปนกัน:
 * - **index types** (`FileIndex`, `Definition`, …) server-only — เป็น contract ระหว่าง indexer ต่อภาษา
 *   กับ resolve/endpoint
 * - **wire types** (`DefinitionResponse`, `ReferencesResponse`, …) รูปร่าง JSON ที่ส่งออกทาง API
 *   ฝั่ง client ประกาศ mirror เองใน `src/lib/api.ts` ตาม convention เดิมของ repo (ไม่มีโฟลเดอร์ shared)
 */

// ── index types (server-only) ────────────────────────────────────────────────

export type DefinitionKind = 'function' | 'class' | 'method' | 'variable' | 'import' | 'other'

export interface Definition {
  name: string
  kind: DefinitionKind
  /** ตำแหน่งชื่อ symbol (1-based) */
  line: number
  col: number
  /** ช่วงบรรทัดของ definition ทั้งก้อน (1-based, inclusive) */
  from: number
  to: number
  /**
   * ช่วงบรรทัดของ scope ที่ประกาศชื่อนี้ (function/class/module ที่ห่อมันอยู่) — ไม่ใส่ = ทั้งไฟล์
   *
   * §2.2 เดิมบอกว่า Definition "มี scope path ไว้เฉย ๆ ยังไม่ใช้ resolve" แต่การเลือก local def
   * ด้วยเลขบรรทัดล้วนพาไปผิดแบบมั่นใจ (def ของ class อื่น / ตัวแปรของฟังก์ชันอื่น ชนะ import)
   * — resolve จึงต้องรู้ว่าชื่อนี้ "มองเห็นได้จากตำแหน่ง cursor" ไหม ซึ่งช่วงบรรทัดของ scope
   * ตอบได้พอ โดยไม่ต้องเก็บ path เป็นสตริงให้ผู้บริโภคตีความเอง
   */
  scopeFrom?: number
  scopeTo?: number
}

/** ทุก occurrence ของ identifier ที่ tree-sitter ยืนยันว่าไม่ใช่ string/comment */
export interface IdentifierOccurrence {
  name: string
  line: number
  col: number
  /** exclusive — ไว้ highlight ช่วง identifier */
  endCol: number
}

export interface ImportBinding {
  /** ชื่อที่ใช้ในไฟล์นี้ (หลัง alias) */
  localName: string
  /** ชื่อจริงใน module ต้นทาง (null = namespace/default import) */
  importedName: string | null
  /** specifier ดิบ เช่น './content', '@/lib/api', 'app.models' */
  source: string
  /** repo-relative path ที่ resolver ชี้ได้ (null = external/ไม่รู้) */
  resolvedPath: string | null
  line: number
}

export interface FileIndex {
  path: string
  language: string
  definitions: Definition[]
  identifiers: IdentifierOccurrence[]
  imports: ImportBinding[]
}

/** ตำแหน่งใน index ที่ผูก path มาด้วย — reverse index เก็บแบบนี้เพื่อไม่ต้องวนหาไฟล์ย้อนกลับ */
export type DefinitionAt = Definition & { path: string }
export type OccurrenceAt = IdentifierOccurrence & { path: string }

export interface SkippedFile {
  path: string
  reason: string
}

export interface RepoIndex {
  repoPath: string
  commit: string
  /** key = repo-relative path */
  files: Map<string, FileIndex>
  /** reverse index หา candidate เร็ว */
  defsByName: Map<string, DefinitionAt[]>
  refsByName: Map<string, OccurrenceAt[]>
  /** ไฟล์ที่โดน guard หรือ parse พัง — log แล้วตอน build */
  skipped: SkippedFile[]
  /** บรรทัด context ของไฟล์ใน index (1-based) — คืน '' ถ้าไฟล์/บรรทัดไม่อยู่ใน index */
  contextLine(path: string, line: number): string
  /** เนื้อไฟล์ที่ index ไว้ (ใช้หา identifier ใต้ cursor) — null ถ้าไฟล์ไม่ได้อยู่ใน index */
  sourceOf(path: string): string | null
}

// ── wire types (ส่งออกทาง API) ───────────────────────────────────────────────

export type Confidence = 'confident' | 'unconfirmed'
export type Resolution = 'exact' | 'ambiguous' | 'none'

/** identifier ที่ตัดได้จากตำแหน่ง cursor */
export interface SymbolHit {
  name: string
  line: number
  col: number
  /** exclusive */
  endCol: number
}

export interface SymbolOrigin {
  path: string
  line: number
  col: number
}

export interface DefinitionTarget {
  path: string
  /** ช่วงบรรทัดของ definition ทั้งก้อน (1-based, inclusive) */
  from: number
  to: number
  /** ตำแหน่งชื่อ symbol เป๊ะ ๆ (ไว้วาง cursor/highlight) */
  line: number
  col: number
  kind: DefinitionKind
  context: string
  /** definition เป็น 'confident' เสมอ — มีไว้ให้ shape ตรงกับ references */
  confidence: Confidence
  language: string
}

export interface DefinitionResponse {
  runId: string
  /** pinned commit ที่ index ใช้ */
  commit: string
  symbol: string
  origin: SymbolOrigin
  resolution: Resolution
  /** non-null เฉพาะ resolution = 'exact' */
  resolved: DefinitionTarget | null
  /** ทุก definition ชื่อตรงทั้ง repo — ส่งมาเสมอเพื่อรองรับปุ่ม show all โดยไม่ยิงซ้ำ */
  candidates: DefinitionTarget[]
}

export interface ReferenceHit {
  line: number
  col: number
  /** exclusive */
  endCol: number
  /** บรรทัดเต็ม trim ขวา ไม่ตัดกลาง */
  context: string
  confidence: Confidence
}

export interface ReferenceGroup {
  path: string
  language: string
  /** เรียง line asc */
  refs: ReferenceHit[]
}

export interface ReferencesResponse {
  runId: string
  commit: string
  symbol: string
  origin: SymbolOrigin
  /** def ที่ resolve ได้ — ใช้ตัดสินชั้นความมั่นใจ */
  definition: DefinitionTarget | null
  /** รวมทุกชั้น */
  total: number
  /** เรียง path asc */
  groups: ReferenceGroup[]
}
