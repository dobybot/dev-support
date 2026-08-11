import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { createApiHandler } from '../server/api'
import { clearCommentsCache } from '../server/comments'
import { clearDiffCache } from '../server/diff'
import { GhError, clearGhCache, type GhCommand, type GhRunner } from '../server/gh'
import { clearGitCache } from '../server/git'
import { registerRun } from '../server/registry'
import type { CommentCreatedResponse, CommentsResponse } from '../src/shared/types'

/**
 * comment ของ PR ยิงผ่าน HTTP surface เดิม + seam ใหม่จุดเดียวคือ fake gh runner (issue #49)
 *
 * สิ่งที่เทสต์พิสูจน์คือ **ข้อตกลงกับ GitHub**: คำสั่ง gh ที่ถูกเรียกและ payload ที่ส่งไป
 * ไม่ใช่โครงสร้างภายในของ server — fixture จึงเป็น git repo จริง (เพราะการตัดสิน
 * "บรรทัดอยู่ใน diff ไหม" มาจาก git จริง) แต่ปลายทาง GitHub เป็นของปลอมทั้งหมด
 */

const exec = promisify(execFile)

let tmpRoot: string
let repoPath: string
let baseCommit: string
let headCommit: string
let server: http.Server
let baseUrl: string

/** ทุกคำสั่ง gh ที่ถูกเรียกในเทสต์ล่าสุด */
let calls: GhCommand[] = []
/** ให้ gh ล้มเหลวเมื่อ args ตรงกับ pattern (ทดสอบ error ที่ส่งต่อถึงผู้อ่าน) */
let failWhen: { match: RegExp; error: GhError } | null = null

const REVIEW_COMMENT = {
  id: 501,
  user: { login: 'tanin-t' },
  body: 'ตรงนี้เช็ค null ซ้ำหรือเปล่า',
  html_url: 'https://github.com/acme/demo/pull/7#discussion_r501',
  created_at: '2026-08-07T03:00:00Z',
  updated_at: '2026-08-07T03:00:00Z',
  path: 'src/main.py',
  line: 4,
  position: 2,
}

const ISSUE_COMMENT = {
  id: 902,
  user: { login: 'someone-else' },
  body: 'ภาพรวมโอเค',
  html_url: 'https://github.com/acme/demo/pull/7#issuecomment-902',
  created_at: '2026-08-07T04:00:00Z',
  updated_at: '2026-08-07T04:30:00Z',
}

/** gh ปลอม — ตอบเท่าที่ endpoint ต้องใช้ และบันทึกทุกคำสั่งไว้ให้เทสต์ตรวจ */
const fakeGh: GhRunner = (command) => {
  calls.push(command)
  const line = command.args.join(' ')
  if (failWhen && failWhen.match.test(line)) return Promise.reject(failWhen.error)

  if (line === 'auth status') return Promise.resolve({ stdout: 'Logged in to github.com as tanin-t' })
  if (line.startsWith('api user')) return Promise.resolve({ stdout: 'tanin-t\n' })
  if (line.startsWith('repo view')) return Promise.resolve({ stdout: 'acme/from-gh\n' })

  if (line.includes('--method POST') && line.includes('pulls/')) {
    return Promise.resolve({ stdout: JSON.stringify({ ...REVIEW_COMMENT, id: 777 }) })
  }
  if (line.includes('--method POST') && line.includes('issues/')) {
    return Promise.resolve({
      stdout: JSON.stringify({ ...ISSUE_COMMENT, id: 888, body: JSON.parse(command.input ?? '{}').body }),
    })
  }
  if (line.includes('--method PATCH')) {
    return Promise.resolve({
      stdout: JSON.stringify({ ...ISSUE_COMMENT, body: JSON.parse(command.input ?? '{}').body }),
    })
  }
  if (line.includes('--method DELETE')) return Promise.resolve({ stdout: '' })

  if (line.includes('pulls/7/comments')) return Promise.resolve({ stdout: JSON.stringify([REVIEW_COMMENT]) })
  if (line.includes('issues/7/comments')) return Promise.resolve({ stdout: JSON.stringify([ISSUE_COMMENT]) })
  return Promise.resolve({ stdout: '[]' })
}

async function git(...args: string[]): Promise<string> {
  const { stdout } = await exec('git', ['-C', repoPath, ...args])
  return stdout.trim()
}

