<#
 ship-landing-sep24.ps1  -  the landing (thirteen Sep 24 fixes on the client codex) to master
 SCRIPT-VERSION: v1  (Sep 24 2026)

   powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-landing-sep24.ps1 prepare
   powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-landing-sep24.ps1 golive

 WHAT IS ON THE BRANCH
   landing-sep24 is the client codex plus thirteen fixes, one merge commit
   each (docs/rounds/2026-09-24-landing.md is the round):
     1. the dev preview takes a free port when 3000 is busy (PC only)
     2. the Renewal Brief prints the Pulse overall as a real percentage
     3. the Deep Dive does not colour a part-answered Pulse area
     4. a stored wingspan shows (the guard, re-applied to the codex's form)
     5. studio access requests carry a name; a nameless one no longer
        crashes My Studio -> Team
     6. the chart-reading (Gemini) routes need a staff sign-in
     7. clinical watch-outs reach all twenty machines
     8. an abandoned session is asked about, never silently reopened
     9. signing out starts the next person fresh; Switch Trainer hands over;
        Operations checks who may open it every time
    10. Sessions before Journey gets its door (header and Account page)
    11. long-standing FileMaker clients stop reading as new
    12. leaving a screen with unsaved typing asks first
    13. a booking is done when Journey logged a session that day
   Then the commits that carried each fix onto the codex's pages, and the
   review's fixes.

 SHIP client-codex FIRST, with its own script (ship-client-codex.ps1).
   That is the intended order, and on Sep 24 it was done: master is the
   codex. If this one is shipped first instead, it carries the codex too,
   because it CONTAINS client-codex. Both ways are safe. prepare stops only
   if client-codex has commits this branch does not (it moved after the
   landing was cut), because then shipping this would leave them behind.

 WHAT CHANGES IN FIRESTORE
   Nothing in firestore.rules, firestore.indexes.json or functions\. So
   there is no rules deploy, no index deploy and no Functions deploy:
   go-live is the checks, then the push. prepare checks the three against
   master and STOPS if any changed. New data is written only within today's
   rules, into fields the app already reads (a studio access request's name
   and email; a client's prior history through the door).

 WHAT DEPLOYS WITH THE PUSH (Render: the web service and its cron jobs)
   server.ts and server\gemini-routes.ts (the Gemini routes behind the
   sign-in), server\renewals-job.ts (the nightly attendance watch reads
   "done means logged"), server\cron-weekly-coach-report.ts (a comment; the
   job stays switched off in render.yaml). prepare lists them.

 BEFORE prepare: THE PROJECT FOLDER IS ON landing-sep24
   Claude switches it (the landing worktree is removed first; git will not
   have one branch in two folders). The branch must contain master: golive
   only fast-forwards.

 prepare  reads only; writes logs\ and dist\. In order: the branch, a clean
          tree, the fetch, master is in the branch (a fast-forward), the
          codex is in the branch, what goes live, the rules, indexes and
          Functions unchanged, the server files that deploy, the case check,
          the typecheck COUNT, the suite in Eastern time, the rules tests
          (THE run that counts; port 8080 checked first, and an emulator
          this run leaves behind is stopped), the production build. Stops at
          the first failure and says which. Ends PREPARE PASSED, and writes
          logs\ship-landing-sep24.prepared: the commit it tested and master
          as it was.

 golive   refuses unless that file still names the branch's commit and
          master as they are now: a commit made after prepare (a merge, a
          fix) has not been tested, typechecked or built, so prepare runs
          again first.

          Then it asks for GO. Tags master as it is now (the restore point;
          a tag left from an earlier try is used only if it is still master)
          and pushes the tag, then pushes landing-sep24 to master. RENDER
          DEPLOYS THE APP. Master is never checked out.

 TO UNDO THE APP: master goes back to the restore tag
   restore/2026-09-24-before-landing (ask Claude; it is a force push of the
   tag to master). Nothing in Firestore needs undoing.

 ASCII only on purpose (Windows PowerShell 5.1 reads a script as ANSI).
#>

param([Parameter(Mandatory = $true, Position = 0)][ValidateSet('prepare', 'golive')][string]$Stage)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $Root
$LogFile = Join-Path $Root 'logs\ship-landing-sep24.log'
# What prepare tested: "<branch sha> <origin/master sha>". golive reads it.
$PreparedFile = Join-Path $Root 'logs\ship-landing-sep24.prepared'
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $LogFile) | Out-Null
$Branch = 'landing-sep24'
$Codex = 'client-codex'
$RestoreTag = 'restore/2026-09-24-before-landing'
# 4 since the client codex (deleting ClientInfoSheet.tsx took six of master's
# ten pre-existing errors with it): AppContent.tsx x2, clinical-review/
# charts.tsx, EditTrainerModal.tsx. Measured 4 on landing-sep24, Sep 24 2026.
# More than 4 is new.
$TscBaseline = 4
$Started = Get-Date

function Log {
  param([string]$m, [string]$c = 'Gray')
  $l = "[{0}] {1}" -f (Get-Date -Format 'HH:mm:ss'), $m
  Write-Host $l -ForegroundColor $c
  Add-Content -Path $LogFile -Value $l -Encoding utf8
}

function Run {
  param([string]$label, [string]$cmd)
  Log "--- $label ---" 'Cyan'
  Log "> $cmd"
  $out = & cmd /c "$cmd 2>&1"
  $code = $LASTEXITCODE
  $out | ForEach-Object { Add-Content -Path $LogFile -Value $_ -Encoding utf8 }
  $out | Select-Object -Last 18 | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray }
  Log "$label exit code: $code" $(if ($code -eq 0) { 'Green' } else { 'Yellow' })
  return @{ Code = $code; Output = $out }
}

