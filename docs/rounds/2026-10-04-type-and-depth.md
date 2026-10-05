# Type and depth ("Refined Lift") — Oct 4 2026

**Branch:** `oct4/type-depth`, off `oct4/colour-followups` (`6340109a`, the Navy Frame and its three follow-ups). Fourteen phases, one commit each (two for the last: the look and these docs), each typechecked at the baseline (2), run through the whole suite and built before the next began. The phases are separate so each can be reverted alone; they ship as ONE push, because half a look reads as patched. No Firestore rules, indexes, Cloud Functions, server or Mindbody change. The plan, the kits, the maps and each phase's working files are in `harness/depth/` on AJ's PC, which git ignores.

## What AJ asked

After the Navy Frame's colours went live, Oct 4 2026:

> "a lot of buttons and backgrounds in the app currently have a sharp cutoff look, especially in light mode, there are sharp white boxs all over the place, i think borders and headers just needs a little bit of weight and depth ... now i just think we need to pick our fonts, font size, header weight and depth and add some dropshadows"

## Why it looked cut out (the causes)

The "white boxes" were not pure white any more (the Navy Frame had taken the cards to `#F3F6F9` on a `#DEE6EE` ground). Four habits made them look cut out of paper, and a fifth made the words look shouty:

1. **No lift.** Most panels had no shadow, or `0 1px 2px` at 10%: a 1px hairline was the only thing that told a card from the page.
2. **The strong edge used as an outline on a flat fill.** Almost every secondary button, the Hub's command bar, the Relay cards and the sticky grid heads were a thin dark `#7A8694` line round a flat box.
3. **A box inside a box.** Bordered tiles, bordered row lists and dashed empty boxes sat inside bordered panels: three nested outlines. During the migration most clients' Journey sections are empty, so the dashed empty box was one of the most-seen shapes in the app.
4. **Bands that end in a hairline.** Each room's bar under the navy frame, and each panel's tinted head, stopped at a 1px line with nothing falling from it.
5. **The type.** The display face (Saira Condensed) came from Google through a render-blocking, three-hop chain, so on slow studio Wi-Fi the headings reflowed, and offline every heading fell back to slanted Geist. Neither face has an italic file, so every slant on screen was the browser's fake. Titles were slanted capitals; labels were 8.5 to 11px capitals in a grey ink; almost everything was 700 to 900 weight, so nothing stood out. Operations' 260 buttons were 12px capitals.

The full map, box by box, is `harness/depth/map-sharp-boxes.md`; the type and depth maps beside it.

## How it was chosen

Four designers each built a kit of type and depth for the app's own class names (Refined Soft Lift, Athletic Lift, Soft Premium, Layered light). Each was rendered over working mocks of the Hub, the profile's Overview, Settings and Learning, in light and dark, and judged. The judges' winner was **Refined**; the recommended kit, **Refined Lift** (`harness/depth/kit-recommended.css`), is Refined with the best ideas of the other three grafted on. Then two skeptics tried to break it, and the plan changed (the plan's "What the review changed"):

- **Raised buttons keep their 3:1 edge.** AJ had said "yes" that morning to firmer outlines on the session's controls, and the Navy Frame's rule is "control boundaries 3:1 or more". Under a washed-out "gym floor glare" filter the first draft's soft edge faded to nothing (`harness/depth/shots/fix/glare-*.png`), so raised means a lighter fill, a lift and a press ON the 3:1 edge.
- **The Active Session's stacking order is untouched**, and so are its pinned control edges and separators; No set? stays dashed.
- **The profile header has a height budget** (AJ, Oct 2: "the top of the profiles just feel so bulky"): its first panel may move at most 20px in portrait and 16px in landscape.
- **The codex lede stays 17/600 in ink**, so what a trainer reads never sits quieter than its panel's title.
- **Go is Start session only.** Other orange buttons take Go's depth, not its slanted capitals.

The runner-up, **Scoreboard** (`kit-runnerup.css`), put upright capitals on places and banded heads. The comparison page AJ answered from is the artifact <https://claude.ai/artifact/D2w7Mnhu7BszS2SKHtNkkN>.

## AJ's answers

AJ picked Refined Lift and answered **"1a 2a 3b"**:

1. **1A — the voice of titles.** Titles are upright Saira Condensed in ordinary capitalisation ("Trainer Settings", "Sonya Weiland"). The slanted capitals stay only on the studio name and Start session (Go). Geist for everything else. (1B was the runner-up's upright capitals and banded heads; 1C kept today's slanted capitals.)
2. **2A — buttons keep the firm outline.** Every button keeps the 3:1 outline he said yes to for the session, and gains a lighter face, a small lift and a press. Buttons stay crisp under gym-floor glare. (2B was a soft edge with the lift doing the work; 2C changed panels only.)
3. **3B — the Active Session gets the full type voice this round.** No label under 11px (55 declarations were 7.5 to 10.5px) AND its capital-letter labels in ordinary capitalisation where they fit, each measured against its fixed row height. Its depth comes too, without touching its stacking order or its pinned edges and separators. (3A was sizes only; 3C left the session for its own round.)

## The system, in one page

### Faces: two faces, one job each

| Role | Face | Size / weight | Case |
| --- | --- | --- | --- |
| Page title | Saira Condensed, upright | 30 / 800 | Mixed |
| A person's name as a title | Saira Condensed, upright | 30 (the profile header), 22 (the peek, a sheet, a card) / 800 | Mixed |
| A lane head on the Hub, a room's title in its bar | Saira Condensed, upright | 17 / 800, 22 / 800 | Mixed |
| Headline figures | Saira Condensed, upright | 22 / 800 (strips, facts); 30 (a big number); 17 (day numerals, hours) | |
| Machine codes | Saira Condensed, upright | 14 / 700, a jersey tag ringed in its own ink | |
| **Brand slant** | Saira Condensed, slanted capitals | 20 (the studio name), 17 (Go) / 800 | CAPS — the studio name, Start session, the front door's display line. Nowhere else |
| Section title | Geist | 22 / 800, -0.015em | Sentence |
| Panel title | Geist | 17 / 700, -0.01em, ink, led by a 32px icon square | Sentence |
| Label (over a list or field) | Geist | 14 / 700, ink-2 | Sentence |
| Eyebrow (the one capitals style) | Geist | 12 / 700, 0.08em | CAPS, over a page title only |
| Body | Geist | 14 / 450 (420 in dark), ink-2 | |
| Codex lede | Geist | 17 / 600, ink, as before | |
| Meta | Geist | 12 / 500, muted | |
| Buttons | Geist | 14 / 700 | Sentence — every room, Operations included since phase 14 |
| Tabs, segments | Geist | 14 / 600; the picked one 700 | Sentence |
| Chips | Geist | 12 / 700 | |

