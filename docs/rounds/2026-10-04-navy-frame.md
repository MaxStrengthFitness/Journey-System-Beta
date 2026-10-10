# The Navy Frame (the colour round) — Oct 4 2026

**Branch:** `colour/navy-frame`, off master `db46d32c` (no guessed gender). One commit per phase, each typechecked at the baseline (2) and run through the whole suite, then one commit of the review's fixes and two of docs. The phases are separate so each can be reverted alone; they ship as ONE push, because a half-moved palette looks patched. **Ships with** `scripts/ship/ship-navy-frame.ps1`. No Firestore rules, indexes, Cloud Functions or Mindbody change: the push alone, then AJ deletes and re-adds the Home Screen icon.

## What AJ asked

From his voice note, Oct 4 2026:

> "I think the light mode is just so bright and it just feels like it's like a negative mode almost. Like it just so bright. It's kind of crazy. Um, and then I just feel like in our dark mode, it just so gray. … like all like in the hub, nothing has color. I feel like we have a nice blue and orange logo color. … use our colors from the max strength logo to like maybe use those as the accent colors across our app … I think the colors is the thing that really puts me off the most."

The logo is three squares: blue `#0A548B`, orange `#F36D21` and slate `#5B6770` (`client-profile/BrandTiles.tsx`).

## Why the colours felt that way (the causes AJ was shown)

1. **Light mode was as bright as a screen gets.** The cards, the header and the bottom bar were pure white (100% brightness) with near-black words on them at 17 to 18:1. Print sits far lower. Light mode was built on Sep 9 (`IPAD-LIGHTMODE-AND-DATA-ROUND.md`) by turning dark mode's colours inside out on the same hierarchy (`index.css`'s own comment: "the inverse of the colours but the same hierarchy"): the same bones turned inside out is why it read like a photo negative. The header and the bottom bar were hard-coded white, so the earlier softening passes never reached them and the frame stayed the brightest thing on screen.
2. **Dark mode was grey on purpose.** On Sep 12 2026 (`VISUAL-CONSISTENCY-ROUND.md`) dark mode was frozen as Tailwind's stock "slate" greys, and `neutral-ramp.test.ts` held it there ("dark must not move at all"). It never had our colours. The header and the bar were navy while everything between them was near-black: two families that don't match. The page was 0.2% brightness with near-white words at 16 to 19:1, which glows (halation). Its blue was Tailwind's sky `#38BDF8`, not the logo blue.
3. **The Hub had no colour.** Every card had a grey left edge on a grey surface; the orange showed only as six-pixel dots and the now line.
4. **One thing hid every orange.** `ActiveStudioContext` wrote the studio's "Accent colour" into `--cta` as an inline style on `<html>`, which beats both themes, so no new orange could ever show while it ran.
5. **Things that failed to read.** 11 of 72 readability checks failed (36 places on the Hub, in two modes): the tab you're on in the dark bottom bar was 2.5:1; the light now pill was white on `#EF5302` at 3.55; the light studio name 2.56; the dark idle tab labels 3.53; the bar's control boundary about 2:1. And in dark the ok green and the Critical pink were nearly the same colour for a colour-blind trainer (2.1 apart).

## How it was chosen

Four designers each built a full palette from the logo (Studio Navy, Brand Chrome, Warm Paper, Dim and Dusk). Three judges scored them on comfort, brand and colour theory, and how safely they could be built. One agent combined the best into the **Navy Frame**; then two skeptics tried to break it. They raised 27 issues (orange washes turning grey on navy, white words on orange, a header search that would draw a pale box in dark…): the 15 that mattered were fixed in the plan, and the 12 small ones were carried into the build. Every option was measured by the same tool on a working copy of the Hub (Strongsville, a Monday at 7:42, sessions done and under way and one Critical note), and the Navy Frame was laid over the live app in a browser. The runner-up is the **Quiet Frame**: the same insides, with light bars in light mode.

Why not the others: Studio Navy had the best dark mode but turned light mode blue on blue, so "you" and "in session" blurred; Warm Paper was the softest but reads beige under gym lights beside the cool logo blue; Dim and Dusk was easiest on the eyes but made dark a lighter grey, "so gray" again; Brand Chrome put a greyer dark mode inside the same frame.

The review page AJ answered from is the artifact <https://claude.ai/artifact/5i6enRsJyZQDvWUXAMyPhB>. The working files (the palettes, the mock, the renders, the measuring scripts, the plan and each phase's report) are in `harness/colour/` on AJ's PC, which git ignores.

## AJ's answers

AJ: **"ill take your pick for all 3 questions"**, so 1A, 2A and 3A:

1. **1A — the frame is the logo's navy in BOTH modes.** The header, the bottom bar and the iPad status bar are `--chrome` `#002341` in light and dark alike, like the sign-in screen. (1B was navy in dark only.)
2. **2A — a client card still to come gets a quiet blue left edge** on the Hub (`--eq-rail-booked`), so the Hub has colour before the first session of the day. In session keeps its stronger blue; finished cards fade; left open stays plum.
3. **3A — the studio "Accent colour" is removed with its Admins control** (`admin/studios/StudioDetailsForm.tsx`, the label in `admins/studios/studio-records.ts`). One Max Strength orange in every studio, and nothing that can drift toward the red kept for Critical notes. Stored `brandColor` values are left as they are: no script, no write; the `Studio` type keeps the field marked retired. The trainer's own `brandColor` (their avatar) is a different field and stays.

## What it looks like now

- **The frame is the logo's navy**, `--chrome` `#002341`, in both modes: the header, the bottom bar, the iPad status bar (`theme-color`, `index.html`, the manifest; `HEADER_TOKEN` in `home-screen/theme-color.ts` is `"--chrome"`). The studio name is `--chrome-ink` (14.6:1), the icons and idle tabs `--chrome-ink-2` (8.6:1). The tab you're on is a solid blue box (`--chrome-here` `#65ABE9`, dark mode's own blue) with a navy icon; a running session's tab, Operations and Admins are orange (`--chrome-go`), and a running tab you're not on sits in an opaque warm box (`--chrome-go-fill` `#3D2112`). The loading mark is the logo's own three colours in both modes (`--brand-tile-*`).
- **Light mode is calm daylight:** off-white cards `#F3F6F9` on a soft grey-blue ground `#DEE6EE`, deep navy ink `#192D41`. Nothing is pure white any more: a panel is `bg-card`, a menu `bg-popover`, the page `bg-background`.
- **Dark mode is studio navy:** ground `#0A1C2C`, cards one step up `#14293D`, soft ink `#DFE7EF`. Every `slate-*` class follows, because the dark neutral ramp `--n-*` is now the navy ramp, not Tailwind slate. **This reverses the Sep 12 2026 decision "dark must not move at all"**; `neutral-ramp.test.ts` now pins the navy values instead.
- **Blue** (the logo blue `#0A548B`, lifted to `#65ABE9` in dark in place of Tailwind's sky) means yours, picked, or in session. On the Hub your column has a blue cast and a blue rule under your name, and your avatar is the one blue disc; colleagues' avatars go quiet.
- **Orange means now and go, in two tokens.** `--eq-hero` is the orange of marks: the now line, its dot and pill, today's ring, the day dots (`#D45A06` in light, the logo orange's hue as deep as 3:1 on the grid needs; the logo orange in dark). `--eq-go` / `--eq-go-on` is the one loud action (Start session, Finish) and every orange chip with words: the true logo orange with **navy words** (6.05:1), both modes. **No white words sit on any orange** (white on the logo orange is 2.99:1, on the light hero 3.99).
- **Crimson** keeps exactly `#C0203F` / `#F2718C`: Critical, destructive and rep quality only. **Plum** stays caution, **green** stays ok.
- **Dark fills are opaque and keep their own hue.** Orange is the navy's complement, so an rgba orange wash over navy cancels to grey (the old 16% hero wash came out `#383439`), and crimson and plum washes go violet and become one colour (Critical and caution were 2.2 apart). Each dark fill is now an opaque colour at its accent's hue: hero `#4b2915`, alert `#472024`, warn `#402846`, ok `#113e36`, live `#23405c`.

## The numbers

| | Before | After |
| --- | --- | --- |
| Readability checks failing on the Hub (36 places × 2 modes) | 11 of 72 | 0 of 72 |
| Light: the cards (brightness, 100% = white) | 100% | 92% (`#F3F6F9`) |
| Light: the ground behind them | 91% | 78% (`#DEE6EE`) |
| Light: the header and bottom bar | 100%, the brightest thing on screen | 1.6%, the darkest (`#002341`) |
| Light: words on a card | 17–18 : 1 | 13 : 1 |
| Dark: the page | 0.2% | 1.1% (`#0A1C2C`) |
| Dark: the cards | 0.9% | 2.1% (`#14293D`) |
| Dark: words on a card / on the page | 16–19 : 1 | 11.9 / 13.8 : 1 |
| Dark: the tab you're on | 2.5 : 1 | 6.5 : 1 |
| The light now pill | white on orange, 3.55 : 1 | navy on orange, 4.53 : 1 |
| Start session | white on burnt orange | navy on the logo orange, 6.05 : 1 |
| Dark ok green vs Critical, for a colour-blind trainer | 2.1 apart | about 20 apart |

Every pair the Hub, the frame, the session grid and the palette copies draw is measured by the tests below, in both modes: words at 4.5:1 or more, control boundaries and icons that mean something at 3:1 or more.

## What changed, by area

- **The frame** (phase 5): `AppHeader`, `AppBottomBar`, `NavButton`, `StatusBarStrip` and the status-bar chain draw only in `--chrome-*` tokens. The header search keeps the frame's well in dark too; the avatar is a blue disc with navy initials and its menu draws in the theme's own colours (`menuIconClass`); the Bug icon lost its Tailwind orange hover; Sign out is the destructive item.
- **The core tokens** (phase 2): `index.css` `:root` and `.dark`, the navy dark ramp, the frame tokens, `--cta-foreground` (navy) and the navy-tinted shadows. `--cyan` is the theme's blue.
- **The grounds** (phase 6): `<main>`, the Hub, the profile and the session sheets paint `bg-background`; every pure-white panel is `bg-card` or `bg-popover`. The profile's tab tray stays a step off the page (the shadcn tab's open fill is `bg-card`).
- **The Hub** (phases 3–4): `equipment.tokens.css` and its pinned copies (`--adm`, `--st`, `--wk`, `--cat`); today's chip ringed in orange, an orange underline under the blue chip when today is the picked day; one orange at the now marker with navy words in the pill; your column blue; the coming-up blue edge (2A) on the card, the Key and the Next 30 minutes strip; Start the logo orange with navy words on the peek, the Opportunities list, the Directory and Operations; a finished card recedes to 0.70 and its quiet words lift to the ink; the layer you're on is a raised chip.
- **The Active Session** (phase 8.1): `journey-grid.tokens.css` in calm daylight and studio navy; Finish, the paused clock's button and the routine's number chips are the go pair; the Today column stands 1.27:1 off the cells in dark with every word on it at 4.5:1; the session's small words moved from the faint ink to the muted.
- **Off the Hub** (phases 7–8): one loud orange with navy words (the profile's Start, the briefing's Start, the End Session dialog's Finish, the Deep Dive's Generate); one crimson (the Critical strip and the flags); blue for a picked choice and the focus ring (no cyan, no Tailwind sky); the briefing, Pulse, the profile nav, FORD's urgency colours, the calendar's heat map, the trainer profile, the routine builder, the Dial and the Deep Dive all copy the Hub's palette.
- **The review's fixes** (`ec9bc021`, below).

