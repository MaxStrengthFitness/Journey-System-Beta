<#
 SCRIPT-VERSION: v1  (Oct 9 2026, the first session and a routine's plan)

 Ships branch claude/first-session-routine-plan-ui-2f8dc1: a new client's
 first session and every routine's plan, the research of Oct 7 2026 and both
 rounds of the design round of Oct 8 2026 (docs\rounds\2026-10-08-first-session-screens.md
 is the round, its section 7 the build log and how to ship;
 docs\rounds\2026-10-07-first-session-and-routines.md the research). AJ's
 answers it was built on: "1d 2a 3a", "1a 2a 3a GO" and "1a 2a 3a", and on
 Oct 8 2026: "you can push it directly to master thats fine". Built on master
 as it is on GitHub (e8c5cb22: Ahead, live, and the docs brought up to Oct 7;
 checked Oct 9 2026 with git ls-remote). The branch, in order:

   - the research, AJ's answers and the design round's document;
   - the Journey grid for a client with no past sessions;
   - the routine plan's pure half, its store and its rules (the plan on the
     routine, its changes beside it, append-only);
   - can't-do, re-plan, starting routines from head office's presets and the
     studio's choice of them, the seed script; the consult is not Routine A;
   - Round 1's screens: Programming's Start a plan and Lineup, the briefing's
     plan card, the floor on day one (the plan's next machine, the Academy's
     starting range, the plan from the corner), the Wrap-up's Next time, and
     the old first-time setup retired;
   - Round 2: B molded in, the weak area, a studio's "A alone, or A and B
     together" (the studio setting newClientsStart);
   - the whole-branch review's fixes, the screens preview's fixes, the docs.

 WHAT GOES TO PRODUCTION, in this order (golive, after GO):
   1. the index (npx firebase deploy --only firestore:indexes --project prod
      --non-interactive: ONE new composite, routinePresets on tier and scope,
      the starting routines' read; it never deletes an index; never --force);
   2. the rules tests again, then firestore.rules (they only ADD access: a
      routine's plan changes, routines/{id}/planChanges, append-only, and a
      studio's choice of starting routines, studios/{s}/config/startingRoutines),
      then a check that the ruleset LIVE holds them;
   3. the restore tag restore/2026-10-09-before-first-session = e8c5cb22
      (master before this round), pushed to GitHub if it is not there yet;
   4. git fetch again, then git push origin <branch>:master, fast-forward
      only, ONLY when master is still e8c5cb22. When Claude has pushed the
      branch already (AJ's word, above), master is the branch's head and
      nothing is pushed.
 THEN, BY HAND (golive prints it): the seed (a dry run, then --commit), the
 iPad walk of Round 65 BEFORE Render (AJ's rule is at most two rounds
 shipped unwalked, and several went live unwalked), then Render: a push
 deploys NOTHING there. The web service needs Manual Deploy, and BOTH cron
 jobs Manual Build (journey-cron-renewals carries the studio settings'
 resolver, which gained a kind of setting; journey-cron-leaderboards to keep
 all three on one commit).
 No Cloud Function; no Mindbody call, timer or cadence change; the stored
 additions are a plan map on a routine, its changes, a start part on head
 office's routine presets, a studio's choice, one more studio setting.
 Nothing contacts anyone.

 Run from the branch's own folder,
 .claude\worktrees\first-session-routine-plan-ui-2f8dc1 (it is on the branch
 already; do not switch branches by hand). IN ORDER:

   powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-first-session.ps1 -Stage prepare
   powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-first-session.ps1 -Stage golive

 prepare  changes nothing in production and nothing in git (it fetches, and
          writes only logs\, dist\ and build\): the branch, a clean tree,
          that master on GitHub is e8c5cb22 or already the branch's head
          (anything else: stop and ask Claude), that the branch fast-forwards
          e8c5cb22, what goes live (rules and the index; no functions), the
          Firebase login, the restore tag free or already e8c5cb22, no
          Windows line ends, the case check, that firestore.indexes.json
          parses with no field overrides and holds the routinePresets index,
          that firestore.rules holds the plan's and the choice's rules, the
          typecheck COUNT (2), the suite in Eastern time, the functions
          typecheck and tests, the builds (the app, the crons and the
          server), the first screen's size budget, none of the perf lab's
          markers in the build, and the rules tests. It records what it
          tested in logs\ship-first-session.prepared. Ends PREPARE PASSED.

 golive   refuses unless the branch is exactly what prepare tested and
          master is e8c5cb22 or the branch's head, asks for GO, then does
          1-4 above and stops at the first failure (each stop says what is
          already live). Then it prints the steps left for AJ by hand.

 To undo: golive prints the order. In short: git push --force origin
 restore/2026-10-09-before-first-session:master, then the same three Render
 buttons. The rules and the index can stay (they only add access and a way
 to read); the seeded routines stay as head office's templates.

 ASCII only on purpose (Windows PowerShell 5.1 reads a script as ANSI).
#>

param([Parameter(Mandatory = $true, Position = 0)][ValidateSet('prepare', 'golive')][string]$Stage)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $Root
$LogFile = Join-Path $Root 'logs\ship-first-session.log'
# What prepare tested: "<branch sha> <origin/master sha>". golive reads it.
$PreparedFile = Join-Path $Root 'logs\ship-first-session.prepared'
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $LogFile) | Out-Null
$Branch = 'claude/first-session-routine-plan-ui-2f8dc1'
$Folder = '.claude\worktrees\first-session-routine-plan-ui-2f8dc1'
$RestoreTag = 'restore/2026-10-09-before-first-session'
# master on GitHub when this round was finished (git ls-remote, Oct 9 2026):
# Ahead (cf4a2ff8, live) and the docs brought up to Oct 7. The round was
# built and measured on exactly this commit. master may also already be the
# branch's head: AJ, Oct 8 2026, "you can push it directly to master thats
# fine", so Claude pushes the branch itself and golive then pushes nothing.
$MasterBase = 'e8c5cb22'
# 2 since the Hub fixes (Oct 1): clinical-review/charts.tsx and
# EditTrainerModal.tsx. This round keeps the same two. More is new.
$TscBaseline = 2
$Project = 'prod'
$GcpProject = 'gen-lang-client-0731527386'
$Db = 'ai-studio-32cbbdcc-6e08-4770-9665-867c68878efa'
# The round's rules, which must be in the rules deployed...
$RulesMarks = @('function planChangeOk(d)', 'function startingChoiceValid(d)')
# ...and in the ruleset that is live afterwards.
$LiveRulesMarks = @('planChangeOk', 'startingChoiceValid')
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
    # On this PC every rules run leaves its emulator behind (seen Sep 28 and Oct 9 2026).
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
  if ($rt.Code -ne 0) { Stop-Here "test:rules failed (it needs a JDK, 21 or newer). $whatIsLive" }
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

Log "ship-first-session $Stage" 'White'

# The branch's own worktree folder. Nothing in prepare or golive reads
# Firestore with a service account; the seed golive prints does, with the key
# from the project folder (--key), so this folder needs no copy of it.
$top = (& git --no-optional-locks rev-parse --show-toplevel 2>$null)
if ($LASTEXITCODE -ne 0 -or -not (Test-Path 'package.json') -or -not (Test-Path 'scripts\ship\ship-first-session.ps1') -or ((Resolve-Path $top).Path -ne (Get-Location).Path)) { Stop-Here "run this from the top of the branch's folder, $Folder." }
foreach ($f in @('src\features\routine-plan\store.ts', 'src\features\routine-plan\starting-routines.ts', 'src\features\routine-plan\ui\StartPlanPanel.tsx', 'src\features\routine-plan\ui\NextTimeCard.tsx', 'src\features\studio-settings\registry.ts', 'scripts\seed-starting-routines.ts', 'scripts\check-bundle-budget.mjs', 'docs\rounds\2026-10-08-first-session-screens.md')) {
  if (-not (Test-Path $f)) { Stop-Here "$f is missing from this folder. Ask Claude." }
}

# ---- in the branch's folder, on the branch ------------------------------------------
$head = (& git --no-optional-locks symbolic-ref --quiet --short HEAD)
if ($LASTEXITCODE -ne 0 -or "$head".Trim() -ne $Branch) { Stop-Here "this folder is on '$head', not $Branch. Run it from $Folder, or ask Claude; do not switch branches by hand." }
$dirty = (& git --no-optional-locks status --porcelain --untracked-files=no -- src docs server server.ts scripts tests functions public harness index.html firestore.rules firestore.indexes.json firebase.json package.json package-lock.json vite.config.ts render.yaml CLAUDE.md ROADMAP.md) | Where-Object { $_ }
if ($dirty) {
  Log 'Uncommitted changes:' 'Red'
  $dirty | Select-Object -First 20 | ForEach-Object { Log "   $_" 'Red' }
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

$BaseSha = (& git --no-optional-locks rev-parse "$MasterBase^{commit}").Trim()
if ($LASTEXITCODE -ne 0) { Stop-Here "this checkout does not know $MasterBase (master before this round). Ask Claude." }
$BranchSha = (& git --no-optional-locks rev-parse $Branch).Trim()
$MasterSha = (& git --no-optional-locks rev-parse origin/master).Trim()

# master is either still the round's base (golive pushes the branch) or
# already the branch's head (Claude pushed it on AJ's word; golive pushes
# nothing). Anything else went to master since and was not tested with this.
if ($MasterSha -eq $BaseSha) {
  $MasterPushed = $false
  Log "master is at $MasterBase (Ahead and the Oct 7 docs), before this round: golive pushes the branch." 'Green'
} elseif ($MasterSha -eq $BranchSha) {
  $MasterPushed = $true
  Log "master is already this branch's head ($($BranchSha.Substring(0, 8))): pushed on AJ's word. golive deploys the index and the rules, makes the restore tag, and pushes nothing." 'Green'
} else {
  Stop-Here "master is at $($MasterSha.Substring(0, 8)): neither $MasterBase (before this round) nor this branch's head ($($BranchSha.Substring(0, 8))). Something else went to master. Ask Claude to bring it into $Branch and test again first."
}

& git --no-optional-locks merge-base --is-ancestor $BaseSha $Branch
if ($LASTEXITCODE -ne 0) { Stop-Here "$Branch does not build on $MasterBase. Ask Claude." }

$inRound = (& git --no-optional-locks rev-list --count "$BaseSha..$Branch").Trim()
Log "$inRound commit(s) in this round (on top of $MasterBase):" 'Green'
& git --no-optional-locks log --oneline "$BaseSha..$Branch" | ForEach-Object { Log "   $_" }

# The round needs its rules and its index: both must have changed since the
# base, and hold what this round added. Measured against the BASE, never
# master, which may already be the branch.
& git --no-optional-locks diff --quiet $BaseSha $Branch -- firestore.rules
if ($LASTEXITCODE -eq 0) { Stop-Here "firestore.rules is the same as $MasterBase's, but the plan's changes and the studio's choice need their new rules. Ask Claude." }
foreach ($mark in $RulesMarks) {
  if (-not (Select-String -Path 'firestore.rules' -SimpleMatch -Pattern $mark -Quiet)) { Stop-Here "firestore.rules does not hold '$mark'. Ask Claude." }
}
& git --no-optional-locks diff --quiet $BaseSha $Branch -- firestore.indexes.json
if ($LASTEXITCODE -eq 0) { Stop-Here "firestore.indexes.json is the same as $MasterBase's, but the starting routines' read needs its index. Ask Claude." }
# This round names no function. A change under functions\src (tests aside),
# or to what every function is built with, is one this script cannot deploy
# safely: it stops rather than guess (never a plain --only functions).
$changedFn = @(& git --no-optional-locks diff --name-only $BaseSha $Branch -- functions/src | Where-Object { $_ -and ($_ -notmatch '\.test\.ts$') })
if ($changedFn.Count -gt 0) {
  $changedFn | ForEach-Object { Log "   $_" 'Red' }
  Stop-Here 'functions\src changed, and this script names no function to deploy (the first-session round changes none). Ask Claude.'
}
& git --no-optional-locks diff --quiet $BaseSha $Branch -- functions/package.json functions/package-lock.json functions/tsconfig.json
if ($LASTEXITCODE -ne 0) { Stop-Here 'functions\package.json, its lock or its tsconfig changed, which would change every function. Ask Claude.' }
Log "Against ${MasterBase}: firestore.rules and firestore.indexes.json CHANGED (golive deploys both, the index first, and checks the rules LIVE before the push); functions\src unchanged." 'Green'

if ($Stage -eq 'prepare') {
  if (Test-Path $PreparedFile) { Remove-Item -Force $PreparedFile }

  Log 'What changes, by folder (src\ reaches the app and, through the shared modules, the crons; harness\ never ships):' 'Yellow'
  & git --no-optional-locks diff --stat $BaseSha $Branch | Select-Object -Last 1 | ForEach-Object { Log "   $_" 'Yellow' }
  & git --no-optional-locks diff --dirstat=files,3 $BaseSha $Branch | ForEach-Object { Log "   $_" 'Yellow' }
  Log 'firestore.rules and firestore.indexes.json changes (golive deploys the index, runs the rules tests again, deploys the rules and checks them LIVE):' 'Yellow'
  & git --no-optional-locks diff --stat $BaseSha $Branch -- firestore.rules firestore.indexes.json | ForEach-Object { Log "   $_" 'Yellow' }
  Log 'server, render.yaml and index.html changes (the web service and the crons are deployed by hand on Render):' 'Yellow'
  $srv = @(& git --no-optional-locks diff --stat $BaseSha $Branch -- server server.ts render.yaml index.html | Where-Object { $_ })
  if ($srv.Count -eq 0) { Log '   none' 'Yellow' } else { $srv | ForEach-Object { Log "   $_" 'Yellow' } }
  Log 'scripts changes (the seed is run by hand, after golive):' 'Yellow'
  & git --no-optional-locks diff --stat $BaseSha $Branch -- scripts | ForEach-Object { Log "   $_" 'Yellow' }

  $fl = Run 'Firebase login' 'npx firebase login:list'
  Must $fl 'the Firebase login check'
  if (-not (@($fl.Output) -match '@')) { Stop-Here 'no Firebase login on this PC. Run: npx firebase login, then prepare again.' }

  # The restore point golive will make: free, or already master BEFORE the
  # round (e8c5cb22), never master as it is now (which may be the branch).
  $tagOnGitHub = & git --no-optional-locks ls-remote --tags origin "refs/tags/$RestoreTag"
  if ($LASTEXITCODE -ne 0) { Stop-Here 'could not ask GitHub for its tags.' }
  if ($tagOnGitHub) {
    $remoteSha = ("$tagOnGitHub" -split '\s+')[0]
    if ($remoteSha -ne $BaseSha) { Stop-Here "the restore tag $RestoreTag on GitHub is not $MasterBase (master before this round). Ask Claude." }
    Log "Restore tag $RestoreTag is already on GitHub at $MasterBase." 'Green'
  } else {
    $local = & git --no-optional-locks tag -l $RestoreTag
    if ($local) {
      $tagSha = (& git --no-optional-locks rev-parse "$RestoreTag^{commit}").Trim()
      if ($tagSha -ne $BaseSha) { Stop-Here "the restore tag $RestoreTag on this PC is not $MasterBase. Ask Claude to remove it." }
    }
    Log "Restore tag $RestoreTag is free; golive makes it at $MasterBase (master before this round)." 'Green'
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

  # firestore.indexes.json must parse, hold no field overrides (the
  # Enterprise edition refuses them and the deploy would stop half way), and
  # hold the starting routines' index: routinePresets on tier, then scope.
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
  $presetIx = @($ixJson.indexes | Where-Object { $_.collectionGroup -eq 'routinePresets' -and ((@($_.fields | ForEach-Object { $_.fieldPath }) -join ',') -eq 'tier,scope') })
  if ($presetIx.Count -ne 1) { Stop-Here 'firestore.indexes.json does not hold the starting routines'' index (routinePresets: tier, scope). Ask Claude.' }
  Log 'firestore.indexes.json holds the starting routines'' index (routinePresets: tier, scope).' 'Green'
  Log "firestore.rules holds the round's rules ('$($RulesMarks -join "', '")')." 'Green'

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

  # The perf lab (harness\perf-lab) must never ship, nor the screens
  # preview's throwaway harness (harness\screens, git-ignored).
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
  Log "  1. npx firebase deploy --only firestore:indexes --project $Project --non-interactive (never deletes an index)." 'White'
  Log "  2. npm run test:rules again, then npx firebase deploy --only firestore:rules --project $Project," 'White'
  Log "     then check the ruleset LIVE holds '$($LiveRulesMarks -join "' and '")'." 'White'
  Log "  3. The restore tag $RestoreTag = $MasterBase (master before this round), pushed if not on GitHub yet." 'White'
  if ($MasterPushed) { Log '  4. (no push: master is already the branch''s head)' 'White' } else { Log "  4. git push origin ${Branch}:master (fast-forward only), if master is still $MasterBase." 'White' }
  Log '  (no Cloud Function: none changed)' 'White'
  Log '  Then, by hand: the seed (dry run, then --commit), the iPad walk of Round 65 BEFORE Render, then Render' 'White'
  Log '  (Manual Deploy on the web service, Manual Build on both crons).' 'White'
  Log 'PREPARE PASSED. Next: powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-first-session.ps1 -Stage golive' 'Green'
  exit 0
}

# ---- golive ------------------------------------------------------------------------
if (-not (Test-Path $PreparedFile)) { Stop-Here 'prepare has not passed on this PC. Run prepare first.' }
$prepared = ((Get-Content -Path $PreparedFile -Raw).Trim()) -split '\s+'
if ($prepared.Count -ne 2 -or $prepared[0] -ne $BranchSha) { Stop-Here "$Branch has changed since prepare passed, so this commit has not been tested. Run prepare again." }
# master may have moved from the base to the branch's head since prepare (Claude's push); both were checked above.
Log "prepare passed on this commit ($($BranchSha.Substring(0, 7))); master is $(if ($MasterPushed) { 'already this commit' } else { $MasterBase + ', before the round' })." 'Green'
# The deploys send THIS folder's firestore.rules and firestore.indexes.json.
& git --no-optional-locks diff --quiet HEAD -- firestore.rules firestore.indexes.json functions
if ($LASTEXITCODE -ne 0) { Stop-Here 'firestore.rules, firestore.indexes.json or functions\ has uncommitted changes in this folder. Ask Claude.' }

Write-Host ''
Write-Host 'The first session and a routine''s plan (Rounds 1 and 2):' -ForegroundColor Yellow
Write-Host '  Programming''s Start a plan and the Lineup, the briefing''s plan card, the plan''s next machine and the' -ForegroundColor Yellow
Write-Host '  Academy''s starting range on the floor, the Wrap-up''s Next time, can''t-do and re-plan, B molded in,' -ForegroundColor Yellow
Write-Host '  the weak area, starting routines made by head office and chosen by each studio.' -ForegroundColor Yellow
Write-Host 'This deploys to PRODUCTION, in order: the index (routinePresets: tier, scope), then firestore.rules' -ForegroundColor Yellow
Write-Host '  (after the rules tests pass again; they only ADD access), checks they are LIVE, makes the restore tag,' -ForegroundColor Yellow
if ($MasterPushed) {
  Write-Host '  and pushes nothing (master is already this commit).' -ForegroundColor Yellow
} else {
  Write-Host '  then pushes to master.' -ForegroundColor Yellow
}
Write-Host 'On Render nothing happens until YOU press Manual Deploy (web service) and Manual Build (both crons),' -ForegroundColor Yellow
Write-Host 'after the seed and the iPad walk; golive prints the steps. No Cloud Function; nothing is asked of' -ForegroundColor Yellow
Write-Host 'Mindbody; nothing contacts anyone.' -ForegroundColor Yellow
Write-Host ''
if ((Read-Host 'AJ: type GO to deploy the index and the rules, tag and push') -ne 'GO') { Log 'Nothing deployed, tagged or pushed.' 'Yellow'; exit 0 }
Log 'AJ typed GO: the first session and a routine''s plan.' 'White'

# 1. The index. It builds in the background (minutes: routinePresets is a
#    small collection); until it is Enabled the starting routines' read
#    scans it, as any query without its index does, so nothing breaks.
#    --non-interactive: an index in production that is not in the file is
#    left alone, never deleted. Never --force (it would delete the two TTL
#    policies on the webhook's logs, which the file does not hold).
$idx = Run "deploy firestore.indexes.json (project $Project)" "npx firebase deploy --only firestore:indexes --project $Project --non-interactive"
if ($idx.Code -ne 0) { Stop-Here 'the index deploy failed. The live app and its rules are unchanged and nothing was pushed.' }
Log 'Index deployed to production (it finishes building by itself). A note about "2 field overrides ... not present" is expected: those are the TTL policies.' 'Green'

# 2. The rules: the tests again first (AJ's run counts), then the deploy,
#    then a check that what is LIVE holds the round's rules. The app this
#    round brings writes a plan's changes and a studio's choice, and with the
#    old rules every one of them would be refused. They only add access; the
#    running app is unaffected.
Run-RulesTests 'The index is deployed (harmless); the rules and the app are unchanged and nothing was pushed.'
$rules = Run "deploy firestore.rules (project $Project)" "npx firebase deploy --only firestore:rules --project $Project"
if ($rules.Code -ne 0) { Stop-Here 'the rules deploy failed. The index is deployed (harmless); the app is unchanged and nothing was pushed.' }
if (-not (@($rules.Output) -match 'released rules')) { Stop-Here 'the rules deploy did not say it released the rules. The index is deployed (harmless); nothing was pushed. Ask Claude before going on (Firebase console -> Firestore -> the named database -> Rules shows what is live).' }
$liveRules = Get-LiveRulesSource
if ($null -ne $liveRules) {
  foreach ($mark in $LiveRulesMarks) {
    if ($liveRules -notmatch [regex]::Escape($mark)) { Stop-Here "the ruleset live on the named database does not hold '$mark'. The index and possibly the rules are deployed (they only add access); the app is unchanged and nothing was pushed. Ask Claude." }
  }
  Log "The ruleset LIVE on $Db holds '$($LiveRulesMarks -join "' and '")' (read from the Firebase Rules API)." 'Green'
} else {
  Log 'Could not read the live ruleset with gcloud. Check it by hand, now:' 'Yellow'
  Log '  Firebase console -> Firestore -> the named database (ai-studio-...) -> Rules: the newest release (today),' 'Yellow'
  Log "  Ctrl F  $($LiveRulesMarks[0])  and then  $($LiveRulesMarks[1])  : both must be there." 'Yellow'
  if ((Read-Host "Type LIVE if the live rules hold both (Enter to stop here)") -ne 'LIVE') { Stop-Here 'the live rules were not confirmed. The index and rules are deployed (they only add access; the running app is unaffected); nothing was pushed. Run golive again once they are (ask Claude).' }
  Log "AJ confirmed: the live rules hold '$($LiveRulesMarks -join "' and '")'." 'Green'
}

# 3. The restore point: master BEFORE this round (e8c5cb22), whatever master
#    is now.
$tagOnGitHub = & git --no-optional-locks ls-remote --tags origin "refs/tags/$RestoreTag"
if ($LASTEXITCODE -ne 0) { Stop-Here 'could not ask GitHub for its tags. The index and rules are deployed (harmless); nothing was pushed.' }
if (-not $tagOnGitHub) {
  $local = & git --no-optional-locks tag -l $RestoreTag
  if (-not $local) {
    & git tag $RestoreTag $BaseSha
    if ($LASTEXITCODE -ne 0) { Stop-Here "could not make the restore tag $RestoreTag. The index and rules are deployed (harmless); nothing was pushed." }
  } else {
    $tagSha = (& git --no-optional-locks rev-parse "$RestoreTag^{commit}").Trim()
    if ($tagSha -ne $BaseSha) { Stop-Here "the restore tag $RestoreTag on this PC is not $MasterBase. Ask Claude to remove it; the index and rules are deployed (harmless), nothing was pushed." }
  }
  $tp = Run "push the restore tag $RestoreTag" "git push origin refs/tags/$RestoreTag"
  Must $tp 'pushing the restore tag (the index and rules are deployed, harmless; nothing was pushed to master)'
} else {
  $remoteSha = ("$tagOnGitHub" -split '\s+')[0]
  if ($remoteSha -ne $BaseSha) { Stop-Here "the restore tag $RestoreTag on GitHub is not $MasterBase. Ask Claude; the index and rules are deployed (harmless), nothing was pushed." }
}
Log "Restore point on GitHub: $RestoreTag = $($BaseSha.Substring(0, 7))" 'Green'

# 4. The push, fast-forward only (git refuses anything else without --force,
#    which this script never passes), and only while master is still the
#    base. Checked again against GitHub first.
& git fetch -q origin
if ($LASTEXITCODE -ne 0) { Stop-Here 'could not reach GitHub before the push. The index and rules are deployed (harmless); the app is unchanged. Run golive again once GitHub answers.' }
$MasterNow = (& git --no-optional-locks rev-parse origin/master).Trim()
if ($MasterNow -eq $BranchSha) {
  Log "master is already this commit ($($BranchSha.Substring(0, 7))): nothing to push." 'Green'
} elseif ($MasterNow -eq $BaseSha) {
  & git --no-optional-locks merge-base --is-ancestor origin/master $Branch
  if ($LASTEXITCODE -ne 0) { Stop-Here "$Branch no longer fast-forwards master. The index and rules are deployed (harmless); the app is unchanged. Ask Claude." }
  $push = Run "git push origin ${Branch}:master" "git push origin ${Branch}:master"
  Must $push 'the push. The index and rules are deployed (harmless); the app is unchanged'
} else {
  Stop-Here "master moved while golive ran (now $($MasterNow.Substring(0, 8))). The index and rules are deployed (harmless); the app is unchanged and nothing was pushed. Ask Claude."
}

$NewMaster = (& git --no-optional-locks rev-parse --short origin/master).Trim()
$KeyPath = Join-Path (Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $Root))) 'service-account.json'
$HaveKey = Test-Path $KeyPath
$Seed = "npx tsx scripts/seed-starting-routines.ts --key `"$KeyPath`" --project $GcpProject --database $Db --confirm-project $GcpProject"
Log "DONE. master = $NewMaster. The app is NOT live yet: Render deploys nothing on a push." 'Green'
Log '' 'White'
Log 'NOW, BY HAND, in this order (docs\rounds\2026-10-08-first-session-screens.md, section 7, How to ship):' 'White'
Log '1. Firebase console -> Firestore -> the named database -> Indexes: routinePresets (tier, scope) says Enabled' 'White'
Log '   (minutes). The starting routines are read meanwhile, by a scan of a small collection.' 'White'
Log "2. THE SEED, in PowerShell in THIS folder ($Root). It needs the service-account key from the project folder:" 'White'
Log "   $KeyPath  $(if ($HaveKey) { '(found)' } else { '(NOT FOUND: put the key there first, or change --key)' })" $(if ($HaveKey) { 'White' } else { 'Yellow' })
Log '   a. The dry run (reads only, writes nothing):' 'White'
Log "        $Seed" 'Cyan'
Log '      Read it: "The seed has not run here before.", then eleven "+ academy-..." lines, each with its day one,' 'White'
Log '      its road and its words, no "female" or "male" in a name, and "Nothing was written. Add --commit ...".' 'White'
Log '   b. Then the same line with --commit at the end. It ends "Wrote 11 starting routines to routinePresets".' 'White'
Log '      Run the dry run once more: every line says "already there". No head office default is marked (AJ''s' 'White'
Log '      "2a"): an administrator marks one in the app, or a trainer picks for a client whose intake names nothing.' 'White'
Log '      Until Render''s deploy, the older app on Render shows the eleven among head office''s templates in the' 'White'
Log '      Edit routine drawer (in place of its built-in list, if head office has none of its own yet); the new' 'White'
Log '      version leaves starting routines out of the drawer. Nothing else in the older app reads them.' 'White'
Log '3. THE iPad WALK, FIRST, BEFORE RENDER (AJ''s rule: at most two rounds shipped before an iPad walk, and' 'White'
Log '   several went live unwalked). Round 65 of docs\ops\TESTING-CHECKLIST.md, against this PC:' 'White'
Log '   - in THIS folder: npm run dev (port 3000; the first load after a while takes a minute or two);' 'White'
Log '   - the PC''s Wi-Fi address: Get-NetIPConfiguration. It must be in Firebase console -> Authentication ->' 'White'
Log '     Settings -> Authorized domains (yours to add) or the iPad''s sign-in is refused;' 'White'
Log '   - on the iPad, SAFARI at http://<that address>:3000, never the Home Screen icon (that is the live app);' 'White'
Log '   - the dev server writes to PRODUCTION, as the main checkout does: walk it on the test client Add Client' 'White'
Log '     makes ("New client, not in Mindbody yet"), upright and on its side, then once on a phone.' 'White'
Log '   Tell Claude what you find. Render waits until the walk is done.' 'White'
Log '4. Render -> maxstrength-app-beta -> Manual Deploy -> Deploy latest commit. Wait until it says Live' 'White'
Log "   on $NewMaster. Then check it: curl.exe -s https://maxstrength-app-beta.onrender.com/version.json" 'White'
Log '   (the version names the new build; if it still names the old one, wait a minute and ask again).' 'White'
Log '5. Render -> journey-cron-renewals -> Manual Build, then the same on journey-cron-leaderboards. The renewals' 'White'
Log '   job''s Journey step resolves the studio settings, which gained a kind of setting (a choice); keep all' 'White'
Log '   three on one commit: each build''s log ends on the new commit.' 'White'
Log '6. The iPads pick the new version up by themselves on the Hub (never over a session or while typing).' 'White'
Log '   Front-desk computers: reload the page.' 'White'
Log '7. In the app, when you choose (nothing waits on it):' 'White'
Log '   - an administrator may mark head office''s default starting routine: Admins -> Standard -> Standard' 'White'
Log '     template -> a routine -> For new clients -> head office''s default;' 'White'
Log '   - each studio''s leaders: My Studio -> Studio -> Starting routines (which ones, and the studio''s default),' 'White'
Log '     and This studio''s settings -> A new client starts with (A alone is Max Strength''s default).' 'White'
Log '8. The round document''s open questions wait for your answers (the plan''s door in the session''s corner,' 'White'
Log '   the neck''s starting weight); nothing is blocked on them.' 'White'
Log '' 'White'
Log 'TO UNDO (ask Claude first):' 'White'
Log "  git push --force origin ${RestoreTag}:master   then the same three Render buttons (steps 4 and 5)." 'White'
Log '  The rules and the index can stay: they only add access and a way to read. The seeded routines stay as' 'White'
Log '  head office''s templates (an administrator can delete any). Plans already kept stay on their routines,' 'White'
Log '  unread by the older app; a client kept with an EMPTY Routine A opens an empty routine there, and the' 'White'
Log '  trainer adds machines as before.' 'White'
$elapsed = [int]((Get-Date) - $Started).TotalMinutes
Log "Done in about $elapsed minute(s)." 'Green'
exit 0
