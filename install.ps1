#Requires -Version 5.1
<#
    install.ps1 — ตัวติดตั้ง skill ของทีม dobybot สำหรับ Windows (คู่ขนานกับ install.sh บน macOS/Linux)

    ลิสต์ทุก skill ใต้ skills\<group>\ แล้วให้เลือกว่าจะติดตั้ง/อัพเดตตัวไหนเข้า
    %USERPROFILE%\.claude\skills โดยสร้างเป็น **directory junction** ชี้กลับมาที่ clone นี้
    (junction สร้างได้โดยไม่ต้องเป็น admin และไม่ต้องเปิด Developer Mode ต่างจาก symlink)
    เมื่อเป็น junction แล้ว `git pull` จะอัพเดตเนื้อ skill ให้เอง — รันสคริปต์นี้ซ้ำเฉพาะตอน
    เพิ่ม/ถอด skill หรือเมื่อ skill ย้ายกลุ่ม

    Usage:
      .\install.ps1                      # เมนูเลือก
      .\install.ps1 -All                 # ติดตั้ง/อัพเดตทุก skill ไม่ถาม
      .\install.ps1 learn-diff better-review   # ระบุชื่อ ไม่ถาม

    ถ้าโดน execution policy บล็อก ให้รันแบบนี้:
      powershell -ExecutionPolicy Bypass -File .\install.ps1

    ปลอดภัยเมื่อรันซ้ำ และไม่แตะ skill ที่ไม่ได้เป็นของ repo นี้ (โฟลเดอร์จริง หรือ link
    ที่ชี้ออกนอก clone จะถูกข้าม)
#>
[CmdletBinding()]
param(
    [switch]$All,
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Skill
)

$ErrorActionPreference = 'Stop'
# ให้ข้อความไทยอ่านออกเมื่อรันผ่าน Git Bash/Windows Terminal (console เดิมเป็น ANSI codepage)
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }

$Repo        = $PSScriptRoot
$SrcRoot     = Join-Path $Repo 'skills'
$ClaudeHome  = Join-Path $env:USERPROFILE '.claude'
$Dest        = Join-Path $ClaudeHome 'skills'
$SettingsPath = Join-Path $ClaudeHome 'settings.json'

function Write-Log  { param([string]$Message) Write-Host "[install] $Message" }
function Write-Warn { param([string]$Message) Write-Host "[install] WARN: $Message" -ForegroundColor Yellow }
function Stop-Install { param([string]$Message) Write-Host "[install] ERROR: $Message" -ForegroundColor Red; exit 1 }

