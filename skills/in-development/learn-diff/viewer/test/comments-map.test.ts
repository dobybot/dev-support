import { describe, expect, it } from 'vitest'

import {
  commentResultMessage,
  countsByPath,
  groupByLine,
  isOwn,
  removeCommentFrom,
  sortIssueComments,
  upsertComment,
} from '../src/lib/comments'
import type { CommentCreatedResponse, CommentsResponse, PrComment } from '../src/shared/types'

/**
 * การจับคู่ comment เข้ากับบรรทัด/ไฟล์ — ฟังก์ชันล้วนฝั่งแอป (issue #49)
 *
 * ที่ต้องมีเทสต์เพราะความผิดพลาดตรงนี้ *เงียบ*: badge ขึ้นผิดบรรทัดแล้วผู้อ่านจะไม่รู้ว่ามีคน
 * ทักไว้แล้ว ส่วน UI จริง (แถบ gutter, กล่องเขียน, preview) ตรวจด้วยมือตาม convention เดิม
 */

function comment(overrides: Partial<PrComment> = {}): PrComment {
  return {
    id: 1,
    kind: 'review',
    author: 'tanin-t',
    body: 'ทัก',
    url: 'https://github.com/acme/demo/pull/7#discussion_r1',
    createdAt: '2026-08-07T01:00:00Z',
    updatedAt: '2026-08-07T01:00:00Z',
    path: 'src/main.py',
    line: 4,
    outdated: false,
    ...overrides,
  }
}

describe('จับคู่ review comment เข้ากับบรรทัด', () => {
  it('แยกตามไฟล์แล้วตามบรรทัด', () => {
    const grouped = groupByLine([
      comment({ id: 1, path: 'src/main.py', line: 4 }),
      comment({ id: 2, path: 'src/main.py', line: 9 }),
      comment({ id: 3, path: 'src/other.py', line: 4 }),
    ])
    expect(grouped.get('src/main.py')?.get(4)?.map((c) => c.id)).toEqual([1])
    expect(grouped.get('src/main.py')?.get(9)?.map((c) => c.id)).toEqual([2])
    expect(grouped.get('src/other.py')?.get(4)?.map((c) => c.id)).toEqual([3])
  })

  it('หลาย comment บรรทัดเดียวกันเรียงเก่าไปใหม่', () => {
    const grouped = groupByLine([
      comment({ id: 2, createdAt: '2026-08-07T05:00:00Z' }),
      comment({ id: 1, createdAt: '2026-08-07T01:00:00Z' }),
    ])
    expect(grouped.get('src/main.py')?.get(4)?.map((c) => c.id)).toEqual([1, 2])
  })

  it('comment ที่ GitHub ไม่บอกตำแหน่งแล้ว ไม่ถูกเดาไปแปะบรรทัดไหน', () => {
    const grouped = groupByLine([comment({ id: 5, line: null, outdated: true })])
    expect(grouped.size).toBe(0)
  })

  it('จำนวนต่อบรรทัดคือรูปแบบที่แถบ gutter ใช้ตรง ๆ', () => {
    const counts = countsByPath(
      groupByLine([comment({ id: 1 }), comment({ id: 2 }), comment({ id: 3, line: 10 })]),
    )
    expect(counts.get('src/main.py')).toEqual({ 4: 2, 10: 1 })
    expect(counts.get('src/never.py')).toBeUndefined()
  })
})

describe('comment ระดับ PR', () => {
  it('เรียงเก่าไปใหม่เหมือนบทสนทนาในหน้า PR', () => {
    const sorted = sortIssueComments([
      comment({ id: 2, kind: 'issue', createdAt: '2026-08-07T09:00:00Z' }),
      comment({ id: 1, kind: 'issue', createdAt: '2026-08-07T02:00:00Z' }),
    ])
    expect(sorted.map((c) => c.id)).toEqual([1, 2])
  })
})

