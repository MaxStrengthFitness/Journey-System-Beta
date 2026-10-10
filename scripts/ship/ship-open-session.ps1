<#
 SCRIPT-VERSION: v1  (Oct 9 2026, the open session)

 Ships branch oct9/open-session: the open session round of Oct 9 2026
 (docs\rounds\2026-10-09-open-session.md is the round, its section 4.8 how to
 ship). AJ, Oct 9 2026: the open session "should honestly feel most like a
 filemaker session", and his picks "1b 2a 3a". Built on master as it is on
 GitHub (546bb0aa: the first-session rounds, live on Render since Oct 9 2026;
 checked with git ls-remote). The branch, in order:

   - the round's document: what was found and AJ's picks;
   - Start in one write, never awaited, and the way back to the session;
   - the FileMaker floor: every machine showing, today's list built by +;
   - Who's this? at any time: ONE batch giving the session and its sets
     their client (the exerciseLogs rule that lets a set take it);
   - Start from a routine... in the grid's corner, today's list only;
   - Set up on the Now Bar, opening the card on the first empty dial;
   - settings kept on the session until the client is chosen
     (sessions/{id}.heldSetup, AJ's OK for the one new field);
   - the whole-branch review's fixes (the sessions update rule among them),
     the screens preview's fixes, the docs and this script.

 WHAT GOES TO PRODUCTION, in this order (golive, after GO):
   1. the index (npx firebase deploy --only firestore:indexes --project prod
      --non-interactive: ONE new composite on sessions, hostedAtStudioId,
      isUnassigned, status, createdAt descending, the open-session listener's
      newest twenty; it never deletes an index; never --force);
   2. the rules tests again, then firestore.rules: the exerciseLogs update
      rule, Assign's (logTakesItsSessionsClient, logLeavesItsOpenSessionsClient)
      and the sessions update rule (openSessionWriteOk). Under the rules live
      now every Who's this? batch is refused; the app on Render now never
      writes what the new ones refuse. Then the LIVE check: gcloud is not on
      AJ's PC, so it runs scripts\check-live-rules.ts with the
      service-account key (read only), and prints the console check too;
   3. the restore tag restore/2026-10-09-before-open-session = 546bb0aa
      (master before this round), pushed if it is not there yet;
   4. git push origin oct9/open-session:master, fast-forward only, ONLY when
      master on GitHub is still 546bb0aa (asked again just before).
 THEN, BY HAND (golive prints it): the index built, the iPad walk of
 Round 66 BEFORE Render (AJ's rule is at most two rounds shipped unwalked),
 then Render: a push deploys NOTHING there. The web service needs Manual
 Deploy, and BOTH cron jobs Manual Build (to keep all three on one commit).
 No Cloud Function; no Mindbody call, timer or cadence change; the one new
 stored field is sessions/{id}.heldSetup. Nothing contacts anyone.

 BEFORE IT: AJ's iPad walk of the first-session rounds (Round 65 of
 docs\ops\TESTING-CHECKLIST.md), as agreed.

 Run from the branch's own folder,
 .claude\worktrees\first-session-routine-plan-ui-2f8dc1 (it is on the branch
 already; do not switch branches by hand). IN ORDER:

   powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-open-session.ps1 -Stage prepare
   powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-open-session.ps1 -Stage golive

 prepare  changes nothing in production and nothing in git (it reads GitHub
          with git ls-remote and the live rules with the key, and writes
          only logs\, dist\ and build\): the branch, a clean tree, that
          master on GitHub is 546bb0aa or already the branch's head
          (anything else: stop and ask Claude), that the branch
          fast-forwards 546bb0aa, what goes live (rules and the index; no
          functions), the Firebase login, the restore tag free or already
          546bb0aa, the live rules (546bb0aa's or this branch's; anything
          else stops it), no Windows line ends, the case check, that
          firestore.indexes.json parses with no field overrides and holds
          the sessions index, that firestore.rules holds the round's rules,
          the typecheck COUNT (2), the suite in Eastern time, the functions
          typecheck and tests, the builds (the app, the crons and the
          server), the first screen's size budget, none of the perf lab's
          markers in the build, and the rules tests. It records what it
          tested in logs\ship-open-session.prepared. Ends PREPARE PASSED.

 golive   refuses unless the branch is exactly what prepare tested and
          master is 546bb0aa or the branch's head, asks for GO, then does
          1-4 above and stops at the first failure (each stop says what is
          already live). Then it prints the steps left for AJ by hand.

 To undo: golive prints the order. In short: git push --force origin
 restore/2026-10-09-before-open-session:master, then the same three Render
 buttons. The rules and the index can stay (the app before this round never
 writes what they refuse).

 ASCII only on purpose (Windows PowerShell 5.1 reads a script as ANSI).
#>

param([Parameter(Mandatory = $true, Position = 0)][ValidateSet('prepare', 'golive')][string]$Stage)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $Root
$LogFile = Join-Path $Root 'logs\ship-open-session.log'
# What prepare tested: "<branch sha> <origin master sha>". golive reads it.
$PreparedFile = Join-Path $Root 'logs\ship-open-session.prepared'
# master's firestore.rules before this round, written by prepare for the live check.
$BaseRulesFile = Join-Path $Root 'logs\ship-open-session.base.rules'
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $LogFile) | Out-Null
$Branch = 'oct9/open-session'
$Folder = '.claude\worktrees\first-session-routine-plan-ui-2f8dc1'
$RestoreTag = 'restore/2026-10-09-before-open-session'
# master on GitHub when this round was finished (git ls-remote, Oct 9 2026):
# the first-session rounds, live on Render since Oct 9 2026. The round was
# built and measured on exactly this commit.
$MasterBase = '546bb0aa'
# 2 since the Hub fixes (Oct 1): clinical-review/charts.tsx and
# EditTrainerModal.tsx. This round keeps the same two. More is new.
$TscBaseline = 2
$Project = 'prod'
$GcpProject = 'gen-lang-client-0731527386'
$Db = 'ai-studio-32cbbdcc-6e08-4770-9665-867c68878efa'
# The round's rules, which must be in the rules deployed...
$RulesMarks = @('function logTakesItsSessionsClient(', 'function logLeavesItsOpenSessionsClient(', 'function openSessionWriteOk(')
# ...and in the ruleset that is live afterwards.
$LiveRulesMarks = @('logTakesItsSessionsClient', 'openSessionWriteOk')
# The open-session listener's index (firestore.indexes.json and the live check).
$SessionsIndexFields = 'hostedAtStudioId:ASCENDING,isUnassigned:ASCENDING,status:ASCENDING,createdAt:DESCENDING'
$SessionsIndexSpec = 'sessions(hostedAtStudioId, isUnassigned, status, createdAt desc)'
# The service-account key, in the project folder three levels up (a worktree
# has no copy). Only the read-only live check uses it; prints no secret.
$KeyPath = Join-Path (Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $Root))) 'service-account.json'
$HaveKey = Test-Path $KeyPath
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

