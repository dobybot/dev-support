import { ApiClientError } from '@/lib/api'

export function Loading({ label = 'กำลังโหลด…' }: { label?: string }) {
  return <p className="py-16 text-center text-sm text-muted-foreground">{label}</p>
}

/** error ต้องบอกให้ชัดว่าอะไรพังและพังตรงไหน — ห้ามหน้าเปล่า */
export function ErrorBox({ error, title = 'โหลดไม่สำเร็จ' }: { error: Error; title?: string }) {
  const code = error instanceof ApiClientError ? error.code : 'client_error'
  return (
    <div className="my-8 rounded-lg border border-red-400 bg-red-50 px-5 py-4 dark:bg-red-950/30">
      <p className="font-semibold text-red-900 dark:text-red-200">{title}</p>
      <p className="mt-1 text-sm text-red-900/90 dark:text-red-200/90">{error.message}</p>
      <p className="mt-2 font-mono text-xs text-red-900/70 dark:text-red-200/70">{code}</p>
    </div>
  )
}

/**
 * section ที่ประกาศไว้ใน run.json แล้วแต่ยังไม่มีไฟล์ — "ยังไม่ถึงคิว" ไม่ใช่ "พัง"
 * หน้านี้จะเปลี่ยนเป็นเนื้อหาเองเมื่อ agent เขียนไฟล์เสร็จ (SSE) โดยไม่ต้อง refresh
 */
export function PendingSection({ title }: { title?: string }) {
  return (
    <div className="my-8 rounded-lg border border-dashed px-6 py-10 text-center">
      <p className="flex items-center justify-center gap-2 font-medium">
        <span className="relative flex size-2">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-amber-500 opacity-75" />
          <span className="relative inline-flex size-2 rounded-full bg-amber-500" />
        </span>
        {title ?? 'หน้านี้ยังเขียนไม่เสร็จ'}
      </p>
      <p className="mt-2 text-sm text-muted-foreground">
        agent ยังเขียนไม่ถึง — เนื้อหาจะขึ้นเองตรงนี้เมื่อไฟล์ถูกเขียน ไม่ต้อง refresh
      </p>
    </div>
  )
}

export interface Warning {
  code: string
  message: string
  where?: string
}

function WarningItem({ item }: { item: Warning }) {
  return (
    <li>
      {item.message}
      <span className="ml-2 font-mono text-xs text-amber-900/70 dark:text-amber-200/70">
        {item.where ? `${item.where} · ` : ''}
        {item.code}
      </span>
    </li>
  )
}

/**
 * ผลการตรวจจาก server (server/validate.ts) — ต้อง "ดัง" และอยู่เหนือเนื้อหาเสมอ
 *
 * ของพวกนี้แปลว่าผู้อ่านกำลังจะกดอะไรบางอย่างแล้วไม่มีอะไรเกิดขึ้น (reading list ที่ไม่มีจริง,
 * node id ที่ไม่มีในไดอะแกรม, ช่วงบรรทัดที่หลุดจากไฟล์จริง) — กดแล้วเงียบคือผลลัพธ์ที่แย่ที่สุด
 * เพราะผู้อ่านจะสรุปว่า "หน้านี้พัง" แทนที่จะรู้ว่า "ตรงนี้ agent เขียนพิกัดผิด แล้วบอกให้แก้ได้"
 */
export function Warnings({ items }: { items: Warning[] }) {
  if (items.length === 0) return null
  const head = items.slice(0, 6)
  const rest = items.slice(6)
  return (
    <div className="my-6 rounded-lg border border-amber-500 bg-amber-50 px-5 py-4 dark:bg-amber-950/30">
      <p className="font-semibold">
        เนื้อหามีจุดที่ไม่สอดคล้องกัน {items.length} จุด — กดบางที่แล้วอาจไม่มีอะไรขึ้น
      </p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
        {head.map((item, i) => (
          <WarningItem key={i} item={item} />
        ))}
      </ul>
      {rest.length > 0 ? (
        <details className="mt-2">
          <summary className="cursor-pointer text-sm font-medium select-none">
            อีก {rest.length} จุด
          </summary>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            {rest.map((item, i) => (
              <WarningItem key={i} item={item} />
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  )
}