describe('เจ้าของ comment', () => {
  it('เทียบกับ login ของบัญชีที่ gh ใช้อยู่', () => {
    expect(isOwn(comment({ author: 'tanin-t' }), 'tanin-t')).toBe(true)
    expect(isOwn(comment({ author: 'someone' }), 'tanin-t')).toBe(false)
  })

  it('ไม่รู้ว่าใครใช้อยู่ = ไม่ถือว่าเป็นของใคร (ปุ่มแก้/ลบไม่โผล่ ดีกว่าโผล่แล้วกดไม่ได้)', () => {
    expect(isOwn(comment({ author: 'tanin-t' }), null)).toBe(false)
    expect(isOwn(comment({ author: '' }), '')).toBe(false)
  })
})

describe('merge ผลจาก GitHub เข้า state โดยไม่ดึงใหม่ทั้งชุด', () => {
  const state: CommentsResponse = {
    runId: 'pr-7',
    prNumber: 7,
    commit: 'abc',
    viewer: 'tanin-t',
    review: [comment({ id: 1 })],
    issue: [comment({ id: 9, kind: 'issue', path: null, line: null })],
  }

  it('comment ใหม่ต่อท้ายกองของชนิดตัวเอง', () => {
    const next = upsertComment(state, comment({ id: 2 }))
    expect(next.review.map((c) => c.id)).toEqual([1, 2])
    expect(next.issue.map((c) => c.id)).toEqual([9])
  })

  it('แก้แล้วทับตัวเดิมที่ id เดียวกัน ไม่ใช่เพิ่มซ้ำ', () => {
    const next = upsertComment(state, comment({ id: 1, body: 'แก้แล้ว' }))
    expect(next.review).toHaveLength(1)
    expect(next.review[0].body).toBe('แก้แล้ว')
  })

  it('ลบแล้วหายจากกองของชนิดนั้นเท่านั้น', () => {
    const next = removeCommentFrom(state, 'issue', 9)
    expect(next.issue).toEqual([])
    expect(next.review).toHaveLength(1)
  })
})

/**
 * ข้อความบอกผลของการส่ง — "ส่งแล้ว" ที่ไม่บอกปลายทางคลุมเครือ แต่เหตุผลที่ *ผิด* แย่กว่า:
 * บรรทัดที่ server เทียบ diff ไม่ได้ต้องไม่ถูกประกาศว่า "ไม่อยู่ใน diff" (user story 11)
 */
describe('ข้อความบอกผลของการส่ง comment', () => {
  const created = (over: Partial<CommentCreatedResponse>): CommentCreatedResponse => ({
    runId: 'pr-7',
    comment: comment({ id: 3 }),
    fellBackToIssue: false,
    fallback: null,
    ...over,
  })

  it('ขึ้นเป็น review comment ตามที่ตั้งใจ = บอกไฟล์กับบรรทัด', () => {
    expect(commentResultMessage(created({}), 'src/main.py', 4)).toBe(
      'ส่ง review comment ที่ src/main.py:4 ขึ้น PR แล้ว',
    )
  })

  it('บรรทัดอยู่นอก diff จริง = บอกตรง ๆ ว่าอยู่นอก diff', () => {
    const message = commentResultMessage(
      created({ fellBackToIssue: true, fallback: { kind: 'outside-diff', reason: null } }),
      'src/main.py',
      2,
    )
    expect(message).toContain('บรรทัด 2 ไม่อยู่ใน diff')
  })

  it('เทียบ diff ไม่ได้ = บอกว่าเทียบไม่ได้พร้อมเหตุผลจริง ไม่ใช่ยืนยันสิ่งที่ไม่รู้', () => {
    const message = commentResultMessage(
      created({
        fellBackToIssue: true,
        fallback: { kind: 'diff-unavailable', reason: 'ไม่มี commit abc — ลอง `git fetch`' },
      }),
      'src/main.py',
      4,
    )
    expect(message).toContain('เทียบ diff ของ PR ไม่ได้')
    expect(message).toContain('git fetch')
    expect(message).not.toContain('ไม่อยู่ใน diff')
  })
})
