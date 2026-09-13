# Journey System — App Architecture & Roadmap

**Draft 2 · September 12, 2026 · maintained by AJ with Claude**

This is the master reference for what Journey is, what it is not, how it is put together, and what comes next. Every proposal, round document and code review should point here rather than restate it. When this document and the code disagree, one of them is wrong — fix whichever it is, and note the date.

**How each section was produced.** Section 1 is AJ's decisions, recorded in his words on Sep 12 2026 — it is the part of this document that is *agreed*. Sections 2, 3 and 4 were **derived by reading the source** on Sep 12 2026 (the staged copy of `master`); they describe what the code actually does today, including the places where it contradicts Section 1, and they are **awaiting AJ's review** (Stages 2–4 of the State of the Union). Section 5 is the roadmap that falls out of the other four. Anything marked *proposal* is Claude's recommendation, not yet decided. Appendix C is the dated decision log — the nine questions Draft 1 left open were answered the same evening.

**Where the other documents fit.** `CLAUDE.md` holds the working rules and known traps; `docs/business/` holds the business rules that cannot be read out of the source; each `src/features/<name>/README.md` holds that feature's decisions; `ROADMAP.md` becomes the short living plan (see §4.6). This document is the map that ties them together.

---

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

**The anti-blocker rule.** Journey does **not** track "which trainers aren't writing notes." A veteran client with perfect form needs no note. The app must **never block a trainer from saving a session because a data point is missing**, and skipping data entry must be effortless. A final "are you sure you want to continue without X?" is acceptable; a wall is not. (§2.8 lists where the code breaks this rule today.)

### 1.6 What we are replacing, and what to keep from it

FileMaker was "one big ugly Excel-looking thing", but it had real strengths, and the cutover is judged against them:

- **Eleven days of sessions and every machine performed, on one screen.** Journey's grid fixed the look; it must keep the density. The client profile's Journey grid is the direct heir (the redesign brief asks for ≥20 machines vertically and 14 sessions across, strict minimum 10).
- **Routine generation.** The current routine creator works. Admins must be able to author global and per-studio templates (FileMaker's A/B routines), and trainers must actually be able to use them.
- **The "blank cell" reality — decided Sep 12 2026: four states.** In the old app trainers typed 0, X, "no" or even emojis into a cell; Journey must know conclusively what a cell means, so every planned machine in a session ends in exactly one of four states, stored explicitly:
  1. **Performed** — a standard set to failure. Counts toward every average and toward progression.
  2. **Practice** — the client got on the machine for form, blood flow or recovery. The data (load, reps, time) is **recorded for history but excluded from progression averages**, and a practice set can be **linked to the pain map**, so the record shows what was done to help a specific area. When a client is injured the goal is to keep them training and work around it, not to stop, unless it is too serious. (AJ offered "Practice" or "Untracked"; this document uses *Practice* because the data *is* tracked — confirm or overrule, §5.7.)
  3. **Skipped** — explicitly bypassed today, for a specific reason (an injury, most often). The **reason is recorded**, and over time the reasons themselves become data: why machines get skipped.
  4. **Not reached** — the session ran out of time before this machine. Never asked of the trainer; derived when the session finishes. Leaders and head trainers read the clues around it — how long the trainer spent on each machine, whether the client arrived late, whether the trainer worked on form — rather than the trainer being made to explain.
  Only *Performed* feeds averages, progression, rollups and rep-quality tallies. The data design is in §3.8. FileMaker's 0 / X / no / emoji / blank cells import as *Skipped* with the reason "unknown (FileMaker)" unless the row carries reps (*proposal*).
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

*Finding (§3.4):* the Firestore rules today treat a Franchise Owner as a company-wide role — nothing limits them to the studios in their network. The partition exists only as a screen-side convenience. *Decided Sep 12 2026:* the design is the cheap one — cache `networkIds` and `ownedStudioIds` on the trainer document, maintained by the admin screens, so a rule costs one read — and, in line with the decision to add no write lockdowns for now, it is built at the gate before the first franchisee studio goes live (§5.4), not before.

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
| **check-in** | 90-day progress report, assessment, subjective report | One name from now on — and it is a **perpetual** check-in: reachable from the profile, the briefing, in-session and post-session, not a 90-day event (§3.8, design pending AJ's answer in §5.7). In code it is still `progressReports` (with `isCheckInOnly`), `features/subjective-report` and `features/progress-report`; screen labels change with the check-in round, collection names do not |
| **FORD** | — | Family, Occupation, Recreation, Dreams — the personal details a trainer learns and the studio uses to keep the client (decided Sep 12 2026; design in §3.8) |
| **Practice · Skipped · Not reached** | N/A, blank, 0, X | The four set outcomes (§1.6) |
| Life Transformer | trainer (on screen) | Company vocabulary; internal docs may say "trainer" |
| Hub | To-Do, dashboard | The trainer's home screen (`clients` view) |
| Planner | To-Do | Studio tasks · My tasks · Notes (`studio-tasks` view) |
| Operations dashboard | Admin dashboard | `admin-dashboard` view |
| Learning | Catalog + Academy | One tab, two sections plus the studio's own pages |
| Journey Grid | the chart, the table | The machine-by-session grid, historical and live |

The rest of the studio vocabulary is in `docs/business/glossary.md`.

### 1.11 Product invariants — the rules that follow from the above

These are the rules a code review checks against. They are consequences of §1.3–1.9, written so nobody has to re-derive them.

1. **Eyes on the client.** During a set the app asks for a few taps at most; anything more belongs after the session or off the floor.
2. **Never block a save.** No missing data point stops a session from being finished. Confirm, never wall. (Applies to End Session, notes, check-ins, machine settings.)
3. **Mid-session changes are temporary.** Order, count and choice of machines during a session never write back to the client's routine. Permanent routine changes happen only on the client profile.
4. **Every planned machine ends in one of four explicit states** — performed, practice, skipped (with a reason), or not reached — and only *performed* counts toward averages, progression and rep-quality tallies. Not reached is derived, never prompted. *(Decided Sep 12 2026 — §1.6, §3.8.)*
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

**Bottom navigation — trainer mode:** Hub → `clients` · Client → `profile` (or `client-directory` if no client is selected) · Start Session / Active Session → `workouts` (or `client-directory`) · Learning → the last Learning view · Planner → `studio-tasks` · Calendar → `calendar`.
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
| `history` | **Client history (legacy)** (`components/ClientHistoryView.tsx`) | 4 | The old session-history screen. **The profile now has its own History tab** — this is a duplicate path (§2.7) | unverified | unverified | unverified |
| `calendar` | **Calendar** (`components/CalendarView.tsx` → `features/calendar` Month/Week/Day) | 4 | Read-only month / week / day views of the `schedules` prop with a trainer filter | none of its own | none | profile |
| `studio-tasks` | **Planner** (`features/planner/PlannerView.tsx`; `features/studio-tasks/StudioTasksView.tsx` with `?classic-todo`) | 4 | Studio hub (shift strip, clients waiting, the board, the playbook) · My tasks · Notes | `studios/{s}/taskTemplates`, `taskInstances`, `taskRequests` (+ `submissions`), `playbook`; `trainers/{uid}/taskTemplates`, `taskInstances`, `notes`, `noteFolders`; `clients/{id}/sharedNotes` (per README) | the same paths (per README) | profile, progress-report, consultation-wizard |
| `learning` / `machine-anatomy` / `academy` | **Learning** (`features/learning/LearningView.tsx` → LearningHome, `features/catalog/CatalogWikiView`, `features/academy/AcademyWikiView`) | 4 | Front page and one search; the Catalog (the studio's floor, all MSF machines, notes, tips, playbook, comments); the Academy (generated corpus, lazy chunks) | `machines`, `studios/{s}/roster`, `machineNotes`, `playbook`, `wiki`, `comments` (per README); `studioMachineSettings` via its hook | the same studio paths (per README) | each other |
| `trainer-profile` | **Trainer profile** (`features/trainer-profile/TrainerProfileView.tsx`) | 4 | Coaching-load rollups, about, studio access, Kaizen Roster, upcoming and recently coached | live `trainers` doc; `sessions` by trainer (per README) | `trainers/{uid}.kaizenRoster`, bio and certifications via `EditTrainerModal` (per README) | unverified |
| `trainer-hub` | **Trainer settings** (`features/settings/TrainerSettingsView.tsx`) | 4 | The gear-icon settings screen (bug report, the little that is left after the RBAC teardown) | unverified | unverified | unverified |
| `chart-importer` | **Legacy chart importer** (`components/LegacyChartImporter.tsx`) | 4 | CSV / chart import of a client's FileMaker history | unverified | session history and `client.trainerTally` (per README) | profile or clients |
| `admin-dashboard` | **Operations dashboard** (`components/AdminDashboardView.tsx`, a pure tab router) | 4 | Fourteen tabs in three groups (§2.5). Also renders with no active studio selected | none in the shell; tab components not staged | via props: `studios` update, `clients` update, refresh reads, the demo-client seeder (`clients`, `routines`, `sessions`, `exerciseLogs`), machine restore (`machines`), the wipe | profile, studio-tasks |
| `franchise-dashboard` | **Franchise dashboard** (`components/FranchiseDashboardView.tsx`) | 4 | Network-level view for owners and admins | unverified | unverified | none |

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
4. **The live tracker.** The session bar with the timer (pause/resume → `sessions.pausedAt`, `totalPausedMs`) and the `JourneyGrid` live column plus the Now bar. Each set → `updateLogMultiple` → a debounced merge `setDoc` on `exerciseLogs/{docId}` (flushed on unmount and on `visibilitychange`) and a throttled `sessions.lastHeartbeatAt`. Add, remove or reorder machines → `sessions.sessionMachineIds` (never the routine — invariant 3, enforced by `session-scope.test.ts`). Notes → `SessionJournalSidebar`; the check-in → `ClientCheckInPanel`; the machine sheet → settings, reason and note through the equipment mutations; the machine history dialog reads `exerciseLogs` by client and machine. An unassigned session ends by assigning it to a client or creating a new one.
5. **End.** `handleEndSessionPress` **currently blocks on any set without a count**, then writes `sessions.endTime` and opens the End Session dialog. Confirm → post-session mode. "Abort Session (No Record)" → a second confirmation → `deleteSession` removes `exerciseLogs`, `sessionNotes`, then `sessions/{id}` and returns to the Hub.
6. **Post-session** (`VictoryHUDScreen`): stat tiles from the session's logs, the Feel toggle, a closing note with priority, the optional quick check-in (`QuickCheckInDialog`, saves on its own), and the renewal `LogConversationDialog` (`studios/{s}/renewals/{cycle}` + `touches`). "Finalize & return to Hub" hands `{clientFeel, noteContent, notePriority}` back.
7. **Finalize** (`finalizeEndSession`): flush all pending log writes, then `completeWorkoutSession` (`lib/sync-utils.ts`) completes the session, rewrites `clientMachineSettings.currentWeight` to what was performed and increments `client.trainerTally`; the session and client are cleared and the view returns to the Hub. Trainer rollups are written server-side by the `onSessionRollup` Cloud Function.

### 2.5 The Operations dashboard — fourteen tabs

Reaching it: the App Mode toggle (studio leaders and above) or the studio picker's admin button. Inside, `isFranchiseOwnerOrAdmin` (admin, or the role codes `FranchiseOwner` / `Owner` — not `StudioOwner`, which the roles page also calls a Franchise Owner) gates some tabs and `isAdmin` gates the System Backend group; the Firestore rules are the real enforcement.

| Group | Tab | Component | Who sees it |
| --- | --- | --- | --- |
| Studio Management | Overview | `features/admin` `AdminOverviewTab` | everyone on the screen |
| | Renewals | `features/admin/renewals` | everyone |
| | Studios | `features/admin/studios` | everyone |
| | Staff & Roles | `features/admin/staff` | franchise owner or admin |
| | Clients | `features/admin/clients` | everyone |
| | Catalog | `components/machines/AdminMachinesTab` | franchise owner or admin |
| | Routines | `components/routines/AdminRoutineTemplatesTab` | everyone (authoring gated inside) |
| | Insights | `features/admin/insights` | everyone |
| | Exports | `features/admin-data` | franchise owner or admin |
| Communications | Announcements | `features/admin/announcements` | franchise owner or admin |
| System Backend | Mindbody | `features/admin/mindbody` | admin |
| | Limbo | `components/AdminLimboQueue` | admin |
| | Bug Reports | `features/admin/bugs` | admin |
| | System Tools | `components/AdminSystemToolsTab` | admin |

"Retention" and "Integrations" tabs are gone (the first deleted, the second folded into Mindbody).

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

- Six `View` ids never routed: `trainers`, `machines`, `dashboard`, `chart`, `machine-knowledge`, `mindbody`.
- `history` (legacy `ClientHistoryView`) still routed from the Hub while the profile has its own History tab — two screens for one job.
- `ClientProfileView`'s two hidden panes (`statistics_disabled`, `details_disabled`) with live handlers inside.
- `handleTrainerLogin` in `AppContent` is defined and never called; a second identical `AccessRequestView` branch is unreachable.
- `features/journey-grid/ActiveSessionView.tsx` is not imported by the tracker (which uses `JourneyGrid` directly) — importer unknown.
- `useSessionMachines` (hooks) is dead per the roadmap; four machine hooks overlap (`useMachines`, `useStudioMachines`, `useMachineCatalog`, `features/catalog/useCatalogMachines`) with nothing saying which is the entry point.
- The Insights tab reports "who is not writing notes" (per the Sep 7 round notes; `features/admin/insights` was not staged — verify) — a metric §1.5 says not to track.

### 2.8 Where the code contradicts Section 1 today

These are not bugs in the ordinary sense; they are places where the code was built before a rule was written down. Each one is a roadmap item (§5.2).

| # | Contradiction | Rule broken | Where |
| --- | --- | --- | --- |
| 1 | Ending a session is **blocked** while any set has no count | Anti-blocker (§1.5, invariant 2) | `WorkoutTrackerView.tsx` `handleEndSessionPress` |
| 2 | There is no explicit outcome on a planned machine — a blank cell is ambiguous, and the End Session guard even says "sets without a count are recorded as zero" | The four-state rule (§1.6, invariant 4) | `ExerciseLog` shape, the tracker, averages in `lib/` |
| 3 | A Franchise Owner is company-wide in the rules | Tenant partition (§1.8, invariant 10) — **deferred by decision** to the gate before the first franchisee (§5.4) | `firestore.rules` (§3.4) |
| 4 | The star / kaizen marks are hard to read at a glance in the briefing | Rank 3 needs a faster progress/regress marker | `features/journey-grid`, `features/briefing` |
| 5 | Session start still writes `sessionNotes`; the journal hook still updates `focusRecords`; a dead `handleSaveFocus` in the profile still targets `trainerFocuses` | Half-migrated journal (§3.5) | `WorkoutTrackerView.startNewSession`, `useClientJournal.setFocusStatus`, `ClientProfileView` |
| 6 | Insights reports trainers who are not writing notes (per the round notes; verify) | Anti-blocker | `features/admin/insights` |
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
| `trainers/{uid}/notes`, `noteFolders` | Planner notes (private; ≤10 linked clients) and folders | Journey | self only | self only, shape-checked | canonical |
| `trainers/{uid}/notifications` | the bell | Journey | self only | any trainer may create for someone (as themselves); self updates | canonical |
| `studios/{id}` | `Studio`: owner and head trainer ids, timezone, Mindbody site and location ids, sync lease, `networkId` | config | any signed-in user | admins, franchise owners, leaders, **or any trainer** | canonical; any-trainer write hole |
| `networks/{id}` | `FranchiseNetwork`: `ownerId`, `ownerIds`, `studioIds` | config | any signed-in user | admins, franchise owners | canonical — **never consulted by any rule** (§3.4) |
| `access_requests/{id}` | system-access requests (type 1) and studio-access requests (type 2) | Journey | any signed-in user | type 1 create has **no auth check**; type 2 by the requester; update by admins, owners, or the requester | canonical |
| `crossTrainRequests/{id}` | a trainer asking for cross-train access | Journey | any signed-in user | requester creates; target studio's leaders update | **delete** (decided Sep 12 2026) — `approvedCrossTrainStudioIds` on the client is the only source |
| `clients/{id}/crossTrainAccess/{studioId}` | a grant | Journey | any signed-in user | that studio's leaders | **delete** (decided Sep 12 2026) — no rule reads it; the rules check `clients.approvedCrossTrainStudioIds` |
| `users/{id}` | — | — | admins, self | same | orphan — no type, reader or writer |

**Clients and coaching**

| Path | Holds | Owner | Read | Write | Status |
| --- | --- | --- | --- | --- | --- |
| `clients/{mindbodyClientId}` | `Client`: Mindbody mirrors, coaching fields, running totals, `renewal`, `inbodySummary`, `subjectiveSnapshot` | Mindbody (identity, commercial) · Journey (coaching) · job (`renewal`) | admins, franchise owners, trainers and leaders of the home studio, approved cross-train studios | create/update by admins or the home studio's trainers and leaders, never touching `renewal`; delete admins | canonical |
| `clients/{id}/inbodyScans/{id}` | one InBody 270S scan | InBody, typed in | anyone who can read the client | home-studio trainers and leaders, admins (rules also admit franchise owners); remove: enterer, leaders, admins | canonical |
| `clients/{id}/sharedNotes/{id}` | a Planner note shared onto the client | Journey | anyone who can read the client | author; delete author, leaders, admins | canonical |
| `journalEntries/{id}` | `JournalEntry` — the unified journal (notes, incidents, in-session notes, machine notes) | Journey | **any signed-in user** | any trainer, as author; author and client pinned | canonical |
| `clientFocuses/{id}` | `ClientFocus` — the 4 P's focus model | Journey | any signed-in user | any trainer as owner; owner, admins, franchise owners update | canonical |
| `progressReports/{id}` | `ProgressReport` incl. the check-in (`isCheckInOnly`), `.subjective` | Journey | **any signed-in user** — must never hold InBody numbers | any trainer; delete admins/owners (the profile's delete call is refused for others) | canonical |
| `clientMachineSettings/{clientId}_{machineId}` | the client's dial settings and current weight per machine | Journey | any signed-in user | any trainer; delete any signed-in user | canonical; open read |
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
| `machines/{m-*}` | `MachineCatalogEntry` — the MSF catalog, merged by id over the code defaults in `data/machine-database.ts` | config (admin) | any signed-in user | admins; never deleted | canonical |
| `machines/{id}/settingHistory/{id}` | setting-change audit | Journey | any signed-in user | **any signed-in user, all ops, no shape** | canonical; unguarded |
| `studios/{s}/roster/{machineId}` | `StudioMachineRosterEntry` — which machines this studio owns, their order, status, standards, sharing | config (leaders) | any signed-in user; shared entries via a collection-group rule | admins, the studio's leaders; `studioId` must match the path | canonical — **the** per-studio floor; westlake and Willoughby still empty |
| `studios/{s}/machineNotes/{machineId}` | a floor note on a machine | Journey | any signed-in user | trainers who write for that studio | canonical |
| `studios/{s}/upkeepLog/{id}` | unscheduled upkeep | Journey | any signed-in user | trainers of the studio, create only | canonical, append-only |
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
| `leaderboards/{global \| studio_{id}}` | `LeaderboardDocument` | job | any signed-in user | admins | unknown — its only reader, `useClientPercentile`, is listed as unreachable in `ROADMAP.md`; whether the nightly job writes it is unverified |
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
| **The journal** (Sep 2) | `journalEntries` + `clientFocuses` | `sessionNotes`, `focusRecords`, `trainerFocuses`, `clinicalIncidents` | Read adapter in `useClientJournal` merges all of them; two legacy writers remain (`startNewSession` → `sessionNotes` when a pre-session note was entered; `setFocusStatus` → `focusRecords`), plus a dead `handleSaveFocus` aimed at `trainerFocuses`; the tracker still streams `sessionNotes` and `focusRecords` | Both writers moved to `journalEntries` / `clientFocuses` and the dead handler deleted; legacy rows either imported or left read-only until the FileMaker import; adapter and rules blocks removed |
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

- `firestore.rules`: 2,059 lines, 78 helpers; six are never called (`getTrainerByUID`, `hasAnyTrainerProfile`, `isTrainerOfStudioOrClient`, `isValidMachine`, `isValidNetwork`, `canPostAnnouncements`); two whole predicate families exist side by side by design (`isTrainerOfStudioOnly` ≈ `trainerWorksAt`, `isSuperAdmin` ≈ `roleIsSuper`, `isTrainerOfSessionData` ≈ `sessionIsReadable` — the new one adds the admin/owner bypass; `sessions/{id}/logs` still uses the old one). The JWT-claim fast paths are dead because `setCustomUserClaimsV2` is never called, so every role check costs a document read.
- One rule reduces to "any signed-in user" by accident: `clientMachineSettings` delete (`isSuperAdmin() || isFranchiseOwner() || isAuthenticated()`).
- Type-1 `access_requests` can be created with **no authentication** (by design for the request form; worth a rate limit or a reCAPTCHA before launch).
- `firestore.indexes.json`: 36 composite indexes — `sessions` 9, `clients` 5, `exerciseLogs` 4, and one to two each for `clientFocuses`, `journalEntries`, `progressReports`, `roster`, `schedules`, `sessionNotes`, `focusRecords`, `trainerFocuses`, `mindbodyEventLog`, `playbook`, `wiki`, `comments` — `roster`, `playbook` and `wiki` are collection-group indexes. The machine-db README names two collection-group **field overrides** (`roster.shared`, `roster.basedOn`) that are **not** in the file (`fieldOverrides` is empty) — verify in the console.
- Deploy order when rules only add access: indexes → rules tests → rules → push. The repo file describes intent; `scripts/fetch-live-rules.ts` shows reality — run it after every deploy.

### 3.8 Three designs that follow from the Sep 12 decisions (proposals — confirm before building)

**The set outcome (decided model, proposed fields).** One `outcome` field on `exerciseLogs`: `"performed" | "practice" | "skipped" | "not_reached"`, plus `skipReason` (a short fixed vocabulary — *pain or injury*, *machine occupied*, *machine out of service*, *client declined or fatigued*, *trainer's call*, *other* — with an optional free-text note and a body-area link for pain) and `painMapRef` on practice sets so the pain map can show what was done for an area. How each state is set: *performed* whenever an effort is recorded; *practice* and *skipped* by one tap on the set (the machine sheet, or a long-press on the Today cell — to be designed with the Rank 1 screen); *not reached* written by Finish Session for every machine in `sessionMachineIds` with no log and no mark — never a prompt. Two supporting facts get recorded so leaders can read the "why" without asking: `machineStartedAt` / `machineEndedAt` on each log (the per-machine clock that today lives only in a ref and is lost on refresh), and `startedLateByMinutes` on the session, derived from the booking's `startTime` against the actual start. Every consumer of set data — `client.machineStats`, `trainerTally`, the trainer rollups, the Journey grid analytics column, clinical review, the check-in's machine progression, Insights — filters `outcome === "performed"`. **Backward compatibility rule:** a log with no `outcome` field is *performed* if it carries reps or seconds and *skipped ("unknown")* if it does not, so nothing old needs rewriting. Display: performed as today; practice as the same numbers in a muted, dotted cell; skipped as a small glyph that shows the reason on tap; not reached as an empty cell. (§2.8 rows 1 and 2 are the same round.)

**The perpetual check-in (decision recorded; the model needs AJ's answer).** Today a check-in is a `progressReports` document created as an event (`isCheckInOnly`), with a resumable draft reachable from the briefing, in-session and post-session. "Perpetual" suggests something different: a **living record per client** — every answer carries its own `updatedAt`, `updatedBy` and `source` (profile / briefing / in-session / post-session), any single answer can be updated from anywhere at any time, and the 90-day report becomes a **snapshot** of that record compared with the previous snapshot. Proposed shape: `clients/{id}/checkIn/current` (the living answers; studio-scoped like the client) and `clients/{id}/checkInSnapshots/{date}` (append-only; what the report reads). §5.7 asks which of the two meanings AJ intends, because they lead to different data and different screens.

**FORD (decision recorded; placement needs AJ's answer).** Family, Occupation, Recreation, Dreams — the personal details a trainer learns, used for retention. Proposed shape: four short structured fields on the client record (`ford.family`, `ford.occupation` — which already exists as the occupation field — `ford.recreation`, `ford.dreams`), each with `updatedAt`/`updatedBy`, plus a dated **mentions** timeline ("her daughter's wedding is in June", `kind: "ford"`, category F/O/R/D) so the detail has a date and a reason to bring it up. Surfaced in two places: one line in the briefing ("Ask about…") and the Renewal Brief. **One design constraint that is not optional:** FORD is personal, so it must live somewhere only people who can open the client can read — the client document or a client subcollection under the client-read rule — and *not* in `journalEntries`, which any signed-in user can read today. §5.7 asks about tier, fields-versus-timeline, and whether Dreams should double as the client's stated goal.

---

## 4. Codebase organization — derived and proposed

*Derived from the `src/` tree on Sep 12 2026 (647 files in 59 folders) and the repo root. §4.4–4.7 are proposals for how to work from here; nothing has been moved.*

### 4.1 The layout today

| Folder | What it is for | Size | State |
| --- | --- | --- | --- |
| `src/features/<name>/` | **Where new code goes.** One folder per feature: pure logic in `.ts` with a `.test.ts` beside it, screens in `.tsx`, a README with the decisions, tokens from the shared token files | 28 folders, ~5.5 MB incl. ~1.3 MB of generated Academy JSON | Good. 18 of 28 have a README; 21 of 28 have tests |
| `src/components/` | The pre-`features` world: screens and shared pieces from the Gemini era | 46 files at the top level (1.06 MB) + 24 in `anatomy/`, `client-dossier/`, `journal/`, `machines/`, `mindbody/`, `routines/`, `schedule/` | The three biggest screens live here as single files |
| `src/AppContent.tsx` | The router, the global state store, the app shell, and a pile of handlers | 3,126 lines · 45 imports · 28 `useState` · 7 `useEffect` | The god file |
| `src/hooks/` | Firestore streams and app-level hooks | 16 files | Four overlapping machine hooks; one dead |
| `src/lib/` | Pure helpers: tenancy, permissions, studio time, Mindbody sync and mapping, rollups, machine resolution | 51 files (14 are tests) | Healthy, except the duplicate `utils.ts` at the repo root |
| `src/data/` | Code-default data: the machine database, anatomy map, display order, clinical matrix | 11 files; `machine-database.ts` is 76 KB | Fine; know that `machines/` in Firestore is merged over it by id |
| `src/types.ts`, `src/types/` | The shared vocabulary: 66 exported types in `types.ts` (52 KB), plus `journal.ts`, `machines.ts` and `images.d.ts` | 4 files | Growing by accretion; §3.6 |
| `src/contexts/`, `src/ActiveStudioContext.tsx`, `src/services/` | Toast, Mindbody health, the active studio; the Gemini client | 4 files | Fine |
| `server.ts`, `server/` | Express on Render: serves the build, the Mindbody proxy, the Gemini endpoints, the cron jobs and worker | — | Fine; needs a staff sign-in on every Mindbody route |
| `functions/src/` | Cloud Functions: the Mindbody webhook, trainer rollups, staff photos, nightly facility analytics | — | Tests never run in CI (no test script there) |
| `firestore.rules`, `tests/`, `firestore.indexes.json` | Security rules, their emulator tests (JDK 21), composite indexes | 2,059 lines | The only complete map of the database until §3 |
| `scripts/` | One-off scripts: service-account auth, dry-run by default, `--commit` to write | — | Good pattern; a few live at the root instead |
| `docs/business/`, `docs/msf-academy/` | Business rules; the Academy corpus (219 documents) | — | Good |
| The repo root | 23 markdown documents, ~39 log and text files, 8 PowerShell ship scripts, 5 loose JS scripts, `patches/`, `patches-machines/`, `backups/`, `harness/`, `Claude outputs/`, and a `components/` and `lib/` that shadow `src/components` and `src/lib` | — | The loudest problem and the cheapest to fix (§4.6) |

### 4.2 Where the bloat is

Bloat is not "a lot of code"; it is code in the wrong shape. Four places:

1. **Three god screens** in `src/components/`: `ClientProfileView.tsx` (180 KB), `WorkoutTrackerView.tsx` (160 KB), `ClientProgressReportView.tsx` (125 KB). Each already delegates most rendering to feature components, but the data loading, the handlers and the leftovers (hidden panes, legacy writes) stayed in the shell. These are Rank 1–3 screens, so they get restructured carefully, in phases, with the iPad checked after each — never in one heroic rewrite.
2. **`AppContent.tsx`** does five jobs: routing, global state (28 `useState` hooks), the shell and bottom nav, the app-wide Firestore streams, and one-off admin tools (the demo seeder, machine restore, trainer reorder, the wipe). The tools and the streams can leave first; routing and state last.
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
6. **Verify**: `npx tsc --noEmit` — the error count must not rise above the baseline (18 on Sep 12); `npx vitest run src` green; `npm run test:rules` whenever the rules changed; the iPad, portrait and landscape, for any Rank 1–3 screen. AJ's own runs are the ones that count.
7. **Ship**: one branch per round, one commit per phase so any phase can be reverted alone; a ship script when there are deploy steps (indexes → rules tests → rules → push). The round's notes go in `docs/rounds/<yyyy-mm-dd>-<name>.md`, not the root. Update `ROADMAP.md` (short) and this document if a screen, a collection, a tier or an invariant changed.

### 4.5 House rules already written down

Do not restate these here; read them where they live. `CLAUDE.md` — the working rules and the known traps (Mindbody routes need a sign-in; `clients.renewal` belongs to the job; a renewal cycle is checked as a whole document; the Auth uid, not `authTrainer.id`; never a raw control character in source). `src/features/admin/README.md` — the twelve house answers for admin screens (dirty-tracked saves, only the diff is written, plain studio English) and the voice table. `docs/business/` — packages, renewals, roles, data sources, glossary. The feature READMEs — each feature's own decisions.

### 4.6 Repo hygiene plan (approved Sep 12 2026 — "clean it up safely"; nothing moved yet)

| Move / delete | To | Why |
| --- | --- | --- |
| `*-ROUND.md`, `*-PROPOSAL.md`, `ADMIN-OVERHAUL-ROUND*.md`, `GO-LIVE-SEP10.md`, `RUN-THIS-MORNING.md`, `HISTORY-ROUND.md`, `IPAD-LIGHTMODE-AND-DATA-ROUND.md`, `LEARNING-PLANNER-ROUND.md`, `RENEWALS-ROUND.md`, `VISUAL-CONSISTENCY-ROUND.md`, `SETTINGS-RBAC-AND-TASK-BOARD*.md`, `TRAINER-PROFILE-AND-KAIZEN-ROSTER.md`, `DEMO-MODE-BRANCH.md`, `PROJECT_TRACKER.md`, `SANITIZATION_NOTES.md` | `docs/rounds/` (dated file names) | They are history, and history belongs in one place |
| `DEV-SETUP.md`, `RENDER-DEPLOYMENT.md`, `TESTING-CHECKLIST.md`, `TRAINER-IDENTITY.md` | `docs/ops/` | Runbooks |
| `ship-*.ps1`, `cleanup-branches.ps1`, `setup-ci.ps1` | `scripts/ship/` | Tooling |
| `register-webhook.js`, `deactivate-webhook.js`, `send-test-webhook.js`, `reset-health.js`, `production-guard.js` | `scripts/mindbody/` | Two of them are one flag from a production incident; they should not sit next to `README.md`. Update the references in `CLAUDE.md` |
| The ~39 `*.log` / `*.txt` run logs | delete; ship scripts write to a gitignored `logs/` | Clutter that confused the clean-tree check once already |
| `patches/`, `patches-machines/` | delete | Both rounds are merged |
| `Claude outputs/`, `harness/` | `harness/` committed (with `harness/dist/` ignored) or its rule moved into `.gitignore`; `Claude outputs/` outside the repo | `harness/` is excluded only by a machine-local file today |
| `components/`, `lib/` at the root | merged into `src/` and the `@/*` alias repointed | The single most confusing thing in the codebase (this is a code change: its own small round) |
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
| **1 · FileMaker migration** | AJ; the old developers' export | **Gate B — ready for beta:** the Core tier passes the north-star test on the iPad (the checklist); the anti-blocker rule enforced and the four set outcomes live; CI a required check; a rollback plan written; the wipe tool off the browser |
| **2 · Beta** | A few studios (corporate first) | **Gate C — ready for every studio:** the franchise partition enforced in the rules and the three deferred write holes revisited; the new-studio runbook; every studio's roster set up; Demo Mode and the tutorials; the offline and "Mindbody is down" decisions made |
| **3 · Launch** | All ~40 studios | — |
| **4 · Scale** | Growth toward ~100 locations; franchisee onboarding as routine | Automation earns its place only after the manual version has been used |

### 5.2 Now — Stage 0, in order

Everything below is pre-alpha work: AJ is the only user, so the ceremony stays light (no staged confirmations, no dry-run-everything) and the changes just get made, per the Sep 12 working agreement. In order:

1. **Settle the three designs in §3.8** — the set-outcome fields, the perpetual check-in model and FORD's placement — by answering §5.7. Half a conversation; everything in item 3 depends on the first of them.
2. **Repo hygiene** (§4.6, approved) — Claude prepares `tidy-root.ps1`; AJ runs `report`, reads the list, runs `apply`. One morning, and the root stays clean afterwards because the ship scripts write to `logs/`. Done first because every later round's documents land in `docs/rounds/`.
3. **The floor round — the Core tier brought in line with Section 1** (one branch, one commit per item, iPad check after): (a) the four set outcomes in the data and the tracker (§3.8), and every average filtered to *performed*; (b) End Session confirms instead of blocking (§2.8 row 1); (c) the per-machine clock persisted and the late-start minutes derived, so *not reached* carries its clues; (d) the faster progress-or-regress marker in the briefing and the grid (§1.4, Rank 3); (e) the two remaining legacy writes moved onto `journalEntries` / `clientFocuses` and the dead `handleSaveFocus` deleted; (f) the "not writing notes" sentence dropped from Insights.
4. **Connect or delete** (§2.7) and the decided deletions: the six dead `View` ids, the legacy `history` view (decided), the hidden panes, the dead hook, the two unreachable handlers, and the `crossTrainAccess` / `crossTrainRequests` collections with their rules and types (decided).
5. **The perpetual check-in and FORD** — built once §5.7 is answered; the check-in's screen labels change in the same round (the rename).
6. **FileMaker migration prep — the critical path** (blocked externally on the export, buildable now): the field mapping from the FileMaker schema to §3.2 including the blank-cell import rule; the importer in the `scripts/migrate-machine-id.ts` shape; the list of where the two schemas will not line up. And the **Mindbody notes import**, which AJ has said comes first — scope it against `mindbodyNotes` and `journalEntries`.
7. **The ops queue**, none of it degrading: the Render Blueprint sync for `journey-cron-renewals` with its `FIREBASE_SERVICE_ACCOUNT` and Mindbody variables; the renewals dry-run (`npx tsx scripts/run-renewals.ts --pull`); Operations → Renewals settings matched to the Mindbody package names; the collision-checker batching fix for Mindbody's 20-id limit; the `hub_announcements` delete rule and the role-helper sweep.
8. **Credential rotation** — not a lockdown, just a chore: the Mindbody sandbox credentials sit in the public repo's history. About twenty minutes.
9. **Held by choice**: the 136 remaining card and panel recipes from the visual round; admin editability of Catalog and Learning content; Demo Mode (cherry-pick and rewrite per `DEMO-MODE-BRANCH.md`, not a merge); the root `components/` and `lib/` merge with the `@/*` alias repoint. These come after items 1–8 unless AJ says otherwise.

### 5.3 Before beta — Gate B

- The iPad walkthrough (`TESTING-CHECKLIST.md`), Rank 1 first: two iPads on one client; a machine occupied mid-routine; a practice set with no load; a skipped machine with a reason; Wi-Fi dropped mid-set.
- **Security holes stay open through beta by decision (Sep 12 2026)** — a trainer editing their own role and studio lists, any trainer editing any `studios/{id}`, any trainer writing another studio's task instances and requests. The reasoning: every user is verified by hand, so the risk is a mistake rather than malice. They are revisited at Gate C, before the first franchisee. Two things on the security list are *not* lockdowns and stay scheduled: the credential rotation (§5.2 item 8) and a rate limit on the unauthenticated access-request form before launch.
- CI as a required check on `master`, once it has been green about a week; the rules suite promoted from advisory when it is stable.
- The wipe (`executeAppCleanse`) and the demo seeder off the browser, or behind an environment guard and an admin-only server route; an environment badge in the header outside production.
- A written rollback plan for rules, functions and the front end.
- Firestore offline persistence decided and tested — the one thing that must never be lost is a set a trainer just logged.
- Decide what a trainer does when Mindbody is down or a walk-in is not in it: an unlinked session that reconciles later, an admin-only manual create, or "not today".
- The trainer-identity report run; the migration executed only if it shows stranded or colliding ids.

### 5.4 Beta to launch — Gate C

- **The franchise partition in the rules** (§3.4; design decided Sep 12 2026: `networkIds` and `ownedStudioIds` cached on the trainer document) — before any franchisee studio is on the app. The three deferred write holes are revisited in the same round, and the open reads on `journalEntries`, `exerciseLogs` and `progressReports` close with them.
- The new-studio runbook: create the studio, set `mindbodySiteId` and `mindbodyLocationId`, provision trainers, set up the roster, verify a booking lands — written once, used on studio 5 and studio 41.
- Roster setup for westlake and Willoughby (empty today), then the tracker and routine builder reading the studio's floor only.
- Demo Mode as the training studio, and the tutorials — the cutover from FileMaker needs them.
- The Monday-morning questions 2–4 as automatic, in-app flags: attendance anomalies (the renewals engine's pace work is the seed), performance discrepancies (clinical review's plateau logic is the seed), incidents (journal kind `incident`). Sentences with minimum samples, never scores. Skip reasons and practice-set counts become a fifth sentence once there is enough of them.
- Mindbody `staff.*` and contract / membership webhook events subscribed, after the client-id collision check.
- An accessibility pass and a cold-load timing on a studio iPad over studio Wi-Fi.

### 5.5 Later — architected for, not built

Automated retention beyond flags (still in-app only); the InBody Web API with one key per studio, kept on the server; the badge and award system for client profiles; a CSV export of a client's full history; time-zone handling for a second zone; `strict` TypeScript (517 explicit `any` today); the Cloud Functions tests in CI; `setCustomUserClaimsV2` so role checks stop costing a read; the studio-leader Demo Mode track.

### 5.6 Not building

The fences in §1.7, restated as backlog answers: no client app or portal; no outreach of any kind; no booking, billing or payment features; no nutrition tracking beyond the check-in's self-reported fields; no wearables; no AI coaching; nothing for a company other than MSF.

### 5.7 Open decisions for AJ

The nine questions from Draft 1 were answered on Sep 12 (Appendix C). These are the ones the answers opened, and the one that was not addressed. Nothing in §3.8 is built until they are answered — the point is to work together, not to guess.

1. **The name for state 2** — *Practice* (this document's choice, because the data is recorded) or *Untracked* (AJ's alternative)?
2. **Skip reasons** — is the proposed vocabulary right: *pain or injury* (with a body area), *machine occupied*, *machine out of service*, *client declined or fatigued*, *trainer's call*, *other*? And when a machine is occupied and the trainer swaps in a substitute, is the original *skipped: occupied* with a link to what replaced it, or simply removed from today's sequence?
3. **Not reached needs no trainer input** — confirm it is written silently at Finish Session, with the clues (per-machine time, late start, practice sets) shown to leaders only in the Operations dashboard and the client's history, never as a prompt to the trainer.
4. **"Perpetual check-in" — which meaning?** (a) A *living record* per client where any single answer can be updated from any screen at any time, and the 90-day report is a snapshot of it (§3.8's proposal, a new data shape); or (b) the existing questionnaire, resumable from every screen, still completed as a 90-day event (mostly what exists today plus the profile entry point and the rename). They lead to different data and different screens.
5. **FORD** — which tier (proposed *Valuable*)? Four structured fields, a dated mentions timeline, or both (proposed both)? Should *Dreams* double as the client's stated goal on the check-in, or stay separate? And is it acceptable that FORD lives on the client record so only people who can open the client can read it?
6. **Beta studios** — corporate only? (The Draft 1 question that was not addressed. If yes, the franchise partition can safely wait for Gate C as scheduled; if a franchisee is in beta, it moves to Gate B.)
7. **The four outcomes on the FileMaker import** — blanks and 0 / X / no / emoji rows as *Skipped* with reason "unknown (FileMaker)", or as *Not reached*? (Proposed: Skipped — "unknown" is honest, and it keeps them out of averages either way.)
8. **Security revisit point** — Gate C (before the first franchisee) as written, or later?

## Appendix A — Numbers as of Sep 12 2026

| Measure | Value |
| --- | --- |
| Source files under `src/` | 647 in 59 folders |
| Feature folders / with README / with tests | 28 / 18 / 21 |
| `AppContent.tsx` | 3,126 lines, 45 imports, 28 `useState`, 7 `useEffect` |
| Largest screens | `ClientProfileView.tsx` 180 KB · `WorkoutTrackerView.tsx` 160 KB · `ClientProgressReportView.tsx` 125 KB · `LegacyChartImporter.tsx` 65 KB · `ClientsView.tsx` 64 KB |
| `View` ids declared / routed / dead | 23 / 17 / 6 |
| Client profile tabs · Operations tabs | 7 · 14 |
| Exported types in `src/types.ts` | 66 (52 KB) |
| `firestore.rules` | 2,059 lines · 78 helpers (6 unused) · ~60 collection paths · 3 collection-group rules |
| Composite indexes | 36 |
| `allow read: if isAuthenticated()` lines in the rules | 34 (plus `settingHistory`'s read-write line) |
| Typecheck baseline (`npx tsc --noEmit`, `src/`) | 18 errors |
| Tests | 96 files passing on AJ's Sep 12 verify run (`npx vitest run src`; 83 live under `src/`, the rest under `functions/src/`) |
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

*Draft 2, produced Sep 12 2026 from AJ's Stage 1 answers, his decisions on Draft 1, and a read of the staged `master` (the `src/` tree, `AppContent.tsx`, the four largest screens, the hooks, the feature READMEs, `firestore.rules`, `firestore.indexes.json`, `types.ts`, `docs/business/` and `ROADMAP.md`).*
