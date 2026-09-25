# Client Profile — redesign spec and UX critique

> **Sep 15 2026 — the profile is FOUR tabs.** Section 9 at the bottom of this
> document is the current navigation model and supersedes every reference to
> seven tabs below. Sections 1–8 are the Sep 5 redesign and are still the
> reason each *pane* looks the way it does; only the tab row changed.


Round: Client profile redesign, Sep 5 2026. Branch `client-profile-redesign`,
one commit per phase (seven phases, seven commits). Verified with
`npx tsc --noEmit`, `npx vitest run`, and the headless harness at 1024×1366
and 1366×1024 in both themes. **Not yet looked at on a real iPad.**

Files in this folder own the header. The other sections live where their
data lives — `features/journey-grid`, `features/routines`,
`features/equipment`, `features/clinical-review`, `components/journal`,
`features/client-history` — and each of those has its own
README or header comment. This document is the *why* across all seven.

---

## 0. The critique in one paragraph

The old profile was assembled a section at a time by different rounds, and it
showed: seven visual dialects on one screen (rounded-[40px] cards next to
hairline lists next to glowing cyan rings), a header that spent its most
prominent pixels on a number it could not stand behind ("Top Trainer" was
whoever coached most of the *fifteen sessions currently loaded*), a Journey
grid that showed six sessions and eight machines on a screen with room for
fourteen and twenty, and a Clinical Review that ran its entire analysis on
every profile open whether or not anyone would read it. None of these were
data problems. The data was there. The screen was not letting a trainer see
it. So the redesign is mostly about **density, honesty and one visual
language**: fit what fits, label what is estimated, and make every list on
the profile read the way the Equipment rail already reads.

---

## 1. Header — facts, not guesses

**What was wrong.** Top Trainer was derived from whatever page of history
happened to be in memory, so it could change when you loaded more sessions.
"Sessions Completed 46 / 46 Total" said the same number twice.
Profile Details was a full-screen overlay that hid the tabs, and the Start
Session button — the one thing a trainer taps ten times a day — was a
medium-weight outline button competing with four equal-weight stat tiles.

**What changed.**

- **Top Trainer is a persisted, tracked field.** `client.trainerTally`
  (`Record<trainerKey, count>`) is incremented on every completed session save
  (`lib/sync-utils.ts` → `completedSessionRollup`), on CSV/legacy import
  (`importedSessionsRollup`), and decremented on session delete. The header
  re-derives the winner from the tally on every render, so it can never be
  stale, and persists `topTrainerId/Name/Sessions` so the client list and hub
  can read it without loading sessions. Clients created before the field
  existed get one backfill from the complete session list
  (`useTopTrainer`), and until it lands the header shows the old estimate.
  Per the brief, nothing else is backdated. `lib/client-rollups.ts` owns the
  rules and has sixteen tests; every Firestore primitive (`increment`,
  `serverTimestamp`) passes through a `FieldOps` seam so the maths is tested
  with plain numbers.
- **Completed Sessions reads "46 · of 48 in package"** with a Mindbody
  pill "12 left · 6-Month Package". `client-package.ts` resolves the package
  in this order: freshest of the active Mindbody membership's
  `sessionsRemaining` vs the booked pass's `sessionsRemaining`; then a
  Mindbody contract name with the app's own remaining count; then the app's
  `packageTier`/`remainingSessions`; then nothing. Mindbody first, app field
  as fallback — the trainer confirmed that priority. The pill is
  count-first ("12 left") because the number is the thing that changes the
  conversation at the desk; the package name can truncate, the count never
  does.
- **Profile Details is the seventh tab**, rendered inline
  (`ClientInfoSheet variant="inline"`). Seven tabs fit a 1024px iPad with no
  horizontal scroll at 13px; the form re-syncs from the client snapshot only
  while no field is dirty, so a background write cannot clobber a half-typed
  edit. (Since the client codex, Sep 24 2026, the record is
  `features/client-codex/`; what its form opens with is `seedForm()` in
  `record-form.ts`, which seeds wingspan — the old form never did, so a
  stored wingspan showed as an empty box.)
