# The Renewals round — Operations Dashboard + Renewals (Sep 10–11, 2026)

Branch `operations-renewals` off `master`: nine phases, the review's fixes and the docs, **one commit each**, so any one of them can be reverted on its own. The plan and the reasons behind it are in `OPERATIONS-RENEWALS-PROPOSAL.md`; §11 there lists what changed from the plan. The code map is `src/features/renewals/README.md`.

**Nothing in this round contacts a client or a trainer.**

---

## 1. What's in it

| # | Commit | What you'll notice |
| --- | --- | --- |
| 0 | Mindbody routes need a staff sign-in; pull pricing options and scheduled charges; collision check | Nothing visible. `/api/mindbody/*` refuses anyone who isn't signed-in staff |
| 1 | The Admin dashboard is called Operations | "Operations" on the mode switch, the nav and the studio picker |
| 2 | Each studio's renewal settings and package table | Operations → Renewals → **Settings** |
| 3 | The renewal engine | Nothing visible: pure code and tests |
| 4 | The nightly renewals job, live snapshots, the snapshot rule, an index | A new Render cron job; the renewal line on profiles fills in overnight |
| 5 | Renewal conversations | The renewal line and **Renewal card** on the profile, the post-session prompt, the briefing line, the Hub lane, **My renewals** on a trainer's profile |
| 6 | Operations → Renewals pipeline and the Renewal Brief | Operations → Renewals → **Pipeline**; tap anyone for the **Brief** |
| 7 | InBody scans | Profile → Details → Medical → **Body composition**; a Body Composition section on finalized progress reports |
| 8 | Outcomes | The Brief's **Outcome** picker; Operations → Renewals → **Outcomes** |
| 9 | Fixes from the independent review (§9) | Nothing new to look at: the Mindbody check is stricter, and a few renewal edge cases are right |
| 10 | Docs | This file, the proposal's answers, `CLAUDE.md`, `docs/business/`, the READMEs, `ROADMAP.md` |

---

## 2. Before you start

