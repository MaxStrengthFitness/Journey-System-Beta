<#
.SYNOPSIS
  Ships the Mindbody-gate fix (Sep 13 2026): the schedule sync failed for
  everyone with "could not read the studio list (HTTP 403)". The gate now
  reads only the studios on the caller's own profile, one at a time.

.DESCRIPTION
  Three stages, run in order from the repo root:

    powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-gate.ps1 prepare
    powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-gate.ps1 verify
    powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-gate.ps1 golive

  prepare  - on master with a clean tree: checks the two patches in
             patches-gate\ are the ones Claude made (SHA-256), proves it
             applies to what git has stored (a scratch index - nothing is
             touched), records master's typecheck error count, then makes
             the branch "gate-fix" with one commit and writes the file into
             the working folder.
  verify   - on gate-fix: typecheck (the error count must not go up against
             master's), the tests, and the production build (front end plus
             the server bundle Render runs). Records the commit it checked.
  golive   - fast-forwards master to the checked commit and pushes. Render
             deploys master. No rules or indexes change.

  Every step that changes anything says so, and every failure says what was
  and was not done. Output also goes to logs\ship-gate.log.

  This file is ASCII only on purpose: Windows PowerShell 5.1 reads a file
  without a byte-order mark as ANSI, and a stray curly quote would break it.
#>
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('prepare', 'verify', 'golive')]
  [string]$Stage,
  [switch]$SkipTests
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2

