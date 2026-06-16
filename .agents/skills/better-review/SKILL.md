---
name: better-review
description: "Generate a single self-contained HTML walk-through guide that orients a human reviewer of an AI-completed ticket. Four sections: what the ticket is about, how it was built as a thought-process (the decisions a dev would hit, plus risk-flags), a dataflow map of clickable flow-boxes (expand to see the diff inline, ↗ jumps into VS Code), and what to test. Use as the closing step of the dev loop after submit-work, or standalone when a reviewer wants a navigable map of a ticket/branch. Triggers: /better-review, 'review guide', 'walk me through this for review', 'I keep getting lost reviewing'."
argument-hint: "Optional — the ticket id or ticket-folder path (e.g. DBT-326). If omitted, infer from the current ticket folder / branch / recent conversation."
---

Produce **one self-contained HTML file** that lets a human reviewer pick a ticket back up cold: remember what it is, know where to start, follow the dataflow, and know what to run. It is an **orientation map, not a verdict** — see Stance.

This is a sibling of `wip-codeflow-review`, not a replacement. That skill emits a Markdown Mermaid diagram for tracing *any* flow; this one emits an HTML *review* surface scoped to a ticket's diff. Both may exist; reach for this one at review time on a ticket.

## Output

- **File:** `tickets/{TICKET}/review.html` (workspace-root altitude, beside `SPEC.md`/`channel.md`). Local-only by design — the workspace root isn't a git repo and the durable record stays the PR. Regenerable; a refix just re-runs this.
- **Self-contained:** inline the entire contents of `assets/styles.css` into a `<style>` tag and `assets/app.js` into a `<script>` tag. **No network, no CDN** — it must open offline by double-click. Inline the CSS/JS verbatim — they already carry the spacing, the grouped `.grp` list, and the diff-spacing fix; don't re-derive styles inline.
- **Stamped:** record the branch name + the `HEAD` short SHA it was built against in the header `.stamp`. A reviewer who sees their branch tip has moved knows to regenerate.

## Prose language

Write the **human-readable prose** (section headings, descriptions, the thought-process items, risk-flags, test steps, `.note`s) in the **team's working language**, and set `<html lang>` to match. This workspace operates in **Thai** (per the `feedback_pr_and_issues_in_thai` memory) — default to Thai here. **Keep in English regardless:** code inside diffs, identifiers / function names, file paths, branch names, the `NEW`/`CHANGED` badges, and the section `id`s (anchors must match the `href`s). The skeleton below is written in English for illustration — translate the prose when you render.

## Inputs (all already in the ticket folder)

| Source | Feeds |
|---|---|
| `SPEC.md` (problem/root-cause, decisions, the `file:line` anchors, acceptance criteria) | §What-it's-about, seeds the flow trace, §What-to-test criteria |
| `channel.md` + the GitHub PR body | §What-the-AI-did, §What-to-test recipe (pull the PR's manual-test checklist — don't re-derive it) |
| `git diff <base>...HEAD` in **each edited worktree** | the dataflow map + the inline diff hunks |