async function write(rel: string, body: string): Promise<void> {
  const target = path.join(repoPath, rel)
  await fs.mkdir(path.dirname(target), { recursive: true })
  await fs.writeFile(target, body, 'utf8')
}

async function send(
  method: string,
  url: string,
  body?: unknown,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(`${baseUrl}${url}`, {
    method,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  return { status: res.status, body: text === '' ? {} : (JSON.parse(text) as Record<string, unknown>) }
}

/** ยิงดิบ ๆ โดยคุม header เอง — ใช้จำลอง request ที่มาจากเว็บอื่น (CSRF) */
async function sendRaw(
  method: string,
  url: string,
  headers: Record<string, string>,
  body?: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(`${baseUrl}${url}`, { method, headers, body })
  const text = await res.text()
  return { status: res.status, body: text === '' ? {} : (JSON.parse(text) as Record<string, unknown>) }
}

/** คำสั่ง gh ล่าสุดที่ args ตรงกับ pattern */
function lastCall(match: RegExp): GhCommand {
  const hit = [...calls].reverse().find((call) => match.test(call.args.join(' ')))
  if (!hit) throw new Error(`ไม่มีคำสั่ง gh ที่ตรงกับ ${match} (มีแต่: ${calls.map((c) => c.args.join(' ')).join(' | ')})`)
  return hit
}

function errorOf(body: Record<string, unknown>): { code: string; message: string } {
  return body.error as { code: string; message: string }
}

beforeAll(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'learn-diff-comments-'))
  process.env.LEARN_DIFF_HOME = path.join(tmpRoot, 'home')
  repoPath = path.join(tmpRoot, 'repo')
  await fs.mkdir(repoPath, { recursive: true })

  await git('init', '-q', '-b', 'main')
  await git('config', 'user.email', 'test@example.com')
  await git('config', 'user.name', 'learn-diff test')
  await git('config', 'commit.gpgsign', 'false')

  // บรรทัด 1-3 ไม่ถูกแตะ · PR เพิ่มบรรทัดที่ 4 เข้าไป
  await write('src/main.py', ['def handle(order):', '    if not order.paid:', '        return None', ''].join('\n'))
  await git('add', '-A')
  await git('commit', '-qm', 'base')
  baseCommit = await git('rev-parse', 'HEAD')

  await write(
    'src/main.py',
    ['def handle(order):', '    if not order.paid:', '        return None', '    return send(order)', ''].join('\n'),
  )
  await git('add', '-A')
  await git('commit', '-qm', 'head')
  headCommit = await git('rev-parse', 'HEAD')

  const contentDir = path.join(repoPath, '.learn-diff', 'pr-7-comments')
  await fs.mkdir(contentDir, { recursive: true })
  await fs.writeFile(
    path.join(contentDir, 'run.json'),
    JSON.stringify({
      schemaVersion: 1,
      id: 'pr-7-comments',
      title: 'fixture',
      pr: { number: 7, title: 'comments', url: 'https://github.com/acme/demo/pull/7' },
      commit: headCommit,
      baseCommit,
      generatedAt: '2026-08-07T09:00:00+07:00',
      sections: [{ id: 'index', title: 'ภาพรวม', kind: 'index' }],
    }),
    'utf8',
  )
  await registerRun({
    id: 'pr-7-comments',
    repoPath,
    contentDir: path.relative(repoPath, contentDir),
    commit: headCommit,
    baseCommit,
    pr: { number: 7, title: 'comments', url: 'https://github.com/acme/demo/pull/7' },
    title: 'fixture',
    createdAt: '2026-08-07T09:00:00+07:00',
  })

  // run ที่ base ยังไม่มีในเครื่อง (ยังไม่ได้ git fetch) — เทียบ diff ไม่ได้เลย
  await registerRun({
    id: 'pr-7-nobase',
    repoPath,
    contentDir: path.relative(repoPath, contentDir),
    commit: headCommit,
    baseCommit: '0'.repeat(40),
    pr: { number: 7, title: 'comments', url: 'https://github.com/acme/demo/pull/7' },
    title: 'fixture ที่ยังไม่ fetch base',
    createdAt: '2026-08-07T09:00:00+07:00',
  })

  // run ที่ไม่มี pr.url — owner/repo ต้องมาจาก gh เอง
  await registerRun({
    id: 'pr-7-nourl',
    repoPath,
    contentDir: path.relative(repoPath, contentDir),
    commit: headCommit,
    baseCommit,
    pr: { number: 7, title: 'comments' },
    title: 'fixture ไม่มีลิงก์',
    createdAt: '2026-08-07T09:00:00+07:00',
  })

  const handler = createApiHandler({ gh: fakeGh })
  server = http.createServer((req, res) => handler(req, res))
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
  await fs.rm(tmpRoot, { recursive: true, force: true })
})

