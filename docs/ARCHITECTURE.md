# Journey System — App Architecture & Roadmap

**Draft 3 · September 13, 2026 · maintained by AJ with Claude**

This is the master reference for what Journey is, what it is not, how it is put together, and what comes next. Every proposal, round document and code review should point here rather than restate it. When this document and the code disagree, one of them is wrong — fix whichever it is, and note the date.

**How each section was produced.** Section 1 is AJ's decisions, recorded in his words on Sep 12 2026 — it is the part of this document that is *agreed*. Sections 2, 3 and 4 were **derived by reading the source** on Sep 12 2026 (the staged copy of `master`); they describe what the code actually does today, including the places where it contradicts Section 1, and they are **awaiting AJ's review** (Stages 2–4 of the State of the Union). Section 5 is the roadmap that falls out of the other four. Anything marked *proposal* is Claude's recommendation, not yet decided. Appendix C is the dated decision log — the nine questions Draft 1 left open were answered the same evening, and the eight that Draft 2 opened were answered later that night; Draft 3 records those answers and the floor round they unblocked (`docs/rounds/2026-09-12-floor-round.md`).

**Where the other documents fit.** `CLAUDE.md` holds the working rules and known traps; `docs/business/` holds the business rules that cannot be read out of the source; each `src/features/<name>/README.md` holds that feature's decisions; `ROADMAP.md` becomes the short living plan (see §4.6). This document is the map that ties them together.

---

> **Freshness, Sep 21 2026.** Sections 2–4 were derived from source on Sep 12
> and are marked "review pending" below; the numbers in them were re-counted on
> Sep 21 and corrected in place, but the *prose* still describes Sep 12. Where
> this document and `CLAUDE.md` disagree, `CLAUDE.md` is newer. Reconciling
> §2–§4 with what is built is item 4 under **Now** in `ROADMAP.md`.
>
> **New to the project? Read `docs/START-HERE.md` first** — it is the fifteen-
> minute version of this document, written for a non-programmer.

## Contents

