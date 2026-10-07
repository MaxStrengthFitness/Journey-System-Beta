# The renewals dashboard — Operations → Clients → Renewals · Oct 7 2026

Branch `oct7/renewals-dashboard`, on master's `27484683` plus the Wrap-up fix (`40385a83`), built on the three Oct 6 renewals rounds (`2026-10-06-running-low.md`, `2026-10-06-talk-now-roster.md`, `2026-10-06-slipping-inactive.md`): the same lane rule, the same tiles, the same Running low list.

## The ask

AJ, Oct 6-7 2026: a renewal and retention dashboard for studio leaders and anyone at the studio. Track the month-to-month and paid-in-full clients running out of sessions. Sessions are never lost (a 12-month, 96-session contract can take 14 months), the commitment and the billing rate are separate (a 6-month commitment at the 18-month rate), clients can win extra sessions, and unused sessions roll over on auto-renew, so leaders must be ahead of it. Per client, at a glance: has anyone talked to them about renewing, the package (6, 12 or 18 months), the exact day the commitment ends, the sessions left in total, the sessions projected left on that day, the primary trainer, and the other signals that matter.

The packages (billed every 4 weeks; auto-renew on completion where the studio has it): The Trial, 6 months, 48 sessions, $70 ($560 a payment), prepay $67; Committed, 12 months, 96 sessions, $60 ($480), prepay $57; Life Transformed, 18 months, 144 sessions, $54 ($432), prepay $51; each prepay with 2 free workouts.

AJ's answers to the design's three questions:

| Question | AJ's answer |
| --- | --- |
| Where is the renewal plan recorded? | **"allow in app response"**: leaders (and anyone at the studio) record in Journey what was decided |
| Read the client's real rate from the Mindbody contract? | **"i believe so, we will say yes for now and build like that and i will confirm later and let you know if we have to change"** |
| Do won sessions arrive in Mindbody? | **"Yes added to mindbody"**: as pricing options, matched by the studio's extra-sessions names |

And: **"strongsville does not autorenew, allow on the new renewal dashboard for studios without auto renew to mark if a client is set to renew or not in some way manually"**.

## What was built

The data (the nightly snapshot `clients/{id}.renewal`, version 3, written by the nightly job only; `src/features/renewals/README.md`, "The renewals dashboard's data"):

- **The session ledger**: sessions left part by part, "52 left: 9 rolled over · 11 this contract · 32 to come · +2 extra". Never a second balance: its total IS Mindbody's sessions left.
- **The projection at the commitment's end**: "About 14 left when the commitment ends Mar 3 (11–17)", or "Runs out around Jan 20, 6 weeks before it ends", or "Not enough to project yet" below 21 observed days. The 8-week pace, away time left out, a range from the slowest and fastest 4-week pace.
- **The rate**: Mindbody's scheduled charge, "at $54 a session (special)" when it differs from the table; else the table's. The Brief's Options compare with it.
- **Retention signals**: coming less or more (last 4 weeks against the 8 before), nothing booked, sessions in all (before Journey included), a package that fits the pace clearly better.
- **The renewal plan** on the cycle document `studios/{s}/renewals/{cycleKey}.plan`, one touch of kind "plan" on the conversation history each time. A contract that renews by itself: Let it renew · Pause billing in Mindbody until sessions run low · Not renewing · Not decided yet. One that doesn't (Strongsville): Renewing, same package · Upgrading · Downgrading · Pay as you go · Not renewing · Not decided yet, with the package. Anyone who works at the studio may set it; a leader's outcome is never overwritten.
- **The name matcher**: a suggestion for each Mindbody name nobody has matched (Strongsville had 44, so 130 clients read "Missing Mindbody data"), confirmed one by one or all at once in My Studio → Studio → Renewals.

The screens (`README.md`, "The renewals dashboard's screens"): one row for every lane on Operations → Clients → Renewals and for My renewals on a trainer's own profile (`RenewalRow.tsx` over `row-facts.ts`), the plan picker on it, two filters (Plan: not decided · Not renewing), and one line on the pipeline when names are waiting ("44 names waiting" · Review suggestions).

## The review's fixes

A review of the eight build commits found three majors and nine minors. Applied (`Review:` commits):

