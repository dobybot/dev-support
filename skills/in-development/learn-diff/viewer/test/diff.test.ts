import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createApiHandler } from '../server/api'
import { clearCoverageCache, parseChangedRanges } from '../server/coverage'
import { clearDiffCache } from '../server/diff'
import { clearFileCache } from '../server/file'
import { clearGitCache } from '../server/git'
import { registerRun } from '../server/registry'
import {
  buildRows,
  docText,
  readStoredDiffMode,
  splitDocs,
  unifiedDoc,
  writeStoredDiffMode,
  type PreferenceStore,
} from '../src/lib/diff'
import type { ApiErrorBody, CoverageBaseResponse, FileDiffResponse } from '../src/shared/types'

/**
 * diff API ยิงผ่าน HTTP surface เดียวกับที่แอปใช้ (SPEC-v3 → Testing Decisions)
 * fixture เป็น git repo จริงใน temp dir เพราะสิ่งที่ต้องพิสูจน์คือ "เทียบสอง commit ได้ถูก"
 *
 * ส่วนล่างของไฟล์คือตรรกะฝั่งแอป (src/lib/diff.ts) ซึ่งเป็นฟังก์ชันล้วน — การประกอบ hunk
 * กลับเป็นแถวคือจุดที่ผิดแล้วผู้อ่านจะเห็นบรรทัดถูกลงสีผิดบรรทัด จึงต้องมีเทสต์ตรง ๆ
 */

const exec = promisify(execFile)

let tmpRoot: string
let repoPath: string
let baseCommit: string
let headCommit: string
let server: http.Server
let baseUrl: string

const MAIN_BASE = [
  'def handle(order):',
  '    if not order.paid:',
  '        return None',
  '    return send(order)',
  '',
  'def send(order):',
  '    return notify(order)',
  '',
].join('\n')

const MAIN_HEAD = [
  'def handle(order):',
  '    if not order.paid:',
  '        return None',
  '    if not eligible(order):',
  '        return None',
  '    return send(order)',
  '',
  'def send(order, channel="email"):',
  '    return notify(order, channel)',
  '',
].join('\n')

/**
 * ไฟล์ที่มีบรรทัดขึ้นต้นด้วย `++ ` — ใน `git diff -U0` มันออกมาเป็น `+++ ...` หน้าตาเหมือน
 * header ของไฟล์เป๊ะ ๆ · fixture นี้มีไว้ให้ parser ของ coverage พิสูจน์ว่าไม่หลงกิน
 */
const NOTES_BASE = ['a', 'b', 'c', 'd', ''].join('\n')
const NOTES_HEAD = ['a', '++ bullet ที่หน้าตาเหมือน header ของ diff', 'b', 'c', 'd', 'e', ''].join('\n')

async function git(...args: string[]): Promise<string> {
  const { stdout } = await exec('git', ['-C', repoPath, ...args])
  return stdout.trim()
}

async function write(rel: string, body: string): Promise<void> {
  const target = path.join(repoPath, rel)
  await fs.mkdir(path.dirname(target), { recursive: true })
  await fs.writeFile(target, body, 'utf8')
}

async function getDiff(runId: string, filePath: string): Promise<{ status: number; body: unknown }> {
  const query = new URLSearchParams({ path: filePath })
  const res = await fetch(`${baseUrl}/api/runs/${runId}/diff?${query.toString()}`)
  return { status: res.status, body: (await res.json()) as unknown }
}

