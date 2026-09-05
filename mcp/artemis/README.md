# artemis — MCP server (bundle)

MCP server ที่ห่อ REST API `/api/v1` ของ Artemis ให้ AI Agent (Claude Code/Codex) อ่าน/เขียนงานได้ **23 tool**
(โปรเจกต์ · บอร์ด · งาน · sprint · backlog · คอมเมนต์ · label · ไฟล์แนบ · pull request)

- `artemis-mcp.mjs` = **bundle ไฟล์เดียว** (esbuild รวม SDK + zod เข้าไปแล้ว) รันด้วย `node` ได้เลย
  ไม่ต้องมี `node_modules` หรือ repo artemis
- ต้นทาง/คู่มือเต็ม: `tools/artemis-mcp/` ใน repo `dobybot/artemis`

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
| `@artemis/mcp` version | `0.3.0` |
| build จาก artemis commit | `68b1363` — feat(art-140): GitHub PR Sync Phase 3 (ART-137 · `list_pull_requests` มี `ที่มา:github/api` · `link_pull_request` อธิบายเรื่อง sync/ENV rule) — ต่อจาก 0.2.1 (DEV@06ba98e) |
| อัปเดต bundle เมื่อ | 2026-09-05 |

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
