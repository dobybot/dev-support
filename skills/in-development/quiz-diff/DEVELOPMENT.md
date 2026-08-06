# quiz-diff — Development notes

บันทึก design decisions ของ skill นี้ — อ่านก่อนแก้ SKILL.md เสมอ และอัพเดตเมื่อตัดสินใจใหม่

## สถานะ

**Experiment.** ยังไม่ล็อกพฤติกรรม — เป้าหมายของเฟสนี้คือเก็บข้อมูลว่า config แบบไหน
ทำให้คนเข้าใจ PR ได้จริง จึงเปิดทุกอย่างเป็น config และบังคับเก็บ experiment log ทุก session

## หลักการ (ทำไมถึงออกแบบแบบนี้)

- **Errorful learning / productive failure**: คนจำลึกกว่าเมื่อได้ผิดเองก่อนแล้วค่อยเข้าใจ —
  แต่ได้ผลก็ต่อเมื่อสุดท้ายมี corrective feedback ดังนั้น `max-frustration` ไม่ใช่ nice-to-have
  แต่เป็นเงื่อนไขที่ทำให้วิธีนี้ work (ปล่อยวนไม่จบ = user เลิกใช้ + อาจจำผิดถาวร)
- **Retrieval practice**: การถูกบังคับดึงความรู้ออกมา ชนะการอ่านซ้ำ — จึงไม่เฉลยตอนผิด
  ให้ user ต้องขุดหาเอง (open-book ได้ เพราะ "หาคำตอบจากโค้ดจริง" คือ skill ที่ใช้ตอน verify จริง)
- **Misconception hunter, ไม่ใช่ quiz ให้คะแนน**: ตัวหลอกแต่ละตัว = misconception เฉพาะ 1 อย่าง
  เพื่อให้ทุกคำตอบผิดเป็นข้อมูล diagnose ได้ · output ที่มีค่าคือ coverage map ไม่ใช่คะแนน

## Decisions

- **รันใน chat ธรรมดา ไม่ใช้ viewer app** (2026-08-06) — เบา เริ่มทดลองได้เร็ว
  ถ้า format พิสูจน์แล้วว่า work ค่อยพิจารณาย้ายเข้า viewer ของ learn-diff
- **mastery ต้องถูก ≥ 2 ครั้งจากคนละมุม (default)** — กันเดามั่วถูก (4 choices = 25%)
  และกันการผ่านเพราะตัดตัวเลือก
- **ถามเหตุผลหลังตอบถูกแบบสุ่ม (~1/3)** — กัน pattern-matching และได้ข้อมูล diagnose เพิ่ม
  ไม่ถามทุกครั้งเพราะจะน่าเบื่อ
- **Pin commit + generate คำถามจาก diff จริงเท่านั้น** — คำถามที่เฉลยผิดเองทำลาย trust
  ของทั้ง skill ทันที (บทเรียนเดียวกับ learn-diff)
- **Manual-only trigger** (2026-08-06) — ตัด trigger phrases ออกจาก description และระบุ
  ห้าม model เรียกใช้เอง ให้ทำงานเฉพาะเมื่อ user พิมพ์ `/quiz-diff` เท่านั้น
- **แนะนำ fable-low + chat ใหม่ก่อนเริ่ม แต่ user confirm ไปต่อได้** (2026-08-06) —
  chat ที่คุยเรื่อง PR ค้างไว้มีเฉลยปนใน context และงานตั้งคำถามไม่ต้องใช้ model แรง/effort สูง ·
  เป็นคำแนะนำ ไม่ใช่ hard block
- **ต่อกับ learn-diff แบบหลวม ๆ**: ใช้ syllabus/checklist จาก learn-diff run ถ้ามี
  แต่ไม่บังคับ — quiz-diff standalone ได้

## Field feedback

- **2026-08-06 — prompt suggestion เฉลยคำตอบ**: ตอนลองใช้จริง auto-suggest ในช่องพิมพ์
  ของ Claude Code เดาคำตอบที่ถูกให้เห็นก่อนตอบ · ตรวจแล้ว: ปิดได้เฉพาะ global
  (`/config` toggle หรือ `CLAUDE_CODE_ENABLE_PROMPT_SUGGESTION=false`, มีตั้งแต่ v2.1.205)
  ไม่มีทางให้ skill/model ปิดเฉพาะ session → แก้โดยให้ skill เตือน user ตอนเริ่ม quiz
  ให้ปิดเองชั่วคราว

## Rejected ideas

- **คำถาม "หา bug ที่ฉันแอบใส่"** (agent แปลง diff จริงให้พังนิดเดียว แล้วให้ทายว่า
  เวอร์ชันไหนของจริง) — เสนอ 2026-08-06, ตัดสินใจไม่ทำ: user ปฏิเสธ ("ยังไม่เอา")
  อย่านำกลับมาโดยไม่ถามก่อน

## Open questions (รอข้อมูลจาก experiment log)

- `feedback` mode ไหน work สุด — `hint` vs `socratic`?
- default `mastery=2` พอไหม หรือมากไปจนน่าเบื่อ?
- `max-frustration=3` เหมาะไหม?
- ควรมี free-text answer mode (ไม่ใช่ multiple choice) ไหม?
