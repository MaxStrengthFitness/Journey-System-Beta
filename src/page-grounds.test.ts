import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * THE GROUNDS PEOPLE SEE, AND NO PURE-WHITE PANELS (the Navy Frame, phase 6,
 * Oct 4 2026).
 *
 * AJ: "the light mode is just so bright". The core tokens moved (phase 2), but
 * the page people actually look at was not --background: <main>, the Hub, a
 * client profile and the session's side sheets painted `bg-slate-50
 * dark:bg-slate-950`, one rung lighter than the theme's ground, and about a
 * hundred panels painted a literal `bg-white`. A new palette never reached
 * them. This file holds the move:
 *
 *   - those grounds paint --background, in both modes;
 *   - light mode has no opaque `bg-white` outside the screens left white on
 *     purpose (the client's progress report, white paper in print; the
 *     always-dark screens; the unmounted consultation wizard);
 *   - in dark, no panel paints the page colour (`dark:bg-bg-dark`): a dialog's
 *     body or footer is a card;
 *   - the profile's four tabs still show which one is open now that the page
 *     they sit on is the ground their tray used to be.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(join(HERE, rel), "utf8");

/* ---------------------------------------------------------------------------
   index.css, read the way core-tokens.test.ts reads it
   --------------------------------------------------------------------------- */

const INDEX_CSS = read("index.css");

function declarations(selector: string): Record<string, string> {
  const i = INDEX_CSS.indexOf(`\n${selector} {`);
  if (i < 0) throw new Error(`block not found: ${selector}`);
  const body = INDEX_CSS.slice(i, INDEX_CSS.indexOf("\n}", i)).replace(/\/\*[\s\S]*?\*\//g, "");
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}

const ROOT = declarations(":root");
const DARK = { ...ROOT, ...declarations(".dark") };

function hex(block: Record<string, string>, token: string): string {
  const value = block[token];
  if (!value || !/^#[0-9A-F]{6}$/.test(value)) {
    throw new Error(`${token} is "${value}", not an uppercase #RRGGBB`);
  }
  return value;
}

