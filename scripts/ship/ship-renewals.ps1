<#
  ship-renewals.ps1 - the Renewals round (Operations Dashboard + Renewals),
  one stage at a time. Modeled on ship-sep10.ps1.

  Run from PowerShell, in the repo folder. Two lines do the whole thing:

    powershell -ExecutionPolicy Bypass -File .\ship-renewals.ps1 -Stage prepare
    powershell -ExecutionPolicy Bypass -File .\ship-renewals.ps1 -Stage golive

  prepare  = preflight + commit + check   (only changes your PC's git history)
  golive   = rules + push                  (production: indexes and rules, then Render)

  Or one stage at a time: -Stage preflight | commit | check | rules | push

  preflight  looks; measures the typecheck on master as the baseline
  commit     one commit per patch in backups\renewals-ship, on a new branch,
             operations-renewals (the patches are fingerprinted first)
  check      typecheck (no new errors), tests, a production build, the cron
             bundles - and remembers the exact commit that passed
  rules      rules tests, then deploys the indexes and the rules to production
  push       merges into master and pushes - Render deploys master, so THIS
             is the go-live

  Every stage stops at the first problem and says why. Everything is also
  written to ship-renewals.log (git ignores *.log). See RENEWALS-ROUND.md.

  NOTE FOR EDITORS: PowerShell variable names ignore case. A local $branch
  would silently replace $ReleaseBranch-style constants, so the script-wide
  names below are deliberately distinct from every local one.
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
Start-Transcript -Path (Join-Path $RepoDir "ship-renewals.log") -Append | Out-Null

$BaseSha = "ec0369171e1495f04631b7e6a03f0de8866e8841"   # master after the Sep 10 go-live
$ReleaseBranch = "operations-renewals"
$ShipDir = Join-Path $RepoDir "backups\renewals-ship"
$DocsBackupDir = Join-Path $RepoDir "backups\renewals-docs-before"
$Trailer = "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`nClaude-Session: https://claude.ai/code/session_01M9zXifeqzj49MTdAuBxZ3B"
$FirebaseProject = "prod"
$LiveProjectId = "gen-lang-client-0731527386"
$LiveDatabase = "ai-studio-32cbbdcc-6e08-4770-9665-867c68878efa"
# The one rules test that has failed for weeks for reasons unrelated to this
# round (RUN-THIS-MORNING.md). Any other failure stops the release.
$KnownRulesFailure = "non-empty pinHash"
# What to do about uncommitted changes that aren't part of this release.
$SetAsideHint = "Set them aside first: git stash push -m before-renewals   (after the release, git stash pop brings them back). Nothing was changed."

# The patches, in order, one commit each. The fingerprint is checked before
# any patch is used, so a half-copied file can never become a commit.
$Phases = @(
  @{ File = "00.patch"; Sha256 = "872d5d746c05cbf6eb194ec68987b4daf26e0ecdae7697d9bd18f22bf73a0f94"; Message = "Renewals 0: Mindbody routes need a staff sign-in; pull pricing options and scheduled charges; collision check" }
  @{ File = "01.patch"; Sha256 = "e422debb4a009012e5126a99c82ee49d33a586854a6971387e36787bcad69500"; Message = "Renewals 1: the Admin dashboard is called Operations (labels only)" }
  @{ File = "02.patch"; Sha256 = "a427852f496eb039f200daeca6115fd98150301a4d49ec6f73bc0ae9a3cea940"; Message = "Renewals 2: each studio's renewal settings and package table (Operations -> Renewals), with rules" }
  @{ File = "03.patch"; Sha256 = "20755246e446236fe3dbc206258f79f2e2f3dcfdb27ad0a73721030e6306a7e5"; Message = "Renewals 3: the renewal engine - two clocks, situations, flags, proof and package options (pure, tested)" }
  @{ File = "04.patch"; Sha256 = "a385339858378f854148ac94b27be7e7d031c5f8de7796e5f9e14efddc0f486b"; Message = "Renewals 4: the nightly renewals job (Render cron), live single-client snapshots, the snapshot guard rule and index" }
  @{ File = "05.patch"; Sha256 = "1c5ae2e0fb118c4f59b5dd75604529ef237cc660ef107de28c2a2bd31625daec"; Message = "Renewals 5: renewal conversations - the Renewal card, the post-session prompt, the briefing line, the Hub lane, My renewals, and rules" }
  @{ File = "06.patch"; Sha256 = "f0b3950b4a8063109daeb85bc2fdb1547a9431d4d14ddb88568bd778774115e3"; Message = "Renewals 6: Operations -> Renewals pipeline and the Renewal Brief" }
  @{ File = "07.patch"; Sha256 = "0912f125141020898c2f770a736b2a2d69ad90ebbf0dd9a0931d36630fb2fd9e"; Message = "Renewals 7: InBody scans in the app - entry, the body-composition card and trends, the client summary for the Brief, the progress-report section, and rules" }
  @{ File = "08.patch"; Sha256 = "65e4b7742022132f0f0ecaa67582bbd26308d5d579282e0b2ebc869036638f9e"; Message = "Renewals 8: outcomes - recorded overnight or by a leader in the Brief, and the leader-only Outcomes view by package, trainer and studio" }
  @{ File = "09.patch"; Sha256 = "4da5249c202882d723584fcafd602a7dd2ef29ff6fb0cd2652a6e2e3f6c6c455"; Message = "Renewals 9: fixes from the independent review - Mindbody gate hardening, no false lapsed or lost, prepaid clients stay findable, better pull order, cleared outcomes stick, no backdated conversations" }
  @{ File = "10.patch"; Sha256 = "3da06b350615a6c85638385409baec241a86dbc778751f0ce8181da5994f6cbe"; Message = "Renewals docs: the round document, the proposal's answers and deviations, CLAUDE.md, docs/business, the READMEs and the roadmap" }
)

# Copies of these may be in the folder before they are in git (the Sep 10
# docs, and this round's notes). The docs commit adds them, so the copies are
# moved aside first and the committed versions take their place.
$UntrackedDocs = @(
  "CLAUDE.md"
  "OPERATIONS-RENEWALS-PROPOSAL.md"
  "RENEWALS-ROUND.md"
  "docs/business/README.md"
  "docs/business/data-sources.md"
  "docs/business/glossary.md"
  "docs/business/packages-and-pricing.md"
  "docs/business/renewals.md"
  "docs/business/roles-and-permissions.md"
)

function Say([string]$msg, [string]$color = "Cyan") {
  Write-Host ""
  Write-Host "== $msg" -ForegroundColor $color
}

function Stop-Here([string]$why) {
  Write-Host ""
  Write-Host "STOPPED: $why" -ForegroundColor Red
  Stop-Transcript | Out-Null
  exit 1
}

# Runs git and stops the script if git fails. (Only for commands with no "--":
# a PowerShell function swallows it. Those call git directly.)
function Git-OrStop {
  & git @args
  if ($LASTEXITCODE -ne 0) { Stop-Here ("git " + ($args -join " ") + " failed (exit $LASTEXITCODE)") }
}

# npm and npx as programs (npm.cmd / npx.cmd). Newer Node installs also add
# npm.ps1 / npx.ps1 wrappers, which PowerShell prefers and which re-read the
# calling line - so this script never goes through them.
function Find-Program([string]$name) {
  foreach ($candidate in @("$name.cmd", "$name.exe")) {
    $found = @(Get-Command $candidate -CommandType Application -ErrorAction SilentlyContinue)
    if ($found.Count -gt 0) { return $found[0].Path }
  }
  Stop-Here "Can't find $name (part of Node.js). Open a new PowerShell window and try again."
}
$NpxExe = Find-Program "npx"
$NpmExe = Find-Program "npm"

# A stale lock from an earlier crash blocks every git command. Only remove it
# when no git process is actually running.
if (Test-Path ".git\index.lock") {
  if (Get-Process git -ErrorAction SilentlyContinue) { Stop-Here "git is running right now (.git\index.lock exists). Close it and try again." }
  Remove-Item ".git\index.lock" -Force
  Write-Host "  removed a stale .git\index.lock" -ForegroundColor Yellow
}

function Current-Branch { (git rev-parse --abbrev-ref HEAD).Trim() }
function Head-Sha { (git rev-parse HEAD).Trim() }
function Test-BranchExists([string]$name) {
  git show-ref --verify --quiet "refs/heads/$name"
  return ($LASTEXITCODE -eq 0)
}

# The check stage leaves the commit it verified here; rules and push refuse to
# run for any other commit. So pasting both lines at once is still safe: if
# the tests or the build fail, nothing reaches production.
$CheckedFile = Join-Path $RepoDir ".git\ship-renewals-checked"
$RulesFile = Join-Path $RepoDir ".git\ship-renewals-rules-deployed"
$BaselineFile = Join-Path $RepoDir ".git\ship-renewals-tsc-baseline.txt"
function Read-Marker([string]$file) {
  if (-not (Test-Path -LiteralPath $file)) { return "" }
  return ("" + (Get-Content -LiteralPath $file -Raw)).Trim()
}
function Checked-Sha { Read-Marker $CheckedFile }
function Require-OnRelease([string]$nothingDone) {
  $here = Current-Branch
  if ($here -eq $ReleaseBranch) { return }
  if (Test-BranchExists $ReleaseBranch) { Stop-Here "You're on $here, not the release. Switch to it first: git checkout $ReleaseBranch   $nothingDone" }
  Stop-Here "Run the commit stage first (you're on $here). $nothingDone"
}
function Require-Checked {
  if ((Checked-Sha) -ne (Head-Sha)) { Stop-Here "The check stage has not passed for this exact commit. Nothing was deployed." }
}
# The push needs this release's rules to be live first (the new screens read
# and write through them).
function Require-RulesDeployed([string]$sha) {
  if ((Read-Marker $RulesFile) -ne $sha) { Stop-Here "This release's rules haven't been deployed yet - run -Stage golive (or -Stage rules first). Nothing was pushed." }
}

Say "Stage: $Stage   (on $(Current-Branch) at $((Head-Sha).Substring(0, 8)))"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

function Test-Patches {
  if (-not (Test-Path -LiteralPath $ShipDir)) { Stop-Here "The folder $ShipDir is missing. It holds the patches this script applies." }
  foreach ($p in $Phases) {
    $path = Join-Path $ShipDir $p.File
    if (-not (Test-Path -LiteralPath $path)) { Stop-Here "Missing $path. Nothing was changed." }
    $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $path).Hash.ToLower()
    if ($hash -ne $p.Sha256) { Stop-Here "$($p.File) is not the file that was checked (its fingerprint differs). Nothing was changed." }
  }
  Write-Host "  all $($Phases.Count) patches present and unchanged" -ForegroundColor Green
}

