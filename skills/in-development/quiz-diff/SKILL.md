---
name: quiz-diff
description: "Quiz the user on a PR (one question, 4 choices, loop until mastery) — wrong answers get no reveal; each mistake spawns a new question targeting the misconception. MANUAL-ONLY: never trigger this skill yourself — use it only when the user explicitly invokes /quiz-diff."
argument-hint: "A PR number, PR URL, or a branch that has an open PR. Optional config flags after the PR, e.g. `/quiz-diff 42 feedback=hint scope=pm`."
---

# /quiz-diff — พิสูจน์ว่าเข้าใจจริง ด้วยการให้ผิดเอง

> Maintainer note: ก่อนแก้ skill นี้ อ่าน [DEVELOPMENT.md](DEVELOPMENT.md) ก่อนเสมอ —
> มันบันทึก design decisions และไอเดียที่ตัดสินใจ *ไม่ทำ* ไว้แล้ว

**Core principle:** คนเรียนรู้ลึกที่สุดจากความผิดพลาดของตัวเอง (errorful learning +
retrieval practice) skill นี้จึง **ไม่ใช่ quiz ให้คะแนน** แต่เป็น **misconception hunter**:
ทุกคำตอบผิดคือข้อมูล diagnose ว่า mental model ของ user พังตรงไหน แล้วโจมตีจุดนั้น
ด้วยคำถามใหม่จากมุมอื่น จนกว่า user จะตอบถูก *ด้วยความเข้าใจ* ไม่ใช่เพราะตัดตัวเลือกจนเหลือตัวเดียว

**นี่คือ experiment** — พฤติกรรมหลักปรับได้ผ่าน config (ดูข้างล่าง) และทุก session
ต้องเก็บ log ไว้ให้คนทำ experiment วิเคราะห์ทีหลัง

## ขั้นตอน

### 0. เช็ค environment ก่อนเริ่ม

Setup ที่แนะนำคือ **model `fable-low` + chat ใหม่ที่ยังไม่มีบทสนทนาค้าง** — chat ที่คุยเรื่อง
PR นี้มาก่อน (เช่นเพิ่งรัน learn-diff) ทำให้ context มีเฉลยปนอยู่ และ model แรง/effort สูง
ไม่จำเป็นกับงานตั้งคำถาม ถ้าเช็คแล้วพบว่า **chat นี้มีบทสนทนาค้างอยู่ หรือ model ปัจจุบัน
ไม่ใช่ fable-low** ให้แนะนำ user ก่อนเริ่มว่า: เปิด chat ใหม่ สลับ model เป็น fable-low
แล้วค่อยรัน `/quiz-diff` — **แต่ถ้า user ยืนยันว่าจะไปต่อใน chat นี้/model นี้ ก็ไปต่อได้**
ไม่ต้องบังคับ

### 1. รับ PR และ config

- ต้องมี PR (number, URL, หรือ branch ที่มี PR เปิดอยู่) — ไม่มี = หยุด แล้วบอกวิธีเปิด draft PR
  (เหมือน learn-diff): `gh pr create --draft --fill`
- Pin commit: ใช้ `gh pr view` + `gh pr diff` ณ head SHA ปัจจุบัน — **คำถามทุกข้อต้อง
  generate จาก diff จริงที่ pin ไว้ ไม่ใช่จากความจำ** คำถามที่เฉลยผิดเองทำลายความเชื่อใจทันที
- อ่าน config จาก argument (`key=value` คั่นด้วย space) — ค่าที่ไม่ระบุใช้ default:

| key | ค่า | default | ความหมาย |
|---|---|---|---|
| `feedback` | `none` / `hint` / `socratic` | `hint` | ตอบผิดแล้วบอกอะไร: แค่ "ผิด" / ผิด + ใบ้แนวที่คิดพลาด / ตอบกลับด้วยคำถามชวนคิด |
| `mastery` | ตัวเลข ≥ 1 | `2` | เรื่องเดียวกันต้องตอบถูกกี่ครั้ง (คนละมุม) ถึงนับว่าเข้าใจ |
| `scope` | `pm` / `full` / ชื่อ section | `full` | ถามแค่ระดับ product / ทั้ง PR ทุก depth / เฉพาะ section |
| `allow-peek` | `yes` / `no` | `yes` | เปิดโค้ดดูระหว่างตอบได้ไหม — `yes` คือ open-book ซึ่งฝึก skill "หาคำตอบจากโค้ดจริง" ที่ใช้ตอน verify จริง |
| `max-frustration` | ตัวเลข ≥ 1 | `3` | ผิดซ้ำใน item เดียวกันกี่รอบแล้วค่อยเฉลย + อธิบายเต็ม (mark เป็น "reviewed but not mastered") |

