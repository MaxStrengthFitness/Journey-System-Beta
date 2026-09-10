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

Tapping a visit opens the session. Tapping a month's name opens the List view
at that month (or the nearest older month with sessions).

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
  history itself; with a window of it, down from the client's own
  `sessionCount`, so the oldest loaded row is not "S1".
- **Sticky headers** pin to the page scroller's real top edge. Every engine
  pins sticky boxes inside the scroller's padding, so against `<main>`'s `p-6`
  a plain `top: 0` stuck 24px down; `HistoryView` measures the padding.

## 7. Files

```
model.ts               pure: day keys, cadence, calendar + list models, summaries (36 tests)
trainers.ts            session → TrainerRef, same tones as the Calendar tab
useSessionHistory.ts   the listener and the per-session set loader
HistoryView.tsx        the tab, from props only (the harness renders this)
HistoryCalendar.tsx    years → month cards → day cells
HistoryStats.tsx       four tiles, the on-a-break notice, the legend
HistoryList.tsx        month cards, session rows, break rows
SessionDetailDialog.tsx  one session in full, edit / delete (moved, re-coloured)
LogPastSessionDialog.tsx the backfill form (moved)
ClientHistoryTab.tsx   container: hooks + dialogs
client-history.css     layout; tokens come from calendar, journey-grid, equipment
```
