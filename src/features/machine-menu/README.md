# features/machine-menu — one card for a client on one machine

Tapping a machine's name on the Journey grid — in an active session and on the client profile — opens ONE card for that client on that machine: safety first, then the settings (the primary use, in both doors), then notes, then a picture of how the client has done there (the Staircase), then the set-up guide and the setting changes, folded. It replaced three screens that did the same job three ways: the session's machine sheet, the profile's machine window, and the All Machines detail pane. **Nothing on the card ever tells the trainer what to do next**: it is a guide for set-up and a log for outcomes (`docs/business/the-floor.md`).

The round is `docs/rounds/2026-10-04-machine-menu.md`. The design, its research and the prototype are in `harness/machine-menu/` on AJ's PC (`design/spec.md`, `research/pack.md`, `machine-menu.html`), which git ignores. Read this page before changing anything on the card; the "how it was built" sections at the end record each decision made where the design met the code.

## AJ's decisions (Oct 4 2026)

To the design page's three questions and the decisions it listed, AJ answered: **"ill take all your recommended"**.

- **Q1 (a): the Staircase chart, and only it.** The weight as a step line across the top, the rep counts printed under it in the grid's own boxes (gold star, red kaizen ring), and two thin lanes for set-up changes and notes, so "moved the back pad, went up 2 lb, reps dropped back and climbed again" reads at a glance. The Telescope (B: every older session squeezed into a strip at the left) and the Paper card (C: a box per session) were drawn for the page and **not built**.
- **Q2 (a): the green % counts from the starting weight on file**, labelled **"Starting weight 80 lb"** — the Now Bar's rule since AJ asked for it on Oct 3, with the label fixed (it said "First in Journey" for a typed start). ONE module, `progress-figure.ts`, gives the figure to the card and to the Now Bar (`journey-grid/SessionNowBar.tsx` imports it), so the two can never disagree. With no start on file it counts from the first counted set, and only once every session has been read; otherwise there is no %. It is shown only when the weight is up.
- **Q3 (a): Programming → Setup gains "Correct the starting weight"** (`machine-fit/ui/StartingWeight.tsx`). The Prescription card was the only screen that could change a start already on file, and it retired with the machine window; the menu stays the same in both doors apart from the notes.
- **Also accepted from the page** (AJ: "say if you disagree"; he didn't):
  - a fault with the machine itself becomes a **floor note** from the card (`addFloorNote`, on the studio's notes for the unit), never a Relay flag — the card rings no bell;
  - a tapped session shows the **trainer's initials**, as the grid's column heads already do — never coloured, ranked or sorted;
  - the **reason chips' words**: Comfort or fit · Range of motion · Alignment · Pain or discomfort · Matches the guide · Other… (`REASON_CHIPS` in `setting-draft.ts` — rename them there);
  - **machine fit's line**, shown only for a rare flag at the studio tier, with Right for this client;
  - **no height in the header** (nor gender, nor age);
  - **Weight by weight** in both doors.

## The doors rule

AJ, in the brief: the settings are "the primary use for a trainer", in both places, and where the notes sit is "really the only difference between the two views" (notes are "less likely" away from the floor).

- **Safety first and the settings next, in both doors. The Notes block is the ONLY layout difference**: right under the settings in a session, where a trainer writes between sets; after the chart on the profile, where the chart is what someone came to read. Everything above Notes is the same block at the same height in both doors, so a trainer's hand learns one card.
- **Landscape** (from 1000px wide; a phone is always one column): the safety strip runs full width, then two columns in one scroller — a 400px leading column with the settings, then Notes, the guide and Setting changes in a session (the guide, Setting changes, then Notes on the profile), and the chart in the trailing column in both doors.
- `doors.ts` `blockOrder(door, layout, state)` is the one answer, and `doors.test.ts` takes Notes out of both doors and fails if the two orders are then not identical, in every layout and state. `MachineMenu.render.test.tsx` mounts both doors and checks the same on screen.
- **Five things differ behind the scenes, and none of them changes what the screen shows:**
  1. **What a note carries.** In a session: the session link (id, number, day), origin `in_session`, and `sessionNoteStudioId`. On the profile: origin `profile` and the active studio.
  2. **Where an unsent note lives.** In a session it is the session's ONE note draft, which the tracker owns (`noteDraft` / `onNoteDraftChange`; the card writes nothing to storage), so the Wrap-up, the new-version check and the session's note sidebar all see it. On the profile it is the card's own draft, registered with `useUnsavedChanges`.
  3. **What Load older reads.** The button and its words are the same. On the profile: the profile's next page (50 sessions, the grid's own read). In a session: the sets of the next 30 older sessions by `sessionId` (`older-read.ts`, the tracker's window query run again for older ids — no new index), kept for the rest of the session in a per-client memory forgotten at sign-out.
  4. **Where "The machine itself" is filed.** The session's studio in a session; the active studio on the profile, because that is where the unit is.
  5. **Watching another trainer's session** makes the whole card read only (values, no buttons). Only a session can be watched.

## The doors themselves

| Door | Opened by | Host |
| --- | --- | --- |
| The Active Session | the grid's machine name (`onOpenMachine`, so a second tap reopens), the phone's machine card, the Now Bar's flag; the watching grid opens it read only | `components/WorkoutTrackerView.tsx` (`machineMenuHost`) |
| The client profile | the Journey grid, Routine A / B rows, the codex's machine links | `components/ClientProfileView.tsx` (`machineMenuHost`) |
| Programming → All Machines | the rail; the right pane IS the card's body, inline (`MachineMenuBody inline`), in a leave scope | `equipment/EquipmentTab.tsx` (`menuHost`) |

`MachineMenuHost` (`useMachineMenuData.ts`) is the contract a door hands the card. `MachineMenu.tsx` is the frame (a Base UI Dialog titled with the machine and client names; Close, Escape and a backdrop tap go through a leave scope), keyed `${clientId}_${machineId}` so a draft never follows to the next machine; nothing mounts before the first open, and it is imported statically (no `React.lazy`), so a deploy can't strand it mid-session.

## The card, top to bottom

1. **The header** (sticky, at least 76px, grows when a name wraps): the unit's floor name and `clientDisplayName` (the same in both doors), Close ("Close Leg Press", 48×48), the safety pill while the strip is scrolled away ("1 thing to know first"), and **Last time** — the newest record before today, at 28px, the reading distance of an iPad set down on the machine (`header-words.ts`). Never "First time" while a read is out or for a machine a running total knows.
2. **The safety strip**, only when there is something: the open Critical notes on this machine, the clinical watch-outs (compact), the Relay flag and the studio's open floor notes on the unit (`safety.ts`, `SafetyStrip.tsx`). "Critical notes couldn't be checked" when the journal failed — an empty strip never stands in for "nothing to know".
3. **The settings** (`DialTiles.tsx`): a tile per dial, [−] 5 [+] with 56px buttons and a 36px value; "Not set" with Use and "Studio standard N" on an empty dial only (never ± there); "Same for every client" on a fixed dial. A change turns the tile blue with "was 4" and opens the change strip: "Seat 4 → 5", the reason chips (asked, **never required**), Cancel and Save. Saved, saved on this iPad, or couldn't save (the change kept), with Undo for 10 seconds. "Last changed Aug 18 · Back pad 3 → 2 ›" selects that change on the chart. How a dial steps is `dial-control.ts` (rules 1–5; nothing invented).
4. **Notes** (`MenuNotes.tsx`): one box (About [client | The machine itself], Filed as with Change, the one Loudness control, Cancel and Add note), then the newest open note, All notes grouped Open · Standing context · Resolved, and a note's thread in place (Add update, More). Settings copies are not notes (`settings-copy.ts`).
5. **How the client has done here** — the Staircase (below).
6. **The set-up guide**, folded; its set-up part opens above the tiles by itself only the first time (nothing recorded in what was read, no settings saved).
7. **Setting changes**, folded (`SettingChanges.tsx`): every settings change and every starting-weight change, newest first, old → new · reason · who · day. Today's weight is set on the Now Bar and the next session's at the Wrap-up; those aren't listed.

## The Staircase: what each mark means

One pure model (`timeline-model.ts`) drives the block in both doors; `timeline-geometry.ts` lays it out; `timeline-words.ts` says every sentence; `MachineTimeline.tsx` draws it in plain React SVG (no chart library). Nothing in it is under 14px.

| Layer | Encoding |
| --- | --- |
| Columns | One evenly spaced 52px column per session with a record on this machine (performed, practice, skipped, not reached), newest on the right; a session where the machine wasn't done gets none. Fewer than fit: right-aligned, so the newest is always in the same place. Calendar time only in the overview strip |
| Fold | A long gap folds into a 36px zigzag column, broken line, "7 wk" in the date row: at least the studio's Drifting line (`driftMultiple` × this machine's median gap, never under `driftMinDays`; `useStudioSettings`). "7 weeks away" only through `canClaimGap` and with no visit in between; "7 weeks · 5 visits without Leg Press" when the client came in; else plain dates. Never Drifting or Lapsed words |
| Weight (112px; 104 in landscape) | A step-after line of the heaviest **performed** load, a dot each performed column, a square for a timed hold; dashed across a column that counted nothing; broken at folds, not at a set-up change. Framed lightest to heaviest in view, never spanning less than max(8 lb, 15% of the heaviest), so a 2 lb step never looks like a cliff. The load printed (20px) where it changes. No axis numbers |
| Practice / blood flow | A hollow ring off the line ("70↓" pinned when lighter than the frame), a P or BF chip; never counted |
| Two sides | Two dots joined by a bar, L and R; the line follows the heavier side; never averaged |
| Reps (104px; 96) | The count printed AS the mark in the grid's own box (22px digits): plain, max strength (green, the gold star) or needs improvement (hatched, the kaizen ring), `QualityMark` on the `--jg-q-*` fills. Framed fewest to most in view, never spanning less than 4 reps. A hairline joins the counts within one load and one set-up stretch (the climb and the reset). Never a target band, never a colour by count |
| Hold row (36px) | Seconds ("1:30") get their own row whenever the loaded history mixes holds with rep sets, so paging never shifts the layout. Never on the reps scale, no time-under-tension figure |
| Set-up lane (28px) | A boundary only where two non-empty snapshots differ or the setting-history rows between two columns still change something once netted (a Save and its Undo draw nothing; an empty `{}` snapshot is "not recorded" and never a boundary): `SlidersHorizontal` (never the wrench), the change where it fits, a dashed rule; alternate stretches shaded. Another studio's column is hatched and never compared |
| Notes & skips lane (40px) | The client's machine notes (thread roots, settings copies left out) at their session in the one note key; a skip is ⊘ with its reason word, **never red, pain included**; two in a column draw the loudest with a count. Floor notes never appear here |
| Dates (28px) | "Sep 17"; today's column (drawn only when today's session holds a begun log) reads "Today" in the hero orange |
| Start wall | Only when every Journey session has been read: "First in Journey" (or the complete-coverage word) |
| Before Journey | A client-level line under the chart while coverage isn't complete, in Account's own words ("About 302 sessions before Journey (from Mindbody, not yet confirmed). No machine detail for those."); never "at the studio" (the Mindbody count is per site) |
| Readout (128px, fixed) | Above the plot, so it never moves under a finger. Idle: the count of **performed** sessions in the columns read (never a running total; `machineUsageSentence` in `lib/history-claims.ts`) with "Starting weight 80 lb, +25%", how to use the chart, the key of the marks in view. A tapped session: day · trainer initials · place in the order, its set at 32px, the settings as saved, one event, Open note, ‹ › ✕ |

