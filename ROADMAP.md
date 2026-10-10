# Journey — Roadmap

**How to read this page.** It is the short working list and nothing else: what
is being done now, what has to happen before a trainer uses Journey for real,
and what is deliberately parked. It is re-cut at every gate.

- **History lives in `docs/rounds/CHANGELOG.md`** and each round's own notes in
  `docs/rounds/`. Nothing that is finished stays on this page.
- **The reasoning lives in `docs/ARCHITECTURE.md`** — purpose, the screen map,
  the data dictionary, the stage model. This page says *what next*; that one
  says *why*.
- **New here?** Read `docs/START-HERE.md` first. It explains the whole project
  in about fifteen minutes.

*Last re-cut: Sep 21 2026, after the catalog gate round. §5 and the follow-up
pile brought up to Sep 27 2026 after the voice review follow-up, and the
follow-up pile again after Openings the same night, after the directory and
opportunities round on Sep 28, and after the calm Hub the same night. The
status block below and the items that had been finished were checked against
`origin/master` on Oct 7 2026, and the status block again on Oct 9 2026
after the open session round; the follow-up pile is still as the Sep 28–29
rounds left it, so check a round's own document before trusting a line there.*

---

## Where the project stands (checked Oct 9 2026)

**Beta is Nov 1 2026** for the corporate locations, and **Jan 1 2027** for the
first franchises, rolled out in small batches (AJ, Sep 22). There are about
**forty locations** in total. Everything on this page is read against those two
dates.

The scale the app has to survive, stated by AJ on Sep 22 and not written down
anywhere before: the biggest studio has **~300 active clients**; a studio runs
**100-200 sessions a week**, some over 200; a busy Monday is **60+ sessions**
and a slow Wednesday is 4; and clients arrive carrying **10 to 200+ sessions
each** of FileMaker history.

Journey is **pre-alpha**. AJ is the only user; no trainer has run a real
session on it. `origin/master` is `546bb0aa` (Oct 9 2026, the first-session
rounds) and the Render web service serves that build (`/version.json`,
`2026-10-09T16:31:34Z-546bb0a`, checked Oct 9 2026); the rules live on the
named database are that commit's `firestore.rules`, the same text (read with
`scripts/check-live-rules.ts`). **A push to `master` does not deploy it** (checked Oct 6 2026: Render has no access to the repo). Every
deploy is AJ pressing Manual Deploy on the web service and Manual Build on
both cron jobs (`journey-cron-renewals`, `journey-cron-leaderboards`);
`docs/ops/RENDER-DEPLOYMENT.md` has the current state.

The **database side** deploys separately from the app: `firestore.rules`,
indexes and Cloud Functions go out with the Firebase CLI (the ship scripts in
`scripts/ship/` do it in order). Whether the live rules match the repo's is
still worth checking — see **Confirm before anything else**, below.

