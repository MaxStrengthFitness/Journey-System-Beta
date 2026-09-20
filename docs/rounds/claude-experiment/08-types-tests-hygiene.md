# 08 — The shared vocabulary and the safety net
### types, naming, TypeScript strictness, what the suite guarantees, dead code, dependencies, repo health
Reviewed against `master` @ `a064019`. Every number below was measured on this clone.

---

## 1. What this area does — my interpretation

**The vocabulary.** `src/types.ts` (1,853 lines, 70 exports) is the app's constitution: `Client`, `Trainer`, `Studio`, `WorkoutSession`, `ExerciseLog`, `Machine`, `Routine`, `ProgressReport`, `ScheduleEntry`, plus the Mindbody mirror types (`MindbodyMembership`, `MindbodyContract`, `MindbodyService`, `MindbodyStaffSnapshot`). It is unusually well *commented* — most fields carry a sentence saying who writes them, when, and why. That commentary is the best thing in the file and it is doing work no type is doing: `createdAt?: any` tells the compiler nothing, but `/** Firestore Timestamp of the last Mindbody API pull */` tells the next person everything. The file is a *narrated* schema. Three later models were pulled out beside it rather than into it: `src/types/journal.ts` (657 lines — the unified `journalEntries` model that supersedes `focusRecords` / `sessionNotes` / `clinicalIncidents`), `src/types/machines.ts` (651 lines — the Sep 2026 three-layer machine model: global catalog → studio roster → `ResolvedMachine`), and `src/types/images.d.ts` (5 lines, the webp/svg module shim). Feature folders then declare their own: **1,325 exported `interface`/`type` across 459 files**, of which ~294 are component/hook plumbing (`*Props`, `*State`, `*Args`, `*Options`, `*Result`) and ~1,021 are domain-shaped.

**How a value reaches a screen.** Almost nothing is validated at the Firestore boundary. A snapshot's `d.data()` is cast — `({ id: d.id, ...d.data() }) as TrainerFocus` in `src/hooks/useClientJournal.ts:1028` is the house pattern — so the type is an *assertion about the database*, not a check. Because `tsconfig.json` has no `strict` and no `strictNullChecks`, and because 92 of `types.ts`'s 856 field declarations are `any`, that assertion is rarely contradicted. The app compensates with runtime normalisers: `outcomeOf()` in `src/lib/set-outcome.ts` applies the legacy rule for logs written before the `outcome` field existed; `normalizeRoutinePreset()` infers `tier` from `scope`; `dialFromRegionState()` / `dialFromSleepQuality()` read pre-Dial sessions. This is a deliberate, documented strategy — "optional so every report already on file still type-checks" (`src/types.ts:1589`) — and it is why the model is nearly all-optional.

**The safety net.** 223 test files in `src`, ~3,036 top-level `it()` calls (the runner reports 3,516 because of `it.each` and loops), 805 `describe` blocks. There is **no vitest config file anywhere** — no `setupFiles`, no default `environment`, no `pool`/`isolate` tuning, no coverage config. The 36 `*.render.test.tsx` files each opt into jsdom with their own `// @vitest-environment jsdom` docblock and each hand-roll their own ~20-line `mount()` harness on raw `react-dom/client` `createRoot` + `act` (there is no `@testing-library` in the tree). 26 test files hand-roll their own fake `firebase/firestore`. The dominant and genuinely good pattern is: *extract the rule into a pure module, test the rule hard, have the god component call it* — `src/lib/set-outcome.ts` / `.test.ts`, `src/lib/tracker-screen.ts` / `.test.ts`, `src/features/client-history/model.ts`. Where that pattern is followed, the tests are excellent: real edge cases, legacy-data cases, named after the bug they pin.

**CI and the gates.** `.github/workflows/ci.yml` runs `tsc --noEmit` (gated on a *count*, not zero — baseline in `.github/typecheck-baseline.txt`), `npm test`, and `vite build`, plus a separate `continue-on-error: true` Firestore-rules job. It is thoughtfully written and its comments explain every decision. What it does **not** cover: `functions/` is never typechecked, never tested, never built by CI; `npm test` is `vitest run src`, which excludes `functions` entirely; and there is no linter of any kind — `"lint": "tsc --noEmit"` in `package.json:16` is a typecheck wearing a lint's name, and ESLint is neither installed nor configured at the root.

**Repo shape.** 1,448 tracked files, ~19 MB. 554 commits on `master`, 7 branches, commit subjects averaging 73.7 characters in a distinctive round-and-phase style ("Machine authoring 5: the catalog screen — adm rows, real order, gaps named"). No case-collision filenames. `docs/` is 3.7 MB / 276 files. The 1.4 MB of Academy JSON under `src/features/academy/content/` is correctly code-split behind `import()` in `useAcademyContent.ts` — only the 20 KB `index.json` is static. Bundle chunking in `vite.config.ts` is deliberate and well-reasoned.

---

## 2. The domain map — how many types describe one thing

This is the most valuable output of this review, so it goes first.

### 2.1 "A machine" — 84 exported types with `Machine` in the name; 9 that actually model one

| Type | File | Imported by | What it is |
|---|---|---|---|
| `Machine` | `src/types.ts:945` | **70 files** | The original flat shape. `targetMuscles?: string \| string[]`, `settings?: string` ("Repurposed as Standard Setup Tips") |
| `MachineDefinition` | `src/types/machines.ts:392` | 12 | The Sep 2026 catalog shape |
| `MachineCatalogEntry` | `src/types/machines.ts:466` | 18 | `extends MachineDefinition` + status |
| `StudioMachineRosterEntry` | `src/types/machines.ts:576` | 5 | Union of `RosterEntryFromCatalog` \| `RosterEntryCustom` |
| `ResolvedMachine` | `src/types/machines.ts:622` | **2** | The one the header comment says "components consume" |
| `StudioMachineSetting` | `src/types.ts:1074` | 2 | Per-studio override, doc id `${studioId}_${machineId}` |
| `ClientMachineSetting` | `src/types.ts:1319` | 14 | Per-client values |
| `CurrentMachineMetric` | `src/types.ts:470` | 1 | Denormalised last-performed, on the client doc |
| `ClientMachineStat` | `src/types.ts:495` | 3 | Lifetime rollup, on the client doc |

