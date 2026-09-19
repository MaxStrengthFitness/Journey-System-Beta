# The Operations round — Sep 19 2026 (Round B of the Operations audit)

Branch `operations-round`, off `my-studio` at `3ab70ce` (Round A, the My
Studio round, itself off `master` at `93fb096`). Seven commits, one per
phase, each typechecked and tested on its own so any phase can be reverted
alone. Nothing pushed; nothing deployed. The brief is section F of
`docs/rounds/2026-09-18-operations-audit-prep.md` (Round B), read with
the line the whole audit follows:

> **My Studio is where you run the studio; Operations is where you look at
> it.** (AJ, Sep 18)

Round A built the studio's home. This round is the look-at side: what a
leader, an owner or the company sees when they open Operations on a Monday
morning, and how far they can see.

## Decisions (AJ, Sep 19)

- **"No payroll on the app for now, but do track training hours per week
  and month per trainer, and the total, for operations."** Hours is a tab;
  the payroll export (audit section G) stays an open question.
- **Performance discrepancies: "the Sunday job writes a watch list."**
  The Monday page does not compute rep drops itself — the weekly
  machine-trends job, which already reads the 90-day window of set logs,
  writes one watch document per studio and the page reads it. (The
  alternative, a per-client query loop from the page, was refused by the
  house rule against per-client queries in a loop.)
- Everything else follows the decisions of Sep 18 (audit §E): scope over
  "every studio to everyone", the Franchise screen folded in, the Catalog's
  standard set as a first-class view, publishing as a script from the PC,
  Announcements owners-and-admins only on Operations, Renewals' settings
  on My Studio, and "let's more worry about features rather than
  permission restrictions."

## What was built

### 1 · Hours (`src/features/admin/hours/`)

Training hours by trainer, by week and by month, with the studio's total —
and under "All my studios" the company total.

