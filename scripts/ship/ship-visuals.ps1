<#
================================================================================
 ship-visuals.ps1  -  the Sep 12 2026 visual-consistency round
================================================================================

 WHAT THIS DOES
   Creates a branch off master and lands five commits, one per phase, so any
   single phase can be undone on its own with `git revert <sha>` without
   disturbing the others. Then typechecks, tests and builds.

 WHY IT IS A SCRIPT AND NOT A LIST OF COMMANDS
   Claude could not reach the repo directly this session (device_bash could
   not mount the project folder - the Sep 8 Windows update), so the changes
   arrive as patch files under .\patches\ and this script applies them.

 HOW TO RUN  - two pastes, in this order, from the repo root:

     powershell -ExecutionPolicy Bypass -File .\ship-visuals.ps1 prepare
     powershell -ExecutionPolicy Bypass -File .\ship-visuals.ps1 verify

   Everything is tee'd to ship-visuals.log.

 VERSION v3.  Check you have this one before running:

     Select-String -Path .\ship-visuals.ps1 -Pattern 'SCRIPT-VERSION'

   It must print v3. If it prints nothing you still have v1, which refuses to
   start on an untracked file and will waste your time.

 NEW IN v3
   Your repo has core.autocrlf=true. These patches were generated from a CRLF
   working tree so their bodies carry CRLF, which is what `git apply` compares
   against on disk - they should match exactly, and `git add` converts back to
   LF for the index so the commits stay consistent with the rest of the repo.
   Belt and braces: each patch is now tried exact, then --ignore-whitespace,
   then --3way, and the log records which mode was used.

 FIXED IN v2, after the first two runs refused to start:
   1. The clean-tree check counted UNTRACKED files. Your repo root carries 20
      of them (old round docs, previous ship scripts, deploy logs), none of
      which can possibly conflict with applying a patch. It now checks only
      whether TRACKED files are modified, which is the thing that actually
      matters, and it lists untracked files as information rather than
      refusing.
   2. The typecheck count was read back out of the whole appended log file, so
      a second run would have double-counted. It now counts only the output of
      the current run, and reports src/ separately from the untracked local
      harness - the harness contributes one permanent error because
      demo-mode-foundation was never merged, and it is not part of the build.
   3. Every non-ASCII character is gone. PowerShell 5.1 reads a file without a
      BOM as ANSI, which is why the first run logged "PREPARE a<U+0080><U+0094> branch".

 IF SOMETHING GOES WRONG
   `prepare` checks all five patches apply BEFORE applying any of them, so a
   failure leaves you exactly where you started. To abandon the round after it
   has run:

     git checkout master
     git branch -D visual-consistency

================================================================================
#>

param(
    [Parameter(Position = 0)]
    [ValidateSet('prepare', 'verify', 'golive')]
    [string]$Stage = 'prepare'
)

# SCRIPT-VERSION: v3  (2026-09-12)
$ErrorActionPreference = 'Stop'
$LogFile = Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) 'logs\ship-visuals.log'
$Branch  = 'visual-consistency'

<#
 The master baseline, measured from the first run of this script on Sep 12
 2026 (it ran `verify` against master because `prepare` had refused, which
 turned the mistake into a useful measurement):

     src/      18 errors     <- the number this round must not raise
     harness/   1 error      TS2307, cannot find '../src/features/demo-mode'
                             The harness is untracked and outside the build;
                             the module is missing because demo-mode-foundation
                             was never merged. Permanent until it is.
     TOTAL     19 errors

 18 for src/ is also what .github/typecheck-baseline.txt records - except that
 directory does not exist on disk. The Sep 10 CI workflow was delivered as a
 download because the file bridge treats .github/ as a protected path, and it
 was never put in place. Worth fixing separately; there is no CI running today.
#>
$SrcBaseline = 18

