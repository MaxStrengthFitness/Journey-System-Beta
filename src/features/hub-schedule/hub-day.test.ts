import { describe, expect, it } from "vitest";
import { studioTodayKey } from "../../lib/studio-time";
import { dayTitle, pickDay, shownDay, stripFrom } from "./hub-day";

describe("the Hub's day (hub fixes, Oct 1 2026)", () => {
  it("is the studio's Eastern day, not the iPad's or UTC's", () => {
    // 11:30 PM in Ohio is already tomorrow in UTC.
    expect(studioTodayKey(new Date("2026-10-01T23:30:00-04:00"))).toBe("2026-10-01");
    expect(studioTodayKey(new Date("2026-10-02T00:05:00-04:00"))).toBe("2026-10-02");
  });

  it("builds the week strip from today, across a month's end", () => {
    expect(stripFrom("2026-09-28")).toEqual(["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"]);
    expect(stripFrom("2026-12-30", 3)).toEqual(["2026-12-30", "2026-12-31", "2027-01-01"]);
  });

  it("left on today, moves to the new today at the studio's midnight", () => {
    const picked = pickDay("2026-10-01", "2026-10-01");
    expect(picked).toBeNull();
    expect(shownDay(picked, "2026-10-01")).toBe("2026-10-01");
    // The Hub left open overnight: the next morning it shows the new today.
    expect(shownDay(picked, "2026-10-02")).toBe("2026-10-02");
  });

  it("keeps a day the trainer picked on purpose, after midnight too", () => {
    const picked = pickDay("2026-10-03", "2026-10-01");
    expect(picked).toBe("2026-10-03");
    expect(shownDay(picked, "2026-10-02")).toBe("2026-10-03");
    // Tapping today again goes back to following today.
    expect(pickDay("2026-10-02", "2026-10-02")).toBeNull();
  });

  it("names the day in words, never shifted a day by the iPad's zone", () => {
    expect(dayTitle("2026-10-01")).toBe(new Date(2026, 9, 1).toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" }));
    expect(dayTitle("2026-10-01")).toContain("Thursday");
  });
});
