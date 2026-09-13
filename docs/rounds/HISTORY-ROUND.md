# The History tab round (Sep 10, 2026)

> **Update, the same evening:** this round went live as part of the Sep 10 go-live, together
> with the Eastern-time fix and the Learning tab. The commits below were made by
> `ship-sep10.ps1` on branch `sep10-go-live` — see **`GO-LIVE-SEP10.md`**. The commit list is
> kept here as a record of what each phase contains.

No Firestore rules or indexes change in this round.

---

## What you asked for

> "the calendar view within that needs match the look of the calendar that the trainers use on
> the calendar tab … i want to be able to see all the months … calendar is supposed to be a
> visual representation so the trainers can see when they took breaks, how much time they take
> in between, how consistent they are … i feel like we can upgrade the information thats on the
> list view and make it look like our app more"

## What changed

**Calendar → every month at once.** Each month is a mini copy of the Calendar tab's month grid
(same hairlines, colours, header, segmented control). 3 months per row in portrait — a whole
year fits on one screen on an 11" iPad — and 6 per row in landscape, so a year is two rows.

| You see | It means |
| --- | --- |
| Blue day | a visit (the same blue the Calendar tab's week heatmap uses for "busy") |
| Hatched days | a break — two weeks or more without a visit |
| Sand days | a Vacation, Snowbird or Medical event covers them — the break explains itself |
| Orange ring | today |
| Small orange dot | another client event that day (progress report, birthday…), named under the month |

- **Tap a blue day** → that session opens. **Tap a month's name** → the List opens at that month.
- **Four numbers on top:** visits a week (last 12 weeks), typical gap ("3–4 days"), how many
  2-week+ breaks, and the longest break with its dates.
- **A red notice** when a client hasn't been in for two weeks: "No visit in 5 weeks — last visit Aug 4".

**List → rebuilt in the app's style.** Each row: the day tile · trainer avatar in their calendar
colour (also the row's left edge) · session number · routine letter · time · **one little bar per
machine in the Journey grid's colours** (green = max strength, grey = completed, red = needs work)
· stars and kaizens counted · machines that went up in weight (blue) · days since the last visit
· the session's note · volume vs the last session **on the same routine**. Breaks are written in
between the sessions, in the same hatch as the calendar.

**Session pop-up → same colours as the Journey grid**, and it now shows the check-in and "felt
after" answers when the session recorded them.

## What was broken underneath (all fixed)

1. **The calendar only ever downloaded the last 30 sessions** — about four months — so older
   months looked empty when they weren't. It now loads the newest 200 (about two years for a
   twice-a-week client), with a **Load full history** button for anyone longer.
2. **"Load More Sessions" under the calendar did nothing.** It changed a number no code read. Removed.
3. **List rows older than ~15 sessions said "No machines logged, 0 lb".** Sets are now loaded
   month by month as you scroll.
4. **The pop-up used the old rep-quality colours** (amber = completed, orange = poor).
5. **The pop-up's "Client Status / Additional Context" box threw away whatever was typed.** It was
   never saved. Removed — the real check-in data shows there instead.
6. **The pop-up's TSC button could corrupt a set.** It flipped one of the two "timed" flags the live
   session writes, so a hold could never be switched back and its seconds were zeroed.
7. **Deleting a "Log past session" entry lowered the client's session count, Top Trainer tally and
   machine counts** — which that entry had never raised. It no longer does.
8. **Delete could run before the session's sets had loaded**, orphaning them. It now waits.
9. **Routine letters were blank on every live session.** The live flow saves the routine's id, not
   its name; the tab now looks the name up.

## Check it on the iPad

Open any long-standing client → **History**.

- [ ] **Portrait:** all of this year's months are on screen at once below the four numbers.
- [ ] Find a client who went away (vacation / snowbird): the gap is hatched and the away days are sand.
- [ ] Scroll down: the year title ("2025") stays pinned at the top while its months pass under it.
- [ ] Tap a blue day → the session opens on the right date. Close it.
- [ ] Tap a month's name → you land on that month in the List.
- [ ] **List:** rows show the coloured bars, trainer avatar, routine letter and volume. Scroll down a few
      months — rows should fill in without you waiting on grey placeholder bars.
- [ ] Open a session → **Edit** → change a weight → **Save changes**. The row updates. Use a test
      client, or change it back afterwards — your local app writes to the real database.
- [ ] **Landscape:** six months per row; a whole year is two rows.
- [ ] Dark and light mode both.
- [ ] A client with 200+ sessions: the bottom says "Showing the newest 200 sessions of N" → **Load full history**.

Screenshots of anything that looks wrong, as usual.

## The commits — one per phase (made by the go-live script; kept as a record)

Nothing to run here any more — this is what each phase contains:

```powershell
cd C:\Users\austi\Projects\Journey-System-Beta-master
git checkout -b client-history

git add src/features/client-history/model.ts src/features/client-history/model.test.ts src/features/client-history/trainers.ts
git commit -m "History: pure model - days, breaks, cadence, calendar and list shapes (36 tests)"

git add src/features/client-history/useSessionHistory.ts
git commit -m "History: load the whole history live, and sets on demand"

git add src/features/client-history/client-history.css src/features/client-history/HistoryCalendar.tsx src/features/client-history/HistoryStats.tsx
git commit -m "History: every month at once, in the Calendar tab's language"

git add src/features/client-history/HistoryList.tsx
git commit -m "History: the list, rebuilt in the app's style"

git add src/features/client-history/SessionDetailDialog.tsx src/features/client-history/LogPastSessionDialog.tsx
git commit -m "History: session pop-up in the Journey grid's colours; four data fixes"

git rm src/components/ClientHistoryCalendar.tsx
git add src/features/client-history/HistoryView.tsx src/features/client-history/ClientHistoryTab.tsx src/features/client-history/index.ts src/components/ClientProfileView.tsx
git commit -m "History: wire the new tab into the profile; retire the 1,775-line calendar"

git add src/features/client-history/README.md HISTORY-ROUND.md ROADMAP.md
git commit -m "Docs: the History round"
```

In the go-live script these ran on `sep10-go-live` instead of `client-history`, after the
Eastern-time commit — the profile's event form picked up the Eastern day in the same file, so
the "wire the new tab" commit carries those two lines too.

## How to undo it

| To undo | Do this |
| --- | --- |
| The whole round | `git revert` the "wire the new tab" commit. The old calendar file comes back and the profile points at it again. |
| One phase | `git revert <sha>` — that is why they are separate. |

## Checked here

- `npx tsc --noEmit` — **no new errors.** On your PC expect the same count as before this round.
- `npx vitest run src` — **1,429 passing** (36 new, in `model.test.ts`).
- `npx vite build` — clean.
- Rendered at 834×1194, 1024×1366, 1194×834 and 1366×1024, light and dark, plus the session
  pop-up and edit mode. Day taps, month taps, pinned headers and set prefetching were exercised
  in a headless browser. A second reviewer went through the code and every bug it found is fixed.

## Flagged, not changed

- ~~**The live session saves `date` as the UTC day.**~~ **Fixed the same evening**, going forward
  only (AJ: "we are based in Ohio so we should go off EST"). New sessions, check-ins, progress
  reports and events store the Eastern day; saved sessions keep theirs, and History still places
  them by their start time.
- **"Log past session" doesn't record which trainer by id**, only initials, and doesn't raise the
  client's counters. Unchanged here (it's a write-shape decision), but worth deciding.
- **Reads:** opening History now reads up to 200 session documents (was 30). The list's sets are
  read only for months you scroll to.
- ~~**Three typecheck errors in the Studio Hub work.**~~ **Fixed the same evening.** One of them
  was a real bug: the assign dialog listed every trainer as "A trainer" and saved that as the
  assignee's name. The missing `src/features/notifications/` file went in with the go-live too.
