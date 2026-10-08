# The Home Screen app

Journey as an iPad app: in Safari, **Share → Add to Home Screen**, and the icon opens Journey full screen, with no address bar or tabs. The round is `docs/rounds/2026-09-26-home-screen.md`.

This is a web app with a manifest, not an App Store app. There is no service worker and no offline install: the app loads from the server as it always has, and Firestore keeps its own copy of the data on the iPad as it always has.

## What makes it work

| Piece | Where | What it does |
| --- | --- | --- |
| The manifest | `public/manifest.webmanifest` | Name, icon, `display: standalone`, opens at `/`. |
| The Apple tags | `index.html` `<head>` | `apple-mobile-web-app-capable`, the status-bar style (`default`), the title under the icon ("Journey"), the icon. |
| `viewport-fit=cover` | `index.html` | Lets the page run under the home indicator (and under the status bar too, when the style is `black-translucent`). Without it every `env(safe-area-inset-*)` in the app is 0. |
| The theme before first paint | `index.html` inline script | Sets `.dark`/`.light` on `<html>` from the saved theme, so a launch never flashes the light ground. |
| `theme-color` | `index.html` + `theme-color.ts` (called by `ThemeProvider`) | Always the header's colour, the frame (`--chrome`): the logo's navy #002341 in both themes since the Navy Frame (Oct 4 2026). It is the colour of the Home Screen app's status bar. |
| The status band | `index.html` `<div class="status-band">`, CSS in `index.css` | A fixed strip as tall as the top inset, on every screen: 0px with the `default` status bar. Under `black-translucent`, clear in the dark theme and the frame's navy (`--chrome`) in the light theme. |
| The shell's strip | `StatusBarStrip.tsx`, first child of the shell in `AppContent` | Pays the top inset once for every screen in the shell (0px with the `default` status bar), coloured like what sits under it. |
| The safe-area utilities | `index.css`, "Safe areas" | `pt-safe` / `pb-safe` (the inset), `pt-safe-4` / `pb-safe-6` (the inset plus that much spacing), `top-safe-3` (for an absolutely placed child), `h-safe-top`, `border-t-safe` (for a full-screen scroll pane). |
| The insets as numbers | `safe-area.ts` | For things placed by JavaScript: the select lists and menus (`ui/select.tsx`, `ui/dropdown-menu.tsx`) keep base-ui's 5px plus the insets from the edge. |
| The icons | `public/` (generated), sources and generator in `scripts/icons/` | The 180×180 Home Screen icon, 192 and 512 manifest icons, a maskable 512, favicons. `scripts/icons/lockup.svg` is the logo with the wordmark, for the sign-in screen or print; nothing in the app uses it yet. |

## Decisions

**The status bar is `default` (since Sep 27 2026).** iPadOS draws its own status bar above the page and colours it with `theme-color`, which is the frame's navy (`--chrome`, #002341) in both themes since the Navy Frame (Oct 4 2026; it was the header's navy in the dark theme and white in the light). In the light theme this relies on iPadOS drawing the clock and battery light over the navy, as it already did in the dark theme: check it on the iPad after re-adding the icon. The page is exactly the screen below the status bar. The top inset is 0, so the shell's strip and the status band collapse to 0px by themselves.

**Why not `black-translucent`, the first choice.** That style runs the page up under the clock and battery, so each screen's own colour sits behind them. AJ's iPad showed the cost on Sep 27. Under it, iPadOS 26 lays the app out a status bar taller than it shows it. The page's last 20 to 24 points fall into a black strip at the foot of the screen, and the bottom bar's labels were cut in half. No CSS can recover that strip, because iPadOS does not draw the page there. Other web apps hit the same WebKit bug on iOS 26 and made the same switch. iPadOS 26 and later also blur the top of a black-translucent page under the clock.

**iOS reads this setting when the icon is added.** After changing it, delete the Home Screen icon and add it again. An icon added before the change keeps the old style, however many times the app is deployed.

**Going back is one line in `index.html`**, once iPadOS fixes the bug. The strip, the band and every `pt-safe` are still in place and would work again. That style always draws the status bar's text in **white**. In the dark theme the header's navy runs up behind it. In the light theme the status band paints the frame's navy, or the clock would be white on a light screen.

**Each inset is paid once, by the element at the true edge of the screen.**

