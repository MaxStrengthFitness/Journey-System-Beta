<#
 SCRIPT-VERSION: v1  (Oct 7 2026, the renewals dashboard, with the Wrap-up fix under it)

 Ships branch oct7/renewals-dashboard: the renewal and retention dashboard AJ
 asked for on Oct 6-7 2026 (docs\rounds\2026-10-07-renewals-dashboard.md is
 the round), built on master as it is on GitHub now (27484683: Running low,
 Talk now from the roster, Slipping away). AJ's answers it was built on:
 "allow in app response" (the renewal plan is recorded in Journey), "i believe
 so, we will say yes for now and build like that" (the rate read from the
 Mindbody contract), "Yes added to mindbody" (won sessions arrive as pricing
 options), and "strongsville does not autorenew, allow on the new renewal
 dashboard for studios without auto renew to mark if a client is set to renew
 or not in some way manually". The branch, in order:

   - 40385a83  the Wrap-up round (oct6/wrapup), merged in first and NOT yet
               on master: the client on screen keeps its object when somebody
               else changes (docs\rounds\2026-10-07-wrapup.md). It goes live
               with this push. ship-wrapup.ps1 is replaced by this script (it
               would refuse anyway: it expects master at 40b868a2);
   - the session ledger, the projection at the commitment's end, the rate,
     the retention signals (the nightly snapshot, version 3, server\renewals-job.ts);
   - the renewal plan on the cycle document, with its rules;
   - the name matcher in Renewal settings;
   - the dashboard's row on Operations -> Clients -> Renewals and My renewals;
   - the review's fixes and the docs.

 WHAT GOES TO PRODUCTION, in this order (golive, after GO):
   1. the restore tag restore/2026-10-07-before-renewals-dashboard = master
      as it is now (27484683), pushed to GitHub;
   2. the rules tests again, then firestore.rules (they only ADD access: the
      renewal plan on studios/{s}/renewals/{cycleKey}, its shape check, and
      the plan's touch), then a check that the ruleset LIVE holds
      "renewalPlanValid" (read with gcloud, or confirmed by AJ typing LIVE);
   3. git fetch again, master must not have moved, then
      git push origin oct7/renewals-dashboard:master, fast-forward only.
 THEN, BY HAND, ON RENDER (golive prints it): a push deploys NOTHING on Render
 (found Oct 6 2026, c8b2a5cb: Render has no access to the repo). The web
 service needs Manual Deploy, and BOTH cron jobs Manual Build
 (journey-cron-renewals carries the new snapshot; journey-cron-leaderboards
 the Wrap-up's machine totals read), or they keep the old commit.
 No index, no Cloud Function, no Firestore structure change beyond optional
 fields (clients/{id}.renewal, written by the nightly job only, and the
 plan on the cycle document); no Mindbody call, timer or cadence change;
 nothing contacts anyone.

 Run from the branch's own folder, .claude\worktrees\renewals-dash (it is on
 the branch already; do not switch branches by hand). IN ORDER:

   powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-renewals-dashboard.ps1 -Stage prepare
   powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-renewals-dashboard.ps1 -Stage golive

 prepare  changes nothing in production and nothing in git (it writes only
          logs\, dist\ and build\): the branch, a clean tree, the fetch,
          that master is EXACTLY 27484683 (anything else: stop and ask
          Claude to merge it in and test again), that the branch
          fast-forwards master, what goes live (rules; no functions, no
          indexes), the Firebase login, the restore tag free, no Windows
          line ends, the case check, that firestore.rules holds the plan's
          rules, the typecheck COUNT (2), the suite in Eastern time, the
          functions typecheck and tests, the builds (the app, the crons and
          the server), the first screen's size budget, none of the perf
          lab's markers in the build, and the rules tests. It records what
          it tested in logs\ship-renewals-dashboard.prepared. Ends
          PREPARE PASSED.

 golive   refuses unless the branch and master are exactly what prepare
          recorded, asks for GO, then does 1-3 above and stops at the first
          failure (each stop says what is already live). Then it prints the
          steps left for AJ by hand: Render, Strongsville's auto-renewal,
          the checks before trusting two numbers, the names, Round 63.

 To undo: golive prints the order. In short: git push --force origin
 restore/2026-10-07-before-renewals-dashboard:master, then the same three
 Render buttons. The rules can stay (they only add access, and the older app
 never writes a plan).

 ASCII only on purpose (Windows PowerShell 5.1 reads a script as ANSI).
#>

param([Parameter(Mandatory = $true, Position = 0)][ValidateSet('prepare', 'golive')][string]$Stage)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $Root
$LogFile = Join-Path $Root 'logs\ship-renewals-dashboard.log'
# What prepare tested: "<branch sha> <origin/master sha>". golive reads it.
$PreparedFile = Join-Path $Root 'logs\ship-renewals-dashboard.prepared'
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $LogFile) | Out-Null
$Branch = 'oct7/renewals-dashboard'
$Folder = '.claude\worktrees\renewals-dash'
$RestoreTag = 'restore/2026-10-07-before-renewals-dashboard'
# master on GitHub when this round was finished (fetched Oct 7 2026): Running
# low, Talk now from the roster, Slipping away and the leaders' inactive
# marks. The round was built and measured on exactly this commit; anything
# else on master was not tested with it.
$MasterMustBe = '27484683'
# 2 since the Hub fixes (Oct 1): clinical-review/charts.tsx and
# EditTrainerModal.tsx. This round keeps the same two. More is new.
$TscBaseline = 2
$Project = 'prod'
$GcpProject = 'gen-lang-client-0731527386'
$Db = 'ai-studio-32cbbdcc-6e08-4770-9665-867c68878efa'
# The renewal plan's rules, which must be in the rules deployed...
$RulesMark = 'function renewalPlanValid(p)'
# ...and in the ruleset that is live afterwards.
$LiveRulesMark = 'renewalPlanValid'
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

