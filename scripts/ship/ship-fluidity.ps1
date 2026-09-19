<#
 ship-fluidity.ps1  -  the history-editing, machine-fit and fluidity rounds to master
 SCRIPT-VERSION: v1  (Sep 18 2026)

   powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-fluidity.ps1 check
   powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-fluidity.ps1 golive

 WHAT IS ON THE BRANCH
   fluidity-round carries, on top of master (the Relay round):
     - the history-editing round  (Sep 17)  - rules: trainers may delete sessions / exerciseLogs
     - the machine-fit round      (Sep 17)  - rules: studios/{s}/machineFit, kaizenReports
     - fluidity 1-10              (Sep 17-18) - no rules changes
   master has nothing the branch lacks, so the merge is a fast-forward.
   No index changes. No Cloud Functions changes.

 check   reads only. Typecheck (count against the baseline), the suite in
         Eastern time, the rules tests, a production build. Stops at the first
         failure and says which.

 golive  the deploy order from CLAUDE.md:
           firebase deploy --only firestore:rules   (rules only ADD access, so the
                                                     running app is unaffected)
           git checkout master; git merge --ff-only fluidity-round; git push
           npx tsx scripts/rebuild-machine-fit.ts --commit      (machine-fit round)
           npx tsx scripts/run-machine-trends.ts --commit       (machine-fit round)
         Every step is gated on the one before it. Render deploys on the push.

 IF check FAILS on the suite, read the failing test name before anything
 else - the fluidity round changed machineTimeFields and rosterCoverage on
 purpose and updated their tests; a failure elsewhere is news.
#>

param([Parameter(Position = 0)][ValidateSet('check','golive')][string]$Stage = 'check')

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $Root
$LogFile = Join-Path $Root 'logs\ship-fluidity.log'
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $LogFile) | Out-Null
$Branch = 'fluidity-round'
$TscBaseline = 12   # measured on AJ's working copy; one error comes from the untracked "Claude outputs" folder

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

Log "ship-fluidity $Stage" 'White'

# ---- where are we -----------------------------------------------------------
$cur = (& git rev-parse --abbrev-ref HEAD).Trim()
if ($cur -ne $Branch) { Log "STOP: on '$cur', expected '$Branch'. git checkout $Branch first." 'Red'; exit 1 }
$dirty = (& git status --porcelain -- src docs firestore.rules CLAUDE.md) | Where-Object { $_ }
if ($dirty) { Log "STOP: uncommitted changes under src/docs/rules:" 'Red'; $dirty | ForEach-Object { Log "   $_" 'Red' }; exit 1 }
& git merge-base --is-ancestor master $Branch 2>$null
if ($LASTEXITCODE -ne 0) { Log "STOP: master is not an ancestor of $Branch - not a fast-forward. Rebase or merge master in first." 'Red'; exit 1 }
$ahead = (& git rev-list --count "master..$Branch").Trim()
Log "$Branch is $ahead commits ahead of master; fast-forward is possible." 'Green'

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

  Log "CHECK PASSED. Next: powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-fluidity.ps1 golive" 'Green'
  exit 0
}

# ---- golive ------------------------------------------------------------------
Log "golive: rules first (they only add access), then the app, then the machine-fit scripts." 'White'

$rules = Run 'firebase deploy --only firestore:rules' 'firebase deploy --only firestore:rules'
Must $rules 'rules deploy'

$co = Run 'git checkout master' 'git checkout master'
Must $co 'checkout master'
$ff = Run "git merge --ff-only $Branch" "git merge --ff-only $Branch"
Must $ff 'fast-forward merge'
$push = Run 'git push origin master' 'git push origin master'
Must $push 'push (Render deploys from this)'

Log "master pushed. Render is deploying. The two machine-fit scripts next (each is dry-run by default; --commit writes)." 'White'
$rb = Run 'rebuild machine fit' 'npx tsx scripts/rebuild-machine-fit.ts --commit'
Must $rb 'rebuild-machine-fit'
$mt = Run 'run machine trends' 'npx tsx scripts/run-machine-trends.ts --commit'
Must $mt 'run-machine-trends'

Log "GOLIVE COMPLETE. master = $((& git rev-parse --short HEAD).Trim()). Watch Render, then walk docs/ops/TESTING-CHECKLIST.md on the iPad." 'Green'
exit 0