| | |
| --- | --- |
| Typecheck (`npx tsc --noEmit`) | **2** errors — the baseline (`charts.tsx`, `EditTrainerModal.tsx`). Compare the count; never expect zero |
| Tests (`TZ=America/New_York npx vitest run src`) | **13,456** passing in 814 files on `oct9/open-session`, Oct 9 2026 (13,132 in 802 on master `546bb0aa`); `CLAUDE.md` keeps the running count (its row waits for the trim, `docs/rounds/2026-10-09-open-session.md` §6) |
| Branch | everything is on `master` except `oct9/open-session` (the open session, AJ's "1b 2a 3a", Oct 9 2026), measured and ready to ship with `scripts/ship/ship-open-session.ps1` after AJ's Round 65 walk of the first-session rounds: the `sessions` index and the rules first, then the push, then its own walk (Round 66) before Render (`docs/rounds/2026-10-09-open-session.md` §4.8). The first-session rounds are on master and live (Oct 9 2026); whether their seed ran and Round 65 was walked is AJ's to say. `oct9/claude-md` holds `CLAUDE.md`'s trim, waiting for his review |
| Deploys | a push to `master` deploys nothing; AJ deploys by hand on Render (above). Rules, indexes and Cloud Functions are deployed separately |

---

## Confirm before anything else

These are not tasks so much as unknowns, and each one is cheap to check and
expensive to be wrong about.

1. **Are the live Firestore rules current?** The Operations round, the
   Operations overhaul, My Studio, history editing and machine fit each
   changed `firestore.rules`, and each round document says the rules were not
   deployed from that branch. If the live rules are older than the repo's, the
   app is asking for things it is not allowed to read and screens fail quietly.
   *Check:* `npx tsx scripts/check-live-rules.ts --key <service-account.json>
   --project gen-lang-client-0731527386 --database ai-studio-32cbbdcc-…`
   (read only; it compares the live text with `firestore.rules` and says
   where they part; Oct 9 2026: the same as master `546bb0aa`'s), or
   `scripts/fetch-live-rules.ts` with the Firebase CLI's login.
2. **Are the composite indexes deployed?** Same rounds, same story. On the
   Enterprise edition a missing index does not fail: the query still answers by
   scanning the whole collection, billed by the byte.
   *Check:* `npx tsx scripts/fetch-live-indexes.ts` against
   `firestore.indexes.json`.
3. **Do the rules tests pass on the rules you are about to deploy?**
   `npm run test:rules` needs JDK 21; it passed with 323 tests on Oct 7 2026
   (master), 334 on Oct 9 2026 (the first-session branch, now master) and
   351 the same night (`oct9/open-session`).
   AJ's run is the one that counts, and nothing else verifies the rules.

The deploy order, when they do need deploying, is in `CLAUDE.md`: indexes →
rules tests → rules → push → Manual Deploy on Render.

---

## Now

### 1. Try the catalog gate by hand
The catalog gate is merged to `master` (its first commit is `497d1307`, Sep 21
2026) and touches no rules. It closes the one hole in the machine template
boundary: a studio's own machine carried the *method*, and publishing it to
the catalog adopted those words company-wide unread. Round:
`docs/rounds/2026-09-20-catalog-gate.md`. Since Sep 28 2026 an administrator
decides an offer from Admins → Standard → Waiting for review.

**Worth doing by hand**, because no studio has ever actually offered a
machine: make a custom machine on a studio floor → offer it → Admins →
Standard → Waiting for review → read it, correct a cue, publish → check the
studio's floor says corporate adjusted it.

### 2. Tidy the working copy
The repo root has collected about 13 MB of archives, logs and dumps again, and
there are 23 merged branches and a stray 8.4 MB zip in `docs/`. None of it is
committed — it is all clutter in the folder. The inventory and the exact
commands are in **`docs/ops/REPO-HYGIENE.md`**; the scripts already exist
(`scripts/ship/tidy-root.ps1`, `scripts/ship/cleanup-branches.ps1`).

### 3. The pre-beta audit, and the Mindbody migration it has to solve

**The audit ran on Sep 21** — `docs/rounds/2026-09-21-pre-beta-audit.md`. Its
findings and AJ's answers were built on the `prior-history` branch, which is
merged into `master`. What it was pointed at:

- **The client directory shows no data.** SOLVED, and it is four columns, not
  three. Membership, Sessions Remaining and Next Session all read
  `client.renewal`, which the nightly renewals job is the only writer of
  anywhere — and the rules forbid the app from writing it. That job now runs
  nightly as the Render cron `journey-cron-renewals` (created Oct 5 2026; it
  had never run before that night). Last Session is a different cause: no
  session documents yet.
- **Mindbody sync was per-client and manual — and it was THE beta blocker.**
  The plan is written: **`docs/rounds/2026-09-22-mindbody-sync-plan.md`**,
  costed against AJ's real numbers. Short version: the whole forty-location
  backfill is about 30,000 Mindbody calls, roughly $100 once or free spread
  across nights, so **money is not the constraint**. The floor the plan asked
  for is built: `server/mindbody-client.ts` retries with backoff on 429, 408
  and 5xx and times a call out after 30 s (floor Sep 22 2026; the lean sync
  went live Sep 25; `docs/rounds/2026-09-26-cost-plan.md`). The collision check
  ran on Sep 23 and the client-identity round settled the rule for two people
  on one number (`docs/rounds/2026-09-23-client-identity.md`). What is left of
  the backfill is bringing each studio's clients in before its cutover date,
  with `scripts/onboard-studio.ts` at a pace AJ chooses.

### 4. Two things AJ named on Sep 22

- **Admins cannot control the standard set.** AJ removed Torso Rotation from
  the standard twenty **by accident**, because there was no good way to manage
  it from the dashboard. Admins need to own that template — it is the basis
  every new studio builds from, and with forty locations coming it gets used
  forty times. Built since: a machine is marked Standard on its own page in
  the catalog editor (`admin/catalog/StandardMachineSwitch.tsx`, Sep 28 2026;
  "Restore standard machines" is gone by AJ's call), and Admins → Standard
  holds the Standard template. The machine's timing bug was fixed on
  `prior-history`, which is merged.
- **An offline session, not attached to a person.** Mindbody is rarely down and
  a client always exists in Mindbody — but the app must still be able to record
  a session when the internet or Mindbody is not there, and let someone import
  it into a client's profile afterwards. This closes the "Mindbody is down /
  walk-in not in Mindbody" unknown in Gate B below.

### 5. The polish pass — the last piece of beta prep
Phase 1 of beta prep is otherwise done. What is left is the look and feel:
transitions between screens, loading states, how buttons read pressed /
disabled / focused, speed, and the token and colour drift (322 raw hex values
in `.tsx` files when counted in September; the colour rounds of Oct 4 2026 now
hold what is left with `neutral-ramp.test.ts`). The sign-in screen in light
mode is moot: the front door has been always dark since Oct 3 2026.

**Done in the voice review follow-up (Sep 27 2026,
`docs/rounds/2026-09-27-voice-review-followup.md`):** the Wrap-up follows the
theme and the app's type; Learning, Settings and My Studio draw in the app's
colours (one meaning per colour, every Save blue, caution plum), speak its
type (display-face titles, 14px bold sentence-case buttons, the 11 / 12 / 14 /
17 / 30 scale), and have 40px taps, whole names and nothing hover-only.
Tests hold each of them (`wiki/learning-tokens.test.ts`,
`wiki/learning-scale.test.ts`, `my-studio/look.test.ts`,
`studio-tasks/studio-tokens.test.ts`). **Settled since:** the Navy Frame
(colour) and Type and depth (Oct 4–5 2026) rounds moved the whole app onto one
colour scheme, type scale and depth, and brought the Operations kit onto it
(`.adm-panel__title` is 17px upright, `.adm-badge` 12px, every button 14/700);
the Relay Board was rebuilt on Oct 3 2026, so the strips on Relay's old Floor
and Mine cards are gone. **Not re-checked:** the Floor's landscape two-column
layout (`.sh__split`, AJ's call), the clinical strip's small title, the chosen
profile tab's colour, and AJ's screen audit, which confirms the names and looks
those rounds chose.

### 6. Reconcile the architecture document with what is built
`docs/ARCHITECTURE.md` §2–§4 are marked "review pending" and several of their
numbers have drifted (§2.5 still describes Operations as nine tabs; it has
seven destinations now, five when the Operations room was built on Sep 28
2026, with the Admins dashboard its own room).
The document is good and worth keeping true.

---

## Next — before a trainer uses Journey for real

This is **Gate B** (`docs/ARCHITECTURE.md` §5.3). Nothing here is optional;
it is the list that separates "AJ's app" from "an app other people use".

- **The franchise partition in the rules.** `isFranchiseOwnerOnly()` is
  company-wide, not scoped to a network, so a franchisee could technically
  reach another network's client data. The fix is `networkIds` and
  `ownedStudioIds` cached on the trainer document, with every franchise grant
  scoped to *this* studio. Moved up from Gate C because franchisees join the
  beta alongside corporate. **This is the single most important item on the
  page.**
- **The iPad walkthrough** — `docs/ops/TESTING-CHECKLIST.md`, Rank 1 first:
  two iPads on one client, an occupied machine, a practice set, a skipped
  machine with a reason, Wi-Fi dropped mid-set.
- **Decide and test Firestore offline persistence.** It is switched on
  (`persistentLocalCache` in `src/firebase.ts`); what has never been tested is
  what a trainer sees when the Wi-Fi drops mid-set and comes back.
- **The "Mindbody is down / walk-in not in Mindbody" decision.** There is no
  answer today and it will happen in week one.
- **An environment badge outside production**, so nobody demos against live.
- **A written rollback plan** for rules, functions and the front end.
- **CI as a required check on `master`** once it has been green for a week;
  promote the rules suite from advisory when stable.
- **The trainer-identity report run**, and the migration only if it shows
  stranded or colliding ids.
- **Credential rotation** — the Mindbody sandbox credentials are in the public
  repo's history. Twenty minutes.

**Known and held open by decision:** three write holes stay open while every
user is verified by hand. Revisited at Gate C. The self-edit hole on
`trainers/{uid}` was closed in the cost round; the `studios/{id}` write was
closed by My Studio; the cross-studio task writes are the one still open.

---

## Later — Gate C and beyond

- Lock the remaining write holes right before the first franchisee goes live;
  close the open reads on `journalEntries`, `exerciseLogs`, `progressReports`.
- The new-studio runbook; rosters for Westlake and Willoughby; the tracker and
  routine builder reading the studio's own floor only.
- **Demo Mode and the tutorials.** The `demo-mode-foundation` branch is
  retired to the tag `archive/demo-mode-foundation`. Demo Mode was rebuilt
  from scratch on Sep 20 2026 as a real practice studio
  (`src/features/demo-mode/`, `docs/rounds/2026-09-20-demo-mode.md`); the
  tutorials are still to do.
- **The FileMaker migration — on hold.** Field mapping to the data dictionary
  (§3.2), the importer in the `scripts/migrate-machine-id.ts` shape, blanks
  imported as *Skipped: unknown (FileMaker)*. AJ decided on Oct 2 2026 to make
  the app work without the FileMaker data: a client's sessions before Journey
  come from Mindbody's visit count and a trainer's confirmation
  (`docs/business/migration-and-prior-history.md`), so nothing here is being
  built until the FileMaker extraction is done. Machine settings already have
  a manual path (Programming → Setup → Quick entry), and `parseShorthand` in
  `features/machine-fit/shorthand.ts` is the function an importer hands every
  settings string to.
- The Monday-morning questions 2–4 as automatic in-app flags.
- Mindbody's webhook already handles `staff.*`, contract, membership and sale
  events in code (`functions/src/mindbody/index.ts`); whether Mindbody sends
  them all is not checked here.
- **Teams in Journey (proposed Oct 3 2026, waiting on Jeff and AJ).** Max
  Strength already runs on Microsoft 365 and everyone uses Teams, and
  Journey's own messaging (Relay's asks, comments, note shares) is thin. The
  idea: Teams carries the conversation, Journey keeps anything about a client.
  Phase 1 is "Message in Teams" links and Journey as a Teams tab; Phase 2 a
  Teams panel inside Journey on the same Microsoft sign-in; Phase 3 decides
  what of Relay retires. It would change one line of **Not building** below
  (Teams may notify; Journey still sends nothing). The proposal is
  `docs/rounds/2026-10-03-teams-proposal.md`.
- Accessibility pass. (Cold-load timing on a studio iPad was first measured by
  the speed and iPad rounds, Oct 5–6 2026: each cold open sends a boot report
  to Render's logs, and the perf lab in `harness/perf-lab/` is the tool.)
- Architected for, not built: automated retention beyond flags (in-app only),
  the InBody Web API per studio, badges and awards, CSV export of a client's
  history, a second time zone, `strict` TypeScript, Cloud Functions tests in CI.

---

## Not building

No client app or portal. No outreach of any kind — no email, SMS or push, to
clients or to trainers. No booking, billing or payment features. No nutrition
tracking beyond the check-in's self-reported fields. No wearables. No AI
coaching. Nothing for a company other than Max Strength Fitness.
(`docs/ARCHITECTURE.md` §1.7.)

---

## The follow-up pile

Small things left behind by a round, grouped by where they live. None is
urgent; all are written down so they are not rediscovered.

**Machines and the catalog** — **the template boundary was superseded (AJ, Sep
21) and rebuilt on Sep 28 2026** (codex wave 2, `docs/rounds/2026-09-28-codex-2.md`):
a franchisee may change anything on their own copy, safety included, with head
office keeping the catalog and the approvals. Removing a safety line needs a
reason, and the divergence view (Admins → Standard → Machines → a machine →
Compare) shows head office which studios changed what and why. The reasoning
is at the top of `src/lib/machine-template.ts`.
Also: **the company-wide settings numbers are currently blended across models**
(a Hoist seat 4 averaged with a Nautilus seat 4) and cannot be fixed until a
model is recorded on a roster entry — see `src/features/machine-fit/README.md`;
weight pooling is unaffected. Then: the twenty catalog machines still use the floor
abbreviations (`CX (4 WAY NECK)`, `BICEP`) rather than the Academy's names, and
whether to change that is one line in the generator; the rules do not enforce
the machine template boundary (the app does, at the write and at the publish);
two emptied files, `AdminMachineCreator.tsx` and `MachineDefinitionForm.tsx`,
are unimported and can be deleted.

**The floor and the client profile** — `machineStats` first/last dates are not
recomputed when a past session is edited; `sessionNumber` on a backfill comes
from the newest session, so the FileMaker importer must number from history
instead; the Journey grid truncates machine names and shows ~7 columns in
portrait.

**Renewals and Operations** — the nightly renewals job has run since the Render
cron `journey-cron-renewals` was made by hand on Oct 5 2026 (the Blueprint was
never linked, so there is no Blueprint sync to do; `render.yaml` is the written
record of the dashboard); Operations → Renewals settings
matched to the Mindbody package names; the collision-checker batching fix; the
`hub_announcements` delete rule; the Render cron service is still named
`journey-cron-leaderboards` although it runs the machine-trends job.

**Mindbody and sync** — restore the bookings the old sweep cancelled
(Operations → Mindbody → Sync with a past start date, per studio). (The
directory's old Last Session query and the nightly `calculateFacilityAnalyticsV2`
are both gone: the directory was rebuilt on Sep 28 2026 and the function was
deleted by the cost plan on Sep 26 2026.)

**The voice review follow-up (Sep 27 2026)** — to do by hand: delete the
`taskInstances` (status, localDate) index in the Firebase console (it left the
index file; answer N if the CLI offers to delete indexes), and walk Round 22 of
the testing checklist. Decisions for AJ, all in the round document's "Open,
for AJ": the Hub outline for an agreed slot with no booking; regulars on
rotation days; a trainer Mindbody marks inactive; "Suggest my regulars" from
the bookings Journey already holds (Mindbody sends no recurring-series id);
who may change a role on Operations; a grant-holder's reach; franchise owners
and Assign; whether "This quarter" lapses; a stored mark for the Note for the
next trainer; one maintenance log for machine reports. Technical leftovers:
`useNetworks` has no loaded / failed state; Operations → Machine fit writes its
profile hand-off before the leave question.

**Openings (Sep 27 2026)** — to do by hand: ship it with
`scripts/ship/ship-openings.ps1` (the rules first: the marks block and 21
blocks); after the push, every iPad loads the new version before anyone saves
a standing week with three blocks on a day (an older build keeps 14,
silently); optionally the first summary before Sunday
(`scripts/openings-report.ts`, then `run-machine-trends.ts --only openings`,
dry run, then `--commit`); and walk Round 23 of the testing checklist. The
usual week fills only from days an iPad's pull read in full, so it waits for
Journey to be open at a studio most days. Decisions for AJ, all in the round
document's "Open, for AJ (from the build)": taken slots (shown nowhere
now); today's openings on the Overview; the webhook writing Mindbody's
`lastVisited` into `lastSessionDate` (a Cloud Functions change); the
Wrap-up's "next 30 days" across the studios of one Mindbody; Your week for
leaders; the cancellation line's reading; a door from a time to the standing
week; and the words for the screen audit, four of them changed from what he
approved. Technical leftovers: the summary's `tz` has no reader; the next 7
days' people are put together in three places; Team's door remembers the
part before the leave question; `offers()` could refuse unread marks itself;
`WorkoutTrackerView.render.test.tsx`'s `onSnapshot` fake.

**The Client Directory and the Hub's Opportunities (Sep 28 2026)** — to do by
hand: walk Round 24 of the testing checklist (the round shipped before anyone
saw it on an iPad). Decisions for AJ, in the round document's "What AJ still
has to decide", several of them also questions in the redesign's Clients and
Hub rooms: the default sort, how a nickname shows, Mine's window (60 days or
ever-in-Journey, not exactly 90), the note marks (a summary on the client
document, a Firestore change that needs his OK), the Hub card's milestones,
the tenure words and "ending soon". Technical leftover: `src/lib/directory-row.ts`
and its test have no reader since the old directory went.

**The calm Hub (Sep 28 2026)** — to do by hand: walk Round 25 of the testing
checklist (the round shipped to master on AJ's word before anyone saw it on an
iPad; the restore tag `restore/2026-09-28-before-calm-hub` is master before
it). The Hub card's
milestones moved to Operations' one list (Hub question 5's default), which
settles that question from the directory round. Decisions for AJ, in the round
document's "Open, for AJ": the tap opening a peek (two taps to the profile);
All stars' rule; the hatching waiting on agreed standing weeks; grey staff time
waiting on Mindbody's "Unavailable" blocks, which the sync doesn't bring; moving
the briefing's markers (every 25th, 21 days) onto the one engine; the top in
portrait. Technical leftovers: "Couldn't load, retrying" when the schedule read
fails; columns by trainer id only; a column header, "+N" and "Show on schedule"
as doors; FORD "Get to know" (a new read: Needs OK); `mayReadWeeks` in a
small file of its own (about 4 kB off the first download).

**The Hub's cherry on top (Sep 28 2026)** — to do by hand: walk Round 27 of the testing checklist (render tests only so far). Decisions for AJ, in the round document's "Open, for AJ": Focus opening on Me or Everyone; words for a Watch or Renew mark in your own column; the Next 30 minutes always there on today, and its words; All stars' reading (the average over the weeks she came; 24 of 26 weeks) and where it shows. All stars and Get to know: approved by AJ ("all yes") and switched on in wave 2 hub (below). Technical leftovers: Zoom (Day | Close) from direction B; the strip worked out on every render.

**The Hub, wave 2 (Sep 28 2026)** — to do by hand: deploy the two new `ford` indexes before the app; walk Round 33 of the testing checklist (render tests only so far). Decisions for AJ, in the round document's "Open, for AJ": the Get to know chip on the Hub's top line; a detail noted today asked about from the next visit; the All stars row's words; the ✎ in Welcome's blue. All stars will name nobody until a studio has about 26 weeks on Journey. Technical leftovers: a fallback of three plain queries if `or()` is ever refused; a tighter read for a studio that reaches the 1,000 guard rail.

**The studio settings (wave 2, Sep 28 2026)** — to do by hand: walk Round 32 of the testing checklist; an administrator sets Max Strength's defaults on Admins → Standard → Studio defaults (until then every studio runs on the app's). Later: a setting added to `registry.ts` appears on both editors by itself, but its reader has to ask `useStudioSettings` — a registry row with no reader is a bug.