const channel = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
function luminance(h: string): number {
  const n = parseInt(h.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => channel(c / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function ratio(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/* ---------------------------------------------------------------------------
   The grounds
   --------------------------------------------------------------------------- */

/** `dark:bg-slate-950` as a ground, not a `/20` wash of it. */
const SLATE_GROUND = /(?:^|[\s"'`])(?:dark:)?bg-slate-(?:50|950)(?![\w/-])/;

describe("the grounds people see are the theme's ground", () => {
  it("<main> paints --background in all three of its branches", () => {
    const app = read("AppContent.tsx");
    const start = app.indexOf("<main");
    expect(start).toBeGreaterThan(-1);
    const end = app.indexOf("`}", start);
    const main = app.slice(start, end);
    expect(main.match(/(?<![\w-])bg-background(?![\w/-])/g) ?? []).toHaveLength(3);
    expect(main).not.toMatch(SLATE_GROUND);
  });

  it.each([
    ["the Hub", "components/ClientsView.tsx", 2],
    ["a client profile", "components/ClientProfileView.tsx", 1],
  ])("%s paints --background, never slate-50 / slate-950", (_name, file, grounds) => {
    const source = read(file);
    expect(source.match(/(?<![\w:-])bg-background(?![\w/-])/g)?.length ?? 0).toBeGreaterThanOrEqual(grounds);
    expect(source).not.toMatch(/dark:bg-slate-950(?![\w/-])/);
    expect(source).not.toMatch(/bg-slate-50 dark:bg-slate-950/);
  });

  it("the Hub's words are the theme's ink in both modes, not a white of their own", () => {
    expect(read("components/ClientsView.tsx")).not.toMatch(/dark:text-white(?![\w/-])/);
  });

  it.each([
    ["the session's notes sheet", "components/journal/SessionJournalSidebar.tsx"],
    ["the session's Pulse sheet", "components/WorkoutTrackerView.tsx"],
    ["the session's flags sheet", "features/journey-grid/SessionFlagsSheet.tsx"],
  ])("%s paints --background", (_name, file) => {
    const source = read(file);
    const sheets = [...source.matchAll(/"relative flex h-full w-full max-w-md flex-col border-l[^"]*"/g)].map((m) => m[0]);
    expect(sheets.length).toBeGreaterThan(0);
    for (const sheet of sheets) {
      expect(sheet).toMatch(/(?<![\w:-])bg-background(?![\w/-])/);
      expect(sheet).not.toMatch(SLATE_GROUND);
    }
    // Its close button lifts to a card on hover (it was a white disc).
    expect(source).not.toMatch(/hover:bg-white(?![\w/-])/);
  });

  it("--background is the ground in both modes, with the cards one step off it", () => {
    // The point of the move: a card is a step lighter than the page in light
    // and a step up from it in dark, so a panel reads as a panel.
    expect(ratio(hex(ROOT, "--card"), hex(ROOT, "--background"))).toBeGreaterThanOrEqual(1.1);
    expect(ratio(hex(DARK, "--card"), hex(DARK, "--background"))).toBeGreaterThanOrEqual(1.1);
  });
});

/* ---------------------------------------------------------------------------
   No pure-white panels in light
   --------------------------------------------------------------------------- */

/**
 * Left white on purpose (plan, phase 6). The progress report is the client's
 * document: navy on screen and white paper in print. The always-dark screens
 * pin their own colours. (ConsultationWizard, unmounted and never retinted,
 * was here until it was deleted in the first-session design round, Oct 8
 * 2026, §4.8.)
 */
const LEFT_WHITE = [
  "components/ClientProgressReportView.tsx",
  "features/progress-report/",
  "features/admin/import/LegacyChartImporter.tsx",
  "components/ErrorBoundary.tsx",
];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (name.endsWith(".tsx") && !name.includes(".test.")) out.push(full);
  }
  return out;
}

/**
 * An opaque `bg-white` that applies in light mode: bare, or behind hover: /
 * focus: and the like. A `/20` wash is not a panel; `dark:` is not light mode;
 * `print:` is paper.
 */
const WHITE = /(?:^|[\s"'`{])((?:[\w-]+:)*)bg-white(?![\w/-])/g;

describe("light mode has no pure-white panel", () => {
  it("no opaque bg-white outside the screens left white on purpose", () => {
    const found: string[] = [];
    for (const file of walk(HERE)) {
      const rel = file.slice(HERE.length + 1).split("\\").join("/");
      if (LEFT_WHITE.some((p) => (p.endsWith("/") ? rel.startsWith(p) : rel === p))) continue;
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, i) => {
        for (const m of line.matchAll(WHITE)) {
          const variants = m[1];
          if (/(?:^|:)(?:dark|print):/.test(variants)) continue;
          found.push(`${rel}:${i + 1} ${variants}bg-white`);
        }
      });
    }
    expect(found, "use bg-card (a panel), bg-popover (a menu) or bg-background (the page)").toEqual([]);
  });

  it("no panel paints the page colour in dark: a dialog's body and footer are cards", () => {
    const found: string[] = [];
    for (const file of walk(HERE)) {
      const rel = file.slice(HERE.length + 1).split("\\").join("/");
      const source = readFileSync(file, "utf8");
      if (/dark:bg-bg-dark(?![\w-])/.test(source)) found.push(rel);
    }
    expect(found).toEqual([]);
  });
});

/* ---------------------------------------------------------------------------
   The profile's four tabs, on the new ground
   --------------------------------------------------------------------------- */

describe("the profile's tabs still show which one is open", () => {
  it("the open tab is raised off a tray that is darker than the page", () => {
    // The tray was slate-100 on a slate-50 page. slate-100 IS the light
    // --background now, so the tray stepped down to slate-200, and the open
    // tab (shadcn's data-active fill) was a card, not the page colour.
    //
    // Moved on purpose (type and depth, phase 4, Oct 4 2026): the tray is
    // --tray (#D1DAE4, slate-200's own value in light, and BELOW the page in
    // dark, where slate-800/60 sat above it) and the open tab is RAISED out
    // of it on --raised (#F8FAFC, a hair lighter than the card, never
    // white), with a lift and a soft ring. The floors are unchanged: the
    // tray 1.1:1 off the page, the open tab 1.25:1 off the tray.
    const tabs = read("components/ui/tabs.tsx");
    expect(tabs).toMatch(/(?<![\w:-])data-active:bg-\(--raised\)(?![\w/-])/);
    expect(tabs).not.toMatch(/(?<![\w:-])data-active:bg-(?:background|card)(?![\w/-])/);
    expect(tabs).toMatch(/default:\s*"bg-\(--tray\)/);
    const tray = read("components/ClientProfileView.tsx").match(/<TabsList className="cp-tabs ([^"]*)"/);
    expect(tray?.[1]).toMatch(/(?:^|\s)bg-\(--tray\)(?![\w/-])/);
    expect(tray?.[1], "the tray is one token in both modes").not.toMatch(/dark:bg-/);

    const page = hex(ROOT, "--background");
    const trayFill = hex(ROOT, "--tray");
    const open = hex(ROOT, "--raised");
    expect(trayFill, "the tray keeps slate-200's light value").toBe(hex(ROOT, "--n-200"));
    expect(ratio(trayFill, page)).toBeGreaterThanOrEqual(1.1);
    expect(ratio(open, trayFill)).toBeGreaterThanOrEqual(1.25);
    // The words: idle tabs are ink-d2 on the tray (the profile's were
    // slate-600 until type and depth, phase 7; they are shadcn's own idle
    // ink now), and the open one ink on the raised fill.
    expect(ratio(hex(ROOT, "--n-600"), trayFill)).toBeGreaterThanOrEqual(4.5);
    expect(tabs).toMatch(/(?<![\w:-])text-ink-d2(?![\w/-])/);
    expect(ratio(hex(ROOT, "--ink-d2"), trayFill)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(hex(ROOT, "--foreground"), open)).toBeGreaterThanOrEqual(4.5);
  });

  it("the profile's four tabs speak in the tab voice and only their colours move (type and depth, phase 7)", () => {
    // AJ's answer 1A (Oct 4 2026): Geist 14/600 in the words' own
    // capitalisation (12 on a phone), the open one 700 from the shared
    // trigger; the display face's slanted capitals are the studio's name and
    // Go's alone. The tab no longer repaints its words in slate over the
    // shared trigger's ink, no longer truncates, and no longer animates
    // everything (which took in the open tab's lift).
    const view = read("components/ClientProfileView.tsx");
    const trigger = view.match(/<TabsTrigger[\s\S]*?className="(cp-tab [^"]*)"/)?.[1] ?? "";
    expect(trigger, "the profile's tab trigger").not.toBe("");
    const words = trigger.split(/\s+/);
    for (const gone of ["font-display", "italic", "uppercase", "truncate", "transition-all", "font-bold"]) {
      expect(words, gone).not.toContain(gone);
    }
    expect(trigger).not.toMatch(/(?:^|\s)(?:dark:|hover:)*text-slate-\d/);
    expect(trigger).not.toMatch(/tracking-wide/);
    for (const kept of ["font-sans", "not-italic", "normal-case", "text-[14px]", "max-[600px]:text-[12px]", "font-semibold", "text-ink-d2", "whitespace-normal", "transition-[color,background-color,border-color]"]) {
      expect(words, kept).toContain(kept);
    }
    // The tray stays sunk, and the tab is still 40px in a 48px tray.
    const tray = view.match(/<TabsList className="cp-tabs ([^"]*)"/)?.[1] ?? "";
    expect(tray.split(/\s+/)).toEqual(expect.arrayContaining(["bg-(--tray)", "shadow-(--elev-0)", "h-12!"]));
    expect(words).toContain("h-10!");
  });

  it("the profile header's hovers show on its card in dark", () => {
    // The header is a card now (it was the page colour). Dark slate-900 IS the
    // dark card, so a slate-900 hover on it would show nothing; slate-800 does.
    expect(read("features/client-profile/ProfileHeader.tsx")).not.toMatch(/dark:hover:bg-slate-900(?![\w/-])/);
    expect(ratio(hex(DARK, "--n-800"), hex(DARK, "--card"))).toBeGreaterThanOrEqual(1.15);
  });
});
