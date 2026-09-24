<#
.SYNOPSIS
  Ships the FIX ROUND (Sep 13 2026, evening): AJ's iPad feedback on the live
  tracker round. Eight patches in patches-fix\ - Hub markers, the Journey
  loading mark, the profile header tiles, the post-session screen, the
  briefing (address underlines + Hold chip), the centred machine sheet, the
  "Assessment" labels, and the docs.
.DESCRIPTION
  Three stages, run in order from the repo root:
    powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-fixes.ps1 prepare
    powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-fixes.ps1 verify
    powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-fixes.ps1 golive
  prepare  - on master with a clean tree: checks the eight patches in
             patches-fix\ are the ones Claude made (SHA-256), proves they
             apply to what git has stored (a scratch index - nothing is
             touched), records master's typecheck error count, then makes
             the branch "fix-round" with one commit per patch and writes
             the files into the working folder.
  verify   - on fix-round: typecheck (the error count must not go up against
             master's), the tests, and the production build (front end plus
             the server bundle Render runs). Records the commit it checked.
  golive   - fast-forwards master to the checked commit and pushes. Render
             deploys master. No rules, indexes or Cloud Functions change.
  Every step that changes anything says so, and every failure says what was
  and was not done. Output also goes to logs\ship-fixes.log.
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
Start-Transcript -Path (Join-Path $LogDir 'ship-fixes.log') -Append | Out-Null

$PatchDir = Join-Path $RepoDir 'patches-fix'
$ReleaseBranch = 'fix-round'
$BaseFile = Join-Path $RepoDir '.git\ship-fixes.base'
$BaselineFile = Join-Path $RepoDir '.git\ship-fixes.baseline'
$CheckedFile = Join-Path $RepoDir '.git\ship-fixes.checked'

$Trailer = @(
  'Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>',
  'Claude-Session: https://claude.ai/code/session_012A3PK7idGZup6N5xbD4VPs'
)

