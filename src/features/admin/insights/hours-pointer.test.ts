import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * WHERE THE HOURS ARE (voice review follow-up, final review, Sep 27 2026).
 *
 * Operations had no Hours tab from the Operations overhaul: Hours was a view
 * inside Operations → Insights. Since the redesign's Operations room (Sep 28
 * 2026) it is a page of its own under Team: Operations → Team → Hours. A
 * pointer to a bare "Operations → Hours" was wrong then and is still wrong,
 * so none may come back. (Some sentences still say "Operations → Insights →
 * Hours" in folders another room owns tonight; the round document's "For the
 * integrator" lists them.)
 */
const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.(tsx?|md)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

describe("the pointer to Hours", () => {
  it("never names a bare Operations → Hours tab", () => {
    const stale = files(SRC)
      .filter((f) => /Operations (?:→|->) Hours/.test(readFileSync(f, "utf8")))
      .map((f) => relative(SRC, f));
    expect(stale).toEqual([]);
  });
});
