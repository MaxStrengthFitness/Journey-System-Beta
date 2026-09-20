# Machine authoring — the catalog filled, the editor as a screen, and the studios' own machines

**Branch** `machine-authoring` · **Sep 19–20, 2026** · seven commits, one per phase

AJ, Sep 19:

> Currently, the way that we can edit machines is very vague. When we go into
> operations and we go into admin and then we go into the catalog and we edit
> machine, nothing is actually filled out for the machine, so we have to just
> refill everything out. … How the machines look in that catalog for the admin
> dashboard looks kind of bad. And then also when you're looking at your own
> floor for your studio, it doesn't seem as if we can edit the machine.
>
> Max Strength Fitness is a company that started out. They have three corporate
> locations. They decided to franchise out where people replicate it and open up
> another one elsewhere. Max Strength has the template. Other studios fulfill it.

---

## What was actually wrong

**The editor was never broken. The data was in the old shape.**

`machines/{id}` is written by Operations → System Tools → "Restore standard
machines", which seeded from `data/default-machines.ts` — the legacy `Machine`
type, where target muscles are one comma string and `settingOptions` is a list
of bare labels. The Machine Creator reads `MachineDefinition`: `musculature`,
`settingFields`, `universalBaseline`, the whole biomechanics template. Different
field names, so opening Edit on a real machine filled about **6 of 60 inputs**.

Worse than blank: `emptyMachineDefinition()` defaulted `movementPattern` to
`"Upper Body: Horizontal Push"`, and no catalog document had one of its own — so
**all twenty machines, leg press included, showed that**, and saving wrote it in.
A confident wrong value, which is the one thing this app says it will not ship.

**The studio doors were never cut.** Two separate holes:

- A **custom** machine could not be edited at all once saved. `saveCustom()`
  refused an existing name, and nothing anywhere reopened the form on an
  existing entry. Changing a studio's own machine meant deleting it and
  retyping sixty fields.
- A **catalog** machine's local copy could override exactly one field, its
  name. `LocalSetupDialog` was the app's only writer of `overrides` and it wrote
  four things — while `RosterEntryFromCatalog.overrides` allowed any field,
  `mergeMachineDefinition` merged any field, and `MachineDefinitionForm` had an
  `inherited` prop built for precisely this that no caller ever passed.

**The architecture was already the franchise model.** Catalog = the Max Strength
template. Roster overrides = how a location fulfils it. `basedOn` = lineage so
cross-studio numbers stay comparable. Nothing needed inventing; the middle layer
just had no UI.

---

## The template boundary — `src/lib/machine-template.ts`

AJ's call: **corporate owns the method, a studio owns its hardware.**

| tier | fields | who |
| --- | --- | --- |
| **studio** | `name`, `shortName`, `universalBaseline`, `bodyTypeAdjustments`, `settingFields`, `defaultSettings`, `baselineLoad`, `imageUrl`, `formVideoUrl` | the location — this is the unit in their room |
| **additive** | `clinicalWarnings`, `contraindicatedFor`, `sequencingContraindications`, `alignmentCheckpoints` | a studio may ADD; the catalog's own can never be removed |
| **method** | musculature, movement pattern, kinematics, posture, clinical note, `execution` (handoff, load-up, cadence, both turnarounds, cues, never-to-failure), biomechanics notes | Max Strength — every location reads the same words |

Method is the **remainder**, deliberately: a field added to `MachineDefinition`
later and named in neither list lands on the corporate side, so the failure mode
of forgetting is "the standard held", never "every location may quietly rewrite
the new thing". `machine-template.test.ts` fails until the new field is named,
so the decision is made in writing.

`scopeOverrides(scope, overrides)` is the last gate before a roster write. The
editor already hides what a studio may not touch, so in normal use it removes
nothing — which is the point of having it. A stale draft, a copied object or a
future call site that forgets cannot carry the company's cadence out the door.
Firestore rules would be stronger, but validating a nested partial there costs
expressions we have run out of once already (the sessions read rule).

