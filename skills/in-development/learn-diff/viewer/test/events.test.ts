import nodeFs from 'node:fs'
import fs from 'node:fs/promises'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import type { AddressInfo } from 'node:net'

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { createApiHandler } from '../server/api'
import { closeAllEventStreams } from '../server/events'
import { registerRun } from '../server/registry'
import { closeAllWatchers } from '../server/watch'
import type { RunChangeEvent, RunData, RunReadyEvent } from '../src/shared/types'

let tmpRoot: string
let contentDir: string
let server: http.Server
let baseUrl: string

const RUN_ID = 'pr-7-live'

function runData(): RunData {
  return {
    schemaVersion: 1,
    id: RUN_ID,
    title: 'เขียนสด',
    pr: { number: 7, title: 'live' },
    commit: '0123456789abcdef0123456789abcdef01234567',
    generatedAt: '2026-08-04T09:00:00+07:00',
    sections: [
      { id: 'index', title: 'ภาพรวม', kind: 'index' },
      { id: '01-core', title: '01 — แกนหลัก' },
      { id: '99-verify', title: '99 — คำถาม', kind: 'verify' },
    ],
  }
}

interface SseEvent {
  event: string
  data: unknown
}

/** สาย SSE หนึ่งเส้นที่อ่านทีละ event ได้ */
class SseClient {
  private readonly controller = new AbortController()
  private reader!: ReadableStreamDefaultReader<Uint8Array>
  private buffer = ''
  private pending: SseEvent[] = []
  status = 0
  contentType = ''

  async open(url: string): Promise<void> {
    const res = await fetch(url, {
      headers: { accept: 'text/event-stream' },
      signal: this.controller.signal,
    })
    this.status = res.status
    this.contentType = res.headers.get('content-type') ?? ''
    this.reader = res.body!.getReader()
  }

  /** รอ event ชื่อที่ต้องการ ข้าม heartbeat และ event อื่นระหว่างทาง */
  async next(name: string, timeoutMs = 8000): Promise<SseEvent> {
    const deadline = Date.now() + timeoutMs
    for (;;) {
      const found = this.pending.findIndex((e) => e.event === name)
      if (found !== -1) return this.pending.splice(found, 1)[0]
      const remaining = deadline - Date.now()
      if (remaining <= 0) throw new Error(`ไม่ได้รับ event "${name}" ภายใน ${timeoutMs}ms`)
      const chunk = await Promise.race([
        this.reader.read(),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), remaining)),
      ])
      if (chunk === null) throw new Error(`ไม่ได้รับ event "${name}" ภายใน ${timeoutMs}ms`)
      if (chunk.done) throw new Error('สาย SSE ถูกปิดก่อนได้ event ที่รอ')
      this.buffer += Buffer.from(chunk.value).toString('utf8')
      this.drain()
    }
  }

  private drain(): void {
    const blocks = this.buffer.split('\n\n')
    this.buffer = blocks.pop() ?? ''
    for (const block of blocks) {
      let event = 'message'
      const dataLines: string[] = []
      for (const line of block.split('\n')) {
        if (line.startsWith(':')) continue
        if (line.startsWith('event:')) event = line.slice(6).trim()
        else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim())
      }
      if (dataLines.length === 0) continue
      this.pending.push({ event, data: JSON.parse(dataLines.join('\n')) as unknown })
    }
  }

  close(): void {
    this.controller.abort()
  }
}

async function connect(runId = RUN_ID): Promise<SseClient> {
  const client = new SseClient()
  await client.open(`${baseUrl}/api/runs/${runId}/events`)
  return client
}

beforeAll(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'learn-diff-sse-'))
  process.env.LEARN_DIFF_HOME = path.join(tmpRoot, 'home')

  const repoPath = path.join(tmpRoot, 'repo')
  contentDir = path.join(repoPath, '.learn-diff', RUN_ID)
  await fs.mkdir(contentDir, { recursive: true })
  await fs.writeFile(path.join(contentDir, 'run.json'), JSON.stringify(runData(), null, 2), 'utf8')
  await fs.writeFile(path.join(contentDir, 'index.md'), '# ภาพรวม\n', 'utf8')

  await registerRun({
    id: RUN_ID,
    repoPath,
    contentDir: path.join('.learn-diff', RUN_ID),
    commit: '0123456789abcdef0123456789abcdef01234567',
    pr: { number: 7, title: 'live' },
    title: 'เขียนสด',
    createdAt: '2026-08-04T09:00:00+07:00',
  })

  const handler = createApiHandler()
  server = http.createServer((req, res) => handler(req, res))
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
  closeAllEventStreams()
  closeAllWatchers()
  server.closeAllConnections?.()
  await new Promise<void>((resolve) => server.close(() => resolve()))
  await fs.rm(tmpRoot, { recursive: true, force: true })
})

