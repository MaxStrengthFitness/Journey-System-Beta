<#
 cleanup-branches.ps1  -  delete the branches whose work is already in master
 SCRIPT-VERSION: v2

 FIXED IN v2
   The `remote` stage died on its first push. git writes "To https://..." to
   STDERR as ordinary progress output, not because anything went wrong; with
   `2>&1` PowerShell 5.1 turns that into an error record, and
   $ErrorActionPreference = 'Stop' then terminates the script. The `local`
   stage was unaffected only because `git branch -d` reports on stdout.
   Both delete loops now go through GitSafe, which scopes the preference to
   'Continue' and judges success by the exit code, which is the only thing
   that actually means success.

   The stage is idempotent - it recomputes its target list from `git ls-remote`
   every run - so re-running it after the crash simply picks up wherever it got
   to. One or two branches may already be gone; they just will not be listed.

   powershell -ExecutionPolicy Bypass -File .\cleanup-branches.ps1 report
   powershell -ExecutionPolicy Bypass -File .\cleanup-branches.ps1 local
   powershell -ExecutionPolicy Bypass -File .\cleanup-branches.ps1 remote

 report  reads only. Lists every local branch git considers merged into
         master, marks which ones also exist on GitHub, and names what is
         being kept and why.

 local   deletes the merged local branches. Uses `git branch -d` (lowercase),
         which REFUSES to delete anything not actually merged - so even if the
         list below were wrong, git will not let this lose a commit. Also runs
         `git remote prune origin` to drop remote-tracking refs for branches
         already deleted on GitHub.

 remote  deletes the same branches on GitHub. Separate and opt-in, because
         that one is visible to anyone else with the repo and is not undoable
         from here. Run `local` first, look at the result, then decide.

 ALWAYS KEPT
   master                 obviously
   demo-mode-foundation   held on purpose - it is NOT merged, it carries the
                          demo-mode work, and DEMO-MODE-BRANCH.md says it has
                          to be cherry-picked and rewritten rather than merged.
                          `git branch -d` would refuse it anyway.

 WHY THIS IS SAFE
   "Merged into master" here means `git merge-base --is-ancestor <branch>
   master` - every commit on the branch is already reachable from master.
   Deleting the label throws away a name, not work. Any of these can be
   recreated later with `git branch <name> <sha>` if you ever want the label
   back; `git reflog` keeps the shas for 90 days.
#>

param([Parameter(Position = 0)][ValidateSet('report','local','remote')][string]$Stage = 'report')

$ErrorActionPreference = 'Stop'
$LogFile = Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) 'logs\cleanup-branches.log'
$KEEP = @('master', 'demo-mode-foundation')

function Log { param([string]$m,[string]$c='Gray')
  $l = "[{0}] {1}" -f (Get-Date -Format 'HH:mm:ss'), $m
  Write-Host $l -ForegroundColor $c; Add-Content -Path $LogFile -Value $l -Encoding utf8 }

# Branches every one of whose commits is already reachable from master.
function MergedBranches {
  $all = (& git for-each-ref --format='%(refname:short)' refs/heads) | Where-Object { $_ }
  $out = @()
  foreach ($b in $all) {
    if ($KEEP -contains $b) { continue }
    & git merge-base --is-ancestor $b master 2>$null
    if ($LASTEXITCODE -eq 0) { $out += $b }
  }
  return $out
}

# Which of them also exist on the remote.
function OnRemote {
  $refs = (& git ls-remote --heads origin 2>$null) |
          ForEach-Object { ($_ -split '\s+')[1] } |
          Where-Object { $_ } |
          ForEach-Object { $_ -replace '^refs/heads/', '' }
  return @($refs)
}

<#
 Run a git command without letting its stderr chatter look like a failure.

 git uses stderr for ordinary progress ("To https://...", "Deleted branch..."),
 and under `2>&1` PowerShell 5.1 wraps each of those lines in an ErrorRecord.
 With ErrorActionPreference = 'Stop' the first one aborts the script even
 though git succeeded. So: scope the preference to Continue, capture
 everything, and decide from $LASTEXITCODE.
#>
function GitSafe {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$GitArgs)
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $out = & git @GitArgs 2>&1
    return @{ Code = $LASTEXITCODE; Output = $out }
  } finally {
    $ErrorActionPreference = $prev
  }
}

$current = (& git rev-parse --abbrev-ref HEAD).Trim()

