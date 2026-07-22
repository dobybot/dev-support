---
name: ui-translate-diff
description: Sweep git-changed Vue/Nuxt files in dobybot-ui — replace hardcoded user-facing strings with Tolgee `$t()` keys (added to all 4 language files) and replace hardcoded currency formatting with `$currencyFormatByRegion()`. Scope is limited to files changed in the current git working tree.
---

# UI Translate Diff

Use this skill when the user has a work-in-progress set of Vue/Nuxt changes in `dobybot-ui` and wants them audited for i18n and currency-formatting compliance before pushing. The skill only touches files that appear in the current git diff (staged + unstaged) plus any child components referenced by those changes.

## Inputs
1. **Repository** (default: `dobybot-ui` at `~/Projects/dobybot/dobybot-workspace/dobybot-ui`).
2. **Scope** — files changed in the git working tree:
   - `git diff --name-only`
   - `git diff --name-only --cached`
   - Filter to: `pages/**/*.vue`, `components/**/*.vue`, and any related `.ts`/`.js` files used by those changes.
3. **Language files** (fixed):
   - `lang/translation/en.json`
   - `lang/translation/th.json`
   - `lang/translation/zh-Hans.json`
   - `lang/translation/zh-Hant.json`

## Pre-flight
- `cd` into the `dobybot-ui` repo.
- Confirm the 4 language files exist under `lang/translation/`.
- List changed files using the two git commands above and print the filtered scope to the user before doing any edits.
- Remind the user (do not execute) that a `tolgee pull` before running, and `tolgee push` after, is recommended. If a conflict prompt appears during push, always answer `KEEP`.

## Task A — Translation (Tolgee)

1. **Identify hardcoded strings** in templates and scripts of the changed files.
   - Include child components referenced or edited in the same git changes (hierarchy rule).
   - Cover: text nodes, `label`, `placeholder`, `title`, tooltips, snackbars, dialog titles, button text, validation messages, etc.

2. **Replace with Tolgee keys**:
   - Template: `{{ $t('module.key') }}`
   - Script: `this.$t('module.key')`
   - Props: `:label="$t('module.key')"`, `:placeholder="$t('module.key')"`, etc.
   - **Never** use `window.$nuxt.$t(...)`. Always use `this.$t(...)` in scripts.

3. **Key rules (MANDATORY)**:
   - `module` = kebab-case feature/module name (e.g. `order-center`, `translation-demo`, `user-management`).
   - `key` = kebab-case description (e.g. `page-title`, `easy-order-form-shipping-fee`).
   - Use **nested JSON objects only**:
     ```json
     { "module": { "key": "Text" } }
     ```
   - **Never** use flat keys like `"module.key": "Text"`.

4. **Add every new key to ALL 4 language files** with identical nested structure. Provide a translation for each locale (English source, Thai, Simplified Chinese, Traditional Chinese). If unsure about a business-specific term, propose values and ask the user before inserting.

5. **Verify**:
   - No missing keys in any language file.
   - No leftover hardcoded user-facing strings in the changed file hierarchy.
   - Keys are nested, not flat.

## Task B — Currency Formatting

1. **Detect anti-patterns** in the changed files:
   - Appended currency text/symbols: `" บาท"`, `"THB"`, `"$"`, `"SGD"`, `"NTD"`, etc.
   - Hardcoded prefix/suffix placement of currency.
   - Concatenations like `this.$fmtCurrency(amount) + ' บาท'`.

2. **Replace with**:
   - Template: `{{ $currencyFormatByRegion(amount) }}`
   - Script: `this.$currencyFormatByRegion(amount)`

3. **Do not** hardcode any currency symbol or word after the change. Region-specific formatting is handled entirely by `$currencyFormatByRegion`.

## Steps

1. **List scope** — Print changed Vue/TS/JS files in the filtered scope.
2. **Plan edits** — For each file, enumerate the hardcoded strings and currency anti-patterns found, with proposed keys and replacement code. Ask for confirmation before editing.
3. **Apply edits** — Make targeted edits to the Vue/TS/JS files.
4. **Update language files** — Insert all new keys into the 4 JSON files with nested structure. Do not reformat unrelated parts of the JSON.
5. **Validate JSON** — For each of the 4 files:
   ```bash
   node -e "JSON.parse(require('fs').readFileSync('lang/translation/{lang}.json','utf8'))"
   ```
6. **Diff review** — Run `git diff --stat` and `git diff lang/translation/` to show the user what changed.

## Output Format (STRICT)

1. **Changed files scanned** — bullet list of files in scope.
2. **Edits made** — file-by-file summary of Vue/TS/JS changes and JSON translation additions.
3. **New translation keys added** — grouped by top-level module, listed once (no duplicates), with the English value.
4. **Sanity checklist**:
   - [ ] All 4 languages updated
   - [ ] No flat JSON keys
   - [ ] No hardcoded currency symbols/words
   - [ ] No remaining hardcoded UI strings in changed files

## Guardrails
- Only edit files in the git-change scope plus their referenced children. Do not sweep the whole codebase.
- Never invent translations for business-specific terms — propose and ask.
- Never use flat keys like `"module.key"`. Always nest.
- Never use `window.$nuxt.$t(...)`. Always `this.$t(...)`.
- Never hardcode currency symbols, suffixes, or prefixes after converting — rely on `$currencyFormatByRegion`.
- Never run `tolgee pull` or `tolgee push` from this skill — only remind the user. Pushing is handled by the `fix-translation` skill or manually by the user.
- Never commit or push git changes automatically — leave that to the user.
