import type {
  CommentCreatedResponse,
  CommentsResponse,
  DiffHunk,
  PrComment,
  PrCommentKind,
  RunSummary,
} from '../src/shared/types'
import { loadDiff } from './diff'
import { ApiError } from './errors'
import { ghApiError, ghViewer, type GhRunner } from './gh'

/**
 * comment ของ PR จากใน viewer (issue #49) — ผ่าน `gh api` ฝั่ง server เท่านั้น
 *
 * กติกาการเลือกชนิดของ comment (Implementation Decisions ของสเปก):
 *   บรรทัดอยู่ใน diff ของ PR  → review comment ผูกกับ commit ที่ run pin ไว้
 *   บรรทัดอยู่นอก diff        → issue comment (ระดับ PR) แนบ permalink ของบรรทัดนั้นนำหน้า
 *   ไม่ระบุบรรทัด             → issue comment ธรรมดา (กล่องท้ายหน้า run)
 *
 * ทำไมต้อง fallback แทนที่จะห้าม: GitHub รับ review comment เฉพาะบรรทัดที่อยู่ใน diff — การบล็อก
 * ผู้อ่านตรงนั้นเท่ากับบอกว่า "ทักไม่ได้" ทั้งที่คำถามส่วนใหญ่เกิดกับโค้ดเดิมที่ PR ไม่ได้แตะ
 * (นี่คือเหตุผลที่ viewer แสดงโค้ดรอบ ๆ ตั้งแต่แรก)
 */

/** owner/repo ของ PR — parse จาก pr.url ก่อน ไม่มีค่อยถาม gh จาก repo ในเครื่อง */
const PR_URL_RE = /github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/

interface RepoSlug {
  owner: string
  repo: string
}

const slugCache = new Map<string, RepoSlug>()

export function clearCommentsCache(): void {
  slugCache.clear()
}

function parseSlug(prUrl: string | undefined): RepoSlug | null {
  if (!prUrl) return null
  const match = PR_URL_RE.exec(prUrl)
  if (!match) return null
  return { owner: match[1], repo: match[2] }
}

async function repoSlug(run: RunSummary, gh: GhRunner): Promise<RepoSlug> {
  const fromUrl = parseSlug(run.pr.url)
  if (fromUrl) return fromUrl
  const cached = slugCache.get(run.repoPath)
  if (cached) return cached
  let stdout: string
  try {
    const result = await gh({
      args: ['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner'],
      cwd: run.repoPath,
    })
    stdout = result.stdout
  } catch (err) {
    throw ghApiError(err, 'หา owner/repo ของ PR')
  }
  const [owner, repo] = stdout.trim().split('/')
  if (!owner || !repo) {
    throw new ApiError(
      422,
      'repo_slug_unknown',
      'บอกไม่ได้ว่า PR นี้อยู่ repo ไหน — เติม "pr.url" (ลิงก์ PR เต็ม ๆ) ลง run.json แล้วลงทะเบียน run ใหม่',
    )
  }
  const slug = { owner, repo }
  slugCache.set(run.repoPath, slug)
  return slug
}

/**
 * บรรทัด (ฝั่ง head) นี้อยู่ใน diff ของ PR ไหม — ตัดสินจาก hunk ชุดเดียวกับที่ใช้ลงสีในกล่องโค้ด
 *
 * `-U0` ของ loadDiff ทำให้ชุดนี้แคบกว่าที่ GitHub ยอมรับจริง (GitHub นับบริบทรอบ hunk ด้วย)
 * ซึ่งเป็นทิศที่ปลอดภัย: ทุกบรรทัดที่เราส่งเป็น review comment GitHub รับแน่ ๆ ส่วนบรรทัดที่
 * ตกไปก็ยังทักได้ผ่าน issue comment + permalink ไม่มีทางที่ผู้อ่านจะ "ทักไม่ได้"
 */
export function lineInDiff(hunks: readonly DiffHunk[], line: number): boolean {
  return hunks.some((hunk) => hunk.newCount > 0 && line >= hunk.newStart && line <= hunk.newStart + hunk.newCount - 1)
}

/** ลิงก์ถาวรไปยังบรรทัดนั้นที่ commit ที่ pin ไว้ — ผู้อ่าน comment ตามไปดู context ได้ (user story 3) */
export function permalink(slug: RepoSlug, commit: string, path: string, line: number): string {
  return `https://github.com/${slug.owner}/${slug.repo}/blob/${commit}/${path}#L${line}`
}

/** issue comment ที่แทน review comment — permalink มาก่อนเสมอ ผู้อ่านจะได้รู้ว่าพูดถึงบรรทัดไหน */
export function bodyWithPermalink(link: string, path: string, line: number, body: string): string {
  return `[\`${path}:${line}\`](${link})\n\n${body}`
}

