# Launch: westlake, Strongsville, Willoughby

*The plan (AJ, Oct 10 2026): November, the date not yet set. The three
corporate studios start; Solon joins before Jan 1 2027; franchises from Jan 1
2027. Every fact below was read from production on Oct 10 2026; re-read a line
before acting on it if weeks have passed.*

## Where each studio stands (Oct 10 2026)

| | westlake | Strongsville | Willoughby | Solon (later) |
| --- | --- | --- | --- | --- |
| Machine floor in Journey | **none** | 21 machines | **none** | 20 machines |
| Renewals set up (My Studio → Studio → Renewals) | **no**: auto-renew on by default, no package table | yes: auto-renew off, 3 packages, 27 Mindbody names | **no**: as westlake | no |
| Sessions left known | 24 of 291 clients | 87 of 141 | 16 of 266 | 3 of 135 |
| Mindbody contracts synced | 286 of 291 (Oct 4) | 136 of 141 | 262 of 266 | 5 of 135 (not started) |
| A studio leader (Head Trainer or above) | **none** | **none** | **none** | none |
| Life Transformers signed in | 3 | 3 | **0** | 2 |
| Schedule last pulled from Mindbody | Oct 6 | today | **Sep 10** | Oct 9 |
| Cutover date | not set | not set | not set | not set |

Mindbody's visit count (the "before Journey" guess trainers confirm) is there
for 291 of 291, 140 of 141 and 264 of 266. The Academy's eleven starting
routines are in (seeded Oct 10). Only the app's default studio settings apply
anywhere (no studio or head-office numbers are set).

## Before launch, in order

### Now: the things that take days or other people

1. **The floors at westlake and Willoughby** (AJ: "they are the oldest studios
   so their machines are very different and they have a lot more"). My Studio →
   Machines, each machine in walking order, with its dials. Until then a
   session there shows the whole MSF catalog.
2. **A leader at each studio.** Today nobody at any studio is a Head Trainer,
   Studio Leader or Studio Owner, so only administrators can let trainers in or
   change a studio's settings. AJ approves the leaders; they let their
   trainers in on My Studio → Team.
3. **Renewals at westlake and Willoughby**: My Studio → Studio → Renewals.
   Auto-renewal **off** (corporate studios don't auto-renew; the app's default
   is on), the package table, then confirm the Mindbody package names it
   suggests. Without it, sessions left can't be worked out for most clients.
4. **Open the Hub at Willoughby once.** Its schedule hasn't been pulled from
   Mindbody since Sep 10; the pull runs from an open iPad or browser, and the
   webhook alone has been keeping it partly fresh.
5. **Mindbody: add the two missing webhook events** (`appointmentBooking.updated`,
   `clientSale.created`). The live subscription was made on Sep 24, before
   they were added, so a changed appointment waits for the next pull and a
   sale never marks a client for the nightly package pull. One command, no new
   secret: `node scripts/mindbody/register-webhook.js --update-events
   6ffaebd1-2086-41ad-a999-d3edf8ab481f --yes-affect-production` (run it once
   without the last flag first to see what it would add).
6. **Limbo**: 16 open items (Admins → Machinery → Limbo). 12 are shared-site
   clients whose event named no studio; 4 at Solon wait for Mindbody staff
   100000020 to be linked to a trainer.
7. **One unused index** costs a little on every task write:
   `taskInstances (status, localDate)`. Delete it in the Firebase console →
   Firestore → the named database → Indexes.

### Two weeks out

- The walk you do anyway, plus one Wi-Fi drop in the middle of a set.
- The last deploy before launch (`docs/ops/DEPLOYS-AND-ROLLBACK.md`).
- Trainers propose their usual week on My Profile; a leader agrees it (this
  can follow launch).

### Five days out

- **Fresh contracts.** The nightly job pulls nothing for a studio until its
  cutover date, so by November the Oct 4 sync is a month old.
  `npx tsx scripts/onboard-studio.ts --studio westlake,strongsville,willoughby --verify`,
  then one `--commit` evening for whoever it lists.
- **The nightly job's Mindbody budgets** on Render (`journey-cron-renewals` →
  Environment): `RENEWALS_MAX_PULLS` and `FIRST_SYNC_MAX`, both 0 as created on
  Oct 5 ("raise it when the first studio goes live - AJ's call", `render.yaml`).
  At 0 the job pulls nothing even after the cutover, so packages go stale.
  About 100 pulls is at most $0.40 a night; the first-booking sync is 5 calls
  ($0.01) a new client. Raise them the day before the cutover.

### Two days out

- **The reset**: `docs/ops/RESET-BEFORE-LAUNCH.md`. Every iPad online, synced,
  no session open; dry run, then commit, then the three follow-up jobs; sign
  every iPad out after. From here on, practise only in Demo Mode. Today's dry
  run: 276 test sessions and 1,820 sets with their notes and counters, 2,190
  documents in all; Demo Mode's 132 left alone. It backs up everything first,
  can put it all back, commits only with `--expect` set to its dry run's
  count, and refuses once a cutover date is set.

### The day before

- **Set each studio's cutover date to launch day** (My Studio → Studio →
  Details). From that day every session must be logged in Journey (an unlogged
  booking shows as "not logged"), and the nightly job starts refreshing that
  studio's packages from Mindbody.

### Launch day

- Trainers: `docs/ops/TRAINER-QUICK-START.md`.

## Before Jan 1 2027

- **Solon**: its contracts sync (about a week of nightly runs), its renewals
  setup, a leader, then its own five-days-out to the day before.
- **The franchise partition** in the rules (today a franchise owner's access is
  company-wide).
- **CI as a required check** on `master` (needs the repo owner, or the move
  into an organization).

## Settled on Oct 10 2026

- **Mindbody's webhook secret is not exposed.** The secret readable in the
  public repo's history belongs to the August subscriptions, all deactivated;
  the live one (made Sep 24) has its own, which only Firebase holds, and every
  delivery since has verified. The API key and login in use differ from the
  history's too.
- **No tax in the corporate studios' charges** ($432 = 8 × $54), so the rate
  reads right; Solon's one synced contract looks like $4,560 plus 8%, to check
  when Solon syncs.
- **"w/ Roll Over" options hold the whole package up front** (48, 96 or 144),
  with a companion "…Payments" option holding 0; the renewals engine already
  counts that.
- **Microsoft sign-in is held to @maxstrengthfitness.com** by the app; Google
  sign-ins wait for a person to let them in.

## Still yours to answer

1. **On launch day, does FileMaker stop, or run alongside for a while?** From
   the cutover date every booking not logged in Journey reads "not logged", so
   the cutover is the day Journey becomes the record.
2. **The reset: keep or wipe what was typed on real clients while testing?**
   Today: 44 routines (and 20 adjustments), the weights on 79 machine set-ups
   (the set-ups themselves can stay), 23 Pulse reports. Each is its own
   choice at run time (`--also routines,settings,pulse`); by default all of
   it stays and only the sessions and what was counted from them go.