- ถ้ามี run ของ learn-diff สำหรับ PR นี้ (ถาม user หรือหาใน viewer output) ใช้ section
  structure + verification checklist ของมันเป็น **syllabus** — checklist ข้อไหนยังไม่ผ่าน quiz
  แปลว่ายัง verify ไม่ได้ · ถ้าไม่มี ให้สร้าง syllabus เองจาก diff: แบ่งเป็น concept items
  ไล่จาก PM-level (ทำไมมี change นี้ / พฤติกรรมระบบเปลี่ยนยังไง) ลงไปถึงจุดที่ลึกเท่าที่
  การ verify ต้องการเท่านั้น

### 2. ยืนยัน config กับ user ก่อนเริ่ม

แสดงตาราง config ที่จะใช้ **ทุกตัว** (ทั้งที่ user ระบุมาและที่ตกเป็น default พร้อมบอกว่า
ตัวไหนคือ default) แล้ว**ถามว่าจะปรับตัวไหนไหม — รอคำตอบก่อน อย่าเริ่ม quiz ทันที** ·
เหตุผล: นี่คือ experiment ที่อยากให้ user ลอง config หลายแบบ ถ้าเริ่มด้วย default เงียบ ๆ
user ส่วนใหญ่จะไม่รู้ด้วยซ้ำว่าปรับอะไรได้ · user ตอบว่าเอาตามนี้/ปรับเสร็จแล้ว ค่อยไปขั้นถัดไป

### 3. สร้าง syllabus แล้วแจ้ง user

บอก user ก่อนเริ่ม: มีกี่ item และกติกา — **ตอบผิดจะไม่เฉลย** จะถามใหม่
จนกว่าจะตอบเองได้ ถ้าอยากยอมแพ้ item ไหนพิมพ์ `เฉลย` ได้ (นับเป็น not mastered)

**เตือนเรื่อง prompt suggestion ด้วย**: auto-suggest ในช่องพิมพ์ของ Claude Code
อาจเดาคำตอบ (spoil) ให้เห็นก่อนตอบ — skill ปิดให้ไม่ได้ (ปิดได้เฉพาะระดับ global)
แนะนำ user ให้ปิดชั่วคราวผ่าน `/config` (toggle "prompt suggestion") หรือรัน session
ด้วย `CLAUDE_CODE_ENABLE_PROMPT_SUGGESTION=false` ก่อนเริ่ม quiz แล้วค่อยเปิดคืนทีหลัง

### 4. Quiz loop — ทีละ 1 คำถาม 4 ตัวเลือก

กติกาการสร้างคำถาม:

- **ห้ามถาม trivia** (ชื่อฟังก์ชัน ชื่อไฟล์ ชื่อตัวแปร) — ถามเชิงพฤติกรรม/ผลลัพธ์เท่านั้น:
  "ถ้า X เกิดขึ้น ระบบจะ…", "ถ้าลบส่วนนี้ อะไรพัง", "PR นี้ *ไม่* ได้แก้ปัญหาไหน",
  "user คนไหนจะเห็นความต่างจาก change นี้"
- **ตัวหลอกทุกตัวต้องเป็น plausible misconception** — แต่ละ choice ที่ผิดแทนความเข้าใจผิด
  แบบเฉพาะเจาะจง 1 อย่าง (จดไว้ในใจว่า choice ไหน = misconception อะไร) ห้ามมีตัวหลอก
  ที่มั่วจนตัดทิ้งได้โดยไม่ต้องเข้าใจอะไรเลย
- สุ่มลำดับตัวเลือก อย่าให้คำตอบถูกยาวสุดหรืออยู่ตำแหน่งเดิมซ้ำ ๆ

เมื่อ user ตอบ:

- **ถูก** → นับ 1 mastery ของ item นั้น · ถ้ายังไม่ถึงเกณฑ์ `mastery` ให้ถาม item เดิม
  จาก **มุมใหม่** (เปลี่ยน framing/scenario ไม่ใช่ reword เฉย ๆ) ในรอบถัด ๆ ไป (ไม่ต้องติดกัน) ·
  **บางครั้ง (ประมาณ 1 ใน 3 สุ่มเอง) ถามต่อว่า "ทำไมถึงเลือกข้อนี้?"** — ถ้าเหตุผลผิด
  ไม่นับ mastery ครั้งนั้น และ treat เหมือนตอบผิด (ได้ misconception มา diagnose)
