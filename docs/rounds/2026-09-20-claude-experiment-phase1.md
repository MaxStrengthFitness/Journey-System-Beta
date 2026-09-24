# The Claude Experiment — Phase 1: Deep Interpretation & Anomaly Detection

**Branch:** `claude-experiment` · **Date:** Sep 20 2026 · **Base:** `master` @ `a064019`
**Status:** Analysis only. Nothing in this round changes a line of application code.

AJ asked for maximum creative liberty and deepest analysis, and for the codebase to be
scrutinized without holding back. This is the Phase 1 answer: what I think Journey *is*,
what I think is wrong with it, and the questions I need answered before Phase 2.

---

## 0. How this was produced, and what is actually verified

A clean clone of `master` at `a064019` was installed in a cloud container and the baselines
re-measured: **`npx tsc --noEmit` → 10 errors**, **`TZ=America/New_York npx vitest run src` →
3,516 passing in 237 files (one skipped)**. Both match `CLAUDE.md` exactly.

Eight parallel reviewers each read one area end to end — the Active Session, the app shell,
the client, machines, studio operations, the backend and rules, the design system, and
types/tests/hygiene — with instructions to read code rather than grep-and-guess, and to cite a
verified `file:line` for every claim. Between them they made about 1,000 tool calls. Their raw
reports are the evidence base; this document is the synthesis.

**Also read:** all 17 FileMaker iPad screenshots (the system Journey replaces), the nine MSF
Academy consultation documents, `CLAUDE.md`, `docs/ARCHITECTURE.md`, `docs/business/*`,
`docs/KNOWN-TRAPS.md` and every feature README.

**Verification status.** Every finding below carries a `file:line` that a reviewer read. I
personally re-verified the twelve most consequential claims by opening the file myself —
they are marked **[verified]**. Three further measurements I ran directly:

| Measurement | Result |
| --- | --- |
| `npx tsc --noEmit --strict` | **97** errors (vs the 10 baseline) |
| `npx vitest run functions` | **14 files pass in 4.4 s** — and no command in the repo runs them |
| Clean-clone test run | 6 files fail, `tsc` reports 12 — purely because `firebase-applet-config.json` is gitignored (see pattern 5) |

Where `ARCHITECTURE.md` already names a problem I say so and add only what is new. Several of
its claims are now **stale** — §2.3 says seven profile tabs (there are four), Appendix A's
`AppContent` numbers are from a 3,126-line version (it is 2,615), §2.7 says the `View` union is
16 live ids (it is 17, one dead), and §5.7 #1 asks whether the trainer rollups aggregate
exercise logs — **they do not**, so that question can be closed.

---

## 1. What Journey is — my interpretation, for you to audit

### 1.1 In one paragraph

Journey is a coaching system for a franchise that sells a **method**, not a gym. A trainer runs
a client through five to eight machines in twenty minutes, one set to failure each, holding an
iPad in the non-dominant hand and setting it down at every machine. The app is a **guide for
set-up and a log for outcomes** — never a coach, never a progression suggestion. Mindbody owns
people, bookings and money; Journey owns everything about the coaching. Studio leaders run and
read the studio from the same app. It is replacing a twelve-year-old FileMaker system that
collected hundreds of sessions a week and did nothing with them, and the whole point is to
finally use that data.

### 1.2 The domain model, in the studio's own words

Five things exist, and everything else hangs off them:

**A client** is a Mindbody person (`clients/{mindbodyClientId}` — the document id *is* the
Mindbody id, and there is no name matching, ever). The document is enormous: Mindbody mirrors,
coaching fields, running totals, the nightly renewal snapshot, InBody summary, FORD, machine
stats. **A session** is twenty minutes (`sessions/{id}`), scoped by *client* not studio — which
is the load-bearing decision that keeps a cross-training client's history whole. **A set** is one
machine in one session (`exerciseLogs/{sessionId}_{machineId}[_side]`), and it ends in exactly
one of four states: performed, practice, skipped-with-a-reason, or not-reached. Only *performed*
feeds any average. **A machine** exists in three layers — the corporate catalog (`machines/{id}`),
the studio's own unit (`studios/{s}/roster/{machineId}`), and the client's settings for it
(`clientMachineSettings/{clientId}_{machineId}`). **A note** is supposed to be one thing
(`journalEntries`) with a Loudness and a mattering window.

The governing sentence for machines is *"Max Strength owns the method; a studio owns its
hardware."* Method is the remainder — a new field defaults to corporate — and safety is
additive: a studio may add a warning, never remove one.

### 1.3 The three days the app serves

**The trainer's twenty minutes (Rank 1).** Walk up to the machine → read *which machine, what
settings, what weight, how did she do last time* → set the client up → run the set → walk away
→ log *reps, quality, anything to note*. Twice per machine; twelve touches in a six-machine
session. Between machines is one to two minutes, and almost all of it is the client. Three
timers exist and are never the same thing: session elapsed, time-on-machine (an estimate, the
app keeps it silently), and set duration (the stopwatch, which is the only place true
time-under-tension is ever captured). The red kaizen ring is one tap and means *any of the four
P's broke* — no picker, because a menu clutters the system.