# Every path the patches touch, read from their "diff --git" lines.
function Get-TouchedPaths {
  $list = New-Object System.Collections.Generic.List[string]
  foreach ($p in $Phases) {
    foreach ($line in [System.IO.File]::ReadAllLines((Join-Path $ShipDir $p.File))) {
      if ($line -match '^diff --git a/(\S+) b/(\S+)$') {
        if (-not $list.Contains($Matches[2])) { $list.Add($Matches[2]) }
      }
    }
  }
  return ,$list.ToArray()
}

# Nothing may be staged: it would ride along in the first commit.
function Test-NothingStaged {
  git diff --cached --quiet
  if ($LASTEXITCODE -ne 0) {
    git diff --cached --name-status | ForEach-Object { Write-Host "  $_" -ForegroundColor Yellow }
    Stop-Here "Some changes are staged (git add) - listed above. Unstage them first (git reset), so they can't slip into this release. Nothing was changed."
  }
}

# Nothing this release touches may have local changes: the commit stage ends
# by checking those files out fresh. Untracked copies of the docs are
# expected (they are moved aside); any other untracked file in the way stops.
function Test-TouchedClean {
  $touched = Get-TouchedPaths
  $status = @(& git status --porcelain --untracked-files=all -- @touched)
  $problems = @()
  foreach ($line in $status) {
    if (-not $line) { continue }
    $code = $line.Substring(0, 2)
    $file = $line.Substring(3).Trim('"')
    if ($code -eq "??" -and ($UntrackedDocs -contains $file)) { continue }
    $problems += $line
  }
  if ($problems.Count -gt 0) {
    Say "Files this release changes already have changes of their own:" "Yellow"
    $problems | ForEach-Object { Write-Host "  $_" -ForegroundColor Yellow }
    Stop-Here "Commit, stash or undo those first (they would be overwritten). Nothing was changed."
  }
  Write-Host "  the $($touched.Count) files this release touches are clean" -ForegroundColor Green
}

