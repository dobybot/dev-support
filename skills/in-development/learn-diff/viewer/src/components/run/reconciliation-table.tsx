import type { ReconRow, ReconStatus } from '@/shared/types'
import { InlineMd } from './inline-md'
import { useRun } from './run-context'

/**
 * ตาราง intent reconciliation — ข้อมูลมาจาก run.json ไม่ใช่จาก markdown
 * (สามหมวดตามหลักของ skill: ขอ+ทำ / ขอ+ไม่ได้ทำ / ไม่ได้ขอ+ทำ)
 */

const GROUPS: { status: ReconStatus; heading: string; columns: [string, string, string]; rowClass: string }[] = [
  {
    status: 'done',
    heading: '✅ ขอ + ทำแล้ว',
    columns: ['สเปกข้อ', 'สิ่งที่ขอ', 'ยืนยันที่'],
    rowClass: '',
  },
  {
    status: 'missing',
    heading: '⚠️ ขอ แต่ยังไม่ได้ทำ',
    columns: ['สเปกข้อ', 'สิ่งที่ขาด', 'สถานะจริง'],
    rowClass: 'bg-amber-50/70 dark:bg-amber-950/20',
  },
  {
    status: 'unrequested',
    heading: '🚨 ไม่ได้ขอ แต่ทำ',
    columns: ['อ้างอิง', 'สิ่งที่ทำเกิน', 'ความเสี่ยง'],
    rowClass: 'bg-red-50/70 dark:bg-red-950/20',
  },
]

function Group({
  heading,
  columns,
  rows,
  rowClass,
}: {
  heading: string
  columns: [string, string, string]
  rows: ReconRow[]
  rowClass: string
}) {
  if (rows.length === 0) return null
  return (
    <section className="my-6">
      <h3 className="mb-2 text-base font-semibold">{heading}</h3>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-muted/60 text-left">
            <tr>
              {columns.map((col) => (
                <th key={col} className="px-3 py-2 font-medium whitespace-nowrap">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className={`border-t align-top ${rowClass}`}>
                <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">{row.ref ?? '—'}</td>
                <td className="px-3 py-2">
                  <InlineMd>{row.what}</InlineMd>
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  <InlineMd>{row.note}</InlineMd>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export function ReconciliationTable({ only }: { only?: ReconStatus }) {
  const { data } = useRun()
  const rows = data.reconciliation ?? []
  if (rows.length === 0) {
    return <p className="my-4 text-sm text-muted-foreground">run นี้ไม่มีข้อมูล reconciliation</p>
  }
  const groups = only ? GROUPS.filter((g) => g.status === only) : GROUPS
  return (
    <>
      {groups.map((group) => (
        <Group
          key={group.status}
          heading={group.heading}
          columns={group.columns}
          rowClass={group.rowClass}
          rows={rows.filter((row) => row.status === group.status)}
        />
      ))}
    </>
  )
}
