import { describe, expect, it } from 'vitest'

import {
  EMPTY_READ_STATE,
  UNCOVERED_WHY,
  allListSpanHashes,
  computeCoverage,
  listSpanHashes,
  mergeRanges,
  pruneReadState,
  readStateKey,
  readStoredReadState,
  runProgress,
  sameUncovered,
  sectionReadStatus,
  setSpansRead,
  spanHash,
  subtractRanges,
  syntheticSpans,
  toggleSectionRead,
  toggleSpanRead,
  writeStoredReadState,
  type ReadStateStore,
  type StoredReadState,
} from '../src/lib/read-state'
import type { CoverageBaseFile, RunData } from '../src/shared/types'

/** store จำลองแบบเดียวกับ WidthStore ของ reading-panel — ไม่ต้องมี DOM */
function memoryStore(initial: Record<string, string> = {}): ReadStateStore & { data: Record<string, string> } {
  const data = { ...initial }
  return {
    data,
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => {
      data[key] = value
    },
  }
}

function state(spans: string[] = [], sections: string[] = []): StoredReadState {
  return { v: 1, spans, sections }
}

function runData(overrides: Partial<RunData> = {}): RunData {
  return {
    schemaVersion: 1,
    id: 'pr-1',
    title: 'fixture',
    pr: { number: 1, title: 'fixture' },
    commit: 'a'.repeat(40),
    generatedAt: '2026-08-07T09:00:00+07:00',
    sections: [
      { id: 'index', title: 'ภาพรวม', kind: 'index' },
      { id: '01-flow', title: 'flow', readingList: 'flow' },
      { id: '02-plain', title: 'ไม่มี list' },
      { id: '99-verify', title: 'ตรวจรับ', kind: 'verify' },
    ],
    readingLists: [
      {
        id: 'flow',
        title: 'flow',
        spans: [
          { path: 'src/a.py', from: 10, to: 20, kind: 'changed', why: 'a' },
          { path: 'src/b.py', from: 1, to: 5, kind: 'context', why: 'b' },
        ],
      },
      {
        id: 'other',
        title: 'other',
        // span แรกซ้ำกับใน flow เป๊ะ — ต้องแชร์ hash เดียว
        spans: [
          { path: 'src/a.py', from: 10, to: 20, kind: 'changed', why: 'a อีกมุม' },
          { path: 'src/c.py', from: 30, to: 40, kind: 'changed', why: 'c' },
        ],
      },
    ],
    ...overrides,
  }
}

describe('spanHash — identity คือเนื้อหา (path:from:to) ไม่ใช่ authored id', () => {
  it('input เดิมได้ hash เดิมเสมอ (ข้าม session ได้)', () => {
    expect(spanHash('src/a.py', 10, 20)).toBe(spanHash('src/a.py', 10, 20))
    expect(spanHash('src/a.py', 10, 20)).toMatch(/^[0-9a-f]{8}$/)
  })

  it('บรรทัดเลื่อน = hash เปลี่ยน = กลับเป็นยังไม่อ่าน (story 4)', () => {
    expect(spanHash('src/a.py', 10, 20)).not.toBe(spanHash('src/a.py', 11, 21))
    expect(spanHash('src/a.py', 10, 20)).not.toBe(spanHash('src/b.py', 10, 20))
  })
})

describe('persistence — raw intent, key ต่อ run, ค่าเสียทิ้งทั้งก้อน', () => {
  it('key แยกต่อ run — สอง run ไม่แชร์เครื่องหมาย (story 15)', () => {
    expect(readStateKey('pr-1')).toBe('learn-diff:read-state:pr-1')
    expect(readStateKey('pr-1')).not.toBe(readStateKey('pr-2'))
  })

  it('เขียนแล้วอ่านกลับได้ค่าตรง', () => {
    const store = memoryStore()
    writeStoredReadState(store, 'pr-1', state(['aa'], ['index']))
    expect(readStoredReadState(store, 'pr-1')).toEqual(state(['aa'], ['index']))
  })

  it('ไม่มีค่า = EMPTY ไม่ใช่ crash', () => {
    expect(readStoredReadState(memoryStore(), 'pr-1')).toEqual(EMPTY_READ_STATE)
    expect(readStoredReadState(null, 'pr-1')).toEqual(EMPTY_READ_STATE)
  })

  it('JSON เสีย / version ไม่ตรง / รูปร่างผิด = ทิ้งทั้งก้อน (story 16)', () => {
    const key = readStateKey('pr-1')
    for (const bad of ['ไม่ใช่ json', '{"v":2,"spans":[],"sections":[]}', '{"v":1}', '[]', '"x"']) {
      expect(readStoredReadState(memoryStore({ [key]: bad }), 'pr-1')).toEqual(EMPTY_READ_STATE)
    }
  })

  it('สมาชิกที่ไม่ใช่ string ถูกกรองทิ้ง ไม่พาทั้งก้อนพัง', () => {
    const key = readStateKey('pr-1')
    const store = memoryStore({ [key]: '{"v":1,"spans":["aa",5],"sections":[null,"index"]}' })
    expect(readStoredReadState(store, 'pr-1')).toEqual(state(['aa'], ['index']))
  })

  it('store ที่ throw (โหมดส่วนตัว) ไม่ทำให้อ่าน/เขียนพัง', () => {
    const broken: ReadStateStore = {
      getItem: () => {
        throw new Error('nope')
      },
      setItem: () => {
        throw new Error('nope')
      },
    }
    expect(readStoredReadState(broken, 'pr-1')).toEqual(EMPTY_READ_STATE)
    expect(() => writeStoredReadState(broken, 'pr-1', EMPTY_READ_STATE)).not.toThrow()
  })
})