beforeAll(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'learn-diff-diff-'))
  process.env.LEARN_DIFF_HOME = path.join(tmpRoot, 'home')
  repoPath = path.join(tmpRoot, 'repo')
  await fs.mkdir(repoPath, { recursive: true })

  await git('init', '-q', '-b', 'main')
  await git('config', 'user.email', 'test@example.com')
  await git('config', 'user.name', 'learn-diff test')
  await git('config', 'commit.gpgsign', 'false')
  await git('config', 'core.autocrlf', 'false')

  await write('src/main.py', MAIN_BASE)
  await write('src/gone.py', 'ของเก่าที่ PR นี้ลบทิ้ง\n')
  await write('src/same.py', 'ไฟล์ที่ PR ไม่ได้แตะ\n')
  await write('docs/notes.md', NOTES_BASE)
  await git('add', '-A')
  await git('commit', '-qm', 'base ของ PR')
  baseCommit = await git('rev-parse', 'HEAD')

  await write('src/main.py', MAIN_HEAD)
  await write('src/added.py', 'บรรทัดแรก\nบรรทัดสอง\n')
  await write('docs/notes.md', NOTES_HEAD)
  await fs.rm(path.join(repoPath, 'src/gone.py'))
  await git('add', '-A')
  await git('commit', '-qm', 'head ของ PR')
  headCommit = await git('rev-parse', 'HEAD')

  // working tree ต่างจาก head อีกชั้น — diff ต้องไม่สนใจของที่ยังไม่ commit
  await write('src/main.py', 'ยังไม่ commit\n')

  const contentDir = path.join(repoPath, '.learn-diff', 'pr-10-diff')
  await fs.mkdir(contentDir, { recursive: true })
  await fs.writeFile(
    path.join(contentDir, 'run.json'),
    JSON.stringify({
      schemaVersion: 1,
      id: 'pr-10-diff',
      title: 'fixture',
      pr: { number: 10, title: 'diff' },
      commit: headCommit,
      baseCommit,
      generatedAt: '2026-08-04T09:00:00+07:00',
      sections: [{ id: 'index', title: 'ภาพรวม', kind: 'index' }],
    }),
    'utf8',
  )

  await registerRun({
    id: 'pr-10-diff',
    repoPath,
    contentDir: path.relative(repoPath, contentDir),
    commit: headCommit,
    baseCommit,
    pr: { number: 10, title: 'diff' },
    title: 'fixture',
    createdAt: '2026-08-04T09:00:00+07:00',
  })
  // registry ไม่มี baseCommit — ต้องถอยไปอ่านจาก run.json ให้ได้
  await registerRun({
    id: 'pr-10-fromrunjson',
    repoPath,
    contentDir: path.relative(repoPath, contentDir),
    commit: headCommit,
    pr: { number: 10, title: 'diff' },
    title: 'fixture',
    createdAt: '2026-08-04T09:00:00+07:00',
  })
  // ไม่มี baseCommit ที่ไหนเลย (content dir ว่าง)
  const bareDir = path.join(repoPath, '.learn-diff', 'pr-11-nobase')
  await fs.mkdir(bareDir, { recursive: true })
  await registerRun({
    id: 'pr-11-nobase',
    repoPath,
    contentDir: path.relative(repoPath, bareDir),
    commit: headCommit,
    pr: { number: 11, title: 'ไม่มี base' },
    title: 'fixture',
    createdAt: '2026-08-04T09:00:00+07:00',
  })
  // base ที่ยังไม่ได้ fetch มา
  await registerRun({
    id: 'pr-12-ghostbase',
    repoPath,
    contentDir: path.relative(repoPath, bareDir),
    commit: headCommit,
    baseCommit: '0123456789abcdef0123456789abcdef01234567',
    pr: { number: 12, title: 'base ที่ยังไม่มีในเครื่อง' },
    title: 'fixture',
    createdAt: '2026-08-04T09:00:00+07:00',
  })

  clearDiffCache()
  clearCoverageCache()
  clearFileCache()
  clearGitCache()
  server = http.createServer(createApiHandler())
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
  clearDiffCache()
  clearCoverageCache()
  clearFileCache()
  clearGitCache()
  await new Promise<void>((resolve) => server.close(() => resolve()))
  await fs.rm(tmpRoot, { recursive: true, force: true })
})

