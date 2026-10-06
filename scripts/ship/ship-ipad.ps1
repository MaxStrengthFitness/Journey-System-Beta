# SUPERSEDED by scripts/ship/ship-release.ps1 (Oct 6 2026, AJ: "we will ship everything together"); this one would refuse anyway, its master check no longer matches.
<#
 SCRIPT-VERSION: v1  (Oct 6 2026, the iPad round)

 Ships branch oct6/ipad: the iPad round. AJ, Oct 5 2026: "we really need
 our app to run fast on devices like ipads even 10th generation ipads and
 ipad minis". docs/rounds/2026-10-06-ipad.md is the round. On the speed
 round (oct5/speed, 3735f38e), merged:

   - the perf lab (harness/perf-lab/): emulators, a seeded studio, headless
     Chrome slowed to an iPad. It NEVER ships: a lab build is refused into
     dist\ and on Render, and prepare checks the production build for the
     lab's markers;
   - the CPU group: studio time without asking Intl each call, a day in
     words from a cached formatter, one client's change rebuilding one
     client and one Directory row, the minute no longer redrawing the
     Directory or Operations, Today's journeys in a tenth of the time,
     bounded memories on a shared iPad;
   - the paint group: no blur behind dialogs, sheets, toasts and sticky
     bars; one short shadow on list cards; marks that beat three times and
     rest; a lighter Hub card;
   - the review's look fixes, and the docs.

 WHAT GOES TO PRODUCTION (golive, after GO): the restore tag
 restore/2026-10-06-before-ipad = master as it is now, then
 git push origin oct6/ipad:master (fast-forward only): Render deploys the
 app, the server and the crons. Indexes, rules and Cloud Functions are
 deployed ONLY if they changed on the branch; on this branch none did, so
 the push is all. No Mindbody call, timer or cadence changes; nothing
 contacts anyone. The roster split (the Firestore structure change) is NOT
 here: it is branch oct6/ipad-data and ship-ipad-roster.ps1, only with
 AJ's OK.

 SHIP THE SPEED ROUND FIRST. This branch was built and tested on it, so
 master must be EXACTLY 3735f38e (ship-speed.ps1's golive leaves it there).
 Anything else: stop.

 Run from the branch's own folder, .claude\worktrees\ipad (it is on the
 branch already; do not switch branches by hand). IN ORDER:

   powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-ipad.ps1 -Stage prepare
   powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-ipad.ps1 -Stage golive

 prepare  changes nothing in production and nothing in git (it writes only
          logs\, dist\ and build\): the branch, a clean tree, the fetch,
          that master is EXACTLY 3735f38e, that the branch fast-forwards
          master, what goes live, the restore tag free, no Windows line
          ends, the case check, the typecheck COUNT (2), the suite in
          Eastern time, the build (the app, the crons and the server), the
          first screen's size budget, that the build carries none of the
          perf lab's markers, and the rules tests and the functions' checks
          ONLY if those changed. It records what it tested in
          logs\ship-ipad.prepared. Ends PREPARE PASSED.

 golive   refuses unless the branch and master are exactly what prepare
          recorded, asks for GO, tags, deploys what changed (nothing but
          the push on this branch), pushes, and prints what is left for AJ
          by hand (the iPad walk, Round 59; the lab's A/B).

 To undo: push the restore tag to master (ask Claude first).

 ASCII only on purpose (Windows PowerShell 5.1 reads a script as ANSI).
#>

param([Parameter(Mandatory = $true, Position = 0)][ValidateSet('prepare', 'golive')][string]$Stage)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $Root
$LogFile = Join-Path $Root 'logs\ship-ipad.log'
# What prepare tested: "<branch sha> <origin/master sha>". golive reads it.
$PreparedFile = Join-Path $Root 'logs\ship-ipad.prepared'
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $LogFile) | Out-Null
$Branch = 'oct6/ipad'
$Folder = '.claude\worktrees\ipad'
$RestoreTag = 'restore/2026-10-06-before-ipad'
# The speed round, which this branch was built and tested on. master must
# be exactly this: ship-speed.ps1 first.
$MasterMustBe = '3735f38e'
# 2 since the Hub fixes (Oct 1): clinical-review/charts.tsx and
# EditTrainerModal.tsx. The iPad round kept the same two. More is new.
$TscBaseline = 2
# Cloud Functions this script would deploy, named one by one (never a plain
# --only functions, docs\KNOWN-TRAPS.md). None: the round changed none, and
# if functions\ changed anyway the script stops rather than guess.
$DeployFunctions = ''
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

