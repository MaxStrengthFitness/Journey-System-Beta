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

## 3. Round 1 and Round 2

- **Round 1 (this build):**
  - items 1–5 and 9;
  - can't-do, re-plan and order effects (his Oct 8 note);
  - starting routines made by admins and chosen by studios.
- **Round 2 (after Round 1):**
  - B molded in (item 6);
  - the weak-area focus (item 7);
  - the studio's "A, or A and B together" setting (item 8). It only means
    something once B is built the new way.

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
  one back on purpose.

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
    {First}, Take out.
  - **Keep this lineup** (blue) writes Routine A with day one, the plan
    (building on) and its first change (`start`), in **one batch, not
    awaited**. Nothing is written before it, and a typed or changed draft
    registers with `useUnsavedChanges`.
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
    - On deck, where only the Next row has "Add to A now".
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
- **Reopen** puts the machine back where it stood.
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
- **What Start does.** Start passes today's machines and, for a new-to-the-studio
  client, the plan **up** to the tracker. `BriefingScreen` stays write-free; the
  tracker writes Routine A, the plan and the `start` change **in the Start batch,
  never awaited**.
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
  - They are ticked while the plan is being built, unticked otherwise.
  - Each says "Next in the plan" or "Added today · not in the plan".
- **Under them**, the Road strip of Routine A for next time, live as ticks
  change, and its progress line.
- **When it writes.** It writes **once, on every way out**: Back to Hub, leaving
  the app, sign-out, unmount. That is the effort default's pattern. It writes
  `routineAfterWrapUp` and `planAfterWrapUp` with an `add` change, never awaited,
  with a toast on refusal.
- **With no routine** (a new-to-Journey session built on the fly), the rows
  start unticked: "Tick to start Routine A with them". Ticking writes Routine A
  with no plan.
- **A Free session has no Next time.**

### 4.8 Retired (item 9)

- `ConsultationSetupWizard.tsx` and its test.
- `ConsultationWizard.tsx` (mounted nowhere) and its test.
- `calculateStartingWeight` and the starting-weight seed in `start-plan.ts`.
- The intro-session path (`isIntroSession`, the "Demo Routine" preload, the
  banner).
- Start's create path from a "Today only" list.
- Every test and doc that names them is changed on purpose.
- **What stays.** `requiresConsultation` and `consultationCompleted` stay
  written; the Hub's "Consultation" chip reads them. The profile's "Profile
  setup needed" banner now points at Start a plan.

## 5. Data and rules (AJ's OK, "1a")

- `Routine.plan?: RoutinePlan` (`src/types.ts`).
- `RoutinePlan` gains three fields:
  - `cantDo?: CantDo[]` (Routine A's plan);
  - `startingColumn?: StartingColumn` (Routine A's plan);
  - `madeAt?: "YYYY-MM-DD"`.
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
