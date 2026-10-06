/**
 * Micro-benchmark: the studio-time helpers in the loops Operations, the Hub
 * and the Directory run (one call per client, per booking, per session).
 *
 * Not part of the suite (it lives outside src/). Run it on its own:
 *   TZ=America/New_York npx vitest run harness/perf-lab/bench/studio-time
 * It prints milliseconds; the numbers are this PC's, at 1x.
 */
import { describe, it, expect } from "vitest";
import { studioDateKey, zonedHM, zonedYMD, startOfStudioDay, wallClockToInstant } from "../../../src/lib/studio-time";

const N = 50_000;
const ET = "America/New_York";
// Bookings spread over eight weeks, at 15-minute steps, like a studio's schedule.
const start = Date.UTC(2026, 8, 1, 10, 0, 0);
const instants = Array.from({ length: N }, (_, i) => new Date(start + (i % 5376) * 15 * 60_000));

function time(label: string, fn: () => void, calls = N): number {
  fn(); // warm
  const t0 = performance.now();
  fn();
  const ms = performance.now() - t0;
  // eslint-disable-next-line no-console
  console.log(`${label}: ${ms.toFixed(1)} ms for ${calls.toLocaleString()} calls`);
  return ms;
}

describe("studio-time, per-call cost", () => {
  it("measures", () => {
    let sink = 0;
    time("studioDateKey", () => { for (const d of instants) sink += studioDateKey(d, ET)!.length; });
    time("zonedYMD", () => { for (const d of instants) sink += zonedYMD(d, ET)!.day; });
    time("zonedHM", () => { for (const d of instants) sink += zonedHM(d, ET)!.minute; });
    time("startOfStudioDay", () => { for (let i = 0; i < 5000; i++) sink += startOfStudioDay(instants[i], ET).getTime() & 1; }, 5000);
    time("wallClockToInstant", () => { for (let i = 0; i < 5000; i++) sink += wallClockToInstant("2026-09-14T07:15:00", ET)!.getTime() & 1; }, 5000);
    expect(sink).toBeGreaterThan(0);
  });
});
