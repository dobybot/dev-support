import type { Element } from 'hast'
import type { ReactNode } from 'react'

import { Diagram } from '@/components/run/diagram'
import { useOptionalReadingPanel } from '@/components/run/panel-context'
import { useOptionalRun } from '@/components/run/run-context'
import { parseLineRange } from '@/lib/file-link'
import { cn } from '@/lib/utils'

/**
 * ตัว render ของ directive แต่ละชนิด (ดู ../../lib/remark-learn-diff.ts ว่าอะไรถูกแปลงเป็นอะไร)
 * ทุกตัวรับ children ที่ react-markdown render มาแล้ว จึงเป็น markdown เต็มรูปแบบข้างใน
 */

export function Tldr({ children }: { children?: ReactNode }) {
  return (
    <aside className="my-6 rounded-lg border-l-4 border-l-neutral-800 bg-muted/60 px-5 py-4 [&_ul]:my-0">
      <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">TL;DR</p>
      {children}
    </aside>
  )
}

const NOTE_STYLE: Record<string, string> = {
  info: 'border-l-neutral-400 bg-muted/50',
  warn: 'border-l-amber-500 bg-amber-50 dark:bg-amber-950/30',
  risk: 'border-l-red-500 bg-red-50 dark:bg-red-950/30',
}

export function Note({ type = 'info', children }: { type?: string; children?: ReactNode }) {
  return (
    <div
      className={cn(
        'my-5 rounded-r-md border-l-4 px-4 py-3 text-sm',
        NOTE_STYLE[type] ?? NOTE_STYLE.info,
      )}
    >
      {children}
    </div>
  )
}

export function Question({ id, children }: { id?: string; children?: ReactNode }) {
  return (
    <div
      id={id || undefined}
      className="my-6 rounded-lg border bg-card px-5 py-4 [&>p:first-child]:font-medium"
    >
      {children}
    </div>
  )
}

export function Answer({ children }: { children?: ReactNode }) {
  return (
    <details className="mt-3 rounded-md bg-muted/60 px-4 py-2 text-sm [&[open]]:pb-4">
      <summary className="cursor-pointer py-1 font-medium select-none">เฉลย</summary>
      <div className="mt-2 space-y-3">{children}</div>
    </details>
  )
}

/** "พิสูจน์เอง" — คำสั่งจริงที่ผู้อ่านรันเองได้ (หลัก predict-then-verify ของ skill) */
export function Verify({ children }: { children?: ReactNode }) {
  return (
    <p className="mt-3 border-t border-dashed pt-3 text-sm text-muted-foreground">
      <span className="mr-1.5 font-semibold text-foreground">พิสูจน์เอง:</span>
      {children}
    </p>
  )
}

export function Divider({ children }: { children?: ReactNode }) {
  return (
    <div className="my-10 flex items-center gap-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
      <span className="h-px flex-1 bg-border" />
      <span>{children}</span>
      <span className="h-px flex-1 bg-border" />
    </div>
  )
}

export function Checklist({ children }: { children?: ReactNode }) {
  return (
    <section className="my-6 rounded-lg border border-dashed p-4 [&_pre]:my-0">{children}</section>
  )
}

/** directive ที่ไม่รู้จัก — ต้องเห็นได้ ไม่ใช่หายไปเงียบ ๆ */
export function UnknownDirective({ name, inline }: { name?: string; inline?: boolean }) {
  const label = `directive ที่ไม่รู้จัก: ${name ?? '?'}`
  if (inline) {
    return (
      <span className="rounded bg-red-100 px-1 font-mono text-xs text-red-800 dark:bg-red-950 dark:text-red-200">
        {label}
      </span>
    )
  }
  return (
    <div className="my-4 rounded-md border border-red-400 bg-red-50 px-4 py-2 font-mono text-xs text-red-800 dark:bg-red-950/40 dark:text-red-200">
      {label}
    </div>
  )
}

const REF_CLASS =
  'rounded bg-muted px-1 text-[0.9em] underline decoration-dotted underline-offset-2'

/**
 * อ้างถึงไฟล์ในเนื้อความ — กดแล้วเปิดโค้ดจริงจาก commit ที่ pin ไว้ใน panel ข้างเนื้อหา (user story 9)
 *
 * ไม่มี id ของตัวเอง จึงเปิดเป็นช่วงเดี่ยว ๆ (`kind: 'file'`) ไม่ใช่ลำดับการอ่านที่ agent จัดไว้
 */
