import { describe, expect, it } from "vitest";
import { planDayList, type DayBlock } from "./day-list";

const b = (key: string, columnId: string, from: number, staff = false): DayBlock => ({
  key,
  columnId,
  span: { from, to: from + 30 },
  staff,
});

const blocks = [
  b("c", "sam", 9 * 60),
  b("a", "aj", 8 * 60),
  b("b", "sam", 8 * 60),
  b("off", "aj", 12 * 60, true),
  b("d", "aj", 10 * 60),
];

describe("planDayList", () => {
  it("lists every booking earliest first, ties in the grid's column order", () => {
    const { rows } = planDayList({ blocks, columnOrder: ["aj", "sam"], mineOnly: null, nowMin: null });
    expect(rows.map((r) => r.key)).toEqual(["a", "b", "c", "d"]);
    const flipped = planDayList({ blocks, columnOrder: ["sam", "aj"], mineOnly: null, nowMin: null });
    expect(flipped.rows.map((r) => r.key)).toEqual(["b", "a", "c", "d"]);
  });

  it("never lists an Unavailable block", () => {
    const { rows } = planDayList({ blocks, columnOrder: ["aj", "sam"], mineOnly: null, nowMin: null });
    expect(rows.some((r) => r.staff)).toBe(false);
  });

  it("narrows to your own column on Me", () => {
    const { rows } = planDayList({ blocks, columnOrder: ["aj", "sam"], mineOnly: "aj", nowMin: null });
    expect(rows.map((r) => r.key)).toEqual(["a", "d"]);
  });

  it("puts Now before the first booking still to start, and nowhere on another day", () => {
    const cols = ["aj", "sam"];
    expect(planDayList({ blocks, columnOrder: cols, mineOnly: null, nowMin: 8 * 60 + 15 }).nowBefore).toBe(2);
    expect(planDayList({ blocks, columnOrder: cols, mineOnly: null, nowMin: 6 * 60 }).nowBefore).toBe(0);
    expect(planDayList({ blocks, columnOrder: cols, mineOnly: null, nowMin: 20 * 60 }).nowBefore).toBe(4);
    expect(planDayList({ blocks, columnOrder: cols, mineOnly: null, nowMin: null }).nowBefore).toBeNull();
  });

  it("keeps a booking in a column it doesn't know at the end of its minute", () => {
    const { rows } = planDayList({
      blocks: [b("x", "unassigned", 480), b("y", "aj", 480)],
      columnOrder: ["aj"],
      mineOnly: null,
      nowMin: null,
    });
    expect(rows.map((r) => r.key)).toEqual(["y", "x"]);
  });
});
