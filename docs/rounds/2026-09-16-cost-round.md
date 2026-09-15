# The cost round — Sep 16 2026

**Brief (AJ, Sep 15).** An audit in another chat listed what would get expensive as real clients arrive, plus some dead code. AJ commented on each item and handed the fixes over: the leaderboard job should become *machine trends* ("compare every client on the Compound Row; most clients at 5'7" use chest pad 5"), weekly not nightly; custom claims "if it's an easy fix, just handle it"; bound the journal listeners but say how it would affect them; the schedule needs today and tomorrow accurate, the rest of the week fresh within ~15 minutes with a manual pull; delete the `?classic-todo` hatch, the zip, the log and patch folders; run knip "if it will really help our code".

**Shipped as six commits on `cost-cleanup`, one per phase, each revertable alone**, plus this document. Built in the cloud mirror (which *can* `npm ci` now — CLAUDE.md said otherwise; corrected), typechecked at the 18-error baseline, 2,128 tests green at `TZ=America/New_York` (2,077 before), Vite and backend bundles built. The rules tests could not run in the cloud (the emulator jar's host is blocked there), so they run on the PC in `ship-cost.ps1 -Stage golive` before anything deploys.

## 1. Machine trends replace the leaderboard (`feat(trends)`)

**What was wrong.** `server/leaderboard-cron.ts` read *every* exercise log ever written, every night, to rank clients by load — and nothing in the app read the result. The only reader, `useClientPercentile`, was never imported; the dashboard screen had been deleted in an earlier round. Growing cost, zero readers.

**What replaced it.** A weekly job, `server/machine-trends-job.ts` (entry `server/cron-machine-trends.ts`, PC runner `scripts/run-machine-trends.ts`, dry run by default), reading one 90-day range on `exerciseLogs.createdAt` and the active clients, and writing one document per machine at `machineTrends/{machineId}` plus `machineTrends/_summary`:

| Field | What it answers |
| --- | --- |
| `clients · sets · sessions` | how used is this machine |
| `load` | the distribution of each client's best (`min p25 median p75 max avg`) |
| `settings[key][value]` | for chest pad = 6: how many clients use it, how many sets, their median best, and **`byHeight`** — inches → client count |
| `byHeight[inches]` | clients, sets and median best at each height |
| `studios[homeStudioId]` | the same split per studio |

The aggregation is pure and tested (`src/features/machine-trends/trends.ts`, README beside it). Rules that are load-bearing: **sentences, not scores** — every median is `null` under `MIN_CLIENTS` (5) so a screen says "not enough data yet"; **performed sets only** through `isPerformedLog()`; **never a client row** — the document is readable by any signed-in trainer and clients are studio-scoped, so "this client vs everyone" is the client's own `machineStats` against the distribution here; settings are normalised so the old label-keyed snapshots (`"Chest Pad"`) and the slug-keyed ones (`chest-pad`) count together, and the *latest* snapshot per client is the one that counts.

**Render.** The service keeps its name `journey-cron-leaderboards` on purpose (a renamed blueprint service is a new service to Render); schedule `0 7 * * 0` (Sundays), command `cron:machine-trends`. Rules gain a `machineTrends` block; the `leaderboards` block stays so the stale documents can be deleted from the console. **No screen reads the new data yet** — the Machine Trends screen is the natural next round (`ROADMAP.md`).

**Also fixed here.** `LogPastSessionDialog` ordered logs by a `date` field logs do not have, so "pre-fill the machines they usually do" had never worked; and it stamped `createdAt` as a string, which no Timestamp range query can see. Now `orderBy("createdAt")` and `serverTimestamp()`.

**Not touched, flagged.** The Cloud Function `calculateFacilityAnalyticsV2` (`functions/src/index.ts`, nightly) also reads every exercise log with no filter and no performed-set rule, and no `src/` code reads what it writes. Cloud Functions are not changed without an explicit OK; it is on the roadmap.

## 2. The role claim (`feat(auth)`)

**What was wrong.** `firestore.rules` resolves the caller's role in almost every rule. It checks `request.auth.token.role` first and, only when that is absent, reads `trainers/{uid}` — a billed read on nearly every request. A callable `setCustomUserClaimsV2` existed to set the claim; nothing ever called it, so the read happened every time.

**What shipped.** A Cloud Function, `syncTrainerClaims` (`functions/src/claims.ts`, pure decision in `claims-logic.ts` with tests), mirrors `trainers/{id}.role` onto the auth user's claims on every create, change and delete — a deleted or superseded document clears it; a document whose id is nobody's auth uid is skipped. **Only `role` is mirrored**: the rules also honour a `studioId` claim that grants studio-leader access with no role check, so it is never set. `useAuthInitialization` refreshes the token once at sign-in when its role disagrees with the document; with no claim the rules fall back to the document exactly as before. `isAdmin()` / `isFounder()` now go through `getRole()` — the old bodies did an `exists()` for any non-matching claim anyway, so a trainer's every `isSuperAdmin()` still cost a read. A one-time backfill for existing trainers: `scripts/backfill-trainer-claims.ts` (dry run by default).

**Freshness.** A token carries its claim for up to an hour; a role change lands at the next sign-in at the latest, and until then the *old* claim wins in the rules — the same hour a demotion always took, since the token is checked first.

**The hole closed with it — AJ, this is the one to shout about if you disagree.** Mirroring the role onto the token makes it *stick*, so the rule that let a trainer edit their own `role`, `ownedStudioIds`, `accessibleStudioIds`, `activeGuestStudioIds` and `primaryHomeStudioId` (the first "needs AJ's OK" hole in CLAUDE.md) could not stay open. A trainer still edits their own profile — photo, bio, PIN, roster — but not those five fields; leaders and above still set them for the people they manage, through the other branches of the same rule. Rules tests cover it. The second hole (any trainer can edit any `studios/{id}`) and the cross-studio `taskInstances`/`taskRequests` writes are still open, still awaiting the OK.

**Deploy steps this adds** (all in `ship-cost.ps1 -Stage golive`): `firebase deploy --only functions:syncTrainerClaims`, then the rules, then the backfill once.

## 3. The journal guard rail (`fix(journal)`)

Four of `useClientJournal`'s seven listeners had no limit: `clientFocuses`, `focusRecords`, `clinicalIncidents`, `trainerFocuses`. Each now carries `limit(JOURNAL_GUARD_LIMIT)` = 200, **unordered on purpose**. AJ asked how a limit would affect those screens — a real "newest 50" would have: the focus board counts every past focus ("N past focuses") and offers a new one only when the trainer has no active one, so a cut-off active focus would come back as a duplicate, and the briefing's "before you start" count would run short. At 200, no real client is anywhere near it, so nothing changes today; a client that does hit it gets a line on the journal tab ("only the first 200 are loaded; counts may run short") from the hook's new `capped` flag instead of a quiet miscount.

## 4. The schedule window (`perf(schedule)`)

**What was wrong.** One `onSnapshot` on every booking from 24 hours ago to 30 days ahead. The pull-sync rewrites `lastSyncAt` on every booking it touches, so each sync billed all of those documents to every open device — and the calendar could never show a week outside that window.

**What shipped** (`src/lib/schedule-window.ts`, pure and tested; `src/hooks/useLiveSchedule.ts`; the calendar):

- **Live:** yesterday, today and tomorrow — three studio days, still a listener (the cheapest way to have today right the moment Mindbody changes). It re-anchors itself just after the studio's midnight for an iPad left open overnight.
- **Fetched:** everything else, through `ensureRange(from, to)` — one `getDocs` per range, cached by document id with per-day coverage, so a range read in the last 15 minutes costs nothing. The week ahead (`WEEK_AHEAD_DAYS` = 8, the roster's old reach) is fetched on mount — trimmed to start *after* the live days, so an app open never reads them twice — and again every 15 minutes while the tab is visible. That keeps the Hub's day tabs, the Operations week load and the trainer's "upcoming" list working with no listener.
- **The calendar** asks for whatever it is showing, so past weeks and months further out now fill in (they used to come up empty), and it gains a **Refresh** control (40px, tokens) with "Updated N min ago".
- `schedules` is the merge of the two (live wins by id, cancelled dropped, sorted) — the same list every consumer already received, so nothing downstream changed. The roster reads the merged list.

**Not built: "sessions completed this month".** It is cheap — one Firestore count query on `sessions` (`hostedAtStudioId == studio`, `date >= first of month`, `status == "Completed"`) plus a `(hostedAtStudioId, status, date)` index — but a count query is checked against the `sessions` read rule like a list, and that rule could not be exercised in the cloud this round. On the roadmap with the design; a tile on the Operations overview when it comes.

## 5. The escape hatch and the dead comments (`chore(planner)`)

The hub has had its week. Gone: `CLASSIC_TODO` and its branch in `AppContent`, the lazy import, `StudioTasksView.tsx` (774 lines), its barrel exports and the 50 `studio-tasks.css` rules only it used — the `--st-*` tokens and the `.st` root stay, the Planner, the Hub, the wiki and the Catalog's upkeep card build on them. The duplicated and orphaned "Lazy-loaded" comments in `AppContent` too.

## 6. knip, ten files, six packages (`chore`)

`knip.json` names the real entry points (the no-router app, the Render bundles, the Cloud Functions index, scripts, tests); run it with `npx knip@5`. Deleted, each confirmed by grep: five old chart/card components, an unused shadcn `scroll-area`, `src/constants.ts`, `data/clinical-tags.ts`, `data/insights-logic.ts`, `hooks/useSessionMachines.ts`. Removed from `package.json`: `@google-cloud/pubsub`, `d3` + `@types/d3`, `react-body-highlighter`, `autoprefixer`, `ts-morph` — `npm ci` from the new lock, the typecheck and both builds verified. **Kept despite knip:** `shadcn`, `tw-animate-css`, `@fontsource-variable/geist` — CSS imports in `src/index.css` that knip cannot see. Its 430 "unused exports" are mostly barrel re-exports, shadcn pieces and constants that only tests read: a starting list, not a verdict, left alone.

## 7. The zip, the logs and the patch folders

None of them were ever in git — `*.zip`, `/logs/`, `/patches-*/`, `/Claude outputs/` and `*.log` are all in `.gitignore` — so "remove them from the repo" was already true. They only sit on the PC. `ship-cost.ps1 -Stage tidy` moves them into `backups\tidy-<date>\` (also gitignored) rather than deleting, so nothing is lost if one turns out to matter. The AI Studio zip needs no replacement: it was a packaged copy of the repo for a sandbox that is abandoned (`docs/rounds/`… the AI Studio note), not an asset the app shows.

## The ship

`backups\cost-ship\ship-cost.ps1` — `-Stage prepare` (preflight, patches onto `cost-cleanup`, `npm ci` because the lock file changed, typecheck, tests at the studio's clock, both builds), then `-Stage golive` (rules tests, rules, the one Cloud Function, the claims backfill, merge and push). Two optional stages after: `-Stage trends` runs the machine-trends job now instead of waiting for Sunday, `-Stage tidy` does §7.

## Left for next time

- **The Machine Trends screen** — reads `machineTrends/_summary` for the list and one document per machine; "this client vs everyone" from `client.machineStats`. Learning is the natural home.
- "Sessions completed this month" (§4).
- `calculateFacilityAnalyticsV2` — the other all-logs read (§1), needs an OK to touch.
- The `studios/{id}` write hole and the cross-studio task writes, still open.
- knip's unused-exports list, if anyone wants a slow afternoon.
