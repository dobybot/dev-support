# dev-support — Claude Code Skills ของทีม dobybot

Repo กลางสำหรับเก็บ **Claude Code skills** ที่ทีมใช้ร่วมกัน ติดตั้งผ่าน `install.sh`
แล้วเลือกเฉพาะ skill ที่ต้องการใช้

## โครงสร้าง

```
dev-support/
├── install.sh              # ตัวติดตั้ง — รันแล้วเลือก skill ที่ต้องการ
├── skills/
│   ├── in-development/     # skill ที่กำลังพัฒนา/ทดลองใช้ (เก็บ feedback อยู่)
│   │   └── learn-diff/
│   └── old/                # skill รุ่นก่อนจัดระเบียบ repo — ยังติดตั้งใช้ได้
│       ├── better-review/
│       ├── generate-test-cases/
│       └── ...
├── pyproject.toml          # Python env สำหรับ skill กลุ่ม Kiwi TCMS (อย่าลบ)
└── rules/                  # (สำรองไว้สำหรับ rules ของทีมในอนาคต)
```

## ติดตั้ง skill

```bash
git clone git@github.com:dobybot/dev-support.git
cd dev-support
./install.sh
```

จะได้เมนูให้เลือก:

```
dev-support skills — เลือก skill ที่จะติดตั้ง/อัพเดต

   1) learn-diff                     (in-development)   [not installed]
   2) better-review                  (old)              [not installed]
   ...
เลือกหมายเลข (คั่นด้วย space เช่น "1 3"), a = ทั้งหมด, q = ยกเลิก:
```

พิมพ์หมายเลขที่ต้องการ (เช่น `1 3`) แล้ว **restart Claude Code** หนึ่งครั้ง skill จะพร้อมใช้

โหมดไม่ต้องตอบคำถาม (สำหรับ script/onboarding):

```bash
./install.sh --all              # ติดตั้งทุก skill
./install.sh learn-diff         # ติดตั้งเฉพาะชื่อที่ระบุ
```

### การอัพเดต

skill ถูกติดตั้งเป็น **symlink** (ทางลัดชี้กลับมาที่ clone นี้) ดังนั้น:

```bash
git pull
```

เท่านี้ skill ที่ติดตั้งไว้อัพเดตเองทันที ไม่ต้องรัน `install.sh` ซ้ำ —
รันซ้ำเฉพาะเมื่อต้องการ **เพิ่ม skill ใหม่** หรือมี skill **ย้ายโฟลเดอร์** ใน repo

> ⚠️ อย่าลบหรือย้ายโฟลเดอร์ clone นี้ — symlink จะขาด ถ้าจำเป็นต้องย้าย ให้รัน
> `./install.sh` ใหม่หลังย้าย

### ถอนการติดตั้ง

```bash
rm ~/.claude/skills/<ชื่อ-skill>
```

(ลบได้อย่างปลอดภัย — เป็นแค่ symlink ตัว skill จริงอยู่ใน repo)

### อัพเกรดจากระบบเก่า (auto-sync)

เดิม repo นี้ใช้ SessionStart hook sync ทุก skill อัตโนมัติ (`.agents/sync-skills.sh`)
— ระบบนั้นถูกแทนที่แล้ว แค่ `git pull` แล้วรัน `./install.sh` หนึ่งครั้ง:
ตัวติดตั้งจะถอด hook เก่าออกจาก `~/.claude/settings.json` ให้เอง (มี backup)
แล้วให้เลือก skill ที่ต้องการใช้ต่อ

## ข้อกำหนดเพิ่มเติมบาง skill

- **skill กลุ่ม Kiwi TCMS** (`generate-test-cases`, `get-kiwi-test-cases`,
  `gen-cypress-test`, `generate-automated-test`) รันสคริปต์ Python ผ่าน
  [uv](https://docs.astral.sh/uv/) จาก root ของ repo นี้ — ติดตั้ง uv แล้วรัน
  `uv sync` หนึ่งครั้ง และต้องมีไฟล์ `.env` ใส่ credential ของ Kiwi (ถามทีม QA)
- `install.sh` ใช้ `jq` เฉพาะตอนถอด hook เก่า — ถ้ายังไม่มี: `brew install jq`

## เขียน skill ใหม่ให้ทีม

1. สร้างโฟลเดอร์ `skills/in-development/<ชื่อ-skill>/` (ชื่อเป็น kebab-case)
2. เขียน `SKILL.md` มี frontmatter `name:` และ `description:` (ใส่ trigger phrases
   ใน description ด้วย เพื่อให้ Claude เรียกใช้ได้ถูกจังหวะ)
3. ไฟล์ประกอบวางใน `references/` หรือ `assets/` ภายในโฟลเดอร์ skill
4. แนะนำให้มี `DEVELOPMENT.md` บันทึก design decisions และแผนพัฒนา เพื่อให้คน/agent
   ที่มาพัฒนาต่อมี context (ดูตัวอย่างที่ `skills/in-development/learn-diff/`)
5. เปิด PR — เมื่อ skill นิ่งแล้วค่อยพิจารณาย้ายกลุ่ม

## Feedback

Skill ในกลุ่ม `in-development` เป็นส่วนหนึ่งของ workflow improvement program —
ให้ feedback ได้ที่บอร์ด Artemis: https://artemis.dobybot.com/projects/DW
