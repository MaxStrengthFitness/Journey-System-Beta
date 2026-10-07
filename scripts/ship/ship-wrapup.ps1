<#
 SCRIPT-VERSION: v1  (Oct 7 2026, the Wrap-up round, on top of the Oct 6 release)

 Ships branch oct6/wrapup: the short fix round AJ asked for after the lab's
 A/B of the release (AJ, Oct 6 2026: "i love every recommendation you give so
 lets do it"). docs\rounds\2026-10-07-wrapup.md is the round. The branch is a
 few commits on the release as it is live (40b868a2):

   - 90461dec  the client on screen keeps its object when somebody else
               changes (src\features\machine-totals\totals.ts: the ONE change
               to app code; the session, the Wrap-up and the profile no
               longer redraw for another client's change);
   - tests that prove it end to end, and that the profile draws at once while
     a client's machine totals load (machine-totals\*.render.test.tsx);
   - the perf lab's fixes (harness\perf-lab\: it NEVER ships; nothing in it
     is built into dist\);
   - the docs.

 WHAT GOES TO PRODUCTION, in this order (golive, after GO):
   1. the restore tag restore/2026-10-07-before-wrapup = master as it is now
      (40b868a2), pushed to GitHub;
   2. firestore.rules ONLY IF it changed against master (the rules tests
      first, then the deploy). This round changes no rules, so this step is
      expected to skip itself;
   3. Cloud Functions ONLY IF functions\src changed. This round changes none,
      and this script names no function to deploy: if functions\src changed,
      prepare STOPS and asks Claude (never a plain --only functions);
   4. git fetch again, master must not have moved, then
      git push origin oct6/wrapup:master, fast-forward only.
 THEN, BY HAND, ON RENDER (golive prints it): a push deploys NOTHING on Render
 (found Oct 6 2026: Render has no access to the repo). The web service needs
 Manual Deploy, and both cron jobs Manual Build, or they keep the old commit.
 No index, no Firestore structure, no Mindbody call, timer or cadence change;
 nothing contacts anyone. The roster migration (scripts\split-client-metrics.ts)
 is separate and unchanged: this ships before or after it equally well.

 Run from the branch's own folder, .claude\worktrees\wrapup (it is on the
 branch already; do not switch branches by hand). IN ORDER:

   powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-wrapup.ps1 -Stage prepare
   powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-wrapup.ps1 -Stage golive

 prepare  changes nothing in production and nothing in git (it writes only
          logs\, dist\ and build\): the branch, a clean tree, the fetch,
          that master is EXACTLY 40b868a2 (anything else: stop and ask
          Claude), that the branch fast-forwards master, what would go live
          (rules, functions, indexes, server), the restore tag free, no
          Windows line ends, the case check, the typecheck COUNT (2), the
          suite in Eastern time, the functions typecheck and tests, the
          builds (the app, the crons and the server), the first screen's
          size budget, none of the perf lab's markers in the build, and the
          rules tests. It records what it tested in logs\ship-wrapup.prepared.
          Ends PREPARE PASSED.

 golive   refuses unless the branch and master are exactly what prepare
          recorded, asks for GO, then does 1-4 above and stops at the first
          failure (each stop says what is already live). Then it prints the
          steps left for AJ by hand: Render, the iPads, Round 59.

 To undo: git push --force origin restore/2026-10-07-before-wrapup:master,
 then the same three Render buttons. Nothing else changed in production.

 ASCII only on purpose (Windows PowerShell 5.1 reads a script as ANSI).
#>