**An admin is not bound.** That is what makes the boundary safe to enforce on
studios: corporate can always reach into a location and fix anything.

### A merge bug found on the way

`universalBaseline` and `bodyTypeAdjustments` are bags of independent values, and
overriding one **replaced the whole object**. A studio correcting a single seat
position stopped live-inheriting the other four baseline lines *forever* — an
admin later fixing the axis-alignment text would reach every location except the
ones that once edited a seat height, and nobody would ever see it happen.

They now merge per key, the way `defaultSettings` already did and for the same
reason, with `""` as a deliberate clear. `pruneOverrides` reduces an override to
the sub-keys that actually differ, which is the write-side half and useless
without it.

---

## The twenty machines, filled from the Academy

`scripts/generate-machine-definitions.ts` parses the four standardized setup
guides — 20 machines under five fixed headings that map 1:1 onto the template —
and joins them with `machine-anatomy-map.ts`, `machine-database.ts` and
`default-machines.ts`, emitting a checked-in, typechecked
`src/data/machine-definitions.ts`.

**The prose is lifted verbatim by the parser**, citation markers stripped. No
model retypes a clinical sentence; the only judgement in the script is which
field a labelled bullet belongs in. Re-runnable, and the output is typechecked,
so a bad parse fails the build rather than reaching a trainer.

Three calls worth knowing:

- **Kinematic class comes from MSF's own vocabulary** (Compound = multi-joint,
  Simple = single-joint), *not* from the turnaround protocol. The Academy gives
  the **compound row** a 1–2 second pause and a 2–3 second squeeze at the
  contracted position; deriving the class from that would have relabelled the
  row, the pulldown and the pullover as single-joint movements and split every
  cross-studio roll-up. The protocol is stored exactly as the guide writes it.
- **Never-to-failure** lands on Lumbar Extension and Cervical Extension and
  nowhere else, structured so the session UI can enforce it rather than display
  it, and each carries the safety notice that explains why.
- **Anything the sources do not state is left empty** — dial defaults on 11 of
  20, synergist `MuscleId`s, secondary musculature on 19 of 20 (the corpus
  labels "Secondary Muscles" exactly once). The completeness meter asks for
  those; a guess would have filled them.

`imageUrl` is deliberately *not* generated: the app resolves it through Vite, and
the generator bundles the data files with a text loader, so reading it there
yields the `.webp`'s bytes. `MachineDefinition.imageUrl` is now a studio-tier
field, for a photo of the unit in their room.

"Restore standard machines" seeds from this file. `merge: true` stays, so legacy
keys are left on the document rather than stripped — `adapters.ts` still falls
back to `trainerTips`, and a write with no reader is a bug to fix, not a field to
delete.

---

## The editor is a screen

It replaces a Radix dialog at `sm:max-w-5xl` holding ~60 inputs and 57 muscle
chips in one scroll, with a sticky footer inside a fixed scroller — the iOS case
where the keyboard opens and Save disappears. The chips were 22px, on a screen
operated one-thumbed while the other hand holds the iPad.

The shape is the machine's own page: a masthead, a **section rail** with each
section's state as a dot, the Academy template's eight sections in its own order,
and the clinical warnings and never-to-failure **pinned above everything** where
they cannot be scrolled past — the rule `MachineArticle` already follows on the
reading side.

**Every section renders as prose or as inputs from one source**, and which one
you get is the answer to who owns the field. A studio reads Max Strength's
cadence with a lock on it; an admin gets inputs. Keeping both in one file is what
stops them drifting: a field added to the editor and forgotten in a separate
preview is a field the floor never learns about. The masthead's **"Read it as a
trainer"** toggle is that same prose path, so an admin sees the floor's view
without a second implementation.

`FieldShell` says the merge out loud, per field: this line is the standard, that
one you changed, and here is the way back. Only a **difference** is marked —
twenty "Standard" badges on one screen is noise. The baseline marks per *line*,
not per object, because it merges per key.

Nothing interactive is under 40px.

---

## The catalog list

