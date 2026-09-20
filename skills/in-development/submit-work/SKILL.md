---
name: submit-work
version: 1.3.0
description: ส่งงาน dobybot-monorepo หรือ ez-act โดยตรวจงาน commit/push เปิดหรือใช้ PR เดิม และผูก PR พร้อมสถานะจริงกับ Artemis ตามกติกาโปรเจกต์. Use when submitting work, opening a PR for a finished ticket, or refreshing a linked PR status.
---

# ส่งงานตามโปรเจกต์

ตรวจ repository จาก `git rev-parse --show-toplevel` และ `git remote -v`
อ่าน `AGENTS.md` และกติกาส่งงานของ repository ก่อน ห้ามเลือกจากที่ติดตั้ง skill

- `ez-dev-cluster/ez-act`: อ่าน [references/ez-act.md](references/ez-act.md) เท่านั้น
- repository ชื่อ `dobybot-monorepo`: อ่าน [references/dobybot.md](references/dobybot.md) เท่านั้น
- ถ้าระบุ repository ไม่ได้ให้ตรวจเอกสาร หากยังไม่ใช่สองโปรเจกต์นี้ให้รายงานว่าไม่รองรับ
  ห้ามใช้ขั้นตอน Dobybot เป็นค่าเริ่มต้น

สำหรับ ez-act ทุก track เปิด PR เข้า `UAT` เท่านั้น ห้ามจัดการ `main`
การส่งงานไม่ได้อนุญาตให้ merge PR หรือประกาศว่า feature เสร็จ
ถ้าผู้ใช้ขอเพียงอัปเดตสถานะ PR ให้ทำเฉพาะการอ่าน GitHub และ sync ไป Artemis
ไม่ commit/push หรือสร้าง PR ใหม่
