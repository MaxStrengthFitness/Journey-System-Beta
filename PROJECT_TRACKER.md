# Max Strength App - Features & Progress Tracker

This document serves as a comprehensive overview of the Max Strength application. It is designed to be easily readable for presentations (like Google Slides) or ingested by AI tools (like NotebookLM) to understand the full scope of the app. It also includes a Quality Assurance (QA) section to track remaining tasks.

## 📋 Core Dashboards & Features

### 1. Trainer Control Hub
The central command center for trainers to manage their environment and settings.
*   **Hardware Settings**: Manage equipment, machine seat settings, and calibration.
*   **App Settings**: Admin-level configurations for the app experience (Theme, Franchise specifics).
*   **Data Exports & Reporting**: Download CSV reports for trainer performance, payroll summaries, and client attendance logs.
*   **Notifications & Alerts**: Configure automated SMS/email booking reminders and owner daily action summaries.
*   **Integrations & Webhooks**: Centralized pane to manage API credentials (e.g., Mindbody), toggle auto-sync polling intervals, and monitor connection health and sync logs.
*   **Announcements**: Create and view studio-wide announcements.

### 2. Client Directory & Profiles
Comprehensive management of client relationships, health data, and progression.
*   **Client Onboarding**: Setup wizards for new clients, recording demographics, injuries, and goals.
*   **Health & Body Tracking**: Track weight, body fat %, skeletal muscle mass, and subjective feel (energy/sleep).
*   **Clinical Review**: Pre-session review of client history, injury notes, and recent performance drops.
*   **Progress Reports**: Visual charts depicting strength gains over time, broken down by demographics and muscle groups.

### 3. Active Session & Routine Builder
The core workout execution and planning engine.
*   **Routine Builder**: Drag-and-drop tool to queue up machines, set target weights/reps, and define rest periods.
*   **Active Session HUD**: Real-time timer, dynamic execution sequences, and live tracking of Weight, Reps, and RPE (Rate of Perceived Exertion).
*   **Machine Setup**: Auto-displays the client's saved seat and pin settings for fast transitions between machines.

### 4. Post-Session Briefing (Victory HUD)
Gamified recap screen displayed immediately after a workout concludes.
*   **Performance Metrics**: Total tonnage lifted, total duration, and intensity score.
*   **Personal Records (PRs)**: Highlights new max weight or volume milestones achieved during the session.
*   **Progression Visualizer**: Shows today's performance compared to historical averages.

### 5. Machine Anatomy Catalog
Educational and strategic tool for targeting specific muscle groups.
*   **Interactive Body Map**: Visual representation of the human body to highlight primary and synergist muscles.
*   **Catalog**: Comprehensive directory of all studio machines, linked to the specific muscles they train.
*   **Filters & Search**: Quickly find alternative machines based on client injuries or occupied equipment.

### 6. Admin & Franchise Management
Tools for studio owners and regional managers.
*   **Multi-Studio Management**: Switch between different locations, view aggregated metrics, and manage location-specific overrides.
*   **User Directory**: Invite trainers, assign roles (Admin, Studio Leader, Trainer), and manage permissions.
*   **Analytics Dashboard**: High-level views of retention rates, revenue, and utilization.

---

## 🔗 Spec: Automatic Mindbody ↔ Firebase Client Linking (contractor scope)

_Added Aug 30, 2026. **STATUS: implemented Aug 30 — code is written and typechecks, but NOTHING has been run against a database yet.** The manual "Not Synced Yet" escape hatch in `ClientsView.tsx` stays until the migration below runs clean on live._

### ⚠️ Runbook — do these in order

