---
name: fix-qa-issue
description: Process QA queue from GitHub issues. Per open issue (reopened first, then by severity, FIFO within): worktree off the issue's `**Branch:**` field (falling back to `working_branch` in `.qa-config.json` for in-app reports), fix, ff-merge back into local `{wb}` so the user can verify in their dev environment, comment Fix Notes + verify steps + assign reporter. Issue stays OPEN — human verifier closes after retesting. Skill never pushes; the user pushes `{wb}` when ready. Pair with `/loop` for polling.
---

# fix-qa-issue

Worker for the QA loop. **Zero chat memory.** GitHub issue body = spec. Too thin → label `qa:blocked` + comment, don't guess.

## State machine (in GitHub)

| State | Meaning |
|---|---|
| open · no `qa:wip` · no `qa:blocked` | in queue |
| open · `qa:wip` | this skill claimed it |
| open · `qa:blocked` | needs human input (latest comment explains) |
| open · `qa:verify` · assignee=reporter | awaiting human verify |
| closed | verified, done |
| reopened (`state_reason="reopened"`) | bumped to top of next tick |

## Inputs

1. Repo cwd (must contain `.qa-config.json` at root).
2. Mode: `next` (1 issue, default — for `/loop`) | `drain` (until empty/blocked).

## Pre-flight