# The typecheck: its error lines ("file(line,col): error TSxxxx: ..."), and
# whether it ran at all (a crash also prints no error lines).
function Measure-Tsc {
  $out = @(& $NpxExe tsc --noEmit -p tsconfig.json 2>&1 | ForEach-Object { "$_" })
  $code = $LASTEXITCODE
  $errs = @($out | Where-Object { $_ -match 'error TS\d+' })
  if ($errs.Count -eq 0 -and $code -ne 0) {
    $out | Select-Object -Last 20 | ForEach-Object { Write-Host "  $_" -ForegroundColor Yellow }
    Stop-Here "The typecheck didn't run (exit $code, no error list) - see above. Nothing was changed by this step."
  }
  return ,$errs
}

# Moves the untracked doc copies aside. Returns where they went. Stops (after
# putting back anything already moved) if one can't be moved.
function Move-UntrackedDocs {
  $dest = $DocsBackupDir
  if (Test-Path -LiteralPath $dest) { $dest = "$DocsBackupDir-$(Get-Date -Format yyyyMMdd-HHmmss)" }
  $moved = 0
  foreach ($d in $UntrackedDocs) {
    $src = Join-Path $RepoDir $d
    if (-not (Test-Path -LiteralPath $src)) { continue }
    git ls-files --error-unmatch -- $d 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) { continue }   # tracked: the patch changes it like any file
    $target = Join-Path $dest $d
    try {
      New-Item -ItemType Directory -Force -Path (Split-Path $target -Parent) -ErrorAction Stop | Out-Null
      Move-Item -LiteralPath $src -Destination $target -ErrorAction Stop
    } catch {
      Restore-UntrackedDocs $dest
      Stop-Here "Couldn't move $d aside (is it open in an editor?): $($_.Exception.Message). Nothing was changed."
    }
    $moved++
  }
  if ($moved -gt 0) { Write-Host "  moved $moved doc copies to $dest (the docs commit replaces them)" -ForegroundColor Green }
  return $dest
}

