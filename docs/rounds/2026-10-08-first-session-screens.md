# The first session and a routine's plan: the screens (design round, Oct 8 2026)

**Status: Round 1 in build on `claude/first-session-routine-plan-ui-2f8dc1`.**
This branch is master's `e8c5cb22` with the seven `oct7/first-session` commits
replayed on top (the research, the grid fix, the routine plan's pure half, its
store and rules). It is not pushed. The research and the structure are
`docs/rounds/2026-10-07-first-session-and-routines.md`; read its §2, 2b, 2c, 4
and 5 first. This document is the design round: what AJ picked, the screens,
and how they are built.

---

## 1. What AJ asked for in this round

The brief (Oct 8 2026) was nine items:
1. The first-time setup for a client new to the studio, with two doors.
2. A clear door for a client new to Journey.
3. The plan on Programming.
4. The floor on day one.
5. The Wrap-up's Next time.
6. B molded in.
7. The weak-area focus.
8. The studio's A, or A and B, setting.
9. Retiring the old pieces.

His framing, in his words:

> "we need to make creating and editing routines for clients with and without
> a history on their profile is the most crucial part of the app because its
> the main thing that we need to do. Create a session, customize the session
> for the client, record and reference the exercise in the future."

Mid-round, he added this, and every screen is designed to it:

> "everyone starts at different strength levels with different body types and
> also different contraindications so we may use different machines at the
> start. and that also might make the B routine slightly different ... we might
> have a plan for a routine but find something out in those first few sessions
> that drastically changes it or we could have a client who is getting surgery
> that would allow them to have as much ROM or not be able to do every machine.
> some clients just wont be able to do certain machines. not every studio has
> the same machines. progressing in one machine may help increase the
> performance on another but performing one machine could hurt the clients
> performance if that session has that machine in it. trainers may build the
> session before the client comes in or on the fly"

So the Academy's template is a **first draft**, never a script, and five things
appear on every surface:
- **Can't do**, with a reason and an until.
- **Another start**.
- **Re-plan**, kept in the history.
- **This floor only**.
- **Order effects**, as quiet sentences.

## 2. AJ's picks

The prototype was the private artifact **First Session Directions**
(`https://claude.ai/artifact/H49aL3XMLdpJi9QbMbeLYP`; source in this
worktree's git-ignored `harness/proto/`). It showed three directions:
- **the Road**: the plan as a transit line, with B branching off A;
- **the Lineup**: A and B side by side, an "on deck" list and a "Not for {name}" bench;
- **the Floor Board**: the studio's floor as tiles.

AJ answered **"1d 2a 3a"**.

- **1d.** The Lineup on Programming, with the Road's one-line route wherever a
  glance is all there is: the briefing, the session's Plan chip and the Wrap-up.
- **2a.** Can't-do lives on the client's plan, read by A and B. When the reason
  is surgery or an injury, one tap also writes a Health note, so the leaders see
  it on Operations → Today.
- **3a.** The trainer picks one of the Academy sheet's four columns once per
  client, labelled as the sheet labels them. After that, the range shows beside
  the weight on any first time on a machine.

**Which template is the standard, and the injury map:**

> "studios will chose their own, admins will create the routines to pick from
> in the app during beta"

His second answers were **"1a 2a 3a GO"**:

- **1a.** The Firestore addition is OK. A starting routine is one of head
  office's routine presets (`routinePresets`, company tier, administrators
  write) with an optional `start` part. Each studio's choice is one config
  document (`studios/{s}/config/startingRoutines`).
- **2a.** The Academy's eleven are brought in once, by a script AJ runs (dry run
  first), renamed without "female" or "male". Admins then edit, retire or add.
- **3a.** A client whose intake names nothing gets the studio's default starting
  routine. **Gender is used nowhere** in choosing a start.

Then: "ill be gone for the next few hours, continue to work without verifying
with me".

His third answers (Oct 8 2026) were **"1a 2a 3a"**:

- **1a.** After Round 1, Round 2 continues on this branch, in its own
  commits, and both rounds ship together after one iPad walk (§3).
- **2a.** The seed marks no head office default. An administrator marks one
  in the app; until then, and unless the studio has set its own default, a
  trainer picks the starting routine for a client whose intake names nothing
  (`needsChoice`).
- **3a.** A routine-less walk-in's machines are offered **unticked** on the
  Wrap-up, never ticked into Routine A by default. He added:

  > "this also counts with the consult visit, sometimes the consult machines
  > will not be the same as their a routine"

  So **the consult is not Routine A.** The plan keeps the first visit's
  machines as its own `dayOne`, Routine A starts empty, and the Wrap-up asks
  which of today's machines start it (§4.3, §4.5, §4.7, §5).

## 3. Round 1 and Round 2

- **Round 1 (this build):**
  - items 1–5 and 9;
  - can't-do, re-plan and order effects (his Oct 8 note);
  - starting routines made by admins and chosen by studios.
- **Round 2 (after Round 1, on this branch):**
  - B molded in (item 6);
  - the weak-area focus (item 7);
  - the studio's "A, or A and B together" setting (item 8). It only means
    something once B is built the new way.
