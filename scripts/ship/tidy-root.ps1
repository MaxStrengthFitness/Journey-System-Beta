<#
 tidy-root.ps1  -  repo hygiene, approved Sep 12 2026 (docs/ARCHITECTURE.md, section 4.6)
 SCRIPT-VERSION: v1

   powershell -ExecutionPolicy Bypass -File .\tidy-root.ps1 report
   powershell -ExecutionPolicy Bypass -File .\tidy-root.ps1 apply

 report  touches nothing. Prints every move, delete, edit and ignore rule it
         would make, and says which files git tracks (those are moved with
         "git mv", so their history follows them) and which are untracked
         (plain move).

 apply   does all of it in ONE commit on master:
           docs/rounds/      every round / proposal / go-live document
           docs/ops/         the runbooks (dev setup, Render, iPad checklist,
                             trainer identity)
           scripts/ship/     the ship-*.ps1 scripts, cleanup-branches, setup-ci
           scripts/mindbody/ the five webhook / health scripts
           ROADMAP.md        replaced by the short working list
                             (ROADMAP.new.md); the old journal is kept whole as
                             docs/rounds/CHANGELOG.md (CHANGELOG.new.md)
           deleted           the run logs and command captures at the root,
                             and the two applied patch folders
           .gitignore        rules so the root stays clean afterwards
           references        CLAUDE.md, README.md, DEV-SETUP.md, render.yaml
                             and the moved scripts are updated to the new paths
         It refuses to run if any TRACKED file is modified (untracked litter is
         expected and fine) or if the branch is not master. It moves itself
         into scripts/ship/ last.

 SAFETY: nothing is overwritten except ROADMAP.md (whose full text is kept in
 CHANGELOG.md), nothing under src/, server/, functions/, tests/ or .github/ is
 touched, and every step is in the commit so "git revert" undoes the lot.
#>

param([Parameter(Position = 0)][ValidateSet('report', 'apply')][string]$Stage = 'report')

$ErrorActionPreference = 'Stop'
$Apply = ($Stage -eq 'apply')

# ---------------------------------------------------------------- helpers

function Say([string]$m, [string]$c = 'Gray') { Write-Host $m -ForegroundColor $c }

# The git executable, resolved once. A function named Git would shadow it everywhere.
$GitExe = (Get-Command git -CommandType Application | Select-Object -First 1).Source
if (-not $GitExe) { throw 'git was not found on PATH.' }

function RunGit {
  # git prints ordinary progress on STDERR. With $ErrorActionPreference = 'Stop'
  # PowerShell 5.1 turns each such line into a terminating error even though
  # git succeeded, so scope the preference and judge by the exit code.
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$GitArgs)
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $out = & $GitExe @GitArgs 2>&1
    $code = $LASTEXITCODE
  } finally { $ErrorActionPreference = $prev }
  if ($code -ne 0) { throw ("git " + ($GitArgs -join ' ') + " failed (" + $code + "): " + ($out -join "`n")) }
  return ($out | ForEach-Object { "$_" })
}

function IsTracked([string]$rel) {
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try { & $GitExe ls-files --error-unmatch -- $rel *> $null; return ($LASTEXITCODE -eq 0) }
  finally { $ErrorActionPreference = $prev }
}

# Read / write text preserving the file's own BOM and line endings.
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$Utf8Bom   = New-Object System.Text.UTF8Encoding($true)
function HasBom([string]$path) {
  $fs = [IO.File]::OpenRead($path); try { $b = New-Object byte[] 3; $n = $fs.Read($b, 0, 3) } finally { $fs.Close() }
  return ($n -eq 3 -and $b[0] -eq 0xEF -and $b[1] -eq 0xBB -and $b[2] -eq 0xBF)
}
function ReadText([string]$path) { return [IO.File]::ReadAllText($path, [Text.Encoding]::UTF8) }
function WriteText([string]$path, [string]$text, [bool]$bom) {
  $enc = if ($bom) { $Utf8Bom } else { $Utf8NoBom }
  [IO.File]::WriteAllText($path, $text, $enc)
}
function NewlineOf([string]$text) { if ($text -match "`r`n") { return "`r`n" } else { return "`n" } }

