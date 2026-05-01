---
name: fix-qa-issue
description: Process QA queue from qa-report. Per [NEW]/[REOPENED] ticket: worktree off working_branch, fix, merge back, append concise Fix Notes. Pair with /loop for polling.
---

# fix-qa-issue

Worker for qa-report. **Zero chat memory.** Ticket file = spec. Too thin → `[BLOCKED]`, don't guess.

## Inputs
1. QA folder. Default: `~/.claude/.qa-last-campaign`.
2. Mode: `next` (1 ticket, default — for `/loop`) | `drain` (until empty/blocked).

## Pre-flight
1. Read `_qa.config.json`. Need: `working_branch`, `repos`, `worktree_root`. Missing → abort.
2. Per repo: confirm path + git repo. Origin branch exists → `git fetch` + ff. Else → local authoritative, skip.
3. `worktree_root` exists (`mkdir -p`). Must be outside any repo.
4. Queue = `[NEW] *.md` + `[REOPENED] *.md`, mtime ascending.
5. `[WIP] *.md` should be 0 — else surface to user (likely a previous run died).
6. Empty queue → print `queue empty`, exit clean. No prompt.

## Per-ticket loop

### 1. Claim
Rename `[NEW|REOPENED]` → `[WIP]`. Append to `## Log`: `- DATE WIP — claimed by fix-qa-issue`.

### 2. Validate
Parse body. Required fields non-empty? Else `[BLOCKED]: insufficient information`.
Repo ∉ `repos`? `[BLOCKED]: repo out of scope`.

### 3. Worktree
```bash
cd {repo}
if git ls-remote --heads origin {wb} | grep -q .; then
  git fetch origin {wb}; git checkout {wb}; git pull --ff-only origin {wb}
else
  git checkout {wb}
fi
WT={worktree_root}/{slug}-{YYYYMMDD-HHMM}; BR=qa/{slug}-{YYYYMMDD-HHMM}
git worktree add -b $BR $WT {wb}
cd $WT
```
Path collision → `-2` suffix.

### 4. Fix
Ticket = spec. Smallest change satisfying acceptance. No drive-by refactors.
Read files in `where` first; expand only if fix demands it.
Run lint/typecheck on changed files. Skip full test suite unless acceptance requires.
Doesn't reproduce / human-decision needed → `[BLOCKED]`.

### 5. Commit
```bash
git add {explicit paths only}    # never `.` / `-A`
git commit -m "qa({slug}): {one-line}

Ticket: {filename}
Acceptance: {one-line}
"
```

### 6. Merge back
Refresh first — working branch may have advanced:
```bash
cd {repo}
if git ls-remote --heads origin {wb} | grep -q .; then
  git fetch origin {wb}
  LOCAL=$(git rev-parse {wb}); REMOTE=$(git rev-parse origin/{wb})
else
  LOCAL=$(git rev-parse {wb}); REMOTE=$LOCAL
fi
```
`LOCAL ≠ REMOTE`:
```bash
git checkout {wb}; git pull --ff-only origin {wb}
cd $WT; git rebase {wb}
```
Conflict → `[BLOCKED]: merge conflict`, leave worktree, stop run.
Else:
```bash
cd {repo}; git checkout {wb}; git merge --ff-only $BR
```

### 7. Update ticket — keep terse
Insert above `## Log`:
```markdown
## Fix
- `{short SHA}` · {wb} · files: {comma-list}
- {1–2 lines: what was wrong + what changed}
```
Append to `## Log`: `- DATE FIXED — merged {SHA}`.
Rename `[WIP]` → `[FIXED]`.

### 8. Teardown
```bash
cd {repo}; git worktree remove $WT; git branch -D $BR
```
Dirty worktree → leave it, `[BLOCKED]: dirty worktree on teardown`.

### 9. Loop/exit
- `next`: print 1-line summary (`{slug}: FIXED ({SHA})`), exit.
- `drain`: continue. Stop on first `[BLOCKED]`.

## Block flow
Insert above `## Log`:
```markdown
## Block
- Reason: {short label}
- {1–3 lines: what tried, what missing, what human decides}
- State: {worktree path | none}
```
Append to `## Log`: `- DATE BLOCKED — {reason}`. Rename `[WIP]` → `[BLOCKED]`. Print 1-line summary. Stop run.

## Re-test handoff (user, not this skill)
- Pass: `[FIXED]` → `[VERIFIED]`.
- Fail: user appends `## Re-test failure` section, renames `[FIXED]` → `[REOPENED]`. Next run picks up.

## Style — keep `## Fix` and `## Block` terse
Tickets are specs, not docs. Compress aggressively. Drop articles.
- `## Fix`: 2 lines max — sha/branch/files line + 1–2 line summary. No multi-paragraph rationale.
- `## Block`: 3 short lines — reason label + what's missing/decided + state.
- Log entries: one line, reason ≤6 words.

## Guardrails
- No push. No PR. User pushes.
- No `reset --hard` / `clean -fd` / force-push / branch delete on `{wb}`. Only on `qa/*` after merge.
- No `git add .` / `-A`. No amend. No rebase of `{wb}`.
- Never delete tickets — status changes only.
- Don't skip rebase-before-merge.
- Don't operate on out-of-scope repos.
- Destructive shortcut to make progress → `[BLOCKED]`, don't improvise.

## Invocations
```
/loop 3m /fix-qa-issue        # poll
/fix-qa-issue drain           # drain queue once
/fix-qa-issue next /path/QA   # explicit folder
```
