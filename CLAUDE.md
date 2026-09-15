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
| FORD (Family, Occupation, Recreation, Dreams) | `src/features/ford/` — the Life section of the client profile, mid-session capture, the post-session sweep and the studio Delight queue. Read its `README.md` first |
| Renewals and InBody | `src/features/renewals/` (engine, pipeline, outcomes — read its `README.md`), `src/features/admin/renewals/` (Operations → Renewals), `src/features/inbody/` |
| Learning, Planner, machines, comments | `src/features/learning/` (the Learning tab: Overview, one search, links to any page), `src/features/planner/` (the Planner — was To-Do — and its private Notes in `notes/`), `src/features/machine-db/` (All MSF machines: sharing and adopting), `src/features/comments/` (comments with @tags). `docs/rounds/LEARNING-PLANNER-ROUND.md` is the round |
| Cloud Functions | `functions/src/` — `mindbodyWebhook`, trainer rollups, staff photos, nightly facility analytics |
| Security rules | `firestore.rules`; tests in `tests/firestore.rules.test.ts`; indexes in `firestore.indexes.json` |
| One-off scripts | `scripts/*.ts` — service-account auth, dry-run by default, `--commit` to write |
| Architecture | `docs/ARCHITECTURE.md` - purpose and scope, the screen map, the data dictionary, the code SOP and the roadmap. **Read it before proposing anything** |
| Round documents | `docs/rounds/` (index in `docs/rounds/README.md`; the full journal in `docs/rounds/CHANGELOG.md`). `ROADMAP.md` is the short working list; `docs/ops/TESTING-CHECKLIST.md` is the iPad walkthrough; runbooks in `docs/ops/` |
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
| Typecheck | `npx tsc --noEmit` | Compare the error **count** to master's baseline (18 after the FORD round removed two dead panes; 20 before that); don't expect zero |
| Tests | `npx vitest run src` | 2,077 passing after the four-tab profile round (Sep 15) — run it as `TZ=America/New_York npx vitest run src`, see the date trap below; 2,046 after the FORD round; 2,027 after the fix round; 2,015 after the tracker round; 1,813 after the floor round |
| Build | `npx vite build` | |
| Rules tests | `npm run test:rules` | Needs JDK 21. "Port taken" means an old emulator still holds 8080 — stop it first |

**Deploy order:** `firebase deploy --only firestore:indexes` → `npm run test:rules` → `firebase deploy --only firestore:rules` → `git push origin master` (the app goes live). Rules go first when they only add access, so the running app is unaffected and the new one finds its rules waiting. If the rules tests fail, stop. Releases are shipped with a staged PowerShell script (`scripts/ship/ship-*.ps1`): `-Stage prepare`, then `-Stage golive`.

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

## Known traps (as of Sep 15 2026, after the four-tab profile round)

- **The client profile is FOUR tabs and each one is a question, not a screen name.** Journey (what has she done) · Programming (what is she supposed to do — Routines + Equipment) · Notes & Profile (what do we know — the FORD spine) · Clinical History (what has already happened — Clinical + History). **Where the trainer is is NOT a string**: it is a `ProfileLocation` — a tab AND a segment inside it — owned by one reducer in `src/features/client-profile/profile-nav.ts` and reached through `useProfileNav`. Never add a second copy of it. Every tab id the profile has ever used still resolves, through `legacyLocation()`; add to that map rather than chasing call sites. Read `docs/rounds/2026-09-15-four-tab-profile.md` before touching the profile's navigation.
- **The sub-toggle is one component and its rules are load-bearing.** `ProfileSubnav` — sticky, 48px, segments as EQUAL fractions of the full width, brand blue (never hero orange, which is Start Session). The iPad is held and often not looked at: a segment is found by POSITION, so never size a segment to its text and never move the bar. **Never hide a segment** — Routine B with no B reads "OFF" and the switch to turn it on lives behind it.
- **Switching a sub-view must cost no fetch.** Every pane reads what the profile already loaded, or keeps its own gate (Trends still generates on request). Mount rules: Routine A/B and Reports unmount when hidden; **All Machines and Trends are mounted on first use and hidden thereafter** (they hold a selection / a generated report); Calendar and Sessions are ONE mount of `ClientHistoryTab`. Don't "tidy" any of those into plain conditional renders.
- **A sticky bar in this app needs the scroller's padding negated.** The app shell is a bounded 100dvh column, so the document never scrolls — an inner `p-6` container does, and every engine pins a sticky box inside that padding. `--hist-stick-top` (History's month headers) and `--psub-stick-top` (the sub-toggle) are both that measurement. A sticky bar also needs an OPAQUE background from `--background`, or content scrolls through it. Inside Clinical History the month headers additionally offset by `--psub-stuck-h`, which `ProfileSubnav` publishes on the enclosing `.ptab`.
- **The client profile's record tab is the whole non-training record.** The FORD merge: one spine, sections `general · life · medical · goals · focus · notes · reports · admin`, defined once in `DOSSIER_SECTIONS` (`src/types/journal.ts`). `lifestyle` and `events` no longer exist. The `reports` section is titled **Assessment** and composes only — the filed shelf lives in Clinical History → Reports (four-tab round: compose in the record, read the archive in the past). `ClientJournalTab` is mounted inside the spine with an `areas` list; given `areas` it draws no jump nav and no critical rail, because the spine owns navigation. It also takes a preloaded `journal` — the dossier loads `useClientJournal` ONCE and shares it, so don't add a second hook in a journal area.
- **Personal detail goes in FORD, not the journal.** `clients/{id}/ford/{id}`, studio-scoped by the client it hangs off; `journalEntries` is readable by any signed-in user, which is why it is not there. `pillar` is NULLABLE by design and the rules do not validate it — null means "caught mid-set, filed at teardown", and making it required puts a decision between a trainer hearing something and recording it. "Personal" was removed from the journal composer; old `life` entries still render. `client.events` is READ as FORD through an adapter and never written. Read `src/features/ford/README.md` before touching any of it.
- **Colour by urgency, never by pillar** on FORD screens, and `clients/{id}.fordSummary` is a cache — the subcollection is the truth.
- **A `<button>` centres its own text.** Several FORD details render inside buttons so they can be opened, and a Tailwind `text-left` on them did not survive layer ordering in every build. Text alignment on a button belongs in the feature's CSS file, not in a utility class (FORD round, Sep 15).

