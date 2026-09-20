# Area 6 — Everything that is not the React front end

**Scope:** `server.ts`, `server/*`, `functions/`, `firestore.rules` + `firestore.staging.rules` + `firestore.indexes.json`, `render.yaml`, `scripts/`, the Mindbody sync library, and the FileMaker/legacy importer (`src/features/admin/import/LegacyChartImporter.tsx`, `src/services/geminiService.ts`, `server/gemini.ts`).
**Constraint honoured:** nothing was changed. Suggestions that would touch the Mindbody integration, Cloud Functions or Firestore structure are labelled **needs AJ's OK**.
**Baseline confirmed in this clone:** `npx tsc --noEmit` → **10 errors** (matches CLAUDE.md; `.github/typecheck-baseline.txt` says 11).

---

## 1. What this area does — my interpretation

**One Express process does three unrelated jobs.** `server.ts` (1,097 lines) is the Render web service. It serves the built Vite bundle out of `dist/`, and it owns `/api/*`. Two of those routes are the Gemini OCR proxy (`/api/gemini/processChart`, `/api/gemini/extractSettings`, `server.ts:87` and `:103`) and nine are the Mindbody proxy (`server.ts:194`–`:975`). The Mindbody routes are gated by `requireStaff()` mounted at `server.ts:187`; the Gemini routes are declared *above* that mount and are therefore open to anyone who can reach the URL. `server/auth.ts` is a genuinely careful piece of work: it verifies the Firebase ID token with Google's public keys (no service-account key on the public service — `render.yaml` keeps it off deliberately), then re-reads the caller's own trainer document and each named studio **through the Firestore REST API using the caller's own token**, so the security rules judge those reads. It caches profiles for 5 minutes and studio→site for 10, and it deliberately reads single documents rather than listing, because a list is refused if any one document in it is off-limits (that took the schedule sync down on Sep 13). `server/mindbody-client.ts` is the single door to Mindbody: GETs only, one shared token cache per site.

**Two scheduled jobs run on Render, three more are written and parked.** `render.yaml` declares exactly two cron services: `journey-cron-leaderboards` (Sundays 07:00 UTC) running `server/cron-machine-trends.ts` → `server/machine-trends-job.ts`, which reads every client plus 90 days of `exerciseLogs` in one range query and rewrites `machineTrends/{machineId}`, `machineTrends/_summary`, `kaizenReports/*` and `studios/{s}/watch/performance`; and `journey-cron-renewals` (06:30 UTC nightly) running `server/renewals-job.ts`, which reads each studio's renewal settings, a fixed 90-back/30-ahead window of bookings and workouts, pulls contracts from Mindbody inside a 300-client budget, and rewrites `clients/{id}.renewal` only where it changed. Both funnel through `server/cron-runtime.ts`, which forces an explicit `process.exit(0|1)` so Render's dashboard can tell a real failure from a silent no-op. The notification worker (`server/worker.ts`, 446 lines) and the two notification crons are **committed but commented out of `render.yaml`** — AJ's call, because they are the only things in the repo that could ever message a person.

**Cloud Functions are two very different codebases living in one folder.** `functions/src/mindbody/` (5,115 lines including 2,443 lines of tests) is the strongest code in the repository: HMAC signature verification, a transactional idempotency gate on `mindbodyEventLog`, a retry ledger with a dead-letter queue, a "Limbo" queue for anything that cannot be attributed (`mindbodyLimbo`), a health-state document, strict canonical client resolution with no name matching, and staff events that write only the `mindbody` map and never touch a trainer's role or access. `functions/src/trainerRollups.ts` is also careful — a `rollupCounted` flag on the session makes the at-least-once trigger safe, and the nightly window job rewrites every trainer so a departed coach does not keep last month's number. `functions/src/index.ts`, by contrast, is the old code nobody has revisited: a nightly job that reads three whole collections to write a document no screen reads, a callable that can hand out Admin if the `trainers` collection is ever empty, and two producers writing into a queue with no consumer deployed.

**`firestore.rules` is 2,626 lines and 134 KB with 97 helpers and 79 `match` blocks**, and it is the real enforcement layer — ARCHITECTURE §2.5 says outright that "nothing on the Operations side is gated beyond opening it… the Firestore rules are the real enforcement." The newer sections (sessions, InBody, shared notes, renewals, machine fit, announcements, the grant) are written to a consistent pattern: resolve the caller once with `getRole()` + `callerTrainer()`, pass the role string and trainer map down as parameters so the helpers cost map lookups rather than document reads, and check the document's shape on write. The older sections (`clientMachineSettings`, `exerciseLogs`, `schedules`, `sessionNotes`, `settingHistory`, `auditLogs`, `notificationQueue`, `bug_reports`) are `if isAuthenticated()` with no shape check, and they are where the holes are.

**The FileMaker import is an OCR pipeline in the browser.** A trainer opens a client, taps "Open Migration Hub (OCR)" in `ClientInfoSheet` (`src/components/ClientInfoSheet.tsx:276` / `:308`), which dispatches a `window` event that `ClientProfileView.tsx:440` turns into `setView("chart-importer")`; `CreateClientModal.tsx:108` routes there too when you tick "existing client". `LegacyChartImporter.tsx` (1,270 lines, 12 `useState`, one component) reads the dropped images as base64 in the browser, POSTs each page individually to `/api/gemini/processChart`, then POSTs **all the images again** in one call to `/api/gemini/extractSettings`, merges the two answers into an editable grid, and on "Confirm & Write Full History" writes — from the browser, in `writeBatch` chunks of 450 — one `sessions` document and N `exerciseLogs` documents per column, one `clients/{id}` update carrying `completedSessions`, `sessionCount`, `lifetimeReps`, `lifetimeWeight`, `currentMachineMetrics`, `trainerTally.*` and `machineStats.*`, and one `clientMachineSettings/{clientId}_{machineId}` per machine. There is no dry run, no undo, and no dedupe key.

---

## 2. Anomalies

### A. The FileMaker import (AJ's Phase 3 ask)