Log "ship-ipad $Stage" 'White'

# The branch's own worktree folder. Nothing here reads Firestore with a
# service account, so service-account.json is not needed (a worktree has no
# copy, on purpose).
$top = (& git --no-optional-locks rev-parse --show-toplevel 2>$null)
if ($LASTEXITCODE -ne 0 -or -not (Test-Path 'package.json') -or -not (Test-Path 'scripts\ship\ship-ipad.ps1') -or ((Resolve-Path $top).Path -ne (Get-Location).Path)) { Stop-Here "run this from the top of the branch's folder, $Folder." }

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

$MustBeSha = (& git --no-optional-locks rev-parse "$MasterMustBe^{commit}").Trim()
if ($LASTEXITCODE -ne 0) { Stop-Here "this checkout does not know $MasterMustBe (the speed round). Ask Claude." }
$BranchSha = (& git --no-optional-locks rev-parse $Branch).Trim()
$MasterSha = (& git --no-optional-locks rev-parse origin/master).Trim()

if ($MasterSha -ne $MustBeSha) {
  Stop-Here "master is at $($MasterSha.Substring(0, 8)), not $MasterMustBe (the speed round, which this round was built and tested on). Ship ship-speed.ps1 first, or ask Claude."
}
Log "master is at $MasterMustBe (the speed round), as the round was built on." 'Green'

& git --no-optional-locks merge-base --is-ancestor origin/master $Branch
if ($LASTEXITCODE -ne 0) { Stop-Here "$Branch does not fast-forward master. Ask Claude." }

$ahead = (& git --no-optional-locks rev-list --count "origin/master..$Branch").Trim()
if ([int]$ahead -eq 0) { Log 'master already has everything on the branch. Nothing to ship.' 'Green'; exit 0 }
Log "$ahead commit(s) will go live (first-parent line below):" 'Green'
& git --no-optional-locks log --oneline --first-parent "origin/master..$Branch" | ForEach-Object { Log "   $_" }

# What changed decides what golive deploys besides the push.
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
$NeedsFirebase = ($RulesChanged -or $IndexesChanged -or $FunctionsChanged)

