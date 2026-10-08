# Routine plan — a new client's first sessions, and a routine's road

AJ, Oct 7 2026: "We need to optimize how easy it is to simply get onto a new
client, pick a starting routine and do the session." The research, his
interview answers in his own words, and the structure are
`docs/rounds/2026-10-07-first-session-and-routines.md`; read it first. The
screens round is `docs/rounds/2026-10-08-first-session-screens.md` (AJ's
picks, "1d 2a 3a" and "1a 2a 3a GO"). This folder is the pure half: no React,
no Firestore except `store.ts`.

| File | What it answers |
| --- | --- |
| `types.ts` | `RoutinePlan` (purpose, the machines intended, the "being built" toggle, a focus, B's swaps; since Oct 8 the can't-do bench, the Academy sheet column picked, the day it was made), `CantDo` and `PlanChange` (twelve kinds, each kind's `machineIds` and `value` written down on `PlanChangeKind`) |
| `client-kind.ts` | Which kind of "no routine": new to the studio (Journey holds the whole, empty story, or Add Client's walk-in, `isProvisionalNewClient`), new to Journey (sessions before it: no suggestion), or can't tell (including a read that hasn't answered, `known`). Never "new client", "first session" or "nothing before Journey": the client is "starting out at the studio" |
| `starting-routines.ts` | Starting routines (AJ: "studios will chose their own, admins will create the routines to pick from"): a routine preset's `start` part read safely (`startingRoutineFromPreset`), the Academy's eleven as the seed and the fallback (`academyStartingRoutines`, named without "female" or "male"), which one fits (`suggestFromStartingRoutines`: the intake's whole words, a condition's routine before a goal's whatever order they were read in, then the studio's default, then head office's, else the trainer picks; a studio's choice is exactly the routines it ticked, `use: null` alone meaning all; gender never read), the plan one makes on this floor (`startingPlanFromRoutine`), and the Academy template a plan's `templateId` names, in either spelling (`academyTemplateOf`) |
| `starting-plan.ts` | The Academy's own templates (`SELECTION_TEMPLATES`: consultation → first → second workout → eventual A and B) on this floor, and the plan one makes: day one is the consultation's machines, the plan aims at the second workout by default. Also the floor helpers every file here uses (`floorIndex`, `floorCanonical`, `repairOrder`) and the templates' names without the sex split (`academyTemplateName`) |
| `cant-do.ts` | Can't do (AJ's "2a"): marking a machine reshapes the road and today's routine (the Academy's substitute, else the same family on this floor, else it leaves; `markCantDo` is the whole tap), reopening puts it back where its stand-in stands (and never adds a machine the road didn't have, `onRoad`), a dated mark holds through its day and ends by itself once it has passed, the bench's words, and the Health note a surgery or an injury offers |
| `order-effects.ts` | The Academy's sequencing rules as quiet sentences between the two machines that trip them ("Lumbar directly into Leg Press · the Academy says avoid"), never a block |
| `plan.ts` | How far along (3 of 6 · next), a change applied (the bench's entry rides beside a "cantdo" change, `planWithCantDo`), the Re-plan sheet's reasons, the Wrap-up's "Next time" (performed machines the routine lacks; ticked by default only while the plan is being built; a short day never shrinks the routine) |
| `b-routine.ts` | B molded in: B's routine is A with the swaps made so far; A and B alternate from the day B starts; suggested same-category swaps (the starting template's eventual B, then the app's model B) |
| `focus.ts` | A weak area: is it in both A and B, a swap within the same category before an addition, single-joint machines first, and the areas the Academy answers with a setting |
| `starting-weights.ts` | The Academy's starting ranges (the "MSF + Imagine Strength Equipment Loading Guidelines" sheet): a reference beside the weight, never typed in, never shown once the client has a weight |
| `store.ts` | The only writer, in one batch: a plan on `routines/{id}.plan`, its changes appended at `routines/{id}/planChanges` |

## Rules that hold here

- **A plan never blocks a session** and nothing in it is required; any trainer
  changes it, mid-session included (AJ: "you shouldn't really be blocked").
  The reason for a change is asked, never required, and kept.
- **The routine's `machineIds` is what the client does now** and stays the
  field every screen reads. The plan is the rest of the road; its order is the
  routine's order, so a reorder on Programming is a plan change too.
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
