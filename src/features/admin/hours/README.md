# Operations → Team → Hours — training hours by trainer

*Operations round (Round B of the Operations audit), Sep 2026. AJ, Sep 19: "No payroll on the app for now, but do track training hours per week and month per trainer, and the total, for operations."* Hours was a view inside Operations → Insights from the Operations overhaul; since the redesign’s Operations room (Sep 28 2026) it is a page of its own under Team, the screen unchanged.

## What an hour is

A **booked slot**, not the stopwatch. "Strength 30" on the Mindbody schedule is a thirty-minute appointment, and the slot is what the business books and pays by however the twenty minutes inside it went. So every completed Journey session counts for the studio's session length — `studios/{id}.sessionMinutes`, default 30, set on My Studio → Studio → The studio's day ("A session is … minutes"). The measured floor time (`activeMinutes`, the same reading Insights uses) is shown beside the name as "~22 min on the floor" and in the "On the floor" tile, so both are visible and neither pretends to be the other.

Why not the Mindbody schedule? The sync pulls today forward and never goes back, so a past booking stays "Scheduled" whether the client came or not. Journey's completed sessions are the record of what was trained.

## Which sessions

Completed sessions whose day (`sessionDay`: the `date` field, else the studio's day of the start) falls in the month. In-progress sessions are reported as "still open", sessions with no trainer on the document as "no trainer on the record" — a leader sees that the number is short rather than a total that quietly is.

The month is one `createdAt` window per studio (from a day before the month to `LATE_LOG_GRACE_DAYS` (14) after it), so a session logged after the fact is caught; one logged later than that is not counted, and the footer says so.

**Where it is read from (speed round, Oct 5 2026).** First the night's counts: the nightly renewals job writes `studios/{s}/watch/hours-YYYY-MM` for the current month and the four before it, closed days only, from one read of the sessions trained at the studio (`features/admin/month-tally`, `server/month-tally-step.ts`). The screen adds today, and anything logged since the night read, from one small live read (`liveFromMs`, less the `lateIds` the night already counted). When the night's document is missing, from before last night, or unreadable, the screen reads the raw month (`features/admin/sessions-range.ts`) as before. The raw read was capped at 1,500 sessions, which a 220-client studio reaches in a month; the night's counts have no cap. What the night counted as still open is read again by id when Hours opens, so a session finished this morning is counted and leaves the "still open" line at once. An edit to, or a removal of, a past completed session shows from the next night.

## Weeks

Monday to Sunday (`weekStartOf`). A leader reads this on Monday morning about the week that ended yesterday. The Calendar tab draws Sunday-first because a wall calendar does; a pay week is not a wall calendar.

## Scope

`features/admin/scope.ts` — the one answer, for every Operations tab, to "which studios may this reader look at": the company and owner tiers see every studio; the studio tier sees the studios they run (`leadsStudio`, which counts the grant). "All my studios" reads the night's counts only, one small document per studio, and its line says "to last night"; a studio the night has nothing usable for is named as not in the total, never added as nothing. A studio's own month (with today) is read only when it is opened from the list.

## Files

- `hours.ts` — pure: months, weeks, the tally, `formatHours`. `hours.test.ts` beside it.
- `AdminHoursTab.tsx` — the screen. `hours.render.test.tsx` mounts it for one studio, every studio and a month flip.
- `../sessions-range.ts` — the read. It takes an optional `fromServer` since the Openings round (Sep 27 2026): My Profile's Your week passes it, so an answer only the iPad's cache gave is "can't read"; Hours, Insights and Today (the Overview until Sep 28 2026) don't, and read as before. `../scope.ts` — the scope.