describe('reducer — toggle / mark-all / section', () => {
  it('toggleSpanRead ติ๊กแล้วติ๊กซ้ำ = กลับสภาพเดิม', () => {
    const once = toggleSpanRead(EMPTY_READ_STATE, 'aa')
    expect(once.spans).toEqual(['aa'])
    expect(toggleSpanRead(once, 'aa').spans).toEqual([])
  })

  it('setSpansRead(true) รวมของเดิมโดยไม่ซ้ำ · (false) ลบเฉพาะที่ระบุ', () => {
    const marked = setSpansRead(state(['aa']), ['aa', 'bb', 'cc'], true)
    expect([...marked.spans].sort()).toEqual(['aa', 'bb', 'cc'])
    const cleared = setSpansRead(marked, ['bb', 'cc'], false)
    expect(cleared.spans).toEqual(['aa'])
  })

  it('toggleSectionRead ไม่แตะ spans', () => {
    const next = toggleSectionRead(state(['aa']), 'index')
    expect(next.sections).toEqual(['index'])
    expect(next.spans).toEqual(['aa'])
    expect(toggleSectionRead(next, 'index').sections).toEqual([])
  })

  it('pruneReadState ทิ้ง hash/section ที่ไม่มีในเนื้อหาแล้ว (dropped on next write)', () => {
    const pruned = pruneReadState(state(['aa', 'gone'], ['index', 'ghost']), new Set(['aa']), new Set(['index']))
    expect(pruned).toEqual(state(['aa'], ['index']))
  })
})

describe('rollups — สถานะ section + progress', () => {
  const data = runData()
  const hashA = spanHash('src/a.py', 10, 20)
  const hashB = spanHash('src/b.py', 1, 5)
  const hashC = spanHash('src/c.py', 30, 40)

  it('span ซ้ำสองรายการแชร์ hash เดียว — allListSpanHashes เป็น unique set', () => {
    expect(allListSpanHashes(data)).toEqual(new Set([hashA, hashB, hashC]))
    expect(listSpanHashes(data.readingLists![0])).toEqual([hashA, hashB])
  })

  it('unread → prose → done ตามลำดับ prose แล้วค่อย span ครบ (story 7)', () => {
    const section = data.sections[1]
    expect(sectionReadStatus(data, state([hashA, hashB]), section)).toBe('unread') // ยังไม่กดอ่านจบ
    expect(sectionReadStatus(data, state([hashA], ['01-flow']), section)).toBe('prose')
    expect(sectionReadStatus(data, state([hashA, hashB], ['01-flow']), section)).toBe('done')
  })

  it('section ที่ไม่มี reading list ข้าม state ที่สาม — prose จบ = done', () => {
    const section = data.sections[2]
    expect(sectionReadStatus(data, EMPTY_READ_STATE, section)).toBe('unread')
    expect(sectionReadStatus(data, state([], ['02-plain']), section)).toBe('done')
  })

  it('reading list ที่อ้างถึงแต่ไม่มีนิยาม = ปฏิบัติเหมือนไม่มี list (ไม่ crash)', () => {
    const broken = runData({
      sections: [{ id: 's', title: 's', readingList: 'ghost' }],
    })
    expect(sectionReadStatus(broken, state([], ['s']), broken.sections[0])).toBe('done')
  })

  it('runProgress นับ unique spans และไม่นับ hash/section แปลกปลอม', () => {
    const progress = runProgress(data, state([hashA, 'stale-hash'], ['index', 'ghost-section']))
    expect(progress).toEqual({ sectionsRead: 1, sectionsTotal: 4, spansRead: 1, spansTotal: 3 })
  })
})

