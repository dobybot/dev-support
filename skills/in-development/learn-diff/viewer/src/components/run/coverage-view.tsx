import { BookOpen } from 'lucide-react'
import { useMemo } from 'react'

import { useReadingPanelState } from '@/components/run/panel-context'
import { useReadStateValue } from '@/components/run/read-state-context'
import type { UncoveredHunk } from '@/lib/read-state'

/**
 * Coverage view (SPEC-reading-checklist) — อยู่บนหน้า verify เหนือ checklist เดิม
 *
 * ตอบคำถามที่เดิมถามไม่ได้: "reading list พาไปเห็นทุกบรรทัดที่ PR แตะหรือเปล่า" —
 * วัดกับ `git diff` ไม่ใช่กับ reading list · uncovered โชว์ตั้งแต่ยังไม่ติ๊กอะไร (story 13)
 * เพราะมันเป็นคำเตือนเรื่อง curation ไม่ใช่เรื่องความขยันของผู้อ่าน
 *
 * view นี้ annotate หน้า verify เฉย ๆ ไม่เขียนอะไรลง checklist — กฎ PD-by-default ไม่ถูกแตะ
 */
export function CoverageView() {
  const readState = useReadStateValue()
  const panel = useReadingPanelState()
  const { coverage, coverageReason } = readState

  const byFile = useMemo(() => {
    const map = new Map<string, UncoveredHunk[]>()
    for (const hunk of coverage?.uncovered ?? []) {
      const bucket = map.get(hunk.path)
      if (bucket) bucket.push(hunk)
      else map.set(hunk.path, [hunk])
    }
    return [...map.entries()]
  }, [coverage])

  if (!coverage) {
    if (!coverageReason) return null
    return (
      <section data-coverage-view className="mt-6 rounded-lg border border-dashed px-4 py-3 text-sm">
        <h3 className="font-semibold">coverage ของการอ่าน</h3>
        <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
          วัด coverage ไม่ได้ — {coverageReason}
        </p>
        {/* เหตุที่วัดไม่ได้บางอย่างแก้ได้ระหว่างหน้ายังเปิดอยู่ (git fetch base, server ที่เพิ่งกลับมา)
            — ต้องมีทางลองใหม่ ไม่ใช่ดับยาวจนกว่าจะ reload ทั้งหน้า */}
        <button
          type="button"
          onClick={readState.reloadCoverage}
          className="mt-2 rounded border px-1.5 py-0.5 text-xs hover:bg-muted"
        >
          ลองวัดใหม่
        </button>
      </section>
    )
  }

  return (
    <section data-coverage-view className="mt-6 rounded-lg border px-4 py-3 text-sm">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="font-semibold">coverage ของการอ่าน</h3>
        <span className="font-mono text-xs text-muted-foreground" data-coverage-summary>
          {coverage.pct}% — อ่านแล้ว {coverage.coveredChanged} จาก {coverage.totalChanged}{' '}
          บรรทัดที่เปลี่ยน
        </span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        วัดกับ diff จริงของ PR ไม่ใช่กับ reading list — อ่านครบทุก list ก็ยังไม่เท่ากับเห็นครบทั้ง
        diff
      </p>

      {byFile.length === 0 ? (
        <p className="mt-3 text-xs text-green-700 dark:text-green-400">
          reading list ครอบคลุมทุกบรรทัดที่เปลี่ยนแล้ว — ไม่มีโค้ดตกหล่นจากการ curate
        </p>
      ) : (
        <div className="mt-3">
          {/* คำเตือนเรื่อง curation: agent ไม่ได้พาไปอ่านโค้ดพวกนี้ ติ๊ก checkbox เท่าไรก็ไม่ช่วย (story 11) */}
          <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
            โค้ดที่เปลี่ยนแต่ไม่อยู่ใน reading list ไหนเลย:
          </p>
          <ul className="mt-2 space-y-1">
            {byFile.map(([path, hunks]) => (
              <li key={path} className="text-xs">
                <span className="font-mono break-all">{path}</span>
                <ul className="mt-1 ml-4 space-y-1">
                  {hunks.map((hunk) => (
                    <li key={hunk.hash} className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-muted-foreground">
                        บรรทัด {hunk.from}
                        {hunk.to !== hunk.from ? `–${hunk.to}` : ''}
                      </span>
                      {readState.isSpanRead(hunk.hash) ? (
                        <span className="text-green-700 dark:text-green-400">อ่านแล้ว</span>
                      ) : null}
                      {/* เปิดใน panel ตรงนี้เลย — ปิด coverage gap โดยไม่ต้องออกจาก viewer (story 12)
                          ส่ง hash ของ hunk ที่กดไปด้วย: panel เลื่อนไปหาการ์ดใบนั้นในรายการ
                          ไม่งั้นปุ่มของทุก hunk หลังใบแรกจะเป็นคลิกตาย (รายการเปิดอยู่แล้ว) */}
                      <button
                        type="button"
                        onClick={() => panel.openTarget({ kind: 'uncovered', hash: hunk.hash })}
                        className="flex items-center gap-1 rounded border px-1.5 py-0.5 hover:bg-muted"
                        title="เปิดช่วงนี้ใน panel (พร้อมช่วงที่ไม่ครอบคลุมอื่น ๆ) — ติ๊กอ่านแล้วจะนับเข้า coverage"
                      >
                        <BookOpen className="size-3" aria-hidden />
                        เปิดอ่าน
                      </button>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
