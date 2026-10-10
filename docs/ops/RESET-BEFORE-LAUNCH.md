# The reset before launch: wiping the test sessions

AJ, Oct 7 2026: "any session currently in journey will be wiped before we enter into beta". Every session in Journey today is a test. This page is how to wipe them, and everything that was built from them, without touching the people, the bookings, the packages, the studios, the machines or the trainers.

The script is `scripts/reset-test-data.ts`. What it takes and what it leaves is decided in `src/lib/test-reset.ts` (read its header for the reasons); the backup and the way back are `src/lib/test-reset-codec.ts`. **It is not `scripts/purge-database.ts`**, which deletes clients, studios and trainers. Never run that one.

## When

**Two days before launch**, after the last iPad walk, and **before the studios' cutover dates are set**. Not between 2 and 4 in the morning (the nightly jobs run then). Give it half an hour with nobody training.

## What it does, in one breath

It deletes every session outside Demo Mode (open, unfinished and finished) and its sets, the client notes and FORD details written in a session, the client counters and machine totals a session builds, the trainers' session counts, and the nightly job's documents that remember the sessions (the job writes them again). It keeps everything else.

It never writes a whole client back. It deletes the fields it names, one by one, and leaves every other field as it was.

Before it writes anything it saves a copy of every document it will delete and every field it will change, in `backups\reset-<time>\`. The same script puts them back from that copy (see [If something goes wrong](#if-something-goes-wrong)).

**Demo Mode** (the practice studio) is left out unless you ask for it: it has its own **Reset** button in the app.

## What you choose: the optional groups

The always part is the sessions and what they built. The rest are your call. The dry run counts every one of them, so you decide with numbers. You name the ones you want with `--also`, separated by commas.

| Group | What it takes | Production, Oct 10 2026 |
| --- | --- | --- |
| *(always)* | Sessions, sets, the notes and FORD details written in a session, client counters and machine totals, trainers' session counts, the nightly job's records | 276 sessions (5 of them never finished), 1,820 sets, 13 notes (7 of the old kind), 30 machine totals, the counters on the 30 clients the sessions touched (and the renewal snapshot on 28 of them), 17 first-session dates, 10 trainers' counts, 40 month tallies |
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

The figures are from the read-only dry run of Oct 10 2026; yours will be the day's.

Also in that dry run, and left alone whatever you choose: **132 sessions and 926 sets in Demo Mode** (Demo Mode's Reset puts its own back), and **17 renewal outcomes already recorded** (they come from Mindbody packages, and the job never records one again).

`settings` and `settings-all`: one or the other. `settings` keeps what trainers set on each machine and drops only the weights the test sessions set; `settings-all` starts every client on every machine from nothing.

## What you need

- The PC, with PowerShell, in the project folder.
- `service-account.json` in the project folder (the same key the other data scripts use).
- The latest code: this script reached `master` with the branch `oct10/reset-script`.

Open PowerShell and go to the project folder:

```powershell
cd C:\Users\austi\Projects\Journey-System-Beta-master
```

```powershell
git pull
```

## Step 1: the dry run (reads only, writes nothing)

```powershell
npx tsx scripts/reset-test-data.ts --project gen-lang-client-0731527386 --confirm-project gen-lang-client-0731527386
```

It asks you to type the project id twice so it can never point at the wrong database by accident. It prints, group by group, what it would delete or change, what it would leave in Demo Mode, a short "Left alone" list for you to look at, and any session still open. It prints ids and counts, never a client's name or a note's words.

Read the **Open sessions** line. A session with a sign of life in the last 12 hours stops the real run (an iPad in the middle of a session would send it back). Finish it or discard it on the iPad first.

## Step 2: the room

Before the real run:

- Nobody is in a session on any iPad or phone, at any studio.
- Every iPad has been online with Journey open for a minute since its last session, so anything it was holding has been sent.
- It is not between 2 and 4 in the morning.

## Step 3: the real run

The same command with `--commit`, and `--also` naming your groups. For example, the sessions plus the set-up weights and the routines:

```powershell
npx tsx scripts/reset-test-data.ts --project gen-lang-client-0731527386 --confirm-project gen-lang-client-0731527386 --also settings,routines --commit
```

Just the sessions and what they built:

```powershell
npx tsx scripts/reset-test-data.ts --project gen-lang-client-0731527386 --confirm-project gen-lang-client-0731527386 --commit
```

It prints, in this order:

1. **Backup:** the folder it saved the copy in. Write it down.
2. **POINT-IN-TIME RECOVERY:** the exact time before its first write. Write it down too (see below).
3. The writes, then a wait of about a minute for the trainers' session counts to settle (a Cloud Function takes one off for each counted session that goes, and the script waits for it to finish before deleting the counts).
4. **DONE:** what it did, part by part. If a line says some did not land (usually "changed since it was read", a client Mindbody updated in that minute), run the same command again: it takes only what is left.
5. **NEXT:** the three commands in Step 5.

## Step 4: check

Run the dry run from Step 1 again, with the same `--also`. Under the always part, and under every group you took, it should say **nothing** (Demo Mode is still counted apart). Do it now, before Step 5: the jobs in Step 5 write some of these documents again, from no sessions.

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

The first rebuilds the machine-fit index from the set-ups that are left. The second rebuilds machine trends, the Kaizen reports, the performance watch and Openings from no sets. The third writes every renewal snapshot, client state and month count again; `--max-pulls 0 --first-sync-max 0` means it asks Mindbody nothing.

The nightly jobs and the trainers' 3 AM counts carry on by themselves from that night.

## Step 6: the iPads

Sign every iPad out and back in, so no screen keeps the old numbers in memory. If you used `--include-demo`, open Demo Mode and press **Reset**.

## What trainers will see after

- Every client's Journey starts at their first real session. A long-time client still shows Mindbody's count ("#312", from Mindbody) until a trainer confirms it.
- A machine reads as the client's first time on it until they do it for real. Unless you take `settings`, the weight a test session left on a set-up is still the one the next session starts from.
- Trainers' session counts start again from nothing.
- Operations judges no client until there are real sessions behind them.

## If something goes wrong

**Run it again.** Every run takes only what is left, so a run that stopped half way is finished by running the same command again.

**Put it back from the backup** (first net). Dry run first: it says what it would put back.

```powershell
npx tsx scripts/reset-test-data.ts --project gen-lang-client-0731527386 --confirm-project gen-lang-client-0731527386 --restore backups\reset-2026-11-02T14-05-12-345Z
```

```powershell
npx tsx scripts/reset-test-data.ts --project gen-lang-client-0731527386 --confirm-project gen-lang-client-0731527386 --restore backups\reset-2026-11-02T14-05-12-345Z --commit
```

(Use the folder name the reset printed.) It re-creates every deleted document exactly, with the same ids, dates and values, and puts back every changed field. **It never overwrites anything**: a document that exists again, or a field that has changed since the reset, is left alone and listed. So restore **before** new real sessions are written; after that, the new sessions win and the old ones that clash are skipped. Afterwards run the three Step 5 commands again.

**Firestore's point-in-time recovery** (second net). For 7 days after the reset, Google can bring the whole database back to any minute, and the reset printed the minute just before its first write. This is a project-owner job in the Google Cloud console (Firestore, Disaster recovery) and it rolls back **everything** since that minute, so it is the last resort.

**The backup holds client data.** `backups\` is never committed (it is in `.gitignore`). Keep the folder on the PC until a month after launch, then delete it.

## What it never touches

Clients and everything Mindbody owns on them, bookings and late-cancel marks, packages and contracts, studios and their settings, rosters, standing weeks, Openings, machines and the catalog, routine presets (the Academy's starting routines), trainers and their notifications, announcements, InBody scans, shared notes, renewal cycles, Limbo and the Mindbody logs.

## For the record: what decides what

`src/lib/test-reset.ts` names every part and the rule behind it. The ones that needed a decision:

- A note goes with its session when it carries the session's id, **including a session already gone** (Discard and History's delete leave notes behind), or when it was written in a session with no id on it (a machine card's note). Every update on such a note goes too, written anywhere, down the whole thread; an update never takes its root.
- A client's counters and renewal snapshot are cleared only for a client the sessions touched (a session of theirs, a set, machine totals, or a counter only a session moves). A client the intake or Mindbody made keeps their zeros, and keeps a renewal snapshot that may remember a real visit from months ago.
- The first-session date goes when it falls after Journey's first session was written; an older one was typed on the old client form and stays. The last-session day goes when it is Journey's (a plain day); Mindbody's (a day and a time) stays. A first visit goes only when it was backfilled from Journey's sessions.
- A "sessions before Journey" record goes when it was the profile's **Confirm** (Mindbody's count **less** the test sessions); one a trainer typed stays unless `prior-history` is asked for.
- The FORD summary on each client is worked out again from the details that stay.
- Leaders' Seen marks and trainers' "no need to remind me" on the notes that go, go with them.
- Trainers' old counts map goes before anything else, and the counts document after the Cloud Function has settled, so the function can't copy the old total back.
