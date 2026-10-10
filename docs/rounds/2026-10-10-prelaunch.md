# The pre-launch round (Oct 10 2026)

*Branch `oct10/prelaunch`, on master `7957d1a0` (live). Ships with
`scripts/ship/ship-prelaunch.ps1`. The launch checklist this round wrote is
`docs/ops/LAUNCH.md`; start there for what is left.*

## 1. What AJ asked

A check-in first (Oct 10 2026): the FileMaker developers are working on an
export; the tutorial waits until the app is finished; AJ walks the whole app
his own way rather than the numbered checklist rounds; the GitHub move into an
organization and "activating the microsoft azure stuff" wait on his bosses.
Then, on the launch: **"the november launch isnt hard set, the 3 corporate
studios will 100% be at the start but then solon will join eventually before
jan 1"**. Then, while he was away:

- "ill have to set up willoughby and westlake because they are the oldest
  studios so their machines are very different and they have a lot more"
- "create the proper reset script"
- "fix the minbody"
- "fix anything you think would benefit our project that wouldnt make us
  increase costs"

## 2. What production said (read only, Oct 10 2026)

- **Live:** Render's web service and both crons on `7957d1a` (the renewals
  job ran fine at 2:30 AM on it); the live rules are master's; all 95
  composite indexes READY, plus one the file dropped on Sep 27
  (`taskInstances (status, localDate)`), unused, costing on each write.
  Render's build command was already `npm ci && npm run build`.
- **Cost:** about 50,000 reads and 5,300 writes in the last day; every query
  in Query Insights reads only the documents it returns (4 to 60 ms). Nothing
  to optimise there.
- **Cloud Functions:** five deployed (`mindbodyWebhook`, `onSessionRollup`,
  `recalcTrainerWindows`, `backfillTrainerRollups`, `syncTrainerClaims`); the
  three deleted on Oct 5 are gone.
- **The webhook:** healthy, events for all four studios today, no signature
  failure since Sep 28. Limbo: 16 open (12 shared-site clients whose event named
  no studio; 4 at Solon waiting for staff 100000020 to be linked).
- **The studios:** no cutover date anywhere; renewals set up only at
  Strongsville; **no floor at westlake or Willoughby**; nobody at any studio is
  a Head Trainer or above; Willoughby has no Life Transformer signed in and its
  schedule was last pulled on Sep 10. The table is in `docs/ops/LAUNCH.md`.
- **The trainer-identity report** (Gate B): 40 documents, 4 on their sign-in
  id, 36 never signed in, 0 stranded, 0 collisions. No migration.
- **The starting routines:** not seeded in the morning; AJ ran the seed at
  10:41 AM and all eleven are in.
- **Two Mindbody facts the renewals round left open**, answered from Journey's
  own synced copy (aggregates only):
  - **Tax:** the corporate studios' scheduled charges are round per-session
    amounts ($432 ×127 = 8 × $54, $480 ×31, $408 ×14...) and none of the 182
    clients with a Mindbody rate reads "special", so there is no tax in them.
    Solon's one synced contract charges $4,924.80, exactly $4,560 + 8%: check
    again when Solon syncs.
  - **"w/ Roll Over":** the option holds the whole package up front (48 ×87,
    96 ×91, 144 ×126), with a companion "…w/ Roll Over Payments" option holding
    0 sessions. The renewals engine already counts an up-front issue
    (`issuedUpFront`), for a client whose package is matched.
- **Westlake and Willoughby have no package table**, so their renewal
  snapshots match no package: sessions left is known for 24 of 291 and 16 of
  266 clients.

## 3. "Fix the Mindbody"

The worry was that the webhook's signing secret is readable in the public
repo's history (commit `c53b3e2`, Aug 29, removed it going forward only). It
is, and it matches the `MINDBODY_WEBHOOK_SECRET` in AJ's `.env`; but it is
**not the live one**. Mindbody issues a secret when a subscription is made;
the five subscriptions for the webhook are four deactivated ones and the
active `6ffaebd1`, which carries the contract events but not
`appointmentBooking.updated` (listed from Sep 25), so it was made by
`ship-sep24`'s `webhooks-on` on Sep 24: that step writes the new secret to a
temp file and from there straight into Firebase, never into `.env` or git.
Every delivery since has verified against Firebase's secret, so it is that
subscription's, not the August one.
The Mindbody API key and login in use also differ from the history's
(checked by comparison only; no secret printed). So nothing live is exposed,
and the `.env` value is a dead key (only the server's test button signs with
it, and the webhook refuses that, as it should).

