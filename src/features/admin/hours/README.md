# Operations → Hours — training hours by trainer

*Operations round (Round B of the Operations audit), Sep 2026. AJ, Sep 19: "No payroll on the app for now, but do track training hours per week and month per trainer, and the total, for operations."*

## What an hour is

A **booked slot**, not the stopwatch. "Strength 30" on the Mindbody schedule is a thirty-minute appointment, and the slot is what the business books and pays by however the twenty minutes inside it went. So every completed Journey session counts for the studio's session length — `studios/{id}.sessionMinutes`, default 30, set on My Studio → Studio → The studio's day ("A session is … minutes"). The measured floor time (`activeMinutes`, the same reading Insights uses) is shown beside the name as "~22 min on the floor" and in the "On the floor" tile, so both are visible and neither pretends to be the other.

Why not the Mindbody schedule? The sync pulls today forward and never goes back, so a past booking stays "Scheduled" whether the client came or not. Journey's completed sessions are the record of what was trained.

## Which sessions

Completed sessions whose day (`sessionDay`: the `date` field, else the studio's day of the start) falls in the month. In-progress sessions are reported as "still open", sessions with no trainer on the document as "no trainer on the record" — a leader sees that the number is short rather than a total that quietly is.

The read is one `createdAt` window per studio per month (`features/admin/sessions-range.ts`, shared with Insights), from a day before the month to `LATE_LOG_GRACE_DAYS` (14) after it, so a session logged after the fact is caught; one logged later than that is not counted, and the footer says so.

## Weeks

Monday to Sunday (`weekStartOf`). A leader reads this on Monday morning about the week that ended yesterday. The Calendar tab draws Sunday-first because a wall calendar does; a pay week is not a wall calendar.

## Scope

`features/admin/scope.ts` — the one answer, for every Operations tab, to "which studios may this reader look at": the company and owner tiers see every studio; the studio tier sees the studios they run (`leadsStudio`, which counts the grant). "All my studios" reads one month per studio, each block reports its tally up, and the company tiles are added from those reports — never a second read.

## Files

- `hours.ts` — pure: months, weeks, the tally, `formatHours`. `hours.test.ts` beside it.
- `AdminHoursTab.tsx` — the screen. `hours.render.test.tsx` mounts it for one studio, every studio and a month flip.
- `../sessions-range.ts` — the read. `../scope.ts` — the scope.
