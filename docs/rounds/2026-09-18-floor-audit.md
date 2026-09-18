# The floor audit — Sep 18 2026

The Active Session measured against **`docs/business/the-floor.md`** — AJ's own
account of what a session is (`For Clarity 2`). The Sep 13 tracker round
answered the screen audit; this round answers the *floor*: the eight truths
below are what the iPad has to keep while it is being set down on a leg press.

This is a findings matrix and a ledger of what was done about each. Commits are
on `fluidity-round`, one per phase.

## The eight floor truths, and the verdicts

| # | Floor truth | What the code did | Risk | Done |
| --- | --- | --- | --- | --- |
| 1 | **Held in one hand, set down at every machine.** Big targets in thumb zones; machine name, pins and weight readable at a glance | Now Bar: name 21px/800, settings tiles 46×40 with 17px values, weight 22px in a 78px box, Next 48px full-width at the bottom, Finish 54px at the top. Kaizen ring and star 44×44. **Settings tiles scroll horizontally with the scrollbar hidden** — a fourth tile can be off-screen with nothing to say so | Low / Med | Sizes hold. The hidden overflow is open (§B) |
| 2 | **The chart above, the Now Bar below.** Every machine and every session visible; the bar is about *now* and covers nothing | Layout is as AJ wants it ("the layout is perfect"). But the bar's own line 1 read `machine → settings → LAST TIME → weight`: last time was ahead of the weight, at 11.5px, on the settings line — the eye still climbed | Med | **The ghost (§3) puts last time in the count field itself.** The "Last · Best" line stays, quieter, as the second glance |
| 3 | **Ghost, never pre-filled.** Weight pre-filled with last time; reps as a grey placeholder; Next with nothing typed logs nothing | Weight: correct, seeded from the last *performed* set. Reps: **empty, with a dash** — no ghost anywhere. Next with nothing typed: correct, writes nothing. **But** tapping the ring before the reps opened the legacy `PerformanceEntryDialog` over the tracker, whose rep stepper started from *last session's* reps — one tap of `+` logged last time's number plus one | **High** | **Fluidity 7.** Placeholder is last time's reps (or the hold's seconds). The dialog no longer opens; the toast is enough |
| 4 | **Three timers, never conflated.** Session elapsed · time on machine (an estimate, includes set-up) · set duration (the stopwatch). Stopping the stopwatch fills the set; nothing touches the machine clock | Session elapsed and time on machine: correct and isolated (Sep 13). The stopwatch: writes `seconds`, never touches the clock — correct. **`machineTimeFields` wrote time on machine into `totalTimeUnderLoad`, `machineDurationSeconds` and `averageTimePerRep` whenever the stopwatch wasn't used** — and those are the fields `tutOf()`, the Equipment tab's average TUT and the clinical review read as muscular time. Two to four minutes of walking and belting-in published as a set's time under tension, every session since the clock landed | **High — data** | **Fluidity 8.** Those three fields are written only when the stopwatch measured them; absent otherwise. Absent is honest |
| 5 | **Pivots without corruption.** Order changes constantly; a toggle mode in the grid, drag by the machine's name, no taps while toggled, add via all-machines + plus; moving a machine never moves its time | Time follows the machine id, not the order — **correct**. Reorder today is a separate sheet (dnd-kit, grip-only, 120 ms / 6 px activation): safe, but three taps and a screen. **No in-grid mode of any kind.** The grid's `+` on a non-routine row is always live — an accidental tap adds a machine with no undo. The in-cell ▲▼× code from before the sheet is dead but still shipped, and `types.ts` still describes it as the design | Med | **Open — Phase 11 (§C)** |
| 6 | **The kaizen ring is one tap, per set, a warning to the next trainer, never a weight change** | One tap, no picker, 44px — correct. Never moves the weight — correct. **Could not be cleared:** tapping the mark that was on sent `quality: null`, and the writer dropped null, so a mis-tap was permanent for the rest of the session | **High** | **Fluidity 7.** Tapping it off returns the set to "completed" |
| 7 | **A note mid-set, from the tracker, whose draft survives.** Close it to spot a set, reopen, continue; the post-session screen flags an unsaved draft | Reachable without leaving the tracker — correct. **The draft did not survive anything:** the sheet closing (unmount), a focus change (a keyed fragment), or a switch to Remember this / Pulse. The composer's own copy promised "your unsaved note is kept", which was false on the one screen it mattered. The post-session screen knew only about *saved* entries | **High** | **Fluidity 9.** The draft belongs to the session: owned by the tracker, mirrored to sessionStorage, carried to post-session with Save / Drop, filed unfiled on leave if untouched |
| 8 | **Cold starts.** A small red marker at the top, tappable for more; never a blocking dialog; nothing slows Start | Start is unguarded — correct. **The briefing shows flags as a full block, not a marker:** every condition chip (a bare `<span>`, not tappable), every critical note as a full card, every heads-up as a full card. `CriticalStrip` — the one component that caps at three with "N more" — is not on the screen that needs it. **The active session has no red-flag marker at all:** the session bar reads name, number, trainer, timer; the Now Bar takes no client and no notes; a critical note tied to a machine never surfaces when that machine becomes current. The thing the trainer needs for twenty minutes disappears the moment Start is pressed | **High** | **Open — Phase 10 (§C)** |

