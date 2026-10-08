# Modern web-platform UI capabilities in iPadOS Safari (Home Screen web app), as of Oct 8 2026, for Journey

Method note for the report writer: version numbers below come from the raw data files of **MDN browser-compat-data 8.1.4** (its data timestamp is 2026-10-01; it already lists Safari iOS 27, released 2026-09-14) and **web-features 3.40.1** (published 2026-10-06; the source of the Baseline "newly / widely available" dates). I downloaded both from the npm registry and queried them directly, because webkit.org, react.dev, apple.com and macrumors.com could not be reached from this environment. In the data, "widely available" is the "newly available" date plus 30 months (for example oklab: newly 2023-05-09, widely 2025-11-09). "iOS" below means Safari on iOS/iPadOS, which share version numbers. iPadOS 17 ships Safari 17.0–17.6, so a feature "reaches iPadOS 17" only if its version is 17.6 or lower, and only on a device updated to that point release.

- BCD = [MDN browser-compat-data 8.1.4](https://github.com/mdn/browser-compat-data) (cited per feature by its data path)
- WF = [web-features 3.40.1 / Baseline](https://github.com/web-platform-dx/web-features)

## Which iPads and Safari versions are in play

### Takeaway
Every iPad named in the brief (10th-gen iPad, iPad mini 6, newer minis) can run iPadOS 27 / Safari 27, released Sep 14 2026. So "not on 26" is a question of whether the studios update their iPads, not of hardware. The 10th-gen and A16 base iPads have **sRGB** screens, while every iPad mini from the 6th generation has **P3**. None of these models has ProMotion, so 60 fps is the ceiling.

### Cited Findings
- Safari iOS release dates (BCD `browsers.safari_ios`): 17.0 2023-09-18 · 17.2 2023-12-11 · 17.4 2024-03-05 · 17.5 2024-05-13 · 17.6 2024-07-29 · 18.0 2024-09-16 · 18.2 2024-12-11 · 18.3 2025-01-27 · 18.4 2025-03-31 · 26.0 2025-09-15 · 26.2 2025-12-12 · 26.4 2026-03-24 · 26.5 2026-05-11 · 26.6 2026-07-27 · **27.0 2026-09-14 (current)** · 27.2 in beta — [BCD](https://github.com/mdn/browser-compat-data)
- iPadOS 27 was announced Jun 8 2026, with release confirmed for Sep 14 2026 — [9to5Mac](https://9to5mac.com/2026/09/09/ipados-27-will-be-launched-on-september-14/)
- iPadOS 27 supports the iPad 9th gen, 10th gen and A16, and the iPad mini 6 and later. It drops the 8th-gen iPad, 5th-gen mini, 3rd-gen Air, 1st-gen 11" Pro and 3rd-gen 12.9" Pro — [MacRumors](https://www.macrumors.com/2026/06/08/ipados-27-drops-support-for-a-wave-of-ipads/); [9to5Mac](https://9to5mac.com/2026/06/08/can-your-ipad-run-ipados-27-check-here/); [EveryMac](https://everymac.com/systems/apple/ipad/ipad-faq/ipados-27-supported-devices-ipad-system-requirements.html)
- iPad mini (6th gen): Apple's spec page lists a "wide colour display (P3)", 326 ppi, fully laminated, 500 nits — [Apple tech specs](https://support.apple.com/kb/SP850) / [Apple 111886](https://support.apple.com/en-gb/111886)
- iPad (10th gen): Apple's spec page lists a 10.9" IPS display, True Tone, 500 nits and **no colour gamut**. Croma's review says it is "limited to sRGB" and not laminated — [Apple 111840](https://support.apple.com/en-in/111840); [Croma](https://www.croma.com/unboxed/10th-generation-apple-ipad-all-you-need-to-know)
- iPad (A16, 11th gen): True Tone, "does not have Wide-color (P3) capability or ProMotion support" — [EveryMac](https://everymac.com/systems/apple/ipad/specs/apple-ipad-a16-11-inch-11th-gen-2025-a3354-wi-fi-only-specs.html)
- iPad mini (A17 Pro): "True Tone, P3 wide colour and ultra-low reflectivity" — [Apple iPad mini](https://www.apple.com/za/ipad-mini/)
- Journey today: React is locked at **19.2.5**, Tailwind at **4.3.0** and `motion` at 12.38.0 (`package-lock.json`). Dark mode is `@custom-variant dark (&:is(.dark *))` with `@theme inline` (`src/index.css` lines 56–58). It already uses `color-mix()` in 16 stylesheets, `content-visibility: auto` in `admin/ahead/ahead.css` and `client-directory/client-directory.css`, no `oklch()` and no `backdrop-filter` (repo grep, Oct 8 2026).

### Inferences
- If every studio iPad is updated, Safari 27 is the floor and almost everything in this document is usable. If some are held on iPadOS 17 (possible only by not updating, or on iPads older than the 9th gen), the floor drops to 17.x and every feature from 18+ must be a progressive enhancement. **A one-line boot-report field recording the Safari version** (Journey already sends one boot report per cold open, `src/features/boot-timing/`) would settle the floor with data instead of a guess.
- From general knowledge, not re-verified this session: the iPad 9th gen is A13, the 10th gen A14, the mini 6 A15. These are the "older iPad" GPU classes the perf lab emulates.
- A P3-tuned palette gains nothing on the 10th-gen and A16 iPads, which are likely the commonest floor devices. It is visible only on minis, Airs and Pros.

### Gaps
- I could not fetch Apple's own iPadOS 27 compatibility page, so the device list comes from MacRumors, 9to5Mac and EveryMac summaries (they agree with each other).
- Which iPadOS versions the studios' iPads actually run is unknown. Journey's boot report could answer it.
- The last supported iPadOS for older models (for example iPad 6th gen → 17, iPad 7th gen → 18) is from memory and was not re-verified.

## Colour: OKLCH, color-mix, relative colour, light-dark, P3, contrast/transparency queries, Tailwind v4

### Takeaway
OKLCH, `color-mix()`, `color(display-p3 …)` and `@media (color-gamut: p3)` all reach iPadOS 17 and are Baseline widely available, so a palette can be authored in OKLCH today at no runtime cost. Relative colour syntax is correct only from Safari 18. `contrast-color()` needs 26. **`prefers-reduced-transparency` is not supported in Safari at all.** A P3 orange or blue looks more vivid only on P3 iPads (minis, Airs, Pros), never on the 10th-gen or A16 base iPad.

### Cited Findings
- `oklch()` / `oklab()`: iOS **15.4**. Baseline widely available since 2025-11-09. Mixed-type parameters from 16.2 — [BCD css.types.color.oklch](https://github.com/mdn/browser-compat-data); [WF oklab](https://github.com/web-platform-dx/web-features)
- `color-mix()`: iOS **16.2**, widely available since 2025-11-09. A variadic `color-mix()` (more than two colours) arrived only in iOS **27** — [BCD css.types.color.color-mix](https://github.com/mdn/browser-compat-data); [WF color-mix](https://github.com/web-platform-dx/web-features)
- Relative colour syntax: `oklch(from …)` is fully correct only from iOS **18**. 16.4–17.x was a partial build on an older spec: "calculations with `h` channel values do not work correctly, requiring values to be specified with units (deg)". `oklab(from …)` is correct from 16.4, and `color(from …)` is fully correct from 18. Baseline newly available 2024-09-16 — [BCD css.types.color.oklch.relative_syntax](https://github.com/mdn/browser-compat-data); [WF relative-color](https://github.com/web-platform-dx/web-features)
- `light-dark()`: iOS **17.5**, newly available 2024-05-13. Image values inside `light-dark()` arrived in iOS 27 (newly 2026-09-14) — [BCD css.types.color.light-dark](https://github.com/mdn/browser-compat-data); [WF light-dark, light-dark-image](https://github.com/web-platform-dx/web-features)
- `color-scheme` property: iOS 13. `<meta name="color-scheme">`: iOS 12.2 — [BCD](https://github.com/mdn/browser-compat-data)
- `color()` with `display-p3`: full in iOS 15 (partial from 10.3). `display-p3-linear` from 26.2. The `color-function` feature is widely available since 2025-11-09 — [BCD css.types.color.color](https://github.com/mdn/browser-compat-data); [WF color-function](https://github.com/web-platform-dx/web-features)
- `@media (color-gamut: p3)`: iOS 10 — [BCD css.at-rules.media.color-gamut](https://github.com/mdn/browser-compat-data)
- `contrast-color()`: iOS **26**, newly available 2026-04-10 — [BCD](https://github.com/mdn/browser-compat-data); [WF contrast-color](https://github.com/web-platform-dx/web-features)
- `prefers-contrast`: iOS 14.5 (widely since 2024-11-30). `forced-colors`: iOS 16 (widely since 2025-03-12). `prefers-reduced-motion`: iOS 10.3. **`prefers-reduced-transparency`: `safari_ios=false`** (Chrome 118 only; Firefox behind a flag) — [BCD css.at-rules.media.*](https://github.com/mdn/browser-compat-data); [WF](https://github.com/web-platform-dx/web-features)
- `dynamic-range` media query: iOS 13.4. `dynamic-range-limit` (HDR images and video): iOS 26 — [BCD](https://github.com/mdn/browser-compat-data)
- Tailwind v4's core "specifically depends on" Chrome 111, **Safari 16.4** and Firefox 128 — [Tailwind docs: Compatibility](https://tailwindcss.com/docs/compatibility)
- Tailwind v4's default palette is defined in OKLCH (for example `--color-gray-50: oklch(0.984 0.003 247.858)`). Colours are exposed as `--color-*` CSS variables, custom colours go in `@theme`, and alpha is adjusted with `--alpha()` / `bg-x/75` — [Tailwind docs: Colors](https://tailwindcss.com/docs/colors)
- `@theme inline` makes utilities use the variable's value (needed when tokens reference other variables). `@theme static` emits every variable. `--color-*: initial` clears the default palette — [Tailwind docs: Theme](https://tailwindcss.com/docs/theme)
- A class-driven dark variant is `@custom-variant dark (&:where(.dark, .dark *));` — [Tailwind docs: Dark mode](https://tailwindcss.com/docs/dark-mode)
- Tailwind's changelog shows its `color-mix()` output carries `@supports`-wrapped fallbacks ("Ensure color-mix(…) polyfills create fallbacks…", "Fix Safari devtools rendering issue due to color-mix fallback"), plus a fix to "Prevent achromatic theme colors from shifting hue when mixed in polar color spaces like oklch". The latest tailwindcss on npm is 4.3.3 — [Tailwind CHANGELOG](https://github.com/tailwindlabs/tailwindcss/blob/main/CHANGELOG.md)

### Inferences
- **Moving Journey's tokens from hex to OKLCH is safe on every iPad in scope** (15.4+) and costs nothing at runtime, because colours are resolved during style computation. The real gain is in authoring: a perceptually even `--n-*` ramp, the same orange lightness in both modes, and easy chroma control. The vivid gain is limited to P3 iPads.
- Recommended pattern: keep an sRGB-safe value as the token and override it inside `@media (color-gamut: p3)` with an `oklch()` or `color(display-p3 …)` value of higher chroma. All contrast tests (Journey's 4.5:1 and 3:1 guards) should keep computing on the **sRGB value**, because that is what the 10th-gen iPad shows.
- For the brand orange in particular, a P3 orange would read noticeably more saturated on a mini. Navy words on orange keep their contrast as long as lightness (the L in OKLCH) is held. That is my reading of OKLCH; it needs measuring.
- Relative colour syntax (derive hover, pressed and tint states from one token) is attractive, but it renders **wrong on iPadOS 17** when hue maths is used. Until the floor is 18, use `color-mix(in oklch, var(--x), …)` (16.2+) for derived states. Journey already does this in 16 stylesheets.
- `light-dark()` works only if `color-scheme` is set for each theme (for example `.dark { color-scheme: dark }`). Journey's `.dark`-class token blocks already do the same job, so `light-dark()` is optional tidying, not a capability gain. This is from my understanding of the spec; MDN's `light-dark()` page was not fetched.
- Because Safari can't read iOS's "Reduce Transparency" setting, any translucent or glass surface needs to be acceptable to users who turned that setting on, or be opaque by default.
- `forced-colors` has little value on iPad, where iPadOS has no Windows-style forced-colours mode (general knowledge). `prefers-contrast: more` (iOS "Increase Contrast") is the meaningful accessibility query to honour.

### Gaps
- How Safari gamut-maps an `oklch()` value outside sRGB on an sRGB screen (clip, or CSS Color 4 chroma reduction) was not verified, and that changes how a P3 orange looks on a 10th-gen iPad if it is not wrapped in `@media (color-gamut: p3)`.
- WCAG 2.x contrast is defined for sRGB. I found no source on how to measure P3 colours for contrast.

## Motion and transitions: View Transitions, React `<ViewTransition>`, scroll-driven animations, `@starting-style`, `linear()`

### Takeaway
Same-document View Transitions are in Safari 18.0, with classes and types in 18.2. **React 19.3 (Sep 9 2026) made `<ViewTransition>` and `addTransitionType` stable.** Journey is on React 19.2.5, so it needs only a version bump, not a new library. `@starting-style` (17.5), `transition-behavior: allow-discrete` (17.4) and `linear()` spring easing (17.2) reach iPadOS 17. Scroll-driven animations need Safari 26. `interpolate-size` / `calc-size()` (animating to `height: auto`) are **not in Safari**.

### Cited Findings
- `document.startViewTransition`, `ViewTransition`, `view-transition-name`, `:active-view-transition`: iOS **18.0**. Same-document view transitions became Baseline newly available on **2025-10-14** (Firefox 144) — [BCD api.Document.startViewTransition](https://github.com/mdn/browser-compat-data); [WF view-transitions](https://github.com/web-platform-dx/web-features)
- `view-transition-class`, `startViewTransition({types})`, `ViewTransition.types`, `:active-view-transition-type()`: iOS **18.2** — [BCD](https://github.com/mdn/browser-compat-data)
- Cross-document view transitions (`@view-transition`): iOS 18.2, not Baseline (Firefox lacks it) — [BCD css.at-rules.view-transition](https://github.com/mdn/browser-compat-data); [WF cross-document-view-transitions](https://github.com/web-platform-dx/web-features)
- **Not in Safari:** element-scoped `Element.startViewTransition` (Chrome 147), `view-transition-group` (Chrome 140), `ViewTransition.waitUntil` (Chrome 144) — [BCD](https://github.com/mdn/browser-compat-data)
- React 19.3 (dated 2026/09/09): "View Transitions and Fragment Refs… are now stable in React 19.3". `<ViewTransition>` animates enter, exit, update and share using the browser's View Transition API — [React blog: React 19.3](https://react.dev/blog/2026/09/09/react-19-3) (read from its [source on GitHub](https://github.com/reactjs/react.dev/blob/main/src/content/blog/2026/09/09/react-19-3.md)). npm `react` latest is 19.3.0 — [npm react](https://www.npmjs.com/package/react)
- "Updates outside of a Transition don't trigger animations… State updates inside of startTransition, a `<Suspense>` reveal, or an update from useDeferredValue" do. `addTransitionType` adds browser view-transition types, so CSS can use `:active-view-transition-type(...)` — [React blog: React 19.3](https://react.dev/blog/2026/09/09/react-19-3)
- "React automatically calls `startViewTransition` itself… if you have something else on the page running a ViewTransition React will interrupt it." `<ViewTransition>` "creates an image that can be moved around, scaled and cross-faded… This can lead to better performance". "React doesn't automatically disable animations" for reduced motion; "always use the `@media (prefers-reduced-motion)` media query". Two mounted `<ViewTransition>`s with the same name "will cause View Transitions to error" — [React reference: ViewTransition](https://react.dev/reference/react/ViewTransition) (from its [GitHub source](https://github.com/reactjs/react.dev/blob/main/src/content/reference/react/ViewTransition.md))
- Scroll-driven animations (`animation-timeline`, `scroll-timeline`, `view-timeline`, `animation-range`, `timeline-scope`, WAAPI `rangeStart`/`rangeEnd`): iOS **26.0**. Not Baseline (Firefox only in preview) — [BCD css.properties.animation-timeline](https://github.com/mdn/browser-compat-data); [WF scroll-driven-animations](https://github.com/web-platform-dx/web-features)
- `@starting-style`: iOS **17.5**. `transition-behavior`: iOS **17.4**. Both newly available 2024-08-06. "display animation" (animating `display`): iOS 18, not Baseline — [BCD](https://github.com/mdn/browser-compat-data); [WF starting-style, transition-behavior, display-animation](https://github.com/web-platform-dx/web-features)
- `linear()` easing function: iOS **17.2**, Baseline **widely** available since 2026-06-11 — [BCD css.types.easing-function.linear-function](https://github.com/mdn/browser-compat-data); [WF linear-easing](https://github.com/web-platform-dx/web-features)
- `@property` (registered custom properties): iOS 16.4, newly available 2024-07-09 — [BCD](https://github.com/mdn/browser-compat-data); [WF](https://github.com/web-platform-dx/web-features)
- `interpolate-size` and `calc-size()`: `safari_ios=false` (Chrome 129 only). `animation-trigger`: not in Safari — [BCD](https://github.com/mdn/browser-compat-data)
- Web Animations `Element.animate()`: iOS 13.4. `timeline` option: iOS 16 — [BCD](https://github.com/mdn/browser-compat-data)
- Journey's own rules: "a press… a transform, never an animated shadow". `motion` is kept off the first screen ("no charts, drag-and-drop or motion on it"), and the bundle budget is 480 KB gzip — [CLAUDE.md](../../CLAUDE.md)

### Inferences
- **Highest-value motion upgrade:** bump React to 19.3 and wrap the `currentView` screen switch in `AppContent.tsx`, the profile's four tabs and the Hub's day change in `<ViewTransition>`, triggered by `startTransition`. That gives native cross-fades and slides with **no new dependency and no first-screen weight beyond React's own code**. On iPadOS 17 (no `startViewTransition`) the update simply happens with no animation. I expect React to feature-detect the API, but did not verify it in React's source.
- Performance on A13–A15: a view transition snapshots the old and new states as images and animates them, by default with opacity cross-fades, which are compositor-friendly. The cost is GPU memory for full-screen snapshots and the capture step at the start, so keep transitions short (about 150–250 ms), keep named shared elements few, and never run one during the Active Session's set entry ("a tap on the floor never waits"). This is engineering inference; I found no iPad-specific measurement.
- Never animate box-shadow, `backdrop-filter` blur radius, width/height/top/left or a custom property that feeds paint, frame by frame, on these iPads. `transform` and `opacity` are the safe pair, and `filter: opacity()` likewise. This is general compositor knowledge, consistent with Journey's existing rule.
- `@starting-style` plus `transition-behavior: allow-discrete` can give sheets, toasts, popovers and `<dialog>` entry/exit animations in pure CSS on iPadOS 17.5+, replacing some `motion` use outside the first screen. `linear()` makes spring-like curves possible in CSS alone (widely available).
- Scroll-driven animations (a shrinking header, a progress rail) are iPadOS 26+ only and must be pure enhancement behind `@supports (animation-timeline: scroll())`.
- Animating to `height: auto` isn't possible in Safari. Use the `grid-template-rows: 0fr → 1fr` technique or a view transition instead (general CSS technique, not sourced here).

### Gaps
- No primary measurement of View Transition cost (snapshot memory, frame times) on A13/A14/A15 iPads was found. The perf lab (headless Chrome) can't reproduce Safari's compositor; CLAUDE.md says Safari Web Inspector on a real device is the instrument.
- Whether React 19.3's `<ViewTransition>` falls back silently when `document.startViewTransition` is missing was not confirmed from React's source.

## Layout: container queries, `:has()`, subgrid, nesting, `@layer`, `@scope`, anchor positioning, Popover, `<dialog>`, text-wrap, field-sizing, viewport units

### Takeaway
Container queries, container-query units, `:has()`, subgrid, nesting, `@layer`, `<dialog>`, `dvh`/`svh`/`lvh` and safe-area insets all reach iPadOS 17 and are widely available. **The Popover API is not reliable on iPad before 18.3**: before that, tapping outside doesn't dismiss. Anchor positioning is fully correct only in Safari 27. `@scope` had an input/textarea bug in 26.0–26.3. `field-sizing` needs 26.2, `text-wrap: pretty` needs 26, and `interpolate-size` isn't available.

### Cited Findings
- Container queries: iOS **16**, widely available since 2025-08-14. Container query length units: iOS 16. Style queries for custom properties: iOS **18** ("The document element cannot be a container", WebKit bug 271040), newly available 2026-05-19. Scroll-state queries and anchor-position queries: not in Safari. `@container` with an optional query: 26.4 — [BCD css.at-rules.container](https://github.com/mdn/browser-compat-data); [WF container-queries, container-style-queries](https://github.com/web-platform-dx/web-features)
- `:has()`: iOS **15.4**, widely available since 2026-06-19 — [BCD](https://github.com/mdn/browser-compat-data); [WF has](https://github.com/web-platform-dx/web-features)
- Subgrid: iOS **16**, widely available since 2026-03-15 — [WF subgrid](https://github.com/web-platform-dx/web-features)
- CSS nesting: full in iOS **17.2**. 16.5 was partial ("Does not support nested rules that start with a type selector"). Widely available since 2026-06-11 — [BCD css.selectors.nesting](https://github.com/mdn/browser-compat-data); [WF nesting](https://github.com/web-platform-dx/web-features)
- `@layer`: iOS 15.4, widely available since 2024-09-14 — [WF cascade-layers](https://github.com/web-platform-dx/web-features)
- `@scope`: iOS 17.4. Safari 26.0–26.3 marked partial ("CSS rules within @scope are not applied to `<input>` and `<textarea>` elements"); fixed in **26.4**. Newly available 2026-03-24 — [BCD css.at-rules.scope](https://github.com/mdn/browser-compat-data); [WF scope](https://github.com/web-platform-dx/web-features)
- Anchor positioning: `anchor-name`, `position-area`, `position-try-fallbacks`, `position-try-order` and `anchor()` in iOS **26**. `position-anchor` was partial in 26 ("initial value is auto instead of normal") and full in **27**. web-features lists anchor positioning as Safari iOS 27, not yet Baseline — [BCD](https://github.com/mdn/browser-compat-data); [WF anchor-positioning](https://github.com/web-platform-dx/web-features)
- Popover API: `showPopover`, `:popover-open` and `beforetoggle` in iOS 17, but `HTMLElement.popover` is marked **partial on iOS 17–18.2**: "On iOS and iPadOS, popovers are not dismissed when the user taps outside of the popover area" (WebKit bug 267688). Full from iOS **18.3**. Newly available 2025-01-27 — [BCD api.HTMLElement.popover](https://github.com/mdn/browser-compat-data); [WF popover](https://github.com/web-platform-dx/web-features)
- Invoker commands (`command` / `commandfor` on buttons): iOS **26.2**, newly available 2025-12-12 — [BCD html.elements.button.command](https://github.com/mdn/browser-compat-data); [WF invoker-commands](https://github.com/web-platform-dx/web-features)
- `<dialog>`: iOS 15.4 (widely). `requestClose()`: 18.4. The `closedby` attribute: not in iOS Safari (macOS Safari preview only) — [BCD html.elements.dialog](https://github.com/mdn/browser-compat-data)
- `text-wrap` property 17.4. `text-wrap: balance` **17.5** (newly 2024-05-13). `text-wrap: pretty` **26** (not Baseline) — [BCD css.properties.text-wrap](https://github.com/mdn/browser-compat-data); [WF text-wrap-balance, text-wrap-pretty](https://github.com/web-platform-dx/web-features)
- `field-sizing`: iOS **26.2**, newly available 2026-06-16 — [BCD](https://github.com/mdn/browser-compat-data); [WF field-sizing](https://github.com/web-platform-dx/web-features)
- `dvh`/`svh`/`lvh`: iOS 15.4, widely available since 2025-06-05. `env(safe-area-inset-*)`: iOS 11 — [BCD](https://github.com/mdn/browser-compat-data); [WF viewport-unit-variants](https://github.com/web-platform-dx/web-features)
- `overscroll-behavior`: iOS 16, partial ("no effect on scroll containers that have no scrollable overflow") — [BCD](https://github.com/mdn/browser-compat-data)
- `text-box` / `text-box-trim`: iOS 18.2 (not Baseline). `margin-trim`: 16.4 (Safari-led) — [BCD](https://github.com/mdn/browser-compat-data); [WF text-box](https://github.com/web-platform-dx/web-features)
- `scrollbar-gutter` 18.2. `scrollbar-color` 26.2 — [BCD](https://github.com/mdn/browser-compat-data)
- Grid lanes (masonry, `display: grid-lanes`): iOS **26.4**, not Baseline — [BCD css.properties.display.grid-lanes](https://github.com/mdn/browser-compat-data); [WF grid-lanes](https://github.com/web-platform-dx/web-features). Coverage of Safari 26.4 lists "CSS Grid Lanes, WebTransport, and the Keyboard Lock API" among 44 additions — [Apfelpatient](https://www.apfelpatient.de/en/news/apple-safari-26-4-44-features-and-191-bugs-fixed)
- `sibling-index()` / `sibling-count()`: iOS 26.2 (newly 2026-08-18). `progress()`: 26. `:open`: 26.5 (newly 2026-05-11) — [BCD](https://github.com/mdn/browser-compat-data); [WF](https://github.com/web-platform-dx/web-features)
- Safari 27: customizable `<select>` (`appearance: base-select`, single dropdown) and `::picker`, `overflow-anchor` (scroll anchoring) and `:heading`, all iOS **27** — [BCD](https://github.com/mdn/browser-compat-data). Coverage of Safari 27 describes customizable select keeping "keyboard navigation, screen readers, form submission, and validation intact", the `<model>` element on iOS and iPadOS, scroll anchoring, and about 850 fixes — [Technobezz](https://www.technobezz.com/news/safari-27-safari-mcp-844-fixes); [WebKit: News from WWDC26](https://webkit.org/?p=17967)
- **Not in Safari:** `reading-flow`, `if()`, `interactivity`, `moveBefore()`, `scroll-marker-group` (CSS carousels), VirtualKeyboard API. `corner-shape` (squircles) and `@function` are only in Safari Technology Preview on macOS — [BCD](https://github.com/mdn/browser-compat-data)

### Inferences
- **Container queries are the layout feature with the most leverage for Journey.** One component (Hub card, roster row, Operations panel, machine card) can adapt to its column, the same code serving an iPad in portrait or landscape, a split pane from 860px, and a phone, instead of `usePhone()` branches and viewport media queries. Cost is small, and size containment can also cap layout work.
- `:has()` and subgrid are safe to adopt for parent-state styling and for columns aligned across rows on the 300-client roster. `:has()` selectors that match broadly (`body:has(...)`) can make style invalidation costly on big DOMs, so keep them scoped (general performance guidance, not sourced here).
- Popover: on iPadOS 17.0–18.2 a popover won't close on an outside tap, which breaks the expected (i) and menu behaviour on the floor. Either require 18.3+ or keep the current JS-driven menus. `<dialog>` with `showModal()` is safe everywhere in scope.
- Anchor positioning (tooltips and menus tethered to a trigger with no JS measuring) is the right long-term tool but needs iPadOS 26, and is fully correct only on 27. Not for tomorrow's overhaul unless every iPad is on 27.
- `text-wrap: balance` (17.5) suits headings and fits "names never truncated". `text-wrap: pretty` is ignored harmlessly where unsupported. `text-box-trim` (18.2) would optically centre the condensed Saira titles in buttons and chips, as an enhancement only.
- `field-sizing: content` (auto-growing note boxes) needs 26.2. Keep the current approach unless the floor is 26.2+.
- Avoid `@scope` while any iPad might be on 26.0–26.3 (inputs and textareas unstyled inside scopes). Journey's feature-prefix CSS convention already gives scoping.

### Gaps
- No iPad-specific data on the layout cost of container queries or `:has()` on a 300-row list was found.

## Depth and material: `backdrop-filter`, Liquid-Glass-like effects, layered shadows, `content-visibility` / `contain`

### Takeaway
`backdrop-filter` has worked prefixed since iOS 9 and unprefixed since 18, but it is the most expensive depth effect on older iPads. Reported failures cluster on **blurred elements inside scroll containers**, so keep it to a few small fixed surfaces or avoid it. `content-visibility: auto` (iOS 18; fully conformant 26) is the best rendering win for long lists. Journey already uses it in two places, and on iPadOS 17 it is ignored harmlessly. Static layered shadows are fine. Animated shadows are not.

### Cited Findings
- `backdrop-filter`: unprefixed iOS **18**, `-webkit-backdrop-filter` since iOS 9. Newly available 2024-09-16 — [BCD css.properties.backdrop-filter](https://github.com/mdn/browser-compat-data); [WF backdrop-filter](https://github.com/web-platform-dx/web-features)
- In a 2015 WWDC session WebKit explained that it renders the region behind the element again in an off-screen context, and that each extra pass costs, so the effect should be used sparingly (an old talk; the implementation may have changed) — [WWDC 2015 session 501 (index)](https://nonstrict.eu/wwdcindex/wwdc2015/501/)
- One open-source project traced blank screens while scrolling on iOS to **blurred cards inside an `overflow:auto` container**. Its fix removed `backdrop-filter` from scroll-container children and kept it only on fixed chrome (bottom nav, modals, toasts) — [yuvomi v0.52.26 release notes](https://newreleases.io/project/github/ulsklyc/yuvomi/release/v0.52.26)
- A Webflow user found a few blurred decorative shapes made Safari "practically unusable", while Chromium and Firefox were fine. Removing them fixed it (anecdotal) — [Webflow forum](https://discourse.webflow.com/t/my-site-is-extremely-slow-in-safari-practically-unusable/167272)
- A WebKit bug ties an iOS-only layout failure to the performance impact of CSS `blur()` — [WebKit bug 228312](https://bugs.webkit.org/show_bug.cgi?id=228312)
- Mitigation reported elsewhere: replacing a large decorative blur with a radial gradient gave a near-identical look at effectively no cost — [hontran.dev](https://www.hontran.dev/blog/website-animation-laggy-on-iphone)
- `content-visibility`: iOS **18**, but `auto` was partial until **26** ("Skipped content is not findable via find-in-page"). `contentvisibilityautostatechange` event: 18. Newly available 2025-09-15. `contain`: iOS 15.4 (widely). `contain-intrinsic-size` (including `auto none`): iOS 17 — [BCD css.properties.content-visibility, contain, contain-intrinsic-size](https://github.com/mdn/browser-compat-data); [WF content-visibility, contain](https://github.com/web-platform-dx/web-features)
- BCD carries an old Safari note on `box-shadow`: "Shadows affect layout in this browser… if you cast an outer shadow to a box with a width of 100%, then you'll see a scrollbar" — [BCD css.properties.box-shadow](https://github.com/mdn/browser-compat-data)
- `prefers-reduced-transparency` cannot be detected in Safari (see Colour) — [BCD](https://github.com/mdn/browser-compat-data)
- Journey already uses `content-visibility: auto` at `src/features/admin/ahead/ahead.css` (2×) and `src/features/client-directory/client-directory.css`. Journey's depth system specifies shadows "are the logo's navy, never black", with "no animated shadow" held by `src/elevation.test.ts` — [CLAUDE.md](../../CLAUDE.md)

### Inferences
- **Liquid-Glass-style material on the web means `backdrop-filter: blur() saturate()` plus translucency.** On A13–A15 iPads it is acceptable only on one or two small fixed surfaces: the navy frame bar if made translucent, or a sheet's scrim. Never on Hub cards, roster rows, session machine cards or anything inside a scrolling pane. Since Safari can't read "Reduce Transparency", glass also has to look acceptable to people who asked for less transparency. My recommendation for the overhaul is to **fake depth with opaque tonal surfaces and navy shadows (the current "Refined Lift" system), not real blur.**
- Layered `box-shadow`s cost paint when a layer is first rasterised and when it repaints, not per frame on a static list. On long lists they add up during scroll if rows repaint, for example when the Hub ticks. Keep two layers at most on list rows, and keep the press a transform (already the rule).
- Pair `content-visibility: auto` with `contain-intrinsic-size: auto <estimate>` on every long-list row (300-client roster, Directory, Ahead weeks, Activity Archive) so the scroll height stays stable. On iPadOS 17 it is ignored, so there is no downside. Since find-in-page is irrelevant in a Home Screen app, the pre-26 partial flag doesn't matter to Journey.
- `contain: content` (or `layout paint`) on independent cards limits how far a layout change spreads. It is safe everywhere in scope.

### Gaps
- I found no benchmark isolating `backdrop-filter` or many-layer `box-shadow` cost on A13/A14/A15 iPads, or GPU memory figures. All evidence is anecdotal or old. Safari Web Inspector's Layers and Timelines on a real 10th-gen iPad is the way to measure, as CLAUDE.md notes the perf lab can't see Safari's paint.

## Haptics, sound and staying awake on the iPad

### Takeaway
There is **no Vibration API** in iOS Safari. A native switch (`<input type="checkbox" switch>`, iOS 17.4) gives a system haptic when a person really toggles it. The trick of firing haptics from script is reported blocked from iOS 26.5. **Screen Wake Lock works in Home Screen web apps only from iPadOS 18.4**, and it is directly useful for an iPad set down at a machine during a session.

### Cited Findings
- `navigator.vibrate`: `safari_ios=false` — [BCD api.Navigator.vibrate](https://github.com/mdn/browser-compat-data)
- `<input type="checkbox" switch>`: iOS **17.4**, non-standard, Safari only — [BCD html.elements.input.switch](https://github.com/mdn/browser-compat-data); [Smashing Magazine](https://shop.smashingmagazine.com/2024/05/switching-it-up-html-latest-control/)
- A WebKit bug says haptic feedback for the switch was introduced with Safari 18.0, and argued that because scripts could generate vibrations, haptics should require user activation. The bug is marked resolved/fixed — [WebKit bug 285120](https://bugs.webkit.org/show_bug.cgi?id=285120)
- Ionic's feature request describes the technique: call `click()` on a label tied to a switch to make Safari emit the haptic — [ionic-framework #29942](https://github.com/ionic-team/ionic-framework/issues/29942)
- A third-party tester reports that programmatic haptics work from iOS 17.4 to 26.4 and that Apple patched the behaviour in iOS **26.5** (not confirmed by Apple) — [iOS Haptics Tester](https://rapidtoolset.com/en/tool/ios-haptics-tester)
- `ios-haptics` 3.2.0 (updated 2026-09-22) now overlays a transparent `<label>` wired to a hidden switch, so "when the user taps the element, the label forwards the tap to the switch as a trusted click, and safari triggers the native haptic feedback", which means it relies on a real tap — [npm ios-haptics](https://www.npmjs.com/package/ios-haptics)
- Screen Wake Lock: iOS 16.4, but partial until **18.4**: "Does not work in standalone Home Screen Web Apps" (WebKit bug 254545). Baseline newly available 2025-03-31 — [BCD api.WakeLock](https://github.com/mdn/browser-compat-data); [WF screen-wake-lock](https://github.com/web-platform-dx/web-features)
- Badging (`navigator.setAppBadge`): iOS 16.4, "supported for web apps saved to the home screen". Push (`PushManager`): iOS 16.4 for Home Screen web apps. `Notification` is undefined "unless the page is a web app saved to the home screen" whose manifest has a non-default `display` — [BCD api.Navigator.setAppBadge, api.PushManager, api.Notification](https://github.com/mdn/browser-compat-data)
- Journey policy: "Nothing contacts clients or trainers — no email, SMS or push outreach. In-app only" — [CLAUDE.md](../../CLAUDE.md)

### Inferences
- **Wake Lock is a concrete win for the floor.** Request `navigator.wakeLock.request('screen')` when a session starts, release it at Finish, and request it again on `visibilitychange` (the lock is released when the app is hidden; standard API behaviour). Feature-detect it: on iPadOS 17 to 18.3 in Home Screen mode it won't work, and the iPad's own Auto-Lock setting stays the fallback. Battery cost is the screen staying on, which is what the trainer wants mid-session. Adding it needs no library.
- Haptics: if Journey wants a felt "set saved" tick, the only route is styling real controls as native switches, or the `ios-haptics` label-overlay pattern on a real tap. Treat it as fragile (undocumented, already changed once in 26.5) and never as a confirmation the trainer relies on. Under "the app is a guide… never a coach", haptics would be a quiet acknowledgement at most.
- Push and notifications are technically available, but **forbidden by Journey's policy**. The app badge is not outreach, but it would be a new "ping-like" surface and needs AJ's OK.

### Gaps
- Apple has not documented whether a switch's haptic needs a user gesture after 26.5. The evidence is third-party.
- Sound: I didn't research Web Audio autoplay rules for Home Screen apps in this pass. Short UI sounds would need a user-gesture-unlocked `AudioContext` (general knowledge, unverified).

## Typography: variable fonts, tabular numbers, `font-size-adjust`, Dynamic Type

### Takeaway
Variable fonts, `tabular-nums` and `font-size-adjust` reach iPadOS 17. Respecting the iPad's Text Size setting is possible in a web app through Apple's `font: -apple-system-body` keyword on the root element (a non-standard WebKit extension), but the size is picked up only on reload. Fixed-height rows such as the Active Session's would need checking before adopting it.

### Cited Findings
- `font-variation-settings`: iOS 11, widely available since 2018. `font-variant-numeric: tabular-nums`: iOS 9.3 (widely) — [BCD](https://github.com/mdn/browser-compat-data); [WF font-variation-settings, font-variant-numeric](https://github.com/web-platform-dx/web-features)
- `font-size-adjust`: iOS 16.4; `from-font` and two-value syntax: iOS 17. Newly available 2024-07-25 — [BCD](https://github.com/mdn/browser-compat-data); [WF font-size-adjust](https://github.com/web-platform-dx/web-features)
- `text-autospace`: iOS 18.4. `hanging-punctuation`: full in 26.5. `font-palette`: 15.4. `text-box-trim`: 18.2 — [BCD](https://github.com/mdn/browser-compat-data)
- Dynamic Type on the web: Safari exposes the user's preferred size through `-apple-system-*` font keywords (body, headline, footnote…). Changing the size while a page is open usually needs a reload. Craig Hockenberry's site sets the keyword on the root `html` element, keeps its own typeface, and sizes headings in `em`, and changing iPad Text Size is reflected — [mjtsai: Dynamic Type on the Web](https://mjtsai.com/blog/2024/07/05/dynamic-type-on-the-web); [Vispero](https://vispero.com/resources/text-resizing-web-pages-ios-using-dynamic-type/)
- A 2020 WebKit bug noted different default sizes for these keywords on macOS and iOS (13px vs 17px) — [WebKit bug 215279](https://auto-bugs.webkit.org/show_bug.cgi?id=215279)
- Journey's type system: Saira Condensed self-hosted at 700 and 800; a type scale of 11 · 12 · 14 · 17 · 22 · 30; the Active Session has "nothing under 11px… each measured against its fixed row" — [CLAUDE.md](../../CLAUDE.md)

### Inferences
- `tabular-nums` on every number that changes in place (reps, weights, timers, counts, the Now Bar) is a free, safe polish.
- If Saira Condensed has a variable version, one variable file could replace the two static weights and allow in-between weights, such as a heavier title in dark mode. The bundle-size effect depends on the file (see Gaps).
- `font-size-adjust: from-font` (17+) can match Geist and Saira x-heights when they share a line, and tame fallback-font layout shift.
- Dynamic Type: Journey's root size is fixed (14px body, a fixed scale). Adopting `font: -apple-system-body` on `html` with `rem` scaling would honour trainers' iPad Text Size, but it collides with the fixed, measured rows of the Active Session and the "names never truncated" guards. A partial approach is possible: scale reading surfaces (notes, briefing, profile) and keep the session's measured rows fixed. The default size Safari returns (17px on iOS) differs from Journey's 14px base, so it would need a ratio, not a direct swap.

### Gaps
- Whether Saira Condensed is published as a variable font, and its file size against the two static weights, was not checked.
- No official Apple or WebKit reference page for the `-apple-system-*` keywords was reached. The sources are secondary.

## Home Screen web app specifics on iPadOS 17 / 18 / 26 / 27: status bar, `theme-color`, display-mode, iOS 26 "Open as Web App"

### Takeaway
From Safari 26, `theme-color` is used **only for installed web apps**, which Journey is, so its navy `theme-color` still applies. Ordinary Safari tabs now tint from the page's background and fixed elements instead. In iOS 26 every site added to the Home Screen opens as a web app by default. **A documented WebKit quirk means `@media (display-mode: standalone)` does not match in an installed iOS web app with `display: standalone`; `fullscreen` matches instead.** Journey has such a rule at `src/index.css:973`.

### Cited Findings
- `<meta name="theme-color">`: iOS 15. "From Safari on iOS 26, the theme color is only used for installed web apps." Not Baseline — [BCD html.elements.meta.name.theme-color](https://github.com/mdn/browser-compat-data); [WF meta-theme-color](https://github.com/web-platform-dx/web-features)
- Developer reports on Safari 26 tabs: the top bar's colour is taken from the html or body background instead of the meta tag. "By default, the tint color is taken from the body's background color, except when a fixed-position element is shown", whose background then colours the top and bottom areas — [Apple Developer Forums 801239](https://developer.apple.com/forums/thread/801239); [Ben Frain](https://benfrain.com/ios26-safari-theme-color-tab-tinting-with-fixed-position-elements/)
- In iOS and iPadOS 26 a website added to the Home Screen opens as a web app even without a manifest or `apple-mobile-web-app-capable`. An "Open as Web App" toggle in the Add to Home Screen dialog opts out. Safe-area CSS still needs `viewport-fit=cover` — [heise](https://heise.de/-10749652)
- `display-mode` media query, iOS 12.2: "In an installed web application with the display manifest member set to standalone, `display-mode: standalone` is false and `display-mode: fullscreen` is true" (WebKit bug 264218). In Safari itself, `display-mode: browser` is always true — [BCD css.at-rules.media.display-mode](https://github.com/mdn/browser-compat-data)
- Web app manifest: supported from iOS 15.4 — [WF manifest](https://github.com/web-platform-dx/web-features)
- `Screen.orientation`: iOS 16.4 — [BCD](https://github.com/mdn/browser-compat-data)
- Journey's setup: `viewport-fit=cover`, `apple-mobile-web-app-capable=yes`, `apple-mobile-web-app-status-bar-style=default`, `theme-color #002341` (rewritten by an inline script for the theme), and a manifest with `display: standalone`, `theme_color #002341` and `background_color #0A1C2C` (`index.html` lines 9–35, 83–87; `public/manifest.webmanifest`). `src/index.css` lines 973–979: `@media (display-mode: standalone) { html, html.dark, html body { background-color: var(--chrome) } }`, followed by an unconditional `html[data-app-h], html[data-app-h] body { background-color: var(--chrome) }`

### Inferences
- **The `display-mode: standalone` block at `src/index.css:973` probably never matches on the studio iPads**, because WebKit reports `fullscreen` for a `standalone` manifest. The `html[data-app-h]` rule after it seems to set the same navy anyway, so the visible effect may be nil. Any new "only in the Home Screen app" styling written in the overhaul should use `(display-mode: standalone), (display-mode: fullscreen)` or a JS flag (`navigator.standalone` / `matchMedia`) instead.
- Since Safari 26 tints Safari-tab chrome from body and fixed-element backgrounds, keeping `body`'s background equal to the frame navy (already done) keeps Journey consistent whether it is opened as an installed app or in a tab.
- "Liquid Glass tinting from page colours" applies to Safari's own toolbars in tabs. In a standalone Home Screen app Journey draws its own frame, so the overhaul needn't chase it.

### Gaps
- I couldn't reach the WebKit "Safari 26.0" release post or Apple's web-app documentation to confirm how the status bar behaves in a Home Screen app on iPadOS 26/27, or whether `apple-mobile-web-app-status-bar-style` still has any effect there. BCD's "only used for installed web apps" note is the best available evidence.
- Whether WebKit bug 264218 is still open in Safari 27 is inferred from BCD 8.1.4 (Oct 1 2026) still carrying the note.

## Consolidated: feature-by-feature table and verdicts (iPad Safari, Oct 8 2026)

### Takeaway
Safe now on every iPad in scope (iPadOS 17.5+): OKLCH and P3 colour, `color-mix()`, container queries, `:has()`, subgrid, `<dialog>`, `@starting-style` and allow-discrete, `linear()` springs, `text-wrap: balance`, `dvh`, `tabular-nums`, `contain`. Progressive enhancement that does nothing harmful on older Safari: View Transitions and React 19.3 `<ViewTransition>` (18+), `content-visibility` (18+, already in use), Wake Lock in the Home Screen app (18.4+), scroll-driven animations (26+), `text-wrap: pretty` (26). Not safe or not available: `prefers-reduced-transparency`, Vibration, `interpolate-size`, Popover before 18.3, anchor positioning before 27, `@scope` on 26.0–26.3, `backdrop-filter` in scrolling lists, and Push or Badging under Journey's policy.

### Cited Findings
All versions are from [BCD 8.1.4](https://github.com/mdn/browser-compat-data) and all Baseline dates from [web-features 3.40.1](https://github.com/web-platform-dx/web-features) unless another source is linked. "Reaches iPadOS 17?" means available at or below Safari 17.6. Cost is my assessment for A13–A15 iPads at 60 Hz (see the Inferences in each section above).

| Feature | First full iOS Safari | Reaches iPadOS 17? | Baseline (Oct 2026) | What it would do for Journey | Cost on older iPads | Verdict |
|---|---|---|---|---|---|---|
| `oklch()` / `oklab()` | 15.4 | Yes | Widely (2025-11-09) | Even, perceptual token ramps; P3 values | None (parse time) | **Ship** |
| `color-mix()` | 16.2 (variadic 27) | Yes | Widely (2025-11-09) | Hover, pressed and tint from one token (already in 16 files) | Negligible | **Ship** |
| Relative colour `oklch(from …)` | 18.0 (16.4 partial; hue maths wrong) | No (wrong) | Newly (2024-09-16) | Derive states from a token | Negligible | Only with a fallback, or once the floor is 18 |
| `light-dark()` | 17.5 (images 27) | Yes (17.5+) | Newly (2024-05-13) | Both themes in one declaration (needs `color-scheme` per theme) | None | Optional |
| `color(display-p3 …)` + `@media (color-gamut: p3)` | 15 / 10 | Yes | Widely (2025-11-09) | More vivid orange and blue on minis, Airs, Pros; none on 10th-gen or A16 iPads ([Croma](https://www.croma.com/unboxed/10th-generation-apple-ipad-all-you-need-to-know), [EveryMac](https://everymac.com/systems/apple/ipad/specs/apple-ipad-a16-11-inch-11th-gen-2025-a3354-wi-fi-only-specs.html)) | None | Optional polish; contrast tests on the sRGB value |
| `contrast-color()` | 26 | No | Newly (2026-04-10) | Automatic black or white ink on fills | None | Not yet |
| `prefers-contrast: more` | 14.5 | Yes | Widely | Firmer ink and edges for Increase Contrast | None | **Ship** |
| `prefers-reduced-transparency` | **Not supported** | — | No | — | — | **Don't rely on it** |
| `prefers-reduced-motion` | 10.3 | Yes | Widely | Must gate every new animation (React won't, [React docs](https://react.dev/reference/react/ViewTransition)) | — | **Required** |
| Same-document View Transitions | 18.0 (classes and types 18.2) | No (instant swap) | Newly (2025-10-14) | Cross-fades and slides between screens, tabs, Hub days | Snapshot capture and GPU memory; opacity/transform on compositor | **Ship as enhancement**, ≤250 ms, never mid-set |
| React `<ViewTransition>`, `addTransitionType` | React 19.3.0, 2026-09-09 ([React blog](https://react.dev/blog/2026/09/09/react-19-3)); Journey on 19.2.5 | Animates on 18+ only | n/a | Declarative enter, exit, share, tied to `startTransition` | No new package | **Bump React to 19.3** |
| Cross-document VT (`@view-transition`) | 18.2 | No | No | None (SPA, no router) | — | Skip |
| `Element.startViewTransition`, `view-transition-group` | **Not in Safari** | — | No | — | — | Don't use |
| Scroll-driven animations | 26.0 | No | No | Collapsing headers, scroll progress | Good if transform/opacity | Enhancement behind `@supports` only |
| `@starting-style` | 17.5 | Yes (17.5+) | Newly (2024-08-06) | CSS-only entry animation for sheets, toasts, dialogs | Cheap (opacity/transform) | **Ship** |
| `transition-behavior: allow-discrete` | 17.4 | Yes (17.4+) | Newly (2024-08-06) | Animate to and from `display: none` / top layer | Cheap | **Ship** |
| `linear()` easing (springs) | 17.2 | Yes | Widely (2026-06-11) | Spring feel in pure CSS; less need for `motion` | None | **Ship** |
| `@property` | 16.4 | Yes | Newly (2024-07-09) | Typed, animatable tokens | Repaints if it feeds paint | Sparingly |
| `interpolate-size` / `calc-size()` | **Not in Safari** | — | No | Animate to `height: auto` | — | Use the `0fr→1fr` grid trick |
| Container queries + `cq*` units | 16 | Yes | Widely (2025-08-14) | One component for phone, portrait, landscape, split pane | Small | **Ship (highest layout leverage)** |
| Style queries (custom properties) | 18 | No | Newly (2026-05-19) | Variant switching by token | Small | 18+ only; root can't be a container |
| `:has()` | 15.4 | Yes | Widely (2026-06-19) | Parent-state styling | Keep selectors scoped | **Ship** |
| Subgrid | 16 | Yes | Widely (2026-03-15) | Aligned columns across roster rows and cards | Small | **Ship** |
| CSS nesting / `@layer` | 17.2 / 15.4 | Yes | Widely | Tailwind v4 handles it | — | Already |
| `@scope` | 26.4 (17.4 early; 26.0–26.3 input/textarea bug) | Yes, but buggy on 26.0–26.3 | Newly (2026-03-24) | Scoped feature CSS | — | Avoid for now |
| Anchor positioning | 26 (`position-anchor` full 27) | No | No | Tethered (i), menus, tooltips without JS | — | Not yet |
| Popover API | iOS 18.3 (17–18.2: no tap-outside dismiss) | Partial | Newly (2025-01-27) | Light-dismiss menus in the top layer | — | Only if the floor is 18.3; else keep the JS menus |
| Invoker commands (`commandfor`) | 26.2 | No | Newly (2025-12-12) | Declarative open and close | — | Not yet |
| `<dialog>` | 15.4 (`requestClose` 18.4; `closedby` none) | Yes | Widely | Modal sheets, inert background | — | **Ship** |
| `text-wrap: balance` | 17.5 | Yes (17.5+) | Newly (2024-05-13) | Even headings, no orphans | Fine on short text | **Ship on headings** |
| `text-wrap: pretty` | 26 | No (ignored) | No | Better paragraph rag | Some layout cost | Harmless enhancement |
| `field-sizing: content` | 26.2 | No | Newly (2026-06-16) | Auto-growing note boxes | — | Not yet |
| `dvh` / `svh` / `lvh`, `env(safe-area-*)` | 15.4 / 11 | Yes | Widely (2025-06-05) | Full-height shells | — | Already / ship |
| `overscroll-behavior` | 16 (partial) | Yes | No | Stop bounce chaining inside panes | — | Ship, with the caveat |
| `text-box-trim` | 18.2 | No | No | Optically centred Saira in buttons and chips | None | Enhancement |
| Grid lanes (masonry) | 26.4 | No | No | Masonry boards | — | Not yet |
| Customizable `<select>`, `::picker` | 27 | No | No | Styled native selects | — | Not yet |
| `overflow-anchor` (scroll anchoring) | 27 | No | — | Lists don't jump when rows load above | — | Free on 27; can't rely on it |
| `sibling-index()` / `sibling-count()` | 26.2 | No | Newly (2026-08-18) | CSS-only staggered entrances | — | Not yet |
| `backdrop-filter` | 18 (`-webkit-` since 9) | Yes (prefixed) | Newly (2024-09-16) | Glass or frosted bars | **High**: off-screen redraw ([WWDC15](https://nonstrict.eu/wwdcindex/wwdc2015/501/)); blank or jank in scroll containers ([yuvomi](https://newreleases.io/project/github/ulsklyc/yuvomi/release/v0.52.26)) | **Only on small fixed chrome, or not at all** |
| `content-visibility: auto` + `contain-intrinsic-size` | 18 (full 26) / 17 | No (ignored) | Newly (2025-09-15) | Skip off-screen rows of the 300-client roster | Large saving | **Extend (already in 3 rules)** |
| `contain` | 15.4 | Yes | Widely | Isolate card layout and paint | Saving | **Ship** |
| Layered static `box-shadow` | always | Yes | — | Refined Lift depth | Paint at raster; never animate | Keep, at most 2 layers on list rows |
| `navigator.vibrate` | **Not supported** | — | No | — | — | Unavailable |
| `<input type=checkbox switch>` | 17.4 (haptic reported from 18, [WebKit 285120](https://bugs.webkit.org/show_bug.cgi?id=285120)) | Yes | Non-standard | Native switch plus haptic on a real tap | — | OK for real switches; the script-haptic hack reportedly blocked in 26.5 ([tester](https://rapidtoolset.com/en/tool/ios-haptics-tester)) |
| Screen Wake Lock | 16.4; **Home Screen apps 18.4** | No (not in the app) | Newly (2025-03-31) | Keep the iPad awake through a session | Screen-on battery | **Strong candidate**: feature-detect, re-acquire on `visibilitychange` |
| Badging / Push / Notification | 16.4 (Home Screen only) | Yes | Push widely; badging no | — | — | **Out by policy** (badge needs AJ's OK) |
| Variable fonts, `tabular-nums` | 11 / 9.3 | Yes | Widely | Steady numbers; one font file | None | **Ship `tabular-nums`** |
| `font-size-adjust` | 16.4 (`from-font` 17) | Yes | Newly (2024-07-25) | Match Saira and Geist x-heights | None | Optional |
| Dynamic Type (`font: -apple-system-body`) | WebKit extension | Yes | Non-standard | Honour iPad Text Size ([mjtsai](https://mjtsai.com/blog/2024/07/05/dynamic-type-on-the-web)) | Re-layout; needs reload | Reading surfaces only, after testing session rows |
| `theme-color` | 15; from 26 used only by installed apps | Yes | No | The navy frame status bar | — | Keep (already) |
| `@media (display-mode: standalone)` | 12.2, but an iOS installed app reports `fullscreen` (WebKit 264218) | — | No | Journey's `src/index.css:973` rule | — | **Fix or don't rely on it** |
| `reading-flow`, `corner-shape`, `if()`, `@function`, `moveBefore`, CSS carousels | **Not in iOS Safari** | — | No | — | — | Don't use |

### Inferences
- **For tomorrow's overhaul, in order of impact on these iPads:** (1) container queries for components that serve every layout; (2) OKLCH tokens with optional P3 overrides, keeping hex or sRGB values as the contrast-checked base; (3) React 19.3 `<ViewTransition>` for screen, tab and day changes, gated by `prefers-reduced-motion`; (4) `@starting-style`, allow-discrete and `linear()` for CSS-only sheet and toast motion; (5) `content-visibility` and `contain` on every long list; (6) Wake Lock during the Active Session; (7) `tabular-nums` and `text-wrap: balance`.
- **First-screen bundle budget:** none of the above needs a new library. The React bump to 19.3 changes React's own size slightly (unmeasured). Everything else is CSS or a few lines of platform API. The only library-shaped item is `ios-haptics` (optional, fragile, not recommended).
- **Measure on a real 10th-gen iPad with Safari Web Inspector** (Layers, Timelines) before keeping any blur, view transition or scroll-driven animation. The perf lab's Chrome can't show Safari's compositor cost.

### Gaps
- The WebKit release-note posts for Safari 26.0, 26.2 and 27.0 could not be fetched (webkit.org blocked from this environment). Feature versions come from BCD, which is maintained against those notes, and Safari 27 coverage comes from secondary news. Features WebKit shipped that BCD has not yet recorded would be missing here.
- Interop 2025/2026 dashboard scores were not checked.
- No primary performance numbers for any feature on A13/A14/A15 iPads were found. Every cost judgement in the table is engineering inference and should be confirmed on a device.
