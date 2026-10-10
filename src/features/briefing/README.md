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

## The Stack (Oct 3 2026) — read this first

AJ's walk, Oct 3 2026: "I feel like we can have a better pre-session briefing
screen just not the information that's on it but how it's displayed." The
interview settled what the screen is for: it is opened **just before she
arrives and held while you walk her to the first machine**, "double checking
you have everything you need to know and filling anything in". He picked the
"Stack" mockup, with one change: "we do have a muscular model that we use in
the catalog in routine editor. So let's go ahead and use that model."

Top to bottom (`stack.ts` is the pure half, `stack.test.ts` beside it):

1. **Who** — name, last session, the session number while it is Mindbody's
   guess, the goal line.
2. **Before you start** — SAFETY ONLY, readable in two seconds (AJ: "Safety:
   what could hurt her" first). The Catalog's figure (`components/anatomy`
   BodyModel, the one model) with her limits lit in the caution tone — her
   clinical flags placed by the codex's own table (`client-codex/body/
   figure-map.ts` `flagRegions`) and the regions carried over from the last
   session — and only the sides with something lit. Each flag is said in
   display type with its instructions as sentences (two, then "N more"): the
   instruction used to sit behind an 11px chip nobody opened. Critical notes
   and carried regions are here too; the count is these three only. "Nothing
   flagged — clear to go." in the OK green when there is nothing. The hushed
   line and the standing health context stay under it.
3. **Since last time** — how the last session went (`lastTimeLines`: a
   skip and its reason, a blood-flow set, a machine short of HER usual —
   the median of her last five performed sets, said only with at least
   three), the markers (a break, a milestone), heads ups, coaching focuses.
4. **Something to ask about** — the FORD cue, unchanged.
5. **On the way in** — Dials (folded until tapped since the floor round, Oct
   9 2026, AJ's "2a": they're optional and Start is the job; they were open
   by default until then, and the chip counts what was tapped while folded) · Sore spot · Note · Update
   Pulse · Hand her the iPad. AJ: "sometimes is everything, sometimes its one
   thing, sometimes its nothing". Sore spot is the same figure, tappable: a
   tap opens BodyStateTracker's rating step for that region (its `request`
   prop) and NOTHING is written until it is rated. Hand her the iPad opens
   Pulse's client mode (ClientCheckInPanel `startInClientMode`, as the
   codex's PulseCard does). Every write at Start is unchanged.
6. **Today's routine** — A or B, then ONE line ("Routine A · 6 machines ·
   suggested", the short names, and "Mind her limits on …" when one of her
   flags names a machine in it); Edit opens the Routine Builder (AJ: "One
   line, tap to edit"). A client with no routine sees how they start instead
   (the first-session design round, Oct 8 2026: see "How the client starts"
   below).
7. **Also today** — the InBody line and the renewal line, quiet, never in the
   safety band; hidden when empty.
8. **Start session** — a solid bar pinned to the bottom of the page; nothing
   scrolls under a see-through gradient any more.

She may see the screen (AJ: "Everything — it's about her"), so nothing on it
is hidden for privacy. The sections below are the history that led here.

## How the client starts (Oct 8 2026)

The first-session design round (`docs/rounds/2026-10-08-first-session-screens.md`,
§4.1 and §4.5; AJ's "1d": "the Road's one-line route wherever a glance is
all there is"). Which card "Today's routine" draws is
`routine-plan/briefing-plan.ts` `briefingPlanView`; the card is
`routine-plan/ui/BriefingPlanCard.tsx`, worked out by `useBriefingPlan`.

- **A routine** draws as above. **A plan in progress** (Routine A has
  machines and a plan) adds the Road under the routine line: today under
  its bracket, the next stop, "3 of 6 · next: …".
- **Starting out at the studio** (Journey holds the whole story and it is
  empty, or Add Client's walk-in): the plan card replaces the A and B
  buttons. The starting routine that fits (the same rule as Programming's
  Start a plan), its Road with today (its day one) under the Today bracket
  and the rest hollow, the Source tag and its why, **Change today** (a sheet:
  take a machine out of today, add the plan's next one or any floor machine),
  **Another start** by machines, one order-effect line when today trips one,
  and "Mind the limits on …" under the Road when one of the client's flags
  names a machine in today (the routine line's safety line, which a plan
  card doesn't draw). Start hands the plan UP (`onStart`'s sixth argument,
  `StartPlanAtStart`); the tracker writes it in the Start batch with an
  EMPTY Routine A, because the consult is not Routine A. The plan is a draft
  until Start, so the plan Start keeps takes today as its day one (AJ's
  "3a": "the first visit's machines"; the road's machines only, in its
  order), and a machine taken out at the consult doesn't come back at the
  next visit. Once today is changed the suggestion holds, so the open Health
  notes landing a moment later never swap the start under the trainer.
  While the starting routines are read, or a start is still to pick (AJ's
  "2a" leaves no head office default), the card says "Start without a pick
  keeps no plan", and Start opens an empty session with no plan.
- **A plan kept with Routine A still empty** (kept on Programming, or by
  Start at the consult): the same card, today being the plan's day one
  (`todayFor`), its (i) saying who kept it and when ("Kept by Sam Lee, Oct
  8."), and no plan handed up (it is kept already). Change today here is
  today only.
- **Trained here before Journey**: one line ("Dana has a routine from before
  Journey."), a quiet **Enter the routine on Programming** (the profile's
  handoff, stored only once the leave gate says go), and "Or start and add
  machines as you go". Start opens an empty session, never the whole floor.
- **Journey can't tell** (coverage unknown, or the routines or the session
  count not read: the tracker's `routinesKnown`, and `client.sessionCount`):
  both doors, claiming neither. A door picked stays picked; Start never
  waits on a pick.

The briefing still writes nothing (`routine-builder/session-scope.test.ts`,
which scans the plan card's three files too), and it reads the starting
routines only while the plan card for a client starting out is drawn
(`useStartingRoutines`'s `enabled`). Every reader of Routine A here reads
`todayFor`, so an empty Routine A with a day one runs day one, and a
routine is found by either spelling of its name (`matchesRoutineLetter`:
an older seeder wrote "A"). "Not set up yet · today only" on a routine
button means what it says: Start no longer saves a list built here as a
routine.

**The leave gate.** The briefing registers what it holds with
`useUnsavedChanges` ("the briefing": the arrival note, the Dials and body
states tapped, today changed on the plan card), so the app's own navigation
asks before it drops them, and "Leave" puts them back. Its own ways out, the
close button and Enter the routine on Programming, ask the gate BEFORE
anything moves (`useLeaveGuard`): the tracker's close drops the briefing
first and moves the screen second, so asked any later, "Keep editing" would
keep nothing. Start is not a navigation and never asks.

**Round 2 and the review, on the briefing (Oct 9 2026; the round
document's §4b to §4d and §7.3).** Still write-free, and still never holding
Start:

- **A session on Routine B with a plan of swaps** draws B's Road (today under
  the bracket, the swaps still to come) with "B · 2 of 5 swaps". Today's
  machines are `runnableToday`, so neither the briefing nor the session runs
  a machine the client can't do (AJ's "2a": can't-do lives on Routine A's
  plan and is read by A and B); a B swap on the bench is drawn crossed under
  "Not for {First}".
- **A weak area** is said once on the glance line, "Focus: Delts": on the
  Road's progress line for a plan in progress, on B's Road line, on the
  routine line for a Routine B of the client's own, and on the kept plan
  card's line.
- **A studio that starts new clients on A and B together** (the setting
  `newClientsStart`, read through `useNewClientsStart` for the studio whose
  starting routines the card offers): one line under the walk-in card's
  Road, "B · planned with A: Leg Extension for Leg Press first · 3 swaps",
  and Change B (a sheet with Programming's same part). Start hands it up with
  the plan, and the tracker keeps it in the Start batch. While the setting is
  being read the card says so, and Start keeps no B; a change to B is unsaved
  work, beside today changed.
- **This floor only**: the walk-in card says what the start's road lacks on
  this floor ("Not on {studio}'s floor: …"), never dropping it silently.

## The order of the page is the whole design

AJ, Sep 13: "at the very top, everything the trainer needs to know about
that client is known instantly"; then today's routine; then log and start.
The trainer has usually trained this client a dozen times — the page is a
refresher, and it has to say what is NEW.

1. **Who is in front of you** — name, last session and which routine it ran,
   the global goal in one line.
2. **Before you start** — everything that still matters and nothing stale,
   counted in the heading: clinical flags · Critical journal entries · **Heads
   ups** (elevated notes inside their "until" day, or not yet read out at four of her sessions — `client-notes/heads-up.ts`, Oct 3 2026) · **body
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
  either inside their `effectiveUntil` day or not yet heard at four of her
  sessions since their newest word (three weeks only while her sessions are
  unknown). Under the news, one folded line: **her standing health context**
  (`standingHealth`, Oct 3 2026) — Health and Incident notes that are simply
  true, never counted in "Before you start", a tap from read.
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
- **One loud action.** START SESSION is `--br-go` with `--br-go-on` words (the
  logo orange, navy words, since the Navy Frame, Oct 4 2026) and nothing else is.

## Known: three shared children still carry their own styling

`JournalEntryCard`, `RoutineCompareCard` and `SequenceRow` (`ConditionChip`,
unused, was deleted in the colour round's review, Oct 4 2026)
are used on other screens too, so converting them would be a change to those
screens as much as this one. They read acceptably against the new surfaces.
Worth a pass of its own when the next screen that uses them is redesigned.
