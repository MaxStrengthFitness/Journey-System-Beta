<#
.SYNOPSIS
  Ships the SECOND HALF of the tracker round (Sep 13 2026). Patches 01-08
  went live as ad38d54; this applies 09-19 on top of that master - resume from the tab after a crash, the session bar, the
  Now bar, drag-and-drop Today's order, the machine sheet fix, the landscape
  side panel, time on machine, the post-session screen, the machine sheet
  order, the Hub markers and loading mark, renewals history, check-in
  search, the directory, the profile header, the briefing, and the docs.

.DESCRIPTION
  Three stages, run in order from the repo root:

    powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-tracker2.ps1 prepare
    powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-tracker2.ps1 verify
    powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-tracker2.ps1 golive

  prepare  - on master with a clean tree: checks the eleven patches (09-19) in
             patches-tracker\ are the ones Claude made (SHA-256), proves they
             apply to what git has stored (a scratch index - nothing is
             touched), records master's typecheck error count, then makes
             the branch "tracker-round" with one commit per patch and writes
             the files into the working folder.
  verify   - on tracker-round: typecheck (the error count must not go up against
             master's), the tests, and the production build (front end plus
             the server bundle Render runs). Records the commit it checked.
  golive   - fast-forwards master to the checked commit and pushes. Render
             deploys master. No rules, indexes or Cloud Functions change.

  Every step that changes anything says so, and every failure says what was
  and was not done. Output also goes to logs\ship-tracker2.log.

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
Start-Transcript -Path (Join-Path $LogDir 'ship-tracker2.log') -Append | Out-Null

$PatchDir = Join-Path $RepoDir 'patches-tracker'
$ReleaseBranch = 'tracker-round-2'
$BaseFile = Join-Path $RepoDir '.git\ship-tracker2.base'
$BaselineFile = Join-Path $RepoDir '.git\ship-tracker2.baseline'
$CheckedFile = Join-Path $RepoDir '.git\ship-tracker2.checked'

$Trailer = @(
  'Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>',
  'Claude-Session: https://claude.ai/code/session_014M1fWJf84iT1WGUpUQL7UR'
)

