<#
 SCRIPT-VERSION: v1  (Sep 27 2026)

 Ships branch coverage-record: the whole-read record, the first piece of
 Openings, on its own (docs/rounds/2026-09-27-coverage-record.md is the
 round; docs/rounds/2026-09-27-openings.md the proposal it comes from).
 After a pull Mindbody answered in full, the iPad that pulled writes down
 which studio days it read, in studios/{studio}/scheduleCoverage/{yyyy-mm}.
 No Mindbody call, no index, no Cloud Functions or server change; one new
 rules block.

 It ships AFTER the voice review follow-up: the branch is built on bfa9cda,
 and this script stops unless master already contains that commit.

 Run from the project folder, with the folder on the branch (ask Claude to
 switch it; do not switch branches by hand), IN ORDER:

   powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-coverage-record.ps1 -Stage prepare
   powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-coverage-record.ps1 -Stage golive

 prepare  changes nothing (it writes only logs\ and the build folders). In
          order: the branch, a clean tree, the fetch, that master already
          holds the voice review follow-up (bfa9cda), that the branch
          fast-forwards master, what goes live, that functions\, the server
          and firestore.indexes.json are unchanged, the rules change listed,
          the Firebase login (golive needs it), the case check, the typecheck
          COUNT (4), the suite in Eastern time, the rules tests (THE run that
          counts; port 8080 checked first, and an emulator this run leaves
          behind is stopped), both builds. Then it prints the plan. It stops
          at the first failure and says which. Ends PREPARE PASSED and writes
          logs\ship-coverage-record.prepared: the commit it tested and master
          as it was.

 golive   refuses unless that file still names the branch's commit and
          master as they are now. Then it asks for GO, and in order:
            1. tags master as it is now (restore/2026-09-27-before-coverage-
               record) and pushes the tag;
            2. deploys firestore.rules to production (project 'prod', the
               named database firebase.json names). The new block only adds
               access, so the running app is unaffected and the new one finds
               its rules waiting;
            3. pushes coverage-record to master, fast-forward only: RENDER
               DEPLOYS THE APP.
          It stops at the first failure; nothing after it runs. It never runs
          "firebase deploy --only firestore:indexes".

 To undo the app: push the restore tag to master (ask Claude). The rules can
 stay: nothing else reads or writes the new collection.

 ASCII only on purpose (Windows PowerShell 5.1 reads a script as ANSI).
#>

param([Parameter(Mandatory = $true, Position = 0)][ValidateSet('prepare', 'golive')][string]$Stage)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $Root
$LogFile = Join-Path $Root 'logs\ship-coverage-record.log'
# What prepare tested: "<branch sha> <origin/master sha>". golive reads it.
$PreparedFile = Join-Path $Root 'logs\ship-coverage-record.prepared'
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $LogFile) | Out-Null
$Branch = 'coverage-record'
$RestoreTag = 'restore/2026-09-27-before-coverage-record'
# The voice review follow-up's last commit. This round is built on it and
# goes live only once master holds it.
$MustFollow = 'bfa9cda'
# 4 since the client codex: AppContent.tsx x2, clinical-review/charts.tsx,
# EditTrainerModal.tsx. Measured 4 on this branch, Sep 27 2026. More is new.
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
  Log "Nothing further was done. The log is $LogFile" 'Red'
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

Log "ship-coverage-record $Stage" 'White'

if (-not (Test-Path 'service-account.json')) { Stop-Here 'run this from the project folder (the one with service-account.json).' }

# ---- from the project folder, on the branch -----------------------------------------
$head = (& git --no-optional-locks symbolic-ref --quiet --short HEAD)
if ($LASTEXITCODE -ne 0 -or "$head".Trim() -ne $Branch) { Stop-Here "the project folder is on '$head', not $Branch. Ask Claude; do not switch branches by hand." }
$dirty = (& git --no-optional-locks status --porcelain --untracked-files=no -- src docs server server.ts scripts tests functions firestore.rules firestore.indexes.json firebase.json package.json package-lock.json vite.config.ts render.yaml CLAUDE.md ROADMAP.md) | Where-Object { $_ }
if ($dirty) {
  Log 'Uncommitted changes:' 'Red'
  $dirty | ForEach-Object { Log "   $_" 'Red' }
  Stop-Here 'the branch has uncommitted changes. Everything that ships must be committed first.'
}
$untracked = (& git --no-optional-locks status --porcelain -- src tests server) | Where-Object { "$_" -like '`?`? *' }
if ($untracked) {
  Log 'Files under src, tests or server that git does not track:' 'Red'
  $untracked | ForEach-Object { Log "   $_" 'Red' }
  Stop-Here 'untracked source files would be tested here but not shipped. Commit or remove them first.'
}

Log 'Fetching from GitHub (reads only)' 'Cyan'
& git fetch -q origin
if ($LASTEXITCODE -ne 0) { Stop-Here 'could not reach GitHub.' }

