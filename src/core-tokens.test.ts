import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * THE CORE TOKENS, CHECKED AGAINST THE ACTUAL FILE (the Navy Frame, Oct 4 2026).
 *
 * index.css's :root and .dark are the colours every shadcn control, every
 * `bg-card` and `text-muted-foreground`, and the frame are drawn in. AJ asked
 * for light mode to be less bright and dark mode to be less grey, with the
 * logo's blue and orange as the accents; the palette that answered him moved
 * almost every value here at once. Nothing checked these pairs before, so a
 * later retune could drop body copy, a Save's label or the red of Sign out
 * under AA and every test would stay green. This file holds them:
 *
 *   - words on the surfaces they sit on clear 4.5:1, in both modes, including
 *     the destructive red on its own resting button tint (red words on a 10%
 *     tint in light, 20% in dark: the shadcn destructive variant);
 *   - a control's boundary (--input) and the focus ring clear 3:1;
 *   - the frame (--chrome, the header, the bottom bar and the status bar) is
 *     set once in :root, never in .dark, and its words and marks clear 4.5:1
 *     on it; each frame token has its Tailwind utility;
 *   - no words are white on the logo orange: they are navy, --cta-foreground;
 *   - light mode has no pure-white surface, and dark mode's surfaces are navy,
 *     not grey.
 *
 * Values are read as literal #RRGGBB, in index.css's uppercase, the way
 * neutral-ramp.test.ts and home-screen.test.ts read them. If a retune fails
 * here, the fix is usually the token, not the test.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const INDEX_CSS = readFileSync(join(HERE, "index.css"), "utf8");

/** The text of the block that opens with `selector {` at the start of a line. */
function blockOf(selector: string): string {
  const i = INDEX_CSS.indexOf(`\n${selector} {`);
  if (i < 0) throw new Error(`block not found: ${selector}`);
  return INDEX_CSS.slice(i, INDEX_CSS.indexOf("\n}", i));
}

