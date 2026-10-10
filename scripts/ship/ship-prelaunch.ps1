<#
 SCRIPT-VERSION: v1  (Oct 10 2026, the pre-launch round)

 Ships branch oct10/prelaunch: the pre-launch round of Oct 10 2026
 (docs\rounds\2026-10-10-prelaunch.md is the round; docs\ops\LAUNCH.md the
 launch checklist it wrote). AJ, Oct 10 2026: "create the proper reset
 script", "fix the minbody", "fix anything you think would benefit our project
 that wouldnt make us increase costs". Built on master as it is on GitHub
 (7957d1a0, the settings card, live on Render since Oct 10 2026). In it:

   - scripts\reset-test-data.ts, the pre-launch reset of the test sessions
     (dry run by default; its restore mode; docs\ops\RESET-BEFORE-LAUNCH.md);
   - scripts\mindbody\register-webhook.js --update-events: adds the live
     subscription's two missing events, keeping its secret;
   - firestore.rules: access requests read only by their sender and the
     people who let people in; a new request at the sender's own id;
   - compression 1.8.2 (a security fix; the lock changed: npm ci after);
   - CI's typecheck gate at 2; the cutover date's hint; purge-database.ts
     removed; "PC build - live data" on a development build; the launch
     docs, the deploy and rollback routine, the trainer page, the roadmap.

 WHAT GOES TO PRODUCTION, in this order (golive, after GO):
   1. the rules tests again, then firestore.rules (the access requests
      rule). It takes access away, so it goes the same evening as the push
      and Render: the live app reads requests only where the new rule allows,
      except a trainer who runs no studio opening My Studio -> Team inside
      Demo Mode (an error line there until Render's deploy). Then the LIVE
      check (scripts\check-live-rules.ts, read only, with the key);
   2. the restore tag restore/2026-10-10-before-prelaunch = 7957d1a0 (master
      before this round), pushed if it is not there yet;
   3. git push origin oct10/prelaunch:master, fast-forward only, ONLY when
      master on GitHub is still 7957d1a0 (asked again just before).
 THEN, BY HAND (golive prints it): npm ci in the project folder (the lock
 changed); Render's three presses; the Mindbody step (look first). No index,
 no Cloud Function, no Mindbody call from this script, no timer or cadence
 change. Nothing contacts anyone.

 Run from the branch's own folder, .claude\worktrees\prelaunch (it is on the
 branch already; do not switch branches by hand). IN ORDER:

   powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-prelaunch.ps1 -Stage prepare
   powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-prelaunch.ps1 -Stage golive

 prepare  changes nothing in production and nothing in git (it reads GitHub
          with git ls-remote and the live rules with the key, and writes
          only logs\, dist\ and build\): the branch, a clean tree, that
          master on GitHub is 7957d1a0 or already the branch's head, that the
          branch fast-forwards 7957d1a0, that no index, function or server
          file changed, the Firebase login, the restore tag free or already
          7957d1a0, the live rules (7957d1a0's or this branch's), the lock
          (npm ci --dry-run), no Windows line ends, the case check, the
          typecheck COUNT (2), the suite in Eastern time, the functions
          typecheck and tests, the builds, the size budget, no perf lab
          marker in the build, and the rules tests. Ends PREPARE PASSED.

 golive   refuses unless the branch is exactly what prepare tested and master
          is 7957d1a0 or the branch's head, asks for GO, then does 1-3 above
          and stops at the first failure (each stop says what is live).

 To undo: git push --force origin restore/2026-10-10-before-prelaunch:master,
 then Render's three presses, and the rules from that tag
 (docs\ops\DEPLOYS-AND-ROLLBACK.md, "The rules").

 ASCII only on purpose (Windows PowerShell 5.1 reads a script as ANSI).
#>

param([Parameter(Mandatory = $true, Position = 0)][ValidateSet('prepare', 'golive')][string]$Stage)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $Root
$LogFile = Join-Path $Root 'logs\ship-prelaunch.log'
$PreparedFile = Join-Path $Root 'logs\ship-prelaunch.prepared'
$BaseRulesFile = Join-Path $Root 'logs\ship-prelaunch.base.rules'
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $LogFile) | Out-Null
$Branch = 'oct10/prelaunch'
$Folder = '.claude\worktrees\prelaunch'
$RestoreTag = 'restore/2026-10-10-before-prelaunch'
# master on GitHub when this round began (git ls-remote, Oct 10 2026): the
# settings card, live on Render since 1:06 AM Eastern that day.
$MasterBase = '7957d1a0'
$TscBaseline = 2
$Project = 'prod'
$GcpProject = 'gen-lang-client-0731527386'
$Db = 'ai-studio-32cbbdcc-6e08-4770-9665-867c68878efa'
# The round's rule, which must be in the rules deployed.
$RulesMark = "request.resource.data.get('userId', '') == request.auth.uid"
$WebhookId = '6ffaebd1-2086-41ad-a999-d3edf8ab481f'
$KeyPath = Join-Path (Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $Root))) 'service-account.json'
$ProjectFolder = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $Root))
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