The real fault was elsewhere: **the live subscription lacks
`appointmentBooking.updated` and `clientSale.created`**, because it was made
the day before the first joined the list and two days before the second (the
cost plan's "packages when a sale happens"). The lean-sync ship only made a new
subscription when none was active, so neither was ever added. Today a changed
appointment waits for the next 30-minute pull, and a sale never marks a client
for the nightly package pull.

`scripts/mindbody/register-webhook.js --update-events <id>` (commit
`94559960`) says what a subscription lacks and stops; with
`--yes-affect-production` it PATCHes it to what it has plus what it lacks, keeps
the subscription and its secret (nothing changes in Firebase), drops an id
Mindbody refuses and tries the rest, then reads it back. The script's default
mode used to PATCH the list alone, which would have dropped the contract events
the live subscription carries; it now keeps what a subscription has. Checked
against Mindbody (look only): `6ffaebd1` is Active with 12 events and lacks
exactly those two. Cost: the webhook's events are free to receive; a sale's
mark leads to one package pull for that client on the night after the cutover
(two calls, $0.004).

## 4. What was built

On `oct10/prelaunch`, one commit per piece:

| Commit | What |
| --- | --- |
| `94559960` | Mindbody: `--update-events` (above) |
| `5ba05d60` | `docs/ops/LAUNCH.md` (each studio's state and the order of what is left), `docs/ops/TRAINER-QUICK-START.md` (the first huddle's page), `docs/ops/DEPLOYS-AND-ROLLBACK.md` (when, the order, the checks, and the way back for the app, the rules, a function and the data) |
| `17b08864` | `ROADMAP.md`: the status as of today and Gate B as today's checks left it |
| `57e2d7ab` | CI's typecheck gate is 2 (it was 11, so nine new errors could pass) |
| `3bb20c8c` | `compression` 1.8.2 (GHSA-vc2v-76pw-4v95); the lock also drops `node-ical`, which left `package.json` on Sep 19. **Run `npm ci` after pulling** |
| `c2fcde01` | The cutover date's hint says what setting it turns on: every session logged in Journey, the nightly package refresh, an unlogged booking no longer a visit (the old "every client reads unknown" had been wrong since Sep 26) |
| `89183e9f` | `scripts/purge-database.ts` removed: it deleted clients, studios and trainers behind one flag, and a round document had called it dry-run by default |
| `919884f0` | **Rules: access requests.** A request (a stranger's name, email and phone) was readable by anyone signed in, and anyone with a Google account can sign in. Now its sender reads it, and so do the people who let people in (anyone who runs a studio, owners, administrators); a new request must be signed in at the person's own id; and a requester can no longer rewrite someone else's studio request by naming themselves. `request-readers.ts` mirrors the rule so no iPad opens a listener it refuses |
| `8f9854b5` | "PC build · live data": one plum line on every screen of a development build (`npm run dev` talks to production); never in a production or perf-lab build |
| `06fc2f9d` | Three stale facts (the Note for the next trainer is four sessions; Models is under Admins → Standard → Machines) |
| *(the reset script)* | *see §5* |

## 5. The reset script

*(Filled in when its branch is merged.)*

## 6. How to ship

`scripts/ship/ship-prelaunch.ps1`, from `.claude\worktrees\prelaunch`:
`-Stage prepare` (changes nothing), then `-Stage golive` (the rules tests, the
rules, checked live; the restore tag `restore/2026-10-10-before-prelaunch`;
the push). Then by hand: `npm ci` in the project folder; Render's three
presses; the Mindbody step (`--update-events`, look first). The rules take
access away, so they go with the push and Render on the same evening; the
live app before this round reads requests only where the new rules allow,
except a non-leader opening My Studio → Team inside Demo Mode, who sees an
error toast until Render's deploy.

## 7. For AJ to decide

1. **The 24 trainer documents with no role and no sign-in** (Mindbody staff
   placeholders made by hand before the claim flow) count as "works here", so
   they appear in team lists (Relay, standing weeks, Team, Openings) and can't
   claim their document when that person signs in. The smallest fix is data
   only: stamp them `pendingClaim: true` with a dry-run-first script (every
   list already honours the flag, and it brings the claim path back). Not done:
   it is a production write AJ hasn't asked for.
2. **Who reads access requests**: anyone who runs a studio, not only the
   requested studio's leaders. Narrowing it needs Team's query to name the
   studio and a new index. The same breadth already held for approving.
3. **On launch day, does FileMaker stop, or run alongside?** It sets the
   cutover date.
4. **The reset's optional groups** (machine settings, routines, Pulse): its
   dry run counts them, so this can wait for the numbers.

## 8. Parking list

- **Clearing the old working copies.** 78 worktrees under
  `.claude\worktrees`; 76 are on master already. A few hold git-ignored round
  material (harness previews and prototypes, logs, two `backups` folders) to
  move to an archive first, and every one's `node_modules` is a junction to the
  main checkout's, which a careless delete follows. One yes from AJ, then done
  carefully.
- **The `.env`'s dead `MINDBODY_WEBHOOK_SECRET`** (and Render's copy, if it
  has one) can be removed; harmless either way.
- **The four deactivated subscriptions** can be deleted
  (`register-webhook.js --delete-except 6ffaebd1-2086-41ad-a999-d3edf8ab481f
  --yes-affect-production`): tidier for the nightly subscription check, no
  effect on the live one.
- **Render's Rollback button** on this service is untried
  (`docs/ops/DEPLOYS-AND-ROLLBACK.md` says so).

## 9. For CLAUDE.md after the trim

- `firebase-applet-config.json`'s project id **is** the live project's
  (`gen-lang-client-0731527386`), and `src/firebase.ts` initialises from it:
  the Environments line saying it is not the live one is out of date.
- Map: `docs/ops/LAUNCH.md` (the launch checklist), `docs/ops/DEPLOYS-AND-ROLLBACK.md`,
  `docs/ops/TRAINER-QUICK-START.md`; `scripts/reset-test-data.ts` and its
  runbook; `src/features/environment-mark/`.
- Security rules: access requests are read by their sender and the people who
  let people in (`request-readers.ts` mirrors it).
- Mindbody: the live subscription is `6ffaebd1` (Sep 24); add an event with
  `register-webhook.js --update-events`, never a new subscription (a new one
  means a new secret in Firebase and a redeploy).
- "The GitHub repo belongs to the MaxStrengthFitness organization": it is a
  personal account until the move AJ's bosses are arranging.
