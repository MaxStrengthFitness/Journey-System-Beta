# features/machine-db — the MSF machine database

Round: Learning + Planner, Sep 2026. AJ asked for this:

> "studio should 100% be able to make machines and add them to the database but I think we just need to have a overall all MSF machines, then studios can adopt machines from this machine database and then studios can also grab information submitted by other studios about the machine and read the catalog"

He chose **the studio picks, each time**: a switch on each machine, each note and each tip. Anything not switched on stays with its studio.

**Since Sep 28 2026 sharing waits for an administrator.** AJ: sharing with all MSF studios "should submit to admins first for review, we can review in admin dashboard". The switch now reads **Offer to all MSF studios**: a tap OFFERS the thing (`shareStatus: "pending"`), and it reaches no other studio until an administrator shares it from the Admins dashboard → **Waiting for review** (`ShareReviewPanel`). See "Offer, then an administrator decides" below.

## What a trainer sees

The Learning tab's **Catalog** has two scopes, switched above the index title:

- **At {studio}** — the studio's own floor. This is the Catalog as it was, with two additions to each machine page:
  - **From other MSF studios**: what other studios shared about this machine.
  - The share switches on the studio's own note, its playbook tips, and — for a machine the studio made — the machine itself.
- **All MSF machines** — every machine in the MSF catalog, plus every machine a studio made and shared.
  - It has the same index as the floor: contents, groups, one row per machine with its Academy code. Badges show **On your floor** and **the sharing studio**.
  - Each machine has its own page: the machine as the network knows it, and what other studios shared about it.
  - The page shows whether this studio has the machine. If it doesn't, the studio's leaders get **Add to {studio}'s floor**.

The Learning Overview links to All MSF machines under the Catalog's tiles, and Learning's one search finds shared machines too, under **Shared by other MSF studios** (`useLearningEntries`). The database's own search screen is only reached outside the Learning tab.

## The rules

| What | Where it lives | Who offers it (and takes it back) |
| --- | --- | --- |
| A studio's own machine | `studios/{s}/roster/{id}` (`source: "custom"`) → `shareStatus`, `sharedStudioName`; `shared` once decided | The studio's leaders (the roster rule) |
| The studio's note on a machine | `studios/{s}/wiki/machine__{id}` (overlay) → `shareStatus`, `sharedKeys`, `studioName`; `shared` once decided | Anyone at the studio (they can already edit it) |
| A playbook tip | `studios/{s}/playbook/{id}` → `shareStatus`, `sharedKeys`, `studioName`; `shared` once decided | Its author, or a leader (the playbook rule) |
| One of the floor's notes on a machine (since Oct 3 2026) | `studios/{s}/floorNotes/{id}`, a note of its own and still open → `shareStatus`, `sharedKeys`, `studioName`; `shared` once decided | Its author, or a leader (the screen; the rules let anyone at the studio) |

The floor's dated notes (`features/floor-notes`, AJ's answer 2A) took over from the studio's one note on the Catalog page. That note is no longer written; it shows under the list as an earlier note and **keeps its switch while it is shared or offered**, so a studio can always take it back. Review kind `floor` ("A floor note on a machine"); other studios read shared, open floor notes as notes (`noteFromFloorDoc`), beside the wiki notes and tips.

