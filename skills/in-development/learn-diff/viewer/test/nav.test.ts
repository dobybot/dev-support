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
import { clearIndexCache } from '../server/nav/index-store'
import { registerRun } from '../server/registry'
import type {
  DefinitionResponse,
  ReferencesResponse,
} from '../server/nav/types'

/**
 * test/nav.test.ts — CONTRACT-f12 §5 (agent B) — HTTP API seam เดียวกับ test/api.test.ts / test/diff.test.ts
 *
 * ไฟล์นี้ append ต่อได้ตามภาษา — describe block นี้ครอบเฉพาะ Vue SFC (issue #36 user story 15)
 * ภาษาอื่น (python/typescript) เป็น describe block แยกที่ agent อื่นเขียนเพิ่ม — ห้ามเขียนทับ
 */

const exec = promisify(execFile)

let tmpRoot: string
let repoPath: string
let commit: string
let server: http.Server
let baseUrl: string

async function git(...args: string[]): Promise<string> {
  const { stdout } = await exec('git', ['-C', repoPath, ...args])
  return stdout.trim()
}

async function write(rel: string, body: string): Promise<void> {
  const target = path.join(repoPath, rel)
  await fs.mkdir(path.dirname(target), { recursive: true })
  await fs.writeFile(target, body, 'utf8')
}

async function getDefinition(
  runId: string,
  query: { path: string; line: number; col: number },
): Promise<{ status: number; body: unknown }> {
  const q = new URLSearchParams({
    path: query.path,
    line: String(query.line),
    col: String(query.col),
  })
  const res = await fetch(`${baseUrl}/api/runs/${runId}/definition?${q.toString()}`)
  return { status: res.status, body: (await res.json()) as unknown }
}

async function getReferences(
  runId: string,
  query: { path: string; line: number; col: number },
): Promise<{ status: number; body: unknown }> {
  const q = new URLSearchParams({
    path: query.path,
    line: String(query.line),
    col: String(query.col),
  })
  const res = await fetch(`${baseUrl}/api/runs/${runId}/references?${q.toString()}`)
  return { status: res.status, body: (await res.json()) as unknown }
}

/** หา column 1-based ของ occurrence ที่ index (0-based) ของ needle ในบรรทัด line — กันพิมพ์เลขคอลัมน์ผิดมือ */
function colOf(line: string, needle: string, occurrence = 0): number {
  let idx = -1
  for (let i = 0; i <= occurrence; i++) {
    idx = line.indexOf(needle, idx + 1)
  }
  if (idx < 0) throw new Error(`ไม่เจอ "${needle}" ใน "${line}"`)
  return idx + 1
}

