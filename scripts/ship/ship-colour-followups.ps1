<#
 SCRIPT-VERSION: v1  (Oct 4 2026, the colour follow-ups)

 Ships branch oct4/colour-followups, built on master's e38d29bb (the Navy
 Frame, live): AJ's "yes" to three of the Navy Frame's open questions.
 Every Save and every selection is the blue, and orange is only now and go
 (Start, Finish, the paused Resume); the profile's Journey tab dates are
 stepped in lightness, hues kept, so every word reads at 4.5:1; and the
 Active Session's controls draw a firmer 3:1 edge (--jg-control-edge) while
 the sticky separators keep the soft line.
 docs/rounds/2026-10-04-navy-frame.md ("Follow-ups") is the record.

 App only: no Mindbody call, no Cloud Functions, no rules, no index, no
 server change, and no index.html or manifest change (prepare refuses any
 of them). So, unlike the Navy Frame, the Home Screen icon does NOT have to
 be deleted and added again.

 Run from the branch's own folder, .claude\worktrees\colour-followups (it is
 on the branch already), or from the project folder with the folder on the
 branch (ask Claude to switch it; do not switch branches by hand), IN ORDER:

   powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-colour-followups.ps1 -Stage prepare
   powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-colour-followups.ps1 -Stage golive

 prepare  changes nothing (it writes only logs\ and the build folder): the
          branch, a clean tree, the fetch, that master holds e38d29bb, that
          the branch fast-forwards master, what goes live, that functions\,
          the server, the rules, the indexes, index.html and public\ are
          unchanged, that the restore tag is free (or already master), the
          case check, the typecheck COUNT (2), the suite in Eastern time,
          the build. Ends PREPARE PASSED.

 golive   asks for GO, then: 1. tags master
          (restore/2026-10-04-before-colour-followups) and pushes the tag;
          2. pushes the branch to master, fast-forward only: RENDER DEPLOYS
          THE APP. It stops at the first failure. Then it says what to do on
          the iPad: walk Round 55.

 To undo: push the restore tag to master (ask Claude).

 ASCII only on purpose (Windows PowerShell 5.1 reads a script as ANSI).
#>

param([Parameter(Mandatory = $true, Position = 0)][ValidateSet('prepare', 'golive')][string]$Stage)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $Root
$LogFile = Join-Path $Root 'logs\ship-colour-followups.log'
# What prepare tested: "<branch sha> <origin/master sha>". golive reads it.
$PreparedFile = Join-Path $Root 'logs\ship-colour-followups.prepared'
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $LogFile) | Out-Null
$Branch = 'oct4/colour-followups'
$RestoreTag = 'restore/2026-10-04-before-colour-followups'
# The Navy Frame (e38d29bb), master when the follow-ups began. The branch is built on it.
$MustFollow = 'e38d29bb'
# 2 since the Hub fixes (Oct 1): clinical-review/charts.tsx and
# EditTrainerModal.tsx. More is new.
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

Log "ship-colour-followups $Stage" 'White'

# The project folder, or the branch's own worktree folder
# (.claude\worktrees\colour-followups): either is a full checkout of Journey.
# Nothing here touches Firestore, so service-account.json is not needed (a
# worktree has no copy of it, on purpose).
$top = (& git --no-optional-locks rev-parse --show-toplevel 2>$null)
if ($LASTEXITCODE -ne 0 -or -not (Test-Path 'package.json') -or -not (Test-Path 'scripts\ship\ship-colour-followups.ps1') -or ((Resolve-Path $top).Path -ne (Get-Location).Path)) { Stop-Here 'run this from the top of a Journey checkout (the project folder or .claude\worktrees\colour-followups).' }

# ---- on the branch, nothing uncommitted ---------------------------------------------
$head = (& git --no-optional-locks symbolic-ref --quiet --short HEAD)
if ($LASTEXITCODE -ne 0 -or "$head".Trim() -ne $Branch) { Stop-Here "this folder is on '$head', not $Branch. Ask Claude; do not switch branches by hand." }
$dirty = (& git --no-optional-locks status --porcelain --untracked-files=no -- src docs server server.ts scripts tests functions public index.html firestore.rules firestore.indexes.json firebase.json package.json package-lock.json vite.config.ts render.yaml CLAUDE.md ROADMAP.md) | Where-Object { $_ }
if ($dirty) {
  Log 'Uncommitted changes:' 'Red'
  $dirty | ForEach-Object { Log "   $_" 'Red' }
  Stop-Here 'the branch has uncommitted changes. Everything that ships must be committed first.'
}
$untracked = (& git --no-optional-locks status --porcelain -- src tests server public) | Where-Object { "$_" -like '`?`? *' }
if ($untracked) {
  Log 'Files under src, tests, server or public that git does not track:' 'Red'
  $untracked | ForEach-Object { Log "   $_" 'Red' }
  Stop-Here 'untracked files would be tested here but not shipped. Commit or remove them first.'
}