# ---------------------------------------------------------------- where we are

$prev = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
$top = (& $GitExe rev-parse --show-toplevel 2>$null); $rc = $LASTEXITCODE
$ErrorActionPreference = $prev
if ($rc -ne 0 -or -not $top) { throw "Not inside a git repository. Run this from the Journey-System-Beta-master folder." }
$Root = (Resolve-Path $top).Path
Set-Location $Root
Say ("Repo: " + $Root) 'Cyan'

$branch = (RunGit rev-parse --abbrev-ref HEAD) | Select-Object -First 1
Say ("Branch: " + $branch)
if ($branch -ne 'master') { throw "Refusing: this tidy-up is meant to land on master (you are on '$branch'). Check out master and re-run." }

$dirty = RunGit status --porcelain --untracked-files=no
if (@($dirty | Where-Object { $_ -and ($_ -ne '') }).Count -gt 0) {
  Say "Refusing: tracked files are modified. Commit or stash them first:" 'Red'
  $dirty | ForEach-Object { Say ("   " + $_) 'Red' }
  throw "dirty tree"
}
Say "Tracked tree is clean." 'Green'

# ---------------------------------------------------------------- the plan

$RoundDocs = @(
  'ADMIN-OVERHAUL-ROUND1.md', 'ADMIN-OVERHAUL-ROUND2.md', 'DEMO-MODE-BRANCH.md', 'GO-LIVE-SEP10.md',
  'HISTORY-ROUND.md', 'IPAD-LIGHTMODE-AND-DATA-ROUND.md', 'LEARNING-PLANNER-ROUND.md',
  'OPERATIONS-RENEWALS-PROPOSAL.md', 'RENEWALS-ROUND.md', 'RUN-THIS-MORNING.md',
  'SETTINGS-RBAC-AND-TASK-BOARD.md', 'SETTINGS-RBAC-AND-TASK-BOARD-1.md',
  'TRAINER-PROFILE-AND-KAIZEN-ROSTER.md', 'VISUAL-CONSISTENCY-ROUND.md',
  'PROJECT_TRACKER.md', 'SANITIZATION_NOTES.md'
)
$OpsDocs = @('DEV-SETUP.md', 'RENDER-DEPLOYMENT.md', 'TESTING-CHECKLIST.md', 'TRAINER-IDENTITY.md')
$ShipScripts = @(Get-ChildItem -Path $Root -Filter 'ship-*.ps1' -File | ForEach-Object { $_.Name })
$ShipScripts += @('cleanup-branches.ps1', 'setup-ci.ps1')
$MindbodyScripts = @('register-webhook.js', 'deactivate-webhook.js', 'send-test-webhook.js', 'reset-health.js', 'production-guard.js')

$script:Moves = New-Object System.Collections.ArrayList
function PlanMove([string]$name, [string]$toDir) {
  if (Test-Path -LiteralPath (Join-Path $Root $name) -PathType Leaf) {
    [void]$script:Moves.Add([pscustomobject]@{ From = $name; To = ($toDir + '/' + $name); Tracked = (IsTracked $name) })
  }
}
foreach ($f in $RoundDocs)       { PlanMove $f 'docs/rounds' }
foreach ($f in $OpsDocs)         { PlanMove $f 'docs/ops' }
foreach ($f in $ShipScripts)     { PlanMove $f 'scripts/ship' }
foreach ($f in $MindbodyScripts) { PlanMove $f 'scripts/mindbody' }

# Root litter: run logs and command captures. Only files directly at the root.
$DeleteFiles = @(Get-ChildItem -Path $Root -File | Where-Object {
  $_.Extension -in @('.log', '.txt', '.txtcd')
} | ForEach-Object { $_.Name })
$DeleteDirs = @('patches', 'patches-machines') | Where-Object { Test-Path -LiteralPath (Join-Path $Root $_) -PathType Container }