# The process listening on the rules emulator's port, or $null.
function Get-Port8080 {
  $conn = Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $conn) { return $null }
  return Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
}

# npm run test:rules, with the emulator port freed first and afterwards.
# $whatIsLive says, on a stop, what is already in production.
function Run-RulesTests {
  param([string]$whatIsLive)
  $held = Get-Port8080
  if ($held) {
    Log "Port 8080 is held by $($held.ProcessName) (PID $($held.Id)), started $($held.StartTime)." 'Yellow'
    if ($held.ProcessName -ne 'java') { Stop-Here "something other than an old emulator holds port 8080. Close it and run this stage again. $whatIsLive" }
    # On this PC every rules run leaves its emulator behind (seen Sep 28 2026).
    $answer = Read-Host 'That is almost certainly an emulator an earlier run left behind. Type STOP to stop it (Enter to stop here)'
    if ($answer -ne 'STOP') { Stop-Here "port 8080 is taken. $whatIsLive" }
    Stop-Process -Id $held.Id -Force
    Start-Sleep -Seconds 2
    if (Get-Port8080) { Stop-Here "port 8080 is still taken. $whatIsLive" }
  }
  $runStarted = Get-Date
  $rt = Run 'rules tests' 'npm run test:rules'
  $left = Get-Port8080
  if ($left -and $left.ProcessName -eq 'java' -and $left.StartTime -gt $runStarted) {
    Log "Stopping the emulator this run left on port 8080 (PID $($left.Id))." 'Yellow'
    Stop-Process -Id $left.Id -Force -ErrorAction SilentlyContinue
  }
  if ($rt.Code -ne 0) { Stop-Here "test:rules failed (it needs JDK 21). $whatIsLive" }
}

# The source of the Firestore ruleset LIVE on the named database, read with
# gcloud's sign-in from the Firebase Rules API; $null when it can't be read
# (no gcloud, not signed in, or the API refused).
function Get-LiveRulesSource {
  try {
    $tok = (& gcloud auth print-access-token 2>$null)
    if ($LASTEXITCODE -ne 0 -or -not $tok) { return $null }
    $h = @{ Authorization = "Bearer $("$tok".Trim())"; 'x-goog-user-project' = $GcpProject }
    $rel = Invoke-RestMethod -Method Get -Headers $h -Uri "https://firebaserules.googleapis.com/v1/projects/$GcpProject/releases/cloud.firestore/$Db"
    if (-not $rel.rulesetName) { return $null }
    $rs = Invoke-RestMethod -Method Get -Headers $h -Uri "https://firebaserules.googleapis.com/v1/$($rel.rulesetName)"
    return (@($rs.source.files) | ForEach-Object { $_.content }) -join "`n"
  } catch {
    Log "Could not read the live ruleset: $($_.Exception.Message)" 'Yellow'
    return $null
  }
}

