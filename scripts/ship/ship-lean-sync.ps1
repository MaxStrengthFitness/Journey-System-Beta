<#
 SCRIPT-VERSION: v1  (Sep 25 2026: the lean Mindbody sync)

 Ships branch lean-sync: the schedule pull that asks Mindbody for today and
 tomorrow every interval and the whole month four times a day (about 600
 Mindbody calls a studio a day down to about 120), and the webhook that
 carries a booking, a move or a cancellation to the Hub in seconds.
 docs/rounds/2026-09-25-lean-sync.md is the round.

 Run from the project folder, with the folder on lean-sync (ask Claude to
 switch it; do not switch branches by hand), IN ORDER:

   powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-lean-sync.ps1 prepare
   powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-lean-sync.ps1 golive
   powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-lean-sync.ps1 webhooks-check
   powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-lean-sync.ps1 webhooks-on
   powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-lean-sync.ps1 webhooks-test

 prepare         changes nothing. Checks the branch contains master (a
                 fast-forward), the typecheck COUNT, the suite in Eastern time,
                 the rules tests (the run that counts), the webhook's own
                 tests, and a production build. Records what it tested.
 golive          only what prepare tested. Deploys firestore.rules (one field
                 added to what any trainer's iPad may write on its studio: when
                 the last whole-month pull succeeded), tags the restore point,
                 then pushes lean-sync to master: RENDER DEPLOYS THE APP AND THE
                 SERVER and the lean pull starts. The webhook code rides along
                 but is NOT deployed by this stage.
 webhooks-check  reads only: every subscription Mindbody holds for the webhook.
 webhooks-on     starts the webhook fresh (the same five steps as the Sep 24
                 script): a new subscription that now includes
                 appointmentBooking.updated, its secret into Firebase (never
                 shown), redeploy the webhook, activate, delete the old ones.
 webhooks-test   prints the three-minute test to do in Mindbody. Changes nothing.

 To undo the app and server: push the restore tag to master (ask Claude). The
 rules change only adds one field a trainer may write, so it can stay.
 To undo the webhook: deactivate its subscription (node
 scripts\mindbody\register-webhook.js --list shows it); the pull carries on.

 ASCII only on purpose (Windows PowerShell 5.1 reads a script as ANSI).
#>

param([Parameter(Mandatory = $true, Position = 0)][ValidateSet('prepare', 'golive', 'webhooks-check', 'webhooks-on', 'webhooks-test')][string]$Stage)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $Root
$LogFile = Join-Path $Root 'logs\ship-lean-sync.log'
# What prepare tested: "<branch sha> <origin/master sha>". golive reads it.
$PreparedFile = Join-Path $Root 'logs\ship-lean-sync.prepared'
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $LogFile) | Out-Null
$Branch = 'lean-sync'
$RestoreTag = 'restore/2026-09-25-before-lean-sync-golive'
$Register = 'scripts\mindbody\register-webhook.js'
# 4 since the client codex: AppContent.tsx x2, clinical-review/charts.tsx,
# EditTrainerModal.tsx. Measured 4 on lean-sync, Sep 25 2026. More is new.
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

Log "ship-lean-sync $Stage" 'White'
if (-not (Test-Path 'service-account.json')) { Stop-Here 'run this from the project folder (the one with service-account.json).' }

# ---- the webhook stages: after golive, from the project folder -------------------
if ($Stage -eq 'webhooks-check') {
  Log 'Every subscription Mindbody holds for the webhook (reads only)' 'Cyan'
  & node $Register --list --site 5746957
  exit $LASTEXITCODE
}

