<#
  ship-reporting.ps1 - the reporting round (Sep 16 2026).

  Run from PowerShell. Two lines do the whole thing:

    powershell -ExecutionPolicy Bypass -File .\backups\reporting-ship\ship-reporting.ps1 -Stage prepare
    powershell -ExecutionPolicy Bypass -File .\backups\reporting-ship\ship-reporting.ps1 -Stage golive

  The copy you run lives in backups\reporting-ship, because backups\ is
  gitignored and golive switches branches under it. The branch carries the
  permanent copy at scripts\ship\ship-reporting.ps1.

  WHAT THIS SHIPS. The branch reporting-round is ALREADY IN this folder
  (Claude applied it with git am). Eleven commits, one per phase - see
  docs\rounds\2026-09-16-reporting-round.md:
     1  the Dial and Loudness (features/rating) and the data types
     2  Update Pulse - the one-area quick-log
     3  the round document
     4  the pre-session briefing on the Dial
     5  notes: capture now, file later; Loudness; matters until; the Pulse tab
     6  the post-session screen: the dose Dial, Loudness, the note sweep
     7  Pulse - the living assessment on the Dial, client mode, the name
     8  the Client Progress Report: Pulse out, the 4 P's on the Dial
     9  the Kaizen Deep Dive
    10  the last legacy readers, the documents, and this script
    11  scales.ts - a Windows-only fix (dial.ts and Dial.tsx were one file there)

  WHAT ELSE DEPLOYS. Nothing. No rules, no indexes, no Cloud Functions, no
  packages, no server change. Every new field is optional and on documents
  the app already owns (sessions.dose, preSessionCheckIn.readiness,
  bodyStates[].dial / until).

  prepare  = preflight + check   (only looks at your PC)
  golive   = push                (production: Render deploys master)

  Or one stage at a time:  -Stage preflight | check | push

  Every stage stops at the first problem and says why. Everything is also
  written to ship-reporting.log (git ignores *.log).

  NOTE FOR EDITORS: PowerShell variable names ignore case, so the
  script-wide names below are deliberately distinct from every local one.
#>
param(
  [ValidateSet("preflight", "check", "push", "prepare", "golive")]
  [string]$Stage = "preflight",
  # Only if the tests fail on this PC for a reason that has nothing to do with
  # this release (say so in the log) - the build still has to pass.
  [switch]$SkipTests
)

$ErrorActionPreference = "Continue"
$RepoDir = "C:\Users\austi\Projects\Journey-System-Beta-master"
if (-not (Test-Path -LiteralPath (Join-Path $RepoDir ".git"))) {
  Write-Host "STOPPED: $RepoDir is not the project folder (no .git in it). Nothing was changed." -ForegroundColor Red
  exit 1
}
Set-Location -LiteralPath $RepoDir
Start-Transcript -Path (Join-Path $RepoDir "ship-reporting.log") -Append | Out-Null

# master when the branch was cut: "docs: the hub sync fixes - round document,
# CLAUDE.md, roadmap, walkthrough, and its ship script".
$BaseSha = "a00af6f"
$ReleaseBranch = "reporting-round"
$ShipDir = Join-Path $RepoDir "backups\reporting-ship"
$StateFile = Join-Path $ShipDir "checked.sha"
$PhaseCount = 11
# master had 13; this round retired two charts and their two errors with them.
$TypecheckBaseline = 13
$ExpectedTests = "2,903"
$SetAsideHint = "Set them aside first: git stash push -m before-reporting   (after the release, git stash pop brings them back). Nothing was changed."

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

function Read-Marker($file) {
  if (-not (Test-Path -LiteralPath $file)) { return "" }
  return (Get-Content -LiteralPath $file -Raw).Trim()
}

function Assert-Clean($hint) {
  $status = (Run git @("status", "--porcelain")).Text -split "`r?`n" | Where-Object { $_.Trim() }
  $dirty = @($status | Where-Object { $_ -notmatch '^\?\?' })
  if ($dirty.Count -gt 0) {
    foreach ($d in $dirty) { Say $d "Red" }
    Die "there are uncommitted changes to files git is tracking. $hint"
  }
}

