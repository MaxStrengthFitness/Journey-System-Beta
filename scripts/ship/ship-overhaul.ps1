<#
 ship-overhaul.ps1  -  the Operations overhaul to master
 SCRIPT-VERSION: v1  (Sep 19 2026)

   powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-overhaul.ps1 check
   powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-overhaul.ps1 golive

 WHAT IS ON THE BRANCH
   operations-overhaul carries, on top of master at dbc0714, eight commits -
   one per phase (docs/rounds/2026-09-19-operations-overhaul.md):
     1  the change stamps - the sync writes down when a booking went and
        where a moved one came from; the day's changes list (pure)
     2  the watchlist and acknowledgements - rules, two rules tests, streams
     3  when a note matters - the three-shape window, the 60-day review,
        the quick note from the header, Notes first on the record
     4  the Overview - today, what needs you, the next three days, the
        week; Changes and the Attendance watch as its two views
     5  nine tabs, down from seventeen - Floor, Insights with Hours,
        Mindbody for leaders, Data
     6  the Admins dashboard - a third position on the app-mode switch
     7  loose ends - the attendance number in AJ's words, tests, the
        palette ratchet
     8  docs
   master has nothing the branch lacks, so the merge is a fast-forward. No
   Cloud Functions changes. No dependency changes. The webhook is untouched.

 WHAT CHANGES IN FIRESTORE
   Two new composite indexes: schedules (studioId, movedFromDay) - the
   Overview's moved-bookings read - and journalEntries (studioId,
   effectiveUntil) - the Moments panel's dated notes. Until each is built the
   read it serves fails and the page says so; nothing else waits on them.
   The rules ADD two per-studio collections (studios/{s}/watchlist and
   studios/{s}/acknowledgements) and nothing else; the running app is
   unaffected, so they go before the push. Additive fields only elsewhere
   (schedules: cancelledAt, cancelSource, movedFromDay, movedFromStart,
   movedAt; journalEntries: repeat, reviewedAt).

 check   reads only. Typecheck (count against the baseline), the suite in
         Eastern time, the rules tests (THE run that counts - the cloud
         container cannot run the emulator), a production build. Stops at
         the first failure and says which.

 golive  the deploy order from CLAUDE.md:
           firebase deploy --only firestore:indexes
           firebase deploy --only firestore:rules
           git checkout master; git merge --ff-only operations-overhaul; git push
         Every step is gated on the one before it. Render deploys on the push.

 IF check FAILS on the rules tests, read the failing test name: this round's
 two are under "OPERATIONS OVERHAUL (Sep 19 2026)" at the end of
 tests/firestore.rules.test.ts. Send the output; do not deploy.
#>

param([Parameter(Position = 0)][ValidateSet('check','golive')][string]$Stage = 'check')

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $Root
$LogFile = Join-Path $Root 'logs\ship-overhaul.log'
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $LogFile) | Out-Null
$Branch = 'operations-overhaul'
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

Log "ship-overhaul $Stage" 'White'

# ---- where are we -----------------------------------------------------------
$cur = (& git rev-parse --abbrev-ref HEAD).Trim()
if ($cur -ne $Branch) { Log "STOP: on '$cur', expected '$Branch'. git checkout $Branch first." 'Red'; exit 1 }
$dirty = (& git status --porcelain --untracked-files=no -- src docs server scripts firestore.rules firestore.indexes.json CLAUDE.md tests) | Where-Object { $_ }
if ($dirty) { Log "STOP: uncommitted changes under src/docs/server/scripts/rules/indexes/tests:" 'Red'; $dirty | ForEach-Object { Log "   $_" 'Red' }; exit 1 }
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

  Log "CHECK PASSED. Next: powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-overhaul.ps1 golive" 'Green'
  exit 0
}

# ---- golive ------------------------------------------------------------------
Log "golive: the two indexes, then the rules (they only add access), then the app." 'White'

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

Log "GOLIVE COMPLETE. master = $((& git rev-parse --short HEAD).Trim()). Watch Render, check both new indexes have finished building in the console, then walk Round 13 of docs/ops/TESTING-CHECKLIST.md." 'Green'
exit 0
