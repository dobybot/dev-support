import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createApiHandler } from '../server/api'
import { clearFileCache } from '../server/file'
import { clearGitCache } from '../server/git'
import { registerRun } from '../server/registry'
import type { ApiErrorBody, FileResponse } from '../src/shared/types'

/**
 * file API ยิงผ่าน HTTP surface เดียวกับที่แอปใช้ (SPEC-v3 → Testing Decisions)
 * fixture คือ git repo จริงใน temp dir — เพราะสิ่งที่ต้องพิสูจน์คือ "อ่านจาก commit ที่ pin ไว้"
 * ไม่ใช่ "อ่านไฟล์บนดิสก์"
 */

const exec = promisify(execFile)

let tmpRoot: string
let repoPath: string
let pinnedCommit: string
let laterCommit: string
let server: http.Server
let baseUrl: string

const MAIN_TS = [
  '// จุดเริ่มของ service',
  "import { config } from './config'",
  '',
  'export function main(): void {',
  '  console.log(config.name)',
  '}',
  '',
].join('\n')

const CRLF_TXT = 'บรรทัดหนึ่ง\r\nบรรทัดสอง\r\nบรรทัดสาม\r\n'

async function git(...args: string[]): Promise<string> {
  const { stdout } = await exec('git', ['-C', repoPath, ...args])
  return stdout.trim()
}

async function write(rel: string, body: string | Buffer): Promise<void> {
  const target = path.join(repoPath, rel)
  await fs.mkdir(path.dirname(target), { recursive: true })
  await fs.writeFile(target, body)
}