# The eight patches (01-08), in order. The hash is of the file Claude produced; a patch that has
# been edited or re-saved will not match and the script stops.
$Phases = @(
  @{ File = '01-hub-markers-time.patch'; Sha256 = '680022a818e2b9a45e58ea563d7018e405a3227ef2d75670aa09e9a8176a1754'
     Subject = 'fix(hub): markers no longer cover the session time'
     Body = @('On the iPad the marker chips (Session 25, Birthday tomorrow, Away from',
       'Sep 20) sat on top of the time on a 30-minute card, so the time could not',
       'be read. The card is exactly as tall as its slot, and inside a flex column',
       'an item with overflow: hidden may shrink to nothing - the time line had',
       '`truncate`, which is overflow: hidden, so it was the one line the browser',
       'squeezed to 0px while the chips (which wrapped onto two or three lines)',
       'kept their height. Rendered in a harness, the time measured 0px tall.',
       '',
       'Now the name and time lines are `shrink-0` and keep their own space, and',
       'the marker line is the one that yields: a single row of small-caps chips',
       'that truncate rather than wrap, at most two - `visibleMarkers()` in',
       'lib/hub-markers.ts keeps the most important and folds the rest into "+N"',
       '(3 tests), with the full list in the card''s tooltip. The card''s vertical',
       'padding is a hair tighter so name, time and one chip row all fit a',
       '30-minute slot at 768 and 1024 wide.') },
  @{ File = '02-journey-loading-mark.patch'; Sha256 = 'c775b42ad0ccaed97d06d4688de209cba26fb209a259f29652c4319a6042e15c'
     Subject = 'fix(profile): the loading mark while Recent Journey loads'
     Body = @('On the Journey tab the grid opened as a frame of empty cells until the',
       'first fifty sessions and their sets arrived, and "Older" gave nothing but',
       'a dimmed button while the next batch loaded - on the studio floor that',
       'reads as "the journey is empty" or "the tap did nothing".',
       '',
       'ClientProfileView now keeps an isLoadingSessions flag that is on from the',
       'first sessions query until the set logs are merged in (the sessions land a',
       'moment before their sets, and cells without sets look empty too), and',
       'passes it to RecentJourneyView as `loading`. The view shows the brand',
       'LoadingArea in the grid''s place on the first load and, while "Older" is',
       'fetching, floats a small LoadingMark card over the columns already drawn',
       'so they stay put. One loading mark, as CLAUDE.md asks - no new spinner.') },
  @{ File = '03-profile-header-tiles.patch'; Sha256 = '160451334a858ccb4782d001c5061ad3eae9c0cedd2338963d448bb8077cb257'
     Subject = 'fix(profile): "Tomorrow" reads in full on the Next session tile; the trainer list no longer covers the tiles'
     Body = @('Two things AJ saw on the iPad in portrait. The Next session tile showed',
       '"Tomorro...": at 768 wide each tile is about 180px, and the icon, the day',
       'plus time, and the "2 booked" chip all shared one line, so the text was',
       'what gave way. Nothing on a tile is truncated now - the headline is the day',
       'and the time on a line of their own, joined with a dot so a long one',
       '("Wednesday - 12:30 PM") wraps between them; the date and the booked chip',
       'sit underneath; the icon is gone, the label already says what the tile is.',
       'The words come from features/client-profile/next-session-tile.ts (3 tests).',
       '',
       'Tapping Top trainer opened the "Trained by" list on top of the four tiles.',
       'The list was placed in `[grid-area:strip]` - the same named grid area as',
       'the tile row - and two items in one area are drawn over each other. It is',
       'now `col-span-full` with no named area, so the grid gives it a fresh row',
       'under the tiles and everything below moves down, with the Close control',
       'where it was.') },
  @{ File = '04-post-session-screen.patch'; Sha256 = '0aec6bbce215b688ffe78b39fc1a55df0cfef1ee0edbe2cec8c2985755441a19'
     Subject = 'fix(tracker): the post-session screen stays up after Finish instead of the briefing'
     Body = @('After "Finish session" the trainer landed on the pre-session briefing for',
       'the client they had just trained, not the post-session screen. The cause',
       'was render order in WorkoutTrackerView. Finish writes the session as',
       'Completed and turns post-session mode on; a beat later the client''s',
       'sessions stream reports that nothing is In-Progress and, as it always has',
       'when nothing is running, turns pre-session mode on. Both flags were now',
       'true with no current session, and the briefing was the first `if` in',
       'render, so it won.',
       '',
       'The choice is now one pure rule, lib/tracker-screen.ts (6 tests): the',
       'post-session screen outranks everything while its snapshot exists, then',
       '"nothing" with no client, then the briefing, then the tracker. Render',
       'reads the rule and draws the post-session screen first. The screen stays',
       'until Back to Hub, which clears the snapshot and the mode as before.') },
  @{ File = '05-briefing-detect-hold.patch'; Sha256 = '64827c4292692b3688f7465f4cc8f918209baaf056cec909f5358f6c6161af16'
     Subject = 'fix(briefing): no address underlines on "54 LB 7 REPS"; the Hold chip is gone from the routine rows'
     Body = @('iPad Safari''s data detector read the weight-and-reps cells on a routine',
       'row (Compound Row: "54 LB 7 REPS") as an address or a phone number and',
       'drew dotted underlines under them. index.html now carries',
       '<meta name="format-detection" content="telephone=no, date=no, address=no,',
       'email=no">, so nothing is a link unless the app draws it as one.',
       '',
       'The "Hold - add reps" / "Hold - TSC" pill on each briefing row is removed.',
       'It was the progression cue chip in the shared SequenceMachineRow; the',
       'chip, the `cue` field on MachineHistoryEntry, the briefing''s computation',
       'of it and the .rb-row__cue styles are deleted, not commented out. The',
       'weight and reps cells, the drag handle, the note/settings control and the',
       'trash icon stay. The cue itself (lib/progression-cue.ts) still lives in',
       'the Active Session''s Now bar, where AJ kept it.') },
  @{ File = '06-machine-sheet-centred.patch'; Sha256 = '3badb3211150d5a1b554595ed6be687db572581a46692161efa213ef8fe90129'
     Subject = 'fix(machine-sheet): centred in the viewport, in both orientations'
     Body = @('The machine pop-up in the Active Session sat at the bottom of the screen.',
       'That was not an accident of layout: MachineSheet overrode the dialog''s',
       'centred geometry with `top-auto bottom-0 translate-y-0` to be a bottom',
       'sheet, on the argument that thumbs on a two-handed iPad live in the',
       'bottom third. On the floor it read as pushed down, and AJ asked for it',
       'centred.',
       '',
       'The overrides are gone, so the Dialog primitive''s own top-1/2 / left-1/2',
       '/ translate(-50%, -50%) centres it; the sheet is a full rounded card with',
       'a symmetrical shadow, the grab bar (which says "this slides up from the',
       'bottom") is removed, and the body no longer pads for the bottom safe',
       'area. It keeps the 88dvh cap so the grid shows around it, and the body',
       'scrolls when the content is taller - the flex: none rule on its cards',
       'from the tracker round still holds. Measured in a harness at 768x1024',
       'and 1024x768 with three and eight cards: equal margins top and bottom,',
       'left and right, cards at full height, the body scrolling when it must.') },
  @{ File = '07-assessment-labels.patch'; Sha256 = '979472e6fc73899ac4bb59981f1cc968a893341155774d55419d751fe2fb426f'
     Subject = 'feat(assessment): "Check-in" and "90-Day Check-in" read "Assessment" everywhere a trainer sees them'
     Body = @('AJ''s decision: the periodic 90-day check-in and the subjective check-in',
       '(sleep, stress, protein) are one perpetual Assessment - not a test, not',
       'scored, not on an interval. The data-model merge (one living record with',
       'snapshots, FORD, client mode, a note per update) is the next round; this',
       'is the naming pass, labels only.',
       '',
       'Renamed: the briefing''s "90-day check-in" button, the session bar''s',
       'button and its titles, the in-session panel, the post-session "Quick',
       'check-in question", the Journal panel and its tab ("Assessment"), the',
       'quick dialog''s title and Save button, "Last check-in Aug 2 by Christian"',
       '-> "Last assessment ...", the panel''s Finish -> "Save assessment", the',
       'progress-report step and its section headings (the report''s own name is',
       'untouched), the archive rows and their tooltip (which no longer quotes a',
       '"/ 96" score), the renewal brief and flag sentences, the session detail',
       'panel, the Hub''s flag label, and the clinical-review hints. "90-day" and',
       '"every 90 days" are gone from the copy.',
       '',
       'Not renamed, on purpose: code identifiers, Firestore fields, file names,',
       'and the journal''s focus "check-ins" (an entry logged against a trainer',
       'focus - a different thing with the same word). The two renewal tests that',
       'quote the sentences are updated.') },
  @{ File = '08-docs-fix-round.patch'; Sha256 = '0d377cbe74a706dec31e90034fd4ef82b4ac1454706ff77f66fa1e4f5a046660'
     Subject = 'docs: the fix round; the Assessment round is next on the roadmap'
     Body = @('docs/rounds/2026-09-13-fix-round.md records what AJ reported from the',
       'iPad after the tracker round, the root cause behind each fix, and what',
       'is deferred to the Assessment round (the model merge, FORD, client mode,',
       'a note per update). ROADMAP.md names that round as the next item and',
       'marks the floor round done. CLAUDE.md gains four traps from this round:',
       '`truncate` is overflow: hidden and shrinks to nothing in a fixed-height',
       'flex column; two grid items in one named area overlap; the tracker''s',
       'three screens have a tested order; and "Assessment" is a label, the code',
       'still says check-in.') }
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
  Say "The patches in patches-fix\"
  if (-not (Test-Path -LiteralPath $PatchDir)) { Stop-Here "patches-fix\ is missing from the repo root." }
  foreach ($p in $Phases) {
    $path = Join-Path $PatchDir $p.File
    if (-not (Test-Path -LiteralPath $path)) { Stop-Here ("Missing: patches-fix\" + $p.File) }
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
  $tmp = Join-Path ([System.IO.Path]::GetTempPath()) ('ship-fixes-' + $file + '.crlf')
  Write-Utf8NoBom $tmp $text
  return $tmp
}

function Remove-PatchVariants {
  foreach ($p in $Phases) {
    Remove-Item -LiteralPath (Join-Path ([System.IO.Path]::GetTempPath()) ('ship-fixes-' + $p.File + '.crlf')) -ErrorAction SilentlyContinue
  }
}

# Every patch applied in order to a scratch copy of the index of $onto - a
# private index file, so neither the real index nor the working folder moves.
# Decides the apply mode of every patch (see $ApplyModes).
function Test-PatchesApply([string]$onto) {
  Say ("Do the patches apply to " + $onto + "? (tried on a scratch copy)")
  $scratch = Join-Path $RepoDir '.git\ship-fixes-dryrun.index'
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
  if ($failedAt) { Remove-PatchVariants; Stop-Here ("The patches don't apply (stopped at " + $failedAt + ") - master has changed since they were made. Nothing was changed; send me logs\ship-fixes.log.") }
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
      $tmp = Join-Path ([System.IO.Path]::GetTempPath()) 'ship-fixes-msg.txt'
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
  Say "prepare done. Next: ship-fixes.ps1 verify" 'Green'
}

function Do-Verify {
  if ((Current-Branch) -ne $ReleaseBranch) { Stop-Here ("Run verify on " + $ReleaseBranch + " (prepare makes it). Nothing has been deployed.") }
  $base = Read-Marker $BaseFile
  if (-not $base) { Stop-Here "No record of where fix-round started - run prepare again (git checkout master; git branch -D fix-round first). Nothing has been deployed." }
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
  if ($nowErrs.Count -gt $baseErrs.Count) { Stop-Here ("The typecheck found " + ($nowErrs.Count - $baseErrs.Count) + " more error(s) than master. Send me logs\ship-fixes.log. Nothing has been deployed.") }
  if ($newErrs.Count -gt 0) { Write-Host "  The count didn't go up, so carrying on - but send me logs\ship-fixes.log afterwards." -ForegroundColor Yellow }

  $npx = Find-Npx
  $npm = Find-Npm
  if ($SkipTests) { Say "Tests SKIPPED (-SkipTests)" 'Yellow' }
  else {
    Say "Tests (Claude's mirror: 106 files, 2,015 tests)"
    $prev = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
    try { & $npx vitest run src 2>&1 | ForEach-Object { "$_" } | Out-Host } finally { $ErrorActionPreference = $prev }
    if ($LASTEXITCODE -ne 0) { Stop-Here "Tests failed - nothing has been deployed. Send me logs\ship-fixes.log." }
  }

  Say "Production build - the front end and the server bundle Render runs (npm run build)"
  $prev = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
  try { & $npm run build 2>&1 | ForEach-Object { "$_" } | Out-Host } finally { $ErrorActionPreference = $prev }
  if ($LASTEXITCODE -ne 0) { Stop-Here "The build failed - nothing has been deployed." }

  Set-Content -LiteralPath $CheckedFile -Value (Head-Sha)
  Say "verify done. Next: ship-fixes.ps1 golive" 'Green'
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
    Stop-Here "master could not be fast-forwarded (it has commits the branch doesn't). Back on fix-round; nothing was pushed."
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
