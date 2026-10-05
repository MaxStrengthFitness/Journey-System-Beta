# Type and depth ("Refined Lift") — Oct 4 2026

**Branch:** `oct4/type-depth`, off `oct4/colour-followups` (`6340109a`, the Navy Frame and its three follow-ups). Fourteen phases, one commit each (two for the last: the look and these docs), then the review's fixes (Oct 5 2026, one commit and its docs), a follow-up for the last old words (one commit and its docs) the finish round's sweep of all of `src` (three commits and their docs), and AJ's three answers to the open calls (Oct 5 2026, "1a 2a 3a": three commits and their docs), each typechecked at the baseline (2), run through the whole suite and built before the next began. The phases are separate so each can be reverted alone; they ship as ONE push, because half a look reads as patched. No Firestore rules, indexes, Cloud Functions, server or Mindbody change. The plan, the kits, the maps and each phase's working files are in `harness/depth/` on AJ's PC, which git ignores.

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
| **Brand slant** | Saira Condensed, slanted capitals | 20 (the studio name), 17 (Go) / 800 | CAPS — the studio name, Start session, In progress (Go's other state) and the front door's display lines. Nowhere else (the briefing's safety heading dropped its upright capitals in the follow-up; the Deep Dive's Build the Deep Dive stood upright with AJ's 2A) |
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
| **Well** (holds information) | the well tone (`--well`, darker than the card in both modes), an inner shadow (`--elev-0`), no edge, radius 12. An empty place is a well with a sentence; dashes stay only where they mean "nothing here" or "not this client's own record". **On the page ground** (not inside a panel) a well takes the tray's tone (`--X-tray`, below the page in both modes) and its words ink-2 (AJ's 1A) |
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
| Review | `85c7c106` | The review's fixes (Oct 5): the sheets a session opens speak its voice; a raised control on a popover steps up in dark; the peek's Go words for Start session alone; the last old words on the frame, the bell, toasts, dialogs, the Wrap-up, the briefing and the rooms; 900 calmed to 800 in every stylesheet; three guards widened (below) |
| Follow-up | `e7e80aa8` | The last capitals the lead saw (the briefing's safety heading, the Dial's Not asked, Learning's switch, the feedback drawer) and the dialogs the review deferred, in the round's voice and depth (below) |
| Sweep | `39f1cc48` | The trainers' rooms no walk had opened: 196 rules in capitals, tracked wide or under 11px take the round's voice; tap targets to 40px; dashed empties become wells (below) |
| Sweep | `fa2c1fb5` | The admin kit's labels, First-time setup retyped, and one capitals style held across all of `src` (below) |
| Sweep | `78829bcb` | The last flat buttons on a hairline raised on the 3:1 edge (below) |
| 1A | `c3ce57d1` | Wells on the page ground sink into the tray (AJ's answers, below) |
| 2A | `46595f24` | Build the Deep Dive stands upright in the button voice; slanted capitals are the studio's name, Start session, In progress and the front door (below) |
| 3A | `550d7f51` | Chips and toggles a trainer taps take the firm 3:1 edge (below) |

Each phase's commit message sets out what it moved, the deviations from the plan with their reasons, and what it owes the iPad walk.

## What holds it (the tests)

Every guard reads the source (jsdom draws no CSS, so nothing can be measured on screen). If one fails, the fix is the stylesheet, not the test.

- **`src/fonts.test.ts`** (phase 1): no Google font, the Saira files exist at 700 and 800 only with their licence, no rule asks Saira for 600 or 900, the body weight and the eyebrow's tracking; since the review, **no stylesheet asks for 900 at all** (Geist is variable, so 136 rules that wrote 900 drew heavier than every class list).
- **`src/css-vars-declared.test.ts`** (phase 3, grown each phase): every `var(--x)` without a fallback is declared somewhere in `src`; since the review it reads **every stylesheet in `src`**, not only the ones the round touched (all passed).
- **`src/session-sheets-type.test.ts`** (the review): the sheets a session opens (the machine sheet, the Pulse slide-over and quick log, the note composer, the briefing, the Journal's Today, and since the follow-up the Dial and Loudness) set no text under 11px and no capitals beyond Go; the components it mounts (the notes sidebar's cards, the Critical strip, the stale-session and pick-a-client dialogs, a toast, the leave question) carry no capitals, nothing under 11px and no raw veil.
- **`src/elevation.test.ts`** (phases 3 and 14): the tokens (navy never black, short resting shadows, lighter is higher, a raised fill keeps the 3:1 edge) and, since phase 14, **the rules across every stylesheet and component in `src`**: the most-seen panels lift; no shadow is raw black; nothing animates a shadow (a class list read whole, across a `cn()` call); no crescent (the rails that stay are listed with reasons, exact both ways); nothing tappable under 40px; every raised control keeps a 3:1 edge (a control token, a solid fill, or a tint measured on its card in both modes); no well in `bg-muted` or `--bg-dark-3`. Since the review the 40px scan names tabs and back buttons too, not only `btn` (it had missed the Archive's session tabs at 32px and the machine sheet's back button at 36px); since the sweep, **every rule with `cursor: pointer`**, whatever its name, each exception with its reason.
- **`src/components/ui/button-sizes.test.ts`** (phase 4): every Button size is 40px or more, no caller shrinks one or animates its shadow, and no className writes a shadow as an arbitrary value starting with `var(` (or `inset-shadow-(`).
- **`src/frame-and-shelves.test.ts`** (phase 5): the frame's cast, the shelves and their z-order, the Active Session's layers.
- **`src/features/client-codex/kit/depth.test.ts`** (phase 6): the codex kit's panels, heads, wells and buttons.
- **`src/buttons-depth.test.ts`** (phase 8): the raised recipe on 35 buttons, each palette's edge (3:1) and words (4.5:1) on its raised fill in both modes, Go's voice and depth, the 40px list, pointer-only hovers; since the follow-up, the deferred dialogs' secondary buttons raised on `border-input` with the lift, or the outline variant; since the sweep, seven more raised buttons, and the briefing's palette measured.
- **`src/wells-and-rows.test.ts`** (phase 9): every well, its words at 4.5:1 in both modes, the rows; since AJ's 1A (section 8), every well on the page ground in its family's tray, below that page in both modes, with no word in the muted or faint ink, and the shared wells placed there by selector.
- **`src/firm-chips.test.ts`** (AJ's 3A): 35 chips, segments, choice tiles and toggle rows on the firm 3:1 edge, measured on their fill in both modes, each picked state keeping its own edge; the sweep of every pointer rule on a family's hairline, exact both ways with its reasons; informational chips keep the soft edge; their hovers a pointer's only.
- **`src/panels-and-heads.test.ts`** (phase 10): 47 panels, their heads, the two voices, the icon squares, the bands.
- **`src/features/hub-schedule/hub-depth.test.ts`** (phase 11): the Hub's bookings, bar, numerals, lane heads, hours and peek; since the review, the peek's raised step above the popover in dark and `index.css`'s own pair for dialogs, sheets and menus.
- **`src/type-voice.test.ts`** (phases 12 and 14, and the follow-up): the display face slanted and in capitals only on its allow-lists (since the follow-up, the slanted ones alone; since AJ's 2A, exactly the studio's name, Start session, In progress and the front door, and Build the Deep Dive upright in the button voice); no faked italics; titles, names, figures and codes upright; Geist heads; dialog titles; the panel heads the plan names; Operations' button voice, and every `AdminButton` label in sentence case; since the follow-up, the dialogs the review deferred (section 9) and Learning's switch (section 10); since the sweep, **all of `src`** (section 11): capitals only on the eyebrow, Go and the brand, a first letter and the report; no text under 11px but initials and counts in their dots; no wide tracking; the class lists by file and count.
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
- **Shadows in a className are one token** (`shadow-(--raised-lift)`, `--solid-lift`, `--go-lift`, `--panel-lift`), never an arbitrary shadow that starts with var() inside square brackets: tailwind-merge files an arbitrary shadow starting with `var(` as a colour (phase 4), and `inset-shadow-(--token)` writes a second `inset` (phase 7).
- **Some Admins rows stay rows** (`.hq-row__open`, `.hq-result`, `.hq-setting`), not raised boxes or panels: a box in a box is what the round removes (phases 8, 10).
- **The Hub card's own type is unchanged** (name 14/700, number 11/600): the plan's 800 and 12px would push a half-hour card's name onto two lines in a 156px lane (phase 11). AJ's call on the iPad.
- **No shelf on the session's per-cell sticky heads**: the shelf's negative spread on an 84px head casts a row of blobs (phase 13).
- **Operations' small button is 14/700 too**: small means the padding, never the voice (phase 14).
- **A raised control on a popover is a step lighter again in dark** (the review). In dark the popover (`#22374B`) is a step above the card and LIGHTER than the page's raised fill (`#203549`), so an outline button in a dialog, sheet or menu read level with it or sunk while its lift said raised. Inside those surfaces (`[data-slot=dialog-content]`, the sheet, the menus and a select's list) `--raised` and `--input` become `--popover-raised` `#283E54` (1.11:1 above the popover) and `--popover-input` `#7D92A6` (3.43:1 on the fill, 3.81:1 on the popover); the Hub's peek does the same through `--eq-popover-raised` and `--eq-popover-edge`. Light is unchanged.
- **The peek's primary is Go's depth in every state, Go's words only for Start session** (the review): `data-go` is set only on a booking still to come; Open session, Resume or start new, Log past session and Edit session speak the 14/700 button voice under Go's glow.
- **The raised-edge guard measures tints rather than refusing them**: a tint (danger, live, ok, warn) draws its own ink, held at 3:1 on its card in both modes. Three tints failed it and were fixed: the Catalog's Saved and Couldn't save, and the codex's blue tint, whose 45% line was 2.3:1 (phase 14).

## Known trade-offs

- **A static guard can't see two classes on one element.** The Deep Dive's rhythm card is a `.cr-card` too, so its rounded corners come from another rule; phase 14 fixed it by hand and says so in its comment. A crescent built the same way elsewhere would pass the scan.
- **Wells on the page ground were a hair LIGHTER than the page, not below it** (`#E4EBF3` on `#DEE6EE` in light, `#0D2235` on `#0A1C2C` in dark), so the inner shadow sat inside a pad that read raised. AJ's 1A moved them into the tray (below). **A shared well class takes the tray only where it is placed on the page** (`.st-page > .cx-empty`, `.adm-screen > .adm-empty` and the rest): a later change that wraps one in a div would put it back on the well tone without a test noticing, so keep those empties direct children of the page's own column.
- **The always-dark screens were not repainted**: the error screen, the legacy chart importer, the unmounted consultation wizard and the client-facing progress report keep their own palettes (the Navy Frame's `NOT_THIS_ROUND`), and took only what the guards require (no shadow transitions, no black shadow tokens).
- **One raw black shadow remains in a class list**, the legacy importer's (an always-dark screen). The session timer's unmounted card variant went in the review, and Add a client lost its dark black glow.
- **Older rules elsewhere still put words in the faint ink** (about 120 at the Navy Frame; this round, its sweep included, moved the ones it touched), and some heads keep their band (`.stq__head`, `.ford-sweep__head`, `.sra-pillar__head`, the Directory's and the history sheet's column heads).
- **The lower-traffic dialogs took the voice in the follow-up** (below). Left as they were: the demo strip's Leave is a 26px line by design ("the floor has none to spare", and its test pins the height), so its tap area is under 40px; a few helper words keep Tailwind colours under 4.5:1 (the routine drawer's emerald and amber "Reason captured" / "Reason required" and its inactive Routine B's slate-400), since the follow-up changed case, size, weight and depth only.
- **Not under 40px but close**: the shadcn Checkbox (a 16px box with a tap area of about 40 × 32) and Switch (about 34px tall) are older than this round.

## For AJ: what is still open

1. **The Hub card's name at 800 and its number at 12px**, as the kit draws them: check a half-hour card in a narrow lane on the iPad (phase 11).
2. **The profile header at 744 portrait.** The review took the tool words to 12px below 768px (the renewal line no longer wraps there) and trimmed the late-cancels line's wrap to 14px. A client with late cancels still costs about 14px, upright and in the one-band layout: check one at 744 upright and at 1366 on its side, counting the Journey tab's machine rows.
3. ~~Wells on the page ground~~: **answered 1A** (Oct 5 2026), the tray's tone; built (below).
4. **Body at 15px** would read a step bigger at arm's length; it is its own round (about 2,000 size declarations and five pinned scales). Say if you want it.
5. ~~Go or brand?~~: **answered 2A** (Oct 5 2026), the front door's display lines and In progress keep the slanted capitals, Build the Deep Dive stands upright in the 14/700 voice with Go's depth; built (below).
6. **Colour and size calls the round did not make on its own**: the Now Bar's green climb (`--jg-pf-gain`, 4.2:1); "Abort session" in Tailwind red-500 (3.8:1); the session grid's REPS | SEC halves (about 19px), note icon (20px) and menu ⋯ (22px); the Today column's not-yet-logged weight in the faint ink (2.7:1); the session bar's flag marker on a raw amber edge, not a token.
7. **Hub bookings in dark** stand off the grid on a softer rim than before (1.22:1, it was 1.57:1). If they float on the walk, the one-line fix is a stronger rim for Hub cards in dark.
8. **The codex's list kickers inside panels** ("Training story", "Focus history") keep the 12px eyebrow capitals on purpose, per the codex kit; the plan reserves the eyebrow for page titles. Keep, or move them to the 14/700 label?
9. ~~Chips and toggles on a hairline~~: **answered 3A** (Oct 5 2026), the 3:1 edge; built on 35 (below).
10. **First-time setup's Setup info** does nothing when tapped (it never did): wire it to the machine's set-up, or take it away?

## The iPad walk (checklist Round 56)

Nothing in this round was checked by eye: every phase ran without a browser, and each read its compiled CSS instead. The sweep added its own section to the walk: the rooms no walk had opened. `docs/ops/TESTING-CHECKLIST.md` Round 56 is the walk, in portrait and landscape, in light, dark and System: the Wi-Fi-off font check, every room's panels, buttons and wells, the profile's top against its budget, the Hub, and a full session from Start to the Wrap-up.

## How to ship

No rules, indexes, Cloud Functions, server or Mindbody change, so it is the push alone: **every push to `master` deploys to trainers.** `scripts/ship/ship-type-depth.ps1 -Stage prepare`, then `-Stage golive`, from `.claude\worktrees\type-depth`: the case check, typecheck 2, the suite in Eastern time, the build; then the restore tag `restore/2026-10-05-before-type-depth` on master and the push; then the walk. It accepts master at either `e38d29bb` (the Navy Frame: the colour follow-ups have not been pushed, so this push ships them too, and Round 55 is walked with Round 56) or `6340109a` (the follow-ups already live), fast-forward only. No Home Screen icon re-add: `index.html` and the manifest do not change. The fonts now ship inside the build, named by their content (`saira-condensed-latin-800-normal-<hash>.woff2`), so a later deploy that doesn't change them keeps the same files, and an open iPad picks the new look up the way it picks up any new version (`features/new-version`).

## Measured

On the branch's last commit, in the worktree on AJ's PC: `npx tsc --noEmit` **2** errors (`charts.tsx`, `EditTrainerModal.tsx`, as before); `TZ=America/New_York npx vitest run --dir src` **11,066** passing in **677** files, none failing (10,933 in 676 before AJ's three answers; 10,910 before the sweep; 10,885 before the follow-up; 10,864 in 675 before the review's fixes; the base, `oct4/colour-followups`, measured 9,657 in 663); `npx vite build` clean, with no CSS-optimiser warning (until the review one remained: a comment in `button.tsx` and a line here spelled the bracket form of a shadow class, so Tailwind built an invalid class from them; both are reworded). The round changed 159 files (+11,270, -1,659 lines, most of them the guards) before its first docs.

## The review's fixes (Oct 5 2026)

A review of the whole branch found where the round had not reached and where it broke its own rules. Fixed, in commit `85c7c106`:

- **The sheets a session opens** (AJ's 3B had reached the grid, not them): the machine sheet's labels, chips, fields and back button; the Pulse slide-over and its quick log; the note composer's buttons and labels (open in the session's notes and the End dialog); the briefing's heads and small type; the notes sidebar's cards and the Critical strip; the stale-session and pick-a-client dialogs; the slide-over veils on the navy scrim.
- **Depth in dark on a popover**, the peek's Go words for Start session alone, the Now Bar's quality marks at 3:1 in dark, and the Today column's add kept inside its own row (a tap meant for the row above, or the "Not in today's routine" band, added a machine).
- **Words on orange in navy** everywhere the branch had touched one (In progress, Add a client's and the routine drawer's amber buttons).
- **The frame and the rooms**: the avatar menu (a tray with the picked mode raised, every item in words, Clear 40px), the bell's sheet, every toast (a sentence, a 40px close), the leave question, the profile's dialogs (Sessions before Journey, Discard, the A/B reason, the setup banner), the Wrap-up's card heads and lifetime tiles and fields, the Journal's Today, the eyebrows on the one capitals style, Notes & Profile's fact labels and loudness chip, Programming's heads and names, Operations' segmented control and its sticky hovers, the Archive's session tabs at 40px, the calendar's segments as words, the Deep Dive's cards as panels, the floor notes' and a few rooms' flat buttons raised, the Opportunities list's heads, the peek's veil in navy, the Sore drawer.
- **Weight 900 to 800** in every stylesheet; the history calendar's landscape card rule placed after its base so it applies (without its 9.5px day numbers); the session timer's dead card variant and ThemeToggle's dead default removed; two literal pins in `loud-orange.test.ts` made token sets (`someStringHas`), so the lift classes went back into one expression.

Rejected, with reasons: `.lps-pick` (named with the flat buttons) is the Log past session picker's container, not a button; `.cfl-toggle` is a toggle row with its own band, left a row. Left for AJ: the flags above (questions 3 and 5 to 8).

## The follow-up (Oct 5 2026)

The round's type voice, finished where it stopped. Two sources: what the lead saw on the real app (Demo Mode, light, an iPad mini's 744 × 1133) and the dialogs the review's fix deferred.

**What the lead saw, still true on the branch, now fixed:**

- **The briefing's safety heading.** "NOTHING FLAGGED — CLEAR TO GO." was the display face in upright capitals (the Stack's safety voice, Oct 3). AJ's 1A sets every title upright in its own capitalisation, with capitals for the studio's name and Start session alone, so it now reads "Nothing flagged — clear to go." in the same face, size (22), weight (800) and green. A limit's name in the same block ("Lower back") went with it. "Before you start" over it, the line under the client's name and the routine card's Edit had already been fixed by the review.
- **The Dial's "NOT ASKED".** The Dial's word (`.rt__word`) is the chip voice, 12/700 as written ("Not asked", "A bit short"); its question is the 14/700 label (it was 13); its legend is 11px (it was 10); Loudness says Note · Heads up · Critical in the segment voice, 14/600 and the picked one 700 (they were 11px capitals). This is the one Dial, so the note sheet, the Pulse and the progress report's Four Ps change with the briefing.
- **Learning's Overview / Catalog / Academy.** The switch is the run sheet's: a well inside its 3:1 edge, each segment 14/600 in its own words, the picked one raised with the soft ring at 700 (it was a hairline group of 11px tracked capitals). The Catalog figure's Front / Back is the same control.
- **The feedback drawer.** The line under "Help us build this" is a 14px sentence; Bug, UI feedback and Feature idea are raised buttons on the 3:1 edge in the button voice, the picked one the solid blue with its own lift; "Attached automatically:" is 12px words; "Send to the team" is the button voice. The title is the 22/800 section voice and the field sinks.

**The dialogs the review deferred, now in the round's voice** (labels the 14/700 label voice or 12px, buttons the 14/700 button voice raised on the 3:1 edge or a solid fill kept on hover, fields on their 3:1 `--input` edge and sunk, no `font-black`, no tracked capitals; every string's words kept, Title Case re-cased where the capitals had hidden it):

- **Edit routine** (`EditRoutineDrawer.tsx`): Routine A / B raised (the picked one the blue with its lift; B dashed until active), "Tap to activate" 12px, Preset routines the label, Save current a 40px text button, the preset pills 40px and raised with a 40px x (they were 28px with a 14px x), a studio's name wrapping (it was truncated), the reason field sunk, Close outlined beside Apply.
- **InBody scan**: labels, fields sunk on the 3:1 edge, the two disclosures raised, Keep it and Cancel raised, Remove solid red kept on hover, Save the blue with its lift.
- **The Kaizen toggle**: Track 40px (it was 36) and raised; its sheet's reasons raised; the note and the date sunk.
- **Log a conversation and the Renewal card**: chips and "A leader should follow up" raised; the facts sit in wells instead of boxes in the dialog; Cancel and Close raised. (`RenewalCardDialog.tsx` is mounted: ClientProfileView opens it.)
- **A session's delete** (the Activity Archive): Cancel outlined, Delete permanently solid red kept on hover.
- **The demo strip**: "Demo Mode — nobody here is real" and Leave at 12/700 as written, still one 26px line.
- **Edit trainer profile**: every label, the fields on the shared recipe, a certificate's remove 40px (it was 20px), the switch rows and Studio involvements & connections in words, Cancel outlined, Save the blue with its glow.
- **Team presence sorting** (AppContent's trainer reorder dialog): the title and lines in words, names wrapping, no flattened dark.

**Guards.** `type-voice.test.ts` section 9 reads those files' class lists (and the reorder dialog's slice of AppContent): no capitals, no tracking, nothing under 11px, no `font-black`, no `dark:shadow-none`, no field painting its own ground or a decorative edge, a solid red button restating its fill; section 10 holds Learning's switch. `buttons-depth.test.ts` holds their secondary buttons raised on `border-input` with the lift (or the outline variant). `session-sheets-type.test.ts` reads `rating.css`. Tests moved on purpose are in `docs/KNOWN-TRAPS.md` (type and depth). Each new guard was broken on purpose and failed.

**Left as it was:** the demo strip's Leave stays inside its 26px line (under 40px, by design and pinned); a few helper words keep Tailwind colours under 4.5:1 (the routine drawer's "Reason captured" / "Reason required" and its inactive Routine B); nothing was seen in a browser, so Round 56's walk gains a section for these.

