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

- **The sub-toggle is one component and its rules are load-bearing.** `ProfileSubnav` — sticky, 48px, segments as EQUAL fractions of the full width, brand blue (never hero orange, which is Start Session). The iPad is held and often not looked at: a segment is found by POSITION, so never size a segment to its text and never move the bar. **Never hide a segment** — Routine B with no B reads "OFF" and the switch to turn it on lives behind it.

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

- Two Mindbody sites share one client-ID namespace in `clients/`. Collisions haven't been ruled out: run `scripts/check-mindbody-client-collisions.ts` before subscribing site 29068 to contract events.

- `scripts/mindbody/register-webhook.js` now takes `--site` and `--list` and includes the contract and membership events, but neither site is subscribed to them yet. Deploy the Cloud Functions first.

- **`machineTrends/*` is aggregates only, built weekly** (`server/machine-trends-job.ts`, one 90-day range on `exerciseLogs.createdAt`). Never put a client row in it — it is readable by any signed-in trainer and clients are studio-scoped; "this client vs everyone" is `client.machineStats` against the distribution. Medians are `null` under `MIN_CLIENTS`; a screen says "not enough data yet". One screen reads it: the Settings card's height-based suggestions (`features/equipment/useMachineTrend.ts`, one read per machine per session). The Cloud Function `calculateFacilityAnalyticsV2` still reads every exercise log nightly — needs an OK to touch.

- **The schedule is three live days plus a fetched cache** (`useLiveSchedule`, `src/lib/schedule-window.ts`): the listener watches yesterday–tomorrow; anything else comes from `ensureRange()` (cached by id, per-day coverage, 15-minute freshness, the week ahead refreshed on a timer while visible). A screen that shows a day outside the live window asks for its range — the calendar does; don't reach for a wider listener. `schedules` is the merged list. **It no longer fetches clients.**

- **The app's clients are the studio roster** (`useStudioRoster`, `src/lib/studio-roster.ts`, hub sync fixes Sep 16): one listener on `clients where homeStudioId == activeStudioId`, plus booked visitors read by id. `AppContent`'s `clients` is that roster plus the selected client — the Hub, the directory and the auto-sync all read it. A studio switch empties it at once (`status` is `loading` until the listener answers — say "loading", never "Not synced", in that beat); a failed read never empties it. The directory trusts it for the current studio (`studioRosterReady`) and queries only for "Search entire corporate network". The listener's cost grows with every client whose `homeStudioId` is the studio — filter it to active clients before a historical import.

- **The schedule sync never reads a whole collection** (hub sync fixes, Sep 16). Phase 1 checks only the client ids the caller's roster lacks (`checkClientIds`: existing / missing / refused / unchecked) and never writes the full create payload over an existing client — that payload zeroes `sessionCount` and friends. The stale-booking sweep reads and cancels only rows inside the window Mindbody was asked about; anything outside it was simply not asked. A for-trainers corollary worth remembering: **the rules refuse a read of a client document that doesn't exist**, so "refused" means "missing, or someone else's", and a batch `in` query with one such id is refused whole.

- **The Render cron service is still named `journey-cron-leaderboards`** although it runs the machine-trends job — a renamed blueprint service is a new service to Render.

<a id="rules"></a>

## Security rules and permissions

- **The role lives on the token now (cost round, Sep 16).** `syncTrainerClaims` (`functions/src/claims.ts`) mirrors `trainers/{id}.role` onto the auth user's custom claims; the rules read `request.auth.token.role` first and fall back to the document only when it is absent. Consequences: a role change reaches the rules at the next sign-in or within an hour (the token is checked first, so the OLD claim wins until then); **never set a `studioId` claim** (as written it grants studio-leader access with no role check); a new trainer role must be added to `TRAINER_ROLES` in `claims-logic.ts` as well as `UserRole`; the function has to be deployed (`firebase deploy --only functions:syncTrainerClaims`) and `scripts/backfill-trainer-claims.ts --commit` run once — until then it just costs the read it always did.

- **Closed Sep 16 (cost round):** a trainer can no longer edit their own `role`, `ownedStudioIds`, `accessibleStudioIds`, `activeGuestStudioIds` or `primaryHomeStudioId` (`writesAccessFields()` in the `trainers` update rule); the rest of their own document is still theirs. **Still open, needs AJ's OK:** any trainer can edit any `studios/{id}` document, including `mindbodySiteId`.

- **Also open, needs AJ's OK:** any trainer at any studio can create and update another studio's `taskInstances` and `taskRequests` (studio tasks and requests).

- `progressReports`, `journalEntries`, `exerciseLogs`, `clinicalIncidents` and `schedules` are readable by any signed-in user. Studio-scoped: `clients`, `sessions`, comments, and (since the Learning + Planner round) a studio's `playbook` and `wiki`.

- **Studio content writes need `writesForStudio(studioId)`** since the Learning + Planner round: machine notes, the upkeep log, playbook, wiki blocks and comments. `writesForStudioPerRules` (`src/features/learning/permissions.ts`) mirrors it for buttons.

- **Use the Auth uid, not `authTrainer.id`, for anything a rule pins to the signed-in person** — note paths, comment authors, `readBy`, personal tasks. The two differ on older accounts.

- **Shared lists are collection-group reads.** Each needs a `{path=**}` rule its filters satisfy (`shared == true`) and a collection-group index. Until a new index finishes building, the screen says it couldn't load the shared part.