- PowerShell, in the project folder: `cd C:\Users\austi\Projects\Journey-System-Beta-master`
- You're on `master` at **`ec036917`** (the Sep 10 go-live), and `node_modules` is installed (`npm ci`).
- JDK 21 for the rules tests, and `npx firebase login:list` shows your account.
- No uncommitted changes to files git tracks. The preflight lists any it finds and stops. To set them aside: `git stash push -m before-renewals`. After the release, `git stash pop` brings them back.
- The ship script is **`ship-renewals.ps1`**. The patches it applies are in **`backups\renewals-ship\`**, which git ignores. It checks the patches' fingerprints before it uses them.

---

## 3. Ship it — two lines

```powershell
powershell -ExecutionPolicy Bypass -File .\ship-renewals.ps1 -Stage prepare
powershell -ExecutionPolicy Bypass -File .\ship-renewals.ps1 -Stage golive
```

**`prepare`** only changes your PC's git history. It runs three stages:

- **preflight** checks `master`, confirms the files this round touches are clean, and verifies the patches. It then measures the typecheck count **on master**, as the baseline.
- **commit** creates `operations-renewals` and applies the eleven patches, one commit each (with the attribution lines). The doc copies delivered on Sep 10 (`CLAUDE.md`, the proposal and `docs\business\`) aren't in git yet. They're moved to `backups\renewals-docs-before\` first, and the committed versions replace them.
- **check** runs the typecheck (the count must not go up), `vitest`, `vite build` and `build:backend`. It remembers the exact commit that passed.

**`golive`** is production. It refuses to run unless `check` passed for the commit you're on:

- **rules** runs `npm run test:rules`, then deploys the indexes, then the rules, to `prod`. One old test, `denies trainer creation with a non-empty pinHash`, is known to fail and is allowed. Any other failure stops everything.
- **push** merges into `master` and pushes. **Render deploys `master`, so this is the go-live.**

Every stage stops at the first problem and says why. Everything is also written to `ship-renewals.log`. Send me the log if anything stops.

Running a line again after a stop picks up where it left off. `prepare` goes straight to the check once the commits exist. `golive` skips the rules once they're live for this commit, and pushes again if only the push failed.

One stage at a time also works: `-Stage preflight | commit | check | rules | push`. The push refuses to run until the rules for this commit are live.

---

## 4. After the push

1. **Reload every iPad** (close the tab or the home-screen app and reopen it). An iPad still running yesterday's app can't sync Mindbody — the server now asks for a sign-in the old app doesn't send — and says "Please sign in again."
2. **Render → Blueprints → Sync.** This creates the cron job **`journey-cron-renewals`** (06:30 UTC, about 2:30 AM Eastern). Give it the same values the web service already has for:
   - `VITE_FIREBASE_PROJECT_ID`
   - `VITE_FIREBASE_FIRESTORE_DATABASE_ID`
   - `MINDBODY_API_KEY`
   - `MINDBODY_SOURCE_NAME`
   - `MINDBODY_SOURCE_PASSWORD`

   It also needs `FIREBASE_SERVICE_ACCOUNT`, the same value the leaderboard cron uses. `RENEWALS_MAX_PULLS` (300) and `RENEWALS_DRY_RUN` (false) come from the blueprint.
3. **Look before the first night**, from the PC:
   ```powershell
   npx tsx scripts/run-renewals.ts            # stored data only - no Mindbody calls, writes nothing
   npx tsx scripts/run-renewals.ts --pull     # also reads Mindbody (about 600 calls) - still writes nothing
   ```
   The log says, per studio, how many clients it read, how many snapshots and outcomes it *would* write, and every situation count. If it looks wrong, set `RENEWALS_DRY_RUN` to `true` on the cron job until we've talked.
4. **Match the Mindbody names.** After the first run, Operations → Renewals → Settings lists every contract and pricing-option name the job met, with a count of clients. Match anything that isn't a package or "Session Comp". Until it's matched, those clients sit under "Missing Mindbody data".

---

## 5. The iPad pass — portrait, then landscape

**As a studio leader, Operations → Renewals:**

1. **Pipeline.** Four numbers across the top, then the lanes: Before the charge, Talk now, Coming up (grouped by month), and Lapsed and Away (both collapsed). The filters wrap onto two lines instead of running off the screen.
2. Tap **Missing Mindbody data**: the list opens, and each row says what's missing.
3. Tap a client: the **Renewal Brief** opens as a panel on the right. Check:
   - Their journey and their health wins come before any numbers about money.
   - Stage, Leading and Outcome pickers are at the top.
   - The options table shows the studio's own prices.
   - **Log a conversation** opens *on top of* the Brief, not behind it.
4. **Outcomes.** The quarter picker. By package and by trainer: a trainer with fewer than 5 outcomes isn't shown, and the "Context, not a verdict" note is there. If you run more than one studio, By studio appears.
5. **Settings.** Change a number, switch to Pipeline and back: the change is still there, unsaved. Save.

**As a trainer (Life Transformer):**

6. A client with a package: the **Completed sessions** tile on the profile carries the renewal line. Tapping it opens the **Renewal card**, with no prices.
7. Finish a session with a client at 10 or fewer sessions left: the post-session screen asks about the renewal, and **Log** saves in about 15 seconds.
8. The pre-session briefing shows a Renewal line. The Hub has a renewals lane. Your own profile shows **My renewals**.

**InBody (any trainer at the client's studio):**

9. Profile → Details → Medical → **Body composition** → **Add scan**. Type a printout in. Put a wrong Percent Body Fat in first: an amber note appears, and it still saves. The iPad shows the number keypad.
10. Add a second, later scan: the trend lines appear, and the change since the first scan is green where muscle rose or fat fell.
11. Tap a scan in **Every scan**: correct it, then remove it (the person who entered it, or a leader).
12. Open a **finalized progress report**: a Body Composition table sits under Machine Progression.

Send me screenshots of anything wrong — cropped, with magenta arrows, as usual.

---

## 6. Mindbody follow-ups — not needed for this release

In this order, when you have a quiet hour:

1. `npx tsx scripts/check-mindbody-client-collisions.ts` — read-only. It says whether the two sites share any client ids.
2. Deploy the Cloud Functions (the webhook handlers for contracts and memberships were written Aug 29).
3. `node register-webhook.js --site 29068 --list` — look only. Then subscribe site 29068, and after it `--site 5746957`. The signing secret stays hidden unless you pass `--show-secret`.

Until then, contracts arrive through the nightly job and the Sync button, which is enough.

---

## 7. Day one — what to expect

- **The Pipeline is empty until the first nightly run.** After it, most clients show "Missing Mindbody data" until their first Mindbody pull. The job pulls about 300 clients a night, near a renewal first, so everyone is covered in about three nights (627 clients).
- **Pace needs bookings.** Until three weeks of a studio's bookings are synced, pace reads "not enough visits on record yet" — never zero.
- **Outcomes start tonight.** The first run records clients who lapsed in the last six months as lost (the win-back list), and renewals it can already see.

---

## 8. How to undo any of it

| To undo | Do this |
| --- | --- |
| One phase | `git revert <sha>` on `master`, then push. Phases 1 (the labels), 7 (InBody) and 9 (the review's fixes) come out cleanly on their own. The rest are built on by later phases, so revert those newest first |
| The nightly job | Render → `journey-cron-renewals` → Suspend. Or set `RENEWALS_DRY_RUN=true` (it runs and writes nothing), or `RENEWALS_MAX_PULLS=0` (no Mindbody calls) |
| The rules | The new blocks only add access, apart from one guard: the app can't change `clients/{id}.renewal`. Removing them and redeploying restores the old behavior |
| The Mindbody sign-in check | Revert commit 9, then commit 0. Every browser call already sends the token, so nothing else breaks |
| A wrong outcome | Open the client's Brief and change it. A leader's outcome is never overwritten by the job |

---

## 9. Found during the review — not changed, needs your OK

An independent review of this round (Sep 11) found two **older** holes in `firestore.rules`. They weren't made by this round and weren't touched, because changing them changes what existing screens are allowed to do:

- **A trainer can promote themselves.** The `trainers/{id}` update rule lets people edit their own document, including `role` (anything except Admin, Founder or Overseer), `ownedStudioIds` and `accessibleStudioIds`. A Life Transformer could make themselves a Franchise Owner through the Firebase SDK and pass every leader-only rule in the app — renewals, InBody, and the rest.
- **Any trainer can edit any studio document** (`studios/{id}`), including `mindbodySiteId`, which the Mindbody sign-in check uses to decide which sites a person may reach.

The fix is a short rules change: only leaders and administrators may change those fields. It needs a check of which screens write them today (guest check-in, studio settings), so it's worth its own small round. Say the word.

The same review found and fixed, in commit 9:

- Three ways around the Mindbody sign-in check:
  - A cross-train request could be pointed at one client to pull another.
  - A site sent as an array slipped past the site check.
  - `/Test-Webhook/` (different case, trailing slash) skipped the administrator-only check.
- Clients still coming in on something the package table doesn't know were being called lapsed, and could have been recorded as lost.
- Paid-in-full clients with no recent visits could fall out of the pipeline, and read "on pace" with no visits at all.
- The nightly job spent Mindbody calls on long-gone clients, and on clients Mindbody has never heard of.
- A leader clearing an outcome was overwritten the next night.
- A "needs a leader" flag from a replaced package stuck on the Hub.
- The live snapshot could briefly mix two clients.
- Conversations could be backdated.

---

## 10. Known limits

- The job can't tell **pay-as-you-go** from a package the studio hasn't matched. Leaders record it in the Brief.
- **Declined cards** aren't tracked (AJ, Sep 11). The only signal is Mindbody's "autopay suspended".
- Per-trainer rates are computed from cycle documents that the studio's trainers can read, because they need them to log conversations. The app only *shows* rates to leaders.
- InBody is typed in by hand until a LookinBody import exists, and that needs one API key per studio.