param([Parameter(Mandatory = $true, Position = 0)][ValidateSet('prepare', 'golive')][string]$Stage)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $Root
$LogFile = Join-Path $Root 'logs\ship-wrapup.log'
# What prepare tested: "<branch sha> <origin/master sha>". golive reads it.
$PreparedFile = Join-Path $Root 'logs\ship-wrapup.prepared'
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $LogFile) | Out-Null
$Branch = 'oct6/wrapup'
$Folder = '.claude\worktrees\wrapup'
$RestoreTag = 'restore/2026-10-07-before-wrapup'
# The release (the speed round, the iPad round, the roster split and the
# floor group), LIVE since Oct 6 2026 15:17 ET. This round was built and
# measured on exactly this commit; anything else on master was not tested
# with it.
$MasterMustBe = '40b868a2'
# 2 since the Hub fixes (Oct 1): clinical-review/charts.tsx and
# EditTrainerModal.tsx. This round keeps the same two. More is new.
$TscBaseline = 2
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

Log "ship-wrapup $Stage" 'White'

# The branch's own worktree folder (.claude\worktrees\wrapup). Nothing here
# reads Firestore with a service account, so service-account.json is not
# needed (a worktree has no copy, on purpose).
$top = (& git --no-optional-locks rev-parse --show-toplevel 2>$null)
if ($LASTEXITCODE -ne 0 -or -not (Test-Path 'package.json') -or -not (Test-Path 'scripts\ship\ship-wrapup.ps1') -or ((Resolve-Path $top).Path -ne (Get-Location).Path)) { Stop-Here "run this from the top of the branch's folder, $Folder." }
foreach ($f in @('src\features\machine-totals\totals.ts', 'src\features\machine-totals\fold-identity.render.test.tsx', 'scripts\check-bundle-budget.mjs', 'docs\rounds\2026-10-07-wrapup.md')) {
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
if ($LASTEXITCODE -ne 0) { Stop-Here "this checkout does not know $MasterMustBe (the release). Ask Claude." }
$BranchSha = (& git --no-optional-locks rev-parse $Branch).Trim()
$MasterSha = (& git --no-optional-locks rev-parse origin/master).Trim()

if ($MasterSha -ne $MustBeSha) {
  Stop-Here "master is at $($MasterSha.Substring(0, 8)), not $MasterMustBe (the release, which this round was built and measured on). Something else went to master since. Ask Claude to bring it into $Branch first."
}
Log "master is at $MasterMustBe (the release), as this round was built on." 'Green'

& git --no-optional-locks merge-base --is-ancestor origin/master $Branch
if ($LASTEXITCODE -ne 0) { Stop-Here "$Branch does not fast-forward master. Ask Claude." }

$ahead = (& git --no-optional-locks rev-list --count "origin/master..$Branch").Trim()
if ([int]$ahead -eq 0) { Log 'master already has everything on the branch. Nothing to ship.' 'Green'; exit 0 }
Log "$ahead commit(s) will go live:" 'Green'
& git --no-optional-locks log --oneline --first-parent "origin/master..$Branch" | ForEach-Object { Log "   $_" }

# What this round deploys besides the push, measured against master.
& git --no-optional-locks diff --quiet origin/master $Branch -- firestore.rules
$RulesChanged = ($LASTEXITCODE -ne 0)
# This round names no function. A change under functions\src (tests aside),
# or to what every function is built with, is one this script cannot deploy
# safely: it stops rather than guess (never a plain --only functions).
$changedFn = @(& git --no-optional-locks diff --name-only origin/master $Branch -- functions/src | Where-Object { $_ -and ($_ -notmatch '\.test\.ts$') })
if ($changedFn.Count -gt 0) {
  $changedFn | ForEach-Object { Log "   $_" 'Red' }
  Stop-Here 'functions\src changed, and this script names no function to deploy (the Wrap-up round changes none). Ask Claude.'
}
& git --no-optional-locks diff --quiet origin/master $Branch -- functions/package.json functions/package-lock.json functions/tsconfig.json
if ($LASTEXITCODE -ne 0) { Stop-Here 'functions\package.json, its lock or its tsconfig changed, which would change every function. Ask Claude.' }
# No index belongs to this round either.
& git --no-optional-locks diff --quiet origin/master $Branch -- firestore.indexes.json
if ($LASTEXITCODE -ne 0) { Stop-Here 'firestore.indexes.json changed, and the Wrap-up round adds no index. Ask Claude.' }
Log ("Against master: firestore.rules " + $(if ($RulesChanged) { 'CHANGED (golive runs the rules tests again, then deploys them, before the push)' } else { 'unchanged (no rules deploy)' }) + '; functions\src unchanged (no functions deploy); indexes unchanged.') 'Green'

if ($Stage -eq 'prepare') {
  if (Test-Path $PreparedFile) { Remove-Item -Force $PreparedFile }

  Log 'What changes, by folder (only src\ and server\ reach the app and the crons; harness\ never ships):' 'Yellow'
  & git --no-optional-locks diff --stat origin/master $Branch | Select-Object -Last 1 | ForEach-Object { Log "   $_" 'Yellow' }
  & git --no-optional-locks diff --dirstat=files,0 origin/master $Branch | ForEach-Object { Log "   $_" 'Yellow' }
  Log 'server, render.yaml and index.html changes (the web service and the crons are deployed by hand on Render):' 'Yellow'
  & git --no-optional-locks diff --stat origin/master $Branch -- server server.ts render.yaml index.html | ForEach-Object { Log "   $_" 'Yellow' }
  if ($RulesChanged) {
    Log 'firestore.rules changes (golive tests and deploys them BEFORE the push):' 'Yellow'
    & git --no-optional-locks diff --stat origin/master $Branch -- firestore.rules | ForEach-Object { Log "   $_" 'Yellow' }
    $fl = Run 'Firebase login' 'npx firebase login:list'
    Must $fl 'the Firebase login check'
    if (-not (@($fl.Output) -match '@')) { Stop-Here 'no Firebase login on this PC. Run: npx firebase login, then prepare again.' }
  }

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

  # The perf lab (harness\perf-lab) must never ship. This round changed it,
  # so this check matters more than usual.
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
  if ($RulesChanged) { Log "  2. npm run test:rules again, then npx firebase deploy --only firestore:rules --project $Project." 'White' } else { Log '  2. (skipped: firestore.rules is the same as live)' 'White' }
  Log '  3. (skipped: no Cloud Function changed)' 'White'
  Log "  4. git push origin ${Branch}:master (fast-forward only)." 'White'
  Log '  Then, by hand: Render (Manual Deploy on the web service, Manual Build on both crons), the iPads, Round 59.' 'White'
  Log 'PREPARE PASSED. Next: powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-wrapup.ps1 -Stage golive' 'Green'
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
Write-Host 'The Wrap-up round: ONE change to the app (the client on screen keeps its object when somebody else changes),' -ForegroundColor Yellow
Write-Host 'with its tests, the perf lab''s fixes (never shipped) and the docs.' -ForegroundColor Yellow
Write-Host 'This tags the restore point, then:' -ForegroundColor Yellow
if ($RulesChanged) { Write-Host '  deploys firestore.rules to PRODUCTION (after the rules tests pass again),' -ForegroundColor Yellow }
Write-Host '  pushes to master. On Render nothing happens until YOU press Manual Deploy (web service) and' -ForegroundColor Yellow
Write-Host '  Manual Build (both crons); golive prints the steps.' -ForegroundColor Yellow
Write-Host 'No index, no Cloud Function, no Firestore structure change; nothing is asked of Mindbody; nothing contacts anyone.' -ForegroundColor Yellow
Write-Host ''
if ((Read-Host 'AJ: type GO to tag and push') -ne 'GO') { Log 'Nothing tagged, deployed or pushed.' 'Yellow'; exit 0 }
Log 'AJ typed GO: the Wrap-up round.' 'White'

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

# 2. The rules, only if they changed: the tests again first (AJ's run
#    counts), then the deploy.
if ($RulesChanged) {
  Run-RulesTests 'Nothing is deployed or pushed (the restore tag is on GitHub, which is harmless).'
  $rules = Run "deploy firestore.rules (project $Project)" "npx firebase deploy --only firestore:rules --project $Project"
  if ($rules.Code -ne 0) { Stop-Here 'the rules deploy failed. The app is unchanged and nothing was pushed.' }
  if (-not (@($rules.Output) -match 'released rules')) { Stop-Here 'the rules deploy did not say it released the rules. Nothing was pushed. Ask Claude before going on (Firebase console -> Firestore -> the named database -> Rules shows what is live).' }
  Log 'firestore.rules deployed to production.' 'Green'
} else {
  Log 'firestore.rules is the same as live: no rules deploy.' 'Green'
}

# 3. No Cloud Function changed (prepare and the checks above stop otherwise).
Log 'functions\src is the same as live: no functions deploy.' 'Green'

# 4. The push, fast-forward only (git refuses anything else without --force,
#    which this script never passes). Checked again against GitHub first.
& git fetch -q origin
if ($LASTEXITCODE -ne 0) { Stop-Here 'could not reach GitHub before the push. The app is unchanged. Run golive again once GitHub answers.' }
if ((& git --no-optional-locks rev-parse origin/master).Trim() -ne $MasterSha) { Stop-Here 'master moved while golive ran. The app is unchanged. Ask Claude.' }
& git --no-optional-locks merge-base --is-ancestor origin/master $Branch
if ($LASTEXITCODE -ne 0) { Stop-Here "$Branch no longer fast-forwards master. The app is unchanged. Ask Claude." }
$push = Run "git push origin ${Branch}:master" "git push origin ${Branch}:master"
Must $push 'the push. The app is unchanged'

$NewMaster = (& git --no-optional-locks rev-parse --short origin/master).Trim()
Log "PUSHED. master = $NewMaster. The app is NOT live yet: Render deploys nothing on a push." 'Green'
Log '' 'White'
Log 'NOW, BY HAND, in this order:' 'White'
Log '1. Render -> maxstrength-app-beta -> Manual Deploy -> Deploy latest commit. Wait until it says Live' 'White'
Log "   on $NewMaster. Then check it: curl.exe -s https://maxstrength-app-beta.onrender.com/version.json" 'White'
Log '   (the version names the new build; if it still names the old one, wait a minute and ask again).' 'White'
Log '2. Render -> journey-cron-renewals -> Builds (or Settings) -> Manual Build, then the same on' 'White'
Log '   journey-cron-leaderboards. Both crons carry the changed file (the machine totals read), so keep all three' 'White'
Log '   on one commit. Nothing they compute changes. Each build''s log ends on the new commit.' 'White'
Log '3. The iPads: each one picks the new version up by itself the next time it is on the Hub (never over a' 'White'
Log '   session or while typing). To be sure, take each studio iPad back to the Hub once. Front-desk computers:' 'White'
Log '   reload the page.' 'White'
Log '4. Walk the Wrap-up round''s lines in Round 59 of docs\ops\TESTING-CHECKLIST.md ("The Wrap-up round"),' 'White'
Log '   on a 10th-gen iPad or a mini: a session to Finish, the Wrap-up in its first seconds, a session running' 'White'
Log '   while another iPad finishes, five profiles opened in a row. Write the times in the Findings log.' 'White'
Log '5. The roster migration is unchanged and separate (docs\rounds\2026-10-06-ipad.md, "The roster split"):' 'White'
Log '   this ships before or after it equally well. Round 59''s profile lines are worth walking on both sides of it.' 'White'
Log '' 'White'
Log 'TO UNDO (ask Claude first):' 'White'
Log "  git push --force origin ${RestoreTag}:master   then the same three Render buttons (steps 1 and 2)." 'White'
Log '  Nothing else changed in production.' 'White'
$elapsed = [int]((Get-Date) - $Started).TotalMinutes
Log "Done in about $elapsed minute(s)." 'Green'
exit 0
