import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The Home Screen web app, checked against the actual files (README.md beside
 * this file explains each decision). Nothing here renders, so these are the
 * things a green typecheck, suite and build would otherwise never notice:
 * a lost `viewport-fit=cover` silently turns every safe-area inset in the app
 * back into 0; a manifest `start_url` of `/index.html` pins launches to an old
 * deploy for an hour; an icon with an alpha channel comes out black-edged on
 * the Home Screen; and a second element paying the same inset leaves 20px of
 * dead space above the home indicator.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "..");
const ROOT = join(SRC, "..");
const PUBLIC = join(ROOT, "public");
const read = (...parts: string[]) => readFileSync(join(...parts), "utf8");

const INDEX_HTML = read(ROOT, "index.html");
const INDEX_CSS = read(SRC, "index.css");
const MANIFEST = JSON.parse(read(PUBLIC, "manifest.webmanifest")) as Record<string, unknown>;

function meta(name: string): string | null {
  const m = INDEX_HTML.match(new RegExp(`<meta\\s+name="${name}"\\s+content="([^"]*)"`));
  return m ? m[1] : null;
}

/** A token's value inside the first rule block that opens with `selector {`. */
function tokenIn(selector: string, token: string): string {
  const start = INDEX_CSS.search(new RegExp(`^${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{`, "m"));
  expect(start, `no "${selector} {" block in index.css`).toBeGreaterThanOrEqual(0);
  const block = INDEX_CSS.slice(start, INDEX_CSS.indexOf("\n}", start));
  const m = block.match(new RegExp(`${token}:\\s*(#[0-9A-Fa-f]{6})`));
  expect(m, `${token} not set in ${selector}`).not.toBeNull();
  return m![1].toUpperCase();
}

/** Width, height and PNG colour type (2 = RGB, 6 = RGBA) from the IHDR chunk. */
function png(file: string) {
  const buf = readFileSync(file);
  expect(buf.subarray(1, 4).toString("ascii")).toBe("PNG");
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), colourType: buf[25] };
}

describe("index.html", () => {
  it("runs edge to edge, so env(safe-area-inset-*) reports real values", () => {
    expect(meta("viewport")).toContain("viewport-fit=cover");
    // Pinch-zoom stays available: nothing here turns it off.
    expect(meta("viewport")).not.toMatch(/user-scalable\s*=\s*no|maximum-scale/);
  });

  it("declares the Home Screen web app", () => {
    expect(INDEX_HTML).toContain('<link rel="manifest" href="/manifest.webmanifest" />');
    expect(meta("apple-mobile-web-app-capable")).toBe("yes");
    expect(meta("mobile-web-app-capable")).toBe("yes");
    expect(meta("apple-mobile-web-app-title")).toBe(MANIFEST.short_name);
    expect(INDEX_HTML).toContain('<link rel="apple-touch-icon" href="/apple-touch-icon.png" />');
  });

  it("lets iPadOS draw the status bar, because black-translucent cuts off the bottom bar", () => {
    // AJ's iPad, Sep 27 2026: under black-translucent, iPadOS 26 lays the
    // Home Screen app out a status bar taller than it shows it, so the bottom
    // bar's labels ran into a black strip at the foot of the screen. With
    // `default` iPadOS draws the status bar above the page, coloured from
    // theme-color, and the page is exactly the screen below it.
    expect(meta("apple-mobile-web-app-status-bar-style")).toBe("default");
    // The band stays (0px while the top inset is 0) so black-translucent is
    // one line away. It is the first thing in <body>, outside React, so it is
    // there on every screen: the sign-in, the crash page, every sheet.
    expect(INDEX_HTML).toMatch(/<body>\s*(<!--[\s\S]*?-->\s*)?<div class="status-band" aria-hidden="true"><\/div>\s*<div id="root">/);
    expect(INDEX_CSS).toMatch(/\.status-band\s*\{[^}]*height:\s*env\(safe-area-inset-top, 0px\)/);
    expect(INDEX_CSS).toMatch(/\.dark \.status-band\s*\{\s*background:\s*transparent;/);
  });

  it("paints the theme before the first paint, with ThemeProvider's key and default", () => {
    const provider = read(SRC, "components", "ThemeProvider.tsx");
    const main = read(SRC, "main.tsx");
    const key = provider.match(/storageKey = "([^"]+)"/)?.[1];
    expect(key).toBeTruthy();
    expect(main).toContain(`storageKey="${key}"`);
    expect(main).toContain('defaultTheme="dark"');
    expect(INDEX_HTML).toContain(`localStorage.getItem("${key}") || "dark"`);
  });

  it("keeps theme-color the header's colour, the frame's navy, in both themes", () => {
    // The Navy Frame (Oct 4 2026; AJ's answer 1A): the header, the bottom
    // bar and the status bar are --chrome, set in :root only, so one literal
    // serves both themes. It was the header's --bg-dark-2, light and dark.
    const frame = tokenIn(":root", "--chrome");
    const darkBlock = INDEX_CSS.slice(INDEX_CSS.search(/^\.dark\s*\{/m));
    expect(darkBlock.slice(0, darkBlock.indexOf("\n}")), "--chrome must not change with the theme").not.toMatch(/--chrome:/);
    expect(meta("theme-color")?.toUpperCase()).toBe(frame);
    // The pre-paint script sets the same navy whatever the theme.
    const script = INDEX_HTML.match(/meta\.setAttribute\("content", ([^)]*)\)/)?.[1];
    expect(script).toBe(`"${frame}"`);
    expect(String(MANIFEST.theme_color).toUpperCase()).toBe(frame);
    expect(String(MANIFEST.background_color).toUpperCase()).toBe(tokenIn(".dark", "--background"));
  });

  it("the status bar copies the token the header and the bottom bar paint", () => {
    const themeColor = read(SRC, "features", "home-screen", "theme-color.ts");
    expect(themeColor).toMatch(/export const HEADER_TOKEN = "--chrome";/);
    expect(read(SRC, "components", "AppHeader.tsx")).toMatch(/<header className="[^"]*\bbg-chrome\b/);
    const bar = read(SRC, "components", "AppBottomBar.tsx");
    const navs = [...bar.matchAll(/<nav\b[\s\S]*?className="([^"]*)"/g)].map((m) => m[1]);
    expect(navs).toHaveLength(3);
    for (const nav of navs) expect(nav).toMatch(/(^|\s)bg-chrome(\s|$)/);
  });
});

