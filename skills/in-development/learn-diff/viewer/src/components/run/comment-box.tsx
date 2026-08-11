import { Check, Eye, Pencil, Send, Trash2, X } from 'lucide-react'
import { useCallback, useState } from 'react'

import { Prose } from '@/components/run/markdown'
import { isOwn } from '@/lib/comments'
import { commentErrorText } from '@/lib/use-comments'
import { formatRunDate } from '@/lib/run-list'
import { cn } from '@/lib/utils'
import type { PrComment } from '@/shared/types'

/**
 * ชิ้นส่วนร่วมของ comment ทั้งสองที่ (ในกล่องโค้ดต่อบรรทัด และท้ายหน้า run) — issue #49
 *
 * markdown + preview ใช้ตัว render เดิมของ viewer (`<Prose>`) ตรง ๆ ไม่ใช่ตัวใหม่: สิ่งที่ผู้อ่าน
 * เห็นตอน preview จึงเป็นของชุดเดียวกับที่เขาอ่านมาทั้งหน้า และไม่มี renderer ที่สองให้ดูแล
 * (GitHub render ด้วยกฎของตัวเองอีกที — preview นี้ตอบคำถาม "โครงถูกไหม" ไม่ใช่ "สีตรงเป๊ะไหม")
 *
 * ปุ่มลบเป็นสองจังหวะในที่ (ไม่ใช่ `window.confirm`): บนมือถือผ่าน tunnel กล่อง confirm ของ
 * เบราว์เซอร์เด้งคนละที่กับสิ่งที่กด และเราต้องบอกได้ด้วยว่ากำลังจะลบ comment อันไหน
 */

/** กล่องเขียน — ใช้ทั้งตอนเขียนใหม่และตอนแก้ของเดิม (`initial` + ปุ่มยกเลิก) */
export function CommentComposer({
  initial = '',
  placeholder = 'เขียน comment (markdown ได้)…',
  submitLabel = 'ส่งขึ้น GitHub',
  autoFocus,
  onSubmit,
  onCancel,
}: {
  initial?: string
  placeholder?: string
  submitLabel?: string
  autoFocus?: boolean
  /** throw = ล้มเหลว (ข้อความจาก GitHub ถูกแสดงในกล่องนี้เอง) */
  onSubmit: (body: string) => Promise<void>
  onCancel?: () => void
}) {
  const [body, setBody] = useState(initial)
  const [preview, setPreview] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = useCallback(() => {
    if (pending || body.trim() === '') return
    setPending(true)
    setError(null)
    onSubmit(body)
      .then(() => {
        setBody('')
        setPreview(false)
      })
      // ล้มเหลวแล้วต้องยัง **เห็นข้อความที่พิมพ์ไว้** — ไม่มีอะไรแย่กว่าพิมพ์ยาว ๆ แล้วหายไปกับ error
      .catch((err: unknown) => setError(commentErrorText(err)))
      .finally(() => setPending(false))
  }, [body, onSubmit, pending])

  return (
    <div className="rounded-md border bg-background">
      <div className="flex items-center gap-1 border-b px-2 py-1 text-[11px] text-muted-foreground">
        <button
          type="button"
          onClick={() => setPreview(false)}
          className={cn('rounded px-1.5 py-0.5 hover:bg-muted', !preview && 'bg-muted font-medium text-foreground')}
        >
          <Pencil className="mr-1 inline size-3" aria-hidden />
          เขียน
        </button>
        <button
          type="button"
          onClick={() => setPreview(true)}
          className={cn('rounded px-1.5 py-0.5 hover:bg-muted', preview && 'bg-muted font-medium text-foreground')}
        >
          <Eye className="mr-1 inline size-3" aria-hidden />
          พรีวิว
        </button>
        <span className="ml-auto font-mono">⌘↵ ส่ง</span>
      </div>

      {preview ? (
        <div className="max-h-64 overflow-y-auto px-3 py-1 text-sm">
          {body.trim() === '' ? (
            <p className="py-3 text-xs text-muted-foreground">ยังไม่มีอะไรให้พรีวิว</p>
          ) : (
            <Prose markdown={body} />
          )}
        </div>
      ) : (
        <textarea
          value={body}
          autoFocus={autoFocus}
          onChange={(event) => setBody(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault()
              submit()
            }
          }}
          placeholder={placeholder}
          rows={4}
          className="w-full resize-y bg-transparent px-3 py-2 text-sm outline-none"
        />
      )}

      {error ? (
        <p className="border-t px-3 py-2 text-xs text-red-800 dark:text-red-200">ส่งไม่สำเร็จ — {error}</p>
      ) : null}

      <div className="flex items-center gap-2 border-t px-2 py-1.5">
        <button
          type="button"
          onClick={submit}
          disabled={pending || body.trim() === ''}
          className="flex items-center gap-1 rounded-md border bg-foreground/90 px-2 py-1 text-xs text-background hover:bg-foreground disabled:pointer-events-none disabled:opacity-40"
        >
          <Send className="size-3" aria-hidden />
          {pending ? 'กำลังส่ง…' : submitLabel}
        </button>
        {onCancel ? (
          <button type="button" onClick={onCancel} className="rounded-md border px-2 py-1 text-xs hover:bg-muted">
            ยกเลิก
          </button>
        ) : null}
      </div>
    </div>
  )
}