function Restore-UntrackedDocs([string]$from) {
  foreach ($d in $UntrackedDocs) {
    $src = Join-Path $from $d
    $target = Join-Path $RepoDir $d
    if ((Test-Path -LiteralPath $src) -and -not (Test-Path -LiteralPath $target)) {
      New-Item -ItemType Directory -Force -Path (Split-Path $target -Parent) | Out-Null
      Move-Item -LiteralPath $src -Destination $target
    }
  }
}

# Tracked files that differ from the last commit (the release would not
# contain them). Decided by git's exit code, not by reading its output.
function Test-TreeMatchesHead([string]$what) {
  git diff --quiet HEAD --
  if ($LASTEXITCODE -ne 0) {
    Say "Tracked files that differ from the last commit:" "Yellow"
    git status --short --untracked-files=no | ForEach-Object { Write-Host "  $_" -ForegroundColor Yellow }
    Stop-Here "Uncommitted changes to tracked files (listed above). $what"
  }
  Write-Host "  working tree matches the last commit" -ForegroundColor Green
}

# ---------------------------------------------------------------------------
# Stages
# ---------------------------------------------------------------------------

function Do-Preflight {
    Say "Branch and last commit"
    git log --oneline -3
    if (Test-BranchExists $ReleaseBranch) {
      Say "$ReleaseBranch already exists - the commit stage has run. Next: -Stage check (or golive once check has passed)." "Yellow"
      Stop-Transcript | Out-Null
      exit 0
    }
    $cur = Current-Branch; $curHead = Head-Sha
    if ($cur -ne "master" -or $curHead -ne $BaseSha) {
      Stop-Here "Expected master at $($BaseSha.Substring(0,8)) (the Sep 10 go-live), found $cur at $($curHead.Substring(0,8)). Nothing was changed."
    }
    Say "master vs GitHub"
    git fetch origin
    $om = (git rev-parse origin/master).Trim()
    if ($om -ne $BaseSha) { Write-Host "  GitHub's master is at $($om.Substring(0,8)), not $($BaseSha.Substring(0,8)) - the push stage will stop on that; tell me." -ForegroundColor Yellow }
    else { Write-Host "  GitHub's master matches" -ForegroundColor Green }
    Say "The patches"
    Test-Patches
    Say "Nothing staged, and no uncommitted changes"
    Test-NothingStaged
    Test-TouchedClean
    Test-TreeMatchesHead $SetAsideHint
    Say "Typecheck on master (the baseline) - about a minute"
    $masterErrs = Measure-Tsc
    Set-Content -LiteralPath $BaselineFile -Value $masterErrs -Encoding UTF8
    Write-Host "  master: $($masterErrs.Count) typecheck errors (recorded as the baseline)" -ForegroundColor Green
    Say "Firebase login"
    & $NpxExe firebase login:list
    Say "Preflight done - nothing in the project was changed." "Green"
}

