# Talk now from the roster — Operations → Renewals · Oct 6 2026

Branch `oct6/talk-now-roster`, on master's `c7dd1ad3` (Running low).

## The ask

Two gaps in the pipeline's **Talk now**, found the same day while building Running low (`2026-10-06-running-low.md`, "Found on the way"):

1. **A slow client never reached Talk now.** The pipeline read its own window of clients: packages ending between six months ago and the planning horizon (three months by default), by `renewal.focusDate`. A client with 8 left at a quarter a week runs out in about 32 weeks, past the horizon, so the conversation was due but Talk now never showed them. Running low and Operations → Today, which count from the roster, did.
2. **A client a leader marked Inactive still showed.** The lanes and Today's renewals count skipped only Mindbody's own inactive flag (the pipeline did not even skip that), never a leader's mark or the studio's Inactive line. Running low already left them out.

The brief-back offered one list and one Inactive rule for the Pipeline, Today and Week. AJ said yes and answered its two questions with the recommended choice each time:

| Question | AJ's answer |
| --- | --- |
| Reading the whole client list could let Away list every away client, not just those whose package ends in the next 3 months. Which? | **Keep Away as it is**: only Talk now changes |
| Month also shows a marked-Inactive client with a "Talk now" badge. Apply the same rule there? | **Same rule on Month** |

## What changed

**One list.** The pipeline's lanes read the studio's roster the app already holds (`useStudioRoster`), the same list Running low, Today, Week and Month read, and only the studio's own clients (`homeStudioId`). The pipeline's own query (`usePipelineClients`) is gone.

**One rule.** `src/features/admin/renewals/lanes.ts` places a roster client in a lane, and the Pipeline, Today (`renewalsQuestion`), Week (the same) and Month (`monthRenewals`) all ask it:

- **Home only.** A visitor booked here is their own studio's renewal. Today and Month used to count one.
- **Inactive leaves the to-do lanes.** Before the charge, Talk now and Coming up leave out an Inactive client, by Running low's rule (`inactiveOnRecord`): Mindbody's flag, a leader's mark that still holds, or past the studio's Inactive line (90 days by default) with nothing booked. Booked ahead is never Inactive. **Lapsed and Away are untouched**: the inactive round kept Renewals' lost list its own list ("Organized separate lists"), so an Inactive client recorded as lost is still on Lapsed. A failed read of the marks hides nobody.
- **Away as it was.** The Away lane still lists only a package ending in the old window (six months back to the horizon). Month lists Away by the month the package ends, as before.

**Month** follows the same rule: an Inactive client is off its renewals list except on a Lapsed or Away row, and it is not counted among the renewals whose timing is unknown either. Its (i) says so.

**The page waits.** The lanes, like Running low, say nothing until the roster, the marks and the studio's Inactive line have answered. Before, the lanes drew "Nothing in this lane right now" while they loaded. A roster that failed with nothing held says so once ("Couldn't read the client list. It tries again by itself.") and every count from it is "—", never 0. One that failed after it had answered keeps what it holds. Today, Week and Month leave their renewals line out until the marks have answered, so a marked client is never counted for a moment.

## What a leader will notice

- Talk now (the tile and the lane) can grow by the slow clients. They are the ones Running low already listed who weren't in Talk now.
- Talk now, Before the charge and Coming up can shrink by the Inactive clients.
- Today's "N renewal talks due now" and the Talk now tile agree. `RenewalsPipeline.render.test.tsx` holds them to it over the same roster.
- Week's renewals count follows the same rule. It still reads no conversations, so a renewal decided in a conversation still counts there, as before.

## The reads

No new query, no index, no Mindbody call, nothing written, no rules change. Firestore reads go **down**: the pipeline no longer opens its own listener on up to 500 client documents each time it opens. The conversations it reads are only those for clients a lane could hold, plus the Running low list, in the one chunked read as before. Today adds the leaders' inactive marks (one listener the app shares, a handful of small documents, often already open for the Journey or the Client Directory). Week and Month already had it.

The composite index `clients (homeStudioId, renewal.focusDate)` in `firestore.indexes.json` now serves no query. It is left in place: removing it is a separate index deploy, AJ's call.

## Files

- `src/features/admin/renewals/lanes.ts`: the rule (`renewalLane`, `mayHaveLane`, `leftOutAsInactive`, `homeRecord`, `inPipelineWindow`), with `lanes.test.ts`.
- `src/features/admin/renewals/RenewalsPipeline.tsx`: lanes from the roster, the one loading and failed state; `RenewalsPipeline.render.test.tsx` mounts it over a roster.
- `src/features/renewals/usePipeline.ts`: `usePipelineClients` removed.
- `src/features/admin/overview/questions.ts` (`renewalsQuestion` takes the rule's context), `TodayBrief.tsx`, `../week/WeekPage.tsx`, `../month/month.ts` and `MonthPage.tsx`, with their tests.

## Checks

Typecheck 2 (the baseline: `charts.tsx`, `EditTrainerModal.tsx`). Tests and build: see `CLAUDE.md`'s Tests row. The iPad walk is `docs/ops/TESTING-CHECKLIST.md`, Round 61.

## Shipping

The push alone: no rules, index, Functions or Mindbody change. It goes on top of Running low (master's `c7dd1ad3`).

## Left open

- **Today's Slipping away** works the Journey's states out without the leaders' inactive marks (`studioJourneys` in `TodayBrief.tsx` is not given `marks`, while Week, Month and Clients → Journey are), so a client a leader marked Inactive can still be listed there as Drifting or At risk. Same family, a different section; not changed here. **Fixed the same night** on `oct6/slipping-inactive`, on AJ's yes (`2026-10-06-slipping-inactive.md`).
