# Known traps

What broke, why, and the rule that came out of it. **Before you touch an area, read its section.** Every entry below is word for word what `CLAUDE.md` said on Sep 16 2026 (after the Relay round); the entries moved here in the beta-prep trim (Sep 17 2026) because `CLAUDE.md` is read in full at the start of every session and the traps had grown to 28 KB of it. New traps go HERE, under the area they belong to, with the date and the round that found them.

| Section | Read it before you touch |
| --- | --- |
| [Relay - the board, tasks, jobs, reminders and private notes](#relay) | the Relay screen (`src/features/relay/`), studio tasks, team jobs, reminders, private notes and sharing |
| [Ratings, notes and Pulse - the Dial and Loudness](#rating) | anything a trainer rates or writes about a client: the Dial, Loudness, the briefing, the note sheet, the post-session screen, Pulse |
| [The client profile - four tabs, the record, FORD](#profile) | the client profile: its navigation, the sub-toggle, the record (dossier), FORD, the machine window, Master Sync, the journal hook |
| [The Active Session and set data](#tracker) | `WorkoutTrackerView`, exercise logs, session start and End Session, anything that reads set data |
| [Packages, renewals and InBody](#renewals) | `client.renewal`, renewal cycles, Mindbody pricing and contracts on a client, attendance, InBody scans |
| [Layout and CSS](#layout) | sticky bars, flex and grid layout, buttons, loading states |
| [Mindbody, the server, scheduled jobs and sync](#server) | `/api/mindbody/*`, `server/`, the cron jobs, the schedule, the studio roster, the schedule sync, machine trends |
| [Security rules and permissions](#rules) | `firestore.rules`, roles and claims, who may read or write what, shared lists, announcements, rosters |
| [React, tests, dates and tooling](#tooling) | reducers, layout effects, render tests, dates and time zones, invisible characters, what runs where |

<a id="relay"></a>

## Rounds since the trim - machine fit, fluidity, My Studio, Operations, the overhaul

Everything here landed on `master` between 17 and 19 September 2026, after the
beta-prep trim moved the traps out of `CLAUDE.md`. It is kept word for word.

- **The Operations overhaul (Sep 19) — read `docs/rounds/2026-09-19-operations-overhaul.md` and `src/features/admin/overview/README.md` before touching the Overview, the changes list, the watchlist, acknowledgements, a note's window, the Floor tab or the Admins dashboard.** The load-bearing parts:
  - **The Overview reads its own week of the schedule.** `hooks/useLiveSchedule` drops cancelled rows before anyone sees them (right for the calendar), so a Changes list built on the app's `schedules` prop would never show a cancellation. `features/admin/changes/useWeekSchedule` streams today + 6 days INCLUDING cancelled rows (the `studioId, startTime` index) plus anything whose `movedFromDay` falls in the window (**a new index**: `schedules studioId, movedFromDay`). Merged by document id.
  - **The change stamps are written by the pull-sync only** (`lib/mindbody-api-sync.ts`, `changeStamps`): `movedFromDay` / `movedFromStart` / `movedAt` on a move, `cancelledAt` / `cancelSource` on a cancellation, cleared when a cancelled booking comes back. The webhook (functions/src) writes `status` alone — a cancellation it delivers shows on the list with no time. Adding the stamp there is a Cloud Functions change: AJ's explicit OK.
  - **A change belongs to the day the session was FOR, in the studio's zone.** `changesForDay(entries, day, tz)` — never bucket on `cancelledAt`, and never on a UTC date (an 8 PM Eastern booking is tomorrow in UTC). A cancellation reads as a reschedule when the client holds another live booking in the same Monday-to-Sunday week (`weekStartOf`); matched by client id, else by name.
  - **`mattersOn(entry, day)` is the one answer to "does this note matter today"** (`features/client-notes/mattering.ts`). ALWAYS = no `effectiveUntil` (until resolved; `effectiveFrom` may push the start ahead); RANGE = from–until; DAY = from and until on one studio day, `repeat: "yearly"` brings it back. The briefing's critical strip, `isHeadsUpLive`, the Overview's pain panel and its Moments all ask it; the 21-day `CRITICAL_NOTE_DAYS` fallback is gone. A note with no window behaves exactly as before. `needsReview` is the 60-day review (`reviewedAt` restarts it) and applies to shouting notes only.
  - **Acknowledgements and the watchlist live beside the studio, never on the note or the client.** `studios/{s}/acknowledgements/{kind:id}` (anyone who works there, as themselves, never deleted) and `studios/{s}/watchlist/{clientId}` (whoever runs the studio; delete = back on normal watch). A pain row is acknowledged when EVERY one of its `ackKeys` is; keys are `incident:{id}`, `note:{id}`, `pain:{clientId}:{latestDay}`. A dismissal records the snapshot's `lastVisitDate` / `nextBookingDate` on the day, so "back again" means booked or visited SINCE, not a booking that was already there.
  - **A My Studio section mounted on Operations must not call `useRelay()`.** `MachinesSection` is mounted by both My Studio → Machines and Operations → Floor (AJ: look and edit, one editor); it reads `useRelayMaybe()` and falls back to `leadsHere()`. `ContextPanel`'s styles are in `relay/board/relay.css`, imported by the Floor tab. Any other section that crosses over does the same, and the shell render test (`AdminDashboardView.render.test.tsx`) opens every tab to prove it mounts.
  - **`vi.mock` factories are hoisted above the file's constants.** A `const today = dayKey(0)` INSIDE a factory throws "Cannot access before initialization"; compute it inside the `answer()` the factory returns, at call time. The Overview's render test has the pattern.
  - **The Admins dashboard is `features/admins/`, beside `features/admin/` (Operations).** `isAdmin` (Admin, Founder) gates it in three places: the app-mode switch, the bottom bar and the view itself. Nothing on the Operations side is gated beyond opening Operations (AJ, Sep 18).
- **The Operations round (Sep 19) — read `docs/rounds/2026-09-19-operations.md` before touching an Operations tab, the Monday page, Hours or the Catalog.** The load-bearing parts:
  - **"This studio" on Operations is the app's active studio.** The scope bar's studio pick calls `setActiveStudioId`, so the roster, the schedule and today's sessions every tab already streams follow it. `operationsStudios(trainer, studios, networks, isAdmin)` (`features/admin/scope.ts`) is the one answer to "which studios may this reader look at from Operations" — the company tier every studio, the owner tier the studios that reach them (ownership, not just membership), the studio tier the studios they run (the grant counts). Under "All my studios" a one-studio tab renders `<PickOneStudio what=… />`; don't add a per-tab studio picker back. `useOperationsScope()` outside the provider returns a standalone fallback (the app's studio), never throws. Tabs are keyed on `scopeKey(ops.scope)`.
  - **The Monday page reads; it never computes across clients.** Renewals come from the roster's nightly snapshots through the pipeline's own `laneOf` / `nextStep`; attendance from the snapshot's pace and flags (`LONG_BREAK_MULTIPLE = 2`, `MIN_BREAK_DAYS = 7`); pain from the last 7 days of sessions' Dial, open `clinicalIncidents where studioId ==` and live critical `journalEntries` (**a new composite index**: `studioId, importance, occurredAt desc`); **performance from `studios/{s}/watch/performance`, which only the Sunday job writes** (`allow write: if false`; `monday/performance.ts` is the shared rule, imported with `.ts` extensions so esbuild and vitest agree). No name and no body data in the watch document; an empty one is written when there is nothing to watch. `scripts/run-machine-trends.ts --commit` writes it from the PC before the first Sunday.
  - **Hours counts booked slots, not the stopwatch.** `studios/{id}.sessionMinutes` (default 30, set on My Studio → Studio → The studio's day) × completed sessions; the measured time is a separate column. Weeks are Monday–Sunday. `fetchSessionsInRange` (`features/admin/sessions-range.ts`) asks for a padded `createdAt` window (`queryWindowForMonth`, a day before and 14 after) and the tally files by the session's `date` — a past session logged late has a late `createdAt`. **`createdAt` must be a Timestamp**: an ISO string never matches the range, which is why every backfill written before Sep 19 is invisible to Hours, Insights and the Monday page (Log past session writes `serverTimestamp()` now).
  - **The standard set is `inStandardSet` + `defaultOrder`**, renumbered in tens on a move (`standard-set.ts`: `standardSet`, `reorderPlan`, `publishPlan`). A published submission lands active, outside the set, last. **Publishing is two things**: the app's Publish (the catalog document, the decision on `catalogSubmissions/{id}` — `published`, `publishedAs`, `decisionNote`, `decidedBy`, `decidedAt` — and the roster marker) and the PC's `scripts/migrate-machine-id.ts --from sm-… --to m-…` (dry run, then `--commit`); until the script runs the studio's floor still shows its own copy.
  - **Delight's row actions write through `setGestureStatus`**, the owner is the Auth uid (`t.authUid ?? t.id`), a passed one-off has a negative `daysAway` (an annual date never does — `nextOccurrence` rolls it forward), and the rollup on the client follows.
  - **Renewals' settings are on My Studio → Studio only**; Operations → Renewals points there with the count of unmatched Mindbody names. Another screen sending someone to a My Studio section calls `rememberMyStudioSection()` from `my-studio/section-memory.ts` and then switches the view — never import `MyStudioView` for that (it drags the whole bundle into the caller's chunk).
  - **Destructive taps on Operations confirm through `ConfirmDialog`** (Routines delete, Catalog Retire — every time, with the count of floors that have it — Announcements Take down, the standard set's Take out). `window.confirm` is gone from the admin surface; don't bring it back.
  - **`notificationSettings` on a studio has no UI on purpose.** Two backend readers gate on it (the booking-reminder queue, the daily-reminders cron), both dormant while nothing writes it true; nothing contacts anyone, so no editor.
  - **Deleted this round:** `FranchiseDashboardView`, `FranchiseTeamManagement`, `franchise/FranchiseHub`, `AdminOverviewTab` (`overview.ts` stays for the strip), the Exports tab's `useLegacyImport`, the `franchise-dashboard` view id.
  - **Needs:** `firebase deploy --only firestore:indexes` → `npm run test:rules` → `firebase deploy --only firestore:rules` (one new read-only match) → the app → `npx tsx scripts/run-machine-trends.ts --commit`. No Functions deploy.


- **My Studio (Sep 18–19) — read `src/features/my-studio/README.md` and `docs/rounds/2026-09-19-my-studio.md` before touching the studio's home, the staff editor, the floor or the rules that scope a studio.** The load-bearing parts:
  - **`leadsHere(trainer, studioId)` is the one answer to "does this person run this studio"**: a leader role at the studio, or the grant. `leadsStudio` / `leadsStudioPerRules` count `managedStudioIds` before the role; the rules do the same in `isStudioOwnerOrHeadTrainerOnly` and `trainerLeads`. `isStudioLeader` is role-only — it offers a granted trainer nothing and a visiting head trainer too much.
  - **The grant is an access field** (`writesAccessFields` lists `managedStudioIds`): written with `arrayUnion` / `arrayRemove` from My Studio → Team or Staff & Roles, never from a trainer's own profile. The rules refuse a self-grant and, on update, any studio the caller does not run (`grantChangeAllowed` / `ledStudios`); on create a leader's grant may only name the studio the person is joining.
  - **`studios/{id}` is written by its own leaders, franchise owners and administrators — the "any trainer edits any studio" hole is closed (Sep 19).** Any field EVERY iPad must write goes in the `hasOnly` list of the `studios/{id}` update rule (today: `lastScheduleSyncAt`, `scheduleSyncFailures` — the schedule sync's lease from `useAutoSync`), or trainers' writes fail. Create is franchise owners and administrators.
  - **`studioPatchPayload` (`features/admin/studios/studio-writes.ts`) is the studio's one writer**, for both doors (My Studio → Studio and Operations → Studios, which render the same `StudioDetailsForm`). An empty Mindbody location or cutover date is a `deleteField()`; the cutover must be `yyyy-mm-dd`; **a changed Mindbody site id must be looked up (`useMindbodyLocations.outcome === "ok"`) before Save**.
  - **What an approval hands out follows the approver** (`mayHandOut`, `studioTierRole`, `roleChangeAllowed` in the rules; `STUDIO_TIER_ROLES` / `OWNER_TIER_ROLES` / `ADMIN_TIER_ROLES` in `features/admin/staff/StaffEditor.tsx`): a studio's leaders mint trainers and studio leaders, never an owner or an administrator; a franchise owner never mints an administrator. `useStaffRoster` + `StaffEditor` are the ONE staff editor — Operations → Staff & Roles and My Studio → Team both render them; don't write a third.
  - **Machines are adopted, never pushed** (`floor.ts` `standardGaps`: a switched-off machine counts as decided); **fields, settings and routines are inherited unless overridden.** `seedStandardSet` and `adoptCatalogMachine` (`features/admin/equipment/seed.ts`) are the adopt writers — the seed button, the inventory manager and My Studio all call them.
  - **A studio offers a machine to corporate through `catalogSubmissions/{id}`** (`buildSubmission`: only the studio's own machine, never an MSF one or a copy adopted from another studio; note ≤ 500). The roster entry's `submission: {id, status}` marker is a COPY written afterwards (its failure only warns). The studio may only withdraw; corporate decides; **publishing is `scripts/migrate-machine-id.ts` from the PC**, not a tap (AJ, Sep 18); the Operations round's queue (Operations → Catalog → Submitted by studios) does the app half and prints the command.
  - **A studio's leaders post to their own studio only** (`studioNoticeOfMine`: `targetScope == 'studio'`, one studio, never `all`). `AnnouncementComposer fixedStudioId` hides the studio picker. Sign the author with the Auth uid.
  - **Relay's tabs are four** (`PlannerTab`: floor · mine · notes · network); Team is a section. `RelayContext` (now with `panel`) is provided by `MyStudioView` — anything that mounts `PlannerView` alone must provide it. The section is module memory: a render test that mounts `MyStudioView` clicks back to Relay first (`mount()` in `planner.render.test.tsx`) or tests leak into each other.
  - **Needs:** `npm run test:rules` → `firebase deploy --only firestore:rules` (the rules only add access and close one hole) → the app. No index or Functions deploy. New: the `catalogSubmissions` collection (AJ OK'd, Sep 18), `trainers/{id}.managedStudioIds`, `access_requests/{id}.requestedStudioId`, the roster entry's `submission` marker.

- **The fluidity round (Sep 17–18) — read `docs/rounds/2026-09-17-fluidity-audit.md` and `docs/rounds/2026-09-18-floor-audit.md`.** The load-bearing parts:
  - **A client always opens on Journey, pinned to the newest session.** The profile no longer remembers a tab. `sessionStorage["msf_profile_nav:{clientId}"]` is a one-shot HANDOFF consumed by `takeStoredLocation` — write it (`writeStoredLocation`) only from a screen deliberately sending the trainer elsewhere (Operations → Machine fit is the only one). The grid's pin comes off only when it is actually parked back from the newest column (`userScrolled`), never on a tap; `userTouched` still arms the older-page autoload. `JourneyGrid` is keyed on the client id inside `RecentJourneyView`, and `ClientProfileView` clears its sessions on a client change.
  - **`client.priorHistory` is what happened before Journey** (`src/lib/prior-history.ts`): `total = journey count + (sessions − importedCount)`. The reconciler owns what Journey can see; the record owns what it cannot; nothing types a total into `sessionCount` any more. **Any importer of historical sessions must raise `importedCount`** (`recordImportedSessions`). `historyCoverage(client, studio.journeyCutoverDate)` answers complete / partial / unknown; `canQuoteLifetime` gates every lifetime figure (it REPLACED `machineStatsBackfilledAt` as the gate); `NEVER_LABEL` is "Never attempted" for complete and "Nothing recorded" otherwise. **Machine-level history is not coming across from FileMaker — never claim a client has not used a machine unless Journey holds their whole story.**
  - **`machineTimeFields` writes `totalTimeUnderLoad` / `machineDurationSeconds` / `averageTimePerRep` ONLY when the stopwatch measured them.** Time on machine (`timeSpent`) includes getting in and out and is never a TUT; every TUT reader (`tutOf`, the Equipment average, the clinical review) trusts those three fields. Do not bring the fallback back.
  - **The Now Bar never pre-fills a count and never suggests a progression.** Reps are a grey ghost of last time (`placeholder`), a value only when typed; `lib/progression-cue.ts` is a pure module with no caller on the floor. Tapping the mark that is on returns the set to "completed" (2); a quality of `null` reaches no writer. The last machine offers "Add another machine"; End Session stays at the top.
  - **The mid-session note draft belongs to the SESSION** (`features/client-notes/session-draft.ts`): the tracker owns it, the composer takes it as `draft` / `onDraftChange`, it is mirrored to `sessionStorage["msf_session_note:{sessionId}"]`, carried onto the post-session screen (Save / Drop) and FILED unfiled on leave if untouched. Never key the composer on the focused machine again. The End Session wrap-up note also files to the journal as a Heads up.
  - **Red flags live for the whole session** (`features/journey-grid/session-flags.ts`): the tracker mounts `useClientJournal`; the session bar shows a count, the Now Bar shows the one line tied to the current machine (a note beats the matrix), `SessionFlagsSheet` shows the rest. Small marker, tappable, never a dialog. The briefing's condition chips are taps; critical notes go through `CriticalStrip`.
  - **`studios/{id}.journeyCutoverDate` is set on My Studio → Studio → Details (since Sep 18; before that it had no UI)** — until a studio's is set, every client there reads as "unknown" and gets the cautious wording.
  - **Every number has a reader** (`docs/business/data-and-metrics.md`): a write nothing reads is a bug to fix, not a field to delete. The session's `client*` demographic snapshot is the substrate for cohort analytics; cohort cells keep `CELL_MIN_CLIENTS`; no clinical snapshot in anything readable per-person.


- **Machine fit (Sep 17) — read `src/features/machine-fit/README.md` and `docs/rounds/2026-09-17-machine-fit.md` before touching a suggestion, the set-up check or the Machine fit report.** The load-bearing parts:
  - **A suggestion is never a value, and nothing is written until Save.** On Programming → Setup a suggestion is a placeholder; "Accept strong suggestions" fills DRAFTS; one Save writes every changed machine in one batch (`setup-save.ts`), with the same documents and audit rows the Settings card writes.
  - **The engine cannot learn from its own guesses.** `clientMachineSettings.sources` says where each value came from (`typed` / `suggested` / `legacy`). An accepted suggestion is not evidence for anyone else until `client.machineStats[machineId].lastPerformedDate` is on or after the day it was saved (`verifiedSettings` in `fit-index.ts`). Never count a `suggested` value without that test.
  - **`studios/{s}/machineFit/{machineId}` holds NO body data and is written ONE ROW AT A TIME.** Rows are joined to the studio client list at read time (so a corrected height is right everywhere at once and health data is never copied). Every write touches exactly one `rows.<clientId>` key by `FieldPath`, and the rules refuse anything else (`rows.diff(...).affectedKeys().size() <= 1`). The row is REPLACED, so every writer passes the client's existing reviews (`acks`) along. It is a copy: its write is caught and never fails a save, and `scripts/rebuild-machine-fit.ts` heals drift — **run it after deploying and after any import** (the legacy importer and `WorkoutChartGrid` do not update the index).
  - **Unknown is never empty.** `FitSources.studio` / `.company` are `null` when they could not be READ and `[]` when nobody is set up; the engine answers `reason: "unknown"` / `state: "unknown"` and the screen says "could not be loaded". `fetchMachineTrendRead` exists to tell a failed read from an absent document.
  - **She is never in her own comparison group** — by id at the studio tier, and at the company tier one client who agrees with her on everything they share is removed (`withoutSelf`), in the check AND in suggestions. **Rare needs a second opinion**: a value is only marked when it is also rare across the widest band the ladder could reach (`Cohort.wide`).
  - **The company fit block is k-anonymous at five** (`CELL_MIN_CLIENTS`): `machineTrends/{id}.fit` cells are height × gender × whole set-up, so without the floor nearly every cell is one person in a document any trainer can read. A thin gender is pooled (`64|x`), a thin pool pools the height, a thin height is left out (`heldBack`). Never add a third key to a cell.
  - **`kaizenReports/*` names studios, never people**, and is administrators-and-founders only by rule. `buildKaizen` returns `report` (storable) and `findings` (client ids — this-studio scope only, never written). Every average is `null` under `MIN_CLIENTS`.
  - **The FileMaker shorthand reader throws nothing away and never guesses**: what it cannot place becomes a note on the machine. The grid prints a label even when the setting is empty (`Gap  S- 8` is an empty gap and Seat 8) — a "value" that is itself one of the machine's labels means the label before it is empty.
  - **Plum, never red**: "worth a look" is `--eq-warn`. The check is passive — no bell, no Hub marker, no dialog. The Setup screen's docked keypad keeps the system keyboard down with `inputMode="none"` and holds focus with `pointerdown` + `preventDefault`; **try it on a real iPad first**.
  - **Needs:** `npm run test:rules` → `firebase deploy --only firestore:rules` → the app → `npx tsx scripts/rebuild-machine-fit.ts --commit` → `npx tsx scripts/run-machine-trends.ts --commit`. No index or Functions deploy.

- **History editing (Sep 17) — read `docs/rounds/2026-09-17-history-editing.md` and `src/features/client-history/README.md` before touching a session after the fact.** The load-bearing parts:
  - **`ownsClientCounters(session)` is the ONE test for whether a session owns the client's counters** (`features/client-history/session-edits.ts`). A completed live session does; a "Log past session" backfill written from Sep 17 2026 does, because `countsTowardTotals: true` says so on the document; **an older backfill does not** — it incremented nothing, so deleting it must decrement nothing. Never go back to `isBackfilledSession()` for this question.
  - **`machineStats.<id>.timesPerformed` moves with the sets.** It is a running total kept at write time, so adding a performed machine to a past session casts its vote and removing one takes it back (`machineVoteDelta`, which takes the session's WHOLE set list on both sides — a machine with two sets can lose its vote while staying in the session). First/last dates are NOT recomputed, the same trade the delete path makes.
  - **Nothing in the session dialog is written until Save.** Added machines and removed sets are drafts on screen and one batch at the end; a half-finished edit interrupted by a client walking in leaves the record as it was.
  - **A removed set is struck through, not hidden**, and the bin becomes an undo. A row that vanishes on a mis-tap cannot be put back by someone who does not already know what was in it.
  - **Rep quality can be CLEARED** in both dialogs — tapping the one that is on unsets it. "I don't remember" is a real answer on a session rebuilt weeks later, and the red kaizen mark drives the Deep Dive.
  - **A machine typed in with no reps is `outcome: "skipped"`, not a performed set of zero** (`newSetDoc` decides it in one place, for both dialogs).
  - **`exerciseLogs` and `sessions` can now be deleted by trainers** (Sep 17), each scoped like that collection's own `update` rule. Before that both were super-admin-and-franchise-owner only, so the dialog's Delete Session button had never worked for anyone who would press it. **Needs a rules deploy.**
  - **The edit stamp is `editedAt` / `editedById` (the Auth uid) / `editedByName` / `editedByInitials` / `editCount`** on the session. `editStampOf` treats a missing `editedAt` AND a zero `editCount` as "never edited" — a 0 is not an edit.

- **Shake to undo is refused, not disabled (Sep 17).** `src/lib/shake-undo.ts` cancels the `beforeinput` whose `inputType` is `historyUndo`/`historyRedo`, so the alert may flash but nothing rolls back. It installs **on iPads only** (`looksLikeIpad` reads `maxTouchPoints`, because iPadOS 13+ calls itself a Mac) so Cmd+Z still works on a studio PC. The complete fix is the device setting: Settings → Accessibility → Touch → Shake to Undo, off. `enableShakeMotionWatch` (blur the field on a shake) is written and deliberately NOT called — it needs the iOS motion-permission prompt behind a user gesture.

- **A field that searches for a person spreads `NAME_SEARCH_PROPS`** (`src/lib/name-search-input.ts`, Sep 17): autocorrect, autocapitalise, autocomplete and spellcheck all off, because the iPad keyboard "corrects" client names into an empty result list. Add it to any new person-search input; never to anything written in sentences, where a correction is wanted.

### Always on, from the same rounds

- **The client profile is FOUR tabs and each one is a question, not a screen name.** Journey (what has she done) · Programming (what is she supposed to do — Routines + Equipment) · Notes & Profile (what do we know — the FORD spine) · **Activity Archive** (what has already happened — Clinical + History; renamed from "Clinical History" in the audit round, tab id still `clinical`). **Where the trainer is is NOT a string**: it is a `ProfileLocation` — a tab AND a segment inside it — owned by one reducer in `src/features/client-profile/profile-nav.ts` and reached through `useProfileNav`. Never add a second copy of it. Every tab id the profile has ever used still resolves, through `legacyLocation()`; add to that map rather than chasing call sites. Read `docs/rounds/2026-09-15-four-tab-profile.md` before touching the profile's navigation.
- **The sub-toggle is one component and its rules are load-bearing.** `ProfileSubnav` — sticky, 48px, segments as EQUAL fractions of the full width, brand blue (never hero orange, which is Start Session). The iPad is held and often not looked at: a segment is found by POSITION, so never size a segment to its text and never move the bar. **Never hide a segment** — Routine B with no B reads "OFF" and the switch to turn it on lives behind it. **Seven segments wrap, they don't clip** (client codex, Sep 24 2026): Notes & Profile passes `wrap`, which lets a label and its meta line take a second line and grows the row — every segment together, so they stay equal — and is still 48px wherever nothing wraps (on every portrait iPad below the 13-inch — 744, 820, 834pt — "Body & Pulse" and "Goals & Focus" take two lines and the row is ~75px; a meta line that wraps grows it too, and metas land after the bar draws, so keep them short). Every wrap rule is scoped to `.psub-shell[data-wrap]` and `profile-nav-css.test.ts` holds it there: Programming and the Activity Archive don't pass `wrap` and render exactly as before, so never move a wrap rule into the base styles. `flagTone: "warn"` draws the dot plum (`--eq-warn`); `idPrefix` gives the segments ids and `aria-controls`, so a host that passes it keeps an element with every panel id in the page from the start — an empty, hidden `role="tabpanel"` placeholder for a page not yet visited, or `aria-controls` points at nothing.
- **Switching a sub-view must cost no fetch.** Every pane reads what the profile already loaded, or keeps its own gate (Trends still generates on request). Mount rules: Routine A/B and Reports unmount when hidden; **All Machines and Trends are mounted on first use and hidden thereafter** (they hold a selection / a generated report); Calendar and Sessions are ONE mount of `ClientHistoryTab`. Don't "tidy" any of those into plain conditional renders.
- **A sticky bar in this app needs the scroller's padding negated.** The app shell is a bounded 100dvh column, so the document never scrolls — an inner `p-6` container does, and every engine pins a sticky box inside that padding. `--hist-stick-top` (History's month headers) and `--psub-stick-top` (the sub-toggle) are both that measurement. A sticky bar also needs an OPAQUE background from `--background`, or content scrolls through it. Inside the Activity Archive the month headers additionally offset by `--psub-stuck-h`, which `ProfileSubnav` publishes on the enclosing `.ptab`.
- **The client profile's record tab is the whole non-training record.** The FORD merge: one spine, sections `general · life · medical · goals · focus · notes · reports · admin`, defined once in `DOSSIER_SECTIONS` (`src/types/journal.ts`). `lifestyle` and `events` no longer exist. The `reports` section is titled **Pulse** and composes only — the filed shelf lives in Activity Archive → Reports (four-tab round: compose in the record, read the archive in the past). `ClientJournalTab` is mounted inside the spine with an `areas` list; given `areas` it draws no jump nav and no critical rail, because the spine owns navigation. It also takes a preloaded `journal` — the dossier loads `useClientJournal` ONCE and shares it, so don't add a second hook in a journal area.
- **Personal detail goes in FORD, not the journal.** `clients/{id}/ford/{id}`, studio-scoped by the client it hangs off; `journalEntries` is readable by any signed-in user, which is why it is not there. `pillar` is NULLABLE by design and the rules do not validate it — null means "caught mid-set, filed at teardown", and making it required puts a decision between a trainer hearing something and recording it. "Personal" was removed from the journal composer; old `life` entries still render. `client.events` is READ as FORD through an adapter and never written. Read `src/features/ford/README.md` before touching any of it.
- **Colour by urgency, never by pillar** on FORD screens, and `clients/{id}.fordSummary` is a cache — the subcollection is the truth.
- **A `<button>` centres its own text.** Several FORD details render inside buttons so they can be opened, and a Tailwind `text-left` on them did not survive layer ordering in every build. Text alignment on a button belongs in the feature's CSS file, not in a utility class (FORD round, Sep 15).

- **The client-profile audit round (Sep 16) — read `docs/rounds/2026-09-16-client-profile-audit.md` before touching the profile.** The load-bearing parts:
  - **One machine window.** Every machine tap on the profile (Journey grid, Routine A/B rows) opens `features/equipment/ClientMachineWindow.tsx` — the All Machines detail. Settings save through `equipment/mutations.ts` (reason, history, journal). `MachineSettingsDashboardModal` survives only for `WorkoutChartGrid`; don't bring it back to the profile.
  - **Names go through `src/lib/client-name.ts`.** `client.nickname` (coach-owned, never synced) replaces the legal first name in headers; stored session names stay legal.
  - **Master Sync is the only client sync** (`src/lib/mindbody-master-sync.ts`, the header's Sync button, `POST /api/mindbody/client-master-sync`). By Mindbody id only (`mindbodyIdOf`), and it REFUSES a record whose ids disagree (`mindbodyIdConflict`) — the old profile sync used a name search and may have staged a namesake's id. Mindbody-owned identity is read-only on a linked client. `syncClientCommercialData` and `/api/mindbody/client-commercial` have no callers left.
  - **The waiver is three states** (`src/lib/client-waiver.ts`): never synced is "Not synced yet", not "Not on file".
  - **`client.machineStats` is trusted only once `machineStatsBackfilledAt` is set** — Programming's "performed / never tried" and the routine rows' % and × say nothing before it.
  - **Clinical watch-outs quote the matrix** (`src/lib/clinical-watchouts.ts`); the "Common constraints" category in `data/clinical-matrix.ts` holds the quick toggles. Display names drop anything in brackets (`shortCondition`) — don't put meaning in brackets.
  - **Setting suggestions are never values** (`features/equipment/setting-suggestions.ts`): an empty field, a band of `MIN_CLIENTS`, more than one client on the value, and a tap on Use.
  - **The contract tier lock** (`client.contractTierOverride`, `features/client-admin/`) wins on the record only; the renewal engine does not read it yet.
  - **Sticky elements inside the record** measure the scroller's padding with `features/client-profile/use-scroller-pad.ts`.
  - **The notes catalog leaves out profile fields the record edits in its own sections** (`SHOWN_ELSEWHERE_ON_RECORD`).
  - **The progress-report banner above the header reads one probe per client**, not the shelf (which loads on two tabs only).

- **Set data has four outcomes; only `performed` counts.** Read an outcome through `outcomeOf()` / `isPerformedLog()` in `src/lib/set-outcome.ts`, never off the `outcome` field (older logs don't have it — a count means performed, no count means skipped). Every average, rollup, "last time" and progression figure filters to performed sets; a new reader of `exerciseLogs` does the same. Session start seeds a weight-only log for every planned machine, so a weight alone is not "the trainer worked on this" — `isBegunLog()` is. **Never block a save**: End Session confirms, it does not refuse (docs/ARCHITECTURE.md §1.6, `docs/rounds/2026-09-12-floor-round.md`).

- **Nothing on the Active Session deletes a session except Discard.** A 60-minute "abandoned session" loop used to `deleteSession` with every set in it; it is gone (tracker round, Sep 13). Abandonment is a read-side rule (`isSessionValid`). The bottom tab resumes the trainer's own live session after a crash (`src/lib/live-session.ts`); per-machine time is `src/lib/machine-clock.ts` and runs only while a machine is current — never "since the last one". `docs/rounds/2026-09-13-tracker-round.md`.
- **The session is saved at End Session, once.** `commitEndSession` is the only caller of `completeWorkoutSession` (its counters are `increment()`s — a second call double-counts). The post-session screen only appends: `dose` by `updateDoc`, the closing note by `createJournalEntry`. There is no Finalize button to bring back.
- **Package facts come from `client.renewal`** (the nightly snapshot), read through `src/lib/directory-row.ts` on lists — never from `packageTier`, `remainingSessions` or `nextSessionDate`, which nothing keeps current. There is no field for leader-granted extra sessions yet.
- **One loading mark.** `components/LoadingMark.tsx` (`LoadingMark`, `LoadingArea`) is the wait state — never hand-roll another `animate-spin` div. Hub card markers come from `src/lib/hub-markers.ts` and read only what the Hub already holds (no reads per card).
- **In a flex column, a card with `overflow: hidden` must be `flex: none`**, or a short container shrinks the card instead of scrolling (this was the machine sheet's "truncation"). The same rule bit the Hub card: `truncate` *is* `overflow: hidden`, so a truncated text line in a fixed-height flex column is the line the browser squeezes to 0px — give the lines that must survive `shrink-0` and let one line (`min-h-0 overflow-hidden`) be the one that yields (fix round, Sep 13).
- **Two grid items in the same named `grid-area` are drawn on top of each other**, not stacked. A block that should push content down goes in its own row (`col-span-full`, no area name) — this was the profile's "Trained by" list covering the stat tiles.
- **`WorkoutTrackerView` draws three screens and the order is a rule**, `lib/tracker-screen.ts`: post-session first while its snapshot exists, then none / briefing / tracker. The client's sessions stream turns pre-session mode on whenever nothing is In-Progress — including the beat after Finish — so never check the briefing before the post-session screen.
- **The check-in is Pulse on screen** (reporting round, Sep 16; it was "Assessment" from the fix round): the code, the Firestore fields (`progressReports`, `isCheckInOnly`, `subjectiveSnapshot`) and file names still say check-in / subjective. The journal's focus "check-ins" are a different thing and keep their name.
- **Mindbody routes need a sign-in.** Browser code must call them with `authedFetch` (`src/lib/authed-fetch.ts`); a plain `fetch` gets a 401. A new `/api/mindbody/*` route inherits the check. One that should be admin-only goes in `ADMIN_ONLY_MINDBODY_PATHS` in `server.ts` — lowercase, with no trailing slash. The check refuses a `siteId` or `mindbodyClientId` that isn't a plain id.
- **The web service has no Firestore admin key.** Server code can't read or write Firestore as an admin; `server/auth.ts` reads with the caller's own token over REST — and only single documents, never a collection list: a list is refused when any one document in it is off-limits, which took the schedule sync down on Sep 13. The cron jobs do have the service account.
- **`clients/{id}.renewal` belongs to the nightly job.** The rules refuse any app write that changes it, so never write a whole client object back — write only the fields that changed.
- **A renewal cycle is checked as a whole document.** A leader's write to `studios/{s}/renewals/{cycleKey}` must fit `renewalCycleKeys()` in `firestore.rules`. Any new field the job writes has to be added there, or leaders are locked out of that cycle.
- **Pricing options are replaced, contracts are merged.** Each pull replaces `client.mindbodyServices` whole and merges `client.mindbodyContracts`. Mindbody dates are read as UTC days (`mindbodyDayKey`).
- **Attendance before a studio's first synced booking is unknown, not zero.** Pace and proof say so rather than showing "no visits".
- **InBody is health data.** Scans live in `clients/{id}/inbodyScans` under the sessions-style rule. Never copy InBody numbers into `progressReports`, which any signed-in user can read.
- Two Mindbody sites share one client-ID range (both start at 100000001), and on Sep 23 2026 43 numbers named a different person at each. Never look a Mindbody client up by `clients/{id}` alone: go through `src/lib/mindbody-site.ts` (`chooseClientDoc`), which sends the second person to `clients/{site}-{id}`. `scripts/check-mindbody-client-collisions.ts` finds the shared numbers; `scripts/check-collision-damage.ts` finds bookings on the wrong person. `docs/rounds/2026-09-23-client-identity.md`.
- `scripts/mindbody/register-webhook.js` now takes `--site` and `--list` and includes the contract and membership events, but neither site is subscribed to them yet. Deploy the Cloud Functions first.
- **The role lives on the token now (cost round, Sep 16).** `syncTrainerClaims` (`functions/src/claims.ts`) mirrors `trainers/{id}.role` onto the auth user's custom claims; the rules read `request.auth.token.role` first and fall back to the document only when it is absent. Consequences: a role change reaches the rules at the next sign-in or within an hour (the token is checked first, so the OLD claim wins until then); **never set a `studioId` claim** (as written it grants studio-leader access with no role check); a new trainer role must be added to `TRAINER_ROLES` in `claims-logic.ts` as well as `UserRole`; the function has to be deployed (`firebase deploy --only functions:syncTrainerClaims`) and `scripts/backfill-trainer-claims.ts --commit` run once — until then it just costs the read it always did.
- **Closed Sep 16 (cost round):** a trainer can no longer edit their own `role`, `ownedStudioIds`, `accessibleStudioIds`, `activeGuestStudioIds` or `primaryHomeStudioId` (`writesAccessFields()` in the `trainers` update rule); the rest of their own document is still theirs. **Closed Sep 19 (My Studio):** a studio document is written by its own leaders, franchise owners and administrators; any trainer may still write the schedule sync's lease fields and nothing else.
- **Still open, needs AJ's OK:** any trainer at any studio can create and update another studio's `taskInstances` and `taskRequests` (studio tasks and requests).
- `progressReports`, `journalEntries`, `exerciseLogs`, `clinicalIncidents` and `schedules` are readable by any signed-in user. Studio-scoped: `clients`, `sessions`, comments, and (since the Learning + Planner round) a studio's `playbook` and `wiki`.
- **Studio content writes need `writesForStudio(studioId)`** since the Learning + Planner round: machine notes, the upkeep log, playbook, wiki blocks and comments. `writesForStudioPerRules` (`src/features/learning/permissions.ts`) mirrors it for buttons.
- **Use the Auth uid, not `authTrainer.id`, for anything a rule pins to the signed-in person** — note paths, comment authors, `readBy`, personal tasks. The two differ on older accounts.
- **Shared lists are collection-group reads.** Each needs a `{path=**}` rule its filters satisfy (`shared == true`) and a collection-group index. Until a new index finishes building, the screen says it couldn't load the shared part.
- **Announcements** are posted by administrators, founders and franchise owners to anywhere, and by **a studio's leaders — studio owner included — to the one studio they run** (`studioNoticeOfMine` -> `trainerLeads`, which counts the grant), as themselves. **`StudioOwner` is not a blanket poster**: it was one until the My Studio round made it a studio-tier role, and the rule kept the old clause until Sep 19 2026, when `test:rules` caught an owner at studio A posting into studio B. Only the Operations tab's people (franchise owners and administrators) reach every studio, and Take down confirms first. Everyone else may only add their own uid to `readBy`.
- **Roster entries name their own studio** (`studioId` must match the path), and a copy adopted from another studio can't be shared.
- **Sessions still use the app-wide machine list**, not each studio's roster, so a studio's own or adopted machines aren't in the session picker yet (ROADMAP).
- **A reducer passed to `useReducer` must close over NOTHING declared below it.** React calls a reducer while processing a QUEUED action, and it does that during the next render at the point of the `useReducer` call — so a wrapper arrow reading a `const` declared a few lines further down reads it in its temporal dead zone. The four-tab profile shipped exactly this: it opened fine and threw `Cannot access 'ctxRef' before initialization` on the first tab tap. `profileNavReducer` now takes two arguments, lives at module scope and gets everything from the ACTION, assembled at dispatch time. Same rule for anything else React may call mid-render.
- **Anything that throws in a `useLayoutEffect` takes the whole screen to the error boundary.** Feature-detect browser APIs there: `typeof ResizeObserver === "function"` before `new ResizeObserver` (JourneyGrid and ProfileSubnav do; one JourneyGrid use at line ~569 still does not — pre-existing).
- **`npx vitest run src` mounts only what has a `*.render.test.tsx`** (the profile nav, the notes area, the Dial, Update Pulse, the briefing, the post-session screen, the Pulse panel, the 4 P's, the Deep Dive — jsdom, raw `react-dom/client`, no testing-library). A clean typecheck, a full green suite and a production build all passed while the profile crashed on every tab tap. **Add a render test for any hook or component that does work during render or in a layout effect** — they are cheap and they are the only check that would have caught it.
- **A date-ONLY ISO string is UTC; a date-TIME with no zone is LOCAL.** `new Date("2026-09-20")` is UTC midnight, `new Date("2026-09-20T10:00:00")` is local. Mixing the two in one comparison passes in CI (UTC) and fails on a studio PC (Eastern), which is the worst shape a date bug can have — it cost a red `ship` run on Sep 15. `toDate()` in `src/types/journal.ts` pins a date-only string to local NOON for exactly this reason; never hand a raw `new Date("yyyy-mm-dd")` to anything that then does local-calendar arithmetic. **Run the suite with `TZ=America/New_York` before shipping**, not just in UTC. (Known and unrelated: `src/features/renewals/conversation.test.ts` fails at UTC+14; no studio is east of Eastern.)
- **Never type a raw control or invisible character into source** (a NUL, U+F8FF): write the escape (`\u0000`, `\uf8ff`). A raw NUL makes git treat the file as binary, and a binary diff can't ship as a patch.
- **`machineTrends/*` is aggregates only, built weekly** (`server/machine-trends-job.ts`, one 90-day range on `exerciseLogs.createdAt`). Never put a client row in it — it is readable by any signed-in trainer and clients are studio-scoped; "this client vs everyone" is `client.machineStats` against the distribution. Medians are `null` under `MIN_CLIENTS`; a screen says "not enough data yet". Two things read it, through one cache (`features/equipment/useMachineTrend.ts`, one read per machine per session): the Settings card's height-based suggestions, and machine fit's company tier — the anonymous `fit` block the same job now writes (machine-fit round; the job reads EVERY client for that, while the trends still use active clients only). The Cloud Function `calculateFacilityAnalyticsV2` still reads every exercise log nightly — needs an OK to touch.
- **The schedule is three live days plus a fetched cache** (`useLiveSchedule`, `src/lib/schedule-window.ts`): the listener watches yesterday–tomorrow; anything else comes from `ensureRange()` (cached by id, per-day coverage, 15-minute freshness, the week ahead refreshed on a timer while visible). A screen that shows a day outside the live window asks for its range — the calendar does; don't reach for a wider listener. `schedules` is the merged list. **It no longer fetches clients.**
- **The app's clients are the studio roster** (`useStudioRoster`, `src/lib/studio-roster.ts`, hub sync fixes Sep 16): one listener on `clients where homeStudioId == activeStudioId`, plus booked visitors read by id. `AppContent`'s `clients` is that roster plus the selected client — the Hub, the directory and the auto-sync all read it. A studio switch empties it at once (`status` is `loading` until the listener answers — say "loading", never "Not synced", in that beat); a failed read never empties it. The directory trusts it for the current studio (`studioRosterReady`) and queries only for "Search entire corporate network". The listener's cost grows with every client whose `homeStudioId` is the studio — filter it to active clients before a historical import.
- **The schedule sync never reads a whole collection** (hub sync fixes, Sep 16). Phase 1 checks only the client ids the caller's roster lacks (`checkClientIds`: existing / missing / refused / unchecked) and never writes the full create payload over an existing client — that payload zeroes `sessionCount` and friends. The stale-booking sweep reads and cancels only rows inside the window Mindbody was asked about; anything outside it was simply not asked. A for-trainers corollary worth remembering: **the rules refuse a read of a client document that doesn't exist**, so "refused" means "missing, or someone else's", and a batch `in` query with one such id is refused whole.
- **`useClientJournal`'s four unbounded collections carry a 200-item guard rail, unordered on purpose** (`JOURNAL_GUARD_LIMIT`). Don't turn it into a "newest N": the focus board counts every past focus and its history, so an ordered cut would miscount (several focuses may be active at once since the audit round). When the rail is hit the hook says `capped` and the journal tab says so.
- **The Render cron service is still named `journey-cron-leaderboards`** although it runs the machine-trends job (which, since the Operations round, also writes each studio's `watch/performance` document) — a renamed blueprint service is a new service to Render.
- On AJ's PC, Claude's Linux shell reaches the project folder again (Sep 16): it can run git (delete permission needed for the lock files) and `tsc`, but **not** `vitest` or `vite` — the Windows `node_modules` has no Linux rolldown binding. The cloud container **can** `npm ci`, typecheck, run the suite and both builds; it cannot run `test:rules` (the emulator jar's host is blocked), so **AJ's `test:rules` run is the one that counts.** The file bridge (stage and commit files) works either way.

## Relay - the board, tasks, jobs, reminders and private notes

- **Relay (Sep 16) — read `docs/rounds/2026-09-16-relay.md` and `src/features/relay/board/README.md` before touching the board.** The load-bearing parts:
  - **Capture follows the rules, not the form.** Only leaders create studio task templates and team jobs; any trainer posts a request. So a trainer's "The Floor" is an ask and their "Someone" is a hand-off — a request with `forId` — while `relay.canLead` unlocks Studio task and Team job. Don't offer a form the rules will refuse.
  - **A hand-off is a request, not a lock.** `forId` names who it went to; the board still shows it and anyone may close it. Mine's Handed lane is `handedAsks(requests, [uid, trainerId])` — both ids, because the two differ on older accounts.
  - **The Now Bar reads the Calendar's rows and the studio's clock** (`now-context.ts`, `zonedHM`): never the device's time zone. Shift hours come from `studios/{s}.shiftHours` through `shiftHoursOf`, which forces the four into order.
  - **Machine wear counts today's sessions only** (`sessionMachineIds` since `machineCare.lastWipedAt`); older sessions have no machine list and count nothing. A wipe writes `machineCare` AND appends to `upkeepLog` (caught, never blocking).
  - **A new machine flag is signed by the caller; a wipe merged over someone else's flag keeps it.** The rule compares the merged `flag` map to the stored one — write flags whole, never field by field.
  - **Next up's "Not me" is module memory on this iPad**, per studio, day and shift phase. Nothing is written; a restart forgets it, by design.
  - **The Pulse and the rings are module stores** (`pulse.ts`, `rings.ts`) the Floor publishes into and the shell reads; on another tab they show what the Floor last heard.
  - **A network note share is a marker with `studioIds`**; the copies are `team` shares at each studio and the rules know only `people` and `team`. `shareStudios()` is the one place that lists where copies live — `endTeamShare` and `deleteNote` use it.
  - **`estMinutes` and `kudos` are optional on requests, instances, jobs and templates**; the floor may write `kudos` on a team job because the update rule's key list says so. A new floor-writable field on a job goes in that list or the tick fails.
  - **The vault is leaders-only by rule; the strip on the client's record is one `array-contains` query with no order** (no index) and sorts client-side.

- **The Planner rework (Sep 16) — read `docs/rounds/2026-09-16-planner-rework.md` and `src/features/relay/README.md` before touching the Planner.** The load-bearing parts:
  - **Team jobs' parts are a MAP**, written one key at a time (`parts.<id>.doneBy`), and people join with `arrayUnion`. Never rewrite `parts` whole from the screen's copy — two iPads ticking at once would erase each other. Nothing locks a job to its names.
  - **The Team tab counts only work with someone's name on it** (`team/accountability.ts`). Never charge unassigned shift work to "whoever was working", never judge today before the day is over, never count notes, never show a rate.
  - **Leader-only Planner parts use `leadsHere(trainer, activeStudioId)`** (`relay/leads.ts`), which mirrors the `teamJobs` rules. `isStudioLeader` is role-only and would offer a visiting head trainer what the rules refuse. (The older studio-task Assign button still uses it; the task rules are the open hole below.)
  - **Reminders ring from the trainer's own iPad** (`PlannerReminders`, mounted in `AppContent`), at the id `reminder__{templateId}__{dateKey}` so two iPads ring once. No push, ever. A reminder missed while every iPad was closed rings up to `LATE_GRACE_MINUTES` late.
  - **A note save uses `mergeFields`** so the working log (`log`, written with `arrayUnion`) isn't overwritten by a save from another iPad. Add any new note field to `NOTE_OWN_FIELDS` or it is never saved.
  - **Colleague-share expiry is NOT enforced by the rules** — the app hides an expired copy and its author's Planner deletes it. Ending a share by hand deletes it at once. Every client a shared note names must be coached at that studio (`useClientsAtStudio`).
  - **Note formatting is plain text drawn by `notes/format.ts`** — never store or render HTML, and never use regex lookbehind (older iPadOS Safari throws on parse, which takes the whole bundle down).
  - **Firestore refuses `undefined`.** `saveTaskTemplate` strips it (`withoutUndefined`); a new optional field written from a form needs the same.

<a id="rating"></a>

## Ratings, notes and Pulse - the Dial and Loudness

- **The reporting round (Sep 16) — read `docs/rounds/2026-09-16-reporting-round.md` and `src/features/rating/scales.ts` before touching anything a trainer rates or notes.** The load-bearing parts:
  - **The Dial's centre is where we expect them, and an untouched dial is `null` ("not asked"), never 0.** Storing 0 by default would let the Deep Dive find a client slept normally on nights nobody asked about. `compactReadiness` leaves untapped keys out of the write; a cleared post-session dose writes `deleteField()`. An explicit centre tap IS stored.
  - **Left is always worse, even for pain** — `INTENSITY_SCALE` runs Worst → None and `absoluteToTen` reverses it for the stored 10-is-worst. Never reorder a scale's words to numeric order.
  - **The Pulse stores the Dial at the 0/3/5/8/10 anchors** (`absoluteToTen`); scoring, thresholds and the change log are the reference document's and did not move. Don't "simplify" the storage to −2…2 — every saved assessment is on 0–10.
  - **Legacy fields are read, never written.** `sleepQuality` / `stressLevel` / `energyLevel` / `mood` / `clientFeel` / two-state `bodyStates[].state` still exist on old sessions; read them through `features/rating/session-reads.ts` (`doseOf`, `readinessDial`, `regionDial`) or the clinical review's `facts.ts`, never directly. `state` is still WRITTEN, derived from `dial`, for those readers.
  - **Loudness stores the journal's `standard / elevated / critical`**; only the words changed (Note · Heads up · Critical). `elevated` now shows on the briefing while it still matters (`headsUpEntries`, `HEADS_UP_WINDOW_DAYS = 21`, or its `effectiveUntil`). The closing note defaults to `standard`.
  - **An unfiled note is `kind: "general"` with `!isLegacy`** (`isUnfiled`). The composer writes it when no category is picked; the To-file tray (`NoteSweep`) files it by writing only `kind` and `category`. Unfiled notes are kept off the catalog's shelves and search until filed.
  - **Update Pulse writes through `useCheckInDraft`** (the same debounced autosave and change log as the full panel). Don't add a second write path to `progressReports`. The Client Progress Report no longer writes `subjective` at all; it shows a read-only snapshot.
  - **A screen that is dark whatever the theme** (the post-session screen) must wrap a Dial in `.dark` + `data-theme="dark"` so `--eq-*` resolve — the same rule the FORD sweep already followed.
  - **Two files whose names differ only by case are ONE file on Windows.** `dial.ts` beside `Dial.tsx` typechecked and tested green in the Linux container and broke on AJ's PC (`./dial` resolved to `Dial.tsx`), which is why the pure module is `scales.ts`. Before shipping, check `git ls-files | tr A-Z a-z | sort | uniq -d` prints nothing.
  - **The 4 P's store `score` (rank × 20)**, with `status` derived on the talking points for older readers (`four-ps.ts`). `UNRATED_SCORE = 0` is "not rated", never Needs work.

- **The check-in is Pulse on screen** (reporting round, Sep 16; it was "Assessment" from the fix round): the code, the Firestore fields (`progressReports`, `isCheckInOnly`, `subjectiveSnapshot`) and file names still say check-in / subjective. The journal's focus "check-ins" are a different thing and keep their name.

<a id="profile"></a>

## The client profile - four tabs, the record, FORD

- **The client profile is FOUR tabs and each one is a question, not a screen name.** Journey (what has she done) · Programming (what is she supposed to do — Routines + Equipment) · Notes & Profile (what do we know — the FORD spine) · **Activity Archive** (what has already happened — Clinical + History; renamed from "Clinical History" in the audit round, tab id still `clinical`). **Where the trainer is is NOT a string**: it is a `ProfileLocation` — a tab AND a segment inside it — owned by one reducer in `src/features/client-profile/profile-nav.ts` and reached through `useProfileNav`. Never add a second copy of it. Every tab id the profile has ever used still resolves, through `legacyLocation()`; add to that map rather than chasing call sites. Read `docs/rounds/2026-09-15-four-tab-profile.md` before touching the profile's navigation.

- **The sub-toggle is one component and its rules are load-bearing.** `ProfileSubnav` — sticky, 48px, segments as EQUAL fractions of the full width, brand blue (never hero orange, which is Start Session). The iPad is held and often not looked at: a segment is found by POSITION, so never size a segment to its text and never move the bar. **Never hide a segment** — Routine B with no B reads "OFF" and the switch to turn it on lives behind it. **Seven segments wrap, they don't clip** (client codex, Sep 24 2026): Notes & Profile passes `wrap`, which lets a label and its meta line take a second line and grows the row — every segment together, so they stay equal — and is still 48px wherever nothing wraps (on every portrait iPad below the 13-inch — 744, 820, 834pt — "Body & Pulse" and "Goals & Focus" take two lines and the row is ~75px; a meta line that wraps grows it too, and metas land after the bar draws, so keep them short). Every wrap rule is scoped to `.psub-shell[data-wrap]` and `profile-nav-css.test.ts` holds it there: Programming and the Activity Archive don't pass `wrap` and render exactly as before, so never move a wrap rule into the base styles. `flagTone: "warn"` draws the dot plum (`--eq-warn`); `idPrefix` gives the segments ids and `aria-controls`, so a host that passes it keeps an element with every panel id in the page from the start — an empty, hidden `role="tabpanel"` placeholder for a page not yet visited, or `aria-controls` points at nothing.

- **Switching a sub-view must cost no fetch.** Every pane reads what the profile already loaded, or keeps its own gate (Trends still generates on request). Mount rules: Routine A/B and Reports unmount when hidden; **All Machines and Trends are mounted on first use and hidden thereafter** (they hold a selection / a generated report); Calendar and Sessions are ONE mount of `ClientHistoryTab`. Don't "tidy" any of those into plain conditional renders.

- **The client profile's record tab is the whole non-training record.** The FORD merge: one spine, sections `general · life · medical · goals · focus · notes · reports · admin`, defined once in `DOSSIER_SECTIONS` (`src/types/journal.ts`). `lifestyle` and `events` no longer exist. The `reports` section is titled **Pulse** and composes only — the filed shelf lives in Activity Archive → Reports (four-tab round: compose in the record, read the archive in the past). `ClientJournalTab` is mounted inside the spine with an `areas` list; given `areas` it draws no jump nav and no critical rail, because the spine owns navigation. It also takes a preloaded `journal` — the dossier loads `useClientJournal` ONCE and shares it, so don't add a second hook in a journal area.

- **Personal detail goes in FORD, not the journal.** `clients/{id}/ford/{id}`, studio-scoped by the client it hangs off; `journalEntries` is readable by any signed-in user, which is why it is not there. `pillar` is NULLABLE by design and the rules do not validate it — null means "caught mid-set, filed at teardown", and making it required puts a decision between a trainer hearing something and recording it. "Personal" was removed from the journal composer; old `life` entries still render. `client.events` is READ as FORD through an adapter and never written. Read `src/features/ford/README.md` before touching any of it.

- **Colour by urgency, never by pillar** on FORD screens, and `clients/{id}.fordSummary` is a cache — the subcollection is the truth.

- **The client-profile audit round (Sep 16) — read `docs/rounds/2026-09-16-client-profile-audit.md` before touching the profile.** The load-bearing parts:
  - **One machine window.** Every machine tap on the profile (Journey grid, Routine A/B rows) opens `features/equipment/ClientMachineWindow.tsx` — the All Machines detail. Settings save through `equipment/mutations.ts` (reason, history, journal). `MachineSettingsDashboardModal` survives only for `WorkoutChartGrid`; don't bring it back to the profile.
  - **Names go through `src/lib/client-name.ts`.** `client.nickname` (coach-owned, never synced) replaces the legal first name in headers; stored session names stay legal.
  - **Master Sync is the only client sync** (`src/lib/mindbody-master-sync.ts`, the header's Sync button, `POST /api/mindbody/client-master-sync`). By Mindbody id only (`mindbodyIdOf`), and it REFUSES a record whose ids disagree (`mindbodyIdConflict`) — the old profile sync used a name search and may have staged a namesake's id. Mindbody-owned identity is read-only on a linked client. `syncClientCommercialData` and `/api/mindbody/client-commercial` have no callers left.
  - **The waiver is three states** (`src/lib/client-waiver.ts`): never synced is "Not synced yet", not "Not on file".
  - **`client.machineStats` is trusted only once `machineStatsBackfilledAt` is set** — Programming's "performed / never tried" and the routine rows' % and × say nothing before it.
  - **Clinical watch-outs quote the matrix** (`src/lib/clinical-watchouts.ts`); the "Common constraints" category in `data/clinical-matrix.ts` holds the quick toggles. Display names drop anything in brackets (`shortCondition`) — don't put meaning in brackets.
  - **Setting suggestions are never values** (`features/equipment/setting-suggestions.ts`): an empty field, a band of `MIN_CLIENTS`, more than one client on the value, and a tap on Use.
  - **The contract tier lock** (`client.contractTierOverride`, `features/client-admin/`) wins on the record only; the renewal engine does not read it yet.
  - **Sticky elements inside the record** measure the scroller's padding with `features/client-profile/use-scroller-pad.ts`.
  - **The notes catalog leaves out profile fields the record edits in its own sections** (`SHOWN_ELSEWHERE_ON_RECORD`).
  - **The progress-report banner above the header reads one probe per client**, not the shelf (which loads on two tabs only).

- **`useClientJournal`'s four unbounded collections carry a 200-item guard rail, unordered on purpose** (`JOURNAL_GUARD_LIMIT`). Don't turn it into a "newest N": the focus board counts every past focus and its history, so an ordered cut would miscount (several focuses may be active at once since the audit round). When the rail is hit the hook says `capped` and the journal tab says so.

- **Every per-client FORD query filters on the client's studio, and every FORD writer stamps that same studio** (client codex, phase 1, Sep 24 2026). Rules are not filters: the FORD read rule tests `resource.data.studioId`, so Firestore refuses any list that does not pin the studio in its own `where` — even when every document in it would pass one by one. `useClientFord` listed `clients/{id}/ford` unfiltered from Sep 15 to Sep 24, so **every trainer below franchise owner saw an empty FORD** and nobody noticed, because AJ is an administrator; `refreshFordSummary` had the same fault. Both now use `where("studioId", "==", fordStudioIdOf(client))` (home studio, then the older `studioId`) with a limit and **no `orderBy`** — an orderBy beside the equality needs the composite index `ford(studioId asc, occurredAt desc)`, which does not exist. The hook reports `status` (`loading` · `ready` · `failed` · `denied`) and only `ready` may be drawn as "nothing on file"; a cross-train visitor is `denied` (they read the client document, never her FORD). `failed` is a listener error other than the rules, or a client with no studio — **not offline**: the persistent cache answers an offline read, so an iPad that never opened this client's FORD shows it empty while offline. **Test anything FORD with a Life Transformer's sign-in, not an administrator's.** `tests/firestore.rules.test.ts` → "FORD — who can read her life".

- **`useClientJournal` says what it could read, and hands out the sessions it already streams** (client codex, phase 1). `loadState` is `{ notes, focuses, sessions }`, each `loading | ready | failed`, keyed by client so the last client's answer never stands for this one; a failed group is "couldn't load", never "No notes yet". `recentSessions` is the 40 newest session documents from the listener the hook already runs for the wrap-up notes — **a screen holding the journal must not open a second sessions query.** It is gated on the sessions listener itself (`loadState.sessions === "ready"`), not on "anything answered for this client": the listeners are re-created per client but the state is not, so gating on any answer handed out the LAST client's sessions whenever the notes listener answered first. The legacy lists are emptied on every resubscribe for the same reason.

<a id="tracker"></a>

## The Active Session and set data

- **Set data has four outcomes; only `performed` counts.** Read an outcome through `outcomeOf()` / `isPerformedLog()` in `src/lib/set-outcome.ts`, never off the `outcome` field (older logs don't have it — a count means performed, no count means skipped). Every average, rollup, "last time" and progression figure filters to performed sets; a new reader of `exerciseLogs` does the same. Session start seeds a weight-only log for every planned machine, so a weight alone is not "the trainer worked on this" — `isBegunLog()` is. **Never block a save**: End Session confirms, it does not refuse (docs/ARCHITECTURE.md §1.6, `docs/rounds/2026-09-12-floor-round.md`).

- **Nothing on the Active Session deletes a session except Discard.** A 60-minute "abandoned session" loop used to `deleteSession` with every set in it; it is gone (tracker round, Sep 13). Abandonment is a read-side rule (`isSessionValid`). The bottom tab resumes the trainer's own live session after a crash (`src/lib/live-session.ts`); per-machine time is `src/lib/machine-clock.ts` and runs only while a machine is current — never "since the last one". `docs/rounds/2026-09-13-tracker-round.md`.

- **The session is saved at End Session, once.** `commitEndSession` is the only caller of `completeWorkoutSession` (its counters are `increment()`s — a second call double-counts). The post-session screen only appends: `dose` by `updateDoc`, the closing note by `createJournalEntry`. There is no Finalize button to bring back.

- **`WorkoutTrackerView` draws three screens and the order is a rule**, `lib/tracker-screen.ts`: post-session first while its snapshot exists, then none / briefing / tracker. The client's sessions stream turns pre-session mode on whenever nothing is In-Progress — including the beat after Finish — so never check the briefing before the post-session screen.

- **Sessions still use the app-wide machine list**, not each studio's roster, so a studio's own or adopted machines aren't in the session picker yet (ROADMAP).

<a id="renewals"></a>

## Packages, renewals and InBody

- **Package facts come from `client.renewal`** (the nightly snapshot), read through `src/lib/directory-row.ts` on lists — never from `packageTier`, `remainingSessions` or `nextSessionDate`, which nothing keeps current. There is no field for leader-granted extra sessions yet.

- **`clients/{id}.renewal` belongs to the nightly job.** The rules refuse any app write that changes it, so never write a whole client object back — write only the fields that changed.

- **A renewal cycle is checked as a whole document.** A leader's write to `studios/{s}/renewals/{cycleKey}` must fit `renewalCycleKeys()` in `firestore.rules`. Any new field the job writes has to be added there, or leaders are locked out of that cycle.

- **Pricing options are replaced, contracts are merged.** Each pull replaces `client.mindbodyServices` whole and merges `client.mindbodyContracts`. Mindbody dates are read as UTC days (`mindbodyDayKey`).

- **Attendance before a studio's first synced booking is unknown, not zero.** Pace and proof say so rather than showing "no visits".

- **InBody is health data.** Scans live in `clients/{id}/inbodyScans` under the sessions-style rule. Never copy InBody numbers into `progressReports`, which any signed-in user can read.

- **An InBody change is only called a change beyond the client's HOME studio's variation** (client codex, phase 2, Sep 24 2026; AJ's decision 8). The scanner reads the same body differently each time — 3.5 lb of muscle, 5.3 lb of fat mass and 2.7 points of body fat by default, each studio's own on My Studio → Studio (`studios/{id}.inbodyVariation`). Every word or colour about an InBody change goes through `src/features/inbody/variation.ts` (`callChange`, and `formatCalledChange` / `changeTone` / `summarySentence` in `scans.ts`); **never compare a delta with 0 to decide it is progress** — that is how "+1.2 lb muscle" became renewal proof and an upgrade candidate. The variation is a REQUIRED argument on every reader, so the typecheck names each one; pass the CLIENT — `useInBodyVariation(client)`, or `useInBodyVariationLookup()` for a list (a lookup in the studios already in context — no read) — never a studio id: neither hook takes one, so no screen can hand it the active studio. `clients/{id}.inbodySummary` and `renewal.proof.inbody` stay RAW deltas and the nightly job does not read the variation: it is applied only at display. "Use Max Strength's defaults" DELETES the field, so absent always means the defaults. Weight has no variation and is never toned.

<a id="layout"></a>

## Layout and CSS

- **A sticky bar in this app needs the scroller's padding negated.** The app shell is a bounded 100dvh column, so the document never scrolls — an inner `p-6` container does, and every engine pins a sticky box inside that padding. `--hist-stick-top` (History's month headers) and `--psub-stick-top` (the sub-toggle) are both that measurement. A sticky bar also needs an OPAQUE background from `--background`, or content scrolls through it. Inside the Activity Archive the month headers additionally offset by `--psub-stuck-h`, which `ProfileSubnav` publishes on the enclosing `.ptab`.

- **A `<button>` centres its own text.** Several FORD details render inside buttons so they can be opened, and a Tailwind `text-left` on them did not survive layer ordering in every build. Text alignment on a button belongs in the feature's CSS file, not in a utility class (FORD round, Sep 15).

- **One loading mark.** `components/LoadingMark.tsx` (`LoadingMark`, `LoadingArea`) is the wait state — never hand-roll another `animate-spin` div. Hub card markers come from `src/lib/hub-markers.ts` and read only what the Hub already holds (no reads per card).

- **In a flex column, a card with `overflow: hidden` must be `flex: none`**, or a short container shrinks the card instead of scrolling (this was the machine sheet's "truncation"). The same rule bit the Hub card: `truncate` *is* `overflow: hidden`, so a truncated text line in a fixed-height flex column is the line the browser squeezes to 0px — give the lines that must survive `shrink-0` and let one line (`min-h-0 overflow-hidden`) be the one that yields (fix round, Sep 13).

- **Two grid items in the same named `grid-area` are drawn on top of each other**, not stacked. A block that should push content down goes in its own row (`col-span-full`, no area name) — this was the profile's "Trained by" list covering the stat tiles.

<a id="server"></a>

## Mindbody, the server, scheduled jobs and sync

- **Mindbody routes need a sign-in.** Browser code must call them with `authedFetch` (`src/lib/authed-fetch.ts`); a plain `fetch` gets a 401. A new `/api/mindbody/*` route inherits the check. One that should be admin-only goes in `ADMIN_ONLY_MINDBODY_PATHS` in `server.ts` — lowercase, with no trailing slash. The check refuses a `siteId` or `mindbodyClientId` that isn't a plain id.

- **The web service has no Firestore admin key.** Server code can't read or write Firestore as an admin; `server/auth.ts` reads with the caller's own token over REST — and only single documents, never a collection list: a list is refused when any one document in it is off-limits, which took the schedule sync down on Sep 13. The cron jobs do have the service account.

- Two Mindbody sites share one client-ID range (both start at 100000001), and on Sep 23 2026 43 numbers named a different person at each. Never look a Mindbody client up by `clients/{id}` alone: go through `src/lib/mindbody-site.ts` (`chooseClientDoc`), which sends the second person to `clients/{site}-{id}`. `scripts/check-mindbody-client-collisions.ts` finds the shared numbers; `scripts/check-collision-damage.ts` finds bookings on the wrong person. `docs/rounds/2026-09-23-client-identity.md`.

- `scripts/mindbody/register-webhook.js` now takes `--site` and `--list` and includes the contract and membership events, but neither site is subscribed to them yet. Deploy the Cloud Functions first.

- **`machineTrends/*` is aggregates only, built weekly** (`server/machine-trends-job.ts`, one 90-day range on `exerciseLogs.createdAt`). Never put a client row in it — it is readable by any signed-in trainer and clients are studio-scoped; "this client vs everyone" is `client.machineStats` against the distribution. Medians are `null` under `MIN_CLIENTS`; a screen says "not enough data yet". One screen reads it: the Settings card's height-based suggestions (`features/equipment/useMachineTrend.ts`, one read per machine per session). The Cloud Function `calculateFacilityAnalyticsV2` still reads every exercise log nightly — needs an OK to touch.

- **The schedule is three live days plus a fetched cache** (`useLiveSchedule`, `src/lib/schedule-window.ts`): the listener watches yesterday–tomorrow; anything else comes from `ensureRange()` (cached by id, per-day coverage, 15-minute freshness, the week ahead refreshed on a timer while visible). A screen that shows a day outside the live window asks for its range — the calendar does; don't reach for a wider listener. `schedules` is the merged list. **It no longer fetches clients.**

- **The app's clients are the studio roster** (`useStudioRoster`, `src/lib/studio-roster.ts`, hub sync fixes Sep 16): one listener on `clients where homeStudioId == activeStudioId`, plus booked visitors read by id. `AppContent`'s `clients` is that roster plus the selected client — the Hub, the directory and the auto-sync all read it. A studio switch empties it at once (`status` is `loading` until the listener answers — say "loading", never "Not synced", in that beat); a failed read never empties it. The directory trusts it for the current studio (`studioRosterReady`) and queries only for "Search entire corporate network". The listener's cost grows with every client whose `homeStudioId` is the studio — filter it to active clients before a historical import.

- **The schedule sync never reads a whole collection** (hub sync fixes, Sep 16). Phase 1 checks only the client ids the caller's roster lacks (`checkClientIds`: existing / missing / refused / unchecked) and never writes the full create payload over an existing client — that payload zeroes `sessionCount` and friends. The stale-booking sweep reads and cancels only rows inside the window Mindbody was asked about; anything outside it was simply not asked. A for-trainers corollary worth remembering: **the rules refuse a read of a client document that doesn't exist**, so "refused" means "missing, or someone else's", and a batch `in` query with one such id is refused whole.

- **The Render cron service is still named `journey-cron-leaderboards`** although it runs the machine-trends job — a renamed blueprint service is a new service to Render.

<a id="rules"></a>

## Machines and the template boundary

*Machine authoring, Sep 20 2026; the catalog gate, Sep 20 2026.*

**The template boundary does NOT cover a submission, and cannot.**
`scopeOverrides` protects the roster write, where a studio is editing a COPY
of a catalog machine. A studio's own machine (`source: "custom"`) inherits
nothing, so it legitimately stores the whole definition — method included —
and publishing it copies that into `machines/{id}` verbatim. The protection
there is a human reading it (`features/admin/catalog/review.ts`,
`SubmissionReview.tsx`), not a filter. **If you add another path that turns a
studio document into a catalog document, it needs the same review, not a call
to `scopeOverrides`** — stripping the method off a submission would publish a
machine with no cadence, which is worse.

**`BLOCKING_GAPS` must stay clearable by the catalog itself.**
`review.test.ts` asserts all twenty generated MSF definitions pass every
blocking check. Adding one that the Academy's guides do not state — dial
defaults, synergists, secondary musculature — fails that test, and it is
telling you the truth: a gate the standard would fail stops being read.

**Publishing sends `reviewedDefinition ?? definition`.** Read it through
`definitionUnderReview()`, never off the raw document, or the row, the
suggested id, the gate and the write drift apart. And never edit
`definition` in place: it is what the studio sent, and it is what makes
`correctedFields` — and the sentence the studio reads on its floor — true.

**The catalog documents were in the LEGACY shape, and that is why the editor
looked empty.** `machines/{id}` was seeded by Operations → System Tools →
"Restore standard machines" from `data/default-machines.ts`, the legacy
`Machine` type (`targetMuscles` as one comma string, `settingOptions` as bare
labels, nothing for the biomechanics template), while the editor reads
`MachineDefinition`. About 6 of 60 inputs filled. The seeder now writes
`data/machine-definitions.ts`. **If a machine ever opens sparse again, check
the document's shape before blaming the form.**

**`emptyMachineDefinition()` must not guess the taxonomy.** It used to default
`anatomicalRegion` to "Chest" and `movementPattern` to "Upper Body: Horizontal
Push". No catalog document had a pattern of its own, so `normalize` handed that
default to the form for all twenty machines — leg press included — and saving
wrote it in. Those fields start empty now and the section rail asks for them. A
confident wrong value is worse than a missing one.

**A bag of values merges per key, not whole.** `universalBaseline`,
`bodyTypeAdjustments` and `defaultSettings` are independent fields under one
key. Replacing the object on override meant a studio correcting one seat
position stopped live-inheriting the other four baseline lines forever, and a
later admin correction reached every location EXCEPT the ones that had edited
that object. `mergeMachineDefinition` merges them per key (`""` is a deliberate
clear) and `pruneOverrides` reduces a stored override to the sub-keys that
actually differ. Both halves are needed; either alone does nothing.

**Write a roster override with `updateDoc`, never `setDoc(..., {merge:true})`.**
Firestore merges maps deeply, so a merge write keeps a key the studio has just
reverted — "use the standard" appears to work and then silently does not.

**`machineId` is a foreign key. Never re-mint it on a rename.** It is queried
across studios in `exerciseLogs`, `clientMachineSettings` and `routines`.
`MachineSettingField.key` is the same kind of thing one level down: it is written
into every client's saved settings, so the editor shows it as a fixed badge and
only the label is editable. Renaming a key orphans every stored value for that
dial.

**Compute a studio's overrides from the whole DRAFT, not from the save patch.**
The patch is the difference between this edit and what was on screen; an override
is the difference between the studio's machine and the catalog's. Using the patch
drops every override made in an earlier sitting.

**Kinematic class is not the turnaround protocol.** Compound = multi-joint,
Simple = single-joint, and it comes from `kinematicClassification`. The Academy
gives the COMPOUND ROW a pause and a squeeze at the contracted position;
deriving the class from that relabels the row, the pulldown and the pullover as
single-joint and splits every cross-studio roll-up.

**`isStandardSetMachine` treats an ABSENT flag as in-the-set.** A UI that reads
`m.inStandardSet` directly shows OFF for every legacy document while the seeder
treats it as ON. Read through the function, and write an explicit `false` to take
a machine out.

**The generator must not read `imageUrl` from `machine-database.ts`.** It bundles
the data files with esbuild's text loader, so that field comes back as the
`.webp`'s bytes and gets baked into the generated source — 30 KB per machine.

## Security rules and permissions

- **The 1000-expression budget bites three times now, and it reads as a permission error.**
  Firestore refuses a rule that evaluates more than 1000 expressions with
  "Unable to evaluate the expression as the maximum of 1000 expressions to
  evaluate has been reached" — which surfaces as PERMISSION_DENIED and looks
  like a rule saying no. `getRole()` reads the trainer document TWICE on its
  document-backed path, and `isStudioOwnerOrHeadTrainerOnly()` calls
  `getRole()` three times and `getTrainerData()` five, so stacking
  `isSuperAdmin() || isFranchiseOwnerOnly() || isStudioOwnerOrHeadTrainer()`
  in one condition is enough on its own. It took the sessions read rule down
  (Sep 9), the hub_announcement rules (fixed with `let r = getRole()`),
  `teamJobs` (Sep 19, `teamJobLeaderAllowed`), and the **trainers update
  rule** (Sep 20, Demo Mode - see the next trap). **The fix is always the same:
  extract the condition into a function, `let r = getRole()` and
  `callerTrainer()` once, and ask `trainerLeads(r, t, studioId)` rather than
  the helper that re-reads.** `let` is legal in a function body and not in an
  `allow` condition, which is why these are functions.

- **The trainers UPDATE rule went over the budget (Sep 20, Demo Mode), and reordering did not save it.**
  Demo Mode added a clause opening with `isAnyAuthenticatedTrainer()` - an
  `exists()` - followed by the whole of `isDemoTrainerPayload()`, running on
  EVERY trainer update including a trainer saving their own bio. The first
  assertion of "lets a trainer edit their own profile" began failing with
  PERMISSION_DENIED.

  **The first attempt was to reorder that clause so its free literal tests led
  and `&&` short-circuited out of it. The test still failed.** Worth knowing
  why: the demo clause was never the expense. The expense was everything under
  it - `isSuperAdmin()`, `isFranchiseOwner()`,
  `isStudioOwnerOrHeadTrainer()`, `roleChangeAllowed(getRole())` and
  `grantChangeAllowed(getRole())` each re-deriving `getRole()`, which reads the
  trainer document twice on its document-backed path. Roughly ten expansions in
  one condition. Demo Mode did not create that; it added the last straw.

  **Ordering is a trim, not the cure. The cure is always resolve-once.** Fixed
  with `trainerUpdateAllowed(trainerId, getRole(), callerTrainer())` - one
  `getRole()`, one `callerTrainer()`, and pure map lookups below, with
  `trainerLeads(r, t, studioId)` standing in for
  `isStudioOwnerOrHeadTrainer()` (it mirrors that helper's DB branch exactly,
  demo studio and grant included) and `grantChangeAllowed(r, t)` taking the
  caller document instead of re-reading it. **When a rule is near the budget,
  count the `getRole()` expansions before you touch anything else.**

- **"Everybody may do X in the demo studio" is a door into every rule that calls the helper (Sep 20).**
  Demo Mode put `hasRunOfDemo(studioId)` at the top of
  `isStudioOwnerOrHeadTrainerOnly()` - correct for the demo studio, and
  instantly enough to make every OTHER rule asking "is this person a studio
  leader" answer yes for `demo-studio`. The `trainers` create rule has a
  studio-leader clause that never constrains `accessibleStudioIds` or
  `ownedStudioIds`, because it trusts the leader. So any signed-in trainer
  could create a trainer document at ANY id with `primaryHomeStudioId:
  'demo-studio'` and `accessibleStudioIds: ['demo-studio', 'studioA']` - a
  claim on a REAL studio, plantable at a colleague's uid before their first
  sign-in. Fixed with `!isDemoStudioId(...)` on that clause, so demo trainers
  are minted by `isDemoTrainerPayload` and nowhere else. **Before widening a
  role helper for the demo studio, list every rule that calls it and ask what
  each one lets a leader do.**

- **The role lives on the token now (cost round, Sep 16).** `syncTrainerClaims` (`functions/src/claims.ts`) mirrors `trainers/{id}.role` onto the auth user's custom claims; the rules read `request.auth.token.role` first and fall back to the document only when it is absent. Consequences: a role change reaches the rules at the next sign-in or within an hour (the token is checked first, so the OLD claim wins until then); **never set a `studioId` claim** (as written it grants studio-leader access with no role check); a new trainer role must be added to `TRAINER_ROLES` in `claims-logic.ts` as well as `UserRole`; the function has to be deployed (`firebase deploy --only functions:syncTrainerClaims`) and `scripts/backfill-trainer-claims.ts --commit` run once — until then it just costs the read it always did.

- **Closed Sep 16 (cost round):** a trainer can no longer edit their own `role`, `ownedStudioIds`, `accessibleStudioIds`, `activeGuestStudioIds` or `primaryHomeStudioId` (`writesAccessFields()` in the `trainers` update rule); the rest of their own document is still theirs. **Still open, needs AJ's OK:** any trainer can edit any `studios/{id}` document, including `mindbodySiteId`.

- **Also open, needs AJ's OK:** any trainer at any studio can create and update another studio's `taskInstances` and `taskRequests` (studio tasks and requests).

- `progressReports`, `journalEntries`, `exerciseLogs`, `clinicalIncidents` and `schedules` are readable by any signed-in user. Studio-scoped: `clients`, `sessions`, comments, and (since the Learning + Planner round) a studio's `playbook` and `wiki`.

- **Studio content writes need `writesForStudio(studioId)`** since the Learning + Planner round: machine notes, the upkeep log, playbook, wiki blocks and comments. `writesForStudioPerRules` (`src/features/learning/permissions.ts`) mirrors it for buttons.

- **Use the Auth uid, not `authTrainer.id`, for anything a rule pins to the signed-in person** — note paths, comment authors, `readBy`, personal tasks. The two differ on older accounts.

- **Shared lists are collection-group reads.** Each needs a `{path=**}` rule its filters satisfy (`shared == true`) and a collection-group index. Until a new index finishes building, the screen says it couldn't load the shared part.


- **Roster entries name their own studio** (`studioId` must match the path), and a copy adopted from another studio can't be shared.

<a id="tooling"></a>

## React, tests, dates and tooling

- **A reducer passed to `useReducer` must close over NOTHING declared below it.** React calls a reducer while processing a QUEUED action, and it does that during the next render at the point of the `useReducer` call — so a wrapper arrow reading a `const` declared a few lines further down reads it in its temporal dead zone. The four-tab profile shipped exactly this: it opened fine and threw `Cannot access 'ctxRef' before initialization` on the first tab tap. `profileNavReducer` now takes two arguments, lives at module scope and gets everything from the ACTION, assembled at dispatch time. Same rule for anything else React may call mid-render.

- **Anything that throws in a `useLayoutEffect` takes the whole screen to the error boundary.** Feature-detect browser APIs there: `typeof ResizeObserver === "function"` before `new ResizeObserver` (JourneyGrid and ProfileSubnav do; one JourneyGrid use at line ~569 still does not — pre-existing).

- **`npx vitest run src` mounts only what has a `*.render.test.tsx`** (the profile nav, the notes area, the Dial, Update Pulse, the briefing, the post-session screen, the Pulse panel, the 4 P's, the Deep Dive — jsdom, raw `react-dom/client`, no testing-library). A clean typecheck, a full green suite and a production build all passed while the profile crashed on every tab tap. **Add a render test for any hook or component that does work during render or in a layout effect** — they are cheap and they are the only check that would have caught it.

- **A date-ONLY ISO string is UTC; a date-TIME with no zone is LOCAL.** `new Date("2026-09-20")` is UTC midnight, `new Date("2026-09-20T10:00:00")` is local. Mixing the two in one comparison passes in CI (UTC) and fails on a studio PC (Eastern), which is the worst shape a date bug can have — it cost a red `ship` run on Sep 15. `toDate()` in `src/types/journal.ts` pins a date-only string to local NOON for exactly this reason; never hand a raw `new Date("yyyy-mm-dd")` to anything that then does local-calendar arithmetic. **Run the suite with `TZ=America/New_York` before shipping**, not just in UTC. (Known and unrelated: `src/features/renewals/conversation.test.ts` fails at UTC+14; no studio is east of Eastern.)

- **Never type a raw control or invisible character into source** (a NUL, U+F8FF): write the escape (`\u0000`, `\uf8ff`). A raw NUL makes git treat the file as binary, and a binary diff can't ship as a patch.

- On AJ's PC, Claude's Linux shell reaches the project folder again (Sep 16): it can run git (delete permission needed for the lock files) and `tsc`, but **not** `vitest` or `vite` — the Windows `node_modules` has no Linux rolldown binding. The cloud container **can** `npm ci`, typecheck, run the suite and both builds; it cannot run `test:rules` (the emulator jar's host is blocked), so **AJ's `test:rules` run is the one that counts.** The file bridge (stage and commit files) works either way.

- **On AJ's PC the test commands must exclude `.claude/**`** (client codex, phase 1, Sep 24 2026). Claude Code keeps git worktrees under `.claude/worktrees/`, each a full copy of the repo, and vitest's default excludes do not cover them: `npx vitest run src` matches every copy's `src/` too, and `npm run test:rules` ran four copies of the rules suite in parallel against ONE emulator (172 spurious failures). `package.json`'s `test` and `test:rules` now pass `--exclude **/.claude/**`; by hand, use `npx vitest run --dir src` (or add the same `--exclude`). And `firebase emulators:exec` can leave the Firestore emulator (a `java` process) listening on port 8080 after it exits — the next rules run then fails with "port taken". Check `Get-NetTCPConnection -LocalPort 8080` first and stop that `java` process if it outlived a run.

- **On AJ's PC, use `git --no-optional-locks` for every read-only git command** (beta-prep trim, Sep 17 2026). Claude's shell reaches the project folder through a mount that cannot delete files until AJ grants delete permission for the session. A plain `git status` refreshes the index: it creates `.git/index.lock`, then cannot remove it, and AJ's NEXT git command - in PowerShell or GitHub Desktop - fails with "Another git process seems to be running". `--no-optional-locks` skips that refresh. If a lock is left behind, move it aside with `mv` (renames are allowed) and say so. The same mount makes `git fetch` leave `tmp_pack_*` files in `.git/objects/pack` that it could not unlink (harmless; move them aside), and a `maintenance.lock` from Sep 2 had been silently blocking git's auto-maintenance there for two weeks. To deliver a branch without touching `master` or the working tree: `git bundle create x.bundle master..<branch>` in the cloud, commit the file into `backups\`, then on the PC `git fetch x.bundle <branch>:<branch>` - a new bundle file name each time, because re-using an outputs path can land the previous bytes.

<a id="baselines"></a>

**A `setState` updater is not guaranteed to run synchronously.** Reading live
state from inside one and acting on a flag it sets is a real bug, not a style
issue: inside an event handler the updater normally runs during the NEXT render,
so the flag is still false when you check it. React's eager-evaluation path
hides this until StrictMode's double render defeats it — and `src/main.tsx`
turns StrictMode on. `useDirtyForm.save()` shipped like this and silently never
called `onSave` while the bar sat at "Saving…" (fixed Sep 20 2026, machine
authoring). Mirror the state in a ref instead. A pure test cannot see this; it
needs a mounted render test.

**On AJ's PC, `vitest` no longer runs from the Linux-side shell.** The Windows
`node_modules` has no Linux rolldown binary and the newer vitest needs one
(`Cannot find module '@rolldown/binding-wasm32-wasi'`). `tsc` and `git` still
work there. Run the suite and the build in the cloud container instead — tar the
source (excluding `node_modules`, `.git`, `dist`, `backups`, and `.env` /
`service-account.json`), stage it, `npm ci`, then push changed files back with
`device_commit_files`. The Sep 8 note saying vitest works on the PC is obsolete.

**Git on this mount leaves a `.git/HEAD.lock` behind after every commit**, and
the next commit fails with "Another git process seems to be running". Deleting
it needs a permission that may be refused — but a RENAME works: `mkdir -p
.git/stale-locks && mv .git/HEAD.lock .git/stale-locks/HEAD.lock.$(date +%s)`
after each commit. Use `git --no-optional-locks` for read-only commands.

## Git on the connected-folder mount - it cannot replace a file

Learned the hard way, Sep 20 2026, during the note threads round.

**The mount cannot delete, and git replaces a file by unlinking it first.** So
anything that rewrites the working tree - `git reset --hard`, `git checkout
<branch>` across a real difference, `git stash pop` - half-succeeds: it rewrites
the files it can create fresh and fails on the rest with `error: unable to
unlink old '<path>'`, leaving the tree in a state that is neither commit. A
`git commit -a` or `git add -A` on top of that commits the mixture.

What happened: something checked `master` out mid-round (the reflog said
`checkout: moving from note-threads to master`, and nothing in the session did
it - assume an editor, a tool, or another window). The checkout partly reverted
the tree, and the next `git add -A src` committed that mixture onto **master**,
not the feature branch.

The rules that come out of it:

- **Print the branch before every commit.** `git --no-optional-locks branch
  --show-current` costs nothing and is the only thing that would have caught it.
- **Never `git add -A`.** Name the paths. `-A` is what turns a half-reverted
  tree into a commit.
- **Recover the tree with tar, not git:** `git archive <commit> src tests
  firestore.rules | tar -x --overwrite -C .` - tar's `--overwrite` truncates in
  place instead of unlinking, so it goes where `reset --hard` cannot. Better
  still, if the container has a verified copy of the tree (the one the suite
  passed against), tar that back over the mount.
- **Rebuild history with plumbing, which never touches the tree:** `NEW=$(git
  commit-tree <good-tree> -p <parent> -F msg)` then `git branch -f <branch>
  $NEW`. `git branch -f` refuses the CURRENT branch, so move off it first or
  use the tree-restoring route above.
- The lock files are the same problem, and the workaround is unchanged: after
  every git write, `mv` any `.git/index.lock` and `.git/HEAD.lock` into
  `.git/stale-locks/`. Renames work on this mount even though deletes do not.

### It is worse than "something else checked master out" (catalog gate, Sep 20 2026)

Hit again the same day, with nothing else touching the repo. Two additions.

**`.git/HEAD` reverts on its own, and `git` will tell you it did not.** `git
checkout -b catalog-gate` printed `Switched to a new branch`, and
`rev-parse --abbrev-ref HEAD` agreed — four commits were made on it and every
one is intact. Some time later `cat .git/HEAD` read `ref: refs/heads/master`
again. HEAD is written the same way every other file is, by writing
`HEAD.lock` and renaming it over HEAD, so it loses the same race everything
else does. The branch ref (`refs/heads/catalog-gate`) was fine the whole time
and the commits were never at risk; what moved was which branch the working
tree and the next commit belonged to. **Two edits landed on `master`.**

So: `cat .git/HEAD` is the check, not `rev-parse` — and do it before every
commit, not once at the start. And never push from a session that has been
switching branches without reading that file first.

**A branch switch half-applies, silently, with exit code 0.** `git checkout
catalog-gate` restored the files that did not exist on master (it can CREATE)
and left every file that existed on both at master's content (it cannot
REPLACE). No error, no warning. The tree then typechecks as a mixture — here,
28 errors against a baseline of 10, all of them "X has no exported member Y"
between files that agree perfectly in the commit.

**Recovery, and it is simpler than the tar route above.** Writing to a file
works; only replacing it by rename does not. So:

```bash
for f in $(git --no-optional-locks status --porcelain | grep "^ M" | awk '{print $2}'); do
  git --no-optional-locks show "HEAD:$f" > "$f"
done
```

Run it after EVERY branch switch on this mount, then re-check `git status` —
it should print nothing but the files you meant to keep. Typecheck afterwards
and compare to the baseline; a jump of exactly the wrong kind (missing exports
between two files you just wrote together) is this trap, not your code.

## Baselines by round

The typecheck count and the test count after each round, moved here from the Commands table in `CLAUDE.md`. Compare COUNTS, never expect zero.

- **Typecheck (`npx tsc --noEmit`):** Compare the error **count** to master's baseline (10 on `note-threads` (Sep 20), unchanged from `machine-authoring`; 11 after the Operations overhaul (Sep 19), unchanged from the reporting round which retired two charts, unchanged by Relay; 13 after the client-profile audit round removed dead code from ClientProfileView, unchanged by the Planner rework and the hub sync fixes; 18 after the FORD round; 20 before that); don't expect zero

- **Tests (`npx vitest run src`):** **3,584 in 238 files after the catalog gate (Sep 20; master was 3,545 in 237).** Note that the 251-file figure below counts test files outside `src` as well — the documented command, `npx vitest run src`, collects 238 on master. 3,717 in 251 files after the note threads round (Sep 20); 3,683 in 247 files after the demo loads round (Sep 20); 3,654 in 246 after the demo week (Sep 20; 3,636 in 245 before it, at the end of the Demo Mode round). 3,469 in 232 files after the Operations overhaul (Sep 19; 3,396 in 224 before it); 2,977 passing after Relay (Sep 16); 2,903 after the reporting round (Sep 16); 2,787 after the hub sync fixes (Sep 16); 2,763 after the Planner rework (Sep 16); 2,636 after the client-profile audit round (Sep 16); 2,128 after the cost round (Sep 16) — run it as `TZ=America/New_York npx vitest run src`, see the date trap below; 2,077 after the four-tab profile round; 2,046 after the FORD round; 2,027 after the fix round; 2,015 after the tracker round; 1,813 after the floor round

- **beta-prep trim (Sep 17 2026), on the `beta-prep` branch only:** typecheck 11; 2,982 tests (2,977 on master, plus five new pins: the History button's `openProfileAt`, the two starting-weight casing tests, the two LoginScreen render tests).
