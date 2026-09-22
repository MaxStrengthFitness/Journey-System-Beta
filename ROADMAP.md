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

*Last re-cut: Sep 21 2026, after the catalog gate round.*

---

## Where the project is right now

Journey is **pre-alpha**. AJ is the only user; no trainer has run a real
session on it. Everything built through Sep 20 is merged into `master` and
**deployed** — `master` and `origin/master` are level, and every push to
`master` goes live at `maxstrength-app-beta.onrender.com`.

That means the app on the iPad is current. What is *not* guaranteed current is
the **database side**: several rounds since Sep 17 changed `firestore.rules`
and added indexes, and those deploy separately with the Firebase CLI. See
**Confirm before anything else**, below.

| | |
| --- | --- |
| Typecheck (`npx tsc --noEmit`) | **10** errors — the baseline. Compare the count; never expect zero |
| Tests (`TZ=America/New_York npx vitest run src`) | **3,545** passing in 237 files on `master` |
| Branch | everything on `master`; `catalog-gate` is the one round waiting to merge |
| Deploys | every push to `master` deploys the app. Rules, indexes and Cloud Functions do not |

---

## Confirm before anything else

These are not tasks so much as unknowns, and each one is cheap to check and
expensive to be wrong about.

1. **Are the live Firestore rules current?** The Operations round, the
   Operations overhaul, My Studio, history editing and machine fit each
   changed `firestore.rules`, and each round document says the rules were not
   deployed from that branch. If the live rules are older than the repo's, the
   app is asking for things it is not allowed to read and screens fail quietly.
   *Check:* `npx tsx scripts/fetch-live-rules.ts`, then diff against
   `firestore.rules`.
2. **Are the composite indexes deployed?** Same rounds, same story. A missing
   index shows up as an empty list rather than an error.
   *Check:* `npx tsx scripts/fetch-live-indexes.ts` against
   `firestore.indexes.json`.
3. **Has `npm run test:rules` been run since Sep 17?** It needs JDK 21 and it
   only runs on AJ's PC. Nothing else verifies the rules.

The deploy order, when they do need deploying, is in `CLAUDE.md`: indexes →
rules tests → rules → push.

---

## Now

### 1. Merge the catalog gate
`catalog-gate` (17 commits) is built, typechecked and green, and touches no
rules. It closes the one hole in the machine template boundary: a studio's own
machine carried the *method*, and publishing it to the catalog adopted those
words company-wide unread. Round: `docs/rounds/2026-09-20-catalog-gate.md`.

**Worth doing by hand first**, because no studio has ever actually offered a
machine: make a custom machine on a studio floor → offer it → Admin → Catalog
→ read it, correct a cue, publish → check the studio's floor says corporate
adjusted it.

### 2. Tidy the working copy
The repo root has collected about 13 MB of archives, logs and dumps again, and
there are 23 merged branches and a stray 8.4 MB zip in `docs/`. None of it is
committed — it is all clutter in the folder. The inventory and the exact
commands are in **`docs/ops/REPO-HYGIENE.md`**; the scripts already exist
(`scripts/ship/tidy-root.ps1`, `scripts/ship/cleanup-branches.ps1`).

### 3. The pre-beta audit, and the Mindbody migration it has to solve

`docs/ops/OVERNIGHT-AUDIT.md` is a prompt to paste into a fresh session and
leave running: it walks the app in Rank order against the standard in
`docs/START-HERE.md`, and produces a ranked list of what would hurt a trainer
on day one, plus questions for AJ.

Two things it is pointed at, both named by AJ on Sep 21:

- **The client directory shows no data.** The Membership, Sessions Remaining
  and Last Session columns exist and come back empty. Likely three different
  causes — two probably waiting on the nightly renewals job, and Last Session
  has its own known defect in the follow-up pile below.
