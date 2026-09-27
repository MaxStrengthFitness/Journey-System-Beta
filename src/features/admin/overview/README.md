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
| Changes today | the same read; the sync's stamps | `../changes/changes.ts`: held against the day the session was for; a cancellation reads as a reschedule only when another booking that Monday-to-Sunday week is a real rebook (`isRealRebook`: it appeared at most 12 hours before the cancellation was stamped, or after, and had not already happened — AJ, Sep 26 2026) |
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

## Under All my studios

When the Operations scope is **All my studios** (the reader can look at more than one studio), the Overview is the network view instead of one studio's page. It lives in `../network/`:

- **The setup view** (`NetworkOverview`): people, not volume. The tiles count what only this reader can clear this morning (who is waiting to be let in, among others), and the locations list is ordered by Mindbody problems, never by performance. Tapping a location switches the app to that studio.
- **The network's two actions** (`NetworkActions`; the pure half is `network-actions.ts`), for franchise owners and the company (`mayActForNetwork`, the same roles `firestore.rules` lets update a network). A studio-tier leader who can span sees the setup view only.
  - **Focus this quarter**: one editor per network that holds a studio in scope, for an owner exactly as for the company (AJ, Sep 27 2026). It is the house form: only the lines that changed are written, and at rest it says who set the focus and on which day. Every Floor in the network shows it as a quiet line (`relay/board/FocusBanner`).
  - **Launch an initiative**: one ask, posted at every studio in scope after a confirmation that names each one. A studio the launch missed is named, and Launch again posts there only.
- **Why Operations may write these.** Operations looks, and My Studio edits a studio's own settings. Neither action is a studio's setting: like an announcement, they belong to the network, so there is no My Studio editor for them to duplicate. They came from Relay's Network tab in the voice-review round (Sep 27 2026), and its ranking of studios was dropped: nothing on this page ranks a studio.
- **The one-studio footer.** A franchise owner or administrator who can look at only one studio has no All my studios to choose, so the two actions sit at the foot of that studio's Overview. Inside Demo Mode that one studio is the practice studio: no real network's focus is offered there, and a launch posts at the practice studio only (the realm rule).

`../network/NetworkOverview.render.test.tsx` mounts both scopes, the one-studio footer and the footer inside Demo Mode.

## Files

- `OverviewPage.tsx` — the screen, its reads and its actions (under All my studios it mounts `../network/`); `OverviewPage.render.test.tsx` mounts it over a studio's worth of answers and presses the buttons.
- `pieces.tsx` — the row shapes, the foldable panel, the snooze chooser, the Needs-you strip.
- `today.ts`, `questions.ts`, `moments.ts`, `next-days.ts`, `team.ts`, `floor.ts`, `performance.ts` — pure, each with its test beside it.
- `useOverviewReads.ts` — incidents, critical and dated notes, the watch document.
- `useTodaySessions.ts` — today's Journey sessions, live, for what counts as done (`lib/booking-state.ts`).
- `ReviewNotesDialog.tsx` — the 60-day review.
- `overview.css` — the page, and the Changes day strip.
