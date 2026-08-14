$ErrorActionPreference = 'Stop'

$Root = Split-Path -Parent $PSScriptRoot
$Installer = Join-Path $Root 'install-mcp.ps1'
$TempDir = Join-Path ([System.IO.Path]::GetTempPath()) ("install-mcp-test-" + [guid]::NewGuid())
$BinDir = Join-Path $TempDir 'bin'
$CallsFile = Join-Path $TempDir 'calls'
New-Item -ItemType Directory -Path $BinDir -Force | Out-Null

try {
    $IsWindowsHost = $env:OS -eq 'Windows_NT'
    if ($IsWindowsHost) {
        $ClaudeStub = Join-Path $BinDir 'claude.cmd'
        $CodexStub = Join-Path $BinDir 'codex.cmd'
        $NodeStub = Join-Path $BinDir 'node.cmd'
        @'
@echo off
if "%2"=="remove" (
  >&2 echo No MCP server named "artemis" in user scope
  exit /b 1
)
if "%2"=="add" (
  echo add>>"%MCP_TEST_CALLS%"
  exit /b %MCP_TEST_ADD_EXIT%
)
exit /b 0
'@ | Set-Content -LiteralPath $ClaudeStub -Encoding Ascii
        Copy-Item -LiteralPath $ClaudeStub -Destination $CodexStub
        '@echo off' + [Environment]::NewLine + 'exit /b 0' |
            Set-Content -LiteralPath $NodeStub -Encoding Ascii
        $PowerShellExe = Join-Path $PSHOME 'powershell.exe'
    } else {
        $ClaudeStub = Join-Path $BinDir 'claude'
        $CodexStub = Join-Path $BinDir 'codex'
        $NodeStub = Join-Path $BinDir 'node'
        @'
#!/usr/bin/env bash
if [ "$2" = "remove" ]; then
  printf '%s\n' 'No MCP server named "artemis" in user scope' >&2
  exit 1
fi
if [ "$2" = "add" ]; then
  printf '%s\n' add >>"$MCP_TEST_CALLS"
  exit "$MCP_TEST_ADD_EXIT"
fi
exit 0
'@ | Set-Content -LiteralPath $ClaudeStub -Encoding Utf8
        Copy-Item -LiteralPath $ClaudeStub -Destination $CodexStub
        "#!/usr/bin/env bash`nexit 0`n" | Set-Content -LiteralPath $NodeStub -Encoding Utf8
        & chmod +x $ClaudeStub $CodexStub $NodeStub
        $PowerShellExe = Join-Path $PSHOME 'pwsh'
    }

    $OriginalPath = $env:PATH
    $env:PATH = "$BinDir$([IO.Path]::PathSeparator)$OriginalPath"
    $env:MCP_TEST_CALLS = $CallsFile
    $env:ARTEMIS_API_URL = 'https://example.test'
    $env:ARTEMIS_API_TOKEN = 'art_' + ('a' * 64)
    $env:ARTEMIS_PROJECT_KEY = ''
    $env:ARTEMIS_SITE_URL = 'https://example.test'

    foreach ($Target in @('claude', 'codex')) {
        $env:MCP_TEST_ADD_EXIT = '0'
        Remove-Item -LiteralPath $CallsFile -ErrorAction SilentlyContinue
        & $PowerShellExe -NoProfile -ExecutionPolicy Bypass -File $Installer -Target $Target *> $null
        if ($LASTEXITCODE -ne 0) {
            throw "$Target installer stopped when remove reported an absent registration (exit $LASTEXITCODE)"
        }
        if (-not (Test-Path -LiteralPath $CallsFile) -or (Get-Content $CallsFile) -notcontains 'add') {
            throw "$Target installer did not continue from failed remove to mcp add"
        }
    }

    $env:MCP_TEST_ADD_EXIT = '7'
    Remove-Item -LiteralPath $CallsFile -ErrorAction SilentlyContinue
    & $PowerShellExe -NoProfile -ExecutionPolicy Bypass -File $Installer -Target claude *> $null
    if ($LASTEXITCODE -eq 0) {
        throw 'installer did not fail when mcp add returned nonzero'
    }
    if (-not (Test-Path -LiteralPath $CallsFile) -or (Get-Content $CallsFile) -notcontains 'add') {
        throw 'add-failure scenario stopped before reaching mcp add'
    }

    Write-Host 'PASS: PowerShell MCP remove/add behavior'
} finally {
    if ($OriginalPath) { $env:PATH = $OriginalPath }
    Remove-Item -LiteralPath $TempDir -Recurse -Force -ErrorAction SilentlyContinue
}
