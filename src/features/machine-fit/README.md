# Machine fit

**What it is.** "Fit" is how a machine is set for a body: Seat 3, Gap 0, Chest
pad 2. This folder answers three questions from the same evidence:

- a trainer on a new client's first day — *"where do people built like her
  usually sit on this?"* → **Programming → Setup** on the client profile;
- a head trainer afterwards — *"is anyone here sitting somewhere odd?"* → the
  **Check** mode of that screen, and **Operations → Machine fit → Worth a look**;
- an owner — *"what are 5'7" clients set to versus 5'4", and does the seat even
  follow height on this machine?"* → **Operations → Machine fit**.

**An outlier is a question, never a verdict** (AJ, Sep 21 2026). His own
example: *why is this 5'8" client on seat 6 when most 5'8" clients are on seat
4?* — and immediately after it, the reason the screen must not answer its own
question: **some people have a long torso and short legs, so seat 6 may be
exactly right.** The data cannot tell the difference and the trainer in the
room can.

That is why this feature raises things as *worth a look* and never as *wrong*,
and it is the concrete reason the tolerance ladder does not stop at height:
height alone manufactures precisely that false alarm, so the ladder keeps
narrowing — wingspan, weight, age, body composition — until the comparison is
to people actually built the same way. Narrowing shrinks the sample, which is
why every claim carries a named minimum and says so when it has not got one.

**Settings and weight do not pool at the same level** (AJ, Sep 21 2026), and
this folder currently treats them as though they do.

> "I just want to be able to compare weights across all compound rows, whereas
> I would more want to see … compare all settings on the Nautilus compound row."

*Weight and performance* belong to the body and the movement: a client at a
given load on one compound row is usually near it on another, so pooling them
across every model and studio is right. *Settings* belong to the hardware: a
seat 4 on a Nautilus is not a seat 4 on a Hoist, and two body types on two
machines land on numbers with nothing in common.

**Where that bites today.** Inside one studio the settings data is clean — a
location owns one physical unit per machine, so `studios/{s}/machineFit/{machineId}`
is inherently one model. The **company tier is not**: the weekly job rolls one
`machineFit` list per studio into a single `CompanyFitBlock` keyed only by the
catalog `machineId`, so a Hoist seat 4 and a Nautilus seat 4 are averaged as
though they were the same value. Weight is unaffected. Nothing can fix this
until a model is recorded on a roster entry (see the machines README's open
questions); once it is, the pattern can still pool company-wide while the
actual numbers scope per model.

Two uses, and they are not the same job: **forward**, a good starting point
for a client nobody has ever set up; **backward**, a client who may have been
set up wrong once and never looked at since.

The round document is `docs/rounds/2026-09-17-machine-fit.md`: the brief, the
data structure, the algorithm, the screens and the edge cases. Read it before
changing anything here. This page is the short version: what is load-bearing.

## Where things are

| | |
| --- | --- |
| `types.ts`, `factors.ts`, `match-spec.ts` | a body, and how close is "similar" |
| `cohort.ts` | the tolerance ladder: exact → ±1 → ±2 → ±3, stopping at the first band of five |
| `clusters.ts` | the set-up as a conditional chain, so values that are offered together are used together |
| `audit.ts` | the passive check |
| `engine.ts` | **the only thing the screens call**: picks the tier, returns evidence |
| `fit-index.ts` | the two stores as plain data; what counts as evidence; the anonymity floor |
| `kaizen.ts`, `company.ts` | the report, and the weekly job's fit step |
| `shorthand.ts` | FileMaker's shorthand → this machine's fields |
| `setup-plan.ts`, `settings-write.ts` | what one Save writes, decided as plain data |
| `fit-store.ts`, `setup-save.ts` | the Firestore half |
| `ui/` | the Setup screen; `ui/sentences.ts` and `ui/kaizen-sentences.ts` are every sentence it says |
| `../admin/machine-fit/` | Operations → Machine fit |
| `server/machine-trends-job.ts`, `server/machine-fit-company.ts` | the weekly company tier |
| `scripts/rebuild-machine-fit.ts` | rebuilds every studio's index from the record |

Everything outside `fit-store.ts`, `setup-save.ts` and `ui/*.tsx` is pure — no
Firebase, no React — which is why the weekly job can bundle it and why it is
tested on plain objects.

## The rules that are load-bearing

**A suggestion is never a value.** It is a placeholder until a person taps it,
and nothing is written until Save. "Accept strong suggestions" fills drafts; one
Undo takes them back; one Save writes the lot in a batch.

**The engine cannot learn from its own guesses.** A saved value carries where it
came from (`clientMachineSettings.sources`: `typed` / `suggested` / `legacy`).
An accepted suggestion is **not evidence for anyone else** until the client has
performed that machine on or after the day it was saved (`verifiedSettings`).
Remove that and the engine agrees with itself for ever.

**She is never in her own comparison group.** By id at the studio tier
(`excludeClientId`); at the company tier, where cells are anonymous, one client
who agrees with her on everything they share is taken out (`withoutSelf`) — in
the check *and* in suggestions.

**Rare needs a second opinion.** The comparison group is the tightest band of
five — often six people. A value is only marked when it is also rare across the
widest band the ladder could reach (`Cohort.wide`). A confident wrong mark is
worse than a missing one.

