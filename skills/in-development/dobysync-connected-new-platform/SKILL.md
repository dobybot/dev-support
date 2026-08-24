---
name: dobysync-connected-new-platform
description: Use when ผู้ใช้ระบุชื่อ marketplace/platform หรือส่ง API docs แล้วขอให้ "เชื่อมต่อ", "connect", "integrate" หรือ "เพิ่ม platform" เข้า dobysync/dobybot
---

# Connect Platform เข้า dobysync

ทำตาม 8 phase (0–7) **ตามลำดับ ห้ามข้าม** — ต้องสร้าง D2 sequence diagram และพิสูจน์
critical API ก่อนวาง timeline หรือเขียน implementation plan; phase 3 ต้องได้ confirm จาก user
ก่อนไป phase 4

## Phase 0 — เริ่มงานตาม workflow ของ repo

เริ่ม branch ด้วยสกิล `/start-work` — งาน platform ใหม่เป็น **normal-track** (แตกจาก `uat`)
ปิดงานตอนจบด้วย `/submit-work`

## Phase 1 — Research

1. ถ้า user ให้ลิงก์มา: เปิดอ่านด้วย Web/Browser ก่อน ประเมินว่าครอบคลุม
   [feature matrix](REFERENCE.md#feature-matrix) หรือไม่
2. ถ้าไม่พอ (หรือให้แค่ชื่อ platform): หา official API documentation ด้วย Web search —
   คำค้น: `"<platform>" open api documentation`, `"<platform>" developer api order webhook`
3. สร้าง `docs/integrations/<platform>/api-inventory.md` แล้วลง **API ทุกตัวที่สำคัญต่อ
   candidate scope** ตาม [API inventory contract](REFERENCE.md#api-inventory) — ไม่ใช่ทุก endpoint
   ใน catalog แต่ห้ามตก auth, shop identity, order list/detail, pagination/rate limit, webhook
   registration/delivery/signature และ API ของ feature ที่กำลังพิจารณา
4. ก่อนเขียน plan หรือ production code ให้สร้าง draft
   `docs/integrations/<platform>/sequence.d2` จาก
   [D2 sequence contract](REFERENCE.md#d2-sequence) พร้อม `test-matrix.md` และ mark
   interaction ที่ยังอิง docs อย่างเดียวเป็น `DOCS ONLY`

## Phase 2 — ประเมิน coverage + พิสูจน์ API จริง

เช็คทีละข้อกับ [feature matrix ใน REFERENCE.md](REFERENCE.md#feature-matrix) —
ข้อไหน docs ไม่พูดถึง = **ยังไม่ยืนยัน** อย่าเดาหรือ mark `NOT SUPPORTED` จากความเงียบของ docs;
ต้องหา official evidence/live proof เพิ่ม หรือ mark `BLOCKED`

ทดสอบ API ทุกตัวใน candidate scope กับ sandbox/ร้านทดสอบตาม
[live API validation](REFERENCE.md#live-api-validation) แล้วอัปเดต `api-inventory.md`,
`sequence.d2` และ `test-matrix.md` ทันที สถานะที่ยอมรับได้คือ `LIVE VERIFIED`,
`DOCS ONLY`, `BLOCKED`, `BROKEN`, `NOT SUPPORTED`; fixture replay อย่างเดียวไม่ใช่หลักฐานว่า
third-party API/webhook ใช้งานจริงได้

สำคัญสุด 2 เรื่อง:
- **Auth model**: OAuth (user วาง URL ร้าน / กด authorize) หรือ API Key (user กรอก key เอง)
  — ตัวนี้กำหนดหน้าตา `MarketplaceConnectDialog.vue` และ flow ทั้งหมด
- **Minimum viable** = auth + ระบุร้าน + ดึง order list/detail จริง + transform เป็น
  `DobybotOrder` ได้ ถ้า critical API ตัวใดไม่เป็น `LIVE VERIFIED` ให้หยุดก่อน estimate/implement
  และรายงาน blocker หรือ API ที่ platform ทำงานไม่ตรง docs

## Phase 3 — สรุป + ให้ user confirm (จุดหยุดบังคับ)

รายงาน 3 artifact ให้ user/developer review: feature coverage, `api-inventory.md` ที่มี live evidence,
และ rendered `sequence.svg` พร้อม D2 source แล้วถาม user โดยตรง:
1. จะ implement feature ไหนบ้าง (เสนอ minimum viable + webhook เป็น default)
   ถ้า webhook ไม่ครบทุก event → เสนอ polling ผ่าน sync task เป็นของคู่กัน ไม่ใช่ option
2. สิ่งที่ user ต้องเตรียม — ตาม [prerequisites checklist](REFERENCE.md#prerequisites)
   (developer account, สร้าง app, ขอ app key/secret, whitelist callback URL, sandbox ฯลฯ)
   บอกเป็น step ชัด ๆ และ**เปิดหน้า signup/console ค้างไว้ให้ใน Browser** —
   user กรอก username/password เอง (ห้ามกรอก credential แทน) ส่วน form อื่นช่วยกรอกได้
3. sequence, decision point และ test flow ถูกต้องไหม — ต้องได้ confirm ก่อน Phase 4

ถ้า user เพิ่ม feature/API ตอน confirm ให้ย้อน Phase 1–2 เพื่อ inventory + live-validate +
อัปเดต D2/test matrix ก่อนกลับมา confirm ใหม่ ห้ามพา scope ที่ยังไม่พิสูจน์เข้า Phase 4

ห้ามให้ committed timeline ถ้า minimum viable API ยังมี `DOCS ONLY`, `BLOCKED` หรือ `BROKEN`;
ให้รายงานเฉพาะ blocker และสิ่งที่ต้องพิสูจน์เพิ่มตาม [estimation gate](REFERENCE.md#estimation-gate)

## Phase 4 — Plan

เขียนแผนจาก Flow ID ใน D2 + `test-matrix.md` ตาม
[implementation scaffold](REFERENCE.md#scaffold) ครอบคลุม:
- dobysync: `marketplaces/lib/<platform>/` + transform → `DobybotOrder` + URL routing
  + constants + **model/migration** + **token refresh** + **sync task (polling)**
- dobybot-ui: `MarketplaceConnectDialog.vue` + region filter
- dobybot: import template (ถ้าจำเป็น)
- [secrets per environment](REFERENCE.md#secrets) + [แผนทดสอบ webhook](REFERENCE.md#webhook-testing)
- ไฟล์ test ที่จะเขียนก่อน (TDD) และข้อมูลจริงที่ต้องใช้ ตาม
  [กฎความปลอดภัยข้อมูลจริง](REFERENCE.md#real-data-safety)
- ทุก task ระบุ Flow ID (`AUTH-*`, `ORDER-*`, `WEBHOOK-*`, `POLL-*`, `ERROR-*`,
  `DECISION-*`) เพื่อให้ developer trace จาก diagram → test → code ได้

## Phase 5 — TDD Implement

ใช้สกิล `/tdd` (red → green → refactor) ตาม [TDD conventions](REFERENCE.md#tdd):
- ก่อนเริ่มแต่ละ Flow ID ต้องมี interaction/decision ใน `sequence.d2` และ test case ใน
  `test-matrix.md`; test name หรือ comment อ้าง Flow ID เดียวกัน
- Test order transform ด้วย **fixture จาก response จริง** ของ platform
- webhook ทดสอบตาม [webhook-testing](REFERENCE.md#webhook-testing) — local รับ
  webhook จริงไม่ได้ ต้อง replay fixture หรือ tunnel
- ถ้าต้องมี order/product จริงบน platform ก่อน: ใช้ sandbox ก่อนเสมอ ถ้าไม่มีให้บอก
  user วิธีสร้าง หรือทำเองได้ก็ทำ (ขอ confirm ก่อนถ้าเป็น action ที่มีผลจริง/เงินจริง)
- รันเทสต์บน host ตาม memory `dobysync-host-testing` (temp .env + revert)
- เมื่อ code หรือ API จริงต่างจาก diagram ให้ **หยุดก่อนเขียนต่อ**, อัปเดต D2 + inventory +
  test matrix แล้วขอ developer ตัดสินใจเมื่อ scope/behavior เปลี่ยน ห้ามปล่อยให้ code
  กลายเป็น specification ใหม่โดยเงียบ ๆ
- หลังจบแต่ละ Flow ID อัปเดตสถานะและ evidence ใน `test-matrix.md` แล้ว render D2 ใหม่

## Phase 6 — แปลภาษา

ทำตาม [translation checklist](REFERENCE.md#translation) — string ใหม่ทุกตัวต้องครบ
**4 ภาษา (en / th / zh-Hans / zh-Hant)** ก่อนขึ้น UAT:
- dobybot-ui: เพิ่ม key ใน `lang/translation/*.json` ครบ 4 ไฟล์
  (pattern: `connect-<platform>`, `<platform>-how-to-connect`, `<platform>-step-*`)
- sync กับ Tolgee server ด้วยสกิล `/tolgee-translate` (push key ใหม่
  โดยไม่ทับของบน server)
- ฝั่ง dobybot: ถ้าเพิ่ม string ที่ user เห็น ให้ผ่าน gettext + อัปเดต `locale/*/django.po`
- ถ้า connect dialog หรือ user interaction เปลี่ยน ให้แก้ D2 ก่อนแก้ test/code ที่ตามมา

## Phase 7 — Verify บน UAT + ปิดงาน

- merge เข้า `uat` ผ่าน `/submit-work` → เพิ่ม secrets บน UAT → รัน
  [Day-1 verify checklist](REFERENCE.md#day1-verify) กับร้านทดสอบจริงตามลำดับ Flow ID ใน D2
- อัปเดต live evidence + ผล automated/manual/UAT ของทุก flow ใน `test-matrix.md`, render
  `sequence.svg` รอบสุดท้าย และให้ diagram ตรงกับ behavior ที่ deploy จริง
- ผ่านครบ + [Definition of Done](REFERENCE.md#dod) ครบ ค่อยถือว่าจบ
- migration เข้า prod เป็น **manual + gated** — ดู `docs/deploy-uat-to-prod.md`

## กฎเหล็ก

- `.env` dobysync ต้องชี้ local Postgres เท่านั้นตอนรันเทสต์ (กัน test DB โผล่บน prod)
- query ทุกตัว filter company/tenant — ดู `docs/security.md`
- UAT มีลูกค้าจริง (cusway) — ทดสอบผ่าน tenant/ร้านทดสอบเท่านั้น
- D2 เป็น living specification: ต้องมี **ก่อน code** และอัปเดตทุก phase/ทุก flow ที่ behavior เปลี่ยน
- ห้าม estimate จาก docs อย่างเดียว — critical API ต้องทดสอบจริงก่อน
- ก่อน Phase 4 ต้อง audit ว่า Flow ID/API ID ไม่ซ้ำ, ทุก `CRITICAL` API มี D2 interaction
  และ test row, และไม่มี dangling ID
- เอกสาร/comment/PR เป็นภาษาไทย (กฎ repo)