describe('code navigation — Vue SFC (CONTRACT-f12 §1, issue #36 user story 15)', () => {
  const CORE_TS = ['export function greet(name: string): string {', '  return `hello ${name}`', '}', ''].join(
    '\n',
  )

  // template อยู่ก่อน script โดยตั้งใจ — พิสูจน์ line offset ของ vue.ts ถูกจริง ไม่ใช่แค่บล็อก script อยู่บรรทัดแรก
  const WIDGET_VUE = [
    '<template>',
    '  <div>{{ msg }}</div>',
    '</template>',
    '',
    '<script setup lang="ts">',
    "import { greet } from './core'",
    '',
    '// greet is called here — comment ต้องไม่นับเป็น occurrence',
    "const label = 'greet'", // string literal ต้องไม่นับเป็น occurrence เช่นกัน
    "const msg = greet('world')",
    '</script>',
    '',
  ].join('\n')

  const OTHER_VUE = [
    '<script setup lang="ts">',
    "import { greet } from './core'",
    '',
    "const shout = greet('again').toUpperCase()",
    '</script>',
  ].join('\n')

  // ชื่อตรงแต่เป็น definition ของตัวเอง ไม่เชื่อมกับ src/core.ts — ต้องนับเป็น unconfirmed
  const DECOY_VUE = [
    '<script setup lang="ts">',
    'function greet(): void {',
    '  console.log("hi")',
    '}',
    'greet()',
    '</script>',
  ].join('\n')

  const LEFT_VUE = [
    '<script setup lang="ts">',
    'export function helper(): number {',
    '  return 1',
    '}',
    '</script>',
  ].join('\n')

  const RIGHT_VUE = [
    '<script setup lang="ts">',
    'export function helper(): number {',
    '  return 2',
    '}',
    '</script>',
  ].join('\n')

  // ไม่ import อะไร ไม่มี local def ชื่อ helper — ต้องกลายเป็น ambiguous ชี้ทั้ง left/right
  const CALLER_VUE = ['<script setup lang="ts">', 'const x = helper()', '</script>'].join('\n')

  // เรียกชื่อที่ไม่มี definition ในทั้ง repo เลย — ต้องเป็น resolution: none
  const LONELY_VUE = ['<script setup lang="ts">', 'const y = undefinedSymbolXyz()', '</script>'].join('\n')

  beforeAll(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'learn-diff-nav-'))
    process.env.LEARN_DIFF_HOME = path.join(tmpRoot, 'home')
    repoPath = path.join(tmpRoot, 'repo')
    await fs.mkdir(repoPath, { recursive: true })

    await git('init', '-q', '-b', 'main')
    await git('config', 'user.email', 'test@example.com')
    await git('config', 'user.name', 'learn-diff test')
    await git('config', 'commit.gpgsign', 'false')
    await git('config', 'core.autocrlf', 'false')

    await write('src/core.ts', CORE_TS)
    await write('src/widget.vue', WIDGET_VUE)
    await write('src/other.vue', OTHER_VUE)
    await write('src/decoy.vue', DECOY_VUE)
    await write('src/left.vue', LEFT_VUE)
    await write('src/right.vue', RIGHT_VUE)
    await write('src/caller.vue', CALLER_VUE)
    await write('src/lonely.vue', LONELY_VUE)
    await git('add', '-A')
    await git('commit', '-qm', 'fixture นำทาง vue')
    commit = await git('rev-parse', 'HEAD')

    const contentDir = path.join(repoPath, '.learn-diff', 'pr-36-nav')
    await fs.mkdir(contentDir, { recursive: true })
    await fs.writeFile(
      path.join(contentDir, 'run.json'),
      JSON.stringify({
        schemaVersion: 1,
        id: 'pr-36-nav',
        title: 'fixture nav',
        pr: { number: 36, title: 'nav' },
        commit,
        generatedAt: '2026-08-06T09:00:00+07:00',
        sections: [{ id: 'index', title: 'ภาพรวม', kind: 'index' }],
      }),
      'utf8',
    )
    await registerRun({
      id: 'pr-36-nav',
      repoPath,
      contentDir: path.join('.learn-diff', 'pr-36-nav'),
      commit,
      pr: { number: 36, title: 'nav' },
      title: 'fixture nav',
      createdAt: '2026-08-06T09:00:00+07:00',
    })

    clearFileCache()
    clearGitCache()
    clearIndexCache()
    const handler = createApiHandler()
    server = http.createServer((req, res) => handler(req, res))
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })

  afterAll(async () => {
    clearFileCache()
    clearGitCache()
    clearIndexCache()
    await new Promise<void>((resolve) => server.close(() => resolve()))
    await fs.rm(tmpRoot, { recursive: true, force: true })
  })

  describe('GET /api/runs/:id/definition', () => {
    it('resolve exact ข้ามจากการเรียกใน <script setup> ของ .vue ไปยัง definition ใน .ts ผ่าน import', async () => {
      const callLine = WIDGET_VUE.split('\n')[9] // "const msg = greet('world')"
      const line = 10 // 1-based บรรทัดที่ 10 ของไฟล์ .vue จริง (มี template อยู่ข้างบน)
      const col = colOf(callLine, 'greet')

      const { status, body } = await getDefinition('pr-36-nav', { path: 'src/widget.vue', line, col })
      expect(status).toBe(200)
      const res = body as DefinitionResponse
      expect(res.symbol).toBe('greet')
      expect(res.resolution).toBe('exact')
      expect(res.resolved).not.toBeNull()
      expect(res.resolved?.path).toBe('src/core.ts')
      expect(res.resolved?.kind).toBe('function')
      expect(res.resolved?.language).toBe('typescript')
      expect(res.resolved?.line).toBe(1)
      expect(res.resolved?.from).toBe(1)
      expect(res.resolved?.to).toBe(3)
      // candidates ส่งมาเสมอแม้ resolve ได้แล้ว (รองรับปุ่ม show all) — ต้องมี core.ts รวมอยู่
      expect(res.candidates.some((c) => c.path === 'src/core.ts')).toBe(true)
    })

    it('ตำแหน่งใน comment ไม่ถือเป็น identifier — ตอบ no_symbol_at_position', async () => {
      const commentLine = WIDGET_VUE.split('\n')[7] // "// greet is called here — ..."
      const col = colOf(commentLine, 'greet')
      const { status, body } = await getDefinition('pr-36-nav', {
        path: 'src/widget.vue',
        line: 8,
        col,
      })
      expect(status).toBe(422)
      expect(body).toMatchObject({ error: { code: 'no_symbol_at_position' } })
    })

    it('ตำแหน่งใน string literal ไม่ถือเป็น identifier — ตอบ no_symbol_at_position', async () => {
      const stringLine = WIDGET_VUE.split('\n')[8] // "const label = 'greet'"
      const col = colOf(stringLine, 'greet')
      const { status, body } = await getDefinition('pr-36-nav', {
        path: 'src/widget.vue',
        line: 9,
        col,
      })
      expect(status).toBe(422)
      expect(body).toMatchObject({ error: { code: 'no_symbol_at_position' } })
    })

    it('ไม่มี local def และ import resolve ไม่ได้ แต่ทั้ง repo มีชื่อตรงมากกว่าหนึ่ง → ambiguous พร้อม candidate ครบ', async () => {
      const callLine = CALLER_VUE.split('\n')[1] // "const x = helper()"
      const col = colOf(callLine, 'helper')
      const { status, body } = await getDefinition('pr-36-nav', {
        path: 'src/caller.vue',
        line: 2,
        col,
      })
      expect(status).toBe(200)
      const res = body as DefinitionResponse
      expect(res.symbol).toBe('helper')
      expect(res.resolution).toBe('ambiguous')
      expect(res.resolved).toBeNull()
      expect(res.candidates.map((c) => c.path).sort()).toEqual(['src/left.vue', 'src/right.vue'])
    })

    it('ไม่มี definition ชื่อนี้ในทั้ง repo เลย → resolution: none', async () => {
      const callLine = LONELY_VUE.split('\n')[1] // "const y = undefinedSymbolXyz()"
      const col = colOf(callLine, 'undefinedSymbolXyz')
      const { status, body } = await getDefinition('pr-36-nav', {
        path: 'src/lonely.vue',
        line: 2,
        col,
      })
      expect(status).toBe(200)
      const res = body as DefinitionResponse
      expect(res.resolution).toBe('none')
      expect(res.resolved).toBeNull()
      expect(res.candidates).toEqual([])
    })
  })

  describe('GET /api/runs/:id/references', () => {
    it('แบ่งชั้น confident (import เชื่อมถึง) กับ unconfirmed (ชื่อตรงแต่ยืนยันไม่ได้) และไม่ตัดอะไรทิ้ง', async () => {
      // cursor อยู่ที่ตัว definition เองใน src/core.ts
      const defLine = CORE_TS.split('\n')[0]
      const col = colOf(defLine, 'greet')

      const { status, body } = await getReferences('pr-36-nav', { path: 'src/core.ts', line: 1, col })
      expect(status).toBe(200)
      const res = body as ReferencesResponse
      expect(res.symbol).toBe('greet')
      expect(res.definition?.path).toBe('src/core.ts')

      const paths = res.groups.map((g) => g.path)
      // จัดกลุ่มตามไฟล์เรียง path asc
      expect(paths).toEqual([...paths].sort())
      expect(paths).toEqual(['src/core.ts', 'src/decoy.vue', 'src/other.vue', 'src/widget.vue'])

      const byPath = Object.fromEntries(res.groups.map((g) => [g.path, g]))

      // core.ts เอง (definition) + other.vue + widget.vue import เชื่อมถึง → confident
      expect(byPath['src/core.ts'].refs.every((r) => r.confidence === 'confident')).toBe(true)
      expect(byPath['src/other.vue'].refs.every((r) => r.confidence === 'confident')).toBe(true)
      expect(byPath['src/widget.vue'].refs.every((r) => r.confidence === 'confident')).toBe(true)
      expect(byPath['src/widget.vue'].language).toBe('vue')

      // decoy.vue มี "greet" ชื่อตรงแต่เป็น local def ของตัวเอง ไม่เชื่อม import ถึง core.ts → unconfirmed ทั้งหมด
      expect(byPath['src/decoy.vue'].refs.length).toBeGreaterThan(0)
      expect(byPath['src/decoy.vue'].refs.every((r) => r.confidence === 'unconfirmed')).toBe(true)

      // total รวมทุกชั้น ไม่มีอะไรถูกตัดทิ้ง (ห้ามซ่อน unconfirmed)
      const sum = res.groups.reduce((n, g) => n + g.refs.length, 0)
      expect(res.total).toBe(sum)

      // line offset ถูก — widget.vue มี template ก่อน script 4 บรรทัด บรรทัดเรียกจริงคือ 10
      const widgetHit = byPath['src/widget.vue'].refs.find((r) => r.line === 10)
      expect(widgetHit).toBeDefined()
      expect(widgetHit?.context).toContain("greet('world')")

      // comment/string ใน widget.vue ต้องไม่ถูกนับเป็น reference เลย (บรรทัด 8, 9)
      expect(byPath['src/widget.vue'].refs.some((r) => r.line === 8)).toBe(false)
      expect(byPath['src/widget.vue'].refs.some((r) => r.line === 9)).toBe(false)
    })

    it('ไม่มี definition ให้ยึด → เจอแค่ occurrence ของตัวเอง ทั้งหมดเป็น unconfirmed ไม่ error', async () => {
      const callLine = LONELY_VUE.split('\n')[1]
      const col = colOf(callLine, 'undefinedSymbolXyz')
      const { status, body } = await getReferences('pr-36-nav', {
        path: 'src/lonely.vue',
        line: 2,
        col,
      })
      expect(status).toBe(200)
      const res = body as ReferencesResponse
      expect(res.definition).toBeNull()
      // symbol ไม่มี definition ใน repo → ไม่มีอะไรถูกยืนยันได้ ทุก occurrence (แค่ตัวมันเอง) เป็น unconfirmed
      const sum = res.groups.reduce((n, g) => n + g.refs.length, 0)
      expect(res.total).toBe(sum)
      expect(res.total).toBe(1)
      expect(res.groups).toEqual([
        {
          path: 'src/lonely.vue',
          language: 'vue',
          refs: [expect.objectContaining({ line: 2, confidence: 'unconfirmed' })],
        },
      ])
    })
  })
})

/**
 * describe block ภาษา Python — ตัวแปร/helper ประกาศ local ในนี้ทั้งหมด (ไม่แตะ
 * tmpRoot/repoPath/commit/server/baseUrl/git()/write() ของ block Vue ด้านบน) เพื่อไม่ชนกับ
 * agent อื่นที่เขียน block นั้นมาก่อน — เขต B ตาม CONTRACT-f12 §5
 */
