#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
skill="$repo_root/skills/in-development/express-testcase/SKILL.md"

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

assert_contains() {
  local expected="$1"
  local message="$2"
  grep -Fq "$expected" "$skill" || fail "$message"
}

if grep -Fq 'ไม่เกิน **10 Test Case**' "$skill"; then
  fail "test design still has the old hard limit of 10 cases"
fi

assert_contains '`Tags`' "workbook has no Tags column"
assert_contains '`Happy Path`' "Happy Path tag is not defined"
assert_contains '`Sad Path`' "Sad Path tag is not defined"
assert_contains '`Edge Case`' "Edge Case tag is not defined"
assert_contains '`Validation`' "Validation tag is not defined"
assert_contains '12–20' "normal human-review budget is not defined"
assert_contains 'parameterized' "equivalent validation values are not grouped"
assert_contains '`Evidence Source / Traceability`' "cases cannot be traced to ticket evidence"
assert_contains '`P0` และ `P1`' "release-critical priorities are not gated"
assert_contains 'ทั้ง AI และ Developer' "release gate does not require independent AI and human results"

echo "PASS: express-testcase produces a reviewable risk-based suite"
