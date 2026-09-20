# The Operations overhaul — Sep 19 2026

Branch `operations-overhaul`, off `master` at `dbc0714`. Nine phase commits,
one per phase, each typechecked and tested on its own so any phase can be
reverted alone (plus one line that corrects the counts here and in the ship
script). Not pushed; not deployed. The brief is AJ's *Operations
Dashboard Overhaul — Build Brief* (Sep 19), read with what he added in
conversation the same day:

> The studio leader needs to know of all the things that could possibly be
> bad for retention coming up, and also be looking for ways they can improve
> the community in their studio, and know what's going on with their
> trainers. Their overview needs to be: hey, this is what's going on at your
> studio right now — do you want to dive into these notes, or these
> renewals, or these events? A lot of the studio leaders really only can
> handle so much on their plate, so they're really only looking the next
> three days in advance. This is where actual studio leaders can sit down
> and take time on it — they might even be looking at this on a computer.

This is an overhaul, not a patch. The Monday page built the day before
answered four questions well; it was not shaped around time, nothing on it
could be acted on, there was no changes list, notes had no lifespan, and the
sidebar still carried seventeen tabs.

## The four calls AJ made before the build (Sep 19)

1. **The data changes — yes, all of it.** Additive stamps on bookings
   written by the pull-sync; two new per-studio collections (the watchlist
   and acknowledgements); lifespan fields on notes; the indexes. The webhook
   Cloud Function stays untouched until its own OK.
2. **The Floor tab looks AND edits.** Asked whether Operations → Floor
   should only look (My Studio → Machines already edits the floor), AJ
   chose look and edit — so the SAME floor editor is mounted in both places.
   One implementation, two doors, never a second editor.
3. **Team this week: workload and follow-through.** Sessions, unlogged,
   clients, hours — the things a leader chases today. Outcomes stay on
   Insights. Never ranked.
4. **The changes list is Operations-only for now.** Trainers cannot open
   Operations; they hear from the leader until a trainer-side door is
   decided.

## The design

