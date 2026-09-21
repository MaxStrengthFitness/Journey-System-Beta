# Machines — the catalog, the editor, and a studio's own floor

Round: **machine authoring, Sep 2026** (`docs/rounds/2026-09-20-machine-authoring.md`).

## The three layers

1. `machines/{machineId}` — the **Max Strength standard**. Admin-write only.
2. `studios/{studioId}/roster/{machineId}` — what **this location** has: either a
   copy of a catalog machine with `overrides`, or its own `custom` definition.
3. `clientMachineSettings` — one client's values.

`src/lib/resolve-machine.ts` collapses 1 + 2 into the `ResolvedMachine` every
screen renders. Nothing here reads two layers and picks a winner.

## What a studio may change

`src/lib/machine-template.ts` is the one answer, and it is a product rule, not a
technical one: **Max Strength owns the method, a studio owns its hardware.**

- **studio** — name, baseline positions, body-type adjustments, the dials and
  their defaults, starting load, a photo of their unit.
- **additive** — clinical warnings, contraindications, sequencing, alignment
  checkpoints. A studio may add; the catalog's own never go away.
- **method** — musculature, movement pattern, kinematics, posture, clinical
  note, the whole `execution` block. Read-only to a studio.

Method is the **remainder**, so a field added later and named in neither list is
corporate by default. `machine-template.test.ts` fails until you name it.

An **admin** is not bound — that is what makes the boundary safe to enforce.

## A fourth layer: an offer becoming the standard

A studio's OWN machine (`source: "custom"`) inherits nothing, so it stores a
whole definition — method included — and that is correct while it is theirs
alone. Offering it to the catalog is the one path where a studio's wording of
the method can become Max Strength's, so it is the one path with a person in
it: **read the machine, correct it, then publish** (the catalog gate round,
`docs/rounds/2026-09-20-catalog-gate.md`).

- The boundary cannot help here. Stripping the method off a submission would
  publish a machine with no cadence, which is worse than publishing a
  studio's. The answer is a review, not a filter.
- `publishPlan` refuses a machine missing anything the app would render wrong
  or the floor would coach wrong. The list is `BLOCKING_GAPS`, and a test
  pins it to what the twenty MSF machines themselves clear.
- Publishing sends `definitionUnderReview()` — corporate's corrections if
  any, what arrived if none. Never read the raw document.

## The files

| | |
| --- | --- |
| `AdminMachinesTab.tsx` | Admins → Catalog. Holds which machine is open; the editor REPLACES the screen. |
| `CatalogList.tsx` | The rows: display order, what each machine is still missing, standard-set, retire. |
| `CatalogMachineEditor.tsx` | Writing the standard itself. No `standard` prop — this IS it. |
| `StudioMachineEditor.tsx` | A studio's copy, or its own machine. Writes a DIFF for the former, the whole definition for the latter. |
| `StudioInventoryManager.tsx` | The floor list. Mounted by My Studio → Machines, Operations → Floor and Admins → All locations → Equipment — one implementation, three doors. |
| `editor/MachineEditor.tsx` | The screen: masthead, section rail, pinned warnings, save bar. |
| `editor/sections.tsx` | The eight sections, each in prose or inputs from one source. |
| `editor/controls.tsx` | The inputs. `FieldShell` says inherited-vs-changed per field. |
| `completeness.ts` | "What is this machine still missing", named in plain English. Every check has a typed `GapId` so code can block on a specific one without matching prose. |
| `../catalog/review.ts` | What a studio's offer would cost the catalog — the method it wrote, what is still missing, what differs from the machine it is based on. |
| `../catalog/SubmissionReview.tsx` | That offer opened in this editor, at `scope="catalog"`. Saving records a correction on the offer; it does not publish. |
| `definition-defaults.ts` | The blank definition and the normaliser for untyped stored docs. |

## Things that bite

They are in `docs/KNOWN-TRAPS.md` under **Machines and the template boundary** —
read that before changing anything here. The short list:

- Never re-mint `machineId`, or `MachineSettingField.key`. Both are foreign keys.
- Write overrides with `updateDoc`, never `setDoc` merge.
- Compute overrides from the whole draft, not from the save patch.
- `isStandardSetMachine` treats an absent flag as in-the-set.
- Don't let a blank definition guess a region or a movement pattern.

## The data

`src/data/machine-definitions.ts` holds all twenty and is **generated** — run
`npx tsx scripts/generate-machine-definitions.ts` from the repo root rather than
hand-editing it. The prose is the MSF Academy's, lifted verbatim from
`docs/msf-academy/Set Up Machines/`.