- **How they ship** (AJ's "1a", Oct 8 2026). Round 2 continues on this
  branch in its own commits, each typechecked on its own. Neither round ships
  alone: both go to `master` together after one iPad walk of the two.

## 4. The screens (Round 1)

### 4.1 Which client is which (`routine-plan/client-kind.ts`)

| Kind | Journey knows it by | Programming | The briefing |
| --- | --- | --- | --- |
| New to the studio | Coverage complete and no Journey sessions, **or** a temporary profile made by Add Client for "New client, not in Mindbody yet" | **Start a plan** | The plan card. Today = day one |
| New to Journey | Sessions before Journey (coverage partial) | **Enter their routine**: no suggestion | One line and a door to Programming. Start builds the session on the fly |
| Can't tell | Coverage unknown, or the sessions or routines not read yet | Both doors, claiming neither | Both doors; Start never waits |

- **The sentences never say "new client" or "first session" off a low count.**
  "New to the studio" allows up to five Mindbody visits (`NEW_CLIENT_MAX_VISITS`,
  a consultation and an intro). So the screen says "Starting out at the studio",
  never "nothing before Journey". A read that hasn't answered is "can't tell",
  never new.

### 4.2 Starting routines: admins make them, studios choose (`routine-plan/starting-routines.ts`)

- **What one is.** A starting routine is a company routine preset with a
  `start` part:
  - `dayOne`: the machines a first session runs, a subset of `machineIds`;
  - `steps`: optional labelled groups in the order they join, such as "First
    workout adds";
  - `matchWords`: the words in an intake or a Health note that suggest it;
  - `default`: head office's default, at most one;
  - `source`: where it came from.
- `machineIds` is the plan's intended road, in order. Machines are catalog ids;
  each studio's floor maps them, and a machine the floor lacks is said, never
  dropped silently.
- **Admins** edit them in the routine template editor
  (`admin/routines/RoutineTemplateForm.tsx`). A new "For new clients" part holds
  day one, the words that suggest it, and head office's default. It is the same
  editor on Admins → Standard → Standard template and Operations → Setup →
  Floor (studio templates).
- **The studio's choice** is on My Studio → Studio → **Starting routines**:
  which starting routines this studio's trainers see, and the default.
  - The studio's leaders change it; everyone who works there reads it.
  - Stored at `studios/{s}/config/startingRoutines` =
    `{ use: string[] | null, defaultId: string | null, updatedAt, updatedBy }`.
    `use: null` means "all of head office's".
- **The suggestion.**
  1. The studio's routines whose `matchWords` appear in the intake (medical
     history, goals, the clinical profile, open Health notes) come first.
  2. If none match, the studio's default, then head office's default.
  3. If there is no default, the trainer picks (`needsChoice`). Every
     alternative is shown by its machines, so two with similar names can be
     told apart.
- **Before the seed has run.** If the app holds no starting routines, Start a
  plan falls back to the Academy's eleven, built in code by the same transform
  the seed uses (`academyStartingRoutines()`), labelled as the Academy's.
- **The seed.** `scripts/seed-starting-routines.ts` writes the eleven as
  `routinePresets/academy-<templateId>`, company tier. It is a dry run by
  default; `--commit` writes. Names carry no gender: the two "No reported
  issues" rows are named by what tells them apart, and so are their ids
  (`academy-clear-dip-adduction`, `academy-clear-chest-pulldown`), because an
  id is stored for good in plans and studios' choices. It never overwrites a
  routine, and never brings back one an administrator removed: every id it
  writes is listed in `system/startingRoutinesSeed`, and `--again <id>` brings
  one back on purpose. It marks **no head office default** (AJ's third "2a",
  §2): an administrator marks one in the app, and until then, unless the
  studio has set its own default, a trainer picks for a client whose intake
  names nothing.

### 4.3 Programming → Routine A: Start a plan, and the Lineup

Adapted from the prototype's Lineup (`harness/proto/d-lineup.tsx`), built with
the app's own routines kit (`features/routines/`, `routines.css`).

