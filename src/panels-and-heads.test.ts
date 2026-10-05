import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * PANELS AND HEADS ACROSS THE ROOMS (type and depth, phase 10, Oct 4 2026;
 * AJ's answers "1a 2a 3b", Refined Lift).
 *
 * AJ, Oct 4 2026: "there are sharp white boxs all over the place, i think
 * borders and headers just needs a little bit of weight and depth". The
 * codex's panels took the recipe in phase 6; this holds every other room's.
 *
 *   1. A PANEL is told from the page by an edge seen from OUTSIDE it (the
 *      family's --X-edge, navy at 13%, with the fill clipped to the padding
 *      box so the edge sits over the ground) and a short two-layer navy lift
 *      (--X-elev-2 and --X-panel-highlight, the dark top light). The hero
 *      lifts higher (--X-elev-3); a booking on the Next 30 minutes strip
 *      takes the Hub card's small lift (--X-elev-card). Something past or
 *      off (a done card, a trainer off today, a routine that is off, an
 *      unlinked booking) lies flat.
 *   2. A panel's HEAD has no band and no rule: the title carries it.
 *   3. A card's title speaks the panel-title voice, Geist 17/700 in ink at
 *      -0.01em, in its own capitalisation; an icon leading it sits in a 32px
 *      tinted square. A head over a list speaks the label voice, 14/700 in
 *      ink-2. Both read at 4.5:1 on the panel, light and dark.
 *   4. A coloured rule on a rounded box is a straight band painted as the
 *      first background layer, never a border wider than 1px, nor an inset
 *      shadow (both taper into a crescent at the corners).
 *   5. A tappable panel presses in with a transform; nothing here animates a
 *      shadow; no shadow here is raw black.
 *
 * Read from source, comments removed. If one of these fails, the fix is the
 * stylesheet, not the test.
 */

const SRC = dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(join(SRC, rel), "utf8").replace(/\r\n/g, "\n");
const css = (rel: string) => read(rel).replace(/\/\*[\s\S]*?\*\//g, "");

type Rule = { selectors: string[]; body: string; at: string[]; pos: number };

/** Every innermost rule of a stylesheet, with the at-rules it sits inside. */
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

/** Every value `prop` takes in `body`, in order. */
function declared(body: string, prop: string): string[] {
  return [...body.matchAll(new RegExp(`(?:^|;|\\{)\\s*${prop}\\s*:\\s*([^;]+)`, "g"))].map((m) => m[1].trim().replace(/\s+/g, " "));
}

/** The rules (outside any @media) that name one of `selectors` exactly, in source order, merged: the later wins. */
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
/* The palettes, light and dark, to measure words on each panel        */
/* ------------------------------------------------------------------ */

/** The block of custom properties that opens at `at`, comments stripped. */
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

const PALETTES: [string, string, string][] = [
  ["index.css", "\n:root {", "\n.dark {"],
  ["features/equipment/equipment.tokens.css", "\n:root {", '[data-theme="dark"] {'],
  ["features/admin/admin.tokens.css", "\n:root {", '[data-theme="dark"] {'],
  ["features/studio-tasks/studio-tasks.css", "\n:root {", '[data-theme="dark"] {'],
  ["features/wiki/wiki.tokens.css", "\n:root {", '[data-theme="dark"] {'],
  ["features/calendar/calendar.tokens.css", "\n:root {", '[data-theme="dark"] {'],
  ["features/briefing/briefing.tokens.css", "\n:root {", '[data-theme="dark"] {'],
  ["features/trainer-profile/trainer-profile.tokens.css", "\n:root {", '[data-theme="dark"] {'],
];
const LIGHT: Record<string, string> = {};
const DARK_OWN: Record<string, string> = {};
for (const [file, l, d] of PALETTES) {
  const text = css(file);
  Object.assign(LIGHT, tokenBlock(text, l));
  Object.assign(DARK_OWN, tokenBlock(text, d));
}
const MODES = { light: LIGHT, dark: { ...LIGHT, ...DARK_OWN } } as const;
const DECLARED = new Set([...Object.keys(LIGHT), ...Object.keys(DARK_OWN)]);

/** A var() chain followed to its colour (or its fallback). */
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
/* 1. The panels                                                        */
/* ------------------------------------------------------------------ */

type Panel = {
  file: string;
  sel: string;
  /** The palette prefix: --{p}-edge, --{p}-elev-2. */
  p: string;
  /** Its lift, when it is not the panel's (the hero, a booking). */
  lift?: string;
  /** Its fill carries a band, so the padding-box clip is in the background layers. */
  band?: boolean;
};

const PANELS: Panel[] = [
  // Settings and My Profile.
  { file: "features/settings/settings.css", sel: ".stg-card", p: "eq" },
  { file: "features/trainer-profile/trainer-profile.css", sel: ".tp-card", p: "tp" },
  { file: "features/trainer-profile/trainer-profile.css", sel: ".tp-identity", p: "tp" },
  // My Studio: Team, Openings, Relay (the Board, the Tracker, the Journal, the Floor Map).
  { file: "features/relay/team/team.css", sel: ".tm-card", p: "st" },
  { file: "features/relay/board/relay.css", sel: ".tc", p: "st" },
  { file: "features/studio-tasks/studio-tasks.css", sel: ".stm__panel", p: "st" },
  { file: "features/openings/openings.css", sel: ".op-person", p: "st" },
  { file: "features/openings/openings.css", sel: ".op-offer", p: "st" },
  { file: "features/relay/board/board.css", sel: ".rbc", p: "st" },
  { file: "features/relay/board/board.css", sel: ".rjn", p: "st" },
  { file: "features/relay/board/board.css", sel: ".rsy", p: "st" },
  { file: "features/relay/planner.css", sel: ".pl__list ul", p: "st" },
  { file: "features/relay/tracker.css", sel: ".rtk .pl__task", p: "st" },
  { file: "features/relay/notes/notes.css", sel: ".pn__card", p: "st" },
  { file: "features/relay/board/relay.css", sel: ".fm__tile", p: "st" },
  { file: "features/studio-tasks/studio-hub.css", sel: ".sh__strip", p: "st" },
  // Operations and the Admins dashboard.
  { file: "features/admin/admin.css", sel: ".adm-panel", p: "adm" },
  { file: "features/admin/shell/ops.css", sel: ".ops-sec__card", p: "adm" },
  { file: "features/admin/shell/ops.css", sel: ".ops-case", p: "adm" },
  { file: "features/admin/shell/ops.css", sel: ".ops-tr", p: "adm" },
  { file: "features/admin/shell/ops.css", sel: ".ops-fact", p: "adm" },
  { file: "features/admin/shell/ops.css", sel: ".ops-setup", p: "adm" },
  { file: "features/admin/overview/overview.css", sel: ".adm-ov__needs", p: "adm" },
  { file: "features/admin/overview/overview.css", sel: ".adm-ov__chase", p: "adm" },
  { file: "features/admins/admins.css", sel: ".hq-rows", p: "adm" },
  { file: "features/admins/admins.css", sel: ".hq-held", p: "adm" },
  { file: "features/admins/admins.css", sel: ".hq-items", p: "adm" },
  { file: "features/admins/admins.css", sel: ".hq-launch", p: "adm" },
  { file: "features/admins/admins.css", sel: ".hq-search", p: "adm" },
  // Notes, the briefing, the machine sheet, the Calendar, the Directory.
  { file: "features/client-notes/notes-page.css", sel: ".nt-card", p: "eq" },
  { file: "features/client-notes/notes-page.css", sel: ".nx-rows", p: "eq" },
  { file: "features/briefing/briefing.css", sel: ".br-card", p: "br" },
  { file: "features/equipment/equipment.css", sel: ".eq-card", p: "eq" },
  { file: "features/calendar/calendar.css", sel: ".cal-card", p: "cal" },
  { file: "features/client-directory/client-directory.css", sel: ".cd-scroll", p: "eq" },
  // The profile's Programming and Activity Archive tabs.
  { file: "features/routines/routines.css", sel: ".rt-routine", p: "eq" },
  { file: "features/routines/routines.css", sel: ".rt-changes", p: "eq" },
  { file: "features/client-history/client-history.css", sel: ".hist-month", p: "cal" },
  { file: "features/client-history/client-history.css", sel: ".hist-lcard", p: "cal" },
  // Learning and the Catalog.
  { file: "features/learning/learning.css", sel: ".lh__hero", p: "wk", lift: "var(--wk-elev-3), var(--wk-panel-highlight)", band: true },
  { file: "features/learning/learning.css", sel: ".lh__tile", p: "wk" },
  { file: "features/wiki/wiki.css", sel: ".wk__infobox", p: "wk" },
  { file: "features/catalog/catalog.css", sel: ".mcat-floor", p: "wk" },
  { file: "features/catalog/catalog.css", sel: ".mcat-models", p: "wk" },
  { file: "features/catalog/catalog.css", sel: ".mcat-changes", p: "wk" },
  // The Hub's Next 30 minutes, and the phone's machine card.
  { file: "features/hub-schedule/next-strip.css", sel: ".hn-item", p: "eq", lift: "var(--eq-elev-card), var(--eq-panel-highlight)" },
  { file: "features/phone/phone.css", sel: ".ph-card", p: "eq" },
];

describe("a panel: the edge seen from outside, the fill clipped to the padding box, a short navy lift", () => {
  it.each(PANELS.map((x) => [x.sel, x] as const))("%s", (_sel, x) => {
    const own = merged(x.file, x.sel);
    expect(own.border, "the edge").toBe(`1px solid var(--${x.p}-edge)`);
    expect(own["box-shadow"], "the lift").toBe(x.lift ?? `var(--${x.p}-elev-2), var(--${x.p}-panel-highlight)`);
    if (x.band) expect(own.background, "the fill clipped to the padding box, under the band").toMatch(/var\(--\w+-surface\) padding-box$/);
    else expect(own["background-clip"], "the fill clipped to the padding box").toBe("padding-box");
    for (const t of [`--${x.p}-edge`, `--${x.p}-elev-2`, `--${x.p}-panel-highlight`]) expect(DECLARED.has(t), t).toBe(true);
  });

  it("the edge is the soft navy edge, never the hairline or the 3:1 control edge it replaced", () => {
    for (const x of PANELS) {
      const bodies = rulesOf(x.file).filter((r) => r.at.length === 0 && r.selectors.includes(x.sel)).map((r) => r.body).join(";");
      expect(declared(bodies, "border"), x.sel).not.toContain(`1px solid var(--${x.p}-border)`);
      expect(declared(bodies, "border"), x.sel).not.toContain(`1px solid var(--${x.p}-border-strong)`);
    }
  });

  it.each([
    ["features/relay/board/board.css", '.rbc[data-state="done"]'],
    ["features/relay/tracker.css", ".rtk .pl__task--done"],
    ["features/admin/shell/ops.css", ".ops-tr--off"],
    ["features/routines/routines.css", ".rt-routine--off"],
    ["features/hub-schedule/next-strip.css", '.hn-item[data-kind="unlinked"]'],
    ["features/admin/admin.css", ".adm-panel--flush"],
  ])("what is past, off or not a client lies flat: %s %s", (file, sel) => {
    expect(merged(file, sel)["box-shadow"]).toBe("none");
  });

  it("a list that draws its rows as cards takes the lift off the list itself (the Tracker)", () => {
    expect(merged("features/relay/tracker.css", ".rtk .pl__list ul")["box-shadow"]).toBe("none");
  });

  it("today's routine keeps its orange ring on top of the lift", () => {
    expect(merged("features/routines/routines.css", ".rt-routine--today")["box-shadow"]).toBe(
      "inset 0 0 0 1px var(--eq-hero), var(--eq-elev-2), var(--eq-panel-highlight)",
    );
  });

  it("the machine in hand on a phone lifts as an open card; an open Next 30 minutes booking keeps its blue ring and its lift", () => {
    expect(merged("features/phone/phone.css", ".ph-card.is-in-hand")["box-shadow"]).toBe("var(--eq-elev-3), var(--eq-panel-highlight)");
    expect(merged("features/hub-schedule/next-strip.css", '.hn-item[data-open="true"]')["box-shadow"]).toBe("0 0 0 2px var(--eq-live), var(--eq-elev-card)");
  });

  it("the state rails the plan keeps stay: the Next 30 minutes booking and the phone's machine card", () => {
    expect(merged("features/hub-schedule/next-strip.css", ".hn-item")["border-left"]).toBe("4px solid var(--eq-ink-faint)");
    expect(merged("features/phone/phone.css", ".ph-card")["border-left"]).toBe("4px solid var(--eq-border-strong)");
  });

  it("the Next 30 minutes row holds its bookings' lift inside its own padding (a scroller clips what it does not hold), and the strip stays 60px", () => {
    expect(merged("features/hub-schedule/next-strip.css", ".hn-row").padding).toBe("4px 12px 8px 0");
    const strip = merged("features/hub-schedule/next-strip.css", ".hn");
    expect(strip.padding).toBe("0 0 0 12px");
    expect(strip["min-height"]).toBe("60px");
  });

  it("the Calendar's shell is no box round the boxes: no border, no fill", () => {
    const shell = merged("features/calendar/calendar.css", ".cal-shell");
    expect(shell.border).toBe("0");
    expect(shell.background).toBe("transparent");
  });

  it("the Wrap-up's cards are panels: the edge, the padding-box clip and the panel's lift, in its className", () => {
    const src = read("components/WrapUpScreen.tsx");
    const card = src.match(/function Card\([\s\S]*?className=\{`([^`]*)`\}/)?.[1] ?? "";
    const cls = card.split(/\s+/);
    expect(cls).toEqual(expect.arrayContaining(["border", "border-(--edge)", "bg-clip-padding", "rounded-[14px]", "shadow-(--panel-lift)"]));
    expect(cls).not.toContain("border-div-d");
    expect(card).not.toMatch(/transition-(all|shadow)/);
    expect(read("index.css")).toMatch(/--panel-lift:\s*var\(--elev-2\),\s*var\(--panel-highlight\);/);
  });
});

/* ------------------------------------------------------------------ */
/* 2. Heads with no band and no rule                                    */
/* ------------------------------------------------------------------ */

describe("a panel's head has no band and no rule: the title carries it", () => {
  it.each([
    ["features/settings/settings.css", ".stg-card__head"],
    ["features/trainer-profile/trainer-profile.css", ".tp-card__head"],
    ["features/relay/team/team.css", ".tm-card__head"],
    ["features/admin/admin.css", ".adm-panel__head"],
    ["features/equipment/equipment.css", ".eq-card__head"],
    ["features/calendar/calendar.css", ".cal-card__head"],
    ["features/relay/board/relay.css", ".tc > .rl-h"],
    ["features/studio-tasks/studio-tasks.css", ".stm__head"],
    ["features/openings/openings.css", ".op-person__head"],
    ["features/relay/board/board.css", ".rjn__head"],
    ["features/relay/board/board.css", ".rsy__head"],
  ])("%s %s", (file, sel) => {
    const head = merged(file, sel);
    expect(head.background).toBe("transparent");
    expect(head["border-bottom"]).toBe("0");
  });

  it("the Context Panel's head casts the shelf over the body that scrolls under it, instead of a rule", () => {
    const head = merged("features/relay/board/relay.css", ".cp__head");
    expect(head["border-bottom"]).toBe("0");
    expect(head["box-shadow"]).toBe("var(--st-shelf)");
    expect(head.position).toBe("relative");
    expect(Number(head["z-index"])).toBeGreaterThan(0);
  });

  it("a head with no foot of its own still has one where it is all the card shows (folded)", () => {
    expect(merged("features/admin/overview/overview.css", ".adm-ov__panel--folded .adm-panel__head")["padding-bottom"]).toBe("16px");
    expect(merged("features/equipment/equipment.css", ".eq-card__head--button").padding).toBe("12px 14px");
  });

  it("under a head, the body starts 12px below the title", () => {
    for (const [file, sel] of [
      ["features/settings/settings.css", ".stg-card__body"],
      ["features/trainer-profile/trainer-profile.css", ".tp-card__head + .tp-card__body"],
      ["features/admin/admin.css", ".adm-panel__head + .adm-panel__body"],
      ["features/equipment/equipment.css", ".eq-card__head + .eq-card__body"],
      ["features/calendar/calendar.css", ".cal-card__head + .cal-card__body"],
    ]) {
      const body = merged(file, sel);
      expect(body["padding-top"] ?? body.padding.split(" ")[0], sel).toBe("12px");
    }
  });
});

/* ------------------------------------------------------------------ */
/* 3. The panel-title voice and the label voice                         */
/* ------------------------------------------------------------------ */

const PANEL_TITLES: [file: string, sel: string, p: string, ground?: string][] = [
  ["features/settings/settings.css", ".stg-card__title", "eq"],
  ["features/trainer-profile/trainer-profile.css", ".tp-card__title", "tp"],
  ["features/admin/admin.css", ".adm-panel__title", "adm"],
  ["features/equipment/equipment.css", ".eq-card__title", "eq"],
  ["features/calendar/calendar.css", ".cal-card__title", "cal"],
  ["features/wiki/wiki.css", ".wk__h2", "wk"],
  ["features/briefing/briefing.css", ".br-section__title", "br"],
  ["features/relay/board/relay.css", ".cp__title", "st"],
  ["features/admin/shell/ops.css", ".ops-case__t", "adm"],
  ["features/routines/routines.css", ".rt-changes__title", "eq"],
  ["features/learning/learning.css", ".lh__tile-label", "wk", "var(--wk-surface-2)"],
  ["features/studio-tasks/studio-hub.css", ".sh__strip-title", "st"],
];

describe("a card's title speaks the panel-title voice: Geist 17/700 in ink, -0.01em, its own capitalisation", () => {
  it.each(PANEL_TITLES)("%s %s", (file, sel, p, ground) => {
    const t = merged(file, sel);
    expect(t["font-size"]).toBe("17px");
    expect(t["font-weight"]).toBe("700");
    expect(t["letter-spacing"]).toBe("-0.01em");
    expect(t["text-transform"] ?? "none").toBe("none");
    expect(t["font-style"]).toBeUndefined();
    expect(t["font-family"]).toBeUndefined();
    expect(t.color).toBe(`var(--${p}-ink)`);
    for (const [mode, map] of Object.entries(MODES)) {
      expect(ratio(resolve(map, t.color), resolve(map, ground ?? `var(--${p}-surface)`)), mode).toBeGreaterThanOrEqual(4.5);
    }
  });
});

const LABELS: [file: string, sel: string, p: string][] = [
  ["features/relay/board/relay.css", ".cp__kicker", "st"],
  ["features/relay/board/relay.css", ".shr__label", "st"],
  ["features/relay/board/relay.css", ".fm__group-title", "st"],
  ["features/admin/overview/overview.css", ".adm-ov__needs-title", "adm"],
  ["features/admins/admins.css", ".hq-grouphead__title", "adm"],
  ["features/admins/admins.css", ".hq-settings__title", "adm"],
  ["features/admins/admins.css", ".hq-search__grouptitle", "adm"],
];

describe("a head over a list speaks the label voice: 14/700 in ink-2, its own capitalisation", () => {
  it.each(LABELS)("%s %s", (file, sel, p) => {
    const t = merged(file, sel);
    expect(t["font-size"]).toBe("14px");
    expect(t["font-weight"]).toBe("700");
    expect(t["letter-spacing"]).toBe("0");
    expect(t["text-transform"]).toBe("none");
    expect(t.color).toBe(`var(--${p}-ink-2)`);
    for (const [mode, map] of Object.entries(MODES)) {
      expect(ratio(resolve(map, t.color), resolve(map, `var(--${p}-surface)`)), mode).toBeGreaterThanOrEqual(4.5);
      expect(ratio(resolve(map, t.color), resolve(map, `var(--${p}-bg)`)), `${mode} on the page`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("the infobox's head takes the label voice in its own tint's ink", () => {
    const t = merged("features/wiki/wiki.css", ".wk__infobox-head");
    expect(t["font-size"]).toBe("14px");
    expect(t["font-weight"]).toBe("700");
    expect(t["text-transform"]).toBe("none");
  });

  it("the eyebrow over the Admins headline is the one capitals style: 12/700 at 0.08em, in ink-2", () => {
    const e = merged("features/admins/admins.css", ".hq-home__eyebrow");
    expect(e["font-size"]).toBe("12px");
    expect(e["font-weight"]).toBe("700");
    expect(e["letter-spacing"]).toBe("0.08em");
    expect(e["text-transform"]).toBe("uppercase");
    expect(e.color).toBe("var(--adm-ink-2)");
  });

  it("the meta beside a title leaves the small capitals", () => {
    for (const [file, sel, size] of [
      ["features/studio-tasks/studio-tasks.css", ".stm__hint", "12px"],
      ["features/briefing/briefing.css", ".br__optional", "12px"],
      ["features/calendar/calendar.css", ".cal-card__note", "12px"],
      ["features/learning/learning.css", ".lh__tile-count", "12px"],
      ["features/admin/shell/ops.css", ".ops-fact__k", "12px"],
    ]) {
      const m = merged(file, sel);
      expect(m["font-size"], sel).toBe(size);
      expect(m["text-transform"] ?? "none", sel).toBe("none");
    }
  });
});

describe("an icon leading a title sits in a 32px tinted square, the glyph 18px in it", () => {
  it.each([
    ["features/settings/settings.css", ".stg-card__icon", "eq"],
    ["features/admin/admin.css", ".adm-panel__title > svg", "adm"],
    ["features/studio-tasks/studio-tasks.css", ".stm__head > svg", "st"],
    ["features/briefing/briefing.css", ".br-section__title > svg", "br"],
    ["features/wiki/wiki.css", ".wk__h2 > svg", "wk"],
  ])("%s %s", (file, sel, p) => {
    const sq = merged(file, sel);
    expect(sq["box-sizing"]).toBe("border-box");
    expect(sq.width).toBe("32px");
    expect(sq.height).toBe("32px");
    expect(sq.padding).toBe("7px");
    expect(sq["border-radius"]).toBe("10px");
    expect(sq.background).toBe(`var(--${p}-surface-2)`);
    expect(sq.color).toBe(`var(--${p}-ink-2)`);
    for (const [mode, map] of Object.entries(MODES)) {
      expect(ratio(resolve(map, sq.color), resolve(map, sq.background)), `${mode}: the glyph`).toBeGreaterThanOrEqual(3);
    }
  });

  it("the orange-flagged card's square is orange", () => {
    const sq = merged("features/settings/settings.css", ".stg-card--accent .stg-card__icon");
    expect(sq.background).toBe("var(--eq-hero-fill)");
    expect(sq.color).toBe("var(--eq-hero-text)");
  });
});

/* ------------------------------------------------------------------ */
/* 4. A coloured rule is a straight band, never a crescent              */
/* ------------------------------------------------------------------ */

/** [file, selector, the property that paints the band, the band's start]. */
const BANDS: [string, string, "background" | "background-image", RegExp][] = [
  ["features/settings/settings.css", ".stg-card--accent", "background", /^linear-gradient\(var\(--eq-hero\), var\(--eq-hero\)\) top \/ 100% 3px no-repeat border-box, /],
  ["features/learning/learning.css", ".lh__hero", "background", /^linear-gradient\(var\(--wk-hero\), var\(--wk-hero\)\) top \/ 100% 3px no-repeat border-box, /],
  ["features/learning/learning.css", ".lh__tile-head", "background", /^linear-gradient\(var\(--wk-accent, var\(--wk-border-strong\)\), [^]*?\) top \/ 100% 3px no-repeat, var\(--wk-accent-fill/],
  ["features/wiki/wiki.css", ".wk__infobox-head", "background", /^linear-gradient\(var\(--wk-accent, var\(--wk-border-strong\)\), [^]*?\) top \/ 100% 3px no-repeat, var\(--wk-accent-fill/],
  ["features/wiki/wiki.css", ".wk__cat", "background", /^linear-gradient\([^]*\) left \/ 3px 100% no-repeat border-box, var\(--wk-surface\) padding-box$/],
  ["features/wiki/wiki.css", ".wk__linkcard", "background", /^linear-gradient\([^]*\) left \/ 3px 100% no-repeat border-box, var\(--wk-surface\) padding-box$/],
  ["features/admin/shell/ops.css", ".ops-stop", "background", /^linear-gradient\(var\(--ops-stop-band\), var\(--ops-stop-band\)\) top \/ 100% 4px no-repeat border-box, /],
  ["features/admin/shell/ops.css", ".ops-stop--inactive", "background", /^repeating-linear-gradient\(90deg, var\(--adm-border-strong\) 0 6px, transparent 6px 10px\) top \/ 100% 4px no-repeat border-box, /],
  ["features/admin/shell/ops.css", ".ops-stop--on", "background", /^linear-gradient\(var\(--ops-stop-band\), var\(--ops-stop-band\)\) top \/ 100% 4px no-repeat border-box, var\(--adm-live-fill\) padding-box$/],
  ["features/subjective-report/subjective-report.css", ".sr-ragrid__cell", "background", /^linear-gradient\(var\(--sr-cell-band\), var\(--sr-cell-band\)\) top \/ 100% 5px no-repeat border-box, /],
  ["features/subjective-report/subjective-report.css", ".sra-ends__cell", "background", /^linear-gradient\(var\(--sr-cell-band\), var\(--sr-cell-band\)\) top \/ 100% 4px no-repeat border-box, /],
  ["features/client-profile/profile-nav.css", ".ptab-cue", "background", /^linear-gradient\(var\(--eq-hero\), var\(--eq-hero\)\) top \/ 100% 3px no-repeat, var\(--eq-hero-fill\)$/],
  ["features/briefing/briefing.css", ".br-safe", "background", /^linear-gradient\(var\(--br-safe-band\), var\(--br-safe-band\)\) left \/ 4px 100% no-repeat border-box, var\(--br-surface\) padding-box$/],
  ["features/relay/notes/notes.css", '.pn__card[aria-current="true"]', "background", /^linear-gradient\(var\(--st-live\), var\(--st-live\)\) left \/ 3px 100% no-repeat border-box, var\(--st-surface\) padding-box$/],
  ["features/relay/board/relay.css", ".fm__tile--flagged", "background-image", /^linear-gradient\(var\(--st-flag\), var\(--st-flag\)\)$/],
];

describe("a coloured rule on a rounded box is a straight band painted as a background layer", () => {
  it.each(BANDS)("%s %s", (file, sel, prop, start) => {
    const own = merged(file, sel);
    expect(own[prop]).toMatch(start);
    // Never a border wider than 1px, nor an inset bar, on the rule itself.
    for (const r of rulesOf(file).filter((r) => r.selectors.includes(sel))) {
      for (const side of ["border-top", "border-left", "border-top-width", "border-left-width"]) {
        for (const v of declared(r.body, side)) expect(parseFloat(v) || 0, `${sel} ${side}: ${v}`).toBeLessThanOrEqual(1);
      }
      for (const v of declared(r.body, "box-shadow")) expect(v, sel).not.toMatch(/inset [2-9]\d*px 0 0|inset \d{2,}px 0 0/);
    }
  });

  it.each([
    ["features/admin/shell/ops.css", ".ops-stop--new", "--ops-stop-band", "var(--adm-live)"],
    ["features/admin/shell/ops.css", ".ops-stop--steady", "--ops-stop-band", "var(--adm-ok)"],
    ["features/admin/shell/ops.css", ".ops-stop--drifting", "--ops-stop-band", "var(--adm-warn)"],
    ["features/admin/shell/ops.css", ".ops-stop--lapsed", "--ops-stop-band", "var(--adm-ink-faint)"],
    ["features/subjective-report/subjective-report.css", ".sr-ragrid__cell--green", "--sr-cell-band", "var(--sr-green)"],
    ["features/subjective-report/subjective-report.css", ".sr-ragrid__cell--yellow", "--sr-cell-band", "var(--sr-yellow)"],
    ["features/subjective-report/subjective-report.css", ".sr-ragrid__cell--red", "--sr-cell-band", "var(--sr-red)"],
    ["features/subjective-report/subjective-report.css", ".sra-ends__cell--bad", "--sr-cell-band", "var(--sr-red)"],
    ["features/subjective-report/subjective-report.css", ".sra-ends__cell--good", "--sr-cell-band", "var(--sr-green)"],
    ["features/briefing/briefing.css", ".br-safe--clear", "--br-safe-band", "var(--br-ok)"],
  ])("each state names its band's colour: %s %s", (file, sel, prop, value) => {
    expect(merged(file, sel)[prop]).toBe(value);
  });

  it("the stop's and the cells' words stay where they were: the band's extra height is in the padding", () => {
    expect(merged("features/admin/shell/ops.css", ".ops-stop").padding).toBe("13px 12px 10px");
    expect(merged("features/subjective-report/subjective-report.css", ".sr-ragrid__cell").padding).toBe("15.5px 12px 12px");
    expect(merged("features/subjective-report/subjective-report.css", ".sra-ends__cell").padding).toBe("11px 10px 8px");
  });
});

/* ------------------------------------------------------------------ */
/* 5. Presses, no shadow transitions, no raw black                      */
/* ------------------------------------------------------------------ */

describe("a tappable panel or door presses in with a transform", () => {
  it.each([
    ["features/relay/notes/notes.css", ".pn__card:active", "st"],
    ["features/relay/board/relay.css", ".fm__tile:active", "st"],
    ["features/relay/board/relay.css", ".fm__head:active", "st"],
    ["features/admins/admins.css", ".hq-launch:active", "adm"],
  ])("%s %s", (file, sel, p) => {
    const press = merged(file, sel);
    expect(press.transform).toBe("translateY(1px)");
    expect(press["box-shadow"]).toBe(`var(--${p}-press)`);
  });

  it("the Floor Map's door is raised on its 3:1 edge (AJ's 2A)", () => {
    const door = merged("features/relay/board/relay.css", ".fm__head");
    expect(door.border).toBe("1px solid var(--st-border-strong)");
    expect(door.background).toBe("var(--st-raised)");
    expect(door["box-shadow"]).toBe("var(--st-elev-1), inset 0 1px 0 var(--st-highlight)");
    expect(door["border-radius"]).toBe("12px");
    for (const [mode, map] of Object.entries(MODES)) {
      expect(ratio(resolve(map, "var(--st-border-strong)"), resolve(map, "var(--st-raised)")), mode).toBeGreaterThanOrEqual(3);
    }
  });

  it.each([
    ["features/admins/admins.css", ".hq-launch"],
    ["features/routines/routines.css", ".rt-changes__head"],
    ["features/equipment/equipment.css", ".eq-card__head--button"],
  ])("a hover that changes a fill is a pointer's only: %s %s", (file, sel) => {
    const hovers = rulesOf(file).filter((r) => r.selectors.some((s) => s.startsWith(sel) && s.includes(":hover")));
    expect(hovers.length, `${sel} has a hover`).toBeGreaterThan(0);
    for (const r of hovers) expect(r.at.some((a) => /hover:\s*hover/.test(a)), r.selectors.join(", ")).toBe(true);
  });
});

/** The stylesheets phase 10 touched. */
const FILES = [...new Set([...PANELS, ...BANDS.map(([file]) => ({ file }))].map((x) => x.file))].concat([
  "features/relay/board/ask.css",
  "features/standing-week/standing-week.css",
  "features/my-studio/my-studio.css",
  "features/comments/comments.css",
  "features/clinical-review/clinical-review.css",
]);

describe("nothing here animates a shadow, and no shadow here is raw black", () => {
  it.each([...new Set(FILES)])("%s", (file) => {
    const animated = rulesOf(file)
      .filter((r) => declared(r.body, "transition").some((t) => /box-shadow|(^|[\s,])all\b/.test(t)))
      .map((r) => r.selectors.join(", "));
    expect(animated).toEqual([]);
    const black = rulesOf(file)
      .filter((r) => declared(r.body, "box-shadow").some((v) => /rgba?\(\s*0\s*,\s*0\s*,\s*0|rgb\(0 0 0|\bblack\b/.test(v)))
      .map((r) => r.selectors.join(", "));
    expect(black).toEqual([]);
  });

  it("the Deep Dive's tooltip and the Pulse's sheet lift in the logo's navy", () => {
    expect(merged("features/clinical-review/clinical-review.css", ".cr-tooltip")["box-shadow"]).toBe("var(--cr-elev-4)");
    expect(merged("features/subjective-report/subjective-report.css", ".pq-dialog__panel")["box-shadow"]).toBe("var(--elev-4-up)");
  });
});

describe("the parser itself", () => {
  it("reads a rule inside @media with its context, and merges in source order", () => {
    const rules = parse(".a { color: red; } @media (hover: hover) { .a:hover { background: blue; } } .a { color: green; }");
    expect(rules).toHaveLength(3);
    expect(rules[1]).toMatchObject({ selectors: [".a:hover"], at: ["@media (hover: hover)"] });
    expect(declared(rules[0].body, "color")).toEqual(["red"]);
  });
});
