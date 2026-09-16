import { describe, expect, it } from "vitest";
import { rosterCoverage } from "./programming-summary";

const roster = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: undefined }];

describe("rosterCoverage", () => {
  it("counts roster machines performed at least once", () => {
    const client = {
      machineStatsBackfilledAt: "2026-09-01",
      machineStats: { a: { timesPerformed: 4 }, b: { timesPerformed: 0 }, z: { timesPerformed: 9 } },
    };
    expect(rosterCoverage(roster, client)).toEqual({ total: 3, performed: 1, neverTried: 2 });
  });

  it("is unknown, not zero, before the backfill — even with some running totals", () => {
    expect(rosterCoverage(roster, { machineStats: { a: { timesPerformed: 1 } } })).toEqual({
      total: 3,
      performed: null,
      neverTried: null,
    });
    expect(rosterCoverage(roster, {})).toEqual({ total: 3, performed: null, neverTried: null });
    expect(rosterCoverage(roster, null)).toEqual({ total: 3, performed: null, neverTried: null });
  });

  it("trusts an empty rollup once the backfill has run", () => {
    expect(rosterCoverage(roster, { machineStats: {}, machineStatsBackfilledAt: "2026-09-01" })).toEqual({
      total: 3,
      performed: 0,
      neverTried: 3,
    });
  });
});
