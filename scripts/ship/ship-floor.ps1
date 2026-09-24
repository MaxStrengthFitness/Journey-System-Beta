<#
.SYNOPSIS
  Ships the floor round (Sep 12-13 2026): the four set outcomes, Finish that
  never blocks, the progression cue, the journal writers, the Insights change
  - plus three fixes found on Sep 13: the Kaizen Roster save, a self-
  describing Mindbody-gate error, and the CI job that was red on every run.

.DESCRIPTION
  Three stages, run in order from the repo root:

    powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-floor.ps1 prepare
    powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-floor.ps1 verify
    powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-floor.ps1 golive

  prepare  - on master with a clean tree: checks the ten patches in
             patches-floor\ are the ones Claude made (SHA-256), proves they
             apply to what git has stored (a scratch index - nothing is
             touched), records master's typecheck error count, then makes
             the branch "floor-round" with one commit per patch and writes
             the files into the working folder.
  verify   - on floor-round: typecheck (the error count must not go up
             against master's), the tests, the production build and the
             cron bundles. Records the commit it checked.
  golive   - fast-forwards master to the checked commit and pushes. Render
             deploys master. No rules or indexes change in this round.

  Every step that changes anything says so, and every failure says what was
  and was not done. Output also goes to logs\ship-floor.log.

  This file is ASCII only on purpose: Windows PowerShell 5.1 reads a file
  without a byte-order mark as ANSI, and a stray curly quote would break it.
#>
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('prepare', 'verify', 'golive')]
  [string]$Stage,
  [switch]$SkipTests
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2

