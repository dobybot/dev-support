---
name: start-work-on-jira-issue
description: Start working on a Jira issue by checking git status, reading ticket details, and creating a properly named branch from the correct base branch (main for hotfix, uat for new-feature). Supports multiple projects (dobybot, dobybot-ui, dobysync) and optional worktree mode for parallel ticket work.
---

# Start Working on a Jira Issue

## Inputs
1. **Jira Ticket ID** — e.g. `DBT-100`
2. **Type of work** — `hotfix` or `new-feature`
3. **Project names** — one or more of: `dobybot`, `dobybot-ui`, `dobysync`
   - All projects live under `~/Projects/dobybot/dobybot-workspace/{project_name}`
4. **Worktree mode** — `yes` or `no`. Ask the user if not specified.
   - **No** (default) — branch is checked out directly in the main project checkout. Classic single-ticket workflow.
   - **Yes** — branch is checked out in a per-ticket worktree at `~/Projects/dobybot/dobybot-workspace/tickets/{TICKET_ID}/{project_name}`, leaving each main checkout free for other tickets. Use this when working on multiple tickets in parallel.

## Pre-flight Checks (for each project)

1. **Clean working directory** — Run `git status` in each project directory and confirm there are no uncommitted changes. If any project is dirty, stop and ask the user to commit or stash before proceeding.

2. **Correct starting branch** — Based on the type of work:
   - `hotfix` → must be on `main`. Run `git checkout main && git pull origin main`.
   - `new-feature` → must be on `uat`. Run `git checkout uat && git pull origin uat`.

## Steps

### 1. Read the Jira ticket
- Use the Jira tool to fetch the ticket details for the given ticket ID.
- Extract the **summary** (title) of the ticket.

### 2. Create the branch name
- Translate/convert the ticket summary to a short English slug (lowercase, kebab-case, max ~60 chars).
- Format: `{TICKET_ID}-{type-of-work}-{short-english-summary}`
  - Example: `DBT-100-hotfix-fix-etax-document-upload`
- Show the proposed branch name to the user and ask for confirmation before creating.
- The **same branch name** is used across all specified projects.

### 3. Create the branch (for each project)

**Non-worktree mode** — check out the branch directly in the main checkout:
```bash
cd ~/Projects/dobybot/dobybot-workspace/{project_name}
git checkout -b {branch_name}
```

**Worktree mode** — create the branch in each main checkout *without* switching HEAD, then run the worktree helper once for all selected projects:
```bash
# For each selected project (does not change HEAD):
cd ~/Projects/dobybot/dobybot-workspace/{project_name}
git branch {branch_name}

# Then once, from anywhere:
~/Projects/dobybot/dobybot-workspace/dev-support/scripts/wt-add.sh \
  {TICKET_ID} {branch_name} --repos {comma-separated-projects}
```

The helper creates worktrees at `~/Projects/dobybot/dobybot-workspace/tickets/{TICKET_ID}/{project_name}` and prepares deps (`.env` symlinks for dobybot/dobybot-ui, fresh `.venv` for dobybot, fresh `node_modules` for UI repos). Main checkouts stay on their base branches, ready for the next ticket.

### 4. Summarize what was done
Print a summary table showing for each project:
- Project name
- Branch name created
- Base branch (main or uat)
- Working directory (main checkout path, or worktree path if worktree mode)
- Status (success or error)

Then remind the user of the workflow:

**If hotfix:**
> Workflow reminder:
> 1. Develop on this branch
> 2. Merge into `uat` for human testing
> 3. Create PR into `main` for code review
> 4. Once tests pass and review is approved → merge to `main` to deploy

**If new-feature:**
> Workflow reminder:
> 1. Develop on this branch
> 2. Create PR into `uat` for code review
> 3. Once approved → merge into `uat`
> 4. Test on UAT environment
> 5. When ready → merge `uat` into `main` on release date
