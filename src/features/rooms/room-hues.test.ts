/**
 * THE ROOM HUES (the rooms round, Oct 10 2026; AJ's answer 1b).
 *
 * A room's hue is a colour job of its own, WHERE YOU ARE, and it goes on two
 * things only: the room's mark tile and the 3px line along the bottom of its
 * bar. This file holds the rule and measures every hue:
 *
 *   1. every room has its hue in :root and .dark, an uppercase #RRGGBB;
 *   2. the mark's icon on the hue is at least 3:1 (an icon that means
 *      something), and the line on the bar's surface (--card) is at least
 *      3:1, in light AND dark;
 *   3. no hue reads as a colour that already has a job: every room but the
 *      Hub (the logo blue: your day) and the session (the orange of now)
 *      sits at least 30 degrees of OKLCH hue from the blue, the orange, the
 *      crimson and the plum, or is a grey (chroma under 0.06);
 *   4. NOTHING outside src/features/rooms/rooms.css reads a --room- token,
 *      and inside it only the mark and the line read the hue.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ROOM_IDS, ROOMS_ON_A_JOB_COLOUR, type RoomId } from "./rooms";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "..");
const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");
const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");

const INDEX_CSS = read(join(SRC, "index.css"));
const EQ_CSS = read(join(SRC, "features", "equipment", "equipment.tokens.css"));
const ROOMS_CSS = read(join(HERE, "rooms.css"));

/** The custom properties of the block that opens with `selector {` at the start of a line. */
function block(css: string, selector: string): Record<string, string> {
  const i = css.indexOf(`\n${selector} {`);
  if (i < 0) throw new Error(`block not found: ${selector}`);
  const body = stripComments(css.slice(i, css.indexOf("\n}", i)));
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}

const ROOT = block(INDEX_CSS, ":root");
const THEMES = { light: ROOT, dark: { ...ROOT, ...block(INDEX_CSS, ".dark") } } as const;
const EQ_LIGHT = block(EQ_CSS, ":root");
// equipment.tokens.css opens its dark block ".dark,\n[data-theme="dark"] {".
const EQ = { light: EQ_LIGHT, dark: { ...EQ_LIGHT, ...block(EQ_CSS, '[data-theme="dark"]') } } as const;
type Theme = keyof typeof THEMES;

