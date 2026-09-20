# 07 — The visual and interaction system

Area: design tokens, CSS, theme, typography, spacing, shared UI primitives, touch ergonomics, motion, loading and empty states, and how consistently screens use them.

Everything below was measured on the clone at `/home/claude/journey` and every `file:line` was opened and read.

---

## 1. What this area does — my interpretation

**There is no single design system. There are three, layered on top of each other, and none of them is finished.**

**Layer 1 — the shadcn/Tailwind root.** `src/index.css` (581 lines) is the root stylesheet. It imports Tailwind 4, `tw-animate-css`, `shadcn/tailwind.css` and the self-hosted Geist variable font, then declares four `@theme inline` blocks that map Tailwind utility names onto CSS custom properties: the standard shadcn semantic set (`--background`, `--card`, `--primary`, `--destructive`, `--ring`, `--chart-1..5`, `--sidebar-*`), a "Journey System Beta" set (`--bg-dark`, `--bg-dark-2/-3`, `--ink-d1/d2/d3`, `--cta`, `--cyan`, `--green`, `--red`, `--amber`), a Mindbody set (`--mb-*`), and a retint of Tailwind's own `slate-*` ramp. `:root` holds the light values and `.dark` the dark ones, toggled by `ThemeProvider` adding a class to `<html>`. Two deliberate overrides of Tailwind's own scales live here and are the best engineering in the file: the elevation scale (`--shadow-sm…2xl` redefined as two-part tinted shadows that collapse in dark mode) and the `slate-*` retint (so ~1,400 hardcoded `slate-*` classes track the brand neutral in light mode without editing the call sites). Both are documented in long, honest comments.

**Layer 2 — per-feature palettes.** Fifteen feature areas each declare their *own* copy of the same palette under their own prefix: `--eq-*` (equipment), `--adm-*` (admin), `--jg-*` (journey grid), `--br-*` (briefing), `--cal-*`, `--cat-*`, `--ford-*`, `--pr-*`, `--rb-*`, `--sr-*`, `--st-*`, `--tp-*`, `--wk-*`, `--psub-*`, `--cr-*`. Twelve are in a `*.tokens.css` file; the rest are inline `:root` blocks at the top of a feature's main CSS. Each defines the same twenty-odd roles (`bg / surface / surface-2 / surface-3 / border / border-strong / ink / ink-2 / ink-muted / ink-faint / hero / hero-text / hero-fill / live / live-text / ok / warn / alert / radius / shadow`), usually with byte-identical values, sometimes not. `admin.tokens.css` says so out loud in its own header: "Values are lifted DELIBERATELY, unchanged, from trainer-profile.tokens.css, which lifted them from equipment.tokens.css." Together these 15 namespaces produce 792 distinct CSS variable names across 1,442 definition lines.

**Layer 3 — raw values in components.** 2,240 Tailwind palette colour classes (`bg-slate-800`, `bg-amber-500`, `text-rose-400` …) across 61 files, 372 raw hex literals in non-test `.ts/.tsx`, 226 more in non-token CSS, and 245 `rgb()/rgba()` literals — which are hex in decimal and invisible to any hex grep. 750 arbitrary font sizes written as `text-[11px]`, `text-[9px]`, `text-[7px]`.

**How a screen picks a layer is historical, not principled.** The newer feature screens — `SessionNowBar.tsx`, `JourneyGrid.tsx`, `BriefingScreen.tsx`, `MyStudioView.tsx`, `OverviewPage.tsx` — contain **zero** Tailwind colour classes and zero hex: they are pure BEM (`jg-nb__sbtn`, `br__cta`, `pl__tab`) against their feature's token file, and they are genuinely good. The older screens — `ClientsView.tsx` (the Hub, 82 palette classes), `ProfileHeader.tsx` (88 classes, 14 hex), `WorkoutTrackerView.tsx` (49), `PerformanceEntryDialog.tsx` (45), `LoginScreen.tsx` (13 hex) — are Tailwind utility soup. A trainer walks between the two styles constantly: Hub (soup) → Briefing (tokens) → Tracker (soup) → Now Bar (tokens) → Post-session (mixed). That transition is exactly what "some screens don't match the rest" means, and index.css's own comments say the team has already chased this twice.

**The shared component library is essentially unadopted and, where it is used, is the wrong density for the floor.** `src/components/ui/` holds 17 shadcn-style primitives (1,432 lines) wrapping `@base-ui/react` 1.4.0 — one library, no Radix, one icon set (lucide). But only 29 of 703 files import `Button`, against **787 raw `<button>` elements in 212 files**. And the primitives ship shadcn's *desktop* density unchanged: `Button`'s size ladder is 24/28/32/36px and `Input` is `h-8` (32px). **Not one variant of the shared button reaches the project's own 40px minimum.**

