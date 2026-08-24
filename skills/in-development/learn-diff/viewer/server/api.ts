import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'

import type { HealthResponse } from '../src/shared/types'
import {
  createComment,
  editComment,
  loadComments,
  parseCommentId,
  parseCommentKind,
  removeComment,
} from './comments'
import { loadPage, loadRun } from './content'
import { loadCoverageBase } from './coverage'
import { loadDiff } from './diff'
import { ApiError } from './errors'
import { handleRunEvents } from './events'
import { loadFile } from './file'
import { execGh, type GhRunner } from './gh'
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

/**
 * route ของ comment เท่านั้นที่รับ method เขียนได้ (issue #49) — ที่เหลือยังอ่านอย่างเดียว
 * ตรวจจาก path segment ตรง ๆ ไม่ใช่จาก "route ไหนที่ router รู้จัก" เพื่อให้เงื่อนไขนี้อ่านจบในบรรทัดเดียว
 */
const WRITE_METHODS: ReadonlySet<string> = new Set(['POST', 'PATCH', 'DELETE'])

function isCommentRoute(parts: string[]): boolean {
  return parts[0] === 'runs' && parts.length >= 3 && parts[2] === 'comments'
}

/** context ของ request หนึ่งครั้ง — method กับ body มีความหมายเฉพาะ route ของ comment */
interface RequestContext {
  method: string
  body: Record<string, unknown>
  gh: GhRunner
}

async function route(url: URL, ctx: RequestContext): Promise<{ status: number; body: unknown }> {
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
    // "PR เปลี่ยนบรรทัดไหนบ้างทั้งหมด" — ground truth ของ coverage meter (SPEC-reading-checklist)
    if (parts.length === 3 && parts[2] === 'coverage-base') {
      return { status: 200, body: await loadCoverageBase(run) }
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
    // comment ของ PR ผ่าน gh (issue #49) — route เดียวในไฟล์นี้ที่เขียนได้
    if (parts.length === 3 && parts[2] === 'comments') {
      if (ctx.method === 'POST') {
        return { status: 201, body: await createComment(run, ctx.gh, ctx.body) }
      }
      return { status: 200, body: await loadComments(run, ctx.gh) }
    }
    // /comments/<kind>/<id> — review กับ issue comment แก้/ลบคนละ endpoint ของ GitHub
    if (parts.length === 5 && parts[2] === 'comments') {
      const kind = parseCommentKind(parts[3])
      const id = parseCommentId(parts[4])
      if (ctx.method === 'PATCH') {
        return { status: 200, body: await editComment(run, ctx.gh, kind, id, ctx.body) }
      }
      if (ctx.method === 'DELETE') {
        return { status: 200, body: await removeComment(run, ctx.gh, kind, id) }
      }
      throw ApiError.badRequest('method_not_allowed', `comment เดี่ยวรับแค่ PATCH/DELETE (ได้ ${ctx.method})`)
    }
  }

  throw ApiError.notFound('unknown_endpoint', `ไม่รู้จัก endpoint "${pathname}"`)
}

/** comment ที่ใหญ่กว่านี้ไม่ใช่ comment แล้ว — กันคนยิง payload ใหญ่ใส่ process ที่ไม่มี auth layer */
const MAX_BODY_BYTES = 512 * 1024

/**
 * ค่า `Sec-Fetch-Site` ที่ยอมรับ: มาจากหน้า viewer เอง หรือไม่มี initiator (พิมพ์ URL / curl)
 * header นี้ browser เป็นคนตั้งและหน้าเว็บตั้งเองไม่ได้ (forbidden header) จึงเชื่อได้
 */
const SAME_SITE_VALUES: ReadonlySet<string> = new Set(['same-origin', 'none'])

function headerOf(req: IncomingMessage, name: string): string | null {
  const value = req.headers[name]
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value[0] ?? null
  return null
}

/**
 * กัน "หน้าเว็บอื่นสั่งเขียนแทนเรา" (CSRF) — viewer ไม่มี auth layer ของตัวเองโดยตั้งใจ แต่
 * endpoint เขียน act ในนามบัญชี GitHub ของเจ้าของเครื่อง · พอร์ต (5174) กับ run id
 * (`pr-<n>-<slug>`) เดาได้ทั้งคู่ หน้าเว็บอะไรก็ได้ที่ผู้ใช้เปิดค้างไว้จึงยิงมาที่ 127.0.0.1 ได้
 * ตรง ๆ และ **CORS ไม่ช่วย** เพราะ side effect เกิดไปแล้วก่อนที่ browser จะบล็อกการอ่านคำตอบ
 * (Cloudflare Access กันคนที่มาทาง tunnel — คนละเคสกับ browser ของเจ้าของเครื่องเอง)
 *
 * สองชั้นที่ปิดช่องนี้:
 *  1. `Sec-Fetch-Site` ต้องไม่ใช่ cross-site/same-site — ปิดทั้ง form post และ fetch ข้าม origin
 *     บน browser ปัจจุบันทุกตัว · ไม่มี header นี้ (client เก่า/ไม่ใช่ browser) ค่อยเทียบ
 *     `Origin` กับ host ของตัวเอง
 *  2. request ที่มี body ต้องเป็น `application/json` — `<form>` ข้าม origin ส่งได้แค่
 *     urlencoded/multipart/text-plain (ซึ่งเป็นรูปที่ยิงทดสอบแล้วทะลุมาก่อนหน้านี้) ส่วน fetch
 *     ที่ใส่ json จะโดน preflight ที่ฝั่งนี้ไม่ตอบ
 */
