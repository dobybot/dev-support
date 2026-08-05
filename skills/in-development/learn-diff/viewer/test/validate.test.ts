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
import { scanPage } from '../server/scan'
import type { ContentWarning, RunData, RunResponse } from '../src/shared/types'

/**
 * validation warnings ยิงผ่าน HTTP surface เดียวกับที่แอปใช้ (SPEC-v3 → Testing Decisions)
 *
 * นี่คือเหตุผลที่ validation อยู่ฝั่ง server: "กดแล้วไม่มีอะไรเกิดขึ้น" กลายเป็น assertion
 * ต่อ JSON ที่ API ตอบ ไม่ใช่การไล่คลิกใน DOM · fixture เป็น git repo จริง เพราะข้อหนึ่งที่ตรวจคือ
 * ช่วงบรรทัดที่ commit ที่ pin ไว้
 */

const exec = promisify(execFile)

let tmpRoot: string
let repoPath: string
let commit: string
let contentDir: string
let server: http.Server
let baseUrl: string

/** 12 บรรทัด — ช่วงที่เกิน 12 ต้องกลายเป็น warning */
const CORE_TS = Array.from({ length: 12 }, (_, i) => `export const line${i + 1} = ${i + 1}`).join('\n') + '\n'

const DIAGRAM = ['flowchart TB', '  ENQ[ตัวจ่ายงาน]', '  RUN[ตัวทำงาน]', '  ENQ --> RUN', '  class ENQ changed'].join('\n')

async function git(...args: string[]): Promise<string> {
  const { stdout } = await exec('git', ['-C', repoPath, ...args])
  return stdout.trim()
}

