# Rooms, and the Calendar as the first room — Oct 10 2026

Branch `oct10/rooms-calendar`, on master's `609c2977`. The first room of AJ's design round: the shared **room bar**, and the **Calendar** rebuilt as its first room. Nothing pushed, nothing deployed.

## 1. AJ's words

On the design round (Oct 10 2026): "each place should feel a bit different but the same so it feels like one app but i feel like im in the learning area or the active session area or the client area so i can instantly know what im looking at when i pull up the app ... i think ill calendar would be the easiest to improve".

On the proposal page **Journey Rooms** (169 photos of every area, light and dark, upright and on its side, in the perf lab's practice studio), his answer the same day: **"take charge, i love the ideas"**. His picks are the page's recommended ones:

- **1b.** Name plates and a room hue: every room gets the same bar right under the navy frame, and each room's mark tile and a thin line under its bar take one quiet hue of its own.
- **2a.** The Calendar's Day view becomes the Hub's grid (whole names, the now line, your column first).
- **3b.** The Calendar's Week view shows the week's bookings, day by day, with the charts folded under them.

## 2. The decisions, as built

### 2.1 The room bar (1b)

- Every room gets the SAME bar right under the navy frame: the room's **mark** (an icon tile) and its **name** on the left (Saira Condensed 22/800, upright, its own capitalisation), **one visible switch** for the room's sections (the Hub's command bar look: a raised pick in a sunk well, the picked segment in blue words), and the room's own **tools** on the right. A second row under it, inside the same shelf, holds what the room needs beside its switch (the Calendar's date and Refresh).
- It is a **shelf** (Refined Lift: a room's bar over scrolling content casts `--shelf`), and it stays put while the room scrolls under it.
- `src/features/rooms/` holds `RoomBar` and `RoomSwitch`, the one kit every room's bar is built from. Learning, My Studio, Operations, Admins, the Hub, the client profile and the session take it in their own rounds; this round builds it and puts it on the Calendar only.

### 2.2 The room hue: a new colour job, "where you are"

The Navy Frame gave each of the logo's colours one job (blue is yours and picked, orange is now and go, crimson is critical, plum is caution). The room hue is a NEW job: **where you are**. The rule:

1. **A room hue goes on two things only: the room's mark tile and the 3px line along the bottom of its bar.** Never a button, a chip, words, a data mark, a fill, an edge or a focus ring.
2. Its tokens are `--room-<id>` in `src/index.css` (`:root` and `.dark`), with the mark's icon ink `--room-mark-ink` (and `--room-session-ink`: the session's mark is orange, and nothing puts white on an orange). **Nothing outside `src/features/rooms/rooms.css` reads a `--room-` token**, and inside it only the mark and the line read the hue (`room-hues.test.ts` holds both).
3. Each hue is measured in both modes: the mark's icon on the hue at least 3:1 (an icon that means something), the line on the bar's surface (`--card`) at least 3:1.
4. It must not read as one of the four colours that already mean something: every room's hue other than the Hub's and the session's sits at least 30° of OKLCH hue from the blue, the orange, the crimson and the plum, or is a grey (chroma under 0.06). The Hub keeps the logo blue (it is your day) and the session keeps the orange (it is now), so both stay inside the rules they already follow.

The hues, measured (`src/features/rooms/room-hues.test.ts`):

| Room | Light | Dark | Mark ink on hue (light / dark) | Line on the bar (light / dark) |
| --- | --- | --- | --- | --- |
| Hub | `#1F5E9C` | `#65ABE9` | 6.69 / 6.50 | 6.17 / 6.05 |
| Session | `#D45A06` | `#F36D21` | 4.53 / 6.05 (navy ink) | 3.68 / 4.96 |
| Clients | `#0E7C7B` | `#4CC2BF` | 5.01 / 7.42 | 4.62 / 6.91 |
| **Calendar** | **`#5048A6`** | **`#A79FF0`** | **7.45 / 6.73** | **6.87 / 6.26** |
| Learning | `#2E7D4F` | `#6BC793` | 5.05 / 7.76 | 4.65 / 7.22 |
| My Studio | `#85690A` | `#DDB955` | 5.22 / 8.46 | 4.81 / 7.88 |
| Operations | `#4A5A6C` | `#A3B3C4` | 7.07 / 7.44 | 6.52 / 6.93 |
| Admins | `#5E5470` | `#B9AED2` | 7.05 / 7.63 | 6.50 / 7.10 |

The mark ink is white in light and the frame's navy `#002341` in dark (the session's is the go pair's navy in both). Two hues moved from the proposal page: the **Calendar** from `#4B54A8` / `#9CA3F0` to a touch more violet (the page's indigo sat 28° from the picked blue; now 35° light, 41° dark), and **My Studio** from `#9A6A10` / `#E0B35A` to a yellower ochre (the page's sat 30° from the orange of now; now 44°). The rest are the page's.

### 2.3 The Calendar (2a, 3b, and the audit's fixes)

- **The room bar.** Mark and "Calendar"; the switch **Month · Week · Day**; the team filter on the right, a real picker (whole names, a list of 44px rows, the firm 3:1 edge), never a native select cut at 170px. Under it, in the same shelf: the date stepper (its arrows never move) with **Today** when you are elsewhere, and **Refresh** with its "Updated…" line. Full-bleed like the Hub and the Directory: the app's padded main and the old `.cal-shell` padding no longer double up.
- **Month** is one panel with quieter cells: the day number, the day's count (Saira), and a small mark when the day has a FORD life event (its words are on the Day view and in the cell's label, never sentences in the cell). Today is an orange ring on the day's number, the picked day blue, and where they coincide the blue with an orange underline outside it (the Hub's `.hd-day` rule). The trainers' avatar rows left the cells (trainer load lives in the Week's folded charts). The Sessions · Events switch went with them: the room has one switch.
- **Day** is the Hub's grid (`HubGrid`, `HubCard`): the time rail, real-length blocks with whole names, the orange now line on today, your column first under the blue "You" head, the empty middle of the day folded, and the hours a trainer isn't on hatched from the agreed standing week. Columns by the Hub's rule (`columns.ts`: the trainer id, else the Mindbody staff id at this studio's site, else Unassigned), which retires the Calendar's first-name and prefix matching (the Hub retired it on Oct 1 2026). A tap on a booking opens the client, as before. On a phone the Day is the Hub's phone list (`PhoneDayList`). Since the review (§10) its cards say what the Hub's say on the days the session stream covers, and nothing at all on the others.
- **Week** shows the week's bookings day by day: a strip of the seven days (today's ring, the picked day blue), then each day's bookings by time, each one the client's whole name and the trainer, yours in blue. A tap on a booking opens the client; a tap on a day opens its Day. The charts (sessions per day, trainer load, when the studio is busy) fold under the strip, closed.
- **Unknown is never empty.** A day whose bookings weren't read says so ("Couldn't read this day's bookings · Try again", plum, the Hub's notice), through the schedule window's `dayState` and `retry`, which the Calendar now takes as the Hub does. A failed span is asked for again every 30 seconds while it stays failed (§10).
- **Colours.** Orange is today and now only; blue is picked and yours. The week's "up" delta is no longer orange; the avatars' raw `#fff` and dark hex are tokens; the trainer identity tones that were orange, the logo blue and the plum of caution moved to colours that mean nothing else, and after the review to eight that are told apart from each other and from the room's hue too, held by `trainer-tones.test.ts` (§10).
- **Type.** The app's scale (11 · 12 · 14 · 17 · 22 · 30), big numbers in Saira, buttons 14/700, every tap 40px or more, names never cut.
- **The client's Activity Archive calendar** shares the Calendar's stylesheet and tokens (`.cal-shell`, `.cal-header`, `.cal-seg`, `--cal-*`). It keeps its own header and switch: the client profile is another room, and it takes its bar in its own round.
- **The Calendar's error screen** (AppContent) is drawn in the app's tokens, not raw Tailwind red and slate.

