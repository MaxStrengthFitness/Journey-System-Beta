<#
 SCRIPT-VERSION: v1  (Oct 6 2026, the speed round)

 Ships branch oct5/speed: the speed round. AJ, Oct 5 2026: "yes lets do all
 recommended fixes, i need this app running optimally and not having long
 moments of stalling so users can flawlessly get the data they need".
 docs/rounds/2026-10-05-speed.md is the round; the plan is the blueprint page
 https://claude.ai/artifact/3BVGAvBj8ooWwMNhQ2tEtt. Seven groups' branches,
 each off master's c20d2abe (the machine menu, live), merged, then the bundle
 diet and the docs:

   - the boot: the trainer record first, the lists read together, Auth
     without the popup helper on a signed-in open, a first frame, the bell's
     small reads, the boot report (R4, R5, R14, R15, R16, R30);
   - the Hub: its own week, the day worked out only when something changed,
     memoised cards (R6a, R6, R7, R8, R16);
   - the session: Start, Discard, Back to Hub and the machine Save never wait
     on the network; the screen redraws only what changed (R9, R10, R11);
   - the profile and Operations: history read once, closed days kept, the
     night's month tally for Hours and Insights (R12, R26, R27);
   - 39 new Firestore indexes and a test that holds every query to one
     (R1, R2, R3, R24);
   - Cloud Functions: the webhook's claim with an expiry, the nightly trainer
     windows streamed, two parked notification functions deleted (R23, R25);
   - the server: drain on deploy, timeouts, one chart scan at a time, the
     error door capped, a missing file a 404 nobody caches (R18-R22, R33);
   - the bundle: the first screen 578 -> 457 KB gzip, with a budget (R13).

 WHAT GOES TO PRODUCTION, in this order (golive, after GO):
   1. the restore tag restore/2026-10-05-before-speed = master as it is now;
   2. the indexes (npx firebase deploy --only firestore:indexes --project
      prod --non-interactive, which never deletes an index);
   3. the rules tests again, then firestore.rules, ONLY if the rules changed
      (they do: the night's month tally is readable by leaders only);
   4. the two changed Cloud Functions, mindbodyWebhook and
      recalcTrainerWindows, named one by one (never a plain --only functions:
      that would also deploy the staff-photo pair, which is AJ's separate
      call, and ask about every deleted function); then the two retired
      functions, onBookingReminderWrite and sendDailySummary, are deleted
      with functions:delete (only those still deployed);
   5. git push origin oct5/speed:master, fast-forward only: Render deploys
      the app, the server and the crons. If the web service is linked to
      render.yaml as a Blueprint, the push also applies numInstances: 1,
      maxShutdownDelaySeconds: 120 and startCommand node build/server.cjs.
 No Mindbody call, timer or cadence changes; nothing contacts anyone.

 Run from the branch's own folder, .claude\worktrees\speed (it is on the
 branch already; do not switch branches by hand). IN ORDER:

   powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-speed.ps1 -Stage prepare
   powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-speed.ps1 -Stage golive

 prepare  changes nothing in production and nothing in git (it writes only
          logs\, dist\ and build\): the branch, a clean tree,
          the fetch, that master is EXACTLY c20d2abe (anything else: stop and
          ask Claude), that the branch fast-forwards master, what goes live,
          the Firebase login, the restore tag free, no Windows line ends, the
          case check, the typecheck COUNT (2), the suite in Eastern time, the
          functions typecheck and tests, the build (the app, the crons and
          the server) and the first screen's size budget, the rules tests,
          and that firestore.indexes.json parses with no field overrides. It
          records what it tested in logs\ship-speed.prepared. Ends PREPARE
          PASSED.

 golive   refuses unless the branch and master are exactly what prepare
          recorded, asks for GO, then does 1-5 above and stops at the first
          failure (each stop says what is already live). Then it prints
          what is left for AJ by hand: the indexes Enabled, the two TTL
          policies, Render's edge caching (only AFTER this deploy), the
          Render settings check, the Mindbody billing email (R29), the
          Gemini paid tier (R33), the iPad walk (Round 58), and recording
          Render's metrics for the R20 gate.

 To undo the app: push the restore tag to master (ask Claude). To undo the
 two functions: deploy them again from a checkout of the restore tag (ask
 Claude; golive prints the command). To undo the rules: deploy
 firestore.rules from the restore tag. The indexes need no undo.

 ASCII only on purpose (Windows PowerShell 5.1 reads a script as ANSI).