## The commits

| Phase | Commit | What |
| --- | --- | --- |
| 1 | `1db7d97e` | The theme's orange renders (the studio accent removed with its Admins control); the loading mark is the logo's own three colours |
| 2 | `847f0553` | The core tokens in `index.css`, the navy dark ramp, the frame tokens (`--chrome-*`), `--cta-foreground` |
| 3 | `3983ed93` | The Hub's palette (`equipment.tokens.css`) and its four pinned copies |
| 4 | `3fbff296` | The Hub's rules: today and now in orange, your column in blue, the now pill navy on orange, Start in the logo orange, the coming-up blue edge (2A) |
| 5 | `0ab2f6b0` | The frame: header, bottom bar, NavButton, the status-bar chain |
| 6 | `5c0d1027` | The page is the theme's ground, and no panel is pure white |
| 7 | `4b147271` | One loud orange with navy words off the Hub, one crimson, blue selects |
| 8 | `28e3759e`, `c3d7b2fb` | The palette copies no test pinned: the Active Session, then the briefing, Pulse, the profile nav, FORD, the calendar, the trainer profile, the routine builder, the Dial, the Deep Dive |
| Review | `ec9bc021` | The review's fixes |
| 9 | `e2e742e2` and the docs commit after it | The docs, and `scripts/ship/ship-navy-frame.ps1` |

About 120 files, mostly single colour values, and the new tests that hold them.

## Values that differ from the plan, and why

- `--chrome-here` is `#65ABE9` (dark `--primary`), not `#72B8F2`: two near-identical light blues on one dark screen read as an accident. 6.5:1 on the frame. The light toast's info icon, drawn in it, is 4.35:1 (an icon: the floor is 3).
- Light `--eq-ink-faint` is `#7f8c99`, not `#84919e`, so a card's default left edge stays 3:1 on the new card. Every copy follows.
- **Light ok green is `#17714b`** (the review): the plan kept `#1c7a52`, but the grounds under it darkened, so "Saved" in every Operations and Admins save bar and a done card on the Board fell to 4.42:1. Lightness only; 4.8:1 on the page, 5.0 on surface-2, 5.5 on a card, white on it 6.0. It stays apart from crimson for a deuteranope.
- The Active Session's dark Today column is `#143a5c`, not `#1e4466`: the plan's value put the muted words on it at 4.41:1. It stands 1.27:1 off the cells.
- The session grid's light `--jg-border-strong` is the softer `#a3aebb` (2.08:1), so its sticky edges stay decorative; every other palette uses the Hub's 3:1 `#7a8694` (see the open questions).
- A finished Hub card recedes at 0.70 (was 0.62), so its name reads (4.96:1 light), and its quiet words (the time, Not logged, the rest, the number, a staff name) lift to the ink (the review).
- Pulse's light yellow is `#9d5f00` (4.76 on the card), the calendar's light heat step 4 `#2b7bb0` (white on it 4.60), the routine builder's avoid edges `#ad7598` / `#af5089`: lightness only, each so its words or rails pass. Pulse has one on-colour for words on a solid accent, `--sr-on`.
- The calendar's heat map changes ink at step 4, not step 3 (no step-3 ink passed in both modes), and its dark ramp starts from the navy.
- The loading mark has a fourth fixed token, `--brand-tile-ink`, the logo's white strokes, so the mark is the same in both modes. That is white on the orange square: the logo's own artwork, hidden from screen readers.
- `BARE_PALETTE_BUDGET` (`neutral-ramp.test.ts`) is the real count, **137** (219 on master), not the plan's "lower it by what each phase removed".

