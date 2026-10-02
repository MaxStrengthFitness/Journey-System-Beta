import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * ONE BODY FIGURE (AJ, Oct 2 2026: "our model is pretty advanced, make sure
 * we are using the correct model that also is used in the catalog").
 *
 * The Catalog draws the body with `BodyModel` (this folder), the one wrapper
 * round react-muscle-highlighter's male and female figures. Checked on Oct 2
 * 2026: every figure in the app goes through it — the Catalog's machine page
 * and body lens (catalog/MachineFigure, catalog/BodyLens; the Catalog and All
 * MSF machines are the Learning tab's machine pages), the muscle picker in
 * the machine editor (MuscleSelector), the Routine Builder (RoutineFigure)
 * and the client codex's Where it matters (BodyFigure). The Academy's own
 * pages draw no figure; a machine's figure there is the Catalog's page.
 *
 * This holds it: nothing but BodyModel imports the figure library, and the
 * older react-body-highlighter (no female figure, wrong muscle names) never
 * comes back.
 */

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

describe("one body figure, the Catalog's", () => {
  const files = sourceFiles(SRC).map((f) => ({ path: relative(SRC, f).replace(/\\/g, "/"), text: readFileSync(f, "utf8") }));

  it("draws every figure through BodyModel: only it imports the figure library", () => {
    const importers = files.filter((f) => /from\s+["']react-muscle-highlighter["']/.test(f.text)).map((f) => f.path);
    expect(importers).toEqual(["components/anatomy/BodyModel.tsx"]);
  });

  it("never brings back the old figure", () => {
    const old = files.filter((f) => /["']react-body-highlighter["']/.test(f.text)).map((f) => f.path);
    expect(old).toEqual([]);
  });
});