Log 'Fetching from GitHub (reads only)' 'Cyan'
& git fetch -q origin
if ($LASTEXITCODE -ne 0) { Stop-Here 'could not reach GitHub.' }

& git --no-optional-locks merge-base --is-ancestor $MustFollow $Branch
if ($LASTEXITCODE -ne 0) { Stop-Here "$Branch is not built on $MustFollow (the Navy Frame). Ask Claude." }
& git --no-optional-locks merge-base --is-ancestor $MustFollow origin/master
if ($LASTEXITCODE -ne 0) { Stop-Here "master does not have $MustFollow (the Navy Frame) yet. Ship the Navy Frame first, or ask Claude." }
Log "master already holds $MustFollow (the Navy Frame)." 'Green'

& git --no-optional-locks merge-base --is-ancestor origin/master $Branch
if ($LASTEXITCODE -ne 0) {
  Log 'master has commits the branch does not:' 'Red'
  & git --no-optional-locks log --oneline "$Branch..origin/master" | ForEach-Object { Log "   $_" 'Red' }
  Stop-Here "$Branch does not fast-forward master. Ask Claude to bring master into $Branch first."
}

$ahead = (& git --no-optional-locks rev-list --count "origin/master..$Branch").Trim()
if ([int]$ahead -eq 0) { Log 'master already has everything on the branch. Nothing to ship.' 'Green'; exit 0 }
Log "$ahead commit(s) will go live:" 'Green'
& git --no-optional-locks log --oneline --first-parent "origin/master..$Branch" | ForEach-Object { Log "   $_" }
$BranchSha = (& git --no-optional-locks rev-parse $Branch).Trim()
$MasterSha = (& git --no-optional-locks rev-parse origin/master).Trim()

if ($Stage -eq 'prepare') {
  if (Test-Path $PreparedFile) { Remove-Item -Force $PreparedFile }

  & git --no-optional-locks diff --quiet origin/master $Branch -- functions
  if ($LASTEXITCODE -ne 0) { Stop-Here 'the branch changes functions\, which this ship should not. Ask Claude.' }
  Log 'functions\: unchanged. No Cloud Functions deploy.' 'Green'

  & git --no-optional-locks diff --quiet origin/master $Branch -- firestore.indexes.json
  if ($LASTEXITCODE -ne 0) { Stop-Here 'the branch changes firestore.indexes.json, which this ship should not. Ask Claude.' }
  Log 'firestore.indexes.json: unchanged. No index deploy.' 'Green'

  & git --no-optional-locks diff --quiet origin/master $Branch -- firestore.rules
  if ($LASTEXITCODE -ne 0) { Stop-Here 'the branch changes firestore.rules, which this ship should not. Ask Claude.' }
  Log 'firestore.rules: unchanged. No rules deploy.' 'Green'

  & git --no-optional-locks diff --quiet origin/master $Branch -- server server.ts
  if ($LASTEXITCODE -ne 0) { Stop-Here 'the branch changes the server, which this colour round should not. Ask Claude.' }
  Log 'server: unchanged. No Mindbody change.' 'Green'

  # The status bar chain: iOS reads it only when the Home Screen icon is added,
  # and this ship tells nobody to re-add the icon, so it must not change.
  & git --no-optional-locks diff --quiet origin/master $Branch -- index.html public
  if ($LASTEXITCODE -ne 0) { Stop-Here 'the branch changes index.html or public\ (the status bar and the manifest), which this ship should not. Ask Claude.' }
  Log 'index.html and public\: unchanged. No Home Screen icon re-add.' 'Green'

  # The restore point golive will make: free, or already master as it is now.
  $tagOnGitHub = & git --no-optional-locks ls-remote --tags origin "refs/tags/$RestoreTag"
  if ($LASTEXITCODE -ne 0) { Stop-Here 'could not ask GitHub for its tags.' }
  if ($tagOnGitHub) {
    $remoteSha = ("$tagOnGitHub" -split '\s+')[0]
    if ($remoteSha -ne $MasterSha) { Stop-Here "the restore tag $RestoreTag on GitHub is not master as it is now. Ask Claude." }
    Log "Restore tag $RestoreTag is already on GitHub at master ($($MasterSha.Substring(0, 7)))." 'Green'
  } else {
    Log "Restore tag $RestoreTag is free; golive makes it at master ($($MasterSha.Substring(0, 7)))." 'Green'
  }

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

  $bd = Run 'build (the app)' 'npx vite build'
  Must $bd 'the build'

  Set-Content -Path $PreparedFile -Value "$BranchSha $MasterSha" -Encoding ascii
  Log "Tested: $Branch at $($BranchSha.Substring(0, 7)), master at $($MasterSha.Substring(0, 7))." 'Green'
  Log 'THE PLAN (golive, in this order, stopping at the first failure):' 'White'
  Log "  1. Tag master as it is now: $RestoreTag = $($MasterSha.Substring(0, 7)), and push the tag." 'White'
  Log "  2. git push origin ${Branch}:master (fast-forward only). Render deploys the app." 'White'
  Log '  Then on the iPad: walk Round 55. No Home Screen icon re-add this time.' 'White'
  Log 'PREPARE PASSED. Next: powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-colour-followups.ps1 -Stage golive' 'Green'
  exit 0
}

