---
name: start-work-on-jira-issue
description: Start working on a Jira issue by checking git status, reading ticket details, and creating a properly named branch from the correct base branch (main for hotfix, uat for new-feature).
---

# Start Working on a Jira Issue

## Inputs
1. **Jira Ticket ID** — e.g. `DBT-100`
2. **Type of work** — `hotfix` or `new-feature`
3. **Repository** — ['dobybot', 'dobybot_ui', 'dobysync']

## Pre-flight Checks

1. **Clean working directory** — Run `git status` and confirm there are no uncommitted changes (staged, unstaged, or untracked files that matter). If the working directory is dirty, stop and ask the user to commit or stash their changes before proceeding.

2. **Correct starting branch** — Based on the type of work:
   - `hotfix` → must be on `main`. Run `git checkout main && git pull origin main`.
   - `new-feature` → must be on `uat`. Run `git checkout uat && git pull origin uat`.

## Steps

### 1. Read the Jira ticket
- Use the Jira tool to fetch the ticket details for the given ticket ID.
- Extract the **summary** (title) of the ticket.

### 2. Create the branch name (every repository use the same branch name)
- Translate/convert the ticket summary to a short English slug (lowercase, kebab-case, max ~60 chars).
- Format: `{TICKET_ID}-{worktype}-{short-english-summary}`
  - Example: `DBT-100-fix-etax-document-upload`
- Show the proposed branch name to the user and ask for confirmation before creating.

### 3. Create and checkout the branch for each repository
```bash
git checkout -b {branch_name}
```

### 4. Summarize what was done
Print a summary:
- Ticket ID and summary
- Branch name created
- Base branch (main or uat)
- Remind the user of the workflow:

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
