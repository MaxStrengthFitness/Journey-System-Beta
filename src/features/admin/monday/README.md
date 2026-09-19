# Operations → Monday — the four questions

*Operations round (Round B of the Operations audit), Sep 2026. Replaces the Overview as the first screen of Operations (AJ, Sep 18: "the Monday page replaces Overview; today's floor snapshot is demoted, not kept as a screen of its own").*

`docs/ARCHITECTURE.md` §1.5 names the four questions a leader asks first, and AJ set the order on Sep 18: **renewals and conversation status · attendance anomalies · performance discrepancies · pain and incidents.** Each is a sentence with its proof, or "not enough data yet" — never a score. Under them, one line each for the Delight queue, Insights, Machine fit and Hours, which open their tabs. Today's floor is a strip of tiles at the top. Under "All my studios" the page is the network view (`../network/NetworkOverview`).

## Where each answer comes from

| Question | Source | Rule |
| --- | --- | --- |
| 1 · Renewals | the roster's nightly snapshots (`client.renewal`), the studio's cycles and settings — nothing new is read beyond what Operations → Renewals reads | `renewals/pipeline.ts` `laneOf` / `nextStep`, counted: talk now, before a charge, coming up, and how many nobody has talked to |
| 2 · Attendance | the same snapshots: the nightly job's pace (visits a week over eight weeks, from Mindbody bookings and Journey sessions), last visit, and its flags | a gap of **twice the client's usual gap** (`LONG_BREAK_MULTIPLE`, never under `MIN_BREAK_DAYS`) is a long break; the engine's `on-break` flag stands on its own when no pace is measured, and the proof says so; `missed-sessions` is its own anomaly; away, lapsed, unknown and inactive clients are not anomalies |
| 3 · Performance | **the weekly job** (`server/machine-trends-job.ts`, Sundays 3 AM Eastern) runs `performance.ts` over the 90 days of sets it already reads and writes `studios/{s}/watch/performance` | performed sets only, same weight, the latest set down by a third or more against the median of the last five earlier sets at that weight (at least five), and recent (`RECENT_DAYS`). AJ chose this over a per-open read (Sep 19): the set logs are indexed per client, not per studio |
| 4 · Pain and incidents | the last 14 days of sessions (`../sessions-range`, one read shared with the Insights and Hours lines), `clinicalIncidents` for the studio, and the studio's critical notes (`journalEntries` — a new index: `studioId, importance, occurredAt`) | pain = the Dial at −2 on a body region in the last 7 days; an incident is open until resolved (or while `surfaceUntil` runs); a critical note is live while its `effectiveUntil` runs, else for `CRITICAL_NOTE_DAYS` |

Every row opens the client. Rows are capped per question; "and N more on the tab" says so.

## What the page refuses to say

- Nothing about a client's rhythm until the nightly job has measured one (eight weeks). A client with no pace gets the engine's plain break flag and a proof line that says the rhythm is not measured.
- Nothing about performance until the Sunday job has written a document; "the weekly read has not run yet" is a different sentence from "nobody dropped".
- A failed read says so ("could not be read just now") and never counts as zero.

## The watch document

`studios/{s}/watch/performance` — `{version, studioId, builtAt, windowStart, windowEnd, rows, clients}`; each row is `{clientId, machineId, weight, reps, medianReps, priorSets, day, drop}`. No name, no body data: the page joins ids to the roster and the machine list it holds. Read by the studio's people (`writesForStudio`, the machineFit rule); written by nobody in the app (`allow write: if false`). A studio with nothing to report gets an empty document, so "ran and found nothing" reads differently from "never ran". `scripts/run-machine-trends.ts --commit` writes it from the PC before Sunday.

## Files

- `monday.ts` — renewals, attendance, pain, and this week's hours (pure; `monday.test.ts`).
- `performance.ts` — the drop rule and the document shape, shared with the job (`performance.test.ts`; the job's own test is `features/machine-fit/weekly-job.test.ts`).
- `MondayPage.tsx` — the screen and its reads; `MondayPage.render.test.tsx` mounts it over a studio's worth of answers.
- `../machine-fit/useFitFloor.ts` — the floor plumbing lifted out of the Machine fit tab so the "worth a look" line reads the same reports.