**The fonts are self-hosted.** Saira Condensed is vendored at 700 and 800 only (`src/assets/fonts/saira-condensed/`, latin 17,808 and 17,984 bytes, latin-ext 14,716 and 14,868, with its SIL OFL licence), bundled by Vite beside Geist. Nothing loads from Google (the unused Inter went with the import). The faces are the same, so nothing changes shape: it now renders offline and never reflows on slow Wi-Fi. `--font-weight-black` is 800. Saira as vendored has **no `tnum`** and proportional digits, so a number that changes in place (a clock, a set's reps) stays in Geist.

**The scale** is 11 · 12 · 14 · 17 · 22 · 30: today's pinned scale plus 22 (a section title, a name in a sheet, a headline figure). Nothing new uses 11. **Body text stays 14** (a 15px body would be a round of its own). **The weights:** 450 body (420 in dark), 500 meta, 600 tabs and row labels, 700 titles, labels and buttons, 800 display and section titles.

### Depth: one recipe per kind of thing

All of it is tokens in `src/index.css` (`:root` and `.dark`), carried by every feature palette under its own prefix (`--eq-elev-2`, `--adm-elev-2`, `--st-elev-2`…). The shadow ink is the logo's navy, never black: `rgba(25,45,65,a)` in light, the deepest navy `rgba(2,10,20,a)` in dark, where depth comes from lighter surfaces and soft rims.

| Piece | What it is |
| --- | --- |
| **Panel** | an edge seen from OUTSIDE the card (`--edge`, navy at 13% / a pale rim in dark, the fill clipped to the padding box) and a short two-layer lift (`--elev-2`: `0 1px 2px .08, 0 6px 18px -6px .24`), plus a white top light in dark. Its head has no band and no rule: the 17/700 title carries it |
| **Raised control** (a button you can press) | a fill a hair lighter than the card (`--raised`, never white), `--elev-1` and a white top light, **on its 3:1 edge** (AJ's 2A). On `:active` it moves down a pixel into an inset (`--press`): a transform, never an animated shadow. Disabled lies flat; a quiet or ghost button never lifts |
| **Solid** (blue, Go) | a tinted drop in its own colour and a top light (`--glow-live` / `--glow-go`, `--solid-light` / `--go-light`); no gradient, no dark foot |
| **Well** (holds information) | the well tone (`--well`, darker than the card in both modes), an inner shadow (`--elev-0`), no edge, radius 12. An empty place is a well with a sentence; dashes stay only where they mean "nothing here" or "not this client's own record" |
| **Field** | keeps its 3:1 edge and sinks into the well |
| **Shelf** | a room's bar over scrolling content casts a short shadow instead of ending in a hairline |
| **Frame** | the navy header and bottom bar cast onto the page (`--frame-down`, `--frame-up`) |
| **Popover, sheet, dialog** | `--elev-4` / `--elev-5` over a navy scrim at 30% (it was black at 10%); in dark a popover is a step lighter than the card with a white rim |
| **Hub booking** | a small lift (`--elev-card`, two blurs of 8px at most) only while it is a client's and not over; the 4px state rail stays |

**Radius** is unchanged as a system: panels 14, the hero 20, sheets 18, controls and wells 12, icon squares 10, Hub cards 12, chips a pill.

### The seven rules

1. **Raised** means you can press it: a lighter fill, a lift and a press, on the control's 3:1 edge. A **well** holds information.
2. Fields keep their 3:1 edge and sink.
3. A coloured rule on a rounded box is a **straight band painted as a background layer**, never a border wider than 1px (which tapers into a crescent at the corners), nor an inset bar (which follows the curve too).
4. Resting shadows stay short (a blur of 18px at most with a negative spread), so a scroll parent never cuts one off.
5. **Never animate `box-shadow`**, in CSS or in a className: no `transition-all` or `transition-shadow` on anything that carries a shadow. A press is a transform.
6. A hover that changes a fill in CSS sits inside `@media (hover: hover)`, so an iPad's sticky hover never flattens a raised button.
7. Every `var(--x)` a rule reads is declared somewhere in `src`: an undeclared one makes the whole `box-shadow` invalid, and the box goes flat with no warning.

## What changed, phase by phase

| Phase | Commit | What |
| --- | --- | --- |
| 1 | `a3c7ac3b` | The display face self-hosted at 700 and 800; nothing from Google; the session's and the routine builder's font tokens read the app's |
| 2 | `c7bf92c3` | The scale gains 22; the body gets its own weight (450 / 420); `tracking-widest` 0.08em |
| 3 | `11bfe32c` | The depth tokens in `index.css` and every palette copy |
| 4 | `654298cd` | The shared primitives: Button (raised outline, solid blue, every size 40px or more), the dialog (`--elev-5` over the navy scrim), fields that sink, tabs in a tray |
| 5 | `042bb344` | The frame casts; each room's top bar is a shelf (the Hub, My Studio, Learning, Operations) |
| 6 | `80628dbe` | The codex kit, the most-seen panels: Notes & Profile's cards and slots lift, their heads become titles, empties sink |
| 7 | `176df086` | The profile header is a card within its height budget; the facts one well; the tools one raised group; its tabs drop the capitals |
| 8 | `88463ff4` | Buttons in every room lift, press and keep their edge; Go has one voice (Start session's slanted capitals at 17/800) |
| 9 | `1046d8c7` | Empty places and inner tiles sink; list lines become rows |
| 10 | `c32641ec` | Panels lift on a soft edge in every room; heads lose the band and the rule; coloured rules become bands |
| 11 | `f785a0a3` | The Hub: bookings lift, the command bar sinks, the peek is a popover, names and hours in Saira |
| 12 | `bbeef32d` | Titles stand upright in Saira in their own capitalisation; no faked italics; Saira's numbers |
| 13 | `b0391c9e` | The Active Session: nothing under 11px, nothing in capitals (AJ's 3B), its controls raised, the grid lifted, the Now Bar docked |
| 14 | `f0782379` | Operations' 260 buttons speak 14/700 as written; the depth rules held app-wide; seventeen callouts that tapered into crescents became bands; fourteen class lists stopped animating a shadow; three tints got a 3:1 edge |

Each phase's commit message sets out what it moved, the deviations from the plan with their reasons, and what it owes the iPad walk.

## What holds it (the tests)

Every guard reads the source (jsdom draws no CSS, so nothing can be measured on screen). If one fails, the fix is the stylesheet, not the test.

- **`src/fonts.test.ts`** (phase 1): no Google font, the Saira files exist at 700 and 800 only with their licence, no rule asks Saira for 600 or 900, the body weight and the eyebrow's tracking.
- **`src/css-vars-declared.test.ts`** (phase 3, grown each phase): every `var(--x)` without a fallback, in the stylesheets the round touched, is declared somewhere in `src`.
- **`src/elevation.test.ts`** (phases 3 and 14): the tokens (navy never black, short resting shadows, lighter is higher, a raised fill keeps the 3:1 edge) and, since phase 14, **the rules across every stylesheet and component in `src`**: the most-seen panels lift; no shadow is raw black; nothing animates a shadow (a class list read whole, across a `cn()` call); no crescent (the rails that stay are listed with reasons, exact both ways); nothing tappable under 40px; every raised control keeps a 3:1 edge (a control token, a solid fill, or a tint measured on its card in both modes); no well in `bg-muted` or `--bg-dark-3`.
- **`src/components/ui/button-sizes.test.ts`** (phase 4): every Button size is 40px or more, no caller shrinks one or animates its shadow, and no className writes a shadow as an arbitrary value starting with `var(` (or `inset-shadow-(`).
- **`src/frame-and-shelves.test.ts`** (phase 5): the frame's cast, the shelves and their z-order, the Active Session's layers.
- **`src/features/client-codex/kit/depth.test.ts`** (phase 6): the codex kit's panels, heads, wells and buttons.
- **`src/buttons-depth.test.ts`** (phase 8): the raised recipe on 35 buttons, each palette's edge (3:1) and words (4.5:1) on its raised fill in both modes, Go's voice and depth, the 40px list, pointer-only hovers.
- **`src/wells-and-rows.test.ts`** (phase 9): every well, its words at 4.5:1 in both modes, the rows.
- **`src/panels-and-heads.test.ts`** (phase 10): 47 panels, their heads, the two voices, the icon squares, the bands.
- **`src/features/hub-schedule/hub-depth.test.ts`** (phase 11): the Hub's bookings, bar, numerals, lane heads, hours and peek.
- **`src/type-voice.test.ts`** (phases 12 and 14): the display face slanted and in capitals only on its allow-lists; no faked italics; titles, names, figures and codes upright; Geist heads; dialog titles; the panel heads the plan names; Operations' button voice, and every `AdminButton` label in sentence case.
- **`src/features/journey-grid/session-depth.test.ts`** (phase 13): the session's stylesheet free of sizes under 11px and of capitals, its raised controls, the lift and the dock with no new z-index, its 40px reaches and its words at 4.5:1.
- **`src/lib/names-wrap.test.ts`** (extended): the new name classes (the lane head, the peek's name, a booking's name, the profile header's name, the briefing's, a machine's, a trainer's, the codex's page title) never clip.
- **`next-session-tile.test.ts`**: "Tomorrow ·" and "7:30 AM" break only between them (no-break spaces, written as escapes).

Each new guard was checked by breaking the code on purpose (phase 14: eleven ways, each failed).

## What stayed unchanged on purpose

- **Every colour of the Navy Frame and its follow-ups** and their meanings: blue acts, selects and is in session; orange is now and go; crimson is Critical and rep quality; plum is caution. Only shadow and edge tints in the logo's navy were added.
- **The logo**, the front door's display line (a brand moment, now from the self-hosted file) and the loading mark.
- **The 3:1 edges** on inputs, selects, checkboxes, the Relay tick box, every button that had one, and the session's controls on `--jg-control-edge`, with No set? dashed.
- **The Active Session's stacking order and its sticky separators** (no z-index was added anywhere in it).
- **The pinned button voice** (14/700, sentence case), **the codex lede** (17/600 in ink), **Geist at 14 for body**.
- **The Hub's state rails**, its receded, unlinked and staff flatness, today's orange underline, your column's blue rule, and the kaizen red.
- **The order of the profile's four tabs.**

## Values that differ from the plan, and why

Where the plan and the kit disagreed, the kit's rendered values won; each phase's commit lists its own. The ones a reader is most likely to trip on:

- **The frame keeps z-20 / z-30**, not the plan's 12: the briefing's sticky Start session bar is z-20, and a frame under it would lose its cast there (phase 5).
- **Shadows in a className are one token** (`shadow-(--raised-lift)`, `--solid-lift`, `--go-lift`, `--panel-lift`), never `shadow-[var(…),…]`: tailwind-merge files an arbitrary shadow starting with `var(` as a colour (phase 4), and `inset-shadow-(--token)` writes a second `inset` (phase 7).
- **Some Admins rows stay rows** (`.hq-row__open`, `.hq-result`, `.hq-setting`), not raised boxes or panels: a box in a box is what the round removes (phases 8, 10).
- **The Hub card's own type is unchanged** (name 14/700, number 11/600): the plan's 800 and 12px would push a half-hour card's name onto two lines in a 156px lane (phase 11). AJ's call on the iPad.
- **No shelf on the session's per-cell sticky heads**: the shelf's negative spread on an 84px head casts a row of blobs (phase 13).
- **Operations' small button is 14/700 too**: small means the padding, never the voice (phase 14).
- **The raised-edge guard measures tints rather than refusing them**: a tint (danger, live, ok, warn) draws its own ink, held at 3:1 on its card in both modes. Three tints failed it and were fixed: the Catalog's Saved and Couldn't save, and the codex's blue tint, whose 45% line was 2.3:1 (phase 14).

## Known trade-offs

- **A static guard can't see two classes on one element.** The Deep Dive's rhythm card is a `.cr-card` too, so its rounded corners come from another rule; phase 14 fixed it by hand and says so in its comment. A crescent built the same way elsewhere would pass the scan.
- **Wells on the page ground read as soft pads.** The Archive's figures, Programming's counts, Openings' times and the clinical strip sit on the page, not in a panel, where the well tone is only 1.05:1 off it. If they look too faint, the page's sunk tone is the tray (`--X-tray`), and the muted ink would move to ink-2.
- **The always-dark screens were not repainted**: the error screen, the legacy chart importer, the unmounted consultation wizard and the client-facing progress report keep their own palettes (the Navy Frame's `NOT_THIS_ROUND`), and took only what the guards require (no shadow transitions, no black shadow tokens).
- **Three raw black shadows remain in class lists** (the session timer's unmounted card variant, the Add a client modal's dark glow, the legacy importer): the plan's guard holds stylesheets; these are listed for a later pass.
- **Older rules elsewhere still put words in the faint ink** (about 120 at the Navy Frame; this round moved the ones it touched), and some heads keep their band (`.stq__head`, `.ford-sweep__head`, `.sra-pillar__head`, the Directory's and the history sheet's column heads; the Wrap-up's card heads keep their 12px capitals, pinned by its render test). The Deep Dive's cards (`.cr-card`) did not become panels.
- **Not under 40px but close**: the shadcn Checkbox (a 16px box with a tap area of about 40 × 32) and Switch (about 34px tall), and the In progress trigger's white words on amber (about 2.1:1), are older than this round.

## For AJ: what is still open

1. **The Hub card's name at 800 and its number at 12px**, as the kit draws them: check a half-hour card in a narrow lane on the iPad (phase 11).
2. **The profile header at 744 portrait**: a client with renewal words beside "Client since" now wraps that line, within the 20px budget; the cheapest fix if it feels bulky is the tool words at 12px below 768px (phase 7).
3. **Wells on the page ground**: soft pads, or the tray's deeper tone (above)?
4. **Body at 15px** would read a step bigger at arm's length; it is its own round (about 2,000 size declarations and five pinned scales). Say if you want it.

## The iPad walk (checklist Round 56)

Nothing in this round was checked by eye: every phase ran without a browser, and each read its compiled CSS instead. `docs/ops/TESTING-CHECKLIST.md` Round 56 is the walk, in portrait and landscape, in light, dark and System: the Wi-Fi-off font check, every room's panels, buttons and wells, the profile's top against its budget, the Hub, and a full session from Start to the Wrap-up.

## How to ship

No rules, indexes, Cloud Functions, server or Mindbody change, so it is the push alone: **every push to `master` deploys to trainers.** Before it: the case check (`git ls-files | tr A-Z a-z | sort | uniq -d` prints nothing), typecheck 2, the suite in Eastern time, the build; then a restore tag on master and the push; then the walk. The fonts now ship inside the build, named by their content (`saira-condensed-latin-800-normal-<hash>.woff2`), so a later deploy that doesn't change them keeps the same files, and an open iPad picks the new look up the way it picks up any new version (`features/new-version`).

## Measured

On the branch's last commit, in the worktree on AJ's PC: `npx tsc --noEmit` **2** errors (`charts.tsx`, `EditTrainerModal.tsx`, as before); `TZ=America/New_York npx vitest run --dir src` **10,864** passing in **675** files, none failing (the base, `oct4/colour-followups`, measured 9,657 in 663); `npx vite build` clean, with no CSS-optimiser warnings since phase 14. The round changed 159 files (+11,270, -1,659 lines, most of them the guards) before these docs.
