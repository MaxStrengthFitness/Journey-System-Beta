# The machine menu — Oct 4 2026

**Branch:** `oct4/machine-menu`, in the worktree `.claude/worktrees/machine-menu`, off master `e38d29bb` (the Navy Frame's last commit, what is live). Nine phases, one commit each, each typechecked at the baseline (2) and run through the whole suite before it was committed, so each can be reverted alone; they ship as ONE push, because the card replaces three screens at once. **Ships with** `scripts/ship/ship-machine-menu.ps1`. **No Firestore rules, indexes, Cloud Functions, server or Mindbody change**: the push alone. The card's own page is `src/features/machine-menu/README.md`.

## What AJ asked

Tapping a machine's name on the Journey grid should open one machine menu, in an active session and on the client profile: the client's settings on that machine, the notes about them there, and a breakdown of how the client has done on it that doesn't mean scrolling two hundred sessions. His rules for the two doors: the settings are "the primary use for a trainer" in both, and the notes are "really the only difference between the two views" (they are "less likely" away from the floor). A Gemini brief came with it (a bubble chart of weight, reps and quality over time, a wrench for a set-up change, a target weight, a progress %, a mini-audit); the design scored it idea by idea against the method and the evidence (spec §E): the bubble chart became the Staircase, the target weight was dropped (no such field, and it would be the app suggesting a progression), the wrench became a sliders glyph (the wrench already means the Relay flag), the progress % became the Now Bar's one figure.

## Why it was three screens (what the research found)

- **Three frames for one job.** A session opened `equipment/MachineSheet.tsx` (680px), the profile `equipment/ClientMachineWindow.tsx` (760px) around All Machines' `MachineDetailPanel`, and All Machines showed the panel itself. The session showed the legal name and the profile the nickname; both headers leaked "· None" for a client with no gender on file; the sheet had no `DialogTitle`.
- **The session grid's name toggled instead of opening**, so a machine just closed could not be reopened with one tap, and the watching grid passed no handler at all.
- **A setting needed a reason** (`SettingsCard.tsx`): a block on a save, against "never block a save". Its buttons were 34px; the notes card's trash icon about 20px, with no confirmation.
- **Offline, a setting could lose its history and its note.** `saveSettings` awaited the settings document, then the history row, then the journal copy; offline the first never answers, so the other two were never issued, and a reload dropped them. `addMachineNote` waited on the server too.
- **Settings copies posed as notes.** Every save files a journal copy that stores exactly the kind and category of a typed Set-up note, so the notes list and its count showed them as notes, and any filter on those fields would have hidden real notes.
- **The Now Bar called the wrong number "First in Journey"**: a typed starting weight, or, in a session, the oldest of the 29 sets loaded.
- **Five progress figures and two loudness vocabularies.** "First → last" was printed four times; the old notes card had its own "High importance / Flag maintenance" checkbox; the grid's important-note mark drew `AlertCircle` in rep quality's red and didn't say how loud the note was.
- **Three journal listeners in a session**, a live listener on the setting history (`ChangeHistory`: silent on failure, no old value, cut at 12, weight rows mixed in), and a logs window capped at 30 ids with the running session among them, so the oldest drawn column had no set.
- **The profile's window opened empty** when Journey hadn't been visited yet, and the first-time words ignored the running totals (`client.machineStats`), so a machine the client had done many times could read as a first time.

## How it was chosen

The research (in `harness/machine-menu/research/` on AJ's PC: the code map, the data, the domain and method, ergonomics, machine fit, libraries, the rules, chart forms) was folded into one pack of contradictions, unknowns and hard constraints (`research/pack.md`). Four designers each drew a full menu from it (Card, Floor, Novel, Story); two judges scored them (Novel 8 and Floor 8.5 at the top) and named the ideas worth grafting; one design combined them — Floor's frame (settings first, edits in a few taps), Story's reps-by-position chart, Novel's rule that each figure is said once, Card's rules (the standard only on an empty dial) — and a critic raised 28 points against it (the offline batch, the one session draft, the settings-copy test, the prototype's load model among them). The final design (`design/spec.md`, v2) fixed them, and a working prototype on made-up data (`machine-menu.html`) showed the three charts, both doors, the tiles, the notes and the states. All of it is in `harness/machine-menu/`, which git ignores.

## AJ's answers

AJ, Oct 4 2026: **"ill take all your recommended"**.

1. **Q1 (a): the Staircase.** The weight steps across the top and the reps sit under it, placed by count, with lanes for set-up changes and notes; the newest 12 at full size, the whole loaded history as an overview line under them, and Weight by weight for the long view. The Telescope (B) and the Paper card (C) were not built.
2. **Q2 (a): the green % counts from the starting weight on file**, labelled "Starting weight 80 lb": today's Now Bar rule with the label fixed, from one module the card and the Now Bar share (`machine-menu/progress-figure.ts`).
3. **Q3 (a): Programming → Setup gets "Correct the starting weight"**, so the card stays the same in both doors apart from the notes.

Accepted with them, from the page's "decided here; say if you disagree": a fault with the machine itself becomes a floor note from the card (not a Relay flag); the tapped session shows the trainer's initials; the reason chips' words; machine fit's line (rare flags only); no height in the header; Weight by weight in both doors.

## What it is now

One card, opened from the Active Session (the grid's name, the phone's machine card, the Now Bar's flag; the watching grid read only), the client profile (the Journey grid, Routine A / B, the codex's machine links) and, inline, Programming → All Machines. Top to bottom: the header (names and Last time, at the reading distance of an iPad set down on the machine), the safety strip, the settings as big tiles (± and one Save, the reason asked and never required, Undo for ten seconds), Notes, the Staircase, the set-up guide and Setting changes, folded. In a session Notes sits under the settings; on the profile, after the chart; nothing else moves. Every encoding, every state, every read and every write is listed in the card's README.

Outside the card: the session grid's name opens it on every tap; the session holds one journal listener; the logs window reads the running session plus 29 past ones; the Now Bar's start and % come from `progress-figure.ts` ("Starting weight N lb", or nothing while the start is unknown); the grid's, the phone card's and the rail's note mark follow the one note key (plum Heads up, crimson Critical, never rep quality's red); the phone card never says "first time" for a machine a running total knows; and the Wrap-up offers a carried floor note as "Add to Westlake's notes" or Drop it.

