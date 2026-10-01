<#
 SCRIPT-VERSION: v1  (Oct 1 2026)

 Ships branch oct1/finish: the features started before Oct 1, finished so AJ
 can review the Atlas against them (AJ, Oct 1: "Finish what we have and ship
 it all to master"). Each part has its own round document:

   - Demo Mode shows Demo Mode and nothing else: search, Add Client,
     Announcements, Operations' pages (docs/rounds/CHANGELOG.md, Oct 1).
   - The auto-renew box: the studio's answer and the trainer's box on the
     client (docs/rounds/2026-09-25-auto-renew.md, "Onto master, Oct 1").
     RULES CHANGE: packagesRenewAutomatically.
   - A second studio, and taking someone off a studio's team
     (docs/rounds/2026-10-01-second-studio.md).
   - The cron jobs read one studio at a time, with select (docs/KNOWN-TRAPS.md
     "Jobs read per studio with select"; docs/business/running-costs.md).
   - FileMaker parity: InBody due, and notes linked to their session
     (docs/rounds/2026-10-01-filemaker-parity.md).
   - Docs: the FileMaker parity checklist, the voice-note brief.

 No Mindbody change and no Cloud Functions change (prepare refuses one).
 Rules only ADD what the new app needs, so they go before the app.

 Run from the project folder, with the folder on the branch, IN ORDER:

   powershell -ExecutionPolicy Bypass -File .scriptsshipship-oct1.ps1 -Stage prepare
   powershell -ExecutionPolicy Bypass -File .scriptsshipship-oct1.ps1 -Stage golive

 prepare  changes nothing (it writes only logs and the build folder): the
          branch, a clean tree, that master holds the Sep 29 round
          (a6c58935), that the branch fast-forwards master, what goes live,
          functions unchanged, the Firebase login, the case check, the
          typecheck COUNT (4), the suite in Eastern time, the rules tests,
          the build. Ends PREPARE PASSED.

 golive   refuses unless prepare tested this exact commit onto this master.
          Then, after GO: tags master (restore/2026-10-01-before-oct1) and
          pushes the tag; deploys the indexes (never deleting one); deploys
          firestore.rules; pushes oct1/finish to master (Render deploys).

 AFTER golive, by hand (the script prints these again):
   1. Same day, before tonight's renewals run: My Studio -> Studio ->
      Renewals -> Auto-renewal. Westlake, Strongsville, Willoughby: "No,
      billing ends when the payments finish", Save. Solon: "Yes, they renew
      automatically", Save.
   2. Optional tidy: one old index (taskInstances: status, localDate) is in
      production but no longer in the file. To remove it, run
        npx firebase deploy --only firestore:indexes --project prod --force
      which deletes exactly the indexes that are not in the file (today that
      is only this one; prepare lists them).

 To undo the app: push the restore tag to master (ask Claude). To undo the
 rules: deploy firestore.rules from the restore tag (ask Claude).

 ASCII only on purpose (Windows PowerShell 5.1 reads a script as ANSI).
#>

param([Parameter(Mandatory = $true, Position = 0)][ValidateSet('prepare', 'golive')][string]$Stage)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $Root
$LogFile = Join-Path $Root 'logs\ship-oct1.log'
# What prepare tested: "<branch sha> <origin/master sha>". golive reads it.
$PreparedFile = Join-Path $Root 'logs\ship-oct1.prepared'
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $LogFile) | Out-Null
$Branch = 'oct1/finish'
$RestoreTag = 'restore/2026-10-01-before-oct1'
# The Sep 29 round (ship-sep29), live on master. The branch is built on it.
$MustFollow = 'a6c58935'
# 4 since the client codex: AppContent.tsx x2, clinical-review/charts.tsx,
# EditTrainerModal.tsx. More is new.
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

Log "ship-oct1 $Stage" 'White'

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

& git --no-optional-locks merge-base --is-ancestor $MustFollow $Branch
if ($LASTEXITCODE -ne 0) { Stop-Here "$Branch is not built on $MustFollow (the Sep 29 round). Ask Claude." }
& git --no-optional-locks merge-base --is-ancestor $MustFollow origin/master
if ($LASTEXITCODE -ne 0) { Stop-Here "master does not have the Sep 29 round yet ($MustFollow). Run ship-sep29 first." }
Log "master already holds the Sep 29 round ($MustFollow)." 'Green'

& git --no-optional-locks merge-base --is-ancestor origin/master $Branch
if ($LASTEXITCODE -ne 0) {
  Log 'master has commits the branch does not:' 'Red'
  & git --no-optional-locks log --oneline "$Branch..origin/master" | ForEach-Object { Log "   $_" 'Red' }
  Stop-Here "$Branch does not fast-forward master. Ask Claude to bring master into $Branch first."
}

$ahead = (& git --no-optional-locks rev-list --count "origin/master..$Branch").Trim()
if ([int]$ahead -eq 0) { Log 'master already has everything on the branch. Nothing to ship.' 'Green'; exit 0 }
Log "$ahead commit(s) will go live:" 'Green'
& git --no-optional-locks log --oneline --first-parent "origin/master..$Branch" | ForEach-Object { Log "   $_" }
$BranchSha = (& git --no-optional-locks rev-parse $Branch).Trim()
$MasterSha = (& git --no-optional-locks rev-parse origin/master).Trim()