- **Sessions before Journey has a door (Sep 24 2026).** The line under the
  Completed sessions count ("412 before Journey · FileMaker") is a 40px
  button that opens the prior-history editor; with nothing recorded it
  reads "Add sessions before Journey", and only for someone who could save
  it. Who may edit mirrors the `clients/{id}` update rule; everyone else who
  can open the profile gets the editor read-only. That tile is already a
  button when a renewal is showing, and a button cannot hold another, so
  `Stat` stretches the tile's own tap underneath and the door sits over it.
  The pure half is `prior-history-door.ts`; the write is `statePriorHistory`
  in `lib/prior-history.ts`. See `docs/business/migration-and-prior-history.md`.
  AJ asked for the door from the session count AND from Account: the profile
  works the door out once (`PriorHistoryDoorState`, in
  `prior-history-door.ts`) and hands the same object to the header and to
  the client codex (`CodexHosts.priorHistoryDoor`), whose Account page draws
  it under the contract history with the kit's button
  (landing, Sep 24 2026). `priorHistoryDoorLabel` is what both say to a
  screen reader.
- **Start Session is the hero.** Hero-orange gradient, the only orange
  button in the header. When a session is already in progress the same slot
  becomes an amber dropdown (take over / view / discard) — same place, same
  size, so the hand goes to the same spot either way.
- **Layout.** CSS grid areas: `'id cta' / 'strip strip'` in portrait,
  `'id strip cta'` in one band at `xl` (1366px landscape). The one-band rule
  is on `xl`, not `lg`, because a 13" iPad **portrait** is 1024px = `lg`; the
  first cut used `lg` and the band crushed itself in portrait. The
  identity block sheds detail as width shrinks (studio · client since ·
  level hide at `xl`, return at `2xl`), stat children are flex items with
  per-item `truncate` so a long name never pushes the CTA off-screen.
- **Logo.** `BrandTiles` — the three-tile mark (blue, orange, slate) at
  9px squares beside the studio name. The AppHeader's studio button also
  gained `min-w-0` + `ch`-based caps + `pe-[0.22em]`: the italic display face
  overhangs its advance width and the old `truncate` clipped the last glyph.

## 2. Recent Journey grid — fit what fits

**What was wrong.** Fixed 44px rows and 84px session columns, a legend
below the grid and a settings chip inside every machine cell. Result: eight
machines and six sessions visible on a screen that has room for twenty and
fourteen, and the rest behind scrolling on a tab whose whole point is seeing
the trend at a glance.

**What changed.** `JourneyGrid` gained `fit="auto"`: a `useLayoutEffect`
measures the viewport once (and on resize), then solves for row height
(clamped 26–44px, switching to single-line cells below 36px) and session
column width (clamped 56–84px) so that **every machine** and
`max(10, min(14, cols))` sessions fit with no dead space. Settings moved
behind a hover/ellipsis popover (`MachineMenu`) so the machine column could
shrink from 184px to 150px; the quality legend moved into the toolbar. The
cycling column metrics (max / TUT / quality) are unchanged. Verified: 21
machines × 12 sessions in portrait, 21 × 13 in landscape, both themes.

Why a minimum of ten sessions rather than a fixed fourteen: fourteen at
1024px portrait would force 56px columns *and* drop machines off the bottom;
the brief's floor was ten, so the solver honours the machine count first and
takes as many sessions as the remaining width allows.

## 3. Routines — one list language

**What was wrong.** Two padded cards with 48px letter tiles and a pill per
machine; eight machines took 600px, so Routine B lived below the fold. The
Equipment tab, one tab over, had already solved the same "scan a list of
machines with numbers" problem with hairline rows.

**What changed.** `features/routines/` renders both prescriptions in the
Equipment rail's vocabulary — same tokens (`--eq-*`), same row anatomy: order
· uppercase name · setup chips · load and last outcome on the right. Both
fit one portrait screen side by side. Header actions are Edit / Use today /
Active today plus the Routine B switch; a summary bar carries the machine
count, the A/B split, the last change, and today's routine with an "Open
live session" hero button (which replaced the floating StickyCTA). The
adjustment journal is a collapsible Changes panel with added/removed
machines, notes and trainer. Routine-specific machine notes and template
provenance ("Lower Body Foundation (+1 −1)") surface in place for the first
time. `routine-rows.ts` is the pure view model (eleven tests); a machine
gets no "G 0" chip until it actually has a recorded setting, because
`orderMachineSettings` injects a default Gap that is a fact after setup and
noise before it. ClientProfileView lost ~480 lines of inline JSX.

## 4. Equipment — three numbers the roster could not answer

Date first performed, times performed, progression % — in the rail as a
`+29%` chip and a quiet `10×`, in the detail pane as a History card. See
`features/equipment/README.md` §3.7 for the source-of-truth rules. Two
decisions worth restating: **times performed counts sessions, not sets**,
and **progression is measured from the first load ever performed**, not from
the prescription's starting weight, because a starting weight is sometimes
typed in months later from memory and the first set is a fact that happened
on the floor. A flat `0%` after ten sessions is a plateau worth seeing, so it
is shown muted rather than hidden.

