# Dev Support

Development workflow automation and coding standards for the Dobybot workspace.

## Installing the team skills (Claude Code)

Every skill in `.agents/skills/` is shared with the whole team. One-time setup
symlinks them into your Claude Code config and registers a `SessionStart` hook
that re-syncs on every launch — so after the first install, **`git pull` + relaunch
is all it takes for new skills to appear**.

```sh
git clone git@github.com:dobybot/dev-support.git
cd dev-support
./install.sh          # requires jq (brew install jq)
```

What `install.sh` does:

- resolves this clone's absolute path and writes a `SessionStart` hook into
  `~/.claude/settings.json` (backs the file up first) that runs
  `.agents/sync-skills.sh` on every Claude Code launch;
- runs the first sync immediately.

`sync-skills.sh` links each child of `.agents/{skills,agents,commands}/` into the
matching `~/.claude/` dir, one symlink per item. It is safe and idempotent:

- **never clobbers a personal skill** of the same name (it warns and skips);
- **prunes** its own links when a skill is deleted upstream;
- leaves all non-repo entries untouched.

Re-run `./install.sh` only if you move the clone to a new path. Removing the team
skills = delete the `SessionStart` hook from `~/.claude/settings.json` and remove
the symlinks under `~/.claude/skills` that point into this repo.

## What's Inside

### Agent Skills

Reusable workflow automations in `.agents/skills/`:

| Skill | Description |
|-------|-------------|
| **start-work-on-jira-issue** | Creates a properly named git branch from the right base branch (`main` for hotfix, `uat` for new feature) using the Jira ticket ID and summary. |
| **submit-work** | Pushes code, opens a PR, merges to `uat` if hotfix, and updates Jira labels (`ENV:uat`, `TEST:testing`/`TEST:review`). |
| **generate-test-cases** | Generates test cases from the Jira ticket, confirms with the developer, then syncs them to Kiwi TCMS with test plans and runs. |
| **generate-automated-test** | Converts Kiwi TCMS test cases into optimized, maintainable Cypress E2E scripts using API-driven state setup. |
| **generate-automated-test** | Converts Kiwi TCMS test cases into optimized, maintainable Cypress E2E scripts using API-driven state setup and reusable UI commands. |

### Local Databases

`docker-compose.yml` provides two PostgreSQL instances for local development:

| Service | Port | Purpose |
|---------|------|---------|
| dobybot_db | 5432 | Dobybot application database |
| dobysync_db | 5433 | Dobysync application database |

## Branch Naming Convention

Branches follow the pattern: `{TICKET_ID}-{worktype}-{summary}`

```
DBT-100-hotfix-fix-etax-document-upload
DBT-201-new-feature-add-report-export
```

## Workflow

```
start-work-on-jira-issue  →  develop & commit  →  submit-work
        │                                              │
        ├─ hotfix: branch from main                    ├─ hotfix: PR to main + merge to uat
        └─ new-feature: branch from uat                └─ new-feature: PR to uat
```

## Setup

Requires Python 3.14+ and [uv](https://docs.astral.sh/uv/).

```sh
uv sync
```

Start local databases:

```sh
docker compose up -d
```

## Cloning UAT into a local database

`scripts/clone-uat-to-local.sh` snapshots the UAT Postgres into a fresh local
database and rewrites `dobybot/.env` to point at it. The current `DATABASE_URL`
is commented out (not removed), and `.env` is backed up to
`.env.bak.<timestamp>` first.

### One-time setup (per dev)

1. **cloud-sql-proxy alias** (in `~/.zshrc`):
   ```sh
   alias cloud-sql-proxy-dobybot-main="cloud-sql-proxy --port 15432 \
     --credentials-file ~/Projects/dobybot/.gcp/dobybot-2f20c212773a.json \
     dobybot:asia-southeast1:main-2"
   ```
2. **UAT password in `~/.pgpass`** — never on the command line, never in `.env`:
   ```sh
   echo '*:15432:*:postgres:<UAT_PASSWORD>' >> ~/.pgpass
   chmod 600 ~/.pgpass
   ```
   Get `<UAT_PASSWORD>` from the team password manager.

### Per-run

```sh
# Terminal 1 — leave running
cloud-sql-proxy-dobybot-main

# Terminal 2 — clones into uat_clone_YYYYMMDD by default,
# or pass a name:  ./scripts/clone-uat-to-local.sh my_debug_db
./scripts/clone-uat-to-local.sh
```

The script aborts before touching local state if the proxy is down, the local
Postgres is down, or `~/.pgpass` is missing/world-readable. Cloud-SQL-only
objects (e.g. `cloudsqladmin` grants) produce harmless `pg_restore` warnings.