**The rooms' third wave (Sep 29 2026), built** — walk Rounds 39 to 44 of the testing checklist. Still open, each in its round document: **Admins:** Ask the leader (a `taskRequests` field: needs AJ's OK) and See as (proposed as Preview as: pin the studio, open My Studio, a banner back); q4 (`docs/rounds/2026-09-29-admins-3.md`). **Operations:** 1:1 notes on Team → This week; My Profile's Your week reads no bookings, so "didn't come" isn't there (`2026-09-29-operations-3.md`). **Codex / Catalog:** head office's view (R6) and pointing Admins → Standard at the Catalog (R7), proposed with three questions; the trainer page behind a flag, the Sunday job pooling settings per model, R4; AJ's answer on whether a studio may reword the method on its own copy (`2026-09-29-catalog-3.md`). **Relay:** whether a notice that asks "I've read it" stays new past Mark all read; whether posters may see who has read it; "I've read it" in the bell; a time on a leader's naming; whether a trainer may close their own case (`2026-09-29-relay-3.md`). **Month and the first day:** the five defaults in `2026-09-29-month-and-first-day.md`; a FileMaker backfill of first days is an importer's job. **Journey Lite on a phone:** a proposal with four questions, `2026-09-29-mobile-lite-proposal.md`.

**The Admins room's parked parts (Sep 28 2026, `docs/rounds/2026-09-28-admins.md`)**: Opening a studio (a stage, an opening day, setup items with owners and due dates, and the board of new studios, to be named "Launches"), See as, Activity, Home's Take it / Snooze / Dismiss, a reply on a bug report, and the MSF Standard room (the standard set as its only control, dated changes, the divergence view with the Sep 21 rule). Each needs AJ's OK or a talk (q4). Also: Settings still names a report's status in the old words (Open / Looking at it / Fixed / Closed); Home shows a sync problem only after 2 failed pulls in a row; the Machines line reads every studio's floor on each visit.

