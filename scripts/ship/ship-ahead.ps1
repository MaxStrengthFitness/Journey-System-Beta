<#
 SCRIPT-VERSION: v1  (Oct 7 2026, Ahead)

 Ships branch oct7/ahead: Operations -> Ahead, beside Month, and the nightly
 renewal record's dates counted from the day Mindbody counted. AJ's answers
 to the proposal (docs\rounds\2026-10-07-ahead.md is the round): "1b 2a 3a".
 Built on master as it is on GitHub now (52108b56, the renewals dashboard).
 The branch, in order:

   - the renewals engine: the run-out day, the projection and the
     conversation's day count from the day Mindbody counted; the snapshot
     keeps the pace range and the run-out range (AJ's 2a; server\renewals-job.ts
     writes them, so the renewals cron must be rebuilt);
   - Ahead's pure half, its screen, what the iPad-size preview showed;
   - Week ahead's Further ahead line;
   - the docs.

 THE MINDBODY CHECK IS ANSWERED. Does a pricing option's Remaining drop when
 a visit is booked? Checked Oct 7 2026 from Journey's own synced data (read
 only): it does NOT (60 clients whose Remaining plus their bookings ahead
 exceeded what the option ever held; none the other way). The branch is
 built on that answer (MINDBODY_REMAINING_INCLUDES_BOOKED false), so golive
 does not ask.

 WHAT GOES TO PRODUCTION, in this order (golive, after GO):
   1. the restore tag restore/2026-10-07-before-ahead = master as it is now
      (52108b56), pushed to GitHub;
   2. git fetch again, master must not have moved, then
      git push origin oct7/ahead:master, fast-forward only.
 THEN, BY HAND, ON RENDER (golive prints it): a push deploys NOTHING on Render.
 The web service needs Manual Deploy, and BOTH cron jobs Manual Build
 (journey-cron-renewals carries the engine change; journey-cron-leaderboards
 to keep all three on one commit).
 No rules, no index, no Cloud Function; no Mindbody call, timer or cadence
 change; the only stored change is two optional fields on clients/{id}.renewal,
 written by the nightly job. Nothing contacts anyone.

 Run from the branch's own folder, .claude\worktrees\ahead. IN ORDER:

   powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-ahead.ps1 -Stage prepare
   powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-ahead.ps1 -Stage golive

 prepare  changes nothing in production and nothing in git (it writes only
          logs\, dist\ and build\): the branch, a clean tree, the fetch,
          that master is EXACTLY 52108b56, that the branch fast-forwards
          master, that rules, indexes and functions are unchanged, the
          restore tag free, no Windows line ends, the case check, the
          typecheck COUNT (2), the suite in Eastern time, the functions
          typecheck and tests, the builds (the app, the crons and the
          server), the first screen's size budget, and none of the perf
          lab's markers in the build. Ends PREPARE PASSED.

 golive   refuses unless the branch and master are exactly what prepare
          recorded, asks for GO, then does 1-2
          above and stops at the first failure. Then it prints the steps
          left for AJ by hand.

 To undo: git push --force origin restore/2026-10-07-before-ahead:master,
 then the same three Render buttons. The older renewals job ignores the two
 new fields.

 ASCII only on purpose (Windows PowerShell 5.1 reads a script as ANSI).
#>

param([Parameter(Mandatory = $true, Position = 0)][ValidateSet('prepare', 'golive')][string]$Stage)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $Root
$LogFile = Join-Path $Root 'logs\ship-ahead.log'
# What prepare tested: "<branch sha> <origin/master sha>". golive reads it.
$PreparedFile = Join-Path $Root 'logs\ship-ahead.prepared'
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $LogFile) | Out-Null
$Branch = 'oct7/ahead'
$Folder = '.claude\worktrees\ahead'
$RestoreTag = 'restore/2026-10-07-before-ahead'
# master on GitHub when this round was finished (Oct 7 2026): the renewals
# dashboard, live. The round was built and measured on exactly this commit.
$MasterMustBe = '52108b56'
# 2 since the Hub fixes (Oct 1): clinical-review/charts.tsx and
# EditTrainerModal.tsx. This round keeps the same two. More is new.
$TscBaseline = 2
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

Log "ship-ahead $Stage" 'White'