beforeEach(() => {
  calls = []
  failWhen = null
  clearGhCache()
  clearCommentsCache()
  clearDiffCache()
  clearGitCache()
})

describe('GET /api/runs/:id/comments', () => {
  it('ส่ง comment ที่มีอยู่แล้วของ PR แยกเป็น review (ผูกบรรทัด) กับ issue (ระดับ PR)', async () => {
    const { status, body } = await send('GET', '/api/runs/pr-7-comments/comments')
    expect(status).toBe(200)
    const res = body as unknown as CommentsResponse
    expect(res.prNumber).toBe(7)
    expect(res.commit).toBe(headCommit)
    expect(res.viewer).toBe('tanin-t')
    expect(res.review).toEqual([
      {
        id: 501,
        kind: 'review',
        author: 'tanin-t',
        body: 'ตรงนี้เช็ค null ซ้ำหรือเปล่า',
        url: 'https://github.com/acme/demo/pull/7#discussion_r501',
        createdAt: '2026-08-07T03:00:00Z',
        updatedAt: '2026-08-07T03:00:00Z',
        path: 'src/main.py',
        line: 4,
        outdated: false,
      },
    ])
    expect(res.issue.map((c) => c.id)).toEqual([902])
    expect(res.issue[0].kind).toBe('issue')
  })

  it('อ่านจาก endpoint ของ PR ทั้งสองชุดด้วย owner/repo ที่ parse จาก pr.url', async () => {
    await send('GET', '/api/runs/pr-7-comments/comments')
    expect(lastCall(/pulls\/7\/comments/).args).toEqual([
      'api',
      '--paginate',
      'repos/acme/demo/pulls/7/comments',
    ])
    expect(lastCall(/issues\/7\/comments/).args).toEqual([
      'api',
      '--paginate',
      'repos/acme/demo/issues/7/comments',
    ])
  })

  it('run ที่ไม่มี pr.url ถาม owner/repo จาก gh ใน repo นั้นแทน', async () => {
    const { status } = await send('GET', '/api/runs/pr-7-nourl/comments')
    expect(status).toBe(200)
    expect(lastCall(/repo view/).cwd).toBe(repoPath)
    expect(lastCall(/pulls\/7\/comments/).args.join(' ')).toContain('repos/acme/from-gh/pulls/7/comments')
  })

  it('review comment ที่หลุดจาก diff ปัจจุบันถูกทำเครื่องหมาย outdated ไม่ใช่ซ่อนทิ้ง', async () => {
    failWhen = null
    const original = REVIEW_COMMENT.position
    ;(REVIEW_COMMENT as { position: number | null }).position = null
    try {
      const { body } = await send('GET', '/api/runs/pr-7-comments/comments')
      expect((body as unknown as CommentsResponse).review[0].outdated).toBe(true)
    } finally {
      ;(REVIEW_COMMENT as { position: number | null }).position = original
    }
  })
})

