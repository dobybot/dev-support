# artemis — MCP server (bundle)

MCP server ที่ห่อ REST API `/api/v1` ของ Artemis ให้ AI Agent (Claude Code/Codex) อ่าน/เขียนงานได้ **23 tool**
(โปรเจกต์ · บอร์ด · งาน · sprint · backlog · คอมเมนต์ · label · ไฟล์แนบ · pull request)

- `artemis-mcp.mjs` = **bundle ไฟล์เดียว** (esbuild รวม SDK + zod เข้าไปแล้ว) รันด้วย `node` ได้เลย
  ไม่ต้องมี `node_modules` หรือ repo artemis
- ต้นทาง/คู่มือเต็ม: `tools/artemis-mcp/` ใน repo `dobybot/artemis`

> **ทางหลักของผู้ใช้ทั่วไปตอนนี้คือหน้าเว็บ** (ART-151/154, Sep 2026): เข้า Artemis → เมนูบัญชี →
> **MCP Server** (`/settings/mcp`) กดดาวน์โหลด `artemis-mcp-<version>.mjs` (หน้าเทียบ SHA-256 ให้ก่อนบันทึก)
> พร้อม snippet ตั้งค่าสำเร็จรูป — เวอร์ชันตรงกับที่ deploy อยู่เสมอ ไม่ต้อง `git pull` dev-support ·
> **สำเนาในนี้ + flow refresh ด้านล่างเก็บไว้สำหรับ maintainer ที่แก้โค้ด tool เองแล้วอยากทดสอบ bundle
> ก่อน merge** (หรือเครื่องที่ตั้ง MCP แบบ global ผ่าน `install-mcp.sh` ไว้ก่อนหน้า)

## ติดตั้ง

ที่รากของ dev-support:

```bash
./install-mcp.sh
```

เลือกได้ว่าจะลงให้ Claude Code, Codex หรือทั้งสองแบบ **global** (ใช้ได้ทุกโปรเจกต์) · จากนั้นจะถาม
`ARTEMIS_API_URL` + token แล้ว smoke-test ให้ · เสร็จแล้ว restart agent ที่เลือก — ดูรายละเอียดใน
[README หลัก](../../README.md#ติดตั้ง-mcp-server)

## เวอร์ชัน bundle

| ฟิลด์ | ค่า |
|---|---|
| `@artemis/mcp` version | `0.4.0` |
| build จาก artemis commit | `5cbb3b9` — feat(art-161): ถอดลิงก์ PR ออกจาก ticket ได้ทั้ง REST และ MCP (ART-161) (#258) · เพิ่ม tool `unlink_pull_request` เป็นตัวที่ 24 — ต่อจาก 0.3.1 (DEV@`1dd7bf5`) (ปลาย `DEV`) |
| อัปเดต bundle เมื่อ | 2026-09-16 |

## refresh bundle (สำหรับ maintainer)

เมื่อ source ของ artemis-mcp เปลี่ยน (ใน repo `dobybot/artemis`):

```bash
# 1) ใน repo artemis — build ใหม่
pnpm mcp:build

# 2) คัดลอกทับ bundle ในนี้
cp <artemis>/tools/artemis-mcp/dist/artemis-mcp.mjs <dev-support>/mcp/artemis/artemis-mcp.mjs
```

แล้วอัปเดตตาราง "เวอร์ชัน bundle" ด้านบน + commit — ทีมได้ของใหม่ตอน `git pull`
(ทางที่ลงทะเบียนไว้ชี้มาที่ไฟล์นี้ในตำแหน่งเดิม จึงใช้ได้เลยหลัง restart โดยไม่ต้องรัน installer ซ้ำ)