describe('interval helpers', () => {
  it('mergeRanges รวมช่วงทับ/ติดกัน และเรียงตาม from', () => {
    expect(mergeRanges([{ from: 8, to: 9 }, { from: 1, to: 3 }, { from: 4, to: 5 }])).toEqual([
      { from: 1, to: 5 },
      { from: 8, to: 9 },
    ])
    expect(mergeRanges([{ from: 5, to: 4 }])).toEqual([]) // ช่วงกลับหัวทิ้ง
  })

  it('subtractRanges เจาะรูตรงกลางและตัดขอบได้', () => {
    expect(subtractRanges([{ from: 1, to: 10 }], [{ from: 4, to: 6 }])).toEqual([
      { from: 1, to: 3 },
      { from: 7, to: 10 },
    ])
    expect(subtractRanges([{ from: 1, to: 10 }], [{ from: 1, to: 10 }])).toEqual([])
    expect(subtractRanges([{ from: 1, to: 5 }], [{ from: 20, to: 30 }])).toEqual([{ from: 1, to: 5 }])
  })
})

describe('computeCoverage — วัดกับ diff ไม่ใช่กับ reading list', () => {
  // diff จริง: a.py เปลี่ยน 10–25 · c.py เปลี่ยน 30–40 · d.py เปลี่ยน 1–4 (ไม่มี list ไหนแตะ)
  const files: CoverageBaseFile[] = [
    { path: 'src/a.py', ranges: [{ from: 10, to: 25 }] },
    { path: 'src/c.py', ranges: [{ from: 30, to: 40 }] },
    { path: 'src/d.py', ranges: [{ from: 1, to: 4 }] },
  ]
  const data = runData()
  const hashA = spanHash('src/a.py', 10, 20)
  const hashC = spanHash('src/c.py', 30, 40)

  it('uncovered ไม่ขึ้นกับ checked เลย (story 13) และครอบเฉพาะที่ span changed ไม่แตะ', () => {
    const none = computeCoverage(data, files, new Set())
    const all = computeCoverage(data, files, new Set([hashA, hashC]))
    // a.py 21–25 หลุดจาก span (span ครอบแค่ 10–20) และ d.py ทั้งก้อน
    const expectUncovered = [
      { path: 'src/a.py', from: 21, to: 25, hash: spanHash('src/a.py', 21, 25) },
      { path: 'src/d.py', from: 1, to: 4, hash: spanHash('src/d.py', 1, 4) },
    ]
    expect(none.uncovered).toEqual(expectUncovered)
    expect(all.uncovered).toEqual(expectUncovered)
  })

  it('ยังไม่ติ๊กอะไร = coverage 0%', () => {
    const info = computeCoverage(data, files, new Set())
    expect(info.totalChanged).toBe(16 + 11 + 4)
    expect(info.coveredChanged).toBe(0)
    expect(info.pct).toBe(0)
  })

  it('span ที่ติ๊กนับเฉพาะส่วนที่ intersect กับบรรทัดที่เปลี่ยน', () => {
    const info = computeCoverage(data, files, new Set([hashA]))
    expect(info.coveredChanged).toBe(11) // 10–20 ∩ 10–25
    expect(info.pct).toBe(Math.round((11 / 31) * 100))
  })

  it('context span ไม่ถูกนับเป็น "ครอบ" — ช่วงนั้นยังโผล่เป็น uncovered', () => {
    const withContextFile: CoverageBaseFile[] = [...files, { path: 'src/b.py', ranges: [{ from: 1, to: 5 }] }]
    const hashB = spanHash('src/b.py', 1, 5)
    const info = computeCoverage(data, withContextFile, new Set())
    // b.py มีแค่ context span (1–5) — ต้องโผล่เป็น uncovered เพราะ context อยู่นอก diff โดยนิยาม
    expect(info.uncovered).toContainEqual({ path: 'src/b.py', from: 1, to: 5, hash: hashB })
    expect(info.coveredChanged).toBe(0)
    // แต่ถ้าติ๊ก hash นั้น (ไม่ว่าจากการ์ด context หรือจาก synthetic list — ช่วงเดียวกัน = hash เดียวกัน
    // เพราะ "อ่านแล้ว" เป็นของโค้ด ไม่ใช่ของ list entry) บรรทัดพวกนั้นนับเข้า coverage ทาง synthetic
    expect(computeCoverage(data, withContextFile, new Set([hashB])).coveredChanged).toBe(5)
  })

  it('ติ๊ก synthetic span (uncovered hunk) แล้ว meter ไปถึง 100% ได้จริง (story 14)', () => {
    const checked = new Set([hashA, hashC, spanHash('src/a.py', 21, 25), spanHash('src/d.py', 1, 4)])
    const info = computeCoverage(data, files, checked)
    expect(info.coveredChanged).toBe(info.totalChanged)
    expect(info.pct).toBe(100)
  })

  it('span ทับกันเองไม่นับบรรทัดซ้ำ', () => {
    const overlap = runData({
      readingLists: [
        {
          id: 'x',
          title: 'x',
          spans: [
            { path: 'src/a.py', from: 10, to: 18, kind: 'changed', why: '1' },
            { path: 'src/a.py', from: 15, to: 25, kind: 'changed', why: '2' },
          ],
        },
      ],
    })
    const checked = new Set([spanHash('src/a.py', 10, 18), spanHash('src/a.py', 15, 25)])
    const info = computeCoverage(overlap, [{ path: 'src/a.py', ranges: [{ from: 10, to: 25 }] }], checked)
    expect(info.totalChanged).toBe(16)
    expect(info.coveredChanged).toBe(16)
    expect(info.uncovered).toEqual([])
  })

  it('ไม่มีบรรทัดเปลี่ยนเลย = 100% ไม่ใช่หารศูนย์', () => {
    const info = computeCoverage(data, [], new Set())
    expect(info.pct).toBe(100)
    expect(info.totalChanged).toBe(0)
  })

  it('เหลืออีกบรรทัดเดียวห้ามปัดขึ้นเป็น 100% — 100 แปลว่าอ่านครบจริงเท่านั้น (story 10)', () => {
    const almost = runData({
      readingLists: [
        { id: 'x', title: 'x', spans: [{ path: 'src/a.py', from: 1, to: 399, kind: 'changed', why: 'x' }] },
      ],
    })
    const info = computeCoverage(
      almost,
      [{ path: 'src/a.py', ranges: [{ from: 1, to: 400 }] }],
      new Set([spanHash('src/a.py', 1, 399)]),
    )
    expect([info.coveredChanged, info.totalChanged]).toEqual([399, 400])
    expect(info.pct).toBe(99)
  })

  it('span path ที่ไม่ canonical ("./src/a.py") ยัง match กับ path จาก git ได้', () => {
    const messy = runData({
      readingLists: [
        { id: 'x', title: 'x', spans: [{ path: './src/a.py', from: 10, to: 25, kind: 'changed', why: 'x' }] },
      ],
    })
    const files = [{ path: 'src/a.py', ranges: [{ from: 10, to: 25 }] }]
    // hash ยังคิดจาก path ดิบ (ต้องตรงกับ checkbox บนการ์ด) แต่การจับคู่ไฟล์ใช้ path ที่ normalize แล้ว
    const info = computeCoverage(messy, files, new Set([spanHash('./src/a.py', 10, 25)]))
    expect(info.uncovered).toEqual([])
    expect(info.pct).toBe(100)
  })
})