`src/types/machines.ts:23` says *"Nothing here is read directly by a component. Components consume ResolvedMachine."* **`ResolvedMachine` is imported by 2 files; the superseded `Machine` is imported by 70.** The migration is 3% done and the doc comment describes an intention, not the code. Add `src/data/machine-definitions.ts` (2,436 lines) and `src/data/machine-database.ts` (1,152 lines) and the studio has five places that answer "what is a leg press".

Fields duplicated across those nine: `settingOptions` / `standardSettings` (`Machine`, `StudioMachineSetting`); `machineId` + `studioId` (five of them); `updatedAt`/`updatedBy` (four); `order` (three); weight-and-date pairs under four different names — `standardWeights` (`Machine`), `startingWeight`/`currentWeight` (`ClientMachineSetting`), `weight: string` (`CurrentMachineMetric`), `firstWeight`/`lastWeight: number` (`ClientMachineStat`). Note the type drift inside one idea: a machine's load is `number | string` on `Machine.standardWeights`, `string` on `CurrentMachineMetric.weight`, and `number` on `ClientMachineStat.firstWeight`.

### 2.2 "A note" — 36 `*Note*` types; 6 collections; one supposed unification

`journalEntries` was introduced (`src/types/journal.ts:1–15`) to be the single home for everything a coach writes. It explicitly does **not** migrate the old ones — `focusRecords`, `sessionNotes`, `clinicalIncidents`, `client.mindbodyNotes`, `client.events` are normalised at read time in `useClientJournal.ts`. So today one client's notes live in six shapes: `JournalEntry` (`types/journal.ts:70`), `SessionNote` (`types.ts:1221`), `MachineNote` (`types.ts:1303`), `FocusRecord` (`types.ts:1684`), `TrainerFocus` (`types.ts:1698`), `ClinicalIncident` (`types.ts:146`) — plus `ClientFocus` (`types/journal.ts:180`), the new focus shape. Authorship is spelled four ways across them: `authorId`/`authorName`/`authorInitials` (JournalEntry, MachineNote), `trainerId`+`trainerInitials` (SessionNote), `assignedBy`+`trainerId` (FocusRecord), `reportedByTrainerId` (ClinicalIncident).

### 2.3 "A person" — 52 types; two that are the record

`Client` (`types.ts:642`, ~150 fields) and `Trainer` (`types.ts:302`). Both carry the *same* provisional/merge tombstone block, copy-pasted with one key deliberately different: `Trainer.supersededByUid` vs `Client.supersededById` (`types.ts:314` and `types.ts:767`) — and the comment at `types.ts:339` admits the reader has to handle both. `Client` also carries three separate session counters that are documented as disagreeing: `completedSessions`, `sessionCount` ("sessions Journey can see PLUS prior history"), and `clientsNumberOfVisitsAtSite` ("the two will not agree and neither is wrong", `types.ts:908`). Three dead payload types — `CreateTrainerPayload`, `UpdateTrainerPayload`, `NewTrainerPayload` (an alias of the first) — are imported by **zero** files.

### 2.4 "A session" — 34 types, one document

`WorkoutSession` (`types.ts:1107`) is the record. Around it: `PreSessionCheckIn`, `SessionReadiness`, `PostSessionData`, `SessionSummary`, `SessionFlags`, `SessionFact`, `NowSession`, `LiveSessionLike`, `ActiveSessionLike`, `SessionLike`, `HistorySession`, `CalendarSession`, `ListSessionItem`, `JourneySession`, `ValidationSession`. The `*Like` suffix appears 8× across the codebase (`SessionLike`, `LogLike`, `MachineLike`, `MachineStatsLike`, `LastSetLike`, `ClientSettingLike`, `MachineUpkeepLike`, `LiveSessionLike`) — each one is a hand-written structural subset of a real type, written because the real type could not be narrowed safely without `strictNullChecks`.

### 2.5 The same NAME, two different types

`FocusCategory` and `FocusStatus` are each exported **twice**, from two modules, with different values:

| | `src/types.ts` | `src/types/journal.ts` |
|---|---|---|
| `FocusCategory` | `"Posture" \| "Pace" \| "Path" \| "Purpose"` (line 1680) | `"Posture" \| "Path" \| "Pace" \| "Purpose"` (line 36) — same members, different order |
| `FocusStatus` | `"Active" \| "Achieved" \| "Deleted"` (line 1682) | `"active" \| "passed" \| "retired"` (line 178) — **different members, different case** |

Nobody imports the `types.ts` pair (0 importing files for both, and 0 for `FocusRecord`). They are live landmines in autocomplete: import the wrong one and `status === "Active"` silently never matches a document that says `"active"`.

### 2.6 The same name, four implementations

Repo-wide, **36 exported function names are declared more than once**. The date helpers dominate:

| Name | Implementations |
|---|---|
| `monthKeyOf` | **4** — `admin/hours/hours.ts:69` (dead), `client-notes/note-catalog.ts:309` `(Date\|null)`, `client-history/model.ts:77` `(DayKey)`, `clinical-review/analytics.ts:107` `(iso: string)` |
| `daysUntil` | 4 |
| `toDate` | 3 — incl. `lib/studio-time.ts:60` and `types/journal.ts:455` |
| `toMillis`, `addDays`, `daysBetween`, `weekStartOf`, `shortDate`, `whenLabel` | 3 each |
| `dayKey`, `toIsoDay`, `weekdayOf`, `relativeDay`, `monthLabel`, `millis`, `initialsOf`, `dayWords` | 2 each |

`STUDIO_LEADER_ROLES` exists twice: exported (and dead) at `src/lib/staff-access.ts:30`, and as a private `const` at `src/features/learning/permissions.ts:29`. **That is a role list — the multi-tenant access boundary — maintained in two places.** Add an eleventh role and one copy gets it.

### 2.7 Five date representations, one `DateLike`

`src/lib/studio-time.ts:52` names them honestly:

```ts
export type DateLike = Date | string | number | { toDate: () => Date } | null | undefined;
```

