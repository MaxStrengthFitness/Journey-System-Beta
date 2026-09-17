<#
  ship-relay.ps1 - the Relay round (Sep 16 2026).

  Run from PowerShell. Two lines do the whole thing:

    powershell -ExecutionPolicy Bypass -File .\backups\relay-ship\ship-relay.ps1 -Stage prepare
    powershell -ExecutionPolicy Bypass -File .\backups\relay-ship\ship-relay.ps1 -Stage golive

  The copy you run lives in backups\relay-ship, because backups\ is
  gitignored and golive switches branches under it. The branch carries the
  permanent copy at scripts\ship\ship-relay.ps1.

  WHAT THIS SHIPS. The branch relay is ALREADY IN this folder (Claude applied
  it with git am). Eleven commits, one per phase - see
  docs\rounds\2026-09-16-relay.md:
     1  the shell - Relay, the Now Bar, the Pulse, the context panel
     2  Capture - one composer instead of five
     3  the Floor - Next up, the shift rings, swipe rows
     4  the Floor Map - machine wear, care, flags (NEW collection machineCare)
     5  Mine - Today, Handed to you, Follow-ups, Growth, Send to Floor
     6  Notes - two panes, lift into the note, classify after, audiences
     7  Team - who's in today, cohorts, open loops, the studio's day, the
        vault (NEW collection vault)
     8  the Calendar layer
     9  kudos
    10  Network - focus, initiatives, studios ranked (NEW index)
    11  the documents and this script

  WHAT ELSE DEPLOYS. One Firestore index (taskInstances: status + localDate)
  and the rules (two new collections, one field on the teamJobs floor list).
  No Cloud Functions, no packages, no server change.

  prepare  = preflight + check   (only looks at your PC)
  golive   = rules + push        (production: the index, the rules tests, the
                                  rules, then Render deploys master)

  Or one stage at a time:  -Stage preflight | check | rules | push

  Every stage stops at the first problem and says why. Everything is also
  written to ship-relay.log (git ignores *.log).

  NOTE FOR EDITORS: PowerShell variable names ignore case, so the
  script-wide names below are deliberately distinct from every local one.
