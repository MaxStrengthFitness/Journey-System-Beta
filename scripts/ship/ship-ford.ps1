<#
  ship-ford.ps1 - the FORD round (Family, Occupation, Recreation, Dreams) and
  the client-profile merge. Modeled on ship-renewals.ps1.

  Run from PowerShell, in the repo folder. Two lines do the whole thing:

    powershell -ExecutionPolicy Bypass -File .\backups\ford-ship\ship-ford.ps1 -Stage prepare
    powershell -ExecutionPolicy Bypass -File .\backups\ford-ship\ship-ford.ps1 -Stage golive

  The copy you run lives in backups\ford-ship beside the patches, because
  backups\ is gitignored - a script sitting untracked inside scripts\ would
  make the preflight's "working tree is clean" check fail before it started.
  Patch 6 installs the permanent copy at scripts\ship\ship-ford.ps1; after
  the round is merged, that is the one to keep.

  prepare  = preflight + commit + check   (only changes your PC's git history)
  golive   = rules + push                 (production: indexes and rules, then Render)

  Or one stage at a time: -Stage preflight | commit | check | rules | push

  preflight  looks; measures the typecheck on master as the baseline
  commit     applies the six patches in backups\ford-ship onto a new branch,
             ford-and-profile-merge - one commit per phase, so any single
             phase can be reverted on its own. The patches are fingerprinted
             against a manifest first, so a half-copied file stops the run
             instead of applying a truncated diff
  check      typecheck (no new errors), tests, a production build - and
             remembers the exact commit that passed
  rules      rules tests, then deploys the INDEXES FIRST and then the rules
  push       merges into master and pushes - Render deploys master, so THIS
             is the go-live

  WHY INDEXES FIRST, AND WHY THEY MATTER THIS TIME: the Delight queue reads
  every client's FORD details at one studio in a single collection group
  query, and Firestore refuses a collection group query with no index. The
  screen says so plainly rather than rendering empty, but it is still a screen
  that does not work until `firestore:indexes` has finished building. Indexes
  build in the background and can take a few minutes on a cold collection -
  it is fine to run the rules and push while they build.

  Every stage stops at the first problem and says why. Everything is also
  written to ship-ford.log (git ignores *.log).
  See docs\rounds\2026-09-15-ford-and-profile-merge.md.

  NOTE FOR EDITORS: PowerShell variable names ignore case. A local $branch
  would silently replace a $Branch-style constant, so the script-wide names
  below are deliberately distinct from every local one.
#>
param(
  [ValidateSet("preflight", "commit", "check", "rules", "push", "prepare", "golive")]
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
Start-Transcript -Path (Join-Path $RepoDir "ship-ford.log") -Append | Out-Null

# master as the patches were cut from it: "docs: the fix round; the Assessment
# round is next on the roadmap".
$BaseSha = "bd46685"
$ReleaseBranch = "ford-and-profile-merge"
$ShipDir = Join-Path $RepoDir "backups\ford-ship"
$StateFile = Join-Path $ShipDir "checked.sha"
$TypecheckBaselineFile = Join-Path $ShipDir "tsc-baseline.txt"
$FirebaseProject = "prod"
# The one rules test that has failed for weeks for reasons unrelated to this
# round (docs\rounds\RUN-THIS-MORNING.md). Any other failure stops the release.
$KnownRulesFailure = "non-empty pinHash"
$SetAsideHint = "Set them aside first: git stash push -m before-ford   (after the release, git stash pop brings them back). Nothing was changed."

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

# ---------------------------------------------------------------- preflight

function Invoke-Preflight {
  Head "Preflight"

  $status = (Run git @("status", "--porcelain")).Text.Trim()
  if ($status) {
    Say $status
    Die "there are uncommitted changes in the repo. $SetAsideHint"
  }
  Say "Working tree is clean." "Green"

  $branchNow = (Run git @("rev-parse", "--abbrev-ref", "HEAD")).Text.Trim()
  Say "On branch: $branchNow"

  # Ancestry, not equality: it is fine to be AHEAD of the patch base, as long
  # as the base is actually in this history. Equality would fail the moment a
  # single unrelated commit landed on master.
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
    Die "$ShipDir is missing. That folder holds the six .patch files and manifest.txt. Nothing was changed."
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
  Say "All six patches match their fingerprints." "Green"

  Head "Typecheck baseline on master"
  Say "This takes a minute. It is the number the check stage compares against."
  $tsc = Run npx @("tsc", "--noEmit")
  $baseline = ([regex]::Matches($tsc.Text, "error TS")).Count
  Set-Content -LiteralPath $TypecheckBaselineFile -Value $baseline
  Say "master has $baseline typecheck errors right now. Expected: 20." "Yellow"
  Say ""
  Say "Preflight passed. Next: -Stage commit  (or -Stage prepare to do the rest in one go)." "Green"
}

# ------------------------------------------------------------------- commit

function Invoke-Commit {
  Head "Applying the round"

  $status = (Run git @("status", "--porcelain")).Text.Trim()
  if ($status) { Die "the working tree is not clean. $SetAsideHint" }

  $mk = Run git @("checkout", "-b", $ReleaseBranch)
  if ($mk.Code -ne 0) { Say $mk.Text "Red"; Die "could not create the branch $ReleaseBranch." }
  Say "On a new branch: $ReleaseBranch" "Green"

  $patches = Get-ChildItem -LiteralPath $ShipDir -Filter "*.patch" | Sort-Object Name
  if ($patches.Count -ne 6) { Die "expected 6 patches in $ShipDir, found $($patches.Count)." }

  foreach ($p in $patches) {
    Say ""
    Say "-> $($p.Name)" "Cyan"

    # --3way is the whole trick. This repo has core.autocrlf=true, so the
    # working tree is CRLF while git STORES LF - and a plain apply of an LF
    # patch against a CRLF working tree fails on context lines that are
    # byte-for-byte different. A 3-way merge resolves against the BLOBS in
    # the object store, which are LF on both sides, so line endings never
    # enter into it. (This is the Sep 13 lesson, solved properly.)
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
  Say "Next: -Stage check" "Green"
}

# -------------------------------------------------------------------- check

function Invoke-Check {
  Head "Checking the build"

  $branchNow = (Run git @("rev-parse", "--abbrev-ref", "HEAD")).Text.Trim()
  if ($branchNow -ne $ReleaseBranch) { Die "you are on $branchNow, not $ReleaseBranch. Run -Stage commit first." }

  # The gitignored applet config. tsc and the build both need it to resolve
  # src/firebase.ts; without it you get two phantom "cannot find module"
  # errors that have nothing to do with this round. (This is what made CI red
  # for a day in September.)
  if (-not (Test-Path -LiteralPath (Join-Path $RepoDir "firebase-applet-config.json"))) {
    Say "firebase-applet-config.json is missing - generating it." "Yellow"
    Run node @("scripts/setup-firebase-config.cjs") | Out-Null
  }

  Head "Typecheck"
  $tsc = Run npx @("tsc", "--noEmit")
  $count = ([regex]::Matches($tsc.Text, "error TS")).Count
  $baseline = 20
  if (Test-Path -LiteralPath $TypecheckBaselineFile) {
    $baseline = [int](Get-Content -LiteralPath $TypecheckBaselineFile -Raw).Trim()
  }
  Say "master had $baseline. This branch has $count."
  if ($count -gt $baseline) {
    Say $tsc.Text "Red"
    Die "the typecheck got WORSE ($baseline -> $count). Nothing has been pushed."
  }
  if ($count -lt $baseline) {
    Say "Fewer than master - expected: the two dead panes deleted this round owned two of them." "Green"
  } else {
    Say "No new typecheck errors." "Green"
  }

  if ($SkipTests) {
    Say "Tests SKIPPED at your request. Say why in the log." "Yellow"
  } else {
    Head "Tests"
    $t = Run npx @("vitest", "run", "src")
    if ($t.Code -ne 0) {
      Say $t.Text "Red"
      Die "tests failed. Nothing has been pushed."
    }
    $m = [regex]::Match($t.Text, "Tests\s+(\d+)\s+passed")
    if ($m.Success) { Say "$($m.Groups[1].Value) tests passed (expected about 2,046)." "Green" }
    else { Say "Tests passed." "Green" }
  }

  Head "Production build"
  $b = Run npx @("vite", "build")
  if ($b.Code -ne 0) {
    Say $b.Text "Red"
    Die "the production build failed. Nothing has been pushed."
  }
  Say "Build clean." "Green"

  $sha = (Run git @("rev-parse", "HEAD")).Text.Trim()
  Set-Content -LiteralPath $StateFile -Value $sha
  Say ""
  Say "Checked at $sha. The push stage will refuse to ship anything else." "Green"
  Say "Next: look at it in the app (npm run dev), then -Stage golive." "Green"
  Say ""
  Say "WHAT TO LOOK AT - the five places this round touches:" "Cyan"
  Say "  1. A client's profile: six tabs now, and the last one is Profile."
  Say "     Scroll it. Life is the FORD hub; Body has the load dropdowns that"
  Say "     used to be in Lifestyle; Notes and Reports are what the Journal tab was."
  Say "  2. Start a session, tap Notes -> 'Remember this'. Type a sentence, save"
  Say "     it WITHOUT picking a letter. It should clear and stay focused."
  Say "  3. Finish the session. The thing you typed should come back as a card"
  Say "     with four buttons, above Lifetime. File it and it disappears."
  Say "  4. Back on the profile, Life -> it is under whichever letter you chose."
  Say "  5. Operations -> Delight queue. Empty until a detail is promoted with"
  Say "     the gift icon; it will ask for the index if that has not deployed."
}

# -------------------------------------------------------------------- rules

function Invoke-Rules {
  Head "Indexes and rules"

  $branchNow = (Run git @("rev-parse", "--abbrev-ref", "HEAD")).Text.Trim()
  if ($branchNow -ne $ReleaseBranch) { Die "you are on $branchNow, not $ReleaseBranch." }

  Head "Rules tests"
  $r = Run npm @("run", "test:rules")
  if ($r.Code -ne 0) {
    $onlyKnown = $false
    $fails = [regex]::Matches($r.Text, "(?m)^\s*(?:x|FAIL|�)\s+.*$")
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

  # INDEXES FIRST. The new collection group index is what the Delight queue
  # reads through; deploying rules first would open access to a query that
  # still cannot run.
  Head "Deploying indexes (this one matters - see the header)"
  $i = Run npx @("firebase", "deploy", "--only", "firestore:indexes", "--project", $FirebaseProject)
  if ($i.Code -ne 0) { Say $i.Text "Red"; Die "the index deploy failed." }
  Say "Indexes deployed. The collection group index for 'ford' may take a few minutes to build - that is fine, carry on." "Green"

  Head "Deploying rules"
  $ru = Run npx @("firebase", "deploy", "--only", "firestore:rules", "--project", $FirebaseProject)
  if ($ru.Code -ne 0) { Say $ru.Text "Red"; Die "the rules deploy failed. The indexes ARE deployed; that is harmless on its own." }
  Say "Rules deployed." "Green"
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

  $status = (Run git @("status", "--porcelain")).Text.Trim()
  if ($status) { Die "the working tree is not clean. $SetAsideHint" }

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
  Say "First sync click after a deploy can 503 while Render wakes up - that is normal, try again in a minute." "Yellow"
}

# --------------------------------------------------------------------- main

switch ($Stage) {
  "preflight" { Invoke-Preflight }
  "commit"    { Invoke-Commit }
  "check"     { Invoke-Check }
  "rules"     { Invoke-Rules }
  "push"      { Invoke-Push }
  "prepare"   { Invoke-Preflight; Invoke-Commit; Invoke-Check }
  "golive"    { Invoke-Rules; Invoke-Push }
}

Stop-Transcript | Out-Null
