<#
 SCRIPT-VERSION: v1  (Oct 10 2026, the rooms round: the room bar and the Calendar)

 Ships branch oct10/rooms-calendar: the first room of AJ's design round
 (docs\rounds\2026-10-10-rooms-calendar.md is the round). AJ, Oct 10 2026:
 "each place should feel a bit different but the same so it feels like one
 app", then "take charge, i love the ideas" (the picks 1b, 2a, 3b). Built on
 master as it is on GitHub (609c2977, the pre-launch round, live on Render
 since Oct 10 2026). In it: the shared room bar and the room hues
 (src\features\rooms\), and the Calendar as its first room: the room bar,
 a quiet Month, the Day as the Hub's grid, the Week as the week's bookings,
 an unread day never drawn as empty.

 WHAT GOES TO PRODUCTION: nothing in Firestore (no rules, no index, no Cloud
 Function, no Mindbody call). golive only tags the restore point and pushes;
 the app goes live when AJ presses Render's buttons, after his walk.

 Run from the branch's own folder (it is on the branch already; do not switch
 branches by hand). IN ORDER:

   powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-rooms-calendar.ps1 -Stage prepare
   powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-rooms-calendar.ps1 -Stage golive

 prepare  changes nothing in production and nothing in git (it reads GitHub
          with git ls-remote and writes only logs\, dist\ and build\): the
          branch, a clean tree, that master on GitHub is 609c2977 or already
          the branch's head, that the branch fast-forwards it, that no rules,
          index, function, server or render.yaml file changed, no Windows line
          ends, the case check, the typecheck COUNT (2), the suite in Eastern
          time, the functions typecheck and tests, the builds, the size budget,
          no perf lab or PC-build marker in the build. Ends PREPARE PASSED.

 golive   refuses unless the branch is exactly what prepare tested and master
          is 609c2977 or the branch's head, asks for GO, then makes the restore
          tag restore/2026-10-10-before-rooms-calendar = 609c2977 (pushed if it
          is not on GitHub yet) and pushes oct10/rooms-calendar to master,
          fast-forward only. Then it prints Render's three presses.

 To undo: git push --force origin restore/2026-10-10-before-rooms-calendar:master,
 then Render's three presses. Nothing in Firestore changed.

 ASCII only on purpose (Windows PowerShell 5.1 reads a script as ANSI).
#>

param([Parameter(Mandatory = $true, Position = 0)][ValidateSet('prepare', 'golive')][string]$Stage)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $Root
$LogFile = Join-Path $Root 'logs\ship-rooms-calendar.log'
$PreparedFile = Join-Path $Root 'logs\ship-rooms-calendar.prepared'
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $LogFile) | Out-Null
$Branch = 'oct10/rooms-calendar'
$RestoreTag = 'restore/2026-10-10-before-rooms-calendar'
# master on GitHub when this round began (git ls-remote, Oct 10 2026): the
# pre-launch round, live on Render that evening.
$MasterBase = '609c2977'
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

function Get-RemoteMaster {
  $line = & git --no-optional-locks ls-remote origin refs/heads/master
  if ($LASTEXITCODE -ne 0 -or -not $line) { return $null }
  return ("$line" -split '\s+')[0].Trim()
}

Log "ship-rooms-calendar $Stage" 'White'

$top = (& git --no-optional-locks rev-parse --show-toplevel 2>$null)
if ($LASTEXITCODE -ne 0 -or -not (Test-Path 'package.json') -or -not (Test-Path 'scripts\ship\ship-rooms-calendar.ps1') -or ((Resolve-Path $top).Path -ne (Get-Location).Path)) { Stop-Here "run this from the top of the branch's folder." }
foreach ($f in @('src\features\rooms\RoomBar.tsx', 'src\features\rooms\rooms.css', 'src\features\calendar\DayView.tsx', 'src\features\calendar\WeekView.tsx', 'src\components\CalendarView.tsx', 'scripts\check-bundle-budget.mjs', 'docs\rounds\2026-10-10-rooms-calendar.md')) {
  if (-not (Test-Path $f)) { Stop-Here "$f is missing from this folder. Ask Claude." }
}