interface RawUser {
  login?: string
}

interface RawComment {
  id?: number
  user?: RawUser
  body?: string
  html_url?: string
  created_at?: string
  updated_at?: string
  path?: string
  line?: number | null
  original_line?: number | null
  position?: number | null
}

function toComment(raw: RawComment, kind: PrCommentKind): PrComment {
  return {
    id: Number(raw.id ?? 0),
    kind,
    author: raw.user?.login ?? '',
    body: raw.body ?? '',
    url: raw.html_url ?? '',
    createdAt: raw.created_at ?? '',
    updatedAt: raw.updated_at ?? raw.created_at ?? '',
    path: kind === 'review' ? (raw.path ?? null) : null,
    line: kind === 'review' ? (raw.line ?? raw.original_line ?? null) : null,
    outdated: kind === 'review' && raw.position === null,
  }
}

function parseJson(stdout: string, what: string): unknown {
  const text = stdout.trim()
  if (text === '') return []
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new ApiError(502, 'gh_bad_output', `อ่านคำตอบของ gh ไม่ออก (${what})`)
  }
}

async function ghJson(gh: GhRunner, cwd: string, args: string[], what: string, input?: string): Promise<unknown> {
  try {
    const { stdout } = await gh({ args, cwd, input })
    return parseJson(stdout, what)
  } catch (err) {
    throw ghApiError(err, what)
  }
}

function apiPath(slug: RepoSlug, rest: string): string {
  return `repos/${slug.owner}/${slug.repo}/${rest}`
}

/** อ่าน comment ที่มีอยู่แล้วของ PR — ดึงตอนเปิดหน้า + ตอนกดปุ่ม refresh เท่านั้น ไม่ poll */
export async function loadComments(run: RunSummary, gh: GhRunner): Promise<CommentsResponse> {
  const viewer = await ghViewer(gh, run.repoPath)
  const slug = await repoSlug(run, gh)
  const [review, issue] = await Promise.all([
    ghJson(
      gh,
      run.repoPath,
      ['api', '--paginate', apiPath(slug, `pulls/${run.pr.number}/comments`)],
      'อ่าน review comment ของ PR',
    ),
    ghJson(
      gh,
      run.repoPath,
      ['api', '--paginate', apiPath(slug, `issues/${run.pr.number}/comments`)],
      'อ่าน comment ของ PR',
    ),
  ])
  return {
    runId: run.id,
    prNumber: run.pr.number,
    commit: run.commit,
    viewer,
    review: (Array.isArray(review) ? (review as RawComment[]) : []).map((raw) => toComment(raw, 'review')),
    issue: (Array.isArray(issue) ? (issue as RawComment[]) : []).map((raw) => toComment(raw, 'issue')),
  }
}

/** ของที่มาจาก body ของ request — ยังไม่ผ่านการตรวจ (ทุก field เป็น unknown โดยตั้งใจ) */
export type NewComment = Record<string, unknown>

function requireBody(value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw ApiError.badRequest('empty_comment', 'comment ว่าง — เขียนข้อความก่อนส่ง')
  }
  return value
}

function optionalLine(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null
  const line = Number(value)
  if (!Number.isInteger(line) || line < 1) {
    throw ApiError.badRequest('bad_line', `บรรทัด "${String(value)}" ไม่ใช่เลขบรรทัดที่ใช้ได้`)
  }
  return line
}

/**
 * ส่ง comment ขึ้น GitHub — คืนของที่ GitHub สร้างจริง (ไม่ใช่ echo ของที่ส่งไป)
 * เพื่อให้ UI แสดง id/ลิงก์/เวลาที่ใช้แก้-ลบต่อได้ทันทีโดยไม่ต้อง refresh
 */
