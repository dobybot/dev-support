# learn-diff — Development notes (context for the next maintainer agent)

This file is NOT loaded when the skill runs. It exists so the next agent (or human)
updating this skill inherits the reasoning, not just the artifact. Read it fully before
changing SKILL.md.

**Short on time?** Read **Core principles** below and then the last big block,
*"Aug 4, 2026 — v3 ตั๋ว 11 (#13): สรุป v3"* — it holds the two reversals of v2, what v3
deliberately gave up, and the principles that must not be traded away. The dated blocks
between them are the per-ticket record of how v3 was built.

## Origin & program context

- Designed **Jul 22, 2026** in a discussion session between tanin-t and Claude, as part of
  the company's **workflow improvement program**.
- Rollout plan: **v1 published Jul 22, 2026** to the team via this dev-support repo
  (global skill, synced by `.agents/sync-skills.sh`). Team collects feedback for ~1 week
  on the Artemis board **https://artemis.dobybot.com/projects/DW**, then **v2 is built
  from that feedback (week of Jul 27, 2026)**.
- **Repo layout & install mechanism (Jul 22, 2026):** the repo was reorganized — skills
  now live under `skills/in-development/` (this one) and `skills/old/` (pre-existing
  skills). `install.sh` was rewritten the same day: it is now an **interactive per-skill
  installer** (run `./install.sh`, pick skills; symlinks into `~/.claude/skills`, so
  `git pull` auto-updates content). The old SessionStart auto-sync hook
  (`.agents/sync-skills.sh`) is removed by the new install.sh when found. Teammates must
  run `./install.sh` once to get learn-diff — put this in the v1 announcement.
- Inspiration/reference: Geoffrey Litt's "explain-diff-html" prompt —
  https://gist.github.com/geoffreylitt/a29df1b5f9865506e8952488eac3d524
  (we adopted: toy-data examples, diagram-first, dataflow grouping, interactive page;
  we rejected: fixed ceremony — see Rejected ideas).

## Why the name is "learn-diff", not "explain-diff"

Renamed on day one (Jul 22, 2026), by tanin-t's call: the point of the skill is the
**user learning** the change, not the agent producing an explanation. An explanation can
be emitted and ignored; learning is only done when the user can act on the understanding
(give feedback, or change the code themselves). Keep this framing when editing copy.

## Core principles (do not break these — held from v1 through v3)

1. **Understanding is a prerequisite for verification.** If the user doesn't understand
   what the work agent did, they cannot verify it. The skill's end product is therefore a
   *verification checklist grounded in demonstrated understanding*, not prose.
2. **Understanding has levels**, and not all code in a PR deserves the same level:
   - *code-change level* (senior-engineer view): user could confidently change the code
     themselves → **whitebox**
   - *collaborative level* (PM view): user gets the core idea, dataflow, where things
     are; enough to give feedback → **greybox**
   - no code reading at all; just what it does, I/O, how to test → **blackbox**
3. **Ceremony must scale with the diff**, or users stop invoking the skill on small
   changes — and an unused skill has zero value.

## Key design decisions & rationale

| Decision | Rationale |
|---|---|
| Intent reconciliation comes FIRST (ขอ+ทำ / ขอ+ไม่ได้ทำ / ไม่ได้ขอ+ทำ) | Verification needs a criterion; intent is that criterion. The two dangerous categories (silently-missing, unrequested changes) are invisible when reading only the diff — absence has no red lines. Unrequested drive-by changes are where AI diffs break things. |
| Box triage has hard rules (auth, money, migrations, deletion, security, irreversible ops, CI/CD → always whitebox) | The agent proposing the triage has an inherent conflict of interest — where the work agent erred, it also tends to under-rate importance. Hard rules cap the damage of misclassification; the visible box-map + user override handles the rest. |
| Independence check (Step 0) | Same conflict of interest: if the explaining session authored the code, it must explain from the diff, not from its intentions. |
| **No deliberately misleading questions** — ever | Originally proposed (trick yes/no questions to test understanding). Rejected: the *continued influence effect* — misinformation sticks even after correction — plus it destroys trust in the explanation itself. This is a load-bearing prohibition; do not re-add trick questions in v2. |
| Prediction questions must carry a "พิสูจน์เอง" (verify-by-running) line | Predict-then-verify against the real system is the strongest learning loop available here, and it converts quiz answers from trust into evidence. |
| Concept ledger is a dumb append-only file (`~/.claude/learn-diff/<repo>.md`), records *exposure* not mastery | Deliberately minimal — see Rejected ideas (full knowledge model). Lives in `$HOME` because this is a global skill: keeping it in-project would require every repo to gitignore it. |
| Tests already in the diff (AI-generated or pre-existing) are first-class learning material | tanin-t's original idea: a unit test is an executable input→output example of a function, so quoting a real test beats inventing a toy example. Dual learning goal: walking through *why* each test is designed the way it is (input choice, edge cases, what is NOT covered) also teaches test design itself — a self-identified team skill gap. The skill quotes and explains tests that exist in the diff/repo; it does not generate new tests as an explanation device. |
| Tutorial mode is optional, whitebox-only | Full guided tutorials per diff are expensive to author and fragile (UI changes, scripts rot). Kept as opt-in where the depth is justified. |
| Verification checklist output, ISO 29110-compatible where the project uses it | Ties the skill's "definition of done" to the artemis project's mandatory PR Verification block. Everything defaults to `PD (Pending)`; never mark understanding the user didn't demonstrate. |
| Output language Thai, technical terms in English | Team working language. |

## Rejected / deferred ideas (revisit only with evidence from feedback)

- **Full stateful user-knowledge model** (skill tracks knowledge level, experience,
  adapts depth automatically). Deferred to v2+: cold-start problem, staleness (knowledge
  decays but the model says "knows it"), and modeling learner knowledge is a famously
  hard problem. The concept ledger is the deliberate 80/20 replacement.
- **Fixed quiz ceremony** (Litt's always-5-multiple-choice). Violates the scaling
  principle.
- **Trick/misleading questions.** See table above — rejected on principle, not on cost.

## Relationship to `better-review` (sibling skill in this repo)

Discovered during v1 build: `better-review` (now in `skills/old/`) overlaps — it also generates
an HTML surface for reviewing AI-completed work. Agreed positioning (also stated in both
SKILL.md files should stay consistent):

- `better-review` = **orientation map** to pick a ticket up cold; no verdict, no
  comprehension checking.
- `learn-diff` = depth-triaged **learning**: intent reconciliation + box triage +
  active verification of the user's understanding before sign-off.

**Open question for v2:** should these merge, or does the team actually use them at
different moments? Watch the feedback board for confusion between the two.

## Feedback to collect for v2 (post these as fixed questions on the DW board)

1. การจัด box ผิดตรงไหน — ส่วนไหนอธิบายลึกไป/ตื้นไป?
2. Intent reconciliation จับของหลุด (missing / unrequested) ได้จริงไหม มี false positive ไหม?
3. ส่วนไหนของหน้า HTML ที่คุณ**ไม่เคยอ่าน**? ← สำคัญสุด: section ที่ไม่มีใครอ่านคือ
   candidate แรกที่จะตัดใน v2

## Field feedback — v1 first run (Jul 22, 2026, tanin-t on commit 0a3b52e / artemis-mcp)

First real invocation, on a large single-commit feature (a new `artemis-mcp` package).
Four pieces of feedback, all pointing the same direction — **lead higher, descend later.**
Folded into SKILL.md + references/html-page.md the same day:

1. **learn-diff is about understanding the SYSTEM, not "how the code works."** The v1 page
   led with the engineer structure (box map → per-file code deep-dives) and the user felt
   "dropped into the middle." Reframe adopted: **PM view before senior-engineer view.** The
   product-level understanding (what capability this adds, why, what it enables, how to use
   it, scope/risk) now leads the page as its own step (Step 3, "Lead with the system"); the
   box triage + code deep-dives are explicitly the *engineer lens* — secondary, and only as
   deep as verify/maintain requires. NOTE: greybox was already tagged "PM/collaborative
   level" and whitebox "senior-engineer level" in Core principles above — the fix was ORDER
   and altitude, not inventing a new level.
2. **Top-down or bust.** Open with purpose → whole-system picture → how the parts relate
   (trace ONE real request end-to-end) → then details. The single most effective addition
   to the v1 page was a "big picture" section with a system diagram + a 6-step request
   trace naming which file hands off to which. Make this structural, not optional.
3. **No cold jargon in the TL;DR/intro.** The v1 TL;DR packed "hybrid / transport /
   ToolContext.fs" into one sentence and the user couldn't parse it. Rule added: TL;DR and
   any intro must read on their own; never stack undefined terms; define in Thai at first
   use. (The output-language note already said "define at first use" — it wasn't enough;
   the TL;DR specifically needs the stronger "no stacked undefined terms" rule.)
4. **"How do I install / try it?" is part of understanding a system.** The code-only page
   never told the user how to run or exercise the change; they had to ask separately. A
   PM-view section must include the concrete how-to-use / run / test steps (build, config,
   invoke, smoke-test). Added to Step 3 + html-page.md.

All four are consistent with each other and with the skill's own name (learn the *change*,
not the code). Keep this altitude in v2; do not let the box map creep back to the top.

## Jul 29, 2026 — v2: static assets + multi-page output (DW-4, DW-5, DW-6, DW-7, DW-13)

Implemented from the DW board (subtasks of DW-1):

- **DW-4 — prebuilt static assets.** `assets/learn-diff.css` (~10 KB) +
  `assets/learn-diff.js` (~8 KB) now ship inside the skill folder. The generator emits a
  documented **markup contract** (see references/html-page.md) instead of regenerating
  styling/behavior inline every run — saves generation tokens and keeps every page
  consistent. Rule added: never write `<style>`/`<script>` beyond the two asset includes
  (Artifact mode excepted — inline a trimmed copy there, same classes).
- **DW-5 — syntax highlighting.** Hand-rolled regex tokenizer in learn-diff.js
  (comment → string → number → keyword → function-name priority) for js/ts/jsx/tsx,
  python, bash, sql, json, yaml, html/xml, css/scss. Unknown language or any error →
  renders plain, never breaks the page. **Rejected: vendoring highlight.js** (too big,
  CDN forbidden).
- **DW-6 — filename + line numbers.** `figure.code-block` with `figcaption.code-filename`
  header; JS wraps each line in `span.ln`, CSS counters number them; start offset via
  `style="--ln-start: N"` on the figure.
- **DW-7 — terminal blocks.** `figure.terminal`, always-dark; `span.cmd` gets a CSS
  `::before` "$ " prefix (`user-select:none` — never typed in the markup), `span.out`
  lines unprefixed. Copy button copies commands only.
