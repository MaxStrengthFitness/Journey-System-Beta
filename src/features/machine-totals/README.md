# Machine totals: a client's machine maps, in their own document

The iPad round, Oct 6 2026. AJ, Oct 5: "we really need our app to run fast on devices like ipads even 10th generation ipads and ipad minis".

## Why

Every open of the app streams the studio's client list (the roster). The perf lab (`harness/perf-lab/`) measured it on a seeded 300-client studio: 302 documents, about 4.15 MB of wire JSON, 14 KB each, and **73% of every client document was two maps the Hub and the Directory never draw**:

| field | about | what it is |
| --- | ---: | --- |
| `currentMachineMetrics` | 6.8 KB | the last performed set on each machine (Start's prefilled weights, the session grid, the briefing, the machine menu) |
| `machineStats` | 3.4 KB | each machine's lifetime rollup: first and last weight and day, times performed (Programming, the Equipment tab, the renewal brief's strength gains, machine fit) |

On a 10th-gen iPad or a mini the Hub's data arrived 5.5 s after the trainer record (7 s on an older iPad), most of it the Firestore SDK taking in those documents. So the two maps (and `machineStatsBackfilledAt`, the backfill's marker, which belongs with `machineStats`) moved to:

```
clients/{clientId}/machineTotals/current
  currentMachineMetrics      { [machineId]: CurrentMachineMetric }
  machineStats               { [machineId]: ClientMachineStat }
  machineStatsBackfilledAt
  updatedAt
```

One document per client, beside it like `inbodyScans` and `sharedNotes`: the rules read the client document for who may see it, so a client moving studio takes it along; it is read by id (one listener, or `getAll` in the jobs), so no query and no index. The roster's client document drops to about 3.8 KB.

## The one rule (`totals.ts`)

The old fields stay on `clients/{id}` until `scripts/split-client-metrics.ts` moves them, and an iPad still on the old version writes there until it loads the new one. Every reader folds the two sides with `mergeMachineTotals`; the migration writes exactly what that rule says (`planClientSplit`), so a client reads the same before, during and after it.

- **currentMachineMetrics**: per machine, the later `lastPerformedDate` wins. A tie, or a date still on its way (a `serverTimestamp` not yet answered), goes to the new document, where every new write lands.
- **machineStats**: per machine, `timesPerformed` is the **sum** of the two sides; the first pair comes from the earlier `firstPerformedDate`, the last pair from the later `lastPerformedDate`.

