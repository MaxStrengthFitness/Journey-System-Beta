# Progress Report — the five-step conversation (the CPR)

Round: Subjective Report, Sep 2026; reshaped in the reporting round (Sep 16,
see the section at the end). Companion to `src/features/subjective-report/`
(the Pulse — read-only here since the reporting round).
`ClientProgressReportView.tsx` still owns the data flow; this folder holds
the step rail, the steps that have been extracted, the client-copy renderers,
the 4 P's logic and the report's tokens so the view file stops growing.

## Why a stepper

The old editor was five tall cards on one page. Trainers filled them in
out of order and clients got a report that read like a form. The report is
really a conversation with a fixed shape — celebrate, show the wins, show
the numbers, say the hard thing, leave them with a goal and a date — so the
editor now walks that shape one step at a time and explains each step in
plain words above it. The order is the pitch: a client who has just been
congratulated and shown a +71 % row hears "your Path breaks down under
load" very differently from a client who got the criticism first.

| # | Step (id) | What's there |
| - | - | - |
| 1 | Volume & gratitude (`celebrate`) | Attendance, volume, rest and the thank-you narrative |
| 2 | Accolades (`highlights`) | Exactly three data-backed wins, drafted from the data (see below) |
| 3 | Machine progression (`machines`) | Start → now for every machine with history; trainer ticks what the client sees |
| 4 | The 4 P's (`fourps`) | Focus history, then one Dial per P (`FourPsStep`) |
| 5 | Kaizen blueprint (`goals`) | The Pulse snapshot (read-only), the goal continuity block, the training-track picker, closing notes |

(The Assessment step, `checkin`, was step 5 until the reporting round.
`resolveStepId()` lands the old id on the blueprint.)

The titles follow the owner's four-phase report (Volume, Validation &
Gratitude → Targeted Accolades → Clinical Methodology & the 4 P's → the
Strategic Blueprint). Step ids never change — saved state keys on them.

`steps.ts` carries the guide text and each step's short tab `label`;
`ReportStepper` renders the rail and the guide, `ReportStepNav` the Back /
Next / Finalize row at the bottom.

## Goal continuity

