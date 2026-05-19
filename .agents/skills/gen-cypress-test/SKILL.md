---
name: gen-cypress-test
description: Generate Cypress E2E tests by retrieving test cases, analyzing dobybot-ui for data-cy, designing UI commands, and implementing the tests.
---

# Generate Cypress Test (gen-cypress-test)

## 🎯 Objective
To generate Cypress E2E test scripts automatically by retrieving test cases from Kiwi TCMS, analyzing the frontend (`dobybot-ui`) codebase for missing selectors, designing reusable Cypress commands, and fully implementing the test scripts.

## 🛠 Technical Workflow & Instructions

### 1. Get Test Case
- **Action:** Retrieve the test case details using the existing skill script.
- **Command:**
  ```bash
  uv run python .agents/skills/generate-test-cases/kiwi/search_testcases.py --id <test_case_id>
  ```
  *(Note: Run this from the `dev-support` project root).*

### 2. Analyze Test Case & Codebase (`dobybot-ui`)
- **Analysis:** Read and understand the steps, preconditions, and expected results from the retrieved test case.
- **Learn Codebase:** Investigate the `dobybot-ui` codebase using `codebase-retrieval` to find the relevant components and pages used in the test case flow.
- **Add `data-cy`:**
  - Check if the required elements (buttons, inputs, tables, etc.) have `data-cy` attributes.
  - If they are missing, design patches to add `data-cy` to the `dobybot-ui` project.
  - *Follow standard `data-cy` naming conventions.*

### 3. Design Cypress Test Case
Before writing the actual test script, design the required setup and commands:
- **Command Check (`commands.js`):**
  - Check existing commands in `d:\Dobybot\dobybot-e2e\cypress\support\commands.js` (and related barrel/support files).
  - Determine which existing commands can be reused.
  - Determine if any new setup or API-driven commands need to be created.
- **UI Commands Design:**
  - Identify UI elements or components that are used frequently in the flow.
  - Design new reusable UI commands for these components to keep the test scripts clean and maintainable.

### 4. Implementation
- **Action:** Implement the test script and any newly designed commands according to the plan.
- **Output:**
  - A complete Cypress `.cy.js` script in the appropriate `cypress/e2e/` folder.
  - New commands added to the relevant `cypress/support/` command files.
  - Proposed unified diffs for adding `data-cy` attributes to `dobybot-ui`.