In the model: (1) Firestore `Timestamp`, always declared `any` — 86 such fields in `types.ts`; (2) ISO date-time string (`goalHistory[].achievedAt`, `Trainer.claimedAt`, `mindbodyMasterSyncedAt`); (3) `"YYYY-MM-DD"` day-key string (`BodyStateTag.until`, `goalTargetDate`, `Studio.journeyCutoverDate`, `ScheduleEntry.movedFromDay`, `ClientMachineStat.firstPerformedDate`); (4) epoch millis number (`Studio.lastScheduleSyncAt`); (5) *either*, by comment — `autoIncludeAfter?: any; // Timestamp or string Date` (`types.ts:512`), `lastContactedDate` (513), `dateAssigned` (1689). Conversion lives in `src/lib/studio-time.ts` (419 lines, 22 exports), `src/lib/mindbody-dates.ts` (71), `src/lib/machine-clock.ts`, plus the duplicate `toDate` in `types/journal.ts` — **4 modules + 16 duplicated helper names.**

### 2.8 ARCHITECTURE.md §3.6 — verified, with counts

Every variant §3.6 lists is real and still on master, except one. Occurrences are whole-word matches across `src` (`.ts`/`.tsx`):

| Idea | Variants, with counts |
|---|---|
| The studio | `studioId` **1,926** · `homeStudioId` **276** · `primaryHomeStudioId` **195** · `clientHomeStudioId` **65** · `targetId` **49** · `hostedAtStudioId` **42** · `resolvedStudioId` **3** |
| Who wrote it | `trainerId` **456** · `authorId` **110** · `createdBy` **65** · `enteredBy` **40** · `userId` **33** · `startedByTrainerId` **6** · `reportedByTrainerId` **6** · `lastTouchBy` **5** · `provisionalBy` **5** · `addedByTrainerId` **3** · `grantedBy` **0 — this variant no longer exists; §3.6 is stale on that row** |
| Who last changed it | `updatedBy` **62** · `outcomeBy` **19** (`features/renewals/useRenewalCycle.ts:150`) |
| When | `createdAt` **398** · `updatedAt` **263** · `occurredAt` **97** · `timestamp` **70** · `startedAt` **43** · `clientStartTime` **10** · `addedAt` **9** · `dateAssigned` **5**; plus `at` **2,365** and `date` **1,206** (both too generic to attribute) |
| Initials | `trainerInitials` **156** · `authorInitials` **30** · `editedByInitials` **5** · `assignedBy` **18** |
| Mindbody client id | `mindbodyClientId` **97** · `mindbodyId` **32** |

