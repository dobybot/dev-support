---
name: learn-diff
description: "Help the user LEARN a code change in a pull request made by an AI agent — understanding the SYSTEM and what it changes at the product level (PM view) FIRST, then engineer-depth only as far as verifying/maintaining needs. Reconciles intent (requested-vs-done-vs-unrequested) and generates a top-down explanation the user reads in a local viewer app (purpose → whole-system picture → how the parts relate → how to use it → then code depth per section: blackbox/greybox/whitebox), with mermaid flowcharts and AI-curated reading lists that open the real code at the PR's pinned commit. Checks understanding interactively and emits a verification checklist. PR-only — without a PR it stops and gives the command to open a draft one. Triggers: /learn-diff, 'อธิบาย diff', 'เรียนรู้ change นี้', 'explain this change', 'เกิดอะไรขึ้นใน PR นี้', 'เกิดอะไรขึ้นใน branch นี้', 'ช่วยให้เข้าใจก่อน merge'."
argument-hint: "A PR number, PR URL, or a branch that has an open PR. Required — learn-diff explains a pull request; without one it stops and tells you how to open a draft PR."
---

# /learn-diff — เรียนรู้ให้เข้าใจ *ระบบ* ก่อน แล้วค่อย verify

> Maintainer note: before modifying this skill, read [DEVELOPMENT.md](DEVELOPMENT.md) —
> it records the design decisions, rejected ideas, field feedback, and the v3 history.

**Core principle:** learn-diff builds understanding of the **system and the change** —
NOT a line-by-line account of how the code works. Understanding is a prerequisite for
verification, but the understanding that matters is *product-level first*: what capability
this change adds, why it exists, what it now makes possible, how someone actually uses it,
and where the risk and scope live.

**Lead with the PM view, then the engineer view.** Start at the product/system altitude —
a PM could follow it — and descend into code mechanics only as far as verifying or
maintaining this change actually requires. Not every part of a diff deserves the same
depth, and most parts never need the deepest, code-change depth at all. Explaining
everything at engineer depth wastes the user's time and trains them to skip the
explanation entirely.

**Top-down, always.** Open at the big picture and descend: purpose → whole-system picture
→ how the parts relate (trace ONE real request/flow end-to-end) → then details. Never drop
the reader into the middle (a box map or code deep-dive before they know what the system
even does).

**The output is a *run* read in the viewer app, not a file the agent styles.** You write
markdown + JSON into the repo; a local React app renders it, lays out the flowcharts, and
reads the real code from the PR's pinned commit on demand. **You never write HTML, CSS, or
JS, and you never paste real file contents into the content** — see Step 5.

**Sibling skill:** `better-review` is an *orientation map* for picking a ticket up cold
(no verdict, no comprehension checks). This skill goes further: it explains the system
top-down, reconciles the diff against the original intent, and actively verifies the
user's understanding. Reach for `better-review` to get oriented; reach for this one when
the user must genuinely understand and sign off on a change.

**Output language:** ภาษาไทย คงศัพท์ technical เป็นภาษาอังกฤษ และอธิบายความหมายภาษาไทย
เมื่อใช้ศัพท์นั้นครั้งแรก · **TL;DR และบทเปิดต้องอ่านลอย ๆ แล้วเข้าใจเลย** — ห้ามยัดศัพท์
technical หลายตัวที่ยังไม่นิยามลงในประโยคเดียว.

**Feedback board:** https://artemis.dobybot.com/projects/DW — remind the user at close-out.

---

## Step 0 — Independence check

This skill must run with fresh eyes. Do NOT rely on memory of having written this code
yourself in this conversation. If you (this session) authored the diff, say so, and base
the explanation ONLY on what the diff + repo actually show — not on what you intended to
do. The whole point is to catch gaps between intent and reality.

## Step 1 — Gather inputs

### 1a. The scope — **a PR, and nothing else**

learn-diff explains a **pull request**, pinned to its head commit. Branch-vs-merge-base and
working-tree scopes were removed in v3 on purpose (SPEC-v3 → Scope resolution): every line
number in the output must still be true tomorrow, and the reader must be able to open the
same snapshot next month.