describe('sameUncovered — identity ของ uncovered ต้องนิ่งข้ามการติ๊ก checkbox', () => {
  const hunk = (path: string, from: number, to: number) => ({ path, from, to, hash: spanHash(path, from, to) })

  it('ชุดเดิม (hash เท่ากันตามลำดับ) = true · เพิ่ม/ลด/เปลี่ยนช่วง = false', () => {
    expect(sameUncovered([hunk('a.py', 1, 2)], [hunk('a.py', 1, 2)])).toBe(true)
    expect(sameUncovered([], [])).toBe(true)
    expect(sameUncovered([hunk('a.py', 1, 2)], [hunk('a.py', 1, 3)])).toBe(false)
    expect(sameUncovered([hunk('a.py', 1, 2)], [hunk('a.py', 1, 2), hunk('b.py', 1, 2)])).toBe(false)
  })
})

describe('syntheticSpans — synthetic reading list ของ uncovered hunks', () => {
  it('หนึ่ง span ต่อหนึ่ง hunk · kind changed · why ตามสเปก · hash scheme เดิม', () => {
    const spans = syntheticSpans([{ path: 'src/d.py', from: 1, to: 4, hash: spanHash('src/d.py', 1, 4) }])
    expect(spans).toEqual([
      { path: 'src/d.py', from: 1, to: 4, kind: 'changed', why: UNCOVERED_WHY },
    ])
    // hash ของ synthetic span ต้องคิดแบบเดียวกับ span ปกติ — ถึงจะ persist และนับ coverage ได้
    expect(spanHash(spans[0].path, spans[0].from!, spans[0].to!)).toBe(spanHash('src/d.py', 1, 4))
  })
})