if ($Stage -eq 'prepare') {
  if (Test-Path $PreparedFile) { Remove-Item -Force $PreparedFile }

  Log ('firestore.rules: ' + $(if ($RulesChanged) { 'CHANGED (golive runs the rules tests again, then deploys them)' } else { 'unchanged. golive deploys no rules.' })) $(if ($RulesChanged) { 'Yellow' } else { 'Green' })
  Log ('firestore.indexes.json: ' + $(if ($IndexesChanged) { 'CHANGED (golive deploys the indexes first, never deleting one)' } else { 'unchanged. golive deploys no indexes.' })) $(if ($IndexesChanged) { 'Yellow' } else { 'Green' })
  Log ('functions\: ' + $(if ($FunctionsChanged) { "CHANGED (golive deploys $DeployFunctions)" } else { 'unchanged. golive deploys no functions.' })) $(if ($FunctionsChanged) { 'Yellow' } else { 'Green' })
  Log 'server, render.yaml, index.html and vite.config.ts changes (Render deploys them with the push):' 'Yellow'
  & git --no-optional-locks diff --stat origin/master $Branch -- server server.ts render.yaml index.html vite.config.ts | ForEach-Object { Log "   $_" 'Yellow' }

  if ($NeedsFirebase) {
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
  # the CRLF traps). Git stores LF either way.
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
  # A longer per-test limit: a few file-walking style tests can pass vitest's
  # default 5 s on a loaded PC, and a timeout is not a failure of the app.
  $vt = Run 'the suite (TZ=America/New_York)' 'npx vitest run --dir src --testTimeout=30000'
  Must $vt 'the test suite'

  if ($FunctionsChanged) {
    $ftc = Run 'the functions typecheck' 'cd functions && npx tsc --noEmit -p .'
    Must $ftc 'the functions typecheck'
    $ft = Run 'the functions tests (TZ=America/New_York)' 'npx vitest run --dir functions/src'
    Must $ft 'the functions tests'
  }

  # A production build: NODE_ENV unset (a "test" build ships React's
  # development files, and the budget refuses it), and never the lab's flag.
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

  # The perf lab never ships. vite.config.ts refuses a lab build into dist\
  # and the server refuses to serve one; this checks the build itself.
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

  if ($RulesChanged) { Run-RulesTests 'Nothing is deployed or pushed.' }

  Set-Content -Path $PreparedFile -Value "$BranchSha $MasterSha" -Encoding ascii
  Log "Tested: $Branch at $($BranchSha.Substring(0, 7)), master at $($MasterSha.Substring(0, 7))." 'Green'
  Log 'THE PLAN (golive, in this order, stopping at the first failure):' 'White'
  Log "  1. Tag master as it is now: $RestoreTag = $($MasterSha.Substring(0, 7)), and push the tag." 'White'
  if ($IndexesChanged) { Log "  2. npx firebase deploy --only firestore:indexes --project $Project --non-interactive" 'White' } else { Log '  2. (no index change: skipped)' 'White' }
  if ($RulesChanged) { Log "  3. npm run test:rules again, then npx firebase deploy --only firestore:rules --project $Project" 'White' } else { Log '  3. (no rules change: skipped)' 'White' }
  if ($FunctionsChanged) { Log "  4. npx firebase deploy --only $DeployFunctions --project $Project" 'White' } else { Log '  4. (no functions change: skipped)' 'White' }
  Log "  5. git push origin ${Branch}:master (fast-forward only). Render deploys the app, the server and the crons." 'White'
  Log 'PREPARE PASSED. Next: powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-ipad.ps1 -Stage golive' 'Green'
  exit 0
}

# ---- golive ------------------------------------------------------------------------
if (-not (Test-Path $PreparedFile)) { Stop-Here 'prepare has not passed on this PC. Run prepare first.' }
$prepared = ((Get-Content -Path $PreparedFile -Raw).Trim()) -split '\s+'
if ($prepared.Count -ne 2 -or $prepared[0] -ne $BranchSha) { Stop-Here "$Branch has changed since prepare passed, so this commit has not been tested. Run prepare again." }
if ($prepared[1] -ne $MasterSha) { Stop-Here "master has moved since prepare passed (tested against $($prepared[1].Substring(0, 7)), now $($MasterSha.Substring(0, 7))). Ask Claude." }
Log "prepare passed on this commit ($($BranchSha.Substring(0, 7))) onto this master ($($MasterSha.Substring(0, 7)))." 'Green'
if ($FunctionsChanged) {
  # The functions deploy builds functions\ from THIS folder.
  & git --no-optional-locks diff --quiet HEAD -- functions
  if ($LASTEXITCODE -ne 0) { Stop-Here 'there are uncommitted changes under functions\, and they would deploy. Ask Claude.' }
}

Write-Host ''
Write-Host 'This tags the restore point, then deploys to PRODUCTION, in order:' -ForegroundColor Yellow
if ($IndexesChanged) { Write-Host '  the Firestore indexes,' -ForegroundColor Yellow }
if ($RulesChanged) { Write-Host '  firestore.rules (after the rules tests pass again),' -ForegroundColor Yellow }
if ($FunctionsChanged) { Write-Host "  the Cloud Functions $DeployFunctions," -ForegroundColor Yellow }
Write-Host '  then pushes to master, which deploys the app, the server and the crons on Render.' -ForegroundColor Yellow
if (-not $NeedsFirebase) { Write-Host '  (No indexes, rules or Cloud Functions changed: the push is the whole release.)' -ForegroundColor Yellow }
Write-Host 'The roster split (the Firestore structure change) is NOT in this push.' -ForegroundColor Yellow
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

# 2. The indexes, only if they changed (never deleting one).
if ($IndexesChanged) {
  $idx = Run "deploy firestore.indexes.json (project $Project)" "npx firebase deploy --only firestore:indexes --project $Project --non-interactive"
  if ($idx.Code -ne 0) { Stop-Here 'the index deploy failed. The live app, its rules and its functions are unchanged and nothing was pushed.' }
  Log 'Indexes deployed (they finish building by themselves).' 'Green'
}

# 3. The rules, only if they changed: the tests again first (AJ's run counts).
if ($RulesChanged) {
  Run-RulesTests 'Any indexes are deployed (harmless); the rules, the functions and the app are unchanged and nothing was pushed.'
  $rules = Run "deploy firestore.rules (project $Project)" "npx firebase deploy --only firestore:rules --project $Project"
  if ($rules.Code -ne 0) { Stop-Here 'the rules deploy failed. The functions and the app are unchanged and nothing was pushed.' }
  Log 'Rules deployed to production.' 'Green'
}

# 4. The functions, only if they changed, by name.
if ($FunctionsChanged) {
  Log "--- deploy $DeployFunctions (output on screen, not in the log) ---" 'Cyan'
  & cmd /c "npx firebase deploy --only $DeployFunctions --project $Project"
  if ($LASTEXITCODE -ne 0) { Stop-Here 'the functions deploy failed. The app is unchanged and nothing was pushed. Ask Claude.' }
  Log "Deployed: $DeployFunctions" 'Green'
}

# 5. The push, fast-forward only (git refuses anything else without --force,
#    which this script never passes). Checked again against GitHub first.
& git fetch -q origin
if ($LASTEXITCODE -ne 0) { Stop-Here 'could not reach GitHub before the push. The app is unchanged. Run golive again once GitHub answers.' }
if ((& git --no-optional-locks rev-parse origin/master).Trim() -ne $MasterSha) { Stop-Here 'master moved while golive ran. The app is unchanged. Ask Claude.' }
& git --no-optional-locks merge-base --is-ancestor origin/master $Branch
if ($LASTEXITCODE -ne 0) { Stop-Here "$Branch no longer fast-forwards master. The app is unchanged. Ask Claude." }
$push = Run "git push origin ${Branch}:master" "git push origin ${Branch}:master"
Must $push 'the push (Render deploys from it). The app is unchanged'

$newMaster = (& git --no-optional-locks rev-parse --short origin/master).Trim()
Log "GOLIVE COMPLETE. master = $newMaster." 'Green'
Log 'When Render shows the deploy Live, each iPad picks the new version up on the Hub by itself' 'Green'
Log '(never over a session or while typing). Front-desk computers: reload the page.' 'Green'
Log '' 'White'
Log 'NOW, BY HAND (docs\rounds\2026-10-06-ipad.md, "For AJ"):' 'White'
Log '1. Walk Round 59 of docs\ops\TESTING-CHECKLIST.md on a 10th-gen iPad or a mini (and an older iPad if' 'White'
Log '   the studio has one): the opens timed, a session, the profile, Today, the Directory, every visible change' 'White'
Log '   upright and on its side, light and dark. Write every time down: they are the first real numbers.' 'White'
Log '2. Render -> Logs, search  type: ''boot''  : write down hub-data for your cold opens beside the stopwatch.' 'White'
Log '3. If a Mac is at hand: Safari Web Inspector -> Timelines -> Rendering Frames on the iPad (Round 59''s last part).' 'White'
Log '4. The lab A/B on the merged build is still owed (about an hour on this PC, nothing else heavy running):' 'White'
Log '     node harness/perf-lab/lab.mjs build --as after        (here, in this folder)' 'White'
Log '     node harness/perf-lab/lab.mjs build --as before       (in a checkout of 7aca6195; ask Claude to make one)' 'White'
Log '     node harness/perf-lab/lab.mjs run --build-a before --build-b after' 'White'
Log '5. The roster split is a separate decision (the Firestore structure change): ship-ipad-roster.ps1 from' 'White'
Log '   .claude\worktrees\ipad-data, ONLY with your OK, and only after this push.' 'White'
Log '' 'White'
Log "TO UNDO: push $RestoreTag to master (ask Claude first: git push --force origin ${RestoreTag}:master)." 'White'
$elapsed = [int]((Get-Date) - $Started).TotalMinutes
Log "Done in about $elapsed minute(s)." 'Green'
exit 0
