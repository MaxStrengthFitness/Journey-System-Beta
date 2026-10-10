# Calendar — the first room

Files: `src/features/calendar/`, and the container `src/components/CalendarView.tsx`.

*The rooms round, Oct 10 2026 — `docs/rounds/2026-10-10-rooms-calendar.md`.* AJ, on the design round: "each place should feel a bit different but the same so it feels like one app but i feel like im in the learning area or the active session area or the client area so i can instantly know what im looking at when i pull up the app ... i think ill calendar would be the easiest to improve". His picks on the proposal page "Journey Rooms": **1b** (every room gets the same room bar, with a quiet hue of its own), **2a** (the Day is the Hub's grid), **3b** (the Week shows the bookings, the charts folded). The Calendar is the first room built; the room bar is `src/features/rooms/` (read its README).

---

## 1. What each view is for

| View | The question | The form |
|---|---|---|
| **Month** | How busy is each day? | One panel: the day's number, its count, a mark for a client's life event |
| **Week** | Who is booked when, this week? | The week strip, then each day's bookings by time; the charts folded under the strip |
| **Day** | Who is with whom, hour by hour? | The Hub's grid: the time rail, a column per trainer, yours first |

None of them is a booking tool: Journey books nothing.

### 1.1 The room bar

`CalendarView` draws `RoomBar` (room `calendar`, the mark `CalendarDays`, the name "Calendar"):

- **the switch**, `RoomSwitch`: Month · Week · Day, the room's ONE switch. The Month's old Sessions · Events switch went: the cells no longer hold sentences.
- **the team filter**, `TeamPicker`: a raised button on the 3:1 edge saying whose bookings are showing, whole, and a list of 44px rows of whole names, yours first and marked You. It was a native select cut at 170px.
- **the second row**: the date stepper (`DateNavigator`, a raised group, its arrows pinned by a fixed label track, the period in Saira 17; a tap on the label is today), **Today** when the picked day isn't today, and **Refresh** with its "Updated…" line (on a phone, Refresh is its icon; its label keeps the word).
- On an iPad on its side the two rows fold into one line (rooms.css); on a phone the switch takes a line of its own.

The room is full-bleed like the Hub and the Directory: AppContent's main gives the Calendar no padding, the bar stays put, and the body (`.cal-body`) scrolls under it with its own padding. The Day takes the room under the bar itself (`.cal-daybody`), because the Hub's grid is its own scroller.

### 1.2 Month

```
┌──────────────┐
│ (10) •       │   the day's number as a chip, a dot for a life event
│              │
│          132 │   the day's count, Saira 22
└──────────────┘
```

- **Today is an orange ring** on the number and **the picked day is blue**; on a day that is both, the blue with an orange underline OUTSIDE the chip (the Hub's `.hd-day` rule: inside, it would be hue alone).
- **A life event** (a client's birthday, a dated FORD detail; `ford-events.ts`) is a small dot. Its words are in the cell's label and on the Day, never a sentence in the cell.
- **The month fills the room** under the bar: six weeks share the height, each at least `--cal-day-min` (88px, 76 on an iPad on its side, 72 under 768px, 64 on a phone).
- **No avatar rows.** Who carries the week is the Week's folded charts.
- A neighbouring month's day sits back in the well tone; its words stay the muted ink.
- **Under the team filter** a read day with nobody booked with that trainer says 0, and its label names them ("nobody is booked with Dana"); a line above the view says "Showing Dana's bookings only." ("your" for your own).

### 1.3 Week

- **The strip**: the seven days with each day's count, today an orange ring, the picked day blue; a tap opens that Day.
- **The charts** ("The week in charts": sessions per day, trainer load, when the studio is busy) folded under the strip, closed until asked for (`WeekCharts`). The delta against last week is said in the ink: an orange "up" read as now. It is said **only when all seven of last week's days read as ready** (`buildWeekSummary`'s `priorRead`); with any of them not read it says "No prior week loaded", never a comparison with a part-week.
- **The days** (`buildWeekAgenda`, pure, `selectors.test.ts`): each day a panel of its bookings by start time, every booking the client's whole name and who it is with ("with Dana"; whole names when two trainers' first names read alike; Mindbody's staff name for a booking no trainer claims). **Yours** come first in a slot, on the blue cast with a blue band and "with you" in blue. Mindbody's "Unavailable" is never a booking. A tap on a booking opens the client; a tap on a day's head opens its Day; the head sticks while its bookings scroll.
- **In the week holding today the days already over start folded** to their heads (their counts still said, "1 session", never "1 sessions"), so the week opens on today. A week in the past or ahead opens whole.
- **A booking whose client has no Max Strength profile yet** says so ("Not synced yet · with Dana", a dashed edge, the Hub card's words) and is no button: it used to be a tap that did nothing. While the client list is loading or failed it says nothing and waits (`profileOf`: linked, unlinked, unknown).
- **Under the team filter** an empty read day says "Nobody is booked with Dana." ("with you" for your own), not "Nobody booked."

### 1.4 Day — the Hub's grid

`DayView` draws the Hub's own `HubGrid` and `HubCard` (`src/features/hub-schedule/`, the reference look):

- the time rail, the empty middle of the day folded, blocks at their real length with **whole names**;
- the **orange now line** on today;
- **your column first**, under the blue You head, saying your day ("22 sessions · 16 to go");
- the hours a trainer isn't on **hatched from the agreed standing week** (`off-hours.ts`): one listener on the studio's standing weeks (`useStandingWeeks`), only while the Day is on an iPad and only for someone `mayReadWeeks` lets read them, so no refused listener is opened. The Hub is not mounted while the Calendar is, so it is the same one read. No agreed week, or no answer, hatches nothing.
- the day's **life events** folded over the grid ("2 life events", `DayLife`), their words whole on a tap, a tap opening the client: a client's home life stays off a screen a client can see until a trainer asks (the Hub's Get to know rule).
- On a phone the Day is the Hub's `PhoneDayList`.

A tap on a booking opens the client, as the Calendar always has (`HubCard` with `opensPeek={false}`, so it says nothing about a dialog).

**What a card says happened** (the review, Oct 10 2026; AJ's Sep 24 rule in `lib/hub-card-state.ts`: "a grey card with no word would read as done when it is not"). The Day reads what the Hub reads and no more:

- **The days the sessions cover** (`cardDayReadable`): the studio's today once the session stream's server has answered (AppContent's `sessions` and `sessionsKnown`, the stream ClientsView reads, the last 24 hours), and the days ahead to the end of the Hub's window (`hubWindow`, a week on). On those, a card says what the Hub's says: done, **Not logged**, **In session**, Left open, and **Didn't come** from a leader's mark (`useBookingMarks`, the Hub's own listener, for the day on screen, only for someone `mayReadWeeks` lets read the studio). The Hub isn't mounted while the Calendar is, so it is the same cost.
- **Every other day** (before today, past the window, or today while the stream hasn't answered): the card is **unread** (`hubCardState`'s `readable: false`). It neither fades nor says a word, so a finished booking never reads as done; its marks stay.
- **The red Critical triangle** from the Hub's one live read of the day's booked clients' Critical notes (`useHubCriticalNotes`), on any day, through the engine's own first moment (`readFirstMomentOf`, `hub-opportunities/moments-today.ts`). With some clients' notes unread the page says so once, as the Hub does.
- **Under the team filter** the rest of the row beside the one column says "Showing Dana's bookings only" (`HubGrid`'s `restWords`), never the Hub's "Nobody else is booked on this day", which would be untrue.

---

## 2. Whose booking — the Hub's rule

A booking goes to a trainer by `columns.ts` (`columnIdOf`): the booking's trainer id; else the Mindbody staff id **at this studio's site** (`staffIdsAt`, from AppContent's `mindbodySiteId`); else **Unassigned**, which says Mindbody's staff name whole. **Never a name.** The Calendar's `resolveTrainerId` tried a first name and a prefix ("Chris" took Christine's bookings, two Chrises swapped); the Hub retired that on Oct 1 2026 and the Calendar follows it everywhere it reads a booking's trainer (the Day's columns, the Week's "with", the team filter, a guest trainer on the picker).

The trainers arrive in the studio's order (AppContent's `sortedTrainers`): the Day's columns and the Week's slots run yours first, then that order, then Unassigned.

---

## 3. Unknown is never empty

The schedule window hands the Calendar the Hub's own `dayState` and `retry` (`useLiveSchedule`; `ScheduleWindowControls`):

- **Month**: a day not read yet shows no count; a day whose read failed shows a plum mark beside whatever is held; only a read day with nothing booked says "—".
- **Week**: a day not read says "Couldn't read this day's bookings.", never "Nobody booked."
- **Day**: "Nobody is booked on this day." only when the day was read; "Reading the day's bookings…" while it is.
- One plum notice above the view (the Hub's `HubNotice`) when any day on screen failed, with **Try again**: it re-opens the live listener (`retry`) only when a live day (yesterday to tomorrow) failed, and forces a read of **the failed span only** (the first failed fetched day to the last), never the whole range on screen.
- **While a fetched day on screen stays failed**, that span is read again, forced, every `FETCH_RETRY_MS` while the page is visible, and the asking stops once none remain (the review: it was asked once). Forced, because a day read earlier keeps that read's stamp and an unforced ask would find it fresh. The live days are the listener's, which reopens itself.

---

## 4. Colour

The Navy Frame's jobs hold: **orange is today and now only** (the ring, the now line, today's name and its bar); **blue is picked and yours** (the picked day, your column, your bookings, the switch's section). The **room hue** (`--room-calendar`, indigo-violet) is on the room bar's mark and its 3px line and nowhere else (`room-hues.test.ts`).

The calendar's palette (`calendar.tokens.css`) is a copy of the Hub's (`palette-copies.test.ts`), with `--cal-mine` (the blue cast under your Week bookings) and `--cal-warn` (the plum of a day not read) since the rooms round, and `--cal-tone-ink` (a trainer's initials: white in light, navy in dark; it was a raw `#fff` and `#06101a`).

**The trainer tones** are identity colours: an FNV-1a hash of the trainer id picks one of eight (`trainer-tone.ts`), so one trainer is one colour everywhere. They label a trainer where one is labelled (the Week's trainer load, a client's History: an avatar's fill, a bar, a row's edge), sparingly. Since the rooms round's review they are **gold, olive, green, teal, cyan, slate, umber and spruce**, one solid each (`--tN-solid`, republished as `--t-solid` by `.cal-tone-N`; the text, fill and edge values had no reader). **`trainer-tones.test.ts` holds them**, in light and dark: every tone 30° of OKLCH hue from the blue, the orange, the crimson, the plum and the Calendar's room hue (or a grey, chroma under 0.06); every two tones 0.08 apart in OKLab; each solid 3:1 on the card and a trainer's initials on it (`--cal-tone-ink`) 4.5:1. The review found two tones 7° apart and a violet 6 to 10° from the room's own hue.

---

## 5. Files

```
src/features/calendar/
  calendar.tokens.css   the palette copy, the trainer tones, light and dark (global: main.tsx)
  calendar.css          the room's body, the stepper, the picker, Month, Week, the Day's band; History's header
  types.ts              view models (CalendarSession, DayCell, WeekAgendaDay, WeekSummary…)
  selectors.ts          pure: month cells, the week's agenda and summary, visibleRange, studioMinutes
  trainer-tone.ts       the hash, initials, short names
  DateNavigator.tsx     the stepper
  TeamPicker.tsx        whose bookings
  MonthView.tsx         Month
  WeekView.tsx          Week (the strip, the folded charts, the days)
  DayView.tsx           Day (HubGrid + HubCard, or PhoneDayList)
  DayLife.tsx           the day's life events, folded
  TrainerAvatar.tsx     a trainer's initials in their tone (the charts, History)
  ford-events.ts        the life events: birthdays and dated FORD details (pure)
  useCalendarFord.ts    the one FORD read per month on screen (Month and Day)
  calendar-look.test.ts the type scale, the upright display face, no cut names, no raw hex, 40px taps, the error screen
  trainer-tones.test.ts the eight tones apart from each other, from the job colours and the room hue, and readable
```

`CalendarView.render.test.tsx` mounts the room on a held clock (Wednesday Oct 14 2026, 9:40 AM): the bar, Refresh, a month stepped from the 31st, unknown-versus-empty and its retries, the Month cells, the Day's grid, its columns and its cards' states, the team filter's words, the Week's bookings and folds. `CalendarView.tick.render.test.tsx` holds a quiet 30-second tick and a heartbeat in the session stream at no card drawn, and the Week's doors at the same identity.

---

## 6. Mechanics worth knowing

- **The schedule window** (cost clean-up round, Sep 2026): only yesterday, today and tomorrow are live; the Calendar asks `ensureRange` for the days on screen (`visibleRange`: the 42-cell month, the week, the day), and Refresh asks Mindbody for them (`pullFromMindbody`) and then re-reads the week ahead and the range on screen, forced. Fetched days are fresh within an hour. Its caption is always visible.
- **Timezone**: everything buckets on `studioDateKey`, never the browser's day; client-event dates (`"2026-09-08"`) are parsed at local noon. Per-cell and per-day words use `formatDateWords` with constant options (the iPad round's Intl trap).
- **The Week's day heads stick at `top: -14px`** (16 from 768px): the body's own top padding, negated (KNOWN-TRAPS: a sticky bar needs the scroller's padding negated).
- **`key` on a plain function component does not typecheck here** (React 19, no `@types/react`): list items are `memo` components or intrinsic elements.
- **The client's Activity Archive calendar shares this stylesheet and palette** (`.cal-shell`, `.cal-header`, `.cal-seg`, `.cal-empty`, `.cal-avatar`, `--cal-*`). The profile is another room and takes its bar in its own round, so those classes are History's now and the Calendar draws none of them; a change to them moves History.
- **The error screen** (AppContent, around `currentView === "calendar"`) is in the app's tokens and offers Back to the Hub, never a reload of its own.
- **The doors are stable** (the review): `openClient` reads the latest clients and AppContent's handlers through a ref, and `openDay` is a `useCallback`, so the 30-second tick and a new render of AppContent draw no Day card, Week day or Week booking again. Each day's read state is asked once a render into one map (`stateOfDay`), not about eighty times.
- **A month steps from its 1st** (`stepDate`): Next on Oct 31 is November, Previous on Mar 31 is February (a `setMonth` on the 31st overflowed into the month after).