function Stop-Here {
  param([string]$why)
  Log "STOP: $why" 'Red'
  Log "Nothing was pushed. The log is $LogFile" 'Red'
  exit 1
}

function Must {
  param([hashtable]$r, [string]$what)
  if ($r.Code -ne 0) { Stop-Here "$what failed." }
}

# The process listening on the emulator's port, or $null.
function Get-Port8080 {
  $conn = Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $conn) { return $null }
  return Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
}

Log "ship-landing-sep24 $Stage" 'White'

# ---- where are we -------------------------------------------------------------
if (-not (Test-Path 'service-account.json')) { Stop-Here 'run this from the project folder (the one with service-account.json).' }
$head = (Get-Content '.git\HEAD' -Raw).Trim()
if ($head -ne "ref: refs/heads/$Branch") { Stop-Here "the project folder is on '$head', not $Branch. Ask Claude; do not switch branches by hand." }
$dirty = (& git --no-optional-locks status --porcelain --untracked-files=no -- src docs server server.ts scripts tests functions firestore.rules firestore.indexes.json package.json package-lock.json vite.config.ts render.yaml CLAUDE.md) | Where-Object { $_ }
if ($dirty) {
  Log 'Uncommitted changes:' 'Red'
  $dirty | ForEach-Object { Log "   $_" 'Red' }
  Stop-Here 'the branch has uncommitted changes. Everything that ships must be committed first.'
}
# A new source file nobody committed would pass the suite and the build here
# and then be missing from what goes live.
$untracked = (& git --no-optional-locks status --porcelain -- src tests server) | Where-Object { "$_" -like '`?`? *' }
if ($untracked) {
  Log 'Files under src, tests or server that git does not track:' 'Red'
  $untracked | ForEach-Object { Log "   $_" 'Red' }
  Stop-Here 'untracked source files would be tested here but not shipped. Commit or remove them first.'
}

Log 'Fetching from GitHub (reads only)' 'Cyan'
& git fetch -q origin
if ($LASTEXITCODE -ne 0) { Stop-Here 'could not reach GitHub.' }
& git --no-optional-locks merge-base --is-ancestor origin/master $Branch
if ($LASTEXITCODE -ne 0) {
  Log 'master has commits the branch does not:' 'Red'
  & git --no-optional-locks log --oneline "$Branch..origin/master" | ForEach-Object { Log "   $_" 'Red' }
  Stop-Here "master is not in $Branch, so the push would not be a fast-forward. Ask Claude to merge master into $Branch first."
}

