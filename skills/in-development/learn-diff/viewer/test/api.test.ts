import fs from 'node:fs/promises'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import type { AddressInfo } from 'node:net'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createApiHandler } from '../server/api'
import { registerRun } from '../server/registry'
import type { RunData, RunResponse, RunsResponse } from '../src/shared/types'

let tmpRoot: string
let server: http.Server
let baseUrl: string

/** fixture: repo ปลอมหนึ่งอัน + content dir ของ run หนึ่ง run */
async function writeRun(
  repoName: string,
  slug: string,
  data: unknown,
  pages: Record<string, string>,
): Promise<{ repoPath: string; contentDir: string }> {
  const repoPath = path.join(tmpRoot, repoName)
  const contentDir = path.join(repoPath, '.learn-diff', slug)
  await fs.mkdir(contentDir, { recursive: true })
  await fs.writeFile(path.join(contentDir, 'run.json'), JSON.stringify(data, null, 2), 'utf8')
  for (const [file, body] of Object.entries(pages)) {
    await fs.writeFile(path.join(contentDir, file), body, 'utf8')
  }
  return { repoPath, contentDir }
}

function runData(overrides: Partial<RunData> = {}): RunData {
  return {
    schemaVersion: 1,
    id: 'pr-1-demo',
    title: 'เดโม',
    subtitle: '3 ไฟล์ · +40 / −2',
    pr: { number: 1, title: 'demo', url: 'https://github.com/acme/demo/pull/1' },
    commit: '0123456789abcdef0123456789abcdef01234567',
    generatedAt: '2026-08-01T09:00:00+07:00',
    sections: [
      { id: 'index', title: 'ภาพรวม', kind: 'index' },
      { id: '01-core', title: '01 — แกนหลัก', box: 'whitebox' },
      { id: '02-later', title: '02 — ยังไม่เขียน', box: 'greybox' },
      { id: '99-verify', title: '99 — คำถาม', kind: 'verify' },
    ],
    boxMap: [
      { id: 'core', title: '01 — แกนหลัก', box: 'whitebox', reason: 'ตรรกะหลัก', section: '01-core' },
      { id: 'routing', title: 'ต่อสาย routing', box: 'blackbox', reason: 'ลงทะเบียน path' },
    ],
    reconciliation: [
      { status: 'done', ref: 'D1', what: 'ทริกเกอร์ที่กิ่ง validate ไม่ผ่าน', note: 'etax_service.py:213' },
      { status: 'missing', ref: 'US20', what: 'ไม่มีอะไรรองรับ', note: 'พึ่งความจำคน' },
      { status: 'unrequested', what: 'แทรกโค้ดเข้า hot path', note: 'เสี่ยงสูงสุดใน PR' },
    ],
    readingLists: [
      {
        id: 'rl-core',
        title: 'แกนหลัก',
        spans: [{ path: 'src/core.ts', from: 1, to: 20, kind: 'changed', why: 'จุดเริ่ม' }],
      },
    ],
    nodeMap: { core: 'rl-core' },
    ...overrides,
  }
}