`ReportGoals` on the report: `originalWhy` (carried forward every report),
`previousGoal` + `previousGoalOutcome` + `previousGoalNote` (how last
time's goal went), `nextGoal` + `nextGoalTargetDate` + `checkpoints`, and
`followUpDate` — the date the trainer chases in 90 days. A new report pulls
`previousGoal` from the previous finalized report's `nextGoal`, so the
loop closes itself.

## Accolades (Sep 2026)

A real client's card read "MOVEMENT SLOT +0% — INCREASE FROM UNDEFINED TO
UNDEFINED". The report picked three machines by NAME, dropped the ones with
no data, padded with one shared blank object (so typing in one slot edited
all the blanks) and printed every slot. Now, in `accolades.ts`:

- **Nothing empty prints.** `slotCard()` returns null for a slot without real
  data; `AccoladeCards` draws only the rest, and nothing at all when none are
  left. Reports saved before this round go through the same rule: a legacy
  slot prints only with a machine, a label and a positive number.
- **Every accolade has a named minimum**, and the editor says "not enough
  data yet" below it:

  | Kind | Minimum | Ranked by (÷ the "notable" bar) |
  | - | - | - |
  | Strength gain | 3 performed, weighted sessions on the machine in the window, and a gain > 0 | % gain ÷ 10 |
  | Quality reps | 10 rated sets in the window, and a run of 5 top-quality (3) sets or 10 in total | run ÷ 10 (or total ÷ 30) |
  | Time under tension | 3 sessions with a MEASURED time on the machine, +5 s per set or more, load not lower | % gain ÷ 10 |
  | Consistency | a window of 4+ weeks, 8+ sessions, ≥ 75 % of two a week | share of the target |

  Unrated sets neither break nor extend a quality run. Time under tension
  never uses the machine clock (it includes setup) — `measuredTut()`.
- **The draft** (`draftAccolades`) takes the best of each milestone kind the
  audit names (the most impressive kind picks its machine first, and later
  kinds prefer a different machine), then the next-best milestones, and only
  then consistency — phase 1 already thanks the client for showing up. Never
  more than three, never the same accolade twice, sorted biggest win first.
  Drafted slots carry `suggested: true` ("Suggested from data") until the
  trainer touches them.
- **The trainer can swap anything.** Each slot has a kind picker (an empty
  slot reads "Choose an accolade"), a machine picker, a custom highlight, and
  a list of every other suggestion. `buildSlot()` rebuilds a slot from the
  choice and never carries old numbers over — choosing "None" clears them.
  Changing the window rebuilds chosen slots with the new numbers and
  re-drafts the open ones (`refreshSlots`).
- **The text is captured.** `headline` and `detail` are stored on the slot
  when it is chosen, like the machine-progression rows, so the printed copy
  never changes after the fact.

The data costs two reads per report, not two per machine:
`loadTrainingHistory()` (lib/progress-utils.ts) reads the client's completed
sessions and exercise logs once, and the tiles, machine progression and
accolades are all computed from it in memory. Changing the window is free.

### Stat tiles

No tile prints a fake zero. Average session length needs 3 sessions with a
start and end (imported history has none); average rest needs 2 gaps. Below
that — or for a total of 0 — the tile shows "—" and "not enough data yet".

## Focus history

The 4 P's step opens with the client's coaching focuses ("Pace — achieved
after 3 weeks · set by AJ", active first), from ONE bounded read of
`clientFocuses` (20, newest updated first, on the existing
`clientId + updatedAt` index; unordered with the same limit if that index is
missing). The refinement track's "4 P's Focus" starts on the newest active
focus. At save the report keeps a thin `focusSnapshot` — category, status,
weeks, initials, nothing else, because any signed-in user can read
`progressReports` — and the printed 4 P's section reads that, not the live
collection. A failed read keeps the snapshot the report already had.

## Joined date

The header's "Joined" uses the profile's order (`lib/client-since.ts`): first
session, first appointment, Mindbody created, earliest contract — never the
Journey document's own date (`joined.ts`).

## Machine progression

`rowsFromHistory()` turns the per-machine stats the page already loads
into `MachineProgressionRow[]`, sorted by % gain. Rows are captured onto
the report when ticked, so the printed copy never changes after the fact.
Biggest gains are pre-ticked the first time so a rushed trainer still
ships a useful table.

## Printing

Two things were wrong before this round:

1. The app shell is a `100dvh` scroll pane, and a scroll pane prints as
   exactly one page — every report was cut off. `index.css` now un-caps the
   shell while `body.printing-report` is set; the view sets it on
   `beforeprint` and marks its root `data-print-root`.
2. The print stylesheet forced a navy page while headings switched to navy
   ink — invisible text. Print is now white paper / navy ink; translucent
   surfaces become pale cards and their white text becomes navy, while the
   deliberately dark (trophies) and orange (goal, session count) cards keep
   their fill.

Email: the Email button opens the trainer's own mail app with subject and a
short body filled in; they print to PDF and attach. The app itself still
never contacts clients — no provider is wired and client-contact features
are switched off (see RENDER-DEPLOYMENT.md).

## Reporting round, Sep 2026

AJ's Client Reports Audit, action item A: "Remove [the assessment] from the
client progress report." Round document: `docs/rounds/2026-09-16-reporting-round.md`.

### Pulse is out of the report

- The Assessment step is gone (`steps.ts` has five steps; `RETIRED_STEP_IDS`
  maps `checkin` → `goals`). The report **never writes `subjective`** again:
  `handleSave` strips it from the write, so an older report keeps the block
  it already has in Firestore and a new report never gets one. The
  `clients/{id}.subjectiveSnapshot` stamp moved out with it — the Pulse flow
  (`features/subjective-report`) owns that.
- In its place the Kaizen blueprint step opens with a **Pulse snapshot**
  (`PulseSnapshot.tsx`): the client's most recent FINALIZED Pulse through
  `loadPreviousCheckIn(clientId)`, drawn with `SubjectiveDashboard`,
  read-only, headed "Pulse · as of <date> · by <trainer>" and a one-line
  "Update Pulse in the client's record" — text, not a button. "Since last
  time" and the trend come from the report's existing bounded read of the
  client's reports (no extra fetch). Three honest states: reading, couldn't
  read (unknown, never "none"), and "No Pulse on file yet — nothing is
  printed."
- The printed client copy: an older report prints the Pulse it saved; a
  report from this round on prints the snapshot, dated in its heading. Either
  way `SubjectiveClientCopy` honours the Pulse's own client-copy switches,
  and nothing prints when there is no Pulse or nothing was answered.
- "Build the full report" from a Pulse-only report still opens the editor;
  there is just no step to fill for the Pulse any more.

### The 4 P's on the Dial

- `four-ps.ts` (pure, tested) and `FourPsStep.tsx` (render-tested in
  `FourPs.render.test.tsx`). Each P is ONE `Dial` on `MASTERY_SCALE` (Needs
  work · Developing · Solid · Strong · Mastered). The red / black / green
  status control and the 1–5 bars are gone.
- **Storage is unchanged**: `performanceMatrix.<p>.score` = rank × 20, the
  field every older report carries. Dial −2…+2 ↔ rank 1…5 (`rank = v + 3`);
  `withDial()` writes the score and DERIVES every talking point's `status`
  (≤ 2 red, 3 black, ≥ 4 green) so older readers keep working.
- **Untouched = not rated.** A new report starts each P at `UNRATED_SCORE`
  (0 — a value no old report ever wrote) and the card says "Not rated"; the
  old default of 80 is gone. An old report's 80 still reads as Strong.
- The printed card (`FourPsCards` in `ClientReportSections.tsx`) shows the
  mastery WORD, a five-segment picture of the Dial and the note — never the
  number. The personalised note, the "include in summary" toggle and the
  coaching-focus history all stay.
- `src/types.ts` was not touched: `score` remains the store. If a `rank`
  field is ever wanted on the document, add it there and in `withDial`.

### Spruce-up

- `progress-report.tokens.css` (`--pr-*`: the brand navy / hero / paper /
  slate / blue as fixed pigments, the editor's card surfaces and ink
  following the app theme, urgency colours aliased from the equipment
  tokens) and `progress-report.css` (the step rail, guide, buttons, cards,
  the 4 P's, the Pulse snapshot). The view's ~150 raw hex literals are now
  `text-(--pr-hero)`-style token utilities; the print stylesheet reads the
  same tokens.
- The step rail is five EQUAL columns found by position, 56px tabs, short
  labels that fit an iPad in portrait (Volume · Accolades · Machines · 4 P's
  · Blueprint) and **never truncate**; the subtitle appears only where there
  is room. Nothing tappable is under 44px (nav buttons 48, the Dial 48, the
  include switch 44).
- The report keeps its identity — navy on screen, orange rules and Finalize —
  because it is the client-facing brand look; the ACTIVE step tab is paper
  white on navy, not orange.

## Which report opens (Sep 24 2026)

`report-selection.ts` decides which report the screen opens, and for whom.
Before it, AppContent kept a bare `selectedReportId` that only the report's
own Back button cleared: leave any other way and the next "New report",
"Start Now" or Relay "Progress report" task opened the OLD report under the
CURRENT client's name, and saving wrote to the old document. Now:

- **A chosen report is pinned to its client.** Asked for another client,
  `reportToOpen()` answers "a new one".
- **Leaving the report screen forgets the choice**, however it was left (an
  effect on the view — there is no router, so the exits are every
  `setCurrentView` in the app).
- **Every way in says what it wants**: `openReport(id)` from the shelf,
  `newReport()` from New report, Start Now, Schedule Report and Relay.
- **The editor is keyed on client + report** (`reportEditorKey`), so nothing
  carries over, and it waits for the real client instead of mounting on an
  empty stand-in (a report saved from one had no `clientId`).
- **The editor refuses another client's report** and says so in a sentence
  (`ReportNotOpened`); `handleSave` refuses to write one too. While a filed
  report is being read, or when the read fails, it says that rather than
  showing the new-report chooser.

`report-selection.render.test.tsx` mounts the selection the way AppContent
wires it (bottom bar, bell, Relay, switching client);
`components/ClientProgressReportView.render.test.tsx` mounts the editor's
refusal.
