import { describe, expect, it } from "vitest";
import {
  BOOKING_MATCH_WINDOW_MS,
  lateByMinutes,
  matchBookingForSession,
  sessionTimingFields,
  toEpochMs,
} from "./session-timing";

const T0 = Date.UTC(2026, 8, 12, 13, 0, 0); // 9:00 Eastern on Sep 12 2026
const min = (n: number) => n * 60_000;

describe("toEpochMs", () => {
  it("reads Timestamps, Dates, numbers and ISO strings; rejects the rest", () => {
    expect(toEpochMs({ toMillis: () => 5 })).toBe(5);
    expect(toEpochMs({ seconds: 2 })).toBe(2000);
    expect(toEpochMs(new Date(T0))).toBe(T0);
    expect(toEpochMs(T0)).toBe(T0);
    expect(toEpochMs("2026-09-12T13:00:00.000Z")).toBe(T0);
    expect(toEpochMs("")).toBeNull();
    expect(toEpochMs(null)).toBeNull();
    expect(toEpochMs("not a date")).toBeNull();
  });
});

describe("matchBookingForSession", () => {
  const bookings = [
    { clientId: "c1", startTime: T0, status: "Scheduled" },
    { clientId: "c1", startTime: T0 + min(120), status: "Scheduled" },
    { clientId: "c2", startTime: T0, status: "Scheduled" },
    { clientId: "c1", startTime: T0 - min(30), status: "Cancelled" },
  ];

  it("picks the closest live booking for the client", () => {
    expect(matchBookingForSession(bookings, "c1", T0 + min(9))?.startMs).toBe(T0);
    expect(matchBookingForSession(bookings, "c1", T0 + min(110))?.startMs).toBe(T0 + min(120));
  });

  it("ignores other clients, cancelled bookings and anything outside the window", () => {
    expect(matchBookingForSession(bookings, "c3", T0)).toBeNull();
    expect(matchBookingForSession([{ clientId: "c1", startTime: T0, status: "Cancelled" }], "c1", T0)).toBeNull();
    expect(matchBookingForSession(bookings, "c1", T0 + BOOKING_MATCH_WINDOW_MS + min(121))).toBeNull();
  });

  it("breaks a tie toward the earlier slot — the one the client was meant to fill", () => {
    const tied = [
      { clientId: "c1", startTime: T0, status: "Scheduled" },
      { clientId: "c1", startTime: T0 + min(60), status: "Scheduled" },
    ];
    expect(matchBookingForSession(tied, "c1", T0 + min(30))?.startMs).toBe(T0);
  });

  it("returns null with nothing to compare", () => {
    expect(matchBookingForSession(null, "c1", T0)).toBeNull();
    expect(matchBookingForSession(bookings, null, T0)).toBeNull();
    expect(matchBookingForSession(bookings, "c1", null)).toBeNull();
  });
});

describe("lateByMinutes / sessionTimingFields", () => {
  it("rounds to whole minutes and allows early starts", () => {
    expect(lateByMinutes(T0, T0 + min(9) + 20_000)).toBe(9);
    expect(lateByMinutes(T0, T0 - min(4))).toBe(-4);
    expect(lateByMinutes(T0, T0)).toBe(0);
  });

  it("writes nothing when no booking matched — a guessed lateness is worse than none", () => {
    expect(sessionTimingFields([], "c1", T0)).toBeNull();
    expect(sessionTimingFields([{ clientId: "c1", startTime: T0 }], "c1", T0 + min(12))).toEqual({
      bookingStartMs: T0,
      startedLateByMinutes: 12,
    });
  });
});