**The leader's day (Rank 4).** Operations opens on an Overview built around time — today, what
needs you, the next three days, the week — where nothing is a score: a sentence with its proof,
an action, and a door. The four Monday questions in priority order are renewals, attendance
anomalies, performance discrepancies, pain and incidents. My Studio is where a leader *runs* the
studio; Operations is where they *look at* it.

**The company's standard.** The Admins dashboard holds the master catalog, the standard template,
every location, Limbo, system tools. Administrators and the founder only.

### 1.4 How it is actually put together

React 19 + TypeScript + Vite + Tailwind 4, no router: one `currentView` state in
`AppContent.tsx` switches sixteen views. Firestore is the database and the security rules are
the real enforcement layer (2,626 lines, 97 helpers). An Express service on Render serves the
build, proxies Mindbody behind a staff sign-in, and hosts two Gemini OCR endpoints. Cloud
Functions handle the Mindbody webhook, trainer rollups and claims. Two Render cron jobs run
renewals nightly and machine trends weekly. Every push to `master` deploys to trainers.

**212,643 lines across 1,038 files in `src`**, 223 test files, 3,516 tests.

### 1.5 Where I might be wrong — please correct these

1. I have read the code and the docs but have **never seen the app run on an iPad**. Every
   ergonomic claim below is computed from CSS heights and markup, not observed. If the Now Bar
   feels fine in the hand, say so and I will re-weight everything in §3.3.
2. I am treating `docs/business/the-floor.md` as the specification and the code as the thing
   being judged against it. If the floor doc is aspirational rather than agreed, several
   "anomalies" become "not built yet", which is a different conversation.
3. I assume **no trainer is running real sessions in Journey yet** (your Sep 17 note). If that
   changed, the severity ranking changes with it.
4. I assume the FileMaker screenshots you sent are representative — 12 sessions per page, a
   fixed machine order, settings as per-machine label/value pairs in column 2, and a blue
   circled number in each cell that is the *order the machine was performed*. If that circled
   number means something else, tell me: it drives a real recommendation in Phase 3.