- **ผิด** → **ห้ามเฉลย ห้ามบอกว่าข้อไหนถูก** · ตอบตาม `feedback` mode · จาก choice ที่เลือก
  วิเคราะห์ว่า misconception คืออะไร แล้ว**สร้างคำถามใหม่ที่โจมตี misconception นั้นโดยตรง**
  จากมุม/scenario อื่น — เป้าหมายคือให้ user *ค้นพบเอง* ว่าตัวเองเข้าใจผิดตรงไหน
- **ผิดซ้ำครั้งที่ 2 ใน item เดิม → ลดระดับลงหา prerequisite** อย่าถามเรื่องเดิมให้ยากขึ้น —
  ถามคำถาม "รากฐาน" ที่ต้องรู้ก่อน (เช่น "โค้ดนี้ถูกเรียกจากไหน/รันในบริบทไหน") หรือแปะโค้ด
  จริงให้ trace มือทีละบรรทัด — จากการใช้จริง วิธีนี้ปลดล็อกได้โดยไม่ต้องชน max-frustration
- **ผิดครบ `max-frustration` รอบใน item เดียวกัน** → เฉลย + อธิบายเต็ม (corrective feedback
  จำเป็น — errorful learning ได้ผลก็ต่อเมื่อจบด้วยเฉลยที่ถูก) mark item เป็น
  "reviewed but not mastered" แล้วไปต่อ
- **`allow-peek=yes`**: user ขอดูโค้ดส่วนไหนก็แสดงให้ (จาก pinned commit) — ไม่นับเป็นผิด

### 5. จบเมื่อ syllabus หมด

จบ = ทุก item ถึงเกณฑ์ mastery หรือถูก mark "reviewed but not mastered" · แล้วรายงาน **coverage map** (มีค่ากว่าคะแนน):

- item ไหน mastered / not mastered
- misconception ที่เจอซ้ำ ๆ ("คุณผิดซ้ำ 3 รอบเรื่อง X — แนวโน้มคือคิดว่า…") — มองข้าม item ด้วย:
  ถ้าความผิดหลาย item มี pattern ร่วม (เช่น "จำ scenario ได้แต่ไม่ trace โค้ดจริง") ให้บอก pattern นั้น
  พร้อมคำแนะนำว่าตอน verify จริงควรอ่านโค้ดส่วนไหนชดเชย
- ถ้าระหว่างตอบ user ตั้งข้อสังเกตที่เป็น **review finding จริง** (เห็นว่าพฤติกรรมโค้ด "ควรเป็นอีกแบบ")
  ให้เก็บมารายงานแยกไว้ — quiz วัดความเข้าใจ แต่ผลพลอยได้แบบนี้มีค่ากับตัว PR โดยตรง
- ถ้ามี verification checklist จาก learn-diff: ข้อไหนพร้อม verify แล้ว ข้อไหนควรกลับไปอ่านก่อน

### 6. เก็บ experiment log

เขียนไฟล์ log ที่ `.quiz-diff/quiz-<PR>-<timestamp>.json` ใน repo ของ user (แนะนำให้เพิ่มลง
`.gitignore` ถ้ายังไม่มี) เก็บ: config ที่ใช้, ทุกคำถาม + choices + misconception ที่ผูกกับแต่ละ choice,
คำตอบของ user แต่ละรอบ, จำนวนรอบต่อ item, ผลสรุป — เพื่อให้คนทำ experiment เอาไปดูว่า
config ไหน work

## ข้อห้าม

- ห้ามเฉลยก่อนถึง `max-frustration` หรือก่อน user พิมพ์ `เฉลย` — นี่คือหัวใจของ skill
- ห้ามถามหลายข้อพร้อมกัน — ทีละ 1 ข้อเสมอ เพราะคำถามถัดไปต้องขึ้นกับคำตอบล่าสุด
- ห้าม generate คำถามจากความจำ — ทุกข้อต้อง trace กลับไปที่ diff/โค้ดจริง ณ pinned commit ได้
- ห้ามใช้คำถามแบบ "แอบใส่ bug ปลอมใน diff แล้วให้หาว่าอันไหนของจริง" — ตัดสินใจไม่ทำแล้ว
  (ดู DEVELOPMENT.md)