# The eleven patches (09-19), in order. The hash is of the file Claude produced; a patch that has
# been edited or re-saved will not match and the script stops.
$Phases = @(
  @{ File = '09-end-session-submits-the-session-the-scre.patch'; Sha256 = '4a07b2a91eb96b17f032cd049c2370a3608553f8c5b37396360d729010bc6ae1'
     Subject = 'feat(post-session): End Session submits the session; the screen after it reads today, the journey and what''s next - no Finalize button'
     Body = @('The audit''s verdict on the post-session screen: the trainer is walking the',
       'client out, so the session must be saved when End Session is confirmed and',
       'nothing added afterwards may need another save button; today''s session',
       'must be far clearer; lifetime stats go to the bottom; and the data should',
       'let the trainer say "your strength is up".',
       '',
       'The tracker''s commitEndSession() now runs the one finish batch at Confirm',
       '(completeWorkoutSession is increments, so it runs exactly once), captures a',
       'snapshot, and shows the post-session screen from it. The Feel toggle writes',
       'sessions.clientFeel the moment it is tapped; the closing note files to the',
       'journal when the trainer leaves (Back to Hub, or the tab going hidden).',
       'The dialog''s button is "Finish session"; its note is the wrap-up note.',
       '',
       'src/lib/post-session.ts (9 tests): todayLines (today vs the last performed',
       'set per machine, stars, first-time, practice/skipped/not reached),',
       'todayHeadline, strengthJourney + journeySentence ("loads up 21% since Jul 1',
       'across 4 machines; strongest trend: lower body" - silent below 3 sessions',
       'on 3 machines), nextBookingFor + formatNextBooking from the schedules',
       'stream already on the screen.',
       '',
       'VictoryHUDScreen rebuilt in that order: Today (per-machine lines + where',
       'the work went), The journey, Next (booked or "book before they leave",',
       'Feel, closing note with a Low/Medium/High row, check-in, renewal), lifetime',
       'small at the bottom, Back to Hub. Theme-safe classes so light mode works.',
       'BentoStatTile, StickyCTA and EliteProgressBar had no other users; deleted.') },
  @{ File = '10-notes-first-the-set-up-guide-opens-on-a.patch'; Sha256 = '62968b7a6181f74ea89c978bb67908300fde55181df145a57d487bda72d09491'
     Subject = 'feat(machine-sheet): notes first, the set-up guide opens on a first-time machine, one tap target in the grid'
     Body = @('The sheet''s primary job per the audit is adding a note about this machine',
       'for this client; settings change far less often. Order is now alerts,',
       'notes, settings, guide, history. When the client has never performed the',
       'machine, a "First time on this machine" banner appears and the catalog''s',
       'set-up guide opens above the dials, so the first set-up comes from the',
       'studio''s notes, not memory (MachineSheet firstTime, fed by the tracker from',
       'the grid''s history).',
       '',
       'In the Active Session the note glyph on a machine cell is now a mark, not',
       'a second button: the name already opens the same sheet, and "hard to tell',
       'if I''m tapping the note or the machine" was the hesitation.') },
  @{ File = '11-audit-sheets-2-5-in-the-tracker-round-do.patch'; Sha256 = '342c82d95a21cc82951fbeb5ac3501dea32706ee2415b7a9555cdb38c33e4bbd'
     Subject = 'docs: audit sheets 2-5 in the tracker round doc; the once-only End Session trap'
     Body = @() },
  @{ File = '12-land-on-now-markers-instead-of-training.patch'; Sha256 = '250d4e4f05eea9d1a1c67d89212cbb055503b1e2c6611ab5e3843d963909af59'
     Subject = 'feat(hub): land on now, markers instead of "Training Session", and the brand loading mark'
     Body = @('The Hub now scrolls once, on open and on each day change, so the Now line',
       'sits a third of the way down the timeline - the next session is under it',
       'instead of at the bottom of a scroll.',
       '',
       'Cards drop the redundant "Training Session" line and show markers from',
       'src/lib/hub-markers.ts (6 tests), computed from data the Hub already holds:',
       'Consultation, First session, Session 25/50/100..., Birthday today/tomorrow/in',
       'N days, Back after N wk (21+ days since the last session), Away from / until',
       '(Vacation and Snowbird events), an upcoming Medical event by name, and',
       'Renewal due. A service that is not the plain session (InBody scan) still',
       'shows.',
       '',
       'LoadingMark / LoadingArea (components/LoadingMark.tsx): the blue, orange',
       'and grey M ^ X squares doing a wave, in theme colours, with a reduced-',
       'motion fallback. Used for the lazy-view wait and "Opening the chart..." on',
       'the client profile, so a tap on a card no longer looks broken.') },
  @{ File = '13-the-conversation-dialog-shows-what-was-s.patch'; Sha256 = '806c0c228ad8b0bbbd1577deacc69a2a59d24970b532d72ea73e9ff8fa091733'
     Subject = 'feat(renewals): the conversation dialog shows what was said so far, and is reachable after every session'
     Body = @('"There''s not really a good way to open it" and "sometimes we want to see',
       'what past trainers said so we know how to approach it". TouchHistory.tsx is',
       'the one conversation list (the renewal card and the leaders'' brief drew it',
       'twice); it now sits above the form in LogConversationDialog, so a trainer',
       'reads the last three touches before they talk. The post-session screen',
       'shows "Renewal conversation" whenever a package is on file - orange with the',
       'prompt when a conversation is due, quiet otherwise.') },
  @{ File = '14-find-an-area-by-keyword-say-who-filed-th.patch'; Sha256 = '72eb38e81d238c9b579e15eedccf9f6b44e1ca929c0511d405e35fecce4da44d'
     Subject = 'feat(check-in): find an area by keyword; say who filed the last check-in and when'
     Body = @('"There are so many categories it''s hard to find where to input - I should',
       'be able to search ''sleep'' and see every area related to it." The in-session',
       'and Journal check-in panel gets a search box over the twelve areas',
       '(src/features/subjective-report/search.ts, 2 tests): titles, the',
       'statements themselves, and the words a trainer actually says - meals, knee,',
       'water, work. The first match opens.',
       '',
       '"I want to see when it was updated last and by who": PreviousAssessmentRef',
       'now carries trainerName and enteredBy; the panel header reads "Last',
       'check-in Aug 2 by Christian" and the dialog''s "compared with" line names',
       'the author.',
       '',
       'FORD, client mode and the living-record model are the next round (the',
       'check-in round in ARCHITECTURE ?3.8), not this one.') },
  @{ File = '15-audit-sheets-6-8-in-the-tracker-round-do.patch'; Sha256 = 'dc6831d45ea1eff7a50dec769a803d55bd8c95fe88da216e60f6dcb25dec0d45'
     Subject = 'docs: audit sheets 6-8 in the tracker round doc; the loading-mark and hub-marker traps'
     Body = @() },
  @{ File = '16-the-row-reads-the-contract-the-list-show.patch'; Sha256 = '921a89378113d7e5e424b821d7a94dda5fd4c0447ebc95aebf34848ec5561d34'
     Subject = 'feat(directory): the row reads the contract, the list shows the recent forty, the actions column is gone'
     Body = @('Membership, sessions remaining and next session now come from the renewal',
       'snapshot the nightly job computes from the Mindbody contract',
       '(src/lib/directory-row.ts, 3 tests): "12-Month . paid in full", "38 left"',
       '(amber at 3 or fewer, "Auto-renews" for a monthly package), "Sep 16" - and',
       '"No package on file" / "Unknown" when there is none, instead of three',
       'stale fields and a hand-edited +/- counter.',
       '',
       'With an empty search box the table renders the forty most recent clients',
       'and says so; a name search reaches everyone. The per-row actions menu is',
       'gone (tapping the row opens the profile, where Start Session lives); the',
       'open-session path is a header button next to Add Client.') },
  @{ File = '17-completed-sessions-without-the-of-96-eve.patch'; Sha256 = '145fc8977366b314b5d055151b1c934d44687635c7e8ac3d47b79085bf6af9ce'
     Subject = 'feat(profile): completed sessions without the "of 96"; every trainer on a tap; tabs that look like tabs; Journey shows all machines in batches of 50'
     Body = @('The package tile no longer shows "52 / 96" or its meter - the 96 came from',
       'a Mindbody pass total nobody could place. It shows the completed count and,',
       'underneath, what is left on the contract from the renewal snapshot. Next',
       'session always says how many are booked. Tapping "Top trainer" opens the',
       'full list - every trainer who has trained the client, sessions and share',
       '(tallyRows in lib/client-rollups.ts, from the trainerTally already on the',
       'client). The tab row is a tray with the active tab lifted out as a pill.',
       'The Journey tab lists all machines by default (the "performed" filter',
       'stays) and history loads fifty sessions at a time.') },
  @{ File = '18--before-you-start-as-one-block-then-the.patch'; Sha256 = '89190b4eec20cd3d8adbedb66f5c2accb638bd84d334ee4f8b1e5189989d4c32'
     Subject = 'feat(briefing): "Before you start" as one block, then the routine, then the arrival note'
     Body = @('The briefing reads in AJ''s order now. The hero is the name, the last',
       'session and the goal in one line. Then one block, "Before you start . N":',
       'clinical flags, critical journal entries, the same upcoming-event markers',
       'the Hub shows (a break, a surgery, a birthday, session 100), the renewal',
       'line, and each active focus as one line - or "Nothing flagged - clear to',
       'go" when there is nothing. Then today''s routine and the sequence. Then',
       '"What they told you on the way in" with the arrival note, which files as',
       '"On arrival: ..." (it read "Routine adjusted for today" even when nothing',
       'was adjusted; that prefix now applies only when the sequence changed).',
       'The "scheduled vs last performed" pair is gone - the hero and the rows',
       'already say it; RoutineCompareCard had no other user.') },
  @{ File = '19-audit-sheets-9-11-in-the-tracker-round-d.patch'; Sha256 = '89c1f533d18001e2db361d9714fd485204e992961d50be555f9daa722e37b93d'
     Subject = 'docs: audit sheets 9-11 in the tracker round doc; the package-facts trap'
     Body = @() }
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
  Say "The patches in patches-tracker\"
  if (-not (Test-Path -LiteralPath $PatchDir)) { Stop-Here "patches-tracker\ is missing from the repo root." }
  foreach ($p in $Phases) {
    $path = Join-Path $PatchDir $p.File
    if (-not (Test-Path -LiteralPath $path)) { Stop-Here ("Missing: patches-tracker\" + $p.File) }
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
  $tmp = Join-Path ([System.IO.Path]::GetTempPath()) ('ship-tracker2-' + $file + '.crlf')
  Write-Utf8NoBom $tmp $text
  return $tmp
}

function Remove-PatchVariants {
  foreach ($p in $Phases) {
    Remove-Item -LiteralPath (Join-Path ([System.IO.Path]::GetTempPath()) ('ship-tracker2-' + $p.File + '.crlf')) -ErrorAction SilentlyContinue
  }
}

# Every patch applied in order to a scratch copy of the index of $onto - a
# private index file, so neither the real index nor the working folder moves.
# Decides the apply mode of every patch (see $ApplyModes).
function Test-PatchesApply([string]$onto) {
  Say ("Do the patches apply to " + $onto + "? (tried on a scratch copy)")
  $scratch = Join-Path $RepoDir '.git\ship-tracker2-dryrun.index'
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
  if ($failedAt) { Remove-PatchVariants; Stop-Here ("The patches don't apply (stopped at " + $failedAt + ") - master has changed since they were made. Nothing was changed; send me logs\ship-tracker2.log.") }
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
      $tmp = Join-Path ([System.IO.Path]::GetTempPath()) 'ship-tracker2-msg.txt'
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
  # reset --hard writes every committed file; a file the release DELETES is
  # gone from the index but still on disk, so it is removed by name after.
  # (git checkout HEAD -- <paths> refuses a path that no longer exists, which
  # is what left the folder stale on the Sep 13 run.)
  if (-not (GitOk reset -q --hard HEAD)) { Stop-Here "Couldn't write the release's files into the folder (git reset failed). The commits are made; tell me before going on." }
  $deleted = @(RunGit diff --name-only --diff-filter=D $startSha HEAD)
  foreach ($d in $deleted) {
    $full = Join-Path $RepoDir ($d -replace '/', '\')
    if (Test-Path -LiteralPath $full) { Remove-Item -LiteralPath $full -Force }
  }
  Require-CleanTree "The commits are made but the folder doesn't match them - tell me before going on."

  Say ("Commits on " + $ReleaseBranch)
  RunGit log --oneline ($startSha + '..HEAD') | Out-Host
  Say "prepare done. Next: ship-tracker2.ps1 verify" 'Green'
}

function Do-Verify {
  if ((Current-Branch) -ne $ReleaseBranch) { Stop-Here ("Run verify on " + $ReleaseBranch + " (prepare makes it). Nothing has been deployed.") }
  $base = Read-Marker $BaseFile
  if (-not $base) { Stop-Here "No record of where tracker-round started - run prepare again (git checkout master; git branch -D tracker-round first). Nothing has been deployed." }
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
  if ($nowErrs.Count -gt $baseErrs.Count) { Stop-Here ("The typecheck found " + ($nowErrs.Count - $baseErrs.Count) + " more error(s) than master. Send me logs\ship-tracker2.log. Nothing has been deployed.") }
  if ($newErrs.Count -gt 0) { Write-Host "  The count didn't go up, so carrying on - but send me logs\ship-tracker2.log afterwards." -ForegroundColor Yellow }

  $npx = Find-Npx
  $npm = Find-Npm
  if ($SkipTests) { Say "Tests SKIPPED (-SkipTests)" 'Yellow' }
  else {
    Say "Tests (Claude's mirror: 106 files, 2,015 tests)"
    $prev = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
    try { & $npx vitest run src 2>&1 | ForEach-Object { "$_" } | Out-Host } finally { $ErrorActionPreference = $prev }
    if ($LASTEXITCODE -ne 0) { Stop-Here "Tests failed - nothing has been deployed. Send me logs\ship-tracker2.log." }
  }

  Say "Production build - the front end and the server bundle Render runs (npm run build)"
  $prev = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
  try { & $npm run build 2>&1 | ForEach-Object { "$_" } | Out-Host } finally { $ErrorActionPreference = $prev }
  if ($LASTEXITCODE -ne 0) { Stop-Here "The build failed - nothing has been deployed." }

  Set-Content -LiteralPath $CheckedFile -Value (Head-Sha)
  Say "verify done. Next: ship-tracker2.ps1 golive" 'Green'
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
    Stop-Here "master could not be fast-forwarded (it has commits the branch doesn't). Back on tracker-round; nothing was pushed."
  }

  Say "Pushing master (Render deploys it)"
  if (-not (GitOk push origin master)) { Stop-Here "The push failed. master already holds the release locally - fix the connection and run golive again to push." }
  RunGit log --oneline -1 | Out-Host
  Say "Pushed. Render builds and deploys master now (a few minutes). Then: on the iPad, start a session, close Safari, reopen, and tap the Session tab - it should land you back on the machine." 'Green'
}

switch ($Stage) {
  'prepare' { Do-Prepare }
  'verify'  { Do-Verify }
  'golive'  { Do-GoLive }
}

try { Stop-Transcript | Out-Null } catch { }