export async function createComment(
  run: RunSummary,
  gh: GhRunner,
  input: NewComment,
): Promise<CommentCreatedResponse> {
  const body = requireBody(input.body)
  const line = optionalLine(input.line)
  const rawPath = typeof input.path === 'string' && input.path !== '' ? input.path : null
  if ((rawPath === null) !== (line === null)) {
    throw ApiError.badRequest('bad_target', 'comment ผูกบรรทัดต้องส่งทั้ง path และ line')
  }

  await ghViewer(gh, run.repoPath)
  const slug = await repoSlug(run, gh)

  if (rawPath === null || line === null) {
    const created = await ghJson(
      gh,
      run.repoPath,
      ['api', '--method', 'POST', apiPath(slug, `issues/${run.pr.number}/comments`), '--input', '-'],
      'ส่ง comment ระดับ PR',
      JSON.stringify({ body }),
    )
    return {
      runId: run.id,
      comment: toComment(created as RawComment, 'issue'),
      fellBackToIssue: false,
      fallback: null,
    }
  }

  // loadDiff normalize path ให้ (posix, เทียบ root ของ repo) และปฏิเสธ path ที่หลุดออกนอก repo
  const diff = await loadDiff(run, rawPath)
  // "เทียบ diff ไม่ได้" กับ "บรรทัดอยู่นอก diff" เห็น hunks ว่างเหมือนกัน แต่คนละเรื่องกันคนละโลก —
  // เหมารวมเมื่อไรผู้ส่งจะได้เหตุผลที่ผิด (และ user story 2 เงียบ ๆ ใช้ไม่ได้ทั้งฟีเจอร์บน clone
  // ที่ยังไม่ได้ fetch base มา ซึ่งเป็นสถานะปกติของการ review PR ของคนอื่น)
  const comparable = diff.status !== 'unavailable'
  const inDiff = comparable && lineInDiff(diff.hunks, line)

  if (inDiff) {
    const created = await ghJson(
      gh,
      run.repoPath,
      ['api', '--method', 'POST', apiPath(slug, `pulls/${run.pr.number}/comments`), '--input', '-'],
      'ส่ง review comment',
      JSON.stringify({ body, commit_id: run.commit, path: diff.path, line, side: 'RIGHT' }),
    )
    return {
      runId: run.id,
      comment: toComment(created as RawComment, 'review'),
      fellBackToIssue: false,
      fallback: null,
    }
  }

  const link = permalink(slug, run.commit, diff.path, line)
  const created = await ghJson(
    gh,
    run.repoPath,
    ['api', '--method', 'POST', apiPath(slug, `issues/${run.pr.number}/comments`), '--input', '-'],
    'ส่ง comment ระดับ PR',
    JSON.stringify({ body: bodyWithPermalink(link, diff.path, line, body) }),
  )
  return {
    runId: run.id,
    comment: toComment(created as RawComment, 'issue'),
    fellBackToIssue: true,
    fallback: comparable
      ? { kind: 'outside-diff', reason: null }
      : { kind: 'diff-unavailable', reason: diff.reason ?? null },
  }
}

function commentPath(slug: RepoSlug, kind: PrCommentKind, id: number): string {
  return kind === 'review'
    ? apiPath(slug, `pulls/comments/${id}`)
    : apiPath(slug, `issues/comments/${id}`)
}

export function parseCommentKind(raw: string): PrCommentKind {
  if (raw === 'review' || raw === 'issue') return raw
  throw ApiError.badRequest('bad_comment_kind', `ชนิด comment "${raw}" ไม่ถูกต้อง (review หรือ issue เท่านั้น)`)
}

export function parseCommentId(raw: string): number {
  const id = Number(raw)
  if (!Number.isInteger(id) || id <= 0) {
    throw ApiError.badRequest('bad_comment_id', `id ของ comment ("${raw}") ไม่ถูกต้อง`)
  }
  return id
}

/** แก้ comment — GitHub เป็นผู้ตัดสินสิทธิ์ (แก้ได้เฉพาะของบัญชีตัวเอง) viewer แค่ส่งต่อ error */
export async function editComment(
  run: RunSummary,
  gh: GhRunner,
  kind: PrCommentKind,
  id: number,
  input: Record<string, unknown>,
): Promise<{ runId: string; comment: PrComment }> {
  const body = requireBody(input.body)
  await ghViewer(gh, run.repoPath)
  const slug = await repoSlug(run, gh)
  const updated = await ghJson(
    gh,
    run.repoPath,
    ['api', '--method', 'PATCH', commentPath(slug, kind, id), '--input', '-'],
    'แก้ comment',
    JSON.stringify({ body }),
  )
  return { runId: run.id, comment: toComment(updated as RawComment, kind) }
}

/** ลบ comment — การยืนยันก่อนลบเป็นหน้าที่ของ UI ที่นี่ลบตามคำสั่งอย่างเดียว */
export async function removeComment(
  run: RunSummary,
  gh: GhRunner,
  kind: PrCommentKind,
  id: number,
): Promise<{ runId: string; deleted: { kind: PrCommentKind; id: number } }> {
  await ghViewer(gh, run.repoPath)
  const slug = await repoSlug(run, gh)
  try {
    await gh({ args: ['api', '--method', 'DELETE', commentPath(slug, kind, id)], cwd: run.repoPath })
  } catch (err) {
    throw ghApiError(err, 'ลบ comment')
  }
  return { runId: run.id, deleted: { kind, id } }
}
