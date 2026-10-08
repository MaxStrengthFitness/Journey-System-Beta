# Tighten Journey's colours, then redesign by screenshot

Journey's colour system is sound at its core and leaking at its edges. The six meaning colours you chose on Oct 4 2026 (the navy frame, blue for "yours, picked and every Save", orange for "now and go", green for ok, plum for caution, crimson for Critical, destructive and rep quality) line up well with colour theory and accessibility practice. Every pair the app's guard tests check passes the legal contrast standard in both modes: the navy frame stands at **12.65:1** against the light page, and Start's navy words on the logo orange at **6.05:1**. The problems sit where the guard tests don't look. About a dozen leftover colour systems (raw Tailwind amber, rose, sky and emerald, 14 note-category hues, 21 Mindbody tokens nothing reads) give one meaning up to five colours and one colour up to a dozen meanings. A notification chip sits at **1.70:1**. Dark mode's quiet words pass the legal measure but fall short on a newer one (**66 of 132** dark text pairs). Four colour pairs blur for some colour-blind trainers. The 2023–2026 design work worth copying is restraint, not decoration: one loud action, navigation that recedes, a headline with the proof one tap away. Apple's Liquid Glass can't be built properly in Safari, and it costs frame rate on a 10th-generation iPad. Claude models have led the public rankings for drafting attractive web screens for most of the last two years. They are documented to be weak at judging a whole screen, at exact layout, at the kind of accessibility a checker can't see, and at anything a desktop screenshot can't show (frame drops, touch feel). So the overhaul that starts tomorrow should open with a week of no-decision clean-up that enforces rules you already made. Next, you answer about a dozen colour questions, each with a recommended answer. Then the redesign goes screen by screen: Claude shows four directions as screenshots, you pick one, Claude builds only that, a guard test locks it, and the perf lab and a real iPad have the last word.

## The short version: five moves, in order

| Order | Move | Why it comes here |
|---|---|---|
| 1 | **Clean-up week.** Fix the 1.70:1 bell chip and the white-on-orange calendar avatars. Move the remaining Tailwind reds, roses and ambers onto the app's tokens where your rules already name the colour. Make the Hub's Key match what the Hub draws. Delete the dead colour code. Lower the palette ratchet from 127 to 115. Add guard tests for colour-blind pairs. | Each of these enforces a decision you already made, so none needs you. Each removes a source of drift before the redesign starts. |
| 2 | **Answer the colour questions in Part 6.** One colour per meaning, Heads up in plum, brighter quiet words in dark mode, which theme the floor starts in, Saves in blue. | These touch Oct 4–5 decisions, so they are yours to make. Each has a recommended answer and its cost. |
| 3 | **Redesign one screen at a time:** four directions, you pick, build only that, screenshot it at iPad sizes in light and dark, lock it with a test, check it in the perf lab and on a real iPad. | This is the method the model's maker documents for getting variety and avoiding its default look, plus checks for what the model can't see. |
| 4 | **Take the safe platform wins.** Keep the screen awake during a session (Wake Lock). Lay out components by their own width (container queries). Use short cross-fades outside the session (view transitions). Skip work on long lists until they scroll into view (content-visibility). | All of these reach the studio iPads with no new library. None touches the floor's "a tap never waits" rule. |
| 5 | **Don't build glass, spring motion on the floor, suggested weights or AI coaching, push alerts, or traffic-light scores.** | Each either breaks your rules or costs frame rate on the iPads the studios own. |

## Part 1. The palette is sound at its core and leaks at its edges

### Six meaning colours on one navy field

Journey's colours are written as **tokens**: named colour variables, such as `--chrome` for the frame, kept in `src/index.css` and in 14 feature files named `*.tokens.css`. A screen asks for a token by name and never types a colour code. The audit parsed every one of them, **699 colour tokens**, which come down to 184 distinct colours in light mode and 196 in dark. The count is large but the idea is small. Every neutral (the page, cards, ink, the frame) sits on the same blue hue, within about 4° of it. A handful of meaning colours is set against that cool field. The audit measured hue in **OKLCH**, a way of writing a colour as lightness (L, 0 to 1), chroma or colourfulness (C) and hue angle (h). It is built so that equal steps look equal to the eye ([Ottosson 2020](https://bottosson.github.io/posts/oklab/)).

| Meaning (your decision) | Token | Light | Dark | What it draws |
|---|---|---|---|---|
| The frame | `--chrome` | #002341 | #002341 (same) | Header, bottom bar, iPad status bar |
| Page, card, ink | `--background`, `--card`, `--foreground` | #DEE6EE, #F3F6F9, #192D41 | #0A1C2C, #14293D, #DFE7EF | Everything else |
| Blue: yours, picked, every Save | `--primary` = `--eq-live` | #0A548B | #65ABE9 | Your column, the picked day, in session, Saves, links, focus |
| Orange as a mark: now, today | `--eq-hero` | #D45A06 | #F36D21 | The now line, today's ring, the day dots |
| Orange as go: the one loud action | `--eq-go` with `--eq-go-on` words | #F36D21 with #071727 | same | Start, Finish, the paused Resume |
| Green: ok | `--eq-ok` | #17714B | #52D7C1 (teal) | A machine set up and in use, done, saved |
| Plum: caution | `--eq-warn` | #A2457E | #D98CBD | Flags, warnings, Left open |
| Crimson: Critical and rep quality | `--eq-alert` = `--jg-q-poor` | #C0203F | #F2718C | The Critical triangle, the kaizen mark |
| Red: destructive words | `--destructive` | #BB271B | #FF8C8C | Sign out, errors, invalid fields |

Sources: `src/index.css:313-345, 595-602, 650-672`; `src/features/equipment/equipment.tokens.css:24-82, 131-172`; `src/features/journey-grid/journey-grid.tokens.css:111`.

On screen the app is mostly neutral. Counting colour declarations in each screen family's stylesheets (declarations, not pixels), the Hub is 72% neutral, 16% blue and 4% orange. The Active Session is 67% neutral, 14% blue, 8% orange and 6% crimson. Operations is the calmest at 81% neutral. Add the navy frame, which takes about 12% of an upright iPad's height, and Journey runs at roughly 80% neutral, 12% blue and 8% for everything else. Blue is a clear second colour. The last few percent is shared by orange, crimson, plum, green and, on some screens, off-system amber.

### What the palette already gets right

Credit first, because most of the core follows best practice, and several of your Oct 4–5 choices are exactly what the research recommends.