describe('diff API', () => {
  it('ไฟล์ที่ถูกแก้: ได้ hunk ทั้งไฟล์พร้อมบรรทัดฝั่งเก่าที่หายไป', async () => {
    const { status, body } = await getDiff('pr-10-diff', 'src/main.py')
    expect(status).toBe(200)
    const diff = body as FileDiffResponse
    expect(diff.status).toBe('modified')
    expect(diff.baseCommit).toBe(baseCommit)
    expect(diff.commit).toBe(headCommit)

    // เพิ่มด่าน eligible 2 บรรทัด (4–5) และเขียนใหม่ 2 บรรทัดท้าย (8–9)
    expect(diff.hunks).toEqual([
      { oldStart: 4, oldLines: [], newStart: 4, newCount: 2 },
      {
        oldStart: 6,
        oldLines: ['def send(order):', '    return notify(order)'],
        newStart: 8,
        newCount: 2,
      },
    ])
    expect(diff.addedLines).toBe(4)
    expect(diff.removedLines).toBe(2)
  })

  it('ไฟล์ใหม่ = added และทุกบรรทัดคือของใหม่', async () => {
    const diff = (await getDiff('pr-10-diff', 'src/added.py')).body as FileDiffResponse
    expect(diff.status).toBe('added')
    expect(diff.hunks).toEqual([{ oldStart: 1, oldLines: [], newStart: 1, newCount: 2 }])
    expect(diff.removedLines).toBe(0)
  })

  it('ไฟล์ที่ถูกลบ = removed พร้อมบรรทัดเดิม', async () => {
    const diff = (await getDiff('pr-10-diff', 'src/gone.py')).body as FileDiffResponse
    expect(diff.status).toBe('removed')
    expect(diff.hunks[0].oldLines).toEqual(['ของเก่าที่ PR นี้ลบทิ้ง'])
    expect(diff.hunks[0].newCount).toBe(0)
  })

  it('ไฟล์ที่ PR ไม่ได้แตะ = unchanged ไม่มี hunk (ช่วง context จึงไม่ถูกลงสี)', async () => {
    const diff = (await getDiff('pr-10-diff', 'src/same.py')).body as FileDiffResponse
    expect(diff.status).toBe('unchanged')
    expect(diff.hunks).toEqual([])
  })

  it('registry ไม่มี baseCommit ก็ยังถอยไปอ่านจาก run.json ได้', async () => {
    const diff = (await getDiff('pr-10-fromrunjson', 'src/main.py')).body as FileDiffResponse
    expect(diff.baseCommit).toBe(baseCommit)
    expect(diff.status).toBe('modified')
  })

  it('ไม่มี baseCommit ที่ไหนเลย = unavailable พร้อมเหตุผล ไม่ใช่ error', async () => {
    const { status, body } = await getDiff('pr-11-nobase', 'src/main.py')
    expect(status).toBe(200)
    const diff = body as FileDiffResponse
    expect(diff.status).toBe('unavailable')
    expect(diff.baseCommit).toBeNull()
    expect(diff.reason).toContain('baseCommit')
  })

  it('base ที่ยังไม่ได้ fetch = unavailable พร้อมวิธีแก้ (โค้ดยังอ่านได้ แค่ไม่มีสี)', async () => {
    const diff = (await getDiff('pr-12-ghostbase', 'src/main.py')).body as FileDiffResponse
    expect(diff.status).toBe('unavailable')
    expect(diff.reason).toContain('git fetch')
  })

  it('path ที่หลุดออกนอก repo ยังถูกปฏิเสธเหมือน file API', async () => {
    const { status, body } = await getDiff('pr-10-diff', '../secret.txt')
    expect(status).toBe(400)
    expect((body as ApiErrorBody).error.code).toBe('path_escape')
  })

  it('ไม่ส่ง path = บอกว่าต้องระบุ', async () => {
    const res = await fetch(`${baseUrl}/api/runs/pr-10-diff/diff`)
    expect(res.status).toBe(400)
    expect(((await res.json()) as ApiErrorBody).error.code).toBe('bad_file_path')
  })
})

/* ── coverage-base API (SPEC-reading-checklist) — commit range เดียวกับ diff API ── */

async function getCoverageBase(runId: string): Promise<{ status: number; body: CoverageBaseResponse }> {
  const res = await fetch(`${baseUrl}/api/runs/${runId}/coverage-base`)
  return { status: res.status, body: (await res.json()) as CoverageBaseResponse }
}

