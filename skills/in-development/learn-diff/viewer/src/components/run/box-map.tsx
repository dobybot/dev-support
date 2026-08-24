import { BookOpen } from 'lucide-react'
import { Link } from 'react-router-dom'

import { BoxBadge } from './box-badge'
import { InlineMd } from './inline-md'
import { useReadingPanelState } from './panel-context'
import { useRun } from './run-context'

/**
 * แผนที่กล่อง — บอกว่าจะอ่านโค้ดส่วนไหนลึกแค่ไหน (ข้อมูลจาก run.json)
 * แถวที่มี section จะลิงก์ไปหน้านั้น; แถว blackbox ที่อธิบายจบในตัวจะไม่มีลิงก์
 *
 * แถวที่มี reading list มีปุ่ม "อ่านโค้ด" เปิด panel ด้านขวาได้จากตรงนี้เลย (user story 10) —
 * แผนการอ่านกับทางเข้าโค้ดจึงเป็นของชิ้นเดียวกัน ไม่ต้องเข้าหน้า section ก่อน
 */
export function BoxMap() {
  const { run, data } = useRun()
  const panel = useReadingPanelState()
  const rows = data.boxMap ?? []
  if (rows.length === 0) {
    return <p className="my-4 text-sm text-muted-foreground">run นี้ไม่มี box map</p>
  }
  /** แถวที่ไม่ได้ระบุ readingList เอง ใช้ของ section ที่มันชี้ไป — "ลำดับการอ่านของส่วนนั้น" */
  const listOf = (rowList?: string, sectionId?: string): string | undefined =>
    rowList ?? data.sections.find((s) => s.id === sectionId)?.readingList

  return (
    <div className="my-6 rounded-lg border">
      {/* table-fixed: path ยาว ๆ ใน "ส่วน" ต้องหักบรรทัดในคอลัมน์ตัวเอง ไม่ใช่ดันคอลัมน์อื่น
          ตกขอบจอ (issue #32) — ความกว้างกำหนดที่ <th> ปุ่ม "อ่านโค้ด" จึงอยู่ในจอเสมอ */}
      <table className="w-full table-fixed border-collapse text-sm">
        <thead className="bg-muted/60 text-left">
          <tr>
            <th className="px-3 py-2 font-medium">ส่วน</th>
            <th className="w-24 px-3 py-2 font-medium whitespace-nowrap">กล่อง</th>
            <th className="w-[30%] px-3 py-2 font-medium">เหตุผล</th>
            <th className="w-28 px-3 py-2 font-medium whitespace-nowrap">โค้ด</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const listId = listOf(row.readingList, row.section)
            return (
              <tr key={row.id} className="border-t align-top" data-reading-list={listId}>
                <td className="px-3 py-2">
                  {row.section ? (
                    <Link
                      to={`/r/${run.id}/${row.section}`}
                      className="font-medium break-words underline underline-offset-2"
                    >
                      {row.title}
                    </Link>
                  ) : (
                    <span className="font-medium break-words">{row.title}</span>
                  )}
                  {row.files ? (
                    /* break-all: path ไม่มีช่องว่างให้หักตามคำ — ยอมหักกลาง path
                       ดีกว่าปล่อยให้บรรทัดเดียวลากทั้งตารางตกจอ (issue #32) */
                    <div className="mt-0.5 font-mono text-xs break-all text-muted-foreground">
                      {Array.isArray(row.files) ? row.files.join(' · ') : row.files}
                    </div>
                  ) : null}
                </td>
                <td className="px-3 py-2">
                  <BoxBadge box={row.box} />
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  <InlineMd>{row.reason}</InlineMd>
                </td>
                <td className="px-3 py-2">
                  {listId ? (
                    <button
                      type="button"
                      onClick={() => panel.openTarget({ kind: 'list', listId })}
                      title={`เปิดลำดับการอ่านของ "${row.title}" ใน panel ด้านขวา`}
                      className="flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs whitespace-nowrap hover:bg-muted"
                    >
                      <BookOpen className="size-3.5" aria-hidden />
                      อ่านโค้ด
                    </button>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