`author.id` / `actor.id` style nesting: 66 occurrences. Collections: **64 of 67 rule paths are camelCase; 3 are snake_case** — `access_requests`, `bug_reports`, `hub_announcements` (confirmed in `firestore.rules`). Derived doc ids in use: `${clientId}_${machineId}` (5), `${sessionId}_${machineId}` (4, canonicalised in `src/lib/exercise-log-id.ts`), `${studioId}_${machineId}` (2), plus abbreviated variants `${sid}_${mId}` (3) and `${sid}_${id}` (3) — and one reversed, `${machineId}_${sessionId}` (`src/components/WorkoutChartGrid.tsx:258`, see finding #12).

---

## 3. Anomalies

### #1 — `strict` is off in the app and on in the backend. **Severity: High**
`tsconfig.json` (whole file — there is no `strict`, `strictNullChecks` or `noImplicitAny` key anywhere in it) vs `functions/tsconfig.json:8` `"strict": true`.
**What:** the 1,038-file React app the studio touches is unchecked for null; the 4-file Cloud Functions package is strict.
**Why it matters:** every `Client`, `WorkoutSession` and `ExerciseLog` field is optional *and* unchecked, so `session.preSessionCheckIn.bodyStates.length` compiles. On the floor that is a white screen mid-set.
**Cost, measured:** `npx tsc --noEmit --strict` = **97 errors** (baseline 10). 75 in `src` non-test, 14 in one test file (`src/lib/mindbody-api-sync.test.ts`), 8 in `scripts`/`server`. By code: TS2345 ×33, TS2322 ×28, TS18048 ×17, TS2769 ×8, TS2783 ×3, TS7053 ×2, TS2352 ×2, one each of TS7006/TS2538/TS2353/TS18047. Top files: `admin/overview/OverviewPage.tsx` (12), `features/ford/FordSection.tsx` (6), `components/ClientInfoSheet.tsx` (5), `scripts/migrate-machine-id.ts` (5), `WorkoutTrackerView.tsx` (4), `AppContent.tsx` (4).
**Direction:** 87 new errors is one to two days, not a quarter — but the number is only that low because 386 `any`s are absorbing the risk. Turn on `strictNullChecks` alone first (it is the one that catches floor crashes), fix the ~17 TS18048s, then the rest.

### #2 — 92 `any` fields inside the canonical data model. **Severity: High**
`src/types.ts` — 92 `any` across 856 field declarations. Every Firestore `Timestamp` is one: `createdAt: any` (line 159), `timestamp: any` (1308), `resolvedAt?: any` (156), `startTime?: any` (1156), `assignedAt?: any` (529).
**Why it matters:** `any` is contagious. `session.startTime.getTime()` compiles and throws (a Timestamp has `toMillis`, not `getTime`). A single exported `type Ts = Timestamp | Date | string` would make every one of those call sites a compile error instead of a runtime one — and it is what `DateLike` already is, four directories away in `src/lib/studio-time.ts:52`.
**Direction:** one alias, applied by find-and-replace to the 86 timestamp fields. It costs nothing under non-strict and immediately pays under strict.

### #3 — There is no linter, and 20 comments suppress a rule that has never run. **Severity: High**
`package.json:16` `"lint": "tsc --noEmit"`. No `.eslintrc*` or `eslint.config.*` at the root; `node_modules/.bin/eslint` does not exist. Yet there are 20 `// eslint-disable-next-line react-hooks/exhaustive-deps` comments in `src` — e.g. `src/components/ClientProfileView.tsx:436`, `ClientProgressReportView.tsx:425` and `:692`, `VictoryHUDScreen.tsx:282`, `EditRoutineDrawer.tsx:181`, `relay/notes/NotesPanel.tsx:164` and `:255`, `features/equipment/SettingsCard.tsx:148`.
**Why it matters:** those 20 are places the author *knew* the dependency array was wrong. They are the tip: there are **311 `useEffect`, 482 `useMemo`, 121 `useCallback`** — 914 dependency arrays — and nothing in the repo has ever checked one. Stale closures are the single most common cause of "the iPad showed the previous client's numbers".
**Direction:** add `eslint` + `eslint-plugin-react-hooks` with *only* `exhaustive-deps` and `rules-of-hooks` enabled, count-gated in CI exactly like the tsc baseline. Also: `functions/package.json:4` declares `"lint": "eslint --ext .js,.ts ."` but ESLint is not in `functions`' devDependencies and there is no config — that script cannot run.

### #4 — `functions/` has 172 passing tests that no command in the repo runs. **Severity: High**
14 test files: `functions/src/claims-logic.test.ts`, `functions/src/trainerRollups.test.ts`, and 12 under `functions/src/mindbody/` — `verifySignature.test.ts`, `idempotency.test.ts`, `dlq.test.ts`, `retryLedger.test.ts`, `clientResolver.test.ts`, `staffResolver.test.ts`, `healthState.test.ts`, `time.test.ts`, `passFields.test.ts`, `index.test.ts`, `staffImage.test.ts`, `staffProfile.test.ts`.
**Evidence they work and are orphaned:** I ran `npx vitest run functions` — **14 files, 172 passed, 1 skipped, 4.92 s**. `package.json:18` is `"test": "vitest run src"`. `.github/workflows/ci.yml` contains the string "functions" **zero** times. `functions/package.json` has no `test` script. `tsconfig.json`'s `exclude` lists `functions`, so CI's typecheck skips it too.
**Why it matters:** webhook signature verification, idempotency and the dead-letter queue are the highest-consequence code in the repo and the *only* part with no gate at all. The project's own rule is "protect the backend"; today nothing does.
**Direction:** `"test": "vitest run src functions"` — one word, +172 tests, +5 seconds. Add `tsc -p functions --noEmit` to CI in the same commit.

### #5 — Only 7% of the tests touch the floor. **Severity: High**
Measured `it()`/`test()` counts:

| Area | Test cases |
|---|---|
| Floor-adjacent (22 files: set-outcome, tracker-screen, live-session, log-validation, machine-clock, post-session, session-timing, journey-grid, rating, briefing, routine-builder/session-scope, routines, ActiveSessionTimer) | **212** |
| `src/features/admin` | 599 |
| `src/features/relay` | 226 |
| `src/features/studio-tasks` | 152 |
| `src/features/renewals` | 128 |
| `src/features/progress-report` | 112 |
| `src/features/academy` | 103 |
| `src/features/subjective-report` | 79 |
| `src/features/catalog` / `wiki` / `learning` | 60 / 55 / 32 |
| `src/components` (63 files, 23,602 lines) | **19, in 3 files** |

Admin alone has **2.8× the test cases of the entire floor**. `src/components` — which holds `WorkoutTrackerView.tsx` (3,372 lines), `ClientProfileView.tsx` (1,863), `ClientsView.tsx` (1,519), `ClientProgressReportView.tsx` (2,387) — has three test files: `ActiveSessionTimer.test.ts`, `LoginScreen.render.test.tsx`, `VictoryHUDScreen.render.test.tsx`.
**Direction:** the floor is Rank 1 by the business doc and Rank 9 by test count. The next 200 tests belong on the floor, not on admin.

### #6 — Not one of the 36 render tests mounts the Active Session screen. **Severity: High**
The 36 `*.render.test.tsx`: 11 are `features/admin*`, and the rest are `LoginScreen`, `VictoryHUDScreen`, `BriefingScreen`, `ContractPanel`, `LogPastSessionDialog`, `SessionDetailDialog`, `notes`, `ProfileHeader`, `profile-nav`, `LifeBody`, `ClinicalDashboard`, `ClientMachineWindow`, `SettingsCard`, `DelightQueue`, `goals`, `recent-journey`, `SetupView`, `MachineTrendsPanel`, `AccoladeViews`, `FourPs`, `Dial`, `planner`, `ClientCheckInPanel`, `PulseQuickLog`, `useLiveSchedule`, `useStudioRoster`, `useDirtyForm`.
**WorkoutTrackerView is never mounted.** Its only "coverage" is `src/features/routine-builder/session-scope.test.ts:65`, which does `const WTV = code(read("src/components/WorkoutTrackerView.tsx"))` — it reads the component as **text** and asserts on the source string. (5 tests in the repo do this: also `admin-tokens.test.ts`, `journey-grid/contrast.test.ts`, `data/machine-order.test.ts`, `neutral-ramp.test.ts`.)
**Why it matters:** `trackerScreen()` is correct and tested (`src/lib/tracker-screen.test.ts`, 6 cases, genuinely good), and `WorkoutTrackerView.tsx:2390` really does call it — I checked. But nothing proves the 56 hook calls in that 3,372-line file wire the right inputs into it. A green suite says the *rules* are right; it says nothing about the *wiring* on the one screen a trainer holds in one hand.
**Direction:** one render test that mounts the tracker with a fake session and logs one set end-to-end would be worth more than the next hundred unit tests.

### #7 — A pure 18-line date predicate drags the whole Firebase SDK into the test run. **Severity: High**
The exact chain, verified line by line:

```
src/features/briefing/heads-up.test.ts:2
  import { HEADS_UP_WINDOW_DAYS, isHeadsUpLive } from "../../hooks/useClientJournal"
→ src/hooks/useClientJournal.ts:50   import { db } from "../firebase"
→ src/firebase.ts:4                  import firebaseConfig from '../firebase-applet-config.json'   ← gitignored (.gitignore:15)
```

`isHeadsUpLive` is defined at `src/hooks/useClientJournal.ts:110–127` — it compares two dates against `HEADS_UP_WINDOW_DAYS = 21` (line 97). To test it, vitest loads a 1,153-line React hook, `firebase/firestore`, `firebase/auth`, `firebase/functions`, and executes `initializeApp` + `initializeFirestore(…persistentLocalCache…)` + `getAuth` + `getFunctions` at module scope (`src/firebase.ts:10–34`).
**Three other files have the same shape** (value imports, unmocked):
- `src/features/goals/goals.render.test.tsx` → `src/components/journal/FocusBoard.tsx:27` → `src/firebase.ts`
- `src/features/relay/board/kudos.test.ts` → `relay/board/kudos.ts` → `studio-tasks/mutations.ts:41` → `src/firebase.ts`
- `src/features/studio-tasks/categories.test.ts` → `studio-tasks/notify.ts` → `features/notifications/index.ts` → `NotificationBell.tsx` → `notifications/mutations.ts:29` → `src/firebase.ts`

**Why it matters — and this is the architectural part, not the config part:** the test file is called `heads-up.test.ts` and there is no `heads-up.ts`. A named domain rule ("a heads-up stays live for 21 days") has no module of its own; it is a lodger inside a Firestore-streaming hook. The test's *name* knows where the rule belongs; the code does not. The same is true of the other three: a notification-category rule cannot be reasoned about without booting a bell icon. The layering rule the codebase already follows well elsewhere — pure rule module, dumb consumer — is simply not applied to these.
**Direction:** move `isHeadsUpLive` + `HEADS_UP_WINDOW_DAYS` into `src/features/briefing/heads-up.ts` (zero imports) and have `useClientJournal` import it. Repeat for the other three. That also removes `src/firebase.ts`'s module-scope `initializeFirestore` from the test path — worth doing for the app too, since `vite.config.ts:36` already notes that module-scope init blocks first paint.

### #8 — The Firestore rules test covers half the collections, and skips the client-data ones. **Severity: High**
`tests/firestore.rules.test.ts` is 2,364 lines / 118 test cases. `firestore.rules` (134 KB) declares **67** top-level `match /<collection>/` paths. The test exercises **34** of them (51%).
**Never mentioned even once** (verified by `grep -c`, all zero): `clientMachineSettings`, `progressReports`, `routines`, `schedules`, `sessionNotes`, `journalEntries`, `clinicalIncidents`, `studioMachineSettings`, `routinePresets`, `users`, plus `clientFocuses`, `focusRecords`, `trainerFocuses`, `routineAdjustments`, `settingHistory`, `crossTrainRequests`, `networks`, `aggregations`, `leaderboards`, `mindbodyDLQ`, `mindbodyEventLog`, `mindbodyLimbo`, `notificationQueue`, `taskCategories`, `taskRequests`, `submissions`, `replies`, `logs`, `config`, `system`, `auditLogs`, `machineSettingChanges`, `databases`.
**Why it matters:** `journalEntries` is where every clinical and personal note about a client now lives; `progressReports` is noted at `types.ts:1619` as *"readable by any signed-in user"*. Those are the two collections a tenancy bug would hurt most, and neither has a rules test. Also, the rules job is `continue-on-error: true` (`ci.yml`), so even its 118 cases cannot fail the build.
**Direction:** a table-driven test that loops every collection in `firestore.rules` and asserts the baseline (a signed-out read is denied; another studio's trainer is denied) would take the coverage from 51% to 100% in one file, and would fail loudly when a new collection is added without rules.

### #9 — 22 of 70 exports in `types.ts` are dead, including a three-deep alias chain. **Severity: Medium**
Verified by precise import grep across `src` (`import … { X } … from "…/types"`), zero importing files for each:
`ClinicalTagDefinition` (45), `RPE` (43), `BodyRegionState` (56), `SessionReadiness` (97), `ClientFeel` (144), `Network` (177), `Owner` (187), `MindbodyStaffSnapshot` (208), `TrainerRollups` (285), `NewTrainerPayload` (389), `CreateTrainerPayload` (395), `UpdateTrainerPayload` (412), `ClientRetentionMeta` (508), `MindbodyAutopayEvent` (594), `MachineSettingChange` (983), `SettingsHistoryEntry` (1312), `MindbodyPass` (1353), `HighlightMetricType` (1435), `GoalCheckpoint` (1656), `FocusCategory` (1680), `FocusStatus` (1682), `AuditLogEntry` (1844).
Nine of those are still *structurally* needed (they are referenced by another interface in the same file — `RPE`, `SessionReadiness`, `MindbodyStaffSnapshot`, `TrainerRollups`, `ClientRetentionMeta`, `MindbodyAutopayEvent`, `SettingsHistoryEntry`, `HighlightMetricType`, `GoalCheckpoint`, `BodyRegionState`) and should simply stop being `export`ed. **Fully dead — zero references anywhere, including inside `types.ts`:** `ClinicalTagDefinition`, `AuditLogEntry`, `MachineSettingChange`, and the `NewTrainerPayload → CreateTrainerPayload` / `UpdateTrainerPayload` trio.
`src/types/machines.ts` adds six more unreferenced exports: `MusculatureDetail` (257), `UniversalBaseline` (269), `BodyTypeAdjustment` (290), `MobilityAdjustment` (300), `ExecutionProtocol` (350), `CatalogStatus` (453).
**Note on knip accuracy:** it reported `TrainerFocus` as unused; it is not (`src/hooks/useClientJournal.ts:59`, a multi-line import knip missed). I verified each claim above by hand.

### #10 — `auditLogs`: a rules path, a type, a purge-script entry, and no reader or writer. **Severity: Medium**
`firestore.rules` declares `match /auditLogs/…`; `src/types.ts:1844` declares `AuditLogEntry`; `scripts/purge-database.ts:73` lists it. Across `src`, `server`, `functions`: **zero** reads and **zero** writes.
**Why it matters:** an audit log that has never been written is worse than none — it reads as a control that exists. Same shape, smaller: `machineSettingChanges` is written (`src/AppContent.tsx:958`, `features/admin/provisional/reconcile.ts:49`) but its type `MachineSettingChange` is imported by nobody, so those writes are untyped.
**Direction:** delete the collection and the type, or write to it. Not both-and-neither.

### #11 — The two `FocusCategory`/`FocusStatus` pairs. **Severity: Medium**
`src/types.ts:1680,1682` vs `src/types/journal.ts:36,178` — see §2.5. `FocusStatus` differs in both case *and* membership (`"Achieved"` vs `"passed"`, `"Deleted"` vs `"retired"`).
**Why it matters:** TypeScript will not warn you. Importing the `types.ts` pair into journal code gives a comparison that is type-correct and always false.
**Direction:** delete the `types.ts` pair with `FocusRecord` (also 0 importers) in the same commit.

### #12 — `WorkoutChartGrid` builds a log key that discards `side`. **Severity: Medium**
`src/components/WorkoutChartGrid.tsx:109` `map.set(\`${log.machineId}_${log.sessionId}\`, log)` and `:258` `logMap.get(\`${machineId}_${sessionId}\`)`.
**What:** a third composite-key convention (reversed from `logDocId`), and — the real problem — it omits `side`. `ExerciseLog.side?: "Left" | "Right"` (`types.ts:1263`) and the canonical id is `${sessionId}_${machineId}${side ? "_" + side : ""}` (`src/lib/exercise-log-id.ts:25`).
**Why it matters:** for any machine logged Left and Right in one session, the two logs collide on one map key and the chart grid silently shows whichever came last. The file is 701 lines with **no test**.
**Direction:** key the map with `logDocId(...)` so there is one convention and `side` cannot be lost.

### #13 — 324 exported symbols are referenced nowhere but their own file. **Severity: Medium**
knip reports 379 unused exports across 172 files and 178 unused types across 93. I classified all 379 by grepping every name across `src`, `server`, `scripts`, `functions`, `tests`: **324 have no reference outside their defining file**, 55 are knip false positives (multi-line imports, barrel re-exports), and **0** are test-only. I hand-verified a random sample of 20 — 18 genuinely dead, 2 false positives (`monthKeyOf`, `STUDIO_LEADER_ROLES`, both name collisions with a *different* file's symbol).
Worst offenders: `features/renewals/engine.ts` (20 unused exports in a 981-line file), `features/clinical-review/analytics.ts` (14), `features/progress-report/accolades.ts` (11), `components/ui/dropdown-menu.tsx` (8), `features/machine-fit/kaizen.ts` (7).
**Why it matters:** an `export` is a promise that something outside needs this. 324 broken promises make the public surface of every module unreadable, and make knip itself useless as a future signal.
**Direction:** drop the `export` keyword (not the code) where the symbol is file-local; that alone would clear most of the 324 in a mechanical pass.

### #14 — 6 unused files; 5 confirmed, and the 6th documents a lazy-load that does not happen. **Severity: Low**
knip's list, each spot-checked by grepping the basename across `src`/`server`/`scripts`/`functions`/`tests`:

| File | Verdict |
|---|---|
| `src/hooks/useDebounce.ts` | dead — 0 references |
| `src/components/ui/accordion.tsx` | dead — 1 hit, a prose comment |
| `src/components/ui/slider.tsx` | dead — 1 hit, a prose comment |
| `src/features/admin/machines/AdminMachineCreator.tsx` | dead — 0 references |
| `src/features/admin/machines/MachineDefinitionForm.tsx` | dead — 2 hits, both comments describing what it *used* to do |
| `src/features/relay/index.ts` | dead, **and its own doc comment is wrong** |

`src/features/relay/index.ts:2–3` says *"AppContent lazy-loads PlannerView from here."* Nothing imports `features/relay` or `@/features/relay`. The real consumer is `src/features/my-studio/MyStudioView.tsx:8` — `import { PlannerView } from "../relay/PlannerView"`, a direct, non-lazy import. The barrel is dead and the comment is a description of an intention.
**Direction:** delete all six. The comment matters more than the file: a doc comment that describes code that does not exist is the most expensive kind of dead code.

### #15 — The checked-in typecheck baseline is one higher than reality. **Severity: Low**
`.github/typecheck-baseline.txt` = `11`. `npx tsc --noEmit` on this clone = **10** (verified; full list in §4). CI's own step prints `::notice::Down to 10 errors. Lower … to 10 to lock the win in.` and then passes.
**Why it matters:** a count-based gate only works if the count is tight. At 11, one new error can land free.
**Direction:** set it to 10 and treat lowering it as part of any commit that fixes one — the CI step already tells you to.

### #16 — The documented `TZ` rule is enforced nowhere. **Severity: Low**
`CLAUDE.md:57` says run it as `TZ=America/New_York npx vitest run src`; `CLAUDE.md:125` calls it a trap. `package.json:18` is `"test": "vitest run src"` with no `TZ`, and `ci.yml` never sets one — GitHub runners are UTC.
**Measured:** 22 test files construct dates with local-time constructors (`new Date(2026, 8, 16, …)`). I ran all 22 under `TZ=UTC` — **300 passed**. Under `TZ=Asia/Tokyo` — **1 failed**: `src/features/briefing/heads-up.test.ts > honours an until day: today counts, yesterday does not`. `TZ=UTC npx vitest run src/lib` — 502 passed.
**Why it matters:** the suite is robust for UTC and New York by luck of offset sign, not by design, and only 5 test files call `setActiveTimeZone`. The invariant CLAUDE.md states is real but unowned.
**Direction:** put `TZ=America/New_York` into the `test` script so the documented rule is the executed rule everywhere.

### #17 — 28 render/hook test files each re-implement the same mount harness; 26 each re-implement Firestore. **Severity: Low**
28 of the 36 render tests contain their own `async function mount(...)`; 19 set `IS_REACT_ACT_ENVIRONMENT` by hand; 26 call `vi.mock("firebase/firestore", …)` with a bespoke fake (e.g. `src/hooks/useStudioRoster.render.test.tsx:42–78`, ~37 lines of hand-rolled Firestore). There is no shared test-utils module and no `setupFiles` because there is no vitest config.
**Why it matters:** the fakes drift. A test's fake `onSnapshot` that delivers synchronously and another's that delivers on a `setTimeout(0)` will disagree about the very race the hook exists to fix. And it is a real tax on writing the floor tests finding #6 asks for.
**Direction:** one `vitest.config.ts` with `environment: 'jsdom'`, a `setupFiles` that sets the act flag, `src/test/mount.tsx`, and `src/test/fake-firestore.ts`. The runner itself reports `isolate: false … at least ~1.59s faster` on the 14-file functions run; on 237 files at ~184 ms startup each that is the ~43 s the brief mentions.

### #18 — `AdminMindbodyTab.tsx` imports the gitignored config directly. **Severity: Low**
`src/features/admin/mindbody/AdminMindbodyTab.tsx:67` `import firebaseConfig from "../../../../firebase-applet-config.json"`.
**Why it matters:** two modules now depend on a file git does not track, and a four-level relative path to the repo root inside a feature component is a layering break — the CI workflow has a 12-line comment explaining the breakage this caused on Sep 12 2026.
**Direction:** re-export what the tab needs (`projectId`, `firestoreDatabaseId`) from `src/firebase.ts` so exactly one module reads that file.

### #19 — `firebase-admin` is two majors apart between root and functions. **Severity: Low**
`package.json` `"firebase-admin": "^13.10.0"`; `functions/package.json` `"firebase-admin": "^11.11.0"`.
**Why it matters:** `server/` and `functions/` both write the same documents through different SDK majors. Timestamp and `FieldValue` semantics have moved between 11 and 13.
**Direction:** align them, or write down deliberately why not.

### #20 — knip's dependency findings are all false positives, which makes the tool mute. **Severity: Low**
knip reports 3 unused dependencies and 1 unused devDependency. All four are explicable: `tailwindcss`, `tw-animate-css` and `@fontsource-variable/geist` are consumed by CSS `@import` at `src/index.css:2,3,5` (knip does not parse CSS); `shadcn` is the component-generator CLI driven by `components.json`. `knip.json` has `"ignoreDependencies": []`.
**Why it matters:** a tool that cries wolf four times out of four gets ignored, and its 324 *true* findings (#13) go with it.
**Direction:** list those four in `ignoreDependencies`, and add `src/**/*.test.{ts,tsx}` to `entry` so co-located tests count as entry points.

### #21 — `setActiveTimeZone` is a module-level mutable singleton. **Severity: Medium (multi-tenant flag)**
`src/lib/studio-time.ts:16` `let activeTimeZone = DEFAULT_TIME_ZONE;` set by `setActiveTimeZone` (line 24), whose own comment says *"the app only ever shows one studio at a time, so a module-level value keeps call sites free of plumbing."*
**Why it matters — flagging per the multi-tenant rule:** that premise holds for the floor and breaks for every cross-studio screen. Operations → Overview, `NetworkOverview`, the franchise roll-ups and the renewals job all put more than one studio's data on one screen, and all 22 date helpers in that module will bucket every one of them into whichever studio the context set last. A franchise owner comparing an Ohio studio with one in another zone gets days drawn on the wrong boundary, silently.
**Direction:** keep the singleton as the default for the floor, but make the bucketing helpers take an explicit `tz` argument wherever a screen shows more than one studio.

### #22 — 27 non-test files over 800 lines, and the largest untested ones are all screens. **Severity: Medium**
Largest files with **no sibling test and no mention in any test**: `ClientsView.tsx` (1,519), `academy/AcademyWikiView.tsx` (1,440), `subjective-report/SubjectiveStep.tsx` (1,032), `relay/notes/NoteEditor.tsx` (912), `catalog/CatalogWikiView.tsx` (892), `trainer-profile/EditTrainerModal.tsx` (882), `relay/notes/NotesPanel.tsx` (844), `client-dossier/ClientDossier.tsx` (783), `studio-tasks/RequestsLane.tsx` (732), `ClientDirectoryView.tsx` (732), `admin/studios/AdminStudiosTab.tsx` (722), `WorkoutChartGrid.tsx` (701), `admin/mindbody/AdminMindbodyTab.tsx` (671), `StudioSelectionView.tsx` (657), `journey-grid/SessionNowBar.tsx` (635).
`src/contexts/` — `ActiveStudioContext.tsx` (252 lines, the file that sets the timezone singleton and gates tenancy) — has **zero** tests.
**Direction:** `SessionNowBar.tsx` and `ActiveStudioContext.tsx` are the two on that list that belong to the floor. Start there.

---

## 4. Metrics

| Measure | Value |
|---|---|
| `src` files, total / `.ts`+`.tsx` | 1,038 / **926** (560 `.ts`, 366 `.tsx`) — the other 112 are 58 `.css`, 28 `.md`, 19 `.json`, 6 `.webp`, 1 `.svg` |
| Lines of `.ts`/`.tsx` in `src` | 212,643 |
| Test files / `*.render.test.tsx` | 223 / **36** |
| `it()`/`test()` in `src` / `describe()` | 3,036 / 805 (runner reports 3,516 tests via `it.each`) |
| `npx tsc --noEmit` | **10** errors — `ClientInfoSheet.tsx` ×6, `AppContent.tsx` ×2, `clinical-review/charts.tsx` ×1, `EditTrainerModal.tsx` ×1. Baseline file says 11 |
| `npx tsc --noEmit --strict` | **97** (75 src non-test, 14 test, 8 scripts/server) |
| `: any` / `as any` / `<any>` outside tests | 386 |
| `any` inside `src/types.ts` | **92** of 856 field declarations |
| `Record<string, any>` in `src` | 25 |
| `@ts-ignore` / `@ts-expect-error` | **0** |
| `eslint-disable` | 20 — all `react-hooks/exhaustive-deps`, against a linter that is not installed |
| `useEffect` / `useMemo` / `useCallback` | 311 / 482 / 121 = **914 unverified dependency arrays** |
| TODO/FIXME/HACK/XXX | 1 |
| Exported `interface`/`type` in `src` | **1,325** in 459 files (294 infra, 1,021 domain) |
| Exported functions in `src` / duplicated names | 2,051 / **36** |
| Exports from `src/types.ts` / dead at the module boundary | 70 / **22 (31%)** |
| knip: unused files / exports / types / deps | 6 / 379 / 178 / 4 |
| knip verified: exports with no reference outside their file | **324 of 379**; 55 false positives; 0 test-only |
| knip spot-check (20 random) | 18 confirmed dead, 2 false positives |
| Non-test files > 800 lines | **27** |
| Firestore collections in `firestore.rules` / covered by the rules test | **67 / 34 (51%)**, 118 test cases, 2,364 lines |
| Collection naming | 64 camelCase, **3 snake_case** (`access_requests`, `bug_reports`, `hub_announcements`) |
| Date representations in the model | **5** (Timestamp-as-`any`, ISO string, `YYYY-MM-DD`, epoch number, "either" by comment) across **4** conversion modules + 16 duplicated helper names |
| Test cases: floor-adjacent vs `features/admin` | **212 vs 599** |
| `functions/` tests: files / cases / run by any repo command | 14 / **172** / **no** (verified passing in 4.92 s) |
| Tests transitively importing `src/firebase.ts` unmocked (value imports) | **4** |
| Dependencies / devDependencies / installed packages | 25 / 17 / 709 (`node_modules` 835 MB) |
| Tracked files / repo size | 1,448 / ~19 MB (`docs/` 3.7 MB, `src/features/academy/content` 1.4 MB, code-split) |
| Largest tracked files | `package-lock.json` 604 KB · `functions/package-lock.json` 269 KB · `academy/content/overviews.json` 240 KB · `docs/rounds/CHANGELOG.md` 180 KB · `academy/content/mastery.json` 156 KB · `data/machine-definitions.ts` 137 KB · `WorkoutTrackerView.tsx` 136 KB · `firestore.rules` 131 KB |
| Commits / branches / conventional-commit subjects | 554 / 7 / 229 of 554 (avg subject 73.7 chars) |
| Case-collision filenames | **0** |
| `@types/react` | **installed**, 19.2.18, in `devDependencies`. `key?: any` appears **2×**. The memory note is stale |

### Where the repo is genuinely in good shape
Worth saying plainly, because most of this report is criticism: `@ts-ignore` is zero; TODO count is one; there are no case collisions; no server-only package (`firebase-admin`, `express`, `compression`, `axios`) is imported anywhere in `src`; the Academy's 1.4 MB of content is properly code-split; `vite.config.ts`'s manual chunking is deliberate and explained; `src/lib/set-outcome.test.ts`, `src/lib/tracker-screen.test.ts`, `src/features/rating/Dial.render.test.tsx` and `src/hooks/useStudioRoster.render.test.tsx` are as good as tests get — they pin named bugs, cover legacy data, and assert behaviour rather than shape; and the CI workflow's comments are better engineering documentation than most teams write.

---

## 5. Direct questions for AJ

**On strictness**
1. `functions/tsconfig.json` is `strict: true` and the app's is not — was that a decision, or did the Firebase init template just come that way? If it was a decision, what makes 4 backend files worth more protection than 926 floor files?
2. `--strict` costs 97 errors, only 87 more than today. That is cheap *because* 386 `any`s are absorbing the risk, not because the code is safe. Do you want `strictNullChecks` on before beta — when the fix is ~17 files — or after, when every new screen has been written without it?
3. There is no linter, and 20 comments in the repo suppress `react-hooks/exhaustive-deps`, a rule that has never once run. Across 914 dependency arrays, how many stale-closure bugs do you think you have shipped and attributed to Firestore?

**On the vocabulary**
4. `src/types/machines.ts` says "nothing here is read directly by a component; components consume `ResolvedMachine`." `ResolvedMachine` is imported by 2 files and the superseded `Machine` by 70. Is that migration going to finish, or should the comment be rewritten to describe what is true?
5. `FocusCategory` and `FocusStatus` are exported twice with different values, and nobody imports the `types.ts` pair. Delete the legacy types in one sweep this week, or let them rot until something touches them? (The sweep is ~30 exports and, on current evidence, breaks nothing.)
6. Should every type name be a noun from the studio's own vocabulary — the words on `docs/business/the-floor.md`? Today one logged set is `ExerciseLog`, `LiveSet`, `PriorSet`, `SetFact`, `OutcomeLog`, `LastSetLike` and `JourneySet` depending on which folder you are in. A trainer would call all seven "the set".
7. `monthKeyOf` exists four times with four different signatures; `STUDIO_LEADER_ROLES` — a role list, i.e. an access boundary — exists twice. Which of those two bothers you more, and is there a reason `src/lib` is not the single home for date math?

**On the tests**
8. Of ~3,036 test cases, 212 touch the floor and 599 touch admin. If a trainer's iPad had to be right about exactly one thing tomorrow, are these the right 3,036?
9. 36 render tests for 926 source files, and not one of them mounts the Active Session screen. `WorkoutTrackerView.tsx`'s only "coverage" is a test that reads it as a text file and greps the source. Is that a conscious trade (the rules are extracted and tested, so the shell is low-risk), or is it just where the effort ran out?
10. `functions/` has 172 passing tests that `npm test` does not run and CI does not mention — including webhook signature verification and the DLQ. The rule is "protect the backend." What is protecting it right now?
11. `tests/firestore.rules.test.ts` covers 34 of 67 collections and skips `journalEntries` and `progressReports` — the two most sensitive. And the rules job is `continue-on-error: true`, so it cannot fail the build. Before beta, should the rules job become a required check?

**On hygiene**
12. `auditLogs` has a rules block, a type, and a purge-script entry, and has never been read or written. Delete it, or make it real? An audit log nobody writes looks like a control that exists.
13. `src/features/relay/index.ts` says "AppContent lazy-loads PlannerView from here" — nothing imports it, and `MyStudioView.tsx:8` imports `PlannerView` directly and eagerly. How many other doc comments in the repo describe an intention rather than the code, and would you want a cheap way to find out?
14. `src/lib/studio-time.ts` keeps the active timezone in a module-level `let`, on the stated premise that "the app only ever shows one studio at a time." Operations → Overview and `NetworkOverview` both break that premise. Is cross-studio date bucketing currently wrong, or is something else re-pinning the zone per row?