function Get-NormalPath {
    param([string]$Path)
    if (-not $Path) { return $null }
    try { return ([System.IO.Path]::GetFullPath($Path)).TrimEnd('\') } catch { return $Path.TrimEnd('\') }
}

# อ่านปลายทางของ junction/symlink — PowerShell 5.1 ให้ .Target มาอยู่แล้วในเกือบทุกเครื่อง
# ส่วน fallback ไว้เผื่อ Windows/PS รุ่นที่ไม่เติม .Target ให้ junction
function Get-LinkTarget {
    param([string]$Path)
    $item = Get-Item -LiteralPath $Path -Force -ErrorAction SilentlyContinue
    if (-not $item) { return $null }
    if (-not ($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint)) { return $null }

    $target = $item.Target
    if ($target) {
        if ($target -is [array]) { $target = $target[0] }
        return (Get-NormalPath ($target -replace '^\\\\\?\?\\', ''))
    }

    try {
        $parent = Split-Path -Parent $Path
        $leaf   = Split-Path -Leaf   $Path
        $lines  = cmd /c dir /a:l """$parent"""
        foreach ($line in $lines) {
            if ($line -match [regex]::Escape($leaf) -and $line -match '\[(.+)\]') {
                return (Get-NormalPath $Matches[1])
            }
        }
    } catch { }
    return $null
}

function Remove-Link {
    param([string]$Path)
    # ใช้ .Delete() ไม่ใช่ Remove-Item -Recurse — PS 5.1 อาจไล่ลบ "ของจริง" ที่ปลาย junction
    (Get-Item -LiteralPath $Path -Force).Delete()
}

function New-SkillLink {
    param([string]$Link, [string]$Target)
    if (Test-Path -LiteralPath $Link) { Remove-Link $Link }
    try {
        New-Item -ItemType Junction -Path $Link -Target $Target -ErrorAction Stop | Out-Null
    } catch {
        # junction ใช้ไม่ได้ (เช่น repo อยู่บน network drive) — ลอง symlink (ต้องมี Developer Mode/admin)
        New-Item -ItemType SymbolicLink -Path $Link -Target $Target -ErrorAction Stop | Out-Null
    }
}

if (-not (Test-Path -LiteralPath $SrcRoot)) { Stop-Install "ไม่พบโฟลเดอร์ skills\ ใน $Repo" }
New-Item -ItemType Directory -Path $Dest -Force | Out-Null

# ---------- discover: skills\<group>\<name>\SKILL.md ----------
$found = @()
foreach ($groupDir in Get-ChildItem -LiteralPath $SrcRoot -Directory) {
    foreach ($skillDir in Get-ChildItem -LiteralPath $groupDir.FullName -Directory) {
        if (-not (Test-Path -LiteralPath (Join-Path $skillDir.FullName 'SKILL.md'))) { continue }

        $link  = Join-Path $Dest $skillDir.Name
        $state = 'not installed'
        if (Test-Path -LiteralPath $link) {
            $current = Get-LinkTarget $link
            if ($null -eq $current) {
                $state = 'personal — skip'          # โฟลเดอร์/ไฟล์จริงของผู้ใช้เอง
            } elseif ($current -eq (Get-NormalPath $skillDir.FullName)) {
                $state = 'installed'
            } elseif ($current -like ((Get-NormalPath $Repo) + '\*')) {
                $state = 'update available'         # ชี้ path เก่าใน clone นี้ (skill ย้ายกลุ่ม)
            } else {
                $state = 'personal — skip'          # link ของคนอื่น/ที่อื่น
            }
        }

        $found += [pscustomobject]@{
            Name  = $skillDir.Name
            Group = $groupDir.Name
            Path  = (Get-NormalPath $skillDir.FullName)
            State = $state
            Link  = $link
        }
    }
}

if ($found.Count -eq 0) { Stop-Install "ไม่พบ skill ใต้ skills\<group>\<name>\SKILL.md" }

# ---------- select ----------
$args_ = @($Skill | Where-Object { $_ })
if ($args_ -contains '--all' -or $args_ -contains '-all' -or $args_ -contains 'all') {
    $All = $true
    $args_ = @($args_ | Where-Object { $_ -notin @('--all', '-all', 'all') })
}

$selected = @()
if ($All) {
    $selected = $found
} elseif ($args_.Count -gt 0) {
    foreach ($want in $args_) {
        $hits = @($found | Where-Object { $_.Name -eq $want })
        if ($hits.Count -eq 0) { Write-Warn "ไม่รู้จัก skill: $want" } else { $selected += $hits }
    }
} else {
    Write-Host ''
    Write-Host 'dev-support skills — เลือก skill ที่จะติดตั้ง/อัพเดต'
    Write-Host ''
    for ($i = 0; $i -lt $found.Count; $i++) {
        Write-Host ('  {0,2}) {1,-30} {2,-18} [{3}]' -f ($i + 1), $found[$i].Name, "($($found[$i].Group))", $found[$i].State)
    }
    Write-Host ''
    $reply = Read-Host 'เลือกหมายเลข (คั่นด้วย space เช่น "1 3"), a = ทั้งหมด, q = ยกเลิก'
    if ($null -eq $reply) { $reply = '' }
    switch -Regex ($reply.Trim()) {
        '^$'      { Write-Log 'cancelled'; exit 0 }
        '^[qQ]$'  { Write-Log 'cancelled'; exit 0 }
        '^[aA]$'  { $selected = $found }
        default {
            foreach ($token in ($reply -split '[,\s]+' | Where-Object { $_ })) {
                if ($token -notmatch '^\d+$') { Write-Warn "ข้าม: $token"; continue }
                $idx = [int]$token - 1
                if ($idx -ge 0 -and $idx -lt $found.Count) { $selected += $found[$idx] }
                else { Write-Warn "ข้าม: $token (เกินช่วง)" }
            }
        }
    }
}

if ($selected.Count -eq 0) { Write-Log 'ไม่ได้เลือกอะไรเลย'; exit 0 }

# ---------- install/update selected ----------
$installed = 0; $skipped = 0; $pruned = 0
$repoNorm  = Get-NormalPath $Repo

foreach ($item in $selected) {
    if ((Test-Path -LiteralPath $item.Link)) {
        $current = Get-LinkTarget $item.Link
        if ($null -eq $current) {
            Write-Warn "ข้าม $($item.Name): มีโฟลเดอร์/ไฟล์จริงอยู่แล้วที่ $($item.Link)"
            if (Test-Path -LiteralPath (Join-Path $item.Link 'SKILL.md')) {
                # เคสที่เจอบ่อยบน Windows: เคยรัน install.sh ผ่าน Git Bash — ln -s กลายเป็นการ copy
                Write-Warn "  ถ้านี่คือสำเนาที่เกิดจากรัน install.sh ผ่าน Git Bash ให้ลบทิ้งแล้วรันสคริปต์นี้ใหม่:"
                Write-Warn "    Remove-Item -Recurse -Force `"$($item.Link)`""
            }
            $skipped++; continue
        }
        if (-not ($current -like "$repoNorm\*")) {
            Write-Warn "ข้าม $($item.Name): มี link ส่วนตัวอยู่แล้ว ($current)"
            $skipped++; continue
        }
    }
    try {
        New-SkillLink -Link $item.Link -Target $item.Path
        Write-Log "linked $($item.Name) -> $($item.Path.Substring($repoNorm.Length + 1))"
        $installed++
    } catch {
        Write-Warn "ข้าม $($item.Name): สร้าง link ไม่สำเร็จ — $($_.Exception.Message)"
        $skipped++
    }
}

# ---------- prune link ที่ชี้เข้า clone นี้แต่ปลายทางหายไปแล้ว ----------
foreach ($entry in Get-ChildItem -LiteralPath $Dest -Force) {
    $target = Get-LinkTarget $entry.FullName
    if ($null -eq $target) { continue }
    if (-not ($target -like "$repoNorm\*")) { continue }
    if (Test-Path -LiteralPath $target) { continue }
    Remove-Link $entry.FullName
    Write-Log "pruned broken link: $($entry.Name)"
    $pruned++
}

# ---------- ถอด SessionStart hook ของระบบ auto-sync เดิม ----------
if (Test-Path -LiteralPath $SettingsPath) {
    $raw = Get-Content -LiteralPath $SettingsPath -Raw
    if ($raw -match 'sync-skills\.(sh|ps1)') {
        try {
            $json    = $raw | ConvertFrom-Json
            $changed = $false
            foreach ($holder in @($json, $json.hooks)) {
                if (-not $holder) { continue }
                $prop = $holder.PSObject.Properties['SessionStart']
                if (-not $prop) { continue }
                $entries = @($prop.Value)
                $kept = @($entries | Where-Object {
                    $cmds = @($_.hooks | ForEach-Object { $_.command })
                    -not ($cmds | Where-Object { $_ -match 'sync-skills\.(sh|ps1)' })
                })
                if ($kept.Count -eq $entries.Count) { continue }
                $changed = $true
                if ($kept.Count -eq 0) { $holder.PSObject.Properties.Remove('SessionStart') }
                else { $holder.SessionStart = $kept }
            }
            if ($changed) {
                $backup = "$SettingsPath.bak.$PID"
                Copy-Item -LiteralPath $SettingsPath -Destination $backup
                $out = $json | ConvertTo-Json -Depth 100
                # เขียนแบบ UTF-8 ไม่มี BOM — settings.json ที่มี BOM จะ parse ไม่ผ่าน
                [System.IO.File]::WriteAllText($SettingsPath, $out, (New-Object System.Text.UTF8Encoding($false)))
                Write-Log "ถอด SessionStart hook ของ sync-skills เดิมออกแล้ว (backup: $backup)"
            }
        } catch {
            Write-Warn "เจอ hook sync-skills เดิมใน $SettingsPath แต่แก้อัตโนมัติไม่ได้ ($($_.Exception.Message)) — ลบ entry นั้นเองได้เลย"
        }
    }
}

Write-Host ''
Write-Log "done: $installed linked, $skipped skipped, $pruned pruned"
Write-Log "restart Claude Code เพื่อให้เห็นการเปลี่ยนแปลง · 'git pull' อัพเดต skill ที่ติดตั้งไว้ให้เอง"