$head = (& git --no-optional-locks symbolic-ref --quiet --short HEAD)
if ($LASTEXITCODE -ne 0 -or "$head".Trim() -ne $Branch) { Stop-Here "this folder is on '$head', not $Branch. Ask Claude; do not switch branches by hand." }
$dirty = (& git --no-optional-locks status --porcelain --untracked-files=no -- src docs server server.ts scripts tests functions public harness index.html firestore.rules firestore.indexes.json firebase.json package.json package-lock.json vite.config.ts render.yaml CLAUDE.md ROADMAP.md .github) | Where-Object { $_ }
if ($dirty) {
  $dirty | Select-Object -First 20 | ForEach-Object { Log "   $_" 'Red' }
  Stop-Here 'the branch has uncommitted changes. Everything that ships must be committed first.'
}
$untracked = (& git --no-optional-locks status --porcelain -- src tests server public scripts functions\src) | Where-Object { "$_" -like '`?`? *' }
if ($untracked) {
  $untracked | ForEach-Object { Log "   $_" 'Red' }
  Stop-Here 'untracked files would be tested here but not shipped. Commit or remove them first.'
}

Log 'Asking GitHub where master is (git ls-remote, reads only)' 'Cyan'
$MasterSha = Get-RemoteMaster
if (-not $MasterSha) { Stop-Here 'could not reach GitHub.' }
$BaseSha = (& git --no-optional-locks rev-parse "$MasterBase^{commit}").Trim()
if ($LASTEXITCODE -ne 0) { Stop-Here "this checkout does not know $MasterBase. Ask Claude." }
$BranchSha = (& git --no-optional-locks rev-parse $Branch).Trim()

if ($MasterSha -eq $BaseSha) {
  $MasterPushed = $false
  Log "master on GitHub is $MasterBase (the pre-launch round), before this round: golive pushes the branch." 'Green'
} elseif ($MasterSha -eq $BranchSha) {
  $MasterPushed = $true
  Log "master on GitHub is already this branch's head ($($BranchSha.Substring(0, 8))). golive makes the restore tag and pushes nothing." 'Green'
} else {
  Stop-Here "master on GitHub is $($MasterSha.Substring(0, 8)): neither $MasterBase nor this branch's head ($($BranchSha.Substring(0, 8))). Something else went to master. Ask Claude to bring it into $Branch and test again first."
}

& git --no-optional-locks merge-base --is-ancestor $BaseSha $Branch
if ($LASTEXITCODE -ne 0) { Stop-Here "$Branch does not build on $MasterBase, so it would not fast-forward master. Ask Claude." }
$inRound = (& git --no-optional-locks rev-list --count "$BaseSha..$Branch").Trim()
Log "$inRound commit(s) in this round (on top of $MasterBase):" 'Green'
& git --no-optional-locks log --oneline "$BaseSha..$Branch" | ForEach-Object { Log "   $_" }

foreach ($p in @('firestore.rules', 'firestore.indexes.json', 'functions', 'server', 'server.ts', 'render.yaml', 'package.json', 'package-lock.json')) {
  & git --no-optional-locks diff --quiet $BaseSha $Branch -- $p
  if ($LASTEXITCODE -ne 0) { Stop-Here "$p changed in this round, and this script deploys nothing to Firestore, Functions or the server. Ask Claude." }
}
Log "Against ${MasterBase}: no rules, index, function, server, render.yaml or package change. Only the app changes." 'Green'

