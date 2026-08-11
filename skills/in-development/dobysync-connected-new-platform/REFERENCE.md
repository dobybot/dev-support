# Reference — connect-platform

## Feature matrix

เกณฑ์ "docs เพียงพอ" — ต้องตอบได้ทุกข้อใน tier ที่จะ implement:

### Tier 0 — Auth (บังคับ ทุก platform)

| คำถาม | ตัวอย่างคำตอบ |
|---|---|
| Auth model แบบไหน? | OAuth 2.0 (authorize URL + callback) / API Key + Secret / token คงที่ |
| ถ้า OAuth: ต้องสร้าง app + ขอ approve ก่อนไหม? | partner app, sandbox app |
| Token หมดอายุ + refresh ยังไง? | refresh_token, TTL, refresh ล่วงหน้ากี่นาที |
| ระบุร้าน (shop id) ได้จากขั้นตอนไหน? | callback param, API `/shop/info` |
| user ฝั่งเราต้องทำอะไรตอน connect? | วาง URL ร้านแล้ว redirect / กรอก key เอง |

### Tier 1 — Order (minimum viable)

- ดึงรายการ order (list + filter ช่วงเวลา/สถานะ) ✓/✗
- ดึงรายละเอียด order (items, ผู้รับ, ที่อยู่, ขนส่ง, ราคา) ✓/✗
- map สถานะ platform → สถานะ dobybot (Waiting/Shipping/...) ได้ครบ ✓/✗
- pagination + rate limit ระบุไว้ ✓/✗

### Tier 2 — Order webhook (inbound)

- มี webhook event order สร้าง/เปลี่ยนสถานะ ✓/✗
- วิธี verify signature ✓/✗
- ตั้ง callback URL ที่ไหน (app console หรือ API) ✓/✗
- event ครอบคลุมทุกสถานะไหม? ถ้าไม่ครบ → **ต้องมี polling ผ่าน sync task คู่กัน**

### Tier 3 — Product

- ดึงรายการ/รายละเอียด product + SKU ✓/✗
- product webhook ✓/✗

### Tier 4 — Stock

- อัปเดต stock ผ่าน API ✓/✗ (จำไว้: dobybot **ไม่มี**ระบบ stock —
  ฝั่งเราแค่รับ/ส่งต่อ ไม่ตัดเอง)
- stock webhook ✓/✗

### Tier 5 — Fulfillment

- AWB / shipping label ✓/✗
- update tracking / mark shipped ✓/✗
- cancel order ✓/✗

## Prerequisites

รายการที่ต้องถาม/เตรียมก่อนเริ่ม implement — สรุปให้ user เป็น step:

1. **Developer account** — ต้องสมัครไหม ใช้อีเมลบริษัท (devteam@dobybot.com)
   → เปิดหน้า signup ค้างไว้ให้ user กรอก credential เอง
