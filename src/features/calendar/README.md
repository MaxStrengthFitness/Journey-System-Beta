# Calendar — design spec

Redesign of the three calendar views in The Journey System: **Month**, **Week**
and **Day**. Files: `src/features/calendar/`.

`CalendarView.tsx` went from 1,630 lines to 403 — it is now a container that
resolves and filters, nothing more.

---

## 1. UX rationale

### 1.1 What the calendar is for

The Hub already answers *"what is happening right now"* — a live, vertical,
trainer-column timeline of today. The calendar was quietly competing with it:
all three views drew the same session blocks at three zoom levels, so the only
difference between them was how much whitespace you got.

The redesign gives each view one question it alone answers:

| View | The question | The form |
|---|---|---|
| **Month** | How busy is each day, and who is in? | Grid of counts + trainer avatars |
| **Week** | How much work is this week, and who is carrying it? | Dashboard: total, day bars, leaderboard, heatmap |
| **Day** | Who is loaded, and where are the gaps? | Horizontal trainer swimlanes |

None of them is a booking tool. The header still says READ ONLY because it
still is.

### 1.2 Colour was positional — that was the real bug

The old code picked a trainer's colour like this:

```js
TRAINER_COLORS[trainerIdx % TRAINER_COLORS.length]
```

where `trainerIdx` was the trainer's **index in whatever list that view had
just built**. Filter to one trainer, switch studios, or have someone drop out
with no sessions that week, and every trainer below them shifts a colour.
Christian could be orange in Month and blue in Day, in the same session.

A tone is now an FNV-1a hash of the trainer **id**:

```ts
toneFor(trainerId) // -> 0..7, stable forever
```

Eight tones, each carrying four values because they do four jobs at four
different contrast requirements:

| Token | Job | Requirement |
|---|---|---|
| `--t-solid` | avatar fill, bar fill, block edge | ≥ 3:1 (non-text) |
| `--t-text` | small text in the trainer's colour | ≥ 4.5:1 |
| `--t-fill` | soft tint behind a session block | surface tint |
| `--t-edge` | 1px border, lane left-edge | ≥ 3:1 |

A `.cal-tone-N` class republishes its four values under generic names, so no
component ever knows which tone it is rendering.

Dark mode is re-tuned, not flipped: fills become low-alpha washes mixed into
the dark surface, and accent *text* climbs the hue rather than darkening.

### 1.3 The arrows moved

The old header put the title between the two chevrons, so "September" and
"May" pushed the next-arrow to different x positions. Stepping through months
meant the arrow slid out from under your thumb every tap — on a tablet that is
a mis-tap generator, not a cosmetic wobble.

`DateNavigator` puts the label in a fixed-width track (`min-width: 190px`,
140px under 640px). The arrows are fixed-basis flex items at each end and
cannot move. Tapping the label jumps to today, which is what the old separate
TODAY pill did.

---

## 2. The three views

### 2.1 Month

The old cell spelled out full trainer names on separate lines. Five trainers on
a Wednesday wrapped into six lines, blew the cell height out, and dragged the
whole row with it. That is why the grid looked ragged.

```
┌──────────────────────┐
│ 8            12 SES  │   day number left, total right
│                      │
│ ● Birthday — Toni Z. │   events, max 2, priority dot
│                      │
│ (GL)⁴ (CL)³ (MB)² +2 │   avatars with count badges, max 4
└──────────────────────┘
```

Nothing in the cell can wrap, so every cell is the same height and the month
reads as a *shape*. Avatars cap at four with a `+n` — past four, the exact
roster is a Day-view question. Empty days show a muted em-dash rather than a
`0`, so a quiet day recedes instead of competing.

### 2.2 Week — a dashboard

```
┌────────────────┬──────────────────────────────────────────┐
│      52        │  SESSIONS PER DAY                        │
│ SESSIONS THIS  │   4   9  11   6  12   8   2              │
│ WEEK           │   ▁   ▅   █   ▃   █   ▄   ▁              │
│ ▲ +11 (+27%)   │  SUN MON TUE WED THU FRI SAT             │
│ Busiest: Tue   │                                          │
├────────────────┴──────────────────────────────────────────┤
│ TRAINER LOAD          │  WHEN THE STUDIO IS BUSY          │
│ (GL) Giovanni ██████ 18│         S  M  T  W  T  F  S       │
│ (MB) Marina   ████   12│  EARLY  ·  2  3  1  4  2  ·      │
│ (CL) Christian███    10│  MORN   1  4  5  3  5  3  2      │
│ (AU) Austin   ██      7│  MIDDAY ·  2  2  1  2  2  ·      │
│ (AR) Arielle  █       5│  EVENING·  1  1  1  1  1  ·      │
└───────────────────────┴───────────────────────────────────┘
```

- **The delta is honest.** `previousTotal` is `null` — not `0` — when no prior
  week is loaded, and the badge reads "No prior week loaded" instead of
  claiming a 100% collapse because history has not been fetched.
- **Bars scale to the week's own busiest day**, not a fixed ceiling, so a quiet
  week still has shape instead of seven stubs.
- **The heatmap is four time BANDS, not 28 half-hour rows.** A 40-session week
  spread over 28 rows is a field of 0s and 1s that shows nothing. Four bands
  put enough sessions in each cell for the differences to be real, and the
  whole thing fits with no scrolling. The ramp is one hue in six steps so it
  reads as a scale rather than a rainbow, and in dark mode it climbs *into* the
  surface — a ramp built out of white makes the low steps glow brighter than
  the page behind them.