1. **Check the studio mapping first.** Admin → Studios: every studio needs `mindbodySiteId`. Any studio sharing a site with another also needs `mindbodyLocationId`. The migration's preflight prints exactly which are missing; nothing downstream works without this.
2. **Dry run on staging:** `npx tsx scripts/migrate-canonical-client-ids.ts` (reads `firebase-applet-config.json`, so this hits msftesting-cda43). Writes nothing. Read `backups/migration-report-*.json`.
3. **Commit on staging:** add `--commit`. Then use the app against staging and confirm client profiles, history and machine settings all still resolve.
4. **Dry run on live:** `npx tsx scripts/migrate-canonical-client-ids.ts --project gen-lang-client-0731527386 --database ai-studio-32cbbdcc-6e08-4770-9665-867c68878efa`
5. **Commit on live** with the same flags plus `--commit`. A full JSON backup of everything it touches is written to `backups/` before the first write, and old client docs are tombstoned, not deleted.
6. **Only then** deploy the functions (`cd functions && npm run deploy`) and the front end. Deploying the strict pull-sync BEFORE the migration means any client whose `mindbodyClientId` is not yet stamped stops linking to their appointments.
7. Once the app has been healthy for a few days: `--sweep-tombstones` to remove the old docs, and `--dedupe-schedules` if the grid shows any appointment twice.

**No new Firestore indexes are required** — every new lookup is a single-field equality (`mindbodyClientId`, `mindbodyId`, `email`), which Firestore indexes automatically.

### The root cause: two writers, two ID schemes

| | Pull-sync (`src/lib/mindbody-api-sync.ts`, runs in the browser on "Refresh Schedule") | Webhook (`functions/src/mindbody/index.ts`) |
|---|---|---|
| Client doc id | Whatever the existing Firestore doc id is; found by **fuzzy name match** | `clients/{mindbodyClientId}` — the raw Mindbody number, used directly as the doc id |
| Schedule doc id | Auto-generated; reconciled on later syncs via a `mindbodyAppointmentId` **field** lookup | `schedules/{bookingId}` |
| `schedule.clientId` | Fuzzy-matched Firestore id, or `null` when no match | Raw Mindbody numeric client id, written **unverified** |

Because the two paths disagree, one human can end up as two documents (a real profile with session history + a sparse webhook-created `clients/{numeric}` doc), and a webhook-stamped `schedule.clientId` routinely points at a doc that does not exist. `useLiveSchedule.ts` then self-heals that schedule to `clientId: null`, the hub can't resolve the block, and a trainer has to link it by hand. **Auto-linking is not a feature to add — it is this inconsistency to remove.**

### Step 1 ✅ — One canonical join key: `mindbodyClientId` as a FIELD, never as a doc id
Every resolution path (webhook, pull-sync, UI) goes through `where("mindbodyClientId", "==", id)`. Firestore auto-indexes single fields, so no index deploy is needed. Doc ids stay opaque. This is the whole fix in one sentence; the rest is mechanics.

### Step 2 ✅ — `client.created` must produce a COMPLETE profile
Today the `isClientEvent` branch writes ~8 enrichment fields with `set(..., { merge: true })` to `clients/{clientId}`. It never writes `firstName`, `lastName`, `homeStudioId`, `isActive`, `remainingSessions`, or `height` — all required by the `Client` interface — so a fresh client.created yields a doc the app treats as broken.

