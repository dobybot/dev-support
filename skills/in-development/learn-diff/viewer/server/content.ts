import fs from 'node:fs/promises'
import path from 'node:path'

import { sectionFileName as sectionFile } from '../src/shared/sections'
import type { PageResponse, RunData, RunResponse, RunSummary } from '../src/shared/types'
import { ApiError } from './errors'
import { safeResolve } from './paths'
import { collectWarnings } from './validate'

export const RUN_FILE = 'run.json'

const SECTION_ID_RE = /^[a-z0-9][a-z0-9-]*$/i

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw ApiError.invalidContent(message)
}

function validateRunData(raw: unknown, contentDir: string): RunData {
  const where = path.join(contentDir, RUN_FILE)
  assert(raw && typeof raw === 'object', `${where}: ต้องเป็น JSON object`)
  const data = raw as Partial<RunData>
  assert(data.schemaVersion === 1, `${where}: รองรับเฉพาะ schemaVersion 1`)
  assert(typeof data.id === 'string' && data.id !== '', `${where}: ขาดฟิลด์ "id"`)
  assert(typeof data.title === 'string' && data.title !== '', `${where}: ขาดฟิลด์ "title"`)
  assert(data.pr && typeof data.pr.number === 'number', `${where}: ขาดฟิลด์ "pr.number"`)
  assert(typeof data.commit === 'string' && data.commit !== '', `${where}: ขาดฟิลด์ "commit"`)
  assert(Array.isArray(data.sections) && data.sections.length > 0, `${where}: "sections" ต้องเป็น array ที่ไม่ว่าง`)

  const seen = new Set<string>()
  for (const [i, section] of data.sections.entries()) {
    assert(section && typeof section === 'object', `${where}: sections[${i}] ไม่ใช่ object`)
    assert(
      typeof section.id === 'string' && SECTION_ID_RE.test(section.id),
      `${where}: sections[${i}].id ต้องเป็น [a-z0-9-] และขึ้นต้นด้วยตัวอักษร/ตัวเลข`,
    )
    assert(typeof section.title === 'string' && section.title !== '', `${where}: sections[${i}] ขาด "title"`)
    assert(!seen.has(section.id), `${where}: section id "${section.id}" ซ้ำ`)
    seen.add(section.id)
    const file = sectionFile(section)
    assert(
      !file.includes('/') && !file.includes('\\') && !file.includes('..'),
      `${where}: sections[${i}].file ต้องเป็นชื่อไฟล์ในโฟลเดอร์เดียวกันเท่านั้น`,
    )
  }
  return data as RunData
}

export async function readRunFile(contentDir: string): Promise<RunData> {
  const file = path.join(contentDir, RUN_FILE)
  let rawText: string
  try {
    rawText = await fs.readFile(file, 'utf8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw ApiError.notFound('run_content_missing', `ไม่พบ ${RUN_FILE} ที่ ${contentDir}`)
    }
    throw err
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(rawText)
  } catch (err) {
    throw ApiError.invalidContent(`${file}: JSON ไม่ถูกต้อง — ${(err as Error).message}`)
  }
  return validateRunData(parsed, contentDir)
}

/**
 * เนื้อหาของ section ที่ถูกเขียนแล้ว เรียงตามลำดับใน sections[] — ที่ไม่อยู่ในนี้คือ "ยังไม่เขียน"
 *
 * อ่านทั้งไฟล์ ไม่ใช่แค่ stat เพราะตัว validate ต้องดูเนื้อความอยู่แล้ว (ไดอะแกรม, `:read`, `:file`)
 * หน้าหนึ่งใหญ่ระดับสิบ ๆ KB การอ่านซ้ำจึงถูกกว่าการเปิดสองรอบ
 */
async function readPages(contentDir: string, data: RunData): Promise<Map<string, string>> {
  const results = await Promise.all(
    data.sections.map(async (section): Promise<[string, string] | null> => {
      const file = safeResolve(contentDir, sectionFile(section))
      if (!file) return null
      try {
        return [section.id, await fs.readFile(file, 'utf8')]
      } catch {
        return null
      }
    }),
  )
  return new Map(results.filter((entry): entry is [string, string] => entry !== null))
}

export async function loadRun(run: RunSummary): Promise<RunResponse> {
  const data = await readRunFile(run.contentDir)
  const pages = await readPages(run.contentDir, data)
  return {
    run,
    data,
    written: [...pages.keys()],
    // ตัว validate ล้มไม่ได้ทำให้ทั้ง run เปิดไม่ขึ้น — ของที่อ่านได้ต้องยังอ่านได้
    warnings: await collectWarnings({ run, data, pages }).catch((err: unknown) => [
      {
        code: 'validation_failed',
        message: `ตรวจความสอดคล้องของเนื้อหาไม่สำเร็จ — ${err instanceof Error ? err.message : String(err)}`,
      },
    ]),
  }
}

export async function loadPage(run: RunSummary, sectionId: string): Promise<PageResponse> {
  const data = await readRunFile(run.contentDir)
  const section = data.sections.find((s) => s.id === sectionId)
  if (!section) {
    throw ApiError.notFound('section_not_found', `run "${run.id}" ไม่มี section "${sectionId}"`)
  }
  const file = safeResolve(run.contentDir, sectionFile(section))
  if (!file) {
    throw ApiError.badRequest('path_escape', `ไฟล์ของ section "${sectionId}" หลุดออกนอก content dir`)
  }
  try {
    const markdown = await fs.readFile(file, 'utf8')
    return { runId: run.id, sectionId, markdown }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw ApiError.notFound(
        'section_pending',
        `section "${sectionId}" ประกาศไว้แล้วแต่ยังไม่ถูกเขียน (${sectionFile(section)})`,
      )
    }
    throw err
  }
}
