# Equipment Tab — dual-pane redesign

Round: Equipment Dual-Pane, Sep 2026.
Replaces `src/components/ClientEquipmentPrescriptions.tsx` (1,513 lines, one file,
four dialogs per card, twenty cards on screen at once).

The old tab answered "show me everything". The new one answers the question a
trainer actually walks up to the tablet with: **"what is this one machine set to
for this one client, and is that still right?"**

---

## 1. Why the old layout fought the job

Three problems, all of them layout problems rather than data problems:

1. **Twenty cards, no focus.** Every machine rendered a full card with weights,
   configuration and two buttons. Nothing was ever *selected*, so nothing could
   be *detailed*. A machine's setup guide, note history and change log had
   nowhere to live — which is why the app's richest data (`MACHINE_DATABASE`
   setup cues, 11 per machine on the Leg Press) was never shown here at all.
2. **Everything behind a modal.** Weights, settings, notes and initial setup were
   four separate dialogs per card. Reviewing three machines meant opening and
   closing nine windows.
3. **A top bar measuring the wrong thing.** "Configured 5% · Starting Logged 43% ·
   Warning Alerts 0" are audit numbers. A trainer prepping for a session does not
   need a compliance percentage; they need to know which machines this client
   actually trains on.

The fix is a **master–detail split**: a scannable list on the left that never
scrolls away, and one deep panel on the right that has room for everything we
know about the selected machine.

---

## 2. UX layout

*Since the machine menu (Oct 4 2026) the right pane is the machine menu's
body, inline (`features/machine-menu/MachineMenuBody.tsx`): the same card a
machine's name opens on the Journey grid and in a session — safety, the dial
tiles, notes, the Staircase, the set-up guide and Setting changes. The
Prescription, Settings, Notes and Change history cards in the sketch below
are how the pane was first built; they retired with it.
`src/features/machine-menu/README.md` is the card.*

### 2.1 Landscape (the primary case — iPad Pro on a floor stand)

```
┌───────────────────────────────────────────────────────────────────────────┐
│  Client header + profile tabs                              (unchanged)    │
├───────────────────────────────────────────────────────────────────────────┤
│  EquipmentSummaryBar                                                      │
│  14 of 20 machines in use   ·  6 Upper  6 Lower  2 Core   [ search... ]   │
├──────────────────────────┬────────────────────────────────────────────────┤
│ MachineRail   (320px)    │ MachineMenuBody, inline       (fills, scrolls) │
│ ┌──────────────────────┐ │ ┌────────────────────────────────────────────┐ │
│ │ IN USE — 14          │ │ │ HIP ADDUCTION              SIMPLE PULL   ▤ │ │
│ ├──────────────────────┤ │ ├────────────────────────────────────────────┤ │
│ │▍HIP ADDUCTION     ▤  │ │ │ PRESCRIPTION                               │ │
│ │  40 → 66   G9 · S8   │ │ │   START 40      CURRENT 66      +26  +65%  │ │
│ ├──────────────────────┤ │ │   Studio standard 40 lbs (Beginner)  [Edit]│ │
│ │ HIP ABDUCTION        │ │ ├────────────────────────────────────────────┤ │
│ │  20 → 28   G0        │ │ │ MACHINE SETTINGS                     [Edit]│ │
│ ├──────────────────────┤ │ │   Gap 9    Seat 8    Back pad —             │ │
│ │ NOT SET UP — 6       │ │ ├────────────────────────────────────────────┤ │
│ ├──────────────────────┤ │ │ SETUP GUIDE            (from the catalog)  │ │
│ │ CX (4 WAY NECK)      │ │ │   1. Seat so the pad meets mid-thigh...    │ │
│ │  Not set up          │ │ │   2. ...                                   │ │
│ └──────────────────────┘ │ ├────────────────────────────────────────────┤ │
│         (scrolls alone)  │ │ NOTES (2)                       [+ Add]    │ │
│                          │ ├────────────────────────────────────────────┤ │
│                          │ │ CHANGE HISTORY                             │ │
│                          │ └────────────────────────────────────────────┘ │
└──────────────────────────┴────────────────────────────────────────────────┘
```

