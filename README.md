# dev-support — Claude Code Skills ของทีม dobybot

Repo กลางสำหรับเก็บ **Claude Code skills** ที่ทีมใช้ร่วมกัน ติดตั้งผ่าน `install.sh`
แล้วเลือกเฉพาะ skill ที่ต้องการใช้

## โครงสร้าง

```
dev-support/
├── install.sh              # ตัวติดตั้ง skill (macOS/Linux) — เลือกปลายทาง (Claude/Codex) แล้วเลือก skill
├── install.ps1             # ตัวเดียวกันสำหรับ Windows (PowerShell)
├── install-mcp.sh          # ตัวติดตั้ง MCP server (ลง global ให้ Claude Code)
├── install-mcp.ps1         # ตัวเดียวกันสำหรับ Windows (PowerShell)
├── skills/
│   ├── in-development/     # skill ที่กำลังพัฒนา/ทดลองใช้ (เก็บ feedback อยู่)
│   │   └── learn-diff/
│   │       └── viewer/     # หน้าอ่านของ learn-diff (node app — ต้องมี node/pnpm ดูข้อกำหนดข้างล่าง)
│   └── old/                # skill รุ่นก่อนจัดระเบียบ repo — ยังติดตั้งใช้ได้
│       ├── better-review/
│       ├── generate-test-cases/
│       └── ...
├── mcp/                    # MCP server แบบ bundle (รันได้เลย ไม่ต้อง build)
│   └── artemis/            # ห่อ REST API ของ Artemis · 21 tool
├── pyproject.toml          # Python env สำหรับ skill กลุ่ม Kiwi TCMS (อย่าลบ)
└── rules/                  # (สำรองไว้สำหรับ rules ของทีมในอนาคต)
```

## ติดตั้ง skill

**macOS / Linux**

```bash
git clone git@github.com:dobybot/dev-support.git
cd dev-support
./install.sh
```

**Windows** (PowerShell — ดู [หมายเหตุสำหรับ Windows](#หมายเหตุสำหรับ-windows))

```powershell
git clone git@github.com:dobybot/dev-support.git
cd dev-support
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

ถามปลายทางก่อนว่าจะลง skill ให้ agent ตัวไหน:

```
ติดตั้ง skill เข้า agent ตัวไหน
  1) Claude Code  (~/.claude/skills)
  2) Codex        (~/.codex/skills)
  3) ทั้งสอง

เลือก [1]:
```

skill ชุดเดียวกันใช้ได้ทั้งสอง agent — ต่างกันแค่โฟลเดอร์ปลายทางที่วางทางลัดไว้
เลือก `3` ได้ถ้าใช้ทั้ง Claude Code และ Codex บนเครื่องเดียวกัน

จากนั้นจะได้เมนูเลือก skill:

```
dev-support skills — เลือก skill ที่จะติดตั้ง/อัพเดตเข้า Claude Code

   1) learn-diff                     (in-development)   [not installed]
   2) better-review                  (old)              [not installed]
   ...