**Theme is delegated, not chosen.** `ThemeProvider` defaults to `"system"`, so whether the gym floor renders light or dark is decided by whatever each iPad's Appearance setting happens to be. 939 `dark:` variants exist, but 174 `bg-white`/`text-white` uses have no dark counterpart, and three screens compute the header's theme from the *stored preference* rather than the *resolved* theme — which produces white-on-white in the default configuration (finding #1).

---

## 2. Anomalies

### Critical

**1. The global header renders white-on-white in the default theme setting.**
**Critical** · `src/AppContent.tsx:1525`, `src/features/briefing/BriefingScreen.tsx:456`, `src/components/VictoryHUDScreen.tsx:346`
`variant={theme === "light" ? "light" : "dark"}`, where `theme` comes from `useTheme()` and is the raw stored preference — `"light" | "dark" | "system"`, defaulting to `"system"` (`ThemeProvider.tsx:25`). On an iPad in Light appearance with the default `"system"` preference, `<html>` gets class `light`, so `--bg-dark-2` resolves to `#FFFFFF` (`index.css:291`) — but `variant` is `"dark"`, so `AppHeader.tsx:40` paints `bg-bg-dark-2` (white) and `AppHeader.tsx:53` and `:80` paint the logo and the studio-name button in `text-white`. **The studio switcher is invisible.** `VictoryHUDScreen.tsx:346` hardcodes `variant="dark"`, so the post-session header is broken in light mode unconditionally.
**Why it matters:** this is the default configuration, on the multi-tenant control that tells a trainer which studio they are writing to. It is also a one-line class of bug that will recur.
**Direction:** `ThemeProvider` should expose a `resolved: "light" | "dark"` alongside the preference and listen to `matchMedia` changes; `AppHeader` should read the resolved theme itself and drop the `variant` prop entirely.

**2. The sign-in screen is unreadable in light mode, and the file says so.**
**Critical** · `src/components/LoginScreen.tsx:98, 127, 136`
`text-slate-900 dark:text-white/90` on `bg-[#1d2736]/90` — a surface that is dark in *both* themes. In light mode both provider button labels and the footer are near-black on near-black. The file's own header comment (lines 8–11) records this as a known defect from the Sep 17 trim and it is still shipping.
**Why it matters:** first screen, every day, on the studio's own hardware. Nothing else in the app is judged before this.
**Direction:** the login surface is a fixed dark canvas — give it fixed light-on-dark tokens and stop routing it through theme-sensitive classes.

**3. The set-entry dialog — the single most-used control on the floor — breaks the 40px rule four ways and the dark theme once.**
**Critical** · `src/features/tracker/PerformanceEntryDialog.tsx:257, 263, 311, 331, 344, 364, 386–402`
REPS/TSC mode toggle is `h-6` = **24px** (257, 263). The per-side rep steppers are `w-8 h-8` = **32px** (311, 331, 344, 364). The Set Quality / RPE row — Poor · Completed · Max Strength, the control the whole kaizen mark depends on — is `h-9` = **36px** with `text-[11px]` uppercase `tracking-widest` labels (386–402). And the unselected quality buttons are `bg-white` with **no `dark:` counterpart** (389, 395, 401), so in dark mode they are three white pills carrying `dark:text-slate-400` text — roughly 2.6:1, well under AA.
**Why it matters:** the-floor.md says the iPad is set down at the machine and looked at twice; this is the "twice". A 24px target is a mis-tap; a mis-tap on quality is a wrong kaizen mark on a client's record.
**Direction:** rebuild this dialog against the Now Bar's control sizes (44px/42px/46px, which already exist and already work) rather than its own Tailwind sizes.

**4. `src/lib/scroll-lock.ts` is written entirely against Radix, which the app no longer uses.**
**Critical (as dead safety net)** · `src/lib/scroll-lock.ts:41, 48–50, 53, 56`
The file documents `DismissableLayer` setting `body.style.pointerEvents = "none"` and `react-remove-scroll` setting `data-scroll-locked`. The app is on `@base-ui/react` 1.4.0, which does neither: `@base-ui/utils/useScrollLock` sets `html.style.overflowY/X` (or body's), `body.style.position/height/width` and `scrollbarGutter`, and base-ui marks open layers with `data-open`, not `data-state="open"`. So: line 41 can never fire; the guard at 48–50 (`[data-radix-popper-content-wrapper], [role='dialog'][data-state='open'], [role='menu'][data-state='open']`) **never matches anything**, which means the "don't unlock a dialog that legitimately wants the page still" protection is off; line 53's `data-scroll-locked` check is dead. `afterOverlayClose()` (`AppContent.tsx:1390`) still spends two animation frames "letting Radix's own cleanup effects run".
**Why it matters:** the iPad frozen-screen bug this was written for was real. The safety net against its recurrence is now a no-op, and the 90 lines of comments will send the next reader down a Radix rabbit hole. There is also a leftover `w-(--radix-select-trigger-width)` at `src/features/trainer-profile/EditTrainerModal.tsx:621` that resolves to nothing.
**Direction:** rewrite against base-ui's actual behaviour (`[data-open]`, inline `overflowY`/`position` on `html`/`body`) or delete it and rely on base-ui's own cleanup — but decide, don't leave a net with no rope in it.

### High

**5. Fifteen parallel copies of one palette, with silent drift, and a test on exactly one pair.**
**High** · `src/features/equipment/equipment.tokens.css:13–96`, `src/features/admin/admin.tokens.css:23–105`, `src/features/journey-grid/journey-grid.tokens.css`, `src/features/progress-report/progress-report.tokens.css:33`, `src/features/client-profile/profile-nav.css:14–23`, `src/features/subjective-report/subjective-report.css:16–31`, `src/features/studio-tasks/studio-tasks.css:19–27`, + 8 more
Fifteen namespaces define the same twenty roles. Measured drift on the light `:root` values:

| role | the majority | the outliers |
|---|---|---|
| `hero` | `#ef5302` (12 files) | `--pr-hero: #f06c22` |
| `warn` | `#a2457e` plum (adm, eq, tp) | `#8a5300` brown (br, cat, wk) |
| `alert` | `#c0203f` (adm, eq, tp) | `#a32014` (wk) |
| `radius` | `14px` (12 files) | `--jg-radius: 10px`, `--pr-radius: 24px` |
| `ink-faint` | `#848e95` (12 files) | `--psub-ink-faint: #6d7780` |
| `bg` | `#f1f5f8` (12 files) | `--psub-bg: #e8eef2` |

`admin-tokens.test.ts` keeps `--adm-*` byte-identical to `--eq-*` — excellent, and the only such guard. The other thirteen copies drift freely.
**Why it matters:** CLAUDE.md says "use the design tokens … no raw hex" and names two files; there are fifteen. A colour correction now has to be made fifteen times, and nothing catches the fourteen that are missed.
**Direction:** one root palette, feature files become semantic *aliases* (`--jg-hero: var(--brand-hero)`), and extend `admin-tokens.test.ts`'s comparison across every namespace.

**6. 2,240 Tailwind palette classes bypass the token system entirely — but they are concentrated in 61 files.**
**High** · worst: `src/components/ClientProgressReportView.tsx` (194 uses), `src/types/journal.ts` (134), `src/features/admin/import/LegacyChartImporter.tsx` (133), `src/features/tracker/PerformanceEntryDialog.tsx` (124), `src/features/trainer-profile/EditTrainerModal.tsx` (117), `src/features/client-profile/ProfileHeader.tsx` (88), `src/AppContent.tsx` (88), `src/components/CreateClientModal.tsx` (85), `src/components/WorkoutChartGrid.tsx` (82), `src/components/ClientsView.tsx` (82)
238 distinct classes across **17 colour families**: slate 1,441, amber 184, emerald 122, orange 88, rose 85, red 84, sky 74, blue 50, indigo 30, violet 23, cyan 14, teal 13, purple 10, stone 9, fuchsia 8, neutral 4, zinc 1. The `slate-*` retint in `index.css` covers 1,441 of them; the other 799 are raw Tailwind pigment with no relationship to the brand.
**Why it matters:** `index.css`'s own comment says a plan existed to move `text-slate-400` (77 uses) to `text-muted-foreground` in "the next commit". It did not happen. Meanwhile indigo, violet, fuchsia, teal and purple are in the product and in no palette.
**Direction:** 61 files is a finite list. Ban the non-slate families first (799 uses, and violet/fuchsia/indigo/purple/teal is 85 of them — a morning's work), then the rest.

**7. `src/types/journal.ts` — a types file — carries 134 Tailwind colour classes.**
**High** · `src/types/journal.ts`
61 lines contain palette classes; it is the third-worst colour file in the app and it is not a component.
**Why it matters:** presentation decided in a type module cannot be themed, cannot be tested for contrast, and is invisible to anyone auditing the UI.
**Direction:** move the class strings to a `journal-tone.ts` in the feature, or better, to data attributes resolved in CSS.

**8. There is no type scale — there is a cloud of ~90 sizes, 80% of it under 12px.**
**High** · app-wide; worst single file `src/features/admin/import/LegacyChartImporter.tsx` (11 × `text-[7px]`)
750 arbitrary sizes in TSX across **27 distinct values** — `text-[11px]` ×426, `text-[10px]` ×121, `text-[12px]` ×68, `text-[13px]` ×28, `text-[9px]` ×24, **`text-[7px]` ×17**, `text-[8px]` ×4, plus 12.5/11.5/10.5/9.5/13.5px. Add 516 uses of the Tailwind scale (10 values) and **60 distinct `font-size:` values across 1,299 CSS declarations** (221 at 12px, 215 at 11px, 185 at 13px, 171 at 10px, 28 at 9px, 5 at 8.5px). **601 of the 750 arbitrary sizes (80%) are 11px or smaller.** Set beside 1,062 `uppercase` declarations, 874 `font-bold`/`font-black` uses and 24 distinct `letter-spacing` values, the house style is *small, heavy, uppercase, letterspaced*.
**Why it matters:** the-floor.md's iPad is set down on a machine and read at arm's length in a bright room; 7–9px letterspaced uppercase is unreadable there. And "premium" in the restaurant sense is large, calm and sparse — this is the opposite.
**Direction:** pick six sizes (e.g. 11/13/15/18/24/32), express them as tokens, ban `text-[Npx]` and bare `font-size:` in a check, and let the floor screens use the top half of the scale.

**9. Names are truncated in 25+ places, and the documented recovery is a hover tooltip.**
**High** · `src/components/AppHeader.tsx:79` is the clearest case
CLAUDE.md: "names are never truncated" and "hover is never the only way to find something". The studio switcher truncates the studio name at `max-w-[14ch] sm:max-w-[20ch] lg:max-w-[28ch]`, with a comment that says *"This control SWITCHES STUDIOS. A half-rendered name is genuinely ambiguous across a franchise with similar location names, so the full one has to stay recoverable"* — and recovers it with `title={studioName}` (line 60), a hover tooltip that does not exist on a touch-only iPad. Both rules broken in one control, with the need for the first one written in the comment.
Other truncations on human/machine/studio names (not free text): `ClientsView.tsx:1161` (trainer first name), `ClientInfoSheet.tsx:262` and `client-dossier/ClientSnapshot.tsx:149` (`clientDisplayName`), `schedule/ScheduleBlock.tsx:200` (client name on the day grid), `AccessRequestView.tsx:203`, `trainer-profile/EditTrainerModal.tsx:641, 800, 848` (staff full names, studio names), `client-profile/ProfileHeader.tsx:519, 617, 338` (trainer names, studio name), `VictoryHUDScreen.tsx:165` and `WorkoutTrackerView.tsx:2979` and `tracker/PerformanceEntryDialog.tsx:161` (machine names), `WorkoutChartGrid.tsx:540`, `admin/machines/StudioInventoryManager.tsx:95`, `EditRoutineDrawer.tsx:885` (routine name), `NavButton.tsx:51` (tab labels). In CSS: `.jg-machine__label` (`journey-grid.css:640`), `.cal-board__name` (`calendar.css:445`), `.cal-lane__name` (`:614`), `.cal-block__name` (`:668`).
The baseline of 54 is the TSX count only; CSS adds 43 more `text-overflow: ellipsis` rules — **97 truncation sites total**.
**Direction:** decide per *kind*: names wrap (two lines, `break-words`, as `StudioSelectionView.tsx:174` already does correctly with an explicit comment), free text clamps. Then delete `title=` as an information channel entirely.

**10. Not one variant of the shared `Button` meets the 40px rule, and it propagates into every dialog.**
**High** · `src/components/ui/button.tsx:22–34`, `src/components/ui/dialog.tsx:78`, `src/components/ui/sheet.tsx:237`
`default: h-8` (32px), `xs: h-6` (24), `sm: h-7` (28), `lg: h-9` (36), `icon: size-8` (32), `icon-xs: size-6` (24), `icon-sm: size-7` (28), `icon-lg: size-9` (36). `Input` is `h-8` (`input.tsx:12`). `Checkbox` is `size-4` with an `after:-inset-y-2` expansion → 32px tall hit area (`checkbox.tsx:11`). `Switch` is `h-[18.4px]` + `after:-inset-y-2` → 34.4px (`switch.tsx:17`). `Slider` thumb is `size-3` + `after:-inset-2` → 28px (`slider.tsx:44`). Every dialog's and sheet's close button is `size="icon-sm"` = **28px**.
**Why it matters:** the one place a 40px floor could be enforced for free is the primitive, and it is set to shadcn's desktop defaults. `ThemeToggle.tsx:11–16` even documents the mismatch ("Left to its own default it renders as a bordered 32px square among round 40px ghost buttons") and then keeps `size-8` as its default.
**Direction:** re-cut the size ladder for a held iPad — default 44, sm 40, lg 52, icon 44 — and make `xs` unavailable outside dense admin tables.

**11. `env(safe-area-inset-*)` is used in nine places but the viewport meta never opts in, so every one of them resolves to 0.**
**High** · `index.html:5`, used at `src/AppContent.tsx:1861` and `:1932`, `src/features/briefing/briefing.css:556`, `src/features/journey-grid/journey-grid.css:2415`, `src/features/relay/board/relay.css:306, 348, 349`
`<meta name="viewport" content="width=device-width, initial-scale=1.0" />` — no `viewport-fit=cover`. Per spec the safe-area environment variables are 0 without it.
**Why it matters:** the bottom nav's `pb-[env(safe-area-inset-bottom,0px)]` and the Now Bar's and briefing CTA's bottom padding are all doing nothing. On a home-indicator iPad the bottom bar sits under the indicator.
Related, same file: **no `apple-mobile-web-app-capable`, no `apple-mobile-web-app-status-bar-style`, no `theme-color`, no manifest, no apple-touch-icon**. A trainer who adds this to the home screen gets a Safari tab with a URL bar, permanently eating vertical space on every floor screen.
**Direction:** add `viewport-fit=cover`, a minimal manifest and the Apple meta tags; it is the cheapest floor-ergonomics win available.

**12. Fonts: an unused family is downloaded from a third-party CDN, and the request is chained behind a 400 kB stylesheet.**
**High** · `src/index.css:1`
`@import url('…Saira+Condensed:ital,wght@0,600;0,700;0,800;1,600;1,700;1,800&family=Inter:wght@400;500;600;700&display=swap')`. **Inter is not referenced anywhere in the codebase** — `--font-sans` is `'Geist Variable'` (self-hosted). So four Inter weight files are fetched for nothing. The import survives verbatim into the built CSS (`dist/assets/index-*.css` line 1), which means the browser must download and parse a **400 kB / 60.5 kB gz** stylesheet before it even discovers the font CSS URL, then do DNS + TLS + CSS + font for `fonts.googleapis.com` and `fonts.gstatic.com`. There is **no `<link rel="preconnect">`** in `index.html`. Saira Condensed is the display face for every heading, tab and label in the app (`--jg-font-display`, `--rb-font-display`, `--cr-font-display`, `--font-display`), so on studio Wi-Fi the brand voice is the last thing to arrive and every heading re-flows.
**Direction:** drop Inter, self-host Saira Condensed's three roman weights through `@fontsource` alongside Geist (the italics are used — check which), and preconnect or eliminate the third party.

**13. The floor's set dialog is 400px wide on a 1024–1366px iPad, and six other dialogs are stuck at 384px.**
**High** · `src/features/tracker/PerformanceEntryDialog.tsx:150`; `src/components/ClientProfileView.tsx:1444, 1682`, `src/components/MachineSettingsDashboardModal.tsx:163`, `src/features/admin/overview/ReviewNotesDialog.tsx:49`, `src/features/client-notes/QuickNoteDialog.tsx:63`, `src/features/ford/FordDetailDialog.tsx:151`
`DialogContent`'s base class ends in `sm:max-w-sm` (`dialog.tsx:65`), and tailwind-merge keeps a responsive class beside a plain one, so any caller passing a bare `max-w-2xl` gets **384px** above 640px. The primitive documents the trap at lines 56–64 and it keeps happening — `MachineSettingsDashboardModal` and `QuickNoteDialog` both ask for `max-w-2xl` (672px) and render at 384px. `PerformanceEntryDialog` does pass `sm:max-w-100`, i.e. it deliberately renders the floor's most important dialog at **400px** — under a third of a landscape iPad — which is *why* its controls had to shrink to 24–36px.
**Direction:** make the width a `size` prop on `DialogContent` (`sm | md | lg | full`) so a caller cannot get it wrong, and give the set dialog a floor-sized layout.

**14. `title=` is the app's tooltip strategy: 80 native tooltips on 51 screens, against one use of the `Tooltip` primitive.**
**High** · `src/components/ui/tooltip.tsx` is imported by exactly one file (`src/components/mindbody/SyncStatusBadge.tsx`); native `title=` on lowercase elements appears 80 times in 51 files — e.g. `AppHeader.tsx:60`, `schedule/ScheduleBlock.tsx:186, 228, 261`, `StudioSelectionView.tsx:144`, `machine-fit/ui/SetupRow.tsx:135`
`title` renders only on hover. On a touch-only iPad the content is unreachable. `ScheduleBlock.tsx:186` uses it to explain *"no Max Strength profile yet — it will link itself once the next Mindbody sync creates one"*, which is real information a trainer needs.
**Direction:** every `title` that carries information (not decoration) becomes visible text, a tappable info affordance, or an `aria-label` plus an on-screen line. Then ban `title=` on interactive elements.

### Medium

**15. Five loading idioms, and the rule against them is already written down.**
**Medium** · `docs/KNOWN-TRAPS.md` § Layout and CSS: *"One loading mark … never hand-roll another `animate-spin` div."*
Measured: `LoadingMark`/`LoadingArea` 33 uses in 10 files; `animate-spin` 33 uses in 22 files; lucide `Loader2` 38 uses in 15 files; `animate-pulse` 12 in 8 files; an `adm-shimmer` skeleton in `admin.css`; and 73 literal "Loading" strings. `LoadingMark.tsx:9` says "there were ~20" spinners — there are still ~22 files spinning.
**Why it matters:** the wait state is the single most repeated moment in the app and it looks different five ways. `LoadingMark` itself is well built (tokens, `role="status"`, `aria-live`, a `prefers-reduced-motion` fallback) — it just did not displace the alternatives.
**Direction:** a codemod plus a grep check in CI; there is nothing to design here, only to enforce.

**16. 37 distinct empty-state class names and no shared empty state.**
**Medium** · 31 CSS files define one: `.adm-empty`, `.br__empty`, `.cal-empty`, `.cfl-empty`, `.cr-empty`, `.ds__empty`, `.eq-empty`, `.fit-empty`, `.ford-empty`, `.hsd-empty`, `.ini__empty`, `.nc-empty`, `.pk-empty`, `.pl__empty`, `.rb-empty`, `.rt-empty`, `.sh__empty`, `.sra-…` …
Four of them (`admin.css:699`, `calendar.css:170`, `routines.css:374`, `equipment.css:901`) are the same six lines copy-pasted with `gap: 6px` vs `8px` and `padding: 28px 18px` vs `28px 20px`. `ford.css:334` is something else entirely (13px muted text, no centring). There is no `EmptyState` component anywhere in `src`.
**Why it matters:** CLAUDE.md's "not enough data yet" rule means empty states are a *product surface* in this app, not an edge case — they carry the sentence that protects a client's migrated history. They should look and sound identical everywhere.
**Direction:** one `EmptyState` primitive (icon, sentence, optional action), and delete the 37.

**17. 178 token definitions have no reader — including the entire Mindbody token block.**
**Medium** · `src/index.css:106–136, 351–381, 473–475` (49 lines); `src/features/catalog/catalog.tokens.css` (36 dead), `wiki.tokens.css` (33), `calendar.tokens.css` (14), `briefing.tokens.css` (12), `progress-report.tokens.css` (10)
Not one `--mb-*` variable or `bg-mb-*` / `text-mb-*` utility is referenced anywhere in `src` — the state, sync, access and origin colour sets, plus `--mb-card-pad`, `--mb-roster-row-h: 64px`, `--mb-ledger-rail-w`, `--mb-motion-hydrate: 220ms`, `--mb-motion-state-shift: 400ms`. A motion spec and a row height that nothing reads. Across all CSS, **178 of 792 declared variables (22%)** are never referenced from CSS or TS.
Separately, four `var()` calls reference variables that are defined nowhere and have no fallback, so the declaration is simply dropped: `--wk-accent` and `--wk-accent-fill` (`src/features/wiki/wiki.css:552`).
**Why it matters:** CLAUDE.md's own rule — "Every number has a reader … a write with no reader is a bug to fix" — applies exactly. It also means the token files cannot be trusted as documentation of what the app looks like.
**Direction:** delete the Mindbody block (or wire it up — the Hub's `ScheduleBlock` is hand-rolling those state colours in Tailwind right now), and add the unused-token check to the same test that compares palettes.

**18. Two colour classes reference tokens that do not exist, so the style silently does nothing.**
**Medium** · `src/components/VictoryHUDScreen.tsx:456`, `src/components/WorkoutChartGrid.tsx:313, 488`
`text-bg-dark-1` — `index.css` defines `--color-bg-dark`, `-2` and `-3`, never `-1`. The "Save note" button on the post-session screen is `bg-cyan` with no resolved text colour, so it inherits `--ink-d1`; in dark mode that is `#FFFFFF` on `#38BDF8` ≈ 1.9:1. `border-slate-250` is not a Tailwind rung and is not defined — those borders are invisible.
**Direction:** these are only findable by scanning; a build-time check that every `bg-|text-|border-` custom name resolves to a declared `--color-*` would catch the class permanently.

**19. Raw hex on the floor's primary navigation and on the client profile header.**
**Medium** · `src/components/NavButton.tsx:14, 34`; `src/features/client-profile/ProfileHeader.tsx:212, 380, 479, 592, 619`
`NavButton` defaults `activeColor = "text-[#115E8D]"` and inactive `text-[#68717A] hover:text-[#115E8D]`. `ProfileHeader` writes `bg-[#F06C22]` (212, 619), `text-[#F06C22]` (592), `bg-[#0a548b]/10 text-[#034a84] dark:bg-[#4a9fd8]/15 dark:text-[#7cc0ee]` (380) — that is `--eq-live` / `--eq-live-text` / their dark pair, copied by value with hand-written dark variants — and `bg-[linear-gradient(135deg,#ef5302_0%,#f36d21_100%)]` (479), a gradient between two of the five brand oranges.
App-wide the raw-hex picture: **293 distinct hex colours in 1,569 occurrences, of which 185 sit within RGB distance 12 of another.** Five oranges (`#f06c22` ×145, `#f36d21` ×18, `#ef5302` ×17, `#f37427` ×3, `#eb6e21` ×2, plus `#ff9800` at `LoginScreen.tsx:139`) and six blues (`#38bdf8` ×57, `#0a548b` ×49, `#115e8d` ×32, `#034a84` ×20, `#4a9fd8` ×20, `#005187` ×2). Worst TSX files: `ConsultationWizard.tsx` (46), `LegacyChartImporter.tsx` (32), `WorkoutChartGrid.tsx` (29), `MachineSettingsDashboardModal.tsx` (17), `CreateClientModal.tsx` (17). Worst CSS outside token files: `subjective-report.css` (68 — Pulse carries a *whole inline palette*), `studio-tasks.css` (37), `clinical-review.css` (34), `profile-nav.css` (34). And 245 `rgb()/rgba()` literals, 36 distinct triples, which no hex grep will ever see — `rgba(240,108,34,0.3)` appears 18 times and *is* `#F06C22`.
**Direction:** a single check that fails on `#rrggbb` and on `rgb(`/`rgba(` with literal channels outside the designated token files; fix the 10 worst files first (they hold ~60% of it).

**20. "Red is reserved for rep quality" is stated in CLAUDE.md and contradicted by a token file's own comment.**
**Medium** · `src/features/equipment/equipment.tokens.css:49–57`; 142 red/rose palette-class uses in 32 files; 81 `var(--*-alert)` uses in CSS
`equipment.tokens.css` deliberately gives a high-importance client note "the SAME crimson the Journey Grid uses for a set that needs work, so 'this is the one that matters' is one colour across both screens". That is a defensible design call — and the direct opposite of the rule in CLAUDE.md. Meanwhile red/rose is also destructive actions (`StrongConfirmationModal.tsx:98`), errors (`LoginScreen.tsx:66`), clinical priority flags (`schedule/ScheduleBlock.tsx:219`), and the "Poor" quality button (`PerformanceEntryDialog.tsx:389`).
**Why it matters:** if red means five things it means nothing, and the one place it is supposed to be unmistakable — rep quality — loses.
**Direction:** pick one. Either red is *only* the kaizen mark and everything else moves to the plum/amber alert ramp that already exists, or the rule is rewritten to say what red actually means.

**21. `ConditionChip` — the control that tells a trainer about a client's clinical condition — is 11px italic condensed uppercase at ~2:1 contrast.**
**Medium** · `src/components/ConditionChip.tsx:15, 18`
`text-[11px] uppercase font-display italic tracking-wider`, and for the non-critical severity `bg-cyan-500/10 border border-cyan/30 text-[#84B5EE]` — `#84B5EE` on a light card is about 2.1:1, well under AA for any text. "Critical" is `text-cta` (`#F06C22`, ~3.0:1 on white) with a `bg-red-500/10` fill and a `border-cta/30` edge: three different reds/oranges in one chip.
**Why it matters:** this is safety information on a gym floor, drawn in the smallest, most decorative type in the app.
**Direction:** clinical chips get the largest label size in the scale, non-italic, on the alert ramp with a shape difference (as `QualityMark` already does so well) rather than a colour difference.

**22. `StrongConfirmationModal` is a hand-rolled modal with no focus management, and its close button is 36px and unlabelled.**
**Medium** · `src/components/StrongConfirmationModal.tsx:42, 51–56, 103`
A `fixed inset-0` div, not `Dialog`: no `role="dialog"`, no `aria-modal`, no focus trap, no Escape handler, no focus restore. The × at line 51 is `p-2` + a 20px icon = 36px with no `aria-label`, `title` or `sr-only` text. Line 103 hardcodes the label "Wipe Data" into a component whose prop is `isDestructive`.
**Direction:** rebuild on `Dialog`; pass the confirm label in.

**23. `ThemeProvider` reads `localStorage` in a `useState` initialiser with no guard, and never listens for a system theme change.**
**Medium** · `src/components/ThemeProvider.tsx:29–31, 33–49`
`localStorage.getItem` throws in a locked-down Safari / blocked-cookies context; here it runs during the first render of the provider that wraps the entire app, so the app fails to boot rather than degrading. And with `theme === "system"` there is no `matchMedia("(prefers-color-scheme: dark)")` change listener — an iPad that flips to dark at sunset mid-session keeps rendering light until the page is reloaded.
**Direction:** try/catch the read, and subscribe to the media query while the preference is `"system"`.

**24. Sixteen layout breakpoints for a device family with about four widths.**
**Medium** · CSS `min-width` at 640, 700, 760, 768, 820, 860, 880, 900, 1000, 1024, 1180 (11 distinct); `max-width` at 480, 520, 560, 640, 700, 720, 760, 767, 820, 860, 880, 899, 1023 (13 distinct); plus Tailwind's `sm/md/lg/xl/2xl` (315 / 89 / 30 / 21 / 6 uses)
iPad portrait widths are 768, 810, 834, 1024; landscape 1024, 1080, 1112, 1366. So an iPad Air in portrait (820) and an iPad Pro 11" in portrait (834) land on opposite sides of the 820px breakpoint and get different layouts in the same orientation.
**Direction:** name two or three breakpoints after the device states that matter ("portrait", "landscape", "wide landscape") as tokens, and delete the rest.

**25. 400 kB of critical-path CSS, of which most is not needed for first paint.**
**Medium** · `src/main.tsx:4–11`
`main.tsx` eagerly imports `index.css` plus `journey-grid.css` (2,605 lines), `equipment.css` (1,240), `calendar.css` (914), `subjective-report.css` (1,242), `catalog.tokens.css` + `catalog.css` (368), `studio-tasks.css` (429). Built result: `dist/assets/index-*.css` = **400,334 bytes / 60,573 gz**, out of 796 kB of CSS overall. For comparison the entry JS chunk is 380 kB / 103 kB gz — the stylesheet is over half the critical-path payload by gzip.
**Why it matters:** on studio Wi-Fi this is in front of the font request (finding #12) and in front of first paint.
**Direction:** these files only need to be global because of selector-ordering assumptions; move each import to the feature that owns it and check what actually breaks.

### Low

**26. The bottom nav's active state is a solid fill in light mode and a 10% wash in dark.**
**Low** · `src/components/NavButton.tsx:15`
`activeBg = "bg-sky-500 dark:bg-sky-600/10"` — the light value is missing its `/10`. In light mode the active tab's icon box is a solid `sky-500` square carrying a `text-[#115E8D]` icon (≈2.3:1); in dark it is the intended faint wash. Every trainer tab except the live-session one uses the default.

**27. Floor controls under 40px that survived into the best-built screen.**
**Low–Medium** · `src/features/journey-grid/journey-grid.css:1424` (`.jg-nb__wbtn`, width 30px), `:1437` (`.jg-nb__wbtn--quiet`, width 24px), `:2031` (`.jg-machine__more`, 22×22px), `:1293` (`.jg-nb__kicker`, 9px uppercase at 0.12em)
The Now Bar is otherwise exemplary — 44px steppers, 42px reason chips, 46px Next, 40px flag line, `touch-action: manipulation`, `-webkit-tap-highlight-color: transparent`, a correctly `@media (hover: hover)`-guarded reveal at `:2044`. The stopwatch play/pause/reset and the per-machine ⋯ are the holdouts.
Across all feature CSS, 49 control-looking rules declare a height under 40px, e.g. `client-profile/profile-nav.css:259` (`.ptab-strip__chip`, 26px), `subjective-report.css:171` (`.sr-pill`, 26px), `client-history.css:846` (`.hsd-toggle`, 28px), `admin/overview/overview.css:70` (`.adm-ov__chip-count`, 28px), `relay/board/relay-strip.css:5` (`.rls__chip`, 32px), `equipment.css:417` (`.eq-btn`, 34px), `admin.css:569` (`.adm-btn--sm`, 34px).

**28. A fake button on the sign-in screen, and a third-party texture image.**
**Low** · `src/components/LoginScreen.tsx:139`, `:31`
Line 139 renders "No Account? Sign in to Request Access." as a `<div>` styled exactly like a call to action — bold, uppercase, orange, `transition-colors` — with no handler and no role. Line 31 loads a decorative background from `https://www.transparenttextures.com/patterns/hexellence.png`: an uncontrolled third-party request (and a referrer leak) on the auth screen of a clinical app.

**29. `MaxStrengthLogo` takes theme as a prop rather than reading it, and defines 14 more font sizes.**
**Low** · `src/components/MaxStrengthLogo.tsx:20, 33–47, 63–68`
`theme = 'light'` is a prop, so `ClientProgressReportView.tsx:1131/1137` renders two logos and picks one, and `StudioSelectionView.tsx:516` gets the light default regardless of theme. Raw hex `#667279`, `#005187`, `#eb6e21` (the fifth orange). Text sizes 8/10/13/14/16/22/24/27/28/36/40/48/52/64px.

**30. 62 distinct border-radius values in CSS and 37 `rounded-*` variants in TSX.**
**Low** · app-wide
CSS: `999px` ×141, `12px` ×93, `10px` ×92, `8px` ×39, `6px` ×25, `9px` ×17, `4px` ×12, `2px` ×10, `7px` ×9, `11px` ×9 — seven adjacent values between 6 and 12. TSX: `rounded-xl` ×245, `rounded-2xl` ×127, `rounded-full` ×93, `rounded-lg` ×82, bare `rounded` ×74, plus `rounded-[32px]`, `rounded-[40px]`, `rounded-[25px]`, `rounded-[24px]`, `rounded-[20px]`, `rounded-[10px]`, `rounded-[4px]`. `index.css` defines a proper `--radius-sm…4xl` ladder off one `--radius: 0.625rem`; almost nothing uses it.
Related: **68 distinct button base class names** (`.adm-btn`, `.br__link-btn`, `.cal-seg__btn`, `.eq-btn`, `.fit-btn`, `.ford-btn`, `.jg-btn`, `.pl__btn`, `.rb-row__btn`, `.rt-btn`, `.sr-btn`, `.tp-btn`, `.wk__btn`, …) and **165 card/panel class names**.

**31. Three animation systems, and reduced-motion is honoured in 13 of 58 CSS files and 2 of 703 components.**
**Low** · `motion/react` in 16 files, `tw-animate-css` utilities 31 uses, 14 hand-written `@keyframes` (`adm-pulse`, `adm-shimmer`, `cp-in`, `cp-up`, `cs-pulse`, `eq-slide-in`, `jg-clock-blink`, `jg-older-pulse`, `kudos-pop`, `lm-pulse`, `lm-wave`, `nu-handed`, `pt-in`, `sr-close`)
`NavButton.tsx:55` runs a `motion` `layoutId` transition on every tab change with no reduced-motion check. `LoadingMark` and the feature CSS files that do check are the exception, not the rule.
**Separately, and more important for the floor:** nothing confirms a logged set to a trainer who is not looking at the screen. There is no haptic (`navigator.vibrate`), no sound, no persistent "logged" state change large enough to catch peripherally — the confirmation is `.jg-nb__out.is-logged` swapping the fill and border of a 64px-wide input (`journey-grid.css:1365`, `:1377`). The-floor.md's trainer sets the iPad down and looks away; the app has no eyes-off feedback at all.

**32. Contrast is tested rigorously — for 2 of 15 palettes.**
**Low (as a gap)** · `src/features/journey-grid/contrast.test.ts`, `src/features/admin/admin-tokens.test.ts`
Both compute real WCAG ratios from the actual token files, in both themes, including the row-banding overlay. They are the best design-system artefacts in the repo. Nothing equivalent covers the other 13 palettes, the 2,240 Tailwind palette classes, the 372 raw hexes, the 750 arbitrary font sizes, or the 40px rule. `npm run lint` is `tsc --noEmit`; there is no ESLint config at all, so no lint rule can be attached to any of this today.

---

## 3. Metrics

| Measure | Value | How |
|---|---|---|
| Non-test `.ts/.tsx` files / lines | 703 / 172,313 | `wc -l` |
| CSS files / lines / bytes | 58 / 27,168 / 836 kB | `find src -name '*.css'` |
| Built CSS, entry chunk | **400,334 B raw / 60,573 B gzip** | `npx vite build` |
| Built CSS, all chunks | 796 kB | `du -c dist/assets/*.css` |
| Distinct hex colours in `src` (non-test) | **293** in 1,569 occurrences | regex + dedupe, lowercased |
| …within RGB distance 12 of another | **185** (25 clusters) | union-find over RGB distance |
| Brand oranges / blues in play | 5–6 / 6 | see finding #19 |
| `rgb()/rgba()` literals | 50 tsx + 195 css, 36 distinct triples | regex |
| Raw hex, non-test `.ts/.tsx` | 372 occurrences, 54 distinct | regex |
| Raw hex, CSS outside token + index files | 226 occurrences, 96 distinct | regex |
| Palette namespaces (`--eq-`, `--adm-`, …) | **15** defining the same ~20 roles | `:root` block diff |
| CSS variables declared / definition lines | 792 distinct / 1,442 | regex |
| CSS variables with no reader | **178 (22%)** | cross-reference css + ts |
| Tailwind palette colour classes | **2,240** in **61 of 703** files, 238 distinct, 17 families | regex |
| Raw `<button>` vs files importing shared `Button` | **787 in 212 files** vs **29 files** | regex |
| Shared `Button` size ladder | 24 / 28 / 32 / 36 px — max 36 | `button.tsx:22–34` |
| Distinct font sizes | 10 Tailwind + **27 arbitrary** + **60 in CSS** | regex |
| Arbitrary `text-[Npx]` uses | **750**, 80% ≤ 11px | regex |
| CSS `font-size:` declarations | 1,299 | regex |
| `uppercase` (CSS + class) | 1,062 | regex |
| `font-bold` / `font-black` | 492 / 382 | regex |
| Distinct `border-radius` values | 62 CSS + 37 `rounded-*` | regex |
| Distinct button / card class names | 68 / 165 | regex on CSS selectors |
| Distinct empty-state class names | **37**, in 31 files, no shared component | regex |
| Truncation sites | 54 tsx + 43 CSS = **97**; ~25 on names | read each |
| `hover:` classes | **419**; `group-hover:` 24; hover-only reveals 3 (all guarded or admin-only) | regex + read |
| Native `title=` tooltips on HTML elements | **80 in 51 files**; `Tooltip` primitive used in **1** file | regex |
| Icon-only buttons with no accessible name | **1 real** (`StrongConfirmationModal.tsx:51`) out of 896 scanned — labelling is otherwise good | scripted scan |
| `focus-visible` coverage | 95 tsx uses / 21 files; 183 CSS uses / 37 of 58 files | regex |
| Loading idioms | 5 (LoadingMark 33 / animate-spin 33 / Loader2 38 / animate-pulse 12 / shimmer 1) | regex |
| Light-only `bg-white`/`text-white` (no `dark:`) | **174** | scripted scan |
| `dark:` variants | 939 | regex |
| `prefers-reduced-motion` | 13 of 58 CSS files; 2 of 703 components | regex |
| Layout breakpoints | 11 `min-width` + 13 `max-width` + 5 Tailwind | regex |
| `useState` / `useEffect(` / `useLayoutEffect(` | 1,332 mentions (1,072 calls) / 308 / 10 | regex — matches the brief's baseline |
| Design-system tests | 2 (journey-grid contrast, admin↔equipment parity); no ESLint config | `find` |

---

## 4. Direct questions for AJ

**On enforcement**

1. `npm run lint` is just `tsc --noEmit` — there is no ESLint in this repo at all. Would you accept a lint gate that **fails the build** on a raw hex, an `rgb()` literal, a `text-[Npx]`, a non-slate Tailwind colour family and a `<button>` with a computed height under 40px? Nothing else will hold: the "no raw hex" rule, the "one loading mark" rule and the "40px" rule are all written down already and all three are broken hundreds of times.

2. You have **one** type scale decision to make and it fixes ~90 sizes: six steps or eight? And do you accept that the floor screens must use the *top* half — that 9px and 7px labels simply cease to exist, even where they currently fit?

3. `contrast.test.ts` and `admin-tokens.test.ts` are genuinely excellent — computed AA ratios from the real token files. Do you want that generalised to all 15 palettes now, or do you want the 15 collapsed to 1 first and the test written once?

**On the theme**

4. Should the gym floor be a **single fixed theme** with no toggle? Today `ThemeProvider` defaults to `"system"`, so which theme a trainer sees is decided by whatever each shared iPad's Appearance setting happens to be — and that is precisely the configuration in which the global header renders white-on-white (finding #1). A dark floor also removes 174 broken light-only surfaces from the equation overnight.

5. If the answer to 4 is "keep both": light or dark is the one that gets tested? Right now neither does — `LoginScreen` is broken in light, `PerformanceEntryDialog`'s quality buttons are broken in dark, and the Victory HUD header is broken in light.

**On the component layer**

6. The shared `Button` tops out at 36px and 673 of 703 files don't use it anyway. Is the answer to (a) re-cut the primitives for a held iPad and codemod the 787 raw `<button>`s onto them, or (b) accept that the BEM+feature-CSS screens (`jg-nb__*`, `br__*`, `pl__*`) are the real system and finish moving everything there? Both are defensible; doing neither is what is happening now.

7. `equipment.tokens.css` deliberately gives a high-importance client note the **same crimson as a set that needs work**, to make "this is the one that matters" one colour. CLAUDE.md says red is reserved for rep quality. Which sentence survives?

**On the floor**

8. The set-entry dialog is pinned to 400px on a 1366px landscape iPad, which is *why* its controls are 24–36px. Why is the most important interaction on the floor a small modal at all, rather than the full screen — or the Now Bar, which already has 44px controls and already works?

9. The-floor.md says the iPad is set down at the machine and the trainer looks away. **Nothing in the app confirms a logged set without being looked at** — no haptic, no sound, no large persistent state change. Is that deliberate (the clicker is the source of truth, the app is just a log), or is it a missing feature?

10. `AppHeader.tsx:60` truncates the studio name and recovers it with a hover tooltip, in a comment that explains why the full name must stay recoverable across a franchise with similar location names. Across the app there are 80 native `title=` tooltips and one use of the real `Tooltip` primitive. On a touch-only iPad none of them exist — is the rule "names never truncate, they wrap", and `title` is banned outright?

**On what "premium" means here**

11. Right now the house style is 1,062 uppercase runs, 874 bold/black weights, 601 font sizes at 11px or smaller, 62 border radii, 293 colours, and a metallic-ring sign-in button built from three stacked gradient divs. A five-star restaurant's menu is the opposite of that: few sizes, a lot of white space, one accent, almost no borders. **Does "premium" here mean more restraint — fewer colours, fewer borders, bigger type, more space — or do you actually want the decoration?** Everything in section 2 is cheaper to fix if the answer is restraint.

12. Is the `index.css` `slate-*` retint a permanent decision or a bridge? It is a clever, well-documented hack that makes 1,441 wrong classes look right in light mode — which also removes any pressure to fix them, and its own comment describes a follow-up commit ("the next commit moves them to `text-muted-foreground`") that never landed.
