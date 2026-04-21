---
name: generate-test-cases
description: Generate test cases from a Jira issue, get human confirmation, and sync them to Kiwi TCMS with test plan and test run.
---

# Generate Test Cases to Kiwi TCMS

## Inputs
1. **Jira Ticket ID** — extracted from the current branch name
2. **Repository** — the current repository name determines the product

```
branch name format: {jira-issue-id}-{hotfix|new-feature}-{summary-slug}
example: DBT-100-hotfix-fix-etax-document-upload
```

## Product Mapping
| Repository name         | Kiwi TCMS Product |
|-------------------------|-------------------|
| `dobybot`, `dobybot_ui` | Dobybot           |
| `dobysync`              | Dobysync          |

## Constants
- **Product version**: `uat`
- **Build**: `uat`
- **Plan type**: `Functional`
- **Test case status**: `CONFIRMED` (human review happens during agent interaction)
- **Tester / Manager**: `t.thanasopon@gmail.com` (look up user PK via `User.filter`)
- **Test environments**: `https://uat.dobybot.com`, `https://uat.dobysync.com`, `https://api-uat.dobybot.com`

## Priority Definitions
- **P1** — Must run before every deploy to production
- **P2** — Should run before every deploy to production if possible, can be run later
- **P3** — Nice to run before deploy, can be run later

## Tester Constraints (IMPORTANT)
Test cases are run by QA testers, not developers. Write every step so it can be executed under these constraints:

- **Environments**: testers only use **UAT** (`https://uat.dobybot.com`, `https://uat.dobysync.com`) or **PROD**. Never instruct them to run anything on `localhost`, Docker, or a dev machine.
- **No database / admin access**: testers cannot open Django admin, run SQL, or inspect DB rows. All assertions must be verifiable via the user-facing UI or public API response that the UI exposes.
- **No backend logs / webhook logs / payload inspection**: do not ask testers to read server logs, Cloud Logging, Sentry, or request bodies. If the underlying behaviour is at the payload level, design the check as an **end-to-end UI observation** (e.g. "Send the order from Dobysync Send Orders page, then confirm the expected column/dialog content appears in Dobybot Order Center").
- **No code / terminal**: testers don't run scripts, curl, or open browser dev tools unless the step is purely about a visible console error.

If a behaviour genuinely cannot be checked from the UI, either (a) rewrite it as an end-to-end UI check, or (b) flag it to the user during Step 4 so they can decide to skip it or cover it with a developer-owned integration test instead of a QA test case.

## Test Case Text Format (Thai)
All test case content is written in Thai and stored in the `text` field as Markdown.

Use three sections — **Preconditions**, **Steps**, **Expected Result**. Inside each step or bullet, use **indented sub-bullets** (4-space indent) to group small actions or checks so the step list stays short and scannable. Avoid one long paragraph per step.

```
## เงื่อนไขเบื้องต้น (Preconditions)
- Login เข้า Dobybot UAT ที่ https://uat.dobybot.com
- อยู่ที่หน้า Order Center
- มีออเดอร์ที่ xxx

## ขั้นตอนการทดสอบ (Steps)
1. เปิดหน้า xxx ที่ https://uat.dobybot.com/xxx
2. Filter หาข้อมูลที่ต้องการ
    - ตั้งค่า A = `...`
    - ตั้งค่า B = `...`
    - กด Search
3. กดปุ่ม **Send** แล้วตรวจสอบผลลัพธ์
    - UI แสดง ...
    - ไม่มี error บนหน้าจอ

## ผลลัพธ์ที่คาดหวัง (Expected Result)
- ระบบแสดงข้อความ xxx
- ข้อมูลที่แสดงใน UI ตรงกับข้อมูลต้นทาง (ไม่ต้องตรวจ DB / log)
```

Formatting rules:
- Preconditions: flat bullet list (no numbering).
- Steps: numbered 1., 2., 3. — one action per number. Use `    -` sub-bullets for detail.
- Expected Result: flat bullet list.
- Use **bold** for UI element names (button labels, column names, fields) and `` ` `` backticks for literal values / URLs.

## Workflow

### Step 1: Parse Branch & Gather Context
1. Run `git branch --show-current` to get the branch name.
2. Extract the Jira issue ID (e.g. `DBT-100`) from the branch name.
3. Use the Jira tool to fetch the ticket details (summary, description, acceptance criteria).
4. Check git changes on the current branch for code understanding:
   ```bash
   git log uat..HEAD --oneline   # or main..HEAD for hotfix
   git diff uat..HEAD --stat
   git diff uat..HEAD             # read actual changes
   ```
5. If code changes are insufficient to understand the feature, ask the user for more context.

### Step 2: Search Existing Test Plans & Test Cases
Before generating new test cases, search Kiwi TCMS for existing related content to prevent duplicates.

1. **Search for existing test plans** related to this feature:
   ```bash
   uv run python .agents/skills/generate-test-cases/kiwi/lookup.py TestPlan '{"name__icontains": "<feature_name>"}'
   ```
2. **Search for existing test cases** related to this Jira issue (by tag or summary):
   ```bash
   uv run python .agents/skills/generate-test-cases/kiwi/search_testcases.py --tag "{jira-issue-id}"
   uv run python .agents/skills/generate-test-cases/kiwi/search_testcases.py --summary "<keywords>"
   ```
3. Present any existing test plans/cases to the user so they are aware of what already exists.

### Step 3: Generate Test Cases (AI)
Using the Jira issue context, code changes, and existing test coverage:
1. Generate a set of test case proposals. Each test case has:
   - **summary** — short description (Thai)
   - **priority** — P1, P2, or P3
   - **category** — format: `<page_name>/<feature_name>` (per-product)
   - **component** — the part of the product being tested (e.g. Login, eTax, API)
   - **text** — full test case body in Thai using the format above, respecting the **Tester Constraints** section (UAT/PROD only, no DB/log/terminal access, sub-bulleted steps)
2. Print a numbered list showing each proposed test case.
3. Note which test cases overlap with existing ones found in Step 2.
4. If any proposed check cannot be done from the UI alone, either rewrite it as an end-to-end UI observation or flag it so the user can decide to drop it.

### Step 4: Human Confirmation
1. Ask the user: "ยืนยันสร้าง test cases เหล่านี้หรือไม่? แก้ไขหรือเพิ่มเติมได้"
2. The user can:
   - Confirm all (`ok`)
   - Edit specific test cases (by number)
   - Remove test cases (by number)
   - Add new test cases
   - Adjust the test plan name
3. Also confirm the **test plan name** (feature_name) — AI proposes, human confirms.

### Step 5: Create in Kiwi TCMS
All scripts are in `.agents/skills/generate-test-cases/kiwi/`.
All commands must be run from the **dev-support project root** using `uv run python` so that `uv` resolves the correct Python version and dependencies (e.g. `tcms-api`, `python-dotenv`).

#### 5a. Look up required PKs
```bash
# Look up product PK
uv run python .agents/skills/generate-test-cases/kiwi/lookup.py Product '{"name": "Dobybot"}'

