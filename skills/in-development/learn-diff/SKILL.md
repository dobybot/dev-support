---
name: learn-diff
description: "Help the user LEARN a code change (branch, PR, or working tree) made by an AI agent — understanding the SYSTEM and what it changes at the product level (PM view) FIRST, then engineer-depth only as far as verifying/maintaining needs. Reconciles intent (requested-vs-done-vs-unrequested) and renders a top-down HTML explanation page (purpose → whole-system picture → how the parts relate → how to use it → then code depth per section: blackbox/greybox/whitebox), checks understanding interactively, and emits a verification checklist. Triggers: /learn-diff, 'อธิบาย diff', 'เรียนรู้ change นี้', 'explain this change', 'เกิดอะไรขึ้นใน branch นี้', 'ช่วยให้เข้าใจก่อน merge'."
argument-hint: "Optional — a branch, PR number, or path scope. If omitted: current branch vs merge-base with main, else working-tree changes."
---

# /learn-diff — เรียนรู้ให้เข้าใจ *ระบบ* ก่อน แล้วค่อย verify

> Maintainer note: before modifying this skill, read [DEVELOPMENT.md](DEVELOPMENT.md) —
> it records the design decisions, rejected ideas, field feedback, and the v2 plan.

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

Two inputs are required:

1. **The diff.** Resolve in this order unless the user specified: current branch vs
   `merge-base` with main → a PR number (`gh pr diff`) → uncommitted working-tree changes.
   State clearly which scope you resolved to.
2. **The intent.** The original task given to the work agent: the user's prompt, a PR
   description, a linked issue/spec, or an Artemis ticket. If you cannot find any intent
   source, ASK the user for it before proceeding — reconciliation (Step 2) is impossible
   without it, and skipping it silently defeats the skill.

## Step 2 — Intent reconciliation

Compare intent against the actual diff and produce three lists:

- ✅ **ขอ + ทำแล้ว** — requested and present in the diff
- ⚠️ **ขอ แต่ไม่ได้ทำ** — requested but silently missing (no red line in a diff shows
  what's absent; derive this by walking the intent item-by-item)
- 🚨 **ไม่ได้ขอ แต่ทำ** — unrequested changes: schema edits, deleted validation,
  "improved" configs, drive-by refactors. Flag every one with a one-line risk note.
  This category is where AI-generated diffs break things.

This table appears near the top of the page — right after the system/PM view (Step 3),
and before any engineer-lens code section.

## Step 3 — Lead with the system (PM view)

**This is the heart of the skill and it comes first in the page.** Before any box triage
or code, establish the product-level understanding — the things a PM would need to sign
off, stated in the product's own vocabulary, not the code's. Cover, in this order:

1. **What capability the change adds, and why** — in terms of what the product/team/users
   can now do that they couldn't before. Not "adds `tools.ts` with 21 handlers" but
   "lets the AI read and update tasks in Artemis directly from chat."
2. **The whole-system picture** — one diagram showing where this change sits relative to
   the rest of the system, and what it talks to. Mark clearly which box *is* this change.
3. **How the parts relate** — trace ONE real request/flow end-to-end, naming which
   file/module hands off to which. This is what turns a pile of files into a system.
4. **How to use / run / try it** — the concrete steps to exercise the capability: build,
   configure, invoke, smoke-test. "How do I actually use this?" is part of understanding a
   system, and a code-only explanation always omits it. Ground every step in the real repo
   (actual commands, paths, config files); run the safe ones (build, boot, smoke-test) and
   show the output as proof. Never enter the user's credentials/tokens yourself.
5. **Scope, risk, and what's deferred — at the product level** — what's intentionally out
   of scope, the product-level tradeoffs, and the single riskiest thing about shipping this.

A PM reading only Step 3 should understand what the change is, whether it does what was
asked, and how to try it — without reading one line of code.

## Step 4 — Triage into boxes (the engineer lens)

Everything from here down is the *engineer lens*: the depth needed by whoever will verify
or maintain the change. It is secondary to Step 3 and is clearly marked as such in the
page (a divider: "จากตรงนี้ = มุมมองวิศวกร"). Do not lead the page with it.

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

The triage itself is a claim the user must be able to audit: render the box map with
justifications in the page, and honor any override the user gives in chat (regenerate the
affected section at the new depth).

## Step 5 — Generate the explanation page

Read [references/html-page.md](references/html-page.md) — it defines the two output
modes and the markup contract. Choose the mode:

- **Artifact mode** — มี Artifact tool (desktop app) และ diff ขนาด Medium: หน้าเดียว
  self-contained เหมือนเดิม (inline CSS/JS ตัดทอนได้ แต่ class ตาม contract เดิม)
- **Multi-page local mode** — CLI session หรือ diff ขนาด Large: สร้าง
  `<repo>/.learn-diff/<slug>/`, copy assets จาก skill folder
  (`cp -R ~/.claude/skills/learn-diff/assets "<outdir>/assets"`), เขียน **index.html
  ก่อน** (PM view ทั้งหมดอยู่หน้านี้) แล้วบอก user เปิดอ่านทันที จากนั้นทยอยเขียน
  section pages และ update nav ทุกครั้งที่หน้าเสร็จ. เพิ่ม `.learn-diff/` ลง
  `.git/info/exclude` (ไม่แตะ `.gitignore`).

**ห้าม generate CSS/JS เอง** — ใช้ไฟล์ใน `assets/` + markup contract ใน html-page.md
เท่านั้น (Artifact mode ยกเว้น) — ประหยัด tokens และ style สม่ำเสมอทุกครั้ง.
Scale the output to the diff — see Scaling rules below.

The page is top-down: TL;DR → system/PM view (Step 3) → intent reconciliation → engineer
lens (box map + per-section deep-dives, Step 4) → questions → verification checklist.

**Tests are first-class learning material.** A unit test is an executable input→output
example: when the diff or repo has a test covering a grey/whitebox section, quote the
real test instead of inventing a toy example, and (whitebox) walk through *why* the test
is designed that way — inputs chosen, edge cases pinned, gaps not covered. This serves a
second goal: teaching test design itself. Quote and explain tests that exist; do not
generate new tests as an explanation device.

## Step 6 — Interactive loop (in chat)

After publishing the page, stay in the loop:

- Answer questions; regenerate sections when the user overrides a box.
- Check understanding with **open-ended questions** (these live in chat, not the page).
  Start at the system/PM level (ask the user to explain what the change enables, or how a
  request flows) before drilling into code — mirror the page's own top-down order. Ask the
  user to explain a section back, point out a weakness of the design, or state why the
  design is this way and not another. Evaluate their answer honestly — if it reveals a
  misconception, correct it and offer to re-explain at a deeper level.
- **Never use deliberately misleading questions.** Misinformation sticks even after
  correction (continued influence effect) and destroys trust in the explanation itself.
- **Tutorial mode (optional, whitebox sections only):** if the user asks, or a whitebox
  section is high-risk, offer a guided hands-on walkthrough — run the app, click through
  the flow, then break it on purpose (bad input, missing env, edge case) and observe the
  failure. Predict-then-verify beats read-then-nod.

## Step 7 — Close out

1. **Verification checklist:** produce a markdown block the user can paste into the PR's
   Verification section (ISO 29110 format where the project uses it): per blackbox section
   the concrete test steps; per grey/whitebox section the understanding the user confirmed.
   Mark anything the user did NOT confirm as `PD (Pending)` — never mark understanding the
   user didn't demonstrate.
2. **Update the concept ledger** (see below) with concepts the user confirmed they
   understand in this session.
3. **Invite feedback:** one line pointing to the feedback board (URL above) — ask which
   sections were too deep/too shallow and whether any box assignment was wrong.

## Scaling rules

Ceremony must scale with the diff, or users will stop invoking the skill on small changes:

- **Tiny (< ~50 changed lines):** no HTML page unless asked — a short system/PM summary
  (what it enables + how to try it) + the reconciliation table, directly in chat. No quiz.
- **Medium:** full page, prediction questions only for grey/whitebox sections (1–2 each).
- **Large (multi-feature):** multi-page output — index.html เป็น table of contents +
  PM view ทั้งหมด, section pages แยกหน้า (ผู้อ่านเริ่มอ่านได้ก่อนหน้าอื่นเสร็จ);
  questions scale with risk, not with size.

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