$IgnoreLines = @(
  '',
  '# --- root hygiene (tidy-root.ps1, Sep 12 2026): keep the repo root clean ---',
  '/logs/',
  '/*.txt',
  '/*.txtcd',
  '/Claude outputs/',
  '/harness/',
  '/patches/',
  '/patches-*/'
)

$HaveRoadmapNew   = Test-Path -LiteralPath (Join-Path $Root 'ROADMAP.new.md') -PathType Leaf
$HaveChangelogNew = Test-Path -LiteralPath (Join-Path $Root 'CHANGELOG.new.md') -PathType Leaf

# ---------------------------------------------------------------- report

Say ''
Say '=== MOVES (git mv when tracked, plain move when not) ===' 'Cyan'
foreach ($m in $script:Moves) { Say ("  {0,-45} -> {1,-50} {2}" -f $m.From, $m.To, $(if ($m.Tracked) { 'tracked' } else { 'untracked' })) }
Say ("  " + $script:Moves.Count + " files")
Say ''
Say '=== DELETES (root run logs and command captures; applied patch folders) ===' 'Cyan'
foreach ($d in $DeleteFiles) { Say ("  {0,-45} {1}" -f $d, $(if (IsTracked $d) { 'tracked (git rm)' } else { 'untracked' })) }
foreach ($d in $DeleteDirs)  { Say ("  {0,-45} folder" -f ($d + '/')) }
Say ("  " + $DeleteFiles.Count + " files, " + $DeleteDirs.Count + " folders")
Say ''
Say '=== ROADMAP ===' 'Cyan'
Say ("  ROADMAP.new.md    -> ROADMAP.md                 " + $(if ($HaveRoadmapNew) { 'ready' } else { 'MISSING - apply will refuse' }))
Say ("  CHANGELOG.new.md  -> docs/rounds/CHANGELOG.md   " + $(if ($HaveChangelogNew) { 'ready' } else { 'MISSING - apply will refuse' }))
Say ''
Say '=== .gitignore additions ===' 'Cyan'
$IgnoreLines | Where-Object { $_ -and -not $_.StartsWith('#') } | ForEach-Object { Say ("  " + $_) }
Say ''
Say '=== REFERENCE EDITS ===' 'Cyan'
Say '  CLAUDE.md       round docs / runbooks / ship scripts / register-webhook paths; adds docs/ARCHITECTURE.md to the table'
Say '  README.md       one line pointing at docs/ARCHITECTURE.md'
Say '  render.yaml     RENDER-DEPLOYMENT.md -> docs/ops/RENDER-DEPLOYMENT.md (comments)'
Say '  DEV-SETUP.md    the four root-level utility scripts -> scripts/mindbody/...'
Say '  scripts/mindbody/*.js   .env is read from the repo root instead of the script folder'
Say '  scripts/ship/*.ps1      $PSScriptRoot (the repo root, before) -> the repo root two levels up; logs go to logs/'
Say '  docs/rounds/README.md   generated index of the round documents with dates'
Say ''
if (-not $Apply) { Say 'Report only. Nothing was changed. Run with "apply" to do it.' 'Yellow'; exit 0 }

# ---------------------------------------------------------------- apply

if (-not ($HaveRoadmapNew -and $HaveChangelogNew)) { throw "ROADMAP.new.md and CHANGELOG.new.md must both be at the repo root before apply." }

foreach ($d in @('docs/rounds', 'docs/ops', 'scripts/ship', 'scripts/mindbody', 'logs')) {
  if (-not (Test-Path -LiteralPath (Join-Path $Root $d))) { New-Item -ItemType Directory -Path (Join-Path $Root $d) | Out-Null }
}

# 1. moves
foreach ($m in $script:Moves) {
  if ($m.Tracked) { [void](RunGit mv -- $m.From $m.To) }
  else { Move-Item -LiteralPath (Join-Path $Root $m.From) -Destination (Join-Path $Root $m.To); [void](RunGit add -- $m.To) }
  Say ("moved  " + $m.From + " -> " + $m.To) 'Green'
}

