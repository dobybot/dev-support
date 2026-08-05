import path from 'node:path'

import { languageForPath } from '../src/shared/languages'
import type { FileResponse, RunSummary } from '../src/shared/types'
import { ApiError } from './errors'
import { MAX_FILE_BYTES, gitShowFile } from './git'
import { isInside } from './paths'

/** path ที่เป็น absolute ของ windows (`C:\…`) — ตรวจแยกเพราะ path.isAbsolute บน macOS มองว่าไม่ absolute */
const WINDOWS_ABSOLUTE_RE = /^[a-zA-Z]:[\\/]/

/**
 * path ที่มาจาก request → path เทียบ root ของ repo แบบ posix
 *
 * ทุก request ถูก resolve เทียบกับ repo ที่ run นี้ลงทะเบียนไว้เท่านั้น
 * server เห็นทุก repo ที่เคยลงทะเบียน run — path ที่หลุดออกนอก root จึงต้องถูกปฏิเสธ ไม่ใช่แค่ "หาไม่เจอ"
 * (SPEC-v3 → Delivery model · user story 48)
 */
export function repoRelativePath(raw: string, repoPath: string): string {
  const trimmed = raw.trim()
  if (trimmed === '') {
    throw ApiError.badRequest('bad_file_path', 'ต้องระบุ query "path" (path เทียบกับ root ของ repo)')
  }
  if (trimmed.includes('\0')) {
    throw ApiError.badRequest('bad_file_path', 'path มีอักขระที่ใช้ไม่ได้')
  }

  const refuse = (): never => {
    throw ApiError.badRequest(
      'path_escape',
      `path "${raw}" หลุดออกนอก repo ของ run นี้ — อ่านได้เฉพาะไฟล์ใต้ ${repoPath}`,
    )
  }

  if (path.posix.isAbsolute(trimmed) || path.win32.isAbsolute(trimmed) || WINDOWS_ABSOLUTE_RE.test(trimmed)) {
    refuse()
  }

  // normalize เพื่อยุบ `./` และ `a/../b` ก่อน แล้วค่อยตรวจว่ายังโผล่ออกนอกไหม
  const normalized = path.posix.normalize(trimmed.replace(/\\/g, '/'))
  if (normalized === '' || normalized === '.' || normalized.startsWith('../') || normalized === '..') {
    refuse()
  }

  // ด่านสุดท้าย: เทียบ path จริงบนดิสก์อีกชั้น (กันเคส separator/normalize ที่หลุดจากด่านบน)
  if (!isInside(repoPath, path.resolve(repoPath, normalized))) refuse()

  return normalized
}

function parseLine(value: string | null, name: string): number | null {
  if (value === null || value.trim() === '') return null
  if (!/^\d+$/.test(value.trim())) {
    throw ApiError.badRequest('bad_range', `"${name}" ต้องเป็นจำนวนเต็ม (ได้ "${value}")`)
  }
  const n = Number(value.trim())
  if (n < 1) {
    throw ApiError.badRequest('bad_range', `"${name}" ต้องเริ่มที่ 1 (บรรทัดนับแบบ 1-based)`)
  }
  return n
}

/**
 * ตัดข้อความเป็นบรรทัดโดยรักษาไบต์เดิม — `\r` ของ CRLF ถูกเก็บไว้ท้ายบรรทัด
 * newline ปิดท้ายไฟล์ไม่นับเป็นบรรทัดใหม่ (ตรงกับที่ editor และ GitHub นับ)
 */
export function splitLines(text: string): string[] {
  if (text === '') return []
  const lines = text.split('\n')
  if (lines[lines.length - 1] === '') lines.pop()
  return lines
}

/** เนื้อไฟล์ที่ commit หนึ่ง ๆ ไม่มีวันเปลี่ยน — cache ได้แบบไม่ต้อง invalidate */
interface CacheEntry {
  lines: string[]
  bytes: number
}
const CACHE_MAX_ENTRIES = 16
const CACHE_MAX_FILE_BYTES = 512 * 1024
const cache = new Map<string, CacheEntry>()

/**
 * จำนวนบรรทัดอย่างเดียว เก็บแยกและไม่จำกัดจำนวน — ตัว validate (./validate.ts) ถามทุกไฟล์
 * ที่ reading list อ้างถึง ทุกครั้งที่โหลด run · ถ้าใช้ cache ก้อนเนื้อไฟล์ร่วมกัน run ที่แตะเกิน
 * 16 ไฟล์จะไล่กันเองออกจนต้องเรียก git ใหม่ทั้งชุดทุกรอบที่ SSE บอกว่ามีไฟล์เปลี่ยน
 */
