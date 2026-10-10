/**
 * THE TRAINER TONES, HELD (the rooms round's review, Oct 10 2026).
 *
 * A trainer's tone is an identity colour (trainer-tone.ts hashes the id to
 * one of eight): an avatar's fill, a trainer-load bar, History's row edge.
 * An identity colour must not wear a colour that already has a job, and it
 * is no identity if two trainers' tones look alike. This holds, in light and
 * in dark:
 *
 *   - one tone per slot, as many as TONE_COUNT, the same in the dark block
 *     and its prefers-color-scheme fallback;
 *   - every tone 30 degrees of OKLCH hue or more from the blue (yours,
 *     picked), the orange (now, go), the crimson (critical), the plum
 *     (caution) and the Calendar's room hue, unless it is a grey (chroma
 *     under 0.06);
 *   - every two tones at least 0.08 apart in OKLab (by hue, chroma or
 *     lightness): the review found two 7 degrees apart, and a violet 6 to 10
 *     degrees from the room's own hue;
 *   - each solid 3:1 or more on the card (a mark), and a trainer's initials
 *     on it (--cal-tone-ink) 4.5:1 or more.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { TONE_COUNT } from "./trainer-tone";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "..");
const read = (rel: string) => readFileSync(join(SRC, rel), "utf8").replace(/\r\n/g, "\n").replace(/\/\*[\s\S]*?\*\//g, "");

/** The custom properties of the block that opens with `opener`. */
function block(css: string, opener: string): Record<string, string> {
  const at = css.indexOf(opener);
  if (at < 0) throw new Error(`block not found: ${opener}`);
  const open = css.indexOf("{", at + opener.length - 1);
  const body = css.slice(open + 1, css.indexOf("}", open));
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim().toLowerCase();
  return out;
}

const CAL = read("features/calendar/calendar.tokens.css");
const EQ = read("features/equipment/equipment.tokens.css");
const INDEX = read("index.css");

const CAL_LIGHT = block(CAL, "\n:root {");
const CAL_DARK = { ...CAL_LIGHT, ...block(CAL, '[data-theme="dark"] {') };
const CAL_FALLBACK = block(CAL, ':root:not(.light):not([data-theme="light"]) {');
const EQ_LIGHT = block(EQ, "\n:root {");
const EQ_DARK = { ...EQ_LIGHT, ...block(EQ, '[data-theme="dark"] {') };
const IX_LIGHT = block(INDEX, "\n:root {");
const IX_DARK = { ...IX_LIGHT, ...block(INDEX, "\n.dark {") };

const THEMES = {
  light: { cal: CAL_LIGHT, eq: EQ_LIGHT, ix: IX_LIGHT },
  dark: { cal: CAL_DARK, eq: EQ_DARK, ix: IX_DARK },
} as const;

const rgb = (h: string) => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const lin = (c: number) => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const lum = (h: string) => {
  const [r, g, b] = rgb(h).map(lin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
function oklab(h: string): [number, number, number] {
  const [r, g, b] = rgb(h).map(lin);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}
const chroma = (h: string) => Math.hypot(oklab(h)[1], oklab(h)[2]);
const hue = (h: string) => {
  const [, a, b] = oklab(h);
  return ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
};
const hueGap = (x: number, y: number) => {
  const d = Math.abs(x - y) % 360;
  return Math.min(d, 360 - d);
};
const distance = (x: string, y: string) => {
  const [p, q] = [oklab(x), oklab(y)];
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
};

const tones = (pal: Record<string, string>) => Array.from({ length: TONE_COUNT }, (_, i) => pal[`--t${i}-solid`]);
const isHex = (v: string | undefined) => !!v && /^#[0-9a-f]{6}$/.test(v);

describe("the trainer tones", () => {
  it("are TONE_COUNT solids, the dark fallback block the dark block's", () => {
    for (const pal of [CAL_LIGHT, CAL_DARK]) expect(tones(pal).every(isHex)).toBe(true);
    expect(tones(CAL_FALLBACK)).toEqual(tones(CAL_DARK));
    expect(Object.keys(CAL_LIGHT).filter((k) => /^--t\d+-/.test(k))).toHaveLength(TONE_COUNT);
  });

  for (const theme of ["light", "dark"] as const) {
    const { cal, eq, ix } = THEMES[theme];
    const jobs: Record<string, string> = {
      "the blue (yours, picked)": eq["--eq-live"],
      "the orange (now, go)": eq["--eq-go"],
      "the crimson (critical)": eq["--eq-alert"],
      "the plum (caution)": eq["--eq-warn"],
      "the Calendar's room hue": ix["--room-calendar"],
    };

    it(`${theme}: every tone is 30 degrees from the job colours and the room hue, or a grey`, () => {
      const close: string[] = [];
      tones(cal).forEach((tone, i) => {
        if (chroma(tone) < 0.06) return;
        for (const [what, colour] of Object.entries(jobs)) {
          if (hueGap(hue(tone), hue(colour)) < 30) close.push(`t${i} ${tone} is ${hueGap(hue(tone), hue(colour)).toFixed(0)} degrees from ${what}`);
        }
      });
      expect(close).toEqual([]);
    });

    it(`${theme}: every two tones are at least 0.08 apart in OKLab`, () => {
      const t = tones(cal);
      const alike: string[] = [];
      for (let i = 0; i < t.length; i++) {
        for (let j = i + 1; j < t.length; j++) {
          if (distance(t[i], t[j]) < 0.08) alike.push(`t${i} ${t[i]} and t${j} ${t[j]}: ${distance(t[i], t[j]).toFixed(3)}`);
        }
      }
      expect(alike).toEqual([]);
    });

    it(`${theme}: a solid is 3:1 on the card, and a trainer's initials on it 4.5:1`, () => {
      tones(cal).forEach((tone, i) => {
        expect(ratio(tone, cal["--cal-surface"]), `t${i} on the card`).toBeGreaterThanOrEqual(3);
        expect(ratio(cal["--cal-tone-ink"], tone), `initials on t${i}`).toBeGreaterThanOrEqual(4.5);
      });
    });
  }
});
