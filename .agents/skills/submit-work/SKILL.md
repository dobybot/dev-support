---
name: open-pr
description: Open a PR and update Jira when code is ready. Detects work type (hotfix or new-feature) from the branch name and follows the correct workflow for each.
---

# Open PR

## Inputs
1. **Branch name** — detected automatically from the current branch via `git branch --show-current`.
   - The branch name encodes the work type and Jira ticket ID.
   - Format: `{TICKET_ID}-{hotfix|new-feature}-{summary-slug}` (e.g. `DBT-100-hotfix-fix-etax-document-upload`)
2. **Project names** — one or more of: `dobybot`, `dobybot-ui`, `dobysync`
   - All projects live under `~/Projects/dobybot/{project_name}`

## Pre-flight Checks (for each project)

1. **Parse branch name** — Extract the Jira ticket ID (e.g. `DBT-100`) and work type (`hotfix` or `new-feature`) from the branch name.
2. **Commit all changes** — Run `git add . && git commit -m "{ticket_id} {summary}"` to ensure all changes are committed.
3. **Push branch** — Ensure the branch is pushed to the remote: `git push -u origin {branch_name}`.

## Workflow by Work Type

### Hotfix

1. **Create PR → `main`**
   - Create a pull request from `{branch_name}` into `main`.
   - Use the Jira ticket summary as the PR title, prefixed with the ticket ID (e.g. `DBT-100: Fix eTax document upload`).
   - Include a link to the Jira ticket in the PR description.

2. **Merge branch into `uat`**
   - Merge the branch into `uat` so it can be tested on the UAT environment:
     ```bash
     git checkout uat && git pull origin uat
     git merge {branch_name}
     git push origin uat
     git checkout {branch_name}
     ```

3. **Add labels to Jira ticket**
   - Add the following labels to the Jira ticket: `ENV:uat`, `TEST:testing`

4. **Update Jira ticket**
   - Add a comment (in Thai language) on the Jira ticket describing what to test and linking to the PR.

### New Feature

1. **Create PR → `uat`**
   - Create a pull request from `{branch_name}` into `uat`.
   - Use the Jira ticket summary as the PR title, prefixed with the ticket ID (e.g. `DBT-100: Add usage metrics dashboard`).
   - Include a link to the Jira ticket in the PR description.
   - **Do NOT merge** — the user will merge after the PR is approved.

2. **Update Jira ticket**
   - Add a comment (in Thai language) on the Jira ticket describing what to test and linking to the PR.

## Confirmation

Before executing any of the above steps, present a summary of the planned actions and **ask the user for confirmation** to proceed.

## Summary

After completion, print a summary table showing for each project:
- Project name
- PR link and target branch
- Jira ticket updated (yes/no)
- Merge into `uat` performed (hotfix only)
- Status (success or error)

Then display:
- Link to the Jira issue
- Links to all GitHub PRs created