เลือกหมายเลข (คั่นด้วย space เช่น "1 3"), a = ทั้งหมด, q = ยกเลิก:
```

พิมพ์หมายเลขที่ต้องการ (เช่น `1 3`) แล้ว **restart agent ปลายทาง** หนึ่งครั้ง skill จะพร้อมใช้
(ลงทั้งสองปลายทางแล้วสถานะไม่ตรงกันจะขึ้นว่า `บางปลายทาง`)

โหมดไม่ต้องตอบคำถาม (สำหรับ script/onboarding) — ไม่ระบุปลายทาง = `claude` เหมือนเดิม:

```bash
./install.sh --all                     # ติดตั้งทุก skill (Claude Code)
./install.sh learn-diff                # ติดตั้งเฉพาะชื่อที่ระบุ
./install.sh --target codex --all      # ปลายทาง: claude | codex | both
./install.sh --codex learn-diff        # ทางลัด (มี --claude / --both ด้วย)
```

```powershell
.\install.ps1 -All                     # Windows — ติดตั้งทุก skill (Claude Code)
.\install.ps1 learn-diff               # Windows — เฉพาะชื่อที่ระบุ
.\install.ps1 -Target codex -All       # ปลายทาง: claude | codex | both
.\install.ps1 -Codex learn-diff        # ทางลัด (มี -Claude / -Both ด้วย)
```

### การอัพเดต

skill ถูกติดตั้งเป็น **symlink** (บน Windows เป็น **junction**) — ทางลัดชี้กลับมาที่ clone นี้ ดังนั้น:

```bash
git pull
```

เท่านี้ skill ที่ติดตั้งไว้อัพเดตเองทันที ไม่ต้องรัน `install.sh` ซ้ำ —
รันซ้ำเฉพาะเมื่อต้องการ **เพิ่ม skill ใหม่** หรือมี skill **ย้ายโฟลเดอร์** ใน repo
(skill ที่มี node app อย่าง `learn-diff` ก็ไม่ต้องรันซ้ำ — ถ้า `git pull` เปลี่ยน lockfile
มันจะลง dependency ให้เองตอนสั่งใช้งานครั้งถัดไป)

## ติดตั้ง MCP server

นอกจาก skill แล้ว repo นี้ยังแจก **MCP server** ที่ build ไว้พร้อมใช้ (bundle ไฟล์เดียว รันด้วย `node`
ได้เลย ไม่ต้องมี repo ต้นทางหรือ build เอง) ตอนนี้มี **artemis** — ให้ Claude อ่าน/เขียนงานใน Artemis
ได้ตรงจากแชต (21 tool)

```bash
./install-mcp.sh
```

```powershell
powershell -ExecutionPolicy Bypass -File .\install-mcp.ps1   # Windows
```

สคริปต์จะถาม `ARTEMIS_API_URL` + API token (การพิมพ์ token จะไม่แสดงผล) แล้ว **ลงทะเบียนแบบ global**
ด้วย `claude mcp add --scope user` — **ใช้ได้ทุกโปรเจกต์** ไม่ใช่แค่โฟลเดอร์เดียว · จากนั้น
**restart Claude Code** แล้วลองพิมพ์ `list projects ใน artemis`

- สร้าง token ที่หน้าเว็บ Artemis → **Admin → API Tokens** (เริ่มลองติ๊ก `projects:read` + `tickets:read`)
- ค่าปริยาย `ARTEMIS_API_URL` = `https://artemis-actions.dobybot.com` · กด Enter ผ่านได้
- ตั้ง env ล่วงหน้าเพื่อข้ามคำถาม: `ARTEMIS_API_TOKEN=… ./install-mcp.sh`
  (Windows: `$env:ARTEMIS_API_TOKEN='art_…'; .\install-mcp.ps1`)
- **`git pull` อัปเดต bundle ให้เอง** (ทางที่ลงทะเบียนไว้ไม่เปลี่ยน) — แค่ restart Claude Code
- ถอนออก: `claude mcp remove artemis --scope user`

รายละเอียดแต่ละตัว: [`mcp/artemis/README.md`](mcp/artemis/README.md)

> ⚠️ อย่าลบหรือย้ายโฟลเดอร์ clone นี้ — symlink/junction จะขาด ถ้าจำเป็นต้องย้าย ให้รัน
> ตัวติดตั้งใหม่หลังย้าย

### ถอนการติดตั้ง

```bash
rm ~/.claude/skills/<ชื่อ-skill>     # Codex: ~/.codex/skills/<ชื่อ-skill>
```

```powershell
# Windows — ใช้ rmdir กับ junction (Remove-Item -Recurse อาจไล่ลบไฟล์จริงใน repo)
cmd /c rmdir "$env:USERPROFILE\.claude\skills\<ชื่อ-skill>"
cmd /c rmdir "$env:USERPROFILE\.codex\skills\<ชื่อ-skill>"
```

(ลบได้อย่างปลอดภัย — เป็นแค่ทางลัด ตัว skill จริงอยู่ใน repo)

## หมายเหตุสำหรับ Windows

- ใช้ `install.ps1` / `install-mcp.ps1` — ถ้าเผลอรัน `./install.sh` ใน **Git Bash** สคริปต์จะ
  เรียก `.ps1` ให้อัตโนมัติ (เพราะ `ln -s` บน Git Bash **คัดลอกโฟลเดอร์** แทนการทำ symlink
  ผลคือ `git pull` ไม่อัพเดต skill ให้อีกต่อไป)
