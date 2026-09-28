# Operations → Today — the brief

*The redesign's Operations room, Sep 28 2026 (`docs/rounds/2026-09-28-operations.md`, phase 2). Was the Overview (Operations overhaul, Sep 19), the Monday page before that (Operations round, the same week), and the floor snapshot before that. AJ, Sep 19: "studio management opens this every day. A summary layer, not a destination." AJ took the redesign's pick, "Brief + Journey", with every default.*

The folder keeps its old name, as `admin/` keeps "admin" for Operations.

## The shape

One column, the same sections in the same order every day (research-operations §6.3; BLUF and the President's Daily Brief):

1. **The freshness line** — when the schedule was read, when the nightly record last changed, and how many clients can't be judged. The count is a button that says who and why.
2. **The bottom line** — one sentence written by rules (`brief.ts`, `bottomLine`), the rules a tap away ("How this line is written"), the day's facts under it (booked, done, on the floor, to come, trainers on, and a door to the live floor on My Studio → Relay), and today's "didn't come" marks with who made them and **Take back** (wave 2). For someone who can't mark at this studio (a leader visiting it), the sessions nobody logged stay a door here ("See who to ask"), never a count.
3. **Needs you** — only what a leader can clear right here (AJ's question 3, default): acknowledge pain, an incident or a Critical note (`attention/`), take a gesture nobody owns (FORD's `setGestureStatus`, the Delight queue's own writer), review a note that has mattered 60 days (`ReviewNotesDialog`); and, since wave 2 (AJ, Sep 28 2026: "all yes"), each session nobody logged, which a leader clears with **Didn't come** once they have asked on the floor (`../attention/booking-marks.ts`, `studios/{s}/bookingMarks/{bookingId}`), or which clears by itself when its trainer logs the workout (a session logged for that day always beats a mark, `lib/booking-state.ts`). Its count is Today's badge in the menu, shown only while Today is mounted.
4. **Catch today** — clients in today with a reason to see them in person, from the Hub's ONE engine (`hub-opportunities/moments-today`, the families renew, welcome and celebrate), in the order they're in; and who trained today with nothing booked in the week (`leftWithNothingBooked`).
5. **Slipping away** — the Journey's drifting and at-risk clients (`../journey/`, one rule for "slipping"), catchable first, with Snooze and Dismiss (`attention/`), and a door to Clients → Journey. The old attendance watch and its view went in phase 4.
6. **Since yesterday** — the cancellations and moves noticed since yesterday began, each held against its own day (`sinceYesterday` over `changes/changes.ts`); "All changes" opens Week.
7. **Coming up** — the next three days with bookings (`next-days.ts`), Openings' line with its door to My Studio → Openings, who has nothing booked ahead, and the renewal talks due, with a door to Clients → Renewals.
8. **Going right** — who came back (a dismissed client who booked or visited since: Got it), the week's milestones, dates and owned gestures (`moments.ts`).
9. **Worth a look** — Sunday's strength list (`performance.ts`), machine fit, Trends (the Insights line), Hours.

**Start huddle** (phase 6), beside the date: huddle mode, full screen, five items built from the lines above (`../team/huddle-agenda.ts`, drawn by `../team/HuddleSheet.tsx`): a concern and a win, who to catch today and whose usual trainer may know why someone has drifted, the sessions nobody logged and machine fit, what Team → This week recognised, and what the bell is showing. The brief works the huddle's lines out only while it is open. Nothing is sent and nothing is written.

## What the page refuses to say (the pins "Some lines give false comfort")

- **"Nothing needs you" off a partial read.** A failed or unfinished read behind Needs you (incidents, critical notes, the Dial, acknowledgements, the Delight queue) makes it "nothing that could be read needs you", with a line saying the list may be short.
- **"Everyone active is booked ahead" before any nightly record exists.** Coming up counts only clients with a nightly record, and with none says who is booked ahead is unknown.
- **"Nobody has talked to them yet" off a failed lookup.** `useCyclesRead` (renewals/usePipeline) says when the conversations couldn't be read; `renewalsQuestion(…, cyclesKnown)` then says so and gives no "not talked" count.
- **"0 due" off a failed gestures read.** `useDelightQueue` now carries `failed`; Going right says the gestures couldn't be read.
- **A no-show chased as never logged, or never logged called a no-show.** An unlogged session says only what is known ("No Journey session for her today. Ask on the floor…"); it becomes a no-show only when a leader marks it "didn't come" (wave 2), and until today's marks have been read nothing unlogged is counted, so a marked session never flashes back onto Needs you. A marks read that fails says the list may be short.
- **"The rest of the day looks steady"** unless every read answered: an unread schedule, an unread day's logging, a client whose renewal timing is unknown, and a nightly record that stopped changing (`NIGHTLY_STALE_DAYS`, 3 quiet days) are each named in the bottom line.
- **An unread week is never a zero** (the Openings round): while the week is being read, or could not be, nothing counted from its bookings is said (`changes/useStudioWeek`).
- Nothing about a milestone off an unknown history, and nothing about performance until the Sunday job has written a document (as before).

## Under All my studios

When the Operations scope is **All my studios**, Today is the network view instead of one studio's brief. It lives in `../network/`:

- **The setup view** (`NetworkOverview`): people, not volume. The tiles count what only this reader can clear this morning (who is waiting to be let in, among others), and the locations list is ordered by Mindbody problems, never by performance. Tapping a location switches the app to that studio.
- **The network's two actions** (`NetworkActions`; the pure half is `network-actions.ts`), for franchise owners and the company (`mayActForNetwork`, the same roles `firestore.rules` lets update a network). A studio-tier leader who can span sees the setup view only.
  - **Focus this quarter**: one editor per network that holds a studio in scope, for an owner exactly as for the company (AJ, Sep 27 2026). Only the lines that changed are written, and at rest it says who set the focus and on which day.
  - **Launch an initiative**: one ask, posted at every studio in scope after a confirmation that names each one.
- **The one-studio footer.** A franchise owner or administrator who can look at only one studio has no All my studios to choose, so the two actions sit at the foot of that studio's brief. Inside Demo Mode that one studio is the practice studio (the realm rule).

`../network/NetworkOverview.render.test.tsx` mounts both scopes, the one-studio footer and the footer inside Demo Mode.

## Files

- `OverviewPage.tsx` — the page: the brief for one studio, the network view under All my studios, the one-studio footer.
- `TodayBrief.tsx` — the brief, its reads and its actions; `OverviewPage.render.test.tsx` mounts it over a studio's worth of answers and presses the buttons.
- `brief.ts` — the bottom line, the nightly record, Catch today, leaving with nothing booked, since yesterday; `brief.test.ts`.
- `brief-pieces.tsx` — a section, the freshness line, the bottom line box (styles in `../shell/ops.css`, prefix `ops-`).
- `pieces.tsx` — the row shapes (Rows, ActionRows), the snooze chooser, the tappable line.
- `today.ts`, `questions.ts` (renewals, pain and incidents, the 60-day review, hours), `moments.ts`, `next-days.ts`, `team.ts`, `floor.ts`, `performance.ts` — pure, each with its test beside it (`performance.ts` is shared with the Sunday job).
- `useOverviewReads.ts` — incidents, critical and dated notes, the watch document.
- `useTodaySessions.ts` — today's Journey sessions, live, for what counts as done (`lib/booking-state.ts`).
- `ReviewNotesDialog.tsx` — the 60-day review.
- `overview.css` — the row shapes and the Changes day strip.