async function get(url: string): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${baseUrl}${url}`)
  return { status: res.status, body: (await res.json()) as unknown }
}

async function warningsOf(runId: string): Promise<ContentWarning[]> {
  const { status, body } = await get(`/api/runs/${runId}`)
  expect(status).toBe(200)
  return (body as RunResponse).warnings
}

function codes(warnings: ContentWarning[]): string[] {
  return warnings.map((w) => w.code)
}

function find(warnings: ContentWarning[], code: string): ContentWarning | undefined {
  return warnings.find((w) => w.code === code)
}

/** เขียน run ใหม่ลง repo เดียวกัน (repo = git repo จริง, content dir = โฟลเดอร์ของ run) */
async function writeRun(id: string, data: RunData, pages: Record<string, string>): Promise<void> {
  const dir = path.join(repoPath, '.learn-diff', id)
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(path.join(dir, 'run.json'), JSON.stringify(data, null, 2), 'utf8')
  for (const [file, body] of Object.entries(pages)) {
    await fs.writeFile(path.join(dir, file), body, 'utf8')
  }
  await registerRun({
    id,
    repoPath,
    contentDir: path.join('.learn-diff', id),
    commit,
    pr: { number: 7, title: id },
    title: id,
    createdAt: '2026-08-04T09:00:00+07:00',
  })
}

function runData(overrides: Partial<RunData> = {}): RunData {
  return {
    schemaVersion: 1,
    id: 'x',
    title: 'ทดสอบการตรวจ',
    pr: { number: 7, title: 'validate' },
    commit,
    generatedAt: '2026-08-04T09:00:00+07:00',
    sections: [{ id: 'index', title: 'ภาพรวม', kind: 'index' }],
    ...overrides,
  }
}

beforeAll(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'learn-diff-validate-'))
  process.env.LEARN_DIFF_HOME = path.join(tmpRoot, 'home')
  repoPath = path.join(tmpRoot, 'repo')
  await fs.mkdir(path.join(repoPath, 'src'), { recursive: true })

  await git('init', '-q', '-b', 'main')
  await git('config', 'user.email', 'test@example.com')
  await git('config', 'user.name', 'learn-diff test')
  await git('config', 'commit.gpgsign', 'false')
  await git('config', 'core.autocrlf', 'false')
  await fs.writeFile(path.join(repoPath, 'src', 'core.ts'), CORE_TS, 'utf8')
  await git('add', '-A')
  await git('commit', '-qm', 'commit ที่ pin ไว้')
  commit = await git('rev-parse', 'HEAD')

  contentDir = path.join(repoPath, '.learn-diff')

  // run ที่ทุกอย่างสอดคล้องกัน — ต้องไม่มี warning เลย
  await writeRun(
    'pr-ok',
    runData({
      id: 'pr-ok',
      sections: [
        { id: 'index', title: 'ภาพรวม', kind: 'index' },
        { id: '01-core', title: '01 — แกนหลัก', readingList: 'rl-core' },
      ],
      boxMap: [{ id: 'core', title: 'แกนหลัก', box: 'whitebox', reason: 'ตรรกะหลัก', section: '01-core' }],
      readingLists: [
        {
          id: 'rl-core',
          title: 'แกนหลัก',
          spans: [{ path: 'src/core.ts', from: 1, to: 5, kind: 'changed', why: 'จุดเริ่ม' }],
        },
        {
          id: 'rl-runner',
          title: 'ตัวทำงาน',
          spans: [{ path: 'src/core.ts', from: 6, to: 12, kind: 'context', why: 'ของเดิมที่ถูกเรียก' }],
        },
      ],
      nodeMap: { ENQ: 'rl-core', RUN: 'rl-runner' },
    }),
    {
      'index.md': `# ภาพรวม\n\n\`\`\`mermaid\n${DIAGRAM}\n\`\`\`\n`,
      '01-core.md': '# แกนหลัก\n\nดูที่ :file[core.ts]{path="src/core.ts" lines="3-4"}\n',
    },
  )

  // run ที่พังทุกแบบที่ตั๋วนี้ต้องจับได้
  await writeRun(
    'pr-broken',
    runData({
      id: 'pr-broken',
      sections: [
        { id: 'index', title: 'ภาพรวม', kind: 'index' },
        { id: '01-core', title: '01 — แกนหลัก', readingList: 'rl-missing' },
      ],
      boxMap: [
        {
          id: 'core',
          title: 'แกนหลัก',
          box: 'whitebox',
          reason: 'ตรรกะหลัก',
          section: '01-core',
          readingList: 'rl-also-missing',
        },
      ],
      readingLists: [
        {
          id: 'rl-orphan',
          title: 'ไม่มีใครอ้าง',
          spans: [{ path: 'src/core.ts', from: 1, to: 2, kind: 'changed', why: 'ช่วงที่ไม่มีใครเปิด' }],
        },
        {
          id: 'rl-range',
          title: 'ช่วงเกินไฟล์',
          spans: [
            { path: 'src/core.ts', from: 90, to: 120, kind: 'changed', why: 'เลยท้ายไฟล์' },
            { path: 'src/gone.ts', from: 1, to: 3, kind: 'context', why: 'ไฟล์ที่ไม่มีใน commit นี้' },
          ],
        },
      ],
      nodeMap: { ENQ: 'rl-range', GHOST: 'rl-range' },
    }),
    {
      'index.md': `# ภาพรวม\n\n\`\`\`mermaid\n${DIAGRAM}\n\`\`\`\n`,
      '01-core.md': '# แกนหลัก\n\nอ่านต่อที่ :read[ลำดับที่หายไป]{list="rl-prose-missing"}\n',
    },
  )

  // run ที่ยังเขียนไม่จบ — การเช็ค "ไม่มีใครอ้าง / ไม่มีในไดอะแกรม" ยังตัดสินไม่ได้
  await writeRun(
    'pr-pending',
    runData({
      id: 'pr-pending',
      sections: [
        { id: 'index', title: 'ภาพรวม', kind: 'index' },
        { id: '01-core', title: '01 — แกนหลัก' },
      ],
      readingLists: [
        {
          id: 'rl-later',
          title: 'จะถูกอ้างในหน้าที่ยังไม่เขียน',
          spans: [{ path: 'src/core.ts', from: 1, to: 2, kind: 'changed', why: 'รอหน้า 01' }],
        },
      ],
      nodeMap: { LATER: 'rl-later' },
    }),
    { 'index.md': '# ภาพรวม\n' },
  )

  // run ที่ commit ยังไม่มีในเครื่อง — ตรวจช่วงบรรทัดไม่ได้ ต้องบอกครั้งเดียว ไม่ใช่ทุกช่วง
  const unfetched = 'a'.repeat(40)
  await writeRun(
    'pr-unfetched',
    runData({
      id: 'pr-unfetched',
      commit: unfetched,
      readingLists: [
        {
          id: 'rl-a',
          title: 'a',
          spans: [
            { path: 'src/core.ts', from: 1, to: 2, kind: 'changed', why: 'x' },
            { path: 'src/other.ts', from: 1, to: 2, kind: 'context', why: 'y' },
          ],
        },
      ],
      sections: [{ id: 'index', title: 'ภาพรวม', kind: 'index', readingList: 'rl-a' }],
    }),
    { 'index.md': '# ภาพรวม\n' },
  )
  await registerRun({
    id: 'pr-unfetched',
    repoPath,
    contentDir: path.join('.learn-diff', 'pr-unfetched'),
    commit: unfetched,
    pr: { number: 8, title: 'unfetched' },
    title: 'ยังไม่ fetch',
    createdAt: '2026-08-04T09:00:00+07:00',
  })

  const handler = createApiHandler()
  server = http.createServer((req, res) => handler(req, res))
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
  clearFileCache()
  clearGitCache()
  await new Promise<void>((resolve) => server.close(() => resolve()))
  await fs.rm(tmpRoot, { recursive: true, force: true })
})

