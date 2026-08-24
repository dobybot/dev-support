---
name: tolgee-translate
description: Reconcile local translation JSONs in dobybot-ui with the Tolgee server — snapshot the current `lang/translation/` folder, pull the latest from Tolgee, merge any local-only new keys on top, fix untranslated values, then push back without overriding existing server translations.
---

# Fix Translation

Use this skill whenever the user wants to sync new or edited translation keys from their working copy to the Tolgee server safely. The skill assumes the user has been editing `lang/translation/*.json` directly (possibly adding new `$t('...')` keys) and now needs those local additions reconciled with the server.

## Inputs
1. **Repository** (default: `dobybot-ui`).
2. **Target folder** (fixed): `lang/translation/` — canonical folder consumed by the Nuxt app and pushed to Tolgee.
3. **Snapshot folder** (fixed): `lang/translation-temp/` — created by this skill as a safety snapshot of the user's current local state before pulling.
4. **Locales** (fixed): `en`, `th`, `zh-Hans`, `zh-Hant` — each as `{lang}.json`.

## Pre-flight
- `cd` into the `dobybot-ui` repo.
- Confirm `lang/translation/` exists and contains all 4 locale files.
- Ensure `.tolgeerc.json` is present at the repo root (Tolgee CLI config).
- Ensure `lang/translation-temp/` does **not** already exist. If it does, stop and ask the user to deal with it (leftover from a previous run).

## Steps

### 1. Snapshot the current local state
Rename the canonical folder so we preserve the user's working copy before touching the server:

```bash
mv lang/translation lang/translation-temp
```

`lang/translation-temp/` now holds the user's local state (baseline + any new local keys). `lang/translation/` no longer exists.

### 2. Pull the latest from Tolgee
Run from the repo root:

```bash
npx tolgee pull
```

This recreates `lang/translation/` from the server's current state per `.tolgeerc.json`. Now we have two folders:
- `lang/translation-temp/` — local working copy (may contain new keys not yet on server)
- `lang/translation/` — fresh server state

### 3. Analyze the diff (temp vs pulled)
Load and flatten (dot-path) each JSON. For each locale, report:
- count in `translation/` (server), count in `translation-temp/` (local)
- **keys added locally** — in `translation-temp/` but not in `translation/` → these are the new keys to push
- **keys removed locally** — in `translation/` but not in `translation-temp/` → the server has keys the user deleted locally. **Do not delete from server.** Show the user and ask; default is to keep the server's version (they'll land back in `translation/` after pull, which is correct).
- **value differences** — key exists in both but values differ. Show each case. Default behavior:
  - If local value looks like an intentional edit (not placeholder/untranslated) → ask user whether to override server with local or keep server.
  - Otherwise keep server value.

### 4. Merge local-only new keys into the pulled folder
For every key that is in `translation-temp/{lang}.json` but missing from `translation/{lang}.json`, insert it into `translation/{lang}.json` using the local value. Preserve the nested JSON structure already present in the pulled file.

For accepted value overrides from step 3, apply those edits too.

Do **not** touch keys that only exist on the server — they stay as pulled.

### 5. Detect untranslated values
For the keys added in step 4 (plus any the user flags), check each locale's value:
- Thai text in `en.json`, `zh-Hans.json`, or `zh-Hant.json` → untranslated.
- Simplified Chinese in `zh-Hant.json` or Traditional Chinese in `zh-Hans.json` → wrong variant.
- Empty strings or obvious placeholders → missing.

**Respect existing conventions before flagging**: some namespaces intentionally keep English across all locales (e.g. `drawer.*` in `th.json`). Check sibling keys in the same namespace before concluding a value is wrong. Do not "fix" a value that matches the prevailing pattern of its namespace.

Present the proposed fixes (key, locale, current value, proposed value) and ask the user to confirm before editing.

### 6. Apply translation fixes
Use targeted line-range replacements (via the editor tool) to update only the confirmed lines in `lang/translation/*.json`. Do not reformat unrelated parts of the JSON.

### 7. Validate
- `node -e "JSON.parse(require('fs').readFileSync('lang/translation/{lang}.json','utf8'))"` for each of the 4 files.
- `git diff --stat lang/translation/` — confirm the change set is minimal and matches expectations.
- `git diff lang/translation/` — show the full diff to the user for review.

### 8. Push to Tolgee (confirm first)
Show the user the planned command and ask for confirmation. Then run from the `dobybot-ui` repo root:

```bash
npx tolgee push --force-mode KEEP
```

- `--force-mode KEEP`: adds new keys, keeps existing server translations untouched. This is the only push mode this skill uses.
- Never use `--force-mode OVERRIDE` unless the user explicitly authorized a value override in step 3/4, and even then prefer running a second targeted push after explicit confirmation.

### 9. Cleanup
After a successful push, delete the snapshot folder automatically:

```bash
rm -rf lang/translation-temp
```

## Summary Output
At the end, print:
- Per-locale key counts: server (pulled) → merged.
- List of new keys pushed (grouped by top-level namespace).
- List of value overrides accepted (if any).
- List of translation fixes applied (key → locale → old value → new value).
- Keys that existed locally but not on server and were kept on server (i.e. local-only deletions ignored).
- Any out-of-scope issues noticed (e.g. wrong Chinese variant in pre-existing keys) as suggestions, **not** auto-fixed.
- Tolgee push result.
- Confirmation that `lang/translation-temp/` has been removed.

## Guardrails
- Never run `tolgee pull` without first snapshotting `lang/translation/` to `lang/translation-temp/` — pull overwrites local files and would destroy unpushed keys.
- Never use `--force-mode OVERRIDE` by default.
- Never delete keys from the server automatically.
- Never commit or push git changes automatically — leave that to the user.
- Never invent translations for business-specific terms; if unsure, propose and ask.
- If step 1 fails (e.g. `lang/translation-temp/` already exists), stop and ask before proceeding — do not clobber an existing snapshot.
