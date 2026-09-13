import { describe, expect, it } from "vitest";
import { bookedLabel, nextSessionHeadline } from "./next-session-tile";

describe("nextSessionHeadline", () => {
  it("joins the day and the time with a dot so a narrow tile wraps between them", () => {
    expect(nextSessionHeadline("Tomorrow", "4:00 PM")).toBe("Tomorrow · 4:00 PM");
    expect(nextSessionHeadline("Wednesday", "12:30 PM")).toBe("Wednesday · 12:30 PM");
  });

  it("reads the day alone when there is no time, and nothing when there is no booking", () => {
    expect(nextSessionHeadline("Today", "")).toBe("Today");
    expect(nextSessionHeadline(null, "4:00 PM")).toBeNull();
  });
});

describe("bookedLabel", () => {
  it("counts every booking, never below the one on the tile", () => {
    expect(bookedLabel(1)).toBe("1 booked");
    expect(bookedLabel(3)).toBe("3 booked");
    expect(bookedLabel(0)).toBe("1 booked");
  });
});
