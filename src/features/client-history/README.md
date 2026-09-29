# Client History — design notes

Round: History tab, Sep 10 2026. Replaces `components/ClientHistoryCalendar.tsx`
(1,775 lines). Verified with `npx tsc --noEmit` (no new errors), `npx vitest run`
and the harness at 834×1194, 1024×1366, 1194×834 and 1366×1024 in both themes.
**Not yet looked at on a real iPad.**

---

## 1. What was wrong

AJ's brief, in his words: the calendar "only shows one month at a time, i want to
be able to see all the months so i can see their history a little bit more
clear … calendar is supposed to be a visual representation so the trainers can
see when they took breaks, how much time they take in between, how consistent
they are". And the list should "look like our app more".

Underneath that, three things the screen could not do however it was drawn:

| Found | Consequence |
|---|---|
| The calendar subscribed to `limit(30)` sessions, full stop | About four months of history, ever. Paging back further showed empty months that were not empty. |
| "Load More Sessions" under it set `sessionLimit`, which nothing read | The one escape hatch did nothing. |
| The list took sets from the profile's `allLogs` — the newest 15 sessions | Every older row said "No machines logged" and 0 lb. |

And two that were simply wrong:

- The session pop-up still coloured rep quality with the retired amber /
  orange set, so one set was two colours depending on the tab you read it in.
- Its "Client Status / Additional Context" box and priority picker were never
  saved. Anything typed there was thrown away on Save.

## 2. The calendar — every month at once

Each month is the Calendar tab's month grid in miniature: the same hairlines,
Sunday-first week, tokens (`--cal-*`), shell, header and segmented control. A
full-size month fills a screen, which is the exact problem, so the grid shrinks
and the months tile: 3 across in iPad portrait (a whole year on one screen at
834×1194), 4 on a 13" portrait, 6 in landscape (a year in two rows).

| Cell | Means | Why this colour |
|---|---|---|
| Blue fill | a visit | The Week view's heatmap blue — "busy" already means blue in the calendar |
| Hatch | inside a break of 2+ weeks | Absence is drawn as texture, not as a colour that competes with visits |
| Sand | covered by a Vacation / Snowbird / Medical event | Says "away, and we knew" — the break explains itself |
| Orange ring | today | The only orange on the tab; orange stays the hero colour |
| Orange corner dot | another client event that day | Named under the month, never inside a cell |
| Blue outline | booked, not yet happened (Sep 26 2026) | The visit's own blue: the colour says "a visit", the outline says "not yet" |
| × in the bottom-left corner | a booking for that day was cancelled | A quiet glyph in the second ink, diagonally away from the event dot |
| → in the bottom-left corner | a booking left that day for another | Same corner, same ink; a day with both shows the × |

Tapping a visit opens the session. Tapping a month's name opens the List view
at that month (or the nearest older month with sessions). Every booking mark
is also written under its month, one line each — section 8.

**Why no trainer colours in the grid:** the questions are when, how often, and
where the gaps are. A cell coloured by trainer answers "who", and five colours in
a year of cells is noise. Who coached is in the list, in the calendar's tones.

## 3. The numbers on top

| Tile | Definition | Why that definition |
|---|---|---|
| Visits a week | visit days in the last 12 weeks ÷ weeks — or since the first visit, if that is sooner | Twelve weeks is stable but current; a new client is not divided by weeks they were not a client |
| Typical gap | 25th–75th percentile of the gaps between visits | A Mon/Thu client reads "3–4 days", the way a trainer says it; a wide range *is* the inconsistency |
| Breaks of 2+ weeks | gaps ≥ `BREAK_MIN_GAP_DAYS` (14) | Catches a once-a-week client missing a week, never fires on a normal week |
| Longest break | the longest of those, with dates; crimson while still going | |

A client who has not been in for two weeks gets a crimson notice above the tiles
("No visit in 5 weeks — last visit Aug 4"), with the away event if one explains it.

## 4. The list

One card per month, newest first. A row reads left to right in the order the
questions get asked: **when** (the calendar's day tile) · **who** (avatar and a
left edge in the trainer's calendar tone) · **what** (session number, routine
letter in the Routines tab's badge, time) · **how** (one bar per machine in the
Journey grid's rep-quality colours, stars and kaizens counted, machines that went
up in weight in blue) · **how much** (volume, against the last session on the
*same routine* — A/B clients would otherwise flip every row).