Log "ship-renewals-dashboard $Stage" 'White'

# The branch's own worktree folder (.claude\worktrees\renewals-dash). Nothing
# here reads Firestore with a service account, so service-account.json is not
# needed (a worktree has no copy, on purpose).
$top = (& git --no-optional-locks rev-parse --show-toplevel 2>$null)
if ($LASTEXITCODE -ne 0 -or -not (Test-Path 'package.json') -or -not (Test-Path 'scripts\ship\ship-renewals-dashboard.ps1') -or ((Resolve-Path $top).Path -ne (Get-Location).Path)) { Stop-Here "run this from the top of the branch's folder, $Folder." }
foreach ($f in @('src\features\renewals\plan.ts', 'src\features\renewals\projection.ts', 'src\features\renewals\name-suggest.ts', 'src\features\renewals\RenewalRow.tsx', 'src\features\machine-totals\totals.ts', 'server\renewals-job.ts', 'scripts\check-bundle-budget.mjs', 'docs\rounds\2026-10-07-renewals-dashboard.md')) {
  if (-not (Test-Path $f)) { Stop-Here "$f is missing from this folder. Ask Claude." }
}

# ---- in the branch's folder, on the branch ------------------------------------------
$head = (& git --no-optional-locks symbolic-ref --quiet --short HEAD)
if ($LASTEXITCODE -ne 0 -or "$head".Trim() -ne $Branch) { Stop-Here "this folder is on '$head', not $Branch. Run it from $Folder, or ask Claude; do not switch branches by hand." }
$dirty = (& git --no-optional-locks status --porcelain --untracked-files=no -- src docs server server.ts scripts tests functions public harness index.html firestore.rules firestore.indexes.json firebase.json package.json package-lock.json vite.config.ts render.yaml CLAUDE.md ROADMAP.md) | Where-Object { $_ }
if ($dirty) {
  Log 'Uncommitted changes:' 'Red'
  $dirty | ForEach-Object { Log "   $_" 'Red' }
  Stop-Here 'the branch has uncommitted changes. Everything that ships must be committed first (if git shows every file as changed but git diff shows nothing, ask Claude: that is line ends, not code).'
}
$untracked = (& git --no-optional-locks status --porcelain -- src tests server public functions\src) | Where-Object { "$_" -like '`?`? *' }
if ($untracked) {
  Log 'Files under src, tests, server, public or functions\src that git does not track:' 'Red'
  $untracked | ForEach-Object { Log "   $_" 'Red' }
  Stop-Here 'untracked files would be tested (or deployed, under functions\src) here but not shipped. Commit or remove them first.'
}

Log 'Fetching from GitHub (reads only)' 'Cyan'
& git fetch -q origin
if ($LASTEXITCODE -ne 0) { Stop-Here 'could not reach GitHub.' }

$MustBeSha = (& git --no-optional-locks rev-parse "$MasterMustBe^{commit}").Trim()
if ($LASTEXITCODE -ne 0) { Stop-Here "this checkout does not know $MasterMustBe (master when the round was finished). Ask Claude." }
$BranchSha = (& git --no-optional-locks rev-parse $Branch).Trim()
$MasterSha = (& git --no-optional-locks rev-parse origin/master).Trim()

if ($MasterSha -ne $MustBeSha) {
  Stop-Here "master is at $($MasterSha.Substring(0, 8)), not $MasterMustBe (Slipping away, which this round was built and measured on). Something else went to master since. Ask Claude to merge it into $Branch and test again first."
}
Log "master is at $MasterMustBe (Slipping away and the leaders' inactive marks), as this round was built on." 'Green'

& git --no-optional-locks merge-base --is-ancestor origin/master $Branch
if ($LASTEXITCODE -ne 0) { Stop-Here "$Branch does not fast-forward master. Ask Claude." }