/** comment หนึ่งอัน + ปุ่มแก้/ลบของเจ้าของ */
export function CommentItem({
  comment,
  viewer,
  onEdit,
  onDelete,
}: {
  comment: PrComment
  viewer: string | null
  onEdit: (body: string) => Promise<void>
  onDelete: () => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const own = isOwn(comment, viewer)

  const remove = useCallback(() => {
    setPending(true)
    setError(null)
    onDelete()
      .catch((err: unknown) => {
        setError(commentErrorText(err))
        setConfirming(false)
      })
      .finally(() => setPending(false))
  }, [onDelete])

  return (
    <article className="rounded-md border bg-muted/30" data-comment-id={comment.id}>
      <header className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b px-2 py-1 text-[11px] text-muted-foreground">
        <span className="font-medium text-foreground">{comment.author || 'ไม่ทราบผู้เขียน'}</span>
        <span>{formatRunDate(comment.createdAt)}</span>
        {comment.updatedAt !== comment.createdAt ? <span title={comment.updatedAt}>(แก้แล้ว)</span> : null}
        {/* comment ที่หลุดจาก diff ต้องบอก ไม่ใช่ปล่อยให้งงว่าทำไมมันอยู่บรรทัดนั้น */}
        {comment.outdated ? (
          <span className="rounded-full border px-1.5" title="GitHub บอกว่า comment นี้หลุดจาก diff ปัจจุบันแล้ว">
            outdated
          </span>
        ) : null}
        <span className="ml-auto flex items-center gap-1">
          {comment.url ? (
            <a href={comment.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">
              ดูบน GitHub
            </a>
          ) : null}
          {own && !editing ? (
            <>
              <button
                type="button"
                onClick={() => setEditing(true)}
                title="แก้ comment นี้"
                aria-label="แก้ comment นี้"
                className="rounded p-0.5 hover:bg-muted"
              >
                <Pencil className="size-3" aria-hidden />
              </button>
              {confirming ? (
                <>
                  <button
                    type="button"
                    onClick={remove}
                    disabled={pending}
                    className="flex items-center gap-1 rounded border border-red-500 px-1.5 py-0.5 text-red-700 hover:bg-red-50 disabled:opacity-50 dark:text-red-300 dark:hover:bg-red-950/40"
                  >
                    <Check className="size-3" aria-hidden />
                    {pending ? 'กำลังลบ…' : 'ยืนยันลบ'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirming(false)}
                    title="ไม่ลบแล้ว"
                    aria-label="ไม่ลบแล้ว"
                    className="rounded p-0.5 hover:bg-muted"
                  >
                    <X className="size-3" aria-hidden />
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirming(true)}
                  title="ลบ comment นี้"
                  aria-label="ลบ comment นี้"
                  className="rounded p-0.5 hover:bg-muted"
                >
                  <Trash2 className="size-3" aria-hidden />
                </button>
              )}
            </>
          ) : null}
        </span>
      </header>

      {error ? <p className="px-2 py-1 text-xs text-red-800 dark:text-red-200">{error}</p> : null}

      {editing ? (
        <div className="p-2">
          <CommentComposer
            initial={comment.body}
            submitLabel="บันทึกการแก้"
            autoFocus
            onSubmit={async (body) => {
              await onEdit(body)
              setEditing(false)
            }}
            onCancel={() => setEditing(false)}
          />
        </div>
      ) : (
        <div className="px-3 py-1 text-sm [&_h1]:mt-4 [&_h2]:mt-4 [&_p]:my-2">
          <Prose markdown={comment.body} />
        </div>
      )}
    </article>
  )
}