# Look up version PK
uv run python .agents/skills/generate-test-cases/kiwi/lookup.py Version '{"product__name": "Dobybot", "value": "uat"}'

# Look up build PK
uv run python .agents/skills/generate-test-cases/kiwi/lookup.py Build '{"version__value": "uat", "name": "uat"}'

# Look up plan type PK
uv run python .agents/skills/generate-test-cases/kiwi/lookup.py PlanType '{"name": "Functional"}'

# Look up user PK
uv run python .agents/skills/generate-test-cases/kiwi/lookup.py User '{"email": "t.thanasopon@gmail.com"}'

# Look up priority PK (P1=1, P2=2, P3=3 — verify with lookup)
uv run python .agents/skills/generate-test-cases/kiwi/lookup.py Priority '{}'

# Look up CONFIRMED status PK
uv run python .agents/skills/generate-test-cases/kiwi/lookup.py TestCaseStatus '{"name": "CONFIRMED"}'
```

#### 5b. Find or create category
```bash
# Search for existing category
uv run python .agents/skills/generate-test-cases/kiwi/lookup.py Category '{"product__name": "Dobybot", "name": "eTax/Document Upload"}'
```

#### 5c. Create test cases
For each confirmed test case:
```bash
uv run python .agents/skills/generate-test-cases/kiwi/create_testcase.py \
  --summary "ทดสอบการอัพโหลดเอกสาร eTax" \
  --product <product_pk> \
  --category <category_pk> \
  --priority <priority_pk> \
  --case-status <confirmed_status_pk> \
  --text "## เงื่อนไขเบื้องต้น (Preconditions)..."
```
After creation, tag each test case with the Jira issue ID:
```bash
uv run python .agents/skills/generate-test-cases/kiwi/lookup.py TestCase.add_tag '<case_id>' '{jira-issue-id}'
```

#### 5d. Find or create test plan
```bash
# Search for existing test plan
uv run python .agents/skills/generate-test-cases/kiwi/lookup.py TestPlan '{"name": "<feature_name>", "product": <product_pk>}'

# If not found, create one
uv run python .agents/skills/generate-test-cases/kiwi/create_testplan.py \
  --name "<feature_name>" \
  --product <product_pk> \
  --version <version_pk> \
  --type <plantype_pk> \
  --text "Test plan for <feature_name>"
```

#### 5e. Add test cases to test plan
```bash
uv run python .agents/skills/generate-test-cases/kiwi/add_case_to_plan.py --plan <plan_pk> --case <case_pk>
```

#### 5f. Create test run
```bash
uv run python .agents/skills/generate-test-cases/kiwi/create_testrun.py \
  --summary "{jira-issue-id} {jira-summary} {datetime}" \
  --plan <plan_pk> \
  --build <build_pk> \
  --manager <user_pk>
```

#### 5g. Add test cases to test run
```bash
uv run python .agents/skills/generate-test-cases/kiwi/add_case_to_run.py --run <run_pk> --case <case_pk>
```

### Step 6: Print Summary
Print a summary of what was done:
- Number of test cases created (with IDs and summaries)
- Test plan used (created new or reused existing, with link)
- Test run created (with link)
- Any existing test cases that were skipped (duplicates)

## Kiwi Python Scripts

All scripts live in `.agents/skills/generate-test-cases/kiwi/` and follow the Unix principle of doing one thing well.

| Script | Purpose |
|---|---|
| `kiwi_client.py` | Shared module — creates TCMS-API connection (not a CLI) |
| `lookup.py` | Generic entity filter: `uv run python .agents/skills/generate-test-cases/kiwi/lookup.py <Entity> '<json_filter>'` |
| `search_testcases.py` | Search test cases by tag, summary, or other criteria |
| `create_testcase.py` | Create a single test case |
| `create_testplan.py` | Create a test plan |
| `create_testrun.py` | Create a test run |
| `add_case_to_plan.py` | Link a test case to a test plan (`TestPlan.add_case`) |
| `add_case_to_run.py` | Add a test case to a test run (`TestRun.add_case`) |