**Touch.** A whole 52px column is a tap target; the selection stays after the finger lifts; ‹ › (and the arrow keys, Home, End) step one session and cross pages by themselves; ‹ Older / Newer › page by capacity less one; the overview strip (only when the loaded columns don't fit) takes a tap or a drag of its box. No pinch, no double-tap, no hover, and nothing animates. **Every session** (a table, 20 rows at a time) and **Weight by weight** (one line per run at one load, `step-runs.ts` — about 65 lines for 200 sessions, counts only) are the screen-reader view and the exact numbers.

## Every state

| State | What shows |
| --- | --- |
| Loading (the profile opened before Journey was) | The card asks the host for the first page (`ensureHistory`) and says "Loading Avery's sessions on Leg Press…". Never the first-time words |
| The read failed | "Couldn't load Avery's sessions on Leg Press" with Try again, no chart; the header says "Last time: couldn't load" |
| Only this iPad's cache answered | Drawn from what was read, plus "From what this iPad has saved; couldn't check for newer." |
| Setting changes couldn't be read | Bands still drawn from the snapshots, reasons "reason couldn't be loaded", "Changes couldn't be loaded" in the heading row; settings copies show as notes rather than hide |
| The journal couldn't be read | "Notes couldn't be loaded" under the plot; "Critical notes couldn't be checked" in the safety strip |
| Nothing in what was read | No chart; the header's `noMachineHistoryLine` ("in the sessions loaded here" while older sessions are unread); the guide opens above the tiles; Load older when more can exist |
| A running total knows it, nothing loaded | "Done here in Journey before · not in the sessions loaded here" with Load them; no count, no first-time words |
| One session | No chart: "Once in the sessions loaded here (…). The chart starts at the second time." |
| Practice only | "Practised here 3 times in the sessions loaded here; no counted set yet." |
| More than fit | The newest page, ‹ Older / Newer ›, the overview strip, Load older, both lists |
| Save then Undo | Nothing drawn; "Last changed" skips both rows; Setting changes lists both |
| Watched session | The same card, read only |

## What it reads each time it opens

Everything is Journey's own coaching data; **no Mindbody call**, no new collection, index or rule.

- **What the door already holds**, handed down, never read again: the sessions and their sets, the client's machine settings (the host's live listener), the client's journal (the host's ONE listener — a session used to hold three), the client record's running totals and prior history, the studio's settings.
- **One `getDocs` of the machine's setting changes** for this client (`machines/{id}/settingHistory`, `useSettingHistory.ts`), shared by the chart, "Last changed", Setting changes and the settings-copy filter. It **replaces** a live listener.
- **Three small reads of the studio's notes on the unit** (`useFloorNote` in `equipment/FloorNoteCard.tsx`): the old notes box, the Relay care flag and the floor-notes list. The session sheet made them; the profile now makes them too.
- **Machine fit**: the studio's index (cached ten minutes and shared) and one company document per machine (`useFitData`, with the studio roster the host holds). `machineTrends/{id}` for the height-band line only when someone opens an empty dial's editor, as before.
- **The catalog**: one listener, opened at the first open and kept (the frame stays mounted).
- **Only on a tap of Load older**: on the profile, the profile's next page; in a session, the next 30 sessions' sets (about 200 documents) with the query the session already makes.

