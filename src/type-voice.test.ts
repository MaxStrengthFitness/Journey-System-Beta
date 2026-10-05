import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * THE HEADING VOICE (type and depth, phase 12, Oct 4 2026; AJ's answer 1A).
 *
 * "Titles are upright Saira Condensed in ordinary capitalisation; the slanted
 * capitals stay only on the studio name and Start session (Go); Geist for
 * everything else." Neither face has an italic file (index.css, fonts.test),
 * so every slant on screen is the browser's oblique: on the display face it
 * is the brand's mark, on Geist it is a fake. This file holds:
 *
 *   1. The display face is slanted only on its allow-list: the studio's name
 *      on the frame and the front door's display line (the brand), and Go
 *      (Start session: the profile header and its In progress, the peek's
 *      and the run sheet's primary, the Directory's Start, the briefing's
 *      Start session, the Deep Dive's Generate).
 *   2. The display face is set in capitals only on its allow-list: the
 *      brand and Go, and the briefing's safety heading (the Stack's safety
 *      voice). The Active Session's eleven capitals left in phase 13 (AJ's
 *      3B), each measured against the grid's fixed rows: its names, days and
 *      heads stand upright as written, and its labels are Geist.
 *   3. No faked italics. A rule or class list that slants Geist is a quiet
 *      line on its own allow-list (an empty place, a quoted note, a
 *      placeholder, the information mark), and a quiet line is never a
 *      heading: never in capitals, never heavier than 700.
 *   4. Page titles, a room's title in its bar, names, headline figures and
 *      codes are the display face, upright, in their own capitalisation.
 *   5. Section titles are Geist 22/800, panel titles Geist 17/700, and the
 *      heads that are not names Geist too, none in capitals.
 *   6. No dialog or sheet title asks for the display face, a slant or
 *      capitals in its class list: the shared DialogTitle's voice (17/700)
 *      speaks, or a class whose rule is held here.
 *
 * The allow-lists are exact both ways: an entry that no longer slants (or
 * no longer exists) fails as well, so they shrink with the code. The plan's
 * other two checks for this guard, no rule asking Saira for 600 or 900 and
 * no font from Google, are fonts.test.ts's (phase 1).
 *
 * Saira Condensed as vendored has no `tnum` feature (its GSUB holds ccmp,
 * dnom, frac, liga and locl) and its digits are proportional (at 800 a 1 is
 * 319 units wide, an 8 489), so `tabular-nums` does nothing in it. It sets
 * numbers that stand alone (a count, a year, a day); a number that changes in
 * place or lines up in a column of changing figures (a clock, a set's reps)
 * stays in Geist.
 *
 * The scan reads a rule at a time, as fonts.test.ts does: a child that
 * inherits the display face from its parent and slants itself in its own rule
 * is read as Geist, and so must be on the quiet list or slant nothing.
 *
 * If one of these fails, the fix is the stylesheet or the class list, not
 * the test.
 */

const SRC = dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(join(SRC, rel), "utf8").replace(/\r\n/g, "\n");
const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");

function filesUnder(dir: string, ext: RegExp, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) filesUnder(p, ext, out);
    else if (ext.test(name)) out.push(p);
  }
  return out;
}
const relOf = (p: string) => relative(SRC, p).replace(/\\/g, "/");

const CSS_FILES = filesUnder(SRC, /\.css$/).map(relOf);
const TSX_FILES = filesUnder(SRC, /\.tsx?$/)
  .filter((p) => !/\.test\.tsx?$/.test(p))
  .map(relOf);

type Rule = { file: string; prelude: string; selectors: string[]; body: string };

function rulesOf(file: string): Rule[] {
  const css = stripComments(read(file));
  const out: Rule[] = [];
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const prelude = m[1].split(";").pop()!.trim().replace(/\s+/g, " ");
    out.push({ file, prelude, selectors: prelude.split(",").map((s) => s.trim()), body: m[2] });
  }
  return out;
}