function Do-Commit {
    if (Test-BranchExists $ReleaseBranch) {
      Stop-Here "$ReleaseBranch already exists - the commit stage ran before. To start again: git checkout master; git branch -D $ReleaseBranch"
    }
    $cur = Current-Branch; $curHead = Head-Sha
    if ($cur -ne "master" -or $curHead -ne $BaseSha) {
      Stop-Here "Expected master at $($BaseSha.Substring(0,8)), found $cur at $($curHead.Substring(0,8)). Nothing was committed."
    }
    if (-not (Test-Path $BaselineFile)) { Stop-Here "Run the preflight stage first (it records the typecheck baseline)." }
    Test-Patches
    Test-NothingStaged
    Test-TouchedClean
    Test-TreeMatchesHead $SetAsideHint

    $docsAt = Move-UntrackedDocs
    & git checkout -q -b $ReleaseBranch
    if ($LASTEXITCODE -ne 0) {
      Restore-UntrackedDocs $docsAt
      Stop-Here "Couldn't create the $ReleaseBranch branch (see above). The doc copies are back in place. Nothing was committed."
    }

    # Each patch goes into the index only (git apply --cached): it is applied
    # to exactly what git has stored, so Windows line endings in the working
    # folder can't get in the way. The files themselves are refreshed at the end.
    foreach ($p in $Phases) {
      $path = Join-Path $ShipDir $p.File
      & git apply --cached --whitespace=nowarn $path
      $applied = ($LASTEXITCODE -eq 0)
      if ($applied) {
        & git commit -q -m $p.Message -m $Trailer
        $committed = ($LASTEXITCODE -eq 0)
      } else {
        $committed = $false
      }
      if (-not $committed) {
        # Nothing in the working folder was touched: put the index back, go
        # back to master, and bring the doc copies home.
        & git reset -q --mixed $BaseSha
        $undone = ($LASTEXITCODE -eq 0)
        if ($undone) { & git checkout -q master; $undone = ($LASTEXITCODE -eq 0) }
        if ($undone) { & git branch -D -q $ReleaseBranch; $undone = ($LASTEXITCODE -eq 0) }
        Restore-UntrackedDocs $docsAt
        if ($applied) { $reason = "git commit failed for $($p.File)." }
        else { $reason = "$($p.File) did not apply - master has moved since the patches were made." }
        if (-not $undone) { Stop-Here "$reason The automatic undo didn't finish either (see above) - tell me before going on." }
        Stop-Here "$reason Back on master; nothing was committed."
      }
      Write-Host ("  committed: " + $p.Message) -ForegroundColor Green
    }

    # Now the working folder: write every file the release touched, fresh
    # from the last commit (with this PC's line endings).
    $changed = @(git diff --name-only $BaseSha HEAD)
    & git checkout HEAD -- @changed
    if ($LASTEXITCODE -ne 0) { Stop-Here "Couldn't write the release's files into the folder (git checkout failed). The commits are made; tell me before going on." }
    Test-TreeMatchesHead "Tell me before going on."

    Say "Commits on $ReleaseBranch"
    git log --oneline "$BaseSha..$ReleaseBranch"
    Say "Commit stage done." "Green"
}

