<#
  ship-profile-audit.ps1 - the client-profile audit round (Sep 16 2026).

  Run from PowerShell, in the repo folder. Two lines do the whole thing:

    powershell -ExecutionPolicy Bypass -File .\backups\profile-audit-ship\ship-profile-audit.ps1 -Stage prepare
    powershell -ExecutionPolicy Bypass -File .\backups\profile-audit-ship\ship-profile-audit.ps1 -Stage golive

  The copy you run lives in backups\profile-audit-ship beside the patches,
  because backups\ is gitignored. The last patch installs the permanent copy
  at scripts\ship\ship-profile-audit.ps1.

  WHAT THIS SHIPS. Fourteen commits, one per phase - see
  docs\rounds\2026-09-16-client-profile-audit.md:
     1  Journey: no caption, no Latest frame, older sessions load on scroll
     2  one machine window for every machine tap on the profile
     3  Mindbody Master Sync (a new server route + the library behind it)
     4  Goals (SMART, achieved + reward) and Focus (several, history)
     5  the notes catalog - seven categories, category-first capture
     6  the Assessment: three pillars and a history log
     7  progress reports: three real accolades drafted from the data
     8  Programming: one row language, set-up suggestions, clinical watch-outs
     9  Who they are: nickname, the one Sync button, the honest waiver
    10  Admin rebuilt around the contract
    11  Life and Body baselines, the searchable flag picker
    12  Clinical History becomes the Activity Archive
    13  the review round's fixes
    14  the documents, and this script

  NOTHING ELSE TO DEPLOY. No Firestore rules, no indexes, no Cloud
  Functions, no packages changed. The new server route ships with the web
  service, which Render rebuilds on every push to master.

  prepare  = preflight + commit + check   (only changes your PC)
  golive   = push                          (production)

  Or one stage at a time:  -Stage preflight | commit | check | push

  preflight  looks; measures the typecheck on master as the baseline
  commit     applies the patches onto a new branch, client-profile-audit -
             one commit per phase, so any single phase can be reverted on its
             own. The patches are fingerprinted against a manifest first
  check      typecheck (no new errors), tests at the studio's clock, and the
             full production build (the app AND the server bundle, which now
             carries the Master Sync route) - and remembers the exact commit
             that passed
  push       merges into master and pushes - Render deploys master, so THIS
             is the go-live

  Every stage stops at the first problem and says why. Everything is also
  written to ship-profile-audit.log (git ignores *.log).

  NOTE FOR EDITORS: PowerShell variable names ignore case. A local $branch
  would silently replace a $Branch-style constant, so the script-wide names
  below are deliberately distinct from every local one.
