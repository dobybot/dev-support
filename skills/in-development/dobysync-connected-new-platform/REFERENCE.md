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

## Integration artifacts

สร้าง artifact เหล่านี้ใน monorepo ก่อน implementation และ commit ไปพร้อมงาน:

```text
docs/integrations/<platform>/
├── api-inventory.md   # API ที่ต้องใช้ + ผลทดสอบจริง
├── sequence.d2        # living specification ที่แก้ก่อน code เมื่อ behavior เปลี่ยน
├── sequence.svg       # render ล่าสุด ถ้ามี D2 CLI
└── test-matrix.md     # trace Flow ID → API → test → evidence
```

ห้ามสร้าง diagram ตอนท้ายเพื่ออธิบาย code ที่เขียนเสร็จแล้ว: draft ต้องมีตั้งแต่ Phase 1,
developer approve ใน Phase 3 และ agent ต้องอัปเดตเมื่อจบแต่ละ phase/Flow ID หรือเมื่อพบว่า
API/implementation จริงต่างจากสมมติฐาน

## API inventory

`api-inventory.md` ต้อง list API ทุกตัวที่สำคัญต่อ candidate scope และ scope ที่ user confirm
โดยใช้หนึ่งแถวต่อ endpoint/event:

| Field | เนื้อหา |
|---|---|
| API ID | stable ID เช่น `AUTH-API-01`, `ORDER-API-02` |
| Capability | auth, shop identity, order list/detail, webhook, product, stock, fulfillment |
| Direction | dobysync → platform / platform → dobysync |
| Method/Event | HTTP method หรือชื่อ webhook event |
| Endpoint | version + path จริง |
| Auth/Scope | credential, signature และ scope ที่ต้องใช้ |
| Criticality | `CRITICAL` / `OPTIONAL` / `OUT OF SCOPE` พร้อมเหตุผล |
| Contract | input สำคัญ, output field, pagination, idempotency, rate limit, error ที่ต้อง handle |
| Official docs | deep link ไปหน้า endpoint/event โดยตรง |
| Test setup | sandbox/shop, test data และ precondition |
| Live result | `LIVE VERIFIED` / `DOCS ONLY` / `BLOCKED` / `BROKEN` / `NOT SUPPORTED` |
| Evidence | เวลา, environment, HTTP status/event ID, latency, ข้อสังเกต และ fixture/log ที่ redact แล้ว |

ความหมายสถานะ:

- `LIVE VERIFIED` — เรียก endpoint หรือรับ event จาก platform จริงใน sandbox/test shop แล้ว
  ตรวจทั้ง transport, schema และความหมายของข้อมูลผ่าน
- `DOCS ONLY` — พบ contract ใน official docs แต่ยังไม่ได้พิสูจน์กับ service จริง
- `BLOCKED` — พิสูจน์ไม่ได้เพราะ credential, approval, scope, callback หรือ test data ยังไม่พร้อม
- `BROKEN` — request/event ที่ถูกต้องตาม contract ยัง fail หรือให้ข้อมูลผิด หลัง retry แบบจำกัดและ
  ตัด config/test-data error ออกแล้ว; บันทึก response/request ID และ status page/support evidence ถ้ามี
- `NOT SUPPORTED` — official docs หรือ live proof ยืนยันว่าไม่มี capability นั้น

`CRITICAL` คือ API ที่ถ้าเสียแล้ว auth/shop identity/order list-detail/transform ใช้งานไม่ได้
หรือ confirmed feature ทำงาน/กู้คืนอย่างปลอดภัยไม่ได้; ห้ามลดเป็น `OPTIONAL` เพื่อหลบ validation gate

API สำคัญไม่ได้หมายถึงทุก endpoint ใน catalog แต่ต้องครอบคลุม:

1. authorize/token/refresh หรือ API-key verification + shop identity
2. order list/detail/filter/status/pagination ที่ minimum viable flow ใช้
3. webhook registration (ถ้ามี), delivery, signature, retry และ event ทุกชนิดใน scope
4. product/stock/fulfillment endpoint ทุกตัวที่ candidate scope พิจารณา แม้สุดท้ายจะ mark
   `OUT OF SCOPE`
5. API version, rate-limit behavior และ error contract ที่กระทบ reliability/timeline

## Live API validation

ทดสอบ API inventory ทีละแถว **ก่อน estimate และ implementation**:

1. ใช้ sandbox/test shop และ credential จริงของ environment นั้น ห้ามใช้ prod เป็น shortcut
2. เรียกด้วย auth/scope/parameter ตาม docs แล้วบันทึก timestamp, environment, HTTP status,
   request/event ID, latency และ redacted fixture/log — ห้ามเก็บ token/secret/PII
3. ตรวจไม่ใช่แค่ `2xx`: validate required fields, type, timezone, currency, status semantics,
   pagination, empty result, error contract และข้อมูลตรงกับหน้า platform
4. auth ต้องทดสอบ authorize/callback/shop identity และ refresh/retry จริงเมื่อ model รองรับ;
   static key ให้ mark refresh เป็น `NOT APPLICABLE` พร้อมเหตุผล
5. webhook ต้องให้ platform ส่ง test/real sandbox event มายัง public test callback จึงเป็น
   `LIVE VERIFIED`; payload จาก docs หรือ fixture replay พิสูจน์ได้แค่ local contract
6. write/billable API ทดสอบใน sandbox พร้อม cleanup ก่อน ถ้าไม่มี sandbox ให้หยุดขอ confirm
   ก่อน action ที่กระทบเงินจริง/order/stock ร้านจริง
7. rate limit ให้ตรวจ header/official limit และ bounded calls ห้าม load test third party
   โดยไม่มี permission
8. transient failure retry แบบจำกัดตาม contract; ถ้ายังผิดให้ mark `BROKEN` แทนการคาดว่า
   implementation ภายหลังจะทำให้ third party ใช้งานได้

ทุกครั้งที่ผลเปลี่ยน ให้อัปเดต inventory, D2 และ test matrix ใน change เดียวกัน

## Estimation gate

- minimum viable API ทุกตัวเป็น `LIVE VERIFIED` + sequence ได้ approve → ให้ committed estimate ได้
- critical API ผ่าน แต่ optional API ยัง `BLOCKED`/`DOCS ONLY` → estimate เฉพาะ verified scope
  และแยก optional scope เป็น conditional
- minimum viable API ตัวใดเป็น `DOCS ONLY`, `BLOCKED` หรือ `BROKEN` → **ห้าม committed estimate**;
  รายงาน blocker, owner, next proof และ earliest re-estimation point
- timeline ต้องรวม app approval, sandbox/test-data preparation, third-party instability,
  webhook observation window และ UAT verification จาก evidence จริง ไม่ใช้ docs coverage เป็น proxy

## D2 sequence

เริ่มจาก `assets/platform-sequence-template.d2` แล้ว adapt เป็น
`docs/integrations/<platform>/sequence.d2` ก่อน Phase 2/implementation:

- participant ขั้นต่ำ: Developer, `dobybot-ui`, `dobysync`, platform auth/API/webhook,
  Cloud Tasks และ Dobybot; ตัดเฉพาะตัวที่พิสูจน์ว่าไม่เกี่ยว
- message/decision ทุกตัวมี stable Flow ID: `AUTH-*`, `ORDER-*`, `WEBHOOK-*`, `POLL-*`,
  `ERROR-*`, `DECISION-*`
- แสดง happy path, auth/token refresh, pagination/rate limit, webhook signature/retry,
  polling fallback, deduplication, status update, downstream delivery และ failure path ที่อยู่ใน scope