if ($Stage -eq 'prepare') {
  if (Test-Path $PreparedFile) { Remove-Item -Force $PreparedFile }
  & git --no-optional-locks diff --stat $BaseSha $Branch | Select-Object -Last 1 | ForEach-Object { Log "   $_" 'Yellow' }

  $tagOnGitHub = & git --no-optional-locks ls-remote --tags origin "refs/tags/$RestoreTag"
  if ($LASTEXITCODE -ne 0) { Stop-Here 'could not ask GitHub for its tags.' }
  if ($tagOnGitHub) {
    if ((("$tagOnGitHub" -split '\s+')[0]) -ne $BaseSha) { Stop-Here "the restore tag $RestoreTag on GitHub is not $MasterBase. Ask Claude." }
    Log "Restore tag $RestoreTag is already on GitHub at $MasterBase." 'Green'
  } else {
    if (& git --no-optional-locks tag -l $RestoreTag) {
      if ((& git --no-optional-locks rev-parse "$RestoreTag^{commit}").Trim() -ne $BaseSha) { Stop-Here "the restore tag $RestoreTag on this PC is not $MasterBase. Ask Claude to remove it." }
    }
    Log "Restore tag ${RestoreTag}: golive pushes it at $MasterBase (master before this round)." 'Green'
  }

  $crlf = @(& git --no-optional-locks ls-files --eol | Where-Object { "$_" -match 'w/crlf' })
  if ($crlf.Count -gt 0) {
    $crlf | Select-Object -First 10 | ForEach-Object { Log "   $_" 'Red' }
    Stop-Here "$($crlf.Count) file(s) in this folder have Windows line ends (CRLF), and the suite fails on them. Ask Claude to convert them to LF."
  }
  Log 'Line ends: every file in this folder is LF.' 'Green'
  $dups = @(& git --no-optional-locks ls-files | ForEach-Object { $_.ToLowerInvariant() } | Group-Object | Where-Object { $_.Count -gt 1 })
  if ($dups.Count -gt 0) { $dups | ForEach-Object { Log "   $($_.Name)" 'Red' }; Stop-Here 'two tracked files differ only by case.' }
  Log 'Case check: no two files differ only by case.' 'Green'

  $tsc = Run 'typecheck' 'npx tsc --noEmit'
  $errs = @($tsc.Output | Where-Object { "$_" -match 'error TS' }).Count
  Log "tsc errors: $errs (baseline $TscBaseline)" $(if ($errs -eq $TscBaseline) { 'Green' } else { 'Red' })
  if ($errs -gt $TscBaseline) { Stop-Here 'more typecheck errors than the baseline.' }

  $env:TZ = 'America/New_York'
  $vt = Run 'the suite (TZ=America/New_York)' 'npx vitest run --dir src --testTimeout=30000'
  Must $vt 'the test suite'
  Push-Location 'functions'
  try { $ftc = Run 'the functions typecheck' 'npx tsc --noEmit -p .' } finally { Pop-Location }
  Must $ftc 'the functions typecheck'
  $ft = Run 'the functions tests (TZ=America/New_York)' 'npx vitest run --dir functions/src'
  Must $ft 'the functions tests'

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

  if (Test-Path 'dist\PERF-LAB-BUILD.txt') { Stop-Here 'dist\ is a perf lab build. It must never ship. Ask Claude.' }
  $marks = @('__perfLab', 'demo-perf-lab', '127.0.0.1:8085', '127.0.0.1:9099', 'connectFirestoreEmulator', 'connectAuthEmulator', 'PC build')
  $built = @(Get-ChildItem -Path 'dist' -Recurse -File -Include '*.js', '*.css', '*.html')
  if ($built.Count -eq 0) { Stop-Here 'dist\ holds no built files. Ask Claude.' }
  $found = @($built | Select-String -SimpleMatch -Pattern $marks -List)
  if ($found.Count -gt 0) {
    $found | Select-Object -First 10 | ForEach-Object { Log "   $($_.Path): $($_.Pattern)" 'Red' }
    Stop-Here 'the production build carries the perf lab''s emulator code or the PC build''s mark. Ask Claude.'
  }
  Log "No perf lab marker and no PC-build mark in the $($built.Count) built files." 'Green'

  Set-Content -Path $PreparedFile -Value "$BranchSha $MasterSha" -Encoding ascii
  Log "Tested: $Branch at $($BranchSha.Substring(0, 7)), master on GitHub at $($MasterSha.Substring(0, 7))." 'Green'
  Log 'THE PLAN (golive): the restore tag, then the push (fast-forward only). Nothing in Firestore.' 'White'
  Log 'PREPARE PASSED. Next: powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-rooms-calendar.ps1 -Stage golive' 'Green'
  exit 0
}

# ---- golive ------------------------------------------------------------------------
if (-not (Test-Path $PreparedFile)) { Stop-Here 'prepare has not passed on this PC. Run prepare first.' }
$prepared = ((Get-Content -Path $PreparedFile -Raw).Trim()) -split '\s+'
if ($prepared.Count -ne 2 -or $prepared[0] -ne $BranchSha) { Stop-Here "$Branch has changed since prepare passed. Run prepare again." }