describe('POST /api/runs/:id/comments', () => {
  it('บรรทัดที่อยู่ใน diff กลายเป็น review comment ที่ผูกกับ commit ที่ pin ไว้', async () => {
    const { status, body } = await send('POST', '/api/runs/pr-7-comments/comments', {
      body: 'ทำไมต้องเรียก send ตรงนี้',
      path: 'src/main.py',
      line: 4,
    })
    expect(status).toBe(201)
    const res = body as unknown as CommentCreatedResponse
    expect(res.comment.kind).toBe('review')
    expect(res.fellBackToIssue).toBe(false)

    const call = lastCall(/--method POST/)
    expect(call.args).toEqual([
      'api',
      '--method',
      'POST',
      'repos/acme/demo/pulls/7/comments',
      '--input',
      '-',
    ])
    expect(JSON.parse(call.input ?? '{}')).toEqual({
      body: 'ทำไมต้องเรียก send ตรงนี้',
      commit_id: headCommit,
      path: 'src/main.py',
      line: 4,
      side: 'RIGHT',
    })
  })

  it('บรรทัดนอก diff กลายเป็น comment ระดับ PR ที่มี permalink ของบรรทัดนั้นนำหน้า', async () => {
    const { status, body } = await send('POST', '/api/runs/pr-7-comments/comments', {
      body: 'บรรทัดเดิมนี้ทำอะไร',
      path: 'src/main.py',
      line: 2,
    })
    expect(status).toBe(201)
    const res = body as unknown as CommentCreatedResponse
    expect(res.fellBackToIssue).toBe(true)
    expect(res.comment.kind).toBe('issue')

    const call = lastCall(/--method POST/)
    expect(call.args.join(' ')).toContain('repos/acme/demo/issues/7/comments')
    const sent = JSON.parse(call.input ?? '{}') as { body: string }
    expect(sent.body).toBe(
      `[\`src/main.py:2\`](https://github.com/acme/demo/blob/${headCommit}/src/main.py#L2)\n\nบรรทัดเดิมนี้ทำอะไร`,
    )
  })

  it('บรรทัดนอก diff บอกเหตุผลว่า "อยู่นอก diff" (เทียบ diff ได้จริงถึงจะพูดแบบนี้ได้)', async () => {
    const { body } = await send('POST', '/api/runs/pr-7-comments/comments', {
      body: 'บรรทัดเดิมนี้ทำอะไร',
      path: 'src/main.py',
      line: 2,
    })
    expect((body as unknown as CommentCreatedResponse).fallback).toEqual({
      kind: 'outside-diff',
      reason: null,
    })
  })

  it('เทียบ diff ไม่ได้ (ยังไม่ fetch base) ไม่ถูกเหมาว่า "บรรทัดอยู่นอก diff"', async () => {
    const { status, body } = await send('POST', '/api/runs/pr-7-nobase/comments', {
      body: 'ทำไมต้องเรียก send ตรงนี้',
      path: 'src/main.py',
      // บรรทัดนี้อยู่ใน diff จริง ๆ ถ้าเทียบได้ — ยิ่งต้องไม่ประกาศว่ามันอยู่นอก diff
      line: 4,
    })
    expect(status).toBe(201)
    const res = body as unknown as CommentCreatedResponse
    expect(res.fellBackToIssue).toBe(true)
    expect(res.fallback?.kind).toBe('diff-unavailable')
    // เหตุผลจริงจาก diff API พร้อมวิธีแก้ ไม่ใช่ข้อความที่แต่งขึ้น
    expect(res.fallback?.reason).toContain('git fetch')
    expect(lastCall(/--method POST/).args.join(' ')).toContain('repos/acme/demo/issues/7/comments')
  })

  it('ไม่ระบุบรรทัด = comment ระดับ PR ธรรมดา ไม่มี permalink แถม', async () => {
    const { status } = await send('POST', '/api/runs/pr-7-comments/comments', {
      body: 'คำถามภาพรวม: PR นี้แตะ hot path ไหม',
    })
    expect(status).toBe(201)
    const call = lastCall(/--method POST/)
    expect(call.args.join(' ')).toContain('repos/acme/demo/issues/7/comments')
    expect(JSON.parse(call.input ?? '{}')).toEqual({ body: 'คำถามภาพรวม: PR นี้แตะ hot path ไหม' })
  })

  it('comment ว่างถูกปฏิเสธก่อนถึง GitHub', async () => {
    const { status, body } = await send('POST', '/api/runs/pr-7-comments/comments', { body: '   ' })
    expect(status).toBe(400)
    expect(errorOf(body).code).toBe('empty_comment')
    expect(calls.filter((c) => c.args.includes('--method'))).toEqual([])
  })

  it('ส่ง path มาแต่ไม่ส่ง line (หรือกลับกัน) ถือว่า request พัง', async () => {
    const { status, body } = await send('POST', '/api/runs/pr-7-comments/comments', {
      body: 'x',
      path: 'src/main.py',
    })
    expect(status).toBe(400)
    expect(errorOf(body).code).toBe('bad_target')
  })
})

