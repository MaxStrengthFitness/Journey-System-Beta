import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * WHERE THE HOURS ARE (voice review follow-up, final review, Sep 27 2026).
 *
 * Operations has had no Hours tab since the Operations overhaul: Hours is a
 * view inside Operations → Insights (InsightsAndHours). My Studio → Studio's
 * sentences were corrected in the round (relay-floor.render.test.tsx holds
 * them); Operations → Data's export card still sent a leader to
 * "Operations → Hours". No screen, comment or README in the app says it now.
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
  it("names Operations → Insights → Hours, never an Operations → Hours tab", () => {
    const stale = files(SRC)
      .filter((f) => /Operations (?:→|->) Hours/.test(readFileSync(f, "utf8")))
      .map((f) => relative(SRC, f));
    expect(stale).toEqual([]);
  });
});
