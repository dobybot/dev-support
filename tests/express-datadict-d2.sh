#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
script="$repo_root/skills/in-development/express-datadict/scripts/d2-erd.sh"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

project="$tmp_dir/project"
mkdir -p "$project/docs/data-dictionary/erd/tables" "$project/docs/data-dictionary/erd/features" "$project/docs/data-dictionary/erd/views"
project="$(cd "$project" && pwd -P)"
git -C "$project" init -q

cat > "$project/docs/data-dictionary/erd/tables/CUSTOMER.d2" <<'D2'
shape: sql_table
id: uuid {constraint: primary_key}
D2

for table_number in $(seq -w 1 69); do
  cat > "$project/docs/data-dictionary/erd/tables/TABLE${table_number}.d2" <<'D2'
shape: sql_table
id: uuid {constraint: primary_key}
D2
done

cat > "$project/docs/data-dictionary/erd/features/acc-54.d2" <<'D2'
CUSTOMER: {
  searchPreference: string
}
D2

cat > "$project/docs/data-dictionary/erd/views/accounting.d2" <<'D2'
direction: right
CUSTOMER: @../tables/CUSTOMER
D2

mkdir -p "$tmp_dir/bin"
cat > "$tmp_dir/bin/d2" <<'FAKE_D2'
#!/usr/bin/env bash
set -euo pipefail
{
  printf 'CALL'
  printf '\t%s' "$@"
  printf '\n'
} >> "$D2_TEST_ARGS"
output="${@: -1}"
if [[ "$output" == *.svg ]]; then
  mkdir -p "$(dirname "$output")"
  printf '<svg xmlns="http://www.w3.org/2000/svg"></svg>\n' > "$output"
fi
FAKE_D2
chmod +x "$tmp_dir/bin/d2"

export D2_TEST_ARGS="$tmp_dir/d2-args"
(
  cd "$project/docs"
  PATH="$tmp_dir/bin:/usr/bin:/bin" "$script" render
)

erd_root="$project/docs/data-dictionary/erd"
[[ -s "$erd_root/erd.d2" ]] || fail "render did not generate the D2 entrypoint"
grep -q '^CUSTOMER: @tables/CUSTOMER$' "$erd_root/erd.d2" || fail "entrypoint did not import CUSTOMER"
[[ "$(grep -c ': @tables/' "$erd_root/erd.d2")" -eq 70 ]] || fail "entrypoint did not include all 70 tables"
grep -q '^\.\.\.@features/acc-54$' "$erd_root/erd.d2" || fail "entrypoint did not import the ACC-54 Feature fragment"
[[ -s "$project/docs/data-dictionary/generated/erd.svg" ]] || fail "render did not create the project SVG"
[[ -s "$project/docs/data-dictionary/generated/views/accounting.svg" ]] || fail "render did not create the accounting view"
grep -Fq "$erd_root/erd.d2" "$D2_TEST_ARGS" || fail "D2 input was outside the current project"
grep -Fq "$project/docs/data-dictionary/generated/erd.svg" "$D2_TEST_ARGS" || fail "D2 output was outside the current project"
grep -Fq "$erd_root/views/accounting.d2" "$D2_TEST_ARGS" || fail "D2 did not render the accounting source"

export D2_TEST_ARGS="$tmp_dir/watch-args"
(
  cd "$project/docs"
  PATH="$tmp_dir/bin:/usr/bin:/bin" "$script" watch
)
grep -Fq -- '--watch' "$D2_TEST_ARGS" || fail "watch did not enable D2 watch mode"
grep -Fq "$erd_root/erd.d2" "$D2_TEST_ARGS" || fail "watch used the wrong project input"
grep -Fq "$project/docs/data-dictionary/generated/erd.svg" "$D2_TEST_ARGS" || fail "watch used the wrong project output"

if (
  cd "$tmp_dir"
  PATH="$tmp_dir/bin:/usr/bin:/bin" "$script" render
) >"$tmp_dir/not-git.out" 2>&1; then
  fail "script succeeded outside a Git repository"
fi
grep -q 'Git repository' "$tmp_dir/not-git.out" || fail "outside-repository error was not actionable"

echo "PASS: express-datadict D2 project detection"