# 2. deletes
foreach ($d in $DeleteFiles) {
  if (IsTracked $d) { [void](RunGit rm -q -- $d) } else { Remove-Item -LiteralPath (Join-Path $Root $d) -Force }
  Say ("deleted " + $d) 'DarkGray'
}
foreach ($d in $DeleteDirs) {
  $tracked = @(RunGit ls-files -- $d) | Where-Object { $_ -ne '' }
  if ($tracked.Count -gt 0) { [void](RunGit rm -r -q -- $d) }
  if (Test-Path -LiteralPath (Join-Path $Root $d)) { Remove-Item -LiteralPath (Join-Path $Root $d) -Recurse -Force }
  Say ("deleted " + $d + "/") 'DarkGray'
}

# 3. ROADMAP.md and the archive
Copy-Item -LiteralPath (Join-Path $Root 'ROADMAP.new.md') -Destination (Join-Path $Root 'ROADMAP.md') -Force
Copy-Item -LiteralPath (Join-Path $Root 'CHANGELOG.new.md') -Destination (Join-Path $Root 'docs/rounds/CHANGELOG.md') -Force
Remove-Item -LiteralPath (Join-Path $Root 'ROADMAP.new.md') -Force
Remove-Item -LiteralPath (Join-Path $Root 'CHANGELOG.new.md') -Force
[void](RunGit add -- 'ROADMAP.md' 'docs/rounds/CHANGELOG.md')
Say 'ROADMAP.md replaced; old journal archived as docs/rounds/CHANGELOG.md' 'Green'

# 4. .gitignore
$giPath = Join-Path $Root '.gitignore'
$gi = ReadText $giPath; $giBom = HasBom $giPath; $nl = NewlineOf $gi
$toAdd = @($IgnoreLines | Where-Object { $_ -eq '' -or $_.StartsWith('#') -or (-not (($gi -split "`r?`n") -contains $_)) })
if (($toAdd | Where-Object { $_ -and -not $_.StartsWith('#') }).Count -gt 0) {
  if (-not $gi.EndsWith("`n")) { $gi += $nl }
  $gi += (($toAdd -join $nl) + $nl)
  WriteText $giPath $gi $giBom
  [void](RunGit add -- '.gitignore')
  Say '.gitignore updated' 'Green'
}

# 5. reference edits (single-line, literal, skipped when the text is not there)
function EditFile([string]$rel, [hashtable[]]$pairs) {
  $path = Join-Path $Root $rel
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { Say ("skip (missing) " + $rel) 'DarkYellow'; return }
  $text = ReadText $path; $bom = HasBom $path; $orig = $text
  foreach ($p in $pairs) {
    if ($p.ContainsKey('Regex')) { $text = [regex]::Replace($text, $p.Regex, $p.With) }
    else { $text = $text.Replace($p.Find, $p.With) }
  }
  if ($text -ne $orig) { WriteText $path $text $bom; [void](RunGit add -- $rel); Say ("edited " + $rel) 'Green' }
  else { Say ("unchanged " + $rel + " (nothing matched)") 'DarkYellow' }
}

EditFile 'CLAUDE.md' @(
  @{ Find = '| Round documents | Repo root: `*-PROPOSAL.md`, `ADMIN-OVERHAUL-ROUND*.md`, `GO-LIVE-SEP10.md`, etc. `ROADMAP.md` is the living plan; `TESTING-CHECKLIST.md` is the iPad walkthrough |';
     With = '| Architecture | `docs/ARCHITECTURE.md` - purpose and scope, the screen map, the data dictionary, the code SOP and the roadmap. **Read it before proposing anything** |' + "`r`n" + '| Round documents | `docs/rounds/` (index in `docs/rounds/README.md`; the full journal in `docs/rounds/CHANGELOG.md`). `ROADMAP.md` is the short working list; `docs/ops/TESTING-CHECKLIST.md` is the iPad walkthrough; runbooks in `docs/ops/` |' },
  @{ Find = 'Releases are shipped with a staged PowerShell script (`ship-sep10.ps1`, `ship-renewals.ps1`)';
     With = 'Releases are shipped with a staged PowerShell script (`scripts/ship/ship-*.ps1`)' },
  @{ Find = '`register-webhook.js` now takes `--site` and `--list`';
     With = '`scripts/mindbody/register-webhook.js` now takes `--site` and `--list`' },
  @{ Find = '`LEARNING-PLANNER-ROUND.md` is the round';
     With = '`docs/rounds/LEARNING-PLANNER-ROUND.md` is the round' }
)

