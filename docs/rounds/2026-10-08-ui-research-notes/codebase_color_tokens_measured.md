# Journey's colour tokens, measured with colour science (light and dark)

Scope and method. Read-only research on the checked-out branch `claude/ui-color-design-analysis-ep436c` at commit `e8c5cb2` (Oct 7 2026, 21:32 EDT, "Docs: 34 feature READMEs brought up to Oct 7"), i.e. master as of Oct 7 2026. Every custom property in [src/index.css](../../src/index.css) and the 14 `*.tokens.css` files under `src/features/` was parsed: `:root` = light; `.dark` / `[data-theme="dark"]` = dark; the `@media (prefers-color-scheme: dark)` blocks = system fallback. Dark values are `:root` overlaid with `.dark`, because `.dark` sits on `<html>` with `:root` (the convention [src/core-tokens.test.ts L51-55](../../src/core-tokens.test.ts#L51) uses). `var()` chains were resolved per mode; `rgba()` and `color-mix(... transparent)` were composited in sRGB over the surface they are drawn on (named in each row as `A + B`). That gives 699 colour-valued custom properties.

The maths was written by hand in plain Node and checked against reference values before use:
- **WCAG 2.2** relative luminance and contrast ratio ([W3C WCAG 2.2, relative luminance](https://www.w3.org/TR/WCAG22/#dfn-relative-luminance)). Check: #767676 on white gives 4.54.
- **APCA-W3 0.0.98G-4g** Lc, with constants confirmed on [github.com/Myndex/apca-w3](https://github.com/Myndex/apca-w3): mainTRC 2.4, normBG 0.56, normTXT 0.57, revTXT 0.62, revBG 0.65, blkThrs 0.022, blkClmp 1.414, scale 1.14, offsets 0.027, loClip 0.1, deltaYmin 0.0005. Checks: #888 on #fff 63.06; #fff on #888 −68.54; #000 on #aaa 58.15; #aaa on #000 −56.24; #112233 on #ddeeff 91.67.
- **OKLab / OKLCH** ([Ottosson 2020](https://bottosson.github.io/posts/oklab/)). Check: #ff0000 gives L 0.628, C 0.258, h 29.2.
- **CIELAB (D65) and CIEDE2000** (Sharma, Wu & Dalal 2005). Checks: test pairs 1, 7 and 17 give 2.0425, 2.3669 and 27.1492.
- **Colour-vision deficiency (CVD) simulation**:
  - Machado, Oliveira & Fernandes 2009 matrices at severity 1.0, applied to linear sRGB, for protan, deutan and tritan.
  - The Brettel 1997 / Viénot 1999 matrices as tabulated by libDaltonLens, copied from the repo's own [equipment-tokens.test.ts L228-243](../../src/features/equipment/equipment-tokens.test.ts#L228), for deutan and tritan.
  - Where both models exist, the smaller ΔE is reported. This is the repo's own rule (`underCvd`, [L254-257](../../src/features/equipment/equipment-tokens.test.ts#L254)).

APCA levels are applied as AJ's brief set them: Lc 60 for body text, Lc 45 for large text, Lc 30 for non-text. APCA's own guidance is the reference: Lc 90 is "preferred level for fluent text and columns of body text"; Lc 75 is "the minimum level for columns of body text"; Lc 60 is the minimum "for content text that is not body, column, or block text"; Lc 45 is for "larger, heavier text"; Lc 30 is "the absolute minimum for any text not listed above"; Lc 15 is for "non-semantic non-text" such as dividers ([APCA in a Nutshell](https://github.com/Myndex/SAPC-APCA/blob/master/documentation/APCA_in_a_Nutshell.md)).

The scripts are in the session scratchpad (`colour.mjs`, `parse.mjs`, `pairs.mjs`, `cvd.mjs` and the rest); nothing in the repository was modified. Line numbers below are 1-based lines of the files as checked out.

## 1. What colour tokens exist, and what is each one's job?

### Takeaway
The app's colour tokens fall into eight groups:
1. **One core sheet**, [src/index.css](../../src/index.css): 143 custom properties in `:root` and 102 in `.dark`. It holds:
   - the shadcn semantic set;
   - the "Journey ladder" (`--bg-dark*`, `--ink-d*`) and an unused inverse ladder (`--bg-l*`, `--ink-l*`);
   - four legacy status pigments;
   - the frame `--chrome-*`, set once in `:root` and never in `.dark`;
   - the 11-rung `--n-*` ramp that `slate-*` is remapped to;
   - the depth tokens;
   - 21 Mindbody state tokens.
2. **One Hub palette**, [equipment.tokens.css](../../src/features/equipment/equipment.tokens.css), `--eq-*`: 58 light and 55 dark declarations.
3. **Exact copies** of the Hub palette: `--adm` (42 of 42 colour tokens equal) and `--cat` (17 of 17).
4. **Copies with their own pigments**: `--st`, `--tp`, `--rb`, `--br`, `--sr`, `--ford`, `--cal`, `--wk`.
5. **Aliases**: `--cx` (the codex).
6. **The Active Session's palette**, `--jg-*`. It shares the Hub's neutrals and accents and adds the rep-quality fills, AJ's profile colours and 7 raw `--brand-*` pigments.
7. **A fixed-identity print palette**, `--pr-*`.
8. **The palette as a whole**: across all files, light mode resolves to 184 unique colour values and dark to 196. Of these, 95 light and 129 dark opaque values are chromatic (OKLCH C > 0.03).

### Cited Findings

#### 1a. index.css, every colour token in light and dark, with OKLCH (L / C / h°), the hue shift between modes and the job
Values from [src/index.css `:root` L312-629](../../src/index.css#L312) and [`.dark` L649-800](../../src/index.css#L649); the "Job" column paraphrases the inline comments there. A blank Δh means one side has too little chroma (C ≤ 0.02) for a hue to mean anything.

| Token | Light | Light OKLCH L / C / h | Dark | Dark OKLCH L / C / h | Δh° | Job | index.css line (light / dark) |
|---|---|---|---|---|---|---|---|
| `--background` | #DEE6EE | 0.921 / 0.014 / 248.0 | #0A1C2C | 0.220 / 0.040 / 247.5 |  | page ground (bg-background; <main>, Hub, profile) | :313 / :650 |
| `--foreground` | #192D41 | 0.290 / 0.045 / 249.6 | #DFE7EF | 0.924 / 0.014 / 248.0 |  | body ink | :314 / :651 |
| `--card` | #F3F6F9 | 0.972 / 0.005 / 247.9 | #14293D | 0.274 / 0.046 / 248.8 |  | card / panel (bg-card) | :315 / :652 |
| `--card-foreground` | #192D41 | 0.290 / 0.045 / 249.6 | #DFE7EF | 0.924 / 0.014 / 248.0 |  | words on a card | :316 / :653 |
| `--popover` | #F3F6F9 | 0.972 / 0.005 / 247.9 | #22374B | 0.329 / 0.045 / 248.2 |  | menu / dialog / sheet surface | :317 / :654 |
| `--elevated` | #F3F6F9 | 0.972 / 0.005 / 247.9 | #22374B | 0.329 / 0.045 / 248.2 |  | elevated surface (= popover) | :318 / :655 |
| `--popover-foreground` | #192D41 | 0.290 / 0.045 / 249.6 | #DFE7EF | 0.924 / 0.014 / 248.0 |  | words on a popover | :319 / :656 |
| `--primary` | #0A548B | 0.435 / 0.112 / 248.0 | #65ABE9 | 0.720 / 0.115 / 246.9 | 1.1 | logo blue: every Save, selection, link (bg-primary) | :320 / :657 |
| `--primary-foreground` | #FFFFFF | 1.000 / 0.000 / — | #071727 | 0.200 / 0.039 / 250.0 |  | words on the blue | :321 / :658 |
| `--brand` | #0A548B | 0.435 / 0.112 / 248.0 | #65ABE9 | 0.720 / 0.115 / 246.9 | 1.1 | = primary | :322 / :659 |
| `--brand-foreground` | #FFFFFF | 1.000 / 0.000 / — | #071727 | 0.200 / 0.039 / 250.0 |  | = primary-foreground | :323 / :660 |
| `--brand-tile-m` | #0A548B | 0.435 / 0.112 / 248.0 | #0A548B | 0.435 / 0.112 / 248.0 | 0.0 | logo square (blue), fixed | :328 / (inherits :root) |
| `--brand-tile-a` | #F36D21 | 0.688 / 0.184 / 45.0 | #F36D21 | 0.688 / 0.184 / 45.0 | 0.0 | logo square (orange), fixed | :329 / (inherits :root) |
| `--brand-tile-x` | #5B6770 | 0.507 / 0.021 / 240.3 | #5B6770 | 0.507 / 0.021 / 240.3 | 0.0 | logo square (slate), fixed | :330 / (inherits :root) |
| `--brand-tile-ink` | #FFFFFF | 1.000 / 0.000 / — | #FFFFFF | 1.000 / 0.000 / — |  | logo strokes, fixed | :331 / (inherits :root) |
| `--action` | #F36D21 | 0.688 / 0.184 / 45.0 | #F36D21 | 0.688 / 0.184 / 45.0 | 0.0 | logo orange fill (the slider) | :332 / :661 |
| `--action-foreground` | #071727 | 0.200 / 0.039 / 250.0 | #071727 | 0.200 / 0.039 / 250.0 | 0.0 | navy words on the orange | :333 / :662 |
| `--secondary` | #546271 | 0.490 / 0.030 / 250.2 | #52657A | 0.499 / 0.041 / 251.2 | 1.0 | secondary fill | :334 / :663 |
| `--secondary-foreground` | #FFFFFF | 1.000 / 0.000 / — | #FFFFFF | 1.000 / 0.000 / — |  | words on secondary | :335 / :664 |
| `--muted` | #E4EBF3 | 0.937 / 0.013 / 251.6 | #203549 | 0.321 / 0.045 / 248.2 |  | muted fill | :336 / :665 |
| `--muted-foreground` | #546271 | 0.490 / 0.030 / 250.2 | #9DADBE | 0.741 / 0.030 / 249.9 | 0.4 | quiet words (the one quiet grey for text) | :337 / :666 |
| `--accent` | #E4EBF3 | 0.937 / 0.013 / 251.6 | #203549 | 0.321 / 0.045 / 248.2 |  | hover / accent fill | :338 / :667 |
| `--accent-foreground` | #0A548B | 0.435 / 0.112 / 248.0 | #98CAF9 | 0.821 / 0.085 / 247.3 | 0.7 | blue words on accent | :339 / :668 |
| `--destructive` | #BB271B | 0.517 / 0.186 / 29.6 | #FF8C8C | 0.765 / 0.140 / 20.8 | 8.8 | red WORD colour: Sign out, errors, invalid borders | :344 / :672 |
| `--destructive-foreground` | #FFFFFF | 1.000 / 0.000 / — | #071727 | 0.200 / 0.039 / 250.0 |  | words on solid destructive (no reader in dark) | :345 / :673 |
| `--border` | #D1DAE4 | 0.884 / 0.017 / 250.9 | #2B3E50 | 0.356 / 0.040 / 247.7 |  | separators, decorative | :346 / :674 |
| `--input` | #748190 | 0.598 / 0.028 / 252.0 | #6E8397 | 0.600 / 0.039 / 247.2 | 4.8 | control boundary 3:1 (also painted as a fill by shadcn) | :347 / :675 |
| `--ring` | #0A548B | 0.435 / 0.112 / 248.0 | #65ABE9 | 0.720 / 0.115 / 246.9 | 1.1 | focus ring | :348 / :676 |
| `--chart-1` | #0A548B | 0.435 / 0.112 / 248.0 | #65ABE9 | 0.720 / 0.115 / 246.9 | 1.1 | chart series 1 | :349 / :677 |
| `--chart-2` | #F36D21 | 0.688 / 0.184 / 45.0 | #F36D21 | 0.688 / 0.184 / 45.0 | 0.0 | chart series 2 | :350 / :678 |
| `--chart-3` | #68717A | 0.544 / 0.018 / 248.2 | #68717A | 0.544 / 0.018 / 248.2 |  | chart series 3 | :351 / :679 |
| `--chart-4` | #0EA5E9 | 0.685 / 0.148 / 237.3 | #0EA5E9 | 0.685 / 0.148 / 237.3 | 0.0 | chart series 4 (Tailwind sky-500) | :352 / :680 |
| `--chart-5` | #F59E0B | 0.769 / 0.165 / 70.1 | #F59E0B | 0.769 / 0.165 / 70.1 | 0.0 | chart series 5 (Tailwind amber-500) | :353 / :681 |
| `--sidebar` | #FFFFFF | 1.000 / 0.000 / — | #0F172A | 0.208 / 0.040 / 265.8 |  | shadcn sidebar (legacy values) | :355 / :682 |
| `--sidebar-foreground` | #0F172A | 0.208 / 0.040 / 265.8 | #F8FAFC | 0.984 / 0.003 / — |  |  | :356 / :683 |
| `--sidebar-primary` | #115E8D | 0.462 / 0.103 / 242.4 | #38BDF8 | 0.754 / 0.139 / 232.7 | 9.7 |  | :357 / :684 |
| `--sidebar-primary-foreground` | #FFFFFF | 1.000 / 0.000 / — | #0F172A | 0.208 / 0.040 / 265.8 |  |  | :358 / :685 |
| `--sidebar-accent` | #F1F5F9 | 0.968 / 0.007 / 247.9 | #334155 | 0.372 / 0.039 / 257.3 |  |  | :359 / :686 |
| `--sidebar-accent-foreground` | #115E8D | 0.462 / 0.103 / 242.4 | #38BDF8 | 0.754 / 0.139 / 232.7 | 9.7 |  | :360 / :687 |
| `--sidebar-border` | #E2E8F0 | 0.929 / 0.013 / 255.5 | #334155 | 0.372 / 0.039 / 257.3 |  |  | :361 / :688 |
| `--sidebar-ring` | #115E8D | 0.462 / 0.103 / 242.4 | #38BDF8 | 0.754 / 0.139 / 232.7 | 9.7 |  | :362 / :689 |
| `--raised` | #F8FAFC | 0.984 / 0.003 / — | #203549 | 0.321 / 0.045 / 248.2 |  | raised control fill (lighter than card, never white) | :451 / :716 |
| `--well` | #E4EBF3 | 0.937 / 0.013 / 251.6 | #0D2235 | 0.245 / 0.045 / 248.0 |  | well inside a panel (below the card) | :452 / :717 |
| `--tray` | #D1DAE4 | 0.884 / 0.017 / 250.9 | #081725 | 0.199 / 0.035 / 248.3 |  | tab tray / well on the page ground (below the page) | :453 / :718 |
| `--edge` | #192D41 α0.13 | 0.290 / 0.045 / 249.6 | #96B4D2 α0.11 | 0.758 / 0.054 / 248.5 | 1.1 | panel edge seen from outside (rgba) | :454 / :719 |
| `--edge-control` | #192D41 α0.26 | 0.290 / 0.045 / 249.6 | #96B4D2 α0.16 | 0.758 / 0.054 / 248.5 | 1.1 | picked tab ring inside a tray (rgba) | :455 / :720 |
| `--divider` | #192D41 α0.1 | 0.290 / 0.045 / 249.6 | #96B4D2 α0.1 | 0.758 / 0.054 / 248.5 | 1.1 | row hairline inside a panel (rgba) | :456 / :721 |
| `--highlight` | #FFFFFF α0.7 | 1.000 / 0.000 / — | #FFFFFF α0.07 | 1.000 / 0.000 / — |  | raised control top light (rgba) | :457 / :722 |
| `--scrim` | #001224 α0.36 | 0.177 / 0.046 / 246.9 | #00060E α0.6 | 0.117 / 0.027 / 241.0 | 5.9 | veil under a dialog (rgba) | :458 / :723 |
| `--popover-raised` | #F8FAFC | 0.984 / 0.003 / — | #283E54 | 0.356 / 0.047 / 249.3 |  | raised control on a popover | :461 / :728 |
| `--popover-input` | #748190 | 0.598 / 0.028 / 252.0 | #7D92A6 | 0.650 / 0.038 / 247.1 | 4.9 | its 3:1 edge | :462 / :729 |
| `--bg-dark` | #DEE6EE | 0.921 / 0.014 / 248.0 | #0A1C2C | 0.220 / 0.040 / 247.5 |  | ladder: page | :518 / :741 |
| `--bg-dark-2` | #F3F6F9 | 0.972 / 0.005 / 247.9 | #14293D | 0.274 / 0.046 / 248.8 |  | ladder: card | :519 / :742 |
| `--bg-dark-3` | #ECF1F5 | 0.956 / 0.008 / 241.7 | #203549 | 0.321 / 0.045 / 248.2 |  | ladder: raised/inset (goes LIGHTER in dark) | :520 / :743 |
| `--ink-d1` | #192D41 | 0.290 / 0.045 / 249.6 | #DFE7EF | 0.924 / 0.014 / 248.0 |  | ladder ink | :521 / :744 |
| `--ink-d2` | #3F4F60 | 0.421 / 0.035 / 250.2 | #B8C6D3 | 0.820 / 0.024 / 246.1 | 4.1 | ladder secondary copy | :522 / :745 |
| `--ink-d3` | #546271 | 0.490 / 0.030 / 250.2 | #9DADBE | 0.741 / 0.030 / 249.9 | 0.4 | ladder labels/meta | :523 / :746 |
| `--div-d` | #D1DAE4 | 0.884 / 0.017 / 250.9 | #2B3E50 | 0.356 / 0.040 / 247.7 |  | ladder divider | :524 / :747 |
| `--surface-1` | #F3F6F9 | 0.972 / 0.005 / 247.9 | #14293D | 0.274 / 0.046 / 248.8 |  | surface 1 | :526 / :749 |
| `--surface-2` | #ECF1F5 | 0.956 / 0.008 / 241.7 | #203549 | 0.321 / 0.045 / 248.2 |  | surface 2 | :527 / :750 |
| `--bg-l` | #0F172A | 0.208 / 0.040 / 265.8 | #F5F7FA | 0.975 / 0.005 / — |  | inverse ladder (no reader) | :529 / :752 |
| `--bg-l-card` | #1E293B | 0.279 / 0.037 / 260.0 | #FFFFFF | 1.000 / 0.000 / — |  | inverse ladder (no reader) | :530 / :753 |
| `--ink-l1` | #F8FAFC | 0.984 / 0.003 / — | #0D1A2B | 0.215 / 0.038 / 255.6 |  | inverse ladder | :531 / :754 |
| `--ink-l2` | #CBD5E1 | 0.869 / 0.020 / 252.9 | #344155 | 0.372 / 0.039 / 258.9 |  | inverse ladder | :532 / :755 |
| `--ink-l3` | #546271 | 0.490 / 0.030 / 250.2 | #9DADBE | 0.741 / 0.030 / 249.9 | 0.4 | inverse ladder (no reader) | :533 / :756 |
| `--ink-l4` | #64748B | 0.554 / 0.041 / 257.4 | #64748B | 0.554 / 0.041 / 257.4 | 0.0 | inverse ladder | :534 / :757 |
| `--div-l` | #D1DAE4 | 0.884 / 0.017 / 250.9 | #2B3E50 | 0.356 / 0.040 / 247.7 |  | hairlines (routine drawer, note box) | :535 / :758 |
| `--cta` | #F36D21 | 0.688 / 0.184 / 45.0 | #F36D21 | 0.688 / 0.184 / 45.0 | 0.0 | logo orange FILL | :543 / :761 |
| `--cta-foreground` | #071727 | 0.200 / 0.039 / 250.0 | #071727 | 0.200 / 0.039 / 250.0 | 0.0 | navy words on orange | :544 / :762 |
| `--cta-strong` | #B04000 | 0.522 / 0.158 / 41.8 | #B04000 | 0.522 / 0.158 / 41.8 | 0.0 | deep orange that carries white (no reader) | :545 / :763 |
| `--cyan` | #0A548B | 0.435 / 0.112 / 248.0 | #65ABE9 | 0.720 / 0.115 / 246.9 | 1.1 | = --primary (legacy name) | :550 / :764 |
| `--yellow` | #FCD661 | 0.887 / 0.141 / 91.3 | #FCD661 | 0.887 / 0.141 / 91.3 | 0.0 | legacy status pigment (mb reschedule) | :551 / (inherits :root) |
| `--green` | #4FDB8E | 0.797 / 0.164 / 155.5 | #4FDB8E | 0.797 / 0.164 / 155.5 | 0.0 | legacy status pigment (mb completed/fresh/granted) | :552 / (inherits :root) |
| `--red` | #E84F4F | 0.638 / 0.189 / 24.2 | #E84F4F | 0.638 / 0.189 / 24.2 | 0.0 | legacy status pigment (mb no-show/error/denied) | :553 / (inherits :root) |
| `--amber` | #F5A623 | 0.784 / 0.159 / 73.0 | #F5A623 | 0.784 / 0.159 / 73.0 | 0.0 | legacy status pigment (mb late-cancel/stale/foreign) | :554 / (inherits :root) |
| `--chrome` | #002341 | 0.251 / 0.069 / 248.9 | #002341 | 0.251 / 0.069 / 248.9 | 0.0 | THE FRAME: header, bottom bar, status bar (both modes) | :595 / (inherits :root) |
| `--chrome-ink` | #F2F5F8 | 0.969 / 0.005 / 247.9 | #F2F5F8 | 0.969 / 0.005 / 247.9 |  | studio name on frame | :596 / (inherits :root) |
| `--chrome-ink-2` | #ADC0D4 | 0.800 / 0.035 / 249.6 | #ADC0D4 | 0.800 / 0.035 / 249.6 | 0.0 | header icons, idle tabs, search text | :597 / (inherits :root) |
| `--chrome-field` | #FFFFFF α0.08 | 1.000 / 0.000 / — | #FFFFFF α0.08 | 1.000 / 0.000 / — |  | search well (rgba white) | :598 / (inherits :root) |
| `--chrome-line` | #FFFFFF α0.1 | 1.000 / 0.000 / — | #FFFFFF α0.1 | 1.000 / 0.000 / — |  | frame hairlines (rgba white) | :599 / (inherits :root) |
| `--chrome-here` | #65ABE9 | 0.720 / 0.115 / 246.9 | #65ABE9 | 0.720 / 0.115 / 246.9 | 0.0 | tab you are on (solid box), avatar | :600 / (inherits :root) |
| `--chrome-go` | #F36D21 | 0.688 / 0.184 / 45.0 | #F36D21 | 0.688 / 0.184 / 45.0 | 0.0 | running session / Operations / Admins tab | :601 / (inherits :root) |
| `--chrome-go-fill` | #3D2112 | 0.281 / 0.050 / 48.0 | #3D2112 | 0.281 / 0.050 / 48.0 | 0.0 | running tab box when not current (opaque warm) | :602 / (inherits :root) |
| `--mb-state-scheduled` | #94A3B8 | 0.711 / 0.035 / 256.8 | #94A3B8 | 0.711 / 0.035 / 256.8 | 0.0 | Mindbody state | :605 / (inherits :root) |
| `--mb-state-arrived` | #0A548B | 0.435 / 0.112 / 248.0 | #65ABE9 | 0.720 / 0.115 / 246.9 | 1.1 |  | :606 / (inherits :root) |
| `--mb-state-active` | #F36D21 | 0.688 / 0.184 / 45.0 | #F36D21 | 0.688 / 0.184 / 45.0 | 0.0 |  | :607 / (inherits :root) |
| `--mb-state-completed` | #4FDB8E | 0.797 / 0.164 / 155.5 | #4FDB8E | 0.797 / 0.164 / 155.5 | 0.0 |  | :608 / (inherits :root) |
| `--mb-state-early-cancel` | #546271 | 0.490 / 0.030 / 250.2 | #9DADBE | 0.741 / 0.030 / 249.9 | 0.4 |  | :609 / :798 |
| `--mb-state-late-cancel` | #F5A623 | 0.784 / 0.159 / 73.0 | #F5A623 | 0.784 / 0.159 / 73.0 | 0.0 |  | :610 / (inherits :root) |
| `--mb-state-no-show` | #E84F4F | 0.638 / 0.189 / 24.2 | #E84F4F | 0.638 / 0.189 / 24.2 | 0.0 |  | :611 / (inherits :root) |
| `--mb-state-reschedule` | #FCD661 | 0.887 / 0.141 / 91.3 | #FCD661 | 0.887 / 0.141 / 91.3 | 0.0 |  | :612 / (inherits :root) |
| `--mb-sync-fresh` | #4FDB8E | 0.797 / 0.164 / 155.5 | #4FDB8E | 0.797 / 0.164 / 155.5 | 0.0 |  | :614 / (inherits :root) |
| `--mb-sync-syncing` | #0A548B | 0.435 / 0.112 / 248.0 | #65ABE9 | 0.720 / 0.115 / 246.9 | 1.1 |  | :615 / (inherits :root) |
| `--mb-sync-stale` | #F5A623 | 0.784 / 0.159 / 73.0 | #F5A623 | 0.784 / 0.159 / 73.0 | 0.0 |  | :616 / (inherits :root) |
| `--mb-sync-error` | #E84F4F | 0.638 / 0.189 / 24.2 | #E84F4F | 0.638 / 0.189 / 24.2 | 0.0 |  | :617 / (inherits :root) |
| `--mb-sync-offline` | #546271 | 0.490 / 0.030 / 250.2 | #52657A | 0.499 / 0.041 / 251.2 | 1.0 |  | :618 / (inherits :root) |
| `--mb-access-home` | #000000 α0 | 0.000 / 0.000 / — | #000000 α0 | 0.000 / 0.000 / — |  |  | :620 / (inherits :root) |
| `--mb-access-foreign` | #F5A623 | 0.784 / 0.159 / 73.0 | #FCD661 | 0.887 / 0.141 / 91.3 | 18.3 |  | :621 / :799 |
| `--mb-access-pending` | #0A548B | 0.435 / 0.112 / 248.0 | #65ABE9 | 0.720 / 0.115 / 246.9 | 1.1 |  | :622 / (inherits :root) |
| `--mb-access-granted` | #4FDB8E | 0.797 / 0.164 / 155.5 | #4FDB8E | 0.797 / 0.164 / 155.5 | 0.0 |  | :623 / (inherits :root) |
| `--mb-access-denied` | #E84F4F | 0.638 / 0.189 / 24.2 | #E84F4F | 0.638 / 0.189 / 24.2 | 0.0 |  | :624 / (inherits :root) |
| `--mb-origin-mindbody` | #0A548B | 0.435 / 0.112 / 248.0 | #65ABE9 | 0.720 / 0.115 / 246.9 | 1.1 |  | :626 / (inherits :root) |
| `--mb-origin-journey` | #F36D21 | 0.688 / 0.184 / 45.0 | #F36D21 | 0.688 / 0.184 / 45.0 | 0.0 |  | :627 / (inherits :root) |
| `--mb-origin-system` | #68717A | 0.544 / 0.018 / 248.2 | #68717A | 0.544 / 0.018 / 248.2 |  | Mindbody origin | :628 / (inherits :root) |

Notes on what these values mean:
- **The frame:** `--chrome*` is set only in `:root`, so dark reads the same value. The comment says so: "Set here only, never in .dark: the frame does not change with the theme" ([index.css L589-592](../../src/index.css#L589)).
- **`--cta-strong`, the inverse `-l` ladder and `--cyan`** are "Kept with no reader, for a cleanup to retire or give a reader" ([navy-frame round doc L139](../../docs/rounds/2026-10-04-navy-frame.md)).
- **The four legacy pigments** (`--green` #4FDB8E, `--red` #E84F4F, `--amber` #F5A623, `--yellow` #FCD661) are the same in both modes. Their real readers are:
  - `SyncStatusBadge`: `bg-green` / `bg-amber` / `bg-red` dots and `text-red` error words ([src/components/mindbody/SyncStatusBadge.tsx L88-96, L147](../../src/components/mindbody/SyncStatusBadge.tsx#L88));
  - the notification bell's "Urgent" chip and machine-flag icon, `bg-amber/15 text-amber` ([src/features/notifications/NotificationBell.tsx L264, L379](../../src/features/notifications/NotificationBell.tsx#L264)).
  - The 21 `--mb-*` Mindbody tokens alias them, but nothing outside index.css reads any `mb-*` name (grep of `src`, non-test).
- **Brightness of the surfaces** (relative luminance Y, measured), as the round doc reports them ([navy-frame round doc, "The numbers"](../../docs/rounds/2026-10-04-navy-frame.md)):

  | Surface | Hex | Y | CIE L* |
  |---|---|---|---|
  | Light card | #F3F6F9 | 91.8% | 96.7 |
  | Light ground | #DEE6EE | 78.3% | 90.9 |
  | Frame | #002341 | 1.6% | 13.1 |
  | Dark page | #0A1C2C | 1.1% | 9.6 |
  | Dark card | #14293D | 2.1% | 15.9 |
  | Dark popover | #22374B | 3.6% | 22.2 |

#### 1b. The neutral ramp `--n-*` (what every `slate-*` class means): light, dark, and Tailwind v3 slate for comparison
Remapped by the `@theme` block ([index.css L263-275](../../src/index.css#L263)). Light rungs are [L576-586](../../src/index.css#L576); dark rungs are [L785-795](../../src/index.css#L785). Tailwind slate hex is the stock v3 scale: the repo cites its ends as "TAILWIND_SLATE (#F8FAFC .. #020617)" ([neutral-ramp.test.ts L58-59](../../src/neutral-ramp.test.ts#L58)), and the values still appear as `--sidebar-accent` #334155, `--ink-l4` #64748B and `--mb-state-scheduled` #94A3B8.

| Rung | Light hex | L | C | h | ΔL to next | WCAG on light ground #DEE6EE | Dark hex | L | C | h | ΔL to next | WCAG on dark card #14293D | Tailwind v3 slate hex | L | C | h | ΔL to next |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 50 | #ECF1F5 | 0.956 | 0.008 | 241.7 | 0.034 | 1.11 | #F4F7FB | 0.975 | 0.006 | 255.5 | 0.028 | 13.82 | #F8FAFC | 0.984 | 0.003 | 247.9 | 0.016 |
| 100 | #DEE6EE | 0.921 | 0.014 | 248.0 | 0.037 | 1.00 | #E9EEF4 | 0.947 | 0.010 | 252.8 | 0.042 | 12.73 | #F1F5F9 | 0.968 | 0.007 | 247.9 | 0.039 |
| 200 | #D1DAE4 | 0.884 | 0.017 | 250.9 | 0.065 | 1.12 | #D8E1E9 | 0.905 | 0.015 | 244.7 | 0.050 | 11.22 | #E2E8F0 | 0.929 | 0.013 | 255.5 | 0.060 |
| 300 | #BBC5D1 | 0.819 | 0.020 | 252.9 | 0.159 | 1.39 | #C6D1DC | 0.856 | 0.019 | 248.1 | 0.115 | 9.58 | #CBD5E1 | 0.869 | 0.020 | 252.9 | 0.158 |
| 400 | #8794A1 | 0.660 | 0.024 | 248.2 | 0.170 | 2.46 | #9DADBE | 0.741 | 0.030 | 249.9 | 0.095 | 6.47 | #94A3B8 | 0.711 | 0.035 | 256.8 | 0.156 |
| 500 | #546271 | 0.490 | 0.030 | 250.2 | 0.061 | 4.95 | #7E90A3 | 0.646 | 0.035 | 249.8 | 0.146 | 4.53 | #64748B | 0.554 | 0.041 | 257.4 | 0.109 |
| 600 | #425162 | 0.429 | 0.034 | 251.8 | 0.060 | 6.44 | #52657A | 0.499 | 0.041 | 251.2 | 0.099 | 2.48 | #475569 | 0.446 | 0.037 | 257.3 | 0.074 |
| 700 | #314153 | 0.369 | 0.037 | 251.8 | 0.040 | 8.28 | #354A5F | 0.401 | 0.044 | 249.0 | 0.071 | 1.62 | #334155 | 0.372 | 0.039 | 257.3 | 0.092 |
| 800 | #24374A | 0.329 | 0.042 | 249.2 | 0.039 | 9.68 | #23374C | 0.330 | 0.045 | 250.5 | 0.056 | 1.22 | #1E293B | 0.279 | 0.037 | 260.0 | 0.072 |
| 900 | #192D41 | 0.290 | 0.045 | 249.6 | 0.090 | 11.16 | #14293D | 0.274 | 0.046 | 248.8 | 0.054 | 1.00 | #0F172A | 0.208 | 0.040 | 265.8 | 0.079 |
| 950 | #071727 | 0.200 | 0.039 | 250.0 |  | 14.35 | #0A1C2C | 0.220 | 0.040 | 247.5 |  | 1.16 | #020617 | 0.129 | 0.041 | 264.7 |  |

#### 1c. The Hub palette `--eq-*` ([equipment.tokens.css](../../src/features/equipment/equipment.tokens.css)), with the depth shadows omitted (they are `var(--elev-*)` by name)

| Token | Light | L / C / h | Dark | L / C / h | Δh° | Inline note (light line) | Lines L/D |
|---|---|---|---|---|---|---|---|
| `--eq-bg` | #DEE6EE | 0.921 / 0.014 / 248.0 | #0A1C2C | 0.220 / 0.040 / 247.5 |  | page behind both panes, the grid | 24/131 |
| `--eq-surface` | #F3F6F9 | 0.972 / 0.005 / 247.9 | #14293D | 0.274 / 0.046 / 248.8 |  | rail items, cards; never pure white | 25/132 |
| `--eq-surface-2` | #E4EBF3 | 0.937 / 0.013 / 251.6 | #0D2235 | 0.245 / 0.045 / 248.0 |  | section headers, read-only chips | 26/133 |
| `--eq-surface-3` | #D4DEE8 | 0.896 / 0.017 / 248.0 | #203549 | 0.321 / 0.045 / 248.2 |  | hover / pressed | 27/134 |
| `--eq-border` | #D1DAE4 | 0.884 / 0.017 / 250.9 | #2B3E50 | 0.356 / 0.040 / 247.7 |  | hairlines                     1.3:1 | 28/135 |
| `--eq-border-strong` | #7A8694 | 0.615 / 0.025 / 252.3 | #6E8397 | 0.600 / 0.039 / 247.2 | 5.1 | pane divider, control edge    3.4:1 | 29/136 |
| `--eq-ink` | #192D41 | 0.290 / 0.045 / 249.6 | #DFE7EF | 0.924 / 0.014 / 248.0 |  | names, values (deep navy)    13.0:1 | 31/138 |
| `--eq-ink-2` | #3F4F60 | 0.421 / 0.035 / 250.2 | #B8C6D3 | 0.820 / 0.024 / 246.1 | 4.1 | secondary                     7.8:1 | 32/139 |
| `--eq-ink-muted` | #546271 | 0.490 / 0.030 / 250.2 | #9DADBE | 0.741 / 0.030 / 249.9 | 0.4 | labels                        5.8:1 | 33/140 |
| `--eq-ink-faint` | #7F8C99 | 0.634 / 0.025 / 248.2 | #697B8D | 0.575 / 0.035 / 248.4 | 0.2 | ghosts, em-dashes, a card's edge 3.2 | 34/141 |
| `--eq-hero` | #D45A06 | 0.614 / 0.172 / 45.6 | #F36D21 | 0.688 / 0.184 / 45.0 | 0.6 |  | 45/150 |
| `--eq-hero-text` | #B04000 | 0.522 / 0.158 / 41.8 | #FF9455 | 0.768 / 0.151 / 49.5 | 7.7 | 5.4:1; white words on it 5.9:1 | 46/151 |
| `--eq-hero-fill` | #FFE9D8 | 0.947 / 0.033 / 60.1 | #4B2915 | 0.320 / 0.060 / 49.8 | 10.3 |  | 47/152 |
| `--eq-hero-on` | #FFFFFF | 1.000 / 0.000 / — | #071727 | 0.200 / 0.039 / 250.0 |  | words on the hero text only | 48/153 |
| `--eq-go` | #F36D21 | 0.688 / 0.184 / 45.0 | #F36D21 | 0.688 / 0.184 / 45.0 | 0.0 | the logo orange | 49/154 |
| `--eq-go-on` | #071727 | 0.200 / 0.039 / 250.0 | #071727 | 0.200 / 0.039 / 250.0 | 0.0 | navy words on it              6.1:1 | 50/155 |
| `--eq-live` | #0A548B | 0.435 / 0.112 / 248.0 | #65ABE9 | 0.720 / 0.115 / 246.9 | 1.1 | the logo blue                 7.3:1 | 54/157 |
| `--eq-live-text` | #064F89 | 0.421 / 0.116 / 250.0 | #98CAF9 | 0.821 / 0.085 / 247.3 | 2.7 | 7.8:1 | 55/158 |
| `--eq-live-fill` | #DBEEFE | 0.940 / 0.030 / 243.4 | #23405C | 0.362 / 0.060 / 249.0 | 5.6 | an in-session card | 56/159 |
| `--eq-live-on` | #FFFFFF | 1.000 / 0.000 / — | #071727 | 0.200 / 0.039 / 250.0 |  | words on the blue             7.9:1 | 57/160 |
| `--eq-mine` | #D3E2F1 | 0.906 / 0.026 / 248.1 | #0E243A | 0.255 / 0.050 / 250.4 | 2.3 |  | 63/162 |
| `--eq-mine-head` | #CBE1F7 | 0.900 / 0.038 / 248.3 | #133555 | 0.322 / 0.069 / 249.7 | 1.5 |  | 64/163 |
| `--eq-rail-booked` | #668FBA | 0.637 / 0.079 / 250.3 | #4675A4 | 0.550 / 0.090 / 249.8 | 0.5 | a coming-up card's edge       3.1:1 | 65/164 |
| `--eq-ok` | #17714B | 0.488 / 0.102 / 159.8 | #52D7C1 | 0.800 / 0.120 / 180.2 | 20.4 | 5.5:1, 5.2:1 on its fill | 68/166 |
| `--eq-ok-fill` | #E3F1EA | 0.946 / 0.017 / 164.7 | #113E36 | 0.331 / 0.051 / 179.0 |  |  | 69/167 |
| `--eq-warn` | #A2457E | 0.531 / 0.140 / 345.2 | #D98CBD | 0.733 / 0.112 / 341.6 | 3.6 | 5.3:1, 4.8:1 on its fill | 73/169 |
| `--eq-warn-fill` | #F4E9F0 | 0.945 / 0.015 / 338.9 | #402846 | 0.319 / 0.061 / 319.4 |  |  | 74/170 |
| `--eq-alert` | #C0203F | 0.525 / 0.192 / 17.6 | #F2718C | 0.708 / 0.160 / 9.0 | 8.6 | 5.5:1, 4.9:1 on its fill | 81/172 |
| `--eq-alert-fill` | #FCE3E8 | 0.937 / 0.028 / 4.0 | #472024 | 0.300 / 0.060 / 14.9 | 10.9 |  | 82/173 |
| `--eq-focus-ring` | #0A548B | 0.435 / 0.112 / 248.0 | #65ABE9 | 0.720 / 0.115 / 246.9 | 1.1 |  | 84/— |
| `--eq-shadow` | #192D41 α0.1 | 0.290 / 0.045 / 249.6 | #020A14 α0.45 | 0.141 / 0.028 / 247.1 | 2.5 |  | 85/175 |
| `--eq-raised` | #F8FAFC | 0.984 / 0.003 / — | #203549 | 0.321 / 0.045 / 248.2 |  |  | 95/180 |
| `--eq-tray` | #D1DAE4 | 0.884 / 0.017 / 250.9 | #081725 | 0.199 / 0.035 / 248.3 |  |  | 96/181 |
| `--eq-edge` | #192D41 α0.13 | 0.290 / 0.045 / 249.6 | #96B4D2 α0.11 | 0.758 / 0.054 / 248.5 | 1.1 |  | 97/182 |
| `--eq-edge-control` | #192D41 α0.26 | 0.290 / 0.045 / 249.6 | #96B4D2 α0.16 | 0.758 / 0.054 / 248.5 | 1.1 |  | 98/183 |
| `--eq-divider` | #192D41 α0.1 | 0.290 / 0.045 / 249.6 | #96B4D2 α0.1 | 0.758 / 0.054 / 248.5 | 1.1 |  | 99/184 |
| `--eq-highlight` | #FFFFFF α0.7 | 1.000 / 0.000 / — | #FFFFFF α0.07 | 1.000 / 0.000 / — |  |  | 100/185 |
| `--eq-popover` | #F3F6F9 | 0.972 / 0.005 / 247.9 | #22374B | 0.329 / 0.045 / 248.2 |  |  | 105/186 |
| `--eq-popover-rim` | #192D41 α0.13 | 0.290 / 0.045 / 249.6 | #FFFFFF α0.055 | 1.000 / 0.000 / — |  |  | 106/187 |
| `--eq-popover-light` | #FFFFFF α0 | 1.000 / 0.000 / — | #FFFFFF α0.07 | 1.000 / 0.000 / — |  |  | 107/188 |
| `--eq-popover-raised` | #F8FAFC | 0.984 / 0.003 / — | #283E54 | 0.356 / 0.047 / 249.3 |  |  | 111/189 |
| `--eq-popover-edge` | #7A8694 | 0.615 / 0.025 / 252.3 | #7D92A6 | 0.650 / 0.038 / 247.1 | 5.2 |  | 112/190 |

Documented jobs ([equipment.tokens.css L36-82](../../src/features/equipment/equipment.tokens.css#L36)):
- **Hero** is "the orange of MARKS: the now line, its dot and its pill, today, the day dots".
- **Go** is "the one loud action (Start session) and every orange chip with words".
- **Blue** is "yours, picked, in session, and anything you can act on".
- **`--eq-rail-booked`** is "the quiet blue edge of a client card still to come".
- **Green** is "a machine that is set up and in use".
- **Plum** is "caution, warnings and maintenance. Plum rather than red so it does not collide with the hero orange for a protanope".
- **`--eq-alert`** is "deliberately the SAME crimson the Journey Grid uses for a set that needs work".

#### 1d. The Active Session palette `--jg-*` ([journey-grid.tokens.css](../../src/features/journey-grid/journey-grid.tokens.css)), with depth shadows omitted

| Token | Light | L / C / h | Dark | L / C / h | Δh° | Inline note (light line) | Lines L/D |
|---|---|---|---|---|---|---|---|
| `--brand-primary-1` | #EF5302 | 0.648 / 0.204 / 39.7 | #EF5302 | 0.648 / 0.204 / 39.7 | 0.0 | hero orange (the hero is #d45a06 since Oct 4 2026) | 21/— |
| `--brand-primary-2` | #034A84 | 0.404 / 0.115 / 250.9 | #034A84 | 0.404 / 0.115 / 250.9 | 0.0 | deep blue (live text is #064f89 since Oct 4 2026) | 22/— |
| `--brand-primary-3` | #5B6770 | 0.507 / 0.021 / 240.3 | #5B6770 | 0.507 / 0.021 / 240.3 | 0.0 | slate | 23/— |
| `--brand-accent-1` | #EA732F | 0.685 / 0.167 / 46.7 | #EA732F | 0.685 / 0.167 / 46.7 | 0.0 |  | 24/— |
| `--brand-accent-2` | #F7AE82 | 0.811 / 0.104 / 51.8 | #F7AE82 | 0.811 / 0.104 / 51.8 | 0.0 | peach | 25/— |
| `--brand-accent-3` | #F36D21 | 0.688 / 0.184 / 45.0 | #F36D21 | 0.688 / 0.184 / 45.0 | 0.0 |  | 26/— |
| `--brand-accent-4` | #0A548B | 0.435 / 0.112 / 248.0 | #0A548B | 0.435 / 0.112 / 248.0 | 0.0 |  | 27/— |
| `--jg-bg` | #DEE6EE | 0.921 / 0.014 / 248.0 | #0A1C2C | 0.220 / 0.040 / 247.5 |  | page behind the grid | 35/243 |
| `--jg-surface` | #F3F6F9 | 0.972 / 0.005 / 247.9 | #14293D | 0.274 / 0.046 / 248.8 |  | cells | 36/244 |
| `--jg-surface-2` | #E4EBF3 | 0.937 / 0.013 / 251.6 | #1B3044 | 0.302 / 0.045 / 248.4 |  | header band, sticky machine column | 37/245 |
| `--jg-surface-3` | #D4DEE8 | 0.896 / 0.017 / 248.0 | #203549 | 0.321 / 0.045 / 248.2 |  | pressed / hover | 38/246 |
| `--jg-border` | #D1DAE4 | 0.884 / 0.017 / 250.9 | #2B3E50 | 0.356 / 0.040 / 247.7 |  | hairlines between cells   1.3:1 | 39/247 |
| `--jg-border-strong` | #A3AEBB | 0.746 / 0.022 / 252.5 | #4A5F73 | 0.476 / 0.041 / 247.4 | 5.1 | sticky-edge separators    2.1:1 | 40/248 |
| `--jg-control-edge` | #7A8694 | 0.615 / 0.025 / 252.3 | #6E8397 | 0.600 / 0.039 / 247.2 | 5.1 | buttons, fields, menus    3.4:1 | 46/249 |
| `--jg-ink` | #192D41 | 0.290 / 0.045 / 249.6 | #DFE7EF | 0.924 / 0.014 / 248.0 |  | weights, names            13.0:1 | 48/251 |
| `--jg-ink-2` | #3F4F60 | 0.421 / 0.035 / 250.2 | #B8C6D3 | 0.820 / 0.024 / 246.1 | 4.1 | reps / secondary          7.8:1 | 49/252 |
| `--jg-ink-muted` | #546271 | 0.490 / 0.030 / 250.2 | #9DADBE | 0.741 / 0.030 / 249.9 | 0.4 | labels                    5.8:1 | 50/253 |
| `--jg-ink-faint` | #7F8C99 | 0.634 / 0.025 / 248.2 | #697B8D | 0.575 / 0.035 / 248.4 | 0.2 | "—" placeholders, 3.2:1 (decorative) | 51/254 |
| `--jg-hero` | #D45A06 | 0.614 / 0.172 / 45.6 | #F36D21 | 0.688 / 0.184 / 45.0 | 0.6 |  | 58/256 |
| `--jg-hero-text` | #B04000 | 0.522 / 0.158 / 41.8 | #FF9455 | 0.768 / 0.151 / 49.5 | 7.7 | the Hub's --eq-hero-text | 59/257 |
| `--jg-hero-fill` | #FFE9D8 | 0.947 / 0.033 / 60.1 | #4B2915 | 0.320 / 0.060 / 49.8 | 10.3 | the Hub's --eq-hero-fill | 60/258 |
| `--jg-go` | #F36D21 | 0.688 / 0.184 / 45.0 | #F36D21 | 0.688 / 0.184 / 45.0 | 0.0 |  | 65/259 |
| `--jg-go-on` | #071727 | 0.200 / 0.039 / 250.0 | #071727 | 0.200 / 0.039 / 250.0 | 0.0 |  | 66/260 |
| `--jg-live` | #0A548B | 0.435 / 0.112 / 248.0 | #65ABE9 | 0.720 / 0.115 / 246.9 | 1.1 | 7.3:1 on the cells | 73/262 |
| `--jg-live-text` | #064F89 | 0.421 / 0.116 / 250.0 | #98CAF9 | 0.821 / 0.085 / 247.3 | 2.7 | 7.8:1 on the cells, 6.7:1 on the live fill | 74/263 |
| `--jg-live-fill` | #D6E8F8 | 0.922 / 0.029 / 244.9 | #143A5C | 0.340 / 0.074 / 248.8 | 3.9 |  | 75/264 |
| `--jg-live-fill-strong` | #C3DAF0 | 0.878 / 0.039 / 247.1 | #255480 | 0.435 / 0.089 / 249.3 | 2.2 |  | 76/265 |
| `--jg-live-on` | #FFFFFF | 1.000 / 0.000 / — | #071727 | 0.200 / 0.039 / 250.0 |  |  | 77/266 |
| `--jg-q-done-fill` | #EDEEEF | 0.949 / 0.002 / — | #2A333D | 0.317 / 0.022 / 251.2 |  |  | 81/268 |
| `--jg-q-done-edge` | #A5ABB0 | 0.738 / 0.010 / 242.9 | #455058 | 0.425 / 0.019 / 239.5 |  |  | 82/269 |
| `--jg-q-max-fill` | #CAE4CE | 0.894 / 0.041 / 149.8 | #104525 | 0.347 / 0.078 / 152.7 | 2.9 | ink 10.4:1 · ink-2 6.2:1 | 103/270 |
| `--jg-q-max-edge` | #1A9C69 | 0.614 / 0.132 / 160.4 | #3FCA8E | 0.750 / 0.148 / 160.5 | 0.1 | 3.2:1 on the cells — border weight only | 104/271 |
| `--jg-q-max-text` | #0A6644 | 0.452 / 0.097 / 161.2 | #6FE0AB | 0.826 / 0.129 / 161.3 | 0.1 | 6.5:1 on the cells, 5.2:1 on its fill | 105/272 |
| `--jg-q-star` | #946609 | 0.545 / 0.111 / 76.9 | #F0C874 | 0.850 / 0.112 / 84.6 | 7.6 | the gold ★ — 3.7:1 on the max fill | 106/273 |
| `--jg-q-poor` | #C0203F | 0.525 / 0.192 / 17.6 | #F2718C | 0.708 / 0.160 / 9.0 | 8.6 | 5.5:1 on the cells, 3.7:1 on its fill | 111/274 |
| `--jg-q-poor-text` | #A3122F | 0.460 / 0.175 / 18.7 | #FFA8B8 | 0.821 / 0.104 / 7.6 | 11.1 | 7.2:1 on the cells, 4.8:1 on its fill | 112/275 |
| `--jg-q-poor-fill` | #F8BCC6 | 0.852 / 0.070 / 7.5 | #320E16 | 0.226 / 0.059 / 9.4 | 1.9 |  | 113/276 |
| `--jg-q-poor-hatch` | #C0203F α0.15 | 0.525 / 0.192 / 17.6 | #F2718C α0.14 | 0.708 / 0.160 / 9.0 | 8.6 |  | 114/277 |
| `--jg-delta-up` | #064F89 | 0.421 / 0.116 / 250.0 | #98CAF9 | 0.821 / 0.085 / 247.3 | 2.7 | 7.8:1 cells · 6.2:1 max fill · 5.2:1 poor fill | 126/279 |
| `--jg-drop` | #546271 | 0.490 / 0.030 / 250.2 | #9DADBE | 0.741 / 0.030 / 249.9 | 0.4 |  | 127/280 |
| `--jg-band` | #192D41 α0.035 | 0.290 / 0.045 / 249.6 | #DFE7EF α0.045 | 0.924 / 0.014 / 248.0 |  |  | 134/282 |
| `--jg-focus-ring` | #0A548B | 0.435 / 0.112 / 248.0 | #65ABE9 | 0.720 / 0.115 / 246.9 | 1.1 |  | 135/— |
| `--jg-sticky-shadow` | #192D41 α0.1 | 0.290 / 0.045 / 249.6 | #020A14 α0.45 | 0.141 / 0.028 / 247.1 | 2.5 |  | 136/283 |
| `--jg-pf-date` | #0A548B | 0.435 / 0.112 / 248.0 | #8CC4F2 | 0.798 / 0.088 / 244.0 | 4.1 |  | 154/286 |
| `--jg-pf-date-sub` | #3F6B90 | 0.512 / 0.077 / 245.4 | #7A9DBC | 0.681 / 0.060 / 245.6 | 0.1 | 4.7:1 on the band (was #4f7ea6, 3.6) | 155/287 |
| `--jg-pf-tile` | #D9E9F6 | 0.926 / 0.025 / 242.4 | #16324B | 0.308 / 0.057 / 247.7 | 5.3 |  | 156/288 |
| `--jg-pf-tile-ink` | #062E4F | 0.294 / 0.074 / 248.7 | #FFFFFF | 1.000 / 0.000 / — |  |  | 157/289 |
| `--jg-pf-reps` | #3B6689 | 0.494 / 0.074 / 244.7 | #7FA6C6 | 0.708 / 0.063 / 243.6 | 1.1 | 4.6:1 on a banded tile (was #3d6a8f, 4.3) | 158/290 |
| `--jg-pf-now` | #B53C0B | 0.526 / 0.165 / 38.3 | #F58443 | 0.728 / 0.159 / 48.2 | 9.9 | 4.8:1 on the band, 4.6 spotlit (was #c2410c) | 159/291 |
| `--jg-pf-now-sub` | #9E4D20 | 0.514 / 0.122 / 46.6 | #F7A06B | 0.782 / 0.124 / 51.4 | 4.8 | 4.7:1 on a banded orange tile (was #d4682c, 2.8) | 160/292 |
| `--jg-pf-now-tile` | #FDE6D8 | 0.940 / 0.031 / 53.5 | #3A2216 | 0.280 / 0.043 / 47.0 | 6.4 |  | 161/293 |
| `--jg-pf-now-edge` | #EF5302 | 0.648 / 0.204 / 39.7 | #F36D21 | 0.688 / 0.184 / 45.0 | 5.3 |  | 162/294 |
| `--jg-pf-now-ink` | #7A2A06 | 0.400 / 0.119 / 40.3 | #FFD2B8 | 0.896 / 0.062 / 51.7 | 11.3 |  | 163/295 |
| `--jg-pf-practice` | #4F6F8C | 0.529 / 0.059 / 246.5 | #9FB4C7 | 0.760 / 0.036 / 245.6 | 0.9 |  | 166/296 |
| `--jg-pf-practice-bg` | #E6EEF5 | 0.945 / 0.013 / 244.3 | #1D2A36 | 0.279 / 0.029 / 246.9 |  |  | 167/297 |
| `--jg-pf-skip` | #6B7884 | 0.566 / 0.024 / 246.1 | #8A96A2 | 0.667 / 0.023 / 248.2 | 2.1 |  | 168/298 |
| `--jg-pf-skip-bg` | #EEF1F4 | 0.957 / 0.005 / 247.9 | #1A2129 | 0.244 / 0.018 / 252.0 |  |  | 169/299 |
| `--jg-pf-flow` | #7B3FB8 | 0.504 / 0.184 / 303.1 | #C58CF0 | 0.734 / 0.151 / 309.3 | 6.2 |  | 170/300 |
| `--jg-pf-flow-bg` | #F1E7FB | 0.942 / 0.029 / 308.1 | #2A1D3A | 0.261 / 0.055 / 303.5 | 4.6 |  | 171/301 |
| `--jg-pf-gain` | #15803D | 0.527 / 0.137 / 150.1 | #4ADE80 | 0.800 / 0.182 / 151.7 | 1.6 | the load climbing since her start (Now bar) | 172/302 |
| `--jg-pf-bg` | #ECF1F5 | 0.956 / 0.008 / 241.7 | #0A1C2C | 0.220 / 0.040 / 247.5 |  | group rows, the frame — near the page | 197/306 |
| `--jg-pf-surface-2` | #E4EBF3 | 0.937 / 0.013 / 251.6 | #1B3044 | 0.302 / 0.045 / 248.4 |  | header band, sticky rails  1.11:1 | 198/307 |
| `--jg-pf-surface-3` | #D9E2EB | 0.909 / 0.016 / 248.0 | #203549 | 0.321 / 0.045 / 248.2 |  | pressed / hover | 199/308 |
| `--jg-pf-border` | #DDE4EB | 0.916 / 0.012 / 248.0 | #2B3E50 | 0.356 / 0.040 / 247.7 |  | cell hairlines             1.18:1 | 200/309 |
| `--jg-pf-border-strong` | #B5C0CB | 0.803 / 0.020 / 248.1 | #4A5F73 | 0.476 / 0.041 / 247.4 |  | sticky edges, header rule  1.70:1 | 201/310 |
| `--jg-pf-sticky-shadow` | #192D41 α0.07 | 0.290 / 0.045 / 249.6 | #020A14 α0.45 | 0.141 / 0.028 / 247.1 | 2.5 |  | 202/311 |
| `--jg-raised` | #F8FAFC | 0.984 / 0.003 / — | #203549 | 0.321 / 0.045 / 248.2 |  | --jg-control-edge on it 3.5:1 | 210/315 |
| `--jg-highlight` | #FFFFFF α0.7 | 1.000 / 0.000 / — | #FFFFFF α0.07 | 1.000 / 0.000 / — |  |  | 211/316 |

Notes:
- **The rep-quality fills.** The file explains that "The cell background is now the ONLY channel that carries quality, so the three states have to separate on fill alone: green / red / grey", backed by shape cues (★, ◯, cross, hatch) ([L83-114](../../src/features/journey-grid/journey-grid.tokens.css#L83)).
- **AJ's Journey-look colours** `--jg-pf-*` were "Retuned by lightness only, each hue and saturation kept" ([L143-153](../../src/features/journey-grid/journey-grid.tokens.css#L143)).
- **The `.jg-view--journey` mapping** swaps in calmer neutrals on the profile only ([L416-427](../../src/features/journey-grid/journey-grid.tokens.css#L416)).

#### 1e. The feature palettes: how much of each is the Hub's
Each colour token was compared with `--eq-<same suffix>` after resolving `var()`, in both modes.

| File | Prefix | Colour tokens | Equal to the Hub's in both modes | Own pigments (light / dark) |
|---|---|---|---|---|
| [admin.tokens.css](../../src/features/admin/admin.tokens.css) | `--adm` | 42 | 42 | none |
| [catalog.tokens.css](../../src/features/catalog/catalog.tokens.css) | `--cat` | 17 | 17 | none |
| [studio-tasks.tokens.css](../../src/features/studio-tasks/studio-tasks.tokens.css) | `--st` | 33 | 27 | `--st-done` #17714B/#52D7C1 (= ok); `--st-flag` #A2457E/#D98CBD (= warn); `--st-flag-border` dark is rgba #D98CBD@0.32; `--st-done-on` #FFFFFF/#04121C |
| [trainer-profile.tokens.css](../../src/features/trainer-profile/trainer-profile.tokens.css) | `--tp` | 36 | 32 | the Kaizen tokens: `--tp-kaizen` #0A548B/#65ABE9, `-text` #034A84/#98CAF9, `-fill` #EAF0F4/#23405C, `-quiet` #5B6770/#9DADBE |
| [routine-builder.tokens.css](../../src/features/routine-builder/routine-builder.tokens.css) | `--rb` | 37 | 28 | `--rb-avoid` #A2457E/#DC93C2, `-avoid-edge` #AD7598/#AF5089; `--rb-caution` (amber) #8A5300/#E0A45A, `-caution-edge` #D9A45C/#8A5300; muscle blues #0A548B/#65ABE9, #6FB4E4/#2C6F9E, base #9AA6AE/#4B555C |
| [briefing.tokens.css](../../src/features/briefing/briefing.tokens.css) | `--br` | 34 | 29 | `--br-warn` (amber, not plum) #8A5300/#FBBF24, fill #FDF3E3/#3F3112; `--br-critical` = alert (named differently); `--br-critical-border` #F0B6C1 / #F2718C@0.38 |
| [subjective-report.tokens.css](../../src/features/subjective-report/subjective-report.tokens.css) | `--sr` (Pulse) | 30 | 19 | traffic lights: green #17714B/#5CCF98, yellow #9D5F00/#F0B95A, red #B42318/#FF7B6E, watch (violet) #6B4C9A/#C4A9EA, each with an opaque fill; `--sr-navy` #034A84/#65ABE9; `--sr-on` #FFFFFF/#071727 |
| [ford.tokens.css](../../src/features/ford/ford.tokens.css) | `--ford` | 34 | 17 | pillar inks and fills: family (orange) #B8430B/#F5975E, occupation (blue) #0F5285/#79B6E2, recreation (green) #1B6F4E/#66C39A, dreams (violet) #5A4AA6/#A99BEC; `unfiled` #7A5A12/#D8B866. now / soon / later alias hero-text / live-text / ink-muted |
| [calendar.tokens.css](../../src/features/calendar/calendar.tokens.css) | `--cal`, `--t*` | 64 | 24 | 6-step blue heat ramp `--cal-heat-0..5` (#EEF2F5→#0A548B light; #0D2235→#65ABE9 dark). 8 trainer identity tones `--t0..t7`: orange, blue, teal, violet, amber, plum, green, cyan, at Tailwind-like values (e.g. dark #2DD4BF, #A78BFA, #F59E0B, #4ADE80, #22D3EE), with **dark fills as rgba washes at 0.14-0.16** |
| [wiki.tokens.css](../../src/features/wiki/wiki.tokens.css) | `--wk` (Learning) | 57 | 31 | 7 body-family hues ×3 (solid, fill, text): push #EF5302/#FF6A1F, **pull #0A548B / #38BDF8 (Tailwind sky)**, legs #1C7A52/#34D399, posterior #B26A00/#FBBF24, trunk #8A4F9E/#C084FC, hips #B5306F/#F472B6, other #5B6770/#8B98A4; **dark fills are rgba washes at 0.10-0.14** |
| [codex.tokens.css](../../src/features/client-codex/codex.tokens.css) | `--cx` | 50 | 26 by the same name; the rest alias `--eq-*` / `--ford-*` under other names | `--cx-*-line` tokens are `color-mix(in srgb, accent 40-45%, transparent)` |
| [progress-report.tokens.css](../../src/features/progress-report/progress-report.tokens.css) | `--pr` | 39 | 10 | the always-navy client report: `--pr-navy` #0A2E46, `--pr-hero` #F06C22 (the retired orange) with `--pr-hero-on` #FFFFFF; the editor's dark surfaces are **Tailwind slate** (#0F172A, #1E293B, #334155) |
| [journey-grid.tokens.css](../../src/features/journey-grid/journey-grid.tokens.css) | `--jg`, `--brand` | 69 | 19 | see table 1d |

The round doc lists the pinned copies: "`--adm`, `--st`, `--wk`, `--cat`" are held by their own tests; "briefing, Pulse, FORD, calendar, trainer profile, routine builder" are held by `palette-copies.test.ts`. Its stated rule: "A new feature palette copies `equipment.tokens.css`, and a test holds it" ([docs/KNOWN-TRAPS.md L441](../../docs/KNOWN-TRAPS.md#L441); [navy-frame round doc L117-127](../../docs/rounds/2026-10-04-navy-frame.md)).

#### 1f. The depth tokens' colours
From [index.css L433-462 (light)](../../src/index.css#L433) and [L698-729 (dark)](../../src/index.css#L698):
- **Light shadows** are all the ink #192D41 (OKLCH 0.290 / 0.045 / 249.6) at alpha 0.08-0.45:
  - `--elev-1` contact .16 + ambient .08;
  - `--elev-2` .08 + .24;
  - `--elev-5` .10 + .42;
  - `--shelf` .10 + .45.
- **Frame casts** use #001224 and the chrome #002341 (.22-.45).
- **Dark shadows** are #020A14 (OKLCH 0.141 / 0.028 / 247.1) at 0.40-0.85, plus white rims at .05.
- **Edges and dividers** are the ink at .10-.26 in light, and the pale navy rgba(150,180,210) (OKLCH 0.758 / 0.054 / 248.5) at .10-.16 in dark.
- **Composited** (measured):
  - light `--edge` over the page gives #C4CED8 (1.27:1); dark gives #192D3E (1.22:1);
  - light `--divider` over a card gives #DDE2E7 (1.20:1); dark gives #21374C (1.21:1);
  - light `--scrim` over a card gives #9CA4AC (Y 36.5%); dark over a card gives #081421 (Y 0.7%).
- **The glows:** `--glow-live` and `--glow-go` mix the accent at 65% / 80% (light) and the orange at 55% (dark) into transparency.

#### 1g. Lightness steps of the depth surfaces (OKLab ΔL; WCAG ratio in brackets)

| Step | Light | Dark |
|---|---|---|
| Card above page | +0.051 (1.16) | +0.054 (1.16) |
| Popover above card | 0.000 (1.00) | +0.055 (1.21) |
| Raised above card | +0.012 (1.04) | +0.047 (1.18) |
| Well below card | −0.035 (1.11) | −0.029 (1.09) |
| Tray below page | −0.037 (1.12) | −0.021 (1.05) |

In dark, `--raised`, `--muted`, `--bg-dark-3` and the Hub's pressed `--eq-surface-3` are all the same value, #203549.

### Inferences
- **The core palette is deliberately small.** Each accent is used twice (light step, dark step) under many token names: the logo blue #0A548B is `--primary`, `--brand`, `--ring`, `--chart-1`, `--cyan`, `--eq-live`, `--jg-live`, `--brand-accent-4`, `--pr-blue` and `--mb-*`. The token count (699) is far larger than the pigment count. The breadth of "unique colours" (184 light, 196 dark) comes mostly from feature-local identity pigments: calendar tones, Learning families, FORD pillars, Pulse traffic lights, AJ's profile colours and the print report.
- **Three families still carry pre-Navy-Frame values:**
  - Tailwind sky #38BDF8 (Learning's dark pull family, `--sidebar-*` dark);
  - Tailwind slate (the `--sidebar-*` set, the progress-report editor's dark surfaces, `--ink-l4`, `--mb-state-scheduled`);
  - the retired orange #F06C22 / #EF5302 (`--pr-hero`, `--brand-primary-1`, `--wk-cat-push`, calendar tone 0, `--jg-pf-now-edge`).
- **The light-mode depth system is very shallow by luminance.** A raised control is 1.04:1 off its card and a popover is identical to a card. Elevation in light therefore rests almost entirely on the navy shadows and the 3:1 control edge. In dark, lightness carries elevation (+0.047 to +0.055 per step), as the comments intend.

### Gaps
- The real on-screen surface under each token, and how often each token is drawn, was not instrumented. Contrast below is measured on the surfaces the token comments and tests name, not on rendered screenshots.
- Tailwind v4 defines slate in OKLCH rather than hex. The comparison uses the v3 hex that the repo itself cites, so any v4 rounding difference is not captured. It is immaterial, because the override replaces those values.

## 2. In OKLCH: hue spacing, the navy/orange pair, ramp evenness, and how much chroma the navy carries

### Takeaway
**The hues are not evenly spaced.**
- Light mode puts four warm semantic hues (crimson 17.6°, the oranges 45.0-45.6°, amber 66.9°, gold 76.9°) inside 60°, with plum at 345.2° only 32° from crimson.
- The cool side is sparse: green 159.8° → blue 248.0° is an 88° gap.

**Navy and orange are not a true complementary pair in a perceptual space.**
- OKLCH: Δh = 156.2° (chrome ↔ go); the exact OKLCH complement of the navy is 68.9°, which is amber.
- CIELAB: Δh_ab = 139°.
- HSL: 174°. Only on the naive HSL wheel are they close to complementary.

**The ramps are smooth in hue but uneven in L.**
- Light ΔL steps run from 0.034 to 0.170 (coefficient of variation 63%).
- Dark ΔL steps run from 0.028 to 0.146 (CV 47%).
- Tailwind slate's own CV is 51%.

**The dark "navy" is mostly a hue move and a lightness lift, not much extra chroma.**
- Mean C is 0.030 against slate's 0.028.
- The card (C 0.046) has about 24% more chroma than slate-800 at the same L, and is turned about 11° away from slate's violet-blue (h 248.8° against 260°).
- The darkest rungs are lifted a lot (950: L 0.220 against 0.129).

### Cited Findings

#### 2a. Semantic accents in OKLCH (and HSL hue for comparison), both modes
Values from the token files cited in §1.

| Role | Token | Light hex | OKLCH L / C / h | HSL h | Dark hex | OKLCH L / C / h | HSL h | Δh OKLCH light→dark | ΔL | ΔC |
|---|---|---|---|---|---|---|---|---|---|---|
| navy frame | `--chrome` | #002341 | 0.251 / 0.069 / 248.9 | 208 | #002341 | 0.251 / 0.069 / 248.9 | 208 | 0.0 | 0.000 | 0.000 |
| navy ink | `--foreground` | #192D41 | 0.290 / 0.045 / 249.6 | 210 | #DFE7EF | 0.924 / 0.014 / 248.0 | 210 | 1.6 | 0.634 | -0.031 |
| logo blue / primary | `--primary` | #0A548B | 0.435 / 0.112 / 248.0 | 206 | #65ABE9 | 0.720 / 0.115 / 246.9 | 208 | 1.1 | 0.286 | 0.003 |
| Hub live (blue) | `--eq-live` | #0A548B | 0.435 / 0.112 / 248.0 | 206 | #65ABE9 | 0.720 / 0.115 / 246.9 | 208 | 1.1 | 0.286 | 0.003 |
| Hub live text | `--eq-live-text` | #064F89 | 0.421 / 0.116 / 250.0 | 207 | #98CAF9 | 0.821 / 0.085 / 247.3 | 209 | 2.7 | 0.400 | -0.031 |
| coming-up rail | `--eq-rail-booked` | #668FBA | 0.637 / 0.079 / 250.3 | 211 | #4675A4 | 0.550 / 0.090 / 249.8 | 210 | 0.5 | -0.088 | 0.011 |
| frame "here" blue | `--chrome-here` | #65ABE9 | 0.720 / 0.115 / 246.9 | 208 | #65ABE9 | 0.720 / 0.115 / 246.9 | 208 | 0.0 | 0.000 | 0.000 |
| hero orange (marks) | `--eq-hero` | #D45A06 | 0.614 / 0.172 / 45.6 | 24 | #F36D21 | 0.688 / 0.184 / 45.0 | 22 | 0.6 | 0.074 | 0.012 |
| go orange (logo) | `--eq-go` | #F36D21 | 0.688 / 0.184 / 45.0 | 22 | #F36D21 | 0.688 / 0.184 / 45.0 | 22 | 0.0 | 0.000 | 0.000 |
| hero text (deep orange) | `--eq-hero-text` | #B04000 | 0.522 / 0.158 / 41.8 | 22 | #FF9455 | 0.768 / 0.151 / 49.5 | 22 | 7.7 | 0.247 | -0.007 |
| frame go-fill | `--chrome-go-fill` | #3D2112 | 0.281 / 0.050 / 48.0 | 21 | #3D2112 | 0.281 / 0.050 / 48.0 | 21 | 0.0 | 0.000 | 0.000 |
| destructive red | `--destructive` | #BB271B | 0.517 / 0.186 / 29.6 | 5 | #FF8C8C | 0.765 / 0.140 / 20.8 | 0 | 8.8 | 0.248 | -0.046 |
| Critical crimson | `--eq-alert` | #C0203F | 0.525 / 0.192 / 17.6 | 348 | #F2718C | 0.708 / 0.160 / 9.0 | 347 | 8.6 | 0.183 | -0.032 |
| rep-quality poor | `--jg-q-poor` | #C0203F | 0.525 / 0.192 / 17.6 | 348 | #F2718C | 0.708 / 0.160 / 9.0 | 347 | 8.6 | 0.183 | -0.032 |
| caution plum | `--eq-warn` | #A2457E | 0.531 / 0.140 / 345.2 | 323 | #D98CBD | 0.733 / 0.112 / 341.6 | 322 | 3.6 | 0.203 | -0.028 |
| ok green | `--eq-ok` | #17714B | 0.488 / 0.102 / 159.8 | 155 | #52D7C1 | 0.800 / 0.120 / 180.2 | 170 | 20.4 | 0.313 | 0.018 |
| max-strength edge | `--jg-q-max-edge` | #1A9C69 | 0.614 / 0.132 / 160.4 | 156 | #3FCA8E | 0.750 / 0.148 / 160.5 | 154 | 0.1 | 0.136 | 0.016 |
| max-strength text | `--jg-q-max-text` | #0A6644 | 0.452 / 0.097 / 161.2 | 158 | #6FE0AB | 0.826 / 0.129 / 161.3 | 152 | 0.1 | 0.374 | 0.032 |
| star gold | `--jg-q-star` | #946609 | 0.545 / 0.111 / 76.9 | 40 | #F0C874 | 0.850 / 0.112 / 84.6 | 41 | 7.6 | 0.305 | 0.001 |
| briefing warn (amber) | `--br-warn` | #8A5300 | 0.494 / 0.109 / 66.9 | 36 | #FBBF24 | 0.837 / 0.164 / 84.4 | 43 | 17.5 | 0.343 | 0.055 |
| routine caution (amber) | `--rb-caution` | #8A5300 | 0.494 / 0.109 / 66.9 | 36 | #E0A45A | 0.761 / 0.116 / 70.3 | 33 | 3.4 | 0.267 | 0.006 |
| Pulse yellow | `--sr-yellow` | #9D5F00 | 0.543 / 0.120 / 66.8 | 36 | #F0B95A | 0.818 / 0.129 / 78.9 | 38 | 12.1 | 0.275 | 0.008 |
| Pulse red | `--sr-red` | #B42318 | 0.500 / 0.182 / 29.5 | 4 | #FF7B6E | 0.734 / 0.163 / 27.5 | 5 | 2.0 | 0.233 | -0.019 |
| Pulse green | `--sr-green` | #17714B | 0.488 / 0.102 / 159.8 | 155 | #5CCF98 | 0.773 / 0.132 / 160.1 | 151 | 0.3 | 0.286 | 0.030 |
| Pulse watch (violet) | `--sr-watch` | #6B4C9A | 0.486 / 0.124 / 300.2 | 264 | #C4A9EA | 0.781 / 0.095 / 303.3 | 265 | 3.1 | 0.295 | -0.029 |
| blood-flow violet | `--jg-pf-flow` | #7B3FB8 | 0.504 / 0.184 / 303.1 | 270 | #C58CF0 | 0.734 / 0.151 / 309.3 | 274 | 6.2 | 0.230 | -0.032 |
| load gain green | `--jg-pf-gain` | #15803D | 0.527 / 0.137 / 150.1 | 142 | #4ADE80 | 0.800 / 0.182 / 151.7 | 142 | 1.6 | 0.273 | 0.045 |
| legacy --green | `--green` | #4FDB8E | 0.797 / 0.164 / 155.5 | 147 | #4FDB8E | 0.797 / 0.164 / 155.5 | 147 | 0.0 | 0.000 | 0.000 |
| legacy --red | `--red` | #E84F4F | 0.638 / 0.189 / 24.2 | 0 | #E84F4F | 0.638 / 0.189 / 24.2 | 0 | 0.0 | 0.000 | 0.000 |
| legacy --amber | `--amber` | #F5A623 | 0.784 / 0.159 / 73.0 | 37 | #F5A623 | 0.784 / 0.159 / 73.0 | 37 | 0.0 | 0.000 | 0.000 |
| legacy --yellow | `--yellow` | #FCD661 | 0.887 / 0.141 / 91.3 | 45 | #FCD661 | 0.887 / 0.141 / 91.3 | 45 | 0.0 | 0.000 | 0.000 |
| chart-4 sky | `--chart-4` | #0EA5E9 | 0.685 / 0.148 / 237.3 | 199 | #0EA5E9 | 0.685 / 0.148 / 237.3 | 199 | 0.0 | 0.000 | 0.000 |
| chart-5 amber | `--chart-5` | #F59E0B | 0.769 / 0.165 / 70.1 | 38 | #F59E0B | 0.769 / 0.165 / 70.1 | 38 | 0.0 | 0.000 | 0.000 |
| Learning pull | `--wk-cat-pull` | #0A548B | 0.435 / 0.112 / 248.0 | 206 | #38BDF8 | 0.754 / 0.139 / 232.7 | 198 | 15.4 | 0.319 | 0.027 |

#### 2b. Hue order and gaps of the core semantic families (OKLCH h)

| Mode | Order and gaps |
|---|---|
| Light | crimson 17.6° →27.5°→ go orange 45.0° →0.6°→ hero orange 45.6° →21.3°→ amber warn 66.9° →10.0°→ gold star 76.9° →82.8°→ ok green 159.8° →88.3°→ blue 248.0° →55.1°→ blood-flow violet 303.1° →42.0°→ plum 345.2° →32.4°→ crimson |
| Dark | crimson 9.0° →36.0°→ orange 45.0° (hero = go) →39.4°→ amber warn 84.4° →0.1°→ gold star 84.6° →95.6°→ ok green 180.2° →66.7°→ blue 246.9° →62.4°→ violet 309.3° →32.3°→ plum 341.6° →27.4°→ crimson |

For the five meaning colours alone (crimson, orange, green, blue, plum), the light-mode gaps are 27.4°, 114.8°, 88.2°, 97.2° and 32.4°. Even spacing would be 72°.

#### 2c. Navy against orange and other key pairs (Δh in three spaces)

| Pair | OKLCH | CIELAB h_ab | HSL |
|---|---|---|---|
| `--chrome` #002341 vs `--eq-go` #F36D21 | 156.2° | 139.0° | 174.0° |
| `--primary` vs go | 157.0° light / 158.1° dark | 141.1° / 149.0° | 176.1° / 173.5° |
| `--foreground` (navy ink) vs go | 155.4° | 146.5° | 171.7° |
| crimson vs plum | 32.4° light / 27.4° dark | | |
| hero vs crimson | 28.0° light / 36.0° dark | | |
| destructive red vs Critical crimson | 12.0° light / 11.8° dark | | |
| ok vs crimson | 142.2° light / 171.2° dark | | |

The OKLCH complement of `--chrome` (248.9°) is 68.9°; `--eq-go` sits at 45.0°, about 24° short of it, towards red. The repo's own comment treats them as complements: "Orange and navy are complements, so a low-alpha orange wash over the navy cancels to grey" ([equipment.tokens.css L143-149](../../src/features/equipment/equipment.tokens.css#L143)). Measured, the 16% logo-orange wash over the dark card is #383439 at C 0.010, which supports the practical claim even though the hues are 156° rather than 180° apart.

#### 2d. Ramp evenness (OKLab L), from table 1b

| Ramp | ΔL min | ΔL max | Mean | SD | CV | L span | Mean C | Max C | Hue range |
|---|---|---|---|---|---|---|---|---|---|
| Light `--n-*` | 0.034 (50→100) | 0.170 (400→500) | 0.076 | 0.048 | 63% | 0.755 | 0.028 | 0.045 | 241.7-252.9° |
| Dark `--n-*` | 0.028 (50→100) | 0.146 (500→600) | 0.075 | 0.035 | 47% | 0.755 | 0.030 | 0.046 | 244.7-255.5° |
| Tailwind slate v3 | 0.016 | 0.158 | 0.086 | 0.043 | 51% | 0.855 | 0.028 | 0.041 | 247.9-265.8° |

- Both ramps are monotonic, which the repo requires: "50 is always the lightest rung, 950 always the darkest" ([index.css L247-250](../../src/index.css#L247); [neutral-ramp.test.ts](../../src/neutral-ramp.test.ts)).
- Light rung 400 (#8794A1) is 2.46:1 on the ground. It is "NOT a text colour … cannot be darkened without colliding with slate-500" ([index.css L254-256](../../src/index.css#L254)). That is where the light ramp's biggest L jumps sit (300→400 0.159, 400→500 0.170).

#### 2e. Dark chroma relative to slate, rung by rung (C_dark / C_slate)

| Rung | 50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | 950 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Ratio | 1.82 | 1.42 | 1.16 | 0.98 | 0.87 | 0.87 | 1.09 | 1.13 | 1.23 | 1.16 | 0.97 |

The surfaces dark mode actually paints:

| Surface | Hex | L | C | h |
|---|---|---|---|---|
| Page | #0A1C2C | 0.220 | 0.040 | 247.5° |
| Card | #14293D | 0.274 | 0.046 | 248.8° |
| Popover | #22374B | 0.329 | 0.045 | 248.2° |
| Raised | #203549 | 0.321 | 0.045 | 248.2° |
| Tray | #081725 | 0.199 | 0.035 | 248.3° |

For comparison: Tailwind slate-900 #0F172A is L 0.208, C 0.040, h 265.8°, and slate-950 #020617 is L 0.129, C 0.041, h 264.7°. The frame `--chrome` #002341 is the most saturated neutral in the system: C 0.069, about 1.5× the card.

#### 2f. Dark fills: opaque, and on their accent's hue
The file's claim: "Every fill is OPAQUE and keeps its accent's hue (OKLCH L 0.30-0.36, C 0.05-0.06)" ([equipment.tokens.css L145](../../src/features/equipment/equipment.tokens.css#L145)). Measured, it holds:

| Fill | Hex | L / C / h | Hue gap to its accent |
|---|---|---|---|
| hero | #4B2915 | 0.320 / 0.060 / 49.8° | 4.8° |
| alert | #472024 | 0.300 / 0.060 / 14.9° | 5.9° |
| ok | #113E36 | 0.331 / 0.051 / 179.0° | 1.2° |
| live | #23405C | 0.362 / 0.060 / 249.0° | 2.1° |
| **warn** | #402846 | 0.319 / 0.061 / **319.4°** | **22.2°, towards violet** (the test allows ≤ 25°, [equipment-tokens.test.ts L487](../../src/features/equipment/equipment-tokens.test.ts#L487)) |

### Inferences
- **The palette is a two-pole design, not a spaced wheel.** A cool navy/blue field (h 247-251° for every neutral, ink, frame and the blue) is set against a warm cluster of red, orange and amber. Green and violet/plum are the only mid-wheel hues.
- **The warm cluster is crowded.** Orange (now/go), crimson (Critical / destructive / rep quality), amber (several cautions) and gold (the star) share about 60° of hue. They are separated mainly by lightness and chroma, and that is exactly where the CVD checks in §4 show them collapsing.
- **"Complementary" holds only on the HSL wheel.** In OKLCH and CIELAB the logo orange sits on the red side of the navy's true complement (amber). That pushes the orange towards the crimson that Critical owns, which is why the repo treats hero-versus-crimson as its most delicate pair.
- **The dark navy reads as "navy, not grey" mainly through lightness and hue.** It is lifted out of near-black (L 0.13 to 0.22) and turned off violet (h 260-266° to about 248°); chroma rises only modestly. Visually, that is a small change in saturation and a large change in lightness.
- **The uneven ΔL in the ramps is inherited**, not new: Tailwind slate is equally uneven. The light ramp's crowded top (50, 100 and 200 within 0.071 L) is deliberate. 50, 100 and 200 are the inset, the ground and the hairline.

### Gaps
- No perceptual-uniformity target (for example equal ΔL or equal ΔE00 per step) is documented in the repo, so "uneven" is measured against even spacing, not against a stated design goal.

## 3. Contrast of every meaningful pairing: WCAG 2.x ratio and APCA Lc, in both modes

### Takeaway
**Measured against what the repo checks** (words 4.5:1, edges and icons 3:1), the core, Hub and session pairs pass in both modes, with one exception: a control edge on the light page ground. The repo's guard tests measure exactly these pairs.

**Real failures sit outside the guarded set:**
- the legacy pigments in live use: the bell's light "Urgent" chip at 1.70:1, `text-red` at 3.42:1 / 3.30:1;
- the `--chart-2/4/5` marks in light (1.98-2.76:1);
- white on the retired orange in the calendar avatars and the progress report (2.99-3.55:1);
- the light `--eq-border-strong` / `--jg-control-edge` on the page ground (2.94:1) and on a pressed surface (2.72:1);
- the light `--rb-caution-edge` (2.06:1);
- AJ's light `--jg-pf-skip` (3.99:1) and `--jg-pf-practice` (4.495:1) bubbles.

**APCA tells a different story for dark mode.** Of 132 dark text pairs, 66 pass WCAG 4.5:1 but fall under Lc 60. Light mode has only 7 such pairs.
- The dark muted ink #9DADBE on a card is 6.47:1 but Lc −53.4.
- The dark blue link #65ABE9 on a card is 6.05:1 but Lc −50.5.
- The dark Critical crimson on a card is 5.31:1 but Lc −45.2.
- Navy words on the logo orange (Start session) are 6.05:1 but only Lc 46.9 in both modes.
- The light now pill (navy on #D45A06) is 4.53:1 but Lc 36.4.

**Body copy is strong in both modes:** Lc 95.0 light and −88.2 dark on a card.

### Cited Findings

#### 3a. Pass and fail counts over 384 measured pairs
Kinds: text = 4.5:1 and Lc 60; ui = 3:1 and Lc 30; decor is reported only. The counts include, on purpose, pairs the rules forbid (white on orange, `--eq-live` words on its fill) to show why they are forbidden.

| Mode and kind | Pairs | Under WCAG | Under APCA | Under APCA only (WCAG passes) |
|---|---|---|---|---|
| Light text | 136 | 15 | 15 | 7 |
| Dark text | 132 | 13 | 75 | 66 |
| Light ui | 44 | 13 | 2 | 0 |
| Dark ui | 41 | 2 | 10 | 8 |

#### 3b. Highlights, checked against the comments' claims
Every ratio written in the CSS comments that was checked agrees with the measurement to within rounding. Examples:
- `--foreground` 11.16 on the page and 12.97 on a card (comment "11.2:1; 13.0:1");
- dark `--foreground` 11.89 on a card and 13.83 on the page ("11.9:1; 13.8:1");
- `--cta-foreground` on `--cta` 6.05 ("6.05:1"), and white on it 2.99 ("2.99");
- `--chrome-ink` 14.58 ("14.6:1"), `--chrome-ink-2` 8.56 ("8.6:1"), `--chrome-here` 6.50 ("6.5:1"), `--chrome-go` 5.33 ("5.3:1"), `--chrome-go-fill` icon 4.93 ("4.9:1");
- the light slate rungs 4.95 / 6.44 / 8.28 / 11.16, and dark slate-400 / 500 / 300 at 6.47 / 4.53 / 9.58, exactly as written at [index.css L251-258](../../src/index.css#L251).

#### 3c. Failures that matter, against the repo's own rules (from the full table)

**Legacy pigments in live use:**
- **Notification bell "Urgent" chip** (`text-amber` on `bg-amber/15` over the card): light 1.70:1, Lc 27.1. In dark it is 5.58:1, but the wash composites to a grey #363C39 (OKLCH C 0.009, h 167.5°), the orange-wash-greys-out failure the Navy Frame forbids. The machine-flag icon (`bg-amber/10`) is 1.75:1 in light. ([NotificationBell.tsx L264, L379](../../src/features/notifications/NotificationBell.tsx#L264))
- **`SyncStatusBadge` `text-red` error words:** 3.42:1 / Lc 58.0 in light; 3.30:1 / Lc −31.5 in dark on a popover; 4.00 on the dark card. Its status dots `bg-green` / `bg-amber` are 1.63 and 1.87:1 in light (non-text, need 3:1).

**Chart series in light:**
- `--chart-2` #F36D21 is 2.76:1, `--chart-4` #0EA5E9 is 2.56:1 and `--chart-5` #F59E0B is 1.98:1 on the card.
- In dark, `--chart-3` #68717A is 2.99:1.
- These tokens have about 8 readers (grep: chart-1 ×1, -2 ×1, -3 ×2, -4 ×2, -5 ×2).

**White on orange, outside the rules' reach:**
- calendar trainer avatar, white on tone-0 `--t0-solid`: 3.55:1 light (#EF5302) and 2.99:1 dark (#F36D21). The round doc already flags it as breaking "no white words on any orange" ([navy-frame round doc, open question 8](../../docs/rounds/2026-10-04-navy-frame.md));
- progress report, `--pr-hero-on` white on `--pr-hero` #F06C22: 3.06:1. This is an always-navy screen on the exempt list.

**Edges under 3:1:**
- light `--eq-border-strong` / `--jg-control-edge` #7A8694 on the page ground #DEE6EE: 2.94:1. On the pressed `--eq-surface-3` it is 2.72:1. The round doc records the 2.94 as open question 4 ([navy-frame round doc L196](../../docs/rounds/2026-10-04-navy-frame.md)).
- light `--rb-caution-edge` #D9A45C on a card: 2.06:1; dark #8A5300 is 2.35:1.
- light `--input` on the page ground passes at 3.15, by a hair.

**AJ's Journey-look bubbles (light), if they carry words:**
- `--jg-pf-skip` on its bg: 3.99:1;
- `--jg-pf-practice` on its bg: 4.495:1, which rounds to 4.50 but is under 4.5.

**Faint ink as words:** `--eq-ink-faint` is 3.17:1 light and 3.41:1 dark on a card. The comments call it "decorative only", and KNOWN-TRAPS says "about 120 older rules elsewhere still break it" ([KNOWN-TRAPS.md L437](../../docs/KNOWN-TRAPS.md#L437)).

**The dark rail edge:** dark `--eq-rail-booked` #4675A4 is 3.07:1 on a card (passes WCAG) but Lc −24.8. It is also only 1.11:1 (dark) and 1.01:1 (light) against the default grey card edge `--eq-ink-faint`: the "quiet blue edge" differs from the grey edge by hue alone (see §4).

**The light muted ink on the tray** is 4.42:1 (Lc 58.8). The type-and-depth rule avoids it on purpose: words on a tray are ink-2 (5.95:1). See [KNOWN-TRAPS.md, Type and depth](../../docs/KNOWN-TRAPS.md#L443).

#### 3d. APCA-only weakness in dark (WCAG passes), the most-used pairs

| Pair (dark) | WCAG | Lc |
|---|---|---|
| muted-foreground on card | 6.47 | −53.4 |
| muted-foreground on popover | 5.33 | −50.3 |
| muted-foreground on muted | 5.49 | −50.9 |
| primary (link) on card | 6.05 | −50.5 |
| primary on popover | 4.99 | −47.3 |
| Save label: navy #071727 on #65ABE9 | 7.37 | 54.6 |
| destructive #FF8C8C on card | 6.63 | −55.0 |
| destructive on its 20% tint | 4.67 | −48.8 |
| `--eq-hero-text` #FF9455 on card | 6.80 | −56.2 |
| `--eq-alert` on card | 5.31 | −45.2 |
| `--eq-warn` on card | 5.97 | −49.8 |
| `--jg-pf-date-sub` on band | 4.75 | −42.5 |
| `--jg-pf-now` on band | 5.32 | −47.8 |
| FORD pillar inks on their fills | 6.9-7.3 | −52 to −57.5 |
| Pulse red on fill | 6.36 | −50.4 |
| Learning pull text (Tailwind sky) on its wash | 5.49 | −53.2 |

The dark ink ladder:
- `--ink-d2` #B8C6D3 is Lc −67.6;
- `--ink-d3` (= muted) is Lc −53.4;
- `--n-500` #7E90A3 is 4.53:1 but only Lc −38.1;
- `--chrome-ink-2` on the frame is Lc −64.7.

#### 3e. Navy-on-orange is weak in APCA in both modes
| Pair | WCAG | Lc |
|---|---|---|
| `--eq-go-on` on `--eq-go` | 6.05 | 46.9 |
| Now pill: `--eq-go-on` on light `--eq-hero` #D45A06 | 4.535 | 36.4 |
| Now pill: `--eq-go-on` on dark `--eq-hero` #F36D21 | 6.05 | 46.9 |
| White on the logo orange (forbidden) | 2.99 | −61.1 |

On the logo orange, white text gives the higher APCA magnitude (−61.1 against 46.9), even though its WCAG ratio is 2.99 against navy's 6.05. This is the known WCAG-versus-APCA disagreement on mid-luminance oranges: APCA reads light-on-orange as more legible than WCAG 2 does.

#### 3f. Full measured table (384 rows)
"BG layers" lists the surface stack, bottom first. Flags show WCAG under the floor for the kind and APCA under Lc 60 / 30, plus an advisory when a text pair sits between Lc 60 and Lc 75 (APCA's body-column minimum).

| Mode | Pair | FG (resolved) | BG layers (resolved) | Kind | WCAG | APCA Lc | Flags |
|---|---|---|---|---|---|---|---|
| light | body copy on page | `--foreground` #192D41 | `--background` #DEE6EE | text | 11.16 | 85.3 |  |
| dark | body copy on page | `--foreground` #DFE7EF | `--background` #0A1C2C | text | 13.83 | -90.1 |  |
| light | body copy on card | `--foreground` #192D41 | `--card` #F3F6F9 | text | 12.97 | 95.0 |  |
| dark | body copy on card | `--foreground` #DFE7EF | `--card` #14293D | text | 11.89 | -88.2 |  |
| light | words on popover | `--popover-foreground` #192D41 | `--popover` #F3F6F9 | text | 12.97 | 95.0 |  |
| dark | words on popover | `--popover-foreground` #DFE7EF | `--popover` #22374B | text | 9.80 | -85.1 |  |
| light | words on raised control | `--foreground` #192D41 | `--raised` #F8FAFC | text | 13.44 | 97.5 |  |
| dark | words on raised control | `--foreground` #DFE7EF | `--raised` #203549 | text | 10.09 | -85.6 |  |
| light | words in a well | `--foreground` #192D41 | `--well` #E4EBF3 | text | 11.71 | 88.3 |  |
| dark | words in a well | `--foreground` #DFE7EF | `--well` #0D2235 | text | 12.96 | -89.3 |  |
| light | words on tray | `--foreground` #192D41 | `--tray` #D1DAE4 | text | 9.95 | 78.4 |  |
| dark | words on tray | `--foreground` #DFE7EF | `--tray` #081725 | text | 14.50 | -90.6 |  |
| light | words on muted/accent fill | `--foreground` #192D41 | `--muted` #E4EBF3 | text | 11.71 | 88.3 |  |
| dark | words on muted/accent fill | `--foreground` #DFE7EF | `--muted` #203549 | text | 10.09 | -85.6 |  |
| light | muted-foreground on card | `--muted-foreground` #546271 | `--card` #F3F6F9 | text | 5.76 | 75.5 |  |
| dark | muted-foreground on card | `--muted-foreground` #9DADBE | `--card` #14293D | text | 6.47 | -53.4 | Lc<60 |
| light | muted-foreground on page | `--muted-foreground` #546271 | `--background` #DEE6EE | text | 4.95 | 65.7 | Lc<75 (body-column min) |
| dark | muted-foreground on page | `--muted-foreground` #9DADBE | `--background` #0A1C2C | text | 7.53 | -55.3 | Lc<60 |
| light | muted-foreground on muted | `--muted-foreground` #546271 | `--muted` #E4EBF3 | text | 5.20 | 68.8 | Lc<75 (body-column min) |
| dark | muted-foreground on muted | `--muted-foreground` #9DADBE | `--muted` #203549 | text | 5.49 | -50.9 | Lc<60 |
| light | muted-foreground on popover | `--muted-foreground` #546271 | `--popover` #F3F6F9 | text | 5.76 | 75.5 |  |
| dark | muted-foreground on popover | `--muted-foreground` #9DADBE | `--popover` #22374B | text | 5.33 | -50.3 | Lc<60 |
| light | muted-foreground in well | `--muted-foreground` #546271 | `--well` #E4EBF3 | text | 5.20 | 68.8 | Lc<75 (body-column min) |
| dark | muted-foreground in well | `--muted-foreground` #9DADBE | `--well` #0D2235 | text | 7.06 | -54.5 | Lc<60 |
| light | muted-foreground on raised | `--muted-foreground` #546271 | `--raised` #F8FAFC | text | 5.97 | 78.0 |  |
| dark | muted-foreground on raised | `--muted-foreground` #9DADBE | `--raised` #203549 | text | 5.49 | -50.9 | Lc<60 |
| light | muted-foreground on tray | `--muted-foreground` #546271 | `--tray` #D1DAE4 | text | 4.42 | 58.8 | WCAG<4.5, Lc<60 |
| dark | muted-foreground on tray | `--muted-foreground` #9DADBE | `--tray` #081725 | text | 7.89 | -55.9 | Lc<60 |
| light | ink-d2 on card | `--ink-d2` #3F4F60 | `--bg-dark-2` #F3F6F9 | text | 7.75 | 83.3 |  |
| dark | ink-d2 on card | `--ink-d2` #B8C6D3 | `--bg-dark-2` #14293D | text | 8.52 | -67.6 | Lc<75 (body-column min) |
| light | ink-d2 on tray (tab words) | `--ink-d2` #3F4F60 | `--tray` #D1DAE4 | text | 5.95 | 66.7 | Lc<75 (body-column min) |
| dark | ink-d2 on tray (tab words) | `--ink-d2` #B8C6D3 | `--tray` #081725 | text | 10.40 | -70.1 | Lc<75 (body-column min) |
| light | ink-d3 on card | `--ink-d3` #546271 | `--bg-dark-2` #F3F6F9 | text | 5.76 | 75.5 |  |
| dark | ink-d3 on card | `--ink-d3` #9DADBE | `--bg-dark-2` #14293D | text | 6.47 | -53.4 | Lc<60 |
| light | ink-d3 on page | `--ink-d3` #546271 | `--bg-dark` #DEE6EE | text | 4.95 | 65.7 | Lc<75 (body-column min) |
| dark | ink-d3 on page | `--ink-d3` #9DADBE | `--bg-dark` #0A1C2C | text | 7.53 | -55.3 | Lc<60 |
| light | Save label: primary-foreground on primary | `--primary-foreground` #FFFFFF | `--primary` #0A548B | text | 7.91 | -91.7 |  |
| dark | Save label: primary-foreground on primary | `--primary-foreground` #071727 | `--primary` #65ABE9 | text | 7.37 | 54.6 | Lc<60 |
| light | blue words/link: primary on card | `--primary` #0A548B | `--card` #F3F6F9 | text | 7.30 | 81.3 |  |
| dark | blue words/link: primary on card | `--primary` #65ABE9 | `--card` #14293D | text | 6.05 | -50.5 | Lc<60 |
| light | primary on page | `--primary` #0A548B | `--background` #DEE6EE | text | 6.28 | 71.6 | Lc<75 (body-column min) |
| dark | primary on page | `--primary` #65ABE9 | `--background` #0A1C2C | text | 7.04 | -52.4 | Lc<60 |
| light | primary on popover | `--primary` #0A548B | `--popover` #F3F6F9 | text | 7.30 | 81.3 |  |
| dark | primary on popover | `--primary` #65ABE9 | `--popover` #22374B | text | 4.99 | -47.3 | Lc<60 |
| light | accent-foreground on accent | `--accent-foreground` #0A548B | `--accent` #E4EBF3 | text | 6.59 | 74.6 | Lc<75 (body-column min) |
| dark | accent-foreground on accent | `--accent-foreground` #98CAF9 | `--accent` #203549 | text | 7.29 | -65.6 | Lc<75 (body-column min) |
| light | secondary-foreground on secondary | `--secondary-foreground` #FFFFFF | `--secondary` #546271 | text | 6.25 | -86.3 |  |
| dark | secondary-foreground on secondary | `--secondary-foreground` #FFFFFF | `--secondary` #52657A | text | 6.00 | -85.2 |  |
| light | navy words on logo orange (cta-foreground on cta) | `--cta-foreground` #071727 | `--cta` #F36D21 | text | 6.05 | 46.9 | Lc<60 |
| dark | navy words on logo orange (cta-foreground on cta) | `--cta-foreground` #071727 | `--cta` #F36D21 | text | 6.05 | 46.9 | Lc<60 |
| light | WHITE on logo orange (forbidden) | `#FFFFFF` #FFFFFF | `--cta` #F36D21 | text | 2.99 | -61.1 | WCAG<4.5, Lc<75 (body-column min) |
| dark | WHITE on logo orange (forbidden) | `#FFFFFF` #FFFFFF | `--cta` #F36D21 | text | 2.99 | -61.1 | WCAG<4.5, Lc<75 (body-column min) |
| light | white on cta-strong | `#FFFFFF` #FFFFFF | `--cta-strong` #B04000 | text | 5.87 | -83.6 |  |
| dark | white on cta-strong | `#FFFFFF` #FFFFFF | `--cta-strong` #B04000 | text | 5.87 | -83.6 |  |
| light | destructive words on card | `--destructive` #BB271B | `--card` #F3F6F9 | text | 5.66 | 73.4 | Lc<75 (body-column min) |
| dark | destructive words on card | `--destructive` #FF8C8C | `--card` #14293D | text | 6.63 | -55.0 | Lc<60 |
| light | destructive on popover (Sign out) | `--destructive` #BB271B | `--popover` #F3F6F9 | text | 5.66 | 73.4 | Lc<75 (body-column min) |
| dark | destructive on popover (Sign out) | `--destructive` #FF8C8C | `--popover` #22374B | text | 5.47 | -51.9 | Lc<60 |
| light | destructive on page | `--destructive` #BB271B | `--background` #DEE6EE | text | 4.87 | 63.6 | Lc<75 (body-column min) |
| dark | destructive on page | `--destructive` #FF8C8C | `--background` #0A1C2C | text | 7.72 | -56.9 | Lc<60 |
| light | destructive-foreground on destructive | `--destructive-foreground` #FFFFFF | `--destructive` #BB271B | text | 6.14 | -84.3 |  |
| dark | destructive-foreground on destructive | `--destructive-foreground` #071727 | `--destructive` #FF8C8C | text | 8.08 | 58.9 | Lc<60 |
| light | legacy --green as text on card | `--green` #4FDB8E | `--card` #F3F6F9 | text | 1.63 | 26.6 | WCAG<4.5, Lc<60 |
| dark | legacy --green as text on card | `--green` #4FDB8E | `--card` #14293D | text | 8.38 | -67.1 | Lc<75 (body-column min) |
| light | legacy --red as text on card | `--red` #E84F4F | `--card` #F3F6F9 | text | 3.42 | 58.0 | WCAG<4.5, Lc<60 |
| dark | legacy --red as text on card | `--red` #E84F4F | `--card` #14293D | text | 4.00 | -34.6 | WCAG<4.5, Lc<60 |
| light | legacy --amber as text on card | `--amber` #F5A623 | `--card` #F3F6F9 | text | 1.87 | 33.4 | WCAG<4.5, Lc<60 |
| dark | legacy --amber as text on card | `--amber` #F5A623 | `--card` #14293D | text | 7.33 | -59.8 | Lc<60 |
| light | legacy --yellow as text on card | `--yellow` #FCD661 | `--card` #F3F6F9 | text | 1.30 | 13.9 | WCAG<4.5, Lc<60 |
| dark | legacy --yellow as text on card | `--yellow` #FCD661 | `--card` #14293D | text | 10.56 | -80.5 |  |
| light | mb-state-scheduled #94A3B8 on card | `--mb-state-scheduled` #94A3B8 | `--card` #F3F6F9 | ui | 2.36 | 44.6 | WCAG<3 |
| dark | mb-state-scheduled #94A3B8 on card | `--mb-state-scheduled` #94A3B8 | `--card` #14293D | ui | 5.79 | -48.3 |  |
| light | legacy --green as mark on card | `--green` #4FDB8E | `--card` #F3F6F9 | ui | 1.63 | 26.6 | WCAG<3, Lc<30 |
| dark | legacy --green as mark on card | `--green` #4FDB8E | `--card` #14293D | ui | 8.38 | -67.1 |  |
| light | legacy --amber as mark on card | `--amber` #F5A623 | `--card` #F3F6F9 | ui | 1.87 | 33.4 | WCAG<3 |
| dark | legacy --amber as mark on card | `--amber` #F5A623 | `--card` #14293D | ui | 7.33 | -59.8 |  |
| light | legacy --yellow as mark on card | `--yellow` #FCD661 | `--card` #F3F6F9 | ui | 1.30 | 13.9 | WCAG<3, Lc<30 |
| dark | legacy --yellow as mark on card | `--yellow` #FCD661 | `--card` #14293D | ui | 10.56 | -80.5 |  |
| light | legacy --red as mark on card | `--red` #E84F4F | `--card` #F3F6F9 | ui | 3.42 | 58.0 |  |
| dark | legacy --red as mark on card | `--red` #E84F4F | `--card` #14293D | ui | 4.00 | -34.6 |  |
| light | chart-1 mark on card | `--chart-1` #0A548B | `--card` #F3F6F9 | ui | 7.30 | 81.3 |  |
| dark | chart-1 mark on card | `--chart-1` #65ABE9 | `--card` #14293D | ui | 6.05 | -50.5 |  |
| light | chart-2 mark on card | `--chart-2` #F36D21 | `--card` #F3F6F9 | ui | 2.76 | 50.2 | WCAG<3 |
| dark | chart-2 mark on card | `--chart-2` #F36D21 | `--card` #14293D | ui | 4.96 | -42.6 |  |
| light | chart-3 mark on card | `--chart-3` #68717A | `--card` #F3F6F9 | ui | 4.58 | 68.7 |  |
| dark | chart-3 mark on card | `--chart-3` #68717A | `--card` #14293D | ui | 2.99 | -23.9 | WCAG<3, Lc<30 |
| light | chart-4 mark on card | `--chart-4` #0EA5E9 | `--card` #F3F6F9 | ui | 2.56 | 47.2 | WCAG<3 |
| dark | chart-4 mark on card | `--chart-4` #0EA5E9 | `--card` #14293D | ui | 5.36 | -45.6 |  |
| light | chart-5 mark on card | `--chart-5` #F59E0B | `--card` #F3F6F9 | ui | 1.98 | 36.2 | WCAG<3 |
| dark | chart-5 mark on card | `--chart-5` #F59E0B | `--card` #14293D | ui | 6.91 | -57.0 |  |
| light | field border (input) on card | `--input` #748190 | `--card` #F3F6F9 | ui | 3.66 | 61.5 |  |
| dark | field border (input) on card | `--input` #6E8397 | `--card` #14293D | ui | 3.79 | -31.6 |  |
| light | input on page | `--input` #748190 | `--background` #DEE6EE | ui | 3.15 | 51.7 |  |
| dark | input on page | `--input` #6E8397 | `--background` #0A1C2C | ui | 4.41 | -33.5 |  |
| light | input on raised | `--input` #748190 | `--raised` #F8FAFC | ui | 3.80 | 63.9 |  |
| dark | input on raised | `--input` #6E8397 | `--raised` #203549 | ui | 3.21 | -29.1 | Lc<30 |
| light | input in a well | `--input` #748190 | `--well` #E4EBF3 | ui | 3.31 | 54.7 |  |
| dark | input in a well | `--input` #6E8397 | `--well` #0D2235 | ui | 4.13 | -32.7 |  |
| light | focus ring on card | `--ring` #0A548B | `--card` #F3F6F9 | ui | 7.30 | 81.3 |  |
| dark | focus ring on card | `--ring` #65ABE9 | `--card` #14293D | ui | 6.05 | -50.5 |  |
| light | focus ring on page | `--ring` #0A548B | `--background` #DEE6EE | ui | 6.28 | 71.6 |  |
| dark | focus ring on page | `--ring` #65ABE9 | `--background` #0A1C2C | ui | 7.04 | -52.4 |  |
| light | border (decorative) on card | `--border` #D1DAE4 | `--card` #F3F6F9 | decor | 1.30 | 14.3 |  |
| dark | border (decorative) on card | `--border` #2B3E50 | `--card` #14293D | decor | 1.35 | 0.0 |  |
| light | divider (rgba) over card | `--divider` #DDE2E7 | `--card` #F3F6F9 | decor | 1.20 | 9.5 |  |
| dark | divider (rgba) over card | `--divider` #21374C | `--card` #14293D | decor | 1.21 | 0.0 |  |
| light | panel edge (rgba) over page | `--edge` #C4CED8 | `--background` #DEE6EE | decor | 1.27 | 11.5 |  |
| dark | panel edge (rgba) over page | `--edge` #192D3E | `--background` #0A1C2C | decor | 1.22 | 0.0 |  |
| light | edge-control (rgba) on tray | `--edge-control` #A1ADBA | `--tray` #D1DAE4 | decor | 1.61 | 22.7 |  |
| dark | edge-control (rgba) on tray | `--edge-control` #1F3041 | `--tray` #081725 | decor | 1.34 | 0.0 |  |
| light | n-400 (non-text grey) on page | `--n-400` #8794A1 | `--background` #DEE6EE | ui | 2.46 | 42.6 | WCAG<3 |
| dark | n-400 (non-text grey) on page | `--n-400` #9DADBE | `--background` #0A1C2C | ui | 7.53 | -55.3 |  |
| light | n-300 on card | `--n-300` #BBC5D1 | `--card` #F3F6F9 | decor | 1.61 | 26.2 |  |
| dark | n-300 on card | `--n-300` #C6D1DC | `--card` #14293D | decor | 9.58 | -74.4 |  |
| light | sidebar-foreground on sidebar | `--sidebar-foreground` #0F172A | `--sidebar` #FFFFFF | text | 17.85 | 104.6 |  |
| dark | sidebar-foreground on sidebar | `--sidebar-foreground` #F8FAFC | `--sidebar` #0F172A | text | 17.06 | -103.3 |  |
| light | sidebar-primary on sidebar | `--sidebar-primary` #115E8D | `--sidebar` #FFFFFF | text | 6.98 | 83.7 |  |
| dark | sidebar-primary on sidebar | `--sidebar-primary` #38BDF8 | `--sidebar` #0F172A | text | 8.33 | -59.5 | Lc<60 |
| dark | popover-input on popover-raised (in dialogs) | `--popover-input` #7D92A6 | `--popover-raised` #283E54 | ui | 3.43 | -33.7 |  |
| dark | foreground on popover-raised | `--foreground` #DFE7EF | `--popover-raised` #283E54 | text | 8.82 | -83.0 |  |
| light | destructive on its 10% tint over card | `--destructive` #BB271B | `--card` + `rgba(187,39,27,0.10)` #EDE1E3 | text | 4.83 | 63.1 | Lc<75 (body-column min) |
| dark | destructive on its 20% tint over card | `--destructive` #FF8C8C | `--card` + `rgba(255,140,140,0.20)` #433D4D | text | 4.67 | -48.8 | Lc<60 |
| dark | dark slate-300 words on card | `--n-300` #C6D1DC | `--card` #14293D | text | 9.58 | -74.4 | Lc<75 (body-column min) |
| dark | dark slate-400 words on card | `--n-400` #9DADBE | `--card` #14293D | text | 6.47 | -53.4 | Lc<60 |
| dark | dark slate-500 words on card | `--n-500` #7E90A3 | `--card` #14293D | text | 4.53 | -38.1 | Lc<60 |
| dark | dark slate-600 words on card | `--n-600` #52657A | `--card` #14293D | text | 2.48 | -18.4 | WCAG<4.5, Lc<60 |
| dark | dark slate-700 words on card | `--n-700` #354A5F | `--card` #14293D | text | 1.62 | -7.9 | WCAG<4.5, Lc<60 |
| dark | dark slate-900 words on card | `--n-900` #14293D | `--card` #14293D | text | 1.00 | 0.0 | WCAG<4.5, Lc<60 |
| light | light slate-400 words on page | `--n-400` #8794A1 | `--background` #DEE6EE | text | 2.46 | 42.6 | WCAG<4.5, Lc<60 |
| light | light slate-500 words on page | `--n-500` #546271 | `--background` #DEE6EE | text | 4.95 | 65.7 | Lc<75 (body-column min) |
| light | light slate-600 words on page | `--n-600` #425162 | `--background` #DEE6EE | text | 6.44 | 72.7 | Lc<75 (body-column min) |
| light | light slate-700 words on page | `--n-700` #314153 | `--background` #DEE6EE | text | 8.28 | 78.8 |  |
| light | light slate-800 words on page | `--n-800` #24374A | `--background` #DEE6EE | text | 9.68 | 82.4 |  |
| light | light slate-900 words on page | `--n-900` #192D41 | `--background` #DEE6EE | text | 11.16 | 85.3 |  |
| light | light slate-950 words on page | `--n-950` #071727 | `--background` #DEE6EE | text | 14.35 | 89.3 |  |
| light | FRAME: chrome-ink (studio name) on chrome | `--chrome-ink` #F2F5F8 | `--chrome` #002341 | text | 14.58 | -98.4 |  |
| light | FRAME: chrome-ink-2 (icons, idle tabs) on chrome | `--chrome-ink-2` #ADC0D4 | `--chrome` #002341 | text | 8.56 | -64.7 | Lc<75 (body-column min) |
| light | FRAME: chrome-ink-2 in search well | `--chrome-ink-2` #ADC0D4 | `--chrome` + `--chrome-field` #143550 | text | 6.83 | -61.4 | Lc<75 (body-column min) |
| light | FRAME: white (iOS clock) on chrome | `#FFFFFF` #FFFFFF | `--chrome` #002341 | text | 15.95 | -105.2 |  |
| light | FRAME: navy icon on tab-you-are-on (chrome on chrome-here) | `--chrome` #002341 | `--chrome-here` #65ABE9 | ui | 6.50 | 52.4 |  |
| light | FRAME: navy icon on orange tab (chrome on chrome-go) | `--chrome` #002341 | `--chrome-go` #F36D21 | ui | 5.33 | 44.8 |  |
| light | FRAME: chrome-here box/ring on chrome | `--chrome-here` #65ABE9 | `--chrome` #002341 | ui | 6.50 | -51.2 |  |
| light | FRAME: chrome-go icon on chrome | `--chrome-go` #F36D21 | `--chrome` #002341 | ui | 5.33 | -43.3 |  |
| light | FRAME: chrome-go icon on chrome-go-fill | `--chrome-go` #F36D21 | `--chrome-go-fill` #3D2112 | ui | 4.93 | -42.4 |  |
| light | FRAME: chrome-go-fill box vs chrome | `--chrome-go-fill` #3D2112 | `--chrome` #002341 | decor | 1.08 | 0.0 |  |
| light | FRAME: chrome-line hairline over chrome | `--chrome-line` #1A3954 | `--chrome` #002341 | decor | 1.33 | 0.0 |  |
| light | FRAME: search well vs chrome | `--chrome-field` #143550 | `--chrome` #002341 | decor | 1.25 | 0.0 |  |
| light | HUB: eq-ink on surface | `--eq-ink` #192D41 | `--eq-surface` #F3F6F9 | text | 12.97 | 95.0 |  |
| dark | HUB: eq-ink on surface | `--eq-ink` #DFE7EF | `--eq-surface` #14293D | text | 11.89 | -88.2 |  |
| light | HUB: eq-ink-2 on surface | `--eq-ink-2` #3F4F60 | `--eq-surface` #F3F6F9 | text | 7.75 | 83.3 |  |
| dark | HUB: eq-ink-2 on surface | `--eq-ink-2` #B8C6D3 | `--eq-surface` #14293D | text | 8.52 | -67.6 | Lc<75 (body-column min) |
| light | HUB: eq-ink-muted on surface | `--eq-ink-muted` #546271 | `--eq-surface` #F3F6F9 | text | 5.76 | 75.5 |  |
| dark | HUB: eq-ink-muted on surface | `--eq-ink-muted` #9DADBE | `--eq-surface` #14293D | text | 6.47 | -53.4 | Lc<60 |
| light | HUB: eq-ink-muted on page (eq-bg) | `--eq-ink-muted` #546271 | `--eq-bg` #DEE6EE | text | 4.95 | 65.7 | Lc<75 (body-column min) |
| dark | HUB: eq-ink-muted on page (eq-bg) | `--eq-ink-muted` #9DADBE | `--eq-bg` #0A1C2C | text | 7.53 | -55.3 | Lc<60 |
| light | HUB: eq-ink-muted on surface-2 | `--eq-ink-muted` #546271 | `--eq-surface-2` #E4EBF3 | text | 5.20 | 68.8 | Lc<75 (body-column min) |
| dark | HUB: eq-ink-muted on surface-2 | `--eq-ink-muted` #9DADBE | `--eq-surface-2` #0D2235 | text | 7.06 | -54.5 | Lc<60 |
| light | HUB: eq-ink-muted on surface-3 | `--eq-ink-muted` #546271 | `--eq-surface-3` #D4DEE8 | text | 4.58 | 61.0 | Lc<75 (body-column min) |
| dark | HUB: eq-ink-muted on surface-3 | `--eq-ink-muted` #9DADBE | `--eq-surface-3` #203549 | text | 5.49 | -50.9 | Lc<60 |
| light | HUB: eq-ink-faint AS TEXT on surface | `--eq-ink-faint` #7F8C99 | `--eq-surface` #F3F6F9 | text | 3.17 | 56.3 | WCAG<4.5, Lc<60 |
| dark | HUB: eq-ink-faint AS TEXT on surface | `--eq-ink-faint` #697B8D | `--eq-surface` #14293D | text | 3.41 | -28.0 | WCAG<4.5, Lc<60 |
| light | HUB: eq-ink-faint as mark on surface | `--eq-ink-faint` #7F8C99 | `--eq-surface` #F3F6F9 | ui | 3.17 | 56.3 |  |
| dark | HUB: eq-ink-faint as mark on surface | `--eq-ink-faint` #697B8D | `--eq-surface` #14293D | ui | 3.41 | -28.0 | Lc<30 |
| light | HUB: eq-ink-faint on page | `--eq-ink-faint` #7F8C99 | `--eq-bg` #DEE6EE | ui | 2.72 | 46.5 | WCAG<3 |
| dark | HUB: eq-ink-faint on page | `--eq-ink-faint` #697B8D | `--eq-bg` #0A1C2C | ui | 3.96 | -30.0 | Lc<30 |
| light | HUB: live-text on surface | `--eq-live-text` #064F89 | `--eq-surface` #F3F6F9 | text | 7.78 | 82.9 |  |
| dark | HUB: live-text on surface | `--eq-live-text` #98CAF9 | `--eq-surface` #14293D | text | 8.59 | -68.1 | Lc<75 (body-column min) |
| light | HUB: live-text on live-fill | `--eq-live-text` #064F89 | `--eq-surface` + `--eq-live-fill` #DBEEFE | text | 7.11 | 76.9 |  |
| dark | HUB: live-text on live-fill | `--eq-live-text` #98CAF9 | `--eq-surface` + `--eq-live-fill` #23405C | text | 6.20 | -62.3 | Lc<75 (body-column min) |
| light | HUB: live-on on live (picked day) | `--eq-live-on` #FFFFFF | `--eq-live` #0A548B | text | 7.91 | -91.7 |  |
| dark | HUB: live-on on live (picked day) | `--eq-live-on` #071727 | `--eq-live` #65ABE9 | text | 7.37 | 54.6 | Lc<60 |
| light | HUB: live (edge/icon) on surface | `--eq-live` #0A548B | `--eq-surface` #F3F6F9 | ui | 7.30 | 81.3 |  |
| dark | HUB: live (edge/icon) on surface | `--eq-live` #65ABE9 | `--eq-surface` #14293D | ui | 6.05 | -50.5 |  |
| light | HUB: live words on live-fill (forbidden pairing) | `--eq-live` #0A548B | `--eq-live-fill` #DBEEFE | text | 6.66 | 75.3 |  |
| dark | HUB: live words on live-fill (forbidden pairing) | `--eq-live` #65ABE9 | `--eq-live-fill` #23405C | text | 4.37 | -44.7 | WCAG<4.5, Lc<60 |
| light | HUB: hero-text on surface | `--eq-hero-text` #B04000 | `--eq-surface` #F3F6F9 | text | 5.41 | 72.7 | Lc<75 (body-column min) |
| dark | HUB: hero-text on surface | `--eq-hero-text` #FF9455 | `--eq-surface` #14293D | text | 6.80 | -56.2 | Lc<60 |
| light | HUB: hero-text on page | `--eq-hero-text` #B04000 | `--eq-bg` #DEE6EE | text | 4.65 | 63.0 | Lc<75 (body-column min) |
| dark | HUB: hero-text on page | `--eq-hero-text` #FF9455 | `--eq-bg` #0A1C2C | text | 7.91 | -58.1 | Lc<60 |
| light | HUB: hero-text on hero-fill | `--eq-hero-text` #B04000 | `--eq-hero-fill` #FFE9D8 | text | 5.00 | 67.6 | Lc<75 (body-column min) |
| dark | HUB: hero-text on hero-fill | `--eq-hero-text` #FF9455 | `--eq-hero-fill` #4B2915 | text | 5.91 | -53.9 | Lc<60 |
| light | HUB: hero-on on hero-text | `--eq-hero-on` #FFFFFF | `--eq-hero-text` #B04000 | text | 5.87 | -83.6 |  |
| dark | HUB: hero-on on hero-text | `--eq-hero-on` #071727 | `--eq-hero-text` #FF9455 | text | 8.29 | 60.1 | Lc<75 (body-column min) |
| light | HUB: go-on on go (Start session) | `--eq-go-on` #071727 | `--eq-go` #F36D21 | text | 6.05 | 46.9 | Lc<60 |
| dark | HUB: go-on on go (Start session) | `--eq-go-on` #071727 | `--eq-go` #F36D21 | text | 6.05 | 46.9 | Lc<60 |
| light | HUB: go-on on hero (now pill) | `--eq-go-on` #071727 | `--eq-hero` #D45A06 | text | 4.53 | 36.4 | Lc<60 |
| dark | HUB: go-on on hero (now pill) | `--eq-go-on` #071727 | `--eq-hero` #F36D21 | text | 6.05 | 46.9 | Lc<60 |
| light | HUB: white on hero (forbidden) | `#FFFFFF` #FFFFFF | `--eq-hero` #D45A06 | text | 3.99 | -71.9 | WCAG<4.5, Lc<75 (body-column min) |
| dark | HUB: white on hero (forbidden) | `#FFFFFF` #FFFFFF | `--eq-hero` #F36D21 | text | 2.99 | -61.1 | WCAG<4.5, Lc<75 (body-column min) |
| light | HUB: hero mark (now line) on page | `--eq-hero` #D45A06 | `--eq-bg` #DEE6EE | ui | 3.16 | 51.0 |  |
| dark | HUB: hero mark (now line) on page | `--eq-hero` #F36D21 | `--eq-bg` #0A1C2C | ui | 5.78 | -44.5 |  |
| light | HUB: hero mark over your lane (mine) | `--eq-hero` #D45A06 | `--eq-mine` #D3E2F1 | ui | 3.02 | 48.2 |  |
| dark | HUB: hero mark over your lane (mine) | `--eq-hero` #F36D21 | `--eq-mine` #0E243A | ui | 5.27 | -43.3 |  |
| light | HUB: hero mark on surface | `--eq-hero` #D45A06 | `--eq-surface` #F3F6F9 | ui | 3.68 | 60.7 |  |
| dark | HUB: hero mark on surface | `--eq-hero` #F36D21 | `--eq-surface` #14293D | ui | 4.96 | -42.6 |  |
| light | HUB: hero mark on live-fill | `--eq-hero` #D45A06 | `--eq-live-fill` #DBEEFE | ui | 3.36 | 54.7 |  |
| dark | HUB: hero mark on live-fill | `--eq-hero` #F36D21 | `--eq-live-fill` #23405C | ui | 3.58 | -36.8 |  |
| light | HUB: hero AS TEXT on surface | `--eq-hero` #D45A06 | `--eq-surface` #F3F6F9 | text | 3.68 | 60.7 | WCAG<4.5, Lc<75 (body-column min) |
| dark | HUB: hero AS TEXT on surface | `--eq-hero` #F36D21 | `--eq-surface` #14293D | text | 4.96 | -42.6 | Lc<60 |
| light | HUB: rail-booked edge on surface | `--eq-rail-booked` #668FBA | `--eq-surface` #F3F6F9 | ui | 3.12 | 55.6 |  |
| dark | HUB: rail-booked edge on surface | `--eq-rail-booked` #4675A4 | `--eq-surface` #14293D | ui | 3.07 | -24.8 | Lc<30 |
| light | HUB: rail-booked vs ink-faint (coming-up vs default edge) | `--eq-rail-booked` #668FBA | `--eq-ink-faint` #7F8C99 | decor | 1.01 | 0.0 |  |
| dark | HUB: rail-booked vs ink-faint (coming-up vs default edge) | `--eq-rail-booked` #4675A4 | `--eq-ink-faint` #697B8D | decor | 1.11 | 0.0 |  |
| light | HUB: alert (Critical) on surface | `--eq-alert` #C0203F | `--eq-surface` #F3F6F9 | text | 5.50 | 72.4 | Lc<75 (body-column min) |
| dark | HUB: alert (Critical) on surface | `--eq-alert` #F2718C | `--eq-surface` #14293D | text | 5.31 | -45.2 | Lc<60 |
| light | HUB: alert on alert-fill | `--eq-alert` #C0203F | `--eq-alert-fill` #FCE3E8 | text | 4.91 | 65.0 | Lc<75 (body-column min) |
| dark | HUB: alert on alert-fill | `--eq-alert` #F2718C | `--eq-alert-fill` #472024 | text | 5.01 | -44.2 | Lc<60 |
| light | HUB: alert on page | `--eq-alert` #C0203F | `--eq-bg` #DEE6EE | text | 4.73 | 62.7 | Lc<75 (body-column min) |
| dark | HUB: alert on page | `--eq-alert` #F2718C | `--eq-bg` #0A1C2C | text | 6.18 | -47.1 | Lc<60 |
| light | HUB: ink on alert-fill | `--eq-ink` #192D41 | `--eq-alert-fill` #FCE3E8 | text | 11.58 | 87.6 |  |
| dark | HUB: ink on alert-fill | `--eq-ink` #DFE7EF | `--eq-alert-fill` #472024 | text | 11.21 | -87.2 |  |
| light | HUB: warn (plum) on surface | `--eq-warn` #A2457E | `--eq-surface` #F3F6F9 | text | 5.25 | 72.3 | Lc<75 (body-column min) |
| dark | HUB: warn (plum) on surface | `--eq-warn` #D98CBD | `--eq-surface` #14293D | text | 5.97 | -49.8 | Lc<60 |
| light | HUB: warn on warn-fill | `--eq-warn` #A2457E | `--eq-warn-fill` #F4E9F0 | text | 4.81 | 66.6 | Lc<75 (body-column min) |
| dark | HUB: warn on warn-fill | `--eq-warn` #D98CBD | `--eq-warn-fill` #402846 | text | 5.24 | -47.8 | Lc<60 |
| light | HUB: warn on page | `--eq-warn` #A2457E | `--eq-bg` #DEE6EE | text | 4.52 | 62.5 | Lc<75 (body-column min) |
| dark | HUB: warn on page | `--eq-warn` #D98CBD | `--eq-bg` #0A1C2C | text | 6.94 | -51.8 | Lc<60 |
| light | HUB: ok on surface | `--eq-ok` #17714B | `--eq-surface` #F3F6F9 | text | 5.53 | 74.0 | Lc<75 (body-column min) |
| dark | HUB: ok on surface | `--eq-ok` #52D7C1 | `--eq-surface` #14293D | text | 8.38 | -67.0 | Lc<75 (body-column min) |
| light | HUB: ok on ok-fill | `--eq-ok` #17714B | `--eq-ok-fill` #E3F1EA | text | 5.15 | 69.3 | Lc<75 (body-column min) |
| dark | HUB: ok on ok-fill | `--eq-ok` #52D7C1 | `--eq-ok-fill` #113E36 | text | 6.71 | -63.2 | Lc<75 (body-column min) |
| light | HUB: ok on page | `--eq-ok` #17714B | `--eq-bg` #DEE6EE | text | 4.76 | 64.2 | Lc<75 (body-column min) |
| dark | HUB: ok on page | `--eq-ok` #52D7C1 | `--eq-bg` #0A1C2C | text | 9.75 | -68.9 | Lc<75 (body-column min) |
| light | HUB: white on ok (light) / navy | `#FFFFFF` #FFFFFF | `--eq-ok` #17714B | text | 6.00 | -84.8 |  |
| dark | HUB: white on ok (light) / navy | `#FFFFFF` #FFFFFF | `--eq-ok` #52D7C1 | text | 1.77 | -36.2 | WCAG<4.5, Lc<60 |
| light | HUB: eq-border-strong (control edge) on surface | `--eq-border-strong` #7A8694 | `--eq-surface` #F3F6F9 | ui | 3.42 | 59.0 |  |
| dark | HUB: eq-border-strong (control edge) on surface | `--eq-border-strong` #6E8397 | `--eq-surface` #14293D | ui | 3.79 | -31.6 |  |
| light | HUB: eq-border-strong on page | `--eq-border-strong` #7A8694 | `--eq-bg` #DEE6EE | ui | 2.94 | 49.3 | WCAG<3 |
| dark | HUB: eq-border-strong on page | `--eq-border-strong` #6E8397 | `--eq-bg` #0A1C2C | ui | 4.41 | -33.5 |  |
| light | HUB: eq-border-strong on raised | `--eq-border-strong` #7A8694 | `--eq-raised` #F8FAFC | ui | 3.54 | 61.5 |  |
| dark | HUB: eq-border-strong on raised | `--eq-border-strong` #6E8397 | `--eq-raised` #203549 | ui | 3.21 | -29.1 | Lc<30 |
| light | HUB: eq-border-strong on surface-3 (pressed) | `--eq-border-strong` #7A8694 | `--eq-surface-3` #D4DEE8 | ui | 2.72 | 44.5 | WCAG<3 |
| dark | HUB: eq-border-strong on surface-3 (pressed) | `--eq-border-strong` #6E8397 | `--eq-surface-3` #203549 | ui | 3.21 | -29.1 | Lc<30 |
| light | HUB: eq-border (hairline) on surface | `--eq-border` #D1DAE4 | `--eq-surface` #F3F6F9 | decor | 1.30 | 14.3 |  |
| dark | HUB: eq-border (hairline) on surface | `--eq-border` #2B3E50 | `--eq-surface` #14293D | decor | 1.35 | 0.0 |  |
| light | HUB: ink on mine-head | `--eq-ink` #192D41 | `--eq-mine-head` #CBE1F7 | text | 10.48 | 81.5 |  |
| dark | HUB: ink on mine-head | `--eq-ink` #DFE7EF | `--eq-mine-head` #133555 | text | 10.08 | -85.5 |  |
| light | HUB: live rule on mine-head | `--eq-live` #0A548B | `--eq-mine-head` #CBE1F7 | ui | 5.90 | 67.8 |  |
| dark | HUB: live rule on mine-head | `--eq-live` #65ABE9 | `--eq-mine-head` #133555 | ui | 5.13 | -47.8 |  |
| dark | HUB: eq-popover-edge on eq-popover-raised | `--eq-popover-edge` #7D92A6 | `--eq-popover-raised` #283E54 | ui | 3.43 | -33.7 |  |
| light | SESSION: ink on q-max-fill | `--jg-ink` #192D41 | `--jg-q-max-fill` #CAE4CE | text | 10.38 | 80.9 |  |
| dark | SESSION: ink on q-max-fill | `--jg-ink` #DFE7EF | `--jg-q-max-fill` #104525 | text | 8.85 | -82.9 |  |
| light | SESSION: ink-2 on q-max-fill | `--jg-ink-2` #3F4F60 | `--jg-q-max-fill` #CAE4CE | text | 6.20 | 69.2 | Lc<75 (body-column min) |
| dark | SESSION: ink-2 on q-max-fill | `--jg-ink-2` #B8C6D3 | `--jg-q-max-fill` #104525 | text | 6.35 | -62.3 | Lc<75 (body-column min) |
| light | SESSION: q-max-text on q-max-fill | `--jg-q-max-text` #0A6644 | `--jg-q-max-fill` #CAE4CE | text | 5.17 | 64.0 | Lc<75 (body-column min) |
| dark | SESSION: q-max-text on q-max-fill | `--jg-q-max-text` #6FE0AB | `--jg-q-max-fill` #104525 | text | 6.80 | -66.5 | Lc<75 (body-column min) |
| light | SESSION: q-max-text on surface | `--jg-q-max-text` #0A6644 | `--jg-surface` #F3F6F9 | text | 6.46 | 78.2 |  |
| dark | SESSION: q-max-text on surface | `--jg-q-max-text` #6FE0AB | `--jg-surface` #14293D | text | 9.14 | -71.8 | Lc<75 (body-column min) |
| light | SESSION: q-max-edge on surface | `--jg-q-max-edge` #1A9C69 | `--jg-surface` #F3F6F9 | ui | 3.23 | 56.4 |  |
| dark | SESSION: q-max-edge on surface | `--jg-q-max-edge` #3FCA8E | `--jg-surface` #14293D | ui | 7.11 | -58.4 |  |
| light | SESSION: q-star on q-max-fill | `--jg-q-star` #946609 | `--jg-q-max-fill` #CAE4CE | ui | 3.72 | 54.8 |  |
| dark | SESSION: q-star on q-max-fill | `--jg-q-star` #F0C874 | `--jg-q-max-fill` #104525 | ui | 6.96 | -67.7 |  |
| light | SESSION: ink on q-poor-fill | `--jg-ink` #192D41 | `--jg-q-poor-fill` #F8BCC6 | text | 8.71 | 70.9 | Lc<75 (body-column min) |
| dark | SESSION: ink on q-poor-fill | `--jg-ink` #DFE7EF | `--jg-q-poor-fill` #320E16 | text | 13.90 | -90.0 |  |
| light | SESSION: q-poor-text on q-poor-fill | `--jg-q-poor-text` #A3122F | `--jg-q-poor-fill` #F8BCC6 | text | 4.84 | 55.4 | Lc<60 |
| dark | SESSION: q-poor-text on q-poor-fill | `--jg-q-poor-text` #FFA8B8 | `--jg-q-poor-fill` #320E16 | text | 9.54 | -67.2 | Lc<75 (body-column min) |
| light | SESSION: q-poor on surface | `--jg-q-poor` #C0203F | `--jg-surface` #F3F6F9 | ui | 5.50 | 72.4 |  |
| dark | SESSION: q-poor on surface | `--jg-q-poor` #F2718C | `--jg-surface` #14293D | ui | 5.31 | -45.2 |  |
| light | SESSION: q-poor on q-poor-fill | `--jg-q-poor` #C0203F | `--jg-q-poor-fill` #F8BCC6 | ui | 3.69 | 48.3 |  |
| dark | SESSION: q-poor on q-poor-fill | `--jg-q-poor` #F2718C | `--jg-q-poor-fill` #320E16 | ui | 6.21 | -47.0 |  |
| light | SESSION: ink on q-done-fill | `--jg-ink` #192D41 | `--jg-q-done-fill` #EDEEEF | text | 12.11 | 90.5 |  |
| dark | SESSION: ink on q-done-fill | `--jg-ink` #DFE7EF | `--jg-q-done-fill` #2A333D | text | 10.26 | -86.0 |  |
| light | SESSION: q-done-edge on surface | `--jg-q-done-edge` #A5ABB0 | `--jg-surface` #F3F6F9 | decor | 2.14 | 40.2 |  |
| dark | SESSION: q-done-edge on surface | `--jg-q-done-edge` #455058 | `--jg-surface` #14293D | decor | 1.80 | -10.2 |  |
| light | SESSION: FILL STEP q-done-fill vs surface | `--jg-q-done-fill` #EDEEEF | `--jg-surface` #F3F6F9 | decor | 1.07 | 0.0 |  |
| dark | SESSION: FILL STEP q-done-fill vs surface | `--jg-q-done-fill` #2A333D | `--jg-surface` #14293D | decor | 1.16 | 0.0 |  |
| light | SESSION: FILL STEP q-max-fill vs q-done-fill | `--jg-q-max-fill` #CAE4CE | `--jg-q-done-fill` #EDEEEF | decor | 1.17 | 0.0 |  |
| dark | SESSION: FILL STEP q-max-fill vs q-done-fill | `--jg-q-max-fill` #104525 | `--jg-q-done-fill` #2A333D | decor | 1.16 | 0.0 |  |
| light | SESSION: FILL STEP q-poor-fill vs q-done-fill | `--jg-q-poor-fill` #F8BCC6 | `--jg-q-done-fill` #EDEEEF | decor | 1.39 | 17.4 |  |
| dark | SESSION: FILL STEP q-poor-fill vs q-done-fill | `--jg-q-poor-fill` #320E16 | `--jg-q-done-fill` #2A333D | decor | 1.35 | 0.0 |  |
| light | SESSION: FILL STEP q-max-fill vs q-poor-fill | `--jg-q-max-fill` #CAE4CE | `--jg-q-poor-fill` #F8BCC6 | decor | 1.19 | -9.4 |  |
| dark | SESSION: FILL STEP q-max-fill vs q-poor-fill | `--jg-q-max-fill` #104525 | `--jg-q-poor-fill` #320E16 | decor | 1.57 | 0.0 |  |
| light | SESSION: live-text on live-fill (Today column) | `--jg-live-text` #064F89 | `--jg-live-fill` #D6E8F8 | text | 6.74 | 73.5 | Lc<75 (body-column min) |
| dark | SESSION: live-text on live-fill (Today column) | `--jg-live-text` #98CAF9 | `--jg-live-fill` #143A5C | text | 6.79 | -64.0 | Lc<75 (body-column min) |
| light | SESSION: ink-muted on live-fill | `--jg-ink-muted` #546271 | `--jg-live-fill` #D6E8F8 | text | 4.98 | 66.1 | Lc<75 (body-column min) |
| dark | SESSION: ink-muted on live-fill | `--jg-ink-muted` #9DADBE | `--jg-live-fill` #143A5C | text | 5.12 | -49.3 | Lc<60 |
| light | SESSION: FILL STEP live-fill vs surface | `--jg-live-fill` #D6E8F8 | `--jg-surface` #F3F6F9 | decor | 1.16 | 0.0 |  |
| dark | SESSION: FILL STEP live-fill vs surface | `--jg-live-fill` #143A5C | `--jg-surface` #14293D | decor | 1.27 | 0.0 |  |
| light | SESSION: control-edge on surface | `--jg-control-edge` #7A8694 | `--jg-surface` #F3F6F9 | ui | 3.42 | 59.0 |  |
| dark | SESSION: control-edge on surface | `--jg-control-edge` #6E8397 | `--jg-surface` #14293D | ui | 3.79 | -31.6 |  |
| light | SESSION: control-edge on raised | `--jg-control-edge` #7A8694 | `--jg-raised` #F8FAFC | ui | 3.54 | 61.5 |  |
| dark | SESSION: control-edge on raised | `--jg-control-edge` #6E8397 | `--jg-raised` #203549 | ui | 3.21 | -29.1 | Lc<30 |
| light | SESSION: control-edge on page (routine sheet) | `--jg-control-edge` #7A8694 | `--jg-bg` #DEE6EE | ui | 2.94 | 49.3 | WCAG<3 |
| dark | SESSION: control-edge on page (routine sheet) | `--jg-control-edge` #6E8397 | `--jg-bg` #0A1C2C | ui | 4.41 | -33.5 |  |
| light | SESSION: border-strong (separator) on surface | `--jg-border-strong` #A3AEBB | `--jg-surface` #F3F6F9 | decor | 2.08 | 38.8 |  |
| dark | SESSION: border-strong (separator) on surface | `--jg-border-strong` #4A5F73 | `--jg-surface` #14293D | decor | 2.25 | -15.8 |  |
| light | SESSION: ink on elevated-fill (flag) | `--jg-ink` #192D41 | `--jg-elevated-fill` #F3EDE1 | text | 12.06 | 90.2 |  |
| dark | SESSION: ink on elevated-fill (flag) | `--jg-ink` #DFE7EF | `--jg-elevated-fill` #3F3112 | text | 10.13 | -85.7 |  |
| light | SESSION: ink-muted on surface-2 (band) | `--jg-ink-muted` #546271 | `--jg-surface-2` #E4EBF3 | text | 5.20 | 68.8 | Lc<75 (body-column min) |
| dark | SESSION: ink-muted on surface-2 (band) | `--jg-ink-muted` #9DADBE | `--jg-surface-2` #1B3044 | text | 5.90 | -52.0 | Lc<60 |
| light | SESSION: pf-date on surface-2 | `--jg-pf-date` #0A548B | `--jg-surface-2` #E4EBF3 | text | 6.59 | 74.6 | Lc<75 (body-column min) |
| dark | SESSION: pf-date on surface-2 | `--jg-pf-date` #8CC4F2 | `--jg-surface-2` #1B3044 | text | 7.27 | -62.7 | Lc<75 (body-column min) |
| light | SESSION: pf-date-sub on surface-2 | `--jg-pf-date-sub` #3F6B90 | `--jg-surface-2` #E4EBF3 | text | 4.70 | 65.8 | Lc<75 (body-column min) |
| dark | SESSION: pf-date-sub on surface-2 | `--jg-pf-date-sub` #7A9DBC | `--jg-surface-2` #1B3044 | text | 4.75 | -42.5 | Lc<60 |
| light | SESSION: pf-now on surface-2 | `--jg-pf-now` #B53C0B | `--jg-surface-2` #E4EBF3 | text | 4.83 | 65.6 | Lc<75 (body-column min) |
| dark | SESSION: pf-now on surface-2 | `--jg-pf-now` #F58443 | `--jg-surface-2` #1B3044 | text | 5.32 | -47.8 | Lc<60 |
| light | SESSION: pf-now-sub on pf-now-tile | `--jg-pf-now-sub` #9E4D20 | `--jg-pf-now-tile` #FDE6D8 | text | 4.95 | 66.9 | Lc<75 (body-column min) |
| dark | SESSION: pf-now-sub on pf-now-tile | `--jg-pf-now-sub` #F7A06B | `--jg-pf-now-tile` #3A2216 | text | 7.18 | -58.9 | Lc<60 |
| light | SESSION: pf-reps on pf-tile | `--jg-pf-reps` #3B6689 | `--jg-pf-tile` #D9E9F6 | text | 4.91 | 65.9 | Lc<75 (body-column min) |
| dark | SESSION: pf-reps on pf-tile | `--jg-pf-reps` #7FA6C6 | `--jg-pf-tile` #16324B | text | 5.13 | -46.4 | Lc<60 |
| light | SESSION: pf-tile-ink on pf-tile | `--jg-pf-tile-ink` #062E4F | `--jg-pf-tile` #D9E9F6 | text | 11.21 | 85.9 |  |
| dark | SESSION: pf-tile-ink on pf-tile | `--jg-pf-tile-ink` #FFFFFF | `--jg-pf-tile` #16324B | text | 13.19 | -102.6 |  |
| light | SESSION: pf-now-ink on pf-now-tile | `--jg-pf-now-ink` #7A2A06 | `--jg-pf-now-tile` #FDE6D8 | text | 8.09 | 79.4 |  |
| dark | SESSION: pf-now-ink on pf-now-tile | `--jg-pf-now-ink` #FFD2B8 | `--jg-pf-now-tile` #3A2216 | text | 10.68 | -81.3 |  |
| light | SESSION: pf-flow on pf-flow-bg | `--jg-pf-flow` #7B3FB8 | `--jg-pf-flow-bg` #F1E7FB | text | 5.41 | 69.5 | Lc<75 (body-column min) |
| dark | SESSION: pf-flow on pf-flow-bg | `--jg-pf-flow` #C58CF0 | `--jg-pf-flow-bg` #2A1D3A | text | 6.28 | -50.3 | Lc<60 |
| light | SESSION: pf-practice on pf-practice-bg | `--jg-pf-practice` #4F6F8C | `--jg-pf-practice-bg` #E6EEF5 | text | 4.50 | 65.4 | WCAG<4.5, Lc<75 (body-column min) |
| dark | SESSION: pf-practice on pf-practice-bg | `--jg-pf-practice` #9FB4C7 | `--jg-pf-practice-bg` #1D2A36 | text | 6.84 | -56.7 | Lc<60 |
| light | SESSION: pf-skip on pf-skip-bg | `--jg-pf-skip` #6B7884 | `--jg-pf-skip-bg` #EEF1F4 | text | 3.99 | 62.8 | WCAG<4.5, Lc<75 (body-column min) |
| dark | SESSION: pf-skip on pf-skip-bg | `--jg-pf-skip` #8A96A2 | `--jg-pf-skip-bg` #1A2129 | text | 5.38 | -42.7 | Lc<60 |
| light | SESSION: pf-gain on surface | `--jg-pf-gain` #15803D | `--jg-surface` #F3F6F9 | text | 4.62 | 68.6 | Lc<75 (body-column min) |
| dark | SESSION: pf-gain on surface | `--jg-pf-gain` #4ADE80 | `--jg-surface` #14293D | text | 8.52 | -68.0 | Lc<75 (body-column min) |
| light | COPY: Pulse green on fill | `--sr-green` #17714B | `--sr-green-fill` #E3F1EA | text | 5.15 | 69.3 | Lc<75 (body-column min) |
| dark | COPY: Pulse green on fill | `--sr-green` #5CCF98 | `--sr-green-fill` #0F2E21 | text | 7.56 | -61.9 | Lc<75 (body-column min) |
| light | COPY: Pulse yellow on fill | `--sr-yellow` #9D5F00 | `--sr-yellow-fill` #FBEFD6 | text | 4.53 | 66.2 | Lc<75 (body-column min) |
| dark | COPY: Pulse yellow on fill | `--sr-yellow` #F0B95A | `--sr-yellow-fill` #3A2A0C | text | 7.78 | -65.5 | Lc<75 (body-column min) |
| light | COPY: Pulse red on fill | `--sr-red` #B42318 | `--sr-red-fill` #FDE8E6 | text | 5.59 | 69.9 | Lc<75 (body-column min) |
| dark | COPY: Pulse red on fill | `--sr-red` #FF7B6E | `--sr-red-fill` #3D1410 | text | 6.36 | -50.4 | Lc<60 |
| light | COPY: Pulse watch on fill | `--sr-watch` #6B4C9A | `--sr-watch-fill` #EFE9F7 | text | 5.65 | 71.3 | Lc<75 (body-column min) |
| dark | COPY: Pulse watch on fill | `--sr-watch` #C4A9EA | `--sr-watch-fill` #251A36 | text | 7.98 | -60.1 | Lc<75 (body-column min) |
| light | COPY: Pulse yellow on surface | `--sr-yellow` #9D5F00 | `--sr-surface` #F3F6F9 | text | 4.76 | 69.5 | Lc<75 (body-column min) |
| dark | COPY: Pulse yellow on surface | `--sr-yellow` #F0B95A | `--sr-surface` #14293D | text | 8.34 | -66.5 | Lc<75 (body-column min) |
| light | COPY: FORD family ink on fill | `--ford-family-ink` #B8430B | `--ford-family-fill` #FBE8DD | text | 4.60 | 64.7 | Lc<75 (body-column min) |
| dark | COPY: FORD family ink on fill | `--ford-family-ink` #F5975E | `--ford-family-fill` #3A1E0D | text | 6.91 | -55.7 | Lc<60 |
| light | COPY: FORD occupation ink on fill | `--ford-occupation-ink` #0F5285 | `--ford-occupation-fill` #E4EEF5 | text | 6.96 | 76.9 |  |
| dark | COPY: FORD occupation ink on fill | `--ford-occupation-ink` #79B6E2 | `--ford-occupation-fill` #0D2436 | text | 7.26 | -56.7 | Lc<60 |
| light | COPY: FORD recreation ink on fill | `--ford-recreation-ink` #1B6F4E | `--ford-recreation-fill` #E2F0E9 | text | 5.21 | 69.3 | Lc<75 (body-column min) |
| dark | COPY: FORD recreation ink on fill | `--ford-recreation-ink` #66C39A | `--ford-recreation-fill` #0C2A1F | text | 7.20 | -57.5 | Lc<60 |
| light | COPY: FORD dreams ink on fill | `--ford-dreams-ink` #5A4AA6 | `--ford-dreams-fill` #EAE7F7 | text | 5.83 | 71.2 | Lc<75 (body-column min) |
| dark | COPY: FORD dreams ink on fill | `--ford-dreams-ink` #A99BEC | `--ford-dreams-fill` #1D1838 | text | 6.92 | -52.2 | Lc<60 |
| light | COPY: FORD unfiled on fill | `--ford-unfiled` #7A5A12 | `--ford-unfiled-fill` #F7EFD9 | text | 5.55 | 72.1 | Lc<75 (body-column min) |
| dark | COPY: FORD unfiled on fill | `--ford-unfiled` #D8B866 | `--ford-unfiled-fill` #2A2213 | text | 8.21 | -63.4 | Lc<75 (body-column min) |
| light | COPY: briefing warn (amber) on fill | `--br-warn` #8A5300 | `--br-warn-fill` #FDF3E3 | text | 5.76 | 74.6 | Lc<75 (body-column min) |
| dark | COPY: briefing warn (amber) on fill | `--br-warn` #FBBF24 | `--br-warn-fill` #3F3112 | text | 7.58 | -67.8 | Lc<75 (body-column min) |
| light | COPY: briefing warn on surface | `--br-warn` #8A5300 | `--br-surface` #F3F6F9 | text | 5.84 | 75.5 |  |
| dark | COPY: briefing warn on surface | `--br-warn` #FBBF24 | `--br-surface` #14293D | text | 8.89 | -70.3 | Lc<75 (body-column min) |
| light | COPY: routine avoid on fill | `--rb-avoid` #A2457E | `--rb-avoid-fill` #F4E9F0 | text | 4.81 | 66.6 | Lc<75 (body-column min) |
| dark | COPY: routine avoid on fill | `--rb-avoid` #DC93C2 | `--rb-avoid-fill` #402846 | text | 5.59 | -50.8 | Lc<60 |
| light | COPY: routine caution on fill | `--rb-caution` #8A5300 | `--rb-caution-fill` #FBEEDD | text | 5.54 | 72.0 | Lc<75 (body-column min) |
| dark | COPY: routine caution on fill | `--rb-caution` #E0A45A | `--rb-caution-fill` #3F3112 | text | 5.80 | -53.5 | Lc<60 |
| light | COPY: routine caution-edge on surface | `--rb-caution-edge` #D9A45C | `--rb-surface` #F3F6F9 | ui | 2.06 | 38.2 | WCAG<3 |
| dark | COPY: routine caution-edge on surface | `--rb-caution-edge` #8A5300 | `--rb-surface` #14293D | ui | 2.35 | -17.3 | WCAG<3, Lc<30 |
| light | COPY: routine avoid-edge on surface | `--rb-avoid-edge` #AD7598 | `--rb-surface` #F3F6F9 | ui | 3.35 | 58.2 |  |
| dark | COPY: routine avoid-edge on surface | `--rb-avoid-edge` #AF5089 | `--rb-surface` #14293D | ui | 3.06 | -25.1 | Lc<30 |
| light | COPY: Learning push text on push fill | `--wk-cat-push-text` #BC2C00 | `--wk-surface` + `--wk-cat-push-fill` #FDE7DC | text | 5.04 | 66.7 | Lc<75 (body-column min) |
| dark | COPY: Learning push text on push fill | `--wk-cat-push-text` #FC773C | `--wk-surface` + `--wk-cat-push-fill` #353239 | text | 4.70 | -44.6 | Lc<60 |
| light | COPY: Learning pull text on pull fill | `--wk-cat-pull-text` #0A548B | `--wk-surface` + `--wk-cat-pull-fill` #E6EEF3 | text | 6.74 | 76.1 |  |
| dark | COPY: Learning pull text on pull fill | `--wk-cat-pull-text` #38BDF8 | `--wk-surface` + `--wk-cat-pull-fill` #183B53 | text | 5.49 | -53.2 | Lc<60 |
| light | COPY: Learning posterior text on fill | `--wk-cat-posterior-text` #8A5300 | `--wk-surface` + `--wk-cat-posterior-fill` #FDF3E3 | text | 5.76 | 74.6 | Lc<75 (body-column min) |
| dark | COPY: Learning posterior text on fill | `--wk-cat-posterior-text` #FBBF24 | `--wk-surface` + `--wk-cat-posterior-fill` #2B383B | text | 7.27 | -67.1 | Lc<75 (body-column min) |
| light | COPY: Learning hips text on fill | `--wk-cat-hips-text` #B5306F | `--wk-surface` + `--wk-cat-hips-fill` #FBE8F0 | text | 4.95 | 67.1 | Lc<75 (body-column min) |
| dark | COPY: Learning hips text on fill | `--wk-cat-hips-text` #F472B6 | `--wk-surface` + `--wk-cat-hips-fill` #33334E | text | 4.58 | -44.2 | Lc<60 |
| light | COPY: Learning trunk text on fill | `--wk-cat-trunk-text` #8A4F9E | `--wk-surface` + `--wk-cat-trunk-fill` #F2E9F6 | text | 4.81 | 66.8 | Lc<75 (body-column min) |
| dark | COPY: Learning trunk text on fill | `--wk-cat-trunk-text` #C289FB | `--wk-surface` + `--wk-cat-trunk-fill` #2C3658 | text | 4.67 | -45.2 | Lc<60 |
| light | COPY: Learning legs text on fill | `--wk-cat-legs-text` #0F734B | `--wk-surface` + `--wk-cat-legs-fill` #E3F1EA | text | 5.05 | 68.6 | Lc<75 (body-column min) |
| dark | COPY: Learning legs text on fill | `--wk-cat-legs-text` #34D399 | `--wk-surface` + `--wk-cat-legs-fill` #183D48 | text | 6.04 | -58.5 | Lc<60 |
| light | COPY: calendar tone0 (orange) text on its fill | `--t0-text` #BC2C00 | `--cal-surface` + `--t0-fill` #FDEADE | text | 5.15 | 68.0 | Lc<75 (body-column min) |
| dark | COPY: calendar tone0 (orange) text on its fill | `--t0-text` #FF9455 | `--cal-surface` + `--t0-fill` #383439 | text | 5.61 | -53.2 | Lc<60 |
| light | COPY: calendar tone4 (amber) text on fill | `--t4-text` #895306 | `--cal-surface` + `--t4-fill` #F6ECD9 | text | 5.42 | 70.5 | Lc<75 (body-column min) |
| dark | COPY: calendar tone4 (amber) text on fill | `--t4-text` #FBBF24 | `--cal-surface` + `--t4-fill` #363B36 | text | 6.90 | -66.0 | Lc<75 (body-column min) |
| light | COPY: calendar tone2 (teal) text on fill | `--t2-text` #0B5F59 | `--cal-surface` + `--t2-fill` #E0F0EE | text | 6.39 | 74.8 | Lc<75 (body-column min) |
| dark | COPY: calendar tone2 (teal) text on fill | `--t2-text` #5EEAD4 | `--cal-surface` + `--t2-fill` #184351 | text | 7.28 | -71.8 | Lc<75 (body-column min) |
| light | COPY: WHITE initials on calendar tone0 solid (avatar) | `#FFFFFF` #FFFFFF | `--t0-solid` #EF5302 | text | 3.55 | -67.4 | WCAG<4.5, Lc<75 (body-column min) |
| dark | COPY: WHITE initials on calendar tone0 solid (avatar) | `#FFFFFF` #FFFFFF | `--t0-solid` #F36D21 | text | 2.99 | -61.1 | WCAG<4.5, Lc<75 (body-column min) |
| light | COPY: calendar heat ink-hi on heat-4 | `--cal-heat-ink-hi` #FFFFFF | `--cal-heat-4` #2B7BB0 | text | 4.60 | -77.1 |  |
| dark | COPY: calendar heat ink-hi on heat-4 | `--cal-heat-ink-hi` #071727 | `--cal-heat-4` #5089BF | text | 4.89 | 38.3 | Lc<60 |
| light | COPY: calendar heat ink-hi on heat-5 | `--cal-heat-ink-hi` #FFFFFF | `--cal-heat-5` #0A548B | text | 7.91 | -91.7 |  |
| dark | COPY: calendar heat ink-hi on heat-5 | `--cal-heat-ink-hi` #071727 | `--cal-heat-5` #65ABE9 | text | 7.37 | 54.6 | Lc<60 |
| light | COPY: calendar heat ink-lo on heat-3 | `--cal-heat-ink-lo` #23303A | `--cal-heat-3` #6BA5CB | text | 5.06 | 46.2 | Lc<60 |
| dark | COPY: calendar heat ink-lo on heat-3 | `--cal-heat-ink-lo` #DFE7EF | `--cal-heat-3` #386792 | text | 4.77 | -68.6 | Lc<75 (body-column min) |
| light | COPY: studio done-on on done | `--st-done-on` #FFFFFF | `--st-done` #17714B | text | 6.00 | -84.8 |  |
| dark | COPY: studio done-on on done | `--st-done-on` #04121C | `--st-done` #52D7C1 | text | 10.69 | 70.9 | Lc<75 (body-column min) |
| light | COPY: studio live-text on live-fill | `--st-live-text` #064F89 | `--st-live-fill` #DBEEFE | text | 7.11 | 76.9 |  |
| dark | COPY: studio live-text on live-fill | `--st-live-text` #98CAF9 | `--st-live-fill` #23405C | text | 6.20 | -62.3 | Lc<75 (body-column min) |
| light | COPY: studio live on live-fill (forbidden words) | `--st-live` #0A548B | `--st-live-fill` #DBEEFE | text | 6.66 | 75.3 |  |
| dark | COPY: studio live on live-fill (forbidden words) | `--st-live` #65ABE9 | `--st-live-fill` #23405C | text | 4.37 | -44.7 | WCAG<4.5, Lc<60 |
| light | COPY: progress report: hero #F06C22 white words (pr-hero-on on pr-hero) | `--pr-hero-on` #FFFFFF | `--pr-hero` #F06C22 | text | 3.06 | -62.0 | WCAG<4.5, Lc<75 (body-column min) |
| dark | COPY: progress report: hero #F06C22 white words (pr-hero-on on pr-hero) | `--pr-hero-on` #FFFFFF | `--pr-hero` #F06C22 | text | 3.06 | -62.0 | WCAG<4.5, Lc<75 (body-column min) |
| light | COPY: progress report: on-navy-muted over navy | `--pr-on-navy-muted` #9AA8B0 | `--pr-navy` #0A2E46 | text | 5.75 | -49.5 | Lc<60 |
| dark | COPY: progress report: on-navy-muted over navy | `--pr-on-navy-muted` #9AA8B0 | `--pr-navy` #0A2E46 | text | 5.75 | -49.5 | Lc<60 |
| light | COPY: progress report: on-navy-faint over navy | `--pr-on-navy-faint` #82949E | `--pr-navy` #0A2E46 | text | 4.46 | -38.7 | WCAG<4.5, Lc<60 |
| dark | COPY: progress report: on-navy-faint over navy | `--pr-on-navy-faint` #82949E | `--pr-navy` #0A2E46 | text | 4.46 | -38.7 | WCAG<4.5, Lc<60 |
| light | COPY: progress report: hero on navy | `--pr-hero` #F06C22 | `--pr-navy` #0A2E46 | text | 4.61 | -40.8 | Lc<60 |
| dark | COPY: progress report: hero on navy | `--pr-hero` #F06C22 | `--pr-navy` #0A2E46 | text | 4.61 | -40.8 | Lc<60 |

### Inferences
- **The guarded pairs pass WCAG 2 as intended; the residual WCAG failures are outside the guarded set.** They are the legacy `--green/--red/--amber` pigments still in live use, the chart series, the identity palettes (calendar tones, the print report), the light page-ground edge, and a few of AJ's own bubble colours.
- **APCA exposes a systematic dark-mode gap that WCAG 2 hides.** The dark secondary inks (muted #9DADBE, link blue #65ABE9, crimson #F2718C, plum #D98CBD, hero-text #FF9455) all sit at Lc 45-56. That is acceptable for large or bold text under APCA's own guidance, but under Lc 60 for ordinary content text and well under Lc 75 for body columns. In light the same roles mostly sit at Lc 62-81. For a glance-twice-per-machine use, dark mode's quiet text is measurably weaker than light mode's, although the WCAG ratios suggest the opposite. This is consistent with APCA's polarity model: light-on-dark at mid luminance scores lower.
- **The Start / Finish label (navy on the logo orange) reaches only Lc 46.9.** It is fine for its large 14/700 button voice under APCA's Lc 45 "larger, heavier text" level. The light now pill (Lc 36.4) falls below even that if its text is small.

### Gaps
- Font size and weight per pair were not joined to the measurements. Whether each Lc-45-to-60 dark pair is "large" under APCA's lookup table depends on the size and weight of the element, which needs a component-level audit.
- The table measures token pairs; it does not catch component code that combines tokens differently (for example a class string that puts `text-muted-foreground` on `bg-(--tray)`).

## 4. Colour-vision deficiency: which semantic pairs collapse?

### Takeaway
**The main collapses**, with protan, deutan and tritan simulated at full severity:
- **Dark hero/go orange #F36D21 vs Critical crimson #F2718C**, for tritanopes: ΔE_OK 0.030, ΔE00 3.1. The repo's own floor for this pair in dark is tritan ≥ 3, written as "may not get worse".
- **Dark crimson vs caution plum**, for every viewer: ΔE_OK 0.083 even with normal vision; ΔE00 9.8 for tritanopes.
- **The session's rep-quality max green vs poor crimson**, for deuteranopes: edges ΔE00 12.0 light and 2.9 dark; text ΔE00 10.9 light and 2.9 dark; light fills ΔE00 3.1. The file states that shape (★, ◯, cross, hatch) carries quality for exactly this reason.
- **Live blue vs caution plum**, for protanopes: ΔE00 5.4 light, 8.4 dark.
- **The Hub's coming-up blue rail vs the default grey edge**, for everyone: ΔE00 about 9-10, and 1.01:1 in luminance (light).
- **Dark blood-flow violet vs live blue**, for deuteranopes: ΔE00 1.4.

**Pairs that hold:**
- live blue vs orange and the frame's blue vs orange: ΔE00 above 48 in every simulation;
- ok green vs hero orange in dark;
- the dark Critical fill vs the caution fill: ΔE00 13.3 normal, as the test requires.

### Cited Findings

#### 4a. Measured ΔE_OK / ΔE00
Columns are normal, then protan (Machado), then deutan and tritan (the smaller of Machado and Brettel, as the repo does). The "Collapses" column applies the brief's threshold (ΔE_OK < 0.10 **or** ΔE00 < 10).

| Mode | Pair | A | B | normal ΔE_OK / ΔE00 | protan | deutan | tritan | Collapses (ΔE_OK<0.10 or ΔE00<10) |
|---|---|---|---|---|---|---|---|---|
| light | hero orange vs Critical crimson | `--eq-hero` #D45A06 | `--eq-alert` #C0203F | 0.127 / 24.8 | 0.142 / 21.3 | 0.102 / 14.0 | 0.075 / 9.1 | tritan |
| light | go orange vs Critical crimson | `--eq-go` #F36D21 | `--eq-alert` #C0203F | 0.186 / 29.0 | 0.205 / 27.2 | 0.174 / 20.7 | 0.129 / 15.3 |  |
| light | go orange vs destructive red | `--eq-go` #F36D21 | `--destructive` #BB271B | 0.179 / 23.1 | 0.193 / 21.7 | 0.173 / 19.2 | 0.139 / 16.8 |  |
| light | Critical crimson vs caution plum | `--eq-alert` #C0203F | `--eq-warn` #A2457E | 0.105 / 18.4 | 0.101 / 24.9 | 0.099 / 27.3 | 0.088 / 9.6 | deutan, tritan |
| light | ok green vs hero orange | `--eq-ok` #17714B | `--eq-hero` #D45A06 | 0.265 / 52.4 | 0.068 / 13.3 | 0.167 / 24.5 | 0.261 / 49.6 | protan |
| light | ok green vs Critical crimson | `--eq-ok` #17714B | `--eq-alert` #C0203F | 0.282 / 63.5 | 0.094 / 10.7 | 0.066 / 11.4 | 0.256 / 50.5 | protan, deutan |
| light | ok green vs caution plum | `--eq-ok` #17714B | `--eq-warn` #A2457E | 0.246 / 61.9 | 0.112 / 30.5 | 0.071 / 18.1 | 0.170 / 43.3 | deutan |
| light | live blue vs caution plum | `--eq-live` #0A548B | `--eq-warn` #A2457E | 0.212 / 35.4 | 0.041 / 5.4 | 0.131 / 16.9 | 0.202 / 46.1 | protan |
| light | live blue vs hero orange | `--eq-live` #0A548B | `--eq-hero` #D45A06 | 0.331 / 49.5 | 0.218 / 48.8 | 0.297 / 54.7 | 0.304 / 54.1 |  |
| light | hero orange vs caution plum | `--eq-hero` #D45A06 | `--eq-warn` #A2457E | 0.180 / 38.4 | 0.180 / 42.7 | 0.175 / 36.3 | 0.111 / 11.8 |  |
| light | coming-up rail vs default card edge (ink-faint) | `--eq-rail-booked` #668FBA | `--eq-ink-faint` #7F8C99 | 0.055 / 9.9 | 0.050 / 10.0 | 0.053 / 10.3 | 0.042 / 9.2 | normal, protan, deutan, tritan |
| light | coming-up rail vs in-session live edge | `--eq-rail-booked` #668FBA | `--eq-live` #0A548B | 0.205 / 22.9 | 0.198 / 22.9 | 0.205 / 22.8 | 0.183 / 21.0 |  |
| light | hero orange vs amber warn (briefing) | `--eq-hero` #D45A06 | `--br-warn` #8A5300 | 0.145 / 18.0 | 0.080 / 8.6 | 0.127 / 14.8 | 0.144 / 15.5 | protan |
| light | ok green vs amber warn | `--eq-ok` #17714B | `--br-warn` #8A5300 | 0.153 / 37.7 | 0.075 / 12.3 | 0.074 / 16.0 | 0.150 / 42.3 | protan, deutan |
| light | rep max-edge green vs poor crimson | `--jg-q-max-edge` #1A9C69 | `--jg-q-poor` #C0203F | 0.320 / 70.9 | 0.229 / 26.6 | 0.083 / 12.0 | 0.290 / 58.4 | deutan |
| light | rep max text vs poor text | `--jg-q-max-text` #0A6644 | `--jg-q-poor-text` #A3122F | 0.258 / 60.3 | 0.113 / 11.2 | 0.049 / 10.9 | 0.236 / 48.8 | deutan |
| light | frame here-blue vs frame go-orange | `--chrome-here` #65ABE9 | `--chrome-go` #F36D21 | 0.295 / 48.9 | 0.260 / 51.3 | 0.251 / 52.5 | 0.270 / 58.1 |  |
| light | Pulse green vs red | `--sr-green` #17714B | `--sr-red` #B42318 | 0.260 / 58.3 | 0.115 / 12.6 | 0.079 / 15.9 | 0.248 / 50.1 | deutan |
| light | Pulse yellow vs red | `--sr-yellow` #9D5F00 | `--sr-red` #B42318 | 0.121 / 23.2 | 0.105 / 11.6 | 0.038 / 4.2 | 0.093 / 11.2 | deutan, tritan |
| light | Pulse green vs yellow | `--sr-green` #17714B | `--sr-yellow` #9D5F00 | 0.171 / 39.0 | 0.059 / 12.2 | 0.103 / 18.4 | 0.168 / 42.9 | protan |
| light | blood-flow violet vs live blue | `--jg-pf-flow` #7B3FB8 | `--eq-live` #0A548B | 0.166 / 23.2 | 0.078 / 6.6 | 0.080 / 7.7 | 0.106 / 27.9 | protan, deutan |
| light | blood-flow violet vs caution plum | `--jg-pf-flow` #7B3FB8 | `--eq-warn` #A2457E | 0.126 / 17.0 | 0.109 / 11.0 | 0.129 / 17.4 | 0.100 / 18.7 |  |
| light | FILL Critical vs caution | `--eq-alert-fill` #FCE3E8 | `--eq-warn-fill` #F4E9F0 | 0.017 / 5.1 | 0.015 / 2.1 | 0.010 / 3.2 | 0.018 / 5.8 | normal, protan, deutan, tritan |
| light | FILL ok vs Critical | `--eq-ok-fill` #E3F1EA | `--eq-alert-fill` #FCE3E8 | 0.046 / 20.4 | 0.026 / 3.8 | 0.007 / 0.6 | 0.039 / 15.9 | normal, protan, deutan, tritan |
| light | FILL hero vs Critical | `--eq-hero-fill` #FFE9D8 | `--eq-alert-fill` #FCE3E8 | 0.031 / 10.6 | 0.030 / 9.2 | 0.027 / 7.7 | 0.008 / 0.7 | normal, protan, deutan, tritan |
| light | FILL live vs caution | `--eq-live-fill` #DBEEFE | `--eq-warn-fill` #F4E9F0 | 0.035 / 13.4 | 0.019 / 5.0 | 0.024 / 6.9 | 0.035 / 13.6 | normal, protan, deutan, tritan |
| light | FILL live vs mine (your column) | `--eq-live-fill` #DBEEFE | `--eq-mine` #D3E2F1 | 0.034 / 2.8 | 0.035 / 2.6 | 0.034 / 2.5 | 0.034 / 2.7 | normal, protan, deutan, tritan |
| light | REP FILL max vs poor | `--jg-q-max-fill` #CAE4CE | `--jg-q-poor-fill` #F8BCC6 | 0.113 / 38.3 | 0.084 / 10.7 | 0.039 / 3.1 | 0.097 / 28.2 | protan, deutan, tritan |
| light | REP FILL max vs done | `--jg-q-max-fill` #CAE4CE | `--jg-q-done-fill` #EDEEEF | 0.068 / 14.6 | 0.053 / 9.2 | 0.058 / 7.7 | 0.056 / 7.6 | normal, protan, deutan, tritan |
| light | REP FILL poor vs done | `--jg-q-poor-fill` #F8BCC6 | `--jg-q-done-fill` #EDEEEF | 0.120 / 21.1 | 0.125 / 9.4 | 0.094 / 8.9 | 0.119 / 20.6 | protan, deutan |
| light | REP FILL done vs empty cell | `--jg-q-done-fill` #EDEEEF | `--jg-surface` #F3F6F9 | 0.023 / 2.0 | 0.024 / 2.0 | 0.023 / 2.0 | 0.023 / 1.9 | normal, protan, deutan, tritan |
| dark | hero orange vs Critical crimson | `--eq-hero` #F36D21 | `--eq-alert` #F2718C | 0.110 / 26.9 | 0.128 / 26.3 | 0.103 / 17.8 | 0.030 / 3.1 | tritan |
| dark | go orange vs Critical crimson | `--eq-go` #F36D21 | `--eq-alert` #F2718C | 0.110 / 26.9 | 0.128 / 26.3 | 0.103 / 17.8 | 0.030 / 3.1 | tritan |
| dark | go orange vs destructive red | `--eq-go` #F36D21 | `--destructive` #FF8C8C | 0.111 / 20.8 | 0.134 / 20.5 | 0.107 / 14.9 | 0.083 / 8.3 | tritan |
| dark | Critical crimson vs caution plum | `--eq-alert` #F2718C | `--eq-warn` #D98CBD | 0.083 / 13.4 | 0.078 / 14.0 | 0.068 / 20.4 | 0.080 / 9.8 | normal, protan, deutan, tritan |
| dark | ok green vs hero orange | `--eq-ok` #52D7C1 | `--eq-hero` #F36D21 | 0.303 / 56.0 | 0.259 / 30.2 | 0.176 / 31.6 | 0.302 / 62.0 |  |
| dark | ok green vs Critical crimson | `--eq-ok` #52D7C1 | `--eq-alert` #F2718C | 0.294 / 64.7 | 0.206 / 19.5 | 0.093 / 16.4 | 0.272 / 59.1 | deutan |
| dark | ok green vs caution plum | `--eq-ok` #52D7C1 | `--eq-warn` #D98CBD | 0.239 / 49.7 | 0.160 / 23.4 | 0.065 / 7.5 | 0.194 / 49.5 | deutan |
| dark | live blue vs caution plum | `--eq-live` #65ABE9 | `--eq-warn` #D98CBD | 0.168 / 37.2 | 0.069 / 8.4 | 0.084 / 13.7 | 0.169 / 47.0 | protan, deutan |
| dark | live blue vs hero orange | `--eq-live` #65ABE9 | `--eq-hero` #F36D21 | 0.295 / 48.9 | 0.260 / 51.3 | 0.251 / 52.5 | 0.270 / 58.1 |  |
| dark | hero orange vs caution plum | `--eq-hero` #F36D21 | `--eq-warn` #D98CBD | 0.173 / 36.4 | 0.196 / 42.6 | 0.170 / 36.9 | 0.109 / 12.7 |  |
| dark | coming-up rail vs default card edge (ink-faint) | `--eq-rail-booked` #4675A4 | `--eq-ink-faint` #697B8D | 0.061 / 9.1 | 0.050 / 9.1 | 0.059 / 9.7 | 0.051 / 8.8 | normal, protan, deutan, tritan |
| dark | coming-up rail vs in-session live edge | `--eq-rail-booked` #4675A4 | `--eq-live` #65ABE9 | 0.173 / 18.6 | 0.180 / 18.3 | 0.170 / 18.3 | 0.172 / 18.4 |  |
| dark | hero orange vs amber warn (briefing) | `--eq-hero` #F36D21 | `--br-warn` #FBBF24 | 0.190 / 28.4 | 0.202 / 19.4 | 0.146 / 12.7 | 0.172 / 17.3 |  |
| dark | ok green vs amber warn | `--eq-ok` #52D7C1 | `--br-warn` #FBBF24 | 0.216 / 40.5 | 0.156 / 25.3 | 0.181 / 32.4 | 0.193 / 50.3 |  |
| dark | rep max-edge green vs poor crimson | `--jg-q-max-edge` #3FCA8E | `--jg-q-poor` #F2718C | 0.301 / 70.5 | 0.169 / 23.0 | 0.032 / 2.9 | 0.251 / 56.3 | deutan |
| dark | rep max text vs poor text | `--jg-q-max-text` #6FE0AB | `--jg-q-poor-text` #FFA8B8 | 0.227 / 58.0 | 0.104 / 17.7 | 0.011 / 2.9 | 0.182 / 47.8 | deutan |
| dark | frame here-blue vs frame go-orange | `--chrome-here` #65ABE9 | `--chrome-go` #F36D21 | 0.295 / 48.9 | 0.260 / 51.3 | 0.251 / 52.5 | 0.270 / 58.1 |  |
| dark | Pulse green vs red | `--sr-green` #5CCF98 | `--sr-red` #FF7B6E | 0.274 / 62.4 | 0.153 / 13.9 | 0.058 / 10.5 | 0.251 / 54.8 | deutan |
| dark | Pulse yellow vs red | `--sr-yellow` #F0B95A | `--sr-red` #FF7B6E | 0.155 / 31.1 | 0.149 / 17.3 | 0.090 / 9.3 | 0.121 / 12.9 | deutan |
| dark | Pulse green vs yellow | `--sr-green` #5CCF98 | `--sr-yellow` #F0B95A | 0.176 / 36.1 | 0.071 / 11.4 | 0.105 / 16.6 | 0.172 / 46.2 | protan |
| dark | blood-flow violet vs live blue | `--jg-pf-flow` #C58CF0 | `--eq-live` #65ABE9 | 0.142 / 27.4 | 0.050 / 5.0 | 0.016 / 1.4 | 0.120 / 38.3 | protan, deutan |
| dark | blood-flow violet vs caution plum | `--jg-pf-flow` #C58CF0 | `--eq-warn` #D98CBD | 0.082 / 13.2 | 0.080 / 10.6 | 0.083 / 13.6 | 0.052 / 11.0 | normal, protan, deutan, tritan |
| dark | FILL Critical vs caution | `--eq-alert-fill` #472024 | `--eq-warn-fill` #402846 | 0.059 / 13.3 | 0.062 / 15.0 | 0.058 / 17.6 | 0.041 / 9.7 | normal, protan, deutan, tritan |
| dark | FILL ok vs Critical | `--eq-ok-fill` #113E36 | `--eq-alert-fill` #472024 | 0.114 / 39.3 | 0.075 / 6.1 | 0.035 / 8.1 | 0.106 / 34.8 | protan, deutan |
| dark | FILL hero vs Critical | `--eq-hero-fill` #4B2915 | `--eq-alert-fill` #472024 | 0.041 / 11.8 | 0.043 / 10.9 | 0.035 / 8.0 | 0.022 / 1.9 | normal, protan, deutan, tritan |
| dark | FILL live vs caution | `--eq-live-fill` #23405C | `--eq-warn-fill` #402846 | 0.082 / 20.3 | 0.070 / 5.9 | 0.045 / 5.5 | 0.081 / 25.8 | normal, protan, deutan, tritan |
| dark | FILL live vs mine (your column) | `--eq-live-fill` #23405C | `--eq-mine` #0E243A | 0.108 / 9.0 | 0.111 / 9.1 | 0.107 / 8.7 | 0.105 / 8.9 | normal, protan, deutan, tritan |
| dark | REP FILL max vs poor | `--jg-q-max-fill` #104525 | `--jg-q-poor-fill` #320E16 | 0.177 / 43.4 | 0.172 / 18.6 | 0.118 / 10.4 | 0.158 / 35.5 |  |
| dark | REP FILL max vs done | `--jg-q-max-fill` #104525 | `--jg-q-done-fill` #2A333D | 0.089 / 24.1 | 0.077 / 20.5 | 0.060 / 17.3 | 0.043 / 7.0 | normal, protan, deutan, tritan |
| dark | REP FILL poor vs done | `--jg-q-poor-fill` #320E16 | `--jg-q-done-fill` #2A333D | 0.115 / 23.5 | 0.124 / 11.0 | 0.092 / 13.8 | 0.116 / 26.1 | deutan |
| dark | REP FILL done vs empty cell | `--jg-q-done-fill` #2A333D | `--jg-surface` #14293D | 0.049 / 6.1 | 0.043 / 5.8 | 0.049 / 6.3 | 0.048 / 6.0 | normal, protan, deutan, tritan |

#### 4b. The repo's own CVD guards, for comparison
In [equipment-tokens.test.ts L502-525](../../src/features/equipment/equipment-tokens.test.ts#L502):
- hero vs crimson must keep CIEDE2000 ≥ 12 deutan in both modes, ≥ 8 tritan in light and ≥ 3 tritan in dark. The comment: "The dark pair is today's (#f36d21 and #f2718c) and may not get worse; the Critical mark is a triangle, so its shape carries the meaning too".
- ok vs crimson must keep CIE76 ≥ 15 for a deuteranope.

My measurements sit just above those floors:
- light hero vs crimson: deutan 14.0, tritan 9.1;
- dark: deutan 17.8, tritan 3.1;
- dark ok vs crimson deutan: ΔE00 16.4.

The comment also records why the light hero is #D45A06 rather than #BF4F04: the deeper value "sat close to the crimson for a colour-blind trainer (deutan 9.5, tritan 4.6)" ([L502-508](../../src/features/equipment/equipment-tokens.test.ts#L502)).

#### 4c. Design statements about CVD in the tokens
- "Plum rather than red so it does not collide with the hero orange for a protanope" ([equipment.tokens.css L71-72](../../src/features/equipment/equipment.tokens.css#L71)). Measured, light hero vs plum holds for protan (ΔE00 42.7) but drops to 11.8 for tritan.
- "green-vs-red is the one pair a red-green colour-blind trainer cannot split, so quality also carries a SHAPE (★ = max, ◯ kaizen = needs work, nothing = ordinary) and the poor cell keeps its diagonal hatch" ([journey-grid.tokens.css L88-93](../../src/features/journey-grid/journey-grid.tokens.css#L88)).
- The fills "step apart by at least 1.15:1 fill-to-fill, in both themes" ([L95-101](../../src/features/journey-grid/journey-grid.tokens.css#L95)). Measured: light max vs done 1.17, poor vs done 1.39, done vs empty cell 1.07 (the recorded trade-off "falls from 1.16 to 1.07", [navy-frame round doc, Known trade-offs](../../docs/rounds/2026-10-04-navy-frame.md)); dark 1.16, 1.35 and 1.16.
- The round doc's "your column and an in-session card's fill are nearly one tint (2.8 apart)" is reproduced exactly: light `--eq-live-fill` vs `--eq-mine` ΔE00 2.8.

#### 4d. Washes that change hue (relevant to tints read through CVD or on navy)
The calendar trainer tones and the Learning families still use rgba washes in dark. Composited over the dark card, measured:

| Wash | Result | OKLCH C | Hue |
|---|---|---|---|
| tone-0 orange (@0.16) | #383439 | 0.010 | 320° (pigment 45°) |
| tone-4 amber (@0.15) | #363B36 | 0.011 | 144° |
| Learning push (orange) | #353239 | 0.012 | |
| Learning posterior (amber) | #2B383B | 0.018 | |
| tone-5 plum | #343951 | | 274.5° (pigment 341.6°) |
| Learning hips (pink) | #33334E | | 283.8° (pigment 349.8°) |

The orange and amber washes go grey and the plum and pink washes go violet. Pairs between them: tone-3 violet vs tone-5 plum ΔE00 3.9; Learning trunk vs hips 4.2; tone-0 orange vs tone-4 amber 9.1. The round doc names this exact grey: "the old 16% hero wash came out `#383439`" ([navy-frame round doc, "What it looks like now"](../../docs/rounds/2026-10-04-navy-frame.md)). The test exempts the trainer tones as "identity colours, not copies" ([palette-copies.test.ts L332](../../src/palette-copies.test.ts#L332)).

### Inferences
- **The warm cluster (orange, crimson, plum, amber) is the CVD weak point**, especially for tritan, which squeezes the red-to-blue axis, and especially in dark, where crimson was lightened to #F2718C, near the orange's lightness (L 0.708 against 0.688). Hue is the only separator left, and tritanopia removes it.
- **Several "two different meanings" pairs lean on shape, words or position, not colour**, by design: Critical (a triangle), rep quality (★ / cross / hatch), the coming-up rail (it is a card edge, and grey means "over"). The measured numbers support that dependence: colour alone does not separate these pairs for some CVD viewers, and in two cases (the rail, dark crimson vs plum) not even for typical vision at the brief's threshold.
- **Pale light-mode fills fail the brief's threshold even for typical vision** (ΔE00 2.8-15). They are designed as tints behind words, not as stand-alone signals, so the threshold matters for them only where a fill alone carries meaning: the rep-quality cells and the in-session tint.

### Gaps
- Only full-severity (dichromat) simulations were run. Anomalous trichromacy at partial severity (the common case) would give larger ΔE values; Machado's severity 0.5-0.9 matrices were not run.
- Machado's matrices are defined for linear RGB inputs in the DaltonLens interpretation; other implementations apply them to gamma-encoded sRGB and would give somewhat different numbers.

## 5. Light vs dark parity: does each semantic colour keep its hue?

### Takeaway
**Most identity colours keep their hue within about 4° between modes:**
- the blues (Δh 0.5-2.7°);
- the go/hero oranges (0-0.6°);
- the plum (3.6°);
- the rep-quality green (0.1°);
- the neutrals.

**The notable shifts:**

| Token | Δh | From → to |
|---|---|---|
| `--eq-ok` | **20.4°** | green 159.8° → teal 180.2° (#17714B → #52D7C1) |
| `--br-warn` | 17.5° | amber 66.9° → yellow 84.4° |
| `--wk-cat-pull` | 15.4° | logo blue → Tailwind sky #38BDF8 |
| `--sr-yellow` | 12.1° | |
| `--jg-q-poor-text` | 11.1° | |
| `--sidebar-primary` | 9.7° | |
| `--destructive` | 8.8° | 29.6° → 20.8° |
| crimson `--eq-alert` / `--jg-q-poor` | 8.6° | 17.6° → 9.0° |
| `--eq-hero-text` | 7.7° | 41.8° → 49.5° |
| `--jg-q-star` | 7.6° | |

Two hue moves belong to the dark fills rather than the accents: the dark `--eq-warn-fill` sits 22° off its plum (towards violet), and `--eq-hero-fill` / `--eq-alert-fill` move about 10-11° between light and dark.

### Cited Findings
- The per-token light and dark OKLCH values and Δh are in tables 1a, 1c, 1d and 2a.
- The stated rule for dark: "Dark is not a flip: saturated orange vibrates on the navy, so the text tones lift instead of darken, and the fills mix into the dark surface. Every fill is OPAQUE and keeps its accent's hue" ([equipment.tokens.css L143-149](../../src/features/equipment/equipment.tokens.css#L143)).
- For the Journey look: "Retuned by lightness only, each hue and saturation kept" ([journey-grid.tokens.css L147-148](../../src/features/journey-grid/journey-grid.tokens.css#L147)), and "a token he picked changes its lightness to pass, never its hue, without asking" ([KNOWN-TRAPS.md L440](../../docs/KNOWN-TRAPS.md#L440)).
- How the main accents move:
  - logo blue: L 0.435 → 0.720, C 0.112 → 0.115 (chroma held);
  - crimson: L 0.525 → 0.708, C 0.192 → 0.160;
  - hero orange: light #D45A06 is the dark #F36D21 darkened (Δh 0.6°, ΔL −0.074);
  - green `--eq-ok`: L 0.488 → 0.800, C 0.102 → 0.120, with the 20° hue move.
- The round doc's optional follow-up proposes "a brighter dark ok green (`#42e1bd`) so a done mark and a Critical mark differ more by colour as well as shape" ([navy-frame round doc, open question 9](../../docs/rounds/2026-10-04-navy-frame.md)).
- **The frame is identical in both modes**, which is intended. In dark it sits only ΔL +0.031 above the page (1.08:1; ΔE_OK 0.043) and is darker than the card (1.07:1). It is told apart there by chroma (C 0.069 against the page's 0.040). In light it is 12.65:1 against the page.

### Inferences
- **The dark ok green has changed hue family.** It turned teal, not just lighter. This widens its distance from crimson (Δh 171° in dark against 142° in light), which the dark ok-vs-Critical CVD fix needed. The cost: "ok" no longer shares a hue with the session's max-strength green (#3FCA8E, h 160.5°), the Pulse green (h 160.1°) or the load-gain green (h 151.7°) in dark. Dark mode therefore has two greens: a teal "done/ok" and a mint "max strength".
- **The dark crimson and destructive red both rotate about 9° towards pink/magenta as they lighten.** That narrows the crimson-to-plum gap from 32.4° to 27.4° and contributes to the dark crimson/plum near-collapse in §4.
- **The frame behaves differently by mode.** It is a strong figure-ground band in light (12.65:1) and nearly merges with the page in dark (1.08:1). That is consistent with "the frame does not follow the theme", but it means its visual role differs by mode.

### Gaps
- No perceptual test (for example asymmetric matching across modes) was available. Hue constancy is measured in OKLCH only, and OKLCH's hue linearity is weaker for blues near 250-265°, the region the whole neutral system lives in.

## 6. How many raw hex and Tailwind palette colours remain in components?

### Takeaway
**The repo's ratchet** (`BARE_PALETTE_BUDGET = 127`) counts palette utilities with no `dark:` partner, excluding four always-dark screens. Replicated with the test's own regexes, the real count is **115**, so the budget has 12 of slack.
- **Families:** slate 51, red 21, amber 18, emerald 16, rose 9.
- **The four exempt always-dark screens** hold another 156.

**All palette utilities in non-test `.tsx`, including paired ones:** 976, of which slate is 670. Slate follows the theme through the `--n-*` override; the other 306 are amber 96, red 64, emerald 56, blue 40, rose 39, violet 4, neutral 3, sky 2, zinc 1, orange 1.

**Other literal colours:**
- raw hex literals in non-test `.tsx`: 194 in 19 files, 108 of them in two files (ConsultationWizard 64, unmounted; LegacyChartImporter 44, always-dark);
- `bg-white`: 60; `text-white`: 153; `border-white`: 41; `bg-black`: 8;
- raw hex in non-token `.css` files: 93, mostly the local token blocks of `clinical-review.css` (`--cr-*`) and `front-door.css` (`--fd-*`).

### Cited Findings
- The ratchet and its history are in [src/neutral-ramp.test.ts L198-352](../../src/neutral-ramp.test.ts#L198):
  - the regex `PALETTE` (prefixes `bg|text|border|ring|from|to|via|fill|stroke|divide|placeholder` × 22 families × shades);
  - only class-like string literals without `dark:` are counted;
  - `ALWAYS_DARK_SCREENS` = AccessRequestView, ErrorBoundary, LegacyChartImporter and ClientProgressReportView;
  - the budget fell 311 → 258 (Sep 17) → 219 (Sep 28) → 205 → 139 → 137 → 127 (Oct 4, "the count again").
- My replication gives 115. The top files are:

  | Count | File |
  |---|---|
  | 41 | features/progress-report/AccoladeViews.tsx |
  | 15 | contexts/ToastContext.tsx |
  | 11 | components/ClientProfileView.tsx |
  | 8 | components/EditRoutineDrawer.tsx |
  | 6 | components/WorkoutTrackerView.tsx |
  | 5 | components/CreateClientModal.tsx |
  | 4 each | ConsultationWizard, ProgressReportArchive, MachineProgressionStep |
  | 3 each | StrongConfirmationModal, ClientReportSections, GoalsBlock |
  | 2 each | SessionDetailDialog, InBodyReportSection, InBodyScanDialog |

  17 files in all.
- **Lines with any non-slate palette utility** (paired or not), top files: ClientProgressReportView 31, EditRoutineDrawer 15, LegacyChartImporter 14, ClientProfileView 11, ProfileHeader 9, ProgressReportArchive 7, InBodyScanDialog 6, ToastContext 6, WorkoutTrackerView 5, ErrorBoundary 5, CreateClientModal 5. 27 files in all.
- **Raw hex per file (non-test `.tsx`, matches):**

  | Count | File |
  |---|---|
  | 64 | components/ConsultationWizard.tsx (unmounted; "about 46 raw colours", [navy-frame round doc, open question 7](../../docs/rounds/2026-10-04-navy-frame.md)) |
  | 44 | features/admin/import/LegacyChartImporter.tsx |
  | 12 | progress-report/AccoladeViews.tsx |
  | 10 each | MachineProgressionStep, ClientReportSections |
  | 9 each | GoalsBlock, front-door/kit.tsx |
  | 5 each | anatomy/BodyModel, MaxStrengthLogo |
  | 4 each | InBodyTrend, InBodyReportSection, ErrorBoundary |
  | 3 | BrandTiles |
  | 1-2 each | EditTrainerModal, HubCard, MachineFigure, BriefingScreen, JournalEntryCard, RunSheet |

  Several of the small ones are comments or non-colour text ("#264" session numbers in HubCard and RunSheet; `#000` gradient masks in JournalEntryCard). In `.ts`, one hex: [theme-color.ts](../../src/features/home-screen/theme-color.ts).
- **Destructive styles** still use Tailwind red and rose (Scrap Session, the InBody delete, the session detail delete, StrongConfirmationModal and others) "rather than `--destructive`". Amber caution is a "recorded drift from plum" ([navy-frame round doc, open question 8](../../docs/rounds/2026-10-04-navy-frame.md)).

### Inferences
- **The budget should drop from 127 to 115** under the file's own rule: "Lower it whenever you bring the number down — that is the point of a ratchet" ([neutral-ramp.test.ts](../../src/neutral-ramp.test.ts)). At 127, 12 new theme-blind colours could land without a red test.
- **Red, amber, emerald and rose dominate the non-slate utilities** (255 of 306). They are the status and destructive colours that never moved onto `--destructive`, `--eq-warn` (plum) or `--eq-ok` tokens. The palette drift is concentrated in meaning colours, not neutrals.

### Gaps
- The regex counts can include utilities in dead or unmounted code (ConsultationWizard) and in comments. No usage weighting (how often a screen is seen) was applied.

## 7. What the colour and depth guard tests enforce (one line each)

### Takeaway
Ten guard files hold the palette by reading the real CSS and source. Most measure WCAG 2 contrast; two (`equipment-tokens.test.ts`, `palette-copies.test.ts`) also measure OKLCH hue and chroma and CIEDE2000, and `equipment-tokens.test.ts` adds CVD simulation. **None measures APCA.** Dark-mode chroma is checked only as "not grey".

### Cited Findings
- **[src/core-tokens.test.ts](../../src/core-tokens.test.ts):**
  - index.css word pairs must be ≥ 4.5:1 in both modes (25 text pairs, including the destructive red on its 10% / 20% tint);
  - `--input` and `--ring` must be ≥ 3:1;
  - no white on the logo orange; `--cyan` must equal `--primary`;
  - the orange must be identical in both modes;
  - no pure-white light surface; dark surfaces must be navy, not grey; dark ink must not be pure white;
  - the frame must be set once in `:root`, never in `.dark`, and its pairs must be ≥ 4.5:1 or ≥ 3:1 (including the opaque warm `--chrome-go-fill`);
  - every token must have a `--color-*` utility.
- **[src/neutral-ramp.test.ts](../../src/neutral-ramp.test.ts):**
  - the dark `--n-*` rungs are pinned to the navy values;
  - both ramps must be monotonic;
  - the light text rungs 500-950 must be ≥ 4.5:1 on the ground, slate-400 must stay non-text, and the dark text rungs are measured on the card;
  - the bare palette-utility ratchet (budget 127).
- **[src/features/equipment/equipment-tokens.test.ts](../../src/features/equipment/equipment-tokens.test.ts):**
  - every colour must be a lowercase hex, rgba() or var(), and the depth tokens must be present in every block;
  - raised must be lighter than the card and the tray below the page;
  - the fallback block must equal `.dark`;
  - 43 Hub word pairs ≥ 4.5:1 and 17 mark pairs ≥ 3:1 per mode (over the card, the in-session card and the run sheet's open row, chips included);
  - no white words on orange;
  - dark fills must be opaque hex with C ≥ 0.04 and within 25° of their accent; the Critical fill vs the caution fill must be ΔE00 ≥ 10;
  - CVD: hero vs crimson (deutan ≥ 12, tritan ≥ 8 light / ≥ 3 dark, ΔE00); ok vs crimson deutan CIE76 ≥ 15;
  - one crimson shared with the grid.
- **[src/palette-copies.test.ts](../../src/palette-copies.test.ts):**
  - six copies (briefing, Pulse, FORD, calendar, trainer profile, routine builder) and the profile shell must equal the Hub value for value in light, dark and fallback;
  - their dark fills must be opaque and on their accent's hue;
  - their words ≥ 4.5:1 and marks ≥ 3:1, own pigments included;
  - the one loud orange must have navy words and restate its fill on hover;
  - the Pulse's selections must be blue;
  - words on solid fills must use on-colour tokens.
- **[src/loud-orange.test.ts](../../src/loud-orange.test.ts):** across every `.tsx`:
  - no white or theme words on a solid orange;
  - logo-orange buttons have navy words and keep their fill on hover;
  - the named Saves and selections are blue;
  - the bell's badge and chips;
  - the session sheets mark in `--eq-hero` and put words only on the go pair;
  - no cyan rings, no sky, and Critical is the one crimson.
- **[src/page-grounds.test.ts](../../src/page-grounds.test.ts):**
  - `<main>`, the Hub, the profile and the session sheets paint `--background`;
  - no opaque `bg-white` outside the deliberate screens;
  - no dark panel paints the page colour;
  - the profile's open tab is raised off a tray darker than the page.
- **[src/components/frame-colours.test.ts](../../src/components/frame-colours.test.ts):**
  - the header, bottom bar, NavButton and status strip draw only in `--chrome-*` (no palette class, raw hex or theme colour, and no `dark:` look);
  - the tab you're on is a solid `--chrome-here` box; orange tabs have a navy icon;
  - the avatar is the frame blue with navy initials;
  - the bars cast the frame's shadow.
- **[src/features/hub-schedule/hub-colour-rules.test.ts](../../src/features/hub-schedule/hub-colour-rules.test.ts):**
  - one orange at the now marker, with navy words on its pill;
  - today in orange; the picked day, your column and its head in blue;
  - the coming-up blue edge on the card, the Key and the strip;
  - Start / orange chips are the go pair;
  - no faint-ink words on the Hub;
  - finished cards recede without opacity and keep their name ≥ 4.5:1;
  - the picked machine is blue.
- **[src/features/journey-grid/session-colour-rules.test.ts](../../src/features/journey-grid/session-colour-rules.test.ts):**
  - Finish, the paused clock's button and the number chips are the go pair, restated on hover;
  - no white words on accent fills;
  - elevated flags are an opaque warm amber, never an rgba wash;
  - the session's neutrals and accents equal the Hub's;
  - small words use the muted ink, never the faint;
  - exactly 18 control rules draw `--jg-control-edge` (3:1), and separators keep the soft line.
- **[src/elevation.test.ts](../../src/elevation.test.ts):**
  - every depth token is declared in `:root` and `.dark`, and Tailwind's `shadow-sm` to `shadow-2xl` map onto `--elev-1..5`;
  - every shadow is navy, never black; resting shadows blur ≤ 18px;
  - lighter is higher (raised above the card, well below it, tray below the page; light raised never white);
  - raised controls keep a 3:1 edge;
  - across all of `src`: most-seen panels lift, no shadow is raw black, nothing animates a shadow, no crescent borders, nothing tappable under 40px, no well in `bg-muted` or `--bg-dark-3`.
- **Beside them** (round doc list): `studio-tokens.test.ts`, `admin-tokens.test.ts`, `learning-tokens.test.ts`, `journey-grid/contrast.test.ts`, `home-screen.test.ts`, `theme-color.test.ts`, `loading-mark.test.ts`, `my-studio/look.test.ts` ([navy-frame round doc L117-127](../../docs/rounds/2026-10-04-navy-frame.md)).

### Inferences
- **The guards are strong on WCAG 2 and on structure.** They cover copies equal to the Hub, opaque dark fills, no white on orange, and the navy shadows.
- **The guards have three blind spots:**
  - APCA, or any polarity-aware contrast: the dark secondary-ink weakness in §3 passes every guard;
  - the legacy `--green/--red/--amber/--yellow` pigments and `--chart-*`, which no test measures;
  - the identity palettes (calendar tones, Learning families, the print report), which are exempt by design, so their rgba washes and white-on-orange avatar are unguarded.
- **The CVD guard covers 2 pairs** (hero vs crimson, ok vs crimson) of the roughly 12 meaning pairs measured in §4. Crimson vs plum, blue vs plum, the rep-quality green vs crimson and the coming-up rail vs the grey edge have no colour-blind check.

### Gaps
- `journey-grid/contrast.test.ts`, `studio-tokens.test.ts`, `admin-tokens.test.ts` and `learning-tokens.test.ts` were not read line by line. They are summarised from the round doc only.
