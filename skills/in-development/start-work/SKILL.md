---
name: start-work
description: เริ่มงานใน dobybot-monorepo หรือ ez-act — อ่าน Artemis ticket หรือ GitHub Issue ตามโปรเจกต์ ตั้งชื่อ branch และเตรียม checkout/worktree รวมถึงงานที่ไม่ผูก ticket. Use when starting work, starting a DBT or ACC ticket or GitHub issue, or preparing a ticket branch/worktree.
---

# เริ่มงานตามโปรเจกต์

เตรียม branch และไฟล์ตั้งค่าสำหรับเริ่มงาน แล้วรายงานคำสั่งรันต่อให้ผู้ใช้
ไม่เริ่ม implement, เปิด PR หรือรัน dev server โดยอัตโนมัติ

## เลือกขั้นตอนก่อนทำงาน

ตรวจ `git rev-parse --show-toplevel` และ `git remote -v` ใน checkout ปัจจุบัน
อ่าน `AGENTS.md` ของ repository และเอกสารที่เกี่ยวข้องก่อนเลือกขั้นตอน
อย่าใช้ตำแหน่งติดตั้ง skill เป็น repository ที่จะเริ่มงาน

- remote repository เป็น `ez-dev-cluster/ez-act` (รองรับทั้ง SSH/HTTPS):
  อ่านและทำตาม [references/ez-act.md](references/ez-act.md) เท่านั้น
- remote repository ชื่อ `dobybot-monorepo`:
  อ่านและทำตาม [references/dobybot.md](references/dobybot.md) เท่านั้น
- ถ้า remote ไม่ชัดเจน ให้ตรวจเอกสารโปรเจกต์เพื่อยืนยันตัวตนก่อน
  ถ้าไม่ใช่สองโปรเจกต์นี้ ให้รายงานว่ายังไม่มีขั้นตอนรองรับ ห้ามใช้กติกา Dobybot แทนเอง

ชื่อ branch ใช้รูปแบบเดียวกันคือ `{TICKET}--{track}--{slug}` แต่ base branch,
ปลายทาง PR, แหล่งข้อมูลของงาน และคำสั่งรัน ต้องเลือกตามโปรเจกต์
โดยเฉพาะ ez-act ใช้ `UAT` ตัวพิมพ์ใหญ่เสมอ และห้ามจัดการ `main`