Write-Host ''
Write-Host 'The rooms round: the room bar and its hues, and the Calendar as the first room (a quiet Month, the Day' -ForegroundColor Yellow
Write-Host '  as the Hub''s grid, the Week as the week''s bookings). Nothing changes in Firestore.' -ForegroundColor Yellow
if ($MasterPushed) { Write-Host 'This makes the restore tag and pushes nothing (master is already this commit).' -ForegroundColor Yellow } else { Write-Host 'This makes the restore tag, then pushes to master. Render deploys nothing until you press its buttons.' -ForegroundColor Yellow }
Write-Host ''
if ((Read-Host 'AJ: type GO to tag and push') -ne 'GO') { Log 'Nothing tagged or pushed.' 'Yellow'; exit 0 }
Log 'AJ typed GO: the rooms round, the Calendar.' 'White'

$tagOnGitHub = & git --no-optional-locks ls-remote --tags origin "refs/tags/$RestoreTag"
if ($LASTEXITCODE -ne 0) { Stop-Here 'could not ask GitHub for its tags. Nothing was pushed.' }
if (-not $tagOnGitHub) {
  if (-not (& git --no-optional-locks tag -l $RestoreTag)) {
    & git tag $RestoreTag $BaseSha
    if ($LASTEXITCODE -ne 0) { Stop-Here "could not make the restore tag $RestoreTag. Nothing was pushed." }
  } elseif ((& git --no-optional-locks rev-parse "$RestoreTag^{commit}").Trim() -ne $BaseSha) {
    Stop-Here "the restore tag $RestoreTag on this PC is not $MasterBase. Ask Claude; nothing was pushed."
  }
  $tp = Run "push the restore tag $RestoreTag" "git push origin refs/tags/$RestoreTag"
  Must $tp 'pushing the restore tag (nothing was pushed to master)'
} elseif ((("$tagOnGitHub" -split '\s+')[0]) -ne $BaseSha) {
  Stop-Here "the restore tag $RestoreTag on GitHub is not $MasterBase. Ask Claude; nothing was pushed."
}
Log "Restore point on GitHub: $RestoreTag = $($BaseSha.Substring(0, 7))" 'Green'

$MasterNow = Get-RemoteMaster
if (-not $MasterNow) { Stop-Here 'could not reach GitHub before the push. Nothing was pushed. Run golive again once GitHub answers.' }
if ($MasterNow -eq $BranchSha) {
  Log 'master on GitHub is already this commit: nothing to push.' 'Green'
} elseif ($MasterNow -eq $BaseSha) {
  & git --no-optional-locks merge-base --is-ancestor $BaseSha $Branch
  if ($LASTEXITCODE -ne 0) { Stop-Here "$Branch no longer fast-forwards master. Nothing was pushed. Ask Claude." }
  $push = Run "git push origin ${Branch}:master" "git push origin ${Branch}:master"
  Must $push 'the push. Nothing else changed'
} else {
  Stop-Here "master on GitHub moved while golive ran (now $($MasterNow.Substring(0, 8))). Nothing was pushed. Ask Claude."
}

$NewMaster = Get-RemoteMaster
$NewShort = if ($NewMaster) { $NewMaster.Substring(0, 8) } else { $BranchSha.Substring(0, 8) }
Log "DONE. master on GitHub = $NewShort. The app is NOT live yet: Render deploys nothing on a push." 'Green'
Log '' 'White'
Log 'NOW, BY HAND:' 'White'
Log '1. Render -> MaxStrength App-Beta -> Manual Deploy -> Deploy latest commit. Then:' 'White'
Log '     curl.exe -s https://maxstrength-app-beta.onrender.com/version.json' 'Cyan'
Log "   names $NewShort. Then journey-cron-renewals and journey-cron-leaderboards -> Manual Build, each" 'White'
Log '   (nothing they run changed; it keeps all three on one commit).' 'White'
Log '2. In the project folder: git pull --ff-only (no npm ci needed: no package changed).' 'White'
Log '' 'White'
Log 'TO UNDO (ask Claude first):' 'White'
Log "  git push --force origin ${RestoreTag}:master, then Render's three presses." 'White'
$elapsed = [int]((Get-Date) - $Started).TotalMinutes
Log "Done in about $elapsed minute(s)." 'Green'
exit 0