$ahead = (& git --no-optional-locks rev-list --count "origin/master..$Branch").Trim()
if ([int]$ahead -eq 0) { Log 'master already has everything on the branch. Nothing to ship.' 'Green'; exit 0 }
Log "$ahead commit(s) will go live (first-parent line below; the Wrap-up round is the merge):" 'Green'
& git --no-optional-locks log --oneline --first-parent "origin/master..$Branch" | ForEach-Object { Log "   $_" }

# The renewal plan needs its rules: they must have changed, and hold the plan.
& git --no-optional-locks diff --quiet origin/master $Branch -- firestore.rules
if ($LASTEXITCODE -eq 0) { Stop-Here 'firestore.rules is the same as master''s, but the renewal plan needs its new rules. Ask Claude.' }
if (-not (Select-String -Path 'firestore.rules' -SimpleMatch -Pattern $RulesMark -Quiet)) { Stop-Here "firestore.rules does not hold '$RulesMark'. Ask Claude." }
# This round names no function. A change under functions\src (tests aside),
# or to what every function is built with, is one this script cannot deploy
# safely: it stops rather than guess (never a plain --only functions).
$changedFn = @(& git --no-optional-locks diff --name-only origin/master $Branch -- functions/src | Where-Object { $_ -and ($_ -notmatch '\.test\.ts$') })
if ($changedFn.Count -gt 0) {
  $changedFn | ForEach-Object { Log "   $_" 'Red' }
  Stop-Here 'functions\src changed, and this script names no function to deploy (the renewals dashboard changes none). Ask Claude.'
}
& git --no-optional-locks diff --quiet origin/master $Branch -- functions/package.json functions/package-lock.json functions/tsconfig.json
if ($LASTEXITCODE -ne 0) { Stop-Here 'functions\package.json, its lock or its tsconfig changed, which would change every function. Ask Claude.' }
# No index belongs to this round (no new query shape).
& git --no-optional-locks diff --quiet origin/master $Branch -- firestore.indexes.json
if ($LASTEXITCODE -ne 0) { Stop-Here 'firestore.indexes.json changed, and the renewals dashboard adds no index. Ask Claude.' }
Log 'Against master: firestore.rules CHANGED (golive tests, deploys and checks them LIVE before the push); functions\src unchanged; indexes unchanged.' 'Green'

