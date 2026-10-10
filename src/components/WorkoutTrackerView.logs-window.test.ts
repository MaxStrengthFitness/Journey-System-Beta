/**
 * The tracker's window of sets, as the Now Bar, the phone and the machine
 * menu read it (machine menu review, Oct 2026). Read from the source, as the
 * profile's tests are: the render test's Firestore fake answers as the
 * server, so it can't show a cache answer (WorkoutTrackerView.render.test.tsx
 * mounts the listener and holds that it still draws).
 *
 *   - The logs listener asks for metadata changes, so the window hears the
 *     server confirm what the cache already held, and a metadata-only event
 *     notes the window without rebuilding the sets.
 *   - Once the server has answered for a window, losing the Wi-Fi doesn't
 *     take it back to cache-only.
 *   - Only a window the server answered counts as every session read
 *     (`sessionsAllRead`): a cache-only one may be partial.
 *   - The card is cleared when its screen goes, so it never opens by itself
 *     at the next Start.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(join(__dirname, "WorkoutTrackerView.tsx"), "utf8");
const listener = (() => {
  const start = source.indexOf("const logsQuery = query(");
  return source.slice(start, source.indexOf("}, [logsPlanKey]);", start));
})();

describe("the logs window", () => {
  it("hears the server confirm the cache, and skips the sets on a metadata-only event", () => {
    expect(listener).toMatch(/onSnapshot\(\s*logsQuery,\s*\{ includeMetadataChanges: true \},/);
    expect(listener).toMatch(/if \(!first && snapshot\.docChanges\(\)\.length === 0\) \{\s*noteWindow\(/);
  });

  it("stays read once the server has answered for it", () => {
    expect(source).toMatch(/prev\.state === "ready" && state === "cache-only"/);
  });

  it("counts as every session read only when the server answered", () => {
    expect(source).toMatch(/const sessionsAllRead = logsWindow\?\.state === "ready" && !hasOlderToRead\(sessions, menuReadIds\);/);
  });

  // The floor round, Oct 9 2026, F1: the Wrap-up's Today lines and its journey count the
  // earlier sessions as known only once the server answered for them and their sets.
  it("lets the Wrap-up claim nothing about the past from a window the server never answered", () => {
    expect(source).toMatch(
      /const historyRead =\s*createdHere \|\| \(sessionsServerFor === selectedClient\.id && logsWindow\?\.state === "ready"\);/,
    );
    expect(source).toMatch(/const priorKnown =\s*historyRead &&/);
    expect(source).toMatch(/priorKnown,\s*\);/); // strengthJourney(rows, priorKnown)
  });

  it("closes the machine menu when its screen goes", () => {
    expect(source).toMatch(/if \(screen !== "tracker" && screen !== "watch"\) setMenuMachineId\(null\);/);
  });
});