Two independent scrollers. The rail keeps its scroll position while you read a
long setup guide, so comparing three machines is three taps, not three
scroll-hunts.

### 2.2 Portrait — master-detail drill-in

Below `1024px` the two panes become one. The rail fills the width; tapping a
machine slides the detail panel in over it with a back button in the header.
Same components, same state — one `isSplit` boolean decides whether both panes
render or only the active one. No second layout to maintain.

### 2.3 The top bar (replaces boxes 1, 2, 3)

Gone: the three percentage tiles, the Compact/Full toggle (the UI is locked to
full — the rail *is* the compact view), and Mass-Apply Standard Settings.

Mass-Apply is deliberately not replaced. It wrote studio defaults onto every
unconfigured machine in one tap with no per-machine review, which is the exact
opposite of "review populated standards before saving" — and it is what produced
rows like `Leg Extension 20 → 20` that nobody ever set. Setting up a machine is
now a per-machine act, and it takes two taps.

What replaces it is a sentence, not a dashboard:

> **14 of 20 machines in use** · 6 Upper · 6 Lower · 2 Core

"In use" = the client has a weight, a setting, or a logged set on it. The
regional breakdown is derived from `MACHINE_DATABASE[id].category`, so a trainer
can see at a glance that a client has no core work on file.

### 2.4 Sorting

Unchanged behaviour, made visible. The existing concurrent sort (machines the
client uses first, then studio display order) now renders as two labelled
sections in the rail — **IN USE** and **NOT SET UP** — so the boundary the sort
was already creating stops looking like an accident. Machine counts vary by
studio; the rail is a plain scrolling list with no fixed height assumptions.

### 2.5 Settings: ghosts, not guesses (boxes 7 & 8)

The old "Initialize Parameters" dialog pre-filled every field from studio
standards, so a trainer tapping Save Setup silently wrote values they never
chose. The new editor:

- **Ghosts** the studio standard as placeholder text in an empty field
  (`Seat: 3–5`), pulled from the catalog's `settingFields.helpText` /
  `defaultSettings`, or from the studio roster override where one exists.
- **Auto-fills only absolute standards** — a value that is the same for every
  client on that machine. Today that is the gap, and WHICH dial is driven by a
  single list (`ABSOLUTE_DIALS`, `isAbsoluteDial`, `adapters.ts`) rather than
  scattered `if (key === 'gap')` checks, so adding the next one is a one-line
  change. WHAT it fills is the machine's own value (`absoluteValueFor`); a
  machine with none leaves the dial empty. It fell back to `Gap: 0` until Oct 9
  2026, and the first save on such a machine wrote Gap 0 (the open session
  round, finding 5).
- **Never saves a ghost.** A field left showing its placeholder is saved as
  empty, and the machine stays "Not set up". That is honest; the old flow's 5%
  configured number was not.

### 2.6 The note indicator (box 4)

The old icon was a `ClipboardPenLine` in muted slate whether or not a note
existed — invisible. Now it is a three-state, colour-and-shape indicator:

| State                | Glyph                | Colour             |
|----------------------|----------------------|--------------------|
| No notes             | outline clipboard    | the faint ink (`--eq-ink-faint`) |
| Has notes            | filled clipboard + count badge | live blue |
| A Heads up open      | `AlertCircle` + count | plum on its fill (`--eq-warn` / `--eq-warn-fill`) |
| A Critical note open | the Hub's `AlertTriangle` + count | crimson on its fill (`--eq-alert` / `--eq-alert-fill`) |

