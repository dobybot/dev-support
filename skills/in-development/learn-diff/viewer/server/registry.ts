import fs from 'node:fs/promises'
import path from 'node:path'

import type { RegistryEntry, RunSummary } from '../src/shared/types'
import { ApiError } from './errors'
import { registryPath } from './paths'

interface RegistryFile {
  schemaVersion: 1
  runs: RegistryEntry[]
}

const RUN_ID_RE = /^[a-z0-9][a-z0-9._-]*$/i

export function isValidRunId(id: string): boolean {
  return RUN_ID_RE.test(id) && !id.includes('..')
}

async function readJson(file: string): Promise<unknown | null> {
  let raw: string
  try {
    raw = await fs.readFile(file, 'utf8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw err
  }
  try {
    return JSON.parse(raw) as unknown
  } catch {
    throw ApiError.invalidContent(`registry อ่านไม่ออก (JSON ไม่ถูกต้อง): ${file}`)
  }
}

function toSummary(entry: RegistryEntry): RunSummary {
  // contentDir เขียนแบบ relative กับ repoPath ได้ เพื่อให้ registry ย้ายเครื่องแล้วยังพอแก้ได้ทีเดียว
  const repoPath = path.resolve(entry.repoPath)
  const contentDir = path.resolve(repoPath, entry.contentDir)
  return { ...entry, repoPath, contentDir }
}

function validateEntry(entry: unknown, index: number): RegistryEntry {
  const e = entry as Partial<RegistryEntry> | null
  if (!e || typeof e !== 'object') {
    throw ApiError.invalidContent(`registry: รายการที่ ${index} ไม่ใช่ object`)
  }
  for (const key of ['id', 'repoPath', 'contentDir'] as const) {
    if (typeof e[key] !== 'string' || e[key] === '') {
      throw ApiError.invalidContent(`registry: รายการที่ ${index} ขาดฟิลด์ "${key}"`)
    }
  }
  if (!isValidRunId(e.id as string)) {
    throw ApiError.invalidContent(`registry: run id "${e.id}" ใช้อักขระที่ไม่อนุญาต`)
  }
  return e as RegistryEntry
}

/** อ่าน registry ทั้งไฟล์ — ไม่มีไฟล์ = ยังไม่เคยมี run เลย ไม่ใช่ error */
export async function readRegistry(): Promise<RunSummary[]> {
  const file = registryPath()
  const parsed = (await readJson(file)) as RegistryFile | null
  if (parsed === null) return []
  if (!Array.isArray(parsed.runs)) {
    throw ApiError.invalidContent(`registry: ต้องมีฟิลด์ "runs" เป็น array (${file})`)
  }
  return parsed.runs.map((entry, i) => toSummary(validateEntry(entry, i)))
}

/** content dir ของ run นี้ยังอยู่จริงไหม (worktree ถูกลบ / repo ถูกย้าย = registry ค้าง) */
async function isAvailable(run: RunSummary): Promise<boolean> {
  try {
    await fs.access(path.join(run.contentDir, 'run.json'))
    return true
  } catch {
    return false
  }
}

/**
 * run ทั้งหมดข้ามทุก repo — ใหม่สุดขึ้นก่อน (หน้าแรกใช้ลำดับนี้)
 *
 * เติม `available` ให้ด้วย เพราะ registry เป็นไฟล์ที่ไม่มีใครมาเก็บกวาด: worktree ที่ถูกลบทิ้ง
 * จะยังค้างอยู่ในรายการตลอดไป ผู้อ่านต้องเห็นตั้งแต่ก่อนกดว่าอันไหนเปิดไม่ได้แล้ว
 */
export async function listRuns(): Promise<RunSummary[]> {
  const runs = await readRegistry()
  const sorted = [...runs].sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
  return Promise.all(
    sorted.map(async (run) => ({ ...run, available: await isAvailable(run) })),
  )
}

export async function findRun(id: string): Promise<RunSummary> {
  if (!isValidRunId(id)) {
    throw ApiError.badRequest('bad_run_id', `run id "${id}" ใช้อักขระที่ไม่อนุญาต`)
  }
  const runs = await readRegistry()
  const found = runs.find((run) => run.id === id)
  if (!found) {
    throw ApiError.notFound('run_not_found', `ยังไม่มี run ชื่อ "${id}" ใน registry`)
  }
  return found
}

/**
 * upsert run ลง registry (ใช้โดย scripts/register-run.mjs และเทสต์)
 * เขียนแบบ write-temp-then-rename เพื่อไม่ให้ไฟล์พังถ้าโดนขัดจังหวะ
 */
export async function registerRun(entry: RegistryEntry): Promise<RunSummary[]> {
  if (!isValidRunId(entry.id)) {
    throw ApiError.badRequest('bad_run_id', `run id "${entry.id}" ใช้อักขระที่ไม่อนุญาต`)
  }
  const file = registryPath()
  await fs.mkdir(path.dirname(file), { recursive: true })
  const existing = ((await readJson(file)) as RegistryFile | null) ?? { schemaVersion: 1, runs: [] }
  const runs = Array.isArray(existing.runs) ? existing.runs.filter((r) => r.id !== entry.id) : []
  runs.push(entry)
  const next: RegistryFile = { schemaVersion: 1, runs }
  const tmp = `${file}.tmp`
  await fs.writeFile(tmp, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
  await fs.rename(tmp, file)
  return runs.map(toSummary)
}
