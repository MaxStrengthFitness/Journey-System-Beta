# Openings

When the studio is usually busy, what opened up, and what to offer: the
round is proposed in `docs/rounds/2026-09-27-openings.md` and AJ approved it
on Sep 27 2026 ("love it, lets go"; his answers to the OK list are at the end
of that document). Built so far:

- **the whole-read record** (`docs/rounds/2026-09-27-coverage-record.md`),
  shipped on its own so the weeks start counting before the rest exists;
- **the pure core** (phase 1): every rule and every sentence, with nothing on
  screen yet and nothing that reads or writes the database. The Sunday job's
  step, the report script and the screens are later phases, and they call
  this core rather than keep a rule of their own.

It never books, holds, or asks Mindbody anything: it reads the bookings
Journey already syncs, and every offer ends "Check it in Mindbody before you
promise it. Journey doesn't book."

## What is here

| File | What it is |
| --- | --- |
| `coverage.ts` | Pure. Whether a pull's answer was whole (`readWhole`), the studio days a whole read may record (`daysReadInFull`: every day of the window up to tomorrow, on the studio's own clock), the month documents they fall in (`coverageWrites`), a stored month read safely (`recordedDays`), and the reader's question, `wasReadInFull`, where a failed read is "can't tell" |
| `coverage-record.ts` | The write, `recordCoverage`: one add-to-list merge per month in one batch, no read, never the same day twice from one iPad, a failed write let go quietly |
| `rows.ts` | A time is a half-hour of a weekday, Monday to Saturday (`ROW_MINUTES`), keyed `"1-0800"` everywhere; a booking fills every half-hour it overlaps (`bookingTime`), on the studio's clock |
| `whose.ts` | Which trainer a booking belongs to (`placeBooking`): the standing week check's own `trainerOf`, exported from `standing-week/check.ts` and reused, so the two can't disagree |
| `days.ts` | Which past days count (`countDays`): read in full, and open (`DAY_OPEN_SHARE` of the weekday's usual) |
| `agreed.ts` | Which agreed standing week was in force on a day (`versionOn`), and the versions carried from one Sunday to the next (`carryHistory`) |
| `room.ts` | The one rule for room, past and ahead: what counts as booked (`cancellationOf`, `LATE_CANCEL_HOURS`), who is in (`inOnPastDay`, `inAhead`), whether a day can be judged (`whyNotJudged`), and the word for one half-hour (`wordAt`) |
| `fold.ts` | Eight weeks folded into the weekly summary (`foldSummary`), the window (`foldWindow`), the months of the record to read (`coverageMonths`), and the size ceiling (`storedBytes`, `SIZE_CEILING_BYTES`, `SKIP_ABOVE_BYTES`) |
| `summary-doc.ts` | The summary as stored (`studios/{s}/watch/openings`), written with nothing undefined (`summaryForWrite`) and read safely (`readSummary`: ok, never built, unreadable) |
| `usual.ts` | The usual word for a time and everything its sheet says (`usualTime`), the grid (`usualWeek`), and when the first words can come (`firstWordsOn`) |
| `marks.ts` | "Always full" and "Usually has room" marks: read and written safely, what they change (`countsAsFull`, `offerable`), when the bookings disagree, the 60-day review |
| `next-days.ts` | Next 7 days (`nextDays`): the lines, their reasons, room ahead, and the Wrap-up's `timesWithRoom` |
| `back-from.ts` | "Booked again from" (`backFrom`), the read's range and batches, and "was the month read in full today" (`monthReadToday`) |
| `offer.ts` | A new regular time (`offers`): the checks against agreed regulars, the coming weeks and this week |
| `present.ts` | Every sentence, from the proposal's own words, and names as AJ's relaxed answer has them |
| `fixtures.ts` | Test fixtures only: a studio with two agreed trainers and a Sunday run of Sun Nov 8 2026 |

`isStaffBlock` (a Mindbody "Unavailable" block is never a booking) lives in
`src/lib/booking-state.ts`, beside the other answers about a booking; Team's
check and Operations → Changes ask it too.

The whole-read record is written, after the pull and only after it, by the
background pull (`features/admin/useAutoSync.ts`), the header's and the
calendar's Refresh (`features/admin/useScheduleRefresh.ts`) and Operations →
Mindbody's "Pull the schedule now" (`features/admin/mindbody/AdminMindbodyTab.tsx`).
All three pull the whole studio; a pull limited to some trainers must never
call it.

## The rules that matter

### The whole-read record

- **A day counts only when read on the day before, the day, or after.** A read
  two days early proves nothing: bookings keep changing until then.
- **A partial answer records nothing**, and neither does an answer that held
  none of the studio's bookings (the sync returned before its sweep, so it
  checked nothing Journey holds: `studioAnswered` 0), nor a near pull whose
  lost booking was handed to a wider pull that came back short or empty
  (`settleAnswered` 0). `windowComplete` alone says only that every page
  arrived (docs/KNOWN-TRAPS.md, Mindbody).
- **Nothing about the pull changes.** No Mindbody call, no timer, no window.
- **Add-only.** The rules keep every day already recorded, and the app never
  deletes a month (`match /scheduleCoverage/{month}` in `firestore.rules`).
  The write asks who works at the studio with the caller resolved once
  (`coverageWriterAllowed`): `writesForStudio` itself ran a guest's write out
  of the 1,000-expression budget (docs/KNOWN-TRAPS.md: on the emulator's
  coverage counts it runs out at about 2,100, and the costliest write as
  built is 907).