describe("manifest.webmanifest", () => {
  it("opens standalone at the root, never at /index.html", () => {
    expect(MANIFEST.display).toBe("standalone");
    // "/" is sent no-cache by server.ts; "/index.html" would be served by
    // express.static with an hour's cache and pin a launch to an old deploy.
    expect(MANIFEST.start_url).toBe("/");
    expect(MANIFEST.scope).toBe("/");
    expect(MANIFEST.id).toBe("/");
  });

  it("never locks the orientation: the floor uses the iPad both ways", () => {
    expect([undefined, "any"]).toContain(MANIFEST.orientation);
  });

  it("names only icons that exist, at the size it claims, with no alpha channel", () => {
    const icons = MANIFEST.icons as { src: string; sizes: string; type: string; purpose?: string }[];
    expect(icons.some((i) => i.purpose === "maskable")).toBe(true);
    expect(icons.some((i) => (i.purpose ?? "any") === "any" && i.sizes === "512x512")).toBe(true);
    for (const icon of icons) {
      const file = join(PUBLIC, icon.src.replace(/^\//, ""));
      expect(existsSync(file), `${icon.src} is missing from public/`).toBe(true);
      const { width, height, colourType } = png(file);
      expect(`${width}x${height}`).toBe(icon.sizes);
      expect(colourType, `${icon.src} has an alpha channel`).toBe(2);
    }
  });
});

describe("the Home Screen icon", () => {
  it("is a 180x180 opaque PNG (iPadOS fills transparency with black)", () => {
    expect(png(join(PUBLIC, "apple-touch-icon.png"))).toEqual({ width: 180, height: 180, colourType: 2 });
  });

  it("has the favicons index.html names", () => {
    expect(existsSync(join(PUBLIC, "favicon.svg"))).toBe(true);
    expect(png(join(PUBLIC, "favicon-32.png"))).toMatchObject({ width: 32, height: 32 });
  });
});

/**
 * EACH INSET IS PAID ONCE, by the element at the true edge of the screen.
 *
 * Every file that pays one is listed here with how many times and why. A file
 * that starts paying one, or a listed file that pays one more (a new footer in
 * the Active Session, say), fails until someone has checked the new use really
 * is at an edge and not stacked above AppBottomBar or under the shell's strip,
 * and raised the count. A file that stops must come off, so the list stays the
 * truth. Comments don't count.
 */
const PAYS_AN_INSET: Record<string, { uses: number; reason: string }> = {
  "index.css": { uses: 15, reason: "defines the safe-area utilities and the status band" },
  "features/home-screen/StatusBarStrip.tsx": { uses: 1, reason: "the shell's top inset, for every screen in the shell" },
  "features/home-screen/safe-area.ts": { uses: 2, reason: "reads the insets as numbers, for select lists and menus" },
  "components/AppBottomBar.tsx": { uses: 3, reason: "the shell's bottom inset, on every signed-in screen (three bars: trainer, Operations, phone)" },
  "components/ui/sheet.tsx": { uses: 7, reason: "every Sheet: portalled over the shell, pays the edges it touches, and its close button" },
  "features/routine-builder/routine-builder.css": { uses: 1, reason: "the builder's sheets run the full height, so they start below the status bar" },
  "components/WorkoutTrackerView.tsx": { uses: 2, reason: "the Pulse slide-over: full height, over the bottom bar" },
  "components/journal/SessionJournalSidebar.tsx": { uses: 2, reason: "the notes slide-over: full height, over the bottom bar" },
  "features/journey-grid/SessionFlagsSheet.tsx": { uses: 2, reason: "the watch-outs slide-over: full height, over the bottom bar" },
  "features/journey-grid/journey-grid.css": { uses: 1, reason: "the routine order sheet: a dialog pinned to the bottom edge" },
  "features/front-door/kit.tsx": { uses: 1, reason: "the front door's pane (sign in, checking you in, the greeting, the studio picker, the access request): before the shell exists" },
  "components/CreateClientModal.tsx": { uses: 4, reason: "new-client onboarding: a fixed layer at the true edge, returned before the shell exists or portalled over an open session" },
  "features/packages/packages.css": { uses: 2, reason: "the packages sheet: a full-screen dialog, both edges" },
  "features/subjective-report/subjective-report.css": { uses: 3, reason: "Pulse client mode (full screen) and the quick log in a narrow window" },
  "features/admin/renewals/renewals.css": { uses: 1, reason: "the renewal brief: a full-height panel over the shell" },
  "features/ford/FordDetailDialog.tsx": { uses: 2, reason: "a tall centred dialog, kept clear of both bars" },
  "features/client-history/LogPastSessionDialog.tsx": { uses: 2, reason: "a tall centred dialog, kept clear of both bars" },
  "features/client-history/SessionDetailDialog.tsx": { uses: 2, reason: "a tall centred dialog, kept clear of both bars" },
  "components/EditRoutineDrawer.tsx": { uses: 4, reason: "a tall centred dialog (its height and max height), kept clear of both bars" },
};

const PAYS = /safe-area-inset|\b(?:pt-safe|pb-safe|top-safe|h-safe-top|border-t-safe)\b/g;

/** Block comments, and line comments that are not part of a URL or a string. */
const withoutComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'])\/\/.*$/gm, "$1");

function* sources(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) yield* sources(full);
    else if (/\.(tsx?|css)$/.test(name) && !/\.test\.tsx?$/.test(name)) yield full;
  }
}

describe("safe-area insets", () => {
  const uses = Object.fromEntries(
    [...sources(SRC)]
      .map((f) => [relative(SRC, f).split("\\").join("/"), (withoutComments(readFileSync(f, "utf8")).match(PAYS) ?? []).length] as const)
      .filter(([, n]) => n > 0),
  );

  it("are paid only by the files that sit at a true edge of the screen, as many times as listed", () => {
    const listed = Object.fromEntries(Object.entries(PAYS_AN_INSET).map(([f, e]) => [f, e.uses]));
    expect(uses).toEqual(listed);
  });

  it("the guard itself catches a use, and ignores one in a comment", () => {
    expect(withoutComments("a { padding: env(safe-area-inset-bottom); } /* env(safe-area-inset-top) */").match(PAYS)).toHaveLength(1);
    expect(withoutComments('<div className="pb-safe" /> // pt-safe').match(PAYS)).toHaveLength(1);
    expect(withoutComments('const u = "https://example.com"; x = "pb-[env(safe-area-inset-bottom,0px)]";').match(PAYS)).toHaveLength(1);
  });
});