5. I have assumed **"Life Transformer" is the on-screen word for a trainer**. The code has
   quietly decided otherwise (~93 user-facing strings say "trainer", one says "Life
   Transformer"). I do not know which is current.

---

## 2. The seven patterns

Eight reviewers produced roughly two hundred findings. They are not two hundred problems. They
are seven, each appearing in five to thirty places. The patterns matter more than the list,
because each one is a single decision that fixes a whole column of symptoms.

### Pattern 1 — The floor reads the old world

**This is the most important finding in the document.** The app has a genuinely good three-layer
machine model, one merge policy (`src/lib/resolve-machine.ts`), a template boundary that encodes
the company's franchise doctrine (`src/lib/machine-template.ts`), and a full-screen editor for it.

**The Active Session does not use any of it.** `WorkoutTrackerView.tsx:2050-2054` reads the
legacy `machine.settingOptions` / `standardSettings` off the app-wide `machines` prop. It calls
`useStudioMachines` — and uses the result for exactly one thing: `order` (`:2028`). So a studio's
own dial labels, its custom machines, its corrected defaults, anything set in "Set up for us",
and every catalog `settingFields` correction reach the **Learning → Catalog page and nothing a
trainer holds during a session.**

`StudioInventoryManager.tsx:408` tells the leader *"Trainers running a session here see exactly
this list."* That sentence is false.

`ARCHITECTURE.md` §3.5 already lists this as a half-migration. What is new is how much now
depends on it: the machine-authoring round (Sep 20), My Studio → Machines, the catalog
submissions queue, "We don't have this", and the whole franchise doctrine are all downstream of
a reader that does not exist yet.

It gets worse in two specific ways:

- **`src/lib/utils.ts:342-362` invents `Gap 0` for every machine and every client. [verified]**
  With nothing on file, `mergedSettings["Gap"] = "0"` — so a client with no settings at all reads
  `G 0` on the Now Bar, the grid rail and the Equipment rail. The generated catalog says the
  Academy's starting gap is 2 on the row, pulldown, pullover, press and flye. A confident wrong
  number on the screen the trainer looks at twice per machine. It also makes the honest empty
  state (`JourneyGrid.tsx:490`, "No machine settings saved for this client") unreachable.
  `equipment/adapters.ts:65` goes further and *writes* `gap: "0"` as a typed value on first
  set-up, where machine trends and machine fit then count it as evidence.

- **`WorkoutTrackerView.tsx:2072-2082` keys a machine's dials by their first letter.** On the Leg
  Press, `Seat Angle`, `Shoulder Pads` and `Seat Distance` all shorten to "S" and only the last
  survives. A client saved at Seat Angle P2 · Seat Distance 7 · Shoulder Pads 3 reads as
  *"Gap 2 · Shoulder Pads 3"*. The seat position is silently gone, on the most-used machine.

**One decision fixes the column:** point the tracker and the profile at `useStudioMachines`
before any further machine work.

### Pattern 2 — The write side never converged; the read side compensates

Every round added a field. Nothing ever removed one. The read adapters are the scar tissue.

| One idea | How many homes | Where |
| --- | --- | --- |
| A note | **~14 concepts in ~25 places** | `journalEntries` + 4 legacy collections + `sessions.notes` + `preSessionCheckIn.note` + `skipNote` + `machineNotes[]` + FORD bodies + Pulse prose + report prose + 5 record textareas + Relay notes ×3 copies + reasons + renewal touches |
| A machine | **6 stored shapes + 6 view shapes** | `Machine` (70 importers) vs `ResolvedMachine` (2 importers) — and `types/machines.ts:23` says components consume the latter |
| The client's goal | **5 stores that never sync** | record, report goals, milestones, roadmap, strategy |
| "This machine is broken" | **4 stores** | `machineCare.flag`, `taskInstances.flagged`, `upkeepLog`, `roster.status` |
| A studio's standard settings | **3 stores** | roster `overrides.defaultSettings`, legacy `studioMachineSettings`, `Studio.machineSettings` (**6 readers, 0 writers**) |
| "Who am I" for authorship | **4 idioms** | `authTrainer.id` (23 sites) · `auth.currentUser?.uid` (36) · two fallback chains |
| "Is this person a leader" | **10 modules** | and they disagree — the rules include `Overseer`, the app's `isAdmin` does not |
| A date | **5 representations** | Timestamp-as-`any`, ISO string, `YYYY-MM-DD`, epoch, "either" by comment — across 4 converter modules and 16 duplicated helper names |

`useClientJournal.ts` opens **seven live listeners** per mount to merge six collections plus
three in-memory adapters. The Notes & Profile tab holds **fifteen live listeners on one client**.
Seven independent readers query `sessions where clientId ==` with seven different limits (50,
40, 200→2,000, unbounded, live, unbounded, by range) and no shared cache.

The house rule *"every number has a reader"* is enforced. Its inverse — **every reader has one
writer** — is not, and that is where the disorder lives.

### Pattern 3 — Confident wrong numbers, manufactured by defaults

`CLAUDE.md`'s sixth invariant is *"a confident wrong number is worse than a missing one."* The
code breaks it the same way repeatedly: a fallback that is indistinguishable from data.

- `Gap 0` for every machine (above).
- `ClientProfileView.tsx:1420` — `parseInt(client?.weight || "150")` hands the Equipment tab a
  150 lb client when weight is blank.
- `CreateClientModal.tsx:89` — writes `height: "5'10\""` on every hand-made client, and height
  is *"used for machine set-up suggestions"*.
- `ClientProgressReportView.tsx:1559` — when the trainer's notes are blank, the **printed
  client-facing report** prints *"Your neurological adaptations are now clearly visible in the
  data. Your force output is reaching peak clinical efficiency."*
- `WorkoutTrackerView.tsx:978` and `VictoryHUDScreen.tsx:320` — the session bar says `#4` and the
  post-session tiles say "Sessions 4" for a migrated client with 300 FileMaker sessions. Neither
  file imports `prior-history.ts`.
- `functions/src/index.ts:120` — `averageSessionsToTrend: 12, averageWeeksToTrend: 4` written
  into an analytics document as if measured, with the comment "Baseline structural stat".
- `geminiService.ts:117` — a missing date in an import is filled by **adding four days to the
  last good one** and stamped as real.
- `AppHeader.tsx:30` — the studio name defaults to `"SOLON"`, so an iPad whose studio has not
  resolved reads "SOLON" at Strongsville.

### Pattern 4 — The trainer's hands are in the wrong place

Measured against `the-floor.md`'s own target of twelve touches in a six-machine session:

| Action | Taps today |
| --- | --- |
| Core loop per machine (count → quality → Next) | **4–6** → 24–36 per session |
| Static hold with the stopwatch | 4 (on a 22 px switch and a 30 px play button) |
| Change the weight by 10 lb | 4–5 (a hard-coded 2 lb step, `:2381`) |
| Skip with a reason | 2, or 3–5 for a pain skip |
| Practice *with* a count | 5–6, and only in that order |
| Hub → Active Session | 3 |

**The keyboard is the problem.** `SessionNowBar.tsx:360` is a plain `<input inputMode="numeric">`
with no `autoFocus` and no key handler, so the iPad system keyboard slides up **over the Now Bar**
and Next sits underneath it — a field tap, digits, and a dismiss, per set. The app already owns
the fix: `machine-fit/ui/QuickPad.tsx:4-10` is a docked pad whose header describes this exact
cost in exact words. It is used on Setup and not on the floor.

**Nine controls on the live screen are under the 40 px rule**, four of them on the per-set path:
REPS|SEC at **22 px**, stopwatch play at 30 px and reset at 24 px, the rail's four controls at
~22 px, the grid `+` at 28 px, pause at 32 px, "Do next" at 36 px. In "Show: All", rows shrink to
**26 px**. And the shared `Button` primitive's entire size ladder is 24/28/32/36 px — **not one
variant reaches 40**.

**Everything pressed every session except the set is at the top.** Notes and Pulse, the flag
marker and pause all live in the top 86 px; the set and Next live in the bottom 210 px. On a held
portrait iPad, the Notes door — one of the five things `the-floor.md` says a trainer writes
*during a set* — is the farthest point from the thumb.

And **nothing confirms a logged set without being looked at.** No haptic, no sound, no large
persistent state change. The confirmation is a fill-and-border swap on a 64 px input. The doc's
trainer sets the iPad down and looks away.

### Pattern 5 — The right thing was built and never connected

This is the most frustrating pattern, because in every case the work is already done.

- **`src/lib/prior-history.ts:111` is headed "THE IMPORTER'S CONTRACT"** — an importer writing
  *n* historical sessions must call `recordImportedSessions` or the total drifts by *n* forever.
  **Its only callers are its own test file. [verified]** So every OCR import to date has
  permanently double-counted. The irony is on record: `AdminDataReportsTab.tsx:15` says the
  *other* importer was deleted partly because it had this exact bug.
- **`LegacyChartImporter.tsx:257` computes `isAnomalous` and `anomalyReason`** for every row whose
  machine did not resolve. Neither field is read anywhere. `legacy-import-utils.ts:38` computes a
  `droppedLogs` list for the same purpose; its only reader is its own test. Unmatched machines are
  dropped silently at `:412`, `:573`, `:650`.
- **`functions/` holds 14 test files that pass in 4.4 seconds [verified]** — webhook signature
  verification, idempotency, the dead-letter queue — and `package.json:18` is `"test": "vitest run
  src"`. CI never mentions `functions`. The highest-consequence code in the repo has no gate.
- **`src/lib/scroll-lock.ts` is written entirely against Radix**, which the app no longer uses (it
  is on `@base-ui/react`). Its selector guard matches nothing; the iPad frozen-screen protection
  is a no-op with 90 lines of comments pointing the next reader at the wrong library.
- **`isValidMachine` and `isValidNetwork` exist in the rules and are never called** — and the two
  collections they validate have no shape check on create.
- **`Studio.machineSettings` has six readers and zero writers.** The first branch of six
  precedence chains is dead.
- **`client.priorityNote` / `hasPriorityNote` have two readers and no writer. [verified]** Which
  means the Hub's red flag — the *"small marker at the top"* `the-floor.md` asks for — **cannot see
  a Critical note written in Journey**, while `types/journal.ts:426` tells the trainer it can.
- **`analytics/facilitySummary` is written nightly by a job that reads every client, every session
  and every exercise log with no window, and nothing reads it. [verified]**

### Pattern 6 — Nothing fails alone

- **One error boundary wraps the entire shell** (`AppContent.tsx:1498`). A render error anywhere —
  the notification sheet, the feedback drawer, a layout effect — replaces the Active Session with
  "Something went wrong · Reload", mid-set.
- **One `currentView` state**, set from 39 call sites, with four ad-hoc "intent" mechanisms bolted
  on (`learningJump`, `requestPlanner`, `section-memory`, a `sessionStorage` handoff) because there
  is no route to carry a parameter.
- **A refresh loses everything.** Only the studio and the theme survive; a live session is *offered*,
  never resumed. A Safari refresh mid-set — a real event on iPadOS — drops the trainer on the Hub.
- **One shell streams ~300 full `Client` documents** to every iPad (the document carries machine
  stats, contracts, renewal, goal history, events, snapshots), re-pushed on every completed session
  and every nightly job. Estimated cold load: **700–1,000 documents, 3–6 MB** before the first
  screen is useful.
- **One 3,372-line component draws three screens**, with 38 `useState` (8 dead), 20 `useEffect`,
  and a 1 Hz `setState` at its root that re-renders everything every second because the child props
  are rebuilt each render and the `memo`s never hold.
- **One 2,626-line rules file** with 97 helpers, tested by a suite CI is allowed to fail
  (`continue-on-error: true`) covering 34 of 67 collections — and not covering `journalEntries` or
  `progressReports`, the two holding the most sensitive text.

### Pattern 7 — The floor is the least protected thing in the app

| | The floor | Admin / off-floor |
| --- | --- | --- |
| Share of feature code | ~38 % | **62 %** (admin 25 K + relay 14 K + studio-tasks 10 K + …) |
| Test cases | **212** | 599 in `features/admin` alone |
| Render tests mounting it | **0** | 11 for admin screens |

`src/components/` — which holds `WorkoutTrackerView` (3,372), `ClientProfileView` (1,863),
`ClientProgressReportView` (2,387) and `ClientsView` (1,519) — has **three test files and 19 test
cases**. `WorkoutTrackerView`'s only "coverage" is a test that reads the file **as text** and
asserts on the source string.

The pure libraries under it are genuinely well tested (`set-outcome`, `machine-clock`,
`tracker-screen`, `live-session` — these are as good as tests get). So a green suite proves the
*rules* are right. It proves nothing about the *wiring* on the one screen a trainer holds in one
hand — and findings like "Keep Training freezes every machine clock" and "the auto-close effect
fires on the first rep digit" are exactly what a single mounted test would have pinned.

---

## 3. The findings that need a decision

### 3.1 Data safety — things that can lose or corrupt a record

1. **Session start writes N non-merge `setDoc`s *after* the screen is already live. [verified]**
   `WorkoutTrackerView.tsx:1268-1321` — the seeds carry no `{merge: true}`, and they are `await`ed
   one per machine while the listener has already switched the trainer to the tracker. Offline,
   `setDoc` never resolves; when the network returns the loop resumes and machine 2..N's
   placeholders **replace** whatever was logged in the meantime. *"The app needs to act as pen and
   paper in terms of reliability."* → one `writeBatch` with `merge`, before the screen is visible.

2. **Every FileMaker import double-counts, permanently.** The contract has no caller (pattern 5).

3. **A re-import silently doubles five counters.** `LegacyChartImporter.tsx:369` mints a fresh
   random session id every run; `completedSessions`, `lifetimeReps`, `lifetimeWeight`,
   `trainerTally.*` and `machineStats.*` all `increment()`, and `onSessionRollup` counts each
   duplicate onto the trainer's lifetime too. No dedupe key, no dry run, no undo. **A deterministic
   document id turns this from a disaster into the recovery path, in one line.**

4. **The import commits in 450-op batches with no transaction boundary.** A 60-session client is
   ~500 operations in two commits; if the second throws, the sessions exist and the counters do not.
   The toast says "Finalization failed. Check Firestore quotas."

5. **`LocalSetupDialog.tsx:83` writes roster overrides with `setDoc(..., {merge: true})`** and
   `buildClone` sets `status: "active"` unconditionally. A leader marks the leg press out of
   service, adds "pin sticks" — and the floor sees it active again. This is the exact trap
   `KNOWN-TRAPS.md` recorded the same day, and `StudioMachineEditor.tsx:145` already avoids.

6. **The import rebuilds `currentMachineMetrics` from a streamed copy and writes the whole map
   back** (`:534`, `:630`), overwriting anything written while the import was being reviewed.

7. **"Keep Training" freezes every machine clock for the rest of the session.**
   `WorkoutTrackerView.tsx:1485` sets local `isPaused` without writing `pausedAt`, so the session
   bar keeps running while time-on-machine silently stops accruing.

8. **Finish cannot complete without Wi-Fi.** The trainer sees a disabled "Saving…" for the length
   of the outage, with no message and no way to open the next client — although the write is already
   safe in the local cache. The app enables offline persistence and **never shows offline anywhere**.

### 3.2 Security — before a franchisee signs in

| # | Finding | Where |
| --- | --- | --- |
| 1 | **Any signed-in Google account can delete any client's machine settings** — `isSuperAdmin() \|\| isFranchiseOwner() \|\| isAuthenticated()` makes the first two decorative, and the read above it is bare `isAuthenticated()` so they can enumerate first. **[verified]** | `firestore.rules:1338` |
| 2 | **A machine's audit trail is read-write to any signed-in account.** An audit trail anyone can rewrite is not an audit trail. **[verified]** | `firestore.rules:1358` |
| 3 | **Both Gemini endpoints are unauthenticated**, declared above the `requireStaff` mount, with a **50 MB body limit and no rate limiting anywhere in the repo**. An anonymous POST spends your Gemini quota; a few concurrent 50 MB bodies OOM a 2 GB single-process instance. **[verified]** | `server.ts:87`, `:103` vs `:187` |
| 4 | **A Franchise Owner is still company-wide** — reads every session and every client at every studio. §1.8 moved this to **Gate B, before beta, because beta includes franchisees.** Not built. | `firestore.rules:109`, `:317`, `:1230` |
| 5 | **The production database can still be wiped from an iPad** behind one typed phrase — and the wipe is neither complete (it orphans `journalEntries`, `progressReports`, `ford` and every studio subcollection) nor honest (the dialog promises to re-create the 20 machines; the code does not). | `AppContent.tsx:943` |
| 6 | **`setCustomUserClaimsV2` grants Admin to any signed-in caller if `trainers` is ever empty** — which #5 can arrange. Nothing calls it. | `functions/src/index.ts:241` |
| 7 | **`?view=trainer-hub` impersonates another trainer**, replacing the signed-in person's profile; every subsequent `authorId` carries someone else's identity. A mock "Owner Tim" ships in the bundle. | `AppContent.tsx:881` |
| 8 | **A hard-coded personal e-mail in the shipped client creates an Admin profile**, and keeps an in-memory Admin even if the write is refused. | `useAuthInitialization.ts:173` |
| 9 | `access_requests` type-1 creates need **no authentication**; both real writers are signed in anyway. | `firestore.rules:2480` |
| 10 | **`firestore.staging.rules` is a 571-line fork that denies 32 collections** the app uses, and is never tested. | — |

**Not a finding, worth stating plainly:** I checked every tracked file and all 554 commits in this
clone — **no key, password or credential value is committed anywhere.** `render.yaml` marks every
secret `sync: false`; `.env.example` has field names only; `setup-firebase-config.cjs` explicitly
refuses to print values. That part is clean and well done. The open question is whether Mindbody
credentials were exposed *before* this clone's history begins, and whether they were rotated.

### 3.3 The floor — ergonomics and trust

Beyond pattern 4's tap counts:

- **The Hub's red flag cannot see a Critical note** (pattern 5), and **a late client loses every
  flag the moment the booking time passes** — `ScheduleBlock.tsx:77` derives "completed" from the
  clock, so at 9:01 for a 9:00 booking the priority triangle, the Pulse flag and the clinical dot
  are all removed, exactly when the trainer looks.
- **A tab tap unmounts everything.** Base UI's `Tabs.Panel` defaults to `keepMounted = false` and
  nothing overrides it, so the record's unsaved medical edits, Setup's drafts and the generated
  Deep Dive all die when the trainer glances at Journey — and every return re-runs the 50-session
  query and five log chunks.
- **Three saves refuse without a typed reason** (a settings change mid-session, a routine edit, and
  turning Routine B on) against *"never block a save"* — and against `the-floor.md`'s own account of
  why trainers stopped recording in FileMaker.
- **Removing a machine mid-session records nothing**, against the Sep 12 decision that a swapped
  machine is recorded as skipped with its reason. The reason vocabulary exists and is unreachable
  from the `×`.
- **Practice replaces the count field**, so a practice set can only carry numbers typed *before*
  Practice was chosen — while the natural floor order is "she got on it — that was practice — she
  did 8".
- **Every counted set is stamped `repQuality: 2` the instant a digit is typed** (`:2334`). That is
  a default the app made, stored in the same field as a judgement the trainer made.
- **`timeSpent` has no honest reader.** Written as seconds-on-machine; read by the briefing as a
  *hold's* duration ("Last: 120 sec" can be two minutes of belting-in) and by a nightly Cloud
  Function as `averageTimeUnderLoad`. The leader-facing sentence `the-floor.md` promises — *"no time
  on this one, most of the session on leg press"* — is on no screen.

### 3.4 Design system — measured

The design system is really **three systems stacked**, and the newest one is good.

The newest feature screens — `SessionNowBar`, `JourneyGrid`, `BriefingScreen`, `MyStudioView`,
`OverviewPage` — contain **zero** Tailwind colour classes and zero hex. They are pure BEM against a
feature token file, and the Now Bar's own controls are 44/42/46 px with `touch-action: manipulation`
and a correctly `@media (hover: hover)`-guarded reveal. That is the standard to spread.

Everything else, measured:

| Measure | Value |
| --- | --- |
| Distinct hex colours in play | **293** in 1,569 occurrences — **185 of them within RGB distance 12 of another** |
| Brand oranges / blues | **5–6 / 6** |
| `rgb()/rgba()` literals (invisible to a hex grep) | 245 |
| Tailwind palette colour classes bypassing tokens | **2,240** across 61 files, **17 colour families** (incl. indigo, violet, fuchsia, teal, purple — in no palette) |
| Parallel copies of the same ~20-role palette | **15 namespaces** (`--eq-`, `--adm-`, `--jg-`, `--br-`, …) with measured drift; **one pair has a parity test**, thirteen drift freely |
| CSS variables declared / with no reader | 792 / **178 (22 %)** — including the *entire* Mindbody token block |
| Distinct font sizes | 10 Tailwind + **27 arbitrary** + **60 in CSS**; **601 of 750 arbitrary sizes are ≤ 11 px**, and 17 are `text-[7px]` |
| `uppercase` / `font-bold`+`black` runs | 1,062 / 874 |
| Distinct border-radius values | **62** in CSS + 37 `rounded-*` |
| Distinct button / card class names | **68 / 165** |
| Empty-state class names / shared component | **37 / none** |
| Loading idioms | **5** (LoadingMark 33 · animate-spin 33 · Loader2 38 · animate-pulse 12 · shimmer) — against a written rule of one |
| Truncation sites | **97** (54 TSX + 43 CSS), ~25 on **names** |
| Native `title=` tooltips vs the `Tooltip` primitive | **80 in 51 files** vs **1** — and `title` does not exist on a touch-only iPad |

Three specific breakages worth calling out:

- **The global header renders white-on-white in the default theme setting.** `ThemeProvider`
  defaults to `"system"`; three screens compute the header variant from the *stored preference*
  rather than the *resolved* theme. On a Light-appearance iPad the studio switcher — the control
  that says which studio you are writing to — is invisible (`AppContent.tsx:1525`).
- **The sign-in screen is unreadable in light mode, and the file's own header comment says so.**
  Measured **1.19:1**.
- **`env(safe-area-inset-*)` is used in nine places and `index.html` never sets `viewport-fit=cover`**,
  so every one resolves to 0 and the bottom nav sits under the home indicator. There is also no
  manifest, no `apple-mobile-web-app-capable` and no apple-touch-icon — a trainer who adds Journey to
  the home screen gets a Safari tab with a URL bar eating vertical space on every floor screen.

And the font chain: `index.css:1` imports **Inter, which is referenced nowhere in the codebase**,
from Google Fonts, inside a 400 kB stylesheet, with no preconnect — so Saira Condensed (the brand
display face for every heading) is the last thing to arrive on studio Wi-Fi and every heading
re-flows.

### 3.5 Engineering posture

- **`strict` is off in the app and on in the 4-file Cloud Functions package.** Measured cost of
  turning it on: **97 errors vs the 10 baseline [verified]** — and that number is only that low
  because 386 `any`s are absorbing the risk. `strictNullChecks` alone catches the class that white-
  screens a trainer mid-set.
- **There is no linter.** `"lint": "tsc --noEmit"`. Yet **20 comments suppress
  `react-hooks/exhaustive-deps`** — a rule that has never run — across **914 dependency arrays**.
- **`.github/typecheck-baseline.txt` says 11; the real count is 10.** One free error.
- **`CLAUDE.md` says run the suite with `TZ=America/New_York`; nothing does** — not `package.json`,
  not CI (GitHub runners are UTC).
- **324 exported symbols are referenced nowhere outside their own file**; 22 of 70 exports in
  `types.ts` are dead, including a pair of types (`FocusStatus`) exported twice with **different
  members and different case**, so importing the wrong one gives a comparison that is type-correct
  and always false.
- **Roughly 4,000 lines of verified dead code** across the areas reviewed: 828 lines of tracker
  dialogs nothing can open, a 363-line Hub edit form nothing can open, a 440-line Machine Info
  dialog full of invented cohort statistics one wiring change from being shown, a 403-line
  `JobComposer`, a 191-line admin branch in `EditTrainerModal`, six unused files.

---

## 4. What I would do about it — the Phase 2 shape

Not a plan to approve yet; the shape I will propose once the questions below are answered.

**Round A — Make the floor honest (Rank 1, nothing else first).** Point the tracker at
`useStudioMachines`. Delete invented `Gap 0` and the first-letter key collision. Batch the session
seeds with `merge`. Fix Keep Training. Show offline. Add the one render test that walks
start → set → practice → skip → finish.

**Round B — The floor in the hand.** The docked pad the app already owns, under the Now Bar. Every
per-set control to 44 px. Notes within thumb reach. An eyes-off confirmation for a logged set. The
grid earns its height or yields it.

**Round C — One writer per reader.** Collapse the note concepts to `journalEntries` + a `topic`.
One session store per client. One "standard settings" home. One `currentActor()`. One role module.

**Round D — The import, rebuilt** (Phase 3 — see the questions; the current design cannot return a
weight at all).

**Round E — The system that is already there, everywhere.** One palette, one type scale, one
button, one empty state, one loading mark — enforced by lint, because five written rules are
already being broken hundreds of times each.

**Throughout:** the ten security lines, `strictNullChecks`, `vitest run src functions`, and the
dead code, each in its own revertable commit.

---

## 5. The questions

Grouped, one topic at a time, as you asked. Each is answerable in a sentence.

### The floor
1. The Setup screen already has a docked keypad because "the keyboard slides up over half the
   screen". **Why does the Rank 1 screen still use the iPad keyboard?** Is there a reason
   digits-then-Next on a pad under the bar would not be the two taps the floor doc asks for?
2. On a held portrait iPad the history grid takes ~60 % of the height and, in Show: All, its rows
   shrink to 26 px. **Is the full grid worth its height *while a set is running*,** or is the live
   screen the Now Bar plus "last · best · today", with the grid one tap away?
3. Every counted set is stored as quality 2 the instant a digit is typed. **Is "2" a judgement the
   trainer made, or a default the app made?** If the latter, should it be null until someone marks
   something, so the Deep Dive cannot read silence as "completed clean"?
4. **Should the floor be one fixed theme?** Today it inherits each iPad's Appearance setting — which
   is exactly the configuration where the header renders white-on-white.
5. `the-floor.md` says the trainer sets the iPad down and looks away. **Nothing confirms a logged set
   without being looked at.** Deliberate (the clicker is the truth, the app is just a log), or missing?

### Machines
6. **Will you let me point the tracker and profile at `useStudioMachines` before any further machine
   work?** Until that lands, everything in "Set up for us", every custom machine and every catalog
   correction is invisible to a trainer holding an iPad — and one screen currently tells leaders the
   opposite.
7. FileMaker's chart shows per-machine labels — `S, G, B, Pads, H, E, Ft, Blocks` — and values that
   are decimals and letters (`1.5`, `N`, `W`, `M`, `SH`). The catalog editor already lets a studio add
   any dial by label. **Do you want the Now Bar to show the unit's own labels, or a fixed strip?**
   Those are different screens.
8. **Is "Gap 0 for everyone" a real house rule,** or should Gap be a dial like any other with the
   Academy's default as a ghost? Right now the app invents it, writes it, and then counts it as
   evidence in machine trends.
9. Your studio runs a Leg Press Imagine *and* a Leg Press Hoist. **Are those one machine for history
   purposes, or two?** The answer decides whether the importer matches against the corporate catalog
   or each studio's own roster — and today both collapse to one and a set is silently lost.

### Notes
10. There are ~14 note concepts in ~25 places; the floor names five. **Which of the five is
    `journalEntries` not the right home for?** If none, may `sessions.notes`, `machineNotes[]`, the
    arrival note and the Pulse topic notes become journal entries with a `machineId`/`sessionId`/`topic`?
11. **When a trainer thinks "I want to remember this about Judy", which tool do you want them to
    reach for** — a journal note with Loudness, or a private Relay note with folders and three share
    modes? Can the other one go?
12. The Hub cannot see a Critical note. **Is a red left edge on the card the marker you meant** — and
    should it come from a cached count on the client, or one studio-day query?
    *Answered by AJ, Sep 24 2026: the red triangle only (the edge keeps its meanings), from one live read of the day's booked clients' Critical notes rather than a count on the client, and red for every trainer. Built in `docs/rounds/2026-09-24-hub-critical-flag.md`.*

### The import (Phase 3)
13. **FileMaker can export CSV or XML. What specifically stops you getting an export out of Claris?**
    An export gives exact machine names, exact setting labels, exact reps and the real session
    numbers — and can be diffed and re-run safely. Photographing a screen and paying a vision model
    to guess at handwriting is the expensive path, and it is the one currently shipping.
14. If the answer is "screenshots are all we have": **would you accept a two-pass design** where
    pass one extracts *only* column 2 and the last non-empty weight per row — one call, one page,
    under five seconds — and full history is a separate, slower job? That is your "lightning-fast"
    ask, and it needs the schema fixed first: **today's settings schema literally cannot return a
    weight, and the prompt explicitly tells the model to ignore weight.**
15. **Should a re-import be an error, a no-op, or an update?** Right now it is five compounding
    counters. A deterministic document id makes it a no-op for one line.
16. **Does the importer belong in the browser at all?** It writes ~500 documents from an iPad in a
    tab that can be closed mid-batch, with no undo — while the screen you already ship tells admins
    the real importer will be a `scripts/` job with a dry run.

### Shape and scope
17. Half of all feature code is off-floor, none of it is Core tier, and trainers are not running
    sessions in Journey yet — so the Overview's loud number ("never logged") will be **every booking,
    every day**, until cutover. **Which off-floor screen do you expect a Solon leader to open in week
    one of beta?**
18. **If you had to ship with half the Operations tabs, which five go?** My read from the code: Data,
    Announcements, Mindbody-as-a-leader-tab, Floor, Delight — each is either a duplicate door, a
    developer tool, or the same data as an Overview panel.
19. "My Studio is where you run it; Operations is where you look at it" — yet Operations edits the
    floor, edits staff, posts announcements, pulls Mindbody and assigns Delight. **Is the split really
    run-vs-look, or is it one screen with two permission levels?**
20. **Is the on-screen word "trainer" or "Life Transformer"?** The vocabulary table says the latter;
    ~93 user-facing strings say the former.

### Safety, before the first trainer signs in
21. `firestore.rules:1338` lets any signed-in Google account delete any client's machine settings,
    and `:1358` lets them rewrite a machine's audit trail. Both read like typos. **May I fix those
    two lines?**
22. The two Gemini endpoints are open to the internet with a 50 MB body and no rate limit. **Was
    that deliberate, or do they just predate `server/auth.ts`?**
23. **Is beta still going ahead with franchisees in it before the partition lands?** §1.8 moved it to
    Gate B for exactly that reason and it is not built.
24. The wipe is one typed phrase from deleting every trainer and studio in production. **Is the answer
    "remove the button from the branch that ships to trainers"** — a one-line change — rather than
    waiting for a server route?
25. **Were Mindbody credentials ever pushed to this repo before this clone's history, and have the
    API key, source password and webhook secret been rotated?** Nothing in the code can tell me, and
    if they have not been, it is the most urgent item in this document.

### Engineering posture
26. **`strictNullChecks` before beta or after?** The measured cost is 97 errors against a 10 baseline
    — roughly a day — and it is the one setting that catches the class of bug that white-screens a
    trainer mid-set.
27. **May I change `"test"` to `vitest run src functions`?** That is +14 files, +5 seconds, and it
    touches no Mindbody code, no functions code and no rules. Right now nothing guards the webhook.
28. There is no ESLint in the repo, and five written rules — no raw hex, 40 px minimum, one loading
    mark, names never truncated, tokens only — are each broken hundreds of times. **Would you accept
    a lint gate that fails the build on those five?** Nothing else will hold them.
29. Right now the house style is 1,062 uppercase runs, 874 bold weights, 601 font sizes at 11 px or
    smaller, 62 border radii and 293 colours. A five-star restaurant's menu is the opposite: few
    sizes, much white space, one accent, almost no borders. **Does "premium" here mean more restraint
    — or do you want the decoration?** Everything in §3.4 is cheaper to fix if the answer is restraint.

---

## 6. What is genuinely good, said plainly

Most of this document is criticism, because that is what was asked for. It would be dishonest to
leave this out:

- **`docs/business/the-floor.md` is the best product document I have read in a codebase.** Nearly
  every ergonomic finding above exists because that file is specific enough to measure the code
  against. Most teams have nothing to hold the code to.
- **`functions/src/mindbody/` is the strongest code in the repository** — HMAC verification, a
  transactional idempotency gate, a retry ledger with a dead-letter queue, a Limbo queue for
  anything unattributable, and strict canonical client resolution with no name matching. It also
  has 2,443 lines of tests. It deserves to be run by CI.
- **The pure-logic modules are excellent.** `set-outcome.ts`, `machine-clock.ts`, `tracker-screen.ts`,
  `prior-history.ts`, `renewals/engine.ts` — extracted, tested hard against legacy data, named after
  the bugs they pin. The renewals engine matches `docs/business/packages-and-pricing.md` exactly.
- **The newest screens are the design system working.** `SessionNowBar`, `JourneyGrid`,
  `BriefingScreen`, `OverviewPage` — zero hex, zero palette classes, 44 px controls, guarded hover.
  There is nothing to invent; there is a standard to spread.
- **`journey-grid/contrast.test.ts` and `admin/admin-tokens.test.ts`** compute real WCAG ratios from
  the actual token files in both themes. Generalise those two and most of §3.4 stops recurring.
- **`@ts-ignore`: zero. TODO/FIXME: one. Case-collision filenames: zero. Committed secrets: zero.**
- **The CI workflow's comments are better engineering documentation than most teams write.**

The architecture is not confused. It is **mid-migration in five places at once**, and each
migration was started for a good reason and left with both sides live. That is a very different —
and much more fixable — problem than a bad design.

---

*Phase 1 ends here. Phases 2–4 wait on the answers above; questions 13–16 in particular block
Phase 3, because the current import cannot return a weight by construction.*
