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
| Scheduled jobs | `server/cron-*.ts` (Render cron jobs, bundled by esbuild — they can import pure modules from `src/`). The nightly renewals job is `server/renewals-job.ts`, run by `server/cron-renewals.ts`; the weekly machine-trends job is `server/machine-trends-job.ts` (`src/features/machine-trends/` is its pure core — read that README first) |
| The Dial and Loudness | `src/features/rating/` — the ONE rating control and the ONE loudness control (reporting round, Sep 16). Read `scales.ts` first; `session-reads.ts` reads a session's Dial fields with their legacy fallbacks. `docs/rounds/2026-09-16-reporting-round.md` is the round |
| Pulse (the living assessment) | `src/features/subjective-report/` (folder and Firestore fields still say check-in / subjective) — the panel is `components/journal/ClientCheckInPanel.tsx`, the floor entry is `PulseQuickLog`, client mode is `PulseClientMode.tsx`. The Kaizen Deep Dive is `src/features/clinical-review/` |
| FORD (Family, Occupation, Recreation, Dreams) | `src/features/ford/` — the Life section of the client profile, mid-session capture, the post-session sweep and the studio Delight queue. Read its `README.md` first |
| Renewals and InBody | `src/features/renewals/` (engine, pipeline, outcomes — read its `README.md`), `src/features/admin/renewals/` (Operations → Renewals), `src/features/inbody/` |
| Learning, Relay, machines, comments | `src/features/learning/` (the Learning tab: Overview, one search, links to any page), `src/features/relay/` (**Relay** — was the Planner, was To-Do; the folder was `features/planner/` until the beta-prep trim — with Relay's own pieces in `board/`, team jobs in `jobs/`, the Team tab in `team/`, reminders in `reminders/` and private Notes in `notes/`; the Floor tab and the task data layer are `src/features/studio-tasks/`), `src/features/machine-db/` (All MSF machines: sharing and adopting), `src/features/comments/` (comments with @tags). `docs/rounds/LEARNING-PLANNER-ROUND.md` is the first round; the Planner rework is `docs/rounds/2026-09-16-planner-rework.md`; Relay is `docs/rounds/2026-09-16-relay.md` |
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
| Typecheck | `npx tsc --noEmit` | Compare the error **count** to the baseline - **11** on `master` (`33ad0ed`) and on `beta-prep`; don't expect zero. History by round: `docs/KNOWN-TRAPS.md#baselines` |
| Tests | `npx vitest run src` | **2,977** passing on `master`, **2,982** on `beta-prep` after the trim. Run it as `TZ=America/New_York npx vitest run src` - see the date trap. History by round: `docs/KNOWN-TRAPS.md#baselines` |
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
- **Anything a trainer RATES about a client is the Dial; anything they WRITE carries a Loudness** (reporting round, Sep 16). No screen builds another rating control or another priority vocabulary. The living assessment is **Pulse** on every label (code and Firestore still say check-in / subjective).
- The To-Do screen is **Relay** (Relay round, Sep 16; it was the Planner from the rework earlier that day): Floor · Mine · Notes · Team (leaders of the studio the iPad is in) · Network (franchise and super roles); its view id is still `studio-tasks`; the folder is `src/features/relay/` (renamed from `features/planner/` in the beta-prep trim, Sep 17). AJ's brief suggested "Studio Command Center" and asked for something less corporate — Relay was the pick. **Nothing pings anyone**: the Pulse, kudos and hand-offs are in-app, and a bell rings only for what a person opted into. Notes are private to their author; **Share** copies a one-client note onto that client's record, **Share with colleagues** copies it to `studios/{s}/noteShares`, and **All MSF studios** copies it to every studio's `noteShares` as a team share — sharing is always a copy, never a visibility flag, and every save republishes.
- **Recognition, never ranking, inside a studio** (Relay): kudos are shown per person to leaders and to the person; no points, badges, per-person streaks or leaderboards among trainers. Studios may be ranked on the Network tab.
- Sharing between studios is the studio's choice, per machine and per tip or note (a "Share with all MSF studios" switch). Comments stay within the studio; a tag rings the tagged person's bell and nothing else.

**Data**
- Mindbody owns people, bookings and contracts; Journey owns coaching data. A Mindbody client lives at `clients/{mindbodyClientId}` — no name matching, ever.
- Every query names the studios it reads (`src/lib/tenancy.ts`). Sessions are scoped by **client**, not studio.
- Never write to a collection from inside a listener on that same collection. A failed read means "unknown", never "empty". No per-client queries in a loop.
- Keep running totals (`trainerTally`, `machineStats`, trainer rollups) instead of re-reading history when a screen opens.
- Firestore rules apply to whole documents: anything some roles must not see goes in its own document.
- **Don't change the Mindbody integration, Cloud Functions or the Firestore structure without an explicit OK.**

**How we work**
- **Beta prep (from Sep 17 2026): nothing goes to `master`.** The cleanup, the polish, Demo Mode and the tutorials all land on one long-lived branch, `beta-prep` - one commit per item, a tag at the end of each step. `master` stays at `33ad0ed` (what is live) until AJ says otherwise: no `golive`, no `git push origin master`, no `firebase deploy` from this work. Pushing `beta-prep` itself to GitHub is a safe backup, because Render builds only `master`. The round is `docs/rounds/2026-09-17-beta-prep-trim.md`.
- Big changes: a proposal document when asked for one, then one branch with one commit per phase, each phase typechecked on its own so it can be reverted alone.
- Explain changes in plain language as you go, and give click-by-click Windows / PowerShell steps for anything that has to be run on the PC.
- Never print a secret. `.env` and `service-account.json` stay out of git. The GitHub repo belongs to the MaxStrengthFitness organization.

## Roles

`ROLE_LABELS` in `src/types.ts` is the vocabulary: **Life Transformer** (a trainer), **Studio Leader** (`StudioLeader`, `HeadTrainer`), **Franchise Owner** (`Owner`, `StudioOwner`, `FranchiseOwner`), **Founder / Overseer**, **System Administrator**. The Operations (admin) dashboard is reachable by studio leaders and above. Details: `docs/business/roles-and-permissions.md`.

## Known traps - they live in `docs/KNOWN-TRAPS.md`

The traps are this project's scar tissue: what broke, why, and the rule that came out of it. They moved out of this file in the beta-prep trim (Sep 17 2026), word for word, because this file is read in full at the start of every session and the traps had grown to 28 KB of it. **Before you touch an area, read its section there. Add new traps there, not here.**

| If you are about to touch... | Read this section of `docs/KNOWN-TRAPS.md` |
| --- | --- |
| Relay (`src/features/relay/`), studio tasks, team jobs, reminders, private notes and sharing | Relay |
| Anything a trainer rates or writes: the Dial, Loudness, the briefing, the note sheet, the post-session screen, Pulse | Ratings, notes and Pulse |
| The client profile: navigation, the sub-toggle, the record, FORD, the machine window, Master Sync, the journal hook | The client profile |
| `WorkoutTrackerView`, exercise logs, session start and End Session, any reader of set data | The Active Session and set data |
| `client.renewal`, renewal cycles, Mindbody pricing and contracts, attendance, InBody | Packages, renewals and InBody |
| Sticky bars, flex and grid layout, buttons, loading states | Layout and CSS |
| `/api/mindbody/*`, `server/`, cron jobs, the schedule, the studio roster, the schedule sync, machine trends | Mindbody, the server, scheduled jobs and sync |
| `firestore.rules`, roles and claims, shared lists, announcements, rosters | Security rules and permissions |
| Reducers, layout effects, render tests, dates, invisible characters, what runs where | React, tests, dates and tooling |

**Always on, whatever you touch** (each is spelled out in full in that file):

- **Never block a save.** End Session confirms; it does not refuse. Only `performed` sets count toward any average - read outcomes through `src/lib/set-outcome.ts`.
- **Firestore refuses `undefined`.** Strip it before a write (`withoutUndefined`).
- **Use the Auth uid, not `authTrainer.id`,** for anything a rule pins to the signed-in person. The two differ on older accounts.
- **Mindbody routes need `authedFetch`;** a plain `fetch` gets a 401. The web service has no Firestore admin key.
- **Never write a whole client object back** - `clients/{id}.renewal` belongs to the nightly job and the rules refuse the write.
- **Two files whose names differ only by case are ONE file on Windows.** Before shipping: `git ls-files | tr A-Z a-z | sort | uniq -d` prints nothing.
- **Run the suite with `TZ=America/New_York`.** A date-only ISO string is UTC; a date-time with no zone is local.
- **A green typecheck, suite and build do not mean a screen mounts.** Only `*.render.test.tsx` files mount anything; add one for any component that does work during render or in a layout effect.
- **Never type a raw control or invisible character into source;** write the escape.
- On AJ's PC, Claude's shell can run git and `tsc` but not `vitest` or `vite`; the cloud container can run everything except `test:rules`. **AJ's `test:rules` run is the one that counts.** Use `git --no-optional-locks` for read-only git commands on the PC mount - a plain `git status` leaves an `index.lock` behind that cannot be deleted without delete permission and blocks his next git command.