async function get(url: string): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${baseUrl}${url}`)
  return { status: res.status, body: (await res.json()) as unknown }
}

function codes(warnings: { code: string }[]): string[] {
  return warnings.map((w) => w.code)
}

beforeAll(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'learn-diff-test-'))
  process.env.LEARN_DIFF_HOME = path.join(tmpRoot, 'home')

  const demo = await writeRun('repo-a', 'pr-1-demo', runData(), {
    'index.md': '# ภาพรวม\n\nเนื้อหาหน้าแรก\n',
    '01-core.md': '# แกนหลัก\n\n:::note\nระวังตรงนี้\n:::\n',
    '99-verify.md': '# คำถาม\n',
  })
  await registerRun({
    id: 'pr-1-demo',
    repoPath: demo.repoPath,
    // relative กับ repoPath — ต้อง resolve ให้เป็น absolute ตอนอ่าน
    contentDir: path.join('.learn-diff', 'pr-1-demo'),
    commit: '0123456789abcdef0123456789abcdef01234567',
    pr: { number: 1, title: 'demo', url: 'https://github.com/acme/demo/pull/1' },
    title: 'เดโม',
    createdAt: '2026-08-01T09:00:00+07:00',
  })

  const older = await writeRun('repo-b', 'pr-9-old', runData({ id: 'pr-9-old', title: 'ของเก่า' }), {
    'index.md': '# เก่า\n',
  })
  await registerRun({
    id: 'pr-9-old',
    repoPath: older.repoPath,
    contentDir: older.contentDir,
    commit: 'aaaabbbbccccddddeeeeffff0000111122223333',
    pr: { number: 9, title: 'old' },
    title: 'ของเก่า',
    createdAt: '2026-07-01T09:00:00+07:00',
  })

  const broken = await writeRun(
    'repo-c',
    'pr-2-broken',
    // ครบทุกอย่างยกเว้น sections — ตัว validate ต้องชี้ตรงจุดที่ขาด
    { schemaVersion: 1, id: 'pr-2-broken', title: 'พัง', pr: { number: 2, title: 'broken' }, commit: 'deadbeef', generatedAt: '2026-07-02T09:00:00+07:00' },
    {},
  )
  await registerRun({
    id: 'pr-2-broken',
    repoPath: broken.repoPath,
    contentDir: broken.contentDir,
    commit: 'deadbeef',
    pr: { number: 2, title: 'broken' },
    title: 'พัง',
    createdAt: '2026-07-02T09:00:00+07:00',
  })

  const escaping = await writeRun(
    'repo-d',
    'pr-3-escape',
    runData({
      id: 'pr-3-escape',
      sections: [{ id: 'index', title: 'ภาพรวม', file: '../../../../etc/hosts' }],
      boxMap: [],
      reconciliation: [],
    }),
    {},
  )
  await registerRun({
    id: 'pr-3-escape',
    repoPath: escaping.repoPath,
    contentDir: escaping.contentDir,
    commit: 'deadbeef',
    pr: { number: 3, title: 'escape' },
    title: 'หลุด',
    createdAt: '2026-07-03T09:00:00+07:00',
  })

  const stale = await writeRun(
    'repo-e',
    'pr-4-warn',
    runData({
      id: 'pr-4-warn',
      sections: [{ id: 'index', title: 'ภาพรวม', kind: 'index' }],
      boxMap: [{ id: 'x', title: 'แถวเสีย', box: 'whitebox', reason: 'ทดสอบ', section: 'ไม่มีจริง' }],
    }),
    { 'index.md': '# หน้าเดียว\n' },
  )
  await registerRun({
    id: 'pr-4-warn',
    repoPath: stale.repoPath,
    contentDir: stale.contentDir,
    commit: 'deadbeef',
    pr: { number: 4, title: 'warn' },
    title: 'มี warning',
    createdAt: '2026-07-04T09:00:00+07:00',
  })

  const handler = createApiHandler()
  server = http.createServer((req, res) => handler(req, res))
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
  await fs.rm(tmpRoot, { recursive: true, force: true })
})

describe('GET /api/health', () => {
  it('บอกว่า server ตัวไหนกำลังรันและใช้ registry ไฟล์ไหน', async () => {
    const { status, body } = await get('/api/health')
    expect(status).toBe(200)
    expect(body).toMatchObject({ ok: true, service: 'learn-diff-viewer', schemaVersion: 1 })
    expect((body as { registry: string }).registry).toBe(
      path.join(tmpRoot, 'home', 'runs.json'),
    )
  })
})

describe('run registry', () => {
  it('list run ข้าม repo โดยเรียงใหม่สุดขึ้นก่อน', async () => {
    const { status, body } = await get('/api/runs')
    expect(status).toBe(200)
    const { runs } = body as RunsResponse
    expect(runs.map((r) => r.id)).toEqual([
      'pr-1-demo',
      'pr-4-warn',
      'pr-3-escape',
      'pr-2-broken',
      'pr-9-old',
    ])
    const repos = new Set(runs.map((r) => r.repoPath))
    expect(repos.size).toBe(5)
  })

  it('resolve contentDir แบบ relative ให้เป็น absolute เทียบกับ repoPath', async () => {
    const { body } = await get('/api/runs')
    const demo = (body as RunsResponse).runs.find((r) => r.id === 'pr-1-demo')
    expect(demo?.contentDir).toBe(path.join(tmpRoot, 'repo-a', '.learn-diff', 'pr-1-demo'))
  })

  it('run id ที่ไม่มีใน registry ตอบ 404 ไม่ใช่ 500', async () => {
    const { status, body } = await get('/api/runs/pr-999-nope')
    expect(status).toBe(404)
    expect(body).toMatchObject({ error: { code: 'run_not_found' } })
  })

  it('ปฏิเสธ run id ที่มีอักขระนอกช่วงที่อนุญาต', async () => {
    const { status, body } = await get(`/api/runs/${encodeURIComponent('../../etc')}`)
    expect(status).toBe(400)
    expect(body).toMatchObject({ error: { code: 'bad_run_id' } })
  })
})

describe('GET /api/runs/:id', () => {
  it('ส่ง structured data ของ run กลับมาครบตาม contract', async () => {
    const { status, body } = await get('/api/runs/pr-1-demo')
    expect(status).toBe(200)
    const res = body as RunResponse
    expect(res.run.id).toBe('pr-1-demo')
    expect(res.data.pr.number).toBe(1)
    expect(res.data.sections.map((s) => s.id)).toEqual(['index', '01-core', '02-later', '99-verify'])
    expect(res.data.reconciliation?.map((r) => r.status)).toEqual(['done', 'missing', 'unrequested'])
    expect(res.data.boxMap?.map((r) => r.box)).toEqual(['whitebox', 'blackbox'])
    expect(res.data.nodeMap).toEqual({ core: 'rl-core' })
  })

  it('แยก section ที่เขียนแล้วออกจาก section ที่ยังไม่ถูกเขียน', async () => {
    const { body } = await get('/api/runs/pr-1-demo')
    expect((body as RunResponse).written).toEqual(['index', '01-core', '99-verify'])
  })

  it('run.json ที่ไม่ครบ contract ตอบ 422 พร้อมบอกว่าขาดอะไร', async () => {
    const { status, body } = await get('/api/runs/pr-2-broken')
    expect(status).toBe(422)
    const err = (body as { error: { code: string; message: string } }).error
    expect(err.code).toBe('invalid_content')
    expect(err.message).toContain('sections')
  })

  it('แถว box map ที่ชี้ section ที่ไม่มีอยู่ กลายเป็น warning ไม่ใช่ error เงียบ ๆ', async () => {
    const { status, body } = await get('/api/runs/pr-4-warn')
    expect(status).toBe(200)
    const { warnings } = body as RunResponse
    // fixture นี้ไม่ใช่ git repo จริง (มีแต่โฟลเดอร์) — ตรวจช่วงบรรทัดไม่ได้จึงเตือนครั้งเดียว
    // ส่วน node id "core" ไม่มีในไดอะแกรมไหนเลยเพราะหน้าที่เขียนไว้ไม่มี mermaid
    // รายละเอียดของ warning แต่ละชนิดอยู่ที่ test/validate.test.ts ซึ่งใช้ git repo จริง
    expect(codes(warnings).sort()).toEqual([
      'box_map_unknown_section',
      'diagram_node_not_found',
      'range_check_unavailable',
    ])
  })
})

describe('GET /api/runs/:id/pages/:sectionId', () => {
  it('ส่ง markdown ของ section กลับมาดิบ ๆ', async () => {
    const { status, body } = await get('/api/runs/pr-1-demo/pages/01-core')
    expect(status).toBe(200)
    expect((body as { markdown: string }).markdown).toContain(':::note')
  })

  it('section ที่ประกาศไว้แต่ยังไม่เขียน ตอบ 404 ที่แยกออกจาก "ไม่มี section นี้"', async () => {
    const pending = await get('/api/runs/pr-1-demo/pages/02-later')
    expect(pending.status).toBe(404)
    expect(pending.body).toMatchObject({ error: { code: 'section_pending' } })

    const unknown = await get('/api/runs/pr-1-demo/pages/03-never')
    expect(unknown.status).toBe(404)
    expect(unknown.body).toMatchObject({ error: { code: 'section_not_found' } })
  })

  it('ไม่ยอมอ่านไฟล์ที่ path หลุดออกนอก content dir', async () => {
    const traversal = await get(
      `/api/runs/pr-1-demo/pages/${encodeURIComponent('../../../../etc/hosts')}`,
    )
    expect(traversal.status).toBe(404)
    expect(traversal.body).toMatchObject({ error: { code: 'section_not_found' } })

    // run.json ที่ประกาศ file ออกนอกโฟลเดอร์ ถูกปัดตกตั้งแต่ตอน validate
    const declared = await get('/api/runs/pr-3-escape/pages/index')
    expect(declared.status).toBe(422)
    expect((declared.body as { error: { message: string } }).error.message).toContain(
      'โฟลเดอร์เดียวกัน',
    )
  })
})

describe('API surface', () => {
  it('endpoint ที่ไม่รู้จักตอบ 404 เป็น JSON', async () => {
    const { status, body } = await get('/api/nope')
    expect(status).toBe(404)
    expect(body).toMatchObject({ error: { code: 'unknown_endpoint' } })
  })

  it('เป็น read-only — method อื่นถูกปฏิเสธ', async () => {
    const res = await fetch(`${baseUrl}/api/runs`, { method: 'POST' })
    expect(res.status).toBe(405)
  })
})
