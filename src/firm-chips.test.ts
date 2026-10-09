import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * CHIPS AND TOGGLES TAKE THE FIRM EDGE (type and depth, AJ's 3A, Oct 5 2026:
 * "1a 2a 3a").
 *
 * The round left about thirty chips and toggles on the faint hairline, the
 * 1.3:1 --X-border, by design (its "For AJ" item 9: "Take the 3:1 edge
 * (every bar heavier), or stay light?"). AJ took the edge. A control a
 * trainer taps now draws the firm 3:1 control edge buttons have (the
 * palette's --X-border-strong, the codex's --cx-line-2, and the app's
 * --input on a check row in a dialog), and keeps its fill; a picked chip
 * keeps its own look (the blue, or its tone's colour, on its tint).
 *
 *   1. Every chip, segment, segmented group, choice tile and toggle row on
 *      the list draws the firm edge, measured at 3:1 or more against its
 *      own fill, light and dark.
 *   2. A picked one keeps its own edge colour, never the neutral one.
 *   3. The sweep: every stylesheet rule with `cursor: pointer` whose edge is
 *      a family's hairline is on the exception list below with its reason,
 *      exact both ways. Informational chips (a span, a tag, a stat) keep
 *      the soft edge and no pointer.
 *   4. A hover that changes a chip's fill or edge is a pointer's only.
 *   5. The two check rows drawn in class lists take the control edge.
 *
 * Read from source, comments removed. If one of these fails, the fix is the
 * stylesheet, not the test.
 */

const SRC = dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(join(SRC, rel), "utf8").replace(/\r\n/g, "\n");
const css = (rel: string) => read(rel).replace(/\/\*[\s\S]*?\*\//g, "");

type Rule = { selectors: string[]; body: string; at: string[]; pos: number };

function parse(text: string): Rule[] {
  const out: Rule[] = [];
  const stack: { prelude: string; start: number; nested: boolean }[] = [];
  let last = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "{") {
      const prelude = text.slice(last, i).split(";").pop()!.trim();
      if (stack.length) stack[stack.length - 1].nested = true;
      stack.push({ prelude, start: i + 1, nested: false });
      last = i + 1;
    } else if (ch === "}") {
      const top = stack.pop();
      if (top && !top.nested && !top.prelude.startsWith("@") && !/^(?:from|to|\d+%)$/.test(top.prelude)) {
        out.push({
          selectors: top.prelude.split(",").map((s) => s.trim().replace(/\s+/g, " ")),
          body: text.slice(top.start, i),
          at: stack.map((s) => s.prelude.replace(/\s+/g, " ")),
          pos: top.start,
        });
      }
      last = i + 1;
    }
  }
  return out;
}

const cache = new Map<string, Rule[]>();
const rulesOf = (file: string) => {
  if (!cache.has(file)) cache.set(file, parse(css(file)));
  return cache.get(file)!;
};

/** The rules outside any @media that name one of `selectors` exactly, merged in source order. */
function merged(file: string, ...selectors: string[]): Record<string, string> {
  const found = rulesOf(file).filter((r) => r.at.length === 0 && r.selectors.some((s) => selectors.includes(s)));
  expect(found.length, `${file}: no rule for ${selectors.join(" / ")}`).toBeGreaterThan(0);
  const out: Record<string, string> = {};
  for (const r of found.sort((a, b) => a.pos - b.pos)) {
    for (const m of r.body.matchAll(/(?:^|;)\s*([\w-]+)\s*:\s*([^;]+)/g)) out[m[1]] = m[2].trim().replace(/\s+/g, " ");
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* The palettes, to measure each edge                                  */
/* ------------------------------------------------------------------ */

function tokenBlock(text: string, at: string): Record<string, string> {
  const i = text.indexOf(at);
  if (i < 0) throw new Error(`token block not found: ${at.trim()}`);
  const open = text.indexOf("{", i);
  let depth = 0;
  let j = open;
  for (; j < text.length; j++) {
    if (text[j] === "{") depth++;
    else if (text[j] === "}" && --depth === 0) break;
  }
  const out: Record<string, string> = {};
  for (const m of text.slice(open + 1, j).matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}

const PALETTES: [string, string, string | null][] = [
  ["index.css", "\n:root {", "\n.dark {"],
  ["features/equipment/equipment.tokens.css", "\n:root {", '[data-theme="dark"] {'],
  ["features/admin/admin.tokens.css", "\n:root {", '[data-theme="dark"] {'],
  ["features/studio-tasks/studio-tasks.tokens.css", "\n:root {", '[data-theme="dark"] {'],
  ["features/wiki/wiki.tokens.css", "\n:root {", '[data-theme="dark"] {'],
  ["features/calendar/calendar.tokens.css", "\n:root {", '[data-theme="dark"] {'],
  ["features/subjective-report/subjective-report.tokens.css", "\n:root {", '[data-theme="dark"] {'],
  ["features/ford/ford.tokens.css", "\n:root {", '[data-theme="dark"] {'],
  ["features/trainer-profile/trainer-profile.tokens.css", "\n:root {", '[data-theme="dark"] {'],
  ["features/client-codex/codex.tokens.css", ".cx-kit {", null],
];
const LIGHT: Record<string, string> = {};
const DARK_OWN: Record<string, string> = {};
for (const [file, l, d] of PALETTES) {
  const text = css(file);
  Object.assign(LIGHT, tokenBlock(text, l));
  if (d) Object.assign(DARK_OWN, tokenBlock(text, d));
}
const MODES = { light: LIGHT, dark: { ...LIGHT, ...DARK_OWN } } as const;

function resolve(map: Record<string, string>, value: string, depth = 0): string {
  if (depth > 20) throw new Error(`var() loop at ${value}`);
  const m = value.trim().match(/^var\((--[\w-]+)(?:,\s*([\s\S]+))?\)$/);
  if (!m) return value.trim();
  if (map[m[1]] !== undefined) return resolve(map, map[m[1]], depth + 1);
  if (m[2]) return resolve(map, m[2], depth + 1);
  throw new Error(`${m[1]} is not declared`);
}

const channel = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
function luminance(hex: string): number {
  expect(hex, "a solid #rrggbb").toMatch(/^#[0-9a-f]{6}$/i);
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * channel(((n >> 16) & 255) / 255) + 0.7152 * channel(((n >> 8) & 255) / 255) + 0.0722 * channel((n & 255) / 255);
}
function ratio(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/* ------------------------------------------------------------------ */
/* 1. The chips and toggles                                            */
/* ------------------------------------------------------------------ */

/**
 * [stylesheet, selector, the edge it draws, the surface to measure it on
 * when that is not its own fill (none painted, or the page tone set into a
 * card), the picked state's selector or null].
 */
type Chip = [string, string, string, string | null, string | null];

const CHIPS: Chip[] = [
  // Operations and the Admins dashboard.
  ["features/admin/overview/overview.css", ".adm-ch__day", "var(--adm-border-strong)", null, ".adm-ch__day--on"],
  ["features/admin/overview/overview.css", ".adm-ov__chip", "var(--adm-border-strong)", null, null], // not drawn today; named in the round's list
  ["features/admin/shell/ops.css", ".ops-namechip", "var(--adm-border-strong)", null, null],
  ["features/admin/shell/ops.css", ".ops-stop", "var(--adm-border-strong)", null, ".ops-stop--on"],
  ["features/admin/shell/ops.css", ".ops-huddle__i", "var(--adm-border-strong)", null, '.ops-huddle__i[aria-pressed="true"]'],
  ["features/admins/admins.css", ".hq-sheet__check", "var(--adm-border-strong)", "var(--popover)", null],
  // Notes, the Dial and Loudness, the phone, Setup, the Calendar, the flags, the Life section.
  ["features/client-notes/notes.css", ".nc-chip", "var(--eq-border-strong)", null, '.nc-chip[aria-pressed="true"]'],
  ["features/client-notes/notes.css", ".nq-cat", "var(--eq-border-strong)", null, '.nq-cat[aria-pressed="true"]'],
  ["features/client-notes/notes-page.css", ".nt-from", "var(--eq-border-strong)", null, null],
  ["features/rating/rating.css", ".rt__seg", "var(--eq-border-strong)", null, '.rt__seg[aria-checked="true"][data-tone="live"]'],
  ["features/client-life/client-life.css", ".clf-switch", "var(--eq-border-strong)", null, ".clf-switch--on"],
  ["features/phone/phone.css", ".ph-chip", "var(--eq-border-strong)", null, ".ph-chip.is-on"],
  ["features/phone/phone.css", ".ph-mark", "var(--eq-border-strong)", null, null],
  ["features/machine-fit/ui/machine-fit.css", ".fit-filter", "var(--eq-border-strong)", null, null],
  ["features/calendar/calendar.css", ".cal-seg", "var(--cal-border-strong)", null, null],
  ["features/clinical-flags/clinical-flags.css", ".cfl-toggle", "var(--eq-border-strong)", null, ".cfl-toggle--on"],
  // The codex: a SMART toggle's fill is the page tone set into a card, so its
  // edge is measured against the card it stands on (3.42:1; 2.94:1 against
  // the page tone inside it, which the edge separates from the card).
  ["features/goals/goals.css", ".gf-smart-toggle", "var(--cx-line-2)", "var(--cx-surface)", '.gf-smart-toggle[aria-pressed="true"]'],
  // FORD.
  ["features/ford/ford.css", ".ford-letter", "var(--ford-border-strong)", null, null],
  // Relay.
  ["features/relay/board/ask.css", ".rak-tile", "var(--st-border-strong)", null, '.rak-tile[aria-pressed="true"]'],
  ["features/relay/board/board.css", ".rbd-part", "var(--st-border-strong)", null, null],
  ["features/relay/kit.css", ".rk-toggle", "var(--st-border-strong)", null, '.rk-toggle[aria-checked="true"]'],
  ["features/relay/kit.css", ".rk-seg", "var(--st-border-strong)", null, null],
  ["features/relay/kit.css", ".gb__tile", "var(--st-border-strong)", null, null], // not drawn today
  ["features/relay/notes/notes.css", ".jn-type", "var(--st-border-strong)", null, null],
  ["features/relay/notes/notes.css", ".ne__handoff", "var(--st-border-strong)", null, null],
  ["features/relay/notes/notes.css", ".ne__kind", "var(--st-border-strong)", null, '.ne__kind[aria-pressed="true"]'],
  ["features/relay/notes/notes.css", ".ne__pin", "var(--st-border-strong)", null, '.ne__pin[aria-pressed="true"]'],
  ["features/relay/notes/notes.css", ".pn__view", "var(--st-border-strong)", null, '.pn__view[aria-pressed="true"]'],
  ["features/studio-tasks/studio-tasks.css", ".stq__kind", "var(--st-border-strong)", null, '.stq__kind[aria-pressed="true"]'],
  ["features/studio-tasks/studio-tasks.css", ".stq__react", "var(--st-border-strong)", null, '.stq__react[aria-pressed="true"]'],
  // The Pulse.
  ["features/subjective-report/subjective-report.css", ".pq__tile", "var(--sr-border-strong)", null, null],
  ["features/subjective-report/subjective-report.css", ".sr-body__side", "var(--sr-border-strong)", null, ".sr-body__side--on"],
  ["features/subjective-report/subjective-report.css", ".sr-chip", "var(--sr-border-strong)", null, ".sr-chip--on"],
  ["features/subjective-report/subjective-report.css", ".sr-seg", "var(--sr-border-strong)", null, null],
  // Learning.
  ["features/wiki/wiki.css", ".wk__chip", "var(--wk-border-strong)", null, null],
  // The machine menu: the reason, value and filing chips, the "1 thing to
  // know first" pill and the About switch. None says cursor: pointer, so the
  // sweep below can't see them; this list holds them.
  ["features/machine-menu/machine-menu.css", ".mm-choice", "var(--eq-border-strong)", null, '.mm-choice[aria-pressed="true"]'],
  ["features/machine-menu/machine-menu.css", ".mm-head__pill", "var(--eq-border-strong)", null, null],
  ["features/machine-menu/machine-menu.css", ".mm-seg", "var(--eq-border-strong)", null, null],
  // Starting routines (the first-session design round, Oct 8 2026): the
  // template editor's Day one picks (the picked one the blue on its tint)
  // and the words that suggest a routine, each a chip a tap takes out.
  ["features/routine-plan/ui/starting-routines.css", ".srt-pick", "var(--adm-border-strong)", null, '.srt-pick[aria-pressed="true"]'],
  ["features/routine-plan/ui/starting-routines.css", ".srt-word", "var(--adm-border-strong)", null, null],
  // A "choice" studio setting's segments (the first-session round, item 8:
  // how a new client starts, A alone or A and B together), on both
  // editors: the picked one the blue on its tint.
  ["features/studio-settings/choice-segments.css", ".sts-seg__opt", "var(--adm-border-strong)", null, '.sts-seg__opt[aria-pressed="true"]'],
];

/** The colour a rule's edge is drawn in: the shorthand's var(), or border-color. */
function edgeOf(rule: Record<string, string>): string | undefined {
  const from = rule.border?.match(/var\(--[\w-]+(?:,[^)]*)?\)/)?.[0];
  return rule["border-color"] ?? from;
}

/** The fill a rule paints: the last layer of its background (the padding-box fill under a band). */
function fillOf(rule: Record<string, string>): string | undefined {
  const bg = rule["background-color"] ?? rule.background;
  if (!bg) return undefined;
  const vars = [...bg.matchAll(/var\(--[\w-]+(?:,\s*[^)]*)?\)/g)].map((m) => m[0]);
  return vars.at(-1);
}

describe("AJ's 3A: a chip or a toggle a trainer taps draws the firm 3:1 edge", () => {
  it.each(CHIPS.map((c) => [c[1], c] as const))("%s draws the firm edge, 3:1 or more on its own fill in both modes", (_sel, [file, sel, edge, ground]) => {
    const own = merged(file, sel);
    expect(own.border, `${sel}: a solid 1px or 1.5px edge`).toMatch(/^1(?:\.5)?px solid var\(/);
    expect(edgeOf(own), `${sel}: the firm edge`).toBe(edge);
    const fill = ground ?? fillOf(own);
    expect(fill, `${sel}: a fill to measure on`).toBeTruthy();
    for (const [mode, map] of Object.entries(MODES)) {
      expect(ratio(resolve(map, edge), resolve(map, fill!)), `${sel} ${mode}: ${edge} on ${fill}`).toBeGreaterThanOrEqual(3);
    }
  });

  it.each(CHIPS.filter((c) => c[4]).map((c) => [c[4]!, c] as const))("%s keeps its own picked edge", (picked, [file]) => {
    const own = merged(file, picked);
    const edge = own["border-color"] ?? edgeOf(own);
    expect(edge, `${picked} says its own edge`).toBeDefined();
    expect(edge).not.toMatch(/-border-strong\)|-border\)|-line\)|control-edge/);
  });

  it("the clinical flag toggle's band paints the left only where there is a tone, so a flag with none shows the firm edge all round", () => {
    const file = "features/clinical-flags/clinical-flags.css";
    const own = merged(file, ".cfl-toggle");
    expect(own["--cfl-band"]).toBe("transparent");
    expect(own["border-left-color"]).toBeUndefined();
    const toned = merged(file, '.cfl-toggle[data-tone="alert"]', '.cfl-toggle[data-tone="caution"]', ".cfl-toggle--on");
    expect(toned["border-left-color"]).toBe("var(--cfl-band)");
  });

  it("a Pulse body region is the row its side buttons sit in: soft edge, no pointer", () => {
    const region = merged("features/subjective-report/subjective-report.css", ".sr-body__region");
    expect(region.border).toBe("1.5px solid var(--sr-border)");
    expect(region.cursor).toBeUndefined();
  });

  /**
   * The Kaizen roster's "Why are you tracking them?" (the review of AJ's 3A):
   * the informational .tp-chip as a button, on the hairline and an inline
   * 34px. A chip a trainer taps is .tp-chip--pick: the firm edge, 40px, a
   * pointer; the picked one keeps the Kaizen tint and its edge is the Kaizen
   * mark's colour. The base chip stays informational (section 3).
   */
  it("the Kaizen roster's reason chips are picks: the firm edge on their fill, 40px, the picked one in the Kaizen colour", () => {
    const file = "features/trainer-profile/trainer-profile.css";
    const pick = merged(file, ".tp-chip", ".tp-chip--pick");
    expect(edgeOf(pick)).toBe("var(--tp-border-strong)");
    expect(parseFloat(pick["min-height"])).toBeGreaterThanOrEqual(40);
    expect(pick.height).toBe("auto");
    expect(pick.cursor).toBe("pointer");
    for (const [mode, map] of Object.entries(MODES)) {
      expect(ratio(resolve(map, "var(--tp-border-strong)"), resolve(map, fillOf(pick)!)), `${mode}: the edge on its fill`).toBeGreaterThanOrEqual(3);
      expect(ratio(resolve(map, "var(--tp-kaizen)"), resolve(map, "var(--tp-kaizen-fill)")), `${mode}: the picked edge`).toBeGreaterThanOrEqual(3);
    }
    // Two classes, so it outranks the Kaizen tone's transparent edge wherever it sits.
    expect(merged(file, ".tp-chip--pick.tp-chip--kaizen")["border-color"]).toBe("var(--tp-kaizen)");
    const dialog = read("features/trainer-profile/AddToRosterDialog.tsx");
    expect(dialog).toMatch(/"tp-chip tp-chip--pick tp-chip--kaizen" : "tp-chip tp-chip--pick"/);
    expect(dialog).toMatch(/aria-pressed=\{r === reason\}/);
    expect(dialog).not.toMatch(/height:\s*34/);
  });
});

/* ------------------------------------------------------------------ */
/* 3. The sweep                                                        */
/* ------------------------------------------------------------------ */

/** Pointer targets that keep a hairline edge on purpose: none of them is a chip or a toggle. */
const HAIRLINE_ON_PURPOSE: Record<string, string> = {
  "features/front-door/front-door.css .fd-btn": "the front door: always dark, its own palette and voice, a brand moment",
  "features/front-door/front-door.css .fd-chip": "the front door: always dark, its own palette and voice, a brand moment",
  "features/front-door/front-door.css .fd-pin": "the front door: always dark, its own palette and voice, a brand moment",
  "features/front-door/front-door.css .fd-row": "the front door: always dark, its own palette and voice, a brand moment",
  "features/front-door/front-door.css .fd-tile": "the front door: always dark, its own palette and voice, a brand moment",
  "features/briefing/briefing.css .br-routine__line": "a row that opens the routine (AJ: \"One line, tap to edit\"), not a chip",
  "features/calendar/calendar.css .cal-lane__item": "a booking on the Calendar's day, a card like the Hub's, not a chip",
  "features/machine-fit/ui/machine-fit.css .fit-row__revert": "a quiet text button with no fill: ghosts never lift (the sweep)",
};

function cssFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...cssFiles(path));
    else if (name.endsWith(".css")) out.push(path);
  }
  return out;
}

