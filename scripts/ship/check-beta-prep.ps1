<#
  check-beta-prep.ps1 - look at the beta-prep branch on this PC. NOTHING IS PUSHED.

  Run from PowerShell:

    powershell -ExecutionPolicy Bypass -File .\backups\beta-prep\check-beta-prep.ps1 -Stage look
    powershell -ExecutionPolicy Bypass -File .\backups\beta-prep\check-beta-prep.ps1 -Stage back

  The copy you run lives in backups\beta-prep, because backups\ is gitignored
  and this script switches branches under it. The branch carries the permanent
  copy at scripts\ship\check-beta-prep.ps1.

  WHAT beta-prep IS. The long-lived branch all the beta preparation lands on:
  the cleanup, the polish, later Demo Mode and the tutorials. It is ALREADY IN
  this folder (Claude fetched it in from a bundle). See
  docs\rounds\2026-09-17-beta-prep-trim.md.

  THE RULE (AJ, Sep 17 2026): nothing from beta-prep goes to master until he
  says so. master is what Render builds, so master is what is live. This
  script therefore has NO golive stage and NEVER pushes, merges or deploys.
  It only switches this folder to the branch and checks that it is healthy.

    look  = switch to beta-prep, typecheck, tests, production build
    back  = switch back to master

  Everything is also written to check-beta-prep.log (git ignores *.log).

  ONE CAUTION. "npm run dev" on this PC talks to the LIVE database whatever
  branch you are on. The branch protects the live app's CODE, not its DATA.

  NOTE FOR EDITORS: PowerShell variable names ignore case, so the script-wide
  names below are deliberately distinct from every local one. Keep this file
  plain ASCII: Windows PowerShell 5.1 reads a file with no BOM as ANSI.
#>
param(
  [ValidateSet("look", "back")]
  [string]$Stage = "look",
  # Only if the tests fail on this PC for a reason that has nothing to do with
  # this branch (say so in the log) - the build still has to pass.
  [switch]$SkipTests
)

$ErrorActionPreference = "Continue"
$RepoDir = "C:\Users\austi\Projects\Journey-System-Beta-master"
if ($env:JOURNEY_REPO_DIR) { $RepoDir = $env:JOURNEY_REPO_DIR }   # for dry runs only
if (-not (Test-Path -LiteralPath (Join-Path $RepoDir ".git"))) {
  Write-Host "STOPPED: $RepoDir is not the project folder (no .git in it). Nothing was changed." -ForegroundColor Red
  exit 1
}
Set-Location -LiteralPath $RepoDir
Start-Transcript -Path (Join-Path $RepoDir "check-beta-prep.log") -Append | Out-Null

$WorkBranch = "beta-prep"
$LiveBranch = "master"
# master when beta-prep was cut: "docs(relay): the round document, ..."
$BaseSha = "33ad0ed"
$TypecheckBaseline = 11
$ExpectedTests = "2,982"
# Where -Stage look started from, so -Stage back returns there (master unless
# you were somewhere else). backups\ is gitignored, so this survives a switch.
$CameFromFile = Join-Path $RepoDir "backups\beta-prep\came-from.txt"
$BackHint = "You are on $WorkBranch now; run -Stage back to return to where you were."

# npm 10.9+ ships npx.ps1 / npm.ps1 shims that PowerShell prefers over the
# .cmd files, and the shims re-parse the calling line. Call the .cmd directly.
$NpmExe = "npm"
$NpxExe = "npx"
$npmCmd = Get-Command "npm.cmd" -CommandType Application -ErrorAction SilentlyContinue
if ($npmCmd) { $NpmExe = $npmCmd.Source }
$npxCmd = Get-Command "npx.cmd" -CommandType Application -ErrorAction SilentlyContinue
if ($npxCmd) { $NpxExe = $npxCmd.Source }

function Say($msg, $colour = "Gray") { Write-Host $msg -ForegroundColor $colour }
function Head($msg) { Write-Host ""; Write-Host "=== $msg ===" -ForegroundColor Cyan }
function Die($msg) {
  Write-Host ""
  Write-Host "STOPPED: $msg" -ForegroundColor Red
  Stop-Transcript | Out-Null
  exit 1
}

function Run($exe, [string[]]$argv) {
  $out = & $exe @argv 2>&1
  return @{ Code = $LASTEXITCODE; Text = ($out | Out-String) }
}

function Get-BranchNow { return (Run git @("rev-parse", "--abbrev-ref", "HEAD")).Text.Trim() }

function Assert-NoLock {
  if (Test-Path -LiteralPath (Join-Path $RepoDir ".git\index.lock")) {
    Die "a git lock file is left over (.git\index.lock). If no other git window is open, delete that file and run this again. Nothing was changed."
  }
}

function Assert-Clean {
  $status = (Run git @("status", "--porcelain")).Text -split "`r?`n" | Where-Object { $_.Trim() }
  $dirty = @($status | Where-Object { $_ -notmatch '^\?\?' })
  if ($dirty.Count -gt 0) {
    foreach ($d in $dirty) { Say $d "Red" }
    Die "there are uncommitted changes to files git is tracking, and switching branches could lose them. Set them aside first: git stash push -m before-beta-prep   (git stash pop brings them back). Nothing was changed."
  }
}

# --------------------------------------------------------------------- look