- **Bookings are not taken off twice.** The design subtracted the days booked ahead from sessions left. Mindbody most likely takes a session off a pricing option's Remaining when the visit is booked, and if it does, every regular's standing bookings would count twice: banked at the charge, the run-out day, the will-bank situation and its charge warning, and Running low's order would all move. `MINDBODY_REMAINING_INCLUDES_BOOKED` ships **true**: every number is what it was before this round. The arithmetic for the other answer is kept and tested; flip the one constant only after the check below.
- **No made-up upsell.** With the current package unknown (most of Strongsville's unmatched clients), every package tied and the longest won, so the row would have said "At their pace, Life Transformed fits best". Now nothing is suggested without a known package, and another package only when it fits the pace better by a quarter of a session a week.
- **No plan over one nobody has seen.** The picker was offered while the conversations were loading or after their read failed, so a save could replace a plan unseen. Now the row says "Checking…" or "Couldn't check" there, and the plan filters match nobody, never everybody.
- A name with both a package's number and an extra word ("SV 18 Months/144 Sessions PIF + 2 Free") gets no suggestion; "6-Month" reads as months.
- A contract whose whole package Mindbody issued up front on one option holds its payments' sessions already: nothing is added for payments to come.
- The (i) says the extras the way the ledger does ("50 + 2 extra left, …").
- "Special" only when two scheduled charges agree and no other amount is as common; the Brief's "Vs today's rate" is what the client pays; the unread `valueAtStake` is gone.
- A leader's Decided still asks to record the outcome whatever the plan says; a charge day that has passed is no longer named as a deadline.
- Confirm, Confirm all and Match to never add a name past a list's limit (60 a package, 40 extras), where Save would have dropped it without a word; the panel names those that didn't fit. The unused one-tap write is gone.
- The row says less: no "None to mention", no "Not known yet"; two lines from 640px (was 560), the plan column can shrink, words break between words.
- A snapshot without a pace stores no week count, so it isn't rewritten every night for nothing.

Left as they are, with the reason:

- **Each cell's caption under 840px.** The phone and upright layouts have no header row, so a cell without its label would be a number without a name; on its side the labels move to the header.
- **`ledger.asOf` changes when the packages are pulled.** That pull happens at a sale and near a package's end (the cost plan), not nightly, and leaving it out would make the (i)'s "Sessions left from Mindbody, Oct 5" stale.
- **Running low's Left now** says the total its own way on a record with no ledger yet ("13 left … in total", its round's words, extras included); with a ledger it says the ledger, extras beside the package's number, as the lanes do. Both are the same total.

## Deploy order

**`scripts/ship/ship-renewals-dashboard.ps1`**, from `.claude\worktrees\renewals-dash`: `-Stage prepare`, then `-Stage golive`. It expects master on GitHub to be exactly `27484683` (fetched Oct 7 2026) and stops otherwise, so anything that reaches master first is merged in and tested again before this ships. **The Wrap-up round ships with it**: this branch was built on `40385a83`, the Wrap-up fix merged onto master's `27484683`, and that fix is not on master yet, so the push carries both and `ship-wrapup.ps1` is retired (it would refuse anyway: it expects master at `40b868a2`). Round 59's Wrap-up lines are walked with Round 63.

What golive does, stopping at the first failure:

1. Tags master as it is now, `restore/2026-10-07-before-renewals-dashboard` = `27484683`, and pushes the tag.
2. `npm run test:rules` again (323 passing on this branch; if it fails, stop), then `firebase deploy --only firestore:rules`: the plan's branch, `plan` on the leaders' list with its shape check, plan touches. Rules only ADD access, so the running app is unaffected. Then it checks the ruleset LIVE on the named database holds `renewalPlanValid` (with gcloud, or AJ types LIVE after looking in the console). No new index (no new query shape).
3. `git push origin oct7/renewals-dashboard:master`, fast-forward only, after a fresh fetch shows master hasn't moved.

Then by hand (golive prints them):

