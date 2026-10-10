/**
 * THE CALENDAR'S LOOK, HELD (the rooms round, Oct 10 2026).
 *
 * The audit found the Calendar off the app's scale (9, 10, 13, 15, 19, 26
 * and 46px), names cut ("Ma rk Na ka mu ra"), taps under 40px and a raw red
 * error screen. This holds what the round fixed, in the Calendar's
 * stylesheet and the room bar's:
 *
 *   - every font size on the app's scale, 11 · 12 · 14 · 17 · 22 · 30;
 *   - the display face upright and in its own capitalisation;
 *   - no name cut: no ellipsis, no line clamp;
 *   - colours are tokens: no raw hex in the stylesheets (the token files
 *     hold the values);
 *   - every tap target 40px or more;
 *   - the Calendar's error screen in the app's tokens, with no reload of
 *     its own.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "..");
const read = (rel: string) => readFileSync(join(SRC, rel), "utf8").replace(/\r\n/g, "\n");
const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");

const SHEETS = ["features/calendar/calendar.css", "features/rooms/rooms.css"] as const;
const SCALE = new Set([11, 12, 14, 17, 22, 30]);

/** Every rule as [selector, { property: value }] (at-rules' rules included; a later declaration wins). */
function rules(rel: string): Array<[string, Record<string, string>]> {
  const out: Array<[string, Record<string, string>]> = [];
  for (const m of stripComments(read(rel)).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const body: Record<string, string> = {};
    for (const d of m[2].matchAll(/([\w-]+)\s*:\s*([^;]+);?/g)) body[d[1].trim()] = d[2].trim();
    out.push([m[1].trim().replace(/\s+/g, " "), body]);
  }
  return out;
}

describe("the Calendar and the room bar are on the app's type scale", () => {
  for (const sheet of SHEETS) {
    it(`${sheet}: every font size is 11, 12, 14, 17, 22 or 30`, () => {
      const off = rules(sheet)
        .filter(([, body]) => body["font-size"])
        .filter(([, body]) => {
          const px = /^(\d+(?:\.\d+)?)px$/.exec(body["font-size"]);
          // 0 hides a loading mark's letters; it draws no text.
          return body["font-size"] !== "0" && (!px || !SCALE.has(Number(px[1])));
        })
        .map(([sel, body]) => `${sel}: ${body["font-size"]}`);
      expect(off).toEqual([]);
    });

    it(`${sheet}: the display face stands upright, in its own capitalisation`, () => {
      const slanted = rules(sheet)
        .filter(([, body]) => /--font-display/.test(body["font-family"] ?? ""))
        .filter(([, body]) => (body["font-style"] ?? "normal") !== "normal" || /uppercase/.test(body["text-transform"] ?? ""))
        .map(([sel]) => sel);
      expect(slanted).toEqual([]);
    });

    it(`${sheet}: no name is cut (no ellipsis, no line clamp)`, () => {
      const css = stripComments(read(sheet));
      expect(css).not.toMatch(/text-overflow:\s*ellipsis/);
      expect(css).not.toMatch(/line-clamp/);
    });

    it(`${sheet}: colours are tokens, never a raw hex`, () => {
      expect(stripComments(read(sheet)).match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toEqual([]);
    });
  }
});

/** The Calendar's tap targets and the room bar's, each with the rule that sizes it. */
const TAPS: Array<[string, string]> = [
  ["features/rooms/rooms.css", ".rm-switch__btn"],
  ["features/rooms/rooms.css", ".rm-tool"],
  ["features/calendar/calendar.css", ".cal-nav__btn"],
  ["features/calendar/calendar.css", ".cal-nav__label"],
  ["features/calendar/calendar.css", ".cal-refresh__btn"],
  ["features/calendar/calendar.css", ".cal-pick__opt"],
  ["features/calendar/calendar.css", ".cal-wstrip__day"],
  ["features/calendar/calendar.css", ".cal-fold__btn"],
  ["features/calendar/calendar.css", ".cal-wday__open"],
  ["features/calendar/calendar.css", ".cal-wday__fold"],
  ["features/calendar/calendar.css", ".cal-wbk"],
  ["features/calendar/calendar.css", ".cal-bar"],
  ["features/calendar/calendar.css", ".cal-life__toggle"],
  ["features/calendar/calendar.css", ".cal-life__item"],
  ["features/calendar/calendar.css", ".cal-seg__btn"],
];

describe("every tap on the Calendar is 40px or more", () => {
  it.each(TAPS)("%s %s", (sheet, sel) => {
    const sizes = rules(sheet)
      .filter(([s]) => s.split(",").map((x) => x.trim()).includes(sel))
      .flatMap(([, body]) => [body["height"], body["min-height"]].filter(Boolean) as string[]);
    expect(sizes.length, `${sel} sets its height`).toBeGreaterThan(0);
    for (const v of sizes) expect(Number(/^(\d+)px$/.exec(v)?.[1] ?? 0), `${sel}: ${v}`).toBeGreaterThanOrEqual(40);
  });

  it("a month's day is at least 64px tall at every width", () => {
    const mins = [...stripComments(read("features/calendar/calendar.css")).matchAll(/--cal-day-min:\s*(\d+)px/g)].map((m) => Number(m[1]));
    expect(mins.length).toBeGreaterThan(0);
    for (const n of mins) expect(n).toBeGreaterThanOrEqual(64);
  });
});

describe("the Calendar's error screen", () => {
  const app = read("AppContent.tsx");
  const at = app.indexOf("The Calendar couldn");
  const screen = stripComments(app.slice(app.lastIndexOf("fallback={", at), app.indexOf("</ErrorBoundary>", at)));

  it("is drawn in the app's tokens: no raw Tailwind red or slate", () => {
    expect(at).toBeGreaterThan(0);
    expect(screen).not.toMatch(/\b(?:bg|text|border)-(?:red|slate|rose|gray)-\d/);
    expect(screen).toMatch(/bg-card/);
  });

  it("never reloads the page itself (KNOWN-TRAPS: ask features/new-version)", () => {
    expect(screen).not.toMatch(/location\.reload/);
  });
});
