# Operations → Today — the brief

*The redesign's Operations room, Sep 28 2026 (`docs/rounds/2026-09-28-operations.md`, phase 2). Was the Overview (Operations overhaul, Sep 19), the Monday page before that (Operations round, the same week), and the floor snapshot before that. AJ, Sep 19: "studio management opens this every day. A summary layer, not a destination." AJ took the redesign's pick, "Brief + Journey", with every default.*

The folder keeps its old name, as `admin/` keeps "admin" for Operations.

## The calm round (Oct 3 2026)

AJ: "we really need to take a look at the operations dashboard. And make this a lot easier and cleaner for studio leaders to see what's going on. I feel like there's just so many words on there. It's really overwhelming." Measured that evening at Strongsville (before its Journey start date): Today was **1,430 words**, a third of them one instruction printed on each of ten rows. AJ took every recommendation ("i trust all your recommended"); Today now reads about 150 words for the same day. `docs/rounds/2026-10-03-ops-calm.md` is the round. The rules every Operations page keeps since:

- **Counts, not a written bottom line.** One line of numbers (`CountsLine`); its rules behind an (i).
- **Said once.** What the page can't judge yet (the nightly record: not live, no record, stale, or the clients it couldn't place) is ONE note at the top (`brief.ts` `nightlyNote`, `useNightlyNote.ts`, `PageNote`). The sections it covers stay quiet: never repeated, never called clear.
- **A row is one line.** How to clear it and where it came from open on the row's (i) (`ActionRows`' Why). Long lists show five, then Show all.
- **No captions.** A section heading is its name and its count; what a list leaves out is on the section's (i) (`BriefSection` `info`).
- **Empty folds.** A section with nothing in it is a name in ONE "All clear" line at the foot (`AllClear`), only when every read behind it answered. A section still reading or unread stays, saying so in a few words.

## The shape

One column, the same sections in the same order every day (research-operations §6.3); only the ones with something in them are drawn:

1. **The counts line** — booked · logged · on the floor · to come · trainers on, and a door to the live floor on My Studio → Relay. Its (i) holds what "logged" means and when the schedule was read.
2. **The one note** — what the nightly record can't judge yet, with Why and a door to Setup → Mindbody.
3. **Late cancels marked today** — one quiet row when there are any, the names, and on Show who marked each and **Take back** (wave 2).
4. **Needs you** — only what a leader can clear right here (AJ's question 3, default): acknowledge pain, an incident or a Critical note (`attention/`); Seen on the team's Health, Incident and Retention notes; take a gesture nobody owns (FORD's `setGestureStatus`); finish a session left open; review a note that has mattered 60 days (`ReviewNotesDialog`); and the sessions nobody logged, **one row per trainer** ("Kyle McManus · 10 not logged: Mary Ann Petras, Michelle Carrara and 8 more", `today.ts` `notLoggedByTrainer`), the names and **Late cancel · session taken** on Show (`../attention/booking-marks.ts`); a session logged for that day always beats a mark (`lib/booking-state.ts`). Its count is Today's badge in the menu, shown only while Today is mounted. For someone who can't mark at this studio (a leader visiting it) the sessions nobody logged are their own **Not logged** section to ask from, never a Needs-you count.
5. **Catch today** — clients in today with a reason to see them in person, from the Hub's ONE engine (`hub-opportunities/moments-today`), and who trained today with nothing booked in the week (`leftWithNothingBooked`).
6. **Slipping away** — the Journey's drifting and at-risk clients (`../journey/`), catchable first, Snooze and Dismiss, a door to Clients → Journey. Left to the note while the nightly record can't judge.
7. **Since yesterday** — the cancellations and moves since yesterday began, one short line each (`changes.ts` `shortChange`; when it was noticed and the day it is held against on the row's (i)). A booking handed from the rotation to a named trainer at the same time is not a change (`changesForDay`). "All changes" opens Week.
8. **Coming up** — the next three days with bookings (only the facts that aren't zero), Openings' line, who has nothing booked ahead, and the renewal talks due, with a door to Clients → Renewals.
9. **Going right** — who came back (Got it), the week's milestones, dates and owned gestures (`moments.ts`).
10. **Worth a look** — only a signal that says something: Sunday's strength list (`performance.ts`), machine fit, a Trends observation. Hours is on Team → Hours.
11. **All clear** — every section with nothing in it, in one line.

**Start huddle** (phase 6), beside the date: huddle mode, full screen, five items built from the lines above (`../team/huddle-agenda.ts`, drawn by `../team/HuddleSheet.tsx`): a concern and a win, who to catch today and whose usual trainer may know why someone has drifted, the sessions nobody logged and machine fit, what Team → This week recognised, and what the bell is showing. The brief works the huddle's lines out only while it is open. Nothing is sent and nothing is written.

## What the page refuses to say (the pins "Some lines give false comfort")

- **"Nothing needs you" off a partial read.** A failed or unfinished read behind Needs you (incidents, critical notes, the Dial, acknowledgements, the Delight queue) makes it "nothing that could be read needs you", with a line saying the list may be short.
- **"Everyone active is booked ahead" before any nightly record exists.** Coming up names only clients with a nightly record; with none, the page's one note says why, and nothing is called booked ahead.
- **"Nobody has talked to them yet" off a failed lookup.** `useCyclesRead` (renewals/usePipeline) says when the conversations couldn't be read; Coming up's renewal line then says so and gives no "not talked" count.
- **"0 due" off a failed gestures read.** `useDelightQueue` now carries `failed`; Going right says the gestures couldn't be read.
- **A no-show chased as never logged, or never logged called a no-show.** An unlogged session says only what is known (its trainer's row; "No Journey session for these today. Ask on the floor…" on its (i)); it becomes a late cancel only when someone marks it (wave 2), and until today's marks have been read nothing unlogged is counted, so a marked session never flashes back onto Needs you. A marks read that fails says the list may be short.
- **"All clear"** unless every read behind a section answered: an unread schedule or day's logging keeps its section, saying so; a nightly record that can't judge yet (`NIGHTLY_STALE_DAYS`, 3 quiet days, or none) is the page's one note, and the sections it covers are neither drawn nor called clear.
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
- `brief.ts` — the nightly record and its one note (`nightlyNote`), Catch today, leaving with nothing booked, since yesterday; `brief.test.ts`.
- `useNightlyNote.ts` — the note with the clients' names, for every Operations page.
- `brief-pieces.tsx` — a section (with its (i)), the counts line, the page's one note, All clear (styles in `../shell/ops.css`, prefix `ops-`).
- `pieces.tsx` — the row shape (ActionRows, with Why and Show all), the snooze chooser, the tappable line.
- `today.ts`, `questions.ts` (renewals, pain and incidents, the 60-day review, hours), `moments.ts`, `next-days.ts`, `team.ts`, `floor.ts`, `performance.ts` — pure, each with its test beside it (`performance.ts` is shared with the Sunday job).
- `useOverviewReads.ts` — incidents, critical and dated notes, the watch document.
- `useTodaySessions.ts` — today's Journey sessions, live, for what counts as done (`lib/booking-state.ts`).
- `ReviewNotesDialog.tsx` — the 60-day review.
- `overview.css` — the row shapes and the Changes day strip.
