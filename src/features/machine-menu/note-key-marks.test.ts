import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { noteKey } from "./note-key";

/**
 * THE ONE NOTE KEY, OUTSIDE THE CARD (machine menu design §C, §F 12).
 *
 * The mark that says how loud a machine's loudest open note is, beside its
 * name on the Journey grid, on the phone's card and on All Machines' rail,
 * is drawn in the card's key: a Heads up plum (--eq-warn), Critical crimson
 * (--eq-alert) in the Hub's triangle. Never --jg-q-poor: the red kaizen mark
 * is rep quality's, and a note is told apart from it by shape and token. The
 * old rail chip (an orange go chip with a wrench, for the retired "Flag
 * maintenance" checkbox) is gone; the wrench is the Relay flag's alone.
 */

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const stylesheet = (path: string) =>
  readFileSync(join(SRC, path), "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/@import[^;]*;/g, "");

/** The declarations every plain rule naming exactly `selector` adds up to. */
function declared(css: string, selector: string): Record<string, string> {
  const out: Record<string, string> = {};
  let found = false;
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const heads = m[1].split(",").map((h) => h.trim().replace(/\s+/g, " "));
    if (!heads.includes(selector)) continue;
    found = true;
    for (const d of m[2].matchAll(/([\w-]+)\s*:\s*([^;]+);?/g)) out[d[1]] = d[2].trim();
  }
  if (!found) throw new Error(`no rule for ${selector}`);
  return out;
}

const MARKS: Array<[file: string, base: string, critical: string]> = [
  ["features/journey-grid/journey-grid.css", ".jg-machine__alert", '.jg-machine__alert[data-level="critical"]'],
  ["features/phone/phone.css", ".ph-card__alert", '.ph-card__alert[data-level="critical"]'],
  ["features/equipment/equipment.css", ".eq-note-dot--loud", '.eq-note-dot--loud[data-level="critical"]'],
];

describe("the one note key beside a machine's name, outside the card", () => {
  for (const [file, base, critical] of MARKS) {
    it(`${base} draws a Heads up plum and Critical crimson, never the kaizen red`, () => {
      const css = stylesheet(file);
      expect(declared(css, base).color).toBe("var(--eq-warn)");
      expect(declared(css, critical).color).toBe("var(--eq-alert)");
      expect(css).not.toMatch(/(jg-machine__alert|ph-card__alert|eq-note-dot)[^{]*\{[^}]*--jg-q-poor/);
    });
  }

  it("takes its colours from the key itself", () => {
    expect(noteKey("elevated").color).toBe("--eq-warn");
    expect(noteKey("critical").color).toBe("--eq-alert");
  });

  it("leaves no orange flag chip behind on the rail, and no red note glyph on the grid", () => {
    expect(stylesheet("features/equipment/equipment.css")).not.toContain(".eq-note-dot--flag");
    expect(stylesheet("features/journey-grid/journey-grid.css")).not.toContain(".jg-machine__note.is-alert");
  });
});
