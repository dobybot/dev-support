---
name: generate-automated-test
description: Convert Kiwi TCMS test cases into optimized, maintainable Cypress E2E scripts using API-driven state setup and reusable UI commands.
---

# Generate Automated Test (Cypress)

An advanced automation agent designed to convert Kiwi TCMS test cases into optimized, maintainable Cypress E2E scripts for the **Dobybot** ecosystem.

## 🎯 Objective
To generate production-ready Cypress test scripts that adhere to the **DRY (Don't Repeat Yourself)** principle, leveraging **API-driven state setup** and **reusable UI commands**.

## 📥 Inputs
1. **Kiwi Test Case ID** (e.g., `1234`) or **Search Filter** (e.g., `--tag "DBT-100"`).
2. **Relevant Module** (e.g., Dashboard, Order Management, Auth) to determine the folder structure (`cypress/e2e/<module>/...`).

## 🛠 Technical Workflow & Instructions

### 1. Requirements Gathering (Kiwi TCMS)
* **Action:** Call the skill's existing Python script to retrieve the target test case details.
  ```bash
  uv run python dev-support/.agents/skills/generate-test-cases/kiwi/search_testcases.py --id <test_case_id>
  ```
  *(Run this from the workspace root).*
* **Analysis:** Parse the test case text (usually in Thai Markdown). Identify the core user flow, splitting it into **Preconditions**, **Steps**, and **Expected Results**.

### 2. Contextual Code Analysis (with Selector Audit)
* **Target Project:** `dobybot-ui` (Frontend).
* **Action:** Investigate the existing UI components and codebase using `codebase-retrieval`. For each Kiwi step, locate the **route** (`pages/...`), the **component** rendering each interactive element, and the **API endpoint(s)** the action triggers (for intercepts).
* **Selector Audit (mandatory):** For every interactive element the spec will touch:
  1. Search the component file for an existing `data-cy`.
  2. **Found** → record it for the spec.
  3. **Missing** → propose the smallest possible patch in `dobybot-ui`:
     - Note the file + line.
     - Choose a value following the **naming convention** below (verify against neighbouring elements in the same component family).
     - Output as a unified diff in **Deliverable 2**. Do **not** edit `dobybot-ui` until the developer confirms.
  4. Never fall back to `nth-child`, deep CSS class chains, or text-only `cy.contains` for clickable controls when adding a `data-cy` is feasible.
* **Reference:** `dobybot-e2e/docs/writing-your-first-test.md` § "การเพิ่ม data-cy attributes" — this practice is project policy.

#### `data-cy` naming convention (verified against existing UI)
`<page-or-feature>-<component-purpose>[-<modifier>]` — kebab-case, lowercase.

| Kind | Example |
|---|---|
| Page container | `fixcase-page` |
| Data table | `fixcase-data-table` |
| Dialog card | `fixcase-create-dialog-card` |
| Form field | `fixcase-form-cost-field`, `fixcase-form-detail-field` |
| Button | `create-fixcase-btn`, `close-fixcase-btn`, `open-create-fixcase-dialog-btn` |
| Dynamic per-row | `create-fix-order-btn-{id}` → use `data-cy^="create-fix-order-btn-"` in spec |
| Autocomplete | `pick-order-autocomplete` |

### 3. Mock Data & State Management (API-First)
* **Target File:** `dobybot-e2e/cypress/support/commands/seed.commands.js`.
* **Research:** Explore existing API commands (e.g., `cy.apiCreateOrder`, `cy.apiCreateFixCase`). Prioritize using these existing APIs over creating new ones.
* **Implementation:**
  * For every **Precondition**, if an API command exists, use it in the `before()` block.
  * If missing, propose a new **one-line execution command** (e.g., `cy.apiCreateX(token, params)`).
  * **Rule:** This command must use `cy.request()` to interact directly with the backend to ensure fast and reliable test execution. Avoid using the UI for setup.

### 4. UI Command Optimization
* **Target File:** `dobybot-e2e/cypress/support/commands/ui.commands.js` (or relevant `*.commands.js`).
* **Pattern Recognition:** Identify UI components used frequently or those with repeating interaction patterns (e.g., Modals, Search Tables, Navigation, Vuetify components like `v-autocomplete`).
* **Implementation:**
  * If a UI command exists (e.g., `cy.vAutoComplete`, `cy.vSelect`), use it.
  * If a pattern is detected but no command exists, **abstract the logic into a new UI Command**.
  * Ensure selectors used are stable (e.g., `data-cy` for app elements, `data-test` only for Vuetify internals like snackbars).

### 5. Final Code Generation
* **Output:** A complete `.cy.js` Cypress test file.
* **Structure:**
  1.  **Header:** Meta information (Test ID, Feature, File, Login requirement).
  2.  **`before()` block:** API-driven setup using token (`cy.apiLogin()`) and seed commands. Store identifiers in `let` variables.
  3.  **`beforeEach()` block:** Standard UI login (`cy.login(ADMIN_USERNAME, ADMIN_PASSWORD)`).
  4.  **Test Body (`it(...)`):** Execute the user flow using raw Cypress commands or optimized UI commands. Use numbered `// Step N:` comments. Use `cy.intercept` before actions that trigger API calls.
  5.  **Assertions (`// --- Expected Results ---`):** Implement rigorous checks based on the "Expected Results" from the Kiwi test case. Assert API status codes and UI states (e.g., snackbar visibility).

### 6. Human Confirmation & Output
Do **not** write the files to disk immediately. Instead, present the findings to the developer for review.
Print the following four deliverables:
1.  **Logic Summary** — high-level overview of how the test is structured (Setup, Action, Assertion).
2.  **Proposed `data-cy` additions in `dobybot-ui`** — file + line + proposed attribute, plus a unified diff per file. Empty section if none required.
3.  **New Commands** — full code for any new API or UI helpers, with target file path.
4.  **Cypress Script** — the complete `.cy.js` file content.

Ask for confirmation before proceeding to save files. The confirmation gate covers `dobybot-ui` patches, new commands, and the spec file alike.

---

## 📏 Standards & Constraints
- **Speed:** Never use the UI for "Pre-condition" setup if an API alternative is available. If a setup needs an API that does not exist, **flag it to the user** — do not invent backend endpoints.
- **Maintainability:** Avoid hardcoding repetitive interaction logic; always favor Custom Commands. Do not inline complex component logic in the spec.
- **Naming:** Follow the existing `camelCase` naming conventions for commands (`apiCreateX`, `vSelectX`) and `kebab-case` for file names (`feature-name.cy.js`) and `data-cy` values.
- **Selectors (`data-cy` is mandatory):** Every element the spec interacts with must have a `data-cy`. If `dobybot-ui` lacks one, propose the smallest possible patch (single attribute, no logic change, no refactor). `data-test` is reserved for Vuetify framework hooks (`[data-test="v-snackbar-top-right"]`, `[data-test="v-btn-right"]`). Never use `nth-child`, deep CSS class chains, or text-only `cy.contains` for clickable controls.
- **API assertions:** Declare `cy.intercept(...).as(alias)` **before** the action, then `cy.wait('@alias').its('response.statusCode').should('eq', NNN)`.
- **cy.prompt:** Default to raw Cypress commands (matches `cypress/e2e/fixcase.cy.js`). Use `cy.prompt` only if explicitly requested.
- **Command Barrel:** If introducing a new category of commands (e.g., `report.commands.js`), always update the barrel file `dobybot-e2e/cypress/support/commands.js` to import it.

## 🗂 Where new commands belong

| Pattern | Target file |
|---|---|
| New `cy.request`-based seeder | `cypress/support/commands/seed.commands.js` |
| New Vuetify / DOM helper | `cypress/support/commands/ui.commands.js` |
| Login / token / session | `cypress/support/commands/auth.commands.js` |
| Local-storage / settings prep | `cypress/support/commands/settings.commands.js` |
| New family (e.g. `report.*`) | new `commands/<family>.commands.js` **+ add `import` line to `cypress/support/commands.js`** |

## 📤 Expected Output Format (Example to present to user)

### 1. Logic Summary
- **Setup:** Use `cy.apiLogin` to get a token, then `cy.apiCreateOrder` to seed an order.
- **Action:** Navigate to Order Center, search for the order, apply a discount.
- **Assertion:** Verify API `PATCH` returns 200, success snackbar appears, order total updates.

### 2. Proposed `data-cy` additions in `dobybot-ui` (if any)
```diff
# components/order/OrderSummary.vue (line 42)
-      <v-text-field v-model="discount" label="Discount" />
+      <v-text-field v-model="discount" label="Discount" data-cy="order-summary-discount-input" />
```
*(Empty if every required element already has a `data-cy`.)*

### 3. New Commands (if any)
```javascript
// Add to cypress/support/commands/seed.commands.js
Cypress.Commands.add('apiUpdateOrderDiscount', (token, orderId, discount) => { ... })
```

### 4. Cypress Script
```javascript
// [Test ID]: 1234
// [Feature]: Order Discount
// [File]: cypress/e2e/order-center/discount.cy.js
// [Login]: yes

describe('Order Discount', () => { ... })
```