**Three depths on one screen.** (1) A ten-second read: today's numbers,
with *never logged* as the loud one, and a *Needs you* strip that counts
every action waiting on the page. (2) Panels — each a headline sentence
with its proof, the top rows, an inline action and a door. (3) The deep
dives: the nine tabs, plus two views of the Overview's own — **Changes**
(the week's cancellations and moves, day by day) and the **Attendance
watch** (the whole list, the snoozed, the dismissed, who is back).

On a desk the panels sit in two columns — *act today* on the left (Changes
today · Pain and critical notes · Attendance watch · Strength dropped),
*look ahead* on the right (The next three days · Renewals · Moments this
week · Team this week); on a portrait iPad they stack in reading order.
Panels fold to their sentence, remembered per device. The shell widened to
88rem for the desk.

**Added beyond the brief** (said in advance; AJ did not object): the next
three days *with bookings* (a closed Sunday is skipped); Moments — the
Delight queue folded with dates pinned to a day and milestones (100th
session, a year with the studio — never off a low Journey count during
migration); Team this week; the back-again row for a dismissed client who
books again; the 60-day note review as a dialog.

## What was built, phase by phase

### 1 · The change stamps (`src/lib/mindbody-api-sync.ts`, `src/features/admin/changes/changes.ts`)

The pull-sync already noticed a moved or cancelled booking (`hasChanged`)
and overwrote the old state with no record of it. `changeStamps` now
writes: `movedFromDay` / `movedFromStart` / `movedAt` on a move;
`cancelledAt` / `cancelSource` (`"mindbody"` when its answer said
cancelled, `"sweep"` when it vanished from the answer) on a cancellation;
both cleared when a cancelled booking comes back as Scheduled. Additive
fields only; four new sync tests.

`changes.ts` is the pure list, on AJ's rules: a cancellation is held
against **the day the session was for** (a Wednesday cancellation of
Friday's session waits in Friday's list; a moved booking belongs to the day
it left), and a cancellation is read as a **reschedule when the client
holds another booking that Monday-to-Sunday week** ("clients always do one
or two sessions per week"), naming where it moved to. The calendar hides a
cancelled row entirely; the list is where it is recorded. One new index:
`schedules (studioId, movedFromDay)`.

### 2 · The watchlist and acknowledgements (`src/features/admin/attention/`)

What a leader has done about a row, kept beside the studio, never on the
client's record or the trainer's note:

- `studios/{s}/watchlist/{clientId}` — **snooze** ("remind me again in 3
  days / a week / 2 weeks / on this day") or **dismiss** ("I know why they
  are out"), written by whoever runs the studio; the dismissal remembers
  the snapshot's last visit and next booking on the day, so a booking
  already on the books is not "back". A dismissed client who books or
  visits since surfaces once as **Back**; Got it deletes the disposition.
- `studios/{s}/acknowledgements/{kind:id}` — who saw an incident, a
  critical note or a pain report, and when. One document per source, so a
  NEW incident on the same client surfaces again; a row is acknowledged
  when every one of its keys is; **Acknowledge all** is one batch. Anyone
  who works at the studio may acknowledge (AJ: visible to anyone who can
  open the Overview, not leadership only), only as themselves; nothing is
  ever deleted.

Rules for both, two rules tests (`tests/firestore.rules.test.ts`, at the
end), the pure module with its tests, two live streams.

### 3 · When a note matters (`src/features/client-notes/mattering.ts`)

Every note has a mattering window in one of three shapes, on the fields the
entry already carried plus one (`repeat`), and `reviewedAt`:

| Shape | Behaviour | Default |
| --- | --- | --- |
| **Always** | matters until someone marks it as no longer mattering (`resolvedAt`); `effectiveFrom` may push the start ahead | a critical note |
| **From – until** | `effectiveFrom` (blank = the day it was written) to `effectiveUntil` | |
| **Only on a day** | from and until on one day; `repeat: "yearly"` brings it back — birthdays, anniversaries | |

`mattersOn(entry, day)` is the one answer to "does this note matter
today": the briefing's critical strip and heads-up rows, the Overview's
pain-and-notes panel and its Moments all ask it. The composer's "Matters
until" became the **mattering picker** (`MatteringPicker.tsx`), offered for
any Heads up or Critical note; a plain note can be pinned to a date. The
**60-day review**: an ALWAYS note that has mattered 60 days since it
started or was last reviewed surfaces on the Overview — Still matters
(stamps `reviewedAt`, the clock restarts) or No longer (resolves) — it does
not silently drop. The note card says its window in one line.

Two friction fixes from the brief: a **Note** button on the client's
header opens the composer over any tab (`QuickNoteDialog`), and **Notes
sits above the profile** on Notes & Profile (`DOSSIER_SECTIONS` order,
the rail follows).

### 4 · The Overview (`src/features/admin/overview/`)

The folder is renamed `monday/` → `overview/` (`floor.ts`, `questions.ts`,
`performance.ts` keep their jobs; `performance.ts` is still shared with the
Sunday job). New pure modules, each with tests: `today.ts` (the tiles, the
chase list), `moments.ts`, `next-days.ts` (plus *not booked ahead* from the
nightly `no-future-booking` flag), `team.ts`. `questions.ts` gains
acknowledgement keys on pain rows, the mattering rule on critical notes
(the 21-day fallback is gone), and `notesToReview`. `useWeekSchedule`
(`changes/`) is the page's own live read — today and six days, cancellations
included, moved-from rows joined; `useOverviewReads` adds the dated notes
(one new index: `journalEntries (studioId, effectiveUntil)`).
`ChangesView` and `AttendanceWatchView` are the two drill-downs;
`ReviewNotesDialog` the review. The render test mounts the page over a
week of bookings and presses Acknowledge all, Snooze, the chase tile, the
two views and a fold.

### 5 · Nine tabs, down from seventeen (`src/features/admin/AdminDashboardView.tsx`)

**Overview · Renewals · Delight queue · Floor · Staff & Roles · Insights ·
Announcements · Mindbody · Data**, in four groups: Every day, Clients,
Studio, Behind the scenes.

- **Floor** (`floor/AdminFloorTab.tsx`): Machines (My Studio's
  `MachinesSection`, which now answers who leads without the Relay shell —
  `useRelayMaybe` + `leadsHere`) · Machine fit · Routines, on one segmented
  control. The Overview's Machine fit line lands on the fit view.
- **Insights** absorbs Hours (`insights/InsightsAndHours.tsx`).
- **Clients** is gone (`admin/clients/` deleted — the global search and the
  training dashboard cover it). **Exports** is **Data**.
- **Mindbody** opens to every leader, scoped to their own studio (`company`
  prop off: no estate tiles, no studios list, the selected studio pinned);
  administrators keep the estate.
- **Staff & Roles** and **Announcements** open to whoever can open
  Operations; the announcement audiences follow the tier (studio · owner
  adds network · administrators everything).
- A render test mounts the shell as a leader and as an administrator and
  opens every studio-side tab.

### 6 · The Admins dashboard (`src/features/admins/`)

**All locations · Catalog · Standard template · Limbo · System tools · Bug
reports · Data**, each the screen it was on Operations, moved not
rewritten. The **Standard template** is the standard set beside the company
routines — the two things a new studio adopts in one step; the **Catalog**
is what exists (every machine, the studios' submissions). **Data** is
scoped by who is viewing: an administrator picks any studio here, a studio
exports its own on Operations. Reached from the third position on the
app-mode switch — **Trainer · Operations · Admin** — and a second
bottom-bar button, administrators and the founder only (`isAdmin`); anyone
else is refused in words. The view id is `admins-dashboard`.

### 7 · Loose ends

The renewal setting behind the attendance watch reads *"Warn me when a
client has not visited for (days)"* — AJ's sentence, on My Studio → Studio
where the number is set. The catalog render test mounts the Standard
template for the standard-set cases; the settings-form test reads the new
label; the bare-palette budget goes 258 → 259 for the Admin bottom-bar
button (orange like Operations' beside it).

### 8 · Docs

This document; CLAUDE.md; the admin kit README's tab table; the Overview
README; KNOWN-TRAPS (baselines, three traps); the testing checklist's Round
13; ARCHITECTURE (screen map, data dictionary, decision log);
roles-and-permissions (the Admins dashboard); the index and the changelog;
ROADMAP; `scripts/ship/ship-overhaul.ps1`.

### 9 · Seen in the harness

The screenshots (see Verification) caught three things: rows said *Now /
Soon / Note* where the row's own word was better — Changes rows now say
**Cancelled** or **Moved**, unbooked rows **Not booked**, Moments **No
owner · Gesture · Date · Milestone** (`OverviewRow.badge`, the tone word as
the fallback); pressing **Overview** in the sidebar while inside Changes or
the Attendance watch did nothing — the shell now bumps a `homeSignal` and
the page comes home; and today's five tiles wrapped 4 + 1 on an iPad — the
today block lets them sit five across where there is room.

## What the Overview refuses to say

- Nothing about a client's rhythm until the nightly job has measured one;
  a client with no pace gets the studio's plain break rule, and the proof
  says so.
- Nothing about a milestone off an unknown history ("N so far, earlier
  sessions counted from the record" when the count is partial).
- Nothing about performance until the Sunday job has written a document.
- A failed read says so and never counts as zero — the tiles, the changes
  list and the panels each say when they are missing rather than empty.
- A cancelled row with no stamp (the webhook's, or before the round) is
  still a cancellation for its day; the list just cannot say when it was
  noticed.

## Decisions taken under creative control (say if any is wrong)

- The Needs-you strip counts rows, not people: two pain rows on one client
  are two things to acknowledge.
- Pain acknowledgement keys: `incident:{id}`, `note:{id}`,
  `pain:{clientId}:{latestDay}` — a new day's pain re-surfaces after the
  last was acknowledged.
- The next three days are the next three WITH bookings, filled from the
  calendar when the schedule ahead is thin.
- Milestones: 50, 100, 150, 200, 250, 300, 400, 500, 750, 1000, 1500,
  2000 sessions; whole years with the studio from a Mindbody-backed first
  date (a Journey `createdAt` is not a business date).
- Panels fold per device in `localStorage`
  (`journey.operations.overview.folded`), never in Firestore.
- The Admins dashboard folder is `features/admins/` beside `features/admin/`
  (which is Operations, a historical name). Renaming `admin/` →
  `operations/` is a later, mechanical round.
- The `AdminMachinesTab` (the master catalog) keeps its name.

## Open

- **The webhook does not stamp.** A cancellation it delivers shows on the
  list without a time. Adding `cancelledAt` there is a Cloud Functions
  change — AJ's explicit OK when he wants it.
- **Trainers and the changes list** — Operations-only for now; a door on
  My Studio → Relay's Floor tab or the Hub when he chooses.
- **Data** — "to be workshopped later" (AJ). Renamed and scoped; the detail
  is his.
- **The Overview under "All my studios"** is still the network view;
  multi-studio is explicitly out of scope.
- Who runs the payroll export, and how often (carried from the audit).

## Verification

Cloud: typecheck **11** (= baseline), **3,469** tests in 232 files (one
skipped) at `TZ=America/New_York`, a clean build, no case-colliding file
names. The Overview, its two views, the chase list and the snooze chooser,
and the Admins dashboard were rendered and screenshotted in a throwaway
harness (gitignored `harness/`, a fake Firestore answering with a studio's
worth of data) at 1440×900 and on a portrait and a landscape iPad, light and
dark — which is what caught the badge words and the fifth tile. The rules
tests run on AJ's PC (`ship-overhaul.ps1 check`) — that run is the one that
counts. Not yet seen on a real iPad or desk.

## How to ship

```
powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-overhaul.ps1 check
powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-overhaul.ps1 golive
```

`golive` deploys the two indexes, then the rules (they only add access),
then fast-forwards `master` and pushes (Render deploys). Then Round 13 of
`docs/ops/TESTING-CHECKLIST.md`.
