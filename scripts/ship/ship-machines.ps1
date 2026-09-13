<#
 ship-machines.ps1  -  machine ordering round (Sep 12 2026)
 SCRIPT-VERSION: v1

 Four patches, one commit each, applied onto whatever branch you are on.
 Deliberately does NOT insist on master - the visual round may or may not be
 merged yet and neither round touches the other's files.

   powershell -ExecutionPolicy Bypass -File .\ship-machines.ps1 prepare
   powershell -ExecutionPolicy Bypass -File .\ship-machines.ps1 verify

 Tracked-files-only clean check; untracked files are ignored (your repo root
 has 60). Commits are scoped to `git add src`. All ASCII. Rollback:
   git revert <sha>      one phase
   git reset --hard HEAD~4   all four, if nothing else has landed since
#>

param([Parameter(Position = 0)][ValidateSet('prepare','verify')][string]$Stage = 'prepare')

$ErrorActionPreference = 'Stop'
$LogFile = Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) 'logs\ship-machines.log'
$SrcBaseline = 18   # measured Sep 12; harness/ contributes 1 more, outside the build

function Log { param([string]$m,[string]$c='Gray')
  $l = "[{0}] {1}" -f (Get-Date -Format 'HH:mm:ss'), $m
  Write-Host $l -ForegroundColor $c; Add-Content -Path $LogFile -Value $l -Encoding utf8 }

function Run { param([string]$label,[string]$cmd)
  Log "--- $label ---" 'Cyan'; Log "> $cmd"
  $out = & cmd /c "$cmd 2>&1"; $code = $LASTEXITCODE
  $out | ForEach-Object { Add-Content -Path $LogFile -Value $_ -Encoding utf8 }
  $out | Select-Object -Last 20 | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray }
  Log "$label exit code: $code" $(if ($code -eq 0) {'Green'} else {'Yellow'})
  return @{ Code = $code; Output = $out } }

$Phases = @(
  @{ File='01-one-ordering-mechanism.patch'
     Subject='One ordering mechanism - both floor screens read the roster'
     Body=@(
       'Machine order was answered three ways and the screens disagreed:',
       '  studios/{s}/roster/{id}.order         the Catalog / Learning',
       '  studioMachineSettings/{s}_{id}.order  Journey grid, Active Session',
       '  machines/{id}.order + the code map    the fallbacks',
       '',
       'The middle one holds ZERO documents in production and nothing has',
       'written it since TrainerControlHubView was deleted on Sep 5. So the two',
       'screens trainers use on the floor sorted by a field no UI could set,',
       'while the Catalog sorted by something else. Both now resolve through',
       'the roster, which is the single answer to what a location has and in',
       'what order it runs.',
       '',
       'useStudioMachines().byId is keyed by machineId and its order is already',
       'resolved, so passing it as the override is idempotent; an unrostered',
       'machine yields undefined and falls back to the code default, which is',
       'what studios with an empty roster get today.') }

  @{ File='02-catalog-fallback-order.patch'
     Subject="Catalog fallback respects the machine's own order"
     Body=@(
       'useCatalogMachines called resolveMachineOrder(a.id, undefined), dropping',
       'the second argument, so any machine missing from the standard map fell',
       'to 999 and sorted last even when its machines/{id} document carried a',
       'good order. Exactly what happened to the Leg Extension while it was',
       'filed as m-leg-ext. Sorting now happens before the adapter runs, while',
       "the machine's own order is still in hand.",
       '',
       'No per-studio override to pass here - this branch only runs when the',
       'roster is empty - but the catalog order is real and now counts.') }

  @{ File='03-reorder-the-floor.patch'
     Subject="Reorder the studio's floor"
     Body=@(
       'A Reorder button on the Equipment manager (Operations > Studios >',
       'Equipment, and the Catalog). Drag to set the sequence; one batched',
       'write of order 1..n to studios/{s}/roster. dnd-kit, same sensors and',
       'pattern as the Routine Builder.',
       '',
       'Reorder mode lists only machines in service, unfiltered, and hides the',
       'search box: dragging inside a filtered list moves a row to a position',
       'that stops existing once the filter clears.',
       '',
       '"MSF standard" deletes the order field rather than writing the default',
       'numbers, so a studio follows future changes to the standard instead of',
       'being pinned to a copy of it.',
       '',
       'This is the control that was deleted in September and never rebuilt.') }

  @{ File='04-guard-the-mechanism.patch'
     Subject='Guard the single ordering mechanism'
     Body=@(
       'src/data/machine-order.test.ts:',
       '  - the standard map has 20 entries, numbered 1..20, no gaps',
       '  - every id is canonical m-* (the test that would have caught',
       '    m-leg-ext, which cost an order, an anatomy figure and the',
       '    Academy content for one machine)',
       '  - resolveMachineOrder falls back override -> map -> own order -> 999,',
       '    and an override of 0 is a real position rather than absent',
       '  - no file reads .order off a studioMachineSettings map again',
       '',
       'studioMachineSettings keeps its real job: settingOptions and',
       'standardSettings, written by the Catalog StudioSetupCard.') }
)

$Trailer = @('','Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>',
             'Claude-Session: https://claude.ai/code/session_017WvkUYfin4UB4H5Jt9nueN')

