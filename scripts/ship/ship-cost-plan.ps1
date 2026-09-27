<#
 SCRIPT-VERSION: v2  (Sep 27 2026: the functions tests run from functions\src only)

 Ships branch claude/sleepy-franklin-w35ea6: the cost plan built on AJ's
 ranking - the pull every 30 minutes and the month once each morning, packages
 when a sale happens, the pre-launch sync and sync on first booking, nothing
 pulled for a studio before it goes live, and the Firestore bookkeeping moved
 off the documents every iPad watches. docs/rounds/2026-09-26-cost-plan.md is
 the round.

 Run from the project folder, with the folder on the branch (ask Claude to
 switch it; do not switch branches by hand), IN ORDER:

   powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-cost-plan.ps1 prepare
   powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-cost-plan.ps1 golive
   powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-cost-plan.ps1 webhook
   powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-cost-plan.ps1 onboard-help

 prepare       changes nothing. Checks the branch contains master, the typecheck
               COUNT, the suite in Eastern time, every functions test and its
               typecheck, the rules tests (the run that counts), and both builds.
 golive        only what prepare tested. Deploys firestore.rules (four new
               documents, all additions), the trainer-rollup functions, deletes
               the 2am calculateFacilityAnalyticsV2, tags the restore point,
               then pushes to master: RENDER DEPLOYS THE APP, THE SERVER AND
               THE CRONS.
 webhook       the webhook function's new code (a sale marks the client for the
               nightly pull; the health document written on change). Only if
               ship-lean-sync.ps1 webhooks-check shows an ACTIVE subscription;
               if there is none, run ship-lean-sync.ps1 webhooks-on instead,
               which deploys this same code while switching it on.
 onboard-help  prints the pre-launch sync's evening-by-evening commands.
               Changes nothing.

 To undo the app and server: push the restore tag to master (ask Claude). The
 rules only add access, so they can stay. The trainer rollups carry their old
 totals over by themselves, in either direction.

 ASCII only on purpose (Windows PowerShell 5.1 reads a script as ANSI).
#>

param([Parameter(Mandatory = $true, Position = 0)][ValidateSet('prepare', 'golive', 'webhook', 'onboard-help')][string]$Stage)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $Root
$LogFile = Join-Path $Root 'logs\ship-cost-plan.log'
# What prepare tested: "<branch sha> <origin/master sha>". golive reads it.
$PreparedFile = Join-Path $Root 'logs\ship-cost-plan.prepared'
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $LogFile) | Out-Null
$Branch = 'claude/sleepy-franklin-w35ea6'
$RestoreTag = 'restore/2026-09-26-before-cost-plan-golive'
# 4 since the client codex: AppContent.tsx x2, clinical-review/charts.tsx,
# EditTrainerModal.tsx. Measured 4 on this branch, Sep 26 2026. More is new.
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
  Log "The log is $LogFile" 'Red'
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

Log "ship-cost-plan $Stage" 'White'

if ($Stage -eq 'onboard-help') {
  Write-Host ''
  Write-Host 'THE PRE-LAUNCH SYNC, one studio (or the three on the shared site together).' -ForegroundColor Cyan
  Write-Host 'Needs .env (the Mindbody keys) and service-account.json, like the other data scripts.'
  Write-Host 'Run in the evening, after the studios close. Each run stops at about 500 calls (about 100 clients).'
  Write-Host ''
  Write-Host '  1. See who counts and what it costs (writes nothing):'
  Write-Host '       npx tsx scripts/onboard-studio.ts --studio solon'
  Write-Host '     The shared site, all three at once:'
  Write-Host '       npx tsx scripts/onboard-studio.ts --studio westlake,strongsville,willoughby'
  Write-Host '     Read the list in backups\ - anyone missing? anyone who should not be there?'
  Write-Host '  2. A first handful, then check 5 of them against Mindbody (name, phone, birthday, visits, package):'
  Write-Host '       npx tsx scripts/onboard-studio.ts --studio solon --commit --limit 25'
  Write-Host '  3. Each evening after that, the same command without --limit. It carries on where it stopped:'
  Write-Host '       npx tsx scripts/onboard-studio.ts --studio solon --commit'
  Write-Host '  4. The proof - the list it prints must be empty:'
  Write-Host '       npx tsx scripts/onboard-studio.ts --studio solon --verify'
  Write-Host '  5. Then set the studio''s Journey cutover date (My Studio -> Studio). From the night before it,'
  Write-Host '     the nightly job syncs anyone new the night before their first session.'
  Write-Host ''
  Write-Host 'Nothing syncs a studio''s clients on a timer before its cutover date. These commands are the only way in.'
  exit 0
}