describe('GET /api/runs/:id/events', () => {
  it('เปิดเป็น SSE แล้วบอกทันทีว่ากำลังเฝ้าโฟลเดอร์ไหนอยู่', async () => {
    const client = await connect()
    try {
      expect(client.status).toBe(200)
      expect(client.contentType).toContain('text/event-stream')
      const ready = (await client.next('ready')).data as RunReadyEvent
      expect(ready.runId).toBe(RUN_ID)
      expect(ready.contentDir).toBe(contentDir)
    } finally {
      client.close()
    }
  })

  it('เขียนไฟล์ section ใหม่แล้วได้ change event โดยไม่ต้องขออะไรเพิ่ม', async () => {
    const client = await connect()
    try {
      await client.next('ready')
      await fs.writeFile(path.join(contentDir, '01-core.md'), '# แกนหลัก\n', 'utf8')

      const change = (await client.next('change')).data as RunChangeEvent
      expect(change.runId).toBe(RUN_ID)
      expect(change.files).toContain('01-core.md')
      expect(change.runFileChanged).toBe(false)

      // และ API หน้าเดิมที่เคยตอบ section_pending ตอบเนื้อหาจริงแล้ว
      const res = await fetch(`${baseUrl}/api/runs/${RUN_ID}/pages/01-core`)
      expect(res.status).toBe(200)
    } finally {
      client.close()
    }
  })

  it('แก้ไฟล์ที่มีอยู่แล้วก็ได้ change event เหมือนกัน', async () => {
    const client = await connect()
    try {
      await client.next('ready')
      await fs.writeFile(path.join(contentDir, 'index.md'), '# ภาพรวม\n\nเพิ่มย่อหน้าใหม่\n', 'utf8')

      const change = (await client.next('change')).data as RunChangeEvent
      expect(change.files).toContain('index.md')
    } finally {
      client.close()
    }
  })

  it('run.json ที่เปลี่ยน (เช่นเพิ่ม section) ถูกทำเครื่องหมายไว้ต่างหาก', async () => {
    const client = await connect()
    try {
      await client.next('ready')
      const next = runData()
      next.sections.push({ id: '02-extra', title: '02 — เพิ่มทีหลัง' })
      await fs.writeFile(path.join(contentDir, 'run.json'), JSON.stringify(next, null, 2), 'utf8')

      const change = (await client.next('change')).data as RunChangeEvent
      expect(change.runFileChanged).toBe(true)
      expect(change.files).toContain('run.json')
    } finally {
      client.close()
    }
  })

  it('หลายสายพร้อมกัน (หลายแท็บ) ได้ event เดียวกันทุกสาย', async () => {
    const a = await connect()
    const b = await connect()
    try {
      await a.next('ready')
      await b.next('ready')
      await fs.writeFile(path.join(contentDir, '99-verify.md'), '# คำถาม\n', 'utf8')

      const changeA = (await a.next('change')).data as RunChangeEvent
      const changeB = (await b.next('change')).data as RunChangeEvent
      expect(changeA.files).toContain('99-verify.md')
      expect(changeB.files).toContain('99-verify.md')
    } finally {
      a.close()
      b.close()
    }
  })

  it(
    'ยังส่ง change ได้แม้ fs.watch ใช้ไม่ได้ (ตกมาที่ poll)',
    async () => {
      // run แยกโฟลเดอร์ เพื่อให้ต้องสร้าง watcher ตัวใหม่ตอน fs.watch ถูกทำให้พัง
      const repoPath = path.join(tmpRoot, 'repo-poll')
      const dir = path.join(repoPath, '.learn-diff', 'pr-8-poll')
      await fs.mkdir(dir, { recursive: true })
      const data = { ...runData(), id: 'pr-8-poll' }
      await fs.writeFile(path.join(dir, 'run.json'), JSON.stringify(data, null, 2), 'utf8')
      await registerRun({
        id: 'pr-8-poll',
        repoPath,
        contentDir: path.join('.learn-diff', 'pr-8-poll'),
        commit: '0123456789abcdef0123456789abcdef01234567',
        pr: { number: 8, title: 'poll' },
        title: 'ไม่มี fs.watch',
        createdAt: '2026-08-04T10:00:00+07:00',
      })

      const watch = vi.spyOn(nodeFs, 'watch').mockImplementation(() => {
        throw new Error('fs.watch ใช้ไม่ได้บนโวลุ่มนี้')
      })
      const client = await connect('pr-8-poll')
      try {
        await client.next('ready')
        await fs.writeFile(path.join(dir, 'index.md'), '# ภาพรวม\n', 'utf8')
        const change = (await client.next('change', 12_000)).data as RunChangeEvent
        expect(change.files).toContain('index.md')
      } finally {
        client.close()
        watch.mockRestore()
      }
    },
    15_000,
  )

  it('run ที่ไม่มีใน registry ตอบ 404 เป็น JSON ไม่ใช่เปิดสายค้างไว้', async () => {
    const res = await fetch(`${baseUrl}/api/runs/pr-999-nope/events`)
    expect(res.status).toBe(404)
    expect(res.headers.get('content-type')).toContain('application/json')
    expect(await res.json()).toMatchObject({ error: { code: 'run_not_found' } })
  })
})