**The frame and the body text are strong.** Body text measures **12.97:1** on a light card and **11.89:1** on a dark card. That is far above the 4.5:1 the accessibility standard (WCAG 2.2) asks for ordinary text ([WebAIM](https://webaim.org/articles/contrast/)). The frame's studio name is 14.58:1, its quiet icons 8.56:1, the tab you're on 6.50:1 and the running-session tab 5.33:1. Every contrast ratio written in a stylesheet comment that the audit checked matched its own measurement.

**Navy words on the logo orange is the legally correct choice.** White on #F36D21 is **2.99:1** and fails. Navy #071727 on it is **6.05:1** and passes. GitHub's design system makes the same move: its warning colour switches to dark text on strong yellow fills ([Primer](https://primer.style/foundations/color/overview)).

**The brand pair is the safest pair in the app.** Navy and orange are 156° apart in hue. They stay the most distinguishable pair under every colour-blind simulation (a colour-difference score above 48 in each, where under 10 counts as a near-miss). Orange and sky blue lead the best-known colour-blind-safe palette ([Okabe–Ito](https://cmap-docs.readthedocs.io/en/latest/catalog/qualitative/okabeito:okabeito/)).

**Dark mode follows the guidance from Google, Apple and Radix almost point for point.** Surfaces are a tinted navy, not black (page L 0.220, card L 0.274). The ink is an off-white #DFE7EF, not pure white. Raised surfaces get lighter as they rise, by +0.047 to +0.055 lightness per step, because shadows barely show on dark ([Material dark theme](https://m2.material.io/design/color/dark-theme); [Apple HIG, Dark Mode](https://developer-mdn.apple.com/design/human-interface-guidelines/foundations/dark-mode); [Radix](https://www.radix-ui.com/colors/docs/palette-composition/composing-a-palette)). The logo blue keeps its hue within 1.1° and its chroma within 0.003 between modes, while its lightness swaps from 0.435 to 0.720. That is Material 3's "keep the hue, change the tone" method exactly ([Material Color Utilities](https://chromium.googlesource.com/external/github.com/material-foundation/material-color-utilities/+/91da30d89e70c3dc9575ec71a1ebe8874d881f29/concepts/scheme_generation.md)). The dark fills are opaque and stay within 6° of their accent's hue. The exception is plum's fill, at 22°, inside the test's 25° allowance.

**Two deliberate choices hold up under measurement.** Plum was picked over amber for caution so it would not collide with orange for people with red–green colour blindness. Measured, it holds: hero orange against plum keeps a colour difference of **42.7** in that simulation. Critical and rep quality use one crimson on purpose, "instead of two near-reds" (`equipment.tokens.css:76-81`).

**Shape and words already carry meaning where it matters most.** The Critical mark is a triangle. Rep quality is a ★ and a kaizen ring, not only a fill. Ahead's marks each have their own shape. The Admins status marks are a dot, a diamond and a dashed ring. Hub booking outcomes are written as words. Aviation and military display guides require exactly this: anything critical must also be coded in shape or text ([Krebs, ONR Color Display Design Guide](https://apps.dtic.mil/sti/tr/pdf/ADA066630.pdf)).

**The guard tests are unusually strong.** Ten test files read the real stylesheets. They check that words reach 4.5:1 and edges 3:1 in both modes, that no white words sit on orange, that dark fills are opaque, that shadows are navy, that the feature palettes equal the Hub's, and that two colour-blind pairs stay apart.

### Contrast fails only where the guard tests don't look

The real contrast failures are all outside the guarded set. WCAG 2.2 asks for **4.5:1 for words and 3:1 for control edges and meaningful icons**.

| What | Colours | Measured | Needs | Where |
|---|---|---|---|---|
| Notification bell "Urgent" chip, light | `text-amber` #F5A623 on its 15% tint over the card | **1.70:1** | 4.5:1 | `src/features/notifications/NotificationBell.tsx:264` |
| Same chip, dark | The amber wash turns grey (#363C39) over navy | 5.58:1, but grey, the failure the Navy Frame banned | — | same |
| Bell's machine-flag icon, light | `bg-amber/10` | 1.75:1 | 3:1 | `NotificationBell.tsx:379` |
| Chart colours on the light card | `--chart-2` #F36D21, `--chart-4` #0EA5E9 (Tailwind sky), `--chart-5` #F59E0B (Tailwind amber) | 2.76, 2.56, **1.98** | 3:1 | `src/index.css:349-353`; drawn on the Wrap-up's "where the work went" bars |
| Calendar trainer avatar, white initials on the orange tone | #FFFFFF on #EF5302 (light) / #F36D21 (dark) | 3.55 / 2.99 | 4.5:1, and your "no white words on any orange" | `src/features/calendar/calendar.css:129-145` |
| Progress report hero | White on the retired orange #F06C22 | 3.06 | 4.5:1 (an exempt, always-navy screen) | `src/features/progress-report/progress-report.tokens.css:33-35` |
| Control edge on the light page ground | #7A8694 on #DEE6EE; on the pressed #D4DEE8 | 2.94; 2.72 | 3:1 (Navy Frame open question 4) | `--eq-border-strong`, `--jg-control-edge` |
| Routine builder's caution edge | #D9A45C on the light card; #8A5300 on the dark card | 2.06; 2.35 | 3:1 | `src/features/routine-builder/routine-builder.tokens.css` |
| Journey-look "skipped" and "practice" bubbles, light | #6B7884 on #EEF1F4; #4F6F8C on #E6EEF5 | 3.99; 4.495 | 4.5:1 if they carry words | `journey-grid.tokens.css:166-169` |
| Faint ink used as words | #7F8C99 (light) / #697B8D (dark) on a card | 3.17 / 3.41 | 4.5:1; "about 120 older rules" still do it | `docs/KNOWN-TRAPS.md`, Layout and CSS |

One near-miss is already avoided by rule. Light muted ink on the tray would be 4.42:1, so words on a tray use the second ink at 5.95:1. That is a good example of a rule doing its job.

Gym light makes the near-3:1 pairs matter more than the numbers suggest. Light reflected off a screen lifts its blacks and whites alike, so effective contrast falls as the room gets brighter ([GlobalSpec](https://www.globalspec.com/reference/40685/203279/6-2-readability-under-high-ambient-lighting-conditions)). The iPad mini has a laminated, anti-reflective screen with 1.8% reflectivity ([Apple](https://apple.com/uk/ipad-mini/specs)). The 10th-generation iPad's screen is not laminated ([Inverse](https://www.inverse.com/gear/why-10th-gen-ipad-has-non-laminated-display)). A rough model in the research puts a 10th-generation iPad near a window at about its WCAG figures. On that model, **anything near 3:1 has no headroom on the floor**, and a pair that low should never be the only way a trainer learns something at a glance.

### Dark mode's quiet words pass WCAG and fall short on APCA

**APCA** (the Advanced Perceptual Contrast Algorithm) is a newer contrast measure that accounts for text size and for polarity, meaning dark-on-light versus light-on-dark. Its score, **Lc**, runs to about 106, and its sign shows the polarity: negative means light text on a dark background. Its author's guidance is **Lc 75** as the minimum for columns of body text, **Lc 60** for ordinary content text, **Lc 45** for larger, heavier text such as bold headings, and **Lc 30** for the faintest text allowed ([APCA in a Nutshell](https://github.com/Myndex/SAPC-APCA/blob/master/documentation/APCA_in_a_Nutshell.md)).

APCA is not the law. The WCAG 3 working draft of March 2026 says its contrast method is "yet to be determined", and APCA was removed from the draft in July 2023 ([Adrian Roselli, April 2026](https://adrianroselli.com/2026/04/wcag3-contrast-as-of-april-2026.html)). Most of the evidence for APCA comes from its author ([Myndex](https://gist.github.com/Myndex/069a4079b0de2930e72d5401bde9af98)). Still, it tells a story WCAG 2 hides. Of 132 dark-mode text pairs, **66 pass WCAG and fall under Lc 60**. In light mode only 7 of 136 do.

| Pair | Colours | WCAG 2 | APCA Lc |
|---|---|---|---|
| Dark muted words on a card | #9DADBE on #14293D | 6.47:1 | **−53.4** |
| Dark muted words on a popover | #9DADBE on #22374B | 5.33:1 | −50.3 |
| Dark blue link on a card | #65ABE9 on #14293D | 6.05:1 | **−50.5** |
| Dark Save label | #071727 on #65ABE9 | 7.37:1 | 54.6 |
| Dark Critical crimson on a card | #F2718C on #14293D | 5.31:1 | **−45.2** |
| Dark plum on a card | #D98CBD on #14293D | 5.97:1 | −49.8 |
| Dark orange words on a card | #FF9455 on #14293D | 6.80:1 | −56.2 |
| Dark Sign out on a popover | #FF8C8C on #22374B | 5.47:1 | −51.9 |
| Dark slate-500 words on a card | #7E90A3 on #14293D | 4.53:1 | −38.1 |
| *Light muted words on a card (for comparison)* | #546271 on #F3F6F9 | 5.76:1 | 75.5 |
| *Light link on a card (for comparison)* | #0A548B on #F3F6F9 | 7.30:1 | 81.3 |
| Start / Finish, both modes | #071727 on #F36D21 | 6.05:1 | **46.9** |
| The now pill, light | #071727 on #D45A06 | 4.53:1 | **36.4** |
| White on the logo orange (banned) | #FFFFFF on #F36D21 | 2.99:1 | −61.1 |
| White on the deep orange `--cta-strong` | #FFFFFF on #B04000 | 5.87:1 | −83.6 |

Two lessons come out of this table. First, **dark mode's secondary words (muted labels, links, crimson, plum) are measurably weaker than light mode's**, even though their WCAG numbers look better. That matters for the small labels a trainer reads at a glance, and it matters more because the app's **default theme is still dark**, with a sign-out resetting to it (`docs/rounds/2026-10-04-navy-frame.md:136`). Second, the logo orange is a mid-lightness colour (L 0.688). On it, even pure black reaches only Lc 48 and white only Lc 61. So **no text colour on #F36D21 reaches APCA's level for ordinary 14px text**. The useful fix is size and weight, not navy versus white. Your navy-words rule stays the right gate, because WCAG 2.2 is the legal baseline. The deep orange #B04000 is the one orange that carries white words under both measures. It exists as `--cta-strong` and nothing uses it.

### Four colour pairs blur for colour-blind trainers

About **8% of men and 0.4–0.5% of women** of European descent have inherited colour-vision deficiency (CVD). Nearly all of it is red–green: **protan** (weak red cones) or **deutan** (weak green cones). **Tritan** (weak blue cones) is rare ([Colblindor](https://www.color-blindness.com/types-of-color-blindness)). The audit simulated each type with the validated Machado 2009 model ([Machado et al.](https://www.inf.ufrgs.br/~oliveira/pubs_files/CVD_Simulation/CVD_Simulation.html)), the same method the repo's own test uses. It scored each pair with **ΔE00**, a standard measure of how different two colours look: about 2 is barely noticeable, and under 10 was counted as a near-miss at a glance.

| Pair | Meaning clash | Normal vision | Worst simulated | Who | What rescues it today |
|---|---|---|---|---|---|
| Orange #F36D21 vs crimson #F2718C (dark) | Now / go vs Critical | 26.9 | **3.1** | Tritan | The triangle's shape; the test floor is ≥3, "may not get worse" |
| Hero #D45A06 vs crimson #C0203F (light) | Now vs Critical | 24.8 | 9.1 | Tritan | The triangle |
| Crimson #F2718C vs plum #D98CBD (dark) | Critical vs caution | **13.4** (a near-miss even with normal vision on the stricter OKLab measure, 0.083) | 9.8 | Everyone, worst for tritan | Words; no colour-blind test covers it |
| Crimson vs plum (light) | Critical vs caution | 18.4 | 9.6 | Tritan | Words |
| Rep "max" green #3FCA8E vs "needs work" crimson #F2718C (dark) | Quality | 70.5 | **2.9** | Deutan | ★ and the kaizen mark, by design |
| Blue #0A548B vs plum #A2457E (light) | Yours vs caution | 35.4 | **5.4** | Protan | Context only |
| Coming-up rail #668FBA vs the grey card edge #7F8C99 (light) | Still to come vs over | **9.9**, and 1.01:1 in lightness | 9.2 | Everyone | The other marks on a coming-up card |
| Blood-flow violet #C58CF0 vs blue #65ABE9 (dark) | Practice type vs yours | 27.4 | **1.4** | Deutan | The bubble's icon |

The four pairs that carry the risk are orange against crimson, crimson against plum, green against crimson and blue against plum. The coming-up rail and the blood-flow violet are smaller cases, each with a second cue. The repo's colour-blind test covers two of the roughly twelve meaning pairs (`src/features/equipment/equipment-tokens.test.ts:502-525`). The weak spot is the **warm cluster**: orange, crimson, plum and amber. They are separated mostly by hue at similar lightness. In dark mode, crimson was lightened to L 0.708, right next to orange at 0.688. Lightness is the one cue that survives every type of colour blindness. It also survives **small-field tritanopia**: everyone, colour-blind or not, loses blue–yellow discrimination on small marks ([Williams et al. 1981](https://aria.cvs.rochester.edu/papers/williams-etal_VR1981b.pdf)). So the structural fix is to **give colours that must be told apart different lightness**, not just different hue.

### One hue carries a dozen meanings, and one meaning wears five colours

Your Oct 4 decision gives orange three jobs: now, the one loud action, and Celebrate. The code gives it more. It also marks the Operations and Admins tab, and a "needs attention" count on Operations tiles (any lane with anyone in it, staff waiting, the dead-letter queue). It marks heat on Openings and the Floor Map. It still fills several Saves (the machine menu's Save and Add note, machine fit's Save set-up, the template editor, the progress report's Finalize). It marks a pain skip reason, max strength on the Deep Dive, "delta up" on the trainer calendar, and the newest day on the Journey chart.

Crimson's three decided jobs have grown to at least nine. The additions are "Not logged" on Operations → Today (`TodayBrief.tsx:556-557`), ended and lapsed renewals (`sentences.ts:242-243`), a client's Away marker on the briefing (`briefing.css:709`), "Upkeep overdue", an Urgent announcement, and Dial −2.

Plum means caution, and it also draws **Drifting and At risk identically** (`JourneyCase.tsx:48-49`), failed reads, Draft and "Couldn't save". Gold means both max strength (★) and a paused clock.

Every extra job weakens the one that matters. Visual-search research finds that a single colour no other item shares is found at a glance, whatever the screen size. Each similar colour added makes it slower to find ([Healey 1996](https://vis.cs.brown.edu/docs/pdf/Healey-1996-CEC.pdf)). So every orange count tile makes Start a little less instant.

The opposite problem is just as common. One meaning gets different colours on different screens, mostly where a screen still uses raw Tailwind classes (the client profile header, the renewal dialogs, the note-importance chips, toasts, the bell).

| Meaning | Colours today, by screen | Files |
|---|---|---|
| A client is **Away** | Grey (Operations states, renewals) · **crimson** (briefing) · sand/amber (client calendar) | `JourneyCase.tsx:52`; `briefing.css:709`; `client-history.css:46-52` |
| **Lapsed** | Grey (Journey state) · **crimson** (renewal situation) | `ops.css:1005`; `sentences.ts:243` |
| **Heads up** | Plum (Loudness, Notes page, Operations) · **amber** (journal chip, the session's elevated flag, the briefing band) | `Loudness.tsx:39`; `journal.ts:533-539`; `journey-grid.css:1775` |
| **Critical** | The crimson token (Hub, briefing, Notes, Now Bar) · Tailwind **rose** (journal chip) | `journal.ts:540-546` |
| **Caution** | Plum (core) · amber (briefing, toasts, routine builder, renewal dialogs) · violet (Pulse "watch") | `ToastContext.tsx:148-149`; `routine-builder.tokens.css:74-76` |
| **A session is running** | Orange (bottom-bar tab) · Tailwind **amber** ("In progress" on the profile header) · blue (Hub card in session) | `ProfileHeader.tsx:658` |
| **Max strength** | Gold ★ · green fill (Now Bar button, Staircase chip) · **orange** (Deep Dive) | `charts.tsx:98`; `clinical-review.css:264` |
| **Today** | Orange ring (Hub, client calendar, Ahead) · **blue** (trainer calendar) | `calendar.css:247,261` |
| **Renewal due** | Green glyph (Hub) · orange button (Wrap-up) · blue "act" (Ahead) · orange tile (Operations pipeline) | `hub-card.css:440-443`; `WrapUpScreen.tsx:1050-1054`; `events.ts:117-118` |
| **Renewal warning** | Plum (Operations) · amber (profile header dot, renewal card dialog) | `ProfileHeader.tsx:160`; `RenewalCardDialog.tsx:55` |
| **Urgent** | Crimson (Operations composer) · amber #F5A623 (the bell) | `AnnouncementComposer.tsx:449`; `NotificationBell.tsx:264` |
| **Error** | `--destructive` · plum (Catalog's "Couldn't save") · amber (renewal dialogs) · Tailwind red (toasts) | `catalog.css:131-135`; `RenewalCardDialog.tsx:171` |
| **Save** | Blue (the rule) · orange (machine menu, machine fit, template editor, Finalize) | `machine-menu.css:965-1006` |

The research found **seven distinct reds and seven distinct ambers in light mode alone**. "One crimson" holds only inside the tokenised screens. Consistency across screens is one of the oldest display-design rules: the same function gets the same colour everywhere ([FAA Human Factors Design Standard](https://hf.tc.faa.gov/publications/2016-12-human-factors-design-standard/full_text.pdf)).

### A dozen places still speak in colour alone

Most status in Journey has a word or a shape beside its colour, but about a dozen places rely on hue alone, or hue plus a tiny dot. These seven matter most.

| Where | What only the colour says | File |
|---|---|---|
| Profile header | Renewal urgency: a 6px dot, hidden from screen readers, with no word | `ProfileHeader.tsx:333` |
| Ahead's 26-week strip | Talks (blue), dates (grey), watch (plum) as bars | `WeekRun.tsx:69-80` |
| Relay's part-of-day tabs | A blue "now" dot against an orange "waiting" dot | `Board.tsx:434-436` |
| The Hub's day chips | An orange "something to celebrate" dot | `DayHeader.tsx:158-170` |
| Clients → Journey | Drifting and At risk share one plum band, told apart only by the name under the number | `ops.css:996-1012` |
| The Journey look (session and profile) | Today's sets are orange tiles and history sets blue; column position is a second cue | `journey-grid.css:3232, 3347-3351` |
| Note-category dots | Posture and Retention are both Tailwind indigo | `src/types/journal.ts:372-378, 460-466` |

The legends have drifted too. The Hub's Key (`DayHeader.tsx:268-352`) is the best legend in the app: it draws each real glyph beside its word. But it leaves out the orange now line, today's orange ring, the celebrate dot, your blue column and the open card's outline. Its words for two plum marks mention red (Mindbody's red "nw" corner, a Pulse "scored red"). The session's quality key no longer explains the blue and orange tiles the grid now draws. Two developer documents still describe the green quality fills that were removed on Oct 3 (`src/features/journey-grid/README.md:45-46`; `ford.tokens.css:12-14`).

### Leftover colour systems: 21 dead tokens and seven reds

Some colour code has no reader at all. Twenty-one Mindbody status tokens (`--mb-state-*`, `--mb-sync-*`, `--mb-access-*`, `--mb-origin-*`) are defined in `src/index.css:605-628` and read by no screen. The four old status colours `--green`, `--red`, `--amber` and `--yellow` (`src/index.css:551-554`) are set once for both modes. Their one live reader is the bell, because `SyncStatusBadge`, the other component that used them, is not imported anywhere. The Navy Frame round kept `--cta-strong`, the inverse `-l` ladder and `--cyan` "for a cleanup to retire or give a reader". Two colour helpers, `getRoleColor` and `getMuscleGroupColor`, have no callers.

Older values survive in places: Tailwind sky #38BDF8 on Learning's dark "pull" family, Tailwind slate on the progress-report editor's dark surfaces, and the retired orange #F06C22 / #EF5302 in the progress report and the calendar.

The ratchet test that counts theme-blind Tailwind colours allows **127**. The real count today is **115** (`src/neutral-ramp.test.ts:341`). Twelve new ones could land without a red test, and the file's own rule is to lower the budget whenever the count falls. Across all components, 306 Tailwind colour classes are not slate: amber 96, red 64, emerald 56, blue 40 and rose 39. These are the status and destructive colours that never moved onto tokens. There are 194 raw colour codes in 19 component files. 108 of them are in two files: the unmounted `ConsultationWizard.tsx` and the always-dark `LegacyChartImporter.tsx`.

The calendar's trainer tones and Learning's body-family colours still use see-through washes in dark mode. They go wrong the way the Navy Frame round found: the orange wash comes out a grey #383439, and the plum and pink washes turn violet. They are exempt from the tests as "identity colours".

### The chart colours are the least tuned part of the app

Journey draws few charts: one line chart (the Deep Dive), hand-drawn SVG (the Staircase, sparklines, Ahead's clocks) and CSS bars and heat maps. The single-series lines are blue, and the heat maps step one hue in lightness. Both are correct forms.

The `--chart-*` tokens are the weak part. Two of the five are the brand blue and orange, so the Wrap-up rightly avoids them. The other two are Tailwind sky and amber, the same in both modes, and both fail 3:1 in light (`src/index.css:349-353, 677-681`).

"How much" has three hues: blue on the calendar heat map, orange on Openings and the Floor Map, and crimson for the Deep Dive's poor-set rate. Max strength is orange on the Deep Dive but gold or green everywhere else.

Mature systems keep chart colours as their own set. IBM's Carbon applies a fixed order of chart colours separate from its status colours ([Carbon](https://carbondesignsystem.com/data-visualization/color-palettes/)). Atlassian's category colours carry no meaning and must be interchangeable ([Atlassian](https://atlassian.design/foundations/color-new/accents)). The 8 trainer tones and 14 note-category hues also go past what people can tell apart at a glance, and they reuse orange, plum and green, which already mean something.

## Part 2. Colour theory backs the navy-and-orange core and flags the warm cluster

The table measures Journey against each principle the research could source, with a verdict. "Confirms" means the current palette already does what the evidence says.

| Principle | What the evidence says | How Journey measures | Verdict |
|---|---|---|---|
| A complementary accent pops | One colour no other item shares is found at a glance, whatever the screen size ([Healey 1996](https://vis.cs.brown.edu/docs/pdf/Healey-1996-CEC.pdf)). A small orange accent "stands out" in a blue field ([Bridges 2006](https://archive.bridgesmathart.org/2006/bridges2006-517.pdf)). | Navy 248.9° against orange 45.0°: 156° apart in OKLCH. That is not an exact complement: the true opposite of the navy is 69°, an amber. In practice an orange wash over navy does cancel to grey (C 0.010), as the code's comment says. | **Confirms.** The risk is crimson, only 28° from orange. |
| The 60-30-10 rule | No experiment supports it; it is interior-decorating lore ([Apartment Therapy](https://www.apartmenttherapy.com/interior-design-rule-60-30-10-explained-37504313)). | About 80% neutral, 12% blue, 8% the rest. | **Don't chase the percentages.** |
| Build scales in a perceptual space | OKLCH keeps lightness and hue steady where the older HSL format doesn't ([Ottosson](https://bottosson.github.io/posts/oklab/)). Linear moved its themes to a perceptual space and cut 98 colour variables to three inputs: base, accent, contrast ([Linear](https://linear.app/blog/how-we-redesigned-the-linear-ui)). | Tokens are hex codes. The neutral ramp's lightness steps vary from 0.034 to 0.170 (63% variation in light, 47% in dark), about as uneven as Tailwind's own slate (51%). The crowded top (inset, ground, hairline) is deliberate. | **Partly.** Worth doing later, not this week. |
| Give each step one job | Radix's 12-step scale gives every step a job, from app background to high-contrast text ([Radix](https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale)). | Journey maps cleanly: page (step 1), card (2), wells and tray (3–5), hairline (6), the 3:1 control edge (7), solid fill (9), muted ink (11), ink (12). One value carries many names: the logo blue goes by 10. | **Confirms**, with aliases to retire. |
| Contrast standard | WCAG 2.2 is the conformance basis. WCAG 3's method is undecided ([Roselli](https://adrianroselli.com/2026/04/wcag3-contrast-as-of-april-2026.html)). | Every guarded pair passes. Dark mode's quiet words are weak on APCA. | **Confirms the gate.** Add APCA as a warning light. |
| Dark mode | Tinted dark surfaces, not black; lighter means higher; off-white ink; tone down saturated accents ([Material](https://m2.material.io/design/color/dark-theme); [Apple](https://developer-mdn.apple.com/design/human-interface-guidelines/foundations/dark-mode)). | Does all of it, except that the go orange keeps its full chroma. That is fine as a fill with navy words. As small text it is weak (4.96:1, Lc −42.6). | **Confirms.** |
| Light or dark for reading | Dark text on light reads better, especially at small sizes ([Piepenbrock et al. 2014](https://journals.sagepub.com/doi/abs/10.1177/0018720813515509); [NN/g](https://www.nngroup.com/articles/dark-mode/)). In glance-like reading under bright light the advantage is "only nominal" ([Applied Ergonomics 2017](https://www.sciencedirect.com/science/article/abs/pii/S0003687016302459)). | Dark is the default, and a sign-out resets to it. | **Question for you** (Part 6). |
| How many colour codes | 5 ± 2 ([FAA](https://www.faa.gov/sites/faa.gov/files/data_research/research/med_humanfacs/oamtechreports/0117.pdf)). Five or fewer under workload, always backed by shape or text ([Krebs](https://apps.dtic.mil/sti/tr/pdf/ADA066630.pdf)). Up to about seven can be found pre-attentively ([Healey](https://ics.uci.edu/~majumder/vispercep/percepcolforviz.pdf)). | The core six are at the top of the range. On top of them: 14 note hues, 8 trainer tones, 7 Learning families, Pulse's red-yellow-green and FORD's four pillars. | **Over the limit outside the core.** |
| Small marks need lightness differences | Small marks lose blue–yellow discrimination for everyone ([Williams 1981](https://aria.cvs.rochester.edu/papers/williams-etal_VR1981b.pdf)). | Dark orange and crimson are almost the same lightness. | **Fix.** |
| Colour never alone | Back colour up with shape or text ([Carbon status pattern](https://www.carbondesignsystem.com/patterns/status-indicator-pattern)). | Mostly yes; about a dozen gaps. | **Mostly confirms.** |
| Status conventions | Orange or amber usually means warning, in software and on flight decks ([Carbon](https://www.carbondesignsystem.com/patterns/status-indicator-pattern); [FAA](https://www.faa.gov/aircraft/air_cert/design_approvals/dah/human_factors)). Colour meaning is partly universal and partly learned (r = .88 across 30 nations, with national variation) ([Jonauskaite et al. 2020](https://biopen.bi.no/bi-xmlui/bitstream/11250/2761614/1/Jonauskaite_etal_2020_PsychScience.pdf)). | Orange means go. Caution moved to plum to avoid the collision. | **Confirms, if orange stays narrow.** Every "attention" orange works against it. |
| One colour, one meaning | Don't let meaning colours double as decoration ([Atlassian](https://atlassian.design/foundations/color-new/accents)). | Crimson's three jobs are a deliberate trade-off. The code adds six more. | **Tighten.** |
| A separate chart palette | Chart colours are their own ordered set ([Carbon](https://carbondesignsystem.com/data-visualization/color-palettes/)). | `--chart-*` partly reuses the meaning colours. | **Fix.** |
| Glance-size type | ISO 9241-303 asks for characters of 20–22 minutes of arc, with 16 as a common minimum (via a secondary source, [KomNet](https://www.komnet.nrw.de/_sitetools/dialog/13840)). | A rough calculation, using an assumed pixel size: 14px text on a 10th-generation iPad is about 11 minutes of arc at 60 cm. About 26px is needed for 20. Of the type scale 11 · 12 · 14 · 17 · 22 · 30, only 22 and 30 are glance-size at arm's length. | **Question for you** (the session's numbers). |

The pattern across the table: **the core follows the evidence, and the departures are all growth around it**. The extra colour systems, the extra jobs for orange and crimson, and the near-equal lightness in the warm cluster all came later. None is a flaw in the Navy Frame's design.

## Part 3. The useful UI of 2023–2026 is restraint, not glass

### Liquid Glass: take the geometry, skip the glass

Apple introduced Liquid Glass at WWDC in June 2025 for iOS and iPadOS 26. It is a see-through, light-bending material for the navigation and control layer, meant to stay "visually clear, deferring to the content underneath" ([Apple, Meet Liquid Glass](https://developer.apple.com/videos/play/wwdc2025/219/)). The reception was rough. Nielsen Norman Group (NN/g, the usability research firm) titled its October 2025 review "Liquid Glass Is Cracked, and Usability Suffers in iOS 26". It noted that "controls appear, vanish, collapse, and expand depending on context" ([NN/g](https://www.nngroup.com/articles/liquid-glass/), read via excerpts). Apple then stepped back in stages. iOS 26.1 added a Clear/Tinted setting ([9to5Mac](https://9to5mac.com/2025/11/03/apple-releases-ios-26-1-for-iphone-with-these-changes/)). The design chief who fronted it left for Meta in December 2025 ([Six Colors](https://sixcolors.com/post/2025/12/in-a-major-coup-for-someone-alan-dye-leaves-apple/)). iOS 27 retuned the material, added a darker edge, added a solid "uniform toolbar" when content scrolls under the bars, and added a clear-to-tinted slider ([MacRumors](https://macrumors.com/2026/06/10/how-liquid-glass-is-changing-in-ios-27)).

The parts worth keeping are cheap and need no glass. The first is **concentric corners**: a box inside a box has a corner radius equal to the outer radius minus the padding ([Macworld](https://www.macworld.com/article/2807925/meet-liquid-glass-apple-redesigns-all-its-interfaces-at-once.html)). It suits Journey's raised, well and panel nesting. The second is a **solid scroll edge** under any bar that content passes beneath. The third is the rule that glass belongs only on navigation and controls, never behind content and never stacked ([Pixel Envy, summarising the HIG](https://pxlnv.com/linklog/hig-liquid-glass/)).

The glass itself is a poor fit for Journey. Safari can blur, but it cannot draw Liquid Glass's lensing: an open WebKit bug, still unfixed in June 2026 ([WebKit 245510](https://bugs.webkit.org/show_bug.cgi?id=245510)). Safari also cannot see the iPad's Reduce Transparency setting ([caniuse](https://caniuse.com/wf-prefers-reduced-transparency)). And the Active Session's whole point is that a trainer's eyes land on the same spot every time. Your opaque navy frame is already the right answer.

### Material 3 Expressive: one bigger, nearer key action is the part that tested well

Google calls Material 3 Expressive (May 2025) its most-researched update: 46 studies and more than 18,000 people. Its headline claim is narrow. In eye-tracking across 10 apps, participants "were able to spot key UI elements up to four times faster". The example was a Send button made larger, given a colour and moved above the keyboard ([Google Design](https://design.google/library/expressive-material-design-google-research)). Older participants found key elements as fast as younger ones ([Dezeen](https://www.dezeen.com/2025/05/28/google-ushers-in-age-of-expressive-interfaces-with-material-design-update/)). These are vendor numbers, with no published statistics.

The part that transfers is "the one key action, bigger, coloured and near the hand". That is your "orange is now and go", and it argues for keeping Start and Finish the only orange buttons on their screens. The springy, shape-morphing motion does not transfer to the floor. Even Google's guidance reserves it for "hero moments" (a third-party summary). On iPad Safari, spring-style easing curves were reported in April 2026 to force animations onto the main thread and drop frames ([WebKit 312407](https://bugs.webkit.org/show_bug.cgi?id=312407)).

### Linear and calm technology: navigation recedes, alerts default to off

The professional tools moved toward quiet. Linear's March 2026 refresh started from "not every element deserves equal visual weight" and made its navigation "slightly dimmer so the main content stands out" ([Linear](https://linear.app/blog/behind-the-latest-design-refresh)). The Calm Tech Institute, founded in 2024, certifies products whose rules include that "all but the most essential alerts ship switched off" ([IEEE Spectrum via Slashdot](https://tech.slashdot.org/story/25/01/22/056208/calm-tech-certification-rewards-less-distracting-tech)).

Sports typography kept condensed display faces for headlines, with a neutral face for numbers. The 2026 World Cup scoreboard set its timer and scores in a neutral sans ([Pimp my Type](https://pimpmytype.com/?p=24064)). WHOOP sets words in Proxima Nova and numbers in DIN ([WHOOP brand guidelines](https://developer.whoop.com/assets/files/WHOOP%20-%20Brand%20%26%20Design%20Guidelines-bdea3554e94b4ea09e68695b1e8dc8e7.pdf)). That matches your Saira Condensed for titles and Geist for everything else. The one addition worth making is **tabular figures** on numbers that change in place, so digits don't shift width as reps and weights change.

### Fitness apps: headline first, and half their features break your rules

The 2024–2026 fitness redesigns share one shape: one headline state up front, detail one tap away, and a short set of big numbers during a workout. WHOOP's 2025 Home puts three dials on top, each opening a deep dive. Users choose which metrics show, and can hide scores on game days ([WHOOP](https://www.whoop.com/us/en/thelocker/the-all-new-whoop-home-screen/)). Oura's October 2025 redesign cut five tabs to three around a daily "One Big Thing" ([9to5Google](https://9to5google.com/2025/10/20/oura-app-redesign/)). watchOS 26 lets users pick their in-workout metric views ([MacStories](https://www.macstories.net/stories/watchos-26-the-macstories-public-beta-preview/)). Strava's 2025 Record screen shows stats and the map together, so nobody switches screens mid-activity ([the5krunner](https://the5krunner.com/2025/07/16/strava-app-redesign/)).

Much of the rest is what Journey's method rules out. Hevy's Live Activity shows a prescribed target weight and reps ([Hevy](https://help.hevyapp.com/hc/en-us/articles/35649846517399)). Peloton IQ offers "suggested weights" and form correction ([Peloton IQ](https://www.businesswire.com/news/home/20251001016206/en)). Apple's Workout Buddy speaks AI coaching aloud ([Tom's Guide](https://www.tomsguide.com/wellness/fitness-trackers/apple-watch-just-got-an-ai-fitness-coach-how-to-enable-workout-buddy-in-watchos-26)). WHOOP grades the person with a red-yellow-green Recovery score ([WHOOP](https://developer.whoop.com/docs/whoop-101)). Each breaks "never a coach, never suggests a progression" or "sentences, not scores". **None of these transfer.**

### Cars, kitchens and clinics set the glance budget

The best-evidenced glance rules come from driving. US guidelines allow no single glance away of 2 seconds or more, and no more than 12 seconds per task ([US DOT](https://www.transportation.gov/briefing-room/us-dot-releases-guidelines-minimize-vehicle-distractions)). Android for Cars sets 24dp as the smallest glanceable text and 32dp for "decision" text, with 76 × 76dp touch targets ([Google](https://developers.google.com/cars/design/design-foundations/visual-principles)). A car is not a gym, but both are "used while attention is elsewhere, at arm's length". Both figures are well above Journey's 14px body text and 40px control floor.

Kitchen display systems colour an order ticket by its age: grey, then yellow, then red, then green when done ([GoTab](https://docs.gotab.io/operator/kds-printers-additional-display-setup/kds-ticket-timer/)). That fits Journey's timing states, such as a booking nobody logged. It must never grade a client.

Hospital alarm research is the strongest support for your "Operations says it once" rule. In one children's hospital video study, 86.7% of ICU alarms were false or needed no action, and "caregiver response times increased as the number of false, or nonactionable, alarms increased" ([CHOP Research](https://research.chop.edu/cornerstone-blog/researchers-honored-using-video-better-understand-alarm-fatigue)).

### iPad layout and leader dashboards

Apple's iPad pattern since iPadOS 18 is a compact tab bar that can open into a sidebar ([Apple WWDC24](https://developer.apple.com/videos/play/wwdc2024/10147/)). A third-party summary of Apple's guidance recommends 2–5 top-level places ([skills.sh, citing the HIG](https://www.skills.sh/jpoindexter/design-and-ai-skills/ios-components)). Operations' seven destinations are past that, which supports a sidebar in landscape, as Admins already has. iPadOS 26 added free window sizing, so a layout should respond to the width it actually gets, not to portrait or landscape. Since iOS 26, every site added to the Home Screen opens as a web app by default ([heise](https://heise.de/-10749652)), which makes setting up a new studio iPad simpler.

For leaders, the industry moved from walls of charts to a headline plus drill-down. Tableau Pulse (2024) writes a sentence about a metric and says whether a change "falls within an expected range" ([TechTarget](https://www.techtarget.com/searchbusinessanalytics/news/366571065/Tableau-launches-Pulse-a-GenAI-fueled-insight-generator)). That is your "named minimum sample", done by a language model. Google's own test of AI-generated interfaces still found pages built by human experts preferred, even ignoring generation time ([Google Research](https://research.google/blog/generative-ui-a-rich-custom-visual-interactive-user-experience-for-any-prompt/)). Journey's deterministic sentences are the safer version of the same idea.

| Trend | Fits Journey? | How |
|---|---|---|
| Liquid Glass translucency, lensing, controls that morph on scroll | **No** | Can't be drawn in Safari; costs frame rate; moves controls a trainer expects in place |
| Concentric corners, solid scroll edge, glass only on chrome | **Yes**, cheap | Add to the Refined Lift recipes |
| Material Expressive: one larger, coloured key action near the hand | **Yes** | Already your Start / Finish rule; keep it the only orange on its screen |
| Spring and shape-morph motion | **Not on the floor** | At most short cross-fades between screens |
| Linear's receding navigation; calm tech's "alerts off by default" | **Yes** | Already the direction of the calm Hub and calm Operations rounds |
| Condensed display with a neutral face for numbers | **Yes** | Already Saira plus Geist; add tabular figures |
| Bento grids | **Leaders only**, as "size equals importance" | Today and Week pages; never truncate a name to fit a tile |
| WHOOP / Oura headline plus drill-down; user-chosen metrics | **Yes** | The Hub, the briefing and Operations → Today already lead this way |
| Next exercise visible (Hevy) | **Yes**, as the next machine | A fact, never a target |
| Target weights, suggested weights, AI or spoken coaching, form correction | **No** | Breaks "never a coach" |
| Red-yellow-green scores on a person; streaks or leaderboards among trainers | **No** | Breaks "sentences, not scores" and "recognition, never ranking" |
| Live Activities, push, badges, haptics as confirmation | **No** | Breaks "nothing contacts"; web haptics are fragile |
| Driving glance budget: 2 s per glance, 24/32 text, large targets | **Yes**, as a reference point | Size the numbers read at the machine |
| Kitchen-ticket ageing colours | **Yes**, for timing only | Never to grade a client |
| Alarm-fatigue evidence | **Yes** | Supports "say it once" and "All clear" |
| iPad sidebar in landscape; layouts by width | **Yes** | Operations' seven destinations; container queries |
| AI-written summaries for leaders | **Not now** | If ever, the model phrases only numbers the rules already computed |

## Part 4. Safari 27 reaches every studio iPad, but blur and old versions still bite

Every iPad in scope (the 9th and 10th-generation iPad, the A16 iPad, and the iPad mini 6 and later) can run iPadOS 27, released on Sep 14 2026 ([9to5Mac](https://9to5mac.com/2026/09/09/ipados-27-will-be-launched-on-september-14/); [MacRumors](https://www.macrumors.com/2026/06/08/ipados-27-drops-support-for-a-wave-of-ipads/)). Whether a feature is usable is therefore a question of whether the studios update their iPads, not of hardware. Two hardware facts matter for colour. The 10th-generation and A16 iPads have **sRGB screens**, the standard colour range, not the wider P3 range ([Croma](https://www.croma.com/unboxed/10th-generation-apple-ipad-all-you-need-to-know); [EveryMac](https://everymac.com/systems/apple/ipad/specs/apple-ipad-a16-11-inch-11th-gen-2025-a3354-wi-fi-only-specs.html)), so a "more vivid" P3 orange shows only on the minis. None of these iPads has ProMotion, so 60 frames a second is the ceiling.

Journey already sends one boot report per cold open (`src/features/boot-timing/`). Adding the Safari version to it would replace a guess about the studios' oldest Safari with data. The versions below come from MDN's browser-compatibility data, version 8.1.4, dated Oct 1 2026 ([BCD](https://github.com/mdn/browser-compat-data); [web-features](https://github.com/web-platform-dx/web-features)).

| Feature | What it would do for Journey | First iPad Safari | Verdict |
|---|---|---|---|
| OKLCH colours, `color-mix()` | Author tokens in a perceptual space; derive hover and pressed states from one token (already in 16 stylesheets) | 15.4 / 16.2 | **Safe now** |
| `prefers-contrast: more` | Firmer ink and edges when a trainer turns on Increase Contrast | 14.5 | **Safe now** |
| Container queries | One component (Hub card, roster row, Operations panel) that fits phone, portrait, landscape and a split pane | 16 | **Safe now**; the biggest layout win |
| `:has()`, subgrid, `<dialog>` | Parent-state styling; aligned columns on the roster; modal sheets | 15.4–16 | **Safe now** |
| `@starting-style`, `linear()` easing | Entry animations for sheets and toasts in pure CSS | 17.5 / 17.2 | **Safe now**, opacity and movement only |
| `text-wrap: balance`, tabular figures | Even headings; steady digits | 17.5 / 9.3 | **Safe now** |
| View transitions, via React 19.3's `<ViewTransition>` (stable Sep 9 2026; Journey is on 19.2.5) | Short cross-fades for screen, profile-tab and Hub-day changes, with no new library ([React](https://react.dev/blog/2026/09/09/react-19-3)) | 18.0 | **Enhancement**, ≤250 ms, never mid-set. React does not respect reduced motion by itself ([React docs](https://react.dev/reference/react/ViewTransition)) |
| `content-visibility: auto` | Skip off-screen rows of the 300-client roster, the Directory and the Activity Archive (already in 3 rules) | 18 (full 26) | **Extend**; older Safari ignores it harmlessly |
| Screen Wake Lock | Keep the iPad awake from Start to Finish | 18.4 in Home Screen apps | **Strong candidate** |
| Scroll-driven animations | A shrinking header | 26 | Enhancement only |
| `backdrop-filter` blur | Frosted bars | 9 (prefixed) | **High cost**: re-draws what's behind on every frame ([WWDC 2015](https://nonstrict.eu/wwdcindex/wwdc2015/501/)); blank screens inside scrolling panes ([yuvomi](https://newreleases.io/project/github/ulsklyc/yuvomi/release/v0.52.26)). Small fixed chrome at most, or none |
| `prefers-reduced-transparency` | — | **Not in Safari** | Don't rely on it |
| Popover API | Menus that close on an outside tap | Full only from 18.3 | Keep the current menus unless the floor is 18.3 |
| Anchor positioning | Tooltips and (i) panels tethered without code | Full only in 27 | Not yet |
| `@scope` | Scoped CSS | Broken on inputs in 26.0–26.3 | Avoid |
| `interpolate-size`, `navigator.vibrate` | Animate to auto height; vibration | **Not in Safari** | Unavailable |
| Push, notifications, app badge | — | 16.4 (Home Screen apps) | **Out by your policy** |

One item from the platform research is already handled. A note flagged the `@media (display-mode: standalone)` rule at `src/index.css:973` as never matching in an installed iPad app. The comment above it already says the media query "may not match in iPadOS 26's Home Screen app", and the rule right after it sets the same navy from `navigator.standalone`. It is not a live defect.

## Part 5. Claude drafts screens well and judges whole rooms poorly

### What the evidence says it is good at

The independent signal is a crowd-voted arena. Two anonymous models each build a web app from the same prompt, and a person votes for the better one. Simon Willison noted that this board "turns out to actually be a React, TypeScript and Tailwind benchmark" ([Willison](https://simonwillison.net/2024/Dec/16/)), which is Journey's exact stack. Claude models held first place on it for most of December 2024 to September 2026. Claude 3.5 Sonnet led at launch. Opus 4.5 Thinking led at 1519 in December 2025 ([Blog du Modérateur](https://www.blogdumoderateur.com/ia-meilleurs-modeles-code-developpement-web-decembre-2025/)). Opus 5 led at about 1704 in August 2026 ([ainexhub](https://ainexhub.com/benchmarks/webdev-arena/)).

The September 2026 picture conflicts. One outlet put OpenAI's GPT-6 Astra Max first on Sep 11 ([RuntimeWire](https://runtimewire.com/article/arena-gpt-6-astra-webdev-leaderboard-claude-agents)). A secondary report put Claude Opus 5.5 first on Sep 23 at 1,818, on far fewer votes, with a rank range of 1–2 ([Remio](https://www.remio.ai/post/claude-opus-5-5-webdev-ranking-puts-anthropic-ahead-of-gpt-6-astra)).

The pattern is that Claude is at or near the top for a pleasing first draft. "Number one" is a snapshot.

The other evidence points the same way, with limits. On drafting from a reference image, Claude 4.6 models took first to third place at the April 2026 launch of Arena's Image-to-WebDev board ([Arena](https://x.com/arena/status/2044480481790726161)). On an automated benchmark of 1,825 visual tasks, Claude Opus 4.1 scored 59.76, second to GPT-5's 72.55 in August 2025 ([ArtifactsBench](https://github.com/Tencent-Hunyuan/ArtifactsBenchmark)): strong, not dominant.

Anthropic's own 2026 claims are about seeing screens rather than taste. Opus 4.7 accepts images up to 2,576 pixels on the long edge ([Anthropic](https://www.anthropic.com/news/claude-opus-4-7)). Opus 5 reportedly checked pages at two widths and fixed a button hidden off-screen ([Anthropic](https://www.anthropic.com/news/claude-opus-5)). Opus 5.5 scores 89.0% on a chart-reading test, and it cut load times across a web app in 39 of 40 internal attempts ([Anthropic](https://www.anthropic.com/news/claude-opus-5-5)). Its docs say it reads meaning that "depends on position rather than text" better than earlier models ([Anthropic docs](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-5-5)). These are vendor numbers. What they do show is that **a screenshot review loop is far more workable in late 2026 than it was a year earlier**.

### Where it is weak, in its maker's own words

Anthropic is frank about the main weakness. Left without direction, the model "samples from this high-probability center" of web design. In the 2025 generation that meant Inter and Roboto fonts and "purple gradients on white" ([Claude blog, Nov 2025](https://claude.com/blog/improving-frontend-design-through-skills)). The Opus 4.8 docs describe a "consistent default house style": warm cream backgrounds (about #F4F1EA), serif display type, italic accent words and a terracotta accent. They add that vague instructions such as "make it clean" "shift the model to a different fixed palette rather than producing variety" ([Anthropic docs](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-4-8)). The Opus 5.5 docs say it "falls back on a few default styles". They recommend naming the patterns to avoid, for example "a cream or off-white background, italic accent words in headlines, numbered '01/02/03' section labels, monospace labels, or pill-shaped buttons", and extending the list after each result ([Anthropic docs](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-5-5)). The house style the docs describe is close to everything the Navy Frame is not: a cool off-white #F3F6F9, Saira Condensed, orange only for now and go.

Independent research names the other weak spots.

| Weak spot | Evidence |
|---|---|
| **Exact layout** | Screenshot-to-code models "mostly struggle to recall visual elements from the input and to produce correct layouts" ([Design2Code](https://arxiv.org/abs/2403.03163)) |
| **Accessibility a checker can't see** | A CHI 2026 study counted 541 semantic accessibility violations across 300 AI-generated interfaces, of a kind automated checkers "cannot assess"; an AI reviewer found 80–92% of them ([Calò, Gurita & De Russis](https://iris.polito.it/handle/11583/3008330)) |
| **Design trade-offs** | AI tools "lack the sophistication to weigh design tradeoffs ... without extensive guidance from humans" ([NN/g](https://www.nngroup.com/articles/testing-ai-methodology)) |
| **"Almost right" work** | 66% of developers cite "AI solutions that are almost right, but not quite" ([Stack Overflow 2025](https://survey.stackoverflow.co/2025/ai)) |
| **Revisions that get worse** | Screenshot feedback loops help, but "a subsequent revision can be worse"; the fix was to accept only steps that strictly improve ([ReLook](https://arxiv.org/abs/2510.11498)) |

No study measured performance on old iPads, but neither the model nor a desktop screenshot can see a dropped frame. Felt speed can mislead as well. Experienced developers in a 2025 trial were 19% slower with AI while believing they were 20% faster ([METR](https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/)). METR has since called that result historical ([2026 update](https://blog.robbowley.net/2026/04/04/metrs-developer-productivity-research-2026-update/)).

### What that means for running the overhaul

Journey is already set up the way the documented best practice asks. Its design system is concrete values in CSS variables, its rules are tests, and its decisions are written down. Anthropic's Claude Code guidance is to "give Claude a check it can run: tests, a build, a screenshot to compare", to use a fresh-context reviewer, and to test any sweep on a few files before running it on all of them ([Claude Code best practices](https://code.claude.com/docs/en/best-practices)). The same guidance warns that "bloated CLAUDE.md files cause Claude to ignore your actual instructions" and says knowledge needed only sometimes belongs in a skill: a separate instruction file Claude loads only for that kind of task. Your CLAUDE.md is very long, so the overhaul's rules belong in a design-overhaul skill loaded for UI work, not in more CLAUDE.md lines.

The division of labour follows from the evidence:

| Job | Who leads | Why |
|---|---|---|
| Four distinct directions for a screen, as screenshots | Claude | Arena strength; Anthropic's documented method for variety |
| Choosing between them | **You** | NN/g: models can't weigh trade-offs alone |
| Building the chosen one against the tokens | Claude | Tokens and tests are the inputs it handles best |
| Mechanical sweeps (Tailwind red to `--destructive`, a decision applied to every screen) | Claude, under the guard tests | Claude Code's fan-out method; tests catch drift |
| SVG charts (Staircase, Ahead) | Claude | Strong on SVG and data visuals; strong chart reading |
| Whole-screen hierarchy, crowding, a chip that wraps oddly in portrait | **You**, from screenshots | Its weakest area |
| Touch feel and motion | **You, on a real iPad** | Can't be screenshotted |
| Frame rate on a 10th-generation iPad | The perf lab, then Safari Web Inspector on a device | Invisible to the model; the perf lab can't see Safari's paint |
| Screen-reader and semantic accessibility | An AI review pass plus one human VoiceOver walk | CHI 2026 |
| Locking each decision | Claude writes a guard test | A test is a rule the model can't talk its way past |

## Part 6. The overhaul, ranked

### First: twelve fixes that need no decision from you

Each of these enforces a rule you have already made, removes dead code, or adds a test. None changes what a decision says. They are ranked by value for the effort.

| Rank | Fix | Where | Evidence | Size |
|---|---|---|---|---|
| 1 | Move the bell's "Urgent" chip and machine-flag icon off the legacy amber onto a guarded token pair: the plum caution pair (`--eq-warn` on `--eq-warn-fill`, 5.3:1 / 4.8:1), unless your answer to question 1 gives Urgent another colour | `src/features/notifications/NotificationBell.tsx:264, 379` | 1.70:1 and 1.75:1; "plum is caution"; the dark wash greys out | Small |
| 2 | Navy initials on the calendar's orange avatar | `src/features/calendar/calendar.css:129-145` | Your "no white words on any orange"; 3.55 / 2.99 | Small |
| 3 | Destructive buttons from Tailwind red and rose to `--destructive`; the Critical chip from Tailwind rose to the crimson token | Scrap Session in `WorkoutTrackerView.tsx`, the InBody and session-detail deletes, `StrongConfirmationModal`; `src/types/journal.ts:540-546` | "Crimson is destructive"; `loud-orange.test.ts` "Critical is the one crimson"; Navy Frame open question 8 | Medium |
| 4 | The profile header's renewal dot and the renewal card dialog onto the same tones Operations uses (`SITUATION_TONE`), with a word beside the dot | `ProfileHeader.tsx:158-162, 333`; `RenewalCardDialog.tsx:53-58` | A split meaning, and colour alone | Small |
| 5 | Make the legends say what the screen draws. The Hub Key gains the now line, today's ring, the celebrate dot, your column and the open card. Reword the two plum marks described as red. The session key explains the blue and orange tiles. Fix the stale READMEs. | `DayHeader.tsx:268-352`; `GridToolbar.tsx:58-115`; `journey-grid/README.md:45-46`; `journey-grid.tokens.css:84-86`; `ford.tokens.css:12-14` | The legends lag the code | Small |
| 6 | Delete the dead colour code: the 21 `--mb-*` tokens, the four legacy status colours once fix 1 lands, the inverse ladder, `--cyan`, `getRoleColor`, `getMuscleGroupColor` and `machine-colors`, and the unmounted `SyncStatusBadge`. Keep `--cta-strong` until question 12 is answered. | `src/index.css:551-554, 605-628`; `src/lib/utils.ts`; `src/lib/machine-colors.ts` | The Navy Frame kept them "for a cleanup to retire" | Small |
| 7 | Lower the ratchet from 127 to 115 | `src/neutral-ramp.test.ts:341` | The file's own rule | Trivial |
| 8 | New guard tests. Colour-blind floors for crimson against plum, blue against plum, rep green against crimson, and the rail against the grey edge, each recorded as today's value that "may not get worse". A test that the legacy colours have no reader. An APCA report that prints every dark text pair under Lc 60 without failing. | `equipment-tokens.test.ts`, `core-tokens.test.ts` | The colour-blind guard covers 2 of about 12 pairs; no guard measures APCA | Small |
| 9 | Retune `--chart-3/4/5` off Tailwind sky and amber, so each passes 3:1 in light and has a real dark value; keep the words beside the bars | `src/index.css:349-353, 677-681`; `WrapUpScreen.tsx:320-334` | 1.98–2.76:1 | Small |
| 10 | Record the Safari version in the boot report | `src/features/boot-timing/` | Sets the feature floor from data | Trivial |
| 11 | `content-visibility` with an estimated row height on every long list; layout containment on independent cards; measure in the perf lab | Directory, Activity Archive, roster rows | Platform data; already used in 3 rules | Small |
| 12 | Tabular figures on numbers that change in place (reps, weights, timers, counts). Check that Geist has them and that the session's measured rows still fit. | Now Bar, timers, Operations counts | Sports and WHOOP practice | Small |

### Then: thirteen questions for you, each with a recommended answer

These touch decisions you made, mostly on Oct 4–5 2026. Each is a question, not a fix. The research gives evidence on both sides, and each answer has a cost.

| # | Question | Recommended answer | Evidence for | Evidence against, and cost |
|---|---|---|---|---|
| 1 | **Should each meaning have exactly one colour on every screen?** (The table below.) | Yes | FAA consistency rule; Healey pop-out; 13 split meanings found | Each was chosen in its own round. About 20 files change, under tests. |
| 2 | **Heads up: plum or amber?** It is plum in Loudness and on Notes, and amber in the session's flag, the briefing band and the journal chip. | **Plum everywhere** | "Plum is caution"; the Navy Frame calls amber "a recorded drift"; hero orange against amber is only 8.6 apart for a protan | A guard test requires the session's elevated flag to be "an opaque, warm amber" (`session-colour-rules.test.ts:175-190`), and the briefing has its own amber token. Both change. |
| 3 | **Brighten dark mode's quiet words?** The muted ink #9DADBE, link blue #65ABE9, crimson #F2718C and plum #D98CBD all sit at Lc −45 to −54. | Yes: lift each until it reaches about Lc 60 on the card, then re-check WCAG | APCA; dark words are measurably weaker than light words; small labels are read at a glance | WCAG already passes (6.47, 6.05, 5.31, 5.97). WCAG 3's method is undecided, and APCA's evidence comes mostly from its author. These are Navy Frame values you approved. About 15 feature palettes copy them, and the copy tests will name every file that must change with them. |
| 4 | **Which theme should a shared iPad start in?** Dark today; a sign-out resets to dark. | **Light** on the floor, with dark a trainer's choice. Or trial it at one studio for a week. | Dark-on-light reads better at small sizes; dark's quiet words are weaker; the Navy Frame already took the pure white out of light mode (cards at 91.8% brightness, not 100%) | Under bright light the advantage is "only nominal"; trainers are used to dark; early-morning comfort. The change is one line plus the checklist. |
| 5 | **Saves that are still orange** (machine menu Save and Add note, machine fit's Save set-up, template editor, Finalize; Navy Frame open question 2) | **Blue**, so orange means only now, go and Celebrate. Move Operations' orange "needs attention" counts to ink weight as well. | "Every Save is blue"; each extra orange slows finding Start | The machine menu round chose its Save as "the one loud action" at the machine. CSS plus the `loud-orange.test.ts` lists change. |
| 6 | **Words on the orange.** Keep navy words, and make the labels on Start, Finish and the now pill one step larger (17/700)? | Keep navy words (confirmed). **Yes to larger** where the fixed rows allow. | No colour reaches APCA's ordinary-text level at 14px on #F36D21; Lc 45 is for "larger, heavier text"; the light now pill is Lc 36.4 | Your type decision set every button at 14/700, and the machine menu's Save was cut from 17 to 14. The session rows need re-measuring. |
| 7 | **Separate the warm cluster by lightness**, and take the brighter dark ok green #42e1bd (Navy Frame option 9)? | Yes. Make plum and crimson clearly different in lightness in both modes, and dark orange and crimson as well. | Lightness survives every type of colour blindness and small marks; dark crimson against plum is a near-miss even with normal vision | Shapes already carry Critical and rep quality; tritan is rare. Retunes values you approved; tests pin today's floors. |
| 8 | **Drifting and At risk share one plum.** Give At risk a deeper plum or a shape? | Yes, a shape (as Ahead does) | Colour alone; the two states call for different action | Small CSS. |
| 9 | **Note-category colours.** 14 Tailwind hues; Posture and Retention are both indigo. | Category icons and words, with the six categories on token colours that don't reuse orange or crimson | 5–7 codes is the evidence-backed limit; two categories collide | You called the categories one of the most important parts; a hue dot helps scanning Notes. Change in `journal.ts` and `NoteCategoryChips.tsx`. |
| 10 | **Glance sizes in the session.** Should the numbers read at the machine be 22–30px, and its primary controls 44px or more? | Audit first, then lift only the two or three numbers read at the machine | ISO glance angles (secondary source); Android for Cars 24/32; Apple's 44pt; the 2-second glance budget | Your type decision fitted every session row; names are never truncated; rows need re-measuring. |
| 11 | **Motion between screens.** React 19.3's view transitions for screen, profile-tab and Hub-day changes? | Yes: ≤250 ms cross-fades that respect Reduce Motion, never during set entry, after the perf lab and a real iPad | Native, no new library, falls back to no animation on older Safari | Any motion is a risk on an A14 iPad. The perf lab can't see Safari's compositor. |
| 12 | **The client progress report** (exempt, always navy): white words on the retired orange #F06C22 at 3.06:1. Switch to white on the deep orange #B04000? | Yes | 5.87:1 and Lc −83.6, passing both measures; gives the unused `--cta-strong` a reader | It was left unchanged on purpose, and clients see the change. |
| 13 | **Keep the iPad awake during a session** (Wake Lock, iPadOS 18.4+ in the Home Screen app)? | Yes: on at Start, off at Finish | The iPad is set down at every machine; no library needed | Battery, though the screen stays on only while a session runs. Older iPads fall back to Auto-Lock. |

The mapping for question 1, where your existing decisions already point to the answer:

| Meaning | Recommended single colour | What changes |
|---|---|---|
| Critical | The crimson token, with the triangle | The journal chip's Tailwind rose |
| Destructive and errors | `--destructive` | Tailwind red toasts, Catalog's plum "Couldn't save", the renewal dialogs' amber errors |
| Caution, warning, Needs a leader, renewal warning, Urgent | Plum | Tailwind amber on the profile header, renewal dialogs, toasts and touch history; crimson on the Urgent composer |
| Away, Lapsed, Not logged | Neutral grey with the word | Crimson on the briefing's Away marker, on lapsed and ended renewals, and on Operations' "Not logged" badge; the client calendar's sand Away |
| A client in session | Blue | The profile header's amber "In progress" |
| Today | Orange | The trainer calendar's blue today |
| Max strength | The gold ★ | The Deep Dive's orange max dot |
| Save and selection | Blue | See question 5 |
| Upkeep overdue | Plum | Crimson |
| Dial −2, "much worse than usual" | Your call: crimson only if it is Critical-level | — |

Two splits are deliberate and should stay. The bottom bar's orange running-session tab means "go back to your session", while a Hub card's blue means "this client is in session". The machine menu's green "+N%" since the client's start (your Q2 (a) of the machine-menu round) is a different measure from the grid's blue ▲ per set.

### Then: redesign screen by screen, in this order

Each screen goes through the same six steps. **One:** a short brief, written as token values and named things to avoid: no cream, no serif, no italic accent words, no pill-shaped buttons, no new colours. **Two:** Claude draws four distinct directions as screenshots at the 10th-generation iPad's size (820 × 1180 upright and on its side) and the iPad mini's, each in light and dark. **Three:** you pick one, or say what to change. **Four:** Claude builds only that direction, compares fresh screenshots to the pick, and keeps a change only if it is strictly better. If a revision gets worse, it rolls back rather than stacking fixes. **Five:** Claude writes the guard test that locks the new rule. **Six:** the perf lab compares before and after builds, and you walk the screen on a real iPad, with Safari Web Inspector for anything that moves or blurs. A reviewer with a fresh context, one that sees only the screenshots and the token rules, checks each screen before it reaches you.

The order follows where the drift and the risk are. Start with the **client profile header and the renewal dialogs**, which hold the most off-system colour and are low-risk. Then **Notes** (categories and Heads up), then **Operations → Today and the pipeline** (orange attention counts, crimson "Not logged", a landscape sidebar for seven destinations), then the **Wrap-up** (chart colours), then the **Hub** (the Key, the celebrate dot). Leave the **Active Session** until the loop has proven itself on the others. It is the most heavily guarded screen and the one where a mistake costs a trainer mid-set.

### What not to do

| Don't | Why | Evidence |
|---|---|---|
| Add glass or blur to cards, the grid, or anything inside a scrolling pane | Safari can't draw the lensing or see Reduce Transparency; blur in scroll containers blanks screens; the 10th-generation iPad is an A14 | [WebKit 245510](https://bugs.webkit.org/show_bug.cgi?id=245510); [caniuse](https://caniuse.com/wf-prefers-reduced-transparency); [yuvomi](https://newreleases.io/project/github/ulsklyc/yuvomi/release/v0.52.26) |
| Put spring or shape-morph motion on floor screens, or animate shadows or blur | The Liquid Glass usability failure; main-thread spring curves; your "never an animated shadow" | [NN/g](https://www.nngroup.com/articles/liquid-glass/); [WebKit 312407](https://bugs.webkit.org/show_bug.cgi?id=312407) |
| Copy suggested weights, target reps, form correction or spoken coaching | Breaks "never a coach, never suggests a progression" | [Peloton IQ](https://www.businesswire.com/news/home/20251001016206/en); [Hevy](https://help.hevyapp.com/hc/en-us/articles/35649846517399) |
| Add push, badges or Live-Activity-style pings, or rely on haptics as confirmation | Breaks "nothing contacts"; web haptics were reportedly blocked again in iOS 26.5 | [iOS haptics tester](https://rapidtoolset.com/en/tool/ios-haptics-tester) |
| Put a red-yellow-green score on a client, or a streak or leaderboard among trainers | Breaks "sentences, not scores" and "recognition, never ranking" | [WHOOP](https://developer.whoop.com/docs/whoop-101) |
| Switch to white words on orange because APCA prefers it | WCAG 2.2 is the legal basis; WCAG 3's method is undecided | [Roselli](https://adrianroselli.com/2026/04/wcag3-contrast-as-of-april-2026.html) |
| Let any session redesign a screen without the tokens and the brief loaded | The model drifts to its house style: cream, serif, italic accents, terracotta | [Anthropic docs](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-4-8) |
| Use AI-generated layouts on the floor | Non-deterministic; breaks "the same spot every glance" | [Google Research](https://research.google/blog/generative-ui-a-rich-custom-visual-interactive-user-experience-for-any-prompt/) |
| Rely on Popover before 18.3, anchor positioning before 27, or `@scope` while any iPad might be on 26.0–26.3 | Known Safari gaps | [BCD](https://github.com/mdn/browser-compat-data) |
| Tune the palette for P3 colour, or hold it to 60-30-10 | The common floor iPads are sRGB; 60-30-10 has no evidence | [Croma](https://www.croma.com/unboxed/10th-generation-apple-ipad-all-you-need-to-know); [Apartment Therapy](https://www.apartmenttherapy.com/interior-design-rule-60-30-10-explained-37504313) |
| Judge the overhaul by how fast a session felt | Felt speed and real speed can point opposite ways | [METR](https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/) |

## Conclusion

The most useful finding is that **Journey's colour weakness is governance, not taste**. The Navy Frame's core is close to what the research recommends. Every measured problem sits where no test was looking: legacy Tailwind classes, exempt identity palettes, chart tokens, dead tokens, and meanings added screen by screen after the rules were written. So the overhaul's most lasting output will be tests, not looks: colour-blind floors for the warm cluster, an APCA warning light for dark mode, a ratchet set to today's count, and one test per new decision. A redesign that skips those will drift again within a few rounds; the Sep 12 and Oct 4 colour rounds each had to clean up colours left behind by earlier work.

The evidence on AI also suggests a split of work that is narrower and safer than "let Claude redesign the app". Claude is measurably good at producing attractive first drafts, and its maker documents it as good at applying a decision everywhere under a check. It is documented to be poor at choosing between directions and blind to an old iPad's frame rate and a trainer's thumb. That puts you at the one step that can't be automated, the pick, and puts the iPad, not the screenshot, at the end of every loop. One more benefit: WCAG 3's contrast method is still undecided. Measuring APCA alongside WCAG now means Journey will be ready whichever way that standard lands.

## Sources, methods and limits

**The notes behind this report** are in [`2026-10-08-ui-research-notes/`](2026-10-08-ui-research-notes/): the measured token inventory (`codebase_color_tokens_measured.md`, every pair's WCAG, APCA and colour-blind figures), the meaning map (`codebase_color_meaning_map.md`, file and line for every colour's job), colour theory, UI 2023–2026, the iPad Safari platform table, and AI's UI strengths. A session that acts on Part 6 should read the two codebase notes first.

**How the codebase was measured.** The colour audit read the repository at commit `e8c5cb2` (Oct 7 2026, master). It parsed every colour token in `src/index.css` and the 14 `*.tokens.css` files, light, dark and the system fallback (699 tokens). It resolved each `var()` chain per mode and composited see-through colours over the surface they are drawn on. The colour maths was written by hand and checked against reference values before use. WCAG 2.2 contrast was checked with #767676 on white, which gives 4.54 ([W3C](https://www.w3.org/TR/WCAG22/#dfn-relative-luminance)). APCA 0.0.98G-4g was checked against its published test pairs ([apca-w3](https://github.com/Myndex/apca-w3)), OKLab and OKLCH against Ottosson's definition ([Ottosson](https://bottosson.github.io/posts/oklab/)), and CIEDE2000 against the Sharma test pairs. Colour-blind simulation used Machado 2009 and Brettel/Viénot, taking the smaller difference as the repo's own test does. 384 pairs were measured. The meaning map read stylesheets and components and cites each claim as file and line. Screen shares count colour declarations, not pixels. **Nothing was rendered in a browser or on an iPad**, and no trainer was observed, so the report says where colours could confuse, not whether they do. Before writing, these were checked against the code: the bell chip (`NotificationBell.tsx:264`, `--amber` #F5A623 at `src/index.css:554`), the dead `--mb-*` tokens, the ratchet at 127, `SyncStatusBadge` having no importer, the machine menu's orange Save, and the `display-mode` rule already being backed by `html[data-app-h]`.

**How the web platform was checked.** Safari versions come from MDN's browser-compatibility data 8.1.4 (dated Oct 1 2026) and web-features 3.40.1 (Oct 6 2026), downloaded and queried directly ([BCD](https://github.com/mdn/browser-compat-data); [web-features](https://github.com/web-platform-dx/web-features)). These are strong sources. No feature's cost was measured on an A13, A14 or A15 iPad, so every cost judgement is an engineering estimate for the perf lab and Safari Web Inspector to confirm.

**Where the outside research is thinner.** Network blocks meant several researchers could read only search-result excerpts, not full pages. That affects every colour-theory source in Part 2 (Radix, APCA, Material, Apple, the vision-science papers), NN/g's Liquid Glass and dark-mode quotes and Apple's HIG summaries in Part 3, and all arena and Design Arena numbers in Part 5. Those numbers come from secondary trackers that disagree: on Sep 11 one outlet ranked GPT-6 Astra Max first, and on Sep 23 another ranked Opus 5.5 first, on few votes. One report places Sonnet 5.5 third and another does not. Vendor claims (Anthropic launch posts, Google's Material research, customer quotes) are labelled as such and were not independently replicated.

**Where the notes disagreed.** The notes gave two figures for dark orange against crimson for tritan viewers: 0.041 and 0.030 on the OKLab scale. The report uses the codebase measurement (0.030, ΔE00 3.1), which takes the smaller of two simulation models, as the repo's tests do. One note listed `SyncStatusBadge` as a live reader of the legacy colours; it has no importer, so the bell is the only live reader. One note called the `display-mode` rule a bug; it is already handled.

**Rough calculations.** The glance-size figures in Part 2 and the glare model in Part 1 rest on assumed pixel sizes and reflectance, and on ISO 9241-303 read through a secondary source. Treat them as orders of magnitude, not measurements.