if ($Stage -eq 'prepare') {
  if (Test-Path $PreparedFile) { Remove-Item -Force $PreparedFile }

  & git --no-optional-locks diff --quiet origin/master $Branch -- functions
  if ($LASTEXITCODE -ne 0) { Stop-Here 'the branch changes functions\, which this round should not. Ask Claude.' }
  Log 'functions\: unchanged. No Cloud Functions deploy.' 'Green'

  Log 'firestore.indexes.json changes (golive deploys them before the rules and the app):' 'Yellow'
  & git --no-optional-locks diff --stat origin/master $Branch -- firestore.indexes.json | ForEach-Object { Log "   $_" 'Yellow' }

  Log 'server changes (Render deploys them with the app; no Mindbody change):' 'Yellow'
  & git --no-optional-locks diff --stat origin/master $Branch -- server server.ts | ForEach-Object { Log "   $_" 'Yellow' }

  Log 'firestore.rules changes (they only add what the new app needs):' 'Yellow'
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
    # On this PC every rules run leaves its emulator behind (seen Sep 28 2026).
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

  Set-Content -Path $PreparedFile -Value "$BranchSha $MasterSha" -Encoding ascii
  Log "Tested: $Branch at $($BranchSha.Substring(0, 7)), master at $($MasterSha.Substring(0, 7))." 'Green'
  Log 'THE PLAN (golive, in this order, stopping at the first failure):' 'White'
  Log "  1. Tag master as it is now: $RestoreTag = $($MasterSha.Substring(0, 7)), and push the tag." 'White'
  Log '  2. npx firebase deploy --only firestore:indexes --project prod --non-interactive (never deletes an index).' 'White'
  Log '  3. npx firebase deploy --only firestore:rules --project prod.' 'White'
  Log "  4. git push origin ${Branch}:master (fast-forward only). Render deploys the app." 'White'
  Log 'PREPARE PASSED. Next: powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-oct1.ps1 -Stage golive' 'Green'
  exit 0
}

# ---- golive ------------------------------------------------------------------------
if (-not (Test-Path $PreparedFile)) { Stop-Here 'prepare has not passed on this PC. Run prepare first.' }
$prepared = ((Get-Content -Path $PreparedFile -Raw).Trim()) -split '\s+'
if ($prepared.Count -ne 2 -or $prepared[0] -ne $BranchSha) { Stop-Here "$Branch has changed since prepare passed, so this commit has not been tested. Run prepare again." }
if ($prepared[1] -ne $MasterSha) { Stop-Here 'master has moved since prepare passed. Run prepare again.' }
Log "prepare passed on this commit ($($BranchSha.Substring(0, 7))) onto this master ($($MasterSha.Substring(0, 7)))." 'Green'
Write-Host ''
Write-Host 'This tags the restore point, deploys the new indexes and firestore.rules to production (they only add' -ForegroundColor Yellow
Write-Host 'what the new app needs), then pushes to master, which deploys the app on Render. Nothing is asked of or' -ForegroundColor Yellow
Write-Host 'written to Mindbody.' -ForegroundColor Yellow
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

# 2. The indexes. They build in the background (a few minutes); the new app
#    still answers while they build. --non-interactive: an index in
#    production that is not in the file is left alone, never deleted, and
#    nothing waits on a question nobody can see.
$idx = Run 'deploy firestore.indexes.json (project prod)' 'npx firebase deploy --only firestore:indexes --project prod --non-interactive'
if ($idx.Code -ne 0) { Stop-Here 'the index deploy failed. The live app and its rules are unchanged and nothing was pushed.' }
Log 'Indexes deployed to production (they finish building by themselves).' 'Green'

# 3. The rules. They only add what the new app needs.
$rules = Run 'deploy firestore.rules (project prod)' 'npx firebase deploy --only firestore:rules --project prod'
if ($rules.Code -ne 0) { Stop-Here 'the rules deploy failed. The indexes are deployed (harmless); the live app is unchanged and nothing was pushed.' }
Log 'Rules deployed to production.' 'Green'

# 4. The push, fast-forward only (git refuses anything else without --force,
#    which this script never passes). Checked again against GitHub first.
& git fetch -q origin
if ($LASTEXITCODE -ne 0) { Stop-Here 'could not reach GitHub before the push. The indexes and rules are deployed; the app is unchanged. Run golive again once GitHub answers (prepare first if master moved).' }
if ((& git --no-optional-locks rev-parse origin/master).Trim() -ne $MasterSha) { Stop-Here 'master moved while golive ran. The indexes and rules are deployed; the app is unchanged. Ask Claude.' }
& git --no-optional-locks merge-base --is-ancestor origin/master $Branch
if ($LASTEXITCODE -ne 0) { Stop-Here "$Branch no longer fast-forwards master. The indexes and rules are deployed; the app is unchanged. Ask Claude." }
$push = Run "git push origin ${Branch}:master" "git push origin ${Branch}:master"
Must $push 'the push (Render deploys from it). The indexes and rules are deployed; the app is unchanged'

Log "GOLIVE COMPLETE. master = $((& git --no-optional-locks rev-parse --short origin/master).Trim())." 'Green'
Log 'When Render shows the deploy Live, reload Journey on every iPad and front-desk computer.' 'Green'
Log 'NOW, before tonight''s renewals run: My Studio -> Studio -> Renewals -> Auto-renewal. Westlake, Strongsville, Willoughby: No. Solon: Yes. Save each.' 'Yellow'
Log 'Optional: npx firebase deploy --only firestore:indexes --project prod --force removes the one old index (taskInstances status, localDate).' 'White'
Log 'Then walk Rounds 45 onward of docs/ops/TESTING-CHECKLIST.md on an iPad.' 'Green'
exit 0
