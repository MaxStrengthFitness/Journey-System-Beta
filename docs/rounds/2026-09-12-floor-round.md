# The floor round — the four set outcomes, Finish that never blocks, and the clues a leader reads

**Sep 12–13, 2026 · six patches on `master` after the hygiene commit (c0a7014) · shipped with `scripts/ship/ship-floor.ps1`**

This is the first round built against `docs/ARCHITECTURE.md`. It brings the Core tier — the Active Session — in line with Section 1: the anti-blocker rule (invariant 2), the four set outcomes (invariant 4), Finish-saves-the-core-first (invariant 5), and the leader's Monday-morning question about performance discrepancies (§1.5), which needs the blank cell to finally mean one thing.

## What AJ decided, and where it landed

| Decision (Sep 12) | Where it is now |
| --- | --- |
| Every planned machine ends in one of four states; only **Performed** counts | `src/lib/set-outcome.ts` — one module, twenty-odd callers |
| State 2 is named **Practice**: recorded, never counted, linked to the pain map | `outcome: "practice"` on the log; the grid draws it in muted ink in a dashed frame with a `P`; `practiceRegion` reserved for the pain-map round |
| **Skip reasons**: pain or injury (with body area), machine occupied, out of service, client declined or fatigued, trainer's call, other. Record why a machine left the routine, don't just remove it | `skipReason` + `skipNote`; the Now bar's Skip strip; `⊘` + one-word reason in the grid |
| **Not reached** is derived at Finish, **never prompted** | `outcomeAtFinish()` + `isBegunLog()`: the untouched placeholder is stamped `not_reached`; a lone `·` in the grid |
| **Never block a save** | End Session lists begun-but-uncounted machines with Practice · **Skipped (default)** · Not reached — one tap still finishes |
| Leaders read **clues**, not explanations | the per-machine clock persisted on the log (`machineStartedAt` / `machineEndedAt`); `bookingStartTime` and `startedLateByMinutes` on the session when a Mindbody booking matches |
| A faster progress-or-regress marker for the briefing (Rank 3) | `src/lib/progression-cue.ts` — Up · Hold · Down, in the Academy's order, in the Now bar and on the briefing rows |
| FileMaker blanks import as **Skipped: unknown (FileMaker)** | `importedOutcome()` — the one function an importer calls; the chart importer already stamps it |
| Don't track which trainers aren't writing notes | the per-trainer note rate and both note sentences are gone from Insights |

## The six patches

Each is one commit, typechecked on its own, so any one can be reverted alone.

1. **`feat(sets): the four set outcomes and session timing, decided once`** — `src/lib/set-outcome.ts` (the vocabulary, `outcomeOf`, `isPerformedLog`, `performedOnly`, `outcomeAtFinish`, `unreachedMachineIds`, `importedOutcome`), `src/lib/session-timing.ts` (`matchBookingForSession`, `sessionTimingFields`), the fields on `ExerciseLog` and `WorkoutSession`. 23 tests.
2. **`feat(sets): every average, rollup and "last time" reads performed sets only`** — the Journey grid (view models, adapters, stats, the three new cell states, the legend), `completeWorkoutSession`, `client-rollups` (and the delete path), clinical review's `toSetFact`, equipment usage and TUT, `progress-utils`, the next target weight, `clinical-review-utils`, Insights, the briefing's "last time", the Victory tiles, routine rows, the routine drawer, the machine dashboard, the leaderboard cron, the client-history model and the session dialog (which now says Practice / Skipped — reason / Not reached). The chart importer stamps `importedOutcome`.
3. **`feat(tracker): Practice and Skip on the floor; Finish confirms instead of blocking`** — the Now bar's two outcome buttons and the Skip strip (pain asks "where?" once, optional); End Session's per-machine choice; Finish stamps outcomes, creates not-reached records, writes the timing fields; the clock survives a refresh.
4. **`feat(cue): up / hold / down against the last performed set, in the Academy's order`** — `src/lib/progression-cue.ts` (8 tests), the chip in the Now bar (tap for the reason — never hover-only) and on the briefing's sequence rows.
5. **`feat(journal): session notes write to journalEntries; authors are the Auth uid`** — the pre-session and post-session notes go to the canonical Journal (the post-session note *after* the finish batch, on its own, so it can never take the session down); every journal author id is the Auth uid, which the rule pins `authorId` to; the dead `handleSaveFocus` is deleted.
6. **`chore(insights): stop tracking which trainers are not writing notes`**.

## Rules the code now follows — read these before touching set data

