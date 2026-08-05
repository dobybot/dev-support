import ReactMarkdown, { type Components } from 'react-markdown'
import remarkDirective from 'remark-directive'
import remarkGfm from 'remark-gfm'

import { remarkLearnDiff } from '@/lib/remark-learn-diff'
import { FileRef, ReadRef, UnknownDirective } from './directives'

export const REMARK_PLUGINS = [remarkGfm, remarkDirective, remarkLearnDiff]

type SpanProps = React.ComponentPropsWithoutRef<'span'> & { node?: unknown }

/** data attribute ที่ remark plugin ใส่ไว้ — ไม่อยู่ใน type ของ React จึงต้องอ่านแบบนี้ */
export function dataAttr(props: object, key: string): string | undefined {
  const value = (props as Record<string, unknown>)[key]
  return typeof value === 'string' ? value : undefined
}

/** span dispatcher — inline directive ทุกตัวถูกแปลงเป็น span + data-ld */
export function DirectiveSpan(props: SpanProps) {
  const { children, node: _node, ...rest } = props
  switch (dataAttr(props, 'data-ld')) {
    case 'file':
      return (
        <FileRef path={dataAttr(props, 'data-path')} lines={dataAttr(props, 'data-lines')}>
          {children}
        </FileRef>
      )
    case 'read':
      return <ReadRef list={dataAttr(props, 'data-list')}>{children}</ReadRef>
    case 'unknown':
      return <UnknownDirective name={dataAttr(props, 'data-name')} inline />
    default:
      return <span {...rest}>{children}</span>
  }
}

const INLINE_COMPONENTS: Components = {
  // เนื้อหาสั้น ๆ ใน cell ของตาราง: ไม่ต้องการ <p> ที่กินระยะบรรทัด
  p: ({ children }) => <>{children}</>,
  span: DirectiveSpan,
  code: ({ children }) => (
    <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">{children}</code>
  ),
}

/** markdown แบบ inline สำหรับ cell ในตาราง / subtitle — ไม่มี block element */
export function InlineMd({ children }: { children?: string }) {
  if (!children) return null
  return (
    <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={INLINE_COMPONENTS}>
      {children}
    </ReactMarkdown>
  )
}