const lineCounts = new Map<string, number>()

export function clearFileCache(): void {
  cache.clear()
  lineCounts.clear()
}

function cacheKey(repoPath: string, commit: string, relPath: string): string {
  return `${repoPath}\u0000${commit}\u0000${relPath}`
}

async function readFileAtCommit(repoPath: string, commit: string, relPath: string): Promise<CacheEntry> {
  const key = cacheKey(repoPath, commit, relPath)
  const hit = cache.get(key)
  if (hit) return hit

  const buffer = await gitShowFile(repoPath, commit, relPath)
  if (buffer.length > MAX_FILE_BYTES) {
    throw new ApiError(
      422,
      'file_too_large',
      `"${relPath}" ขนาด ${buffer.length} bytes ใหญ่เกินกว่าจะเปิดอ่านในหน้านี้`,
    )
  }
  // ไฟล์ binary เปิดใน editor แล้วไม่ได้อะไร — บอกไปตรง ๆ ดีกว่าโชว์ขยะ
  if (buffer.subarray(0, 8000).includes(0)) {
    throw new ApiError(422, 'binary_file', `"${relPath}" เป็นไฟล์ binary จึงเปิดอ่านเป็นข้อความไม่ได้`)
  }

  const entry: CacheEntry = { lines: splitLines(buffer.toString('utf8')), bytes: buffer.length }
  lineCounts.set(key, entry.lines.length)
  if (buffer.length <= CACHE_MAX_FILE_BYTES) {
    if (cache.size >= CACHE_MAX_ENTRIES) {
      const oldest = cache.keys().next().value
      if (oldest !== undefined) cache.delete(oldest)
    }
    cache.set(key, entry)
  }
  return entry
}

/**
 * จำนวนบรรทัดของไฟล์ที่ commit ที่ pin ไว้ — ตัว validate ใช้ตรวจว่าช่วงที่ agent อ้างถึง
 * ยัง resolve ได้จริงไหม โดยไม่ต้องขนเนื้อไฟล์ทั้งก้อนกลับมา
 * โยน `ApiError` ชุดเดียวกับ file API (file_not_found / commit_not_found / …)
 */
export async function fileLineCount(repoPath: string, commit: string, relPath: string): Promise<number> {
  const cached = lineCounts.get(cacheKey(repoPath, commit, relPath))
  if (cached !== undefined) return cached
  const { lines } = await readFileAtCommit(repoPath, commit, relPath)
  return lines.length
}

export interface FileQuery {
  path: string | null
  from: string | null
  to: string | null
}

/**
 * อ่านไฟล์ (หรือช่วงบรรทัด) จาก commit ที่ run นี้ pin ไว้
 *
 * ช่วงที่ resolve ไม่ได้ต้องเป็น error ที่อ่านรู้เรื่อง ไม่ใช่เนื้อหาว่าง ๆ —
 * ผู้อ่านจะได้รู้ว่าต้องไปบอก agent ให้แก้ (user story 46)
 */
export async function loadFile(run: RunSummary, query: FileQuery): Promise<FileResponse> {
  const repoPath = path.resolve(run.repoPath)
  const relPath = repoRelativePath(query.path ?? '', repoPath)
  const requestedFrom = parseLine(query.from, 'from')
  const requestedTo = parseLine(query.to, 'to')
  if (requestedFrom !== null && requestedTo !== null && requestedTo < requestedFrom) {
    throw ApiError.badRequest('bad_range', `ช่วงบรรทัดกลับหัว: from=${requestedFrom} มากกว่า to=${requestedTo}`)
  }

  const { lines, bytes } = await readFileAtCommit(repoPath, run.commit, relPath)
  const totalLines = lines.length
  const short = run.commit.slice(0, 9)

  if (totalLines === 0) {
    throw ApiError.notFound('range_not_found', `"${relPath}" ที่ commit ${short} เป็นไฟล์ว่าง`)
  }

  const from = requestedFrom ?? 1
  const to = requestedTo ?? (requestedFrom !== null ? requestedFrom : totalLines)
  if (from > totalLines || to > totalLines) {
    throw ApiError.notFound(
      'range_not_found',
      `"${relPath}" ที่ commit ${short} มี ${totalLines} บรรทัด แต่ขอช่วง ${from}–${to}`,
    )
  }

  return {
    runId: run.id,
    commit: run.commit,
    path: relPath,
    from,
    to,
    totalLines,
    bytes,
    language: languageForPath(relPath),
    text: lines.slice(from - 1, to).join('\n'),
  }
}