function Log {
    param([string]$Message, [string]$Colour = 'Gray')
    $line = "[{0}] {1}" -f (Get-Date -Format 'HH:mm:ss'), $Message
    Write-Host $line -ForegroundColor $Colour
    Add-Content -Path $LogFile -Value $line -Encoding utf8
}

function Run {
    # Returns a hashtable so the caller can count errors in THIS run's output
    # rather than re-reading the whole log, which grows across runs.
    param([string]$Label, [string]$Command)
    Log "--- $Label ---" 'Cyan'
    Log "> $Command"
    $output = & cmd /c "$Command 2>&1"
    $code = $LASTEXITCODE
    $output | ForEach-Object { Add-Content -Path $LogFile -Value $_ -Encoding utf8 }
    $output | Select-Object -Last 25 | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray }
    Log "$Label exit code: $code" $(if ($code -eq 0) { 'Green' } else { 'Yellow' })
    return @{ Code = $code; Output = $output }
}

$Phases = @(
    @{ File = '01-neutral-ramp.patch'
       Subject = 'Retint the slate scale onto the brand neutrals'
       Body = @(
         'The app was built dark-first on Tailwind slate: every dark token in',
         'index.css IS a slate value (--background is slate-950, --card is',
         'slate-900, --elevated is slate-800, --ink-l1/l2/l3/l4 are slate-50/',
         '300/400/500). The Sep 9 light-mode retune moved the LIGHT palette off',
         'pure slate deliberately, but the ~2,700 hardcoded slate-* classes did',
         'not move with it, so light mode painted Tailwind cold grey beside the',
         'retuned brand neutral. This redefines what slate-* MEANS rather than',
         'editing 2,700 call sites - the same technique the elevation scale',
         'already uses to override Tailwind shadows.',
         '',
         'Light maps onto anchors already in :root. Dark is byte-identical to',
         'Tailwind slate, so dark mode does not move at all. Both ramps stay',
         'monotonic, so existing light/dark pairs keep behaving as written.',
         'text-slate-500 crosses AA on the light ground: 4.17:1 -> 5.59:1.') }

    @{ File = '02-collapse-hardcoded-pairs-onto-semantic-t.patch'
       Subject = 'Collapse hardcoded light/dark pairs onto semantic tokens'
       Body = @(
         '350 substitutions across 43 files. Every rule was checked against the',
         'actual token values first; all five are identical in dark mode:',
         '',
         '  bg-white dark:bg-slate-900             -> bg-card',
         '  text-slate-500 dark:text-slate-400     -> text-muted-foreground',
         '  text-slate-400 (no dark: sibling)      -> text-muted-foreground',
         '  border-slate-200 dark:border-slate-700 -> border-border',
         '  text-slate-900 dark:text-white         -> text-foreground',
         '',
         'The bare text-slate-400 rule is the valuable one: identical in dark',
         '(#94A3B8 either way) and 2.24:1 -> 5.9:1 in light, where it was',
         'failing AA in 367 places.',
         '',
         'Deliberately NOT applied to the four screens that paint a fixed dark',
         'surface regardless of theme (access request, focus dashboard, error',
         'boundary, legacy chart importer). On an always-dark pane a',
         'theme-aware token resolves to a dark ink in light theme and the text',
         'disappears.') }

    @{ File = '03-pre-login-accents-onto-the-brand-action-.patch'
       Subject = 'Move the pre-login accents onto the brand action token'
       Body = @(
         'AccessRequestView - the first screen anyone sees - was accented in',
         '#ff9800, which is Material Design orange and is not in the Journey',
         'palette at all. Its sibling StudioSelectionView already uses #F06C22.',
         'Both now go through the --action token, which is #F06C22 in light AND',
         'dark, so StudioSelectionView renders identically and AccessRequestView',
         'simply stops being the odd one out. 4.82:1 on its card, clears AA.',
         '',
         'The ambient dark treatment on that screen is left alone: it is a',
         'design, not an oversight.') }

    @{ File = '04-same-collapses-across-the-two-largest-th.patch'
       Subject = 'Apply the same collapses to the two largest screens'
       Body = @(
         'ClientProfileView (4,209 lines) and WorkoutTrackerView (3,965), 92',
         'substitutions, same five rules as phase 2. Separated into their own',
         'commit so the biggest files can be reverted without losing the rest.',
         '',
         'ClientProgressReportView was excluded after checking: it has an',
         'always-dark root (min-h-screen bg-[#0A2E46]) for the printable',
         'report, so it belongs with the always-dark set.') }

    @{ File = '05-guard-the-ramp-and-ratchet-colour-drift.patch'
       Subject = 'Guard the ramp and ratchet colour drift'
       Body = @(
         'src/neutral-ramp.test.ts, in the same spirit as journey-grid/',
         'contrast.test.ts: a hand-typed table of ratios is a claim, this is a',
         'check. Computed from the actual index.css:',
         '',
         '  - every rung mapped through @theme',
         '  - the dark ramp is byte-identical to Tailwind slate',
         '  - both ramps monotonic and non-inverting',
         '  - the light text rungs clear AA on the ground',
         '  - slate-400 documented as a NON-text grey, with the reason',
         '',
         'Plus a ratchet on non-theme-aware palette utilities, budget 311,',
         'excluding the five genuinely always-dark screens (named in the test,',
         'with the root class that makes each one always-dark). A COUNT rather',
         'than a clean run, matching the CI typecheck gate: a gate demanding',
         'zero would be red on every commit, which is the same as no gate.') }
)