/** Every custom property a block declares, with its comments stripped. */
function declarations(selector: string): Record<string, string> {
  const body = blockOf(selector).replace(/\/\*[\s\S]*?\*\//g, "");
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}

const ROOT = declarations(":root");
const DARK_OWN = declarations(".dark");

/** .dark sits on <html> under :root, so a token it does not redefine is :root's. */
const THEMES = { light: ROOT, dark: { ...ROOT, ...DARK_OWN } } as const;
type Theme = keyof typeof THEMES;

function hex(theme: Theme, token: string): string {
  const value = THEMES[theme][token];
  if (value === undefined) throw new Error(`${token} is not set for ${theme}`);
  if (!/^#[0-9A-F]{6}$/.test(value)) {
    throw new Error(`${token} in ${theme} is "${value}", not an uppercase #RRGGBB`);
  }
  return value;
}

const rgb = (h: string) => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const channel = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

function luminance(h: string): number {
  const [r, g, b] = rgb(h).map((c) => channel(c / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** `fg` at `alpha` over `bg`: what `bg-destructive/10` paints on a card. */
function over(fg: string, bg: string, alpha: number): string {
  const [f, b] = [rgb(fg), rgb(bg)];
  return (
    "#" +
    f
      .map((c, i) => Math.round(c * alpha + b[i] * (1 - alpha)).toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase()
  );
}

/** Words on the surface they sit on: 4.5:1 in both modes. */
const TEXT_PAIRS: [string, string, string][] = [
  ["body copy on the page", "--foreground", "--background"],
  ["body copy on a card", "--foreground", "--card"],
  ["a card's words", "--card-foreground", "--card"],
  ["a menu's words", "--popover-foreground", "--popover"],
  ["quiet words on a card", "--muted-foreground", "--card"],
  ["quiet words on the page", "--muted-foreground", "--background"],
  ["quiet words on a muted fill", "--muted-foreground", "--muted"],
  ["a Save's label (the default button)", "--primary-foreground", "--primary"],
  ["blue words, a link, on a card", "--primary", "--card"],
  ["words on the brand fill", "--brand-foreground", "--brand"],
  ["words on the logo orange", "--cta-foreground", "--cta"],
  ["words on the action orange (the slider)", "--action-foreground", "--action"],
  ["words on the secondary fill", "--secondary-foreground", "--secondary"],
  ["an accent's words", "--accent-foreground", "--accent"],
  ["red words on a menu (Sign out)", "--destructive", "--popover"],
  ["red words on a card", "--destructive", "--card"],
  ["red words on the page", "--destructive", "--background"],
  ["words on a solid destructive fill, for its first reader", "--destructive-foreground", "--destructive"],
  ["the ladder's ink on its page", "--ink-d1", "--bg-dark"],
  ["the ladder's second ink on its card", "--ink-d2", "--bg-dark-2"],
  ["the ladder's labels on its card", "--ink-d3", "--bg-dark-2"],
  ["the ladder's labels on its page", "--ink-d3", "--bg-dark"],
  // Depth (type and depth, Oct 4 2026): a raised button, a well, the tray.
  ["words on a raised control (an outline button)", "--foreground", "--raised"],
  ["quiet words in a well", "--muted-foreground", "--well"],
  ["a tab's words on the tray", "--ink-d2", "--tray"],
];

/** A control's own boundary and the focus ring: 3:1 (WCAG 1.4.11). */
const UI_PAIRS: [string, string, string][] = [
  ["a field's border on a card", "--input", "--card"],
  ["a field's border on the page", "--input", "--background"],
  ["the focus ring on a card", "--ring", "--card"],
  ["the focus ring on the page", "--ring", "--background"],
  // A raised control keeps its 3:1 edge (AJ's answer 2A, Oct 4 2026).
  ["a raised control's edge", "--input", "--raised"],
];

/** The shadcn destructive button's resting tint: bg-destructive/10, and /20 in dark. */
const DESTRUCTIVE_TINT: Record<Theme, number> = { light: 0.1, dark: 0.2 };

for (const theme of ["light", "dark"] as const) {
  describe(`the core tokens, ${theme} mode`, () => {
    for (const [what, fg, bg] of TEXT_PAIRS) {
      it(`${what} (${fg} on ${bg}) is at least 4.5:1`, () => {
        expect(ratio(hex(theme, fg), hex(theme, bg))).toBeGreaterThanOrEqual(4.5);
      });
    }

    it(`red words on their resting button tint (${DESTRUCTIVE_TINT[theme] * 100}% over a card) are at least 4.5:1`, () => {
      const red = hex(theme, "--destructive");
      const tint = over(red, hex(theme, "--card"), DESTRUCTIVE_TINT[theme]);
      expect(ratio(red, tint)).toBeGreaterThanOrEqual(4.5);
    });

    for (const [what, fg, bg] of UI_PAIRS) {
      it(`${what} (${fg} on ${bg}) is at least 3:1`, () => {
        expect(ratio(hex(theme, fg), hex(theme, bg))).toBeGreaterThanOrEqual(3);
      });
    }

    it("puts no white words on the logo orange, and the deep orange still carries white", () => {
      // White on the logo orange is 2.99:1, so its words are navy. --cta-strong
      // is the deep orange the not-yet-moved `bg-cta-strong text-white`
      // buttons sit on.
      expect(hex(theme, "--cta-foreground")).not.toBe("#FFFFFF");
      expect(hex(theme, "--action-foreground")).not.toBe("#FFFFFF");
      expect(ratio("#FFFFFF", hex(theme, "--cta-strong"))).toBeGreaterThanOrEqual(4.5);
    });

    it("keeps --cyan the theme's blue: it equals --primary", () => {
      // --cyan was Tailwind sky #38BDF8 in both themes until Oct 4 2026, so its
      // focus rings and words were 2.1:1 on a light surface.
      expect(hex(theme, "--cyan")).toBe(hex(theme, "--primary"));
    });
  });
}

describe("the orange is the same in both modes", () => {
  it("writes --cta, --cta-foreground and --cta-strong out in .dark with :root's values", () => {
    for (const token of ["--cta", "--cta-foreground", "--cta-strong"]) {
      expect(DARK_OWN[token], `${token} is not written in .dark`).toBeDefined();
      expect(hex("dark", token)).toBe(hex("light", token));
    }
  });
});

describe("easier on the eyes", () => {
  it("light mode has no pure-white surface (AJ: 'the light mode is just so bright')", () => {
    // --raised, --well and --tray are the depth surfaces (type and depth,
    // Oct 4 2026): a raised control is a hair lighter than a card, never white.
    for (const token of ["--background", "--card", "--popover", "--elevated", "--bg-dark", "--bg-dark-2", "--bg-dark-3", "--surface-1", "--surface-2", "--raised", "--well", "--tray"]) {
      expect(hex("light", token), token).not.toBe("#FFFFFF");
    }
  });

  it("dark mode's surfaces are navy, not grey (AJ: 'in our dark mode, it just so gray')", () => {
    for (const token of ["--background", "--card", "--popover", "--muted", "--bg-dark", "--bg-dark-2", "--bg-dark-3", "--raised", "--well", "--tray"]) {
      const [r, , b] = rgb(hex("dark", token));
      expect(b - r, `${token} ${hex("dark", token)} has no blue cast`).toBeGreaterThanOrEqual(20);
    }
  });

  it("dark mode's ink is soft, never pure white", () => {
    expect(hex("dark", "--foreground")).not.toBe("#FFFFFF");
    expect(hex("dark", "--ink-d1")).not.toBe("#FFFFFF");
  });
});

/* ---------------------------------------------------------------------------
   THE FRAME: the header, the bottom bar and the iPad status bar, the logo's
   navy in both modes (AJ's answer 1A, Oct 4 2026).
   --------------------------------------------------------------------------- */

const FRAME_TOKENS = [
  "--chrome",
  "--chrome-ink",
  "--chrome-ink-2",
  "--chrome-field",
  "--chrome-line",
  "--chrome-here",
  "--chrome-go",
  "--chrome-go-fill",
];

describe("the frame", () => {
  it("is set once in :root and never redefined in .dark", () => {
    for (const token of FRAME_TOKENS) {
      expect(ROOT[token], `${token} is not set in :root`).toBeDefined();
      expect(DARK_OWN[token], `${token} is redefined in .dark`).toBeUndefined();
    }
  });

  const chrome = () => hex("light", "--chrome");
  const ON_THE_FRAME: [string, string][] = [
    ["the studio name", "--chrome-ink"],
    ["header icons, idle tab labels and search text", "--chrome-ink-2"],
    ["the tab you're on, and your avatar", "--chrome-here"],
    ["a running session's tab, Operations and Admins", "--chrome-go"],
  ];
  for (const [what, token] of ON_THE_FRAME) {
    it(`${what} (${token}) is at least 4.5:1 on it`, () => {
      expect(ratio(hex("light", token), chrome())).toBeGreaterThanOrEqual(4.5);
    });
  }

  it("the navy icon on the tab you're on is at least 4.5:1 (bg-chrome-here text-chrome)", () => {
    expect(ratio(chrome(), hex("light", "--chrome-here"))).toBeGreaterThanOrEqual(4.5);
  });

  // The rules the shell draws with these (AppHeader, AppContent's search and
  // avatar, AppBottomBar and NavButton), each pair as it is painted: a wash is
  // composited over the navy before it is measured.
  const wash = (token: string): [string, number] => {
    const m = ROOT[token]?.match(/^rgba\(\s*(\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\s*\)$/);
    if (!m) throw new Error(`${token} is "${ROOT[token]}", not an rgba() wash`);
    const h = "#" + [m[1], m[2], m[3]].map((c) => Number(c).toString(16).padStart(2, "0")).join("").toUpperCase();
    return [h, Number(m[4])];
  };
  const onWash = (token: string) => {
    const [h, a] = wash(token);
    return over(h, chrome(), a);
  };

  it("the navy icon on an orange tab's solid box is at least 4.5:1 (bg-chrome-go text-chrome)", () => {
    expect(ratio(chrome(), hex("light", "--chrome-go"))).toBeGreaterThanOrEqual(4.5);
  });

  it("the search's words and placeholder are at least 4.5:1 in its well (bg-chrome-field)", () => {
    for (const token of ["--chrome-ink", "--chrome-ink-2"]) {
      expect(ratio(hex("light", token), onWash("--chrome-field")), token).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("the focus ring (ring-chrome-here) is at least 3:1 on the frame and in the search well", () => {
    expect(ratio(hex("light", "--chrome-here"), chrome())).toBeGreaterThanOrEqual(3);
    expect(ratio(hex("light", "--chrome-here"), onWash("--chrome-field"))).toBeGreaterThanOrEqual(3);
  });

  it("a running session's tab, not the one you're on, is at least 3:1 on its faint box (bg-chrome-go-fill)", () => {
    expect(ratio(hex("light", "--chrome-go"), hex("light", "--chrome-go-fill"))).toBeGreaterThanOrEqual(3);
  });

  it("that faint box is an opaque warm colour, not a wash (an rgba orange over the navy cancels to grey)", () => {
    const box = hex("light", "--chrome-go-fill");
    const [r, , b] = [1, 3, 5].map((i) => parseInt(box.slice(i, i + 2), 16));
    expect(r, "red over blue: it keeps the orange's hue").toBeGreaterThan(b * 2);
  });

  it("the search well and the hairlines are washes of white, so they read the same on the navy in both themes", () => {
    for (const token of ["--chrome-field", "--chrome-line"]) {
      const [h, a] = wash(token);
      expect(h, token).toBe("#FFFFFF");
      expect(a, token).toBeLessThanOrEqual(0.12);
    }
  });

  it("paints the status band and the Home Screen app's ground", () => {
    expect(INDEX_CSS).toMatch(/\n\.status-band\s*\{[^}]*background:\s*var\(--chrome\);/);
    expect(INDEX_CSS).toMatch(/@media \(display-mode: standalone\)\s*\{[^}]*background-color:\s*var\(--chrome\);/);
  });
});

describe("every new token is a Tailwind utility", () => {
  // `@theme inline` maps --color-X to var(--X), which is what makes bg-chrome,
  // text-chrome-ink, text-cta-foreground and the rest exist as classes.
  const MAPPED = [...FRAME_TOKENS, "--cta-foreground", "--brand-tile-m", "--brand-tile-a", "--brand-tile-x", "--brand-tile-ink"];
  for (const token of MAPPED) {
    it(`${token} has --color-${token.slice(2)}`, () => {
      const name = token.slice(2);
      expect(new RegExp(`--color-${name}:\\s*var\\(--${name}\\);`).test(INDEX_CSS)).toBe(true);
    });
  }
});

describe("the parser itself", () => {
  it("reads a block's tokens and ignores what its comments mention", () => {
    expect(ROOT["--background"]).toMatch(/^#[0-9A-F]{6}$/);
    expect(over("#FF0000", "#FFFFFF", 0.1)).toBe("#FFE6E6");
    expect(ratio("#FFFFFF", "#000000")).toBeCloseTo(21, 5);
  });
});