if ($Stage -eq 'prepare') {
  if (Test-Path $PreparedFile) { Remove-Item -Force $PreparedFile }

  Log 'What changes, by folder (src\ and server\ reach the app and the crons; harness\ never ships):' 'Yellow'
  & git --no-optional-locks diff --stat origin/master $Branch | Select-Object -Last 1 | ForEach-Object { Log "   $_" 'Yellow' }
  & git --no-optional-locks diff --dirstat=files,0 origin/master $Branch | ForEach-Object { Log "   $_" 'Yellow' }
  Log 'firestore.rules changes (golive runs the rules tests again, deploys them, and checks they are live, BEFORE the push):' 'Yellow'
  & git --no-optional-locks diff --stat origin/master $Branch -- firestore.rules | ForEach-Object { Log "   $_" 'Yellow' }
  Log 'server, render.yaml and index.html changes (the web service and the crons are deployed by hand on Render):' 'Yellow'
  & git --no-optional-locks diff --stat origin/master $Branch -- server server.ts render.yaml index.html | ForEach-Object { Log "   $_" 'Yellow' }

  $fl = Run 'Firebase login' 'npx firebase login:list'
  Must $fl 'the Firebase login check'
  if (-not (@($fl.Output) -match '@')) { Stop-Here 'no Firebase login on this PC. Run: npx firebase login, then prepare again.' }

  # The restore point golive will make: free, or already master as it is now.
  $tagOnGitHub = & git --no-optional-locks ls-remote --tags origin "refs/tags/$RestoreTag"
  if ($LASTEXITCODE -ne 0) { Stop-Here 'could not ask GitHub for its tags.' }
  if ($tagOnGitHub) {
    $remoteSha = ("$tagOnGitHub" -split '\s+')[0]
    if ($remoteSha -ne $MasterSha) { Stop-Here "the restore tag $RestoreTag on GitHub is not master as it is now. Ask Claude." }
    Log "Restore tag $RestoreTag is already on GitHub at master ($($MasterSha.Substring(0, 7)))." 'Green'
  } else {
    $local = & git --no-optional-locks tag -l $RestoreTag
    if ($local) {
      $tagSha = (& git --no-optional-locks rev-parse "$RestoreTag^{commit}").Trim()
      if ($tagSha -ne $MasterSha) { Stop-Here "the restore tag $RestoreTag on this PC is not master as it is now. Ask Claude to remove it." }
    }
    Log "Restore tag $RestoreTag is free; golive makes it at master ($($MasterSha.Substring(0, 7)))." 'Green'
  }

  # A worktree checked out with core.autocrlf=true writes Windows line ends,
  # and the suite fails on them although nothing is wrong (docs\KNOWN-TRAPS.md,
  # the CRLF trap). Git stores LF either way.
  $crlf = @(& git --no-optional-locks ls-files --eol | Where-Object { "$_" -match 'w/crlf' })
  if ($crlf.Count -gt 0) {
    $crlf | Select-Object -First 10 | ForEach-Object { Log "   $_" 'Red' }
    Stop-Here "$($crlf.Count) file(s) in this folder have Windows line ends (CRLF), and the suite fails on them. Ask Claude to convert them to LF; nothing is wrong with the code."
  }
  Log 'Line ends: every file in this folder is LF.' 'Green'

  $dups = @(& git --no-optional-locks ls-files | ForEach-Object { $_.ToLowerInvariant() } | Group-Object | Where-Object { $_.Count -gt 1 })
  if ($dups.Count -gt 0) {
    $dups | ForEach-Object { Log "   $($_.Name)" 'Red' }
    Stop-Here 'two tracked files differ only by case.'
  }
  Log 'Case check: no two files differ only by case.' 'Green'
  Log "firestore.rules holds the renewal plan's rules ('$RulesMark')." 'Green'

  $tsc = Run 'typecheck' 'npx tsc --noEmit'
  $errs = @($tsc.Output | Where-Object { "$_" -match 'error TS' }).Count
  Log "tsc errors: $errs (baseline $TscBaseline)" $(if ($errs -eq $TscBaseline) { 'Green' } else { 'Red' })
  if ($errs -gt $TscBaseline) { Stop-Here 'more typecheck errors than the baseline.' }
  if ($errs -lt $TscBaseline) { Log "Fewer typecheck errors than the baseline ($errs): not a failure, but tell Claude so the baseline moves." 'Yellow' }

  $env:TZ = 'America/New_York'
  # A longer per-test limit: a few file-walking style tests can pass vitest's
  # default 5 s on a loaded PC, and a timeout is not a failure of the app.
  $vt = Run 'the suite (TZ=America/New_York)' 'npx vitest run --dir src --testTimeout=30000'
  Must $vt 'the test suite'

  # The functions: their own typecheck and tests (nothing of theirs changed;
  # this proves the shared code they import still builds).
  Push-Location 'functions'
  try {
    $ftc = Run 'the functions typecheck' 'npx tsc --noEmit -p .'
  } finally {
    Pop-Location
  }
  Must $ftc 'the functions typecheck'
  $ft = Run 'the functions tests (TZ=America/New_York)' 'npx vitest run --dir functions/src'
  Must $ft 'the functions tests'

  # A production build: NODE_ENV unset (a "test" build ships React's
  # development files, and the budget refuses it), and never a lab build.
  Remove-Item Env:NODE_ENV -ErrorAction SilentlyContinue
  Remove-Item Env:VITE_PERF_LAB -ErrorAction SilentlyContinue
  $bd = Run 'build (the app)' 'npx vite build'
  Must $bd 'the app build'
  $bb = Run 'build (the crons)' 'npm run build:backend'
  Must $bb 'the crons build'
  $bs = Run 'build (the server)' 'npx esbuild server.ts --bundle --platform=node --format=cjs --packages=external --sourcemap --outfile=build/server.cjs'
  Must $bs 'the server build'
  $budget = Run 'the first screen''s size budget' 'node scripts/check-bundle-budget.mjs dist'
  Must $budget 'the size budget (the first screen must stay under 480 KB gzip)'

  # The perf lab (harness\perf-lab) must never ship. The Wrap-up round under
  # this one changed it, so this check matters.
  if (Test-Path 'dist\PERF-LAB-BUILD.txt') { Stop-Here 'dist\ is a perf lab build (PERF-LAB-BUILD.txt). It must never ship. Ask Claude.' }
  $labMarks = @('__perfLab', 'demo-perf-lab', '127.0.0.1:8085', '127.0.0.1:9099', 'connectFirestoreEmulator', 'connectAuthEmulator')
  $built = @(Get-ChildItem -Path 'dist' -Recurse -File -Include '*.js', '*.css', '*.html')
  if ($built.Count -eq 0) { Stop-Here 'dist\ holds no built files. Ask Claude.' }
  $found = @($built | Select-String -SimpleMatch -Pattern $labMarks -List)
  if ($found.Count -gt 0) {
    $found | Select-Object -First 10 | ForEach-Object { Log "   $($_.Path): $($_.Pattern)" 'Red' }
    Stop-Here 'the production build carries the perf lab''s emulator code. It must never ship. Ask Claude.'
  }
  Log "The perf lab's markers: none in the $($built.Count) built files." 'Green'

  Run-RulesTests 'Nothing is deployed or pushed.'

  Set-Content -Path $PreparedFile -Value "$BranchSha $MasterSha" -Encoding ascii
  Log "Tested: $Branch at $($BranchSha.Substring(0, 7)), master at $($MasterSha.Substring(0, 7))." 'Green'
  Log 'THE PLAN (golive, in this order, stopping at the first failure):' 'White'
  Log "  1. Tag master as it is now: $RestoreTag = $($MasterSha.Substring(0, 7)), and push the tag." 'White'
  Log "  2. npm run test:rules again, then npx firebase deploy --only firestore:rules --project $Project," 'White'
  Log "     then check the ruleset LIVE holds '$LiveRulesMark' (the plan's rules before the app)." 'White'
  Log '  (no index and no Cloud Function: neither changed)' 'White'
  Log "  3. git push origin ${Branch}:master (fast-forward only)." 'White'
  Log '  Then, by hand: Render (Manual Deploy on the web service, Manual Build on both crons), Strongsville''s' 'White'
  Log '  auto-renewal, the checks, the names, Round 63.' 'White'
  Log 'PREPARE PASSED. Next: powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-renewals-dashboard.ps1 -Stage golive' 'Green'
  exit 0
}

