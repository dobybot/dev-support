import { createContext, useContext } from 'react'

import { NO_COUNTS } from '@/lib/comments'
import type { CommentsStore } from '@/lib/use-comments'

/**
 * ทางเดียวที่ทุกจุดในหน้า run เข้าถึง comment ของ PR — แถบ gutter ของกล่องโค้ดกับกล่อง
 * ระดับ PR ท้ายหน้าใช้ store ตัวเดียวกัน (issue #49) · provider อยู่ที่ `RunLayout`
 */
const DISABLED: CommentsStore = {
  data: null,
  loading: false,
  error: null,
  ready: false,
  refresh: () => {},
  countsFor: () => NO_COUNTS,
  commentsAt: () => [],
  prComments: [],
  viewer: null,
  add: () => Promise.reject(new Error('ยังไม่พร้อมใช้ comment')),
  edit: () => Promise.reject(new Error('ยังไม่พร้อมใช้ comment')),
  remove: () => Promise.reject(new Error('ยังไม่พร้อมใช้ comment')),
}

export const CommentsContext = createContext<CommentsStore | null>(null)

export function useCommentsStore(): CommentsStore {
  return useContext(CommentsContext) ?? DISABLED
}
