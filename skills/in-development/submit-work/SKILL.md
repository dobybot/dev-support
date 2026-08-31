---
name: submit-work
version: 1.1.0
description: เปิด PR + อัปเดต Artemis เมื่อโค้ดใน dobybot-monorepo พร้อม. อ่าน track จากชื่อ branch (`{TICKET}--{fast-track|normal-track}--{slug}`) แล้วทำตาม flow ของ track — fast-track PR เข้า main + side-merge uat, normal-track PR เข้า uat. Use when opening a PR for a finished ticket, submitting work, or shipping a DBT branch.
---

# Submit Work (monorepo)

dobybot เป็น **monorepo เดียว** — 1 ticket = 1 branch = **1 PR** (ไม่มี loop หลาย repo,
ไม่มี base `main-v2`/`uat-v2` ของ dobysync อีกแล้ว) skill รันจากใน worktree ของ ticket

## Inputs
- **Branch** — ตรวจอัตโนมัติจาก `git branch --show-current`
- รับเฉพาะรูปแบบ **`{TICKET}--{track}--{slug}`** (double-dash) เช่น `ART-417--fast-track--vrich-report`
  - ถ้า parse ไม่ออก (เช่น `feat/...` หรือชื่อมั่ว) — **หยุดแล้วถาม user** ว่า ticket key และ track
    คืออะไร อย่าเดา
  - `{TICKET}` เป็น **Artemis key** ซึ่งหน้าตาเหมือน Jira key เดิม (`{PROJECT}-{number}`) —
    parser ตัดที่ `--` เฉย ๆ **ห้ามใส่ regex ที่ล็อก prefix ไว้กับ `DBT`/`DBB`** branch เก่าที่ยัง
    ค้างเป็น `DBT-###--...` จึง parse ได้เหมือนเดิม (แต่ ticket นั้นอยู่ที่ Jira ไม่ใช่ Artemis —
    ดู "branch เก่าที่เป็น ticket Jira" ข้างล่าง)
  - `{TICKET}` = `none` → งานที่ไม่ผูก ticket **ข้ามงานฝั่ง Artemis ทั้งหมด** (ไม่อ่าน ไม่ติด label
    ไม่เปลี่ยน status) ทำแค่ commit → push → เปิด PR ตาม track โดย PR title ใช้คำอธิบายงานจาก user

## Track → flow

| Track | Base (PR เข้า) | side-merge (เทสต์) | label | Artemis status (คอลัมน์) |
|-------|----------------|---------------------|-------|--------------------------|
| **fast-track** | `main` | `uat` | `ENV:uat`, `TEST:testing` | `Testing` |
| **normal-track** | `uat` | — (ไม่ merge) | `ENV:uat`, `TEST:review` | `In Review` |

> **status = ชื่อคอลัมน์บนบอร์ด** (Artemis ใช้คอลัมน์เป็นสถานะ ไม่มี workflow transition แยก
> เหมือน Jira) ลำดับคอลัมน์ default: Triage / To Do / In Progress / In Review / **Testing** / Done
> ชื่อต้องตรงเป๊ะรวมช่องว่างและตัวพิมพ์ ถ้า `update_ticket` ตอบ error เรื่อง status มันจะแนบ
> **ชื่อคอลัมน์ที่มีจริง** มาให้ — ใช้ชื่อจากใน error นั้น อย่าเดาเอง (บอร์ดของแต่ละ project
> ปรับคอลัมน์เองได้)

## Pre-flight (ทำก่อนทุกครั้ง)
1. **Parse branch** — split ด้วย `--`: ส่วนแรก = `{TICKET}` (เช่น `ART-417`), ส่วนที่สอง = track
   (`fast-track`/`normal-track`) parse ไม่ออก → ถาม user (ดู Inputs)
2. **อ่าน ticket** — `get_ticket { key: "{TICKET}", includeComments: false }` ผ่าน MCP `artemis`
   เอา **title** ไปทำ PR title และเอา **url** (ฟิลด์ `${SITE_URL}/browse/{key}`) ไปใส่ใน PR body
   - ticket key เอามาจากชื่อ branch เท่านั้น — **ไม่ต้อง search หา ticket**
   - ถ้าผลลัพธ์ **ไม่มี url** แปลว่า MCP server ยังไม่ได้ตั้ง `ARTEMIS_SITE_URL` → PR body ใส่แค่
     ticket key แล้ว**แจ้ง user ในสรุปตอนท้าย** ว่าลิงก์หายเพราะ config นี้ **อย่าเดา hostname เอง**
   - NOT_FOUND → หยุด ถาม user (branch อาจตั้งชื่อผิด)
3. **Commit** — `git add . && git commit -m "{TICKET} {summary}"` ให้ครบ
4. **Push** — `git push -u origin {branch}`

## Workflow ตาม track

> remote คือ `dobybot/dobybot-monorepo` `gh` detect เองจาก worktree PR title ใช้ summary ของ
> Artemis ticket นำหน้าด้วย ticket ID เช่น `DBT-417: เพิ่มรายงาน vrich` body ใส่ลิงก์ Artemis ticket
> (`https://artemis.dobybot.com/browse/{TICKET}`)

