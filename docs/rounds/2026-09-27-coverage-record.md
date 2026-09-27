# The whole-read record — which days Journey read in full from Mindbody

*Sep 27 2026. Branch `coverage-record`, four commits on `bfa9cda` (the voice
review follow-up). The first, stand-alone piece of Openings: phase 2 of
`2026-09-27-openings.md`, shipped ahead of the rest so the weeks start
counting now.*

## What AJ asked

Openings (the studio's usual week, its hot and cold spots, and what opened
up) can only call a week "usually full" or "usually has room" if it knows the
week's bookings are all there. A day can hold a handful of bookings that
arrived one at a time through the webhook and look exactly like a quiet day.
So the proposal asked for a small record, written at the time of each pull,
of the days Journey read in full.

AJ's answers to the proposal's OK list, Sep 27 2026:

- the stored records: **"thats fine"**;
- ship the whole-read record first, on its own: **"sounds good"**;
- the one-off back-read of eight weeks: **not now**, "i want to really focus
  on getting all our clients contracts synced first before that";
- who sees what: "im not too concerned for permission at this stage of the
  beta, just keep it relaxed and we will tighten up later";
- and the standing concern: **"i just dont want a big mindbody bill or
  firestore bill popping up, we have a lot of nights and days to run batches
  of things before we run this at studios"**.

## What it does

After a pull that Mindbody answered for its **whole** window (every page
arrived: `windowComplete` in `src/lib/mindbody-api-sync.ts`, the test the sync
lease already uses), the iPad that pulled writes down which studio days it
read in full. A day counts when its answer came back whole **on the day
before, on the day itself, or any time after**, so:

| The pull | What it records |
| --- | --- |
| The thirty-minute pull (today and tomorrow) and the morning's whole month (`useAutoSync`) | today and tomorrow |
| The header's Refresh (the week ahead) and the calendar's Refresh (the days on screen, from today) | today and tomorrow |
| Operations → Mindbody → **Pull the schedule now** | every day it was asked for, up to tomorrow: a past "Pull from" (a back-read) records its past days |

"Today" is the studio's own day (`src/lib/studio-time.ts`), counted from when
the pull began, so the record can only ever be too modest. A pull at 11:30 PM
Eastern is still today's; at 12:30 AM it is the new day's.

One case more than `windowComplete`: a near pull that **lost** a booking hands
it to a wider pull to decide whether it moved or was cancelled
(`settleSweepWith`). Until that pull is whole too, Journey still holds, on
today or tomorrow, a booking Mindbody no longer has, so nothing is recorded.

The pure half is `src/features/openings/coverage.ts` (whole or not, the days,
the month documents, and the reader's question `wasReadInFull`, where a failed
read is "can't tell"). The write is `src/features/openings/coverage-record.ts`.
The three calls are one line each after the pull, in
`src/features/admin/useAutoSync.ts`, `src/features/admin/useScheduleRefresh.ts`
(the header's and the calendar's Refresh, moved out of `AppContent.tsx` word
for word so it could be tested) and
`src/features/admin/mindbody/AdminMindbodyTab.tsx`.

## What it never does

- **It never asks Mindbody anything.** No new call, no new timer, no wider
  window. What a pull asks for, how often, and what it writes to `schedules`
  are exactly as they were.
- **It never writes the same day twice from one iPad.** A small memory on the
  iPad (`recorded`, forgotten at sign-out with `forgetOnSignOut`) holds the
  days it has written, and holds them while a write is in flight, so a Refresh
  pressed during the background pull doesn't write them again.
- **It never reads before it writes.** One add-to-list merge (`arrayUnion`)
  per month document, so two iPads never overwrite each other. No listener,
  no query, no index.
- **It never tells the trainer anything.** A failed write is let go quietly and
  the next whole pull on that iPad tries the same days again. Both months at a
  month's end go in one batch: all or nothing.
- **A partial answer records nothing**, nor does a pull that failed, a blank
  "Pull from", or a studio that isn't linked.
- **It has no reader yet.** Openings' usual week and the Sunday job read it in
  a later round (`2026-09-27-openings.md`, phases 3 and 4). Until then the
  record simply grows, which is the point: those weeks can't be counted later.

## The data

```
studios/{studioId}/scheduleCoverage/{yyyy-mm}        e.g. "2026-10"
  days   ["2026-10-01", "2026-10-02", ...]   studio days read in full, at most 31
```

**Rules** (`firestore.rules`, `match /scheduleCoverage/{month}`):

| | Who |
| --- | --- |
| Read | The studio's people (`writesForStudio`, as the standing weeks are read) |
| Add days | Anyone who works at the studio, administrators and franchise owners too (a back-read) |
| Take a day away, or delete a month | Nobody, from the app |