describe('PATCH / DELETE comment', () => {
  it('แก้ review comment ยิงไปที่ endpoint ของ review comment', async () => {
    const { status } = await send('PATCH', '/api/runs/pr-7-comments/comments/review/501', {
      body: 'แก้คำผิดแล้ว',
    })
    expect(status).toBe(200)
    const call = lastCall(/--method PATCH/)
    expect(call.args).toEqual([
      'api',
      '--method',
      'PATCH',
      'repos/acme/demo/pulls/comments/501',
      '--input',
      '-',
    ])
    expect(JSON.parse(call.input ?? '{}')).toEqual({ body: 'แก้คำผิดแล้ว' })
  })

  it('แก้ comment ระดับ PR ยิงไปที่ endpoint ของ issue comment', async () => {
    await send('PATCH', '/api/runs/pr-7-comments/comments/issue/902', { body: 'เพิ่ม context' })
    expect(lastCall(/--method PATCH/).args.join(' ')).toContain('repos/acme/demo/issues/comments/902')
  })

  it('ลบ comment ยิง DELETE ตาม kind ที่ระบุ', async () => {
    const { status, body } = await send('DELETE', '/api/runs/pr-7-comments/comments/issue/902')
    expect(status).toBe(200)
    expect(body).toMatchObject({ deleted: { kind: 'issue', id: 902 } })
    expect(lastCall(/--method DELETE/).args).toEqual([
      'api',
      '--method',
      'DELETE',
      'repos/acme/demo/issues/comments/902',
    ])
  })

  it('kind/id ที่ไม่ถูกต้องตอบ 400 ไม่ใช่ยิงมั่วไป GitHub', async () => {
    const kind = await send('DELETE', '/api/runs/pr-7-comments/comments/reaction/1')
    expect(kind.status).toBe(400)
    expect(errorOf(kind.body).code).toBe('bad_comment_kind')

    const id = await send('DELETE', '/api/runs/pr-7-comments/comments/issue/abc')
    expect(id.status).toBe(400)
    expect(errorOf(id.body).code).toBe('bad_comment_id')
  })
})

describe('gh ไม่พร้อม / GitHub ปฏิเสธ', () => {
  it('ยังไม่ได้ login → 401 พร้อมคำสั่งที่ต้องรัน (ไม่ใช่ 500 เปล่า ๆ)', async () => {
    failWhen = { match: /^auth status$/, error: new GhError('exit 1', 'You are not logged into any GitHub hosts', 1) }
    const { status, body } = await send('GET', '/api/runs/pr-7-comments/comments')
    expect(status).toBe(401)
    expect(errorOf(body).code).toBe('gh_not_authenticated')
    expect(errorOf(body).message).toContain('gh auth login')
  })

  it('ไม่มี gh ในเครื่อง → บอกวิธีติดตั้ง', async () => {
    failWhen = { match: /^auth status$/, error: new GhError('spawn gh ENOENT', '', 'ENOENT') }
    const { status, body } = await send('GET', '/api/runs/pr-7-comments/comments')
    expect(status).toBe(503)
    expect(errorOf(body).code).toBe('gh_unavailable')
    expect(errorOf(body).message).toContain('gh auth login')
  })

  it('ตรวจ auth สำเร็จแล้วไม่ถามซ้ำทุก request', async () => {
    await send('GET', '/api/runs/pr-7-comments/comments')
    await send('GET', '/api/runs/pr-7-comments/comments')
    expect(calls.filter((c) => c.args.join(' ') === 'auth status')).toHaveLength(1)
  })

  it('GitHub ปฏิเสธ (422) → ส่งข้อความของ GitHub ต่อให้ผู้อ่านเห็น', async () => {
    failWhen = {
      match: /--method POST/,
      error: new GhError('exit 1', 'HTTP 422: Validation Failed (line must be part of the diff)', 1),
    }
    const { status, body } = await send('POST', '/api/runs/pr-7-comments/comments', {
      body: 'ทัก',
      path: 'src/main.py',
      line: 4,
    })
    expect(status).toBe(422)
    expect(errorOf(body).code).toBe('github_rejected')
    expect(errorOf(body).message).toContain('Validation Failed')
  })

  it('comment ที่ถูกลบไปแล้ว (404) แยกออกจาก error อื่น', async () => {
    failWhen = { match: /--method DELETE/, error: new GhError('exit 1', 'gh: Not Found (HTTP 404)', 1) }
    const { status, body } = await send('DELETE', '/api/runs/pr-7-comments/comments/issue/902')
    expect(status).toBe(404)
    expect(errorOf(body).code).toBe('github_not_found')
  })
})