1. ~~Resolve before creating (legacy-id, email and name adoption)~~ — **removed Aug 30 (STRICT MODE, AJ's call).** With the database being purged before go-live there are no legacy documents for a safety net to catch, so every adoption path was deleted rather than left as dead branches. `clients/{mindbodyClientId}` is the only location a Mindbody client is ever written to; a document sitting at any other id is ignored, not adopted. This applies equally to the pull-sync and to commercial (membership/contract) events.
2. **If genuinely new**, create with the full required shape: names, email, phone, dateOfBirth, gender, `isActive: true`, `remainingSessions: 0`, `sessionCount: 0`, `height: ""`, `mindbodyClientId`, `mindbody_name`, `createdAt`, `source: "mindbody-webhook"`.
3. **Never overwrite trainer-authored fields** — reuse the "fill only if empty" backfill pattern already in `mindbody-api-sync.ts` (lines ~418–459). `notes`, `clinicalNotes`, `clinicalProfile`, `medicalHistory` are app-owned; `mindbodyNotes` stays the separate read-only mirror.
4. **⚠️ Multi-tenant crux — `homeStudioId`.** It must be derived from the Mindbody site/location id via an explicit `studios` lookup table. If the site id doesn't map, write `homeStudioId: null` and queue it. Do **not** fall back to a default studio: a mis-tenanted client shows up on the wrong location's schedule and, given the permissive rules currently on live, is readable by every trainer in the franchise.

### Step 3 ✅ — `booking.*` must resolve the client the same way
The booking branch writes `scheduleData.clientId = String(clientId)` with no verification. Change to: resolve via Step 1; write **both** `mindbodyClientId` (raw, always) and `clientId` (Firestore doc id, only once resolved).

**Ordering hazard:** a booking event can arrive before the client event for a brand-new client. When the client doc is missing, create a **stub** from the booking payload (name + `mindbodyClientId` + studio) right there, so the schedule links immediately; `client.created` enriches it moments later. This stub rule is precisely what makes "if they're on the schedule, they're already linked" true rather than aspirational.

### Step 4 ✅ — Pull-sync converges on the same rule
- `findClientId()` already prefers an exact `mindbodyClientId` match when `mbClientId` is passed — **verify it is passed on every call path** from the appointment payload, since the fuzzy branch is where duplicates get born.
- On every successful fuzzy match, **write `mindbodyClientId` back** onto the client doc, so any given client takes the fuzzy path at most once, ever.
- **Key schedule docs by `mindbodyAppointmentId`** instead of an auto-id, matching the webhook's booking-id scheme. Today the same appointment can exist as two documents depending on which writer saw it first.

### Step 5 ✅ — One-off backfill/merge migration (must run before manual linking is deleted)
Against live, as a dry-run-first script with a printed report:
1. Stamp `mindbodyClientId` on every client doc that lacks it and matches confidently.
2. Find duplicate pairs (sparse `clients/{numeric}` webhook docs vs. real profiles). **Merge direction: keep the doc that owns the session history.** Copy Mindbody fields onto it, then repoint `schedules`, `sessions`, `sessionNotes`, `exerciseLogs`, `focusRecords` by `clientId`, then delete the sparse doc.
3. Emit an exceptions list. Zero unresolved rows is the gate for removing the escape hatch.

### Step 6 ✅ — Prerequisites already on this list
The DLQ wiring and idempotency-ordering items under High Priority are **blockers, not neighbours**. Auto-linking that silently drops events is worse than manual linking: the trainer no longer has a visible failure to correct.

### Step 7 ⬜ — Observability (not built)
Maintain a count of schedules with `clientId == null` for the current day; surface it on the Integrations Hub health card and alert when it stays above zero for more than ~15 minutes. That number reaching zero and staying there is the real ship signal for this work.

---

### The `mindbodyLimbo` queue — how an admin clears it

A parked event is one document per Mindbody event id (retries collapse onto the same record), carrying `kind` (`booking` | `client`), `siteId`, `locationId`, `clientId`, a plain-English `reason`, a `summary` an admin screen can render without opening the raw payload, the full `payload`, and `resolvedAt: null`.

Release workflow today: fill in the missing `mindbodySiteId` (or `mindbodyLocationId`) in Admin → Studios, then hit **Refresh Schedule** for that studio — the pull-sync re-fetches the bookings from Mindbody and files them properly, converting the times against the studio's own clock. Then mark the Limbo rows `resolvedAt`.

**Both writers now park here** (Aug 30): the webhook via `functions/src/mindbody/clientResolver.ts`, and the pull-sync via `src/lib/mindbody-limbo.ts`. Pull-sync rows use a deterministic id `pull:{siteId}:{appointmentId}` so pressing Refresh Schedule repeatedly updates one row instead of piling up duplicates, and are namespaced away from webhook event ids so the two writers cannot collide.

**Where the pull-sync parks, and why it moved.** The obvious place — the `if (!studioId)` guard inside the appointment loop — turned out to be **unreachable**: appointments are filtered to the studio's `effectiveLocationId` *before* the loop, so anything unmappable was already gone. Parking now happens immediately after the fetch, over the raw list, for any appointment whose location no studio claims. Appointments belonging to a SIBLING studio are deliberately left alone — they are not unmapped, just someone else's, and parking them would fill Limbo with noise on every sync. The in-loop guard remains as a backstop.

**One hole this does NOT close:** a studio sharing a Mindbody site with no `mindbodyLocationId` still returns early (`"...shares MindBody Site X but has no Location ID"`) and syncs nothing at all. Nothing can be parked because at that point every sibling studio's appointments arrive in one undifferentiated batch and there is no way to tell whose is whose. The webhook still catches those individually; the error message is loud and actionable. Left as-is deliberately.

**Admin UI: built** — `src/components/AdminLimboQueue.tsx`, wired as an admin-only "Limbo" tab in `AdminDashboardView`. Shows client name, raw appointment time (labelled unconverted), trainer, site/location ids and the reason; assigning a studio previews the converted local time *before* committing, then releases the booking onto `schedules/{bookingId}`, creating the canonical client if it does not exist yet. Client-kind rows get their `homeStudioId` set instead. Dismiss is available for junk.

### Pass / waitlist / visit data — read this before expecting values

AJ asked for eight fields off the booking payload: `clientPassId`, `clientPassSessionsTotal`, `clientPassSessionsDeducted`, `clientPassSessionsRemaining`, `clientPassActivationDateTime`, `clientPassExpirationDateTime`, `bookingOriginatedFromWaitlist`, `clientsNumberOfVisitsAtSite`.

**Mindbody's published `appointmentBooking.created` schema contains none of them.** The documented payload is: siteId, appointmentId, status, isConfirmed, hasArrived, locationId, clientId, clientFirstName, clientLastName, clientEmail, clientPhone, staffId, staffFirstName, staffLastName, startDateTime, endDateTime, durationMinutes, genderRequested, resources, notes, formulaNotes, icdCodes, providerId, sessionTypeId, appointmentName. The eight requested fields are characteristic of **class** booking events, and Max Strength books 1:1 appointments — so they may never arrive. Verify with `send-test-webhook.js` before relying on them.

The implementation is therefore **strictly additive** and costs nothing if they never appear:
- `functions/src/mindbody/passFields.ts` and its browser twin `src/lib/mindbody-pass.ts` (deliberate copies — the Functions package has its own tsconfig and cannot import from `src/`; **edit them together**). Tolerant of camelCase / PascalCase / snake_case, ignores nulls, keeps a legitimate `0`, and omits the `pass` object entirely when no pass field is present.
- Pass + waitlist go on the SCHEDULE document (`mindbodyPass`, `bookingOriginatedFromWaitlist`); `clientsNumberOfVisitsAtSite` goes on the CLIENT. It is **not** the same number as `sessionCount` — that is this app's own count of completed workouts, and the two will not agree.
- A payload without pass data writes no pass keys, so it can never blank out what an earlier event stored.
- `server.ts`'s appointment normalizer is a **whitelist** and was silently dropping these before the app saw them; it now passes all eight through. That is the one backend file touched outside `functions/`.

### What was actually built (Aug 30, 2026)

| File | What it does |
|---|---|
| `scripts/migrate-canonical-client-ids.ts` | The one-off migration. Dry-run by default, JSON backup before the first write, tombstones instead of deletes, resume log so a crashed run continues. Repoints 12 `clientId`-carrying collections **and** re-keys `clientMachineSettings`, whose doc ids are `{clientId}_{machineId}` — a field-only migration would have silently orphaned every client's saved seat and pin settings. |
| `functions/src/mindbody/clientResolver.ts` | `ensureCanonicalClient` — STRICT: reads and writes `clients/{mindbodyClientId}` and nothing else, no lookup queries at all. Merges into an existing doc (filling blanks only) or creates a complete profile. Plus `recordLimboEvent`, which parks unattributable events in `mindbodyLimbo`. |
| `functions/src/mindbody/retryLedger.ts` | Closes the idempotency/DLQ loop. On failure it counts the attempt and *releases* the idempotency record so Mindbody's retry is actually reprocessed; once the budget (4) is spent it dead-letters via `recordDeadLetter` and returns 200 to stop the retry storm. Fixes both webhook items in High Priority below. |
| `functions/src/mindbody/index.ts` | Client events build a full profile through the resolver. Booking events create a stub when the client event has not arrived yet, so the schedule links immediately. Unmapped/ambiguous sites are quarantined instead of defaulted. `hydrationLatencyMs` is now measured rather than hardcoded to 0. Schedule docs also carry `mindbodyAppointmentId`. |
| `src/lib/mindbody-api-sync.ts` | Fuzzy name matching **removed**. Strict `mindbodyClientId` join, canonical client creation when Mindbody knows someone we do not, and schedule docs keyed by the appointment id so the importer and the webhook can no longer create two documents for one appointment. |

**Deliberate design decisions worth remembering:**
- Clients with no Mindbody id (legacy FileMaker imports, hand-made profiles) are **left at their existing doc ids**. The invariant is "every Mindbody-known client lives at the canonical path", not "every client does".
- **Strict mode has one consequence to remember:** if a document with the same `mindbodyClientId` ever exists at another doc id, the webhook will now write a SECOND document at the canonical path rather than adopting the first. That is safe only because the database is being purged before go-live. If real historical data is ever imported, run `scripts/migrate-canonical-client-ids.ts` first — it exists for exactly that, and is dormant, not dead.
- An unmapped site **parks** the booking in `mindbodyLimbo` (AJ's call, Aug 30). It still must not reach `schedules`: the hub's studio filter treats a null studio as "belongs to everyone", so the row would leak onto every location's grid, and a guessed studio would show on the wrong roster. Limbo keeps it visible to an admin without either failure — during a 40-to-100 location rollout, a forgotten `mindbodySiteId` must not make trainers blind to arriving clients.
- **Limbo is deliberately NOT `mindbodyDLQ`.** DLQ depth drives the integration's health status — over 10 items reports the whole Mindbody connection as `error`. An unmapped site is an empty field in Admin → Studios, not an outage, and must not masquerade as one.
- **Parked bookings keep Mindbody's RAW wall-clock time strings, unconverted.** Without a studio there is no timezone to read a naive time against; storing a guessed UTC value would park the booking hours off and it would still be wrong after linking. Whatever releases a Limbo booking must do the conversion at that point, using the studio it is finally assigned to.

**Test status (Aug 30, 2026): green.** `npx vitest run functions/src/mindbody` → 9 files, 109 tests, 0 failures. `npx vitest run src/lib` → mindbody-api-sync 19, mindbody-pass 8, 0 failures. Both tsc passes clean.

Two real bugs were caught by that first run and fixed: a client with a first name but no surname was being given `"Client 12345"` as a last name, and a client with no name at all was getting `mindbody_name: ""` stored as a blank value instead of the field being omitted. `index.test.ts` was also updated — its mock now records which COLLECTION each write went to, because the handler legitimately writes to more than one place per event (a client profile plus, on an unresolvable site, a quarantine record), so "was anything written at all" stopped being a meaningful assertion. Four new tests cover the pull-sync's canonical-id behaviour, including the branch that deletes a stray schedule row.

**Still unverified:** everything involving a real database. No migration run, no deployed function, no live webhook.

---

## 🩺 Post-deploy fixes (Aug 30, 2026) — the 429 storm

First live deploy worked; appointments loaded. Then the console flooded with `429 Quota exceeded` and schedule blocks stopped resolving. **One root cause behind both symptoms.**

### The self-heal in `useLiveSchedule` (removed)
It ran inside the `schedules` snapshot handler and wrote `clientId: null` to any schedule whose client was not in its chunked `in` fetch.

1. **Write loop.** Each write re-triggered the very listener it ran inside: write → snapshot → fetch → write.
2. **Data loss under load.** When the fetch failed or came back short — exactly what a 429 causes — every schedule looked invalid, so it erased correct `clientId`s. A transient read failure became permanent damage, and that is why blocks showed "Not synced".
3. **Its reason had already gone.** The comment said it existed "so the fuzzy auto-linker can resolve it". Strict mode deleted the fuzzy auto-linker in the previous pass.

A schedule pointing at a client document that does not exist yet is now simply shown greyed out until the next sync creates it.

### Everything else that was compounding it
- **Roster re-fetch per snapshot.** `useLiveSchedule` fired ceil(n/10) `in` queries on every schedule snapshot. Now keyed on the sorted SET of client ids — identical rosters cost nothing — with an in-flight guard and a 30s cooldown after a quota error. A failed read never clears `liveRosterClients`: a stale name beats an empty grid, and "read failed" must never look like "these clients do not exist".
- **`ClientProfileView` session count (the line in the stack trace).** The effect depended on the `sessions` ARRAY, which the profile's own listener rebuilds into a fresh array on every write — so a 432-appointment sync meant one `getCountFromServer` per snapshot. It now depends on a primitive (`sessions.filter(Completed).length`) and calls `src/lib/session-count-cache.ts`: in-flight de-duplication (N callers → 1 query), a 60s TTL, and a quota cooldown that serves the last known value instead of hammering. It returns **null** for "unknown" so a failed read can never be mistaken for zero and written over a real count.
- **A write→read feedback loop.** That effect also listed `client?.sessionCount` as a dependency *and* wrote `sessionCount`. The value is now read through a ref.
- `invalidateSessionCount()` is called when a session completes (`sync-utils.ts`), so the count is fresh without waiting out the TTL.

### Manual linking: fully removed
- `ClientsView`: the "Not Synced Yet" dialog, its five state variables and its debounced client search are deleted; `findClientForSession` is a strict `clients/{mindbodyClientId}` lookup (it previously fuzzy-matched by name in three passes, which under strict mode can only disagree with the canonical id — and disagreeing means opening the wrong person's medical record).
- `ScheduleBlock`: an unlinked block is inert — no `role="button"`, not focusable, `cursor-default`.
- `AppContent`: `pendingLinkSchedule` and the schedule-auto-link on client creation are gone. `CreateClientModal` remains for the client-directory flows, which are unrelated.
- **`CalendarView` had a second copy of the same flow** and was not mentioned in the request: clicking a block name-matched against local state and then Firestore, and on a hit silently wrote `schedules/{id}.clientId` and `clients/{id}.mindbody_name` as a side effect of a click; on a miss it offered to create a client. Made strict.

**Test status:** functions 109 green; `src/lib` 107 green (mindbody-api-sync 19, session-count-cache 7, mindbody-pass 8, plus the pre-existing suites). Both tsc passes clean. `mindbody-commercial-sync.test.ts` cannot run in the Linux sandbox (it imports `firebase/firestore` at the top level for a real `Timestamp`) — untouched by this work, but confirm it on Windows.

---

## 🩺 "Everything says NOT SYNCED" (Aug 30, 2026)

After a clean 432-appointment Refresh Schedule, almost every block read "Not synced". **The client documents were being created correctly — the UI could not see them.**

### Root cause: the roster window was one day wide
`AppContent` builds its entire `clients` array from `useLiveSchedule`'s `liveRosterClients` (plus the one selected client). That hook fetched client documents for **today only**, but the hub's grid renders whichever **day tab** is selected. So every block on Tue/Wed/Thu had no client in the array and rendered "Not synced" regardless of what was in Firestore. The roster now spans yesterday → +8 studio days, capped at 400 clients, still memoised on the sorted id-set so identical snapshots cost nothing.

### Also fixed
- **The quota cooldown could never retry.** It returned early and waited for another snapshot — but after a sync finishes the writes stop, so no snapshot ever comes and the grid sat on an empty roster. There is now a retry timer, cleared on unmount.
- **Client creation was sequential.** `createCanonicalClientFromAppointment` awaited one `setDoc` per new client *inside* the appointment loop: hundreds of round trips across 432 appointments, slow enough that the grid rendered before the documents landed and heavy enough to help exhaust the write quota. Replaced by **phase 1** — every missing client for the studio being synced is upserted in batched writes (400/commit) *before* any schedule row is written, so rows always reference documents that already exist.
- **Multi-tenant guard on that batch.** Phase 1 only creates clients for appointments that resolve to the studio being synced. Without it, a sibling studio's appointment on the same Mindbody site would create its client with the wrong `homeStudioId` — the wrong roster, and the wrong permissions.

### Diagnostic
`scripts/diagnose-schedule-links.ts` (read-only, writes nothing) reports how many schedule rows have no `clientId` (A: sync could not identify the client), point at a missing document (B: client creation failed), or resolve correctly (C: the data is fine and the UI is the problem), plus a linked/total breakdown per day. Run it before theorising next time:

```
npx tsx scripts/diagnose-schedule-links.ts --project gen-lang-client-0731527386 --database ai-studio-32cbbdcc-6e08-4770-9665-867c68878efa
```

**Test status:** functions 109 green; `src/lib` 109 green (mindbody-api-sync now 21). Both tsc passes clean.

---

## ✅ Quality Check & To-Do List

Use this checklist to track pending features, bugs, and final polish items.

### High Priority
- [ ] **Data Persistence Check**: Ensure all newly added settings (Notifications, Auto-sync) correctly save to Firestore.
- [ ] **OAuth / Webhook E2E Testing**: Verify real-time schedule syncing with Mindbody using actual webhook payloads.
- [x] ~~**Webhook DLQ wiring**~~ — done Aug 30: `recordDeadLetter` was implemented and unit-tested but never invoked; `retryLedger.ts` now calls it once an event exhausts its retry budget. Not yet exercised against a real database.
- [x] ~~**Webhook idempotency ordering**~~ — done Aug 30: `tryRecordEvent` still commits before the business logic (the integration standards require the gate there), but a failure now releases that record so Mindbody's retry is genuinely reprocessed instead of being waved through as a duplicate. Not yet exercised against a real database.
- [ ] **Mobile Responsiveness**: Audit the Integrations Hub and Data Exports tabs on small screens to ensure no horizontal scrolling issues.

### Medium Priority
- [ ] **CSV Export Logic**: Implement the actual CSV generation and download functionality for the new Data & Reports tab.
- [ ] **Email/SMS Triggering**: Connect the UI toggles in "Alerts & Comms" to the backend cloud functions for dispatching messages.
- [ ] **Error Boundary Polish**: Ensure gracefully handled fallbacks if external API connections fail during active sessions.

### Low Priority / Nice-to-Have
- [ ] **Custom App Themes**: Allow users to define custom HEX codes for franchise branding.
- [ ] **Enhanced Animations**: Add subtle enter/exit animations to the Bento Stat Tiles on the Victory HUD.
- [ ] **Expanded Anatomy Data**: Further refine the synergist vs. primary muscle mappings for obscure equipment.
