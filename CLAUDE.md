# Journey System (Max Strength App) — read this first

Journey is the coaching app for **Max Strength Fitness** studios: trainers record workouts, machine settings and notes on iPads on the gym floor; studio leaders run the studio from the same app. It replaces the Claris FileMaker system the studios use today and syncs people, bookings and contracts from **Mindbody**.

How the business works (packages, renewals, roles, where data lives) is in **`docs/business/`**. Read the relevant page before building anything that touches clients' packages, renewals or permissions.

---

## Where things are

| What | Where |
| --- | --- |
| Working copy | `C:\Users\austi\Projects\Journey-System-Beta-master`. Copies under `J:\` and at `C:\Journey-System-Beta-master` are stale — never edit them |
| Front end | React 19 + TypeScript + Vite + Tailwind 4. **No router**: `src/AppContent.tsx` switches on `currentView` |
| New feature code | `src/features/<name>/` — pure logic in `.ts` with a `.test.ts` beside it, screens in `.tsx`. Most feature folders have a `README.md` explaining their decisions: read it before changing that feature |
| Types | `src/types.ts`, plus `src/types/journal.ts` and `src/types/machines.ts` |
| Web server | `server.ts` (Express on Render): serves the build and `/api/*` — the Mindbody proxy and the Gemini endpoints. Every `/api/mindbody/*` route needs a staff sign-in (`server/auth.ts`); Mindbody calls go through `server/mindbody-client.ts` |
| Scheduled jobs | `server/cron-*.ts` (Render cron jobs, bundled by esbuild — they can import pure modules from `src/`). The nightly renewals job is `server/renewals-job.ts`, run by `server/cron-renewals.ts` |
| Renewals and InBody | `src/features/renewals/` (engine, pipeline, outcomes — read its `README.md`), `src/features/admin/renewals/` (Operations → Renewals), `src/features/inbody/` |
| Learning, Planner, machines, comments | `src/features/learning/` (the Learning tab: Overview, one search, links to any page), `src/features/planner/` (the Planner — was To-Do — and its private Notes in `notes/`), `src/features/machine-db/` (All MSF machines: sharing and adopting), `src/features/comments/` (comments with @tags). `LEARNING-PLANNER-ROUND.md` is the round |
| Cloud Functions | `functions/src/` — `mindbodyWebhook`, trainer rollups, staff photos, nightly facility analytics |
| Security rules | `firestore.rules`; tests in `tests/firestore.rules.test.ts`; indexes in `firestore.indexes.json` |
| One-off scripts | `scripts/*.ts` — service-account auth, dry-run by default, `--commit` to write |
| Round documents | Repo root: `*-PROPOSAL.md`, `ADMIN-OVERHAUL-ROUND*.md`, `GO-LIVE-SEP10.md`, etc. `ROADMAP.md` is the living plan; `TESTING-CHECKLIST.md` is the iPad walkthrough |
| Training method source text | `docs/msf-academy/` |

## Environments

- **Production** Firebase project `gen-lang-client-0731527386`, named database `ai-studio-32cbbdcc-6e08-4770-9665-867c68878efa`. The project id inside `firebase-applet-config.json` is not the live one.
- The local `.env` points at **production**, so local writes change real client records.
- The live app is a Render web service (`maxstrength-app-beta.onrender.com`). **Every push to `master` deploys it.** Cloud Functions and Firestore rules deploy separately with the Firebase CLI.
- Four studios on two Mindbody sites: westlake, Strongsville and Willoughby share site **29068** (locations 3, 5, 4); Solon is site **5746957** (location 1). The schedule pull-sync runs one studio at a time.

## Commands

| Task | Command | Note |
| --- | --- | --- |
| Install | `npm ci` | `npm install` fails with an `edgesOut` error |
| Run locally | `npm run dev` | Port 3000 |
| Typecheck | `npx tsc --noEmit` | Compare the error **count** to master's baseline (20 after the Sep 10 go-live); don't expect zero |
| Tests | `npx vitest run src` | 1,443 passing on Sep 10, before the Renewals round added its suites |
| Build | `npx vite build` | |
| Rules tests | `npm run test:rules` | Needs JDK 21. "Port taken" means an old emulator still holds 8080 — stop it first |

**Deploy order:** `firebase deploy --only firestore:indexes` → `npm run test:rules` → `firebase deploy --only firestore:rules` → `git push origin master` (the app goes live). Rules go first when they only add access, so the running app is unaffected and the new one finds its rules waiting. If the rules tests fail, stop. Releases are shipped with a staged PowerShell script (`ship-sep10.ps1`, `ship-renewals.ps1`): `-Stage prepare`, then `-Stage golive`.

## Decisions already made — don't change them without asking

**Product**
- iPad-first, portrait and landscape. Nothing tappable under 40px; hover is never the only way to find something; names are never truncated.
- **Sentences, not scores.** Every claim a screen makes has a named minimum sample, and below it the screen says "not enough data yet".
- A confident wrong number is worse than a missing one (the "In Journey since" rule).
- **Nothing contacts clients or trainers** — no email, SMS or push outreach. In-app only.
- Use the design tokens (`equipment.tokens.css`, and `admin.tokens.css` in admin screens); no raw hex. The red kaizen mark is reserved for rep quality.
- Dates are the studio's Eastern day (`src/lib/studio-time.ts`).
- Admin / Operations screens follow `src/features/admin/README.md` (dirty-tracked saves, only the diff is written, plain studio English).
- The To-Do screen is the **Planner** (Studio · My tasks · Notes); its view id is still `studio-tasks`. Planner notes are private to their author; **Share** copies a one-client note onto that client's record.
- Sharing between studios is the studio's choice, per machine and per tip or note (a "Share with all MSF studios" switch). Comments stay within the studio; a tag rings the tagged person's bell and nothing else.

**Data**
- Mindbody owns people, bookings and contracts; Journey owns coaching data. A Mindbody client lives at `clients/{mindbodyClientId}` — no name matching, ever.
- Every query names the studios it reads (`src/lib/tenancy.ts`). Sessions are scoped by **client**, not studio.
- Never write to a collection from inside a listener on that same collection. A failed read means "unknown", never "empty". No per-client queries in a loop.
- Keep running totals (`trainerTally`, `machineStats`, trainer rollups) instead of re-reading history when a screen opens.
- Firestore rules apply to whole documents: anything some roles must not see goes in its own document.
- **Don't change the Mindbody integration, Cloud Functions or the Firestore structure without an explicit OK.**

**How we work**
- Big changes: a proposal document when asked for one, then one branch with one commit per phase, each phase typechecked on its own so it can be reverted alone.
- Explain changes in plain language as you go, and give click-by-click Windows / PowerShell steps for anything that has to be run on the PC.
- Never print a secret. `.env` and `service-account.json` stay out of git. The GitHub repo belongs to the MaxStrengthFitness organization.

## Roles

`ROLE_LABELS` in `src/types.ts` is the vocabulary: **Life Transformer** (a trainer), **Studio Leader** (`StudioLeader`, `HeadTrainer`), **Franchise Owner** (`Owner`, `StudioOwner`, `FranchiseOwner`), **Founder / Overseer**, **System Administrator**. The Operations (admin) dashboard is reachable by studio leaders and above. Details: `docs/business/roles-and-permissions.md`.

## Known traps (as of Sep 11 2026)

- **Mindbody routes need a sign-in.** Browser code must call them with `authedFetch` (`src/lib/authed-fetch.ts`); a plain `fetch` gets a 401. A new `/api/mindbody/*` route inherits the check. One that should be admin-only goes in `ADMIN_ONLY_MINDBODY_PATHS` in `server.ts` — lowercase, with no trailing slash. The check refuses a `siteId` or `mindbodyClientId` that isn't a plain id.
- **The web service has no Firestore admin key.** Server code can't read or write Firestore as an admin; `server/auth.ts` reads with the caller's own token over REST. The cron jobs do have the service account.
- **`clients/{id}.renewal` belongs to the nightly job.** The rules refuse any app write that changes it, so never write a whole client object back — write only the fields that changed.
- **A renewal cycle is checked as a whole document.** A leader's write to `studios/{s}/renewals/{cycleKey}` must fit `renewalCycleKeys()` in `firestore.rules`. Any new field the job writes has to be added there, or leaders are locked out of that cycle.
- **Pricing options are replaced, contracts are merged.** Each pull replaces `client.mindbodyServices` whole and merges `client.mindbodyContracts`. Mindbody dates are read as UTC days (`mindbodyDayKey`).
- **Attendance before a studio's first synced booking is unknown, not zero.** Pace and proof say so rather than showing "no visits".
- **InBody is health data.** Scans live in `clients/{id}/inbodyScans` under the sessions-style rule. Never copy InBody numbers into `progressReports`, which any signed-in user can read.
- Two Mindbody sites share one client-ID namespace in `clients/`. Collisions haven't been ruled out: run `scripts/check-mindbody-client-collisions.ts` before subscribing site 29068 to contract events.
- `register-webhook.js` now takes `--site` and `--list` and includes the contract and membership events, but neither site is subscribed to them yet. Deploy the Cloud Functions first.
- **Found Sep 11, not yet fixed — needs AJ's OK.** Two holes let a signed-in trainer grant themselves access, which undoes every role check in the rules and the Mindbody gate's per-site check:
  - A trainer can edit their own `trainers/{uid}` document, including `role` (anything but Admin, Founder or Overseer), `ownedStudioIds` and `accessibleStudioIds`.
  - Any trainer can edit any `studios/{id}` document, including `mindbodySiteId`.
- **Also open, needs AJ's OK:** any trainer at any studio can create and update another studio's `taskInstances` and `taskRequests` (studio tasks and requests).
- `progressReports`, `journalEntries`, `exerciseLogs`, `clinicalIncidents` and `schedules` are readable by any signed-in user. Studio-scoped: `clients`, `sessions`, comments, and (since the Learning + Planner round) a studio's `playbook` and `wiki`.
- **Studio content writes need `writesForStudio(studioId)`** since the Learning + Planner round: machine notes, the upkeep log, playbook, wiki blocks and comments. `writesForStudioPerRules` (`src/features/learning/permissions.ts`) mirrors it for buttons.
- **Use the Auth uid, not `authTrainer.id`, for anything a rule pins to the signed-in person** — note paths, comment authors, `readBy`, personal tasks. The two differ on older accounts.
- **Shared lists are collection-group reads.** Each needs a `{path=**}` rule its filters satisfy (`shared == true`) and a collection-group index. Until a new index finishes building, the screen says it couldn't load the shared part.
- **Announcements** can be posted only by `canPostAnnouncements()` (administrators, founders, franchise owners, studio owners), as themselves; only the Operations tab's people reach every studio. Everyone else may only add their own uid to `readBy`.
- **Roster entries name their own studio** (`studioId` must match the path), and a copy adopted from another studio can't be shared.
- **Sessions still use the app-wide machine list**, not each studio's roster, so a studio's own or adopted machines aren't in the session picker yet (ROADMAP).
- **Never type a raw control or invisible character into source** (a NUL, U+F8FF): write the escape (`\u0000`, `\uf8ff`). A raw NUL makes git treat the file as binary, and a binary diff can't ship as a patch.
- The nightly leaderboard job reads every exercise log ever written.
- `setCustomUserClaimsV2` is never called, so every role check in the rules costs a document read.
- On AJ's PC, Claude's Linux shell can't reach the project folder: it failed to mount it before, and a Windows update on Sep 8 2026 stopped it starting. The file bridge (stage and commit files) still works. The cloud container can't `npm ci` (the proxy blocks the registry), so typecheck and tests there run against type stubs. **AJ's own `tsc`, `vitest` and `test:rules` runs are the ones that count.**