function assertSameSite(req: IncomingMessage, method: string): void {
  const site = headerOf(req, 'sec-fetch-site')
  if (site !== null) {
    if (!SAME_SITE_VALUES.has(site)) {
      throw new ApiError(
        403,
        'cross_site_blocked',
        'request เขียนต้องมาจากหน้า viewer เอง — คำขอนี้ถูกส่งมาจากเว็บอื่น',
      )
    }
  } else {
    const origin = headerOf(req, 'origin')
    // Origin ของ tunnel เท่ากับ host ที่ browser คุยด้วย (cloudflared ส่ง Host เดิมต่อมาให้)
    if (origin !== null && origin !== 'null') {
      const host = headerOf(req, 'host')
      let originHost: string | null = null
      try {
        originHost = new URL(origin).host
      } catch {
        originHost = null
      }
      if (originHost === null || host === null || originHost !== host) {
        throw new ApiError(
          403,
          'cross_site_blocked',
          `request เขียนมาจาก origin อื่น (${origin}) — ไม่ใช่หน้า viewer ของเครื่องนี้`,
        )
      }
    }
  }

  const type = headerOf(req, 'content-type')
  const isJson = type !== null && /^application\/json\s*(;|$)/i.test(type.trim())
  // POST/PATCH ต้องมี body เสมอ — ไม่มี content-type เลยแปลว่าไม่ได้มาจาก client ของ viewer
  if (!isJson && (method !== 'DELETE' || type !== null)) {
    throw new ApiError(
      415,
      'unsupported_media_type',
      'request เขียนต้องส่งเป็น content-type: application/json',
    )
  }
}

/** อ่าน JSON body ของ request เขียน — ว่าง = object เปล่า (DELETE ไม่มี body) */
function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        reject(new ApiError(413, 'body_too_large', 'เนื้อหาที่ส่งมายาวเกินไป'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('error', (err) => reject(err))
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8').trim()
      if (text === '') {
        resolve({})
        return
      }
      let parsed: unknown
      try {
        parsed = JSON.parse(text) as unknown
      } catch {
        reject(ApiError.badRequest('bad_json', 'body ของ request ไม่ใช่ JSON ที่อ่านได้'))
        return
      }
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        reject(ApiError.badRequest('bad_json', 'body ของ request ต้องเป็น JSON object'))
        return
      }
      resolve(parsed as Record<string, unknown>)
    })
  })
}

export interface ApiHandlerOptions {
  /**
   * ตัวรันคำสั่ง gh — เทสต์แทนด้วย fake เพื่อพิสูจน์ payload ที่ส่งไป GitHub
   * (seam ใหม่จุดเดียวที่ Testing Decisions ของ #49 อนุญาต)
   */
  gh?: GhRunner
}

/**
 * middleware ของ API — ใช้ได้ทั้งกับ vite dev server และ node:http เปล่า ๆ ในเทสต์
 * (นี่คือ seam เดียวที่ automated test ยิงใส่ ตาม Testing Decisions ของ SPEC-v3)
 */
export function createApiHandler(options: ApiHandlerOptions = {}) {
  const gh = options.gh ?? execGh

  return function apiHandler(req: IncomingMessage, res: ServerResponse, next?: Next): void {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    if (!url.pathname.startsWith(`${API_PREFIX}/`) && url.pathname !== API_PREFIX) {
      if (next) next()
      else send(res, 404, { error: { code: 'not_found', message: 'ไม่ใช่ API path' } })
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

    const method = req.method ?? 'GET'
    // อ่านอย่างเดียวยังเป็นค่าตั้งต้นของทั้ง API — ผ่อนเฉพาะ route ของ comment (issue #49)
    if (method !== 'GET' && method !== 'HEAD' && !(WRITE_METHODS.has(method) && isCommentRoute(parts))) {
      send(res, 405, { error: { code: 'method_not_allowed', message: 'API นี้อ่านอย่างเดียว ยกเว้น comment ของ PR' } })
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

    // ตรวจก่อนอ่าน body: request ที่มาจากเว็บอื่นต้องไม่ถูกอ่านหรือประมวลผลเลยแม้แต่ไบต์เดียว
    if (WRITE_METHODS.has(method)) {
      try {
        assertSameSite(req, method)
      } catch (err) {
        sendError(res, err)
        return
      }
    }

    const body = WRITE_METHODS.has(method) ? readJsonBody(req) : Promise.resolve({})
    body
      .then((parsed) => route(url, { method, body: parsed, gh }))
      .then(
        ({ status, body: payload }) => send(res, status, payload),
        (err) => sendError(res, err),
      )
  }
}
