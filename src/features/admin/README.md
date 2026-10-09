# Admin surface — house rules

The read-only audit before this round (`ADMIN-OVERHAUL-PREP.md`, which lives only in
the tag `archive/demo-mode-foundation`, commit `5b0774ed`, never on master) counted
twenty admin screens and 197 controls, and found the screens disagreeing on
**twelve separate axes**. Not one of them was wrong on its own; the problem
was that no two agreed, so every screen had to be learned separately and
every new screen invented a thirteenth answer.

This folder is the answer to all twelve, once. **Read this before adding an
admin screen.** Re-deciding one of these locally is exactly how the surface
fragmented the first time.

---

## Where each Operations page lives

Every Operations screen is in this folder since the beta-prep trim (Sep 17
2026). The Operations overhaul (Sep 19) cut the tabs to nine and moved the
company tier to the Admins dashboard (`src/features/admins/`), which mounts
this folder's screens too — moved, not rewritten. The redesign's Operations
room (Sep 28 2026, `docs/rounds/2026-09-28-operations.md`) put the nine under
**five destinations — Today · Week · Clients · Team · Setup** — each tab's
screen mounted as it was, and **Month** joined them on Sep 29 2026 (Today ·
Week · Month · Clients · Team · Setup: "what do I need to worry about
today, this week and this month"). **Ahead** joined beside Month on Oct 7 2026 (the seventh:
Today · Week · Month · Ahead · Clients · Team · Setup; `ahead/`). `shell/places.ts` is the list.

