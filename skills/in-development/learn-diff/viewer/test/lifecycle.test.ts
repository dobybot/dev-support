import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { AddressInfo } from 'node:net'
import { promisify } from 'node:util'

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { createApiHandler } from '../server/api'
import {
  configuredIdleMs,
  createIdleTimer,
  DEFAULT_IDLE_MS,
  setActiveIdleTimer,
} from '../server/lifecycle'
import { startCommand } from '../server/plugin'
import { registerRun } from '../server/registry'
import type { HealthResponse, RunsResponse } from '../src/shared/types'

const execFileAsync = promisify(execFile)
const SERVE_SCRIPT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'scripts',
  'serve.mjs',
)

let tmpRoot: string
let server: http.Server
let port: number
let baseUrl: string

/** run หนึ่งอันพร้อม content dir จริง — ตัวที่ควรขึ้นว่า available */
async function writeRun(slug: string, createdAt: string): Promise<string> {
  const repoPath = path.join(tmpRoot, slug)
  const contentDir = path.join(repoPath, '.learn-diff', slug)
  await fs.mkdir(contentDir, { recursive: true })
  await fs.writeFile(
    path.join(contentDir, 'run.json'),
    JSON.stringify({
      schemaVersion: 1,
      id: slug,
      title: slug,
      pr: { number: 7, title: slug },
      commit: '0123456789abcdef0123456789abcdef01234567',
      generatedAt: createdAt,
      sections: [{ id: 'index', title: 'ภาพรวม', kind: 'index' }],
    }),
    'utf8',
  )
  await fs.writeFile(path.join(contentDir, 'index.md'), '# ภาพรวม\n', 'utf8')
  await registerRun({
    id: slug,
    repoPath,
    contentDir: path.join('.learn-diff', slug),
    commit: '0123456789abcdef0123456789abcdef01234567',
    pr: { number: 7, title: slug },
    title: slug,
    createdAt,
  })
  return contentDir
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  return (await res.json()) as T
}

/** พอร์ตที่ไม่มีใครฟังแน่ ๆ — จองแล้วปล่อยทันที */
async function freePort(): Promise<number> {
  const probe = http.createServer()
  await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve))
  const value = (probe.address() as AddressInfo).port
  await new Promise<void>((resolve) => probe.close(() => resolve()))
  return value
}

interface ServeResult {
  status: string
  pid?: number
  url?: string
  startCommand?: string
  message?: string
}

/** เรียก scripts/serve.mjs แล้วอ่านผลเป็น JSON บรรทัดเดียว */
async function serve(argv: string[]): Promise<{ code: number; result: ServeResult }> {
  try {
    const { stdout } = await execFileAsync(process.execPath, [SERVE_SCRIPT, '--json', ...argv], {
      env: { ...process.env, LEARN_DIFF_HOME: process.env.LEARN_DIFF_HOME },
    })
    return { code: 0, result: JSON.parse(stdout.trim()) as ServeResult }
  } catch (err) {
    const e = err as { code?: number; stdout?: string; stderr?: string }
    const text = (e.stdout ?? '').trim()
    return { code: e.code ?? 1, result: JSON.parse(text || '{"status":"error"}') as ServeResult }
  }
}

beforeAll(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'learn-diff-life-'))
  process.env.LEARN_DIFF_HOME = path.join(tmpRoot, 'home')

  await writeRun('pr-1-alive', '2026-08-01T09:00:00+07:00')
  // run ที่ content dir หายไปแล้ว (worktree ถูกลบ) — registry ยังค้างอยู่เสมอ
  await registerRun({
    id: 'pr-2-gone',
    repoPath: path.join(tmpRoot, 'ghost'),
    contentDir: path.join(tmpRoot, 'ghost', '.learn-diff', 'pr-2-gone'),
    commit: 'aaaabbbbccccddddeeeeffff0000111122223333',
    pr: { number: 2, title: 'ghost' },
    title: 'run ที่โฟลเดอร์หายไปแล้ว',
    createdAt: '2026-07-01T09:00:00+07:00',
  })

  const handler = createApiHandler()
  server = http.createServer((req, res) => handler(req, res))
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  port = (server.address() as AddressInfo).port
  baseUrl = `http://127.0.0.1:${port}`
})

afterAll(async () => {
  setActiveIdleTimer(null)
  await new Promise<void>((resolve) => server.close(() => resolve()))
  await fs.rm(tmpRoot, { recursive: true, force: true })
})

afterEach(() => {
  setActiveIdleTimer(null)
  vi.useRealTimers()
})