# The voice review follow-up first: this branch is built on it (so the commit
# is always on this PC; the question is only whether master has it yet).
& git --no-optional-locks merge-base --is-ancestor $MustFollow $Branch
if ($LASTEXITCODE -ne 0) { Stop-Here "$Branch is not built on $MustFollow (the voice review follow-up). Ask Claude." }
& git --no-optional-locks merge-base --is-ancestor $MustFollow origin/master
if ($LASTEXITCODE -ne 0) { Stop-Here "master does not have the voice review follow-up yet ($MustFollow). Ship it first (ship-voice-review-followup.ps1), then run this again." }
Log "master already holds the voice review follow-up ($MustFollow)." 'Green'

& git --no-optional-locks merge-base --is-ancestor origin/master $Branch
if ($LASTEXITCODE -ne 0) {
  Log 'master has commits the branch does not:' 'Red'
  & git --no-optional-locks log --oneline "$Branch..origin/master" | ForEach-Object { Log "   $_" 'Red' }
  Stop-Here "$Branch does not fast-forward master. Ask Claude to bring master into $Branch first."
}

$ahead = (& git --no-optional-locks rev-list --count "origin/master..$Branch").Trim()
if ([int]$ahead -eq 0) { Log 'master already has everything on the branch. Nothing to ship.' 'Green'; exit 0 }
Log "$ahead commit(s) will go live:" 'Green'
& git --no-optional-locks log --oneline "origin/master..$Branch" | ForEach-Object { Log "   $_" }
$BranchSha = (& git --no-optional-locks rev-parse $Branch).Trim()
$MasterSha = (& git --no-optional-locks rev-parse origin/master).Trim()

if ($Stage -eq 'prepare') {
  if (Test-Path $PreparedFile) { Remove-Item -Force $PreparedFile }

  & git --no-optional-locks diff --quiet origin/master $Branch -- functions
  if ($LASTEXITCODE -ne 0) { Stop-Here 'the branch changes functions\, which this round should not. Ask Claude.' }
  Log 'functions\: unchanged. No Cloud Functions deploy.' 'Green'
  & git --no-optional-locks diff --quiet origin/master $Branch -- server server.ts
  if ($LASTEXITCODE -ne 0) { Stop-Here 'the branch changes the server, which this round should not. Ask Claude.' }
  Log 'server\ and server.ts: unchanged. No Mindbody or server change.' 'Green'
  & git --no-optional-locks diff --quiet origin/master $Branch -- firestore.indexes.json
  if ($LASTEXITCODE -ne 0) { Stop-Here 'the branch changes firestore.indexes.json, which this round should not (it reads by id, no query). Ask Claude.' }
  Log 'firestore.indexes.json: unchanged. No index deploy.' 'Green'

  Log 'firestore.rules changes (one new block, scheduleCoverage, and its two helpers):' 'Yellow'
  & git --no-optional-locks diff --stat origin/master $Branch -- firestore.rules | ForEach-Object { Log "   $_" 'Yellow' }

  $fl = Run 'Firebase login' 'npx firebase login:list'
  Must $fl 'the Firebase login check'
  if (-not (@($fl.Output) -match '@')) { Stop-Here 'no Firebase login on this PC. Run: npx firebase login, then prepare again.' }

  $dups = @(& git --no-optional-locks ls-files | ForEach-Object { $_.ToLowerInvariant() } | Group-Object | Where-Object { $_.Count -gt 1 })
  if ($dups.Count -gt 0) {
    $dups | ForEach-Object { Log "   $($_.Name)" 'Red' }
    Stop-Here 'two tracked files differ only by case.'
  }
  Log 'Case check: no two files differ only by case.' 'Green'

  $tsc = Run 'typecheck' 'npx tsc --noEmit'
  $errs = @($tsc.Output | Where-Object { "$_" -match 'error TS' }).Count
  Log "tsc errors: $errs (baseline $TscBaseline)" $(if ($errs -le $TscBaseline) { 'Green' } else { 'Red' })
  if ($errs -gt $TscBaseline) { Stop-Here 'more typecheck errors than the baseline.' }

  $env:TZ = 'America/New_York'
  $vt = Run 'vitest (TZ=America/New_York)' 'npm test'
  Must $vt 'the test suite'

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
  $left = Get-Port8080
  if ($left -and $left.ProcessName -eq 'java' -and $left.StartTime -gt $Started) {
    Log "Stopping the emulator this run left on port 8080 (PID $($left.Id))." 'Yellow'
    Stop-Process -Id $left.Id -Force -ErrorAction SilentlyContinue
  }
  Must $rt 'test:rules (needs JDK 21)'

  $bd = Run 'build (app and server)' 'npm run build'
  Must $bd 'the build'
  $bb = Run 'build (the cron jobs)' 'npm run build:backend'
  Must $bb 'the cron build'

  Set-Content -Path $PreparedFile -Value "$BranchSha $MasterSha" -Encoding ascii
  Log "Tested: $Branch at $($BranchSha.Substring(0, 7)), master at $($MasterSha.Substring(0, 7))." 'Green'
  Log 'THE PLAN (golive, in this order, stopping at the first failure):' 'White'
  Log "  1. Tag master as it is now: $RestoreTag = $($MasterSha.Substring(0, 7)), and push the tag." 'White'
  Log '  2. npx firebase deploy --only firestore:rules --project prod (the scheduleCoverage block).' 'White'
  Log "  3. git push origin ${Branch}:master (fast-forward only). Render deploys the app." 'White'
  Log 'PREPARE PASSED. Next: powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-coverage-record.ps1 -Stage golive' 'Green'
  exit 0
}