function Do-Check {
    Require-OnRelease "Nothing has been deployed."
    # The branch must hold every release commit (an interrupted commit stage
    # can leave it pointing at master).
    if ([int](git rev-list --count "$BaseSha..HEAD") -lt $Phases.Count) {
      Stop-Here "$ReleaseBranch doesn't hold the $($Phases.Count) release commits (the commit stage didn't finish). Tell me before going on. Nothing has been deployed."
    }
    if (-not (Test-Path $BaselineFile)) { Stop-Here "No typecheck baseline - run the preflight stage on master first." }
    Say "The folder matches the commit being checked"
    Test-TreeMatchesHead "Nothing has been deployed."
    # The cloud checks ran in UTC; match them so a timezone-sensitive test
    # means the same thing here.
    $env:TZ = "UTC"

    Say "Typecheck - about a minute"
    $baseErrs = @(Get-Content -LiteralPath $BaselineFile | Where-Object { $_ -match 'error TS\d+' })
    $nowErrs = Measure-Tsc
    Write-Host "  $($nowErrs.Count) typecheck errors (master had $($baseErrs.Count))"
    # Which ones look new: compared without line numbers, since this release
    # moves lines around in files that already had errors.
    $pool = @{}
    foreach ($l in $baseErrs) { $k = ($l -replace '\(\d+,\d+\)', '').Trim(); $pool[$k] = 1 + [int]$pool[$k] }
    $newErrs = @(foreach ($l in $nowErrs) { $k = ($l -replace '\(\d+,\d+\)', '').Trim(); if ([int]$pool[$k] -gt 0) { $pool[$k] = [int]$pool[$k] - 1 } else { $l } })
    if ($newErrs.Count -gt 0) {
      Say "Typecheck errors that aren't on master:" "Yellow"
      $newErrs | ForEach-Object { Write-Host "  $_" -ForegroundColor Yellow }
    }
    if ($nowErrs.Count -gt $baseErrs.Count) {
      Stop-Here "The typecheck found $($nowErrs.Count - $baseErrs.Count) more error(s) than master. Send me ship-renewals.log. Nothing has been deployed."
    }
    if ($newErrs.Count -gt 0) { Write-Host "  The count didn't go up, so carrying on - but send me ship-renewals.log afterwards." -ForegroundColor Yellow }

    if ($SkipTests) {
      Say "Tests SKIPPED (-SkipTests)" "Yellow"
    } else {
      Say "Tests"
      & $NpxExe vitest run src
      if ($LASTEXITCODE -ne 0) { Stop-Here "Tests failed - nothing has been deployed." }
    }

    Say "Production build of the front end"
    & $NpxExe vite build
    if ($LASTEXITCODE -ne 0) { Stop-Here "The build failed - nothing has been deployed." }

    Say "The Render cron bundles (including the new nightly renewals job)"
    & $NpmExe run build:backend
    if ($LASTEXITCODE -ne 0) { Stop-Here "The cron bundles failed to build - nothing has been deployed." }
    if (-not (Test-Path "dist\cron-renewals.cjs")) { Stop-Here "dist\cron-renewals.cjs was not built - nothing has been deployed." }

    Set-Content -Path $CheckedFile -Value (Head-Sha)
    Say "Check stage done." "Green"
}

function Do-Rules {
    Require-OnRelease "Nothing has been deployed."
    Require-Checked

    Say "Rules tests (needs JDK 21; 'port taken' means an old emulator still holds 8080)"
    & $NpmExe run test:rules 2>&1 | ForEach-Object { "$_" } | Tee-Object -Variable rulesOut | Out-Host
    $rulesExit = $LASTEXITCODE
    if ($rulesExit -ne 0) {
      # Vitest colors its output even when piped on Windows: strip the codes
      # before reading it.
      $esc = [string][char]27
      $lines = @(@($rulesOut) | ForEach-Object { $_ -replace "$esc\[[0-9;]*m", '' })
      $failed = 0
      foreach ($l in $lines) { if ($l -match '^\s*Tests\s+(\d+)\s+failed') { $failed = [int]$Matches[1] } }
      $cross = [string][char]0x00D7   # the mark vitest puts on a failed test
      $knownFailed = @($lines | Where-Object { ($_ -match 'FAIL' -or $_.Contains($cross)) -and $_.Contains($KnownRulesFailure) }).Count -gt 0
      if ($failed -eq 1 -and $knownFailed) {
        Write-Host "  only the known '$KnownRulesFailure' test failed (unrelated, failing for weeks) - carrying on" -ForegroundColor Yellow
      } else {
        Stop-Here "The rules tests failed ($failed failed) - nothing has been deployed."
      }
    }

    Say "Deploying the Firestore indexes to production (project '$FirebaseProject')"
    Write-Host "  If it asks whether to DELETE indexes that aren't in the file, answer N." -ForegroundColor Yellow
    & $NpxExe firebase deploy --only firestore:indexes --project $FirebaseProject
    if ($LASTEXITCODE -ne 0) { Stop-Here "The index deploy failed - the rules were NOT deployed and nothing has been pushed." }

    Say "Deploying firestore.rules to production"
    & $NpxExe firebase deploy --only firestore:rules --project $FirebaseProject
    if ($LASTEXITCODE -ne 0) { Stop-Here "The rules deploy failed - nothing has been pushed." }

    Say "Checking the rules that are actually live"
    $live = @(& $NpxExe tsx scripts/fetch-live-rules.ts --project $LiveProjectId --database $LiveDatabase --expect inbodyScanValid 2>&1 | ForEach-Object { "$_" })
    $live | ForEach-Object { Write-Host "  $_" }
    $liveText = $live -join "`n"
    if ($liveText -cmatch 'Contains /inbodyScanValid/ \? NO') {
      Stop-Here "The deploy said it worked, but the live rules don't contain this round's rules. Nothing has been pushed - send me ship-renewals.log."
    }
    if ($liveText -cnotmatch 'Contains /inbodyScanValid/ \? YES') {
      Write-Host "  Couldn't read the live rules to double-check (see above). The deploy itself reported success." -ForegroundColor Yellow
    }
    Set-Content -Path $RulesFile -Value (Head-Sha)
    Say "Rules stage done. The indexes may take a few minutes to finish building." "Green"
}

