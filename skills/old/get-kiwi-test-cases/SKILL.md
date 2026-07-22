---
name: get-kiwi-test-cases
description: Get test cases from Kiwi TCMS by ID or filter.
---

# Get Test Cases from Kiwi TCMS

## Description
This skill allows retrieving test cases from Kiwi TCMS by ID (PK) or by searching via filter (such as tag, summary, product, category).

## How to use

All commands must be run from the **dev-support project root** using `uv run python`.
You can use the existing script in `skills/old/generate-test-cases/kiwi/search_testcases.py` to get test cases.

### Get Test Case by ID (PK)
Use the `--id` argument to fetch a specific test case by its ID.
```bash
uv run python skills/old/generate-test-cases/kiwi/search_testcases.py --id <test_case_id>
```
Example:
```bash
uv run python skills/old/generate-test-cases/kiwi/search_testcases.py --id 1234
```

### Search Test Cases by Filter
You can use `search_testcases.py` to search by tag, summary, product, or category.
```bash
# Search by tag (e.g., Jira issue ID)
uv run python skills/old/generate-test-cases/kiwi/search_testcases.py --tag "DBT-100"

# Search by summary keywords
uv run python skills/old/generate-test-cases/kiwi/search_testcases.py --summary "eTax"

# Search by both
uv run python skills/old/generate-test-cases/kiwi/search_testcases.py --tag "DBT-100" --summary "upload"

# Filter by product or category PK
uv run python skills/old/generate-test-cases/kiwi/search_testcases.py --product 1 --category 5
```

Alternatively, use `lookup.py` with custom JSON filters if more complex queries are needed.
```bash
# Search by complex filter
uv run python skills/old/generate-test-cases/kiwi/lookup.py TestCase '{"category__product": 1, "category": 5}'
```

## Output
The scripts return a JSON array containing the matching test case objects. Each object includes fields like `id` (PK), `summary`, `text` (the detailed steps in Markdown), `priority`, `category`, `case_status`, and more.