describe('read-only guard ของ API เดิม', () => {
  it('method เขียนบน route อื่นยังถูกปฏิเสธ', async () => {
    for (const [method, url] of [
      ['POST', '/api/runs'],
      ['DELETE', '/api/runs/pr-7-comments'],
      ['PATCH', '/api/runs/pr-7-comments/file?path=src/main.py'],
    ] as const) {
      const res = await send(method, url, { body: 'x' })
      expect(res.status, `${method} ${url}`).toBe(405)
    }
    expect(calls).toEqual([])
  })

  it('method ที่ไม่ได้เปิดให้ (PUT) บน route ของ comment ก็ยังถูกปฏิเสธ', async () => {
    const res = await send('PUT', '/api/runs/pr-7-comments/comments', { body: 'x' })
    expect(res.status).toBe(405)
  })

  it('body ที่ไม่ใช่ JSON ตอบ 400 ไม่ใช่ 500', async () => {
    const res = await fetch(`${baseUrl}/api/runs/pr-7-comments/comments`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'ไม่ใช่ json',
    })
    expect(res.status).toBe(400)
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('bad_json')
  })
})

describe('กันการยิงข้ามเว็บ (CSRF) ใส่ endpoint เขียน', () => {
  /**
   * viewer ผูก 127.0.0.1:5174 เป็นค่าคงที่ และ run id เดาได้ (`pr-<n>-<slug>`) — หน้าเว็บอะไรก็ได้
   * ที่ผู้ใช้เปิดค้างไว้จึงยิงมาที่ endpoint เขียนได้ตรง ๆ ถ้าไม่กัน (CORS ไม่ช่วย: side effect
   * เกิดก่อนที่ browser จะบล็อกการอ่านคำตอบ) · ทุกเคสต้องไม่มีคำสั่ง gh ถูกเรียกเลย
   */
  it('form ข้าม origin (text/plain) ยิงไม่ผ่าน — ไม่มี comment ขึ้น GitHub', async () => {
    const res = await sendRaw(
      'POST',
      '/api/runs/pr-7-comments/comments',
      { 'content-type': 'text/plain;charset=UTF-8', origin: 'https://evil.example' },
      JSON.stringify({ body: 'csrf', path: null, line: null, pad: '=x' }),
    )
    expect(res.status).toBe(403)
    expect(calls).toEqual([])
  })

  it('Sec-Fetch-Site ที่ไม่ใช่ same-origin ถูกปฏิเสธแม้ส่งมาเป็น JSON', async () => {
    const res = await sendRaw(
      'POST',
      '/api/runs/pr-7-comments/comments',
      { 'content-type': 'application/json', 'sec-fetch-site': 'cross-site' },
      JSON.stringify({ body: 'csrf' }),
    )
    expect(res.status).toBe(403)
    expect(errorOf(res.body).code).toBe('cross_site_blocked')
    expect(calls).toEqual([])
  })

  it('Origin ที่ไม่ตรงกับ host ของตัวเองถูกปฏิเสธ (client ที่ไม่ส่ง Sec-Fetch-Site)', async () => {
    const res = await sendRaw(
      'POST',
      '/api/runs/pr-7-comments/comments',
      { 'content-type': 'application/json', origin: 'https://evil.example' },
      JSON.stringify({ body: 'csrf' }),
    )
    expect(res.status).toBe(403)
    expect(calls).toEqual([])
  })

  it('body ที่ไม่ใช่ json ถูกปฏิเสธก่อนอ่าน (415 ไม่ใช่ bad_json)', async () => {
    const res = await sendRaw(
      'DELETE',
      '/api/runs/pr-7-comments/comments/issue/902',
      { 'content-type': 'application/x-www-form-urlencoded' },
      'body=x',
    )
    expect(res.status).toBe(415)
    expect(calls).toEqual([])
  })

  it('request จากหน้า viewer เอง (same-origin) ยังผ่านตามปกติ', async () => {
    const res = await sendRaw(
      'POST',
      '/api/runs/pr-7-comments/comments',
      { 'content-type': 'application/json', origin: baseUrl, 'sec-fetch-site': 'same-origin' },
      JSON.stringify({ body: 'ทักจากหน้า viewer' }),
    )
    expect(res.status).toBe(201)
  })

  it('DELETE ที่ไม่มี body ยังผ่าน (client ของ viewer ไม่ส่ง content-type มาด้วย)', async () => {
    const res = await sendRaw('DELETE', '/api/runs/pr-7-comments/comments/issue/902', {
      'sec-fetch-site': 'same-origin',
    })
    expect(res.status).toBe(200)
  })
})