describe('run ที่สอดคล้องกันทั้งหมด', () => {
  it('ไม่มี warning เลย', async () => {
    expect(await warningsOf('pr-ok')).toEqual([])
  })

  it('content dir ของ fixture อยู่ใน repo จริง (กันเทสต์ผ่านเพราะอ่านผิดที่)', async () => {
    const { body } = await get('/api/runs/pr-ok')
    expect((body as RunResponse).run.contentDir).toBe(path.join(contentDir, 'pr-ok'))
    expect((body as RunResponse).written).toEqual(['index', '01-core'])
  })
})

describe('reading list ที่อ้างถึงแต่ไม่มีจริง', () => {
  it('จับได้ทั้งจาก section, box map และ `:read` ในเนื้อความ', async () => {
    const warnings = (await warningsOf('pr-broken')).filter((w) => w.code === 'reading_list_not_found')
    expect(warnings.map((w) => w.where).sort()).toEqual([
      '01-core',
      'boxMap[core].readingList',
      'sections[01-core].readingList',
    ])
    expect(warnings.map((w) => w.message).join('\n')).toContain('rl-prose-missing')
  })

  it('nodeMap ที่ชี้ไป id ที่ไม่มีนิยาม ก็เป็น warning เหมือนกัน', async () => {
    await writeRun(
      'pr-node-missing',
      runData({
        id: 'pr-node-missing',
        nodeMap: { ENQ: 'rl-nope' },
        sections: [{ id: 'index', title: 'ภาพรวม', kind: 'index' }],
      }),
      { 'index.md': `\`\`\`mermaid\n${DIAGRAM}\n\`\`\`\n` },
    )
    const warnings = await warningsOf('pr-node-missing')
    expect(find(warnings, 'reading_list_not_found')?.where).toBe('nodeMap[ENQ]')
  })
})

describe('นิยามที่ไม่มีใครอ้าง', () => {
  it('เป็น warning เมื่อทุกหน้าเขียนครบแล้ว', async () => {
    const warnings = (await warningsOf('pr-broken')).filter(
      (w) => w.code === 'reading_list_unreferenced',
    )
    expect(warnings.map((w) => w.where)).toEqual(['readingLists[rl-orphan]'])
  })

  it('เงียบไว้ก่อนถ้ายังมีหน้าที่ agent เขียนไม่เสร็จ', async () => {
    const warnings = await warningsOf('pr-pending')
    expect(codes(warnings)).not.toContain('reading_list_unreferenced')
    expect(codes(warnings)).not.toContain('diagram_node_not_found')
  })
})