# ---------------------------------------------------------------- where
$GitExe = (Get-Command git -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source
$RepoDir = (& $GitExe -C $PSScriptRoot rev-parse --show-toplevel 2>$null)
if (-not $RepoDir) { throw "This script must live inside the repo (scripts\ship\). Couldn't find the repo root from $PSScriptRoot." }
$RepoDir = $RepoDir.Trim() -replace '/', '\'
Set-Location -LiteralPath $RepoDir

$LogDir = Join-Path $RepoDir 'logs'
if (-not (Test-Path -LiteralPath $LogDir)) { New-Item -ItemType Directory -Path $LogDir | Out-Null }
Start-Transcript -Path (Join-Path $LogDir 'ship-floor.log') -Append | Out-Null

$PatchDir = Join-Path $RepoDir 'patches-floor'
$ReleaseBranch = 'floor-round'
$BaseFile = Join-Path $RepoDir '.git\ship-floor.base'
$BaselineFile = Join-Path $RepoDir '.git\ship-floor.baseline'
$CheckedFile = Join-Path $RepoDir '.git\ship-floor.checked'

$Trailer = @(
  'Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>',
  'Claude-Session: https://claude.ai/code/session_01YQy9wnt2F6DomSuzMCY5wu'
)

# The ten patches, in order. The hash is of the file Claude produced; a
# patch that has been edited or re-saved will not match and the script stops.
$Phases = @(
  @{ File = '01-set-outcome.patch'; Sha256 = 'bd507ed8bce54ba48f67379e0d1d391127c7a977de08195323e16aadc6ef5fbb'
     Subject = 'feat(sets): the four set outcomes and session timing, decided once'
     Body = @(
       'Phase 1 of the floor round. src/lib/set-outcome.ts names the four outcomes',
       'of a planned machine (performed | practice | skipped | not_reached), the',
       'approved skip reasons, and the one set of rules every reader uses:',
       'outcomeOf (a log without the field is performed if it carries a count and',
       'skipped:unknown if not), isPerformedLog / performedOnly, outcomeAtFinish,',
       'unreachedMachineIds and importedOutcome (the FileMaker rule).',
       'src/lib/session-timing.ts matches a session to its Mindbody booking and',
       'derives how late it started. New fields on ExerciseLog and WorkoutSession.',
       '23 tests.') }
  @{ File = '02-performed-only.patch'; Sha256 = '94f432767cfd7f47df9ed71d0287254769fbe81e2646f3511f1006dbb10769ed'
     Subject = 'feat(sets): every average, rollup and "last time" reads performed sets only'
     Body = @(
       'Phase 2 of the floor round. The Journey grid carries the outcome on every',
       'cell and draws practice (muted numbers in a dashed frame, a P), skipped',
       '(a circled slash over the one-word reason) and not reached (a lone dot);',
       'its stats, summary, trend and "previous set" read performed sets only.',
       'So do completeWorkoutSession, client-rollups (and the delete path),',
       'clinical review facts, equipment usage and TUT, progress-utils, the next',
       'target weight, clinical-review-utils, Insights, the briefing, the Victory',
       'tiles, routine rows, the routine drawer, the machine dashboard, the',
       'leaderboard cron, the client-history model and the session dialog.',
       'The chart importer stamps importedOutcome.',
       '',
       'Behaviour change: a legacy weight-only log (no reps, no seconds) now draws',
       'as a skipped cell and no longer sets first / lowest / highest weight or',
       'votes in machineStats. It never counted toward volume.') }
  @{ File = '03-tracker.patch'; Sha256 = 'ed520b967eb5f41a4443329136b56f48923e5ec5af7f2f03923e2b2ce32626f9'
     Subject = 'feat(tracker): Practice and Skip on the floor; Finish confirms instead of blocking'
     Body = @(
       'Phase 3 of the floor round. The Now bar gains Practice and Skip beside',
       'rep quality; Skip opens the reason strip (pain asks "where?" once,',
       'optional) and moves focus on. End Session never blocks: it lists the',
       'machines begun without a count with Practice | Skipped (default) | Not',
       'reached. Finish stamps outcomes (the untouched placeholder becomes',
       'not_reached, derived from the per-machine clock), creates not-reached',
       'records for planned machines with no log, and writes bookingStartTime',
       'and startedLateByMinutes when a Mindbody booking matches. The clock',
       '(machineStartedAt) is persisted on the log and survives a refresh;',
       'machineEndedAt is written when a set completes or an outcome is picked.') }
  @{ File = '04-cue.patch'; Sha256 = 'db0b80000875dd1bf5d28877773b5426a1f8f64c891c82f370b9ebcb9964ce08'
     Subject = 'feat(cue): up / hold / down against the last performed set, in the Academy order'
     Body = @(
       'Phase 4 of the floor round. src/lib/progression-cue.ts reads the last',
       'performed set and says Up, Hold or Down about the load, in the order the',
       'Academy gives (form, then sequence, then rep count, then resistance):',
       'form marked needs-improvement -> hold; a timed static contraction ->',
       'hold; under 5 reps -> down one step; above the level window -> up one',
       'step; otherwise hold and add reps. A cue, not a prescription. Shown as a',
       'tappable chip in the Now bar and beside the history cells on the',
       'briefing rows. 8 tests.') }
  @{ File = '05-journal.patch'; Sha256 = 'f51b18d0c919450e591f459e954762be330d9a77542898bf0dd3339c09910816'
     Subject = 'feat(journal): session notes write to journalEntries; authors are the Auth uid'
     Body = @(
       'Phase 5 of the floor round. The pre-session (routine adjustment) note and',
       'the post-session note write to journalEntries (origin pre_session /',
       'post_session) instead of the legacy sessionNotes. The post-session note',
       'is written after the finish batch commits, on its own, so it can never',
       'take the session down; the tracker says so if only the note failed.',
       'Every journal author id is the Auth uid (the rule pins authorId to it;',
       'authTrainer.id differs on older accounts). The dead handleSaveFocus and',
       'its trainerFocuses state are removed from ClientProfileView.') }
  @{ File = '06-insights.patch'; Sha256 = 'e76ced720b00147880ed65cb239ecb63f42507a93758c5e21773ed66f85e8062'
     Subject = 'chore(insights): stop tracking which trainers are not writing notes'
     Body = @(
       'Phase 6 of the floor round. The per-trainer note rate, the "no notes at',
       'all" sentence and the studio note-rate nag are gone from Operations >',
       'Insights (the anti-blocker rule). The plain "sessions with a note" tile',
       'stays.') }
  @{ File = '07-docs.patch'; Sha256 = '8b016d2cf890eeafdd710064e4ecf71af49fc53c6fff7d3b65e233a648c5e224'
     Subject = 'docs(floor): the round document, ARCHITECTURE Draft 3 and the CLAUDE.md trap'
     Body = @(
       'Phase 7 of the floor round. docs/rounds/2026-09-12-floor-round.md; the',
       'eight late Sep 12 decisions applied to docs/ARCHITECTURE.md (Draft 3)',
       'and the round recorded there; the rounds index; the set-outcome trap in',
       'CLAUDE.md.') }
  @{ File = '08-kaizen.patch'; Sha256 = 'c63aebe2f59bf966d65046d9e5e4ad56e51f8d10a542f34d481a3bfbb5bc3571'
     Subject = 'fix(kaizen): the roster can be saved without a note'
     Body = @(
       'The one-tap add from a client header passes no note, and addToRoster',
       'built the entry with note: undefined. Firestore refuses a document that',
       'carries undefined anywhere ("Unsupported field value: undefined (found',
       'in document trainers/{uid})"), and the roster is written as one whole',
       'array, so the add failed every time with "Could not save your Kaizen',
       'Roster". updateRosterEntry had the same shape. Entries are now written',
       'without undefined keys; a patch key set to undefined clears the field.',
       'Two regression tests.') }
  @{ File = '09-auth-gate.patch'; Sha256 = 'b2d3c730576aad6a7073d0a8c5e5c185974872f251b4ab0c7b1340fbccef1815'
     Subject = 'fix(auth-gate): the 503 says which read failed and why'
     Body = @(
       '"Could not confirm your account just now" is what the Mindbody gate',
       'answers when it cannot read the caller trainer profile or the studio',
       'list through the Firestore REST API with the caller token. It now',
       'carries the reason - which read, the HTTP status and Firestore own',
       'one-line message - so a report from the floor says what the server log',
       'would. Never a document or a token. No behaviour change.') }
  @{ File = '10-ci.patch'; Sha256 = '27cbc371f4e41165436dcb40993de912ce8c57cf3c96c7ad1f68d00e7ab4754c'
     Subject = 'ci: generate firebase-applet-config.json before the typecheck and build'
     Body = @(
       'The file is gitignored; locally it comes from .env and on Render from',
       'the prebuild step of npm run build. CI runs tsc, vitest and vite build',
       'directly, so on a fresh clone it did not exist - src/firebase.ts and',
       'AdminMindbodyTab import it - and every run was two type errors over the',
       '18 baseline and could not build. CI had been red since its first run on',
       'Sep 12. With no Firebase variables in the environment the config script',
       'writes a dummy config, which is right: this job never talks to Firebase.',
       'The round document records the three fixes.') }
)

# ---------------------------------------------------------------- helpers
function Say([string]$text, [string]$color = 'Cyan') {
  Write-Host ''
  Write-Host ("== " + $text) -ForegroundColor $color
}

function Stop-Here([string]$why) {
  Write-Host ''
  Write-Host ("STOPPED: " + $why) -ForegroundColor Red
  try { Stop-Transcript | Out-Null } catch { }
  exit 1
}

# git writes progress to stderr, which PowerShell treats as an error stream;
# run it with the preference relaxed and judge by the exit code only.
function RunGit {
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try { & $GitExe @args 2>&1 | ForEach-Object { "$_" } } finally { $ErrorActionPreference = $prev }
}
function GitOk { RunGit @args | Out-Host; return ($LASTEXITCODE -eq 0) }
function GitText { $out = @(RunGit @args); return (($out -join "`n").Trim()) }
function Git-OrStop([string]$why) {
  $a = $args
  if (-not (GitOk @a)) { Stop-Here ("git " + ($a -join ' ') + " failed. " + $why) }
}

function Current-Branch { return (GitText rev-parse --abbrev-ref HEAD) }
function Head-Sha { return (GitText rev-parse HEAD) }
function Test-BranchExists([string]$name) { return ((GitText branch --list $name) -ne '') }
function Read-Marker([string]$path) { if (Test-Path -LiteralPath $path) { return (Get-Content -LiteralPath $path -Raw).Trim() } return '' }

function Require-CleanTree([string]$why) {
  $dirty = @(RunGit status --porcelain --untracked-files=no)
  if ($dirty.Count -gt 0) {
    $dirty | ForEach-Object { Write-Host ("  " + $_) -ForegroundColor Yellow }
    Stop-Here ("There are uncommitted changes to tracked files (above). Commit or stash them first. " + $why)
  }
}

function Require-Patches {
  Say "The patches in patches-floor\"
  if (-not (Test-Path -LiteralPath $PatchDir)) { Stop-Here "patches-floor\ is missing from the repo root." }
  foreach ($p in $Phases) {
    $path = Join-Path $PatchDir $p.File
    if (-not (Test-Path -LiteralPath $path)) { Stop-Here ("Missing: patches-floor\" + $p.File) }
    $hash = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLower()
    if ($hash -ne $p.Sha256) { Stop-Here ($p.File + " is not the file Claude made (SHA-256 differs). Was it edited or re-saved? Nothing was changed.") }
    if (Select-String -LiteralPath $path -Pattern 'GIT binary patch' -Quiet) { Stop-Here ($p.File + " contains a binary change, which can't ship as a patch. Nothing was changed.") }
    Write-Host ("  ok  " + $p.File) -ForegroundColor Green
  }
}

function Write-Utf8NoBom([string]$path, [string]$text) {
  $enc = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($path, $text, $enc)
}

# ---------------------------------------------------------------- line endings
# The patches are LF. What git has STORED for a file is LF when the file was
# added from Windows with core.autocrlf=true (this repo), but a file that was
# ever written into the index by an earlier patch, or committed elsewhere,
# can be stored CRLF - and git apply matches bytes, so a patch in the wrong
# ending "does not apply" even though the code is identical. So each patch
# is tried in four ways, most exact first, on the scratch index; the way that
# works is remembered and used for the real apply. "ignore whitespace" lets a
# CR at the end of a context line be ignored; the added lines then land LF,
# which is the normalised form autocrlf=true wants anyway.
$ApplyModes = @(
  @{ Eol = 'lf';   Extra = @();                       Label = '' },
  @{ Eol = 'crlf'; Extra = @();                       Label = 'as CRLF' },
  @{ Eol = 'lf';   Extra = @('--ignore-whitespace');  Label = 'ignoring line-ending whitespace' },
  @{ Eol = 'crlf'; Extra = @('--ignore-whitespace');  Label = 'as CRLF, ignoring whitespace' }
)
$Chosen = @{}

# The patch as delivered (LF) or converted to CRLF, in a temp file. UTF-8
# without a BOM: the docs patch carries non-ASCII characters, and git must
# see exactly the bytes the file has.
function PatchVariant([string]$file, [string]$eol) {
  $src = Join-Path $PatchDir $file
  if ($eol -eq 'lf') { return $src }
  $text = [System.IO.File]::ReadAllText($src, (New-Object System.Text.UTF8Encoding($false)))
  $text = $text -replace "`r`n", "`n"
  $text = $text -replace "`n", "`r`n"
  $tmp = Join-Path ([System.IO.Path]::GetTempPath()) ('ship-floor-' + $file + '.crlf')
  Write-Utf8NoBom $tmp $text
  return $tmp
}

function Remove-PatchVariants {
  foreach ($p in $Phases) {
    Remove-Item -LiteralPath (Join-Path ([System.IO.Path]::GetTempPath()) ('ship-floor-' + $p.File + '.crlf')) -ErrorAction SilentlyContinue
  }
}

# Every patch applied in order to a scratch copy of the index of $onto - a
# private index file, so neither the real index nor the working folder moves.
# Decides the apply mode of every patch (see $ApplyModes).
function Test-PatchesApply([string]$onto) {
  Say ("Do the patches apply to " + $onto + "? (tried on a scratch copy)")
  $scratch = Join-Path $RepoDir '.git\ship-floor-dryrun.index'
  Remove-Item -LiteralPath $scratch -ErrorAction SilentlyContinue
  $failedAt = ''
  $env:GIT_INDEX_FILE = $scratch
  try {
    if (-not (GitOk read-tree $onto)) { $failedAt = ('reading ' + $onto) }
    else {
      foreach ($p in $Phases) {
        $ok = $false
        foreach ($m in $ApplyModes) {
          $variant = PatchVariant $p.File $m.Eol
          $quiet = @(RunGit apply --cached --check --whitespace=nowarn @($m.Extra) $variant)
          if ($LASTEXITCODE -eq 0) {
            if (-not (GitOk apply --cached --whitespace=nowarn @($m.Extra) $variant)) { continue }
            $Chosen[$p.File] = $m
            $ok = $true
            $note = ''
            if ($m.Label) { $note = ('  <- ' + $m.Label) }
            Write-Host ("  applies  " + $p.File + $note) -ForegroundColor Green
            break
          }
        }
        if (-not $ok) {
          # Show why the exact form fails, for the log.
          RunGit apply --cached --check --whitespace=nowarn (PatchVariant $p.File 'lf') | Out-Host
          $failedAt = $p.File
          break
        }
      }
    }
  } finally {
    Remove-Item Env:GIT_INDEX_FILE -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $scratch -ErrorAction SilentlyContinue
  }
  if ($failedAt) { Remove-PatchVariants; Stop-Here ("The patches don't apply (stopped at " + $failedAt + ") - master has changed since they were made. Nothing was changed; send me logs\ship-floor.log.") }
}

function Find-Npx {
  $c = Get-Command npx -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $c) { Stop-Here "npx was not found on PATH. Open a terminal where 'npx --version' works." }
  return $c.Source
}
function Find-Npm {
  $c = Get-Command npm -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $c) { Stop-Here "npm was not found on PATH." }
  return $c.Source
}

# Lines like "src/x.ts(12,5): error TS2322: ..." from a full typecheck.
function Measure-Tsc {
  $npx = Find-Npx
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try { $out = @(& $npx tsc --noEmit 2>&1 | ForEach-Object { "$_" }) } finally { $ErrorActionPreference = $prev }
  return @($out | Where-Object { $_ -match 'error TS\d+' })
}


# ---------------------------------------------------------------- stages
function Do-Prepare {
  Say ("Repo: " + $RepoDir)
  if ((Current-Branch) -ne 'master') { Stop-Here "Run prepare on master (git checkout master). Nothing was changed." }
  Require-CleanTree "Nothing was changed."
  if (Test-BranchExists $ReleaseBranch) { Stop-Here ("A branch named " + $ReleaseBranch + " already exists. If it is from an earlier attempt: git checkout master; git branch -D " + $ReleaseBranch + " - then run prepare again. Nothing was changed.") }

  Require-Patches
  Test-PatchesApply 'HEAD'

  Say "Master's typecheck error count (the baseline verify compares against) - about a minute"
  $baseErrs = Measure-Tsc
  Set-Content -LiteralPath $BaselineFile -Value $baseErrs
  Write-Host ("  " + $baseErrs.Count + " typecheck errors on master (Claude's mirror had 18)")

  $startSha = Head-Sha
  Set-Content -LiteralPath $BaseFile -Value $startSha
  Say ("Branching " + $ReleaseBranch + " from master " + $startSha.Substring(0, 8))
  Git-OrStop "Nothing was committed." checkout -q -b $ReleaseBranch

  # Each patch goes into the index only (git apply --cached): it is applied to
  # exactly what git has stored, so this PC's line endings can't get in the
  # way. The working folder is written from the commits at the end.
  foreach ($p in $Phases) {
    $mode = $Chosen[$p.File]
    if (-not $mode) { $mode = $ApplyModes[0] }
    $applied = GitOk apply --cached --whitespace=nowarn @($mode.Extra) (PatchVariant $p.File $mode.Eol)
    $committed = $false
    if ($applied) {
      $tmp = Join-Path ([System.IO.Path]::GetTempPath()) 'ship-floor-msg.txt'
      $msg = (@($p.Subject, '') + $p.Body + @('') + $Trailer) -join "`n"
      Write-Utf8NoBom $tmp $msg
      $committed = GitOk commit -q -F $tmp
      Remove-Item -LiteralPath $tmp -ErrorAction SilentlyContinue
    }
    if (-not $committed) {
      # Nothing in the working folder was touched: put the index back, go back
      # to master, drop the branch.
      $undone = GitOk reset -q --mixed $startSha
      if ($undone) { $undone = GitOk checkout -q master }
      if ($undone) { $undone = GitOk branch -D -q $ReleaseBranch }
      if ($applied) { $reason = ("git commit failed for " + $p.File + ".") }
      else { $reason = ($p.File + " did not apply - master has moved since the patches were made.") }
      if (-not $undone) { Stop-Here ($reason + " The automatic undo didn't finish either (see above) - tell me before going on.") }
      Stop-Here ($reason + " Back on master; nothing was committed.")
    }
    Write-Host ("  committed  " + $p.Subject) -ForegroundColor Green
  }

  Remove-PatchVariants
  Say "Writing the release's files into the working folder"
  $changed = @(RunGit diff --name-only $startSha HEAD)
  if (-not (GitOk checkout HEAD -- @changed)) { Stop-Here "Couldn't write the release's files into the folder (git checkout failed). The commits are made; tell me before going on." }
  Require-CleanTree "The commits are made but the folder doesn't match them - tell me before going on."

  Say ("Commits on " + $ReleaseBranch)
  RunGit log --oneline ($startSha + '..HEAD') | Out-Host
  Say "prepare done. Next: ship-floor.ps1 verify" 'Green'
}

function Do-Verify {
  if ((Current-Branch) -ne $ReleaseBranch) { Stop-Here ("Run verify on " + $ReleaseBranch + " (prepare makes it). Nothing has been deployed.") }
  $base = Read-Marker $BaseFile
  if (-not $base) { Stop-Here "No record of where floor-round started - run prepare again (git checkout master; git branch -D floor-round first). Nothing has been deployed." }
  $count = [int](GitText rev-list --count ($base + '..HEAD'))
  if ($count -lt $Phases.Count) { Stop-Here ($ReleaseBranch + " holds " + $count + " of the " + $Phases.Count + " release commits - prepare didn't finish. Tell me before going on.") }
  if (-not (Test-Path -LiteralPath $BaselineFile)) { Stop-Here "No typecheck baseline - run prepare on master first." }
  Require-CleanTree "Nothing has been deployed."
  # Claude's checks ran in UTC; match them so a timezone-sensitive test means the same thing here.
  $env:TZ = 'UTC'

  Say "Typecheck - about a minute"
  $baseErrs = @(Get-Content -LiteralPath $BaselineFile | Where-Object { $_ -match 'error TS\d+' })
  $nowErrs = Measure-Tsc
  Write-Host ("  " + $nowErrs.Count + " typecheck errors (master had " + $baseErrs.Count + ")")
  # Which ones look new: compared without line numbers, since this release
  # moves lines around in files that already had errors.
  $pool = @{}
  foreach ($l in $baseErrs) { $k = ($l -replace '\(\d+,\d+\)', '').Trim(); if ($pool.ContainsKey($k)) { $pool[$k] = $pool[$k] + 1 } else { $pool[$k] = 1 } }
  $newErrs = @()
  foreach ($l in $nowErrs) {
    $k = ($l -replace '\(\d+,\d+\)', '').Trim()
    if ($pool.ContainsKey($k) -and $pool[$k] -gt 0) { $pool[$k] = $pool[$k] - 1 } else { $newErrs += $l }
  }
  if ($newErrs.Count -gt 0) {
    Say "Typecheck errors that aren't on master:" 'Yellow'
    $newErrs | ForEach-Object { Write-Host ("  " + $_) -ForegroundColor Yellow }
  }
  if ($nowErrs.Count -gt $baseErrs.Count) { Stop-Here ("The typecheck found " + ($nowErrs.Count - $baseErrs.Count) + " more error(s) than master. Send me logs\ship-floor.log. Nothing has been deployed.") }
  if ($newErrs.Count -gt 0) { Write-Host "  The count didn't go up, so carrying on - but send me logs\ship-floor.log afterwards." -ForegroundColor Yellow }

  $npx = Find-Npx
  $npm = Find-Npm
  if ($SkipTests) { Say "Tests SKIPPED (-SkipTests)" 'Yellow' }
  else {
    Say "Tests (Claude's mirror: 87 files, 1,813 tests)"
    $prev = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
    try { & $npx vitest run src 2>&1 | ForEach-Object { "$_" } | Out-Host } finally { $ErrorActionPreference = $prev }
    if ($LASTEXITCODE -ne 0) { Stop-Here "Tests failed - nothing has been deployed. Send me logs\ship-floor.log." }
  }

  Say "Production build of the front end"
  $prev = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
  try { & $npx vite build 2>&1 | ForEach-Object { "$_" } | Out-Host } finally { $ErrorActionPreference = $prev }
  if ($LASTEXITCODE -ne 0) { Stop-Here "The build failed - nothing has been deployed." }

  Say "The Render cron bundles (the leaderboard job changed in this round)"
  $prev = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
  try { & $npm run build:backend 2>&1 | ForEach-Object { "$_" } | Out-Host } finally { $ErrorActionPreference = $prev }
  if ($LASTEXITCODE -ne 0) { Stop-Here "The cron bundles failed to build - nothing has been deployed." }

  Set-Content -LiteralPath $CheckedFile -Value (Head-Sha)
  Say "verify done. Next: ship-floor.ps1 golive" 'Green'
}

function Do-GoLive {
  $cur = Current-Branch
  $checked = Read-Marker $CheckedFile

  # A push that failed after the merge: master already holds the release.
  if ($cur -eq 'master' -and $checked -and (Test-BranchExists $ReleaseBranch)) {
    if (GitOk merge-base --is-ancestor $checked master) {
      Say "master already holds the checked release - pushing again"
      Git-OrStop "Nothing was pushed." push origin master
      Say "Pushed. Render builds and deploys master now (a few minutes)." 'Green'
      return
    }
  }

  if ($cur -ne $ReleaseBranch) { Stop-Here ("Run golive on " + $ReleaseBranch + ". Nothing was pushed.") }
  if (-not $checked) { Stop-Here "verify hasn't passed on this branch - run verify first. Nothing was pushed." }
  if ($checked -ne (Head-Sha)) { Stop-Here "The branch has moved since verify passed - run verify again. Nothing was pushed." }
  Require-CleanTree "Nothing was pushed."

  Say "Comparing with GitHub"
  Git-OrStop "Nothing was pushed." fetch origin
  if (-not (GitOk merge-base --is-ancestor origin/master master)) {
    Stop-Here "GitHub's master has commits your master doesn't. Pull them first (git checkout master; git pull), then run prepare again. Nothing was pushed."
  }

  Say ("Fast-forwarding master to " + $ReleaseBranch)
  Git-OrStop "Nothing was pushed." checkout -q master
  if (-not (GitOk merge --ff-only $ReleaseBranch)) {
    RunGit checkout -q $ReleaseBranch | Out-Null
    Stop-Here "master could not be fast-forwarded (it has commits the branch doesn't). Back on floor-round; nothing was pushed."
  }

  Say "Pushing master (Render deploys it)"
  if (-not (GitOk push origin master)) { Stop-Here "The push failed. master already holds the release locally - fix the connection and run golive again to push." }
  RunGit log --oneline -1 | Out-Host
  Say "Pushed. Render builds and deploys master now (a few minutes). Then: the iPad walk in docs/rounds/2026-09-12-floor-round.md." 'Green'
}

switch ($Stage) {
  'prepare' { Do-Prepare }
  'verify'  { Do-Verify }
  'golive'  { Do-GoLive }
}

try { Stop-Transcript | Out-Null } catch { }
