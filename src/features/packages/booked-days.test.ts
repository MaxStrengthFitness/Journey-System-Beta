import { describe, expect, it } from "vitest";
import { bookedWeekdays } from "./booked-days";

// Thursday Sep 24 2026, 2pm Eastern.
const NOW = new Date("2026-09-24T18:00:00Z");

describe("bookedWeekdays", () => {
  it("lights the weekdays of this client's coming bookings, once each", () => {
    const days = bookedWeekdays(
      [
        { clientId: "c1", startTime: "2026-09-29T11:30:00Z", status: "Scheduled" }, // Tue 7:30am ET
        { clientId: "c1", startTime: "2026-10-02T11:30:00Z", status: "Scheduled" }, // Fri
        { clientId: "c1", startTime: "2026-10-06T11:30:00Z", status: "Scheduled" }, // Tue again
        { clientId: "c2", startTime: "2026-09-30T11:30:00Z", status: "Scheduled" }, // someone else
      ],
      "c1",
      NOW,
    );
    expect(days).toEqual([2, 5]);
  });

  it("reads the day in the studio's time, not UTC", () => {
    // 11:30pm Eastern on Monday is already Tuesday in UTC.
    expect(bookedWeekdays([{ clientId: "c1", startTime: "2026-09-29T03:30:00Z", status: "Scheduled" }], "c1", NOW)).toEqual([1]);
  });

  it("ignores the past, cancellations, no-shows and anything past two weeks", () => {
    expect(
      bookedWeekdays(
        [
          { clientId: "c1", startTime: "2026-09-23T11:30:00Z", status: "Scheduled" },
          { clientId: "c1", startTime: "2026-09-29T11:30:00Z", status: "Cancelled" },
          { clientId: "c1", startTime: "2026-09-30T11:30:00Z", status: "No-Show" },
          { clientId: "c1", startTime: "2026-10-20T11:30:00Z", status: "Scheduled" },
          { clientId: "c1", startTime: "not a date", status: "Scheduled" },
        ],
        "c1",
        NOW,
      ),
    ).toEqual([]);
  });

  it("is nothing without a client", () => {
    expect(bookedWeekdays([{ clientId: "c1", startTime: "2026-09-29T11:30:00Z" }], null, NOW)).toEqual([]);
  });
});