# ---- golive ------------------------------------------------------------------------
if (-not (Test-Path $PreparedFile)) { Stop-Here 'prepare has not passed on this PC. Run prepare first.' }
$prepared = ((Get-Content -Path $PreparedFile -Raw).Trim()) -split '\s+'
if ($prepared.Count -ne 2 -or $prepared[0] -ne $BranchSha) { Stop-Here "$Branch has changed since prepare passed, so this commit has not been tested. Run prepare again." }
if ($prepared[1] -ne $MasterSha) { Stop-Here "master has moved since prepare passed (tested against $($prepared[1].Substring(0, 7)), now $($MasterSha.Substring(0, 7))). Ask Claude." }
Log "prepare passed on this commit ($($BranchSha.Substring(0, 7))) onto this master ($($MasterSha.Substring(0, 7)))." 'Green'
# The rules deploy sends THIS folder's firestore.rules.
& git --no-optional-locks diff --quiet HEAD -- firestore.rules firestore.indexes.json functions
if ($LASTEXITCODE -ne 0) { Stop-Here 'firestore.rules, firestore.indexes.json or functions\ has uncommitted changes in this folder. Ask Claude.' }

Write-Host ''
Write-Host 'The renewals dashboard, with the Wrap-up fix under it:' -ForegroundColor Yellow
Write-Host '  each renewal row says the package and rate, when the commitment ends, the sessions left part by part,' -ForegroundColor Yellow
Write-Host '  what will be left at the end, who last talked, and the renewal plan; Renewal settings suggest matches' -ForegroundColor Yellow
Write-Host '  for the Mindbody names nobody has matched.' -ForegroundColor Yellow
Write-Host 'This tags the restore point, then:' -ForegroundColor Yellow
Write-Host '  deploys firestore.rules to PRODUCTION (after the rules tests pass again; they only ADD access),' -ForegroundColor Yellow
Write-Host '  checks they are LIVE, then pushes to master. On Render nothing happens until YOU press' -ForegroundColor Yellow
Write-Host '  Manual Deploy (web service) and Manual Build (both crons); golive prints the steps.' -ForegroundColor Yellow
Write-Host 'No index, no Cloud Function; nothing is asked of Mindbody; nothing contacts anyone.' -ForegroundColor Yellow
Write-Host ''
if ((Read-Host 'AJ: type GO to tag, deploy the rules and push') -ne 'GO') { Log 'Nothing tagged, deployed or pushed.' 'Yellow'; exit 0 }
Log 'AJ typed GO: the renewals dashboard.' 'White'

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

