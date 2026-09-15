<#
  ship-4tab.ps1 - the four-tab client profile, and the FORD round folded in.

  Run from PowerShell, in the repo folder. Two lines do the whole thing:

    powershell -ExecutionPolicy Bypass -File .\backups\4tab-ship\ship-4tab.ps1 -Stage prepare
    powershell -ExecutionPolicy Bypass -File .\backups\4tab-ship\ship-4tab.ps1 -Stage golive

  The copy you run lives in backups\4tab-ship beside the patches, because
  backups\ is gitignored. The last patch installs the permanent copy at
  scripts\ship\ship-4tab.ps1; after the round is merged, that is the one to keep.

  WHAT THIS SHIPS. Sixteen commits, one per phase:
    1-6   the FORD round (Family, Occupation, Recreation, Dreams) and the
          Details + Journal merge. Built Sep 15, never shipped - ship-ford.ps1
          stopped on its preflight and the patches sat in backups\ford-ship.
          They are folded in here unchanged rather than shipped separately.
    7-16  the four-tab profile: the navigation model, the Programming tab,
          the Clinical History tab, the tab row itself, two layout fixes the
          render harness caught, the fix for the FORD date test that went red
          on THIS PC and green in the container (a date-only ISO string is
          UTC, a date-time with no zone is local - the test mixed them), and
          the documents.

  WHAT CHANGED IN THE PREFLIGHT, AND WHY. ship-ford.ps1 refused to start
  because `git status` was not empty - but everything in it was UNTRACKED
  (a .docx in docs\ops, five old ship-*.ps1 scripts). Untracked files are not
  uncommitted changes: they are not in the tree the patches apply to, and
  stashing them was never the point. This preflight stops only on modified or
  staged TRACKED files, and separately on an untracked file that one of the
  patches would create - which is the only way an untracked file can actually
  break `git am`. It lists what it is ignoring so nothing is silent.

  prepare  = preflight + commit + check   (only changes your PC's git history)
  golive   = rules + push                 (production: indexes and rules, then Render)

  Or one stage at a time: -Stage preflight | commit | check | rules | push

  preflight  looks; measures the typecheck on master as the baseline
  commit     applies the patches onto a new branch, client-profile-4-tabs -
             one commit per phase, so any single phase can be reverted on its
             own. The patches are fingerprinted against a manifest first, so
             a half-copied file stops the run instead of applying a
             truncated diff
  check      typecheck (no new errors), tests, a production build - and
             remembers the exact commit that passed
  rules      rules tests, then deploys the INDEXES FIRST and then the rules
  push       merges into master and pushes - Render deploys master, so THIS
             is the go-live

  WHY INDEXES FIRST: the FORD Delight queue reads every client's details at
  one studio in a single collection group query, and Firestore refuses a
  collection group query with no index. The screen says so plainly rather
  than rendering empty, but it does not work until `firestore:indexes` has
  finished building. Indexes build in the background and can take a few
  minutes on a cold collection - it is fine to run the rules and push while
  they build.

  Every stage stops at the first problem and says why. Everything is also
  written to ship-4tab.log (git ignores *.log).
  See docs\rounds\2026-09-15-four-tab-profile.md.

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
Start-Transcript -Path (Join-Path $RepoDir "ship-4tab.log") -Append | Out-Null

# master as the patches were cut from it: "docs: the fix round; the Assessment
# round is next on the roadmap".
$BaseSha = "bd46685"
$ReleaseBranch = "client-profile-4-tabs"
$ShipDir = Join-Path $RepoDir "backups\4tab-ship"
$StateFile = Join-Path $ShipDir "checked.sha"
$TypecheckBaselineFile = Join-Path $ShipDir "tsc-baseline.txt"
$FirebaseProject = "prod"
$PatchCount = 16
# The one rules test that has failed for weeks for reasons unrelated to this
# round (docs\rounds\RUN-THIS-MORNING.md). Any other failure stops the release.
$KnownRulesFailure = "non-empty pinHash"
$SetAsideHint = "Set them aside first: git stash push -m before-4tab   (after the release, git stash pop brings them back). Nothing was changed."

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

  # Tracked changes stop the run. Untracked files do not - see the header.
  $status = (Run git @("status", "--porcelain")).Text -split "`r?`n" | Where-Object { $_.Trim() }
  $dirty = @($status | Where-Object { $_ -notmatch '^\?\?' })
  $untracked = @($status | Where-Object { $_ -match '^\?\?' })

  if ($dirty.Count -gt 0) {
    foreach ($d in $dirty) { Say $d "Red" }
    Die "there are uncommitted changes to files git is tracking. $SetAsideHint"
  }
  Say "No uncommitted changes to tracked files." "Green"

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
      Die "$($collisions.Count) file(s) this round CREATES already exist in the folder, so `git am` would refuse to add them. Move or delete exactly those files (they are untracked, so git is not holding a copy - keep them somewhere if you want them) and run preflight again. Nothing was changed."
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

  $status = (Run git @("status", "--porcelain")).Text -split "`r?`n" | Where-Object { $_.Trim() }
  $dirty = @($status | Where-Object { $_ -notmatch '^\?\?' })
  if ($dirty.Count -gt 0) { Die "there are uncommitted changes to tracked files. $SetAsideHint" }

  $mk = Run git @("checkout", "-b", $ReleaseBranch)
  if ($mk.Code -ne 0) { Say $mk.Text "Red"; Die "could not create the branch $ReleaseBranch." }
  Say "On a new branch: $ReleaseBranch" "Green"

  $patches = Get-ChildItem -LiteralPath $ShipDir -Filter "*.patch" | Sort-Object Name
  if ($patches.Count -ne $PatchCount) { Die "expected $PatchCount patches in $ShipDir, found $($patches.Count)." }

  foreach ($p in $patches) {
    Say ""
    Say "-> $($p.Name)" "Cyan"

    # --3way is the whole trick. This repo has core.autocrlf=true, so the
    # working tree is CRLF while git STORES LF - and a plain apply of an LF
    # patch against a CRLF working tree fails on context lines that are
    # byte-for-byte different. A 3-way merge resolves against the BLOBS in
    # the object store, which are LF on both sides, so line endings never
    # enter into it.
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
  # src/firebase.ts; without it you get phantom "cannot find module" errors
  # that have nothing to do with this round.
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
    Say "Fewer than master - expected: the two dead panes the FORD phase deletes owned two of them." "Green"
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
    if ($m.Success) { Say "$($m.Groups[1].Value) tests passed (expected about 2,069)." "Green" }
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
  Say "WHAT TO LOOK AT - hold the iPad, do not use a mouse:" "Cyan"
  Say "  1. Open a client. FOUR tabs: Journey, Programming, Notes & Profile,"
  Say "     Clinical History. Rotate to landscape and back - no label should"
  Say "     truncate and the row should never scroll sideways."
  Say "  2. Programming. It should OPEN on the routine the client is doing"
  Say "     today. Tap All Machines, pick a machine, tap Routine A, tap All"
  Say "     Machines again - your machine and your search must still be there."
  Say "  3. Clinical History -> Calendar. Scroll it. The month headers must"
  Say "     stop UNDERNEATH the blue sub-toggle, not behind it. This is the"
  Say "     one thing in the round that is measured at runtime."
  Say "  4. Clinical History -> Trends. Generate a report, switch to Calendar,"
  Say "     come back - the report must still be there, not a fresh gate."
  Say "  5. Notes & Profile -> Assessment. The 'N filed reports' line should"
  Say "     take you to Clinical History -> Reports."
  Say "  6. Leave the client, open a DIFFERENT one. It must open on Journey,"
  Say "     not on the first client's segment. Then go back to the first"
  Say "     client - that one should resume where you left it."
  Say "  7. The FORD phases, which have not been looked at yet: start a"
  Say "     session, Notes -> 'Remember this', save without picking a letter;"
  Say "     finish the session and file the card that comes back; find it"
  Say "     under Notes & Profile -> Life. Then Operations -> Delight queue."
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

  # INDEXES FIRST. The collection group index is what the Delight queue reads
  # through; deploying rules first would open access to a query that still
  # cannot run.
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

  $status = (Run git @("status", "--porcelain")).Text -split "`r?`n" | Where-Object { $_.Trim() }
  $dirty = @($status | Where-Object { $_ -notmatch '^\?\?' })
  if ($dirty.Count -gt 0) { Die "there are uncommitted changes to tracked files. $SetAsideHint" }

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