## The review's fixes (`ec9bc021`)

- Blue words on the blue fill in My Studio, Relay and Openings read `--st-live-text` (7.1 / 6.2:1); the dark `--st-live` is 4.4:1 there and keeps only edges and icons.
- The Floor Map's dark heat steps and the running session's tab box are opaque and warm, not orange washes gone grey.
- The Next 30 minutes strip gives a coming-up booking the grid's blue edge. Its "now" item keeps a darker grey edge of its own: AJ's call (below).
- Log a conversation, the InBody scan and trend, the report archive: the theme's blue, not Tailwind sky. Add a client: no `#F06C22` left. First-time setup (in the session, for a prospect) writes in the theme's ink, not white. The Wrap-up's renewal button, the bell's chips and the feedback kind chip sit on the opaque orange fill.
- The two required reason fields (Apply routine, Confirm Switch) have the control boundary again (in dark they had all but vanished).
- Small words in the faint ink moved to the muted ink: the session's setting keys and "+ more", the Now Bar's kicker and readout, the Dial's word and legend, a field's help line, three briefing labels.
- The grid's hero words and fill equal the Hub's; the remove-machine X no longer reads an undefined token; the avatar menu's mode switch reads raised in dark; the dark worked-muscle blue in Learning and the routine builder is the lifted logo blue.
- Deleted: `ConditionChip.tsx` (no importer) and `--cx-hero-on` (no reader).

## What holds it (the tests)

- `src/core-tokens.test.ts` — `index.css`'s pairs in both modes, no white words on the logo orange, no pure-white light surface, navy (not grey) dark surfaces, the frame set once in `:root` and never redefined in `.dark`, the frame's pairs, the running tab's box opaque and warm.
- `src/features/equipment/equipment-tokens.test.ts` — the Hub's palette: every text and UI pair (over the card, the in-session card and the run sheet's open row), the now line, the booked edge, dark fills opaque and hue-held, hero vs crimson and ok vs crimson for colour-blind trainers, one crimson with the grid.
- `src/features/hub-schedule/hub-colour-rules.test.ts` — the Hub's rules: one orange at the now marker, today and picked, your column, the coming-up edge on the card, the Key and the strip, Start's go pair, a finished card's words, no card rule keyed on a missing attribute.
- `src/components/frame-colours.test.ts` — the frame draws only in `--chrome-*` tokens, with no `dark:` look of its own.
- `src/page-grounds.test.ts` — the grounds are `bg-background` and no panel is pure white.
- `src/loud-orange.test.ts` — no white words on any orange in any `.tsx` off the Hub, the go pair restated on hover, one crimson, no cyan rings, no sky, the renewal and InBody dialogs, Add a client, the Wrap-up's renewal button, First-time setup.
- `src/palette-copies.test.ts` — the six copies phase 8 retuned (briefing, Pulse, FORD, calendar, trainer profile, routine builder) and the profile shell's aliases equal the Hub's.
- `src/features/journey-grid/session-colour-rules.test.ts` — the Active Session's rules and palette, the session's small words in the muted ink, the Dial with no faint words.
- Beside them: `neutral-ramp.test.ts` (the navy ramp, and the budget 137), `studio-tokens.test.ts` (`--st-live-text`, and no `--st-live` words on the `--st-live` fill), `admin-tokens.test.ts` (fails on a non-hex pair instead of skipping it), `learning-tokens.test.ts`, `contrast.test.ts` (the session grid), `home-screen.test.ts` and `theme-color.test.ts` (the status bar is `--chrome`), `loading-mark.test.ts`, `ActiveStudioContext.render.test.tsx` (nothing writes `--cta` inline), `AppHeader.render.test.tsx` (the search's dark background), `my-studio/look.test.ts` (the Floor Map's dark heat).

## What stayed unchanged on purpose