describe('code navigation — python (CONTRACT-f12 §1, issue #36)', () => {
  let tmpRootPy: string
  let repoPathPy: string
  let commitPy: string
  let serverPy: http.Server
  let baseUrlPy: string
  const runId = 'pr-20-nav-python'

  async function gitPy(...args: string[]): Promise<string> {
    const { stdout } = await exec('git', ['-C', repoPathPy, ...args])
    return stdout.trim()
  }

  async function writePy(rel: string, body: string): Promise<void> {
    const target = path.join(repoPathPy, rel)
    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.writeFile(target, body, 'utf8')
  }

  async function get(url: string): Promise<{ status: number; body: unknown }> {
    const res = await fetch(`${baseUrlPy}${url}`)
    return { status: res.status, body: (await res.json()) as unknown }
  }

  function navUrl(
    kind: 'definition' | 'references',
    p: { path: string; line: number | string; col: number | string },
  ): string {
    const q = new URLSearchParams({ path: p.path, line: String(p.line), col: String(p.col) })
    return `/api/runs/${runId}/${kind}?${q.toString()}`
  }

  beforeAll(async () => {
    tmpRootPy = await fs.mkdtemp(path.join(os.tmpdir(), 'learn-diff-nav-py-'))
    process.env.LEARN_DIFF_HOME = path.join(tmpRootPy, 'home')
    repoPathPy = path.join(tmpRootPy, 'repo')
    await fs.mkdir(repoPathPy, { recursive: true })

    await gitPy('init', '-q', '-b', 'main')
    await gitPy('config', 'user.email', 'test@example.com')
    await gitPy('config', 'user.name', 'learn-diff test')
    await gitPy('config', 'commit.gpgsign', 'false')
    await gitPy('config', 'core.autocrlf', 'false')

    // definition จริง — call site จะ import จากที่นี่
    await writePy(
      'app/models.py',
      [
        'def make_widget(name):',
        '    "ทำ widget ใหม่ ชื่อซ้ำมีที่ other/decoy.py ด้วยเจตนา"',
        '    return {"name": name}',
        '',
      ].join('\n'),
    )
    // ชื่อชนกัน (decoy) — resolve ต้องข้ามตัวนี้เพราะ import ชี้ app.models ไม่ใช่ other.decoy
    await writePy(
      'other/decoy.py',
      ['def make_widget(name):', '    # decoy — ไม่ควรถูกเลือก', '    return None', ''].join('\n'),
    )
    // call site: import แบบ from ... import ... แล้วเรียกใช้
    await writePy(
      'app/service.py',
      [
        'from app.models import make_widget',
        '',
        'def build(name):',
        '    # เรียก make_widget ในคอมเมนต์นี้ไม่ควรนับเป็น reference',
        '    widget = make_widget(name)',
        '    return widget',
        '',
      ].join('\n'),
    )
    // reference อีกจุดผ่าน alias import (`as mw`) — ต้อง resolve ผ่าน import binding ได้เหมือนกัน
    await writePy(
      'app/other_caller.py',
      ['from app.models import make_widget as mw', '', 'def again():', '    return mw("x")', ''].join('\n'),
    )
    // ชื่อ make_widget ปรากฏใน string literal ล้วน — ไม่ควรนับเป็น occurrence เลย
    await writePy('app/notes.py', ['LABEL = "make_widget เอาไว้เขียนโน้ต"', ''].join('\n'))
    // ไม่รองรับภาษา — ไว้ยิงกรณี unsupported_language
    await writePy('README.md', '# demo\n')

    await gitPy('add', '-A')
    await gitPy('commit', '-qm', 'fixture python nav')
    commitPy = await gitPy('rev-parse', 'HEAD')

    const contentDir = path.join(repoPathPy, '.learn-diff', runId)
    await fs.mkdir(contentDir, { recursive: true })
    await fs.writeFile(
      path.join(contentDir, 'run.json'),
      JSON.stringify({
        schemaVersion: 1,
        id: runId,
        title: 'fixture nav python',
        pr: { number: 20, title: 'nav python' },
        commit: commitPy,
        generatedAt: '2026-08-06T09:00:00+07:00',
        sections: [{ id: 'index', title: 'ภาพรวม', kind: 'index' }],
      }),
      'utf8',
    )

    await registerRun({
      id: runId,
      repoPath: repoPathPy,
      contentDir: path.relative(repoPathPy, contentDir),
      commit: commitPy,
      pr: { number: 20, title: 'nav python' },
      title: 'fixture nav python',
      createdAt: '2026-08-06T09:00:00+07:00',
    })

    clearFileCache()
    clearGitCache()
    clearIndexCache()
    const handler = createApiHandler()
    serverPy = http.createServer((req, res) => handler(req, res))
    await new Promise<void>((resolve) => serverPy.listen(0, '127.0.0.1', resolve))
    baseUrlPy = `http://127.0.0.1:${(serverPy.address() as AddressInfo).port}`

    // trigger index build ล่วงหน้า (เหมือน client เปิด run) กันเทสต์แรกรอ cold start ของ tree-sitter
    await get(`/api/runs/${runId}`)
  })

  afterAll(async () => {
    clearFileCache()
    clearGitCache()
    clearIndexCache()
    await new Promise<void>((resolve) => serverPy.close(() => resolve()))
    await fs.rm(tmpRootPy, { recursive: true, force: true })
  })

  it('definition: F12 บน call site ชี้ app/models.py แบบ exact ทั้งที่มีชื่อชนกันที่ other/decoy.py', async () => {
    const { status, body } = await get(navUrl('definition', { path: 'app/service.py', line: 5, col: 15 }))
    expect(status).toBe(200)
    const res = body as DefinitionResponse
    expect(res.symbol).toBe('make_widget')
    expect(res.resolution).toBe('exact')
    expect(res.resolved?.path).toBe('app/models.py')
    expect(res.resolved?.kind).toBe('function')
    // candidates ส่งครบทั้ง repo แม้ resolve ได้แล้ว (ปุ่ม show all)
    expect(res.candidates.map((c) => c.path).sort()).toEqual(['app/models.py', 'other/decoy.py'])
  })

  it('definition: cursor บนชื่อ def เอง (local definition ในไฟล์เดียวกัน) ชี้ตัวเองแบบ exact', async () => {
    const { status, body } = await get(navUrl('definition', { path: 'app/models.py', line: 1, col: 5 }))
    expect(status).toBe(200)
    const res = body as DefinitionResponse
    expect(res.resolution).toBe('exact')
    expect(res.resolved).toMatchObject({ path: 'app/models.py', line: 1 })
  })

  it('definition: symbol ที่ไม่มี def ที่ไหนใน repo เลยตอบ none', async () => {
    // "widget" เป็นแค่ตัวแปร local ใน function ไม่ใช่ module-level variable — ไม่มี Definition ผูกไว้
    const { status, body } = await get(navUrl('definition', { path: 'app/service.py', line: 5, col: 6 }))
    expect(status).toBe(200)
    const res = body as DefinitionResponse
    expect(res.symbol).toBe('widget')
    expect(res.resolution).toBe('none')
    expect(res.resolved).toBeNull()
    expect(res.candidates).toEqual([])
  })

  it('references: จัดกลุ่มตามไฟล์ path asc และแยกชั้น confident/unconfirmed ไม่มีอะไรถูกตัดทิ้ง', async () => {
    const { status, body } = await get(navUrl('references', { path: 'app/models.py', line: 1, col: 5 }))
    expect(status).toBe(200)
    const res = body as ReferencesResponse
    expect(res.symbol).toBe('make_widget')
    expect(res.definition?.path).toBe('app/models.py')

    const paths = res.groups.map((g) => g.path)
    expect(paths).toEqual([...paths].sort())
    expect(paths).toContain('app/models.py')
    expect(paths).toContain('app/service.py')

    // decoy.py มี def ชื่อเดียวกันแต่ไม่ import จาก app.models — ยังต้องโผล่เป็น unconfirmed ไม่ใช่หายไปเงียบ ๆ
    const decoy = res.groups.find((g) => g.path === 'other/decoy.py')
    expect(decoy).toBeDefined()
    expect(decoy?.refs.every((r) => r.confidence === 'unconfirmed')).toBe(true)

    const service = res.groups.find((g) => g.path === 'app/service.py')
    expect(service?.refs.every((r) => r.confidence === 'confident')).toBe(true)

    const models = res.groups.find((g) => g.path === 'app/models.py')
    expect(models?.refs.every((r) => r.confidence === 'confident')).toBe(true)

    const sum = res.groups.reduce((n, g) => n + g.refs.length, 0)
    expect(res.total).toBe(sum)
  })

  it('references: ตำแหน่งในคอมเมนต์ไม่นับเป็น occurrence — เหลือแค่บรรทัด import กับบรรทัดเรียกจริง', async () => {
    const { body } = await get(navUrl('references', { path: 'app/models.py', line: 1, col: 5 }))
    const res = body as ReferencesResponse
    // app/service.py มีคำว่า make_widget อยู่ 3 จุดในซอร์ส: บรรทัด import, ในคอมเมนต์, และบรรทัดเรียกจริง
    // — คอมเมนต์ต้องไม่นับ เหลือแค่ import (identifier ของ import binding เอง) + เรียกจริง = 2
    const service = res.groups.find((g) => g.path === 'app/service.py')
    expect(service?.refs).toHaveLength(2)
    const contexts = service?.refs.map((r) => r.context) ?? []
    expect(contexts.some((c) => c.includes('from app.models import make_widget'))).toBe(true)
    expect(contexts.some((c) => c.includes('widget = make_widget(name)'))).toBe(true)
    expect(contexts.some((c) => c.includes('เรียก make_widget ในคอมเมนต์'))).toBe(false)

    // app/notes.py มีคำว่า make_widget อยู่ใน string literal ล้วน — ไม่ควรปรากฏใน groups เลย
    expect(res.groups.map((g) => g.path)).not.toContain('app/notes.py')
  })

  // เดิมเทสต์นี้ยืนยันว่า alias import ได้ unconfirmed ตาม localName — เป็นบั๊ก (issue #36 user story 7/16):
  // บรรทัดนั้นคือ specifier ที่ import จากไฟล์ definition ตรง ๆ ชั้น "มั่นใจ" ต้องครอบมันด้วย
  it('references: alias import (`as mw`) — บรรทัด import เองนับเป็น occurrence และเป็น confident เพราะ importedName ชี้ไฟล์ definition ตรง ๆ', async () => {
    const { status, body } = await get(navUrl('references', { path: 'app/models.py', line: 1, col: 5 }))
    expect(status).toBe(200)
    const res = body as ReferencesResponse
    const other = res.groups.find((g) => g.path === 'app/other_caller.py')
    expect(other).toBeDefined()
    expect(other?.refs).toHaveLength(1)
    expect(other?.refs[0]?.confidence).toBe('confident')
  })

  it('error: ไฟล์ไม่รองรับภาษา (.md) ตอบ 422 unsupported_language', async () => {
    const { status, body } = await get(navUrl('definition', { path: 'README.md', line: 1, col: 1 }))
    expect(status).toBe(422)
    expect(body).toMatchObject({ error: { code: 'unsupported_language' } })
  })

  it('error: บรรทัดเกินท้ายไฟล์ตอบ 400 bad_position', async () => {
    const { status, body } = await get(navUrl('definition', { path: 'app/models.py', line: 999, col: 1 }))
    expect(status).toBe(400)
    expect(body).toMatchObject({ error: { code: 'bad_position' } })
  })

  it('error: line=x (ไม่ใช่จำนวนเต็ม) ตอบ 400 bad_position', async () => {
    const { status, body } = await get(navUrl('definition', { path: 'app/models.py', line: 'x', col: 1 }))
    expect(status).toBe(400)
    expect(body).toMatchObject({ error: { code: 'bad_position' } })
  })

  it('error: ตำแหน่งเป็น whitespace ไม่มี identifier ตอบ 422 no_symbol_at_position', async () => {
    // บรรทัด 2 ของ app/models.py คือ docstring ที่ขึ้นต้นด้วยช่องว่างเยื้อง 4 ตัว — col 1 อยู่บน
    // whitespace เยื้องนั้นเอง ไม่ใช่ตัวอักษรของ docstring (ซึ่งเริ่มที่ col 5) — ไม่ใช้บรรทัด
    // ว่างท้ายไฟล์ (line เกิน splitLines จริง หลัง trailing newline) เพราะ locate() ตัดสินเป็น
    // bad_position ก่อนถึง symbolAt เสียก่อน (บั๊กใน server/nav/resolve.ts นอกเขตของไฟล์นี้)
    const { status, body } = await get(navUrl('definition', { path: 'app/models.py', line: 2, col: 1 }))
    expect(status).toBe(422)
    expect(body).toMatchObject({ error: { code: 'no_symbol_at_position' } })
  })

  it('error: path หลุดออกนอก repo ตอบ 400 (reuse repoRelativePath เดิม — contract §1.3 เขียน bad_file_path แต่ resolver เดิมมี code ของตัวเอง)', async () => {
    const { status, body } = await get(
      navUrl('definition', { path: '../../../../etc/passwd', line: 1, col: 1 }),
    )
    expect(status).toBe(400)
    expect((body as { error: { code: string } }).error.code).toMatch(/path/)
  })
})