function Get-RemoteMaster {
  $line = & git --no-optional-locks ls-remote origin refs/heads/master
  if ($LASTEXITCODE -ne 0 -or -not $line) { return $null }
  return ("$line" -split '\s+')[0].Trim()
}

function Get-Port8080 {
  $conn = Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $conn) { return $null }
  return Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
}

# npm run test:rules, with the emulator port freed first and afterwards.
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
  if ($rt.Code -ne 0) { Stop-Here "test:rules failed (it needs a JDK, 21 or newer). $whatIsLive" }
}

# The read-only live check: 0 the live ruleset is $rulesPath's, 3 it differs,
# 2 no release, 1 it could not run; -1 when there is no key.
function Check-LiveRules {
  param([string]$label, [string]$rulesPath)
  if (-not $HaveKey) { return -1 }
  $r = Run $label "npx tsx scripts/check-live-rules.ts --key `"$KeyPath`" --project $GcpProject --database $Db --rules `"$rulesPath`""
  return $r.Code
}

Log "ship-prelaunch $Stage" 'White'

$top = (& git --no-optional-locks rev-parse --show-toplevel 2>$null)
if ($LASTEXITCODE -ne 0 -or -not (Test-Path 'package.json') -or -not (Test-Path 'scripts\ship\ship-prelaunch.ps1') -or ((Resolve-Path $top).Path -ne (Get-Location).Path)) { Stop-Here "run this from the top of the branch's folder, $Folder." }
foreach ($f in @('scripts\reset-test-data.ts', 'docs\ops\RESET-BEFORE-LAUNCH.md', 'docs\ops\LAUNCH.md', 'docs\ops\DEPLOYS-AND-ROLLBACK.md', 'docs\ops\TRAINER-QUICK-START.md', 'scripts\mindbody\register-webhook.js', 'src\features\admin\staff\request-readers.ts', 'scripts\check-live-rules.ts', 'scripts\check-bundle-budget.mjs', 'docs\rounds\2026-10-10-prelaunch.md')) {
  if (-not (Test-Path $f)) { Stop-Here "$f is missing from this folder. Ask Claude." }
}
if (Test-Path 'scripts\purge-database.ts') { Stop-Here 'scripts\purge-database.ts is back in this folder; this round removes it. Ask Claude.' }

$head = (& git --no-optional-locks symbolic-ref --quiet --short HEAD)
if ($LASTEXITCODE -ne 0 -or "$head".Trim() -ne $Branch) { Stop-Here "this folder is on '$head', not $Branch. Run it from $Folder, or ask Claude; do not switch branches by hand." }
$dirty = (& git --no-optional-locks status --porcelain --untracked-files=no -- src docs server server.ts scripts tests functions public harness index.html firestore.rules firestore.indexes.json firebase.json package.json package-lock.json vite.config.ts render.yaml CLAUDE.md ROADMAP.md .github) | Where-Object { $_ }
if ($dirty) {
  Log 'Uncommitted changes:' 'Red'
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
  Log "master on GitHub is $MasterBase (the settings card), before this round: golive pushes the branch." 'Green'
} elseif ($MasterSha -eq $BranchSha) {
  $MasterPushed = $true
  Log "master on GitHub is already this branch's head ($($BranchSha.Substring(0, 8))). golive deploys the rules, makes the restore tag, and pushes nothing." 'Green'
} else {
  Stop-Here "master on GitHub is $($MasterSha.Substring(0, 8)): neither $MasterBase nor this branch's head ($($BranchSha.Substring(0, 8))). Something else went to master. Ask Claude to bring it into $Branch and test again first."
}

& git --no-optional-locks merge-base --is-ancestor $BaseSha $Branch
if ($LASTEXITCODE -ne 0) { Stop-Here "$Branch does not build on $MasterBase, so it would not fast-forward master. Ask Claude." }
$inRound = (& git --no-optional-locks rev-list --count "$BaseSha..$Branch").Trim()
Log "$inRound commit(s) in this round (on top of $MasterBase):" 'Green'
& git --no-optional-locks log --oneline "$BaseSha..$Branch" | ForEach-Object { Log "   $_" }