## What it writes

The same documents as before — `docs/business/data-and-metrics.md`'s rule that every field has a reader holds. **Nothing a trainer saves at a machine waits on the server**: every write is issued before anything is awaited, and the floor waits only through `settleOrQueue` (`session-record/finish-wait.ts`).

- **A setting change** (`equipment/mutations.ts` `saveSettings`): the settings document and its `settingHistory` row in ONE `writeBatch`; the journal copy and machine fit's row issued in the same tick, each caught. The reason is optional. **Undo** writes back through the same path with reason "Undone" and `fileNote: false` (no second journal copy).
- **A note about the client** (`addMachineNote`): one journal entry with the machine, filed by `storedNoteOf`, at the loudness chosen, with the session link in a session.
- **A note about the machine itself** (`floor-notes/store.ts` `addFloorNote`): the studio's floor notes. Carried to the Wrap-up in a session (`toFloor` on the session draft, sessionStorage only) as "Add to Westlake's notes" or Drop it.
- **A thread**: updates, Close it / Reopen (`client-notes/thread-write.ts`), No need to remind me (`dismissThread`), Take it off the list (archive, with Undo).
- **Right for this client**: machine fit's `acknowledgeFlag`.
- **A corrected starting weight** (Setup, Q3 (a)): `startingWeight` and one WEIGHT history row in Setup's one batch.

## What retired, and why

| Retired | Why |
| --- | --- |
| `equipment/MachineSheet.tsx` (session), `equipment/ClientMachineWindow.tsx` (profile), `equipment/MachineDetailPanel.tsx` (All Machines) | Three frames for one job (680px, 760px and a pane), with different names (the legal name in a session, the nickname on the profile), a "· None" gender leak in both headers, and no `DialogTitle` on the sheet. One card now, in every door |
| `equipment/SettingsCard.tsx` | It refused a save without a reason (the rule is "never block a save"), its buttons were 34px, and `saveSettings` awaited three writes one after another, so offline the second and third never started. Now `DialTiles` |
| `equipment/MachineNotes.tsx`, `deleteMachineNote` | A second loudness vocabulary (the "High importance / Flag maintenance" checkbox), a 20px trash icon with no confirmation, and a write that waited on the server. Now `MenuNotes`, the one Loudness, archive with Undo |
| `equipment/ChangeHistory.tsx` | A live listener, silent when it failed, never showed the old value, stopped at 12 and mixed in weight rows. Now `SettingChanges` over one read |
| `equipment/PrescriptionCard.tsx`, `saveWeights` | Q3 (a): a starting weight is corrected on Setup; today's weight is set on the Now Bar and the next session's at the Wrap-up |
| `equipment/MachineUsageCard.tsx` | "Started / Best / Lowest" ranked a set, and its time-under-tension "average" was over one set |
| `equipment/LoadProgressionCard.tsx` + `progression.ts`, `journey-grid/MachineStoryCard.tsx` + `machine-story.ts` | "First → last" said four times in four places, five progress figures, a recharts line and Tailwind slate instead of tokens. The Staircase's model absorbed both modules (`MIN_PROGRESSION_POINTS`, `lastCounted`, `loadRange`); the Now Bar's figure is the only one |
| The grid's 22px "⋯" popover | Under the 40px floor, and it was a second door to the same settings |

## How it was built, phase by phase

One commit per phase on `oct4/machine-menu` (the round document lists the commits). Each section records the files of that phase and the decisions made where the design met the code.

### Phase 1 — the pure core (no React)

| File | What it answers |
| --- | --- |
| `timeline-model.ts` | The Staircase's one model: one column per session read that has a record on the machine (performed, practice, skipped, not reached), oldest first; the line's weight (heaviest performed), holds, both sides, practice and blood flow, skip reasons, the trainer, the studio, the machine's place in the session; folds (the studio's Drifting line over this machine's median gap; `canClaimGap`; visits inside the gap); set-up boundaries and stretches; the notes' lane; counts from the columns read only; the start wall. Absorbs `equipment/progression.ts` (`MIN_PROGRESSION_POINTS = 2` lives here now) and `journey-grid/machine-story.ts` (`lastCounted`, `loadRange`); both old files stayed until the phase that retired their screens (phase 6). Named as a reader of `driftMultiple` and `driftMinDays` in `studio-settings/registry.ts` |
| `timeline-geometry.ts` | 52px columns, capacity, the window and paging (‹ Older / Newer › keep one column), right-aligned slots, the weight frame (min span max(8 lb, 15% of the heaviest)), the reps frame (min span 4), the step line (dashed carry, broken at folds, not at set-up changes), weight labels, chips, the climb-and-reset hairline, lane merging at 44px, whole-column hit bands, the overview strip. No DOM |
| `timeline-words.ts` | Every sentence: the count (`machineUsageSentence`, new in `lib/history-claims.ts`), the block's states, the key, the readout's rows (the one-line clip never cuts a name), fold words, Every session's rows, Weight by weight's lines, the before-Journey line (client-level; never "at the studio"), the SVG's title and description |
| `step-runs.ts` | Weight by weight: runs of counted sessions at one load, broken at a weight change, a fold or a set-up change, with practice and skips noted and never counted |
| `setting-history.ts` | Parses `machines/{id}/settingHistory` rows (settings, first set-up, and a WEIGHT row only when it moves the STARTING weight); nets a run of rows (a Save and its Undo draw nothing); pairs a Save with its Undo; "Last changed"; places a row among the columns, a same-day row by the set's own write time |
| `settings-copy.ts` | Tells `saveSettings`' journal copy from a note a trainer typed — they store the same kind and category — by an EXACT rebuild of the body plus `occurredAt` within 2 minutes of the row. When the history wasn't read, nothing is hidden |
| `older-read.ts` | Load older in a session: the next 30 sessions whose sets weren't read (the tracker's own `sessionId in` query, injected), joining sets to their sessions' days (placeholders of an unfinished session dropped), and a per-client memory forgotten at sign-out |
| `fixtures.ts` | Test-only: the design round's made-up client and Leg Press series, so the tests check the numbers the design page promised |

