# CLAUDE.md

Repo นี้คือศูนย์รวม **Claude Code skills ของทีม dobybot** — ดูภาพรวมและวิธีติดตั้งใน [README.md](README.md)

## โครงสร้างที่ต้องรักษา

- Skill อยู่ที่ `skills/<group>/<ชื่อ-skill>/SKILL.md` — group ปัจจุบัน:
  `in-development` (กำลังพัฒนา/เก็บ feedback) และ `old` (รุ่นก่อนจัดระเบียบ ยังใช้ได้)
- `install.sh` scan โครงสร้างนี้อัตโนมัติ — เพิ่ม group ใหม่ได้โดยไม่ต้องแก้ script
- Skill ถูกติดตั้งเป็น symlink จาก `~/.claude/skills/` ชี้เข้า repo (Windows = directory junction) —
  **การย้าย/เปลี่ยนชื่อโฟลเดอร์ skill ทำให้ link ของทั้งทีมขาด** ให้แจ้งทีมและบอกให้รันตัวติดตั้งใหม่
- `pyproject.toml` / `uv.lock` / `.python-version` ใช้โดย skill กลุ่ม Kiwi TCMS ใน `skills/old/` — อย่าลบ
- **ตัวติดตั้งมี 2 ชุดต้องแก้คู่กันเสมอ**: `install.sh` / `install-mcp.sh` (macOS/Linux) กับ
  `install.ps1` / `install-mcp.ps1` (Windows) — พฤติกรรม, ตัวเลือก CLI และข้อความต้องตรงกัน ·
  ฝั่ง `.sh` มี guard ตรวจ Git Bash/MSYS แล้ว `exec` ต่อให้ `.ps1` (เพราะ `ln -s` บน Git Bash = copy)
- ไฟล์ `.ps1` **ต้องเซฟเป็น UTF-8 with BOM** — PowerShell 5.1 อ่านไฟล์ไม่มี BOM เป็น ANSI
  ทำให้ข้อความไทยเพี้ยนจน parse ไม่ผ่าน (ตรวจได้ด้วย
  `[System.Management.Automation.Language.Parser]::ParseFile(...)`)
- **MCP server** อยู่ที่ `mcp/<name>/<name>-mcp.mjs` (bundle ไฟล์เดียว build มาแล้ว) ติดตั้งด้วย `install-mcp.sh`
  ซึ่งลงแบบ global ผ่าน `claude mcp add --scope user` (ไม่ symlink แบบ skill — ลงทะเบียนชี้มาที่ไฟล์ใน clone นี้
  `git pull` จึงอัปเดต bundle ให้เอง) · bundle เป็น artifact ที่ build จาก repo ต้นทาง — refresh ตามวิธีใน
  `mcp/<name>/README.md` และอัปเดต version stamp ทุกครั้งที่เปลี่ยน

## Convention การเขียน/แก้ skill

- `SKILL.md` ต้องมี frontmatter `name:` (ตรงกับชื่อโฟลเดอร์) และ `description:` ที่มี trigger phrases
- ไฟล์ประกอบอยู่ใน `references/` หรือ `assets/` ภายในโฟลเดอร์ skill
- ก่อนแก้ skill ที่มี `DEVELOPMENT.md` ให้อ่านไฟล์นั้นก่อนเสมอ — มันบันทึก design decisions
  และข้อห้ามที่ตัดสินใจไว้แล้ว — และอัพเดตมันเมื่อมีการตัดสินใจใหม่
- Prose ที่ผู้ใช้อ่านเป็นภาษาไทย ศัพท์ technical คงเป็นอังกฤษ

ตอบโต้กับผู้ใช้งานด้วยภาษาไทย
