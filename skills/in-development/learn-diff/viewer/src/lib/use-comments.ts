import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  ApiClientError,
  createComment,
  deleteComment,
  fetchComments,
  updateComment,
  type NewCommentRequest,
} from '@/lib/api'
import { NO_COUNTS, countsByPath, groupByLine, removeCommentFrom, sortIssueComments, upsertComment } from '@/lib/comments'
import type { CommentCreatedResponse, CommentsResponse, PrComment, PrCommentKind } from '@/shared/types'

/**
 * comment ของ PR ทั้ง run — state ก้อนเดียวที่แถบ gutter (ต่อไฟล์) กับกล่องระดับ PR ใช้ร่วมกัน
 *
 * อยู่ที่ `RunLayout` ด้วยเหตุผลเดียวกับ reading panel: ผู้อ่านเดินข้าม section ตลอด ถ้า state
 * อยู่ในหน้า ทุกครั้งที่เปลี่ยนหน้าจะยิง gh ใหม่ทั้งชุด (และ badge จะกะพริบหายทุกครั้ง)
 *
 * **ไม่ poll** ตามสเปก: ดึงตอนเปิด run + ตอนกด refresh เท่านั้น · การส่ง/แก้/ลบ merge ผลที่
 * GitHub ตอบกลับเข้า state ตรง ๆ (ของจริงจาก GitHub ไม่ใช่ค่าที่เราเดาเอง) จึงไม่ต้องดึงซ้ำ
 */

export interface CommentsStore {
  data: CommentsResponse | null
  loading: boolean
  /** อ่าน comment ไม่ได้ (ไม่มี gh / ยังไม่ login / repo ไม่มีสิทธิ์) — ข้อความบอกวิธีแก้ */
  error: Error | null
  /** false = ปิดทางเขียนทั้งหมด ไม่ให้มีปุ่มที่กดแล้วไม่มีอะไรเกิด (หลักข้อ 9) */
  ready: boolean
  refresh: () => void
  /** จำนวน comment ต่อบรรทัดของไฟล์ — identity คงที่ตราบใดที่ข้อมูลไม่เปลี่ยน */
  countsFor: (path: string) => Readonly<Record<number, number>>
  commentsAt: (path: string, line: number) => PrComment[]
  /** comment ระดับ PR เรียงเก่า→ใหม่ */
  prComments: PrComment[]
  viewer: string | null
  /** คืนคำตอบของ server ทั้งก้อน — ผู้เรียกต้องบอกผู้ส่งได้ว่า comment ไปโผล่ที่ไหนและเพราะอะไร */
  add: (request: NewCommentRequest) => Promise<CommentCreatedResponse>
  edit: (kind: PrCommentKind, id: number, body: string) => Promise<void>
  remove: (kind: PrCommentKind, id: number) => Promise<void>
}

const NO_COMMENTS: PrComment[] = []

export function useComments(runId: string): CommentsStore {
  const [data, setData] = useState<CommentsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  // รอบของ request ล่าสุด — กด refresh รัว ๆ แล้วผลรอบเก่าที่เพิ่งมาถึงต้องไม่ทับของใหม่
  const seq = useRef(0)

  const load = useCallback(() => {
    const round = ++seq.current
    setLoading(true)
    fetchComments(runId)
      .then((res) => {
        if (seq.current !== round) return
        setData(res)
        setError(null)
      })
      .catch((err: unknown) => {
        if (seq.current !== round) return
        setError(err instanceof Error ? err : new Error(String(err)))
      })
      .finally(() => {
        if (seq.current === round) setLoading(false)
      })
  }, [runId])

  useEffect(() => {
    setData(null)
    load()
  }, [load])

  const grouped = useMemo(() => groupByLine(data?.review ?? []), [data])
  const counts = useMemo(() => countsByPath(grouped), [grouped])
  const prComments = useMemo(() => sortIssueComments(data?.issue ?? []), [data])

  const countsFor = useCallback((path: string) => counts.get(path) ?? NO_COUNTS, [counts])
  const commentsAt = useCallback(
    (path: string, line: number) => grouped.get(path)?.get(line) ?? NO_COMMENTS,
    [grouped],
  )

  const add = useCallback(
    async (request: NewCommentRequest) => {
      const res = await createComment(runId, request)
      setData((current) => (current ? upsertComment(current, res.comment) : current))
      return res
    },
    [runId],
  )

  const edit = useCallback(
    async (kind: PrCommentKind, id: number, body: string) => {
      const res = await updateComment(runId, kind, id, body)
      setData((current) => (current ? upsertComment(current, res.comment) : current))
    },
    [runId],
  )

  const remove = useCallback(
    async (kind: PrCommentKind, id: number) => {
      await deleteComment(runId, kind, id)
      setData((current) => (current ? removeCommentFrom(current, kind, id) : current))
    },
    [runId],
  )

  return {
    data,
    loading,
    error,
    // อ่านสำเร็จอย่างน้อยหนึ่งครั้ง = gh พร้อม · error ที่ค้างอยู่แปลว่ายังใช้ไม่ได้
    ready: data !== null && error === null,
    refresh: load,
    countsFor,
    commentsAt,
    prComments,
    viewer: data?.viewer ?? null,
    add,
    edit,
    remove,
  }
}

/** ข้อความ error ที่เอาไปโชว์ได้เลย — code ของ ApiClientError บอกวิธีแก้อยู่แล้วในข้อความไทย */
export function commentErrorText(err: unknown): string {
  if (err instanceof ApiClientError) return err.message
  if (err instanceof Error) return err.message
  return String(err)
}
