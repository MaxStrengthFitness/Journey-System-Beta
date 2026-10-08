# Journey's colour mapping: which colour means what, screen by screen (codebase audit, Oct 8 2026)

Scope and method. A read-only audit of the repository at `/home/user/Journey-System-Beta` as checked out (master, last commit `e8c5cb2`, docs brought up to Oct 7 2026). Every claim is cited as `path:line`, relative to the repo root. "[code]" marks what the stylesheets and components actually draw; "[doc]" marks what a comment, README or round document says should happen. Where the two differ, both are given. Hex values are given light / dark. Nothing was rendered in a browser, so on-screen area shares are estimates from class and stylesheet counts (method under Key Question 2). The scratch scripts used are in the session scratchpad (`tally.py`, `cr.py`), not in the repo.

---

## 1. What is the semantic vocabulary? Every state or category the app colours, and the token each gets

### Takeaway
On paper, the app has one core vocabulary of six signal hues, defined once in `equipment.tokens.css` and copied value for value into about 15 feature palettes: navy frame, blue (yours / picked / in session / act), orange split into "marks" (now, today) and "go" (the one loud action), green (ok / done), plum (caution) and crimson (Critical / destructive / rep quality). In practice, at least five more colour systems sit on top of it: Tailwind amber for Heads up and for "a session is running", 14 Tailwind hues for note categories, 8 trainer identity tones, 7 Learning family hues, the Pulse's red/yellow/green, and FORD's four pillars. Several orphan or untuned tokens also remain.

### Cited Findings

**A. The core palette (the source every feature copy is held to)**

