# Routines (Programming → Routine A and Routine B)

The client profile's Programming tab: the client's two routines, one row a
machine, and which one the next session runs. The routine's PLAN (the road,
the bench, B's swaps, a weak area) and every write to it are
`src/features/routine-plan/`; read its README first. This folder draws the
routines and hands every change back to the profile.

| File | What it answers |
| --- | --- |
| `RoutinesTab.tsx` | Programming's routines. A routine with no plan draws as it always did (the rows, Edit routine, the B switch) with a quiet Add a plan; a client with no routine gets the starting door (`routine-plan/ui/StartPlanPanel`: Start a plan, Enter their routine, or both when Journey can't tell); Routine A with a plan is the Lineup (`routine-plan/ui/PlanLineup`) with B's column beside it, and Routine B with a plan is `BPlanView`. A pure function of profile state: every write is a callback into `ClientProfileView`, which owns them through `routine-plan/ui/usePlanActions` |
| `RoutineRowItem.tsx` | One machine of a routine, the same sentence in two looks: the hairline row ("list") and the Lineup's raised cell ("cell", with its place, an action and the plan's word under the name, "instead of Seated Dip") |
| `routine-rows.ts` | The rows' view model, pure: order, machine, the load and last outcome, the setup chips, the watch-outs; `resolveRoutine` finds a routine by either spelling of its name |
| `next-routine.ts` | Which routine the next session runs, the Active Session's rule (A and B alternate while B is on), read by the profile and the session alike |
| `useRoutinesModel.ts` | The profile's routines as the tab draws them |

## Rules that hold here

- **One rule for which routine is A or B** (the first-session round's
  whole-branch review, Oct 9 2026): `matchesRoutineLetter`
  (`src/lib/routine-utils.ts`) takes "Routine A" or an older seeder's "A",
  here, on the briefing, in Start and in every writer, so Programming never
  draws an empty stand-in (`temp-a`) beside a routine the client has, or
  offers Start a plan over it.
- **An empty Routine A is not "no machines"** (AJ, Oct 8 2026: "sometimes the
  consult machines will not be the same as their a routine"). A kept starting
  plan leaves Routine A empty with the first visit's machines on the plan as
  day one. `nextRoutine` returns the empty Routine A as it is; whatever draws
  or starts its machines reads `todayFor` (`routine-plan/plan.ts`).
- **The reason for a change is asked, never required** (Oct 8 2026, reversing
  the Edit routine drawer's and the B switch's three characters): AJ, "it's
  nice to be able to communicate like, hey, I'm changing this plan because of
  this reason". `routine-builder/session-scope.test.ts` holds it.
- **Turning B on with nothing in Routine B opens Plan B**, never an empty
  Routine B that would alternate the client into a session of nothing
  (`routine-plan/ui/useBSwitch`), and only off routines that have answered.

The rounds: `docs/rounds/2026-10-08-first-session-screens.md` (the screens,
§4.3 and §4b) and, before it, the client profile audit and the Screen Atlas's
"Used last on" (Sep 26 2026, `next-routine.ts`'s header).
