# CLAUDE.md

Repo นี้คือศูนย์รวม **Claude Code skills ของทีม dobybot** — ดูภาพรวมและวิธีติดตั้งใน [README.md](README.md)

## โครงสร้างที่ต้องรักษา

- Skill อยู่ที่ `skills/<group>/<ชื่อ-skill>/SKILL.md` — group ปัจจุบัน:
  `in-development` (กำลังพัฒนา/เก็บ feedback) และ `old` (รุ่นก่อนจัดระเบียบ ยังใช้ได้)
- `install.sh` scan โครงสร้างนี้อัตโนมัติ — เพิ่ม group ใหม่ได้โดยไม่ต้องแก้ script
- Skill ถูกติดตั้งเป็น symlink จากโฟลเดอร์ skill ของ agent ปลายทางชี้เข้า repo (Windows = directory
  junction) — ปลายทางเลือกได้: Claude Code (`~/.claude/skills/`) หรือ Codex (`~/.codex/skills/`)
  หรือทั้งคู่ ผ่านตัวเลือก `--target claude|codex|both` (PowerShell: `-Target`) ·
  โค้ดใช้ `TARGET_DIRS` / `$TargetDirs` วนทุกปลายทาง อย่าเขียนทับด้วย dest เดียวอีก —
  **การย้าย/เปลี่ยนชื่อโฟลเดอร์ skill ทำให้ link ของทั้งทีมขาด** ให้แจ้งทีมและบอกให้รันตัวติดตั้งใหม่
- `pyproject.toml` / `uv.lock` / `.python-version` ใช้โดย skill กลุ่ม Kiwi TCMS ใน `skills/old/` — อย่าลบ
- **ตัวติดตั้งมี 2 ชุดต้องแก้คู่กันเสมอ**: `install.sh` / `install-mcp.sh` (macOS/Linux) กับ
  `install.ps1` / `install-mcp.ps1` (Windows) — พฤติกรรม, ตัวเลือก CLI และข้อความต้องตรงกัน ·
  ฝั่ง `.sh` มี guard ตรวจ Git Bash/MSYS แล้ว `exec` ต่อให้ `.ps1` (เพราะ `ln -s` บน Git Bash = copy)
- ไฟล์ `.ps1` **ต้องเซฟเป็น UTF-8 with BOM** — PowerShell 5.1 อ่านไฟล์ไม่มี BOM เป็น ANSI
  ทำให้ข้อความไทยเพี้ยนจน parse ไม่ผ่าน (ตรวจได้ด้วย
  `[System.Management.Automation.Language.Parser]::ParseFile(...)`)
- **MCP server** อยู่ที่ `mcp/<name>/<name>-mcp.mjs` (bundle ไฟล์เดียว build มาแล้ว) ติดตั้งด้วย `install-mcp.sh`
  ซึ่งถามว่าจะลงให้ Claude Code, Codex หรือทั้งสอง แล้วลงแบบ global ผ่าน CLI ของ agent ที่เลือก
  (ไม่ symlink แบบ skill — ลงทะเบียนชี้มาที่ไฟล์ใน clone นี้
  `git pull` จึงอัปเดต bundle ให้เอง) · bundle เป็น artifact ที่ build จาก repo ต้นทาง — refresh ตามวิธีใน
  `mcp/<name>/README.md` และอัปเดต version stamp ทุกครั้งที่เปลี่ยน

## Convention การเขียน/แก้ skill

- `SKILL.md` ต้องมี frontmatter `name:` (ตรงกับชื่อโฟลเดอร์) และ `description:` ที่มี trigger phrases
- ไฟล์ประกอบอยู่ใน `references/` หรือ `assets/` ภายในโฟลเดอร์ skill
- **skill มี node app ของตัวเองได้** (ดู "Node app ในโฟลเดอร์ skill" ข้างล่าง) — ของแบบนี้
  ไม่ใช่ "ไฟล์ประกอบ" จึงไม่ต้องยัดลง `references/` หรือ `assets/`
- ก่อนแก้ skill ที่มี `DEVELOPMENT.md` ให้อ่านไฟล์นั้นก่อนเสมอ — มันบันทึก design decisions
  และข้อห้ามที่ตัดสินใจไว้แล้ว — และอัพเดตมันเมื่อมีการตัดสินใจใหม่
- Prose ที่ผู้ใช้อ่านเป็นภาษาไทย ศัพท์ technical คงเป็นอังกฤษ

### Node app ในโฟลเดอร์ skill

skill ที่ต้องมี runtime ของตัวเอง (ตอนนี้มีตัวเดียว: viewer ของ `learn-diff` ที่
`skills/in-development/learn-diff/viewer/`) วาง node app เป็น **subfolder ของโฟลเดอร์ skill**
ได้ ภายใต้กฎนี้:

- app อยู่ในโฟลเดอร์ skill เพราะ symlink ของตัวติดตั้งต้องพามันไปด้วย — ลง skill = ได้ app,
  ถอด skill = app หายตาม และ `git pull` อัปเดต app ให้ทั้งทีมโดยไม่ต้อง release
- **1 โฟลเดอร์ = 1 pnpm project** (`package.json` + lockfile ของตัวเอง) ไม่ผูกกับ root ของ repo
  ซึ่งเป็น Python (uv) อยู่แล้ว
- ตัวติดตั้ง **ไม่ hardcode ชื่อ skill**: หลัง link เสร็จมันจะไล่หา `package.json` ในโฟลเดอร์ skill
  และใน subfolder ชั้นเดียว (ข้าม `node_modules/` กับ dot-dir) แล้วรัน `pnpm install` (fallback `npm`) ให้
  — skill ใหม่ที่มี node app จึงไม่ต้องแก้ `install.sh` / `install.ps1`
- ต้องการ **node >= 20 และ pnpm >= 9** (ค่าคงที่ `NODE_MIN_MAJOR` / `PNPM_MIN_MAJOR` ใน `install.sh`
  และ `$NodeMinMajor` / `$PnpmMinMajor` ใน `install.ps1`) — ไม่มี = ตัวติดตั้งบอกวิธีลงแล้ว exit 1
  ไม่ใช่ลงแบบครึ่ง ๆ กลาง ๆ
- **รันจาก source เท่านั้น** ไม่ commit build artifact (`node_modules/` กับ `dist/` อยู่ใน
  `.gitignore` ของ root) — คนแก้ app แล้วเห็นผลทันที ไม่มีขั้นตอน build/release
- ถ้าเพิ่ม dependency ที่ต้อง build ตอน install (native/postinstall) ต้องเพิ่มชื่อมันใน
  `onlyBuiltDependencies` ของ `pnpm-workspace.yaml` ในโฟลเดอร์ app ด้วย — pnpm 10+ บล็อก
  postinstall script เป็นค่าเริ่มต้น

## Agent skills

### Issue tracker

Issue ของ repo นี้อยู่ใน GitHub Issues ของ `dobybot/dev-support` — ใช้ `gh` CLI ·
ดู [docs/agents/issue-tracker.md](docs/agents/issue-tracker.md)

### Triage labels

ใช้ชุด label มาตรฐาน 5 ตัว (`needs-triage`, `needs-info`, `ready-for-agent`,
`ready-for-human`, `wontfix`) · ดู [docs/agents/triage-labels.md](docs/agents/triage-labels.md)

### Domain docs

Single-context — `CONTEXT.md` + `docs/adr/` ที่ root ·
ดู [docs/agents/domain.md](docs/agents/domain.md)

ตอบโต้กับผู้ใช้งานด้วยภาษาไทย
