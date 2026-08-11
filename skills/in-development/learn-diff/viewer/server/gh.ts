import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

import { ApiError } from './errors'

/**
 * ตัวรันคำสั่ง `gh` — จุดเดียวที่ viewer แตะ GitHub (issue #49)
 *
 * ทำไมต้องเป็น dependency ที่ inject ได้: เทสต์ต้องพิสูจน์ว่า "บรรทัดใน diff กลายเป็น review
 * comment ที่ payload ถูกต้อง" ซึ่งเป็นข้อตกลงกับ GitHub ไม่ใช่กับ process จริง — fake runner
 * ทำให้ยิงผ่าน HTTP seam เดิมได้ทั้งชุดโดยไม่ต้องมี PR จริง (Testing Decisions ของสเปก)
 *
 * browser ไม่เคยคุยกับ GitHub เอง: token อยู่กับ gh บนเครื่องผู้ใช้ และ endpoint พวกนี้
 * act ในนามบัญชีของเจ้าของเครื่อง — ด่านกันคนนอกคือ Cloudflare Access หน้า tunnel
 */

const run = promisify(execFile)

/** เอาต์พุตของ gh ที่เราสนใจไม่เคยใหญ่ (comment ของ PR หนึ่งตัว) — เผื่อไว้กว้าง ๆ พอ */
const MAX_BUFFER = 16 * 1024 * 1024

export interface GhCommand {
  /** argv ต่อจาก `gh` เช่น ['api', 'repos/o/r/issues/1/comments'] */
  args: string[]
  /** โฟลเดอร์ที่รันคำสั่ง — repo ของ run (gh ใช้หา remote เวลาไม่ได้ระบุ repo เต็ม) */
  cwd: string
  /** stdin สำหรับ `gh api --input -` (JSON) */
  input?: string
}

export interface GhResult {
  stdout: string
}

export type GhRunner = (command: GhCommand) => Promise<GhResult>

/** คำสั่งที่ล้มเหลว — เก็บ stderr ดิบไว้ให้ผู้แปลตัดสินใจว่าจะบอกผู้อ่านว่าอะไร */
export class GhError extends Error {
  readonly stderr: string
  readonly code: number | string | undefined

  constructor(message: string, stderr: string, code?: number | string) {
    super(message)
    this.name = 'GhError'
    this.stderr = stderr
    this.code = code
  }
}

interface ExecError extends Error {
  code?: number | string
  stderr?: Buffer | string
  stdout?: Buffer | string
}

function textOf(raw: Buffer | string | undefined): string {
  if (!raw) return ''
  return (Buffer.isBuffer(raw) ? raw.toString('utf8') : raw).trim()
}

/** ตัวจริง — เรียก `gh` ใน PATH ของเครื่องที่รัน viewer ด้วย credential ของผู้ใช้คนนั้น */
export const execGh: GhRunner = async ({ args, cwd, input }) => {
  try {
    const child = run('gh', args, { cwd, maxBuffer: MAX_BUFFER, windowsHide: true })
    if (input !== undefined) {
      child.child.stdin?.end(input)
    }
    const { stdout } = await child
    return { stdout: typeof stdout === 'string' ? stdout : String(stdout) }
  } catch (err) {
    const e = err as ExecError
    // stderr ของ gh คือข้อความที่ GitHub ตอบกลับมาจริง ๆ — ห้ามกลืน (หลักข้อ 9 ของ DEVELOPMENT.md)
    throw new GhError(e.message, textOf(e.stderr) || textOf(e.stdout), e.code)
  }
}

/**
 * แปลง GhError เป็น ApiError ที่ "บอกวิธีแก้ได้" — ไม่ใช่ 500 เปล่า ๆ (user story 11, 13)
 *
 * ข้อความของ gh เสถียรพอสำหรับสามกลุ่มนี้: ไม่มี binary, ยังไม่ login, และ HTTP status
 * ที่ GitHub ตอบกลับมา · ที่เหลือส่ง stderr ดิบต่อให้ผู้อ่านเห็นเอง
 */
