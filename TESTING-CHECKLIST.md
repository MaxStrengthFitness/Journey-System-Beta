# Journey System — Verification & Cleanup Checklist

_Sep 5, 2026. Companion to ROADMAP.md. This is the thing you **do**; the roadmap is the thing you read._

---

## How to use this

Every item reads the same way:

> - [ ] **What to do** — what should happen. *If it fails:* what that actually means and where to look.

The "if it fails" half matters more than the tick box. Most of these were written after reading the code, so several of them are **predictions** — places where the audit says something is probably already broken. Confirming a prediction is a good outcome: it means you found it in ten seconds instead of a trainer finding it mid-session.

**Order is not decoration.** Gate 0 makes the rest meaningful. Round 1 is the scroll-trap sweep, first on the tablet, because one of those bugs locks you out of the app entirely and there is no point testing screen six if you cannot reach screen one.

**Keep the Findings log at the bottom open as you go.** One line and a screenshot per finding. That log is what comes back into the roadmap — it is the "what to remove or adjust" list, and it is worth more than the ticks.

**Viewports that matter.** A 13" iPad Pro is **1366×1024** landscape and **1024×1366** portrait. An 11" is **1194×834** / **834×1194**. Remember that **1024 portrait is Tailwind's `lg` breakpoint, not `xl`** — that is the exact trap the client-profile header hit on Sep 5. Test both orientations and both themes; dark mode is not cosmetic here, several fixes this month were dark-mode-only.

---

## Gate 0 — At the keyboard, before you pick up the iPad

**~30 minutes. Do not skip.** Until this is done you would be testing an app whose writes fail, and you would spend the morning diagnosing permission errors instead of layout.

- [ ] **`firebase deploy --only firestore:rules`** — verified additive (115 lines added, 0 removed), so nothing can be taken away. *If it fails:* read the error before retrying; a syntax error in rules fails safe and leaves the old ones live.
- [ ] **Prove the deploy worked, four ways** — sign in, then: write a **journal entry** on a client, set a **focus intent**, save a **studio machine note** in the Catalog, and tick a **studio task**. All four must save with no console error. *If any fails:* that collection's rule did not land — check the Firebase console Rules tab against `firestore.rules`.
- [ ] **`AppContent.tsx:1015` — delete the `"notes"` line** from the wipe collection list. *Why:* no `notes` rule exists, so the wipe throws part-way and leaves the database half-erased.
- [ ] **Add `@types/react` + `@types/react-dom`, then `npx tsc --noEmit`** and write the number down. *If it reports thousands:* that is normal and it is the honest baseline — until now TypeScript was checking none of your UI code.
- [ ] **Add `"test": "vitest run"` to `package.json` and run it once.** *If suites fail:* note which. Twenty-five suites already exist; whatever they say is your real starting position.
- [ ] **Copy the live rules back into `firestore.staging.rules`** so the repo is the source of truth again.
- [ ] **Delete `_to_delete/` and `.env.bak`.** 65 MB and a copy of every live secret.
- [ ] **Have the console open on the iPad session.** Safari → Settings → Advanced → Web Inspector, then attach from a Mac. *If you cannot:* at minimum watch for the app's own toasts, but know you are testing half-blind — and note that quota errors are currently captured and never displayed at all.

---

## Round 1 — The scroll-trap sweep · *first thing on the tablet*

`src/index.css:297` sets `html, body { height: 100%; overflow: hidden }`. Any screen that renders **outside** the app shell as a `min-h-screen` block with no scroller of its own has content below the fold that is physically unreachable. The audit found **five** of them. Test in **landscape**, where vertical space is shortest.