function hex(theme: Theme, token: string, from: Record<string, string> = THEMES[theme]): string {
  const value = from[token];
  if (value === undefined) throw new Error(`${token} is not set for ${theme}`);
  const v = value.toUpperCase();
  if (!/^#[0-9A-F]{6}$/.test(v)) throw new Error(`${token} in ${theme} is "${value}", not a #RRGGBB`);
  return v;
}

const rgb = (h: string) => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const lin = (c: number) => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
function luminance(h: string): number {
  const [r, g, b] = rgb(h).map(lin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function ratio(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
/** OKLCH lightness, chroma and hue (degrees). */
function oklch(h: string): { L: number; C: number; H: number } {
  const [r, g, b] = rgb(h).map(lin);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return { L, C: Math.hypot(A, B), H: ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360 };
}
const hueGap = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360;
  return Math.min(d, 360 - d);
};

const markInk = (room: RoomId) => (room === "session" ? "--room-session-ink" : "--room-mark-ink");

/** The colours that already mean something (the Navy Frame), per theme. */
function jobColours(theme: Theme): Record<string, string> {
  return {
    "the blue (yours, picked)": hex(theme, "--primary"),
    "the orange (now, go)": hex(theme, "--cta"),
    "the crimson (critical)": hex(theme, "--eq-alert", EQ[theme]),
    "the plum (caution)": hex(theme, "--eq-warn", EQ[theme]),
  };
}

describe("every room has a hue, measured in both modes", () => {
  for (const theme of ["light", "dark"] as const) {
    for (const room of ROOM_IDS) {
      it(`${room}, ${theme}: the mark's icon on the hue is at least 3:1`, () => {
        expect(ratio(hex(theme, markInk(room)), hex(theme, `--room-${room}`))).toBeGreaterThanOrEqual(3);
      });
      it(`${room}, ${theme}: the line on the bar (--card) is at least 3:1`, () => {
        expect(ratio(hex(theme, `--room-${room}`), hex(theme, "--card"))).toBeGreaterThanOrEqual(3);
      });
    }
  }

  it("the Calendar's hue, as settled (Oct 10 2026)", () => {
    expect(hex("light", "--room-calendar")).toBe("#5048A6");
    expect(hex("dark", "--room-calendar")).toBe("#A79FF0");
    expect(ratio("#FFFFFF", "#5048A6")).toBeGreaterThan(7.4);
    expect(ratio("#002341", "#A79FF0")).toBeGreaterThan(6.7);
  });

  it("nothing puts white on the session's orange: its mark ink is navy", () => {
    for (const theme of ["light", "dark"] as const) {
      expect(hex(theme, "--room-session-ink")).not.toBe("#FFFFFF");
      expect(ratio(hex(theme, "--room-session-ink"), hex(theme, "--room-session"))).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("no room hue reads as a colour that already has a job", () => {
  for (const theme of ["light", "dark"] as const) {
    it(`${theme}: the Hub keeps the logo blue and the session keeps the orange`, () => {
      expect(hueGap(oklch(hex(theme, "--room-hub")).H, oklch(hex(theme, "--primary")).H)).toBeLessThanOrEqual(10);
      expect(hueGap(oklch(hex(theme, "--room-session")).H, oklch(hex(theme, "--cta")).H)).toBeLessThanOrEqual(10);
    });

    for (const room of ROOM_IDS.filter((r) => !ROOMS_ON_A_JOB_COLOUR.has(r))) {
      it(`${room}, ${theme}: 30 degrees from the blue, the orange, the crimson and the plum, or a grey`, () => {
        const own = oklch(hex(theme, `--room-${room}`));
        if (own.C < 0.06) return; // a grey reads as no colour at all
        for (const [what, colour] of Object.entries(jobColours(theme))) {
          expect(hueGap(own.H, oklch(colour).H), `${room} against ${what}`).toBeGreaterThanOrEqual(30);
        }
      });
    }
  }
});

/* ---------------------------------------------------------------------------
   Where a room's hue may be painted.
   --------------------------------------------------------------------------- */

function filesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...filesUnder(path));
    else if (/\.(css|tsx?|jsx?)$/.test(name)) out.push(path);
  }
  return out;
}

/** Every rule in a stylesheet as [selector, declarations], at-rules' rules included. */
function rules(css: string): Array<[string, Array<[string, string]>]> {
  const out: Array<[string, Array<[string, string]>]> = [];
  for (const m of stripComments(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const decls: Array<[string, string]> = [];
    for (const d of m[2].matchAll(/([\w-]+)\s*:\s*([^;]+);?/g)) decls.push([d[1].trim(), d[2].trim()]);
    out.push([m[1].trim().replace(/\s+/g, " "), decls]);
  }
  return out;
}

describe("a room's hue goes on its mark and its bar's line, and nowhere else", () => {
  it("nothing outside src/features/rooms/rooms.css reads a --room- token (index.css only declares them)", () => {
    const readers = filesUnder(SRC)
      .map((path) => relative(SRC, path).replace(/\\/g, "/"))
      .filter((rel) => rel !== "index.css" && rel !== "features/rooms/rooms.css" && !/^features\/rooms\/[^/]+\.test\.tsx?$/.test(rel))
      .filter((rel) => read(join(SRC, rel)).includes("--room-"));
    expect(readers).toEqual([]);
  });

  it("index.css only DECLARES them, and declares exactly the rooms and the two inks", () => {
    const uses = [...INDEX_CSS.matchAll(/var\(--room-/g)];
    expect(uses).toHaveLength(0);
    const declared = new Set(Object.keys(ROOT).filter((t) => t.startsWith("--room-")));
    expect([...declared].sort()).toEqual([...ROOM_IDS.map((r) => `--room-${r}`), "--room-mark-ink", "--room-session-ink"].sort());
  });

  it("nothing outside rooms.css reads the bar's own --rm-hue or --rm-mark-ink", () => {
    const readers = filesUnder(SRC)
      .map((path) => relative(SRC, path).replace(/\\/g, "/"))
      .filter((rel) => rel !== "features/rooms/rooms.css" && !/^features\/rooms\/[^/]+\.test\.tsx?$/.test(rel))
      .filter((rel) => /--rm-(hue|mark-ink)/.test(read(join(SRC, rel))));
    expect(readers).toEqual([]);
  });

  it("in rooms.css, the hue is read only by the mark's fill and the line along the bar's foot", () => {
    const readers: string[] = [];
    for (const [selector, decls] of rules(ROOMS_CSS)) {
      for (const [prop, value] of decls) {
        if (/var\(--rm-hue\)/.test(value)) readers.push(`${selector} ${prop}`);
      }
    }
    expect(readers.sort()).toEqual([".rm-bar::after background", ".rm-mark background"]);
  });

  it("in rooms.css, the mark ink is the mark's icon colour and nothing else's", () => {
    const readers: string[] = [];
    for (const [selector, decls] of rules(ROOMS_CSS)) {
      for (const [prop, value] of decls) {
        if (/var\(--rm-mark-ink\)/.test(value)) readers.push(`${selector} ${prop}`);
      }
    }
    expect(readers).toEqual([".rm-mark color"]);
  });

  it("in rooms.css, a --room- token only ever sets the bar's two local properties", () => {
    const bad: string[] = [];
    for (const [selector, decls] of rules(ROOMS_CSS)) {
      for (const [prop, value] of decls) {
        if (!value.includes("--room-")) continue;
        if (!/^\.rm-bar(\[data-room="[a-z]+"\])?$/.test(selector) || !/^--rm-(hue|mark-ink)$/.test(prop)) bad.push(`${selector} ${prop}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("every room's bar finds its own hue", () => {
    for (const room of ROOM_IDS) {
      const rule = rules(ROOMS_CSS).find(([selector]) => selector === `.rm-bar[data-room="${room}"]`);
      expect(rule, room).toBeTruthy();
      expect(rule![1]).toContainEqual(["--rm-hue", `var(--room-${room})`]);
    }
  });

  it("the switch's picked words are blue at 4.5:1 on the raised segment, in both modes", () => {
    for (const theme of ["light", "dark"] as const) {
      expect(ratio(hex(theme, "--primary"), hex(theme, "--raised"))).toBeGreaterThanOrEqual(4.5);
      expect(ratio(hex(theme, "--muted-foreground"), hex(theme, "--well"))).toBeGreaterThanOrEqual(4.5);
      // The well's edge is the group's 3:1 boundary, on the bar and on the well.
      expect(ratio(hex(theme, "--input"), hex(theme, "--card"))).toBeGreaterThanOrEqual(3);
    }
  });
});