describe('code navigation — TypeScript (CONTRACT-f12 §1, issue #36 user stories 1-3, 6-8, 11-13, 16)', () => {
  // ตัวแปรของ describe block นี้ scope อยู่ในนี้เอง (ไม่ใช้ module-level let ร่วมกับ block ภาษาอื่น
  // ที่อยู่ในไฟล์เดียวกัน — กัน conflict ตอน agent หลายภาษาเขียนไฟล์นี้พร้อมกัน)
  let tsTmpRoot: string
  let tsRepoPath: string
  let tsCommit: string
  let tsServer: http.Server
  let tsBaseUrl: string

  async function tsGit(...args: string[]): Promise<string> {
    const { stdout } = await exec('git', ['-C', tsRepoPath, ...args])
    return stdout.trim()
  }

  async function tsWrite(rel: string, body: string): Promise<void> {
    const target = path.join(tsRepoPath, rel)
    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.writeFile(target, body, 'utf8')
  }

  async function tsNav(
    kind: 'definition' | 'references',
    runId: string,
    params: Record<string, string>,
  ): Promise<{ status: number; body: unknown }> {
    const res = await fetch(
      `${tsBaseUrl}/api/runs/${runId}/${kind}?${new URLSearchParams(params).toString()}`,
    )
    return { status: res.status, body: (await res.json()) as unknown }
  }

  const CORE_TS = [
    '// core module',
    'export function makeWidget(name: string): string {',
    '  return `widget:${name}`',
    '}',
    '',
    'export class Decoy {}',
    '',
  ].join('\n')

  const UTILS_TS = [
    "import { makeWidget } from './core'",
    '',
    '// เรียกผ่าน relative import',
    'export function build(): string {',
    '  return makeWidget("relative")',
    '}',
    '',
  ].join('\n')

  // alias '@/core' ต้อง resolve ผ่าน tsconfig paths
  const ALIASED_TS = [
    "import { makeWidget } from '@/core'",
    '',
    'export function buildAliased(): string {',
    '  // makeWidget ปรากฏใน comment ตรงนี้ด้วย ไม่ควรถูกนับเป็น reference',
    '  const msg = "call makeWidget somewhere" // และใน string ก็ไม่นับเหมือนกัน',
    '  return makeWidget("aliased") + msg',
    '}',
    '',
  ].join('\n')

  const TSCONFIG = JSON.stringify(
    { compilerOptions: { baseUrl: '.', paths: { '@/*': ['src/*'] } } },
    null,
    2,
  )

  // เรียกชื่อที่ไม่มี definition ในทั้ง repo เลย — ต้องเป็น resolution: none / total: 0 (ไม่ error)
  const LONELY_TS = ['export function callLonely(): void {', '  undefinedSymbolTsXyz()', '}', ''].join('\n')

  beforeAll(async () => {
    tsTmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'learn-diff-nav-ts-'))
    process.env.LEARN_DIFF_HOME = path.join(tsTmpRoot, 'home')
    tsRepoPath = path.join(tsTmpRoot, 'repo')
    await fs.mkdir(tsRepoPath, { recursive: true })

    await tsGit('init', '-q', '-b', 'main')
    await tsGit('config', 'user.email', 'test@example.com')
    await tsGit('config', 'user.name', 'learn-diff test')
    await tsGit('config', 'commit.gpgsign', 'false')

    await tsWrite('tsconfig.json', TSCONFIG)
    await tsWrite('src/core.ts', CORE_TS)
    await tsWrite('src/utils.ts', UTILS_TS)
    await tsWrite('src/aliased.ts', ALIASED_TS)
    await tsWrite('src/nothing.ts', 'export const unused = 1\n')
    await tsWrite('src/lonely.ts', LONELY_TS)

    await tsGit('add', '-A')
    await tsGit('commit', '-qm', 'commit ที่ pin ไว้')
    tsCommit = await tsGit('rev-parse', 'HEAD')

    const contentDir = path.join(tsRepoPath, '.learn-diff', 'pr-9-nav-ts')
    await fs.mkdir(contentDir, { recursive: true })
    await registerRun({
      id: 'pr-9-nav-ts',
      repoPath: tsRepoPath,
      contentDir: path.relative(tsRepoPath, contentDir),
      commit: tsCommit,
      pr: { number: 9, title: 'nav api ts' },
      title: 'fixture ts',
      createdAt: '2026-08-06T09:00:00+07:00',
    })

    clearFileCache()
    clearGitCache()
    clearIndexCache()
    tsServer = http.createServer(createApiHandler())
    await new Promise<void>((resolve) => tsServer.listen(0, '127.0.0.1', resolve))
    tsBaseUrl = `http://127.0.0.1:${(tsServer.address() as AddressInfo).port}`
  })

  afterAll(async () => {
    clearFileCache()
    clearGitCache()
    clearIndexCache()
    await new Promise<void>((resolve) => tsServer.close(() => resolve()))
    await fs.rm(tsTmpRoot, { recursive: true, force: true })
  })

  describe('GET /api/runs/:id/definition', () => {
    it('local definition ในไฟล์เดียวกัน → exact', async () => {
      // บรรทัด 6 คือ `export class Decoy {}` — cursor วางบน `Decoy`
      const { status, body } = await tsNav('definition', 'pr-9-nav-ts', {
        path: 'src/core.ts',
        line: '6',
        col: '15',
      })
      expect(status).toBe(200)
      const res = body as DefinitionResponse
      expect(res.symbol).toBe('Decoy')
      expect(res.resolution).toBe('exact')
      expect(res.resolved?.path).toBe('src/core.ts')
      expect(res.resolved?.kind).toBe('class')
    })

    it('relative import ชี้ module ต้นทาง → exact', async () => {
      // บรรทัด 5 ของ utils.ts: `  return makeWidget("relative")`
      const { status, body } = await tsNav('definition', 'pr-9-nav-ts', {
        path: 'src/utils.ts',
        line: '5',
        col: '10',
      })
      expect(status).toBe(200)
      const res = body as DefinitionResponse
      expect(res.symbol).toBe('makeWidget')
      expect(res.resolution).toBe('exact')
      expect(res.resolved?.path).toBe('src/core.ts')
      expect(res.resolved?.line).toBe(2)
      expect(res.candidates.length).toBeGreaterThanOrEqual(1)
    })

    it('tsconfig paths alias (@/core) ชี้ module ต้นทาง → exact', async () => {
      // บรรทัด 6 ของ aliased.ts: `  return makeWidget("aliased") + msg`
      const { status, body } = await tsNav('definition', 'pr-9-nav-ts', {
        path: 'src/aliased.ts',
        line: '6',
        col: '10',
      })
      expect(status).toBe(200)
      const res = body as DefinitionResponse
      expect(res.symbol).toBe('makeWidget')
      expect(res.resolution).toBe('exact')
      expect(res.resolved?.path).toBe('src/core.ts')
    })

    it('ไม่มี definition ชื่อนี้ใน repo เลย → none', async () => {
      // บรรทัด 2 ของ lonely.ts: `  undefinedSymbolTsXyz()` — เรียกชื่อที่ไม่มี def ใน repo เลย
      const { status, body } = await tsNav('definition', 'pr-9-nav-ts', {
        path: 'src/lonely.ts',
        line: '2',
        col: '3',
      })
      expect(status).toBe(200)
      const res = body as DefinitionResponse
      expect(res.symbol).toBe('undefinedSymbolTsXyz')
      expect(res.resolution).toBe('none')
      expect(res.resolved).toBeNull()
      expect(res.candidates).toEqual([])
    })

    it('ตำแหน่งใน string/comment ไม่มี identifier → no_symbol_at_position', async () => {
      // บรรทัด 4 ของ aliased.ts เป็น comment ล้วน
      const inComment = await tsNav('definition', 'pr-9-nav-ts', {
        path: 'src/aliased.ts',
        line: '4',
        col: '30',
      })
      expect(inComment.status).toBe(422)
      expect((inComment.body as { error: { code: string } }).error.code).toBe('no_symbol_at_position')

      // บรรทัด 5 ของ aliased.ts มี "call makeWidget somewhere" อยู่ใน string literal
      const inString = await tsNav('definition', 'pr-9-nav-ts', {
        path: 'src/aliased.ts',
        line: '5',
        col: '30',
      })
      expect(inString.status).toBe(422)
      expect((inString.body as { error: { code: string } }).error.code).toBe('no_symbol_at_position')
    })

    it('นามสกุลไฟล์ที่ไม่รองรับ → unsupported_language', async () => {
      const { status, body } = await tsNav('definition', 'pr-9-nav-ts', {
        path: 'tsconfig.json',
        line: '1',
        col: '1',
      })
      expect(status).toBe(422)
      expect((body as { error: { code: string } }).error.code).toBe('unsupported_language')
    })

    it('บรรทัดเกินท้ายไฟล์ → bad_position', async () => {
      const { status, body } = await tsNav('definition', 'pr-9-nav-ts', {
        path: 'src/core.ts',
        line: '9999',
        col: '1',
      })
      expect(status).toBe(400)
      expect((body as { error: { code: string } }).error.code).toBe('bad_position')
    })
  })

  describe('GET /api/runs/:id/references', () => {
    it('จัดกลุ่มสองชั้น: ไฟล์ definition/import เป็น confident อย่างอื่นเป็น unconfirmed และไม่นับ string/comment', async () => {
      // cursor บน makeWidget ที่ definition ใน core.ts บรรทัด 2
      const { status, body } = await tsNav('references', 'pr-9-nav-ts', {
        path: 'src/core.ts',
        line: '2',
        col: '18',
      })
      expect(status).toBe(200)
      const res = body as ReferencesResponse
      expect(res.symbol).toBe('makeWidget')
      expect(res.definition?.path).toBe('src/core.ts')

      // ไฟล์ที่มี occurrence: core.ts (def เอง), utils.ts (import แล้วเรียก), aliased.ts (alias import แล้วเรียก)
      // — ไม่รวม occurrence ใน string/comment ของ aliased.ts
      const paths = res.groups.map((g) => g.path)
      expect(paths).toEqual(['src/aliased.ts', 'src/core.ts', 'src/utils.ts']) // path asc

      const core = res.groups.find((g) => g.path === 'src/core.ts')!
      expect(core.refs.every((r) => r.confidence === 'confident')).toBe(true)

      const utils = res.groups.find((g) => g.path === 'src/utils.ts')!
      // 2 occurrence: ตัว import binding เอง (บรรทัด 1) + call site จริง (บรรทัด 5)
      expect(utils.refs).toHaveLength(2)
      expect(utils.refs.every((r) => r.confidence === 'confident')).toBe(true)
      expect(utils.refs.map((r) => r.line)).toEqual([1, 5])

      const aliased = res.groups.find((g) => g.path === 'src/aliased.ts')!
      // 2 occurrence: import binding (บรรทัด 1) + call site จริง (บรรทัด 6)
      // — comment/string ที่มีคำว่า makeWidget (บรรทัด 4, 5) ต้องไม่ถูกนับ
      expect(aliased.refs).toHaveLength(2)
      expect(aliased.refs.every((r) => r.confidence === 'confident')).toBe(true)
      expect(aliased.refs.map((r) => r.line)).toEqual([1, 6])

      expect(res.total).toBe(core.refs.length + utils.refs.length + aliased.refs.length)
    })

    it('symbol ที่ไม่มี definition ในทั้ง repo เลย → เจอแค่ occurrence ของตัวเอง ทั้งหมดเป็น unconfirmed ไม่ error', async () => {
      const { status, body } = await tsNav('references', 'pr-9-nav-ts', {
        path: 'src/lonely.ts',
        line: '2',
        col: '3',
      })
      expect(status).toBe(200)
      const res = body as ReferencesResponse
      expect(res.definition).toBeNull()
      expect(res.total).toBe(1)
      expect(res.groups).toEqual([
        {
          path: 'src/lonely.ts',
          language: 'typescript',
          refs: [expect.objectContaining({ line: 2, confidence: 'unconfirmed' })],
        },
      ])
    })
  })
})

