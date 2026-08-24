---
name: start-work
description: เริ่มงาน Artemis ticket ใน dobybot-monorepo อย่างเร็ว — อ่าน ticket, ตั้งชื่อ branch, แล้วเตรียมโค้ดให้พร้อมตาม track (fast-track จาก main, normal-track จาก uat) เลือกได้ว่าจะสร้าง branch ใน main checkout ตรง ๆ (no-worktree, default) หรือแยกเป็น git worktree พร้อมให้ `task dev` รันทั้ง stack แบบ container. ถ้าไม่ระบุ ticket ID = งานที่ไม่ผูก Artemis, branch เป็น none--{track}--{slug}. Use when starting an Artemis ticket, creating a ticket worktree, beginning dev work on a DBT issue, or starting non-ticket work.
---

# เริ่มงาน Artemis Issue (monorepo)

dobybot รวมเป็น **monorepo เดียว** แล้ว (`services/*`) ทั้ง stack รันด้วย `task dev` (container)
ไม่ใช่หลาย repo + VS Code F5 อีกต่อไป skill นี้จึงเหลือหน้าที่แคบ ๆ: เตรียมโค้ดของ monorepo ให้พร้อม
บน branch ใหม่ของ ticket แล้วหยุด — ปล่อยให้ user เป็นคนสั่ง `task dev` เอง

## Track (กำหนด base branch)

| Track | เมื่อไร | Base branch |
|-------|--------|-------------|
| **fast-track** | feature เล็ก **หรือ** bug fix | `main` |
| **normal-track** | feature ใหญ่ | `uat` |

Track เป็น **การตัดสินของ user ต่อ ticket** (ฟิลด์ type ใน Artemis เชื่อไม่ได้) heuristic: *ง่าย +
blast-radius ต่ำ → fast-track; ไม่งั้น → normal-track* **ถ้า user ไม่บอก ให้ถามในแชต อย่าเดา** —
base branch ขึ้นกับมันโดยตรง

## Worktree mode (แยกหรือไม่แยก checkout)

| Mode | ทำอะไร | เมื่อไร |
|------|--------|--------|
| **no-worktree** (default) | สร้าง branch ใหม่ใน main checkout แล้ว `checkout` เข้าไปเลย | ทำทีละ ticket อยากอยู่ที่เดิม ไม่อยากมีโฟลเดอร์ sibling เพิ่ม |
| **worktree** | สร้าง git worktree เป็น sibling แยกต่างหาก | อยากให้ main checkout (หรือ ticket อื่น) ไม่ถูกแตะ ทำงานหลาย ticket พร้อมกัน |
| **app-worktree** (ตรวจจับเอง) | แอป (Claude Code/Supacode UI/t3code) สร้าง worktree ให้แล้วก่อน prompt รัน — skill แค่ **rename branch** | user ติ๊กช่อง `worktree` ใน composer ก่อนเริ่ม session หรือเริ่ม session จาก t3code |

user เลือกได้โดยใส่คำว่า `worktree` (หรือ `no-worktree`) ต่อท้ายคำสั่ง **ถ้าไม่ระบุ ให้ใช้
no-worktree เป็น default** — ไม่ต้องถาม

> **⚠️ app-worktree มาก่อนเสมอ:** ถ้าแอปสร้าง worktree ให้ก่อน skill นี้รัน ชื่อ branch แอปตั้งเอง
> ตั้ง template ล่วงหน้าไม่ได้ (ตอนสร้างยังไม่รู้ ticket) → **วิธีเดียวที่จะได้ชื่อ
> `{TICKET}--{track}--{slug}` คือให้ skill rename branch ปัจจุบันทีหลัง** ไม่ใช่สร้าง worktree ซ้อน
> ดูขั้นตอน 3 (โหมด app-worktree) — เกิดได้ 2 ทาง:
> - **Claude Code/Supacode UI** (ติ๊กช่อง `worktree` ใน composer): worktree ที่
>   `$ROOT/.claude-worktrees/{สุ่ม}` บน branch `claude/{adjective-name}` (เช่น
>   `claude/pensive-blackburn-ea0689`)
> - **t3code**: worktree ที่ `~/.t3/worktrees/{repo}/t3code-{id}` บน branch `t3code/{id}` (เช่น
>   `t3code/13da894d`)