## The sweep (Oct 5 2026)

The finish round's last job was adversarial: read every stylesheet and class list in `src` for anything a trainer would still see in the old voice (capitals or wide tracking on anything but the one eyebrow, text under 11px, weight 900, a slant outside the studio's name and Go, an outlined button without the raised recipe, a button under 40px, a dashed box inside a panel), judge each hit, and fix the real leftovers that were cheap and safe. It found about two hundred and fifty, almost all in rooms no mock and no walk had opened, because the phases had worked from the plan's named lists.

**What it judged allowed, and why:**

- **The eyebrow over a page title**, the one capitals style (12/700 at 0.08em): Operations' Today, its client page and Setup, Admins' Home, the codex's pages, the Deep Dive, Learning's home and its section kickers, My Studio's masthead, a Learning page, Pulse's client mode, the Wrap-up.
- **Go and the brand**: Start session's slanted capitals, the studio's name on the frame, the logo, and the front door (always dark, its own voice, the studio picker's Demo card included).
- **A sentence's first letter** (the Directory's sort, written in lower case so it reads inside a sentence elsewhere).
- **Initials and a count in their dots** (the Calendar's trainer dots and their badge, the bell's count): under 11px because the dot is.
- **The progress report** (printed and handed to the client) and the **always-dark** error screen and legacy importer: their own palette and voice, not this round.
- **Not mounted**: `ConsultationWizard.tsx` and `MuscleSelector.tsx`; a menu's keyboard shortcut (no menu draws one).
- **Quiet italic lines** (an empty place, a quoted note, a placeholder) were already on the round's allow-list.
- **Dashes that mean something**: a practice set, a box that opens work (+ Add, Link to a session note, the Ask doors), the years before Journey, a studio's own block on a catalog page, the removed safety lines, a draft, the Requests lane ("reads as conversation"), the unlinked Hub card, the session's No set? and Today +.

