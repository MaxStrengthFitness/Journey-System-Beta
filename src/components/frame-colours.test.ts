import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * THE FRAME IS ONE LOOK (the Navy Frame, Oct 4 2026; AJ's answer 1A).
 *
 * The header, the bottom bar and the iPad status bar are the logo's navy
 * (--chrome, set in index.css :root only) in both themes. So everything drawn
 * ON them takes the frame's own tokens (--chrome-*): a theme ink such as
 * text-foreground is navy in the light theme, navy on navy; a Tailwind
 * palette class or a raw hex is the drift this round removed (the bar's
 * orange-500 at 2.8:1, NavButton's #115E8D and sky-500, the header's white).
 * core-tokens.test.ts measures the frame's pairs; this holds the shell to
 * them. Read from source, comments removed.
 */

const SRC = join(__dirname, "..");
const read = (rel: string) =>
  readFileSync(join(SRC, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

/** Every class-like string literal in a source. */
const classStrings = (source: string) =>
  [...source.matchAll(/(["'`])((?:[^"'`\\\n]|\\.){0,3000}?)\1/g)]
    .map((m) => m[2])
    .filter((s) => /^[A-Za-z0-9_\-:/[\].%#()!,\s>=?$*]+$/.test(s) && /\b(?:bg|text|border|ring)-/.test(s));

const PALETTE = /\b(?:bg|text|border|ring|from|to|via|fill|stroke|placeholder)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/;
const RAW_HEX = /#[0-9a-fA-F]{3,8}\b/;
/** Theme surfaces and inks: right on a page, wrong on a frame that never changes. */
const THEME_COLOUR = /(?:^|[\s:])(?:bg|text|border|ring)-(?:white|black|background|foreground|card|popover|primary|primary-foreground|muted|muted-foreground|bg-dark(?:-\d)?|ink-[ld]\d|div-[ld]|cyan|cta|brand)(?:\/\d+)?(?=\s|$)/;

const FRAME_FILES = ["components/AppHeader.tsx", "components/AppBottomBar.tsx", "components/NavButton.tsx"];

describe("the frame draws only in the frame's tokens", () => {
  it("the header's Bug button keeps the frame's ink: no palette colour and no stroke of its own on the icon", () => {
    // Oct 4 2026: a hover:stroke-orange-500 on the Bug stuck after a tap on the
    // navy header, an orange that meant neither now nor go.
    const source = read("features/feedback/FeedbackButton.tsx");
    expect(source).not.toMatch(PALETTE);
    expect(source).not.toMatch(/\bstroke-[a-z]/);
  });

  for (const file of FRAME_FILES) {
    it(`${file}: no palette class, raw hex or theme colour`, () => {
      const strings = classStrings(read(file));
      expect(strings.length, `${file} has class strings`).toBeGreaterThan(0);
      for (const s of strings) {
        expect(s, file).not.toMatch(PALETTE);
        expect(s, file).not.toMatch(RAW_HEX);
        expect(s, file).not.toMatch(THEME_COLOUR);
        expect(s, `${file}: the frame has no dark: look of its own`).not.toMatch(/\bdark:(?:bg|text|border|ring)-/);
      }
    });
  }

  it("every bar is the frame, with the frame's hairline (the Operations bar's in its orange)", () => {
    const bar = read("components/AppBottomBar.tsx");
    const navs = [...bar.matchAll(/<nav\b[\s\S]*?className="([^"]*)"/g)].map((m) => m[1]);
    expect(navs).toHaveLength(3);
    expect(navs.filter((n) => /(^|\s)border-chrome-line(\s|$)/.test(n))).toHaveLength(2);
    expect(navs.filter((n) => /(^|\s)border-chrome-go\/30(\s|$)/.test(n))).toHaveLength(1);
  });

  it("the orange tabs are the logo orange with a navy icon on their solid box", () => {
    const bar = read("components/AppBottomBar.tsx");
    const colours = [...bar.matchAll(/activeColor=\{?[^"]*"([^"]+)"/g)].map((m) => m[1]);
    const boxes = [...bar.matchAll(/activeBg=\{?[\s\S]*?"([^"]+)"/g)].map((m) => m[1]);
    expect(colours.length).toBeGreaterThanOrEqual(5);
    for (const c of colours) expect(c).toBe("text-chrome-go");
    for (const b of boxes) expect(b).toBe("bg-chrome-go text-chrome");
  });

  it("NavButton: the tab you're on is a solid box in the frame's blue; idle and attention in the frame's inks", () => {
    const nav = read("components/NavButton.tsx");
    expect(nav).toMatch(/activeColor = "text-chrome-here"/);
    expect(nav).toMatch(/activeBg = "bg-chrome-here text-chrome"/);
    expect(nav).toMatch(/activeIndicator = "bg-chrome-here"/);
    expect(nav).toMatch(/"text-chrome-ink-2 hover:text-chrome-ink"/);
    expect(nav).toMatch(/\? "text-chrome-go"/);
    expect(nav).toMatch(/"bg-chrome-go-fill"/);
    // The pulsing dot is ringed in the frame's navy, which cuts it out of the
    // faint box in both themes (it was ring-white / ring-slate-950).
    expect(nav).toMatch(/bg-chrome-go ring-2 ring-chrome animate-pulse/);
  });
});

describe("AppContent's pieces of the frame", () => {
  const app = read("AppContent.tsx");

  it("the header's icon buttons take the frame's inks and its focus ring", () => {
    const icons = app.match(/const headerIconClass =\s*"([^"]+)"/)?.[1] ?? "";
    expect(icons).toMatch(/(^|\s)text-chrome-ink-2(\s|$)/);
    expect(icons).toMatch(/(^|\s)hover:text-chrome-ink(\s|$)/);
    expect(icons).toMatch(/(^|\s)focus-visible:ring-chrome-here(\s|$)/);
    // The ghost button's own theme colours would come back on hover, while a
    // menu is open, and in the dark theme only: each is restated.
    for (const c of ["hover:bg-transparent", "dark:hover:bg-transparent", "aria-expanded:bg-transparent", "aria-expanded:text-chrome-ink"]) {
      expect(icons.split(/\s+/), c).toContain(c);
    }
    expect(icons).not.toMatch(PALETTE);
    expect(icons).not.toMatch(THEME_COLOUR);
  });

  it("the two icons that move into the avatar menu on a phone take the menu's inks there, not the frame's", () => {
    const menu = app.match(/const menuIconClass =\s*"([^"]+)"/)?.[1] ?? "";
    expect(menu).toMatch(/(^|\s)text-muted-foreground(\s|$)/);
    expect(menu).not.toMatch(/chrome/);
    expect(app).toMatch(/<ThemeToggle className=\{menuIconClass\} \/>\s*<FeedbackButton className=\{menuIconClass\} \/>/);
  });

  it("your avatar is the frame's blue with navy initials (the logo blue would be 2.0:1 on the navy)", () => {
    const trigger = app.match(/<DropdownMenuTrigger aria-label="Your menu" className="([^"]+)"/)?.[1] ?? "";
    expect(trigger).toMatch(/(^|\s)bg-chrome-here(\s|$)/);
    expect(trigger).toMatch(/(^|\s)text-chrome(\s|$)/);
    expect(trigger).not.toMatch(/bg-primary|text-primary-foreground/);
  });

  it("the avatar menu is a theme surface, drawn in theme tokens with no palette class", () => {
    const start = app.indexOf('<DropdownMenuTrigger aria-label="Your menu"');
    const end = app.indexOf("</DropdownMenuContent>", start);
    expect(start).toBeGreaterThan(0);
    const menu = app.slice(start, end);
    for (const s of classStrings(menu)) expect(s).not.toMatch(PALETTE);
    expect(menu).toMatch(/className="w-56 [^"]*\bbg-popover\b[^"]*\btext-foreground\b/);
    expect(menu).not.toMatch(/bg-white|bg-bg-dark/);
    expect(menu).toMatch(/variant="destructive"/);
  });
});
