/**
 * WHAT THE FIRST SCREEN MAY NOT IMPORT (the speed round, Oct 5 2026, R13).
 *
 * Everything src/main.tsx imports statically, directly or through anything
 * else it imports, is downloaded and parsed on every iPad before Journey can
 * draw its first screen. The bundle diet took these off it; each came back
 * once through a single import nobody noticed, so this walks the import graph
 * from main.tsx and names the edge if one returns. The size itself is held by
 * scripts/check-bundle-budget.mjs on a real build (CI runs it); this test is
 * the early, exact warning that needs no build.
 *
 * If it fails: import the thing lazily (React.lazy inside a LoadBoundary, or
 * a dynamic import() where it is used), or move the small piece the first
 * screen needs into a leaf module, as client-story/first-visit.ts was.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = dirname(fileURLToPath(import.meta.url));

/** Packages and src files (relative to src, with "/") the first screen must not reach. */
const NEVER_ON_THE_FIRST_SCREEN: Record<string, string> = {
  "motion/react": "the shell moves with CSS; motion's whole runtime stays with the lazy screens",
  "framer-motion": "as motion/react",
  "firebase/functions": "loaded when Admins -> System tools' button is pressed",
  recharts: "charts are on lazy screens only",
  "features/client-story/story.ts": "the codex Story's graph; the Hub needs only client-story/first-visit.ts",
  "lib/migration-utils.ts": "the console repair loads when it is called",
  "components/AccessRequestView.tsx": "lazy: only someone signed in with no trainer record sees it",
  "components/CreateClientModal.tsx": "lazy: opened only to add a client by hand",
  "components/WorkoutTrackerView.tsx": "lazy (and warmed up once the Hub is quiet)",
  "components/ClientProfileView.tsx": "lazy (and warmed up once the Hub is quiet)",
  "features/journey-grid/journey-grid.css": "the session's stylesheet comes with the session",
  "features/equipment/equipment.css": "comes with the machine sheet's components",
  "features/calendar/calendar.css": "comes with the calendar",
  "features/subjective-report/subjective-report.css": "comes with Pulse",
  "features/catalog/catalog.css": "comes with the Catalog",
  "features/studio-tasks/studio-tasks.css": "comes with Studio To-Do's components",
};

const IMPORT_RE =
  /(?:^|\n)\s*(?:import|export)\s+(type\s+)?([^;"'`]*?)\s*from\s*["']([^"']+)["']|(?:^|\n)\s*import\s+["']([^"']+)["']/g;

/** The static, non-type imports of a src file: src-relative paths, or bare package names. */
function importsOf(rel: string): string[] {
  if (!/\.(ts|tsx)$/.test(rel)) return [];
  const text = readFileSync(join(SRC, rel), "utf8");
  const out: string[] = [];
  for (const m of text.matchAll(IMPORT_RE)) {
    const spec = m[4] ?? m[3];
    if (!m[4]) {
      if (m[1]) continue; // import type
      const named = /^\{([\s\S]*)\}$/.exec(m[2].trim());
      if (named) {
        const parts = named[1].split(",").map((s) => s.trim()).filter(Boolean);
        if (parts.length && parts.every((p) => p.startsWith("type "))) continue;
      }
    }
    if (!spec.startsWith(".") && !spec.startsWith("@/")) {
      out.push(spec);
      continue;
    }
    const base = spec.startsWith("@/") ? join(SRC, spec.slice(2)) : join(dirname(join(SRC, rel)), spec);
    for (const ext of ["", ".ts", ".tsx", "/index.ts", "/index.tsx"]) {
      const candidate = base + ext;
      if (/\.(ts|tsx|css)$/.test(candidate) && existsSync(candidate)) {
        out.push(relative(SRC, candidate).replace(/\\/g, "/"));
        break;
      }
    }
  }
  return out;
}

/** Every file and package reachable from main.tsx, with the file that first imported it. */
function firstScreen(): Map<string, string | null> {
  const via = new Map<string, string | null>([["main.tsx", null]]);
  const stack = ["main.tsx"];
  while (stack.length) {
    const file = stack.pop()!;
    for (const next of importsOf(file)) {
      if (via.has(next)) continue;
      via.set(next, file);
      stack.push(next);
    }
  }
  return via;
}

function chain(via: Map<string, string | null>, end: string): string {
  const path: string[] = [];
  for (let at: string | null | undefined = end; at; at = via.get(at)) path.unshift(at);
  return path.join(" -> ");
}

describe("the first screen", () => {
  const via = firstScreen();

  it("is walked from main.tsx (the walk finds the shell)", () => {
    expect(via.has("App.tsx")).toBe(true);
    expect(via.has("AppContent.tsx")).toBe(true);
    expect(via.has("components/ClientsView.tsx")).toBe(true);
    expect(via.has("features/client-story/first-visit.ts")).toBe(true);
    expect(via.has("react")).toBe(true);
  });

  for (const [what, why] of Object.entries(NEVER_ON_THE_FIRST_SCREEN)) {
    it(`does not import ${what} (${why})`, () => {
      const reached = via.has(what);
      expect(reached, reached ? chain(via, what) : "").toBe(false);
    });
  }
});
