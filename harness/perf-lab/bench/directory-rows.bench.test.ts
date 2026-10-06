/**
 * Micro-benchmark: the Directory's row model after one client's write, for
 * 300 and 1,500 clients with eight weeks of bookings. Before: every row built
 * again. After: the row cache (row.ts), one row.
 *   TZ=America/New_York npx vitest run harness/perf-lab/bench/directory-rows
 * The React side (one row redrawn instead of all) is held by
 * ClientDirectory.rerender.render.test.tsx; this is the model's half only.
 */
import { describe, it, expect } from "vitest";
import { buildDirectoryRows, newDirectoryRowCache } from "../../../src/features/client-directory/row";
import { NOW, TODAY, eastern, makeBooking, makeClient, makeContext } from "../../../src/features/client-directory/fixtures";
import { addDays } from "../../../src/features/client-history/model";
import type { Client } from "../../../src/types";

function roster(size: number): Client[] {
  return Array.from({ length: size }, (_, i) => {
    const metrics: Record<string, unknown> = {};
    for (let m = 0; m < 20; m++) metrics[`m${m}`] = { lastPerformedDate: { seconds: NOW.getTime() / 1000 - (i % 40) * 86_400 - m * 3600, nanoseconds: 0 } };
    return makeClient({ id: `c${i}`, firstName: `First${i}`, lastName: `Last${i}`, lastSessionDate: addDays(TODAY, -(i % 40)), currentMachineMetrics: metrics as never });
  });
}

describe("the Directory's rows after one write", () => {
  for (const size of [300, 1500]) {
    it(`${size} clients`, () => {
      const clients = roster(size);
      const schedules = clients.flatMap((c, i) =>
        [0, 3, 7, 10].map((d) => makeBooking({ clientId: c.id as string, start: eastern(addDays(TODAY, d - 1), `${String(6 + (i % 12)).padStart(2, "0")}:00`) })),
      );
      const ctx = makeContext({ schedules });
      buildDirectoryRows(clients, ctx); // warm
      const t0 = performance.now();
      const all = buildDirectoryRows(clients, ctx);
      const fullMs = performance.now() - t0;

      const cache = newDirectoryRowCache();
      buildDirectoryRows(clients, ctx, cache);
      const changed = clients.map((c, i) => (i === 7 ? { ...c, lastSessionDate: TODAY } : c));
      const t1 = performance.now();
      const after = buildDirectoryRows(changed, ctx, cache);
      const oneMs = performance.now() - t1;
      // eslint-disable-next-line no-console
      console.log(`${size} clients, ${schedules.length} bookings: every row ${fullMs.toFixed(1)} ms; with the cache ${oneMs.toFixed(2)} ms`);
      expect(after.length).toBe(all.length);
    });
  }
});