$readmePath = Join-Path $Root 'README.md'
if (Test-Path -LiteralPath $readmePath) {
  $t = ReadText $readmePath; $b = HasBom $readmePath; $nl = NewlineOf $t
  if ($t -notmatch 'docs/ARCHITECTURE\.md') {
    $lines = $t -split "`r?`n", 2
    $t = $lines[0] + $nl + $nl + 'Read `docs/ARCHITECTURE.md` first: what Journey is for, every screen, every Firestore collection, how the code is organised, and the roadmap.' + $nl + $(if ($lines.Count -gt 1) { $lines[1] } else { '' })
    WriteText $readmePath $t $b; [void](RunGit add -- 'README.md'); Say 'edited README.md' 'Green'
  }
}

EditFile 'render.yaml' @( @{ Find = 'read RENDER-DEPLOYMENT.md first'; With = 'read docs/ops/RENDER-DEPLOYMENT.md first' },
                          @{ Find = 'RENDER-DEPLOYMENT.md walks'; With = 'docs/ops/RENDER-DEPLOYMENT.md walks' } )

EditFile 'docs/ops/DEV-SETUP.md' @(
  @{ Find = '`reset-health.js`, `register-webhook.js`, `deactivate-webhook.js`, `send-test-webhook.js` and `scripts/purge-database.ts`';
     With = '`scripts/mindbody/reset-health.js`, `scripts/mindbody/register-webhook.js`, `scripts/mindbody/deactivate-webhook.js`, `scripts/mindbody/send-test-webhook.js` and `scripts/purge-database.ts`' },
  @{ Find = '**The root-level utility scripts act on PRODUCTION.**'; With = '**The Mindbody utility scripts in `scripts/mindbody/` act on PRODUCTION.**' }
)

foreach ($js in @('register-webhook.js', 'deactivate-webhook.js', 'send-test-webhook.js')) {
  EditFile ('scripts/mindbody/' + $js) @( @{ Find = 'path.join(__dirname, ".env")'; With = 'path.join(__dirname, "..", "..", ".env")' } )
}
EditFile 'scripts/mindbody/production-guard.js' @( @{ Find = 'Shared production safety check for the root-level utility scripts.'; With = 'Shared production safety check for the Mindbody utility scripts (scripts/mindbody/, run from the repo root: node scripts/mindbody/<name>.js).' } )

foreach ($ps in $ShipScripts) {
  $rel = 'scripts/ship/' + $ps
  if (-not (Test-Path -LiteralPath (Join-Path $Root $rel))) { continue }
  # Order matters: first park the log lines behind a placeholder, then wrap every
  # remaining $PSScriptRoot (which used to BE the repo root) in the two-levels-up
  # expression, then resolve the placeholder - so nothing gets wrapped twice.
  EditFile $rel @(
    @{ Regex = "Join-Path \`$PSScriptRoot '([^']+\.log)'"; With = "Join-Path __REPO_ROOT__ 'logs\`$1'" },
    @{ Find = '$PSScriptRoot'; With = '(Split-Path -Parent (Split-Path -Parent $PSScriptRoot))' },
    @{ Find = '__REPO_ROOT__'; With = '(Split-Path -Parent (Split-Path -Parent $PSScriptRoot))' }
  )
}