- **Mindbody sync is per-client and manual, and it does not scale.** A
  trainer opens a profile and runs Master Sync for one person. Names arrive
  on the schedule; address, demographics, contracts and packages do not.
  With ~250 clients a studio across four studios, that is not viable by hand
  — **this is a beta blocker**, and it needs a resumable, throttled,
  miss-nobody backfill in the `scripts/` pattern, costed against Mindbody's
  rate limits and the read quota. There is precedent for getting this wrong:
  the 429 quota storm of Aug 30 2026.

### 4. The polish pass — the last piece of beta prep
Phase 1 of beta prep is otherwise done. What is left is the look and feel:
transitions between screens, loading states, how buttons read pressed /
disabled / focused, speed, the token and colour drift (322 raw hex values in
`.tsx` files), and the sign-in screen in light mode.

### 5. Reconcile the architecture document with what is built
`docs/ARCHITECTURE.md` §2–§4 are marked "review pending" and several of their
numbers have drifted (it says Operations has fourteen tabs; it has nine plus a
separate Admins dashboard). The document is good and worth keeping true.

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
- **Take the database wipe off the browser.** `executeAppCleanse` deletes
  every document in eleven collections from a button in the app. Behind an
  environment guard, an admin-only server route, or gone.
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
  retired to the tag `archive/demo-mode-foundation`; Demo Mode gets rebuilt
  from scratch once more of the app has settled.
- **The FileMaker migration.** Field mapping to the data dictionary (§3.2),
  the importer in the `scripts/migrate-machine-id.ts` shape, blanks imported
  as *Skipped: unknown (FileMaker)*. The Mindbody notes import comes first.
  Machine settings already have a manual path (Programming → Setup → Quick
  entry), and `parseShorthand` in `features/machine-fit/shorthand.ts` is the
  function an importer hands every settings string to.
- The Monday-morning questions 2–4 as automatic in-app flags.
- Mindbody `staff.*` and contract/membership webhooks, after the collision
  check.
- Accessibility pass; cold-load timing on a studio iPad.
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

**Machines and the catalog** — **the template boundary is superseded and not
yet rebuilt** (AJ, Sep 21): a franchisee may change anything on their own copy,
safety included, with head office keeping the catalog and the approvals. The
round is three things that must ship together — open `canEdit` /
`scopeOverrides`, let the additive merge in `resolve-machine.ts` express a
removal, and build the **divergence view** so head office can see which
studios changed what and why a safety line was removed. Half of it is worse
than none of it; the reasoning is written at the top of `src/lib/machine-template.ts`.
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

**Renewals and Operations** — the renewals dry-run has not been done; Render
Blueprint sync for `journey-cron-renewals`; Operations → Renewals settings
matched to the Mindbody package names; the collision-checker batching fix; the
`hub_announcements` delete rule; the Render cron service is still named
`journey-cron-leaderboards` although it runs the machine-trends job.

**Mindbody and sync** — restore the bookings the old sweep cancelled
(Operations → Mindbody → Sync with a past start date, per studio); the
directory's Last Session column reads `sessions` with `limit(100)` across 30
clients and no order, so a client with many sessions can hide another's
latest; `calculateFacilityAnalyticsV2` still reads every exercise log nightly
and nothing reads its output.

**Decisions still waiting on AJ** — whether the tracker should suggest starting
weights at all; the three unwired Academy safety rules; who runs the payroll
export and how often; the bootstrap e-mail hard-coded in
`useAuthInitialization`; whether to raise the app's tap-target floor from 40px
to Apple's 44px; what to do with the App Cleanse and the unused server and
Mindbody routes.

---

*Fixed since the Sep 5 list and removed from this page: the studio-selector and
sign-in scroll traps (both had `min-h-screen` inside a container that could not
scroll — now `touch-pane overflow-y-auto`); the routine "reverting" mid-session
(the session owns `sessionMachineIds` now, seeded once per session id); and the
bug reporter, which has triage and a status.*