- **No routine, new to the studio.** A panel "{First}'s starting lineup":
  - **Day one**: solid, numbered rows.
  - **On deck**: the rest of the plan, dashed, numbered in order, each with its
    step's label. The first is marked **Next**.
  - **Not for {First}**: the can't-do bench.
  - A Source chip naming the starting routine and why it was picked, with an
    (i) for the why.
  - **Another start**: alternative cards, each shown by its first machines.
  - Tapping a row opens the row sheet: Move up, Move down, Swap for (the same
    Academy family on this floor and the Academy's substitutes), Not for
    {First}, Take out. Before Keep this lineup these change the draft (its
    `plan.dayOne` and `intended`; `startWith` is a list of its own). Once
    kept, a move is a `reorder` change written in the order the Lineup draws
    (day one, then On deck), and day one takes the order it gives day one's
    machines, so a Move up on a Day one row reaches the consult.
  - **Keep this lineup** (blue) writes the plan (building on, with day one
    as `plan.dayOne`), an **EMPTY Routine A** and the plan's first change
    (`start`), in **one batch, not awaited** (`startPlan` with
    `machineIds: []`). Day one is the first visit's machines, never Routine
    A's: the consult is not Routine A (AJ's "3a", §2). Nothing is written
    before it, and a typed or changed draft registers with
    `useUnsavedChanges`.
  - Once kept, Programming draws the plan with Routine A empty and day one
    on it ("0 of 6 · day one: Leg Press, Compound Row and Lumbar",
    `progressLine` with the plan's `dayOne`). A client whose Routine A
    carries a plan is never offered Start a plan again
    (`startingKindOf`'s `hasPlan`, required so no caller can leave it
    out), before the consult or after it.
- **No routine, new to Journey.**
  - The floor grouped by the Academy's families on one side; "{First}'s Routine
    A" filling 1, 2, 3 as machines are tapped on the other. Tap a row to move or
    remove it.
  - **Save Routine A** writes the routine and a plan with `intended` = the
    routine and building off. A purpose can be added; the reason is not asked.
- **No routine, can't tell.** Two doors: "Starting out here · Start a plan" and
  "Trained here before · Enter their routine".
- **A routine with a plan.**
  - **The head:** the purpose, editable; "3 of 6 · next: Hip Abduction" with the
    segmented meter; and the **Routine A is being built** switch.
  - **The lineup:**
    - "In Routine A": the routine's rows, as today's RoutinesTab draws them.
    - On deck, where only the Next row has "Add to A now". It is **not
      offered while Routine A is empty and the plan has a day one**
      (`runsDayOne`): one machine in an empty Routine A would become
      everything the consult runs, and day one would drop without a word.
      Day one's rows are drawn where Routine A's would be, and the Wrap-up
      starts Routine A (§4.7).
    - The bench.
    - The order effects as slim rows between the two rows that trip them.
  - **Re-plan** opens a sheet:
    - What changed? (Surgery coming up · Found something in the first sessions
      · Client asked · Training at another studio)
    - Which machines are out for now
    - "Start again from the starting routine with what we know", or "Edit the
      lineup by hand"
    - The history gets a divider: "Re-planned · {day} · {reason}".
  - **Changes:** a right column in landscape, a "Changes · N" sheet in portrait.
    One list holds the plan's changes and the old `routineAdjustments`, newest
    first. Each says who, when, what and the reason if one was given.
- **A routine with no plan** (established before this round) draws as today,
  with a quiet **Add a plan** offer that writes a plan from the routine as it
  stands.
- **Every change** goes through `routine-plan/store.ts` in one batch: the plan,
  the change, and the routine's `machineIds` when they move. It is **never
  awaited by a tap**. A refusal comes back as a toast.
- **The reason is asked, never required**, everywhere, including the old Edit
  routine drawer and the B switch. Both required three characters until this
  round; `session-scope.test.ts` held that and is changed on purpose, quoting
  AJ.
- **The drawer keeps the plan.** A drawer save on a routine with a plan writes
  the matching plan change (add, remove, reorder) in the same batch, so the plan
  and the routine never drift.

### 4.4 Can't do

- **Stored on Routine A's plan.** `plan.cantDo: Array<{ machineId, reason?,
  until: "cleared" | "always" | "YYYY-MM-DD", byUid, byName?, day,
  replacedBy?, onRoad? }>`. B, the briefing, the floor and every suggestion
  read it. `replacedBy` is what stood in when it was marked; `onRoad` whether
  the machine was on the plan's road then, so Reopen never adds a machine the
  road didn't have. A dated `until` is the last day the mark holds.
- **Reasons** (all optional): Surgery · Injury or pain · Doesn't fit the
  machine · Not cleared yet · Client won't.
- **Marking one reshapes the plan.** The Academy's documented substitute is
  used when it is on this floor and allowed, else a machine of the same family,
  else the machine simply leaves the plan. The screen says what it did ("Chest
  Flye instead of Seated Dip").
- **Reopen** puts the machine back where it stood: in its stand-in's place,
  on the road and on day one; or, when nothing stands in for it on day one,
  where it stood on day one when it was marked (`dayOneAt` on the entry).
- **A health reason offers a Health note.** With Surgery or Injury or pain, one
  tap (asked, never automatic) writes a Health note (`category` Surgery or
  Injury or pain) through the notes' one writer, so it reaches the leaders.
- **A dated mark ends by itself.** An until-date in the past means the mark has
  ended; the screens show "Back on {day}". Nothing writes by itself.

### 4.5 The briefing (the Road's one-line route)

- **New to the studio, or a plan in progress.** The "Today's routine" section
  becomes the plan card:
  - a horizontal route with a "Today" bracket over today's machines, then the
    planned ones hollow, the next one marked "Next stop";
  - the Source chip;
  - **Change today**: a sheet to take a machine out of today or add the plan's
    next one or any floor machine;
  - one order-effect line when today trips one.
- **Today's machines are `todayFor`** (`routine-plan/plan.ts`): Routine A's
  machines when it has any; else the plan's day one, in the order the plan
  keeps it (the consult, and any visit while Routine A is still empty); else
  none. Never the whole floor.
- **Every reader that seeds a session from Routine A switches to
  `todayFor({ routine, plan })`.** With an empty Routine A each of these
  gives `[]` today, so the consult would open empty:
  - `features/briefing/BriefingScreen.tsx`: the routine picked for today
    (`setAdjustedMachineIds(routineA?.machineIds || [])`, twice), the list
    the briefing compares against (`return routineA?.machineIds ?? null`),
    and the ids Start passes (`routineA?.machineIds || []`);
  - `components/WorkoutTrackerView.tsx`: the fallback that seeds a session
    with no `sessionMachineIds` from its routine
    (`setActiveMachineIds(routine.machineIds)`);
  - `features/routines/next-routine.ts` (`nextRoutine`), which answers the
    empty Routine A: a caller that draws or starts its machines reads
    `todayFor` with Routine A's plan.
- **What Start does.** Start passes today's machines and, for a new-to-the-studio
  client, the plan **up** to the tracker. `BriefingScreen` stays write-free; the
  tracker writes the plan (with day one) on an **EMPTY Routine A** and the
  `start` change **in the Start batch, never awaited** (`startPlan` with
  `machineIds: []`). Today's machines are the session's, never Routine A's:
  the consult is not Routine A (AJ's "3a", §2).
- **The old create path is gone.** Start no longer saves a list labelled "Today
  only" as Routine A.
- **New to Journey.** One line ("{First} has a routine from before Journey"),
  a quiet **Enter the routine on Programming**, and "Or start and add machines as
  you go". Start opens an empty session, never the whole floor.

### 4.6 The floor on day one

- **The Now Bar on a first time on a machine.** It says "First time on this
  machine" (the history-claims words). The set-up shows as the existing "Not set
  · Use {std}" ghosts, never values. The weight is blank and never prefilled.
- **The Academy's starting range** sits in the Now Bar head's empty readout
  slot.
  - When Routine A's plan has a column: "Academy's starting range: 60–100 lb (a
    reference, not a rule)", with an (i) holding the sheet's notes and its
    source.
  - When it doesn't: a quiet **Academy's starting range** button opens the four
    columns (the sheet's own labels) and **Don't show ranges**. Picking writes a
    `column` plan change to Routine A's plan. With no plan it is kept for that
    session only, and the line says so.
- **The next machine.**
  - It is the plan's first machine today's session doesn't have
    (`planProgress` over today's machines, not Routine A's, which is empty
    on day one).
  - On the last machine, the Now Bar's Next slot becomes a dashed blue row:
    "Next in the plan · Hip Abduction · Add", beside "Add another machine".
  - An empty Now Bar offers **Add a machine** and the plan's next one.
  - Adding is today only (`applySessionMachineIds`). The Wrap-up decides what
    the routine keeps.
- **The Plan chip.** The session bar gets **Plan · 3 of 6**, which opens a sheet:
  - the Road strip of the plan;
  - per machine, **Swap in the plan** and **Can't do**;
  - **Re-plan**.
  - A change there writes the plan through `store.ts`, not awaited; that is
    AJ's Q6 ("you shouldn't really be blocked"). It changes today's order only
    when that machine has no set logged today.
- **On a phone.** The last card's Next becomes "Next in the plan · Add".

### 4.7 The Wrap-up's Next time

- **Where.** A card after "Next session's weights", headed **Next time**.
- **The rows** are `nextTimeRows`: machines performed today that the routine
  lacks.
  - Each has a 40px tick on the firm edge, blue when on.
  - While Routine A has machines, they are ticked while the plan is being
    built, unticked otherwise.
  - Each says "Next in the plan" or "Added today · not in the plan".
- **The consult rule** (AJ's "3a", Oct 8 2026: "this also counts with the
  consult visit, sometimes the consult machines will not be the same as their
  a routine").
  - When Routine A is **empty at the session's start** (the consult, or any
    visit while Routine A still has nothing), **every row starts unticked**,
    the plan being built or not.
  - The card asks **"Tick the ones that start Routine A"**, with a quick
    **Tick all**.
  - A row from the plan's day one says "Day one" (`why: "day-one"`); the rest
    say "Next in the plan" or "Added today · not in the plan" as above.
  - Nothing ticked leaves Routine A empty, and the next visit runs day one
    again (`todayFor`).
  - Routine A starts with the ticked machines in the road's order, the order
    every later Wrap-up keeps (`routineAfterWrapUp` → `routineWith`), so it
    never flips at the second visit. When two of them side by side trip a
    sequencing rule, the order effects say so, quietly.
- **Under them**, the Road strip of Routine A for next time, live as ticks
  change, and its progress line ("0 of 6 · day one: …" while nothing is
  ticked on an empty Routine A).
- **When it writes.** It writes **once, on every way out**: Back to Hub, leaving
  the app, sign-out, unmount. That is the effort default's pattern. It writes
  `routineAfterWrapUp` and `planAfterWrapUp` with an `add` change, never awaited,
  with a toast on refusal. Nothing ticked writes nothing.
- **With no routine** (a new-to-Journey session built on the fly) it is the
  same case as the consult: the rows start unticked under the same heading,
  **"Tick the ones that start Routine A"**, with **Tick all**. Ticking writes
  Routine A with no plan.
- **A Free session has no Next time.**

### 4.8 Retired (item 9)

What went, and what replaced each:

| Went | What it did | What replaced it |
| --- | --- | --- |
| `components/ConsultationSetupWizard.tsx` and its render test | The tracker's **First-time setup**, drawn instead of the briefing for a client with `requiresConsultation` and not `consultationCompleted`: a fixed trio (Leg Press, Chest Press or Seated Dip by gender, Lumbar), a gender and an age asked for, a skill level, an estimated starting weight per row, and "Start consult workout" | The briefing, for every client. A client starting out at the studio gets the plan card there (§4.5), and Programming's **Start a plan** (§4.3), both from `routine-plan/client-kind.ts` `startingKindOf` and the starting routines (§4.2). Finish still marks the consultation done |
| `components/ConsultationWizard.tsx` and its render test | The Initial Consultation, unmounted since Sep 24 2026: wrote the client's answers, a "Demo Routine", a session and a setup note | Nothing new: its route went on Sep 24 2026, and a client's details are on Notes & Profile |
| `lib/consultation-utils.ts` and its test (`calculateStartingWeight`, `MACHINE_DICTIONARY`, `ACADEMY_STARTING_WEIGHT`, `statedStartingWeight`, the `Gender` / `SkillLevel` / `MachineSelection` types) | A starting-weight heuristic by machine name, gender, age and skill | The Academy's sheet, `routine-plan/starting-weights.ts`: a range beside the weight on a first time on a machine, in the column the trainer picked, never typed into the weight (§4.6) |
| The starting-weight seed in `session-record/start-plan.ts` (`SeedArgs.client`, `SeedArgs.startingWeight`, the default-weight branch) and its caller in `WorkoutTrackerView` (`seedsFor`) | Filled a machine with nothing on record with the heuristic's number, taking a client with no gender on file as "Male" and an unknown age as 45: ghost data written as a load | Nothing: a machine with nothing on record starts with no set and no weight, and the trainer types the first one. Only a weight on record (the last performed, the settings' prescription or starting weight) is prefilled, as before |
| The consultation screens' helpers in `lib/consultation-answers.ts` (`knownGender`, `ageOnFile`, `demographicsPatch`, `consultationPatch`, `suggestedStartingWeight`, `consultationNoteBody`) and their tests | What the two wizards wrote | The file keeps Add Client's intake (`canSaveNewClient`, `NewClientAnswers`, `newClientPayload`, and `parseAge`, which it uses), which still invents nothing |
| The intro-session path: `isIntroSession` in `AppContent` (its state and the flag `setView` carried), the prop on `WorkoutTrackerView` (its "New client introductory session" banner and the `Sparkles` icons) and on `BriefingScreen` (the "Demo Routine" preload), and `ClientProfileView`'s `setView` type | Nothing: no caller ever passed it true | The briefing's plan card. The routine builder's `established` (whether a short routine is called thin) was `!isIntroSession`, so every client was "established"; it is now `pastLearningCurve` (`client-kind.ts`), the Academy's learning curve ("around 4 to 6 workouts"): at least six sessions (`LEARNING_CURVE_SESSIONS`) or trained here before Journey (coverage "partial"), never while Routine A is being built, never when Journey can't tell. The routine drawer (`EditRoutineDrawer`, which said `sessions.length >= 6`) asks the same rule, so the two screens give one client one answer |
| Start's create path from a "Today only" list | Saved the briefing's list as Routine A or B | Gone in Round 1 (§4.5): Start makes only Routine A from a starting plan, empty, with the plan carrying day one |

- **Tests changed on purpose**, each with a comment saying why:
  `loud-orange.test.ts` (Start consult workout, the wizard's glow, ink and
  chips, the intro banner, `ConsultationWizard` in `NOT_THIS_ROUND`),
  `type-voice.test.ts` (`ConsultationWizard` off both allow-lists),
  `page-grounds.test.ts` and `firm-chips.test.ts` (off the skip-lists),
  `client-profile/tab-words.test.ts` (the wizard's lost-note line),
  `paint-cost.test.ts` (the still intro banner), `start-plan.test.ts` (no
  estimate: a machine with nothing on record gets no set),
  `consultation-answers.test.ts` (the intake only). `BriefingScreen.render.test.tsx`
  and `routine-plan.test.ts` hold `pastLearningCurve` (a client starting
  out with a routine or a settled plan is not called thin);
  `neutral-ramp.test.ts` (the budget 109 -> 105, `ConsultationWizard`'s four
  utilities gone); `WorkoutTrackerView.render.test.tsx` holds that a client
  flagged for a consultation opens the briefing, never First-time setup,
  with nothing written on opening.
- **Docs changed:** `docs/ARCHITECTURE.md` (the screen map and the session
  flow), `docs/ops/TESTING-CHECKLIST.md`, `docs/KNOWN-TRAPS.md`,
  `src/features/studio-tasks/README.md`, `src/features/unsaved-changes/README.md`,
  `src/features/routine-plan/README.md`, and the comments in
  `data/default-machines.ts` and `data/machine-database.ts`.
- **The neck.** The CODED 20 lb ceiling for the Cervical Extension ("Most
  clients will start with 20 pounds, the lightest increment available on
  this exercise", Comprehensive Equipment Overview) lived only in
  `calculateStartingWeight` (`ACADEMY_STARTING_WEIGHT`), and went with it.
  It never reached the floor: the start seed passed the machine's stored
  name, the standard list's is "CX (4 WAY NECK)", and the heuristic's exact
  lookup returned 0 for it before the ceiling applied (the deleted test
  pinned that 0). So retiring it lost no floor behaviour. The Academy's
  sheet (`starting-weights.ts`) is now the only starting reference in code,
  shown as a range with its source and never typed into a weight, so
  nothing in the app writes a load on the neck. The never-to-failure rule
  stays in the machine's own text (`data/machine-database.test.ts`).
  **What stays, and disagrees:** the catalog's own words for the machine,
  `data/machine-definitions.ts` m-neck's `startingWeightStackGap`, still say
  "The standard starting weight is 20 lbs (the lightest increment)", while
  the sheet's neck row reads 20 lb (Female · Novice) up to 30–40 lb (Male ·
  Advanced), and that row is now drawn beside the weight. **For AJ and the
  administrators:** which is the neck's start, the catalog's 20 lb line or
  the sheet's row? The catalog line is corrected in the catalog editor, not
  in code (CLAUDE.md, "No Restore standard machines"); the sheet is
  `MSF - Suggested Starting Weights.txt`.
- **What stays.** `requiresConsultation` and `consultationCompleted` stay
  written (Add Client's `newClientPayload`; Finish sets `consultationCompleted`);
  the Hub's "Consultation" chip reads them. The profile's "Profile setup
  needed" banner now points at Start a plan. `scripts/ship/ship-sep10.ps1`
  still names `ConsultationWizard.tsx`: it is the Sep 10 release's record and
  is left as it was.

## 4b. Round 2: B molded in (item 6)

AJ, Oct 7 2026: "the B routine starts out as the A routine with just one
machine different. But there are times where a trainer might do two
machines different or three machines different in a single session." Built
from the prototype's B screen (`harness/proto/d-lineup.tsx`), the Lineup's
identity (AJ's "1d").

- **The A | B lineup** (`routine-plan/ui/BColumn.tsx`). On Routine A's
  Lineup, once Routine A has machines, each "In Routine A" row gains B's
  cell beside it: "Follows A" (A's machine, quiet), or B's own machine
  (solid, the swap glyph, "for Leg Press"), the next swap's place on the
  blue dashes. B's head over the lineup: "B · 2 of 5 swaps · next: Leg
  Extension for Leg Press" with its meter; "A and B alternate · next
  session is B" (`next-routine.ts`); the Academy's line ("Routine A has run
  7 times in Journey. The Academy starts B after 5 to 7 runs of A, then
  swaps about one a week.") with its source and the 8 weeks / 16 sessions
  behind an (i), never a gate; **Swap in the next one** (blue) and the
  quieter **Two** and **Three**; **B is for** Variety · Recovery · Both. A
  tap on a B cell opens that place's strip: the same family on this floor
  and the Academy's one-machine substitutes, each with its source, or Keep
  {A} in B. Every change asks why (never required) and is one write on
  Routine B, never awaited. Side by side from 600px, so every iPad in
  portrait, an iPad mini (744px) included; on a phone B's cell sits under
  its A row (the review moved the line from 768px, where an iPad mini in
  portrait stacked).
- **Routine B's segment** (`BPlanView.tsx`) draws the same column with B's
  head, and B's own Changes.
- **Plan B** (`PlanBSheet.tsx`). Before B starts, B's column is one quiet
  cell, "B starts as a copy of A with one machine different", and Plan B:
  B's suggested swaps (`suggestBSwaps` on Routine A, this floor, Routine A's
  starting routine, the client's can't-do respected), each editable, the
  first marked "Starts with", what B is for, and **Start B** (blue): ONE
  batch, Routine B as A with the first swap, its plan (B whole as
  `intended`, the swaps in order), its `start` change, and the client's
  `isRoutineBActive` (`store.ts` `startRoutineB`), never awaited.
- **The old B paths fixed.** Turning B on with nothing in Routine B opens
  Plan B instead of making an EMPTY Routine B (the critic's #22: an empty B
  with B on alternated the client into a session of nothing); the Edit
  routine drawer's inactive B tab does the same, asking about its own typing
  first. RotationPanel's "Start from the model B routine" (the whole model
  B at once, the critic's #23) is gone from B rather than turned into "A
  with one swap": a B seeded in the builder would have no plan of swaps, so
  nothing could say which swap is next or keep B following A. Turning B off
  keeps its reason optional.
- **B follows A** (the critic's #25). Every writer that moves Routine A's
  machines (the Lineup, the drawer, the session's plan sheet, the Wrap-up's
  Next time) also writes Routine B, in the SAME batch, when B has a plan of
  swaps: B's unswapped places follow A, B's own swaps stay
  (`b-routine.ts` `bFollowOf`, `store.ts` `withBFollowing`). A Routine B of
  its own from before Round 2 (no plan of swaps) is left alone.
- **The briefing** for a session on Routine B with a plan draws the Road for
  B (today under the bracket, the swaps still to come) with "B · 2 of 5
  swaps"; nothing else on the briefing changes.
- **No rules change.** `planChanges` already took `start`, `swap` and
  `purpose`; B's moves are told apart by `value` (`B_START`,
  `B_SWAP_MADE`, `B_SWAP_PLANNED`, `B_SWAP_KEPT`), which the Changes list
  reads. The client's `isRoutineBActive` is the field the B switch has
  always written, alone.
- **What the review of Round 2 changed** (two reviewers, every finding
  checked in the code before it was fixed):
  - A swap counts as made only when B holds its machine AND not the A
    machine it replaces. Before, Routine A taking B's planned machine from
    its own road read as the swap made ("2 of 3"), drew the machine twice,
    and the next change to A dropped the A machine from B. B's offers
    (`suggestBSwaps`, a cell's strip, Plan B) leave out A's machines still
    to come, so this can't start.
  - A swap is tied to its place in A: when A replaces the machine a swap
    was for (a Lineup swap, the session's swap, a can't-do's stand-in, a
    re-plan), the swap is for the new machine, written with B (`plan.swaps`
    beside `plan.intended`). Before, B kept its own machine AND took A's new
    one, four machines for A's three.
  - The next swap waits, and B's head says why, when its A machine has left
    A or A holds its machine now, as it already did for a can't-do: Swap in
    never adds a machine to B or takes one out. A place a trainer took out
    of B stays out when A moves and when a swap goes in.
  - A swap changed or kept as A has it takes its old machine off B's road.
  - The Wrap-up after a session on Routine B: a ticked machine that is one
    of B's swaps makes that swap in the A machine's place (one "swap"
    change each, the progress line B's), never added beside it.
  - "Routine A has run N times in Journey" is history-claims.ts's
    (`routineRunsLine`): for a client who trained before Journey a zero says
    nothing and a count says sessions before Journey aren't counted.
  - The B switch decides only off routines that have answered; before, an
    unread list opened Plan B saying "Routine A has no machines yet". It is
    one hook (`useBSwitch`), mounted in a test with the real Edit routine
    drawer and Plan B (`BSwitch.render.test.tsx`).
  - Plan B follows the suggestion as A, A's can't-do and the floor arrive
    until the trainer changes a swap, and "Starts with" marks the swap
    Start B starts with.
  - Before B starts, B's one cell is placed after A's rows (beside them by
    its own grid row), so a phone no longer draws it between A's first and
    second machines.
  - Not changed: the briefing's B pick with no Routine B ("Not set up yet ·
    today only") runs today with no routine and makes no Routine B, and the
    Wrap-up after it, with no routine, starts Routine A, never Routine B
    (`nextTimeAtFinish` names the routine "Routine A"), so nothing there
    goes against "B starts as A with one machine different".

## 4c. Round 2: the weak-area focus (item 7)

AJ, Oct 7 2026: "we discovered that the client has very weak delts. What
can we do about to adjust the routines currently?" He asked Claude to take
charge ("I think you need to take charge on this one"), and said yes to the
proposal (`2026-10-07-first-session-and-routines.md` §5.4b: "yes lets apply
this all"). Built from the prototype's Focus screen
(`harness/proto/d-lineup.tsx`) on Programming's Lineup (`PlanLineup`), with
`routine-plan/focus.ts` as the pure half and `ui/FocusArea.tsx` as the
screen.

- **A quiet "Weak area" control** under the plan's heads: one outline
  button that opens the areas as chips (`FOCUS_AREAS`: Delts, Chest, Upper
  back, Biceps, Triceps, Grip, Low back, Core, Glutes, Quads, Hamstrings,
  Inner thigh, Neck). One at a time; a second tap on the picked one takes
  the focus off.
- **Picking one is a plan change.** A `focus` change on Routine A's plan
  (`plan.focus`, the area's key, `focusChanged`), its reason asked and never
  required, one write, never awaited. The next trainer sees **"Focus:
  Delts"** in the plan's head and on the briefing's glance line (the Road's
  progress line for a plan in progress, B's Road line for a session on B,
  the routine line for a session on a Routine B of its own, and the kept
  plan card's line). A stored focus opens the control by itself, also when
  it arrives after the Lineup is on screen (another iPad's pick).
- **The tints.** The A | B lineup tints every machine that works the area:
  a main mover on the blue tint (`--eq-live-fill`, the blue edge), a helper
  on a blue outline, Routine A's rows, On deck and B's cells alike. Each is
  said in words beside it too ("works the delts", "helps"), and read aloud
  with the row ("Open Lateral Raise · works the delts"), so colour is never
  the only way to read it, and a small legend says which is which. A
  machine the client can't do is never tinted.
- **The three answers**, numbered, each a one-tap suggestion, with the
  source on the panel ("Academy · Exercise Selection Template / A/B
  Routines"):
  1. **In A and B?** One line a routine (`focusLineWords`): "Overhead
     Press", "Lateral Raise (on deck)", "Helpers only: Compound Row and
     Seated Dip", "Nothing works the delts", or "Not started · B starts as a
     copy of A". Each routine is judged as it RUNS (Routine A, or day one
     while it runs, and Routine B today), because the Academy asks for the
     area in both workouts of the week; what is only on the plan (A's On
     deck; B's swaps still to come, B's own on deck, and A's On deck, which
     B takes once it is in Routine A) is named on the line and said under
     it: "On A's plan, not in Routine A yet." (the review of item 7: read as
     the plan, a Lateral Raise fourth on deck said "Nothing to change" while
     nothing the client ran that week worked the delts). A place a trainer
     took out of B stays out of B's line, and a machine the client can't do
     is never counted, a swap B plans for it included.
  2. **A swap in the same family, instead of an addition?** "Overhead Press
     for Seated Dip · A and B", its family and "keeps the count", and
     **Swap** (blue) → Why → one write. On A it swaps a machine in Routine A
     (or day one), never one on deck, so B follows in the same batch
     wherever it holds A's machine at that place, and the row says "A and
     B" by that, whatever B's own answer would be. Rows for B alone come
     after it and never offer the machine or the place of an "A and B" row:
     first **Keep {A} in B** where B's swap took A's main mover out (§5.4b:
     "Delts: Overhead Press in A, nothing in B. Offer the machine for B that
     works it"; `bSlotKept`, as B's cells offer it), then a change to a swap
     already in B (B's machine with it, today), then a swap added to B's
     plan where B follows A, last in B's order (`bSlotPlanned`), said "on
     B's plan, after its other swaps" and offered only while B's plan
     doesn't answer the area already. At most two a routine.
  3. **Or add a single-joint machine?** "Add Lateral Raise · Single-joint ·
     A's and B's plans go to 7 · inside the Academy's 6 to 8"
     (`EXERCISE_COUNT`; a plan's count is its routine and what is on deck),
     "past the Academy's 8: better in place of a lower-priority machine"
     (A/B Routines: "if time permits or used to replace a lower priority
     muscle group"), or "under the Academy's 6"; and **Add to the plan** →
     Why → an `add` on deck, never into today's routine. One addition a
     routine still missing the area, and none for a routine whose plan
     answers it already ("Already on A's plan: Lateral Raise (on deck).").
     The Academy's named extras come first ("add in the lateral raise and
     some direct, single joint arm exercises"), then the single-joint
     machines as the catalog classes them (`SINGLE_JOINT`, held to
     `kinematicClass: "rotary-single-joint"`: Leg Extension, Leg Curl, Hip
     Abduction and Adduction, Chest Flye, Pullover, Simple Row and the
     trunk machines included), then a compound one, and the question says
     "Or add a machine?" when what it offers isn't single-joint. On A's plan
     the addition reaches B too, once it is in Routine A (B follows A); on B
     alone it goes on B's own deck (`plan.intended`), drawn under B's column
     as "On deck in B" (`bOnDeck`), where a tap offers **Take off B's plan**
     (one `remove` on B's plan, `bOnDeckRemoved`), and on the briefing's
     Road for a session on B ("On deck in B"), so it is never there for good
     and never out of sight.
  The Academy's setting first where the area is answered by one (grip
  adapts with the pulls already there; triceps get a gap setting), and the
  answers end "Nothing here moves the order or a weight." With a Routine B
  of its own (from before Round 2) missing the area, the answers say "B
  changes on Routine B." rather than that the floor has nothing.
- **What it never offers.** A machine the client can't do (Routine A's
  plan's, read by A and B: AJ's "2a"), compared as the catalog machine, so
  a second unit of the same machine is never offered either; for A, a
  machine on A's road already or one B swaps in; for B, a new machine that
  is one of A's (B is for variety; A's own comes back to B only as a Keep,
  as Plan B and B's cells offer it) or one on B's plan already; a B of its
  own from before Round 2 (no plan of swaps) is read on line 1 and never
  changed from here. Nothing reorders a routine to put the area first, and
  nothing moves a weight.
- **Where it sits.** Portrait and on a phone, the answers sit under the
  chips; on a landscape iPad they are a panel of their own ("Weak delts")
  above the Changes, beside the lineup they tint.
- **The middle delt still waits.** The Academy names Lateral Raise's target
  as the middle delt, but the anatomy map has no `delts-side` id, because
  the body figure draws front and back only (§2b of the research: "we need
  to somehow figure out a side view for our viewer"). Until the side view
  and its id arrive, the Delts area works through the front and rear delt
  ids (`delts-front`, `delts-rear`), and Lateral Raise is read as the map has
  it (front delt).
- **No rules change, no new query.** `planChanges` already took `focus`
  (Oct 7); `plan.focus` is a field on the plan map the rules don't check.
  It holds the area's key (`delts`), which the Changes list already read
  ("Focus: Delts", "Took the focus off"). Nothing is read that the Lineup
  didn't already hold. Taking a machine off B's own deck is a `remove`,
  which the rules already take.
- **The review of item 7** (two reviewers, before the commit) found, and
  this fixed: an A swap that reaches B labelled "A" only, with B offered
  the same machine on its own row; an addition for B alone that could
  never be taken off and that no screen on the floor showed; "In A and B?"
  read off the plans, so On deck said "Nothing to change"; "single-joint"
  knowing only the upper-body isolation machines, so Leg Press came ahead
  of Hip Abduction; can't-do and "one of A's" compared by floor id rather
  than catalog machine; B's planned swap to a machine the client can't do,
  and a place taken out of B, counted as working the area; no Keep {A} in
  B; "A goes to 7" read as the routine; "past the Academy's 8" with no
  word of what to do instead; untrue "nothing on this floor" words with a
  Routine B of its own; a focus that arrived later never opening the
  control; the focus missing from a session on a Routine B of its own; and
  the tint not read aloud on On deck rows. Each is held by a test in
  `focus.test.ts`, `ui/FocusArea.render.test.tsx` or the briefing's render
  test.

## 5. Data and rules (AJ's OK, "1a")

- `Routine.plan?: RoutinePlan` (`src/types.ts`).
- `RoutinePlan` gains four fields:
  - `cantDo?: CantDo[]` (Routine A's plan);
  - `startingColumn?: StartingColumn` (Routine A's plan);
  - `madeAt?: "YYYY-MM-DD"`;
  - `dayOne?: string[]` (Routine A's plan; AJ's "3a", §2): the first visit's
    machines, the starting routine's day one on this floor, in the order the
    plan keeps it. Kept on the plan because the consult is not Routine A:
    the plan's first write leaves Routine A empty, a session runs day one
    while Routine A has nothing (`runsDayOne`, `todayFor`), and nothing puts
    day one into Routine A by itself: the Wrap-up's ticks start it. Day one
    follows the road: a machine taken out, swapped, dropped by a new start
    or a re-plan, or marked can't do leaves it the same way; a reorder gives
    it the order it gives day one's machines; a reopened machine goes back
    where it stood (`applyPlanChange`, `markCantDo`, `reopenCantDo`). The
    plan is a map on the routine's own document and no rule checks its keys,
    so this needs no rules change.
- `CantDo` gains `dayOneAt?: number`: where the machine stood on day one
  when it was marked, written only when it was on it, so Reopen can put it
  back there when nothing stands in for it.
- `PlanChangeKind` gains four kinds:
  - `cantdo`: `machineIds` [id]; `value` = "reason · until";
  - `cando`: `machineIds` [id];
  - `replan`: `machineIds` = the new intended; `value` = what changed;
  - `column`: `value` = the column.
- `RoutinePreset.start?` holds `dayOne`, `steps?`, `matchWords?`, `default?`,
  `source?` and `kind?` (`clear` · `condition` · `goal`, the Academy's row
  kinds: a condition's match outranks a goal's whatever order the presets are
  read in; the seed writes the Academy's). `default` counts only on a company
  preset.
- `RoutinePreset.startParked?`: a starting routine switched off in the
  template editor keeps its `start` part here, head office's default left
  out, so switching it back on brings back a seeded routine's steps, source
  and kind, which the editor has no control for. Only the editor reads it;
  switching back on removes it in the same write.
- **Rules.**
  - `planChangeOk` accepts the four new kinds.
  - `studios/{s}/config/{configId}` gains `startingRoutines` with its validator.
  - `routinePresets` is unchanged: the company tier is administrators', so the
    `start` part rides on the existing rule.
  - Rules tests for each.
- **Indexes.** Every new query ships with its composite index
  (`firestore-indexes.test.ts`).
- **Reads.** No new Mindbody call. One read of head office's starting routines
  and one of the studio's choice when Start a plan or the briefing's plan card
  opens.

## 6. Rules this keeps

- **Nothing blocks or slows Start.**
- **A tap never waits on the network.**
- **No gender on screen, and none in choosing a start.**
- **Names are never cut short.** Every new class carrying a name joins
  `names-wrap.test.ts`.
- **40px minimum.**
- **Colour.** Orange is only Start session and Finish. Every Save and every
  selection is blue.
- **The look.** The Navy Frame and Refined Lift recipes, held by the guard tests
  named in `CLAUDE.md`.
- **The app never suggests a weight.**
- **Every suggestion names its source.**
- **Sentences, not scores.**

## 7. Build log

One commit per phase, each typechecked on its own (baseline 2). Measurements
are recorded at the end.
