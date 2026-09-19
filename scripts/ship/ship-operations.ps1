<#
 ship-operations.ps1  -  the Operations round (Round B of the Operations audit) to master
 SCRIPT-VERSION: v1  (Sep 19 2026)

   powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-operations.ps1 check
   powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-operations.ps1 golive

 WHAT IS ON THE BRANCH
   operations-round carries, on top of my-studio (Round A, six commits, itself
   on master at 93fb096), seven commits - one per phase
   (docs/rounds/2026-09-19-operations.md):
     1  Hours - training hours by trainer, week and month
     2  one scope for every tab; the Franchise screen folded in; All locations
     3  the Monday page - the four questions; the Sunday job's watch list
     4  the Catalog - the standard set as a view; the submissions queue
     5  Delight's row actions
     6  the fix pile
     7  docs
   master has nothing the branch lacks, so the merge is a fast-forward and
   ships Round A and Round B together. No Cloud Functions changes. No
   dependency changes.

 WHAT CHANGES IN FIRESTORE
   One new composite index (journalEntries: studioId, importance, occurredAt
   desc) - the Monday page's critical notes read fails until it is built, and
   nothing else waits on it. The rules add access only (Round A's grant and
   studio-tier writes, Round B's read-only watch document); the running app
   is unaffected, so they go before the push.

 check   reads only. Typecheck (count against the baseline), the suite in
         Eastern time, the rules tests (THE run that counts - the cloud
         container cannot run the emulator), a production build. Stops at
         the first failure and says which.

 golive  the deploy order from CLAUDE.md:
           firebase deploy --only firestore:indexes
           firebase deploy --only firestore:rules
           git checkout master; git merge --ff-only operations-round; git push
           npx tsx scripts/run-machine-trends.ts --commit
         Every step is gated on the one before it. Render deploys on the push.
         The last step writes the first watch documents so the Monday page
         has an answer before the first Sunday - the same 90-day read the
         job makes every Sunday, once. (To see it without writing first:
         npx tsx scripts/run-machine-trends.ts, the dry run.)

 IF check FAILS on the rules tests, read the failing test name: Round A's
 ten are under "MY STUDIO (Sep 19 2026)" and Round B's one under
 "OPERATIONS (Sep 19 2026)" at the end of tests/firestore.rules.test.ts.
 Send the output; do not deploy.
#>

param([Parameter(Position = 0)][ValidateSet('check','golive')][string]$Stage = 'check')

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $Root
$LogFile = Join-Path $Root 'logs\ship-operations.log'
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $LogFile) | Out-Null
$Branch = 'operations-round'
$TscBaseline = 12   # 11 on a clean clone; one more on AJ's working copy from the untracked "Claude outputs" folder

function Log { param([string]$m,[string]$c='Gray')
  $l = "[{0}] {1}" -f (Get-Date -Format 'HH:mm:ss'), $m
  Write-Host $l -ForegroundColor $c; Add-Content -Path $LogFile -Value $l -Encoding utf8 }

function Run { param([string]$label,[string]$cmd)
  Log "--- $label ---" 'Cyan'; Log "> $cmd"
  $out = & cmd /c "$cmd 2>&1"; $code = $LASTEXITCODE
  $out | ForEach-Object { Add-Content -Path $LogFile -Value $_ -Encoding utf8 }
  $out | Select-Object -Last 18 | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray }
  Log "$label exit code: $code" $(if ($code -eq 0) {'Green'} else {'Yellow'})
  return @{ Code = $code; Output = $out } }

function Must { param([hashtable]$r,[string]$what)
  if ($r.Code -ne 0) { Log "STOP: $what failed. See $LogFile" 'Red'; exit 1 } }

Log "ship-operations $Stage" 'White'

# ---- where are we -----------------------------------------------------------
$cur = (& git rev-parse --abbrev-ref HEAD).Trim()
if ($cur -ne $Branch) { Log "STOP: on '$cur', expected '$Branch'. git checkout $Branch first." 'Red'; exit 1 }
$dirty = (& git status --porcelain --untracked-files=no -- src docs server scripts firestore.rules firestore.indexes.json CLAUDE.md tests) | Where-Object { $_ }
if ($dirty) { Log "STOP: uncommitted changes under src/docs/server/scripts/rules/indexes/tests:" 'Red'; $dirty | ForEach-Object { Log "   $_" 'Red' }; exit 1 }
& git merge-base --is-ancestor master $Branch 2>$null
if ($LASTEXITCODE -ne 0) { Log "STOP: master is not an ancestor of $Branch - not a fast-forward. Rebase or merge master in first." 'Red'; exit 1 }
$ahead = (& git rev-list --count "master..$Branch").Trim()
Log "$Branch is $ahead commits ahead of master (Round A + Round B); fast-forward is possible." 'Green'

if ($Stage -eq 'check') {
  # ---- typecheck: the COUNT, not zero ---------------------------------------
  $tsc = Run 'typecheck' 'npx tsc --noEmit'
  $errs = @($tsc.Output | Where-Object { $_ -match 'error TS' }).Count
  Log "tsc errors: $errs (baseline $TscBaseline)" $(if ($errs -le $TscBaseline) {'Green'} else {'Red'})
  if ($errs -gt $TscBaseline) { Log "STOP: more typecheck errors than the baseline." 'Red'; exit 1 }

  # ---- the suite, in the studio's time zone (the date trap in CLAUDE.md) ----
  $env:TZ = 'America/New_York'
  $vt = Run 'vitest (TZ=America/New_York)' 'npx vitest run src'
  Must $vt 'vitest'

  # ---- the rules tests: this run is the one that counts ---------------------
  $rt = Run 'rules tests' 'npm run test:rules'
  Must $rt 'test:rules  (needs JDK 21; "port taken" = an old emulator still on 8080)'

  # ---- a production build ----------------------------------------------------
  $bd = Run 'vite build' 'npx vite build'
  Must $bd 'vite build'

  # ---- the service account the last golive step needs ------------------------
  if (-not (Test-Path (Join-Path $Root 'service-account.json'))) {
    Log "STOP: service-account.json is not in the project folder; golive's last step (the watch list) needs it." 'Red'; exit 1 }
  Log "service-account.json present (never printed, never committed)." 'Green'

  Log "CHECK PASSED. Next: powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-operations.ps1 golive" 'Green'
  exit 0
}

# ---- golive ------------------------------------------------------------------
Log "golive: the index, then the rules (they only add access), then the app, then the watch list." 'White'

$idx = Run 'firebase deploy --only firestore:indexes' 'firebase deploy --only firestore:indexes'
Must $idx 'index deploy'

$rules = Run 'firebase deploy --only firestore:rules' 'firebase deploy --only firestore:rules'
Must $rules 'rules deploy'

$co = Run 'git checkout master' 'git checkout master'
Must $co 'checkout master'
$ff = Run "git merge --ff-only $Branch" "git merge --ff-only $Branch"
Must $ff 'fast-forward merge'
$push = Run 'git push origin master' 'git push origin master'
Must $push 'push (Render deploys from this)'

$job = Run 'machine trends --commit (the first watch documents)' 'npx tsx scripts/run-machine-trends.ts --commit'
Must $job 'run-machine-trends --commit'

Log "GOLIVE COMPLETE. master = $((& git rev-parse --short HEAD).Trim()). Watch Render, check the journalEntries index has finished building in the console, then walk Rounds 10 and 11 of docs/ops/TESTING-CHECKLIST.md on the iPad." 'Green'
exit 0
