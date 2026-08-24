---
name: port-branch
description: Guide porting an unfinished branch/PR from an old pre-monorepo repo (dobybot, dobybot-ui, dobysync, record-v2, report-ui, dobybot-e2e) into this monorepo under its prefix (services/<name>/, or e2e/ for dobybot-e2e). Use when someone says they have a WIP branch in an old repo, work that wasn't merged before the migration freeze, or asks to "port"/"carry over"/"move" a branch into the monorepo.
user-invocable: true
---

# Port an old-repo branch into the monorepo

Drive `tools/port-branch.sh`. It carries one old-repo branch's **own commits** into the
service's monorepo prefix (`services/<name>/`, or `e2e/` for `dobybot-e2e`) on a fresh
branch cut from a monorepo deploy branch. Full reference:
`docs/operations/porting-wip.md` (Thai). Talk to the user in their language; write any
PR/issue text in **Thai** (code, paths, branch names stay English).

## 1. Gather the three inputs (ask only what's missing)
- **service** — which old repo? One of: `dobybot` `dobybot-ui` `dobysync` `record-v2` `report-ui` `dobybot-e2e`.
- **branch** — the branch name in the old repo (or a **PR number** → use `--pr <N>`).
- **onto** — `uat` (most common) or `main`. The script maps to the old base automatically
  (dobysync `uat`→`uat-v2`; report-ui and dobybot-e2e have a single branch → `--onto` always
  maps to it).

If they don't know the exact branch name, list candidates:
`git -C ../<service-dir> branch -r | grep -i <ticket>`.

## 2. Preflight (don't skip — these are the failure modes)
- Run from inside the monorepo working tree, on a **clean** tree (commit/stash first).
- The old repo must be checked out **next to** the monorepo (e.g. `../dobybot-ui`). If not:
  `git clone git@github.com:<owner>/<repo>.git ../<dir>`, then pass `--repo <path>`.
- **No `git am`/rebase already in progress.** If a previous port stopped on a conflict and
  was abandoned, the script will refuse to start — tell the user to `git am --abort` first
  (or resolve it), then retry. Never `git checkout` away from a half-finished `am`.

## 3. Always `--doctor` first, then confirm
```bash
tools/port-branch.sh --service <name> --branch <branch> --onto <uat|main> --doctor
```
Show the user the plan: the **delta** (N commits), the old base, and the new branch name.
- Delta `0` → already merged via the import; **stop, nothing to port.**
- Sanity-check N is what they expect (not the whole history).

## 4. Run the port
```bash
tools/port-branch.sh --service <name> --branch <branch> --onto <uat|main> [--as <branch>] [--squash]
```
- `--as` to rename the monorepo branch (default = old branch name).
- `--squash` for a noisy WIP branch → collapses to one commit.
- It leaves the branch **local** (no push). That's intended — review first.

## 5. If it stops on a conflict (expected for older branches)
The toolchain moved (uv/pnpm, relocated `cloudbuild/`, added `/version`) and the deploy
branch advanced, so high-churn files (`lang/translation/*.json`, lockfiles, build files)
often conflict. This is the user's to resolve — guide them:
```bash
# edit the conflicted files, then:
git add <files> && git am --continue   # proceed to next commit
git am --skip                          # drop just this commit
git am --abort                         # bail; delete the branch and retry
```
Help resolve the conflicts if asked. A botched port is free — abort, delete the branch, re-run.

## 6. Finish
Review the diff with the user, then push + open the PR (the script prints the exact commands):
```bash
git push -u origin <branch>
gh pr create --base <onto> --head <branch> --repo dobybot/dobybot-monorepo
```
Write the PR title/body in **Thai**. One ticket = one branch = one PR — for a cross-repo
ticket, port each service into its own branch and merge them into one ticket branch
(see the runbook's cross-repo recipe).