describe('coverage-base API', () => {
  it('รวมช่วงบรรทัดที่เปลี่ยนต่อไฟล์ทั้ง PR — ไฟล์ที่ถูกลบล้วน/ไม่ถูกแตะไม่โผล่', async () => {
    const { status, body } = await getCoverageBase('pr-10-diff')
    expect(status).toBe(200)
    expect(body.baseCommit).toBe(baseCommit)
    expect(body.commit).toBe(headCommit)
    expect(body.files).toEqual([
      // บรรทัด 2 คือบรรทัดที่ขึ้นต้นด้วย `++ ` (ออกมาเป็น `+++ ...`) และบรรทัด 6 คือ hunk ถัดมา
      // ทั้งคู่ต้องอยู่ใต้ไฟล์เดียวกัน — ห้ามมีไฟล์ผีชื่อ "bullet …" โผล่ และ hunk ที่สองห้ามหาย
      { path: 'docs/notes.md', ranges: [{ from: 2, to: 2 }, { from: 6, to: 6 }] },
      // เพิ่มไฟล์ใหม่ทั้งไฟล์ (2 บรรทัด)
      { path: 'src/added.py', ranges: [{ from: 1, to: 2 }] },
      // เพิ่มด่าน eligible (4–5) + เขียนท้ายไฟล์ใหม่ (8–9)
      { path: 'src/main.py', ranges: [{ from: 4, to: 5 }, { from: 8, to: 9 }] },
      // src/gone.py ถูกลบทั้งไฟล์ — coverage ไม่วัดบรรทัดที่ถูกลบ (Out of Scope)
      // src/same.py ไม่ถูกแตะ — ไม่โผล่
    ])
    expect(body.files.map((file) => file.path)).not.toContain('bullet ที่หน้าตาเหมือน header ของ diff')
  })

  it('ไม่มี baseCommit = ตอบ 200 พร้อม baseCommit null + เหตุผล ไม่ใช่ error', async () => {
    const { status, body } = await getCoverageBase('pr-11-nobase')
    expect(status).toBe(200)
    expect(body.baseCommit).toBeNull()
    expect(body.files).toEqual([])
    expect(body.reason).toContain('baseCommit')
  })

  it('base ที่ยังไม่ได้ fetch = baseCommit null พร้อมวิธีแก้', async () => {
    const { body } = await getCoverageBase('pr-12-ghostbase')
    expect(body.baseCommit).toBeNull()
    expect(body.reason).toContain('git fetch')
  })
})

describe('parseChangedRanges — ขอบเขตไฟล์ตัดจาก `diff --git` ไม่ใช่จาก `+++`', () => {
  it('บรรทัดเนื้อหาที่ขึ้นต้นด้วย `++ ` / `-- ` ไม่ถูกอ่านเป็น header ของไฟล์ใหม่', () => {
    // เนื้อหาแบบนี้เกิดจริงกับเอกสาร/fixture ที่ยกตัวอย่าง diff ไว้ข้างใน
    const raw = [
      'diff --git a/docs/x.md b/docs/x.md',
      '--- a/docs/x.md',
      '+++ b/docs/x.md',
      '@@ -1,0 +2,2 @@ a',
      '--- a/ของปลอม.py',
      '+++ b/ของปลอม.py',
      '@@ -3,0 +5 @@ c',
      '+ZZZ',
      '',
    ].join('\n')
    expect(parseChangedRanges(raw)).toEqual([
      { path: 'docs/x.md', ranges: [{ from: 2, to: 3 }, { from: 5, to: 5 }] },
    ])
  })

  it('ไฟล์ที่ถูกลบทั้งไฟล์ (`+++ /dev/null`) ไม่นับ และ hunk ของมันไม่ตกไปอยู่ไฟล์ก่อนหน้า', () => {
    const raw = [
      'diff --git a/keep.py b/keep.py',
      '--- a/keep.py',
      '+++ b/keep.py',
      '@@ -1,0 +2 @@',
      '+new',
      'diff --git a/gone.py b/gone.py',
      'deleted file mode 100644',
      '--- a/gone.py',
      '+++ /dev/null',
      '@@ -1,3 +0,0 @@',
      '-x',
      '-y',
      '-z',
      '',
    ].join('\n')
    expect(parseChangedRanges(raw)).toEqual([{ path: 'keep.py', ranges: [{ from: 2, to: 2 }] }])
  })
})

