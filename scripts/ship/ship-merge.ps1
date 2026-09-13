<#
 ship-merge.ps1  -  get the outstanding work onto master and pushed
 SCRIPT-VERSION: v1

   powershell -ExecutionPolicy Bypass -File .\ship-merge.ps1 report
   powershell -ExecutionPolicy Bypass -File .\ship-merge.ps1 golive

 report  reads only. For every local branch it answers the one question that
         matters: is this branch already an ancestor of master (i.e. its work
         is IN master, whatever the branch name suggests) or does it still
         carry commits master has never seen.

 golive  merges machine-ordering into master - which brings visual-consistency
         with it, since machine-ordering was branched from it - then
         typechecks, tests and builds, and pushes ONLY if tests and build
         pass. Render auto-deploys from master, so a broken push is a broken
         beta URL. Anything else still unmerged is listed for you to decide on
         rather than swept in.

 WHY NOT MERGE ALL 42 BRANCHES
   Most are finished rounds whose commits are already in master; merging them
   again is a no-op at best. The ones that are NOT ancestors are stale dead
   ends, and merging a stale branch does not revert master - but it can
   RESURRECT files that were deliberately deleted later (TrainerControlHubView
   and TrainerMachineEditor were removed in the Sep 5 settings round) and it
   can produce conflicts that look like data loss. So: report, then decide.

   demo-mode-foundation is excluded on purpose - held per DEMO-MODE-BRANCH.md.
#>

param([Parameter(Position = 0)][ValidateSet('report','golive')][string]$Stage = 'report')

$ErrorActionPreference = 'Stop'
$LogFile = Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) 'logs\ship-merge.log'
$SrcBaseline = 18
$HOLD = @('demo-mode-foundation')
$MERGE = @('machine-ordering')   # carries visual-consistency

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

function Survey {
  $branches = (& git for-each-ref --format='%(refname:short)' refs/heads) |
              Where-Object { $_ -and $_ -ne 'master' }
  $merged = @(); $ahead = @()
  foreach ($b in $branches) {
    & git merge-base --is-ancestor $b master 2>$null
    if ($LASTEXITCODE -eq 0) { $merged += $b }
    else {
      $counts = (& git rev-list --left-right --count "master...$b") -split '\s+'
      $ahead += [pscustomobject]@{
        Branch = $b
        Ahead  = [int]$counts[1]   # commits on the branch master lacks
        Behind = [int]$counts[0]   # commits on master the branch lacks
      }
    }
  }
  return @{ Merged = $merged; Ahead = $ahead }
}