if ($Stage -eq 'webhooks-test') {
  Log 'Three minutes in Mindbody, one iPad on the Hub (changes nothing here)' 'Cyan'
  Write-Host '  1. In Mindbody, book a test appointment for TOMORROW at Solon, for a test client.'
  Write-Host '     On the Hub, go to tomorrow: it should appear within about a minute, at the time you booked.'
  Write-Host '     If it appears 4 or 5 hours off, STOP and tell Claude (the fix is small).'
  Write-Host '  2. Move it to another time in Mindbody. The Hub should move it within about a minute.'
  Write-Host '  3. Cancel it in Mindbody. It should leave the Hub within about a minute.'
  Write-Host '  4. Do 1 and 3 once at westlake, Strongsville or Willoughby too: that Mindbody site is shared,'
  Write-Host '     and before this round its cancellations never reached the Hub by webhook.'
  Write-Host '  If a step takes about 15 minutes, the pull caught it and the webhook did not: tell Claude.'
  exit 0
}

if ($Stage -eq 'webhooks-on') {
  & git --no-optional-locks fetch -q origin
  if ($LASTEXITCODE -ne 0) { Stop-Here 'could not reach GitHub.' }
  & git --no-optional-locks merge-base --is-ancestor $Branch origin/master
  if ($LASTEXITCODE -ne 0) { Stop-Here 'run golive first: the webhook must deploy from the code that is live on master.' }
  # The deploy builds functions\ from THIS folder, so the folder must be the
  # live code exactly: master as it is on GitHub, nothing uncommitted.
  $h = (& git --no-optional-locks rev-parse HEAD).Trim()
  $m = (& git --no-optional-locks rev-parse origin/master).Trim()
  if ($h -ne $m) { Stop-Here 'this folder is not at master as it is on GitHub, so the webhook would deploy other code. Ask Claude.' }
  & git --no-optional-locks diff --quiet HEAD -- functions
  if ($LASTEXITCODE -ne 0) { Stop-Here 'there are uncommitted changes under functions\, and they would deploy. Ask Claude.' }
  Log 'Starting the Mindbody webhook fresh: new subscription, new secret, redeploy, activate, delete the old ones.' 'White'
  Write-Host 'Real Mindbody events (clients, bookings, moves, cancellations, memberships, staff) start arriving at the end of this.' -ForegroundColor Yellow
  if ((Read-Host 'Type GO to start') -ne 'GO') { Log 'Nothing changed.' 'Yellow'; exit 0 }

  # Native tools write progress to stderr; under 'Stop', PowerShell 5.1 would
  # turn a captured stderr line into a terminating error.
  $ErrorActionPreference = 'Continue'
  $tmp = Join-Path $env:TEMP ([IO.Path]::GetRandomFileName())
  try {
    Log '1/5 Creating the new subscription' 'Cyan'
    $out = & node $Register --fresh --secret-file $tmp --yes-affect-production 2>&1
    $out | ForEach-Object { Write-Host $_ }
    if ($LASTEXITCODE -ne 0) { Stop-Here 'Mindbody did not create a subscription; nothing else was changed.' }
    $line = $out | Where-Object { "$_" -match '^NEW_SUBSCRIPTION_ID=' } | Select-Object -Last 1
    if (-not $line) { Stop-Here 'No subscription id came back. Tell Claude.' }
    $newId = ("$line" -replace '^NEW_SUBSCRIPTION_ID=', '').Trim()
    if (-not (Test-Path $tmp) -or (Get-Item $tmp).Length -eq 0) { Stop-Here "Subscription $newId was created but its secret was not saved. Tell Claude." }

    Log '2/5 Giving Firebase the new secret (not shown)' 'Cyan'
    & npx firebase functions:secrets:set MINDBODY_WEBHOOK_SECRET --data-file $tmp --project prod
    if ($LASTEXITCODE -ne 0) { Stop-Here "Could not set the secret. Subscription $newId is created but NOT active, so nothing is being sent. Tell Claude." }
  } finally {
    Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
  }

  Log '3/5 Redeploying the webhook (new secret + the documented booking events)' 'Cyan'
  & npx firebase deploy --only functions:mindbodyWebhook --project prod
  if ($LASTEXITCODE -ne 0) { Stop-Here "The redeploy failed. Subscription $newId is NOT active yet; run webhooks-on again or tell Claude." }

  Log '4/5 Activating the new subscription' 'Cyan'
  & node $Register --activate $newId --yes-affect-production
  if ($LASTEXITCODE -ne 0) { Stop-Here "Activation refused. Tell Claude (subscription $newId)." }

  Log '5/5 Deleting the old subscriptions' 'Cyan'
  & node $Register --delete-except $newId --yes-affect-production
  if ($LASTEXITCODE -ne 0) { Stop-Here "Subscription $newId is active, but not every old one was deleted. Run webhooks-check and tell Claude." }

  Log "Done. Subscription $newId is active. Next: ship-lean-sync.ps1 webhooks-test" 'Green'
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
  Stop-Here "master is not in $Branch (the packages release, most likely). Ask Claude to merge master into $Branch first."
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
  Log 'firestore.rules changes (one field on the studio sync lease); the rules tests below must pass, and golive deploys it before the push:' 'Yellow'
  & git --no-optional-locks diff --stat origin/master $Branch -- firestore.rules | ForEach-Object { Log "   $_" 'Yellow' }
  Log 'functions\ changes (the webhook). golive does NOT deploy it; webhooks-on does, after golive.' 'Yellow'

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

  $ft = Run 'the webhook tests (functions)' 'cd functions && npx vitest run src/mindbody'
  Must $ft 'the webhook tests'
  $fb = Run 'the webhook typecheck (functions)' 'cd functions && npx tsc --noEmit -p .'
  Must $fb 'the webhook typecheck'

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

  $bd = Run 'vite build' 'npx vite build'
  Must $bd 'vite build'

  Set-Content -Path $PreparedFile -Value "$BranchSha $MasterSha" -Encoding ascii
  Log "Tested: $Branch at $($BranchSha.Substring(0, 7)), master at $($MasterSha.Substring(0, 7))." 'Green'
  Log 'PREPARE PASSED. Next: powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-lean-sync.ps1 golive' 'Green'
  exit 0
}