describe('node id ที่ไม่มีในไดอะแกรม', () => {
  it('บอกว่า id ไหนสะกดไม่ตรง', async () => {
    const warning = find(await warningsOf('pr-broken'), 'diagram_node_not_found')
    expect(warning?.where).toBe('nodeMap[GHOST]')
    expect(warning?.message).toContain('GHOST')
  })

  it('node ที่มีอยู่จริงไม่ถูกเตือน', async () => {
    const warnings = await warningsOf('pr-broken')
    expect(warnings.filter((w) => w.code === 'diagram_node_not_found')).toHaveLength(1)
  })

  it('subgraph ไม่ใช่ node ที่กดได้ — ข้อความต้องบอกให้ชี้ node ข้างในแทน', async () => {
    const withSubgraph = [
      'flowchart TB',
      '  subgraph SYS [ระบบเดิม]',
      '    A[ตัวหนึ่ง]',
      '  end',
      '  A --> B[ตัวสอง]',
    ].join('\n')
    await writeRun(
      'pr-subgraph',
      runData({
        id: 'pr-subgraph',
        nodeMap: { SYS: 'rl-a' },
        readingLists: [
          { id: 'rl-a', title: 'a', spans: [{ path: 'src/core.ts', from: 1, to: 1, kind: 'changed', why: 'x' }] },
        ],
        sections: [{ id: 'index', title: 'ภาพรวม', kind: 'index' }],
      }),
      { 'index.md': `\`\`\`mermaid\n${withSubgraph}\n\`\`\`\n` },
    )
    const warning = find(await warningsOf('pr-subgraph'), 'diagram_node_not_found')
    expect(warning?.message).toContain('subgraph')
  })
})

describe('ช่วงบรรทัดที่ resolve ไม่ได้ที่ commit ที่ pin ไว้', () => {
  it('ช่วงที่เลยท้ายไฟล์บอกจำนวนบรรทัดจริง', async () => {
    const warning = find(await warningsOf('pr-broken'), 'range_not_found')
    expect(warning?.where).toBe('readingLists[rl-range].spans[0]')
    expect(warning?.message).toContain('12 บรรทัด')
  })

  it('ไฟล์ที่ไม่มีใน commit นี้แยกออกจากช่วงที่เกิน', async () => {
    const warning = find(await warningsOf('pr-broken'), 'file_not_found')
    expect(warning?.where).toBe('readingLists[rl-range].spans[1]')
    expect(warning?.message).toContain('src/gone.ts')
  })

  it('`:file` ในเนื้อความก็ถูกตรวจด้วย', async () => {
    await writeRun(
      'pr-prose-range',
      runData({
        id: 'pr-prose-range',
        sections: [{ id: 'index', title: 'ภาพรวม', kind: 'index' }],
      }),
      { 'index.md': '# ภาพรวม\n\nดูที่ :file[core.ts]{path="src/core.ts" lines="200-210"}\n' },
    )
    const warning = find(await warningsOf('pr-prose-range'), 'range_not_found')
    expect(warning?.where).toBe('index')
    expect(warning?.message).toContain('200–210')
  })

  it('เลขบรรทัดที่ไม่ใช่จำนวนเต็ม / ช่วงกลับหัว ถูกจับก่อนเทียบกับไฟล์', async () => {
    await writeRun(
      'pr-bad-range',
      runData({
        id: 'pr-bad-range',
        sections: [{ id: 'index', title: 'ภาพรวม', kind: 'index', readingList: 'rl-a' }],
        readingLists: [
          {
            id: 'rl-a',
            title: 'a',
            spans: [
              { path: 'src/core.ts', from: 8, to: 3, kind: 'changed', why: 'กลับหัว' },
              // ค่าที่หลุด type มาจากดิสก์ได้จริง — ต้องไม่ถูกเอาไปเทียบมั่ว ๆ
              { path: 'src/core.ts', from: '2' as unknown as number, to: 4, kind: 'context', why: 'สตริง' },
            ],
          },
        ],
      }),
      { 'index.md': '# ภาพรวม\n' },
    )
    const warnings = await warningsOf('pr-bad-range')
    expect(codes(warnings)).toEqual(['bad_range', 'bad_range'])
    expect(warnings[0].where).toBe('readingLists[rl-a].spans[0]')
  })

  it('path ที่หลุดออกนอก repo ถูกเตือน ไม่ใช่ปล่อยไปให้พังตอนกด', async () => {
    await writeRun(
      'pr-escape',
      runData({
        id: 'pr-escape',
        sections: [{ id: 'index', title: 'ภาพรวม', kind: 'index', readingList: 'rl-a' }],
        readingLists: [
          {
            id: 'rl-a',
            title: 'a',
            spans: [{ path: '../../etc/hosts', from: 1, to: 2, kind: 'context', why: 'x' }],
          },
        ],
      }),
      { 'index.md': '# ภาพรวม\n' },
    )
    expect(codes(await warningsOf('pr-escape'))).toContain('path_escape')
  })

  it('commit ที่ยังไม่มีในเครื่อง เตือนครั้งเดียวแล้วข้ามทั้งชุด', async () => {
    const warnings = await warningsOf('pr-unfetched')
    expect(codes(warnings)).toEqual(['range_check_unavailable'])
    expect(warnings[0].message).toContain('git fetch')
  })
})

