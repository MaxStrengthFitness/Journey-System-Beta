/**
 * EVERY LAZY SCREEN HAS A BOUNDARY (new-version round, Sep 26 2026).
 *
 * A screen fetched on first use (React.lazy) is exactly what a deploy breaks:
 * its file is gone, and without a LoadBoundary around it the failure reaches
 * the whole-app error screen, or, inside the Active Session, takes the
 * session's screen with it. This lists every file in src that makes a lazy
 * screen, with where its boundary is. A new one fails here until someone has
 * put it inside a boundary and added it with its reason.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(__dirname, "..", "..");

const EXPECTED: Record<string, string> = {
  // Every screen, inside <main>'s one Suspense, which LoadBoundary kind="screen"
  // wraps; the calendar has a second one inside its own ErrorBoundary.
  "AppContent.tsx": 'kind="screen"',
  // Pulse, inside the Active Session: LoadBoundary kind="panel".
  "components/WorkoutTrackerView.tsx": 'kind="panel"',
};

function sourceFiles(dir: string): string[] {
  return (readdirSync(dir, { recursive: true }) as string[])
    .map((f) => f.replace(/\\/g, "/"))
    .filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f));
}

describe("lazy screens", () => {
  const files = sourceFiles(SRC).filter((f) => /\blazy\(/.test(readFileSync(join(SRC, f), "utf8")));

  it("are made only where a boundary is known to be around them", () => {
    expect(files.sort()).toEqual(Object.keys(EXPECTED).sort());
  });

  it("each such file puts its lazy screens inside a LoadBoundary", () => {
    for (const [file, kind] of Object.entries(EXPECTED)) {
      const text = readFileSync(join(SRC, file), "utf8");
      expect(text, relative(SRC, join(SRC, file))).toContain(`<LoadBoundary ${kind}`);
    }
  });

  it("the calendar's own error screen does not catch a missing file first", () => {
    const app = readFileSync(join(SRC, "AppContent.tsx"), "utf8");
    const calendar = app.slice(app.indexOf('currentView === "calendar"'), app.indexOf("<CalendarView"));
    expect(calendar).toContain('<LoadBoundary kind="screen">');
  });
});
