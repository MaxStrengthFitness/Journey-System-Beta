# The first session and a routine's plan: the screens (design round, Oct 8 2026)

**Status: Rounds 1 and 2 built on `claude/first-session-routine-plan-ui-2f8dc1`, reviewed and measured (Oct 9 2026, §7); ready to ship with `scripts/ship/ship-first-session.ps1`, then the seed, then one iPad walk of both (AJ's "1a", Round 65 in `docs/ops/TESTING-CHECKLIST.md`) before Render's deploy (§7.6).**
This branch is master's `e8c5cb22` with the seven `oct7/first-session` commits
replayed on top (the research, the grid fix, the routine plan's pure half, its
store and rules). AJ, Oct 8 2026: "you can push it directly to master thats
fine"; a push reaches no iPad until Render's Manual Deploy. The research and the structure are
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
appear on every surface that changes the plan:
- **Can't do**, with a reason and an until.
- **Another start**.
- **Re-plan**, kept in the history.
- **This floor only**.
- **Order effects**, as quiet sentences.

Where each lives (the whole-branch review, Oct 9 2026): Programming's Start a
plan and Lineup have all five (Another start on Start a plan, and inside
Re-plan once a plan is kept); the session's plan sheet, from the grid's corner
and the phone's door, has Can't do, Re-plan (with Another start) and the
order-effect line; the briefing's walk-in card has Another start, This floor
only and the order effect, and **stays write-free** (`session-scope.test.ts`):
a can't-do learned at the door is marked after Start, from the corner, a tap
away; the Wrap-up's Next time says the order effects its ticks bring. The
Academy's **helping** pairs (`COMPLEMENTARY_PAIRS`, "the documented safe
partner for the Lumbar") are not said as order effects: only its "avoid" and
"caution" rules are, so a list of good pairs never adds words to every
screen. Said here so the walk tests what was built.

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
  alone: both go live together after one iPad walk of the two. AJ, later the
  same day: "you can push it directly to master thats fine". A push reaches
  no iPad, so the walk comes before Render's deploy (§7.6).

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
- **Before the seed has run.** If head office holds no starting routines and
  nothing shows the seed ran, Start a plan falls back to the Academy's eleven,
  built in code by the same transform the seed uses
  (`academyStartingRoutines()`), labelled as the Academy's, with a studio's own
  beside them. Decided from evidence, never from an empty list (the
  whole-branch review, Oct 9 2026): a starting routine of head office's, one
  switched off in the template editor (`startParked`) or a seeded `academy-` id
  means the seed ran (`seededFrom`), so every one retired is an empty offer
  (the trainer builds the lineup), never the eleven back. Only one case can't
  be told apart: every seeded routine deleted outright leaves no trace, and the
  code copy is offered again (it writes nothing).
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
    machines, so a Move up on a Day one row reaches the consult. While day
    one runs (Routine A still empty), a row also goes on or off day one (Do
    it on day one · Not on day one), the road as it was, an "add" or
    "remove" with the value `dayone`; the last machine on day one can't come
    off it (the whole-branch review, Oct 9 2026: once kept, day one could
    only change by leaving the plan).
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
- **The plan, from the grid's corner.** The grid corner's menu has **The plan ·
  3 of 6** (the session bar has no toolbar: the Oct 3 2026 session top, option 1,
  put Routine / All, Reorder and the Key in that corner, and the plan joined
  them), and on a phone **The plan · 3 of 6** sits beside Reorder at the foot of
  the cards. It opens a sheet. **For AJ before the iPad walk:** "1d" named "the
  session's Plan chip" a glance surface; the build puts it one tap into the
  corner instead. Is the corner right, or should the bar show it?
  - the Road strip of the plan;
  - per machine, **Swap in the plan** and **Can't do**;
  - **Re-plan**.
  - A change there writes the plan through `store.ts`, not awaited; that is
    AJ's Q6 ("you shouldn't really be blocked"). It changes today's order only
    when that machine has no set logged today.
- **On a phone.** The last card's Next becomes "Next in the plan · Add", the
  iPad's quiet dashed blue, with "Last machine · Finish is at the top" kept
  under it; **The plan · 3 of 6** opens the same sheet. The Academy's range
  and the order-effect line stay the iPad's (`features/phone/README.md`).
- **A walk-in.** Add Client's walk-in ("New client, not in Mindbody yet") has
  no Mindbody count, so its coverage is unknown; with no Journey session it is
  a whole story all the same, and gets "First time on this machine" and the
  range.

### 4.7 The Wrap-up's Next time

- **Where.** A card after "Next session's weights", headed **Next time**.
- **The rows** are `nextTimeRows`: machines performed today that the routine
  lacks.
  - Each has a 40px tick on the firm edge, blue when on.
  - While Routine A has machines, they are ticked while the plan is being
    built and Routine A is still short of it (`stillBuilding`: AJ's "only
    while the routine is short of its plan"), unticked otherwise.
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
| The starting-weight seed in `session-record/start-plan.ts` (`SeedArgs.client`, `SeedArgs.startingWeight`, the default-weight branch), and the estimate arguments `WorkoutTrackerView`'s `seedsFor` passed it (the client and the starting weight; `seedsFor` itself stays, prefilling only a weight on record) | Filled a machine with nothing on record with the heuristic's number, taking a client with no gender on file as "Male" and an unknown age as 45: ghost data written as a load | Nothing: a machine with nothing on record starts with no set and no weight, and the trainer types the first one. Only a weight on record (the last performed, the settings' prescription or starting weight) is prefilled, as before |
| The consultation screens' helpers in `lib/consultation-answers.ts` (`knownGender`, `ageOnFile`, `demographicsPatch`, `consultationPatch`, `suggestedStartingWeight`, `consultationNoteBody`) and their tests | What the two wizards wrote | The file keeps Add Client's intake (`canSaveNewClient`, `NewClientAnswers`, `newClientPayload`, and `parseAge`, which it uses), which still invents nothing; renamed `lib/new-client-intake.ts` in the whole-branch review (Oct 9 2026), what it holds |
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

## 4d. Round 2: the studio's A, or A and B together (item 8)

AJ, Oct 7 2026: "Some studios may start building an A and B routine
immediately for a client. So we need to be able to have that
customization." The research (§5.2) named the setting `startingRoutines`
("A" | "AB"); that name went to the studio's choice of starting routines
(`studios/{s}/config/startingRoutines`, §4.2), so it is `newClientsStart`.

- **The setting.** A studio setting (`features/studio-settings/registry.ts`)
  of a new kind, a "choice": its choices (`{ value, label, sub }`), its value
  still a number, so the store, the rules and the resolver stay as they
  were. 1 is **A alone** (Max Strength's default: "The Academy's way. B is
  planned later, from Routine A."); 2 is **A and B together** ("B starts as
  A with one machine different."). In the group **New clients**. A value
  that isn't one of its choices is skipped, never bent. Both editors draw it
  as segments side by side, 40px on the firm edge, the picked one blue,
  inside their dirty-tracked forms: My Studio → Studio → This studio's
  settings ("Follow the default (A alone)" first) and Admins → Standard →
  Studio defaults ("Not set" first). The Activity line says it in words
  ("Set Max Strength's default for “A new client starts with” to A and B
  together.").
- **Who reads it.** The profile (for Programming's Start a plan, into the
  plan host, `aAndBTogether`) and the briefing (for its walk-in card, the
  studio whose starting routines it offers, read only for a client
  starting out), both through `useNewClientsStart`. With A alone nothing
  about B appears until a trainer plans it. A read that hasn't answered is
  never A alone: while it reads, Start a plan's B part says so and Keep
  waits, and the briefing says so too (Start is never held, and keeps no
  B); when it couldn't be read, B is offered, left for later until the
  trainer plans it.
- **Start a plan, A and B together.** Under the starting lineup, **Routine
  B, planned with A**: B's suggested swaps against the lineup's PLANNED road
  (`suggestBSwaps` on `plan.intended`: never one of the road's machines,
  never what the client can't do, this floor only), each editable (the same
  family on this floor and the Academy's substitutes, Start with this one,
  Keep {A} in B; `BSwapsEditor`, the list Plan B draws), what B is for, and
  **Leave B for later**. Keep this lineup keeps it in the same batch: Routine
  B with its plan (B whole as `intended`, the swaps, building off) and **no
  machines**, and its first change ("start", "B planned"). B stays off.
  Routine B's machines stay empty until A has machines: the consult is not
  Routine A (AJ, Oct 8 2026), and B is a copy of A.
- **The briefing's walk-in card, A and B together.** One line under the
  Road, "B · planned with A: Leg Extension for Leg Press first · 3 swaps",
  and **Change B** (a sheet with the same part). Start hands it up with the
  plan and the tracker writes it in the Start batch, as Keep does (or, when
  the client's routines weren't known at Start, in the batch that names the
  session's routine once they are). A change to B is unsaved work on the
  briefing, beside today changed, and holds the suggestion as a change to
  today does (on Programming too), so Health notes landing after it never
  drop it.
- **Never over a Routine B of the client's own.** A planned B is written
  only where the client has no Routine B, or an empty one with no plan
  (`plannedBTarget`); with one of their own, the part isn't drawn. Over an
  empty Routine B of the client's own (turned on before Round 2), the same
  batch turns B off, or the next visit would alternate into a B of nothing.
- **The first visit's Wrap-up.** The ticks that START Routine A (it was
  empty when the session finished) start B too, in the same batch: Routine B
  as A with the first of its planned swaps A can take now (`startBPlan`'s
  machines and plan), its "start" change, and the client's
  `isRoutineBActive`. The card says it, live as the ticks change: "Routine B
  starts too: Leg Extension for Leg Press. A and B alternate from the next
  visit." When none of B's swaps is for a ticked machine, B stays planned
  ("Routine B stays planned: none of its swaps is for these machines yet.")
  and starts from Plan B. A swap planned for a machine still on A's road is
  KEPT when B starts, after the ones A can take now, and waits for A to
  take its machine ("Planned · waits for Chest Press in Routine A" under
  B's column), then comes in as any swap does; the card names it ("B's swap
  for Chest Press waits until Routine A takes it."). The floor is frozen
  beside B's swaps at Finish, and the card and the write ask the same
  question of it, so the card never says a start the write doesn't make.
- **A planned B, waiting.** Its machines never follow A (`bFollowOf`: a
  change to A would have made it a copy of A with no swap), but its plan
  follows A's road (`plannedBFollowOf`: a swap follows its place, as a
  started B's does; only the plan's road and swaps are written). It is
  never alternated into (B is off), and Programming says it by the swaps it
  can still keep (`plannedBWords`): on Routine A's Lineup while day one
  runs, "B is planned: Leg Extension for Leg Press first, 3 swaps in all. It
  starts with Routine A, at the Wrap-up that starts A."; on Routine B's
  segment the same, with Plan B once Routine A has machines, which starts
  from B's planned swaps and what it is for (the first named the one it
  would start with, or "none is for a machine in Routine A yet"). The weak
  area reads it as not started.
- **No rules change, no new query.** The setting is one more number in the
  studio's settings map; Routine B with `machineIds: []` and a plan, and a
  "start" change, are what the rules already take.

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

The research round (Oct 7 2026) and both design rounds (Oct 8 to 9 2026),
on `claude/first-session-routine-plan-ui-2f8dc1`, built on master's
`e8c5cb22` (Ahead, live, and the docs brought up to Oct 7; still master on
GitHub on Oct 9 2026). One commit a phase, each typechecked on its own
(baseline 2), so any one can be reverted alone.

### 7.1 The commits

| Commit | Subject | What it is |
| --- | --- | --- |
| `b0b19d79` | Docs: the first session and a routine's plan, research, AJ's answers and the structure | The research document: AJ's interview answers in his words, what happens today, what the Academy says, the structure |
| `8d6049c3` | Docs: AJ's answers to the research, the Academy files Drive had that the repo didn't, and the injury map questions | His answers to the research (§2b), the Academy's starting-weights sheet and the other Drive files brought into `docs/msf-academy/`, and the injury map's question sheet for head office |
| `c109b06e` | Journey grid: a client with no past sessions gets a grid, not one long line | The bug found on the way: with no past sessions the grid drew one 1694px column; now one row a machine |
| `035457c7` | Routine plan: the pure half, a new client's starting plan and a routine's road | `src/features/routine-plan/`: which kind of client, the Academy's starting plan, the plan's progress, B's swaps, a weak area, the starting ranges |
| `ce22ea20` | Routine plan: the test file in LF line ends, as the repository keeps every file | One file's line ends, nothing else |
| `77cbbacb` | Routine plan: the plan on the routine and its changes beside it, with the rules | `routines/{id}.plan` and `routines/{id}/planChanges` (append-only), `store.ts` the only writer, 5 rules tests |
| `a92a7de0` | Docs: the first session and routines, what was built, AJ's last answers, and the rulebook | The research round's build log, his §2c answers, `CLAUDE.md`'s row and decision |
| `73e15ff6` | Docs: the first-session design round, AJ's picks and how Round 1 is built | This document: "1d 2a 3a", "1a 2a 3a GO" and the screens |
| `11d03d9f` | Routine plan: can't-do, re-plan, starting routines from presets, and who is new, without gender | The pure half of Round 1: the can't-do bench, Re-plan, starting routines read from presets, client kind with gender read nowhere |
| `f0eb5fd3` | Routine plan: the plan on Routine and presets, the starting-routine choice, rules and the seed script | The types, the studio's choice (`config/startingRoutines`), the four new change kinds in the rules, 6 rules tests, `scripts/seed-starting-routines.ts` |
| `88e056dd` | Starting routines: head office marks a routine for new clients, and a studio chooses its own | The template editor's For new clients part and My Studio → Studio → Starting routines |
| `106cb86a` | Routine plan: the consult is not Routine A, so day one is kept on the plan and Routine A starts empty | AJ's third "3a": `plan.dayOne`, `todayFor`, an empty Routine A at the first write |
| `c8d15ad7` | Programming: Start a plan, and Routine A's plan as a lineup with can't-do, re-plan and its changes | Programming's Start a plan, the Lineup, the bench, Re-plan and the Changes |
| `e4ef50dd` | Briefing: a new client's plan on the briefing, and Start keeps it | The briefing's plan card; Start hands the plan up and the tracker keeps it in the Start batch |
| `ad15bd7a` | Session: the plan's next machine, the Academy's starting range, and the plan from the corner | The floor on day one: First time on this machine, the range, Next in the plan, the plan's sheet from the grid's corner |
| `0b2f2b86` | Wrap-up: Next time, today's machines joining the routine while it is being built | The Wrap-up's Next time card and its one write on the way out |
| `71c7d68f` | Retire the old first-time setup: the consult wizards, the starting-weight seed and the intro session | Item 9 (§4.8): the two wizards, the starting-weight heuristic and the intro-session path deleted |
| `ddac6e8e` | Routine B: starts as A with one machine different, molded in swap by swap, and follows A where it hasn't swapped | Round 2, item 6 (§4b) |
| `39a9238d` | Routine plan: a weak area answered in the builder, a same-family swap before an addition | Round 2, item 7 (§4c) |
| `af09f0a3` | Studio settings: a studio starts new clients on A alone, or A and B together | Round 2, item 8 (§4d): the setting `newClientsStart`, the settings' first "choice" |
| `472d68ec` | Review: the first-session round's fixes across the floor, data, look, spec and leftovers | The whole-branch review (§7.3) |
| `4d25b4de` | Screens: fixes found in the preview | The screens preview (§7.4) |
| this commit | Docs and ship-first-session.ps1: the first-session round, measured | This section, `CLAUDE.md`, the READMEs, the traps, Round 65, the roadmap, the index, the changelog, and `scripts/ship/ship-first-session.ps1` |

### 7.2 Measured

On Oct 9 2026, on `4d25b4de` (this commit changes no code), in the
worktree on AJ's PC with its files in LF:

| Check | Result |
| --- | --- |
| The suite, `TZ=America/New_York npx vitest run --dir src --testTimeout=30000` | **13,132** passing in **802** files (Ahead, on master, measured 12,385 in 771) |
| Typecheck, `npx tsc --noEmit` | **2**, the baseline (`clinical-review/charts.tsx`, `EditTrainerModal.tsx`) |
| Rules tests, `npm run test:rules` | **334** passing (323 on master; 5 for the plan on Oct 7; 6 on Oct 8 for the four new kinds, the studio's choice, the starting routines and the kept lineup) |
| The functions, typecheck and tests | Clean; **263** passing and 1 skipped in 14 files (none of theirs changed) |
| Production build, `npx vite build`, then `npm run check:bundle` | Clean; the first screen **462.2 KB gzip** of the 480 budget (Ahead's was 462.9) |
| The crons and the server, `npm run build:backend` and the server's esbuild | Clean |
| The perf lab's markers in `dist/` | None |
| Windows line ends, `git ls-files --eol \| grep -c w/crlf` | **0** |
| Two names differing only by case | None |

AJ's own `npm run test:rules` is the run that counts; the ship script runs
it twice (prepare, and golive before the rules go out).

### 7.3 The whole-branch review

Oct 9 2026; five reviewers, every finding checked in the code first. What it
changed:

- **The floor.** A session started before the client's routines answered (the
  consult on slow Wi-Fi) offered no Add for the whole session: today's list is
  on screen from Start, and what the trainer adds while the routines load is
  kept beside the routine's machines when they come (`followUpList`). Finish
  works out Next time in its own `try`, so a plan it can't read costs the card,
  never the Wrap-up.
- **The client's document is never in someone else's batch.** B switched off
  over an empty Routine B rode in Start's batch, and B switched on in the
  Wrap-up's: a client the rules refuse an update to (a cross-train trainer's,
  or one with no last name) took the session, or the ticks that start Routine
  A, down with it. Both are their own writes now (`setRoutineBActive`); B goes
  on only after the Wrap-up's batch lands.
- **The data.** Programming reads the client's routines live (one listener, at
  most two documents), so a change from the floor is never rewritten from an
  old copy; an empty answer from the iPad's cache stays "loading", never "no
  routine". A plan's first write on an empty routine leaves its machines out,
  so it never empties a routine another iPad filled. A change names at most the
  rules' 30 machines. The studio's choice answered only from the cache is
  unknown. The starting routines' fallback decides "before the seed" from
  evidence (§4.2). One rule for which routine is A or B (either spelling,
  `matchesRoutineLetter`) on Programming, the drawer and every writer. A kept
  plan names its starting routine (`templateName`).
- **The spec.** Can't-do reaches B: a machine B runs as its own swap gives its
  place back to A's machine, the swap waiting next in line
  (`bFollowForPlanWrite`), and no session on B, nor the briefing, runs a
  machine the client can't do (`runnableToday`). A kept day one changes on
  Programming while it runs (a "dayone" add or remove). This floor only on the
  briefing's card and in Re-plan; Another start inside Re-plan; the Wrap-up's
  order effects; adding by default only while a routine is short of its plan
  (`stillBuilding`); Add Client's walk-in gets the first-time lines; the
  phone gets the plan's sheet; a weak area's addition past the Academy's 8
  names what it is better in place of; Log past session seeds from `todayFor`.
- **The look.** Each point said once, the how-to behind an (i); the phone's
  plan offer in the quiet dashed blue; the Academy's columns said by their
  level outside the pick sheet (never the sheet's sex word); Don't show ranges
  a fifth chip; the range ask in the button voice; a reader's picked chip never
  faded; the weak area's sub line held by `names-wrap.test.ts`; the B dialog's
  reason on tokens.
- **Left as they are, and said:** the order effects' helping pairs (§1); the
  briefing's write-free card (§1); the plan's door in the corner, a question
  for AJ (§4.6).

### 7.4 The screens preview

Oct 9 2026. AJ asked for screenshots from a preview; the live app needs his
sign-in and the local `.env` points at production, so the real components
were mounted with example data over stubbed Firebase (a throwaway,
git-ignored harness, `harness/screens/`) and photographed at iPad size,
portrait and landscape, light and dark. Looking at them found five things,
each fixed with a test:

- **B's suggested swaps took out what the starting routine's own B keeps.**
  A low back client's planned B started "Cervical Extension for Lumbar
  Extension", citing the Exercise Selection Template, whose low back B keeps
  the Lumbar beside the neck; eight of the eleven rows lost a machine their
  own B keeps (the knee row's Leg Curl, the shoulder row's Overhead Press).
  `suggestBSwaps` now leaves such a machine in B as A has it, so the low back
  road's B is the template's: Adduction for Abduction, Simple Row for
  Compound Row. With no starting routine nothing changes.
- **The Changes said "yesterday · Oct 7" on Oct 9.** The words counted
  24-hour spans from the clock, the day beside them the studio's day; both
  are the studio's days now (`changes-list.ts` `daysAgoWords`).
- **The Lineup's head said "4 machines · no changes logged" beside a Changes
  list of four.** It reads only the old adjustments; a routine with a plan
  now says its changes once, in the Changes.
- **B's "A and B alternate" line drew its icon on a line of its own** (the
  base layer makes an svg a block): `rpl-line--icon`.
- **The briefing's "How does Priya start?" stood 200px of empty space under
  its title**: the head row's flex basis was a height in the card's column.

The preview is jsdom and headless Chrome over stubbed data, not Safari on an
iPad: it can't show Safari's paint, a real sign-in or real timing. The iPad
walk (§7.6, step 5) is that check.

### 7.5 Not built, and why

- **Free-form and practice sessions.** AJ's §2c answer stands as the rule
  for when they are built: "on the person's record and the trainer's own
  history only, never in the studio's numbers, machine fit or machine
  trends, and the person is a temporary profile, these profiles can exist in
  the studio but not count towards studio averages". They were not one of
  this round's nine items (§1), and they touch every studio count, machine
  fit and machine trends, so they are a round of their own. Until then a
  trainer's own training runs as today's Free session, which has no Next
  time (§4.7).
- **The injury layer.** Parked on AJ's word (research §2b: "We can build the
  injury logic later"), behind head office's answers to the question sheet,
  `docs/rounds/2026-10-07-injury-map-questions.md`. What the floor has
  instead is Can't do with its reason, and the Health note a surgery or an
  injury offers (§4.4), so the leaders hear of it on Operations → Today.
  Nothing flags a machine from a note by itself.
- **The middle delt and the figure's side view.** The Academy names Lateral
  Raise's target as the middle delt; the anatomy map has no `delts-side` id
  because the body figure draws front and back only (research §2b: "we need
  to somehow figure out a side view for our viewer"). The weak area's Delts
  works through the front and rear delt ids until then (§4c).
- **Which Academy template is the standard** (research §7, question 2) is
  answered by AJ's "studios will chose their own, admins will create the
  routines to pick from in the app during beta": the seed brings in the
  Academy's eleven and marks no default (his "2a"). The two versions of the
  selection template that disagree on three rows stay head office's call, in
  the template editor.
- **Left by the review and the preview, and said:** the Academy's helping
  pairs are not said as order effects (§1); the briefing's card stays
  write-free, so a can't-do learned at the door is marked from the corner
  after Start (§1); the plan's door is in the grid's corner, not on the
  session bar, which is a question for AJ (§4.6); the template editor's
  sticky Save row lets the scrolled form show in the dialog's bottom padding
  beneath it (`adm-dialog__actions`, older than this round).
- **For AJ and the administrators:** the neck's start, the catalog's "20 lbs
  (the lightest increment)" or the sheet's row (§4.8). The catalog line is
  corrected in the catalog editor, not in code.

### 7.6 How to ship

AJ's "1a" (Oct 8 2026): both rounds ship together, after one iPad walk.
And the same day: "you can push it directly to master thats fine". A push
reaches no iPad (Render deploys by hand, `CLAUDE.md` → Environments), so
the branch may be on master before the walk; Render's Manual Deploy waits
for it. The ship script is `scripts/ship/ship-first-session.ps1`, run from
this branch's folder, `.claude\worktrees\first-session-routine-plan-ui-2f8dc1`.

1. **Prepare.** `powershell -ExecutionPolicy Bypass -File
   .\scripts\ship\ship-first-session.ps1 -Stage prepare`. It changes nothing
   in production or in git: the branch and a clean tree; master on GitHub
   either `e8c5cb22` or already this branch's head (anything else stops
   it); the rules and the index changed and holding this round's; no
   function changed; the Firebase login; the restore tag free; no Windows
   line ends; the case check; the typecheck count; the suite in Eastern
   time; the functions; the three builds and the first screen's budget; no
   perf lab marker; the rules tests. It ends PREPARE PASSED and records the
   commit it tested; golive refuses any other.
2. **Golive.** The same line with `-Stage golive`. It asks for GO, then, in
   this order, stopping at the first failure and saying what is live:
   1. the index, `npx firebase deploy --only firestore:indexes --project prod
      --non-interactive` (one new composite, `routinePresets` on tier and
      scope, the starting routines' read; it never deletes an index);
   2. the rules tests again, then `npx firebase deploy --only firestore:rules
      --project prod`, then a check that the ruleset live holds
      `planChangeOk` and `startingChoiceValid`. The rules only add access:
      the app on Render now is unaffected, and the new one finds them
      waiting;
   3. the restore tag `restore/2026-10-09-before-first-session` = `e8c5cb22`,
      pushed if it isn't on GitHub;
   4. `git push origin claude/first-session-routine-plan-ui-2f8dc1:master`,
      fast-forward only, and only while master is still `e8c5cb22`; when
      Claude has pushed it already, nothing is pushed.
3. **The index.** Firebase console → Firestore → the named database →
   Indexes: `routinePresets` (tier, scope) says Enabled, in minutes.
4. **The seed**, a dry run first, from the same folder, with the key from
   the project folder:

   ```
   npx tsx scripts/seed-starting-routines.ts --key "C:\Users\austi\Projects\Journey-System-Beta-master\service-account.json" --project gen-lang-client-0731527386 --database ai-studio-32cbbdcc-6e08-4770-9665-867c68878efa --confirm-project gen-lang-client-0731527386
   ```

   It writes nothing and lists the eleven it would write (each with its
   day one, its road and its words, no "female" or "male" in a name). Then
   the same line with `--commit`. Run the dry run once more: each says
   "already there". It marks no head office default (AJ's "2a"). Until
   Render's deploy, the older app on Render shows the eleven among head
   office's templates in the Edit routine drawer (in place of its built-in
   list, if head office has none of its own yet); the new version leaves
   starting routines out of the drawer (`drawerTemplates`), and nothing
   else in the older app reads them.
5. **The iPad walk, FIRST, before Render.** AJ's rule (Sep 30 2026) is at
   most two rounds shipped before an iPad walk, and several have gone live
   unwalked, so this one is walked before it reaches a trainer: Round 65 of
   `docs/ops/TESTING-CHECKLIST.md`, against this PC. In the branch's folder,
   `npm run dev`; on the iPad, Safari (never the Home Screen icon, which is
   the live app) at `http://<the PC's Wi-Fi address>:3000`
   (`Get-NetIPConfiguration`; the address must be in Firebase console →
   Authentication → Settings → Authorized domains, AJ's to add, or the
   sign-in is refused). The dev server writes to production, as the main
   checkout does: walk it on the test client Add Client makes, upright and
   on its side, then once on a phone. Tell Claude what the walk finds.
6. **Render.** Manual Deploy on `maxstrength-app-beta`, then
   `curl.exe -s https://maxstrength-app-beta.onrender.com/version.json`
   until it names the new build. Manual Build on **both** crons,
   `journey-cron-renewals` (its Journey step resolves the studio settings,
   which gained a kind of setting) and `journey-cron-leaderboards`, so all
   three are on one commit. The iPads load it on the Hub by themselves.
7. **In the app, when AJ chooses.** An administrator may mark head office's
   default starting routine (Admins → Standard → Standard template → a
   routine → For new clients); until one is marked, or a studio sets its
   own, a trainer picks for a client whose intake names nothing. Each
   studio's leaders choose on My Studio → Studio → Starting routines, and set
   This studio's settings → A new client starts with (A alone is Max
   Strength's default).

**To undo:** `git push --force origin restore/2026-10-09-before-first-session:master`,
then the same three Render buttons. The rules and the index can stay (they
only add access and a way to read); the seeded routines stay as head
office's templates, and an administrator can delete any. Plans already kept
stay on their routines, unread by the older app, where a client kept with an
empty Routine A opens an empty routine and the trainer adds machines as
before.
