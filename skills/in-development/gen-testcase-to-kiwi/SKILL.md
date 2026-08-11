---
name: gen-testcase-to-kiwi
description: สรุป code change ของงานปัจจุบันแบบ spec-driven (Jira + acceptance criteria) แล้วออกแบบ testcase, เช็คซ้ำกับของเดิมบน Kiwi TCMS (filter Product→Category + tag ticket), เสนอเป็นตาราง CREATE/UPDATE/SKIP ให้ผู้ใช้ confirm ก่อน แล้วเขียนขึ้น Kiwi พร้อม tag ticket และบันทึกลงไฟล์สายพานของงาน. ใช้เมื่อ implement feature/fix เสร็จแล้วต้องการสร้าง/อัปเดต test case บน Kiwi ให้ตรงกับสิ่งที่แก้ ไม่ให้ Kiwi หลุดจากของจริงและไม่สร้างซ้ำ
---

# gen-testcase-to-kiwi — สร้าง Test Case ขึ้น Kiwi จากงานที่เพิ่ง implement

Skill นี้ทำ **ครึ่งแรกของสายพาน (step A)**: จากงานที่เพิ่งแก้ → ออกแบบ testcase → เขียนขึ้น
Kiwi TCMS โดย**ไม่สร้างซ้ำ** และ**ไม่หลุดจากความต้องการจริง** ตัว generate Cypress spec และการ
run เป็น skill คนละตัว (ต่อยอดผ่านไฟล์สายพานเดียวกัน) — **ไม่อยู่ใน skill นี้**

## หลักการเดินเครื่อง (อ่านก่อนเริ่ม — ห้ามข้าม)

1. **Spec-driven ไม่ใช่ diff-driven** — testcase ต้องออกแบบจาก **Jira ticket + acceptance
   criteria + requirements context** เป็นแหล่งความจริงหลัก ใช้ diff เป็นแค่ตัวชี้ว่า "แตะจุดไหน"
   **ห้าม**เจน testcase จากสิ่งที่โค้ดทำล้วน ๆ (จะกลายเป็น tautology จับบั๊กที่มากับ diff ไม่ได้)
2. **ไม่มั่นใจ = หยุดถามผู้ใช้ ไม่เดา** — ทุกจุดตัดสิน: category ที่จะลง, ซ้ำ/ไม่ซ้ำ,
   CREATE vs UPDATE, AC กำกวม → เสนอทางเลือกให้ผู้ใช้เคาะ อย่าตัดสินเอง
3. **Human gate ก่อนแตะ Kiwi เสมอ** — Kiwi เป็น artifact ที่ทีม/QA ใช้ร่วม ห้าม create/update
   เงียบ ๆ ต้องผ่านตาผู้ใช้ทุกใบ
4. **ห้ามหลุดข้อมูล tenant จริง** — ห้ามใส่ชื่อลูกค้า/เลขออเดอร์จริง ลง summary/step ของ testcase
   เขียนเป็นเชิงพฤติกรรม/ตัวแปรแทน (Kiwi เป็นที่เก็บถาวรและทีมเห็น)
5. คุยกับผู้ใช้ **เป็นภาษาไทย** (ตามกฎ repo)

## Prerequisite

- **credential ของ Kiwi** — ใช้ credential path เดียวของ repo: อ่าน
  `.claude/scripts/kiwi/.env` (`KIWI_BASE_URL`, `KIWI_USERNAME`, `KIWI_PASSWORD`)
  ถ้าไฟล์ไม่มีหรือ `KIWI_PASSWORD` เป็น placeholder → หยุด แจ้งผู้ใช้ให้ตั้งค่าก่อน
- **ไฟล์สายพานของงาน** (ถ้ามี) — `.work-session/<TICKET>.md` (ดู `work-session-template.md`)
  ถ้ายังไม่มี skill นี้จะเป็นตัวสร้างขึ้น (seed จาก Jira + สิ่งที่คุยกัน) แล้วเขียน section 2–3
