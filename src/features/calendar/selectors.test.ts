import { describe, expect, it } from "vitest";
import { visibleRange, weekDays } from "./selectors";

/** Local calendar anchors, the way the views build them. */
const local = (y: number, m: number, d: number) => new Date(y, m - 1, d);

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

describe("visibleRange", () => {
  it("covers the whole 42-cell month grid, leading and trailing days included", () => {
    // September 2026 starts on a Tuesday: the grid opens on Sun Aug 30 and
    // runs 42 cells to Sat Oct 10.
    const r = visibleRange("month", local(2026, 9, 15));
    expect(ymd(r.from)).toBe("2026-08-30");
    expect(ymd(r.to)).toBe("2026-10-10");
  });

  it("covers the same seven days weekDays draws", () => {
    const anchor = local(2026, 9, 15); // a Tuesday
    const days = weekDays(anchor);
    const r = visibleRange("week", anchor);
    expect(ymd(r.from)).toBe(ymd(days[0]));
    expect(ymd(r.to)).toBe(ymd(days[6]));
    expect(ymd(r.from)).toBe("2026-09-13");
    expect(ymd(r.to)).toBe("2026-09-19");
  });

  it("is a single day in day view", () => {
    const r = visibleRange("day", local(2026, 9, 15));
    expect(ymd(r.from)).toBe("2026-09-15");
    expect(ymd(r.to)).toBe("2026-09-15");
  });

  it("anchors at local noon so no timezone offset can move the day", () => {
    const r = visibleRange("day", local(2026, 9, 15));
    expect(r.from.getHours()).toBe(12);
    expect(r.to.getHours()).toBe(12);
  });
});
