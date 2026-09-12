# features/machine-db — the MSF machine database

Round: Learning + Planner, Sep 2026. AJ asked for this:

> "studio should 100% be able to make machines and add them to the database but I think we just need to have a overall all MSF machines, then studios can adopt machines from this machine database and then studios can also grab information submitted by other studios about the machine and read the catalog"

He chose **the studio picks, each time**: a "Share with all MSF studios" switch on each machine, each note and each tip. Anything not switched on stays with its studio.

## What a trainer sees

The Learning tab's **Catalog** has two scopes, switched above the index title:

- **At {studio}** — the studio's own floor. This is the Catalog as it was, with two additions to each machine page:
  - **From other MSF studios**: what other studios shared about this machine.
  - The share switches on the studio's own note, its playbook tips, and — for a machine the studio made — the machine itself.
- **All MSF machines** — every machine in the MSF catalog, plus every machine a studio made and shared.
  - It has the same index as the floor: contents, groups, one row per machine with its Academy code. Badges show **On your floor** and **the sharing studio**.
  - Each machine has its own page: the machine as the network knows it, and what other studios shared about it.
  - The page shows whether this studio has the machine. If it doesn't, the studio's leaders get **Add to {studio}'s floor**.

The Learning Overview links to All MSF machines under the Catalog's tiles.

## The rules

| What | Where it lives | Who switches Share |
| --- | --- | --- |
| A studio's own machine | `studios/{s}/roster/{id}` (`source: "custom"`) → `shared`, `sharedStudioName` | The studio's leaders (the roster rule) |
| The studio's note on a machine | `studios/{s}/wiki/machine__{id}` (overlay) → `shared`, `sharedKeys`, `studioName` | Anyone at the studio (they can already edit it) |
| A playbook tip | `studios/{s}/playbook/{id}` → `shared`, `sharedKeys`, `studioName` | Its author, or a leader (the playbook rule) |

- **Nothing is copied to share it.** The studio's own document is marked. Switching Share off takes it out of every other studio's view at once.
- **Other studios read it with collection-group queries.** They filter on `shared == true` (plus, for notes and tips, `sharedKeys array-contains` the machine's lineage). The `{path=**}` rules in `firestore.rules` pass only a query filtered on `shared == true`, so nothing unshared can be listed.
- **Only a studio's own machine can be listed** (`rosterShareValid`):
  - an MSF machine is already in the database;
  - a copy adopted from another studio is listed by its original.
- **Notes and tips never carry a client.** The rules already refused `clientId` on both collections, which is what makes it safe to show them to every studio.

## Adopting

| From | Writes to this studio's roster |
| --- | --- |
| An MSF machine | `source: "catalog"`, `basedOn` = the MSF id — exactly what the Equipment panel writes, live-inheriting the catalog. A machine once switched off comes back with its old local setup (merge). |
| A studio's machine | A **copy**: `source: "custom"`, a new id `sm-{thisStudio}-{slug}` (suffixed on a clash), the original's `definition`, `basedOn` = the original's lineage, `adoptedFrom` = where it came from. |

- **Why a copy under a new id.** Machine ids are foreign keys in logs, settings and routines, and they are queried across studios. Two studios logging under one id would merge their numbers on the leaderboard.
- **What the copy keeps.** Its lineage (`basedOn`), so cross-studio roll-ups still compare like with like, and so anything shared about the original shows on the copy (see Lineage below).
- **Refused when the studio has no roster yet.** Until a roster exists, the Catalog shows every MSF machine as the studio's own. Adding one machine would make that one the whole floor and hide the rest, so the page instead points to Operations → Studios → Equipment.
- **Refused for a retired MSF machine.** Its page can still be read.

## Lineage — how shared notes find a machine

Notes and tips are filed under `sharedKeys`: the **lineage** of each machine they are about. This is `comparisonKey` from `lib/resolve-machine.ts`: the MSF id for an MSF machine, and `basedOn ?? machineId` for a studio's own.

A machine page queries its own lineage. So a tip about Westlake's copy of Solon's sled is filed under Solon's sled, and shows on both studios' pages. `sharedKeysFor()` computes the keys when Share is switched on.

## Deploy

- Two new composite collection-group indexes, `playbook` and `wiki` (`shared` + `sharedKeys` contains).
- One field override: `roster.shared`, collection-group ascending, listed alongside the default collection-scope indexes.
- New rules. Until the indexes finish building, the shared lists fail to load, and the screens say so instead of looking empty.

## Also in this round's rules

Before this round, the machine notes, upkeep log, playbook and wiki blocks accepted writes from **any** signed-in trainer at **any** studio. Their comments said "the path enforces tenancy", but nothing checked the path. Writes there now need `writesForStudio(studioId)`: someone who works at or runs the studio, or an administrator or franchise owner.

## Not in this round

Session screens still use the app-wide machine list (AppContent's `machines`), not each studio's roster. `useSessionMachines` exists for that, but nothing uses it yet. So a machine adopted here appears in the studio's Catalog, but not yet in the session tracker's picker. Wiring sessions to the roster is on the roadmap.

## Files

| File | What |
| --- | --- |
| `database.ts` + test | The list, grouping, search, counts, adoption plans, sharing keys |
| `network.ts` + test | Reading shared notes and tips, and what the section shows |
| `hooks.ts` | The two collection-group reads |
| `mutations.ts` | Adopt, and the three share switches |
| `MachineDatabase.tsx` | The All MSF machines scope: index, page, search |
| `NetworkNotes.tsx` | "From other MSF studios", on every machine page |
| `ScopeSwitch.tsx`, `ShareToggle.tsx` | The two controls |
| `machine-db.css` | On the wiki's `--wk-*` tokens |
