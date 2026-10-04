/**
 * Keep `<meta name="theme-color">` the colour of the app's header.
 *
 * The meta tag is what the system tints its own chrome with: the status bar of
 * an installed web app when the status-bar style is `default` (Journey's since
 * Sep 27 2026, so this IS the Home Screen app's status bar), the title bar of
 * a Chrome install, the task switcher. From Safari 26 it is used ONLY for
 * installed web apps (MDN's compatibility data). It cannot name a CSS variable,
 * so it carries a literal colour, and this copies the header's token into it
 * whenever the theme changes, so the tag and the header never disagree.
 *
 * `--chrome` is the frame: the AppHeader's and the bottom bar's background,
 * the logo's navy #002341 in BOTH themes (the Navy Frame, Oct 4 2026; AJ's
 * answer 1A). It is set in index.css's :root only, so the status bar is the
 * same navy whatever the theme. index.html sets the same colour before the
 * first paint. Until Oct 4 2026 this was `--bg-dark-2`, which the light
 * header never actually painted (it was a literal white).
 */
export const HEADER_TOKEN = "--chrome";

export function syncThemeColor(doc: Document = document): string | null {
  const meta = doc.querySelector('meta[name="theme-color"]');
  if (!meta) return null;
  const view = doc.defaultView;
  if (!view) return null;
  const colour = view.getComputedStyle(doc.documentElement).getPropertyValue(HEADER_TOKEN).trim();
  // An empty token means the stylesheet has not loaded yet (or was stripped by a
  // test): leave the tag as it was rather than blanking it.
  if (!colour) return null;
  meta.setAttribute("content", colour);
  return colour;
}