# ---- the client codex: already live, or carried by this push -------------------
& git --no-optional-locks rev-parse --verify -q "refs/heads/$Codex" | Out-Null
if ($LASTEXITCODE -eq 0) {
  & git --no-optional-locks merge-base --is-ancestor $Codex $Branch
  if ($LASTEXITCODE -ne 0) {
    Log "$Codex has commits $Branch does not:" 'Red'
    & git --no-optional-locks log --oneline "$Branch..$Codex" | ForEach-Object { Log "   $_" 'Red' }
    Stop-Here "$Codex moved after the landing was cut. Ask Claude to merge it into $Branch first."
  }
  & git --no-optional-locks merge-base --is-ancestor $Codex origin/master
  if ($LASTEXITCODE -eq 0) {
    Log 'The client codex is already on master.' 'Green'
  } else {
    Log "The client codex is NOT on master yet: this push carries it too ($Branch contains it)." 'Yellow'
  }
} else {
  Log "No local $Codex branch to compare; the branch still has to contain master (checked above)." 'Yellow'
}

$ahead = (& git --no-optional-locks rev-list --count "origin/master..$Branch").Trim()
if ([int]$ahead -eq 0) { Log 'master already has everything on the branch. Nothing to ship.' 'Green'; exit 0 }
Log "$ahead commit(s) will go live:" 'Green'
& git --no-optional-locks log --oneline "origin/master..$Branch" | ForEach-Object { Log "   $_" }
$BranchSha = (& git --no-optional-locks rev-parse $Branch).Trim()
$MasterSha = (& git --no-optional-locks rev-parse origin/master).Trim()

if ($Stage -eq 'prepare') {
  # A pass from an earlier run no longer counts once prepare starts again.
  if (Test-Path $PreparedFile) { Remove-Item -Force $PreparedFile }

  # ---- no rules, index or Functions change: this script deploys none of them --
  & git --no-optional-locks diff --quiet origin/master $Branch -- firestore.rules firestore.indexes.json functions
  if ($LASTEXITCODE -ne 0) {
    & git --no-optional-locks diff --stat origin/master $Branch -- firestore.rules firestore.indexes.json functions | ForEach-Object { Log "   $_" 'Red' }
    Stop-Here 'the branch changes firestore.rules, firestore.indexes.json or functions\, which this script does not deploy. Ask Claude.'
  }
  Log 'firestore.rules, firestore.indexes.json and functions\: unchanged. No rules, index or Functions deploy.' 'Green'

  # ---- what deploys with the web service and its cron jobs --------------------
  $serverFiles = @(& git --no-optional-locks diff --name-only origin/master $Branch -- server.ts server render.yaml | Where-Object { $_ })
  if ($serverFiles.Count -gt 0) {
    Log 'Server files that change (they deploy with the Render web service and its cron jobs):' 'Yellow'
    $serverFiles | ForEach-Object { Log "   $_" 'Yellow' }
  } else {
    Log 'No server files change.' 'Green'
  }

  # ---- two files whose names differ only by case are ONE file on Windows ------
  $dups = @(& git --no-optional-locks ls-files | ForEach-Object { $_.ToLowerInvariant() } | Group-Object | Where-Object { $_.Count -gt 1 })
  if ($dups.Count -gt 0) {
    $dups | ForEach-Object { Log "   $($_.Name)" 'Red' }
    Stop-Here 'two tracked files differ only by case.'
  }
  Log 'Case check: no two files differ only by case.' 'Green'

  # ---- typecheck: the COUNT, not zero -----------------------------------------
  $tsc = Run 'typecheck' 'npx tsc --noEmit'
  $errs = @($tsc.Output | Where-Object { "$_" -match 'error TS' }).Count
  Log "tsc errors: $errs (baseline $TscBaseline)" $(if ($errs -le $TscBaseline) { 'Green' } else { 'Red' })
  if ($errs -gt $TscBaseline) { Stop-Here 'more typecheck errors than the baseline.' }

  # ---- the suite, in the studio's time zone (the date trap) -------------------
  # npm test skips the copies of the app under .claude\worktrees.
  $env:TZ = 'America/New_York'
  $vt = Run 'vitest (TZ=America/New_York)' 'npm test'
  Must $vt 'the test suite'

  # ---- the rules tests: this run is the one that counts -----------------------
  $held = Get-Port8080
  if ($held) {
    Log "Port 8080 is held by $($held.ProcessName) (PID $($held.Id)), started $($held.StartTime)." 'Yellow'
    if ($held.ProcessName -ne 'java') { Stop-Here 'something other than an old emulator holds port 8080. Close it and run prepare again.' }
    $answer = Read-Host 'That is almost certainly an emulator an earlier run left behind. Type STOP to stop it (Enter to stop here)'
    if ($answer -ne 'STOP') { Stop-Here 'port 8080 is taken.' }
    Stop-Process -Id $held.Id -Force
    Start-Sleep -Seconds 2
    if (Get-Port8080) { Stop-Here 'port 8080 is still taken.' }
  }
  $rt = Run 'rules tests' 'npm run test:rules'
  # firebase emulators:exec can leave the emulator listening after it exits;
  # stop it only if THIS run started it.
  $left = Get-Port8080
  if ($left -and $left.ProcessName -eq 'java' -and $left.StartTime -gt $Started) {
    Log "Stopping the emulator this run left on port 8080 (PID $($left.Id))." 'Yellow'
    Stop-Process -Id $left.Id -Force -ErrorAction SilentlyContinue
  }
  Must $rt 'test:rules (needs JDK 21)'

  # ---- a production build ------------------------------------------------------
  $bd = Run 'vite build' 'npx vite build'
  Must $bd 'vite build'

  Set-Content -Path $PreparedFile -Value "$BranchSha $MasterSha" -Encoding ascii
  Log "Tested: $Branch at $($BranchSha.Substring(0, 7)), master at $($MasterSha.Substring(0, 7))." 'Green'
  Log 'PREPARE PASSED. Next: powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-landing-sep24.ps1 golive' 'Green'
  exit 0
}

