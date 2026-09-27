# The Home Screen app

Journey as an iPad app: in Safari, **Share → Add to Home Screen**, and the icon opens Journey full screen, with no address bar or tabs. The round is `docs/rounds/2026-09-26-home-screen.md`.

This is a web app with a manifest, not an App Store app. There is no service worker and no offline install: the app loads from the server as it always has, and Firestore keeps its own copy of the data on the iPad as it always has.

## What makes it work

| Piece | Where | What it does |
| --- | --- | --- |
| The manifest | `public/manifest.webmanifest` | Name, icon, `display: standalone`, opens at `/`. |
| The Apple tags | `index.html` `<head>` | `apple-mobile-web-app-capable`, the status-bar style, the title under the icon ("Journey"), the icon. |
| `viewport-fit=cover` | `index.html` | Lets the page run under the status bar and the home indicator. Without it every `env(safe-area-inset-*)` in the app is 0. |
| The theme before first paint | `index.html` inline script | Sets `.dark`/`.light` on `<html>` from the saved theme, so a launch never flashes the light ground. |
| `theme-color` | `index.html` + `theme-color.ts` (called by `ThemeProvider`) | Always the header's colour (`--bg-dark-2`): #16263D dark, #FFFFFF light. |
| The status band | `index.html` `<div class="status-band">`, CSS in `index.css` | A fixed strip as tall as the status bar, on every screen. Clear in the dark theme, the dark neutral in the light theme. |
| The shell's strip | `StatusBarStrip.tsx`, first child of the shell in `AppContent` | Pays the top inset once for every screen in the shell, coloured like what sits under it. |
| The safe-area utilities | `index.css`, "Safe areas" | `pt-safe` / `pb-safe` (the inset), `pt-safe-4` / `pb-safe-6` (the inset plus that much spacing), `top-safe-3` (for an absolutely placed child), `h-safe-top`, `border-t-safe` (for a full-screen scroll pane). |
| The insets as numbers | `safe-area.ts` | For things placed by JavaScript: the select lists and menus (`ui/select.tsx`, `ui/dropdown-menu.tsx`) keep base-ui's 5px plus the insets from the edge. |
| The icons | `public/` (generated), sources and generator in `scripts/icons/` | The 180×180 Home Screen icon, 192 and 512 manifest icons, a maskable 512, favicons. `scripts/icons/lockup.svg` is the logo with the wordmark, for the sign-in screen or print; nothing in the app uses it yet. |

## Decisions

**The status bar is `black-translucent`.** The page runs up under the clock and battery, so each screen's own colour sits behind them rather than a white or black bar. That style always draws the status bar's text in **white**:

- **Dark theme (the default):** every top surface is dark. The header's navy runs up behind the clock with nothing between them.
- **Light theme:** every top surface is white or near white, so white text would disappear. The status band paints a dark strip there instead. It is legible, but it is a visible strip.

The alternative is one line in `index.html`: `apple-mobile-web-app-status-bar-style` set to `default`. The system then draws its own status bar above the page, the insets at the top become 0, and nothing in the app needs changing (the strip and the band collapse to 0px by themselves). On iPadOS 26 and later that bar should take the `theme-color`, which follows the app's theme. That is not confirmed on a device. Choose after looking at both on a studio iPad. **iOS reads this setting when the icon is added, so after changing it, delete the icon and add it again.**

**Each inset is paid once, by the element at the true edge of the screen.**

- **Top.** The shell's `StatusBarStrip` pays it for every screen inside the shell. Anything portalled over the shell that reaches the top of the screen pays its own: the Sheet primitive by side, the three Active Session slide-overs, Pulse client mode, the renewal brief and the packages sheet.
- **Bottom.** `AppBottomBar` pays it on every signed-in screen. Anything inside `<main>` sits above the bar and must not pay it again. Three places did (the briefing's Start bar and two in Relay), which was 20px of dead space. Only layers that cover the bar pay their own.
- **The guard.** `home-screen.test.ts` lists every file that pays an inset, how many times, and why. A new file, or one more use in a listed file, fails the test until someone raises the count. That means someone has checked the new use really is at an edge.
- **A class shared by two stylesheets can move an edge.** The packages sheet's structural classes were renamed (`pk-frame`, `pk-heading`, `pk-scroll`, `pk-actions`, `pk-intro`), because Relay's kit uses the old names. Their full-height rule had been reaching five Relay dialogs, which put the dialogs' titles under the status bar.

**The orientation is never locked.** The manifest says `"orientation": "any"`. Trainers use the iPad both ways (portrait mostly). iPadOS does not reliably honour a lock anyway: the Screen Orientation lock API is not in Safari, and iPadOS 26 and later expects apps to handle any window size.

**No service worker.** Every push to `master` deploys. A caching service worker is the standard way to pin a device to an old build, and nothing here needs one. The Home Screen app loads `/` from the server like a tab does. `/` is sent `no-cache`, which is why `start_url` is `/` and never `/index.html`: `express.static` would cache that one for an hour.

**The icon is the Journey J.** It was drawn from AJ's mock (a copper road on teal that rises into a gold arrow, with the MAX tiles) and the Max Strength logo. The road bends into a J for Journey, and its dashed centre line runs up into the arrow. The arrowhead is the MAX "^" at the same angle, shading from gold into Max Strength's own orange (#F36D21). The J stands on the three tiles in their exact colours. There is no text in the icon, because iPadOS prints "Journey" under it; the wordmark is in the lockup.

**The icon is opaque, square and unrounded.** iPadOS draws its own rounded corners, and it fills any transparency with black. One 180×180 `apple-touch-icon.png` covers every iPad (iOS scales it down to 152 and 167). The manifest icons matter to Chrome and Android installs, and to iOS only when there is no `apple-touch-icon`. To change the icon:

1. Edit the SVGs in `scripts/icons/`.
2. Run `node scripts/icons/make-icons.mjs scripts/icons public` on the PC. It needs Chrome or Edge, and no npm packages.
3. Commit the PNGs it writes. The generator refuses any PNG with a pixel that isn't fully opaque.

## What a trainer should know

- **Sign in again inside the Home Screen app.** It has its own storage, separate from Safari: the sign-in, the pinned studio (pin it again on each iPad), the theme and Firestore's offline copy all start fresh. On a shared iPad the Safari tab and the icon are two separate sign-ins, so studios should use the icon only.
- **Sets waiting to send in a Safari tab stay in Safari.** Finish or sync a session before switching to the icon.
- **There is no reload button.** A new version arrives when the app is opened fresh. Swipe it away in the app switcher and tap the icon.

## Before telling trainers to use it

The sign-in is a popup (Google, Microsoft), and popups from a Home Screen app on iPadOS are the least-documented part of this. The iPad model changes which path Firebase takes (a mini and a full-size iPad report different user agents). Run the on-iPad test in `docs/rounds/2026-09-26-home-screen.md` first. If sign-in fails there, the fix is a same-site sign-in helper and a switch to redirect sign-in in Home Screen mode. That changes the Firebase config and the Google and Microsoft sign-in settings, so it needs AJ's OK first.