4. Render: **Manual Deploy** of the web service (`version.json` names the new build), and **Manual Build** of BOTH crons, `journey-cron-renewals` (the version-3 snapshot) and `journey-cron-leaderboards` (the Wrap-up fix's machine totals read): a push deploys nothing on Render (`c8b2a5cb`). The renewals job runs at 2:30 AM Eastern; its first run on the new commit rewrites each snapshot to version 3. Until then a row on a version-2 snapshot says "N left" and the charge date, and no "At the end".
5. **Strongsville's auto-renewal Off**, the same day, before that run: My Studio → Studio → Renewals → Auto-renewal → Off, Save. The plan picker reads the snapshot's decided answer, so Strongsville's rows offer Renewing, same package · Upgrading · Downgrading · Pay as you go · Not renewing · Not decided yet from the next night's run. Mindbody's own flag on a contract, a trainer's On auto-renewal box, or a package's own answer still wins over the studio's for that client (`auto-renew.ts`), and a paid-in-full client always gets this second list.
6. The three checks below, then the names (Confirm, or Confirm all, then Save settings), then Round 63 of `docs/ops/TESTING-CHECKLIST.md` the morning after the first run.

To undo: `git push --force origin restore/2026-10-07-before-renewals-dashboard:master`, then the same three Render buttons. The rules can stay (they only add access, and the older app never writes a plan); plans already saved stay on their cycle documents, unread; the older job writes version-2 snapshots again the next night (it replaces the whole `renewal` field).

No Cloud Functions, no Mindbody calls, no Firestore structure change beyond the optional fields on `clients/{id}.renewal` (job-written) and `studios/{s}/renewals/{cycleKey}.plan`.

## Not built this round

- **A manual rate.** AJ's answer was to read the rate from Mindbody "for now" and confirm later; the design left out an override field on purpose. If a client's Mindbody charge is wrong, nothing in Journey corrects it yet.
- **One-tap name confirm** (question 3): kept at two taps, on AJ's "keep". **Running low on the dashboard row** (question 5) was built after his "Yes" (below).
- **The plan moving a client between lanes** (question 2): the plan changes the row's next step only, on AJ's "keep them there"; the lanes still move on what Mindbody says.
- **Booked visits taken off sessions left**: the arithmetic is built and tested, switched off until the first check below says Mindbody's Remaining doesn't already leave them out.

## Check before trusting two things

**The first is answered (Oct 7 2026, the Ahead round, from Journey's own synced data):** Remaining does NOT drop when a visit is booked. 60 clients across the four studios showed Remaining plus their visits booked ahead more than their pricing option ever held; none showed the opposite. `MINDBODY_REMAINING_INCLUDES_BOOKED` is now false (`docs/rounds/2026-10-07-ahead.md`). The other two below are still open.

- **Does Mindbody's Remaining already leave out booked visits?** Pick a Strongsville regular with standing bookings. In Mindbody note the pricing option's Remaining, then book one more visit for next week and look again. If Remaining went down by one: it already leaves them out, and nothing changes (the switch stays true). If it didn't: tell Claude, and `MINDBODY_REMAINING_INCLUDES_BOOKED` becomes false (the projection then takes the booked days off first).
- **"w/ Roll Over" options at Strongsville**, before pressing Confirm all: open one contract client's "48 Sessions w/ Roll Over" (or 144) option and compare its count with the contract's payments. A count of 8 a payment is the usual case; the whole 48 or 144 up front is now handled (nothing to come), but say if it is something else.
- **Tax in the charge:** look at one Solon and one Strongsville contract's next scheduled charge. If it is the package price plus tax, every client there would read "(special)"; tell Claude and the rate will compare before tax.

## AJ's answers (Oct 7 2026)

The seven open questions, answered the same day, and what changed:

| # | The question | AJ | What changed |
| --- | --- | --- | --- |
| 1 | The ledger's "+2 extra": keep "extra", or "given or won"? | "Extra is fine unless you can come up with a better" | Nothing: "extra" stays, the profile header's word |
| 2 | Should Let it renew or Pause billing take a client off **Before the charge**? | "keep them there, they will be gone when the month rolls over" | Nothing: only the new contract in Mindbody moves a client out of a lane |
| 3 | Confirm then Save settings (two taps), or one tap that saves? | "keep" | Nothing: two taps |
| 4 | Should **Not renewing** keep a client whose latest conversation leaned not renewing? | "I want to know the people that had the conversation that month so it's not bad to just keep them in the same spot" | The filter is unchanged; one line under the filters, while it is on, says so: "Includes a plan of Not renewing, and anyone whose latest conversation leaned not renewing unless a plan says they're renewing." (`pipeline.ts` `FILTER_HINTS`) |
| 5 | Should Running low's list use the dashboard row? | "Yes" | Running low draws each client with `RenewalRow`, as the lanes do, plan picker included, in portrait and landscape by the list's width. Left now still says when the sessions run out, as the list always has: a record with no ledger yet (before the first version 3 night) keeps Running low's own words (`leftLine`); one with a ledger says the ledger, then "runs out around …", unless At the end already says it (`running-low.ts` `lowLeftNow`, the review). A client in both Talk now and Running low has a picker in each; a save in either refreshes both |
| 6 | Shorten the long plan labels? | "fix" | The picker says Let it renew · Pause billing · Same package · Upgrading · Downgrading · Pay as you go · Not renewing · Not decided yet, at most 15 characters (`PLAN_LABELS`, held by `plan.test.ts`). The whole meaning (`PLAN_WORDS`) is the line under the picker while choosing, the plan's sentence once saved ("Pause billing in Mindbody until sessions run low · Jen, Oct 6"), and the conversation history. The stored ids and the rules' list are unchanged |
| 7 | Warn before names adopt Max Strength's table as a studio's own? | "yes" | At a studio that has never saved a package table of its own, Names seen in Mindbody says once, beside Confirm: "Strongsville has no package table of its own yet: saving here makes Max Strength's standard prices Strongsville's own. Check the prices in Packages above first." It shows while a name waits or a package change is unsaved (by value, so an edit undone puts it away; the review), and never stops the save (`RenewalSettingsPanel` `ownPackageTable`, from `useRenewalSettings`) |

No rules, index, Functions or Mindbody change: the ship script's deploy order stands.

## Measured

After AJ's answers and the review's fixes: typecheck 2 (the baseline), 12,316 tests passing in 765 files (`TZ=America/New_York npx vitest run --dir src --testTimeout=30000`), rules tests 323 (`firestore.rules` untouched), production build clean, the first screen 462.5 KB gzip inside the 480 KB budget (`scripts/check-bundle-budget.mjs`).

Before them: typecheck 2 (`charts.tsx`, `EditTrainerModal.tsx`, the baseline). Tests: 12,307 passing in 765 files (`TZ=America/New_York npx vitest run --dir src --testTimeout=30000`; 12,204 in 759 before the round). Rules tests 323 (316 before; 7 for the plan). Production build clean; the first screen 462.6 KB gzip, inside the 480 KB budget.
