# Renewals

Round: **Renewals**, Sep 10–11 2026. The plan is `OPERATIONS-RENEWALS-PROPOSAL.md` in the repo root: §11 records what changed from it, and `RENEWALS-ROUND.md` covers shipping. The business rules are in `docs/business/renewals.md` and `docs/business/packages-and-pricing.md`.

## The idea in one paragraph

A package runs on **two clocks**. Billing sends a payment every 4 weeks (6, 12 or 18 of them) and then auto-renews. Sessions arrive 8 per payment and never expire. A client who comes 1.5 times a week is still holding sessions when billing finishes. That is the studio's biggest renewal problem, and the reason this feature exists. Every night the app works out both clocks for every client and puts them in exactly **one situation**, always shown as a sentence:

| Situation | Sentence | Trigger |
| --- | --- | --- |
| on-track | "9 sessions left · auto-renews Nov 14 · on pace" | — |
| will-bank | "Auto-renews Nov 14 with about 16 sessions still banked" | 4+ sessions still banked at the charge (a studio setting). Inside the warning window (30 days) it is "before the charge" |
| will-run-out | "Out of sessions around Oct 3, 6 weeks before billing ends" | — |
| away | "Snowbird until Apr 1 · clocks paused" | Vacation / Snowbird / Medical, or the MIA pause |
| ended | "Package ended Sep 1 — no new one in Mindbody yet" | Inside the studio's lost window |
| lapsed | "No package since Jul 20" | Past the lost rule: win-back |
| unknown | The first data gap, in words | Not enough Mindbody data to say |

The conversation is due at the studio's threshold (10 sessions left by default). A renewal **already signed in Mindbody** ("on the books") ends it: the client stops being prompted.

## Where things are

| File | What |
| --- | --- |
| `types.ts` | Settings, the snapshot, cycles, conversations |
| `settings.ts`, `settings-form.ts` | Defaults (the website's prices), cleaning, the package-name index, the settings form |
| `engine.ts` | **The engine.** `buildRenewalSnapshot()` — pure, the same code in the browser and the nightly job |
| `attendance.ts` | Bookings and workouts → visit rows; `attendanceSince` (unknown before the first synced booking, not zero) |
| `sentences.ts`, `options.ts`, `brief.ts` | Words: chips, situations, pace, proof; the package-options table; the Brief's journey and health lines |
| `conversation.ts` | The 15-second conversation log and the post-session prompt |
| `pipeline.ts` | Operations lanes, filters, next steps |
| `outcomes.ts` | How a package ended — the nightly job's decisions |
| `rates.ts` | Outcomes counted up for the leader-only Outcomes view; quarters |
| `job-plan.ts` | Who gets a Mindbody pull tonight; Mindbody names seen |
| `permissions.ts` | Who may do what — mirrors `firestore.rules` |
| `use*.ts` | Firestore reads and writes. Nothing else here touches Firebase |
| `*.tsx` | Trainer surfaces: the Renewal card, the log dialog, the briefing line, the Hub lane, My renewals |
| `../admin/renewals/` | Operations → Renewals: the Pipeline, the Renewal Brief, Outcomes, Settings |
| `server/renewals-job.ts` | The nightly job (Render cron `journey-cron-renewals`, 06:30 UTC); `scripts/run-renewals.ts` runs it from the PC, as a dry run by default |

## Data

| Where | What | Written by |
| --- | --- | --- |
| `clients/{id}.renewal` | The snapshot. Dates, never countdowns | **The nightly job only.** The rules refuse app writes that change it |
| `studios/{s}/config/renewals` | Settings and the package table | Leaders |
| `studios/{s}/config/renewalsSeen` | Every Mindbody name met at the studio | The job |
| `studios/{s}/renewals/{cycleKey}` | One package term: the latest conversation, plus stage, lead and outcome | Trainers (conversation fields only), leaders, the job (outcomes) |
| `.../touches/{id}` | One conversation. Never edited | Trainers; a leader can delete a mistake |

`cycleKey` is the Mindbody contract id, or `pif-<pricing option id>` for paid in full.

**A cycle is checked as a whole document.** A leader's write must fit `renewalCycleKeys()` in `firestore.rules`. Every field the job writes (`outcome`, `outcomeBy`, `outcomeAt`, `nextCycleKey`, `nextPackageKey`, `closedOn`, `primaryTrainerId`) is on that list. A new job field must go there too, or leaders are locked out of that cycle.

## Decisions

- **Sessions left = sessions on hand (pricing options) + 8 for each payment still to come.** The count is Mindbody's; an estimate says so. Complimentary "Session Comp" sessions count; unmatched pricing options don't, and they show as data gaps.
- **Dates are UTC days for Mindbody** (`mindbodyDayKey`) and studio days for everything else.
- **Pace** is visits a week over the last 8 weeks, rounded to a quarter. It skips away time and never reaches back before the current package or the studio's first synced booking. It needs 21 observed days.
- **Away beats ended and lapsed.** Snowbirds are not churn.
- **One snapshot write per change.** The job compares with `sameSnapshot` and writes only what changed. Single-client screens work the snapshot out live (`useLiveRenewal`) instead of calling a server endpoint: the web service has no Firestore admin key.
- **Outcomes** (`outcomes.ts`):
  - A newer package means renewed, upgraded or downgraded (by months). If the newer package has an earlier start, the engine only changed its mind: ignored.
  - The lost rule means lost, but only inside the 180-day lapsed list; anything older is pre-app history.
  - The job takes back its own "lost" if the client returns on the same package.
  - Pay-as-you-go is recorded by a leader.
  - A leader's outcome is never overwritten.
  - `closedOn` is the day the package ended, or the day it closed early.
- **Rates** are for leaders only. They count kept ÷ closed. Pay-as-you-go follows each studio's setting. A trainer needs 5 outcomes before showing, and is credited with the closing package's most-coached visits over its last 90 days.
- **No outreach.** Nothing here contacts a client or a trainer.

## Tests

Every pure file is tested beside itself (`options.ts` inside `sentences.test.ts`); the `use*.ts` hooks are thin Firestore wrappers. The engine suite covers both clocks, the four situations, paid in full, away, pace windows and a renewal on the books. The rules are tested in `tests/firestore.rules.test.ts` (search "RENEWALS").
