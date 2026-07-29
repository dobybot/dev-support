# Explanation page spec (/learn-diff)

Output ของ skill มี **2 โหมด** — เลือกตามสภาพ session และขนาด diff:

| โหมด | เมื่อไหร่ | รูปแบบ |
|---|---|---|
| **Artifact mode** (single page) | มี Artifact tool (desktop app) **และ** diff ขนาด Medium | หน้าเดียว self-contained — load `artifact-design` skill ก่อน ตาม requirement ของ Artifact tool เอง. Artifact link ไฟล์ local ไม่ได้ → inline CSS/JS ที่จำเป็นเอง (ตัดเฉพาะ style ที่ใช้จริงจาก asset ก็ได้ หรือ inline `<span class="tok-*">` แทน JS highlighter — แล้วแต่ว่าอันไหนประหยัดกว่า) **แต่ class ใน markup contract ต้องเหมือนกันทุกโหมด** |
| **Multi-page local mode** | CLI session (ไม่มี Artifact tool), **หรือ** diff ขนาด Large ไม่ว่า session แบบไหน | หลายไฟล์ HTML + copy `assets/` จาก skill folder ไปวางข้าง ๆ (รายละเอียดด้านล่าง). เปิด offline ด้วย double-click ได้ — ห้ามพึ่ง network/CDN ทุกกรณี |
| (Tiny diff) | ตาม Scaling rules | ไม่มีหน้า HTML — สรุปในแชท |

ภาษาไทย, ศัพท์ technical คงเป็นอังกฤษ, `<html lang="th">`.

## Static assets (DW-4)

Skill นี้แถมไฟล์ CSS/JS สำเร็จรูปมาใน `assets/` ของ skill folder:

- `assets/learn-diff.css` — theme (light+dark), layout, ทุก component class ด้านล่าง
- `assets/learn-diff.js` — syntax highlighter + line-number wrapping + copy buttons (IIFE, ไม่มี network)

**ห้าม generate `<style>` หรือ `<script>` เอง** (ยกเว้น Artifact mode ที่ inline สำเนา
ตัดทอนได้) — ใช้ asset files + emit markup ตาม contract เท่านั้น ประหยัด tokens และ
ทุกหน้าออกมาหน้าตาเหมือนกัน

ใน multi-page mode: **copy** assets ไปที่ output dir (อย่า reference กลับมาที่ skill folder —
output folder ต้อง self-contained ย้ายที่ได้):

```bash
cp -R ~/.claude/skills/learn-diff/assets "<outdir>/assets"
```

(skill ถูกติดตั้งเป็น symlink ที่ `~/.claude/skills/learn-diff` — `cp -R` follow symlink
ให้อยู่แล้ว จึงใช้ path นี้ได้ตรง ๆ)

## Multi-page layout (DW-13)

**Output directory:** `<repo>/.learn-diff/<branch-or-scope-slug>/` — และเพิ่ม `.learn-diff/`
ลง `.git/info/exclude` ของ repo นั้น (ห้ามแก้ `.gitignore` ที่ track อยู่)

```
index.html                 ← TL;DR + PM view + reconciliation + box map + nav (หน้า "อ่านก่อน")
01-<section-slug>.html     ← per-section engineer deep-dive, เรียงตาม dataflow
02-<section-slug>.html
…
99-verify.html             ← prediction questions + verification checklist + feedback footer
assets/learn-diff.css
assets/learn-diff.js
```

- **index.html คือ PM altitude ทั้งหมด** — สั่งเดิม "PM view first" ยังศักดิ์สิทธิ์: การแบ่งหน้า
  เอา PM view ทั้งก้อนไว้หน้าแรก แล้วดันเฉพาะ engineer lens ลง sub-pages
- Section ที่เป็น ⬛ blackbox และอธิบายจบใน 3–4 บรรทัด → inline ในแถวของ box map บน index
  เลย ไม่ต้องมีหน้าแยก; เฉพาะ grey/whitebox sections ได้หน้า numbered
- **ชื่อไฟล์:** เลขลำดับ zero-padded (ตาม dataflow) + kebab slug; `99-verify.html` ชื่อตายตัว
- **Incremental generation** (ผู้อ่านเริ่มอ่านได้โดยไม่ต้องรอทั้งหมดเสร็จ):
  1. copy `assets/`
  2. เขียน index.html ให้สมบูรณ์ โดย nav ใส่ทุกหน้า — หน้าที่ยังไม่เขียนเป็น `.nav-pending` span
  3. บอก user ให้เปิด index.html ทันที (`open index.html`)
  4. เขียน section pages ทีละหน้า; **ทุกครั้งที่หน้าเสร็จ ให้ rewrite nav ของ index.html**
     (และ footer-nav "ถัดไป" ของหน้าก่อนหน้า) เปลี่ยน pending span เป็น link จริง —
     ผู้อ่าน refresh เพื่อเห็นความคืบหน้า (ไม่ใช้ JS polling — `fetch` ใช้บน `file://` ไม่ได้)
  5. ปิดด้วย 99-verify.html + rewrite index ครั้งสุดท้าย