The shape is held: the id is a month, the only key is `days`, every day belongs
to that month (the rule names the month's 31 possible days), none twice, at
most 31, at least one. An update must keep every day already there.

**The budget.** Written with `writesForStudio` itself, a guest trainer's write
ran out of Firestore's 1,000-expression budget in the emulator and came back
as a refusal. The write rule asks the same question with the caller's role and
trainer document read once (`coverageWriterAllowed`, as `teamJobLeaderAllowed`
does). Measured with the emulator's rule-coverage report (evaluations per
write, Sep 27 2026):

| Write | With `writesForStudio` | As built |
| --- | --- | --- |
| A guest trainer, a whole month | **2,107: refused** (the budget ran out) | 831 |
| A trainer at home, a whole month | 2,069 (just under) | 831 |
| A trainer with the grant, a month's 31st day | 2,023 | **907** (the costliest) |
| An administrator, a whole month | 1,502 | 794 |

A batch is checked document by document: two full months in one batch passed
for every writer.

**Every field has a reader** (`docs/business/data-and-metrics.md`): `days` is
read by the Sunday job and Openings' usual week to come; until they ship, the
record is written ahead of its reader on purpose, because a day can't be
recorded as read in full after the fact.

## What it costs

Nothing on the Mindbody bill: no call is made. On Firestore:

- **Writes:** each iPad writes once a day per studio at most (when tomorrow
  becomes a new day), plus once after a reload or a sign-out. A studio with
  four or five iPads that each win a pull writes about 1 to 6 small documents
  a day (under 1 KiB each). The client count doesn't enter into it: at AJ's
  110, 110, 240 and 250 clients the record is the same handful of writes.
  Four studios for a month: under 750 writes, about $0.0002 at Enterprise's
  list price ($0.26 a million write units).
- **Reads:** none from the app. The rule reads the writer's own trainer
  document once per write, billed as one read: the same handful.
- **Indexes:** none.

The optional back-read (not now, by AJ's answer) would ask Mindbody for about
two months of each studio's bookings once, by hand; the proposal prices it.

## Deploy order

`scripts/ship/ship-coverage-record.ps1`, after the voice review follow-up is
live (its prepare stage checks that master already contains `bfa9cda`):

1. **No index change.** The prepare stage checks `firestore.indexes.json` is
   the same as master's.
2. **`npm run test:rules`** on AJ's PC, the run that counts (the script stops
   an emulator left on port 8080 by an earlier run only when AJ types STOP, and
   stops the one its own run leaves behind).
3. **`firebase deploy --only firestore:rules --project prod`**: the new block
   only adds access, so the running app is unaffected and the new one finds
   its rules waiting. The restore tag `restore/2026-09-27-before-coverage-record`
   is pushed first.
4. **Push `coverage-record` to `master`, fast-forward only. Render deploys the
   app.** From the next whole pull, each studio's month document starts to
   fill.

To undo the app: push the restore tag to master. The rules can stay; nothing
else reads the collection.

## Measured

- Typecheck: 4 errors, the baseline, after every commit.
- New tests: 53 in 5 files. `coverage.test.ts` (28: whole or not, the days,
  a back-read, the month's end, 11:30 PM and 12:30 AM Eastern, the Sunday the
  clocks go back, the reader), `coverage-record.test.ts` (11: the exact paths
  and data, nothing undefined, never twice, in flight, sign-out, a refused
  commit), and one render or hook test for each call site
  (`useAutoSync.coverage.render.test.tsx` 4, `useScheduleRefresh.render.test.tsx`
  7, `AdminMindbodyTab.coverage.render.test.tsx` 3). Each call site's "whole"
  case fails with its call taken out.
- The suite: **6,457 passing in 425 files** (6,404 in 420 on
  `voice-review-followup`; `TZ=America/New_York npx vitest run --dir src`, in
  a worktree on AJ's PC). One earlier whole run had a source-walking test
  (`src/data/machine-order.test.ts`) time out at 5 seconds under load; alone,
  and in the run after, it passed.
- Rules tests: 187 (180 before), seven in the new describe block "the
  whole-read record".

## Seen on the way

- **The near window on the night the clocks go back.** `syncWindow` adds 24
  hours to find tomorrow, and Sunday Nov 1 2026 is 25 hours long, so between
  midnight and 1 AM that night the thirty-minute pull's window would be Sunday
  only. The background pull doesn't run then (it keeps to the studio's hours,
  `withinPullHours`), and the record records only what a window covered.
  Left as it is: nothing about the pull changes in this round.