# ---- golive ------------------------------------------------------------------------
if (-not (Test-Path $PreparedFile)) { Stop-Here 'prepare has not passed on this PC. Run prepare first.' }
$prepared = ((Get-Content -Path $PreparedFile -Raw).Trim()) -split '\s+'
if ($prepared.Count -ne 2 -or $prepared[0] -ne $BranchSha) { Stop-Here "$Branch has changed since prepare passed, so this commit has not been tested. Run prepare again." }
if ($prepared[1] -ne $MasterSha) { Stop-Here 'master has moved since prepare passed. Run prepare again.' }
Log "prepare passed on this commit ($($BranchSha.Substring(0, 7))) onto this master ($($MasterSha.Substring(0, 7)))." 'Green'
Write-Host ''
Write-Host 'This tags the restore point, then pushes to master, which deploys the app on Render.' -ForegroundColor Yellow
Write-Host 'No rules, no indexes, no functions. Nothing is asked of or written to Mindbody.' -ForegroundColor Yellow
Write-Host 'Saves and selections turn blue on every iPad and phone once it loads the new version.' -ForegroundColor Yellow
if ((Read-Host 'Type GO to tag and push') -ne 'GO') { Log 'Nothing tagged or pushed.' 'Yellow'; exit 0 }

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

# 2. The push, fast-forward only (git refuses anything else without --force,
#    which this script never passes). Checked again against GitHub first.
& git fetch -q origin
if ($LASTEXITCODE -ne 0) { Stop-Here 'could not reach GitHub before the push. The app is unchanged. Run golive again once GitHub answers (prepare first if master moved).' }
if ((& git --no-optional-locks rev-parse origin/master).Trim() -ne $MasterSha) { Stop-Here 'master moved while golive ran. The app is unchanged. Ask Claude.' }
& git --no-optional-locks merge-base --is-ancestor origin/master $Branch
if ($LASTEXITCODE -ne 0) { Stop-Here "$Branch no longer fast-forwards master. The app is unchanged. Ask Claude." }
$push = Run "git push origin ${Branch}:master" "git push origin ${Branch}:master"
Must $push 'the push (Render deploys from it). The app is unchanged'

Log "GOLIVE COMPLETE. master = $((& git --no-optional-locks rev-parse --short origin/master).Trim())." 'Green'
Log 'When Render shows the deploy Live, reload Journey on every iPad and front-desk computer.' 'Green'
Log 'No Home Screen icon re-add this time: the status bar and the manifest did not change.' 'Green'
Log 'Then walk Round 55 of docs\ops\TESTING-CHECKLIST.md, upright and on its side, in light and dark:' 'Green'
Log '  the blue Saves and selections, the Journey tab dates, and the edges on the Active Session controls.' 'Green'
$elapsed = [int]((Get-Date) - $Started).TotalMinutes
Log "Done in about $elapsed minute(s)." 'Green'
exit 0
