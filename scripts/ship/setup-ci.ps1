<#
 setup-ci.ps1  -  put the CI workflow in place and commit it
 SCRIPT-VERSION: v1

   powershell -ExecutionPolicy Bypass -File .\setup-ci.ps1

 WHY THIS IS A SCRIPT AND NOT THREE FILES I WROTE FOR YOU
   The file bridge treats .github/ as a protected path and refuses to write
   there. The workflow was written on Sep 10, handed over as a download, and
   never got put in place - which is why this repo has had no CI at all. So
   the three files arrive at the repo root under .new names and this moves
   them into position locally.

 WHAT IT DOES
   .github/workflows/ci.yml          <- ci.yml.new
   .github/typecheck-baseline.txt    <- baseline.new.txt   (contains 18)
   .gitignore                        <- gitignore.new      (one-line fix, below)
   then commits all three on the branch you are on.

 THE .GITIGNORE FIX, AND WHY IT MATTERS
   Your .gitignore has `typecheck-baseline.txt` with no leading slash. Git
   applies a slash-less pattern at EVERY depth, so it also matches
   .github/typecheck-baseline.txt - the file CI reads to decide whether the
   type-error count went up. Ignored, it is never committed, and the first CI
   run dies on `cat: .github/typecheck-baseline.txt: No such file`. The new
   .gitignore adds `!.github/typecheck-baseline.txt` right after it.

 WHAT CI WILL DO ON THE FIRST RUN
   typecheck (expect 18, equal to the baseline, so green), npm test (96 files),
   vite build. Plus an ADVISORY Firestore-rules job allowed to fail, because
   the emulator has a history of failing for environmental reasons.
   It does not deploy and needs no secrets. Render keeps deploying from master
   on its own and is NOT gated on this - make it a required check once it has
   been green for a week.
#>

$ErrorActionPreference = 'Stop'
$root = (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))

function Need($p) {
  if (-not (Test-Path (Join-Path $root $p))) {
    Write-Host "MISSING: $p" -ForegroundColor Red
    Write-Host "All three .new files need to be in the repo root." -ForegroundColor Red
    exit 1
  }
}
Need 'ci.yml.new'; Need 'baseline.new.txt'; Need 'gitignore.new'

$dirty = & git status --porcelain --untracked-files=no
if ($dirty) {
  Write-Host 'REFUSING: tracked files are modified. Commit or stash first.' -ForegroundColor Red
  $dirty | ForEach-Object { Write-Host "    $_" -ForegroundColor Red }
  exit 1
}

New-Item -ItemType Directory -Force -Path (Join-Path $root '.github\workflows') | Out-Null
Copy-Item (Join-Path $root 'ci.yml.new')       (Join-Path $root '.github\workflows\ci.yml')     -Force
Copy-Item (Join-Path $root 'baseline.new.txt') (Join-Path $root '.github\typecheck-baseline.txt') -Force
Copy-Item (Join-Path $root 'gitignore.new')    (Join-Path $root '.gitignore')                   -Force
Write-Host 'Files in place.' -ForegroundColor Green

Remove-Item (Join-Path $root 'ci.yml.new'), (Join-Path $root 'baseline.new.txt'),
            (Join-Path $root 'gitignore.new') -Force

# -f on .github because the OLD .gitignore (still the one git has staged
# knowledge of until this commit) would otherwise exclude the baseline file.
& git add -f .github .gitignore
& git status --short -- .github .gitignore

$msg = @(
  'Add CI: typecheck, test and build on every push',
  '',
  'This repo has had no CI. The workflow was written on Sep 10 and delivered',
  'as a download, because the file bridge refuses to write .github/, and it',
  'was never put in place. So every check has been someone remembering to run',
  'a script.',
  '',
  'The typecheck gate is a COUNT, not a clean run: it fails only if errors',
  'rise above .github/typecheck-baseline.txt (18). A gate demanding zero would',
  'be red on every commit, which is the same as no gate.',
  '',
  'Note on the count: harness/ is in .git/info/exclude, so it is not in a',
  'clone. It carries one permanent TS2307 (it imports src/features/demo-mode,',
  'which only exists on the unmerged demo-mode-foundation branch). Locally tsc',
  'reports 19; CI sees 18.',
  '',
  'Also fixes .gitignore: `typecheck-baseline.txt` has no leading slash, so it',
  'matched .github/typecheck-baseline.txt at depth and would have kept the CI',
  'baseline out of the repo entirely - the first run would have failed on a',
  'missing file. Negated explicitly.',
  '',
  'The Firestore rules suite is a separate advisory job with',
  'continue-on-error: the emulator needs a JDK and has failed for',
  'environmental reasons before, and that says nothing about the code.',
  '',
  'Not a required check and does not gate Render, deliberately, for now.',
  '',
  'Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>',
  'Claude-Session: https://claude.ai/code/session_017WvkUYfin4UB4H5Jt9nueN'
)
$tmp = Join-Path $env:TEMP 'ci-msg.txt'
Set-Content -Path $tmp -Value $msg -Encoding ascii
& git commit -q -F $tmp
Remove-Item $tmp -Force

Write-Host ("committed " + (& git rev-parse --short HEAD).Trim()) -ForegroundColor Green
Write-Host ''
Write-Host 'Push, and the first run appears under the Actions tab on GitHub:' -ForegroundColor Cyan
Write-Host ("  git push origin " + (& git rev-parse --abbrev-ref HEAD).Trim()) -ForegroundColor Cyan
Write-Host ''
Write-Host 'Expect: typecheck 18 (equal to baseline, green), 96 test files, clean build.' -ForegroundColor Cyan
Write-Host 'The rules job may go orange - it is advisory and does not fail the run.' -ForegroundColor DarkGray