## Inputs (เก็บให้ครบก่อนลงมือ)

1. **Artemis Ticket ID** — เช่น `DBT-417` (มาจากคำสั่งที่เรียก skill) **ถ้าไม่ระบุ = งานที่ไม่ผูก Artemis**
   ใช้ `none` แทน ticket ID (ดู "งานที่ไม่ผูก Artemis" ข้างล่าง)
2. **Track** — `fast-track` หรือ `normal-track` (ดูข้างบน; ถ้าไม่ระบุให้ถาม)
3. **Worktree mode** — `no-worktree` (default) หรือ `worktree` (ดูข้างบน; ถ้าไม่ระบุใช้ default ไม่ต้องถาม)

### งานที่ไม่ผูก Artemis (ไม่มี ticket ID)
ถ้า user ไม่ให้ ticket ID ให้ถือว่าเป็นงานที่ไม่ผูก Artemis — **ไม่ต้องอ่าน Artemis** ใช้ `none` เป็น
ticket ID แทน branch จะกลายเป็น `none--{track}--{slug}` เช่น `none--fast-track--fix-typo`
เอา slug มาจากคำอธิบายงานที่ user บอก (kebab-case สั้น) โหมด worktree ให้ตั้งชื่อโฟลเดอร์จาก slug
แทน ticket (เพราะ `none` ซ้ำได้) — ดูขั้นตอนข้างล่าง

ไม่ต้องถาม workspace path / repo ที่จะแก้ / env ของ dobysync อีกแล้ว — repo เดียว, self-locate
จาก git, และ env ทุกตัว committed หรือ `task preflight` สร้างให้

> **Artemis MCP:** ticket อยู่ใน Artemis (ไม่ใช่ Jira แล้ว) เข้าผ่าน `artemis` MCP server —
> อ่าน ticket ด้วย `mcp__artemis__get_ticket` (บรรทัดแรกของผลลัพธ์คือ `{TICKET} — {summary}`)

## ขั้นตอน

### 1. หาตำแหน่ง main checkout (self-locate)
skill นี้อยู่ **ใน** monorepo จึงหา root ของ checkout ที่กำลังทำงานได้จาก git โดยตรง — ไม่ต้อง
persist path, ไม่ต้องถาม:
```bash
ROOT="$(git rev-parse --show-toplevel)"
```
โหมด **worktree** จะวาง worktree เป็น **sibling** ของ main checkout ที่
`$ROOT/../dobybot-worktree/{DIRNAME}` (`{DIRNAME}` = ticket ID ปกติ, หรือ slug ในงานที่ไม่ผูก
Artemis เพราะ `none` ซ้ำได้) ส่วนโหมด **no-worktree** ทำงานใน `$ROOT` เลย

**ตรวจก่อนว่าอยู่ใน app-worktree รึเปล่า** — ถ้า `$ROOT` อยู่ใต้ `.claude-worktrees/` (Claude
Code/Supacode) หรือ `.t3/worktrees/` (t3code) แปลว่าแอปสร้าง worktree ให้แล้ว ให้ข้ามไปใช้
**โหมด app-worktree** ในขั้นตอน 3 (ไม่ว่า user จะพิมพ์ `worktree` มาหรือไม่) และหา path ของ
main checkout ไว้ copy env:
```bash
MAIN="$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")"   # main checkout จริง
case "$ROOT" in
  */.claude-worktrees/*|*/.t3/worktrees/*) APP_WORKTREE=1 ;;   # แอปสร้าง worktree ให้แล้ว → โหมด app-worktree
  *) APP_WORKTREE=0 ;;
esac
```