- ติดตั้งเป็น **directory junction** ไม่ต้องเป็น admin และไม่ต้องเปิด Developer Mode
- ถ้าโดน execution policy บล็อก ให้เติม `-ExecutionPolicy Bypass` ตามตัวอย่างข้างบน
- เคยรัน `install.sh` ใน Git Bash มาก่อน? จะเห็น skill ขึ้นสถานะ `personal — skip`
  เพราะกลายเป็นโฟลเดอร์สำเนา — ลบโฟลเดอร์นั้นใน `%USERPROFILE%\.claude\skills\` แล้วรัน
  `install.ps1` ใหม่ (สคริปต์จะบอกคำสั่งลบให้)
- ไม่ต้องใช้ `jq` — `install.ps1` จัดการ JSON ด้วย PowerShell เอง

### อัพเกรดจากระบบเก่า (auto-sync)

เดิม repo นี้ใช้ SessionStart hook sync ทุก skill อัตโนมัติ (`.agents/sync-skills.sh`)
— ระบบนั้นถูกแทนที่แล้ว แค่ `git pull` แล้วรันตัวติดตั้งหนึ่งครั้ง:
ตัวติดตั้งจะถอด hook เก่าออกจาก `~/.claude/settings.json` ให้เอง (มี backup)
แล้วให้เลือก skill ที่ต้องการใช้ต่อ

## ข้อกำหนดเพิ่มเติมบาง skill

- **`learn-diff`** เปิดหน้าอ่านผ่าน **viewer app** ที่รันบนเครื่องตัวเอง (React + Vite dev server
  ที่ `127.0.0.1:5174`) จึงต้องมี:
  - **node >= 20** — [nodejs.org](https://nodejs.org) · macOS: `brew install node` ·
    Windows: `winget install OpenJS.NodeJS.LTS`
  - **pnpm >= 9** — `npm install -g pnpm` (หรือ `corepack enable pnpm`) · ไม่มี pnpm ตัวติดตั้ง
    จะถอยไปใช้ `npm` ที่มากับ node ให้

  ตัวติดตั้งลง dependency ของ viewer ให้ตอนติดตั้ง skill (ครั้งแรกกินเวลาสักพัก) · **ไม่มี node
  หรือไม่มีทั้ง pnpm และ npm = ตัวติดตั้งบอกวิธีลงแล้ว exit 1** — skill อื่นยังถูกติดตั้งตามปกติ
  ลง node แล้วรันตัวติดตั้งซ้ำได้เลย · `git pull` ที่เปลี่ยน lockfile ไม่ต้องทำอะไรเพิ่ม
  skill ตรวจแล้วลงให้เองตอนสั่งรัน
- **skill กลุ่ม Kiwi TCMS** (`generate-test-cases`, `get-kiwi-test-cases`,
  `gen-cypress-test`, `generate-automated-test`) รันสคริปต์ Python ผ่าน
  [uv](https://docs.astral.sh/uv/) จาก root ของ repo นี้ — ติดตั้ง uv แล้วรัน
  `uv sync` หนึ่งครั้ง และต้องมีไฟล์ `.env` ใส่ credential ของ Kiwi (ถามทีม QA)
- `install.sh` (macOS/Linux) ใช้ `jq` เฉพาะตอนถอด hook เก่า — ถ้ายังไม่มี: `brew install jq`

## เขียน skill ใหม่ให้ทีม

1. สร้างโฟลเดอร์ `skills/in-development/<ชื่อ-skill>/` (ชื่อเป็น kebab-case)
2. เขียน `SKILL.md` มี frontmatter `name:` และ `description:` (ใส่ trigger phrases
   ใน description ด้วย เพื่อให้ Claude เรียกใช้ได้ถูกจังหวะ)
3. ไฟล์ประกอบวางใน `references/` หรือ `assets/` ภายในโฟลเดอร์ skill · ถ้า skill ต้องมี
   **node app** ของตัวเอง วางเป็น subfolder (เช่น `learn-diff/viewer/`) ที่มี `package.json`
   ของตัวเอง — ตัวติดตั้งจะ `pnpm install` ให้เอง ไม่ต้องแก้ script (กติกาเต็มใน
   [CLAUDE.md](CLAUDE.md#node-app-ในโฟลเดอร์-skill))
4. แนะนำให้มี `DEVELOPMENT.md` บันทึก design decisions และแผนพัฒนา เพื่อให้คน/agent
   ที่มาพัฒนาต่อมี context (ดูตัวอย่างที่ `skills/in-development/learn-diff/`)
5. เปิด PR — เมื่อ skill นิ่งแล้วค่อยพิจารณาย้ายกลุ่ม

## Feedback

Skill ในกลุ่ม `in-development` เป็นส่วนหนึ่งของ workflow improvement program —
ให้ feedback ได้ที่บอร์ด Artemis: https://artemis.dobybot.com/projects/DW
