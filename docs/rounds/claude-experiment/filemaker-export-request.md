# The FileMaker export request

**What this is:** a message AJ can forward to whoever holds the Claris FileMaker
solution, asking for the data in a form Journey can import exactly.

**Why it matters more than it looks.** Journey's current import path photographs
the iPad screen and pays a vision model to read handwriting-dense grids. Today
that path cannot return a weight at all (the settings schema has no weight field
and the prompt tells the model to ignore weight), it collapses `Leg Press Imag.`
and `Leg Press Hoist` into one machine and silently drops a set, and it
double-counts every client's history because the importer never raises
`priorHistory.importedCount`. A real export removes all of that by construction:
exact names, exact labels, exact numbers, joinable, diffable, and safe to re-run.

**One thing to stress if they push back:** we do not need the FileMaker *solution*,
the layouts, the scripts or the calculations. We need the contents of five tables
as flat files. That is a fifteen-minute job in FileMaker Pro (File → Export
Records) and it carries no intellectual property beyond the studio's own data.

---

## The message to send

> Hi —
>
> We're migrating Max Strength off the FileMaker system onto its replacement, and
> I need a data export rather than screenshots. Could you send the contents of the
> tables below?
>
> **Format, in order of preference**
>
> 1. One **CSV per table**, UTF-8, comma-delimited, every field quoted, with a
>    header row. (In FileMaker Pro: File → Export Records → type "Comma-Separated
>    Text", tick "Apply current layout's data formatting" **OFF**.)
> 2. Or a single **FileMaker XML export** (`.fmpxmlresult`) containing all five.
> 3. Or, if neither is possible, an **Excel workbook with one sheet per table**.
>
> **Three things that matter more than the format**
>
> - **Please include the internal record IDs** — the primary key of each table and
>   whatever foreign keys join them (the field that links a performance row to its
>   session, its client and its machine). Without them the rows cannot be
>   reassembled and we are back to matching on names, which we will not do.
> - **Please do not pre-format dates or numbers.** Raw values or ISO
>   (`YYYY-MM-DD`) are ideal. A date rendered as `9/2/26` loses the century and a
>   number rendered as `1,220` stops being a number.
> - **Please include inactive rows** — deactivated machines, archived clients,
>   former trainers. A session from 2019 references a machine that was retired in
>   2022, and we need that machine's name to place the set.
>
> **The five tables**
>
> **1. Clients** — one row per client.
> Whatever exists of: record ID, first name, last name, date of birth, sex,
> address, city, state, zip, home phone, work phone, mobile, email, best place to
> message, home location, date created, date of last InBody scan, total session
> count, and the free-text **Client Notes** field (the long medical/history note
> on the client screen).
>
> **2. Trainers** — one row per trainer.
> Record ID, first name, last name, **initials** (the two letters that appear in
> the workout grid header — these are what join a session to a trainer), job
> title, active flag, location, hire date.
>
> **3. Machines** — one row per machine, per location if they differ.
> Record ID, machine name **exactly as printed** (we need the vendor variants
> distinguished — `Leg Press Imag.` and `Leg Press Hoist` are two different
> machines to us, as are `Overhead SSS` / `Overhead CRX` / `Overhead MX`, `Ab T/R`
> / `Ab MX` / `Ab H`, and `Lumbar K` / `Lumbar ROM`), the **Order** number, the
> **Setting 1–6 label** fields, the active/inactive flag, and the location.
>
> **4. Sessions / Workouts** — one row per client visit.
> Record ID, client ID, **session number** (the number in the blue column header),
> date, trainer initials or trainer ID, location, and the **Workout Notes**
> free-text field for that session.
>
> **5. Performance** — one row per machine per session. **This is the important
> one — it is the grid itself.**
> Record ID, session ID, client ID, machine ID, **weight**, **reps**, the **order
> the machine was performed in that session** (the number in the blue circle in
> each cell), the **per-cell note** (the text behind the pencil icon), and any
> field that marks a set as a timed/static hold. If there is a second numeric
> field beside reps — we see values like `9  60` and `10  122` in the cells —
> please say what it is; we have not been able to tell from the screen whether it
> is a previous weight, a second side, or something else.
>
> **6. Client machine settings**, if they are stored separately from the
> performance rows.
> One row per client per machine with the label/value pairs — we see `S- 7 / G- 9`
> on the hip adduction, `Pad- 2 / S- 1 / G- 6` on the chest fly, `E- N / S- 4 /
> G- 10` on the pullover, `S- 2 / G- 6 / Ft-` on the lumbar, and `S- 1 / G- 7 /
> Blocks` on the abs. If those live on the performance row instead, that is fine —
> just say which.
>
> **A sample first, if it's easier.** If a full export is a scheduling problem, a
> single client's complete history across all five tables would let us confirm the
> mapping before anyone does the whole thing. Fran Gesten or Sharon Ann Tesar would
> be ideal — we already have their charts on screen to check against.
>
> Thanks —
> AJ

---

## What we do with each field, for our own reference

| FileMaker | Journey | Note |
| --- | --- | --- |
| Client record ID | — | Used only to join the export; Journey keys clients on the **Mindbody** id |
| Client name, DOB, sex, contact | `clients/{mindbodyClientId}` | Only to MATCH a FileMaker client to an existing Mindbody one. We never create a client from this export — Mindbody owns identity |
| Client Notes (free text) | `journalEntries`, one entry, `importance: critical` where it reads clinical | The Chris Curtis note (ladder fall, hip replacements, Type 2 diabetes, neuropathy) is exactly the cold-start context a trainer needs |
| Session number | `sessions.sessionNumber` | Kept as printed. The current OCR path **renumbers every session `idx + 1`**, which is why the client screen's "51 sessions since their last scan" stops agreeing with the chart |
| Session date | `sessions.date` | Studio Eastern day |
| Trainer initials | `sessions.trainerId` via a lookup | Unmatched initials must leave `trainerId` UNSET. The current path writes `trainerId: 'legacy-trainer'`, which makes a Cloud Function create a `trainers/legacy-trainer` document every screen then streams |
| Workout Notes | `journalEntries` pinned to that session | |
| Weight, reps | `exerciseLogs.weight` / `.reps` | |
| Performed order (the blue circle) | `sessions.sessionMachineIds` | The order actually performed — a field the app already has and the OCR path never fills. **Needs AJ's OK**: it writes a field on `sessions` |
| Per-cell note (the pencil) | `exerciseLogs` → a `journalEntries` equipment note | "Had to assist on the last few" is real coaching context |
| Static-hold flag | `exerciseLogs.isStaticHold`, reps become seconds | A real flag replaces the current `reps > 20` heuristic, which misreads the second number beside reps as a 60-second hold |
| Machine name + Setting 1–6 labels | `studios/{s}/roster/{machineId}` | The labels ARE the studio's dials. Vendor variants become separate roster entries with `basedOn` pointing at the catalog machine |
| Setting values per client | `clientMachineSettings.settings` | Keyed by the machine's own labels |
| Total session count | `client.priorHistory` via `recordImportedSessions` | **The contract nothing currently calls.** `total = journey count + (sessions − importedCount)`; skip it and every migrated client's count is permanently wrong |

## Two rules for whoever builds the importer

1. **Deterministic document ids.** `legacy_{clientId}_{sessionNumber}` or
   `{clientId}_{isoDate}`. The current path mints a random id per run, so
   re-running the same chart writes a second copy of the history and compounds
   five counters. A derived id makes a re-run a no-op — which turns "run it
   again" from a disaster into the recovery path.
2. **`recordImportedSessions` is not optional.** It is headed "THE IMPORTER'S
   CONTRACT" in `src/lib/prior-history.ts` and has never been called. It must be a
   transactional read-modify-write of `priorHistory`, not an `increment()` on a
   nested field — `sessions` must stay exactly the number the human stated.
