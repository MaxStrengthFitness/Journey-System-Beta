# The Home Screen app — Sep 26 2026

Branch `ipad-home-screen`, cut from master at `55ce329` and rebased onto `16613ad` before shipping. No database, rules, Cloud Functions or Mindbody change. Shipping it is a push to `master`, which deploys the web app. The feature's own page is `src/features/home-screen/README.md`.

## Why

AJ, Sep 26: trainers should add Journey to the iPad Home Screen from Safari and have it open "in a standalone, fullscreen mode without browser UI". The Home Screen bar, the Active Session and the Journey grid must stay clear of the status bar at the top and the home indicator at the bottom. AJ also asked for a new app icon, built on his own mock (a road rising into an arrow, on teal, with the MAX tiles) and the Max Strength logo.

Before this round, adding the app to the Home Screen gave a screenshot thumbnail, the title "Max Strength App", and (before iPadOS 26) Safari with its toolbar. The page had no `viewport-fit=cover`, so the safe-area padding already written in six places was always 0 and had never been exercised.

## What the research found (checked Sep 26, iPadOS 26, Safari 27.0 out Sep 14)

- **Any site added to the Home Screen opens as a web app on iPadOS 26.** A manifest with `display: standalone` was enough on 16.4 and later. Before that it took `apple-mobile-web-app-capable`, and index.html keeps that tag for 17 and 18. Sources: WebKit, "Safari 26" and "Web Push for Web Apps on iOS and iPadOS".
- **`fullscreen` in a manifest launches like `standalone` on iOS.** It also makes `@media (display-mode: standalone)` stop matching, so the manifest says `standalone`.
- **The orientation cannot be locked on iPad, and should not be.** Safari has no Screen Orientation `lock()` (the WebKit flag is off). Apple's TN3192 says iPadOS 26 and 27 expect apps to handle any size and orientation. The floor uses both, so the manifest says `"orientation": "any"`.
- **`black-translucent` draws content under the status bar, and its text is white** (Apple's Meta Tags reference; web.dev). On iPhones, WebKit bug 301994 (reopened Aug 2026) sometimes paints a solid band instead and reports a top inset of 0. The layout here works either way, because every top pad is the inset itself.
- **From Safari 26, `theme-color` is used only for installed web apps** (MDN's compatibility data).
- **`apple-touch-icon` wins over the manifest's icons on iOS.** iOS scales one 180×180 icon down for iPads. Transparency comes out black (widely reported; no Apple source). Maskable icons are ignored on iOS.
- **A Home Screen app has its own cookies and storage, separate from Safari** (WWDC23 "What's new in web apps"). It is exempt from Safari's seven-day storage deletion.
- **`viewport-fit=cover` is what turns the insets on** (WebKit source, `WKWebViewIOS.mm`).

## What changed

| Where | What |
| --- | --- |
| `index.html` | `viewport-fit=cover`; the manifest link; the Apple tags (capable, the status-bar style, the title "Journey"); `theme-color`; the icon links; a script that sets the theme before the first paint; the `.status-band` div. |
| `public/` (new) | `manifest.webmanifest`, `apple-touch-icon.png` (180), `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `favicon.svg`, `favicon-32.png`. |
| `scripts/icons/` (new) | The icon's SVG sources and `make-icons.mjs`, which renders them with the Chrome already on the PC. |
| `src/index.css` | "Safe areas": the utilities (`pt-safe`, `pb-safe`, `pt-safe-4`, `pb-safe-6`, `top-safe-3`, `h-safe-top`, `border-t-safe`) and the status band. |
| `src/features/home-screen/` (new) | `StatusBarStrip`, `theme-color.ts`, the README and the tests. |
| `src/AppContent.tsx` | The strip is the shell's first child. It is coloured like the header, the Active Session's ground, or the Demo banner. |
| `src/components/ThemeProvider.tsx` | Keeps `theme-color` on the header's colour when the theme changes. |
| `src/components/AppBottomBar.tsx` | The same bottom inset as before, written `pb-safe`. |
| `src/components/ui/sheet.tsx` | Every Sheet pays the insets at the edges it touches, and its close button steps below the status bar. |
| The three Active Session slide-overs | Pulse (`WorkoutTrackerView`), Notes (`SessionJournalSidebar`) and Watch-outs (`SessionFlagsSheet`) pay both insets. |
| Screens before the shell | The studio picker and the access request keep their content below the clock (`border-t-safe`). New-client onboarding pads both edges. |
| Full-screen layers | Pulse client mode's header, the renewal brief's header and the Pulse quick log in a narrow window. |
| Tall centred dialogs | The FORD detail, Log past session, the session pop-up and Edit routine are shorter by the two insets. |
| Paid twice, now once | The briefing's Start bar, Relay's context-panel footer and the Capture button sit above the bottom bar, which already pays the inset. Each had been adding its own. |
| `src/features/packages/` | The sheet's structural classes are renamed (`pk-frame`, `pk-heading`, `pk-scroll`, `pk-actions`, `pk-intro`). Relay's kit uses the old names, and both files are global, so once both chunks had loaded each file's rules landed on the other's screens. The five Relay dialogs (Capture, the Team cockpit, the job composer, a job, the task manager) grew to the full screen height, with their titles under the status bar. The packages sheet's body was capped at 64% of the screen. This is an old bug that the insets made visible. |
| `src/features/routine-builder/routine-builder.css` | The builder's sheets (Add a machine, Suggestions, Swap, Muscles worked, Programming notes) run the full height of the screen, so they now start below the status bar. |
| `ui/select.tsx`, `ui/dropdown-menu.tsx` | A long list or menu stops short of the status bar and the home indicator (`safe-area.ts`), rather than 5px from the glass. |

## Decisions (Claude's calls; AJ can overturn any)

1. **`black-translucent`, not `default`.** In the dark theme, the default, the header's navy runs up behind the clock, which is the look AJ asked for. In the light theme the status bar's text is still white, so the status band paints a dark strip. Switching to `default` is one line (the README says which, and to re-add the icon after). It hands the bar to iOS, which should colour it with `theme-color` on iPadOS 26+ (unconfirmed on a device).
2. **No orientation lock**, for the reasons above.
3. **No service worker.** Every push to `master` deploys, and a caching service worker pins a device to old code. The Home Screen app loads `/`, which the server already sends `no-cache`.
4. **The manifest is `manifest.webmanifest`, not `manifest.json`.** The extension is the standard one, and Express serves it as `application/manifest+json`. `start_url` is `/`, never `/index.html`: `express.static` caches `/index.html` for an hour.

## The icon

AJ sent two references: his mock of a Journey System icon, and the Max Strength Fitness logo. The mock is a teal square in a copper frame, with "JOURNEY SYSTEM" in copper and a road that rises into a gold arrow, above the MAX tiles.

**How it was chosen.**

- Four designers each drew one angle, rendered it, and looked at it at real Home Screen sizes on light and dark wallpapers before changing it again:
  - **faithful**: the mock itself, done properly;
  - **mark**: no text, the road and arrow as big as possible;
  - **fusion**: the road rising out of the MAX tiles;
  - **monogram**: the road bent into a J.
- Three judges then scored every design through one lens each: iPad legibility and Apple's icon rules, brand fidelity (to AJ's mock and to Max Strength), and polish.
- The J won on the totals: monogram 20.5, mark 19.5, fusion 17, faithful 16. It was first on legibility and polish; the brand judge put faithful first.
- A final designer refined the J with the judges' fixes and grafted in the other designs' best ideas:
  - the J stands on the MAX tiles, which moves its weight to the centre;
  - the arrowhead is the MAX "^" at the same angle, shading from gold into Max Strength's orange;
  - the hook's end fades in (the road was already there);
  - the copper edges are thicker, so they hold at 60px.

**What the icon is.**

- A copper road with a dashed centre line, bent into a J. It rises into a gold-to-orange arrow, and it stands on the MAX tiles, on AJ's teal.
- There is no drawn frame: iPadOS rounds the corners itself.
- There is no text: iPadOS prints "Journey" under the icon, and "SYSTEM" turned to mush at Home Screen size.
- The wordmark lives in `scripts/icons/lockup.svg`: the J tile, "JOURNEY" in copper, "SYSTEM" spread beneath it the way "FITNESS" sits under "STRENGTH", and "by [MAX] STRENGTH FITNESS". Its letters are drawn paths, so it looks the same on any device.

**AJ confirms the choice.** The finalists sheet shows the J beside the two runners-up (mark and fusion) at 180 and 76px. Any of them can be swapped in:

1. Put its `icon.svg`, `icon-maskable.svg` and `favicon.svg` in `scripts/icons/`.
2. Run `node scripts/icons/make-icons.mjs`.
3. After the push, delete the Home Screen icon and add it again: iOS keeps the icon it took at install.

## The review

An adversarial review read the change through three lenses (missed screen edges, behaviour, tests and docs), and a skeptic re-checked every finding against the code. What it confirmed, all fixed here:

- The packages / Relay class collision (the table above).
- The Routine Builder's sheets running up under the status bar.
- Select lists and menus that could open under the clock or on the home indicator.
- The inset guard counted files but not uses, so one more inset in an already-listed file passed. It now counts uses per file, with comments ignored.
- The icon generator never put `favicon.svg` in `public/`.
- This page lacked the screenshot script that the Layout trap points to (below).

It also raised two things it then refuted:

- **iPhone notch insets in landscape.** Journey is iPad-first, and iPads have no side insets.
- **Whether a Safari 26 tab reports a top inset.** If one did, the band and the strip would be doing exactly their job.

## How it was checked

- **Tests.** `src/features/home-screen/home-screen.test.ts` checks index.html, the manifest and the icons against the files. It also keeps the list of every file that pays an inset: a new one fails until it is added with its reason, and a file that stops paying one must come off. `theme-color.test.ts` covers the sync.
- **Screenshots of the real header, bottom bar, strip, sheets, the Watch-outs panel and the Demo banner** on a throwaway page. The iPad insets were emulated with headless Chrome's `Emulation.setSafeAreaInsetsOverride` (24px top, 20px bottom) at 820×1180 and 1180×820, in both themes, with a drawn white clock and a home indicator on top. A desktop browser always reports 0, so this is the only way to see the insets off a device. What they showed:
  - The strip and the band are 24px.
  - The bottom bar stays 80px, with the 20px inside it; its items sit above the home indicator.
  - Side sheets pad 24px at the top and 20px at the bottom, and their close button sits at 36px.
  - The clock reads on navy in dark and on the dark strip in light.
- **The numbers,** in this worktree on AJ's PC:
  - `npx tsc --noEmit`: 4 errors, the baseline.
  - `TZ=America/New_York npx vitest run --dir src`: 5,777 passing in 367 files after the rebase (5,715 in 365 before it).
  - `npx vite build` passes, and the manifest and icons land in `dist/`.
  - `git ls-files | tr A-Z a-z | sort | uniq -d` prints nothing.
  - No raw control or invisible characters in any changed file.
- **The icons** come from `make-icons.mjs`, which refuses any pixel that isn't fully opaque. The SVG sources were simplified from about 100 KB to about 9 KB, and a pixel diff against the unsimplified renders found differences only in edge antialiasing (at most 24 of 255).
- **Not checked on a device.** Nothing in this round has been seen on a real iPad. The sign-in test below comes first.

**Emulating the iPad's insets** (for the next person who touches an edge). Launch headless Chrome with `--remote-debugging-port=9334 --allow-file-access-from-files`. Over the DevTools protocol, send:

- `Emulation.setDeviceMetricsOverride {width: 820, height: 1180, deviceScaleFactor: 1, mobile: false}`
- `Emulation.setSafeAreaInsetsOverride {insets: {top: 24, bottom: 20, left: 0, right: 0}}`
- `Page.navigate` to a built page (a desktop browser always reports 0 insets)
- `Page.captureScreenshot`

Node 24's built-in `WebSocket` is enough to send them; no packages are needed. Draw a white 24px strip of text at the top and a grey pill 8px from the bottom before capturing, so legibility can be judged the way the status bar will show it.

## Before telling trainers: the sign-in test (AJ, on a studio iPad)

The sign-in is a Google or Microsoft popup. What a popup does inside a Home Screen app is the least-documented part of this. Firebase decides by the user agent: a full-size iPad reports itself as a Mac, an iPad mini as an iPad, and those take different paths. A failure can be a popup that never comes back, which leaves the buttons dimmed. There is no email-and-password fallback, so a failure here locks trainers out of the icon (Safari still works). **Run this on each iPad model the studios use**, on the live app, before announcing anything:

1. **Install.** In Safari, open the live app → Share → Add to Home Screen. Leave "Open as Web App" on, then tap Add.
2. **First launch.** Tap the icon.
   - *Expect:* no address bar, and the sign-in screen, even if Safari is signed in.
3. **Google.** Tap Google and choose the account.
   - *Pass:* the chooser opens, closes by itself within about 5 seconds, and you land on the studio picker.
   - *Fail, note which:* a red `auth/popup-blocked`; a white sheet that never closes; buttons dimmed for more than a minute; buttons back with no message; "disallowed_useragent"; `auth/network-request-failed`; `auth/web-storage-unsupported`.
4. **Cancel.** Sign out, tap Google, then close the sheet without signing in.
   - *Pass:* the buttons come back within about 15 seconds.
   - *Fail:* they stay dimmed. Force-quit the app to recover.
5. **Microsoft.** Sign in with the company account.
   - *Pass:* as for Google.
   - Then try a personal Microsoft account: the "@maxstrengthfitness.com only" message must appear.
6. **Stays signed in.** Swipe the app away and tap the icon again: still signed in. Restart the iPad: still signed in.
7. **Two-step verification.** Sign in with an account that asks for a code, and switch to Messages to read it. *Pass:* the sign-in carries on when you come back.
8. **Shared iPad.** Sign out and sign in as a second person. *Pass:* the account chooser appears, and the Safari tab is still signed in as the first person, because they are separate.
9. **Both ways round.** Repeat step 3 in portrait and in landscape.
10. **A note draft.** In Demo Mode, start a session, type a session note and don't save it. Swipe the app away and reopen it. Write down whether the draft is offered. Drafts live in sessionStorage, and a relaunched Home Screen app may start with none.
11. **The screen.** Walk through `docs/ops/TESTING-CHECKLIST.md`, "Add the app to the iPad home screen".

**What the results mean:**

- **Steps 3–6 pass in both orientations:** go ahead and tell trainers.
- **Anything in steps 3–5 fails:** hold the icon. The fix is Firebase's own advice for Safari: serve the sign-in helper from the app's own address (a `/__/auth` proxy in `server.ts`), point `authDomain` at the app, and use redirect sign-in in Home Screen mode. That changes the Firebase config and the Google and Microsoft sign-in settings, so it needs AJ's OK before it is built.
- **Step 10 loses the draft:** a follow-up to move session drafts out of sessionStorage.

## What trainers need to be told

- **Sign in once inside the icon, and pin the studio again on each iPad.** The icon has its own storage.
- **Use the icon, not a Safari tab.** They are two separate sign-ins.
- **Finish any session started in Safari before switching to the icon.** Sets waiting to send stay with Safari.
- **To get a new version,** swipe Journey away in the app switcher and tap the icon.

## Left for later

- **Picking up a new deploy.** A Home Screen app has no reload button, and nothing in Journey notices a new deploy. After a deploy, the first open of a screen not yet loaded (the Active Session, a profile, Pulse) can show "Something went wrong" until Reload. Offered as its own task.
- **The dev server exposes the service-account key on the local network.** Found in passing: `npm run dev` listens on every address, and Vite does not refuse `service-account.json`. Offered as its own task, together with the production build serving `server.cjs` and its map. Don't test the icon against `npm run dev` on an iPad until that is closed.
- **Pre-existing, unchanged here:**
  - The post-session screen's header is always the dark variant, so in the light theme its logo and studio name are white on white.
  - With the theme on System and the iPad in light appearance, the AppHeader gets the dark variant.
