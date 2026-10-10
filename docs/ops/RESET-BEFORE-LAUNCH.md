# The reset before launch: wiping the test sessions

AJ, Oct 7 2026: "any session currently in journey will be wiped before we enter into beta". Every session in Journey today is a test. This page is how to wipe them, and everything that was built from them, without touching the people, the bookings, the packages, the studios, the machines or the trainers.

The script is `scripts/reset-test-data.ts`. What it takes and what it leaves is decided in `src/lib/test-reset.ts` (read its header for the reasons); the backup and the way back are `src/lib/test-reset-codec.ts`. It never deletes a client, a trainer or a studio. (If an old `scripts/purge-database.ts` ever turns up in a copy of the project, never run it: it deleted clients, studios and trainers.)

## When

**Two days before launch**, after the last iPad walk, and **before the studios' cutover dates are set**. Not between 2 and 4 in the morning (the nightly jobs run then). Give it half an hour with nobody training.

Once a studio has a cutover date, real sessions may be in Journey, and the reset would take them too. So the script refuses to commit while any studio (Demo Mode aside) has one, unless you add `--after-cutover`. Don't, unless you are sure.

## What it does, in one breath

It deletes every session outside Demo Mode (open, unfinished and finished) and its sets, the client notes and FORD details written in a session, the machine totals a session builds, the trainers' session counts, and the nightly job's documents that remember the sessions (the job writes them again). On each client the sessions touched, it puts the counters back to what a new client starts with. It keeps everything else.

It never writes a whole client back. It changes the fields it names, one by one, and leaves every other field as it was.