if (-not (Test-Path 'service-account.json')) { Stop-Here 'run this from the project folder (the one with service-account.json).' }

if ($Stage -eq 'webhook') {
  & git --no-optional-locks fetch -q origin
  if ($LASTEXITCODE -ne 0) { Stop-Here 'could not reach GitHub.' }
  $h = (& git --no-optional-locks rev-parse HEAD).Trim()
  $m = (& git --no-optional-locks rev-parse origin/master).Trim()
  if ($h -ne $m) { Stop-Here 'this folder is not at master as it is on GitHub, so the webhook would deploy other code. Run golive first, or ask Claude.' }
  & git --no-optional-locks diff --quiet HEAD -- functions
  if ($LASTEXITCODE -ne 0) { Stop-Here 'there are uncommitted changes under functions\, and they would deploy. Ask Claude.' }
  Write-Host 'Only when ship-lean-sync.ps1 webhooks-check shows an ACTIVE subscription. If it shows none, run' -ForegroundColor Yellow
  Write-Host 'ship-lean-sync.ps1 webhooks-on instead: it deploys this same code while switching the webhook on.' -ForegroundColor Yellow
  if ((Read-Host 'Type GO to redeploy the webhook function') -ne 'GO') { Log 'Nothing deployed.' 'Yellow'; exit 0 }
  $wd = Run 'deploy the webhook function' 'npx firebase deploy --only functions:mindbodyWebhook --project prod'
  Must $wd 'the webhook deploy (a missing MINDBODY_WEBHOOK_SECRET means it was never switched on: use webhooks-on)'
  Log 'Webhook redeployed: a sale now marks the client for the nightly pull, and system/health is written on change.' 'Green'
  exit 0
}

# ---- prepare and golive: from the project folder, on the branch ------------------
$head = (Get-Content '.git\HEAD' -Raw).Trim()
if ($head -ne "ref: refs/heads/$Branch") { Stop-Here "the project folder is on '$head', not $Branch. Ask Claude; do not switch branches by hand." }
$dirty = (& git --no-optional-locks status --porcelain --untracked-files=no -- src docs server server.ts scripts tests functions firestore.rules firestore.indexes.json package.json package-lock.json vite.config.ts render.yaml CLAUDE.md) | Where-Object { $_ }
if ($dirty) {
  Log 'Uncommitted changes:' 'Red'
  $dirty | ForEach-Object { Log "   $_" 'Red' }
  Stop-Here 'the branch has uncommitted changes. Everything that ships must be committed first.'
}
$untracked = (& git --no-optional-locks status --porcelain -- src tests server functions\src) | Where-Object { "$_" -like '`?`? *' }
if ($untracked) {
  Log 'Files under src, tests, server or functions\src that git does not track:' 'Red'
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
  Stop-Here "master is not in $Branch. Ask Claude to merge master into $Branch first."
}

$ahead = (& git --no-optional-locks rev-list --count "origin/master..$Branch").Trim()
if ([int]$ahead -eq 0) { Log 'master already has everything on the branch. Nothing to ship.' 'Green'; exit 0 }
Log "$ahead commit(s) will go live:" 'Green'
& git --no-optional-locks log --oneline "origin/master..$Branch" | ForEach-Object { Log "   $_" }
$BranchSha = (& git --no-optional-locks rev-parse $Branch).Trim()
$MasterSha = (& git --no-optional-locks rev-parse origin/master).Trim()

if ($Stage -eq 'prepare') {
  if (Test-Path $PreparedFile) { Remove-Item -Force $PreparedFile }

  & git --no-optional-locks diff --quiet origin/master $Branch -- firestore.indexes.json
  if ($LASTEXITCODE -ne 0) { Stop-Here 'the branch changes firestore.indexes.json, which this round should not. Ask Claude.' }
  Log 'firestore.indexes.json: unchanged. No index deploy.' 'Green'
  Log 'firestore.rules changes (four new documents: the sync lease, a trainer''s counters, announcement read-marks, the webhook watch):' 'Yellow'
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

  # --dir src: functions\lib holds what `firebase deploy` compiled, and an older
  # build left COMPILED copies of the tests there (CommonJS, which cannot load
  # vitest). Unscoped, vitest collects them and fails the run although every
  # real test passes (AJ's first prepare, Sep 27 2026).
  $ft = Run 'every functions test' 'cd functions && npx vitest run --dir src'
  Must $ft 'the functions tests'
  $fb = Run 'the functions typecheck' 'cd functions && npx tsc --noEmit -p .'
  Must $fb 'the functions typecheck'

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
  Log 'PREPARE PASSED. Next: powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-cost-plan.ps1 golive' 'Green'
  exit 0
}