/* ── ตรรกะฝั่งแอป ───────────────────────────────────────────────────────── */

const HUNKS = [
  { oldStart: 4, oldLines: [], newStart: 4, newCount: 2 },
  { oldStart: 6, oldLines: ['def send(order):', '    return notify(order)'], newStart: 8, newCount: 2 },
]

const HEAD_LINES = MAIN_HEAD.replace(/\n$/, '').split('\n')

describe('ประกอบ hunk เป็นแถว', () => {
  it('ทั้งไฟล์: บรรทัดที่เพิ่มถูกทำเครื่องหมาย และบรรทัดที่ถูกลบแทรกก่อนบรรทัดที่มาแทน', () => {
    const rows = buildRows({ firstLine: 1, lines: HEAD_LINES, totalLines: HEAD_LINES.length, hunks: HUNKS })
    expect(rows.map((row) => row.kind).join(' ')).toBe('same same same add add same same del del add add')
    // เลขบรรทัดฝั่งใหม่ต้องตรงกับ commit เป๊ะ (user story 24)
    expect(rows.filter((row) => row.kind === 'add').map((row) => row.newNumber)).toEqual([4, 5, 8, 9])
    expect(rows.filter((row) => row.kind === 'del').map((row) => row.oldNumber)).toEqual([6, 7])
    expect(rows.find((row) => row.newNumber === 4)?.text).toBe('    if not eligible(order):')
  })

  it('เปิดแค่ช่วงเดียว: เห็นเฉพาะบรรทัดในช่วง และไม่ลากบรรทัดที่ถูกลบจากที่อื่นเข้ามา', () => {
    const from = 4
    const to = 6
    const rows = buildRows({
      firstLine: from,
      lines: HEAD_LINES.slice(from - 1, to),
      totalLines: HEAD_LINES.length,
      hunks: HUNKS,
    })
    expect(rows.map((row) => row.newNumber)).toEqual([4, 5, 6])
    expect(rows.map((row) => row.kind)).toEqual(['add', 'add', 'same'])
    expect(rows.every((row) => row.text !== '')).toBe(true)
  })

  it('บรรทัดที่ยังไม่ถูกแตะจับคู่กับเลขฝั่ง base ได้ถูกต้องหลังผ่าน hunk', () => {
    const rows = buildRows({ firstLine: 1, lines: HEAD_LINES, totalLines: HEAD_LINES.length, hunks: HUNKS })
    // บรรทัด 6 ฝั่งใหม่ = บรรทัด 4 ฝั่ง base (ถูกดันลงมาเพราะ hunk แรกเพิ่ม 2 บรรทัด)
    expect(rows.find((row) => row.newNumber === 6)).toMatchObject({ kind: 'same', oldNumber: 4 })
    expect(rows[rows.length - 1]).toMatchObject({ kind: 'add', newNumber: 9, oldNumber: null })
  })

  it('ไม่มี hunk = ทุกแถวเป็น same (ตัวแสดงตัวเดียวกัน ต่างแค่ไม่ลงสี)', () => {
    const rows = buildRows({ firstLine: 1, lines: ['a', 'b'], totalLines: 2, hunks: [] })
    expect(rows).toEqual([
      { kind: 'same', newNumber: 1, oldNumber: 1, text: 'a' },
      { kind: 'same', newNumber: 2, oldNumber: 2, text: 'b' },
    ])
  })
})