const ALL_RULES = CSS_FILES.flatMap(rulesOf);

const declared = (body: string, prop: string): string[] =>
  [...body.matchAll(new RegExp(`(?:^|[;\\s{])${prop}\\s*:\\s*([^;]+)`, "g"))].map((m) => m[1].trim());

/** Every custom property's values, by name, from every stylesheet in src. */
const CUSTOM_PROPS = new Map<string, string[]>();
for (const rule of ALL_RULES) {
  for (const m of rule.body.matchAll(/(--[\w-]+)\s*:\s*([^;]+)/g)) {
    const values = CUSTOM_PROPS.get(m[1]) ?? [];
    values.push(m[2].trim());
    CUSTOM_PROPS.set(m[1], values);
  }
}

/** The tokens that resolve to the display face (--font-display, --wk-font-display, --cx-font-display, ...). */
const DISPLAY_TOKENS = (() => {
  const tokens = new Set<string>(["--font-display"]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const [name, values] of CUSTOM_PROPS) {
      if (tokens.has(name)) continue;
      const isDisplay = values.some((v) => {
        if (/^["']Saira Condensed["']/.test(v)) return true;
        const first = v.match(/^var\(\s*(--[\w-]+)/);
        return !!first && tokens.has(first[1]);
      });
      if (isDisplay) {
        tokens.add(name);
        grew = true;
      }
    }
  }
  return tokens;
})();

/** Does a rule set its text in the display face? */
function inDisplayFace(body: string): boolean {
  return [...declared(body, "font-family"), ...declared(body, "font")].some((v) => {
    if (/^["']Saira Condensed["']/.test(v)) return true;
    const first = v.match(/var\(\s*(--[\w-]+)/);
    return !!first && DISPLAY_TOKENS.has(first[1]);
  });
}

const slants = (body: string) =>
  declared(body, "font-style").some((v) => /italic|oblique/.test(v)) ||
  declared(body, "font").some((v) => /\b(?:italic|oblique)\b/.test(v));
const capitals = (body: string) => declared(body, "text-transform").some((v) => /uppercase/.test(v));
const keyOf = (r: Rule) => `${r.file} ${r.prelude}`;

/** The weights a font-weight value can be, through any custom property it reads. */
function weightsOf(value: string, seen = new Set<string>()): number[] {
  const v = value.replace(/\s*!important$/, "").trim();
  const ref = v.match(/^var\(\s*(--[\w-]+)\s*(?:,\s*(.+))?\)$/);
  if (ref) {
    if (seen.has(ref[1])) return [];
    seen.add(ref[1]);
    const values = CUSTOM_PROPS.get(ref[1]);
    if (values) return values.flatMap((x) => weightsOf(x, seen));
    return ref[2] ? weightsOf(ref[2], seen) : [];
  }
  if (v === "bold") return [700];
  if (v === "normal") return [400];
  return /^\d+$/.test(v) ? [Number(v)] : [];
}

/** A font-size in px: `17px`, or the codex's `var(--cx-fs-17)`. */
function sizeOf(value: string): number | null {
  const token = value.match(/--cx-fs-(\d+)/);
  if (token) return Number(token[1]);
  const px = value.match(/^(\d+(?:\.\d+)?)px$/);
  return px ? Number(px[1]) : null;
}

/* ------------------------------------------------------------------ */
/* The allow-lists                                                     */
/* ------------------------------------------------------------------ */

const GO = "Go: Start session's own voice (AJ's 1A), the display face's slanted capitals at 800 and 17";
const BRAND = "a brand moment";

/** 1. The display face, slanted. */
const DISPLAY_SLANT: Record<string, string> = {
  'features/briefing/briefing.css .br__cta': `${GO} (the briefing's Start session)`,
  "features/clinical-review/clinical-review.css .cr-generate": `${GO} (the Deep Dive's Generate)`,
  "features/client-directory/client-directory.css .cd-start": `${GO} (the Directory's Start)`,
  'features/hub-opportunities/run-sheet.css .ho-action[data-primary="true"]': `${GO} (the run sheet's primary)`,
  'features/hub-schedule/peek.css .hp-btn[data-primary="true"]': `${GO} (the peek's primary)`,
  "features/front-door/front-door.css .fd-display": `${BRAND}: the front door's display line (Oct 3 2026)`,
};

/** 2. The display face, in capitals: the slanted ones and these. */
const DISPLAY_CAPS: Record<string, string> = {
  ...DISPLAY_SLANT,
  "features/briefing/briefing.css .br-safe__clear": "the safety heading read before every session (the Stack's safety voice, Oct 3 2026), upright",
  "features/briefing/briefing.css .br-safe__title": "a limit's name in the safety block (the Stack's safety voice, Oct 3 2026), upright",
};

/** 3. Geist, slanted on purpose: quiet lines, never headings. */
const EMPTY = "an empty place said in a sentence";
const QUOTED = "words quoted from a note or a person";
const PLACEHOLDER = "a field's placeholder";
const QUIET_SLANT: Record<string, string> = {
  "features/admin/machine-fit/machine-fit-admin.css .adm-fit-table__thin": "a thin sample, said quietly in the table",
  "features/admin/machines/editor/editor.css .adm-me__cue": "a cue, quoted as the floor says it",
  "features/admin/machines/editor/editor.css .adm-me__empty": EMPTY,
  "features/briefing/briefing.css .br__quote": QUOTED,
  "features/briefing/briefing.css .br__goalline": "the client's goal, quoted",
  "features/client-codex/body/body.css .bp-strip__empty": EMPTY,
  "features/client-directory/client-directory.css .cd-why-mark": "the information mark: a lower-case i set italic is the sign itself",
  "features/client-history/client-history.css .hist-legend__status": "what the calendar is not drawing yet",
  "features/client-history/client-history.css .hist-note": QUOTED,
  "features/client-history/client-history.css .hsd-set__muted": "a set with nothing recorded",
  "features/equipment/equipment.css .eq-item__empty": EMPTY,
  "features/equipment/equipment.css .eq-use__never": EMPTY,
  "features/equipment/equipment.css .eq-field__input::placeholder": PLACEHOLDER,
  "features/equipment/equipment.css .eq-field__read i": "a setting with no value",
  "features/equipment/equipment.css .eq-reason input::placeholder, .eq-reason textarea::placeholder": PLACEHOLDER,
  "features/equipment/equipment.css .eq-composer textarea::placeholder": PLACEHOLDER,
  "features/equipment/equipment.css .eq-hist__why": "a change's reason, quoted",
  "features/ford/page/ford-page.css .fordpg-gap": EMPTY,
  "features/goals/goals.css .gf-focus-blurb": "the focus's own words, quoted",
  'features/hub-opportunities/run-sheet.css .ho-sentence[data-unknown="true"]': "a sentence the run sheet cannot stand behind yet",
  "features/machine-fit/ui/machine-fit.css .fit-row__empty": EMPTY,
  "features/machine-fit/ui/machine-fit.css .fit-cell__input::placeholder": PLACEHOLDER,
  "features/machine-fit/ui/machine-fit.css .fit-match__row[data-missing] .fit-match__onfile": "nothing on file",
  "features/machine-trends/machine-trends.css .mt__withheld": "a number withheld below its minimum sample",
  "features/progress-report/progress-report.css .pr-p__note": QUOTED,
  "features/progress-report/progress-report.css .pr-p__tp-text": QUOTED,
  "features/progress-report/progress-report.css .pr-fourps__summary li": QUOTED,
  "features/progress-report/progress-report.css .pr-pcard__note": QUOTED,
  "features/routine-builder/routine-builder.css .rb-warn__escalate": "what to do if the warning holds, said quietly",
  "features/routines/routines.css .rt-row__note": QUOTED,
  "features/routines/routines.css .rt-row__empty": EMPTY,
  "features/routines/routines.css .rt-change__why": "a change's reason, quoted",
  "features/routines/routines.css .rt-changes__none": EMPTY,
  "features/routines/routines.css .rt-summary__none": EMPTY,
  "features/standing-week/standing-week.css .stw-quiet": EMPTY,
  "features/subjective-report/subjective-report.css .sr-statement__note": QUOTED,
  "features/subjective-report/subjective-report.css .sra-row__note": QUOTED,
  "features/trainer-profile/trainer-profile.css .tp-empty": EMPTY,
};

/**
 * Class lists in the TSX: how many slanted lists each file may hold. A count,
 * not the strings, so an unrelated class added to one does not move the list,
 * while a new slant anywhere does.
 */
const TSX_DISPLAY_SLANT: Record<string, { count: number; why: string }> = {
  "components/AppHeader.tsx": { count: 1, why: `${BRAND}: the studio's name on the frame` },
  "features/client-profile/ProfileHeader.tsx": { count: 2, why: `${GO}: Start session's label and In progress, its other state` },
};
const TSX_QUIET_SLANT: Record<string, { count: number; why: string }> = {
  "components/ClientProgressReportView.tsx": { count: 5, why: "the report's quoted narrative, a 4P note, the client's own why and the trainer's summary, and the window's hint" },
  "components/ConsultationWizard.tsx": { count: 4, why: "the consultation script's lines, quoted as the trainer says them" },
  "components/EditRoutineDrawer.tsx": { count: 1, why: EMPTY },
  "components/WrapUpScreen.tsx": { count: 1, why: PLACEHOLDER },
  "features/admin/import/LegacyChartImporter.tsx": { count: 1, why: EMPTY },
  "features/client-profile/ProfileHeader.tsx": { count: 1, why: '"Not scheduled": the next session tile with nothing booked' },
  "features/progress-report/ClientReportSections.tsx": { count: 3, why: "the client's words and the narrative, quoted" },
};

/* ------------------------------------------------------------------ */
/* The TSX scan                                                        */
/* ------------------------------------------------------------------ */

/** Every string literal in a source file that reads as a class list (two tokens or more). */
function classLists(file: string): string[] {
  const text = read(file);
  const out: string[] = [];
  for (const m of text.matchAll(/"([^"\n]*)"|'([^'\n]*)'|`([^`]*)`/g)) {
    const s = (m[1] ?? m[2] ?? m[3] ?? "").trim();
    if (s.split(/\s+/).length < 2) continue;
    out.push(s);
  }
  return out;
}
const tokensOf = (list: string) => list.split(/\s+/).filter(Boolean);
/** `italic`, under any variant (`md:italic`, `placeholder:italic`); never `not-italic`. */
const hasSlant = (list: string) => tokensOf(list).some((t) => /(?:^|:)italic$/.test(t));
const hasCaps = (list: string) => tokensOf(list).some((t) => /(?:^|:)uppercase$/.test(t));
const hasDisplay = (list: string) => tokensOf(list).some((t) => /(?:^|:)font-display$/.test(t));
const tooHeavy = (list: string) => tokensOf(list).some((t) => /(?:^|:)font-(?:black|extrabold|\[(?:8|9)00\])$/.test(t));

const TSX_LISTS = TSX_FILES.map((file) => ({ file, lists: classLists(file) }));

/* ------------------------------------------------------------------ */

describe("the scan reads something", () => {
  it("finds the display face's tokens and rules", () => {
    for (const t of ["--font-display", "--wk-font-display", "--cx-font-display", "--jg-font-display", "--rb-font-display", "--cr-font-display"]) {
      expect(DISPLAY_TOKENS.has(t), t).toBe(true);
    }
    expect(ALL_RULES.filter((r) => inDisplayFace(r.body)).length).toBeGreaterThan(40);
  });

  it("finds class lists in the TSX", () => {
    expect(TSX_LISTS.reduce((n, f) => n + f.lists.length, 0)).toBeGreaterThan(5000);
  });
});

describe("1. the display face slants only for the brand and Go", () => {
  it("in the stylesheets: exactly the allow-list", () => {
    const found = ALL_RULES.filter((r) => inDisplayFace(r.body) && slants(r.body)).map(keyOf);
    expect(found.sort()).toEqual(Object.keys(DISPLAY_SLANT).sort());
  });

  it("in the TSX: exactly the allow-list's count per file", () => {
    const found: Record<string, number> = {};
    for (const { file, lists } of TSX_LISTS) {
      const n = lists.filter((l) => hasDisplay(l) && hasSlant(l)).length;
      if (n) found[file] = n;
    }
    expect(found).toEqual(Object.fromEntries(Object.entries(TSX_DISPLAY_SLANT).map(([f, v]) => [f, v.count])));
  });

  it("Go and the brand slant in capitals at 800, never at another weight", () => {
    for (const key of Object.keys(DISPLAY_SLANT)) {
      const rule = ALL_RULES.find((r) => keyOf(r) === key)!;
      expect(capitals(rule.body), key).toBe(true);
      expect(declared(rule.body, "font-weight").flatMap((w) => weightsOf(w)), key).toEqual([800]);
    }
    for (const { file, lists } of TSX_LISTS) {
      for (const l of lists.filter((x) => hasDisplay(x) && hasSlant(x))) {
        expect(hasCaps(l), `${file}: ${l}`).toBe(true);
        expect(tokensOf(l), `${file}: ${l}`).toContain("font-extrabold");
      }
    }
  });
});

describe("2. the display face is set in capitals only on its allow-list", () => {
  it("in the stylesheets: exactly the allow-list", () => {
    const found = ALL_RULES.filter((r) => inDisplayFace(r.body) && capitals(r.body)).map(keyOf);
    expect(found.sort()).toEqual(Object.keys(DISPLAY_CAPS).sort());
  });

  it("the briefing's safety heading stands upright", () => {
    for (const sel of [".br-safe__clear", ".br-safe__title"]) {
      const rule = ALL_RULES.find((r) => r.file === "features/briefing/briefing.css" && r.prelude === sel)!;
      expect(declared(rule.body, "font-style"), sel).toEqual(["normal"]);
    }
  });

  it("in the TSX: only where it also slants (the brand and Go)", () => {
    const found: string[] = [];
    for (const { file, lists } of TSX_LISTS) {
      for (const l of lists) if (hasDisplay(l) && hasCaps(l) && !hasSlant(l)) found.push(`${file}: ${l}`);
    }
    expect(found).toEqual([]);
  });
});

describe("3. no faked italics: Geist slants only on a quiet line", () => {
  it("in the stylesheets: exactly the quiet allow-list", () => {
    const found = ALL_RULES.filter((r) => !inDisplayFace(r.body) && slants(r.body)).map(keyOf);
    expect(found.sort()).toEqual(Object.keys(QUIET_SLANT).sort());
  });

  it("a quiet line in a stylesheet is never a heading: no capitals, nothing over 700", () => {
    for (const key of Object.keys(QUIET_SLANT)) {
      const rule = ALL_RULES.find((r) => keyOf(r) === key)!;
      expect(capitals(rule.body), `${key}: capitals`).toBe(false);
      const weights = declared(rule.body, "font-weight").flatMap((w) => weightsOf(w));
      expect(weights.filter((w) => w > 700), `${key}: weight`).toEqual([]);
    }
  });

  it("in the TSX: exactly the quiet allow-list's count per file", () => {
    const found: Record<string, number> = {};
    for (const { file, lists } of TSX_LISTS) {
      const n = lists.filter((l) => !hasDisplay(l) && hasSlant(l)).length;
      if (n) found[file] = n;
    }
    expect(found).toEqual(Object.fromEntries(Object.entries(TSX_QUIET_SLANT).map(([f, v]) => [f, v.count])));
  });

  it("a quiet line in the TSX is never a heading: no capitals, nothing over 700", () => {
    const found: string[] = [];
    for (const { file, lists } of TSX_LISTS) {
      for (const l of lists.filter((x) => !hasDisplay(x) && hasSlant(x))) {
        if (hasCaps(l) || tooHeavy(l)) found.push(`${file}: ${l}`);
      }
    }
    expect(found).toEqual([]);
  });

  it("every entry says why", () => {
    for (const why of [...Object.values(DISPLAY_CAPS), ...Object.values(QUIET_SLANT)]) expect(why.length).toBeGreaterThan(10);
    for (const { why } of [...Object.values(TSX_DISPLAY_SLANT), ...Object.values(TSX_QUIET_SLANT)]) expect(why.length).toBeGreaterThan(10);
  });
});

/* ------------------------------------------------------------------ */

/** Every rule in a file whose selector list names this selector. */
function rulesFor(file: string, selector: string): Rule[] {
  const found = ALL_RULES.filter((r) => r.file === file && r.selectors.includes(selector));
  if (!found.length) throw new Error(`${file}: no rule for ${selector}`);
  return found;
}

/**
 * 4. The display face, upright, in its own capitalisation: [file, selector,
 * weight]. A machine's name is 700, as the floor's names are; the rest 800.
 */
const UPRIGHT_DISPLAY: [file: string, selector: string, weight: number, what: string][] = [
  // page titles
  ["features/client-codex/kit/kit.css", ".cx-page-title", 800, "a Notes & Profile page's title"],
  ["features/settings/settings.css", ".stg-head__title", 800, "Settings' title"],
  ["features/learning/learning.css", ".lh__title", 800, "Learning's title"],
  ["features/wiki/wiki.css", ".wk__index-title", 800, "a Learning index's title"],
  ["features/wiki/wiki.css", ".wk__h1", 800, "a Learning page's title"],
  ["features/catalog/catalog.css", ".mcat-body__title", 800, "a region's title on the Catalog's body"],
  // a room's own title in its bar
  ["features/wiki/wiki.css", ".wk__mast-title", 800, "Learning's name in its masthead"],
  ["features/my-studio/my-studio.css", ".msh__sect-name", 800, "My Studio's section in its header"],
  ["features/relay/kit.css", ".rk-title", 800, "a Relay sheet's title"],
  ["features/studio-tasks/studio-tasks.css", ".st__title", 800, "a studio-tasks page title"],
  ["features/routine-builder/routine-builder.css", ".rb-head__title", 800, "the routine's name in the builder's head"],
  ["features/calendar/calendar.css", ".cal-header__name", 800, "the calendar's and History's title in their bar"],
  ["features/clinical-review/clinical-review.css", ".cr-bar__name", 800, "the Deep Dive's name in its bar"],
  // names
  ["features/briefing/briefing.css", ".br__name", 800, "the client's name on the briefing"],
  ["features/trainer-profile/trainer-profile.css", ".tp-identity__name", 800, "the trainer's name on My Profile"],
  ["features/equipment/equipment.css", ".eq-detail__name", 800, "a machine's name on its detail panel"],
  ["features/hub-schedule/peek.css", ".hp-name", 800, "the client's name on the peek"],
  ["features/hub-schedule/hub-grid.css", ".hs-colname strong", 800, "a trainer's name heading a lane"],
  ["features/briefing/briefing.css", ".br__routine-name", 800, "a routine's name on the briefing"],
  ["features/routine-builder/routine-builder.css", ".rb-row__name", 700, "a machine in the builder's list"],
  ["features/routine-builder/routine-builder.css", ".rb-pick__name", 700, "a machine in the builder's picker"],
  ["features/routine-builder/routine-builder.css", ".rb-sug__name", 700, "a suggested machine"],
  ["features/routine-builder/routine-builder.css", ".rb-swap__to", 700, "the machine a swap brings in"],
  // headline figures
  ["features/client-codex/kit/kit.css", ".cx-big", 800, "a big number in the codex"],
  ["features/wiki/wiki.css", ".wk__stat-value", 800, "a big number in Learning"],
  ["features/learning/learning.css", ".lh__facts strong", 800, "Learning's facts"],
  ["features/client-story/story.css", ".st-year__title", 800, "a year on the Story"],
  ["features/ford/page/ford-page.css", ".fordpg-cu__date", 800, "a day on FORD's coming up"],
  ["features/packages/packages.css", ".pk-length__months", 800, "a package's months"],
  ["features/relay/kit.css", ".gb__value", 800, "a figure on a Relay tile"],
  ["features/routine-builder/routine-builder.css", ".rb-row__pos", 800, "a machine's place in the routine"],
  ["features/client-history/client-history.css", ".hist-year__num", 800, "a year in History"],
  // codes
  ["features/wiki/wiki.css", ".wk__row-code", 700, "a machine's code, a jersey tag"],
  ["features/client-history/client-history.css", ".hist-routine", 800, "a session's routine letter"],
  ["features/routines/routines.css", ".rt-badge", 800, "a routine's letter"],
  // the Active Session (phase 13, AJ's 3B): its names, days and heads
  ["features/journey-grid/journey-grid.css", ".jg-sbar__name", 800, "the client on the session bar"],
  ["features/journey-grid/journey-grid.css", ".jg-nb__name", 800, "the machine on the Now Bar"],
  ["features/journey-grid/journey-grid.css", ".jg-nb__nextname", 700, "the next machine on the Now Bar"],
  ["features/journey-grid/journey-grid.css", ".jg-head__d", 700, "a session's day over its column"],
  ["features/journey-grid/journey-grid.css", ".jg-corner__title", 700, "the machine column's head"],
  ["features/journey-grid/journey-grid.css", ".jg-stat-head__title", 800, "the Analytics column's head"],
];

describe("4. titles, names, figures and codes: the display face, upright, in their own capitalisation", () => {
  it.each(UPRIGHT_DISPLAY)("%s %s", (file, selector, weight, what) => {
    const rules = rulesFor(file, selector);
    expect(rules.some((r) => inDisplayFace(r.body)), `${selector} (${what}): the display face`).toBe(true);
    for (const r of rules) {
      expect(slants(r.body), `${selector} (${what}): slanted`).toBe(false);
      expect(capitals(r.body), `${selector} (${what}): capitals`).toBe(false);
    }
    const weights = rules.flatMap((r) => declared(r.body, "font-weight").flatMap((w) => weightsOf(w)));
    expect(weights, `${selector} (${what}): weight`).toContain(weight);
  });

  it("the jersey tag is 14px and ringed in its own ink", () => {
    const [rule] = rulesFor("features/wiki/wiki.css", ".wk__row-code");
    expect(declared(rule.body, "font-size")).toEqual(["14px"]);
    expect(declared(rule.body, "box-shadow")).toEqual(["inset 0 0 0 1px color-mix(in srgb, currentColor 22%, transparent)"]);
  });
});

/** 5. Geist heads: [file, selector, size, weight]. */
const GEIST_HEADS: [file: string, selector: string, size: number, weight: number, what: string][] = [
  // section titles: 22/800
  ["features/client-codex/kit/kit.css", ".cx-section-head", 22, 800, "a codex page's section"],
  ["features/learning/learning.css", ".lh__h2", 22, 800, "a Learning section"],
  ["features/progress-report/progress-report.css", ".pr-card__title", 22, 800, "a progress report step's title"],
  ["features/client-history/client-history.css", ".hsd-head__day", 22, 800, "the session pop-up's day"],
  // panel titles: 17/700
  ["features/client-codex/kit/kit.css", ".cx-slot__head > .cx-eyebrow", 17, 700, "a codex slot's head"],
  ["features/settings/settings.css", ".stg-card__title", 17, 700, "a Settings card's head"],
  ["features/admin/admin.css", ".adm-panel__title", 17, 700, "an Operations panel's head"],
  ["features/trainer-profile/trainer-profile.css", ".tp-card__title", 17, 700, "a My Profile card's head"],
  ["features/equipment/equipment.css", ".eq-card__title", 17, 700, "a machine sheet card's head"],
  ["features/calendar/calendar.css", ".cal-card__title", 17, 700, "a calendar card's head"],
  ["features/clinical-review/clinical-review.css", ".cr-section__title", 17, 700, "a Deep Dive panel's title"],
  ["features/subjective-report/subjective-report.css", ".sra-head__title", 17, 700, "the Pulse panel's title"],
  ["features/subjective-report/subjective-report.css", ".pq-dialog__title", 17, 700, "Update Pulse's dialog title"],
  // heads that are not names
  ["features/client-history/client-history.css", ".hist-lmonth__name", 17, 800, "a month over History's list"],
  ["features/progress-report/progress-report.css", ".pr-step__title", 14, 700, "a step in the report's stepper"],
];

describe("5. section titles, panel titles and the heads that are not names: Geist, never in capitals", () => {
  it.each(GEIST_HEADS)("%s %s", (file, selector, size, weight, what) => {
    const rules = rulesFor(file, selector);
    for (const r of rules) {
      expect(inDisplayFace(r.body), `${selector} (${what}): the display face`).toBe(false);
      expect(slants(r.body), `${selector} (${what}): slanted`).toBe(false);
      expect(capitals(r.body), `${selector} (${what}): capitals`).toBe(false);
    }
    const sizes = rules.flatMap((r) => declared(r.body, "font-size").map(sizeOf));
    expect(sizes[0], `${selector} (${what}): size`).toBe(size);
    const weights = rules.flatMap((r) => declared(r.body, "font-weight").flatMap((w) => weightsOf(w)));
    expect(weights[0], `${selector} (${what}): weight`).toBe(weight);
  });
});

describe("6. a dialog's or a sheet's title asks for no display face, slant or capitals", () => {
  const TITLES = TSX_FILES.flatMap((file) =>
    [...read(file).matchAll(/<(DialogTitle|SheetTitle)\b([^>]*)>/g)].map((m) => ({ file, tag: m[1], attrs: m[2] })),
  );

  it("finds the titles (the scan is reading something)", () => {
    expect(TITLES.length).toBeGreaterThan(30);
  });

  it("none of them", () => {
    const found: string[] = [];
    for (const { file, tag, attrs } of TITLES) {
      const cls = attrs.match(/className=(?:"([^"]*)"|\{([^}]*)\})/);
      if (!cls) continue;
      const list = (cls[1] ?? cls[2] ?? "").replace(/["'`]/g, " ");
      if (hasSlant(list) || hasCaps(list) || hasDisplay(list)) found.push(`${file}: <${tag} className="${list.trim()}">`);
    }
    expect(found).toEqual([]);
  });

  it("the shared DialogTitle speaks the panel-title voice, 17/700", () => {
    const dialog = read("components/ui/dialog.tsx");
    const title = dialog.slice(dialog.indexOf("function DialogTitle"), dialog.indexOf("function DialogDescription"));
    expect(title).toMatch(/text-\[17px\]/);
    expect(title).toMatch(/font-bold/);
    expect(hasSlant(title) || hasCaps(title) || hasDisplay(title)).toBe(false);
  });
});
