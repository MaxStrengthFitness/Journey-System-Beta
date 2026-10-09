# Routine plan — a new client's first sessions, and a routine's road

AJ, Oct 7 2026: "We need to optimize how easy it is to simply get onto a new
client, pick a starting routine and do the session." The research, his
interview answers in his own words, and the structure are
`docs/rounds/2026-10-07-first-session-and-routines.md`; read it first. The
screens round is `docs/rounds/2026-10-08-first-session-screens.md` (AJ's
picks, "1d 2a 3a" and "1a 2a 3a GO"). This folder is mostly the pure half:
no React and no Firestore except `store.ts`, `starting-store.ts`, the one
hook, `useStartingRoutines.ts` (see "The Firestore half" below), and the
screens in `ui/`.

| File | What it answers |
| --- | --- |
| `types.ts` | `RoutinePlan` (purpose, the machines intended, the "being built" toggle, a focus, B's swaps; since Oct 8 the can't-do bench, the Academy sheet column picked, the day it was made, and day one, `dayOne`: the first visit's machines, kept on the plan because the consult is not Routine A), `CantDo` and `PlanChange` (twelve kinds, each kind's `machineIds` and `value` written down on `PlanChangeKind`) |
| `client-kind.ts` | Which kind of "no routine": new to the studio (Journey holds the whole, empty story, or Add Client's walk-in, `isProvisionalNewClient`), new to Journey (sessions before it: no suggestion), or can't tell (including a read that hasn't answered, `known`). A client whose Routine A carries a plan is set up even while Routine A is empty (`hasPlan`), so a kept plan is never offered Start a plan again, before the consult or after it. Never "new client", "first session" or "nothing before Journey": the client is "starting out at the studio" |
| `starting-routines.ts` | Starting routines (AJ: "studios will chose their own, admins will create the routines to pick from"): a routine preset's `start` part read safely (`startingRoutineFromPreset`), the Academy's eleven as the seed and the fallback (`academyStartingRoutines`, named without "female" or "male"), which one fits (`suggestFromStartingRoutines`: the intake's whole words, a condition's routine before a goal's whatever order they were read in, then the studio's default, then head office's, else the trainer picks; a studio's choice is exactly the routines it ticked, `use: null` alone meaning all; gender never read), the plan one makes on this floor (`startingPlanFromRoutine`, day one on the plan as `dayOne`, never in Routine A), and the Academy template a plan's `templateId` names, in either spelling (`academyTemplateOf`) |
| `starting-plan.ts` | The Academy's own templates (`SELECTION_TEMPLATES`: consultation → first → second workout → eventual A and B) on this floor, and the plan one makes: day one is the consultation's machines (on the plan, `dayOne`), the plan aims at the second workout by default. Also the floor helpers every file here uses (`floorIndex`, `floorCanonical`, `repairOrder`) and the templates' names without the sex split (`academyTemplateName`) |
| `cant-do.ts` | Can't do (AJ's "2a"): marking a machine reshapes the road, today's routine and the plan's day one (the Academy's substitute, else the same family on this floor, else it leaves; `markCantDo` is the whole tap), reopening puts it back where its stand-in stands, on day one too, or where it stood on day one when nothing stands in there (`dayOneAt`; and never adds a machine the road didn't have, `onRoad`), a dated mark holds through its day and ends by itself once it has passed, the bench's words, and the Health note a surgery or an injury offers |
| `order-effects.ts` | The Academy's sequencing rules as quiet sentences between the two machines that trip them ("Lumbar directly into Leg Press · the Academy says avoid"), never a block |
| `plan.ts` | How far along (3 of 6 · next; "0 of 6 · day one: …" while Routine A is empty), whether a visit runs day one (`runsDayOne`: Routine A empty and a day one on the plan, when nothing offers "Add to A now") and what a session runs by default (`todayFor`: the routine's machines, else the plan's day one, else none, never the whole floor), a change applied (the bench's entry rides beside a "cantdo" change, `planWithCantDo`; day one follows a remove, a swap, a new start and a re-plan, and a reorder moves it as the screen drew it), the Re-plan sheet's reasons, the Wrap-up's "Next time" (performed machines the routine lacks; ticked by default only while the plan is being built and Routine A has machines; with Routine A empty, the consult, every row unticked and day one's rows said as such; Routine A started from the ticks takes the road's order, as every later Wrap-up does; a short day never shrinks the routine) |
| `b-routine.ts` | B molded in: B's routine is A with the swaps made so far; A and B alternate from the day B starts; suggested same-category swaps (the starting template's eventual B, then the app's model B) |
| `focus.ts` | A weak area: is it in both A and B, a swap within the same category before an addition, single-joint machines first, and the areas the Academy answers with a setting |
| `starting-weights.ts` | The Academy's starting ranges (the "MSF + Imagine Strength Equipment Loading Guidelines" sheet): a reference beside the weight, never typed in, never shown once the client has a weight |
| `changes-list.ts` | A routine's Changes as one list, newest first: the plan's changes and the old `routineAdjustments`, each with who (a plan change by the Auth uid, `authUid ?? id`, then the name it was signed with; an adjustment by the trainer's id), what (a sentence), the reason when one was given, and a Re-plan as a divider. The drawer's one save, written as an adjustment and a plan change in one batch, is said once (`planChangesAndAdjustments`) |
| `lineup.ts` | The Lineup on Programming → Routine A, the pure half: what it draws (`lineupOf`: Routine A's machines, or day one while Routine A is empty; On deck with the first Next; the bench with each mark's line, its stand-in and "Back on" once a dated mark has ended; the progress line and the meter), where an order effect sits (`effectsAbove`: above the later of its two machines), the Road's one-line route (`roadGroups`: today under its bracket, the rest hollow with the next stop, the bench crossed), what each tap writes (`movedIn` a reorder in the order the Lineup draws, `swappedIn` one machine or the Academy's set, `takenOut` of Routine A only or of the plan, `addedNow`, `markedCantDo`, `reopened`, `purposeChanged`, `buildingChanged`, `replanned` with a "cantdo" for each machine newly out), the swap's choices (`swapChoices`: the same family on this floor, the Academy's substitutes, each with its source), the floor by family, the draft's own taps before Keep, and a change signed with the Auth uid and the reason only when one was given (`signedChange`, `writeOf`) |
| `drawer-sync.ts` | The drawer keeps the plan: a save in the Edit routine drawer on a routine with a plan works out the matching plan changes (`planChangeFromEdit`: a machine out of the routine leaves the plan, one new to the plan joins the road after the machine it follows, the road takes the routine's new order with On deck keeping its places), written in the drawer's one batch through `store.ts`'s `saveRoutineEdit`; without the Auth uid a plan's change is signed with, the drawer refuses with a sentence rather than drift |
| `intake.ts` | The intake's words a starting routine is matched on (§4.2): medical history, goals, the clinical profile and the client's OPEN Health notes (`openHealthWords`: each open Health thread's flavour and words, and its updates; a closed or archived one never), joined by `planIntakeText`. The profile reads them from the journal it already streams for the machine notes, one listener |
| `starting-read.ts` | Starting routines and a studio's choice as they come back from the database: each document checked, the choice's `use: null` "all of head office's", a value that isn't usable skipped; the choice cleaned before it is written (at most 80, the rules' number); what Start a plan offers (`routinesToOffer`: the app's, else the Academy's eleven) |
| `starting-seed.ts` | What `scripts/seed-starting-routines.ts` writes: each Academy routine as a company preset with its `start` part, a one-line description and an id that never name a gender, and a run's plan that skips every id already there and every one an earlier run wrote (the seed's record, `system/startingRoutinesSeed`) |
| `briefing-plan.ts` | The briefing's plan card, the pure half (§4.5): which card "Today's routine" draws (`briefingPlanView`: the routine as before, a plan in progress with the Road under it, a kept plan with Routine A still empty, a client starting out, one trained here before Journey, or both doors when Journey can't tell, a door picked staying picked; a routine found by either spelling of its name), Change today (`todayWith`; `changeTodayRows`, the road with the next stop and today's extras, a row the sheet showed kept until it closes), the one order effect today trips (`todayEffect`), what Start hands up for a client starting out (`StartPlanAtStart`: the plan with day one, today's machines, the starting routine) with the plan's first change, signed by whoever presses Start (`startChangeOf`), and the plan Start keeps when today was changed (`planWithTodayAsDayOne`: day one is the consult's machines, the road's only, in its order, never a machine the client can't do; the road itself unchanged) |
| `store.ts` | The only writer of a plan, in one batch: `startPlan` (a plan's first write: Routine A made, EMPTY for a client starting out with day one on the plan, or the plan put on the routine the client has, with its first change; the id made on the iPad, the commit never awaited), `addStartPlanToBatch` (the same writes in Start's own batch, for a plan kept by pressing Start on the briefing: the session, the routine it names and the plan land together or not at all) and `savePlanChange` (every change after it, the rest of one tap's changes beside it in the same batch, `also`: a Re-plan and the marks it made); `saveRoutineEdit` (the Edit routine drawer's save on a routine with a plan: the routine with its plan in one update, the drawer's adjustment and the plan's changes, one batch); `readPlanChanges` for the Changes list. Nothing writes day one into Routine A |
| `starting-store.ts` | Starting routines and a studio's choice, read and written (the Firestore half of `starting-read.ts`) |
| `useStartingRoutines.ts` | The hook a screen asks: one read of each per mount, no listener, the Academy's eleven while it waits or when the read fails, the choice null (unknown) until it answers, `reload()`; `{ enabled: false }` reads nothing (the briefing holds it for every client and reads only for a client starting out) |
| `start-part.ts` | The routine template editor's "For new clients" part, the pure half: a stored `start` part read for the editor (`readStartPart`), day one tapped on and off (only the template's machines, day one's own order kept, since the Academy's is repaired and not the road's), the words that suggest it (lower case, once, at most 40), head office's default, the one thing that refuses a save (nothing on day one), what a save writes (`startPartForSave`: no machine the template lost, no empty list, `default` on a company template only, never `undefined`), the other defaults a save takes the flag off, the list's "Starting routine · day one: …" line and a source said in words ("From the Academy's Exercise Selection Template"). Three things keep the editor from losing what it can't show: the steps follow day one while the first of them is day one (a seeded routine's "Consultation", so On deck never calls a machine off day one by that name), a part switched off is kept beside the template without the default (`parkedStartOf`), and a word typed but not added goes in with Save (`withPendingWord`) |
| `starting-choice.ts` | My Studio → Studio → Starting routines, the pure half: the choice in one order so an undone tap is no change, ticking and unticking (unticking one while following head office's list makes the studio's own list; ticking every one again goes back to following it; unticking the default clears it), the default (ticked as well), back to head office's list, the source line ("Following head office's list" or "Westlake's own choice"), what No default of our own means here, and a machine's name (the Academy's for a movement) |
| `ui/StartPartEditor.tsx` | The "For new clients" part under the template editor's builder (`admin/routines/RoutineTemplateForm.tsx`): Offer as a starting routine, Day one (a row a tap marks), Words that suggest it, Head office's default (company templates only), the source read only. It says what the switch does to the Edit routine drawer, and that a studio keeping its own list ticks a new one on My Studio → Studio. A routine switched off in an earlier sitting comes back as it was (`startParked`). Controlled, the word being typed included, so it counts as unsaved; the tab's Save writes it |
| `ui/StartingRoutinesPanel.tsx` | My Studio → Studio → Starting routines: each routine available to the studio with its day one, Our trainers see this and one Default, a blue Save through `useDirtyForm` (`saveStartingChoice`), what a tick means measured from what was last saved (the form's baseline, which its Save moves), read in words (Our trainers see this · Not offered here · Default, never faded boxes) with who changes it for everyone who doesn't lead the studio, loading and failed never "none", and the Academy's eleven said as such before head office has added any. `ui/starting-routines.css` is both screens' stylesheet |
| `ui/StartPlanPanel.tsx` | Programming → Routine A with no routine (the design round, §4.3): new to the studio, "{First}'s starting lineup" (Day one, On deck with each step's label, the bench, the Source tag and its why, Another start shown by machines, Build it yourself, each row's sheet changing the draft, Keep this lineup as ONE start with an EMPTY Routine A and day one on the plan, a Health note asked for in the draft written with Keep, the draft registered as unsaved); new to Journey, the floor by family and "{First}'s Routine A" with Save Routine A; can't tell, two doors. It waits for the routines' read and, when it failed, says Journey can't tell and offers nothing that writes. A starting lineup waits for the starting routines' read too ("Reading the starting routines…", nothing to keep, no start to pick), and when that read failed it claims no default and no match: the trainer picks, and Keep names the start the plan came from |
| `ui/PlanLineup.tsx` | Routine A with its plan: the head (the purpose, the progress line and meter, the "being built" switch, Re-plan, the Changes as a landscape column or a portrait sheet), "In Routine A" with Programming's own rows (`routines/RoutineRowItem`, a tap opens the machine's card), day one in their place while Routine A is empty, On deck with "Add to A now" on Next only and never while day one runs, the bench, and the order effects between rows. Every change asks why (`ReasonSheet`, never required) and is issued through the profile's actions, never awaited |
| `ui/RowSheet.tsx`, `ui/CantDoSheet.tsx`, `ui/ReplanSheet.tsx`, `ui/ReasonSheet.tsx` | The Lineup's sheets: a row's Move up / Move down / Swap for / Not for {First} / Take out; can't do with its optional reason, its until (a typed day only when it is today or later, `untilDayFrom`) and, for a surgery or an injury only, an unticked "Also add a Health note"; Re-plan (what changed, what is out for now, start again from the starting routine or edit by hand; "Surgery coming up" benches what is out as a surgery and offers the same unticked Health note, one for them all, `replanCantDoReason`; mounted only while open, so the starting routines are read only then); and the reason, asked and never required. A button carrying a name wraps, never runs off the sheet |
| `ui/PlanChangesList.tsx` | The Changes: the plan's changes (read once when shown, again after a change made on the screen) and the old adjustments as one list, newest first, a Re-plan a divider; a read that failed says so, never "no changes" |
| `ui/BriefingPlanCard.tsx`, `ui/useBriefingPlan.ts` | The briefing's "Today's routine" for a client with no routine (§4.5): the plan card (`BriefingPlanCard`: "{First}'s starting lineup" or "Routine A's plan", the Road with today under its bracket, the Source tag and its why, Change today's sheet, Another start by machines, one order-effect line, "Starts Routine A's plan · nothing is saved until Start"), `BriefingJourneyLine` (one line and a door to Programming) and `BriefingDoors` (both doors). `useBriefingPlan` reads the starting routines only for a client starting out with no plan yet, makes the suggestion as Start a plan does (a failed read claims nothing) and holds it once the trainer changes today (the intake it matched is kept, so Health notes landing later never swap it), keeps today as the trainer changes it (a kept plan's day one never moves; a starting plan, a draft until Start, hands Start today as its day one), and hands Start the plan (`startPlan`), never while reading, picking or with nobody signed in; the card says "Start without a pick keeps no plan" then. The host's safety line sits under the Road (`limits`), and `reset` is the briefing's leave-gate discard. Nothing here writes (`session-scope.test.ts` scans these files), and nothing holds Start. Tested mounted in `BriefingPlanCard.render.test.tsx` and in the briefing's own render test |
| `ui/RoadStrip.tsx` | The Road's one-line route for a glance (the briefing, the session's Plan chip, the Wrap-up): today under a bracket, planned stations hollow, the next stop marked, can't-do crossed, wrapping onto lines with every name whole, and the progress line and meter under it |
| `ui/host.ts`, `ui/usePlanActions.ts` | What the profile hands Programming (`PlanHost`: the read's status, the kind, this studio's floor, the signer by Auth uid, the studio's day, the intake's words, the actions), and the actions themselves: `start` and `save` through `store.ts`, never awaited, the profile's routines patched at once (its read is not live; a Routine A made here stamped with the time), a refusal toasted and the routines read again without clearing what is drawn; `healthNote` through the notes' one writer (`createJournalEntry`, filed as Health, at the composer's loudness; one note for every machine a Re-plan's surgery benched). Tested mounted in `usePlanActions.render.test.tsx` |
| `ui/parts.tsx`, `ui/pickers.tsx`, `ui/routine-plan.css` | The Lineup's small parts (a row, a group's head, an order effect, the bench entry, the Source tag, chips, a tick, the meter, the sheet), the floor pickers, and the stylesheet in the Hub's palette (every class carrying a name is held by `names-wrap.test.ts`) |

