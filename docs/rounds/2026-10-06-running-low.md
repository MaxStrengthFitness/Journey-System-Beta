# Running low on sessions — Operations → Renewals · Oct 6 2026

Branch `oct6/running-low`, on master's `40b868a2` (the Oct 6 release).

## The ask

AJ, Oct 6 2026: "We already have a way to see how many clients are coming up to their renewal date. But we need a way for operations to show how many clients are running out of their sessions. Like anyone that has ten sessions remaining. In total."

The brief-back offered three choices; AJ took the recommended one each time:

| Question | AJ's answer |
| --- | --- |
| Where on Operations? | **Renewals**: a fifth number at the top of Clients → Renewals, "Running low"; tap it for the list |
| What number counts as running low? | **The studio's own**: the renewal conversation's number (`conversationAtSessionsLeft`, 10 unless a studio changed it on My Studio → Studio → Renewals), so the two never disagree |
| Count a client whose next package is already signed? | **Leave them out**: they aren't running out. Away clients stay in, marked Away; Inactive clients are left out |

## What it is

A package runs on two clocks (`src/features/renewals/README.md`). The pipeline's lanes and Operations → Month read the **date** clock: when the package effectively ends. Running low reads the **session** clock: everyone at or under the number, whether or not anyone has talked to them yet. "Talk now" is unchanged; it is still the to-do list (few left or ended, nothing decided).

**In total** is the nightly record's `sessionsLeft`: the sessions on hand, given sessions included, plus those still to come from payments not yet made. So a client paying monthly with 4 on hand and 6 payments to go (52 in total) is not running low, and one on the last payment with 8 on hand is. A row with a payment still to come says what its total is made of ("10 left in total: 2 on hand, 8 still to come"), so it never seems to disagree with the "on hand" the profile and the Directory show. It is Mindbody's number as of its last pull (packages are pulled when a sale happens, and near the end of a package on a day they train), never the job's count-down.

**Who is left out:** a visitor from another studio (the pipeline is the home studio's); an Inactive client (Mindbody's flag, a leader's mark that still holds, or past the studio's Inactive line with nothing booked: the Client Directory's rule, read off the nightly record); a client whose next package is already signed in Mindbody, or whose renewal, upgrade or downgrade a leader recorded; and a package that has ended or lapsed (Talk now and Lapsed already say those). A client whose total isn't known (no record yet, or not enough Mindbody data) is counted under the list ("Not counted: N clients whose sessions left aren't known yet"), never dropped and never called fine.

**The row:** the name (with Needs a leader when asked), "6 left · runs out around Oct 27" at the client's pace, and the pipeline's own next step ("Start the conversation", "Keep the conversation going", "Decided — record the outcome"); Away when away. Tap a row for the Renewal Brief. Fewest left first, then the soonest to run out, then by name. Since Oct 7 2026 (AJ: "Yes", `2026-10-07-renewals-dashboard.md`) each row is the renewals dashboard's row, `RenewalRow`, as the lanes draw it, with the plan picker; a record with no ledger yet keeps the words above in its Left now cell, and one with a ledger says the ledger and then when the sessions run out, unless the row's At the end already says it (`lowLeftNow`).

## Found on the way

The pipeline reads only clients whose package ends between six months ago and the end of the planning horizon (three months by default; `usePipelineClients`, by `renewal.focusDate`). A client who comes less than about once a week can have 10 left and a run-out date past the horizon, so they never reach **Talk now**. Running low counts from the studio's roster instead, so those clients show there. Talk now itself is unchanged; whether to widen its window is open.

**Fixed the same day** on `oct6/talk-now-roster`, on AJ's yes: the lanes read the roster too, and an Inactive client leaves Talk now, Before the charge and Coming up, on the Pipeline, Today, Week and Month alike (`2026-10-06-talk-now-roster.md`).

## The reads

No new Firestore query, no index, no Mindbody call, nothing written. The count comes from the studio's roster the app already holds (`useStudioRoster`, every client whose home is the studio, with last night's record), threaded from `AppContent` through Operations as `clientsStatus` so the tile waits while the roster loads and says "—" ("Couldn't read the client list") when it failed with nothing held, never a confident 0. The conversations for the listed clients join the pipeline's one chunked cycle read; the inactive marks are the app's shared listener (`useInactiveMarks`); the Inactive line is the studio setting (`useStudioSettings`, `inactiveDays`).

## Files

- `src/features/admin/renewals/running-low.ts` — pure: who counts, the Inactive rule off the record, the row's words; `running-low.test.ts`.
- `src/features/admin/renewals/RenewalsPipeline.tsx` — the tile and the list; `RenewalsPipeline.render.test.tsx` mounts it over a roster.
- `AdminRenewalsTab.tsx`, `../AdminDashboardView.tsx`, `src/AppContent.tsx` — the roster and its read passed through.

## Checks

Typecheck 2 (the baseline). Tests and build: see `CLAUDE.md`'s Tests row. The iPad walk is `docs/ops/TESTING-CHECKLIST.md`, Round 60.

## Shipping

The push alone: no rules, index, Functions or Mindbody change.
