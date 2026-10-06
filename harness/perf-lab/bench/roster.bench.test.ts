/**
 * Micro-benchmark: one client's document changes in a 300- and a 1,500-client
 * roster snapshot. Before: every document through data() (here a
 * structuredClone of a client the size of the lab's, about 14 KB, standing in
 * for the SDK's conversion). After: rosterFromSnapshot, one document.
 *   TZ=America/New_York npx vitest run harness/perf-lab/bench/roster
 * Only the conversion is measured; what it saves downstream (rows, cards and
 * models keyed on a client's identity) is the Directory's bench.
 */
import { describe, it, expect } from "vitest";
import { rosterFromSnapshot } from "../../../src/lib/studio-roster";
import type { Client } from "../../../src/types";

function fakeClient(i: number): Record<string, unknown> {
  const metrics: Record<string, unknown> = {};
  for (let m = 0; m < 20; m++) {
    metrics[`machine-${m}`] = { lastPerformedDate: "2026-09-01", weight: 100 + m, reps: 8, seat: "4", back: "2", notes: "x".repeat(200) };
  }
  return { firstName: `Client${i}`, lastName: "Example", homeStudioId: "lab", currentMachineMetrics: metrics, machineStats: { ...metrics } };
}

describe("one write in the roster", () => {
  for (const size of [300, 1500]) {
    it(`${size} clients`, () => {
      const data = Array.from({ length: size }, (_, i) => fakeClient(i));
      const docs = data.map((d, i) => ({ id: `c${i}`, data: () => structuredClone(d) }));
      const t0 = performance.now();
      const before = docs.map((d) => ({ id: d.id, ...(d.data() as object) }) as Client);
      const fullMs = performance.now() - t0;
      const first = rosterFromSnapshot(docs, null, new Map(), []);
      const t1 = performance.now();
      const after = rosterFromSnapshot(docs, new Set(["c7"]), first.byId, first.list);
      const oneMs = performance.now() - t1;
      // eslint-disable-next-line no-console
      console.log(`${size} clients: every document ${fullMs.toFixed(1)} ms; only the changed one ${oneMs.toFixed(2)} ms`);
      expect(after.list.length).toBe(before.length);
      expect(after.list[0]).toBe(first.list[0]);
    });
  }
});