## Rules that hold here

- **The consult is not Routine A** (AJ, Oct 8 2026, "3a", and: "this also
  counts with the consult visit, sometimes the consult machines will not be
  the same as their a routine"). A plan for a client starting out carries the
  first visit's machines as `plan.dayOne`; its first write (Keep this lineup,
  Start's batch) makes Routine A EMPTY. While Routine A has nothing, a session
  runs day one (`runsDayOne`, `todayFor`); the Wrap-up offers every machine of
  such a visit unticked ("Tick the ones that start Routine A"), and nothing
  puts day one into Routine A by itself: the Wrap-up's ticks start it, or a
  trainer editing Routine A on purpose. Nothing offers to put a single machine
  into an empty Routine A ("Add to A now") while a visit runs day one, since
  that machine would become everything the visit runs. Day one follows the
  road: whatever leaves the plan, is swapped, is dropped by a new start or a
  re-plan, or is marked can't do leaves day one the same way; a reorder moves
  it as the trainer moved it; a reopened machine goes back where it stood.
- **A plan never blocks a session** and nothing in it is required; any trainer
  changes it, mid-session included (AJ: "you shouldn't really be blocked").
  The reason for a change is asked, never required, and kept.
- **The routine's `machineIds` is what the client does now.** The plan is the
  rest of the road; Routine A's order is the road's order (`routineWith`, the
  Wrap-up's ticks included, from Routine A's first machine), so a reorder on
  Programming is a plan change too. The one exception is an EMPTY Routine A
  with a day one: then a visit runs `todayFor` (day one, in its own order),
  and every reader that seeds a session from Routine A's `machineIds` reads
  `todayFor` instead (the round document, §4.5, names them).
- **The app suggests machines, never a weight.** The Academy's starting range
  is a reference with its source (AJ: "a crutch until we have reliable data
  within our app ... not as an end-all be-all").
- **No gender on screen, and none in choosing a start** (AJ, Oct 8 2026,
  "3a": "Gender is used nowhere in choosing a start"). The Academy's templates
  and its weight sheet are split by sex; nothing here reads a client's gender
  (B's suggested swaps, and the routine builder's "Start from the model
  routine", read `MODEL_AB_ROUTINE.neutral`, the app's blend of the Academy's
  model A/B without the sex split; the A/B document itself has only a female
  and a male row, and `preferenceFromGender` is gone), the two
  no-reported-issues rows are named by their machines, and the trainer picks
  the weight column once per client, never picked for them.
- **Can't do reshapes, never hides.** A machine on the bench says what stands
  in for it and why; reopening it puts it back; a dated mark holds through its
  day and ends once that day has passed, and the screens say "Back on {the
  day after}", with nothing written when it does.
- **Everything the Academy says is a suggestion with its source**, and the
  Academy's own words for its templates stand: "guidelines or ideas rather
  than formal rules".

## The Firestore half (AJ's OK: Oct 7 2026, "go for what you think is best"; Oct 8 2026, "1a")

**Where it lives.**

- `routines/{id}.plan`: a routine's plan, one optional field on the routine
  (`Routine.plan`, src/types.ts). A routine without one works exactly as
  before; every reader still reads `machineIds`. Both routine readers (the
  profile's one read, the tracker's listener) spread the document, so the plan
  arrives with the routine and costs no second read.
- `routines/{id}/planChanges/{changeId}`: each change, appended in the same
  batch as the plan, signed with the Auth uid and the server's time, never
  edited or removed. Read only when someone opens the Changes
  (`readPlanChanges`: one routine's small list, no query, so no index).
- `routinePresets/{id}` with a `start` part (`RoutinePreset.start`): a
  starting routine. Head office's are company tier, written by
  administrators; a studio's own are studio tier, written by its leaders.
  Both on the routinePresets rules as they were. The Edit routine drawer
  leaves them out (`drawerTemplates`, src/lib/routine-templates.ts):
  applying one there would make its whole road the routine and skip the
  plan. Its built-in templates stay while head office has no routine
  templates of its own, starting routines not counted, so the seed never
  takes them away. Admins see and edit them in the routine template editor,
  under "For new clients" (`ui/StartPartEditor.tsx`, Admins → Standard →
  Standard template, and Operations → Setup → Floor for a studio's own).
  An edit there writes only the fields that changed, each whole, through
  `update` (`admin/routines/template-save.ts`): a merge would have kept a
  word taken out, or a default switched off, in the stored map. Saving one
  as head office's default takes `start.default` off any other company
  template in the same batch, so there is only ever one.
- `routinePresets/{id}.startParked`: a starting routine switched off in the
  editor keeps its `start` part here, head office's default left out, so
  switching it back on brings back what the editor has no control for (a
  seeded routine's steps, source and kind) and the day one and words it had.
  Only the editor reads it; while it is here the template is an ordinary one
  (in the Edit routine drawer, never offered on Start a plan), and switching
  it back on removes it in the same write. On the routinePresets rules as
  they were (they check the tier, not the keys).
- `studios/{s}/config/startingRoutines` = `{ use, defaultId, updatedAt,
  updatedBy }`: the studio's choice. `use: null` is all of head office's; a
  list (at most 80) is exactly the ones ticked. Its leaders write it on My
  Studio → Studio → Starting routines (`ui/StartingRoutinesPanel.tsx`),
  everyone who works there reads it there, in words (the renewals config's
  readers and writers). A studio's own list is exactly what is ticked, so a
  routine added later, head office's or one its own leaders switch on, waits
  until a leader ticks it; both screens say so.

**Every write is one batch, and a tap never waits on it.** `startPlan`
names the routine's id on the iPad and returns the commit for a toast on
refusal. `saveStartingChoice` is a leader's Save on My Studio, awaited by
that button only, and the template editor's Save is an administrator's or
a leader's at the desk, awaited by its button.

**The reads.**

- Starting routines: two queries on `routinePresets`, head office's (`tier ==
  "company"`, `scope == "global"`) and the studio's own (`tier == "studio"`,
  `scope == studioId`), served by one composite index (tier, scope) in
  firestore.indexes.json. They ask on `scope`, not `studioId`, because a
  company preset has no `studioId` and an index holds only the documents
  that have every field it names.
- The studio's choice: one `getDoc`.
- One read of each when Start a plan, the briefing's plan card or the choice
  opens; no listener and no Mindbody call.
- A failed read is unknown, never "none":
  - the choice stays null;
  - an empty answer from the cache alone is not an answer;
  - Start a plan offers the Academy's eleven built in code (`fromCode`),
    whose ids are the seed's own, so it is never blocked by a read.

**The rules** (firestore.rules, tests in tests/firestore.rules.test.ts, the
"oct7 first session" and "oct8 first session" blocks):

- `planChangeOk` accepts the twelve kinds: the eight of Oct 7, plus `cantdo`,
  `cando`, `replan` and `column` (Oct 8). Every other check is as it was.
- `studios/{s}/config/{configId}` accepts `startingRoutines` through
  `startingChoiceValid`:
  - exactly the four fields;
  - `use` null or a list of at most 80;
  - `defaultId` null or an id of at most 200 characters;
  - signed with the Auth uid and the server's time.
- `routinePresets` is unchanged: the company tier is administrators', so a
  `start` part rides on it.
- `startPlan`'s two batches are both committed in the rules tests: the
  oct7 block's update of a routine the client has, and the oct8 block's
  Routine A made with its plan and a `start` change naming the starting
  routine. Since the consult rule (Oct 8 2026) that Routine A is made EMPTY
  with day one on the plan; the plan is a map on the routine and no rule
  checks its keys, so `dayOne` needed no rules change.

**The seed.** `scripts/seed-starting-routines.ts` writes the Academy's eleven
as `routinePresets/academy-<template>`: company tier, scope "global", nobody's
default (AJ, Oct 8 2026, "2a": an administrator marks head office's default
in the app; until then, and unless the studio has set its own default, a
trainer picks for a client whose intake names nothing). The documents are
`starting-seed.ts`'s, and a test reads each one back as exactly the routine
the fallback builds.

- **No id names a gender.** The two no-reported-issues rows are
  `academy-clear-dip-adduction` and `academy-clear-chest-pulldown`
  (`academyRoutineId`), by what tells them apart, as their names are. An id
  is stored where nobody renames it (every plan's `templateId`, every
  studio's `use` and `defaultId`), so it was renamed with the name before the
  seed first runs. `academyTemplateOf` reads them back to the Academy rows.
- It is a dry run unless `--commit` is passed.
- On production it needs `service-account.json` and the project id typed
  twice (`--confirm-project`).
- It never overwrites: it skips every id that is there now, and writes with
  `create`, so an administrator's edit survives.
- It never brings one back: every id a run writes is listed in the seed's
  record, `system/startingRoutinesSeed` (`{ ids, lastWrittenAt }`, Admin SDK
  only; no rule names it, so the rules' safety net keeps the app out), in the
  same batch. A listed id that is gone was retired by an administrator (the
  template editor retires by Delete), so a later run leaves it out and says
  so; `--again academy-arms` brings one back on purpose.
- A run after an interrupted one finishes the rest: the batch, record
  included, is all or nothing.
- It imports only pure modules from src.

The fallback is for an app that holds no starting routines (the design
round's §4.2), so if head office ever removes every one, Start a plan offers
the Academy's eleven from code again, said as the Academy's. To take one out
of a studio's list, its leaders untick it in the studio's choice.

Checked on a local emulator (Oct 8 2026): a dry run, a commit of the eleven,
a second run that skipped all eleven, a run after `academy-arms` was deleted
that left it out and said so, and `--again academy-arms`, which brought it
back. AJ runs it when he chooses. Until then, Start a plan offers the same
eleven from code. The commands:

```
npx tsx scripts/seed-starting-routines.ts --project gen-lang-client-0731527386 --confirm-project gen-lang-client-0731527386
npx tsx scripts/seed-starting-routines.ts --project gen-lang-client-0731527386 --confirm-project gen-lang-client-0731527386 --commit
```