**1. The "settings only" path — the one that is supposed to be lightning-fast — cannot return a weight at all. — Critical**
`server/gemini.ts:79-107` (`MACHINE_SETTINGS_OCR_SCHEMA`) declares exactly seven properties: `machineId`, `seat`, `gap`, `backPad`, `handles`, `armPad`, `rawSettings`. There is no `currentWeight` and no `startingWeight`. `server/gemini.ts:196` then tells the model *"Ignore weight and rep data. ONLY focus on the static machine settings."* But `src/services/geminiService.ts:55-56` declares `startingWeight?: string; currentWeight?: string` on `OCRMachineSetting`, `LegacyChartImporter.tsx:1035-1057` renders "STR LBS" / "CUR LBS" number inputs bound to them (`:1037`, `:1050`), and `LegacyChartImporter.tsx:705` / `:708` write `extracted?.currentWeight` into `clientMachineSettings.currentWeight`. **Because `responseSchema` constrains the model's output, those two fields are always `undefined`, so "Import Machine Settings Only" always produces blank weights that a human must type in by hand.** That is the exact opposite of the request.
*Direction:* add `currentWeight` / `startingWeight` to the response schema, stop telling the model to ignore weight on that path, and have it read the last non-empty session cell per row. This is the single highest-value change in the whole area.

**2. `machineName` is on the client type, absent from the schema, so the review screen shows raw ids. — Medium**
`src/services/geminiService.ts:48` declares `machineName: string` as required on `OCRMachineSetting`; `server/gemini.ts:79-107` never returns it. `LegacyChartImporter.tsx:1026` therefore labels each card `s.machineId.replace(/_/g, ' ')` — a trainer verifying an import reads "m leg press", not "Leg Press".
*Direction:* return the printed row label alongside the id, and show both (what was on the paper / what it matched to).

**3. The chart prints full names with vendor suffixes; both dictionaries are two-letter abbreviations, and they disagree with each other. — Critical**
`server/gemini.ts:154-175` maps 20 abbreviations (`LP`, `LE`, `LC`, `ABD`, `ADD`, `CP`, `OP`, `SD`, `CF`, `TE`, `LR`, `CR`, `PD`, `PO`, `SR`, `BC`, `LE/L`, `AB`, `TR`, `CE`) to canonical ids. `LegacyChartImporter.tsx:39-69` has a *second, different* map from full names and abbreviations to display names. They contradict: the server maps `SR → m-simple-row`, the importer maps `"sr" → "Compound Row"`. Neither knows any of the vendor variants the real chart prints — `Leg Press Imag.`, `Leg Press Hoist`, `Leg Press Nt`, `Pulldown Nt`, `Chest Flye Hoist`, `Overhead SSS/CRX/MX`, `Ab T/R`, `Ab MX`, `Ab H`, `Lumbar K`, `Lumbar ROM`, `Comp. Row Hoist`, `Seated Dip Hoist`, `Rear Delt Hoist`, `Cx`. Worse, the fallback at `LegacyChartImporter.tsx:76-81` does substring matching in **both directions**, so `"Leg Press Imag."` and `"Leg Press Hoist"` both contain the key `"leg press"` and both collapse to the single machine `"Leg Press"` — and then the de-duplicator at `LegacyChartImporter.tsx:244-245` silently discards the second one, because it has the same `machineId` and the same normalised `name`. **A client who did both Leg Press machines in one session loses one of them, with no message.**
*Direction:* generate one dictionary from `src/data/machine-definitions.ts` plus each studio's own roster names (`studios/{s}/roster`), send *that* to the model as the closed vocabulary, and match on exact id — never substring. Vendor variants are separate machines in the studio's own roster, so the studio's roster is the right source.

**4. Unmatched machines are dropped silently, and the code that counts them is thrown away. — Critical**
`LegacyChartImporter.tsx:257-258` sets `isAnomalous: !machineMatch` and `anomalyReason: "Unknown Machine: …"` on every row whose machine did not resolve. **Neither field is read anywhere in the file** (grep: two hits, both the assignment). At commit time `LegacyChartImporter.tsx:412` and `:573` and `:650` all do `if (!vLog.machineId) continue;`. `src/lib/legacy-import-utils.ts:38-46` computes a `droppedLogs` list exactly for this — and the only readers are its own test (`src/lib/legacy-import-utils.test.ts:96,106`). The importer never looks at `plan.droppedLogs`.
*Direction:* the Validation HUD must have an "unmatched" row group with a machine picker per row; nothing commits until every row is matched or explicitly discarded.

**5. The rep heuristic turns a weight into a 60-second static hold. — Critical**
`server/gemini.ts:269`: *"If bottom text includes 'SH' or 'sec' or is > 20, set isStaticHold to true."* `LegacyChartImporter.tsx:230-232` repeats it: `else if (Number(perf.reps) > 20 || repStr.includes('sh')) { isTSC = true; }` and `:264` then sets `timeUnderLoad: isTSC ? (Number(finalReps) || 90) : 0`. AJ's screenshots show reps up to 13 and a **second number beside the reps that is a weight** (60, 122, 54, 26). If the model reads that second number as the rep value, `60 > 20` fires and the set is written as a 60-second time-static contraction with the reps blanked (`LegacyChartImporter.tsx:416-417`). It then feeds `lifetimeReps` as `(60/30)*2 = 4` reps and `lifetimeWeight` as `weight × 4` (`:465-478`).
There is a second failure in the same block: `LegacyChartImporter.tsx:226` fires `isTSC` on `repStr.includes('s')` — **any** letter s anywhere in the string.
And a third: if the model returns `"9  60"` for a cell, `Number("9  60")` is `NaN`, so `finalReps` becomes `0` (`:223`), the row is still written, and `importedOutcome` (`src/lib/set-outcome.ts:232`) stamps it **`outcome: "skipped", skipReason: "unknown"` with a real weight attached** — the comment at `LegacyChartImporter.tsx:424-430` claiming "today every row here is performed" is not true.
*Direction:* teach the prompt the cell's actual geometry (weight top-left, circled order number, pencil, reps bottom-left, optional second number to the right of reps) and return those as **separate named fields**, so no heuristic has to guess what a number means.

**6. The settings heuristic assumes five fixed fields; the chart has per-machine variable labels. — High**
`server/gemini.ts:188-191` decodes only Seat / Gap / Back Pad / Handles-or-Width. `src/lib/utils.ts:121-127` (`parseMachineSettings`) hard-codes exactly the same five: `S→Seat, G→Gap, B→Back Pad, H→Handles, A→Arm Pad`, and its regex at `src/lib/utils.ts:135` only matches a **single** leading letter from `[SGBHA]`. The real chart prints `Pads- 1`, `Ft- (blank)`, `E- N`, `Pad- 2`, `Blocks`, `SH`, and values that are decimals (`1.5`) or letters (`N`, `W`, `M`). `Ft- 3`, `E- N` and `Pads- 1` all fail the regex, fail the `:` branch, and fall to the `'General'` catch-all at `src/lib/utils.ts:168-173`, which only keeps the string if it is ≤ 8 characters — so most of them vanish. Meanwhile the app's own model (`Machines` admin screen, six generic "Setting 1..6" label slots) already says the label set is per machine.
*Direction:* stop decoding into five named fields. Ask the model for an ordered list of `{label, value}` pairs exactly as printed, and map them onto that machine's own `settingFields` slots at import time — **needs AJ's OK** if it changes what is stored on `clientMachineSettings`.

