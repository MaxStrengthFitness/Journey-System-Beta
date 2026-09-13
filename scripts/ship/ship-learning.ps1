<#
  ship-learning.ps1 - the Learning + Planner round, one stage at a time.
  Modeled on ship-renewals.ps1.

  Run from PowerShell, in the repo folder. Two lines do the whole thing:

    powershell -ExecutionPolicy Bypass -File .\ship-learning.ps1 -Stage prepare
    powershell -ExecutionPolicy Bypass -File .\ship-learning.ps1 -Stage golive

  prepare  = preflight + commit + check   (only changes your PC's git history)
  golive   = rules + push                  (production: indexes, rules, then Render)

  Or one stage at a time: -Stage preflight | commit | check | rules | push

  preflight  looks: master holds the Renewals release, the patches are the
             ones that were checked and apply to master (tried on a scratch
             copy), nothing is in the way; measures the typecheck on master
  commit     one commit per patch in backups\learning-ship, on a new branch,
             learning-planner
  check      typecheck (no new errors), tests, a production build, the cron
             bundles - and remembers the exact commit that passed
  rules      deploys the indexes (so they build meanwhile), runs the rules
             tests, then deploys the rules to production
  push       merges into master and pushes - Render deploys master, so THIS
             is the go-live

  Every stage stops at the first problem and says why. Everything is also
  written to ship-learning.log (git ignores *.log). See LEARNING-PLANNER-ROUND.md.

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
Start-Transcript -Path (Join-Path $RepoDir "ship-learning.log") -Append | Out-Null

# This round is built on the Renewals round: master must already hold it.
$PrereqBranch = "operations-renewals"
$ReleaseBranch = "learning-planner"
$ShipDir = Join-Path $RepoDir "backups\learning-ship"
$DocsBackupDir = Join-Path $RepoDir "backups\learning-docs-before"
$Trailer = "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`nClaude-Session: https://claude.ai/code/session_01M9zXifeqzj49MTdAuBxZ3B"
$FirebaseProject = "prod"
$LiveProjectId = "gen-lang-client-0731527386"
$LiveDatabase = "ai-studio-32cbbdcc-6e08-4770-9665-867c68878efa"
# A function only this round's rules have: the post-deploy check looks for it.
$LiveRulesMarker = "canPostAnnouncements"
# The one rules test that has failed for weeks for reasons unrelated to this
# round (RUN-THIS-MORNING.md). Any other failure stops the release.
$KnownRulesFailure = "non-empty pinHash"
# What to do about uncommitted changes that aren't part of this release.
$SetAsideHint = "Set them aside first: git stash push -m before-learning   (after the release, git stash pop brings them back). Nothing was changed."

# The patches, in order, one commit each. The fingerprint is checked before
# any patch is used, so a half-copied file can never become a commit.
$Phases = @(
  @{ File = "00.patch"; Sha256 = "c6e235967f2560ee4a29393cc9b2c9c6ead351e79b32f5de73c6b9285fffd281"; Message = "Learning 0: one link format for any Learning page; the bell opens the flagged machine; moved Academy pages say so" }
  @{ File = "01.patch"; Sha256 = "6302520a89d82317772007a1a4768434b018d78d74437328ce98c9e8fc0c8811"; Message = "Learning 1: the Learning masthead, an Overview front page with every machine by category, one search across machines, the Academy and studio pages, and Academy codes in the catalog" }
  @{ File = "02.patch"; Sha256 = "655a710db4384c551774a39244013a13657da9a24ff36e4e9d65b9d0199c8dc4"; Message = "Learning 2: the To-Do screen becomes the Planner - a masthead with Studio (the hub, unchanged) and My tasks (a trainer's own list, which had no screen)" }
  @{ File = "03.patch"; Sha256 = "7440b5b03c5a19ef525c2899341e85afb44af650af9df5d4140c093d7e2a1d32"; Message = "Learning 3: Planner Notes - folders and notes private to their author, linked to clients and marked as a plan, routine change, retention idea or injury plan; Share copies a one-client note onto that client's record, shown in the profile under Goals as Plans from the team" }
  @{ File = "04.patch"; Sha256 = "0d1361f3b9d32b00d71610c246d388e62228eaf3ab9b14539de732305d94534b"; Message = "Learning 4: the MSF machine database - the Catalog gains All MSF machines beside the studio's own floor; studios share their own machines, notes and tips with a switch, adopt machines onto their floor, and read what other studios shared on every machine page; machine content writes now need to work at the studio; a new wiki page starts at its top" }
  @{ File = "05.patch"; Sha256 = "e1602b24814a7df11e064f45e3bb7959f7e32a94cafa8403dd2b708bf77281bc"; Message = "Learning 5: comments on Learning pages - each studio's own thread at the foot of machine, studio and Academy pages; type @ to tag someone at the studio, who hears about it in their bell; the author edits, the author or a leader deletes" }
  @{ File = "06.patch"; Sha256 = "0308471a697c1a418cc3f542818ac8ba50434e570fce3995b423df5f094e6629"; Message = "Learning 6: announcements link to any Learning page - the composer searches what the Learning search finds and the bell opens the page; a machine not on the floor opens in All MSF machines; announcement posting limited to the people the app offers the composer to, and everyone else may only mark a notice read for themselves" }
  @{ File = "07.patch"; Sha256 = "2457ade91cf2d0af4d9531920b025c6ec2a320f658a2898fa786f5a561c37680"; Message = "Learning 7: fixes from the independent review - a studio's own machine opened from the bell or search waits for the floor instead of bouncing to All MSF machines; links from another studio say where they happened; tags match whole names only, fold accents and close once finished; a comment draft stays on its page; a switched-off machine comes back on instead of being copied twice; shared items are credited by their path and the studio's own name; unshared tips and notes stay with their studio; announcements are posted as their author and only the Operations tab reaches every studio; loading and failed reads no longer read as empty; notes wait for the saved version before saving a restored draft" }
  @{ File = "08.patch"; Sha256 = "65cfa54fd1197494198877f3ca0b6449d7f433bcbcdbc2a9323fdeb1fd5746be"; Message = "Learning docs: the round document, CLAUDE.md, the feature READMEs, the roadmap and the testing checklist" }
)

# A copy of this may be in the folder before it is in git (delivered for
# reading). The docs commit adds it, so the copy is moved aside first and the
# committed version takes its place.
$UntrackedDocs = @(
  "LEARNING-PLANNER-ROUND.md"
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
$CheckedFile = Join-Path $RepoDir ".git\ship-learning-checked"
$RulesFile = Join-Path $RepoDir ".git\ship-learning-rules-deployed"
$BaselineFile = Join-Path $RepoDir ".git\ship-learning-tsc-baseline.txt"
# The master commit the release branch was made from.
$BaseFile = Join-Path $RepoDir ".git\ship-learning-base"
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
    # A binary change can't be applied from a text patch (a stray control
    # character once made git treat a source file as binary).
    if (Select-String -LiteralPath $path -Pattern '^(Binary files |GIT binary patch)' -Quiet) {
      Stop-Here "$($p.File) contains a binary change, which can't be applied from a patch. Nothing was changed - tell me."
    }
  }
  Write-Host "  all $($Phases.Count) patches present and unchanged" -ForegroundColor Green
}

