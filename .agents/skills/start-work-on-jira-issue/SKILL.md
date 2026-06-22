---
name: start-work-on-jira-issue
description: Start a Jira ticket fast — gather inputs, resolve the workspace path, then hand the whole mechanical job (read ticket, name the branch, build a per-ticket worktree of the full stack with parallel dep installs) to a haiku sub-agent. Branch base is chosen by track — fast-track (small feature / bug fix) off main, normal-track (large feature) off uat; dobysync uses main-v2 / uat-v2. Always worktree mode.
---

# Start Working on a Jira Issue

The skill is split in two: a **thin interactive front desk** (this agent) that gathers the few
human-judgment inputs, and a **haiku worker** (a sub-agent) that does everything mechanical and
slow. Always worktree mode. The goal is to get the dev coding ASAP.

## Tracks (the workflow)

| Track | When | Base (dobybot, dobybot-ui, dobybot-report-ui) | Base (dobysync) | Downstream flow |
|-------|------|-----------------------------------------------|-----------------|-----------------|
| **fast-track** | small feature **or** bug fix | `main` | `main-v2` | PR → `main`; side-merge → `uat` for human testing; merge `main` to deploy |
| **normal-track** | large feature | `uat` | `uat-v2` | PR → `uat`; merge; test on UAT; merge `uat` → `main` on release date |

Track is **the user's call per ticket** (the Jira issue type is untrustable). Heuristic: *easy +
low blast-radius → fast-track; otherwise → normal-track.* If the user didn't say, ask in plain
chat — do not guess, the base branch depends on it.

## Inputs (the front desk gathers these — all of them — before dispatching the worker)

1. **Jira Ticket ID** — e.g. `DBT-417` (from the invocation).
2. **Track** — `fast-track` or `normal-track` (see above; ask if unstated).
3. **Edited repos** — one or more of `dobybot`, `dobybot-ui`, `dobysync` — the repos this ticket
   actually **edits** (ask if unstated). The worktree always also scaffolds the rest of the
   dobybot stack run-only; dobysync is scaffolded only when it's an edited repo.
4. **Workspace path** + (if dobysync edited) **dobysync local `.env`** — resolved/persisted, see below.

## Step 0 — Resolve config (front desk, interactive; never delegate this)

A backgroundable worker can't stop to ask, so the **front desk** resolves every interactive value
first.

### Workspace path
Resolve in this order, stop at the first hit:
1. `$DOBYBOT_WORKSPACE` if exported.
2. The persisted file `~/.config/dobybot/workspace` (one line: the abs path).
3. **First run** — ask the user in plain chat for the absolute workspace path. **Validate** it
   exists and contains `dev-support/` + the repo dirs, then persist it:
   ```bash
   mkdir -p ~/.config/dobybot && printf '%s\n' "<abs-path>" > ~/.config/dobybot/workspace
   ```

### dobysync local `.env` (only if dobysync is an edited repo)
The dobysync worktree must **never** symlink the shared `.env` — it points at PROD `:15434` with
`load_dotenv(override=True)`, so `manage.py test` would create a test DB on prod. We keep a safe
local-`:5433` `.env` machine-local and **copy** it into the worktree.
1. If `~/.config/dobybot/dobysync.env.local` exists → use it.
2. **First time** — ask the user (plain chat) to paste / point to their local-`:5433` dobysync
   `.env`, write it to `~/.config/dobybot/dobysync.env.local`, then reuse it forever after.

## Step 1 — Dispatch the haiku worker (then BLOCK)

Spawn **one** sub-agent with `subagent_type` defaulted and `model: "haiku"`, **not** in the
background — block until it returns its summary. Hand it every resolved input so it never has to
ask. The worker prompt must instruct it to:

1. **Read the Jira ticket** for `{TICKET}` and extract the summary.
2. **Derive the branch name**: translate the summary to a short English kebab slug (≤ ~60 chars),
   then build `{TICKET}--{track}--{slug}` (double-dash separators), e.g.
   `DBT-417--fast-track--vrich-report`. The **same branch name** is used across all edited repos.
3. **Create the branch off the fresh remote base, without checking out the main checkout** — for
   each *edited* repo, using the per-repo base from the track table:
   ```bash
   git -C {workspace}/{repo} fetch origin {base}
   git -C {workspace}/{repo} branch {branch} origin/{base}
   ```
   (Never `git checkout`/`pull` the main checkout — it stays free, and this guarantees the branch
   starts from the up-to-date remote base. No clean-working-dir preflight is needed: the worktree
   is independent of the main checkout's state.)
4. **Build the worktree** by running the script that ships with this skill:
   ```bash
   ~/.claude/skills/start-work-on-jira-issue/wt-add.sh \
     --workspace {workspace} --ticket {TICKET} --branch {branch} \
     [--with-dobysync --dobysync-env ~/.config/dobybot/dobysync.env.local]   # only if dobysync edited
   ```
   The script always scaffolds the dobybot stack (edited repos on the ticket branch, the rest
   detached run-only), adds dobysync only with `--with-dobysync`, installs all repos' deps **in
   parallel**, and writes `tickets/{TICKET}/{TICKET}.code-workspace` whose **"All Servers"**
   compound boots the whole stack on **F5**. (It does NOT auto-open VS Code — open the
   `.code-workspace` file yourself.)
5. **Return a summary table**: for each repo — branch (or "detached run-only"), base branch,
   worktree path, deps status (✓/✗).

## Step 2 — Report (front desk)

Relay the worker's summary table, then the matching workflow reminder:

**fast-track:** 1) develop on this branch · 2) merge into `uat` for human testing · 3) PR into
`main` for code review · 4) tests pass + approved → merge to `main` to deploy.

**normal-track:** 1) develop on this branch · 2) PR into `uat` for code review · 3) approved →
merge into `uat` · 4) test on UAT · 5) ready → merge `uat` into `main` on release date.

(dobysync edits ride the same flow against its `*-v2` branches.)