/**
 * Regression — python scope/import (finding 1-4 ของรอบรีวิว issue #36)
 *
 * ทุกเคสในนี้เคยตอบ "มั่นใจแต่ผิด" (`exact` ไปผิดตัว) หรือ "มองไม่เห็น" (ambiguous/none ทั้งที่
 * ข้อมูลมีครบใน index) — fixture ยิงผ่าน HTTP seam เดิม ไม่มี unit test แยกตาม §5
 */
describe('code navigation — regression python (scope + import chain)', () => {
  let tmp: string
  let repo: string
  let srv: http.Server
  let base: string
  const runId = 'pr-36-regress-py'

  async function g(...args: string[]): Promise<string> {
    const { stdout } = await exec('git', ['-C', repo, ...args])
    return stdout.trim()
  }

  async function w(rel: string, body: string): Promise<void> {
    const target = path.join(repo, rel)
    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.writeFile(target, body, 'utf8')
  }

  async function nav(
    kind: 'definition' | 'references',
    p: { path: string; line: number; col: number },
  ): Promise<{ status: number; body: unknown }> {
    const q = new URLSearchParams({ path: p.path, line: String(p.line), col: String(p.col) })
    const res = await fetch(`${base}/api/runs/${runId}/${kind}?${q.toString()}`)
    return { status: res.status, body: (await res.json()) as unknown }
  }

  // ชื่อ method ซ้ำข้าม class ในไฟล์เดียว — B.process อยู่ "เหนือ cursor" แต่คนละ scope
  const ORDER_PY = [
    'class B:',
    '    def process(self):',
    '        return "B"',
    '',
    'class A:',
    '    def run(self):',
    '        return self.process()',
    '    def process(self):',
    '        return "A"',
    '',
  ].join('\n')

  // nested def ที่ scope ปิดไปแล้ว ต้องไม่ชนะ module-level def
  const NESTED_PY = [
    'def helper():',
    '    return "module"',
    '',
    'def outer():',
    '    def helper():',
    '        return "inner"',
    '    return helper()',
    '',
    'def caller():',
    '    return helper()',
    '',
  ].join('\n')

  beforeAll(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'learn-diff-nav-rpy-'))
    process.env.LEARN_DIFF_HOME = path.join(tmp, 'home')
    repo = path.join(tmp, 'repo')
    await fs.mkdir(repo, { recursive: true })

    await g('init', '-q', '-b', 'main')
    await g('config', 'user.email', 'test@example.com')
    await g('config', 'user.name', 'learn-diff test')
    await g('config', 'commit.gpgsign', 'false')
    await g('config', 'core.autocrlf', 'false')

    await w('app/order.py', ORDER_PY)
    await w('app/nested.py', NESTED_PY)
    await w('app/models.py', ['class User:', '    pass', ''].join('\n'))
    // ชื่อ User ซ้ำอีกที่ — ทำให้ทุกเคสที่ resolve ไม่ได้ตกไป ambiguous อย่างชัดเจน
    await w('other/decoy.py', ['class User:', '    pass', ''].join('\n'))
    await w(
      'app/typing_user.py',
      [
        'from typing import TYPE_CHECKING',
        '',
        'if TYPE_CHECKING:',
        '    from app.models import User',
        '',
        'def take(u: "User"):',
        '    return User',
        '',
      ].join('\n'),
    )
    await w(
      'app/try_user.py',
      [
        'try:',
        '    from app.models import User',
        'except ImportError:',
        '    User = None',
        '',
        'def make():',
        '    return User()',
        '',
      ].join('\n'),
    )
    // re-export ผ่าน package
    await w('app/__init__.py', ['from app.models import User', ''].join('\n'))
    await w('app/via_pkg.py', ['from app import User', '', 'def build():', '    return User()', ''].join('\n'))
    // `from . import <module>` — ผูก module ไม่ใช่ symbol
    await w('app/rel.py', ['from . import models', '', 'def k():', '    return models.User()', ''].join('\n'))

    await g('add', '-A')
    await g('commit', '-qm', 'fixture regression python')
    const commitPy = await g('rev-parse', 'HEAD')

    const contentDir = path.join(repo, '.learn-diff', runId)
    await fs.mkdir(contentDir, { recursive: true })
    await registerRun({
      id: runId,
      repoPath: repo,
      contentDir: path.relative(repo, contentDir),
      commit: commitPy,
      pr: { number: 36, title: 'regression python' },
      title: 'fixture regression python',
      createdAt: '2026-08-06T09:00:00+07:00',
    })

    clearFileCache()
    clearGitCache()
    clearIndexCache()
    srv = http.createServer(createApiHandler())
    await new Promise<void>((resolve) => srv.listen(0, '127.0.0.1', resolve))
    base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`
  })

  afterAll(async () => {
    clearFileCache()
    clearGitCache()
    clearIndexCache()
    await new Promise<void>((resolve) => srv.close(() => resolve()))
    await fs.rm(tmp, { recursive: true, force: true })
  })

  it('finding 1: method ชื่อซ้ำข้าม class — self.process() ใน A ต้องไม่ไปโผล่ที่ B.process', async () => {
    const callLine = ORDER_PY.split('\n')[6]!
    const { status, body } = await nav('definition', {
      path: 'app/order.py',
      line: 7,
      col: colOf(callLine, 'process'),
    })
    expect(status).toBe(200)
    const res = body as DefinitionResponse
    expect(res.symbol).toBe('process')
    expect(res.resolved?.path).toBe('app/order.py')
    // B.process (บรรทัด 2) อยู่คนละ scope — ห้ามถูกเลือกแบบ exact เด็ดขาด
    expect(res.resolved?.line).not.toBe(2)
    expect(res.resolved?.line).toBe(8)
  })

  it('finding 1: nested def ที่ scope ปิดไปแล้วต้องไม่ชนะ module-level def', async () => {
    const callLine = NESTED_PY.split('\n')[9]!
    const { body } = await nav('definition', {
      path: 'app/nested.py',
      line: 10,
      col: colOf(callLine, 'helper'),
    })
    const res = body as DefinitionResponse
    expect(res.resolution).toBe('exact')
    expect(res.resolved?.path).toBe('app/nested.py')
    expect(res.resolved?.line).toBe(1)
  })

  it('finding 1: ใน outer() ตัว nested def ยังชนะ (scope ในสุดชนะ ไม่ใช่ตัดทิ้งหมด)', async () => {
    const callLine = NESTED_PY.split('\n')[6]!
    const { body } = await nav('definition', {
      path: 'app/nested.py',
      line: 7,
      col: colOf(callLine, 'helper'),
    })
    expect((body as DefinitionResponse).resolved?.line).toBe(5)
  })

  it('finding 2: import ใต้ if TYPE_CHECKING ถูกมองเห็น — definition exact และ reference เป็น confident', async () => {
    const { body } = await nav('definition', { path: 'app/typing_user.py', line: 7, col: 12 })
    const res = body as DefinitionResponse
    expect(res.symbol).toBe('User')
    expect(res.resolution).toBe('exact')
    expect(res.resolved?.path).toBe('app/models.py')

    const refs = (await nav('references', { path: 'app/models.py', line: 1, col: 7 }))
      .body as ReferencesResponse
    const group = refs.groups.find((g) => g.path === 'app/typing_user.py')
    expect(group?.refs.every((r) => r.confidence === 'confident')).toBe(true)
  })

  it('finding 2: import ใน try/except ImportError ก็เช่นกัน', async () => {
    const { body } = await nav('definition', { path: 'app/try_user.py', line: 7, col: 12 })
    const res = body as DefinitionResponse
    expect(res.resolution).toBe('exact')
    expect(res.resolved?.path).toBe('app/models.py')

    const refs = (await nav('references', { path: 'app/models.py', line: 1, col: 7 }))
      .body as ReferencesResponse
    const group = refs.groups.find((g) => g.path === 'app/try_user.py')
    expect(group?.refs.every((r) => r.confidence === 'confident')).toBe(true)
  })

  it('finding 3: re-export ผ่าน __init__.py ถูกไล่ต่อ — from app import User ชี้ app/models.py', async () => {
    const { body } = await nav('definition', { path: 'app/via_pkg.py', line: 4, col: 12 })
    const res = body as DefinitionResponse
    expect(res.resolution).toBe('exact')
    expect(res.resolved?.path).toBe('app/models.py')

    const refs = (await nav('references', { path: 'app/models.py', line: 1, col: 7 }))
      .body as ReferencesResponse
    const group = refs.groups.find((g) => g.path === 'app/via_pkg.py')
    expect(group?.refs.every((r) => r.confidence === 'confident')).toBe(true)
    // decoy ที่ไม่เชื่อมถึงกันยังต้องอยู่ครบในชั้น unconfirmed (ห้ามตัดทิ้ง)
    expect(refs.groups.find((g) => g.path === 'other/decoy.py')?.refs.length).toBeGreaterThan(0)
  })

  it('finding 4: `from . import models` resolve เป็นไฟล์ module ไม่ใช่ none', async () => {
    const { status, body } = await nav('definition', { path: 'app/rel.py', line: 4, col: 12 })
    expect(status).toBe(200)
    const res = body as DefinitionResponse
    expect(res.symbol).toBe('models')
    expect(res.resolution).toBe('exact')
    expect(res.resolved?.path).toBe('app/models.py')
  })
})

/**
 * Regression — TS/Vue scope, parameter, alias, barrel, template (finding 5-10 ของรอบรีวิว issue #36)
 */
describe('code navigation — regression TS/Vue', () => {
  let tmp: string
  let repo: string
  let srv: http.Server
  let base: string
  const runId = 'pr-36-regress-ts'

  async function g(...args: string[]): Promise<string> {
    const { stdout } = await exec('git', ['-C', repo, ...args])
    return stdout.trim()
  }

  async function w(rel: string, body: string): Promise<void> {
    const target = path.join(repo, rel)
    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.writeFile(target, body, 'utf8')
  }

  async function nav(
    kind: 'definition' | 'references',
    p: { path: string; line: number; col: number },
  ): Promise<{ status: number; body: unknown }> {
    const q = new URLSearchParams({ path: p.path, line: String(p.line), col: String(p.col) })
    const res = await fetch(`${base}/api/runs/${runId}/${kind}?${q.toString()}`)
    return { status: res.status, body: (await res.json()) as unknown }
  }

  const CORE_TS = ['export function makeWidget(name: string): string {', '  return name', '}', ''].join('\n')

  // local const ชื่อเดียวกันอยู่ "ใต้" cursor แต่คนละฟังก์ชัน — ต้องไม่กลบ import
  const LATE_LOCAL_TS = [
    "import { makeWidget } from './core'",
    '',
    'export function early(): string {',
    '  return makeWidget("early")',
    '}',
    '',
    'export function late(): number {',
    '  const makeWidget = 1',
    '  return makeWidget',
    '}',
    '',
  ].join('\n')

  // สลับลำดับ: local อยู่เหนือ cursor แต่ scope ปิดไปแล้ว
  const EARLY_LOCAL_TS = [
    "import { makeWidget } from './core'",
    '',
    'export function inner(): number {',
    '  const makeWidget = 2',
    '  return makeWidget',
    '}',
    '',
    'export function usesImport(): string {',
    '  return makeWidget("later")',
    '}',
    '',
  ].join('\n')

  const ALIAS_USE_TS = [
    "import { makeWidget as mw } from './core'",
    '',
    'export function viaAlias(): string {',
    '  return mw("alias")',
    '}',
    '',
  ].join('\n')

  const VIA_BARREL_TS = [
    "import { makeWidget } from './barrel'",
    '',
    'export function viaBarrel(): string {',
    '  return makeWidget("barrel")',
    '}',
    '',
  ].join('\n')

  // parameter ที่ชื่อชนกับ util ในไฟล์อื่น — F12 ต้องอยู่ในไฟล์ตัวเอง
  const PARAM_TS = ['export function k(uniqueThing: () => void): void {', '  uniqueThing()', '}', ''].join('\n')

  const SHADOW_VUE = [
    '<script setup lang="ts">',
    "import { makeWidget } from './core'",
    'function wrap(): string {',
    '  const makeWidget = (x: string) => x',
    "  return makeWidget('inner')",
    '}',
    'function other(): string {',
    "  return makeWidget('outer')",
    '}',
    '</script>',
  ].join('\n')

  const TEMPLATE_VUE = [
    '<template>',
    '  <button @click="doThing">{{ doThing }}</button>',
    '</template>',
    '<script setup lang="ts">',
    'function doThing(): void {}',
    '</script>',
  ].join('\n')

  beforeAll(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'learn-diff-nav-rts-'))
    process.env.LEARN_DIFF_HOME = path.join(tmp, 'home')
    repo = path.join(tmp, 'repo')
    await fs.mkdir(repo, { recursive: true })

    await g('init', '-q', '-b', 'main')
    await g('config', 'user.email', 'test@example.com')
    await g('config', 'user.name', 'learn-diff test')
    await g('config', 'commit.gpgsign', 'false')
    await g('config', 'core.autocrlf', 'false')

    await w('src/core.ts', CORE_TS)
    // ชื่อซ้ำอีกที่ — เคสที่ resolve ไม่ได้ต้องเห็นเป็น ambiguous ไม่ใช่บังเอิญเหลือตัวเดียว
    await w('src/decoy.ts', ['export function makeWidget(): string {', '  return "decoy"', '}', ''].join('\n'))
    await w('src/late-local.ts', LATE_LOCAL_TS)
    await w('src/early-local.ts', EARLY_LOCAL_TS)
    await w('src/alias-use.ts', ALIAS_USE_TS)
    await w('src/barrel/index.ts', "export { makeWidget } from '../core'\n")
    await w('src/via-barrel.ts', VIA_BARREL_TS)
    await w('src/only-def.ts', 'export function uniqueThing(): void {}\n')
    await w('src/param.ts', PARAM_TS)
    await w('src/shadow.vue', SHADOW_VUE)
    await w('src/template.vue', TEMPLATE_VUE)

    await g('add', '-A')
    await g('commit', '-qm', 'fixture regression ts/vue')
    const commitTs = await g('rev-parse', 'HEAD')

    const contentDir = path.join(repo, '.learn-diff', runId)
    await fs.mkdir(contentDir, { recursive: true })
    await registerRun({
      id: runId,
      repoPath: repo,
      contentDir: path.relative(repo, contentDir),
      commit: commitTs,
      pr: { number: 36, title: 'regression ts' },
      title: 'fixture regression ts',
      createdAt: '2026-08-06T09:00:00+07:00',
    })

    clearFileCache()
    clearGitCache()
    clearIndexCache()
    srv = http.createServer(createApiHandler())
    await new Promise<void>((resolve) => srv.listen(0, '127.0.0.1', resolve))
    base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`
  })

  afterAll(async () => {
    clearFileCache()
    clearGitCache()
    clearIndexCache()
    await new Promise<void>((resolve) => srv.close(() => resolve()))
    await fs.rm(tmp, { recursive: true, force: true })
  })

  it('finding 5: local const ในอีกฟังก์ชัน (อยู่ใต้ cursor) ต้องไม่กลบ import', async () => {
    const line = LATE_LOCAL_TS.split('\n')[3]!
    const { body } = await nav('definition', {
      path: 'src/late-local.ts',
      line: 4,
      col: colOf(line, 'makeWidget'),
    })
    const res = body as DefinitionResponse
    expect(res.resolution).toBe('exact')
    expect(res.resolved?.path).toBe('src/core.ts')
    expect(res.resolved?.line).toBe(1)
  })

  it('finding 5: local const ในอีกฟังก์ชัน (อยู่เหนือ cursor) ก็ต้องไม่กลบ import', async () => {
    const line = EARLY_LOCAL_TS.split('\n')[8]!
    const { body } = await nav('definition', {
      path: 'src/early-local.ts',
      line: 9,
      col: colOf(line, 'makeWidget'),
    })
    const res = body as DefinitionResponse
    expect(res.resolution).toBe('exact')
    expect(res.resolved?.path).toBe('src/core.ts')
  })

  it('finding 5: ไฟล์ definition จริงต้องเป็น confident ไม่ใช่ตกชั้นเพราะ local ปลอมของไฟล์อื่น', async () => {
    const { body } = await nav('references', {
      path: 'src/core.ts',
      line: 1,
      col: colOf(CORE_TS.split('\n')[0]!, 'makeWidget'),
    })
    const res = body as ReferencesResponse
    expect(res.definition?.path).toBe('src/core.ts')
    const byPath = Object.fromEntries(res.groups.map((group) => [group.path, group]))
    expect(byPath['src/core.ts']?.refs.every((r) => r.confidence === 'confident')).toBe(true)
    expect(byPath['src/late-local.ts']?.refs.every((r) => r.confidence === 'confident')).toBe(true)
  })

  it('finding 6: parameter เป็น definition — F12 บน callback ไม่กระโดดออกนอกไฟล์', async () => {
    const { body } = await nav('definition', {
      path: 'src/param.ts',
      line: 2,
      col: colOf(PARAM_TS.split('\n')[1]!, 'uniqueThing'),
    })
    const res = body as DefinitionResponse
    expect(res.resolved?.path).toBe('src/param.ts')
    expect(res.resolved?.line).toBe(1)
    // ตัว util ชื่อเดียวกันยังอยู่ใน candidates ให้กด show all ได้
    expect(res.candidates.map((c) => c.path)).toContain('src/only-def.ts')
  })

  it('finding 7: alias import (`as mw`) ทำให้ไฟล์นั้นเป็น confident ไม่ใช่ unconfirmed ทั้งไฟล์', async () => {
    const { body } = await nav('references', {
      path: 'src/core.ts',
      line: 1,
      col: colOf(CORE_TS.split('\n')[0]!, 'makeWidget'),
    })
    const res = body as ReferencesResponse
    const alias = res.groups.find((group) => group.path === 'src/alias-use.ts')
    expect(alias?.refs).toHaveLength(1)
    expect(alias?.refs.every((r) => r.confidence === 'confident')).toBe(true)
  })

  it('finding 8: barrel re-export ถูกไล่ต่อหนึ่ง hop — exact ไปถึง core.ts และ reference เป็น confident', async () => {
    const { body } = await nav('definition', {
      path: 'src/via-barrel.ts',
      line: 4,
      col: colOf(VIA_BARREL_TS.split('\n')[3]!, 'makeWidget'),
    })
    const res = body as DefinitionResponse
    expect(res.resolution).toBe('exact')
    expect(res.resolved?.path).toBe('src/core.ts')

    const refs = (
      await nav('references', {
        path: 'src/core.ts',
        line: 1,
        col: colOf(CORE_TS.split('\n')[0]!, 'makeWidget'),
      })
    ).body as ReferencesResponse
    const viaBarrel = refs.groups.find((group) => group.path === 'src/via-barrel.ts')
    expect(viaBarrel?.refs.every((r) => r.confidence === 'confident')).toBe(true)
  })

  it('finding 9: shadowing ใน .vue ไม่รั่วข้าม scope — ตัวนอกไปที่ import ตัวในไปที่ local', async () => {
    const outer = (
      await nav('definition', {
        path: 'src/shadow.vue',
        line: 8,
        col: colOf(SHADOW_VUE.split('\n')[7]!, 'makeWidget'),
      })
    ).body as DefinitionResponse
    expect(outer.resolution).toBe('exact')
    expect(outer.resolved?.path).toBe('src/core.ts')

    const inner = (
      await nav('definition', {
        path: 'src/shadow.vue',
        line: 5,
        col: colOf(SHADOW_VUE.split('\n')[4]!, 'makeWidget'),
      })
    ).body as DefinitionResponse
    expect(inner.resolved?.path).toBe('src/shadow.vue')
    expect(inner.resolved?.line).toBe(4)
  })

  it('finding 10: references ของฟังก์ชันใน <script setup> นับการเรียกจาก template ด้วย', async () => {
    const { status, body } = await nav('references', {
      path: 'src/template.vue',
      line: 5,
      col: colOf(TEMPLATE_VUE.split('\n')[4]!, 'doThing'),
    })
    expect(status).toBe(200)
    const res = body as ReferencesResponse
    const group = res.groups.find((g) => g.path === 'src/template.vue')
    // 1 = definition เอง + 2 จุดใน template (`@click` กับ interpolation)
    expect(group?.refs.map((r) => r.line)).toEqual([2, 2, 5])
    expect(res.total).toBe(3)
  })
})

