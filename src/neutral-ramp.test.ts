import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The neutral ramp, enforced — and a ratchet on colour drift.
 *
 * WHAT WENT WRONG, so a future edit does not undo the fix.
 *
 * This app was built dark-first on Tailwind's stock `slate` scale, and every
 * dark-mode token in index.css IS a Tailwind slate value. The Sep 9 light-mode
 * retune then moved the LIGHT palette off pure slate on purpose — a ground a
 * real step below white, greys pulled off blue, muted inks darkened to clear
 * AA — but the ~2,700 hardcoded `slate-*` classes in the components did not
 * move with it. Light mode therefore painted Tailwind's cold blue-grey right
 * beside the retuned brand neutral, on screen after screen. That mismatch was
 * the whole of the "some screens don't match the rest" report.
 *
 * The fix redefines what `slate-*` MEANS (the `@theme` block in index.css)
 * rather than editing 2,700 call sites. That only stays true if three things
 * stay true, so this file checks them against the ACTUAL file rather than
 * trusting the comment beside them:
 *
 *   1. DARK IS UNTOUCHED. The dark ramp must remain byte-identical to
 *      Tailwind slate. Dark mode already agreed with the brand; if someone
 *      "tidies" the dark ramp, every dark screen shifts at once and the
 *      damage is invisible until it is on a tablet in a studio.
 *   2. BOTH RAMPS STAY MONOTONIC. 50 is the lightest rung and 950 the
 *      darkest, in both themes. A non-monotonic ramp inverts a pairing
 *      somebody already wrote as `bg-white dark:bg-slate-900`.
 *   3. THE TEXT RUNGS STILL CLEAR AA. The rungs that components actually
 *      use for type have to hold their contrast on the light ground.
 *
 * And one ratchet, in the same spirit as the CI typecheck gate: a COUNT, not
 * a clean run. A gate demanding zero hardcoded colours would be red on every
 * commit, which is the same as no gate. This one just refuses to let the
 * number climb back up.
 *
 * If you retune a token and this fails, the fix is usually the token, not the
 * test. If you deliberately add drift, move the ratchet and say why.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const INDEX_CSS = readFileSync(join(HERE, "index.css"), "utf8");

/** Tailwind v4's stock slate scale — the values the dark ramp must equal. */
const TAILWIND_SLATE: Record<string, string> = {
  "50": "#F8FAFC",
  "100": "#F1F5F9",
  "200": "#E2E8F0",
  "300": "#CBD5E1",
  "400": "#94A3B8",
  "500": "#64748B",
  "600": "#475569",
  "700": "#334155",
  "800": "#1E293B",
  "900": "#0F172A",
  "950": "#020617",
};

const RUNGS = Object.keys(TAILWIND_SLATE);

/**
 * Pull the `--n-*` definitions out of one block of index.css.
 *
 * Deliberately scans from the selector to the NEXT top-level `}` rather than
 * parsing CSS: the ramp is a flat run of custom properties inside `:root` and
 * `.dark`, and a real parser here would be more code than the thing it checks.
 */