# ---- golive ------------------------------------------------------------------------
if (-not (Test-Path $PreparedFile)) { Stop-Here 'prepare has not passed on this PC. Run prepare first.' }
$prepared = ((Get-Content -Path $PreparedFile -Raw).Trim()) -split '\s+'
if ($prepared.Count -ne 2 -or $prepared[0] -ne $BranchSha) { Stop-Here "$Branch has changed since prepare passed, so this commit has not been tested. Run prepare again." }
if ($prepared[1] -ne $MasterSha) { Stop-Here 'master has moved since prepare passed. Run prepare again.' }
Log "prepare passed on this commit ($($BranchSha.Substring(0, 7))) onto this master ($($MasterSha.Substring(0, 7)))." 'Green'
Write-Host ''
Write-Host 'This deploys firestore.rules to production, then pushing lean-sync to master deploys the app and the server on Render.' -ForegroundColor Yellow
Write-Host 'From the next pull, every studio asks Mindbody for today and tomorrow each interval, and the whole month' -ForegroundColor Yellow
Write-Host 'on its first pull of the day and after 10am, 2pm and 6pm.' -ForegroundColor Yellow
if ((Read-Host 'Type GO to deploy the rules and push') -ne 'GO') { Log 'Nothing deployed, nothing pushed.' 'Yellow'; exit 0 }

# The rules first: they only add a field a trainer may write, so the running app is unaffected.
$rules = Run 'deploy firestore.rules (project prod)' 'npx firebase deploy --only firestore:rules --project prod'
if ($rules.Code -ne 0) { Stop-Here 'the rules deploy failed. The live app is unchanged.' }
Log 'Rules deployed to production.' 'Green'

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
Log 'When Render shows the deploy Live, reload Journey on every iPad and front-desk computer: one left on the old app keeps making the old month-long pulls.' 'Green'
Log 'Then: Render -> the web service -> Logs, search "client lookup". A near pull reads "1 page(s)" and "N known client(s) not looked up". Send Claude a few lines.' 'Green'
Log 'Then, when you are ready for the webhook: ship-lean-sync.ps1 webhooks-check, then webhooks-on.' 'Green'
exit 0
