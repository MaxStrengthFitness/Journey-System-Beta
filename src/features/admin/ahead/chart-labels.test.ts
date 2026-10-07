import { describe, it, expect } from "vitest";
import { chartLabels } from "./AheadPeek";

describe("the client panel's chart labels never print over each other", () => {
  it("puts the end on top when it is clear of Today, and the talk underneath", () => {
    expect(chartLabels({ today: 1, end: 50, endWord: "Renews" }, 70)).toEqual([
      { key: "today", at: 9, row: "top" },
      { key: "end", at: 50, row: "top" },
      { key: "talk", at: 70, row: "bottom" },
    ]);
  });

  it("moves an end close to Today underneath, and leaves out a talk with no room", () => {
    // A renewal three weeks out: next to Today, so it goes below; a talk beside it has no room.
    expect(chartLabels({ today: 1, end: 12, endWord: "Renews" }, 20)).toEqual([
      { key: "today", at: 9, row: "top" },
      { key: "end", at: 12, row: "bottom" },
    ]);
  });

  it("keeps a label clear of the chart's edges", () => {
    expect(chartLabels({ today: 1, end: 99, endWord: "Ends" }, null).map((l) => l.at)).toEqual([9, 91]);
  });
});
