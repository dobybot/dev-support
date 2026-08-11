import path from 'node:path'

import type { CoverageBaseFile, CoverageBaseResponse, RunSummary } from '../src/shared/types'
import { resolveBaseCommit } from './diff'
import { ApiError } from './errors'
import { assertCommitExists, gitDiffAll } from './git'

/**
 * coverage-base API (SPEC-reading-checklist → Coverage computation ฝั่ง server):
 * "PR นี้เปลี่ยนบรรทัดไหนบ้างทั้งหมด" — ground truth ที่ฝั่งแอปใช้วัดว่า reading list
 * (และ checkbox ของผู้อ่าน) ครอบคลุมแค่ไหน
 *
 * ใช้ commit range เดียวกับ diff API — ไม่มี git plumbing ใหม่ นอกจาก `git diff -U0`
 * แบบไม่จำกัดไฟล์ (`gitDiffAll`) · server ยังเป็น read-only view over git เหมือนเดิม
 *
 * เทียบไม่ได้ (ไม่มี baseCommit / base ยังไม่ fetch) ตอบ 200 พร้อม `baseCommit: null` + เหตุผล
 * ไม่ใช่ error — แบบเดียวกับ diff API: อ่านต่อได้ แค่ไม่มี coverage
 */

const HUNK_RE = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/

/**
 * ดึง "ช่วงบรรทัดฝั่ง head ที่เปลี่ยน" ต่อไฟล์ จาก unified diff ทั้ง PR
 *
 * - `+++ /dev/null` (ไฟล์ถูกลบทั้งไฟล์) ข้าม — coverage ไม่วัดบรรทัดที่ถูกลบ (Out of Scope)
 * - hunk ที่ `newCount === 0` (ลบล้วน) ข้ามด้วยเหตุผลเดียวกัน
 * - binary ไม่มี hunk อยู่แล้ว จึงหลุดออกไปเอง
 *
 * **ขอบเขตไฟล์ตัดจาก `diff --git` ไม่ใช่จาก `+++`**: ใน `-U0` บรรทัดที่ถูกเพิ่มมี `+` นำหน้า
 * เสมอ บรรทัดเนื้อหาที่ขึ้นต้นด้วย `++ ` (bullet ของ markdown, ตัวอย่าง diff ในเอกสาร/fixture)
 * จึงออกมาเป็น `+++ ...` เหมือน header เป๊ะ · ถ้าเชื่อ `+++` ตรง ๆ ไฟล์ผีจะโผล่เข้า denominator
 * (coverage ไปไม่ถึง 100% ตลอดกาล) และ hunk จริงที่ตามหลังจะถูกโยนไปให้ไฟล์ผีแทน — พังเงียบทั้งคู่
 * · `+++` จึงรับเฉพาะตอนอยู่ใน "หัวของไฟล์" (หลัง `diff --git` ก่อน hunk แรก) เท่านั้น
 */
export function parseChangedRanges(raw: string): CoverageBaseFile[] {
  const files: CoverageBaseFile[] = []
  let current: CoverageBaseFile | null = null
  /** อยู่ในหัวของไฟล์อยู่หรือเปล่า — ในเนื้อ hunk ห้ามตีความ `+++` เป็น header เด็ดขาด */
  let inHeader = false

  for (const line of raw.split('\n')) {
    if (line.startsWith('diff --git ')) {
      current = null
      inHeader = true
      continue
    }
    if (line.startsWith('@@')) {
      // hunk header จริงเท่านั้นที่ขึ้นต้นด้วย `@@` — บรรทัดเนื้อหามี `+`/`-` นำหน้าเสมอใน -U0
      inHeader = false
      if (current === null) continue
      const match = HUNK_RE.exec(line)
      if (!match) continue
      const from = Number(match[1])
      const count = match[2] === undefined ? 1 : Number(match[2])
      if (count > 0) current.ranges.push({ from, to: from + count - 1 })
      continue
    }
    if (inHeader && line.startsWith('+++ ')) {
      let name = line.slice(4)
      // core.quotepath=false แล้ว แต่ path ที่มีอักขระพิเศษบางชุด git ยัง quote — ถอดชั้นนอกพอ
      if (name.startsWith('"') && name.endsWith('"')) name = name.slice(1, -1)
      if (name === '/dev/null') {
        current = null
        continue
      }
      // prefix `b/` มีแน่นอนเพราะ gitDiffAll บังคับ --dst-prefix=b/ (กัน diff.noprefix ใน gitconfig)
      current = { path: name.startsWith('b/') ? name.slice(2) : name, ranges: [] }
      files.push(current)
    }
  }
  return files.filter((file) => file.ranges.length > 0)
}

/**
 * ผลของคู่ (base, head) ไม่มีวันเปลี่ยน — cache แบบไม่ต้อง invalidate เหมือน diff API
 * แต่ต้องมีเพดานเหมือนกัน: server ตัวเดียวเปิดค้างข้ามหลาย run และหนึ่ง entry คือช่วงบรรทัด
 * ที่เปลี่ยนของ PR ทั้ง PR
 */
const CACHE_MAX_ENTRIES = 64
const cache = new Map<string, CoverageBaseFile[]>()

export function clearCoverageCache(): void {
  cache.clear()
}

export async function loadCoverageBase(run: RunSummary): Promise<CoverageBaseResponse> {
  const repoPath = path.resolve(run.repoPath)
  const baseCommit = await resolveBaseCommit(run)
  if (!baseCommit) {
    return {
      runId: run.id,
      commit: run.commit,
      baseCommit: null,
      files: [],
      reason: 'run.json ไม่มี "baseCommit" — เติม sha ของ base (merge-base ของ base branch กับ head) แล้วเปิดใหม่',
    }
  }

  const key = `${repoPath} ${baseCommit} ${run.commit}`
  let files = cache.get(key)
  if (!files) {
    // git ล้มด้วยเหตุใดก็ตาม (base ยังไม่ fetch, repo หาย, diff ใหญ่เกิน maxBuffer) = "วัด coverage
    // ไม่ได้ พร้อมเหตุผล" ไม่ใช่ error — เพราะฝั่งแอปที่ได้ error จะไม่มีอะไรให้แสดงนอกจากความเงียบ
    let raw: string
    try {
      await assertCommitExists(repoPath, baseCommit)
      await assertCommitExists(repoPath, run.commit)
      raw = await gitDiffAll(repoPath, baseCommit, run.commit)
    } catch (err) {
      const message = err instanceof ApiError ? err.message : String(err)
      return { runId: run.id, commit: run.commit, baseCommit: null, files: [], reason: message }
    }
    files = parseChangedRanges(raw)
    if (cache.size >= CACHE_MAX_ENTRIES) {
      const oldest = cache.keys().next().value
      if (oldest !== undefined) cache.delete(oldest)
    }
    cache.set(key, files)
  }

  return { runId: run.id, commit: run.commit, baseCommit, files }
}