const HAIRLINE = /border(?:-color)?\s*:\s*[^;]*var\(--[\w]+-(?:border|line)\)/;

describe("the sweep: nothing a trainer taps keeps the hairline but on purpose", () => {
  it("every pointer target whose own edge is a family's hairline is on the list, and the list is exact", () => {
    const found = new Set<string>();
    for (const path of cssFiles(SRC)) {
      const file = relative(SRC, path).replace(/\\/g, "/");
      const rules = rulesOf(file);
      // A pointer and a hairline on the same element, by its base class (state and pseudo stripped).
      const pointer = new Set<string>();
      const hair = new Set<string>();
      for (const r of rules) {
        for (const s of r.selectors) {
          const last = s.split(/[\s>+~]+/).pop()!;
          const base = last.replace(/::?[\w-]+(\([^)]*\))?/g, "").replace(/\[[^\]]*\]/g, "");
          if (!base.startsWith(".")) continue;
          if (/cursor\s*:\s*pointer/.test(r.body)) pointer.add(base);
          if (s === base && HAIRLINE.test(r.body)) hair.add(base);
        }
      }
      for (const b of hair) if (pointer.has(b)) found.add(`${file} ${b}`);
    }
    expect([...found].sort()).toEqual(Object.keys(HAIRLINE_ON_PURPOSE).sort());
  });

  it.each([
    ["features/trainer-profile/trainer-profile.css", ".tp-chip"],
    ["features/client-notes/notes-page.css", ".nt-chip"],
    ["features/relay/kit.css", ".rk-tag"],
    ["features/client-history/client-history.css", ".hist-tag"],
    ["features/client-profile/profile-nav.css", ".ptab-strip__chip"],
    // A dial's letter beside its name: a tag, not another key beside the ±.
    ["features/machine-menu/machine-menu.css", ".mm-letter"],
  ])("an informational chip keeps the soft edge and no pointer: %s %s", (file, sel) => {
    const own = merged(file, sel);
    expect(edgeOf(own) ?? "", sel).toMatch(/-border\)|-line\)/);
    expect(own.cursor).toBeUndefined();
  });
});