# The rules must have changed and hold the round's rule; nothing this script
# does not deploy may have changed (an index, a function, the server).
& git --no-optional-locks diff --quiet $BaseSha $Branch -- firestore.rules
if ($LASTEXITCODE -eq 0) { Stop-Here "firestore.rules is the same as $MasterBase's, but this round changes the access requests rule. Ask Claude." }
if (-not (Select-String -Path 'firestore.rules' -SimpleMatch -Pattern $RulesMark -Quiet)) { Stop-Here "firestore.rules does not hold the access requests rule. Ask Claude." }
foreach ($p in @('firestore.indexes.json', 'functions', 'server', 'server.ts', 'render.yaml')) {
  & git --no-optional-locks diff --quiet $BaseSha $Branch -- $p
  if ($LASTEXITCODE -ne 0) { Stop-Here "$p changed in this round, and this script deploys no index, function or server change by itself. Ask Claude." }
}
Log "Against ${MasterBase}: firestore.rules CHANGED (golive deploys it and checks it LIVE before the push); no index, function, server or render.yaml change." 'Green'

if ($Stage -eq 'prepare') {
  if (Test-Path $PreparedFile) { Remove-Item -Force $PreparedFile }
  Log 'What changes:' 'Yellow'
  & git --no-optional-locks diff --stat $BaseSha $Branch | Select-Object -Last 1 | ForEach-Object { Log "   $_" 'Yellow' }
  & git --no-optional-locks diff --dirstat=files,3 $BaseSha $Branch | ForEach-Object { Log "   $_" 'Yellow' }

  $fl = Run 'Firebase login' 'npx firebase login:list'
  Must $fl 'the Firebase login check'
  if (-not (@($fl.Output) -match '@')) { Stop-Here 'no Firebase login on this PC. Run: npx firebase login, then prepare again.' }

  $tagOnGitHub = & git --no-optional-locks ls-remote --tags origin "refs/tags/$RestoreTag"
  if ($LASTEXITCODE -ne 0) { Stop-Here 'could not ask GitHub for its tags.' }
  if ($tagOnGitHub) {
    if ((("$tagOnGitHub" -split '\s+')[0]) -ne $BaseSha) { Stop-Here "the restore tag $RestoreTag on GitHub is not $MasterBase. Ask Claude." }
    Log "Restore tag $RestoreTag is already on GitHub at $MasterBase." 'Green'
  } else {
    if (& git --no-optional-locks tag -l $RestoreTag) {
      $tagSha = (& git --no-optional-locks rev-parse "$RestoreTag^{commit}").Trim()
      if ($tagSha -ne $BaseSha) { Stop-Here "the restore tag $RestoreTag on this PC is not $MasterBase. Ask Claude to remove it." }
    }
    Log "Restore tag ${RestoreTag}: golive pushes it at $MasterBase (master before this round)." 'Green'
  }

  if ($HaveKey) {
    & cmd /c "git --no-optional-locks show ${BaseSha}:firestore.rules > `"$BaseRulesFile`" 2>&1"
    if ($LASTEXITCODE -ne 0) { Stop-Here "could not write $MasterBase's firestore.rules to logs\ for the live check. Ask Claude." }
    $lc = Check-LiveRules "the live rules against $MasterBase's (read only)" $BaseRulesFile
    if ($lc -eq 0) {
      Log "The rules LIVE on $Db are $MasterBase's. golive replaces them with this branch's." 'Green'
    } elseif ($lc -eq 3) {
      $lb = Check-LiveRules "the live rules against this branch's (read only)" 'firestore.rules'
      if ($lb -eq 0) { Log "The rules LIVE are already this branch's." 'Green' }
      elseif ($lb -eq 3) { Stop-Here "the rules LIVE on $Db are neither $MasterBase's nor this branch's: rules were deployed from somewhere else, and golive would replace them. Ask Claude." }
      else { Log "Could not compare the live rules with this branch's (exit $lb). golive asks for the console check after its deploy." 'Yellow' }
    } else {
      Log "Could not read the live rules (exit $lc). golive asks for the console check after its deploy." 'Yellow'
    }
  } else {
    Log "The service-account key is not at $KeyPath, so the live rules were not read. golive asks for the console check." 'Yellow'
  }

  # The lock changed (compression 1.8.2). Read, never installed: this
  # folder's node_modules is a junction to the project folder's, and an npm
  # command that empties node_modules here would empty that one.
  # (node, not ConvertFrom-Json: the lock's root entry has an empty name,
  # which Windows PowerShell 5.1 cannot read.)
  $lock = Run 'compression in package.json and the lock (read only)' "node -e `"const p=require('./package.json'),l=require('./package-lock.json');const w=p.dependencies.compression,r=l.packages[''].dependencies.compression,v=(l.packages['node_modules/compression']||{}).version;console.log('package.json',w,'| lock root',r,'| lock installs',v);process.exit(w===r&&v==='1.8.2'?0:1)`""
  Must $lock 'the lock check (package.json and package-lock.json must agree on compression 1.8.2)'

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

  Run-RulesTests 'Nothing is deployed or pushed.'

  Set-Content -Path $PreparedFile -Value "$BranchSha $MasterSha" -Encoding ascii
  Log "Tested: $Branch at $($BranchSha.Substring(0, 7)), master on GitHub at $($MasterSha.Substring(0, 7))." 'Green'
  Log 'THE PLAN (golive, in this order, stopping at the first failure):' 'White'
  Log "  1. npm run test:rules again, then npx firebase deploy --only firestore:rules --project $Project, then the LIVE check." 'White'
  Log "  2. The restore tag $RestoreTag = $MasterBase, pushed if not on GitHub yet." 'White'
  if ($MasterPushed) { Log '  3. (no push: master is already the branch''s head)' 'White' } else { Log "  3. git push origin ${Branch}:master (fast-forward only), if master on GitHub is still $MasterBase." 'White' }
  Log '  Then, by hand, the same evening: npm ci, Render''s three presses, the Mindbody step.' 'White'
  Log 'PREPARE PASSED. Next: powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-prelaunch.ps1 -Stage golive' 'Green'
  exit 0
}

# ---- golive ------------------------------------------------------------------------
if (-not (Test-Path $PreparedFile)) { Stop-Here 'prepare has not passed on this PC. Run prepare first.' }
$prepared = ((Get-Content -Path $PreparedFile -Raw).Trim()) -split '\s+'
if ($prepared.Count -ne 2 -or $prepared[0] -ne $BranchSha) { Stop-Here "$Branch has changed since prepare passed. Run prepare again." }
& git --no-optional-locks diff --quiet HEAD -- firestore.rules
if ($LASTEXITCODE -ne 0) { Stop-Here 'firestore.rules has uncommitted changes in this folder. Ask Claude.' }

Write-Host ''
Write-Host 'The pre-launch round: the reset script, the webhook''s missing events (a script; nothing is sent to' -ForegroundColor Yellow
Write-Host '  Mindbody by this), access requests kept private, compression 1.8.2, the PC build''s mark, the launch docs.' -ForegroundColor Yellow
Write-Host 'This deploys firestore.rules to PRODUCTION (after the rules tests pass again), checks it LIVE, makes' -ForegroundColor Yellow
if ($MasterPushed) { Write-Host '  the restore tag, and pushes nothing (master is already this commit).' -ForegroundColor Yellow } else { Write-Host '  the restore tag, then pushes to master.' -ForegroundColor Yellow }
Write-Host 'The rule takes access away: do Render''s three presses the same evening (golive prints them).' -ForegroundColor Yellow
Write-Host ''
if ((Read-Host 'AJ: type GO to deploy the rules, tag and push') -ne 'GO') { Log 'Nothing deployed, tagged or pushed.' 'Yellow'; exit 0 }
Log 'AJ typed GO: the pre-launch round.' 'White'

Run-RulesTests 'Nothing is deployed or pushed.'
$rules = Run "deploy firestore.rules (project $Project)" "npx firebase deploy --only firestore:rules --project $Project"
if ($rules.Code -ne 0) { Stop-Here 'the rules deploy failed. The live app and its rules are unchanged; nothing was pushed.' }
if (-not (@($rules.Output) -match 'released rules')) { Stop-Here 'the rules deploy did not say it released the rules. Nothing was pushed. Ask Claude (Firebase console -> Firestore -> the named database -> Rules shows what is live).' }

$live = Check-LiveRules 'the live rules against this branch''s (read only)' 'firestore.rules'
if ($live -eq 0) {
  Log "The ruleset LIVE on $Db is this branch's firestore.rules." 'Green'
} elseif ($live -eq 3) {
  Stop-Here "the ruleset live on $Db is not this branch's firestore.rules. Nothing was pushed. Ask Claude."
} else {
  Log "The live check could not run (exit $live). Firebase console -> Firestore -> the named database ($Db) -> Rules: the newest release (today), Ctrl F  get('userId', '') == request.auth.uid" 'Yellow'
  if ((Read-Host 'Type LIVE if it is there (Enter to stop here)') -ne 'LIVE') { Stop-Here 'the live rules were not confirmed. The rules are deployed; nothing was pushed. Ask Claude.' }
}

$tagOnGitHub = & git --no-optional-locks ls-remote --tags origin "refs/tags/$RestoreTag"
if ($LASTEXITCODE -ne 0) { Stop-Here 'could not ask GitHub for its tags. The rules are deployed; nothing was pushed.' }
if (-not $tagOnGitHub) {
  if (-not (& git --no-optional-locks tag -l $RestoreTag)) {
    & git tag $RestoreTag $BaseSha
    if ($LASTEXITCODE -ne 0) { Stop-Here "could not make the restore tag $RestoreTag. The rules are deployed; nothing was pushed." }
  } elseif ((& git --no-optional-locks rev-parse "$RestoreTag^{commit}").Trim() -ne $BaseSha) {
    Stop-Here "the restore tag $RestoreTag on this PC is not $MasterBase. Ask Claude; the rules are deployed, nothing was pushed."
  }
  $tp = Run "push the restore tag $RestoreTag" "git push origin refs/tags/$RestoreTag"
  Must $tp 'pushing the restore tag (the rules are deployed; nothing was pushed to master)'
} elseif ((("$tagOnGitHub" -split '\s+')[0]) -ne $BaseSha) {
  Stop-Here "the restore tag $RestoreTag on GitHub is not $MasterBase. Ask Claude; the rules are deployed, nothing was pushed."
}
Log "Restore point on GitHub: $RestoreTag = $($BaseSha.Substring(0, 7))" 'Green'

$MasterNow = Get-RemoteMaster
if (-not $MasterNow) { Stop-Here 'could not reach GitHub before the push. The rules are deployed; the app is unchanged. Run golive again once GitHub answers.' }
if ($MasterNow -eq $BranchSha) {
  Log "master on GitHub is already this commit: nothing to push." 'Green'
} elseif ($MasterNow -eq $BaseSha) {
  & git --no-optional-locks merge-base --is-ancestor $BaseSha $Branch
  if ($LASTEXITCODE -ne 0) { Stop-Here "$Branch no longer fast-forwards master. The rules are deployed; the app is unchanged. Ask Claude." }
  $push = Run "git push origin ${Branch}:master" "git push origin ${Branch}:master"
  Must $push 'the push. The rules are deployed; the app is unchanged'
} else {
  Stop-Here "master on GitHub moved while golive ran (now $($MasterNow.Substring(0, 8))). The rules are deployed; nothing was pushed. Ask Claude."
}

$NewMaster = Get-RemoteMaster
$NewShort = if ($NewMaster) { $NewMaster.Substring(0, 8) } else { $BranchSha.Substring(0, 8) }
Log "DONE. master on GitHub = $NewShort. The app is NOT live yet: Render deploys nothing on a push." 'Green'
Log '' 'White'
Log 'NOW, BY HAND, THIS EVENING, in this order:' 'White'
Log "1. In the project folder ($ProjectFolder), PowerShell:" 'White'
Log '     git pull --ff-only' 'Cyan'
Log '     npm ci' 'Cyan'
Log '   (the lock changed: compression 1.8.2). Close any npm run dev first.' 'White'
Log '2. Render -> MaxStrength App-Beta -> Manual Deploy -> Deploy latest commit. Then:' 'White'
Log '     curl.exe -s https://maxstrength-app-beta.onrender.com/version.json' 'Cyan'
Log "   names $NewShort. Then journey-cron-renewals and journey-cron-leaderboards -> Manual Build, each." 'White'
Log '3. The Mindbody webhook''s two missing events, in the project folder. Look first (changes nothing):' 'White'
Log "     node scripts\mindbody\register-webhook.js --update-events $WebhookId" 'Cyan'
Log '   It must say it lacks appointmentBooking.updated and clientSale.created. Then add them:' 'White'
Log "     node scripts\mindbody\register-webhook.js --update-events $WebhookId --yes-affect-production" 'Cyan'
Log '   It ends "Now Active, events: ..." with both in the list. The secret is unchanged; Firebase needs nothing.' 'White'
Log '4. The rest of the launch list: docs\ops\LAUNCH.md.' 'White'
Log '' 'White'
Log 'TO UNDO (ask Claude first):' 'White'
Log "  git push --force origin ${RestoreTag}:master, Render's three presses, and the rules from that tag" 'White'
Log '  (docs\ops\DEPLOYS-AND-ROLLBACK.md, "The rules").' 'White'
$elapsed = [int]((Get-Date) - $Started).TotalMinutes
Log "Done in about $elapsed minute(s)." 'Green'
exit 0
