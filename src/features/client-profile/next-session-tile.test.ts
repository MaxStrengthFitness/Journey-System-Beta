import { describe, expect, it } from "vitest";
import { bookedLabel, nextSessionHeadline, stillBooked } from "./next-session-tile";

describe("nextSessionHeadline", () => {
  // Moved on purpose (type and depth, phase 7, Oct 4 2026): the day keeps its
  // dot and the time keeps its AM / PM, each joined by a no-break space, so
  // the line may break only between the dot and the time.
  it("joins the day and the time with a dot so a narrow tile wraps between them", () => {
    expect(nextSessionHeadline("Tomorrow", "4:00 PM")).toBe("Tomorrow\u00A0· 4:00\u00A0PM");
    expect(nextSessionHeadline("Wednesday", "12:30 PM")).toBe("Wednesday\u00A0· 12:30\u00A0PM");
  });

  it("never leaves AM / PM or the dot alone on a line, whichever space Intl wrote before AM", () => {
    for (const time of ["7:30 AM", "7:30\u202FAM"]) {
      const line = nextSessionHeadline("Tomorrow", time)!;
      expect(line).toBe("Tomorrow\u00A0· 7:30\u00A0AM");
      expect(line).toContain("\u00A0AM");
      expect(line).toContain("\u00A0·");
      // One ordinary space is left, the one place the line may break.
      expect(line.split(" ")).toEqual(["Tomorrow\u00A0·", "7:30\u00A0AM"]);
      expect(line).not.toContain("\u202F");
    }
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
