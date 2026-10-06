# The night's month tally — Hours and Insights from one document a month

*Speed round, Oct 5 2026 (R27; AJ: "i need this app running optimally and not having long moments of stalling").*

Hours and Insights used to read a studio's raw sessions every time they opened: a month for Hours, up to ninety days for Insights, whole session documents, capped at 1,500. The cap is reached at about 220 clients for a month and about 73 for ninety days, so a busy studio's numbers were quietly cut, and the read was the slowest thing on Operations.

## What the night writes

Step 6 of the nightly renewals job (`server/month-tally-step.ts`, run at the end of each studio's second look, in its own catch) reads the sessions trained at the studio since five months back — the screens' own query, hosted at the studio by `createdAt`, on the existing (hostedAtStudioId, createdAt) index, `select`ed to the fields the sums use — and writes, for the current month and the four before it:

| Document | What it holds | Read by |
| --- | --- | --- |
| `studios/{s}/watch/hours-YYYY-MM` | Hours' counts: per trainer, sessions per week and the measured minutes; no trainer, still open. Small. | Hours (one studio, and "All my studios", one per studio) |
| `studios/{s}/watch/sessions-YYYY-MM` | Every session of the month as one short line: its day, when it was logged, trainer, client, machines, measured minutes and five yes/no facts (completed, note, feel, cross-train, first session). No names, no note text. | Insights |

Both hold **closed days only**: up to `throughDay`, the studio's yesterday when the job ran. Both say `liveFromMs`, where the screen's live read starts, and `lateIds`, the sessions the night counted from that stretch, so a session logged while the night was reading is counted once.

Only the studio's leaders, franchise owners and administrators read them (the rules' `wave2Leads`, as `watch/journey`); nobody writes them from the app.

## What the screens do

`night.ts`: ask for the night's document; if it is usable (`usableHoursDoc` / `usableSessionsDoc`: this version, this month, `throughDay` at least yesterday, not too big), add one live read of the studio's sessions since `liveFromMs`. Otherwise read the raw window as before. A failed read is unknown, never empty. The sums are the same functions the raw read goes through (`hoursTally`, `studioSummary`, `trainerMetrics`, `returnRate`), run on the lines turned back into sessions (`rowAsSession`), so the two paths cannot disagree; `month-tally.test.ts` holds them equal.

A session the night counted as still open is named in both documents (`openIds` on Hours', `open` on the lines, a handful). The screen reads those again by id, ten to a read, beside the live read: one finished since is counted at once, one discarded leaves the open line, and one the read could not reach stays as the night saw it (never guessed closed). What a night still can't see until the next one: an edit to, or a removal of, a past session it counted as completed. A past session logged today is counted today.

## Files

- `month-tally.ts` — pure: the line, the encoding, Hours' counts, the merges, which months a window needs. `month-tally.test.ts`.
- `night.ts` — the screens' reads and `useStudioHours` / `useNightHoursMany`.
- `month-tally-step.test.ts` — the job's step against a Firestore of plain maps, and that a failure in it leaves the night standing.
- `server/month-tally-step.ts` — the job's step.