- [ ] **The sign-in screen** at 1366×1024 landscape, and again with the on-screen keyboard up. Every button reachable. *If it fails:* this is the worst one on the list — a trainer cannot get into the app at all. `AppContent.tsx:1325`, root has `overflow-hidden` at `:1327` and zero scrollers beneath it.
- [ ] **Studio selector — scroll to Strongsville.** Every location reachable, all 40. *If it fails:* known, root cause found, `StudioSelectionView.tsx:159`. Note *how far* you get before it dies — that tells you how urgent the redesign is versus the one-line fix.
- [ ] **Access Request screen** (sign in as a user with no trainer profile). *If it fails:* `AccessRequestView.tsx:113`, same defect, and this is a first-run experience.
- [ ] **Consultation wizard** — every step, landscape, with the keyboard up on a text step. *If it fails:* `ConsultationWizard.tsx:225` — this strands a trainer **mid-consultation with a client sitting there**.
- [ ] **Consultation setup wizard** from inside the tracker. *If it fails:* `ConsultationSetupWizard.tsx:56`, same.
- [ ] **While you are here:** on the sign-in screen and Access Request, check the avatar image renders. *Predicted:* `AccessRequestView.tsx:176` passes `src=""` when there is no photo, which makes the browser re-request the page as an image.