The count and the loudness are the one list's (`machine-notes.ts`: `machineNoteCount`, each thread once as the machine menu counts them, and `machineNoteLoudness`), read from the journal the profile's host already holds, and the loud states are the one note key (`machine-menu/note-key.ts`; machine menu, Oct 2026). The old "Flagged maintenance" chip (an orange chip with a wrench, for the old list's checkbox) is gone with the checkbox; the wrench is the Relay flag's alone.

Colour alone never carries the meaning — the glyph changes too, which keeps it
readable for a colour-blind trainer and at arm's length on a gym floor.

---

## 3. Component hierarchy

```
ClientProfileView                                  (existing, one line changes)
└── EquipmentTab                                   props identical to the old
    │                                              ClientEquipmentPrescriptions
    │   owns: selectedId, search, isSplit, pane
    │
    ├── EquipmentSummaryBar                        usage sentence + search
    │
    ├── MachineRail                                left pane, own scroller
    │   └── MachineRailItem  × n                   memoised
    │       └── NoteIndicator
    │
    └── MachineMenuBody (inline)                   right pane, own scroller,
        │                                          in a leave scope
        │                                          (features/machine-menu)
        ├── MenuHeader                             names, Last time, Back
        ├── SafetyStrip                            Critical notes, WatchOutCard,
        │                                          the floor's notes (FloorNoteCard)
        ├── DialTiles                              the settings: ±, positions,
        │                                          the change strip, Undo
        ├── MenuNotes                              one note box, the list, threads
        ├── MachineTimeline                        the Staircase
        ├── SetupGuide                             catalog cues, folded
        └── SettingChanges                         settingHistory, newest first

```

The pane's cards before the machine menu (`MachineDetailPanel`,
`PrescriptionCard`, `SettingsCard`, `MachineNotes`, `ChangeHistory`,
`MachineUsageCard`, `LoadProgressionCard`) retired with it on Oct 4 2026;
what replaced each, and why, is the machine menu's README → "What retired".

### 3.1 Files

| File | What it owns |
|---|---|
| `types.ts` | `EquipmentMachine` view model, `SettingFieldSpec`, `EquipmentSummary` |
| `adapters.ts` | Normalises the three machine sources into `EquipmentMachine` |
| `mutations.ts` | Every Firestore write this tab makes, in one place |
| `equipment.tokens.css` | Semantic colours, light + dark |
| `equipment.css` | Layout, sticky rails, drill-in transition |
| `EquipmentTab.tsx` | Shell, selection state, responsive mode; the right pane is the machine menu's body, inline (`menuHost`) |
| `EquipmentSummaryBar.tsx` | Usage sentence + search |
| `MachineRail.tsx` | Sectioned list + `RailItem` |
| `SetupGuide.tsx` | Catalog setup / execution cues (`part`: the whole guide, or its set-up or execution half) |
| `NoteIndicator.tsx` | The note icon, in the one note key (§2.6) |
| `WatchOutCard.tsx` | The client's clinical watch-outs for one machine, quoted from the matrix (the machine menu's safety strip draws it compact) |
| `FloorNoteCard.tsx` | The studio's notes on the unit and the Relay flag (`useFloorNote`, the one read; `FloorNoteLines`, the lines the safety strip draws) |
| `machine-notes.ts` | Notes about the client on one machine, as ONE list (`machineNotesFor`, `machineNoteCount`, `machineNoteLoudness`) |
| `useMachineJournal.ts` | The client's machine notes from the journal (`machineJournalOf` over a host's stream, or its own read for a host that has none) |
| `setting-suggestions.ts` · `useMachineTrend.ts` | The height-band line in an empty dial's editor, from `machineTrends/{id}` (one read per machine, cached) |
| `useMachineStats.ts` | Reads `client.machineStats`; one-time history backfill |
| `author.ts` | Who a write is attributed to (the Auth uid) |

Retired with the machine menu (Oct 4 2026): `MachineDetailPanel`, `PrescriptionCard`, `SettingsCard`, `MachineNotes`, `ChangeHistory`, `MachineUsageCard`, `ClientMachineWindow`, `LoadProgressionCard` · `progression.ts`, and `MachineSheet`, the session's sheet that lived here too.

### 3.2 The `EquipmentMachine` adapter — why it exists

Three sources describe a machine and none of them is complete on its own:

| Source | Gives us | Problem |
|---|---|---|
| `machines` prop (`Machine`, legacy) | name, order, `settingOptions`, `standardSettings` | no setup guide, flat string settings |
| `MACHINE_DATABASE` (static, in repo) | `setupCues`, `executionCues`, baselines, images | not editable per studio |
| `machines/{id}` catalog (`MachineCatalogEntry`) | `settingFields` with types and help text, `universalBaseline` | **empty until the roster backfill runs** |