Before it writes anything it saves a copy of every document it will delete and every field it will change, in `backups\reset-<time>\`. The same script puts them back from that copy (see [If something goes wrong](#if-something-goes-wrong)).

**Demo Mode** (the practice studio) is left out unless you ask for it: it has its own **Reset** button in the app.

## What you choose: the optional groups

The always part is the sessions and what they built. The rest are your call. The dry run counts every one of them, so you decide with numbers. You name the ones you want with `--also`, separated by commas.

| Group | What it takes | Production, Oct 10 2026 |
| --- | --- | --- |
| *(always)* | Sessions, sets, the notes and FORD details written in a session, machine totals, the counters on clients the sessions touched, trainers' session counts, the nightly job's records | 276 sessions (5 never finished), 1,820 sets, 12 notes (6 of the old kind), 30 machine totals, counters on 17 clients, the last visit and coach on 14 renewal snapshots, 17 first-session dates, 15 last-session days, 10 trainers' counts, 16 month tallies |
| `settings` | The **weights** on each client's machine set-ups (current, starting, next). The seat and pad settings stay. | 219 weights on 79 set-ups |
| `settings-all` | The machine set-ups **whole**, seat and pad settings included | 108 set-ups |
| `setting-history` | The record of setting changes on each machine (before `--before`, default now) | 34 records, and 33 of an older kind nothing reads |
| `routines` | Every routine (A and B), its plan and plan changes, the routine change records, and the B switch on those clients | 44 routines, 20 change records, the B switch on 3 clients |
| `pulse` | Progress reports and Pulse check-ins, client focuses (old ones too), the Pulse snapshot on clients | 23 reports, 5 focuses, 1 snapshot |
| `floor-notes` | The studios' notes on machines (before `--before`) | none |
| `prior-history` | "Sessions before Journey" numbers a trainer typed, and first days at the studio | none |
| `operations` | Operations and Relay records: the attendance watch list, cases, Seen marks, day logs, renewal conversations, old incident reports | 1 Seen mark |
| `imported-history` | Sessions imported from paper charts or FileMaker, with their sets. Kept unless asked: they are history, not tests. | none |
| `ford-briefing` | FORD details caught in the pre-session briefing. Kept unless asked: they carry no session, and a real one is a real fact about a client. | none |

The figures are from the read-only dry run of Oct 10 2026 (2,190 documents planned for the always part alone); yours will be the day's.

Also in that dry run, and left alone whatever you choose: **132 sessions and 926 sets in Demo Mode** (Demo Mode's Reset puts its own back), and **17 renewal outcomes already recorded** (they come from Mindbody packages, and the job never records one again).

`settings` and `settings-all`: one or the other. `settings` keeps what trainers set on each machine and drops only the weights the test sessions set; `settings-all` starts every client on every machine from nothing.

## What you need

- The PC, with PowerShell, in the project folder.
- `service-account.json` in the project folder (the same key the other data scripts use).
- The script itself. It is on the branch `oct10/reset-script` and reaches `master` only when this round ships; until then `git pull` on `master` doesn't bring it.

Open **a new PowerShell window** (so no emulator setting from earlier work is left in it) and go to the project folder:

```powershell
cd C:\Users\austi\Projects\Journey-System-Beta-master
```

```powershell
git pull
```

## Step 1: the dry run (reads only, writes nothing)

```powershell
npx tsx scripts/reset-test-data.ts --project gen-lang-client-0731527386 --database ai-studio-32cbbdcc-6e08-4770-9665-867c68878efa --confirm-project gen-lang-client-0731527386
```

**Check the first line it prints** (after npm's own notice lines). It must say:

`PRODUCTION: project gen-lang-client-0731527386, database ai-studio-32cbbdcc-6e08-4770-9665-867c68878efa`

If it says `EMULATOR`, this window still has an emulator setting: close it and open a new one. The script refuses a command that names production while an emulator is set, refuses anything but this project and this database, and stops on any flag it doesn't know (a typo never slips through).

Then it prints, group by group, what it would delete or change, what it would leave in Demo Mode, when the test sessions began, the ids of the clients whose first-session date it would clear, a short "Left alone" list for you to look at, any studio past its cutover, and any session still open. It prints ids and counts, never a client's name or a note's words.

It ends with the number that matters:

`PLANNED: 2,190 documents (...)` and `To commit exactly this, add: --commit --expect 2190`

Write the number down. The real run refuses unless you give it that number, so it can only do what you just read.

Read the **Open sessions** line too. A session with a sign of life in the last 12 hours stops the real run (an iPad in the middle of a session would send it back). Finish it or discard it on the iPad first.

## Step 2: the room

Before the real run:

- Nobody is in a session on any iPad or phone, at any studio.
- Every iPad has been online with Journey open for a minute since its last session, so anything it was holding has been sent.
- It is not between 2 and 4 in the morning.

## Step 3: the real run

The same command with `--also` naming your groups (if any), then `--commit --expect` and the number **that** dry run printed. A dry run with different `--also` prints a different number: run the dry run with the same `--also` you will commit with. For example, the sessions plus the set-up weights and the routines (use your own number):

```powershell
npx tsx scripts/reset-test-data.ts --project gen-lang-client-0731527386 --database ai-studio-32cbbdcc-6e08-4770-9665-867c68878efa --confirm-project gen-lang-client-0731527386 --also settings,routines --commit --expect 2400
```

Just the sessions and what they built (use your own number):

```powershell
npx tsx scripts/reset-test-data.ts --project gen-lang-client-0731527386 --database ai-studio-32cbbdcc-6e08-4770-9665-867c68878efa --confirm-project gen-lang-client-0731527386 --commit --expect 2190
```

If the number no longer matches (someone trained in between, the nightly job ran), it refuses and writes nothing: run the dry run again and look.

It prints, in this order:

1. **Backup:** the folder it saved the copy in. Write it down.
2. **POINT-IN-TIME RECOVERY:** the exact moment before its first write, in **UTC** (not Ohio time), and that moment rounded **down** to the minute. Write the minute down (see below).
3. The writes. A client Mindbody updated in the minute between the read and the write is read again, planned again, backed up again and written again, up to three times, so the webhook's change is never lost and the reset still lands. Then a wait of about a minute for the trainers' session counts to settle (a Cloud Function takes one off for each counted session that goes, and the script waits for it before deleting the counts). If a trainer's old counts can't be cleared first, it stops before deleting anything.
4. **DONE:** what it did, part by part, and any document that still didn't take it.
5. **NEXT:** the check and the three commands below.

If DONE lists documents that didn't take the reset, don't run it again straight away. **The next morning**, run the dry run (Step 1) again and look: it shows only what is left, with its own number, and you commit that with **its** `--expect`. It knows when the test sessions began from this run's backup, so its dates are judged the same way.

## Step 4: check

Run the dry run from Step 1 again, with the same `--also`. Under the always part, and under every group you took, it should say **nothing** and end with `PLANNED: 0 documents` (Demo Mode is still counted apart). Do it now, before Step 5: the jobs in Step 5 write some of these documents again, from no sessions.

## Step 5: the jobs, so every screen agrees

Run these three, in this order. Each one without `--commit` first if you want to see what it will do.

```powershell
npx tsx scripts/rebuild-machine-fit.ts --commit
```

```powershell
npx tsx scripts/run-machine-trends.ts --commit
```

```powershell
npx tsx scripts/run-renewals.ts --commit --max-pulls 0 --first-sync-max 0
```

The first rebuilds the machine-fit index from the set-ups that are left. The second rebuilds machine trends, the Kaizen reports, the performance watch and Openings from no sets. The third writes every renewal snapshot and month count again; `--max-pulls 0 --first-sync-max 0` means it asks Mindbody nothing. Before a studio's cutover it writes no client states and no Journey summary for it: those start the night after the cutover.

The nightly jobs and the trainers' 3 AM counts carry on by themselves from that night.

## Step 6: the iPads

Sign every iPad out and back in, so no screen keeps the old numbers in memory. If you used `--include-demo`, open Demo Mode and press **Reset**.

## What trainers will see after

- Every client's Journey starts at their first real session. A long-time client still shows Mindbody's count ("#312", from Mindbody) until a trainer confirms it.
- A machine reads as the client's first time on it until they do it for real. Unless you take `settings`, the weight a test session left on a set-up is still the one the next session starts from.
- Trainers' session counts start again from nothing.
- Operations judges no client until there are real sessions behind them.

## If something goes wrong

**Put it back from the backup** (first net). Dry run first: it says what it would put back.

```powershell
npx tsx scripts/reset-test-data.ts --project gen-lang-client-0731527386 --database ai-studio-32cbbdcc-6e08-4770-9665-867c68878efa --confirm-project gen-lang-client-0731527386 --restore backups\reset-2026-11-02T14-05-12-345Z
```

```powershell
npx tsx scripts/reset-test-data.ts --project gen-lang-client-0731527386 --database ai-studio-32cbbdcc-6e08-4770-9665-867c68878efa --confirm-project gen-lang-client-0731527386 --restore backups\reset-2026-11-02T14-05-12-345Z --commit
```

(Use the folder name the reset printed.) It re-creates every deleted document exactly, with the same ids, dates and values, and puts back every changed field. **It never overwrites anything**: a document that exists again, or a field that has changed since the reset, is left alone and listed. So restore **before** new real sessions are written; after that, the new sessions win and the old ones that clash are skipped. Afterwards run the three Step 5 commands again.

**More than one backup folder** (a second run the next morning writes its own): restore them **newest first**, then the one before. That is the undo order. A field a later run cleared comes back to its latest value; the earlier run's restore then finds it no longer as that run left it, and skips it. The other way round, the earlier run would put back the older value first. The restore says so when a newer backup of the same database sits beside the one you named.

**After 3 AM, the trainers' counts stay out.** The 3 AM job makes every trainer a counts document again each night, so a restore after that finds one there and leaves the old one in the backup. After such a restore: in the app, **Admins → Machinery → System tools → Rebuild trainer rollups → Rebuild**. It counts every session again (the restored ones included).

**Firestore's point-in-time recovery** (second net). For 7 days, Google keeps every minute of the database. It is **not** a rewind of the live database: from Google Cloud (Firestore, Disaster recovery) a project owner can **export** the database as it was at a minute, or **clone** it into a **new** database, and copy what is needed back from there. Ask for the minute the reset printed (UTC, rounded down), which is before its first write. It is the last resort, and a job for whoever owns the Google Cloud project.

**The backup holds client data.** `backups\` is never committed (it is in `.gitignore`). Keep the folder on the PC until a month after launch, then delete it.

## What it never touches

Clients and everything Mindbody owns on them, bookings and late-cancel marks, packages and contracts, studios and their settings, rosters, standing weeks, Openings, machines and the catalog, routine presets (the Academy's starting routines), trainers and their notifications, announcements, InBody scans, shared notes, renewal cycles, Limbo and the Mindbody logs.

## For the record: what decides what

`src/lib/test-reset.ts` names every part and the rule behind it. The ones that needed a decision:

- A note goes with its session when it carries the session's id, **including a session already gone** (Discard and History's delete leave notes behind), or when it was written in a session with no id on it (a machine card's note). Every update on such a note goes too, written anywhere, down the whole thread; an update never takes its root. An old-style session note with no session on it reads as a profile note, and stays.
- A client is **touched** by the sessions when a session or set of theirs goes, a machine map holds something (an empty one is written just by opening Programming, and doesn't count), or a counter only a session moves does. Only a touched client's counters change: `completedSessions` back to 0 and `sessionCount` back to the prior record's sessions (or 0), as Add Client and every Mindbody door make a client; the lifetime totals, the tally and the top trainer go, as a new client has none. On their renewal snapshot only the last visit (carried night to night) and the coach (read when an outcome is recorded) go; the rest the job works out again, and the package and cycle stay for tonight's outcomes.
- Dates are judged against when the test sessions began (the day before the first was written; a later run reads it from the first run's backup). The first-session date Start wrote goes; one from before then, or one typed on the old client form (an Ohio midnight to the second), stays. A first visit backfilled from Journey's sessions goes only while it still holds a date from then (the webhook can write Mindbody's real one over it). The last-session day goes when it is Journey's (a plain day); Mindbody's (a day and a time) stays.
- A "sessions before Journey" record goes when it was the profile's **Confirm** made after a test session (Mindbody's count **less** the tests): for a touched client, or with its "through" day in the test sessions' time. A Confirm made before the client had any Journey session ("through" is the day it was recorded) took nothing off and stays. One a trainer typed stays unless `prior-history` is asked for.
- The FORD summary is worked out again from the details that stay, for a client who loses one and for any whose stored summary no longer matches what is left.
- Leaders' Seen marks and trainers' "no need to remind me" on the notes that go, go with them.
- Trainers' old counts map goes before anything else (whatever else changed on the trainer, since nothing writes that map any more), and the counts document after the Cloud Function has settled, so the function can't copy the old total back.

## How it was proved

On the perf lab's emulator (never production): a 40-client studio with a year of sessions plus a fixture of every case above. The dry run, the refusals (a typo in a flag, the emulator with the production project, production without the database or without the project twice, no `--expect`, the wrong `--expect`, a studio past its cutover, a session open 30 minutes before), the reset, a second dry run that finds nothing, and a restore after which a fingerprint of the whole database (every path and every value, types included) equals the one before, for the always part and for every group with Demo Mode. A client and a session changed between the read and the write (`RESET_PROOF_TOUCH`, which the script reads only on an emulator): both were read and written again, and the restore put back the client's counters while keeping the newer values the change had written. Then the three Step 5 jobs.