if ($Stage -eq 'report') {
  Set-Content -Path $LogFile -Value "=== ship-merge report  $(Get-Date) ===" -Encoding utf8
  Log 'REPORT - reads only, changes nothing' 'Cyan'
  Log ("on branch: " + (& git rev-parse --abbrev-ref HEAD).Trim())

  $s = Survey
  Log ''
  Log ("ALREADY IN MASTER ({0}) - nothing to do, safe to delete whenever:" -f $s.Merged.Count) 'Green'
  foreach ($b in $s.Merged) { Log "    $b" 'DarkGray' }

  Log ''
  Log ("NOT IN MASTER ({0}):" -f $s.Ahead.Count) 'Yellow'
  foreach ($r in ($s.Ahead | Sort-Object -Property Ahead -Descending)) {
    $tag = if ($HOLD -contains $r.Branch)  { '  [HELD]' }
           elseif ($MERGE -contains $r.Branch) { '  [WILL MERGE]' }
           else { '  [your call]' }
    Log ("    {0,-38} +{1,-4} commits master lacks, {2} behind{3}" -f $r.Branch, $r.Ahead, $r.Behind, $tag) `
        $(if ($MERGE -contains $r.Branch) {'Green'} elseif ($HOLD -contains $r.Branch) {'DarkGray'} else {'Yellow'})
  }
  Log ''
  Log 'Then: powershell -ExecutionPolicy Bypass -File .\ship-merge.ps1 golive' 'Cyan'
  exit 0
}

if ($Stage -eq 'golive') {
  Add-Content -Path $LogFile -Value "`n=== ship-merge golive  $(Get-Date) ===" -Encoding utf8
  Log 'GOLIVE - merge, verify, then push only if it is green' 'Cyan'

  $dirty = & git status --porcelain --untracked-files=no
  if ($dirty) { Log 'REFUSING: tracked files modified. Commit or stash.' 'Red'
                $dirty | ForEach-Object { Log "    $_" 'Red' }; exit 1 }
  Log 'No tracked files modified.' 'Green'

  $before = (& git rev-parse master).Trim()
  Log "master before: $before"

  & git checkout master | Out-Null
  if ($LASTEXITCODE -ne 0) { Log 'Could not check out master.' 'Red'; exit 1 }

  foreach ($b in $MERGE) {
    if (-not (& git branch --list $b)) { Log "branch '$b' not found - skipping" 'Yellow'; continue }
    & git merge-base --is-ancestor $b master 2>$null
    if ($LASTEXITCODE -eq 0) { Log "  $b is already in master - nothing to merge" 'DarkGray'; continue }
    & git merge --no-ff $b -m "Merge $b into master"
    if ($LASTEXITCODE -ne 0) {
      Log "MERGE CONFLICT on '$b'. Nothing pushed." 'Red'
      Log "To back all the way out:  git merge --abort; git reset --hard $before" 'Red'
      exit 1
    }
    Log "  merged $b" 'Green'
  }
  Log ("master after : " + (& git rev-parse master).Trim())

  $tsc = Run 'typecheck' 'npx tsc --noEmit'
  $errLines = @($tsc.Output | Where-Object { $_ -match 'error TS' })
  $src = @($errLines | Where-Object { $_ -match '^src[/\\]' }).Count
  Log "typecheck src/ : $src   (baseline $SrcBaseline)" $(if ($src -le $SrcBaseline) {'Green'} else {'Red'})

  $test  = Run 'tests' 'npm test'
  $build = Run 'build' 'npm run build'

  Log ''
  Log '================ SUMMARY ================' 'Cyan'
  Log ("typecheck : src {0} / baseline {1}" -f $src, $SrcBaseline) $(if ($src -le $SrcBaseline) {'Green'} else {'Red'})
  Log ("tests     : {0}" -f $(if ($test.Code  -eq 0) {'pass'} else {'FAIL'})) $(if ($test.Code  -eq 0) {'Green'} else {'Red'})
  Log ("build     : {0}" -f $(if ($build.Code -eq 0) {'clean'} else {'FAIL'})) $(if ($build.Code -eq 0) {'Green'} else {'Red'})

  if ($test.Code -ne 0 -or $build.Code -ne 0) {
    Log ''
    Log 'NOT PUSHING - tests or build failed. Render deploys from master, so a' 'Red'
    Log 'broken push is a broken beta URL. master is merged locally but not sent.' 'Red'
    Log "To undo the merge entirely:  git reset --hard $before" 'Red'
    exit 1
  }

  Log ''
  Log 'Green. Pushing master...' 'Cyan'
  & git push origin master
  $pushCode = $LASTEXITCODE
  Log "push exit code: $pushCode" $(if ($pushCode -eq 0) {'Green'} else {'Red'})
  if ($pushCode -ne 0) {
    Log 'Push failed. master is correct locally; only the send failed.' 'Yellow'
    Log 'GitHub Desktop can push it, or re-run this stage.' 'Yellow'
    exit 1
  }

  $s = Survey
  $left = @($s.Ahead | Where-Object { $HOLD -notcontains $_.Branch })
  Log ''
  Log 'Render will pick up the push and redeploy the beta URL.' 'Cyan'
  if ($left.Count) {
    Log ("Still not in master ({0}) - your call, none merged:" -f $left.Count) 'Yellow'
    foreach ($r in ($left | Sort-Object -Property Ahead -Descending)) {
      Log ("    {0,-38} +{1} commits" -f $r.Branch, $r.Ahead) 'Yellow'
    }
  } else {
    Log 'Nothing outstanding except what is deliberately held.' 'Green'
  }
  exit 0
}