- **The meanings.** Blue acts, selects, is in session. Orange is now, the one loud action and Celebrate. Green ok, plum caution, crimson Critical, destructive and rep quality only. The one meaning that moved is the coming-up card's edge, grey to a quiet blue (2A).
- **The crimson values** `#C0203F` / `#F2718C`, the rep-quality fills, light and dark plum, the grid's star and kaizen ring.
- **The front door** (always dark, its own `--fd-*`), `BrandTiles` and the logo SVG, the lockup's colours, and the Google and Microsoft colours.
- **The progress report** and the always-dark screens.
- **The fixed pigments:** the note-category hues (`types/journal.ts`), the calendar's trainer tones, the FORD pillars, and Learning's family hues.
- **The default theme** is still dark, and a sign-out still resets to it.
- **The Home Screen icon artwork.** Its teal field `#1C6F86` is now the odd one out beside the navy frame; an icon pass later means deleting and re-adding the icon a second time.
- **AJ's own picks for the profile's Journey tab** (Oct 2–3): the tiles, the bubbles, the date colours.
- Kept with no reader, for a cleanup to retire or give a reader: `--cta-strong` / `--color-cta-strong` (every `bg-cta-strong` moved to `bg-cta`), the inverse `-l` ladder (`--bg-l`, `--ink-l1..l4`; `--div-l` still has readers), the grid's `--brand-*` pigments, and `--cyan` (it equals `--primary`; a few components still name it). Gone: `--br-hero-strong`, `--br-hero-on`, `--jg-hero-on`, `--cx-hero-on`, `--rl-floor-fill`, `ConditionChip.tsx`.

## Known trade-offs

- **Light "done" against an empty grid cell falls from 1.16 to 1.07.** It can't come back without moving the max and poor fills, whose lightness carries rep quality; the weight and reps in the cell still say a set happened.
- **Light cards are only a little darker** (L* 100 to 96.7). Most of the relief comes from the darker ground and the navy frame (the whole screen is 19% less bright, about half of it from the frame). If AJ still says "bright" on the walk, the prepared next step is one step dimmer: cards `#ECF1F5` (ink 12.3:1), the light `--n-50` re-stepped between card and ground, the copies following.
- **In light, your column and an in-session card's fill are nearly one tint** (2.8 apart). In your own column an in-session card is told apart by its edge and the pulsing dot.
- **The 3:1 `--*-border-strong`** fixed the Hub's control boundary, but it also draws on about 210 decorative readers (dashed placeholders, the codex body strokes, the calendar's sticky lane edges): heavier lines in light, a bright grey-blue line on navy in dark. The quieter line for those readers was not split out.
- **`--input` is a boundary AND a fill.** shadcn paints it under every field and outline button (`dark:bg-input/30`, `disabled:bg-input/50`), so the 3:1 boundary also makes every field a lighter box in dark and a disabled field a mid-grey slab in light.
- **Faint ink still carries words in about 120 older rules** (Pulse's empty lines and day legend, the calendar's zero counts and share line…), 3.2:1. The Hub, the session grid and the Dial are held to the muted ink; the rest move reader by reader.
- Colleagues' quiet avatar circles are 1.13:1 off their head in light (the initials carry them at 10:1). The light profile header is a card-coloured band flush to its edges. The profile's setup banner is 1.06:1 off the page in light (its blue border and words carry it). The trainer profile's light Kaizen fill is 1.06:1 off its card. FORD's pillar fills and Pulse's traffic-light fills in dark are still their own near-black colours, 1.03–1.14:1 off the navy card.
- `StatusBarStrip`'s dark halves stay the session's and the demo banner's own colours: the strip is 0px under the `default` status-bar style, so it is cosmetic.

## Follow-ups (Oct 4 2026, AJ: "yes")

Three of the open questions (orange Saves and selections, the Journey tab's dates, the session's button outlines) went to AJ with a recommendation each, and he answered "yes" to all three. **Branch** `oct4/colour-followups`, on master's `e38d29bb` (the Navy Frame, live): four commits and the docs. **Ships with** `scripts/ship/ship-colour-followups.ps1`. No rules, indexes, Cloud Functions, server, Mindbody, `index.html` or manifest change, so the Home Screen icon stays as it is.

### Every Save and every selection is blue; orange is only now and go (`bf7c50fb`, `1f15ce3d`)

The rule was already "every Save is solid blue" and "a selection is blue". Phase 7 held only "no white words on orange", so it left these on the logo orange. Orange is now only now and go: Start a new session, Finish, the paused Resume, Start Consult Workout, the profile's and the briefing's Start, the now marks and Celebrate.