export function ghApiError(err: unknown, what: string): ApiError {
  if (err instanceof ApiError) return err
  if (!(err instanceof GhError)) {
    return new ApiError(500, 'gh_failed', `${what} ล้มเหลว: ${err instanceof Error ? err.message : String(err)}`)
  }
  if (err.code === 'ENOENT') return ghMissingError()
  const stderr = err.stderr
  if (/gh auth login|not logged in(to| to)? |authentication token|requires authentication/i.test(stderr)) {
    return ghAuthError(stderr)
  }
  const status = /HTTP (\d{3})/.exec(stderr)
  if (status) {
    const code = Number(status[1])
    if (code === 401 || code === 403) {
      return new ApiError(code, 'github_forbidden', `GitHub ปฏิเสธคำสั่ง (${what}): ${stderr}`)
    }
    if (code === 404) {
      return new ApiError(
        404,
        'github_not_found',
        `GitHub บอกว่าไม่มีของที่ขอ (${what}) — comment อาจถูกลบไปแล้ว หรือบัญชีนี้ไม่มีสิทธิ์เห็น repo นี้: ${stderr}`,
      )
    }
    if (code === 422) {
      return new ApiError(
        422,
        'github_rejected',
        `GitHub ไม่รับ comment นี้ (${what}) — ส่วนใหญ่แปลว่าบรรทัดที่อ้างไม่ได้อยู่ใน diff ของ PR: ${stderr}`,
      )
    }
    return new ApiError(502, 'github_error', `GitHub ตอบ HTTP ${code} (${what}): ${stderr}`)
  }
  return new ApiError(502, 'gh_failed', `${what} ล้มเหลว: ${stderr || err.message}`)
}

export function ghMissingError(): ApiError {
  return new ApiError(
    503,
    'gh_unavailable',
    'ไม่มีคำสั่ง `gh` ในเครื่องที่รัน viewer — ติดตั้ง GitHub CLI (mac: `brew install gh`) แล้วรัน `gh auth login`',
  )
}

export function ghAuthError(detail: string): ApiError {
  return new ApiError(
    401,
    'gh_not_authenticated',
    `GitHub CLI ยังไม่ได้ login บนเครื่องที่รัน viewer — รัน \`gh auth login\` แล้วลองใหม่${detail ? ` (gh บอกว่า: ${detail})` : ''}`,
  )
}

/**
 * "gh พร้อมใช้ไหม" — ตรวจครั้งเดียวต่อ process แล้วจำไว้ (ผลลัพธ์เป็นของเครื่อง ไม่ใช่ของ run)
 *
 * จำเฉพาะฝั่งที่ "พร้อม" เท่านั้น: คนที่เพิ่งเจอ error แล้วไป `gh auth login` ต้องใช้ได้ทันที
 * โดยไม่ต้องรีสตาร์ท viewer (บทเรียนเดียวกับ knownCommits ใน git.ts)
 */
let readyViewer: Promise<string | null> | null = null

export function clearGhCache(): void {
  readyViewer = null
}

/**
 * ตรวจ auth + คืน login ของบัญชีที่ใช้อยู่ (null = ตอบไม่ได้แต่ auth ผ่าน)
 * login ใช้บอก UI ว่า comment ไหนเป็นของผู้อ่านเอง — สิทธิ์จริงยังเป็น GitHub ที่ตัดสิน
 */
export function ghViewer(gh: GhRunner, cwd: string): Promise<string | null> {
  if (readyViewer) return readyViewer
  const attempt = (async () => {
    try {
      await gh({ args: ['auth', 'status'], cwd })
    } catch (err) {
      if (err instanceof GhError && err.code === 'ENOENT') throw ghMissingError()
      throw ghAuthError(err instanceof GhError ? err.stderr : String(err))
    }
    try {
      const { stdout } = await gh({ args: ['api', 'user', '--jq', '.login'], cwd })
      const login = stdout.trim()
      return login === '' ? null : login
    } catch {
      // รู้ว่า login แล้ว แต่ถามชื่อไม่ได้ — ไม่ใช่เหตุให้ปิดฟีเจอร์ทั้งอัน
      return null
    }
  })()
  readyViewer = attempt
  attempt.catch(() => {
    // ล้มเหลว = ไม่จำ ครั้งหน้าถามใหม่ (ผู้ใช้อาจเพิ่ง login ระหว่างนั้น)
    if (readyViewer === attempt) readyViewer = null
  })
  return attempt
}