- ใส่ API ID จาก inventory ใน message label เพื่อ trace จาก interaction กลับ endpoint ได้
- decision ที่ต้องให้ developer เลือกใช้ `DECISION-*`; ห้าม agent resolve scope/behavior เอง
- ระบุสถานะ `DOCS ONLY`, `LIVE VERIFIED`, `BLOCKED` หรือ `BROKEN` บน flow ที่ยังมีความเสี่ยง
- decision row บันทึกผู้อนุมัติ, timestamp, revision/commit และคำตัดสินใน `test-matrix.md`

validate และ render ทุกครั้งหลังแก้:

```bash
d2 fmt docs/integrations/<platform>/sequence.d2
d2 validate docs/integrations/<platform>/sequence.d2
d2 docs/integrations/<platform>/sequence.d2 docs/integrations/<platform>/sequence.svg
```

ถ้าไม่มี D2 CLI หรือ validate/render ไม่ผ่าน ให้หยุดก่อน Phase 3, รายงาน blocker และติดตั้ง/แก้
D2 ให้ผ่านก่อน review; ห้ามอ้างว่า diagram verified หรือเริ่ม implementation

`test-matrix.md` ใช้หนึ่งแถวต่อ Flow ID:

| Flow ID | D2 interaction/decision | API IDs | Expected result | Automated test | Manual/UAT step | Status | Evidence/decision |
|---|---|---|---|---|---|---|---|

developer ต้องสามารถรัน manual flow ตามลำดับใน D2 และเห็น expected result ได้โดยไม่ต้องอ่าน code
ก่อนเริ่มแต่ละ Flow ID ให้เพิ่ม test row; หลัง TDD/UAT ให้อัปเดต status/evidence ถ้า code/API
ทำงานไม่ตรง D2 ให้หยุด แก้ D2 ก่อน และขอ developer confirm เมื่อ behavior หรือ scope เปลี่ยน
manual/UAT step ต้องระบุ precondition, exact command/action, sanitized payload/fixture, expected result
และ cleanup; ก่อนเข้า Phase 4 audit ว่า ID ไม่ซ้ำ, ทุก `CRITICAL` API map ไป D2 + test row และไม่มี
dangling Flow/API ID

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
8. **D2 CLI** — ต้องมีและรัน `d2 validate`/render ได้ก่อน Phase 3 review

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
3. **UAT**: ทดสอบ end-to-end จริงใน Phase 7

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
7. test name หรือ comment อ้าง Flow ID จาก `sequence.d2`; อัปเดต `test-matrix.md` หลัง green

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
- [ ] token refresh ทำงาน (รอหมดอายุหรือ force expire แล้ว sync ยังผ่าน) หรือ mark
      `NOT APPLICABLE` พร้อม evidence ว่าใช้ static credential
- [ ] สร้าง order ทดสอบบน platform → webhook เข้า → order โผล่ใน dobybot ถูก field หรือ mark
      `NOT APPLICABLE` พร้อม evidence แล้ว verify polling path แทน
- [ ] เปลี่ยนสถานะ order บน platform → สถานะใน dobybot ตามทัน
- [ ] polling sync task รันตามรอบ + ไม่สร้าง order ซ้ำกับ webhook หรือ mark `NOT APPLICABLE`
      เมื่อ confirmed design ไม่ใช้ polling พร้อม evidence/decision ID
- [ ] outbound webhook ยิงออกไประบบลูกค้า (ดู `webhook_services.py` log)
- [ ] Sentry ไม่มี error ใหม่จาก platform นี้หลังทดสอบครบ

## Definition of Done

- [ ] Day-1 verify ผ่านครบทุกข้อ
- [ ] `api-inventory.md` ครบทุก API ใน confirmed scope และ critical API เป็น `LIVE VERIFIED`
- [ ] `sequence.d2` มีตั้งแต่ก่อน code, developer approve แล้ว และตรงกับ behavior ล่าสุด
- [ ] D2 validate/render ผ่าน + `sequence.svg` เป็น version ล่าสุด
- [ ] ทุก Flow ID map ไป automated/manual/UAT result ใน `test-matrix.md`
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