describe('นิยาม reading list ที่เขียนพลาด', () => {
  it('id ซ้ำ และ list ที่ไม่มีช่วงเลย ถูกเตือน', async () => {
    await writeRun(
      'pr-lists',
      runData({
        id: 'pr-lists',
        sections: [{ id: 'index', title: 'ภาพรวม', kind: 'index', readingList: 'rl-dup' }],
        readingLists: [
          {
            id: 'rl-dup',
            title: 'อันแรก',
            spans: [{ path: 'src/core.ts', from: 1, to: 2, kind: 'changed', why: 'x' }],
          },
          { id: 'rl-dup', title: 'อันที่ซ้ำ', spans: [] },
        ],
      }),
      { 'index.md': '# ภาพรวม\n' },
    )
    const warnings = await warningsOf('pr-lists')
    expect(codes(warnings)).toContain('reading_list_duplicate')
    expect(codes(warnings)).toContain('reading_list_empty')
  })
})

describe('ตัวสแกน markdown (server/scan.ts)', () => {
  it('เก็บไดอะแกรม, `:read` และ `:file` จากเนื้อความ', () => {
    const scan = scanPage(
      [
        '# หัวข้อ',
        '',
        'อ่านที่ :read[ลำดับ]{list="rl-a"} และ :file[core.ts]{path="src/core.ts" lines="1-4"}',
        '',
        '```mermaid',
        'flowchart TB',
        '  A[x] --> B[y]',
        '```',
      ].join('\n'),
    )
    expect(scan.readingLists).toEqual(['rl-a'])
    expect(scan.files).toEqual([{ path: 'src/core.ts', lines: '1-4' }])
    expect(scan.diagrams).toEqual(['flowchart TB\n  A[x] --> B[y]'])
  })

  it('ไม่นับตัวอย่างใน code block และ inline code เป็นการอ้างถึงจริง', () => {
    const scan = scanPage(
      [
        'เขียนแบบนี้ `:read[ป้าย]{list="rl-example"}` ในเนื้อความ',
        '',
        '```md',
        ':read[ป้าย]{list="rl-in-fence"}',
        ':file[x]{path="a/b.ts"}',
        '```',
      ].join('\n'),
    )
    expect(scan.readingLists).toEqual([])
    expect(scan.files).toEqual([])
    expect(scan.diagrams).toEqual([])
  })

  it('ไม่สับสนกับ directive ตัวอื่นที่ขึ้นต้นด้วยโคลอนมากกว่า', () => {
    const scan = scanPage('::verify[รันคำสั่งนี้]\n\n:::note{type=warn}\nระวัง\n:::\n')
    expect(scan.readingLists).toEqual([])
    expect(scan.files).toEqual([])
  })
})