- **Base branch** = `main` for a hotfix, `uat` for a feature — detect from the branch name (`{TICKET}-{hotfix\|new-feature}-{slug}`), same rule as `submit-work`. Use `git merge-base` so the diff is the branch's own changes, not the migration delta.
- **Multi-repo / multi-stack:** iterate whatever worktrees exist in `tickets/{TICKET}/` (a 3-repo stack, or dobysync's 2-repo `:8001` stack — stay generic). A flow can cross repos; color-code each box by repo via `data-repo`.

## How to build the dataflow map (the real work)

The map's value is that reading it top-to-bottom traverses the system in **execution order**, not git's file-alphabetical order. `git diff` only gives you scattered hunks — you must trace the path that connects them.

1. **Find the trigger** — the entry point a request/event/cron hits (a `.entry` node), e.g. "USER submits FULL company (css)". Not preceding setup.
2. **Trace to the terminal effect** — follow the call chain to the DB write / response / UI render / message sent (an `.effect` node). Use the SPEC's root-cause and its `file:line` anchors as the spine; they usually already name the path.
3. **Place the changed steps** on that path as `.step.changed` boxes, marked `NEW` or `CHANGED`. These are prominent and **expandable** to their diff hunk.
4. **Add only the minimal connecting context** — the entry, the terminal effect, and the few glue steps needed to make the path legible — as dimmed `.step.context` boxes (not expandable). Summarize adjacent helper calls into one box; do **not** list every helper. If a non-trivial change risks burying the NEW boxes, prune context, don't add more.
5. **Cross-repo:** set each box's `data-repo`; the `↗` link points into *that* repo's worktree.

## Sections (in order)

1. **What it's about** — 1–3 sentences from the SPEC. The "remind me what this ticket is."
2. **How it was built — as a thought process** — **not** a file-by-file change list (the diff + dataflow already carry that, and a flat list reads as noise). Reconstruct the **decisions a developer would hit if they implemented this themselves**, in the order they'd surface — each item is *a question → the approach chosen → the artifact it produced* (`code`/file/setting). Mine these from the SPEC's locked decisions + root-cause; this is where the author's understanding of *why* earns its keep. Render as **`.dec` cards inside the `.decisions` grid** (a fixed 2-column grid; single column under 900px).
   - **Inside each `.dec` card, use real document structure — never a run-on paragraph:** `<h4>` = the numbered question; a short `<p>` for context/constraint (1–2 sentences); a `<ul>` for the reasoning/consequences (**one idea per `<li>`, never `;`-glued clauses**); an optional small `<pre>` when concrete data/code says it better than prose (an observed payload, a key shape, a gate condition); and close with `<div class="dec-out">→ …</div>` naming the artifact produced (function/file/SettingKey). Not every card needs every element — a card can be just h4 + ul + dec-out.
   - **Risk-flags live inside the card they belong to**, as a `.dec-watch` block (between the bullets and `.dec-out`): a `.dw-title` "⚠ Watch during review" line, then a `<ul>` where each `<li>` opens with a `.sev` chip — `high` / `med` / `ok` (fixed or verified) / `watch` / `design` (accepted limitation). Only **cross-cutting** flags that span decisions (e.g. "all PRs must ship together") stay in the section-level `.risks` block, with a hint noting the per-decision flags moved into the cards. See Stance.
   - Cards belonging to a named sub-feature may carry a `.dec-tag` chip inside the `<h4>` and a modifier class on `.dec` (e.g. `.dec.chat`) to tint the card's lane color — keeps related cards visually grouped across the grid.
3. **Dataflow** — the flow boxes (above). When there is **more than one flow**: give each flow an anchor (`<div class="flow-title" id="flow-1">① …</div>`), say the total count in the `<h2>`, and open the section with a **`.flow-overview` grid** — one clickable `.fo` card per flow (`.fo-num` ①, `.fo-title`, `.fo-meta` = step count + repos touched) linking to its `#flow-N`. Also list the flows as `.sub` links under "Dataflow" in the sidebar `.toc`. A single-flow ticket skips the overview grid but keeps the `id`.
4. **What to test** — the one-keypress run recipe (`code tickets/{TICKET}/{TICKET}.code-workspace` → F5 → "All Servers" → open the URL) + the PR's manual-test steps, then the SPEC's acceptance criteria as a checkbox list.

## Stance — descriptive, not a verdict

The author dev writes this guide, so it must **not** argue the code is correct (that pre-anchors the reviewer and duplicates the `code-review` sub-agent). Describe *the reasoning behind the change and where it lives* — the decisions taken and why, not a verdict on whether they're right — and *point the reviewer at what to scrutinise*, using the author's knowledge of where the bodies are buried to aim the review. The full diff and flow are all present; risk-flags are additive hints, not a filter.

## HTML structure

**Page shell:** the page is wide (body max-width 1720px) with a two-column `.layout` grid — a sticky `<aside class="side">` holding the `.toc` on the left, and `<main>` with all sections on the right. Everything after `</header>` goes inside `<div class="layout"><aside class="side">…</aside><main>…</main></div>`. The bundled JS scroll-spies the `.toc` links; the `.decisions` and `.flow-overview` grids reflow to fill the main column. Under 1100px it all collapses to one column automatically — don't add your own media queries.

Match these class names exactly so the bundled CSS/JS apply. Minimal skeleton:

```html
<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>DBT-326 — review guide</title>
<style>/* …inline assets/styles.css here… */</style></head><body>

<header class="hdr">
  <div class="hdr-title"><span class="tid">DBT-326</span>
    <span class="tname">เปิด Feature Flag marketplace by-default …</span></div>
  <div class="hdr-meta">
    <span class="chip type-hotfix">hotfix</span>
    <span class="chip">main ← DBT-326-hotfix-marketplace-flag-default</span>
    <span class="chip">dobybot</span>
    <a class="chip pr" href="https://github.com/dobybot/dobybot/pull/243">PR #243 ↗</a></div>
  <div class="stamp">Built against <code>a1b2c3d</code> · 2026-05-27. If your branch tip differs, regenerate.</div>
</header>

<div class="layout">
<aside class="side"><nav class="toc">
  <a href="#about">What it's about</a>
  <a href="#did">How it was built</a>
  <a href="#flow">Dataflow (2 flows)</a>
  <div class="sub">
    <a href="#flow-1">① create FULL company</a>
    <a href="#flow-2">② read in customer app</a>
  </div>
  <a href="#test">What to test</a>
</nav></aside>
<main>

<section id="about" class="card"><h2>What it's about</h2><p>…</p></section>

<section id="did" class="card"><h2>How it was built — decisions you'd hit</h2>
  <p class="hint">Each card: the question → the approach taken → where it lives. (Diff detail lives in the flow below.)</p>
  <div class="decisions">
    <div class="dec">
      <h4>1. Where does the value come from at create time?</h4>
      <p>css POSTs with no record-package context yet.</p>
      <ul>
        <li>Seed the flag in the create view, not a signal.</li>
        <li>A signal would fire on every save, not just create.</li>
      </ul>
      <div class="dec-out">→ <code>RecordPackageCreateAPIView</code></div>
    </div>
    <div class="dec">
      <h4>2. Why does it read ON in css but not the customer app?</h4>
      <p>The two readers disagree on defaults:</p>
      <pre>css            → RAW company.feature_flag dict
customer app   → serializer applies defaults</pre>
      <ul>
        <li>So the key must be written explicitly — relying on a default is not enough.</li>
      </ul>
      <div class="dec-watch"><div class="dw-title">⚠ Watch during review</div>
        <ul><li><span class="sev med">Medium</span> the customer serializer also caches defaults — confirm the explicit write wins.</li></ul></div>
      <div class="dec-out">→ <code>company.feature_flag["marketplace"]</code></div>
    </div>
  </div>
  <div class="risks"><h3>⚠ Watch during review — cross-cutting</h3>
    <p class="hint">Per-decision flags live inside the cards above; only flags spanning decisions stay here.</p>
    <ul><li>…</li></ul></div></section>

<section id="flow" class="card"><h2>Dataflow — entry → effect (2 flows)</h2>
  <p class="hint">Click a NEW/CHANGED step to expand its diff · click ↗ to open in VS Code.
    <button data-toggle-all class="chip">expand/collapse all</button></p>

  <div class="flow-overview">
    <a class="fo" href="#flow-1"><span class="fo-num">①</span>
      <span class="fo-title">create FULL company (css)</span>
      <span class="fo-meta">3 steps · dobybot</span></a>
    <a class="fo" href="#flow-2"><span class="fo-num">②</span>
      <span class="fo-title">read flag in customer app</span>
      <span class="fo-meta">2 steps · dobybot · dobybot-ui</span></a>
  </div>

  <div class="flow-title" id="flow-1">① create FULL company (css)</div>
  <div class="flow">
    <div class="entry">USER submits FULL company (css)</div>

    <div class="step context" data-repo="dobybot">
      <div class="step-head"><span class="num">1</span>
        <span class="step-title">CompanyCreateAPIView.post</span>
        <span class="repo-tag">dobybot</span>
        <span class="loc">adminapi/css/views.py:88</span>
        <a class="open" href="vscode://file//Users/tanin-t/Projects/dobybot/dobybot-workspace/tickets/DBT-326/dobybot/adminapi/css/views.py:88" title="Open in VS Code">↗</a></div></div>

    <div class="step changed" data-repo="dobybot">
      <div class="step-head" role="button" tabindex="0" aria-expanded="false"><span class="num">2</span>
        <span class="badge new">NEW</span>
        <span class="step-title">RecordPackageCreateAPIView — seed marketplace flag</span>
        <span class="repo-tag">dobybot</span>
        <span class="loc">adminapi/css/views.py:152</span>
        <a class="open" href="vscode://file//Users/tanin-t/Projects/dobybot/dobybot-workspace/tickets/DBT-326/dobybot/adminapi/css/views.py:152">↗</a>
        <span class="caret">▸</span></div>
      <div class="diff" hidden><pre><code><span class="ln hunk">@@ -150,4 +150,6 @@ def post(self, request):</span>
<span class="ln"> if package == "001":</span>
<span class="ln add">+    company.feature_flag["marketplace"] = True</span>
<span class="ln"> company.save()</span></code></pre>
      <div class="note">Additive write — assumes feature_flag is a dict (it is, default {}).</div></div></div>

    <div class="effect">css reads RAW feature_flag dict → marketplace shows ON</div>
  </div>

  <div class="flow-title" id="flow-2">② read flag in customer app</div>
  <div class="flow"><!-- …same shape… --></div></section>

<section id="test" class="card"><h2>What to test</h2>
  <ol class="recipe">
    <li><code>code tickets/DBT-326/DBT-326.code-workspace</code> → F5 → "All Servers"</li>
    <li>Open <a href="http://localhost:3000">localhost:3000</a> → create a FULL_INTEGRATION company via css</li></ol>
  <h3>Acceptance criteria</h3>
  <ul class="ac"><li><label><input type="checkbox"> Raw <code>feature_flag.marketplace == True</code> after css create</label></li></ul></section>

</main></div>
<script>/* …inline assets/app.js here… */</script></body></html>
```

### Diff rendering rules
- Each diff line is one `<span class="ln …">`, separated by a real newline in the source. Classes: `add` (added), `del` (removed), `hunk` (the `@@ … @@` header), or none (context). Keep the leading `+`/`-`/space in the text. The bundled CSS sets `.diff pre { white-space:normal }` so those inter-span newlines collapse (otherwise `<pre>` renders each as a blank line → double-spaced code) while each `.ln` keeps `white-space:pre` for its own indentation — don't change that pairing.
- **HTML-escape** the code (`<` `>` `&`) — e.g. `->` becomes `-&gt;`, query-string `&` becomes `&amp;`, Vue `<v-select>` becomes `&lt;v-select&gt;`. Preserve indentation literally.
- Show only the relevant hunks for that step, not the whole file. An optional `.note` under the diff is where a risk-flag for *that* step lives.
- `.step.context` boxes have **no** `.diff` and no caret — they're dimmed orientation only.

### Link rules
- `↗` uses `vscode://file//<absolute-path>:line` — **double slash** before the macOS absolute path. Path points into the ticket's per-repo worktree (`tickets/{TICKET}/{repo}/…`). These protocol links open from a browser and jump into VS Code.
- One top-level PR link in the header. Skip fragile per-line GitHub anchors.

## Steps to run

1. Resolve the ticket folder (arg, else current branch / recent context). Read `SPEC.md`, `channel.md`, and find the PR (`gh pr view` or the `channel.md` `[pr-ready]` line).
2. Per edited worktree: `git -C tickets/{TICKET}/{repo} diff $(git -C … merge-base <base> HEAD)..HEAD`.
3. Trace the flow (above), draft the four sections, render the HTML, inline the CSS + JS.
4. Write `tickets/{TICKET}/review.html`. Tell the reviewer to open it (`open tickets/{TICKET}/review.html`).

## When NOT to use
- Tracing a flow that isn't a ticket diff → `wip-codeflow-review`.
- A pure correctness pass → `code-review`.
- Confirming the change runs → `verify` / `run`.