## The commits

| Phase | Commit | What |
| --- | --- | --- |
| 1 | `9eeeb48c` | The pure timeline core: `timeline-model.ts` (absorbing `equipment/progression.ts` and `journey-grid/machine-story.ts`), `timeline-geometry.ts`, `timeline-words.ts`, `step-runs.ts`, `setting-history.ts`, `settings-copy.ts`, the pure half of `older-read.ts`; `machineUsageSentence` in `lib/history-claims.ts`; the model named a reader of `driftMultiple` and `driftMinDays` |
| 2 | `8841357a` | The rest of the pure modules: `doors.ts`, `header-words.ts`, `dial-control.ts`, `setting-draft.ts`, `note-target.ts`, `note-key.ts`, `progress-figure.ts` (121 tests) |
| 3 | `6c9d0dd1` | The writes: `saveSettings` as one batch with the journal copy and machine fit's row issued in the same tick (`reason` optional, `fileNote` for Undo), `addMachineNote` not async and filed by `storedNoteOf`, `toFloor` on the session draft, the Settings card no longer requiring a reason |
| 4 | `46555371` | The Staircase, drawn: `MachineTimeline`, `TimelineReadout`, `OverviewStrip`, `SessionList`, `WeightRuns`, `machine-menu.css` and its `look.test.ts` |
| 5 | `4b2cfc6f` | The settings and the notes, drawn: `DialTiles`, `PositionRow`, `ChangeStrip`, `FitLine`, `MenuNotes`, `SettingChanges`, `useSettingHistory`; the Wrap-up's carried floor note |
| 6 | `2c9d79fe` | The shell and the hosts: `MachineMenu`, `MachineMenuBody`, `MenuHeader`, `SafetyStrip`, `useMachineMenuData`; the tracker, the profile and All Machines wired; the old screens, their tests and their CSS retired |
| 7 | `cca3f598` | The session and grid fixes: the logs window (`logsWindowIds`), one journal listener, the Now Bar on `progress-figure.ts`, the note key on the grid, the phone and the rail, the phone card's first-time words |
| 8 | `2ef1a669` | Correct the starting weight on Programming → Setup (Q3 (a)) |
| 9 | `e8cf0d70` | The card's README, this document, `CLAUDE.md`, the stale READMEs, `KNOWN-TRAPS.md`, checklist Round 57 (numbered 55 on its branch; the colour follow-ups and type and depth took 55 and 56 first), `scripts/ship/ship-machine-menu.ps1` |
| 10 | `edd691fc` (Oct 5 2026) | The review's thirty-three confirmed findings: a read only the cache answered never counts as every session read (Load older, the profile, the tracker's window), Load older's memory per session and joined on to the window, the session's note sidebar never taking a floor draft, late refusals heard, the box and the dials held while a save waits, the draft rebased under a moving seed, one tree through a turn of the iPad, the tiles, the readout, the pill, the floor notes read again, note counts, the green % on one-side machines, the grid's spoken summary, and the small ones. The card's README, "The review fixes", lists each with its decisions |