function Assert-OnReleaseBranch {
  $branchNow = (Run git @("rev-parse", "--abbrev-ref", "HEAD")).Text.Trim()
  if ($branchNow -ne $ReleaseBranch) {
    Die "you are on $branchNow, not $ReleaseBranch. Run: git checkout $ReleaseBranch   and try again. Nothing was changed."
  }
}

# ---------------------------------------------------------------- preflight

function Invoke-Preflight {
  Head "Preflight"

  if (Test-Path -LiteralPath (Join-Path $RepoDir ".git\index.lock")) {
    Die "a git lock file is left over (.git\index.lock). If no other git window is open, delete that file and run this again. Nothing was changed."
  }

  $exists = (Run git @("branch", "--list", $ReleaseBranch)).Text.Trim()
  if (-not $exists) { Die "the branch $ReleaseBranch is not in this folder. Nothing was changed." }

  Assert-OnReleaseBranch
  Assert-Clean $SetAsideHint
  Say "On $ReleaseBranch, no uncommitted changes to tracked files." "Green"

  $anc = Run git @("merge-base", "--is-ancestor", $BaseSha, "HEAD")
  if ($anc.Code -ne 0) { Die "this branch does not contain $BaseSha, the master it was built on. Stop and ask. Nothing was changed." }

  $n = (Run git @("rev-list", "--count", "$BaseSha..HEAD")).Text.Trim()
  if ($n -ne "$PhaseCount") { Die "the branch has $n commits after $BaseSha; this round has $PhaseCount. Stop and ask. Nothing was changed." }
  Say "$n commits on top of master, one per phase:" "Green"
  Say (Run git @("log", "--oneline", "$BaseSha..HEAD")).Text "DarkGray"

  # What GitHub has, not what we think it has.
  $fetch = Run git @("fetch", "origin", "master")
  if ($fetch.Code -ne 0) {
    Say $fetch.Text "Yellow"
    Say "Could not reach GitHub (offline?). The push stage will try again." "Yellow"
  } else {
    $ff = Run git @("merge-base", "--is-ancestor", "origin/master", "HEAD")
    if ($ff.Code -ne 0) {
      Die "GitHub's master has moved since this branch was cut, so master cannot simply fast-forward to it. Send Claude this log (ship-reporting.log). Nothing was changed."
    }
    Say "GitHub's master is behind this branch - it will fast-forward cleanly." "Green"
  }

  if (-not (Test-Path -LiteralPath $ShipDir)) { New-Item -ItemType Directory -Path $ShipDir | Out-Null }
  Say ""
  Say "Preflight passed. Next: -Stage check  (prepare runs it for you)." "Green"
}

# -------------------------------------------------------------------- check

function Invoke-Check {
  Head "Checking the build"
  Assert-OnReleaseBranch
  Assert-Clean $SetAsideHint

  if (-not (Test-Path -LiteralPath (Join-Path $RepoDir "firebase-applet-config.json"))) {
    Say "firebase-applet-config.json is missing - generating it (the typecheck needs it)." "Yellow"
    Run node @("scripts/setup-firebase-config.cjs") | Out-Null
  }

  Head "Typecheck"
  Say "This takes a minute."
  $tsc = Run $NpxExe @("tsc", "--noEmit")
  $count = ([regex]::Matches($tsc.Text, "error TS")).Count
  Say "master had $TypecheckBaseline. This branch has $count (the round adds none; it should read 11)."
  if ($count -gt $TypecheckBaseline) {
    Say $tsc.Text "Red"
    Die "the typecheck got WORSE ($TypecheckBaseline -> $count). Nothing has been pushed."
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
      Die "tests failed. Nothing has been pushed. Send Claude the log (ship-reporting.log)."
    }
    $m = [regex]::Match($t.Text, "Tests\s+(\d+)\s+passed")
    if ($m.Success) { Say "$($m.Groups[1].Value) tests passed (expected about $ExpectedTests)." "Green" }
    else { Say "Tests passed." "Green" }
  }

  Head "Production build"
  $b = Run $NpmExe @("run", "build")
  if ($b.Code -ne 0) {
    Say $b.Text "Red"
    Die "the production build failed. Nothing has been pushed."
  }
  if (-not (Test-Path -LiteralPath (Join-Path $RepoDir "dist\server.cjs"))) {
    Die "dist\server.cjs was not produced. Nothing has been pushed."
  }
  Say "Build clean." "Green"

  $sha = (Run git @("rev-parse", "HEAD")).Text.Trim()
  Set-Content -LiteralPath $StateFile -Value $sha
  Say ""
  Say "Checked at $sha. The push stage will refuse to ship anything else." "Green"
  Say ""
  Say "Want to look first? npm run dev, then open http://localhost:3000 (it uses the live" "Yellow"
  Say "database). When you're happy: -Stage golive" "Yellow"
}