- **Saves** are `bg-primary text-primary-foreground`, with the fill restated on hover (words 7.9:1 light, 7.4 dark), and their glows are the blue's: Save scan and Save correction (InBody), Save conversation, Log a conversation (the renewal card's door into it), Track (Kaizen), Save preset and Apply (the routine drawer), Confirm Switch, Send to the team (feedback), Create Temporary Profile (Add a client), Save Trainer Profile.
- **Selections** are the blue with its own words: the notes sheet's open tab, the feedback kind chips, First-time setup's gender and skill chips (their glow in the blue), and the Pulse's Linked (the existing `.sr-btn--navy`) and Machines that bring it on (an ordinary picked chip). The review found two more: the Equipment tab's picked machine (`.eq-item--selected`) is the live fill with a blue edge, restated on `:hover` and on a machine not in use, which both used to paint over the selection; and the Pulse's switch that is on (`.sr-switch--on`) is the navy with an on-colour knob, like the app's own Switch. The picked machine's "No load yet" and session count moved from the faint ink (2.9:1) to the muted.
- **Yes, reset it** (the demo card) is a destructive confirm: red words on the destructive tint with a red edge, 4.82:1 light and 4.66 dark.
- **The caution icon** in `StrongConfirmationModal` is plum (`--eq-warn` on `--eq-warn-fill`), 4.81 light and 5.24 dark.
- **A trainer's own profile edit** (`EditTrainerModal`) had its token pass. Every icon and the Lookup button are the theme's blue (no `#F06C22`, Tailwind orange or indigo left). The home studio chip is solid blue, 4.96 / 5.24 even under the row's opacity. The staff ID is a quiet muted label. The checkboxes lost an override that never drew (Base UI marks a ticked box `data-checked`, not `data-state=checked`) and that hid the Checkbox's own 3:1 edge.
- Retired with their last readers: `.sr-btn--primary`, the Pulse's hero chip, `--sr-go` / `--sr-go-on` and the Chip's `hero` prop. `BARE_PALETTE_BUDGET` is **127** (was 137).

### The Journey tab's dates read at 4.5:1, hues kept (`61eb0ea1`)

AJ's Oct 2–3 picks, stepped in lightness: each hue is kept (it moves 0.2° or less, the dark date-sub 1°), and the saturation moves 4 points or less. The newest tile's edge stays the logo orange. These colours are read in the Active Session as well as the profile (`.jg-look`).