Breaks are written in between the sessions they separate, in the calendar's
hatch, with the away event that explains them.

## 5. Data

- `useSessionHistory` — ONE live listener, newest 200 sessions, then 2,000 on
  "Load full history". A listener rather than cursor pages so an edit or delete
  anywhere on screen is live. Session docs only.
- `useSessionLogs` — sets per session, on demand, `sessionId in` batches of
  ten. The list asks for a month's sets when the month comes within ~1.5
  screens; the calendar asks for none. The profile's already-loaded sets are
  seeded in and never re-read.
- **Reads:** opening the tab costs up to 200 session reads (was 30). Sets are
  the expensive part (~8 per session) and are only read for months someone
  scrolls to in the list.
- `useClientBookings` (Sep 26 2026) — ONE `getDocs` of her `schedules` rows
  per opening of the tab, from the Monday before the first month the calendar
  draws, no upper bound. About 115 rows a client-year. Section 8.

## 6. Rules worth knowing

- **A session's day comes from its start instant in studio time**, not
  `session.date`. Until Sep 10 2026 the live flow wrote `date` as the UTC date,
  so anything started after 8 PM Eastern (7 PM in winter) was stored as the
  next day. New sessions store the Eastern day now (`studioTodayKey` in
  `lib/studio-time.ts`), but saved sessions were left as they are — AJ chose
  "going forward only" — so the start-instant rule still matters for them.
  Imported and backfilled sessions have no real start time and use `date`.
- **A set is real when something was lifted or held.** "Log past session"
  seeds zero-weight placeholder sets; they are not counted as machines done.
- **"Heavier" never compares across a session whose sets are not loaded** — it
  breaks the chain instead, so the count can be low near the loaded edge,
  never wrong.
- **Numbers:** with the whole history loaded, sessions are numbered from the
  history itself plus whatever came before Journey (`priorUncounted`); with a
  window of it, down from the client's own `sessionCount`, so the oldest
  loaded row is not "S1". A client whose total nobody has recorded
  (`canQuoteSessionNumber` false) gets no numbers at all — Journey's own count
  would call a twelve-year client's sessions S1, S2, S3 (Sep 24 2026).
- **A gap is a break only where Journey sees every session** (Sep 24 2026).
  FileMaker stays live through the migration, so a gap between two Journey
  sessions may be weeks recorded only there. `ClientHistoryTab` works out
  `ownedWindow` (`lib/history-claims.ts`): the whole timeline for a complete
  story, otherwise the days from the client's HOME studio's cutover or after
  her prior record runs through, whichever is later. `computeCadence` drops
  every gap that begins before it, so the notice, the break rows, the
  calendar's hatch and the tiles all agree. With no owned day yet the two
  break tiles become "In Journey since" and "Before Journey". `HistoryView`'s
  default window claims nothing.
- **No crimson for absence.** The ongoing break and its notice use the
  equipment tokens' warning plum (`--eq-warn`); crimson is the kaizen mark,
  reserved for rep quality.
- **Sticky headers** pin to the page scroller's real top edge. Every engine
  pins sticky boxes inside the scroller's padding, so against `<main>`'s `p-6`
  a plain `top: 0` stuck 24px down; `HistoryView` measures the padding.

## 7. Editing a session after the fact (Sep 17 2026)

Round: `docs/rounds/2026-09-17-history-editing.md`. Two surfaces changed and
one pure module appeared; the rest of this document still describes the tab.

### The session pop-up

Edit mode could change the numbers on a set and nothing else. It now also
**adds** machines (the Routine Builder's own `MachinePicker`, opened inline
— a sheet over a dialog leaves an iPad two Back gestures deep) and
**removes** them, and every save **stamps** the session.

Three rules:

- **Nothing is written until Save.** Added machines and removed sets are
  drafts on screen; one batch at the end.
- **A removed set is struck through, not hidden.** The bin becomes an undo
  arrow. A row that vanishes on a mis-tap cannot be put back by someone who
  does not already know what was in it.