- Tapping a day bar opens that day.

### 2.3 Day — swimlanes

Rotating the Hub's layout ninety degrees turns it into a different instrument:

```
 TRAINER  │ 7a    8a    9a   10a   11a   12p    1p    2p
 ─────────┼──────────────────────────────────────────────────
▍(CL) 13  │ ▓▓ ▓▓ ▓▓ ▓▓ ▓▓ ▓▓          ▓▓ ▓▓ ▓▓ ▓▓
▍(GL) 14  │ ▓▓ ▓▓ ▓▓ ▓▓ ▓▓ ▓▓ ▓▓ ▓▓ ▓▓ ▓▓
▍(MB) 10  │       ▓▓ ▓▓ ▓▓          ▓▓ ▓▓ ▓▓
▍(AS)  4  │       ▓▓ ▓▓ ▓▓ ▓▓
```

The whole day fits on one screen, and the thing a manager is looking for — who
is loaded, who has a two-hour hole at 11 — is readable without a single client
name.

- **The axis is derived from the day's real bookings**, not a fixed 6 AM–8 PM.
  A quiet Saturday running 8–11 draws three hours wide instead of fourteen
  mostly-empty ones. Floored at a two-hour span so one booking still gets a
  readable axis.
- **A 30-minute booking is one slot wide** and no name fits there at any sane
  axis width. Rather than truncate everything to "Ma…", **tapping a lane
  expands** that trainer's sessions in full underneath. Progressive disclosure
  beats illegible text.
- **Every booking occupies at least one slot**, so a zero-length row in the
  data stays visible instead of collapsing to a hairline.
- **Unassigned bookings get their own block.** A session whose trainer name
  Mindbody spelled differently is a data problem someone should see, not a
  session that silently disappears from the day.

---

## 3. Architecture

```
src/features/calendar/
  calendar.tokens.css   brand + semantic tokens, 8 trainer tones, light/dark
  calendar.css          nav, month grid, week dashboard, day lanes, toolbars
  types.ts              view models (CalendarSession, DayCell, WeekSummary…)
  trainer-tone.ts       the hash, initials, short names
  selectors.ts          ScheduleEntry -> view models. Pure. No React.
  DateNavigator.tsx     the fixed-width stepper
  TrainerAvatar.tsx     avatar + count chip
  MonthView.tsx
  WeekView.tsx
  DayView.tsx
  index.ts
```

### 3.1 Component tree

```
CalendarView                        container: resolve + filter only
├── DateNavigator                   fixed-width label, pinned arrows
├── cal-seg × 2                     view switcher, month's show-filter
├── cal-picker                      trainer select
└── MonthView | WeekView | DayView
     │
     ├── MonthView
     │   └── DayBox × 42            memo
     │       └── TrainerCountChip   memo → TrainerAvatar
     │
     ├── WeekView
     │   ├── DeltaBadge
     │   ├── DayBarCell × 7         memo
     │   ├── BoardRow × n           memo → TrainerAvatar
     │   └── Heatmap → BandRow × 4  memo
     │
     └── DayView
         ├── Lane × n               memo
         │   └── SessionBlock × n   memo
         └── unassigned block
```

### 3.2 Where the danger lives

`resolveTrainerId` is the only genuinely risky code in the module, and it is
**unchanged on purpose**. Mindbody names a trainer three different ways
depending on the endpoint (`trainerId` / `staffId` / `StaffFirstName`), so it
tries id, then full name, then first name, then a prefix match. It is
load-bearing for real studio data; this was a UI round and rewriting it here
would have mixed a rendering change with a data-matching change.

It now lives in exactly one place instead of being duplicated across three
renderers that had drifted apart.

### 3.3 Timezone

Everything buckets on `studioDateKey`, never on the browser's local day, so a
7:00 AM Cleveland session cannot land on the previous day for someone reading
the calendar from another timezone. Client-event date strings (`"2026-09-08"`)
are parsed at **local noon**, which no offset can push across a day line.

### 3.4 Layout mechanics worth knowing

- The day lane places blocks **straight into the lane's own grid columns** —
  no nested grid, no `subgrid` (Safari support is too recent to lean on), no
  absolute positioning, no pixel math. A session starting at slot 4 is
  `grid-column: 6`, because column 1 is the sticky label.
- Hour rules are one background element *behind* the blocks rather than a
  border on each, so they line up whether or not a slot is occupied.
- The lane label and the axis corner are `position: sticky` on the horizontal
  scroller, so trainer names never scroll away from their own row.
- **`key` on a plain function component does not typecheck in this project**
  (React 19, no `@types/react` installed). Every list component here is
  `memo`-wrapped, which both fixes that and is correct anyway for leaves
  rendered forty times.

### 3.5 Deliberately left

- **Dead imports removed**: `axios`, `updateDoc`, `getDocs` and the `motion`
  animation wrapper were imported and unused — leftovers from the click-writes-
  a-clientId behaviour that was removed earlier. `onStartNewClientOnboarding`
  is still accepted as a prop but was already unused; left in the signature so
  no call site breaks.
- **Events are Month-only.** They were never meaningful in the old week/day
  grids and the new ones have no natural slot for them. If they need to appear
  in the Day view, the lane list is the place.
- **The AM/PM slot machinery is gone** (`amSlots`/`pmSlots`/`dynamicSlots`).
  The day axis derives its own range now.
