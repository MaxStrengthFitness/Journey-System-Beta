import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * MACHINES AND STUDIO IMPORT EVERY STYLESHEET THEY DRAW WITH — a scan of the
 * source, like features/ford/ford-css.test.ts.
 *
 * Voice review follow-up, Sep 27 2026. The app is split into chunks, and a
 * stylesheet arrives with the chunk that imports it. MachinesSection drew
 * with My Studio's page (.ms__*), Relay's frame (.pl__frame, .pl__body) and
 * the machine's door (.cp, the Context Panel) but imported only admin.css:
 * the rest came with MyStudioView. Operations → Floor mounts the same
 * section without My Studio's shell, so on an iPad that had not opened My
 * Studio yet the section lost its spacing and the door had no width. No
 * test could see it, because tests load no stylesheets.
 *
 * So each of these components must import every one of these stylesheets it
 * names a class from, rather than rely on a sibling in the same chunk today.
 */

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel: string) => readFileSync(join(SRC, rel), "utf8");

/** The stylesheets checked, by the path an import ends with. */
const SHEETS = {
  "my-studio.css": "features/my-studio/my-studio.css",
  "planner.css": "features/relay/planner.css",
  "relay.css": "features/relay/board/relay.css",
  "admin.css": "features/admin/admin.css",
  "openings.css": "features/openings/openings.css",
} as const;
type Sheet = keyof typeof SHEETS;

/** The components held: the ones mounted outside My Studio's shell, and the sections beside them. */
const HOSTS = [
  "features/my-studio/MachinesSection.tsx",
  "features/my-studio/StudioSection.tsx",
  "features/my-studio/InBodyVariationPanel.tsx",
  "features/my-studio/TeamSection.tsx",
  // The one header (Relay room, Sep 28 2026): its rules are My Studio's own.
  "features/my-studio/StudioHeader.tsx",
  "features/relay/board/ContextPanel.tsx",
  // Openings (Openings round, Sep 27 2026): the section and each of its
  // parts, since the Wrap-up's "Times with room" reuses pieces of it outside
  // My Studio's shell.
  "features/openings/ui/OpeningsSection.tsx",
  "features/openings/ui/UsualWeekPart.tsx",
  "features/openings/ui/TimeSheet.tsx",
  "features/openings/ui/NextDaysPart.tsx",
  "features/openings/ui/NewRegularPart.tsx",
  "features/openings/ui/WhoseChips.tsx",
  "features/openings/ui/WhosInPart.tsx",
  "features/openings/ui/MarkThisTime.tsx",
] as const;

/**
 * The classes a stylesheet DEFINES: the first class of each selector, so
 * `.pl .st__scroll` counts toward `.pl`'s sheet and not `.st__scroll`'s.
 */
