import { MessageSquarePlus, RefreshCw, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import { CommentComposer, CommentItem } from '@/components/run/comment-box'
import { useCommentsStore } from '@/components/run/comments-context'
import type { CommentRequest } from '@/lib/code'
import { commentResultMessage } from '@/lib/comments'
import { showToast } from '@/lib/toast'

/**
 * comment ที่ผูกกับบรรทัดในกล่องโค้ด (issue #49) — ตัวกลางระหว่างแถบ gutter (หลังกำแพง
 * CodeMirror) กับ store ของ run
 *
 * รูปแบบเดียวกับ `useCodeNavigation`: การ์ดที่กดเป็นคนถือ overlay เอง กล่องจึงโผล่คู่กับโค้ด
 * ที่ผู้อ่านกำลังดูอยู่ ไม่ใช่ลอยมาจากที่ไหนไม่รู้
 *
 * **ไม่มีแถบเลยถ้า gh ยังใช้ไม่ได้** — ปุ่มที่กดแล้วส่งไม่ได้คือ dead click (หลักข้อ 9)
 * เหตุผลที่ใช้ไม่ได้ถูกประกาศดัง ๆ ที่กล่องระดับ PR ท้ายหน้า run แทน
 */
export function useLineComments(path: string): {
  commentCounts?: Readonly<Record<number, number>>
  onComment?: (req: CommentRequest) => void
  overlay: React.ReactNode
} {
  const store = useCommentsStore()
  const [openLine, setOpenLine] = useState<number | null>(null)

  const onComment = useCallback((req: CommentRequest) => setOpenLine(req.line), [])
  const close = useCallback(() => setOpenLine(null), [])

  // Esc ปิดกล่อง comment ก่อนถึง handler ปิด panel (convention เดียวกับ candidate list ของ #36)
  useEffect(() => {
    if (openLine === null) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      event.preventDefault()
      close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openLine, close])

  if (!store.ready) return { overlay: null }

  return {
    commentCounts: store.countsFor(path),
    onComment,
    overlay:
      openLine === null ? null : <LineCommentBox path={path} line={openLine} onClose={close} />,
  }
}

function LineCommentBox({ path, line, onClose }: { path: string; line: number; onClose: () => void }) {
  const store = useCommentsStore()
  const comments = store.commentsAt(path, line)

  return (
    <div
      className="fixed right-4 bottom-4 z-50 flex max-h-[70vh] w-[30rem] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-lg border bg-background shadow-xl"
      data-line-comments
    >
      <header className="flex items-center gap-2 border-b bg-muted/50 px-3 py-2">
        <MessageSquarePlus className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <p className="min-w-0 flex-1 truncate font-mono text-xs" title={`${path}:${line}`}>
          {path}
          <span className="text-muted-foreground">:{line}</span>
        </p>
        <button
          type="button"
          onClick={() => store.refresh()}
          title="ดึง comment ล่าสุดจาก GitHub"
          aria-label="ดึง comment ล่าสุดจาก GitHub"
          className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted"
        >
          <RefreshCw className={store.loading ? 'size-3.5 animate-spin' : 'size-3.5'} aria-hidden />
        </button>
        <button
          type="button"
          onClick={onClose}
          title="ปิด (Esc)"
          aria-label="ปิดกล่อง comment"
          className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      </header>

      <div className="flex-1 space-y-2 overflow-y-auto p-2">
        {comments.length === 0 ? (
          <p className="px-1 py-2 text-xs text-muted-foreground">
            ยังไม่มี comment ที่บรรทัดนี้ — บรรทัดที่อยู่ใน diff จะขึ้นเป็น review comment ของ PR
            ส่วนบรรทัดนอก diff จะกลายเป็น comment ระดับ PR พร้อมลิงก์มาที่บรรทัดนี้ให้
          </p>
        ) : (
          comments.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              viewer={store.viewer}
              onEdit={(body) => store.edit(comment.kind, comment.id, body)}
              onDelete={() => store.remove(comment.kind, comment.id)}
            />
          ))
        )}

        <CommentComposer
          autoFocus
          onSubmit={async (body) => {
            const res = await store.add({ body, path, line })
            // บอกให้รู้ว่ามันไปโผล่ที่ไหนและเพราะอะไร (user story 11) — ข้อความอยู่ใน lib/comments.ts
            showToast(commentResultMessage(res, path, line))
          }}
        />
      </div>
    </div>
  )
}
