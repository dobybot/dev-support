---
name: qa-report
description: File a QA bug as a GitHub issue via `gh`. Reads `.qa-config.json` from the repo root for the target repo. Primary capture is the in-app Report Issue button; this skill is the keyboard fallback for bugs found while reading code or working in the terminal.
---

# qa-report

File a tight GitHub issue. Don't fix — that's `fix-qa-issue`.

## Lifecycle (in GitHub)

- **open · no `qa:wip` label · no `qa:blocked` label** → in fixer queue
- **open · `qa:wip`** → fixer claimed it
- **open · `qa:blocked`** → fixer needs human input (read latest comment for reason)
- **open · assignee=reporter · last comment is Fix Notes** → fixed, awaiting human verify
- **closed** → verified
- **reopened** (`state_reason="reopened"` from API) → fixer bumps to top of next tick

`qa:p1` / `qa:p2` / `qa:p3` is severity — separate label namespace from state.

## Inputs

1. Repo cwd (must contain `.qa-config.json` at root).
2. Bug description from chat (verbatim).

## Pre-flight

1. Read `.qa-config.json`. Need: `repo`. Missing → abort.
2. `gh auth status` succeeds → continue. Else tell the user to `gh auth login`.
3. Capture target branch: `git branch --show-current`. This stamps where the bug lives so the fixer doesn't depend on a shared config field.
   - Detached HEAD (empty output) → ask the user which branch.
   - On `main` / `master` → ask once to confirm. QA bugs almost always live on a phase branch; reporting against `main` is usually a forgotten branch switch.

## Required fields (push back if missing)

- **title** — imperative one-line, ≤70 chars. Becomes issue title.
- **severity** — `p1` (blocker) / `p2` (broken) / `p3` (polish). Default `p2`.
- **where** — URL or route + the offending component (data-cy / selector / `n/a`).
- **what** — description: what happened, what was expected, how to reproduce.

If a required field can't be inferred from the user's chat message, ask once. Don't invent.

## File via `gh`

```bash
gh issue create \
  --repo "$REPO" \
  --title "$TITLE" \
  --label "qa:$SEV" \
  --body "$BODY"
```

Body template (matches what the in-app form produces, minus the auto-captured env footer):

```markdown
{what — verbatim user words, fragments OK}

---
**Where:** {url-or-route} · component `{data-cy or selector or n/a}`
**Branch:** `{branch from git branch --show-current}`
**Reported via:** chat (qa-report skill) · {YYYY-MM-DD}
```

The `---` separator matters: above is the human report, below is metadata. Fixer reads both, never edits above.

`**Branch:**` is the fixer's worktree target for this issue. Stamping it per-issue means the fixer doesn't rely on a global `working_branch` config that drifts as you move between phases.

## Style — keep issues short

Issues are specs for a context-less fixer agent, **not** docs for humans. Compress aggressively.

- Description: 1–4 short paragraphs or a numbered repro list. No "why this matters" prose.
- Drop articles where intent stays clear. Fragments OK.
- Don't repeat info — URL once, component once.
- No acceptance criteria section — fixer infers from the "expected behavior" in the description.
- Sacrifice grammar for brevity.

## After filing

Print the issue URL returned by `gh`. That's it. Don't poll, don't comment, don't add other labels. The fixer takes over on its next loop tick.

## Guardrails

- Vague description → ask once, don't pad with assumptions.
- Don't change `qa:wip` / `qa:blocked` labels — those are the fixer's.
- Don't close or reopen issues — that's the human verifier's signal.