| Token | Mode | Was | Now | On its worst ground |
| --- | --- | --- | --- | --- |
| `--jg-pf-date-sub`, the session number under each date | light | `#4f7ea6` | `#3f6b90` | 3.59 → 4.70 on the band |
| `--jg-pf-now`, the newest date | light | `#c2410c` | `#b53c0b` | 4.31 → 4.83 on the band, 4.63 spotlit |
| `--jg-pf-now-sub`, its number (and today's reps and the waiting prescription in the session) | light | `#d4682c` | `#9e4d20` | 2.83 → 4.66 on a banded orange tile |
| `--jg-pf-reps`, a set's reps on its tile | light | `#3d6a8f` | `#3b6689` | 4.34 → 4.61 on a banded tile |
| `--jg-pf-date-sub` | dark | `#5d86a8` | `#7a9dbc` | 3.50 → 4.75 on the band |
| `--jg-pf-now` | dark | `#f36d21` | `#f58443` | 4.52 → 5.32 on the band, 3.92 → 4.62 spotlit |

Light pf-now, light and dark pf-date-sub are the values AJ was shown; pf-now-sub and pf-reps were stepped the same way.

### The Active Session's controls get a firmer edge (`74eb585d`)

`--jg-control-edge` is the Hub's `--eq-border-strong`, `#7a8694` in light and `#6e8397` in dark (all three blocks of `journey-grid.tokens.css`). It is 3.08:1 on the Now Bar and 3.42 on a control's fill in light, 3.45 and 3.79 in dark; the edge was 1.87 and 2.05 on the bar. Eighteen rules in `journey-grid.css` draw with it: the Now Bar's setting chips, steppers, REPS | SEC switch, quality buttons, No set? buttons, skip reasons and pain field; the session bar's Notes and Pulse; the Today column's add; the routine sheet's Find and add buttons; a machine's menu, the Key and its Close; and four controls nothing renders today (`.jg-btn`, `.jg-seg2`, `.jg-rail__edit`, `.jg-rail__older`). The softer `--jg-border-strong` stays on the sticky separators, the rail, the empty-day circles, the setting boxes and the captions.

### Close calls

- **Log a conversation** went blue: it records, and it opens the blue Save conversation.
- **Yes, reset it** is red words on the destructive tint, not a solid red fill: no screen puts words on a solid destructive fill. In dark that tint blends to a violet-grey (`#433d4d`), against "dark fills are opaque and keep their hue"; it is the shadcn destructive button the whole app uses, and its words pass.
- **The feedback kind chips** are solid blue, as the picked chips in Log a conversation and End Session's outcome are, not the live tint: there was nothing nearby to match.
- **EditTrainerModal:** its Tailwind indigo went blue along with the orange, so the dialog isn't half indigo. The staff ID is a muted label, not blue: it is an identifier, not a selection, and blue on a blue tint was 4.18 on the dark popover. The home chip is solid blue because the tint fell to 3.99 in dark. The title and Display on Calendar icons are blue, not orange: neither is now or go. The stored default `brandColor` `"#F06C22"` is a colour input's value, not a class, and is left alone.
- **First-time setup's chips** kept their glow, in the blue.
- **The Pulse's Linked** reuses `.sr-btn--navy`, which had no reader. The orange-only tokens were deleted rather than left without readers.
- **`--jg-pf-reps`** was not on AJ's list, but it was a word under 4.5:1 on every other row.
- **A spotlit newest-day header keeps its orange words** on the blue spotlight, because the profile's newest-day rule outranks the spotlight's. It passes (4.62:1 in dark). Whether it should turn blue like every other spotlit date is question 3 below.
- **The routine sheet's light page** (`--jg-bg` `#dee6ee`) puts the control edge at 2.94:1, on the dashed add buttons and the outer edge of Find. The token equals the Hub's, which measures the same 2.94 on the Hub's page, and the words and the blue + carry those buttons (question 4 below). On a press or hover ground (`--jg-surface-3`) the edge is 2.72 in light, for a moment.
- **Kept orange on purpose**, outside AJ's lists, because their kit calls them the screen's one loud action: the machine sheet's `eq-btn--hero` (Save setup / Log & save, Confirm, Add note), machine-fit's Save set-up, the admin template editor's Save changes / Create template, and the progress report's Finalize (question 2 below).
- **`loud-orange.test.ts` now turns `\r\n` into `\n`** when it reads a file. In a fresh Windows worktree (`core.autocrlf`) its token-block patterns never matched and the whole file failed to load, even on master. That is a reader fix, not a looser rule.

### What holds them

- `src/loud-orange.test.ts`: the go list that must stay orange (Start a new session, Finish, Resume, Start Consult Workout); the Saves that must be blue, with no solid orange anywhere in their file and no fading hover; the destructive reset; the selections; the plum icon. Each is measured in both modes.
- `src/palette-copies.test.ts`: the Pulse's selections and its switch are blue, and no Pulse rule reads `--sr-go` or `--sr-hero`.
- `src/features/hub-schedule/hub-colour-rules.test.ts`: the picked machine, its `:hover` and idle cases, and its words.
- `src/features/journey-grid/contrast.test.ts`: the Journey look's words in all four palettes (`PAIRINGS`, banded rows included; `HEADER_WORDS` on the band and on a spotlit header), and the control edge at 3:1 on the bar and on a control's fill, firmer than the separators' line.
- `src/features/journey-grid/session-colour-rules.test.ts`: the eighteen rules that read the control edge (any other reader fails), the five sticky separators on the soft line, and the token equal to the Hub's in both themes and the copy.
- `src/neutral-ramp.test.ts`: the budget, 127.

Putting the old values or classes back failed the guards on every commit (24 tests for the dates, 9 for the edge, 3 for the review's two selections).

**Measured** on the branch's final commit, in its worktree on AJ's PC: typecheck **2** (`charts.tsx`, `EditTrainerModal.tsx`); `TZ=America/New_York npx vitest run --dir src` **9,657 passing in 663 files**, none failing (the Navy Frame: 9,551 in 663); `npx vite build` clean; the case check prints nothing. **Not seen on a screen**: no browser was used in the follow-ups. Walk Round 55 of `docs/ops/TESTING-CHECKLIST.md`.

## For AJ: the open questions

Questions 2, 3 and 4 as first asked (orange Saves and selections, the Journey tab's dates, the session's button outlines) were answered "yes" on Oct 4 2026 and built: see the follow-ups above. Questions 2, 3 and 4 below took their places; they came out of that work.

1. **The status bar (the gate).** After the push, delete and re-add the Home Screen icon. In LIGHT mode, under the `default` status-bar style, the clock and battery should draw light over the navy. If they come out black on navy, say so: the runner-up's light frame (the Quiet Frame's light bars) is the fallback. And: the icon's teal field in navy now (one more re-add) or later?
2. **The Saves still orange.** "Every Save is solid blue", but these stayed orange because their own kit calls them the screen's one loud action: the machine sheet's Save setup / Log & save, Confirm and Add note (`eq-btn--hero`), machine-fit's Save set-up, the admin template editor's Save changes / Create template (admin's own save bar is already blue), and the progress report's Finalize. Blue too, or keep them as the one loud action?
   **Answered for the machine card (Oct 10 2026):** asked about the card that replaced the machine sheet, AJ said "take your pick, i like all your recommendations": its Save and Add note are the solid blue (`docs/rounds/2026-10-09-floor.md` §8). The rest of this list (machine-fit's Save set-up, the admin template editor's, the progress report's Finalize) waits for its own area, with the same answer recommended.
3. **The newest date when it is spotlit.** Tap the newest date on the Journey tab: its words stay orange on the blue spotlight (4.62:1 in dark, so they read), while every other spotlit date turns blue. Turn it blue too, or keep the orange that marks the newest day?
4. **The routine sheet's add buttons.** On the sheet's light page the dashed add buttons and Find's outer edge are 2.94:1, just under 3 (the same token on the Hub's page measures the same). Their words and the blue + carry them. Leave it, or give the sheet a darker edge of its own?
5. **The Next 30 minutes strip's "now" edge.** A booking under way with no session open is the strip's only grey edge (`--eq-ink-2`); on the grid that same booking has the blue coming-up edge, and grey on the Hub means "over". Same quiet blue as coming up (matches the grid), the orange now mark (`--eq-hero`, "orange is now"), or keep the grey so "now" stands apart from "soon"?
6. **A finished Hub card's time and "Not logged".** They now lift to the ink so they read (they were about 2.9:1 at 0.70). Keep that, or should a finished card stay quiet?
7. **`ConsultationWizard.tsx`** is unmounted dead code with about 46 raw colours, kept for the consultation redesign (its checkbox overrides, `data-[state=checked]:bg-[#38BDF8]`, never draw under Base UI). Keep it, or delete it (with its render test and the tab-words assertion, and the notes in `ARCHITECTURE.md` and `KNOWN-TRAPS.md`)?
8. **The next colour pass?** Seen in the sweep, out of this round, none of them blocking the push: the calendar's trainer avatars put white initials on the orange tone (`calendar.css` `.cal-avatar`, 3.55:1 light, 2.99 dark), which breaks "no white words on any orange"; Learning's dark pull family colour is still the old sky `#38bdf8`; the FORD pillar and Pulse fills in dark; the progress-report editor's dark surfaces are the old slate; amber caution (the profile header's flags, the routine drawer, the paused clock's gold, the elevated flags, the briefing's Heads up and safety band, the calendar's away days, Add a client's Force Create, the record's "Reason required") is a recorded drift from plum; and the destructive styles are still Tailwind red and rose (Scrap Session, the InBody delete, the session detail's delete, `StrongConfirmationModal`'s destructive branch and Wipe Data, the trainer profile edit's remove-certification hover) rather than `--destructive`. Seen in the follow-ups: orange states that look like selections but are deliberate or out of round (Operations' orange identity in the avatar menu's Operations and Admin segments and the Operations nav's tab; Relay's assign toggle `.sh__assign--on`; the progress-report editor's metric toggles), an orange hover tint that stays after a tap on the iPad (`.stg-kind:hover`), a machine note's flag dot in the go pair where a flag is plum (`.eq-note-dot--flag`), and the destructive tint going violet-grey in dark; and the grid's `.jg-btn`, `.jg-seg2` and `.jg-rail*` rules have no screen that draws them.
9. Optional, taste only: a brighter dark ok green (`#42e1bd`) so a done mark and a Critical mark differ more by colour as well as shape. No check fails without it.

## The iPad walk (checklist Round 54)

On an iPad, upright and on its side, in light, dark and System. Delete and re-add the Home Screen icon first, then the status-bar gate above. Then the frame, the Hub in the morning and at the now marker, your column, a coming-up card, the strip, every Start, a Critical card and a Celebrate chip in dark, the Active Session, End Session, the Wrap-up, the briefing, a client profile, My Studio, Learning and the Catalog, Operations and Admins, Add a client. Finally sign out: the iPad comes back dark, the default. `docs/ops/TESTING-CHECKLIST.md` Round 54 is the list, and Round 55 is the follow-ups' (the blue Saves and selections, the Journey tab's dates, the session's control edges).

## How to ship

```
powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-navy-frame.ps1 -Stage prepare
powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-navy-frame.ps1 -Stage golive
```

`prepare` changes nothing: the branch, a clean tree, that it fast-forwards master, that rules, indexes and functions are unchanged, the case check, the typecheck count (2), the suite in Eastern time and the build. `golive` asks for GO, tags master as `restore/2026-10-04-before-navy-frame`, and pushes the branch to master. **Every push to master deploys.** Then delete and re-add the Home Screen icon, and walk Round 54.

The follow-ups ship on their own, from their worktree folder (`.claude\worktrees\colour-followups`), the same two stages:

```
powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-colour-followups.ps1 -Stage prepare
powershell -ExecutionPolicy Bypass -File .\scripts\ship\ship-colour-followups.ps1 -Stage golive
```

`prepare` also checks that master holds `e38d29bb` and that `index.html` and `public` are unchanged; `golive` tags master as `restore/2026-10-04-before-colour-followups` first. No Home Screen icon re-add this time. Then walk Round 55.

## Measured

On the branch's final commit, in the worktree on AJ's PC: typecheck **2** (the baseline: `clinical-review/charts.tsx`, `trainer-profile/EditTrainerModal.tsx`); `TZ=America/New_York npx vitest run --dir src` **9,551 passing in 663 files**, none failing (master `db46d32c`: 8,886 in 653); `npx vite build` clean; the case check prints nothing. The Hub, a client profile, the Client Directory and My Studio were looked at in light and dark in a browser on the branch. **Not yet seen on an iPad.**
