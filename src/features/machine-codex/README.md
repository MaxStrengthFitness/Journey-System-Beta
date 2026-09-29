# The Machine Codex

The Codex is both the page every trainer reads about a machine and the editor
head office writes it in (the Redesign Blueprints' Machine Codex room, ★ "One
codex, three editor modes"). Its first round ran read-only
(`docs/rounds/2026-09-28-codex-source-check.md`); the second round is
`docs/rounds/2026-09-28-codex-2.md`. AJ approved the new data "all yes" on Sep 28
2026, and ruled that the nineteen line corrections in the source check are the
administrators' to make in the catalog editor, not in code.

## The format, v2 (Codex R2)

`types/machines.ts` ("THE CODEX FORMAT, v2") holds the fields. Every one is
OPTIONAL and nothing earlier is renamed: machine ids and dial keys never change,
so every client's saved settings keep working, and a definition written before
v2 reads exactly as before (`codexFieldsOf` in
`features/admin/machines/definition-defaults.ts` gives it no v2 key at all).

The page reads a machine as the timeline of a set, twelve **leaves**:

| # | Leaf | v2 fields | Fields it already had |
| --- | --- | --- | --- |
| 1 | Stop | `stopRules`, `watchOuts` | `clinicalWarnings`, `contraindicatedFor`, `execution.neverToFailure` + `safetyNotice` |
| 2 | Set up | `setUp`, `dialRules` | `universalBaseline`, `settingFields`, `defaultSettings` |
| 3 | Get set | `getSet` | `executionPosture`, `alignmentCheckpoints` |
| 4 | Begin | `begin` | `execution.loadUpProtocol`, `handoffProtocol`, `handoffCue` |
| 5 | The rep | `rep` | `execution`'s cadence, both turnarounds, `keyCues` |
| 6 | Finish | `finish` | — |
| 7 | If something goes wrong | `ifWrong` | — |
| 8 | Adapt | `adapt` | `bodyTypeAdjustments` |
| 9 | Program it | `program` | `sequencingContraindications` |
| 10 | Faults and fixes | `faults` | — |
| 11 | Understand | `understand` | `musculature`, `biomechanicalNotes`, `clinicalNote` |
| 12 | On our floor | computed — nothing stored | machine trends, set data |

Beside the leaves:

- **Each dial's rule and number.** The RULE is the body landmark a dial is set
  against (`dialRules[key].rule`, method); the NUMBER is where it lands on this
  unit (`defaultSettings[key]`); the dial's `letter` ("G", "P", "SP") and its
  `callout` on the drawing are the unit's, on `settingFields`. The letter is a
  label, never a key.
- **The switches.** The blueprint names seven. Three already had a field and are
  read from it — `beginsWith` from `execution.requiresHandoff`, `upperTurn` from
  `execution.upperTurnaround.style`, never to failure from
  `execution.neverToFailure` — and the other four are `switches` (`lowerTurn`,
  `repCap`, `tscCapable`, `unloadTransfer`). One source for each, so two can
  never disagree.
- **Sources.** `sources` is one record per method line: a field path, and for a
  list the entry's words; where it comes from — `academy` (a file under
  `docs/msf-academy`), `guide` (only the standardized setup guides), `book`
  (paraphrased with a reference, never quoted: AJ on *The Renaissance of
  Exercise*), or `unsourced`; and `conflict` where another source disagrees
  ("Corporate to rule").
- **`modelId`.** The model a definition describes (`machineModels/{id}`, the
  model record). A studio's copy names its unit's model on the roster entry, and
  never inherits the catalog's.

## The model record (Codex R2)

`machineModels/{modelId}` — **exactly** `{ brand, model, movementId, dials?, notes?,
updatedAt, updatedBy }` (`MachineModel` in `types/machines.ts`; the Catalog's model
tier reads it). A seat 4 on a Nautilus is not a seat 4 on a Hoist: a model is the
tier between the movement (`movementId`, a catalog machine id) and the unit, the
dials and stacks every unit of one maker's model shares, written once.