**What it fixed** (three commits):

- **The trainers' rooms** (`39f1cc48`): 196 stylesheet rules. A head over a list, a field or a section is the 14/700 label in ink-2; a tag, chip, meta line, table head or fact's name is 12px words at 700 (a stat label 12/600); a tab or segment 14/600, the picked one 700; a button 14/700; a name (a machine, a month) keeps its size and loses only the capitals and tracking; text in a fixed box (the year calendar's day letters and numbers, the Calendar's month cells and day blocks, the Deep Dive's heat map, the routine builder's notes and coverage) rises to the 11px floor. Words in the faint ink moved to the muted ink as they were touched. Rooms: the Activity Archive, the Calendar, Notes, Body & Pulse, Goals, FORD, InBody, the clinical flag picker, the Deep Dive's labels, Programming's Setup and the routine builder, the Client Directory, the Hub's Focus and Next 30 min, the phone's Now, My Studio's header, all of Relay, My Profile and the standing week, Pulse's cards and client mode, and all of Learning. The TSC toggle (28px), the flag chip's remove (32px), the flag search's clear (36px) and Pulse's chips and segments (30-38px) reach 40px; the machine list's clear reaches 40 through an ::after. Setup's empty line, the routine builder's empty hint and the shared machines' notes became wells. Discard it (the unfinished-session notice), the new-version line's Load, the never-blank screen's Back to the Hub and the Assign dialog's choices are raised. Relay's Post an initiative, Resolve, Assign and Note dialogs, the profile's progress-reports list, the renewal conversations, the machine story card, the InBody trend, the Routine B reason and studio settings' heads took the label voice.
- **The admin kit and First-time setup** (`fa2c1fb5`): 36 rules in Operations, Admins and My Studio's leader sections (field labels the 14/700 label; badges, table heads, tile and fact names 12px words). First-time setup, the consult's wizard in the session, was the old voice end to end and is retyped: the title upright in Saira, labels, raised choices with the picked one the solid blue, a sinking field, panels, a well for the starting weight, Start consult workout orange with navy words and Go's depth in the 14/700 voice. Rules no screen draws today took the same voice, so a screen that picks one up again does not bring capitals back.
- **The last flat buttons** (`78829bcb`): the briefing's Close, Pulse's Back and client mode's Back and Next, the Journal's Take back, the Requests lane's New ask and its actions, raised on the 3:1 edge with a press.

