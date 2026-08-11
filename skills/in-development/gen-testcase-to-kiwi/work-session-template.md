---
# ── ไฟล์สายพาน (work-session) ─────────────────────────────────────────────
# 1 งาน = 1 ไฟล์ อยู่ที่ .work-session/<TICKET>.md (แนะนำให้ gitignore — ephemeral)
# แต่ละ skill ในสายพานอ่าน section ก่อนหน้า + เขียนเฉพาะ section ตัวเอง
# `phase` = gate: skill ตัวถัดไปเช็คก่อน ถ้ายังไม่ถึงขั้นตัวเอง → หยุด ไม่ทำข้ามขั้น
# ตอน /submit-work เอา section ต่าง ๆ สรุปออกเป็น Jira comment + PR description แล้วลบไฟล์นี้
ticket: DBT-XXXX            # หรือ none-<slug> ถ้างานไม่ผูก Jira
branch: DBT-XXXX--normal-track--<slug>
track: normal-track         # fast-track | normal-track
product: dobybot            # Kiwi Product: dobybot | dobysync | record-v2 | ...
phase: started             # started → implemented → testcase-proposed →
                           # testcase-created → cypress-generated → verified
updated: 2026-07-17
---

## 1. Requirement  (เจ้าของ: /start-work + ผู้ใช้ · READ-ONLY ตลอดสาย)
<!-- แหล่งความจริงหลัก — ทุก skill ยึดอันนี้ ไม่ใช่ diff → กัน tautology -->
- Jira summary: <สรุปงานหนึ่งบรรทัด>
- Acceptance criteria:
  - [ ] AC1: <เงื่อนไขที่ต้องเป็นจริง>
  - [ ] AC2: <...>
  - [ ] AC3: <...>
- Requirements context เพิ่มเติม (จากที่คุยใน session): <...>

## 2. Change summary  (เจ้าของ: ช่วง implement — เชิงพฤติกรรม ไม่ใช่ dump diff)
- ไฟล์ที่แตะ: <path a>, <path b>
- พฤติกรรมที่เปลี่ยน: <ระบบทำอะไรต่างจากเดิม>
- Decision / ข้อควรระวัง: <เช่น idempotency guard อยู่ชั้นไหน>
- จุดเสี่ยงที่ควรเทสต์เป็นพิเศษ: <ยิงซ้ำ, edge case, webhook ที่ต้องยิงออก ฯลฯ>

## 3. Testcases  (เจ้าของ: gen-testcase-to-kiwi)
| requirement | action        | kiwi_tc | category | หมายเหตุ            |
|-------------|---------------|---------|----------|--------------------|
| AC1         | UPDATE        | TC-xxx  | Order    | เพิ่ม step เช็คสถานะ |
| AC2         | CREATE        | TC-xxx  | Order    | <...>              |
| AC3         | SKIP          | TC-xxx  | Order    | ของเดิมครอบแล้ว     |
- tag ที่แปะทุกใบ: `DBT-XXXX`
- confirmed by user: ⬜ (เติมวันที่เมื่อ user ยืนยัน)

## 4. Automation  (เจ้าของ: gen-cypress-from-tc — MVP ยังไม่ทำ)
| kiwi_tc | spec_path                          | status    |
|---------|------------------------------------|-----------|
| TC-xxx  | e2e/cypress/e2e/<area>/<name>.cy.js | generated |

## 5. Run + sync  (เจ้าของ: kiwi-sync-cypress)
<!-- sync เฉพาะ regression จริง — fail จาก environment อย่า sync เป็น Maintenance มั่ว -->
| kiwi_tc | ผล   | automation_status |
|---------|------|-------------------|
| TC-xxx  | pass | done              |
| TC-xxx  | fail (env) | อย่า sync จนกว่าจะยืนยันว่าเป็น regression จริง |
| TC-xxx  | fail (regression) | maintenance |
