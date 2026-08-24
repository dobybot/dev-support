#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
script="$repo_root/skills/in-development/express-jigsaw-erd/scripts/d2-erd.sh"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

project="$tmp_dir/project"
mkdir -p "$project/docs/data-dictionary/erd/tables" \
  "$project/docs/data-dictionary/erd/features" \
  "$project/docs/data-dictionary/erd/views"
git -C "$project" init -q

cat > "$project/docs/data-dictionary/erd/tables/GLACC.d2" <<'D2'
shape: sql_table
companyId: Id<companies> {constraint: foreign_key}
D2

cat > "$project/docs/data-dictionary/erd/features/acc-50.d2" <<'D2'
GLACC: {
  ACCTYP: string
}
D2

cat > "$project/docs/data-dictionary/erd/features/acc-72.d2" <<'D2'
GLACC: {
  ACCNUM: string {constraint: unique}
  ACCNAM: string
}
D2

cat > "$project/docs/data-dictionary/erd/views/accounting.d2" <<'D2'
direction: right
GLACC: @../tables/GLACC
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
grep -q '^GLACC: @tables/GLACC$' "$erd_root/erd.d2" || fail "Master did not import GLACC"
grep -q '^\.\.\.@features/acc-50$' "$erd_root/erd.d2" || fail "Master lost the existing Feature"
grep -q '^\.\.\.@features/acc-72$' "$erd_root/erd.d2" || fail "Master did not import ACC-72"
[[ -s "$project/docs/data-dictionary/generated/erd.svg" ]] || fail "Master SVG was not rendered"
[[ -s "$project/docs/data-dictionary/generated/views/accounting.svg" ]] || fail "view was not rendered"

export D2_TEST_ARGS="$tmp_dir/validate-args"
(
  cd "$project"
  PATH="$tmp_dir/bin:/usr/bin:/bin" "$script" validate
)
grep -Fq $'CALL\tvalidate' "$D2_TEST_ARGS" || fail "Master was not validated"

if (
  cd "$tmp_dir"
  PATH="$tmp_dir/bin:/usr/bin:/bin" "$script" render
) >"$tmp_dir/not-git.out" 2>&1; then
  fail "script succeeded outside a Git repository"
fi
grep -q 'Git repository' "$tmp_dir/not-git.out" || fail "outside-repository error was not actionable"

echo "PASS: express-jigsaw-erd composes Feature fragments"
