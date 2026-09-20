# 01 · The Active Session — the Rank 1 floor path

Reviewed on a clean clone of `master` (a064019). Every `file:line` below was read, not inferred. Line numbers are as of that commit. Paths are relative to `/home/claude/journey`.

---

## 1. What this area does — my interpretation

**One 3,372-line component draws three screens.** `src/components/WorkoutTrackerView.tsx` is mounted by `AppContent.tsx:1651` only while `currentView === "workouts"`, and `src/lib/tracker-screen.ts` decides which of its three faces to show: the **briefing** (`features/briefing/BriefingScreen.tsx`) when the client has nothing In-Progress, the **live tracker** while a session runs, and the **post-session screen** (`components/VictoryHUDScreen.tsx`) from a snapshot taken at Finish. A fourth face, `ConsultationSetupWizard`, appears instead of the briefing for a "prospect" client (`requiresConsultation && !consultationCompleted`, `WorkoutTrackerView.tsx:2428-2468`). Navigating to any other bottom-bar tab unmounts the whole thing; coming back re-mounts it and re-subscribes every stream. The tab itself is the crash net: `AppContent.tsx:700-729` (`resumeLiveSession`) finds the trainer's own In-Progress session from the studio stream or the id the device remembered in `localStorage` (`src/lib/live-session.ts`).

**What it streams.** With a client selected the tracker opens five listeners of its own — `clientMachineSettings` by client (`:701-722`), `routines` by client (`:725-743`), **every** `sessions` document for the client with no limit (`:746-808`), and `exerciseLogs` for the 30 newest of those sessions by a `where in` (`:829-848`) — plus the studio roster order via `useStudioMachines` (`:247`). It also mounts `useClientJournal` for the session-long red flags (`:551-555`), which is **seven more listeners** including a second `sessions` stream (`hooks/useClientJournal.ts:882-1055`). Twelve live listeners for one screen, thirteen when the Notes sheet is open (`components/journal/SessionJournalSidebar.tsx:125-142`), plus one each for the machine sheet's catalog and change history when it opens. The machine rows themselves come from the app-wide `machines` prop, not the studio's roster (`:2023`) — the known "sessions still use the app-wide list" gap.

**Start.** `startNewSession` (`:962-1351`, 390 lines) optionally creates a routine and flips `clients.isRoutineBActive`, then `addDoc`s the session with `sessionMachineIds` (the plan), `clientStartTime` (a client-clock fallback), `preSessionCheckIn`, the heartbeat and `status: "In-Progress"`; remembers the id on the device; maybe writes `clients.firstSessionDate`; files the arrival note to `journalEntries`; and then, **one awaited `setDoc` per planned machine**, seeds a weight-only placeholder log per machine (Left/Right for torso rotation) at the derived id `logDocId(session, machine, side)`. The weight comes from the prescription (`clientMachineSettings.currentWeight`), else the last performed metric, else a computed starting weight from `consultation-utils` (dynamically imported inside the loop, `:1281-1282`). Meanwhile the sessions listener has already seen the local write and switched the screen to the tracker.

