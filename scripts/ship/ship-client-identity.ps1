<#
.SYNOPSIS
  Ships the client-identity round (Sep 23 2026): the second person on a
  Mindbody number both sites use gets their own record, clients/{site}-{id}.
  docs/rounds/2026-09-23-client-identity.md is the round.

.DESCRIPTION
  Four stages, run IN ORDER from the main project folder
  (C:\Users\austi\Projects\Journey-System-Beta-master):

    powershell -ExecutionPolicy Bypass -File ..\Journey-preview\scripts\ship\ship-client-identity.ps1 check
    powershell -ExecutionPolicy Bypass -File ..\Journey-preview\scripts\ship\ship-client-identity.ps1 golive
    powershell -ExecutionPolicy Bypass -File ..\Journey-preview\scripts\ship\ship-client-identity.ps1 records
    powershell -ExecutionPolicy Bypass -File ..\Journey-preview\scripts\ship\ship-client-identity.ps1 webhook

  check    - reads only. The branch is a fast-forward of master, the restore
             tag exists, and what is about to go live.
  golive   - pushes the branch to master. RENDER DEPLOYS THE APP TO TRAINERS.
             No rules or index changes.
  records  - the rehome script: a dry run, then asks before --commit, then
             the damage check. WRITES TO PRODUCTION (two new client records,
             23 bookings moved; a backup is written first). Run after golive.
  webhook  - firebase deploy --only functions:mindbodyWebhook. Not urgent:
             the webhook receives no events today.

  To undo the app: git reset --hard restore/2026-09-23-before-client-identity
  and push. This file is ASCII only on purpose (Windows PowerShell 5.1).
#>
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('check', 'golive', 'records', 'webhook')]
  [string]$Stage
)

$ErrorActionPreference = 'Stop'
$Branch = 'collision-cleanup'
$RestoreTag = 'restore/2026-09-23-before-client-identity'
$Preview = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$Main = (Get-Location).Path

function Say([string]$text, [string]$color = 'Cyan') { Write-Host ''; Write-Host ('== ' + $text) -ForegroundColor $color }
function Stop-Here([string]$why) { Write-Host ''; Write-Host ('STOPPED: ' + $why) -ForegroundColor Red; exit 1 }

if (-not (Test-Path (Join-Path $Main 'service-account.json'))) {
  Stop-Here "Run this from the main project folder (the one with service-account.json), not from $Main."
}

switch ($Stage) {
  'check' {
    Say 'Fetching from GitHub (reads only)'
    git --no-optional-locks fetch -q origin
    $counts = (git --no-optional-locks rev-list --left-right --count "origin/master...$Branch").Trim() -split '\s+'
    if ([int]$counts[0] -ne 0) { Stop-Here "master has $($counts[0]) commit(s) the branch does not. Ask Claude to bring the branch up to date first." }
    Say "$($counts[1]) commit(s) will go live:"
    git --no-optional-locks log --oneline "origin/master..$Branch"
    $tag = git --no-optional-locks ls-remote --tags origin $RestoreTag
    if (-not $tag) { Stop-Here "The restore tag $RestoreTag is not on GitHub." }
    Say "Restore point is on GitHub: $RestoreTag" 'Green'
    Say 'Next: ...ship-client-identity.ps1 golive' 'Green'
  }
  'golive' {
    Say "Pushing $Branch to master. Render deploys the app to trainers."
    $answer = Read-Host 'Type GO to push'
    if ($answer -ne 'GO') { Stop-Here 'Nothing pushed.' }
    git push origin "${Branch}:master"
    if ($LASTEXITCODE -ne 0) { Stop-Here 'The push failed; nothing went live.' }
    Say 'Pushed. Watch the deploy finish on Render, then run: ...ship-client-identity.ps1 records' 'Green'
  }
  'records' {
    $script = Join-Path $Preview 'scripts\rehome-colliding-bookings.ts'
    Say 'Dry run: what would change (writes nothing)'
    npx tsx $script
    if ($LASTEXITCODE -ne 0) { Stop-Here 'The dry run failed; nothing was written.' }
    Write-Host ''
    Write-Host 'Expect 2 people (Barjesh Walters, Efty Simakis) and about 23 bookings.' -ForegroundColor Yellow
    $answer = Read-Host 'Type WRITE to back up and apply these to production'
    if ($answer -ne 'WRITE') { Stop-Here 'Nothing written.' }
    npx tsx $script --commit
    if ($LASTEXITCODE -ne 0) { Stop-Here 'The write stopped part-way. The backup in backups\ holds every booking as it was; tell Claude.' }
    Say 'Damage check (reads only). It should say NOTHING CROSSED.'
    npx tsx scripts\check-collision-damage.ts
  }
  'webhook' {
    Say 'Deploying the Mindbody webhook only, to PRODUCTION (gen-lang-client-0731527386)'
    $answer = Read-Host 'Type GO to deploy'
    if ($answer -ne 'GO') { Stop-Here 'Nothing deployed.' }
    Push-Location $Preview
    try {
      # Named, not assumed: the Firebase CLI remembers the active project per
      # FOLDER, and this copy of the repo never had one chosen.
      firebase deploy --only functions:mindbodyWebhook --project prod
      if ($LASTEXITCODE -ne 0) { Stop-Here 'The deploy failed; the old webhook is still running.' }
    } finally { Pop-Location }
    Say 'Webhook deployed.' 'Green'
  }
}