/**
 * adjudication finding 1 — เส้น "ทั้ง module" ที่หายไป: `export * from` (TS),
 * `from m import *` และ `import pkg.core` แบบ qualified (Python) — CONTRACT-f12 §2.4
 * ทุก fixture มี decoy ชื่อซ้ำอีกไฟล์ เพื่อปิด fallback "ทั้ง repo มีชื่อนี้ที่เดียว"
 */
describe('code navigation — star re-export / wildcard / module-qualified import', () => {
  let tmp: string
  let repo: string
  let srv: http.Server
  let base: string
  const runId = 'pr-36-star-reexport'

  async function g(...args: string[]): Promise<string> {
    const { stdout } = await exec('git', ['-C', repo, ...args])
    return stdout.trim()
  }

  async function w(rel: string, body: string): Promise<void> {
    const target = path.join(repo, rel)
    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.writeFile(target, body, 'utf8')
  }

  async function nav(
    kind: 'definition' | 'references',
    p: { path: string; line: number; col: number },
  ): Promise<{ status: number; body: unknown }> {
    const q = new URLSearchParams({ path: p.path, line: String(p.line), col: String(p.col) })
    const res = await fetch(`${base}/api/runs/${runId}/${kind}?${q.toString()}`)
    return { status: res.status, body: (await res.json()) as unknown }
  }

  const DEEP_TS = ['export function deepFn(): string {', '  return "deep"', '}', ''].join('\n')
  const ALIAS_USER_TS = [
    "import { deepFn } from '@/barrel'",
    '',
    'export function useDeep(): string {',
    '  return deepFn()',
    '}',
    '',
  ].join('\n')
  const NS_USER_TS = [
    "import { ns } from './ns-barrel'",
    '',
    'export function useNs(): string {',
    '  return ns.deepFn()',
    '}',
    '',
  ].join('\n')

  const CORE_PY = ['def make_thing(n):', '    return n * 2', ''].join('\n')
  const STAR_PY = ['from .core import *', '', '', 'def star_use():', '    return make_thing(1)', ''].join('\n')
  const MOD_IMPORT_PY = ['import pkg.core', '', '', 'def qualified_use():', '    return pkg.core.make_thing(3)', ''].join('\n')

  beforeAll(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'learn-diff-nav-star-'))
    process.env.LEARN_DIFF_HOME = path.join(tmp, 'home')
    repo = path.join(tmp, 'repo')
    await fs.mkdir(repo, { recursive: true })

    await g('init', '-q', '-b', 'main')
    await g('config', 'user.email', 'test@example.com')
    await g('config', 'user.name', 'learn-diff test')
    await g('config', 'commit.gpgsign', 'false')
    await g('config', 'core.autocrlf', 'false')

    await w('tsconfig.json', JSON.stringify({ compilerOptions: { baseUrl: '.', paths: { '@/*': ['src/*'] } } }))
    await w('src/deep.ts', DEEP_TS)
    await w('src/decoy.ts', ['export function deepFn(): string {', '  return "decoy"', '}', ''].join('\n'))
    await w('src/mid.ts', "export { deepFn } from './deep'\n")
    await w('src/barrel.ts', "export * from './mid'\n")
    await w('src/ns-barrel.ts', "export * as ns from './deep'\n")
    await w('src/alias-user.ts', ALIAS_USER_TS)
    await w('src/ns-user.ts', NS_USER_TS)

    await w('pkg/__init__.py', '')
    await w('pkg/core.py', CORE_PY)
    await w('pkg/decoy_home.py', ['def make_thing(x):', '    return x', ''].join('\n'))
    await w('pkg/star.py', STAR_PY)
    await w('app/mod_import.py', MOD_IMPORT_PY)

    await g('add', '-A')
    await g('commit', '-qm', 'fixture star re-export')
    const head = await g('rev-parse', 'HEAD')

    const contentDir = path.join(repo, '.learn-diff', runId)
    await fs.mkdir(contentDir, { recursive: true })
    await registerRun({
      id: runId,
      repoPath: repo,
      contentDir: path.relative(repo, contentDir),
      commit: head,
      pr: { number: 36, title: 'star re-export' },
      title: 'fixture star re-export',
      createdAt: '2026-08-06T09:00:00+07:00',
    })

    clearFileCache()
    clearGitCache()
    clearIndexCache()
    srv = http.createServer(createApiHandler())
    await new Promise<void>((resolve) => srv.listen(0, '127.0.0.1', resolve))
    base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`
  })

  afterAll(async () => {
    clearFileCache()
    clearGitCache()
    clearIndexCache()
    await new Promise<void>((resolve) => srv.close(() => resolve()))
    await fs.rm(tmp, { recursive: true, force: true })
  })

  it('TS: import ผ่าน barrel ที่ `export * from` (ผ่าน tsconfig alias) → exact ถึงไฟล์ definition จริง', async () => {
    const { body } = await nav('definition', {
      path: 'src/alias-user.ts',
      line: 4,
      col: colOf(ALIAS_USER_TS.split('\n')[3]!, 'deepFn'),
    })
    const res = body as DefinitionResponse
    expect(res.resolution).toBe('exact')
    expect(res.resolved?.path).toBe('src/deep.ts')
    expect(res.resolved?.line).toBe(1)
  })

  it('TS: references ของ deepFn — ไฟล์ที่ import ผ่าน star barrel เป็น confident', async () => {
    const { body } = await nav('references', {
      path: 'src/deep.ts',
      line: 1,
      col: colOf(DEEP_TS.split('\n')[0]!, 'deepFn'),
    })
    const res = body as ReferencesResponse
    expect(res.definition?.path).toBe('src/deep.ts')
    const aliasUser = res.groups.find((group) => group.path === 'src/alias-user.ts')
    expect(aliasUser?.refs).toHaveLength(2)
    expect(aliasUser?.refs.every((r) => r.confidence === 'confident')).toBe(true)
    // decoy ชื่อซ้ำต้องยังเป็น unconfirmed — star ไม่ทำให้ทุกไฟล์กลายเป็น confident มั่ว
    const decoy = res.groups.find((group) => group.path === 'src/decoy.ts')
    expect(decoy?.refs.every((r) => r.confidence === 'unconfirmed')).toBe(true)
  })

  it('TS: `export * as ns from` ผูกชื่อ ns — F12 บน ns พาไปที่ module ต้นทาง', async () => {
    const { body } = await nav('definition', {
      path: 'src/ns-user.ts',
      line: 4,
      col: colOf(NS_USER_TS.split('\n')[3]!, 'ns', 0),
    })
    const res = body as DefinitionResponse
    expect(res.resolution).toBe('exact')
    expect(res.resolved?.path).toBe('src/deep.ts')
  })

  it('Python: `from .core import *` แล้วเรียกชื่อ → exact ถึง pkg/core.py', async () => {
    const { body } = await nav('definition', {
      path: 'pkg/star.py',
      line: 5,
      col: colOf(STAR_PY.split('\n')[4]!, 'make_thing'),
    })
    const res = body as DefinitionResponse
    expect(res.resolution).toBe('exact')
    expect(res.resolved?.path).toBe('pkg/core.py')
  })

  it('Python: `import pkg.core` แล้วใช้แบบ qualified → exact ถึง pkg/core.py', async () => {
    const { body } = await nav('definition', {
      path: 'app/mod_import.py',
      line: 5,
      col: colOf(MOD_IMPORT_PY.split('\n')[4]!, 'make_thing'),
    })
    const res = body as DefinitionResponse
    expect(res.resolution).toBe('exact')
    expect(res.resolved?.path).toBe('pkg/core.py')
  })

  it('Python: references ของ make_thing — ทั้งไฟล์ star และไฟล์ module-qualified เป็น confident', async () => {
    const { body } = await nav('references', {
      path: 'pkg/core.py',
      line: 1,
      col: colOf(CORE_PY.split('\n')[0]!, 'make_thing'),
    })
    const res = body as ReferencesResponse
    expect(res.definition?.path).toBe('pkg/core.py')
    const byPath = Object.fromEntries(res.groups.map((group) => [group.path, group]))
    expect(byPath['pkg/star.py']?.refs.every((r) => r.confidence === 'confident')).toBe(true)
    expect(byPath['app/mod_import.py']?.refs.every((r) => r.confidence === 'confident')).toBe(true)
    expect(byPath['pkg/decoy_home.py']?.refs.every((r) => r.confidence === 'unconfirmed')).toBe(true)
  })
})