# 2. The rules: the tests again first (AJ's run counts), then the deploy,
#    then a check that what is LIVE holds the plan's rules. The app this push
#    brings writes the plan, and with the old rules every Save plan would be
#    refused. They only add access; the running app is unaffected.
Run-RulesTests 'Nothing is deployed or pushed (the restore tag is on GitHub, which is harmless).'
$rules = Run "deploy firestore.rules (project $Project)" "npx firebase deploy --only firestore:rules --project $Project"
if ($rules.Code -ne 0) { Stop-Here 'the rules deploy failed. The app is unchanged and nothing was pushed.' }
if (-not (@($rules.Output) -match 'released rules')) { Stop-Here 'the rules deploy did not say it released the rules. Nothing was pushed. Ask Claude before going on (Firebase console -> Firestore -> the named database -> Rules shows what is live).' }
$liveRules = Get-LiveRulesSource
if ($null -ne $liveRules) {
  if ($liveRules -notmatch [regex]::Escape($LiveRulesMark)) { Stop-Here "the ruleset live on the named database does not hold '$LiveRulesMark'. The rules may be deployed (they only add access); the app is unchanged and nothing was pushed. Ask Claude." }
  Log "The ruleset LIVE on $Db holds '$LiveRulesMark' (read from the Firebase Rules API)." 'Green'
} else {
  Log 'Could not read the live ruleset with gcloud. Check it by hand, now:' 'Yellow'
  Log '  Firebase console -> Firestore -> the named database (ai-studio-...) -> Rules: the newest release (today),' 'Yellow'
  Log "  Ctrl F  $LiveRulesMark  : it must be there." 'Yellow'
  if ((Read-Host "Type LIVE if the live rules hold $LiveRulesMark (Enter to stop here)") -ne 'LIVE') { Stop-Here 'the live rules were not confirmed. The rules are deployed (they only add access; the running app is unaffected); the app is unchanged and nothing was pushed. Run golive again once they are (ask Claude).' }
  Log "AJ confirmed: the live rules hold '$LiveRulesMark'." 'Green'
}

# 3. The push, fast-forward only (git refuses anything else without --force,
#    which this script never passes). Checked again against GitHub first.
& git fetch -q origin
if ($LASTEXITCODE -ne 0) { Stop-Here 'could not reach GitHub before the push. The rules are deployed (harmless); the app is unchanged. Run golive again once GitHub answers.' }
if ((& git --no-optional-locks rev-parse origin/master).Trim() -ne $MasterSha) { Stop-Here 'master moved while golive ran. The rules are deployed (harmless); the app is unchanged. Ask Claude.' }
& git --no-optional-locks merge-base --is-ancestor origin/master $Branch
if ($LASTEXITCODE -ne 0) { Stop-Here "$Branch no longer fast-forwards master. The rules are deployed (harmless); the app is unchanged. Ask Claude." }
$push = Run "git push origin ${Branch}:master" "git push origin ${Branch}:master"
Must $push 'the push. The rules are deployed (harmless); the app is unchanged'