#>

param([Parameter(Mandatory = $true, Position = 0)][ValidateSet('prepare', 'golive')][string]$Stage)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $Root
$LogFile = Join-Path $Root 'logs\ship-speed.log'
# What prepare tested: "<branch sha> <origin/master sha>". golive reads it.
$PreparedFile = Join-Path $Root 'logs\ship-speed.prepared'
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $LogFile) | Out-Null
$Branch = 'oct5/speed'
$RestoreTag = 'restore/2026-10-05-before-speed'
# The machine menu, live when the round was built. Every group branched from
# it; master must be exactly this, or the round was not tested against it.
$MasterMustBe = 'c20d2abe'
# 2 since the Hub fixes (Oct 1): clinical-review/charts.tsx and
# EditTrainerModal.tsx. The speed round kept the same two. More is new.
$TscBaseline = 2
# The changed functions this round deploys, named one by one.
$DeployFunctions = 'functions:mindbodyWebhook,functions:recalcTrainerWindows'
# The retired functions (their exports are gone; a deploy does not delete them).
$RetiredFunctions = @('onBookingReminderWrite', 'sendDailySummary')
$FunctionsRegion = 'us-central1'
$Project = 'prod'
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

# A command whose questions must be seen and answered (the functions deploy
# can ask how long to keep container images): straight to the console, not
# captured, so nothing waits invisibly. Its output is not in the log.
function Run-Visible {
  param([string]$label, [string]$cmd)
  Log "--- $label (output on screen, not in the log) ---" 'Cyan'
  Log "> $cmd"
  & cmd /c $cmd
  $code = $LASTEXITCODE
  Log "$label exit code: $code" $(if ($code -eq 0) { 'Green' } else { 'Yellow' })
  return @{ Code = $code; Output = @() }
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

Log "ship-speed $Stage" 'White'

# The branch's own worktree folder (.claude\worktrees\speed), or the project
# folder if it is ever on the branch: either is a full checkout of Journey.
# Nothing here reads Firestore with a service account, so
# service-account.json is not needed (a worktree has no copy, on purpose).
$top = (& git --no-optional-locks rev-parse --show-toplevel 2>$null)
if ($LASTEXITCODE -ne 0 -or -not (Test-Path 'package.json') -or -not (Test-Path 'scripts\ship\ship-speed.ps1') -or ((Resolve-Path $top).Path -ne (Get-Location).Path)) { Stop-Here 'run this from the top of the branch''s folder, .claude\worktrees\speed.' }

# ---- in the branch's folder, on the branch ------------------------------------------
$head = (& git --no-optional-locks symbolic-ref --quiet --short HEAD)
if ($LASTEXITCODE -ne 0 -or "$head".Trim() -ne $Branch) { Stop-Here "this folder is on '$head', not $Branch. Run it from .claude\worktrees\speed, or ask Claude; do not switch branches by hand." }
$dirty = (& git --no-optional-locks status --porcelain --untracked-files=no -- src docs server server.ts scripts tests functions public index.html firestore.rules firestore.indexes.json firebase.json package.json package-lock.json vite.config.ts render.yaml CLAUDE.md ROADMAP.md) | Where-Object { $_ }
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
if ($LASTEXITCODE -ne 0) { Stop-Here "this checkout does not know $MasterMustBe (the machine menu). Ask Claude." }
$BranchSha = (& git --no-optional-locks rev-parse $Branch).Trim()
$MasterSha = (& git --no-optional-locks rev-parse origin/master).Trim()

if ($MasterSha -ne $MustBeSha) {
  Stop-Here "master is at $($MasterSha.Substring(0, 8)), not $MasterMustBe (the machine menu, which the speed round was built and tested on). Something else went live since. Ask Claude to bring it into $Branch first."
}
Log "master is at $MasterMustBe (the machine menu), as the round was built on." 'Green'

& git --no-optional-locks merge-base --is-ancestor origin/master $Branch
if ($LASTEXITCODE -ne 0) { Stop-Here "$Branch does not fast-forward master. Ask Claude." }

$ahead = (& git --no-optional-locks rev-list --count "origin/master..$Branch").Trim()
if ([int]$ahead -eq 0) { Log 'master already has everything on the branch. Nothing to ship.' 'Green'; exit 0 }
Log "$ahead commit(s) will go live (first-parent line below):" 'Green'
& git --no-optional-locks log --oneline --first-parent "origin/master..$Branch" | ForEach-Object { Log "   $_" }

# Whether firestore.rules changed decides golive's step 3.
& git --no-optional-locks diff --quiet origin/master $Branch -- firestore.rules
$RulesChanged = ($LASTEXITCODE -ne 0)

if ($Stage -eq 'prepare') {
  if (Test-Path $PreparedFile) { Remove-Item -Force $PreparedFile }

  Log 'firestore.indexes.json changes (golive deploys them FIRST, never deleting one):' 'Yellow'
  & git --no-optional-locks diff --stat origin/master $Branch -- firestore.indexes.json | ForEach-Object { Log "   $_" 'Yellow' }
  if ($RulesChanged) {
    Log 'firestore.rules changes (golive runs the rules tests again, then deploys them):' 'Yellow'
    & git --no-optional-locks diff --stat origin/master $Branch -- firestore.rules | ForEach-Object { Log "   $_" 'Yellow' }
  } else {
    Log 'firestore.rules: unchanged. golive deploys no rules.' 'Green'
  }
  Log "functions\ changes (golive deploys ONLY $DeployFunctions, and deletes $($RetiredFunctions -join ' and ')):" 'Yellow'
  & git --no-optional-locks diff --stat origin/master $Branch -- functions | ForEach-Object { Log "   $_" 'Yellow' }
  # Any line naming a retired function that is not a comment means the code
  # may still use it, and golive would delete a function the code wants.
  foreach ($fn in $RetiredFunctions) {
    $still = Select-String -Path 'functions\src\*.ts', 'functions\src\*\*.ts' -Pattern "^(?>\s*)(?!\*|//|/\*).*\b$fn\b" -ErrorAction SilentlyContinue
    if ($still) {
      $still | ForEach-Object { Log "   $($_.Path):$($_.LineNumber): $($_.Line.Trim())" 'Red' }
      Stop-Here "functions\src still names $fn outside a comment, and golive would delete it. Ask Claude."
    }
  }
  Log "functions\src no longer exports $($RetiredFunctions -join ' or ')." 'Green'
  Log 'server, render.yaml and index.html changes (Render deploys them with the push):' 'Yellow'
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

  # firestore.indexes.json must parse, and hold no field overrides (the
  # Enterprise edition refuses them and the deploy would stop half way).
  try {
    $ixJson = Get-Content -Path 'firestore.indexes.json' -Raw | ConvertFrom-Json
  } catch {
    Stop-Here "firestore.indexes.json does not parse: $($_.Exception.Message)"
  }
  $ixCount = @($ixJson.indexes).Count
  $ixOverrides = @($ixJson.fieldOverrides | Where-Object { $_ }).Count
  Log "firestore.indexes.json: $ixCount composite indexes, $ixOverrides field overrides." $(if ($ixOverrides -eq 0 -and $ixCount -gt 0) { 'Green' } else { 'Red' })
  if ($ixCount -eq 0) { Stop-Here 'firestore.indexes.json holds no indexes. Ask Claude.' }
  if ($ixOverrides -gt 0) { Stop-Here 'firestore.indexes.json has field overrides, which the Enterprise edition refuses (the deploy would stop half way). Ask Claude.' }

  $tsc = Run 'typecheck' 'npx tsc --noEmit'
  $errs = @($tsc.Output | Where-Object { "$_" -match 'error TS' }).Count
  Log "tsc errors: $errs (baseline $TscBaseline)" $(if ($errs -le $TscBaseline) { 'Green' } else { 'Red' })
  if ($errs -gt $TscBaseline) { Stop-Here 'more typecheck errors than the baseline.' }

  $env:TZ = 'America/New_York'
  # A longer per-test limit: a few file-walking style tests can pass vitest's
  # default 5 s on a loaded PC, and a timeout is not a failure of the app.
  $vt = Run 'the suite (TZ=America/New_York)' 'npx vitest run --dir src --testTimeout=30000'
  Must $vt 'the test suite'

  # The functions golive deploys: their own typecheck and tests.
  $ftc = Run 'the functions typecheck' 'cd functions && npx tsc --noEmit -p .'
  Must $ftc 'the functions typecheck'
  $ft = Run 'the functions tests (TZ=America/New_York)' 'npx vitest run --dir functions/src'
  Must $ft 'the functions tests'

  # A production build: NODE_ENV unset (a "test" build ships React's
  # development files, and the budget refuses it).
  Remove-Item Env:NODE_ENV -ErrorAction SilentlyContinue
  $bd = Run 'build (the app)' 'npx vite build'
  Must $bd 'the app build'
  $bb = Run 'build (the crons)' 'npm run build:backend'
  Must $bb 'the crons build'
  $bs = Run 'build (the server)' 'npx esbuild server.ts --bundle --platform=node --format=cjs --packages=external --sourcemap --outfile=build/server.cjs'
  Must $bs 'the server build'
  $budget = Run 'the first screen''s size budget' 'node scripts/check-bundle-budget.mjs dist'
  Must $budget 'the size budget (the first screen must stay under 480 KB gzip)'

  Run-RulesTests 'Nothing is deployed or pushed.'

  Set-Content -Path $PreparedFile -Value "$BranchSha $MasterSha" -Encoding ascii
  Log "Tested: $Branch at $($BranchSha.Substring(0, 7)), master at $($MasterSha.Substring(0, 7))." 'Green'
  Log 'THE PLAN (golive, in this order, stopping at the first failure):' 'White'
  Log "  1. Tag master as it is now: $RestoreTag = $($MasterSha.Substring(0, 7)), and push the tag." 'White'
  Log "  2. npx firebase deploy --only firestore:indexes --project $Project --non-interactive (never deletes an index)." 'White'
  if ($RulesChanged) {
    Log "  3. npm run test:rules again, then npx firebase deploy --only firestore:rules --project $Project." 'White'
  } else {
    Log '  3. (no rules change: skipped)' 'White'
  }
  Log "  4. npx firebase deploy --only $DeployFunctions --project $Project" 'White'
  Log "     then npx firebase functions:delete $($RetiredFunctions -join ' ') --region $FunctionsRegion --force --project $Project (those still deployed)." 'White'
  Log "  5. git push origin ${Branch}:master (fast-forward only). Render deploys the app, the server and the crons." 'White'
  Log 'PREPARE PASSED. Next: powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-speed.ps1 -Stage golive' 'Green'
  exit 0
}

# ---- golive ------------------------------------------------------------------------
if (-not (Test-Path $PreparedFile)) { Stop-Here 'prepare has not passed on this PC. Run prepare first.' }
$prepared = ((Get-Content -Path $PreparedFile -Raw).Trim()) -split '\s+'
if ($prepared.Count -ne 2 -or $prepared[0] -ne $BranchSha) { Stop-Here "$Branch has changed since prepare passed, so this commit has not been tested. Run prepare again." }
if ($prepared[1] -ne $MasterSha) { Stop-Here "master has moved since prepare passed (tested against $($prepared[1].Substring(0, 7)), now $($MasterSha.Substring(0, 7))). Ask Claude." }
Log "prepare passed on this commit ($($BranchSha.Substring(0, 7))) onto this master ($($MasterSha.Substring(0, 7)))." 'Green'
# The functions deploy builds functions\ from THIS folder.
& git --no-optional-locks diff --quiet HEAD -- functions
if ($LASTEXITCODE -ne 0) { Stop-Here 'there are uncommitted changes under functions\, and they would deploy. Ask Claude.' }

Write-Host ''
Write-Host 'This tags the restore point, then deploys to PRODUCTION, in order:' -ForegroundColor Yellow
Write-Host '  the new Firestore indexes (they build in the background; nothing waits on them),' -ForegroundColor Yellow
if ($RulesChanged) { Write-Host '  firestore.rules (after the rules tests pass again),' -ForegroundColor Yellow }
Write-Host '  the Cloud Functions mindbodyWebhook and recalcTrainerWindows,' -ForegroundColor Yellow
Write-Host '  deletes onBookingReminderWrite and sendDailySummary,' -ForegroundColor Yellow
Write-Host '  then pushes to master, which deploys the app, the server and the crons on Render.' -ForegroundColor Yellow
Write-Host 'Nothing is asked of or written to Mindbody; nothing contacts anyone.' -ForegroundColor Yellow
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

# 2. The indexes. They build in the background (minutes to an hour on the
#    big collections); until each is Enabled its query scans exactly as it
#    does today, so nothing breaks meanwhile. --non-interactive: an index in
#    production that is not in the file is left alone, never deleted.
$idx = Run "deploy firestore.indexes.json (project $Project)" "npx firebase deploy --only firestore:indexes --project $Project --non-interactive"
if ($idx.Code -ne 0) { Stop-Here 'the index deploy failed. The live app, its rules and its functions are unchanged and nothing was pushed.' }
Log 'Indexes deployed to production (they finish building by themselves).' 'Green'

# 3. The rules, only if they changed: the tests again first (AJ's run counts).
if ($RulesChanged) {
  Run-RulesTests 'The indexes are deployed (harmless); the rules, the functions and the app are unchanged and nothing was pushed.'
  $rules = Run "deploy firestore.rules (project $Project)" "npx firebase deploy --only firestore:rules --project $Project"
  if ($rules.Code -ne 0) { Stop-Here 'the rules deploy failed. The indexes are deployed (harmless); the functions and the app are unchanged and nothing was pushed.' }
  Log 'Rules deployed to production (they only narrow who reads two documents that do not exist yet).' 'Green'
} else {
  Log 'firestore.rules unchanged: no rules deploy.' 'Green'
}

# 4. The two changed functions, by name, then the two retired ones.
$fd = Run-Visible 'deploy the changed functions' "npx firebase deploy --only $DeployFunctions --project $Project"
if ($fd.Code -ne 0) { Stop-Here 'the functions deploy failed. The indexes and rules are deployed; the app is unchanged and nothing was pushed. Run golive again once it is fixed (ask Claude).' }
Log "Deployed: $DeployFunctions" 'Green'

$fl = Run 'list the deployed functions' "npx firebase functions:list --project $Project"
if ($fl.Code -ne 0) { Stop-Here 'could not list the deployed functions. The indexes, rules and the two functions are deployed; the app is unchanged and nothing was pushed. Ask Claude.' }
$toDelete = @($RetiredFunctions | Where-Object { $name = $_; @($fl.Output | Where-Object { "$_" -match "\b$name\b" }).Count -gt 0 })
if ($toDelete.Count -gt 0) {
  $del = Run 'delete the retired functions' "npx firebase functions:delete $($toDelete -join ' ') --region $FunctionsRegion --force --project $Project"
  if ($del.Code -ne 0) { Stop-Here "deleting $($toDelete -join ' and ') failed. The indexes, rules and the two functions are deployed; the app is unchanged and nothing was pushed. Ask Claude." }
  Log "Deleted: $($toDelete -join ', ')" 'Green'
} else {
  Log "$($RetiredFunctions -join ' and ') are not deployed (already gone): nothing to delete." 'Green'
}

# 5. The push, fast-forward only (git refuses anything else without --force,
#    which this script never passes). Checked again against GitHub first.
& git fetch -q origin
if ($LASTEXITCODE -ne 0) { Stop-Here 'could not reach GitHub before the push. The indexes, rules and functions are deployed; the app is unchanged. Run golive again once GitHub answers.' }
if ((& git --no-optional-locks rev-parse origin/master).Trim() -ne $MasterSha) { Stop-Here 'master moved while golive ran. The indexes, rules and functions are deployed; the app is unchanged. Ask Claude.' }
& git --no-optional-locks merge-base --is-ancestor origin/master $Branch
if ($LASTEXITCODE -ne 0) { Stop-Here "$Branch no longer fast-forwards master. The indexes, rules and functions are deployed; the app is unchanged. Ask Claude." }
$push = Run "git push origin ${Branch}:master" "git push origin ${Branch}:master"
Must $push 'the push (Render deploys from it). The indexes, rules and functions are deployed; the app is unchanged'

$Db = 'ai-studio-32cbbdcc-6e08-4770-9665-867c68878efa'
$GcpProject = 'gen-lang-client-0731527386'
Log "GOLIVE COMPLETE. master = $((& git --no-optional-locks rev-parse --short origin/master).Trim())." 'Green'
Log 'When Render shows the deploy Live, reload Journey on every iPad and front-desk computer' 'Green'
Log '(an iPad in a session picks the new version up on the Hub afterwards, by itself).' 'Green'
Log '' 'White'
Log 'NOW, BY HAND, in this order (docs\rounds\2026-10-05-speed.md, "For AJ"):' 'White'
Log '1. Firebase console -> Firestore -> the named database -> Indexes: wait until every new index says Enabled' 'White'
Log '   (minutes to an hour on exerciseLogs, sessions and journalEntries). Queries work meanwhile.' 'White'
Log '2. The TTL policies on the webhook''s logs, in PowerShell (gcloud signed in as you):' 'White'
Log "   gcloud firestore fields ttls update expiresAt --collection-group=mindbodyEventLog --enable-ttl --database=$Db --project=$GcpProject" 'White'
Log "   gcloud firestore fields ttls update expiresAt --collection-group=mindbodyBookingCancels --enable-ttl --database=$Db --project=$GcpProject" 'White'
Log "   gcloud firestore fields ttls list --database=$Db --project=$GcpProject   (each CREATING, then ACTIVE)" 'White'
Log '   From then on NEVER deploy indexes with --force: firestore.indexes.json does not hold these two TTL policies,' 'White'
Log '   and --force deletes them. The index deploy''s note about "2 field overrides ... not present" is expected.' 'White'
Log '3. Render edge caching, ONLY NOW that this deploy is Live (the 404 no-store fix must be live first):' 'White'
Log '   Render -> maxstrength-app-beta -> Settings -> Networking -> Edge Caching -> Edit -> "Common static files" -> Save.' 'White'
Log '   Then twice: curl.exe -sI https://maxstrength-app-beta.onrender.com/assets/<a .js file from the page source>' 'White'
Log '   The second answer says cf-cache-status: HIT. That is R20''s first gate.' 'White'
Log '   Then twice each: curl.exe -sI https://maxstrength-app-beta.onrender.com/version.json  and the same for  /' 'White'
Log '   Neither may ever say cf-cache-status: HIT, and version.json must say Cache-Control: no-store' 'White'
Log '   (iPads notice a new version through it). If either is a HIT, turn Edge Caching off and tell Claude.' 'White'
Log '4. Render -> maxstrength-app-beta -> Settings: Start Command = node build/server.cjs, Max shutdown delay = 120 s,' 'White'
Log '   Instances = 1 (set them there if the service is not synced from render.yaml). The deploy''s Logs should show the OLD' 'White'
Log '   instance say "SIGTERM: no new connections; letting running requests finish." If that never appears, tell Claude.' 'White'
Log '5. Render -> Logs, search  type: ''boot''  : one line per cold open (auth-ready, trainer-ready, hub-data, standalone, userAgent).' 'White'
Log '6. R29: send Mindbody the billing question (docs\rounds\2026-09-26-cost-plan.md, the invoice paragraph). Its answer goes in docs\business\running-costs.md.' 'White'
Log '7. R33: Google AI Studio or Cloud console -> Billing: the project that owns GEMINI_API_KEY is on the paid tier, billing on.' 'White'
Log '8. Walk Round 58 of docs\ops\TESTING-CHECKLIST.md on an iPad, sign-in first (Google and Microsoft, tab and Home Screen app).' 'White'
Log '9. For the R20 gate (the $18 a month cut), record Render -> Metrics -> Memory and CPU in 14-day windows (Pro keeps 14 days):' 'White'
Log '   screenshot each window''s peak and p95 before it ages out. Two windows in a row with a deploy and a chart-import evening,' 'White'
Log '   memory p95 under 300 MB and CPU under 70% in the deploy window, then ask Claude to change the plan (your approval).' 'White'
Log '10. R30: Query insights a day after the indexes (no scans on the session and profile path), Cloud Logging for' 'White'
Log '   recalcTrainerWindows (succeeds, how long, peak memory), budget alerts at $25 / $50 / $100, and confirm the' 'White'
Log '   gcf-artifacts repository has a cleanup policy (the functions deploy asks for one if it has none).' 'White'
Log '' 'White'
Log "TO UNDO the app: push $RestoreTag to master (ask Claude). TO UNDO the two functions: from a checkout of $RestoreTag" 'White'
Log "(ask Claude to make one), npx firebase deploy --only $DeployFunctions --project $Project. The rules: deploy" 'White'
Log 'firestore.rules from the same checkout. The indexes need no undo.' 'White'
$elapsed = [int]((Get-Date) - $Started).TotalMinutes
Log "Done in about $elapsed minute(s)." 'Green'
exit 0