# ---------------------------------------------------------------- where
$GitExe = (Get-Command git -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source
$RepoDir = (& $GitExe -C $PSScriptRoot rev-parse --show-toplevel 2>$null)
if (-not $RepoDir) { throw "This script must live inside the repo (scripts\ship\). Couldn't find the repo root from $PSScriptRoot." }
$RepoDir = $RepoDir.Trim() -replace '/', '\'
Set-Location -LiteralPath $RepoDir

$LogDir = Join-Path $RepoDir 'logs'
if (-not (Test-Path -LiteralPath $LogDir)) { New-Item -ItemType Directory -Path $LogDir | Out-Null }
Start-Transcript -Path (Join-Path $LogDir 'ship-gate.log') -Append | Out-Null

$PatchDir = Join-Path $RepoDir 'patches-gate'
$ReleaseBranch = 'gate-fix'
$BaseFile = Join-Path $RepoDir '.git\ship-gate.base'
$BaselineFile = Join-Path $RepoDir '.git\ship-gate.baseline'
$CheckedFile = Join-Path $RepoDir '.git\ship-gate.checked'

$Trailer = @(
  'Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>',
  'Claude-Session: https://claude.ai/code/session_01YQy9wnt2F6DomSuzMCY5wu'
)

# The two patches, in order. The hash is of the file Claude produced; a patch that has
# been edited or re-saved will not match and the script stops.
$Phases = @(
  @{ File = '01-auth-gate-get.patch'; Sha256 = '7faf05f4f5b049ba86887085351fafd5890c1728f5f6fd917228c94dc0a5c886'
     Subject = "fix(auth-gate): read the caller's own studios one by one, never the whole list"
     Body = @(
       'The schedule sync failed for everyone with "could not read the studio',
       'list (HTTP 403: Missing or insufficient permissions)". The gate listed',
       'the whole studios collection with the caller''s token; the live rules',
       'refuse that list while the same token may GET the studios the caller',
       'works at. A list is refused when any one document in it is off-limits,',
       'so a public-facing server can''t depend on one. Now the studios named on',
       'the caller''s trainer document are fetched one at a time (cached 10',
       'minutes each), and roles that reach every site read no studio at all.') },
  @{ File = '02-docs.patch'; Sha256 = '86374e8e8261ed3146d7cc44ee11e0633c34d3745e9b7224d21a11244d64a915'
     Subject = "docs: the gate's list-vs-get lesson (round doc, CLAUDE.md trap)"
     Body = @() }
)

# ---------------------------------------------------------------- helpers
function Say([string]$text, [string]$color = 'Cyan') {
  Write-Host ''
  Write-Host ("== " + $text) -ForegroundColor $color
}

function Stop-Here([string]$why) {
  Write-Host ''
  Write-Host ("STOPPED: " + $why) -ForegroundColor Red
  try { Stop-Transcript | Out-Null } catch { }
  exit 1
}

# git writes progress to stderr, which PowerShell treats as an error stream;
# run it with the preference relaxed and judge by the exit code only.
function RunGit {
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try { & $GitExe @args 2>&1 | ForEach-Object { "$_" } } finally { $ErrorActionPreference = $prev }
}
function GitOk { RunGit @args | Out-Host; return ($LASTEXITCODE -eq 0) }
function GitText { $out = @(RunGit @args); return (($out -join "`n").Trim()) }
function Git-OrStop([string]$why) {
  $a = $args
  if (-not (GitOk @a)) { Stop-Here ("git " + ($a -join ' ') + " failed. " + $why) }
}

function Current-Branch { return (GitText rev-parse --abbrev-ref HEAD) }
function Head-Sha { return (GitText rev-parse HEAD) }
function Test-BranchExists([string]$name) { return ((GitText branch --list $name) -ne '') }
function Read-Marker([string]$path) { if (Test-Path -LiteralPath $path) { return (Get-Content -LiteralPath $path -Raw).Trim() } return '' }

function Require-CleanTree([string]$why) {
  $dirty = @(RunGit status --porcelain --untracked-files=no)
  if ($dirty.Count -gt 0) {
    $dirty | ForEach-Object { Write-Host ("  " + $_) -ForegroundColor Yellow }
    Stop-Here ("There are uncommitted changes to tracked files (above). Commit or stash them first. " + $why)
  }
}

function Require-Patches {
  Say "The patches in patches-gate\"
  if (-not (Test-Path -LiteralPath $PatchDir)) { Stop-Here "patches-gate\ is missing from the repo root." }
  foreach ($p in $Phases) {
    $path = Join-Path $PatchDir $p.File
    if (-not (Test-Path -LiteralPath $path)) { Stop-Here ("Missing: patches-gate\" + $p.File) }
    $hash = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLower()
    if ($hash -ne $p.Sha256) { Stop-Here ($p.File + " is not the file Claude made (SHA-256 differs). Was it edited or re-saved? Nothing was changed.") }
    if (Select-String -LiteralPath $path -Pattern 'GIT binary patch' -Quiet) { Stop-Here ($p.File + " contains a binary change, which can't ship as a patch. Nothing was changed.") }
    Write-Host ("  ok  " + $p.File) -ForegroundColor Green
  }
}

function Write-Utf8NoBom([string]$path, [string]$text) {
  $enc = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($path, $text, $enc)
}

# ---------------------------------------------------------------- line endings
# The patches are LF. What git has STORED for a file is LF when the file was
# added from Windows with core.autocrlf=true (this repo), but a file that was
# ever written into the index by an earlier patch, or committed elsewhere,
# can be stored CRLF - and git apply matches bytes, so a patch in the wrong
# ending "does not apply" even though the code is identical. So each patch
# is tried in four ways, most exact first, on the scratch index; the way that
# works is remembered and used for the real apply. "ignore whitespace" lets a
# CR at the end of a context line be ignored; the added lines then land LF,
# which is the normalised form autocrlf=true wants anyway.
$ApplyModes = @(
  @{ Eol = 'lf';   Extra = @();                       Label = '' },
  @{ Eol = 'crlf'; Extra = @();                       Label = 'as CRLF' },
  @{ Eol = 'lf';   Extra = @('--ignore-whitespace');  Label = 'ignoring line-ending whitespace' },
  @{ Eol = 'crlf'; Extra = @('--ignore-whitespace');  Label = 'as CRLF, ignoring whitespace' }
)
$Chosen = @{}

# The patch as delivered (LF) or converted to CRLF, in a temp file. UTF-8
# without a BOM: the docs patch carries non-ASCII characters, and git must
# see exactly the bytes the file has.
function PatchVariant([string]$file, [string]$eol) {
  $src = Join-Path $PatchDir $file
  if ($eol -eq 'lf') { return $src }
  $text = [System.IO.File]::ReadAllText($src, (New-Object System.Text.UTF8Encoding($false)))
  $text = $text -replace "`r`n", "`n"
  $text = $text -replace "`n", "`r`n"
  $tmp = Join-Path ([System.IO.Path]::GetTempPath()) ('ship-gate-' + $file + '.crlf')
  Write-Utf8NoBom $tmp $text
  return $tmp
}

function Remove-PatchVariants {
  foreach ($p in $Phases) {
    Remove-Item -LiteralPath (Join-Path ([System.IO.Path]::GetTempPath()) ('ship-gate-' + $p.File + '.crlf')) -ErrorAction SilentlyContinue
  }
}

# Every patch applied in order to a scratch copy of the index of $onto - a
# private index file, so neither the real index nor the working folder moves.
# Decides the apply mode of every patch (see $ApplyModes).
function Test-PatchesApply([string]$onto) {
  Say ("Do the patches apply to " + $onto + "? (tried on a scratch copy)")
  $scratch = Join-Path $RepoDir '.git\ship-gate-dryrun.index'
  Remove-Item -LiteralPath $scratch -ErrorAction SilentlyContinue
  $failedAt = ''
  $env:GIT_INDEX_FILE = $scratch
  try {
    if (-not (GitOk read-tree $onto)) { $failedAt = ('reading ' + $onto) }
    else {
      foreach ($p in $Phases) {
        $ok = $false
        foreach ($m in $ApplyModes) {
          $variant = PatchVariant $p.File $m.Eol
          $quiet = @(RunGit apply --cached --check --whitespace=nowarn @($m.Extra) $variant)
          if ($LASTEXITCODE -eq 0) {
            if (-not (GitOk apply --cached --whitespace=nowarn @($m.Extra) $variant)) { continue }
            $Chosen[$p.File] = $m
            $ok = $true
            $note = ''
            if ($m.Label) { $note = ('  <- ' + $m.Label) }
            Write-Host ("  applies  " + $p.File + $note) -ForegroundColor Green
            break
          }
        }
        if (-not $ok) {
          # Show why the exact form fails, for the log.
          RunGit apply --cached --check --whitespace=nowarn (PatchVariant $p.File 'lf') | Out-Host
          $failedAt = $p.File
          break
        }
      }
    }
  } finally {
    Remove-Item Env:GIT_INDEX_FILE -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $scratch -ErrorAction SilentlyContinue
  }
  if ($failedAt) { Remove-PatchVariants; Stop-Here ("The patches don't apply (stopped at " + $failedAt + ") - master has changed since they were made. Nothing was changed; send me logs\ship-gate.log.") }
}

function Find-Npx {
  $c = Get-Command npx -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $c) { Stop-Here "npx was not found on PATH. Open a terminal where 'npx --version' works." }
  return $c.Source
}
function Find-Npm {
  $c = Get-Command npm -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $c) { Stop-Here "npm was not found on PATH." }
  return $c.Source
}

# Lines like "src/x.ts(12,5): error TS2322: ..." from a full typecheck.
function Measure-Tsc {
  $npx = Find-Npx
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try { $out = @(& $npx tsc --noEmit 2>&1 | ForEach-Object { "$_" }) } finally { $ErrorActionPreference = $prev }
  return @($out | Where-Object { $_ -match 'error TS\d+' })
}


# ---------------------------------------------------------------- stages
function Do-Prepare {
  Say ("Repo: " + $RepoDir)
  if ((Current-Branch) -ne 'master') { Stop-Here "Run prepare on master (git checkout master). Nothing was changed." }
  Require-CleanTree "Nothing was changed."
  if (Test-BranchExists $ReleaseBranch) { Stop-Here ("A branch named " + $ReleaseBranch + " already exists. If it is from an earlier attempt: git checkout master; git branch -D " + $ReleaseBranch + " - then run prepare again. Nothing was changed.") }

  Require-Patches
  Test-PatchesApply 'HEAD'

  Say "Master's typecheck error count (the baseline verify compares against) - about a minute"
  $baseErrs = Measure-Tsc
  Set-Content -LiteralPath $BaselineFile -Value $baseErrs
  Write-Host ("  " + $baseErrs.Count + " typecheck errors on master (Claude's mirror had 18)")

  $startSha = Head-Sha
  Set-Content -LiteralPath $BaseFile -Value $startSha
  Say ("Branching " + $ReleaseBranch + " from master " + $startSha.Substring(0, 8))
  Git-OrStop "Nothing was committed." checkout -q -b $ReleaseBranch

  # Each patch goes into the index only (git apply --cached): it is applied to
  # exactly what git has stored, so this PC's line endings can't get in the
  # way. The working folder is written from the commits at the end.
  foreach ($p in $Phases) {
    $mode = $Chosen[$p.File]
    if (-not $mode) { $mode = $ApplyModes[0] }
    $applied = GitOk apply --cached --whitespace=nowarn @($mode.Extra) (PatchVariant $p.File $mode.Eol)
    $committed = $false
    if ($applied) {
      $tmp = Join-Path ([System.IO.Path]::GetTempPath()) 'ship-gate-msg.txt'
      $msg = (@($p.Subject, '') + $p.Body + @('') + $Trailer) -join "`n"
      Write-Utf8NoBom $tmp $msg
      $committed = GitOk commit -q -F $tmp
      Remove-Item -LiteralPath $tmp -ErrorAction SilentlyContinue
    }
    if (-not $committed) {
      # Nothing in the working folder was touched: put the index back, go back
      # to master, drop the branch.
      $undone = GitOk reset -q --mixed $startSha
      if ($undone) { $undone = GitOk checkout -q master }
      if ($undone) { $undone = GitOk branch -D -q $ReleaseBranch }
      if ($applied) { $reason = ("git commit failed for " + $p.File + ".") }
      else { $reason = ($p.File + " did not apply - master has moved since the patches were made.") }
      if (-not $undone) { Stop-Here ($reason + " The automatic undo didn't finish either (see above) - tell me before going on.") }
      Stop-Here ($reason + " Back on master; nothing was committed.")
    }
    Write-Host ("  committed  " + $p.Subject) -ForegroundColor Green
  }

  Remove-PatchVariants
  Say "Writing the release's files into the working folder"
  $changed = @(RunGit diff --name-only $startSha HEAD)
  if (-not (GitOk checkout HEAD -- @changed)) { Stop-Here "Couldn't write the release's files into the folder (git checkout failed). The commits are made; tell me before going on." }
  Require-CleanTree "The commits are made but the folder doesn't match them - tell me before going on."

  Say ("Commits on " + $ReleaseBranch)
  RunGit log --oneline ($startSha + '..HEAD') | Out-Host
  Say "prepare done. Next: ship-gate.ps1 verify" 'Green'
}

function Do-Verify {
  if ((Current-Branch) -ne $ReleaseBranch) { Stop-Here ("Run verify on " + $ReleaseBranch + " (prepare makes it). Nothing has been deployed.") }
  $base = Read-Marker $BaseFile
  if (-not $base) { Stop-Here "No record of where gate-fix started - run prepare again (git checkout master; git branch -D gate-fix first). Nothing has been deployed." }
  $count = [int](GitText rev-list --count ($base + '..HEAD'))
  if ($count -lt $Phases.Count) { Stop-Here ($ReleaseBranch + " holds " + $count + " of the " + $Phases.Count + " release commits - prepare didn't finish. Tell me before going on.") }
  if (-not (Test-Path -LiteralPath $BaselineFile)) { Stop-Here "No typecheck baseline - run prepare on master first." }
  Require-CleanTree "Nothing has been deployed."
  # Claude's checks ran in UTC; match them so a timezone-sensitive test means the same thing here.
  $env:TZ = 'UTC'

  Say "Typecheck - about a minute"
  $baseErrs = @(Get-Content -LiteralPath $BaselineFile | Where-Object { $_ -match 'error TS\d+' })
  $nowErrs = Measure-Tsc
  Write-Host ("  " + $nowErrs.Count + " typecheck errors (master had " + $baseErrs.Count + ")")
  # Which ones look new: compared without line numbers, since this release
  # moves lines around in files that already had errors.
  $pool = @{}
  foreach ($l in $baseErrs) { $k = ($l -replace '\(\d+,\d+\)', '').Trim(); if ($pool.ContainsKey($k)) { $pool[$k] = $pool[$k] + 1 } else { $pool[$k] = 1 } }
  $newErrs = @()
  foreach ($l in $nowErrs) {
    $k = ($l -replace '\(\d+,\d+\)', '').Trim()
    if ($pool.ContainsKey($k) -and $pool[$k] -gt 0) { $pool[$k] = $pool[$k] - 1 } else { $newErrs += $l }
  }
  if ($newErrs.Count -gt 0) {
    Say "Typecheck errors that aren't on master:" 'Yellow'
    $newErrs | ForEach-Object { Write-Host ("  " + $_) -ForegroundColor Yellow }
  }
  if ($nowErrs.Count -gt $baseErrs.Count) { Stop-Here ("The typecheck found " + ($nowErrs.Count - $baseErrs.Count) + " more error(s) than master. Send me logs\ship-gate.log. Nothing has been deployed.") }
  if ($newErrs.Count -gt 0) { Write-Host "  The count didn't go up, so carrying on - but send me logs\ship-gate.log afterwards." -ForegroundColor Yellow }

  $npx = Find-Npx
  $npm = Find-Npm
  if ($SkipTests) { Say "Tests SKIPPED (-SkipTests)" 'Yellow' }
  else {
    Say "Tests (Claude's mirror: 87 files, 1,815 tests)"
    $prev = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
    try { & $npx vitest run src 2>&1 | ForEach-Object { "$_" } | Out-Host } finally { $ErrorActionPreference = $prev }
    if ($LASTEXITCODE -ne 0) { Stop-Here "Tests failed - nothing has been deployed. Send me logs\ship-gate.log." }
  }

  Say "Production build - the front end and the server bundle Render runs (npm run build)"
  $prev = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
  try { & $npm run build 2>&1 | ForEach-Object { "$_" } | Out-Host } finally { $ErrorActionPreference = $prev }
  if ($LASTEXITCODE -ne 0) { Stop-Here "The build failed - nothing has been deployed." }

  Set-Content -LiteralPath $CheckedFile -Value (Head-Sha)
  Say "verify done. Next: ship-gate.ps1 golive" 'Green'
}

function Do-GoLive {
  $cur = Current-Branch
  $checked = Read-Marker $CheckedFile

  # A push that failed after the merge: master already holds the release.
  if ($cur -eq 'master' -and $checked -and (Test-BranchExists $ReleaseBranch)) {
    if (GitOk merge-base --is-ancestor $checked master) {
      Say "master already holds the checked release - pushing again"
      Git-OrStop "Nothing was pushed." push origin master
      Say "Pushed. Render builds and deploys master now (a few minutes)." 'Green'
      return
    }
  }

  if ($cur -ne $ReleaseBranch) { Stop-Here ("Run golive on " + $ReleaseBranch + ". Nothing was pushed.") }
  if (-not $checked) { Stop-Here "verify hasn't passed on this branch - run verify first. Nothing was pushed." }
  if ($checked -ne (Head-Sha)) { Stop-Here "The branch has moved since verify passed - run verify again. Nothing was pushed." }
  Require-CleanTree "Nothing was pushed."

  Say "Comparing with GitHub"
  Git-OrStop "Nothing was pushed." fetch origin
  if (-not (GitOk merge-base --is-ancestor origin/master master)) {
    Stop-Here "GitHub's master has commits your master doesn't. Pull them first (git checkout master; git pull), then run prepare again. Nothing was pushed."
  }

  Say ("Fast-forwarding master to " + $ReleaseBranch)
  Git-OrStop "Nothing was pushed." checkout -q master
  if (-not (GitOk merge --ff-only $ReleaseBranch)) {
    RunGit checkout -q $ReleaseBranch | Out-Null
    Stop-Here "master could not be fast-forwarded (it has commits the branch doesn't). Back on gate-fix; nothing was pushed."
  }

  Say "Pushing master (Render deploys it)"
  if (-not (GitOk push origin master)) { Stop-Here "The push failed. master already holds the release locally - fix the connection and run golive again to push." }
  RunGit log --oneline -1 | Out-Host
  Say "Pushed. Render builds and deploys master now (a few minutes). Then: sign in on the iPad, Sync Schedule, and the toast should be a plain success." 'Green'
}

switch ($Stage) {
  'prepare' { Do-Prepare }
  'verify'  { Do-Verify }
  'golive'  { Do-GoLive }
}

try { Stop-Transcript | Out-Null } catch { }