### 2. อ่าน Artemis ticket + ตั้งชื่อ branch
**งานที่ผูก Artemis:** อ่าน ticket `{TICKET}` ด้วย `mcp__artemis__get_ticket` (key = `{TICKET}`)
เอา summary (บรรทัดแรกของผลลัพธ์ หลัง `{TICKET} — `) มาแปลเป็น **slug อังกฤษสั้น**
(kebab-case, ≤ ~60 ตัวอักษร) แล้วประกอบเป็น `{TICKET}--{track}--{slug}` (คั่นด้วย double-dash) เช่น
`DBT-417--fast-track--vrich-report`

**งานที่ไม่ผูก Artemis** (ไม่มี ticket ID): **ข้ามการอ่าน Artemis** เอา slug จากคำอธิบายงานที่ user บอก
แล้วประกอบเป็น `none--{track}--{slug}` เช่น `none--fast-track--fix-typo` โหมด worktree ใช้ slug
เป็นชื่อโฟลเดอร์ (`{DIRNAME}` = slug)

### 3. สร้าง branch จาก remote base ที่อัปเดตล่าสุด
ดึง base branch ของ track มาให้สดก่อนเสมอ:
```bash
git -C "$ROOT" fetch origin {base}
```

**โหมด no-worktree (default)** — สร้าง branch ใน main checkout แล้ว `checkout` เข้าไป **เช็ค working
tree ให้สะอาดก่อน** (ถ้ามีงานค้างจะถูกพาข้าม branch ไปด้วย — หยุดแล้วแจ้ง user ก่อน อย่า stash/discard เอง):
```bash
git -C "$ROOT" status --porcelain          # ต้องว่าง ถ้าไม่ว่าง → หยุด แจ้ง user
git -C "$ROOT" checkout -b {branch} "origin/{base}"
```
ถ้า branch มีอยู่แล้ว git จะ error — แจ้ง user ให้ลบของเก่าก่อน (`git -C "$ROOT" branch -D {branch}`)

**โหมด worktree** — สร้าง worktree พร้อม branch ใหม่ในคำสั่งเดียว **ไม่แตะ main checkout**
(มันอยู่ branch ไหนก็ปล่อยไว้):
```bash
git -C "$ROOT" worktree add -b {branch} "$ROOT/../dobybot-worktree/{DIRNAME}" "origin/{base}"
```
ถ้า worktree หรือ branch มีอยู่แล้ว git จะ error — แจ้ง user ให้ลบของเก่าก่อน
(`git -C "$ROOT" worktree remove ...` / `git -C "$ROOT" branch -D {branch}`) อย่าเดาหรือเขียนทับ

**โหมด app-worktree (`APP_WORKTREE=1`)** — แอปสร้าง worktree + branch สุ่มให้แล้ว **อย่าสร้าง
worktree ซ้อน** แค่ **rename branch ปัจจุบัน** เป็นชื่อที่ต้องการ แล้วรีเซ็ตให้อยู่บน base ล่าสุด
(app-worktree มักถูก fork จาก branch ที่กำลัง checkout อยู่ตอนติ๊ก ซึ่งอาจไม่ตรง base ของ track —
เช่น normal-track ต้องอยู่บน `uat` ไม่ใช่ `main`). **เช็ค working tree ให้สะอาดก่อน** ถ้าไม่ว่าง →
หยุด แจ้ง user (อาจมีงานที่ยังไม่ได้ commit):
```bash
git -C "$ROOT" status --porcelain           # ต้องว่าง ถ้าไม่ว่าง → หยุด แจ้ง user
git -C "$ROOT" branch -m {branch}            # rename claude/{สุ่ม} หรือ t3code/{id} → {TICKET}--{track}--{slug}
git -C "$ROOT" reset --hard "origin/{base}"  # ย้ายมาอยู่บน base ล่าสุดของ track (env gitignore ไม่โดนแตะ)
```
ถ้าชื่อ `{branch}` มีอยู่แล้ว `git branch -m` จะ error — แจ้ง user ให้ลบของเก่าก่อน อย่าเขียนทับ

