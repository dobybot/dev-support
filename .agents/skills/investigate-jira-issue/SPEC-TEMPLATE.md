# SPEC.md template

Fill the skeleton below into `tickets/{ID}/SPEC.md`. Drop sections that don't apply; keep the
order. Modeled on the house style (see `DBT-331/SPEC.md`, `DBT-367/SPEC.md`). Rules:

- **Anchor every claim to `file:line`** (e.g. `picking/serializers/webhook.py:42`). An unanchored
  root cause is a guess, not a finding.
- **Acceptance criteria must be testable** — name the test file/seam, the input, and the expected
  output. Add a *run-the-app verify* item wherever behavior is observable in the UI/API, not just
  in a model.
- Recommend hotfix-vs-feature and the repo set, but mark the stack call as **Tanin's**.
- Record what you decided *on Tanin's behalf* as **veto-able**, and leave true unknowns under
  *Open questions*.

---

```md
# {TICKET_ID} — {concise English title}

> {reporter's verbatim quote — often Thai; this is the symptom of record}

**Type (recommended):** {hotfix → `main` | new-feature → `uat`} — *stack call is Tanin's.*
**Repos:** {dobybot | dobybot-ui | dobysync …} — one branch, ships together.
**Branch (suggested):** `{TICKET_ID}-{hotfix|new-feature}-{slug}`

## Problem
{What the user observes, in plain terms — the reported symptom restated precisely.}

## Root cause (file-anchored)
{The actual mechanism, anchored to `file:line`. Why it produces the symptom. If multi-layer
(UI → validator → dobysync transform → marketplace API), trace each hop.}

## Reproduction
{The diagnose feedback loop: the exact steps / failing test / curl / query that makes the bug
appear deterministically. Note any prod data pulled from the `:15435` replica (read-only) and the
narrow gcloud query used. If it could NOT be reproduced, say so and list what's needed instead.}

## Design / approach  *(optional — may defer to implementation)*
{Chosen fix direction, if scope was locked during grilling. Note alternatives considered.}

## Risks / implementation notes  *(optional)*
- **R1:** {pivotal unknown the dev must verify, with the fallback if it doesn't hold}

## Acceptance criteria (testable)
1. {test file + seam} — {input} → {expected output}.
2. {regression guard for the previously-correct path}.
3. **Run-the-app (verify):** {observable behavior to confirm in the real app}.

## Out of scope
- {Deliberately deferred — Tanin's call. Keep recon notes if it might be re-scoped.}

## Open questions for Tanin
- {Blocking unknowns, or "None blocking." Mark veto-able decisions made on his behalf.}
```
