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
- [ ] **On each studio iPad: Settings → Accessibility → Touch → Shake to Undo, OFF.** *Why:* an iPad carried across the floor gets read as a shake and iOS offers to undo the last thing typed — a weight, a note, a client's name. The app refuses the undo itself (`src/lib/shake-undo.ts`, Sep 17 2026) so the data is safe either way, but only this setting stops the alert appearing over a session. *If you cannot find it:* it is under Touch, not under Motion.

- [ ] **Have the console open on the iPad session.** Safari → Settings → Advanced → Web Inspector, then attach from a Mac. *If you cannot:* at minimum watch for the app's own toasts, but know you are testing half-blind — and note that quota errors are currently captured and never displayed at all.

---

## Round 1 — The scroll-trap sweep · *first thing on the tablet*

`src/index.css:297` sets `html, body { height: 100%; overflow: hidden }`. Any screen that renders **outside** the app shell as a `min-h-screen` block with no scroller of its own has content below the fold that is physically unreachable. The audit found **five** of them. Test in **landscape**, where vertical space is shortest.

- [ ] **The sign-in screen** at 1366×1024 landscape, and again with the on-screen keyboard up. Every button reachable. *If it fails:* this is the worst one on the list — a trainer cannot get into the app at all. `AppContent.tsx:1325`, root has `overflow-hidden` at `:1327` and zero scrollers beneath it.
- [ ] **Studio selector — scroll to Strongsville.** Every location reachable, all 40. *If it fails:* known, root cause found, `StudioSelectionView.tsx:159`. Note *how far* you get before it dies — that tells you how urgent the redesign is versus the one-line fix.
- [ ] **Access Request screen** (sign in as a user with no trainer profile). *If it fails:* `AccessRequestView.tsx:113`, same defect, and this is a first-run experience.
- [ ] ~~**Consultation wizard**~~ — nothing opens it since Sep 24 2026 (the Relay "Assessment" task is the Pulse task and opens the client's Pulse). Check that instead: a Pulse task on the board lands on Notes & Profile → Body & Pulse.
- [ ] **Consultation setup wizard** from inside the tracker. *If it fails:* `ConsultationSetupWizard.tsx:56`, same. Since Sep 24 2026 it opens on the client's gender and age as recorded, or on nothing, and a starting weight reads "—" until both are answered. Skip must leave a recorded gender alone.
- [ ] **While you are here:** on the sign-in screen and Access Request, check the avatar image renders. *Predicted:* `AccessRequestView.tsx:176` passes `src=""` when there is no photo, which makes the browser re-request the page as an image.

**All five share one fix** (`h-full overflow-y-auto` on the view's own root). Verify them together after the fix, not one at a time.

---

## Round 2 — Five-minute smoke test

If any of these is wrong, stop and fix it before continuing — everything downstream depends on them.

- [ ] Sign in, land on the Hub, see today's real schedule with real client names.
- [ ] No block reads "Not synced" that should be linked. *If some do:* run `scripts/diagnose-schedule-links.ts` before theorising — it tells you whether it is a missing clientId, a missing document, or a UI problem.
- [ ] Open a client profile. All FOUR tabs render — Journey, Programming, Notes & Profile, Activity Archive — and the sub-toggle inside each one.
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
- [ ] **Programming → Routine A / Routine B with Routine B off**, and again with nothing chosen for today. No "G 0" chip on a machine with no setting.
- [ ] **Programming → All Machines during the backfill** — the "from loaded sessions" label must **disappear on its own** after the first open, without a refresh.
- [ ] **Build the Deep Dive (Activity Archive → Deep Dive) on a real 100-session client. Time it.** Then read every insight card and ask whether a clinician would nod at it. *This is the highest-value item on the page* — the numbers are unit-tested, the judgement is not.
- [ ] **Notes & Profile → Notes and Activity Archive → Calendar in dark mode.** Neither is harness-verifiable; both subscribe to Firestore, so this is the first real look.
- [ ] **Start Session when one is already in progress.** Your own: Continue session and Discard. Another trainer's: Watch session and Discard, with Take over on the watching screen (session record, Sep 26 2026).
- [ ] **Predicted problem — try to edit a journal entry you just wrote.** *Expected:* you cannot. The edit mutations exist (`useClientJournal.ts:180,357`) with no UI calling them, so entries are append-only. A mistyped clinical note is permanent. Decide if that is acceptable.
- [ ] **Predicted problem — save something slow and watch the button.** Four `isSaving*` flags are set and never rendered, so a slow save looks like a dead button and invites a double-tap.

### Client profile audit · *branch `client-profile-audit` (Sep 16)*

*Since the client codex (Sep 24) Notes & Profile is seven pages: walk its
record items in **Round 14** instead. The Body, Goals, Assessment, Admin and
"Portrait, record tab" items below describe the old long scroll.*

- [ ] **Tap all four tabs twice**, then open a machine from the Journey grid, close it, and tap the SAME machine again. The machine window opens both times.
- [ ] **Journey:** no "Recent journey" caption, no blue Latest column. Scroll the grid left: older sessions appear on their own and the rail says "Start of history" at the end. The Active Session grid still shows its Today and Latest columns.
- [ ] **Machine window on a client with a disc or knee flag:** the watch-out card leads; change a setting — it asks for a reason and the change appears in the history and the journal.
- [ ] **Set up a machine a client has never used, for a client with a height:** a "most common setting" line may appear under an empty field; nothing is filled until you tap Use. A client with no height shows nothing.
- [ ] **Sync (header) on a real Mindbody client.** The toast says how many fields refreshed; Who they are shows address, waiver, status, "In Mindbody since". Name and contact are read-only. Try a client with no Mindbody id — the button is disabled and says why.
- [ ] **Nickname:** set one, Save, and check the header, the briefing, the session bar and the post-session screen.
- [ ] **Body:** search "stent", toggle Knee limitation, Save. The banner, the briefing, the Activity Archive strip and Programming's leg press row all show it.
- [ ] **FORD** (Notes & Profile → FORD), signed in as a Life Transformer, not an administrator: Coming up leads with the Mindbody birthday ("Her 69th birthday · In 17 days · Family · from Mindbody"); tap it and the dialog opens as an annual Family "Birthday" with the gesture open. A capture in To file files with one of the four labelled buttons. On Occupation tap Edit: a Teacher lands on "On their feet"; type a job title that is not on the list and it stays; pick Retired — the band says "Not saved yet", Ask next turns to "How is retirement going?", and the Save bar says "FORD · Occupation"; Save. An old "Anniversary" note from the journal sits in Family, "From an older note", and is no longer on Notes. Idea → "I'll do it" puts your name on it; "Mark done" asks what happened. A cross-train trainer sees the notice that FORD is kept by the home studio, the older notes, and no Add. **In one line** (top of FORD): Write the line → Save — it shows "Written by the team · last by {you}", and the Overview's FORD door now leads with it; sign in as a second trainer at the same studio and Edit it — their name replaces yours; empty the box and Save — "No line yet". A cross-train trainer sees no line anywhere (FORD page or Overview). **Follow up next time:** open a Recreation detail, type "How did the new boots do?" in Follow up next time, Save — Recreation's Ask next becomes that question, "Follow up from {you}, {today}"; edit the detail's sentence only and Save — the date under the question does not change; Asked it → type an answer → Save the answer — a new Recreation detail appears and Ask next goes back to one of FORD's questions; on another detail, Asked it → Nothing new, clear it. **The detail dialog on a smaller iPad:** on an 11-inch in landscape, tap the birthday in Coming up (the dialog opens with the gesture open), tap into Follow up next time so the keyboard comes up — the dialog scrolls and Save is reachable. **Body & Pulse → Training story:** step protocol mastery up and Save — the trail is dated.
- [ ] **Goals:** tick SMART boxes, Mark achieved with a reward, and see it in the history. **Focus:** two active focuses at once; Achieved with a reward; check in on one — the note carries the focus.
- [ ] **Notes:** tap "Write a note…" to open the composer; tap a category chip to isolate it (a critical note it hides shows as the red line, "Show it" brings it back); write an injury with a machine; type a sentence, then FORD / Life — the same words stay and "Save to FORD" saves it to FORD, not the notes. Open a Standing row in place; "Show the N resolved notes". Signed in as a trainer from another studio, neither the page nor the header's Note dialog offers "Save to FORD". Medical history does not appear twice.
- [ ] **Assessment:** change a score, add "why?", reload — the change and the note are in the history log.
- [ ] **Admin:** the tier reads sensibly; lock it, Save, and "Use Mindbody's" undoes it. A client visiting another studio says whether they are cleared.
- [ ] **Activity Archive → Reports** on a client with ≤10 sessions left and no recent report: the renewal cue shows. **Start a new progress report:** three accolades are drafted from data, none reads "undefined" or "+0%", and the 4 P's step lists recent focuses.
- [ ] **Report banner above the header** on the Journey tab for a client WITH reports: it never says "no progress report on file".
- [ ] **Portrait, record tab:** nothing shows below the Save bar or above the jump rail while scrolling.

### Journey grid & live session · *branches `journey-grid`, `session-density-round4`*

- [ ] **Portrait: 8 history columns and 8 machines with no vertical scroll.** That was the measured result of the Now-bar round. *If you get fewer:* the 8-machine rule broke, and it is the whole point of that round.
- [ ] **A full session end to end** — weight, reps, quality on several machines; a Torso Rotation left/right set; **Log-as-TSC** from the stopwatch; **Add-to-session** on a machine not in today's routine; a note from the Notes button. Finish the session.
- [ ] **Then check Notes & Profile → Notes** — the in-session note is there with `origin: in_session`. *If not:* the `journalEntries` rule did not deploy (back to Gate 0).
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

### Learning, the Planner, machines and comments · *branch `learning-planner`*

The full pass is `LEARNING-PLANNER-ROUND.md` §5. These are the ones most likely to catch something:

- [ ] **A studio's own machine from the bell.** Flag a machine the studio made (`sm-…`), then open the flag from another trainer's bell, on a fresh load. *Expected:* that machine's page at the studio. *If it lands on All MSF machines:* the Catalog decided before the floor had loaded — `CatalogWikiView` must wait for `floorLoading`.
- [ ] **A tag at another studio.** Work at two studios. Get tagged at one while switched to the other, and tap the bell. *Expected:* "That was at *studio*…", not the wrong studio's thread.
- [ ] **Tag two people whose names start the same** ("Sam Kim", "Sam Kimball"): pick one, delete it, pick the other, post. Only the second is tagged, and only their bell rings.
- [ ] **Share a note, then switch Share off.** Before saving, go to Studio and back to Notes; then save. The copy must be gone from the client's **Plans from the team**. *If it stays:* the restored draft saved before the notes loaded.
- [ ] **Delete a folder while a note in it is open with unsaved changes.** Save the note: it shows under **Unfiled**, not only under All.
- [ ] **Switch a machine off, then add it back from All MSF machines.** *Expected:* **Put it back on *studio*'s floor**, and one entry on the equipment list — never a "-2" copy.
- [ ] **Operations → Studios → Equipment at a studio you don't work at** (as a studio leader): no **Upkeep** button.
- [ ] **Offline:** open the Overview, a studio page and My tasks with the network off. *Expected:* "Loading…" or "Couldn't load…" — never "Nothing written here", "That page is gone" or "Nothing on your list today".
- [ ] **Long lists keep their place.** Scroll far down All MSF machines, open a machine, come back up: you're where you were.

### The Planner rework · *branch `planner-rework`*

The round is `docs/rounds/2026-09-16-planner-rework.md`. Two iPads, one signed in as a head trainer, one as a trainer, both at the same studio.

- [ ] **Post a job with three machines, for "anyone", with "Tell me when it's finished" on.** *Expected:* it shows on both iPads' Studio tab as **Up for grabs**; the glance band says "1 up for grabs".
- [ ] **Both iPads tick a different part at the same moment.** *Expected:* both ticks stay. *If one vanishes:* something rewrote `parts` whole.
- [ ] **The trainer taps I'll take it, then closes the job with a note.** *Expected:* the head trainer's bell rings "taken", then "finished"; the job moves to **Finished lately**.
- [ ] **The head trainer switches to a studio they only visit.** *Expected:* no **Team** tab and no **Post a job** there.
- [ ] **Team tab after an assigned task is left undone yesterday.** *Expected:* that person's card (people are in name order, never moved to the top) says "Missed *task* on *day*", with no "Behind" label. A task someone else finished is not held against them. Today's open tasks are never "missed".
- [ ] **New reminder for 5 minutes from now, "5 min before".** Leave the app open on any screen. *Expected:* the bell rings once, even with the same trainer signed in on both iPads; the Calendar shows it in the strip above the month.
- [ ] **Write a note over two sittings.** Add two working notes, close the app, reopen, add a third on the other iPad, then save the note on the first. *Expected:* all three jots are still there. Fold one in with **Add to the note**.
- [ ] **Formatting:** a heading, a checklist and a link. *Expected:* read mode draws them; ticking a box saves; the link opens in a new tab.
- [ ] **Share with one colleague "for a week".** *Expected:* their bell rings once; the note is under **From colleagues** on their iPad; they can **Save a copy** but not edit. Switch it off and save: it's gone from their list at once.
- [ ] **Share a note that names a client coached at another studio.** *Expected:* the card says so and Save is refused.
- [ ] **Old iPad (iPadOS 15/16) cold load.** *Expected:* the app opens (a regex the old Safari can't parse would blank the whole app).

### Relay · *branch `relay` (Sep 16)*

The round is `docs/rounds/2026-09-16-relay.md`. Two iPads at the same studio, one signed in as a head trainer, one as a trainer, both with sessions on today's schedule. Try portrait and landscape: the Context Panel is a right column in landscape and a bottom sheet in portrait.

- [ ] **Open Relay between two sessions.** *Expected:* the Now Bar names the shift phase, your next client and the minutes free; the meter fills to an hour; tapping it unfolds the day strip with your sessions as blocks and a line at now. *If it says "No sessions on your schedule" while the Calendar shows them:* the row's trainer name didn't match — send the trainer's name as Mindbody spells it.
- [ ] **Capture, one tap.** Tap the orange button, type "Deep-clean the leg press", tap Relay it. *Expected:* it lands on your own list (Mine → Today) and the toast says so. Now the same with **The Floor**: *Expected:* an ask on the board that the other iPad sees under Requests within a second. The head trainer's iPad also offers **A studio task**; the trainer's does not.
- [ ] **Hand it to someone.** Capture → Someone → the other person → Relay it. *Expected:* their bell rings once ("handed you"), the card is at the top of THEIR Next up in the blue colour and under Mine → Handed to you; they close it with the tick and YOUR bell rings.
- [ ] **Next up, Do it, swipe.** On a card, tap Do it. *Expected:* a shift group opens in the panel with its rows to tick; an ask is claimed and opens with a Done at the foot; a job opens its sheet. Swipe a card right: it closes. Swipe left: it disappears for this shift phase and is back after the next phase starts (or a restart).
- [ ] **The rings.** Tick all of the Opening work. *Expected:* the Opening ring closes with a sweep and a green dot appears on the Now Bar for the rest of the day.
- [ ] **The Floor Map after a session.** Finish a session on two machines, then open the Floor. *Expected:* those two tiles show 1 and read warmer than the rest. Tap one, tap Wiped: the tile cools, today's cleaning row for that machine ticks, and Operations → Equipment shows a "Cleaned" entry. Flag one with a note: the flag shows on the tile and under Team → Open loops; the head trainer's bell rings once.
- [ ] **Mine's lanes.** *Expected:* Follow-ups lists your clients with a birthday or a FORD date in the next two weeks, with a Task button that opens Capture pre-filled; a personal task filed under Growth (Capture → More → File under Growth) sits under Growth, not Today; the Floor button on a personal task opens Capture addressed to the studio.
- [ ] **A note in two panes.** Open a note in landscape. *Expected:* working notes on the left, the note on the right; Lift into the note carries a jot across; the kind under File it reads as suggested once you link a client and write "shoulder pain" (Injury plan), and stays put once you tap a kind yourself. In portrait, the Log / Note switch under the bar swaps panes.
- [ ] **Publish audiences.** Share with one colleague and tick Hand it off. *Expected:* their copy has a **Take it over** button. A franchise owner also sees **All MSF studios**: sharing there shows the note under From colleagues on an iPad at ANOTHER studio.
- [ ] **The client's record.** Open a client → Notes & Profile. *Expected:* "Your working notes" under Plans from the team shows your last jots about them; adding one there appears in the Planner note's log; the other iPad (a different trainer) does not see it.
- [ ] **Team tab as the head trainer (people and standards since Sep 27 2026).** *Expected:* no Who's in today and no client groups (the Hub and Operations answer those); people by name, each with the sentences of their week; under The studio's standards, Open loops lists an ask nobody picked up for a day, a machine flagged on the Floor Map or reported on the shift list (once), and an overdue job; the vault logs an incident that the trainer's iPad cannot read (switch to it: no vault section). A pending sign-in request shows "waiting to be let in" at the top, and Let them in scrolls to the staff list.
- [ ] **Kudos.** On the other iPad's Just now line about your work (it was labelled Pulse until Sep 27 2026), tap the heart. *Expected:* your bell rings once ("sent kudos"); the heart shows 1; the Team tab's card for you shows a heart with 1. You cannot kudos your own line.
- [ ] **The Calendar.** *Expected:* the strip above the month says Relay and shows a timed studio task on every day it falls, a team job on its due day with initials, a hand-off in blue; Mine narrows it to yours; a tap lands in Relay on the right tab.
- [ ] **The network as a franchise owner (Operations → Overview → Looking at: All my studios, since Sep 27 2026).** *Expected:* no Network tab in Relay; under All my studios, Focus this quarter (one for every network that holds one of your studios, whether or not it names you: voice review follow-up, Sep 27 2026) — Set the focus shows a banner on the Floor of every studio in it; Launch an initiative asks first and names every studio, then shows under Initiatives on each studio's board; no ranking of studios anywhere. An owner with one studio finds both at the foot of that studio's Overview.
- [ ] **Old iPad (iPadOS 15/16) cold load.** *Expected:* the app opens and Relay draws (color-mix and the swipe rows degrade gracefully; no blank app).

### Hub sync fixes · *branch `hub-sync-fixes` (Sep 16)*

The round is `docs/rounds/2026-09-16-hub-sync-fixes.md`.

- [ ] **Open the Hub at Solon, then switch to Strongsville.** *Expected:* for a second the blocks show a small grey dot (loading), then names resolve. No block says "Not synced" unless its client really has no profile. *If every block stays "Not synced":* the roster listener was refused — the console says why.
- [ ] **Client directory after that switch.** *Expected:* only Strongsville clients (a visitor booked at Strongsville may show "Visiting"). No Solon clients left over. The line under the search box says "…most recent of N"; **Show all N** lists them all.
- [ ] **Type a name in the directory.** *Expected:* results appear instantly (no spinner); "Search entire corporate network" still finds other studios' clients.
- [ ] **Leave the iPad on the Hub for an hour, run a sync that adds a new client.** *Expected:* the new client's block resolves by itself, without a reload.
- [ ] **Edit Routine, iPad portrait, a routine with 8+ machines.** *Expected:* the list scrolls, and the **Add / Ideas / warnings** bar stays visible above the notes. Tap Add: the picker opens. Focus the notes field: the keyboard doesn't hide it. Landscape: the rail's picker scrolls too.
- [ ] **Body → Browse every condition.** *Expected:* a legend (STOP · HIGH · unmarked); no label overlaps a name; each group starts with its most serious conditions; the bracketed detail ("Grade 2 or higher") shows under the name.
- [ ] **Run a sync, then look at yesterday on the Hub.** *Expected:* yesterday's bookings are still there (they used to turn "Cancelled" on every sync).

### The reporting round · *branch `reporting-round` (Sep 16)*

The round is `docs/rounds/2026-09-16-reporting-round.md`. Everything a trainer rates is now one control (the Dial) and everything they write has one loudness (Note · Heads up · Critical). Hold the iPad in one hand for this walkthrough — the point of the Dial is that the thumb finds it without looking.

- [ ] **Open any client → Start session → the briefing.** *Expected:* "Before you start" lists Critical notes first, then any Heads ups (quieter), then any body region carried over from the last session ("Lower Back · Stiff · until Sat"). With nothing: "Nothing flagged — clear to go." Each routine button says "Last run <date> · N machines" — for THAT routine, not the last session.
- [ ] **Tap the FORD line ("How is the family?").** *Expected:* it opens the Remember-this capture in place with Family already picked. Type a sentence, save; the line updates. Nothing else on the page moves.
- [ ] **"On the way in": four bars — Sleep · Energy · Recovery · Stress.** *Expected:* all rest untouched and say "Not asked"; five equal segments each, 48px, the centre one with a small tick. Tap "A bit short" on Sleep → the word appears top-right in plum. Tap it again → clears back to "Not asked". Tap the centre → "As usual" in blue (that IS stored — it means you asked). Eyes off: with a thumb on the bar, the second segment from the left is "a bit off" on every dial.
- [ ] **Tag body region → pick Lower back.** *Expected:* the same five-segment Dial (Pain · Stiff · As usual · Better · Recovered). Pick Stiff → a "Matters until" date appears with "Keeps showing on the briefing until then". Set Friday, save. The chip reads "Lower back · Stiff · until Fri".
- [ ] **Update Pulse (top right of the section).** *Expected:* a sheet with the eight areas as tiles, each saying when it was last touched ("3 weeks ago", "Never asked"). Tap Sleep & Recovery → three statements, each on the Dial with Not at all … Nearly always under it. Tap "Often" on one → "Saved" appears. Done → back to the tiles. Close. Nothing was required.
- [ ] **Start the session, open Notes (the sheet).** *Expected:* three tabs — Note · Remember this · Pulse. On Note, NO category is pre-selected and the button reads "Save — file later". Type "left knee clicky on leg press" and save without a category. Under "This session" a "To file · 1" tray appears with the note and five category chips.
- [ ] **In the same sheet: pick Injury, type a note, set How loud to Heads up.** *Expected:* a "Matters until (optional)" date appears with "After this it stops showing on the briefing." Save. The card shows a HEADS UP chip.
- [ ] **Pulse tab in the sheet.** *Expected:* the same tiles as the briefing's Update Pulse, compact; one tap into an area, one Dial tap, Done returns to the Note tab. Nothing about the session moved.
- [ ] **End the session → the Wrap-up.** *Expected:* under Next, "How did it land?" is a Dial — Wiped out · Drained · Just right · Had more · Barely worked — with "Your read · judged by you". Tap Just right → "Saved" and a one-line sentence under it. Tap again → clears (stores nothing). The Profile note has Note · Heads up · Critical with **Note** selected; picking Heads up reveals "Matters until". The unfiled knee note is in a "To file" tray ABOVE the FORD sweep — tap Equipment → it files and disappears. "Update Pulse" opens the same sheet as the briefing.
- [ ] **Back to Hub → open the client → Notes & Profile.** *Expected:* the Notes area has a "To file" tray only if something is still unfiled; the record's section is titled **Pulse** ("How life is going — filled a little at a time, never done") with a "Hand to client" button. Expand Sleep & Recovery: the three statements are on the Dial with the five words; NO 0–10 buttons anywhere; one note box per area ("In their words / worth remembering"), none per statement.
- [ ] **Hand to client.** *Expected:* a full-screen sheet — "Judy, tap the word that fits." — one area at a time, Back / Next on a 48px bar, no scores, no coach notes, no history. Answer one, Next, "Done — hand back" at the end → the panel says "Judy's own answers" in its header. Answer something yourself → it goes back to the coach.
- [ ] **Activity Archive → Reports → build a Progress Report.** *Expected:* FIVE steps (Volume · Accolades · Machines · 4 P's · Blueprint) as equal columns whose names never truncate in portrait. On 4 P's each P is one Dial (Needs work … Mastered); no red/black/green, no 1–5. Pick Strong on Posture → the printed copy says "Strong" and a five-segment bar, never a number. On Blueprint the top card is "Pulse · as of <date> · by <trainer>" read-only, or "No Pulse on file yet — nothing is printed."
- [ ] **Activity Archive → Deep Dive segment.** *Expected:* the gate says Kaizen Deep Dive; "Build the Deep Dive". The report opens with the caveat line ("It can be wrong — treat every line as a question…") directly under the sticky bar, then Progression stalls → Readiness vs output (sleep · energy · recovery · stress · body regions · dose, each Off days / As usual / Up days; a level under 3 sessions reads "needs 3") → Attendance rhythm (one sentence) → Pain & incidents + Pulse trend → Time under tension → the heat map. No "tonnage" anywhere.
- [ ] **A session from before today (Activity Archive → Calendar → open one).** *Expected:* "On the way in & how it landed" shows the old answers in the Dial's words (Poor → "A bit short", Wiped Out → "Wiped out"), never "poor" or "3 / 5".
- [ ] **Dark mode, all of the above.** *Expected:* every Dial reads on its card (the Wrap-up follows the theme since Sep 27 2026: light on the light theme, dark on the dark, its Dial, Loudness and trays included); no white flash, no unreadable segment.

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
- [ ] **A settings change with an audit reason** shows up on Notes & Profile → Notes.
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
- [ ] **Admin screens with no role gate.** *(Since then: `franchise-dashboard` was deleted on Sep 19 2026 and `admin-dashboard` asks `mayOpenOperations` since Sep 24; check the rest.)* `admin-dashboard`, `franchise-dashboard`, `trainer-hub` and `integrations` are rendered on `currentView === X && authTrainer` with **no role check** — the only gate is the button. Confirm whether a plain trainer can reach them by any other route.
- [ ] **The `?view=trainer-hub` deep link** — gated on Admin/Founder/Overseer, but it also **fabricates a fake Owner trainer** (`id: "owner-temp"`, `pin: "0000"`) when no trainers exist (`AppContent.tsx:931-937`). Test it against an empty studio and decide whether that bootstrap should survive to production.
- [ ] **Per-studio machine possession toggle** — it controls Machine Settings only; it does **not** hide un-owned machines from the Journey grid or Active Session. Confirm, then decide if that is acceptable at beta.
- [ ] **Check the live deployment for the contractor's hardcoded admin email** (fixed in this copy only).
- [ ] **What another studio can see (Learning + Planner round).** As a trainer at studio A, in the console: list `studios/B/playbook` and `studios/B/wiki` directly. *Expected:* **refused** — only what B shared comes through, via the collection-group lists. Read `studios/B/comments`: refused.
- [ ] **Announcements by role.** A studio owner can post to their studio and network but not to everyone, and can't take down head office's notice; a franchise owner can do both from Operations; a head trainer has no composer and can only mark notices read.
- [ ] **A Planner note stays private.** Sign in as another trainer — even a studio owner — and try to read `trainers/{someone else}/notes` in the console. *Expected:* refused. The shared copy on the client is readable by anyone who can open that client.

---

## Round 5 — Failure modes · *nobody has tested any of these*

The whole app has been verified against mock data on a good network. This round is the opposite.

- [ ] **Turn the Wi-Fi off mid-session, log two sets, turn it back on.** Do the sets survive? *This is the single most important test on the page.* There is no service worker and no Firestore offline persistence enabled. A gym floor is the worst network in the building and a lost set is a lost client relationship.
- [ ] **Turn the Wi-Fi off and try to save a machine note.** It must say so.
- [ ] **Force a Firestore quota error** (or simulate one) and watch the screen. *Predicted:* nothing at all. `lastQuotaErrorMessage` is captured and never rendered — so on the floor a quota storm looks like the app quietly not working.
- [ ] **Import a broken legacy chart.** *Predicted:* silence. `isImporting`, `importStats` and `legacyError` are all set and never displayed.
- [ ] **Make something throw** on a screen other than Calendar. *Expected:* a white screen — `CalendarView` is the only view with an `ErrorBoundary`, and `ErrorBoundary.tsx` itself is `@ts-nocheck`.
- [ ] **Two iPads, same client, two trainers** (session record, Sep 26 2026). JC starts Judy's session on one iPad; AJ opens Judy on the other. *Expected:* AJ's iPad watches: "JC is running this session on another iPad", no Now Bar and no Finish, and each set JC saves appears within a few seconds. Tap Take over and answer Keep watching: nothing changes.
- [ ] **Take over, then finish.** AJ takes over, and JC's iPad says "AJ took over this session on another iPad" within a few seconds. Any reps JC had typed are in the session. AJ finishes. *Expected:* the session counts once, for AJ, and the session pop-up (Activity Archive → Sessions) says "Started by JC".
- [ ] **A dead iPad.** JC's iPad dies mid-session; JC signs in on another iPad and opens Judy. *Expected:* JC carries on recording, not watching, with every set that was saved.
- [ ] **Watching, then the trainer finishes.** *Expected:* the watching iPad says "JC finished the session." and shows the briefing.
- [ ] **File a bug report through the in-app reporter**, then try to close it as an admin. *Expected:* you cannot — `AdminBugReports` has no `updateDoc`. Every report is written `status: "open"` forever and the reporter never hears back.
- [ ] **"Mindbody is down and a client is standing in front of me."** Walk it through with no sync. *Expected:* there is no path — manual client creation and manual linking were both removed on Aug 30. Decide the answer before beta, not during it.

---

## Round 6 — Performance on real hardware

- [ ] **Cold load on a studio tablet, on studio Wi-Fi. Time it.** `dist/` is 4.2 MB and Firestore initialises at module scope, so its 394 KB chunk downloads and runs **before the first pixel** regardless of the code splitting.
- [ ] **Open a client profile with heavy history.** `ClientProfileView` is a 413 KB chunk on its own.
- [ ] **The 12-month clinical report timing** from Round 3 — write the number down; it is your worst realistic case.
- [ ] **Add the app to the iPad home screen** (the Home Screen round, Sep 26 2026: `src/features/home-screen/README.md`). Safari → Share → Add to Home Screen, leave "Open as Web App" on. *Expected:* the Journey icon and the name "Journey"; it opens full screen with no address bar; the sign-in screen (the icon has its own storage, separate from Safari).
  - The clock and battery are readable on every screen in both themes. iPadOS draws the status bar above the app in the header's colour: navy in dark, white in light (the `default` style since Sep 27 2026).
  - The bottom bar is whole, in portrait and in landscape: every label (Hub, Client, Start Session, Learning, My Studio, Calendar) reads in full, and no black strip sits under the bar. An icon added before Sep 27 keeps the old style: delete it and add it again first.
  - Nothing tappable sits under the clock or on the home indicator: the header, the bottom bar, the Notifications and Feedback sheets, the Active Session's Pulse, Notes and Watch-outs panels, the Packages sheet, Pulse "Hand to client" and the studio picker.
  - Rotate the iPad: it turns both ways.
  - Then run the sign-in test in `docs/rounds/2026-09-26-home-screen.md` **before telling trainers to use the icon**.

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

## Round 8 — Editing history and logging a past session · *Sep 17 2026 round*

None of this has been on an iPad. Do it on a **test client**, not a real one —
two of these items change the client's session count on purpose.

- [ ] **Rules first.** `npm run test:rules`, then
  `firebase deploy --only firestore:rules`. *If you skip it:* Remove and
  Delete session both fail with a permission error, because until Sep 17 only
  a super admin or a franchise owner could delete a set or a session.
- [ ] **Open a past session → Edit → Add a machine to this session.** The
  Routine Builder's picker opens inside the dialog. Add one; it appears as a
  dashed "New" card. Give it a weight and reps, Save. *If it fails:* the batch
  writes the set, the stamp and the machine count together — a permission
  error on any one of them rolls back all three.
- [ ] **The header says "Edited by ‹you› on ‹today›"** and carries an **Edited**
  badge, immediately, without a reload. Reopen the session: it still does.
- [ ] **Edit → bin on a set.** It goes struck-through and faded, not hidden,
  and the bin turns into an undo arrow. Tap the arrow: it comes back. Bin it
  again and Save: the set is gone.
- [ ] **Programming tab → the machine you added.** Its "performed N times"
  went up by one; the one you removed went down by one. *If they didn't:*
  `client.machineStats` is only adjusted for a session that ever cast those
  votes — check `ownsClientCounters` and whether the session is an old
  backfill.
- [ ] **Cancel drops everything.** Edit, add a machine, bin another, Cancel.
  Nothing changed and no stamp appeared.
- [ ] **Log past session, all three panes.** A date last week, a trainer, then
  *Start from → Routine A* — all its machines arrive in order. Drag one to
  reorder. Add one more from the picker. Next: fill weight and reps on some
  and leave one blank. The footer counts them ("4 of 5 machines with
  numbers") and the blank card says it will be saved as not done.
- [ ] **Leave a quality unset on purpose**, and set then unset another. Neither
  should end up with a rep quality on the saved session.
- [ ] **The saved session counts.** The client's session count went up by one,
  and the session shows on the calendar on the day you chose (not the day
  before — that was the old UTC bug). Delete it: the count goes back down.
- [ ] **An OLD backfill still must not decrement.** Find a session logged
  before Sep 17 2026 with "Logged later" in its sub-line, note the client's
  session count, delete it, and confirm the count did **not** move.
- [ ] **Autocorrect is off** in the header search, the client directory and
  Relay's client picker: type a name the keyboard used to mangle and watch it
  stay as typed. *If it still corrects:* the field is missing
  `NAME_SEARCH_PROPS`.
- [ ] **Shake the iPad while typing in a note.** With the device setting off,
  no alert. With it on, the alert may appear — tap Undo and confirm **nothing
  rolls back**. On a studio PC, Cmd+Z in a text field still works.

## Round 9 — Machine fit · *Sep 17 2026 round, branch `machine-fit`*

None of this has been on an iPad, and one piece — the docked keypad — can only
really be judged on one. Use a **test client** for anything that saves.

**At the keyboard first**

- [ ] **Rules.** `npm run test:rules`, then
  `firebase deploy --only firestore:rules`. *If you skip it:* saving still
  works (the index write is caught), but the studio index never fills, so
  suggestions and the check have nothing to read.
- [ ] **Build the index once.** `npx tsx scripts/rebuild-machine-fit.ts` and
  read what it prints per studio; then the same with `--commit`. *If the row
  count looks low:* "skipped (client has no home studio)" is the usual reason.
- [ ] **Build the company tier once.** `npx tsx scripts/run-machine-trends.ts`,
  read the "Machine fit:" line (machines, set-ups pooled, held back), then
  `--commit`. "Held back" is normal while the company is small: a height with
  fewer than five clients is not published.

**Programming → Setup, on the iPad**

- [ ] **A client with nothing set up opens on Set up**, in the floor's order,
  with suggestions as grey *placeholders* — never as values. One who is fully
  set up opens on **Check**.
- [ ] **The segment's line** reads "N of M set up · k to review". The dot is
  there only when a machine in her routine has nothing set.
- [ ] **Why.** Open it on one row: the ladder ("5'4" 2 clients, 5'3"–5'5"
  7 clients"), the order it was worked out in, and the bars. Tap one value in
  it: only that cell fills.
- [ ] **Accept strong suggestions**, then **Undo accept**. Then accept again,
  change one value by hand, and **Save**. Reopen the machine from All
  Machines: the values are there, and the machine's history shows one entry.
  *Nothing was written before Save* — leave the screen mid-way once to prove it.
- [ ] **Type a seat by hand** on an empty machine: the pad offered for the
  other cells should change to go with it.
- [ ] **Similar to.** Switch on Wingspan for a client with none on file: the
  panel says it is not on file and the suggestions still come. Add a wingspan
  on her record (General, beside Height) and try again.
- [ ] **Quick entry — the keypad.** Tap a cell: the pad docks at the bottom and
  **the iPad's own keyboard stays down**. The row you are typing into is never
  covered. First key replaces; a one-digit scale moves on by itself; **Next**
  walks the chart top to bottom; **abc** brings the system keyboard up for that
  one cell. *This is the item most likely to need a fix.*
- [ ] **Quick entry — shorthand.** In a row's abc box type
  `Gap:6, Handles:in, seat: up, Chest:3 PILLOW` on the Compound Row. The three
  it can place fill in; PILLOW is kept as a note on the machine, not dropped.
  Try `Gap  S- 8` — it must be **Seat 8 and no gap**.
- [ ] **Paste a chart.** Several lines at once, machine names first. Anything
  it could not match to a machine is listed, not lost.
- [ ] **Check.** On a set-up client, change one seat to something absurd from
  All Machines, come back: a plum diamond and one sentence. **Right for this
  client** clears it; changing the value brings the question back. No bell, no
  badge anywhere else.
- [ ] **Portrait and landscape, light and dark.** Names wrap, never truncate.

**Operations → Machine fit**

- [ ] **This studio** opens on the first machine anyone is set up on, not an
  empty one. By height, By setting and Set-ups seen together all read; a band
  with under five clients says *not enough data yet*.
- [ ] **Worth a look** names the client from the Check test above. Tap her: the
  profile opens **on Programming → Setup, in Check**.
- [ ] **As a studio leader** (not an administrator) the *All MSF studios* switch
  is not there.
- [ ] **As an administrator**, All MSF studios shows the weekly report: studios
  named, no client named anywhere. Before the first `--commit` run it says
  "No company report yet".

**Two iPads**

- [ ] Set up two different clients on the **same machine** at the same moment
  and Save both. Both rows survive (Operations → Machine fit counts both).

---

## Round 10 — My Studio · *Sep 18–19 2026 round, branch `my-studio`*

The round is `docs/rounds/2026-09-19-my-studio.md`. None of it has been on
an iPad. Two iPads at the same studio: one signed in as a **head trainer**
(or studio owner) of that studio, one as a **trainer**. A third sign-in as
a **franchise owner or administrator** for the Operations checks. Use a test
studio's record for anything that saves — the Studio section writes the real
`studios/{id}` document.

**At the keyboard first**

- [ ] **Rules.** `npm run test:rules` — 115 tests, the last ten under "MY
  STUDIO". *If any fail:* stop, send the output; nothing else in this round
  depends on a deploy, but the leader's writes below will be refused until
  the rules are live. Then `firebase deploy --only firestore:rules`.
- [ ] **Typecheck and suite.** `npx tsc --noEmit` (11 on a clean clone) and
  `TZ=America/New_York npx vitest run src` (3,323 in 210 files — on Windows
  PowerShell: `$env:TZ="America/New_York"; npx vitest run src`).

**The shell**

- [ ] **The bottom bar says My Studio**, and opens on **Relay** with three tabs
  (Floor · Mine · Notes) under the studio's name — no Team tab, and no Network
  tab since Sep 27 2026 (it is on Operations → All my studios).
  Everything from the Relay walkthrough (Round 3) still works from here:
  Capture, the Now Bar, Next up, swipe, the Floor Map.
- [ ] **The trainer's iPad shows Relay and Machines only.** The head trainer's
  shows all four. Switch section, go to the Hub, come back: **it reopens on
  the section you left**. Tap a notification that links to Relay: it lands on
  Relay whatever section was open.
- [ ] **Capture from another section.** On Machines, tap the orange button and
  relay a task: it lands on Mine → Today as it would from Relay.

**Studio**

- [ ] **Details.** Change the studio's name and tap Save: the masthead and
  the studio picker say the new name on both iPads. Set the **Journey cutover
  date**: a client's history coverage wording changes from "unknown" to the
  cautious or complete reading (Round 3's fluidity checks). Clear it and
  Save: it is removed, not stored as an empty string.
- [ ] **The Mindbody guard.** Change the Site ID to a number that does not
  exist: Save is refused with a sentence until the lookup answers; put the
  real one back and Save works. *As a trainer* (in the browser, since the
  section is hidden on the iPad): a write to `studios/{id}` is refused by the
  rules — the schedule sync still runs (the Hub keeps filling).
- [ ] **The studio's day.** Move the Mid hour: the Now Bar on the trainer's
  iPad names the new phase within a minute. Team → Standards no longer has
  an hours card — this is its only home.
- [ ] **Renewals.** The studio's renewal settings live here only (since the
  Operations round): change a threshold and Operations → Renewals' pipeline
  follows; Operations → Renewals has no Settings view, just the pointer.
- [ ] **Announcements.** Post a notice: the trainer's bell rings once at THIS
  studio; an iPad signed in at another studio never sees it; there is no
  "Which studio" picker and no "All studios" choice. Take it down: it leaves
  both bells.

**Machines**

- [ ] **New in the MSF standard** lists only standard machines the floor does
  not have. Adopt one: it appears on the floor and leaves the list. Switch a
  floor machine off (We don't have this): it does **not** reappear under New.
- [ ] **An empty test studio** shows "The MSF standard set" with **Adopt the
  MSF standard**: one tap rosters the standard twenty, in the catalog's order,
  and a second tap adds nothing.
- [ ] **The floor as a trainer**: the list, read-only — no toolbar, no
  switches, no unrostered machines — and **Open** on every row. As the head
  trainer: search, reorder, on/off, out of service, a custom machine.
- [ ] **The machine's door.** Open the Leg Press: the studio's standard
  settings card (the same one Learning → Catalog shows — change a value here,
  find it there), the floor's notes (the trainer's iPad can add one), Local
  set-up, Upkeep (log a wipe: Operations → Equipment shows it). The panel is a
  right column in landscape and a bottom sheet in portrait.
- [ ] **Offer to the MSF catalog** is on the studio's **own** machine only —
  not on an MSF machine, not on one adopted from another studio. Send one
  with a note: the row reads "waiting on corporate"; as an administrator the
  document is in `catalogSubmissions` with your name on it; as the head
  trainer you can withdraw it and nothing else.
- [ ] **Shared by other MSF studios.** A machine another studio shared can be
  adopted from here as a copy; the All MSF machines page now points here.

**Team**

- [ ] **People and standards** (Sep 27 2026): Round 3's Team checks, without
  who's in today or the client groups; open loops and the vault stay. The
  standing weeks come first on Team — Round 20.
- [ ] **Letting someone in.** From a fresh browser, request access naming
  this studio. On the head trainer's iPad: the request shows under the
  studio's staff with a waiting badge; the role list stops at Studio Leader
  (no Owner, no Admin); "Can manage My Studio" is a switch; if the person is on the Mindbody staff list, they are linked.
  Approve: they can sign in, the Team and Studio sections show for them only
  if the grant was ticked, and Operations does **not** open for a trainer
  with the grant.
- [ ] **A request naming another studio** does not show here; one that named
  no studio does.
- [ ] **The grant on an existing trainer.** Tick "Can manage My Studio" on
  the trainer's row and save. Their iPad now shows Team and Studio, and a
  team job they post is accepted. Untick it: gone. *As the trainer*, editing
  their own profile cannot add it (refused by the rules).
- [ ] **Operations → Staff & Roles** (as a franchise owner): the same editor,
  with Studio Owner and Owner on offer and the home studio changeable; as an
  administrator, Admin too. A head trainer never sees this tab.
- [ ] **Temporary profile.** Make one from Team; it appears in the directory
  as before.

**Two iPads**

- [ ] The head trainer changes shift hours while the trainer is on Relay: the
  Now Bar follows without a reload. Two leaders save Details at once: the
  second save writes only its own changed fields (the first's name change
  survives).
- [ ] **Old iPad (iPadOS 15/16) cold load**: My Studio draws, every section.

---

## Round 11 — Operations · *Sep 19 2026 round, branch `operations-round`*

*Monday is the Overview since Round 13; the network's focus and launch are
walked in Rounds 3 and 20, and an owner's reach in Round 22.*

The round is `docs/rounds/2026-09-19-operations.md`. None of it has been on
an iPad. Sign-ins: a **head trainer** of one studio, a **franchise owner**
who owns two, an **administrator**. The Monday page and Hours read real
sessions, so use the studio with the most Journey history.

**At the keyboard first**

- [ ] **Index, rules, suite.** `firebase deploy --only firestore:indexes`
  (one new `journalEntries` index; the console shows it building). `npm run
  test:rules` — 116 tests, the last one under "OPERATIONS". *If any fail:*
  stop, send the output. Then `firebase deploy --only firestore:rules`.
  `npx tsc --noEmit` (11 on a clean clone) and `$env:TZ="America/New_York";
  npx vitest run src` (3,372 in 220 files).
- [ ] **The watch list.** The ship script's golive runs `npx tsx
  scripts/run-machine-trends.ts --commit` last (by hand: the same line
  without `--commit` is a dry run whose summary names the studios and the
  rows it would write). In the console, `studios/{id}/watch/performance`
  exists for every studio afterwards, some with an empty `rows`.

**The scope**

- [ ] **Looking at.** Open Operations as the head trainer: the bar says the
  studio's name and offers no "All my studios" (one studio). As the
  franchise owner: **All my studios** lists their two, and no other. As the
  administrator: every studio.
- [ ] **Picking a studio switches the app.** Choose the other studio on the
  bar: the header's studio name changes, the Hub (back in trainer mode)
  shows that studio's clients. Back to Operations: still that studio.
- [ ] **Under "All my studios"**: Monday is the network view (tiles and
  tappable locations — tap one and the app switches); Hours shows a block
  per studio and a company total; Renewals, Delight, Insights, Machine fit
  and Exports each say "pick a studio" with the studios one tap away. No
  tab has a studio picker of its own any more.
- [ ] **The Franchise screen is gone** from the bottom bar; nothing it did
  is missing (its tiles are Monday under "All my studios", its team editor
  is Staff & Roles, its composer is Announcements).

**Monday**

- [ ] **The four questions, in order**: Renewals · Attendance · Performance ·
  Pain and incidents. Each has a sentence with numbers or "not enough data
  yet" / "nothing to report"; every row opens the client's profile.
- [ ] **Renewals** agrees with the Renewals tab's pipeline (the same
  "talk now" count).
- [ ] **Attendance**: a client on a break twice their usual gap shows;
  a client marked away or lapsed does not; a client with no measured rhythm
  is not claimed.
- [ ] **Performance** shows the watch rows the script wrote (machine,
  weight, reps vs median, day) — or "the weekly read has not run yet"
  before the script ran.
- [ ] **Pain**: log a session with a body region at the worst Dial position
  for a test client: they appear within the day. A critical note on a
  client shows while it is live. Before the index is built the panel says
  "part of this could not be read just now" — after, it does not.
- [ ] **The lines**: Delight (how many gestures this week), Insights (the
  14-day observations), Machine fit (worth a look), Hours this week — each
  opens its tab.

**Hours**

- [ ] **This month** shows a column per Monday–Sunday week, a row per
  trainer, the studio's total, and beside the slot hours the measured floor
  time — smaller and never added in. Change `sessionMinutes` on My Studio →
  Studio → The studio's day from 30 to 45: every figure grows by half.
- [ ] **Log a past session** for a date earlier this month: it appears in
  that week's column (not today's). One logged for last month does not
  appear this month; go back a month and it does.
- [ ] **A session with no trainer** is counted under "unattributed" and not
  in any row; an in-progress one under "open".

**Catalog** (as the administrator; as the franchise owner it is read-only —
no queue, no switches, no New machine)

- [ ] **The standard set** is a numbered list in order. Move one up: the
  list reorders and a new floor's "Adopt the MSF standard" follows that
  order. Take one out: it asks first; the floor that has it keeps it; it
  shows under "In the catalog, not in the standard" and under "No longer
  in the standard" on My Studio → Machines. Put it back in.
- [ ] **Submitted by studios**: the offer made in Round 10 is waiting. Open
  it: the catalog id is suggested from the name. **Publish**: the machine is
  in the catalog outside the standard set, the studio's row on My Studio →
  Machines reads "published", and the panel prints the migration command.
  Run it from the PC (dry run, then `--commit`): the studio's floor now
  shows the catalog machine, with its history.
- [ ] **Pass** on a second offer with a note: the studio's row reads
  "corporate passed" with the note.
- [ ] **Retire** asks every time, saying how many floors have the machine;
  Cancel changes nothing. Restore does not ask.

**Delight**

- [ ] A one-off gesture whose date has passed is at the top under **Passed —
  still open**. **Take it**: the row shows your name and "Planned". **Hand
  it to…** lists this studio's people only; pick one: their name. **Done**
  asks what happened; the sentence shows on the row once "Show what is done"
  is on, and on the client's FORD page (Notes & Profile → FORD). **Pass**
  removes it from the list.

**The fix pile**

- [ ] **Routines**: Delete asks first. **Announcements**: Take down asks
  first, naming the audience. **Insights** with a studio the sign-in cannot
  read (an owner on a studio outside their list, in the browser): "could not
  be loaded", not "no sessions were recorded".
- [ ] **Exports** has no CSV importer; the historical-migration panel says
  where past history goes instead.
- [ ] **Renewals** has Pipeline and Outcomes only; the notice says how many
  Mindbody names are waiting and **Open My Studio** lands on My Studio →
  Studio.
- [ ] **Old iPad (iPadOS 15/16) cold load**: Operations draws, every tab,
  both scopes.

---

## Round 12 — The master merge · *Sep 19 2026, `master` after `beta-prep` came in*

The round is `docs/rounds/2026-09-19-master-merge-and-trim.md`. **This round
is different from the others: almost nothing here was deliberately changed.**
The beta-prep trim renamed two feature folders (`features/planner` ->
`features/relay`, its inner `relay/` -> `board/`; `features/notes` ->
`features/client-notes`), moved every Operations screen out of
`src/components`, moved `ActiveStudioContext` into `src/contexts`, and deleted
~9,200 lines. Then My Studio and Operations, both built on the OLD paths, were
merged on top of it.

So the screens most likely to be broken are the ones **nobody touched on
purpose**. A typecheck, a full suite and a production build all passed while
two dialogs would have opened to a blank pane — see the first item.

Walk this BEFORE Rounds 10 and 11. It is short, and if the app does not boot
there is no point testing the Monday page.

- [ ] **"Log past session" and the session pop-up open and draw their
  machine picker.** Client profile -> Activity Archive -> Sessions -> "Log
  past session", then tap an existing session to open the pop-up. Both must
  show the picker, the coverage strip and the routine rows. *If it fails:*
  this is the merge's near-miss and it is back — the trim closed
  `CoverageStrip`, `MachinePicker`, `SequenceMachineRow` and `analyzeRoutine`
  on `features/routine-builder/index.ts`, and both dialogs render all four.
  Fixed in `111dc8a`; a white pane here means something reopened it.
- [ ] **Every bottom-bar tab opens, once, in order.** Hub, Clients, My
  Studio, Learning, and the Operations dashboard if your sign-in reaches it.
  *If one is blank:* a lazy import is pointing at a renamed folder. The
  console names the chunk; it will be a `features/planner`,
  `features/notes` or `src/components/Admin*` path that should have moved.
- [ ] **The client profile's four tabs and the sub-toggle inside each.**
  *Why:* `ClientProfileView` lost four `useState` declarations the trim found
  dead, and a `setSessionNotes` call for state that no longer exists. *If it
  fails:* it will throw on the first tab tap, the way the four-tab round did
  in September — error boundary, whole screen gone.
- [ ] **Start a session and open all three tracker dialogs** (the machine
  sheet, the performance entry, the history). *Why:* the trim moved all three
  into their own files.
- [ ] **Write a mid-session note, leave the machine, come back.** The draft
  survives. *Why:* `features/notes` became `features/client-notes` and the
  session-draft module moved with it.
- [ ] **Relay's three tabs** — Floor, Mine, Notes — from My Studio ->
  Relay (Network moved to Operations -> All my studios on Sep 27 2026).
  *Why:* the folder is `features/relay/` now and its inner pieces are in
  `board/`.
- [ ] **The red-flag sheet, in BOTH themes.** Start a session on a client
  with a condition or a critical note, tap the flag marker. *Why:* its scrim
  and alert icon were changed to satisfy the palette ratchet
  (`bg-foreground/20`, `dark:text-rose-400`). *Known and not yet fixed:* its
  rose and amber tints are still Tailwind palette colours rather than
  equipment tokens — if they look wrong in one theme, that is why, and it is
  already on the list.

**Machine Trends — the new screen**

Learning -> Catalog -> a machine -> **How it's used**. Folded closed by
default; opening it is what triggers the read.

- [ ] **It says something true on a busy machine.** Compound Row or Leg
  Press. Expect a sentence with clients / sets / sessions and a 90-day
  window, a load sentence in quartiles, a table per setting and a table by
  height. *If it says "Nobody has trained on this machine recently"
  everywhere:* `machineTrends/*` has never been written in production — run
  `npx tsx scripts/run-machine-trends.ts --commit` from the PC. That is the
  likely state, not a bug.
- [ ] **A quiet machine says so, in the right words.** A machine with fewer
  than five clients must read "not enough to say anything about loads yet",
  never a load. A setting value with fewer than five clients shows its count
  and "fewer than 5" where the median would be. *If a number appears
  instead:* the minimum-sample rule is broken and that is a blocker, not
  polish.
- [ ] **Open it, close it, open it again, then open another machine.** The
  read happens once per machine per session — the second open should be
  instant.
- [ ] **Both orientations, both themes.** The tables scroll sideways inside
  their own box; the PAGE must never scroll sideways.

**The permission that got narrower**

- [ ] **As a studio owner, post a notice to your own studio.** My Studio ->
  Studio -> Announcements. It must still work. *If it fails:* the narrowing
  went too far — `studioNoticeOfMine` should let a studio owner post to the
  studio they run.
- [ ] **As that same owner, confirm you cannot reach another studio.** There
  should be no picker offering one. *Why:* until Sep 19 an owner at studio A
  could post into studio B; the rules now refuse it.

## Round 13 — The Operations overhaul · *Sep 19 2026 round, branch `operations-overhaul`*

The round is `docs/rounds/2026-09-19-operations-overhaul.md`. Walk it on a
desk (a computer, or an iPad in landscape beside a keyboard) as the studio
leader AJ described — sat down, with time — and once on a portrait iPad, as
whoever runs the studio. It builds on Rounds 10–12; if the app does not boot,
stop there. The two indexes (`schedules studioId + movedFromDay`,
`journalEntries studioId + effectiveUntil`) must have finished building
before the changes list and the Moments panel can answer.

**The Overview**

- [ ] **It opens on Overview, named for the studio, dated today.** Operations
  → the first tab. The five tiles read Booked today · Done · Not completed ·
  Never logged · On the floor now. *If it fails:* the page is blank or throws
  — the week's schedule read (`useWeekSchedule`) or one of the four own reads
  (`useOverviewReads`); the console names the collection.
- [ ] **Booked today excludes a cancelled booking; "Not completed" counts it.**
  Cancel one of today's bookings in Mindbody, wait for the sync (Mindbody →
  pull the schedule now if you are impatient). Booked drops by one, Not
  completed rises by one, Changes today gains a row.
- [ ] **Never logged is the loud tile, and tapping it lists who to chase.** A
  booking whose slot ended five minutes ago with no Journey session for that
  client that day (Round 16): the tile is red, the foot says "tap to see who to chase", the list names the client,
  the trainer and the time, and the name opens the client.
- [ ] **Needs you counts every action on the page and jumps to it.** Tap a
  chip: the page scrolls to that panel and unfolds it if it was folded. "Notes
  to review" opens the review dialog instead.
- [ ] **Every panel has a sentence, rows and a door.** Changes today → "The
  week" (the Changes view); Attendance watch → "The whole list"; Renewals →
  the tab; Moments → the Delight queue; Team → Insights. *Why:* the brief —
  a summary layer, each panel drilling into its own tab.
- [ ] **A folded panel keeps its sentence and stays folded after a reload.**
  The chevron on any panel; reload; it is still folded (this device only).
- [ ] **On a desk the panels sit in two columns; on a portrait iPad they
  stack** — Changes, Next three days, Pain, Renewals, Attendance, Moments,
  Strength, Team. Nothing is cut off; no horizontal scroll.

**Changes**

- [ ] **A cancellation lands on the day the session was for.** Cancel a
  booking for the day after tomorrow: today's Changes panel does not change;
  the week's line says one more; the Changes view's strip shows it under
  that day. *Why:* AJ — a Wednesday cancellation of Friday's session waits in
  Friday's list.
- [ ] **A cancellation with another booking that week reads as a
  reschedule** — "Cancelled 9:00 AM with Tom — but booked Thu 2:00 PM with
  Sara, so read it as a reschedule." Cancel one of a client's two bookings
  this week and check the wording; cancel the only booking and it reads
  "Cancelled — … Nothing else booked this week."
- [ ] **A moved booking says where it went.** Move a booking's time in
  Mindbody: after the sync, the day it left says "Moved — was 10:00 AM …,
  now 2:00 PM …"; the day it landed on shows nothing (it is simply booked
  there).
- [ ] **The calendar shows none of it.** The cancelled row is gone from the
  Calendar tab, not greyed.
- [ ] **A cancellation the webhook delivered shows without a time** ("When it
  changed was not recorded.") — expected until the Cloud Function stamps.

**Pain and critical notes**

- [ ] **Acknowledge takes a row off the list; Acknowledge all takes them
  all.** Write a critical note on a client, come back: the row is there with
  its Acknowledge button. Acknowledge it; it leaves; the sentence says "1
  already acknowledged". A second iPad on the same Overview sees it leave
  without a reload.
- [ ] **A head trainer can acknowledge, as themselves.** The rule lets anyone
  who works at the studio acknowledge (AJ: visible to anyone who can open the
  Overview, not leadership only); the acknowledgement names them. *Why:* a
  trainer cannot open Operations today (head trainer and above), so the rule
  is wider than the door on purpose.
- [ ] **A new incident on the same client comes back.** After acknowledging,
  log a new incident: a new row.

**The attendance watch**

- [ ] **The studio's number is on My Studio → Studio, in AJ's words** —
  "Warn me when a client has not visited for (days)" — and the panel's
  sentence quotes it ("the studio's 14-day line").
- [ ] **Snooze offers 3 days · 1 week · 2 weeks · On that day, and the row
  leaves until then.** The whole list shows it under Snoozed with "Put back on
  the list".
- [ ] **Dismiss takes the client off; a booking afterwards brings them back
  once.** Dismiss a quiet client, then book them in Mindbody; after the
  nightly job (or the next morning) the panel shows "Back — booked again for
  …" with Got it; Got it clears it.

**Moments and the next three days**

- [ ] **A note pinned to a day shows as a moment on its day.** On a client,
  Note → "Pin to a date" → a date within the week, Every year → save. The
  Moments panel lists it with the day and who wrote it; next year it comes
  back.
- [ ] **A milestone is only claimed when the total may be quoted.** A client
  with a prior-history record and a booking that would be their 100th
  session shows "Their 100th session"; a client with no record and 99
  Journey sessions shows nothing. *Why:* the migration rule — never off a low
  Journey count.
- [ ] **The next three days are the next three WITH bookings.** On a Saturday
  with a closed Sunday: Mon · Tue · Wed, not Sun.
- [ ] **A client booked tomorrow with a live critical note is named** under
  Tomorrow ("1 with a live note: …").

**Notes**

- [ ] **The Note button on the client's header opens the composer over any
  tab**, saves, and the note is on Notes & Profile — where Notes now sits
  above the profile.
- [ ] **A critical note with "From – until" leaves the briefing after its last
  day; an "Only on a day" note shows on its day only.** *Why:* one mattering
  rule for the briefing and the Overview.
- [ ] **A note older than 60 days with no end comes up for review.** Back-date
  a critical note's "Starts mattering on" to 61 days ago (or wait): the
  Overview's Pain panel shows "1 note has mattered 60+ days — review"; Still
  matters keeps it and the line goes; No longer resolves it.

**The nine tabs, and the Admins dashboard**

- [ ] **Nine tabs, four groups, as a studio leader:** Overview · Renewals ·
  Delight queue · Floor · Staff & Roles · Insights · Announcements · Mindbody
  · Data. No All locations, Catalog, Limbo, Bug reports or System tools.
- [ ] **Floor edits the floor — the same editor as My Studio → Machines.**
  Retire a machine on Operations → Floor → Machines; it is retired on My
  Studio → Machines too. Machine fit and Routines on the same segmented
  control; the Overview's Machine fit line lands on Machine fit.
- [ ] **Insights has Hours inside** (the segmented control), and the Overview's
  Hours line lands there.
- [ ] **Mindbody, as a leader, is your own studio only** — no estate tiles, no
  studios list; the link, last sync, pull the schedule now, the event log.
  As an administrator, the estate is back.
- [ ] **Announcements, as a studio leader, offers "One studio" only;** as an
  owner, the network too; as an administrator, everyone.
- [ ] **The app-mode switch has a third position, Admin, for administrators
  only,** and the bottom bar a second button. The Admins dashboard lists All
  locations · Catalog · Standard template · Limbo · System tools · Bug reports
  · Data. As a studio leader neither exists.
- [ ] **The Standard template holds the standard set and the company
  routines; the Catalog holds every machine and the submissions queue.**
  Moving a machine in the set renumbers in tens, as before.
- [ ] **Data, on the Admins dashboard, asks for a studio first;** on
  Operations it is the studio you are in.

---

## Round 14 — The client codex · *Sep 24 2026 round, branch `client-codex`*

The round is `docs/rounds/2026-09-24-client-codex.md`; the screens are
Notes & Profile's seven pages. Walk it **signed in as a Life Transformer at
the client's home studio, not as an administrator** — an administrator could
always read FORD, which is how nobody noticed that trainers could not. Walk
it at 744 or 834 upright (most of the studio iPads), once in landscape, and
once in dark mode. Nothing on it needs an index or a rules deploy. Have three
clients ready: a **migrating** one (a FileMaker record, sessions before
Journey), a **brand-new** one, and one with a knee flag, a Pulse and two
InBody scans.

**Before anything else: a cold start**

- [ ] **Reload the app and go straight to a client, without starting a
  session.** Notes & Profile → FORD → Remember something. *Expected:* the
  dialog is styled — the four letter buttons, the box, Save. *If it is plain
  unstyled text:* the stylesheet trap in `docs/KNOWN-TRAPS.md` → Layout and
  CSS (a component must import the stylesheet it draws with).

**The bar and the Overview**

- [ ] **The tab opens on the Overview, every time,** whichever page you left
  it on. Seven segments; at 744 and 834 upright "Body & Pulse" and "Goals &
  Focus" take two lines and nothing is cut off; ‹ › and the Next card move
  through the pages in order, and Account's Next is "Done".
- [ ] **The Overview's six slots, for the migrating client:** Notes across
  the top, Who she is · FORD, Body & Pulse, Goals & Focus, Story ("With Max
  Strength since …" with the FileMaker sessions), Account. Nothing says
  "new" or "First session.".
- [ ] **For the brand-new client:** "No notes in Journey yet.", "No line
  yet." with **Write one**, each pillar "Nothing on file yet." with its Ask,
  "No Pulse saved in Journey yet.", "Her why isn't written down yet."
- [ ] **Write one opens the line's editor with the cursor in the box** — no
  second tap on "Write the line". *Watch the keyboard:* iPadOS raises it only
  for a focus made inside the tap itself, and this one lands a moment later,
  after the page changes; if the keyboard waits for a tap on the box, note it
  (the Overview's "Write a note" works the same way). Type a sentence, Save;
  back on the Overview it leads the FORD slot with "Written by the team ·
  last by {you}".
- [ ] **Every door lands:** a pillar tile opens FORD at that pillar; a note
  row opens Notes on that thread; Write a note opens the composer; tapping
  Body & Pulse, Goals & Focus, Story or Account anywhere on the slot opens it.

**One Save bar**

- [ ] **Edit on FORD → Occupation**, pick Retired: the bar says "1 unsaved
  change · FORD · Occupation" from any page, even Account. Show goes back;
  Discard reverts; Save saves and the bar goes.
- [ ] **A saved wingspan shows** on Body & Pulse → Build (it never did
  before).

**Notes**

- [ ] **A critical note shows once**, as the red line under the bar on the
  other pages and in full on Notes. Filter to Equipment on a client with a
  critical injury note: the red line says so, with "Show it".
- [ ] **FORD / Life keeps the words:** type a sentence, pick FORD / Life,
  Save to FORD — it lands on FORD, not in the notes.
- [ ] **A Standing row opens in place**; "Show the N resolved notes" works;
  a Standing row's kind wraps at a space, never mid-word.

**FORD**

- [ ] **Coming up leads with her Mindbody birthday** ("Her 69th birthday · In
  17 days"); tap it and the dialog opens as an annual Family "Birthday" with
  the gesture open.
- [ ] **Follow up next time:** in a detail, type a question and Save — Ask
  next shows it with your name; "Asked it" → save an answer: a new detail,
  and the question goes. Edit only the sentence of a detail: the date under
  its question does not change.
- [ ] **A second trainer at the same studio rewrites In one line:** their
  name replaces yours.
- [ ] **On an 11-inch in landscape, with the keyboard up**, the detail dialog
  scrolls and Save is reachable.

**Body & Pulse**

- [ ] **The knee client:** the diamond sits between the knees, the ring on
  her side; tap Knee and the sentences open. Watch-outs quote the clinical
  list; a machine chip opens its window.
- [ ] **Over time:** the recovery lane has a bar at each session where the
  door question was asked, none where it wasn't; an imported client's lede
  says imports don't record the door (never "wasn't asked"). Turn the iPad:
  it redraws.
- [ ] **InBody:** a change smaller than the studio's variation reads "within
  normal variation", uncoloured; the shaded band sits around her first scan.
- [ ] **Update Pulse**, answer one area, Done: the answer shows with today's
  date. Hand to client opens the client's sheet.
- [ ] **No "Recovery between sessions" dropdown** anywhere.

**Goals & Focus, Story, Account**

- [ ] **Goals & Focus:** How to coach her leads with the coach strategy (the
  same first paragraph Body & Pulse's strip shows); a coaching row opens the
  thread on Notes; set a focus, check in on it.
- [ ] **Story:** the since line matches the header's numbers; filter to Life:
  only FORD moments.
- [ ] **Account:** the ID card has no Sync button (the header's is the only
  one); the package shows what is left; the fine print's Migration Hub
  switches to Journey. A client with "Occ:", "Med:", "Activity:" and "Goals:"
  in the Mindbody notes: each line is its own row; Add to Recreation lands on
  FORD "from the Mindbody account notes"; Add as medical history stages on
  the Save bar.

**Who sees what**

- [ ] **As a trainer from a cross-train studio:** "Read only here · {home}
  keeps this record. Notes you write still save." — no Edit, no Save bar, no
  Migration Hub, and no FORD anywhere (the FORD page and slot say whose FORD
  it is); a note still saves.
- [ ] **As an administrator who works at another studio** (AJ): FORD reads,
  and the FORD page says "Only a trainer at her home studio can add to FORD,
  so adding isn't offered here." — no Remember something, no pillar Add, no
  Save to FORD on Notes or in the header's Note dialog; editing a detail that
  is on file still works. On Notes and in the Note dialog, FORD / Life reads
  "Personal details are kept in FORD. Only a trainer at the client's home
  studio can add to it, so saving there isn't offered here." beside Open
  FORD — never "which only the client's home studio can read", which is the
  cross-train trainer's sentence.

**The floor and Operations, which share pieces with the codex**

- [ ] **Active Session → the notes sheet:** its small lines read at one size,
  and a refused save says "Not saved — still here, try again".
- [ ] **My Studio → Studio → InBody: the scanner's normal variation** (a
  leader): change a number, Save, and the Renewal Brief's InBody line and the
  pipeline's proof line follow it; "Use Max Strength's defaults" puts them
  back.
- [ ] **The briefing** for a retired client with nothing under Occupation
  never asks about work.

## Round 15 — Signing out and the Operations gate · *Sep 24 2026, branch `claude/nifty-archimedes-139384`*

What changed is in `src/features/sign-out/README.md` and
`src/features/admin/operations-access.ts`. You need **one iPad and two
accounts**: a studio leader (or yourself) and a Life Transformer. Nothing here
could be walked in Claude's browser, because signing out there would have
signed AJ out of his own session — this is the only place it gets checked.

**Signing out hands the iPad over**

- [ ] **A leader on Operations signs out; a trainer signs in and lands on the
  Hub.** As the leader: open a client's profile, then switch to Operations,
  then Log Out Facility. Sign in as the trainer. They see the Hub, the
  trainer bottom bar (Hub · Client · Start Session · Learning · My Studio ·
  Calendar), and no Operations anywhere. *If it fails:* the trainer lands on
  Operations or on the leader's client — the keyed tree in `App.tsx`
  (`personKey`) did not remount.
- [ ] **The Client tab opens the directory, not the leader's client.** *If it
  fails:* the selected client survived the sign-out.
- [ ] **A pinned iPad still opens its studio for the next trainer** — if they
  work there. Pin the studio on the picker, sign out, sign in as a trainer
  from that studio: no picker, straight in. As someone from another studio:
  the picker, not the pinned studio.
- [ ] **My Studio opens on Relay for the trainer** even if the leader left it
  on Team or Studio.
- [ ] **A note started mid-session survives.** Start a session, type a note,
  close the sheet without saving, sign out and back in as the same trainer,
  resume the session: the words are still there (they belong to the session,
  not the person).

**Switch Trainer**

- [ ] **Switch Trainer goes to the sign-in screen,** not to "is not
  registered as an authorized trainer". *If it fails:* the old
  `handleTrainerLock` is back.
- [ ] **Google asks which account.** Tap Sign in with Google after Switch
  Trainer: the account chooser appears, rather than signing the last person
  straight back in.

**The Operations gate**

- [ ] **The Demo Mode door is shut.** As the trainer: choose Demo Mode, open
  Operations from the menu (it is offered there), then the gear → tap the
  studio name → choose your real studio. You land on the Hub with the trainer
  bottom bar; there is no Operations button. Go back into Demo Mode: still the
  Hub, until you choose Operations again. *If it fails:* `useGuardedPlace` is
  not holding the view.
- [ ] **A studio leader is unaffected:** Operations opens from the menu, from
  the studio picker's button and from the gear's "Open Operations", at every
  studio they lead, and stays open when they switch studio.
## Round 16 — Done means logged in Journey · *Sep 24 2026, branch `claude/booking-completed-by-journey`*

AJ: a booking is Completed, for Operations, when a session was logged in
Journey for that client that day. Mindbody's own marking stays manual. The
round document is `docs/rounds/2026-09-24-done-means-logged.md`. Needs a real
booking today and a trainer who can run a session for that client.

- [ ] **Logging a session moves the booking to Done.** Operations → Overview
  with a booking whose slot has ended and nothing logged: it is on Never logged
  (tap the tile — the client is on the chase list). On an iPad, start and end a
  session for that client. Within a few seconds, without reloading, Done rises
  by one, Never logged falls by one, the client leaves the chase list and Team
  this week's "Unlogged today" for that trainer drops. *If it fails:* the live
  read of today's sessions (`useTodaySessions`); check the session's studio is
  the one the Overview is on.
- [ ] **A session left open is still chased.** Start a session and do not
  press End Session; once the slot is five minutes past, the booking is on the
  chase list. Ending it clears it.
- [ ] **Nothing is chased by name.** A booking whose client has no Journey
  profile (the Hub's "not synced" card) stays never logged even if a session
  was logged for someone with the same name.
- [ ] **The trainer page's Upcoming lists only what is ahead.** Open your own
  trainer page (the avatar): no booking from yesterday or from earlier today;
  the one in its slot right now is listed first; a client whose session you
  have already ended today is gone.
- [ ] **The attendance watch does not change until a studio's cutover is
  set.** With no Journey cutover date on the studio (My Studio → Studio, or
  Admin → All locations → the studio), the watch reads as before; the field's
  hint says what setting it will do. Once a cutover is set, a past booking with nothing
  logged in Journey stops counting as a visit from the next nightly run.

**The Hub card (phase 6).** Needs a client with a flag on the card (the Pulse
heart or the clinical dot is easiest) booked today. Portrait and landscape.

- [ ] **A late start keeps the flags.** Past the booking's start time with no
  session started, the card is still white and still shows its flags. The
  old card went grey at the start time and dropped them. *If it fails:* the
  card's state (`lib/hub-card-state.ts`).
- [ ] **Ending the session fades the card.** Start and end a session for
  that client: within a few seconds, without reloading, the card fades and
  its flags go, even if the slot is not over.
- [ ] **A slot nobody logged says so, quietly.** Five minutes after a
  booking's slot with nothing logged, the card is faded with a small grey
  "NOT LOGGED". Tapping it opens the client. A card with no profile (the
  cloud mark) never says it.
- [ ] **A second booking the same day keeps its flags until it starts.** A
  client with two bookings today and the first one logged: the later card
  stays white, with its flags, until its start time.

## Round 17 — The packages screen · *Sep 24 2026, branch `packages-screen`*

AJ: packages are not decided in the consultation, so a client with no
package on file gets the package information on the post-session screen.
The round document is `docs/rounds/2026-09-24-packages.md`. Needs a client
with no package in Mindbody (a prospect on a free workout is ideal) and, for
the last item, a studio leader.

- [ ] **The card appears for a client with no package, and only then.** End a
  session for a client Mindbody shows with no package: below the note and
  FORD trays, "Packages at {studio}" with one sentence ("Mindbody showed no
  package for Judy when it was last checked, Sep 23."). For a client with a
  live package the card is absent and the Renewal conversation button is
  there instead. *If it fails:* `features/packages/package-standing.ts`.
- [ ] **A long-standing client gets the door, never a price list on this
  screen.** For a FileMaker-era client with no package on file: the sentence
  and Walk through the packages, and no dollar amounts on the card itself.
- [ ] **Walk through the packages opens the sheet on 12 months, marked as
  your recommendation.** The three lengths side by side; Committed pressed and
  labelled with your first name. Nothing says "most popular".
- [ ] **Every price is the studio's own.** Compare the three lengths with My
  Studio → Studio → Renewals. A studio that never saved a table reads "Max
  Strength's standard prices" under the title.
- [ ] **Show the price as, and Paying.** A session / A week / Each payment
  change every column and the big price. In full: the third pick reads "Paid
  once", the big number is the whole amount once, the saving is said, and the
  every-4-weeks steps disappear.
- [ ] **The trainer notes never share the screen with the client's view.**
  Trainer notes swaps the whole body: your recommendation (move it, clear it),
  If money is the worry in AJ's order, the Academy's lines, These prices. Back
  to the packages returns. On the client's view none of it is visible.
- [ ] **Life happens.** Tap + four times: "4 weeks", the timeline hatches four
  weeks, the sentence says the sessions take about 52 weeks and never expire.
  The stepper stops at 0 and 16.
- [ ] **After your last payment says only what the studio said.** With the
  package's "When the payments finish" not set: "{studio} will explain what
  happens when your payments finish." As a leader, set Committed to "It renews
  automatically" in My Studio → Studio → Renewals and save; reopen the sheet:
  "When the payments finish, Committed renews automatically", and Life
  happens says it renews at week 48.
- [ ] **Portrait and landscape.** One column on a portrait iPad (the lengths
  still side by side), two in landscape; nothing cut off; every button easy to
  hit. Light and dark.
- [ ] **Two small fixes on the post-session screen.** A long machine name in
  Today wraps instead of ending in "…"; the dose Dial shows "Saved" only after
  it really saved (turn the iPad's wifi off, tap a dose: no "Saved").

## Round 18 — A cross-train visitor finishes her session · *Sep 24 2026, branch `packages-screen`*

Before this release a trainer at another studio could open a cross-train
client and start her session, but Finish saved nothing. The fix is in the
rules and in Finish; the entry is `docs/KNOWN-TRAPS.md#cross-train`. Needs a
client approved to cross-train at a second studio, and a Life Transformer
whose home is that second studio.

- [ ] **The visitor's session saves.** Signed in as the visiting trainer, at
  the second studio: start the client's session, log two or three machines,
  Finish. The Wrap-up appears with no error, and her Activity Archive
  (on either iPad) shows today's session with its sets.
- [ ] **Her totals moved too.** On her profile the session count went up by
  one and the last session is today; on the next session, the machines you
  logged start from today's weights. *If the toast "Session saved. {name}'s
  session count and last-time numbers didn't update." shows:* the rules on
  the live project are older than this release - redeploy them.
- [ ] **The visitor's Pulse lights the red flag.** As the visiting trainer,
  finish a Pulse for her with a red answer (Notes & Profile -> Body & Pulse).
  Her card on the Hub shows the red-flag chip, at either studio.
- [ ] **The visitor still can't edit her record.** As the same visiting
  trainer, open Notes & Profile: "Read only here · {home} keeps this record.
  Notes you write still save." - no Edit, no Save bar.
- [ ] **Her home studio is unchanged.** As a trainer at her home studio, the
  record edits and saves as before, and a session there finishes as before.

## Round 19 — A Critical note marks the Hub card · *Sep 24 2026, branch `claude/brave-engelbart-790628`*

AJ's answer to question 12 of the Sep 20 audit: the red triangle beside the
name, for every trainer, from the day's notes. The round document is
`docs/rounds/2026-09-24-hub-critical-flag.md`. Walk it **signed in as a Life
Transformer**, portrait and landscape, on the Hub with today selected. Have a
client booked today and one booked tomorrow. Nothing to deploy first.

- [ ] **A Critical note marks the card, live.** Open a client booked later
  today, tap **Note** in the header, pick a category, write a sentence, set
  it to **Critical**, Save.
  Back on the Hub, without reloading, the small red triangle is beside her
  name within a few seconds. *The card's left edge stays blue* (orange on a
  milestone) — it never turns red. *If it fails:* the day's read
  (`hooks/useHubCriticalNotes.ts`) or the rule (`lib/hub-critical-notes.ts`).
- [ ] **Closing it clears the card.** On her Notes, close the thread: the
  triangle goes from the Hub card. Reopen it: the triangle comes back.
- [ ] **A note that starts tomorrow.** For a client booked today AND tomorrow,
  write a Critical note with **From – until** starting tomorrow. Today's card
  has no triangle; tap tomorrow in the day strip: that card has it.
- [ ] **Red for everyone.** On her briefing, tap "No need to remind me" on the
  note: the Hub card keeps its triangle. A second trainer's iPad shows it too.
- [ ] **Heads up does not mark the card.** A Heads up note on another client:
  no triangle.
- [ ] **Late, then logged.** Past her start time with no session started, the
  triangle is still there. Start and end her session: the card fades and the
  triangle goes with the other flags.
- [ ] **A visiting client** (if one is booked here from another studio): a
  Critical note written on her profile at her home studio marks her card on
  this studio's Hub.

## Round 20 — The voice review and the standing week · *Sep 27 2026, branch `claude/wizardly-davinci-x3onwn`*

AJ's notes from the voice review of the Screen Atlas, and the standing week
he asked for after it. The round documents are
`docs/rounds/2026-09-27-voice-review.md` and
`docs/rounds/2026-09-27-standing-week.md`. **Deploy the rules first**
(`npm run test:rules`, then `firebase deploy --only firestore:rules`): the
standing week's collection is new, and without its rules My Profile and Team
say "the new database rules may not be deployed yet". Walk it with a Life
Transformer's iPad and a head trainer's, portrait and landscape. What the
voice review follow-up changed since (the Wrap-up's tray, days away, a
colleague's card, offline, the new names and looks) is walked in Round 22.

**The Wrap-up and its two notes**

- [ ] **End Session's box is for the next trainer.** End a session: the box
  reads "Note for the next trainer (optional)". Write a sentence and end it.
  Open that client's briefing from another session start: the note is there
  as a Heads up.
- [ ] **The Wrap-up's own note stays on the profile.** On the Wrap-up (the
  kicker says "Wrap-up · session saved"), write a Profile note at Note
  loudness: under it, "Stays on {her name}'s profile. The next trainer's
  briefing won't show it." Leave, open her Notes: it is there; start her next
  session: the briefing does not show it. Set a second one to Heads up: the
  briefing shows that one.
- [ ] **Nothing says "briefing" after a session.** The Wrap-up, the journal
  card's origin ("Wrap-up") and the progress report archive ("· wrap-up").
  "Briefing" appears only before a session.

**What moved**

- [ ] **The packages sheet looks right after Relay has been open.** Open My
  Studio -> Relay, then a Wrap-up for a client with no package -> "Packages at
  {studio}": the sheet's rows and buttons are its own, not Relay's cards.
- [ ] **Launch an initiative with the defaults.** As a franchise owner, under
  Operations -> Overview -> All my studios, launch one leaving "No date" and
  "No number": it posts at every studio (it used to fail at 0 of N).
- [ ] **No Network tab in Relay, no ranking of studios anywhere** (Round 3,
  the network check).
- [ ] **The profile's four tabs** run Journey · Programming · Notes & Profile ·
  Activity Archive, in that order.

**Settings and Learning**

- [ ] **Settings reads plainly.** Tap the gear (its label is "Trainer
  Settings"): My account shows the role's name ("Life Transformer", "Head
  Trainer", "Studio Leader"), never "HeadTrainer"; Mindbody says Linked, or "Not linked — a
  studio leader links you on My Studio → Team", readable in both themes. My
  studio says how many people are on the team and no machine count.
- [ ] **Open Operations opens Operations mode.** As a head trainer, Settings ->
  Open Operations: the Operations bar is underneath and the menu's App Mode
  says Operations. As a Life Transformer: no Operations card at all.
- [ ] **Learning's warnings are the app's caution colour.** Learning -> Catalog
  -> a machine with clinical warnings: the box is plum, not amber, in light
  and dark. Every Save in Learning and on the studio setting sheet (a wiki
  page's Save, "Save for this studio", "Save notes", Post) is solid blue with
  readable words in light and dark (since Sep 27 2026; they were orange), and
  orange appears only on the Learning brand mark. A flagged machine is plum
  on its badge and in its Upkeep card.

**The standing week — the trainer (My Profile)**

- [ ] **The card is on your own profile, at your studio.** Open your own
  profile: **My standing week** with the studio's name, "Not proposed yet."
  (A colleague's profile can't be opened in the app since Sep 26 2026: their
  agreed week is on My Studio → Openings → Who's usually in, Round 23.) *If
  it says the rules may not be deployed:* deploy them.
- [ ] **Build a week.** *(Words since the Openings round: "Hours" is **Add
  a block**, up to three a day, and "Outside the day's hours" is "Outside when
  they take clients"; Round 23 walks the three blocks.)* Tap **Hours** on
  Monday (7:00 AM – 1:00 PM), then on
  Tuesday: Tuesday copies Monday. Change Monday's start to 1:30 PM: the end
  moves after it. The end list only offers times after the start. Tap
  **Regular** on Monday, pick a time, type the first three letters of a
  client's name, tap her: she is under Monday. Set her to 2:30 PM: "Outside
  the day's hours" shows. Everything is 40px or bigger.
- [ ] **Leaving mid-edit asks first.** With the week edited and not
  proposed, tap Hub: the app asks about "your standing week".
- [ ] **Propose it.** Tap **Propose this week**: "Proposed." and the status
  reads "Proposed on {today}. Waiting for a studio leader to agree it."
  Reload: it is still there.
- [ ] **Take it back.** Tap **Take back my proposal**: "Not proposed yet."
  Propose it again for the next checks.

**The standing week — the leader (My Studio -> Team)**

- [ ] **Standing weeks is the first panel on Team.** "{Name} has a week
  waiting to be agreed." People are listed by name, not by who is waiting.
  The trainer's iPad has no Team section.
- [ ] **Agree it as it stands.** Tap **Review** on that person: their week in
  the editor. Tap **Agree this week**. On the trainer's iPad, without
  reloading: "Agreed by {you} on {today}."
- [ ] **Agree it changed.** On the trainer's iPad, move one regular to
  another day and propose the change: the status says a change is waiting,
  with "Moves {her} from … to …". On Team, **Review** shows the same line.
  Remove a regular in the editor: the button reads **Agree it as changed**.
  Agree it: the trainer's card says "Agreed", and the removed regular is gone
  from their editor too.
- [ ] **The next seven days.** *(Since the Openings round, Team lists none of
  this: it shows one line with a door, and My Studio → Openings → Next 7 days
  lists the free and moved regulars. A slot someone else is booked in is
  shown nowhere. Walk it there, Round 23.)* Give an agreed week a regular who IS booked
  this week at that time with that trainer: nothing is listed for her ("All N
  agreed slots are booked as usual"). Give it a regular who is NOT booked
  that day: "{Trainer}'s {day} at {time} is open: {her} isn't booked for it."
  with a **Free slot** badge. In Mindbody, MOVE her booking to another day
  that week and wait for the sync: the line says she is booked then instead.
  A booking she already had another day that week is never called her move
  (the slot just reads open). Book someone else in her slot: it says who.
- [ ] **Can't tell is never open.** On a studio whose Mindbody is not linked:
  it says the week can't be checked. Turn Wi-Fi off before opening Team: it
  says "Reading the week's bookings…", then within 15 seconds "Can't tell:
  this iPad can't reach the week's bookings just now…" and lists no slot as
  open (this failed before Sep 27 2026: the cached bookings were read as the
  week).
- [ ] **Remove a week.** **Change** on a person -> **Remove this week** asks
  first; **Remove it** takes the week away on both iPads.
- [ ] **Nothing reached Mindbody.** In Mindbody, the trainer's schedule and
  the client's appointments are exactly as the front desk left them.

---

## Round 21 — A new version, picked up safely · *Sep 26 2026, branch `new-version`*

What an open Journey does when a new version is pushed. The round document is
`docs/rounds/2026-09-26-new-version.md`. Walk it at the **next real deploy**
(any push to `master`), with two iPads open on the live app before the push:
one in Safari, one from the Home Screen icon if you have it. Nothing to deploy
first. Wait for Render to say the deploy is live before each step.

- [ ] **Left on the Hub.** Lock an iPad on the Hub before the push. After it,
  unlock it: a moment of loading, then the Hub again. (A bug report sent from
  it afterwards carries the new build's name as `appVersion`, for whoever
  reads the report.) *If it doesn't load:* `useNewVersion`, the Hub moment.
- [ ] **Left on a profile.** Leave the second iPad on a client's profile over
  the push, then lock and unlock it. The line under the header reads "A new
  version of Journey is ready. It loads by itself next time you're on the
  Hub." with **Load now**. It is not red and makes no sound. Tap Load now:
  the same profile comes back.
- [ ] **A screen not opened yet.** On an iPad that has been open since
  before the push, open a screen it hasn't opened since (the calendar, say,
  or Learning). *Pass:* a moment of loading, then that screen. *Fail:*
  "Something went wrong".
- [ ] **Mid-session.** Start a Demo Mode session, then push. The Active
  Session carries on untouched, with no line and no reload. Open Pulse: it
  opens (it was fetched when the app opened). Finish, then tap Back to Hub: a
  moment of loading, then the Hub.
- [ ] **Your session open, elsewhere.** With your session still running, go
  to another client's profile over a push. The line says "It will load after
  your session with …" and offers nothing to press. Go back and finish the
  session, and the Hub loads the new version.
- [ ] **Typing.** Type into a client's record without saving, then tap Load
  now: the app asks "You have unsaved changes to …". Keep editing keeps it,
  and Leave loads the new version.
- [ ] **No connection.** With Wi-Fi off, lock and unlock on the Hub: nothing
  reloads, and there is never a blank screen. Wi-Fi back on, lock and unlock
  again: it loads.

---

## Round 22 — The voice review follow-up · *Sep 27 2026, branch `voice-review-followup`*

AJ's answers to the audit of the voice review, built in seven units. The round
document is `docs/rounds/2026-09-27-voice-review-followup.md`. **Deploy the
rules first** (`npm run test:rules`, then `firebase deploy --only
firestore:rules`): without them a trainer's days away do not save. Walk it on
two iPads, a **Life Transformer's** and a **head trainer's**, and sign in as a
**franchise owner** for the network and Staff & Roles checks. Do every screen
**portrait and landscape, light and dark**: several of these were checked only
in headless Chrome, and My Studio's dark mode has never been looked at.

**At the keyboard**

- [ ] **The unused index is gone.** Firebase console → Firestore → the named
  database `ai-studio-32cbbdcc-6e08-4770-9665-867c68878efa` → Indexes: no
  `taskInstances` index on `status` and `localDate` (delete it by hand if it
  is there). If the CLI ever offers to delete indexes that are not in the
  file, the answer is N.

**The Wrap-up and its two notes**

- [ ] **The Note for the next trainer is filed, never discarded.** End a
  session with a sentence in "Note for the next trainer". On the Wrap-up the
  To-file tray shows it labelled "Note for the next trainer · on the next
  briefing", with category chips and **no Discard** (any other loose note
  still has Discard). File it under a category, then open that client's
  briefing from another session start: the note is still there as a Heads up.
- [ ] **It shows once on Notes.** Open the client's Notes & Profile → Notes:
  the note is there once, with no read-only "Session summary" card beside it.
  If it is still unfiled there, the Notes page's To-file tray labels it the
  same way and offers no Discard.
- [ ] **The Wrap-up reads on the light theme.** Light theme: the dose Dial,
  Loudness and the To-file tray are light and readable ("How did it land?",
  "Your read" and "How loud?" are dark words, never white on white), and "Save
  note" is solid blue. Dark theme: as it was.
- [ ] **The confetti stays, and stays out of the way.** It bursts once as the
  Wrap-up opens, for about a second, in both themes; a tap straight away
  still works, and it doesn't come back.

**The profile's words and doors**

- [ ] **Past sessions on the Hub card.** The button reads "Past sessions" on
  two lines with nothing cut off, portrait and landscape, and opens that
  client at Activity Archive → Sessions. Open the same client again from the
  directory: it opens on Journey.
- [ ] **The InBody task lands on the InBody card.** A Relay InBody task opens
  Notes & Profile → Body & Pulse, scrolled to the InBody card (Add scan).
- [ ] **Back to Reports.** Build a progress report and tap "Back to Reports"
  (or the back arrow): the profile opens at Activity Archive → Reports, with
  the report on the shelf. Open the client again from the Hub: Journey.
- [ ] **A refused move leaves nothing behind.** Type into a client's record
  without saving, then tap Past sessions for another client and choose Keep
  editing. Later open that other client normally: it opens on Journey, not on
  Sessions.
- [ ] **Edit in Body & Pulse.** On a client with clinical flags, the strip's
  button reads "Edit in Body & Pulse", is a comfortable tap, and opens the
  watch-outs card.
- [ ] **The messages.** During a session, change a setting on the machine
  sheet: "Logged to the machine's history (Programming → All Machines)". The
  profile's tab row looks as it did, in both themes.

**The network (as a franchise owner)**

- [ ] **Every network that holds your studio.** Under Operations → Overview →
  All my studios, Focus this quarter is offered for a network that holds one
  of your studios even if it doesn't name you as its owner.
- [ ] **Set by, and no stray dot.** At rest the Focus editor reads "Set by
  {name} on {date}." (the studio's day). Save a focus with only "A line for
  the floor": the Floor's banner reads "This quarter" with no dot after it.
- [ ] **Nothing real inside Demo Mode.** In Demo Mode, the foot of the
  practice studio's Overview says "Demo Studio is not in a network" and offers
  no real network's focus; Launch an initiative posts at the practice studio
  only.

**Team, Staff & Roles and who works here**

- [ ] **Staff & Roles is read-only for a head trainer.** As the head trainer,
  Operations → Staff & Roles lists the studio's people with no editor and a
  button "Open My Studio → Team"; it lands on Team with the trainer bottom
  bar, not Operations'. As a franchise owner the editor is still there, and
  under All my studios only your studios are listed. Accounts read "Has an
  account" until a studio's Mindbody list has been read, never "No Mindbody
  match" before.
- [ ] **Head Trainer.** A head trainer's role reads "Head Trainer" in
  Settings, on Team and in Staff & Roles. The studio tier's picker offers Life
  Transformer, Head Trainer, Studio Leader; an owner's also offers Studio
  Owner and Franchise Owner. The grant's hint reads "Opens Team and Studio at
  {studio}, and lets them change its machines…".
- [ ] **Everyone who works there.** A trainer who also works at this studio
  (not their home) has a card on Team, is counted in an initiative's "N of M",
  appears in Capture's and the job composer's people pickers, and is counted in
  Settings' "N people on the team", which matches Team.
- [ ] **Name order.** An initiative's roll-up on Relay's Floor and on Team
  lists people alphabetically, never whoever has done least first.
- [ ] **Open loops.** Report a machine on the shift list: it stays on Team's
  Open loops for the week, once, with the day it was reported. Do the same
  check clean on a later day: it goes. A machine the Floor Map already flags
  is not listed twice.
- [ ] **The seven-day duty grid without a mouse.** Tap a standing duty: each
  day's count shows; the one-line legend explains the colours.
- [ ] **Assign follows who runs the studio.** A trainer with the grant sees
  Assign on the Floor's shift groups; a head trainer visiting another studio
  does not. Assign and "Save & flag" are solid blue; "Mark done" is green.

**The standing week**

*Since the Openings round, Team shows no slots: where these steps say "Free
slot" or "open", look at My Studio → Openings → Next 7 days instead (Round
23). Team keeps who is away and one line with a door.*

- [ ] **Away on My Profile.** Under My standing week, add a range away (even
  with nothing proposed): it saves at once. On Team: "{name} is away {from} –
  {to}." once, and no open, moved or Free slot on those days. If every agreed
  slot falls in them: "Nothing else to check: the agreed slots in the next
  seven days fall on days away." Remove the range: the slots come back.
- [ ] **A leader sets it too.** In Team's Review, a leader adds a range away
  for that trainer; the trainer's My Profile shows it.
- [ ] **A colleague's week.** A colleague's profile can't be opened in the
  app, so their agreed week is on My Studio → Openings → **Who's usually
  in**: when they take clients and their regulars, read only, and their days
  away that haven't ended, or "No agreed week yet". Their waiting proposal
  and its note are not shown.
- [ ] **A leader's changes never vanish.** Change something in one person's
  Review, then tap another person's Review: "You have unsaved changes to
  {name}'s standing week. Leave without saving?" Keep editing keeps it. The
  Review's Cancel asks the same. In a Review, open "Dates away", change From,
  then tap "Agree this week": the week is agreed and the question names
  "{name}'s dates away"; Keep editing leaves "Save dates away" usable.
- [ ] **Dates away offline.** Wi-Fi off, add a range on My Profile: the adder
  closes and says "Saved on this iPad. It sends when the connection is
  back." (never "Saving…" for good). Wi-Fi on: the line goes. The note field
  says "Everyone at the studio can read this note."
- [ ] **Demo Mode.** Inside Demo Mode, a real trainer proposes a week on My
  Profile; on My Studio → Team it is listed under their name with Review and
  Agree, never "No longer on Demo Studio's staff".
- [ ] **Proposed by.** The Review reads "Proposed by {name} on {date}."
- [ ] **The studio rotation.** A regular booked "{studio} Rotation" at her
  usual time reads as usual (no Free slot), before and after the webhook
  touches the booking.
- [ ] **One rebook, one claim.** Cancel a regular's two slots and book one
  other time: it is named as the move for one slot only.
- [ ] **Two Mindbody sites.** A trainer who also works at a studio on the
  other Mindbody site shows no Free slots there for bookings that are theirs.
- [ ] **Offline.** Wi-Fi off, then open Team: "Reading the week's bookings…",
  then "Can't tell…" within 15 seconds, and no slot called open.

**Learning, Settings and My Profile**

- [ ] **One colour per meaning.** Every Save in Learning (a studio page, "Save
  for this studio", "Save notes", Post) and My Profile's Save and "Propose
  this week" are solid blue with readable words in light and dark; orange
  appears only on the Learning brand mark. A flagged machine is plum on its
  Catalog badge, the Flagged count and its Upkeep card; the Upkeep card's
  tick shows in dark mode.
- [ ] **Typing never vanishes.** On a machine page, type a studio note, then
  (1) tap the bottom bar, (2) open Learning's search and pick another machine,
  (3) tap a related machine. Each asks "You have unsaved changes to …". Keep
  editing returns to the note; Leave opens the other page with its own saved
  note.
- [ ] **Type, taps and names.** Titles are the display face in italic
  capitals (Settings' is upright). Focusing any field doesn't zoom the page.
  The crumbs, search and its clear, "Show more", the chips and a note's Edit
  are comfortable taps; a long breadcrumb scrolls so the current page stays in
  view; setting names wrap instead of being cut off.
- [ ] **The no-machines message** names My Studio → Machines, and Settings'
  Operations card names all nine tabs.

**My Studio**

- [ ] **Just now on a portrait iPad.** The Now Bar shows "Just now" on its own
  row with the kudos heart (it used to vanish below 900px).
- [ ] **The day strip.** Tap the gap meter: the day's sessions are listed with
  each client's whole name and time, "Now" on the one under way, past ones
  dimmed and never called done.
- [ ] **Capture steps aside.** Open an ask or Next up in the side panel:
  Capture hides, and closing the panel brings it back. The same for a
  machine's door on Machines.
- [ ] **Who replied.** An ask with replies shows "On it: …" (and "Can't: …")
  under it. In Capture, each Floor ask kind has a line saying what it means.
- [ ] **Machines' floor list.** Names as stored (not forced into capitals),
  whole, wrapping if long; "Maintenance" a plum badge and "Never to failure" a
  crimson one; every button 40px. Reorder mode lists the floor in order and
  saves it in one go. A search that matches nothing says so. With a machine's
  door open on Operations → Floor in landscape (and on My Studio on a
  12.9-inch iPad in portrait), each row's buttons sit under the machine's
  name, whole, and none is cut off.
- [ ] **The machine's door asks.** Open a machine's door, type in the floor's
  notes, then tap another machine's Open: "You have unsaved changes to
  {studio}'s notes on {machine}". Keep editing keeps the note; Leave opens the
  other machine with its own saved note. The door's X (and Escape on a
  keyboard) asks the same.
- [ ] **Staff & Roles' door.** A head trainer at their own studio sees "Open
  My Studio → Team" on Operations → Staff & Roles; switched to a studio they
  don't run, the button isn't there.
- [ ] **Operations → Floor on a fresh iPad.** On an iPad that has not opened
  My Studio since loading, Operations → Floor draws the machine list and a
  machine's door styled; the door stays on screen while the list scrolls (a
  sheet at the foot in portrait, a column on the right in landscape), also in
  the Home Screen app with its status strip.
- [ ] **Studio's sentences.** When the Mindbody sync needs attention, a studio
  leader is sent to Operations → Mindbody and a trainer with the grant is told
  to ask their studio leader. The studio's day names Operations → Insights →
  Hours.
- [ ] **One icon, one card, one heading.** The bottom bar's My Studio icon is
  the building, as on the masthead. Every card on Team has the header strip,
  every heading on Relay and on Team's own cards is the same small upright
  capitals (the Operations-kit panels, Standing weeks and the staff list,
  still use the kit's 13px titles and capital buttons; that is known), and a
  playbook answer on a machine's Catalog page shows in full.
- [ ] **Dark mode, all of My Studio.** Solid buttons' words read, anything
  selected is blue, flags and late jobs are plum, Delete is crimson.

## Round 23 — Openings · *Sep 27 2026, branch `openings`*

When the studio is usually busy, what opened up, and what to offer a client;
three blocks a day on the standing week; Your week and My clients on My
Profile; Team's and the Overview's line; and the Wrap-up's Times with room.
The round document is `docs/rounds/2026-09-27-openings.md`. **Deploy the
rules first** (`npm run test:rules`, then `firebase deploy --only
firestore:rules`): without them the marks can't be read or set, so A new
regular time offers nothing, and a week with a 15th block is refused. Walk it
on two iPads, a **Life Transformer's** and a **head trainer's**, both at the
same studio, and do every screen **portrait and landscape, light and dark**.
Nothing in this round has been seen in the signed-in app on an iPad yet:
only in headless Chrome on harness pages.

**At the keyboard**

- [ ] **Every iPad on the new version.** After the push, on each iPad go to
  the Hub (or tap the new-version line under the header) until it has loaded
  the new build. Do this before anyone saves a standing week with three
  blocks on a day: an older build keeps only the first 14 blocks, and a
  leader agreeing a week on one saves the shortened week without a word.
- [ ] **The first summary, if you want it before Sunday.** In PowerShell, in
  the project folder: `npx tsx scripts/openings-report.ts` (read-only: each
  studio's weeks, which days counted and why not), then `npx tsx
  scripts/run-machine-trends.ts --only openings` (a dry run), then the same
  with `--commit`. In the Firebase console → the named database → `studios`
  → a studio → `watch` → `openings` is there, with `builtAt` today.
- [ ] **No index change.** Firebase console → Indexes: nothing new is needed
  or offered. If the CLI ever offers to delete indexes that are not in the
  file, the answer is N.

**The standing week: three blocks**

- [ ] **The words.** On My Profile → My standing week the heading over the
  editor reads **When I usually take clients**, the intro "When you usually
  take clients at {studio}, and your regulars", and a day with nothing set
  "Doesn't take clients". No screen says "hours".
- [ ] **Three blocks, no fourth.** On Monday tap **Add a block**, then **Add
  another block** twice: after the third the button is gone. Remove the
  middle one and add again. With VoiceOver on, the second block reads
  "Monday, block 2: starts".
- [ ] **The breaks line.** Under the days: "A break inside a block shows as
  room on Openings, so leave the breaks out."
- [ ] **Portrait and landscape.** In portrait the three blocks sit one to a
  line; in landscape side by side, never the first alone above the other two.
- [ ] **Outside when they take clients.** A regular at a time outside every
  block shows "Outside when they take clients".
- [ ] **Propose, then agree.** Propose the week (it saves: the rules allow
  21 blocks). On My Studio → Team the subtitle reads "when they take
  clients, and their regulars"; Review shows "Monday: …, … and …, was …";
  Agree it. The row's summary never says "hours".

**My Studio → Openings**

- [ ] **Five sections.** The masthead reads Relay · Openings · Machines ·
  Team · Studio on both iPads. In portrait the studio-and-date line sits
  under the tabs, nothing cut off; in landscape it sits beside them.
- [ ] **The parts.** The usual week (it opens here) · Next 7 days · A new
  regular time · Who's usually in, as a light second row that wraps rather
  than scrolls sideways. Leave Openings on Next 7 days, go to the Hub and
  back: it opens on Next 7 days. Sign out and in: it opens on The usual week.
- [ ] **The usual week, before four weeks.** With fewer than four weeks
  counted, there is no grid, only one sentence: "The usual week needs 4 weeks
  Journey has read in full. It has N so far …" (or, before the first Sunday,
  "The usual week is built early each Sunday. The first one comes this
  Sunday."). A studio whose Mindbody isn't linked says so.
- [ ] **The grid** (once four weeks are counted, or on a studio seeded from
  the PC). Monday to Saturday across, half-hours down, each cell a 40px
  button with its word, whole, never cut short; in portrait no sideways
  scroll. Tap a time: its sheet opens in the Context Panel (a sheet from the
  foot in portrait, a column in landscape) with the sentence, the days not
  counted and why, how many are usually booked and in, the regulars, the
  cancellations. The "Built Sunday, …" line sits above the grid.
- [ ] **Next 7 days.** Cancel one of this week's bookings in Mindbody and
  wait for the sync: the time appears, "A cancellation on {day}, and nobody
  has booked into it since". A regular not booked this week: "A regular
  isn't booked for it", with "booked again from …" or "not booked again
  through …". No client's name until you tap the line; then the name, whose
  regular, and "Check it in Mindbody before you promise it."
- [ ] **Can't tell is never open.** Wi-Fi off, open Next 7 days: "Can't tell
  yet. The next 7 days' bookings haven't come back from the server", no
  lines. Wi-Fi on: the lines come.
- [ ] **The chips.** The Life Transformer with an agreed week opens on "With
  you"; the head trainer without one on "Anyone"; a chip per trainer with an
  agreed week, in name order, no count beside a name. A chip that empties
  the list says so by the chip ("Nothing has opened up with you in the next
  7 days. Anyone shows the rest of the studio.").
- [ ] **A new regular time.** "Safe to show a client" at the top, every
  list ending "Check it in Mindbody before you promise it. Journey doesn't
  book." A time marked Always full is never listed. When the month hasn't
  been read today: "Can't check the coming {weekdays} yet."
- [ ] **Who's usually in.** Everyone who works at the studio, in name order,
  each with their agreed week read only (blocks, regulars as "a regular",
  days away that haven't ended); "No agreed week yet" for a week nobody has
  agreed. **Show the regulars' names** shows them. This is where a
  colleague's week is seen now (their profile can't be opened).
- [ ] **Names.** Both iPads see trainers' names (AJ: relaxed for the beta);
  client names only after a tap, on every part.

**Marks**

- [ ] **Mark a time.** On the head trainer's iPad open a time, **Mark this
  time**, choose the word the bookings disagree with: the plum line saying
  the bookings disagree shows before Save, and the line under the choice
  says what the word changes for this time. Add a note and Save. The sheet
  shows the mark first ("Marked Always full by {you}, {date}.", the note in
  quotation marks), and "Marked" shows on that cell of the grid on the
  Life Transformer's iPad at once.
- [ ] **Change and remove.** On the Life Transformer's iPad change the
  colleague's mark: it is signed by them now. **Remove the mark** asks once
  ("Remove this mark? It goes for everyone at {studio}.").
- [ ] **Typing is never lost.** Type a note, then (1) tap another part, (2)
  tap another time in the grid, (3) tap the panel's X: each asks "You have
  unsaved changes to the mark on {time}". Keep editing keeps the note; the
  time already open asks nothing.
- [ ] **The keyboard.** With the on-screen keyboard up on the note, the note
  box and Save can be reached, in portrait and landscape (and on an iPad mini
  in landscape, if there is one: the headless stand-in left the sheet very
  little room there).
- [ ] **Offline.** Wi-Fi off on one iPad: a time's sheet says it can't tell
  whether anyone has marked the time, with nothing to tap. A form already
  open saves at once and the foot says "Saved on this iPad. It goes to the
  studio when the connection is back."; the other iPad gets the mark when the
  Wi-Fi returns.

**Team and the Overview**

- [ ] **Team's line.** On My Studio → Team → Standing weeks: who is away
  this week, then one line, "N free slots in the next 7 days · See them on
  Openings." (or "No free slots ahead in the next 7 days."), naming no client.
  Tap it: My Studio → Openings → Next 7 days, on "Anyone". With a Review
  half-typed, the line asks first.
- [ ] **The Overview's line.** On Operations → Overview, the next three
  days carries "{day} · {time}, usually full, has room · See it on Openings."
  when there is one (at most three, then "and N more on Openings"). Tap it:
  trainer mode, My Studio → Openings → Next 7 days, on "Anyone".
- [ ] **The Overview never counts an unread week as zero.** Wi-Fi off, open
  the Overview: at most "Reading the week…" for a moment, then the tiles show
  "—" and Changes today, the next three days and This week's changes say
  "Could not be read just now."; Needs you says why inside the strip and
  never "Nothing needs you right now".

**The Wrap-up**

- [ ] **Her next booking.** Finish a session for a client booked ten days
  out: "Next session: {day} · {time}." A client booked at Strongsville (on
  the same Mindbody as Westlake and Willoughby) reads "… at Strongsville."
- [ ] **Nothing booked.** For a client with nothing on file: "Nothing booked
  in the next 30 days. Book the next one before they leave." (or 7 days, if
  the month wasn't read today), with the prominent **Times with room**
  button inside the same line. The dose Dial and the note buttons don't move
  when it arrives.
- [ ] **Booked while she's there.** With the card showing nothing booked,
  book her in Mindbody: within seconds the card turns green and the door
  steps back to the quiet text button.
- [ ] **The sheet.** Type a Profile note, then open Times with room: a sheet
  over the Wrap-up with Next 7 days (chips by day, "(this week only)" where a
  regular is out) and Most weeks, "With you · Anyone", the rotation line on a
  rotation day, and the foot. No client's or trainer's name anywhere, and no
  reason a time is free. Close it: the Profile note is still there.
- [ ] **Offline.** Wi-Fi off, finish a session: "Can't check the next
  booking right now.", no prominent door; the sheet (if its door shows)
  says "Can't tell right now." once.

**My Profile: Your week and My clients**

- [ ] **Your week.** On your own profile, after My standing week: **Your
  week at {studio}** with clients trained, sessions and session time for
  this week and last. Check them against Operations → Insights → Hours for
  the same trainer and weeks: they match. A day with a morning and an
  evening block of sessions shows two parts under First session to last.
- [ ] **Your week offline.** Wi-Fi off, open your profile: "Can't read the
  sessions just now.", never 0.
- [ ] **My clients.** Right after the Kaizen Roster: coached lately first,
  "N sessions with you in Journey", "Last in Journey: {date}" (or "Last
  session" where Journey holds her whole story), the Kaizen mark on roster
  clients, whole names that wrap in portrait, **Show all N** past 12, and a
  tap opens the client. While the studio has no cutover date (or it is still
  ahead) the FileMaker line shows.
- [ ] **Your own only.** Neither card shows anywhere but your own profile.

---

## Round 24 — The Client Directory and the Hub's Opportunities · *Sep 28 2026, branch `redesign/directory-and-opportunities`*

The redesign's first round (the Redesign Blueprints, Sep 27): the Clients
screen becomes one sortable table of every client, and the Hub gets a second
layer, **Opportunities**, listing every client booked on the day on screen.
The round document is `docs/rounds/2026-09-27-directory-and-opportunities.md`.
Nothing to deploy first: no rules, no index, no Cloud Function; the round only
reads. Walk it signed in as a **Life Transformer** and as a **head trainer**,
**portrait and landscape, light and dark**. It went to master before anyone
had seen it on an iPad (AJ, Sep 28: no trainers on the app yet).

**The Clients screen**

- [ ] **It opens on Last in.** Bottom bar → Client, with no client open. Every
  client at the studio is listed (no "40 most recent"), the most recent visit
  first, in sections with counts ("Last 7 days · 58"…), and Before Journey,
  Nothing recorded and Unknown at the bottom.
- [ ] **The Nancy case.** Type `nan`. Every Nancy, and anyone who goes by
  Nancy, stays, with the matched letters marked; the top row is the Nancy who
  was in most recently. Tap **Last in** to reverse it.
- [ ] **Nicknames and typos.** `judy` finds Judith ("matched nickname"),
  `nancey` says "No exact match. Close matches:", and `obrien` and `mcdonald`
  find O'Brien and McDonald.
- [ ] **Describing.** Type `female nurses over 60`, then `5'6`. "Understood
  as:" shows each part as a chip; remove one with its ×; the count line says
  how many have nothing on file.
- [ ] **Honest unknowns.** Tap an Unknown in the Next or Left column: it says
  why, without opening the profile. After the iPad has been offline for a
  while, Next reads Unknown, never "Nothing booked".
- [ ] **Sorting.** Tap Next, then Left: the sections follow the sort, and the
  sort menu says the order in words. Leave the screen and come back: the sort
  is remembered on this iPad, and forgotten at sign-out.
- [ ] **Views.** Mine (its definition sits under the chips), Kaizen (the
  reason and check-back date replace the identity line) and In today
  (**Start** on a row opens that client's session).
- [ ] **Landscape.** Turn the iPad: Total, Age and Height appear, and their
  buttons beside the search hide or show each one. No name is cut short in
  either orientation.
- [ ] **All my studios.** Signed in as someone with more than one studio, the
  studio menu offers This studio and All my studios, and a name typed under
  All my studios finds a client at the other studio. With one studio the menu
  isn't there.
- [ ] **Still where they were.** Open session and Add Client work as before,
  and the Kaizen mark on a row adds the client to your Kaizen Roster and takes
  her off it.

**The Hub's Opportunities layer**

- [ ] **The switch.** The Hub opens on **Schedule**, unchanged. Tap
  **Opportunities** at the left of the strip: one row per client booked on the
  day on screen. Tap **Schedule**: the grid is where you left it.
- [ ] **Sorts.** Time, Last seen, Sessions, Left and Birthday, each read as a
  sentence ("turns 80 · Thu Oct 1", "Back after 5 weeks — missed about 9",
  "100th session today", "36 left in contract · +12 extra").
- [ ] **Filters and a row.** The chips Read first · Celebrate · Welcome ·
  Renew · Watch carry counts and hide at zero; Studio / Mine narrows the list;
  a tapped row opens Where she is · Something to say · Watch, with Open
  profile and Start session.
- [ ] **Another day.** Pick Thursday on the day strip: Thursday's clients,
  birthdays and milestones, not today's.
- [ ] **A staff block is not a client.** A Mindbody "Unavailable" block
  (lunch, a one-on-one) never shows as a row.
- [ ] **The strip in portrait.** With the switch added, is the Hub's top strip
  still easy to read? (AJ's note on the Blueprints page, Sep 27: that strip
  already felt "very jumbled".)

---

## Round 25 — The calm Hub · *Sep 28 2026, branch `redesign/calm-hub`*

The Hub's Schedule layer, cleaned up on Mindbody's layout (AJ: "the layout is
the foundation"): whole names, blocks at their real length, the quiet middle
of the day folded, who's working hatched, a calmer top with chips that light
their cards, and a peek on a tap. The round document is
`docs/rounds/2026-09-28-calm-hub.md`. Nothing to deploy first: no rules, no
index, no Cloud Function. Walk it on a busy day and on a quiet one, signed in
as a **Life Transformer** and as a **head trainer**, **portrait and
landscape, light and dark**. Nothing in this round has been seen in the
signed-in app on an iPad yet: only on a harness page in headless Chrome.

**The grid**

- [ ] **Names whole.** No "Lobelia S…": a long name wraps onto a second line,
  in portrait and landscape.
- [ ] **The usual service is gone.** "1:1 Strength Training" (or your studio's
  usual) is on no card; a different service (an InBody scan) still says so.
- [ ] **Real lengths.** A 45-minute new client consult is drawn half again as
  tall as a session and says "10:00 – 10:45 AM"; nothing is drawn as an hour
  that isn't one.
- [ ] **The quiet middle folds.** An hour or more with nobody booked anywhere
  is one band, "No sessions 1:00 – 2:00 PM"; a tap opens it; a booking right
  after the band starts below it, whole.
- [ ] **Your column.** It comes first, says You, and stays put while the
  others scroll sideways (a day with more trainers than fit).
- [ ] **Who's working.** For a trainer whose standing week a leader has
  agreed, the hours outside it are hatched; a day away hatches the column and
  says "Away". A trainer with no agreed week is not hatched at all.
- [ ] **Now.** The orange line crosses the grid with the time on it, and the
  Hub opens with it a third of the way down; another day has no line.

**The card**

- [ ] **The marks.** The Critical triangle is the only red. A Pulse flag and
  "No waiver signed" are plum glyphs; a milestone and a birthday orange; a
  first session, a consult and "back" blue; a renewal talk green. The amber
  clinical dot is gone.
- [ ] **Words beside a glyph** on a roomy card only, and only sayable ones:
  "100th", "turns 80", "1st session", "Consult", "back". Never a Pulse flag's
  or a waiver's words on the grid.
- [ ] **Her number.** "#264" from #4 on, not beside a milestone that already
  says it; nothing for a client whose number can't be quoted; "New to
  Journey" for one whose story began before the cutover.
- [ ] **In session and done.** A running session is blue with "In session";
  once logged, the card steps back and drops every mark, the triangle
  included; a finished slot nobody logged says "Not logged".
- [ ] **Not synced.** A booking with no Max Strength profile is dashed, says
  "Not synced yet", and opens nothing.

**The top**

- [ ] **One row, one line.** Landscape: the layers, the week, Tasks and Key
  in one row; under it the day in words and the chips. Portrait: the week
  takes its own line and the words drop. Is it calm enough? (AJ: the top bar
  "is very jumbled".)
- [ ] **The week.** Each day shows its count; a day with nothing booked shows
  no number; a small orange dot marks a day with a birthday or milestone.
  Today appears when you are on another day and brings you back.
- [ ] **Tasks.** Shows the day's open count (never a grey 0 while loading) and
  opens Relay.
- [ ] **The chips.** Read first · Celebrate · Welcome · Renew · Watch with
  counts, zeros hidden, the same as on Opportunities.
- [ ] **The spotlight.** A chip lights its cards and dims the rest; the bar
  says what it shows in words; Next steps from card to card; "See them as a
  list" opens Opportunities on the same family; Done puts the grid back.
- [ ] **The Key.** Every mark and state in words, on both layers.

**The peek**

- [ ] **A tap opens it.** Beside the card on an iPad on its side, centred
  upright. Her name, time, trainer and number; Read first whole; every mark
  in words; Last in and Package, "can't tell" rather than a guess; clinical
  history said quietly.
- [ ] **Its buttons.** Open profile opens the profile; Start session goes to
  the briefing and the session.
- [ ] **Closing.** A tap anywhere outside it, or the close button, closes it,
  and nothing behind it was tapped by that tap.
- [ ] **The tap itself.** Is a peek first (two taps to the profile) right on
  the floor? (Hub question 1's default.)

---

## Round 26 — My Studio → Studio read only, and AJ's three answers · *Sep 28 2026, branch `voice-review-notes`*

AJ's voice review notes: "Leaders edit it; trainers can view it read-only."
The round document is `docs/rounds/2026-09-28-voice-review-notes.md`.
Nothing to deploy first: no rules, no index, no Cloud Function. Sign in as a
**Life Transformer**, then as a **head trainer**, **portrait and landscape,
light and dark**. Seen so far only on a harness page in headless Chrome.

- [ ] **A trainer gets Studio.** My Studio shows Relay · Openings · Machines
  · Studio (no Team).
- [ ] **Everything locked, everything readable.** Every field on Studio is
  locked, and its words are as dark as any other sentence, not faded (iPad
  Safari fades a locked field unless told not to).
- [ ] **Nothing to press.** No Save bar, no "Use Max Strength's defaults", no
  Publish or Take down; each panel says who changes it ("Only this studio's
  leaders can change the studio's day.").
- [ ] **Notices.** The studio's live announcements are a plain list (title,
  Urgent, the first line, who posted it), or "Nothing posted right now".
- [ ] **No Mindbody lookup.** The Mindbody location field shows the saved id
  and the hint says "Only needed when a site holds more than one studio"; no
  "Looking up locations…" ever appears for the trainer.
- [ ] **A leader's page is unchanged.** As a head trainer: every field
  editable, the save bars, Publish, and "Locations load automatically" under
  the Site ID.
- [ ] **The grant.** A trainer with the grant (My Studio → Team → Can manage
  My Studio) gets the editable page; the grant's hint reads "Opens Team at
  {studio}, and lets them change its studio settings and machines".
- [ ] **Operations → Announcements** (as a studio leader whose account is an
  older one, if there is one): Publish works and the notice reaches the bell.

**AJ's answers (after `ship-review-decisions.ps1`: the rules go first)**

- [ ] **Offer, don't publish.** On a machine's Catalog page, tap "Offer to all
  MSF studios" on the studio's note: it reads "Offered · waiting for review"
  and another studio's iPad does NOT show it under "From other MSF studios".
  Tap again: withdrawn.
- [ ] **Waiting for review.** As an administrator, Admins → Waiting for review
  lists the offer whole (whose, who offered it, what it says). Share with
  every studio: it now shows on the other studio's page.
- [ ] **A no comes back with its note.** Offer a tip, then Don't share it with
  a note: the studio's switch reads "Offer again" with "Not shared: {note}".
- [ ] **The set-up card.** A Life Transformer sees the Catalog's set-up card
  read only; a leader saves it.
- [ ] **Sync settings.** As a studio leader, Operations → Mindbody shows
  Automatic sync and Every as plain lines ("every 30 minutes" unless the
  studio set its own); as an administrator, the two controls.

---

## Round 27 — The Hub's cherry on top · *Sep 28 2026, branch `redesign/hub-cherry`*

Hub direction B, held for the Hub's last round: your own column in words, the
Next 30 minutes strip and Focus: Me or Everyone. The round document is
`docs/rounds/2026-09-28-hub-cherry.md`. Nothing to deploy first: no rules, no
index, no Cloud Function, no new read. Walk it on TODAY, on a busy morning,
signed in as a **Life Transformer with bookings** and as a **leader with
none**, **portrait and landscape, light and dark**. Nothing in this round has
been seen in a browser or on an iPad yet: render tests only.

**Your column**

- [ ] **Wide on its side.** Landscape, five or fewer trainers: your column is
  the wide one; nobody else's column is pushed off the screen that would have
  fitted before. Upright, or with more trainers than fit, it is as wide as
  the rest.
- [ ] **Your day in words.** Under your name: "12 sessions · 6:00 AM – 12:00
  PM · 8 to go" (no "to go" before your first or after your last); upright the
  times drop and it stays two lines.
- [ ] **Its cards in words.** On its side, a card with two marks says both
  words ("100th", "turns 80"); "first with you" for a client's first session
  with you. Never a Pulse flag's, a waiver's or a renewal's words.
- [ ] **A number is never cut.** A card with three marks in a narrow column
  still reads "9:30 · #212" whole; only "Not logged", "New to Journey" or a
  service gives way, with "…".

**The Next 30 minutes**

- [ ] **Under the top, not in it.** The top keeps its two rows; the strip is
  a row of its own above the grid.
- [ ] **Who is on it.** In session (blue), due now ("Now · 9:30") and due in
  the next half hour ("9:45"), across every column, yours first at the same
  time; whole names; the red triangle only for a Critical note.
- [ ] **Never a session that is over.** Finish a session: it leaves the strip.
- [ ] **A tap opens the peek**, the same one a card opens. A booking with no
  profile says "Not synced yet" and opens nothing.
- [ ] **Its row stays.** In a quiet stretch it says "Nobody due in the next 30
  minutes."; before the first booking's half hour and after the last one, it
  is gone. Tomorrow has no strip.

**Me · Everyone**

- [ ] **At the end of the summary's line.** Landscape: "Focus  Me | Everyone"
  after the chips; upright, without "Focus". Not there for someone with no
  column today, nor on the spotlight's bar.
- [ ] **Everyone** makes every column alike and your head says "12 sessions";
  **Me** brings the wide column back.
- [ ] **Remembered, and forgotten.** Leave and come back: the same focus. Sign
  out and sign in as someone else: Me.

---

## Round 28 — The Admins dashboard, the Command Center · *Sep 28 2026, branch `redesign/admins`*

The Admins room of the redesign. The round document is
`docs/rounds/2026-09-28-admins.md`. Nothing to deploy first: no rules, no
index, no Cloud Function. Sign in as an **administrator**, on an iPad in
**portrait and landscape, light and dark**, and once on a PC. Not seen on an
iPad yet: only in render tests.

**The shell**

- [ ] **Portrait**: a bar of four places at the top (Home · Studios · Standard
  · Machinery) and a Search button; the place's pages as chips under it;
  nothing runs off the right edge. The bar stays at the top while a long page
  scrolls, with nothing showing through it.
- [ ] **Landscape**: a sidebar with every page under Studios, The MSF
  standard and The machinery; System tools reachable at the foot (the sidebar
  scrolls on its own on a short screen, never under the bottom bar). Limbo
  and Bug reports show a count when something waits.
- [ ] **Search**: Search (or Ctrl K on a PC) opens it at the top; "sol" finds
  Solon, "leg press" the machine, a trainer's first name the person. A pick
  opens the studio's page, the machine's editor, or the person's studio on
  Team. With a studio's details half typed, a search pick asks first.
- [ ] **Anyone else** (a head trainer who is not an administrator) is refused
  in words.

**Home**

- [ ] It opens on "N things need you" or "Nothing needs you right now", with
  "Checked at …" and Check again. Each item says a sentence, its proof and
  when it clears; its button goes where it says.
- [ ] Put an event in Limbo (or find one): Home says so; release or dismiss
  it and Home's line goes when Home is checked again.
- [ ] The network and the standard each read as one sentence.

**Studios**

- [ ] All studios: the groups say what they are built from; every name whole;
  each row's sentence names the Mindbody link, the cutover, the active
  clients and the last pull.
- [ ] A studio's page: Setup · Mindbody · Floor · Team. Change the phone
  number and tap another tab: it asks first. Save still works.
- [ ] The danger zone (on a practice or throwaway studio only): Delete stays
  greyed until the studio's name is typed; Keep it closes without a write.
- [ ] Franchises: the list, and the repair panel only when the listings
  disagree.

**The machinery**

- [ ] Mindbody sync: every studio, worst first, each in words; a studio whose
  record can't be read says Couldn't check; Check again re-reads.
- [ ] Limbo: events grouped by site and location, the registry's studio
  chosen in each picker with "Lands at …"; Dismiss, then Undo, puts the event
  back.
- [ ] Bug reports: New · Looking into it · Fixed · Won't fix, with counts;
  a status set with a button sticks after Reload.

**The standard**

- [ ] Machines: where two studios or more set their own seat position (or
  another default), one line says so above the catalog; with none, nothing is
  drawn.
- [ ] Waiting for review: "Offered to every studio" lists what studios
  offered (Round 26's sharing items walk it), and points to Machines for
  machines offered to the catalog.

---

## Round 29 — The Machine Catalog · *Sep 28 2026, branch `redesign/catalog`*

The Catalog, floor first (AJ: "take the pick but use our anatomy of muscles
model and i feel like we can clean up how much text we have"). The round
document is `docs/rounds/2026-09-28-catalog.md`. Nothing to deploy first: no
rules, no index, no Cloud Function. Open Learning → Catalog signed in as a
**Life Transformer** and as an **administrator**, **portrait and landscape,
light and dark**. Nothing in this round has been seen on a screen yet: only
mounted in tests.

**Find**

- [ ] **On top, never in the way.** Find sits above the floor and never
  takes the keyboard by itself; typing shows its results in place of the
  floor, and clearing it brings the floor back.
- [ ] **Every name.** "lumbar", "low back" and "lumb" open the Lumbar;
  "cx", "neck" and "cervical extension" the neck machine; Enter opens the top
  match.
- [ ] **Two of a kind.** On a floor with two leg presses, "leg press" lists
  both rather than picking one, and "lp2" opens the second.
- [ ] **Filters.** "handoff", "never to failure" and a maker's name (where
  the floor records one) narrow the floor and say how many.
- [ ] **Not on this floor.** A movement the floor lacks ("torso arm") says
  "Not on {studio}'s floor" and opens in All MSF machines.
- [ ] **Inside a page.** A word from a page ("headache") lists the whole
  sentence and where it is; nonsense says "Nothing goes by …".

**The floor**

- [ ] **Walking order.** The Catalog opens on "{studio}'s floor", numbered in
  the order the floor is walked (the Journey grid's and the session's order).
  Names whole, wrapping; the Academy code; the Academy's name only where the
  floor name doesn't already say it.
- [ ] **The preset.** Each row shows the studio's numbers ("Gap 4 · 3 not
  set") or "No numbers set for this unit yet"; the machine's page leads with
  the same.
- [ ] **Out of service and Flagged.** A machine set out of service says so;
  a machine flagged on Relay's Floor Map says "Flagged", and its page says
  who flagged it, when, the note, and "Cleared on My Studio → Relay." No
  cleaning counts anywhere in the Catalog.
- [ ] **Never to failure.** The Lumbar and the neck machine carry the mark on
  their rows, and their pages open with the Academy's rule in its words.
- [ ] **No floor.** A studio with no machines says "No machines on
  {studio}'s floor yet" with Open All MSF machines, never the MSF standard as
  if it were the floor. (A read that fails says "Can't read {studio}'s floor
  right now" instead; the tests cover it, as a failed read is hard to cause
  on purpose.)
- [ ] **Head office.** As an administrator the Catalog opens on All MSF
  machines; choose the floor and it stays there until sign-out.

**The body**

- [ ] **Figure and list.** "The body" shows the app's figure beside a list of
  every part (Upper body · Trunk · Lower body) with the floor's counts; a
  part picked on the figure or in the list lights on both. Nothing needs a
  hover.
- [ ] **What trains it.** A part picked lists what trains it most on this
  floor, what helps, and the MSF machines the floor lacks (they open in All
  MSF); Front | Back turns the figure.
- [ ] **From Find.** "lats" or "quads" in Find opens the body on that part.

**All MSF machines and the front page**

- [ ] **The five families.** All MSF machines is grouped by the Academy's
  five families, with no grouping switch, and the three ways in are above the
  title on every lens.
- [ ] **The front page.** Learning's front page says only what is flagged and
  what is out of service, and never shows the MSF standard as the studio's
  floor.
- [ ] **Less text.** Is it calm enough? (AJ: "clean up how much text we
  have".)

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
| 8 — History editing (Sep 17) | 12 | | |
| 9 — Machine fit (Sep 17) | 19 | | |
| 10 — My Studio (Sep 18–19) | 24 | | |
| 11 — Operations (Sep 19) | 24 | | |
| 12 — The master merge (Sep 19) | 13 | | |
| 13 — The Operations overhaul (Sep 19) | 33 | | |
| 14 — The client codex (Sep 24) | 28 | | |
| 15 — Signing out and the Operations gate (Sep 24) | 9 | | |
| 16 — Done means logged (Sep 24) | 9 | | |
| 17 — The packages screen (Sep 24) | 10 | | |
| 18 — A cross-train visitor finishes her session (Sep 24) | 5 | | |
| 19 — A Critical note marks the Hub card (Sep 24) | 7 | | |
| 20 — The voice review and the standing week (Sep 27) | 22 | | |
| 21 — A new version, picked up safely (Sep 26) | 7 | | |
| 22 — The voice review follow-up (Sep 27) | 43 | | |
| 23 — Openings (Sep 27) | 36 | | |
| 24 — The Client Directory and the Hub's Opportunities (Sep 28) | 16 | | |
| 25 — The calm Hub (Sep 28) | 22 | | |
| 26 — My Studio → Studio read only, and AJ's three answers (Sep 28) | 13 | | |
| 27 — The Hub's cherry on top (Sep 28) | 12 | | |
| 28 — The Admins dashboard, the Command Center (Sep 28) | 16 | | |
| 29 — The Machine Catalog (Sep 28) | 18 | | |
| **Total** | **501** | | |