- **Announcements** can be posted only by `canPostAnnouncements()` (administrators, founders, franchise owners, studio owners), as themselves; only the Operations tab's people reach every studio. Everyone else may only add their own uid to `readBy`.

- **Roster entries name their own studio** (`studioId` must match the path), and a copy adopted from another studio can't be shared.

<a id="tooling"></a>

## React, tests, dates and tooling

- **A reducer passed to `useReducer` must close over NOTHING declared below it.** React calls a reducer while processing a QUEUED action, and it does that during the next render at the point of the `useReducer` call — so a wrapper arrow reading a `const` declared a few lines further down reads it in its temporal dead zone. The four-tab profile shipped exactly this: it opened fine and threw `Cannot access 'ctxRef' before initialization` on the first tab tap. `profileNavReducer` now takes two arguments, lives at module scope and gets everything from the ACTION, assembled at dispatch time. Same rule for anything else React may call mid-render.

- **Anything that throws in a `useLayoutEffect` takes the whole screen to the error boundary.** Feature-detect browser APIs there: `typeof ResizeObserver === "function"` before `new ResizeObserver` (JourneyGrid and ProfileSubnav do; one JourneyGrid use at line ~569 still does not — pre-existing).

- **`npx vitest run src` mounts only what has a `*.render.test.tsx`** (the profile nav, the notes area, the Dial, Update Pulse, the briefing, the post-session screen, the Pulse panel, the 4 P's, the Deep Dive — jsdom, raw `react-dom/client`, no testing-library). A clean typecheck, a full green suite and a production build all passed while the profile crashed on every tab tap. **Add a render test for any hook or component that does work during render or in a layout effect** — they are cheap and they are the only check that would have caught it.

- **A date-ONLY ISO string is UTC; a date-TIME with no zone is LOCAL.** `new Date("2026-09-20")` is UTC midnight, `new Date("2026-09-20T10:00:00")` is local. Mixing the two in one comparison passes in CI (UTC) and fails on a studio PC (Eastern), which is the worst shape a date bug can have — it cost a red `ship` run on Sep 15. `toDate()` in `src/types/journal.ts` pins a date-only string to local NOON for exactly this reason; never hand a raw `new Date("yyyy-mm-dd")` to anything that then does local-calendar arithmetic. **Run the suite with `TZ=America/New_York` before shipping**, not just in UTC. (Known and unrelated: `src/features/renewals/conversation.test.ts` fails at UTC+14; no studio is east of Eastern.)

- **Never type a raw control or invisible character into source** (a NUL, U+F8FF): write the escape (`\u0000`, `\uf8ff`). A raw NUL makes git treat the file as binary, and a binary diff can't ship as a patch.

- On AJ's PC, Claude's Linux shell reaches the project folder again (Sep 16): it can run git (delete permission needed for the lock files) and `tsc`, but **not** `vitest` or `vite` — the Windows `node_modules` has no Linux rolldown binding. The cloud container **can** `npm ci`, typecheck, run the suite and both builds; it cannot run `test:rules` (the emulator jar's host is blocked), so **AJ's `test:rules` run is the one that counts.** The file bridge (stage and commit files) works either way.

- **On AJ's PC, use `git --no-optional-locks` for every read-only git command** (beta-prep trim, Sep 17 2026). Claude's shell reaches the project folder through a mount that cannot delete files until AJ grants delete permission for the session. A plain `git status` refreshes the index: it creates `.git/index.lock`, then cannot remove it, and AJ's NEXT git command - in PowerShell or GitHub Desktop - fails with "Another git process seems to be running". `--no-optional-locks` skips that refresh. If a lock is left behind, move it aside with `mv` (renames are allowed) and say so. The same mount makes `git fetch` leave `tmp_pack_*` files in `.git/objects/pack` that it could not unlink (harmless; move them aside), and a `maintenance.lock` from Sep 2 had been silently blocking git's auto-maintenance there for two weeks. To deliver a branch without touching `master` or the working tree: `git bundle create x.bundle master..<branch>` in the cloud, commit the file into `backups\`, then on the PC `git fetch x.bundle <branch>:<branch>` - a new bundle file name each time, because re-using an outputs path can land the previous bytes.

<a id="baselines"></a>

## Baselines by round

The typecheck count and the test count after each round, moved here from the Commands table in `CLAUDE.md`. Compare COUNTS, never expect zero.

- **Typecheck (`npx tsc --noEmit`):** Compare the error **count** to master's baseline (11 after the reporting round retired two charts, unchanged by Relay; 13 after the client-profile audit round removed dead code from ClientProfileView, unchanged by the Planner rework and the hub sync fixes; 18 after the FORD round; 20 before that); don't expect zero

- **Tests (`npx vitest run src`):** 2,977 passing after Relay (Sep 16); 2,903 after the reporting round (Sep 16); 2,787 after the hub sync fixes (Sep 16); 2,763 after the Planner rework (Sep 16); 2,636 after the client-profile audit round (Sep 16); 2,128 after the cost round (Sep 16) — run it as `TZ=America/New_York npx vitest run src`, see the date trap below; 2,077 after the four-tab profile round; 2,046 after the FORD round; 2,027 after the fix round; 2,015 after the tracker round; 1,813 after the floor round

- **beta-prep trim (Sep 17 2026), on the `beta-prep` branch only:** typecheck 11; 2,982 tests (2,977 on master, plus five new pins: the History button's `openProfileAt`, the two starting-weight casing tests, the two LoginScreen render tests).
