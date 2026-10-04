import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * ONE LOUD ORANGE, ONE CRITICAL CRIMSON, AND THE BLUE THAT SELECTS, OFF THE
 * HUB (the Navy Frame, phase 7, Oct 4 2026).
 *
 * Phases 3 and 4 gave the Hub its rule: the logo orange (#F36D21) is the one
 * loud action and carries NAVY words, because white on it is 2.99:1. Off the
 * Hub, a dozen buttons still put white words on an orange (the End Session
 * dialog's Finish, the paused Resume, Save scan, Log a conversation, Start a
 * new session, Track, Send to the team, Start Consult Workout, the profile's
 * Start session...), several faded or brightened on hover (an iPad keeps
 * hover after a tap, so the fill must be restated), the notes sheet and the
 * Pulse sheet used Tailwind orange-500, the Critical strip was a Tailwind
 * rose wash beside the app's own crimson, and the record still drew the old
 * sky blue and a teal. This file holds the move:
 *
 *   - no white (or theme) words on any solid orange, anywhere on a screen
 *     that follows the theme;
 *   - a solid logo-orange button has navy words and restates its fill on
 *     hover; the named buttons are on that pair;
 *   - the frame's unread badge is navy on the frame's orange, and the bell's
 *     small orange words are the deep orange that reads;
 *   - the End Session question is the brand fill's own words;
 *   - the profile header has no raw hex, and its Start is the Hub's Start;
 *   - the session sheets mark in the orange of marks (--eq-hero, 3:1) and
 *     put words only on the go pair;
 *   - no cyan focus ring is left, and the routine slot that is picked is the
 *     theme's blue with its own words;
 *   - Critical is the one crimson (--eq-alert) on its own fill;
 *   - the record has no sky or teal hex left.
 *
 * Every pair a rule leans on is measured on the real token files, in both
 * modes: index.css (uppercase) and equipment.tokens.css (lowercase).
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(join(HERE, rel), "utf8");

/* ---------------------------------------------------------------------------
   The tokens, read from both files
   --------------------------------------------------------------------------- */

function declarations(css: string, opener: string): Record<string, string> {
  const at = css.indexOf(opener);
  if (at < 0) throw new Error(`block not found: ${JSON.stringify(opener)}`);
  const open = css.indexOf("{", at);
  const body = css.slice(open + 1, css.indexOf("\n}", open)).replace(/\/\*[\s\S]*?\*\//g, "");
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}

const INDEX_CSS = read("index.css");
const EQ_CSS = read("features/equipment/equipment.tokens.css");
const CORE_ROOT = declarations(INDEX_CSS, "\n:root {");
const EQ_ROOT = declarations(EQ_CSS, "\n:root {");
const THEMES = {
  light: { ...CORE_ROOT, ...EQ_ROOT },
  dark: {
    ...CORE_ROOT,
    ...declarations(INDEX_CSS, "\n.dark {"),
    ...EQ_ROOT,
    ...declarations(EQ_CSS, '\n.dark,\n[data-theme="dark"] {'),
  },
} as const;
type Theme = keyof typeof THEMES;
const BOTH: Theme[] = ["light", "dark"];

/** A token's colour as lowercase #rrggbb, following var() chains. */
function colour(theme: Theme, token: string): string {
  let value: string | undefined = THEMES[theme][token];
  for (let hops = 0; value?.startsWith("var(") && hops < 5; hops++) {
    value = THEMES[theme][value.slice(4, -1).trim()];
  }
  if (!value || !/^#[0-9a-f]{6}$/i.test(value)) {
    throw new Error(`${token} in ${theme} is "${value}", not a #rrggbb`);
  }
  return value.toLowerCase();
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
/** `fg` at `alpha` over `bg`: what `bg-cta/15` paints on a card. */
function over(fg: string, bg: string, alpha: number): string {
  const [f, b] = [rgb(fg), rgb(bg)];
  return "#" + f.map((c, i) => Math.round(c * alpha + b[i] * (1 - alpha)).toString(16).padStart(2, "0")).join("");
}

/* ---------------------------------------------------------------------------
   The class strings of every screen that follows the theme
   --------------------------------------------------------------------------- */

/**
 * Left as they are on purpose, and not this round: the always-dark screens
 * (neutral-ramp.test.ts keeps the same list), the unmounted consultation
 * wizard (kept for the consultation redesign), the progress report (always
 * navy, white paper in print) and the front door (always dark, --fd-*).
 */
const NOT_THIS_ROUND = [
  "components/AccessRequestView.tsx",
  "components/ErrorBoundary.tsx",
  "features/admin/import/LegacyChartImporter.tsx",
  "components/ClientProgressReportView.tsx",
  "components/ConsultationWizard.tsx",
  "features/progress-report/",
  "features/front-door/",
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

/** The same string reader neutral-ramp.test.ts counts palette utilities with. */
const STRING_LITERAL = /(["'`])((?:[^"'`\\\n]|\\.){0,3000}?)\1/g;
const CLASS_LIKE = /^[A-Za-z0-9_\-:/[\].%#(),\s]+$/;

type ClassString = { file: string; line: number; body: string };

function classStrings(source: string, file: string): ClassString[] {
  const out: ClassString[] = [];
  for (const m of source.matchAll(STRING_LITERAL)) {
    if (!CLASS_LIKE.test(m[2])) continue;
    out.push({ file, line: source.slice(0, m.index).split("\n").length, body: m[2] });
  }
  return out;
}

const THEMED: ClassString[] = walk(HERE).flatMap((full) => {
  const rel = full.slice(HERE.length + 1).split("\\").join("/");
  if (NOT_THIS_ROUND.some((skip) => rel === skip || (skip.endsWith("/") && rel.startsWith(skip)))) return [];
  return classStrings(readFileSync(full, "utf8"), rel);
});

/** A SOLID orange fill at rest: no `/15` wash, no hover-only fill. */
const ORANGE_FILL =
  /(?:^|\s)bg-(?:cta|cta-strong|orange-\d{2,3}|\[#(?:f06c22|ef5302|f36d21|d45a06|b04000)\]|\(--eq-go\)|\(--eq-hero\)|\(--eq-hero-text\)|chrome-go)(?=\s|$)/i;
/** White words, or the theme's own ink (navy in light, near-white in dark). */
const WHITE_OR_INK_WORDS = /(?:^|\s)(?:[\w-]+:)*text-(?:white|foreground)(?=[\s/]|$)/;

const where = (s: ClassString) => `${s.file}:${s.line}  "${s.body}"`;

/* ---------------------------------------------------------------------------
   One loud orange
   --------------------------------------------------------------------------- */

describe("no white words on any orange", () => {
  it("found the class strings it reads (the reader still works)", () => {
    expect(THEMED.length).toBeGreaterThan(2000);
    expect(THEMED.some((s) => ORANGE_FILL.test(s.body))).toBe(true);
  });

  it("no class string on a themed screen puts white or theme words on a solid orange", () => {
    const offenders = THEMED.filter((s) => ORANGE_FILL.test(s.body) && WHITE_OR_INK_WORDS.test(s.body));
    expect(offenders.map(where)).toEqual([]);
  });

  it("the plan's grep finds nothing: bg-cta[^-/].*text-white in any .tsx", () => {
    const hits: string[] = [];
    for (const full of walk(HERE)) {
      readFileSync(full, "utf8")
        .split("\n")
        .forEach((line, i) => {
          if (/bg-cta[^-/].*text-white/.test(line)) hits.push(`${full.slice(HERE.length + 1)}:${i + 1}`);
        });
    }
    expect(hits).toEqual([]);
  });

  it("the words on the logo orange are navy and clear 4.5:1, in both modes", () => {
    for (const t of BOTH) {
      expect(ratio(colour(t, "--cta-foreground"), colour(t, "--cta")), t).toBeGreaterThanOrEqual(4.5);
      expect(ratio(colour(t, "--eq-go-on"), colour(t, "--eq-go")), t).toBeGreaterThanOrEqual(4.5);
      // And white on it is what this phase moved away from.
      expect(ratio("#ffffff", colour(t, "--cta")), t).toBeLessThan(4.5);
    }
  });
});

/** The pair a solid fill must carry: its words and its restated hover. */
const PAIRS = [
  { fill: "bg-cta", words: "text-cta-foreground", hover: "hover:bg-cta" },
  { fill: "bg-(--eq-go)", words: "text-(--eq-go-on)", hover: "hover:bg-(--eq-go)" },
] as const;

const has = (body: string, cls: string) =>
  new RegExp(`(?:^|\\s)${cls.replace(/[()[\]\\/.-]/g, (c) => "\\" + c)}(?=\\s|$)`).test(body);

/** A word colour a button could carry. */
const WORD_COLOUR = /(?:^|\s)text-(?:white|black|foreground|primary-foreground|cta-foreground|cta|ink-d\d|slate-\d+|\(--[\w-]+\))(?=[\s/]|$)/g;

describe("a solid logo-orange button has navy words and keeps its fill on hover", () => {
  for (const pair of PAIRS) {
    it(`every ${pair.fill} string with words says them in ${pair.words}`, () => {
      const bad = THEMED.filter((s) => has(s.body, pair.fill)).filter((s) => {
        const words = (s.body.match(WORD_COLOUR) ?? []).map((w) => w.trim());
        return words.some((w) => w !== pair.words);
      });
      expect(bad.map(where)).toEqual([]);
    });

    it(`every ${pair.fill} string with a hover restates ${pair.hover}, and never fades or brightens`, () => {
      const bad = THEMED.filter((s) => has(s.body, pair.fill) && /(?:^|\s)hover:/.test(s.body)).filter(
        (s) =>
          !has(s.body, pair.hover) ||
          /(?:^|\s)hover:(?:opacity|brightness|bg-cta-strong|bg-\[)/.test(s.body),
      );
      expect(bad.map(where)).toEqual([]);
    });
  }

  it.each([
    ["Save scan (InBody)", "features/inbody/InBodyScanDialog.tsx", 1],
    ["Save conversation", "features/renewals/LogConversationDialog.tsx", 1],
    ["Log a conversation (the renewal card)", "features/renewals/RenewalCardDialog.tsx", 1],
    ["Start a new session (a stale session)", "features/tracker/StaleSessionDialog.tsx", 1],
    ["Track (the Kaizen toggle)", "features/trainer-profile/KaizenToggle.tsx", 1],
    ["Yes, reset it (the demo card)", "features/demo-mode/SetUpDemoCard.tsx", 1],
    ["Confirm Switch (routine B)", "components/ClientProfileView.tsx", 1],
    ["Save preset and Apply (the routine drawer)", "components/EditRoutineDrawer.tsx", 2],
    ["Finish session (the End Session dialog)", "components/WorkoutTrackerView.tsx", 1],
    ["Resume (the paused session timer)", "components/ActiveSessionTimer.tsx", 1],
    ["Send to the team (feedback)", "features/feedback/FeedbackDrawer.tsx", 1],
    ["Start Consult Workout", "components/ConsultationSetupWizard.tsx", 1],
    ["Create Temporary Profile (add a client)", "components/CreateClientModal.tsx", 1],
    ["Save Trainer Profile", "features/trainer-profile/EditTrainerModal.tsx", 1],
  ])("%s is the logo orange with navy words, restated on hover", (_name, file, count) => {
    const strings = classStrings(read(file), file).filter(
      (s) => has(s.body, "bg-cta") && has(s.body, "text-cta-foreground") && has(s.body, "hover:bg-cta"),
    );
    expect(strings.length).toBeGreaterThanOrEqual(count);
  });

  it("an orange glow is the token's own colour, not the retired #F06C22 rgba", () => {
    for (const file of [
      "components/ActiveSessionTimer.tsx",
      "features/trainer-profile/EditTrainerModal.tsx",
      "features/client-profile/ProfileHeader.tsx",
    ]) {
      expect(read(file), file).not.toMatch(/rgba\((?:240,\s*108,\s*34|239,\s*83,\s*2)/);
    }
    // The Start Consult Workout glow (the wizard's selected chips are AJ's audit).
    const wizard = read("components/ConsultationSetupWizard.tsx");
    expect(wizard).toContain("shadow-[0_10px_30px_var(--cta)] shadow-cta/30");
  });
});

/* ---------------------------------------------------------------------------
   The bell, on the navy frame
   --------------------------------------------------------------------------- */

describe("the notification bell", () => {
  const bell = read("features/notifications/NotificationBell.tsx");

  it("its unread badge is navy on the frame's orange", () => {
    expect(bell).toMatch(/rounded-full bg-chrome-go text-chrome text-\[9px\]/);
    for (const t of BOTH) {
      expect(ratio(colour(t, "--chrome"), colour(t, "--chrome-go")), t).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("its small orange words are the deep orange that reads, never the logo orange", () => {
    expect(bell).not.toMatch(/(?:^|[\s"'`])text-cta(?=[\s"'`]|$)/m);
    expect(bell.match(/text-\(--eq-hero-text\)/g) ?? []).toHaveLength(3);
    for (const t of BOTH) {
      // The sheet is a card; the New chip is cta/15 on it; the Learning door
      // is cta/10 inside an unread announcement's cta/5; the icon sits on muted.
      const card = colour(t, "--card");
      const cta = colour(t, "--cta");
      const word = colour(t, "--eq-hero-text");
      expect(ratio(word, card), `${t}: on the sheet`).toBeGreaterThanOrEqual(4.5);
      expect(ratio(word, over(cta, card, 0.15)), `${t}: the New chip`).toBeGreaterThanOrEqual(4.5);
      expect(ratio(word, over(cta, over(cta, card, 0.05), 0.1)), `${t}: the Learning door`).toBeGreaterThanOrEqual(4.5);
      expect(ratio(word, colour(t, "--muted")), `${t}: a notice's icon`).toBeGreaterThanOrEqual(3);
    }
  });
});

/* ---------------------------------------------------------------------------
   The End Session question
   --------------------------------------------------------------------------- */

describe("the End Session question", () => {
  const tracker = read("components/WorkoutTrackerView.tsx");

  it("says End Session? in the brand fill's own words, not the page ink", () => {
    expect(tracker).toContain('<div className="bg-primary p-8 text-primary-foreground space-y-3">');
    expect(tracker).toContain('<AlertCircle className="w-6 h-6 text-primary-foreground" />');
    expect(tracker).not.toMatch(/bg-primary p-8 text-foreground/);
    for (const t of BOTH) {
      expect(ratio(colour(t, "--primary-foreground"), colour(t, "--primary")), t).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("marks a machine's outcome as picked in the theme's blue, never a white chip in dark", () => {
    expect(tracker).toContain('? "bg-primary text-primary-foreground border-primary"');
    expect(tracker).not.toMatch(/dark:bg-white(?![\w/-])/);
  });
});

/* ---------------------------------------------------------------------------
   The profile header
   --------------------------------------------------------------------------- */

describe("the profile header", () => {
  const header = read("features/client-profile/ProfileHeader.tsx");

  it("has no raw hex: its orange marks, its count and the Kaizen toggle are tokens", () => {
    expect(header).not.toMatch(/#[0-9a-f]{6}\b/i);
    expect(header.match(/bg-\(--eq-hero\)/g) ?? []).toHaveLength(2);
    expect(header).toMatch(/className="text-\(--eq-hero-text\) tabular-nums" data-testid="sessions-completed"/);
    expect(header).toContain(
      'kaizen.isOn && "text-(--eq-live-text) bg-(--eq-live-fill) hover:text-(--eq-live-text) hover:bg-(--eq-live-fill) dark:hover:bg-(--eq-live-fill)"',
    );
    for (const t of BOTH) {
      expect(ratio(colour(t, "--eq-hero-text"), colour(t, "--card")), `${t}: the count`).toBeGreaterThanOrEqual(4.5);
      expect(ratio(colour(t, "--eq-live-text"), colour(t, "--eq-live-fill")), `${t}: Tracking`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("its Start session is the Hub's Start: the logo orange, navy words, the fill kept on hover", () => {
    const at = header.indexOf('"cp-head__start ');
    expect(at).toBeGreaterThan(-1);
    const start = header.slice(at, header.indexOf(")}", at));
    expect(start).toMatch(/(?:^|\s)text-\(--eq-go-on\)(?=[\s"])/);
    expect(start).toMatch(/"bg-\(--eq-go\) hover:bg-\(--eq-go\) /);
    expect(start).toMatch(/focus-visible:ring-\(--eq-focus-ring\)/);
    expect(start).not.toMatch(/text-white|brightness|linear-gradient/);
    // "Booked today" under it is the same navy.
    expect(header).toMatch(/text-\(--eq-go-on\) mt-1">Booked today/);
    expect(header).not.toMatch(/text-white\/85/);
  });
});

/* ---------------------------------------------------------------------------
   The session sheets
   --------------------------------------------------------------------------- */

describe("the session sheets", () => {
  const sidebar = read("components/journal/SessionJournalSidebar.tsx");
  const tracker = read("components/WorkoutTrackerView.tsx");

  it("mark in the orange of marks and put words only on the go pair", () => {
    for (const [name, source] of [["notes sheet", sidebar], ["the session", tracker]] as const) {
      expect(source, name).not.toMatch(/(?:bg|text|ring|border|shadow)-orange-\d/);
    }
    expect(sidebar.match(/className="h-5 w-5 text-\(--eq-hero\)"/g) ?? []).toHaveLength(3);
    expect(tracker).toContain('<HeartPulse className="h-5 w-5 text-(--eq-hero)" /> Pulse');
    expect(sidebar).toContain('? "bg-(--eq-go) hover:bg-(--eq-go) text-(--eq-go-on)"');
    expect(tracker).toContain("focus-visible:ring-(--eq-hero) focus-visible:border-(--eq-hero)");
    // The introductory-session banner: words and icons in the go pair.
    const banner = tracker.slice(tracker.indexOf("{isIntroSession && ("), tracker.indexOf("NEW CLIENT INTRODUCTORY SESSION"));
    expect(banner).toMatch(/className="bg-\(--eq-go\) /);
    expect(banner.match(/text-\(--eq-go-on\)/g) ?? []).toHaveLength(2);
    expect(banner).not.toMatch(/text-foreground/);
  });

  it("their orange marks clear 3:1 on the sheet (the page ground), in both modes", () => {
    for (const t of BOTH) {
      expect(ratio(colour(t, "--eq-hero"), colour(t, "--background")), t).toBeGreaterThanOrEqual(3);
    }
  });
});

/* ---------------------------------------------------------------------------
   The blue that selects (the --cyan sites)
   --------------------------------------------------------------------------- */

describe("the blue that selects", () => {
  it("no focus ring is cyan any more: a ring is the theme's ring", () => {
    const rings = THEMED.filter((s) => /(?:^|[\s:])ring-cyan(?![\w-])/.test(s.body));
    expect(rings.map(where)).toEqual([]);
    expect(read("components/BodyStateTracker.tsx").match(/ring-ring/g)?.length ?? 0).toBeGreaterThanOrEqual(5);
  });

  it("the routine slot that is picked is the theme's blue with its own words", () => {
    const drawer = read("components/EditRoutineDrawer.tsx");
    expect(drawer).toContain('? "bg-primary text-primary-foreground border-transparent shadow-sm shadow-primary/20"');
    expect(drawer).not.toMatch(/bg-cyan text-white/);
    expect(THEMED.filter((s) => has(s.body, "bg-cyan") && /text-white/.test(s.body)).map(where)).toEqual([]);
  });
});

/* ---------------------------------------------------------------------------
   One Critical crimson
   --------------------------------------------------------------------------- */

describe("Critical is the one crimson", () => {
  const strip = read("components/journal/CriticalStrip.tsx");
  const flags = read("features/journey-grid/SessionFlagsSheet.tsx");

  it("the Critical strip and the flags sheet draw --eq-alert, never a Tailwind rose or red", () => {
    for (const [name, source] of [["CriticalStrip", strip], ["SessionFlagsSheet", flags]] as const) {
      expect(source, name).not.toMatch(/(?:rose|red)-\d{2,3}/);
    }
    expect(strip).toContain("border-(--eq-alert)/30 bg-(--eq-alert-fill)");
    expect(strip.match(/text-\(--eq-alert\)/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    expect(flags).toContain('<ShieldAlert className="h-5 w-5 text-(--eq-alert)" />');
  });

  it("its words read on its fill, and its marks on the sheet, in both modes", () => {
    for (const t of BOTH) {
      const alert = colour(t, "--eq-alert");
      const fill = colour(t, "--eq-alert-fill");
      expect(ratio(alert, fill), `${t}: the title`).toBeGreaterThanOrEqual(4.5);
      expect(ratio(colour(t, "--eq-ink-muted"), fill), `${t}: the count line`).toBeGreaterThanOrEqual(4.5);
      expect(ratio(alert, over(alert, fill, 0.15)), `${t}: the triangle in its chip`).toBeGreaterThanOrEqual(3);
      expect(ratio(alert, colour(t, "--background")), `${t}: the shield on the sheet`).toBeGreaterThanOrEqual(3);
    }
  });

  it("the crimson is still exactly the recorded crimson", () => {
    expect(colour("light", "--eq-alert")).toBe("#c0203f");
    expect(colour("dark", "--eq-alert")).toBe("#f2718c");
  });
});

/* ---------------------------------------------------------------------------
   The record: no sky, no teal
   --------------------------------------------------------------------------- */

describe("the client record has no sky or teal left", () => {
  const record = read("components/ClientProfileView.tsx");

  it("draws the brand blue where it drew sky and teal", () => {
    expect(record).not.toMatch(/#(?:5BC0BE|38BDF8|0284c7|8cc4f2)\b/i);
    expect(record).not.toMatch(/(?:^|[\s"'`:])(?:bg|text|border|ring)-sky-\d/);
    expect(record).toContain("bg-(--eq-live-fill) border-2 border-(--eq-live)/30 rounded-3xl p-4 flex items-center gap-4 text-(--eq-live-text)");
    expect(record).toContain('? "border-primary bg-primary/10 text-primary"');
    expect(record).toMatch(/bg-primary text-primary-foreground hover:bg-primary rounded-full/);
  });

  it("the setup banner and the picked source read in both modes", () => {
    for (const t of BOTH) {
      const primary = colour(t, "--primary");
      expect(ratio(colour(t, "--eq-live-text"), colour(t, "--eq-live-fill")), `${t}: the banner`).toBeGreaterThanOrEqual(4.5);
      expect(ratio(primary, over(primary, colour(t, "--card"), 0.1)), `${t}: the picked source`).toBeGreaterThanOrEqual(4.5);
      expect(ratio(primary, colour(t, "--card")), `${t}: the dialog line`).toBeGreaterThanOrEqual(4.5);
    }
  });
});