if ($Stage -eq 'report') {
  Set-Content -Path $LogFile -Value "=== cleanup-branches report  $(Get-Date) ===" -Encoding utf8
  Log 'REPORT - reads only, deletes nothing' 'Cyan'
  Log "on branch: $current"

  $merged = MergedBranches
  $remote = OnRemote
  Log ''
  Log ("MERGED INTO MASTER - safe to delete ({0}):" -f $merged.Count) 'Green'
  foreach ($b in $merged) {
    $tag = if ($remote -contains $b) { '   also on GitHub' } else { '' }
    Log ("    {0,-42}{1}" -f $b, $tag) 'DarkGray'
  }

  Log ''
  Log 'KEPT:' 'Cyan'
  Log '    master' 'DarkGray'
  & git merge-base --is-ancestor 'demo-mode-foundation' master 2>$null
  if ($LASTEXITCODE -eq 0) {
    Log '    demo-mode-foundation   (held by name - though it IS merged now)' 'Yellow'
  } else {
    Log '    demo-mode-foundation   (NOT merged - carries the demo-mode work)' 'DarkGray'
  }

  $unmerged = (& git for-each-ref --format='%(refname:short)' refs/heads) |
              Where-Object { $_ -and $_ -ne 'master' -and $merged -notcontains $_ -and $_ -ne 'demo-mode-foundation' }
  if ($unmerged) {
    Log ''
    Log 'NOT MERGED and not on the keep list - left alone, look before deleting:' 'Yellow'
    foreach ($b in $unmerged) { Log "    $b" 'Yellow' }
  }

  Log ''
  Log 'Next: powershell -ExecutionPolicy Bypass -File .\cleanup-branches.ps1 local' 'Cyan'
  exit 0
}

if ($Stage -eq 'local') {
  Add-Content -Path $LogFile -Value "`n=== cleanup-branches local  $(Get-Date) ===" -Encoding utf8
  Log 'LOCAL - deleting merged local branches' 'Cyan'

  if ($current -ne 'master') {
    Log "You are on '$current'. Switching to master so it cannot be one of the deletions." 'Yellow'
    & git checkout master | Out-Null
    if ($LASTEXITCODE -ne 0) { Log 'Could not check out master (uncommitted changes?).' 'Red'; exit 1 }
  }

  $merged = MergedBranches
  if ($merged.Count -eq 0) { Log 'Nothing to delete.' 'Green'; exit 0 }
  Log ("deleting {0} branches" -f $merged.Count)

  $done = 0; $refused = 0
  foreach ($b in $merged) {
    # -d not -D: git refuses if the branch is not actually merged. That is a
    # second opinion on the check above, from the only thing that really knows.
    $r = GitSafe branch -d $b
    $r.Output | ForEach-Object { Add-Content -Path $LogFile -Value $_ -Encoding utf8 }
    if ($r.Code -eq 0) { Log "  deleted  $b" 'Green'; $done++ }
    else { Log "  REFUSED  $b  (git says it is not fully merged - left alone)" 'Yellow'; $refused++ }
  }

  Log ''
  Log 'Pruning remote-tracking refs for branches already gone from GitHub...' 'Cyan'
  & git remote prune origin 2>&1 | ForEach-Object { Log "    $_" 'DarkGray' }

  $left = (& git for-each-ref --format='%(refname:short)' refs/heads) | Where-Object { $_ }
  Log ''
  Log ("deleted {0}, refused {1}" -f $done, $refused) $(if ($refused) {'Yellow'} else {'Green'})
  Log ("local branches remaining ({0}):" -f $left.Count) 'Cyan'
  foreach ($b in $left) { Log "    $b" 'DarkGray' }
  Log ''
  Log 'The work is all still in master. To get a label back:  git branch <name> <sha>' 'DarkGray'
  Log '`git reflog` keeps the shas for 90 days.' 'DarkGray'
  Log ''
  Log 'GitHub still has its copies. To clear those too:' 'Cyan'
  Log '  powershell -ExecutionPolicy Bypass -File .\cleanup-branches.ps1 remote' 'Cyan'
  exit 0
}

if ($Stage -eq 'remote') {
  Add-Content -Path $LogFile -Value "`n=== cleanup-branches remote  $(Get-Date) ===" -Encoding utf8
  Log 'REMOTE - deleting the same branches on GitHub' 'Cyan'
  Log 'This is visible to anyone else with the repo and cannot be undone from here.' 'Yellow'

  # Whatever is still on the remote AND already contained in master. Computed
  # against the remote's own list rather than the local branches, because
  # `local` has by now deleted the local labels.
  $remote = OnRemote
  $targets = @()
  foreach ($b in $remote) {
    if ($KEEP -contains $b) { continue }
    & git merge-base --is-ancestor "origin/$b" master 2>$null
    if ($LASTEXITCODE -eq 0) { $targets += $b }
  }

  if ($targets.Count -eq 0) {
    Log 'Nothing on the remote is both merged and deletable.' 'Green'
    Log 'If you expected some, run `git fetch origin` first so origin/* is current.' 'DarkGray'
    exit 0
  }

  Log ("deleting {0} remote branches:" -f $targets.Count)
  foreach ($b in $targets) { Log "    $b" 'DarkGray' }

  $done = 0; $failed = 0
  foreach ($b in $targets) {
    $r = GitSafe push origin --delete $b
    $r.Output | ForEach-Object { Add-Content -Path $LogFile -Value $_ -Encoding utf8 }
    if ($r.Code -eq 0) { Log "  deleted  origin/$b" 'Green'; $done++ }
    else {
      Log "  FAILED   origin/$b" 'Red'
      $r.Output | Select-Object -First 3 | ForEach-Object { Log "             $_" 'Red' }
      $failed++
    }
  }
  Log ''
  Log ("deleted {0}, failed {1}" -f $done, $failed) $(if ($failed) {'Yellow'} else {'Green'})
  Log 'Deleted remote branches are recoverable on GitHub for a while via the' 'DarkGray'
  Log 'repo Activity feed, and always from your local reflog.' 'DarkGray'
  exit 0
}
