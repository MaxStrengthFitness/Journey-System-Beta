<#
.SYNOPSIS
  Ships the Sep 24 2026 round (branch sep24-round): the client-profile fixes,
  the leftover-duplicate merge, and turning the Mindbody webhook back on.
  docs/rounds/2026-09-23-client-identity.md is the round.

.DESCRIPTION
  Run from the project folder, IN ORDER:

    powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-sep24.ps1 check
    powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-sep24.ps1 golive
    powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-sep24.ps1 merge
    powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-sep24.ps1 webhooks-check
    powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-sep24.ps1 webhooks-on
    powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-sep24.ps1 webhooks-on -Site 29068

  check          reads only: the branch is a fast-forward of master; what goes live.
  golive         pushes sep24-round to master. RENDER DEPLOYS THE APP TO TRAINERS.
  merge          the duplicate-record merge: dry run, asks, then writes (backup first).
  webhooks-check reads only: what Mindbody has registered for each site, and
                 whether the signing secret matches the one Firebase holds
                 (compared by fingerprint -- no secret is ever shown).
  webhooks-on    re-activates the subscription with the full event list, then
                 makes Firebase's secret match it and redeploys the webhook if
                 it did not. Solon's site by default; -Site 29068 for the other,
                 which only goes ahead if it is the SAME subscription.

  To undo the app: git reset --hard restore/2026-09-23-before-client-identity
  (or the commit before this round) and push. ASCII only on purpose.
#>
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('check', 'golive', 'merge', 'webhooks-check', 'webhooks-on')]
  [string]$Stage,
  [string]$Site = '5746957'
)

$ErrorActionPreference = 'Stop'
$Branch = 'sep24-round'
$Register = 'scripts\mindbody\register-webhook.js'

function Say([string]$text, [string]$color = 'Cyan') { Write-Host ''; Write-Host ('== ' + $text) -ForegroundColor $color }
function Stop-Here([string]$why) { Write-Host ''; Write-Host ('STOPPED: ' + $why) -ForegroundColor Red; exit 1 }
function Fingerprint([string]$secret) {
  if (-not $secret) { return '(none)' }
  $sha = [Security.Cryptography.SHA256]::Create()
  $bytes = $sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($secret.Trim()))
  return (($bytes | ForEach-Object { $_.ToString('x2') }) -join '').Substring(0, 10)
}
function Mindbody-Secret([string]$site) {
  $out = & node $Register --secret-only --site $site 2>$null
  if ($LASTEXITCODE -ne 0) { return $null }
  return ($out -join '').Trim()
}
function Firebase-Secret {
  $out = & firebase functions:secrets:access MINDBODY_WEBHOOK_SECRET --project prod 2>$null
  if ($LASTEXITCODE -ne 0) { return $null }
  return (($out | Where-Object { $_ -and $_.Trim() }) | Select-Object -Last 1).Trim()
}

if (-not (Test-Path 'service-account.json')) { Stop-Here 'Run this from the project folder (the one with service-account.json).' }