**Sentences, not scores.** `MIN_CLIENTS` (5) is the named minimum, from machine
trends. Below it a suggestion says how many similar clients there are instead of
quoting them; a report average is `null` and the screen says "not enough data
yet". A link between height and a setting is said in words, never as a
coefficient. Studios are described, never ranked.

**Unknown is never empty.** `FitSources.studio` / `.company` are `null` when they
could not be read and `[]` when they were read and nobody is set up. The engine
returns `reason: "unknown"` / `state: "unknown"` for the first and the sentences
say "could not be loaded". Do not collapse the two.

**The studio index holds no body data.** `studios/{s}/machineFit/{machineId}` is
settings, where they came from, reviews and a timestamp. Rows are joined to the
client list the app already holds **at read time**. Never add a height, a weight
or anything from InBody to a row.

**One row per write.** Every index write touches exactly one `rows.<clientId>`
key, by `FieldPath` (a client id is not guaranteed dot-free), and the rules
refuse anything else. The row is *replaced*, so whoever writes it passes the
client's existing reviews along (`acks`) or they are dropped from the index.
The rebuild script is the one writer allowed to replace a document whole.

**The index is a copy, and its write never fails a save.** Caught, always.
`clientMachineSettings` is the record; `scripts/rebuild-machine-fit.ts` heals
any drift (the legacy importer, the old full-screen grid, a covering trainer the
rules refused, a client who moved studio).

**The company block is anonymous down to the cell.** No ids, no studios, and
every published (height, gender) group holds at least `CELL_MIN_CLIENTS` (5)
people: a thin gender is pooled with the unknowns, a thin pool pools the height,
a thin height is left out (`heldBack`). `machineTrends/*` is readable by any
signed-in trainer at any studio.

**`kaizenReports/*` names studios, never people.** `buildKaizen` returns two
halves on purpose: `report` is safe to store; `findings` carries client ids and
never leaves the device. The job drops `findings`. There is a test that greps the
stored half for ids.

**Normalised inside, the machine's spelling at the edge.** Keys and values go
through machine-trends' `normalizeSettingKey` / `normalizeSettingValue`
(`"Back Pad"` = `back-pad`, `6.5` = `6_5`, `2.` = `2`). Only
`ui/field-values.ts` crosses the line.

**Plum, never red.** "Worth a look" is `--eq-warn` / `--adm-warn`. Red is rep
quality's. The check is passive: no bell, no Hub marker, no dialog.

**Nothing is read until Setup is opened**, and the segment stays mounted
afterwards so drafts survive a look at Routine A (the four-tab profile's rule).
The studio index is one query, cached ten minutes, and a save from this iPad is
folded into the cache.

## Cost

| | reads |
| --- | --- |
| Opening Setup at a studio, first time in ten minutes | one query: the studio's `machineFit` collection (one document per machine anyone is set up on, ~20) |
| …and the company tier | one read per machine per app session, shared with the Settings card's cache |
| Saving | the settings documents and their history rows (one batch), then one index write per changed machine (a second batch) |
| Operations → Machine fit, this studio | the same cached query; the report is built in the browser |
| …All MSF studios | `kaizenReports/_summary`, then one document per machine opened |
| The weekly job | every client (ten fields), the window's logs, one `machineFit` list per studio |

No listeners anywhere.

## Running the scripts

```
npx tsx scripts/rebuild-machine-fit.ts             # dry run: what it would write, per studio
npx tsx scripts/rebuild-machine-fit.ts --commit    # replaces studios/{s}/machineFit/*
npx tsx scripts/run-machine-trends.ts --commit     # the weekly job, now: trends + fit blocks + kaizenReports
```

Both need `service-account.json` in the project folder. Run the rebuild once
after deploying the round, after any import, and whenever the index is in doubt.

## Adding a factor to match on

1. `FitFactors` and `FACTOR_FIELD` in `types.ts`; `NUMERIC_FACTORS`.
2. Read it off the client in `factors.ts` — **unknown is `null`, never a guess**.
3. A default tolerance, a label and a unit in `match-spec.ts`.
4. The job's client `select(...)` in `server/machine-trends-job.ts` if the
   company *report* should see it. The company *block* cannot: a cell is a
   height and a gender, and adding a third key would make every cell one person.

## Traps

- **No strictNullChecks** in this project: `if (!result.ok)` does not narrow the
  `SuggestionResult` union. Write `result.ok === true` / `=== false`.
- **The drafts reducer is at module scope and closes over nothing** (the
  `useReducer` trap in CLAUDE.md).
- **Firestore `merge: true` walks into maps**, so a cleared setting was never
  removed. `saveSettings` and the Setup save both name their fields
  (`mergeFields`) so `settings` and `sources` are replaced whole.
- **Removing a row from a machine with no index document** creates a document
  with no `rows`. The rules read `d.get('rows', {})` for exactly this; every
  reader does `rows ?? {}`.
- **A `<button>` centres its own text**; row alignment lives in the CSS files.
- The portrait media block in `ui/machine-fit.css` comes **after** the rule it
  overrides — the other way round the machine names sat centred.
