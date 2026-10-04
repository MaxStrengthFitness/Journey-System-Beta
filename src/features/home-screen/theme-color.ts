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
 * `--bg-dark-2` is the AppHeader's background in both themes: #14293D dark,
 * #F3F6F9 light (index.css, since the Navy Frame's core tokens, Oct 4 2026).
 * index.html sets the same colour before the first paint, from the same theme
 * key.
 */
export const HEADER_TOKEN = "--bg-dark-2";

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