switch ($Stage) {
  'check' {
    git --no-optional-locks fetch -q origin
    $counts = (git --no-optional-locks rev-list --left-right --count "origin/master...$Branch").Trim() -split '\s+'
    if ([int]$counts[0] -ne 0) { Stop-Here "master has $($counts[0]) commit(s) the branch does not. Ask Claude to bring the branch up to date." }
    Say "$($counts[1]) commit(s) will go live:"
    git --no-optional-locks log --oneline "origin/master..$Branch"
    Say 'Next: ship-sep24.ps1 golive' 'Green'
  }
  'golive' {
    Say "Pushing $Branch to master. Render deploys the app to trainers."
    if ((Read-Host 'Type GO to push') -ne 'GO') { Stop-Here 'Nothing pushed.' }
    git push origin "${Branch}:master"
    if ($LASTEXITCODE -ne 0) { Stop-Here 'The push failed; nothing went live.' }
    Say 'Pushed. Next: ship-sep24.ps1 merge' 'Green'
  }
  'merge' {
    Say 'Dry run: the leftover duplicate records (writes nothing)'
    npx tsx scripts\merge-duplicate-client-records.ts
    if ($LASTEXITCODE -ne 0) { Stop-Here 'The dry run failed; nothing was written.' }
    Write-Host ''
    Write-Host 'Expect 16 people, all ready (Heather Corlett, Deena Epstein, ...).' -ForegroundColor Yellow
    if ((Read-Host 'Type WRITE to back up and merge them') -ne 'WRITE') { Stop-Here 'Nothing written.' }
    npx tsx scripts\merge-duplicate-client-records.ts --commit
    if ($LASTEXITCODE -ne 0) { Stop-Here 'The merge stopped part-way. It is safe to run again; the backup is in backups\. Tell Claude.' }
    Say 'Merged. Re-run the dry run any time: it should find 0.' 'Green'
  }
  'webhooks-check' {
    foreach ($s in '5746957', '29068') {
      Say "What Mindbody has registered for site $s (reads only)"
      node $Register --list --site $s
    }
    $fb = Firebase-Secret
    $mb = Mindbody-Secret '5746957'
    Say ('Firebase secret fingerprint: ' + (Fingerprint $fb))
    Say ('Solon subscription secret fingerprint: ' + (Fingerprint $mb))
    if (-not $fb) { Write-Host 'Could not read the Firebase secret (run: firebase login).' -ForegroundColor Yellow }
    elseif ($fb.Trim() -eq "$mb".Trim()) { Say 'MATCH: the webhook can verify what Mindbody sends.' 'Green' }
    else { Say 'MISMATCH: the webhook rejects what Mindbody sends. webhooks-on fixes it.' 'Yellow' }
  }
  'webhooks-on' {
    if ($Site -ne '5746957') {
      $solon = Mindbody-Secret '5746957'
      $other = Mindbody-Secret $Site
      if (-not $other) { Stop-Here "Site $Site has no subscription for this webhook. Tell Claude before creating one: the webhook holds ONE secret." }
      if ($other -ne $solon) { Stop-Here "Site $Site has its OWN subscription with a different secret. The webhook holds one secret; tell Claude." }
    }
    Say "Re-activating the subscription for site $Site with the full event list. Real events start arriving."
    if ((Read-Host 'Type GO to activate') -ne 'GO') { Stop-Here 'Nothing changed.' }
    node $Register --site $Site --yes-affect-production
    if ($LASTEXITCODE -ne 0) { Stop-Here 'Mindbody refused the change; see above.' }

    $fb = Firebase-Secret
    $mb = Mindbody-Secret $Site
    if (-not $mb) { Stop-Here 'Could not read the subscription secret back from Mindbody.' }
    if ($fb -and $fb.Trim() -eq $mb.Trim()) { Say 'Secrets match. Done: events will be verified and processed.' 'Green'; break }

    Say 'Firebase holds a different secret, so every event would be rejected. Updating it to the subscription secret (never shown), then redeploying the webhook.' 'Yellow'
    if ((Read-Host 'Type SYNC to update the secret and redeploy') -ne 'SYNC') { Stop-Here 'Secret left as it was; the webhook will reject events until it matches.' }
    $tmp = Join-Path $env:TEMP ([IO.Path]::GetRandomFileName())
    try {
      [IO.File]::WriteAllText($tmp, $mb, (New-Object System.Text.UTF8Encoding($false)))
      firebase functions:secrets:set MINDBODY_WEBHOOK_SECRET --data-file $tmp --project prod
      if ($LASTEXITCODE -ne 0) { Stop-Here 'Could not update the secret.' }
    } finally { Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue }
    firebase deploy --only functions:mindbodyWebhook --project prod
    if ($LASTEXITCODE -ne 0) { Stop-Here 'Secret updated but the redeploy failed; run it again.' }
    Say 'Secret synced and webhook redeployed. Tell Claude: it will check the health record for the first events.' 'Green'
  }
}