2. **สร้าง app** — partner/open-platform app, ระบุ scope ที่ต้องขอ
3. **App Key / Secret** — ได้มาแล้วเก็บตาม [secrets per environment](#secrets)
4. **Callback / Redirect URL** — ต้อง whitelist domain ไหม เตรียม 3 ค่า:
   local (tunnel), uat, prod
5. **Sandbox / ร้านทดสอบ** — มีไหม ถ้าไม่มีต้องใช้ร้านจริง → ดู
   [real-data-safety](#real-data-safety)
6. **ข้อมูลทดสอบ** — order/product จริงอย่างน้อย 1 รายการ สำหรับ fixture
7. **Approval process** — app ต้องรอ platform review ไหม กี่วัน (กระทบ timeline —
   ถ้าต้องรอ ให้ยื่นก่อนเริ่มเขียนโค้ด)

ดูตัวอย่าง prerequisites จริงจาก memory: `easystore-integration`, `shoplineapp-integration`

## Scaffold

โครงไฟล์ตาม convention ปัจจุบัน (ดูตัวอย่างล่าสุด: `marketplaces/lib/easystore/`,
`marketplaces/lib/shopline/` — **เลือกตัวที่ auth model เหมือนกันเป็นแม่แบบ**):

```
services/dobysync/marketplaces/lib/<platform>/
├── __init__.py
├── types.py          # Pydantic models ของ platform (หรือ types/ ถ้าใหญ่)
├── repositories.py   # httpx.AsyncClient เรียก API + token refresh logic
├── services.py       # business logic + transform → DobybotOrder
├── webhooks.py       # inbound webhook handler (ถ้ามี Tier 2)
├── exceptions.py
└── helpers.py/utils.py (ตามจำเป็น)
```

จุดต่อเพิ่ม (พลาดบ่อย — เอาเข้า plan ทุกข้อ):
- `marketplaces/lib/constants.py` — ลงทะเบียน platform
- `marketplaces/apis/v1/<platform>/` + `core/urls.py` — webhook endpoint
- `marketplaces/lib/dobybot/types.py` — `DobybotOrder` (ปลายทาง transform)
- **Model + migration**: platform ใหม่มักแตะ `marketplaces/models.py` (Shop —
  platform enum, credential/token fields) → django-tenants migration
  ห้ามลืมว่า migration เข้า prod เป็น manual + gated
- **Token refresh**: logic อยู่ per-platform ใน `repositories.py`/`services.py`
  + shop auth flow ใน `business_logic/shop_services.py` — ดู shopee เป็นตัวอย่าง
- **Sync task (polling)**: register งาน sync ใน `business_logic/sync_task_service.py`
  (Cloud Tasks — repo นี้ไม่มี Celery) จำเป็นเมื่อ webhook ไม่ครบทุก event
  และเป็น fallback เมื่อ webhook หาย
- **dobybot-ui**: `services/dobybot-ui/components/settings/marketplaces/MarketplaceConnectDialog.vue`
  — เพิ่ม platform + region filter (TH/TW) + form ตาม auth model
- **dobybot**: import template ที่ `services/dobybot/importdata/` ถ้า platform
  ต้องมี template import

## Secrets

App Key/Secret ต้องถูกวางครบ 3 ที่ ก่อนแต่ละ environment ใช้งานได้:

| Environment | ที่เก็บ | ขั้นตอน |
|---|---|---|
| local | `.env` ของ dobysync | เพิ่ม key แล้วห้าม commit |
| uat | Google Secret Manager | เพิ่ม secret + ผูกเข้า Cloud Run service ของ uat |
| prod | Google Secret Manager | เหมือน uat แต่ทำตอน deploy prod (gated) |

ใส่ขั้นตอนเพิ่ม secret ลง plan เสมอ — ลืมแล้ว deploy ผ่านแต่ connect ล่มวันแรก
ถ้า platform แยก sandbox/production app → key คนละชุด ระบุใน plan ว่า env ไหนใช้ชุดไหน

## Webhook testing

Local รับ webhook จาก platform จริง**ไม่ได้** (ไม่มี public URL) — เลือกตามลำดับ:

1. **Replay fixture** (default สำหรับ TDD): เก็บ payload webhook จริง (จาก docs
   หรือยิงทดสอบบน UAT) เป็น fixture แล้วเขียน test ยิงเข้า endpoint ตรง ๆ
   — ครอบคลุม signature verify + ทุก event type
2. **Tunnel** (เมื่อต้อง debug flow จริงจากเครื่อง): cloudflared/ngrok ชี้เข้า
   dev server แล้วตั้ง callback URL ชั่วคราวใน app console — เสร็จแล้ว**ถอนออก**
3. **UAT**: ทดสอบ end-to-end จริงใน Phase 6

OAuth callback ก็ปัญหาเดียวกัน — local ต้องใช้ tunnel หรือทดสอบ flow เต็มบน UAT

## Real data safety

- **UAT มีลูกค้าจริง (cusway)** — สร้าง/แก้ข้อมูลได้เฉพาะ tenant + ร้านทดสอบ
- มี sandbox → ใช้ sandbox ก่อนเสมอ
- สร้าง order จริงบน marketplace จริง = เงินจริง/order จริงเข้า ระบบร้าน —
  ขอ confirm จาก user ก่อนทุกครั้ง และบอกวิธียกเลิก/cleanup หลังทดสอบ
- fixture ต้อง redact ข้อมูลส่วนตัวลูกค้า (ชื่อ/เบอร์/ที่อยู่จริง) ก่อน commit
- ห้ามแตะ DB prod/uat แบบเขียนจากเครื่อง — read-only ผ่าน DB MCP เท่านั้น

## TDD

1. เขียน test transform ก่อน — subclass base ที่
   `marketplaces/tests/test_order_transform/base.py`, fixture ใส่
   `marketplaces/tests/test_order_transform/fixtures/`
2. fixture ต้องมาจาก **response จริง** — ดึงผ่าน repository กับร้านทดสอบ แล้ว redact
3. รันเทสต์: `uv run python manage.py test marketplaces.tests.test_order_transform.test_<platform>`
   — host testing ต้องทำ temp `.env` + revert ตาม memory `dobysync-host-testing`
4. test webhook: signature verify + ทุก event type ผ่าน replay fixture
5. test status mapping ครบทุกสถานะใน docs + token refresh (expired → refresh → retry)
6. Green แล้วค่อยต่อ UI dialog + ทดสอบ connect flow จริงผ่าน Browser

## Translation

platform ใหม่แตะ translation 3 ที่ — ทำครบก่อนขึ้น UAT:

### 1. dobybot-ui (จุดหลัก — โดนทุก platform)

ไฟล์: `services/dobybot-ui/lang/translation/{en,th,zh-Hans,zh-Hant}.json` —
**ต้องเพิ่มครบทั้ง 4 ไฟล์** key pattern ตามของเดิม (ดู easystore เป็นตัวอย่าง):

| Key | ใช้ที่ |
|---|---|
| `connect-<platform>` | ปุ่ม/หัว dialog ใน `MarketplaceConnectDialog.vue` |
| `<platform>-how-to-connect` | หัวข้อวิธีเชื่อมต่อ |
| `<platform>-step-*` | step การเชื่อมต่อใน `<Platform>ConnectDialog.vue` (เช่น `-step-enter-domain`, `-step-login`, `-step-authorize`) |

step แปลตาม auth model: OAuth → มี step login + authorize popup,
API Key → step หา key จากหน้า admin ของ platform

### 2. Tolgee sync

local JSON ต้อง reconcile กับ Tolgee server — ใช้สกิล `/tolgee-translate`
(snapshot → pull → merge key ใหม่ทับ → push โดยไม่ override ของเดิมบน server)
ห้ามแก้ JSON แล้วจบ — ไม่งั้น pull ครั้งหน้า key หาย

### 3. dobybot backend (เฉพาะเมื่อเพิ่ม string ที่ user เห็น)

- Django locale: `services/dobybot/locale/{en,th,zh_Hans,zh_Hant}/` — string ใหม่
  ผ่าน gettext แล้ว `makemessages` + เติมคำแปลใน `django.po` + `compilemessages`
- import template label/help ใน `importdata/views/apis.py` เป็น plain English
  ตาม convention เดิม (ไม่ผ่าน gettext) — คงรูปแบบเดิม

## Day-1 verify

Checklist หลัง deploy UAT (pattern จาก memory `easystore-integration` "day-1 checklist"
และ `shoplineapp-integration` "VERIFY-DAY1"):

- [ ] secrets ครบบน Secret Manager + Cloud Run เห็นค่า
- [ ] connect ร้านทดสอบผ่าน dialog สำเร็จ (OAuth redirect กลับถูก / API key ผ่าน)
- [ ] token refresh ทำงาน (รอหมดอายุหรือ force expire แล้ว sync ยังผ่าน)
- [ ] สร้าง order ทดสอบบน platform → webhook เข้า → order โผล่ใน dobybot ถูก field
- [ ] เปลี่ยนสถานะ order บน platform → สถานะใน dobybot ตามทัน
- [ ] polling sync task รันตามรอบ + ไม่สร้าง order ซ้ำกับ webhook
- [ ] outbound webhook ยิงออกไประบบลูกค้า (ดู `webhook_services.py` log)
- [ ] Sentry ไม่มี error ใหม่จาก platform นี้หลังทดสอบครบ

## Definition of Done

- [ ] Day-1 verify ผ่านครบทุกข้อ
- [ ] status mapping ครบทุกค่าที่ docs ระบุ (ไม่มี fallback เงียบ ๆ)
- [ ] timezone / currency ถูกตาม region (TH/TW ต่างกัน)
- [ ] region filter ใน `MarketplaceConnectDialog.vue` ถูกต้อง
- [ ] translation ครบ 4 ภาษาใน dialog + sync Tolgee แล้ว (ดู [Translation](#translation))
      — เปิด dialog ทั้ง 4 ภาษาแล้วไม่มี key ดิบโชว์
- [ ] query ใหม่ทุกตัว filter company/tenant แล้ว
- [ ] เอกสาร: อัปเดต `services/dobysync/CONTEXT.md` (เพิ่ม platform + quirks ที่เจอ)
- [ ] PR ผ่าน `/submit-work` (normal-track → uat) + Jira อัปเดต
- [ ] แผน prod: migration steps + secrets prod ระบุใน PR body

## Platform quirks ที่เคยเจอ (กัน design พลาดซ้ำ)

- items อาจถูก group/collapse (TikTok V2: `sku_id + package_id`)
- status ชื่อเดียวกันคนละความหมาย — ทำ mapping table ใน plan เสมอ
- บาง platform webhook ไม่ครบทุก event — polling ผ่าน `sync_task_service.py` เป็นของคู่กัน
- region lock (TH/TW) — เช็คตั้งแต่ dialog filter (ดู commit 313c25fd9, d0edc378f)
