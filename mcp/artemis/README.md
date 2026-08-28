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
| `@artemis/mcp` version | `0.2.0` |
| build จาก artemis commit | `89f394a` — chore(mcp): bump @artemis/mcp เป็น 0.2.0 (ปลาย `DEV`) |
| อัปเดต bundle เมื่อ | 2026-08-28 |

## refresh bundle (สำหรับ maintainer)

เมื่อ source ของ artemis-mcp เปลี่ยน (ใน repo `dobybot/artemis`):

1. **Build จากปลาย branch `DEV` เสมอ** — ไม่ใช่ branch local ที่อาจล้าหลัง ไม่งั้น bundle ที่แจกจะ
   ถอย feature · ระวัง: remote มี branch ชื่อ `DEV` (ตัวใหญ่) — บน macOS/Windows ที่ filesystem
   ไม่แยก case คำสั่ง `git push origin ...:dev` จะ**สร้าง branch ใหม่ตัวเล็กบน GitHub** แทนที่จะ
   เข้า `DEV` ให้ระบุ ref เต็มเป็น `refs/heads/DEV` เสมอ · ถ้า working tree มีงานค้าง ใช้
   `git worktree add --detach /tmp/artemis-build origin/DEV` แล้ว build จากตรงนั้นแทน

2. **Bump version ต้องแก้ 2 จุด** ใน `tools/artemis-mcp/` — `package.json` และค่าคงที่
   `VERSION` ใน `src/stdio.ts` (ตัวหลังคือค่าที่ server รายงานจริงตอน handshake ไม่ได้อ่านจาก
   package.json) — commit เข้า `DEV` ด้วย เพื่อให้ commit ในตารางข้างบนชี้ไปหา source ตรงรุ่นจริง

3. **Build แล้วคัดลอกทั้ง bundle และ source map**:

   ```bash
   # ใน repo artemis (หรือ worktree ชั่วคราว)
   pnpm install && pnpm mcp:build

   # คัดลอกทับในนี้ — เอา .map มาด้วย
   cp <artemis>/tools/artemis-mcp/dist/artemis-mcp.mjs \
      <artemis>/tools/artemis-mcp/dist/artemis-mcp.mjs.map \
      <dev-support>/mcp/artemis/
   ```

4. **Smoke-test ก่อน commit** — ยิง MCP `initialize` handshake ดูว่า server ตอบและรายงาน
   version ใหม่ (ใช้ URL/token หลอกได้ เพราะ handshake ยังไม่เรียก API):

   ```bash
   printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}\n' |
     ARTEMIS_API_URL=http://localhost:9 ARTEMIS_API_TOKEN=art_$(printf '0%.0s' {1..64}) \
     node mcp/artemis/artemis-mcp.mjs | head -c 200
   # ต้องเห็น "serverInfo":{"name":"artemis","version":"<เลขใหม่>"}
   ```

5. อัปเดตตาราง "เวอร์ชัน bundle" ด้านบน (version · commit · วันที่) + commit — ทีมได้ของใหม่ตอน
   `git pull` (ทางที่ลงทะเบียนไว้ชี้มาที่ไฟล์นี้ในตำแหน่งเดิม จึงใช้ได้เลยหลัง restart โดยไม่ต้องรัน
   installer ซ้ำ)
