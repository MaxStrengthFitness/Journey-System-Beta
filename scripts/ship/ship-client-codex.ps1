<#
 ship-client-codex.ps1  -  the client codex (Notes & Profile as seven pages) to master
 SCRIPT-VERSION: v2  (Sep 24 2026)

   powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-client-codex.ps1 prepare
   powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-client-codex.ps1 golive

 WHAT IS ON THE BRANCH
   client-codex carries one commit per phase, "Codex 1" to "Codex 19"
   (docs/rounds/2026-09-24-client-codex.md is the round): the FORD read fix,
   the InBody normal variation, the record tab as seven pages (Overview -
   Notes - FORD - Body & Pulse - Goals & Focus - Story - Account) with one
   Save bar and one load, In one line and Follow up next time, Over time,
   the Mindbody intake-notes matcher, and the cleanup.

 WHAT CHANGES IN FIRESTORE
   Nothing in firestore.rules and nothing in firestore.indexes.json. The
   branch adds rules TESTS only (the FORD read matrix, In one line, Follow up
   next time, the studio InBody variation), so there is no rules deploy and
   no index deploy: go-live is the tests, then the push. prepare checks that
   the two files are unchanged against master and STOPS if they are not.
   New data, written by the new app within today's rules: the FORD document
   clients/{id}/ford/one-line, followUp / followUpAt / followUpBy on a FORD
   detail, and studios/{id}.inbodyVariation. The app running today ignores
   all three, so the order of the push does not matter to it.

 BEFORE prepare: THE BRANCH MUST CONTAIN MASTER
   On Sep 24 master moved past the branch's base (50b56ba): phase 1 went to
   master on its own, and so did a progress-report fix. golive only
   fast-forwards, so prepare stops until master has been merged into
   client-codex (Claude does that as its own commit, "Merge master into
   client-codex", and says which conflicts it resolved).

 prepare  reads only; writes logs\ and dist\. In order: the branch, a clean
          tree, the fetch, master is in the branch (a fast-forward), what
          goes live, the rules and indexes unchanged, the case check, the
          typecheck COUNT, the suite in Eastern time, the rules tests (THE
          run that counts; port 8080 checked first, and an emulator this run
          leaves behind is stopped), the production build. Stops at the
          first failure and says which. Ends PREPARE PASSED, and writes
          logs\ship-client-codex.prepared: the commit it tested and master
          as it was.

 golive   refuses unless that file still names the branch's commit and
          master as they are now: a commit made after prepare (a merge, a
          fix) has not been tested, typechecked or built, so prepare runs
          again first.

          Then it asks for GO. Tags master as it is now (the restore point;
          a tag left from an earlier try is used only if it is still master)
          and pushes the tag, then pushes client-codex to master. RENDER
          DEPLOYS THE APP. Master is never checked out.

 TO UNDO THE APP: master goes back to the restore tag
   restore/2026-09-24-before-client-codex (ask Claude; it is a force push of
   the tag to master). Nothing in Firestore needs undoing: the app before
   this round ignores the new fields.

 ASCII only on purpose (Windows PowerShell 5.1 reads a script as ANSI).
#>

param([Parameter(Mandatory = $true, Position = 0)][ValidateSet('prepare', 'golive')][string]$Stage)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $Root
$LogFile = Join-Path $Root 'logs\ship-client-codex.log'
# What prepare tested: "<branch sha> <origin/master sha>". golive reads it.
$PreparedFile = Join-Path $Root 'logs\ship-client-codex.prepared'
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $LogFile) | Out-Null
$Branch = 'client-codex'
$RestoreTag = 'restore/2026-09-24-before-client-codex'
# 4 on client-codex since phase 8 (deleting ClientInfoSheet.tsx took six of
# master's ten pre-existing errors with it): AppContent.tsx x2,
# clinical-review/charts.tsx, EditTrainerModal.tsx. More than 4 is new.
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

Log "ship-client-codex $Stage" 'White'

# ---- where are we -------------------------------------------------------------
if (-not (Test-Path 'service-account.json')) { Stop-Here 'run this from the project folder (the one with service-account.json).' }
$head = (Get-Content '.git\HEAD' -Raw).Trim()
if ($head -ne "ref: refs/heads/$Branch") { Stop-Here "the project folder is on '$head', not $Branch. Ask Claude; do not switch branches by hand." }
$dirty = (& git --no-optional-locks status --porcelain --untracked-files=no -- src docs server scripts tests functions firestore.rules firestore.indexes.json package.json package-lock.json CLAUDE.md) | Where-Object { $_ }
if ($dirty) {
  Log 'Uncommitted changes:' 'Red'
  $dirty | ForEach-Object { Log "   $_" 'Red' }
  Stop-Here 'the branch has uncommitted changes. Everything that ships must be committed first.'
}
# A new source file nobody committed would pass the suite and the build here
# and then be missing from what goes live.
$untracked = (& git --no-optional-locks status --porcelain -- src tests) | Where-Object { "$_" -like '`?`? *' }
if ($untracked) {
  Log 'Files under src or tests that git does not track:' 'Red'
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
$ahead = (& git --no-optional-locks rev-list --count "origin/master..$Branch").Trim()
if ([int]$ahead -eq 0) { Log 'master already has everything on the branch. Nothing to ship.' 'Green'; exit 0 }
Log "$ahead commit(s) will go live:" 'Green'
& git --no-optional-locks log --oneline "origin/master..$Branch" | ForEach-Object { Log "   $_" }
$BranchSha = (& git --no-optional-locks rev-parse $Branch).Trim()
$MasterSha = (& git --no-optional-locks rev-parse origin/master).Trim()

if ($Stage -eq 'prepare') {
  # A pass from an earlier run no longer counts once prepare starts again.
  if (Test-Path $PreparedFile) { Remove-Item -Force $PreparedFile }

  # ---- no rules or index change: this script deploys neither -------------------
  & git --no-optional-locks diff --quiet origin/master $Branch -- firestore.rules firestore.indexes.json
  if ($LASTEXITCODE -ne 0) {
    & git --no-optional-locks diff --stat origin/master $Branch -- firestore.rules firestore.indexes.json | ForEach-Object { Log "   $_" 'Red' }
    Stop-Here 'the branch changes firestore.rules or firestore.indexes.json, which this script does not deploy. Ask Claude.'
  }
  Log 'firestore.rules and firestore.indexes.json: unchanged. No rules or index deploy.' 'Green'

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
  Log 'PREPARE PASSED. Next: powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-client-codex.ps1 golive' 'Green'
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
Log "golive: the restore point, then $Branch to master. No rules or index deploy (nothing changed)." 'White'
Write-Host ''
Write-Host "Pushing $Branch to master deploys the app on Render." -ForegroundColor Yellow
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
Log 'Watch the deploy finish on Render, reload every iPad, then walk Round 14 of docs/ops/TESTING-CHECKLIST.md signed in as a Life Transformer (not an administrator).' 'Green'
exit 0