- **Administrators write it; everyone signed in reads it; nobody deletes it**
  (firestore.rules, "WAVE 2 CODEX: the model record"). Written whole with `setDoc`
  and no merge, so a note or a dial removed in the editor leaves the record; the
  rules pin `updatedAt` to the request time and `updatedBy` to the Auth uid.
- **The id is minted once** from the brand and model (`modelIdFor`, `mm-…`) and
  never re-minted: it is a foreign key on every unit that names it and in the
  weekly job's pools. A dial keeps its key, like the movement's own dials.
- **A unit names its model** on its roster entry (`RosterEntryBase.modelId`), set
  by the studio's leaders in the machine editor's "Which model this unit is". A
  copy of a catalog machine never takes the catalog's own `modelId` (that is the
  reference unit the standard was written on): `resolveMachine` gives a
  `ResolvedMachine` only the unit's model.
- **Where it is edited:** Admins → Catalog → **Models** (every model, by movement),
  or a catalog machine's **Models** button (that movement's models).
  `features/admin/machines/models/`.

## Files

| | |
| --- | --- |
| `format.ts` | The one reader of the format: `CODEX_LEAVES`, `switchesOf` + `switchWords`, `presetOf` + `presetLine` (the preset strip), `stopLinesOf` (never to failure with its reason, then the stop rules), `methodLines` (every method line with its source), `sourceLabel`, `sourceCoverage` + `coverageSentence`. Pure. |
| `models.ts` | The model record: `modelIdFor` (minted once), `modelLabel`, `modelProblems` (what stops a save, named), `modelDocument` (exactly the shape), `dialsFromMovement`, `modelsFor`, `dialSummary`. Pure. |
| `change-log.ts`, `change-log-store.ts` | The standard's change log: the record and its sentence (pure), then the one writer and the read. |
| `models-store.ts` | Its reads — `useMachineModels` (live, for the editors), `fetchMachineModels` / `useMachineModelsOnce` (once a session, for a screen that only names a model; a failed read stays failed) — and its one write, `saveMachineModel`. |

## The change log (catalog wave 3, Sep 29 2026)

`machines/{id}/changes/{changeId}` = `{ at, by: { uid, name }, kind: "created" |
"edited", fields: [...] }` — one document per save of the catalog editor, the
DEFINITION FIELDS it wrote and never their values (they are on the machine).
`change-log.ts` is the record (`changedFields`, `changeDocument`, `changesOf`,
`changeSentence` in `FIELD_LABELS`' words, `changeWhen`); `change-log-store.ts`
is its one writer, `recordMachineChange` (signed by `who.ts`, after the
machine's own write, never throwing, never awaited by the save), and its read,
one `getDocs` with no `orderBy` (no index) sorted on the iPad, once per page
open while the fold is open. Read on the machine's Catalog page — the floor's
and All MSF's — as **What changed** (`catalog/MachineChangeLog.tsx`) by anyone
signed in; created by administrators only; never updated or deleted (the rules
say so). An empty log says the record began on Sep 29 2026, never "never
changed". A studio's own machine has no standard, so no log.

## How a studio's copy merges

`lib/resolve-machine.ts` (the one merge policy): an object leaf, the switches and
the dials' rules merge **per key**, so a studio correcting one line keeps
inheriting head office's corrections to the others (the bag-of-values trap in
`docs/KNOWN-TRAPS.md`). `stopRules` and `watchOuts` are **additive**, like
`clinicalWarnings` — deduped on their words and condition, the catalog's entry
winning a collision. `sources` merge per line. The other lists (`ifWrong`,
`faults`) replace whole, like `keyCues`.

## In the editor

`features/admin/machines/editor/codex-sections.tsx`: four optional sections after
the eight — *Codex: at the machine*, *Codex: the set and after*, *Codex: study*,
*Sources*. Nothing in them is a gap, so the completeness meter, the catalog
list's "still missing" line and the catalog gate read exactly as before.