| Destination → page | Folder or file |
| --- | --- |
| The shell — the sidebar (wide), the tabs across the top (upright), "Looking at", the client opened inside Operations, where a leader was | `AdminDashboardView.tsx` and `shell/` (`places.ts` the destinations and their pages, `place-memory.ts` the place, each destination's page, the client and the scroll, forgotten at sign-out; `OperationsNav.tsx` the two menus, Looking at and Setup's list; `ClientPage.tsx` a client opened in Operations, from the Client Directory's row model; `ops.css` every `ops-` class). `AdminDashboardView.render.test.tsx` opens every page |
| Today (was Overview) | `overview/` — the brief (`TodayBrief.tsx`; since the calm round, Oct 3 2026, a counts line, one note, one row per trainer for sessions nobody logged and one "All clear" line; `brief.ts` the nightly record and its one note, Catch today and since yesterday; `floor.ts` the day's arithmetic), `changes/` (the week's cancellations and moves; `useStudioWeek.ts` the week as the server answered it), `attention/` (the watchlist, acknowledgements and, since wave 2, a leader's "didn't come" on a session nobody logged: `booking-marks.ts`); since the notes round (Oct 3 2026) Needs you also lists **the team's Health, Incident and Retention notes** of the last two weeks, whatever their loudness, with **Seen** = the acknowledgement `note:{id}` (`overview/team-notes.ts`; one read, the index studioId + kind + createdAt) |
| Clients → Journey (was the Overview's attendance watch) | `journey/` — `JourneyPage.tsx`, the rhythm (`rhythm.ts`), the states (`states.ts`), the case (`case.ts`), the studio's Journey in one pass (`journey-list.ts`, `useStudioJourneys.ts`), and her journey and case on the client page (`JourneyCase.tsx`). Read `journey/README.md` |
| Week → Last week · This week so far · Week ahead | `week/` — `WeekPage.tsx` draws all three: last week (a counts line, a note only when a day wasn't read in full, day by day, who started slipping and who came back, the renewals decided, the team in name order), this week so far (with the Changes view, `changes/ChangesView.tsx`) and the next seven days. `review.ts` is the pure half (the week's days, done means logged, late cancels and "cancelled late", how many days were read in full, each trainer's week); `useCoverageRecord.ts` reads the whole-read record's month documents |
| Month | `month/` — `MonthPage.tsx`: a given month's renewals (by the day the package effectively ends), birthdays, anniversaries (from her first day, a guessed one said to be a guess) and the MIA list (the Journey's Drifting · At risk · Lapsed, as of today); `month.ts` is the pure half. Read its README first |
| Ahead | `ahead/` — everything past this week on one scroll, as Weeks (what needs a leader, and when) or Clients (each client's two clocks on one axis): `AheadPage.tsx`, `weeks.ts`, `ClientClocks.tsx`. Read its README first |
| Clients → Renewals | `renewals/` (the engine is `src/features/renewals/`) |
| Clients → Moments (was Delight queue) | `src/features/ford/` (drawn by the shell) |
| Clients → Trends (was Insights) | `trends/` — `TrendsPage.tsx`, the quarter's lines (`trends.ts`: renewal outcomes, a longer package, start groups, studio rhythm, lost reasons, and the two that wait for stored history), each with its named minimum, then `insights/AdminInsightsTab.tsx` below (By trainer in name order, never ranked) |
| Team → This week, and the huddle | `team/` — `TeamWeekPage.tsx`: a card per trainer in today's schedule order, then who is off today (`team-week.ts`: last week's logging, their usual clients who are slipping, what is worth recognising, with the team's kudos from `useKudosThisWeek.ts`), Recognise onto today's huddle (`huddle-memory.ts`, this iPad's memory only), and the leaders-only renewal counts with the chance check (`renewal-counts.ts`). The huddle Today's "Start huddle" opens is `HuddleSheet.tsx`, its five items `huddle-agenda.ts`. Read `team/README.md` |
| Team → Hours (was inside Insights) | `hours/` |
| Setup → Floor | `floor/` — mounts `src/features/my-studio/MachinesSection` (the one floor editor), `machine-fit/` and `routines/` |
| Setup → People & access (was Staff & Roles) | `staff/`, `provisional/` |
| Setup → Announcements | `announcements/` (the audiences follow the tier) |
| Setup → Mindbody | `mindbody/` (`company` off = a leader's own studio), `useAutoSync.ts`, `syncPolicy.ts` |
| Setup → Data | `data/` |
| Setup → Rules | `journey/RulesPage.tsx` — the numbers behind every sentence; the rhythm and state engine is `journey/rhythm.ts` and `journey/states.ts` (read `journey/README.md`) |
| — on the Admins dashboard (`src/features/admins/`, its README) — | |
| Home | `src/features/admins/home/` (what needs you, the network, the standard) |
| Studios → All studios, a studio's page, Franchises | `src/features/admins/studios/` (the screens); the registry's editors here in `studios/` (`registry.ts`, `registry-writes.ts`, `StudioDetailsForm`, `NetworksPanel`, `RegistryHealthPanel`), `equipment/`, `upkeep/`, `provisional/` |
| Standard → Machines | `machines/` (every machine, the submissions queue in `catalog/`), with `src/features/admins/standard/` (where studios set their own) above it |
| Standard → Standard template | `src/features/admins/StandardTemplateTab.tsx` (`catalog/StandardSetPanel` + `routines/`). Since the first-session round (Oct 8 2026; AJ: "studios will chose their own, admins will create the routines to pick from in the app during beta"), a routine template's **For new clients** part makes it a starting routine: day one, the words that suggest it, and head office's default, at most one (`routine-plan/ui/StartPartEditor.tsx` in `routines/RoutineTemplateForm.tsx`). Its Save writes only the fields that changed, each whole, with `update` (`routines/template-save.ts`: a merge kept a word taken out); switched off, the part is parked (`startParked`) and comes back whole. The Academy's eleven arrive by `scripts/seed-starting-routines.ts`; no default is marked until an administrator marks one (AJ's "2a"). The same editor is Setup → Floor's studio templates |
| Standard → Waiting for review | `src/features/admins/ReviewQueuePage.tsx`, hosting `features/machine-db/ShareReviewPanel` (sharing with every studio waits for an administrator, AJ Sep 28 2026) |
| Machinery → Limbo | `limbo/` (`limbo-groups.ts`, `limbo-undo.ts`) |
| Machinery → Mindbody sync (every studio) | `src/features/admins/machinery/` (a studio's own panel stays Operations → Mindbody, `mindbody/`) |
| Machinery → Bug reports | `bugs/` (`fetch-reports.ts` is the one read, shared with Home) |
| Machinery → System tools | `system/` |
| Machinery → Data (any studio) | `data/`, through `src/features/admins/AdminsDataPage.tsx` |
| Legacy chart importer (its own screen) | `import/` |
| The network view under "All my studios" | `network/` (`NetworkOverview` the setup health; `NetworkActions` the network's focus and a launch at every studio, moved from Relay → Network on Sep 27 2026, the ranking dropped; for a franchise owner who sees one studio, at the foot of that studio's Overview); the old Franchise screen's pieces in `franchise/` |

The kit every tab composes: `primitives.tsx`, `formState.ts`,
`useDirtyForm.ts`, `admin.css`, `admin.tokens.css`.

## The twelve, settled

| Axis | Old state | House answer |
|---|---|---|
| Saving | instant / explicit / dirty-tracked | **dirty-tracked**, via `useDirtyForm` + `<SaveBar>` |
| Did my edit commit? | 1 screen of 20 said so | `<SaveBar>` always says so, in words |
| Form state | controlled, except screen 2 | **controlled only** — no uncontrolled input exists in the kit |
| What gets written | whole object | **only the diff** (`changedPatch`) |
| Confirmation | 5 patterns, incl. none | `<ConfirmDialog>` for anything destructive |
| Lists | 4 shapes | `<AdminRows>` + `<AdminRow>` |
| Selects | shadcn vs raw `<select>` | `<AdminSelect>` |
| Colour | tokens vs `#F06C22` vs indigo | `admin.tokens.css` only — no hex below the token file |
| Voice | "Incorporate Network" | plain studio English (below) |
| Panels / chrome | six bespoke headers | `<AdminScreen>` + `<AdminHeader>` + `<AdminPanel>` |
| Data loading | `getDocs` / `onSnapshot` / props | props from the app's existing streams; `getDocs` only for paged reads |
| Errors | 3 patterns | `<AdminNotice>` inline, or the save bar's error state |

---

## Why the diff matters more than it looks

`AdminStudioManager` read its values back out of `FormData` at save time and
wrote the **whole** studio object. Two fields — `ownerId` and
`headTrainerId` — had been removed from the JSX in an earlier round, so every
studio save quietly wrote them as `null`. Nobody saw an error.

An uncontrolled form that writes everything cannot tell *"the user cleared
this"* from *"this input does not exist"*. `formState.ts` keeps a baseline and
a draft and sends only what changed, so a field the form never rendered is
never in the write. `formState.test.ts` has that exact case as a test.

The other half is `adoptExternal`: several admin screens stream their data.
When a snapshot lands mid-edit it is **three-way merged** — fields the user is
editing keep their draft, fields they have not touched take the incoming
value. Freezing the whole draft looks safer and is not: two admins on one
studio would take turns silently undoing each other.

---

## Voice

Plain studio English. The people using these screens run gyms.

| Don't | Do |
|---|---|
| Incorporate Network | Create network |
| Regional Franchise Builder | New franchise |
| Studio Location Registry | Studios |
| Strict Demographic Adherence | *(delete — it meant nothing)* |
| Corporate Command Center | *(say what the screen is for)* |
| Cross-Studio Infrastructure & Role Mapping Matrix | Studios, staff and Mindbody links |
| Station Security ID | Studio ID |
| Total Foot Traffic (Physical Hosted) | Sessions run here |
| Access Foreign Client Record | Open a client from another studio |

Role names are **not** decoration and do not get reworded: `ROLE_LABELS` in
`types.ts` is the vocabulary — Life Transformer, Studio Leader, Franchise
Owner. "Life Transformer" is what this company calls a trainer.

**Say it once, and say less** (the calm round, Oct 3 2026; AJ: "there's just
so many words on there. It's really overwhelming", then "i trust all your
recommended"). Today was 1,430 words. Every Operations page now keeps five
rules, with a piece for each in `overview/brief-pieces.tsx` and
`overview/pieces.tsx`:

| Instead of | Use |
|---|---|
| a written bottom line | `CountsLine`: one line of numbers, its rules behind an (i) |
| "can't be told yet" in every section | `PageNote` once at the top (`useNightlyNote` for the nightly record); the sections it covers stay quiet, never "clear" |
| a how-to or a source printed on every row | `ActionRows`' Why: the row's (i). `limit` shows five, then Show all |
| a caption under a heading, a paragraph under a title | nothing; or `BriefSection` `info` / `AdminHeader` `about`, behind an (i) |
| a section saying it is empty | `AllClear`: its name in one line at the foot, only when every read behind it answered |

A count is not a score: the proof of every claim is still one tap away.

---

## Colour

`admin.tokens.css` is lifted **byte for byte** from `equipment.tokens.css`,
which the rest of the app already uses. `admin-tokens.test.ts` enforces that:
every `--adm-` token must still equal its `--eq-` original, both themes must
define the same keys, and every pairing the kit renders must clear WCAG 2.1
AA. Adding a colour means adding it to the equipment tokens first.

Two contrast facts worth knowing before you style something:

- Solid `--adm-hero` is the orange of marks (#d45a06 in light): white on it
  is **3.99:1**. It is a fill, an accent bar, a chart mark — never the ground
  under a small label. The loud button is the logo orange with navy words,
  `--adm-go` / `--adm-go-on` (6.05:1, both modes; the Navy Frame, Oct 4
  2026), with its fill restated on `:hover`. No white words sit on any orange.
- `--adm-border-strong` is a control boundary since the Navy Frame (Oct 4
  2026): **3.1:1** on the field ground and 3.4 on a card in light, 4.1 and
  3.8 in dark, the 3:1 that WCAG 1.4.11 wants. Inputs use `--adm-ink-muted`.

---

## Type and depth (Oct 4 2026)

AJ: "sharp white boxes all over the place ... borders and headers just needs
a little bit of weight and depth"; his answers "1a 2a 3b"
(`docs/rounds/2026-10-04-type-and-depth.md`). What it means in the kit:

- **A button speaks the button voice**, 14/700 in the label's own
  capitalisation, like every other room's (phase 14). `.adm-btn` was 12px/800
  capitals at 0.06em; it is one rule, so all 260 `AdminButton`s moved
  together, `size="sm"` included (small means the padding, never the voice or
  the target). With the capitals gone the words show as written, so a label
  is written in sentence case: `src/type-voice.test.ts` reads every
  `AdminButton`'s words and fails on "Save Order" or "SAVE" (a place, the
  company, a system or an acronym may keep its capitals: My Studio, Journal,
  Max Strength, Mindbody, MSF, CSV, URL).
- **A label speaks words, not capitals** (the sweep, Oct 5 2026). A field's
  label (`.adm-label`) is the 14/700 label in ink-2; a badge, a table's
  head, a fact's or a group's name is 12px words at 700 (a tile's stat label
  12/600). The eyebrow over a page title (`.ops-brief__eyebrow`,
  `.ops-client__eyebrow`, `.hq-home__eyebrow`) is the one capitals style
  left, and `type-voice.test.ts` holds every other rule in `src` to it. A
  badge's words are written in sentence case: "Inactive", "Small sample",
  never a raw value in lower case.
- **A quiet button is raised on its 3:1 edge** (`--adm-raised`,
  `--adm-elev-1` and a white top light, on `--adm-border-strong`), presses
  in with a transform, and lies flat when disabled; the hero takes Go's
  orange glow in the button voice, never Go's slanted capitals (phase 8).
- **A panel is an edge seen from outside and a short lift** (`--adm-edge`
  with `background-clip: padding-box`, `--adm-elev-2`); its head has no band
  and no rule, and its title is 17/700 in ink with a 32px icon square
  (phase 10). A row inside a panel is divided by `--adm-divider`, never a box
  in a box; an empty place is a well (`--adm-surface-2`, `--adm-elev-0`, no
  dashes; phase 9).
- **A coloured edge on a rounded box is a straight band** painted as the
  first background layer, never a border wider than 1px (Today's stops,
  Limbo's warn edge): a wide side border tapers into a crescent at the
  corners. `src/elevation.test.ts` scans every stylesheet for one.

---

## Touch

The app runs on 10"–13" iPads on a gym floor. Nothing interactive is under
40px tall (`--adm-btn` min-height), hover is never the only affordance, and
`:focus-visible` is always styled — a Bluetooth keyboard is how studio leaders
do admin work at the desk.

---

## The clock (the iPad round, Oct 2026)

A page's time is `useBoundaryClock` (`src/lib/boundary-clock.ts`), never a minute clock: it moves when the studio's day turns or the time crosses a boundary the page watches, and the page does not render in between (Journey, Month, Trends, Team, the three Week pages and a client's page used to work themselves out and draw again every minute). `useStudioJourneys({ ..., now: clock.now, clock })` watches the week's bookings (`bookingBoundaries` in `lib/booking-state.ts`: every `bookingState` changes only at them) and the night's record turning stale; a page that reads other bookings watches them too (`clock.watch("lastWeek", ...)`). Today keeps the minute for its light parts (and Openings' own) and keys the heavy ones (every client's journey, the day's run-sheet, the chase) on `useSettledNow`. **A new model that reads the time must change only at an instant some watched list names**, or add its instants; `JourneyPage.render.test.tsx` and `OverviewPage.render.test.tsx` fail on a page that goes back to the minute.

## Scope (the Operations round, Sep 19 2026)

A thirteenth axis the audit found after the twelve: **which studio am I
looking at.** Four screens answered it four ways (a picker inside the tab,
the app's studio, "every studio to everyone", the Franchise screen). The
house answer is one control in the shell — **Looking at: this studio · All
my studios** — read through `useOperationsScope()` (`scope.ts`,
`scope-context.tsx`). Since the redesign's Operations room it sits at the top
of the sidebar when wide and in the top row when upright (`shell/OperationsNav`
`LookingAt`), and says which studio even when there is nothing to choose:

- **This studio is the app's active studio.** Picking a studio on the bar
  calls `setActiveStudioId`, so the roster, the schedule and today's
  sessions a tab already receives as props follow it. A tab never keeps a
  studio of its own.
- **All my studios** is `operationsStudios(trainer, studios, networks,
  isAdmin, activeStudioId)` — the company tier every studio, the owner tier
  the studios that reach them, the studio tier the studios they run, and
  last the Demo Mode realm rule (inside Demo Mode the list is the practice
  studio alone, so there is nothing to span). A tab that can aggregate reads
  `ops.studios` and spans them (Hours, Staff & Roles, and the Overview, now
  Today, which becomes the network view: `network/`, the setup view and, for franchise
  owners and the company, Focus this quarter and Launch an initiative —
  `overview/README.md`, "Under All my studios"); a tab that reads one studio
  renders `<PickOneStudio what="…" />` under "all" and nothing else.
- Pages are keyed on `scopeKey(ops.scope)` in the shell, so a switch
  remounts them clean (and closes a client opened inside Operations: she may
  not be the new studio's). `useOperationsScope()` outside the provider
  returns a standalone value (the app's studio), never throws.
- **Operations looks; My Studio edits.** A studio's own settings — details,
  its day, renewal settings, its notices — have one editor, on My Studio →
  Studio. An Operations tab that needs one points there
  (`rememberMyStudioSection` from `my-studio/section-memory.ts`, then the
  view switch) rather than rendering the form a second time. What belongs to
  the NETWORK rather than a studio — an announcement to several studios, the
  network's focus this quarter, an initiative launched at every studio
  (`network/NetworkActions.tsx`, Sep 27 2026) — has no editor on My Studio to
  duplicate, so Operations is where it is written.