> **Artemis MCP:** อัปเดต ticket ผ่าน `artemis` MCP server (ไม่ใช่ Jira แล้ว) — ติด label ด้วย
> `mcp__artemis__add_label` (key = `{TICKET}`, label = ชื่อ label), ย้าย status ด้วย
> `mcp__artemis__update_ticket` (`status` = ชื่อคอลัมน์จริง), และเพิ่มคอมเมนต์ส่งต่อด้วย
> `mcp__artemis__add_comment` (key = `{TICKET}`, body = ข้อความล้วน — แท็ก HTML จะถูก escape)
> **เรียก `mcp__artemis__get_board` ก่อนเปลี่ยน status เสมอ** เพราะทีมแก้ชื่อคอลัมน์เองได้ ณ ตอนเขียน
> คอลัมน์ของ DBT คือ Triage · To Do · In Progress · In Review · Test Failed · **Testing** · Ready · Done
> label `ENV:uat` / `TEST:testing` / `TEST:review` มีอยู่แล้วในโปรเจกต์ ถ้า `add_label` error ว่าไม่มี
> label (เช่นในโปรเจกต์อื่น) ให้ `mcp__artemis__create_label` ก่อน

> **ผูก PR เข้า ticket (ทุก track):** ทันทีที่เปิด PR สำเร็จ ต้องเรียก
> `mcp__artemis__link_pull_request` เสมอ — **การแปะลิงก์ PR ในคอมเมนต์อย่างเดียวไม่พอ**
> เพราะแถบ PR ข้างหน้างานอ่านจากข้อมูลที่ผูกเท่านั้น (ไม่ parse คอมเมนต์) ขั้นตอน:
> 1. อ่านค่าจริงจาก GitHub **ห้ามเดา**:
>    `gh pr view {url} --json title,state,author,baseRefName,createdAt`
> 2. เรียก `link_pull_request` ด้วย `key={TICKET}`, `url`, `title`, `status=open`,
>    `openedBy` (= `author.login`), `targetBranch` (= `baseRefName`), `openedAt` (= `createdAt`)
>
> - tool เป็น upsert ด้วยคีย์ (งาน, url) — เรียกซ้ำ url เดิมคืออัปเดต ไม่สร้างซ้ำ ตอน PR ถูก
>   merge ภายหลังจึงเรียกซ้ำด้วยแค่ `status=merged` + `mergedBy` + `mergedAt` ได้
> - PR เดียวเกี่ยวหลาย ticket → เรียกซ้ำกับแต่ละ key · ผูกเข้า subtask ด้วย key ของ subtask ได้
> - ถ้า tool `link_pull_request` **ไม่มีให้เรียก** แปลว่า bundle MCP ของเครื่องนั้นเก่า —
>   แจ้ง user ให้ `git pull` ที่ clone `dev-support` แล้ว restart agent (bundle 23 tools ขึ้นไป)

> **คอมเมนต์ส่งต่อ tester (ทุก track):** หลังเปิด PR แล้วเพิ่มคอมเมนต์ลง ticket ด้วย
> `mcp__artemis__add_comment` เป็น **สรุปย่อสั้น ๆ ภาษาไทย** ให้ tester รับงานต่อได้ทันที — เนื้อหา:
> - **ทำอะไร** — 1–3 บรรทัดว่าแก้/เพิ่มอะไร (product-level ไม่ใช่ diff)
> - **เทสต์ยังไง / ที่ไหน** — จุดที่ควรตรวจ + env (fast-track เทสต์บน UAT)
> - **ลิงก์ PR** — `https://github.com/dobybot/dobybot-monorepo/pull/{N}` สำหรับดูรายละเอียดเต็ม
>
> สั้นกระชับ — รายละเอียดเชิงลึกอยู่ใน PR body อยู่แล้ว คอมเมนต์แค่ช่วยให้ tester รู้ว่าจะจับอะไรต่อ

### fast-track
1. **เปิด PR → `main`**
2. **ผูก PR เข้า ticket** (`link_pull_request`) — ดูสเปกในบล็อก "ผูก PR เข้า ticket" ข้างบน
3. **side-merge เข้า `uat`** เพื่อให้เทสต์บน UAT:
   ```bash
   git checkout uat && git pull origin uat
   git merge {branch}
   git push origin uat
   git checkout {branch}
   ```
   conflict → ให้ user resolve เองก่อนไปต่อ
4. **ติด label Artemis** (`add_label`): `ENV:uat`, `TEST:testing`
5. **ย้าย status Artemis → `Testing`** (`update_ticket` status=`Testing`; `get_board` ยืนยันชื่อคอลัมน์ก่อน)
6. **เพิ่มคอมเมนต์ส่งต่อ tester** (`add_comment`) — สรุปย่อ + ลิงก์ PR (ดูสเปกในบล็อก "คอมเมนต์ส่งต่อ tester" ข้างบน)

### normal-track
1. **เปิด PR → `uat`** — **อย่า merge** (user จะ merge เองหลัง PR approve)
2. **ผูก PR เข้า ticket** (`link_pull_request`) — ดูสเปกในบล็อก "ผูก PR เข้า ticket" ข้างบน
3. **ติด label Artemis** (`add_label`): `ENV:uat`, `TEST:review`
4. **เพิ่มคอมเมนต์ส่งต่อ tester** (`add_comment`) — สรุปย่อ + ลิงก์ PR (ดูสเปกในบล็อก "คอมเมนต์ส่งต่อ tester" ข้างบน)

## Confirmation
ก่อนรันจริง สรุปสิ่งที่จะทำทั้งหมดแล้ว **ขอ confirm จาก user** ก่อนลงมือ

## Summary (หลังเสร็จ)
- ลิงก์ Artemis ticket (`https://artemis.dobybot.com/browse/{TICKET}`)
- ลิงก์ PR (+ target branch) และยืนยันว่า**ผูกเข้า ticket แล้ว** (`link_pull_request`)
- (fast-track) side-merge เข้า `uat` สำเร็จหรือไม่
- label / status ที่อัปเดต
- คอมเมนต์ส่งต่อ tester ที่เพิ่มลง ticket
- สถานะ (สำเร็จ / error)
