import { BookOpen } from 'lucide-react'
import { useCallback, useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'

import { BoxBadge } from '@/components/run/box-badge'
import { InlineMd } from '@/components/run/inline-md'
import { Prose } from '@/components/run/markdown'
import { useReadingPanelState } from '@/components/run/panel-context'
import { useRun, useRunChanges } from '@/components/run/run-context'
import { ErrorBox, Loading, PendingSection } from '@/components/run/status'
import { ApiClientError, fetchPage } from '@/lib/api'
import { useAsync } from '@/lib/use-async'
import { sectionFileName } from '@/shared/sections'

/** section แรกคือหน้า index — `/r/<id>` เข้ามาที่นี่โดยไม่มี sectionId */
export function SectionPage() {
  const { data, run } = useRun()
  const panel = useReadingPanelState()
  const params = useParams()
  const sectionId = params.sectionId ?? data.sections[0].id
  const section = data.sections.find((s) => s.id === sectionId)

  const load = useCallback(() => fetchPage(run.id, sectionId), [run.id, sectionId])
  const page = useAsync(load, [run.id, sectionId])
  const { reload } = page

  // ไฟล์ของหน้านี้ถูกเขียน/แก้ = โหลดใหม่เฉพาะตรงนี้ เปลือกกับ nav ไม่ถูกแตะ
  const file = section ? sectionFileName(section) : null
  const { lastChange, connectedAt } = useRunChanges()
  useEffect(() => {
    if (!file) return
    if (connectedAt && !lastChange) {
      // เพิ่งต่อสายติด — ช่วงก่อนหน้านั้นไฟล์อาจถูกเขียนไปแล้วโดยไม่มี event
      reload()
      return
    }
    if (lastChange?.files.includes(file)) reload()
  }, [file, lastChange, connectedAt, reload])

  const index = data.sections.findIndex((s) => s.id === sectionId)
  const prev = index > 0 ? data.sections[index - 1] : null
  const next = index >= 0 && index < data.sections.length - 1 ? data.sections[index + 1] : null

  if (!section) {
    return <ErrorBox error={new Error(`run นี้ไม่มี section "${sectionId}"`)} title="ไม่พบ section" />
  }

  const errorCode = page.error instanceof ApiClientError ? page.error.code : null
  const pending = errorCode === 'section_pending'

  return (
    <article>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-semibold tracking-tight">{section.title}</h2>
        {section.box ? <BoxBadge box={section.box} /> : null}
        {/* ทางเข้าโค้ดของ section นี้ — เปิดลำดับการอ่านที่ agent จัดไว้ใน panel ด้านขวา */}
        {section.readingList ? (
          <button
            type="button"
            onClick={() => panel.openTarget({ kind: 'list', listId: section.readingList! })}
            className="ml-auto flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs hover:bg-muted"
          >
            <BookOpen className="size-3.5" aria-hidden />
            อ่านโค้ดของหัวข้อนี้
          </button>
        ) : null}
      </div>
      {section.subtitle ? (
        <div className="mt-1 text-sm text-muted-foreground">
          <InlineMd>{section.subtitle}</InlineMd>
        </div>
      ) : null}

      {page.loading ? <Loading /> : null}
      {/* ยังไม่เขียน ≠ พัง — กล่องรอเขียนกลายเป็นเนื้อหาเองเมื่อ SSE บอกว่าไฟล์มาแล้ว */}
      {pending && !page.data ? <PendingSection /> : null}
      {page.error && !pending && !page.data ? (
        <ErrorBox error={page.error} title="โหลดหน้านี้ไม่สำเร็จ" />
      ) : null}
      {/* key = section: การสลับหน้าต้อง mount prose ใหม่ทั้งก้อน เพื่อให้ตัว render ที่ทำงานกับ DOM ตรง ๆ
          (mermaid ของ #6, highlighter ของ #7) เริ่มรอบใหม่แทนที่จะเจอ container ของหน้าเดิม */}
      {page.data ? <Prose key={sectionId} markdown={page.data.markdown} /> : null}

      <nav className="mt-12 flex justify-between gap-4 border-t pt-4 text-sm">
        {prev ? (
          <Link to={`/r/${run.id}/${prev.id}`} className="underline underline-offset-2">
            ← {prev.title}
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link to={`/r/${run.id}/${next.id}`} className="underline underline-offset-2">
            {next.title} →
          </Link>
        ) : (
          <span />
        )}
      </nav>
    </article>
  )
}