- อ้างอิง RPC method/field หลัก: `docs/kiwi/kiwi-tcms-rpc-api.md`
- อ้างอิง notes เฉพาะ instance/workflow: `.claude/skills/kiwi-sync-cypress/kiwi-api-reference.md`

## Inputs (เก็บให้ครบก่อนลงมือ — ถ้าขาดให้ถาม)

1. **Ticket ID** — เดาจาก branch (`{TICKET}--{track}--{slug}`) หรือถามผู้ใช้ ถ้างานไม่ผูก Jira
   (`none--...`) ให้ใช้ requirements context ที่ผู้ใช้ป้อนเป็นแหล่งความจริงแทน AC
2. **Acceptance criteria / requirements** — จาก Jira ticket + สิ่งที่คุยกันใน session
3. **Kiwi Product** — งานนี้อยู่ระบบไหน (dobybot / dobysync / record-v2 / ...) ถ้าเดาไม่ได้ให้ถาม

## ขั้นตอน

### 1. โหลด context ของงาน (spec เป็นหลัก)
- ถ้ามี `.work-session/<TICKET>.md` → อ่าน section 1 (Requirement) เป็นความจริงหลัก
- ไม่มี → อ่าน Jira ticket ผ่าน Jira MCP (summary + acceptance criteria) + รวบรวมสิ่งที่คุยกันใน
  session แล้ว **สร้างไฟล์สายพาน** จาก `work-session-template.md` เติม section 1 ให้ครบ
- ดู diff ของ branch เทียบ base **เพื่อระบุจุดที่แตะเท่านั้น** (ไม่ใช่เพื่อ copy เป็น testcase):
  ```bash
  git diff --stat "origin/{base}"...HEAD
  ```

### 2. สรุป change เชิงพฤติกรรม (เขียน section 2 ของไฟล์สายพาน)
สรุปว่า**พฤติกรรมของระบบเปลี่ยนไปยังไง** (ไม่ใช่ dump diff): ไฟล์ที่แตะ, พฤติกรรมใหม่,
decision/ข้อควรระวัง, และ **จุดเสี่ยงที่ควรเทสต์เป็นพิเศษ** (เช่น idempotency, ยิงซ้ำ,
edge case, จุดที่ต้องยิง webhook ออกเพราะ dobybot ไม่ตัด stock เอง)

### 3. ออกแบบ testcase จาก acceptance criteria
- ไล่ **ทีละ AC** → เป็น testcase 1 (หรือมากกว่า) ที่พิสูจน์ AC นั้น
- เพิ่ม testcase สำหรับ **จุดเสี่ยง/edge case** จาก section 2 ที่ AC อาจไม่ครอบ
- ถ้า AC ข้อไหน**กำกวมจนออกแบบได้หลายแบบ → หยุดถามผู้ใช้ก่อน** (หลักการข้อ 2)
- แต่ละ testcase ร่าง: `summary` (ขึ้นต้นเชิงพฤติกรรม), `text` (steps + expected), category ที่คาดว่าจะลง

### 4. เช็คซ้ำกับ Kiwi (dedup — deterministic ก่อน semantic)
เป้า: อย่าเทียบทั้ง product ให้แคบ scope ก่อน แล้วค่อยให้ judge เทียบชุดเล็ก
1. resolve id: `Product.filter({name})` → `product_id`; `Category.filter({product: product_id})`
   → หา category ที่ตรงกับ testcase (ถ้า map ไม่ชัด → ถามผู้ใช้ อย่าเดา)
2. ดึง candidate ชุดเล็ก:
   ```
   TestCase.filter({ category: <category_id> })                  # ในหมวดเดียวกัน
   TestCase.filter({ tag__name: "<TICKET>" })                    # ของที่ tag ticket นี้ไว้แล้ว (idempotent กับตัวเอง)
   ```