### Also found, not in the eight

| Finding | Risk | Done |
| --- | --- | --- |
| **The Now Bar carried a progression cue** — "▲ Up" against the last set, with a reason a tap away (`lib/progression-cue.ts`). AJ: "the goal of this app is not to come up with a system that tells the trainer when they should be progressing — that's the trainer's job and will always be the trainer's job" | High — philosophy | **Fluidity 7.** Gone from the bar; the pure module stays for a future analytics reader |
| The End Session wrap-up note ("something the next trainer should know") reached only `sessions.notes`, which the briefing never reads | High | **Fluidity 9.** Also filed to the journal as a Heads up |
| Practice / Skip never write `timeSpent`; removing a machine after logging can lose its time | Low | Open |
| The set stopwatch exists only in SEC mode, mutually exclusive with reps. The floor treats set duration as a third, independent record. AJ's own words say "the stopwatch directly inputs into the reps" for a hold — so for a rep set there is today no way to record the set's duration at all | Med — design | Open, needs AJ: is set duration wanted on a rep set? |
| Of the five kinds of mid-session note (this client on this machine · before next session · private · to the team · a request) the sheet covers the first cleanly, the second only as a loudness, and **none of the last three** — though `trainers/{uid}/notes`, `teamJobs` and `taskRequests` all exist and are ruled | Med | Open — Phase 12 |
| The machine name button's `aria-label` says "trace this row" while it opens the machine sheet — VoiceOver announces the wrong action on the most-used target | Low | Open |
| The briefing's `ConditionChip` names the condition and nothing else, although `clinical-watchouts.ts` has the actual instruction and four other screens render it | Med | Folds into Phase 10 |

## What shipped in this round (commits 6–9)

- **6** `docs/business/the-floor.md` — the floor in AJ's words, pointed at from `CLAUDE.md`.
- **7** The Now Bar: ghost reps; no progression cue; the ring clears; the last machine offers "Add another machine" (dashed, quiet — End Session stays at the top); no modal mid-set.
- **8** `machineTimeFields`: time on machine is never written as time under load.
- **9** `features/notes/session-draft.ts`: the draft belongs to the session. The wrap-up note reaches the journal.

## Open phases

### Phase 10 — red flags for the whole twenty minutes
A compact marker in the session bar: the count of clinical flags plus critical notes, red, tappable → the machine sheet's watch-outs / the critical strip. On the Now Bar, when the current machine has a critical or heads-up note tied to it (`journalEntries.machineId`) or a machine-specific watch-out, one line under the settings: *"Holds her breath here — Christian, 3 Sep"*. The briefing swaps its full cards for `CriticalStrip` (three, then "N more") and its condition chips gain the watch-out instruction on tap.

### Phase 11 — the reorder toggle, in the grid
A **Rearrange** toggle on the grid rail. On: machine names become drag handles (dnd-kit, the sheet's 120 ms / 6 px activation), taps on names and cells do nothing else, the `+` on non-routine rows is live, a × appears on today's rows. Off: nothing drags, `+` is hidden (an accidental tap can no longer add a machine). The order sheet stays for "Do next" and the searchable add. Delete the dead in-cell ▲▼× code and the stale design note in `types.ts`. Time follows the machine id already, so nothing to do there.

### Phase 12 — the five notes
The mid-session sheet gains a fourth chip row: **Private** (→ `trainers/{uid}/notes`, linked to the client), **Team** (→ a `taskRequests` hand-off or a `teamJobs` note — decide with AJ), **Request** (→ `taskRequests`, kind `help`). Same draft, same survival.

### Needs AJ
- **Set duration on a rep set.** Keep the stopwatch inside SEC only (a hold's "reps" are its seconds), or let it run beside the rep count so a slow-rep set can carry its duration too?
- **"Team" note:** a Relay hand-off to the leader, or a note on the client that leaders see? They are different collections with different readers.