# Every patch applied in order to a scratch copy of $onto - a private index
# file, so neither the real index nor the working folder is touched.
function Test-PatchesApply([string]$onto) {
  $scratch = Join-Path $RepoDir ".git\ship-learning-dryrun.index"
  Remove-Item -LiteralPath $scratch -ErrorAction SilentlyContinue
  $failedAt = ""
  $env:GIT_INDEX_FILE = $scratch
  try {
    & git read-tree $onto
    if ($LASTEXITCODE -ne 0) {
      $failedAt = "reading $onto"
    } else {
      foreach ($p in $Phases) {
        & git apply --cached --whitespace=nowarn (Join-Path $ShipDir $p.File)
        if ($LASTEXITCODE -ne 0) { $failedAt = $p.File; break }
      }
    }
  } finally {
    Remove-Item Env:GIT_INDEX_FILE -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $scratch -ErrorAction SilentlyContinue
  }
  if ($failedAt) { Stop-Here "The patches don't apply to master (stopped at $failedAt) - master has changed since they were made. Nothing was changed; send me ship-learning.log." }
  Write-Host "  all $($Phases.Count) patches apply to master (tried on a scratch copy)" -ForegroundColor Green
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
# by checking those files out fresh. The untracked copy of the round document
# is expected (it is moved aside); any other untracked file in the way stops.
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

# master must hold the Renewals release, which this round is built on.
function Test-PrereqOnMaster {
  if (-not (Test-BranchExists $PrereqBranch)) {
    Stop-Here "There's no $PrereqBranch branch on this PC. This round is built on the Renewals round: ship it first (ship-renewals.ps1 -Stage prepare, then -Stage golive). Nothing was changed."
  }
  git merge-base --is-ancestor $PrereqBranch master
  if ($LASTEXITCODE -ne 0) {
    Stop-Here "master doesn't hold the Renewals release yet. Finish it first: powershell -ExecutionPolicy Bypass -File .\ship-renewals.ps1 -Stage golive   Nothing was changed."
  }
  Write-Host "  master holds the Renewals release ($PrereqBranch)" -ForegroundColor Green
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
    $cur = Current-Branch
    if ($cur -ne "master") { Stop-Here "Expected to be on master, found $cur. Switch first: git checkout master   Nothing was changed." }
    Say "The Renewals round is in master"
    Test-PrereqOnMaster
    Say "master vs GitHub"
    git fetch origin
    $om = (git rev-parse origin/master).Trim()
    $lm = Head-Sha
    if ($om -ne $lm) { Write-Host "  GitHub's master is at $($om.Substring(0,8)), yours at $($lm.Substring(0,8)) - the push stage will stop on that; tell me." -ForegroundColor Yellow }
    else { Write-Host "  GitHub's master matches" -ForegroundColor Green }
    Say "The patches"
    Test-Patches
    Test-PatchesApply "master"
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
    $cur = Current-Branch
    if ($cur -ne "master") { Stop-Here "Expected to be on master, found $cur. Nothing was committed." }
    if (-not (Test-Path $BaselineFile)) { Stop-Here "Run the preflight stage first (it records the typecheck baseline)." }
    Test-PrereqOnMaster
    Test-Patches
    Test-PatchesApply "master"
    Test-NothingStaged
    Test-TouchedClean
    Test-TreeMatchesHead $SetAsideHint

    $startSha = Head-Sha
    Set-Content -Path $BaseFile -Value $startSha
    $docsAt = Move-UntrackedDocs
    & git checkout -q -b $ReleaseBranch
    if ($LASTEXITCODE -ne 0) {
      Restore-UntrackedDocs $docsAt
      Stop-Here "Couldn't create the $ReleaseBranch branch (see above). The doc copy is back in place. Nothing was committed."
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
        # back to master, and bring the doc copy home.
        & git reset -q --mixed $startSha
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
    $changed = @(git diff --name-only $startSha HEAD)
    & git checkout HEAD -- @changed
    if ($LASTEXITCODE -ne 0) { Stop-Here "Couldn't write the release's files into the folder (git checkout failed). The commits are made; tell me before going on." }
    Test-TreeMatchesHead "Tell me before going on."

    Say "Commits on $ReleaseBranch"
    git log --oneline "$startSha..$ReleaseBranch"
    Say "Commit stage done." "Green"
}

function Do-Check {
    Require-OnRelease "Nothing has been deployed."
    # The branch must hold every release commit (an interrupted commit stage
    # can leave it pointing at master).
    $base = Read-Marker $BaseFile
    if (-not $base) { Stop-Here "No record of where $ReleaseBranch started - run the commit stage again (git checkout master; git branch -D $ReleaseBranch first). Nothing has been deployed." }
    if ([int](git rev-list --count "$base..HEAD") -lt $Phases.Count) {
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
      Stop-Here "The typecheck found $($nowErrs.Count - $baseErrs.Count) more error(s) than master. Send me ship-learning.log. Nothing has been deployed."
    }
    if ($newErrs.Count -gt 0) { Write-Host "  The count didn't go up, so carrying on - but send me ship-learning.log afterwards." -ForegroundColor Yellow }

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

    Say "The Render cron bundles (unchanged by this round - built to be sure)"
    & $NpmExe run build:backend
    if ($LASTEXITCODE -ne 0) { Stop-Here "The cron bundles failed to build - nothing has been deployed." }

    Set-Content -Path $CheckedFile -Value (Head-Sha)
    Say "Check stage done." "Green"
}

function Do-Rules {
    Require-OnRelease "Nothing has been deployed."
    Require-Checked

    # Indexes first: the shared lists and comments need new ones, and they
    # take minutes to build. On their own they change nothing.
    Say "Deploying the Firestore indexes to production (project '$FirebaseProject')"
    Write-Host "  If it asks whether to DELETE indexes that aren't in the file, answer N." -ForegroundColor Yellow
    & $NpxExe firebase deploy --only firestore:indexes --project $FirebaseProject
    if ($LASTEXITCODE -ne 0) { Stop-Here "The index deploy failed - the rules were NOT deployed and nothing has been pushed." }

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
        Stop-Here "The rules tests failed ($failed failed) - the rules were NOT deployed and nothing has been pushed. (The new indexes are live; on their own they change nothing.)"
      }
    }

    Say "Deploying firestore.rules to production"
    & $NpxExe firebase deploy --only firestore:rules --project $FirebaseProject
    if ($LASTEXITCODE -ne 0) { Stop-Here "The rules deploy failed - nothing has been pushed." }

    Say "Checking the rules that are actually live"
    $live = @(& $NpxExe tsx scripts/fetch-live-rules.ts --project $LiveProjectId --database $LiveDatabase --expect $LiveRulesMarker 2>&1 | ForEach-Object { "$_" })
    $live | ForEach-Object { Write-Host "  $_" }
    $liveText = $live -join "`n"
    if ($liveText -cmatch "Contains /$LiveRulesMarker/ \? NO") {
      Stop-Here "The deploy said it worked, but the live rules don't contain this round's rules. Nothing has been pushed - send me ship-learning.log."
    }
    if ($liveText -cnotmatch "Contains /$LiveRulesMarker/ \? YES") {
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
          Say "Pushed. Render builds and deploys master now (a few minutes). Then: LEARNING-PLANNER-ROUND.md section 4." "Green"
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
    Git-OrStop merge --no-ff $ReleaseBranch -m "Learning + Planner round: the Learning tab, the Planner and its notes, the MSF machine database, comments and announcement links" -m $Trailer
    Say "Pushing the branch (a backup on GitHub; Render ignores it)"
    Git-OrStop push origin $ReleaseBranch
    Say "Pushing master - this is the deploy"
    Git-OrStop push origin master
    git log --oneline -1
    Say "Pushed. Render builds and deploys master now (a few minutes). Then: LEARNING-PLANNER-ROUND.md section 4 (reload the iPads, let the indexes finish)." "Green"
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