$Trailer = @(
    '',
    'Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>',
    'Claude-Session: https://claude.ai/code/session_017WvkUYfin4UB4H5Jt9nueN'
)

# ------------------------------------------------------------------ prepare --
if ($Stage -eq 'prepare') {
    Set-Content -Path $LogFile -Value "=== ship-visuals prepare  $(Get-Date) ===" -Encoding utf8
    Log 'PREPARE - branch, apply five patches, one commit per phase' 'Cyan'

    # TRACKED files only. Untracked files cannot conflict with `git apply` or
    # with creating a branch, and this repo root has 20 of them left over from
    # earlier rounds. Refusing on those is what stopped the first run.
    $dirty = & git status --porcelain --untracked-files=no
    if ($dirty) {
        Log 'REFUSING: tracked files are modified. Commit or stash them first.' 'Red'
        $dirty | ForEach-Object { Log "    $_" 'Red' }
        exit 1
    }
    Log 'No tracked files modified.' 'Green'

    $untracked = & git ls-files --others --exclude-standard
    if ($untracked) {
        Log "$($untracked.Count) untracked files present - ignored, they cannot conflict:" 'DarkGray'
        $untracked | Select-Object -First 8 | ForEach-Object { Log "    $_" 'DarkGray' }
        if ($untracked.Count -gt 8) { Log "    ... and $($untracked.Count - 8) more" 'DarkGray' }
    }

    $current = (& git rev-parse --abbrev-ref HEAD).Trim()
    Log "Currently on: $current"
    if ($current -ne 'master') {
        Log "Expected master. Run 'git checkout master' first." 'Red'
        exit 1
    }

    # Patch 05 CREATES this file; git apply fails if it already exists.
    $newTest = Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) 'src\neutral-ramp.test.ts'
    if (Test-Path $newTest) {
        Log 'src\neutral-ramp.test.ts already exists - delete it and re-run.' 'Red'
        exit 1
    }

<#
     LINE ENDINGS. Your repo has core.autocrlf=true, so blobs are stored LF in
     the index and checked out CRLF in the working tree. These patches were
     generated FROM a CRLF working tree, so their hunk bodies carry CRLF, which
     is what `git apply` will be comparing against on disk - they should match
     exactly. After applying, `git add` converts back to LF for the index, so
     the commits stay consistent with everything already in the repo and you
     will not see a whole-file line-ending diff.

     The failure mode to watch for is the opposite one (an LF patch against a
     CRLF tree), so if a patch is ever rejected the fallbacks below are tried
     in order before giving up, and the log says which one worked.
