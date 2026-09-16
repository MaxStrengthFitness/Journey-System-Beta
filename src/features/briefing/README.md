# Pre-Session Briefing

The last screen before a trainer puts hands on a client. Reached from the
client profile via `WorkoutTrackerView`, and the only screen in the app whose
job is to answer **"is there anything here that could hurt them"**.

```
briefing.tokens.css            colour, two layers: brand pigment -> semantic names
briefing.css                   layout, one file, class names in the markup
BriefingScreen.tsx             the screen
BriefingScreen.render.test.tsx mounts it (jsdom, fake Firestore)
briefing-facts.ts              the pure parts: carried-over regions, "last run"
heads-up.test.ts               pins `isHeadsUpLive` (hooks/useClientJournal.ts)
index.ts                       barrel — import from "../features/briefing"
```

## The order of the page is the whole design

AJ, Sep 13: "at the very top, everything the trainer needs to know about
that client is known instantly"; then today's routine; then log and start.
The trainer has usually trained this client a dozen times — the page is a
refresher, and it has to say what is NEW.

1. **Who is in front of you** — name, last session and which routine it ran,
   the global goal in one line.
2. **Before you start** — everything that still matters and nothing stale,
   counted in the heading: clinical flags · Critical journal entries · **Heads
   ups** (elevated notes inside their "until" day or three weeks) · **body
   regions carried over** from the last session while their "matters until"
   day has not passed · upcoming events (the Hub markers) · the renewal line ·
   active coaching focuses. When there is nothing: "Nothing flagged — clear
   to go."
3. **Something to ask about** — one quiet FORD row, and since the reporting
   round a button: tap it and the capture opens underneath, filed under the
   pillar it asked about. Gone when there is nothing to ask.
4. **Today's routine** — A or B, suggested but overridable, and each button
   says when THAT routine last ran ("Last run Sep 12 · 6 machines").
5. **Execution sequence** — the shared Routine Builder.
6. **On the way in** — four Dials (Sleep · Energy · Recovery · Stress),
   body regions on the same Dial with an optional "matters until" day, the
   arrival note, and **Update Pulse**. All optional; untouched = not asked.
7. **START SESSION** — one loud action, and the only orange on the page.

Steps 2 and 3 used to be the other way round. A goal is a direction; a
contraindication is a thing that must not happen in the next ninety minutes.

## Reporting round (Sep 16 2026)

- **What is written at START:** `checkIn.readiness = { sleep?, energy?,
  recovery?, stress? }` (−2…2), only the dials that were tapped, and only when
  one was; `checkIn.bodyStates[]` as `{ region, state, dial, until? }` with
  `until` OMITTED rather than undefined. `sleepQuality`, `stressLevel`,
  `energyLevel` and `mood` are no longer written; Mood has no dial (the
  trainer can see it). Old sessions are read through `features/rating/scales.ts`.
- **Heads ups** come from `useClientJournal().headsUpEntries`
  (`isHeadsUpLive`, `HEADS_UP_WINDOW_DAYS = 21`): elevated, unresolved, and
  either inside their `effectiveUntil` day or written in the last three weeks.
  Drawn under the Critical strip and quieter — the warn edge, no fill wash.
- **Carried-over regions** are `carriedRegions(lastSession, studioTodayKey())`
  in `briefing-facts.ts`: any `bodyStates` tag on the LAST session whose
  `until` (yyyy-mm-dd, string compare on the studio day) is today or later.
  Coloured by urgency from the Dial's tone, never by region.
- **"Last run"** is `lastRunOfRoutine(sessions, routines, letter)`: the newest
  completed session whose `routineId` names that routine, or whose recorded
  `routineName` / legacy `sessionType` letter matches. `WorkoutTrackerView`
  passes the client's completed sessions as `sessions`.
- **Update Pulse** mounts `PulseQuickLogDialog` from `../subjective-report`;
  the old `QuickCheckInDialog` is no longer used here.
- **Density:** card padding 14px, check-in gap 12px, the four Dials two-up
  from 700px. The sticky START bar is untouched.

## Conventions, same as every other feature folder here

- **Tokens only.** No hex, no `slate-###`, no `dark:` pairs in the component.
  Every colour resolves through `--br-*`, which means light and dark cannot
  drift apart one element at a time — which is exactly what had happened.
- **44px minimum** on anything tappable. Gym floor, tablet, gloved hands.
- **WCAG 2.1 AA**, ratios recorded beside each token value.
- **One scroller, and it is `<main>`.** This view does not declare its own
  height or its own `overflow`. See the header of `briefing.css`.
- **One loud action.** `--br-hero` is spent on START SESSION and nothing else.

## Known: three shared children still carry their own styling

`ConditionChip`, `JournalEntryCard`, `RoutineCompareCard` and `SequenceRow`
are used on other screens too, so converting them would be a change to those
screens as much as this one. They read acceptably against the new surfaces.
Worth a pass of its own when the next screen that uses them is redesigned.
