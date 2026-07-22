# CLAUDE.md

Repo นี้คือศูนย์รวม **Claude Code skills ของทีม dobybot** — ดูภาพรวมและวิธีติดตั้งใน [README.md](README.md)

## โครงสร้างที่ต้องรักษา

- Skill อยู่ที่ `skills/<group>/<ชื่อ-skill>/SKILL.md` — group ปัจจุบัน:
  `in-development` (กำลังพัฒนา/เก็บ feedback) และ `old` (รุ่นก่อนจัดระเบียบ ยังใช้ได้)
- `install.sh` scan โครงสร้างนี้อัตโนมัติ — เพิ่ม group ใหม่ได้โดยไม่ต้องแก้ script
- Skill ถูกติดตั้งเป็น symlink จาก `~/.claude/skills/` ชี้เข้า repo —
  **การย้าย/เปลี่ยนชื่อโฟลเดอร์ skill ทำให้ symlink ของทั้งทีมขาด** ให้แจ้งทีมและบอกให้รัน `./install.sh` ใหม่
- `pyproject.toml` / `uv.lock` / `.python-version` ใช้โดย skill กลุ่ม Kiwi TCMS ใน `skills/old/` — อย่าลบ
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
