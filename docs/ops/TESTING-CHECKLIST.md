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
- [ ] **Consultation wizard** — every step, landscape, with the keyboard up on a text step. *If it fails:* `ConsultationWizard.tsx:225` — this strands a trainer **mid-consultation with a client sitting there**.
- [ ] **Consultation setup wizard** from inside the tracker. *If it fails:* `ConsultationSetupWizard.tsx:56`, same.
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
- [ ] **Routines tab with Routine B off**, and again with nothing chosen for today. No "G 0" chip on a machine with no setting.
- [ ] **Equipment tab during the backfill** — the "from loaded sessions" label must **disappear on its own** after the first open, without a refresh.
- [ ] **Generate a 12-month Clinical Report on a real 100-session client. Time it.** Then read every insight card and ask whether a clinician would nod at it. *This is the highest-value item on the page* — the numbers are unit-tested, the judgement is not.
- [ ] **Journal and History in dark mode.** Neither is harness-verifiable; both subscribe to Firestore, so this is the first real look.
- [ ] **Start Session when one is already in progress.** Take Over / View / Discard all behave.
- [ ] **Predicted problem — try to edit a journal entry you just wrote.** *Expected:* you cannot. The edit mutations exist (`useClientJournal.ts:180,357`) with no UI calling them, so entries are append-only. A mistyped clinical note is permanent. Decide if that is acceptable.
- [ ] **Predicted problem — save something slow and watch the button.** Four `isSaving*` flags are set and never rendered, so a slow save looks like a dead button and invites a double-tap.

### Client profile audit · *branch `client-profile-audit` (Sep 16)*

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
- [ ] **Team tab after an assigned task is left undone yesterday.** *Expected:* that person is at the top, with "Missed *task* on *day*". A task someone else finished is not held against them. Today's open tasks are never "missed".
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
- [ ] **Team tab as the head trainer.** *Expected:* Who's in today lists each person with a load bar from the schedule; This month shows counts for the five cohorts; Route to team on Renewals due posts a team job with one part per client that the trainer's iPad sees; The studio's day saves shift hours and the Now Bar's phase follows them on both iPads; the vault logs an incident that the trainer's iPad cannot read (switch to it: no vault section).
- [ ] **Kudos.** On the other iPad's Pulse line about your work, tap the heart. *Expected:* your bell rings once ("sent kudos"); the heart shows 1; the Team tab's card for you shows a heart with 1. You cannot kudos your own line.
- [ ] **The Calendar.** *Expected:* the strip above the month says Relay and shows a timed studio task on every day it falls, a team job on its due day with initials, a hand-off in blue; Mine narrows it to yours; a tap lands in Relay on the right tab.
- [ ] **Network as a franchise owner.** *Expected:* the Network tab; setting a focus shows a banner on the Floor of every studio; Launch an initiative shows under Initiatives on each studio's board; Studios lists a number per studio (a dash on loops means the index is still building).
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
- [ ] **End the session → the post-session screen.** *Expected:* under Next, "How did it land?" is a Dial — Wiped out · Drained · Just right · Had more · Barely worked — with "Your read · judged by you". Tap Just right → "Saved" and a one-line sentence under it. Tap again → clears (stores nothing). The closing note has Note · Heads up · Critical with **Note** selected; picking Heads up reveals "Matters until". The unfiled knee note is in a "To file" tray ABOVE the FORD sweep — tap Equipment → it files and disappears. "Update Pulse" opens the same sheet as the briefing.
- [ ] **Back to Hub → open the client → Notes & Profile.** *Expected:* the Notes area has a "To file" tray only if something is still unfiled; the record's section is titled **Pulse** ("How life is going — filled a little at a time, never done") with a "Hand to client" button. Expand Sleep & Recovery: the three statements are on the Dial with the five words; NO 0–10 buttons anywhere; one note box per area ("In their words / worth remembering"), none per statement.
- [ ] **Hand to client.** *Expected:* a full-screen sheet — "Judy, tap the word that fits." — one area at a time, Back / Next on a 48px bar, no scores, no coach notes, no history. Answer one, Next, "Done — hand back" at the end → the panel says "Judy's own answers" in its header. Answer something yourself → it goes back to the coach.
- [ ] **Activity Archive → Reports → build a Progress Report.** *Expected:* FIVE steps (Volume · Accolades · Machines · 4 P's · Blueprint) as equal columns whose names never truncate in portrait. On 4 P's each P is one Dial (Needs work … Mastered); no red/black/green, no 1–5. Pick Strong on Posture → the printed copy says "Strong" and a five-segment bar, never a number. On Blueprint the top card is "Pulse · as of <date> · by <trainer>" read-only, or "No Pulse on file yet — nothing is printed."
- [ ] **Activity Archive → Deep Dive segment.** *Expected:* the gate says Kaizen Deep Dive; "Build the Deep Dive". The report opens with the caveat line ("It can be wrong — treat every line as a question…") directly under the sticky bar, then Progression stalls → Readiness vs output (sleep · energy · recovery · stress · body regions · dose, each Off days / As usual / Up days; a level under 3 sessions reads "needs 3") → Attendance rhythm (one sentence) → Pain & incidents + Pulse trend → Time under tension → the heat map. No "tonnage" anywhere.
- [ ] **A session from before today (Activity Archive → Calendar → open one).** *Expected:* "On the way in & how it landed" shows the old answers in the Dial's words (Poor → "A bit short", Wiped Out → "Wiped out"), never "poor" or "3 / 5".
- [ ] **Dark mode, all of the above.** *Expected:* every Dial reads on its card (the post-session screen is dark whatever the theme); no white flash, no unreadable segment.

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

- [ ] **The bottom bar says My Studio**, and opens on **Relay** with four tabs
  (Floor · Mine · Notes · Network) under the studio's name — no Team tab.
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

- [ ] **The cockpit** is what Relay → Team was (Round 3's Team checks: who's
  in today, cohorts, open loops, the vault).
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
- [ ] **Relay's four tabs** — Floor, Mine, Notes, Network — from My Studio ->
  Relay. *Why:* the folder is `features/relay/` now and its inner pieces are
  in `board/`.
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
  booking whose slot ended five minutes ago with nothing marked: the tile is
  red, the foot says "tap to see who to chase", the list names the client,
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
| **Total** | **228** | | |