- **Top.** The shell's `StatusBarStrip` pays it for every screen inside the shell. Anything portalled over the shell that reaches the top of the screen pays its own: the Sheet primitive by side, the three Active Session slide-overs, Pulse client mode, the renewal brief and the packages sheet.
- **Bottom.** `AppBottomBar` pays it on every signed-in screen. Anything inside `<main>` sits above the bar and must not pay it again. Three places did (the briefing's Start bar and two in Relay), which was 20px of dead space. Only layers that cover the bar pay their own.
- **The guard.** `home-screen.test.ts` lists every file that pays an inset, how many times, and why. A new file, or one more use in a listed file, fails the test until someone raises the count. That means someone has checked the new use really is at an edge.
- **A class shared by two stylesheets can move an edge.** The packages sheet's structural classes were renamed (`pk-frame`, `pk-heading`, `pk-scroll`, `pk-actions`, `pk-intro`), because Relay's kit uses the old names. Their full-height rule had been reaching five Relay dialogs, which put the dialogs' titles under the status bar.

**The shell takes the smallest height iPadOS reports (Oct 3 2026).** On AJ's iPad (the Home Screen app, iPadOS 26) a dark strip about 20 points tall ran along the foot of the screen, and the bottom bar landed on either side of it: above it on Clients (a gap under the bar), under it on Settings (the labels cut in half). iPadOS was giving the page two heights a strip apart, and the shell's `100dvh` followed one while the page followed the other. iPadOS draws nothing under that strip, so the bar's only safe place is above it. `app-height.ts` measures the window, the document and `100dvh` in the Home Screen app only, takes the smallest, and sets `--app-h` (and `data-app-h`) on <html>; `.app-shell` in `index.css` follows it once it is set, and is `100vh` then `100dvh` otherwise. Under the shell the page's ground is the bar's colour, so a sliver iPadOS does draw reads as the bar. In the Home Screen app, Settings → My account shows a **This screen** line with the numbers: if the bar is ever wrong again, a photo of it says why. A Safari tab is unchanged.

**The ground under the shell is painted on `<body>` too (Oct 5 2026).** With the `default` status bar, AJ's iPad (light theme) showed a light strip about a status bar tall under the bottom bar. iPadOS drew it — it was the light page ground — so it was there to paint, but the Oct 3 rule painted only `<html>`, and `<body>` lies over `<html>` with the theme's own ground. The dark theme's ground is close to the navy, which is why only the light theme showed it. The rule now paints `<html>` and `<body>` the frame's navy, under the media query and under `html[data-app-h]`, which `app-height.ts` sets from `navigator.standalone` as well, because the media query alone may not match in iPadOS 26's Home Screen app. The shell paints its own ground, so nothing inside it changes; the strip now reads as more of the bar. Every height the page reads seems to come back short by the status bar under `default` (other web apps on iOS 26 report the same, with only `100lvh` whole), so the bar still sits that much above the edge. The **This screen** line now also shows `lvh` and the screen's own height: a photo of it says whether the shell can safely take those points back.

**The orientation is never locked.** The manifest says `"orientation": "any"`. Trainers use the iPad both ways (portrait mostly). iPadOS does not reliably honour a lock anyway: the Screen Orientation lock API is not in Safari, and iPadOS 26 and later expects apps to handle any window size.

**No service worker.** Every deploy replaces the whole build (since Oct 6 2026 a push to `master` deploys nothing by itself: AJ presses Manual Deploy on Render). A caching service worker is the standard way to pin a device to an old build, and nothing here needs one. The Home Screen app loads `/` from the server like a tab does. `/` is sent `no-cache`, which is why `start_url` is `/` and never `/index.html`: `express.static` would cache that one for an hour.

**The icon is the Journey J.** It was drawn from AJ's mock (a copper road on teal that rises into a gold arrow, with the MAX tiles) and the Max Strength logo. The road bends into a J for Journey, and its dashed centre line runs up into the arrow. The arrowhead is the MAX "^" at the same angle, shading from gold into Max Strength's own orange (#F36D21). The J stands on the three tiles in their exact colours. There is no text in the icon, because iPadOS prints "Journey" under it; the wordmark is in the lockup.

**The icon is opaque, square and unrounded.** iPadOS draws its own rounded corners, and it fills any transparency with black. One 180×180 `apple-touch-icon.png` covers every iPad (iOS scales it down to 152 and 167). The manifest icons matter to Chrome and Android installs, and to iOS only when there is no `apple-touch-icon`. To change the icon:

1. Edit the SVGs in `scripts/icons/`.
2. Run `node scripts/icons/make-icons.mjs scripts/icons public` on the PC. It needs Chrome or Edge, and no npm packages.
3. Commit the PNGs it writes. The generator refuses any PNG with a pixel that isn't fully opaque.

## What a trainer should know

- **Sign in again inside the Home Screen app.** It has its own storage, separate from Safari: the sign-in, the pinned studio (pin it again on each iPad), the theme and Firestore's offline copy all start fresh. On a shared iPad the Safari tab and the icon are two separate sign-ins, so studios should use the icon only.
- **Sets waiting to send in a Safari tab stay in Safari.** Finish or sync a session before switching to the icon.
- **A new version loads by itself on the Hub; elsewhere a line under the header offers it** (`src/features/new-version/`, Sep 27 2026). There is still no reload button of the app's own: swiping it away in the app switcher and tapping the icon also opens the newest version.

## Before telling trainers to use it

The sign-in is a popup (Google, Microsoft), and popups from a Home Screen app on iPadOS are the least-documented part of this. The iPad model changes which path Firebase takes (a mini and a full-size iPad report different user agents). Run the on-iPad test in `docs/rounds/2026-09-26-home-screen.md` first. If sign-in fails there, the fix is a same-site sign-in helper and a switch to redirect sign-in in Home Screen mode. That changes the Firebase config and the Google and Microsoft sign-in settings, so it needs AJ's OK first.