The sum holds because nothing ever copies a count across without deleting it from where it was in the same write: before the migration the client holds the history and the new document counts what came since; the migration moves the count and deletes it in one transaction; an old iPad writing after that counts onto the emptied client field again. The whole-history rebuilds (the profile's backfill, the console repair `migrateClientMachineMetrics`, `scripts/merge-duplicate-client-records.ts`) write the new document and delete the client's fields in one batch for the same reason. **Any new writer must do the same: increments to the new document, or a whole replace together with the delete.**

## Who reads, who writes

Reads, all through the merge:

- **The client on screen** (`AppContent`): `useMachineTotals(selectedClientId)`, one listener, folded into that client in `clients` with `withMachineTotals`. The profile, the session (Start's prefill, the grid, the briefing, Finish's "newer on file"), the machine menu, Programming, the Equipment tab and its backfill, the phone session and Log past session all read that one object, so none of them changed.
- **The renewal brief** (Operations -> Renewals): its own `useMachineTotals` for the client it opens.
- **The FileMaker chart importer**: one read of the totals for the client it imports into.
- **The nightly renewals job** (`server/renewals-job.ts`, the strength proof) and **the weekly machine-fit step** (`server/machine-fit-company.ts`, "performed since"): `getAll` of the studio's totals documents beside the clients they already read, merged the same way. A failed totals read fails that read, as a failed client read does.

Writes, each a `set` with `mergeFields` through `store.ts` (the same effect as the old dot-path `update`, but it creates the document the first time):

- **Finish** (`lib/sync-utils.ts`): the client's counters and the totals in ONE batch, so a refusal refuses both, as the single client update did before, and a retry never counts twice.
- **Log past session**, **a history edit** and **a history delete** (`client-history/`): the same batch they already wrote.
- **The profile's backfill** (`equipment/useMachineStats.ts`) and the **console repair** (`lib/migration-utils.ts`): replace and delete together.
- **The FileMaker chart importer**: per machine, never the whole map.
- **Demo Mode's seed** and **the lab's seed with `--split`**: the post-migration shape.

## Unknown is said

`useMachineTotals` is `loading` until the document arrives or the server says there is none (an empty answer from the iPad's cache is not "none"), and `failed` (asked again after 15 s, 30 s, 1 min...) when the read fails. `machineTotalsKnown(client)` is the question a screen asks before acting on the totals as an answer:

- **Start's prefilled weights wait for it**, as they wait for the machine settings, and follow the moment it is known (`startFollowUpRef`). Never a prescribed weight in place of a last weight nobody has read.
- **The backfill waits for it**, or a client whose marker is in the new document would have her whole history re-read on every profile open.
- **Finish, "Finish it as it was" and Log past session never read "nothing on file" off a document still loading** (the review, Oct 6 2026): with the totals unknown, Finish writes the counts, and the last pair and the prefill only for today's session (newest by definition); an old session writes no last time and no next weight; nothing writes a first pair (`completedSessionRollup`'s `existingKnown`). "Finish it as it was" and Log past session's Save wait for the totals ("Reading the machines...").
- **A document only this iPad has written is not the whole document**: an offline Finish creates it with only its own paths, so the hook calls it `loading` (its data passed on, marked not complete) until the server answers, a cached copy has nothing of ours pending, or the whole document was seen since the app opened.
- **A failure that still holds a whole answer is known** (a listener error mid-session doesn't freeze the prefill); a failure with nothing whole is unknown.
- **The renewal's live snapshot and the machine menu's "first time" wait too**: the brief and the profile's renewal card show the stored snapshot until the totals answer, and the menu's header and the phone's cards never say "First time on this machine" while they are out.

While the totals are loading the client's own old fields stand, which before the migration is the whole story.

## What a list no longer has

The roster (Hub, Directory, Operations' lists, machine fit's studio report) carries no machine maps once a client is migrated:

- **The Directory's "Last in"** read the last machine day as its third piece of evidence. The migration moves `lastSessionDate` forward to that day where it is later, so the column keeps the day.
- **Machine fit's studio tier** (Programming -> Setup's suggestions, Operations -> Machine fit) counted a set-up accepted from a suggestion only once the client had performed that machine since, read from `machineStats` on the roster. After the migration the studio tier can't see that day, so it leaves such a set-up out (fewer samples, never a wrong one). Set-ups a trainer typed are unaffected, and the weekly company tier still joins the totals. Open for AJ: keep a small per-machine "last day" map on the client (about 0.6 KB) if the studio tier should count them.

## Shipping it (a Firestore structure change: AJ's OK first)

1. **Rules** (`firebase deploy --only firestore:rules`, after `npm run test:rules`): they add the totals document's access, and refuse SETTING `machineStatsBackfilledAt` on a client (the review, Oct 6 2026): an iPad still on the old version backfills by writing a whole-history `machineStats` with that marker onto the client, which the sum would double; refused whole, and the old app doesn't re-arm on a refusal. Every other client write is unaffected, so the running app is too. No new index. If the app ever reaches the iPads before these rules, Finish saves the client's counters on their own when only the totals document is refused.
2. **The app** (push to master): from here every write lands in the new document and every read folds both sides. Nothing on the roster changes yet.
3. **The migration**, once the iPads have loaded the new version (`features/new-version` loads it on the Hub): `scripts/split-client-metrics.ts`, a dry run first, then `--commit`, one studio at a time if you like (its header has the commands). Only now does the roster shrink. Running it again later is safe and moves anything an old iPad wrote meanwhile. With `--commit` it writes what every moved client held before to `backups/split-client-metrics-<time>.json` after each transaction, a restore point beside PITR.

No Cloud Function reads or writes these fields, so none needs redeploying. The nightly and weekly jobs ship with the app (Render builds them from the same push).

Undo, if it is ever needed: the app reads both sides, so stopping before step 3 changes nothing on the floor, and the app from this round on never needs the split undone. Only a build from before this round (the restore tag `restore/2026-10-06-before-roster`) reads the maps from the client alone, and would show no last weights for a migrated client. **`scripts/unsplit-client-metrics.ts`** is the way back: per client, in one transaction, it sets the client's three fields to the same merge and DELETES the totals document (the merge sums the counts, so a copy that left the document behind would count every session twice); dry run by default, `--commit` to write, `backups/unsplit-client-metrics-<time>.json` as its restore point. The order: the unsplit with `--commit` while this app is still live; push the restore tag; the unsplit again once every iPad runs the old build (it copies back what this app wrote in between); then the old `firestore.rules` from the same tag, last. `ship-ipad-roster.ps1` prints the commands.

## Tests

- `totals.test.ts`: the merge rule, the write shapes, the migration's plan.
- `split-run.test.ts`: the script's core against a fake database, and that it produces exactly the lab's `--split` shape.
- `unsplit-run.test.ts`: the way back against the same fake database: split then unsplit reads the same, the totals documents are gone, a session written after the split counts once.
- `jobs-read.test.ts`: the jobs' `getAll` fold.
- `tests/firestore.rules.test.ts`, "a client's machine totals document" and "a demo client's machine totals".