#### Decisions made in phase 1 where the spec met the code

- **The model reads sets, not the grid's rows.** `JourneyRow.sets` holds one set per session (Left wins) and drops the settings snapshot, the write time and the skip note, all of which the Staircase needs; so the model takes the sessions and sets themselves and runs each set through the grid's own `toJourneySet`, keeping the grid's outcome, hold and quality rules. Quality is read off the set (`repQuality` 3 or 1), never the adapter's filled-in 2.
- **A set-up change is drawn once.** The tracker re-saves a set's settings snapshot with every write, while the set's `createdAt` is when Start seeded it. So a change saved mid-session, after Start, reads "after" the session by its time while that session's own snapshot already shows the new values. When a column's snapshot already holds what the rows after it changed to, the change is drawn before that column, once, with the rows' reason. Otherwise the spec's rule stands: a same-day row goes before or after the session by the set's write time, and when the set was entered on another day the readout says "Set-up changed on the day of this session".
- **Sessions at another studio are left out of the set-up comparison entirely** (their snapshot belongs to that studio's unit), and a stretch runs across them.
- **A legacy note flagged for maintenance** (the old `machineNotes` list, read only for notes with no journal copy) is placed as Critical, the loudness `addMachineNote` gave its journal copy.

### Phase 2 — the rest of the pure modules

| File | What it answers |
| --- | --- |
| `doors.ts` | `blockOrder(door, layout, state)`: the blocks in order for each door — Safety first in both, the settings next in both, and Notes the ONLY thing that moves (right under the settings in a session; after the chart on the profile, which in landscape is the foot of the leading column). Also the frame's sizes: `menuLayoutFor` (a phone is always one column; two columns from 1000px landscape), `dialogWidthFor`, `columnWidthsFor` (400px leading column, 24px gap). The test fails if the doors ever differ in anything else |
| `header-words.ts` | Line 1's names (`headerNames`: the floor name and `clientDisplayName`, nothing else the record holds), Close's label, the safety pill. Line 2's "Last time" in every case: performed with its mark, a hold, one side at a time, another studio, a newest record that wasn't counted ("skipped (pain) · … · last counted …"), a newest record not in the sessions loaded (Finish's `currentMachineMetrics`, else `machineStats`' day and load, "not in the sessions loaded here"), nothing ("First time" only through `noMachineHistoryLine`, only with every session read, never for a machine a running total knows), loading, couldn't load, and the watched suffix. `knownElsewhere` is the one "a running total knows it" rule (evidence only, never a count; an entry dated today is today's session) |
| `dial-control.ts` | How a dial is offered, the first of rules 1–5 that fits: the field's options (8 or fewer), its min/max/step, the studio's values once machine fit has answered, the current value and the client's record (whole numbers by 1, halves by 0.5, letters A → B), else a text field with chips. Bounds (the field's own, else ≥ 0 or A–Z), the position row (12 or fewer), `stepDial` / `canStep`, and where the values come from (`studioValuesFor` over `useFitData`'s studio rows, `recordValuesFor` over the sets' snapshots and the history's rows). Built on `machine-fit/ui/field-values.ts` |
| `setting-draft.ts` | The draft before and after Save: the seed (a fixed dial — `absoluteValueFor`, today the gap — filled when nothing is saved; nothing else), dirty measured against the seed (opening is never dirty), what a save writes (draft against saved), the tile's state ("was 4"), "Seat 4 → 5 · Back pad 3 → 2" and "Seat — → 4", the Save labels, `REASON_CHIPS` (rename them here), the outcome words, Undo's payload (reason "Undone", `fileNote: false`, the whole map kept so a key the fields don't show survives) |
| `note-target.ts` | A note about the client or about the machine itself: the default filing (Coaching & equipment · Set-up) through `storedNoteOf`, the starting loudness from `DEFAULT_IMPORTANCE` (a loudness picked by hand sticks), the filing chips, the session draft's machine, "about the machine" and `toFloor` (read defensively), "Make it about {machine}", the client and floor writes, the Health note after a pain save, and every word the note box says |
| `note-key.ts` | The one note key: Note = `NotebookPen` in `--eq-ink-2`, Heads up = `AlertCircle` in `--eq-warn`, Critical = `AlertTriangle` in `--eq-alert`, Resolved = its glyph in `--eq-ink-muted` and "Resolved" in a list; colours from `LOUDNESS_TONE`. `loudestOpen` for one mark that stands for several notes |
| `progress-figure.ts` | AJ's Q2 (a): the % counts from the starting weight on file, labelled "Starting weight N lb", to the newest counted load; with none on file, from the first counted set only once every session has been read (labelled with the history words, never "First in Journey" for a typed start); else no %. Shown only when up. `progressFromModel` (the card) and `progressFromSets` (the Now Bar, wired in phase 7) |

#### Decisions made in phase 2 where the spec met the code

- **More than 8 options are stepped through, in their order**, rather than falling to rules 2–5 (which could step to a value the field doesn't offer). The live catalog has no options today.
- **Rules 3 and 4 fill the positions between the lowest and highest value seen** (at the rule's step), so a gap in what clients happen to use (3, 5, 7) never hides a hole the stepper can reach. ± can still step past them, to the bounds.
- **A fixed dial is seeded whenever nothing is saved for it**, on a set-up machine too (today's Settings card rule); a save then carries it, and the change strip says so ("Gap — → 0"). Dirty stays measured against the seed.
- **The Health filing asks where on the body, and so does Incident**: the notes catalog's one rule (`asksBodyPart`), not the design's Health-only line.
- **The header's loading line is "Last time: loading…"** (the design gives none); a running total is not used while the first read is out, so nothing flips from "not loaded" to "loaded" for no reason.
- **The Health note after a pain save never replaces words already in the box** (`healthNoteAfterPain` returns null and the box opens as it is): one draft per session.
- **`toFloor` lived on the menu's own draft type in phase 2** (`MenuNoteDraft`); since phase 3 it is on `SessionNoteDraft`, and `MenuNoteDraft` is the same type.

### Phase 3 — the writes

No new collection, Firestore field, index or rule: the same documents as before, written so the floor never waits on the server and nothing is lost offline (KNOWN-TRAPS, "Never await the database's answer on the floor").

| File | What changed |
| --- | --- |
| `equipment/mutations.ts` `saveSettings` | ONE `writeBatch` holds the settings document and its `settingHistory` row (the history ref made up front, as `machine-fit/setup-save.ts` does). The journal copy is issued in the same tick, never awaited before the batch, caught, and its `occurredAt` is the very moment the history row's `timestamp` holds (so `settings-copy.ts` pairs them). The machine-fit row is issued beside them, caught, as before. The promise is the batch's answer: the floor wraps it in `settleOrQueue`. `reason` is optional (the default "Settings update" / "Initial setup" as before); `fileNote: false` (Undo) files no second journal copy. The result also carries the `settings` and `sources` maps as written |
| `equipment/mutations.ts` `addMachineNote` | Takes the filing (`storedNoteOf`'s kind, category and body parts) and the loudness. Not async: the write is issued at once and the promise handed back is the database's answer, for `settleOrQueue`. Without a filing or loudness it files as it always did (Set-up; Critical only with the old checkbox) |
| `client-notes/session-draft.ts` | `toFloor?: boolean` on `SessionNoteDraft` (sessionStorage only). `currentDraftOf` keeps it only when it is exactly `true`; anything else is a note about the client. `MenuNoteDraft` is now the same type |
| `equipment/SettingsCard.tsx` | No longer refuses a save without a reason (it was `:172-173`): "Reason for change (optional)". The card retires with phase 6 |

#### Decisions made in phase 3 where the spec met the code

- **The machine-fit row is issued with the batch, not after it answers.** Before, it went only once the settings document had landed, which offline meant never. It is a copy the rebuild script can always remake, and it is caught, so it goes beside the other writes, before anything is awaited.
- **`addMachineNote` hands back a promise rather than a note.** The journal entry's id is only known once the database answers, and the note heads the list at once anyway (the client's journal stream shows the iPad's own write). So the floor waits on the answer through `settleOrQueue` and clears the words unless it says "failed".
- **The old "maintenance:" words are written only by the old checkbox** (the machine sheet's notes, which retired in phase 6; no screen passes the checkbox now). A loudness from the Loudness control writes none.

### Phase 4 — the Staircase, drawn

| File | What it draws |
| --- | --- |
| `MachineTimeline.tsx` | The block "How Avery has done here": the readout, the plot, ‹ Older · the overview strip · Newer ›, the before-Journey line and the two list buttons, in every state (loading, couldn't load with Try again, cache-only's one line, nothing, a running total knows it with Load them, practice only, uncounted, one session, the chart). The plot is plain React SVG over the pure core: the weight as a step-after line (dots, a square for a hold, dashed across a column that counted nothing, broken at a fold), the rep counts printed as the grid's own marks (`QualityMark`'s star and kaizen ring on the `--jg-q-*` fills) with the climb-and-reset hairline, the hold row, the set-up lane (bands, `SlidersHorizontal` and a dashed rule at a change, never the wrench), the notes & skips lane (the note key, ⊘ and its reason, never red; two in a column draw the loudest with a count), the date row (today in the hero orange), folds and the start wall. Whole-column targets (52px × the plot) carry `data-col` (the session id), `data-outcome` and `data-quality`; the selection stays after the finger lifts; ‹ ›, the arrow keys, Home and End step and cross a page by themselves. A `width` prop, else a feature-detected `ResizeObserver`, else 640. No animation, no library |
| `TimelineReadout.tsx` | The fixed 128px slot above the plot (`aria-live="polite"`): idle, the count with the Now Bar's "Starting weight 80 lb, +25%" (the % in `--jg-pf-gain`), how to use the chart and a key of the marks in view; a session tapped, its day · initials · place in the order, its set at 32px with the mark in words, the settings as saved and one event, with Open note and ‹ › ✕ |
| `OverviewStrip.tsx` | Only when the loaded columns exceed capacity: calendar time from the oldest loaded column to today, the performed loads as a thin step line broken at folds, a tick a session, the window's box. A tap moves the window there and selects the nearest session; a drag moves the box (pointer capture; only the box is `touch-action: none`) |
| `SessionList.tsx` | Every session: a table, newest first, twenty rows at a time (48px rows), `sessionRow`'s words; the session-number column only when a number can be quoted |
| `WeightRuns.tsx` | Weight by weight: `runLines(stepRuns(model))`, the load drawn larger, folds and set-up changes as divider lines, "Counts only" under it |
| `machine-menu.css` | The `.mm-` stylesheet, importing `equipment.tokens.css` and `journey-grid.tokens.css`, tokens only; every component that draws with it imports it (the session chunk and the profile chunk both mount the card) |
| `look.test.ts` | Holds it: no raw hex, no words in the faint ink, nothing under 14px, controls at least 40px and 44px by default, the readout a fixed 128px (growing only under 600px), the plot `pan-y` with no callout or selection, only the overview's box `touch-action: none`, the chart never animated, each component importing the stylesheet, no wrench, no `React.lazy`. `lib/names-wrap.test.ts` holds the `.mm-` classes that carry a name |

`MachineTimeline.render.test.tsx` mounts it at `width={712}` on the design's made-up client.

#### Decisions made in phase 4 where the spec met the code

- **Practice only and uncounted draw no chart**, only their sentence (and Load older, and the before-Journey line). The geometry frames the panels from performed sets alone, so a history with none has no frame to draw dashed chips against; the lists show only with a chart.
- **A hold goes in the hold row whenever there is one** (the loaded history mixes holds and reps). The reps track is titled "hold" and framed by seconds (never under a 10-second span) only when the loaded history holds nothing but holds.
- **The readout is a fixed 128px from 600px up**, laid out 44 + 40 + 20 + 20 + 4; its rows never shrink, and the slot scrolls in the rare case a long settings line needs a third line, so the plot still never moves. Under 600px it grows (the spec's phone note: its first row wraps there). The event line's length comes from the width (one character per 8px), and a cut now falls at the end of a word where one is near (`clipQuoted`).
- **"Notes couldn't be loaded" is a line under the plot**, not words inside the 40px lane, where they would run under the skip marks.
- **A band's label is the longest that fits**: the full labels, then each label's first word ("Back 3"), then only the dials that differ between the stretches in view; it goes in the first piece of the band a fold or a cell doesn't cover. An other-studio column's cell is hatched with a rule each side and no words (the studio's name never fits 52px at 14px); the readout says "at Solon".
- **A lane glyph selects its column through the column's own target**; the readout then says the column's first event in the words' order (a set-up change before a note), not necessarily the glyph tapped.
- **The optional horizontal scrub is not built**; ‹ ›, the keys and the overview strip do the same.
- **Load older's failure** makes the button read "Try again" with "Couldn't load older sessions" under the row; offline keeps "Load older" with "Can't load older sessions offline". Which reader runs is the door's (`older`, wired in phase 6).
- **The heading, the button words, the paging words, the wall's two lines, the overview's label and the table's heads live in `timeline-words.ts`** with the rest, and its guard scans them. "Try again" is a button, not advice, so it stays out of the guard's "try".

### Phase 5 — the settings and the notes, drawn

Nothing is wired into a screen yet (phase 6 builds the shell, the body and the three hosts); these are the blocks the body will place.

| File | What it draws |
| --- | --- |
| `DialTiles.tsx` | The Settings block: the heading with "Last changed Aug 18 · Back pad 3 → 2 ›" (a button that hands the row to the host to select on the chart), "No settings saved yet" or "Changes couldn't be loaded" (a cache-only read that finds nothing says so too), nothing while the read is out. A tile per dial, three to a row (one on a phone): [−] 5 [+] with 56px buttons and the value at 36px; a word at 24px with Change; an empty dial "Not set" with Use 6 and "Studio standard 6" and no ±; a fixed dial "Same for every client"; a changed tile blue with "was 4". Tapping the number (or "Not set", or Change) opens one editor at a time under the tiles. The change strip opens only while dirty; Save goes through `saveSettings` inside `settleOrQueue`; the strip then says what became of it, with Undo for ten seconds (`undoPayload`: reason "Undone", `fileNote: false`) and, after a save for pain or discomfort, Add a Health note. The draft joins the unsaved-changes registry in both doors ("Leg Press settings for Avery"). A watched session gets values only |
| `PositionRow.tsx` | `PositionRow` (48×48 positions or the field's own options, the saved one ringed with "now", the picked one filled blue, "Studio standard: 6" under the row) and `ValueEditor` (a 52px field, value selected, the keypad the dial asks for, a word dial's chips filling it only when tapped) |
| `ChangeStrip.tsx` | `ChangeStrip` ("Seat 4 → 5", "Why? (optional)", the six reason chips, Other… opening a field, Cancel and Save Seat 5 in `--eq-go` / `--eq-go-on`; a refused save keeps the change and Save reads Try again) and `ChangeResult` (the outcome words with Undo, Try again after a refused Undo, Add a Health note) |
| `FitLine.tsx` + `fit-line.ts` | Machine fit's plum line: `menuAudit` (the Setup screen's Check on what is SAVED, from the host's `useFitData`), `rareStudioFlags` (a rare value at the studio tier only), `flagSentence` word for word, Right for this client → `acknowledgeFlag`, never waited on |
| `MenuNotes.tsx` | The Notes block: the one box (About [client \| The machine itself], Filed as with Change, the one Loudness control, Cancel and Add note), the list (the newest open note not in the safety strip, else the newest standing one; All notes grouped Open · Standing context · Resolved), a note's thread in place (its updates, Add update, More: Close it / Reopen, No need to remind me, Take it off the list with a ten-second Undo) |
| `SettingChanges.tsx` + `setting-changes.ts` | The folded Setting changes row: every settings and first set-up row and every starting-weight change, newest first, old → new · reason · who · day; "Couldn't load setting changes · Try again"; the footer about where today's and the next session's weights are set |
| `useSettingHistory.ts` | The card's ONE `getDocs` of the client's `machines/{id}/settingHistory` on open (replacing the old live listener), shared by the chart, "Last changed", Setting changes and the settings-copy filter; `reload` after a save; "failed" is never an empty list, and a cache-only answer says so |

Outside the folder: `components/WrapUpScreen.tsx` offers a carried floor draft as "Add to Westlake's notes" or Drop it, and `components/WorkoutTrackerView.tsx`'s `fileSessionDraft` sends it to `addFloorNote` (the session's studio) instead of the client's journal, on the button and on the way out. `lib/names-wrap.test.ts`, `hub-schedule/hub-colour-rules.test.ts` (`.mm-save`, `.mm-add`) and `look.test.ts` hold the new classes.

#### Decisions made in phase 5 where the spec met the code

- **In a session the box is the tracker's draft, but choices made before the first word stay on the card.** The tracker keeps a draft only while it has words (`handleDraftChange` sets null otherwise), so the switch or a filing picked before typing is held in the card's own state and handed up with the first keystroke. Nothing is written to storage by the card.
- **The session's note sidebar takes a floor draft back to the client.** Its composer has no floor switch and reports what its box would save, so an edit there drops `toFloor`. Merging the switch through would have let the sidebar save the words onto the client's record while the draft still said "the machine itself". The menu then shows it as a client note.
- **Words about another machine (or none) are never this box's to throw away**: the box shows them with "About Chest Press" and "Make it about Leg Press", and offers neither Cancel nor Add until it is made this machine's.
- **The thread is drawn by the card, not `NoteThreadCard`.** The design names a `dense` prop on `NoteThreadCard`, but its actions are the Notes page's (Archive behind ⋯ with an inline confirm); the card's are Add update and More with Take it off the list and a ten-second Undo. The card uses the same writers (`thread-write.ts`, `dismissThread`) and the same zones (`threads.ts`), so nothing drifts in what is written.
- **A note on the old `machineNotes` list with no journal copy is shown, read only**, under Standing context (the menu writes the journal only). Before, its trash icon rewrote the old list.
- **Machine fit's line sits under the tiles, not under its tile**: a full-width line placed inside the tile grid would break the row it lands in. The sentence names its dial.
- **"Pain or discomfort" offers the Health note through the host**: `DialTiles` calls `onAddHealthNote(changeWords)`, and `MenuNotes` takes `healthNote={changeWords, nonce}`; the body (phase 6) passes one to the other.
- **The Health chip files as plain Health**, as phase 2's `fileDraft` does; the Health note after a pain save is "Health · Injury or pain".
- **A floor note waits for nothing either**: `addFloorNote` goes through `settleOrQueue` like a client note, and its confirmation says "Saved on this iPad · sends when online" when the database hasn't answered.

### Phase 6 — the frame, the body and the three doors

| File | What it is |
| --- | --- |
| `MachineMenu.tsx` | The frame: a centred Base UI Dialog titled by the header's names (DialogTitle), `min(820px, 100vw − 60px)` × 88dvh, `min(1080px, 100vw − 64px)` in landscape from 1000px, full width on a phone (`.mm-dialog`, machine-menu.css). Close, Escape and a tap on the backdrop go through a leave scope around the body, so only the card's own drafts are asked about ("You have unsaved changes to Leg Press settings for Avery. Leave without saving?"). The body is keyed `${clientId}_${machineId}`. Nothing is mounted until the first open (no catalog listener before it); the frame stays mounted after, so the catalog listener is opened once. Imported statically |
| `MachineMenuBody.tsx` | The header and the blocks in `doors.ts`' order (one column, or landscape's two), and the wiring between them: "Last changed" selects that session on the chart, the chart's Open note opens the thread in Notes, "Add a Health note" opens the box, an unsaved setting steps Add note down, the header's pill brings the strip back. Also the inline host on Programming → All Machines (`inline`: one column, the header sticky in the pane, Back in the one-pane layout) |
| `MenuHeader.tsx` | Line 1: the floor name (22px) and `clientDisplayName` (17px), both wrapping; the safety pill only while the strip is scrolled away (an IntersectionObserver on the scroller, feature-detected); Close 48×48 "Close Leg Press". Line 2: `lastTimeLine` (28px figures, QualityMark, the day). Takes the names and the line and nothing else of the client record: no gender, height or age |
| `SafetyStrip.tsx` + `safety.ts` | Open Critical thread roots on this machine (the notes' zone rule, settings copies left out — the same list MenuNotes skips at its head), old-list notes flagged important with no journal copy, then `WatchOutCard compact` and `FloorNoteLines` (FloorNoteCard drawn from the card's one read). A journal that couldn't be read says "Critical notes couldn't be checked"; one that hasn't answered says nothing yet. `safetySummary` is the pill's count |
| `useMachineMenuData.ts` | `MachineMenuHost` (what a door hands the card) and everything the card reads: the sessions whose sets were read (`readIds`), the model, the header line, the progress figure, ONE `settingHistory` getDocs, ONE floor-notes read, `useFitData` with the roster, the studio's Drifting line, Load older the door's way (the profile's own next page; in a session `older-read.ts` with the tracker's `sessionId in` query, remembered per client) and the journal context of each door |

The doors:

- **The Active Session** (`components/WorkoutTrackerView.tsx`): the grid's name (now `onOpenMachine`, so a second tap reopens), the phone card and the Now Bar's flag open the menu; the watching grid opens it read only. The tracker records which sessions' sets its logs listener read and whether it answered (`logsWindow`), the one journal listener is passed down (`useMachineJournalRead`), and the note box is the session's one draft. The machine sheet is gone.
- **The client profile** (`components/ClientProfileView.tsx`): the Journey grid, Routine A / B and the codex's machine links open the menu. The view now records whether this client's first page of sessions was read (`historyRead`) and can be asked for it from outside the two tabs that read it (`historyWanted`), so the menu opened from Programming or Notes & Profile says "Loading…" and asks, never the first-time words. `handleLoadMoreHistory` resolves false on a failed read. The machine window and the story card are gone.
- **Programming → All Machines** (`equipment/EquipmentTab.tsx`): the right pane is the body, inline, in a leave scope (another machine, or Back, asks first). The old detail pane is gone.

Retired: `MachineSheet`, `ClientMachineWindow`, `MachineDetailPanel`, `LoadProgressionCard`, `MachineUsageCard`, `PrescriptionCard`, `SettingsCard`, `MachineNotes`, `ChangeHistory`, `journey-grid/MachineStoryCard` + `machine-story.ts`, `equipment/progression.ts`, their tests, the grid's 22px ⋯ popover, `saveWeights` and `deleteMachineNote` (nothing else called them), and their stylesheet sections. `.eq-btn--hero`'s row in `hub-colour-rules.test.ts` went with it (`.mm-save` was already held there).

#### Decisions made in phase 6 where the spec met the code

- **The session grid opens the menu now, and the watching grid opens it read only** (design §F 1), in the same change that put the menu where the sheet was: the grid's toggle would otherwise have left a machine that had just been closed unable to reopen.
- **The chart measures its own width** (its layout effect, then a ResizeObserver) instead of being handed the frame's computed one: a desktop browser's scrollbar or the inline pane would otherwise overflow it.
- **"2 more" caps the Critical lines only.** The watch-outs and the floor's notes are the session sheet's own cards, which keep their own caps (FloorNoteCard shows four).
- **"Critical notes couldn't be checked" has no Try again.** The journal is the host's live listener; nothing on the card can re-open it.
- **A note's "in a session" is not a door on the profile here.** The Notes page opens the session in its own pop-up; the menu has none to open, and a second dialog over the card would be a worse place to read it.
- **The header is taller than 76px** (48px Close, a 28px line): 76 is a minimum, and it grows, as the design says it does when a name wraps.
- **The inline pane asks for the first page too**: opening All Machines with a machine selected reads the profile's first page of sessions if Journey hasn't, which it didn't before.
- **The guide, the watch-outs and the floor's notes** are lifted to the card's 14px floor inside the card (`.mm-card` / `.mm-safe` overrides); the components themselves are unchanged elsewhere. `SetupGuide` gained `part` (the set-up part above the tiles the first time, the execution cues folded).

### Phase 7 — the session and the grid

The fixes the design lists in §F, outside the card:

| Where | What changed |
| --- | --- |
| `components/WorkoutTrackerView.tsx` | The grid's name opens the menu on every tap (`onOpenMachine`, never the toggling `onSelectMachine`), and the watching grid opens it read only — both since phase 6. The logs listener's window is `older-read.ts`' `logsWindowIds`: the running session (recorded here or watched) first, then the past sessions in the 29 places left, or 30 when nothing runs; the grid draws exactly those past sessions (`gridHistory`), so every column it draws has its sets (§F 6; before, 30 ids with the running one among them fed 30 past columns). The session holds ONE journal listener (§F 8): the grid's marks and the menu take the client's machine notes from `useClientJournal`'s new `journalStream` through `machineJournalOf` (equipment/useMachineJournal.ts), never a second subscription on the same query. `sessionsAllRead` (every session's sets read, the read not failed) feeds the Now Bar and the phone |
| `journey-grid/SessionNowBar.tsx` | The start and the green % are `progress-figure.ts`' (Q2 (a)), the card's own figure: "Starting weight 80 lb" for the number on file, whatever was read; with none on file, the first counted set only once every session has been read ("First in Journey", or "First performed" with the whole story); otherwise no start and no %. It called a typed start, and the oldest of the 29 sessions loaded, "First in Journey" (§F 11). New prop `everythingRead`, cautious by default |
| `journey-grid/JourneyGrid.tsx`, `phone/PhoneSessionStage.tsx`, `equipment/NoteIndicator.tsx` | The mark that says how loud a machine's notes are follows the one note key (§F 12): `machineNoteLoudness` (equipment/machine-notes.ts) gives the loudest OPEN note on the one list (her journal's open thread roots by the notes' zone rule, plus an old-list note flagged important as Critical), and the mark is a plum `AlertCircle` for a Heads up or the Hub's crimson `AlertTriangle` for Critical, never rep quality's red. `JourneyMachine.alert` is that loudness now (`"elevated" \| "critical"`), and the name's spoken label says it. The grid's corner note glyph is the plain Note mark. All Machines' rail reads the one list too (§F 4): `EquipmentMachine.noteCount` and `noteLoudness` replace the old list's `hasMaintenanceFlag`, from the journal the profile's host already holds |
| `phone/phone-session.ts` `noPastWords` | A phone card with no past times says what the menu's header would (§F 5): never "first time" for a machine a running total knows ("Done here in Journey before · not in the sessions loaded here."), nor while older sessions are unread ("Nothing recorded on this machine in the sessions loaded here."); "First time on this machine." only with every session read and the whole story in Journey |

`note-key-marks.test.ts` holds the three stylesheets to the key; `WorkoutTrackerView.render.test.tsx` counts the session's journal listeners (one).

#### Decisions made in phase 7 where the spec met the code

- **The menu's own `firstTime` already honoured the running totals** (phase 6's `knownElsewhere`), and the machine sheet's `firstTime` prop went with the sheet. The session's one remaining "first time" claim was the phone card's strip, so §F 5 is applied there.
- **The rail's chip follows the note key too.** The design names only where `NoteIndicator` reads from; but read from the one list, its "flagged for maintenance" chip (an orange go chip with a wrench) would have said "maintenance" for a Heads up about the client's knee, in the vocabulary the design retires with the old checkbox, and in the Relay flag's glyph. It is now the key's plum or crimson chip, and `hub-colour-rules.test.ts` no longer lists it as an orange chip.
- **The one-list count still counts a settings save's journal copy** on the grid and the rail: telling a copy from a typed Set-up note needs the machine's setting changes (`settings-copy.ts`), one read per machine, which a list of every machine can't make. A copy is a plain note, so the loudness is never touched by one.
- **The window counts the watched session as running**, so a second iPad watching a session reads the same 30 ids as the iPad recording it.
- **The row trace still toggles beside the open**, as it did on the profile: the menu opens on every tap, and the blue rules come and go with it.

### Phase 8 — Correct the starting weight (Q3 (a))

AJ's Q3 (a): once the Prescription card retired with the menu (phase 6), nothing could change a starting weight already on file, and that is the number the green % counts from (Q2 (a)). **Programming → Setup gains "Correct the starting weight"**; the menu stays the same in both doors apart from the notes.

| Where | What changed |
| --- | --- |
| `machine-fit/setup-plan.ts` | `draftStart` on a machine's input, read only when a start is on file (`parseStartingWeight`: above 0, at most 2000 lb). A corrected start is `entry.start {from, to, currentFrom, currentTo}`; it asks no reason and is never journalled. `weightRowOf` is the machine's ONE WEIGHT row: a corrected start in the Prescription card's words ("Start: 84, Current: 100" → "Start: 80, Current: 100", a load moved in the same Save on the same row), a load alone in Setup's own "Current:" words |
| `machine-fit/setup-save.ts` | The start rides in Setup's one batch: `startingWeight` (by `mergeFields`) and that row. `startingWeightDate` is not touched (see below) |
| `machine-fit/ui/setup-draft.ts` | `start` on a machine's draft (the `start` action), one unsaved change; back at the number on file it is no draft |
| `machine-fit/ui/starting-weight.ts` + `StartingWeight.tsx` | The control: shut, "Starting weight 84 lb" and the button; open, − 2 lb, the box (typed, for a long way), + 2 lb, "was 84 lb", Keep 84 lb. Never 0 or below. A box with no weight is not written and says the number on file stands. In Set up and Quick entry only, outside the keypad's run of cells |
| `machine-fit/ui/SetupView.tsx`, `SetupRow.tsx` | Which controls are open (forgotten on a client change, a Save and Discard); the box's focus moves the docked keypad aside. The draft is in the reducer, so `useUnsavedChanges` already covers it |

`setup-save.test.ts` follows the written fields through both hosts' adapters (`toEquipmentMachines` for the menu, `toJourneyRows` for the Now Bar) into `progress-figure.ts`: both say "Starting weight 80 lb, +25%" after 84 → 80. Both hosts read `clientMachineSettings` through a live listener, so the corrected number arrives without a reload. The rules already allow it: `clientMachineSettings` and `settingHistory` create/update are any trainer's (`isAnyAuthenticatedTrainer`), the same as the Setup save and the card's `saveWeights` before it.

#### Decisions made in phase 8 where the spec met the code

- **`startingWeightDate` stays.** The spec lists it among the fields `saveWeights` wrote; `saveWeights` stamped it only when a start was first recorded (none on file), and the correction exists only for a machine that has one. It says when the start was first recorded, and a trainer copying the true start from a paper chart changes the number, not that day. Setup's load still stamps it with a first start, as before.
- **One WEIGHT row a machine.** A corrected start and a load moved in the same Save go on one row in the Prescription card's format, so the Setting changes list reads it as the start and the row still says the load. A load alone keeps Setup's own format (unchanged).
- **Set up and Quick entry only, never Check.** Check is read only; the control sits beside the load those modes already edit.
- **No reason box for it.** "Nothing blocks a save": a start-only Save needs no reason. The existing rule for changing saved SETTINGS (a reason) is unchanged. A box holding no weight leaves Save as it would be without it (disabled when nothing else changed, as a load that isn't a number does today).
