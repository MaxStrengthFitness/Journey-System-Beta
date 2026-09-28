import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
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

function imports(text: string, sheet: Sheet): boolean {
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