## Markup contract

Emit class เหล่านี้ *ตรงตัว* — CSS/JS ใน assets ผูกกับมันแล้ว

**Page skeleton (ทุกหน้า):**

```html
<!doctype html><html lang="th"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>…</title><link rel="stylesheet" href="assets/learn-diff.css"></head>
<body>
<nav class="site-nav"><ol>
  <li><a class="nav-current" href="index.html">ภาพรวม</a></li>
  <li><a href="01-section-slug.html">01 — …</a></li>
  <li><span class="nav-pending">02 — … (ยังไม่เสร็จ)</span></li>
</ol></nav>
<main>…content…</main>
<nav class="page-footer-nav"><a href="…">← ก่อนหน้า</a><span class="spacer"></span><a href="…">ถัดไป →</a></nav>
<script src="assets/learn-diff.js"></script></body></html>
```

(ตัด link ฝั่งที่ไม่มีออกได้ แต่คง `<span class="spacer"></span>` ไว้ให้ link ที่เหลือชิดขวา/ซ้าย ·
หน้าปัจจุบันใน nav ใช้ `.nav-current`)

**Code block — syntax highlighting + ชื่อไฟล์ + เลขบรรทัด (DW-5/6):**

```html
<figure class="code-block" style="--ln-start: 42">
  <figcaption class="code-filename">src/tools/artemis.ts <span class="code-lines">L42–58</span></figcaption>
  <pre><code class="language-ts">…HTML-escaped raw code…</code></pre>
</figure>
```

- Emit โค้ดดิบที่ escape HTML แล้วเท่านั้น — JS ทำ highlight + ห่อบรรทัด, CSS ใส่เลขบรรทัด
- ไม่ใส่ `style="--ln-start: N"` = เริ่มที่ 1
- `language-*` ที่รองรับ: js ts jsx tsx javascript typescript python py bash sh shell zsh
  sql json yaml yml html xml vue svelte css scss — ภาษาอื่นแสดง plain (ยังได้เลขบรรทัด)

**Terminal block (DW-7):**

```html
<figure class="terminal">
  <pre><span class="cmd">npm run build</span>
<span class="out">✓ built in 1.2s</span></pre>
</figure>
```

- หนึ่ง `<span class="cmd">` ต่อหนึ่งคำสั่ง — **ห้ามพิมพ์ `$` เอง** (CSS เติมให้);
  หนึ่ง `<span class="out">` ต่อหนึ่งบรรทัด output
- แต่ละ span อยู่คนละบรรทัดใน source ภายใน `<pre>` (span เป็น inline — newline คือตัวแบ่งบรรทัด)

**Component อื่น ๆ:**

- TL;DR: `<div class="tldr"><h3>TL;DR</h3><ul>…</ul></div>`
- Reconciliation: `<div class="table-scroll"><table class="recon-table">…</table></div>` —
  แถว ✅ เป็น `<tr>` ธรรมดา, แถว ⚠️ ขอแต่ไม่ได้ทำ = `<tr class="recon-missing">`,
  แถว 🚨 ไม่ได้ขอแต่ทำ = `<tr class="recon-unrequested">`
- Engineer divider: `<div class="engineer-divider">จากตรงนี้ = มุมมองวิศวกร</div>`
- Box badges: `<span class="box-badge box-black">⬛ blackbox</span>` / `box-grey` / `box-white`
- Diagram: `<div class="diagram"><span class="node">A</span><span class="arrow">→</span><span class="node this-change">B</span>…</div>`
  (HTML/CSS อิสระใน `.diagram` ก็ได้ — เป็น panel มีขอบ scroll ได้)
- Question: `<div class="question"><p>scenario…</p><details class="reveal"><summary>เฉลย</summary><p>answer</p><p class="verify-line">พิสูจน์เอง: …</p></details></div>`
- Checklist: `<div class="checklist">…</div>` · Feedback: `<div class="footer-feedback">…</div>`
- ตารางกว้าง: ห่อด้วย `<div class="table-scroll">`

## Page sections, in order

The page is **top-down**: product/system understanding first (a PM could follow it), then
the engineer lens. Never put the box map or code above the system view.
(Multi-page mode: sections 1–4 = index.html; section 5 = numbered pages; 6–8 = 99-verify.html)