- **An hour is booked slots, not the stopwatch.** Every completed Journey
  session counts for the studio's session length — `studios/{id}
  .sessionMinutes`, default 30 ("Strength 30"), a new field set on My
  Studio → Studio → The studio's day. The measured floor time (the
  session's stopwatch) is shown beside it and never mixed in: a trainer who
  runs a 30-minute slot in 22 minutes has worked 30 minutes.
- **Weeks run Monday to Sunday.** A month's table has a column per week,
  the partial first and last weeks marked. In-progress and trainer-less
  sessions are reported (open · unattributed), never counted.
- **The read is one `createdAt` window per studio** (`sessions-range.ts`,
  `fetchSessionsInRange` — the same paged read Insights now uses),
  padded a day before and fourteen days after the month, because a past
  session logged later has a later `createdAt` than its date
  (`LATE_LOG_GRACE_DAYS`). The tally then files by the session's date.
- `hours.ts` is the pure half (11 tests); `AdminHoursTab` renders one
  studio, or a block per studio with the company total added from each
  block's report; a render test mounts it under the scope provider.
- Exports' "Trainer & payroll" CSV is **"Sessions by trainer"** (same
  columns, new file name); the totals live on Hours.

### 2 · One scope for every tab (`src/features/admin/scope.ts`, `scope-context.tsx`)

The audit's finding: the Studios tab listed the company to every leader,
Insights offered studios the reader could not read, and the Franchise
dashboard existed only because nothing else knew what "my studios" meant.
Now one control in the Operations shell — **Looking at: Solon · All my
studios** — that every tab reads.

- **"This studio" is the studio the app is in.** The roster, the schedule
  and today's sessions the tabs already stream follow it; picking a studio
  on the scope bar switches the app (`setActiveStudioId`), exactly as the
  header's picker does. One studio, one answer to "which studio am I
  looking at".
- **"All my studios" is the reader's list** (`operationsStudios`): the
  company tier every studio; the owner tier the studios that reach them
  (`ownerId`, `ownedStudioIds`, a network they own — the same union the
  old Franchise scope used); the studio tier the studios they run (the
  grant counts). Hours, Staff & Roles, Clients (an `in` clause, never the
  whole collection) and the Monday page span it. Insights, Machine fit,
  Renewals, the Delight queue and Exports read one studio at a time and
  say so, with the studios one tap away (`PickOneStudio`).
- The per-tab studio pickers are gone (Insights, Clients, Staff & Roles,
  Renewals, Hours); Routines lists readable studios and opens on the
  scope's. Tabs are keyed on the scope, so a switch remounts them clean.
- **The Franchise screen is folded in.** Under "All my studios" the Monday
  page is the network view (`features/admin/network/NetworkOverview`: the
  attention tiles and the locations, a location tappable to switch the
  app to it). `FranchiseDashboardView`, its bottom-nav button, its second
  team editor (`FranchiseTeamManagement`) and its second composer are
  deleted; `franchise/scope.ts` stays as the pure counts. The `View`
  union no longer has `franchise-dashboard`.
- **Studios is "All locations"** — the registry (create, delete,
  franchises, the Mindbody audit), the owner tier's and the company's. A
  studio's own record is My Studio → Studio.
- `useOperationsScope()` has a standalone fallback outside the provider,
  so a tab mounted alone (a test, a future screen) reads the app's studio.

### 3 · The Monday page (`src/features/admin/monday/`)

ARCHITECTURE §1.5, in AJ's order: **renewals and conversation status ·
attendance anomalies · performance discrepancies · pain and incidents.**
Each is a sentence with its proof, or "not enough data yet"; every row
opens the client. Today's floor is a strip of tiles at the top (the old
Overview's `overview.ts` stays for it; `AdminOverviewTab` is deleted). One
line each for the Delight queue, Insights (the 14-day observations),
Machine fit ("worth a look", through `useFitFloor`, the same plumbing the
Machine fit tab uses) and Hours this week opens the tab.

- **Renewals** — counted through the pipeline's own `laneOf` / `nextStep`
  from the roster's nightly snapshots, the studio's cycles and its
  settings; nothing is computed twice.
- **Attendance** — from the nightly job's pace and flags: a gap of twice
  the client's usual gap (at least a week) is a break; nothing is claimed
  about a rhythm not yet measured; away, lapsed and unknown are not
  anomalies.
- **Performance** — the watch document (below). Rows say the machine, the
  weight, the reps against the median, the day.
- **Pain and incidents** — the last week's Dial (a region at −2 in the last
  seven days of sessions), open `clinicalIncidents` for the studio, and
  live critical `journalEntries` (`CRITICAL_NOTE_DAYS = 21`, or its
  `effectiveUntil`). The critical notes need **one new composite index**:
  `journalEntries (studioId, importance, occurredAt desc)`.
- `monday.ts` is the pure half (9 tests); `MondayPage.tsx` reads its own
  14-day session window (`DAYS_READ`, anchored on today) plus the three
  own reads, with a render test over a studio's worth of answers.

**The performance watch** (`monday/performance.ts`, shared with the job):
performed, non-hold sets; the same weight (±0.5); the latest set within
14 days; at least five earlier sets at that weight; a drop of a third or
more against their median. Run by `server/machine-trends-job.ts` (step 7,
`performanceDrops`) over the window it already reads, and written per
studio to **`studios/{s}/watch/performance`** — `{version, studioId,
builtAt, windowStart, windowEnd, rows[{clientId, machineId, weight, reps,
medianReps, priorSets, day, drop}], clients}`, capped at 60 rows, no name,
no body data; an empty document is written when there is nothing to
watch, so "nothing" and "never ran" read differently. Rules: read by the
studio's people (`writesForStudio`), **written by nobody in the app**
(`allow write: if false`); one rules test. 6 tests on the rule, and the
job's test covers the step. `scripts/run-machine-trends.ts --commit`
writes it from the PC before the first Sunday.

### 4 · The Catalog (`src/features/admin/catalog/`)

- **The MSF standard set as a view** (`StandardSetPanel`). It was a switch
  per card in a long list; now it is the machines in the order a new floor
  starts in (`defaultOrder`, renumbered in tens on a move — `reorderPlan`
  writes only what changed), move up / move down, take one out (the house
  confirm), put one in from the catalog machines outside the set — and
  the sentence that matters on the panel itself: a floor adopts this set,
  nothing is pushed, and taking a machine out never removes it from a
  floor that has it. Administrators write; a franchise owner reads, and
  the creator no longer offers Edit / Retire / New machine to someone the
  rules will refuse (audit 7.1).
- **Submitted by studios** (`SubmissionsQueue`, administrators) — the other
  end of My Studio → Machines → "Offer to the MSF catalog". Each offer
  opens for a decision with the catalog id suggested from the name
  (`catalogIdFor`, unique against the catalog). **Publish** creates the
  catalog document from the submission's definition (`publishPlan`:
  active, outside the standard set, last in the order), marks the
  submission `published` with `publishedAs`, `decisionNote`, `decidedBy`,
  `decidedAt`, updates the studio's roster marker — and then shows the PC
  command that migrates the studio's own id onto the catalog id
  (`scripts/migrate-machine-id.ts --from sm-… --to m-…`, dry run first,
  then `--commit`), which is what makes the studio's history follow the
  machine. AJ chose the script over a Cloud Function (Sep 18). **Pass**
  marks it declined with a note the studio reads on its floor.
- `standard-set.ts` is the pure half (5 tests); `catalog.render.test.tsx`
  mounts the tab as an administrator (order, a move, a publish, a retire)
  and as a franchise owner.

### 5 · The Delight queue's row actions (`src/features/ford/DelightQueue.tsx`)

The audit's one finding about Delight was that it was the only Operations
tab with nothing to do on it — the owner and the status were set on the
client's Life section, so "Needs an owner" had no way to give it one. A
row now offers **Take it** (mine, planned), **Hand it to…** (the studio's
own people, by Auth uid), **Done** with what actually happened — the part
worth reading a year later — and **Pass**. Every write goes through
`setGestureStatus`, the same writer the client's record uses, so the
rollup on the client document follows. A one-off whose date has passed
files under **"Passed — still open"** at the top (the bucket was in the
type and could never show; `useDelightQueue` now gives passed one-offs a
negative `daysAway`). A switch shows what is done. Render test (4).

### 6 · The fix pile (audit D.7)

- The studio picker's "Go to Operations" no longer tests a **hard-coded
  e-mail**; it is `isStudioLeader`, the same gate as the menu. (The
  bootstrap in `useAuthInitialization` that creates an Admin profile for
  AJ's address when none exists is untouched — see Open.)
- Three destructive taps ask first, through the house `ConfirmDialog`:
  Routines' template delete; the Catalog's **Retire**, every time, with
  the count of floors that still have it (it used `window.confirm`, and
  only when the count was above zero — a zero or a failed count retired
  with no question); Announcements' **Take down**.
- **Insights** says "could not be loaded" on a refused or failed read
  instead of showing a quiet studio, and blanks the tiles.
- The **one-file legacy importer** is gone from Exports: it created
  clients by exact name with no home studio (invisible to every
  studio-scoped screen) and never raised `priorHistory.importedCount`.
  `useLegacyImport.ts` is deleted; the screen says what is coming instead.
- **Renewals' Settings view is gone from Operations**; the settings live
  on My Studio → Studio only. Operations → Renewals says how many Mindbody
  package names are waiting to be matched and opens My Studio there
  (`my-studio/section-memory.ts` — the section memory in its own module,
  so the admin chunk does not import the view).
- **Log past session writes `createdAt` as a server timestamp.** As an ISO
  string every backfilled session fell outside every `createdAt` range
  query — Insights, Hours, the Monday page — for good.
- `notificationSettings` stays in the `Studio` type, annotated: the audit
  had it as dead, but two backend readers gate on it (the booking-reminder
  queue in `functions/src/index.ts`, `server/cron-daily-reminders.ts`),
  dormant while nothing sets it true. A switch with no UI is a different
  thing from a dead field; nothing contacts anyone, so no editor is added.
- Verified already done: "Staff &amp; roles" (5.8), the approval cap (5.4,
  Round A), Announcements owners-and-admins only on Operations (the tab
  was already gated `isFranchiseOwnerOrAdmin`).

### 7 · Docs

This document; CLAUDE.md (where things are, the counts, the traps);
ARCHITECTURE (§2.5 rewritten, the data dictionary, the decision log);
`docs/business/roles-and-permissions.md` (the Operations scope);
`docs/business/renewals.md`, `packages-and-pricing.md`, `data-sources.md`
(the settings' new home); `docs/ops/TESTING-CHECKLIST.md` Round 11;
`ROADMAP.md`; `scripts/ship/ship-operations.ps1`.

## What did not change

- No Cloud Function and no Mindbody call changed. The weekly cron job
  gained a step (the watch document) — `server/machine-trends-job.ts` is a
  Render cron job, not a Cloud Function, and it already read the window
  it needs.
- One new document type, `studios/{s}/watch/{watchId}` (AJ chose it, Sep
  19); one new field, `studios/{id}.sessionMinutes`; the decision fields on
  `catalogSubmissions` (`publishedAs`, `decisionNote`, `decidedBy`,
  `decidedAt`), which Round A's rules already allow administrators to
  write; `machines/{id}.defaultOrder` and `inStandardSet` were there.
- The rules gain one `match` (the watch document, read-only for the
  studio's people) and lose nothing. One new composite index.
- Nothing pings anyone.

## Needs, in order

1. `firebase deploy --only firestore:indexes` — the `journalEntries`
   index for the Monday page's critical notes. Until it is built, that
   one read fails and the pain question says "part of this could not be
   read just now"; nothing else waits on it.
2. `npm run test:rules` — Round A's ten tests, this round's one, and the
   105 before them. If it fails, stop and send the output.
3. `firebase deploy --only firestore:rules` — the rules only add access.
4. The app (`git push origin master` once the branch is merged and beta
   prep says so).
5. `npx tsx scripts/run-machine-trends.ts --commit` from the PC — writes
   the first watch documents so the Monday page has something before the
   first Sunday. Until it runs the page says the weekly read has not run
   yet, which is the truth.

## Verification (cloud clone, Sep 19)

`npx tsc --noEmit` **11** errors (= master's baseline). `TZ=America/New_York
npx vitest run src` **3,372 tests in 220 files** (was 3,323 in 210 after
Round A): `hours.test.ts` (11), `scope.test.ts`, `monday.test.ts` (9),
`performance.test.ts` (6), `standard-set.test.ts` (5), the weekly job's
watch step, the rules test, and six render suites (Hours, the Monday page,
the network Overview switching scope, the Catalog, the Delight queue, plus
the existing Machine fit suite under the scope fallback). `npx vite build`
clean. `git ls-files | tr A-Z a-z | sort | uniq -d` prints nothing.

## Traps for the next person

- **"This studio" on Operations is the app's active studio.** Every tab
  streams from it; the scope bar's studio pick calls `setActiveStudioId`.
  Don't add a per-tab studio picker back — under "All my studios" a
  one-studio tab renders `<PickOneStudio what=… />`.
- **`operationsStudios(trainer, studios, networks, isAdmin)` is the one
  answer to "which studios may this reader look at from Operations".**
  It is a superset of `queryStudioIds` for owners (ownership counts, not
  just membership) and it counts the grant. `useOperationsScope()` outside
  the provider returns the standalone fallback (the app's studio), never
  throws.
- **The watch document is written by the job only** — `allow write: if
  false`. A screen that wants a different rule changes `performance.ts`
  (shared, imported with `.ts` extensions so esbuild and vitest agree) and
  reruns the job; it never writes the document from the app.
- **Hours counts booked slots.** `sessionMinutesOf(studio)` is the one
  reader of `sessionMinutes`; the stopwatch is "measured" and stays a
  separate column. A session with no `trainerId` is unattributed, an
  in-progress one is open — both reported, neither counted.
- **`fetchSessionsInRange` pads its window; the tally files by date.** A
  reader that wants a month's sessions asks for the padded `createdAt`
  window (`queryWindowForMonth`) and then filters by the session's `date`,
  or it loses the past sessions logged late. And **`createdAt` must be a
  Timestamp** — an ISO string never matches the range (the backfill bug
  fixed this round).
- **The standard set is `inStandardSet` + `defaultOrder`, renumbered in
  tens on a move.** `standardSet(catalog)` is the one reader (active
  machines only). A publish puts the new machine outside the set, last.
- **Publishing a submission is two things**: the app's Publish (the catalog
  document, the decision, the roster marker) and the PC's id migration.
  Until `scripts/migrate-machine-id.ts --commit` runs, the studio's floor
  still shows its own copy under its own id; the queue says so.
- **Delight's row actions go through `setGestureStatus`** and the owner is
  the Auth uid (`me.id`, `staff[].id = t.authUid ?? t.id`), because the
  rules and the client's record pin the owner to the signed-in person.
  A passed one-off has a negative `daysAway`; an annual date never does
  (`nextOccurrence` rolls it forward).
- **The section of My Studio is `my-studio/section-memory.ts`.** Another
  screen sending someone there calls `rememberMyStudioSection(...)` then
  switches the view; importing `MyStudioView` for that would drag the
  whole My Studio bundle into the caller's chunk.
- **`AdminDashboardView` is wrapped in `OperationsScopeProvider`**, and the
  tabs are keyed on `scopeKey(ops.scope)`. A tab that keeps state across a
  scope switch has to opt out of the key deliberately.

## Open

- **The payroll export** — who runs it and how often (audit §G). Hours
  answers the operations question; the CSV is still "Sessions by trainer".
- **The bootstrap in `useAuthInitialization`** still names AJ's address:
  it creates an Admin profile when the signed-in account has none at all.
  Harmless while the profile exists; AJ decides whether it goes.
- **Still open, needs AJ's OK:** any trainer at any studio can create and
  update another studio's `taskInstances` and `taskRequests`.
- The Monday page's attendance question reads the nightly snapshot; a
  client whose rhythm the job has not measured yet is simply not claimed.
  A studio's first weeks on Journey will show few anomalies — correct,
  and worth saying on the iPad walkthrough.