$top = (& git --no-optional-locks rev-parse --show-toplevel 2>$null)
if ($LASTEXITCODE -ne 0 -or -not (Test-Path 'package.json') -or -not (Test-Path 'scripts\ship\ship-ahead.ps1') -or ((Resolve-Path $top).Path -ne (Get-Location).Path)) { Stop-Here "run this from the top of the branch's folder, $Folder." }
foreach ($f in @('src\features\admin\ahead\AheadPage.tsx', 'src\features\admin\ahead\events.ts', 'src\features\renewals\projection.ts', 'server\renewals-job.ts', 'scripts\check-bundle-budget.mjs', 'docs\rounds\2026-10-07-ahead.md')) {
  if (-not (Test-Path $f)) { Stop-Here "$f is missing from this folder. Ask Claude." }
}

# ---- in the branch's folder, on the branch ------------------------------------------
$head = (& git --no-optional-locks symbolic-ref --quiet --short HEAD)
if ($LASTEXITCODE -ne 0 -or "$head".Trim() -ne $Branch) { Stop-Here "this folder is on '$head', not $Branch. Run it from $Folder, or ask Claude; do not switch branches by hand." }
$dirty = (& git --no-optional-locks status --porcelain --untracked-files=no -- src docs server server.ts scripts tests functions public index.html firestore.rules firestore.indexes.json firebase.json package.json package-lock.json vite.config.ts render.yaml CLAUDE.md ROADMAP.md) | Where-Object { $_ }
if ($dirty) {
  Log 'Uncommitted changes:' 'Red'
  $dirty | Select-Object -First 20 | ForEach-Object { Log "   $_" 'Red' }
  Stop-Here 'the branch has uncommitted changes. Everything that ships must be committed first (if git shows every file as changed but git diff shows nothing, ask Claude: that is line ends, not code).'
}
$untracked = (& git --no-optional-locks status --porcelain -- src tests server public functions\src) | Where-Object { "$_" -like '`?`? *' }
if ($untracked) {
  Log 'Files under src, tests, server, public or functions\src that git does not track:' 'Red'
  $untracked | ForEach-Object { Log "   $_" 'Red' }
  Stop-Here 'untracked files would be tested here but not shipped. Commit or remove them first.'
}

Log 'Fetching from GitHub (reads only)' 'Cyan'
& git fetch -q origin
if ($LASTEXITCODE -ne 0) { Stop-Here 'could not reach GitHub.' }

$MustBeSha = (& git --no-optional-locks rev-parse "$MasterMustBe^{commit}").Trim()
if ($LASTEXITCODE -ne 0) { Stop-Here "this checkout does not know $MasterMustBe (master when the round was finished). Ask Claude." }
$BranchSha = (& git --no-optional-locks rev-parse $Branch).Trim()
$MasterSha = (& git --no-optional-locks rev-parse origin/master).Trim()

if ($MasterSha -ne $MustBeSha) {
  Stop-Here "master is at $($MasterSha.Substring(0, 8)), not $MasterMustBe (the renewals dashboard, which this round was built and measured on). Something else went to master since. Ask Claude to merge it into $Branch and test again first."
}
Log "master is at $MasterMustBe (the renewals dashboard), as this round was built on." 'Green'

& git --no-optional-locks merge-base --is-ancestor origin/master $Branch
if ($LASTEXITCODE -ne 0) { Stop-Here "$Branch does not fast-forward master. Ask Claude." }

$ahead = (& git --no-optional-locks rev-list --count "origin/master..$Branch").Trim()
if ([int]$ahead -eq 0) { Log 'master already has everything on the branch. Nothing to ship.' 'Green'; exit 0 }
Log "$ahead commit(s) will go live:" 'Green'
& git --no-optional-locks log --oneline "origin/master..$Branch" | ForEach-Object { Log "   $_" }

