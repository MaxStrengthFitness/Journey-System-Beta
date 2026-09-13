<#
  ship-sep10.ps1 - the Sep 10 2026 go-live, one stage at a time.

  Run from PowerShell, in the repo folder. Two lines do the whole thing:

    powershell -ExecutionPolicy Bypass -File .\ship-sep10.ps1 -Stage prepare
    powershell -ExecutionPolicy Bypass -File .\ship-sep10.ps1 -Stage golive

  prepare  = preflight + commit + check   (only changes your PC's git history)
  golive   = rules + push                  (production: the rules, then Render)

  Or one stage at a time: -Stage preflight | commit | check | rules | push

  preflight  looks, changes nothing
  commit     one commit per phase on a new branch, sep10-go-live
  check      tests + a production build of exactly what will be pushed
  rules      deploys firestore.rules to production (the wiki's rules are new)
  push       merges into master and pushes - Render deploys master, so THIS is the go-live

  Every stage stops at the first problem and says why. Everything is also
  written to ship-sep10.log (git ignores *.log). See GO-LIVE-SEP10.md.
#>
param(
  [ValidateSet("preflight", "commit", "check", "rules", "push", "prepare", "golive")]
  [string]$Stage = "preflight",
  # Only if the tests fail on this PC for a reason that has nothing to do with
  # this release (say so in the log) - the build still has to pass.
  [switch]$SkipTests
)

$ErrorActionPreference = "Continue"
$repo = "C:\Users\austi\Projects\Journey-System-Beta-master"
Set-Location $repo
Start-Transcript -Path (Join-Path $repo "ship-sep10.log") -Append | Out-Null

function Say([string]$msg, [string]$color = "Cyan") {
  Write-Host ""
  Write-Host "== $msg" -ForegroundColor $color
}

function Stop-Here([string]$why) {
  Write-Host ""
  Write-Host "STOPPED: $why" -ForegroundColor Red
  Stop-Transcript | Out-Null
  exit 1
}

# Runs git and stops the script if git fails.
function G {
  & git @args
  if ($LASTEXITCODE -ne 0) { Stop-Here ("git " + ($args -join " ") + " failed (exit $LASTEXITCODE)") }
}

function Commit([string]$message, [string[]]$paths) {
  foreach ($p in $paths) {
    if (-not (Test-Path -LiteralPath $p)) { Stop-Here "Expected file is missing: $p" }
  }
  G add -- @paths
  G commit -q -m $message
  Write-Host ("  committed: " + $message) -ForegroundColor Green
}

# A stale lock from an earlier crash blocks every git command. Only remove it
# when no git process is actually running.
if (Test-Path ".git\index.lock") {
  if (Get-Process git -ErrorAction SilentlyContinue) { Stop-Here "git is running right now (.git\index.lock exists). Close it and try again." }
  Remove-Item ".git\index.lock" -Force
  Write-Host "  removed a stale .git\index.lock" -ForegroundColor Yellow
}

function Branch { (git rev-parse --abbrev-ref HEAD).Trim() }
function HeadSha { (git rev-parse HEAD).Trim() }

# The check stage leaves the commit it verified here; rules and push refuse to
# run for any other commit. So pasting both lines at once is still safe: if
# the tests or the build fail, nothing reaches production.
$checkedFile = Join-Path $repo ".git\ship-sep10-checked"
function Require-Checked {
  $ok = (Test-Path $checkedFile) -and ((Get-Content $checkedFile -Raw).Trim() -eq (HeadSha))
  if (-not $ok) { Stop-Here "The check stage has not passed for this exact commit. Nothing was deployed." }
}
Say "Stage: $Stage   (on $(Branch) at $((HeadSha).Substring(0, 8)))"

$H = "src/features/client-history"

function Do-Preflight {
    Say "Branch and last commit"
    git log --oneline -3
    Say "Changed files git can see (untracked logs and notes are fine)"
    git status --short
    Say "master vs GitHub"
    git fetch origin
    git rev-parse --short master
    git rev-parse --short origin/master
    Say "Firebase login"
    npx firebase login:list
    Say "Preflight done - nothing was changed." "Green"
}

function Do-Commit {
    $branch = Branch; $head = HeadSha
    if ($branch -ne "catalog-wiki" -or -not $head.StartsWith("f8392947")) {
      Stop-Here "Expected branch catalog-wiki at f8392947, found $branch at $head. Nothing was committed."
    }
    G checkout -q -b sep10-go-live

    Commit "Studio hub: the three files the attribution commit missed" @(
      ".gitignore",
      "src/components/AccessRequestView.tsx",
      "src/features/notifications/types.ts")

    Commit "Hub: real names in the assign dialog; the bell knows task-assigned" @(
      "src/features/studio-tasks/AssignDialog.tsx",
      "src/features/notifications/NotificationBell.tsx",
      "src/features/studio-tasks/resolve-flow.ts")

    Commit "Dates: the app's day is the Eastern day (Ohio), going forward" @(
      "src/lib/studio-time.ts",
      "src/lib/studio-time.test.ts",
      "src/components/WorkoutTrackerView.tsx",
      "src/components/ConsultationWizard.tsx",
      "src/hooks/useClientMutations.ts",
      "src/lib/sync-utils.ts",
      "src/components/client-dossier/ClientDossier.tsx",
      "src/components/ClientProgressReportView.tsx",
      "src/features/subjective-report/checkin-draft.ts",
      "src/features/subjective-report/checkin-write.ts",
      "src/features/subjective-report/QuickCheckInDialog.tsx",
      "src/features/subjective-report/useCheckInDraft.ts",
      "src/features/subjective-report/useJournalSuggestions.ts",
      "src/components/ClientDirectoryView.tsx",
      "src/features/admin-data/useStudioExports.ts",
      "src/features/admin/insights/metrics.ts",
      "src/features/admin/mindbody/AdminMindbodyTab.tsx",
      "src/lib/mindbody-api-sync.ts")

    Commit "History: pure model - days, breaks, cadence, calendar and list shapes (36 tests)" @(
      "$H/model.ts", "$H/model.test.ts", "$H/trainers.ts")

    Commit "History: load the whole history live, and sets on demand" @(
      "$H/useSessionHistory.ts")

    Commit "History: every month at once, in the Calendar tab's language" @(
      "$H/client-history.css", "$H/HistoryCalendar.tsx", "$H/HistoryStats.tsx")

    Commit "History: the list, rebuilt in the app's style" @(
      "$H/HistoryList.tsx")

    Commit "History: session pop-up in the Journey grid's colours; four data fixes" @(
      "$H/SessionDetailDialog.tsx", "$H/LogPastSessionDialog.tsx")

    G rm -q -- src/components/ClientHistoryCalendar.tsx
    Commit "History: wire the new tab into the profile; retire the 1,775-line calendar (the profile's event form also takes the Eastern day)" @(
      "$H/HistoryView.tsx", "$H/ClientHistoryTab.tsx", "$H/index.ts",
      "src/components/ClientProfileView.tsx")

    Commit "Learning: the Catalog and the Academy as one tab" @(
      "src/features/wiki/sections.tsx",
      "src/features/wiki/sections.test.tsx",
      "src/features/wiki/WikiShell.tsx",
      "src/features/wiki/wiki.css",
      "src/features/wiki/index.ts",
      "src/AppContent.tsx")

    Commit "Docs: the History round, the Learning tab and the Sep 10 go-live" @(
      "$H/README.md",
      "src/features/client-profile/README.md",
      "HISTORY-ROUND.md",
      "GO-LIVE-SEP10.md",
      "ROADMAP.md")

    Say "Commits on sep10-go-live"
    git log --oneline catalog-wiki..sep10-go-live
    $left = git diff --name-only
    if ($left) {
      Say "Tracked files still changed and NOT in this release (they stay on your PC):" "Yellow"
      $left
    }
    Say "Commit stage done." "Green"
}

function Do-Check {
    if ((Branch) -ne "sep10-go-live") { Stop-Here "Run the commit stage first (on $(Branch))." }
    # The cloud checks ran in UTC; match them so a timezone-sensitive test
    # means the same thing here.
    $env:TZ = "UTC"
    if ($SkipTests) {
      Say "Tests SKIPPED (-SkipTests)" "Yellow"
    } else {
      Say "Tests"
      npx vitest run src
      if ($LASTEXITCODE -ne 0) { Stop-Here "Tests failed - nothing has been pushed." }
    }
    Say "Production build of the front end"
    npx vite build
    if ($LASTEXITCODE -ne 0) { Stop-Here "The build failed - nothing has been pushed." }
    Set-Content -Path $checkedFile -Value (HeadSha)
    Say "Check stage done." "Green"
}

function Do-Rules {
    if ((Branch) -ne "sep10-go-live") { Stop-Here "Run the commit stage first (on $(Branch))." }
    Require-Checked
    Say "Deploying firestore.rules to production (project 'prod' = gen-lang-client-0731527386)"
    npx firebase deploy --only firestore:rules --project prod
    if ($LASTEXITCODE -ne 0) { Stop-Here "The rules deploy failed - nothing has been pushed." }
    Say "Rules stage done." "Green"
}

function Do-Push {
    if ((Branch) -ne "sep10-go-live") { Stop-Here "Run the commit stage first (on $(Branch))." }
    # Anything tracked that differs from the last commit would be left out of
    # the release. Decided by git's exit code, not by reading its output: on
    # Sep 10 the output-based test stopped the push without saying which
    # files it meant. If there are any, they are listed first.
    git diff --quiet HEAD --
    if ($LASTEXITCODE -ne 0) {
      Say "Tracked files that differ from the last commit:" "Yellow"
      git status --short --untracked-files=no | ForEach-Object { Write-Host "  $_" -ForegroundColor Yellow }
      Stop-Here "Uncommitted changes to tracked files (listed above). Nothing was pushed."
    }
    Write-Host "  working tree matches the last commit" -ForegroundColor Green

    G fetch origin
    $om = (git rev-parse origin/master).Trim()
    $lm = (git rev-parse master).Trim()
    if ($om -ne $lm) { Stop-Here "GitHub's master ($($om.Substring(0,8))) is not your master ($($lm.Substring(0,8))). Someone else pushed - that needs a look first. Nothing was pushed." }
    git merge-base --is-ancestor master sep10-go-live
    if ($LASTEXITCODE -ne 0) { Stop-Here "sep10-go-live does not contain master. Nothing was pushed." }

    G checkout -q master
    G merge --no-ff sep10-go-live -m "Go live Sep 10: studio hub, Learning tab, client History, Eastern-time dates"
    Say "Pushing the branches (a backup on GitHub; Render ignores them)"
    G push origin studio-hub catalog-wiki sep10-go-live
    Say "Pushing master - this is the deploy"
    G push origin master
    git log --oneline -1
    Say "Pushed. Render builds and deploys master now (a few minutes)." "Green"
}

switch ($Stage) {
  "preflight" { Do-Preflight }
  "commit"    { Do-Commit }
  "check"     { Do-Check }
  "rules"     { Do-Rules }
  "push"      { Do-Push }
  "prepare"   { Do-Preflight; Do-Commit; Do-Check; Say "PREPARED. Nothing is live yet. Next: -Stage golive" "Green" }
  "golive"    { Do-Rules; Do-Push; Say "LIVE. Render is deploying master." "Green" }
}


Stop-Transcript | Out-Null