**All five share one fix** (`h-full overflow-y-auto` on the view's own root). Verify them together after the fix, not one at a time.

---

## Round 2 — Five-minute smoke test

If any of these is wrong, stop and fix it before continuing — everything downstream depends on them.

- [ ] Sign in, land on the Hub, see today's real schedule with real client names.
- [ ] No block reads "Not synced" that should be linked. *If some do:* run `scripts/diagnose-schedule-links.ts` before theorising — it tells you whether it is a missing clientId, a missing document, or a UI problem.
- [ ] Open a client profile. All seven tabs render.
- [ ] Start a session, log one set, finish it. The set is still there on reopen.
- [ ] Switch to dark mode. Nothing becomes unreadable.
- [ ] Rotate the tablet on each of those. Nothing overlaps or clips.

---

## Round 3 — Module walkthrough

### Client profile · *branch `client-profile-redesign`*

- [ ] **Header at 1366 landscape with a long client name AND a long studio name.** Both truncate with an ellipsis, neither clips a glyph. *Watch:* the italic studio face overhangs its advance width — that was the Sep 5 fix, confirm it held.
- [ ] **Header at 1024 portrait.** It must be the *two-row* layout, not the one-band layout — the switch is at `xl`, and 1024 is `lg`. *If it is one band:* the breakpoint regressed.
- [ ] **A 21-machine client on the Journey tab**, with a settings menu open. Every machine and 10–14 sessions fit with no dead space.
- [ ] **Analytics column:** tap the header to cycle First → Lowest → Highest → Most reps → Fewest reps. Then tap a value and confirm it jumps.
- [ ] **Routines tab with Routine B off**, and again with nothing chosen for today. No "G 0" chip on a machine with no setting.
- [ ] **Equipment tab during the backfill** — the "from loaded sessions" label must **disappear on its own** after the first open, without a refresh.
- [ ] **Generate a 12-month Clinical Report on a real 100-session client. Time it.** Then read every insight card and ask whether a clinician would nod at it. *This is the highest-value item on the page* — the numbers are unit-tested, the judgement is not.
- [ ] **Journal and History in dark mode.** Neither is harness-verifiable; both subscribe to Firestore, so this is the first real look.
- [ ] **Start Session when one is already in progress.** Take Over / View / Discard all behave.
- [ ] **Predicted problem — try to edit a journal entry you just wrote.** *Expected:* you cannot. The edit mutations exist (`useClientJournal.ts:180,357`) with no UI calling them, so entries are append-only. A mistyped clinical note is permanent. Decide if that is acceptable.
- [ ] **Predicted problem — save something slow and watch the button.** Four `isSaving*` flags are set and never rendered, so a slow save looks like a dead button and invites a double-tap.

### Journey grid & live session · *branches `journey-grid`, `session-density-round4`*

- [ ] **Portrait: 8 history columns and 8 machines with no vertical scroll.** That was the measured result of the Now-bar round. *If you get fewer:* the 8-machine rule broke, and it is the whole point of that round.
- [ ] **A full session end to end** — weight, reps, quality on several machines; a Torso Rotation left/right set; **Log-as-TSC** from the stopwatch; **Add-to-session** on a machine not in today's routine; a note from the Notes button. Finish the session.
- [ ] **Then check the Journal tab** — the in-session note is there with `origin: in_session`. *If not:* the `journalEntries` rule did not deploy (back to Gate 0).
- [ ] **The Older rail stays pinned** behind the machine column at every scroll offset.
- [ ] **The inroad glyph** — unbroken, snapped, and absent all read differently **in greyscale** (screenshot it and desaturate). Colour is not the carrier by design.
- [ ] **The Now bar in portrait** — three rows, Next full-width, timer legible at arm's length on a rack.
- [ ] **The habit change, on the floor, with a real client:** entry has left the grid and lives in the Now bar. *This is a judgement call, not a bug hunt* — it is flagged in the roadmap as "not yet judged in-studio". Run one real session before assuming it is right.
- [ ] **Predicted problem — edit the routine mid-session.** Reorder machines, then quick-add one. *Expected:* the order snaps back, and the quick-add is wiped. Two known causes, one architectural. Confirm the symptom so the fix can be verified against it later.

### Machine catalog · *branch `catalog-redesign`*

- [ ] **The acceptance test:** type a studio note at **Solon**, save, sign in at a **second studio**, confirm it is **not there**. *If it is:* multi-tenant leak — the exact bug phase 1 fixed.
- [ ] **Save a note with the network off.** It must **report failure**, not say "Stored Successfully". *If it claims success:* that is the four-honest-states fix regressed.
- [ ] **Hip Abduction lands on posterior with glutes lit** — reached three ways: via the rail, via the sheet, and by tapping the figure.
- [ ] **Scroll a long machine (Leg Press):** no inner scrollbar, no dead space, last line clears the nav.
- [ ] **Sticky bar pinning in portrait** — the figure is full size at rest and pins to the top when it scrolls away.
- [ ] **VoiceOver through the picker sheet.**
- [ ] **A long studio name in the header at every breakpoint.**
- [ ] **Predicted problem — turn the Wi-Fi off and open the catalog.** *Expected:* every machine thumbnail goes blank. All of them are Unsplash hotlinks and the `onError` fallback is *another* remote URL. You already ship six correct local photos that never render.
- [ ] **Is the stray `leg_extension` document still in `machines/`?** The console names it on load. Delete it at source.

### Studio To-Do · *branch `studio-tasks`*

- [ ] Author a **daily all-machines cleaning task**; check off three; use **Mark all**.
- [ ] **Flag one machine with a note** — then confirm it appears in **three places** in the Catalog: the picker badge, the line under the clinical note, and the auto-expanded Upkeep section.
- [ ] An **AM + PM template** produces **two separate cards**, not one.
- [ ] A **weekly task on a day it is not due** shows nothing at all.
- [ ] **Sign in at a second studio — none of it is there.**
- [ ] **Two iPads, same task, same second.** Both tick it. *Expected:* clean, because instance ids are derived. This is the one place concurrency was designed for — confirm it.

### Calendar · *branch `calendar-redesign`*

- [ ] **Month with a heavy Thursday** — row heights hold, no trainer names wrapping.
- [ ] **Week's delta on a week with no prior history loaded** — must read "No prior week loaded", **not −100%**.
- [ ] **The 7-day capacity heatmap in dark mode.**
- [ ] **Day swimlanes in portrait** — they scroll horizontally; expand a lane.
- [ ] **Nav arrows stay put** stepping Aug → Sep → Oct. Tapping the label jumps to today.
- [ ] **A trainer's colour is the same in Month, Week and Day** — it is hashed from the trainer id now, not positional.
- [ ] Bookings whose trainer did not resolve show as **"Unassigned"**, not missing.

### Equipment & routines · *branch `equipment-dual-pane`*

- [ ] **First-time machine setup:** ghost placeholders stay ghosted (never saved), and **Gap pre-fills to 0**.
- [ ] **Portrait drill-in and landscape split**, both themes.
- [ ] **A settings change with an audit reason** shows up on the Journal tab.
- [ ] **A maintenance-flagged note reaches the pre-session briefing** as critical.
- [ ] **The weight steppers** at the 2 lb studio increment; the delta reads (+26, +65%).
- [ ] **The in-session setup prompt on a genuinely never-performed machine** — appears once per machine per mount; skipping writes nothing.

### Hub & shell

- [ ] **Day strip swipes**; the pinned "You" column is correct; 60-minute blocks span two rows; the **NOW line is where the clock says**.
- [ ] **Header search from another screen** jumps to the Hub results; clears when you leave.
- [ ] **The two alert signals read differently at a glance** — loud red edge + triangle for a priority note, subtle amber dot for standing clinical history.
- [ ] **The bottom nav is the actual bottom** on every view — no dead padding, nothing rendering behind it.
- [ ] **A client with two bookings in one day.** *Predicted:* both blocks show the live "in session" tint, because the match is by client id not booking. Known, in Next.

### Admin

- [ ] **Tiered sidebar in landscape, horizontal strip in portrait.**
- [ ] **Walk all eleven tabs.** Note which feel real and which feel thin — Bug Reports is 88 lines and read-only by design today, Machines is list-only.
- [ ] **Limbo queue:** the studio picker previews the **converted local time before committing**. Release one and confirm it lands on the schedule.
- [ ] **Mindbody dashboard:** read the DLQ depth. *If it is above zero:* those events are stuck permanently — there is no drain path in the codebase.

---

## Round 4 — Multi-tenancy & roles · *the one that matters at 100 locations*

- [ ] **The read boundary, tested honestly.** Sign in as a plain trainer at one studio. Open the console and read a client document belonging to a **different** studio directly. *Expected:* **it works.** Rules allow `read: if isAuthenticated()` on `clients`, `sessions`, `exerciseLogs`, `journalEntries` and `clinicalIncidents`; the studio filtering is client-side only. This is a known deferral — confirm the scope so it can be dated.
- [ ] **Admin screens with no role gate.** `admin-dashboard`, `franchise-dashboard`, `trainer-hub` and `integrations` are rendered on `currentView === X && authTrainer` with **no role check** — the only gate is the button. Confirm whether a plain trainer can reach them by any other route.
- [ ] **The `?view=trainer-hub` deep link** — gated on Admin/Founder/Overseer, but it also **fabricates a fake Owner trainer** (`id: "owner-temp"`, `pin: "0000"`) when no trainers exist (`AppContent.tsx:931-937`). Test it against an empty studio and decide whether that bootstrap should survive to production.
- [ ] **Per-studio machine possession toggle** — it controls Machine Settings only; it does **not** hide un-owned machines from the Journey grid or Active Session. Confirm, then decide if that is acceptable at beta.
- [ ] **Check the live deployment for the contractor's hardcoded admin email** (fixed in this copy only).

---

## Round 5 — Failure modes · *nobody has tested any of these*

The whole app has been verified against mock data on a good network. This round is the opposite.

- [ ] **Turn the Wi-Fi off mid-session, log two sets, turn it back on.** Do the sets survive? *This is the single most important test on the page.* There is no service worker and no Firestore offline persistence enabled. A gym floor is the worst network in the building and a lost set is a lost client relationship.
- [ ] **Turn the Wi-Fi off and try to save a machine note.** It must say so.
- [ ] **Force a Firestore quota error** (or simulate one) and watch the screen. *Predicted:* nothing at all. `lastQuotaErrorMessage` is captured and never rendered — so on the floor a quota storm looks like the app quietly not working.
- [ ] **Import a broken legacy chart.** *Predicted:* silence. `isImporting`, `importStats` and `legacyError` are all set and never displayed.
- [ ] **Make something throw** on a screen other than Calendar. *Expected:* a white screen — `CalendarView` is the only view with an `ErrorBoundary`, and `ErrorBoundary.tsx` itself is `@ts-nocheck`.
- [ ] **Two iPads, same client, both hit Start Session.** "Active Session Detected" is per-client, not per-device — see what actually happens.
- [ ] **File a bug report through the in-app reporter**, then try to close it as an admin. *Expected:* you cannot — `AdminBugReports` has no `updateDoc`. Every report is written `status: "open"` forever and the reporter never hears back.
- [ ] **"Mindbody is down and a client is standing in front of me."** Walk it through with no sync. *Expected:* there is no path — manual client creation and manual linking were both removed on Aug 30. Decide the answer before beta, not during it.

---

## Round 6 — Performance on real hardware

- [ ] **Cold load on a studio tablet, on studio Wi-Fi. Time it.** `dist/` is 4.2 MB and Firestore initialises at module scope, so its 394 KB chunk downloads and runs **before the first pixel** regardless of the code splitting.
- [ ] **Open a client profile with heavy history.** `ClientProfileView` is a 413 KB chunk on its own.
- [ ] **The 12-month clinical report timing** from Round 3 — write the number down; it is your worst realistic case.
- [ ] **Add the app to the iPad home screen.** *Expected:* a screenshot thumbnail, the title "Max Strength App", and it opens in Safari **with browser chrome**. There is no icon, no manifest and no standalone mode — and that chrome eats roughly the vertical space the entire Now-bar round was spent reclaiming.

---

## Round 7 — Cleanup decisions · *at the keyboard, after the floor walk*

You cannot reach any of these from the UI, so they are decisions rather than tests. Each is **wire it or delete it** — see "Built but never connected" in ROADMAP.md.

- [ ] **`PurchaseView`** — design it or delete it. It is a 20-line stub *and* unreachable.
- [ ] **`ProfilesView`** (861 lines) — anything worth salvaging into the admin Staff & Roles tab before it goes?
- [ ] **`MachineLeaderboardDashboard`** (486) — the `leaderboards` collection it reads is **never written**, and its sort toggle is gone so the strength-gain view is unreachable. Delete, or finish both halves.
- [ ] **`MachinesView`** (226) — superseded by `CatalogView`. Confirm and delete.
- [ ] **`ClientClinicalReviewView`** (1,081) — the Sep 5 note says delete after a week of the new tab. Has it been a week of real use?
- [ ] **The three Gemini endpoints** — `generateExecutionGuide`, `generateClinicalStrategy`, `generateMachineSetupGuide` exist client and server side with no caller. Give them a button or delete both ends.
- [ ] **`useSessionMachines`** — read its doc comment first. It exists to bind a session's machine list to the studio where training physically happens; nothing calls it, so **find out what the tracker binds to today** before deleting.
- [ ] **PIN login** — `comparePin` is never called. Real feature or removed one?
- [ ] **`RetentionDashboardView`** (1,154) — already unmounted with a comment saying so. Delete.

---

## Findings log

Copy a block per finding. This is what goes back into the roadmap.

```
### F-01 · <one-line title>
Screen:        
Orientation:   portrait / landscape
Theme:         light / dark
Viewport:      
What happened: 
Expected:      
Severity:      blocker / bug / polish / decision
Remove or adjust? 
Screenshot:    
```

---

### Quick tally

| Round | Items | Done | Findings |
|---|---|---|---|
| Gate 0 — keyboard | 8 | | |
| 1 — Scroll traps | 6 | | |
| 2 — Smoke test | 6 | | |
| 3 — Modules | 56 | | |
| 4 — Tenancy & roles | 5 | | |
| 5 — Failure modes | 8 | | |
| 6 — Performance | 4 | | |
| 7 — Cleanup decisions | 9 | | |
| **Total** | **102** | | |
