import { BrowserRouter, Route, Routes } from 'react-router-dom'

import { HomePage } from '@/routes/home-page'
import { RunLayout } from '@/routes/run-layout'
import { SectionPage } from '@/routes/section-page'

/**
 * URL ทุกอันเปิดตรงได้ (ส่งลิงก์ให้เพื่อนได้):
 *   /                       รายการ run ทั้งหมด
 *   /r/<runId>              หน้าแรกของ run (section แรก)
 *   /r/<runId>/<sectionId>  section ใดก็ได้
 *
 * โค้ดไม่ใช่ "หน้า" — มันเปิดใน panel ข้างเนื้อหา (ดู components/run/reading-panel.tsx)
 * เพื่อให้ผู้อ่านเห็นคำอธิบายกับโค้ดพร้อมกัน และ panel รอดข้ามการสลับ section
 */
export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/r/:runId" element={<RunLayout />}>
          <Route index element={<SectionPage />} />
          <Route path=":sectionId" element={<SectionPage />} />
        </Route>
        <Route
          path="*"
          element={
            <main className="mx-auto max-w-3xl px-8 py-16">
              <p className="text-muted-foreground">ไม่มีหน้านี้</p>
            </main>
          }
        />
      </Routes>
    </BrowserRouter>
  )
}
