# The whole-read record — which days Journey read in full from Mindbody

*Sep 27 2026. Branch `coverage-record`, six commits on `bfa9cda` (the voice
review follow-up): four phases, what the review found, and the session
header's fix, which ships with it. The first, stand-alone piece of Openings: phase 2 of
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

Two cases more than `windowComplete`:

- **An answer holding none of the studio's bookings records nothing.** The
  sync returns before its sweep on an empty answer ("it can be a glitch"), so
  it checked nothing Journey holds for those days: a Mindbody hiccup, or a
  studio whose Location ID is wrong, which answers empty and whole on every
  pull and would otherwise have every day recorded as read in full with none
  of its bookings. The sync says how many of the studio's bookings its answer
  held (`studioAnswered`, a result field: nothing it asks or writes changed).
  A studio that really is closed goes unrecorded, the modest way round:
  Openings leaves an empty day out anyway.
- **A near pull that lost a booking** hands it to a wider pull to decide
  whether it moved or was cancelled (`settleSweepWith`). Until that pull is
  whole, and holds the studio's bookings (`settleAnswered`: an empty one
  returns before its sweep too), Journey may still hold, on today or
  tomorrow, a booking Mindbody no longer has, so nothing is recorded.

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
  are exactly as they were. The sync gained two result fields
  (`studioAnswered`, `settleAnswered`: how many of the studio's bookings an
  answer held), counted from what it already has.
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
- **A partial answer records nothing**, nor does an answer that held none of
  the studio's bookings, a pull that failed, a blank "Pull from", or a studio
  that isn't linked.
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

**Also in this ship: the session's header** (`724fe1f`, cherry-picked from
the branch `session-header`, `872dd31`). Found by the Screen Atlas's helpers
on the live app: the header's studio name defaulted to "SOLON", and the
briefing, the Wrap-up and the never-blank screen passed none, so every studio
read SOLON above every session; the Wrap-up's header was also fixed to its
dark look, white on white in the light theme. The three screens now get the
active studio's name, the Wrap-up's header follows the theme, and the header
invents no studio name or initials (`AppHeader.render.test.tsx` holds it).
App only: no rules, no data.

## Measured

- Typecheck: 4 errors, the baseline, after every commit.
- New tests: 62 in 5 files, and 4 in `lib/mindbody-api-sync.test.ts`.
  `coverage.test.ts` (31: whole or not, an empty answer, a settle that came
  back empty, the days, a back-read, the month's end, 11:30 PM and 12:30 AM
  Eastern, the Sunday the clocks go back, the reader),
  `coverage-record.test.ts` (12: the exact paths and data, nothing undefined,
  never twice, in flight, sign-out, a refused commit, an empty answer), and
  one render or hook test for each call site
  (`useAutoSync.coverage.render.test.tsx` 6, `useScheduleRefresh.render.test.tsx`
  9, `AdminMindbodyTab.coverage.render.test.tsx` 4), each with an empty whole
  answer that records nothing. The sync's four: `studioAnswered` after the
  location filter, 0 on an empty answer (the live booking untouched), and
  `settleAnswered` 0 and 2 for a settle pull that came back empty or not,
  with `settledWithMonth` as it was. Each call site's "whole" case fails with
  its call taken out.
- The suite: **6,470 passing in 425 files** after the review's fixes (6,457
  before them; 6,404 in 420 on `voice-review-followup`;
  `TZ=America/New_York npx vitest run --dir src`, in a worktree on AJ's PC). One earlier whole run had a source-walking test
  (`src/data/machine-order.test.ts`) time out at 5 seconds under load; alone,
  and in the run after, it passed.
- Rules tests: 187 (180 before), seven in the new describe block "the
  whole-read record". The review's fixes changed no rule, so they were not
  run again.

## Seen on the way

- **The near window on the night the clocks go back.** `syncWindow` adds 24
  hours to find tomorrow, and Sunday Nov 1 2026 is 25 hours long, so between
  midnight and 1 AM that night the thirty-minute pull's window would be Sunday
  only. The background pull doesn't run then (it keeps to the studio's hours,
  `withinPullHours`), and the record records only what a window covered.
  Left as it is: nothing about the pull changes in this round.
- **A day recorded as read in full can still be missing a booking the sync
  skipped one at a time.** `windowComplete` means every page arrived, not that
  every booking was written: one with an unreadable start time, or one whose
  own write threw inside the per-appointment loop, is skipped with an error
  and the flag stays true (both rare, and both older than this round). The
  Openings round should know it. A stricter test, the sync counting the
  bookings it could not write and `readWhole` refusing any pull with one,
  touches the sync's loop and waits for AJ's OK.

## What the review found

A review of the four phases, checked finding by finding, found one real hole
and one wording slip; fixed in `Coverage record: what the review found`.

- **An empty answer was recorded as read in full** (two reviewers found it by
  different roads). The sync sets `windowComplete` before its location filter
  and returns before its sweep when the studio's answer is empty, so the
  morning month pull, Operations → Mindbody's Sync and every settle pull
  (none of which has a wider window to ask) reported a whole read having
  checked nothing Journey holds. A near pull that lost a booking and handed
  it to a month that came back empty got past the guard the builder wrote for
  exactly that case, because the empty month still set `settledWithMonth`. A
  studio with a wrong Location ID would have had every day recorded with none
  of its bookings. The sync now reports `studioAnswered` (and `settleAnswered`
  for the pull it handed its losses to), and `readWhole` refuses a count of 0.
  `settledWithMonth` is untouched: the background pull reads it to decide when
  the month is next pulled. A trap in `docs/KNOWN-TRAPS.md` (Mindbody).
- **`PullAnswer.windowComplete`'s comment promised "and Journey took it in".**
  It only means every page arrived; corrected, and the gap is under "Seen on
  the way" above.
- **Two index lines compared the 907 to the 1,000-expression budget.** On the
  emulator's coverage counts the budget runs out at about 2,100 (a guest
  refused at 2,107, a home trainer through at 2,069), so 907 is well under
  half of it. The rounds index and the CHANGELOG now say so, as KNOWN-TRAPS
  and the table above already did.
