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

## Files

| | |
| --- | --- |
| `format.ts` | The one reader of the format: `CODEX_LEAVES`, `switchesOf` + `switchWords`, `presetOf` + `presetLine` (the preset strip), `stopLinesOf` (never to failure with its reason, then the stop rules), `methodLines` (every method line with its source), `sourceLabel`, `sourceCoverage` + `coverageSentence`. Pure. |

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
