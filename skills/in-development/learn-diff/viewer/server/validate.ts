/**
 * ตรวจความสอดคล้องของ content แล้วส่งกลับเป็น `warnings` พร้อมกับ run
 *
 * ทำไมอยู่ฝั่ง server ไม่ใช่ในเบราว์เซอร์ (SPEC-v3 → Reading lists · Testing Decisions):
 * ทั้งสี่ข้อที่ตรวจ — reading list ที่อ้างถึงแต่ไม่มีจริง, นิยามที่ไม่มีใครอ้าง, node id
 * ที่ไม่มีในไดอะแกรม, ช่วงบรรทัดที่ resolve ไม่ได้ที่ commit ที่ pin ไว้ — กลายเป็น assertion
 * ต่อ HTTP response ได้ทันที ไม่ต้องเทสต์ผ่าน DOM · และการตรวจช่วงบรรทัดต้องใช้ git
 * ซึ่งมีแค่ฝั่ง server เท่านั้นที่ทำได้อยู่แล้ว
 *
 * หลักการเดียวที่คุมทั้งไฟล์: **กดแล้วไม่เกิดอะไรคือผลลัพธ์ที่แย่ที่สุด** อะไรที่จะทำให้
 * ผู้อ่านกดแล้วเงียบ ต้องโผล่เป็น warning ตั้งแต่ก่อนกด
 */

import path from 'node:path'

import { parseDiagram } from '../src/lib/diagram/subset'
import type { ContentWarning, RunData, RunSummary } from '../src/shared/types'
import { ApiError } from './errors'
import { fileLineCount, repoRelativePath } from './file'
import { assertCommitExists } from './git'
import { scanPage, type PageScan } from './scan'

/** การอ้างถึง reading list หนึ่งครั้ง พร้อมที่มา (เอาไปบอกผู้อ่านว่าไปแก้ตรงไหน) */
interface ListRef {
  listId: string
  where: string
  /** ประโยคที่บอกว่า "ใครอ้าง" — ใช้ประกอบข้อความ warning */
  by: string
}

/** ช่วงโค้ดหนึ่งช่วงที่ต้อง resolve ได้จริงที่ commit ที่ pin ไว้ */
interface RangeRef {
  path: string
  from: number | null
  to: number | null
  where: string
  by: string
}

export interface ValidateInput {
  run: RunSummary
  data: RunData
  /** section id → markdown ของหน้าที่ถูกเขียนแล้ว (เรียงตาม sections[]) */
  pages: Map<string, string>
}

/** `"61-79"` / `"61"` → ช่วงบรรทัด · อ่านไม่ออก = ถือว่าไม่ได้ระบุ (ตรงกับ parseLineRange ฝั่ง app) */
function parseLines(raw: string | null): { from: number | null; to: number | null } {
  if (!raw) return { from: null, to: null }
  const match = /^\s*(\d+)\s*(?:[-–]\s*(\d+))?\s*$/.exec(raw)
  if (!match) return { from: null, to: null }
  const from = Number(match[1])
  return { from, to: match[2] ? Number(match[2]) : from }
}

function collectListRefs(data: RunData, scans: Map<string, PageScan>): ListRef[] {
  const refs: ListRef[] = []
  for (const section of data.sections) {
    if (section.readingList) {
      refs.push({
        listId: section.readingList,
        where: `sections[${section.id}].readingList`,
        by: `ปุ่ม "อ่านโค้ดของหัวข้อนี้" ของ section "${section.id}"`,
      })
    }
  }
  for (const row of data.boxMap ?? []) {
    if (row.readingList) {
      refs.push({
        listId: row.readingList,
        where: `boxMap[${row.id}].readingList`,
        by: `แถว box map "${row.title}"`,
      })
    }
  }
  for (const [nodeId, listId] of Object.entries(data.nodeMap ?? {})) {
    refs.push({
      listId,
      where: `nodeMap[${nodeId}]`,
      by: `node "${nodeId}" ในไดอะแกรม`,
    })
  }
  for (const [sectionId, scan] of scans) {
    for (const listId of scan.readingLists) {
      refs.push({
        listId,
        where: sectionId,
        by: `\`:read\` ในหน้า "${sectionId}"`,
      })
    }
  }
  return refs
}