function Do-Push {
    $cur = Current-Branch
    if ($cur -eq "master" -and (Test-BranchExists $ReleaseBranch)) {
      # A push that failed after the merge: master already holds the release.
      git merge-base --is-ancestor $ReleaseBranch master
      $merged = ($LASTEXITCODE -eq 0)
      $checked = Checked-Sha
      if ($merged -and $checked) {
        git merge-base --is-ancestor $checked master
        if ($LASTEXITCODE -eq 0) {
          Require-RulesDeployed $checked
          Say "master already holds the release - pushing again"
          Git-OrStop push origin $ReleaseBranch
          Git-OrStop push origin master
          git log --oneline -1
          Say "Pushed. Render builds and deploys master now (a few minutes). Then: RENEWALS-ROUND.md section 4." "Green"
          return
        }
      }
    }
    Require-OnRelease "Nothing was pushed."
    Require-Checked
    Require-RulesDeployed (Head-Sha)
    Test-TreeMatchesHead "Nothing was pushed."

    Git-OrStop fetch origin
    $om = (git rev-parse origin/master).Trim()
    $lm = (git rev-parse master).Trim()
    if ($om -ne $lm) { Stop-Here "GitHub's master ($($om.Substring(0,8))) is not your master ($($lm.Substring(0,8))). Someone else pushed - that needs a look first. Nothing was pushed." }
    git merge-base --is-ancestor master $ReleaseBranch
    if ($LASTEXITCODE -ne 0) { Stop-Here "$ReleaseBranch does not contain master. Nothing was pushed." }

    Git-OrStop checkout -q master
    Git-OrStop merge --no-ff $ReleaseBranch -m "Renewals round: the Operations Dashboard, renewals, InBody and outcomes" -m $Trailer
    Say "Pushing the branch (a backup on GitHub; Render ignores it)"
    Git-OrStop push origin $ReleaseBranch
    Say "Pushing master - this is the deploy"
    Git-OrStop push origin master
    git log --oneline -1
    Say "Pushed. Render builds and deploys master now (a few minutes). Then: RENEWALS-ROUND.md section 4 (reload the iPads, sync the Render blueprint)." "Green"
}

switch ($Stage) {
  "preflight" { Do-Preflight }
  "commit"    { Do-Commit }
  "check"     { Do-Check }
  "rules"     { Do-Rules }
  "push"      { Do-Push }
  "prepare"   {
    if (Test-BranchExists $ReleaseBranch) {
      Say "$ReleaseBranch already exists (the commit stage ran before) - going straight to the check stage." "Yellow"
    } else {
      Do-Preflight
      Do-Commit
    }
    Do-Check
    Say "PREPARED. Nothing is live yet. Next: -Stage golive" "Green"
  }
  "golive"    {
    $onBranch = Current-Branch
    if ($onBranch -eq "master") {
      # Only after a push that failed: Do-Push pushes again, or says why not.
    } elseif ($onBranch -eq $ReleaseBranch -and (Read-Marker $RulesFile) -eq (Head-Sha)) {
      Say "This release's rules are already live (an earlier run deployed them) - going straight to the push." "Yellow"
    } else {
      Do-Rules
    }
    Do-Push
    Say "LIVE. Render is deploying master." "Green"
  }
}

Stop-Transcript | Out-Null