## 3. The plan, one commit per phase

| Phase | What |
| --- | --- |
| 0 | This document. |
| 1 | The room tokens (with the contrast and hue measurement in a test), and the shared `RoomBar` and `RoomSwitch` in `src/features/rooms/` (README, render test, the "--room only here" guard). |
| 2 | The Calendar's header becomes the room bar; full-bleed; Month as a panel with quieter cells; the today and picked rule; the colour fixes; unknown versus empty. |
| 3 | Day becomes the Hub's grid (the columns rule, the phone list). |
| 4 | Week becomes the bookings, the charts folded. |
| 5 | Type, taps and names; the guard lists; the Activity Archive check; the error screen. |
| 6 | The documents (the calendar README, the rooms README, KNOWN-TRAPS' Navy Frame part, the changelog and the rounds index) and the counts. |

Each phase is typechecked (2, the baseline) and the whole suite run before it is committed.

## 4. What was built, commit by commit

| Phase | Commit | What |
| --- | --- | --- |
| 0 | `96f1d6b0` | This document. |
| 1 | `30621cb2` | The room hues (`--room-<id>`, `--room-mark-ink`, `--room-session-ink` in `index.css`), measured and held by `room-hues.test.ts`; `src/features/rooms/` (`RoomBar`, `RoomSwitch`, `rooms.css`, `rooms.ts`, README, render test). |
| 2 | `72c590ce` | The Calendar's header becomes the room bar (the switch, `TeamPicker`, the stepper as a raised group, Today, Refresh); full-bleed; Month as one panel with quiet cells (the number chip, the count, a life-event dot), today orange and picked blue (`.hd-day`'s rule); the schedule window's `dayState` and `retry` handed in (AppContent), with one plum notice and Try again; the tones, the avatar ink and the delta out of the job colours. |
| 3 | `9bb66374` | The Day is the Hub's grid (`DayView` over `HubGrid` and `HubCard`, `PhoneDayList` on a phone), the columns by `columns.ts` (the Calendar's name matching retired everywhere), the hatching from the agreed standing week, the day's life events folded (`DayLife`); the bar folds into one line on a wide screen; the swimlanes' code and CSS removed. `HubCard` takes `opensPeek` (the Hub's cards unchanged). |
| 4 | `226b1bac` | The Week is the week's bookings (`buildWeekAgenda`): the strip, the charts folded, each day a panel of bookings by time, yours blue, the days already over folded in the week holding today. `--cal-mine` and `--cal-warn` join the palette copy. |
| 5 | `2235b6f6` | `calendar-look.test.ts` (the scale, the upright display face, no cut names, no raw hex, 40px taps, the error screen); the error screen in tokens, with Back to the Hub instead of a reload. |
| 5 | `15ccb24e` | The photos' fix: on a phone the bar's second row keeps one line (Refresh its icon, the stepper narrower). |
| 6 | `76ae9065` | The documents and the counts. |
| Review | `2fb83679` | The four bugs (§10, items 1 to 4): `HubGrid`'s `restWords`; the retry on an interval, forced, over the failed span only (Try again reads the same span); `stepDate`; the Day's card states (`cardDayReadable`, `hubCardState`'s "unread", the marks and the Critical triangle from the Hub's own reads). |
| Review | (this) | The rest (§10, items 5 to 12): stable doors and one map of day states, with the Calendar's quiet-tick test; the charts' comparison only on a whole prior week; the filter's words in the Week and the Month; the tones retuned and measured; `byTrainer` gone; the tests on a held clock; "1 session"; a Week booking with no profile says so. The documents and the counts. |

## 5. What the Day and the Week look like now

Photos on the perf lab (local emulators, project `demo-perf-lab`, the seeded studio Lakeside with its clock held at 09:40 on Oct 10 2026), the same names as the before set:

- **Before**: `scratchpad\rooms\shots\calendar-{month,week,day}-{portrait,landscape}-{light,dark}.png` and `client-archive-*.png` (the Journey Rooms photos).
- **After**: `scratchpad\rooms\after\` (the same twelve Calendar names and four `client-archive-*`), plus `calendar-day-phone-light.png` (390 x 844). The five Day photos were taken again after the review's fixes (portrait and landscape, light and dark, and the phone), on the same held 09:40. The scratchpad is `C:\Users\austi\AppData\Local\Temp\claude\C--Users-austi-Projects-Journey-System-Beta-master\2723221c-d4b5-45b2-9568-81d01750d27e\scratchpad\`.

- **Day**: the Hub's grid under the room bar. Lena's column first under the blue You head ("22 sessions · 16 to go"), then Dana, Jo, Marcus, Riley and Sam, every client's name whole, the 9:40 orange now line across the columns and the rail blue up to it; "2 life events" folded above. Since the review the morning says what happened, as the Hub does: at 9:40 the 7:00 to 8:30 bookings are done (the Hub's check beside the time, faded), the six 9:00s say "9:00 · Not logged" (faded), and everything from 9:30 is live; the counts match the Hub's exactly (24 done, 6 Not logged, 102 live, the same 10 Critical triangles). The day before, opened from the stepper, is 90 unread cards: no fade, no word, the triangles kept. Upright the six columns scroll sideways with yours pinned (the Hub's own behaviour); on its side they all fit. On a phone, the Hub's list, "with Dana" under each card.
- **Week**: the strip (Sat 10 blue with today's orange underline), "The week in charts" folded, Sunday "Nobody booked.", Monday to Friday folded to their heads ("83 sessions" and a chevron), then Saturday open: "7 AM · Anika Hollister with you (blue) · Patricia Petrakis with Dana · …", one row of whole-name cards per start time.
- **Month**: one panel filling the iPad under the bar, the counts in Saira, a dot on each day with a life event, today's 10 a blue chip with an orange underline.
- **The client's Activity Archive calendar**: unchanged to the eye (its header and switch are its own); it shares the token fixes.

## 6. What AJ should hear

1. **The hatching is in.** It costs one listener on the studio's standing weeks, only while the Day is on screen on an iPad, only for someone who works at the studio (`mayReadWeeks`), and it is the Hub's own read (the Hub isn't mounted while the Calendar is). Not cheap enough to leave out, cheap enough to keep.
2. **Two hues moved from the proposal page.** The Calendar's indigo sat 28° from the picked blue; it is now `#5048A6` / `#A79FF0` (35° and 41°). My Studio's ochre sat 30° from the orange of now; it is now `#85690A` / `#DDB955` (44°). The rest are the page's. **Learning's green sits on the same hue as the "renew" and "done" green** (5° light), and Clients' teal near dark's "done" teal (13°): not one of the four jobs the brief named, but worth a look when those rooms are built.
3. **The trainer tones changed**, in the Week's folded trainer load and in every client's History (their avatars and rows): they are now gold, olive, green, teal, cyan, slate, umber and spruce, none of them a colour with a job and no two alike (§10). Each trainer keeps the same slot (the hash didn't change), only the colour.
4. **Decided along the way** (each easy to turn back): the Day's life events are folded until tapped (a client's home life stays off a screen a client can see, the Hub's Get to know rule); in the week holding today the days already over start folded, so the Week opens on today; the Month's Sessions · Events switch went (the room has one switch); the Week's days are an agenda on an iPad on its side too (the brief allowed side by side; whole names read better as the agenda); a Day card on the Calendar shows no session number; a tap on a column head does nothing on the Calendar (on the Hub it opens that trainer's list). (The first build also showed no "Not logged" and faded every finished booking, which broke AJ's Sep 24 rule; the review changed it, §10.)
5. **The error screen** no longer reloads the page (a reload from a screen is a known trap: offline it opens blank, and it never asks about a session): it says "The Calendar couldn't open" and offers Back to the Hub.

## 7. Parked

- The client profile's Activity Archive keeps its own header and the old flat solid-blue switch (`.cal-seg`) until the profile's room round.
- The phone's Day list starts at the day's first booking, not at now (the Hub's `PhoneDayList`, unchanged).
- The Relay strip sits over the Day's grid, capped at a third of the room; its own look is Relay's round.
- Learning, My Studio, Operations, Admins, the Hub, the client profile and the session take their room bars in their own rounds; their hues are measured and waiting.

## 8. Measured

Typecheck **2** (the baseline: `clinical-review/charts.tsx`, `EditTrainerModal.tsx`). After the review: suite **13,679** passing in **823** files (the bugs commit alone measured 13,662 in 821). At phase 6: suite **13,647** passing in **821** files (`TZ=America/New_York npx vitest run --dir src --testTimeout=30000` in `.claude\worktrees\agent-aedbdb53ef5270ef8` on AJ's PC, its files in LF; master `609c2977` measured 13,514 in 818 the same way). Production build clean (`npx vite build`, `NODE_ENV` unset); the first screen **464.5 KB gzip** of the 480 budget (8 files, 1,606.8 KB raw); the Calendar stays a lazy screen (its chunk 19.2 KB, 7.0 KB gzip). After the review: the first screen **464.3 KB gzip** (8 files, 1,605.3 KB raw), the Calendar's chunk 20.5 KB (7.5 KB gzip). No rules, index, Functions, Mindbody or Firestore structure change: a push and Render's buttons would be the whole ship, and nothing has been pushed.

## 9. For CLAUDE.md after the trim

`CLAUDE.md` is being trimmed on another branch, so this round leaves it alone. What it should say once the trim lands:

- **Where things are**, a row: *Rooms (the room bar and the room hues)* — `src/features/rooms/`: `RoomBar` (the mark, the name, one switch, the tools, a second row in the same shelf; it folds into one line on a wide screen) and `RoomSwitch`; the hues are `--room-<id>` in `src/index.css`, painted on the mark and the bar's 3px line only. Read its README first; `docs/rounds/2026-10-10-rooms-calendar.md` is the round. The Calendar is the first room.
- **Where things are**, a row: *The Calendar* — `src/features/calendar/` and `components/CalendarView.tsx`: a room (the bar: Month · Week · Day, the team picker, the stepper, Refresh); Month one panel of quiet cells; Week the bookings day by day (`buildWeekAgenda`), the charts folded; Day the Hub's `HubGrid` and `HubCard` (columns by `columns.ts`, never a name), its cards saying what the Hub's say on the days the session stream covers and "unread" (no fade, no word) on the others (`cardDayReadable`, `lib/hub-card-state.ts`); unknown is never empty (the schedule window's `dayState` and `retry`). Read its README first.
- **Decisions**, under the Navy Frame: *A room's hue says where you are* (AJ's 1b, Oct 10 2026: "each place should feel a bit different but the same so it feels like one app"): a fifth colour job, on a room bar's mark tile and the 3px line along its foot only, never a button, a chip, words or data; measured in both modes (3:1 for the mark's icon and the line) and kept 30° of hue from the blue, the orange, the crimson and the plum unless a grey; the Hub keeps the logo blue and the session the orange. Held by `features/rooms/room-hues.test.ts`.
- **Commands**, the Tests row: **13,679** passing in 823 files on `oct10/rooms-calendar` (Oct 10 2026, after the review; typecheck 2; first screen 464.3 KB gzip), the previous row moved to `docs/KNOWN-TRAPS.md#baselines`.

## 10. The review's fixes (Oct 10 2026)

An independent review of the branch found four bugs and eight smaller things. AJ had said "take charge", so the one decision in it (item 4) was made here and is easy to turn back. Two commits: `2fb83679` the bugs, then the rest.

**The bugs**

1. **The Day under the team filter said "Nobody else is booked on this day"** beside the one column, even with others booked. `HubGrid` takes `restWords` (the Hub's sentence by default, so the Hub is untouched); the Calendar says "Showing Dana's bookings only" ("your" for your own).
2. **A failed day was asked for again once.** Now the failed span of fetched days (the first failed day to the last, never the whole range) is read again, forced, every 30 seconds while the page is visible, and the asking stops when none remain. Forced, because a day read earlier keeps that read's stamp and an unforced ask would skip it; the live days are the listener's, which reopens itself. Try again reads the same span (item 9) and reopens the listener only when a live day failed.
3. **Next month on the 31st skipped a month** (Oct 31 + 1 month is Dec 1). `stepDate` steps a month from its 1st.
4. **The Day faded every finished booking with no word**, which AJ's Sep 24 rule forbids ("a grey card with no word would read as done when it is not"). The decision: on the days the app's session stream covers (`cardDayReadable` in `lib/hub-card-state.ts`: the studio's today once the stream's server has answered, and the days ahead to the end of the Hub's window), a Day card says what the Hub's says, from the Hub's own reads and no new one: AppContent's `sessions` and `sessionsKnown` (done, **Not logged**, **In session**, Left open), `useBookingMarks` for the day on screen (**Didn't come**; only for someone who works at the studio), and `useHubCriticalNotes` for the day's booked clients (the red triangle, through the engine's own `readFirstMomentOf`). The Hub isn't mounted while the Calendar is, so the cost is the Hub's. On every other day, and today before the stream answers, a card is **unread**: it neither fades nor says a word, so nothing reads as done. The rule is one place: `hubCardState` takes `readable`, and `hubCardRecedes("unread")` is false.

**The rest**

5. **Re-render cost.** `openClient` reads the latest clients and AppContent's handlers through a ref and keeps its identity; `openDay` is a `useCallback`; each day's read state is asked once a render into one map (it was about eighty calls). `CalendarView.tick.render.test.tsx` holds it: a 30-second tick, a heartbeat in the session stream and new handlers from AppContent draw no Day card, and the Week is handed the same doors.
6. **"The week in charts" compared with a part-week** when only some of last week's days were in hand. It compares only when all seven read as ready; otherwise "No prior week loaded".
7. **The Week and the Month under the team filter** name the trainer on an empty day ("Nobody is booked with Dana.", a 0 in a Month cell with the trainer in its label), and a line says whose bookings are showing.
8. **The tones.** Two were 7° apart and the violet sat 6 to 10° from the Calendar's room hue. They are now **gold, olive, green, teal, cyan, slate, umber and spruce**, one solid each (the text, fill and edge values had no reader), and `trainer-tones.test.ts` holds them in both modes: 30° of OKLCH hue from the blue, the orange, the crimson, the plum and the room hue (or a grey), 0.08 apart in OKLab from each other, 3:1 on the card and the initials on them 4.5:1. The client History still reads: each row's edge is 3.8:1 or more on its row, hover included, and the avatars' initials are measured. Two near neighbours worth knowing, not among the four jobs: light's green tone sits 12° from the Hub's "done" green, and dark's teal 10° from dark's "done" teal.
9. **Try again** reads the failed span, not the whole range (with item 2).
10. **`byTrainer`** is gone from the Month's cells (nothing read it after the avatars left).
11. **The tests** run on a held clock (Wednesday Oct 14 2026, 9:40 AM): "opens on today" no longer returns early on a Sunday; a standing-weeks case for someone who doesn't work at the studio (no weeks and no marks read); no other real-clock dependency.
12. **"1 session"**, never "1 sessions" (the Week's strip, a day's head, the chart's bars). **A Week booking whose client has no profile** says "Not synced yet · with Dana" on a dashed edge and is no button (it was a tap that did nothing); while the client list is loading or failed it says nothing and waits.