function collectRangeRefs(data: RunData, scans: Map<string, PageScan>): RangeRef[] {
  const refs: RangeRef[] = []
  for (const list of data.readingLists ?? []) {
    list.spans.forEach((span, i) => {
      refs.push({
        path: span.path,
        from: span.from,
        to: span.to,
        where: `readingLists[${list.id}].spans[${i}]`,
        by: `ช่วงที่ ${i + 1} ของ reading list "${list.id}"`,
      })
    })
  }
  for (const [sectionId, scan] of scans) {
    for (const ref of scan.files) {
      const { from, to } = parseLines(ref.lines)
      refs.push({
        path: ref.path,
        from,
        to,
        where: sectionId,
        by: `\`:file\` ในหน้า "${sectionId}"`,
      })
    }
  }
  return refs
}

/**
 * ตรวจว่าไฟล์/ช่วงบรรทัดที่อ้างถึง resolve ได้จริงที่ commit ที่ pin ไว้ (user story 46)
 *
 * commit ที่ยังไม่มีในเครื่อง / repo ที่ถูกย้าย ไม่ใช่ "เนื้อหาผิด" — เตือนครั้งเดียวแล้วข้าม
 * ทั้งชุด ไม่ใช่ยิงข้อความเดิมซ้ำทุกช่วง
 */
async function checkRanges(run: RunSummary, refs: RangeRef[]): Promise<ContentWarning[]> {
  if (refs.length === 0) return []
  const repoPath = path.resolve(run.repoPath)
  const warnings: ContentWarning[] = []

  try {
    await assertCommitExists(repoPath, run.commit)
  } catch (err) {
    const message = err instanceof ApiError ? err.message : String(err)
    return [
      {
        code: 'range_check_unavailable',
        message: `ตรวจช่วงบรรทัดที่อ้างถึงไม่ได้ — ${message}`,
        where: `commit ${run.commit.slice(0, 9)}`,
      },
    ]
  }

  // ถาม git ครั้งเดียวต่อไฟล์ (จำนวนบรรทัดที่ commit หนึ่ง ๆ ไม่มีวันเปลี่ยน จึงถูก cache ไว้)
  const byPath = new Map<string, RangeRef[]>()
  for (const ref of refs) {
    const list = byPath.get(ref.path)
    if (list) list.push(ref)
    else byPath.set(ref.path, [ref])
  }

  const results = await Promise.all(
    [...byPath.keys()].map(async (raw) => {
      try {
        const relPath = repoRelativePath(raw, repoPath)
        return { raw, totalLines: await fileLineCount(repoPath, run.commit, relPath), error: null }
      } catch (err) {
        return { raw, totalLines: 0, error: err }
      }
    }),
  )

  for (const result of results) {
    const group = byPath.get(result.raw) ?? []
    if (result.error) {
      const error = result.error
      const code = error instanceof ApiError ? error.code : 'file_unreadable'
      const message = error instanceof ApiError ? error.message : String(error)
      for (const ref of group) {
        warnings.push({ code, message: `${ref.by}: ${message}`, where: ref.where })
      }
      continue
    }
    for (const ref of group) {
      if (ref.from === null) continue
      // run.json มาจากดิสก์ — ตัวเลขที่ไม่ใช่ตัวเลขจริงต้องถูกจับที่นี่ ไม่ใช่ปล่อยไปเทียบกันมั่ว ๆ
      if (!Number.isInteger(ref.from) || ref.from < 1 || (ref.to !== null && !Number.isInteger(ref.to))) {
        warnings.push({
          code: 'bad_range',
          message: `${ref.by}: เลขบรรทัดของ "${ref.path}" ต้องเป็นจำนวนเต็มเริ่มที่ 1 (ได้ ${JSON.stringify(ref.from)}–${JSON.stringify(ref.to)})`,
          where: ref.where,
        })
        continue
      }
      if (ref.to !== null && ref.to < ref.from) {
        warnings.push({
          code: 'bad_range',
          message: `${ref.by}: ช่วงบรรทัดกลับหัว (${ref.from}–${ref.to}) ที่ "${ref.path}"`,
          where: ref.where,
        })
        continue
      }
      const to = ref.to ?? ref.from
      if (to > result.totalLines || ref.from > result.totalLines) {
        warnings.push({
          code: 'range_not_found',
          message: `${ref.by}: "${ref.path}" ที่ commit ${run.commit.slice(0, 9)} มี ${result.totalLines} บรรทัด แต่อ้างถึงช่วง ${ref.from}–${to}`,
          where: ref.where,
        })
      }
    }
  }
  return warnings
}