- **An edited session says so.** `editedAt`, `editedById` (the Auth uid),
  `editedByName`, `editedByInitials`, `editCount` on the session document; an
  **Edited** badge in the header and "Edited by AJ on Sep 17" under the date.
  AJ chose the stamp over a field-by-field change log.

**Rep quality can be cleared** here and in the entry form — tapping the one
that is on unsets it. On a session rebuilt weeks later "I do not remember" is
a real answer, and the red kaizen mark drives the Deep Dive.

### "Log past session"

Three panes: **When** (date, trainer) · **Machines** · **Numbers**. The
middle one is the Routine Builder's picker, coverage strip and sortable row,
with a chip per routine that injects the whole thing in a tap. A trainer
reconstructing a session from memory is doing what they do when they build a
routine, so the screen that helps them do it well already exists — and "no
upper-body push" is a good prompt that a machine has been forgotten.

**It counts** (AJ's call, Sep 17): `sessionCount`, `completedSessions`, the
trainer tally and `machineStats` through `completedSessionRollup`, plus
`countsTowardTotals: true` on the document. A machine left with no reps is
written as a skipped machine, never as a performed set of zero, and the footer
says how many before Save.

### The two pieces of arithmetic

Both in `session-edits.ts`, both pure, both tested:

- **`machineVoteDelta(before, after)`** — `machineStats.<id>.timesPerformed`
  is a running total kept at write time (one vote per machine per completed
  session, performed sets only), so an edit has to move it. It takes the
  session's whole set list on both sides, not the added and removed rows,
  because a machine with two sets can lose its vote while staying in the
  session. First/last dates are not recomputed — the same trade the delete
  path makes, for the same reason.
- **`ownsClientCounters(session)`** — the one place that decides whether a
  session owns the client's counters. A completed live session does; a
  backfill written from Sep 17 2026 does (the flag says so); **an older
  backfill does not.** It incremented nothing, so deleting it must decrement
  nothing — the old path decremented every backfill and pulled the client's
  counters one lower than the truth each time.

### Rules

`exerciseLogs` and `sessions` can be deleted by trainers now, each scoped like
that collection's own `update` rule. Both were super-admin-and-franchise-owner
only, so the Delete Session button in this dialog had never worked for a Life
Transformer or a Studio Leader. **Needs a rules deploy.**

## 8. Her bookings on the calendar (Sep 26 2026)

AJ, reviewing the Activity Archive's calendar: "we could always show the
clients upcoming sessions also on this calendar view. We can also log like,
oh, here was a canceled session ... Are the rescheduled sessions here? Are
there upcoming sessions here? Are there past sessions? It's like kind of like
the whole history and they're all looking at it just from above."

The calendar drew the past from her **sessions** (what Journey logged). It now
lays her **bookings** (`schedules`, what Mindbody holds) over them, for the
three things a session cannot say. `bookings.ts` is the pure half.

| Mark | When | Rule |
|---|---|---|
| **Booked** (blue outline) | a booking whose start is later than now — today's later bookings too | Read through `lib/booking-state.ts`, never from `status` alone: a booking on a day Journey logged a session for her is done, not still to come |
| **Cancelled** (×) | status "Cancelled" **and** a `cancelledAt` stamp | Read as a reschedule only for a REAL rebook, by the Operations Changes list's own rule (`admin/changes/changes.ts`, `changesForDay` and `isRealRebook`), not a second one |
| **Moved** (→) | `movedFromDay` names the day | Marks the day the booking LEFT and says where it lives now. A new time on the same day is not a move |
| **Didn't come** (○) | a leader marked the booking "didn't come" (`studios/{s}/bookingMarks`, Operations room wave 3, Sep 29 2026) | Read through `lib/booking-state.ts` (a no-show), never from `status`: a session Journey logged that day still beats the mark. The tab reads the marks with ONE listener over the days drawn (`useBookingMarks`, the studio the iPad is in), and a mark is applied only to a booking at that studio, because the two Mindbody sites number appointments on their own |

**A cancellation from before the stamps is never drawn.** Until about Sep 16
2026 an old sweep marked every past booking "Cancelled" on every sync, and
those rows were never repaired. They carry no `cancelledAt` — the stamps
arrived with the Operations overhaul, about Sep 19. Drawn, they would cover a
client's summer in cancellations that never happened. So the calendar shows
only the cancellations Journey saw happen, and a trainer should read an
empty August as "none recorded", not "none".

**Only a real rebook says "rebooked"** (AJ, Sep 26 2026). A cancellation with
another live booking that week was read as a reschedule, and for a
twice-a-week client that other booking is nearly always her standing
Thursday, booked all along. The other booking is named only when it first
appeared with the cancellation — its `createdAt`, when Journey first wrote the
row, at most 12 hours before the cancellation was stamped (the front desk
often books the new slot first) — and had not already happened (nobody
rebooks into the past). A standing booking, or one with no `createdAt`,
leaves the line at "cancelled". The rule is the Changes list's own
(`isRealRebook`, `REBOOK_WINDOW_MS` in `admin/changes/changes.ts`), so
Operations → Changes and this calendar can never read one booking two ways.
Nothing new is stored.

**Past still-booked rows add nothing.** The visit layer speaks for the past,
and no booking can prove a no-show: bookings never come back Completed
(`docs/rounds/2026-09-24-done-means-logged.md`). There is no "missed" mark.

**The range runs forward** to the month of the last mark — usually the last
upcoming booking — so next month shows when she is booked in it. A month
still ahead counts "3 booked" in place of sessions; a year still ahead says
what is in it ("4 booked · 1 cancelled").

**Words, not only marks.** Under each month, one line per mark, in the month's
event style and in time order — it wraps rather than cuts, because it carries
a trainer's name:

```
Sep 18 · moved to Tue Sep 22
Sep 20 · cancelled
Sep 23 · cancelled, rebooked Fri Sep 25
Mon Sep 28 · 3:00 PM · booked with Giovanni
```

A day with two cancellations gives each its time. The trainer is the roster's
first name when the booking is linked to a trainer, else Mindbody's; the pull's
no-staff placeholder ("Solon Rotation") names no one. Each cell's spoken label
carries the same lines. The legend shows Booked, Cancelled and Moved only when
the calendar draws one.

**The read.** `useClientBookings` asks once her sessions have settled, because
the first day the calendar draws comes from them: `clientId ==`, `startTime >=`
the Monday on or before the 1st of the first visit's month (so the same-week
rule sees that whole week), `orderBy startTime asc`, no upper bound, cancelled
rows included. The composite index and the rule were already there (the
renewals' live read and the profile header ask the same shape). "Load full
history" moves the first month back and asks again from there. The profile
does not remount this tab between clients, so what is held names the client it
was read for and a late answer for the last client is dropped.

**A failed read is unknown, never "no bookings".** The calendar draws no
booking layer and the legend says "Bookings did not load — check the
connection and open the tab again." An answer from the offline cache counts as
failed: it may hold a fraction of her bookings, or last week's version of them.
While the read is on its way the legend says "Loading bookings…".

**Not done:** the List view does not show bookings, and a client with no
sessions yet still gets the empty state, not her upcoming bookings.

## 9. Files

```
model.ts               pure: day keys, cadence, calendar + list models, summaries (41 tests)
bookings.ts            pure: her bookings as calendar marks (booked, cancelled, didn't come,
                       moved), where the read starts, the words under a month
                       (30 tests, calendar-with-bookings included)
session-edits.ts       pure: the edit stamp, the machine-vote delta, who owns the
                       client's counters, the shape of a set added by hand (25 tests)
trainers.ts            session → TrainerRef, same tones as the Calendar tab
useSessionHistory.ts   the listener and the per-session set loader
useClientBookings.ts   the one read of her bookings (+ ClientHistoryTab.render.test)
HistoryView.tsx        the tab, from props only (the harness renders this; + a
                       render test: breaks, session numbers, her bookings)
HistoryCalendar.tsx    years → month cards → day cells, the booking glyph
HistoryStats.tsx       four tiles, the on-a-break notice, the legend
HistoryList.tsx        month cards, session rows, break rows
SessionDetailDialog.tsx  one session in full: edit, add and remove machines, the
                       stamp, delete (+ a render test of edit mode)
LogPastSessionDialog.tsx the three-pane manual entry form (+ a render test that
                       walks the whole flow)
ClientHistoryTab.tsx   container: hooks + dialogs
client-history.css     layout; tokens come from calendar, journey-grid, equipment
```