**The Machine Catalog (Sep 28 2026)** — to do by hand: walk Round 29 of the testing checklist. Decisions for AJ: the nineteen rulings in `docs/rounds/2026-09-28-codex-source-check.md` (the Leg Press's knee replacement first; "follow the Academy" answers all of them), then administrators make the corrections in the catalog editor (AJ, Sep 28 2026: not in code); the machine window's "Studio standard" starting weight where a studio set none; the four body-figure markings that need no redrawing. Wave 2 built the reason, the aliases and the model tier's read side; next: the Catalog's Edit our floor door, head office's view (R6), pointing Admins → Standard at it (R7). Technical leftovers: `MachineUpkeepCard` has no host; the older coaching text in `machine-database.ts` is unchecked; a floor never loaded on this iPad, opened offline, reads as empty (the roster listener needs `includeMetadataChanges` to tell a cache-only answer apart).

**The Operations room (Sep 28 2026)** — to do by hand: walk Round 30 of the testing checklist. As the round left it, these waited on AJ's OK (its "Not built"); a no-show mark (`bookingMarks`), client states written by the nightly job, the lines as studio settings, trainers' own cases (Relay → Tracker → Follow-ups) and a place for 1:1 notes (Oct 3 2026) have been built since, and case fields on the attendance watchlist and a nightly summary per studio were not re-checked. His questions are the round document's "Open, for AJ" (the client page inside Operations, "This week so far", the chance check's floors, kudos on Team, the huddle on one iPad). Technical leftovers: ARCHITECTURE §2.5 still describes nine tabs (the round document has a replacement); `.adm-ins-bad` has no reader.