# Nothing of this round needs the rules, an index or a function.
& git --no-optional-locks diff --quiet origin/master $Branch -- firestore.rules
if ($LASTEXITCODE -ne 0) { Stop-Here 'firestore.rules changed, and Ahead changes no rule. Ask Claude.' }
& git --no-optional-locks diff --quiet origin/master $Branch -- firestore.indexes.json
if ($LASTEXITCODE -ne 0) { Stop-Here 'firestore.indexes.json changed, and Ahead adds no index. Ask Claude.' }
$changedFn = @(& git --no-optional-locks diff --name-only origin/master $Branch -- functions | Where-Object { $_ })
if ($changedFn.Count -gt 0) {
  $changedFn | ForEach-Object { Log "   $_" 'Red' }
  Stop-Here 'functions\ changed, and Ahead changes no Cloud Function. Ask Claude.'
}
Log 'Against master: firestore.rules, indexes and functions unchanged. The push and Render are the whole deploy.' 'Green'

if ($Stage -eq 'prepare') {
  if (Test-Path $PreparedFile) { Remove-Item -Force $PreparedFile }

  Log 'What changes, by folder (src\ and server\ reach the app and the crons):' 'Yellow'
  & git --no-optional-locks diff --stat origin/master $Branch | Select-Object -Last 1 | ForEach-Object { Log "   $_" 'Yellow' }
  & git --no-optional-locks diff --dirstat=files,0 origin/master $Branch | ForEach-Object { Log "   $_" 'Yellow' }

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
  # and the suite fails on them although nothing is wrong (docs\KNOWN-TRAPS.md).
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

  Set-Content -Path $PreparedFile -Value "$BranchSha $MasterSha" -Encoding ascii
  Log "Tested: $Branch at $($BranchSha.Substring(0, 7)), master at $($MasterSha.Substring(0, 7))." 'Green'
  Log 'THE PLAN (golive, in this order, stopping at the first failure):' 'White'
  Log "  1. Tag master as it is now: $RestoreTag = $($MasterSha.Substring(0, 7)), and push the tag." 'White'
  Log "  2. git push origin ${Branch}:master (fast-forward only)." 'White'
  Log '  (no rules, no index and no Cloud Function: none changed)' 'White'
  Log '  Then, by hand: Render (Manual Deploy on the web service, Manual Build on both crons), Round 64.' 'White'
  Log 'PREPARE PASSED. Next: powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-ahead.ps1 -Stage golive' 'Green'
  exit 0
}

# ---- golive ------------------------------------------------------------------------
if (-not (Test-Path $PreparedFile)) { Stop-Here 'prepare has not passed on this PC. Run prepare first.' }
$prepared = ((Get-Content -Path $PreparedFile -Raw).Trim()) -split '\s+'
if ($prepared.Count -ne 2 -or $prepared[0] -ne $BranchSha) { Stop-Here "$Branch has changed since prepare passed, so this commit has not been tested. Run prepare again." }
if ($prepared[1] -ne $MasterSha) { Stop-Here "master has moved since prepare passed (tested against $($prepared[1].Substring(0, 7)), now $($MasterSha.Substring(0, 7))). Ask Claude." }
Log "prepare passed on this commit ($($BranchSha.Substring(0, 7))) onto this master ($($MasterSha.Substring(0, 7)))." 'Green'

Write-Host ''
Write-Host 'Ahead:' -ForegroundColor Yellow
Write-Host '  Operations gains Ahead beside Month: the weeks ahead with each client''s dates, and every' -ForegroundColor Yellow
Write-Host '  client''s two clocks on one line; Week ahead ends with Further ahead. The nightly renewal' -ForegroundColor Yellow
Write-Host '  record counts its dates from the day Mindbody counted, with their ranges: a client last' -ForegroundColor Yellow
Write-Host '  pulled weeks ago gets an earlier run-out day, by about the sessions used since the pull.' -ForegroundColor Yellow
Write-Host 'This tags the restore point, then pushes to master. On Render nothing happens until YOU press' -ForegroundColor Yellow
Write-Host 'Manual Deploy (web service) and Manual Build (both crons); golive prints the steps.' -ForegroundColor Yellow
Write-Host 'No rules, no index, no Cloud Function; nothing is asked of Mindbody; nothing contacts anyone.' -ForegroundColor Yellow
Write-Host ''
if ((Read-Host 'AJ: type GO to tag and push') -ne 'GO') { Log 'Nothing tagged or pushed.' 'Yellow'; exit 0 }
Log 'AJ typed GO: Ahead.' 'White'

