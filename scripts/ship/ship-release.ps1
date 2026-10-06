<#
 SCRIPT-VERSION: v1  (Oct 6 2026, the release: the speed round, the iPad round and the roster split)

 Ships branch oct6/release: everything since the machine menu, together.
 AJ, Oct 6 2026: "we will ship everything together", and "yes" to the roster
 split (his explicit OK to the Firestore structure change, CLAUDE.md: "Don't
 change ... the Firestore structure without an explicit OK"). It replaces
 ship-speed.ps1, ship-ipad.ps1 and ship-ipad-roster.ps1, which would refuse
 anyway (their master checks no longer match). The branch, in order:

   - oct5/speed (3735f38e), the speed round (docs/rounds/2026-10-05-speed.md):
     the boot, the Hub, the session, the profile and Operations, 39 new
     Firestore indexes, the webhook's claim and the trainer windows streamed
     (two Cloud Functions), two parked functions deleted, the server's drain
     and timeouts, the bundle diet with its budget;
   - oct6/ipad (5db7fed1), the iPad round (docs/rounds/2026-10-06-ipad.md):
     the perf lab (it NEVER ships), the CPU group, the paint group;
   - oct6/ipad-data (45b6d08e), the roster split: each client's
     currentMachineMetrics, machineStats and machineStatsBackfilledAt move to
     clients/{id}/machineTotals/current, with new rules for that document;
   - oct6/ipad-floor, the floor group: the session's reads no longer reopen
     on every roster change, the Wrap-up's confetti and cards in CSS, the
     Journey grid's older columns dimmed without opacity, a set no longer
     re-laying the grid, the Staircase drawn once; and the review's fixes.

 WHAT GOES TO PRODUCTION, in this order (golive, after GO):
   1. the restore tag restore/2026-10-06-before-release = master as it is
      now (c20d2abe), pushed to GitHub;
   2. the indexes (npx firebase deploy --only firestore:indexes --project
      prod --non-interactive, which never deletes an index; never --force);
   3. the rules tests again, then firestore.rules (they ADD the new
      document's access, refuse an old iPad's backfill marker on a client,
      and narrow who reads the night's month tally); then a check that the
      ruleset now LIVE holds "machineTotals". The roster split's rules MUST
      be live before the app: with the old rules the new app's Finish would
      save the counters but lose that session's machine maps;
   4. the changed Cloud Functions, named one by one: mindbodyWebhook and
      recalcTrainerWindows (never a plain --only functions: that would also
      deploy the staff-photo pair, which is AJ's separate call); then
      onBookingReminderWrite and sendDailySummary are deleted with
      functions:delete (only those still deployed);
   5. git fetch again, master must not have moved, then
      git push origin oct6/release:master, fast-forward only: Render deploys
      the app and the server, and both crons rebuild from master.
 NOTHING ON THE CLIENT DOCUMENTS MOVES YET: the app reads both places. The
 migration (scripts/split-client-metrics.ts) is AJ's to run THE NEXT
 MORNING, once every iPad has been back on the Hub; golive prints it.
 No Mindbody call, timer or cadence changes; nothing contacts anyone.

 Run from the branch's own folder, .claude\worktrees\release (it is on the
 branch already; do not switch branches by hand). IN ORDER:

   powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-release.ps1 -Stage prepare
   powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-release.ps1 -Stage golive

 prepare  changes nothing in production and nothing in git (it writes only
          logs\, dist\ and build\): the branch, a clean tree, the fetch,
          that master is EXACTLY c20d2abe (anything else: stop and ask
          Claude), that the branch fast-forwards master, what goes live
          (indexes, rules, functions, server, render.yaml, index.html), the
          Firebase login, the restore tag free, no Windows line ends, the
          case check, that firestore.indexes.json parses with no field
          overrides, that firestore.rules holds the new document's rules,
          the typecheck COUNT (2), the suite in Eastern time, the functions
          typecheck and tests, the builds (the app, the crons and the
          server), the first screen's size budget, none of the perf lab's
          markers in the build, and the rules tests. It records what it
          tested in logs\ship-release.prepared. Ends PREPARE PASSED.

 golive   refuses unless the branch and master are exactly what prepare
          recorded, refuses uncommitted changes under functions\ or in
          firestore.rules, asks for GO (AJ's OK to the structure change
          included), then does 1-5 above and stops at the first failure
          (each stop says what is already live). Then it prints what is
          left for AJ by hand, the migration last.

 To undo: golive prints the exact order. In short: copy the machine maps
 back (scripts/unsplit-client-metrics.ts) while this app is live, push the
 restore tag to master, and last redeploy the two functions and the rules
 from a checkout of the restore tag. The indexes need no undo.

 ASCII only on purpose (Windows PowerShell 5.1 reads a script as ANSI).
#>

param([Parameter(Mandatory = $true, Position = 0)][ValidateSet('prepare', 'golive')][string]$Stage)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $Root
$LogFile = Join-Path $Root 'logs\ship-release.log'
# What prepare tested: "<branch sha> <origin/master sha>". golive reads it.
$PreparedFile = Join-Path $Root 'logs\ship-release.prepared'
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $LogFile) | Out-Null
$Branch = 'oct6/release'
$Folder = '.claude\worktrees\release'
$RestoreTag = 'restore/2026-10-06-before-release'
# The machine menu, live when the speed round was built. Every branch in this
# release grew from it; master must be exactly this, or the release was not
# tested against what is live.
$MasterMustBe = 'c20d2abe'
# 2 since the Hub fixes (Oct 1): clinical-review/charts.tsx and
# EditTrainerModal.tsx. The release keeps the same two. More is new.
$TscBaseline = 2
# The changed functions this release deploys, named one by one.
$DeployFunctions = 'functions:mindbodyWebhook,functions:recalcTrainerWindows'
# The files under functions\src (tests aside) whose change those two cover,
# plus staffImage.ts (the staff-photo pair: changed, NOT deployed, AJ's call)
# and index.ts (the two retired exports removed). Any other changed file
# means a function this script does not name: it stops rather than guess.
$KnownFunctionFiles = @(
  'functions/src/index.ts',
  'functions/src/mindbody/index.ts',
  'functions/src/mindbody/idempotency.ts',
  'functions/src/mindbody/retryLedger.ts',
  'functions/src/mindbody/staffResolver.ts',
  'functions/src/mindbody/staffImage.ts',
  'functions/src/trainerRollups.ts'
)
# The retired functions (their exports are gone; a deploy does not delete them).
$RetiredFunctions = @('onBookingReminderWrite', 'sendDailySummary')
$FunctionsRegion = 'us-central1'
$Project = 'prod'
$GcpProject = 'gen-lang-client-0731527386'
$Db = 'ai-studio-32cbbdcc-6e08-4770-9665-867c68878efa'
# The roster split's new document, which must be in the rules deployed...
$RulesMark = 'match /clients/{clientId}/machineTotals/{docId}'
# ...and in the ruleset that is live afterwards.
$LiveRulesMark = 'machineTotals'
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

Log "ship-release $Stage" 'White'

# The branch's own worktree folder (.claude\worktrees\release). Nothing here
# reads Firestore with a service account, so service-account.json is not
# needed (a worktree has no copy, on purpose); golive only says where it is
# for the migration AJ runs later.
$top = (& git --no-optional-locks rev-parse --show-toplevel 2>$null)
if ($LASTEXITCODE -ne 0 -or -not (Test-Path 'package.json') -or -not (Test-Path 'scripts\ship\ship-release.ps1') -or ((Resolve-Path $top).Path -ne (Get-Location).Path)) { Stop-Here "run this from the top of the branch's folder, $Folder." }
foreach ($f in @('scripts\split-client-metrics.ts', 'scripts\unsplit-client-metrics.ts', 'src\features\machine-totals\totals.ts', 'scripts\check-bundle-budget.mjs')) {
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
if ($LASTEXITCODE -ne 0) { Stop-Here "this checkout does not know $MasterMustBe (the machine menu). Ask Claude." }
$BranchSha = (& git --no-optional-locks rev-parse $Branch).Trim()
$MasterSha = (& git --no-optional-locks rev-parse origin/master).Trim()

if ($MasterSha -ne $MustBeSha) {
  Stop-Here "master is at $($MasterSha.Substring(0, 8)), not $MasterMustBe (the machine menu, which this release was built and tested on). Something else went live since. Ask Claude to bring it into $Branch first."
}
Log "master is at $MasterMustBe (the machine menu), as the release was built on." 'Green'

& git --no-optional-locks merge-base --is-ancestor origin/master $Branch
if ($LASTEXITCODE -ne 0) { Stop-Here "$Branch does not fast-forward master. Ask Claude." }

$ahead = (& git --no-optional-locks rev-list --count "origin/master..$Branch").Trim()
if ([int]$ahead -eq 0) { Log 'master already has everything on the branch. Nothing to ship.' 'Green'; exit 0 }
Log "$ahead commit(s) will go live (first-parent line below):" 'Green'
& git --no-optional-locks log --oneline --first-parent "origin/master..$Branch" | ForEach-Object { Log "   $_" }

# The roster split needs its rules: they must have changed, and hold the new
# document. Its rules go live before the app (golive step 3).
& git --no-optional-locks diff --quiet origin/master $Branch -- firestore.rules
if ($LASTEXITCODE -eq 0) { Stop-Here 'firestore.rules is the same as master''s, but the roster split needs its new rules. Ask Claude.' }
if (-not (Select-String -Path 'firestore.rules' -SimpleMatch -Pattern $RulesMark -Quiet)) { Stop-Here "firestore.rules does not hold '$RulesMark'. Ask Claude." }

# Exactly the changed functions: every changed file under functions\src
# (tests aside) must be one the named functions cover.
$changedFn = @(& git --no-optional-locks diff --name-only origin/master $Branch -- functions/src | Where-Object { $_ -and ($_ -notmatch '\.test\.ts$') })
$unknownFn = @($changedFn | Where-Object { $KnownFunctionFiles -notcontains $_ })
if ($unknownFn.Count -gt 0) {
  $unknownFn | ForEach-Object { Log "   $_" 'Red' }
  Stop-Here "functions\src changed in a file this script does not map to $DeployFunctions. Ask Claude (never a plain --only functions)."
}
& git --no-optional-locks diff --quiet origin/master $Branch -- functions/package.json functions/package-lock.json functions/tsconfig.json
if ($LASTEXITCODE -ne 0) { Stop-Here 'functions\package.json, its lock or its tsconfig changed, which would change every function. Ask Claude.' }

if ($Stage -eq 'prepare') {
  if (Test-Path $PreparedFile) { Remove-Item -Force $PreparedFile }

  Log 'firestore.indexes.json changes (golive deploys them FIRST, never deleting one):' 'Yellow'
  & git --no-optional-locks diff --stat origin/master $Branch -- firestore.indexes.json | ForEach-Object { Log "   $_" 'Yellow' }
  Log 'firestore.rules changes (golive runs the rules tests again, deploys them, and checks they are live, BEFORE the push):' 'Yellow'
  & git --no-optional-locks diff --stat origin/master $Branch -- firestore.rules | ForEach-Object { Log "   $_" 'Yellow' }
  Log "functions\ changes (golive deploys ONLY $DeployFunctions, and deletes $($RetiredFunctions -join ' and ')):" 'Yellow'
  & git --no-optional-locks diff --stat origin/master $Branch -- functions | ForEach-Object { Log "   $_" 'Yellow' }
  Log '   (staffImage.ts changed too: the staff-photo pair is NOT deployed, AJ''s separate call.)' 'Yellow'
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
  Log 'scripts changes (the crons build from server\; the scripts are run by hand):' 'Yellow'
  & git --no-optional-locks diff --stat origin/master $Branch -- scripts | Select-Object -Last 1 | ForEach-Object { Log "   $_" 'Yellow' }

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
  Log "firestore.rules holds the roster split's document ('$RulesMark')." 'Green'

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

  # The functions golive deploys: their own typecheck and tests.
  $ftc = Run 'the functions typecheck' 'cd functions && npx tsc --noEmit -p .'
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

  # The perf lab (harness\perf-lab) must never ship.
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
  Log "  2. npx firebase deploy --only firestore:indexes --project $Project --non-interactive (never deletes an index)." 'White'
  Log "  3. npm run test:rules again, then npx firebase deploy --only firestore:rules --project $Project," 'White'
  Log "     then check the ruleset LIVE holds '$LiveRulesMark' (the roster split's rules before the app)." 'White'
  Log "  4. npx firebase deploy --only $DeployFunctions --project $Project" 'White'
  Log "     then npx firebase functions:delete $($RetiredFunctions -join ' ') --region $FunctionsRegion --force --project $Project (those still deployed)." 'White'
  Log "  5. git push origin ${Branch}:master (fast-forward only). Render deploys the app and the server; both crons rebuild." 'White'
  Log '  Then: your steps by hand, the roster migration THE NEXT MORNING.' 'White'
  Log 'PREPARE PASSED. Next: powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-release.ps1 -Stage golive' 'Green'
  exit 0
}

# ---- golive ------------------------------------------------------------------------
if (-not (Test-Path $PreparedFile)) { Stop-Here 'prepare has not passed on this PC. Run prepare first.' }
$prepared = ((Get-Content -Path $PreparedFile -Raw).Trim()) -split '\s+'
if ($prepared.Count -ne 2 -or $prepared[0] -ne $BranchSha) { Stop-Here "$Branch has changed since prepare passed, so this commit has not been tested. Run prepare again." }
if ($prepared[1] -ne $MasterSha) { Stop-Here "master has moved since prepare passed (tested against $($prepared[1].Substring(0, 7)), now $($MasterSha.Substring(0, 7))). Ask Claude." }
Log "prepare passed on this commit ($($BranchSha.Substring(0, 7))) onto this master ($($MasterSha.Substring(0, 7)))." 'Green'
# The functions deploy builds functions\ from THIS folder, and the rules
# deploy sends THIS folder's firestore.rules.
& git --no-optional-locks diff --quiet HEAD -- functions
if ($LASTEXITCODE -ne 0) { Stop-Here 'there are uncommitted changes under functions\, and they would deploy. Ask Claude.' }
& git --no-optional-locks diff --quiet HEAD -- firestore.rules firestore.indexes.json
if ($LASTEXITCODE -ne 0) { Stop-Here 'firestore.rules or firestore.indexes.json has uncommitted changes in this folder, and they would deploy. Ask Claude.' }

Write-Host ''
Write-Host '*** THIS RELEASE CARRIES A FIRESTORE STRUCTURE CHANGE (the roster split) ***' -ForegroundColor Red
Write-Host 'Three fields leave every client document and go to clients/{id}/machineTotals/current:' -ForegroundColor Yellow
Write-Host '  currentMachineMetrics, machineStats, machineStatsBackfilledAt.' -ForegroundColor Yellow
Write-Host 'Nothing on the client documents moves until YOU run the migration it prints at the end (the next morning).' -ForegroundColor Yellow
Write-Host ''
Write-Host 'This tags the restore point, then deploys to PRODUCTION, in order:' -ForegroundColor Yellow
Write-Host '  the new Firestore indexes (they build in the background; nothing waits on them),' -ForegroundColor Yellow
Write-Host '  firestore.rules (after the rules tests pass again), checked LIVE before anything else,' -ForegroundColor Yellow
Write-Host '  the Cloud Functions mindbodyWebhook and recalcTrainerWindows,' -ForegroundColor Yellow
Write-Host '  deletes onBookingReminderWrite and sendDailySummary,' -ForegroundColor Yellow
Write-Host '  then pushes to master, which deploys the app and the server on Render (the crons rebuild).' -ForegroundColor Yellow
Write-Host 'Nothing is asked of or written to Mindbody; nothing contacts anyone.' -ForegroundColor Yellow
Write-Host ''
Write-Host 'CLAUDE.md: "Don''t change ... the Firestore structure without an explicit OK." You gave it on Oct 6 2026.' -ForegroundColor Red
if ((Read-Host 'AJ: type GO to tag, deploy and push (your OK to the structure change included)') -ne 'GO') { Log 'Nothing tagged, deployed or pushed.' 'Yellow'; exit 0 }
Log 'AJ typed GO: the release, with his OK to the Firestore structure change (the roster split).' 'White'

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
#    production that is not in the file is left alone, never deleted. Never
#    --force (it would delete the two TTL policies once they exist).
$idx = Run "deploy firestore.indexes.json (project $Project)" "npx firebase deploy --only firestore:indexes --project $Project --non-interactive"
if ($idx.Code -ne 0) { Stop-Here 'the index deploy failed. The live app, its rules and its functions are unchanged and nothing was pushed.' }
Log 'Indexes deployed to production (they finish building by themselves).' 'Green'

# 3. The rules: the tests again first (AJ's run counts), then the deploy,
#    then a check that what is LIVE holds the roster split's document. The
#    app this push brings writes that document, and with the old rules its
#    Finish would save the counters but lose that session's machine maps
#    (docs\KNOWN-TRAPS.md). They only add access; the running app is unaffected.
Run-RulesTests 'The indexes are deployed (harmless); the rules, the functions and the app are unchanged and nothing was pushed.'
$rules = Run "deploy firestore.rules (project $Project)" "npx firebase deploy --only firestore:rules --project $Project"
if ($rules.Code -ne 0) { Stop-Here 'the rules deploy failed. The indexes are deployed (harmless); the functions and the app are unchanged and nothing was pushed.' }
if (-not (@($rules.Output) -match 'released rules')) { Stop-Here 'the rules deploy did not say it released the rules. The indexes are deployed (harmless); nothing was pushed. Ask Claude before going on (Firebase console -> Firestore -> the named database -> Rules shows what is live).' }
$liveRules = Get-LiveRulesSource
if ($null -ne $liveRules) {
  if ($liveRules -notmatch [regex]::Escape($LiveRulesMark)) { Stop-Here "the ruleset live on the named database does not hold '$LiveRulesMark'. The indexes and possibly the rules are deployed; the functions and the app are unchanged and nothing was pushed. Ask Claude." }
  Log "The ruleset LIVE on $Db holds '$LiveRulesMark' (read from the Firebase Rules API)." 'Green'
} else {
  Log 'Could not read the live ruleset with gcloud. Check it by hand, now:' 'Yellow'
  Log '  Firebase console -> Firestore -> the named database (ai-studio-...) -> Rules: the newest release (today),' 'Yellow'
  Log "  Ctrl F  $LiveRulesMark  : it must be there." 'Yellow'
  if ((Read-Host "Type LIVE if the live rules hold $LiveRulesMark (Enter to stop here)") -ne 'LIVE') { Stop-Here 'the live rules were not confirmed. The indexes and rules are deployed (they only add access; the running app is unaffected); the functions and the app are unchanged and nothing was pushed. Run golive again once they are (ask Claude).' }
  Log "AJ confirmed: the live rules hold '$LiveRulesMark'." 'Green'
}

# 4. The two changed functions, by name, then the two retired ones.
$fd = Run-Visible 'deploy the changed functions' "npx firebase deploy --only $DeployFunctions --project $Project"
if ($fd.Code -ne 0) { Stop-Here 'the functions deploy failed. The indexes and rules are deployed (harmless to the running app); the app is unchanged and nothing was pushed. Run golive again once it is fixed (ask Claude).' }
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

$KeyPath = Join-Path (Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $Root))) 'service-account.json'
$HaveKey = Test-Path $KeyPath
$Base = "npx tsx scripts/split-client-metrics.ts --key `"$KeyPath`" --project $GcpProject --database $Db --confirm-project $GcpProject"
$Back = "npx tsx scripts/unsplit-client-metrics.ts --key `"$KeyPath`" --project $GcpProject --database $Db --confirm-project $GcpProject"

