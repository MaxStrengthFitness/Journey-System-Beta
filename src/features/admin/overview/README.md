# Operations → Overview — today, what needs you, the next three days, the week

*Operations overhaul, Sep 19 2026. Was the Monday page (Operations round, the same week) and before that the floor snapshot. AJ: "not the Monday page — studio management opens this every day, it is the Overview. A summary layer, not a destination."*

## Three depths

1. **The ten-second read.** Today's tiles — booked, done, not completed, **never logged** (the loud one: past its slot, nothing logged in Journey; tap it for the list to chase), on the floor now — and the **Needs you** strip, which counts every action waiting on the page and jumps to it.
2. **The panels.** Each is a headline sentence with its proof, the top rows, an inline action and a door to the deep dive. On a desk they sit in two columns — *act today* on the left (Changes today · Pain and critical notes · Attendance watch · Strength dropped), *look ahead* on the right (The next three days · Renewals · Moments this week · Team this week); on a portrait iPad they stack in reading order. Panels fold to their sentence, remembered per device.
3. **The deep dives.** The tabs, plus two views of the Overview's own: **Changes** (`../changes/ChangesView`) and the **Attendance watch** (`../attention/AttendanceWatchView`). Then the week in one line each: Insights, Machine fit, Hours, this week's changes.

## Where each panel's answer comes from

| Panel | Source | Rule |
| --- | --- | --- |
| Today | the week's schedule (`../changes/useWeekSchedule`, live, cancellations included); today's Journey sessions (`useTodaySessions`, live, `hostedAtStudioId` + `createdAt` from the start of the studio day) | `today.ts`: live bookings = the day's less the cancelled; **done = a Journey session was completed for that client that studio day** (AJ, Sep 24 2026 — Mindbody bookings never come back "Completed"; `lib/booking-state.ts` is the one rule); never logged = a slot finished five minutes ago with no such session (`floor.ts`); a failed read of the sessions leaves those slots **unknown** — the tiles say "—" and "missing, not zero", never never logged |
| Changes today | the same read; the sync's stamps | `../changes/changes.ts`: held against the day the session was for; a cancellation with another booking that Monday-to-Sunday week reads as a reschedule |
| The next three days | the same read; the nightly snapshot's `no-future-booking` flag | `next-days.ts`: the next three days WITH bookings (a closed Sunday is skipped); who is booked with a live note; who has nothing booked ahead |
| Pain and critical notes | `clinicalIncidents`, the studio's critical notes, the last 7 days of the Dial (`useOverviewReads`, `../sessions-range`) | `questions.ts` `painQuestion`: a critical note counts while it **matters** (`features/client-notes/mattering`); one acknowledgement key per thing (`../attention`) |
| Renewals | the roster's nightly snapshots, cycles, settings | `questions.ts` `renewalsQuestion`, the same lanes as Operations → Renewals |
| Attendance watch | the nightly snapshots; the watchlist | `questions.ts` `attendanceQuestion` (twice the client's usual gap, never under the studio's `breakDays`); `../attention` snooze, dismiss, back again |
| Moments this week | the Delight queue, notes pinned to a day, the week's bookings, the clients' first dates | `moments.ts`: gestures due, dates on their next occurrence, session milestones only when the total may be quoted (never off a low Journey count during migration), whole years with the studio |
| Strength dropped | `studios/{s}/watch/performance`, the Sunday job | `performance.ts` (shared with the job) |
| Team this week | the last 14 days of sessions; today's schedule and today's Journey sessions | `team.ts`: completed since Monday, clients, hours, unlogged today (the same rule as the tiles; the column is hidden when today's sessions could not be read) — alphabetical, never ranked |
| Notes to review | the studio's critical notes | `questions.ts` `notesToReview`: an always-note that has mattered 60 days (`ReviewNotesDialog`: still matters / no longer) |

## What the page refuses to say

- Nothing about a client's rhythm until the nightly job has measured one (eight weeks); a client with no pace gets the studio's plain break rule, and the proof says so.
- Nothing about a milestone off an unknown history; "N so far, earlier sessions counted from the record" when the count is partial.
- Nothing about performance until the Sunday job has written a document; "the weekly read has not run yet" is a different sentence from "nobody dropped".
- A failed read says so ("could not be read just now") and never counts as zero — the tiles, the changes list and the panels each say when they are missing rather than empty.

## Files

- `OverviewPage.tsx` — the screen, its reads and its actions; `OverviewPage.render.test.tsx` mounts it over a studio's worth of answers and presses the buttons.
- `pieces.tsx` — the row shapes, the foldable panel, the snooze chooser, the Needs-you strip.
- `today.ts`, `questions.ts`, `moments.ts`, `next-days.ts`, `team.ts`, `floor.ts`, `performance.ts` — pure, each with its test beside it.
- `useOverviewReads.ts` — incidents, critical and dated notes, the watch document.
- `useTodaySessions.ts` — today's Journey sessions, live, for what counts as done (`lib/booking-state.ts`).
- `ReviewNotesDialog.tsx` — the 60-day review.
- `overview.css` — the page, and the Changes day strip.