**The live loop.** The screen is four zones stacked in portrait: the 54px session bar (`jg-sbar`: name · #N · initials · Started · flag marker · clock pill with pause · "3 of 6" meter · Notes · Pulse · trash · Finish), the 32px grid rail (Show All/Routine · count · Reorder · Older · Key), the `JourneyGrid` with a read-only Today column (`features/journey-grid/JourneyGrid.tsx`, `TodayCell.tsx`), and the **Now Bar** (`features/journey-grid/SessionNowBar.tsx`) — the only place a set is entered. In landscape ≥1000px the Now Bar becomes a 312px right column (`hooks/useMediaQuery.ts:24`, `journey-grid.css:2565-2579`). Focus (which machine the bar edits) is seeded once per session to the first incomplete machine and then moves only on Next, a Today-cell tap, "Do next" in the order sheet, or a skip (`:2184-2231`). Every entry flows `SessionNowBar.onChange → handleGridLiveChange (:2269-2352) → updateLogMultiple (:1881-1972)`, which updates local `logs` first and queues a merge `setDoc` on `exerciseLogs/{docId}` (600 ms debounce, 2.5 s ceiling, flushed on unmount / `beforeunload` / `visibilitychange` / before Finish, `:1789-1860`) and bumps `sessions.lastHeartbeatAt` at most every 30 s. Recording a count auto-writes `repQuality: 2` (`:2334-2340`); the ring (1) and star (3) toggle it (`SessionNowBar.tsx:310-313`). Practice and Skip write `outcome`/`skipReason`/`skipNote`/`machineEndedAt` to every side of the machine (`:2303-2313`); a skip also advances focus (`SessionNowBar.tsx:326-331`). A render effect (`:457-491`) watches `logs` and, the moment a log has weight + count + quality and no `timeSpent`, writes the machine's time fields from `src/lib/machine-clock.ts` and resets that machine's clock. Reorder/add/remove go through `RoutineOrderSheet.tsx` (dnd-kit) into `applySessionMachineIds` (`:628-638`), which writes `sessions.sessionMachineIds` and never the routine (guarded by `routine-builder/session-scope.test.ts`). Notes, FORD captures and Pulse share one right-hand slide-over (`SessionJournalSidebar`), with the mid-session draft owned by the tracker and mirrored to `sessionStorage` (`features/client-notes/session-draft.ts`). The machine's name in the grid opens `features/equipment/MachineSheet.tsx` (notes above dials, writes through `equipment/mutations.ts`).

**End.** Finish (`handleEndSessionPress`, `:1466-1487`) writes `sessions.endTime`, sets local `isPaused`, lists begun-but-uncounted machines with Practice · Skipped (default) · Not reached, and opens the End dialog. "Finish session" runs `commitEndSession` (`:1503-1654`): flush pending log writes, stamp outcomes (`set-outcome.ts:outcomeAtFinish`), create `not_reached` records for planned machines with no log, match the Mindbody booking for lateness, then the one `completeWorkoutSession` batch (`src/lib/sync-utils.ts:140-368`: session Completed + demographic snapshot, every log `set/merge`, `clientMachineSettings.currentWeight`/`startingWeight`, client counters and `currentMachineMetrics`, the `completedSessionRollup`). The wrap-up note is filed to the journal as a Heads up after the batch. The post-session screen reads a snapshot; the dose Dial writes `sessions.dose` on tap, the closing note files on leave, and "Back to Hub" clears the client and returns to `clients`. Discard (trash → "Scrap Active Session?") deletes logs, legacy `sessionNotes` and the session one document at a time (`:1391-1427`). An "Open session" started from the Client Directory with no client (`hooks/useClientMutations.ts:49-99`) ends through a different door: `assignSessionToClient` (`:1353-1389`) sets `status: "Completed"` directly, bypassing the finish batch entirely.

---

## 2. Anomalies — the irregular, clunky and suboptimal

### Data safety and correctness

**1. Critical — the session-start seeds are non-merge `setDoc`s written after the screen is already live, so a resumed loop overwrites logged sets.**
`src/components/WorkoutTrackerView.tsx:1268-1321` (the three `await setDoc(doc(db,"exerciseLogs",logDocId(...)), payload)` at `:1300`, `:1307`, `:1315` carry no `{ merge: true }`).
*What:* the sessions listener (`:751-808`) sees the local `addDoc` immediately and switches to the tracker while `startNewSession` is still awaiting N server round-trips, one per machine; every trainer write to the same derived id is a merge (`:1803-1806`), but the seed is a replace.
*Why it matters:* Firestore's `setDoc` promise does not resolve offline, so a Wi-Fi drop at START parks the loop at the first machine; when the network returns the loop resumes and machine 2..N's placeholders **replace** whatever the trainer logged on them in the meantime — reps, quality, skip reasons gone, and the snapshot echo clears the Now Bar field in front of the trainer. Even online there is a window of N × RTT. "We need the app to be able to act as pen and paper in terms of reliability" (`docs/business/the-floor.md:159`).
*Direction:* one `writeBatch` with `{ merge: true }`, issued before or with the session document — never N awaited round-trips after the screen is visible.

**2. High — Finish cannot complete without Wi-Fi; the trainer is left on "Saving…" with no way out.**
`WorkoutTrackerView.tsx:1563-1574` (`await completeWorkoutSession(...)`) → `src/lib/sync-utils.ts:368` (`await batch.commit()`), then `:1634-1648` only after it resolves; the button is `disabled={isSyncing}` at `:3032-3034`.
*What:* the batch is queued in the persistent local cache (`src/firebase.ts:25-27`) and would commit later, but the UI waits for the backend acknowledgement before showing the post-session screen or clearing the session.
*Why it matters:* the-floor.md rank-2 budget is "~30 seconds, walking the client out". Offline, the trainer sees a disabled "Saving…" for as long as the outage lasts, with no message, and cannot open the next client. The screen has no offline state at all.
*Direction:* treat the local commit as done (latency compensation already reflects it), show the post-session screen from the snapshot, and surface "not yet synced" quietly on the bar.

**3. High — START has no in-flight guard; a double-tap creates two In-Progress sessions with two sets of seed logs.**
`src/features/briefing/BriefingScreen.tsx:806-811` (a plain `<button onClick={handleStart}>`, never disabled) → `BriefingScreen.tsx:252-272` → `WorkoutTrackerView.tsx:962-977` (`if (!clientId) return;` is the only gate; `addDoc` at `:1097`).
*Why it matters:* nothing on screen changes for the seed loop's duration (finding 1), which is exactly when a trainer taps again. The listener adopts whichever In-Progress session sorts first (`:778-784`); the other stays In-Progress until the 60-minute heartbeat rule hides it, with the same `sessionNumber`, and `rememberLiveSession` points at the second one.
*Direction:* a `startingRef` set before the first write and a disabled/"Starting…" button; the same guard belongs on "Finish session".

**4. High — "Keep Training" leaves every machine clock paused and the "On machine" readout frozen.**
`WorkoutTrackerView.tsx:1485` (`setIsPaused(true)` in `handleEndSessionPress`, with no write of `sessions.pausedAt`); `:3025` ("Keep Training" only calls `setShowEndConfirmation(false)`); `:501-504` (`setPaused(machineClocks.current, isPaused)`); `:519` (`if (isPaused) return;` stops the 1 Hz tick).
*Why it matters:* `isPaused` is a local mirror of `pausedAt` (`:495-498`) that this one path sets independently, so after "Keep Training" the session-bar clock (which reads `pausedAt`, `ActiveSessionTimer.tsx:72-73`) keeps running while time-on-machine silently stops accruing for the rest of the session — until the trainer happens to pause and resume. The "clues a leader reads" (`the-floor.md:67`) are quietly wrong for any session where End was pressed early.
*Direction:* one source of truth — either write `pausedAt` at End press and clear it on Keep Training, or don't pause on End press at all.

**5. High — `timeSpent` (time ON machine) has no honest reader: the briefing reads it as a hold's seconds and the nightly Cloud Function averages it as "time under load".**
Writer: `src/lib/machine-clock.ts:122` (`timeSpent: String(onMachineSeconds)`, always). Readers: `src/features/briefing/BriefingScreen.tsx:319-328` (`lastLog?.timeSpent` in the TSC fallback chain at `:323` — the "Last: 120 sec" a trainer reads walking in can be two minutes of belting-in); `functions/src/index.ts:102-112` (`averageTimeUnderLoad` computed from `l.timeSpent`, over **all** logs, not performed ones). Nothing else reads it (grep across `src`, `server`, `functions`).
*Why it matters:* the fluidity round removed exactly this fallback from the writer ("Do not bring the fallback back", `docs/KNOWN-TRAPS.md:61`) but left it in two readers. And the leader-facing sentence the-floor.md promises — "no time on this one, most of the session on leg press" — is not on any screen, so the field is written for nobody. ARCHITECTURE §3.8 already flags `functions/src` for exercise-log aggregates; the specific misread is new.
*Direction:* delete the two fallbacks; either give `timeSpent` its one leader reader (the session dialog / Overview) or stop writing it.

**6. Medium — the auto-close effect writes to Firestore from a render effect, fires on the first rep digit, and then resets the clock the trainer is still standing on.**
`WorkoutTrackerView.tsx:457-491`: guard at `:463` (`!log?.timeSpent` — and `"0"` is truthy, so it is a one-shot sentinel), `updateLogMultiple` at `:478`, `resetMachine` at `:479`; the trigger is the auto quality at `:2334-2340` which lands with the first keystroke of the count.
*Why it matters:* typing "1" of "12" stamps `machineEndedAt` and `timeSpent`; the Now Bar's "On machine 2:10" then drops to "0s" and climbs again while the trainer is still there, and any later ring tap or correction changes nothing. Data flowing out of an effect that watches the very map it writes is the pattern CLAUDE.md warns about in listener form; here it survives only because of the sentinel.
*Direction:* close a machine on a deliberate event (Next, a focus change, Finish) in the handler, not in an effect.

**7. Medium — the torso-rotation branch of that effect tests the legacy id, so the one sided machine is never closed.**
`WorkoutTrackerView.tsx:484` (`if (mId === "torso_rotation")`) while the live machine id is `m-torso-rotation` (`src/data/default-machines.ts:202`, `features/catalog/machine-identity.ts:50`). The `else` branch then looks up an unsided key that never exists for a machine whose logs are `_Left`/`_Right`. Three different "is this machine sided" rules coexist in one file: by id at `:484`, by name at `:1273-1275` and `:2002-2003`.
*Direction:* one `isSidedMachine()` beside `logDocId`, keyed on the catalog id.

**8. Medium — `sessionCount` is *set* to the start-of-session number at Finish, contradicting the "counters are increments" rule three lines below it.**
`src/lib/sync-utils.ts:284` (`sessionCount: currentSession.sessionNumber || increment(1)`); the comment at `:344-346` and `completedSessions: increment(1)` at `:283` describe the rule it breaks.
*Why it matters:* `sessionNumber` was computed as `sessionCount + 1` at START (`WorkoutTrackerView.tsx:978`); a "Log past session" backfill or a second iPad finishing in between is overwritten with a stale total.
*Direction:* `increment(1)`, and let the profile's reconciler own the total as `prior-history.ts:20-28` says it does.

**9. Medium — removing a machine mid-session records nothing, contrary to the Sep 12 decision that a swapped-out machine is recorded as skipped with a reason.**
`src/features/journey-grid/RoutineOrderSheet.tsx:228` (`onRemove={() => onChange(ids.filter((m) => m !== id))}`). At Finish a seeded placeholder for the removed machine is stamped `not_reached` (it is no longer in `activeMachineIds`, so `:1521-1529` infers from the untouched log); a machine with no seed leaves no trace.
*Why it matters:* `docs/ARCHITECTURE.md:91` — "When a machine is swapped for a substitute, the original is recorded as skipped with its reason, not simply removed — we want the data on why the routine changed". The reason vocabulary (occupied, out of service) exists for exactly this and is unreachable from the × .
*Direction:* × opens the same reason strip Skip uses; the machine stays in the day's record as skipped.

**10. Medium — the session number, the milestone markers and the post-session lifetime tiles count Journey sessions only, ignoring prior history.**
`WorkoutTrackerView.tsx:978` (`nextNum = (selectedClient?.sessionCount || 0) + 1`, shown as `#N` on the bar `:2542` and the grid header); `components/VictoryHUDScreen.tsx:320-325` (`client.sessionCount`, `lifetimeReps`, `lifetimeWeight` as "Sessions / Lifetime volume / Lifetime reps" tiles with no `canQuoteLifetime`); `BriefingScreen.tsx:404` feeds the same number to `hubMarkers` for "Session 25/50/100". None of these files import `src/lib/prior-history.ts`.
*Why it matters:* for a migrated client with 300 FileMaker sessions the bar says "#4" and the post-session screen says "Sessions 4" — a confident wrong number on the two screens the client actually sees, against the rule the fluidity round wrote (`KNOWN-TRAPS.md:60`).
*Direction:* `totalSessions()` for the number; `canQuoteLifetime` gating the tiles, "not enough history" otherwise.

**11. Medium — the "Open session" path is a second, incoherent way to finish a session.**
`src/hooks/useClientMutations.ts:49-99` (six hard-coded machine *names* at `:53-60`, `sessionNumber: 0`, `weight: "0"` and `reps: ""` seeds at `:94-95`, `trainerId: authTrainer.id`); `WorkoutTrackerView.tsx:941-945` (no `routineId`, no `sessionMachineIds` → the **whole floor** becomes today's routine); `:1353-1389` (`assignSessionToClient` writes `status: "Completed"` at `:1361`, updates logs one by one, and never calls `completeWorkoutSession`); `:2951-2957` ("Delete Session" with no confirmation, unlike Discard's two).
*Why it matters:* a session assigned this way carries no rollup, no outcome stamps, no `currentWeight` rewrite, `sessionNumber 0`, and six `skipped: unknown` logs for the machine names the studio may not even use. It is reachable from the Directory header ("Open session", `components/ClientDirectoryView.tsx:482-491`).
*Direction:* either route assignment through `commitEndSession` with a real client, or delete the path (see question H).

### The floor loop — taps, targets, reach

**12. High — the floor's number entry is the iPad system keyboard, which covers the Now Bar; every set costs a field tap and a keyboard dismiss, and the app already owns the fix.**
`src/features/journey-grid/SessionNowBar.tsx:360-375` (`<input type="text" inputMode="numeric">`, no `autoFocus`, no `enterKeyHint`, no key handler) and `:484-494` (weight, same). Compare `src/features/machine-fit/ui/QuickPad.tsx:4-10`, whose header describes the cost verbatim: "tap the cell, wait for the keyboard to slide up over half the screen, find the number row, type, find the next cell underneath it."
*Measured core loop per machine (portrait, iPad set down):* tap the count field (1) · digits (1–2) · dismiss the keyboard (1, because Next sits under it) · optional ring (1) · Next (1) = **4–6 taps**, 24–36 per six-machine session. Static hold: Sec (1, a 22 px target) · play (1) · stop (1) · Next (1) = 4. Weight −10 lb: 5 taps of "−" or field + digits + dismiss = 4–5. Skip: 2 (pain: 3–5, keyboard again). Practice *with* a count: 5–6, and only in that order (finding 15).
*Direction:* a docked pad under the bar (digits, backspace, ring, Next) with `inputMode="none"` as Setup already does — reps + Next becomes two taps and the bar never moves.

**13. Medium — nine controls on the live screen are under the 40 px floor, and four of them are on the per-set path.**
Under 40 px: REPS | SEC — two `flex: 1` buttons in a 44 px column = **22 px each**, 9.5 px type (`journey-grid.css:1392-1420`); stopwatch play/stop **30 px wide**, reset **24 px** (`:1424-1437`); the rail's Show All/Routine, Reorder, Older and Key ≈ **22 px tall** (`:1713-1734` `height: 22px`; `:1784-1800`, `:1805-1825`, `:1832-1847` padding 4 px on 10 px type); the grid's `+` **28 × 28** (`:1117-1129`); the pause button **32 px** (`:2212-2226`, the round doc calls it "a 32px target"); "Do next" **36 px** (`:2476-2483`); and in Show: All every machine-name button and Today cell shrinks to **26 px** rows (`:200-203` with `fit="auto"`, `WorkoutTrackerView.tsx:3213`, `docs/rounds/2026-09-13-tracker-round.md:21`).
*Why it matters:* CLAUDE.md's first product decision is "Nothing tappable under 40px"; the Sec switch and the stopwatch are the whole static-hold path.
*Direction:* the unit switch as two 44 px side-by-side buttons; the stopwatch play as a 44 px button; the rail either 40 px or its controls moved into the sheet.

**14. Medium — the screen's hands are at both ends: everything "pressed every session" except the set itself lives at the top.**
Notes and Pulse (`WorkoutTrackerView.tsx:2594-2616`), the flag marker (`:2556-2567`), pause (`:2569-2576`) and the rail (`:3125-3190`) sit in the top 86 px; the set and Next sit in the bottom ~210 px above an 80 px nav (`AppContent.tsx:1861`, `min-h-20`); the grid targets are in between. In portrait the chrome is 54 + 32 + ~210 + 80 ≈ **376 px**, leaving the grid ~650 of 1024 px in a PWA and ~550 in Safari.
*Why it matters:* the-floor.md names five things a trainer writes *during a set* (`:105-119`), and the Notes door is top-right, the farthest point from a thumb on a held portrait iPad; the audit put Finish/Discard up there deliberately, but Notes/Pulse inherited the placement.
*Direction:* Notes (and the flag) belong with the set — on the Now Bar or as a swipe on it; the rail's four controls are read far more than pressed and could fold into the Reorder sheet.

**15. Medium — Practice replaces the count field, so a practice set can only carry numbers typed *before* Practice was chosen.**
`SessionNowBar.tsx:387-405` (`outcomeField()` swaps in for `countField` when `noSet`, `:508-509`); `docs/rounds/2026-09-13-tracker-round.md:105` records this as "still open".
*Why it matters:* ARCHITECTURE §1.6 says practice data is "recorded for history but excluded from averages"; the natural order on the floor is "she got on it — that was practice — she did 8". Today that order needs × , type, Practice: three extra taps.
*Direction:* keep the count field and add the P mark beside it; Practice is a flag on the set, not a replacement for it.

**16. Low — the stopwatch belongs to the focused machine's L side only and resets on any focus change.**
`SessionNowBar.tsx:79-94` (state reset on `machineId`), `:376-381` (mounted only for side "L"). A Today-cell tap or a "Do next" mid-hold zeroes a running hold; a sided machine's Right hold has no clock.
*Direction:* lift the running stopwatch to the tracker keyed on the machine it was started for, so moving focus cannot lose it.

**17. Low — names are truncated on the live screen, and one 2 lb step is hard-coded for every machine.**
`journey-grid.css:2173-2183` (`.jg-sbar__name` ellipsis), `:1191-1201` (`.jg-nb__name`, portrait), `:1626-1635` (`.jg-nb__nextname`), `WorkoutTrackerView.tsx:2979` (`truncate` on the End-dialog machine name); `weightStep: 2` at `:2381` and `step={2}` at `:3229`, with no per-machine increment anywhere in `src/types/machines.ts` or `src/lib/machine-template.ts`.
*Why it matters:* "names are never truncated" is a listed decision; a leg press at 300 lb is five taps for +10.
*Direction:* wrap names; put the load increment on the machine (it is hardware, which the template boundary says the studio owns).

### State, render and performance

**18. High — every keystroke rebuilds the entire grid twice (local write, then the Firestore echo); the README's "typing a rep re-renders exactly one row" is no longer true.**
`WorkoutTrackerView.tsx:2022-2097` (`gridRows` memo depends on `logs` and `currentSession`; `historyLogs` is re-filtered from `Object.values(logs)` at `:2036-2038`); `features/journey-grid/adapters.ts:146-150` (`toJourneySet` mints a new object per set per call); `JourneyGrid.tsx:208-224` passes those to `JourneyCell` (memo'd, but every `set` prop is new). `features/journey-grid/README.md:334` still claims the one-row behaviour of the deleted `useLiveSession`.
*Why it matters:* 30 sessions × ~20 machines of history is re-adapted and every cell re-rendered for each digit of "12", once for `setLogs` and again when the snapshot lands (`:842`), plus once more for the auto-quality and once for the time-close. It is fast today; it is the shape that turns FileMaker-slow as history grows ("slower with every machine and every session on screen", `the-floor.md:153`).
*Direction:* split history rows (memo on history logs only) from today's values (`gridLiveValues` already exists); adapt history once per session change.

**19. Medium — a 1 Hz `setState` at the root of the 3,372-line component, with unmemoised child props, re-renders the whole screen every second.**
`WorkoutTrackerView.tsx:409` (`machineTimeElapsed`), `:514-522` (the interval), `:3243` (its only consumer, a 10.5 px readout); `gridLive` is rebuilt every render at `:2354-2383` so `SectionBlock`/`Row` memo (`JourneyGrid.tsx:504`, `:1088`) never holds; `SessionNowBar` gets fresh `onChange`/`onNext`/`onAddMachine`/`flagLine`/`onOpenFlag` every render (`:3228-3240`) so its `memo` (`SessionNowBar.tsx:635`) never holds either.
*Why it matters:* `ActiveSessionTimer.tsx:69-79` already shows the right shape (a leaf with its own tick); the readout should be the same leaf. Also `live.onChange` and `live.weightStep` are passed and **never read** by the grid (grep: 0 uses in `JourneyGrid.tsx`/`TodayCell.tsx`).
*Direction:* move the tick into the readout; `useMemo` the `gridLive` object and `useCallback` the bar's handlers; drop the two unread props.

**20. Medium — listener churn: the three-stream effect re-subscribes on every roster snapshot because `clients` is in its deps and unused in its body; the client's `sessions` query has no limit.**
`WorkoutTrackerView.tsx:698-816` (deps `[clientId, user?.uid, clients]` at `:816`; `clients` is not referenced between `:699` and `:815`); `:746-749` (`where("clientId","==",clientId)` with no `orderBy`/`limit`; sorted in memory at `:756-774`); `:850-855` (a string-concatenation dependency key for the logs effect).
*Why it matters:* `AppContent.tsx:553-564` re-derives `clients` on every roster document change — another trainer finishing a session, the nightly renewal job — so a live tracker tears down and re-opens settings/routines/sessions several times an hour, each re-open re-firing `setSessions`/`setIsPreSessionMode` and every memo below. A 300-session client streams 300 documents to show 30.
*Direction:* drop `clients` from the deps; `orderBy("date","desc")` + `limit(30)` (the logs effect only ever uses 30) — a composite index the profile already has.

**21. Medium — 8 dead `useState` pairs, 2 dead effects and ~195 lines of unreachable JSX inside the tracker; ~830 lines of dialogs nothing can open; one dead module.**
Never set to a value: `editingWeightMachineId`/`editingWeightSide`/`isStaticHoldOverride` (`WorkoutTrackerView.tsx:309-311`, `:1735-1737`, `:348`; only ever reset at `:2709-2711`, `:2771-2776`), `historyMachineId` (`:349`; only `setHistoryMachineId(null)` at `:2868`), `showRoutinePicker` (`:301`; written false, never read), `searchTerm`/`debouncedSearchTerm` (`:640-648`, never read), `setupPromptMachineId` (`:320-323`; set only by the effect at `:325-347`, which is gated on the dead `editingWeightMachineId`). Unreachable JSX: the `PerformanceEntryDialog` block `:2636-2780`, `SetupPromptDialog` `:2786-2809`, `ExerciseHistoryDialog` `:2864-2871`, and the `showClientPicker` dialog `:2874-2884` (`setShowClientPicker(true)` is never called anywhere — `AppContent.tsx:854` declares it, `:1661-1662` passes it). Files with no live importer as a result: `src/features/tracker/PerformanceEntryDialog.tsx` (515 lines), `ExerciseHistoryDialog.tsx` (190), `src/features/equipment/SetupPromptDialog.tsx` (123), `src/lib/historical-utils.ts` (53). Props typed but never destructured: `setClientFormData`, `onOpenInfo` (`:218-219`, passed at `AppContent.tsx:1664-1668`).
*Why it matters:* `PerformanceEntryDialog.tsx:9` says "the tangled middle waits for a render test" — the render test never came and the dialog it protects has been unreachable since the Now Bar took over entry. ARCHITECTURE §4.2 names the god file; the specific dead mass is new.
*Direction:* delete the lot in one commit; the file drops under 3,000 lines with no behaviour change.

**22. Medium — more dead branches shipped inside live components, and a stale architecture claim.**
`JourneyGrid.tsx:278-311` (reorder-mode arrows; `live.reorder`/`onMoveMachine`/`onRemoveMachine` are never passed — grep finds only `types.ts:141-143`) plus `journey-grid.css:1737-1774`; `components/ActiveSessionTimer.tsx:122-184` (the "card" variant, with a raw `rgba(240,108,34,0.4)` at `:142`; the only mount is `variant="bar"`, `WorkoutTrackerView.tsx:2570`); `src/lib/progression-cue.ts` has **no caller** except its test — the tracker imports only `traineeLevelOf` (`:140`) to feed `level` (`:3241`), which `SessionNowBar.tsx:49-53` documents as unused. `docs/ARCHITECTURE.md:296` (§2.8 row 4) still says the cue is "a chip in the Now bar and on the briefing's sequence rows"; both were removed on Sep 13/18.
*Direction:* delete the branches; either delete `progression-cue.ts` or say where it will be read.

**23. Medium — TypeScript is non-strict, so every `| null` on this screen is decorative and `useState(null)` is `any`.**
`tsconfig.json` has no `strict`, `strictNullChecks` or `noImplicitAny`. Probe (a two-line file compiled with the project's tsconfig): `const [a] = useState(null); const s: string = a;` compiles clean; with `--strict` it fails as expected. In the tracker: 35 `any` tokens, 13 `: any` annotations, 12 `as any` casts (`:2404`, `:2497` on the logs handed to the post-session and briefing screens; `schedules: any[]` at `:210`); `completeWorkoutSession`'s signature is `any` × 4 (`sync-utils.ts:140-152`).
*Why it matters:* the tracker's correctness rests on null guards (`currentSession?.id`, `selectedClient?.homeStudioId`) that the compiler never checks; the memory note about `useState` "resolving to any" is this.
*Direction:* `strictNullChecks: true` first (the smaller hit), measured as a new baseline, before more floor rounds land.

**24. Medium — the Rank 1 screen has zero mount coverage.**
No `*.render.test.tsx` imports `WorkoutTrackerView` or `SessionNowBar` (grep across `src`); the only live-column mount is `features/journey-grid/recent-journey.render.test.tsx:204-214`. The pure libs are well tested (`machine-clock`, `set-outcome`, `tracker-screen`, `live-session`, `post-session`, `session-timing`, `log-validation`).
*Why it matters:* CLAUDE.md: "A green typecheck, suite and build do not mean a screen mounts… add one for any component that does work during render or in a layout effect." The tracker has 20 effects and mounts the grid's layout effects; findings 4, 6, 7 and 15 are all things a mounted test of "type 12, tap ring, tap Next, tap Keep Training" would have pinned.
*Direction:* one render test with a fake Firestore that walks a two-machine session start → set → Practice → Finish, asserting the writes.

### Vocabulary, tokens and small things

**25. Medium — one action, four names; Gemini-era copy and raw palette classes survive on the floor's dialogs.**
"Discard this session" (`:2625-2626`) → "End Session?… conclude this standard workout session?" (`:2906-2912`) → "Abort Session (No Record)" (`:3045`) → "Scrap Active Session?" / "Scrap Session" / "Scrapping all logged sets, timers, and notes. Cleaning database records..." (`:3073-3078`, `:3102`) → "Delete Session" / "Danger Zone" (`:2947`, `:2956`); "Unassigned Tracking", "Initializing..." (`:2537-2538`); a pulsing orange "NEW CLIENT INTRODUCTORY SESSION: CONVERSATIONAL BASELINE" banner (`:2516-2524`, `animate-pulse`); the consultation path files a journal note reading "Routine adjusted for today: Consultation Baseline Protocol Generated" (`:2454`, via `:1144-1147`). Both dialogs are `border-slate-200`, `text-red-600`, `bg-red-600`, `bg-slate-900` utilities (`:2977`, `:2953`, `:2996`, `:3086-3093`) rather than the tokens the rest of the screen uses.
*Direction:* one word (Discard), the studio's English, `--jg-*`/`--eq-*` tokens.

**26. Low — the red kaizen colour is reused for critical flags, directly under the comment saying it must not be.**
`journey-grid.css:1586-1590` ("Red is reserved for rep quality in the grid; here the tone tokens are the rating system's own") followed by `:1610` (`.jg-nb__flag--critical { background: var(--jg-q-poor-fill…); border-color: var(--jg-q-poor-text…)`) and `:2294-2298` (`.jg-sbar__flag--severe`, the same tokens).
*Why it matters:* CLAUDE.md: "The red kaizen mark is reserved for rep quality." A trainer scanning for red rings now also sees red flags in the same hue on the same screen.

**27. Low — the post-session screen leaves itself when the app is backgrounded with a closing note typed.**
`components/VictoryHUDScreen.tsx:276-283` (`visibilitychange` → `leave()`) → `WorkoutTrackerView.tsx:1701-1734` (`setSelectedClientId(null); setView("clients")`). A trainer who checks the schedule app mid-note comes back to the Hub with the post-session screen gone (the note is saved). The same handler in the tracker (`:1851-1860`) only flushes, which is the right shape.

**28. Low — five copies of "strip undefined" and two of `hasCount`; two consultation wizards; a comment that names a function that does not exist.**
`WorkoutTrackerView.tsx:1032-1050` (`cleanFirestorePayload`), `sync-utils.ts:194-207` (`cleanData`), `features/studio-tasks/task-wizard.ts:186`, `features/trainer-profile/roster.ts:40`, `subjective-report/checkin-draft.ts:63` and `checkin-write.ts:111` — CLAUDE.md names one `withoutUndefined`. `hasCount` in `src/lib/log-validation.ts:14-18` and `src/lib/set-outcome.ts:117-121`. `components/ConsultationSetupWizard.tsx` (233 lines, the tracker's) beside `ConsultationWizard.tsx` (606, AppContent's) — ARCHITECTURE §4.2 item 4, still true. `WorkoutTrackerView.tsx:1893-1894` says "After a refresh startedAtFor reads the clock back from here"; nothing named `startedAtFor` exists, and the clocks are recreated on every session-id change (`:287-289`), so accumulated time-on-machine does *not* survive a refresh or a tab switch — only the first-arrival stamp does.

**29. Low — the assign-session picker and the machine sheet bypass two house rules.**
`features/tracker/ClientSelectionDialog.tsx:49-55` — a person-search input without `NAME_SEARCH_PROPS` (`KNOWN-TRAPS.md:93`); `:71-73` prints each client's body weight in the pick list. `features/equipment/MachineSheet.tsx:166` builds the header name from `firstName lastName` instead of `clientDisplayName` (the nickname rule, `KNOWN-TRAPS.md:108`). `WorkoutTrackerView.tsx:2255` formats "Started 2:21 PM" with the device locale (`toLocaleTimeString([]…)`) rather than `formatStudioDate`.

---

## 3. Metrics

| Measure | Value |
| --- | --- |
| `WorkoutTrackerView.tsx` | 3,372 lines; 141 import lines; ~409 comment lines (12 %) |
| Hooks in the tracker | 38 `useState` (8 dead) · 20 `useEffect` (14 set state; 2 dead) · 12 `useRef` · 14 `useMemo` · 5 `useCallback` |
| `any` in the tracker | 35 tokens: 13 `: any`, 12 `as any` |
| Firestore live listeners during a session | 12 (5 in the tracker + 7 via `useClientJournal`, incl. a second `sessions` stream); +1 Notes sheet, +2 machine sheet |
| Firestore write call sites in the tracker | `updateDoc` 10 · `setDoc` 4 · `addDoc` 2 · `deleteDoc` 3 · `getDocs` 3, plus the finish batch in `sync-utils.ts` |
| Write cadence per set | local `setLogs` per keystroke; one coalesced `setDoc/merge` per document (600 ms / 2.5 s max); heartbeat ≤ 1 per 30 s; whole-grid rebuild ×2–4 per keystroke |
| Session start | 1 `addDoc` + up to 2 `clients` writes + 1 journal write + **N sequential awaited `setDoc`s** (non-merge) |
| Unreachable code found | ≈ 1,300 lines (dialogs 828 · tracker JSX ≈ 195 · `historical-utils` 53 · timer card 63 · grid reorder 34 · `progression-cue` 124) |
| Controls under 40 px on the live screen | 9 distinct (REPS/SEC 22 px, stopwatch 30/24 px, rail ×4 ≈ 22 px, `+` 28 px, pause 32 px, Do next 36 px; rows 26 px in Show: All) |
| Taps per machine, core loop | 4–6 (24–36 per six-machine session); static hold 4; skip 2 (pain 3–5); practice-with-count 5–6; add machine 3–4; reorder 3; note 4 + typing |
| Portrait chrome | 54 (bar) + 32 (rail) + ≈210 (Now Bar) + 80 (nav) ≈ 376 px; grid ≈ 650/1024 px |
| Render tests mounting the tracker or the Now Bar | 0 (one `JourneyGrid` live-column mount in `recent-journey.render.test.tsx`) |
| `tsconfig` strictness | none (`strict`/`strictNullChecks`/`noImplicitAny` absent); probe confirms `useState(null)` → `any` |
| Timers per the-floor.md | session elapsed ✓ (`ActiveSessionTimer`, from the document); time on machine ✓ per machine, but lost on refresh/tab switch and frozen after "Keep Training"; set duration ✓ (stopwatch → `seconds`, TUT fields only then, `machine-clock.ts:125-129`) — TUT is captured **only** when the stopwatch is used |

---

## 4. Direct questions for AJ

**Entering the set**
1. The Setup screen already has a docked keypad because "the keyboard slides up over half the screen" (`QuickPad.tsx:4-10`). Why does the Rank 1 screen still use the iPad keyboard — is there a reason "digits → Next" on a pad under the bar would not be the two taps the floor doc asks for?
2. Every counted set is stored as quality 2 the instant a digit is typed (`:2334-2340`). Is "2" a judgement the trainer made or a default the app made? If the latter, should the field be `null` until a trainer marks something, so the Deep Dive cannot read silence as "completed clean"?
3. Practice and Skip are two 44 px ghost buttons on every set, yet your own sentence is "every set you enter reps". Would they earn their place better behind the count field (a long-press, or the × that already appears) so the bar carries only the set?

**The grid during a set**
4. On a held portrait iPad the grid gets ~60 % of the height and, with Show: All, rows shrink to 26 px — below your 40 px rule. Is the full history grid worth its height *while a set is running*, or is the live screen the Now Bar plus "last · best · today" with the grid one tap away?
5. Your Sep 18 ask was a toggle mode *in the grid* — drag by name, nothing draggable outside it (`the-floor.md:99-103`). The sheet exists because `.jg-row` is `display: contents` (`types.ts:125-140`). Do you still want the in-grid mode, knowing it means rebuilding row alignment, or is the sheet now the answer?
6. The × in the order sheet removes a machine with no record (`RoutineOrderSheet.tsx:228`), against your Sep 12 decision that a swapped machine is recorded as skipped with its reason. Which do you want: the decision or the ×?

**Timers and data**
7. Nobody reads `timeSpent` except a Cloud Function that calls it time under load and a briefing fallback that shows it as hold seconds. Where is the leader screen that reads "most of the session on leg press" — or should the field stop being written until it exists?
8. Should the bar say "#304" (Journey + prior history) or "#4 in Journey" for a migrated client? Today it says "#4", and the post-session tiles say "Sessions 4".
9. With no Wi-Fi, Finish shows "Saving…" until the network returns. Is "commit locally, show the post-session screen, mark unsynced" acceptable, or must a session be server-acknowledged before the trainer walks the client out?

**Paths that may not earn their place**
10. "Open session" from the Directory creates a session with six hard-coded machine names, weight "0", and ends it without the finish batch — no rollup ever sees it. Who uses it, and for what?
11. `PerformanceEntryDialog`, `ExerciseHistoryDialog` and `SetupPromptDialog` (828 lines) cannot be opened from anywhere; `PerformanceEntryDialog.tsx:9` says the split "waits for a render test". May they go now, and may the tracker get that render test as the price of any further floor work?

**Engineering posture**
12. `tsconfig.json` has no `strict`; a `useState(null)` is `any` and no null guard on the floor is checked. Are you willing to turn on `strictNullChecks`, take the error-count hit as a new baseline, and fix the tracker first?
13. Is 2 lb really the plate step on every unit in all four studios (leg press included)? If not, the increment belongs on the machine, which the template boundary says the studio owns.