1. Read `.qa-config.json` from repo root. Need: `repo`, `worktree_root`. `working_branch` is optional — used only as a fallback when an issue body lacks a `**Branch:**` field (e.g. in-app reports that have no git context). Missing required fields → abort.
2. `gh auth status` succeeds → continue. Else tell user to `gh auth login`.
3. Repo cwd is a git repo → confirm. Origin branch exists → `git fetch` + ff. Else local authoritative.
4. `worktree_root` exists (`mkdir -p`). Must be outside any repo.
5. Build queue:
   ```bash
   gh issue list --repo "$REPO" --state open --limit 100 \
     --json number,title,labels,assignees,createdAt,updatedAt,stateReason,author,body,url
   ```
   Inclusion rule: an issue is in the queue if **either** (a) `stateReason == "reopened"` AND the latest comment does NOT start with `**Fixed in \`` (i.e. the fixer hasn't already handled this reopen) OR (b) it has none of `qa:wip`, `qa:blocked`, `qa:verify`.
   - `qa:wip` → already claimed by a previous tick
   - `qa:blocked` → waiting on human input
   - `qa:verify` → fixer handed off for human verify; only **Close** (pass) or **Reopen** (fail) advances the state. Clearing the assignee or removing the label by hand is not a re-queue signal.
   - reopened → reporter says the previous fix didn't take; pick up regardless of stale `qa:verify` — but only until the fixer's Fix Notes lands as the latest comment, since GitHub never clears `stateReason="reopened"` on its own.
   Sort by:
   1. `stateReason == "reopened"` first
   2. then by severity label: `qa:p1` → `qa:p2` → `qa:p3` (no severity label → treat as `p2`)
   3. then `updatedAt` ascending (oldest first)
6. Issues with `qa:wip` label should be 0 — else surface to user (likely a previous run died mid-fix).
7. Empty queue → print `queue empty`, exit clean. No prompt.

## Per-issue loop

### 1. Claim

```bash
gh issue edit "$NUM" --repo "$REPO" --add-label "qa:wip" --remove-label "qa:verify"
```
Removing `qa:verify` is a no-op when the label isn't applied (e.g. fresh issue) — `gh` tolerates it. On a reopened issue this clears the prior verify state.

### 2. Validate

Parse body. Description non-empty? Has enough context (URL/route, what broke, expected behavior)?
Else block:
```bash
gh issue edit "$NUM" --repo "$REPO" --remove-label "qa:wip" --add-label "qa:blocked"
gh issue comment "$NUM" --repo "$REPO" --body "Blocked: insufficient information.

Missing: {what's missing — be specific}

Add the missing detail and remove the \`qa:blocked\` label to re-queue."
```

Resolve target branch (`wb`) for this issue:
1. Parse `**Branch:** \`...\`` from the metadata footer (below the `---`).
2. If absent (in-app report, legacy issue), fall back to `working_branch` from `.qa-config.json`.
3. If neither resolves, block with "Missing branch: stamp `**Branch:** \`<branch>\`` in the metadata footer or set `working_branch` in `.qa-config.json`."
4. Sanity check the branch exists locally or on `origin`. Doesn't exist → block ("Branch \`{wb}\` not found locally or on origin — typo or branch was deleted").

### 3. Worktree

Create the worktree off the local `{wb}` ref without disturbing the main checkout. If the user has `{wb}` checked out and dirty, leave their working tree alone — the worktree only needs the branch ref, not the working copy.

```bash
cd {repo-cwd}
git fetch origin {wb} 2>/dev/null || true

# Safe-refresh: only ff the main checkout if the user is on `{wb}` and
# clean. Otherwise trust the local `{wb}` ref as-is (the user may have
# local-only commits that should land on the qa branch base).
if [ "$(git rev-parse --abbrev-ref HEAD 2>/dev/null)" = "{wb}" ] \
   && [ -z "$(git status --porcelain)" ]; then
  git pull --ff-only origin {wb} 2>/dev/null || true
fi

SLUG=$(echo "$TITLE" | tr '[:upper:]' '[:lower:]' \
  | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//' \
  | cut -c-50 | sed -E 's/-+$//')
TS=$(date +%Y%m%d-%H%M)
WT="{worktree_root}/${SLUG}-${TS}"
BR="qa/${SLUG}-${TS}"
git worktree add -b "$BR" "$WT" {wb}
cd "$WT"
```
Path collision (rare) → append `-2`, `-3`.

### 4. Fix

Issue body = spec. Smallest change satisfying the report. No drive-by refactors.
- Read files in `**Where:**` first; expand only if fix demands it.
- Run lint/typecheck on changed files. Skip full test suite unless the description names a failing test.
- Doesn't reproduce / human-decision needed → block (see Validate format).

### 5. Commit

Use `Refs #${NUM}` — **not** `Closes #${NUM}`, which would auto-close the issue on merge. We want it OPEN until the human verifies.

```bash
git add {explicit paths only}      # never `.` / `-A`
git commit -m "qa(#${NUM}): {one-line summary}

Refs #${NUM}
"
```

### 6. Merge back

Goal: ff-merge the qa branch into local `{wb}` so the user can verify the fix in their normal dev environment (Convex + Vite, browser session, env vars all already running against `{wb}`).

**Pre-merge gate.** The merge needs to land on `{wb}` in the main checkout, so the main checkout must already be on `{wb}`. Uncommitted edits in the main checkout are fine — `git merge --ff-only` will only refuse if it would clobber one of those edits, and we catch that below. We still never switch branches under in-flight work.

```bash
cd {repo-cwd}
if [ "$(git rev-parse --abbrev-ref HEAD)" != "{wb}" ]; then
  gh issue edit "$NUM" --repo "$REPO" --remove-label "qa:wip" --add-label "qa:blocked"
  gh issue comment "$NUM" --repo "$REPO" --body "Blocked: main checkout isn't on \`{wb}\` — can't ff-merge \`$BR\` without disturbing in-flight work on another branch.

Worktree left at \`$WT\`. To finish by hand:
1. \`cd {repo-cwd} && git checkout {wb} && git merge --ff-only $BR\`
2. Comment the SHA on this issue, set \`qa:verify\`, assign the reporter, and remove \`qa:blocked\`."
  # leave worktree + qa branch, stop run
  exit
fi
```

Refresh `{wb}` and rebase the qa branch onto the latest tip — keeps the merge a true fast-forward and surfaces conflicts here. The pull is best-effort (it'll silently no-op if a dirty file in the main checkout overlaps with the pull):

```bash
git fetch origin {wb} 2>/dev/null || true
git pull --ff-only origin {wb} 2>/dev/null || true
cd "$WT"
git rebase {wb}
```

Conflict → block (the user finishes the rebase manually in the worktree):
```bash
gh issue edit "$NUM" --repo "$REPO" --remove-label "qa:wip" --add-label "qa:blocked"
gh issue comment "$NUM" --repo "$REPO" --body "Blocked: merge conflict on rebase against \`{wb}\`. Worktree left at \`$WT\` for hand-resolve."
# leave worktree, stop run
```

Else fast-forward into local `{wb}`. If `git merge --ff-only` errors — almost always because a dirty file in the main checkout would be clobbered by the merge — block; we don't have a safe automated path to proceed (can't stash silently, can't overwrite the user's edit):
```bash
cd {repo-cwd}
if ! git merge --ff-only "$BR" 2>/tmp/qa-merge-err.log; then
  ERR=$(cat /tmp/qa-merge-err.log)
  gh issue edit "$NUM" --repo "$REPO" --remove-label "qa:wip" --add-label "qa:blocked"
  gh issue comment "$NUM" --repo "$REPO" --body "Blocked: \`git merge --ff-only $BR\` into \`{wb}\` failed — likely a dirty file in the main checkout overlaps with the merge.

\`\`\`
$ERR
\`\`\`

Worktree left at \`$WT\`. To finish by hand:
1. Commit/stash/discard the conflicting file in the main checkout.
2. \`cd {repo-cwd} && git merge --ff-only $BR\`
3. Comment the SHA on this issue, set \`qa:verify\`, assign the reporter, and remove \`qa:blocked\`."
  exit
fi
SHA=$(git rev-parse --short=7 HEAD)
```

### 7. Comment + handoff

Lift the verify steps from the issue's `**Where:**` and description — adapt to imperative form ("Go to /wallet, click Add credit, enter 500 — should now show toast"). If the original repro was numbered, keep it numbered.

```bash
REPORTER=$(gh issue view "$NUM" --repo "$REPO" --json author -q .author.login)

gh issue comment "$NUM" --repo "$REPO" --body "**Fixed in \`$SHA\` on \`{wb}\`.**

**Verify:**
{1–4 lines, concrete steps, what to expect after the fix}

Close to pass. **Reopen** + comment to fail (picked up next tick). Don't clear \`qa:verify\` or assignee by hand — that's the verify-state gate."

gh issue edit "$NUM" --repo "$REPO" \
  --remove-label "qa:wip" \
  --add-label "qa:verify" \
  --add-assignee "$REPORTER"
```

Issue stays OPEN. Closing is the human verifier's signal.

### 8. Teardown

```bash
cd {repo-cwd}
git worktree remove "$WT"
git branch -D "$BR"
```
The qa branch's commit is now on `{wb}`, so the qa branch ref is redundant — delete it. Dirty worktree on teardown → leave it, comment block (see Validate format).

### 9. Loop / exit

- `next`: print 1-line summary (`#${NUM}: fixed (${SHA})`), exit.
- `drain`: continue to next queue item. Stop on first block.

## Style — keep comments terse

Issues are specs, not docs. Compress aggressively.
- **Fix Notes**: SHA + branch line + 1–4 line verify steps. No multi-paragraph rationale.
- **Block comments**: 2–3 lines — what's missing or what failed, what the human needs to do, where state lives (worktree path) if any.

## Guardrails

- No `git push`. No PR. User pushes `{wb}` when ready — push boundary is theirs.
- The only merge into `{wb}` is `git merge --ff-only $BR` from a freshly-rebased qa branch, with the pre-merge gate satisfied (main checkout on `{wb}`). Anything else (non-ff merge, merge from a stale qa branch, merge from the wrong branch) → block, never improvise. A dirty main checkout is not a blocker by itself — let `git merge --ff-only` decide; it'll only refuse when a dirty file overlaps with the merge, and we block on that error.
- No `git reset --hard` / `git clean -fd` / force-push / branch delete on `{wb}`. Only on `qa/*` after a successful merge.
- No `git checkout {wb}` while the main checkout is on a different branch — block instead. Never silently `stash`.
- No `git add .` / `-A`. No `commit --amend`. No rebase of `{wb}`.
- Never close or reopen issues — close is the human verifier's signal, reopen is theirs too.
- Add `qa:verify` only in step 7 (after a successful merge). Remove it only in step 1 (claim of a reopened issue). Never toggle elsewhere.
- Don't change `qa:p1` / `qa:p2` / `qa:p3` labels — those are reporter's classification.
- Don't operate on issues whose `repo` field doesn't match `.qa-config.json#repo`.
- Destructive shortcut to make progress (force-merge, skip rebase, ignore the dirty-wb gate, etc.) → block, don't improvise.

## Invocations

```
/loop 30s /fix-qa-issue        # poll while QA is active
/fix-qa-issue drain            # drain current queue once
/fix-qa-issue next             # one issue, exit
```