## 5. Journal — the composer is the front door

The tab opens on the note box, with the "Before you start" critical strip
pinned directly beneath, then the Focus board and the timeline. The old
order buried the composer under the strip and the board. Composer, strip and
board share the stream column so the text box never stretches across a
1366px screen; the filter and reference sidebar is unchanged.

## 6. History — the list is the calendar unrolled

The Calendar / List switch is a 44px segmented control in brand blue
(interactive, not hero orange). The list groups sessions under the same
month heading the calendar uses and leads each row with the calendar's own
day tile — weekday, big day number, routine letter top-right, trainer chip
bottom-right — so switching views never re-teaches the eye where anything
lives. Rows then add what a tile has no room for: session number, time,
days since last visit, machines, volume. Rows are keyboard-reachable.

## 7. Clinical Review — a report you generate, not a page that loads

**What was wrong.** The old view fetched and analysed the client's whole
history on every profile open, for a tab most visits never reached. It also
mixed tonnage and time-under-tension on one dual-axis chart, which invents
correlations that are not in the data.

**What changed.** The tab is a gate: pick a range (30d / 90d / 6m / 12m /
all / custom) and press **Generate Clinical Report**. Nothing is fetched
until then; each range is cached for the session. `useClinicalReport`
loads sessions (plus an equal-length prior window for the KPI deltas), sets
(`sessionId in` batches ≤60 sessions, one `clientId ==` query beyond), and
incidents, then `buildReport` — a pure function — produces everything the
dashboard renders. Because it is pure, the harness renders the whole
dashboard on an 84-session synthetic client and the numbers have tests
without a browser.

### 7.1 The analytics, and why they are shaped this way

- **Facts first.** `facts.ts` flattens each session into one `SessionFact`
  (date, hour in the studio's time zone, trainer, rest gap in days, check-in
  answers — sleep, stress, energy, mood, stiffness, post-session feel —
  tonnage, reps, TUT, rep-quality counts, RPE) and each set into a `SetFact`.
  TUT is taken in a fixed precedence — `totalTimeUnderLoad`, then TSC
  seconds, then `averageTimePerRep × reps`, then `machineDurationSeconds` —
  so one session cannot double-count.
- **Detrended outcomes.** Raw tonnage rises as a client gets stronger, so
  "good sleep → higher tonnage" would be true of any client who slept well
  in month six and badly in month one. Tonnage, reps and TUT are therefore
  expressed as a **% index against the trailing five-session baseline**
  (minimum three prior sessions; indexes beyond +150 / −80 are treated as
  data errors and dropped). A correlation is then about *this session vs.
  what this client normally does*, which is the clinical question.
- **Correlation engine.** Eleven dimensions (sleep, stress, energy, mood,
  stiffness, post-feel, rest gap in buckets 1 / 2 / 3–4 / 5–7 / 8–14 / 15+
  days, time of day morning / midday / afternoon / evening, weekday,
  trainer, cross-train) against six outcomes (poor-rep rate, max-rep rate,
  tonnage index, reps index, TUT index, RPE). Each cell reports the level
  means, the spread between best and worst level, a confidence tier from
  sample size (<3 insufficient, 3–5 early, 6+ solid) and whether the spread
  clears a per-outcome `meaningfulDelta` (6 pp for rates, 5% for indexes,
  0.8 for RPE). Nothing is called a finding below both bars.
- **Rest gap and AM/PM are dimensions, not special cases.** "Two weeks off
  vs. one day" is the `restGap` dimension's 15+ vs 1 levels; "morning vs.
  evening" is `timeOfDay`. Treating them as ordinary dimensions means they
  get the same confidence gating and appear in the same matrix as sleep.
- **Trends are three small multiples, not one dual-axis chart.** Weekly
  tonnage (columns), weekly TUT (line, gaps where none was recorded), and
  the rep-quality mix (stacked: max orange, completed slate, poor plum) share
  one x-axis. Beyond 26 weeks the buckets become monthly.
- **Form-breakdown heatmap.** Poor-rep share per machine per week (or month
  past 98 days), single-hue plum sequential scale, worst machines first with
  a muscle-group rollup; cells with fewer than four rated sets print the
  fraction instead of a percentage so a lone bad set cannot paint a cell
  100%.
- **Plateaus.** Per machine, sessions at the current weight and whether the
  outcome (reps, or seconds for a timed static contraction) has gained +2 /
  +10s across the window; a machine is `stalled` after five sessions at one
  weight without a gain. A sparkline shows load with poor/max sets marked.
