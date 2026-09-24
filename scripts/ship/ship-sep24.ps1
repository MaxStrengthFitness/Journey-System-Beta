<#
.SYNOPSIS
  Ships the Sep 24 2026 round (branch sep24-round): the client-profile fixes,
  the leftover-duplicate merge, and the Mindbody webhook brought back to life.
  docs/rounds/2026-09-23-client-identity.md is the round.

.DESCRIPTION
  Run from the project folder, IN ORDER:

    powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-sep24.ps1 check
    powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-sep24.ps1 golive
    powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-sep24.ps1 merge
    powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-sep24.ps1 webhooks-check
    powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-sep24.ps1 webhooks-on

  check          reads only: the branch is a fast-forward of master; what goes live.
  golive         pushes sep24-round to master. RENDER DEPLOYS THE APP TO TRAINERS.
  merge          the duplicate-record merge: dry run, asks, then writes (backup
                 first). Safe to run again: it finds nothing once done.
  webhooks-check reads only: every subscription Mindbody holds for the webhook.
                 One subscription covers both sites (they are per developer
                 account, not per site).
  webhooks-on    starts fresh. Mindbody shows a signing secret only once, when
                 a subscription is created, and nobody kept the old ones. So:
                   1. create a new subscription; its secret goes to a temp file
                   2. that file becomes Firebase's MINDBODY_WEBHOOK_SECRET; the
                      file is deleted
                   3. redeploy the webhook (it also carries the signature fix)
                   4. activate the new subscription
                   5. delete the three dead ones
                 No secret is ever shown on screen.

  To undo the app: git reset --hard <the master commit before this round> and
  push. ASCII only on purpose (Windows PowerShell 5.1).
#>
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('check', 'golive', 'merge', 'webhooks-check', 'webhooks-on')]
  [string]$Stage
)

$ErrorActionPreference = 'Stop'
$Branch = 'sep24-round'
$Register = 'scripts\mindbody\register-webhook.js'

function Say([string]$text, [string]$color = 'Cyan') { Write-Host ''; Write-Host ('== ' + $text) -ForegroundColor $color }
function Stop-Here([string]$why) { Write-Host ''; Write-Host ('STOPPED: ' + $why) -ForegroundColor Red; exit 1 }

if (-not (Test-Path 'service-account.json')) { Stop-Here 'Run this from the project folder (the one with service-account.json).' }

switch ($Stage) {
  'check' {
    git --no-optional-locks fetch -q origin
    $counts = (git --no-optional-locks rev-list --left-right --count "origin/master...$Branch").Trim() -split '\s+'
    if ([int]$counts[0] -ne 0) { Stop-Here "master has $($counts[0]) commit(s) the branch does not. Ask Claude to bring the branch up to date." }
    if ([int]$counts[1] -eq 0) { Say 'master already has everything on the branch.' 'Green'; break }
    Say "$($counts[1]) commit(s) will go live:"
    git --no-optional-locks log --oneline "origin/master..$Branch"
    Say 'Next: ship-sep24.ps1 golive' 'Green'
  }
  'golive' {
    Say "Pushing $Branch to master. Render deploys the app to trainers."
    if ((Read-Host 'Type GO to push') -ne 'GO') { Stop-Here 'Nothing pushed.' }
    git push origin "${Branch}:master"
    if ($LASTEXITCODE -ne 0) { Stop-Here 'The push failed; nothing went live.' }
    Say 'Pushed.' 'Green'
  }
  'merge' {
    Say 'Dry run: the leftover duplicate records (writes nothing)'
    npx tsx scripts\merge-duplicate-client-records.ts
    if ($LASTEXITCODE -ne 0) { Stop-Here 'The dry run failed; nothing was written.' }
    if ((Read-Host 'Type WRITE to back up and merge what is listed (Enter to skip)') -ne 'WRITE') { Stop-Here 'Nothing written.' }
    npx tsx scripts\merge-duplicate-client-records.ts --commit
    if ($LASTEXITCODE -ne 0) { Stop-Here 'The merge stopped part-way. It is safe to run again; the backup is in backups\. Tell Claude.' }
    Say 'Merged.' 'Green'
  }
  'webhooks-check' {
    Say 'Every subscription Mindbody holds for the webhook (reads only)'
    node $Register --list --site 5746957
  }
  'webhooks-on' {
    # Native tools write progress to stderr; under 'Stop', PowerShell 5.1
    # would turn a captured stderr line into a terminating error.
    $ErrorActionPreference = 'Continue'
    Say 'Starting the Mindbody webhook fresh: new subscription, new secret, redeploy, activate, delete the dead ones.'
    Write-Host 'Real Mindbody events (clients, bookings, memberships, staff) start arriving at the end of this.' -ForegroundColor Yellow
    if ((Read-Host 'Type GO to start') -ne 'GO') { Stop-Here 'Nothing changed.' }

    $tmp = Join-Path $env:TEMP ([IO.Path]::GetRandomFileName())
    try {
      Say '1/5 Creating the new subscription'
      $out = & node $Register --fresh --secret-file $tmp --yes-affect-production 2>&1
      $out | ForEach-Object { Write-Host $_ }
      if ($LASTEXITCODE -ne 0) { Stop-Here 'Mindbody did not create a subscription; nothing else was changed.' }
      $line = $out | Where-Object { "$_" -match '^NEW_SUBSCRIPTION_ID=' } | Select-Object -Last 1
      if (-not $line) { Stop-Here 'No subscription id came back. Tell Claude.' }
      $newId = ("$line" -replace '^NEW_SUBSCRIPTION_ID=', '').Trim()
      if (-not (Test-Path $tmp) -or (Get-Item $tmp).Length -eq 0) { Stop-Here "Subscription $newId was created but its secret was not saved. Tell Claude." }

      Say '2/5 Giving Firebase the new secret (not shown)'
      firebase functions:secrets:set MINDBODY_WEBHOOK_SECRET --data-file $tmp --project prod
      if ($LASTEXITCODE -ne 0) { Stop-Here "Could not set the secret. Subscription $newId is created but NOT active, so nothing is being sent. Tell Claude." }
    } finally {
      Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
    }

    Say '3/5 Redeploying the webhook (new secret + signature fix)'
    firebase deploy --only functions:mindbodyWebhook --project prod
    if ($LASTEXITCODE -ne 0) { Stop-Here "The redeploy failed. Subscription $newId is NOT active yet; run webhooks-on again or tell Claude." }

    Say '4/5 Activating the new subscription'
    node $Register --activate $newId --yes-affect-production
    if ($LASTEXITCODE -ne 0) { Stop-Here "Activation refused. Tell Claude (subscription $newId)." }

    Say '5/5 Deleting the old subscriptions'
    node $Register --delete-except $newId --yes-affect-production

    Say "Done. Subscription $newId is active. Tell Claude: it will watch the health record for the first real event." 'Green'
  }
}