# ---- golive ------------------------------------------------------------------------
if (-not (Test-Path $PreparedFile)) { Stop-Here 'prepare has not passed on this PC. Run prepare first.' }
$prepared = ((Get-Content -Path $PreparedFile -Raw).Trim()) -split '\s+'
if ($prepared.Count -ne 2 -or $prepared[0] -ne $BranchSha) { Stop-Here "$Branch has changed since prepare passed, so this commit has not been tested. Run prepare again." }
if ($prepared[1] -ne $MasterSha) { Stop-Here 'master has moved since prepare passed. Run prepare again.' }
Log "prepare passed on this commit ($($BranchSha.Substring(0, 7))) onto this master ($($MasterSha.Substring(0, 7)))." 'Green'
Write-Host ''
Write-Host 'This tags the restore point, deploys firestore.rules to production (the new scheduleCoverage block),' -ForegroundColor Yellow
Write-Host 'then pushes to master, which deploys the app on Render. Nothing is asked of or written to Mindbody.' -ForegroundColor Yellow
if ((Read-Host 'Type GO to tag, deploy and push') -ne 'GO') { Log 'Nothing tagged, deployed or pushed.' 'Yellow'; exit 0 }

# 1. The restore point: master as it is now.
$tagOnGitHub = & git --no-optional-locks ls-remote --tags origin "refs/tags/$RestoreTag"
if ($LASTEXITCODE -ne 0) { Stop-Here 'could not ask GitHub for its tags. Nothing was deployed or pushed.' }
if (-not $tagOnGitHub) {
  $local = & git --no-optional-locks tag -l $RestoreTag
  if (-not $local) {
    & git tag $RestoreTag origin/master
    if ($LASTEXITCODE -ne 0) { Stop-Here "could not make the restore tag $RestoreTag. Nothing was deployed or pushed." }
  } else {
    $tagSha = (& git --no-optional-locks rev-parse "$RestoreTag^{commit}").Trim()
    if ($tagSha -ne $MasterSha) { Stop-Here "the restore tag $RestoreTag on this PC is not master as it is now. Ask Claude to remove it; nothing was deployed or pushed." }
  }
  $tp = Run "push the restore tag $RestoreTag" "git push origin refs/tags/$RestoreTag"
  Must $tp 'pushing the restore tag (nothing was deployed or pushed)'
} else {
  $remoteSha = ("$tagOnGitHub" -split '\s+')[0]
  if ($remoteSha -ne $MasterSha) { Stop-Here "the restore tag $RestoreTag on GitHub is not master as it is now. Ask Claude; nothing was deployed or pushed." }
}
Log "Restore point on GitHub: $RestoreTag = $($MasterSha.Substring(0, 7))" 'Green'

# 2. The rules: the new block only adds access, so the running app is
#    unaffected; the new app finds its rules waiting.
$rules = Run 'deploy firestore.rules (project prod)' 'npx firebase deploy --only firestore:rules --project prod'
if ($rules.Code -ne 0) { Stop-Here 'the rules deploy failed. The live app is unchanged and nothing was pushed.' }
Log 'Rules deployed to production.' 'Green'

# 3. The push, fast-forward only (git refuses anything else without --force,
#    which this script never passes). Checked again against GitHub first.
& git fetch -q origin
if ($LASTEXITCODE -ne 0) { Stop-Here 'could not reach GitHub before the push. The rules are deployed; the app is unchanged. Run golive again once GitHub answers (prepare first if master moved).' }
if ((& git --no-optional-locks rev-parse origin/master).Trim() -ne $MasterSha) { Stop-Here 'master moved while golive ran. The rules are deployed; the app is unchanged. Ask Claude.' }
& git --no-optional-locks merge-base --is-ancestor origin/master $Branch
if ($LASTEXITCODE -ne 0) { Stop-Here "$Branch no longer fast-forwards master. The rules are deployed; the app is unchanged. Ask Claude." }
$push = Run "git push origin ${Branch}:master" "git push origin ${Branch}:master"
Must $push 'the push (Render deploys from it). The rules are deployed; the app is unchanged'

Log "GOLIVE COMPLETE. master = $((& git --no-optional-locks rev-parse --short origin/master).Trim())." 'Green'
Log 'When Render shows the deploy Live, reload Journey on every iPad and front-desk computer.' 'Green'
Log 'After the next pull at each studio: Firebase console -> the named database -> studios -> a studio ->' 'Green'
Log 'scheduleCoverage -> this month holds today and tomorrow. Nothing else to run; no back-read (AJ, Sep 27).' 'Green'
exit 0