function Invoke-Look {
  Head "Switching to $WorkBranch"
  Assert-NoLock

  $exists = (Run git @("branch", "--list", $WorkBranch)).Text.Trim()
  if (-not $exists) { Die "the branch $WorkBranch is not in this folder. Ask Claude to deliver it again. Nothing was changed." }

  $anc = Run git @("merge-base", "--is-ancestor", $BaseSha, $WorkBranch)
  if ($anc.Code -ne 0) { Die "$WorkBranch does not contain $BaseSha, the master it was built on. Stop and ask. Nothing was changed." }

  $branchNow = Get-BranchNow
  if ($branchNow -ne $WorkBranch) {
    Assert-Clean
    $cameDir = Split-Path -Parent $CameFromFile
    if (-not (Test-Path -LiteralPath $cameDir)) { New-Item -ItemType Directory -Path $cameDir | Out-Null }
    Set-Content -LiteralPath $CameFromFile -Value $branchNow -Encoding ascii
    $sw = Run git @("checkout", $WorkBranch)
    if ($sw.Code -ne 0) { Say $sw.Text "Red"; Die "could not switch to $WorkBranch. Nothing was changed." }
  } else {
    Assert-Clean
  }
  $n = (Run git @("rev-list", "--count", "$BaseSha..HEAD")).Text.Trim()
  Say "On $WorkBranch - $n commits on top of $LiveBranch ($BaseSha). The newest:" "Green"
  Say (Run git @("log", "--oneline", "-5")).Text "DarkGray"

  # Only needed when the branch changed what is installed. The trim did not.
  $lockDiff = Run git @("diff", "--quiet", $BaseSha, "HEAD", "--", "package-lock.json")
  if ($lockDiff.Code -ne 0) {
    Head "Installing packages (package-lock.json differs from $LiveBranch)"
    $ci = Run $NpmExe @("ci")
    if ($ci.Code -ne 0) { Say $ci.Text "Red"; Die "npm ci failed. You are on $WorkBranch; run -Stage back to return to $LiveBranch." }
  }

  if (-not (Test-Path -LiteralPath (Join-Path $RepoDir "firebase-applet-config.json"))) {
    Say "firebase-applet-config.json is missing - generating it (the typecheck needs it)." "Yellow"
    Run node @("scripts/setup-firebase-config.cjs") | Out-Null
  }

  Head "Typecheck"
  Say "This takes a minute."
  $tsc = Run $NpxExe @("tsc", "--noEmit")
  $count = ([regex]::Matches($tsc.Text, "error TS")).Count
  # No "error TS" lines AND a failing exit code means tsc never ran (npx could
  # not find it, node_modules is missing...). That is not a pass.
  if ($count -eq 0 -and $tsc.Code -ne 0) {
    Say $tsc.Text "Red"
    Die "the typecheck did not run at all (no TypeScript output, exit code $($tsc.Code)). Is node_modules installed? Try: npm ci   $BackHint"
  }
  Say "$LiveBranch has $TypecheckBaseline. This branch has $count (it should read $TypecheckBaseline)."
  if ($count -gt $TypecheckBaseline) {
    Say $tsc.Text "Red"
    Die "the typecheck got WORSE ($TypecheckBaseline -> $count). If the extra errors are in 'Claude outputs' or 'harness', those folders are scratch on this PC and not part of the branch. Otherwise send Claude the log (check-beta-prep.log). $BackHint"
  }
  Say "No new typecheck errors." "Green"

  if ($SkipTests) {
    Say "Tests SKIPPED at your request. Say why in the log." "Yellow"
  } else {
    Head "Tests (at the studio's clock)"
    $oldTz = $env:TZ
    $env:TZ = "America/New_York"
    $t = Run $NpxExe @("vitest", "run", "src")
    if ($null -eq $oldTz) { Remove-Item Env:TZ -ErrorAction SilentlyContinue } else { $env:TZ = $oldTz }
    if ($t.Code -ne 0) {
      Say $t.Text "Red"
      Die "tests failed. Send Claude the log (check-beta-prep.log). You are on $WorkBranch; run -Stage back to return to $LiveBranch."
    }
    $m = [regex]::Match($t.Text, "Tests\s+(\d+)\s+passed")
    if ($m.Success) { Say "$($m.Groups[1].Value) tests passed (expected about $ExpectedTests)." "Green" }
    else { Say "Tests passed." "Green" }
  }

  Head "Production build"
  $b = Run $NpmExe @("run", "build")
  if ($b.Code -ne 0) {
    Say $b.Text "Red"
    Die "the production build failed. Send Claude the log (check-beta-prep.log). $BackHint"
  }
  Say "Build clean." "Green"

  Say ""
  Say "$WorkBranch is healthy on this PC. NOTHING was pushed, merged or deployed." "Green"
  Say ""
  Say "To look at it: npm run dev, then open http://localhost:3000" "Yellow"
  Say "  (that uses the LIVE database - the branch protects the app's code, not its data)." "Yellow"
  Say "To go back to what is live: -Stage back" "Yellow"
}

# --------------------------------------------------------------------- back

function Invoke-Back {
  # Back to where -Stage look started from; master if that was never recorded
  # or the branch has since gone.
  $goTo = $LiveBranch
  if (Test-Path -LiteralPath $CameFromFile) {
    $recorded = (Get-Content -LiteralPath $CameFromFile -Raw).Trim()
    if ($recorded -and $recorded -ne $WorkBranch) {
      $there = (Run git @("branch", "--list", $recorded)).Text.Trim()
      if ($there) { $goTo = $recorded }
    }
  }
  Head "Switching back to $goTo"
  Assert-NoLock
  $branchNow = Get-BranchNow
  if ($branchNow -eq $goTo) { Say "Already on $goTo." "Green"; return }
  Assert-Clean
  $sw = Run git @("checkout", $goTo)
  if ($sw.Code -ne 0) { Say $sw.Text "Red"; Die "could not switch to $goTo." }
  Say "On $goTo. $WorkBranch is untouched and still here." "Green"
}

switch ($Stage) {
  "look" { Invoke-Look }
  "back" { Invoke-Back }
}

Stop-Transcript | Out-Null