Four things were wrong at once: two headings forty pixels apart, two design
systems on one tab (adm rows above, shadcn Cards below), the raw Firestore id in
a mono badge beside every name, and a meta line that was mostly wrong next to an
order that was effectively random — both because the documents were legacy-shaped
and had neither `movementPattern` nor `defaultOrder`, so all twenty tied at 999
and fell back to snapshot order.

Now one 48px adm row per machine, ordered by `resolveMachineOrder`, and **each
row says what that machine is still missing**. That is the real change: twenty
identical rows gave a manager no way to see the leg press had no baseline
without opening it.

The Standard-set control also contradicted the code. It read
`checked={m.inStandardSet}` and showed OFF for all twenty legacy documents, while
`isStandardSetMachine` treats an **absent** flag as in-the-set — the switch said
one thing and the seeder did another. It reads through that function now and
writes an explicit `false` to take a machine out.

---

## The studio doors

`StudioMachineEditor` covers all three cases; only the write differs.

- **A custom machine** stores its whole definition (it inherits nothing).
- **A catalog copy** stores the *difference* from the standard, computed from the
  whole draft rather than this sitting's patch — computing it from the patch
  would drop every override made in an earlier sitting.
- It writes with `updateDoc`, **not** `setDoc` merge. Firestore merges maps
  deeply, so a merge write would keep a key the studio had just reverted:
  "use the standard" would appear to work and then silently not.
- **The id is minted once.** `machineId` is a foreign key in `exerciseLogs`,
  `clientMachineSettings` and `routines`, all queried across studios. Re-minting
  it on a rename would orphan every set ever logged on the machine and split its
  leaderboard in two.

Admins → All locations → Equipment mounts the same editor with `scope="admin"`
and no locks.

---

## `useDirtyForm.save()` never actually saved

Found here, not caused here, and worth reading on its own. It read its live state
from inside a `setState` updater and acted on a flag that updater set:

```ts
let proceed = false;
setState((prev) => { …; proceed = true; return beginSave(prev); });
if (!proceed) return false;
```

React does not promise an updater runs synchronously — inside an event handler it
normally runs during the next render, so `proceed` is still `false` when it is
checked and the function returns without calling `onSave`, while the updater,
running later, still moves the bar to "Saving…". The eager-evaluation path that
made this appear to work is defeated by StrictMode's double render, which
`src/main.tsx` turns on.

The symptom is exactly what `SaveBar` exists to prevent: the bar says Saving…,
nothing is written, and nothing ever says so. **Five screens use this hook** —
Renewals settings, Studio details, My Studio → Studio.

Now read through a ref, with the save claimed on that ref before awaiting so the
two-quick-taps guard still holds. `useDirtyForm.render.test.tsx` mounts it,
because a pure test cannot see the bug.

---

## Verified

| | |
| --- | --- |
| Typecheck | **10** (baseline was 11; the retired `MachineDefinitionForm.tsx` carried one) |
| Tests | **3,516 passing in 237 files**, 1 skipped (baseline 3,469 in 232) |
| Build | green |
| Rules tests | not run — needs JDK 21 on AJ's PC. **Nothing in this round touches `firestore.rules`.** |

---

## For AJ

1. **Run "Restore standard machines"** — Admin → System tools. That is the write
   path; it is one tap and admin-only. Until it runs, the catalog documents are
   still legacy-shaped and the editor will still look sparse.
2. **Two files are emptied, not deleted** — `AdminMachineCreator.tsx` and
   `MachineDefinitionForm.tsx`. This working copy is on a mount where Claude
   cannot delete files. Nothing imports either; delete them when convenient.
3. **The machine names are unchanged.** The catalog still says `CX (4 WAY NECK)`,
   `BICEP`, `SEATED ABDOMINALS`; the Academy calls them Cervical Extension,
   Biceps Curl, Abdominals. Renaming twenty machines is a visible change that
   was not asked for — say the word and it is a one-line change to the
   generator.
4. **Not yet built:** the rules do not enforce the template boundary (the app
   does, at the write). Worth doing before trainers are on it, and it wants care
   with the expression budget.
