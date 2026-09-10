#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
skill="$repo_root/skills/in-development/express-testcase/SKILL.md"

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

xlsx_mime='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

grep -Fq "$xlsx_mime" "$skill" || \
  fail "upload instructions do not force the XLSX MIME type"

upload_section="$(sed -n '/## 7\. Upload หลัง approval เท่านั้น/,$p' "$skill")"
grep -Fq '`mimeType`' <<<"$upload_section" || \
  fail "upload instructions do not pass mimeType explicitly"
grep -Fq 'SHA-256' <<<"$upload_section" || \
  fail "upload instructions do not verify downloaded bytes against the approved workbook"
grep -Fq 'pending' <<<"$upload_section" || \
  fail "upload instructions do not avoid publishing when verification fails"

echo "PASS: express-testcase preserves XLSX content during Artemis upload"