export async function collectWarnings(input: ValidateInput): Promise<ContentWarning[]> {
  const { run, data, pages } = input
  const warnings: ContentWarning[] = []

  const scans = new Map<string, PageScan>()
  for (const [sectionId, markdown] of pages) scans.set(sectionId, scanPage(markdown))

  // หน้าที่ยังไม่ถูกเขียนอาจถือ `:read` หรือไดอะแกรมที่ยังไม่มีใครเห็น — ระหว่างที่ agent
  // ยังเขียนไม่จบ การเช็คแบบ "ไม่มีใครอ้าง / ไม่มีใน source" จึงยังตัดสินไม่ได้ (SSE = เขียนไปอ่านไป)
  const complete = data.sections.every((section) => pages.has(section.id))

  const sectionIds = new Set(data.sections.map((s) => s.id))
  // key ที่ contract รู้จัก (BoxMapRow ใน shared/types.ts) — key แปลกปลอม (เช่น `what` ที่ agent
  // เดา schema เอง) render ไม่ขึ้นเงียบ ๆ จึงต้องดังตั้งแต่ตอน validate (issue #33)
  const boxMapKeys = new Set(['id', 'title', 'files', 'box', 'reason', 'section', 'readingList'])
  for (const [i, row] of (data.boxMap ?? []).entries()) {
    const where = `boxMap[${typeof row.id === 'string' && row.id ? row.id : i}]`
    if (typeof row.id !== 'string' || row.id === '' || typeof row.title !== 'string' || row.title === '') {
      warnings.push({
        code: 'box_map_row_invalid',
        message: `แถว box map ต้องมี id กับ title เป็น string ไม่ว่าง — ดู schema ใน content-format.md`,
        where,
      })
    }
    const unknown = Object.keys(row).filter((key) => !boxMapKeys.has(key))
    if (unknown.length > 0) {
      warnings.push({
        code: 'box_map_row_invalid',
        message: `แถว box map มี key ที่ contract ไม่รู้จัก: ${unknown.join(', ')} — viewer จะไม่แสดงค่าเหล่านี้`,
        where,
      })
    }
    if (row.section && !sectionIds.has(row.section)) {
      warnings.push({
        code: 'box_map_unknown_section',
        message: `แถว box map "${row.title}" ชี้ไปที่ section "${row.section}" ที่ไม่มีใน sections`,
        where: `boxMap[${row.id}]`,
      })
    }
  }

  /* ── reading list: ที่อ้างถึงต้องมีจริง / ที่มีต้องมีคนอ้าง ─────────────────── */

  const lists = data.readingLists ?? []
  const defined = new Set<string>()
  for (const list of lists) {
    if (defined.has(list.id)) {
      warnings.push({
        code: 'reading_list_duplicate',
        message: `มี reading list id "${list.id}" ซ้ำกันมากกว่าหนึ่งอัน — ตัวหลังจะไม่มีวันถูกเปิด`,
        where: `readingLists[${list.id}]`,
      })
    }
    defined.add(list.id)
    if (list.spans.length === 0) {
      warnings.push({
        code: 'reading_list_empty',
        message: `reading list "${list.id}" ไม่มีช่วงโค้ดเลย — กดแล้ว panel จะว่าง`,
        where: `readingLists[${list.id}]`,
      })
    }
  }

  const refs = collectListRefs(data, scans)
  const referenced = new Set(refs.map((ref) => ref.listId))
  const reportedMissing = new Set<string>()
  for (const ref of refs) {
    if (defined.has(ref.listId)) continue
    const key = `${ref.where}:${ref.listId}`
    if (reportedMissing.has(key)) continue
    reportedMissing.add(key)
    warnings.push({
      code: 'reading_list_not_found',
      message: `${ref.by} ชี้ไปที่ reading list "${ref.listId}" ที่ไม่มีนิยามใน run.json — กดแล้วจะไม่มีโค้ดขึ้น`,
      where: ref.where,
    })
  }

  if (complete) {
    for (const list of lists) {
      if (referenced.has(list.id)) continue
      warnings.push({
        code: 'reading_list_unreferenced',
        message: `reading list "${list.id}" (${list.title}) ไม่มีอะไรอ้างถึงเลย — เขียนไว้แล้วแต่ผู้อ่านเข้าไม่ถึง`,
        where: `readingLists[${list.id}]`,
      })
    }
  }

  /* ── ไดอะแกรม: source ต้องอยู่ใน subset + node id ใน nodeMap ต้องมีจริง ──────── */

  // parse ครั้งเดียวต่อไดอะแกรม แล้วใช้ผลทั้งสองทาง (violations + รายชื่อ node)
  // violation รายงานทันทีไม่รอ complete — หน้าที่เขียนเสร็จแล้วมี syntax หลุด subset
  // คือของจริง ผู้อ่านเห็นแถบแดงบนรูปอยู่แล้ว ฝั่ง API ต้องดังตาม (issue #15)
  // หมายเหตุ: parseDiagram ไม่ throw — source ที่อ่านไม่ออกเลย (บรรทัดแรกผิด / diagram ว่าง)
  // ก็โผล่เป็น violations เหมือนกัน จึงใช้ code เดียวพอ
  const nodes = new Set<string>()
  const subgraphs = new Set<string>()
  for (const [sectionId, scan] of scans) {
    for (const source of scan.diagrams) {
      const parsed = parseDiagram(source)
      for (const node of parsed.nodes) nodes.add(node)
      for (const id of parsed.subgraphs) subgraphs.add(id)
      for (const violation of parsed.violations) {
        warnings.push({
          code: 'diagram_out_of_subset',
          message: violation.message,
          where: `${sectionId}:${violation.line}`,
        })
      }
    }
  }

  const nodeMap = data.nodeMap ?? {}
  if (complete && Object.keys(nodeMap).length > 0) {
    for (const nodeId of Object.keys(nodeMap)) {
      if (nodes.has(nodeId)) continue
      warnings.push({
        code: 'diagram_node_not_found',
        message: subgraphs.has(nodeId)
          ? `nodeMap ชี้ไปที่ "${nodeId}" ซึ่งเป็น subgraph ไม่ใช่ node — กรอบของ subgraph กดไม่ได้ ให้ชี้ที่ node ข้างในแทน`
          : `nodeMap มี node id "${nodeId}" ที่ไม่ปรากฏในไดอะแกรมไหนเลยของ run นี้ — สะกด id ให้ตรงกับใน mermaid`,
        where: `nodeMap[${nodeId}]`,
      })
    }
  }

  /* ── ช่วงบรรทัด: ต้อง resolve ได้ที่ commit ที่ pin ไว้ ────────────────────── */

  warnings.push(...(await checkRanges(run, collectRangeRefs(data, scans))))
  return warnings
}
