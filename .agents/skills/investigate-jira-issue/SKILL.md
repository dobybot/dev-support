---
name: investigate-jira-issue
description: Investigate a dobybot Jira bug to root cause BEFORE any code is written. Reads the code + CONTEXT.md/ADRs, pulls the read-only prod replica (:15435) and narrow gcloud logs, reproduces via the diagnose loop, then grills Tanin one-question-at-a-time on repro/intent/scope via grill-with-docs. Produces a file-anchored SPEC.md (root cause + reproduction + testable acceptance criteria) in the ticket worktree and mirrors it to a Jira Sub-task. Use when asked to /investigate-jira-issue, to investigate / root-cause / triage a Jira bug or ticket, to write a spec for a bug, or to figure out why something is broken before fixing it.
---

# Investigate a Jira Issue

Root-cause a Jira bug **before any code is written**. Output: a file-anchored `SPEC.md`
(root cause + reproduction + testable acceptance criteria) plus a mirrored Jira Sub-task.

This is the **pre-work phase** — it makes **no git changes**. After Tanin locks scope here,
the dev runs `/start-work-on-jira-issue` to branch. It orchestrates two skills: **`diagnose`**
(build a repro loop, pin the cause) and **`grill-with-docs`** (challenge scope/intent against the domain model).

## Input
- **Ticket ID** — e.g. `DBT-344`. If run from inside a ticket worktree (`tickets/{ID}/…`), infer it from the path.

## Pre-flight
- Locate the worktree at `~/Projects/dobybot/dobybot-workspace/tickets/{ID}/`. **If it does not exist, stop** and tell the user to run `/start-work-on-jira-issue {ID}` (worktree mode) first — investigation reads the checked-out code there.
- Investigation is **read-only on code**: no branch, no commits. The only writes are `SPEC.md`, the Jira Sub-task, and any `CONTEXT.md` glossary edits made while grilling.

## Phase 1 — Ticket + mental model
- Fetch the ticket (summary, description, comments, attachments) via the Atlassian MCP tools. **Capture the reporter's exact words verbatim** (often Thai) — that is the symptom of record; restate it precisely in English.
- Identify the affected repos. Read the relevant code + each repo's `CONTEXT.md` / `CLAUDE.md` + `docs/adr/` (see grill-with-docs for the context-map layout). Use the domain glossary so the spec's terminology is canonical, not invented.

## Phase 2 — Evidence: prod replica + logs (read-only)
- **Prod replica `:15435` is READ-ONLY.** Query it with `mcp__db_dobybot_prod_replica__execute_sql` — never `psql`, never a write. **The cloud-sql-proxy is off by default → ask the user to start it** when you need prod data. Pull only what the bug needs.
- **gcloud Cloud Logging:** read the code first, then write a **narrow** query (webhooks / inter-service / external-service comms). Broad queries are very slow and bury the signal.
- **NEVER modify prod, ever** — this machine is read-only against prod.

## Phase 3 — Reproduce (invoke the `diagnose` skill)
- Run **`diagnose`**: build a fast, deterministic feedback loop, reproduce the **exact reported symptom** (not a nearby one — wrong bug = wrong spec), then pin the **root cause to `file:line`** through ranked, falsifiable hypotheses.
- If you genuinely **cannot** reproduce (prod-only data, missing access), stop and document precisely what is needed (a captured artifact, access, or instrumentation) — do **not** guess a root cause into the spec.

## Phase 4 — Grill Tanin (invoke the `grill-with-docs` skill)
Grill Tanin **directly, one question at a time, blocking** on each answer, across three axes:
- **Repro** — does the loop reproduce what he actually saw? Confirm the symptom matches before trusting it.
- **Intent** — what is the *correct* behavior? Sharpen fuzzy/overloaded terms against `CONTEXT.md`; update the glossary inline as terms resolve.
- **Scope** — what's in vs deliberately deferred, which repos, and a **hotfix-vs-feature recommendation** (easy + low blast-radius → hotfix; otherwise feature). The **stack call is Tanin's** — recommend, don't decide.

## Phase 5 — Author SPEC.md
Write `tickets/{ID}/SPEC.md` using **[SPEC-TEMPLATE.md](SPEC-TEMPLATE.md)**. Every root-cause claim is `file:line`-anchored; every acceptance criterion is concrete and testable, and includes a run-the-app *verify* item wherever the fix has observable behavior.

## Phase 6 — Mirror to a Jira Sub-task
- Show the planned sub-task content and **confirm with the user before writing** (it's an outward-facing change to the tracker).
- Create a **Sub-task** under the parent ticket (`createJiraIssue`, issue type `Sub-task`, `parent = {ID}`): title `Investigation — root cause & spec`; body = root cause (file-anchored) + reproduction + the testable acceptance criteria + a pointer to the full `SPEC.md` in the ticket worktree.
- Print: parent ticket link, sub-task link, and the `SPEC.md` path.