#>
    $ApplyModes = @(
        @{ Args = @();                      Why = 'exact' }
        @{ Args = @('--ignore-whitespace'); Why = 'ignoring whitespace' }
        @{ Args = @('--3way');              Why = '3-way merge' }
    )

    Log 'Dry-running all five patches before touching anything...' 'Cyan'
    $chosen = @{}
    foreach ($p in $Phases) {
        $path = Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) "patches\$($p.File)"
        if (-not (Test-Path $path)) { Log "MISSING: $path" 'Red'; exit 1 }
        $okMode = $null
        foreach ($m in $ApplyModes) {
            & git apply --check @($m.Args) $path 2>$null
            if ($LASTEXITCODE -eq 0) { $okMode = $m; break }
        }
        if (-not $okMode) {
            Log "PATCH WOULD FAIL (all three modes): $($p.File)" 'Red'
            & git apply --check $path
            Log 'Nothing has been changed. Send ship-visuals.log to Claude.' 'Red'
            exit 1
        }
        $chosen[$p.File] = $okMode.Args
        $note = if ($okMode.Why -eq 'exact') { '' } else { "  <- $($okMode.Why)" }
        Log "  ok  $($p.File)$note" $(if ($okMode.Why -eq 'exact') { 'Green' } else { 'Yellow' })
    }

    if ((& git branch --list $Branch)) {
        Log "Branch '$Branch' already exists. Delete or rename it, then re-run." 'Red'
        exit 1
    }
    & git checkout -b $Branch | Out-Null
    Log "Created and switched to '$Branch'." 'Green'

    foreach ($p in $Phases) {
        $path = Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) "patches\$($p.File)"
        & git apply @($chosen[$p.File]) $path
        if ($LASTEXITCODE -ne 0) { Log "apply failed unexpectedly: $($p.File)" 'Red'; exit 1 }
        # Scoped to src/ so none of those 20 untracked root files get swept in.
        & git add src
        $msg = @($p.Subject, '') + $p.Body + $Trailer
        $tmp = Join-Path $env:TEMP 'visuals-msg.txt'
        # ASCII, not utf8: PowerShell 5.1's -Encoding utf8 writes a BOM, and a
        # BOM at the start of a -F message file lands as a stray glyph at the
        # front of the commit subject. Every message here is ASCII by design.
        Set-Content -Path $tmp -Value $msg -Encoding ascii
        & git commit -q -F $tmp
        Remove-Item $tmp -Force
        $sha = (& git rev-parse --short HEAD).Trim()
        Log "  $sha  $($p.Subject)" 'Green'
    }

    Log ''
    Log 'Five commits landed. Revert any one on its own with: git revert <sha>' 'Cyan'
    Log 'NEXT:  powershell -ExecutionPolicy Bypass -File .\ship-visuals.ps1 verify' 'Cyan'
    exit 0
}