function readRamp(selector: string): Record<string, string> {
  const i = INDEX_CSS.indexOf(`\n${selector} {`);
  if (i < 0) throw new Error(`block not found: ${selector}`);
  const close = INDEX_CSS.indexOf("\n}", i);
  const body = INDEX_CSS.slice(i, close);
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/--n-(\d+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    out[m[1]] = m[2].toUpperCase();
  }
  return out;
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

const LIGHT = readRamp(":root");
const DARK = readRamp(".dark");

/** The light page ground, which most light-mode type sits on or near. */
const GROUND = "#EDF0F5";

describe("the neutral ramp is defined at all", () => {
  it("declares every rung in both themes", () => {
    expect(Object.keys(LIGHT).sort()).toEqual(RUNGS.slice().sort());
    expect(Object.keys(DARK).sort()).toEqual(RUNGS.slice().sort());
  });

  it("maps every rung of Tailwind's slate scale through @theme", () => {
    // If a rung is missing from the @theme block it silently keeps Tailwind's
    // own value, which is exactly the split-brain state this round removed.
    // Whitespace-tolerant because the declarations in index.css are aligned.
    for (const rung of RUNGS) {
      expect(
        new RegExp(`--color-slate-${rung}:\\s*var\\(--n-${rung}\\);`).test(INDEX_CSS),
        `@theme does not map slate-${rung} to --n-${rung}`,
      ).toBe(true);
    }
  });
});

describe("dark mode is byte-identical to Tailwind slate", () => {
  // Every dark token in index.css IS one of these values: --background is
  // slate-950, --card is slate-900, --elevated is slate-800, and
  // --ink-l1/l2/l3/l4 are slate-50/300/400/500. Changing a rung here moves
  // every dark screen in the app.
  for (const rung of RUNGS) {
    it(`slate-${rung} is unchanged in dark`, () => {
      expect(DARK[rung]).toBe(TAILWIND_SLATE[rung]);
    });
  }
});

describe("both ramps are monotonic and non-inverting", () => {
  for (const [name, ramp] of [["light", LIGHT], ["dark", DARK]] as const) {
    it(`${name} gets darker at every step`, () => {
      for (let i = 1; i < RUNGS.length; i++) {
        const prev = ramp[RUNGS[i - 1]];
        const cur = ramp[RUNGS[i]];
        expect(
          luminance(cur),
          `${name}: slate-${RUNGS[i]} (${cur}) is not darker than slate-${RUNGS[i - 1]} (${prev})`,
        ).toBeLessThan(luminance(prev));
      }
    });
  }
});

describe("the light rungs that carry text clear AA", () => {
  // Only the rungs components actually use for type. slate-400 is absent on
  // purpose: it is a NON-TEXT grey (2.7:1) and cannot be darkened without
  // colliding with slate-500, which is why the 367 places that used it for
  // text were moved to `text-muted-foreground` instead.
  const TEXT_RUNGS = ["500", "600", "700", "800", "900", "950"];
  for (const rung of TEXT_RUNGS) {
    it(`slate-${rung} on the light ground`, () => {
      expect(ratio(LIGHT[rung], GROUND)).toBeGreaterThanOrEqual(4.5);
    });
  }

  it("slate-400 is still a non-text grey, and stays lighter than slate-500", () => {
    // Documents the boundary rather than pretending it passes. If a future
    // edit darkens 400 to "fix" it, the monotonic check above catches the
    // collision, and this says why it was left alone.
    expect(ratio(LIGHT["400"], GROUND)).toBeLessThan(4.5);
    expect(luminance(LIGHT["400"])).toBeGreaterThan(luminance(LIGHT["500"]));
  });
});

/* ---------------------------------------------------------------------------
   THE DRIFT RATCHET
   --------------------------------------------------------------------------- */

/** Colour utilities pinned to a fixed palette value rather than a token. */
const PALETTE =
  /(?:^|[\s"'`])(?:bg|text|border|ring|from|to|via|fill|stroke|divide|placeholder)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(?:50|100|200|300|400|500|600|700|800|900|950)(?![\w-])/g;

/** A string literal that plausibly is a list of class names. */
const CLASS_LIKE = /^[A-Za-z0-9_\-:/[\].%#(),\s]+$/;
const STRING_LITERAL = /(["'`])((?:[^"'`\\\n]|\\.){0,3000}?)\1/g;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (name.endsWith(".tsx")) out.push(full);
  }
  return out;
}

/**
 * Screens that paint a fixed dark surface REGARDLESS of theme, and are
 * therefore allowed to pin their colours.
 *
 * This is not a list of screens nobody got round to. On a surface that never
 * changes theme, a theme-aware token is wrong half the time: `text-muted-
 * foreground` on a near-black pane resolves to #55606F in light theme, which
 * is roughly 2.4:1 — unreadable. Each of these has a deliberate always-dark
 * root (checked, not assumed):
 *
 *   AccessRequestView        `touch-pane ... bg-[#1c1d1f]`, ambient gradient
 *   ClientFocusDashboard     `flex flex-col h-full bg-[#0A2E46] text-slate-200`
 *   ErrorBoundary            `min-h-screen bg-[#0A2E46] ... text-white`
 *   LegacyChartImporter      `bg-slate-950 min-h-screen text-slate-100`
 *   ClientProgressReportView `min-h-screen bg-[#0A2E46] text-[#FAF9F6]` (print)
 *
 * If one of these is ever converted to follow the theme, take it off this list
 * and the budget below tightens automatically.
 */
const ALWAYS_DARK_SCREENS = new Set([
  "components/AccessRequestView.tsx",
  "components/ClientFocusDashboard.tsx",
  "components/ErrorBoundary.tsx",
  "components/LegacyChartImporter.tsx",
  "components/ClientProgressReportView.tsx",
]);

/**
 * Count palette utilities that are NOT theme-aware: no `dark:` prefix of their
 * own, and no `dark:` variant anywhere in the same class string. These render
 * one fixed colour in both themes, so on a theme-aware screen one of the two
 * is always wrong.
 *
 * Paired utilities (`bg-white dark:bg-slate-900`) are not counted: after the
 * ramp they resolve to brand neutrals in both themes and are merely verbose,
 * not broken. Collapsing those onto semantic tokens is ongoing work, not a
 * thing to fail a build over.
 */
function countBarePaletteUtilities(): number {
  let total = 0;
  for (const file of walk(HERE)) {
    const rel = file.slice(HERE.length + 1).split("\\").join("/");
    if (ALWAYS_DARK_SCREENS.has(rel)) continue;
    const source = readFileSync(file, "utf8");
    for (const m of source.matchAll(STRING_LITERAL)) {
      const body = m[2];
      if (!CLASS_LIKE.test(body)) continue;
      if (body.includes("dark:")) continue;
      total += (body.match(PALETTE) ?? []).length;
    }
  }
  return total;
}

/**
 * The high-water mark across the theme-aware screens, recorded after the
 * Sep 12 2026 consistency round. The always-dark screens above are excluded
 * and account for a further ~306 that are legitimately pinned.
 *
 * Lower it whenever you bring the number down — that is the point of a
 * ratchet. Raising it should take a sentence in the commit message saying
 * what is deliberately hardcoded and why.
 */
const BARE_PALETTE_BUDGET = 311;

describe("colour drift does not creep back", () => {
  it(`has at most ${BARE_PALETTE_BUDGET} non-theme-aware palette utilities`, () => {
    const found = countBarePaletteUtilities();
    expect(
      found,
      `Found ${found} palette utilities with no dark: variant (budget ${BARE_PALETTE_BUDGET}). ` +
        `Prefer a semantic token: text-muted-foreground, bg-card, border-border, text-foreground. ` +
        `If the screen is deliberately always-dark, add it to ALWAYS_DARK_SCREENS instead.`,
    ).toBeLessThanOrEqual(BARE_PALETTE_BUDGET);
  });
});