- **Read an outcome only through `outcomeOf()` / `isPerformedLog()`.** Never off the field: logs written before Sep 13 have no `outcome`, and the compatibility rule (a count → performed; no count → skipped, reason unknown) lives in one place.
- **Any count is an effort.** Reps or seconds, including the legacy `outcomeReps` / `outcomeTut` aliases. Only a log with no count at all is a skip. The hold flag decides which number a screen shows, not whether the set happened — so no real work was reclassified.
- **A weight alone proves nothing.** Session start seeds a log for every planned machine with just the prescribed weight, so `isBegunLog()` is what separates "the trainer worked on this" (an effort, an outcome, a quality mark, the clock) from "the session never got here". The clock is persisted the first time anything is written for the machine — never on focus alone.
- **Finish stamps only what is not performed.** A performed set stays inferred, so a later edit that zeroes it is not frozen as performed.
- **A skip closes the machine's clock and moves focus on.** It is the one entry that *is* "move on"; the screen otherwise never moves on its own while a set is being judged.
- **Notes never delay the next client.** The post-session note is written after the batch commits; a failure toasts "Session saved. The note could not be saved" and nothing else.

## Behaviour changes to know about

- A **legacy weight-only log** (no reps, no seconds) now draws as a skipped cell and no longer sets a row's first / lowest / highest weight or votes in `machineStats`. It never counted toward volume.
- **Ending a session never fails on a missing count.** The old "Add reps for X before finishing" wall is gone.
- **"N of M logged"** in the Now bar counts a practice or skipped machine as settled.
- **New sessions' notes** appear in the Journal and the Briefing (both already read `journalEntries` and `sessionNotes` together). The legacy history view — slated for deletion — stops seeing new notes.
- **Insights** no longer has a Notes column or a note-rate observation. The "Sessions with a note" tile stays as a plain number.

## Not in this round — deliberately

- `functions/src` (the trainer rollups) was not in the cloud mirror and is Cloud Functions code — it needs an explicit OK. Check it for exercise-log aggregates before Gate B (ARCHITECTURE §5.7).
- `rollupFromHistory` is not re-run for clients whose `machineStats` predate the rule — a `scripts/*.ts` dry-run / `--commit` chore when AJ says so.
- No Firestore rules or indexes change. The new fields ride inside `exerciseLogs` and `sessions`, which the existing rules already allow the tracker to write.
- The MachineSheet has no outcome row; a machine is marked from the Now bar (tap its Today cell first).
- `practiceRegion` (the pain-map link) is typed and not yet written — it belongs with the check-in / FORD round, where the body map gets its screen.

## Three fixes riding along (Sep 13, found from AJ's screenshots and the CI log)

8. **`fix(kaizen)`** — the Kaizen Roster could not be saved from the one-tap add on a client's header: `addToRoster` produced `note: undefined`, and Firestore refuses a document with an `undefined` anywhere in it ("Unsupported field value: undefined … trainers/{uid}"). Entries are now written without undefined keys; a patch of `undefined` clears a field. This is the "Kaizen list doesn't sync" report.
9. **`fix(auth-gate)`** — the Mindbody gate's "Couldn't confirm your account just now" now says *which* read failed and Firestore's own reason (e.g. `could not read the studio list (HTTP 403: Missing or insufficient permissions)`), so the next report carries its diagnosis. No behaviour change.
10. **`ci`** — the CI job now generates `firebase-applet-config.json` (a dummy — CI never talks to Firebase) before the typecheck, tests and build, the way Render's prebuild does. On a fresh clone the file didn't exist, so every run was two type errors over the 18 baseline and could not build: CI had been red since its first run on Sep 12.

11. **`fix(auth-gate)`, second part (shipped on its own with `scripts/ship/ship-gate.ps1`)** — fix 9 did its job: the next report read *"could not read the studio list (HTTP 403: Missing or insufficient permissions)"*. The gate was **listing the whole `studios` collection** with the caller's token, and the live rules refuse that list even though the same token may read the studios the caller works at. Firestore refuses a list when *any one* document it would return is off-limits, so a public-facing server can never depend on one. The gate now reads only the studios named on the caller's own trainer document, one `get` each (cached ten minutes), and a role that reaches every site reads no studio at all. The repo's `firestore.rules` says `studios` is readable by anyone signed in, so the live rules differ from the repo — worth a `scripts/fetch-live-rules.ts` run when there is a quiet moment, but the gate no longer cares either way.

## Verification

Cloud mirror on the post-hygiene tree: `npx tsc --noEmit` 18 errors (the baseline, unchanged); `npx vitest run src` 87 files / 1,813 tests; `npx vite build` clean. **AJ's own runs on the PC are the ones that count** — `ship-floor.ps1 verify` runs all three and compares the typecheck count to master's before anything is pushed.

## Shipping

`scripts\ship\ship-floor.ps1 -Stage prepare` (applies the six patches on a branch off `master`, refuses if master has moved past c0a7014 without a clean apply), `-Stage verify` (typecheck, tests, build), `-Stage golive` (fast-forward `master`, push — Render deploys). No rules or indexes deploy this round. Logs go to `logs\ship-floor.log`.