function definedBy(sheet: Sheet): Set<string> {
  const css = read(SHEETS[sheet]).replace(/\/\*[\s\S]*?\*\//g, "");
  const out = new Set<string>();
  for (const m of css.matchAll(/([^{}]+)\{[^{}]*\}/g)) {
    const prelude = m[1].trim();
    if (prelude.startsWith("@")) continue;
    for (const sel of prelude.split(",")) {
      const first = /^\.([A-Za-z][\w-]*)/.exec(sel.trim());
      if (first) out.add(first[1]);
    }
  }
  return out;
}

/** Class-list words a component writes: in a string, a template or a className. */
function classWords(text: string): Set<string> {
  const out = new Set<string>();
  for (const m of text.matchAll(/(?:^|["'`\s{])([a-z][\w-]*)(?=["'`\s$}]|$)/g)) out.add(m[1]);
  return out;
}

function imports(text: string, sheet: string): boolean {
  return new RegExp(`^\\s*import\\s+["'][^"']*/${sheet.replace(".", "\\.")}["'];?\\s*$`, "m").test(text);
}

const DEFINED = Object.fromEntries((Object.keys(SHEETS) as Sheet[]).map((s) => [s, definedBy(s)])) as Record<Sheet, Set<string>>;

describe("My Studio's Machines and Studio sections, and the Context Panel", () => {
  it("the scan reads what it should", () => {
    expect(DEFINED["my-studio.css"].has("ms__page")).toBe(true);
    expect(DEFINED["my-studio.css"].has("ms__door")).toBe(true);
    expect(DEFINED["planner.css"].has("pl__body")).toBe(true);
    expect(DEFINED["relay.css"].has("pl__frame")).toBe(true);
    expect(DEFINED["relay.css"].has("cp")).toBe(true);
    // `.pl .st__scroll` in relay.css does not make .st__scroll relay.css's.
    expect(DEFINED["relay.css"].has("st__scroll")).toBe(false);
    expect(imports('import "./my-studio.css";', "my-studio.css")).toBe(true);
    expect(imports('import "../relay/board/relay.css";', "relay.css")).toBe(true);
    expect(imports("// relay.css comes with the shell", "relay.css")).toBe(false);
  });

  for (const host of HOSTS) {
    it(`${host} imports every stylesheet it draws with`, () => {
      const text = read(host);
      const words = classWords(text);
      for (const sheet of Object.keys(SHEETS) as Sheet[]) {
        const used = [...words].filter((w) => DEFINED[sheet].has(w));
        if (used.length === 0) continue;
        expect(imports(text, sheet), `${host} draws with ${used.join(", ")} but does not import ${sheet}`).toBe(true);
      }
    });
  }

  it("MyStudioView imports the stylesheet that holds its header's portrait rule itself", () => {
    // `.ms > .msh--relay` (the one header's two rows on an upright iPad; it
    // was `.ms > .pl__mast` until the Relay room, Sep 28 2026) is My
    // Studio's own, in my-studio.css. It must not reach My Studio only
    // because a section happens to share its chunk: a lazily loaded section
    // would take it away.
    expect(DEFINED["my-studio.css"].has("ms")).toBe(true);
    expect(DEFINED["openings.css"].has("ms")).toBe(false);
    const text = read("features/my-studio/MyStudioView.tsx");
    expect(classWords(text).has("ms")).toBe(true);
    expect(imports(text, "my-studio.css")).toBe(true);
  });

  it("draws Openings with Relay's second level and frame, and its own stylesheet", () => {
    expect(DEFINED["openings.css"].has("op-cell")).toBe(true);
    const words = classWords(read("features/openings/ui/OpeningsSection.tsx"));
    expect(words.has("pl__subbar")).toBe(true);
    expect(words.has("pl__frame")).toBe(true);
    expect(words.has("op__page")).toBe(true);
  });

  it("draws Machines with My Studio's page, Relay's frame and the Operations kit", () => {
    const words = classWords(read("features/my-studio/MachinesSection.tsx"));
    expect(words.has("ms__page")).toBe(true);
    expect(words.has("pl__body")).toBe(true);
    expect(words.has("pl__frame")).toBe(true);
  });

  it("gives the machine's door a width even with no My Studio shell around it (Operations → Floor)", () => {
    const css = read(SHEETS["relay.css"]).replace(/\/\*[\s\S]*?\*\//g, "");
    const cp = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].find((m) => m[1].trim() === ".cp");
    expect(cp?.[2]).toMatch(/width:\s*var\(--rl-panel-w,\s*\d+px\)/);
  });
});

/**
 * THE STYLESHEETS THE FIRST SCREEN NO LONGER LOADS (the speed round, Oct 5
 * 2026, R13).
 *
 * src/main.tsx used to import six screens' whole stylesheets (the session's
 * grid, the machine sheet, the calendar, the Pulse, the Catalog, Studio
 * To-Do), about 140 KB of rules every iPad parsed before it could draw the
 * Hub, which uses none of them. main.tsx now imports only index.css and the
 * feature TOKENS (custom properties other sheets read), and each component
 * imports the sheet it draws with. Nothing loads these sheets for a
 * component any more but the component itself, so a component that forgets
 * draws unstyled on an iPad that has not opened a sibling screen first.
 * Tests load no CSS; this scan is the only thing that can see it.
 */
const MOVED = {
  "journey-grid.css": "features/journey-grid/journey-grid.css",
  "equipment.css": "features/equipment/equipment.css",
  "calendar.css": "features/calendar/calendar.css",
  "subjective-report.css": "features/subjective-report/subjective-report.css",
  "catalog.css": "features/catalog/catalog.css",
  "studio-tasks.css": "features/studio-tasks/studio-tasks.css",
} as const;
type Moved = keyof typeof MOVED;

/**
 * The classes a moved sheet defines, by the first class of each selector, and
 * only names with a "-" or "_" in them: a bare root word (`.st`, `.sr`, `.eq`)
 * is also an everyday variable name in a script, and no component draws with
 * the root alone.
 */
function movedClasses(sheet: Moved): Set<string> {
  const css = read(MOVED[sheet]).replace(/\/\*[\s\S]*?\*\//g, "");
  const out = new Set<string>();
  for (const m of css.matchAll(/([^{}]+)\{[^{}]*\}/g)) {
    const prelude = m[1].trim();
    if (prelude.startsWith("@")) continue;
    for (const sel of prelude.split(",")) {
      const first = /^\.([A-Za-z][\w-]*)/.exec(sel.trim());
      if (first && /[-_]/.test(first[1])) out.add(first[1]);
    }
  }
  return out;
}

const MOVED_CLASSES = Object.fromEntries((Object.keys(MOVED) as Moved[]).map((s) => [s, movedClasses(s)])) as Record<Moved, Set<string>>;

/** Every script under src except tests, as paths relative to src with "/". */
function scripts(): string[] {
  return (readdirSync(SRC, { recursive: true }) as string[])
    .map((f) => f.replace(/\\/g, "/"))
    .filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f));
}

/** The relative imports of a script that are not type-only, resolved to src-relative paths. */
function staticImports(rel: string): string[] {
  const text = read(rel);
  const out: string[] = [];
  for (const m of text.matchAll(/(?:^|\n)\s*(?:import|export)\s+(type\s+)?([^;"'`]*?)\s*from\s*["'](\.[^"']+)["']/g)) {
    if (m[1]) continue;
    const named = /^\{([\s\S]*)\}$/.exec(m[2].trim());
    if (named) {
      const parts = named[1].split(",").map((s) => s.trim()).filter(Boolean);
      if (parts.length && parts.every((p) => p.startsWith("type "))) continue;
    }
    const base = join(dirname(join(SRC, rel)), m[3]);
    for (const ext of ["", ".ts", ".tsx", "/index.ts", "/index.tsx"]) {
      const candidate = relative(SRC, base + ext).replace(/\\/g, "/");
      if (/\.(ts|tsx)$/.test(candidate) && existsSync(join(SRC, candidate))) {
        out.push(candidate);
        break;
      }
    }
  }
  return out;
}

function closureOf(entry: string): Set<string> {
  const seen = new Set<string>();
  const stack = [entry];
  while (stack.length) {
    const f = stack.pop()!;
    if (seen.has(f)) continue;
    seen.add(f);
    stack.push(...staticImports(f));
  }
  return seen;
}

/** A cheap first look: a file that names none of the moved sheets' prefixes cannot draw with them. */
const MOVED_PREFIX = /(?:jg|eq|cal|sra?|pq|pcm|mcat|ssc|stq|stm|stu|st)[-_]/;

function missingMovedImports(rel: string): string[] {
  const text = read(rel);
  if (!MOVED_PREFIX.test(text)) return [];
  const words = classWords(text);
  const missing: string[] = [];
  for (const sheet of Object.keys(MOVED) as Moved[]) {
    const used = [...words].filter((w) => MOVED_CLASSES[sheet].has(w));
    if (used.length === 0) continue;
    if (!imports(text, sheet)) missing.push(`${rel} draws with ${used.slice(0, 4).join(", ")} but does not import ${sheet}`);
  }
  return missing;
}

describe("the screens' stylesheets come with the screens (the speed round, R13)", () => {
  it("main.tsx loads index.css and the feature tokens, and no screen's stylesheet", () => {
    const main = read("main.tsx");
    const sheets = [...main.matchAll(/^\s*import\s+["']([^"']+\.css)["'];?\s*$/gm)].map((m) => m[1]);
    expect(sheets[0]).toBe("./index.css");
    for (const sheet of sheets.slice(1)) expect(sheet, `main.tsx imports ${sheet}`).toMatch(/\.tokens\.css$/);
    // The six that moved, by name: none of them may come back.
    for (const sheet of Object.keys(MOVED)) expect(main).not.toContain(`/${sheet}'`);
  });

  it("the scan reads what it should", () => {
    expect(MOVED_CLASSES["journey-grid.css"].has("jg-sbar")).toBe(true);
    expect(MOVED_CLASSES["equipment.css"].has("eq-card")).toBe(true);
    expect(MOVED_CLASSES["calendar.css"].has("cal-shell")).toBe(true);
    expect(MOVED_CLASSES["subjective-report.css"].has("sr-btn")).toBe(true);
    expect(MOVED_CLASSES["catalog.css"].has("mcat-row")).toBe(true);
    expect(MOVED_CLASSES["studio-tasks.css"].has("st__btn")).toBe(true);
    // Root words are left out: `const st = ...` is not a class.
    expect(MOVED_CLASSES["studio-tasks.css"].has("st")).toBe(false);
    // The tokens left with the sheets: the moved sheets hold none.
    for (const sheet of ["subjective-report.css", "studio-tasks.css"] as const) {
      const css = read(MOVED[sheet]).replace(/\/\*[\s\S]*?\*\//g, "");
      expect(css, sheet).not.toMatch(/(^|\n)\s*:root\s*\{/);
    }
  });

  it("every component that draws with a moved sheet imports it", () => {
    const missing = scripts().flatMap(missingMovedImports);
    expect(missing).toEqual([]);
    // It reads every script under src, so it gets room when the full suite runs beside it.
  }, 60_000);

  it("holds the second door too: Operations → Floor mounts My Studio's Machines without My Studio's shell", () => {
    // AdminFloorTab mounts MachinesSection directly, so nothing My Studio's
    // view imports reaches it. Every component it reaches must bring its own.
    const reached = closureOf("features/admin/floor/AdminFloorTab.tsx");
    expect(reached.has("features/my-studio/MachinesSection.tsx")).toBe(true);
    const missing = [...reached].flatMap(missingMovedImports);
    // And My Studio's own sheets (the five above), for every component it reaches.
    for (const host of reached) {
      const text = read(host);
      const words = classWords(text);
      for (const sheet of Object.keys(SHEETS) as Sheet[]) {
        const used = [...words].filter((w) => DEFINED[sheet].has(w) && /[-_]/.test(w));
        if (used.length && !imports(text, sheet)) missing.push(`${host} draws with ${used.slice(0, 4).join(", ")} but does not import ${sheet}`);
      }
    }
    expect(missing).toEqual([]);
  }, 30_000);
});