`useStudioMachines` is the eventual single source, but its own doc says it
"returns nothing" until `studios/{id}/roster` is populated. So the tab must not
depend on it yet. `adapters.ts` merges all three by machine id with the catalog
winning where present, which means:

- the tab works **today**, on the legacy prop shape;
- every field the catalog fills in **automatically upgrades** the UI — richer
  setting types, help text, real setup guides — with no component changes;
- when the backfill lands, `EquipmentTab` swaps one hook and deletes one branch
  of the adapter. Nothing below it changes.

### 3.3 Data flow

```
ClientProfileView
  machines, clientSettings, allLogs, client, authTrainer, activeStudioId
        │
        ▼
  EquipmentTab ──uses──► useMachineCatalog()      (catalog, may be empty)
        │        ──uses──► useActiveStudio()       (studio overrides)
        │
        ├─ adapters.toEquipmentMachines(...)  ──►  EquipmentMachine[]
        ├─ adapters.summarise(...)            ──►  EquipmentSummary
        │
        └─ mutations.saveSettings / addMachineNote   (from the machine menu's body)
                 │
                 ├─► clientMachineSettings/{clientId}_{machineId}   (merge)
                 ├─► machines/{machineId}/settingHistory            (audit)
                 └─► journalEntries                                 (§3.4)
```

Reads stay exactly where they were — `ClientProfileView` already subscribes to
`clientMachineSettings` and passes it down. Nothing new is fetched per machine;
selecting a machine is pure client-side state.

### 3.4 Journal sync (boxes 10 & 11)

`mutations.ts` is the only file that writes, so the journal hook lives there and
cannot be forgotten by a future call site.

| Action | Journal entry |
|---|---|
| Settings changed with an audit reason | `kind: "equipment"`, `machineId`, body = `"Gap 8 → 9. Needs more ROM."`, importance `standard` |
| Machine note added | `kind: "equipment"`, `machineId`, body = the note |
| Machine note flagged for maintenance | same, importance `critical` — which puts it in the **pre-session briefing**. *The checkbox retired with the old notes card (Oct 4 2026); no screen passes `isMaintenance` now, and old entries still read as Critical* |
| Machine note from the machine menu (Oct 4 2026) | filed by what it is for (`storedNoteOf`: kind, category, body parts) at the loudness the note box chose |
| Weight updated | **no journal entry** |