#>
param(
  [ValidateSet("preflight", "check", "rules", "push", "prepare", "golive")]
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
Start-Transcript -Path (Join-Path $RepoDir "ship-relay.log") -Append | Out-Null

# master when the branch was cut: "fix(rating): the pure module is scales.ts".
$BaseSha = "e09a48d"
$ReleaseBranch = "relay"
$ShipDir = Join-Path $RepoDir "backups\relay-ship"
$StateFile = Join-Path $ShipDir "checked.sha"
$RulesStateFile = Join-Path $ShipDir "rules.sha"
$PhaseCount = 11
$TypecheckBaseline = 13
$ExpectedTests = "2,977"
$FirebaseProject = "prod"
$LiveProjectId = "gen-lang-client-0731527386"
$LiveDatabase = "ai-studio-32cbbdcc-6e08-4770-9665-867c68878efa"
# A function only this round's rules have.
$LiveRulesMarker = "machineCareValid"
# The one rules test that failed for weeks for reasons unrelated to any round
# (docs\rounds\RUN-THIS-MORNING.md). Any other failure stops the release.
$KnownRulesFailure = "non-empty pinHash"
$SetAsideHint = "Set them aside first: git stash push -m before-relay   (after the release, git stash pop brings them back). Nothing was changed."

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

function Assert-AtCheckedCommit {
  $checkedSha = Read-Marker $StateFile
  if (-not $checkedSha) { Die "no checked commit on file. Run -Stage prepare first." }
  $headSha = (Run git @("rev-parse", "HEAD")).Text.Trim()
  if ($headSha -ne $checkedSha) {
    Die "HEAD is $headSha but the commit that passed the checks was $checkedSha. Something changed since. Run -Stage prepare again."
  }
  return $checkedSha
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
      Die "GitHub's master has moved since this branch was cut, so master cannot simply fast-forward to it. Send Claude this log (ship-relay.log). Nothing was changed."
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
      Die "tests failed. Nothing has been pushed. Send Claude the log (ship-relay.log)."
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
  Say "Checked at $sha. The rules and push stages will refuse to ship anything else." "Green"
  Say ""
  Say "Want to look first? npm run dev, then open http://localhost:3000 (it uses the live" "Yellow"
  Say "database). When you're happy: -Stage golive" "Yellow"
}

# -------------------------------------------------------------------- rules

function Invoke-Rules {
  Head "Index and rules"

  # A re-run of golive after a failed push: already deployed for this commit.
  $alreadyChecked = Read-Marker $StateFile
  if ($alreadyChecked -and (Read-Marker $RulesStateFile) -eq $alreadyChecked) {
    Say "The index and rules for $alreadyChecked are already deployed. Skipping." "Green"
    return
  }

  Assert-OnReleaseBranch
  $checkedSha = Assert-AtCheckedCommit

  # The index first: it takes minutes to build and changes nothing alone.
  Head "Deploying the Firestore index (project '$FirebaseProject')"
  Write-Host "  If it asks whether to DELETE indexes that aren't in the file, answer N." -ForegroundColor Yellow
  & $NpxExe firebase deploy --only firestore:indexes --project $FirebaseProject
  if ($LASTEXITCODE -ne 0) { Die "the index deploy failed. The rules were NOT deployed and nothing has been pushed." }

  Head "Rules tests (the emulator - this takes a couple of minutes)"
  $r = Run $NpmExe @("run", "test:rules")
  if ($r.Code -ne 0) {
    $onlyKnown = $false
    $esc = [string][char]27
    $clean = $r.Text -replace "$esc\[[0-9;]*m", ""
    $fails = [regex]::Matches($clean, "(?m)^.*\bFAIL\b.*$")
    if ($fails.Count -ge 1) {
      $onlyKnown = $true
      foreach ($f in $fails) {
        if ($f.Value -match "Test Files|Tests\s") { continue }
        if ($f.Value -notmatch [regex]::Escape($KnownRulesFailure)) { $onlyKnown = $false }
      }
    }
    if ($onlyKnown) {
      Say "Only the known long-standing failure ($KnownRulesFailure). Continuing." "Yellow"
    } else {
      Say $r.Text "Red"
      Die "the rules tests failed. The rules were NOT deployed and nothing has been pushed (the index is live; alone it changes nothing). If it says JAVA or 'port taken' rather than a failing test, that is the emulator, not the rules: sort it out and run -Stage golive again. Otherwise send Claude the log (ship-relay.log)."
    }
  } else {
    Say "Rules tests passed." "Green"
  }

  Head "Deploying rules"
  $ru = Run $NpxExe @("firebase", "deploy", "--only", "firestore:rules", "--project", $FirebaseProject)
  if ($ru.Code -ne 0) { Say $ru.Text "Red"; Die "the rules deploy failed. Nothing has been pushed; the live app is unaffected." }

  Say "Checking the rules that are actually live"
  $live = @(& $NpxExe tsx scripts/fetch-live-rules.ts --project $LiveProjectId --database $LiveDatabase --expect $LiveRulesMarker 2>&1 | ForEach-Object { "$_" })
  $live | ForEach-Object { Write-Host "  $_" }
  $liveText = $live -join "`n"
  if ($liveText -cmatch "Contains /$LiveRulesMarker/ \? NO") {
    Die "the live rules do not contain $LiveRulesMarker, so the deploy did not take. Nothing has been pushed."
  }

  Set-Content -LiteralPath $RulesStateFile -Value $checkedSha
  Say "Rules deployed. They only add, so the app that is live right now is unaffected." "Green"
  Say "Next: -Stage push  (golive runs it for you)" "Green"
}

# --------------------------------------------------------------------- push

function Invoke-Push {
  Head "Go live"

  $checkedSha = Read-Marker $StateFile
  if (-not $checkedSha) { Die "no checked commit on file. Run -Stage prepare first." }
  if ((Read-Marker $RulesStateFile) -ne $checkedSha) {
    Die "the rules for $checkedSha are not deployed yet. Run -Stage golive (it does the rules first)."
  }

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
    [void](Assert-AtCheckedCommit)
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
  Say "WHAT TO LOOK AT (the full list is in docs\ops\TESTING-CHECKLIST.md, 'Relay'):" "Cyan"
  Say "  1. Relay between two sessions: the Now Bar names the shift, your next client and the minutes free."
  Say "  2. Capture (the orange button): type a line, Relay it. Then the same for The Floor and for Someone."
  Say "  3. The Floor: Next up, tap Do it; swipe a card right; the rings close as Opening is ticked."
  Say "  4. The Floor Map after a session: the two machines you used read warm; Wiped cools one."
  Say "  5. Notes: two panes, Lift into the note, the suggested kind under File it."
  Say "  6. Team (head trainer): Who's in today, Route to team on a cohort, the vault."
  Say "  7. The Calendar: the Relay strip above the month."
}

# --------------------------------------------------------------------- main

switch ($Stage) {
  "preflight" { Invoke-Preflight }
  "check"     { Invoke-Check }
  "rules"     { Invoke-Rules }
  "push"      { Invoke-Push }
  "prepare"   { Invoke-Preflight; Invoke-Check }
  "golive"    { Invoke-Rules; Invoke-Push }
}

Stop-Transcript | Out-Null
