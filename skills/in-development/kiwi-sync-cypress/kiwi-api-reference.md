# Kiwi API Reference Notes for Skills

Use `docs/kiwi/kiwi-tcms-rpc-api.md` as the source of truth for the full Kiwi TCMS RPC API:

```text
docs/kiwi/kiwi-tcms-rpc-api.md
```

This file intentionally keeps only instance-specific notes and skill workflow guidance so the API reference is not duplicated in multiple places. Do not copy the full method table here.

## Important notes for `tcms.doby.me`

These notes came from probing the real `tcms.doby.me` instance in July 2026:

- There is no REST API at `/api/v6/`; it returned 404 during probing.
- JSON-RPC is available at `/json-rpc/`.
- XML-RPC is available at `/xml-rpc/`.
- JSON-RPC did not accept Basic Auth during probing. Use `Auth.login` and preserve the `sessionid` cookie for later requests.
- For Python scripts, prefer the `tcms-api` package against `/xml-rpc/`.
- `TC-131` in a test title maps directly to Kiwi test case id `131`. The numeric id is not expected to appear inside the Kiwi summary.
- Valid `automation_status` values observed/confirmed for this instance are:
  - `todo`
  - `in_progress`
  - `in_review`
  - `done`
  - `maintenance`
  - `not_automatable`

## Skill usage guidance

For AI-assisted Kiwi scripts in this repo, prefer the canonical CLI:

```bash
python .claude/scripts/kiwi/kiwi.py methods
python .claude/scripts/kiwi/kiwi.py filter TestCase '{"pk": 131}'
python .claude/scripts/kiwi/kiwi.py call TestExecution.update --arg 55 --arg-json '{"status": 4}'
```

The CLI reads credentials from:

```text
.claude/scripts/kiwi/.env
```

`kiwi-sync-cypress/sync.mjs` is intentionally kept as a specialized workflow script
because it parses Cypress JSON output and performs dry-run/apply status sync. It is
not a second general-purpose Kiwi client.

## Common RPC methods for Cypress sync

For details, signatures, permissions, and the complete method index, read `docs/kiwi/kiwi-tcms-rpc-api.md`.

Commonly used methods:

| Need | Method |
|---|---|
| Find a test case by numeric TC id | `TestCase.filter({"pk": tc_id})` |
| Find a sub-test case by title prefix | `TestCase.filter({"summary__startswith": "TC-143-2"})` |
| Update automation status | `TestCase.update(case_id, {"automation_status": "done"})` |
| Find test runs | `TestRun.filter(query)` |
| List cases in a run | `TestRun.get_cases(run_id)` |
| Update an execution result | `TestExecution.update(execution_id, values)` |

## Cypress automation status mapping

| Cypress result | Kiwi `automation_status` |
|---|---|
| pass | `done` |
| fail | `maintenance` |
| error | `maintenance` |
| pending / skip | `maintenance` |
| Not found in Cypress | Do not update |

If a single TC appears in multiple Cypress tests and any of them fails/errors/skips, `maintenance` wins over `done`.
