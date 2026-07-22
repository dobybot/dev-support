---
name: learn-diff
description: "Help the user LEARN a code change (branch, PR, or working tree) made by an AI agent — at the right depth per section: blackbox / greybox / whitebox — so they genuinely understand it before verifying or merging. Starts with intent reconciliation (requested-vs-done-vs-unrequested), renders an HTML explanation page, then checks understanding interactively and emits a verification checklist. Triggers: /learn-diff, 'อธิบาย diff', 'เรียนรู้ change นี้', 'explain this change', 'เกิดอะไรขึ้นใน branch นี้', 'ช่วยให้เข้าใจก่อน merge'."
argument-hint: "Optional — a branch, PR number, or path scope. If omitted: current branch vs merge-base with main, else working-tree changes."
---

# /learn-diff — เรียนรู้ให้เข้าใจก่อน แล้วค่อย verify

> Maintainer note: before modifying this skill, read [DEVELOPMENT.md](DEVELOPMENT.md) —
> it records the design decisions, rejected ideas, and the v2 plan.

**Core principle:** Understanding is a prerequisite for verification. If the user doesn't
understand what the work agent did, they cannot verify it. But not every part of a diff
deserves the same depth — explaining everything deeply wastes the user's time and trains
them to skip the explanation entirely.

**Sibling skill:** `better-review` is an *orientation map* for picking a ticket up cold
(no verdict, no comprehension checks). This skill goes further: it triages how deeply each
part must be understood, reconciles the diff against the original intent, and actively
verifies the user's understanding. Reach for `better-review` to get oriented; reach for
this one when the user must genuinely understand and sign off on a change.

**Output language:** ภาษาไทย คงศัพท์ technical เป็นภาษาอังกฤษ และอธิบายความหมายภาษาไทย
เมื่อใช้ศัพท์นั้นครั้งแรก

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

This table goes FIRST in the output page, before any code explanation.

## Step 3 — Triage into boxes

Split the diff into logical sections by **feature/dataflow, not by file**. Assign each
section a box, with a one-line justification the user can see and override:

| Box | Depth owed to the user | Typical content |
|---|---|---|
| ⬛ blackbox | ไม่ต้องอ่านโค้ดสักบรรทัด: รู้แค่มันทำอะไร, input/output, วิธีทดสอบ/ใช้งาน | boilerplate, generated files, styling, copy changes |
| 🔲 greybox | **collaborative level**: core idea, dataflow, ของอยู่ตรงไหน — พอที่จะให้ feedback ได้ | feature code, non-critical infra, easily reversible changes |
| ⬜ whitebox | **code-change level**: เข้าใจถึงขั้นแก้เองได้ + เหตุผลของ design | critical infra, core business logic, changes that shape future work |

**Hard rules — always whitebox, regardless of your judgment:** authentication/authorization,
money/billing, schema or data migrations, data deletion, security-sensitive code (secrets,
crypto, permissions, allowlists), hard-to-reverse operations (external side effects,
published API contracts), CI/CD and deploy config.

The triage itself is a claim the user must be able to audit: render the box map with
justifications in the page, and honor any override the user gives in chat (regenerate the
affected section at the new depth).

## Step 4 — Generate the explanation page

Read [references/html-page.md](references/html-page.md) and generate ONE self-contained
HTML page. Prefer the Artifact tool (opens side-by-side with chat in the desktop app);
if Artifact is unavailable (CLI session), write the file locally and open it in the
browser. Scale the page to the diff — see Scaling rules below.

**Tests are first-class learning material.** A unit test is an executable input→output
example: when the diff or repo has a test covering a grey/whitebox section, quote the
real test instead of inventing a toy example, and (whitebox) walk through *why* the test
is designed that way — inputs chosen, edge cases pinned, gaps not covered. This serves a
second goal: teaching test design itself. Quote and explain tests that exist; do not
generate new tests as an explanation device.

## Step 5 — Interactive loop (in chat)

After publishing the page, stay in the loop:

- Answer questions; regenerate sections when the user overrides a box.
- Check understanding with **open-ended questions** (these live in chat, not the page):
  ask the user to explain a section back, point out a weakness of the design, or state
  why the design is this way and not another. Evaluate their answer honestly — if it
  reveals a misconception, correct it and offer to re-explain at a deeper level.
- **Never use deliberately misleading questions.** Misinformation sticks even after
  correction (continued influence effect) and destroys trust in the explanation itself.
- **Tutorial mode (optional, whitebox sections only):** if the user asks, or a whitebox
  section is high-risk, offer a guided hands-on walkthrough — run the app, click through
  the flow, then break it on purpose (bad input, missing env, edge case) and observe the
  failure. Predict-then-verify beats read-then-nod.

## Step 6 — Close out

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

- **Tiny (< ~50 changed lines):** no HTML page unless asked — reconciliation table +
  short explanation directly in chat. No quiz.
- **Medium:** full page, prediction questions only for grey/whitebox sections (1–2 each).
- **Large (multi-feature):** full page with table of contents; questions scale with risk,
  not with size.

## Concept ledger

Path: `~/.claude/learn-diff/<repo-folder-name>.md` — global per-user, keyed by the repo's
folder name, so it works from any project and never touches a repo's git state.
Format: one bullet per concept — `- <concept> — confirmed <date>`.

- **Before generating (Step 4):** read the ledger if it exists. Concepts already confirmed
  get a one-line reminder + link back, not a re-explanation.
- **At close-out (Step 6):** append newly confirmed concepts. Create the file (and its
  directory) on first use.
- The ledger records *exposure*, not permanent mastery — if the user asks about a ledger
  concept again, explain it fully and don't cite the ledger back at them.