# ---- golive --------------------------------------------------------------------
# Only what prepare tested goes live: the same branch commit, onto the same master.
if (-not (Test-Path $PreparedFile)) { Stop-Here 'prepare has not passed on this PC. Run prepare first.' }
$prepared = ((Get-Content -Path $PreparedFile -Raw).Trim()) -split '\s+'
if ($prepared.Count -ne 2 -or $prepared[0] -ne $BranchSha) {
  Stop-Here "$Branch has changed since prepare passed, so this commit has not been tested. Run prepare again."
}
if ($prepared[1] -ne $MasterSha) {
  Stop-Here 'master has moved since prepare passed. Run prepare again.'
}
Log "prepare passed on this commit ($($BranchSha.Substring(0, 7))) onto this master ($($MasterSha.Substring(0, 7)))." 'Green'
Log "golive: the restore point, then $Branch to master. No rules, index or Functions deploy (nothing changed)." 'White'
Write-Host ''
Write-Host "Pushing $Branch to master deploys the app and its cron jobs on Render." -ForegroundColor Yellow
if ((Read-Host 'Type GO to push') -ne 'GO') { Log 'Nothing pushed.' 'Yellow'; exit 0 }

$tagOnGitHub = & git --no-optional-locks ls-remote --tags origin "refs/tags/$RestoreTag"
if (-not $tagOnGitHub) {
  $local = & git --no-optional-locks tag -l $RestoreTag
  if (-not $local) {
    & git tag $RestoreTag origin/master
    if ($LASTEXITCODE -ne 0) { Stop-Here "could not make the restore tag $RestoreTag." }
  } else {
    # A tag left by an earlier golive that stopped before pushing it: a
    # restore point is master as it is NOW, or it restores the wrong thing.
    $tagSha = (& git --no-optional-locks rev-parse "$RestoreTag^{commit}").Trim()
    if ($tagSha -ne $MasterSha) {
      Stop-Here "the restore tag $RestoreTag on this PC is not master as it is now (it is $($tagSha.Substring(0, 7))). Ask Claude to remove it; nothing was pushed."
    }
  }
  $tp = Run "push the restore tag $RestoreTag" "git push origin refs/tags/$RestoreTag"
  Must $tp 'pushing the restore tag'
}
Log "Restore point on GitHub: $RestoreTag = $((& git --no-optional-locks rev-parse --short "$RestoreTag^{commit}").Trim())" 'Green'

$push = Run "git push origin ${Branch}:master" "git push origin ${Branch}:master"
Must $push 'the push (Render deploys from it)'

Log "GOLIVE COMPLETE. master = $((& git --no-optional-locks rev-parse --short origin/master).Trim())." 'Green'
Log 'Watch the deploy finish on Render, reload every iPad, then walk Rounds 14, 15 and 16 of docs/ops/TESTING-CHECKLIST.md signed in as a Life Transformer (not an administrator).' 'Green'
exit 0
