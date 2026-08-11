import { MessagesSquare, RefreshCw } from 'lucide-react'

import { CommentComposer, CommentItem } from '@/components/run/comment-box'
import { useCommentsStore } from '@/components/run/comments-context'
import { useRun } from '@/components/run/run-context'
import { ApiClientError } from '@/lib/api'
import { showToast } from '@/lib/toast'

/**
 * กล่อง comment ระดับ PR ท้ายหน้า run (issue #45 → #49)
 *
 * อยู่ท้ายทุก section โดยตั้งใจ: คำถามภาพรวมมักโผล่ตอน "อ่านจบหน้าหนึ่งแล้วยังไม่หายสงสัย"
 * ซึ่งเป็นจังหวะที่ผู้อ่านอยู่ล่างสุดพอดี — ไม่ต้องเลื่อนกลับขึ้นไปหาที่จด
 *
 * ที่นี่คือที่เดียวที่ประกาศดัง ๆ ว่า "ทำไม comment ใช้ไม่ได้" (gh ไม่มี / ยังไม่ login) เพราะ
 * แถบ comment ในกล่องโค้ดเลือกที่จะ **ไม่โผล่เลย** แทนที่จะโผล่มาแล้วกดไม่ได้ (หลักข้อ 9)
 */
export function PrComments() {
  const store = useCommentsStore()
  const { run } = useRun()
  const prUrl = run.pr.url

  return (
    <section className="mt-12 border-t pt-6" data-pr-comments>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <MessagesSquare className="size-4" aria-hidden />
          comment ของ PR #{run.pr.number}
        </h2>
        <span className="text-xs text-muted-foreground">
          {store.ready ? `${store.prComments.length} ข้อความ · ส่งขึ้น GitHub จริง` : 'ส่งขึ้น GitHub จริงผ่าน gh'}
        </span>
        <button
          type="button"
          onClick={store.refresh}
          className="ml-auto flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-muted"
        >
          <RefreshCw className={store.loading ? 'size-3 animate-spin' : 'size-3'} aria-hidden />
          refresh
        </button>
        {prUrl ? (
          <a href={prUrl} target="_blank" rel="noreferrer" className="text-xs underline underline-offset-2">
            เปิดหน้า PR
          </a>
        ) : null}
      </div>

      {store.error ? (
        <div className="mt-3 rounded-lg border border-amber-400 bg-amber-50 px-4 py-3 text-sm dark:bg-amber-950/30">
          <p className="font-semibold text-amber-900 dark:text-amber-100">comment ยังใช้ไม่ได้</p>
          <p className="mt-1 text-xs leading-relaxed text-amber-900/90 dark:text-amber-100/90">
            {store.error.message}
          </p>
          <p className="mt-1 font-mono text-[11px] text-amber-900/70 dark:text-amber-100/70">
            {store.error instanceof ApiClientError ? store.error.code : 'client_error'}
          </p>
          <button
            type="button"
            onClick={store.refresh}
            className="mt-2 rounded-md border border-amber-500 px-2 py-1 text-xs hover:bg-amber-100 dark:hover:bg-amber-900/40"
          >
            ลองใหม่
          </button>
        </div>
      ) : null}

      {!store.error && store.loading && !store.data ? (
        <p className="mt-3 text-xs text-muted-foreground">กำลังดึง comment จาก GitHub…</p>
      ) : null}

      {store.ready ? (
        <div className="mt-3 space-y-2">
          {store.prComments.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              viewer={store.viewer}
              onEdit={(body) => store.edit(comment.kind, comment.id, body)}
              onDelete={() => store.remove(comment.kind, comment.id)}
            />
          ))}
          <CommentComposer
            placeholder="คำถามภาพรวม / ไอเดียที่ไม่ผูกกับบรรทัด (markdown ได้)…"
            onSubmit={async (body) => {
              await store.add({ body })
              showToast(`ส่ง comment ขึ้น PR #${run.pr.number} แล้ว`)
            }}
          />
        </div>
      ) : null}
    </section>
  )
}