describe('เอกสารของสองโหมด', () => {
  const rows = buildRows({ firstLine: 1, lines: HEAD_LINES, totalLines: HEAD_LINES.length, hunks: HUNKS })

  it('unified: เอกสารเดียว เลข gutter ของแถวที่ถูกลบเป็นเลขฝั่งเก่า', () => {
    const lines = unifiedDoc(rows)
    expect(lines.length).toBe(rows.length)
    expect(docText(lines).split('\n').length).toBe(rows.length)
    const del = lines.filter((line) => line.kind === 'del')
    expect(del.map((line) => line.number)).toEqual([6, 7])
  })

  it('split: สองฝั่งสูงเท่ากันเสมอ และบรรทัดที่ถูกแทนอยู่แถวเดียวกัน', () => {
    const { left, right } = splitDocs(rows)
    expect(left.length).toBe(right.length)
    const changedRow = left.findIndex((line) => line.kind === 'del')
    expect(right[changedRow].kind).toBe('add')
    expect(left[changedRow].text).toBe('def send(order):')
    expect(right[changedRow].text).toBe('def send(order, channel="email"):')
  })

  it('split: ฝั่งที่ไม่มีบรรทัดคู่กันได้ filler ไม่ใช่บรรทัดว่างเปล่า ๆ', () => {
    const { left, right } = splitDocs(rows)
    const addedOnly = right.findIndex((line) => line.number === 4)
    expect(right[addedOnly].kind).toBe('add')
    expect(left[addedOnly]).toEqual({ kind: 'filler', number: null, text: '' })
  })
})

describe('โหมดที่ผู้อ่านเลือกไว้', () => {
  function store(initial: Record<string, string> = {}): PreferenceStore & { values: Record<string, string> } {
    const values = { ...initial }
    return {
      values,
      getItem: (key) => values[key] ?? null,
      setItem: (key, value) => {
        values[key] = value
      },
    }
  }

  it('ค่าเริ่มต้นคือ unified', () => {
    expect(readStoredDiffMode(store())).toBe('unified')
    expect(readStoredDiffMode(null)).toBe('unified')
  })

  it('เลือก side-by-side แล้วอ่านกลับมาได้ (ข้ามไฟล์/ข้าม session)', () => {
    const target = store()
    writeStoredDiffMode(target, 'split')
    expect(readStoredDiffMode(target)).toBe('split')
  })

  it('ค่าที่เสียใน storage ไม่ทำให้พัง — ถอยไปใช้ค่าเริ่มต้น', () => {
    expect(readStoredDiffMode(store({ 'learn-diff:diff-mode': 'ขยะ' }))).toBe('unified')
    const explode: PreferenceStore = {
      getItem: () => {
        throw new Error('โหมดส่วนตัว')
      },
      setItem: () => {
        throw new Error('โหมดส่วนตัว')
      },
    }
    expect(readStoredDiffMode(explode)).toBe('unified')
    expect(() => writeStoredDiffMode(explode, 'split')).not.toThrow()
  })
})

describe('ไฟล์ใหญ่', () => {
  it('กางไฟล์แสนบรรทัดแล้วประกอบแถวเสร็จในระดับมิลลิวินาที', () => {
    const total = 100_000
    const lines = Array.from({ length: total }, (_, i) => `บรรทัดที่ ${i + 1}`)
    const hunks = Array.from({ length: 200 }, (_, i) => ({
      oldStart: i * 500 + 1,
      oldLines: [`เก่า ${i}`],
      newStart: i * 500 + 1,
      newCount: 2,
    }))
    const started = performance.now()
    const rows = buildRows({ firstLine: 1, lines, totalLines: total, hunks })
    const elapsed = performance.now() - started
    expect(rows.length).toBe(total + hunks.length)
    expect(elapsed).toBeLessThan(500)
  })

  it('เปิดช่วงสั้นในไฟล์ใหญ่ไม่จ่ายค่าทั้งไฟล์', () => {
    const total = 200_000
    const rows = buildRows({
      firstLine: 199_990,
      lines: Array.from({ length: 11 }, (_, i) => `ท้ายไฟล์ ${i}`),
      totalLines: total,
      hunks: [{ oldStart: 5, oldLines: ['เก่า'], newStart: 5, newCount: 1 }],
    })
    expect(rows.length).toBe(11)
    expect(rows[0].newNumber).toBe(199_990)
  })
})
