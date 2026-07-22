# Explanation page spec (/learn-diff)

One self-contained HTML page. Prefer the Artifact tool (side-by-side with chat in the
desktop app) — load the `artifact-design` skill first, per the Artifact tool's own
requirement. In a CLI session with no Artifact tool, write the file locally (no network,
no CDN — must open offline by double-click) and open it in the browser.
ภาษาไทย, ศัพท์ technical คงเป็นอังกฤษ, `<html lang>` ตามภาษา prose.

## Page sections, in order

1. **TL;DR** — 3–5 bullets: what changed, why, and the single riskiest thing in this diff.

2. **Intent reconciliation table** — the three lists from Step 2 (ขอ+ทำ / ขอ+ไม่ได้ทำ /
   ไม่ได้ขอ+ทำ). Style 🚨 unrequested changes so they cannot be missed. If all three
   lists are clean, say so in one line — don't pad.

3. **Box map** — every section of the diff, its box (⬛/🔲/⬜), the one-line justification,
   and a note that the user can override any assignment in chat. This is the reading plan
   for the rest of the page.

4. **Per-section explanations** — ordered by dataflow (entry point → core change → ripple
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

   **Tests as learning material:** when the diff (or repo) contains a test covering a
   grey/whitebox section, quote the real test as the input→output example instead of
   inventing a toy one — it is executable, so the reader can run it. For whitebox
   sections, additionally walk through the test's *design*: why these inputs, which edge
   cases it pins down, and what it does NOT cover — this doubles as teaching test design.

   Concepts already in the user's ledger: one-line reminder, not a re-explanation.

5. **Prediction questions** — grey/whitebox sections only, count per Scaling rules.
   Format per question:
   - A concrete scenario: "ถ้า input เป็น X ระบบจะทำอะไร?"
   - Reveal-on-click answer with a short explanation.
   - **A "พิสูจน์เอง" line:** the exact command/click-path to verify the answer against
     the real system — running an existing test that pins the behavior counts (and give
     the exact test command). Every question must be verifiable by running, not by trusting.
   - Never trick questions. Wrong-answer feedback explains the misconception without
     having planted it.

6. **Verification checklist** — a copyable markdown block (ISO 29110 Verification format
   where the project uses it): blackbox sections → concrete test steps; grey/whitebox
   sections → the specific understanding to confirm. Everything starts as `PD (Pending)`.

7. **Feedback footer** — one line linking to the feedback board
   (https://artemis.dobybot.com/projects/DW) asking: อธิบายส่วนไหนลึกไป/ตื้นไป?
   การจัด box ผิดตรงไหน?

## Style rules

- Diagrams: HTML/CSS or mermaid — never ASCII art. Every diagram carries example data,
  not just labeled boxes.
- Theme-aware (light + dark), responsive; wide code blocks scroll in their own container.
- Toy examples use realistic data from the project's domain, not `foo`/`bar`.
- The page is regenerable: it must not contain state worth preserving — all user feedback
  and overrides live in chat and the ledger.