1. [Purpose and scope — agreed](#1-purpose-and-scope--agreed-sep-12-2026)
2. [Screen map — derived from source](#2-screen-map--derived-from-source-review-pending)
3. [Data model — derived from source](#3-data-model--derived-from-source-review-pending)
4. [Codebase organization and the standard operating procedure](#4-codebase-organization--derived-and-proposed)
5. [Roadmap — the current stage versus what comes later](#5-roadmap--current-stage-versus-later)
- [Appendix A — Numbers as of Sep 12 2026](#appendix-a--numbers-as-of-sep-12-2026)
- [Appendix B — How to keep this document true](#appendix-b--how-to-keep-this-document-true)
- [Appendix C — Decision log](#appendix-c--decision-log)

---

## 1. Purpose and scope — agreed Sep 12 2026

### 1.1 What Journey is

Journey is the coaching system for **Max Strength Fitness** studios. Trainers ("Life Transformers") coach clients one-to-one in twenty-minute high-intensity sessions on machines, on the gym floor, from an iPad. Journey is where the trainer sees what the client needs to do, records what actually happened — load, reps, time under tension, how well the set was performed, what the machine was set to — and leaves the notes the next trainer will need. Studio Leaders and Head Trainers run the studio from the same app: they see every client's progress, every trainer's input, and the handful of things that decide whether a client stays.

Journey replaces the Claris FileMaker system the studios use today. It syncs people, bookings and contracts from **Mindbody**, which stays the system of record for anything commercial. Journey owns the coaching data.

The reason it exists, in AJ's words: sessions are one-to-one, so no single trainer ever sees the whole picture — Journey is what gives the head trainer and studio leader "supreme knowledge across the whole team", and it lets the studio go "beyond just putting weight and reps on a day tracker."

### 1.2 Who uses it — and who does not

| Who | What they do in Journey |
| --- | --- |
| **Life Transformer** (a trainer) | Runs sessions on the floor; keeps client routines, machine settings and notes; keeps a Kaizen Roster of clients to watch; does off-floor work in shift gaps |
| **Studio Leader / Head Trainer** | Everything a trainer does, plus the Operations dashboard for their studio: renewals, staff, machines, insights. Some studio leaders do not train |
| **Franchise Owner** | Owns one to three studios; must see only their own studios' data (see §1.8) |
| **Founder / Overseer** and **System Administrator** | Company-wide oversight; the administrator runs the app itself |
| **Clients** | **Are not users.** Clients never log in. The only client-facing outputs are the printed or emailed 90-day check-in and the progress report. Everything Journey knows about a client exists so a trainer can coach them better and a leader can keep them |

The role vocabulary and what each role reaches today is in `docs/business/roles-and-permissions.md`. Do not reword role labels on screen.

### 1.3 The north-star test

Every screen, and every feature request, is judged by one two-part test:

> **Flawless continuity.** Any trainer can pick up an iPad, open any client at their studio, see exactly what that client needs to do today, and run the session perfectly — using only what is in the app.
>
> **Ruthless adaptability.** The app never forces the trainer down a rigid path. If a machine is occupied, if the client arrived late, if today is a form-practice day, the trainer pivots on the fly — a different machine, a different order, no data on a set — and the app's tracking follows without breaking.

A screen that gives continuity but fights the trainer fails. A screen that is flexible but leaves the next trainer guessing fails. Both halves, always.

### 1.4 The floor loop — ranked, timed, and what "flawless" means at each step

This is the strict hierarchy of where Journey must be flawless versus merely useful. It decides where polish, testing and iPad time go first.

| Rank | Moment | Time budget | What must be true | Screens today (§2) |
| --- | --- | --- | --- | --- |
| **1** | **During the set — the floor** | A few taps per set. The trainer's eyes are on the client, not the iPad | Intuitive, nothing clunky, nothing hidden. **Instant on-the-fly machine switching** — occupied machine, changed order, an added machine — without breaking tracking. A set may be **practice** (form, blood flow, recovery) or **skipped**, and the app accepts either without hard-blocking (§1.6). "We aren't just taking clients through the motions; we are delivering the best experience possible" | Active Session (`workouts`): the Journey Grid live column and the Now bar |
| **2** | **Post-session teardown** | ~30 seconds | Instant, scannable results — "8% increase today". All the client's machines visible, with the option to dive back into history if there is time and a question. **"Finish Session" saves the core data immediately.** Feel and notes are **append-only** afterwards and **never block opening the next client** | The post-session screen (`VictoryHUDScreen`), then the Hub |
| **3** | **Pre-session briefing** | 1–5 minutes of review, 1–2 minutes of conversation | Injuries, critical notes and today's routine highlighted instantly. Needs a **faster marker for "progress / regress the weight"** — the current star and kaizen symbols take too much mental friction to read at a glance, and it is not obvious that this is what you are doing during a session | Briefing (`BriefingScreen`), the client profile's Journey grid |
| **4** | **Off-floor operations** | 10 minutes to 3 hours, in shift gaps | The heavy lifting: 90-day check-ins, Kaizen Rosters, delayed post-session notes, renewal planning. Rich data visualisation; floor-loop speed is not required | Client profile tabs, Planner, Learning, Operations dashboard |

### 1.5 The leader's Monday-morning questions

What a Studio Leader must be able to answer without asking a single trainer, in priority order. Because leaders only ever see what trainers type, this list is also the list of what the app must make effortless to capture.

1. **Upcoming renewals and conversation status** — the highest business priority. Who is up for renewal, and has a trainer started the conversation?
2. **Attendance anomalies** — automatic flags for clients on an extended break or training at an erratic frequency.
3. **Performance discrepancies** — a client who drops from ten reps to five unexpectedly is seen immediately.
4. **Pain and incident reports** — instant visibility of any reported injury.

Built as **the Monday page** — Operations' first tab — in the Operations round (Sep 19 2026): the four questions in this order, each a sentence with its proof or "not enough data yet", every row opening the client. Question 3 is answered by the weekly machine-trends job, which writes a per-studio watch document the page reads (`docs/rounds/2026-09-19-operations.md`). **The same day it became the Overview** (`src/features/admin/overview/`, `docs/rounds/2026-09-19-operations-overhaul.md`) — AJ: "not the Monday page, studio management opens this every day" — shaped around time rather than the four questions: today (with *never logged* as the loud number), what needs you, the next three days, the week. The four questions are still on it, each with an action now (Acknowledge, Snooze, Dismiss, Got it), beside Changes today, the next three days, Moments and Team this week.

**The anti-blocker rule.** Journey does **not** track "which trainers aren't writing notes." A veteran client with perfect form needs no note. The app must **never block a trainer from saving a session because a data point is missing**, and skipping data entry must be effortless. A final "are you sure you want to continue without X?" is acceptable; a wall is not. (§2.8 lists where the code breaks this rule today.)

### 1.6 What we are replacing, and what to keep from it

FileMaker was "one big ugly Excel-looking thing", but it had real strengths, and the cutover is judged against them:

- **Eleven days of sessions and every machine performed, on one screen.** Journey's grid fixed the look; it must keep the density. The client profile's Journey grid is the direct heir (the redesign brief asks for ≥20 machines vertically and 14 sessions across, strict minimum 10).
- **Routine generation.** The current routine creator works. Admins must be able to author global and per-studio templates (FileMaker's A/B routines), and trainers must actually be able to use them.
- **The "blank cell" reality — decided Sep 12 2026: four states.** In the old app trainers typed 0, X, "no" or even emojis into a cell; Journey must know conclusively what a cell means, so every planned machine in a session ends in exactly one of four states, stored explicitly:
  1. **Performed** — a standard set to failure. Counts toward every average and toward progression.
  2. **Practice** — the client got on the machine for form, blood flow or recovery. The data (load, reps, time) is **recorded for history but excluded from progression averages**, and a practice set can be **linked to the pain map**, so the record shows what was done to help a specific area. When a client is injured the goal is to keep them training and work around it, not to stop, unless it is too serious. (Name confirmed Sep 12 2026 — *Practice*, because the data is tracked.)
  3. **Skipped** — explicitly bypassed today, for a specific reason (an injury, most often). The **reason is recorded** from a fixed vocabulary — *pain or injury* (with the body area), *machine occupied*, *out of service*, *client declined or fatigued*, *trainer's call*, *other* — and over time the reasons themselves become data: why machines get skipped. **When a machine is swapped for a substitute, the original is recorded as skipped with its reason, not simply removed** — we want the data on why the routine changed (decided Sep 12 2026).
  4. **Not reached** — the session ran out of time before this machine. **Never asked of the trainer** (confirmed Sep 12 2026); derived silently when the session finishes. Leaders and head trainers read the clues around it — how long the trainer spent on each machine, whether the client arrived late, whether the trainer worked on form — rather than the trainer being made to explain.
  Only *Performed* feeds averages, progression, rollups and rep-quality tallies. The data design is in §3.8 and the code is `src/lib/set-outcome.ts` (built in the floor round, Sep 12–13). FileMaker's 0 / X / no / emoji / blank cells import as *Skipped* with the reason *unknown (FileMaker)* unless the row carries a count — **decided Sep 12 2026**; `importedOutcome()` is the one function an importer calls.
- **Granular, machine-specific notes** attached to a specific set, with that machine's history at a glance. The current set ranking and note-taking handle this well — keep it.
- **Non-linear execution.** Present the planned routine, but let the trainer tap and activate any machine in any order, and track the chronological order actually performed. (`sessions.sessionMachineIds` already records the sequence performed; see §2.4.)

### 1.7 Scope fences

| Area | Decision |
| --- | --- |
| **Mindbody** (people, bookings, contracts, payments) | Out of scope to *manage*. Journey **reads** it — including whether a client has a next session booked — and never writes to it |
| **Client logins or a client portal** | Out of scope |
| **Automated client outreach** (email, SMS, push) | Out of scope. Nothing in Journey contacts a client or a trainer |
| **Wearables** | Out of scope |
| **AI coaching** | Out of scope |
| **Nutrition** | No tracking. *Nuance:* the check-in already records basic self-reported metrics (protein, hydration), so the database must accommodate basic assessment data — nothing more |
| **Companies other than MSF** | Out of scope. Journey is built for one franchise |

Anything on this list is a "no" by default. Reopening a fence is a Section 1 change, dated and initialled.

### 1.8 Tenant scope — what "multi-tenant" means for Journey

MSF is **three corporate locations plus individual franchisees owning one to three studios each**. The tenant abstraction has one job: **securely partition data between franchise owners so each sees only their own studios' data**. Studio Leaders see their studio; corporate roles see everything.

*Finding (§3.4):* the Firestore rules today treat a Franchise Owner as a company-wide role — nothing limits them to the studios in their network. The partition exists only as a screen-side convenience. *Decided Sep 12 2026:* the design is the cheap one — cache `networkIds` and `ownedStudioIds` on the trainer document, maintained by the admin screens, so a rule costs one read. *Timing, decided later the same day:* beta is a **phased rollout that includes select franchisees alongside the corporate studios**, so the partition rules are built **before beta — Gate B** (§5.3), not at Gate C. The three deferred write holes (§5.4) still wait for Gate C; the partition is the one security item that moved up, because a franchisee on the app is exactly the case it exists for.

### 1.9 Feature tiers — the feature-creep control

Every existing feature sits in one tier. A feature's tier decides whether it can gate beta, where iPad time goes, and what may be frozen.

| Tier | Meaning | Features |
| --- | --- | --- |
| **Core — must-have for beta** | Beta does not start until these pass the north-star test on the iPad. New work here outranks everything | Weight/rep logging; rep quality and kaizen marks; time under tension (TUT); the Journal and 4 P's focuses |
| **Valuable — keep, non-blocking** | Ships with beta if ready; never delays it; must never get in the way of Core on the floor | Pre/post-session check-ins; the 90-day check-in (subjective report); InBody scan entry; Kaizen Roster; clinical review; renewals tracking; pain mapping |
| **Working, lower value** | Already built and working; kept; receives no new investment until Core and Valuable are done | Learning / MSF Academy; the Hub playbook; complex AI insights |

A feature request that is not on this table is answered with three questions: which tier, which floor-loop rank, and which fence does it touch? Only then does it get an estimate.

### 1.10 Vocabulary decisions

| Say this | Not this | Notes |
| --- | --- | --- |
| **check-in** | 90-day progress report, assessment, subjective report | One name from now on — and it is a **perpetual** check-in: a **living record per client** where any answer can be updated from the profile, the briefing, in-session or post-session, with the 90-day report a snapshot of it (decided Sep 12 2026 — option (a) in §3.8). In code it is still `progressReports` (with `isCheckInOnly`), `features/subjective-report` and `features/progress-report` until the check-in round; screen labels change with that round, collection names do not |
| **FORD** | — | Family, Occupation, Recreation, Dreams — the personal details a trainer learns and the studio uses to keep the client (decided Sep 12 2026; design in §3.8) |
| **Practice · Skipped · Not reached** | N/A, blank, 0, X | The four set outcomes (§1.6) |
| Life Transformer | trainer (on screen) | Company vocabulary; internal docs may say "trainer" |
| Hub | To-Do, dashboard | The trainer's home screen (`clients` view) |
| Planner | To-Do, Command (suggested Sep 16, not adopted) | Studio · My tasks · Notes · Team (`studio-tasks` view) |
| My Studio | Relay (the tab's name Sep 16–18) | The bottom-bar tab since Sep 18: Relay · Machines · Team · Studio — "My Studio is where you run the studio; Operations is where you look at it" (`docs/rounds/2026-09-19-my-studio.md`) |
| Team job | project, group task | One piece of work several people share, with parts and a due day (`studios/{s}/teamJobs`) — not a studio task (those reset daily) |
| Operations dashboard | Admin dashboard | `admin-dashboard` view |
| Learning | Catalog + Academy | One tab, two sections plus the studio's own pages |
| Journey Grid | the chart, the table | The machine-by-session grid, historical and live |

The rest of the studio vocabulary is in `docs/business/glossary.md`.

### 1.11 Product invariants — the rules that follow from the above

These are the rules a code review checks against. They are consequences of §1.3–1.9, written so nobody has to re-derive them.

1. **Eyes on the client.** During a set the app asks for a few taps at most; anything more belongs after the session or off the floor.
2. **Never block a save.** No missing data point stops a session from being finished. Confirm, never wall. (Applies to End Session, notes, check-ins, machine settings.)
3. **Mid-session changes are temporary.** Order, count and choice of machines during a session never write back to the client's routine. Permanent routine changes happen only on the client profile.
4. **Every planned machine ends in one of four explicit states** — performed, practice, skipped (with a reason), or not reached — and only *performed* counts toward averages, progression and rep-quality tallies. Not reached is derived, never prompted. *(Decided Sep 12 2026 — §1.6, §3.8; in code since the floor round: read an outcome only through `outcomeOf()` / `isPerformedLog()` in `src/lib/set-outcome.ts`, never off the field.)*
5. **Finish Session saves the core first.** Feel, notes and check-ins are appended afterwards and never delay the next client.
6. **Sentences, not scores.** Every claim a leader's screen makes has a named minimum sample; below it the screen says "not enough data yet". A confident wrong number is worse than a missing one.
7. **Clients are never contacted by the app.** In-app only, always.
8. **Mindbody owns identity and money; Journey owns coaching.** A client document's id *is* the Mindbody client id. Journey never matches people by name and never invents a Mindbody-owned date.
9. **A client is never more visible than their studio.** Health data (InBody, incidents) is never more visible than the client.
10. **A franchise owner sees only their own studios.** *(Not yet enforced — §3.4, §5.)*
11. **Nothing ships unreachable.** A screen or feature that nothing navigates to is deleted or connected in the same round it is found.

---
## 2. Screen map — derived from source (review pending)

*Read on Sep 12 2026 from `src/AppContent.tsx`, `src/types.ts`, the four largest screen files, the hooks, and the feature READMEs. Collections named from a README rather than from code are marked "(per README)". Line numbers are from that day's `master` and will drift; the file and function names will not.*

### 2.1 How navigation works

Journey has **no router**. One React state, `currentView` in `AppContent.tsx` (`useState<View>("clients")`), decides which screen renders; the `View` union in `src/types.ts` lists the legal values. The URL is consulted only twice: `?view=trainer-hub` (admins) and `?classic-todo` (the old To-Do screen). A second state, `appMode` (`"trainer"` | `"admin"`), swaps the bottom navigation.

Before the shell renders, `AppContent` returns early in this order: not signed in → the login page (Google / Microsoft); signed in but no `trainers/{uid}` profile → `AccessRequestView`; no active studio → `StudioSelectionView` (which also pins a default studio per device in `localStorage`); a new-client onboarding in progress → `CreateClientModal` full-screen.

**The shell** wraps every screen except the Active Session (which draws its own header): `AppHeader` with the studio-name button (switch studio), header client search (jumps to the Hub), Refresh schedule (Mindbody pull-sync), theme toggle, the Feedback drawer button, the Notification bell, a gear (trainer settings), and the trainer dropdown (App Mode Trainer/Operations for studio leaders and above, View Profile, Switch Trainer, Switch Studio, Log Out). `AppContent` itself also hosts four overlays: the Machine Info deep-dive dialog (edits `machines/{id}`), the New Clients dialog, the Trainer Reorder dialog, and the **"Wipe Entire Database" confirmation** whose `executeAppCleanse` deletes every document in eleven collections from the browser (see §2.8).

**Bottom navigation — trainer mode:** Hub → `clients` · Client → `profile` (or `client-directory` if no client is selected) · Start Session / Active Session → `workouts` (or `client-directory`) · Learning → the last Learning view · My Studio → `studio-tasks` (Relay · Machines · Team · Studio since Sep 18) · Calendar → `calendar`.
**Bottom navigation — operations mode:** Operations → `admin-dashboard` · Franchise → `franchise-dashboard` (owners and admins).

**App-wide data every screen inherits** (streamed once in `AppContent` and passed down as props): all `trainers`, `studios`, `networks` and `machines`; `schedules` for the active studio from 24 hours ago to 30 days ahead (unscoped when no studio is active), plus the `clients` booked from yesterday to 8 days ahead, fetched by id in chunks of ten and capped at 400 (`useLiveSchedule`); `sessions` for the active studio in the last 24 hours (`useSessions`); and the selected client's document.

### 2.2 The screens

Seventeen `View` values are routed. Rank is the floor-loop rank from §1.4 the screen mainly serves.

| View id | Screen (file) | Rank | Job | Reads | Writes | Goes to |
| --- | --- | --- | --- | --- | --- | --- |
| `clients` | **Hub** (`components/ClientsView.tsx`) | 2, 4 | Today's studio timeline by trainer, the day strip with booking and task counts, header-search results, the client edit form | `clients` prefix search scoped by `queryStudioIds`; studio tasks (per README); the rest from props | `clients` add/update via `useClientMutations` | profile, history, workouts, trainer-profile |
| `client-directory` | **Client directory** (`components/ClientDirectoryView.tsx`) | 3 | Find a client; start an open (unassigned) session; new-client onboarding | unverified (not staged) | `sessions` + `exerciseLogs` for an unassigned session (`startUnassignedSession`) | profile, workouts, CreateClientModal |
| `profile` | **Client profile** (`components/ClientProfileView.tsx`) | 3, 4 | The client dossier: header, package tile, seven tabs (§2.3) | `sessions` (paged 15 by client), `exerciseLogs`, `sessionNotes`, `routines`, `routineAdjustments`, `clientMachineSettings`, `trainerFocuses`, `progressReports`, `schedules`; roster + `machines` via `useStudioMachines`; `sessions` In-Progress via `useActiveSessionCheck` | `clients` (session count, notes, dates, events, routine B flags), `clientMachineSettings`, `routines`, `routineAdjustments`, `sessions.routineId`, `progressReports` delete (a dead `handleSaveFocus` still targets `trainerFocuses`); Discard deletes `exerciseLogs`, `sessionNotes`, `sessions`; `trainers/{uid}.kaizenRoster` (per README) | workouts, client-directory, progress-report, studio-tasks, chart-importer, clients |
| `workouts` | **Active Session** (`components/WorkoutTrackerView.tsx`) | 1, 2, 3 | Consultation wizard or Briefing → live Journey grid with the Now bar → post-session screen (§2.4) | see §2.4 | see §2.4 | profile, clients |
| `progress-report` | **Check-in / progress report editor** (`components/ClientProgressReportView.tsx`) | 4 | Six-step report editor and printable output; the check-in lives inside it | unverified; `progressReports` (per README) | `progressReports`, `clients.subjectiveSnapshot` on finalize (per README) | profile |
| `consultation-wizard` | **Consultation wizard** (`components/ConsultationWizard.tsx`) | 3 | First-visit assessment, opened from Planner client tasks | unverified | unverified | profile |
| ~~`history`~~ | ~~Client history (legacy)~~ | — | **Deleted in the beta-prep trim (Sep 17 2026)**, as decided Sep 12. `ClientHistoryView` and `SessionNotesSidebar` are gone; the Hub's History button now opens the profile at Activity Archive → Sessions (`openProfileAt` in `features/client-profile/profile-nav.ts`) | — | — | — |
| `calendar` | **Calendar** (`components/CalendarView.tsx` → `features/calendar` Month/Week/Day) | 4 | Read-only month / week / day views of the `schedules` prop with a trainer filter | none of its own | none | profile |
| `studio-tasks` | **My Studio** (`features/my-studio/MyStudioView.tsx`; the board inside it is `features/relay/PlannerView.tsx`) | 4 | **Relay** (Floor · Mine · Notes · Network — the board, the Now Bar, Capture) · **Machines** (the floor, what is new in the MSF standard, the machine's door, Offer to the MSF catalog, machines shared by other studios) · **Team** (the Team cockpit, this studio's staff, letting people in, the grant, temporary profiles — the studio tier) · **Studio** (the record, the Mindbody link and cutover date, the studio's day, renewals, its own notices — the studio tier) — My Studio round, Sep 18–19; before that the Planner rework's Studio hub · My tasks · Notes · Team, Sep 16 | `studios/{s}/taskTemplates`, `taskInstances`, `taskRequests` (+ `submissions`), `teamJobs`, `noteShares`, `playbook`; `trainers/{uid}/taskTemplates`, `taskInstances`, `notes`, `noteFolders`; `clients/{id}/sharedNotes` (per README) | the same paths, plus `trainers/{uid}/notifications` (job, share and reminder bells) | profile, progress-report, consultation-wizard |
| `learning` / `machine-anatomy` / `academy` | **Learning** (`features/learning/LearningView.tsx` → LearningHome, `features/catalog/CatalogWikiView`, `features/academy/AcademyWikiView`) | 4 | Front page and one search; the Catalog (the studio's floor, all MSF machines, notes, tips, playbook, comments); the Academy (generated corpus, lazy chunks) | `machines`, `studios/{s}/roster`, `machineNotes`, `playbook`, `wiki`, `comments` (per README); `studioMachineSettings` via its hook | the same studio paths (per README) | each other |
| `trainer-profile` | **Trainer profile** (`features/trainer-profile/TrainerProfileView.tsx`) | 4 | Coaching-load rollups, about, studio access, Kaizen Roster, upcoming and recently coached | live `trainers` doc; `sessions` by trainer (per README) | `trainers/{uid}.kaizenRoster`, bio and certifications via `EditTrainerModal` (per README) | unverified |
| `trainer-hub` | **Trainer settings** (`features/settings/TrainerSettingsView.tsx`) | 4 | The gear-icon settings screen (bug report, the little that is left after the RBAC teardown) | unverified | unverified | unverified |
| `chart-importer` | **Legacy chart importer** (`features/admin/import/LegacyChartImporter.tsx`) | 4 | CSV / chart import of a client's FileMaker history | unverified | session history and `client.trainerTally` (per README) | profile or clients |
| `admin-dashboard` | **Operations dashboard** (`features/admin/AdminDashboardView.tsx`, a pure tab router) | 4 | **Nine tabs** since the Operations overhaul, Sep 19 (fourteen when this was written); everything corporate-only moved to the separate **Admins dashboard** (`features/admins/`). Also renders with no active studio selected | none in the shell; tab components not staged | via props: `studios` update, `clients` update, refresh reads, ~~the demo-client seeder~~ (deleted in the beta-prep trim, Sep 17 2026), machine restore (`machines`), the wipe | profile, studio-tasks |
| `franchise-dashboard` | **Franchise dashboard** (`features/admin/franchise/FranchiseDashboardView.tsx`) | 4 | Network-level view for owners and admins | unverified | unverified | none |

**Declared in `View` but never routed** (nothing renders them; `dashboard` appears only in a className test and a no-op style ternary): `trainers`, `machines`, `dashboard`, `chart`, `machine-knowledge`, `mindbody`. Delete the six ids (§2.7).

### 2.3 The client profile — seven tabs

`ClientProfileView.tsx` (the largest source file in the app) renders the header and delegates every tab to a feature:

| Tab | Component | Shows |
| --- | --- | --- |
| **Journey** (default) | `RecentJourneyView` (`features/journey-grid`) | Sessions × machines grid, 15 sessions per page with "load more", A/B routine filters, the cycling analytics column, machine-settings popover |
| **Routines** | `RoutinesTab` (`features/routines`) + `components/EditRoutineDrawer.tsx` | Routine A and B, "Use today", the Routine-B toggle with its reason dialog, the change log. **This is the only place a routine is permanently changed** |
| **Equipment** | `EquipmentTab` (`features/equipment`) | Per-machine settings, load and history for this client (`clientMachineSettings`), average TUT |
| **Journal** | `ClientJournalTab` (`components/journal`) with `useClientJournal` | Composer, critical strip, focus board, timeline; streams `journalEntries`, `clientFocuses` and — through the read adapter — the legacy `focusRecords`, `sessionNotes`, `clinicalIncidents`, `trainerFocuses`; lists check-ins and reports |
| **History** | `ClientHistoryTab` (`features/client-history`) | Every month since the first visit as a calendar, plus the richer list |
| **Clinical** | `ClinicalReviewTab` (`features/clinical-review`) | "Generate clinical report" over a date range; nothing loads until pressed (by design) |
| **Details** | `ClientInfoSheet` inline (`components`) | Identity, medical, body composition (InBody entry); links to Journal, reports and Planner |

The header (`ProfileHeader`, `features/client-profile`): Back → client directory; **Start Session** (the hero action) → `workouts`; when a session is already In-Progress the same slot becomes Take over / View current / Discard; the Kaizen toggle adds or removes the client from the trainer's roster; the package tile opens the renewal card. An alert strip above the header ("Report Required" / "Report Due") jumps to the check-in editor.

Two hidden dead panes survive in the file — `statistics_disabled` and `details_disabled`, both `className="hidden"`; `details_disabled` still carries navigation handlers and `statistics_disabled` its chart handlers (§2.7).

### 2.4 The Active Session — the Rank 1 path, step by step

All of it is `currentView === "workouts"` inside `WorkoutTrackerView.tsx`.

1. **Entry.** Profile → Start Session (or Take over), the bottom-nav Start Session, or an open session with no client (`startUnassignedSession`). While a client is selected the screen streams `clientMachineSettings`, `routines`, `sessions` by client (auto-adopting an In-Progress one), `sessionNotes`, `focusRecords`, and `exerciseLogs` for up to 30 sessions; the studio's floor comes from `useStudioMachines` (`studios/{s}/roster` + `machines`).
2. **Pre-session.** If the client still requires a consultation → `ConsultationSetupWizard` (writes `clients`, then starts the session). Otherwise → `BriefingScreen` (`features/briefing`): who this is, critical journal entries, goal, focuses, today's routine and sequence, the check-in, START.
3. **Start** (`startNewSession`) writes: `routines` (creates A or B if missing) and `clients.isRoutineBActive`; a new `sessions` document with `status: "In-Progress"`, `sessionMachineIds` (the sequence planned, later the sequence performed), the heartbeat and `preSessionCheckIn`; `clients` (first-session date); a **`sessionNotes` "[Protocol Adjustment]" note whenever a pre-session adjustment note was entered (always, on the consultation path) — a write to a legacy collection (§3.5)**; and placeholder `exerciseLogs/{logDocId}` for each planned machine that has a prior or computed default weight (Left/Right for torso rotation).
4. **The live tracker.** *(Rebuilt in the tracker round, Sep 13 — `docs/rounds/2026-09-13-tracker-round.md`: `jg-sbar`, the Now bar in three labelled groups, the Today's order sheet, the landscape side panel, `machine-clock.ts`.)* The session bar with the timer (pause/resume → `sessions.pausedAt`, `totalPausedMs`) and the `JourneyGrid` live column plus the Now bar. Each set → `updateLogMultiple` → a debounced merge `setDoc` on `exerciseLogs/{docId}` (flushed on unmount and on `visibilitychange`) and a throttled `sessions.lastHeartbeatAt`. Add, remove or reorder machines → `sessions.sessionMachineIds` (never the routine — invariant 3, enforced by `session-scope.test.ts`). Notes → `SessionJournalSidebar`; the check-in → `ClientCheckInPanel`; the machine sheet → settings, reason and note through the equipment mutations; the machine history dialog reads `exerciseLogs` by client and machine. An unassigned session ends by assigning it to a client or creating a new one.
5. **End.** `handleEndSessionPress` writes `sessions.endTime` and opens the End Session dialog (never blocks — §1.6). **Finish session** runs `commitEndSession`: the one finish batch, then post-session mode from a snapshot (tracker round, Sep 13). "Abort Session (No Record)" → a second confirmation → `deleteSession` removes `exerciseLogs`, `sessionNotes`, then `sessions/{id}` and returns to the Hub.
6. **Post-session** (`VictoryHUDScreen`): stat tiles from the session's logs, the Feel toggle, a closing note with priority, the optional quick check-in (`QuickCheckInDialog`, saves on its own), and the renewal `LogConversationDialog` (`studios/{s}/renewals/{cycle}` + `touches`). "Finalize & return to Hub" hands `{clientFeel, noteContent, notePriority}` back.
7. **Finalize** (`finalizeEndSession`): flush all pending log writes, then `completeWorkoutSession` (`lib/sync-utils.ts`) completes the session, rewrites `clientMachineSettings.currentWeight` to what was performed and increments `client.trainerTally`; the session and client are cleared and the view returns to the Hub. Trainer rollups are written server-side by the `onSessionRollup` Cloud Function.

### 2.5 The Operations dashboard — nine tabs, one scope — and the Admins dashboard

**Operations is split in two (the Operations overhaul, Sep 19 2026; `docs/rounds/2026-09-19-operations-overhaul.md`).** Operations is the studio-management area — always one studio, nine tabs, opened daily by studio leaders, head trainers, studio owners and trainers with the grant. The **Admins dashboard** (`src/features/admins/`, view `admins-dashboard`, the third position on the app-mode switch: Trainer · Operations · Admin) takes everything corporate-only — **All locations · Catalog · Standard template · Limbo · System tools · Bug reports · Data** — for administrators and the founder (`isAdmin`) only. Nothing on the Operations side is gated beyond opening it (AJ, Sep 18: features before permission restrictions); the Firestore rules are the real enforcement.

Reaching Operations: the App Mode toggle (studio leaders and above) or the studio picker's "Go to Operations" (the same `isStudioLeader` gate since Sep 19 — the hard-coded e-mail is gone).

**The scope** (Operations round, Sep 19 2026): one control in the shell — **Looking at: this studio · All my studios** — that every tab reads through `useOperationsScope()` (`features/admin/scope.ts`, `scope-context.tsx`). "This studio" is the studio the app is in, so the roster, the schedule and today's sessions the tabs already stream follow it; picking a studio on the bar switches the app. "All my studios" is `operationsStudios()`: the company tier every studio, the owner tier the studios that reach them (ownership or a network they own), the studio tier the studios they run (the grant counts). Tabs that can aggregate span it; the rest read one studio and offer the list (`PickOneStudio`). The Franchise dashboard, its second team editor and its second composer were deleted — under "All my studios" the Monday page is the network view.

| Group | Tab | Component | Who sees it | Under "All my studios" |
| --- | --- | --- | --- | --- |
| Every day | Overview | `features/admin/overview` `OverviewPage` — today's tiles and the chase list, the Needs-you strip, eight panels (Changes today · The next three days · Pain and critical notes · Renewals · Attendance watch · Moments this week · Strength dropped · Team this week), the week's lines; two views of its own: `changes/ChangesView` and `attention/AttendanceWatchView`; the 60-day note review | everyone on the screen | the network view (`features/admin/network`) |
| Clients | Renewals | `features/admin/renewals` — Pipeline and Outcomes; the settings are My Studio → Studio, and this tab points there with the count of unmatched Mindbody names | everyone | pick a studio |
| | Delight queue | `features/ford/DelightQueue` — the studio's gestures with row actions (Take it · Hand it to… · Done · Pass), the Passed bucket, show done | everyone | pick a studio |
| Studio | Floor | `features/admin/floor` — Machines (`my-studio/MachinesSection`, the ONE floor editor, mounted here too: AJ, "look and edit"), Machine fit (`machine-fit`; **This studio** live, **All MSF studios** admin only), Routines (`routines`, authoring gated inside) | everyone | pick a studio |
| | Staff & Roles | `features/admin/staff` — `useStaffRoster` + `StaffEditor`, shared with My Studio → Team | everyone | spans |
| | Insights | `features/admin/insights` (`InsightsAndHours`: what stands out, and Hours — booked slots × the studio's session length, by trainer, week and month) | everyone | pick a studio / Hours spans |
| | Announcements | `features/admin/announcements` — the audiences follow the tier: a studio's leader "One studio", an owner adds the network, administrators everyone; Take down confirms | everyone | — |
| Behind the scenes | Mindbody | `features/admin/mindbody` — a leader's own studio (the link, last sync, pull the schedule now, the event log); administrators the whole estate | everyone | pick a studio (administrators: the estate) |
| | Data | `features/admin/data` — Sessions by trainer, Attendance, for the studio you are in ("to be workshopped" — AJ) | everyone | pick a studio |

**The Admins dashboard** (`features/admins/AdminsDashboardView`, administrators and the founder): All locations (`features/admin/studios` — the registry: create, delete, franchises, the Mindbody audit; the same `StudioDetailsForm` My Studio → Studio renders) · Catalog (`features/admin/machines` — every machine, the studios' submissions queue) · Standard template (`features/admins/StandardTemplateTab` — the standard set, `catalog/StandardSetPanel`, beside the company routines: what a new studio adopts in one step) · Limbo · System tools · Bug reports · Data (any studio).

"Overview" (the floor snapshot), "Retention", "Integrations", "Clients", the Franchise screen and the Monday page are gone (replaced by the Overview, deleted, folded into Mindbody, covered by the global search and the training dashboard, folded into the scope, and reshaped into the Overview, respectively).

### 2.6 Everything is connected through the client

The screens form one loop around the client document, and that is the picture to keep in your head:

```
Mindbody ──webhooks / pull-sync──▶ clients · schedules · contracts
                                        │
   Hub (today's schedule) ──▶ Client profile ──▶ Briefing ──▶ Active Session ──▶ Post-session ──▶ Hub
        ▲                       │  ▲                              │                    │
        │                       │  └── Journal / Equipment / ─────┘ (sessions,         └─ renewal touches,
   Planner · Calendar           │      Routines / History /          exerciseLogs,           check-ins, feel
   (studio work, notes)         │      Clinical / Details            journalEntries)
                                ▼
                     Operations dashboard (leaders): Renewals · Insights · Staff · Studios · Catalog
```

Every screen either prepares a session, records one, or reads what sessions produced. Anything that does not sit on this loop should justify itself against §1.9.

### 2.7 Dead ends and duplicates (connect or delete — invariant 11)

- ~~Six `View` ids never routed: `trainers`, `machines`, `dashboard`, `chart`, `machine-knowledge`, `mindbody`~~ — removed from the `View` union in the beta-prep trim (Sep 17 2026), with the two `currentView === "dashboard"` checks in `AppContent` that nothing could ever satisfy. The union is 16 live ids.
- ~~`history` (legacy `ClientHistoryView`) still routed from the Hub~~ — deleted in the beta-prep trim (Sep 17 2026). The Hub's History button opens the profile at Activity Archive → Sessions. It also took with it a "Generate Mock Data" button that every trainer could see and that wrote eight fake sessions onto a real client, and one of the last two writers of the legacy `sessionNotes` collection (the other is `ConsultationWizard`).
- `ClientProfileView`'s two hidden panes (`statistics_disabled`, `details_disabled`) with live handlers inside.
- ~~`handleTrainerLogin` in `AppContent` is defined and never called~~ (deleted in the beta-prep trim, Sep 17 2026); a second identical `AccessRequestView` branch is unreachable - **kept on purpose**: it is what narrows `authTrainer` to non-null for TypeScript in everything below it.
- ~~`features/journey-grid/ActiveSessionView.tsx` is not imported by the tracker~~ — deleted in the beta-prep trim (Sep 17 2026); nothing imported it.
- ~~`useSessionMachines` (hooks) is dead per the roadmap~~ (already gone); four machine hooks overlap - *they are layers, not copies; `src/features/README.md` now says which to use when* - (`useMachines`, `useStudioMachines`, `useMachineCatalog`, `features/catalog/useCatalogMachines`) with nothing saying which is the entry point.
- The Insights tab reports "who is not writing notes" (per the Sep 7 round notes; `features/admin/insights` was not staged — verify) — a metric §1.5 says not to track.

### 2.8 Where the code contradicts Section 1 today

These are not bugs in the ordinary sense; they are places where the code was built before a rule was written down. Each one is a roadmap item (§5.2).

| # | Contradiction | Rule broken | Where |
| --- | --- | --- | --- |
| 1 | ~~Ending a session is **blocked** while any set has no count~~ **Resolved Sep 13 (floor round):** End Session lists the begun-but-uncounted machines with Practice · Skipped (default) · Not reached and never refuses | Anti-blocker (§1.5, invariant 2) | `WorkoutTrackerView.tsx` `handleEndSessionPress` |
| 2 | ~~There is no explicit outcome on a planned machine~~ **Resolved Sep 13:** `outcome` / `skipReason` / `skipNote` on `exerciseLogs`, decided once in `src/lib/set-outcome.ts`; every average, rollup and "last time" reads performed sets only; the grid draws all four states | The four-state rule (§1.6, invariant 4) | `src/lib/set-outcome.ts` and its 20-odd callers |
| 3 | A Franchise Owner is company-wide in the rules | Tenant partition (§1.8, invariant 10) — **moved to Gate B** on Sep 12: select franchisees are in beta (§5.3) | `firestore.rules` (§3.4) |
| 4 | ~~The star / kaizen marks are hard to read at a glance in the briefing~~ **Resolved Sep 13:** the progression cue — Up · Hold · Down against the last performed set, in the Academy's order — as a chip in the Now bar and on the briefing's sequence rows | Rank 3 needs a faster progress/regress marker | `src/lib/progression-cue.ts`, `features/journey-grid/SessionNowBar`, `features/routine-builder/SequenceMachineRow` |
| 5 | ~~Session start still writes `sessionNotes`~~ **Resolved Sep 13:** the pre-session and post-session notes write to `journalEntries`; the dead `handleSaveFocus` is deleted. `setFocusStatus` still updates a legacy `focusRecords` row when the focus *is* a legacy row — by design, until those rows are imported | Half-migrated journal (§3.5) | `WorkoutTrackerView.startNewSession`, `lib/sync-utils.completeWorkoutSession`, `useClientJournal.setFocusStatus` |
| 6 | ~~Insights reports trainers who are not writing notes~~ **Resolved Sep 13:** the per-trainer note rate, the "no notes at all" sentence and the studio nag are gone; the plain "sessions with a note" tile stays | Anti-blocker | `features/admin/insights` |
| 7 | A full database wipe runs from the browser on one confirmation | Safety (pre-alpha tolerates it; beta must not) | `AppContent.executeAppCleanse`, System Tools |
| 8 | Any trainer can edit any `studios/{id}` document, their own role and studio lists, and any studio's task instances | Tenancy / roles — **left open by decision** (Sep 12 2026): every user is verified by hand while the app is pre-alpha and in beta; revisited at Gate C | `firestore.rules` |

---
## 3. Data model — derived from source (review pending)

*Read on Sep 12 2026 from `firestore.rules` (2,059 lines, 78 helper functions, about 60 collection paths), `firestore.indexes.json`, `src/types.ts`, `src/types/journal.ts`, `src/types/machines.ts`, the hooks, and `docs/business/data-sources.md`. In plain terms: Firestore stores documents in named **collections** (and **subcollections** nested under a document); the **rules** file decides who may read or write each one and is the only place the whole database is listed. "Any signed-in user" means every trainer at every studio can read it.*

**Vocabulary for the status column.** *Canonical* — the collection the app should use for this data. *Legacy* — superseded by a canonical one; still readable (through an adapter) and in some cases still written. *Orphan* — has rules but no visible reader or writer. *Config* — set up by admins or leaders, read by everyone. *Job* — written only by a scheduled job or Cloud Function.

### 3.1 Who owns what

The ownership rule is fixed (`docs/business/data-sources.md`): **Mindbody owns identity, bookings, contracts and money; Journey owns coaching; the nightly jobs own what is derived from both.** A client document's id *is* the Mindbody client id. Journey never invents a Mindbody-owned date.

| Data | Owner | Reaches Journey by | Lives in |
| --- | --- | --- | --- |
| People — name, contact, status | Mindbody | `client.*` webhooks (Solon's site only today) and the schedule pull-sync | `clients/{mindbodyClientId}` |
| Bookings and attendance | Mindbody | `appointmentBooking.*` webhooks and the per-studio pull-sync | `schedules` (id = Mindbody appointment id) |
| Contracts, memberships, pricing options | Mindbody | The Sync button and the nightly renewals job | `client.mindbodyContracts` (merged), `client.mindbodyServices` (replaced whole), `client.mindbodyMemberships` |
| The renewal snapshot | Journey, derived | The nightly renewals job — **the only writer** | `client.renewal` |
| Renewal conversations, stage, outcome | Journey | Trainers and leaders; outcomes also by the job | `studios/{s}/renewals/{cycle}`, `…/touches` |
| Workouts | Journey | The iPad during the session | `sessions`, `exerciseLogs`; totals in `client.machineStats`, `client.trainerTally` |
| Machine settings per client | Journey | Trainers | `clientMachineSettings` |
| Coaching notes, focuses, incidents | Journey | Journal composer, in-session notes, the machine sheet | `journalEntries`, `clientFocuses` |
| Check-ins and how the client felt | Journey | Briefing and post-session | fields on `sessions`; `progressReports` (`isCheckInOnly`) |
| InBody body composition | InBody | Typed in from the printout | `clients/{id}/inbodyScans`; summary on `client.inbodySummary` |
| History before Journey | FileMaker | The legacy importer now; the full import after beta launch | `sessions`, `exerciseLogs` |
| The training method | MSF Academy | Generated at build time from `docs/msf-academy/` | Bundled JSON in `features/academy/content/` |

### 3.2 The collections, by domain

**People and tenancy**

| Path | Holds | Owner | Read | Write | Status |
| --- | --- | --- | --- | --- | --- |
| `trainers/{uid}` | `Trainer`: profile, `role`, home / accessible / guest / owned studio lists, Mindbody staff snapshot, `kaizenRoster` (capped array), `rollups` | Journey; `mindbody` from sync; `rollups` from a Cloud Function | any signed-in user | create: admins, franchise owners, the studio's leaders, or self by uid; update: the same, or the owner by uid or email; nobody touches `rollups` or `mindbody`; only the owner or a super admin touches `kaizenRoster`; no self-promotion to Admin/Founder/Overseer — **but a trainer may still edit their own `role` (below those three) and studio lists** | canonical; open hole |
| `trainers/{uid}/secrets/account` | PIN secret | Journey | admins, self, the studio's leaders | same | unknown — PIN login never wired |
| `trainers/{uid}/taskTemplates`, `taskInstances` | personal tasks | Journey | self only | self only | canonical |
| `trainers/{uid}/notes`, `noteFolders` | Planner notes (private; ≤10 linked clients; optional `links`, working `log`, `teamShare` marker) and folders | Journey | self only | self only, shape-checked | canonical |
| `trainers/{uid}/notifications` | the bell | Journey | self only | any trainer may create for someone (as themselves); self updates | canonical |
| `studios/{id}` | `Studio`: owner and head trainer ids, timezone, Mindbody site and location ids, `journeyCutoverDate`, shift hours, `sessionMinutes` (the booked slot Hours counts, default 30 — Sep 19), sync lease, `networkId` | config | any signed-in user | create: admins, franchise owners; update: those plus **the studio's own leaders** (a leader role there or the grant); any trainer may write only the sync lease (`lastScheduleSyncAt`, `scheduleSyncFailures`) — My Studio, Sep 19 | canonical; the any-trainer write hole is closed |
| `networks/{id}` | `FranchiseNetwork`: `ownerId`, `ownerIds`, `studioIds` | config | any signed-in user | admins, franchise owners | canonical — **never consulted by any rule** (§3.4) |
| `access_requests/{id}` | system-access requests (type 1, with `requestedStudioId` since Sep 18) and studio-access requests (type 2) | Journey | any signed-in user | type 1 create has **no auth check**; type 2 by the requester; update by admins, owners, anyone who runs a studio (My Studio → Team lets people in), or the requester | canonical |
| `catalogSubmissions/{id}` | a studio's own machine offered to corporate for the MSF catalog: the definition, `basedOn`, who and why, `status` pending / published / declined / withdrawn (My Studio, Sep 19); the decision — `publishedAs`, `decisionNote`, `decidedBy`, `decidedAt` (the Operations round's queue) | Journey (leaders; admins decide) | admins; the offering studio's leaders | create: a leader of that studio, pending, as themselves; the studio may only withdraw; admins decide from Operations → Catalog → Submitted by studios; the id migration is `scripts/migrate-machine-id.ts` from the PC | canonical |
| `crossTrainRequests/{id}` | a trainer asking for cross-train access | Journey | any signed-in user | requester creates; target studio's leaders update | **delete** (decided Sep 12 2026) — `approvedCrossTrainStudioIds` on the client is the only source |
| `clients/{id}/crossTrainAccess/{studioId}` | a grant | Journey | any signed-in user | that studio's leaders | **delete** (decided Sep 12 2026) — no rule reads it; the rules check `clients.approvedCrossTrainStudioIds` |
| `users/{id}` | — | — | admins, self | same | orphan — no type, reader or writer |

**Clients and coaching**

| Path | Holds | Owner | Read | Write | Status |
| --- | --- | --- | --- | --- | --- |
| `clients/{mindbodyClientId}` (or `{siteId}-{mindbodyClientId}` for the second person on a number both Mindbody sites use — `lib/mindbody-site.ts`) | `Client`: Mindbody mirrors, coaching fields (incl. the optional `wingspan`, machine-fit round), running totals, `renewal`, `inbodySummary`, `subjectiveSnapshot` | Mindbody (identity, commercial) · Journey (coaching) · job (`renewal`) | admins, franchise owners, trainers and leaders of the home studio, approved cross-train studios | create/update by admins or the home studio's trainers and leaders, never touching `renewal`; delete admins | canonical |
| `clients/{id}/inbodyScans/{id}` | one InBody 270S scan | InBody, typed in | anyone who can read the client | home-studio trainers and leaders, admins (rules also admit franchise owners); remove: enterer, leaders, admins | canonical |
| `clients/{id}/sharedNotes/{id}` | a Planner note shared onto the client | Journey | anyone who can read the client | author; delete author, leaders, admins | canonical |
| `journalEntries/{id}` | `JournalEntry` — the unified journal (notes, incidents, in-session notes, machine notes) | Journey | **any signed-in user** | any trainer, as author; author and client pinned | canonical |
| `clientFocuses/{id}` | `ClientFocus` — the 4 P's focus model | Journey | any signed-in user | any trainer as owner; owner, admins, franchise owners update | canonical |
| `progressReports/{id}` | `ProgressReport` incl. the check-in (`isCheckInOnly`), `.subjective` | Journey | **any signed-in user** — must never hold InBody numbers | any trainer; delete admins/owners (the profile's delete call is refused for others) | canonical |
| `clientMachineSettings/{clientId}_{machineId}` | the client's dial settings and current weight per machine; since the machine-fit round also `sources` (where each value came from: `typed` / `suggested` / `legacy`) and `fitAcks` ("right for this client" reviews, tied to the value) | Journey | any signed-in user | any trainer; delete any signed-in user | canonical; open read |
| `routines/{id}` | `Routine` A / B for a client | Journey | any signed-in user | any trainer; delete admins/owners | canonical |
| `routineAdjustments/{id}` | the audit trail of routine changes | Journey | any signed-in user | any trainer, create only | canonical, append-only |
| `routinePresets/{id}` | `RoutinePreset`, tiers company / studio / trainer | Journey / config | any signed-in user | by tier: admins / the studio's leaders / any trainer | canonical |
| `sessionNotes/{id}` | `SessionNote` | Journey | any signed-in user | any trainer | **legacy** → `journalEntries`; **still written at session start** |
| `focusRecords/{id}` | `FocusRecord` | Journey | any signed-in user | any trainer | **legacy** → `clientFocuses` / `journalEntries`; **still updated** by `useClientJournal.setFocusStatus` |
| `trainerFocuses/{id}` | `TrainerFocus` | Journey | any signed-in user | any trainer | **legacy** → `clientFocuses`; the profile still streams it, and a dead `handleSaveFocus` targets it |
| `clinicalIncidents/{id}` | `ClinicalIncident` | Journey | any signed-in user | any trainer, all ops | **legacy** → `journalEntries` kind `incident` |

**Sessions**

| Path | Holds | Owner | Read | Write | Status |
| --- | --- | --- | --- | --- | --- |
| `sessions/{id}` | `WorkoutSession`: `hostedAtStudioId`, `clientHomeStudioId`, `trainerId`, status, check-ins, feel, `sessionMachineIds` (the sequence performed), heartbeat | Journey (+ FileMaker import) | admins, franchise owners, the session's trainer, the hosting studio's trainers and leaders, **anyone who can read the client** | create: admins, a trainer of the hosting studio, or anyone who can read the named client, with a valid shape; update: the same plus the session's own trainer; delete admins/owners | canonical — **scoped by client, not studio** (load-bearing; see `CLAUDE.md`) |
| `exerciseLogs/{logDocId}` | `ExerciseLog`: one machine in one session (load, reps, TUT, quality, side) | Journey (+ FileMaker) | **any signed-in user** | any trainer; `sessionId` and `clientId` immutable | canonical; open read |
| `schedules/{mindbodyAppointmentId}` | `ScheduleEntry` — a booking | Mindbody; `source: "Manual"` by Journey | any signed-in user | any trainer with a valid shape | canonical |
| `sessions/{id}/logs/{id}` | — | — | old-chain trainer check | same | orphan — the app uses top-level `exerciseLogs` |

**Machines and the studio floor**

| Path | Holds | Owner | Read | Write | Status |
| --- | --- | --- | --- | --- | --- |
| `machines/{m-*}` | `MachineCatalogEntry` — the MSF catalog, merged by id over the code defaults in `data/machine-database.ts`; `inStandardSet` + `defaultOrder` (renumbered in tens) are the standard set a new floor starts with, adopted never pushed | config (admin) | any signed-in user | admins; never deleted (Retire, which confirms) | canonical |
| `machines/{id}/settingHistory/{id}` | setting-change audit | Journey | any signed-in user | **any signed-in user, all ops, no shape** | canonical; unguarded |
| `studios/{s}/roster/{machineId}` | `StudioMachineRosterEntry` — which machines this studio owns, their order, status, standards, sharing, and a `submission` marker (a copy of the offer's status) | config (leaders) | any signed-in user; shared entries via a collection-group rule | admins, the studio's leaders; `studioId` must match the path | canonical — **the** per-studio floor; westlake and Willoughby still empty |
| `studios/{s}/machineNotes/{machineId}` | a floor note on a machine | Journey | any signed-in user | trainers who write for that studio | canonical |
| `studios/{s}/machineFit/{machineId}` | the machine-fit index (Sep 17): `rows.{clientId}` = settings (normalised), where they came from, reviews, saved-at. **No body data** — joined to the studio client list at read time | Journey (every settings save) + `scripts/rebuild-machine-fit.ts` | trainers who write for the studio | the same, **one row per write** (`rows.diff(...).affectedKeys().size() <= 1`), shape-checked; delete admins | a **copy** of `clientMachineSettings`; the write is caught, the script rebuilds it |
| `studios/{s}/upkeepLog/{id}` | unscheduled upkeep | Journey | any signed-in user | trainers of the studio, create only | canonical, append-only |
| `studios/{s}/watch/performance` | the Overview's performance watch list (Sep 19): `rows[{clientId, machineId, weight, reps, medianReps, priorSets, day, drop}]`, the window, `builtAt`. **No name, no body data**; capped at 60 rows; an empty document means "nothing to watch", a missing one "never ran" | the weekly machine-trends job (`server/machine-trends-job.ts`, `overview/performance.ts`) | trainers who write for the studio | **nobody in the app** (`allow write: if false`) | canonical; rebuilt every Sunday, or from the PC by `scripts/run-machine-trends.ts --commit` |
| `studios/{s}/watchlist/{clientId}` | `WatchlistEntry` (Operations overhaul, Sep 19) — a leader's disposition of an attendance anomaly: `snoozedUntil` (a day) or `dismissedAt` / `dismissedBy` / `dismissedByName`, plus the snapshot's `lastVisitAtDismissal` / `nextBookingAtDismissal` so "back again" means booked or visited SINCE. Deleting it = back on normal watch | Journey (the Overview) | trainers who write for the studio | admins, franchise owners, the studio's leaders (create, update, delete) | canonical |
| `studios/{s}/acknowledgements/{kind:id}` | `Acknowledgement` (Operations overhaul, Sep 19) — who saw an incident (`incident:{id}`), a critical note (`note:{id}`) or a pain report (`pain:{clientId}:{day}`), and when: `sourceKind`, `clientId`, `acknowledgedAt`, `acknowledgedBy` (the Auth uid), `acknowledgedByName`. Kept beside the studio, never on the note | Journey (the Overview) | trainers who write for the studio | anyone who works at the studio, only as themselves; **never deleted** | canonical, append-only |
| `studioMachineSettings/{studioId}_{machineId}` | `StudioMachineSetting` (settingOptions, standards) | Journey | any signed-in user | any trainer | **legacy** → `roster`; 0 documents on Sep 12 2026; `StudioSetupCard` still reads and writes it |
| `machineSettingChanges/{id}` | `MachineSettingChange` | Journey | any signed-in user | any trainer, create | **legacy** → `settingHistory` + `journalEntries`; no reader, writer removed |

**Studio operations (Planner, Hub, Learning, renewals)**

| Path | Holds | Owner | Read | Write | Status |
| --- | --- | --- | --- | --- | --- |
| `studios/{s}/config/renewals` | the studio's renewal settings and package prices; `renewalsSeen` written by the job | config / job | admins, franchise owners, the studio's trainers and leaders | admins, franchise owners, the studio's leaders; never deleted | canonical |
| `studios/{s}/renewals/{cycleKey}` | one renewal cycle (stage, lead, outcome, flags); key = Mindbody contract id or `pif-<id>` | Journey + job | admins, franchise owners, the studio's trainers and leaders | admins, franchise owners and leaders write the cycle; trainers may only touch the conversation fields | canonical |
| `…/renewals/{c}/touches/{id}` | one renewal conversation | Journey | same | author creates; never updated; leaders delete | canonical, append-only |
| `studios/{s}/taskTemplates`, `taskCategories` | recurring studio work and its categories | config (leaders) | any signed-in user | the studio's leaders | canonical |
| `studios/{s}/taskInstances/{derived id}` | one day's occurrence of a task | Journey | any signed-in user | **any trainer at any studio**; assignment fields only leaders | canonical; cross-studio write hole |
| `studios/{s}/taskRequests/{id}` (+ `replies`, `submissions/{trainerId}`) | the board: floating requests, initiatives, replies, per-trainer initiative submissions | Journey | any signed-in user (submissions: any trainer) | author creates; **any trainer updates**; replies by author; submissions by self | canonical; wide write |
| `studios/{s}/teamJobs/{id}` | a team job: people, parts (a map), due day, closing note (Planner rework) | Journey | the studio's people | leaders post and change anything; the floor ticks parts, joins, leaves, closes, reopens — never cancels; delete: poster, leaders, admins | canonical |
| `studios/{s}/noteShares/{noteId}` | a copy of a private note shared with named colleagues or the whole studio, with an end date the app enforces (Planner rework) | Journey | the people named, the author, or (team) the studio's people | the author only, shape-checked; delete: author, leaders, admins | canonical |
| `studios/{s}/playbook/{id}` | a coaching tip that worked — never carries a client id | Journey | trainers who write for the studio; shared ones by any signed-in user | author; confirmations by anyone; leaders | canonical |
| `studios/{s}/wiki/{id}` | the studio's own Learning pages and machine overlays | Journey | same as playbook | trainers (overlays), leaders (pages) | canonical |
| `studios/{s}/comments/{id}` | comments with @mentions on Learning pages | Journey | the studio's people, admins and franchise owners (other studios never see them) | author; delete author, leaders, admins | canonical, studio-scoped |
| `hub_announcements/{id}` | `HubAnnouncement` | Journey | any signed-in user | admins, franchise owners, studio owners as themselves; anyone marks read | canonical |

**System and integration**

| Path | Holds | Owner | Read | Write | Status |
| --- | --- | --- | --- | --- | --- |
| `mindbodyEventLog`, `mindbodyDLQ`, `mindbodyLimbo` | webhook idempotency log; dead letters (write-only, no drain); events that could not be matched to a studio | Mindbody via Cloud Functions | admins | server; admins may update DLQ and Limbo entries; any signed-in user may create a Limbo entry (the pull-sync parks bookings there) | canonical, server-side |
| `system/health` | integration health | job | any signed-in user | server only | canonical |
| `bug_reports/{id}` | bug reports from the feedback drawer | Journey | admins, the reporter | anyone creates; admins update | canonical |
| `notificationQueue/{id}` | email / SMS queue | job | admins, owners | anyone creates; admins update | orphan — no consumer; outreach is parked |
| `machineTrends/{machineId}` and `machineTrends/_summary` | `MachineTrendDocument` (`server/machine-trends-job.ts`) | the weekly job | any signed-in user | admins | per machine, clients · sets · load distribution · settings by height · per studio (cost round, Sep 2026), plus `fit` — machine fit's company tier: anonymous height × gender cells → whole set-up → count, **k-anonymous at five** (machine-fit round). Aggregates only, never a client row. Read by the Settings card and the Setup screen through one cache. Replaced `leaderboards/*`, which nothing read; those documents are stale and can be deleted |
| `kaizenReports/{machineId}` and `kaizenReports/_summary` | `KaizenReport` (`features/machine-fit/kaizen.ts`) — by height, by setting, what follows what, whole set-ups, per-studio counts | the weekly job | **admins and founders only** | nobody (Admin SDK) | Operations → Machine fit → All MSF studios. Names studios, never a client; every average is null under five clients |
| `auditLogs/{id}` | `AuditLogEntry` | Journey | admins, owners | anyone creates | unknown — no visible writer |
| `aggregations/{id}` | — | — | any signed-in user | admins | orphan |

### 3.3 The retire list

Collections to retire once their last reader and writer are gone, in the order the work falls out: `sessionNotes` (one writer left, in `startNewSession`), `focusRecords` (one writer left, `setFocusStatus` in `useClientJournal`), `trainerFocuses` (only a dead handler and a stream in the profile), `clinicalIncidents`, `machineSettingChanges`, `studioMachineSettings` (move `settingOptions` / `standardSettings` onto the roster entry, then delete), `sessions/{id}/logs`, `users`, `aggregations`, and — pending a decision — `crossTrainAccess`, `crossTrainRequests`, `notificationQueue`, `auditLogs`. Retiring means: no writer, the read adapter dropped, the rules block removed, and the `executeAppCleanse` list trimmed. *Decided Sep 12 2026:* no strict sequencing — move the live writers whenever convenient (cheap, and it stops the bleeding), but keep the read adapter and the legacy rows until the Mindbody notes import and, later, the FileMaker import have landed and decided where legacy notes live. `crossTrainAccess` and `crossTrainRequests` are decided: delete.

### 3.4 Tenancy as enforced today — and the franchise-owner gap

How a studio scope is chosen: `queryStudioIds(trainer, activeStudioId)` (`src/lib/tenancy.ts`) returns the active studio when the trainer may read it, otherwise every studio they may read — home ∪ accessible ∪ guest ∪ owned — capped at 30. The client-pinned streams (journal, profile, tracker) carry no studio clause and rely on per-document rules; `trainers`, `studios`, `networks` and `machines` are streamed whole.

How a client's readability is decided (rules): an admin or franchise owner reads every client; otherwise a trainer whose home, accessible or guest studios include the client's `homeStudioId`, a leader of that studio, or a trainer at one of the client's `approvedCrossTrainStudioIds`. Sessions are readable by whoever can read their client — that is the load-bearing decision that keeps a cross-training client's history whole.

**Studio Leaders** are scoped by `primaryHomeStudioId` / `ownedStudioIds` everywhere they have extra rights. **Franchise Owners are not scoped at all.** `isFranchiseOwnerOnly()` is a role check, and wherever it appears it grants every studio: every client and session, every studio's renewals, every studio's machine notes, playbook, wiki and comments, every trainer document, every studio document, universal announcements. The word "network" occurs in the rules only in an unused validator and the `networks` collection's own block; no helper reads `networks/*`, `Studio.networkId` or `FranchiseNetwork.studioIds`. Network scoping exists **only in the app** — `isStudioInTerritory` in `src/lib/permissions.ts` and the studio picker — and a screen-side check is a convenience, never a boundary.

**What closing the gap means** — design decided Sep 12 2026, built at Gate C (§5.4): a `networkIds` and `ownedStudioIds` list cached on the trainer document and maintained by the admin screens (Studios and Staff & Roles), so a rules helper `ownsStudio(studioId)` costs one document read; then every `isFranchiseOwnerOnly()` grant becomes "franchise owner **of this studio**". The app-side `isStudioInTerritory` already encodes the intent; the rules must match it. One trap to settle in the same round: `isStudioInTerritory` honours `net.ownerId` but not `net.ownerIds`, while `ActiveStudioContext` honours both.

Also readable by any signed-in user today (34 `allow read: if isAuthenticated()` lines, plus `settingHistory`'s read-write line and `submissions` open to any trainer): `trainers`, `studios`, `machines`, `routines`, `routineAdjustments`, `routinePresets`, `exerciseLogs`, `schedules`, `progressReports`, `journalEntries`, `clientFocuses`, `clientMachineSettings`, the legacy note collections, roster, machine notes, upkeep, studio tasks and requests, announcements, and the cross-train collections. Studio-scoped: `clients`, `sessions`, InBody scans, shared notes, renewals, playbook, wiki, comments. Owner-only: personal tasks, notes, notifications, secrets, bug reports. The open reads are a known deferral; the ones that carry client health or coaching text (`journalEntries`, `exerciseLogs`, `progressReports`) should close in the same round as the franchise partition.

### 3.5 The half-migrations — and what "finished" means

Half-migrations are the real source of the disorganized feeling: two ways to do one thing, and nothing saying which is right. Each of these is finished only when the legacy side has no writer, no reader, no rule and no entry in the wipe list.

| Migration | Canonical | Legacy | Where it stands | Finished when |
| --- | --- | --- | --- | --- |
| **The journal** (Sep 2) | `journalEntries` + `clientFocuses` | `sessionNotes`, `focusRecords`, `trainerFocuses`, `clinicalIncidents` | Read adapter in `useClientJournal` merges all of them. **Since the floor round (Sep 13)** the pre-session and post-session note writers target `journalEntries` and the dead `handleSaveFocus` is gone; the one legacy writer left is `setFocusStatus` updating the status of a `focusRecords` row that *is* legacy (an edit of an existing row, not a new one). The tracker and the legacy history view still stream `sessionNotes` for display | The `focusRecords` status edit retired with the rows' import; legacy rows either imported or left read-only until the FileMaker import; adapter and rules blocks removed |
| **Machine settings** | `studios/{s}/roster` (per-studio floor: order, status, standards) + `clientMachineSettings` (per client) + `machines/{id}/settingHistory` (audit) | `studioMachineSettings`, `machineSettingChanges` | Ordering already rewired to the roster (Sep 12); `StudioSetupCard` still reads and writes `studioMachineSettings` for `settingOptions` / `standardSettings`; `settingHistory` has no write guard | Settings options and standards live on the roster entry; `studioMachineSettings` and `machineSettingChanges` deleted from rules and the wipe list; `settingHistory` gets a shape check |
| **The per-studio floor vs the global list** | the roster | `machines` as "every studio's list" | Sessions still use the app-wide machine list, so a studio's own or adopted machines are not in the session picker (roadmap item) | The tracker and routine builder read `useStudioMachines(activeStudioId)` only |
| **Cross-train access** | `clients.approvedCrossTrainStudioIds` (what the rules check) | `clients/{id}/crossTrainAccess`, `crossTrainRequests` | The subcollection and the requests have rules but no reader in the rules or staged code | **Decided Sep 12 2026:** the admin screen writes `approvedCrossTrainStudioIds` directly; the two collections, their rules blocks and their types are deleted |
| **Trainer identity** | `trainers/{auth uid}` | placeholder docs with random ids | Claim-on-sign-in shipped Sep 6; migration C prepared, not run (`TRAINER-IDENTITY.md`) | The report script shows zero stranded and zero collisions, or the migration has run |

### 3.6 Naming conventions to adopt (proposal)

The vocabulary in `types.ts` grew one round at a time, so the same idea has several names. New code uses the left column; existing fields are renamed only when the collection is touched for another reason (and never during the FileMaker import).

| Idea | Use | Today's variants |
| --- | --- | --- |
| The studio a document belongs to | `studioId` on everything except `clients` (`homeStudioId`) and `sessions` (`hostedAtStudioId` + `clientHomeStudioId` — both needed) | `studioId`, `homeStudioId`, `hostedAtStudioId`, `clientHomeStudioId`, `primaryHomeStudioId`, `resolvedStudioId`, `targetId` |
| Who wrote it | `authorId` (auth uid) + `authorName` | `trainerId`, `authorId`, `createdBy` (string *and* map), `author.id`, `actor.id`, `enteredBy`, `grantedBy`, `reportedByTrainerId`, `addedByTrainerId`, `startedByTrainerId`, `lastTouchBy`, `userId` … |
| Who last changed it | `updatedBy` + `updatedAt` | `updatedBy`, `outcomeBy`, `provisionalBy` |
| When it happened vs when it was written | `occurredAt` (the event) and `createdAt` (the write), both Firestore Timestamps | `timestamp`, `dateAssigned`, `startedAt`, `at`, `addedAt`, `date` (string), `clientStartTime` (string) |
| A person's initials | `authorInitials` | `trainerInitials`, `authorInitials` |
| The Mindbody client id | the document id; keep `mindbodyClientId` as the field | `mindbodyId`, `mindbodyClientId` |
| Collection names | camelCase | `access_requests`, `bug_reports`, `hub_announcements` |
| Document ids | derived ids where a natural key exists (`{clientId}_{machineId}`, `logDocId(session, machine, side)`, Mindbody ids, auth uids); random ids only for true events | mixed — `clientMachineSettings` has both composite and random ids in production |

### 3.7 Rules and indexes — facts to know

- `firestore.rules`: 2,059 lines, 78 helpers; six are never called (`getTrainerByUID`, `hasAnyTrainerProfile`, `isTrainerOfStudioOrClient`, `isValidMachine`, `isValidNetwork`, `canPostAnnouncements`); two whole predicate families exist side by side by design (`isTrainerOfStudioOnly` ≈ `trainerWorksAt`, `isSuperAdmin` ≈ `roleIsSuper`, `isTrainerOfSessionData` ≈ `sessionIsReadable` — the new one adds the admin/owner bypass; `sessions/{id}/logs` still uses the old one). The JWT-claim fast path is live since the cost round (Sep 16): `syncTrainerClaims` (Cloud Function) mirrors `trainers/{id}.role` onto the token, so role checks read the token and only the studio-membership checks still read the document. Only `role` is ever set — the `studioId` claim path in `isStudioOwnerOrHeadTrainerOnly` / `trainerLeads` grants leader access with no role check and is deliberately never fed.
- One rule reduces to "any signed-in user" by accident: `clientMachineSettings` delete (`isSuperAdmin() || isFranchiseOwner() || isAuthenticated()`).
- Type-1 `access_requests` can be created with **no authentication** (by design for the request form; worth a rate limit or a reCAPTCHA before launch).
- `firestore.indexes.json`: 43 composite indexes as of Sep 19 2026 (the Operations overhaul added `schedules (studioId, movedFromDay)` for the Overview's moved bookings and `journalEntries (studioId, effectiveUntil)` for its dated notes; the Operations round before it added `journalEntries (studioId, importance, occurredAt desc)` for the critical notes; FORD and Relay added `ford` ×3 and `taskInstances` before it) — `sessions` 9, `clients` 5, `exerciseLogs` 4, `journalEntries` 3, `ford` 3, and one to two each for `clientFocuses`, `progressReports`, `roster`, `schedules`, `sessionNotes`, `focusRecords`, `trainerFocuses`, `mindbodyEventLog`, `playbook`, `wiki`, `comments` — `roster`, `playbook` and `wiki` are collection-group indexes. The machine-db README names two collection-group **field overrides** (`roster.shared`, `roster.basedOn`) that are **not** in the file (`fieldOverrides` is empty) — verify in the console.
- Deploy order when rules only add access: indexes → rules tests → rules → push. The repo file describes intent; `scripts/fetch-live-rules.ts` shows reality — run it after every deploy.

### 3.8 Three designs that followed from the Sep 12 decisions — one built, two decided

**The set outcome — built in the floor round (Sep 12–13; `docs/rounds/2026-09-12-floor-round.md`).** The fields, as shipped, on `exerciseLogs`: `outcome` (`"performed" | "practice" | "skipped" | "not_reached"`, absent on older logs, `null` when a trainer clears it), `skipReason` (`pain_injury | machine_occupied | out_of_service | client_declined | trainers_call | other | unknown` — *unknown* is history's word, never offered on the floor), `skipNote` (the body area behind a pain skip, free text), `machineStartedAt` / `machineEndedAt` (the per-machine clock, persisted on the log the first time anything is written for the machine and read back after a refresh) and `practiceRegion` (reserved for the pain-map link; not yet written). On `sessions`: `bookingStartTime` and `startedLateByMinutes`, written at Finish when a Mindbody booking for the client matches within three hours (nothing written when none does — a guessed lateness is worse than none). **One module decides everything** — `src/lib/set-outcome.ts`: `outcomeOf()` applies the compatibility rule (no field → *performed* if the log carries a count, reps or seconds; *skipped: unknown* if not), `isPerformedLog()` / `performedOnly()` are what every aggregate calls, `outcomeAtFinish()` is what Finish stamps, `unreachedMachineIds()` and `isBegunLog()` derive *not reached* — the weight-only placeholder session start seeds for every planned machine is not "begun", so a machine that was only looked at reads as not reached, while any write (a load change, a rep, a quality mark) starts its clock and makes it "begun". How each state is set on the floor: *performed* whenever an effort is recorded; *practice* and *skipped* by the two buttons in the Now bar (Skip opens the reason strip; picking a reason writes the skip and moves focus on; pain asks "where?" once, optional); at End Session the begun-but-uncounted machines are listed with Practice · **Skipped (default)** · Not reached, so one tap still finishes; untouched machines are stamped *not reached* silently. **Readers filtered to performed:** the Journey grid's stats, summary, trend and "previous set"; `completeWorkoutSession` (lifetime reps and volume, `currentMachineMetrics`, `clientMachineSettings.currentWeight`/`startingWeight`); `client-rollups` (`machineStats`, and the delete path unwinds the same sets); clinical review's `toSetFact`; equipment usage and TUT; `progress-utils`; the next target weight; `clinical-review-utils`; Insights; the briefing's "last time"; the Victory tiles; routine rows; the routine drawer; the machine dashboard's trend and PR; the machine-trends job (was the leaderboard cron); the client-history model and session dialog. Display, as built: performed as before; practice as the numbers in muted ink inside a dashed frame with a `P`; skipped as `⊘` over the one-word reason; not reached as a lone `·`; the legend names Practice and Skipped. *Known consequence:* a legacy weight-only log (no reps, no seconds) now draws as a skipped cell and no longer sets a row's first / lowest / highest weight or votes in `machineStats`; it never counted toward volume. *Not in this round:* `functions/src` (the trainer rollups) was not touched — check it for exercise-log aggregates before Gate B — and `rollupFromHistory` should be re-run for clients whose `machineStats` predate the rule (a chore, §5.2 item 4).

**The perpetual check-in — decided Sep 12 2026: option (a), a living record per client.** Every answer carries its own `updatedAt`, `updatedBy` and `source` (profile / briefing / in-session / post-session); any single answer can be updated from anywhere at any time; the 90-day report becomes a **snapshot** of the record compared with the previous snapshot. Shape: `clients/{id}/checkIn/current` (the living answers; studio-scoped like the client) and `clients/{id}/checkInSnapshots/{date}` (append-only; what the report reads). Today's `progressReports` event documents become the first snapshots. Built in §5.2 item 5 with the rename of the screen labels.

**FORD — decided Sep 12 2026: Valuable tier; both the structured fields and the dated mentions timeline; Dreams stays separate from the clinical goal; strictly on the client record.** Four short fields on the client (`ford.family`, `ford.occupation` — which already exists as the occupation field — `ford.recreation`, `ford.dreams`), each with `updatedAt`/`updatedBy`, plus a dated **mentions** timeline ("her daughter's wedding is in June", category F/O/R/D) so a detail has a date and a reason to bring it up. Surfaced in two places: one line in the briefing ("Ask about…") and the Renewal Brief. **The privacy constraint is the reason for the placement:** FORD is personal, so it lives on the client document or a client subcollection under the client-read rule, and never in `journalEntries`, which any signed-in user can read today. Built in §5.2 item 5.

---

## 4. Codebase organization — derived and proposed

*Derived from the `src/` tree on Sep 12 2026 and re-counted Sep 21 2026: **1,020 files in 90 folders**, 40 feature folders (23 with a README). §4.4–4.7 are proposals for how to work from here.*

### 4.1 The layout today

| Folder | What it is for | Size | State |
| --- | --- | --- | --- |
| `src/features/<name>/` | **Where new code goes.** One folder per feature: pure logic in `.ts` with a `.test.ts` beside it, screens in `.tsx`, a README with the decisions, tokens from the shared token files | **40 folders** (Sep 21 2026; 28 on Sep 12), incl. ~1.3 MB of generated Academy JSON | Good. 23 of 40 have a README |
| `src/components/` | The pre-`features` world: screens and shared pieces from the Gemini era | **32 files** at the top level (Sep 21 2026; 46 on Sep 12) + the subfolders `anatomy/`, `client-dossier/`, `journal/`, `machines/`, `mindbody/`, `routines/`, `schedule/` | The three biggest screens live here as single files |
| `src/AppContent.tsx` | The router, the global state store, the app shell, and a pile of handlers | **2,594 lines · 27 `useState`** (Sep 21 2026; 3,126 on Sep 12) | The god file |
| `src/hooks/` | Firestore streams and app-level hooks | 16 files | Four overlapping machine hooks; one dead |
| `src/lib/` | Pure helpers: tenancy, permissions, studio time, Mindbody sync and mapping, rollups, machine resolution | 51 files (14 are tests) | Healthy, except the duplicate `utils.ts` at the repo root |
| `src/data/` | Code-default data: the machine database, anatomy map, display order, clinical matrix | 11 files; `machine-database.ts` is 76 KB | Fine; know that `machines/` in Firestore is merged over it by id |
| `src/types.ts`, `src/types/` | The shared vocabulary: 66 exported types in `types.ts` (52 KB), plus `journal.ts`, `machines.ts` and `images.d.ts` | 4 files | Growing by accretion; §3.6 |
| `src/contexts/` (Toast, Mindbody health, the active studio - `ActiveStudioContext.tsx` moved in here in the beta-prep trim), `src/services/` | Toast, Mindbody health, the active studio; the Gemini client | 4 files | Fine |
| `server.ts`, `server/` | Express on Render: serves the build, the Mindbody proxy, the Gemini endpoints, the cron jobs and worker | — | Fine; needs a staff sign-in on every Mindbody route |
| `functions/src/` | Cloud Functions: the Mindbody webhook, trainer rollups, staff photos, nightly facility analytics | — | Tests never run in CI (no test script there) |
| `firestore.rules`, `tests/`, `firestore.indexes.json` | Security rules, their emulator tests (JDK 21), composite indexes | **2,769 lines** (Sep 21 2026; 2,059 on Sep 12) | The only complete map of the database until §3 |
| `scripts/` | One-off scripts: service-account auth, dry-run by default, `--commit` to write | — | Good pattern; a few live at the root instead |
| `docs/business/`, `docs/msf-academy/` | Business rules; the Academy corpus (219 documents) | — | Good |
| The repo root | 23 markdown documents, ~39 log and text files, 8 PowerShell ship scripts, 5 loose JS scripts, `patches/`, `patches-machines/`, `backups/`, `harness/`, `Claude outputs/`, and a `components/` and `lib/` that shadow `src/components` and `src/lib` | — | The loudest problem and the cheapest to fix (§4.6) |

### 4.2 Where the bloat is

Bloat is not "a lot of code"; it is code in the wrong shape. Four places:

1. **Three god screens** in `src/components/`: `ClientProfileView.tsx` (180 KB), `WorkoutTrackerView.tsx` (160 KB), `ClientProgressReportView.tsx` (125 KB). Each already delegates most rendering to feature components, but the data loading, the handlers and the leftovers (hidden panes, legacy writes) stayed in the shell. These are Rank 1–3 screens, so they get restructured carefully, in phases, with the iPad checked after each — never in one heroic rewrite.
2. **`AppContent.tsx`** does five jobs: routing, global state (28 `useState` hooks), the shell and bottom nav, the app-wide Firestore streams, and one-off admin tools (machine restore, trainer reorder, the wipe). The tools and the streams can leave first; routing and state last.
3. **The root of the repo**, which has become a working desk: run logs, ship scripts and every round document since August, next to `README.md`. Two of the folders (`components/`, `lib/`) shadow `src/` and produce the `@/*` alias trap: which `cn()` you get depends on how you typed the import.
4. **Overlapping layers with no signpost**: four machine hooks; two consultation wizards; two session-note sidebars; two `ROUTINE_TEMPLATES` (per `ROADMAP.md`'s hygiene list); the legacy `history` view beside the History tab. None is wrong on its own; the cost is that nobody can tell which to use.

### 4.3 The three half-migrations in code

| Migration | From | To | Where it stands | Finished when |
| --- | --- | --- | --- | --- |
| Screens | `src/components/*View.tsx` | `src/features/<name>/` | Most screens moved; the three largest and the admin shell (`AdminDashboardView`, `AdminSystemToolsTab`, `AdminLimboQueue`) remain; `components/journal`, `client-dossier`, `machines`, `routines`, `mindbody` are feature folders in the wrong place | `src/components/` holds only shared primitives (buttons, dialogs, the logo, the error boundary) |
| Routing and state | `AppContent` as store | feature-owned state, one thin shell | Not started | `AppContent` is under ~600 lines: the view switch, the shell, the providers |
| Process and documents | round documents and logs at the root; `ROADMAP.md` as a journal | `docs/rounds/`, `docs/ops/`, `scripts/ship/`, a short `ROADMAP.md` | `CLAUDE.md` and `docs/business/` are the new pattern; the old files were never archived | §4.6 done and a `.gitignore` that keeps the root clean |

### 4.4 The standard operating procedure — adding or changing a feature

This is the checklist a round follows from now on. It is short on purpose; the reasons live in the sections above.

1. **Name the job in one sentence, and its floor-loop rank.** Check it against the north-star test (§1.3), the fences (§1.7) and the tiers (§1.9). A request that touches a fence is a Section 1 change first.
2. **If it is a new screen, decide how it is reached before it is built** — a bottom-nav item, a tab, or a link from an existing screen — and add the `View` id and the route in the same commit. Nothing ships unreachable (invariant 11).
3. **It lives in `src/features/<name>/`**: `README.md` (the decisions, the collections touched, who can see it, what is deliberately not done); pure logic in `.ts` with `.test.ts` beside it; screens in `.tsx`; tokens from `equipment.tokens.css` or `admin.tokens.css`, no raw hex; a feature `.css` only when Tailwind cannot express it.
4. **If it touches data**: add or update the row in §3.2 *first* (path, owner, read and write scope, status), then the type, then `firestore.rules` with a test in `tests/firestore.rules.test.ts`, then an index if the query needs one. Every query names its studios (`src/lib/tenancy.ts`). Never write a whole document back — only the changed fields. Never write to a collection from inside a listener on that collection. Keep running totals instead of re-reading history.
5. **If it touches the floor loop (Rank 1–3)**: no new taps during a set without removing one; nothing may block a save (invariant 2); mid-session changes stay temporary (invariant 3, guarded by `session-scope.test.ts`).
6. **Verify**: `npx tsc --noEmit` — the error count must not rise above the baseline (**10** as of Sep 21 2026; it was 18 on Sep 12); `npx vitest run src` green; `npm run test:rules` whenever the rules changed; the iPad, portrait and landscape, for any Rank 1–3 screen. AJ's own runs are the ones that count.
7. **Ship**: one branch per round, one commit per phase so any phase can be reverted alone; a ship script when there are deploy steps (indexes → rules tests → rules → push). The round's notes go in `docs/rounds/<yyyy-mm-dd>-<name>.md`, not the root. Update `ROADMAP.md` (short) and this document if a screen, a collection, a tier or an invariant changed.

### 4.5 House rules already written down

Do not restate these here; read them where they live. `CLAUDE.md` — the working rules and the known traps (Mindbody routes need a sign-in; `clients.renewal` belongs to the job; a renewal cycle is checked as a whole document; the Auth uid, not `authTrainer.id`; never a raw control character in source). `src/features/admin/README.md` — the twelve house answers for admin screens (dirty-tracked saves, only the diff is written, plain studio English) and the voice table. `docs/business/` — packages, renewals, roles, data sources, glossary. The feature READMEs — each feature's own decisions.

### 4.6 Repo hygiene plan (approved Sep 12 2026 — "clean it up safely"; **applied Sep 12, commit c0a7014** via `scripts/ship/tidy-root.ps1` — 33 moves, 39 stale files and two patch folders removed, `ROADMAP.md` replaced, the journal archived as `docs/rounds/CHANGELOG.md`)

| Move / delete | To | Why |
| --- | --- | --- |
| `*-ROUND.md`, `*-PROPOSAL.md`, `ADMIN-OVERHAUL-ROUND*.md`, `GO-LIVE-SEP10.md`, `RUN-THIS-MORNING.md`, `HISTORY-ROUND.md`, `IPAD-LIGHTMODE-AND-DATA-ROUND.md`, `LEARNING-PLANNER-ROUND.md`, `RENEWALS-ROUND.md`, `VISUAL-CONSISTENCY-ROUND.md`, `SETTINGS-RBAC-AND-TASK-BOARD*.md`, `TRAINER-PROFILE-AND-KAIZEN-ROSTER.md`, `DEMO-MODE-BRANCH.md`, `PROJECT_TRACKER.md`, `SANITIZATION_NOTES.md` | `docs/rounds/` (dated file names) | They are history, and history belongs in one place |
| `DEV-SETUP.md`, `RENDER-DEPLOYMENT.md`, `TESTING-CHECKLIST.md`, `TRAINER-IDENTITY.md` | `docs/ops/` | Runbooks |
| `ship-*.ps1`, `cleanup-branches.ps1`, `setup-ci.ps1` | `scripts/ship/` | Tooling |
| `register-webhook.js`, `deactivate-webhook.js`, `send-test-webhook.js`, `reset-health.js`, `production-guard.js` | `scripts/mindbody/` | Two of them are one flag from a production incident; they should not sit next to `README.md`. Update the references in `CLAUDE.md` |
| The ~39 `*.log` / `*.txt` run logs | delete; ship scripts write to a gitignored `logs/` | Clutter that confused the clean-tree check once already |
| `patches/`, `patches-machines/` | delete | Both rounds are merged |
| `Claude outputs/`, `harness/` | `harness/` committed (with `harness/dist/` ignored) or its rule moved into `.gitignore`; `Claude outputs/` outside the repo | `harness/` is excluded only by a machine-local file today |
| `components/`, `lib/` at the root | merged into `src/` and the `@/*` alias repointed | The single most confusing thing in the codebase. **Done on `beta-prep`, Sep 17 2026** (beta-prep trim, B3 + C1): `@/` is `src/`, there is one `utils.ts` and one `cn()` |
| `ROADMAP.md` (185 KB) | keep only Now / Next / Later (~150 lines); the "Shipped" archive and "Done" become `docs/rounds/CHANGELOG.md` | A plan nobody can read is not a plan |

**How it will be done safely.** Claude's shell cannot reach the repo (the Sep 8 Windows update), so the moves run from one PowerShell script on AJ's PC, `tidy-root.ps1`, in the ship-script pattern: `report` lists every move and delete without touching anything; `apply` uses `git mv` for tracked files (history follows the file), plain moves for untracked ones, refuses to run on a dirty tree, updates every path reference it moved (`CLAUDE.md`, `package.json`, `render.yaml`, the ship scripts' own log paths), adds `logs/` and the root-litter patterns to `.gitignore`, commits once, and moves itself last. Root `components/` and `lib/` are **not** part of it — that is a code change with an alias repoint and gets its own small round.

### 4.7 Definition of done for a round

A round is done when: the phases are committed one by one on the branch; the typecheck count and the tests are at or better than baseline; the rules tests pass if the rules changed; the Rank 1–3 screens it touched were seen on the iPad; the feature README says what was decided and what was deliberately left; §2, §3 and §5 of this document are updated if anything they describe changed; and the branch is merged and pushed so Render deploys it — or the reason it is held is written at the top of the round document.

---

## 5. Roadmap — current stage versus later

### 5.1 The stage model and its gates

| Stage | Who is on it | The gate to leave it |
| --- | --- | --- |
| **0 · Pre-alpha — now** | AJ only, on production data (627 clients, 203 sessions across 8 clients on Sep 9); no trainers | **Gate A — ready to import:** §3 agreed; the retire list started so the importer targets canonical collections only; the importer built with dry-run / `--commit` / backup; the blank-cell import rule agreed |
| **1 · FileMaker migration** | AJ; the old developers' export | **Gate B — ready for beta:** the Core tier passes the north-star test on the iPad (the checklist); the anti-blocker rule enforced and the four set outcomes live (done Sep 13); **the franchise partition enforced in the rules** (moved up Sep 12 — select franchisees are in beta); CI a required check; a rollback plan written; the wipe tool off the browser |
| **2 · Beta** | A few studios — **a phased rollout of corporate studios and select franchisees together** (decided Sep 12 2026) | **Gate C — ready for every studio:** the three deferred write holes revisited and closed; the new-studio runbook; every studio's roster set up; Demo Mode and the tutorials; the offline and "Mindbody is down" decisions made |
| **3 · Launch** | All ~40 studios | — |
| **4 · Scale** | Growth toward ~100 locations; franchisee onboarding as routine | Automation earns its place only after the manual version has been used |

### 5.2 Now — Stage 0, in order

Everything below is pre-alpha work: AJ is the only user, so the ceremony stays light (no staged confirmations, no dry-run-everything) and the changes just get made, per the Sep 12 working agreement. In order:

1. ~~**Settle the three designs in §3.8**~~ **Done Sep 12** — all eight questions answered (Appendix C).
2. ~~**Repo hygiene**~~ **Done Sep 12** — `tidy-root.ps1 report` then `apply`; commit c0a7014 (§4.6).
3. ~~**The floor round**~~ **Done Sep 13** — six phases, one commit each, delivered as patches with `ship-floor.ps1` (`docs/rounds/2026-09-12-floor-round.md`): (a) the four set outcomes and every average filtered to *performed*; (b) End Session confirms instead of blocking; (c) the per-machine clock persisted and the late-start minutes derived; (d) the progression cue in the Now bar and the briefing; (e) the session-note writers on `journalEntries`, authors on the Auth uid, the dead `handleSaveFocus` deleted; (f) the "not writing notes" tracking dropped from Insights. **Still to do by hand:** the iPad walk of §5.3's first bullet, and AJ's own `tsc` / `vitest` / build on the PC before go-live.
4. **Connect or delete** (§2.7) and the decided deletions: the six dead `View` ids, the legacy `history` view (decided), the hidden panes, the dead hook, the two unreachable handlers, and the `crossTrainAccess` / `crossTrainRequests` collections with their rules and types (decided). Two chores from the floor round ride along: check `functions/src` (the trainer rollups) for exercise-log aggregates that should read performed sets only, and re-run `rollupFromHistory` for clients whose `machineStats` predate the rule.
5. **The perpetual check-in and FORD** — built once §5.7 is answered; the check-in's screen labels change in the same round (the rename).
6. **FileMaker migration prep — the critical path** (blocked externally on the export, buildable now): the field mapping from the FileMaker schema to §3.2 including the blank-cell import rule; the importer in the `scripts/migrate-machine-id.ts` shape; the list of where the two schemas will not line up. And the **Mindbody notes import**, which AJ has said comes first — scope it against `mindbodyNotes` and `journalEntries`.
7. **The ops queue**, none of it degrading: the Render Blueprint sync for `journey-cron-renewals` with its `FIREBASE_SERVICE_ACCOUNT` and Mindbody variables; the renewals dry-run (`npx tsx scripts/run-renewals.ts --pull`); Operations → Renewals settings matched to the Mindbody package names; the collision-checker batching fix for Mindbody's 20-id limit; the `hub_announcements` delete rule and the role-helper sweep.
8. **Credential rotation** — not a lockdown, just a chore: the Mindbody sandbox credentials sit in the public repo's history. About twenty minutes.
9. **Held by choice**: the 136 remaining card and panel recipes from the visual round; admin editability of Catalog and Learning content; Demo Mode (cherry-pick and rewrite per `DEMO-MODE-BRANCH.md`, not a merge); the root `components/` and `lib/` merge with the `@/*` alias repoint. These come after items 1–8 unless AJ says otherwise.

### 5.3 Before beta — Gate B

- The iPad walkthrough (`docs/ops/TESTING-CHECKLIST.md`), Rank 1 first: two iPads on one client; a machine occupied mid-routine; a practice set with no load; a skipped machine with a reason (and a pain skip with "where?"); End Session with one begun-but-uncounted machine; a refresh mid-session with the per-machine clock; Wi-Fi dropped mid-set.
- **The franchise partition in the rules** (§3.4; design decided Sep 12 2026: `networkIds` and `ownedStudioIds` cached on the trainer document) — **moved here from Gate C on Sep 12**, because select franchisees join the beta alongside the corporate studios. The open reads on `journalEntries`, `exerciseLogs` and `progressReports` are scoped in the same round, since a franchisee must not read another network's sets and notes.
- **Security holes stay open through beta by decision (Sep 12 2026)** — a trainer editing their own role and studio lists, any trainer editing any `studios/{id}`, any trainer writing another studio's task instances and requests. The reasoning: every user is verified by hand, so the risk is a mistake rather than malice. They are revisited at Gate C, before the first franchisee. Two things on the security list are *not* lockdowns and stay scheduled: the credential rotation (§5.2 item 8) and a rate limit on the unauthenticated access-request form before launch.
- CI as a required check on `master`, once it has been green about a week; the rules suite promoted from advisory when it is stable.
- The wipe (`executeAppCleanse`) off the browser, or behind an environment guard and an admin-only server route (the demo seeder was deleted in the beta-prep trim, Sep 17 2026); an environment badge in the header outside production.
- A written rollback plan for rules, functions and the front end.
- Firestore offline persistence decided and tested — the one thing that must never be lost is a set a trainer just logged.
- Decide what a trainer does when Mindbody is down or a walk-in is not in it: an unlinked session that reconciles later, an admin-only manual create, or "not today".
- The trainer-identity report run; the migration executed only if it shows stranded or colliding ids.

### 5.4 Beta to launch — Gate C

- **The three deferred write holes revisited and closed** (§5.3; decided Sep 12 2026: Gate C, right before the first franchisee goes live on the app) — a trainer editing their own role and studio lists (closed in the cost round, Sep 16), any trainer editing any `studios/{id}` (closed by My Studio, Sep 19), any trainer writing another studio's task instances and requests (still open). The partition itself is a Gate B item since Sep 12.
- The new-studio runbook: create the studio, set `mindbodySiteId` and `mindbodyLocationId`, provision trainers, set up the roster, verify a booking lands — written once, used on studio 5 and studio 41.
- Roster setup for westlake and Willoughby (empty today), then the tracker and routine builder reading the studio's floor only.
- Demo Mode as the training studio, and the tutorials — the cutover from FileMaker needs them.
- The Monday-morning questions 2–4 as automatic, in-app flags: attendance anomalies (the renewals engine's pace work is the seed), performance discrepancies (clinical review's plateau logic is the seed), incidents (journal kind `incident`). Sentences with minimum samples, never scores. Skip reasons and practice-set counts become a fifth sentence once there is enough of them.
- Mindbody `staff.*` and contract / membership webhook events subscribed, after the client-id collision check.
- An accessibility pass and a cold-load timing on a studio iPad over studio Wi-Fi.

### 5.5 Later — architected for, not built

Automated retention beyond flags (still in-app only); the InBody Web API with one key per studio, kept on the server; the badge and award system for client profiles; a CSV export of a client's full history; time-zone handling for a second zone; `strict` TypeScript (517 explicit `any` today); the Cloud Functions tests in CI; ~~the Machine Trends screen over `machineTrends/*`~~ (built as Operations → Machine fit in the machine-fit round, Sep 17 — settings by build; a LOAD-trends screen over the same documents is still open); the studio-leader Demo Mode track.

### 5.6 Not building

The fences in §1.7, restated as backlog answers: no client app or portal; no outreach of any kind; no booking, billing or payment features; no nutrition tracking beyond the check-in's self-reported fields; no wearables; no AI coaching; nothing for a company other than MSF.

### 5.7 Open decisions for AJ

The eight questions Draft 2 opened were answered on Sep 12 (Appendix C, the "late" entries): *Practice* is the name; the skip vocabulary stands and a swapped machine is recorded as skipped with its reason; not reached is silent; the check-in is a living record (a); FORD is Valuable, fields plus timeline, Dreams separate, on the client record; beta is phased with select franchisees, so the partition moved to Gate B; FileMaker blanks import as *Skipped: unknown (FileMaker)*; security is revisited at Gate C. What the floor round opened, none of it blocking:

1. **The `functions/src` trainer rollups** were outside the floor round (not in the mirror). If they aggregate exercise logs, they need the same performed-only rule before Gate B — Claude can prepare it once the folder is in view; it is Cloud Functions code, so it waits for an explicit OK either way.
2. **Re-running `rollupFromHistory`** for clients whose `machineStats` were built before the rule (a weight-only log used to vote) — a `scripts/*.ts` dry-run / `--commit` chore. Say when.
3. **The pain-map link on a practice set** (`practiceRegion`) is reserved in the type and not yet written — it belongs with the check-in / FORD round, where the body map gets its screen. Confirm that pairing, or ask for it sooner.

## Appendix A — Numbers as of Sep 12 2026

| Measure | Value |
| --- | --- |
| Source files under `src/` | 647 in 59 folders |
| Feature folders / with README / with tests | 28 / 18 / 21 |
| `AppContent.tsx` | 3,126 lines, 45 imports, 28 `useState`, 7 `useEffect` |
| Largest screens | `ClientProfileView.tsx` 180 KB · `WorkoutTrackerView.tsx` 160 KB · `ClientProgressReportView.tsx` 125 KB · `LegacyChartImporter.tsx` 65 KB · `ClientsView.tsx` 64 KB |
| `View` ids declared / routed / dead | 23 / 17 / 6 |
| Client profile tabs · Operations tabs | 7 · 15 |
| Exported types in `src/types.ts` | 66 (52 KB) |
| `firestore.rules` | 2,059 lines · 78 helpers (6 unused) · ~60 collection paths · 3 collection-group rules |
| Composite indexes | 36 |
| `allow read: if isAuthenticated()` lines in the rules | 34 (plus `settingHistory`'s read-write line) |
| Typecheck baseline (`npx tsc --noEmit`, `src/`) | 18 errors (unchanged through the floor round) |
| Tests | 96 files passing on AJ's Sep 12 verify run (`npx vitest run src`; 83 live under `src/`, the rest under `functions/src/`); **87 files / 1,813 tests under `src/` after the floor round** (Sep 13, cloud mirror) |
| Repo root | 23 `.md` · ~39 `.log`/`.txt` · 8 `.ps1` · 5 `.js` · `components/` and `lib/` shadowing `src/` |
| Production | Firebase `gen-lang-client-0731527386`, database `ai-studio-32cbbdcc-6e08-4770-9665-867c68878efa`; Render `maxstrength-app-beta.onrender.com`, deploys on every push to `master` |
| Data on Sep 9 | 627 clients · 203 sessions (8 clients) · ≤16 clients with a contract or membership on file |

## Appendix B — How to keep this document true

- **Section 1 changes only by decision.** Add the date and who said so, the way `docs/business/` does. Never quietly.
- **Sections 2–4 change with the code.** When a round adds, moves or deletes a screen, a collection, a hook layer or a folder, the same commit updates the matching table. The SOP (§4.4, step 7) makes this part of "done".
- **Section 5 is re-cut at each gate.** When a gate is passed, the next stage's list becomes "Now" and the passed items move to `docs/rounds/CHANGELOG.md`.
- **Verify, don't trust.** The screen and collection tables were produced by reading the source and the rules; the rules in production are checked with `scripts/fetch-live-rules.ts`. If a row says "unverified" or "(per README)", it means exactly that.
- **Review cadence.** Read the whole document once at each gate. If a section has not been touched in a month while the code has, assume it is stale and re-derive it.

## Appendix C — Decision log

Dated, in AJ's words where it matters. A decision changes only by another dated entry.

| Date | Decision |
| --- | --- |
| Sep 12 2026 | The north-star test: flawless continuity **and** ruthless adaptability (§1.3) |
| Sep 12 2026 | The floor loop ranked 1–4 with time budgets (§1.4); the leader's four Monday questions (§1.5); the anti-blocker rule — never block a save, don't track who isn't writing notes |
| Sep 12 2026 | Scope fences (§1.7); tenant scope = three corporate studios plus franchisees with 1–3 studios, partitioned by franchise owner (§1.8); feature tiers (§1.9); "check-in" is the one name (§1.10) |
| Sep 12 2026 | **Blank cell: four states** — Performed, Practice, Skipped (with a reason), Not reached (derived). Only Performed counts toward averages and progression; Practice links to the pain map (§1.6, §3.8) |
| Sep 12 2026 | Invariant 3 reaffirmed: on-the-fly adds and removes never alter the base routine |
| Sep 12 2026 | **No security lockdowns for now** — the three write holes stay open while every user is verified by hand; revisited at Gate C (§5.3) |
| Sep 12 2026 | Franchise partition design: cache `networkIds` and `ownedStudioIds` on the trainer document (§3.4); built at Gate C |
| Sep 12 2026 | Cross-train access: delete `clients/{id}/crossTrainAccess` and `crossTrainRequests`; `approvedCrossTrainStudioIds` on the client is the only source (§3.5) |
| Sep 12 2026 | Delete the legacy `history` view (§2.7) |
| Sep 12 2026 | Legacy collections: no strict retirement sequencing; Mindbody notes import first, FileMaker later when the data arrives (§3.3) |
| Sep 12 2026 | The check-in is **perpetual** — reachable from the profile, the briefing, in-session and post-session (§1.10, §3.8; model pending §5.7 #4) |
| Sep 12 2026 | Add **FORD** (Family, Occupation, Recreation, Dreams) for retention (§1.10, §3.8; placement pending §5.7 #5) |
| Sep 12 2026 | Repo hygiene plan approved — "clean it up safely" (§4.6) |
| Sep 12 2026 (late) | **State 2 is named "Practice"** (§1.6) |
| Sep 12 2026 (late) | **Skip reasons approved** — pain or injury (with body area), machine occupied, out of service, client declined or fatigued, trainer's call, other. **A swapped machine is recorded as skipped with its reason, not just removed** — "we want the data on why the routine changed" (§1.6, §3.8) |
| Sep 12 2026 (late) | **Not reached is derived silently at Finish; never prompt the trainer** (§1.6) |
| Sep 12 2026 (late) | **Perpetual check-in = option (a), a living record per client** with snapshots for the 90-day report (§1.10, §3.8) |
| Sep 12 2026 (late) | **FORD: Valuable tier; structured fields AND a dated mentions timeline; Dreams separate from the clinical goal; strictly on the client record for privacy** (§3.8) |
| Sep 12 2026 (late) | **Beta is a phased rollout including select franchisees** alongside corporate — so the **franchise partition rules move up to Gate B** (§1.8, §5.1, §5.3) |
| Sep 12 2026 (late) | **FileMaker blanks import as "Skipped: unknown (FileMaker)"** (§1.6; `importedOutcome()`) |
| Sep 12 2026 (late) | **Security revisit at Gate C**, right before the first franchisee goes live on the app (§5.4) |
| Sep 12 2026 | Repo hygiene applied — commit c0a7014 (§4.6) |
| Sep 13 2026 | **The floor round shipped as six patches** — the four outcomes in code and on the floor, End Session confirms, the per-machine clock and lateness, the progression cue, the journal writers, the Insights change (`docs/rounds/2026-09-12-floor-round.md`) |
| Sep 13 2026 | **Active Session audit answered — the tracker round, eight patches**: the tab resumes a live session after a crash; the 60-minute session-deleting loop removed; clinical session bar (Check-in, trash-icon Discard, one loud Finish); Now bar rebuilt on "weight, then reps — or Practice / Skip"; drag-and-drop Today's order sheet with Do next; the machine sheet no longer truncates; rows fit the screen; **landscape puts the Now bar in a right-hand column**; **time on machine** runs only while a machine is current. Sheets 2–5 the same evening: **End Session submits the session, the post-session screen reads today / the journey / next and never re-saves**; the machine sheet puts notes first and opens the set-up guide on a first-time machine; routines stay profile-only (a mid-session "save as routine" was declined). Sheets 6–8: the Hub lands on now and shows markers (consultation, first session, milestone, birthday, back after a break, away, medical, renewal due) instead of "Training Session", the brand loading mark, the renewal dialog shows past conversations and is reachable post-session, the check-in panel gets keyword search and "last check-in by". **FORD + client mode + the living record are the next round**. Sheets 9–11: the directory reads the contract and shows the recent forty; the profile drops "of 96", lists every trainer on a tap, tabs look like tabs, Journey shows all machines in batches of 50; the briefing is "Before you start" → routine → arrival note (`docs/rounds/2026-09-13-tracker-round.md`) |
| Sep 16 2026 | **The reporting round** — AJ's Client Reports Audit: everything a trainer rates about a client is **the Dial** (five positions; centre = this client's usual, or the right dose; untouched = not asked, never 0; left always worse) and everything they write carries **Loudness** (Note · Heads up · Critical, the journal's three importances). The living assessment is **Pulse**, on the reference document's own frequency words (stored at the 0/3/5/8/10 anchors — scoring unchanged), with client mode and a one-area quick-log from the briefing, the note sheet and the post-session screen; it leaves the Client Progress Report, which shows a read-only snapshot. On the way in: Sleep · Energy · Recovery · Stress (Mood dropped); body regions on the Dial with a "matters until" day; after the session one trainer-judged dose. Notes: capture now, file at teardown; "matters until" on anything loud. The Deep Dive is the **Kaizen Deep Dive** (the caveat line, the rule of three, stalls · readiness vs output · attendance rhythm · pain + Pulse trend · TUT; tonnage retired). Data: optional fields only — `preSessionCheckIn.readiness`, `bodyStates[].dial/until`, `sessions.dose`; the old words are read, never written (`docs/rounds/2026-09-16-reporting-round.md`) |
| Sep 18 2026 | **The Operations audit, four sittings** (`docs/rounds/2026-09-18-operations-audit-prep.md` §E): "admins and owners set standards for Max Strength… but each studio should have full insight and control over its own studio." Relay becomes a section of **My Studio**; three tiers (studio · owner · company) and **the grant** (`managedStudioIds`) so studios grow their own leaders; a studio's leaders hand out trainer, head trainer and the grant, never owner or admin; anyone requesting access can be let in and linked to a Mindbody profile; **machines are adopted, never pushed** and **fields, settings and routines are inherited unless overridden**; a studio may offer a machine to corporate, corporate decides, the published version is adopted at the creating studio; a My Studio announcement per studio, an owners-and-admins one on Operations; "more worry about features rather than permission restrictions" |
| Sep 18 2026 | **Round A (My Studio) built** on branch `my-studio` (`docs/rounds/2026-09-19-my-studio.md`): the four sections, the grant in the app and the rules, `studios/{id}` written by its own leaders (the any-trainer hole closed), the approval caps, `catalogSubmissions` (a new collection, AJ OK'd) with publishing as a script run from the PC (AJ's choice over a Cloud Function). Round B (the Operations side) is next |
| Sep 19 2026 | **"No payroll on the app for now, but do track training hours per week and month per trainer, and the total, for operations."** Hours is a tab; an hour is the booked slot (`studios/{id}.sessionMinutes`), never the stopwatch; the payroll export's owner is still open |
| Sep 19 2026 | **"The Sunday job writes a watch list."** Performance discrepancies (§1.5 #3) are answered by the weekly machine-trends job writing `studios/{s}/watch/performance`, never computed on a page — the per-client query loop was the alternative and the house rule refuses it |
| Sep 19 2026 | **The Operations overhaul** (AJ's build brief, and four calls before the build): Operations is split in two — the studio-management area (nine tabs, always one studio) and the Admins dashboard (corporate-only, administrators and the founder); the first screen is **the Overview**, "not the Monday page"; **the data changes are approved** — the sync's change stamps on bookings, `studios/{s}/watchlist` and `studios/{s}/acknowledgements`, every note's mattering window (Always · From – until · Only on a day, yearly) with a 60-day review, two indexes; the webhook is left alone until its own OK. **The Floor tab looks and edits** — the same floor editor as My Studio → Machines, one implementation, two doors. **Team this week is workload and follow-through**, never ranked; outcomes stay on Insights. **The changes list is Operations-only** for now. Cancellations are held against the day the session was for; a cancellation with another booking that Monday-to-Sunday week reads as a reschedule. Built on branch `operations-overhaul` (`docs/rounds/2026-09-19-operations-overhaul.md`) |
| Sep 19 2026 | **Round B (the Operations round) built** on branch `operations-round` (`docs/rounds/2026-09-19-operations.md`): Hours, one scope for every tab (the Franchise screen folded in; Studios becomes All locations), the Monday page replacing the Overview, the Catalog's standard set as a view and the submissions queue, Delight's row actions, and the audit's fix pile (the e-mail bypass, three confirms, Insights' refused reads, the legacy importer removed, Renewals' settings on My Studio only, the backfill's `createdAt`). One new read-only document type and one index; no Function changed |
| Sep 17 2026 | **How beta will run** (AJ): FileMaker stays in use throughout beta; not every studio and not every session moves to the app at once - a slow transition so trainers get comfortable. **The first studios are tenured corporate ones; franchisees are brought in gradually afterwards.** Feedback, bug reports and ideas are collected throughout. No trainer runs sessions on the app yet; the FileMaker data has been requested from the old developer and is delayed. *Open question this raises:* the Sep 12 (late) row moved the franchise partition rules up to Gate B because franchisees were to join at the start of beta - with corporate first, they may only need to land before the first FRANCHISEE joins (§5.3). Not re-decided. |
| Sep 17 2026 | **Beta prep, and nothing goes to master.** Three phases, in AJ's order: (1) organize and polish - the trim, then Operations and Settings, then transitions / loading states / button states / speed; (2) reconcile `ROADMAP.md` with what is built and test every workflow; (3) Demo Mode and Tutorial Mode, locked until 1 and 2 are done. All of it lands on the long-lived branch `beta-prep`; master stays at `33ad0ed` until he says otherwise. Step 1 shipped: `docs/rounds/2026-09-17-beta-prep-trim.md`. |
| Sep 24 2026 | **"If a session is successfully logged in Journey for a client on a given day, consider it Completed for operational tracking."** No two-way webhook to pull Mindbody's Completed status (manual marking there is fine). One rule, `src/lib/booking-state.ts`, for every screen that reads a booking's outcome: done = a completed Journey session for that client that studio day; otherwise the clock; a failed read of the sessions is unknown, never never logged. The attendance watch counts an unlogged booking as a visit only before the studio's Journey cutover (`docs/rounds/2026-09-24-done-means-logged.md`) |
| Sep 24 2026 | **On the Hub, a card stays live with its flags until the booking is done** (AJ). It fades when a Journey session was completed for that client that day, or once its slot is over. **A finished slot nobody logged fades with a quiet "Not logged"**, because a grey card with no word would read as done. **A card never fades as done before its own start**: a client booked twice keeps the later card's flags, on the floor only. `src/lib/hub-card-state.ts` (phase 6 of `docs/rounds/2026-09-24-done-means-logged.md`) |

*Draft 2, produced Sep 12 2026 from AJ's Stage 1 answers, his decisions on Draft 1, and a read of the staged `master` (the `src/` tree, `AppContent.tsx`, the four largest screens, the hooks, the feature READMEs, `firestore.rules`, `firestore.indexes.json`, `types.ts`, `docs/business/` and `ROADMAP.md`). Draft 3, Sep 13 2026: the eight late decisions applied (§1.6, §1.8, §1.10, §3.8, §5.1–5.4, §5.7, Appendix C) and the floor round recorded (§2.8 rows 1, 2, 4, 5, 6; §3.5; §4.6; §5.2).*
