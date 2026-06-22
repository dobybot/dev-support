---
name: submit-work
description: Open a PR and update Jira when code is ready. Detects the track (fast-track or normal-track) from the branch name — also understands the legacy hotfix/new-feature keywords — and follows the correct PR/merge flow per repo, including dobysync's main-v2/uat-v2 bases.
---

# Submit Work

## Inputs
1. **Branch name** — detected automatically from the current branch via `git branch --show-current`.
   - The branch name encodes the **track** and Jira ticket ID.
   - **Current format:** `{TICKET_ID}--{fast-track|normal-track}--{summary-slug}` (double-dash
     separators), e.g. `DBT-417--fast-track--vrich-report`.
   - **Legacy format (still supported):** `{TICKET_ID}-{hotfix|new-feature}-{summary-slug}`
     (single-dash), e.g. `DBT-100-hotfix-fix-etax-document-upload`.
2. **Project names** — one or more of: `dobybot`, `dobybot-ui`, `dobysync`
   - Resolve each repo path the same way start-work does: `$DOBYBOT_WORKSPACE`, else
     `~/.config/dobybot/workspace`, then `<workspace>/{project_name}` (or the ticket worktree at
     `<workspace>/tickets/{TICKET_ID}/{project_name}` if you're submitting from one).

## Track ⇄ legacy keyword mapping

| Track | Legacy keyword | PR flow |
|-------|----------------|---------|
| **fast-track** | `hotfix` | PR → base; side-merge → testing branch |
| **normal-track** | `new-feature` | PR → base; **do not merge** |

## Per-repo base branches

| Repo | fast-track base | normal-track base | testing branch (fast-track side-merge) |
|------|-----------------|-------------------|----------------------------------------|
| `dobybot`, `dobybot-ui` | `main` | `uat` | `uat` |
| `dobysync` | `main-v2` | `uat-v2` | `uat-v2` |

## Pre-flight Checks (for each project)

1. **Parse branch name** — Extract the Jira ticket ID and the track. Accept **both** separator
   styles: split on `--` first; if there's no `--`, fall back to the legacy single-dash form.
   Recognize tokens `fast-track`/`normal-track` **and** legacy `hotfix`/`new-feature`, normalizing
   to a track via the mapping table above. The ticket ID is the leading `{PROJ}-{NUM}` segment in
   either form.
2. **Commit all changes** — Run `git add . && git commit -m "{ticket_id} {summary}"` to ensure all changes are committed.
3. **Push branch** — Ensure the branch is pushed to the remote: `git push -u origin {branch_name}`.

## Workflow by Track

Use the per-repo base table to pick the actual base/testing branches — e.g. a fast-track dobysync
branch PRs into `main-v2` and side-merges into `uat-v2`; a fast-track dobybot branch PRs into
`main` and side-merges into `uat`.

### fast-track (legacy: hotfix)

1. **Create PR → base** (`main` for the dobybot stack, `main-v2` for dobysync)
   - Use the Jira ticket summary as the PR title, prefixed with the ticket ID (e.g. `DBT-100: Fix eTax document upload`).
   - Include a link to the Jira ticket in the PR description.

2. **Merge branch into the testing branch** (`uat`, or `uat-v2` for dobysync) so it can be tested:
   ```bash
   git checkout {testing_branch} && git pull origin {testing_branch}
   git merge {branch_name}
   git push origin {testing_branch}
   git checkout {branch_name}
   ```
   - If there are conflicts, ask the user to resolve them manually and then continue.

3. **Add labels to Jira ticket**: `ENV:uat`, `TEST:testing`

4. **Transition Jira ticket status → `TESTING`**.

### normal-track (legacy: new-feature)

1. **Create PR → base** (`uat` for the dobybot stack, `uat-v2` for dobysync)
   - Use the Jira ticket summary as the PR title, prefixed with the ticket ID (e.g. `DBT-100: Add usage metrics dashboard`).
   - Include a link to the Jira ticket in the PR description.
   - **Do NOT merge** — the user will merge after the PR is approved.

2. **Add labels to Jira ticket**: `ENV:uat`, `TEST:review`

## Confirmation

Before executing any of the above steps, present a summary of the planned actions and **ask the user for confirmation** to proceed.

## Summary

After completion, print a summary table showing for each project:
- Project name
- PR link and target branch
- Jira ticket updated (yes/no)
- Merge into the testing branch performed (fast-track only)
- Status (success or error)

Then display:
- Link to the Jira issue
- Links to all GitHub PRs created