Then "Docs: machine menu final counts", the numbers under Measured. 136 files before the docs, about 20,400 lines added and 4,100 removed (17 files deleted); 155 files with the docs and the review's fixes, about 22,700 added and 4,200 removed. The retired screens are listed, with why, in the README's "What retired".

## Where the build departed from the design, and why

Each phase's choices are in the README's phase sections. The ones that change what a reader of the design would expect:

- **The model reads the sessions and sets themselves, not the grid's rows.** The grid's row keeps one set per session and drops the settings snapshot, the write time and the skip note; every set still goes through the grid's own `toJourneySet`, so outcome, hold and quality rules match.
- **A set-up change saved mid-session is drawn once, before the session.** A set's snapshot is the saved settings at write time while its `createdAt` is Start's, so the design's "before or after by time" rule would have drawn the common case twice (KNOWN-TRAPS, the Active Session).
- **Practice-only and uncounted histories draw no chart**, only their sentence: the frames come from performed sets, so there is nothing to draw dashed chips against.
- **The readout is a fixed 128px from 600px up and grows below it** (the phone's first row wraps); the optional horizontal scrub was not built (‹ ›, the keys and the overview strip do it).
- **The thread on the card is drawn by the card, not `NoteThreadCard`**: the Notes page's actions (Archive behind ⋯) are not the card's (Add update, More, Take it off the list with Undo). The writers and the zones are the same ones.
- **In a session, choices made before the first word stay on the card** until the first keystroke, because the tracker keeps a draft only while it has words. The session's note sidebar has no floor switch, so editing a floor draft there turns it into a client note (pinned by a test).
- **The session grid's name and the watching grid open the menu in phase 6**, not 7: replacing the sheet at the same spot would otherwise have left a machine just closed unable to reopen.
- **The header is about 104px, not 76**: a 48px Close and a 28px line can't fit 76, and the design's 76 is a minimum.
- **The machine-fit row goes out with the batch**, not after it answers (offline it was never written before); it is a caught copy the rebuild script can always remake.
- **`startingWeightDate` is not rewritten by a correction**: it says when a start was first recorded, and copying the true start from a paper chart changes the number, not that day.
- **The rail's chip follows the note key too**, and the old "flagged for maintenance" orange chip with a wrench is gone: read from the one list, it would have called a Heads up about a knee "maintenance".
- **No structure change was needed anywhere.** `settingHistory` and `clientMachineSettings` already have the same rule (`isAnyAuthenticatedTrainer`), so one batch adds no refusal; `toFloor` lives in sessionStorage only.

## Data, cost and permissions

- **Read per open:** one `getDocs` of the machine's setting changes for the client (replacing a live listener); three small reads of the studio's notes on the unit (the old box, the Relay flag, the floor-notes list — the session made them already, the profile now does too); machine fit's studio index (cached and shared) and one company document per machine; the catalog listener once, at the first open. Everything else is what the door already holds, the journal included.
- **Read on a tap of Load older only:** the profile's next page, or in a session the next 30 sessions' sets (about 200 documents) with the query the session already makes. No new index.
- **Removed:** the setting history's live listener, two duplicate journal listeners in a session.
- **Written:** the same documents as before (the settings, the setting-change row, the journal, machine fit's row, the floor notes, "Right for this client"), and from Setup the starting weight. No new collection, field, index or rule. **No Mindbody call.**
- **Who sees it:** whoever can open the client's profile or run the session today; a watched session is read only; floor notes are read by everyone who works at the studio; machine fit's line shows counts, never names. Nothing reaches clients.

## What holds it (the tests)

The machine menu's folder holds **436 tests in 24 files** (391 in 23 before the review's fixes). Among them: `doors.test.ts` (the doors differ only in where Notes sits), `header-words.test.ts` (fails on her, she, gender or height in the header), `timeline-words.test.ts` (fails on Best, Started, her, she, "at the studio" in the before-Journey line, and any progression word: should, try, next weight, ready, increase to; and checks the design's sentences, 24, 34, 15 and 28 times), `step-runs.test.ts` (the design's 14 runs), `setting-history.test.ts` (a Save and its Undo net to nothing; same-day placement), `settings-copy.test.ts` (a typed "Seat 4 → 5 helps the knee" is never hidden; a failed read hides nothing), `progress-figure.test.ts` (80 → 100 is +25%; no % with the start unknown and sessions unread; never "First in Journey" for a typed start), `look.test.ts` (no raw hex, nothing under 14px, controls 44px by default, the readout fixed, nothing animated, no wrench, no `React.lazy`), `note-key-marks.test.ts`, and the render tests `MachineMenu`, `MachineTimeline` (at 712px), `DialTiles` and `MenuNotes`. Beside them: `equipment/mutations.test.ts` (one batch, the journal write issued before the batch answers, a refused copy never fails the save, Undo files no copy), `SessionNowBar.render.test.tsx`, `recent-journey.render.test.tsx`, `WorkoutTrackerView.render.test.tsx` (one journal listener), `setup-save.test.ts` (a corrected start reaches both doors' progress figure), `SetupView.render.test.tsx`, `lib/names-wrap.test.ts` (the card's name classes) and `hub-colour-rules.test.ts` (Save and Add note are the go pair).

## Measured

On the branch's final commit, in the worktree on AJ's PC, its files in LF: typecheck **2** (the baseline: `clinical-review/charts.tsx`, `trainer-profile/EditTrainerModal.tsx`); `TZ=America/New_York npx vitest run --dir src` **10,048 passing in 686 files**, none failing (master `e38d29bb`: 9,551 in 663); `npx vite build` clean (the usual large-chunk warning); the case check prints nothing. Along the way: 9,837 in 678 after phase 3, 9,882 in 680 after phase 4, 9,946 in 684 after phase 5, 9,943 in 681 after phase 6 (the retired tests went), 9,966 in 682 after phase 7, 9,989 in 683 after phase 8 and the docs, 10,048 in 686 after the review's fixes. Phases 4, 5 and 8 were looked at in light, dark and at phone width in headless Chrome from a temporary harness page (deleted). **Not yet seen on an iPad.**

## For AJ: the open items

1. **The All Machines rail still has its own progress chip.** `+N%` on each rail row is `usage.progressionPct`, from the first load performed to today's weight: a second definition beside the card's and the Now Bar's (from the starting weight on file). Point it at `progress-figure.ts`, or take the chip off?
2. **A setting's reason is still required on Programming → Setup** when a saved setting is changed (`setup-plan.ts` `needsReason`); on the card it is asked, never required. Make Setup the same?
3. **The grid's and the rail's note counts still count a settings save's journal copy** as a note: telling a copy apart needs each machine's setting changes, one read per machine on a list. The loudness is never moved by one (a copy is a plain note). Fine as it is?
4. **A corrected starting weight keeps its first date** (`startingWeightDate`). Say if the date should move with a correction.
5. **On the profile, a note's "in a session" is not a door** on the card (the profile has no session pop-up to open over the card). Wanted?
6. Cleanup, no behaviour: about twenty code comments still say "machine sheet" or "machine window"; `hasImportantMachineNote` and `addMachineNote`'s `isMaintenance` have no screen calling them now.

## Merged with type and depth (Oct 5 2026)

AJ, Oct 5 2026: "lets push this and the other change to master". The other change is **type and depth, "Refined Lift"** (`oct4/type-depth`, `10ff537a`, with the colour follow-ups under it; `docs/rounds/2026-10-04-type-and-depth.md`), built at the same time from the same master. It ships first, with its own script; this branch carries it, merged in (`git merge --no-ff oct4/type-depth`), and ships after it. Two commits: the merge (`6301592f`: the conflicts, the guards that named retired code shrinking with it, two old-voice rules of the menu's own, and the ship script following type and depth), and **Machine menu: the Refined Lift look** (the card in the round's look, the guards holding it, these docs).

**The merge, conflict by conflict.** Where type and depth had restyled what the machine menu retired (the machine sheet, `MachineStoryCard`, the grid's 22px ⋯ popover and the sheet's sections of `equipment.css`: Prescription, History, the weight steppers, Fields, the reason, Notes, the composer and the in-session sheet), the retirement won and the look went onto the menu instead. `.eq-btn` keeps type and depth's raised recipe (the blue tint's lift, the press, a disabled one flat) without `.eq-btn--hero`, which nothing draws now. The single-line cells keep type and depth's 11px floor. The test lists took both sides (names that wrap, the in-session colour pairs, the raised and tray pairs). The docs keep both rounds; this walk is **Round 57**, because the colour follow-ups took 55 and type and depth 56 first.

