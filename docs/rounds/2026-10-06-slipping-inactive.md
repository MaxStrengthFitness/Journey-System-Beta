# Slipping away and the leaders' inactive marks — Operations → Today · Oct 6 2026

Branch `oct6/slipping-inactive`, on master's `c8b2a5cb` with the two Talk now commits (`oct6/talk-now-roster`, `4b8ab831` and `0cbbfaa4`) copied on top, because this fix uses the marks read Talk now added to Today.

## The ask

Talk now's round left one thing open (`2026-10-06-talk-now-roster.md`, "Left open"): **Today's Slipping away** worked the Journey's states out without the leaders' inactive marks. `studioJourneys` in `TodayBrief.tsx` was not given `marks`, while Clients → Journey, Week and Month are (`useStudioJourneys`), so a client a leader marked Inactive could still be listed on Today as Drifting or At risk while every other page called them Inactive.

It happened two ways:

1. **Marked today.** Last night's record still said Drifting, the page trusted it, and the mark wasn't there to overrule it.
2. **Marked before last night.** The nightly job recorded the client as marked Inactive (`inactiveKind: "manual"`). A leader's mark is the page's to read, so Today worked the state out again itself, but without the mark, and landed on Drifting or At risk.

The brief-back offered the fix with one question. AJ said yes and picked the recommended answer:

| Question | AJ's answer |
| --- | --- |
| If the leaders' inactive marks can't be read, what should Slipping away do? | **List + one line**: list by the rules alone, with one line in the section, "The leaders' inactive marks couldn't be read just now." (Clients → Journey's way) |

## What changed

`src/features/admin/overview/TodayBrief.tsx`, the `journeys` memo:

- **Given the marks.** `studioJourneys` gets `marks: inactiveMarks.failed ? null : inactiveMarks.marks`, the same line `useStudioJourneys` passes. The marks come from `useInactiveMarks(studioId)`, which Today already opened for the renewals count; it is one listener per studio that the app shares.
- **Waits for them.** The memo returns null while the marks are loading, as it already did for the renewal settings, the studio settings and last night's record. Slipping away says "Reading…" in that moment, so a marked client is never listed for an instant.
- **A failed read hides nobody.** Every state is worked out by the rules alone, and the section says "The leaders' inactive marks couldn't be read just now." once, under its rows. When nobody is slipping the section still folds into All clear: an unread mark can only add a client to the list, never take one away.

Start huddle's slipping lines ("AJ may know why … hasn't been in") come from the same list, so they follow.

## What a leader will notice

- Slipping away can shrink by the clients a leader marked Inactive. They are on Clients → Journey → Inactive, as before.
- A marked client who books again reads **Back**, as on every other page, and is not slipping.

## The reads

No new read: the marks listener was already open on Today since Talk now. No Mindbody call, no index, no rules change, nothing written.

## Files

- `src/features/admin/overview/TodayBrief.tsx`: the marks passed and waited for, and the one line.
- `src/features/admin/overview/OverviewPage.render.test.tsx`: the Firestore fake answers the marks (rows, a refused read, an answer held back) and last night's record (`watch/journey` and `clientStates`). Six new tests: a marked client is not listed with no nightly record (nor asked about in the huddle), when last night called them Drifting, and when last night recorded the mark; "Reading…" until the marks answer; a failed read lists by the rules alone with the line said once; and no line when the marks were read. All but the last failed before the fix.
- `src/features/admin/overview/README.md`, `src/features/admin/journey/README.md`: one sentence each.

## Checks

Typecheck 2 (the baseline: `charts.tsx`, `EditTrainerModal.tsx`). Tests and build: see `CLAUDE.md`'s Tests row. The iPad walk is `docs/ops/TESTING-CHECKLIST.md`, Round 62.

## Shipping

The push alone: no rules, index, Functions or Mindbody change. Push this branch to master (`git push origin oct6/slipping-inactive:master`). It carries Talk now too; `oct6/talk-now-roster` itself no longer needs pushing, and can't be pushed as it is, because master moved on to `c8b2a5cb` after it was branched. Then Manual Deploy on Render's web service makes it live. Neither this nor Talk now changes anything the cron jobs run (nothing under `server/` or `functions/` imports the files changed), so a Manual Build on the two crons only keeps all three services on one commit, as `CLAUDE.md`'s Environments asks.