### 4. Copy ไฟล์ env ที่ gitignore เข้า worktree (**โหมด worktree + app-worktree**)
**โหมด no-worktree ข้ามขั้นนี้** — env อยู่ใน `$ROOT` ครบอยู่แล้ว

worktree ใหม่ (ทั้งที่ skill สร้างและที่แอปสร้าง) จะขาดไฟล์ที่ commit ไม่ได้ 2 ตัว — **copy**
(ไม่ symlink) จาก main checkout เพื่อให้แต่ละ worktree แก้ env ของตัวเองได้โดยไม่กระทบอันอื่น
(`SRC` = main checkout, `DST` = worktree ปลายทาง):
```bash
# โหมด worktree: SRC=$ROOT (main checkout), DST=worktree sibling ที่เพิ่งสร้าง
# โหมด app-worktree: SRC=$MAIN (main checkout จริง), DST=$ROOT (แอปพาเรามาอยู่ใน worktree แล้ว)
SRC="$ROOT"; DST="$ROOT/../dobybot-worktree/{DIRNAME}"        # โหมด worktree
# ถ้า APP_WORKTREE=1 ใช้แทน: SRC="$MAIN"; DST="$ROOT"
cp "$SRC/.env"                        "$DST/.env"
cp "$SRC/infra/env/dobybot.secret.env" "$DST/infra/env/dobybot.secret.env"
```
ที่เหลือ (`infra/env/*.dev.env`) committed มากับ checkout อยู่แล้ว ส่วน `services/*/.env`
`task preflight` (ที่ `task dev` เรียก) สร้างให้เอง — ไม่ต้องแตะ

> ถ้า `.env` หรือ `infra/env/dobybot.secret.env` ไม่มีใน main checkout แปลว่า main
> checkout เองยังไม่ถูกตั้งค่า — หยุดแล้วแจ้ง user ให้ตั้งค่า main checkout ตาม `README.md` ก่อน

### 5. หยุด แล้วรายงาน (อย่า auto-run `task dev`)
**ไม่** รัน `task dev` ให้ — เพราะ stack รันได้ทีละอัน (compose project name `dobybot` + port
`3000/8000/8001/5432` fix) การบูตจาก worktree ใหม่จะไป recreate container ทับ stack ของ ticket
อื่นที่ user อาจกำลังเทสต์อยู่ ปล่อยให้ user เป็นคนกดเอง

รายงานสรุป (`<dir>` = path ของ worktree ในโหมด worktree, หรือ `$ROOT` ในโหมด no-worktree /
app-worktree — เพราะ app-worktree เราอยู่ใน worktree ที่แอปสร้างอยู่แล้ว):
- branch, base branch, mode (worktree / no-worktree), และ `<dir>`
- คำสั่งให้ user รันต่อ:
  ```bash
  cd <dir> && task dev                # บูตทั้ง stack (PG18 + 2 backend + 3 frontend + nginx) ที่ :3000
  code <dir>                          # ถ้าจะเปิดใน editor (โหมด no-worktree อยู่ใน $ROOT เดิมอยู่แล้ว)
  ```
- reminder workflow ตาม track:
  - **fast-track:** 1) โค้ดบน branch นี้ · 2) `/submit-work` → PR เข้า `main` + side-merge `uat`
    ให้เทสต์ · 3) ผ่าน + approve → merge `main` เพื่อ deploy
  - **normal-track:** 1) โค้ดบน branch นี้ · 2) `/submit-work` → PR เข้า `uat` · 3) approve →
    merge เข้า `uat` · 4) เทสต์บน UAT · 5) พร้อม release → merge `uat` → `main`
