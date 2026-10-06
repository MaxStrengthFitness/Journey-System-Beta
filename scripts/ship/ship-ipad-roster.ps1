# SUPERSEDED by scripts/ship/ship-release.ps1 (Oct 6 2026, AJ: "we will ship everything together"); this one would refuse anyway, its master check no longer matches.
<#
 SCRIPT-VERSION: v1  (Oct 6 2026, the iPad round's roster split)

 *** THIS SHIPS A FIRESTORE STRUCTURE CHANGE. RUN golive ONLY WITH AJ'S ***
 *** EXPLICIT OK TO IT. CLAUDE.md: "Don't change ... the Firestore     ***
 *** structure without an explicit OK." Its GO prompt asks again.      ***

 Ships branch oct6/ipad-data: the roster split. Every open of the app
 streams the studio's whole client list, and 73% of every client document
 was two maps no list draws. They move:

   clients/{id}.currentMachineMetrics      ->  clients/{id}/machineTotals/current
   clients/{id}.machineStats               ->  (the same document)
   clients/{id}.machineStatsBackfilledAt   ->  (the same document)

 plus the Hub's day arriving before the client list, the nightly and weekly
 jobs reading the new document by id, and the review's fixes.
 docs/rounds/2026-10-06-ipad.md ("The roster split") is the round;
 src/features/machine-totals/README.md is the design.

 SHIP THE iPAD ROUND FIRST (ship-ipad.ps1). This branch has oct6/ipad merged
 in, so master must be EXACTLY oct6/ipad's final commit (5db7fed1).
 Anything else: stop.

 WHAT GOES TO PRODUCTION (golive, after GO), in this order:
   1. the restore tag restore/2026-10-06-before-roster = master as it is now;
   2. the rules tests again, then firestore.rules: they ADD the new
      document's access and refuse an old iPad's backfill marker on a
      client; the running app is unaffected. Checked: the file deployed
      holds the new document's rules;
   3. Cloud Functions: none changed (no function reads these fields);
   4. git push origin oct6/ipad-data:master (fast-forward only): Render
      deploys the app, the server and the crons. From here every write goes
      to the new document and every read folds both sides. NOTHING ON THE
      CLIENT DOCUMENTS MOVES YET.
 Then it STOPS and prints the migration, which AJ runs himself, once the
 iPads have the new version: scripts/split-client-metrics.ts, a dry run,
 then --commit one studio at a time. Only that shrinks the roster.

 Run from the branch's own folder, .claude\worktrees\ipad-data (it is on
 the branch already; do not switch branches by hand). IN ORDER:

   powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-ipad-roster.ps1 -Stage prepare
   powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-ipad-roster.ps1 -Stage golive

 prepare  changes nothing in production and nothing in git (it writes only
          logs\, dist\ and build\): the branch, a clean tree, the fetch,
          that master is EXACTLY oct6/ipad's final commit, that the branch
          fast-forwards it, what goes live, the Firebase login, the restore
          tag free, no Windows line ends, the case check, the typecheck
          COUNT (2), the suite in Eastern time, the build (the app, the
          crons and the server), the first screen's budget, none of the
          perf lab's markers in the build, that firestore.rules holds the
          new document's rules, and the rules tests. Ends PREPARE PASSED.

 golive   refuses unless the branch and master are exactly what prepare
          recorded, asks for GO (AJ's OK to the structure change), does 1-4
          above, stops at the first failure (each stop says what is live),
          and prints the migration step and the way back.

 To undo: the app reads both sides, so the structure itself never needs
 undoing for the app's sake; a build from before this one does. golive
 prints the exact order (scripts/unsplit-client-metrics.ts FIRST, then the
 restore tag, then the old rules).

 ASCII only on purpose (Windows PowerShell 5.1 reads a script as ANSI).
#>

param([Parameter(Mandatory = $true, Position = 0)][ValidateSet('prepare', 'golive')][string]$Stage)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $Root
$LogFile = Join-Path $Root 'logs\ship-ipad-roster.log'
$PreparedFile = Join-Path $Root 'logs\ship-ipad-roster.prepared'
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $LogFile) | Out-Null
$Branch = 'oct6/ipad-data'
$Folder = '.claude\worktrees\ipad-data'
$RestoreTag = 'restore/2026-10-06-before-roster'
# oct6/ipad's final commit: ship-ipad.ps1's golive leaves master exactly here.
$MasterMustBe = '5db7fed14c809126abacd306dd21197e66272751'
$TscBaseline = 2
# None: no Cloud Function reads or writes the moved fields. If functions\
# changed anyway the script stops rather than guess.
$DeployFunctions = ''
$Project = 'prod'
# For the migration commands golive prints (never read here).
$GcpProject = 'gen-lang-client-0731527386'
$Db = 'ai-studio-32cbbdcc-6e08-4770-9665-867c68878efa'
# The new document's rules, which must be in the file that is deployed.
$RulesMark = 'match /clients/{clientId}/machineTotals/{docId}'
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

