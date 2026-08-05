import { describe, expect, it } from 'vitest'

import { filterRuns, formatRunDate, repoName, shortCommit } from '../src/lib/run-list'
import type { RunSummary } from '../src/shared/types'

/** ตรรกะของหน้าแรกที่เทสต์ได้จริง — ตัวหน้าเองเป็น component จึงไม่มีเทสต์ (SPEC-v3) */

function run(overrides: Partial<RunSummary> = {}): RunSummary {
  return {
    id: 'pr-230-etax',
    repoPath: '/Users/dev/Projects/dobybot-monorepo',
    contentDir: '/Users/dev/Projects/dobybot-monorepo/.learn-diff/pr-230-etax',
    commit: 'e2b2696bb604112233445566778899aabbccddee',
    pr: { number: 230, title: 'notify etax link' },
    title: 'แจ้งลิงก์ ETax',
    createdAt: '2026-08-01T09:00:00+07:00',
    ...overrides,
  }
}

describe('ข้อมูลที่หน้าแรกโชว์ต่อ run', () => {
  it('ย่อ path ของ repo เหลือชื่อโฟลเดอร์ (รองรับ separator ของ Windows ด้วย)', () => {
    expect(repoName('/Users/dev/Projects/dobybot-monorepo')).toBe('dobybot-monorepo')
    expect(repoName('C:\\Users\\dev\\Projects\\dobybot-monorepo')).toBe('dobybot-monorepo')
    expect(repoName('/Users/dev/repo/')).toBe('repo')
  })

  it('ย่อ commit แบบเดียวกับที่ git แสดง', () => {
    expect(shortCommit('e2b2696bb604112233445566778899aabbccddee')).toBe('e2b2696bb')
  })

  it('วันที่ใหม่ ๆ บอกเป็นระยะเวลา ที่เหลือเป็นวันที่แบบ ค.ศ.', () => {
    const now = new Date('2026-08-04T10:00:00+07:00')
    expect(formatRunDate('2026-08-04T09:00:00+07:00', now)).toBe('วันนี้')
    expect(formatRunDate('2026-08-03T23:00:00+07:00', now)).toBe('เมื่อวาน')
    expect(formatRunDate('2026-08-01T09:00:00+07:00', now)).toBe('3 วันก่อน')
    expect(formatRunDate('2026-07-01T09:00:00+07:00', now)).toContain('2026')
    expect(formatRunDate(undefined, now)).toBe('—')
    expect(formatRunDate('ไม่ใช่วันที่', now)).toBe('—')
  })
})

describe('ค้นหา run', () => {
  const runs = [
    run(),
    run({
      id: 'pr-99-billing',
      title: 'ปรับรอบบิล',
      pr: { number: 99, title: 'billing cycle' },
      repoPath: '/Users/dev/Projects/dobysync',
      commit: '1111222233334444555566667777888899990000',
    }),
  ]

  it('ค้นด้วยเลข PR ได้ทั้งแบบมีและไม่มี #', () => {
    expect(filterRuns(runs, '230').map((r) => r.id)).toEqual(['pr-230-etax'])
    expect(filterRuns(runs, '#99').map((r) => r.id)).toEqual(['pr-99-billing'])
  })

  it('ค้นด้วยชื่อ repo, ชื่อเรื่องไทย หรือ sha ก็ได้', () => {
    expect(filterRuns(runs, 'dobysync').map((r) => r.id)).toEqual(['pr-99-billing'])
    expect(filterRuns(runs, 'ETax').map((r) => r.id)).toEqual(['pr-230-etax'])
    expect(filterRuns(runs, 'e2b2696').map((r) => r.id)).toEqual(['pr-230-etax'])
  })

  it('หลายคำต้องเจอครบทุกคำ และคำว่างคือไม่กรอง', () => {
    expect(filterRuns(runs, 'billing dobysync')).toHaveLength(1)
    expect(filterRuns(runs, 'billing monorepo')).toHaveLength(0)
    expect(filterRuns(runs, '   ')).toHaveLength(2)
  })
})