$NewMaster = (& git --no-optional-locks rev-parse --short origin/master).Trim()
Log "PUSHED. master = $NewMaster. The app is NOT live yet: Render deploys nothing on a push." 'Green'
Log '' 'White'
Log 'NOW, BY HAND, in this order (docs\rounds\2026-10-07-renewals-dashboard.md):' 'White'
Log '1. Render -> maxstrength-app-beta -> Manual Deploy -> Deploy latest commit. Wait until it says Live' 'White'
Log "   on $NewMaster. Then check it: curl.exe -s https://maxstrength-app-beta.onrender.com/version.json" 'White'
Log '   (the version names the new build; if it still names the old one, wait a minute and ask again).' 'White'
Log '2. Render -> journey-cron-renewals -> Builds (or Settings) -> Manual Build, then the same on' 'White'
Log '   journey-cron-leaderboards. The renewals cron writes the new snapshot (version 3: the ledger, the' 'White'
Log '   projection, the rate, the signals); the other carries the Wrap-up fix''s machine totals read. Keep all three' 'White'
Log '   on one commit: each build''s log ends on the new commit. The renewals job runs at 2:30 AM Eastern.' 'White'
Log '3. Strongsville, TODAY, before that run: My Studio -> Studio -> Renewals -> Auto-renewal -> Off, and Save.' 'White'
Log '   ("strongsville does not autorenew".) The plan picker offers Renewing, same package / Upgrading /' 'White'
Log '   Downgrading / Pay as you go / Not renewing / Not decided yet from the night''s run after this. Mindbody''s' 'White'
Log '   own auto-renew flag on a contract, a trainer''s On auto-renewal box, or a package''s own Renews answer' 'White'
Log '   still wins over the studio''s for that client (renewals\auto-renew.ts); a paid-in-full client always gets' 'White'
Log '   the second list.' 'White'
Log '4. The iPads: each one picks the new version up by itself the next time it is on the Hub (never over a' 'White'
Log '   session or while typing). Front-desk computers: reload the page.' 'White'
Log '5. Before trusting two numbers, the round document''s checks (in Mindbody, reading only):' 'White'
Log '   a. A Strongsville regular with standing bookings: note a pricing option''s Remaining, book one more visit' 'White'
Log '      next week, look again. Went down by one: nothing to do. Did not: tell Claude (a switch flips).' 'White'
Log '   b. One contract client''s "48 Sessions w/ Roll Over" (or 144) option: its count against the payments made.' 'White'
Log '      8 a payment is the usual case; tell Claude if it is something else. Do this BEFORE Confirm all.' 'White'
Log '   c. One Solon and one Strongsville contract''s next scheduled charge: if it is the package price plus tax,' 'White'
Log '      tell Claude (every client there would read "(special)").' 'White'
Log '6. The names: Operations -> Clients -> Renewals says "44 names waiting" (or so) -> Review suggestions, or' 'White'
Log '   My Studio -> Studio -> Renewals. Read each suggestion; Confirm the right ones (or Confirm all), then' 'White'
Log '   Save settings. A name with no suggestion is matched by hand as before. The next morning the' 'White'
Log '   "Missing Mindbody data" number is lower.' 'White'
Log '7. The morning after the renewals job''s first run on the new commit: walk Round 63 of' 'White'
Log '   docs\ops\TESTING-CHECKLIST.md (the renewals dashboard) at Strongsville and at a studio with auto-renew,' 'White'
Log '   upright and on its side, and the Wrap-up round''s lines in Round 59 (they ship with this push).' 'White'
Log '   Until that run a row says "N left" and the charge date, with no "At the end": that is expected.' 'White'
Log '8. The round document''s open questions (7) are waiting for your answers; nothing is blocked on them.' 'White'
Log '' 'White'
Log 'TO UNDO (ask Claude first):' 'White'
Log "  git push --force origin ${RestoreTag}:master   then the same three Render buttons (steps 1 and 2)." 'White'
Log '  The rules can stay: they only add access, and the older app never writes a plan. Plans already saved' 'White'
Log '  stay on their cycle documents, unread, until this is shipped again. The older renewals job writes' 'White'
Log '  version-2 snapshots again the next night.' 'White'
$elapsed = [int]((Get-Date) - $Started).TotalMinutes
Log "Done in about $elapsed minute(s)." 'Green'
exit 0
