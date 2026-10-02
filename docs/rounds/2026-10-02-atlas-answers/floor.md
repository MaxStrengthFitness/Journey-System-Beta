# The Atlas answers: the floor (branch `oct2/floor`)

Oct 2 2026, on master's `7875a993`. One commit per item (item 8 is four, one per part), each typechecked at the baseline of 2 with its tests passing. The decisions are in `docs/rounds/2026-10-02-atlas-answers.md`.

**At the end:** typecheck 2 (baseline). `TZ=America/New_York npx vitest run --dir src`: **8,645 passing in 622 files**. `npx vite build` built. No two tracked files differ only by case.

**Nothing for AJ to deploy beyond the app.** No Firestore rules change, no new index, no Cloud Function, no Mindbody change, no new Mindbody call. Every new write goes to a collection the rules already allow (`clientMachineSettings`, `sessions`, `journalEntries`, `progressReports`, `clients.subjectiveSnapshot` via the Pulse's own finalize, renewal cycles).

## 1. Wrap-up congratulations — done

`congratulation()` in `src/lib/post-session.ts` picks one of six plain lines ("Well done, Judy.", "That's a wrap, Judy.", …), seeded by the session id so it never changes on a re-render. None says how she did. The old "strong work." / "good work." is gone.

## 2. The next session's weight from the Wrap-up — done

- **How the start weight is picked today** (unchanged): session start seeds each machine from `clientMachineSettings/{client}_{machine}.currentWeight`, else her last performed weight (`client.currentMachineMetrics`), else the starting weight; Finish rewrites `currentWeight` to what she performed.
- **New:** the Wrap-up's "Next session's weights" card (`src/features/next-weight/`) — one row per machine she performed, starting at today's weight, − / + in two pounds (no machine defines its own step; `DEFAULT_WEIGHT_STEP_LB`), 44px buttons, and a typed entry (saved when the field is left). Each change writes `currentWeight` and a `nextWeight` mark (who, when, which session) onto that same settings document — never the client document. Any trainer at any studio starts from it.
- The Now Bar says where it came from: "Set for today at the last Wrap-up by Sam." (`weightSource` on the grid row).
- **Used up:** Finish deletes `nextWeight` for every machine it logs (`sync-utils.ts`), and readers also check the mark is still current (`isNextWeightLive`: same session, same weight).
- The weight-advice line under the dose ("room to add a little next time", `doseSentence`) is removed.

## 3. The effort rating — done

- `EFFORT_SCALE` (`features/rating/scales.ts`): Left some in the tank · Held back a bit · As expected · Pushed hard · Gave everything; relative; `neutral` (every position in the selection colour, never green or red, via `scaleTone`). Asked "How hard did Judy work today?". It replaces the dose Dial on the Wrap-up.
- Stored as `sessions.effort`. **Untouched saves "As expected"** (AJ's call): 0 with `effortDefaulted: true`, written once on any way out without a tap; a tap writes the value and deletes the marker. `effortOf` in `session-reads.ts`. The legacy `dose` is no longer written and is still read where it was.
- **Reader:** "Effort, lately" on the Kaizen Deep Dive (`clinical-review/effort-trend.ts`): six tapped ratings before anything is said ("Not enough data yet: N of the 6 rated workouts this needs."), then one sentence — lower lately (3 of her last 4 rated below expected, and well under her earlier ones), pushing hard lately (3 of her last 5 marked Pushed hard or Gave everything), or about where it usually is. A default never counts toward the sample or a decline. It reads her latest workouts whatever the report's range.
- KNOWN-TRAPS and `the-floor.md` say so.

## 4. Every way out of the Wrap-up files the Profile note once — done

Back to Hub files and leaves, as before. The bottom bar, the header, a studio switch: the screen files through a new `onFile` (the host's `filePostSessionNotes`, which writes without navigating) as it goes, and asks nothing. Locking the iPad / hiding the page: files and stays, empties the box and says "Profile note saved. Anything you type now is a new note." A sign-out files on `SEND_SETS_NOW_EVENT`, before the person is gone. The note and the mid-session draft are no longer registered with `useUnsavedChanges` (nothing is lost). The draft is filed once per session (host ref).

## 5. A renewal "ask a leader" stays until a leader marks it handled — done

`conversationWrites` writes `needsLeader` only to raise it; a later talk without the tick leaves it out, so the merge keeps it. Only the brief's "Mark the follow-up handled" clears it. Each touch still records whether that talk asked.

## 6. A Pulse answer from the floor counts at once — done

Update Pulse's Done (and closing it any other way after an answer) now saves the round with the same `finalize` Body & Pulse's "Save this round" uses: the report turns Finalized and `clients.subjectiveSnapshot` is stamped, which the Overview, the Hub flag, the report and the renewal brief read. `finalize` now sends a draft still waiting on its first write before reading its id. Nothing is saved when nothing was answered.

- **Not done / for later:** if Body & Pulse is open on another screen with the same open draft, that screen's hook still holds the old draft id after the quick log finalizes it, and a later autosave there would update the finalized report's `subjective` (two iPads on one draft had the same race before). Worth a look when the Pulse is next touched.

## 7. The briefing's milestone and break on the Hub's one engine — done

`hub-opportunities/briefing-moments.ts` hands the engine (`moments-today.ts` `buildEntry`) her session today as a one-booking day, with her directory row built the Hub's way, and the briefing shows the engine's own milestone ("100th today", only from Operations' list and only when her total may be quoted) and break ("Back after 5 wk", missed sessions at her own pace, inside the part of her timeline Journey owns). `lib/hub-markers.ts` lost its every-25th and 21-calendar-day rules. The briefing now takes `studios` (for her home cutover), passed by the tracker.

## 8. Session start and live

**(a) "Finish it as it was" — done.** A third answer on the stale-session question. It finishes the old session with Finish's own writes under its own day and by the trainer who ran it: `completeWorkoutSession(..., { asOfDay })` counts it as one more session (never renumbering her count), moves `lastSessionDate` only forward, and writes a machine's last time and next weight only where nothing newer is on file; `endTime` is its last heartbeat. Its sets are read as Finish reads them. No Wrap-up; the briefing stays for today's session.

**(b) "Skipped: trainer's call" — done.** A machine taken out of today's sequence on the reorder sheet with an untouched placeholder is stamped skipped / `trainers_call` at Finish (`takenOutForToday`), not "Not reached".

**(c) Machine notes in her journal, shown on the machine sheet — done, one writer left.** A new machine note is a journal entry with `machineId` only. Every reader takes one list (`features/equipment/machine-notes.ts`): her journal's notes on the machine (not archived) plus the old `machineNotes` items with no journal copy — the machine sheet (both doors), the Active Session grid's note marks, the profile's Journey grid, the chart grid and the codex's On our floor. `useMachineJournal` uses the journal's existing query and index (one shared listener). Removing a journal note archives it.
- **Left as is:** Programming → Setup's bulk save (`machine-fit/setup-save.ts`) still writes its note onto the old list inside its atomic batch; the one list reads it. The machine sheet's header alert (`MachineSheet`'s `alerts`) still counts the old list only. Nothing in the database was migrated.

**(d) Cross-train notes belong to her home studio — done.** `sessionNoteStudioId` (`client-notes/note-studio.ts`) stamps her home studio on the Note for the next trainer, the Profile note, an unfinished draft, a machine note from the session's machine sheet, and the routine adjustment at Start. The in-session note sheet already did. No rules change (the journal's rules ask nothing of the studio).

## For AJ to check on an iPad

- The Wrap-up: a congratulation, the weights card (raise one, then start her next session and see the Now Bar's "Set for today … by you"), the effort Dial, then leave by the bottom bar with a typed Profile note and find it on her Notes.
- A stale session: "Finish it as it was", then her Activity Archive shows it on its own day.
- Remove a machine mid-session on the reorder sheet, Finish, and the Wrap-up says "Skipped · trainer".
