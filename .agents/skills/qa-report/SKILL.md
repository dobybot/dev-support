---
name: qa-report
description: File QA bug as concise markdown ticket in campaign folder. Status = filename prefix. Pairs with fix-qa-issue (separate Claude session, no chat memory).
---

# qa-report

File a tight ticket. Don't fix — that's `fix-qa-issue`.

**Lifecycle**: `[NEW]` → `[WIP]` → `[FIXED]` → `[VERIFIED]` | `[REOPENED]`. `[BLOCKED]` (fixer). `[MERGED]` (user-directed consolidation).

## Inputs
1. QA folder. Default: read `~/.claude/.qa-last-campaign`.
2. Bug description (verbatim from chat).

## Pre-flight
1. Resolve folder. Save path to `~/.claude/.qa-last-campaign`.
2. No `_qa.config.json` → propose + confirm:
   ```json
   {"working_branch":"…","default_repo":"…","repos":["…"],"worktree_root":"…","created_at":"YYYY-MM-DD"}
   ```
   `working_branch`: auto-suggest from current checkout in `default_repo`, confirm.
   `worktree_root`: must be outside any repo.

## Required fields
- `title` — imperative, becomes slug.
- `repo` — must be in `repos`. Default: `default_repo`.
- `where` — URL/file/component, specific.
- `steps` — numbered, concrete actions.
- `expected`, `actual`.
- `acceptance` — bullets, fixer's contract. Empty = refuse, push back.
- `severity` — P1/P2/P3, default P2.
- `attachments` — verbatim, paths not binaries.

## Style — keep tickets short

Tickets are specs for a context-less fixer agent, **not** docs for humans. Compress aggressively. Sacrifice grammar for brevity.

- Metadata: one inline-code line under the title — not a bullet list.
- Section headers: short (`## Where`, `## Repro`, `## Acceptance`, `## Notes`, `## Log`) — not full phrases like "Where it happens" / "Steps to reproduce" / "Acceptance criteria" / "Status log".
- Each section: 1–3 lines or 2–6 short bullets. No paragraphs of prose, no rationale, no "why this matters" text.
- Acceptance criteria: imperative, ≤8 words ("Banner removed", "No layout shift"), not full sentences with rationale.
- Don't repeat info across sections. URL once. Reasoning once.
- Notes: paste verbatim user input + related ticket slugs. No narrative.
- Log entries: one line per state change, reason in ≤6 words.
- Drop articles (`the`/`a`) where intent stays clear. Fragments OK.

## Body template (compact)
```markdown
# {title}

`NEW · {sev} · {repo} · {wb} · {YYYY-MM-DD}`

## Where
{URL/file — 1 line}

## Repro
1. …
2. …

## Expected
{1–2 lines}

## Actual
{1–2 lines}

## Acceptance
- [ ] …

## Notes
{verbatim user input, related ticket slugs, paths}

## Log
- {YYYY-MM-DD} NEW — qa-report
```

Empty section → `_(none)_`. Don't write `## Fix` — fixer appends.

## Slug
Lowercase, hyphenated, alnum. ≤60ch, truncate at word boundary. Collision → `-2`, `-3`.

## Filename
`[NEW] {slug}.md` — space after `]`.

## Confirmation
**Default: write immediately.**
Confirm only on: new-campaign config; missing fields you'd invent; true ambiguity; slug collision.
Batch confirms — never per-ticket. User fires several `/qa-report` in succession, won't wait.

## After write
Print path. Print queue tally.

## Merge (user-directed)
Combining tickets:
1. Write new merged ticket — consolidated `## Acceptance` + `## Notes` line: `Merged from: {slug-a}, {slug-b}`.
2. Append log line on each source: `- DATE MERGED — superseded by [NEW] {merged}.md`.
3. Rename sources `[…]` → `[MERGED]`. Fixer ignores `[MERGED]` (queue glob is `[NEW]`/`[REOPENED]` only).

## Guardrails
- `_qa.config.json`: never write without confirm.
- Other tickets: don't rename/delete (fixer's job). Exception: user-directed merge above.
- Empty `acceptance` → refuse, push back.
- Binary attachments → reference paths, don't embed.
- Vague description → ask, don't pad with assumptions.