- **Insights.** Findings are ranked with a strength cap of 3 and
  `OUTCOME_WEIGHT`, breadth-first one per subject, so the card list reads
  "sleep, rest gap, Leg Press plateau, Thursday form" rather than five
  variations on the TUT index. Day names are written out.

### 7.2 Visual budget

Orange is reserved for the hero action and for *good* findings (max
strength); plum for poor quality and anything that needs a conversation;
brand blue for interactive controls and neutral data; slate for everything
else. Blue and plum are never adjacent in a chart. Every chart with two or
more series has a legend; single-series charts are named by their title.

---

## 8. Verification and follow-ups

Done: `npx tsc --noEmit` clean after every phase; `npx vitest run` green
(client-rollups 16, client-package 9, clinical analytics, routine-rows 11,
equipment usage 7); harness screenshots for header + Journey grid, Routines,
Equipment, and the Clinical dashboard in both orientations and themes.

Still to do on a real iPad: the header band at 1366 landscape with a long
client name and a long studio name; the Journey grid on a 21-machine client
with settings menus open; the Routines tab with B off; the Equipment History
card during and after the backfill (the "from loaded sessions" label should
disappear on its own); the Clinical Review on a real 100-session client —
timing of Generate, and whether any insight reads wrong; Journal and History
in dark mode (not harness-verifiable — both subscribe to Firestore).

Follow-ups worth a card: `ClientClinicalReviewView.tsx` and its preloader
are superseded and can be deleted once the new tab has been used for a week;
the `subjectiveSnapshot` panel from the old review has no home yet; the
CSV importer already feeds the trainer tally, but the Mindbody visit import
does not and probably should not (visits are not coached sessions).


---

## 9. Four tabs (Sep 15 2026)

Full round: `docs/rounds/2026-09-15-four-tab-profile.md`.

Seven tabs became six in the FORD merge and six became four here. The change
is not really a count — it is that the tabs stopped being named after the
screens that produced them and started being named after the questions a
trainer asks:

| Tab | Question | Was |
| --- | --- | --- |
| Journey | what has she done, in order | Journey |
| Programming | what is she supposed to do | Routines + Equipment |
| Notes & Profile | what do we know, and what did we say | Journal + Details |
| Activity Archive (was Clinical History; id `clinical`) | what has already happened | Clinical + History |

Nothing was removed. `legacyLocation()` maps every tab id the profile has ever
answered to onto its new home.

### 9.1 The files

| File | What it owns |
| --- | --- |
| `profile-nav.ts` | the model — `ProfileLocation`, the reducer, the legacy map, the per-client resume, and (client codex, Sep 2026) the record's pages, the anchor registry and `SECTION_TO_PAGE`. Pure, tested in `profile-nav.test.ts` |
| `useProfileNav.ts` | the reducer plus sessionStorage and the default-segment context |
| `ProfileSubnav.tsx` | the one sub-toggle all three consolidated tabs use, and the two sticky measurements; `wrap`, `idPrefix` and `flagTone` for the codex's seven pages |
| `ProgrammingTab.tsx` | shell — Routine A / Routine B / All Machines |
| `ClinicalHistoryTab.tsx` | shell — Calendar / Sessions / Trends / Reports, and the clinical strip |
| `useProgressReports.ts` | the profile's one progress-reports listener (newest 50) and whether it answered for THIS client — the banner, the Archive's shelf and the codex's Pulse history all read it. Render test: `useProgressReports.render.test.tsx` |
| `features/client-codex/` | Notes & Profile — the codex shell (`ClientCodex`) and its seven pages. Read its README |
| `profile-nav.css` | `--psub-*` tokens, the shell, the strip, and the wrap variant (scoped to `[data-wrap]`, held there by `profile-nav-css.test.ts`) |

### 9.2 The rules that are load-bearing

**Where the trainer is is not a string.** It is a tab *and* a segment inside
it. One reducer owns it; never keep a second copy.

