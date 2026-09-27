# Openings

When the studio is usually busy, what opened up, and what to offer: the
round is proposed in `docs/rounds/2026-09-27-openings.md` and AJ approved it
on Sep 27 2026 ("love it, lets go"). **Only its first piece is built**: the
whole-read record (`docs/rounds/2026-09-27-coverage-record.md`), shipped on
its own so the weeks start counting before the rest exists.

## What is here

| File | What it is |
| --- | --- |
| `coverage.ts` | Pure. Whether a pull's answer was whole (`readWhole`), the studio days a whole read may record (`daysReadInFull`: every day of the window up to tomorrow, on the studio's own clock), the month documents they fall in (`coverageWrites`), and the reader's question, `wasReadInFull`, where a failed read is "can't tell" |
| `coverage-record.ts` | The write, `recordCoverage`: one add-to-list merge per month in one batch, no read, never the same day twice from one iPad, a failed write let go quietly |

It is called, after the pull and only after it, by the background pull
(`features/admin/useAutoSync.ts`), the header's and the calendar's Refresh
(`features/admin/useScheduleRefresh.ts`) and Operations → Mindbody's
"Pull the schedule now" (`features/admin/mindbody/AdminMindbodyTab.tsx`). All
three pull the whole studio; a pull limited to some trainers must never call it.

## The rules that matter

- **A day counts only when read on the day before, the day, or after.** A read
  two days early proves nothing: bookings keep changing until then.
- **A partial answer records nothing**, and neither does a near pull whose lost
  booking was handed to a wider pull that came back short.
- **Nothing about the pull changes.** No Mindbody call, no timer, no window.
- **Add-only.** The rules keep every day already recorded, and the app never
  deletes a month (`match /scheduleCoverage/{month}` in `firestore.rules`).
  The write asks who works at the studio with the caller resolved once
  (`coverageWriterAllowed`): `writesForStudio` itself ran a guest's write out
  of the 1,000-expression budget (docs/KNOWN-TRAPS.md).

## What comes next

The record's readers, the rest of the round: the Sunday job's step that folds
eight weeks into `studios/{s}/watch/openings` (which days count), the report
script, and My Studio → Openings. Until then the record is written ahead of
its reader on purpose (`docs/business/data-and-metrics.md`).