/* ------------------------------------------------------------------ */
/* 4. Hover is a pointer's only                                        */
/* ------------------------------------------------------------------ */

describe("a hover that changes a chip's fill or edge is a pointer's only", () => {
  it.each(CHIPS.map((c) => [c[1], c] as const))("%s", (_sel, [file, sel]) => {
    const own = new RegExp(`^${sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w-])`);
    const hovers = rulesOf(file).filter((r) => r.selectors.some((s) => own.test(s) && s.includes(":hover")) && /background|border/.test(r.body));
    for (const r of hovers) {
      if (sel === ".gb__tile") continue; // not drawn today; its hover only firms an edge it already has
      expect(r.at.some((a) => /hover:\s*hover/.test(a)), r.selectors.join(", ")).toBe(true);
    }
  });
});

/* ------------------------------------------------------------------ */
/* 5. The check rows in class lists                                    */
/* ------------------------------------------------------------------ */

describe("the two check rows drawn in class lists take the control edge", () => {
  it.each([
    ["features/inbody/InBodyScanDialog.tsx", /<label className="[^"]*\bborder border-input\b[^"]*">\s*<input\s+type="checkbox"/],
    ["features/studio-tasks/TaskNoteDialog.tsx", /<label className="[^"]*\bborder border-input\b[^"]*">\s*<input\s+type="checkbox"/],
  ])("%s", (file, pattern) => {
    const text = read(file);
    expect(text).toMatch(pattern);
    expect(text).not.toMatch(/<label className="[^"]*\bborder-border\b/);
  });

  it("--input is 3:1 on a dialog's fill in both modes", () => {
    for (const [mode, map] of Object.entries(MODES)) {
      expect(ratio(resolve(map, "var(--input)"), resolve(map, "var(--popover)")), mode).toBeGreaterThanOrEqual(3);
    }
  });
});