**Words.** Capitals had hidden a few lower-case words, now re-cased: the routine builder's tags (Gap, Goal, Pairs, Big 5, Order, Missing, None yet, Not at this studio, All already running, Adds), the initiative roll-up's You, a roster badge's raw "inactive", Small sample, Note, Vs today's rate, Add client, First-time setup, Skip setup, Manual profile, Start consult workout, Starting weight. Units after a number stay lower case (12 sessions, 3 booked, lb, reps), and so does the Journal's hunch unit (clients, sessions), which reads inside a sentence.

**Guards.** `type-voice.test.ts` section 11 holds all of `src`: capitals only on its list (each eyebrow checked at 12/700/0.08em), no text under 11px but initials and counts in their dots and the report, no tracking at 0.06em or wider but those capitals, and the class lists that may keep the old voice counted by file. `elevation.test.ts` scans every rule with `cursor: pointer` for a height under 40px whatever its name (the name scan had missed a 28px toggle, a 32px remove and Pulse's chips), each exception with its reason. `buttons-depth.test.ts` holds the seven newly raised buttons and reads the briefing's palette. Each new guard was broken on purpose eight ways and failed each time.

**Left, for AJ** (in "For AJ" above): about thirty chips and toggles that sit on the hairline by design (the same question as the Dial's idle segments), First-time setup's Setup info (it does nothing when tapped, and never did), and the session bar's flag marker, which draws a raw amber edge rather than a token (a colour call).

## AJ's three answers (Oct 5 2026): "1a 2a 3a"

After the sweep, three of the open calls were put to AJ, each with a recommendation, and he answered "1a 2a 3a". Each is its own commit, typechecked at 2, the whole suite run in Eastern time, the case check clean, and a guard for each, broken on purpose before the commit.

**1A: wells on the page ground sink into the tray** (`c3ce57d1`). The well tone is darker than a card but a hair lighter than the page, so a well straight on the page read as a raised pad. Those wells take the tray's tone (`--X-tray`: `#D1DAE4` in light, `#081725` in dark; 1.12:1 and 1.05:1 below the page) and keep their inner shadow. The three named (the Archive's figures, Programming's counts, Openings' time grid) and the clinical strip (in the sub-toggle's shell, which is painted the page), and the others found on a page, not in a panel: Trends' "Not enough data yet", every empty place in Notes, Learning's empty places, placeholders and quiet notes (the room paints `--wk-bg` and cards none of them), Setup's empty line and Relay's empty lists; and, by where they sit, the Story's empty line, a screen's own empty place in Operations and the Admins dashboard (No studio, Nothing in Limbo, a studio still to pick, the pipeline before its first night), the Deep Dive's empty range and sections, and My Studio → Team's empty lines. A shared well keeps the well tone in a card, a dialog or a sheet; segmented groups and fields keep their 3:1 edge (rule 2). Words: the muted ink reads 4.42:1 on the tray in light, so those words take ink-2 (5.95:1; 10.4:1 in dark). Coloured words would fall under 4.5:1 there too (plum 4.03, orange 4.15): a break still going on the Archive keeps its plum as a straight 4px band down the left (rule 3), the figure in ink; Programming's "not set up" is a plum chip on its own fill (4.8:1), its count a figure in ink. Openings' rotation cell lost its own fill (lighter than the page in dark) and differs from a booked time by its word, as the rest of the grid does. New aliases: `--psub-tray`, `--cx-tray`, `--cr-tray`; RenewalsPipeline's root gained the class `adm-pipeline`.

**2A: Build the Deep Dive stands upright** (`46595f24`). The slanted capitals stay on the front door's display lines (a brand moment) and on In progress (Go's other state); the Deep Dive's Build the Deep Dive speaks the 14/700 sentence-case button voice in Geist, upright, keeping Go's depth (the orange with navy words, the short glow, the top light and the press) and its 52px for the range under its words. So the display face's slanted capitals are exactly: the studio's name on the frame, Start session (the profile header, the peek's when it says so, the run sheet's, the Directory's Start, the briefing's), In progress, and the front door's display lines.

**3A: chips and toggles a trainer taps take the firm 3:1 edge** (`550d7f51`). Every control a trainer taps whose own boundary was the 1.3:1 hairline draws the firm edge buttons have (`--X-border-strong`; the codex's `--cx-line-2`; the app's `--input` on two check rows in dialogs), keeps its fill, and its picked state keeps its own look. Checked tappable first. 35 rules: Operations' day buttons, the Journey line's stops, the name chips, the huddle's items, Add a studio's check rows (and Today's old chip, not drawn today); the note composer's and note box's chips and a note's "from session" chip; the Dial's and Loudness's idle segments; the clinical flag picker's toggles; the Life section's switch; the phone's chips and mark; Setup's filter; the Calendar's and the Archive's segmented switches; Goals' SMART toggles; FORD's letters; Relay's Ask tiles, a board card's parts, the kit's switch rows and segments, the Journal's types, kinds, pin, hand-off row and views, the Requests lane's kinds and reactions (and the goals board's old tile); the Pulse's quick-log tiles, body sides, chips and switch; Learning's chips. Kept soft on purpose: informational chips (a span or a tag), a Pulse body region (the row its side buttons sit in; it lost a misleading pointer), and pointer targets that are not chips or toggles (the briefing's routine line, a booking on the Calendar's day, Setup's Revert, the front door). Where a band sat on a chip's edge (the Journey line's stops, the flag toggles), the band's colour is that edge, so the firm edge draws no grey line across it. The touched chips' fill-changing hovers moved inside `@media (hover: hover)`. Measured on the control's own fill (light / dark): 3.42 / 3.79 on a card's fill, 3.08 / 4.13 on the well tone, 3.42 / 3.12 on a dialog; the SMART toggle against the card it stands on, 3.42 / 3.79 (its fill is the page tone set into the card, 2.94:1 inside it). The hairline was 1.30 / 1.35.

**Guards.** `wells-and-rows.test.ts` section 8; `type-voice.test.ts`'s "AJ's 2A" block, and `.cr-generate` off its slant allow-list; `buttons-depth.test.ts` (`.cr-generate` moved from Go's list to "every other orange button", and the Journal's views on the firm edge); new, `firm-chips.test.ts`. Tests moved on purpose are in `docs/KNOWN-TRAPS.md` (type and depth).

**Left as it was, seen on the way:** the Wrap-up's next-weight field (`NextWeightCard.tsx`) draws the hairline and `bg-bg-dark-3` (a field, not a chip: rule 2 says its edge is 3:1), and Setup's Revert and the briefing's routine line are pointer targets on the hairline that are not chips. Each is a one-line change if AJ wants it.