**The guards that named retired code** were changed to name what replaced it, never loosened (each list is exact both ways, so it shrinks with the code): `type-voice.test.ts` lost six quiet lines of the sheet's fields; `elevation.test.ts` the ⋯'s 22px exception; `session-depth.test.ts` and `session-colour-rules.test.ts` the popover's rules (`.jg-menu`, its setting names, its 32px note, its z-index). In their place the menu is held by the same guards: `buttons-depth.test.ts` (the ± and seven other buttons raised on the 3:1 edge and pressing in, four lying flat when disabled, the solid blue's glow, Save and Add note in Go's depth and the 14/700 voice and keeping their fill under a pointer), `session-sheets-type.test.ts` (the menu is a sheet a session opens: nothing under 11px, nothing in capitals, and its three fields sink inside the 3:1 edge), `type-voice.test.ts` (the machine's name and the last-time figure in the display face, upright, at 800; Settings, Notes and the chart's head in the panel-title voice, 17/700) and `wells-and-rows.test.ts` (five wells, their words at 4.5:1 in both modes).

**The Refined Lift look on the menu** (`machine-menu.css`, and the starting weight's part of `machine-fit.css`):

- **The card** is a dialog: an edge seen from outside (`--eq-edge`, the fill clipped to the padding box) and `--eq-elev-5` with the dark top light, in place of a hairline and a raw blur. Inline on Programming → All Machines it is a panel (`--eq-elev-2`). **The header is a shelf**: it casts `--eq-shelf` onto the scroller instead of ending in a hairline.
- **The type.** The machine's name is the display face, upright, 22/800, as a machine's name is on its detail panel; "100 lb × 11" in the header is a headline figure in it, 30/800 (it does not change in place, so Saira's figures serve). Settings, Notes and "How {name} has done here" speak the panel-title voice, 17/700 (they were 15/600). Open · Standing context lost their capitals (the label voice, 14/700 in ink-2). Every button speaks the button voice, 14/700 (they were 15 to 17 at 600 and 700), Save and Add note included at their 56px, as Build the Deep Dive kept its 52. The About switch is the segment voice, 14/600, the picked side 700. The readout's figure, the tile values and the plot's numbers stay in Geist: Saira has no tabular figures, and they change in place. Nothing went under the card's own 14px floor.
- **Raised buttons** (AJ's 2A): ±, Use / Change / Done / Undo, Cancel, Close, ‹ Older / Newer ›, the readout's ‹ ›, Every session / Weight by weight, Show more, Try again, Resolved, Setting changes, the positions and a word dial's options: a fill a hair lighter than the card (`--eq-raised`), the contact lift and a top light, on the 3:1 edge, a press on `:active`, flat when disabled. The solid blue (Add update, Add note while a setting is unsaved, the picked position and About side) drops its own glow; Save and Add note take Go's depth, never Go's slanted words. A text button (`.mm-link`) never lifts. Resolved and Setting changes were on the hairline; they take the firm edge (AJ's 3A).
- **Wells** (a box inside the card): each setting tile (the ± raised out of it like keys in a tray; a changed tile keeps its blue), a big jump's positions, each note, Every session's table (its lines the soft divider) and a note's confirmation. **Fields sink inside their 3:1 edge**: a typed value, a note's update, the note box (shut it is "Write a note…", the notes page's compose bar). The starting weight's field on Setup sinks too, its label is "Starting weight" at 12/700 as written (it was 10.5px capitals), its − and + are raised, and the dashed line over it is the soft divider.
- **Hovers** that change a fill are a pointer's only, in one `@media (hover: hover)` block at the end of the stylesheet (after the phone's, which `look.test.ts` reads as the first `@media`), so an iPad's kept hover never flattens a raised button.
- **Not wells, on purpose:** the chart's plot (its SVG draws folds, bands and rings in the card's own fill) and the readout (a fixed 128px slot measured to the pixel: a well's padding would make it scroll). The safety strip, the change strip and machine fit's line keep their tints.

**Measured**, in the worktree on AJ's PC, its files in LF: typecheck **2** (`charts.tsx`, `EditTrainerModal.tsx`); `TZ=America/New_York npx vitest run --dir src` **11,617 passing in 700 files** (11,569 at the merge commit; type and depth alone 11,080 in 677, the menu alone 10,048 in 686); `npx vite build` clean, no CSS-optimiser warning; the case check prints nothing; no file with Windows line ends.

**Not seen on an iPad.** Round 57 gains a line for the look; Round 56's machine-sheet lines now point at the menu.

## The iPad walk (checklist Round 57)

On an iPad, upright at 820 and on a 13-inch at 1024, then on its side, in light and dark, and on a phone: open a machine from the session grid, the phone card and the Now Bar's flag, and from the profile's Journey grid, Routine A / B and All Machines; change a setting in two taps and Undo it; save one offline and watch it say "saved on this iPad"; close with a change unsaved and get the leave question; write a note about the client and one about the machine itself; tap a session on the Staircase, page with ‹ ›, Load older; open a watched session's card (read only); correct a starting weight on Setup and see the % follow on the card and the Now Bar. `docs/ops/TESTING-CHECKLIST.md` Round 57 is the list (Round 56, type and depth's, first).

## How to ship

From the worktree folder (`.claude\worktrees\machine-menu`, already on the branch):

```
powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-machine-menu.ps1 -Stage prepare
powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-machine-menu.ps1 -Stage golive
```

**Type and depth goes live first** (`ship-type-depth.ps1` from `.claude\worktrees\type-depth`); this script stops until master holds `10ff537a`. `prepare` changes nothing: the branch, a clean tree, that master holds type and depth, that it fast-forwards master, that the rules, indexes, functions, server, `index.html` and `public\` are unchanged (this round has **no rules or index deploy**), the line ends (no CRLF file in the tree), the case check, the typecheck count (2), the suite in Eastern time and the build. `golive` asks for GO, tags master as `restore/2026-10-04-before-machine-menu`, and pushes the branch to master as a fast-forward. **Every push to master deploys.** Then walk Round 57.