Only an **administrator** sets `shared` to true, and only an administrator decides an offer (`shareStatus` "approved" or "declined", `shareReviewedBy`, `shareReviewedAt`, and an optional `shareReviewNote` of up to 300 characters the studio reads beside its switch). firestore.rules says so in `shareDecisionOk`, cheapest check first: a write that neither publishes nor decides passes on its fields alone, and only a publish or a decision asks `isSuperAdmin()` (the other way round ran out of Firestore's 1000-expression budget).

- **Nothing is copied to share it.** The studio's own document is marked. Taking it back (an offer withdrawn, or a shared thing no longer shared) takes it out of every other studio's view at once, and needs no administrator.
- **Other studios read it with collection-group queries.** They filter on `shared == true` (plus, for notes and tips, `sharedKeys array-contains` the machine's lineage). The `{path=**}` rules in `firestore.rules` pass only a query filtered on `shared == true`, so nothing unshared can be listed.
- **Unshared stays with the studio, in the rules too.** A studio's own `playbook` and `wiki` are readable by the people who work at or run it (`writesForStudio`), administrators and franchise owners. Before the review they were readable by any signed-in user, so "not shared" was only true of the lists. Since Sep 28 2026 the same holds for the rest of a studio's machine knowledge: its `roster` (custom definitions and overrides), its Studio notes (`machineNotes`) and its set-up (`studioMachineSettings`, which only its leaders may change). A machine an administrator shared stays readable by all, through the `{path=**}/roster` rule.
- **Credit comes from the path.** A shared item's studio is the one its path names (`studios/{s}/…`), never the `studioId` field the writer filled in, and its name is that studio's own name from `studios/{s}` (`useStudioNameOf` in `hooks.ts`). The roster rule also refuses a `studioId` that isn't the path's.
- **Only a studio's own machine can be listed** (`rosterShareValid`, `rosterWriteValid`):
  - an MSF machine is already in the database;
  - a copy adopted from another studio is listed by its original, and stays a copy: an update can't drop `adoptedFrom` and list it in the same write.
- **Notes and tips never carry a client.** The rules already refused `clientId` on both collections, which is what makes it safe to show them to every studio.

## Offer, then an administrator decides (Sep 28 2026)

| The switch says | What it means | A tap |
| --- | --- | --- |
| Offer to all MSF studios | Not offered | offers it |
| Offered · waiting for review | Waiting on the Admins dashboard; "An administrator reads it before other studios see it. Tap to withdraw it." | withdraws the offer |
| Shared with all MSF studios | An administrator shared it | stops sharing it |
| Offer again | An administrator decided against it; their note, if any, under the switch | offers it again |

- `ShareToggle` reads the state from the document itself (`shareStateOf`), and `tapOffers` says what a tap does, so the three call sites in the Catalog can't disagree.
- **The Admins dashboard → Waiting for review** (`ShareReviewPanel`, `offers.ts`) lists every offer across studios, oldest first, each whole: what it is, whose (the studio the PATH names), who offered it and when, and what it says. **Share with every studio** or **Don't share** (with an optional note). It reads once when the tab opens, with Refresh: four collection-group reads (roster, wiki, playbook, floorNotes) filtered on `shareStatus == "pending"`, which only administrators may run, each served by its own (shareStatus, studioId) collection-group index since the speed round, Oct 5 2026 (the Enterprise edition builds none by itself; before that each scanned its whole collection group). A failed read says it can't tell, never "Nothing waiting".
- **Only the first share is reviewed.** Something an administrator shared stays shared when its studio edits it, or a teammate taps "worked for me too" on a tip. Whether every later edit should go back for review is AJ's to say.

## Adopting

| From | Writes to this studio's roster |
| --- | --- |
| An MSF machine | `source: "catalog"`, `basedOn` = the MSF id — exactly what the Equipment panel writes, live-inheriting the catalog. A machine once switched off comes back with its old local setup (merge). |
| A studio's machine | A **copy**: `source: "custom"`, a new id `sm-{thisStudio}-{slug}` (suffixed on a clash), the original's `definition`, `basedOn` = the original's lineage, `adoptedFrom` = where it came from. |

- **Why a copy under a new id.** Machine ids are foreign keys in logs, settings and routines, and they are queried across studios. Two studios logging under one id would merge their numbers on the leaderboard.
- **What the copy keeps.** Its lineage (`basedOn`), so cross-studio roll-ups still compare like with like, and so anything shared about the original shows on the copy (see Lineage below).
- **A machine the studio switched off comes back on.** It is still on the roster, inactive. Adding it again (**Put it back on {studio}'s floor**) switches it back on with its local setup — for an MSF machine, a copy or the studio's own machine alike — instead of making a second copy (`existingRosterEntry`).
- **Nothing is decided while the floor loads.** Until the studio's roster and the catalog have both loaded, a page says "Checking {studio}'s floor…", the count reads "…", and no machine is called on or off the floor.
- **Refused when the studio has no roster yet.** Until a roster exists, the Catalog shows every MSF machine as the studio's own. Adding one machine would make that one the whole floor and hide the rest, so the page instead points to My Studio → Machines (My Studio round, Sep 2026; it used to say Operations → Studios → Equipment).
- **Refused for a retired MSF machine.** Its page can still be read.

## Lineage — how shared notes find a machine

Notes and tips are filed under `sharedKeys`: the **lineage** of each machine they are about. This is `comparisonKey` from `lib/resolve-machine.ts`: the MSF id for an MSF machine, and `basedOn ?? machineId` for a studio's own.

A machine page queries its own lineage. So a tip about Westlake's copy of Solon's sled is filed under Solon's sled, and shows on both studios' pages. `sharedKeysFor()` computes the keys when Share is switched on.

## Deploy

- Two new composite collection-group indexes, `playbook` and `wiki` (`shared` + `sharedKeys` contains), and a third for `floorNotes` since Oct 3 2026.
- Two field overrides, each listed alongside the default collection-scope indexes: `roster.shared`, collection-group ascending (the shared list), and `roster.basedOn`, collection-group ascending (the admin's "studios using this" count before a machine is retired, which the rules only now let through).
- New rules. Until the indexes finish building, the shared lists fail to load, and the screens say so instead of looking empty.

## Also in this round's rules

Before this round, the machine notes, upkeep log, playbook and wiki blocks accepted writes from **any** signed-in trainer at **any** studio. Their comments said "the path enforces tenancy", but nothing checked the path. Writes there now need `writesForStudio(studioId)`: someone who works at or runs the studio, or an administrator or franchise owner. `writesForStudioPerRules` in `features/learning/permissions.ts` mirrors it for buttons — My Studio → Machines (and Operations → Studios → Equipment) offer **Upkeep** only on studios the viewer can log for.

## Not in this round

Session screens still use the app-wide machine list (AppContent's `machines`), not each studio's roster. `useSessionMachines` exists for that, but nothing uses it yet. So a machine adopted here appears in the studio's Catalog, but not yet in the session tracker's picker. Wiring sessions to the roster is on the roadmap.

## Files

| File | What |
| --- | --- |
| `database.ts` + test | The list, grouping, search, counts, adoption plans, sharing keys |
| `network.ts` + test | Reading shared notes and tips, and what the section shows |
| `hooks.ts` | The collection-group reads, and naming a studio from its own document |
| `mutations.ts` + test | Adopt, the three offers (and taking them back), and an administrator's decision |
| `offers.ts` + test, `ShareReviewPanel.tsx` + test, `share-review.css` | The Admins dashboard's Waiting for review (on the `--adm-*` tokens) |
| `MachineDatabase.tsx` + `MachineDatabase.render.test.tsx` | The All MSF machines scope: index, page, search. Since wave 2 of the Machine Catalog room (Sep 28 2026) a movement's page lists its models (`features/catalog/MovementModels`, read only while a page is open, nothing until the records can be read) |
| `NetworkNotes.tsx` | "From other MSF studios", on every machine page |
| `ScopeSwitch.tsx`, `ShareToggle.tsx` + test | The two controls (the switch's four states since Sep 28 2026) |
| `machine-db.css` | On the wiki's `--wk-*` tokens |