| Token | Light / dark | Stated job [doc] | Source |
| --- | --- | --- | --- |
| `--chrome` (frame) | `#002341` in both modes | header, bottom bar, iPad status bar | `src/index.css:595` |
| `--chrome-here` | `#65ABE9` | "the tab you're on (a solid box) and your avatar" | `src/index.css:600` |
| `--chrome-go` | `#F36D21` | "a running session's tab, Operations and Admins" | `src/index.css:601` |
| `--eq-hero` (orange of marks) | `#d45a06` / `#f36d21` | "the now line, its dot and its pill, today, the day dots" | `src/features/equipment/equipment.tokens.css:36-45,150` |
| `--eq-hero-text` | `#b04000` / `#ff9455` | small orange words | `equipment.tokens.css:46,151` |
| `--eq-go` / `--eq-go-on` | `#f36d21` with navy `#071727` words, both modes | "the one loud action (Start session) and every orange chip with words" | `equipment.tokens.css:49-50,154-155` |
| `--eq-live` (logo blue) | `#0a548b` / `#65abe9` | "yours, picked, in session, and anything you can act on (edit affordances, notes, focus rings)" | `equipment.tokens.css:52-57,157` |
| `--eq-rail-booked` | `#668fba` / `#4675a4` | the quiet blue edge of a Hub card still to come (AJ's answer 2A) | `equipment.tokens.css:59-65,164` |
| `--eq-mine` / `--eq-mine-head` | `#d3e2f1` / `#0e243a` | your own Hub column | `equipment.tokens.css:63-64,162-163` |
| `--eq-ok` | `#17714b` / `#52d7c1` | "Green: a machine that is set up and in use" | `equipment.tokens.css:67-68,166` |
| `--eq-warn` (plum) | `#a2457e` / `#d98cbd` | "caution, warnings and maintenance. Plum rather than red so it does not collide with the hero orange for a protanope" | `equipment.tokens.css:71-73,169` |
| `--eq-alert` (crimson) | `#c0203f` / `#f2718c` | "High-importance client note. Deliberately the SAME crimson the Journey Grid uses for a set that needs work" | `equipment.tokens.css:76-81,172` |
| `--destructive` | `#BB271B` / `#FF8C8C` | "a WORD colour: Sign out, errors, invalid borders and the shadcn destructive button" | `src/index.css:341-344,672` |
| `--primary` / `--ring` | `#0A548B` / `#65ABE9` | Save buttons, focus | `src/index.css:320,657` |
| `--chart-1..5` | `#0A548B`, `#F36D21`, `#68717A`, `#0EA5E9` (sky), `#F59E0B` (amber); chart-3..5 identical in dark | chart palette | `src/index.css:349-353,677-681` |

- [doc] CLAUDE.md, the Navy Frame decision: frame navy in both modes; blue "is yours, picked and in session"; "Orange is now and go"; "Every Save and every selection is blue, and orange is only now and go"; "Crimson is Critical, destructive and rep quality only; plum is caution"; "no white words on any orange". (`CLAUDE.md:115`)
- [doc] The Navy Frame round restates the meanings as "Blue acts, selects, is in session. Orange is now, the one loud action and Celebrate. Green ok, plum caution, crimson Critical, destructive and rep quality only." (`docs/rounds/2026-10-04-navy-frame.md:131`)
- [doc] My Studio's palette writes the meanings out: live blue = "anything you can act on, and what is selected"; hero orange = "the one loud action (Capture), the studio's shared work on the board, and the Floor Map's heat"; plum = "caution — a flagged machine, a late job, a tight gap"; crimson = "critical, and the destructive button"; green = "finished". (`src/features/studio-tasks/studio-tasks.tokens.css:21-37`)
- [code] Dark green is not the same hue as light green. `--eq-ok` is a forest green `#17714b` in light and a teal `#52d7c1` in dark (`equipment.tokens.css:68,166`).

**B. Client journey states (Operations, leader screens only)**

| State | Badge tone (`STATE_TONE`) | Journey "stop" band on Clients → Journey |
| --- | --- | --- |
| New, Settling in | live (blue) | `--adm-live` (blue) |
| Steady | ok (green) | `--adm-ok` |
| Drifting, At risk | warn (plum), **the same colour for both** | `--adm-warn` |
| Lapsed | neutral (grey) | `--adm-ink-faint` |
| Inactive | neutral | dashed grey band |
| Away | neutral | (beside the line) |
| Back | ok (green) | n/a |
| Unknown | neutral | n/a |
| The stop you're on (selection) | n/a | blue band, blue fill, blue edge (`.ops-stop--on`) |

Sources: `src/features/admin/journey/JourneyCase.tsx:44-55`; `src/features/admin/shell/ops.css:991-1022`; states defined in `src/features/admin/journey/states.ts:66-74`. Badges render through `AdminBadge` → `.adm-badge--{tone}` (`src/features/admin/primitives.tsx:352-366`; `src/features/admin/admin.css:761-766`).

**C. Renewals situation and lanes**
- [code] `SITUATION_TONE`: on-track = ok (green); will-bank and will-run-out = warn (plum); away = neutral; **ended and lapsed = alert (crimson)**; unknown = neutral (`src/features/renewals/sentences.ts:237-245`). Used on the Operations pipeline badges (`src/features/admin/renewals/RenewalsPipeline.tsx:83,225`), the renewal brief (`RenewalBrief.tsx:194`; `renewals.css:89-91`), the Ahead peek and the profile header (`src/components/ClientProfileView.tsx:1747`).
- [code] The pipeline's lane tiles (Before the charge, Talk now) turn the number orange (`attention` = `--adm-hero-text`) whenever the lane holds anyone (`RenewalsPipeline.tsx:279,286-287`; `admin.css:815`). "Needs a leader" = plum badge (`RenewalsPipeline.tsx:226`).
- [code] The profile header draws the same tones in Tailwind instead: ok `emerald-700`, warn `amber-700`, alert `rose-700` (`src/features/client-profile/ProfileHeader.tsx:158-162`), as a 6px dot with no words (`ProfileHeader.tsx:333`). The renewal card dialog does the same: ok emerald, warn amber, alert rose (`src/features/renewals/RenewalCardDialog.tsx:53-58`).

**D. The Dial (one rating control) and Loudness**
- [code] The Dial colours by urgency: −2 = alert (crimson, solid fill), −1 = warn (plum), 0 = live (blue, "the brand blue the centre sits on"), +1 = ok (green tint), +2 = ok-strong (solid green). A `neutral` scale (effort) draws every pick in the blue selection colour (`src/features/rating/scales.ts:96-100,352-376`; `src/features/rating/rating.css:82-87,137-170`).
- [code] Loudness: Note = "quiet" (blue tint when picked), Heads up = warn (plum), Critical = alert (crimson) (`src/features/rating/Loudness.tsx:27,37-41`; `rating.css:205-208`).
- [code] The same three levels as chips (`IMPORTANCE_META`) are Tailwind slate / **amber** / **rose** (`src/types/journal.ts:522-547`), so Heads up is plum in the picker and on the Notes page but amber in the chips.

**E. Note categories ("what it is FOR") and the Critical triangle**
- [doc] "THE VISUAL CONTRACT ... One hue per concept, no collisions" (`src/types/journal.ts:318-347`). The exception: on the Notes page a thread card is coloured by LOUDNESS only, crimson Critical and plum Heads up (`src/types/journal.ts:348-354`; `src/features/client-notes/notes-page.css:566-571,636-649`).
- [code] The hues are raw Tailwind palette classes (`src/types/journal.ts:372-483`): Posture indigo-500, Path sky-500, Pace amber-500, Purpose emerald-500, life violet-500, equipment teal-500, incident rose-500, consultation slate, general slate, injury fuchsia-500, preference stone, **retention indigo-500 (the same as Posture)**, question blue-500, coaching cyan-500.
- [code] The six note categories borrow these (`src/features/client-notes/note-catalog.ts:118-191`): Coaching & equipment → cyan (or the P's own hue; Set-up → teal); Health → fuchsia; Incident → rose; Retention → indigo; FORD / Life → violet; Preference → stone; Admin (imports) → slate. They are drawn as a small hue dot beside the category (`src/features/client-notes/NoteCategoryChips.tsx:43-46`).
- [code] On Operations → Today the same categories are recoloured by tone: Incident = alert (crimson), Health and Retention = warn (plum) (`src/features/admin/overview/team-notes.ts:96-97`).
- [code] The Critical triangle: a crimson glyph on a crimson tint, beside the name (`src/features/hub-schedule/hub-card.css:389-401`). [doc] "It is the only red on the grid" (`src/features/hub-schedule/card-marks.ts:9-11`).

**F. Set outcomes and rep quality (the Active Session and profile grids)**
- [doc] Quality used to be the cell FILL: green max / crimson-hatched poor / grey done, plus a gold ★ and a crimson kaizen mark, "three cues, any one of which is enough" (`src/features/journey-grid/journey-grid.tokens.css:84-115`; `src/features/journey-grid/README.md:45-48`).
- [code] Since Oct 3 2026 both the profile chart and the Active Session draw the "Journey look" (`.jg-look`) (`src/components/WorkoutTrackerView.tsx:4143-4145`; `src/features/journey-grid/RecentJourneyView.tsx:260`). It removes the quality fills (`journey-grid.css:3024-3029`; the comment says "no fills, no hatch, no coloured edge. Max strength and Needs improvement keep their corner mark", `journey-grid.css:2979-2991`). Every past set becomes a **blue tile** (`--jg-pf-tile` `#d9e9f6`, `journey-grid.css:3231-3234`) and every one of today's sets an **orange tile** (`--jg-pf-now-tile`/`--jg-pf-now-edge` `#ef5302`, `journey-grid.css:3347-3351`). Quality survives as the gold star (`--jg-q-star` `#946609`) and the crimson kaizen mark (`journey-grid.css:3373-3374`), and the key's colour swatches are hidden (`journey-grid.css:3034-3036`).
- [code] Green and crimson quality fills remain on the Now Bar's quality buttons when picked (`journey-grid.css:1652,1655`), the machine menu's Staircase chips (`src/features/machine-menu/machine-menu.css:431-453`), the phone's quality buttons (`src/features/phone/phone.css:333-334`), the Pulse-free history set chips (`src/features/client-history/client-history.css:876-885`) and the Deep Dive (below).
- [code] Practice = slate blue `#4f6f8c`; Skipped = grey; Blood flow = violet `#7b3fb8`, "violet because red is kept for rep quality" (`journey-grid.tokens.css:163-171`).
- [code] A **pain** skip reason is drawn in the hero orange (`journey-grid.css:1703`).
- [code] Load movement: a signed blue number with ▲/▼ ("blue, because it is the only hue left"); a drop is muted ink, "deliberately NOT red" (`journey-grid.tokens.css:116-127`).

**G. Hub card marks and states (Schedule layer)**

| Mark or state | Colour | Source |
| --- | --- | --- |
| Read first (Critical) | crimson triangle | `hub-card.css:389-401` |
| Watch (No waiver signed, Pulse flag) | plum glyph | `hub-card.css:425-428`; `DayHeader.tsx:268-272` |
| Welcome (New, Back after a break) | blue glyph | `hub-card.css:430-433` |
| Celebrate (Milestone, Birthday) | orange glyph | `hub-card.css:435-438` |
| Renew (Renewal talk) | **green** glyph | `hub-card.css:440-443` |
| Get to know (FORD Ask about) | blue glyph, told from Welcome "by its shape (the speech bubble)" | `hub-card.css:445-451` |
| "+N" more | grey | `hub-card.css:453-456` |
| Coming up | quiet blue 4px left edge | `hub-card.css:72-74` (rules start at line 25; grep line 73) |
| In session | blue edge + blue fill + a pulsing blue dot | `hub-card.css:95-98,361-372` |
| Peek open | blue all round | `hub-card.css:84-89` |
| Done / Not logged / Didn't come / Late cancel | recedes to grey (`--eq-surface-2`, a grey edge, 0.70 veil); the state is a WORD | `hub-card.css:116-120`; `src/features/hub-schedule/HubCard.tsx:183,287,294` |
| Left open | plum left edge, plus the words "Left open" | `hub-card.css:161`; `HubCard.tsx:300-304` |
| Not synced / Unassigned | dashed 1px edge | `hub-card.css` (unlinked block) |
| Staff block ("Unavailable") | grey hatching | `hub-card.css:212-213` |
| Now line, rail dot, now pill | orange (`--eq-hero`), navy words in the pill | `src/features/hub-schedule/hub-grid.css:491-510` |
| Today's day chip | orange ring and orange numeral; when picked, a 3px orange underline under the blue chip | `src/features/hub-schedule/day-header.css:169-213` |
| Picked day | solid blue | `day-header.css:181-198` |
| A day with something to celebrate | a 6px orange dot | `day-header.css:162-167`; `DayHeader.tsx:168-171` |
| Your column | blue cast, blue head with a 3px blue rule | `hub-grid.css:98-99,345-346` |
| A Hub read that failed | plum-tinted notice bar | `hub-grid.css:519-529`; `HubGrid.tsx:99` |
| Start session (peek) | logo orange with navy words | `src/features/hub-schedule/peek.css:262-268` |

- [code] The Opportunities run-sheet uses the identical family colours on its chips (`src/features/hub-opportunities/run-sheet.css:270-300`).

**H. Booking states**
- [code] `BookingState` is cancelled · completed · no-show · upcoming · in-progress · never-logged · unknown (`src/lib/booking-state.ts:64-75`). On the Hub they are words on a receded grey card (above). On Operations → Today, "Not logged" rows carry a **crimson** badge (`src/features/admin/overview/TodayBrief.tsx:556-557`). On the client's calendar (Activity Archive): a visit is a blue fill; a booking still to come is a blue outline; a cancellation or a move is a small ink glyph; today is an orange ring; a break is grey hatching; Away is sand/amber; "hasn't been in for N days" is plum (`src/features/client-history/client-history.css:10-24,39-52,454-500`).
- [code] A complete Mindbody booking-state colour vocabulary exists in `index.css` (`--mb-state-scheduled` grey, arrived cyan, active orange, completed `--green`, late-cancel `--amber`, no-show `--red`, reschedule `--yellow`, plus sync, access and origin tokens) but **has zero readers** in `src/**/*.ts(x)` or any other stylesheet (`src/index.css:186-210,605-626`; grep for `mb-state|mb-sync|mb-access|mb-origin` outside `index.css` returns 0).

**I. Ahead (Operations) event kinds**
- [code] `KIND_TONE`: talk-now and talk = "act" (blue); charge-window, charge, runs-out, may-slip = "caution" (plum); renews, billing-ends, ends, back = "date" (ink); birthday and anniversary = "moment" (muted ink) (`src/features/admin/ahead/events.ts:116-129`; `src/features/admin/ahead/ahead.css:452-466`). Each kind also has its own shape (diamond, coin, tick, gap, dashed ring, arrow, star) (`src/features/admin/ahead/marks.tsx:14-28`). Today is an orange ring or line (`ahead.css:346-352,508-514,776-781,932`).
- [code] The 26-week strip draws three bars a week: blue talks, grey dates, plum watch (`ahead.css:154-164`; `WeekRun.tsx:69-80`).

**J. Openings**
- [code] A full or "always busy" time = orange hero fill ("A hot spot: the heat's orange"); a time with room = the blue fill ("A cold spot, room to offer: the action blue"); mixed, booked or rotation = tray grey; blank = dashed outline (`src/features/openings/openings.css:10-16,215-238`). "Can't tell" has no colour of its own; it is said in words (`openings.css:12-16`).

**K. Pulse (the living assessment)**
- [code] Its own red / yellow / green set ("the document's three colours"): green `#17714b`, yellow `#9d5f00`, **red `#b42318`** (a third red, neither the crimson nor `--destructive`), and a "watch" violet `#6b4c9a` ("never confused with red") (`src/features/subjective-report/subjective-report.tokens.css:33-41`). A body region with pain is the red outline and fill; a resolved pain is green; a score rising is green and falling is red (`src/features/subjective-report/subjective-report.css:233-234,331-354`).
- [code] On the client codex's body figure, a watch-out on file is a **plum** diamond, and a highlighted region a blue glow (`src/features/client-codex/body/body.css:189-194,205-207,224-230`).

**L. FORD (Family, Occupation, Recreation, Dreams)**
- [code] Pillar identity: Family orange-brown `#b8430b`, Occupation blue `#0f5285`, Recreation green `#1b6f4e`, Dreams violet `#5a4aa6`. Urgency, borrowed: now = hero orange text `#b04000`, soon = live blue `#064f89`, later = grey, unfiled = gold `#7a5a12` (`src/features/ford/ford.tokens.css:47-77`).

**M. Other identity palettes (colour = WHO or WHAT KIND, not status)**
- [code] Calendar trainer tones, hashed by trainer id: t0 orange `#ef5302`, t1 logo blue `#0a548b`, t2 teal, t3 violet, t4 amber `#a16207`, t5 plum `#a2457e`, t6 green `#15803d`, t7 cyan-teal (`src/features/calendar/calendar.tokens.css:7-17,68-75`). Avatars put **white** initials on these, the orange one included (`src/features/calendar/calendar.css:129-145`).
- [code] Learning / Catalog family hues: Push `#ef5302` (orange), Pull `#0a548b` (logo blue; dark `#38bdf8` sky), Legs `#1c7a52` (green), Posterior `#b26a00` (amber), Trunk `#8a4f9e` (purple), Hips `#b5306f` (magenta), Other slate (`src/features/wiki/wiki.tokens.css:150-181,257-263`; read through `src/features/wiki/categories.ts:114-129`).
- [code] The Wrap-up's "where the work went" bars: Lower Body = `chart-4` sky, Upper Body = `chart-5` amber, Core & Spine = ink-2, Other = `chart-3` grey (`src/components/WrapUpScreen.tsx:320-334`).
- [code] Two Tailwind identity helpers exist with **no readers**: `getRoleColor` (Founder amber, Admin indigo, Owner orange, Leader sky, Trainer emerald; `src/lib/utils.ts:496-516`) and `getMuscleGroupColor` → `getMachineStyle` (Push blue, Pull amber, Core purple...; `src/lib/utils.ts:204-207`; `src/lib/machine-colors.ts:90-110`). Grep for either name outside its definition returns nothing.

**N. Untuned and system-state colours**
- [code] `--yellow #FCD661`, `--green #4FDB8E`, `--red #E84F4F`, `--amber #F5A623` are defined in `:root` only, so dark mode uses the same values (`src/index.css:551-554`). Readers: the bell's "Urgent" chip (`text-amber` on `bg-amber/15`, `src/features/notifications/NotificationBell.tsx:264`), and the unmounted `SyncStatusBadge` (`src/components/mindbody/SyncStatusBadge.tsx:85-96`; no importer).
- [code] Toasts: success = Tailwind emerald, error = Tailwind red, warning = Tailwind amber, info = `chrome-here` blue (`src/contexts/ToastContext.tsx:128-149`).
- [code] Admins' `HqStatus` codes each state with a shape AND a colour: ok = green dot, watch = plum diamond, unknown = dashed ring, idle = hollow ring, live = blue dot (`src/features/admins/admins.css:458-509`).
- [code] Front door (always dark): its own `--fd-*` set, ok `#4cc38a`, warn **amber** `#f2b84e`, bad `#ef6b6b`, action orange (`src/features/front-door/front-door.css:15-29`).
- [code] The progress report keeps an older orange `#f06c22` with white words (`src/features/progress-report/progress-report.tokens.css:33-35`). [doc] "The progress report and the always-dark screens" were left unchanged on purpose (`docs/rounds/2026-10-04-navy-frame.md:134`).

### Inferences
- The core six-hue vocabulary is sound and well guarded by tests, but at least six parallel colour systems (note categories, trainer tones, Learning families, Pulse RAG, FORD pillars, Tailwind status classes) reuse the same hue families for unrelated meanings. A trainer meets most of them on one client profile.
- The app has at least seven distinct reds in light mode alone: `#c0203f` crimson, `#BB271B` destructive, `#b42318` Pulse red, Tailwind rose-500/600 (Critical chip, Incident), Tailwind red-500/600 (Scrap Session), `#E84F4F` `--red`, and `#ef6b6b` on the front door. It has a similar spread of ambers (Tailwind amber-500, `#F5A623`, `#8a5300`, `#9d5f00`, `#946609`, `#a16207`, `#f2b84e`). "One crimson" holds only inside the tokenised screens.

### Gaps
- Not every component was opened. The trainer profile palette (`--tp-*`), InBody, machine fit's Setup UI, the Programming → Setup sliders and the consultation flow were only spot-checked or not checked.
- Dynamic class construction beyond the cases found (`--wk-cat-${accent}`, `adm-badge--${tone}`) could hide further readers of the orphan tokens. The grep for the `mb-*` prefixes would also catch template strings that use them, so that "no readers" claim is reasonably safe.

---

## 2. What does each screen family look like in colour terms (dominant, accent, signals, and the 60-30-10 question)?

### Takeaway
Every themed screen is mostly neutral (roughly 65-82% of colour declarations), framed by the navy header and bar (about 12% of an iPad's height upright, about 17% on its side). Blue is the clear secondary (7-16% of declarations). Orange, green, plum and crimson each sit at 0-8%. The split is close to 60-30-10 only if the navy frame and the neutral cards are counted as one dominant layer. The "10" is shared by four or five signal hues rather than one accent, and on several screens (Pulse, the profile header, Renewals dialogs) a non-core hue (Pulse red, Tailwind amber) takes a larger share than orange does.

### Cited Findings
- [code] The frame: the header is 56px (`h-14`, `src/components/AppHeader.tsx:68`); the bottom bar is `min-h-14 sm:min-h-20` (80px on an iPad; `src/components/AppBottomBar.tsx:215`); both are `bg-chrome` `#002341` in both modes (`src/index.css:595`). The page ground is `#DEE6EE` / `#0A1C2C` and cards are `#F3F6F9` / `#14293D` (`src/index.css:313-315,650-652`).
- [code] Default theme: "The default theme is still dark, and a sign-out still resets to it" (`docs/rounds/2026-10-04-navy-frame.md:136`).
- Method for the shares below: `tally.py` (scratchpad) counted colour references (`var(--x-*)` in stylesheets and Tailwind colour classes in components, tokens files excluded) per screen family and bucketed them by hue family. **It counts declarations, not pixels.** A 4px edge and a full-width fill each count once.

| Screen family | Colour refs | Neutral | Blue | Orange | Green | Plum | Crimson/red | Amber | Other hues |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Hub (schedule + opportunities) | 475 | 72% | 16% | 4% | 2% | 2% | 3% | 0.4% | 0 |
| Active Session (grid, Now Bar) | 686 | 67% | 14% | 8% | 2% | 1% | 6% | 1% | 0.3% |
| Machine menu | 307 | 78% | 11% | 3% | 2% | 1% | 3% | 0.3% | 1% |
| Briefing | 203 | 71% | 10% | 3% | 2% | 7% | 7% | (amber counted under warn here) | 0 |
| Wrap-up | 120 | 75% | 9% | 3% | 5% | 6% | 0 | 2% | 0 |
| Client profile shell + header | 308 | 64% | 12% | 5% | 2% | 3% | 8% | **8%** | 0 |
| Notes | 264 | 77% | 11% | 0.4% | 2% | 2% | 4% | 3% | 0.4% |
| Pulse | 399 | 72% | 12% | 0 | 6% | 0 | **8%** | 1% | 2% |
| FORD | 129 | 71% | 9% | 5% | 5% | 0 | 0 | 6% | 4% |
| Activity Archive | 313 | 73% | 13% | 1% | 4% | 3% | 5% | 1% | 0 |
| Operations (admin, 95 files) | 1030 | 81% | 7% | 2% | 2% | 4% | 4% | 0.5% | 0 |
| Renewals (dialogs, rows) | 116 | 65% | 10% | 0 | 3% | 0 | 4% | **18%** | 0 |
| My Studio + Relay + Openings | 1468 | 72% | 16% | 3% | 4% | 4% | 0.4% | 0 | 0 |
| Learning / Catalog | 520 | 78% | 13% | 1% | 1% | 5% | 3% | 0 | 0 |
| Admins dashboard | 196 | 82% | 12% | 0 | 2% | 5% | 0 | 0 | 0 |
| Calendar (trainer) | 162 | 81% | 14% | 4% | 0 | 0 | 0 | 0 | 2% |
| Deep Dive | 181 | 79% | 7% | 8% | 2% | 2% | 2% | 1% | 0 |

- Per family, what carries the colour [code]:
  - **Hub**: neutral grid; blue for your column, picked day, in-session and coming-up edges, Welcome and Get to know glyphs; one orange now line plus today's ring and orange Start; crimson only for the Critical triangle; plum for left open, Watch and failed reads; green only for the Renew glyph (`hub-card.css`, `hub-grid.css`, `day-header.css`, as cited in Q1-G).
  - **Active Session**: neutral cells; history set tiles blue and today's tiles orange (`journey-grid.css:3231-3242,3347-3351`); the focus machine an orange edge and row trace (`src/features/journey-grid/README.md:304`); Finish, the paused clock's button and the routine's number chips orange (`src/features/journey-grid/session-colour-rules.test.ts:4-19`); paused clock gold (`journey-grid.css:2358-2371`); Critical flag crimson and elevated flag amber (`journey-grid.css:1770,1775`).
  - **Machine menu**: neutral card; blue weight line and dots in the Staircase (`machine-menu.css:466-479`); today orange (`machine-menu.css:416-426`); green "+N%" (`machine-menu.css:96-99`); Save and Add note **orange** (`machine-menu.css:965-1006`), Add note blue while a settings change is unsaved (`machine-menu.css:1008-1012`).
  - **Briefing**: crimson contraindication strip and markers; amber Heads up and safety band; orange Start (`src/features/briefing/briefing.tokens.css:20-33`; `briefing.css:268-281,709-744,907-924`).
  - **Wrap-up**: [doc] "brand blue for a gain, a save and the focus ring, green for booked and saved, plum for a caution ..., gold star ..., sky, amber and neutral for where the work went" (`src/components/WrapUpScreen.tsx:123-129`); the renewal button orange when due (`WrapUpScreen.tsx:1050-1054`).
  - **Operations**: the most neutral area. Badges, tiles and notices in live / ok / warn / alert / hero tones (`admin.css:761-766,815-816,913-916`); the Operations tab and its bar edge orange (`AppBottomBar.tsx:13-17,105-107,215-223`).
  - **My Studio / Relay**: blue for mine, selected and started; orange for floor (shared) work, waiting asks, kudos and heat; green done; plum flags (`src/features/relay/board/board.css:142-146,288-296,556-558`; `relay-strip.css:22-23`; `relay.css:21-40`).
  - **Learning / Catalog**: neutral, blue Saves and picks, plum for Out of service, Flagged and Couldn't save, green Saved (`src/features/catalog/catalog.css:110-135`; `src/features/catalog/FloorRow.tsx:85-86`), family hues on rows.
  - **Admins**: neutral, blue live, plum watch, green ok, with shapes (`admins.css:458-509`).
  - **Front door**: always dark (`--fd-ground #040a12`), the logo's three squares and an orange action (`front-door.css:15-29`).

### Inferences
- Taking the frame (~12-17% of the viewport) and the neutral cards and ground (~65-80% of declarations) as the dominant layer, Journey runs at roughly 80 dominant / 12 blue / 8 for everything else. Blue is a clear secondary. The tertiary "10" is fragmented across orange, crimson, plum, green and amber, so no single accent owns it.
- Orange is the brand's loudest hue but is a small share almost everywhere (0-8%). That fits "one loud action". However, many small orange marks (today, now, celebrate, attention tiles, waiting, heat, kudos, newest tiles) dilute the "go" pop-out (see Q3).
- The Pulse, the profile header and the Renewals dialogs lean on hues outside the core set (Pulse red, Tailwind amber), which is where the app looks least like one system.

### Gaps
- No pixel-area measurement. The perf lab (`harness/perf-lab/`) can render the app, but it was not run here (read-only brief). Shares are declaration counts, and the frame share is arithmetic from fixed heights against an assumed 820×1180 iPad viewport.
- Dark mode shares were not separately estimated; the same tokens apply.

---

## 3. Overloads: where one hue carries several different meanings

### Takeaway
Blue and orange are heavily overloaded, each carrying more than a dozen distinct meanings across screens. Crimson carries at least seven: beyond its documented three (Critical, destructive, rep quality) it also means "not logged", ended/lapsed renewals, a client away, overdue upkeep, announcement Urgent and "much worse than usual" on the Dial. Plum means caution, failed reads and Draft. Gold means both max strength and a paused clock. Green means ok, done, logged, booked, steady, back, renewal talk, max strength and load gain.

### Cited Findings
**Orange (`--eq-hero`, `--eq-go`, `--chrome-go`, `--st-hero`, `--adm-hero`)**
- Now: the now line and pill (`hub-grid.css:491-510`).
- Today: day ring (`day-header.css:169-179`), client-calendar ring (`client-history.css:464`), Ahead (`ahead.css:351`), calendar bars (`src/features/calendar/calendar.css:435-447`), the machine menu's today bar (`machine-menu.css:416-426`), today's set tiles in the session (`journey-grid.css:3347-3351`).
- Go: Start, Finish, paused Resume (`peek.css:262-268`; `session-colour-rules.test.ts:9-13`).
- A running session's tab, and ALSO "you're in Operations / Admin" (`AppBottomBar.tsx:13-17,105-107,124-126,215-238`; `src/index.css:601`).
- Celebrate: Hub glyph (`hub-card.css:435-438`) and the day dot (`day-header.css:162-170`); birthday/milestone markers on the briefing (`briefing.css:710`); Relay kudos (`board.css:556-558`).
- Attention / waiting: Operations stat tiles with anyone in a lane, lost renewals, staff awaiting approval, unclosed loops, the DLQ (`admin.css:815`; `RenewalsPipeline.tsx:279`; `RenewalOutcomesPanel.tsx:137`; `AdminStaffTab.tsx:128,143`; `AdminMindbodyTab.tsx:491`; `AdminInsightsTab.tsx:286`); "hero" badges for "{count} waiting", "Waiting for approval", "Coming soon" (`SubmissionsQueue.tsx:104`; `StaffEditor.tsx:57`; `AdminDataReportsTab.tsx:162`); a waiting card and wait dot on the Relay Board (`board.css:146,288-289`).
- Heat / busy: Openings' full times (`openings.css:215-221`); the Floor Map heat ramp (`relay.css:21-40`).
- Studio / floor work on Relay (`relay-strip.css:22`; `studio-tasks.tokens.css:28-29`).
- A renewal due on the Wrap-up (`WrapUpScreen.tsx:1050-1054`).
- Pain as a skip reason (`journey-grid.css:1703`).
- Max strength in the Deep Dive sparkline and legend (`src/features/clinical-review/charts.tsx:98`; `clinical-review.css:264`).
- Increase on the trainer calendar ("delta up") (`calendar.css:386`).
- The newest day on the Journey chart (`journey-grid.css:3236-3242`).
- Identity: trainer tone t0 (`calendar.tokens.css:68`), Learning's Push family (`wiki.tokens.css:150`), FORD's Family pillar `#b8430b`, which sits 1.07:1 from FORD's own "now" `#b04000` (`ford.tokens.css:51,65`; computed with `cr.py`).
- Saves still on orange: the machine menu's Save and Add note (`machine-menu.css:965-1006`), machine-fit's Save set-up, the template editor's Save, the progress report's Finalize ([doc] `docs/rounds/2026-10-04-navy-frame.md:197,218`).

**Blue (`--eq-live`, `--primary`, `--chrome-here`, copies)**
- Yours: your column and avatar (`hub-grid.css:98-99,345`; `src/index.css:600`); "mine" on Relay (`relay.css:29-30`; `relay-strip.css:23`).
- Picked / selected: day chip (`day-header.css:181-198`), the Journey stop you're on (`ops.css:1017-1022`), filter chips (`client-directory.css`), Dial picks.
- Every Save (`loud-orange.test.ts:36-46`; `catalog.css:110-117`).
- In session and coming up (Hub card) (`hub-card.css:72-98`).
- New and Settling in states (`JourneyCase.tsx:45-46`; `ops.css:991-994`), so the "New" stop and the selected stop share one blue band.
- Welcome and Get to know glyphs (`hub-card.css:430-451`).
- The Dial's centre, "as usual" (`scales.ts:352-371`).
- Act / talk now on Ahead, and sessions-left bars (`events.ts:117-118`; `ahead.css:154-156`; `src/features/admin/ahead/README.md`, the Weeks bullet).
- Room to offer on Openings (`openings.css:223-227`).
- A visit on the client's calendar, and a booking ahead as a blue outline (`client-history.css:10,39-44,455-460,486-494`).
- Density on the calendar heat map, a single blue ramp (`calendar.tokens.css:48-60`).
- Load up ▲ in the session grid and on the Wrap-up; the Wrap-up's "+%" per body group (`journey-grid.tokens.css:116-126`; `WrapUpScreen.tsx:384-386,824`).
- Increase-down "delta down" on the trainer calendar (`calendar.css:387`).
- Every past set tile on the Journey chart and session grid (`journey-grid.css:3232`).
- The Staircase weight line (`machine-menu.css:466-479`); the Deep Dive line (`charts.tsx:11,68`).
- Worked muscles (`codex.tokens.css:103`; `routine-builder.tokens.css:80-82`).
- Info notices (`admin.css:913`).
- "now" on the Relay Board's part-of-day tab (a blue dot, `board.css:144`; `Board.tsx:434`).
- Identity: FORD's Occupation `#0f5285` (1.03:1 from FORD's "soon" `#064f89`; `ford.tokens.css:53,67`), trainer tone t1 (`calendar.tokens.css:69`), Learning's Pull (`wiki.tokens.css:151`), and note categories in sky, blue, cyan and indigo (`journal.ts:380,468,476,372,460`).

**Crimson / red (`--eq-alert`, `--jg-q-poor`, `--destructive`, Tailwind rose and red)**
- Critical notes and the Hub triangle (`hub-card.css:389-401`); contraindications on the briefing (`briefing.tokens.css:20-27`).
- Rep quality "needs work": the kaizen mark (`journey-grid.css:3373`). It uses the identical hex `#c0203f` on purpose: [doc] "Deliberately the SAME crimson ... so 'this is the one that matters' is one colour across both screens" (`equipment.tokens.css:76-81`). Yet other docs insist the Critical mark is "never rep quality's red" (`src/features/journey-grid/README.md:309`; `phone.css:119-120`).
- Destructive: Scrap session (Tailwind red, `WorkoutTrackerView.tsx:4040-4090`), the shadcn destructive button (`src/index.css:341-344`), the trash hover (`journey-grid.css:2540`).
- Dial −2, "much worse than usual" (`scales.ts:365-366`; `rating.css:167-170`).
- Renewals ended and lapsed (`sentences.ts:242-243`).
- "Not logged" on Operations → Today (`TodayBrief.tsx:556-557`).
- Incident notes for leaders (`team-notes.ts:96`).
- A client **away** marker on the briefing (`briefing.css:709`; the marker is "Away from / until …", `src/lib/hub-markers.ts:122-123`).
- "Upkeep overdue" (`src/features/admin/equipment/StudioEquipmentPanel.tsx:246`).
- Announcement "Urgent" in Operations (`src/features/admin/announcements/AnnouncementComposer.tsx:449`).
- Error notices (`admin.css:915`; `AdminsHome.tsx:282`).
- The Deep Dive heat map is a single crimson ramp of the "poor" rate (`src/features/clinical-review/panels.tsx:433`).

**Plum (`--eq-warn` and copies)**
- Caution, flagged machine, Out of service (`FloorRow.tsx:85-86`).
- Drifting AND At risk, drawn identically (`JourneyCase.tsx:48-49`; `ops.css:1000-1003`).
- Will-bank and will-run-out (`sentences.ts:239-240`).
- Left-open session (`hub-card.css:161`); Watch glyphs, i.e. no waiver and Pulse flag (`hub-card.css:425-428`).
- Heads up (Loudness and the Notes page).
- Dial −1.
- A failed data read: notices on Operations and the Hub (`JourneyPage.tsx:149-158`; `hub-grid.css:528`).
- "Draft" in the catalog list (`CatalogList.tsx:245`); "Couldn't save" in the Catalog (`catalog.css:131-135`); the Catalog's remove hover (`catalog.css:246-247`).
- The routine builder's "avoid" (`routine-builder.tokens.css:69-71`); a watch-out on the codex body figure (`body.css:189-194`).
- Identity collision: trainer tone t5 is the exact plum `#a2457e` (`calendar.tokens.css:73`).

**Green (`--eq-ok`, `--st-done`, `--jg-q-max-*`, `--jg-pf-gain`)**
- ok and Saved (`catalog.css:124-128`); done on Relay (`studio-tasks.tokens.css:36,63`); a machine "logged" on the phone (`phone.css:68`); booked and saved on the Wrap-up (`WrapUpScreen.tsx:849-858`).
- Steady and Back (`JourneyCase.tsx:47,53`); on-track renewal (`sentences.ts:238`); the **Renew glyph** on the Hub (`hub-card.css:440-443`).
- Max strength (Now Bar quality button, Staircase chip; `journey-grid.css:1655`; `machine-menu.css:437-441`); the "+N%" load gain since the start (`journey-grid.css:3534`; `machine-menu.css:96-99`).
- Dial +1 and +2 (`scales.ts:369-376`).
- A Pulse score rising and a pain resolved (`subjective-report.css:233,354`).
- Identity: FORD Recreation, Learning Legs, trainer t6 (= `--jg-pf-gain` `#15803d`), the Purpose 4P (emerald).

**Gold / amber**
- Gold `--jg-q-star` `#946609` marks max strength (★) AND tints the paused clock (`journey-grid.tokens.css:106`; `journey-grid.css:2371`).
- Tailwind amber-500: "In progress" (a running session) on the profile header (`ProfileHeader.tsx:658`); the Heads up chip (`journal.ts:533-539`); the "Clinical notes" chip (`ProfileHeader.tsx:561-568`); Pace 4P notes (`journal.ts:388-395`); the selected "A leader should follow up" toggle (`LogConversationDialog.tsx:224`); "Needs a leader" (`TouchHistory.tsx:44`); renewal warn (`RenewalCardDialog.tsx:55`); renewal errors (`RenewalCardDialog.tsx:171`; `TouchHistory.tsx:34`); Force Create in Add a client (`CreateClientModal.tsx`, cited in `docs/rounds/2026-10-04-navy-frame.md:224`).

### Inferences
- The documented hue jobs (orange = now and go; crimson = Critical, destructive, rep quality; plum = caution; blue = yours and picked) are kept on the Hub and largely in the session. Operations, Renewals, the briefing and the profile header add meanings that contradict them: orange as "needs attention", crimson as "not logged", "lapsed" or "away", blue as "new client" or "visit".
- Within FORD, identity and urgency use near-identical hexes (Family vs now 1.07:1; Occupation vs soon 1.03:1). The documented "identity, not status" restraint (`ford.tokens.css:10-22`) is undercut by colour coincidence.

### Gaps
- The analysis covers stylesheet and class assignments. It does not measure whether trainers actually confuse them; there is no usability evidence in the repo.

---

## 4. Splits: where one meaning gets different colours on different screens

### Takeaway
The worst splits are "Away", "Heads up", "a session is running", "max strength", "gain / increase", "today / now", "Urgent", "renewal due" and "error". Each is drawn in two to five different colours depending on the screen. Most of these splits come from screens still on raw Tailwind classes (profile header, renewal dialogs, journal chips, toasts) or from feature palettes that pick a different family for the same idea.

### Cited Findings
| Meaning | Colours, by screen | Sources |
| --- | --- | --- |
| A client **Away** | grey (Journey state neutral, Ops); grey (renewal situation neutral); **crimson** marker (briefing); **sand / amber** cell (client calendar); trainer days away = grey hatching on the Hub, amber on the trainer calendar (doc) | `JourneyCase.tsx:52`; `sentences.ts:241`; `briefing.css:709`; `client-history.css:46-52,454`; `day-header.css:558-560`; `docs/rounds/2026-10-04-navy-frame.md:224` |
| **Lapsed** | grey (Journey state); **crimson** (renewal situation) | `JourneyCase.tsx:50`; `ops.css:1005`; `sentences.ts:243` |
| **Heads up** (elevated) | plum (Loudness control, Notes page pill, Ops Today); **amber** (journal chip, Active Session elevated flag, briefing Heads up band) | `Loudness.tsx:39`; `notes-page.css:571,636-639`; `journal.ts:533-539`; `journey-grid.css:1775,2463,2484`; `briefing.tokens.css:31-33,76-77` |
| **Critical** | crimson token `#c0203f` (Hub, briefing, Notes page, Now Bar flag); Tailwind **rose-500/600** (journal chip, ring) | `hub-card.css:399-400`; `journal.ts:540-546` |
| **Caution / warning** | plum (core, Catalog, Admins); **amber** (briefing, toasts, front door, routine builder's lighter "caution", renewal dialogs); violet "watch" (Pulse) | `equipment.tokens.css:71-73`; `ToastContext.tsx:148-149`; `front-door.css:28`; `routine-builder.tokens.css:74-76`; `subjective-report.tokens.css:40` |
| **A session is running** | **orange** (bottom-bar Session tab, `--chrome-go`); **amber-500** ("In progress" on the profile header); **blue** (Hub card in session) | `AppBottomBar.tsx:116-127`; `ProfileHeader.tsx:658`; `hub-card.css:95-98` |
| **Max strength** | gold ★ (everywhere); **green** fill (Now Bar button, Staircase chip, phone mark); **orange** dot and swatch (Deep Dive); **blue** tile like any other set (session grid, profile chart) | `journey-grid.css:1655,3232,3374`; `machine-menu.css:437`; `phone.css:333`; `charts.tsx:98`; `clinical-review.css:264` |
| **Gain / increase** | **green** "+25%" (Now Bar, machine menu); **blue** ▲ (session grid, Wrap-up per set and per group); **orange** (trainer calendar "delta up"); **green** (Pulse delta up) | `journey-grid.css:3534`; `machine-menu.css:96-99`; `journey-grid.tokens.css:126`; `WrapUpScreen.tsx:384-386,824`; `calendar.css:386`; `subjective-report.css:233` |
| **Decrease** | muted ink (session, "deliberately NOT red"); **blue** (trainer calendar "delta down"); **red** (Pulse) | `journey-grid.tokens.css:116-127`; `calendar.css:387`; `subjective-report.css:234` |
| **Today** | **orange** ring (Hub day chip, client calendar, Ahead, calendar bars); **blue** inset ring and blue numeral (trainer calendar month grid) | `day-header.css:173-179`; `client-history.css:464`; `ahead.css:351`; `calendar.css:247,261,435-447`; `calendar.tokens.css:40,44` ("today, selection, focus") |
| **Now** | **orange** (Hub now line); **blue** dot (Relay Board "now" part of day) | `hub-grid.css:497`; `board.css:144`; `Board.tsx:434` |
| **Busy / heat** | **orange** (Openings full, Floor Map heat); **blue** ramp (trainer calendar heat map); **crimson** ramp (Deep Dive's poor-rate heat) | `openings.css:215-221`; `relay.css:22-40`; `calendar.tokens.css:48-60`; `panels.tsx:433` |
| **Renewal due / talk** | **green** glyph (Hub, run-sheet); **orange** button (Wrap-up); **blue** "act" (Ahead); **orange** attention tile (Ops pipeline) | `hub-card.css:440-443`; `WrapUpScreen.tsx:1050-1054`; `events.ts:117-118`; `RenewalsPipeline.tsx:279` |
| **Renewal "warn"** (will bank / run out) | plum (Ops badge, brief); **amber** (profile header dot, renewal card dialog) | `sentences.ts:239-240`; `ProfileHeader.tsx:160`; `RenewalCardDialog.tsx:55` |
| **Needs a leader** | plum (Ops pipeline); **amber** (touch history, conversation toggle) | `RenewalsPipeline.tsx:226`; `TouchHistory.tsx:44`; `LogConversationDialog.tsx:224` |
| **Urgent** (announcement) | **crimson** (Operations composer); **amber** `#F5A623` (the bell) | `AnnouncementComposer.tsx:449`; `NotificationBell.tsx:264` |
| **Done / logged** | grey recede (Hub card); **green** edge (phone machine card); green "done" (Relay); neutral grey "Completed" set | `hub-card.css:116-120`; `phone.css:68`; `board.css:296`; `journey-grid.tokens.css:93-95` |
| **Not logged** | grey with the words (Hub); **crimson** badge (Operations → Today) | `HubCard.tsx:287`; `TodayBrief.tsx:556-557` |
| **Health / Incident notes** | fuchsia / rose dots (Notes, by category); plum / crimson (Ops Today, by tone) | `journal.ts:420-451`; `team-notes.ts:96` |
| **Birthday / milestone** | **orange** (Hub Celebrate glyph, briefing marker edge); muted grey star (Ahead "moment"); orange corner dot (client calendar) | `hub-card.css:435-438`; `briefing.css:710`; `events.ts:127-128`; `client-history.css:469-479` |
| **Pain** | red (Pulse body region); plum diamond (codex body figure); **orange** (session skip reason) | `subjective-report.css:331,338`; `body.css:189-194`; `journey-grid.css:1703` |
| **Error** | crimson / destructive (Ops notice, `--destructive`); **plum** (Catalog "Couldn't save"); **amber** (renewal dialogs); Tailwind red (toast); front-door red `#ef6b6b` | `admin.css:915`; `catalog.css:131-135`; `RenewalCardDialog.tsx:171`; `ToastContext.tsx:143-144`; `front-door.css:29` |
| **Selection** | blue (core rule); **amber** ("A leader should follow up" toggle on); **orange** (Relay assign toggle `.sh__assign--on`, the progress-report editor's metric toggles, per the doc) | `LogConversationDialog.tsx:224`; `docs/rounds/2026-10-04-navy-frame.md:224` |
| **Save** | blue (core rule, most screens); **orange** (machine menu Save and Add note; machine-fit Save set-up; template editor; progress report Finalize) | `catalog.css:110-117`; `machine-menu.css:965-1006`; `docs/rounds/2026-10-04-navy-frame.md:197,218` |
| **Green itself** | `#17714b` forest (light ok) vs `#52d7c1` teal (dark ok); `#15803d` (gain); `#1a9c69` (max edge); Tailwind emerald | `equipment.tokens.css:68,166`; `journey-grid.tokens.css:104,172` |

### Inferences
- Most splits sit on the border between the tokenised core (Hub, session, Notes page, Operations kit) and older raw-Tailwind surfaces (`ProfileHeader.tsx`, the renewal dialogs, `IMPORTANCE_META`, toasts, the bell). The Navy Frame round already listed several as "recorded drift" ([doc] `docs/rounds/2026-10-04-navy-frame.md:224`: amber caution; Tailwind red and rose destructives).
- "Away", "Lapsed" and "Heads up" are the most consequential splits: each is a status a trainer or leader acts on, and each flips between alarm red and quiet grey or amber depending on the screen.

### Gaps
- Whether the trainer calendar's "today" in blue is deliberate (its token comment says "today, selection, focus", `calendar.tokens.css:44`) or a leftover was not settled in any round document found.

---

## 5. Where is meaning carried by colour ALONE?

### Takeaway
The core status systems mostly pair colour with a word, a glyph or a shape: Hub glyphs have distinct icons, Ahead marks have distinct shapes, Admins `HqStatus` has shapes, rep quality has ★ and kaizen marks, and booking outcomes are words. About a dozen places still rely on hue alone (or hue plus a tiny dot). The most significant: the Journey stop bands that make Drifting and At risk the same plum, the profile header's renewal-urgency dot, the Ahead strip's three bar colours, the Relay tab's now / waiting dots, the orange-vs-blue tiles that tell today's sets from history, note-category dots, the Hub's coming-up vs in-session blue edges, the trainer calendar's tones, and the Learning family hues.

### Cited Findings
- [doc] Stated intent: Ahead "Every mark is said in words beside it too; nothing depends on telling shapes or colours apart" (`src/features/admin/ahead/marks.tsx:1-8`). Openings "Colour only ever echoes a word that is also written: never the only signal" (`openings.css:12-14`). Rep quality "colour is the last of four cues" (`journey-grid.tokens.css:107-110`). The Hub "words are in the peek and the list" (`card-marks.ts:12-19`).
- Colour-alone or colour-dominant instances [code]:
  1. **Renewal urgency dot** on the profile header: a 6px dot coloured emerald, amber or rose by tone, `aria-hidden`, with no tone word (`ProfileHeader.tsx:333`).
  2. **Ahead's 26-week strip**: blue talk, grey date and plum watch bars, the whole strip `aria-hidden`; bar order is the only other cue (`WeekRun.tsx:69-80`; `ahead.css:154-164`). The detail below is in words.
  3. **Relay Board part-of-day tabs**: a 7px blue "now" dot vs a 7px orange "waiting" dot. Same shape, different hue; the words exist only in `aria-label` (`Board.tsx:434-436`; `board.css:144-146`).
  4. **Hub day chips**: the orange 6px "something to celebrate" dot carries no word on screen (only `aria-label`) (`DayHeader.tsx:158-170`; `day-header.css:162-167`). Today's orange ring vs the picked blue fill is a hue difference, with the underline as the shape cue [doc] (`day-header.css:200-213`).
  5. **Hub card left edges**: coming-up quiet blue vs in-session full blue (in-session adds a fill and a pulsing dot); left-open plum adds the words "Left open". [doc] The Key says coming up is "every mark shows until the session is done" (`DayHeader.tsx:285-287`).
  6. **Journey look tiles**: today's sets orange, history blue. The column position also tells them apart, but the orange-vs-blue tile is the main cue (`journey-grid.css:3232,3347-3351`).
  7. **Journey stops** (Clients → Journey): a 4px coloured band per state; Drifting and At risk are the same plum, told apart only by the name under the number (`ops.css:996-1012`; `JourneyPage.tsx:127-132`).
  8. **Note category dots**: a small hue dot per category (`NoteCategoryChips.tsx:43-46`), with Posture and Retention sharing indigo (`journal.ts:372-378,460-466`). Icons exist (`NoteCategoryIcon`) but the dot itself is hue-only.
  9. **Trainer tones**: on the trainer calendar the lanes, bars and avatars use 8 hashed hues (`calendar.tokens.css:7-17`); names and initials accompany most uses.
  10. **Learning family hues** (Push orange, Pull blue, Legs green...) on stripes and rules (`wiki.tokens.css:150-181`).
  11. **The client calendar's corner event dot**: a 4px orange dot for "progress report, alert, birthday"; the event is named under the month (`client-history.css:469-479`).
  12. **Calendar heat map / Floor Map heat**: single-hue ramps (blue / orange). Numbers are printed on the calendar heat cells (`calendar.css:521-542`); the Floor Map's heat has its own ramp (`relay.css:22-40`).
  13. **Dark ok vs Critical**: [doc] before the Navy Frame these were "nearly the same colour for a colour-blind trainer (2.1 apart)"; after it, "about 20 apart" (`docs/rounds/2026-10-04-navy-frame.md:19,62`). AJ was offered, as optional taste, "a brighter dark ok green (`#42e1bd`) so a done mark and a Critical mark differ more by colour as well as shape" (`docs/rounds/2026-10-04-navy-frame.md:225`).
- Good redundancy, for contrast [code]: Admins `HqStatus` (dot / diamond / dashed ring / hollow ring + word, `admins.css:458-509`); Ahead glyph shapes (`marks.tsx:14-28`); Hub glyph icons per family (`DayHeader.tsx:268-283`); rep quality ★ / kaizen / hatch (`journey-grid.tokens.css:96-115`); Loudness and Dial words (`scales.ts:43-48`); booking outcomes as words (`HubCard.tsx:183,287,294`); Openings cell words (`openings.css:207-213`).
- Legibility hazards [code; computed with `cr.py`]: the bell's "Urgent" chip, `#F5A623` on its 15% tint over the light popover, is about **1.7:1** (`NotificationBell.tsx:264`). `chart-4` sky `#0EA5E9` is 2.56:1 on the light card (used only as bar fills, with words beside them, `WrapUpScreen.tsx:320-334`). `--green #4FDB8E` is 1.63:1 on the light card. [doc] Calendar avatars put white initials on the orange tone at "3.55:1 light, 2.99 dark" (`docs/rounds/2026-10-04-navy-frame.md:224`).

### Inferences
- For colour-blind trainers (deuteranopia and protanopia, roughly 8% of men), the riskiest pairs that remain are plum vs crimson (Drifting/At risk vs Critical: the Navy Frame made the dark fills opaque partly because "crimson and plum washes go violet and become one colour", `navy-frame.md:45`), green vs orange glyphs on the Hub (Renew vs Celebrate, told apart by icon), and blue vs violet (Welcome vs Pulse watch vs blood flow).
- Under gym glare the hue-only cues that matter most for the floor are the session's today/history tile colours and the Hub's coming-up vs in-session edge. Both have a secondary cue (column position; fill plus pulsing dot), so they degrade gracefully, but the edge colours themselves are 3:1-class marks (`--eq-rail-booked` 3.1:1, `equipment.tokens.css:65`).

### Gaps
- No simulated colour-vision-deficiency rendering was done (read-only, no browser). The repo's tests check hero vs crimson and ok vs crimson separations for colour-blind trainers (`docs/rounds/2026-10-04-navy-frame.md:120`), but the exact metric was not read.

---

## 6. Charts and data viz: palettes, token use, distinguishability

### Takeaway
There is very little charting: one recharts line chart (Deep Dive), a handful of hand-drawn SVGs (Staircase, Deep Dive sparkline, InBody trend, Ahead clocks and marks) and CSS bars and heat maps. Series colours mostly come from tokens. The single-series lines are blue, and the ramps are single-hue (blue, orange, crimson), which reads well. The weak spots are the untuned `--chart-*` tokens (sky and amber, identical in dark), the Deep Dive's orange "max" (which contradicts green and gold elsewhere), and two categorical identity palettes (8 trainer tones, 7 Learning families) that reuse semantic hues.

### Cited Findings
- [code] Only one file imports recharts: `src/features/clinical-review/charts.tsx`. It draws the weekly time-under-tension line in `--cr-live` (blue) on a `--cr-border` grid with muted axes (`charts.tsx:11-13,49,68`). [doc] "The weekly tonnage column chart and the rep-quality mix were retired" (`charts.tsx:1-6`).
- [code] The Deep Dive machine sparkline: blue line; max sets as orange dots (`--cr-hero`), poor as crimson dots, the latest point blue (`charts.tsx:94-101`). The legend swatches: max = hero orange, done = grey, poor = crimson with a white hatch, blue = the line (`clinical-review.css:263-267`). The heat map is a crimson `color-mix` ramp by alpha, with words switching to the on-dark colour above 0.55 (`panels.tsx:433`). Its tokens alias the session grid's and the Hub's (`clinical-review.css:20-54`).
- [code] The Staircase (machine menu): plain SVG. The weight line and dots are `--eq-live`; rep chips use the grid's quality fills (done grey, max green, poor crimson + hatch); practice and blood flow rings are slate and violet; today's label and bar are orange (`machine-menu.css:360-500`). [doc] "plain SVG, performed sets only" (`CLAUDE.md`, machine menu row).
- [code] InBody trend: one `currentColor` line and dots (`src/features/inbody/InBodyTrend.tsx:67-69`).
- [code] Trainer calendar: day bars per trainer in that trainer's tone (`calendar.css:484`); today's bar orange (`calendar.css:435`); a heat map of six blue steps, its ink changing at step 4 (`calendar.tokens.css:48-60`; `calendar.css:521-542`).
- [code] Wrap-up "where the work went": sky (`chart-4`), amber (`chart-5`), ink-2 and grey bars, each with its name and share written beside it (`WrapUpScreen.tsx:320-334`). `--chart-3..5` have the same values in light and dark (`src/index.css:351-353,679-681`), and `chart-4` is the Tailwind sky the Navy Frame removed elsewhere ("no cyan, no Tailwind sky", `docs/rounds/2026-10-04-navy-frame.md:78`).
- [code] Ahead's two clocks per client (`clocks-geometry.ts`) and marks: blue (act), plum (caution), ink (date), muted (moment), each with a distinct shape (`marks.tsx`; `ahead.css:452-466,565-576,738-756`).
- [code] Machine trends (Learning → Catalog → How it's used): neutral ink and one `--cat-live` blue (`src/features/machine-trends/machine-trends.css`, grep tally: ink, border, one live).
- [code] Operations → Trends is sentences, not charts ("each only where data Journey already holds supports it, each with its named minimum", `src/features/admin/trends/TrendsPage.tsx:1-21`). "By trainer" reads "in name order with no red" (`TrendsPage.tsx:8-10`).
- [code] Categorical identity palettes: trainer tones t0-t7 (orange, logo blue, teal, violet, amber, plum, green, cyan-teal; `calendar.tokens.css:68-75`; their dark fills are rgba washes, `calendar.tokens.css:139-142`, which the Navy Frame elsewhere replaced with opaque fills because "an rgba orange wash over navy cancels to grey", `navy-frame.md:45`). Learning families: 7 hues (`wiki.tokens.css:150-181`). Note categories: 14 Tailwind hues (`journal.ts:372-483`).
- [code] Confetti on the Wrap-up: `bg-cta`, `bg-cyan`, ok green, star gold, live blue (`src/components/WrapUpConfetti.tsx:27`).

### Inferences
- The single-hue ramps (blue density, orange heat, crimson poor rate) are the right form for magnitude, but they use three different hues for "how much", so "more" has no single colour across the app.
- The 8 trainer tones and 14 note-category hues exceed the 6-8 categories most people can tell apart reliably by hue. Both also reuse the semantic orange, blue, plum and green, so an identity colour can be misread as a status.

### Gaps
- No chart was rendered, so actual series separability (for example sky vs logo blue on one screen) was not measured.

---

## 7. What earlier rounds said about colour, and AJ's own words (dated)

### Takeaway
Colour has been reworked four times: the Sep 9 light-mode retune, the Sep 12 visual-consistency round, the Sep 27 voice-review "one meaning per colour" pass and the Oct 4 Navy Frame with its follow-ups. AJ's consistent asks: less brightness and glare, more brand colour (the logo's blue and orange), "one meaning per colour", and trust in the designer's picks. The rounds themselves list the open drifts: amber caution, Tailwind red destructives, orange Saves, the trainer calendar's white-on-orange avatars and Learning's sky.

### Cited Findings
- AJ, Oct 4 2026 (voice note): "I think the light mode is just so bright and it just feels like it's like a negative mode almost ... in our dark mode, it just so gray. … like all like in the hub, nothing has color. I feel like we have a nice blue and orange logo color. … use our colors from the max strength logo to like maybe use those as the accent colors across our app … I think the colors is the thing that really puts me off the most." (`docs/rounds/2026-10-04-navy-frame.md:7-9`)
- AJ, Oct 4 2026: "ill take your pick for all 3 questions": 1A frame navy in both modes, 2A quiet blue edge for a coming-up card, 3A remove the studio accent colour, "nothing that can drift toward the red kept for Critical notes" (`navy-frame.md:29-35`).
- AJ, Oct 4 2026, on the follow-ups (orange Saves and selections to blue; the Journey tab's dates; firmer session outlines): "yes" (`navy-frame.md:152-158`).
- AJ, Oct 4 2026 (Type and depth): "a lot of buttons and backgrounds in the app currently have a sharp cutoff look, especially in light mode, there are sharp white boxs all over the place ..." (`CLAUDE.md`, the type-and-depth decision; `docs/rounds/CHANGELOG.md:769`).
- AJ, Oct 2 2026, on the Journey chart's colours: "the brand blues, but then also the orange for the now"; and on the settings boxes, "those should just remain gray" (`journey-grid.tokens.css:143-146`; `journey-grid.css:3236-3237`).
- AJ, Oct 3 2026, on practice / skipped / blood flow: "a small bubble with the icon indicating which one it was" (`journey-grid.css:3247-3250`).
- AJ, Sep 27 2026 (voice review): "I trust your color choices", the basis for "One meaning per colour, in Learning and My Studio as in the codex" (`docs/KNOWN-TRAPS.md`, Layout and CSS, the "One meaning per colour" bullet).
- AJ, Sep 28 2026, Hub question 2: "once the session is done it should make a lot less noise so trainers can focus on the rest of their day" (`src/features/hub-schedule/README.md:40`).
- AJ, Oct 3 2026, Operations: "there's just so many words on there. It's really overwhelming" (`CLAUDE.md:101`).
- Aug 29 2026 (CHANGELOG): the History grid's full-cell quality wash (`bg-emerald-100`) was replaced by a 2px inset ring at AJ's request; the live quality selector went back to solid-filled dots (`docs/rounds/CHANGELOG.md:1089-1090`).
- Sep 9 (iPad light-mode round): light had ground and cards "the same colour" (2% step); the token ladder was "upside down"; `--cta-strong` moved to `#BC2C00` because white on bright orange was 3.5:1 (`docs/rounds/IPAD-LIGHTMODE-AND-DATA-ROUND.md:93-118`).
- Sep 12 (visual consistency): the app was "built dark-first on Tailwind's stock slate scale"; 311 non-theme-aware utilities remained, "mostly semantic colours (`text-emerald-500`, `bg-red-50`) that want status tokens"; amber was then judged "correct semantics for 'a session is already running'" (`docs/rounds/VISUAL-CONSISTENCY-ROUND.md:8-30,99-105,189-191`).
- Sep 27 (KNOWN-TRAPS): "A flag or caution is plum ... Crimson is critical or destructive only ... the red kaizen mark stays rep quality's"; Learning had said caution in amber while the rest said plum; "Status words are never `text-green` / `text-amber` / `text-cta`: those are FILL colours ... 1.8:1, 2.0:1 and 3.1:1" (`docs/KNOWN-TRAPS.md`, Layout and CSS, "One meaning per colour" and "A feature's colour tokens carry the app's values").
- Navy Frame causes (Oct 4): light "100% brightness" cards and frame at 17-18:1; dark "frozen as Tailwind's stock slate"; "The Hub had no colour" ("every card had a grey left edge on a grey surface"); "11 of 72 readability checks failed"; "in dark the ok green and the Critical pink were nearly the same colour for a colour-blind trainer" (`navy-frame.md:15-19`).
- Navy Frame "Known trade-offs" (Oct 4): in light, your column and an in-session card fill are "nearly one tint (2.8 apart)"; the 3:1 border-strong "also draws on about 210 decorative readers"; "Faint ink still carries words in about 120 older rules"; FORD and Pulse dark fills are "1.03-1.14:1 off the navy card" (`navy-frame.md:141-150`).
- Navy Frame open question 8, "the next colour pass?" (Oct 4): calendar avatars' white initials on orange; Learning's dark Pull still sky; amber caution "a recorded drift from plum" (profile header flags, routine drawer, paused clock gold, elevated flags, briefing Heads up and safety band, calendar away days, Force Create, "Reason required"); destructives still Tailwind red and rose; orange states that look like selections (Operations' identity, Relay's assign toggle, the progress-report editor); a machine note's flag dot in the go pair where a flag is plum (`navy-frame.md:224`).
- Navy Frame open question 5: the Next 30 minutes strip's "now" edge is grey, while "grey on the Hub means 'over'" (`navy-frame.md:221`). Open question 2: Saves still orange (`navy-frame.md:218`).
- The guards that hold the current mapping: `src/core-tokens.test.ts`, `src/features/equipment/equipment-tokens.test.ts`, `src/features/hub-schedule/hub-colour-rules.test.ts`, `src/components/frame-colours.test.ts`, `src/page-grounds.test.ts`, `src/loud-orange.test.ts`, `src/palette-copies.test.ts`, `src/features/journey-grid/session-colour-rules.test.ts`, and `src/neutral-ramp.test.ts` (with `BARE_PALETTE_BUDGET` 127) (`navy-frame.md:117-127,165`; `CLAUDE.md:115`).

### Inferences
- AJ's language is consistently about feel ("bright", "gray", "nothing has color", "sharp", "overwhelming") and about brand ("our colors from the max strength logo"), rather than about specific semantic assignments. He has delegated the semantic mapping ("I trust your color choices", "ill take your pick").
- The recorded open drifts in the round documents line up with most of the splits found in Q4. The map above should be read as confirming and extending them, not as new disagreement.

### Gaps
- `docs/rounds/CHANGELOG.md` was searched for AJ quotes that mention colour, not read in full; older colour remarks without the word "colour" or "AJ" nearby may be missed.

---

## 8. Is there a written legend for colour meanings, and is it complete against what the screens draw?

### Takeaway
There are five in-app legends: the Hub's Key sheet, the session / profile rep-quality key, the Deep Dive chart legend, the codex body-figure legend and Ahead's word-plus-shape badges. Plus the comment-level "visual contracts" in token files. None covers the whole app. The Hub Key is the most complete for the grid's marks and card states, but omits the orange now line, today's ring, the celebrate day dot, your blue column, the open-card outline and the Next 30 strip's grey "now". The session key no longer explains the blue and orange tiles the grid now draws.

### Cited Findings
- [code] **Hub Key sheet** ("The Key"): MARKS lists Read first (crimson, "The only red mark"), No waiver signed and Pulse flag (Watch), New and Back after a break (Welcome), Milestone and Birthday (Celebrate), Renewal talk (Renew), Ask about (Get to know), each drawn with its real glyph and colour (`src/features/hub-schedule/DayHeader.tsx:268-283,304-333`). STATES lists Coming up, In session, Left open, Done or not logged, Not synced yet, Unassigned, Not a session and Not working, with matching swatches (`DayHeader.tsx:285-302,343-352`; `day-header.css:519-560`). It also explains the `#43` session number (`DayHeader.tsx:339-342`).
  - Not in the Key, though drawn on the Hub: the orange now line and pill (`hub-grid.css:491-510`); today's orange ring and underline (`day-header.css:169-213`); the orange "something to celebrate" day dot (`day-header.css:162-170`); your column's blue cast and rule (`hub-grid.css:98-99,345`); the blue outline of the card whose peek is open (`hub-card.css:84-89`); the spotlight dim (`hub-card.css` `[data-dim]`); the Next 30 minutes strip's grey "now" edge (`navy-frame.md:221`); the plum failed-read notice (`hub-grid.css:519-529`).
  - Partial mismatch: the Key's text for No waiver signed says "Mindbody ... its red 'nw' corner", and Pulse flag says "scored red", but both are drawn plum (`DayHeader.tsx:270-271`; `hub-card.css:425-428`).
- [code] **Rep quality key** (`QualityLegend`, opened from the session's corner and on the profile): Max ★, Needs improvement (kaizen), Done, Practice, Blood flow, Skipped, Not reached, Latest session (`src/features/journey-grid/GridToolbar.tsx:58-115`). Under `.jg-look` its colour swatches for max, needs-improvement and done are hidden (`journey-grid.css:3034-3036`), and nothing keys the blue history tiles, the orange today/newest tiles or the orange focus trace.
- [code] **Deep Dive legend**: max = orange, done = grey, poor = crimson hatch, blue = the line (`clinical-review.css:260-267`).
- [code] **Codex body legend**: plum diamond = on file (`body.css:208-230`).
- [code] **Ahead**: each row's badge is mark plus word (`marks.tsx:79-85`); the README spells out the strip's three colours (`src/features/admin/ahead/README.md`, the Weeks bullet), but the strip itself has no on-screen key and is `aria-hidden` (`WeekRun.tsx:69`).
- [doc] **Comment-level contracts**: `src/types/journal.ts:318-354` (note hue, chrome = loudness, edge texture = ownership); `src/features/client-history/client-history.css:5-24` (the calendar's colour key: blue visit, hatch break, sand away, orange today only, plum "hasn't been in", green/grey/crimson quality); `src/features/studio-tasks/studio-tasks.tokens.css:21-37`; `src/features/openings/openings.css:10-16`; `src/features/ford/ford.tokens.css:10-22`; `src/features/hub-schedule/README.md:38,75-84`; `src/components/WrapUpScreen.tsx:123-129`. These are developer documents, not trainer-facing legends.
- [doc] Stale against code: the Journey grid README still says "Cell fill = rep quality, and nothing else. Green (max) / red (needs improvement) / grey (completed)" (`src/features/journey-grid/README.md:45-46`), and the tokens file says "Green is the state a trainer should find from across the room" (`journey-grid.tokens.css:84-86`). FORD's header says "crimson is a set that needs work, green is max strength" (`ford.tokens.css:12-14`). Since Oct 3 2026 the session and profile grids draw no green fill (`journey-grid.css:2979-2991,3024-3029`).
- [code] An orphan legend: the `--mb-state-*`, `--mb-sync-*`, `--mb-access-*` and `--mb-origin-*` token families define a full Mindbody colour vocabulary (completed green, late cancel amber, no-show red...) that no screen reads (`src/index.css:186-210,605-626`).

### Inferences
- A single trainer-facing legend does not exist. The Hub Key is the model to extend: it draws the real glyph and colour beside each word. It would be complete for the Hub if it added the now, today and celebrate marks and your column.
- Several developer-facing "contracts" now contradict the code (green max fill), so the code, not those comments, is the reliable source for the current mapping.

### Gaps
- Whether the Activity Archive's calendar shows its colour key on screen was not confirmed; only the stylesheet comment (`client-history.css:5-24`) was read.
- Learning / Catalog family hues: no on-screen legend was found in the files read (the family name is the label); not exhaustively checked.
