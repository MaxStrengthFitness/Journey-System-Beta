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

### 2.1 Landscape (the primary case — iPad Pro on a floor stand)

```
┌───────────────────────────────────────────────────────────────────────────┐
│  Client header + profile tabs                              (unchanged)    │
├───────────────────────────────────────────────────────────────────────────┤
│  EquipmentSummaryBar                                                      │
│  14 of 20 machines in use   ·  6 Upper  6 Lower  2 Core   [ search... ]   │
├──────────────────────────┬────────────────────────────────────────────────┤
│ MachineRail   (320px)    │ MachineDetailPanel            (fills, scrolls) │
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
  client on that machine. Today that is `Gap: 0`, and it is driven by a single
  predicate (`isAbsoluteStandard`) rather than scattered `if (key === 'gap')`
  checks, so adding the next one is a one-line change.
- **Never saves a ghost.** A field left showing its placeholder is saved as
  empty, and the machine stays "Not set up". That is honest; the old flow's 5%
  configured number was not.

### 2.6 The note indicator (box 4)

The old icon was a `ClipboardPenLine` in muted slate whether or not a note
existed — invisible. Now it is a three-state, colour-and-shape indicator:

| State                | Glyph                | Colour             |
|----------------------|----------------------|--------------------|
| No notes             | outline clipboard    | faint slate        |
| Has notes            | filled clipboard + count badge | live blue |
| Flagged maintenance  | filled + wrench glyph | hero orange, solid |

Colour alone never carries the meaning — the glyph changes too, which keeps it
readable for a colour-blind trainer and at arm's length on a gym floor.

---

## 3. Component hierarchy

```
ClientProfileView                                  (existing, one line changes)
└── EquipmentTab                                   props identical to the old
    │                                              ClientEquipmentPrescriptions
    │   owns: selectedMachineId, search, isSplit,
    │         edit mode of the detail panel
    │
    ├── EquipmentSummaryBar                        usage sentence + search
    │
    ├── MachineRail                                left pane, own scroller
    │   └── MachineRailItem  × n                   memoised
    │       └── NoteIndicator
    │
    └── MachineDetailPanel                         right pane, own scroller
        ├── DetailHeader                           name, class chip, back btn,
        │                                          NoteIndicator
        ├── PrescriptionCard                       start / current / delta
        │   └── WeightUpdatePanel                  inline, replaces the modal
        ├── SettingsCard                           current values, read mode
        │   └── SettingsEditor                     catalog-driven fields
        │       ├── SettingField × n               ghosted placeholders
        │       └── AuditReasonField               required when values change
        ├── SetupGuide                             catalog cues, collapsible
        ├── MachineNotes                           list + composer
        │   └── NoteRow × n
        └── ChangeHistory                          settingHistory, newest first

SetupPromptDialog                                  used by WorkoutTrackerView
└── (SetupGuide + SettingsEditor)                  same components, in a Dialog
```

### 3.1 Files

| File | What it owns |
|---|---|
| `types.ts` | `EquipmentMachine` view model, `SettingFieldSpec`, `EquipmentSummary` |
| `adapters.ts` | Normalises the three machine sources into `EquipmentMachine` |
| `mutations.ts` | Every Firestore write this tab makes, in one place |
| `equipment.tokens.css` | Semantic colours, light + dark |
| `equipment.css` | Layout, sticky rails, drill-in transition |
| `EquipmentTab.tsx` | Shell, selection state, responsive mode |
| `EquipmentSummaryBar.tsx` | Usage sentence + search |
| `MachineRail.tsx` | Sectioned list + `MachineRailItem` |
| `MachineDetailPanel.tsx` | Right pane composition |
| `PrescriptionCard.tsx` | Weights + inline `WeightUpdatePanel` |
| `SettingsCard.tsx` | Read + `SettingsEditor` + `AuditReasonField` |
| `SetupGuide.tsx` | Catalog setup / execution cues |
| `MachineNotes.tsx` | Notes list + composer |
| `NoteIndicator.tsx` | The three-state icon |
| `ChangeHistory.tsx` | `machines/{id}/settingHistory` for this client |
| `SetupPromptDialog.tsx` | In-session prompt (phase 6) |

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
        └─ mutations.saveWeights / saveSettings / addNote / deleteNote
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
| Machine note flagged for maintenance | same, importance `critical` — which puts it in the **pre-session briefing** |
| Weight updated | **no journal entry** |

That last row is a deliberate exclusion. Weights move most sessions; journaling
them would bury coaching notes under progression noise, and the Journey Grid
already tells that story better. The audit trail for weights stays in
`settingHistory`. If you want them journaled later it is one line in
`mutations.saveWeights`.

`origin` is `"profile"` from the Equipment tab and `"in_session"` from the setup
prompt, so the Journal can still tell where a note was written without the
trainer having to say.

### 3.5 In-session prompt (phase 6)

`WorkoutTrackerView` already knows both halves of the condition: it holds
`clientMachineSettings` and it knows which machine the trainer just opened
(`editingWeightMachineId`). When that machine has no settings, no weights and no
prior log — genuinely "Not Performed" — `SetupPromptDialog` opens *before* the
performance entry HUD, showing the setup guide and the ghosted settings editor.
Saving drops the trainer straight into the HUD; "Skip" does the same without
writing. It fires once per machine per session (`promptedRef`), so dismissing it
does not turn into a loop.

### 3.6 Deliberately left for later

- **Roster backfill.** Until it runs, `settingFields` types come from the legacy
  `settingOptions` string list, so every field renders as free text. Typed
  enum/number inputs are already implemented and switch on automatically.
- **Reordering machines** from this tab. Studio display order is admin territory.
- **Cross-machine bulk actions.** Mass-Apply was removed on purpose; if a real
  need appears it should be a reviewed, multi-select flow, not a single button.