#>
param(
  [ValidateSet("preflight", "commit", "check", "push", "prepare", "golive")]
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
Start-Transcript -Path (Join-Path $RepoDir "ship-profile-audit.log") -Append | Out-Null

# master as the patches were cut from it: "docs: the cost round".
$BaseSha = "2f28fc9"
$ReleaseBranch = "client-profile-audit"
$ShipDir = Join-Path $RepoDir "backups\profile-audit-ship"
$StateFile = Join-Path $ShipDir "checked.sha"
$TypecheckBaselineFile = Join-Path $ShipDir "tsc-baseline.txt"
$PatchCount = 14
$ExpectedTests = "2,636"
$SetAsideHint = "Set them aside first: git stash push -m before-profile-audit   (after the release, git stash pop brings them back). Nothing was changed."

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

  # The real remote first: a stale local master is how a previous round told
  # you to delete tracked files. Look at what GitHub has, not what we think.
  $fetch = Run git @("fetch", "origin", "master")
  if ($fetch.Code -ne 0) { Say $fetch.Text "Yellow"; Say "Could not fetch origin (offline?). Checking against the local history only." "Yellow" }
  else {
    $remoteHasBase = Run git @("merge-base", "--is-ancestor", $BaseSha, "origin/master")
    if ($remoteHasBase.Code -ne 0) {
      Die "GitHub's master does not contain $BaseSha, the commit these patches were cut from. Something unexpected happened to master - stop and ask. Nothing was changed."
    }
    $ahead = (Run git @("rev-list", "--count", "$BaseSha..origin/master")).Text.Trim()
    if ($ahead -ne "0") { Say "GitHub's master has $ahead commit(s) after the patch base. The patches apply with a 3-way merge; if one conflicts, this stops cleanly." "Yellow" }
    else { Say "GitHub's master is exactly the patch base." "Green" }
  }

  # Ancestry, not equality: it is fine to be AHEAD of the patch base, as long
  # as the base is actually in this history.
  $anc = Run git @("merge-base", "--is-ancestor", $BaseSha, "HEAD")
  if ($anc.Code -ne 0) {
    Die "this branch does not contain $BaseSha, the master commit these patches were cut from. Run: git checkout master   then   git pull --ff-only origin master   and try again. Nothing was changed."
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
  $listed = 0
  foreach ($line in Get-Content -LiteralPath $manifest) {
    if (-not $line.Trim()) { continue }
    $parts = $line -split "\s+", 2
    $want = $parts[0].ToLower()
    $name = $parts[1].Trim()
    $listed++
    $file = Join-Path $ShipDir $name
    if (-not (Test-Path -LiteralPath $file)) { Say "MISSING  $name" "Red"; $bad++; continue }
    $got = (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLower()
    if ($got -ne $want) { Say "CHANGED  $name" "Red"; $bad++ }
    else { Say "ok       $name" "DarkGray" }
  }
  if ($listed -ne $PatchCount) { Die "the manifest lists $listed patches; this round has $PatchCount. Copy the folder again. Nothing was changed." }
  if ($bad -gt 0) {
    Die "$bad patch file(s) are missing or do not match the manifest. A half-copied patch applies a truncated diff, which is worse than not applying it at all. Copy the folder again. Nothing was changed."
  }
  Say "All $PatchCount patches match their fingerprints." "Green"

  if (-not (Test-Path -LiteralPath (Join-Path $RepoDir "firebase-applet-config.json"))) {
    Say "firebase-applet-config.json is missing - generating it (the typecheck needs it)." "Yellow"
    Run node @("scripts/setup-firebase-config.cjs") | Out-Null
  }

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

  # The patches are applied on top of master as GitHub has it.
  $co = Run git @("checkout", "master")
  if ($co.Code -ne 0) { Say $co.Text "Red"; Die "could not switch to master." }
  $pull = Run git @("pull", "--ff-only", "origin", "master")
  if ($pull.Code -ne 0) { Say $pull.Text "Yellow"; Say "Could not fast-forward master from GitHub; applying onto the local master." "Yellow" }
  $masterHasBase = Run git @("merge-base", "--is-ancestor", $BaseSha, "HEAD")
  if ($masterHasBase.Code -ne 0) {
    Die "your master does not contain $BaseSha, the commit these patches were cut from. Run: git pull --ff-only origin master   and try again. Nothing was changed."
  }

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

  $n = (Run git @("rev-list", "--count", "master..HEAD")).Text.Trim()
  Say ""
  Say "$n commits on $ReleaseBranch, one per phase. Any single phase can be reverted on its own with: git revert <sha>" "Green"
  Say "Next: -Stage check" "Green"
}

# -------------------------------------------------------------------- check

function Invoke-Check {
  Head "Checking the build"
  Assert-OnReleaseBranch

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
  Say "master had $baseline. This branch has $count (13 expected - the round deleted dead code that held five)."
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

  Head "Production build (the app and the server)"
  # npm run build = the Vite build AND the server bundle, which is what Render
  # runs; the Master Sync route lives in the server.
  $b = Run $NpmExe @("run", "build")
  if ($b.Code -ne 0) {
    Say $b.Text "Red"
    Die "the production build failed. Nothing has been pushed."
  }
  if (-not (Test-Path -LiteralPath (Join-Path $RepoDir "dist\server.cjs"))) {
    Die "dist\server.cjs was not produced. Nothing has been pushed."
  }
  Say "Build clean; dist\server.cjs is there." "Green"

  $sha = (Run git @("rev-parse", "HEAD")).Text.Trim()
  Set-Content -LiteralPath $StateFile -Value $sha
  Say ""
  Say "Checked at $sha. The push stage will refuse to ship anything else." "Green"
  Say "Next: look at it in the app (npm run dev), then -Stage golive." "Green"
  Say ""
  Say "WHAT TO LOOK AT (the full list is docs\ops\TESTING-CHECKLIST.md):" "Cyan"
  Say "  1. A client profile: tap all four tabs twice. The last one reads ACTIVITY ARCHIVE."
  Say "  2. Journey: no 'Recent journey' title, no blue Latest column; scroll the"
  Say "     grid left and older sessions appear by themselves."
  Say "  3. Tap a machine on the Journey grid - the same window as Programming ->"
  Say "     All Machines opens. Close it and tap the same machine again."
  Say "  4. The round arrow button beside Tracking is Sync. Tap it on a client with"
  Say "     a Mindbody ID; Notes & Profile -> Who they are should fill in address,"
  Say "     waiver, status. (npm run dev talks to PRODUCTION data - Sync writes"
  Say "     Mindbody's values onto that real client, which is what it is for.)"
  Say "  5. Notes & Profile: Goes by (nickname), Life, Body (search 'disc'),"
  Say "     Goals, Notes (tap a category tile), Assessment, Admin."
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
  Say "Nothing else to deploy: no rules, indexes or Cloud Functions changed this round." "Yellow"
  Say "First thing to try live: Sync on a client with a Mindbody ID. A client that" "Yellow"
  Say "says it has 'two different Mindbody IDs' needs a leader to confirm who it is." "Yellow"
}

# --------------------------------------------------------------------- main

switch ($Stage) {
  "preflight" { Invoke-Preflight }
  "commit"    { Invoke-Commit }
  "check"     { Invoke-Check }
  "push"      { Invoke-Push }
  "prepare"   { Invoke-Preflight; Invoke-Commit; Invoke-Check }
  "golive"    { Invoke-Push }
}

Stop-Transcript | Out-Null
