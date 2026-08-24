# examples/

Run ตัวอย่างที่ใช้เป็น **reference implementation ของ content format** — ดู
[references/content-format.md](../../references/content-format.md) ประกอบ

## pr-230-etax-link-notify

แปลงมาจาก output ของ v2 (หน้า HTML 7 หน้าของ PR #230 / DBT-337) ด้วยมือ เพื่อพิสูจน์ว่า
markdown + JSON แบกของที่หน้า HTML เดิมแบกได้จริง — ข้อที่แบกไม่ได้ถูกจดไว้ท้าย
`content-format.md` แล้ว

### เปิดอ่าน

```bash
# จากโฟลเดอร์ viewer
node scripts/register-run.mjs \
  --repo /path/to/dobybot-monorepo \
  --content examples/pr-230-etax-link-notify \
  --pr 230 \
  --title "แจ้งลิงก์ ETax Link ทาง email/chat" \
  --url https://github.com/dobybot/dobybot-monorepo/pull/230

pnpm dev   # แล้วเปิด http://127.0.0.1:5174/r/pr-230-etax-link-notify
```

ตั้ง `LEARN_DIFF_HOME` นำหน้าทั้งสองคำสั่งได้ ถ้าไม่อยากให้ไปแตะ registry จริงใน `~/.claude/learn-diff/`

### ข้อควรรู้

- `--repo` ต้องชี้ไปที่ **dobybot-monorepo** เพราะ `readingLists` ใน `run.json` อ้าง path แบบ
  `services/dobybot/...` · ถ้าไม่มี monorepo ในเครื่อง หน้าเว็บยังอ่านได้ครบ แต่ file API (ตั๋ว #7)
  จะเปิดโค้ดไม่ได้
- `commit` ใน `run.json` คือ `e2b2696bb60401824ae512be9052ebce7ce85e70` (HEAD ของ worktree
  `dbt-337-merge` ตอนแปลง) — ช่วงบรรทัดใน `readingLists` อ้างอิงไฟล์ที่ commit นั้น
  ถ้าเครื่องยังไม่มี commit นี้ file API จะตอบ `commit_not_found` พร้อมบอกให้ fetch ก่อน
- ไฟล์ในโฟลเดอร์นี้ **ไม่ใช่ fixture ของเทสต์** — เทสต์สร้าง fixture ของตัวเองใน temp dir
  (`test/api.test.ts`) เพื่อไม่ให้เทสต์ผูกกับเนื้อหาตัวอย่าง
