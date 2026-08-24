#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

BIN_DIR="$TMP_DIR/bin"
CALLS_FILE="$TMP_DIR/calls"
mkdir -p "$BIN_DIR"
: >"$CALLS_FILE"

for cli in claude codex; do
  cat >"$BIN_DIR/$cli" <<'EOF'
#!/usr/bin/env bash
printf '%s %s\n' "$(basename "$0")" "$*" >>"$MCP_TEST_CALLS"
EOF
  chmod +x "$BIN_DIR/$cli"
done

# The installer only needs node to exist; this stub also makes the smoke test
# return zero tools without involving the real bundle runtime.
cat >"$BIN_DIR/node" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
chmod +x "$BIN_DIR/node"

run_installer() {
  local input="$1"
  shift
  : >"$CALLS_FILE"
  printf '%b' "$input" | env \
    PATH="$BIN_DIR:/usr/bin:/bin" \
    MCP_TEST_CALLS="$CALLS_FILE" \
    ARTEMIS_API_URL='https://example.test' \
    ARTEMIS_API_TOKEN="art_$(printf 'a%.0s' {1..64})" \
    ARTEMIS_PROJECT_KEY='' \
    ARTEMIS_SITE_URL='https://example.test' \
    "$ROOT/install-mcp.sh" "$@" 2>&1
}

assert_contains() {
  local haystack="$1" needle="$2"
  if [[ "$haystack" != *"$needle"* ]]; then
    printf 'FAIL: expected output to contain: %s\n' "$needle" >&2
    exit 1
  fi
}

assert_calls() {
  local expected="$1"
  if ! grep -q "^$expected mcp add" "$CALLS_FILE"; then
    printf 'FAIL: expected %s registration; calls were:\n' "$expected" >&2
    cat "$CALLS_FILE" >&2
    exit 1
  fi
}

output="$(run_installer '\n')"
assert_contains "$output" 'เลือกว่าจะติดตั้ง MCP ให้ agent ไหน'
assert_calls claude

output="$(run_installer '2\n')"
assert_contains "$output" '2) Codex'
assert_calls codex
if grep -q '^claude mcp add' "$CALLS_FILE"; then
  printf 'FAIL: Codex selection unexpectedly registered Claude Code too\n' >&2
  exit 1
fi

output="$(run_installer '3\n')"
assert_calls claude
assert_calls codex

output="$(run_installer '' --codex)"
if [[ "$output" == *'เลือกว่าจะติดตั้ง MCP ให้ agent ไหน'* ]]; then
  printf 'FAIL: explicit --codex unexpectedly displayed the target prompt\n' >&2
  exit 1
fi
assert_calls codex

output="$(run_installer '' --claude)"
assert_calls claude

output="$(run_installer '' --target codex)"
assert_calls codex

output="$(run_installer '' --both)"
assert_calls claude
assert_calls codex

# Git Bash delegates before prompting. When target is unspecified, PowerShell
# must receive no -Target argument so its own interactive menu is displayed.
cat >"$BIN_DIR/uname" <<'EOF'
#!/usr/bin/env bash
printf 'MINGW64_NT-10.0\n'
EOF
cat >"$BIN_DIR/cygpath" <<'EOF'
#!/usr/bin/env bash
printf 'C:\\dev-support\\install-mcp.ps1\n'
EOF
cat >"$BIN_DIR/powershell.exe" <<'EOF'
#!/usr/bin/env bash
printf 'powershell.exe %s\n' "$*" >>"$MCP_TEST_CALLS"
EOF
chmod +x "$BIN_DIR/uname" "$BIN_DIR/cygpath" "$BIN_DIR/powershell.exe"

: >"$CALLS_FILE"
env PATH="$BIN_DIR:/usr/bin:/bin" MCP_TEST_CALLS="$CALLS_FILE" \
  "$ROOT/install-mcp.sh" >/dev/null 2>&1
if grep -q -- '-Target' "$CALLS_FILE"; then
  printf 'FAIL: unspecified Git Bash delegation unexpectedly passed -Target\n' >&2
  exit 1
fi

: >"$CALLS_FILE"
env PATH="$BIN_DIR:/usr/bin:/bin" MCP_TEST_CALLS="$CALLS_FILE" \
  "$ROOT/install-mcp.sh" --codex >/dev/null 2>&1
if ! grep -q -- '-Target codex' "$CALLS_FILE"; then
  printf 'FAIL: explicit Git Bash delegation did not preserve the Codex target\n' >&2
  exit 1
fi

# PowerShell is not available on every macOS dev machine, so verify the source
# contract here and let the optional parser check below validate syntax where possible.
python3 - "$ROOT/install-mcp.ps1" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
raw = path.read_bytes()
assert raw.startswith(b"\xef\xbb\xbf"), "install-mcp.ps1 must keep its UTF-8 BOM"
text = raw.decode("utf-8-sig")
assert "[string]$Target = ''" in text, "PowerShell target must start unset"
assert "เลือกว่าจะติดตั้ง MCP ให้ agent ไหน" in text, "PowerShell target prompt is missing"
assert "function Remove-McpRegistration" in text, "PowerShell remove must tolerate an absent MCP registration"
assert text.count("Remove-McpRegistration -Cli") == 2, "Claude and Codex must both use tolerant removal"
PY

if command -v pwsh >/dev/null 2>&1; then
  pwsh -NoProfile -Command \
    '$errors = $null; [System.Management.Automation.Language.Parser]::ParseFile($args[0], [ref]$null, [ref]$errors) > $null; if ($errors.Count) { $errors | Out-String | Write-Error; exit 1 }' \
    "$ROOT/install-mcp.ps1"
  pwsh -NoProfile -File "$ROOT/tests/install-mcp-powershell.ps1"
fi

printf 'PASS: MCP target selection\n'