# master on GitHub, read with ls-remote (no fetch, nothing written to git).
function Get-RemoteMaster {
  $line = & git --no-optional-locks ls-remote origin refs/heads/master
  if ($LASTEXITCODE -ne 0 -or -not $line) { return $null }
  return ("$line" -split '\s+')[0].Trim()
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
    # On this PC every rules run leaves its emulator behind (seen Sep 28 and twice on Oct 9 2026).
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

# The read-only live check (scripts\check-live-rules.ts): GETs only, no file
# written, the service-account key from the project folder. Returns its exit
# code: 0 the live ruleset is $rulesPath's (and holds every -expect), 3 it
# differs, 2 no release, 1 it could not run; -1 when there is no key.
function Check-LiveRules {
  param([string]$label, [string]$rulesPath, [string[]]$expect = @())
  if (-not $HaveKey) { return -1 }
  $cmd = "npx tsx scripts/check-live-rules.ts --key `"$KeyPath`" --project $GcpProject --database $Db --rules `"$rulesPath`""
  foreach ($e in $expect) { $cmd += " --expect $e" }
  $r = Run $label $cmd
  return $r.Code
}

# What AJ can run, and look at, himself: both checks, printed.
function Show-LiveChecks {
  Log 'The live rules, checked by hand (either one):' 'White'
  Log "  a. In PowerShell in this folder (read only; the key from the project folder):" 'White'
  Log "       npx tsx scripts/check-live-rules.ts --key `"$KeyPath`" --project $GcpProject --database $Db" 'Cyan'
  Log '     It must end "RESULT: the live rules are firestore.rules".' 'White'
  Log "  b. Firebase console -> Firestore -> the named database ($Db) -> Rules: the newest release (today)," 'White'
  Log "     Ctrl F  $($LiveRulesMarks[0])  and then  $($LiveRulesMarks[1])  : both must be there." 'White'
}

Log "ship-open-session $Stage" 'White'

# The branch's own worktree folder.
$top = (& git --no-optional-locks rev-parse --show-toplevel 2>$null)
if ($LASTEXITCODE -ne 0 -or -not (Test-Path 'package.json') -or -not (Test-Path 'scripts\ship\ship-open-session.ps1') -or ((Resolve-Path $top).Path -ne (Get-Location).Path)) { Stop-Here "run this from the top of the branch's folder, $Folder." }
foreach ($f in @('src\features\open-session\start.ts', 'src\features\open-session\assign.ts', 'src\features\open-session\held-setup.ts', 'src\features\open-session\held-store.ts', 'src\features\routine-plan\start-from.ts', 'src\features\journey-grid\setup-button.ts', 'scripts\check-live-rules.ts', 'scripts\check-bundle-budget.mjs', 'docs\rounds\2026-10-09-open-session.md')) {
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

Log 'Asking GitHub where master is (git ls-remote, reads only)' 'Cyan'
$MasterSha = Get-RemoteMaster
if (-not $MasterSha) { Stop-Here 'could not reach GitHub.' }

$BaseSha = (& git --no-optional-locks rev-parse "$MasterBase^{commit}").Trim()
if ($LASTEXITCODE -ne 0) { Stop-Here "this checkout does not know $MasterBase (master before this round). Ask Claude." }
$BranchSha = (& git --no-optional-locks rev-parse $Branch).Trim()

# master is either still the round's base (golive pushes the branch) or
# already the branch's head (pushed some other way; golive pushes nothing).
# Anything else went to master since and was not tested with this.
if ($MasterSha -eq $BaseSha) {
  $MasterPushed = $false
  Log "master on GitHub is $MasterBase (the first-session rounds), before this round: golive pushes the branch." 'Green'
} elseif ($MasterSha -eq $BranchSha) {
  $MasterPushed = $true
  Log "master on GitHub is already this branch's head ($($BranchSha.Substring(0, 8))). golive deploys the index and the rules, makes the restore tag, and pushes nothing." 'Green'
} else {
  Stop-Here "master on GitHub is $($MasterSha.Substring(0, 8)): neither $MasterBase (before this round) nor this branch's head ($($BranchSha.Substring(0, 8))). Something else went to master. Ask Claude to bring it into $Branch and test again first."
}

& git --no-optional-locks merge-base --is-ancestor $BaseSha $Branch
if ($LASTEXITCODE -ne 0) { Stop-Here "$Branch does not build on $MasterBase, so it would not fast-forward master. Ask Claude." }

$inRound = (& git --no-optional-locks rev-list --count "$BaseSha..$Branch").Trim()
Log "$inRound commit(s) in this round (on top of $MasterBase), each fast-forwarding master:" 'Green'
& git --no-optional-locks log --oneline "$BaseSha..$Branch" | ForEach-Object { Log "   $_" }

# The round needs its rules and its index: both must have changed since the
# base, and hold what this round added. Measured against the BASE, never
# master, which may already be the branch.
& git --no-optional-locks diff --quiet $BaseSha $Branch -- firestore.rules
if ($LASTEXITCODE -eq 0) { Stop-Here "firestore.rules is the same as $MasterBase's, but Who's this? needs the new exerciseLogs and sessions rules. Ask Claude." }
foreach ($mark in $RulesMarks) {
  if (-not (Select-String -Path 'firestore.rules' -SimpleMatch -Pattern $mark -Quiet)) { Stop-Here "firestore.rules does not hold '$mark'. Ask Claude." }
}
& git --no-optional-locks diff --quiet $BaseSha $Branch -- firestore.indexes.json
if ($LASTEXITCODE -eq 0) { Stop-Here "firestore.indexes.json is the same as $MasterBase's, but the open-session listener needs its index. Ask Claude." }
# This round names no function. A change under functions\src (tests aside),
# or to what every function is built with, is one this script cannot deploy
# safely: it stops rather than guess (never a plain --only functions).
$changedFn = @(& git --no-optional-locks diff --name-only $BaseSha $Branch -- functions/src | Where-Object { $_ -and ($_ -notmatch '\.test\.ts$') })
if ($changedFn.Count -gt 0) {
  $changedFn | ForEach-Object { Log "   $_" 'Red' }
  Stop-Here 'functions\src changed, and this script names no function to deploy (the open session round changes none). Ask Claude.'
}
& git --no-optional-locks diff --quiet $BaseSha $Branch -- functions/package.json functions/package-lock.json functions/tsconfig.json
if ($LASTEXITCODE -ne 0) { Stop-Here 'functions\package.json, its lock or its tsconfig changed, which would change every function. Ask Claude.' }
Log "Against ${MasterBase}: firestore.rules and firestore.indexes.json CHANGED (golive deploys both, the index first, and checks the rules LIVE before the push); functions\src unchanged." 'Green'

if ($Stage -eq 'prepare') {
  if (Test-Path $PreparedFile) { Remove-Item -Force $PreparedFile }

  Log 'What changes, by folder (src\ reaches the app; harness\ never ships):' 'Yellow'
  & git --no-optional-locks diff --stat $BaseSha $Branch | Select-Object -Last 1 | ForEach-Object { Log "   $_" 'Yellow' }
  & git --no-optional-locks diff --dirstat=files,3 $BaseSha $Branch | ForEach-Object { Log "   $_" 'Yellow' }
  Log 'firestore.rules and firestore.indexes.json changes (golive deploys the index, runs the rules tests again, deploys the rules and checks them LIVE):' 'Yellow'
  & git --no-optional-locks diff --stat $BaseSha $Branch -- firestore.rules firestore.indexes.json | ForEach-Object { Log "   $_" 'Yellow' }
  Log 'server, render.yaml and index.html changes (the web service and the crons are deployed by hand on Render):' 'Yellow'
  $srv = @(& git --no-optional-locks diff --stat $BaseSha $Branch -- server server.ts render.yaml index.html | Where-Object { $_ })
  if ($srv.Count -eq 0) { Log '   none' 'Yellow' } else { $srv | ForEach-Object { Log "   $_" 'Yellow' } }
  Log 'scripts changes (check-live-rules.ts is read only; nothing here runs against production by itself):' 'Yellow'
  & git --no-optional-locks diff --stat $BaseSha $Branch -- scripts | ForEach-Object { Log "   $_" 'Yellow' }

  $fl = Run 'Firebase login' 'npx firebase login:list'
  Must $fl 'the Firebase login check'
  if (-not (@($fl.Output) -match '@')) { Stop-Here 'no Firebase login on this PC. Run: npx firebase login, then prepare again.' }

  # The restore point golive will make: free, or already master BEFORE the
  # round (546bb0aa), never master as it is now (which may be the branch).
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

  # The rules live now, read only: master's (the first-session golive ran),
  # or already this branch's (golive ran its rules step). Anything else was
  # deployed from somewhere else, and deploying over it would lose it.
  if ($HaveKey) {
    $show = & cmd /c "git --no-optional-locks show ${BaseSha}:firestore.rules > `"$BaseRulesFile`" 2>&1"
    if ($LASTEXITCODE -ne 0) { Stop-Here "could not write $MasterBase's firestore.rules to logs\ for the live check. Ask Claude." }
    $lc = Check-LiveRules "the live rules against $MasterBase's (read only)" $BaseRulesFile
    if ($lc -eq 0) {
      Log "The rules LIVE on $Db are $MasterBase's firestore.rules (the first-session golive ran). golive replaces them with this branch's." 'Green'
    } elseif ($lc -eq 3) {
      $lb = Check-LiveRules 'the live rules against this branch''s (read only)' 'firestore.rules'
      if ($lb -eq 0) {
        Log "The rules LIVE on $Db are already this branch's firestore.rules. golive deploys them again (no change) and checks them." 'Green'
      } elseif ($lb -eq 3) {
        Stop-Here "the rules LIVE on $Db are neither $MasterBase's nor this branch's: rules were deployed from somewhere else, and golive would replace them. Ask Claude (the log shows where they part)."
      } else {
        Log "Could not compare the live rules with this branch's (exit $lb). golive asks for the console check after its deploy." 'Yellow'
      }
    } else {
      Log "Could not read the live rules (exit $lc). Not a failure of the round: golive asks for the console check after its deploy." 'Yellow'
    }
  } else {
    Log "The service-account key is not at $KeyPath, so the live rules were not read. golive asks for the console check after its deploy." 'Yellow'
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
  # hold the open-session listener's index.
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
  $sessIx = @($ixJson.indexes | Where-Object { $_.collectionGroup -eq 'sessions' -and ((@($_.fields | ForEach-Object { "$($_.fieldPath):$($_.order)" }) -join ',') -eq $SessionsIndexFields) })
  if ($sessIx.Count -ne 1) { Stop-Here "firestore.indexes.json does not hold the open-session listener's index ($SessionsIndexSpec). Ask Claude." }
  Log "firestore.indexes.json holds the open-session listener's index ($SessionsIndexSpec)." 'Green'
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
  Log "Tested: $Branch at $($BranchSha.Substring(0, 7)), master on GitHub at $($MasterSha.Substring(0, 7))." 'Green'
  Log 'THE PLAN (golive, in this order, stopping at the first failure):' 'White'
  Log "  1. npx firebase deploy --only firestore:indexes --project $Project --non-interactive (never deletes an index)." 'White'
  Log "  2. npm run test:rules again, then npx firebase deploy --only firestore:rules --project $Project," 'White'
  Log "     then check the ruleset LIVE is this branch's firestore.rules and holds '$($LiveRulesMarks -join "' and '")'" 'White'
  Log '     (scripts\check-live-rules.ts with the key; the console check printed beside it).' 'White'
  Log "  3. The restore tag $RestoreTag = $MasterBase (master before this round), pushed if not on GitHub yet." 'White'
  if ($MasterPushed) { Log '  4. (no push: master is already the branch''s head)' 'White' } else { Log "  4. git push origin ${Branch}:master (fast-forward only), if master on GitHub is still $MasterBase." 'White' }
  Log '  (no Cloud Function: none changed)' 'White'
  Log '  Then, by hand: the index built, the iPad walk of Round 66 BEFORE Render, then Render' 'White'
  Log '  (Manual Deploy on the web service, Manual Build on both crons).' 'White'
  Log 'Before golive: AJ''s walk of Round 65 (the first-session rounds), as agreed.' 'Yellow'
  Log 'PREPARE PASSED. Next: powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-open-session.ps1 -Stage golive' 'Green'
  exit 0
}

# ---- golive ------------------------------------------------------------------------
if (-not (Test-Path $PreparedFile)) { Stop-Here 'prepare has not passed on this PC. Run prepare first.' }
$prepared = ((Get-Content -Path $PreparedFile -Raw).Trim()) -split '\s+'
if ($prepared.Count -ne 2 -or $prepared[0] -ne $BranchSha) { Stop-Here "$Branch has changed since prepare passed, so this commit has not been tested. Run prepare again." }
# master may have moved from the base to the branch's head since prepare; both were checked above.
Log "prepare passed on this commit ($($BranchSha.Substring(0, 7))); master on GitHub is $(if ($MasterPushed) { 'already this commit' } else { $MasterBase + ', before the round' })." 'Green'
# The deploys send THIS folder's firestore.rules and firestore.indexes.json.
& git --no-optional-locks diff --quiet HEAD -- firestore.rules firestore.indexes.json functions
if ($LASTEXITCODE -ne 0) { Stop-Here 'firestore.rules, firestore.indexes.json or functions\ has uncommitted changes in this folder. Ask Claude.' }

Write-Host ''
Write-Host 'The open session (AJ''s "1b 2a 3a"):' -ForegroundColor Yellow
Write-Host '  the FileMaker floor with today''s list built by +, Start from a routine... in the grid''s corner,' -ForegroundColor Yellow
Write-Host '  Who''s this? at any time (one batch: the session, its sets and the settings held on it), and Set up' -ForegroundColor Yellow
Write-Host '  on the Now Bar opening the card on the first empty dial.' -ForegroundColor Yellow
Write-Host 'This deploys to PRODUCTION, in order: the index (sessions: hostedAtStudioId, isUnassigned, status,' -ForegroundColor Yellow
Write-Host '  createdAt desc), then firestore.rules (after the rules tests pass again: the exerciseLogs Assign rule' -ForegroundColor Yellow
Write-Host '  and the sessions update rule; the app on Render now never writes what they refuse), checks they are' -ForegroundColor Yellow
if ($MasterPushed) {
  Write-Host '  LIVE, makes the restore tag, and pushes nothing (master is already this commit).' -ForegroundColor Yellow
} else {
  Write-Host '  LIVE, makes the restore tag, then pushes to master.' -ForegroundColor Yellow
}
Write-Host 'On Render nothing happens until YOU press Manual Deploy (web service) and Manual Build (both crons),' -ForegroundColor Yellow
Write-Host 'after this round''s iPad walk (Round 66); golive prints the steps. No Cloud Function; nothing is asked' -ForegroundColor Yellow
Write-Host 'of Mindbody; nothing contacts anyone.' -ForegroundColor Yellow
Write-Host 'As agreed, this ships AFTER your walk of Round 65 (the first-session rounds). Type GO only once it is done.' -ForegroundColor Yellow
Write-Host ''
if ((Read-Host 'AJ: type GO to deploy the index and the rules, tag and push') -ne 'GO') { Log 'Nothing deployed, tagged or pushed.' 'Yellow'; exit 0 }
Log 'AJ typed GO: the open session.' 'White'

# 1. The index. It builds in the background (minutes); until it is Enabled
#    the open-session listener's sort runs outside an index, as any query
#    without its index does, so nothing breaks. --non-interactive: an index
#    in production that is not in the file is left alone, never deleted.
#    Never --force (it would delete the two TTL policies on the webhook's
#    logs, which the file does not hold).
$idx = Run "deploy firestore.indexes.json (project $Project)" "npx firebase deploy --only firestore:indexes --project $Project --non-interactive"
if ($idx.Code -ne 0) { Stop-Here 'the index deploy failed. The live app and its rules are unchanged and nothing was pushed.' }
Log 'Index deployed to production (it finishes building by itself). A note about "2 field overrides ... not present" is expected: those are the TTL policies.' 'Green'

# 2. The rules: the tests again first (AJ's run counts), then the deploy,
#    then a check that what is LIVE is this branch's file. Under the rules
#    live now every Who's this? batch is refused. The app on Render now never
#    writes what the new rules refuse (it never writes heldSetup, never
#    assigns in a batch, and assigns only a client that exists).
Run-RulesTests 'The index is deployed (harmless); the rules and the app are unchanged and nothing was pushed.'
$rules = Run "deploy firestore.rules (project $Project)" "npx firebase deploy --only firestore:rules --project $Project"
if ($rules.Code -ne 0) { Stop-Here 'the rules deploy failed. The index is deployed (harmless); the app is unchanged and nothing was pushed.' }
if (-not (@($rules.Output) -match 'released rules')) { Stop-Here 'the rules deploy did not say it released the rules. The index is deployed (harmless); nothing was pushed. Ask Claude before going on (Firebase console -> Firestore -> the named database -> Rules shows what is live).' }

# The live check. gcloud is not on AJ's PC, so the read is the
# service-account check (read only); the console check is printed either way.
$live = Check-LiveRules 'the live rules against this branch''s (read only)' 'firestore.rules' $LiveRulesMarks
Show-LiveChecks
if ($live -eq 0) {
  Log "The ruleset LIVE on $Db is this branch's firestore.rules and holds '$($LiveRulesMarks -join "' and '")' (read from the Firebase Rules API with the key)." 'Green'
} elseif ($live -eq 3) {
  Stop-Here "the ruleset live on $Db is not this branch's firestore.rules (the log shows where they part). The index and possibly the rules are deployed; the app on Render never writes what they refuse, and nothing was pushed. Ask Claude."
} else {
  if ($live -eq -1) { Log "The key is not at $KeyPath, so the live rules could not be read here. Make check b. above, now." 'Yellow' } else { Log "The live check could not run (exit $live). Make check b. above, now." 'Yellow' }
  if ((Read-Host "Type LIVE if the live rules hold both (Enter to stop here)") -ne 'LIVE') { Stop-Here 'the live rules were not confirmed. The index and rules are deployed (the app on Render never writes what they refuse); nothing was pushed. Run golive again once they are (ask Claude).' }
  Log "AJ confirmed: the live rules hold '$($LiveRulesMarks -join "' and '")'." 'Green'
}

# 3. The restore point: master BEFORE this round (546bb0aa), whatever master
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
#    which this script never passes), and only while master on GitHub is
#    still the base: asked again, just before.
$MasterNow = Get-RemoteMaster
if (-not $MasterNow) { Stop-Here 'could not reach GitHub before the push. The index and rules are deployed (harmless); the app is unchanged. Run golive again once GitHub answers.' }
if ($MasterNow -eq $BranchSha) {
  Log "master on GitHub is already this commit ($($BranchSha.Substring(0, 7))): nothing to push." 'Green'
} elseif ($MasterNow -eq $BaseSha) {
  & git --no-optional-locks merge-base --is-ancestor $BaseSha $Branch
  if ($LASTEXITCODE -ne 0) { Stop-Here "$Branch no longer fast-forwards master. The index and rules are deployed (harmless); the app is unchanged. Ask Claude." }
  $push = Run "git push origin ${Branch}:master" "git push origin ${Branch}:master"
  Must $push 'the push. The index and rules are deployed (harmless); the app is unchanged'
} else {
  Stop-Here "master on GitHub moved while golive ran (now $($MasterNow.Substring(0, 8))). The index and rules are deployed (harmless); the app is unchanged and nothing was pushed. Ask Claude."
}

$NewMaster = Get-RemoteMaster
$NewShort = if ($NewMaster) { $NewMaster.Substring(0, 8) } else { $BranchSha.Substring(0, 8) }
$IndexCheck = "npx tsx scripts/check-live-rules.ts --key `"$KeyPath`" --project $GcpProject --database $Db --index `"$SessionsIndexSpec`""
Log "DONE. master on GitHub = $NewShort. The app is NOT live yet: Render deploys nothing on a push." 'Green'
Log '' 'White'
Log 'NOW, BY HAND, in this order (docs\rounds\2026-10-09-open-session.md, section 4.8, How to ship):' 'White'
Log '1. The index built (minutes). In PowerShell in THIS folder (read only):' 'White'
Log "     $IndexCheck" 'Cyan'
Log '   says READY (exit 0). Or: Firebase console -> Firestore -> the named database -> Indexes: sessions' 'White'
Log '   (hostedAtStudioId, isUnassigned, status, createdAt) says Enabled. Until then the open-session listener' 'White'
Log '   scans, as any query without its index does: nothing breaks.' 'White'
Log '2. THE iPad WALK, FIRST, BEFORE RENDER (AJ''s rule: at most two rounds shipped before an iPad walk).' 'White'
Log '   Round 66 of docs\ops\TESTING-CHECKLIST.md, against this PC:' 'White'
Log '   - in THIS folder: npm run dev (port 3000; the first load after a while takes a minute or two);' 'White'
Log '   - the PC''s Wi-Fi address: Get-NetIPConfiguration. It must be in Firebase console -> Authentication ->' 'White'
Log '     Settings -> Authorized domains (yours to add) or the iPad''s sign-in is refused;' 'White'
Log '   - on the iPad, SAFARI at http://<that address>:3000, never the Home Screen icon (that is the live app);' 'White'
Log '   - the dev server writes to PRODUCTION, whose rules are now this round''s, so Who''s this? works there.' 'White'
Log '     Walk it on test clients (Add Client: "New client, not in Mindbody yet"), upright and on its side,' 'White'
Log '     then once on a phone. Count the taps on Set up (three and the digits).' 'White'
Log '   Tell Claude what you find. Render waits until the walk is done.' 'White'
Log '3. Render -> maxstrength-app-beta -> Manual Deploy -> Deploy latest commit. Wait until it says Live' 'White'
Log "   on $NewShort. Then check it: curl.exe -s https://maxstrength-app-beta.onrender.com/version.json" 'White'
Log '   (the version names the new build; if it still names the old one, wait a minute and ask again).' 'White'
Log '4. Render -> journey-cron-renewals -> Manual Build, then the same on journey-cron-leaderboards. Nothing' 'White'
Log '   they do changes in this round; a cron left out keeps running its old commit, so keep all three on one:' 'White'
Log '   each build''s log ends on the new commit.' 'White'
Log '5. The iPads pick the new version up by themselves on the Hub (never over a session or while typing).' 'White'
Log '   Front-desk computers: reload the page.' 'White'
Log '6. The round document''s parking list (section 5) has two questions for you (a laid starting routine''s' 'White'
Log '   plan at Next time; a never-read client''s floor offline); nothing is blocked on them.' 'White'
Log '' 'White'
Log 'TO UNDO (ask Claude first):' 'White'
Log "  git push --force origin ${RestoreTag}:master   then the same three Render buttons (steps 3 and 4)." 'White'
Log '  The rules and the index can stay: the app before this round never writes what they refuse. A session' 'White'
Log '  the new app left holding settings (heldSetup) is harmless to the old app, which never reads the field;' 'White'
Log '  those values stay on the session, saved to no client.' 'White'
$elapsed = [int]((Get-Date) - $Started).TotalMinutes
Log "Done in about $elapsed minute(s)." 'Green'
exit 0