# 1. The restore point: master as it is now.
$tagOnGitHub = & git --no-optional-locks ls-remote --tags origin "refs/tags/$RestoreTag"
if ($LASTEXITCODE -ne 0) { Stop-Here 'could not ask GitHub for its tags. Nothing was pushed.' }
if (-not $tagOnGitHub) {
  $local = & git --no-optional-locks tag -l $RestoreTag
  if (-not $local) {
    & git tag $RestoreTag origin/master
    if ($LASTEXITCODE -ne 0) { Stop-Here "could not make the restore tag $RestoreTag. Nothing was pushed." }
  } else {
    $tagSha = (& git --no-optional-locks rev-parse "$RestoreTag^{commit}").Trim()
    if ($tagSha -ne $MasterSha) { Stop-Here "the restore tag $RestoreTag on this PC is not master as it is now. Ask Claude to remove it; nothing was pushed." }
  }
  $tp = Run "push the restore tag $RestoreTag" "git push origin refs/tags/$RestoreTag"
  Must $tp 'pushing the restore tag (nothing was pushed to master)'
} else {
  $remoteSha = ("$tagOnGitHub" -split '\s+')[0]
  if ($remoteSha -ne $MasterSha) { Stop-Here "the restore tag $RestoreTag on GitHub is not master as it is now. Ask Claude; nothing was pushed." }
}
Log "Restore point on GitHub: $RestoreTag = $($MasterSha.Substring(0, 7))" 'Green'

# 2. The push, fast-forward only (git refuses anything else without --force,
#    which this script never passes). Checked again against GitHub first.
& git fetch -q origin
if ($LASTEXITCODE -ne 0) { Stop-Here 'could not reach GitHub before the push. Nothing was pushed. Run golive again once GitHub answers.' }
if ((& git --no-optional-locks rev-parse origin/master).Trim() -ne $MasterSha) { Stop-Here 'master moved while golive ran. Nothing was pushed. Ask Claude.' }
& git --no-optional-locks merge-base --is-ancestor origin/master $Branch
if ($LASTEXITCODE -ne 0) { Stop-Here "$Branch no longer fast-forwards master. Nothing was pushed. Ask Claude." }
$push = Run "git push origin ${Branch}:master" "git push origin ${Branch}:master"
Must $push 'the push'

$NewMaster = (& git --no-optional-locks rev-parse --short origin/master).Trim()
Log "PUSHED. master = $NewMaster. The app is NOT live yet: Render deploys nothing on a push." 'Green'
Log '' 'White'
Log 'NOW, BY HAND, in this order (docs\rounds\2026-10-07-ahead.md):' 'White'
Log '1. Render -> maxstrength-app-beta -> Manual Deploy -> Deploy latest commit. Wait until it says Live' 'White'
Log "   on $NewMaster. Then check it: curl.exe -s https://maxstrength-app-beta.onrender.com/version.json" 'White'
Log '   (the version names the new build; if it still names the old one, wait a minute and ask again).' 'White'
Log '2. Render -> journey-cron-renewals -> Manual Build, then the same on journey-cron-leaderboards.' 'White'
Log '   The renewals cron writes the new fields (the pace range, the run-out range) and counts the dates' 'White'
Log '   from the day Mindbody counted. Keep all three on one commit: each build''s log ends on the new commit.' 'White'
Log '   The renewals job runs at 2:30 AM Eastern; until then Ahead draws the dates the record already has.' 'White'
Log '3. The iPads pick the new version up by themselves on the Hub (never over a session or while typing).' 'White'
Log '   Front-desk computers: reload the page.' 'White'
Log '4. The morning after the renewals job''s first run on the new commit: walk Round 64 of' 'White'
Log '   docs\ops\TESTING-CHECKLIST.md (Ahead), upright and on its side.' 'White'
Log '   On Renewals, a client last pulled from Mindbody weeks ago now says an earlier run-out day: that is the fix.' 'White'
Log '' 'White'
Log 'TO UNDO (ask Claude first):' 'White'
Log "  git push --force origin ${RestoreTag}:master   then the same three Render buttons (steps 1 and 2)." 'White'
Log '  The older renewals job ignores the two new fields; nothing else was stored.' 'White'
$elapsed = [int]((Get-Date) - $Started).TotalMinutes
Log "Done in about $elapsed minute(s)." 'Green'
exit 0
