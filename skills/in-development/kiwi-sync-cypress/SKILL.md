---
name: kiwi-sync-cypress
description: รัน Cypress test suite ทั้งหมดแล้ว sync ผล automation_status กลับ Kiwi TCMS ทีละ TC — pass → "done", fail/error/skip → "maintenance". ใช้เมื่อต้องการตรวจสอบและอัพเดทสถานะ automation ของ test case ทั้งหมดใน Kiwi ให้ตรงกับ Cypress จริง
---

# kiwi-sync-cypress — Sync Cypress Results → Kiwi TCMS

Skill นี้รัน Cypress test suite ทั้งหมด แล้วอัพเดท `automation_status` ใน Kiwi TCMS ตาม result จริง

## Prerequisite

- `task dev` ต้องรันอยู่ก่อน (Cypress ต้องการ `FRONTEND_HOST` และ `BACKEND_HOST`)
- กรอก `KIWI_PASSWORD` ที่แท้จริงใน `.claude/scripts/kiwi/.env` ก่อนรัน
- อ่านรายละเอียด API/method/field หลักจาก `docs/kiwi/kiwi-tcms-rpc-api.md`
- อ่าน notes เฉพาะ instance/workflow จาก `.claude/skills/kiwi-sync-cypress/kiwi-api-reference.md`

## Status mapping

| สถานะ Cypress | automation_status ใน Kiwi |
|---|---|
| pass | `done` |
| fail (assertion) | `maintenance` |
| error (exception) | `maintenance` |
| pending / skip | `maintenance` |
| ไม่มีใน Cypress | ไม่แตะ (ปล่อยไว้) |

ถ้า TC เดียวกันมีหลาย sub-test และบางตัว fail — `maintenance` ชนะเสมอ
ค่า valid ที่ยืนยันกับ instance นี้คือ `todo`, `in_progress`, `in_review`, `done`,
`maintenance`, `not_automatable`.

## Steps

### 1. ตรวจสอบ .env

อ่านไฟล์ `.claude/scripts/kiwi/.env` แล้วตรวจว่า `KIWI_PASSWORD` ไม่ใช่ค่า placeholder
`your_password` ถ้าใช่ ให้หยุดและแจ้งผู้ใช้ให้แก้ก่อน

### 2. รัน Cypress พร้อม JSON reporter

รันด้วย Bash tool จาก `e2e/`:

```bash
cd /d/Dobybot/dobybot-monorepo/e2e && corepack pnpm exec cypress run --reporter json > /tmp/cypress-results.json 2>/tmp/cypress-stderr.txt; echo "cypress_exit:$?"
```

- ผล JSON ถูกเขียนไปที่ `/tmp/cypress-results.json` เสมอ ไม่ว่า test จะ pass/fail
- exit code ≠ 0 เป็นเรื่องปกติถ้ามี test ที่ fail — ไม่ต้อง panic
- ถ้า exit code ≠ 0 ให้อ่าน `/tmp/cypress-stderr.txt` เพื่อดู error log เพิ่มเติมเมื่อจำเป็น

### 3. รัน sync script

```bash
node /d/Dobybot/dobybot-monorepo/.claude/skills/kiwi-sync-cypress/sync.mjs /tmp/cypress-results.json
node /d/Dobybot/dobybot-monorepo/.claude/skills/kiwi-sync-cypress/sync.mjs /tmp/cypress-results.json --apply
```

Script จะทำทุกอย่างอัตโนมัติ:
- อ่าน credential จาก `.env`
- parse JSON result จาก Cypress
- หา TC ID จาก test title ด้วย regex `\b(TC-\d+(?:-\d+)?)\b`
- สำหรับ **parent TC** (`TC-131`): ค้นหา Kiwi ด้วย numeric ID โดยตรง
- สำหรับ **sub-TC** (`TC-143-2`): ข้ามและรายงานเป็น unresolved เพราะ instance นี้ไม่มี field mapping ที่เชื่อถือได้
- อัพเดท `automation_status` ใน Kiwi ผ่าน JSON-RPC (`Auth.login` + `sessionid` cookie)
- แสดงตารางสรุปผล

### 4. รายงานผลให้ผู้ใช้

แปลงผลที่ script print ออกมาเป็น summary สั้น ๆ ที่เข้าใจง่าย ได้แก่:
- จำนวน TC ที่อัพเดทสำเร็จ แยก Done / Maintenance
- รายชื่อ TC ที่ไม่พบใน Kiwi (อาจยังไม่ได้สร้าง)
- TC ที่เกิด error ระหว่างอัพเดท พร้อม detail
