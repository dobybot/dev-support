# Dev Support

Development workflow automation and coding standards for the Dobybot workspace.

## What's Inside

### Agent Skills

Reusable workflow automations in `.agents/skills/`:

| Skill | Description |
|-------|-------------|
| **start-work-on-jira-issue** | Creates a properly named git branch from the right base branch (`main` for hotfix, `uat` for new feature) using the Jira ticket ID and summary. |
| **submit-work** | Pushes code, opens a PR, merges to `uat` if hotfix, and updates Jira labels (`ENV:uat`, `TEST:testing`/`TEST:review`). |
| **generate-test-cases** | Generates test cases from the Jira ticket, confirms with the developer, then syncs them to Kiwi TCMS with test plans and runs. |

### Django Coding Rules

Shared coding standards in `.agent/rules/` that are automatically applied when working on Django projects:

- **project-structure** — Clean separation of concerns, one APIView per file, type safety
- **django-api-views** — Validator + ResponseSerializer pattern, concise docstrings
- **django-authentication** — Custom authentication classes (e.g. header-based team auth)
- **django-service-layer** — Business logic in services, HTTP handling in views, Pydantic for complex params
- **django-error-response** — Standardized `{code, message, detail}` error format
- **django-exceptions** — Custom exception classes, small try-catch at API layer only

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
