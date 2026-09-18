import { describe, expect, it } from "vitest";
import { rosterCoverage } from "./programming-summary";

const roster = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: undefined }];
const stats = {
  machineStats: { a: { timesPerformed: 4 }, b: { timesPerformed: 0 }, z: { timesPerformed: 9 } },
};

describe("rosterCoverage", () => {
  it("counts roster machines performed at least once when Journey holds the whole story", () => {
    expect(rosterCoverage(roster, stats, "complete")).toEqual({
      total: 3,
      performed: 1,
      neverTried: 2,
      coverage: "complete",
    });
  });

  it("trusts an empty rollup for a client who started here", () => {
    expect(rosterCoverage(roster, { machineStats: {} }, "complete")).toEqual({
      total: 3,
      performed: 0,
      neverTried: 3,
      coverage: "complete",
    });
  });

  it("quotes nothing for a client who trained before the cutover", () => {
    // Their machine history is in FileMaker and is not coming across: the
    // count here is not their lifetime, so it is not a number we may show.
    expect(rosterCoverage(roster, stats, "partial")).toEqual({
      total: 3,
      performed: null,
      neverTried: null,
      coverage: "partial",
    });
  });

  it("defaults to the cautious answer when nobody has said", () => {
    expect(rosterCoverage(roster, stats)).toEqual({
      total: 3,
      performed: null,
      neverTried: null,
      coverage: "unknown",
    });
    expect(rosterCoverage(roster, null)).toEqual({
      total: 3,
      performed: null,
      neverTried: null,
      coverage: "unknown",
    });
  });
});
