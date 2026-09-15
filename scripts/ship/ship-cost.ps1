<#
  ship-cost.ps1 - the cost round (Sep 16 2026).

  Run from PowerShell, in the repo folder. Two lines do the whole thing:

    powershell -ExecutionPolicy Bypass -File .\backups\cost-ship\ship-cost.ps1 -Stage prepare
    powershell -ExecutionPolicy Bypass -File .\backups\cost-ship\ship-cost.ps1 -Stage golive

  Then, when you like (each is optional, each is one line):

    powershell -ExecutionPolicy Bypass -File .\backups\cost-ship\ship-cost.ps1 -Stage trends
    powershell -ExecutionPolicy Bypass -File .\backups\cost-ship\ship-cost.ps1 -Stage tidy

  The copy you run lives in backups\cost-ship beside the patches, because
  backups\ is gitignored. The last patch installs the permanent copy at
  scripts\ship\ship-cost.ps1.

  WHAT THIS SHIPS. Seven commits, one per phase - see
  docs\rounds\2026-09-16-cost-round.md:
    1  the weekly machine-trends job replaces the all-logs leaderboard read
    2  the trainer's role mirrored onto the sign-in token (a Cloud Function),
       so the rules stop reading trainers/{uid} on every request; and the
       self-edit hole closed with it
    3  a 200-item guard rail on the journal's four unbounded listeners
    4  the schedule: three live days, the rest fetched and 15-minute fresh
    5  the ?classic-todo escape hatch and the old screen deleted
    6  knip config, ten dead files, six unused packages (package-lock changed,
       so this script runs `npm ci` after the patches)
    7  the documents, and this script

  prepare  = preflight + commit + install + check   (only changes your PC)
  golive   = rules + functions + backfill + push    (production)
  trends   = builds machineTrends now instead of waiting for Sunday
  tidy     = moves the junk in the repo root (logs, patch folders, the zip,
             "Claude outputs") into backups\tidy-<date>\ - nothing deleted

  Or one stage at a time:
    -Stage preflight | commit | install | check | rules | functions | backfill | push

  preflight  looks; measures the typecheck on master as the baseline
  commit     applies the patches onto a new branch, cost-cleanup - one commit
             per phase, so any single phase can be reverted on its own. The
             patches are fingerprinted against a manifest first
  install    npm ci - six packages left package.json, and node_modules has to
             match the lock file or the build lies
  check      typecheck (no new errors), tests at the studio's clock, the
             production build AND the backend bundle (a new cron entry) -
             and remembers the exact commit that passed
  rules      rules tests, then deploys the rules (no index changed this round)
  functions  deploys ONE Cloud Function, syncTrainerClaims. The others are
             untouched and are not redeployed
  backfill   stamps every existing trainer's role onto their sign-in token,
             once (dry run first, then for real). From then on the function
             keeps it current
  push       merges into master and pushes - Render deploys master, so THIS
             is the go-live. It also rebuilds the cron service from the
             blueprint; its schedule is now Sundays

  WHY THIS ORDER: rules first, because the new rules only ADD (a machineTrends
  block, a tighter self-edit rule) and the running app is unaffected; the
  function next, so that by the time the new app is live the token already
  carries the role for anyone who signs in; the backfill so nobody has to
  sign in twice; the push last.

  Every stage stops at the first problem and says why. Everything is also
  written to ship-cost.log (git ignores *.log).

  NOTE FOR EDITORS: PowerShell variable names ignore case. A local $branch
  would silently replace a $Branch-style constant, so the script-wide names
  below are deliberately distinct from every local one.
#>
param(
  [ValidateSet("preflight", "commit", "install", "check", "rules", "functions", "backfill", "push", "trends", "tidy", "prepare", "golive")]
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
Start-Transcript -Path (Join-Path $RepoDir "ship-cost.log") -Append | Out-Null

# master as the patches were cut from it: "fix(tsc): a gitignored scratch
# folder must not fail the typecheck".
$BaseSha = "1c19af0"
$ReleaseBranch = "cost-cleanup"
$ShipDir = Join-Path $RepoDir "backups\cost-ship"
$StateFile = Join-Path $ShipDir "checked.sha"
$TypecheckBaselineFile = Join-Path $ShipDir "tsc-baseline.txt"
$FirebaseProject = "prod"
$PatchCount = 7
$ExpectedTests = "2,128"
# The one rules test that has failed for weeks for reasons unrelated to this
# round (docs\rounds\RUN-THIS-MORNING.md). Any other failure stops the release.
$KnownRulesFailure = "non-empty pinHash"
$SetAsideHint = "Set them aside first: git stash push -m before-cost   (after the release, git stash pop brings them back). Nothing was changed."

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
  if ($branchNow -ne $ReleaseBranch) { Die "you are on $branchNow, not $ReleaseBranch. Run -Stage commit first." }
}