function Get-Port8080 {
  $conn = Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $conn) { return $null }
  return Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
}

function Run-RulesTests {
  param([string]$whatIsLive)
  $held = Get-Port8080
  if ($held) {
    Log "Port 8080 is held by $($held.ProcessName) (PID $($held.Id)), started $($held.StartTime)." 'Yellow'
    if ($held.ProcessName -ne 'java') { Stop-Here "something other than an old emulator holds port 8080. Close it and run this stage again. $whatIsLive" }
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

Log "ship-ipad-roster $Stage" 'White'

$top = (& git --no-optional-locks rev-parse --show-toplevel 2>$null)
if ($LASTEXITCODE -ne 0 -or -not (Test-Path 'package.json') -or -not (Test-Path 'scripts\ship\ship-ipad-roster.ps1') -or ((Resolve-Path $top).Path -ne (Get-Location).Path)) { Stop-Here "run this from the top of the branch's folder, $Folder." }
foreach ($f in @('scripts\split-client-metrics.ts', 'scripts\unsplit-client-metrics.ts', 'src\features\machine-totals\totals.ts')) {
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
  Stop-Here 'untracked files would be tested (or deployed) here but not shipped. Commit or remove them first.'
}

Log 'Fetching from GitHub (reads only)' 'Cyan'
& git fetch -q origin
if ($LASTEXITCODE -ne 0) { Stop-Here 'could not reach GitHub.' }

$BranchSha = (& git --no-optional-locks rev-parse $Branch).Trim()
$MasterSha = (& git --no-optional-locks rev-parse origin/master).Trim()
if ($MasterSha -ne $MasterMustBe) {
  Stop-Here "master is at $($MasterSha.Substring(0, 8)), not $($MasterMustBe.Substring(0, 8)) (oct6/ipad's final commit, which this branch was built and tested on). Ship ship-ipad.ps1 first (from .claude\worktrees\ipad), or ask Claude."
}
Log "master is at $($MasterMustBe.Substring(0, 8)) (the iPad round, live), as this branch was built on." 'Green'

& git --no-optional-locks merge-base --is-ancestor origin/master $Branch
if ($LASTEXITCODE -ne 0) { Stop-Here "$Branch does not fast-forward master. Ask Claude." }

$ahead = (& git --no-optional-locks rev-list --count "origin/master..$Branch").Trim()
if ([int]$ahead -eq 0) { Log 'master already has everything on the branch. Nothing to ship.' 'Green'; exit 0 }
Log "$ahead commit(s) will go live (first-parent line below):" 'Green'
& git --no-optional-locks log --oneline --first-parent "origin/master..$Branch" | ForEach-Object { Log "   $_" }

& git --no-optional-locks diff --quiet origin/master $Branch -- firestore.rules
$RulesChanged = ($LASTEXITCODE -ne 0)
& git --no-optional-locks diff --quiet origin/master $Branch -- firestore.indexes.json
$IndexesChanged = ($LASTEXITCODE -ne 0)
& git --no-optional-locks diff --quiet origin/master $Branch -- functions
$FunctionsChanged = ($LASTEXITCODE -ne 0)
if ($FunctionsChanged -and -not $DeployFunctions) {
  & git --no-optional-locks diff --stat origin/master $Branch -- functions | ForEach-Object { Log "   $_" 'Red' }
  Stop-Here 'functions\ changed on this branch, and this script names no function to deploy. Ask Claude (never a plain --only functions).'
}
if (-not $RulesChanged) { Stop-Here 'firestore.rules is the same as master''s, but the roster split needs its new rules. Ask Claude.' }
if (-not (Select-String -Path 'firestore.rules' -SimpleMatch -Pattern $RulesMark -Quiet)) { Stop-Here "firestore.rules does not hold '$RulesMark'. Ask Claude." }

if ($Stage -eq 'prepare') {
  if (Test-Path $PreparedFile) { Remove-Item -Force $PreparedFile }

  Log 'firestore.rules changes (golive runs the rules tests again, then deploys them FIRST):' 'Yellow'
  & git --no-optional-locks diff --stat origin/master $Branch -- firestore.rules | ForEach-Object { Log "   $_" 'Yellow' }
  Log ('firestore.indexes.json: ' + $(if ($IndexesChanged) { 'CHANGED (golive deploys the indexes before the rules, never deleting one)' } else { 'unchanged (no new index: the new document is read by id).' })) $(if ($IndexesChanged) { 'Yellow' } else { 'Green' })
  Log 'functions\: unchanged (no Cloud Function reads or writes the moved fields).' 'Green'
  Log 'server and scripts changes (the crons deploy with the push; the scripts are run by hand):' 'Yellow'
  & git --no-optional-locks diff --stat origin/master $Branch -- server server.ts scripts | ForEach-Object { Log "   $_" 'Yellow' }

  $fl = Run 'Firebase login' 'npx firebase login:list'
  Must $fl 'the Firebase login check'
  if (-not (@($fl.Output) -match '@')) { Stop-Here 'no Firebase login on this PC. Run: npx firebase login, then prepare again.' }

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

  if ($IndexesChanged) {
    try {
      $ixJson = Get-Content -Path 'firestore.indexes.json' -Raw | ConvertFrom-Json
    } catch {
      Stop-Here "firestore.indexes.json does not parse: $($_.Exception.Message)"
    }
    $ixOverrides = @($ixJson.fieldOverrides | Where-Object { $_ }).Count
    if ($ixOverrides -gt 0) { Stop-Here 'firestore.indexes.json has field overrides, which the Enterprise edition refuses. Ask Claude.' }
  }

  $tsc = Run 'typecheck' 'npx tsc --noEmit'
  $errs = @($tsc.Output | Where-Object { "$_" -match 'error TS' }).Count
  Log "tsc errors: $errs (baseline $TscBaseline)" $(if ($errs -le $TscBaseline) { 'Green' } else { 'Red' })
  if ($errs -gt $TscBaseline) { Stop-Here 'more typecheck errors than the baseline.' }

  $env:TZ = 'America/New_York'
  $vt = Run 'the suite (TZ=America/New_York)' 'npx vitest run --dir src --testTimeout=30000'
  Must $vt 'the test suite'

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
  Log 'THE PLAN (golive, in this order, stopping at the first failure; ONLY with AJ''s OK to the structure change):' 'White'
  Log "  1. Tag master as it is now: $RestoreTag = $($MasterSha.Substring(0, 7)), and push the tag." 'White'
  if ($IndexesChanged) { Log "  2. npx firebase deploy --only firestore:indexes --project $Project --non-interactive" 'White' } else { Log '  2. (no index change: skipped)' 'White' }
  Log "  3. npm run test:rules again, then npx firebase deploy --only firestore:rules --project $Project" 'White'
  Log '  4. (no functions change: skipped)' 'White'
  Log "  5. git push origin ${Branch}:master (fast-forward only). Render deploys the app, the server and the crons." 'White'
  Log '  6. STOP: the migration is yours to run, printed then.' 'White'
  Log 'PREPARE PASSED. Next, only with AJ''s OK: powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-ipad-roster.ps1 -Stage golive' 'Green'
  exit 0
}

# ---- golive ------------------------------------------------------------------------
if (-not (Test-Path $PreparedFile)) { Stop-Here 'prepare has not passed on this PC. Run prepare first.' }
$prepared = ((Get-Content -Path $PreparedFile -Raw).Trim()) -split '\s+'
if ($prepared.Count -ne 2 -or $prepared[0] -ne $BranchSha) { Stop-Here "$Branch has changed since prepare passed, so this commit has not been tested. Run prepare again." }
if ($prepared[1] -ne $MasterSha) { Stop-Here "master has moved since prepare passed (tested against $($prepared[1].Substring(0, 7)), now $($MasterSha.Substring(0, 7))). Ask Claude." }
Log "prepare passed on this commit ($($BranchSha.Substring(0, 7))) onto this master ($($MasterSha.Substring(0, 7)))." 'Green'
& git --no-optional-locks diff --quiet HEAD -- firestore.rules
if ($LASTEXITCODE -ne 0) { Stop-Here 'firestore.rules has uncommitted changes in this folder, and they would deploy. Ask Claude.' }

Write-Host ''
Write-Host '*** THE FIRESTORE STRUCTURE CHANGE (the roster split) ***' -ForegroundColor Red
Write-Host 'Three fields leave every client document and go to clients/{id}/machineTotals/current:' -ForegroundColor Yellow
Write-Host '  currentMachineMetrics, machineStats, machineStatsBackfilledAt.' -ForegroundColor Yellow
Write-Host 'This tags the restore point, then deploys to PRODUCTION, in order:' -ForegroundColor Yellow
if ($IndexesChanged) { Write-Host '  the Firestore indexes,' -ForegroundColor Yellow }
Write-Host '  firestore.rules (after the rules tests pass again; they only ADD the new document''s access and refuse an' -ForegroundColor Yellow
Write-Host '  old iPad''s backfill marker on a client),' -ForegroundColor Yellow
Write-Host '  then pushes to master, which deploys the app, the server and the crons on Render.' -ForegroundColor Yellow
Write-Host 'Nothing on the client documents moves until YOU run the migration it prints at the end.' -ForegroundColor Yellow
Write-Host 'Nothing is asked of or written to Mindbody; nothing contacts anyone.' -ForegroundColor Yellow
Write-Host ''
Write-Host 'CLAUDE.md: "Don''t change ... the Firestore structure without an explicit OK."' -ForegroundColor Red
if ((Read-Host 'AJ: type GO only if you OK this Firestore structure change, to tag, deploy and push') -ne 'GO') { Log 'Nothing tagged, deployed or pushed.' 'Yellow'; exit 0 }
Log 'AJ typed GO: OK to the Firestore structure change (the roster split).' 'White'

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

# 2. Indexes, only if they changed (none for this branch: read by id).
if ($IndexesChanged) {
  $idx = Run "deploy firestore.indexes.json (project $Project)" "npx firebase deploy --only firestore:indexes --project $Project --non-interactive"
  if ($idx.Code -ne 0) { Stop-Here 'the index deploy failed. The live app, its rules and its functions are unchanged and nothing was pushed.' }
  Log 'Indexes deployed (they finish building by themselves).' 'Green'
}

# 3. The rules FIRST: the app this push brings writes the new document, and
#    with the old rules its Finish would save the counters but lose that
#    session's machine maps (docs\KNOWN-TRAPS.md).
Run-RulesTests 'The rules, the functions and the app are unchanged and nothing was pushed.'
$rules = Run "deploy firestore.rules (project $Project)" "npx firebase deploy --only firestore:rules --project $Project"
if ($rules.Code -ne 0) { Stop-Here 'the rules deploy failed. The app is unchanged and nothing was pushed.' }
if (-not (@($rules.Output) -match 'released rules')) { Stop-Here 'the rules deploy did not say it released the rules. Nothing was pushed; ask Claude before going on (Firebase console -> Firestore -> the named database -> Rules shows what is live).' }
if (-not (Select-String -Path 'firestore.rules' -SimpleMatch -Pattern $RulesMark -Quiet)) { Stop-Here 'the deployed file does not hold the new document''s rules. Nothing was pushed. Ask Claude.' }
Log "Rules deployed and released, holding '$RulesMark'." 'Green'
Log 'To see them: Firebase console -> Firestore -> the named database -> Rules (the newest release, today).' 'Green'

# 4. No functions (stopped above if any changed).

# 5. The push, fast-forward only, checked again against GitHub first.
& git fetch -q origin
if ($LASTEXITCODE -ne 0) { Stop-Here 'could not reach GitHub before the push. The rules are deployed (they only add access; the running app is unaffected); the app is unchanged. Run golive again once GitHub answers.' }
if ((& git --no-optional-locks rev-parse origin/master).Trim() -ne $MasterSha) { Stop-Here 'master moved while golive ran. The rules are deployed (harmless); the app is unchanged. Ask Claude.' }
& git --no-optional-locks merge-base --is-ancestor origin/master $Branch
if ($LASTEXITCODE -ne 0) { Stop-Here "$Branch no longer fast-forwards master. The rules are deployed (harmless); the app is unchanged. Ask Claude." }
$push = Run "git push origin ${Branch}:master" "git push origin ${Branch}:master"
Must $push 'the push (Render deploys from it). The rules are deployed (harmless); the app is unchanged'

$newMaster = (& git --no-optional-locks rev-parse --short origin/master).Trim()
Log "PUSHED. master = $newMaster. Render deploys the app, the server and the crons." 'Green'

# 6. STOP. The migration is AJ's to run, by hand, later.
$KeyPath = Join-Path (Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $Root))) 'service-account.json'
$HaveKey = Test-Path $KeyPath
$Base = "npx tsx scripts/split-client-metrics.ts --key `"$KeyPath`" --project $GcpProject --database $Db --confirm-project $GcpProject"
$Back = "npx tsx scripts/unsplit-client-metrics.ts --key `"$KeyPath`" --project $GcpProject --database $Db --confirm-project $GcpProject"
Log '' 'White'
Log '================ STOP HERE. THE MIGRATION IS YOURS TO RUN, LATER ================' 'White'
Log 'Nothing on the client documents has moved. The app now reads both places, so it is right either way.' 'White'
Log '' 'White'
Log 'WHEN: once Render shows the deploy Live AND every studio iPad has been back on the Hub once (it loads the' 'White'
Log '  new version there by itself). The next morning is safe. An iPad still on the old version is not harmful' 'White'
Log '  (its writes are counted correctly); a second run of the migration later moves what it wrote.' 'White'
Log 'BEFORE: Round 59 of docs\ops\TESTING-CHECKLIST.md, "After the roster split": screenshot three clients first.' 'White'
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
Log '================ THE WAY BACK (only if a build from before this one must run again) ================' 'White'
Log 'The app on master reads both places, so the split itself never needs undoing for it. A build from before' 'White'
Log 'this push reads the maps from the client document only. To go back to it, IN THIS ORDER (ask Claude first):' 'White'
Log '  a. Copy the maps back while this app is still live (it reads both, so nothing on screen changes):' 'White'
Log "       $Back                (dry run: Would copy back: ...)" 'Cyan'
Log "       $Back --commit" 'Cyan'
Log '     It sets each client''s three fields to the same merge and DELETES its machineTotals document in the same' 'White'
Log '     transaction (left behind, the counts would be doubled). Restore point: backups\unsplit-client-metrics-<time>.json.' 'White'
Log '     Do this even if the migration never ran: sessions finished since this push have their maps only there.' 'White'
Log "  b. Push the restore tag: git push --force origin ${RestoreTag}:master   (Render deploys the old app)." 'White'
Log '  c. The next morning, once every iPad runs the old app, step a again with --commit: it copies back what this' 'White'
Log '     app wrote between a and b.' 'White'
Log "  d. Last, the old rules: from a checkout of $RestoreTag (ask Claude to make one)," 'White'
Log "       npx firebase deploy --only firestore:rules --project $Project" 'White'
Log '     (rules last: the old rules would have refused this app the new document while it was still live).' 'White'
$elapsed = [int]((Get-Date) - $Started).TotalMinutes
Log "Done in about $elapsed minute(s). The migration is NOT done: it is the steps above, yours to run." 'Green'
exit 0