# --------------------------------------------------------------------- push

function Invoke-Push {
  Head "Go live"

  $checkedSha = Read-Marker $StateFile
  if (-not $checkedSha) { Die "no checked commit on file. Run -Stage prepare first." }

  $branchNow = (Run git @("rev-parse", "--abbrev-ref", "HEAD")).Text.Trim()
  if ($branchNow -eq "master") {
    # A re-run after a failed push: master is already merged.
    $headSha = (Run git @("rev-parse", "HEAD")).Text.Trim()
    if ($headSha -ne $checkedSha) {
      Die "you are on master at $headSha, not the checked commit $checkedSha. Run: git checkout $ReleaseBranch   and -Stage prepare again."
    }
    Say "master is already at the checked commit - retrying the push." "Yellow"
  } else {
    Assert-OnReleaseBranch
    $headSha = (Run git @("rev-parse", "HEAD")).Text.Trim()
    if ($headSha -ne $checkedSha) {
      Die "HEAD is $headSha but the commit that passed the checks was $checkedSha. Something changed since. Run -Stage prepare again."
    }
    Assert-Clean $SetAsideHint
    Say "Shipping the exact commit that passed: $checkedSha" "Green"

    $co = Run git @("checkout", "master")
    if ($co.Code -ne 0) { Say $co.Text "Red"; Die "could not switch to master." }

    $pull = Run git @("pull", "--ff-only", "origin", "master")
    if ($pull.Code -ne 0) {
      Say $pull.Text "Red"
      Run git @("checkout", $ReleaseBranch) | Out-Null
      Die "could not fast-forward master from GitHub. Someone else has pushed. You are back on $ReleaseBranch; send Claude the log."
    }

    # ff-only: it must never quietly produce a merge commit nobody reviewed.
    $merge = Run git @("merge", "--ff-only", $ReleaseBranch)
    if ($merge.Code -ne 0) {
      Say $merge.Text "Red"
      Run git @("checkout", $ReleaseBranch) | Out-Null
      Die "master could not fast-forward to $ReleaseBranch. You are back on $ReleaseBranch; send Claude the log."
    }
  }

  $push = Run git @("push", "origin", "master")
  if ($push.Code -ne 0) {
    Say $push.Text "Red"
    Die "the push failed. Nothing is live. Your local master IS merged - fix the push (sign in to GitHub?) and run -Stage golive again."
  }

  Say ""
  Say "LIVE. Render is building master now; give it a few minutes." "Green"
  Say "https://maxstrength-app-beta.onrender.com" "Green"
  Say ""
  Say "WHAT TO LOOK AT (docs\ops\TESTING-CHECKLIST.md, 'The reporting round'):" "Cyan"
  Say "  1. Start a session: the briefing's four Dials, a body region on the Dial, Update Pulse."
  Say "  2. Notes in the session: save one with no category, then find it in the To-file tray."
  Say "  3. End the session: How did it land (the Dial), Note / Heads up / Critical, the tray."
  Say "  4. The client's record: Pulse on the frequency words, Hand to client."
  Say "  5. A progress report: five steps, the 4 P's on the Dial, the Pulse snapshot."
  Say "  6. Activity Archive -> Deep Dive: the caveat line, stalls first, no tonnage."
}

# --------------------------------------------------------------------- main

switch ($Stage) {
  "preflight" { Invoke-Preflight }
  "check"     { Invoke-Check }
  "push"      { Invoke-Push }
  "prepare"   { Invoke-Preflight; Invoke-Check }
  "golive"    { Invoke-Push }
}

Stop-Transcript | Out-Null