# ---- golive ------------------------------------------------------------------------
if (-not (Test-Path $PreparedFile)) { Stop-Here 'prepare has not passed on this PC. Run prepare first.' }
$prepared = ((Get-Content -Path $PreparedFile -Raw).Trim()) -split '\s+'
if ($prepared.Count -ne 2 -or $prepared[0] -ne $BranchSha) { Stop-Here "$Branch has changed since prepare passed, so this commit has not been tested. Run prepare again." }
if ($prepared[1] -ne $MasterSha) { Stop-Here 'master has moved since prepare passed. Run prepare again.' }
Log "prepare passed on this commit ($($BranchSha.Substring(0, 7))) onto this master ($($MasterSha.Substring(0, 7)))." 'Green'
Write-Host ''
Write-Host 'This deploys firestore.rules and the trainer-rollup functions to production, deletes the 2am analytics' -ForegroundColor Yellow
Write-Host 'function, then pushing to master deploys the app, the server and the crons on Render.' -ForegroundColor Yellow
Write-Host 'From then on: today and tomorrow are pulled every 30 minutes, the month once each morning, and the' -ForegroundColor Yellow
Write-Host 'nightly job asks Mindbody nothing about a studio until its Journey cutover date is set.' -ForegroundColor Yellow
if ((Read-Host 'Type GO to deploy and push') -ne 'GO') { Log 'Nothing deployed, nothing pushed.' 'Yellow'; exit 0 }

# The rules first: they only add access, so the running app is unaffected.
$rules = Run 'deploy firestore.rules (project prod)' 'npx firebase deploy --only firestore:rules --project prod'
if ($rules.Code -ne 0) { Stop-Here 'the rules deploy failed. The live app is unchanged.' }
Log 'Rules deployed to production.' 'Green'

# The trainer counters: they carry each trainer's old total over by themselves.
$fr = Run 'deploy the trainer-rollup functions' 'npx firebase deploy --only functions:onSessionRollup,functions:recalcTrainerWindows,functions:backfillTrainerRollups --project prod'
if ($fr.Code -ne 0) { Stop-Here 'the functions deploy failed. The rules are live (additions only); nothing was pushed.' }
$fd = Run 'delete the 2am analytics function' 'npx firebase functions:delete calculateFacilityAnalyticsV2 --region us-central1 --force --project prod'
if ($fd.Code -ne 0) { Log 'Could not delete calculateFacilityAnalyticsV2 (it may be gone already). Carrying on; check the Firebase console.' 'Yellow' }

$tagOnGitHub = & git --no-optional-locks ls-remote --tags origin "refs/tags/$RestoreTag"
if (-not $tagOnGitHub) {
  $local = & git --no-optional-locks tag -l $RestoreTag
  if (-not $local) {
    & git tag $RestoreTag origin/master
    if ($LASTEXITCODE -ne 0) { Stop-Here "could not make the restore tag $RestoreTag." }
  } else {
    $tagSha = (& git --no-optional-locks rev-parse "$RestoreTag^{commit}").Trim()
    if ($tagSha -ne $MasterSha) { Stop-Here "the restore tag $RestoreTag on this PC is not master as it is now. Ask Claude to remove it; nothing was pushed." }
  }
  $tp = Run "push the restore tag $RestoreTag" "git push origin refs/tags/$RestoreTag"
  Must $tp 'pushing the restore tag'
}
Log "Restore point on GitHub: $RestoreTag = $((& git --no-optional-locks rev-parse --short "$RestoreTag^{commit}").Trim())" 'Green'

$push = Run "git push origin ${Branch}:master" "git push origin ${Branch}:master"
Must $push 'the push (Render deploys from it)'

Log "GOLIVE COMPLETE. master = $((& git --no-optional-locks rev-parse --short origin/master).Trim())." 'Green'
Log 'When Render shows the deploy Live, reload Journey on every iPad and front-desk computer.' 'Green'
Log 'Then: ship-lean-sync.ps1 webhooks-check. Active -> ship-cost-plan.ps1 webhook. None -> ship-lean-sync.ps1 webhooks-on.' 'Green'
Log 'Operations -> Mindbody says whether the webhook is on from the first night.' 'Green'
Log 'For the pre-launch sync: ship-cost-plan.ps1 onboard-help.' 'Green'
exit 0
