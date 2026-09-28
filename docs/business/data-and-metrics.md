# Every number has a reader

AJ, Sep 2026: *"we need to evaluate all the data we collect and make sure each
piece of data is being funneled through at least one metric viewer. numbers are
data and data is money."*

That is a standing rule, not a to-do:

> **A field we write must be read by at least one screen, report or job. A
> field nothing reads is not data — it is storage with a maintenance cost.**

Two consequences, and they point in opposite directions on purpose:

1. **A write with no reader is a bug to fix, not a field to delete.** The
   default response to "nothing reads this" is to build the screen that should.
   Deleting is the answer only when nobody can name the question the field
   answers.
2. **A screen with no data behind it is worse.** Do not invent a reader for a
   field that is wrong, stale or unsafe to show — fix the field first.

`docs/rounds/2026-09-17-fluidity-audit.md` §3.9 is the current list of writes
with no reader. It is a work list.

---

## What the session snapshot is for

Every completed session stores who the client **was at that moment**:
`clientAge`, `clientOccupation`, `clientIsRetired`, `clientActivityLevel`,
`clientClinicalProfile`. Nothing reads them yet, and that is the gap — not the
fields.

They exist so the company can answer questions no single client's history can:

- **A starting point for a new client.** What weight do people of a similar age
  and activity level actually start at on this machine? A trainer's first
  session stops being a guess.
- **Which machines suit whom.** Which machines a cohort performs well on, and
  which they struggle to get in and out of.
- **Pace.** The average strength gain per cohort, so "is she on track" has an
  answer that is not the trainer's memory.
- **The studio's own story.** *"Our retired clients see an average strength
  increase of x%"* — a real claim, from real records.

A snapshot on the session is the right shape for this, because a client's age,
occupation and activity level **change**. Reading today's client document to
explain a session from three years ago would quietly re-label the past. This is
the same instinct as storing a session's legal name rather than resolving it
later.

### What is missing before any of that works

- **Height, wingspan and gender are not on the session snapshot.** Machine fit
  already treats height and gender as the axes that matter
  (`src/features/machine-fit/`). If cohort analytics are going to use them, they
  belong in the snapshot too, at the value they had that day.
- **There is no cohort reader.** No screen, no job. Until one exists the fields
  are accumulating quietly, which is fine — they cost nothing and they cannot be
  backfilled later.

---

## The rules any cohort metric has to keep

These are not new; they are the app's existing rules, applied to cohorts.

**1. A named minimum sample, or the screen says "not enough data yet."**
Sentences, not scores. A confident wrong number is worse than a missing one.

**2. Cohort cells are k-anonymous at five.** `machineTrends/{id}.fit` already
uses `CELL_MIN_CLIENTS = 5` because a cell of height × gender in a document any
trainer can read is otherwise one identifiable person. A cohort of
"retired · 68 · Willoughby" is far narrower than that. **Never add a third key
to a cell**, pool a thin one, and hold back what is still thin. The same code
and the same floor.

**3. `clientClinicalProfile` is health data.** It may appear in an aggregate; it
may never appear in a document a signed-in trainer can read against one person.
`progressReports`, `journalEntries` and `machineTrends` are all readable by any
signed-in user — no clinical snapshot may be copied into them, the same rule
InBody already follows.

**4. Never rank people inside a studio.** Recognition, never ranking. A cohort
comparison is about the cohort; it does not become a leaderboard of trainers or
clients. Studios may be compared, but not on numbers that are wrong: the Network
tab's ranking was dropped on Sep 27 2026, because its numbers were wrong during
the migration, and a comparison comes back only on measures with a named minimum
sample.

**5. A migration-era cohort is partial by definition.** During the FileMaker
migration most clients' early sessions are not in Journey, so a "first session
weight" cohort is drawn from whoever happened to start after their studio's
cutover. Any cohort claim must say what it is drawn from — see
`migration-and-prior-history.md`.

---

## What the client codex added, and who reads it (Sep 24 2026)

The client codex (`docs/rounds/2026-09-24-client-codex.md`) kept this rule for every field it touched:

| Field | Written by | Read by |
| --- | --- | --- |
| **In one line** — `clients/{id}/ford/one-line` | The FORD page's In one line panel (the team's sentence, last writer wins) | The top of the FORD page and the Overview's FORD slot, with who wrote it last |
| **Follow up next time** — `followUp`, `followUpAt`, `followUpBy` on a FORD detail | The FORD detail dialog, only when the question changes; "Asked it" clears it | The pillar's Ask next line on the FORD page. The briefing does not read it yet: showing it there is a floor change waiting on AJ |
| **The InBody normal variation** — `studios/{id}.inbodyVariation` | My Studio → Studio | The InBody card, Body & Pulse (Measured and told, Over time), the progress report, the Renewal Brief, the renewal card, the pipeline and its Upgrade candidates filter |
| **How she arrives and leaves** — the briefing's readiness answers and the post-session dose on each `sessions` document | The briefing and the Wrap-up (unchanged) | Now also Body & Pulse → Over time and the figure's region list, from the 40 sessions the journal already streams — a reader, not a new read |
| `recoveryMetric` on the client | **Nothing any more** (decision: retire it from the screen) | **Nothing.** It stays on old records by AJ's choice; the record form refuses the key, so no screen can write it again. It is kept, not a bug: no reader and no writer |
| `fordSummary.pinned` on the client | The FORD rollup, after every FORD save (now for trainers too, since the FORD read was fixed) | **Nothing.** A write with no reader — and FORD text on a document cross-train studios can read. Whether to stop writing it is waiting on AJ; `counts` and `nextDate` beside it do have readers (Relay → Mine's follow-ups read `nextDate`; the record's FORD door reads `counts`. Team's "Dates they mentioned" group read them too until it went on Sep 27 2026) |
| `lastUpdatedBy` on the client | The Save bar (as the old form did) | Nothing yet — carried over unchanged, on the work list |

## What the standing week added, and who reads it (Sep 27 2026)

| Field | Written by | Read by |
| --- | --- | --- |
| `studios/{s}/standingWeeks/{uid}.proposed` (+ `proposedAt`, `proposedBy`) | The trainer, on My Profile → My standing week; an agreement also brings it into line with the agreed week | My Profile (the trainer's own editor and status); My Studio → Team (whose week is waiting, and the Review). `proposedBy` is read by the Review's line "Proposed by Sam Lee on Sep 27." (since Sep 27 2026) |
| `…final` (+ `finalAt`, `finalBy`) | A studio leader, on My Studio → Team → Review → Agree | Team's week check (the next seven days' bookings against it) and its rows; My Profile ("Agreed by … on …", and what a change would change) |
| `…trainerId`, `trainerName` | Both writes (a trainer's own write never changes `trainerId` once the week exists, since Sep 27 2026) | The week check matches bookings by `trainerId` (a booking carries the `trainers/{id}`); the rows name the person |
| `…away` — `[{id, from, to, note}]` (voice review follow-up, Sep 27 2026) | `setAway`: the trainer on My Profile → My standing week, a leader in Team's Review; no agreement needed, at most six ranges still to come | The week check (skips those days and counts them as `awaySlots`), Team's "{name} is away …" lines, both Away editors, and a colleague's Standing week card |
| New readers of existing fields (Sep 27 2026) | — | A schedule row's `mindbodyStaffId` is read by the week check, only ever to confirm that a booking IS the trainer's; `trainers/{id}.mindbody.siteId` is read by `staffIdsAt` to decide whether that staff id counts at a studio |

The week check counts nothing and ranks nobody: it says, one sentence per slot, where the bookings differ from the agreed weeks.

Every number the codex shows about her history keeps the migration rules: the Story's since line and the header's session counts are one computation, a FileMaker client is never called new, and a count of her Journey sessions says "in Journey".

## What the voice review follow-up changed (Sep 27 2026)

| Field | Written by | Read by |
| --- | --- | --- |
| `bug_reports/{id}.userId` | The feedback drawer — the filer's Firebase **Auth uid** since Sep 27 2026 (it was the trainer document id, which differs on older accounts) | Trainer Settings' "Your reports" (`useMyFeedback`), under the read rule that compares it to the signed-in uid. Older reports an older account filed under its trainer document id stay unreadable to their author, as they always were |
| `networks/{id}.relayFocus.setAt` | Operations → Overview → All my studios, on each focus save | Its first reader: the Focus editor's "Set by {name} on {date}." line (it was a write with no reader) |

## What the whole-read record added (Sep 27 2026)

The first piece of Openings, shipped on its own (`docs/rounds/2026-09-27-coverage-record.md`):

| Field | Written by | Read by |
| --- | --- | --- |
| `studios/{s}/scheduleCoverage/{yyyy-mm}.days` — the studio days a pull Mindbody answered in full read, on the day before, the day or after (at most 31 a month, add-only) | The iPad that pulled, straight after a whole pull whose answer held the studio's bookings (an empty answer is swept on by nothing, so it records nothing: `studioAnswered`, a result field of the sync that only `readWhole` reads): the background pull and the header's and calendar's Refresh record today and tomorrow; Operations → Mindbody's Sync records every day it asked for, up to tomorrow (`features/openings/coverage-record.ts`) | The Sunday job's Openings step (`server/openings-step.ts`: which past days count toward Openings' usual week, through `wasReadInFull` in `features/openings/coverage.ts`) and `scripts/openings-report.ts`, since the Openings round. It was written ahead of its reader on purpose, because a day can't be recorded as read in full after the fact, and without the record Openings could call a partly read week "usually has room" |

## What Openings added, and who reads it (Sep 27 2026)

The Openings round (`docs/rounds/2026-09-27-openings.md`). Openings never counts, totals or ranks trainers' free time: its lines run by time, and a mark sits beside the numbers, never in place of them.

| Field | Written by | Read by |
| --- | --- | --- |
| `studios/{s}/watch/openings.v` | The Sunday job's step 8 (`server/openings-step.ts`), each Sunday, for every linked studio and the Demo studio | The reader's guard (`readSummary`): any other version reads as "couldn't be read" |
| `…builtAt` (an ISO string) | The same | The "Built Sunday, Oct 4" line, an old summary's date (more than 8 days), "the first words can come on …", and next Sunday's job (where it closes an agreed week that is gone) |
| `…tz` | The same (the studio's clock the job used) | **Nothing yet.** The screens use the studio's own clock from the studio document. A write with no reader, on the work list: a screen could say when the studio's clock changed since the summary was built, or the job could stop writing it |
| `…row` (30) | The same | The grid's rows (the half-hours between the first and last time anyone was booked or in) |
| `…since` | The same (the first Monday with a counted day; carried from last Sunday when older) | The usual week's since line ("From the weeks Journey has read in full since Oct 5"), and next Sunday's job |
| `…weeks[].m`, `…weeks[].d` (`n`, `x`, `j`, `q`) | The same | Every "N of M" count; the sheet's "Not counted" lines (`x`: not read in full, or closed or nearly) and "Not judged" lines (`q`: a trainer's week wasn't agreed, or a booking couldn't be placed); the day's usual count for the closure test |
| `…who` (short key → `{id, n}`) | The same | The names in sentences (someone who has left included), and next Sunday's carry of the agreed weeks |
| `…agreed` (the agreed weeks in force, kept eight weeks back) | The same | Next Sunday's job only (`historyOf`): it is the only history of agreed weeks there is, so a changed week keeps its past. Who was usually in comes from the cells' `i`, not from here |
| `…cells` (`s`, `b`, `r`, `c`, `l`, `i`) | The same | Every word on the grid; the time's sheet (booked, rotation, cancellations and late ones, who is usually in, more booked than the agreed weeks have in); Next 7 days' "usually full"; A new regular time; the Wrap-up's Most weeks and whether it shows its door; the Overview's line. `i` is stored only on judged days, so a missing one means "not known" |
| `studios/{s}/openingsMarks/{weekday-HHMM}.weekday`, `.time` | A time's sheet on Openings (`features/openings/ui/marks-store.ts`), as the person signed in | The rules' id check, and the grid's key for the mark |
| `…mark` (`full` Always full, `room` Usually has room) | The same | The grid's "Marked"; the time's sheet (the mark first, and whether the bookings disagree); Next 7 days (Always full counts as usually full); A new regular time and the Wrap-up's sheet (Always full is never offered, Usually has room is); whether the Wrap-up shows its door; the Overview's line |
| `…note` (at most 200) | The same | The time's sheet, in quotation marks under the mark |
| `…by` (`{id: the Auth uid, name}`) | The same (the rules pin `id` to the caller) | The sheet's "Marked … by Jo" (or "by you"), and A new regular time's offer sentence |
| `…at` (the server's time) | The same (the rules pin it to the request's time) | The sheet's date, and the 60-day review ("Marked 64 days ago. Still true?") |
| New readers of existing fields | — | `studios/{s}/standingWeeks/{uid}.final` (up to 21 blocks since this round) is read as who is in by the Sunday job and Next 7 days, and shown on Who's usually in, with `away`. A schedule row's `startTime`, `endTime`, `status`, `cancelledAt`, trainer and staff fields are read by the Sunday job (eight weeks), Next 7 days, "booked again from" (by client) and the coming weeks. The sync lease's `lastDeepScheduleSyncAt` answers "was the month read in full today" (`monthReadToday`) for A new regular time, "booked again from" and the Wrap-up. The Wrap-up's Next card reads her own `schedules` from now on. **Your week** reads the studio's `sessions` (`createdAt`, `hostedAtStudioId`, `trainerId`, `status`, the times) and `studios/{s}.sessionMinutes` and `journeyCutoverDate`; **My clients** reads `clients.trainerTally`, `renewal.coachIds`, `lastSessionDate`, `homeStudioId`, `isActive` and the prior-history fields |

**`lastSessionDate` has two writers.** Journey writes it at Finish and on import, and the Mindbody webhook writes Mindbody's `lastVisited` into it when Mindbody sends one. My clients says "Last in Journey", so a Mindbody visit Journey never logged could be read as a Journey session. Separating the two is a Cloud Functions change and waits on AJ (the round's "Open, for AJ").

---

## The audit this implies

Each field we store should be traceable to a reader. When a round adds a field,
the round says which screen reads it. When a round finds a field nothing reads,
it either builds the reader or records why the field should go.