### Which days count, and who was in

- **A day counts only when Journey read it in full, and the studio was open.**
  Without the record no day counts, however many bookings it holds: a week
  read in part looks like a quiet week, and a volume test alone would call a
  standing hot spot "usually has room". A record whose month couldn't be read
  is "can't tell", so the day doesn't count either. Demo Mode is the one
  exception (`isDemo`): the seeder wrote every booking.
- **The closure test counts live bookings only.** A snow day's bookings are
  cancelled late that morning; counting them would make the closed day look
  full.
- **An agreed week counts from the day it was agreed, never backwards.** The
  Sunday job carries the older versions in the summary itself (nothing else
  holds them). The same blocks agreed again keep the older start; a week that
  is gone is closed on the day last Sunday's summary was built; without last
  Sunday's summary, only the current version, from the day it was agreed.
- **On a past day a trainer is in only with an agreed week in force AND a
  booking that day** (a late cancellation counts as one; one cancelled in good
  time doesn't: they may have been told not to come in).
- **A day can be judged only when everyone with a booking there is known.**
  A trainer with bookings and no agreed week, or a booking Journey can't
  place, and the day says how many were booked, nothing about room. On such
  a day the summary doesn't store who was in (`i`): it isn't known.
- **Ahead, room is judged per half-hour**: a claim is only ever "room with"
  someone who usually takes clients then, and the only booking that could
  quietly be theirs is one Journey can't place at that very time.

### What counts as booked

- **Late means less than `LATE_CANCEL_HOURS` (24) before the start.** Exactly
  24 hours is on time: "at least 24 hours' notice", the usual policy wording.
- A stamp **at or after** the booking's own start (a back-read found it) is a
  cancellation, never a late one. An unstamped cancellation (the old sweep)
  is neither booked nor counted.
- A booking is read as lasting at most `LONGEST_BOOKING_MINUTES` (180) and
  never past midnight: a row whose end is hours out is bad data.
- **The rotation** is booked for nobody in particular: it takes one free
  trainer's place without saying whose, so "room with" names nobody when a
  rotation booking is there, and a time offered to one trainer "for good" is
  never one where a rotation booking could be theirs unseen.

### The words

- **"Usually N booked" also covers a time where, most weeks, nobody's agreed
  week had anyone in** (a trainer booked outside their usual week): room and
  full are words about the trainers in, so it takes the booked form
  (`why: "nobody-in"`) rather than a "Mixed" that would read as a claim. N may
  be 0: "Usually none booked".
- **Blank needs no minimum**: a time with nothing booked and nobody in, in
  every counted week, is blank even before four weeks.
- **"A cancellation nobody rebooked"** is a stamped cancellation with nothing
  booked into that time since: a booking at that time, with the same trainer,
  that `isRealRebook` says came with or after the cancellation. Her own
  rebook on another day doesn't take the time back (the time is still open);
  "booked again from" says when she is next in.
- **The summary's window** is the eight Monday-to-Saturday weeks that have
  ended by the studio's today: on the Sunday the job runs, that includes the
  week just ended. `since` is carried from last Sunday's summary when older.

### Names and client names

- **Everyone who works at the studio sees other trainers' names** (AJ, Sep 27
  2026: "im not too concerned for permission at this stage of the beta, just
  keep it relaxed and we will tighten up later"). First names, the whole name
  when two share one; the person looking is "you", first; the rest in name
  order, never with a count beside a name.
- **Client names only after a tap**, on every part of Openings (`lineDetail`),
  as a courtesy to the client at the iPad. The Wrap-up's "Times with room"
  shows times only: no names, no reasons.

## For the phases to come

**The Sunday job's step** (phase 3) reads, per linked studio, and hands the
lot to `foldSummary`:

1. `today = studioTodayKey(now, tz)`, `window = foldWindow(today, tz)`;
2. the bookings: `schedules` where `studioId ==` and `startTime` between
   `window.start` and `window.end` (the existing (studioId, startTime) index);
3. the record: `studios/{s}/scheduleCoverage/{month}` for each of
   `coverageMonths(window)`, by id, each through `recordedDays` (a failed read
   maps to `null`: its days don't count);
4. the trainers: `trainerRefs(trainers, staffIdsAt(trainers, studio.mindbodySiteId))`;
5. the standing weeks: `studios/{s}/standingWeeks`, through `normalizeDoc`;
6. last Sunday's summary: `readSummary(data)`, `null` unless `state === "ok"`.

Then `summaryForWrite`, `storedBytes` against `SKIP_ABOVE_BYTES` (skip with a
log line, keep last week's), and its own batch after the job's main write.

**The screens** read the summary with `readSummary`, the grid with
`usualWeek`, a time's sheet with `usualTime` and present.ts's sheet lines,
the next 7 days with `nextDays` (bookings from
`useWeekSchedule(..., { confirmed: true })`, `serverRead` for `read`), a new
regular time with `offers`, and the marks with `marksByTime`. Team's line is
`teamLine`, the Overview's `overviewLines`, the Wrap-up's times
`timesWithRoom` and `timesWithRoomByDay`.