**7. Settings are requested per session cell, when they exist once per machine row. — High**
`server/gemini.ts:136-142` makes `settings` a **required** property of every item in `performances`, and `performances` is one entry per machine per session. On a 12-column page with 19 machines that asks the model to emit the same settings string up to 228 times — 12 chances per machine to hallucinate a different value, and a large multiple of the output tokens. The importer then writes `machineSettings: parseMachineSettings(vLog.settings)` onto **every** exerciseLog (`LegacyChartImporter.tsx:432`), so a value recorded once per machine is denormalised onto every set.
*Direction:* two passes with two shapes — one row-scoped settings pass (cheap, one object per machine), one cell-scoped performance pass with no settings field at all.

**8. The blue circled performed-order number and the pencil/note marker are not in the schema at all. — High**
`CHART_OCR_SCHEMA` (`server/gemini.ts:109-147`) has `sessionNumber, machineName, settings, weight, reps, isStaticHold` and nothing else. The chart's circled number is the order the machine was performed in that session — which is exactly `sessions.sessionMachineIds` (ARCHITECTURE §1.6, "Non-linear execution… track the chronological order actually performed"), and the importer never writes that field. The pencil marks a note; the notes dialogs hold real clinical text ("Had to assist on the last few", "Left shoulder issues, be wary on chest fly"). None of it is captured.
*Direction:* add `performedOrder` and `hasNote` to the performance schema and write `sessionMachineIds` from the order numbers — **needs AJ's OK** (it adds a field to `sessions`). Whether the notes themselves get a second pass is a separate call.

