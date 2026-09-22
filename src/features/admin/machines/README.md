# Machines — the catalog, the editor, and a studio's own floor

Round: **machine authoring, Sep 2026** (`docs/rounds/2026-09-20-machine-authoring.md`).

## The three layers

1. `machines/{machineId}` — the **Max Strength standard**. Admin-write only.
2. `studios/{studioId}/roster/{machineId}` — what **this location** has: either a
   copy of a catalog machine with `overrides`, or its own `custom` definition.
3. `clientMachineSettings` — one client's values on the studio's machine, plus
   anything noted about that client in regard to it.

**Layers 1 and 2 merge; layer 3 is attached, which is a different relationship**
(AJ, Sep 21 2026). A client never has a machine of their own. What exists is
*information about a client on the studio's machine* — their settings, and the
notes a trainer references when walking up to it. So layer 3 is keyed by
(client, machine) and hangs off the resolved machine; it is not a third
definition to be merged into one, and a feature that treats it as one will
produce a per-client machine, which is wrong.

`src/lib/resolve-machine.ts` collapses 1 + 2 into the `ResolvedMachine` every
screen renders. Nothing here reads two layers and picks a winner.

### The catalog is the join, not just the reference

AJ, Sep 21 2026 — the reason the layers are worth their complexity. Four
studios own four different leg presses: a Hoist, a Nautilus, a newer Hoist, an
Imagine Strength with a yoga block beside it. Different dimensions, different
dials, different seat numbers. Because every one of them is a copy of the
**same catalog entry** and keeps `basedOn`, their settings and their results
pool into one population that can actually be asked a question —
`features/machine-fit/` is the whole feature built on that ("is anyone here
sitting somewhere odd?").

Take the shared entry away and there is no question to ask: forty unrelated
"leg press" records and nothing to compare. **A studio diverging does not break
this** — an override is a difference against a known machine, and the lineage
survives it. That is the point of the design, not a side effect: imperfect
per-studio data, refined into something a trainer can use. There is rarely a
single setting right for every client, and the value is in finding the outlier
worth fixing.

This is the second reason never to re-mint a `machineId` (the first being
orphaned `exerciseLogs`): re-minting silently splits one machine's population
in two, and nothing fails loudly when it happens.

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