**Notes & Profile is pages, and it always opens on the Overview** (client
codex, Sep 2026, AJ's decision 1). Its segment is `{ page, anchor }`: one of
`RECORD_PAGES` (Overview · Notes · FORD · Body & Pulse · Goals & Focus ·
Story · Account) and, optionally, a card on it from `RECORD_ANCHORS` (or a
thread, `note-{id}`). Entering the tab remembers nothing; a door that means a
card uses `openRecord(page, anchor)`. Every old dossier section id still lands
(`SECTION_TO_PAGE`, the legacy table, and `normalizeLocation` for a handoff
stored before the change). The long scroll and its `recordSection` shim are
gone (client codex, phase 8): `ClientCodex` takes `recordPage` and
`recordAnchor` straight from the nav and keeps no copy.

**Notes & Profile stays mounted after its first visit, per client** (client
codex). The record panel is `keepMounted` from the first time the tab is
opened on this client, so coming back re-reads nothing and an unsaved record
edit survives a trip to Journey; `ClientCodex` is keyed on the client, so
another client starts fresh. Inside it the Overview mounts with the tab and
every other page on its first visit, then stays (the All Machines and Trends
precedent below). The progress-reports listener (`useProgressReports`) stays
open with it, so switching between Notes & Profile and the Activity Archive no
longer re-subscribes.

**A segment is found by position, not by reading it.** The iPad is held and
often not looked at. Segments are equal fractions of the full width, the bar
never moves between tabs, and it is sticky. Never size a segment to its text.

**A segment is never hidden.** Routine B on a client with no B reads "OFF",
and the switch to turn it on lives behind that segment.

**A name is never cut, so seven segments wrap** (client codex, Sep 2026). At
744pt portrait a seventh of the bar is ~90px and "Body & Pulse" does not fit
on one line, so the codex passes `wrap`: a label and its meta line may take a
second line, and the row grows to hold them — every segment in it together, so
they stay equal and in place. On every portrait iPad below the 13-inch (744,
820, 834pt) "Body & Pulse" and "Goals & Focus" take two lines and the row is
about 75px; in landscape, and on the 13-inch in portrait while the meta lines
are short, the bar is still 48px (a long meta makes it ~52px). In the wrap
variant the meta line is sentence case at 11px in the segment's own ink,
because on the codex it says something ("3 open · 1 critical", "couldn't
load"). A meta that wraps grows the row too, and the metas usually arrive
after the bar has drawn, so a long one moves the page below when it lands:
keep them to about a dozen characters, or reserve the height. `flagTone:
"warn"` draws the dot plum (Body & Pulse's watch-outs). `idPrefix` gives each
segment an id and `aria-controls`, so a host that passes it keeps an element
with every panel id in the page from the start — for a page that mounts on
first visit, an empty, hidden `role="tabpanel"` placeholder until then. It is
not a phone layout: at 375px seven segments are just under 40px wide and the
labels break inside words. Programming and the Activity Archive don't pass
`wrap` and render exactly as they did — every wrap rule is scoped to
`.psub-shell[data-wrap]`. Moving them over too, so the three bars match again
and nothing clips, is a separate change with its own look at an iPad.

**Switching a sub-view costs no fetch.** Every pane reads what the profile
already loaded, or keeps its own gate. If a future pane needs a read of its
own, gate it the way Trends does — on an explicit action, not on the toggle.

**Mount, hide, unmount.** Routine A/B and Reports unmount when hidden.
All Machines and Trends are mounted on first use and hidden thereafter,
because they hold a selection and a generated report respectively. Calendar
and Sessions are *one* mount of `ClientHistoryTab`. Do not tidy any of these
into plain conditional renders.

**A sticky bar needs the scroller's padding negated and an opaque
background.** The app shell is a bounded 100dvh column; an inner `p-6`
container is what scrolls, and every engine pins a sticky box inside that
padding. `ProfileSubnav` measures it into `--psub-stick-top` — the same fix
`--hist-stick-top` is in the History tab — and publishes its own height as
`--psub-stuck-h` so History's month headers stop under it rather than behind
it.

### 9.3 Shells, not rewrites

`ProgrammingTab`, `ClinicalHistoryTab` and the client codex's `ClientCodex`
(`features/client-codex`) own their sub-toggle and compose the existing
feature components. No feature component knows it is inside
a combined tab. `ClientProfileView` still owns every Firestore write of
Journey, Programming and the Activity Archive — which is why the Routine B
dialog, the discard dialog and the Edit Routine drawer sit beside
`ProgrammingTab` rather than inside it. The codex is the exception, on
purpose: its pages write the record through its one form (the Save bar's
one `updateDoc`), notes and FORD through their own writers, and nothing
else; the doors that LEAVE the tab (the Planner, the Archive's reports, a
machine, the Set-up, the Migration Hub) are still the profile's, handed in
as `CodexHosts`. Since the cleanup (phase 19) the codex asks for no report
door: the filed reports are the Archive's shelf.

`useRoutinesModel` (in `features/routines/`) was lifted out of `RoutinesTab`
so the context sentence above the toggle and the panel below it are the same
numbers from one walk of the logs. `RoutinesTab` computes its own when no
model is passed, so it stays mountable on its own.
