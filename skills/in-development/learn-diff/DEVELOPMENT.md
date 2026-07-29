# learn-diff — Development notes (context for the next maintainer agent)

This file is NOT loaded when the skill runs. It exists so the next agent (or human)
updating this skill inherits the reasoning, not just the artifact. Read it fully before
changing SKILL.md.

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

## Core principles (do not break these in v2)

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

## v2 candidate list (as of Jul 22, 2026 — re-prioritize with feedback)

- Merge-or-differentiate decision vs `better-review`
- Richer feedback capture: skill prompts the user for feedback at close-out and posts it
  to the DW board (or drafts the post)
- Expand tutorial mode if feedback shows whitebox sections still aren't understood
- Revisit the stateful knowledge model ONLY if the concept ledger proves insufficient