# ------------------------------------------------------------------- verify --
if ($Stage -eq 'verify') {
    Add-Content -Path $LogFile -Value "`n=== ship-visuals verify  $(Get-Date) ===" -Encoding utf8
    Log 'VERIFY - typecheck, tests, build' 'Cyan'

    $onBranch = (& git rev-parse --abbrev-ref HEAD).Trim()
    Log "Verifying branch: $onBranch"
    if ($onBranch -ne $Branch) {
        Log "WARNING: not on '$Branch'. This measures $onBranch, not the round." 'Yellow'
    }

    $tsc = Run 'typecheck' 'npx tsc --noEmit'

    # Count THIS run only, and split src/ from the untracked local harness.
    $errLines = @($tsc.Output | Where-Object { $_ -match 'error TS' })
    $srcErrors     = @($errLines | Where-Object { $_ -match '^src[/\\]' }).Count
    $harnessErrors = @($errLines | Where-Object { $_ -match '^harness[/\\]' }).Count
    $otherErrors   = $errLines.Count - $srcErrors - $harnessErrors

    Log "typecheck src/     : $srcErrors   (baseline $SrcBaseline)" `
        $(if ($srcErrors -le $SrcBaseline) { 'Green' } else { 'Red' })
    Log "typecheck harness/ : $harnessErrors   (expected 1, demo-mode not merged; outside the build)" 'DarkGray'
    if ($otherErrors -gt 0) { Log "typecheck elsewhere: $otherErrors" 'Yellow' }

    if ($srcErrors -gt $SrcBaseline) {
        Log "ABOVE BASELINE by $($srcErrors - $SrcBaseline) - this round introduced type errors." 'Red'
        $errLines | Where-Object { $_ -match '^src[/\\]' } |
            Select-Object -First 10 | ForEach-Object { Log "    $_" 'Red' }
    }

    $test  = Run 'tests' 'npm test'
    if ($test.Code -ne 0) {
        Log 'TESTS FAILED. The new one is src/neutral-ramp.test.ts.' 'Red'
        $test.Output | Where-Object { $_ -match 'neutral-ramp|FAIL|AssertionError' } |
            Select-Object -First 15 | ForEach-Object { Log "    $_" 'Red' }
    }
    $ramp = @($test.Output | Where-Object { $_ -match 'neutral-ramp' }).Count
    if ($ramp -eq 0) {
        Log 'NOTE: neutral-ramp.test.ts did not appear in the test output.' 'Yellow'
        Log '      That usually means prepare never ran. Check the branch above.' 'Yellow'
    }

    $build = Run 'build' 'npm run build'

    Log ''
    Log '================ SUMMARY ================' 'Cyan'
    Log ("branch    : {0}" -f $onBranch)
    Log ("typecheck : src {0} / baseline {1}" -f $srcErrors, $SrcBaseline) `
        $(if ($srcErrors -le $SrcBaseline) { 'Green' } else { 'Red' })
    Log ("tests     : {0}" -f $(if ($test.Code  -eq 0) { 'pass' } else { 'FAIL' })) $(if ($test.Code  -eq 0) { 'Green' } else { 'Red' })
    Log ("build     : {0}" -f $(if ($build.Code -eq 0) { 'clean' } else { 'FAIL' })) $(if ($build.Code -eq 0) { 'Green' } else { 'Red' })
    Log ''
    Log 'If all three are good, look at it before merging:' 'Cyan'
    Log '  npm run dev   - then VISUAL-CONSISTENCY-ROUND.md section 4.' 'Cyan'
    Log '  Light mode first. The prediction to test is that DARK looks identical.' 'Cyan'
    exit 0
}

# ------------------------------------------------------------------- golive --
if ($Stage -eq 'golive') {
    Add-Content -Path $LogFile -Value "`n=== ship-visuals golive  $(Get-Date) ===" -Encoding utf8
    Log 'GOLIVE - merge to master and push (Render auto-deploys from master)' 'Cyan'
    Log 'Only after the iPad pass in VISUAL-CONSISTENCY-ROUND.md section 4.' 'Yellow'

    $current = (& git rev-parse --abbrev-ref HEAD).Trim()
    if ($current -ne $Branch) { Log "Expected to be on '$Branch', on '$current'." 'Red'; exit 1 }
    $dirty = & git status --porcelain --untracked-files=no
    if ($dirty) { Log 'Tracked files are modified.' 'Red'; exit 1 }

    & git checkout master
    & git merge --no-ff $Branch -m "Visual consistency round (Sep 12 2026)`n`nCo-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
    if ($LASTEXITCODE -ne 0) { Log 'MERGE CONFLICT - resolve, then re-run.' 'Red'; exit 1 }
    Log 'Merged. Pushing...' 'Green'
    & git push origin master
    Log "push exit code: $LASTEXITCODE" $(if ($LASTEXITCODE -eq 0) { 'Green' } else { 'Red' })
    exit 0
}