**9. The "Expected Sessions to Extract" control is wired to nothing. — High**
`LegacyChartImporter.tsx:804` binds the input to `expectedSessions`, and `:809` tells the user it is "Bounding cross-grid search space to maximize extraction speed." `LegacyChartImporter.tsx:154` then calls `processLegacyChart([file], 12, i, imageFiles.length)` — a **literal 12**. And `server/gemini.ts:242` declares the `expectedSessions` parameter and never references it; the prompt hard-codes "exactly 12 vertical columns" at `server/gemini.ts:251`. The number the trainer types only gates the button (`:880`).
*Direction:* delete the control, or make the page count real. (12 per page happens to be right per AJ's screenshots, so the hard-coding is correct — the control is the lie.)

**10. The import contract in `prior-history.ts` has zero production callers. — Critical**
`src/lib/prior-history.ts:111-122` is headed "**THE IMPORTER'S CONTRACT** — An importer that writes `n` historical session documents must put the result of this back on the client, or the total drifts by `n` for good." CLAUDE.md repeats it: "Any importer of historical sessions MUST raise `importedCount`." Grep for `recordImportedSessions`: **the only callers are its own test file.** `LegacyChartImporter.finalizeImport` (`:320-724`) never touches `priorHistory`. Since `totalSessions = journeyCount + priorUncounted(prior)` (`src/lib/prior-history.ts:100-108`) and `priorUncounted` (`:84-92`) subtracts `importedCount`, **every OCR import double-counts the sessions it brings in, permanently.** The irony is on record: `src/features/admin/data/AdminDataReportsTab.tsx:15-23` says the *other* importer was deleted partly because "it never raised `priorHistory.importedCount`, so every count it fed was wrong". The surviving one has the same bug.
*Direction:* one line in the client update — but it has to be a transactional read-modify-write of `priorHistory`, not an `increment()` on a nested field, because `sessions` must stay exactly as the human stated.

**11. A re-import silently doubles five counters. There is no dedupe key, no dry run and no undo. — Critical**
`LegacyChartImporter.tsx:369` creates the session with `doc(collection(db, 'sessions'))` — a fresh random id every run. Nothing keys on `(clientId, sessionNumber)` or on the date. So re-running the same chart writes a second full copy of the history, and on the client document: `completedSessions: increment(n)` (`:493`), `lifetimeReps: increment(...)` (`:499`), `lifetimeWeight: increment(...)` (`:502`), `trainerTally.*: increment(...)` and `machineStats.*.timesPerformed: increment(...)` (`:514`, via `src/lib/client-rollups.ts:351,396`) all compound. The Cloud Function `onSessionRollup` (`functions/src/trainerRollups.ts:210`) then counts each duplicate session onto the trainer's lifetime total as well. `src/lib/legacy-import-utils.ts:16-28` explicitly names this hazard for *empty* columns and fixes only that case.
*Direction:* a deterministic document id (`legacy_{clientId}_{isoDate}` or `{clientId}_{sessionNumber}`) makes the whole import idempotent in one stroke, and turns "re-run it" from a disaster into the recovery path. Plus a real dry-run screen that prints the write plan (`planLegacyImport` already produces most of it).

**12. `sessionCount` is a hard overwrite of a live counter. — High**
`LegacyChartImporter.tsx:494`: `sessionCount: maxSessionNum`. If you import page 1 of a five-page chart for a client with 400 sessions, their `sessionCount` becomes 12. `ClientProfileView.tsx:425-428` will later reconcile it, but in between the header lies — which is precisely the "confident wrong number is worse than a missing one" rule (§1.11 invariant 6).
*Direction:* never set it downward; `Math.max` against what is there, or leave it to the reconciler entirely.

**13. `currentMachineMetrics` is rebuilt from a streamed copy and written back whole. — High**
`LegacyChartImporter.tsx:534` seeds the map from `targetClient?.currentMachineMetrics` — the client object handed down as a prop from `AppContent` — and `:630` assigns the whole rebuilt map back. Anything another trainer wrote to that map while the import was being reviewed is overwritten. Importing a client's chart while they are mid-session would also stamp historical weights over today's.
*Direction:* write only the machine keys the import actually touched (`currentMachineMetrics.{machineId}` field paths), never the whole map.

**14. The commit is 450-op batches with no transaction boundary, so a failure leaves a half-import. — High**
`LegacyChartImporter.tsx:355-364`: `MAX_BATCH_SIZE = 450`, committed as it fills. For a 60-session client (~420 logs + 60 sessions + 1 client update + ~19 settings ≈ 500 ops) that is two commits. If the first lands and the second throws, the sessions exist but the client counters, the trainer tally and the machine settings do not — and the toast just says "Finalization failed. Check Firestore quotas." (`:733`). There is no resume and no rollback.
*Direction:* write the sessions/logs first with deterministic ids (finding 11), then make the counter update the last, idempotent step derived from what is actually in Firestore.

**15. Images are uploaded twice, and each page is a separate round trip. — Medium**
`LegacyChartImporter.tsx:150-160`: the loop POSTs each page on its own to `/api/gemini/processChart`, then `:161` POSTs **the whole array again** to `/api/gemini/extractSettings`. A five-page chart sends 5 + 5 = 10 image payloads for 5 images, sequentially, with `withRetry` (`server/gemini.ts:7-37`) able to triple each one on a 429/503. The UI copy says "30-60 seconds" (`:963`); AJ asked for "instantaneous".
*Direction:* one upload, one request, server-side fan-out — or drop OCR for a real export (see the questions).

**16. `sanitizeImportedSessions` invents dates and then renumbers the client's whole history. — High**
`src/services/geminiService.ts:96-178`. When a date is missing it adds **four days to the last good date** (`:117-119`) and stamps the result as real; the first session with no date gets *today* (`lastValidDateTS` is initialised to `new Date().getTime()` at `:100`). Then `:174-176` **renumbers every session `idx + 1`**, discarding the session numbers printed on the chart — the same numbers the client screen quotes ("it has been 51 sessions since their last scan"). Two OCR columns that land on the same inferred day are merged (`:147-170`) and the survivor is flagged `hasConflict` only if a weight or rep differs.
*Direction:* an inferred date should block the commit for that column (the UI already disables Finalize on a *missing* date at `:779` and `:1218`, but `sanitizeImportedSessions` fills it in first, so the guard never fires). Keep the chart's session numbers.

**17. The client dropdown is the schedule roster, not the client list. — Medium**
`LegacyChartImporter.tsx:768` renders `clients.map(...)`, and `clients` comes from `AppContent.tsx:553-564` — the selected client plus `rosterClients` from `useLiveSchedule` (booked yesterday→+8 days, capped at 400). A long-standing client with no booking in that window is simply not in the list, so the only way to import them is to open their profile first. Nothing on screen says so.
*Direction:* either search the `clients` collection from the importer, or drop the picker and make it strictly profile-launched.

**18. The importer's chrome is off-brand and off-vocabulary. — Medium**
"OCR Legacy Pipeline / Multimodal Chart Recognition Engine v3.1" (`:754`, `:757`), "Validation HUD" (`:915`), "Initializing Distributed OCR Engine…" (`:136`), "CONTINUITY VERIFIED" badge (`:1007`), "[ Confirm & Write Full History ]" (`:1242`), plus `bg-slate-950`/raw `#F06C22` hexes throughout — against CLAUDE.md's "use the design tokens… no raw hex" and "plain studio English". `src/neutral-ramp.test.ts:212` already lists this file as a known exception. Tap targets: the per-cell delete is `<Trash2 size={10} />` inside a `p-0.5` button (`:1194-1197`) and only appears on `group-hover/cell` — hover-only affordance, far under 40px, on a screen a leader may well open on the iPad.
*Direction:* if this screen survives at all, it is a desk tool — say so, and move it behind the Admins dashboard where desk-sized controls are acceptable.

### B. The server

**19. The two Gemini routes have no authentication, no rate limit, and a 50 MB body. — Critical**
`server.ts:87` and `server.ts:103` are declared before the `app.use("/api/mindbody", …)` gate at `server.ts:187`. `IMAGE_UPLOAD_PATHS` (`server.ts:51-54`) gives exactly those two paths a 50 MB JSON limit. Grep for rate limiting across `server.ts`, `server/*.ts` and `package.json`: **nothing**. So an unauthenticated POST spends AJ's Gemini quota, and a handful of concurrent 50 MB bodies exhausts a 2 GB single-process instance (the comment at `server.ts:47-50` shows this was already learned once).
*Direction:* mount `requireStaff()` on `/api/gemini` too, and add a small per-uid concurrency cap. Nothing about the importer needs anonymous access.

**20. `/api/log-error` is an unauthenticated write into the platform log. — Medium**
`server.ts:114-133` `console.log("CLIENT ERROR:", req.body)` for any body up to 1 MB, from anyone. The comment above it records that a single session once produced 3,664 of these.
*Direction:* require a sign-in, or at minimum cap the body and sample.

**21. `/api/trigger-master-sync` is a live, unauthenticated route that does nothing and returns success. — Low**
`server.ts:161-175` reads `trainerId` / `hardReset`, does no work ("Feature deprecated on server-side"), and answers `{ success: true, message: "… Sync triggered successfully" }`. A route that lies about having done something is worse than a 404.
*Direction:* delete it and its caller.

**22. Upstream error text is returned verbatim to the caller. — Medium**
`server.ts:99` and `:110` return `e.message`, and `server/gemini.ts:26` builds that message as `Gemini API Error during ${operationName}: ${msg}` from the raw SDK error. `server.ts:960` returns `MindBody API Response: ${pull.error}`. By contrast `server/auth.ts:99-102` is deliberate about this — it returns only a status and Firestore's own one-line reason, never a document.
*Direction:* log the upstream text, return a short stable sentence and a correlation id.

**23. 50 MB of base64 lands in the Node heap on a single-process 2 GB instance. — Medium**
`server.ts:55` `express.json({ limit: "50mb" })` parses the whole body into a JS string, and `server/gemini.ts:202-204` copies it into `inlineData`. `render.yaml:110` is `1c-2g` with `WEB_CONCURRENCY=1`. Two trainers importing at once is a plausible OOM.
*Direction:* upload images to storage and pass references, or stream to the model.

### C. Firestore rules

**24. `clientMachineSettings` delete is open to any signed-in account. — Critical**
`firestore.rules:1338`: `allow delete: if isSuperAdmin() || isFranchiseOwner() || isAuthenticated();`. The trailing `|| isAuthenticated()` makes the first two clauses decorative — **anyone with a Google account who has signed in, including someone still sitting in `AccessRequestView` with no trainer profile, can delete any client's machine settings.** The read rule above it is also bare `isAuthenticated()`, so they can enumerate first.
*Direction:* delete the `|| isAuthenticated()` clause and scope create/update/delete to a trainer who can read that client — **needs AJ's OK** (rules change).

**25. `machines/{id}/settingHistory` is read-write to any signed-in account. — High**
`firestore.rules:1358-1359`: `allow read, write: if isAuthenticated();`. That subcollection is the machine's **audit trail** — `src/features/equipment/mutations.ts:122` and `src/features/machine-fit/setup-save.ts:87` write who changed what setting and why, and `src/features/equipment/ChangeHistory.tsx:43` shows it. An audit trail anyone can rewrite is not an audit trail. ARCHITECTURE Appendix A already singles this line out.
*Direction:* write restricted to a trainer at a studio that holds the machine, update/delete denied — **needs AJ's OK**.

**26. `access_requests` can be created by an unauthenticated caller. — High**
`firestore.rules:2476-2495`. The Type 1 branch (`:2480-2486`) checks field shapes but never `isAuthenticated()`; only the Type 2 branch does (`:2490`). Both real writers are signed-in (`src/components/AccessRequestView.tsx:90`, reached only after sign-in per ARCHITECTURE §2.1; `src/components/StudioSelectionView.tsx:443`), so the anonymous branch buys nothing and leaves an open write endpoint for anyone who knows the project id.
*Direction:* add `isAuthenticated() &&` to the first branch — **needs AJ's OK**.

**27. A Franchise Owner is still a company-wide role. — High (already known, §2.8 #3 / §1.8 — verified still true)**
`firestore.rules:109-111`: `isFranchiseOwner()` takes no studio parameter. It is used unscoped in 26 places, including `sessionIsReadable` (`:317`: `roleIsSuper(r) || roleIsFranchise(r) || …`) — so a franchise owner reads **every session of every client at every studio in the company**, and `clients` read (`:1230`) is the same. ARCHITECTURE §1.8 records the fix as decided (cache `networkIds` / `ownedStudioIds` on the trainer document) and moved to Gate B *before beta*, because beta includes franchisees. It has not been built. `trainerLeads` (`firestore.rules:236-254`) shows the cheap pattern already exists.
*Direction:* the decided design, applied to `roleIsFranchise` — **needs AJ's OK**, and it is the one security item §1.8 says must land before beta.

**28. The shape validators for sessions and logs are close to no-ops. — High**
`firestore.rules:595-599` `isValidSession` checks only that `sessionNumber` is a number *if present*, `date` a string *if present*, `trainerInitials` a string *if present* — it does not require `clientId`, `hostedAtStudioId` or `status`. `firestore.rules:602-606` `isValidLog` requires only that `sessionId` and `machineId` are strings — not `clientId`, not `weight`, not `outcome`. Meanwhile the newer rules (`inbodyScanValid`, `sharedNoteValid`, `machineFitValid`, `renewalTouchValid`) are thorough. The gap matters because the importer writes straight into these two collections from the browser.
*Direction:* bring the two oldest validators up to the standard the newer ones set — **needs AJ's OK**.

**29. Five helpers are dead, and two of them are dead because the collection they validate has no shape check. — Medium**
Unused: `getTrainerByUID` (`:21`), `hasAnyTrainerProfile` (`:49`), `isTrainerOfStudioOrClient` (`:512`), `isValidMachine` (`:589`), `isValidNetwork` (`:612`). `match /machines/{machineId}` (`:1353-1356`) has `allow create, update: if isSuperAdmin()` with no `isValidMachine`, and `match /networks/{networkId}` (`:2459-2463`) has `isSuperAdmin() || isFranchiseOwner()` with no `isValidNetwork`. Somebody wrote the validators and never wired them.
*Direction:* wire or delete, in the same pass.

**30. `allow create: if isAuthenticated()` with no shape check on four collections. — Medium**
`auditLogs` (`:1569`), `bug_reports` (`:2514`), `notificationQueue` (`:2563`), `mindbodyLimbo` (`:2614`). `notificationQueue` is the one that matters most: the rules comment calls it "for email/SMS triggers", and any signed-in account can inject a document into the queue the parked worker would drain.
*Direction:* shape checks, and for `notificationQueue` specifically, `allow create: if false` until a provider exists — **needs AJ's OK**.

**31. `sessions/{sessionId}/logs/{logId}` is a rules block for a collection nothing writes. — Low**
`firestore.rules:1516` guards a subcollection; every writer in the codebase uses the top-level `exerciseLogs`. Two homes for one idea, one of them empty.

**32. `sessionIsReadable` does `exists()` + `get()` on `clients/{cid}` per document, and the 10-access cap is only safe by luck. — Medium**
`firestore.rules:304-315` (`sessionClientIsReadable`) does two document accesses per distinct client. The comment at `:1473-1475` reasons correctly about a `clientId`-pinned query (two reads total). What it does not consider is the un-pinned case: any list of sessions spanning more than ~4 distinct clients that the caller cannot short-circuit on (`trainerWorksAt` / `trainerLeads` both false — i.e. a leader reading another studio's sessions) blows the 10-access budget and the whole query fails, not just one document.
*Direction:* a `studioIds`-style denormalised field on the session would remove the client read entirely — **needs AJ's OK**.

**33. A hard-coded owner e-mail address inside the rules. — Medium**
`firestore.rules:559` exempts one specific address from the self-created-role ceiling. It mirrors a hard-coded bootstrap in `src/hooks/useAuthInitialization.ts`, and the comment is honest about why. It is still a credential-shaped constant in a file that ships to Google, and it means "who can bootstrap an admin" cannot be changed without a rules deploy.
*Direction:* move the bootstrap to a `config/bootstrap` document an admin can edit — **needs AJ's OK**.

**34. `firestore.staging.rules` is a 571-line fork that denies 32 collections and is never tested. — High**
`firestore.staging.rules` (571 lines) vs `firestore.rules` (2,626). Its own header admits "this file has otherwise diverged from the live rules and is **NOT** a copy". Because it keeps the global `match /{document=**} { allow read, write: if false; }` safety net, every collection it does not name is **denied**: `journalEntries`, `noteShares`, `teamJobs`, `taskInstances`, `machineFit`, `machineTrends`, `renewals`, `notifications`, `comments`, `wiki`, `playbook`, `mindbodyLimbo`, `watch`, `roster`, … 32 in all. `tests/firestore.rules.test.ts:33` reads `firestore.rules` only. So the staging project cannot exercise most of the app, and nothing tells you — writes just fail. `.firebaserc` lists three projects (`prod`, `staging`, `scratch`) and `firebase.staging.json` points the staging deploy at this file.
*Direction:* make staging the *same* file plus an overlay (a `STAGING` boolean at the top gating the two extra locks), so it cannot drift.

### D. Cloud Functions

**35. The nightly facility job reads three entire collections to write a document nobody reads. — Critical**
`functions/src/index.ts:45-47`: `db.collection("clients").get()`, `db.collection("sessions").get()`, `db.collection("exerciseLogs").get()` — no filter, no window, every night at 02:00 ET. It then does `sessions.filter(...)` **inside** a `clients.reduce(...)` (`:71`) — O(clients × sessions) — and `logs.filter(...)` inside `machineIds.map(...)` (`:88`) — O(machines × logs). The result is written to `analytics/facilitySummary` (`:138`). **Grep for `facilitySummary` across `src/`, `server/`, `functions/`: one hit, the write itself.** Nothing reads it. That is a direct breach of CLAUDE.md's "Every number has a reader… a write with no reader is a bug to fix", and it is the exact cost pattern the cost round removed from the leaderboard job (`server/machine-trends-job.ts:6-16` says so explicitly) — left running in Cloud Functions.
*Direction:* delete the function, or give it the same fixed-window treatment the machine-trends job got — **needs AJ's OK**.

**36. That same job fabricates a number. — High**
`functions/src/index.ts:120-127`: `averageSessionsToTrend: 12, averageWeeksToTrend: 4` with the comment "Baseline structural stat", written into the analytics document as if measured. §1.11 invariant 6 and CLAUDE.md both forbid this outright.
*Direction:* delete it with the job.

**37. `setCustomUserClaimsV2` grants Admin to any caller if `trainers` is ever empty — and nothing calls it. — High**
`functions/src/index.ts:241-247`: *"Absolute emergency initialization: If 'trainers' collection is empty, allow initial setup"* → `isAuthorized = true` for any signed-in caller. ARCHITECTURE §2.8 #7 records that a full database wipe runs from the browser on one confirmation (`AppContent.executeAppCleanse`). Wipe, then call this, and you are a System Administrator. It also bootstraps a trainer document with `pin: data.pin || ""` (`:275`) — a credential field that `isValidTrainer` (`firestore.rules:570`) explicitly refuses, bypassed because the Admin SDK ignores rules. And **no code in `src/` calls it**; `syncTrainerClaims` (`functions/src/claims.ts`) is the live mechanism.
*Direction:* delete the function — **needs AJ's OK**.

**38. Two live triggers write into a queue with no consumer, and one pays a document read on every booking. — Medium**
`onBookingReminderWrite` (`functions/src/index.ts:298-332`) reads `studios/{studioId}` on **every** `schedules` document created — and the Mindbody sync creates those in bulk — to check `notificationSettings.bookingRemindersEnabled`. `bookingRemindersEnabled` and `dailySummaryEnabled` appear **only** in `src/types.ts:1774-1775`; no screen ever sets them, so the answer is always `undefined` and the function always early-returns after paying for the read. `render.yaml:292` documents the queue accumulation as "harmless… the status quo". It is harmless *today*; it is also an unbounded collection and a per-booking read for nothing.
*Direction:* delete both producers, or gate them on a studio flag something can actually set — **needs AJ's OK**.

**39. VERIFIED — ARCHITECTURE §5.7 #1 is moot: the trainer rollups never touch exercise logs. — (finding: the doc is stale, not the code)**
§5.7 #1 says the `functions/src` trainer rollups "need the same performed-only rule before Gate B" **if** they aggregate exercise logs. They do not. `functions/src/trainerRollups.ts` counts **sessions** with `status === "Completed"` — `planRollup` (`:72-99`), `applyCount` (`:142-171`), and `recalcTrainerWindows` (`:298-330`, which filters `data.status !== "Completed"` in memory over a 90-day `createdAt` range). There is no `exerciseLogs` read anywhere in the file. The performed-only rule has nothing to apply to. **§5.7 #1 can be closed.**

**40. Imports manufacture a `trainers/legacy-trainer` document. — High**
`LegacyChartImporter.tsx:188` and `:400` set `trainerId: 'legacy-trainer'` whenever the column's initials matched no trainer. `onSessionRollup` then runs `resolveCoachTrainerId` (`functions/src/trainerRollups.ts:113-116`), whose first line (`:119`) takes `session.trainerId` verbatim because it is a non-empty string, and `applyCount` (`:158-169`) does `tx.set(trainers/legacy-trainer, {rollups: {…}}, {merge: true})` — **creating a trainer document that no rule would have allowed and that every screen streaming `trainers` will now see.** `recalcTrainerWindows` then writes windows onto it nightly (`:320-330`). Note `src/lib/client-rollups.ts:44` is careful to exclude `"legacy-trainer"` from the client-side tally; the Cloud Function is not.
*Direction:* leave `trainerId` unset when initials do not resolve, and let `resolveCoachTrainerId`'s "refuse to guess" path do its job — **needs AJ's OK** for the function side.

**41. 172 passing Cloud Functions tests never run. — High**
`functions/src/**` holds 14 test files / 172 tests (plus 1 skipped), including the whole Mindbody suite (`functions/src/mindbody/index.test.ts` alone is 1,178 lines). `package.json:"test": "vitest run src"` and CI runs only `npm test` (`.github/workflows/ci.yml:116`) — `functions/` is excluded. `tsconfig.json:"exclude": ["functions", …]` also keeps them out of the typecheck, and `functions/tsconfig.json:"exclude": ["src/**/*.test.ts"]` keeps them out of the functions build. **I ran them: `npx vitest run functions` → 14 files, 172 passed, 4.6 seconds.** ARCHITECTURE §5.6 lists "the Cloud Functions tests in CI" as a "later" item; it costs five seconds.
*Direction:* change `"test"` to `vitest run src functions` (no rules change, no functions change — this one needs no OK).

**42. The webhook's idempotency records carry an `expiresAt` that nothing enforces. — Low**
`functions/src/mindbody/idempotency.ts:41-47` writes `expiresAt` 30 days out. Firestore TTL is a per-field policy set outside the repo; nothing in `firebase.json`, `firestore.indexes.json` or the docs mentions one. Until it is set, `mindbodyEventLog` grows forever.
*Direction:* set the TTL policy and note it in the deploy runbook.

### E. Cron, build and deploy

**43. No lease on either cron job. — Low**
`server/cron-runtime.ts` has no lock. Both jobs are idempotent by construction (the renewals job writes only where the snapshot changed; machine-trends rebuilds from a fixed window), so an overlap is survivable — but a hung run plus a manual `scripts/run-renewals.ts --commit` would interleave writes to the same `clients/{id}.renewal`.

**44. Machine-trends deletes stale documents before rewriting `_summary`. — Low**
`server/machine-trends-job.ts:277-282`: deletes are queued before the `_summary` write, and `commitInBatches` commits them in order (`server/machine-trends-job.ts:133-148`), so a reader between the two commits sees `_summary` naming a machine document that is already gone. Transient, and the screen reads `_summary` first.

**45. The CI typecheck baseline disagrees with CLAUDE.md. — Low**
`.github/typecheck-baseline.txt` = **11**; CLAUDE.md's table says **10**; I measured **10** in this clone. CI is one error more lenient than the documented gate, which is exactly one new type error that can land unnoticed. The comment block in `.github/workflows/ci.yml:73-94` still talks about 18/19.

**46. The Cloud Functions are not typechecked by CI at all. — Medium**
`tsconfig.json` excludes `functions`, and the CI job never runs `npm --prefix functions run build`. `functions/tsconfig.json` has `strict: true` and `noUnusedLocals: true` — stricter than the root — so a break there is only discovered at `firebase deploy` time, by the predeploy hook in `firebase.json`.
*Direction:* add a `functions` build step to CI (touches no functions code).

**47. `scripts/migrate.ts` cannot run, targets the wrong database, and migrates a deleted feature. — Medium**
`scripts/migrate.ts:7` does `require('../firebase-applet-config.json')` and `:14` passes it to `admin.credential.cert(...)`. That file is the **browser** config (`projectId`, `apiKey`, `appId` …); `cert()` needs `private_key`/`client_email`, so it throws on startup. `:18` `admin.firestore()` with no database id would target `(default)` — which CLAUDE.md says is not the live database, the exact trap `render.yaml:210` warns about. And the migration it performs writes `trainers/{id}/secrets/account.pin` — trainer PINs were removed in Sep 2026 (`firestore.rules:566-570`).
*Direction:* delete it. Everything else in `scripts/` uses `scripts/lib/admin.ts` properly and is dry-run-by-default.

**48. The `scripts/` roster importer that the UI promises does not exist. — High**
`src/features/admin/data/AdminDataReportsTab.tsx:19-23` tells the admin: "The real migration — a whole roster at once, a dry run first — is the `scripts/` importer on the roadmap, and until it exists this screen says so rather than offering a button that makes a mess." `ls scripts/*.ts`: 29 files, none of them a FileMaker importer (`import-backup.ts` restores a Firestore JSON dump). So the *careful* migration path was removed and replaced with a promise, while the *careless* one (the OCR importer, findings 1–18) is still one tap from a client's profile.

### F. The clean-clone break and the import graph

**49. 45 of 223 test files boot a Firebase app because pure logic lives inside Firestore modules. — High**
The chain the brief asked for, exact:
`src/features/briefing/heads-up.test.ts:2` → `import { HEADS_UP_WINDOW_DAYS, isHeadsUpLive } from "../../hooks/useClientJournal"` → `src/hooks/useClientJournal.ts:50` → `import { db } from "../firebase"` → `src/firebase.ts:4` → `import firebaseConfig from '../firebase-applet-config.json'`.
`isHeadsUpLive` (`src/hooks/useClientJournal.ts:110-128`) is an 18-line pure predicate whose own doc-comment says "Pure; `src/features/briefing/heads-up.test.ts` pins it" — and it is exported from a **1,153-line** module that, at import time, runs `initializeApp`, `initializeFirestore` with persistent local cache, and `getAuth` (`src/firebase.ts:10-41`).
I walked the whole import graph: **45 of 223 test files under `src/` transitively reach `src/firebase.ts`**, and at least thirteen of them are pure-logic tests with no business booting Firebase — `features/admin/overview/moments.test.ts`, `features/clinical-review/pulse-trend.test.ts`, `features/relay/board/{calendar-items,capture,kudos,mine,next-up,pulse}.test.ts`, `features/relay/jobs/jobs.test.ts`, `features/relay/team/accountability.test.ts`, `features/studio-tasks/{categories,hub}.test.ts`, `features/briefing/heads-up.test.ts`.
That is why a clean clone breaks: `firebase-applet-config.json` is gitignored (`.gitignore:15`) and imported as a **module** by `src/firebase.ts:4` and `src/features/admin/mindbody/AdminMindbodyTab.tsx:67`, so without it `tsc` reports 12 instead of 10 (two TS2307s — the CI workflow says so at `.github/workflows/ci.yml:58-70`) and every one of those 45 test files fails to resolve. The single-file fix (`node scripts/setup-firebase-config.cjs`) hides an architectural fact: **the project has no boundary between pure rules and the database client.**
*Direction:* move the pure exports out of the hooks (`heads-up.ts` beside `useClientJournal.ts`, and so on for the twelve others); make `src/firebase.ts` read `import.meta.env` rather than importing a generated JSON file, so a clone typechecks with no generated artefact. `AdminMindbodyTab.tsx:212` only needs `firebaseConfig.projectId` to build the webhook URL string.

### G. Secrets hygiene

**50. No key, password or credential value is committed. — (clean, with two notes)**
I checked every tracked `.json`/`.yaml`/`.env*` and the `scripts/`. **Paths and field names only:**
- `.env.example` — field names `GEMINI_API_KEY`, `SYNC_SECRET`, `MINDBODY_API_KEY`, `MINDBODY_WEBHOOK_SECRET`, `MINDBODY_WEBHOOK_URL`, `APP_URL`, `VITE_MICROSOFT_TENANT_ID`. No values.
- `firebase-applet-config.example.json` — fields `apiKey`, `appId`, `messagingSenderId` etc., all placeholders.
- `render.yaml` — every secret is `sync: false` (`render.yaml:143-165`, `:259-267`), values never in the file; the header at `:78` states the rule.
- `firebase-applet-config.json` is gitignored and `git ls-files` confirms only the `.example` is tracked.
- `scripts/setup-firebase-config.cjs:35,88` explicitly refuses to print `apiKey`/`appId`/`messagingSenderId` values.
Two things that are not secrets but are tenant identifiers in the clear: **Mindbody site ids** hard-coded at `scripts/mindbody/register-webhook.js:66`, `scripts/mindbody/deactivate-webhook.js:37`, `scripts/diagnose-mindbody-locations.ts:50`, and named in `CLAUDE.md:47`; and the Firebase **project ids** in `.firebaserc`. Neither is a credential, but both narrow an attacker's search, and the unauthenticated write surfaces above (findings 19, 20, 24, 26, 30) are reachable with nothing more than a project id.
*(The git history in this clone is 554 commits and I found no `.env`, `service-account.json` or literal credential ever added. If credentials were exposed before this clone's root commit, that is outside what I can see — it belongs in the questions.)*

---

## 3. Metrics

| Measure | Value |
| --- | --- |
| Backend LOC (`server.ts` + `server/` + `functions/src/**` + `scripts/*.ts`) | 16,143 |
| `server.ts` / `server/worker.ts` / `server/auth.ts` / `server/gemini.ts` | 1,097 / 446 / 321 / 313 |
| `/api/*` routes | 13 (2 Gemini **unauthenticated**, 9 Mindbody staff-gated, 2 other unauthenticated) |
| Rate-limiting middleware anywhere | **0** |
| JSON body limits | 50 MB on 2 Gemini paths, 1 MB elsewhere (`server.ts:51-62`) |
| `firestore.rules` | **2,626 lines**, 134 KB, 97 helpers (**5 unused**), 79 `match` blocks |
| `allow read: if isAuthenticated()` lines | **58** (was 34 at ARCHITECTURE Appendix A, Sep 12) |
| `if isAuthenticated()` occurrences | 140 · `get(` 92 · `exists(` 9 |
| `firestore.staging.rules` | 571 lines, 38 `match` blocks, **32 collections missing** vs prod, **0 tests** |
| Rules tests | 118 `it()` in `tests/firestore.rules.test.ts` (2,364 lines), advisory-only in CI (`continue-on-error: true`) |
| Composite indexes | 43 (`sessions` 9, `clients` 5, `exerciseLogs` 4, `journalEntries` 4) |
| Cloud Functions exported | 11 triggers (1 HTTP, 2 callable, 2 document, 3 scheduled, 3 re-exported) |
| Cloud Functions tests | 14 files / **172 passing** in 4.6 s — **never run by `npm test` or CI** |
| Cron services deployed | 2 (`0 7 * * 0` machine-trends, `30 6 * * *` renewals); 3 parked |
| `LegacyChartImporter.tsx` | 1,270 lines, 65 KB, 12 `useState`, 9 `any`, one component |
| Gemini calls per 5-page (60-session) import | **6** (5 × processChart + 1 × extractSettings), up to 18 with `withRetry`; images uploaded **twice** |
| Firestore writes per 60-session import (≈7 machines/session) | ≈500 (60 sessions + ~420 logs + 1 client + ~19 settings) in 2 batches; **+60 Cloud Function transactions** from `onSessionRollup` |
| Re-import of the same chart | duplicates everything; 5 counters compound; **no dry run, no undo, no dedupe key** |
| `any` counts | `server.ts` 28 · `server/` 14 · `functions/src` 35 |
| Test files under `src/` reaching `src/firebase.ts` | **45 of 223** (13+ of them pure-logic tests) |
| `npx tsc --noEmit` | **10** (CLAUDE.md 10, `.github/typecheck-baseline.txt` **11**) |

---

## 4. Direct questions for AJ

**The import mechanism**
1. FileMaker can export CSV or XML. Why are we photographing a screen and paying a vision model to guess at handwriting, when a real export would give exact machine names, exact settings labels, exact reps and exact session numbers — and could be diffed and re-run safely? What specifically stops you getting an export out of Claris?
2. If the answer is "we only have screenshots", then: would you accept a two-pass design where pass one extracts **only** column 2 (the settings) and the **last non-empty weight** per machine row — one call, one page, under five seconds — and full history is a separate, slower job? That is the "lightning-fast, bulletproof and instantaneous" ask, and it needs finding 1 fixed (the schema literally cannot return a weight today).
3. Does this importer belong in the browser at all? It writes ~500 documents from an iPad over a tab that can be closed mid-batch, with no undo. The screen you already ship (`AdminDataReportsTab`) tells admins the real importer will be a `scripts/` job with a dry run. Should the OCR path be demoted to "read the chart, show me the numbers, let me copy them" and the writing moved to a script?
4. Two machines that collapse to one name (Leg Press Hoist + Leg Press Imag. in the same session) currently lose a set, silently. Is a Hoist Leg Press and an Imagine Leg Press the **same** machine for history purposes, or two? The answer decides whether the importer needs the studio's own roster names or the corporate catalog.

**Counts and trust**
5. `recordImportedSessions` exists, is documented as "THE IMPORTER'S CONTRACT", and has never been called. Every import since it was written has double-counted. Do you want that fixed forward only, or do you also want a script that finds already-imported clients and repairs `priorHistory.importedCount`?
6. Should a re-import of the same chart be an error, a no-op, or an update? Right now it is five compounding counters. Deterministic document ids make it a no-op for one line of code — is that the behaviour you want?

**Security before beta**
7. §1.8 says the franchise-owner partition is a **Gate B** item — before beta, because beta includes franchisees. It is not built, and a franchise owner currently reads every session and every client in the company (`firestore.rules:317`, `:1230`). Is beta still going ahead with franchisees in it before that lands?
8. `firestore.rules:1338` lets **any signed-in Google account** delete any client's machine settings, and `:1358` lets them rewrite a machine's audit trail. Both look like typos rather than decisions. Can I have the OK to fix those two lines?
9. The two Gemini endpoints are open to the internet with a 50 MB body and no rate limit. Is there a reason they were left outside `requireStaff`, or was it just that they predate `server/auth.ts`?

**Rules and tests**
10. `firestore.rules` is 2,626 lines with 97 helpers and a 118-test suite that CI is allowed to fail. Is that file still reviewable by you? If not, do you want it split per collection group and assembled at deploy, or do you want to accept it as generated-and-tested and raise the rules job to a blocking check?
11. `firestore.staging.rules` denies 32 of the collections the app uses and is never tested. Is the staging project actually used for anything? If yes it cannot work; if no, why is it in the deploy story?
12. 172 Cloud Functions tests run green in 4.6 seconds and nothing runs them. Can I change `"test"` to `vitest run src functions` — that touches no functions code, no Mindbody code and no rules.

**Dead weight in Cloud Functions**
13. `calculateFacilityAnalyticsV2` reads every client, every session and every exercise log, every night, to write `analytics/facilitySummary` — which **no screen reads** — and two of its numbers are hard-coded constants. The cost round already deleted the nightly job that did this on the server. May I delete it?
14. `setCustomUserClaimsV2` is called by nothing and grants Admin to any signed-in caller whenever the `trainers` collection is empty — which the browser's "Wipe Entire Database" button can arrange. Delete, or is something outside this repo calling it?
15. `onBookingReminderWrite` and `sendDailySummary` write into `notificationQueue` forever with no consumer deployed, and the flags that would enable them (`bookingRemindersEnabled`, `dailySummaryEnabled`) exist only in `src/types.ts` — no screen sets them. Given §1.7 says nothing contacts a client or a trainer, is the whole notification pipeline (778 lines of parked worker + crons, plus these two producers) something we are keeping, or something to delete?

**Credentials**
16. The repo itself is clean — no key, password or site credential is committed anywhere in the 554 commits I can see. Separately: were Mindbody credentials ever pushed to this repository before this clone's history begins, and if so have the API key, source password and webhook secret been **rotated**? If they have not, that is the most urgent item in this whole report, and nothing in the code can tell me the answer.
