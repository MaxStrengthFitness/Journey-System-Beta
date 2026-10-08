# Routine plan — a new client's first sessions, and a routine's road

AJ, Oct 7 2026: "We need to optimize how easy it is to simply get onto a new
client, pick a starting routine and do the session." The research, his
interview answers in his own words, and the structure are
`docs/rounds/2026-10-07-first-session-and-routines.md`; read it first. This
folder is the pure half: no React, no Firestore except `store.ts`.

| File | What it answers |
| --- | --- |
| `types.ts` | `RoutinePlan` (purpose, the machines intended, the "being built" toggle, a focus, B's swaps) and `PlanChange` |
| `client-kind.ts` | Which kind of "no routine": new to the studio (Journey holds the whole, empty story), new to Journey (sessions before it: no suggestion), or can't tell. Never "new client" off a low count |
| `starting-plan.ts` | The Academy's starting template for the client (`SELECTION_TEMPLATES`: consultation → first → second workout → eventual A and B), on this floor, and the plan it makes: day one is the consultation's machines, the plan aims at the second workout by default |
| `plan.ts` | How far along (3 of 6 · next), a change applied, the Wrap-up's "Next time" (performed machines the routine lacks; ticked by default only while the plan is being built; a short day never shrinks the routine) |
| `b-routine.ts` | B molded in: B's routine is A with the swaps made so far; A and B alternate from the day B starts; suggested same-category swaps |
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
- **No gender on screen.** The Academy's templates and its weight sheet are
  split by sex; Mindbody's gender may pick a template row, never a word on
  screen (`sayableTemplateLabel`), and the trainer picks the weight column.
- **Everything the Academy says is a suggestion with its source**, and the
  Academy's own words for its templates stand: "guidelines or ideas rather
  than formal rules".