describe('ตัวจับเวลา "ไม่มีใครเรียกแล้ว"', () => {
  it('ปิดตัวเองเมื่อเงียบครบเวลา', () => {
    vi.useFakeTimers()
    const onIdle = vi.fn()
    createIdleTimer({ timeoutMs: 1000, onIdle })
    vi.advanceTimersByTime(999)
    expect(onIdle).not.toHaveBeenCalled()
    vi.advanceTimersByTime(2)
    expect(onIdle).toHaveBeenCalledTimes(1)
  })

  it('request ที่เข้ามาเลื่อนเวลาปิดออกไป', () => {
    vi.useFakeTimers()
    const onIdle = vi.fn()
    const timer = createIdleTimer({ timeoutMs: 1000, onIdle })
    for (let i = 0; i < 5; i += 1) {
      vi.advanceTimersByTime(800)
      timer.touch()
    }
    expect(onIdle).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1001)
    expect(onIdle).toHaveBeenCalledTimes(1)
  })

  it('ปิดได้ครั้งเดียว และ stop() ยกเลิกได้', () => {
    vi.useFakeTimers()
    const onIdle = vi.fn()
    createIdleTimer({ timeoutMs: 1000, onIdle })
    vi.advanceTimersByTime(5000)
    expect(onIdle).toHaveBeenCalledTimes(1)

    const other = vi.fn()
    const stopped = createIdleTimer({ timeoutMs: 1000, onIdle: other })
    stopped.stop()
    vi.advanceTimersByTime(5000)
    expect(other).not.toHaveBeenCalled()
    expect(stopped.shutdownAt()).toBeNull()
  })

  it('timeout = 0 คือปิดการนับถอยหลัง', () => {
    vi.useFakeTimers()
    const onIdle = vi.fn()
    const timer = createIdleTimer({ timeoutMs: 0, onIdle })
    vi.advanceTimersByTime(10 * 60 * 60 * 1000)
    expect(onIdle).not.toHaveBeenCalled()
    expect(timer.shutdownAt()).toBeNull()
  })

  it('บอกคำสั่งสั่งรันใหม่ที่วางแล้วรันได้จริงทั้งสอง platform', () => {
    expect(startCommand('/Users/dev/skills/learn-diff/viewer', 'darwin')).toBe(
      'pnpm --dir /Users/dev/skills/learn-diff/viewer dev',
    )
    expect(startCommand('/Users/dev/my skills/viewer', 'darwin')).toBe(
      "pnpm --dir '/Users/dev/my skills/viewer' dev",
    )
    expect(startCommand('C:\\Users\\dev\\.claude\\skills\\learn-diff\\viewer', 'win32')).toBe(
      'pnpm --dir "C:\\Users\\dev\\.claude\\skills\\learn-diff\\viewer" dev',
    )
  })

  it('อ่านค่าจาก LEARN_DIFF_IDLE_MS และถอยไปใช้ค่า default เมื่อค่าใช้ไม่ได้', () => {
    expect(configuredIdleMs({})).toBe(DEFAULT_IDLE_MS)
    expect(configuredIdleMs({ LEARN_DIFF_IDLE_MS: '5000' })).toBe(5000)
    expect(configuredIdleMs({ LEARN_DIFF_IDLE_MS: '0' })).toBe(0)
    expect(configuredIdleMs({ LEARN_DIFF_IDLE_MS: 'นาน ๆ' })).toBe(DEFAULT_IDLE_MS)
    expect(configuredIdleMs({ LEARN_DIFF_IDLE_MS: '-1' })).toBe(DEFAULT_IDLE_MS)
  })
})