async function get(url: string): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${baseUrl}${url}`)
  return { status: res.status, body: (await res.json()) as unknown }
}

/** GET /api/runs/<run>/file พร้อม query — ใช้ URLSearchParams เพื่อให้ path ถูก encode จริง ๆ */
async function getFile(
  runId: string,
  params: Record<string, string>,
): Promise<{ status: number; body: unknown }> {
  return get(`/api/runs/${runId}/file?${new URLSearchParams(params).toString()}`)
}

function errorCode(body: unknown): string {
  return (body as ApiErrorBody).error?.code
}

beforeAll(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'learn-diff-file-'))
  process.env.LEARN_DIFF_HOME = path.join(tmpRoot, 'home')
  repoPath = path.join(tmpRoot, 'repo')
  await fs.mkdir(repoPath, { recursive: true })

  await git('init', '-q', '-b', 'main')
  await git('config', 'user.email', 'test@example.com')
  await git('config', 'user.name', 'learn-diff test')
  await git('config', 'commit.gpgsign', 'false')
  // ปิด autocrlf ใน fixture: เทสต์นี้ตรวจว่า API ส่งไบต์ของ commit มาตรง ๆ
  // ไม่ได้ตรวจว่า git แปลง line ending ตอน commit อย่างไร (ขึ้นกับ config ของเครื่อง)
  await git('config', 'core.autocrlf', 'false')

  await write('src/main.ts', MAIN_TS)
  await write('docs/crlf.txt', CRLF_TXT)
  await write('assets/logo.bin', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01, 0x02, 0x03]))
  await write('empty.txt', '')
  await git('add', '-A')
  await git('commit', '-qm', 'commit ที่ pin ไว้')
  pinnedCommit = await git('rev-parse', 'HEAD')

  // ของที่มาทีหลัง: ไฟล์ใหม่ + การแก้ไฟล์เดิม ต้องไม่โผล่ในสิ่งที่ API ตอบ
  await write('src/added-later.ts', 'export const late = true\n')
  await write('src/main.ts', 'ไฟล์นี้ถูกแก้หลัง commit ที่ pin ไว้\n')
  await git('add', '-A')
  await git('commit', '-qm', 'หลังจากนั้น')
  laterCommit = await git('rev-parse', 'HEAD')

  // และ working tree ก็ต่างจาก commit ล่าสุดอีกชั้น
  await write('src/main.ts', 'ยังไม่ commit\n')

  // ไฟล์ลับ "นอก repo" ที่ path escape ต้องเอื้อมไม่ถึง
  await fs.writeFile(path.join(tmpRoot, 'secret.txt'), 'ห้ามอ่าน\n', 'utf8')

  const contentDir = path.join(repoPath, '.learn-diff', 'pr-9-file')
  await fs.mkdir(contentDir, { recursive: true })
  await registerRun({
    id: 'pr-9-file',
    repoPath,
    contentDir: path.relative(repoPath, contentDir),
    commit: pinnedCommit,
    pr: { number: 9, title: 'file api' },
    title: 'fixture',
    createdAt: '2026-08-04T09:00:00+07:00',
  })
  await registerRun({
    id: 'pr-9-ghost',
    repoPath,
    contentDir: path.relative(repoPath, contentDir),
    commit: '0123456789abcdef0123456789abcdef01234567',
    pr: { number: 10, title: 'commit ที่ไม่มีจริง' },
    title: 'fixture ghost',
    createdAt: '2026-08-04T09:00:00+07:00',
  })

  clearFileCache()
  clearGitCache()
  server = http.createServer(createApiHandler())
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
  clearFileCache()
  clearGitCache()
  await new Promise<void>((resolve) => server.close(() => resolve()))
  await fs.rm(tmpRoot, { recursive: true, force: true })
})

describe('อ่านไฟล์จาก commit ที่ pin ไว้', () => {
  it('ไม่ระบุช่วง = ทั้งไฟล์ และเป็นไบต์ของ commit ไม่ใช่ของ working tree', async () => {
    const { status, body } = await getFile('pr-9-file', { path: 'src/main.ts' })
    expect(status).toBe(200)
    const file = body as FileResponse
    expect(file.text).toBe(MAIN_TS.replace(/\n$/, ''))
    expect(file.from).toBe(1)
    expect(file.to).toBe(6)
    expect(file.totalLines).toBe(6)
    expect(file.commit).toBe(pinnedCommit)
    expect(file.language).toBe('typescript')
    expect(file.bytes).toBe(Buffer.byteLength(MAIN_TS, 'utf8'))
  })

  it('ช่วงบรรทัดคืนเฉพาะบรรทัดนั้นเป๊ะ ๆ', async () => {
    const { body } = await getFile('pr-9-file', { path: 'src/main.ts', from: '4', to: '6' })
    const file = body as FileResponse
    expect(file.text).toBe('export function main(): void {\n  console.log(config.name)\n}')
    expect(file.from).toBe(4)
    expect(file.to).toBe(6)
    expect(file.totalLines).toBe(6)
  })

  it('ระบุแค่ from = บรรทัดเดียว', async () => {
    const { body } = await getFile('pr-9-file', { path: 'src/main.ts', from: '2' })
    expect((body as FileResponse).text).toBe("import { config } from './config'")
    expect((body as FileResponse).to).toBe(2)
  })

  it('รักษา CRLF และตัวอักษรไทยไว้ครบ', async () => {
    const { body } = await getFile('pr-9-file', { path: 'docs/crlf.txt', from: '1', to: '2' })
    const file = body as FileResponse
    // `\r` ท้ายบรรทัดเป็นไบต์จริงในไฟล์ จึงติดมาครบทุกบรรทัดที่ขอ (CodeMirror ยุบเป็น \n ให้เองตอนแสดง)
    expect(file.text).toBe('บรรทัดหนึ่ง\r\nบรรทัดสอง\r')
    expect(file.totalLines).toBe(3)
    expect(file.language).toBeNull()
  })

  it('ไฟล์ที่เพิ่งเพิ่มใน commit ถัดไปยังไม่มีที่ commit ที่ pin ไว้', async () => {
    const { status, body } = await getFile('pr-9-file', { path: 'src/added-later.ts' })
    expect(status).toBe(404)
    expect(errorCode(body)).toBe('file_not_found')
    expect((body as ApiErrorBody).error.message).toContain('added-later.ts')
  })

  it('ไฟล์ที่ไม่เคยมีอยู่เลยก็ตอบแบบเดียวกัน', async () => {
    const { status, body } = await getFile('pr-9-file', { path: 'src/nope.ts' })
    expect(status).toBe(404)
    expect(errorCode(body)).toBe('file_not_found')
  })

  it('commit ที่ไม่มีใน repo บอกว่า commit ไม่มี ไม่ใช่ไฟล์ไม่มี', async () => {
    const { status, body } = await getFile('pr-9-ghost', { path: 'src/main.ts' })
    expect(status).toBe(404)
    expect(errorCode(body)).toBe('commit_not_found')
  })

  it('repoPath ที่ไม่มีอยู่จริงบอกว่าเปิด repo ไม่ได้', async () => {
    await registerRun({
      id: 'pr-9-lostrepo',
      repoPath: path.join(tmpRoot, 'ไม่มีโฟลเดอร์นี้'),
      contentDir: path.join(repoPath, '.learn-diff', 'pr-9-file'),
      commit: pinnedCommit,
      pr: { number: 11, title: 'repo หาย' },
      title: 'fixture lost repo',
      createdAt: '2026-08-04T09:00:00+07:00',
    })
    const { status, body } = await getFile('pr-9-lostrepo', { path: 'src/main.ts' })
    expect(status).toBe(404)
    expect(errorCode(body)).toBe('repo_not_found')
  })

  it('run ที่ไม่มีใน registry ไม่ถูกอ่านไฟล์ให้', async () => {
    const { status, body } = await getFile('pr-999-ไม่มี', { path: 'src/main.ts' })
    expect(status).toBeGreaterThanOrEqual(400)
    expect(['run_not_found', 'bad_run_id']).toContain(errorCode(body))
  })
})

describe('ปฏิเสธ path ที่หลุดออกนอก repo ที่ลงทะเบียนไว้', () => {
  const escapes = [
    '../secret.txt',
    '../../etc/passwd',
    'src/../../secret.txt',
    '/etc/passwd',
    'C:\\Windows\\win.ini',
    '..\\secret.txt',
    './../secret.txt',
  ]

  for (const bad of escapes) {
    it(`ปฏิเสธ "${bad}"`, async () => {
      const { status, body } = await getFile('pr-9-file', { path: bad })
      expect(status).toBe(400)
      expect(errorCode(body)).toBe('path_escape')
      expect(JSON.stringify(body)).not.toContain('ห้ามอ่าน')
    })
  }

  it('percent-encoded ก็ยังโดนปฏิเสธ (query ถูก decode ก่อนตรวจ)', async () => {
    const { status, body } = await get('/api/runs/pr-9-file/file?path=..%2Fsecret.txt')
    expect(status).toBe(400)
    expect(errorCode(body)).toBe('path_escape')
  })

  it('`a/../b` ที่ยังอยู่ใน repo ยังอ่านได้ตามปกติ', async () => {
    const { status, body } = await getFile('pr-9-file', { path: 'docs/../src/main.ts' })
    expect(status).toBe(200)
    expect((body as FileResponse).path).toBe('src/main.ts')
  })

  it('ไม่ส่ง path มาเลย = บอกว่าขาด query ไม่ใช่ 500', async () => {
    const { status, body } = await get('/api/runs/pr-9-file/file')
    expect(status).toBe(400)
    expect(errorCode(body)).toBe('bad_file_path')
  })
})

describe('ช่วงที่ resolve ไม่ได้ต้องเป็น error ที่อ่านรู้เรื่อง', () => {
  it('ช่วงเลยท้ายไฟล์ = error พร้อมบอกจำนวนบรรทัดจริง ไม่ใช่เนื้อหาว่าง', async () => {
    const { status, body } = await getFile('pr-9-file', { path: 'src/main.ts', from: '40', to: '60' })
    expect(status).toBe(404)
    expect(errorCode(body)).toBe('range_not_found')
    expect((body as ApiErrorBody).error.message).toContain('6 บรรทัด')
  })

  it('ช่วงที่เลยท้ายไปบางส่วนก็ไม่ถือว่าใช้ได้', async () => {
    const { status, body } = await getFile('pr-9-file', { path: 'src/main.ts', from: '5', to: '9' })
    expect(status).toBe(404)
    expect(errorCode(body)).toBe('range_not_found')
  })

  it('ไฟล์ว่างบอกว่าว่าง', async () => {
    const { status, body } = await getFile('pr-9-file', { path: 'empty.txt' })
    expect(status).toBe(404)
    expect(errorCode(body)).toBe('range_not_found')
  })

  it('ช่วงกลับหัว / บรรทัด 0 / ค่าที่ไม่ใช่ตัวเลข = bad_range', async () => {
    const reversed = await getFile('pr-9-file', { path: 'src/main.ts', from: '5', to: '2' })
    expect(reversed.status).toBe(400)
    expect(errorCode(reversed.body)).toBe('bad_range')

    const zero = await getFile('pr-9-file', { path: 'src/main.ts', from: '0', to: '2' })
    expect(errorCode(zero.body)).toBe('bad_range')

    const nan = await getFile('pr-9-file', { path: 'src/main.ts', from: 'x', to: '2' })
    expect(errorCode(nan.body)).toBe('bad_range')
  })
})

describe('ของที่เปิดเป็นข้อความไม่ได้', () => {
  it('ไฟล์ binary', async () => {
    const { status, body } = await getFile('pr-9-file', { path: 'assets/logo.bin' })
    expect(status).toBe(422)
    expect(errorCode(body)).toBe('binary_file')
  })

  it('โฟลเดอร์', async () => {
    const { status, body } = await getFile('pr-9-file', { path: 'src' })
    expect(status).toBe(422)
    expect(errorCode(body)).toBe('not_a_file')
  })
})

describe('commit ที่ pin ไว้เป็นตัวตัดสิน ไม่ใช่ HEAD', () => {
  it('HEAD ของ repo ต่างจาก commit ที่ run pin ไว้จริง ๆ', () => {
    expect(laterCommit).not.toBe(pinnedCommit)
  })

  it('เนื้อหาที่ได้คือของ commit ที่ pin ไว้', async () => {
    const { body } = await getFile('pr-9-file', { path: 'src/main.ts', from: '1', to: '1' })
    expect((body as FileResponse).text).toBe('// จุดเริ่มของ service')
  })
})