export function FileRef({
  path,
  lines,
  children,
}: {
  path?: string
  lines?: string
  children?: ReactNode
}) {
  const run = useOptionalRun()
  const panel = useOptionalReadingPanel()
  const className = `${REF_CLASS} font-mono`
  const title = lines ? `${path} บรรทัด ${lines}` : path

  if (!run || !panel || !path) {
    return (
      <span data-file-path={path} data-file-lines={lines} title={title} className={className}>
        {children}
      </span>
    )
  }
  const range = parseLineRange(lines)
  return (
    <button
      type="button"
      onClick={() => panel.openTarget({ kind: 'file', path, from: range.from, to: range.to })}
      data-file-path={path}
      data-file-lines={lines}
      title={`${title} — เปิดโค้ดจริงที่ commit ${run.run.commit.slice(0, 9)}`}
      className={`${className} cursor-pointer hover:bg-amber-100 dark:hover:bg-amber-950`}
    >
      {children}
    </button>
  )
}

/** อ้างถึง reading list ตาม id — กดแล้ว panel เปิดลำดับการอ่านนั้น */
export function ReadRef({ list, children }: { list?: string; children?: ReactNode }) {
  const panel = useOptionalReadingPanel()
  if (!panel || !list) {
    return (
      <span data-reading-list={list} className={REF_CLASS}>
        {children}
      </span>
    )
  }
  return (
    <button
      type="button"
      onClick={() => panel.openTarget({ kind: 'list', listId: list })}
      data-reading-list={list}
      title="เปิดลำดับการอ่านนี้ใน panel ด้านขวา"
      className={`${REF_CLASS} cursor-pointer hover:bg-amber-100 dark:hover:bg-amber-950`}
    >
      {children}
    </button>
  )
}

function metaOf(node: Element | undefined): string {
  const data = node?.data as { meta?: unknown } | undefined
  return typeof data?.meta === 'string' ? data.meta : ''
}

function attrFromMeta(meta: string, key: string): string | undefined {
  const match = new RegExp(`${key}="([^"]*)"`).exec(meta)
  return match?.[1]
}

function textOf(node: Element | undefined): string {
  if (!node) return ''
  return node.children
    .map((child) => (child.type === 'text' ? child.value : ''))
    .join('')
    .replace(/\n$/, '')
}

/**
 * code block: ``` lang title="path/to/file.py" lines="61-79"
 *
 * โค้ดที่ฝังใน markdown เป็น "ตัวอย่างประกอบคำอธิบาย" เท่านั้น
 * โค้ดจริงจาก commit ที่ pin ไว้มาจาก reading list + file API (ตั๋ว #7)
 */
export function CodeFigure({ node }: { node?: Element }) {
  const code = node?.children.find(
    (child): child is Element => child.type === 'element' && child.tagName === 'code',
  )
  const className = (code?.properties?.className ?? []) as string[]
  const lang = className.find((c) => c.startsWith('language-'))?.slice('language-'.length) ?? ''
  const meta = metaOf(code)
  const title = attrFromMeta(meta, 'title')
  const lines = attrFromMeta(meta, 'lines')
  const value = textOf(code)
  const start = Number(lines?.split('-')[0] ?? 0)

  // ```mermaid → ไดอะแกรมที่ layout ให้เอง · การวาดทั้งหมดอยู่หลัง <Diagram/> → src/lib/diagram
  if (lang === 'mermaid') {
    return <Diagram source={value} title={title} />
  }

  const isTerminal = lang === 'console' || lang === 'terminal'

  return (
    <figure className="my-6 overflow-hidden rounded-lg border">
      {title ? (
        <figcaption className="flex items-baseline gap-2 border-b bg-muted/60 px-4 py-1.5 font-mono text-xs">
          <span className="truncate">{title}</span>
          {lines ? <span className="text-muted-foreground">L{lines}</span> : null}
        </figcaption>
      ) : null}
      <pre
        className={cn(
          'overflow-x-auto p-4 font-mono text-xs leading-relaxed',
          isTerminal && 'bg-neutral-900 text-neutral-100',
        )}
      >
        <code>
          {value.split('\n').map((line, i) => (
            <span key={i} className="grid grid-cols-[3.5ch_1fr] gap-3">
              {start > 0 ? (
                <span className="text-right text-muted-foreground select-none">{start + i}</span>
              ) : (
                <span className="select-none" />
              )}
              <span>{line || ' '}</span>
            </span>
          ))}
        </code>
      </pre>
    </figure>
  )
}
