# The tracker round — the Active Session audit, built

**Sep 13, 2026 · eight patches on `master` after the gate fix · shipped with `scripts/ship/ship-tracker.ps1`**

The first screen of the screen-by-screen audit: the Active Session (during-set loop, the trainer's Rank 1 path). AJ filled the audit template on Sep 13; this round is that template answered in code. His three decisions on the way: the Now bar becomes a **right-hand panel in landscape**; the automated time estimate is **fixed and kept, relabeled "time on machine"**; and the Now bar's model is his sentence — *"the weight is always there; every set you enter reps; if you aren't entering reps, that's when it's Practice or Skipped"*.

## What the audit said, and where it landed

| Audit verdict | Where it is now |
| --- | --- |
| **"Show one thing": a failsafe way to resume a session from the tab bar after a crash** | `src/lib/live-session.ts` + `AppContent`: the trainer's own In-Progress session is found studio-wide (no client needed), the device also remembers the session id; the tab reads **Session · Judy**, stays orange with a pulsing dot while the trainer is elsewhere, one tap lands back on the right machine |
| The header is not clinical; two iPads side by side need a readable name, not a giant one | `jg-sbar` (journey-grid.css): 17px/800 name, `#52 · AJ · Started 2:21 PM`, the clock pill |
| Pause needs to be visible | the pill goes amber and blinks **PAUSED**; a 32px target |
| Notes / Assessment too close to Discard / Finish; Discard far too big; Finish should be the loud one | Notes and **Check-in** (the one name) left of a divider; **Discard is a trash icon**; Finish is the only filled button |
| The stats cluster is clutter; modifiers have no hierarchy; reps-vs-time toggle confuses | Now bar rebuilt: **LOAD · SET · FORM · NO SET?** groups with one-word kickers; a real REPS \| SEC switch; "N of M logged" moved to the session bar |
| Machine settings must be found at the easiest glance | the settings are **tiles** (GAP 8 · SEAT 8) beside the machine name, first thing on the bar |
| Weight box too big | 78px, three digits and "lb" |
| The stopwatch is a separate cluster | it lives **inside the SEC field**: switch to seconds, press play, stop writes the seconds; scoped to the machine |
| Occupied-machine pivot takes too many taps; drag and drop wanted | **Today's order** sheet (`RoutineOrderSheet.tsx`, dnd-kit): drag handles, **Do next** (one tap: the machine jumps to the first unfinished slot and becomes current), × for today, add from the floor with search |
| The machine pop-up cuts off settings in both orientations | one CSS cause: cards with `overflow: hidden` inside a flex column shrank instead of the body scrolling (`equipment.css`) |
| ~15 machines visible; scrolling hides the routine | the session grid uses `fit="auto"`: rows 44 → 26px so Show: All fits ~20 |
| Landscape is a "foot-long hotdog" | `jg-stage--side`: the Now bar is a 312px column on the right; the grid gets the full height |
| The time estimate is unreliable and reorders move minutes between machines | `src/lib/machine-clock.ts`: one clock per machine, runs only while it is the current one, pauses with the session, follows the machine id; **nothing is charged "since the last one"**; shown as "On machine 2:10" |

Not asked, found and fixed: a 1-second loop in the tracker **deleted the session and every set in it once active time passed 60 minutes** ("abandoned session cleanup"). Gone. Abandoned sessions are hidden by the heartbeat check; nothing on the screen deletes a session except Discard.

## The eight patches

Each is one commit, typechecked on its own, so any one can be reverted alone.

1. **`feat(tracker): the bottom tab resumes a live session after a crash; stop deleting sessions at 60 minutes`** — `src/lib/live-session.ts` (4 tests), `AppContent` (`myLiveSession`, `resumeLiveSession`, the `attention` NavButton), the tracker remembers/forgets the id.
2. **`feat(tracker): a clinical session bar`** — `jg-sbar`, `ActiveSessionTimer variant="bar"`, progress meter, Check-in rename, trash icon.
3. **`feat(tracker): the Now bar rebuilt`** — `SessionNowBar.tsx` and its CSS block; `onLogTSC` removed.
4. **`feat(tracker): drag-and-drop "Today's order" sheet`** — `RoutineOrderSheet.tsx`; the in-cell arrow mode is retired; `applySessionMachineIds` is still the only writer (session-scope guard passes).
5. **`fix(machine-sheet): cards were shrunk to fit instead of the sheet scrolling`**.
6. **`feat(tracker): landscape puts the Now bar beside the grid; rows fit the screen`** — `hooks/useMediaQuery.ts`, `jg-stage`, `fit="auto"`.
7. **`fix(tracker): time on machine runs only while a machine is current`** — `src/lib/machine-clock.ts` (9 tests); the pause refs and the shared last-machine clock are gone.
8. **`docs: the tracker round`** — this file, CLAUDE.md, ARCHITECTURE.md.

## Rules the code now follows

- **Nothing on the Active Session deletes a session but Discard.** Abandonment is a *read-side* rule (`isSessionValid`), never a write.
- **The tab is the way back.** `findMyLiveSession(sessions, trainerId)` never depends on a selected client; `rememberLiveSession` / `forgetLiveSession` bracket a session's life. The tracker adopts a remembered session only for the client on screen.
- **Time on machine ≠ time under tension.** `secondsOn()` is the honest context leaders read; the trainer's SEC field is the only TUT. `machineStartedAt` on the log is still the first arrival (the Not-reached derivation reads it).
- **The reorder sheet edits the session's `sessionMachineIds` and nothing else.**
- **In a flex column, a card with `overflow: hidden` needs `flex: none`** or it will be shrunk instead of scrolled.

## Verification on the mirror

`npx tsc --noEmit` 18 (baseline 18) · `npx vitest run src` 102 files, 1,995 passing · `npx vite build` clean. The session bar and Now bar were rendered in a harness at 768×1024 and 1024×768, light and dark, in the REPS, SEC, Practice, Skipped and Paused states. AJ's own `ship-tracker.ps1 verify` is the run that counts.

## Still open after this round

- The reorder sheet's drag uses a 120ms touch delay; if a drag ever starts a scroll on the iPad, raise it to 200ms in `RoutineOrderSheet.tsx`.
- Practice sets can still carry a count that was typed before Practice was chosen; it is recorded and never counted, by design.
- `MachineSettingsDashboardModal.tsx` and `features/journey-grid/ActiveSessionView.tsx` + `GridToolbar.tsx` are dead (no importer) — a connect-or-delete candidate.