**The Relay room (Sep 28 2026), as it stood then** (superseded in part: the second and third waves built the quiet-floor number as a studio setting, cover asks that keep their time, Since you were in, the Journal, claim times and announcements that ask "I've read it", and the Board was rebuilt on Oct 3 2026, which removed Opening and Close out; `docs/rounds/2026-10-03-relay-board.md`): a quiet-floor number per studio (q3; 2 for every studio meanwhile); a cover ask that keeps its time; Since you were in (a last-seen marker per trainer, a new-to-the-studio lookup); the Journal (note types, templates, shelves, hunches; Opening's things to carry and Close out's day log); announcements that ask "I've read it" (q7: the retired `readBy` stamp and the private `announcementReads`); a studio's own cleaning log; claim times. Questions: the open question's three weeks on the briefing, closing it on her Notes page, trainers naming one person, Opening's 90 minutes. Technical: a load status from `useLiveSchedule` for Right now and Opening; folding Capture's "The Board" into the Ask sheet.

**The first session and routine plans (Oct 9 2026)** — to do by hand, in
this order (`docs/rounds/2026-10-08-first-session-screens.md` §7.6): the ship
script's prepare and golive (the index and the rules), the seed
(`scripts/seed-starting-routines.ts`, a dry run, then `--commit`), the iPad walk
of Round 65 against the PC BEFORE Render's Manual Deploy (AJ's rule: at most two
rounds shipped before a walk, and several already went unwalked), then Render.
Then, when AJ chooses: an administrator may mark head office's default starting
routine (none is marked, AJ's "2a"); each studio picks its starting routines and
"A new client starts with". Not built, each a round of its own: free-form and
practice sessions (AJ's §2c answer is the rule for them), the injury layer
(head office's answers to `docs/rounds/2026-10-07-injury-map-questions.md`),
the middle delt and the body figure's side view. For AJ: the plan's door in the
session's corner, or on the bar (§4.6); the neck's start, the catalog's 20 lb or
the Academy sheet's row (§4.8); the two versions of the Academy's selection
template that disagree on three rows (head office's call, in the template
editor). The starting weights question is answered: the Academy's range beside
the weight, a reference never typed in (AJ, Oct 7 2026).

**Decisions still waiting on AJ** — the three unwired Academy safety rules; who runs the payroll
export and how often; the bootstrap e-mail hard-coded in
`useAuthInitialization`; whether to raise the app's tap-target floor from 40px
to Apple's 44px; what to do with the unused server and Mindbody routes (the
browser's App Cleanse button was removed on Sep 20 2026).

---

*Fixed since the Sep 5 list and removed from this page: the studio-selector and
sign-in scroll traps (both had `min-h-screen` inside a container that could not
scroll — now `touch-pane overflow-y-auto`); the routine "reverting" mid-session
(the session owns `sessionMachineIds` now, seeded once per session id); and the
bug reporter, which has triage and a status.*