Log "GOLIVE COMPLETE. master = $((& git --no-optional-locks rev-parse --short origin/master).Trim())." 'Green'
Log 'When Render shows the deploy Live, each iPad picks the new version up on the Hub by itself' 'Green'
Log '(never over a session or while typing). Front-desk computers: reload the page.' 'Green'
Log 'Nothing on the client documents has moved. The app now reads both places, so it is right either way.' 'Green'
Log '' 'White'
Log 'NOW, BY HAND, in this order (docs\rounds\2026-10-05-speed.md and 2026-10-06-ipad.md, "For AJ"):' 'White'
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
Log '4. Render -> maxstrength-app-beta -> Settings. The service is NOT linked to render.yaml (checked Oct 5 2026), so SET:' 'White'
Log '   Start Command = node build/server.cjs (npm start does not pass SIGTERM on to the server), Max shutdown delay = 120 s' 'White'
Log '   (if Render shows that setting), Instances = 1. The NEXT deploy''s Logs should show the OLD instance say' 'White'
Log '   "SIGTERM: no new connections; letting running requests finish." If that never appears, tell Claude.' 'White'
Log '5. Render -> Logs, search  type: ''boot''  : one line per cold open (auth-ready, trainer-ready, hub-data, standalone,' 'White'
Log '   userAgent). Write down hub-data for your cold opens beside the stopwatch of Round 59.' 'White'
Log '6. The two Render crons (created by hand on Oct 5 2026) rebuild from master on this push. The next morning, open' 'White'
Log '   journey-cron-renewals -> Logs: the Done line, and the month tally step for Hours and Insights. Tell Claude if it failed.' 'White'
Log '   The Sunday machine-trends job''s log too, the first Sunday after: it reads the new totals document by id.' 'White'
Log '7. Walk Round 58 (the speed round) and Round 59 (the iPad round) of docs\ops\TESTING-CHECKLIST.md on an iPad,' 'White'
Log '   sign-in first (Google and Microsoft, tab and Home Screen app); Round 59 on a 10th-gen iPad or a mini: the opens' 'White'
Log '   timed, a session (the Journey grid''s older columns as faint as before, the date heads on top scrolling down),' 'White'
Log '   the Wrap-up''s confetti, the profile, Today, the Directory, upright and on its side, light and dark.' 'White'
Log '8. For the R20 gate (the $18 a month cut), record Render -> Metrics -> Memory and CPU in 14-day windows (Pro keeps 14 days):' 'White'
Log '   screenshot each window''s peak and p95 before it ages out. Two windows in a row with a deploy and a chart-import evening,' 'White'
Log '   memory p95 under 300 MB and CPU under 70% in the deploy window, then ask Claude to change the plan (your approval).' 'White'
Log '9. R30: Query insights a day after the indexes (no scans on the session and profile path), Cloud Logging for' 'White'
Log '   recalcTrainerWindows (succeeds, how long, peak memory), budget alerts at $25 / $50 / $100, and confirm the' 'White'
Log '   gcf-artifacts repository has a cleanup policy (the functions deploy asks for one if it has none).' 'White'
Log '' 'White'
Log '================ 10. THE ROSTER MIGRATION: YOURS TO RUN, THE NEXT MORNING ================' 'White'
Log 'WHEN: once Render shows the deploy Live AND every studio iPad has been back on the Hub once (it loads the' 'White'
Log '  new version there by itself), so none still runs the old version. The next morning is safe. An iPad still on' 'White'
Log '  the old version is not harmful (its writes are counted correctly); a second run later moves what it wrote.' 'White'
Log 'BEFORE: Round 59 of docs\ops\TESTING-CHECKLIST.md, "After the roster split": screenshot THREE clients with long' 'White'
Log '  histories first (Programming, the Equipment tab: weights and counts), to compare after.' 'White'
Log '' 'White'
Log "WHERE: PowerShell in THIS folder ($Root). The scripts need the service-account key from the project folder:" 'White'
Log "  $KeyPath  $(if ($HaveKey) { '(found)' } else { '(NOT FOUND: put the key there first, or change --key)' })" $(if ($HaveKey) { 'White' } else { 'Yellow' })
Log '' 'White'
Log 'STEP 1, the dry run (reads only, writes nothing):' 'White'
Log "  $Base" 'Cyan'
Log '  Look for, in order:' 'White'
Log "    Firestore: project $GcpProject, database $Db" 'White'
Log '    Auth: service account ...   (the key was found)' 'White'
Log '    DRY RUN: nothing will be written.' 'White'
Log '    N clients read; M still hold the machine maps.     (N about every client in the company; M most of them)' 'White'
Log '    Would move: M of N clients (... KB of machine maps as JSON, about ... KB a client).   (a few KB a client)' 'White'
Log '    Already had a totals document the app wrote ...: K.   (the clients who trained since the push)' 'White'
Log '    lastSessionDate moved forward to the last machine day ...: L.' 'White'
Log '    No failures.' 'White'
Log '  STOP and send Claude the output if you see: Refusing, Failed, a failures line, M = 0, or N far from' 'White'
Log '  the number of clients you expect.' 'White'
Log '' 'White'
Log 'STEP 2, one studio at a time (add --commit; scripts need ids, not names). A first small run is wise:' 'White'
Log "  $Base --studio NdqNIuZlpHig31Xj4UHR --limit 20 --commit      (Solon, 20 clients)" 'Cyan'
Log '  then look at those clients on an iPad (Programming, the Equipment tab: the same weights and counts), then:' 'White'
Log "  $Base --studio NdqNIuZlpHig31Xj4UHR --commit      (Solon, the rest)" 'Cyan'
Log "  $Base --studio A4uvDltWoJuCas0hqEkG --commit      (westlake)" 'Cyan'
Log "  $Base --studio BVDDRe5AqQZFihRLW0vK --commit      (Strongsville)" 'Cyan'
Log "  $Base --studio 1WV88AvJKRpgypnmmO1N --commit      (Willoughby)" 'Cyan'
Log '  Each says "Moved: ..." and "No failures.", and names its restore point:' 'White'
Log '    What the moved clients held before: backups\split-client-metrics-<time>.json   (keep these files)' 'White'
Log '  A run that stops half way is safe: run the same command again (moved clients are skipped).' 'White'
Log '' 'White'
Log 'STEP 3, everyone else (clients with no home studio, Demo Mode): the dry run without --studio, then:' 'White'
Log "  $Base --commit" 'Cyan'
Log '  A week later, the dry run once more: it should say 0 still hold the maps (or move what an old iPad wrote).' 'White'
Log '' 'White'
Log 'THEN: Round 59 "After the roster split" on the iPads (the three clients unchanged; the cold open timed again).' 'White'
Log '' 'White'
Log '================ TO UNDO (ask Claude first) ================' 'White'
Log 'The app on master reads both places, so the split itself never needs undoing for it. A build from before' 'White'
Log 'this push reads the machine maps from the client document only. To go back to it, IN THIS ORDER:' 'White'
Log '  a. Copy the maps back while this app is still live (it reads both, so nothing on screen changes):' 'White'
Log "       $Back                (dry run: Would copy back: ...)" 'Cyan'
Log "       $Back --commit" 'Cyan'
Log '     It sets each client''s three fields to the same merge and DELETES its machineTotals document in the same' 'White'
Log '     transaction (left behind, the counts would be doubled). Restore point: backups\unsplit-client-metrics-<time>.json.' 'White'
Log '     Do this even if the migration never ran: sessions finished since this push have their maps only there.' 'White'
Log "  b. Push the restore tag: git push --force origin ${RestoreTag}:master   (Render deploys the old app)." 'White'
Log '  c. The next morning, once every iPad runs the old app, step a again with --commit: it copies back what this' 'White'
Log '     app wrote between a and b.' 'White'
Log "  d. Last, from a checkout of $RestoreTag (ask Claude to make one): the two functions and the old rules," 'White'
Log "       npx firebase deploy --only $DeployFunctions --project $Project" 'White'
Log "       npx firebase deploy --only firestore:rules --project $Project" 'White'
Log '     (rules last: the old rules would have refused this app the new document while it was still live).' 'White'
Log '  The indexes need no undo. The two deleted functions stay deleted (nothing set their flags).' 'White'
$elapsed = [int]((Get-Date) - $Started).TotalMinutes
Log "Done in about $elapsed minute(s). The migration is NOT done: it is step 10, yours to run the next morning." 'Green'
exit 0