/* ------------------------------------------------------------------ */
/* 6. The class lists (the review of AJ's 3A)                          */
/* ------------------------------------------------------------------ */

/**
 * The sweep in section 3 reads stylesheets, so chips drawn in a class list
 * escaped it: the Wrap-up's Times with room "Whose times", Post an
 * initiative's choices, Submit an initiative's client chips (32px too), and
 * the Wrap-up's next weight (its steppers flat on the hairline, its field on
 * the hairline in the raised tone). Each now draws the app's control edge,
 * --input (inside a dialog or a sheet, --popover-input in dark), the
 * steppers raised and the field sunk. This holds every element a trainer
 * taps whose class list draws a hairline edge to an exact list.
 */
function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...tsxFiles(path));
    else if (name.endsWith(".tsx") && !/\.test\.tsx$/.test(name)) out.push(path);
  }
  return out;
}

/**
 * Their own palette and voice (the round's NOT_THIS_ROUND), or not mounted.
 * (ConsultationWizard.tsx left it when it was deleted with the old
 * first-time setup, the first-session design round, Oct 8 2026, §4.8.)
 */
const NOT_THIS_ROUND = /ClientProgressReportView|LegacyChartImporter|ErrorBoundary|MuscleSelector|[\\/]progress-report[\\/]/;
const HAIRLINE_CLASS =
  /(?<![\w:-])border-(?:border|div-d|slate-(?:100|200|300)|\(--(?:divider|edge|[a-z]+-border|[a-z]+-line|[a-z]+-divider)\))(?:\/\d+)?(?![\w-])/;