# ---------------------------------------------------------------- preflight

function Invoke-Preflight {
  Head "Preflight"

  Assert-Clean $SetAsideHint
  Say "No uncommitted changes to tracked files." "Green"

  $status = (Run git @("status", "--porcelain")).Text -split "`r?`n" | Where-Object { $_.Trim() }
  $untracked = @($status | Where-Object { $_ -match '^\?\?' })
  if ($untracked.Count -gt 0) {
    Say "Ignoring $($untracked.Count) untracked file(s) - they are not part of this release:" "DarkGray"
    foreach ($u in $untracked) { Say "  $($u.Substring(3))" "DarkGray" }
  }

  # The one way an untracked file CAN break the run: git am refuses to create
  # a file that is already sitting there.
  $createsFile = Join-Path $ShipDir "creates.txt"
  if (Test-Path -LiteralPath $createsFile) {
    $collisions = @()
    foreach ($line in Get-Content -LiteralPath $createsFile) {
      $rel = $line.Trim()
      if (-not $rel) { continue }
      $win = $rel -replace "/", "\"
      if (Test-Path -LiteralPath (Join-Path $RepoDir $win)) { $collisions += $rel }
    }
    if ($collisions.Count -gt 0) {
      foreach ($c in $collisions) { Say "  IN THE WAY  $c" "Red" }
      Die "$($collisions.Count) file(s) this round CREATES already exist in the folder, so git am would refuse to add them. Move or delete exactly those files (they are untracked, so git is not holding a copy) and run preflight again. Nothing was changed."
    }
    Say "Nothing in the way of the files this round adds." "Green"
  }

  $branchNow = (Run git @("rev-parse", "--abbrev-ref", "HEAD")).Text.Trim()
  Say "On branch: $branchNow"

  # Ancestry, not equality: it is fine to be AHEAD of the patch base, as long
  # as the base is actually in this history.
  $anc = Run git @("merge-base", "--is-ancestor", $BaseSha, "HEAD")
  if ($anc.Code -ne 0) {
    Die "this branch does not contain $BaseSha, the master commit these patches were cut from. Check out master and pull first. Nothing was changed."
  }
  Say "History contains the patch base $BaseSha." "Green"

  $existing = (Run git @("branch", "--list", $ReleaseBranch)).Text.Trim()
  if ($existing) {
    Die "the branch $ReleaseBranch already exists. If a previous run got part way, delete it first: git branch -D $ReleaseBranch   Nothing was changed."
  }

  if (-not (Test-Path -LiteralPath $ShipDir)) {
    Die "$ShipDir is missing. That folder holds the .patch files and manifest.txt. Nothing was changed."
  }

  Head "Fingerprinting the patches"
  $manifest = Join-Path $ShipDir "manifest.txt"
  if (-not (Test-Path -LiteralPath $manifest)) { Die "$manifest is missing." }

  $bad = 0
  foreach ($line in Get-Content -LiteralPath $manifest) {
    if (-not $line.Trim()) { continue }
    $parts = $line -split "\s+", 2
    $want = $parts[0].ToLower()
    $name = $parts[1].Trim()
    $file = Join-Path $ShipDir $name
    if (-not (Test-Path -LiteralPath $file)) { Say "MISSING  $name" "Red"; $bad++; continue }
    $got = (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLower()
    if ($got -ne $want) { Say "CHANGED  $name" "Red"; $bad++ }
    else { Say "ok       $name" "DarkGray" }
  }
  if ($bad -gt 0) {
    Die "$bad patch file(s) are missing or do not match the manifest. A half-copied patch applies a truncated diff, which is worse than not applying it at all. Copy the folder again. Nothing was changed."
  }
  Say "All $PatchCount patches match their fingerprints." "Green"

  Head "Typecheck baseline on master"
  Say "This takes a minute. It is the number the check stage compares against."
  $tsc = Run $NpxExe @("tsc", "--noEmit")
  $baseline = ([regex]::Matches($tsc.Text, "error TS")).Count
  Set-Content -LiteralPath $TypecheckBaselineFile -Value $baseline
  Say "master has $baseline typecheck errors right now. Expected: 18." "Yellow"
  Say ""
  Say "Preflight passed. Next: -Stage commit  (or -Stage prepare to do the rest in one go)." "Green"
}

# ------------------------------------------------------------------- commit

function Invoke-Commit {
  Head "Applying the round"

  Assert-Clean $SetAsideHint

  $mk = Run git @("checkout", "-b", $ReleaseBranch)
  if ($mk.Code -ne 0) { Say $mk.Text "Red"; Die "could not create the branch $ReleaseBranch." }
  Say "On a new branch: $ReleaseBranch" "Green"

  $patches = Get-ChildItem -LiteralPath $ShipDir -Filter "*.patch" | Sort-Object Name
  if ($patches.Count -ne $PatchCount) { Die "expected $PatchCount patches in $ShipDir, found $($patches.Count)." }

  foreach ($p in $patches) {
    Say ""
    Say "-> $($p.Name)" "Cyan"

    # --3way: this repo has core.autocrlf=true, so the working tree is CRLF
    # while git STORES LF. A 3-way merge resolves against the blobs in the
    # object store, which are LF on both sides, so line endings never enter
    # into it.
    $am = Run git @("am", "--3way", "--whitespace=nowarn", $p.FullName)
    if ($am.Code -ne 0) {
      Say $am.Text "Red"
      Say ""
      Say "That patch did not apply. Nothing is half-done - undo the whole attempt with:" "Yellow"
      Say "    git am --abort" "Yellow"
      Say "    git checkout master" "Yellow"
      Say "    git branch -D $ReleaseBranch" "Yellow"
      Die "patch $($p.Name) failed. The log above says which file and line."
    }
    $subject = (Run git @("log", "-1", "--pretty=%s")).Text.Trim()
    Say "   committed: $subject" "Green"
  }

  $n = (Run git @("rev-list", "--count", "$BaseSha..HEAD")).Text.Trim()
  Say ""
  Say "$n commits on $ReleaseBranch, one per phase. Any single phase can be reverted on its own with: git revert <sha>" "Green"
  Say "Next: -Stage install" "Green"
}

# ------------------------------------------------------------------ install

function Invoke-Install {
  Head "npm ci"
  Assert-OnReleaseBranch
  Say "Six packages left package.json in phase 6, so node_modules has to be rebuilt from the new lock file. A minute or two."
  $ci = Run $NpmExe @("ci", "--no-audit", "--no-fund")
  if ($ci.Code -ne 0) {
    Say $ci.Text "Red"
    Die "npm ci failed. The branch is fine; fix the install (is anything holding node_modules open?) and run -Stage install again."
  }
  Say "node_modules matches the lock file." "Green"
  Say "Next: -Stage check" "Green"
}

# -------------------------------------------------------------------- check

function Invoke-Check {
  Head "Checking the build"
  Assert-OnReleaseBranch

  # The gitignored applet config. tsc and the build both need it to resolve
  # src/firebase.ts; without it you get phantom "cannot find module" errors
  # that have nothing to do with this round.
  if (-not (Test-Path -LiteralPath (Join-Path $RepoDir "firebase-applet-config.json"))) {
    Say "firebase-applet-config.json is missing - generating it." "Yellow"
    Run node @("scripts/setup-firebase-config.cjs") | Out-Null
  }

  Head "Typecheck"
  $tsc = Run $NpxExe @("tsc", "--noEmit")
  $count = ([regex]::Matches($tsc.Text, "error TS")).Count
  $baseline = 18
  if (Test-Path -LiteralPath $TypecheckBaselineFile) {
    $baseline = [int](Get-Content -LiteralPath $TypecheckBaselineFile -Raw).Trim()
  }
  Say "master had $baseline. This branch has $count."
  if ($count -gt $baseline) {
    Say $tsc.Text "Red"
    Die "the typecheck got WORSE ($baseline -> $count). Nothing has been pushed."
  }
  Say "No new typecheck errors." "Green"

  if ($SkipTests) {
    Say "Tests SKIPPED at your request. Say why in the log." "Yellow"
  } else {
    Head "Tests (at the studio's clock)"
    # A date-only ISO string is UTC and a date-time with no zone is local;
    # the suite is run in Eastern so a mix shows up here, not on the floor.
    $oldTz = $env:TZ
    $env:TZ = "America/New_York"
    $t = Run $NpxExe @("vitest", "run", "src")
    if ($null -eq $oldTz) { Remove-Item Env:TZ -ErrorAction SilentlyContinue } else { $env:TZ = $oldTz }
    if ($t.Code -ne 0) {
      Say $t.Text "Red"
      Die "tests failed. Nothing has been pushed."
    }
    $m = [regex]::Match($t.Text, "Tests\s+(\d+)\s+passed")
    if ($m.Success) { Say "$($m.Groups[1].Value) tests passed (expected about $ExpectedTests)." "Green" }
    else { Say "Tests passed." "Green" }
  }

  Head "Production build"
  $b = Run $NpxExe @("vite", "build")
  if ($b.Code -ne 0) {
    Say $b.Text "Red"
    Die "the production build failed. Nothing has been pushed."
  }
  Say "Build clean." "Green"

  Head "Backend bundle (the cron jobs)"
  $bb = Run $NpmExe @("run", "build:backend")
  if ($bb.Code -ne 0) {
    Say $bb.Text "Red"
    Die "the backend bundle failed. Nothing has been pushed."
  }
  if (-not (Test-Path -LiteralPath (Join-Path $RepoDir "dist\cron-machine-trends.cjs"))) {
    Die "dist\cron-machine-trends.cjs was not produced. Nothing has been pushed."
  }
  Say "Backend bundle clean; cron-machine-trends.cjs is there." "Green"

  $sha = (Run git @("rev-parse", "HEAD")).Text.Trim()
  Set-Content -LiteralPath $StateFile -Value $sha
  Say ""
  Say "Checked at $sha. The push stage will refuse to ship anything else." "Green"
  Say "Next: look at it in the app (npm run dev), then -Stage golive." "Green"
  Say ""
  Say "WHAT TO LOOK AT:" "Cyan"
  Say "  1. Sign in. It should feel the same. (Behind the scenes the app now"
  Say "     refreshes your sign-in token once if it is missing your role.)"
  Say "  2. The Hub: today and tomorrow should be exactly as before. Tap the"
  Say "     other day tabs - they should still show their bookings."
  Say "  3. Calendar: go to LAST week and to NEXT month. Both used to come up"
  Say "     empty; both should fill in now. There is a Refresh button with"
  Say "     'Updated N min ago' next to the picker."
  Say "  4. Planner: the old list is gone; ?classic-todo does nothing now."
  Say "  5. A client profile: Notes & Profile should look exactly as before."
}

# -------------------------------------------------------------------- rules

function Invoke-Rules {
  Head "Rules"
  Assert-OnReleaseBranch

  Head "Rules tests"
  $r = Run $NpmExe @("run", "test:rules")
  if ($r.Code -ne 0) {
    $onlyKnown = $false
    $fails = [regex]::Matches($r.Text, "(?m)^\s*(?:x|FAIL)\s+.*$")
    if ($fails.Count -ge 1) {
      $onlyKnown = $true
      foreach ($f in $fails) { if ($f.Value -notmatch [regex]::Escape($KnownRulesFailure)) { $onlyKnown = $false } }
    }
    if ($onlyKnown) {
      Say "Only the known long-standing failure ($KnownRulesFailure). Continuing." "Yellow"
    } else {
      Say $r.Text "Red"
      Die "the rules tests failed. Nothing has been deployed. If this is the JDK 21 problem rather than a real failure, say so and re-run with the emulator sorted."
    }
  } else {
    Say "Rules tests passed." "Green"
  }

  # No index changed this round, so no index deploy: the machineTrends
  # documents are read one at a time, and the schedule range query uses the
  # studioId + startTime index that is already live.
  Head "Deploying rules"
  $ru = Run $NpxExe @("firebase", "deploy", "--only", "firestore:rules", "--project", $FirebaseProject)
  if ($ru.Code -ne 0) { Say $ru.Text "Red"; Die "the rules deploy failed. Nothing else has changed." }
  Say "Rules deployed." "Green"
  Say "Next: -Stage functions" "Green"
}

# ---------------------------------------------------------------- functions

function Invoke-Functions {
  Head "Cloud Function: syncTrainerClaims"
  Assert-OnReleaseBranch

  # firebase.json's predeploy builds functions/ with its own TypeScript, so
  # functions/node_modules has to exist. Older PCs never installed it.
  if (-not (Test-Path -LiteralPath (Join-Path $RepoDir "functions\node_modules"))) {
    Say "functions\node_modules is missing - installing (one time)." "Yellow"
    $fci = Run $NpmExe @("--prefix", "functions", "ci", "--no-audit", "--no-fund")
    if ($fci.Code -ne 0) { Say $fci.Text "Red"; Die "npm ci in functions\ failed." }
  }

  # ONLY this function. --only functions:<name> leaves mindbodyWebhook and the
  # others exactly as they are deployed today.
  $fd = Run $NpxExe @("firebase", "deploy", "--only", "functions:syncTrainerClaims", "--project", $FirebaseProject)
  if ($fd.Code -ne 0) {
    Say $fd.Text "Red"
    Die "the function deploy failed. The rules ARE deployed; that is harmless on its own (the app just keeps paying the read it always did). Fix and run -Stage functions again."
  }
  Say "syncTrainerClaims deployed. From now on any change to a trainer document updates that person's role claim." "Green"
  Say "Next: -Stage backfill" "Green"
}

# ----------------------------------------------------------------- backfill

function Invoke-Backfill {
  Head "Backfill: the role claim for every existing trainer"
  Assert-OnReleaseBranch

  if (-not (Test-Path -LiteralPath (Join-Path $RepoDir "service-account.json"))) {
    Say "service-account.json is not in the project folder, so the backfill cannot run from here." "Yellow"
    Say "That is not fatal: each trainer's claim gets set the next time their document is touched, and until then the rules read the document as they always did." "Yellow"
    Say "Run it later with:  npx tsx scripts/backfill-trainer-claims.ts --commit" "Yellow"
    return
  }

  Say "Dry run first - this prints what would change and writes nothing:"
  $dry = Run $NpxExe @("tsx", "scripts/backfill-trainer-claims.ts")
  Say $dry.Text "DarkGray"
  if ($dry.Code -ne 0) { Die "the dry run failed (see above). Nothing was written." }

  Say "Now for real:"
  $real = Run $NpxExe @("tsx", "scripts/backfill-trainer-claims.ts", "--commit")
  Say $real.Text "DarkGray"
  if ($real.Code -ne 0) { Die "the backfill failed part way (see above). It is safe to run -Stage backfill again: a claim that is already right is skipped." }
  Say "Claims set. A signed-in trainer picks theirs up on the next sign-in, or within the hour." "Green"
  Say "Next: -Stage push  (this is the go-live)." "Green"
}

# --------------------------------------------------------------------- push

function Invoke-Push {
  Head "Go live"

  if (-not (Test-Path -LiteralPath $StateFile)) { Die "no checked commit on file. Run -Stage check first." }
  $checked = (Get-Content -LiteralPath $StateFile -Raw).Trim()
  $head = (Run git @("rev-parse", "HEAD")).Text.Trim()
  if ($head -ne $checked) {
    Die "HEAD is $head but the commit that passed the checks was $checked. Something changed since. Run -Stage check again."
  }
  Say "Shipping the exact commit that passed: $checked" "Green"

  Assert-Clean $SetAsideHint

  $co = Run git @("checkout", "master")
  if ($co.Code -ne 0) { Say $co.Text "Red"; Die "could not switch to master." }

  $pull = Run git @("pull", "--ff-only", "origin", "master")
  if ($pull.Code -ne 0) {
    Say $pull.Text "Red"
    Run git @("checkout", $ReleaseBranch) | Out-Null
    Die "could not fast-forward master from origin. Someone else has pushed. Sort that out first; you are back on $ReleaseBranch."
  }

  # ff-only: if this cannot fast-forward, master moved and the round needs a
  # rebase - it must never quietly produce a merge commit nobody reviewed.
  $merge = Run git @("merge", "--ff-only", $ReleaseBranch)
  if ($merge.Code -ne 0) {
    Say $merge.Text "Red"
    Run git @("checkout", $ReleaseBranch) | Out-Null
    Die "master could not fast-forward to $ReleaseBranch. Rebase the branch on master and run -Stage check again. You are back on $ReleaseBranch."
  }

  $push = Run git @("push", "origin", "master")
  if ($push.Code -ne 0) {
    Say $push.Text "Red"
    Die "the push failed. Nothing is live. Your local master IS merged - fix the push and re-run -Stage push."
  }

  Say ""
  Say "LIVE. Render is building master now; give it a few minutes." "Green"
  Say "https://maxstrength-app-beta.onrender.com" "Green"
  Say ""
  Say "Render's blueprint sync will also pick up the cron change (Sundays, the machine-trends command)." "Yellow"
  Say "If the dashboard shows the blueprint out of date, open Blueprints -> Sync once." "Yellow"
  Say "The machineTrends data is empty until Sunday - or run:  -Stage trends" "Yellow"
}

# ------------------------------------------------------------------- trends

function Invoke-Trends {
  Head "Machine trends - build them now"
  if (-not (Test-Path -LiteralPath (Join-Path $RepoDir "service-account.json"))) {
    Die "service-account.json is not in the project folder; the job needs it to read Firestore from this PC. Sunday's cron run needs nothing from you."
  }
  Say "Dry run first - reads the last 90 days and prints a summary per machine:"
  $dry = Run $NpxExe @("tsx", "scripts/run-machine-trends.ts")
  Say $dry.Text "DarkGray"
  if ($dry.Code -ne 0) { Die "the dry run failed (see above). Nothing was written." }
  Say "Now writing machineTrends/*:"
  $real = Run $NpxExe @("tsx", "scripts/run-machine-trends.ts", "--commit")
  Say $real.Text "DarkGray"
  if ($real.Code -ne 0) { Die "the write failed part way (see above). Safe to run again: it rebuilds from scratch." }
  Say "Done. Look in Firestore at machineTrends/_summary." "Green"
}

# --------------------------------------------------------------------- tidy

function Invoke-Tidy {
  Head "Tidying the repo root"
  Say "None of these were ever in git (they are all in .gitignore). They are moved, not deleted."
  $stamp = Get-Date -Format "yyyyMMdd"
  $tidyDir = Join-Path $RepoDir ("backups\tidy-" + $stamp)
  $moved = 0
  $targets = @()
  foreach ($d in @("logs", "patches-fix", "patches-floor", "patches-gate", "patches-tracker", "patches", "Claude outputs")) {
    $full = Join-Path $RepoDir $d
    if (Test-Path -LiteralPath $full) { $targets += $full }
  }
  foreach ($f in Get-ChildItem -LiteralPath $RepoDir -File -ErrorAction SilentlyContinue) {
    if ($f.Name -like "ship-*.log" -or $f.Name -like "*.zip" -or $f.Name -eq "firestore-debug.log" -or $f.Name -like "*.txtcd") {
      # Not the log this very run is writing.
      if ($f.Name -ne "ship-cost.log") { $targets += $f.FullName }
    }
  }
  if ($targets.Count -eq 0) { Say "Nothing to tidy." "Green"; return }
  New-Item -ItemType Directory -Path $tidyDir -Force | Out-Null
  foreach ($t in $targets) {
    $leaf = Split-Path -Leaf $t
    $dest = Join-Path $tidyDir $leaf
    if (Test-Path -LiteralPath $dest) { Say "  skip (already there)  $leaf" "DarkGray"; continue }
    try {
      Move-Item -LiteralPath $t -Destination $dest -ErrorAction Stop
      Say "  moved  $leaf" "Green"
      $moved++
    } catch {
      Say "  could not move $leaf : $($_.Exception.Message)" "Yellow"
    }
  }
  Say ""
  Say "$moved item(s) moved to $tidyDir. Delete that folder whenever you are sure you do not want any of it." "Green"
  Say "Keep: harness\ (your local preview harness), backups\ (reports and ship folders)." "DarkGray"
}

# --------------------------------------------------------------------- main

switch ($Stage) {
  "preflight" { Invoke-Preflight }
  "commit"    { Invoke-Commit }
  "install"   { Invoke-Install }
  "check"     { Invoke-Check }
  "rules"     { Invoke-Rules }
  "functions" { Invoke-Functions }
  "backfill"  { Invoke-Backfill }
  "push"      { Invoke-Push }
  "trends"    { Invoke-Trends }
  "tidy"      { Invoke-Tidy }
  "prepare"   { Invoke-Preflight; Invoke-Commit; Invoke-Install; Invoke-Check }
  "golive"    { Invoke-Rules; Invoke-Functions; Invoke-Backfill; Invoke-Push }
}

Stop-Transcript | Out-Null