3. ให้ Claude อ่าน candidate แล้ว **classify ต่อ testcase ที่ร่างไว้** เป็น 3 ป้าย:
   - 🆕 **CREATE** — ไม่มีของเดิมครอบคลุม
   - ✏️ **UPDATE TC-xxx** — มีของเดิมแต่ต้องเพิ่ม/แก้ step (เช่นแก้ flow เดิม)
   - ⏭️ **SKIP TC-xxx** — ของเดิมครอบคลุมพอแล้ว
   - ถ้า **ก้ำกึ่ง CREATE↔UPDATE หรือไม่มั่นใจ → เสนอทั้งสองทางให้ผู้ใช้เลือก** (ข้อ 2)

### 5. เสนอผู้ใช้ → รอ confirm (human gate)
แสดง **ตารางสรุป** ก่อนแตะ Kiwi: `AC | action | kiwi_tc | category | summary ย่อ`
พร้อมชี้จุดที่ไม่มั่นใจ **รอผู้ใช้ยืนยันทีละบรรทัด/ทั้งชุด** ห้ามข้ามไป step 6 ก่อน confirm

### 6. เขียนขึ้น Kiwi (เฉพาะที่ confirm แล้ว)
สำหรับแต่ละ testcase ที่ผู้ใช้อนุมัติ:
- **CREATE:** `TestCase.create({summary, category, priority, case_status, text, notes})`
  - `notes` ต่อท้าย source signature: `auto-gen from <TICKET> / <requirement 1 บรรทัด>`
  - `TestCase.add_tag(case_id, "<TICKET>")` — กาวเชื่อม Jira↔Kiwi (idempotency รอบหน้า)
  - ถ้าจำเป็น `TestCase.add_component(case_id, "<component>")`
- **UPDATE:** `TestCase.update(TC-xxx, {text: ...})` เพิ่ม/แก้ step + add_tag `<TICKET>` ถ้ายังไม่มี
- **SKIP:** ไม่แตะ (บันทึกไว้ใน section 3 ว่า skip เพราะ TC ไหนครอบแล้ว)

ยิง RPC ผ่าน canonical CLI `.claude/scripts/kiwi/kiwi.py` เป็นหลัก ซึ่งใช้ `tcms-api`
กับ `/xml-rpc/` และอ่าน credential จาก `.claude/scripts/kiwi/.env`.
ถ้าต้องเขียน JSON-RPC เฉพาะทางเอง ให้ใช้ `Auth.login` แล้วเก็บ `sessionid` cookie
ตาม notes ใน `.claude/skills/kiwi-sync-cypress/kiwi-api-reference.md`.

### 7. เขียนกลับไฟล์สายพาน + รายงาน
- เติม **section 3 (Testcases)** ของ `.work-session/<TICKET>.md`: ตาราง action + `kiwi_tc` + category + tag
- อัปเดต frontmatter `phase: testcase-created` และ `updated`
- รายงานผู้ใช้เป็นภาษาไทย: สร้างกี่ใบ / update กี่ใบ / skip กี่ใบ + link TC + จุดที่ควรตามต่อ

## สิ่งที่ skill นี้ **ไม่** ทำ (ขอบเขต MVP)
- **ไม่** generate Cypress spec — เป็น skill ถัดไป (`gen-cypress-from-tc`) อ่าน section 3 ต่อ
- **ไม่** run test / ไม่ sync automation_status — ใช้ `kiwi-sync-cypress` เดิม
- **ไม่** เรียก `/start-work` / `/submit-work` เอง — ผู้ใช้ร้อย workflow ตามจังหวะเอง
- **ไม่** archive ลง Jira/PR เอง — `/submit-work` เป็นคนสรุป section ต่าง ๆ ออก (ผ่าน confirm)

## Guardrails
- ไม่มั่นใจตรงไหน = **ถาม** (category, ซ้ำ, CREATE/UPDATE, AC กำกวม)
- ห้ามแตะ Kiwi ก่อน user confirm (step 5)
- ห้ามใส่ข้อมูล tenant จริงลง testcase
- ถ้า `.env` ของ Kiwi ไม่พร้อม → หยุด แจ้ง user