# 6. docs/rounds/README.md index
$idx = New-Object System.Collections.ArrayList
foreach ($f in (Get-ChildItem -Path (Join-Path $Root 'docs/rounds') -File | Where-Object { $_.Name -notin @('README.md', 'CHANGELOG.md') } | Sort-Object Name)) {
  $rel = 'docs/rounds/' + $f.Name
  $date = $null
  if (IsTracked $rel) {
    $prev = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
    $d = (& $GitExe log --diff-filter=A --follow --format=%ad --date=short -- $rel 2>$null | Select-Object -Last 1)
    $ErrorActionPreference = $prev
    if ($d) { $date = "$d" }
  }
  if (-not $date) { $date = $f.LastWriteTime.ToString('yyyy-MM-dd') }
  [void]$idx.Add([pscustomobject]@{ Date = $date; Name = $f.Name })
}
$sb = New-Object System.Text.StringBuilder
[void]$sb.AppendLine('# Round documents')
[void]$sb.AppendLine('')
[void]$sb.AppendLine('One document per round: the brief, the decisions, what shipped, what was left. Moved here from the repo root on Sep 12 2026 (`scripts/ship/tidy-root.ps1`). New rounds add a file here named `<yyyy-mm-dd>-<name>.md` and a line below. The full journal of everything shipped since August is `CHANGELOG.md`; the living plan is `../ARCHITECTURE.md`.')
[void]$sb.AppendLine('')
[void]$sb.AppendLine('| Date | Document |')
[void]$sb.AppendLine('| --- | --- |')
foreach ($row in ($idx | Sort-Object Date, Name)) { [void]$sb.AppendLine('| ' + $row.Date + ' | [' + $row.Name + '](' + $row.Name + ') |') }
WriteText (Join-Path $Root 'docs/rounds/README.md') $sb.ToString() $false
[void](RunGit add -- 'docs/rounds/README.md')
Say 'docs/rounds/README.md written' 'Green'

# 7. move this script last, then commit
$self = $MyInvocation.MyCommand.Path
if ($self -and (Split-Path -Parent $self) -eq $Root) {
  $dest = Join-Path $Root 'scripts/ship/tidy-root.ps1'
  if (IsTracked 'tidy-root.ps1') { [void](RunGit mv -- 'tidy-root.ps1' 'scripts/ship/tidy-root.ps1') }
  else { Move-Item -LiteralPath $self -Destination $dest -Force; [void](RunGit add -- 'scripts/ship/tidy-root.ps1') }
  Say 'moved  tidy-root.ps1 -> scripts/ship/tidy-root.ps1' 'Green'
}

$msgFile = Join-Path ([IO.Path]::GetTempPath()) 'tidy-root-commit.txt'
$msg = @(
  'chore: tidy the repo root (docs/rounds, docs/ops, scripts/ship, scripts/mindbody)',
  '',
  'Approved in docs/ARCHITECTURE.md section 4.6 (Sep 12 2026). Round documents to docs/rounds/,',
  'runbooks to docs/ops/, ship scripts to scripts/ship/, the Mindbody utility scripts to',
  'scripts/mindbody/ (they now read .env from the repo root). ROADMAP.md is the short working',
  'list; the old journal is kept whole as docs/rounds/CHANGELOG.md. Root run logs and command',
  'captures deleted and ignored from now on. References updated in CLAUDE.md, README.md,',
  'render.yaml and DEV-SETUP.md.',
  '',
  'Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>',
  'Claude-Session: https://claude.ai/code/session_01YQy9wnt2F6DomSuzMCY5wu'
) -join "`n"
[IO.File]::WriteAllText($msgFile, $msg, [Text.Encoding]::ASCII)
[void](RunGit commit -q -F $msgFile)
Remove-Item -LiteralPath $msgFile -Force
$sha = (RunGit rev-parse --short HEAD) | Select-Object -First 1
Say ''
Say ("Committed " + $sha + " on master. Nothing was pushed - push when you are ready (GitHub Desktop, or: git push origin master).") 'Cyan'
Say 'Render will redeploy on push; this commit changes no application code.' 'Gray'
