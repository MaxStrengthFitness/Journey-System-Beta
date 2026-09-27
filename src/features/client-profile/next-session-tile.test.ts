import { describe, expect, it } from "vitest";
import { bookedLabel, nextSessionHeadline, stillBooked } from "./next-session-tile";

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

describe("stillBooked", () => {
  it("never offers a cancelled booking as the next session, nor counts it as booked", () => {
    const rows = [
      { id: "mon", status: "Cancelled" },
      { id: "wed", status: "Scheduled" },
      { id: "fri", status: "Scheduled" },
      { id: "old", status: undefined },
    ];
    const booked = stillBooked(rows);
    expect(booked.map((r) => r.id)).toEqual(["wed", "fri", "old"]);
    expect(booked[0].id).toBe("wed");
    expect(bookedLabel(booked.length)).toBe("3 booked");
  });
});