1. **TL;DR** — 3–5 bullets: what capability changed, why, and the single riskiest thing.
   Must read on its own: no stacked undefined jargon; define any technical term in Thai at
   first use.

2. **System & purpose (PM view)** — the heart of the page, and it comes first. From Step 3:
   (a) what capability the change adds and why, in product terms; (b) a whole-system diagram
   marking which box *is* this change; (c) how the parts relate — trace ONE real request/flow
   end-to-end, naming which file hands off to which; (d) **how to use / run / try it** —
   concrete build/config/invoke/smoke-test steps grounded in the real repo (show real output
   from the safe ones); (e) product-level scope/risk/what's-deferred. A reader should
   understand the change and how to try it from this section alone, without reading code.

3. **Intent reconciliation table** — the three lists from Step 2 (ขอ+ทำ / ขอ+ไม่ได้ทำ /
   ไม่ได้ขอ+ทำ). Style 🚨 unrequested changes so they cannot be missed (`.recon-unrequested`).
   If all three lists are clean, say so in one line — don't pad.

4. **Engineer-lens divider + Box map** — an explicit divider ("จากตรงนี้ = มุมมองวิศวกร
   สำหรับคนที่จะ verify/ดูแลต่อ"), then every section of the diff, its box (⬛/🔲/⬜), the
   one-line justification, and a note that the user can override any assignment in chat.
   This is the reading plan for the code sections that follow — not the top of the page.
   (Multi-page: แถวของแต่ละ section ใน box map link ไปหน้า numbered ของมัน; blackbox
   ที่อธิบายสั้น ๆ ได้ inline ในแถวเลย)

5. **Per-section explanations** — ordered by dataflow (entry point → core change → ripple
   effects), never alphabetically by file. Depth per box:

   - **⬛ blackbox:** what it does, its inputs/outputs, and exactly how to test or use it
     (commands, URLs, clicks). Zero code shown.
   - **🔲 greybox:** the core idea in 2–3 sentences, a dataflow diagram, a toy-data
     example walking one concrete input to its output, and "ของอยู่ตรงไหน" (which files
     own which responsibility). Show code only where a snippet says it faster than prose.
   - **⬜ whitebox:** full walkthrough in dataflow order; design rationale (why this way —
     name the alternative that was NOT chosen and why); **invariants** — assumptions this
     code makes about existing code that didn't change (e.g. "assumes emails in the
     allowlist are lowercase"); ripple effects on future work.

   ทุก code snippet ใช้ `figure.code-block` พร้อมชื่อไฟล์จริง + เลขบรรทัดจริงจาก repo;
   ทุกคำสั่ง shell + output ใช้ `figure.terminal`.

   **Tests as learning material:** when the diff (or repo) contains a test covering a
   grey/whitebox section, quote the real test as the input→output example instead of
   inventing a toy one — it is executable, so the reader can run it. For whitebox
   sections, additionally walk through the test's *design*: why these inputs, which edge
   cases it pins down, and what it does NOT cover — this doubles as teaching test design.

   Concepts already in the user's ledger: one-line reminder, not a re-explanation.

6. **Prediction questions** — grey/whitebox sections only, count per Scaling rules.
   Format per question:
   - A concrete scenario: "ถ้า input เป็น X ระบบจะทำอะไร?"
   - Reveal-on-click answer with a short explanation (`.question` + `details.reveal`).
   - **A "พิสูจน์เอง" line:** the exact command/click-path to verify the answer against
     the real system — running an existing test that pins the behavior counts (and give
     the exact test command). Every question must be verifiable by running, not by trusting.
   - Never trick questions. Wrong-answer feedback explains the misconception without
     having planted it.

7. **Verification checklist** — a copyable markdown block (ISO 29110 Verification format
   where the project uses it): blackbox sections → concrete test steps; grey/whitebox
   sections → the specific understanding to confirm. Everything starts as `PD (Pending)`.

8. **Feedback footer** — one line linking to the feedback board
   (https://artemis.dobybot.com/projects/DW) asking: อธิบายส่วนไหนลึกไป/ตื้นไป?
   การจัด box ผิดตรงไหน?

## Style rules

- Diagrams: HTML/CSS (`.diagram`) — never ASCII art, no mermaid/ไลบรารีภายนอก. Every
  diagram carries example data, not just labeled boxes.
- Theme-aware (light + dark) และ responsive — `learn-diff.css` จัดการให้แล้ว; wide code
  blocks scroll in their own container (`pre` ใน `.code-block` scroll เองแล้ว; ตารางกว้าง
  ห่อ `.table-scroll`).
- Toy examples use realistic data from the project's domain, not `foo`/`bar`.
- The page is regenerable: it must not contain state worth preserving — all user feedback
  and overrides live in chat and the ledger.