describe('GET /api/health', () => {
  it('บอกได้ว่าเป็น service อะไร process ไหน และรันจากโฟลเดอร์ไหน', async () => {
    const body = await getJson<HealthResponse>(`${baseUrl}/api/health`)
    expect(body).toMatchObject({ ok: true, service: 'learn-diff-viewer', schemaVersion: 1 })
    expect(body.pid).toBe(process.pid)
    expect(body.registry).toBe(path.join(tmpRoot, 'home', 'runs.json'))
    // root ต้องเป็นโฟลเดอร์ viewer จริง ๆ เพราะคำสั่ง "สั่งรันเอง" ถูกประกอบจากค่านี้
    expect(body.root.endsWith(`${path.sep}viewer`)).toBe(true)
    expect(body.runs).toBe(2)
    expect(Number.isNaN(Date.parse(body.startedAt))).toBe(false)
    expect(body.uptimeMs).toBeGreaterThan(0)
  })

  it('ไม่มีตัวจับเวลา (เช่นตอนเทสต์) = ไม่บอกเวลาปิด', async () => {
    const body = await getJson<HealthResponse>(`${baseUrl}/api/health`)
    expect(body.idleTimeoutMs).toBeNull()
    expect(body.idleShutdownAt).toBeNull()
  })

  it('มีตัวจับเวลาอยู่ = บอกว่าจะปิดตัวเองเมื่อไร', async () => {
    const timer = createIdleTimer({ timeoutMs: 60_000, onIdle: () => {} })
    setActiveIdleTimer(timer)
    try {
      const body = await getJson<HealthResponse>(`${baseUrl}/api/health`)
      expect(body.idleTimeoutMs).toBe(60_000)
      expect(Date.parse(body.idleShutdownAt as string)).toBeGreaterThan(Date.now())
    } finally {
      timer.stop()
      setActiveIdleTimer(null)
    }
  })

  it('registry พังก็ยังตอบได้ — แค่บอกจำนวน run ไม่ได้', async () => {
    const brokenHome = path.join(tmpRoot, 'broken-home')
    await fs.mkdir(brokenHome, { recursive: true })
    await fs.writeFile(path.join(brokenHome, 'runs.json'), '{ ยังเขียนไม่จบ', 'utf8')
    const saved = process.env.LEARN_DIFF_HOME
    process.env.LEARN_DIFF_HOME = brokenHome
    try {
      const res = await fetch(`${baseUrl}/api/health`)
      expect(res.status).toBe(200)
      expect(((await res.json()) as HealthResponse).runs).toBeNull()
    } finally {
      process.env.LEARN_DIFF_HOME = saved
    }
  })
})

describe('run registry ที่หน้าแรกใช้', () => {
  it('ลิสต์ run ข้าม repo เรียงใหม่สุดก่อน พร้อมข้อมูลที่หน้าแรกต้องโชว์', async () => {
    const { runs } = await getJson<RunsResponse>(`${baseUrl}/api/runs`)
    expect(runs.map((r) => r.id)).toEqual(['pr-1-alive', 'pr-2-gone'])
    const first = runs[0]
    expect(first.pr.number).toBe(7)
    expect(first.title).toBe('pr-1-alive')
    expect(first.createdAt).toBe('2026-08-01T09:00:00+07:00')
    expect(first.commit).toHaveLength(40)
  })

  it('บอกได้ว่า run ไหนโฟลเดอร์หายไปแล้ว โดยไม่ทำให้ทั้งรายการล้ม', async () => {
    const { runs } = await getJson<RunsResponse>(`${baseUrl}/api/runs`)
    expect(runs.find((r) => r.id === 'pr-1-alive')?.available).toBe(true)
    expect(runs.find((r) => r.id === 'pr-2-gone')?.available).toBe(false)
  })

  it('เปิด run ได้ไม่ว่ามันอยู่ repo ไหน', async () => {
    const res = await fetch(`${baseUrl}/api/runs/pr-1-alive`)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { run: { repoPath: string; contentDir: string } }
    expect(body.run.repoPath).toBe(path.join(tmpRoot, 'pr-1-alive'))
    expect(body.run.contentDir).toBe(path.join(tmpRoot, 'pr-1-alive', '.learn-diff', 'pr-1-alive'))
  })
})

describe('scripts/serve.mjs', () => {
  it('เจอตัวที่รันอยู่แล้วก็ใช้ต่อ ไม่สั่งรันตัวที่สอง', async () => {
    const { code, result } = await serve(['--port', String(port)])
    expect(code).toBe(0)
    expect(result.status).toBe('reused')
    // pid ที่ตอบกลับมาคือ process ของเทสต์เอง = ไม่มีการ spawn ตัวใหม่แน่นอน
    expect(result.pid).toBe(process.pid)
    expect(result.url).toBe(`http://127.0.0.1:${port}`)
    expect(result.startCommand).toContain('dev')
  }, 20_000)

  it('ไม่มีใครรันอยู่ + --probe = บอกว่ายังไม่มี แล้วจบด้วย exit code 3', async () => {
    const empty = await freePort()
    const { code, result } = await serve(['--port', String(empty), '--probe'])
    expect(code).toBe(3)
    expect(result.status).toBe('not_running')
    expect(result.startCommand).toContain('dev')
  }, 20_000)

  it('พอร์ตถูกบริการอื่นยึดไว้ = บอกให้ชัด ไม่ใช่รันทับ', async () => {
    const foreign = http.createServer((_req, res) => {
      res.statusCode = 200
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ service: 'something-else' }))
    })
    await new Promise<void>((resolve) => foreign.listen(0, '127.0.0.1', resolve))
    const foreignPort = (foreign.address() as AddressInfo).port
    try {
      const { code, result } = await serve(['--port', String(foreignPort)])
      expect(code).toBe(1)
      expect(result.status).toBe('error')
      expect(result.message).toContain(String(foreignPort))
    } finally {
      await new Promise<void>((resolve) => foreign.close(() => resolve()))
    }
  }, 20_000)
})