That last row is a deliberate exclusion. Weights move most sessions; journaling
them would bury coaching notes under progression noise, and the Journey Grid
already tells that story better. The audit trail for weights stays in
`settingHistory`. `saveWeights` retired with the Prescription card (machine
menu, Oct 4 2026): a starting weight already on file is corrected on
Programming → Setup ("Correct the starting weight", AJ's Q3 (a)), which writes
the same `startingWeight` and the same WEIGHT row in Setup's one batch
(`machine-fit/setup-save.ts`), and journals nothing either.

`origin` is `"profile"` from the Equipment tab and `"in_session"` from the setup
prompt, so the Journal can still tell where a note was written without the
trainer having to say.

**Nothing here waits on the server** (machine menu, Oct 4 2026). `saveSettings`
writes the settings and their `settingHistory` row as ONE batch and issues the
journal copy (with the history row's own moment as `occurredAt`) and the
machine-fit row in the same tick, before anything is awaited, so offline all
of them are on the iPad and survive a reload; the reason is optional, and
`fileNote: false` (the menu's Undo) files no second copy. `addMachineNote`
issues its write and hands back the database's answer; on the floor wait on
either only through `settleOrQueue` (`features/session-record/finish-wait.ts`).

**Every write names a client** (the open session round, Oct 9 2026; finding
4). An open session's card saved with `clientId: ""`, to the ghost
`clientMachineSettings/_{machineId}` nobody reads; its settings are held on
the session now (`features/open-session/README.md`). So `saveSettings` throws
before writing anything with no client (it is no longer `async`: the refusal
comes back at the call, which every caller makes inside a try), and
`addMachineNote` refuses a note with no client. The open session's Assign
uses `queueSettingsSave`: the settings document and its history row go into
the caller's batch (all or nothing with the session getting its client), and
nothing is written outside it until the caller runs `afterCommit` once that
batch has committed (the journal copy and the machine-fit row; a refused
batch leaves neither). `dialsOnly` writes only the dials that change, by name
and merged, so every other dial stays as the database holds it whatever
`saved` said; `writeDials` names dials written even when `saved` already
shows them (a held set-up's, off a stale copy). The session card saves
`dialsOnly`, with no fit row, until the server has answered for the client's
settings. Old ghost records may still be in production; nothing reads an
empty client, so they are harmless.

### 3.5 In-session prompt (phase 6)

Retired. `SetupPromptDialog` opened before the old performance entry pop-up
on a machine with nothing recorded; when that pop-up lost its trigger the
prompt died with it, and both files were deleted on Oct 2 2026. The machine
menu's first-time state does the job now (Oct 4 2026; it was the machine
sheet's `firstTime` section before): with nothing recorded in what was read
and no settings saved, the set-up guide's set-up part opens above the tiles,
and the header says `noMachineHistoryLine` ("Nothing recorded on this
machine" unless the client's whole story is in Journey).

### 3.6 Deliberately left for later

- **Roster backfill.** Until it runs, `settingFields` types come from the legacy
  `settingOptions` string list, so every field renders as free text. Typed
  enum/number inputs are already implemented and switch on automatically.
- **Reordering machines** from this tab. Studio display order is admin territory.
- **Cross-machine bulk actions.** Mass-Apply was removed on purpose; if a real
  need appears it should be a reviewed, multi-select flow, not a single button.

### 3.7 Usage figures (client profile redesign, Sep 2026)

Each machine now carries **Date first performed**, **Times performed** and
**Progression %** — in the rail as a `+29%` chip and a quiet `10×`, in the
detail pane as the History card under the prescription.

*Since the machine menu (Oct 4 2026) the detail pane's History card
(`MachineUsageCard`) is gone: the pane is the machine menu's body, whose count
is the performed sessions in the columns read and whose green % is
`machine-menu/progress-figure.ts` (from the starting weight on file, AJ's
Q2 (a)). The rail's `+29%` chip still reads `usage.progressionPct` below, from
the first load performed: a second progress definition beside the menu's,
left open for AJ (the round document's open items).*

Where the numbers come from, in order of trust:

1. `client.machineStats[machineId]` — (since Oct 6 2026 stored in
   `clients/{id}/machineTotals/current` and folded onto the client on screen by
   `withMachineTotals`: `machine-totals/README.md`) the lifetime rollup that
   `lib/client-rollups.ts` maintains on every session save and CSV import
   (`firstPerformedDate`, `firstWeight`, `lastPerformedDate`, `lastWeight`,
   `timesPerformed`). Trusted only once `client.machineStatsBackfilledAt` is
   set, because a client who trained before the rollup existed has a field
   that only counts recent sessions.
2. Until then, `usageFromLogs` rebuilds the same shape from the sessions the
   profile has loaded (the last page of history) and marks it `partial`; the
   card says "from loaded sessions" and the chips carry the caveat in their
   tooltip. Meanwhile `useMachineStats` fetches the complete history once,
   runs `rollupFromHistory`, and writes `machineStats` + the marker back. The
   next snapshot replaces the partial figures for good, on every surface.

"Times performed" counts **sessions**, not sets — three sets of Leg Press in
one visit is one performance. "Progression" is measured from the **first load
ever performed** to the prescribed current weight (falling back to the last
performed load), not from the prescription's starting weight: a starting
weight is sometimes typed in months later from memory, whereas the first set
is a fact that happened on the floor. Positive is green, negative plum, flat
stays muted — a `0%` after ten sessions is a plateau worth seeing, so it is
not hidden.

### 3.8 One machine window (profile round, Sep 2026)

*Retired on Oct 4 2026: every machine tap on the profile now opens the
machine menu (`features/machine-menu`), the same card the session opens, and
`ClientMachineWindow`, `LoadProgressionCard` and `progression.ts` are gone
(the Staircase's model absorbed `progression.ts`). Kept below as the history
of why there is one machine screen.*

Tapping a machine on the profile — its name on the Journey grid, or its row
in Routine A / B — used to open `components/MachineSettingsDashboardModal`, a
second, different machine screen that saved settings with a bare `setDoc`:
no reason, no `settingHistory`, no journal entry. It now opens
`ClientMachineWindow`: the MachineSheet frame (centred, 88dvh, fixed header,
40px close, body scrolls) around **this** tab's `MachineDetailPanel`, built
for the one machine with `toEquipmentMachines`. Same cards, same writes
(`mutations.ts`, journalled with origin `"profile"`). The modal file went
with the full-screen chart that last used it (Oct 2 2026: neither had a door).

- **Cost.** Nothing until the first open; from then the body stays mounted, so
  the catalog listener is opened once per profile, not once per tap. Usage
  figures read the lifetime rollup when it exists and pass
  `useMachineStats(client, { enabled: false })` — the window never starts the
  one-time backfill; this tab does.
- **Load progression.** The old modal opened on a load trend, so the detail
  pane gained a card for it (and therefore All Machines has it too).
  `progression.ts`: performed sets only, ONE point per session at its
  heaviest performed load (the modal plotted every set, so a unilateral
  machine drew each visit twice), days from the session through `toIsoDay`.
  Under two points the card says "Not enough sessions yet" and draws no line.
  It covers only the sessions the profile has loaded, and its sentence says so.
- In the window the pane's own title and "‹ Machines" back button are hidden
  — the window's header names the machine and closes it.

## Notes about her on one machine: one list (Oct 2 2026)

AJ (the Atlas answers): notes about her on one machine live in her journal and show on the machine sheet. A new machine note is a journal entry carrying `machineId` and nothing else (`addMachineNote`; only a host with no journal context still writes the old `clientMachineSettings.machineNotes` list). Every reader takes `machine-notes.ts` (`machineNotesFor`, `hasImportantMachineNote`): her journal's notes on that machine, not archived, plus the old list's items with no journal copy, so a double-written note shows once and archiving its journal copy takes it off the sheet. `useMachineJournal` reads her journal with the same query `useClientJournal` streams (one shared listener, the existing index). Removing a journal note archives it. Programming → Setup's bulk save still writes its note to the old list (an atomic batch), which the one list reads.

*Since the machine menu (Oct 4 2026) the sheet is the machine menu, in both doors: its Notes block lists the one list (the open notes grouped Open · Standing context · Resolved, an old-list note with no journal copy read only, settings copies left out), and the grid, the phone card and the rail draw how loud a machine's notes are from it (`machineNoteLoudness`, the one note key). A note written there is filed by what it is for (`storedNoteOf`) at the loudness the Loudness control chose.*

## The floor's note on this machine, in the session (Oct 3 2026)

*Since AJ's answer 2A the same day, the floor's notes are one dated list per
machine (`features/floor-notes`), and the card reads this machine's OPEN notes
from it (one query on `machineId` over this studio's floor notes, served since
Oct 5 2026 by the floorNotes (machineId, updatedAt) composite: the Enterprise
edition refuses single-field index settings, so a composite is how it gets one), each
with its latest update, at most four, then the
old Studio notes below while nobody has copied them into the list. The text
below is how it began.*

*Since the machine menu (Oct 4 2026) the same read feeds the menu's safety
strip in BOTH doors (`useFloorNote` once per open, drawn by `FloorNoteLines`),
so the profile reads it too. And a fault with the unit is written from the
menu itself: its note box's "The machine itself" adds it to the studio's
floor notes (`addFloorNote`), never a Relay flag (AJ accepted it with "ill take
all your recommended"); flagging stays on Relay.*

`FloorNoteCard.tsx`, on the session's machine sheet under the watch-outs. A
studio's own knowledge of the unit in its building (`studios/{s}/machineNotes/
{machineId}`, written on the Catalog and My Studio → Machines) and a Relay flag
(`studios/{s}/machineCare/{machineId}.flag`) never reached the moment they are
for — the trainer at that machine with a client. The sheet now reads both, once,
when it opens (two documents, no listener, no index) and draws them read-only:
the flag first, then the floor's note, signed and dated; nothing when there is
nothing; a failed read is said. The client's own machine note says whose it is
("About her on this machine"), and that a fault with the unit is the floor's:
flag it on Relay so it's fixed for everyone. `docs/rounds/2026-10-03-client-notes.md`
(the second half, machines) is the round.