if ($Stage -eq 'prepare') {
  Set-Content -Path $LogFile -Value "=== ship-machines prepare  $(Get-Date) ===" -Encoding utf8
  Log 'PREPARE - four patches, one commit each' 'Cyan'

  $dirty = & git status --porcelain --untracked-files=no
  if ($dirty) { Log 'REFUSING: tracked files modified. Commit or stash.' 'Red'
                $dirty | ForEach-Object { Log "    $_" 'Red' }; exit 1 }
  Log 'No tracked files modified.' 'Green'
  Log ("Branching from: " + (& git rev-parse --abbrev-ref HEAD).Trim())

  $newTest = Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) 'src\data\machine-order.test.ts'
  if (Test-Path $newTest) { Log 'src\data\machine-order.test.ts already exists - delete it and re-run.' 'Red'; exit 1 }

  $modes = @(@{A=@();W='exact'}, @{A=@('--ignore-whitespace');W='ignoring whitespace'}, @{A=@('--3way');W='3-way'})
  $chosen = @{}
  foreach ($p in $Phases) {
    $path = Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) "patches-machines\$($p.File)"
    if (-not (Test-Path $path)) { Log "MISSING: $path" 'Red'; exit 1 }
    $okMode = $null
    foreach ($m in $modes) { & git apply --check @($m.A) $path 2>$null; if ($LASTEXITCODE -eq 0) { $okMode = $m; break } }
    if (-not $okMode) { Log "PATCH WOULD FAIL: $($p.File)" 'Red'; & git apply --check $path; exit 1 }
    $chosen[$p.File] = $okMode.A
    Log ("  ok  $($p.File)" + $(if ($okMode.W -eq 'exact') {''} else {"  <- $($okMode.W)"})) 'Green'
  }

  $branch = 'machine-ordering'
  if ((& git branch --list $branch)) { Log "Branch '$branch' exists. Delete or rename it." 'Red'; exit 1 }
  & git checkout -b $branch | Out-Null
  Log "Created and switched to '$branch'." 'Green'

  foreach ($p in $Phases) {
    $path = Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) "patches-machines\$($p.File)"
    & git apply @($chosen[$p.File]) $path
    if ($LASTEXITCODE -ne 0) { Log "apply failed: $($p.File)" 'Red'; exit 1 }
    & git add src
    $tmp = Join-Path $env:TEMP 'machines-msg.txt'
    Set-Content -Path $tmp -Value (@($p.Subject,'') + $p.Body + $Trailer) -Encoding ascii
    & git commit -q -F $tmp; Remove-Item $tmp -Force
    Log ("  " + (& git rev-parse --short HEAD).Trim() + "  $($p.Subject)") 'Green'
  }
  Log ''
  Log 'NEXT:  powershell -ExecutionPolicy Bypass -File .\ship-machines.ps1 verify' 'Cyan'
  exit 0
}

if ($Stage -eq 'verify') {
  Add-Content -Path $LogFile -Value "`n=== ship-machines verify  $(Get-Date) ===" -Encoding utf8
  Log 'VERIFY - typecheck, tests, build' 'Cyan'
  Log ("branch: " + (& git rev-parse --abbrev-ref HEAD).Trim())

  $tsc = Run 'typecheck' 'npx tsc --noEmit'
  $errLines = @($tsc.Output | Where-Object { $_ -match 'error TS' })
  $src = @($errLines | Where-Object { $_ -match '^src[/\\]' }).Count
  $harness = @($errLines | Where-Object { $_ -match '^harness[/\\]' }).Count
  Log "typecheck src/     : $src   (baseline $SrcBaseline)" $(if ($src -le $SrcBaseline) {'Green'} else {'Red'})
  Log "typecheck harness/ : $harness   (expected 1)" 'DarkGray'
  if ($src -gt $SrcBaseline) {
    Log "ABOVE BASELINE by $($src - $SrcBaseline)" 'Red'
    $errLines | Where-Object { $_ -match '^src[/\\]' } | Select-Object -First 12 | ForEach-Object { Log "    $_" 'Red' }
  }

  $test = Run 'tests' 'npm test'
  if (@($test.Output | Where-Object { $_ -match 'machine-order' }).Count -eq 0) {
    Log 'NOTE: machine-order.test.ts did not appear - did prepare run?' 'Yellow' }

  $build = Run 'build' 'npm run build'

  Log ''
  Log '================ SUMMARY ================' 'Cyan'
  Log ("typecheck : src {0} / baseline {1}" -f $src, $SrcBaseline) $(if ($src -le $SrcBaseline) {'Green'} else {'Red'})
  Log ("tests     : {0}" -f $(if ($test.Code  -eq 0) {'pass'} else {'FAIL'})) $(if ($test.Code  -eq 0) {'Green'} else {'Red'})
  Log ("build     : {0}" -f $(if ($build.Code -eq 0) {'clean'} else {'FAIL'})) $(if ($build.Code -eq 0) {'Green'} else {'Red'})
  Log ''
  Log 'Then: Operations > Studios > pick Solon or Strongsville > Equipment > Reorder.' 'Cyan'
  Log 'Drag the Leg Extension, Save order, and check the client Journey grid and' 'Cyan'
  Log 'the Active Session both show the new sequence. That is the whole point.' 'Cyan'
  exit 0
}
