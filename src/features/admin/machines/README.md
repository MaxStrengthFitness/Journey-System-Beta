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

## What a studio may change — the Sep 21 rule (built Sep 28 2026)

**A studio may change anything on its own copy, safety included** (AJ: "Yes
studios need to be able to customize their stuff safety is definitely a worry but
are trusted"). A change reaches that studio's floor only. Taking one of Max
Strength's safety lines off needs a **reason** (at least 3 characters): the editor
asks for it in place (`editor/safety-removal.tsx`), the record carries who and
when (`overrides.removedSafety`), and a removal without one is refused by
`scopeOverrides` and by firestore.rules (`removedSafetyValid`, which checks the first 10 places). **No count limit** since Oct 2 2026 (AJ), and **a removed line is shown, crossed out and faded with the reason, on that unit's Catalog page** (`catalog/MachineArticle.tsx`, `RemovedLines`), never hidden.
Head office sees every studio's differences, and every reason, in **Compare**
(`compare/`, a catalog machine's Compare button; administrators only). A safety
list on a copy is stored as the studio's additions only; `execution` and
`musculature` merge per key now that a studio may write them.

The tiers below still say whose words a field is (and how Compare groups a
difference); they no longer decide what a studio may write.

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
| `AdminMachinesTab.tsx` | Admins → Standard → Machines (Admins → Catalog until the Admins room, Sep 28 2026). Holds which machine is open; the editor REPLACES the screen. |
| `CatalogList.tsx` | The rows: display order, what each machine is still missing, standard-set, retire. |
| `CatalogMachineEditor.tsx` | Writing the standard itself. No `standard` prop — this IS it. Above the sections of a machine that exists: its standing (`../catalog/StandardMachineSwitch.tsx`, wave 2, Sep 28 2026) — **Standard machine**, administrators only, written at once and apart from the save bar. An edit's save writes the definition's diff and never the catalog's own fields (`status`, `defaultOrder`, `inStandardSet`), which go in once, on create. |
| `../catalog/StandardMachineSwitch.tsx` | The switch that marks a machine as a standard machine: the Standard template's own write and words (`standard-set.ts`: `standardSetPatch`, `standardSetSaid`, `takeOutQuestion`), so the two doors can't drift. |
| `../catalog/MachineAliases.tsx` | "Other names": the names Find already knows for one of the twenty movements, and head office's own (`aliases` on the catalog document), added and taken off at once (`arrayUnion` / `arrayRemove`). A name that says nothing new or already means another movement is refused in words (`features/catalog/names.ts`, `aliasProblem`). `definitionOf` strips `aliases`. |
| `StudioMachineEditor.tsx` | A studio's copy, or its own machine. Writes a DIFF for the former, the whole definition for the latter. |
| `StudioInventoryManager.tsx` | The floor list. Mounted by My Studio → Machines, Operations → Floor and Admins → All locations → Equipment — one implementation, three doors. **Out of service asks why** (wave 2, Sep 28 2026): `OutOfServiceDialog.tsx`, then one `updateDoc` of `status: "maintenance"` and a signed `outOfService` (`features/catalog/out-of-service.ts`); Back in service, or We don't have this, takes it off. The reason shows under the machine's name. **We don't have this never deletes** (AJ, Oct 2 2026): a studio's own machine is retired (`status: "inactive"`) exactly as a copy of an MSF one is, so past sessions keep its name, and Add from MSF → "Switched off at {studio}" brings it back; `firestore.rules` refuses deleting a roster entry whose `source` is `custom`, for everyone. |
| `floor-editor.ts`, `AddFromMsfDialog.tsx` | Wave 2 (Catalog R5): the list is the FLOOR (on the roster, not switched off); **Walking order** moves a machine up or down or by drag; **Add from MSF** offers the standard's machines first, then the catalog, then what the studio switched off (a machine added joins the end of an order the studio keeps; a new entry is created with its identity, a switched-off one only has its status changed); **New machine** is the studio machine editor until the Codex's Guided forge exists. We don't have this is an `updateDoc` of the status alone. |
| `OutOfServiceDialog.tsx` | "Why is it out of service?" — a few words (1 to 140 characters, the rules' number), typing registered with the unsaved-changes guard. Writes nothing itself. |
| `editor/MachineEditor.tsx` | The screen: masthead, section rail, pinned warnings, save bar. |
| `editor/sections.tsx` | The eight sections, each in prose or inputs from one source. |
| `editor/controls.tsx` | The inputs. `FieldShell` says inherited-vs-changed per field. |
| `completeness.ts` | "What is this machine still missing", named in plain English. Every check has a typed `GapId` so code can block on a specific one without matching prose. |
| `editor/codex-sections.tsx` | The Codex format, v2 (Sep 28 2026): four OPTIONAL sections after the eight — at the machine, the set and after, study, sources. No gaps, so completeness and the catalog gate are untouched. The format itself: `features/machine-codex/README.md`. |
| `editor/codex-controls.tsx` | Their controls: `RecordList` (a list of small records from a field description), `LeafLine`, `withLine` (a cleared line is deleted, not stored as ""). |
| `models/ModelsPage.tsx`, `models/ModelEditor.tsx` | The model record (Codex R2): Admins → Standard → Machines → Models, and a catalog machine's Models button. Administrators only; the id is minted once. |
| `models/ModelPicker.tsx` | "Which model this unit is" (a studio's machine) / "The reference model" (the standard), at the top of *Codex: at the machine*. A studio's pick is written on the roster entry's own `modelId`, never into its overrides. |
| `../catalog/review.ts` | What a studio's offer would cost the catalog — the method it wrote, what is still missing, what differs from the machine it is based on. |
| `../catalog/SubmissionReview.tsx` | That offer opened in this editor, at `scope="catalog"`. Saving records a correction on the offer; it does not publish. |
| `definition-defaults.ts` | The blank definition and the normaliser for untyped stored docs. `codexFieldsOf` reads the v2 fields — well-formed or not at all, so an old definition reads exactly as before — and `stripUndefined` readies a write (Firestore refuses `undefined`; the catalog save turns a field cleared to nothing into a delete). |

## The editor round that has not happened yet

AJ, Sep 21 2026, on what the editor should be. The complaint first, because it
has a one-tap cause:

> "if you go to create a machine or edit a machine you are shown a large
> amount of questions and nothing's filled in **even if you edit a machine
> that has data filled out for it** … I'm not sure if it even interacts with
> the catalog at all."

**That was the legacy-shape problem, not an editor bug** — see the first
trap below. Admin → System tools → *Restore standard machines* rewrote the
catalog documents into the shape the editor reads; it was taken out on Sep 28
2026 (AJ: "we dont need to restore standard machine button, a machine just
needs to be able to be marked as a standard machine, a task only by admins"),
because it wrote the generated file over every catalog document and undid an
administrator's corrections with it. A machine that still opens near-empty is
a document in the old shape: fill it in the editor (what is saved is what
the floor reads), and **check the document's shape before designing
anything.** Marking a machine as a standard machine is the **Standard
machine** switch on its own page in this editor (wave 2, Sep 28 2026).

What he wants it to become, and where each piece stands:

| Ask | State |
| --- | --- |
| The anatomical muscle picker | **built** — `sections.tsx`, wired to `primaryMuscles` and the diagram |
| Safety notes, set-up notes, cues, advice to other trainers, kinematics, muscle groups | **built** — the eight Academy sections |
| Trainers, leaders and admins all authoring | **partly** — `firestore.rules` allows create/update on `machines/{id}` to `isSuperAdmin()` only. A trainer contributes studio notes and tips, or a whole offered machine, but not a field on the catalog entry. Worth revisiting: the middle ground is a trainer *proposing* a field the way a studio proposes a machine |
| **Duplicate a machine** | **not built.** The remodel case: "the seated dip just got a bigger seat and different handles" needs its own settings and nothing else changes. Copy → paste → edit the differences. This is also the answer to recording brand and model: a variant IS a copy with its own hardware fields |
| **Drafts — start one, finish later** | **not built, but half there.** `CatalogStatus` already has `draft` and `CatalogList` already draws the badge; there is no way to reach it. Needs "save and finish later" and a sense of what the draft still needs |
| **A staged form rather than sixty fields at once** | **not built.** `completeness.ts` already knows which checks matter (and `catalog/review.ts` names the eleven that gate a publish) — it just isn't used to shape the path through the form. "Get it usable", then "make it good", same fields, kinder order |

The through-line in all of it: **the information is not the problem, the path
through it is.** Do not answer this by removing fields.

## Things that bite

They are in `docs/KNOWN-TRAPS.md` under **Machines and the template boundary** —
read that before changing anything here. The short list:

- Never re-mint `machineId`, or `MachineSettingField.key`. Both are foreign keys.
- Write overrides with `updateDoc`, never `setDoc` merge.
- An edit never writes what a machine is (`source`, `basedOn`) or `status`.
  Local set-up did, and a studio's own machine vanished from the floor
  (`equipment/clone.ts`, `localSetupUpdate`; Sep 28 2026). It is for a Max
  Strength machine only: a studio's own is changed in `StudioMachineEditor`.
- Compute overrides from the whole draft, not from the save patch.
- `isStandardSetMachine` treats an absent flag as in-the-set.
- Don't let a blank definition guess a region or a movement pattern.

## The data

`src/data/machine-definitions.ts` holds all twenty and is **generated** — run
`npx tsx scripts/generate-machine-definitions.ts` from the repo root rather than
hand-editing it. The prose is the MSF Academy's, lifted verbatim from
`docs/msf-academy/Set Up Machines/`. It is the SEED and the fallback (Demo
Mode, tests), never the live catalog: since Sep 28 2026 nothing in the app
writes it into `machines/{id}`, and a correction to the live catalog is made
in this editor. AJ's ruling of Sep 28 2026 on the codex source check's
nineteen line corrections: administrators make them here, in the catalog
editor, not in code.
