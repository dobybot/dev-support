# artemis — MCP server (bundle)

MCP server ที่ห่อ REST API `/api/v1` ของ Artemis ให้ AI Agent (Claude Code) อ่าน/เขียนงานได้ **21 tool**
(โปรเจกต์ · บอร์ด · งาน · sprint · backlog · คอมเมนต์ · label · ไฟล์แนบ)

- `artemis-mcp.mjs` = **bundle ไฟล์เดียว** (esbuild รวม SDK + zod เข้าไปแล้ว) รันด้วย `node` ได้เลย
  ไม่ต้องมี `node_modules` หรือ repo artemis
- ต้นทาง/คู่มือเต็ม: `tools/artemis-mcp/` ใน repo `dobybot/artemis`

## ติดตั้ง

ที่รากของ dev-support:

```bash
./install-mcp.sh
```

ลงแบบ **global** ด้วย `claude mcp add --scope user` (ใช้ได้ทุกโปรเจกต์) · จะถาม `ARTEMIS_API_URL` + token
แล้ว smoke-test ให้ · จากนั้น **restart Claude Code** — ดูรายละเอียดใน [README หลัก](../../README.md#ติดตั้ง-mcp-server)

## เวอร์ชัน bundle

| ฟิลด์ | ค่า |
|---|---|
| `@artemis/mcp` version | `0.1.0` |
| build จาก artemis commit | `0a3b52e` — feat(mcp): เพิ่มแพ็กเกจ artemis-mcp |
| อัปเดต bundle เมื่อ | 2026-07-22 |

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