```bash
gh pr view <PR> --json number,title,url,body,headRefName,headRefOid,baseRefName,isDraft
git fetch origin pull/<N>/head            # หัว PR ต้องมีในเครื่อง ไม่งั้น viewer อ่านโค้ดไม่ได้
git fetch origin <baseRefName>
git merge-base origin/<baseRefName> <headRefOid>     # = baseCommit
git diff <baseCommit>..<headRefOid>                  # diff ที่จะอธิบาย
```

Pin two shas for the rest of the run: `commit` = `headRefOid`, `baseCommit` = the
merge-base. Read the diff at those two shas — **never from the working tree**, even when the
branch happens to be checked out.

**ไม่มี PR = หยุดตรงนี้** (user story 47). อย่าเดา อย่าถอยไปใช้ branch/working tree
ให้ตอบตามนี้แล้วรอคำตอบผู้ใช้:

> learn-diff อธิบายจาก **PR** อย่างเดียว เพราะเลขบรรทัดทุกอันในหน้าอ่านถูก pin ไว้ที่ commit
> ของ PR — ของที่ยังไม่ commit จะเลื่อนใต้เท้าผู้อ่าน
>
> เปิด draft PR ก่อน (ไม่ต้อง merge ไม่ต้องให้ใครรีวิว):
>
> ```bash
> gh pr create --draft --fill
> ```
>
> แล้วสั่ง `/learn-diff <เลข PR>` อีกครั้ง
>
> ถ้ายังไม่อยากเปิด PR ตอนนี้ บอกได้ — **สรุปให้ในแชทแทน** (ได้ intent reconciliation +
> ภาพรวมระบบ แต่ไม่มีหน้าอ่าน ไม่มีไดอะแกรมที่กดได้ และไม่มี reading list)

ถ้าผู้ใช้ตอบว่าเอาแบบสรุปในแชท: ตอนนั้นค่อยอ่าน diff จากของที่มี (branch เทียบ merge-base
หรือ working tree) แล้วทำ Step 2–4 ตอบในแชท **จบตรงนั้น** — ไม่สร้าง run ไม่เปิด server
ไม่มีอะไรถูก pin ไว้ จึงห้ามอ้างเลขบรรทัดในคำอธิบายแบบนี้

### 1b. The intent

The original task given to the work agent: the user's prompt, the PR description, a linked
issue/spec, or an Artemis ticket. If you cannot find any intent source, ASK the user for it
before proceeding — reconciliation (Step 2) is impossible without it, and skipping it
silently defeats the skill.

## Step 2 — Intent reconciliation

Compare intent against the actual diff and produce three lists:

- ✅ **ขอ + ทำแล้ว** — requested and present in the diff
- ⚠️ **ขอ แต่ไม่ได้ทำ** — requested but silently missing (no red line in a diff shows
  what's absent; derive this by walking the intent item-by-item)
- 🚨 **ไม่ได้ขอ แต่ทำ** — unrequested changes: schema edits, deleted validation,
  "improved" configs, drive-by refactors. Flag every one with a one-line risk note.
  This category is where AI-generated diffs break things.

These become `reconciliation[]` in `run.json` (`status: done | missing | unrequested`) and
appear near the top of the index page — right after the system/PM view (Step 3), before any
engineer-lens code section.

## Step 3 — Lead with the system (PM view)

**This is the heart of the skill and it comes first in the output.** Before any box triage
or code, establish the product-level understanding — the things a PM would need to sign
off, stated in the product's own vocabulary, not the code's. Cover, in this order:

1. **What capability the change adds, and why** — in terms of what the product/team/users
   can now do that they couldn't before. Not "adds `tools.ts` with 21 handlers" but
   "lets the AI read and update tasks in Artemis directly from chat."
2. **The whole-system picture** — one mermaid flowchart showing where this change sits
   relative to the rest of the system, and what it talks to. Draw the *existing* system
   around it and paint only the touched boxes `changed`.
3. **How the parts relate** — trace ONE real request/flow end-to-end, naming which
   file/module hands off to which. This is what turns a pile of files into a system.
4. **How to use / run / try it** — the concrete steps to exercise the capability: build,
   configure, invoke, smoke-test. "How do I actually use this?" is part of understanding a
   system, and a code-only explanation always omits it. Ground every step in the real repo
   (actual commands, paths, config files); run the safe ones (build, boot, smoke-test) and
   show the output as proof. Never enter the user's credentials/tokens yourself.
5. **Scope, risk, and what's deferred — at the product level** — what's intentionally out
   of scope, the product-level tradeoffs, and the single riskiest thing about shipping this.

A PM reading only the index page should understand what the change is, whether it does what
was asked, and how to try it — without reading one line of code.

## Step 4 — Triage into boxes (the engineer lens)

Everything from here down is the *engineer lens*: the depth needed by whoever will verify
or maintain the change. It is secondary to Step 3 and is clearly marked as such in the
output (`::divider[จากตรงนี้ = มุมมองวิศวกร]`). Do not lead with it.

Split the diff into logical sections by **feature/dataflow, not by file**. Assign each
section a box, with a one-line justification the user can see and override:

| Box | Depth owed to the user | Typical content |
|---|---|---|
| ⬛ blackbox | ไม่ต้องอ่านโค้ดสักบรรทัด: รู้แค่มันทำอะไร, input/output, วิธีทดสอบ/ใช้งาน | boilerplate, generated files, styling, copy changes |
| 🔲 greybox | **PM / collaborative level**: core idea, dataflow, ของอยู่ตรงไหน — พอที่จะให้ feedback ได้ | feature code, non-critical infra, easily reversible changes |
| ⬜ whitebox | **senior-engineer / code-change level**: เข้าใจถึงขั้นแก้เองได้ + เหตุผลของ design | critical infra, core business logic, changes that shape future work |

Most sections should land at blackbox/greybox. Reserve whitebox for what genuinely needs
code-change depth — do not default the whole diff to whitebox.

**Hard rules — always whitebox, regardless of your judgment:** authentication/authorization,
money/billing, schema or data migrations, data deletion, security-sensitive code (secrets,
crypto, permissions, allowlists), hard-to-reverse operations (external side effects,
published API contracts), CI/CD and deploy config.

The triage itself is a claim the user must be able to audit: it goes into `boxMap[]` in
`run.json` with its justifications, and any override the user gives in chat is honored
(rewrite the affected section file at the new depth — the reader sees it update live).

## Step 5 — Generate the run

Read [references/content-format.md](references/content-format.md) (file layout, `run.json`
schema, directives) and [references/diagram-mermaid.md](references/diagram-mermaid.md)
(the mermaid subset) before writing anything.

### 5a. Start the viewer, print the URL

```bash
node ~/.claude/skills/learn-diff/viewer/scripts/serve.mjs --json
```

`viewer/` อยู่ในโฟลเดอร์เดียวกับ SKILL.md ไฟล์นี้ — path ข้างบนคือ symlink ที่ตัวติดตั้งวางไว้
(Windows = directory junction; ถ้า shell ไม่ขยาย `~` ให้ ใช้ `$HOME` / `$env:USERPROFILE` แทน)
ถ้า path นั้นไม่มีจริง ให้ใช้ path ของโฟลเดอร์ skill ที่กำลังอ่านอยู่นี้ตรง ๆ

ตอบกลับเป็น JSON บรรทัดเดียว — เอา `url` กับ `startCommand` มาบอกผู้ใช้ (`status` เป็น
`reused` แปลว่ามีตัวรันอยู่แล้ว ซึ่งคือพฤติกรรมที่ต้องการ ไม่ใช่ error) · `status: "error"`
= อ่าน `message` แล้วบอกผู้ใช้ตรง ๆ **ห้ามถอยไปเขียน HTML แทน** — v3 ไม่มีทางออกอื่น

The server binds `127.0.0.1` only and shuts itself down after ~4 hours idle, so always show
the manual start command alongside the URL: the reader will come back to this run later.

### 5b. Write `run.json` first, register, then hand over the URL

Output directory: `<repo>/.learn-diff/pr-<N>-<slug>/` — และเพิ่ม `.learn-diff/` ลง
`.git/info/exclude` ของ repo นั้น (**ห้ามแตะ `.gitignore` ที่ track อยู่**)

1. เขียน `run.json` ให้**ครบทั้งไฟล์** — ประกาศ **ทุก** section ตั้งแต่ต้น พร้อม
   `commit`, `baseCommit`, `pr`, `reconciliation[]`, `boxMap[]`, `readingLists[]`, `nodeMap`
2. ลงทะเบียน run:

   ```bash
   node ~/.claude/skills/learn-diff/viewer/scripts/register-run.mjs \
     --repo <repo root> --content <repo root>/.learn-diff/pr-<N>-<slug> \
     --commit <headRefOid> --base <merge-base> \
     --pr <N> --title "<ชื่อ run ภาษาไทย>" --url <PR url>
   ```

3. **บอก URL ให้ผู้ใช้เปิดอ่านทันที** (`<url>/r/<run id>`) แล้วค่อยเขียนหน้าต่อ — เมนูขึ้นครบ
   ตั้งแต่ตอนนี้ หน้าที่ยังไม่เขียนขึ้นว่า "รอเขียน" ไม่ใช่หายไปเฉย ๆ
4. เขียนหน้าตามลำดับใน `sections[]`: `index.md` → section pages → `99-verify.md`
   **หนึ่งหน้า = เขียนไฟล์ทีเดียวจบ** อย่าทยอย append ทีละย่อหน้า (ผู้อ่านเห็นเนื้อหางอกทีละท่อน)
   viewer ส่งของใหม่เข้าหน้าที่เปิดค้างไว้เองผ่าน SSE — ผู้อ่าน**ไม่ต้อง refresh**
5. แก้ `run.json` ระหว่างทางได้ (เพิ่ม section ที่เพิ่งตัดสินใจแยกออกมา) — เมนูอัปเดตเอง

### 5c. What goes on which page

| หน้า | เนื้อหา |
|---|---|
| `index.md` | **PM altitude ทั้งก้อน**: `:::tldr` → Step 3 ทั้ง 5 หัวข้อ (พร้อมไดอะแกรมภาพรวม) → `::reconciliation` → `::divider[จากตรงนี้ = มุมมองวิศวกร]` → `::box-map` |
| `NN-<slug>.md` | หนึ่ง section ต่อหนึ่งหน้า เรียงตาม dataflow (จุดเข้า → แกนของ change → ผลกระทบต่อเนื่อง) ไม่ใช่เรียงตามชื่อไฟล์ · blackbox ที่จบใน 3–4 บรรทัดไม่ต้องมีหน้าแยก ให้อยู่ในแถวของ box map |
| `99-verify.md` | คำถามทำนายผล (`::::question` + `:::answer` + `::verify[...]`) → `:::checklist` verification checklist → `:::note` ชวนให้ feedback |

Depth per box, inside a section page:

- **⬛ blackbox** — มันทำอะไร, input/output, ทดสอบ/ใช้งานยังไง (คำสั่ง/URL/ปุ่มที่กดจริง) ไม่มีโค้ด
- **🔲 greybox** — แก่นความคิด 2–3 ประโยค, ไดอะแกรม dataflow, ตัวอย่างเดินข้อมูลจริงหนึ่งชุด
  จาก input ถึง output, และ "ของอยู่ตรงไหน" (ไฟล์ไหนรับผิดชอบอะไร)
- **⬜ whitebox** — เดินทั้งเส้นตาม dataflow, เหตุผลของ design (**ระบุทางเลือกที่ไม่ได้เลือกและทำไม**),
  **invariants** — สิ่งที่โค้ดใหม่แอบสมมติเกี่ยวกับโค้ดเดิมที่ไม่ได้ถูกแก้, และผลต่องานในอนาคต

ทุก section ที่เป็น grey/whitebox ต้องมี `readingList` ของตัวเอง (ผู้อ่านกด "อ่านโค้ดของหัวข้อนี้")
— เลือก span ตามกฎใน 5d (ตอบ "กฎของระบบ" ไม่ใช่ "ฟังก์ชันที่ถูกเรียก")

**ช่องว่างที่เหลืออยู่ — บังคับทุกหน้า grey/whitebox:**

- ทุก section page ที่เป็น grey/whitebox ต้องมีหัวข้อ/ย่อหน้า "ช่องว่างที่เหลืออยู่"
  ที่ตอบอย่างน้อยหนึ่งข้อ: เคสไหน fail เงียบ (ไม่มี log/notify/metric)?
  อะไรไม่มี test ครอบ? logic ไหนซ้ำกันสองที่แล้วอาจ drift?
- หน้า whitebox ต้อง flag การเปลี่ยนแปลงที่ไม่ได้ขอ**ในหน้านั้นเอง**ด้วย `:::note{type="risk"}`
  — ตาราง reconciliation อยู่บน index ซึ่งคนที่เข้าจาก URL ของ section ไม่เห็น
- "ไม่มีช่องว่าง" เป็นคำตอบที่ยอมรับได้ แต่ต้อง**เขียนออกมาตรง ๆ ว่าตรวจแล้ว** ไม่ใช่ละไว้

**อย่าเปิดไฟล์ .md ด้วย `# <title>`** — viewer แสดง `sections[].title` เป็นหัวข้อของหน้าเองแล้ว
และจะกลืน h1 แรกที่ซ้ำกับ title ทิ้ง · เริ่มที่ prose หรือหัวข้อย่อย `##` เลย

### 5d. Rules that are not negotiable

- **ห้ามเขียน HTML / CSS / JS** และห้ามสั่งให้ viewer โหลด asset อะไรเพิ่ม — presentation
  เป็นของ viewer ทั้งหมด (นี่คือเหตุผลที่ v2 markup contract ถูกปลดระวาง)
- **ห้าม paste โค้ดจริงลง markdown** — reading list เก็บแค่**พิกัดกับเหตุผล**
  (`path` + `from`/`to` + `why`) แล้ว server อ่านไบต์จาก commit ที่ pin ไว้ให้เอง ·
  code fence ใน prose ใช้ได้เฉพาะของที่**ไม่มีใน commit นั้น**: โค้ดเดิมที่ถูกลบไปแล้ว,
  SQL/คำสั่งตัวอย่าง, pseudo-code · ห้าม paste ทั้งไฟล์ไม่ว่ากรณีใด
- **mermaid เขียนได้เฉพาะ subset ใน diagram-mermaid.md** — `flowchart` เท่านั้น,
  4 รูปทรง, `class A,B changed` (ห้าม `style`/`click`/`%%{init}%%`/`:::`) และ **ห้ามกำหนดสีเอง**
  หลุด subset = แถบแดงคาดหัวรูปให้ผู้อ่านเห็น
- **reading list ต้องมีช่วง `kind: "context"`** เมื่อเข้าใจ change ไม่ได้โดยไม่อ่านของเดิม —
  นี่คือของชิ้นเดียวที่ diff viewer ให้ไม่ได้ · เรียง span ตาม dataflow ไม่ใช่ตามชื่อไฟล์ ·
  กฎการเลือก span (จาก reader test, issue #22):
  - เลือกช่วง context ด้วยคำถาม **"โค้ดใหม่ต้องเคารพกฎอะไรของระบบ"** ไม่ใช่ "มันเรียกฟังก์ชันไหน"
    — ใส่ฟังก์ชันที่ถูกเรียกเฉพาะเมื่อ*พฤติกรรมของมัน*คือประเด็น
  - prose อ้าง setting/ฟังก์ชัน/ค่าคงที่ตัวไหนเป็นหลักฐาน ต้องมี span ที่**ครอบบรรทัดนั้นจริง** —
    เพิ่ม span สั้น ๆ อีกอันดีกว่าถ่างช่วงเดิมให้กว้าง
  - ตัวเลขที่ prose อ้าง (เช่นจำนวนเทสต์) ต้อง**นับได้จาก span ที่โชว์** ไม่งั้นตัดตัวเลขทิ้ง
- **Tests are first-class learning material.** A unit test is an executable input→output
  example: when the diff or repo has a test covering a grey/whitebox section, put it in the
  reading list and quote it instead of inventing a toy example, and (whitebox) walk through
  *why* the test is designed that way — inputs chosen, edge cases pinned, gaps not covered.
  Quote and explain tests that exist; do not generate new tests as an explanation device.
- Concepts already in the user's ledger: one-line reminder + pointer, not a re-explanation.

### 5e. Self-check before handing over — สองรอบ

**รอบ 1 — warnings ของ server:**

```bash
curl -s <url>/api/runs/<run id> | node -e \
  'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=JSON.parse(s);console.log(JSON.stringify(r.warnings??r,null,2))})'
```

(`<url>` = ค่าที่ `serve.mjs` ตอบมาใน 5a — ปกติคือ `http://127.0.0.1:5174`)

`warnings` ต้องว่าง **ก่อนบอกผู้ใช้ว่าเสร็จ** — ของพวกนี้คือ dead click กับพิกัดที่ resolve
ไม่ได้ ซึ่งเป็นผลลัพธ์ที่แย่ที่สุดของหน้านี้ (`reading_list_not_found`, `reading_list_unreferenced`,
`diagram_node_not_found`, `range_not_found`, …) · ความหมายของแต่ละ code อยู่ใน
content-format.md · แก้แล้วเขียนไฟล์ทับ — หน้าที่ผู้อ่านเปิดค้างอยู่อัปเดตเอง ·
**`warnings: []` แปลว่าพิกัด resolve ได้ ไม่ได้แปลว่าเนื้อหาถูก** — server มองไม่เห็น prose

**รอบ 2 — อ่านทวนทุกหน้า (บังคับ):** เปิดทุกไฟล์ .md ที่เขียนไป อ่านจากบนลงล่างเหมือนผู้อ่าน
(ไม่ต้องเปิดโค้ด) เช็ค 4 อย่าง:

1. ตัวเลขในหน้าเดียวกันตรงกันเอง (บอก "2 แถว" แล้วตารางมี 4 แถวไม่ได้)
2. หัวข้อตรงกับเนื้อหาใต้มัน
3. คำถามใน `99-verify.md` แต่ละข้อ — โจทย์กับเฉลยพูดถึงเรื่องเดียวกัน
4. อะไรที่ยกมาเป็นหลักฐานต้องมี span รองรับ (กฎเดียวกับ 5d / issue #22)

เจอแล้วแก้ทันทีก่อนบอกผู้ใช้ว่าเสร็จ — เช็คแค่ 4 ข้อนี้พอ ให้ค่าใช้จ่ายสเกลตามขนาด run

## Step 6 — Interactive loop (in chat)

After the run is readable, stay in the loop:

- Answer questions; rewrite a section file when the user overrides a box (the open page
  updates itself — do not tell the user to refresh).
- Check understanding with **open-ended questions** (these live in chat; the written ones
  live on `99-verify.md`). Start at the system/PM level (ask the user to explain what the
  change enables, or how a request flows) before drilling into code — mirror the run's own
  top-down order. Ask the user to explain a section back, point out a weakness of the
  design, or state why the design is this way and not another. Evaluate their answer
  honestly — if it reveals a misconception, correct it and offer to re-explain deeper.
- **Never use deliberately misleading questions.** Misinformation sticks even after
  correction (continued influence effect) and destroys trust in the explanation itself.
- **Tutorial mode (optional, whitebox sections only):** if the user asks, or a whitebox
  section is high-risk, offer a guided hands-on walkthrough — run the app, click through
  the flow, then break it on purpose (bad input, missing env, edge case) and observe the
  failure. Predict-then-verify beats read-then-nod.

## Step 7 — Close out

1. **Verification checklist:** it lives on `99-verify.md` inside `:::checklist` as a
   markdown block the user can paste into the PR's Verification section (ISO 29110 format
   where the project uses it): per blackbox section the concrete test steps; per
   grey/whitebox section the understanding the user confirmed. Mark anything the user did
   NOT confirm as `PD (Pending)` — never mark understanding the user didn't demonstrate.
   Rewrite the file as the user confirms things in chat.
2. **Update the concept ledger** (see below) with concepts the user confirmed they
   understand in this session.
3. **Repeat the URL and the manual start command** — the server shuts down when idle, and
   the run stays readable afterwards by starting it again.
4. **Invite feedback:** one line pointing to the feedback board (URL above) — ask which
   sections were too deep/too shallow and whether any box assignment was wrong.

## Scaling rules

Ceremony must scale with the diff, or users will stop invoking the skill on small changes:

- **Tiny (< ~50 changed lines):** no run, no server unless asked — a short system/PM summary
  (what it enables + how to try it) + the reconciliation table, directly in chat. No quiz.
- **Medium:** full run, prediction questions only for grey/whitebox sections (1–2 each).
- **Large (multi-feature):** full run with one page per section; questions scale with risk,
  not with size. Because pages appear as they land, a large run costs the reader nothing —
  they start on `index.md` while the rest is still being written.

## Concept ledger

Path: `~/.claude/learn-diff/<repo-folder-name>.md` — global per-user, keyed by the repo's
folder name, so it works from any project and never touches a repo's git state.
Format: one bullet per concept — `- <concept> — confirmed <date>`.

- **Before generating (Step 5):** read the ledger if it exists. Concepts already confirmed
  get a one-line reminder + link back, not a re-explanation.
- **At close-out (Step 7):** append newly confirmed concepts. Create the file (and its
  directory) on first use.
- The ledger records *exposure*, not permanent mastery — if the user asks about a ledger
  concept again, explain it fully and don't cite the ledger back at them.
