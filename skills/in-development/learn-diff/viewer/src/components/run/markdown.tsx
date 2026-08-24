import ReactMarkdown, { type Components } from 'react-markdown'

import { BoxMap } from './box-map'
import {
  Answer,
  Checklist,
  CodeFigure,
  Divider,
  Note,
  Question,
  Tldr,
  UnknownDirective,
  Verify,
} from './directives'
import { dataAttr, DirectiveSpan, REMARK_PLUGINS } from './inline-md'
import { ReconciliationTable } from './reconciliation-table'

type DivProps = React.ComponentPropsWithoutRef<'div'> & { node?: unknown }

/** div dispatcher — container/leaf directive ทุกตัวถูกแปลงเป็น div + data-ld */
function DirectiveBlock(props: DivProps) {
  const { children, node: _node, ...rest } = props
  switch (dataAttr(props, 'data-ld')) {
    case 'tldr':
      return <Tldr>{children}</Tldr>
    case 'note':
      return <Note type={dataAttr(props, 'data-type')}>{children}</Note>
    case 'question':
      return <Question id={dataAttr(props, 'data-qid')}>{children}</Question>
    case 'answer':
      return <Answer>{children}</Answer>
    case 'verify':
      return <Verify>{children}</Verify>
    case 'divider':
      return <Divider>{children}</Divider>
    case 'checklist':
      return <Checklist>{children}</Checklist>
    // structured data — มาจาก run.json ไม่ใช่จาก markdown
    case 'reconciliation':
      return <ReconciliationTable />
    case 'box-map':
      return <BoxMap />
    case 'unknown':
      return <UnknownDirective name={dataAttr(props, 'data-name')} />
    default:
      return <div {...rest}>{children}</div>
  }
}

const COMPONENTS: Components = {
  div: DirectiveBlock,
  span: DirectiveSpan,
  pre: CodeFigure,
  h1: ({ children }) => <h1 className="mt-10 mb-3 text-2xl font-semibold tracking-tight">{children}</h1>,
  h2: ({ children }) => <h2 className="mt-10 mb-3 text-xl font-semibold tracking-tight">{children}</h2>,
  h3: ({ children }) => <h3 className="mt-6 mb-2 text-base font-semibold">{children}</h3>,
  p: ({ children }) => <p className="my-4 leading-7">{children}</p>,
  ul: ({ children }) => <ul className="my-4 list-disc space-y-1.5 pl-6 leading-7">{children}</ul>,
  ol: ({ children }) => <ol className="my-4 list-decimal space-y-1.5 pl-6 leading-7">{children}</ol>,
  blockquote: ({ children }) => (
    <blockquote className="my-4 border-l-4 pl-4 text-muted-foreground italic">{children}</blockquote>
  ),
  a: ({ children, href }) => (
    <a href={href} className="underline underline-offset-2" target="_blank" rel="noreferrer">
      {children}
    </a>
  ),
  code: ({ children }) => (
    <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">{children}</code>
  ),
  table: ({ children }) => (
    <div className="my-6 overflow-x-auto rounded-lg border">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-muted/60 text-left">{children}</thead>,
  th: ({ children }) => <th className="px-3 py-2 font-medium">{children}</th>,
  tr: ({ children }) => <tr className="border-t align-top">{children}</tr>,
  td: ({ children }) => <td className="px-3 py-2">{children}</td>,
  hr: () => <hr className="my-8" />,
}

/** เนื้อหาหนึ่งหน้า — markdown + directive ตาม content contract */
export function Prose({ markdown }: { markdown: string }) {
  return (
    <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={COMPONENTS}>
      {markdown}
    </ReactMarkdown>
  )
}