/** An opening tag with up to three levels of braces in its attributes. */
const TAG = /<([A-Za-z][\w.]*)((?:[^<>{}]|\{(?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*\})*)>/g;
const TAPPABLE_TAG = /^(?:button|label|a|summary|select|Button|DropdownMenuTrigger|TabsTrigger|ToggleGroupItem|SelectTrigger)$/;
const TAPPABLE_ATTR = /\brole="(?:button|radio|switch|tab|checkbox|option)"|\baria-pressed=/;

const CLASS_LIST_ON_PURPOSE: Record<string, string> = {
  "components/EditRoutineDrawer.tsx <button>": "Routine B dashed until it is turned on: a dash means nothing here yet (the follow-up)",
  "features/demo-mode/SetUpDemoCard.tsx <Button>": "the front door's Demo card: always dark, its own palette and voice",
};

describe("6. the class lists: nothing a trainer taps keeps a hairline edge but on purpose", () => {
  it("every tappable element whose class list draws a hairline edge is on the list, and the list is exact", () => {
    const found = new Set<string>();
    for (const path of tsxFiles(SRC)) {
      const file = relative(SRC, path).replace(/\\/g, "/");
      if (NOT_THIS_ROUND.test(file)) continue;
      for (const m of read(file).matchAll(TAG)) {
        const [, tag, attrs] = m;
        if (!HAIRLINE_CLASS.test(attrs)) continue;
        if (TAPPABLE_TAG.test(tag) || TAPPABLE_ATTR.test(attrs)) found.add(`${file} <${tag}>`);
      }
    }
    expect([...found].sort()).toEqual(Object.keys(CLASS_LIST_ON_PURPOSE).sort());
  });

  it("the sweep sees a hairline chip when there is one (a check on the check)", () => {
    const sample = `<button type="button" aria-pressed={on} className={cn("min-h-10 border", on ? "border-(--eq-live)" : "border-div-d bg-card")}>x</button>`;
    const m = [...sample.matchAll(TAG)][0];
    expect(m[1]).toBe("button");
    expect(HAIRLINE_CLASS.test(m[2])).toBe(true);
    expect(HAIRLINE_CLASS.test('className="border border-input bg-card"')).toBe(false);
    expect(HAIRLINE_CLASS.test('className="border border-(--eq-border-strong)"')).toBe(false);
  });

  it.each([
    ["features/openings/ui/TimesWithRoomSheet.tsx", /: "border-input bg-bg-dark-3 text-ink-d1"/, 1],
    ["features/studio-tasks/PostInitiativeDialog.tsx", /: "border-input bg-card text-ink-d2"/g, 3],
  ])("%s: its choices draw --input on their fill", (file, pattern, count) => {
    expect(read(file).match(new RegExp(pattern.source, "g"))?.length).toBe(count);
  });

  it("Submit an initiative's client chips: --input, 40px", () => {
    expect(read("features/studio-tasks/SubmitInitiativeDialog.tsx")).toMatch(
      /className="inline-flex min-h-10 items-center gap-1\.5 rounded-full border border-input bg-bg-dark-3 /,
    );
  });

  it("Times with room's Done and the next weight's steppers are raised on --input with a press; the next weight's field sinks", () => {
    const raised = /border border-input bg-\(--raised\) shadow-\(--raised-lift\) active:translate-y-px active:shadow-\(--press\) transition-transform /;
    expect(read("features/openings/ui/TimesWithRoomSheet.tsx")).toMatch(raised);
    const card = read("features/next-weight/NextWeightCard.tsx");
    expect(card).toMatch(raised);
    expect(card).toMatch(/<label className="[^"]*\bborder border-input bg-\(--well\) shadow-\(--elev-0\)/);
    expect(card).not.toMatch(/border-div-d bg-bg-dark-3/);
  });

  it("--input is 3:1 on those fills in both modes (in a dialog or a sheet, --popover-input in dark)", () => {
    const fills = ["var(--bg-dark-3)", "var(--card)", "var(--well)", "var(--raised)"];
    for (const fill of fills) {
      expect(ratio(resolve(MODES.light, "var(--input)"), resolve(MODES.light, fill)), `light on ${fill}`).toBeGreaterThanOrEqual(3);
      expect(ratio(resolve(MODES.dark, "var(--input)"), resolve(MODES.dark, fill)), `dark on ${fill}`).toBeGreaterThanOrEqual(3);
    }
    for (const fill of ["var(--bg-dark-3)", "var(--card)", "var(--popover-raised)"]) {
      expect(ratio(resolve(MODES.dark, "var(--popover-input)"), resolve(MODES.dark, fill)), `dark, on a popover, on ${fill}`).toBeGreaterThanOrEqual(3);
    }
  });
});
