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
- **Day** is the Hub's grid (`HubGrid`, `HubCard`): the time rail, real-length blocks with whole names, the orange now line on today, your column first under the blue "You" head, the empty middle of the day folded, and the hours a trainer isn't on hatched from the agreed standing week. Columns by the Hub's rule (`columns.ts`: the trainer id, else the Mindbody staff id at this studio's site, else Unassigned), which retires the Calendar's first-name and prefix matching (the Hub retired it on Oct 1 2026). A tap on a booking opens the client, as before. On a phone the Day is the Hub's phone list (`PhoneDayList`).
- **Week** shows the week's bookings day by day: a strip of the seven days (today's ring, the picked day blue), then each day's bookings by time, each one the client's whole name and the trainer, yours in blue. A tap on a booking opens the client; a tap on a day opens its Day. The charts (sessions per day, trainer load, when the studio is busy) fold under the strip, closed.
- **Unknown is never empty.** A day whose bookings weren't read says so ("Couldn't read this day's bookings · Try again", plum, the Hub's notice), through the schedule window's `dayState` and `retry`, which the Calendar now takes as the Hub does.
- **Colours.** Orange is today and now only; blue is picked and yours. The week's "up" delta is no longer orange; the avatars' raw `#fff` and dark hex are tokens; the trainer identity tones that were orange, the logo blue and the plum of caution moved to colours that mean nothing else.
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