- **DW-13 — multi-page output.** CLI sessions and Large diffs now produce
  `<repo>/.learn-diff/<slug>/`: `index.html` (entire PM altitude: TL;DR + PM view +
  reconciliation + box map — the "PM view first" ordering is preserved by construction),
  numbered per-section pages (grey/whitebox only; short blackbox inlined in the box map),
  `99-verify.html`, plus a copied `assets/`. Written **index-first** so the user reads
  while later pages generate; not-yet-written pages are non-link `.nav-pending`
  "ยังไม่เสร็จ" entries, and index nav (+ previous page's footer-nav) is rewritten as
  each page lands. **Rejected: JS availability-polling** — `fetch` doesn't work on
  `file://`; refresh-based progress instead. Assets are *copied* into the output dir
  (`cp -R ~/.claude/skills/learn-diff/assets` — cp follows the install symlink) so the
  folder is self-contained/movable offline. Output dir goes in `.git/info/exclude`,
  never the tracked `.gitignore`.
- **Mode selection:** Artifact tool present + Medium diff → single self-contained
  Artifact page (unchanged behavior); CLI or Large → multi-page local; Tiny → chat only.
- Rejected in passing: mermaid (CDN ban; `.diagram` HTML/CSS panels instead).

## Aug 4, 2026 — v3 ticket 2 (#4): content contract + tracer bullet

ตั๋วที่ทำให้ "อ่าน run ในเบราว์เซอร์" เดินได้ครบเส้นเป็นครั้งแรก สิ่งที่ตัดสินใจแล้วและมีผลกับทุกตั๋วถัดไป:

- **Content contract อยู่ที่ `viewer/src/shared/types.ts`** — server กับ app import type ชุดเดียวกัน
  เอกสารสำหรับ agent คือ [references/content-format.md](references/content-format.md)
  (`references/html-page.md` ยังอยู่จนกว่าตั๋ว #12 จะสับ SKILL.md มาใช้ v3 แล้วค่อยลบ)
- **run.json ถือข้อมูล, markdown ถือ prose** และจุดที่สองอย่างมาเจอกันคือ leaf directive
  `::reconciliation` / `::box-map` — agent คุมว่าตารางโผล่ตรงไหนของหน้า แต่ไม่ต้องเขียนตารางเอง
  เหตุผล: ตารางพวกนี้คือของที่ v2 เขียนผิดรูปได้ง่ายที่สุด และเป็นของที่ต้องกดได้ในตั๋ว #9
- **question/answer ใช้ container ซ้อนกัน** (`::::question` ครอบ `:::answer`) เพราะ remark-directive
  บังคับให้ตัวนอกมีอัฒภาคมากกว่าตัวใน · `::verify[...]` เป็น leaf เพื่อไม่ต้องซ้อนสามชั้น
- **directive ที่ไม่รู้จัก render เป็นกล่องแดง** ไม่ใช่หายเงียบ — หลักเดียวกับ validation warnings
- **Registry เป็นไฟล์ที่ server อ่านอย่างเดียว** (`$LEARN_DIFF_HOME/runs.json`, default
  `~/.claude/learn-diff/runs.json` — ที่เดียวกับ concept ledger) คนเขียนคือ
  `viewer/scripts/register-run.mjs` ที่ skill เรียก · ไม่มี POST ใน API โดยตั้งใจ
- **เทสต์มี seam เดียว: HTTP surface ของ server** ยิงผ่าน `node:http` ตรง ๆ ไม่ต้องปลุก vite
  (`createApiHandler()` ถูกใช้ทั้งใน plugin และในเทสต์) fixture สร้างใน temp dir เสมอ
- **แปลง pr-230 มือเปล่าแล้ว** เก็บไว้ที่ `viewer/examples/pr-230-etax-link-notify/`
  ของที่หน้า HTML v2 แบกได้แต่ format ใหม่ยังแบกไม่ได้ (ปุ่ม copy, syntax highlight ใน prose,
  cell หลายย่อหน้า ฯลฯ) จดไว้ท้าย `references/content-format.md` — **อ่านก่อนถ้าจะเถียงว่า format พอ**

## Aug 4, 2026 — v3 ticket 3 (#5): live generation (SSE)

ตั๋วที่ทำให้ "เริ่มอ่านหน้า 1 ตอน agent เขียนหน้า 3 อยู่" เป็นจริง สิ่งที่ตัดสินใจไว้:

- **server บอกแค่ "อะไรเปลี่ยน" ไม่ส่งเนื้อหามากับ event** (`change` มีแต่ชื่อไฟล์)
  ทำให้ SSE ไม่ต้องรู้จัก content format และ app คุมเองว่าจะโหลดอะไรใหม่ — ค่าใช้จ่ายคือ
  round trip เพิ่มหนึ่งครั้งต่อการเปลี่ยน ซึ่งเป็น localhost ทั้งคู่
- **`ready` แปลว่า "จด snapshot ฐานเสร็จแล้ว"** ไม่ใช่แค่ "ต่อสายได้" — ถ้าส่ง `ready` ก่อน
  priming scan จบ ไฟล์ที่ถูกเขียนพอดีในจังหวะนั้นจะถูกจดเป็นสภาพเดิมแล้วหายเงียบ
  (นี่คือ race ที่ทำให้ `watchContentDir` เป็น async)
- **`fs.watch` + poll ทุก 2 วิ ควบคู่กัน แล้วเทียบ mtime+size ก่อนยิง event**
  `fs.watch` เร็วแต่เชื่อไม่ได้ 100% (network volume / bind mount) ส่วน poll อย่างเดียวก็หน่วง —
  การเทียบ snapshot ทำให้สองทางนี้ยิง event ซ้ำกันไม่ได้ และ editor ที่ touch ไฟล์เฉย ๆ ก็ไม่นับ
- **โหลดใหม่ต้องไม่ล้างของเดิม** (`useAsync` มี `refreshing` แยกจาก `loading` และเก็บ data
  ไว้แม้ครั้งล่าสุดจะ error) — ไม่งั้นทุกครั้งที่ agent เขียนไฟล์ หน้าที่ผู้ใช้กำลังอ่านจะกะพริบ
  เป็น "กำลังโหลด…" ซึ่งแย่กว่าไม่มี live update
- **`section_pending` ต้องหน้าตาไม่เหมือน error** — กล่องเส้นประ "รอเขียน" ไม่ใช่กล่องแดง
  และ section ที่ยังไม่เขียนก็ยังกดเข้าไปนั่งรอได้ (หน้าจะกลายเป็นเนื้อหาเองเมื่อไฟล์มา)
  เหตุผลเดียวกับ validation warnings: ผู้อ่านต้องแยก "ยังไม่ถึงคิว" ออกจาก "พัง" ได้ทันที
- **สาย SSE เปิดที่ `RunLayout` เส้นเดียวต่อ run** แล้วส่งลงลูกผ่าน context —
  พิสูจน์ว่า nav ไม่ทำลายเปลือกได้ด้วยการนับว่ามี request `/events` แค่ครั้งเดียวหลังเดินหลายหน้า
- **header มีตัวบอกสถานะสาย** เพราะ live update ที่ตายเงียบทำให้ผู้อ่านเชื่อหน้าที่เก่าไปแล้ว
  สายหลุดแล้วต่อใหม่ได้เองจะโหลดสภาพจริงซ้ำเสมอ (ของที่เปลี่ยนช่วงสายขาดจึงไม่ตกหล่น)

## Aug 4, 2026 — v3 ticket 4 (#6): mermaid หลัง module boundary

**กลับคำตัดสินใจของ v2 อย่างเป็นทางการ:** วันที่ 29 ก.ค. mermaid ถูกปฏิเสธเพราะ "ห้ามใช้ CDN"
และ output ต้องเปิดจาก `file://` ได้ · v3 ไม่มีข้อจำกัดทั้งสองข้อแล้ว (มี viewer app + npm)
เหตุผลเดิมไม่ผิด — **เงื่อนไขเปลี่ยน ไม่ใช่การให้เหตุผลเปลี่ยน** ตอนนี้ mermaid มาจาก npm
(`viewer/package.json`) ไม่มี CDN เหมือนเดิม

- **ทางเข้าเดียวคือ `renderDiagram({ container, source, nodeMap, … })`** ที่
  `viewer/src/lib/diagram/index.ts` · engine จริงอยู่ใน `engine-mermaid.ts` ไฟล์เดียว
  และมีเทสต์ (`test/diagram.test.ts`) ที่ไล่สแกน `src/` เพื่อยืนยันว่า **ไม่มีไฟล์อื่น import mermaid**
  กับ **ไม่มีใครนอกโฟลเดอร์ diagram import ไฟล์ข้างในตรง ๆ** — boundary ที่ไม่มีอะไรบังคับ
  จะกลายเป็นแค่ความตั้งใจภายในสองสัปดาห์
- **subset ถูกบังคับด้วยโค้ด ไม่ใช่ด้วยคำแนะนำ** (`subset.ts` เป็น parser ตัวเล็ก ๆ ที่ pure —
  เทสต์ใน environment node ได้) หลุดกฎ = แถบแดงคาดหัวรูปให้ผู้อ่านเห็น แต่**ยังวาดรูปให้**
  ส่วน source ที่ mermaid อ่านไม่ออกเลยจึงจะเป็นกล่องแดงแทนรูป · เอกสารฝั่ง agent:
  [references/diagram-mermaid.md](references/diagram-mermaid.md)
  ตัว parser นี้คือเมล็ดของ "parser ที่จะเขียนวันที่เปลี่ยน engine" ที่ SPEC พูดถึง
- **สีอยู่ที่ viewer ไม่ใช่ที่ agent** — มี class มาตรฐาน `changed` / `risk` / `external`
  ที่ renderer แทรก `classDef` ให้เอง (ตาม light/dark) agent เขียนแค่ `class A,B changed`
  เหตุผลเดียวกับที่ v2 ห้ามเขียน `<style>` เอง: หน้าตาที่ generate ใหม่ทุก run = ไม่มีวันเหมือนกันสองครั้ง
  · ตัวอย่าง pr-230 ถูกแก้ให้เลิก hardcode `classDef changed fill:#fde68a…` แล้ว
- **การกด node ไม่ใช้ `click` ของ mermaid** (ต้องเปิด `securityLevel: 'loose'`) แต่เดินบน SVG
  ที่วาดเสร็จแล้วผูก handler เองตาม `nodeMap` · ตอนนี้ยังไม่ส่ง `onNodeClick` เพราะ code panel
  มาในตั๋ว #8/#9 — node ที่มี reading list จึงถูกทำเครื่องหมายว่า "มีโค้ดให้อ่านต่อ" แต่ยังไม่กลายเป็น
  ปุ่มที่กดแล้วเงียบ (dead click คือผลลัพธ์ที่แย่ที่สุด — หลักเดียวกับ validation ที่ต้องดัง)
- **ไม่ย่อรูปให้พอดีคอลัมน์** (`useMaxWidth: false`) เพราะ flowchart LR ยาว ๆ ย่อแล้วเหลือสูง 60px
  อ่านตัวหนังสือไม่ออก · แลกด้วยการเลื่อนซ้าย-ขวา และกฎฝั่ง agent ว่า **ใช้ `TB` เป็นค่าเริ่มต้น**
  (ตัวอย่าง pr-230 ถูกแปลงเป็น TB แล้ว: หน้า index จาก 3364px → 700px กว้าง)
- **mermaid layout ไม่มีเทสต์อัตโนมัติ** ตาม SPEC-v3 → Testing Decisions · ที่เทสต์คือ subset
  กับขอบเขตของ engine ส่วนผลลัพธ์ที่ตาเห็นตรวจด้วยการเปิดอ่าน run จริง

## Aug 4, 2026 — v3 ticket 5 (#7): file API + ตัวแสดงโค้ด

ตั๋วที่ทำให้ "โค้ดจริงจาก commit ที่ pin ไว้" ขึ้นจอได้ สิ่งที่ตัดสินใจไว้:

- **server อ่านไบต์ด้วย `git show <commit>:<path>` ไม่ใช่อ่านจาก working tree**
  (`viewer/server/git.ts`) — นี่คือเหตุผลทั้งหมดที่ระบบ pin commit ไว้ตั้งแต่แรก
  ผู้อ่านเปิด branch อื่นค้างไว้ หรือแก้ไฟล์ต่อระหว่างอ่าน เลขบรรทัดในคำอธิบายก็ไม่เลื่อน
- **เนื้อโค้ดไม่เคยถูกฝังใน content ที่ agent เขียน** — `readingLists` เก็บแค่พิกัด
  (path + ช่วงบรรทัด + เหตุผล) แล้ว app ขอทีละครั้งผ่าน
  `GET /api/runs/<id>/file?path=&from=&to=` · content ที่ generate ใหม่ทุก run
  จะได้ไม่มีสำเนาโค้ดที่ล้าสมัยได้เอง
- **path ทุกอันถูก resolve เทียบ repo ที่ run นั้นลงทะเบียนไว้ แล้วปฏิเสธถ้าหลุดออกนอก**
  (`repoRelativePath()` ใน `server/file.ts`) — process เดียวเห็นทุก repo ที่เคยลงทะเบียน run
  การผูกกับ 127.0.0.1 จึงไม่พอ ต้องมีด่านนี้ด้วย (user story 48)
- **ช่วงบรรทัดที่ resolve ไม่ได้ = error ที่บอกจำนวนบรรทัดจริง ไม่ใช่เนื้อหาว่าง**
  (`range_not_found`) และ commit ที่ไม่มีในเครื่องต้องแยกจากไฟล์ที่ไม่มีในคอมมิต
  (`commit_not_found` / `file_not_found`) เพราะทางแก้คนละทางกัน — อย่างแรก `git fetch`
  อย่างหลังบอก agent ให้แก้พิกัด · `git show` เพียว ๆ แยกให้ไม่ได้ (มันตอบ "exists on disk,
  but not in <sha>" เหมือนกันหมด) จึงต้องเช็ค `cat-file -e <sha>^{commit}` ก่อนหนึ่งชั้น
- **ตัวแสดงโค้ดคือ CodeMirror 6 หลัง boundary เดียว** `mountCodeView()` ที่
  `viewer/src/lib/code/index.ts` (แบบเดียวกับ mermaid หลัง `lib/diagram`) และมีเทสต์สแกน `src/`
  บังคับไว้ใน `test/code.test.ts` · เลือก CodeMirror เพราะของที่ต่อคิวอยู่ — หมุดของ reading list,
  ไฮไลต์บรรทัดที่ PR แก้, คอมเมนต์/คำถาม inline — เป็น gutter marker กับ decoration ทั้งหมด
  ส่วน Shiki/Prism ต้องสร้างเองทุกอย่าง
- **`readOnly` ไม่ใช่ `editable: false`** — ปิด editable แล้ว editor โฟกัสไม่ได้
  Cmd-F ของ `searchKeymap` ก็ตายตาม ทั้งที่ "ค้นหาในไฟล์" เป็น user story (23)
- **เลขบรรทัดใน gutter เลื่อนตามช่วงที่ขอ** (`formatNumber`) ไม่ใช่เริ่มที่ 1 เสมอ —
  ผู้อ่านต้องอ้างเลขบรรทัดใน review comment ได้โดยไม่ต้องบวกเอง (user story 24)
- **`:file[...]` ในเนื้อความกดได้แล้ว** ลิงก์ไปหน้า `/r/<run>/_file` ซึ่งเป็น**ที่พักชั่วคราว**
  ของตั๋วนี้ เปลือกจริง (panel ที่ดันเนื้อหาให้แคบลง, ลากปรับความกว้าง, ปิดด้วย Esc,
  ประวัติ back/forward) เป็นของตั๋ว #8/#9 ที่จะย้าย `<CodeView/>` ไปอยู่ข้าง `<Outlet/>`
  จุดที่ต้องแก้ตอนย้ายคือ `src/lib/file-link.ts` ที่เดียว
- **commit ของ run ตัวอย่าง pr-230 ถูกแก้ให้เป็น sha จริง** (`e2b2696bb604…`) จากเดิมที่
  pad ศูนย์ไว้ — file API เปิดโค้ดของตัวอย่างได้จริงแล้วถ้ามี monorepo ในเครื่อง

## Aug 4, 2026 — v3 ตั๋ว 6 (#8): reading-list panel

ตั๋วที่ทำให้ "ลำดับการอ่านที่ AI จัดให้" กลายเป็นของที่ใช้ได้จริง — ของชิ้นเดียวในสเปกที่
diff viewer ให้ไม่ได้ เพราะมันขึ้นกับการที่ *มีคนตัดสินใจว่าโค้ดที่ไม่ถูกแก้ส่วนไหนสำคัญ*

- **panel เป็น flex sibling ของเนื้อหา ห้ามเป็น overlay** (`components/run/reading-panel.tsx`
  แขวนอยู่ข้าง `<Outlet/>` ใน `RunLayout`) เปิดแล้ว container เลิกบีบที่ `max-w-6xl`
  เนื้อหาจึง**แคบลงจริง** ไม่ใช่ถูกบัง — เพราะทั้งคำอธิบายและโค้ดต้องอยู่บนจอพร้อมกัน (user story 5)
  · ห้ามเปลี่ยนไปใช้ `fixed`/`absolute` กับกล่องนอกของ panel
- **เปิดได้ทีละรายการเดียว + ประวัติ back/forward เป็นของ panel เอง ไม่ใช่ของ browser**
  (`src/lib/reading-panel.ts`) — ผูกกับ URL แล้วมันจะหายทุกครั้งที่เปลี่ยน section ซึ่งขัดกับ
  user story 29 ที่บอกว่า panel ต้องรอดข้ามหน้า · tab / panel ซ้อนถูกปฏิเสธไว้ในสเปกแล้ว
- **ตรรกะทั้งหมดของ panel เป็นฟังก์ชันล้วนแยกไฟล์** (ประวัติ, clamp ความกว้าง, ดัชนีไฟล์,
  resolve target) เทสต์ที่ `test/reading-panel.test.ts` — สเปกห้ามเทสต์ระดับ component ไว้
  วิธีเดียวที่ยังเทสต์อะไรได้จริงคือดันตรรกะออกมานอก React
- **`changed` กับ `context` ใช้ตัวแสดงเดียวกัน ต่างแค่ตาราง `TONE`** (กรอบ/badge/พื้นหลัง)
  ไม่ใช่โค้ดคนละทาง · ตอนนี้ลงสีระดับ "ทั้งช่วง" เพราะ `ReadingSpan` มี `kind` ต่อช่วง ไม่ใช่ต่อบรรทัด
  — การไฮไลต์รายบรรทัดแบบ diff จริงต้องรอตั๋ว #10 ที่เป็นเจ้าของเรื่อง diff colouring
- **ความกว้างที่ผู้อ่านตั้งถูกเก็บดิบ ๆ แล้ว clamp ตอนแสดงผลเท่านั้น** (`localStorage`
  key `learn-diff:panel-width`) — เคยเก็บค่าที่ clamp แล้ว ผลคือย่อหน้าต่างครั้งเดียว
  ความกว้างที่ตั้งไว้หายถาวร ขยายหน้าต่างกลับก็ไม่คืน
- **`Esc` ปิด panel เฉพาะเมื่อยังไม่มีใครใช้ปุ่มนั้นไป** (เช็ค `event.defaultPrevented`) —
  ไม่งั้น Esc ที่กดเพื่อปิดช่องค้นหาของ CodeMirror จะปิด panel ทิ้งไปด้วยทั้งที่ยังอ่านไม่จบ
- **หมุดในดัชนีไฟล์เลื่อนแบบทันที ไม่ใช่ `behavior: 'smooth'`** — CodeMirror ของช่วงอื่น ๆ
  วัดขนาดตัวเองตลอด การ scroll ที่มันทำระหว่างนั้นยกเลิก smooth scroll ทิ้ง อาการคือ "กดหมุดแล้วไม่ไปไหน"
- **หน้าโค้ดชั่วคราว `/r/<run>/_file` ของตั๋ว #7 ถูกถอดทิ้ง** (`routes/file-page.tsx` และ
  `fileHref()`) — `:file[...]` ในเนื้อความเปิด panel แทนแล้ว การมีทางแสดงโค้ดสองทางค้างไว้
  แปลว่าทุกอย่างที่จะเพิ่มทีหลัง (หมุด, diff, คอมเมนต์) ต้องทำสองรอบ
- **`readingLists` มีวิธีเขียนที่ตัดสินใจไว้แล้ว** — เพิ่มไว้ใน `references/content-format.md`:
  เรียงตาม dataflow ไม่ใช่ตามไฟล์, ต้องมีช่วง `context` ถ้าเข้าใจไม่ได้โดยไม่อ่านของเดิม,
  `why` บอกว่า "ช่วงนี้ตอบคำถามอะไร" ไม่ใช่สรุปว่าโค้ดทำอะไร

## Aug 4, 2026 — v3 ตั๋ว 7 (#9): ต่อสายให้กดได้ + warning ตอน validate

ตั๋วที่ปิดช่องว่างระหว่าง "หน้าอธิบาย" กับ "โค้ดจริง": ทุกอย่างที่ควรเปิดโค้ดได้ เปิดได้แล้ว
และทุกอย่างที่ควรเปิดได้แต่เปิดไม่ได้ ต้อง**ส่งเสียง**

- **กด node ในไดอะแกรมไม่ใช้คำสั่ง `click` ของ mermaid** (ซึ่งบังคับ `securityLevel: 'loose'`
  = ยอมให้ HTML/script ในป้ายชื่อที่ agent เขียนถูกรัน) — `src/lib/diagram/index.ts` เดินบน SVG
  ที่ engine คืนมาแล้วผูก handler เองจาก `nodeMap` · มีเทสต์ใน `test/diagram.test.ts` บังคับว่า
  `securityLevel` ต้องเป็น `strict` และไม่มีไฟล์ไหนแทรกบรรทัด `click …` เข้า source
- **`onNodeClick` ถูกส่งผ่าน ref ไม่ใช่ dependency ของ effect** (`components/run/diagram.tsx`) —
  identity ของ panel state เปลี่ยนทุกครั้งที่ประวัติ/ความกว้างขยับ ถ้าใส่ลง dependency ตรง ๆ
  แค่ลากปรับความกว้าง panel ก็สั่งวาดไดอะแกรมใหม่ทั้งหน้า
- **แถว box map มีคอลัมน์ "โค้ด"** แทนที่จะทำทั้งแถวให้กดได้ — ในแถวมีลิงก์ไปหน้า section อยู่แล้ว
  การซ้อน `<button>` ทับ `<tr>` ที่มี `<a>` ข้างในทำให้ผู้อ่านเดาไม่ออกว่ากดตรงไหนได้อะไร ·
  แถวที่ไม่ได้ระบุ `readingList` เองจะ fallback ไปใช้ของ section ที่มันชี้ไป
- **validation อยู่ฝั่ง server ไม่ใช่ในเบราว์เซอร์** (`server/validate.ts`) ด้วยเหตุผลสองชั้น:
  (1) การตรวจช่วงบรรทัดต้องใช้ `git show` ที่ commit ที่ pin ไว้ ซึ่งมีแต่ server ทำได้
  (2) SPEC-v3 → Testing Decisions เลือก HTTP surface เป็น seam เดียว — warning จึงกลายเป็น
  assertion ต่อ JSON (`test/validate.test.ts` ใช้ git repo จริงใน temp dir) ไม่ใช่เทสต์ DOM
- **warning สองชนิดที่เป็นการเช็คแบบ "ไม่มี" ถูกกลั้นไว้จนกว่าทุก section จะถูกเขียนครบ**
  (`reading_list_unreferenced`, `diagram_node_not_found`) — ระหว่างที่ agent ยังเขียนไม่จบ
  หน้าที่ยังไม่มีอาจเป็นคนถือ `:read` หรือไดอะแกรมนั้นอยู่ ถ้าไม่กลั้น ผู้อ่านจะเห็นกล่องเหลือง
  วูบวาบตลอดการ generate แล้วเลิกเชื่อมันไปเลย ซึ่งแย่กว่าไม่มี warning
- **commit ที่ยังไม่มีในเครื่อง = เตือนครั้งเดียว (`range_check_unavailable`) แล้วข้ามการตรวจช่วงทั้งชุด**
  ไม่ใช่ยิงข้อความเดียวกันต่อทุก span · แยกจาก "พิกัดผิด" ชัดเจนเพราะทางแก้คนละทาง (`git fetch`
  vs บอก agent ให้แก้ตัวเลข)
- **server อ่าน node id จาก `src/lib/diagram/subset.ts` โดยตรง** ซึ่งเป็นข้อยกเว้นที่ตั้งใจของกฎ
  "เข้าทาง `@/lib/diagram` ทางเดียว": `subset.ts` เป็น parser ล้วนของ *contract* (ข้อความ mermaid)
  ไม่ใช่ engine · มีเทสต์เพิ่มใน `test/diagram.test.ts` บังคับว่าฝั่ง `server/` ต้องไม่ import
  mermaid หรือไฟล์ engine/normalize/theme เลย
- **ตัวสแกน markdown ของ server เป็นตัวอ่านบรรทัดต่อบรรทัด ไม่ใช่ remark** (`server/scan.ts`) —
  ลาก unified/remark เข้ามาแค่เพื่อหา 3 อย่าง (mermaid, `:read`, `:file`) แปลว่า pipeline
  ของ app กับของ server ต้องเดินตามกันตลอดไป · สิ่งที่ต้องระวังคือ false positive จึงข้าม
  fenced code block และ inline code (ตัวอย่างในเอกสารต้องไม่ถูกนับเป็นการอ้างถึงจริง)
- **`loadRun` อ่านไฟล์ .md ทุกหน้าแทนการ `stat`** เพราะ validate ต้องดูเนื้อความอยู่แล้ว ·
  จำนวนบรรทัดต่อไฟล์ถูก cache แยกจาก cache เนื้อไฟล์ (`server/file.ts`) ไม่งั้น run ที่แตะเกิน
  16 ไฟล์จะไล่ cache กันเองออกจนต้องเรียก git ใหม่ทุกครั้งที่ SSE บอกว่ามีไฟล์เปลี่ยน
- **ตัว validate ล้มต้องไม่ทำให้ทั้ง run เปิดไม่ขึ้น** — `loadRun` ครอบด้วย catch แล้วแปลงเป็น
  warning `validation_failed` แทน

## Aug 4, 2026 — v3 ตั๋ว 8 (#10): กางทั้งไฟล์ + diff สองฝั่ง

- **`baseCommit` เข้ามาอยู่ใน contract** (`run.json` และ registry) — สีของ diff ต้องมาจาก
  การเทียบ commit จริง ไม่ใช่จาก `kind` ที่ agent เขียน · `kind` ยังทำหน้าที่เดิม (กรอบการ์ด
  "PR นี้แก้" vs "ของเดิม") แต่ **บรรทัดไหนเพิ่ม/ลบ** เป็นคำตอบของ git เท่านั้น การให้ agent
  ระบุเองเท่ากับเพิ่มที่ให้ผิดได้อีกที่โดยไม่ได้อะไรกลับมา
- **ไม่มี `baseCommit` = "เทียบไม่ได้" ไม่ใช่ error** — API ตอบ 200 พร้อม `status: 'unavailable'`
  และเหตุผล ส่วนโค้ดยังอ่านได้ครบ · เหตุผลเดียวกับที่ commit ที่ยังไม่ fetch ไม่ควรทำให้ทั้งหน้าล่ม
- **server ส่ง hunk ไม่ส่ง diff ที่ render มาแล้ว** (`server/diff.ts` + `src/lib/diff.ts`) —
  แอปมีเนื้อไฟล์ฝั่งใหม่จาก file API อยู่แล้ว การส่ง `git diff -U0` แบบย่อ (บรรทัดฝั่งเก่าเฉพาะ
  ที่ถูกลบ + จำนวนบรรทัดที่เพิ่ม) ทำให้ประกอบได้ทั้ง unified และ side-by-side จากชุดเดียวกัน
  ตรงกับที่ SPEC-v3 สั่งไว้ว่า "one code path, not two"
- **`--no-renames` โดยตั้งใจ** — ไฟล์ที่ถูกเปลี่ยนชื่อมาถือว่าเพิ่มใหม่ทั้งไฟล์ ซึ่งตรงกับสิ่งที่
  ผู้อ่านเห็น (หน้านี้แสดงไฟล์ที่ path ปลายทางเสมอ) ดีกว่าตอบว่า "ไม่มีอะไรเปลี่ยน"
- **กางทั้งไฟล์แล้ว "ยังลงสี diff และยังเห็นหมุดของช่วงอื่น"** — ช่วง `context` ที่ยังไม่กางไม่ลงสี
  ตามสเปกเดิม แต่พอกางทั้งไฟล์จะลงสีเสมอ เพราะจังหวะที่ซูมออกคือจังหวะที่คำถาม "แล้ว PR
  แตะตรงไหนของไฟล์นี้บ้าง" สำคัญที่สุด
- **โหมด diff เป็นค่าของผู้อ่าน ไม่ใช่ของไฟล์** — ปุ่มอยู่บนการ์ด (ที่ที่มันเกี่ยวข้อง) แต่เขียนลง
  `localStorage['learn-diff:diff-mode']` ทีเดียวทั้งแอป · การจำแยกต่อไฟล์ขัดกับ user story 21 ตรง ๆ
- **กางแล้ว editor ต้องมีความสูงคงที่** ไม่ใช่ปล่อยให้ยาวไปตามไฟล์ — CodeMirror virtualize
  ก็ต่อเมื่อมันเป็นตัว scroll เอง · การครอบด้วย `max-h` ข้างนอกแบบตั๋ว 6 ถูกถอดออก เพราะ
  scroll ซ้อน scroll ทำให้ทั้งการวัดขนาดและการเลื่อนไปหาหมุดเพี้ยน
- **ตำแหน่งเริ่มต้นของ editor ส่งผ่าน `scrollTo` ของ CodeMirror ตอนสร้าง** ไม่ใช่สั่ง scroll
  หลัง mount: dispatch ภายในที่ตามมาทีหลัง (grammar ของภาษาโหลดเสร็จ ฯลฯ) จะดึง scroll
  กลับไปที่ anchor เดิมคือหัวไฟล์ · อาการที่เห็นคือ "กางทั้งไฟล์แล้วเด้งไปบรรทัด 1"
- **`update()` ของ editor ไม่รีเซ็ต scroll เป็น 0 อีกต่อไป** — เอกสารถูกเขียนใหม่ทั้งก้อนทุกครั้งที่
  diff โหลดเสร็จหรือสลับโหมด ซึ่งยังเป็นไฟล์เดิม การดีดกลับหัวไฟล์ตอนนั้นคือการดึงผู้อ่านออกจาก
  บรรทัดที่กำลังอ่านโดยไม่มีเหตุผล
- **sync scroll ของ side-by-side ใช้ "เทียบก่อนค่อยเซ็ต" ไม่ใช่ธงกันชนที่ปลดใน rAF** — ธงแบบนั้น
  ค้างทันทีที่เบราว์เซอร์หยุดวาด (แท็บพื้นหลัง, หน้าต่างที่ไม่ได้โฟกัส) แล้วสองฝั่งก็เลื่อนหลุดกันถาวร
- **decoration ของ diff สร้างเฉพาะช่วงที่มองเห็น** (ViewPlugin + `view.visibleRanges`) ไม่ใช่
  ทั้งเอกสาร — ไฟล์สองหมื่นบรรทัดต้องไม่จ่ายค่าสร้าง range สองหมื่นอันตอนกาง

## Aug 4, 2026 — v3 ตั๋ว 9 (#11): หน้าแรก + อายุของ server

ตั๋วที่ทำให้ run เลิกเป็นของใช้แล้วทิ้ง และทำให้ server เป็น "บริการเล็ก ๆ" ไม่ใช่ process ที่ค้างข้ามวัน

- **หน้าแรกคือรายการ run ข้ามทุก repo ในไฟล์เดียว** (`src/routes/home-page.tsx` อ่าน `/api/runs`)
  ไม่ใช่รายการต่อ repo — คนอ่านจำไม่ได้ว่า PR ที่อยากกลับไปอ่านอยู่โปรเจกต์ไหน แต่จำเลข PR
  กับชื่อเรื่องได้ · ช่องค้นหาจึงค้นข้ามทุกช่องที่พอจะจำได้ (เลข PR, ชื่อไทย, ชื่อ repo, sha)
- **`/api/runs` บอกด้วยว่า run ไหน "ไฟล์หาย"** (`available`) — registry เป็นไฟล์ที่ไม่มีใครมาเก็บกวาด
  worktree ที่ถูกลบทิ้งจะค้างอยู่ตลอดไป · การรู้ตั้งแต่ก่อนกดดีกว่ากดแล้วไปเจอ error
- **วันที่ใช้ปฏิทิน ค.ศ. โดยตั้งใจ** (`th-TH-u-ca-gregory` ใน `src/lib/run-list.ts`) — default ของ
  `th-TH` เป็น พ.ศ. ซึ่งชนกับปีของ commit/PR ที่ทุกอย่างรอบตัวใช้ ค.ศ. · ของใหม่ในสัปดาห์นี้
  บอกเป็น "วันนี้ / เมื่อวาน / N วันก่อน" เพราะระยะเวลาอ่านง่ายกว่าวันที่ในช่วงนั้น
- **ตรรกะของหน้าแรกถูกดันออกมาเป็นฟังก์ชันล้วน** (`src/lib/run-list.ts` + `test/run-list.test.ts`)
  ด้วยเหตุผลเดียวกับ panel ของตั๋ว 6: สเปกห้ามเทสต์ระดับ component
- **"ว่าง" = ไม่มี request เข้ามา ไม่ใช่ "ไม่มีสาย SSE ค้างอยู่"** (`server/lifecycle.ts`) — ถ้านับสาย
  ที่เปิดค้างว่าใช้งานอยู่ แท็บที่ถูกลืมไว้หนึ่งแท็บจะกันไม่ให้ปิดตลอดไป ซึ่งลบล้างเหตุผลทั้งหมด
  ของการมีตัวจับเวลา · แท็บที่ยังเปิดอยู่ตอน server ปิดขึ้นสถานะ offline แล้วต่อเองใหม่ได้อยู่แล้ว
- **ตัวจับเวลาตั้ง timer ทีเดียวแล้วต่ออายุตอนมันดัง** ไม่ใช่ clear/set ใหม่ทุก request —
  หนึ่งหน้าของ viewer ยิงหลายสิบ request · และ `unref()` ไว้เสมอ: ตัวจับเวลาต้องไม่เป็นเหตุผล
  ให้ process มีชีวิตอยู่ต่อ
- **`scripts/serve.mjs` เป็นทางเข้าเดียวของการเปิด server** — ยิง `/api/health` ก่อนเสมอ เจอแล้ว
  ใช้ต่อ (`reused`), พอร์ตถูกบริการอื่นยึด = บอกให้ชัดแทนที่จะรันทับ · เทสต์ยิงสคริปต์นี้จริง
  ผ่าน `child_process` แล้วเช็คว่า pid ที่ตอบกลับมาคือ process ของเทสต์เอง = ไม่มีการ spawn ตัวที่สอง
- **พอร์ตส่งผ่าน env `LEARN_DIFF_PORT` ไม่ใช่ argv** และ `vite.config.ts` ตั้ง `strictPort: true` —
  `pnpm run dev -- --port N` กลายเป็น `vite -- --port N` ซึ่ง vite เมินแล้วไปเปิดพอร์ตอื่นเงียบ ๆ
  (เจอตอนทดสอบจริง: instance ที่สองแอบไปนั่งพอร์ตถัดไป) การขยับพอร์ตเองคือการสร้าง instance
  ที่สองแบบเงียบ ๆ ซึ่งเป็นสิ่งเดียวที่สคริปต์นี้มีหน้าที่ป้องกัน
- **เช็ค dependency ค้างตอนสั่งรัน ไม่ใช่แค่ตอนติดตั้ง** (hash ของ lockfile ที่
  `node_modules/.learn-diff-deps.json`) — `git pull` ที่เปลี่ยน lockfile ต้องไม่กลายเป็น
  error ประหลาดกลางการอ่าน (user story 37)

## Aug 4, 2026 — v3 ตั๋ว 10 (#12): สับ SKILL.md มาเป็น v3 (จุดตัด)

ตั๋วที่ทำให้ v3 กลายเป็น "ของที่ `/learn-diff` ทำจริง" ไม่ใช่ของที่มีอยู่ข้าง ๆ · หลังตั๋วนี้
ทางออก HTML ของ v2 ไม่มีอยู่แล้ว ทั้งใน SKILL.md และในไฟล์บนดิสก์

- **scope เหลือ PR อย่างเดียว** — ลำดับเดิม (branch vs merge-base → PR → working tree) ถูกถอดทิ้ง
  `commit` = `headRefOid`, `baseCommit` = `git merge-base origin/<base> <head>` และต้อง
  `git fetch origin pull/<N>/head` ก่อนเสมอ ไม่งั้น viewer อ่านโค้ดไม่ได้ (`commit_not_found`)
  · เหตุผลที่ตัดสองสโคปนั้นทิ้งไม่ใช่ "ทำไม่ได้" แต่คือ **ทางออกสองทางแปลว่าของที่จะปรับปรุงทีหลัง
  ต้องทำสองรอบหรือไม่ก็ทำแค่ทางเดียว** (SPEC-v3 → Scope resolution)
- **ไม่มี PR = หยุด ไม่ใช่ถอยไปใช้ working tree เงียบ ๆ** — ข้อความที่ตอบมีสองอย่างเสมอ:
  คำสั่ง `gh pr create --draft --fill` กับข้อเสนอ "สรุปให้ในแชทแทน" (ได้ reconciliation + ภาพรวมระบบ
  แต่ไม่มีหน้าอ่าน/reading list) · การถอยไปอธิบาย working tree คือการคืนปัญหาที่ v3 แก้ไปแล้ว
  (เลขบรรทัดเลื่อนใต้เท้าผู้อ่าน)
- **v2 ถูก *ลบ* ไม่ใช่แค่เลิกอ้างถึง** — `references/html-page.md`, `assets/learn-diff.css`,
  `assets/learn-diff.js` หายไปจาก repo พร้อมกับ **Artifact mode** ทั้งโหมด · เอกสารที่ยังพูดถึงมัน
  (บล็อกลงวันที่ด้านบน, SPEC-v3) เป็น *บันทึกประวัติ* ปล่อยไว้ตามเดิม ไม่มีอันไหนเป็นลิงก์ที่ตายแล้ว
- **เลข Step 0–7 ถูกรักษาไว้เท่าเดิมโดยตั้งใจ** (Step 3 = PM view, Step 4 = triage, Step 5 = generate,
  Step 7 = close out) เพราะบล็อกเก่าใน DEVELOPMENT.md อ้างเลขพวกนี้อยู่หลายที่ · การ resolve PR
  จึงไปอยู่ใน Step 1a ไม่ใช่ Step ใหม่
- **ของใน html-page.md ที่ยังจำเป็นถูกย้ายเข้า SKILL.md ไม่ใช่ไป reference ใหม่** — ลำดับเนื้อหาต่อหน้า
  (index = PM altitude ทั้งก้อน / NN = section / 99 = verify) กับ **ความลึกต่อกล่อง** เป็นของที่ต้องอ่าน
  ทุกครั้งที่ generate อยู่แล้ว การซ่อนไว้ใน reference ที่ต้องกดเข้าไปอ่านคือการเชิญให้ข้าม
  ส่วนกลไก (schema, directive, subset ของ mermaid) ยังอยู่ใน `references/` ตามเดิม
- **Step 5e: ยิง `/api/runs/<id>` แล้ว `warnings` ต้องว่างก่อนบอกผู้ใช้ว่าเสร็จ** — validation ของตั๋ว #9
  จะไม่มีความหมายเลยถ้าไม่มีใครอ่านมันนอกจากผู้อ่าน · agent เป็นคนเดียวที่แก้พิกัดผิดได้ทันที
- **ลำดับตอน generate ถูกกำหนดตายตัว**: สั่ง `serve.mjs --json` → เขียน `run.json` ให้ครบทั้งไฟล์ →
  `register-run.mjs` → **บอก URL** → ค่อยทยอยเขียน `.md` ทีละหน้าจนจบ · `register-run.mjs` อ่าน
  `run.json` เป็น fallback ของ `--commit` / `--base` อยู่แล้ว ไฟล์นั้นจึงต้องมาก่อนเสมอ
  และการบอก URL ก่อนเขียนหน้าคือทั้งหมดของ user story 26
- **ไม่แตะ installer** — ตั๋วนี้ไม่มี dependency ใหม่ `install.sh` / `install.ps1` จึงไม่ถูกแก้
  กฎ UTF-8 with BOM ไม่ถูกใช้รอบนี้ และการยืนยัน `[Parser]::ParseFile` ของตั๋ว 1 ยังค้างอยู่
- **ตรวจแล้วว่าเดินได้จริงทั้งเส้น** ด้วยการทำตาม SKILL.md มือเปล่ากับ PR #1 ของ repo นี้เอง
  (registry ชั่วคราวใน `/tmp`, พอร์ต 5199, ลบทิ้งหลังตรวจ): `warnings: []`, กด node ในไดอะแกรมแล้ว
  panel เปิดโค้ดจริงบรรทัด 15–33 ของ `install-mcp.sh` ที่ commit นั้น, ลบไฟล์ section ออกแล้วหน้าขึ้น
  "รอเขียน" เขียนกลับแล้วกลายเป็นเนื้อหาเองโดยไม่ refresh · ข้อสังเกตที่เจอระหว่างทาง:
  `.sh` ยังไม่มีใน `shared/languages.ts` (`language: null` = plain text) — อ่านได้ครบ แค่ไม่มีสี

## Aug 4, 2026 — v3 ตั๋ว 11 (#13): สรุป v3 — กลับคำอะไร ยอมทิ้งอะไร และห้ามแลกอะไร

บล็อกนี้ไม่ใช่บันทึกงานของตั๋ว แต่เป็น**ที่เดียวที่สรุปเหตุผลของ v3 ทั้งรุ่น** สำหรับคนที่มาต่อ
บล็อกลงวันที่ด้านบนบอกว่า *ทำอะไรไป* — บล็อกนี้บอกว่า *อะไรถูกกลับคำ อะไรถูกยอมทิ้ง
และอะไรห้ามแตะ*

### 1) สองข้อที่ v3 "กลับคำ" ของ v2 — เงื่อนไขเปลี่ยน ไม่ใช่เหตุผลเดิมผิด

การกลับคำสองข้อนี้ถูกจดไว้แบบ **กลับคำ** โดยตั้งใจ ไม่ใช่ลบของเดิมทิ้งแล้วเขียนทับ:
ถ้าวันหนึ่งเงื่อนไขกลับมาเป็นแบบ v2 (เช่นต้องส่ง output ให้คนที่ไม่มี node) เหตุผลของ v2
ยังใช้ตัดสินใจได้ทันทีโดยไม่ต้องคิดใหม่

**ก. mermaid — v2 ปฏิเสธ (29 ก.ค. 2026), v3 รับ (ตั๋ว #6)**

- เหตุผลที่จดไว้ตอนนั้น (ยังถูกทุกตัวอักษรภายใต้เงื่อนไขของ v2): output เป็นไฟล์ HTML ที่เปิดด้วย
  `file://` และ **ห้ามใช้ CDN** — หน้าที่ต้องต่อเน็ตถึงจะมีรูปคือหน้าที่พังในวันที่ host คนอื่นล่ม
  แทนที่ด้วย `.diagram` ที่เป็น HTML/CSS ล้วน · ทางที่เหลืออีกทางคือ **vendor bundle เข้า `assets/`**
  ซึ่งเป็นทางเดียวกับที่ DW-5 ปฏิเสธ highlight.js ไว้ด้วยคำว่า "ใหญ่เกินไป"
- สิ่งที่เปลี่ยนใน v3: มี **viewer app + npm** แล้ว mermaid จึงเป็น dependency ปกติ
  (`viewer/package.json`) **ไม่มี CDN เหมือนเดิม** ข้อห้ามเรื่อง CDN ไม่เคยถูกยกเลิก
- ที่กลับคำคือ *ข้อสรุป* ("ห้ามใช้ mermaid") ไม่ใช่ *กติกา* ("ห้าม CDN") — ระวังอย่าอ่านสลับกัน

**ข. `file://` — v2 ถือเป็น hard requirement, v3 ทิ้ง (SPEC-v3 → Delivery model)**

- เหตุผลของ v2: หน้าที่ generate ออกมาต้อง **double-click แล้วเปิดได้เลย** ไม่ต้องลงอะไร
  ไม่ต้องมี server ไม่ต้องต่อเน็ต และ **zip ส่งให้เพื่อนได้** · ผลที่ตามมาซึ่งจดไว้แล้วในบล็อก
  29 ก.ค.: ห้าม CDN, `fetch` ใช้ไม่ได้บน `file://` จึง **ปฏิเสธ JS availability-polling**
  แล้วใช้ "refresh เอาเอง" เป็น progress แทน, และ `assets/` ถูก **copy** เข้า output dir
  เพื่อให้โฟลเดอร์ย้ายที่ได้
- สิ่งที่เปลี่ยนใน v3: ปัญหาที่ v3 ตั้งใจแก้ (โค้ดจริงต้องมาอยู่ข้างคำอธิบาย, อ่านโค้ดที่ PR
  *ไม่ได้แก้* ได้, หน้างอกเองระหว่าง generate) **ต้องใช้ `fetch` + ES module + การอ่านไฟล์
  ตามที่ขอ** ซึ่งไม่มีอันไหนทำได้บน `file://` เลยสักอัน · ราคาที่ยอมจ่ายอยู่ในข้อ 2 ข้างล่าง
- **markup contract ของ v2 ถูกปลดระวางไปพร้อมกัน ไม่ใช่คนละเรื่อง** — `references/html-page.md`
  + `assets/learn-diff.css` / `.js` มีอยู่เพื่อทำให้ "หน้า HTML ที่เปิดจาก `file://`"
  หน้าตาเหมือนกันทุก run · พอ presentation ย้ายไปอยู่ที่ viewer ทั้งก้อน สัญญานี้ก็ไม่มีอะไรให้ทำ
  (ตั๋ว #12 ลบทิ้งจริงจากดิสก์)

### 2) สิ่งที่ v3 ยอมทิ้ง และทำไมถึงยอมรับได้

| ของที่หายไป | ทำไมยอมรับได้ | ถ้าจะเอากลับ |
|---|---|---|
| **โฟลเดอร์ output ที่พกพาได้** (zip ส่งให้คนอื่น / เปิดออฟไลน์) | คนที่ควรอ่าน run คือคนที่จะ verify PR นั้น ซึ่งมี repo อยู่ในเครื่องอยู่แล้ว · การส่งความเข้าใจต่อไม่ได้ทำด้วยการส่งโฟลเดอร์อยู่แล้ว — verification checklist ที่ paste ลง PR ต่างหากที่เป็นของที่ส่งต่อ | ต้อง build static export แยกอีกทาง = ทางออกที่สอง ซึ่งเป็นสิ่งที่ทั้งสเปกพยายามเลี่ยง |
| **Artifact mode** (หน้าเดียวจบใน Artifact ของ chat client) | มันคือ `file://` ในอีกรูปแบบ (ไม่มี server, ไม่มี fetch) · การเลี้ยงไว้แปลว่าทุกฟีเจอร์ของ viewer ต้องมีเวอร์ชันที่สองที่ทำในนั้นไม่ได้ | ไม่ควรเอากลับ — ถ้าอยากได้ "อ่านง่ายในแชท" ให้ใช้กติกา Tiny diff (สรุปในแชท ไม่มี run) |
| **scope ที่ไม่ใช่ PR** (branch เทียบ merge-base, working tree) | ทั้งหน้าอ่านตั้งอยู่บนสมมติฐานว่า **commit ถูก pin** — เลขบรรทัดใน reading list, `git show` ฝั่ง server, diff colouring · working tree ทำให้ทุกอย่างนี้เลื่อนใต้เท้าผู้อ่าน · ต้นทุนของผู้ใช้คือ `gh pr create --draft --fill` หนึ่งคำสั่ง | ไม่มี PR ยังได้ **สรุปในแชท** (reconciliation + ภาพรวมระบบ ไม่มีเลขบรรทัด) — ทางถอยนี้อยู่ใน SKILL.md แล้ว |
| **อ่านได้โดยไม่ต้องลงอะไร** | แลกกับ node + pnpm ที่ตัวติดตั้งลงให้ตั้งแต่ตอนติดตั้ง skill (user story 36) และ "ไม่มี node = fail ดัง ๆ พร้อมวิธีลง" (38) ไม่ใช่ degrade เงียบ ๆ | — |
| **run เก่าของ v2 ไม่ถูกแปลง** | โฟลเดอร์ HTML เดิมยัง double-click เปิดได้ตลอดไป การเขียนตัวแปลงคือต้นทุนที่จ่ายครั้งเดียวเพื่อของที่ไม่มีใครกลับไปอ่าน | มีตัวอย่างที่แปลงมือแล้วหนึ่งอัน (`viewer/examples/pr-230-etax-link-notify`) ใช้เทียบได้ว่าอะไรหาย |

หมายเหตุ: ของที่ **ยังไม่ทำ** ไม่เหมือนของที่ **ยอมทิ้ง** — comment บนโค้ด, ถามคำถามกลับจากหน้าอ่าน,
การสลับ engine ของไดอะแกรม อยู่ใน SPEC-v3 → Out of Scope เพราะ *ยังไม่ถึงคิว* และสถาปัตยกรรม
ถูกวางไว้ให้ทำได้ (server + CodeMirror decoration + module boundary) — อย่าจดรวมกับตารางข้างบน

### 3) หลักที่รอดข้ามการเขียนใหม่ — ห้ามแลกกับฟีเจอร์ของ viewer

v3 เปลี่ยน **ทางออก** (HTML ไฟล์ → viewer app) ไม่ได้เปลี่ยน **สิ่งที่ skill นี้พยายามทำ**
ทุกข้อข้างล่างมาจาก "Core principles" กับตารางเหตุผลด้านบนของไฟล์นี้ และยังมีผลเต็ม ๆ
ถ้าตั๋วในอนาคตขอแลกข้อไหนออกไปเพื่อฟีเจอร์ของ viewer คำตอบเริ่มต้นคือ **ไม่**:

1. **PM view มาก่อน engineer view เสมอ** — `index.md` คือ PM altitude ทั้งก้อน, box map กับ
   หน้า section อยู่หลัง `::divider[จากตรงนี้ = มุมมองวิศวกร]` · ของใหม่ที่กดได้ (ไดอะแกรม,
   reading list) เป็น *ทางลงไปหาโค้ด* ไม่ใช่เหตุผลให้เอาโค้ดขึ้นมาไว้บนสุด
2. **intent reconciliation มาก่อนคำอธิบายโค้ด** — "ขอแต่ไม่ได้ทำ" กับ "ไม่ได้ขอแต่ทำ" ไม่มีวัน
   โผล่มาเองจาก diff (การหายไปไม่มีเส้นสีแดง) ต่อให้ viewer เก่งแค่ไหนก็ไม่ช่วย
3. **box triage มีกฎแข็ง** (auth/authz, เงิน, migration, การลบข้อมูล, security, ของที่ย้อนไม่ได้,
   CI/CD → whitebox เสมอ) เพราะ agent ที่จัด box มี conflict of interest กับ agent ที่เขียนโค้ด
4. **ห้ามถามคำถามหลอกให้ตอบผิด — ตลอดกาล** (continued influence effect) นี่คือข้อห้ามที่
   load-bearing ที่สุดในไฟล์นี้
5. **คำถามทำนายผลต้องมีบรรทัด "พิสูจน์เอง"** — เปลี่ยนคำตอบจาก "เชื่อ" เป็น "หลักฐาน"
6. **ceremony ต้องสเกลตามขนาด diff** — diff เล็กไม่ควรได้ server กับหน้าอ่าน (กฎ Tiny ยังอยู่
   ใน SKILL.md) skill ที่ไม่มีใครเรียกใช้มีค่าเป็นศูนย์
7. **concept ledger เป็นไฟล์ append-only โง่ ๆ** บันทึก *การเคยเจอ* ไม่ใช่ *ความเชี่ยวชาญ* —
   knowledge model เต็มรูปแบบถูก defer ไว้แล้วด้วยเหตุผลที่ยังไม่เปลี่ยน
8. **test ที่มีอยู่แล้วคือสื่อการสอนชั้นหนึ่ง** — quote ของจริงจาก reading list ดีกว่าแต่งตัวอย่างเอง
   และ skill ไม่แต่ง test ใหม่เพื่อใช้อธิบาย
9. **ผลลัพธ์ที่แย่ที่สุดคือความล้มเหลวที่เงียบ** — dead click, พิกัดที่ resolve ไม่ได้, live update
   ที่ตายเงียบ ต้องดังเสมอ (warning ฝั่ง server, กล่องแดง directive ที่ไม่รู้จัก, สถานะสายบน header)
   หลักเดียวกันนี้คือที่มาของ "เลือก mermaid text แทน JSON schema ที่คิดขึ้นเอง" และ
   "markdown แทน MDX": **กันความแปรปรวนออกจากทางที่ต้องเดินทุกวัน**

## Field feedback — v3 acceptance run (Aug 4, 2026, ตั๋ว 12 / #14)

รอบทดสอบรับงานตาม SPEC-v3 → Acceptance test สองขั้นที่สเปกกำหนด: **(1)** สร้าง `pr-230` ใหม่ด้วย v3 แล้วเทียบกับหน้า
HTML ของ v2 ซึ่งเป็นของที่รู้จักดีอยู่แล้ว **(2)** ยิงใส่ PR ที่ยังไม่มีใครอ่าน — `dobybot/dobybot-monorepo#229`
(GDPR webhook ของ MyShopline ใน dobysync, 16 ไฟล์ +1,018) ซึ่ง agent ที่อธิบายไม่เคยเห็นโค้ดนั้นมาก่อน
· แล้วเพิ่ม **(3) reader test** — ให้ session ใหม่ที่ไม่เคยเห็น PR นี้อ่านผลลัพธ์แล้วสอบ เพื่อไม่ให้
คำตัดสินว่า "สอนได้จริงไหม" มาจากปากคนเขียนเอง (ข้อ 8)

ทั้งสอง run เขียนด้วยการเดินตาม SKILL.md v3 ทีละขั้นด้วยมือ (สั่ง `/learn-diff` จาก session ใหม่ยังไม่ได้ทดสอบ
— symlink `~/.claude/skills/learn-diff` ยังชี้ไป checkout ที่ยังเป็น v2 อยู่ระหว่างที่ v3 ยังไม่ merge ·
SKILL.md มีทางถอย "ถ้า path นั้นไม่มีจริงให้ใช้โฟลเดอร์ skill ตรง ๆ" อยู่แล้วและใช้ได้จริง)

### ผลรวม: v3 ผ่าน แต่ไม่ใช่เพราะเหตุผลที่คาดไว้ตอนเขียนสเปก

**สิ่งที่ตรวจแล้วว่าทำงานจริงกับ PR จริง** (ไม่ใช่ fixture): 2 run · 9 + 7 หน้า · ไดอะแกรม 11 รูปผ่าน subset
ทั้งหมด · reading list 13 ชุด 68 span (เฉลี่ย 33 บรรทัด/span) resolve ได้ครบที่ commit ที่ pin ไว้ ·
`warnings: []` ทั้งสอง run · กด node ในไดอะแกรมแล้วเปิดโค้ดจริงพร้อมเลขบรรทัดที่ตรงกับ commit ·
box map, `:read`, `:file` เปิด panel เดียวกันหมด · กางทั้งไฟล์ + สลับ side-by-side ได้ ·
เปลี่ยน section แล้ว panel ไม่ปิด · แก้ไฟล์ระหว่างที่หน้าเปิดอยู่แล้วเนื้อหาอัปเดตเองโดยไม่ reload

1. **ของที่มีค่าที่สุดใน v3 คือ span ที่ `kind: "context"` — ไม่ใช่ไดอะแกรมและไม่ใช่ตัวแสดง diff.**
   ใน PR #229 สิ่งที่ทำให้ทั้ง PR "เข้าใจได้" คือโค้ด **ที่ PR ไม่ได้แตะ** สองช่วง: `SHARED_APPS` /
   `TENANT_APPS` ใน `core/settings.py` กับ `TenantMiddleware.process_request` — ถ้าไม่อ่านสองอันนี้
   การย้ายโมเดลข้ามแอปจะดูเหมือนการจัดระเบียบโค้ด ทั้งที่มันคือการแก้บั๊กที่ทำให้ webhook ตอบ 500
   · สัดส่วน context span ที่ใช้จริง: 8/41 (pr-230) และ 4/27 (pr-229) — ราว 15–20% ถือเป็นตัวเลข
   ตั้งต้นที่สมเหตุสมผล ถ้า run ไหนมี 0 แปลว่ายังไม่ได้ถามว่า "ต้องรู้อะไรก่อนถึงจะอ่าน diff รู้เรื่อง"
   · **แก้คำจากรอบแรกของบล็อกนี้**: ตอนแรกเขียนไว้ว่า "นี่คือของที่ diff viewer ให้ไม่ได้ในเชิงโครงสร้าง"
   — reader test ในข้อ 8 หักล้างครึ่งหนึ่งของประโยคนั้น ผู้อ่านที่ได้ diff อย่างเดียว**ตอบถูก**
   ว่าโมเดลต้องอยู่ `logs` และทำไม เพราะ docstring ของโมเดล (ซึ่งอยู่ใน diff) เล่าไว้ครบ
   แต่ประกาศเองว่า "ยืนยันไม่ได้ ไม่เคยเห็น `settings.py`" · สิ่งที่ context span ให้จริงจึงคือ
   **การยืนยัน ไม่ใช่ข้อมูล** — และนั่นยังพอเป็นเหตุผลให้ reading list อยู่ต่อ เพราะคำอธิบายที่
   ผู้อ่านตรวจเองไม่ได้ ก็คือคำอธิบายที่ต้องเชื่อ ซึ่งเป็นสิ่งเดียวกับที่ v1 ตั้งใจกำจัด
2. **v3 กับ v2 อธิบาย diff คนละก้อนของ PR เดียวกัน — และนี่ไม่ใช่บั๊ก แต่ต้องรู้.**
   v3 pin `merge-base(origin/<base>, head)` ซึ่ง**ขยับตาม base branch** ส่วนหน้า v2 ของ pr-230 ถูกสร้าง
   ตอนที่ `uat` ยังไม่ได้รับ DBT-255/DBT-288 เข้าไป · ผลคือหน้า v2 มีหัวข้อ "🚨 จุดที่เปลี่ยนพฤติกรรม
   ทั้งที่ตั๋วบอกว่าจะไม่เปลี่ยน" (เรื่อง `ETAX_BYPASS_CUTOFF_DATE_CHECK` ที่เดิมมีผลเฉพาะ staff)
   ซึ่ง **ไม่อยู่ใน scope ของ v3 อีกแล้ว** เพราะ commit นั้นเข้า uat ไปก่อนแล้ว
   → สร้าง run ของ PR เดิมซ้ำอีกเดือนหน้าจะได้เนื้อหาน้อยลงเรื่อย ๆ และนั่นถูกต้องตามนิยาม
   แต่ header ปัจจุบันโชว์แค่ head sha ผู้อ่านจึงไม่มีทางรู้ว่ากำลังอ่าน diff เทียบกับอะไร (→ ตั๋วต่อ)
3. **สิ่งที่หายไปจริง ๆ เทียบกับ v2 คือ "ความลึกของการวิเคราะห์" ไม่ใช่ความสามารถของ format.**
   รอบแรกของ pr-230 v3 ตกสามอย่างที่หน้า v2 มี: (ก) ช่องว่างว่า **ออเดอร์ที่ถูกปัดตกที่ด่าน eligibility
   ไม่เขียน log เลย** ซึ่งเป็นหลุมของ rollout (ข) รายการ "ที่ยังไม่มีเทสต์" (ค) การชี้ 🚨 ของที่ไม่ได้ขอ
   **ในหน้า section** ไม่ใช่แค่ในตาราง reconciliation · เติมกลับเข้าไปได้โดยไม่ต้องแก้ format อะไรเลย
   → **สาเหตุคือ budget**: v3 ดูดแรงไปกับการหาพิกัดบรรทัดให้ถูก (68 span = grep 68 ครั้ง) และ
   โครง JSON · SKILL.md ยังไม่มีที่ไหนบอกว่าหน้า section ยังติดค้าง "อะไรที่พัง/ไม่ถูกเทสต์/ไม่ทิ้งร่องรอย"
   อยู่ (→ ตั๋วต่อ) · หน้า v2 ยังไปไกลกว่าตรงที่ query prod replica มาวัดขนาดผลกระทบ — v3 ไม่ได้ห้าม
   แต่ก็ไม่มีอะไรกระตุ้นให้ทำ
4. **validator ที่ฝั่ง server ยังไม่ครอบไดอะแกรม — ซึ่งเป็นช่องเดียวที่ Step 5e โกหกได้.**
   ระหว่าง run แรกเขียน `ASSIGN --> DB[(บันทึกลงฐานข้อมูล)]` ซึ่งหลุด subset · `warnings` ตอบ `[]`
   (self-check ผ่าน) และรูปยังวาดออกมา — ผู้อ่านเห็นแถบแดงคาดหัวรูป ส่วน agent ที่รายงานว่า "เสร็จแล้ว"
   ไม่มีทางรู้ · ตรวจเจอเพราะเอา `parseDiagram` มารันเองนอกเบราว์เซอร์ (→ ตั๋วต่อ)
   หลักข้อ 9 ("ความล้มเหลวที่เงียบต้องดัง") บอกว่าอันนี้ต้องกลายเป็น warning
5. **ผลข้างเคียงที่ดีที่ไม่ได้ตั้งใจ: การต้องเขียนพิกัดทำให้ agent ต้องเปิดโค้ดจริงทุกช่วงที่อ้างถึง.**
   เขียน "ไฟล์นี้ทำ X" แบบลอย ๆ ยังทำได้ใน prose แต่ span ที่ผิดจะโดน validator ตบทันที
   → มีแรงกดดันเชิงโครงสร้างให้คำอธิบายผูกกับโค้ดจริง ซึ่ง v2 ไม่มี (v2 paste snippet เองได้ตามใจ)
6. **ต้นทุน byte ลดลงจริงตามที่สเปกอ้าง**: pr-230 v2 = HTML 191.6 KB ที่ agent เขียนเอง ·
   pr-230 v3 = 111.3 KB (ในนั้นเป็น `run.json` 33.5 KB) ทั้งที่เปิดทางให้อ่านโค้ดจริงได้ ~1,350 บรรทัด
   ซึ่ง v2 ต้องเลือก paste เองทีละก้อน
7. **ของที่เจอตอนอ่านจริงและควรแก้** (แต่ละข้อเปิดเป็นตั๋วแล้ว — ดูท้ายบล็อก):
   ไดอะแกรมภาพรวม 19 กล่องสูง 2,026 px (ต้องเลื่อนจอถึงจะเห็นทั้งระบบ = ขัดกับเหตุผลที่มีไดอะแกรม) ·
   ความกว้าง panel ไม่คำนวณใหม่เมื่อผู้ใช้ย่อ/ขยายหน้าต่าง (เปิดมาที่ 360 px บนจอ 1500 px จนกว่าจะ reload) ·
   หน้า section โชว์ชื่อหัวข้อซ้ำสองครั้ง (viewer render จาก `run.json` + `#` ใน markdown) ·
   หน้าแรกเรียกชื่อ repo จากชื่อโฟลเดอร์ ทำให้ worktree ของ repo เดียวกันดูเป็นคนละ repo
8. **"reading path สอนได้จริงไหม" ถูกวัดด้วยผู้อ่านที่ไม่เคยเห็น PR นี้ — ไม่ใช่ด้วยคำรับรองของคนเขียน.**
   รอบแรกของบล็อกนี้ยอมรับตรง ๆ ว่าคนตัดสินคือ agent ที่เขียน reading path เอง · ตอนนี้แก้แล้วด้วย
   **reader test 4 arm** — แต่ละ arm คือ session ใหม่ (`claude -p`, model เดียวกัน, เครื่องมือจำกัดที่
   Read/Glob/Grep, ห้ามอ่านนอกโฟลเดอร์ของตัวเอง) ที่ไม่เคยเห็น PR #229 และไม่รู้จัก codebase นี้
   ทุก arm ทำข้อสอบชุดเดียวกัน 8 ข้อ แล้วตรวจโดยเทียบ**โค้ดจริงที่ commit ที่ pin ไว้** ไม่ใช่เทียบกับ
   หน้าคำอธิบาย · ของทั้งหมด (ชุดคำถาม, เฉลย, คำตอบดิบทั้ง 4 ชุด, เกณฑ์ตรวจ, สคริปต์สร้างชุดข้อมูล)
   อยู่ที่ `<dobybot-monorepo>/.learn-diff/_reader-test-pr229/`

   | arm | ผู้อ่านได้อะไร | คะแนน | เวลา/turn | เข้าใจ (ประเมินตัวเอง) |
   |---|---|---|---|---|
   | A2 | หน้า learn-diff v3 + reading list พร้อมโค้ด | **7/7** | 148 s / 15 | 80% |
   | B | PR description + diff ทั้งก้อน (= อ่าน PR บน GitHub) | **5/7** | 122 s / 5 | 70% |
   | C | diff + source ทั้ง service ที่ commit เดียวกัน เปิด/grep ได้ตามใจ | **7/7** | 180 s / 19 | 80% |

   (arm A คือรอบแรกของ A2 — ตารางไม่แสดงเพราะชุดข้อมูลที่ส่งให้มีบั๊กของ harness เอง คือ box map
   ถูก render ผิดจนอ่านไม่ได้ · จึงแก้ harness แล้วยิงใหม่เป็น A2 · คำตอบทั้งสองรอบเก็บไว้ทั้งคู่
   และข้อสรุปสำคัญตรงกันทุกข้อ ซึ่งเป็นการทวนซ้ำที่มีค่าในตัวมันเอง)

   **(ก) reading path ชนะ diff ที่ "ยืนยันได้เอง" ไม่ใช่ที่ "รู้ข้อสรุป".** arm B รู้ข้อสรุปเกือบครบ
   รวมข้อที่สำคัญที่สุดของ PR (handler ปิดงานโดยไม่ลบข้อมูล) — **ซึ่งหักล้างประโยคเดิมในบล็อกนี้ที่ว่า
   "ไม่มีทางโผล่มาจากการอ่าน diff เฉย ๆ"** · แต่ arm B ตอบ Q5 ไม่ได้เลย (บรรทัดที่ต้องใช้อยู่นอก hunk)
   และประกาศเองว่าอีก 2 ข้อ "เชื่อเพราะ docstring บอก ไม่เคยเห็น `settings.py`/`middlewares.py`"
   **(ข) reading path ไม่ชนะการให้ repo ทั้งชุด** — arm C ตอบได้เท่ากันหรือลึกกว่า (จับได้ว่า header จริง
   ชื่อ `client_id` ไม่ใช่ `Client-Id` และ endpoint ตอบ 200 เสมอจึงใช้ status code ตัดสินไม่ได้)
   ด้วยเวลาและต้นทุนใกล้เคียงกัน · ข้อได้เปรียบสำหรับ**คน** (คนอ่าน repo ทั้ง service ใน 3 นาทีไม่ได้)
   การทดสอบนี้ตอบไม่ได้ เพราะผู้อ่านทั้งหมดเป็น AI
   **(ค) context span คุ้ม แต่ไม่เท่ากันทุกอัน** — arm A กับ A2 สรุปตรงกันโดยไม่ได้เห็นคำตอบของกันและกันว่า
   context ที่เป็น "**กฎของระบบที่โค้ดใหม่ต้องเชื่อฟัง**" (SHARED/TENANT_APPS, `process_request`, ด่าน HMAC)
   คุ้มเสมอ ส่วน context ที่เป็น "**ฟังก์ชันกลางที่ถูกเรียก**" (`utils/cloudtasks.py:24-60`) แค่ทำให้ยาวขึ้น
   → กฎนี้ควรเข้า SKILL.md (→ #22)
   **(ง) ผู้อ่านจับผิดเอกสารได้ในสิ่งที่ validator จับไม่ได้** — `rl-routing` ยก `settings.py:44-90` มาให้ดู
   แต่ prose สร้างข้อสรุปทั้งชุดบน `DATABASE_ROUTERS` ซึ่งอยู่บรรทัด 124 **นอกช่วงที่ยกมา** (จับได้ทั้ง A และ A2) ·
   `05-operator.md` เขียน "ซ้ำกันสองที่" / "สามที่" / ตาราง 4 แถว ในหน้าเดียว · `99-verify.md` Q1
   ตั้งโจทย์ด้วย `customers/redact` แต่เฉลยให้เหตุผลด้วย `merchants/redact` · ทั้งหมดนี้ `warnings: []`
   → **Step 5e ที่เช็คแต่ `warnings` ว่าง ไม่ใช่การตรวจงาน** (→ #23) · ตรวจซ้ำแล้วด้วยการรัน
   viewer กับ registry ชั่วคราวแล้วยิง `/api/runs/pr-229-shopline-gdpr-webhook` — ตอบ `warnings: []` จริง

   **ยังไม่ได้วัด:** ผู้อ่านเป็น AI ไม่ใช่คน · reading list ถูกส่งเป็นไฟล์ ไม่ใช่ panel ในเบราว์เซอร์
   (การกด การกางทั้งไฟล์ side-by-side ไม่ถูกวัด) · และคำถามที่ต้องถามทีมที่บอร์ด DW ยังเหมือนเดิม:
   **ผู้อ่านจริงกด reading list ไหม** — ข้อ (ข) แปลว่าถ้าคำตอบคือไม่ นี่คือ candidate แรกที่ต้องรื้อ

### สิ่งที่ยังไม่เปลี่ยนหลังรอบนี้

หลักทั้ง 9 ข้อของบล็อกก่อนหน้ายังยืนครบ · โครง PM-view-first ทำงานได้ดีเป็นพิเศษกับ PR #229 ที่
คนอ่านไม่รู้จัก domain (GDPR ของ MyShopline) — ตาราง 3 topic กับไดอะแกรมภาพรวมพาไปถึง
"ทำไมต้องมี" ก่อนเจอ django-tenants · และ reconciliation จับของจริงได้ทั้งสอง run
(pr-230: #223/#227 ยังไม่ทำ + log ของอีเมลเส้นเดิมเปลี่ยนรูป · pr-229: **handler ปิดงานเป็น
`completed` โดยไม่ได้ลบข้อมูลจริง** ซึ่งเป็นข้อที่สำคัญที่สุดของ PR นั้น) · หมายเหตุ: ตอนแรกเขียนต่อท้ายว่า
ข้อหลัง "ไม่มีทางโผล่มาจากการอ่าน diff เฉย ๆ" — reader test ข้อ 8 หักล้างแล้ว ผู้อ่านที่ได้ diff อย่างเดียว
เห็นข้อนี้เองภายใน 5 turn · ค่าของ reconciliation คือการ**บังคับให้ถาม**ทุกครั้ง ไม่ใช่การผูกขาดข้อสรุป

### ตั๋วที่เปิดต่อจากรอบนี้

`dobybot/dev-support` #15 (subset ไดอะแกรมต้องเป็น warning ฝั่ง server) · #16 (SKILL.md: หน้า section
ต้องตอบ "อะไรพัง/ไม่ถูกเทสต์/ไม่ทิ้งร่องรอย") · #17 (header ต้องบอก base commit ด้วย) ·
#18 (panel width ไม่คำนวณใหม่ตอน resize) · #19 (ชื่อหัวข้อซ้ำสองครั้งในหน้า section) ·
#20 (ไดอะแกรม TB สูงเกินจอ) · #21 (หน้าแรกแยก worktree เป็นคนละ repo)

จาก reader test (ข้อ 8): #22 (กฎการเลือก context span + span ต้องครอบบรรทัดที่ prose อ้าง) ·
#23 (Step 5e: `warnings` ว่าง ไม่ใช่การตรวจงาน) · #24 (เก็บ reader test ไว้เป็นเครื่องมือวัดถาวร) ·
#25 (`serve.mjs --stop` เล็งจากพอร์ตอย่างเดียว เผลอปิด instance อื่นได้)

**ของที่จงใจไม่แก้ในรอบนี้**: บั๊กเนื้อหา 3 จุดใน run `pr-229-shopline-gdpr-webhook` (ข้อ 8 ง)
ถูกปล่อยไว้ตามเดิม เพราะมันคือหลักฐานของ #23 และเป็นสิ่งที่ผู้อ่านทั้ง 4 คนอ่านจริง
ถ้าแก้ ตัวอย่างกับคำตอบดิบใน `_reader-test-pr229/` จะไม่ตรงกันอีกต่อไป

## Aug 6, 2026 — viewer polish batch (#17, #19, #27, #28, #29)

แก้ 5 ตั๋วเล็กฝั่ง viewer ในรอบเดียว การตัดสินใจที่มีผลต่อไป:

- **#19 — h1 ซ้ำ: เลือกทาง ค (viewer กลืน + เอกสารห้าม)** ตามที่ตั๋วแนะนำเอง ·
  `src/lib/strip-duplicate-h1.ts` เป็นฟังก์ชันล้วน (มีเทสต์ `test/strip-duplicate-h1.test.ts`)
  ตัดเฉพาะ h1 **บรรทัดแรก** (ข้ามบรรทัดว่างนำหน้า) ที่ข้อความ normalize ช่องว่างแล้ว**ตรงกับ
  `section.title` เป๊ะ** — ไม่ตรง = ไม่แตะ · ใช้กับทุกหน้าใน SectionPage (index/verify เดินทางเดียวกัน)
  · ห้ามย้ายไปทำใน Prose/remark: Prose ไม่รู้จัก section.title
- **#17 — header โชว์ `base…head`** (และหน้าแรกด้วย) ผ่าน `formatCommitRange()` ใน
  `src/lib/run-list.ts` · ลิงก์ไป GitHub compare เดาจาก `pr.url` เฉพาะเมื่อ url มีรูป `/pull/N`
  ไม่ใช่ = ข้อความเฉย ๆ · run เก่าที่ไม่มี `baseCommit` ขึ้น head เดียว + โน้ตเหลือง
  "ไม่ได้ pin base — เทียบ diff ไม่ได้" (ข้อความเดียวกับการ์ดใน panel)
- **#27 — nav ซ้ายพับได้** state อยู่ที่ RunLayout (รอดข้าม section เอง) + localStorage
  `learn-diff:nav-collapsed` · พับแล้วเหลือ rail `w-8` ที่มีปุ่มกางกลับ ไม่หายทั้งแถบ ·
  **จงใจไม่ทำ**: auto-collapse ตอน panel เปิด กับ keyboard shortcut (ตั๋วบอกว่ายังไม่ตัดสินใจ)
- **#28 — ชื่อ section ยาวตัดที่ 2 บรรทัด** (`line-clamp-2`, ไม่ใส่ `break-words` —
  ห้ามหั่นกลางคำ, `lang="th"` ใน index.html ทำให้ไทยแบ่งตามขอบคำอยู่แล้ว) ·
  NavLink เปลี่ยนเป็น `items-start` ให้ badge "รอเขียน" เกาะบรรทัดแรก · hover เห็นชื่อเต็มผ่าน `title`
- **#29 — สี +N/−N ใน subtitle: เลือกทาง viewer-side pattern highlight** (ตาม triage;
  ตั๋วเอนไปทาง structured diffstat field ซึ่งยังเปิดไว้เป็น follow-up) ·
  `remarkDiffstatColors` ใน `src/lib/remark-learn-diff.ts` ทาสีก็ต่อเมื่อสตริงเดียวกันมี
  **ทั้ง + และ −** (คู่แบบ GitHub) กัน false positive · เปิดเฉพาะ subtitle ผ่าน prop
  `diffstat` ของ InlineMd — **ห้ามเปิดใน Prose/ตาราง**

## Aug 6, 2026 — viewer fixes (#18, #30)

- **#18 — ความกว้าง panel หายถาวรหลังเปิดในจอแคบ**: root cause คือ `readStoredWidth`
  clamp ค่าตอนอ่านจาก localStorage ด้วย viewport ณ ตอนโหลด — เปิดในหน้าต่าง ~800px
  ทำให้ 760 กลายเป็น 360 ใน state ถาวร (localStorage ยังจำ 760 อยู่ reload จึงหาย) ·
  แก้โดยให้ `readStoredWidth(store)` คืน**ค่าดิบ** (แค่ sanitize เป็น DEFAULT ถ้าไม่ใช่ตัวเลข)
  แล้ว clamp เฉพาะตอนแสดงผล (`clampPanelWidth(desiredWidth, viewportWidth)` ใน hook
  ซึ่งมี resize listener อยู่แล้ว) — **อย่ากลับไป clamp ตอนอ่าน**
- **#30 — อ่านเต็มหน้าจอ: เลือก app-level layout ไม่ใช่ browser Fullscreen API** เพราะ
  (ก) ข้อบังคับ layout ของ panel คือต้องเป็น flex sibling ห้าม fixed/absolute
  (ข) Fullscreen API ยึด Esc และซ่อน chrome ของ browser ขัดกับ Esc-to-exit ที่ต้องการ ·
  ทำโดยซ่อนคอลัมน์ sidebar+เนื้อหา (`hidden` ใน run-layout) แล้ว panel ยืด `flex-1` เอง ·
  state `fullscreen` อยู่ใน useReadingPanel (รอดข้าม section) แต่**ไม่จำลง localStorage**
  (ชั่วคราวเหมือน `open`) · `desiredWidth` ไม่ถูกแตะ — ออกจากเต็มหน้าจอได้ความกว้างเดิมคืนเอง ·
  ลำดับ Esc: CodeMirror (defaultPrevented) → ออกจากเต็มหน้าจอ → ปิด panel ·
  `close()` และการเปลี่ยน run รีเซ็ต fullscreen เป็น false
- **#31 — dark mode toggle**: preference เป็น app-global (`localStorage['learn-diff:theme']`,
  ค่า `light|dark|system`, default `system`) ไม่ใช่ต่อ run — เป็นค่าของ "ผู้อ่าน" ·
  แหล่งความจริงยังเป็น class `.dark` บน `<html>` (useDarkMode() เฝ้าอยู่แล้ว mermaid/CodeMirror
  จึง re-render เอง) · `src/lib/theme-preference.ts` เป็นเจ้าของ logic ตั้ง class ·
  **inline script ใน index.html ซ้ำ logic โดยจงใจ** (import TS ไม่ได้ ต้องรันก่อน React mount
  กันจอวาบขาว) — แก้ key/logic ต้องแก้สองที่ให้ตรงกัน · UI เป็นปุ่มเดียววน light→dark→system
  (`src/components/theme-toggle.tsx` — segmented control 3 ปุ่มถูกตัด: หนักเกินสำหรับ header)
  วางที่ header หน้าแรกและแถวหัวเรื่องของ RunLayout (ไม่วางใน aside เพราะพับได้แล้วจาก #27)
- **#32 — box map ตกจอเมื่อ path ยาว**: เปลี่ยนเป็น `table-fixed` + กำหนดความกว้างที่ `<th>`
  (กล่อง `w-24`, เหตุผล `w-[30%]`, โค้ด `w-28`, ส่วน = ที่เหลือ) และถอด `overflow-x-auto` —
  คอลัมน์ "โค้ด" อยู่ในจอเสมอ · บรรทัด files ใช้ `break-all` (path ไม่มีจุดหักตามคำ)
  ชื่อ section ใช้ `break-words` · **จงใจไม่ทำ** truncate+ellipsis ที่ files — ซ่อนว่ากล่อง
  ครอบไฟล์ไหน (root cause path ติดกันไม่มีตัวคั่นเป็นของ #33 แยกไป)

## Aug 6, 2026 — content-quality batch (#33, #16, #22, #23)

- **#33 — boxMap ไม่มี field spec ในเอกสาร ทำให้ agent เดา schema เอง** (`what` + `files`
  เป็น array → ลิงก์ไม่มีข้อความ + path ต่อกันไม่มีตัวคั่น) · แก้สามชั้น:
  (1) `content-format.md` ระบุ field spec ของ `boxMap[]` เต็มรูปแบบเหมือน `reconciliation[]`
  (2) **`files` รับ `string | string[]`** — array ให้ viewer join ด้วย `' · '`
  (`box-map.tsx`) · เลือก widen แทน string-only เพราะ run เก่าที่พังแบบ array จะหายเอง
  ครึ่งหนึ่ง (title ยังต้อง regenerate)
  (3) warning ใหม่ **`box_map_row_invalid`** ใน `server/validate.ts`: แถวที่ไม่มี `id`/`title`
  เป็น string ไม่ว่าง หรือมี key นอก contract (เช่น `what`) — key list อยู่ใน validate.ts
  ต้องอัปเดตคู่กับ `BoxMapRow` ใน types.ts ถ้าเพิ่ม field ใหม่ ไม่งั้น field ถูกกฎจะโดนเตือน
- **#16 — "ช่องว่างที่เหลืออยู่" บังคับทุกหน้า grey/whitebox** (Step 5c): ต้องตอบ
  fail-เงียบ / ไม่มีเทสต์ / logic ซ้ำ อย่างน้อยหนึ่งข้อ · whitebox ต้อง flag unrequested change
  ในหน้าตัวเองด้วย `:::note{type="risk"}` (คน landing ที่ URL ของ section ไม่เห็นตาราง
  reconciliation บน index) · "ไม่มีช่องว่าง" ตอบได้แต่ต้องเขียนว่าตรวจแล้ว —
  ที่มา: v3 acceptance run ที่ budget-squeeze ทำให้หน้า section ตัดเรื่องพวกนี้ทิ้งเงียบ ๆ
- **#22 — กฎเลือก span จาก reader test** เขียนลงทั้ง SKILL.md (5d) และ content-format.md
  (วิธีเขียน readingLists) ให้ตรงกัน: เลือก context span ด้วย "โค้ดใหม่ต้องเคารพกฎอะไรของระบบ"
  ไม่ใช่ "เรียกฟังก์ชันไหน" · prose อ้างอะไรเป็นหลักฐาน span ต้องครอบบรรทัดนั้นจริง
  (เพิ่ม span สั้นดีกว่าถ่างช่วง) · ตัวเลขใน prose ต้องนับได้จาก span ไม่งั้นตัดทิ้ง
- **#23 — Step 5e กลายเป็นสองรอบ**: รอบ 1 = curl warnings (glossed ชัดว่า `warnings: []`
  แปลว่าพิกัด resolve ได้ ไม่ใช่เนื้อหาถูก) · รอบ 2 = อ่านทวนทุกหน้าแบบผู้อ่าน เช็ค 4 ข้อ
  (ตัวเลขในหน้าตรงกัน, หัวข้อตรงเนื้อหา, โจทย์-เฉลยใน 99-verify เรื่องเดียวกัน, หลักฐานมี span)
  — จำกัดที่ 4 ข้อให้สเกลตามขนาด run · **ทางเลือก sub-agent reviewer จงใจไม่ทำ**
  ตั๋วเองโยนไป #24 เพราะแพงกว่า

## Aug 6, 2026 — batch fixes (#15, #20, #21, #25)

- **#15 — `diagram_out_of_subset` เป็น warning ฝั่ง API แล้ว**: `collectWarnings()` parse
  ทุกไดอะแกรมครั้งเดียวต่อ section (ใช้ผลทั้ง violations และรายชื่อ node) แล้วรายงาน
  violation ทุกอันเป็น warning `where: <section>:<line>` **ไม่รอ complete** — แถบแดงบนรูป
  กับ `warnings: []` ที่ขัดกันคือของที่ตั๋วนี้ปิด · parseDiagram ไม่ throw — source ที่อ่านไม่ออกเลย
  ก็โผล่เป็น violations จึงใช้ code เดียว ไม่มี `diagram_parse_failed` แยก
- **#20 — เพดานไดอะแกรมภาพรวมเปลี่ยนจากนับกล่องเป็นนับ "ชั้น"** (~8–10 ชั้นสำหรับ TB บน
  index; ~20 กล่องเหลือเป็นเพดานรองต่อรูป) + กฎแบ่งระดับ: index วาดหยาบระดับ subsystem
  แล้ว detail ไปอยู่หน้า section · **จงใจไม่ทำปุ่ม fit-to-screen ฝั่ง viewer** — auto-shrink
  เคยถูกปฏิเสธในตั๋ว #6 (ย่อแล้วอ่านไม่ออก) ถ้า guidance ไม่พอค่อยเปิด issue ปุ่ม zoom
  แบบ opt-in แยกต่างหาก
- **#21 — registry มี `repoName` (optional)**: `register-run.mjs` ถาม
  `git rev-parse --path-format=absolute --git-common-dir` ครั้งเดียวตอนลงทะเบียนแล้วเก็บ
  basename ของ repo หลัก — worktree จึงโชว์ชื่อ repo จริง ไม่ใช่ชื่อ branch · ฝั่งอ่านใช้
  `displayRepoName()` ใน `src/lib/run-list.ts` (fallback ไป basename สำหรับ entry เก่า —
  field นี้ต้อง optional ตลอดไป) · หน้าแรกโชว์ชื่อ worktree กำกับเมื่อต่างกัน
- **#25 — `serve.mjs --stop` เลิกปิดผิดตัวเงียบ ๆ**: health มี field `home`
  (LEARN_DIFF_HOME ที่ resolve แล้ว) · --stop เทียบ home ก่อนปิด ไม่ตรง = ปฏิเสธพร้อมบอก
  ทั้งสอง home / พอร์ต / ที่มาของพอร์ต (`--port` | `LEARN_DIFF_PORT` | `default`) เว้นแต่
  `--force` · server เก่าที่ไม่มี `home` = ทำแบบเดิม (ship คู่กันผ่าน git pull)

## Aug 6, 2026 — #34: ข้อความใน node ของ mermaid ถูกตัด (เกิดบางเครื่อง)

ต้นเหตุ: `FONT_STACK` ของไดอะแกรมอ้างฟอนต์ที่**ไม่ได้ bundle มากับแอปเลย** — บน macOS
`system-ui` ไม่มี glyph ไทย เบราว์เซอร์ตกไปใช้ฟอนต์ที่ติดตั้งในเครื่อง (Thonburi / Noto Sans
Thai / Sarabun แล้วแต่เครื่อง) ซึ่ง metric ไม่เท่ากัน → ความกว้างที่ mermaid วัดไม่ตรงกับที่วาดจริง
เครื่องหนึ่งจึงเป็นอีกเครื่องไม่เป็น

ทางแก้ (ทำคู่กันตามที่ตั๋วเสนอ ข้อ 1+2):

- **bundle `@fontsource/noto-sans-thai`** (npm ไม่ใช่ CDN — ไม่ชนกติกา "ห้าม CDN") import
  น้ำหนัก 400–700 ใน `viewer/src/index.css` และตั้ง `--font-sans` ใน `@theme` ให้ทั้งแอป
  ใช้ตัวเดียวกับไดอะแกรม · `FONT_STACK` ใน `engine-mermaid.ts` เอา "Noto Sans Thai" ขึ้นนำ
  stack — **สองที่นี้ต้องแก้คู่กันเสมอ**
- **`ensureFontsLoaded()` ใน `engine-mermaid.ts`** ถูก await ก่อน `mermaid.render()` ทุกครั้ง —
  บังคับ `document.fonts.load()` glyph ไทย+ละติน (ปกติ+หนา) แล้วรอ `fonts.ready` เพราะ
  browser lazy-load ฟอนต์จนกว่าจะมีข้อความใช้จริง ถ้าไม่รอ mermaid จะวัดด้วย fallback ·
  โหลดพัง = กลืนเงียบแล้ววาดต่อ (ยอมวัดเพี้ยนดีกว่าไม่มีรูป)

ทางที่ตั๋วเสนอเป็นสำรอง (`htmlLabels: false`) **ไม่ได้ใช้** — แก้ต้นเหตุแล้วไม่จำเป็น

## v2 candidate list (as of Jul 22, 2026 — re-prioritize with feedback)

- Merge-or-differentiate decision vs `better-review`
- Richer feedback capture: skill prompts the user for feedback at close-out and posts it
  to the DW board (or drafts the post)
- Expand tutorial mode if feedback shows whitebox sections still aren't understood
- Revisit the stateful knowledge model ONLY if the concept ledger proves insufficient