- **Set data has four outcomes; only `performed` counts.** Read an outcome through `outcomeOf()` / `isPerformedLog()` in `src/lib/set-outcome.ts`, never off the `outcome` field (older logs don't have it — a count means performed, no count means skipped). Every average, rollup, "last time" and progression figure filters to performed sets; a new reader of `exerciseLogs` does the same. Session start seeds a weight-only log for every planned machine, so a weight alone is not "the trainer worked on this" — `isBegunLog()` is. **Never block a save**: End Session confirms, it does not refuse (docs/ARCHITECTURE.md §1.6, `docs/rounds/2026-09-12-floor-round.md`).

- **Nothing on the Active Session deletes a session except Discard.** A 60-minute "abandoned session" loop used to `deleteSession` with every set in it; it is gone (tracker round, Sep 13). Abandonment is a read-side rule (`isSessionValid`). The bottom tab resumes the trainer's own live session after a crash (`src/lib/live-session.ts`); per-machine time is `src/lib/machine-clock.ts` and runs only while a machine is current — never "since the last one". `docs/rounds/2026-09-13-tracker-round.md`.
- **The session is saved at End Session, once.** `commitEndSession` is the only caller of `completeWorkoutSession` (its counters are `increment()`s — a second call double-counts). The post-session screen only appends: `clientFeel` by `updateDoc`, the closing note by `createJournalEntry`. There is no Finalize button to bring back.
- **Package facts come from `client.renewal`** (the nightly snapshot), read through `src/lib/directory-row.ts` on lists — never from `packageTier`, `remainingSessions` or `nextSessionDate`, which nothing keeps current. There is no field for leader-granted extra sessions yet.
- **One loading mark.** `components/LoadingMark.tsx` (`LoadingMark`, `LoadingArea`) is the wait state — never hand-roll another `animate-spin` div. Hub card markers come from `src/lib/hub-markers.ts` and read only what the Hub already holds (no reads per card).
- **In a flex column, a card with `overflow: hidden` must be `flex: none`**, or a short container shrinks the card instead of scrolling (this was the machine sheet's "truncation"). The same rule bit the Hub card: `truncate` *is* `overflow: hidden`, so a truncated text line in a fixed-height flex column is the line the browser squeezes to 0px — give the lines that must survive `shrink-0` and let one line (`min-h-0 overflow-hidden`) be the one that yields (fix round, Sep 13).
- **Two grid items in the same named `grid-area` are drawn on top of each other**, not stacked. A block that should push content down goes in its own row (`col-span-full`, no area name) — this was the profile's "Trained by" list covering the stat tiles.
- **`WorkoutTrackerView` draws three screens and the order is a rule**, `lib/tracker-screen.ts`: post-session first while its snapshot exists, then none / briefing / tracker. The client's sessions stream turns pre-session mode on whenever nothing is In-Progress — including the beat after Finish — so never check the briefing before the post-session screen.
- **The check-in is the Assessment on screen** (fix round, Sep 13): labels say "Assessment"; the code, the Firestore fields (`progressReports`, `isCheckInOnly`, `subjectiveSnapshot`) and file names still say check-in until the Assessment round merges the model. The journal's focus "check-ins" are a different thing and keep their name.
- **Mindbody routes need a sign-in.** Browser code must call them with `authedFetch` (`src/lib/authed-fetch.ts`); a plain `fetch` gets a 401. A new `/api/mindbody/*` route inherits the check. One that should be admin-only goes in `ADMIN_ONLY_MINDBODY_PATHS` in `server.ts` — lowercase, with no trailing slash. The check refuses a `siteId` or `mindbodyClientId` that isn't a plain id.
- **The web service has no Firestore admin key.** Server code can't read or write Firestore as an admin; `server/auth.ts` reads with the caller's own token over REST — and only single documents, never a collection list: a list is refused when any one document in it is off-limits, which took the schedule sync down on Sep 13. The cron jobs do have the service account.
- **`clients/{id}.renewal` belongs to the nightly job.** The rules refuse any app write that changes it, so never write a whole client object back — write only the fields that changed.
- **A renewal cycle is checked as a whole document.** A leader's write to `studios/{s}/renewals/{cycleKey}` must fit `renewalCycleKeys()` in `firestore.rules`. Any new field the job writes has to be added there, or leaders are locked out of that cycle.
- **Pricing options are replaced, contracts are merged.** Each pull replaces `client.mindbodyServices` whole and merges `client.mindbodyContracts`. Mindbody dates are read as UTC days (`mindbodyDayKey`).
- **Attendance before a studio's first synced booking is unknown, not zero.** Pace and proof say so rather than showing "no visits".
- **InBody is health data.** Scans live in `clients/{id}/inbodyScans` under the sessions-style rule. Never copy InBody numbers into `progressReports`, which any signed-in user can read.
- Two Mindbody sites share one client-ID namespace in `clients/`. Collisions haven't been ruled out: run `scripts/check-mindbody-client-collisions.ts` before subscribing site 29068 to contract events.
- `scripts/mindbody/register-webhook.js` now takes `--site` and `--list` and includes the contract and membership events, but neither site is subscribed to them yet. Deploy the Cloud Functions first.
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
- **A reducer passed to `useReducer` must close over NOTHING declared below it.** React calls a reducer while processing a QUEUED action, and it does that during the next render at the point of the `useReducer` call — so a wrapper arrow reading a `const` declared a few lines further down reads it in its temporal dead zone. The four-tab profile shipped exactly this: it opened fine and threw `Cannot access 'ctxRef' before initialization` on the first tab tap. `profileNavReducer` now takes two arguments, lives at module scope and gets everything from the ACTION, assembled at dispatch time. Same rule for anything else React may call mid-render.
- **Anything that throws in a `useLayoutEffect` takes the whole screen to the error boundary.** Feature-detect browser APIs there: `typeof ResizeObserver === "function"` before `new ResizeObserver` (JourneyGrid and ProfileSubnav do; one JourneyGrid use at line ~569 still does not — pre-existing).
- **`npx vitest run src` does NOT mount anything** except `src/features/client-profile/profile-nav.render.test.tsx`, the first render tests in the repo (jsdom, raw `react-dom/client`, no testing-library). A clean typecheck, a full green suite and a production build all passed while the profile crashed on every tab tap. **Add a render test for any hook or component that does work during render or in a layout effect** — they are cheap and they are the only check that would have caught it.
- **A date-ONLY ISO string is UTC; a date-TIME with no zone is LOCAL.** `new Date("2026-09-20")` is UTC midnight, `new Date("2026-09-20T10:00:00")` is local. Mixing the two in one comparison passes in CI (UTC) and fails on a studio PC (Eastern), which is the worst shape a date bug can have — it cost a red `ship` run on Sep 15. `toDate()` in `src/types/journal.ts` pins a date-only string to local NOON for exactly this reason; never hand a raw `new Date("yyyy-mm-dd")` to anything that then does local-calendar arithmetic. **Run the suite with `TZ=America/New_York` before shipping**, not just in UTC. (Known and unrelated: `src/features/renewals/conversation.test.ts` fails at UTC+14; no studio is east of Eastern.)
- **Never type a raw control or invisible character into source** (a NUL, U+F8FF): write the escape (`\u0000`, `\uf8ff`). A raw NUL makes git treat the file as binary, and a binary diff can't ship as a patch.
- The nightly leaderboard job reads every exercise log ever written.
- `setCustomUserClaimsV2` is never called, so every role check in the rules costs a document read.
- On AJ's PC, Claude's Linux shell can't reach the project folder: it failed to mount it before, and a Windows update on Sep 8 2026 stopped it starting. The file bridge (stage and commit files) still works. The cloud container can't `npm ci` (the proxy blocks the registry), so typecheck and tests there run against type stubs. **AJ's own `tsc`, `vitest` and `test:rules` runs are the ones that count.**
