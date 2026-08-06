import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'

import type { HealthResponse } from '../src/shared/types'
import { loadPage, loadRun } from './content'
import { loadDiff } from './diff'
import { ApiError } from './errors'
import { handleRunEvents } from './events'
import { loadFile } from './file'
import { activeIdleTimer } from './lifecycle'
import { warmIndex } from './nav/index-store'
import { loadDefinition, loadReferences } from './nav/resolve'
import { learnDiffHome, registryPath, viewerRoot } from './paths'
import { findRun, listRuns } from './registry'

export const API_PREFIX = '/api'

type Next = (err?: unknown) => void

function send(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  // content เปลี่ยนได้ตลอดระหว่าง agent เขียน — ห้าม cache
  res.setHeader('cache-control', 'no-store')
  res.end(payload)
}

function sendError(res: ServerResponse, err: unknown): void {
  if (err instanceof ApiError) {
    send(res, err.status, { error: { code: err.code, message: err.message } })
    return
  }
  const message = err instanceof Error ? err.message : String(err)
  send(res, 500, { error: { code: 'internal_error', message } })
}

/** /api/runs/<id>/pages/<sectionId> → segment ที่ decode แล้ว */
function segments(pathname: string): string[] {
  return pathname
    .slice(API_PREFIX.length)
    .split('/')
    .filter((s) => s !== '')
    .map((s) => decodeURIComponent(s))
}

/**
 * "มีใครรันอยู่ไหม" — คำถามเดียวที่ตัวเรียก (`scripts/serve.mjs`) ต้องการคำตอบ
 * ทุกฟิลด์ที่อาจล้มถูกกันไว้ด้วย catch: health ที่ตอบ 500 ทำให้ตัวเรียกเข้าใจว่า "ไม่มี server"
 * แล้วสั่งรันตัวที่สองทับพอร์ตเดิม ซึ่งเป็นสิ่งเดียวที่ endpoint นี้มีหน้าที่ป้องกัน
 */
async function health(): Promise<HealthResponse> {
  const idle = activeIdleTimer()
  const shutdownAt = idle?.shutdownAt() ?? null
  let runs: number | null = null
  try {
    runs = (await listRuns()).length
  } catch {
    runs = null
  }
  return {
    ok: true,
    service: 'learn-diff-viewer',
    schemaVersion: 1,
    registry: registryPath(),
    home: learnDiffHome(),
    pid: process.pid,
    root: viewerRoot(),
    startedAt: new Date(Date.now() - Math.round(process.uptime() * 1000)).toISOString(),
    uptimeMs: Math.round(process.uptime() * 1000),
    runs,
    idleTimeoutMs: idle ? idle.timeoutMs : null,
    idleShutdownAt: shutdownAt === null ? null : new Date(shutdownAt).toISOString(),
  }
}

async function route(url: URL): Promise<{ status: number; body: unknown }> {
  const pathname = url.pathname
  const parts = segments(pathname)

  if (parts.length === 1 && parts[0] === 'health') {
    return { status: 200, body: await health() }
  }

  if (parts[0] === 'runs') {
    if (parts.length === 1) {
      return { status: 200, body: { runs: await listRuns() } }
    }
    const run = await findRun(parts[1])
    if (parts.length === 2) {
      const body = await loadRun(run)
      // index ของ navigation สร้างเป็น background ตั้งแต่เปิด run — request ที่มาก่อนเสร็จรอเงียบ ๆ
      // ที่ `getIndex` เอง (user story 19) จึงไม่ต้อง await ตรงนี้
      warmIndex(path.resolve(run.repoPath), run.commit)
      return { status: 200, body }
    }
    if (parts.length === 4 && parts[2] === 'pages') {
      return { status: 200, body: await loadPage(run, parts[3]) }
    }
    // path ของไฟล์อยู่ใน query ไม่ใช่ segment — path มี `/` อยู่ในตัวเองอยู่แล้ว
    if (parts.length === 3 && parts[2] === 'file') {
      const body = await loadFile(run, {
        path: url.searchParams.get('path'),
        from: url.searchParams.get('from'),
        to: url.searchParams.get('to'),
      })
      return { status: 200, body }
    }
    // "PR แตะบรรทัดไหนของไฟล์นี้" — hunk ทั้งไฟล์ ไม่ผูกกับช่วงที่กำลังเปิดอยู่
    if (parts.length === 3 && parts[2] === 'diff') {
      return { status: 200, body: await loadDiff(run, url.searchParams.get('path')) }
    }
    // code navigation — ตำแหน่ง cursor อยู่ใน query เหมือน /file (server ตัดชื่อ symbol เอง)
    if (parts.length === 3 && (parts[2] === 'definition' || parts[2] === 'references')) {
      const query = {
        path: url.searchParams.get('path'),
        line: url.searchParams.get('line'),
        col: url.searchParams.get('col'),
      }
      const body = parts[2] === 'definition' ? await loadDefinition(run, query) : await loadReferences(run, query)
      return { status: 200, body }
    }
  }

  throw ApiError.notFound('unknown_endpoint', `ไม่รู้จัก endpoint "${pathname}"`)
}

/**
 * middleware ของ API — ใช้ได้ทั้งกับ vite dev server และ node:http เปล่า ๆ ในเทสต์
 * (นี่คือ seam เดียวที่ automated test ยิงใส่ ตาม Testing Decisions ของ SPEC-v3)
 */
export function createApiHandler() {
  return function apiHandler(req: IncomingMessage, res: ServerResponse, next?: Next): void {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    if (!url.pathname.startsWith(`${API_PREFIX}/`) && url.pathname !== API_PREFIX) {
      if (next) next()
      else send(res, 404, { error: { code: 'not_found', message: 'ไม่ใช่ API path' } })
      return
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      send(res, 405, { error: { code: 'method_not_allowed', message: 'API นี้อ่านอย่างเดียว' } })
      return
    }

    const pathname = url.pathname
    let parts: string[]
    try {
      // path segment ที่ decode ไม่ออกถือว่า request พัง ไม่ใช่ 500
      parts = segments(pathname)
    } catch {
      sendError(res, ApiError.badRequest('bad_path', 'path มี percent-encoding ที่ decode ไม่ได้'))
      return
    }

    // SSE ต้องถือ response ไว้เอง จึงแยกออกจาก router ที่คืน body ก้อนเดียว
    if (parts.length === 3 && parts[0] === 'runs' && parts[2] === 'events') {
      findRun(parts[1]).then(
        (run) => handleRunEvents(req, res, run),
        (err) => sendError(res, err),
      )
      return
    }

    route(url).then(
      ({ status, body }) => send(res, status, body),
      (err) => sendError(res, err),
    )
  }
}
