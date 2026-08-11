---
name: dobysync-connected-new-platform
description: เชื่อมต่อ marketplace/platform ใหม่เข้า dobysync ตั้งแต่ research API docs → ประเมิน feature coverage → สรุปให้ user confirm → วางแผน → TDD implement → verify บน UAT (รวม UI connect dialog ใน dobybot-ui) Use when ผู้ใช้บอกชื่อ platform หรือส่งลิงก์ API docs มาแล้วขอให้ "เชื่อมต่อ", "integrate", "เพิ่ม platform", หรือ "connect" เข้า dobysync/dobybot
---

# Connect Platform เข้า dobysync

ทำตาม 8 phase (0–7) **ตามลำดับ ห้ามข้าม** — phase 3 ต้องได้ confirm จาก user ก่อนไป phase 4

## Phase 0 — เริ่มงานตาม workflow ของ repo

เริ่ม branch ด้วยสกิล `/start-work` — งาน platform ใหม่เป็น **normal-track** (แตกจาก `uat`)
ปิดงานตอนจบด้วย `/submit-work`

## Phase 1 — Research

1. ถ้า user ให้ลิงก์มา: เปิดอ่านด้วย WebFetch/Browser ก่อน ประเมินว่าครอบคลุม
   [feature matrix](REFERENCE.md#feature-matrix) หรือไม่
2. ถ้าไม่พอ (หรือให้แค่ชื่อ platform): WebSearch หา official API documentation —
   คำค้น: `"<platform>" open api documentation`, `"<platform>" developer api order webhook`
3. เก็บลิงก์ docs ทุกหน้า ที่จะใช้อ้างอิงตอน implement ลงใน plan

## Phase 2 — ประเมิน feature coverage

เช็คทีละข้อกับ [feature matrix ใน REFERENCE.md](REFERENCE.md#feature-matrix) —
ข้อไหน docs ไม่พูดถึง = **ไม่รองรับ** อย่าเดา

สำคัญสุด 2 เรื่อง:
- **Auth model**: OAuth (user วาง URL ร้าน / กด authorize) หรือ API Key (user กรอก key เอง)
  — ตัวนี้กำหนดหน้าตา `MarketplaceConnectDialog.vue` และ flow ทั้งหมด
- **Minimum viable** = auth + ดึง order + transform เป็น `DobybotOrder` ได้
  ถ้าทำไม่ได้ = เชื่อมไม่ได้ หยุดแล้วรายงาน user

## Phase 3 — สรุป + ให้ user confirm (จุดหยุดบังคับ)

รายงานเป็นตาราง: feature | รองรับ? | หลักฐาน (ลิงก์ docs) แล้วถามด้วย AskUserQuestion:
1. จะ implement feature ไหนบ้าง (เสนอ minimum viable + webhook เป็น default)
   ถ้า webhook ไม่ครบทุก event → เสนอ polling ผ่าน sync task เป็นของคู่กัน ไม่ใช่ option
2. สิ่งที่ user ต้องเตรียม — ตาม [prerequisites checklist](REFERENCE.md#prerequisites)
   (developer account, สร้าง app, ขอ app key/secret, whitelist callback URL, sandbox ฯลฯ)
   บอกเป็น step ชัด ๆ และ**เปิดหน้า signup/console ค้างไว้ให้ใน Browser** —
   user กรอก username/password เอง (ห้ามกรอก credential แทน) ส่วน form อื่นช่วยกรอกได้

## Phase 4 — Plan

เขียนแผนตาม [implementation scaffold](REFERENCE.md#scaffold) ครอบคลุม:
- dobysync: `marketplaces/lib/<platform>/` + transform → `DobybotOrder` + URL routing
  + constants + **model/migration** + **token refresh** + **sync task (polling)**
- dobybot-ui: `MarketplaceConnectDialog.vue` + region filter
- dobybot: import template (ถ้าจำเป็น)
- [secrets per environment](REFERENCE.md#secrets) + [แผนทดสอบ webhook](REFERENCE.md#webhook-testing)
- ไฟล์ test ที่จะเขียนก่อน (TDD) และข้อมูลจริงที่ต้องใช้ ตาม
  [กฎความปลอดภัยข้อมูลจริง](REFERENCE.md#real-data-safety)

## Phase 5 — TDD Implement

ใช้สกิล `/tdd` (red → green → refactor) ตาม [TDD conventions](REFERENCE.md#tdd):
- Test order transform ด้วย **fixture จาก response จริง** ของ platform
- webhook ทดสอบตาม [webhook-testing](REFERENCE.md#webhook-testing) — local รับ
  webhook จริงไม่ได้ ต้อง replay fixture หรือ tunnel
- ถ้าต้องมี order/product จริงบน platform ก่อน: ใช้ sandbox ก่อนเสมอ ถ้าไม่มีให้บอก
  user วิธีสร้าง หรือทำเองได้ก็ทำ (ขอ confirm ก่อนถ้าเป็น action ที่มีผลจริง/เงินจริง)
- รันเทสต์บน host ตาม memory `dobysync-host-testing` (temp .env + revert)

## Phase 6 — แปลภาษา

ทำตาม [translation checklist](REFERENCE.md#translation) — string ใหม่ทุกตัวต้องครบ
**4 ภาษา (en / th / zh-Hans / zh-Hant)** ก่อนขึ้น UAT:
- dobybot-ui: เพิ่ม key ใน `lang/translation/*.json` ครบ 4 ไฟล์
  (pattern: `connect-<platform>`, `<platform>-how-to-connect`, `<platform>-step-*`)
- sync กับ Tolgee server ด้วยสกิล `/tolgee-translate` (push key ใหม่
  โดยไม่ทับของบน server)
- ฝั่ง dobybot: ถ้าเพิ่ม string ที่ user เห็น ให้ผ่าน gettext + อัปเดต `locale/*/django.po`

## Phase 7 — Verify บน UAT + ปิดงาน

- merge เข้า `uat` ผ่าน `/submit-work` → เพิ่ม secrets บน UAT → รัน
  [Day-1 verify checklist](REFERENCE.md#day1-verify) กับร้านทดสอบจริง
- ผ่านครบ + [Definition of Done](REFERENCE.md#dod) ครบ ค่อยถือว่าจบ
- migration เข้า prod เป็น **manual + gated** — ดู `docs/deploy-uat-to-prod.md`

## กฎเหล็ก

- `.env` dobysync ต้องชี้ local Postgres เท่านั้นตอนรันเทสต์ (กัน test DB โผล่บน prod)
- query ทุกตัว filter company/tenant — ดู `docs/security.md`
- UAT มีลูกค้าจริง (cusway) — ทดสอบผ่าน tenant/ร้านทดสอบเท่านั้น
- เอกสาร/comment/PR เป็นภาษาไทย (กฎ repo)
