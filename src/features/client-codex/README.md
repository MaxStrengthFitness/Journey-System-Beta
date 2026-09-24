# The client codex — Notes & Profile as seven pages

Client codex round, Sep 2026 (`docs/rounds/2026-09-24-client-codex.md`). The profile's Notes & Profile tab stops being one long scroll and becomes an Overview and six pages — **Overview · Notes · FORD · Body & Pulse · Goals & Focus · Story · Account** — switched by the profile's own sub-toggle. Where the trainer is lives in the profile's one navigation reducer (`src/features/client-profile/profile-nav.ts`: `RecordPage`, `RECORD_ANCHORS`, `neighbours()`).

This folder is built phase by phase on the `client-codex` branch. So far it holds **the kit**; the shell (`ClientCodex`, the one Save bar's form, the one load per tab) and the pages follow, and each adds its section here.

**Notes are Notes'.** What any page says about a client's notes — how to coach her, injury threads, her notes on each machine, older life notes by pillar, the FORD door's count, the Notes segment's line — comes from `src/features/client-notes/record-selectors.ts`, over the tab's one journal load, and the red line under the bar is Notes' `CriticalLine`. The kit builds no second critical strip and no page writes its own note selection.

## The kit (`kit/`)

One look for every page, so a trainer learns it once. An area's own stylesheet may lay out its own content; it may not draw a second panel, button, chip or eyebrow.

| Piece | What it is for |
| --- | --- |
| `Page` | A whole page: `PageHead` (the 30px title, the lede, the page's own actions, the ‹ › neighbour buttons) + the content + `NextCard` ("Next: Body & Pulse", or "Done" from Account back to the Overview). The Overview is not a `Page`: no head, no neighbours, no Next card. |
| `Card`, `CardHead` | THE panel. `id` takes an anchor from `RECORD_ANCHORS` and adds `data-cx-anchor`. `host` is the frame for a component that already draws its own cards (spacing only, so borders never double). |
| `Slot` | An Overview tile. Either the whole tile is one door (`as="button"`, 120px or taller, holding no other control) or it is a section whose rows are doors. |
| `FactList`, `Fact` | Label and value; one column when the panel is narrower than 480px. |
| `Rows`, `Row` | A list of lines that open something: a label column, the text, meta — stacked when the list is narrow. 44px or taller. |
| `Chip`, `ChipButton`, `LoudChip` | A label that wraps (26px, not tappable); a tappable chip (40px); a note's loudness in the words and colours of the one Loudness control (`LOUDNESS_TONE`: Note quiet, Heads up plum, Critical crimson). |
| `Eyebrow`, `Meta`, `Lede`, `Quote`, `Source`, `SectionHead`, `BigNumber`, `EmptyLine` | The words, at 11, 12, 17, 14, 12, 17, 30 and 14px. `Quote` takes a string and puts it in curly quotes verbatim — for anything the page quotes rather than says (a watch-out, a Pulse statement). `EmptyLine` is for "nothing on file", never for "couldn't load". |
| `Btn` | The one button: default, `solid` (brand blue — never hero orange, which is Start Session's), `live`, `quiet`. 40px or taller; the words wrap rather than clip. |
| `FordMark` | FORD's letter in its pillar's tint — identity only, never a status. |
| `ReadEdit`, `useReadEdit`, `EditButton` | Read view first, Edit on demand. The editor writes to the shell's record form; "Done" only closes it, the edits wait for the Save bar, and the card says "Unsaved" meanwhile. Every editor closes when the form's `revision` changes (a save or a discard). A reader who may not edit gets no Edit button. |
| `TextInput`, `TextArea`, `SelectInput`, `Picks`, `MultiPicks`, `Pick` | The inputs: 14px, a 12px label, 40px or taller. A stored value the options no longer offer is shown and kept, never silently replaced. The `<label>` holds only the label's words (the control's name); the hint is its description (`aria-describedby`), so VoiceOver reads each once. |
| `SaveBar` | The one Save bar: "1 unsaved change · FORD · Occupation", with Show, Discard and Save changes. Sticky to the bottom of the profile's scroller (`useScrollerPad`), opaque, and no bar is drawn while nothing is unsaved. `saveBarSentence` (`save-bar.ts`) is its words. The announcement is a visually hidden live region beside the bar that is always mounted — a live region that arrives already holding its words is usually not read — so **mount the SaveBar once and pass the count**; don't render it conditionally. |

**Copy helpers** (`kit/text.ts`): `curly`, `cap`, `plural`, `joinDots`, `monthDay`, `monthDayYear`, `dayKeyDate` (a day key at local noon), `inTime`, `monthLabel`, and `firstSentences`, which lives in `src/lib/first-sentences.ts` so Notes can use it without importing from here.

- `inTime(days)` counts days up to 30 ("in 17 days" — FORD's "soon" window), then weeks up to 83 ("in 5 weeks"), then months, then years. **FORD's Coming up uses it with `cap()`** ("In 17 days") rather than a `fromNowLabel` of its own, so the sub-toggle, the Overview and the FORD page say a date one way.
- `firstSentences(text, n)` returns whole sentences until the line holds `n` characters — a note is never cut mid-sentence and never gets an "…" it did not have. The word after a full stop, `?` or `!` decides whether it ended a sentence: a lower-case word or a number means it did not ("7 a.m. only", "her P.T. last week", "Fig. 2", `"does it pinch?" before`), unless the number is a list marker ("Seat at 6. 2. Pad high"). Only before a capital does it need its short abbreviation list ("Dr. Patel"), so an abbreviation it does not know makes the line longer, not a cut instruction. A line break always ends a sentence.

None of these uses a regex lookbehind: older iPadOS Safari fails the whole module when it parses one, and the tests read the files to keep it that way.

**Pronouns** (`kit/pronouns.ts`): the header prints the client's name once; page copy says "she", "he" or "they" through `pronounsOf(client)`, from the gender Mindbody holds (read by machine fit's `parseGender`). Female is she/her, Male is he/his, anything else — no gender, "Other", "None" — is they/their, and `known` is false so a screen can tell a fallback from a fact. Pass both verb forms to `agree(p, "says", "say")`. This is the overnight default for AJ's open question (Sep 24 2026), reversible in that one file.

## The contract, and the test that holds it

`codex.tokens.css` declares the `--cx-*` tokens, and **every colour is an alias of an existing `--eq-*` or `--ford-*` token** — no new palette, light and dark for free. They are declared on `.cx` (the codex's root), not `:root`, so they resolve inside any theme wrapper around it; a kit piece rendered outside that root (a dialog's portal content) needs the `.cx-kit` class to find them.

`kit/scale.test.ts` reads every codex file and fails on:

1. **A text size off the scale** — 11, 12, 14, 17 or 30px (or `var(--cx-fs-*)`, or `inherit`), in CSS (`font-size` and the `font` shorthand) and in components (`fontSize`, a `font:` in a style object, Tailwind `text-sm` / `text-[13px]`).
2. **A raw hex colour** anywhere, the tokens file included — and, in a component, any colour of its own: `rgb()` / `hsl()`, a named or raw value in a style or an SVG `fill` / `stroke` (only `var(--cx-*)`, `currentColor`, `inherit`, `transparent` and `none` pass), or a Tailwind colour utility (`text-red-500`, `bg-white`). A component prop that is not a colour is called `tone`, never `color`.
3. **Clipped text** — `text-overflow: ellipsis`; a one-line cut-off, whether `nowrap` and `overflow: hidden` share a rule, are split across two rules for the same selector, or come as Tailwind classes (`whitespace-nowrap` with `overflow-hidden`) or a style object; Tailwind `truncate`. The one exception: a note or beat BODY in a list row may clamp to exactly two lines, because the whole note is one tap away, and only in the exactly named body selectors (`LINE_CLAMP_BODIES`: `.nx-row__body`, `.gf-row__text` — the Notes and Goals phases confirm the names when they build their rows). A row's name, machine name, label or meta can never be clamped.
4. **A regex lookbehind** in code that ships to an iPad.
5. **A raw invisible or control character** (a no-break space, a zero-width space, a byte-order mark) in any codex source or test file — write the escape.

`CODEX_FILES` is an explicit list, and a file in this folder that is not on it fails the suite, so the folder cannot grow a file the scan never reads. Every page area's phase adds its files (including its files in other folders) — Notes' critical line is the first: `client-notes/CriticalLine.tsx`, `critical-line.css` and `record-selectors.ts` are on the list, because the shell mounts that line under the bar on five pages. `HOSTED_FILES` and `HOSTED_OFF_SCALE_BUDGET` are for components the codex mounts but does not own; they start empty. It also checks the tokens: exactly the five sizes, every colour an alias of a declared app token, touch targets at 40px or more, and `kit.css` drawing only from `--cx-*`.

`kit/kit.render.test.tsx` mounts every primitive in light and dark, and asserts that every control the kit renders matches a `kit.css` rule that makes it at least 40px tall.

To prove the scale test bites: add `.x { font-size: 13px; }` to `kit.css`, run `TZ=America/New_York npx vitest run --dir src client-codex/kit/scale`, watch it fail, and take the line out.
