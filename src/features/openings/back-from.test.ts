import { describe, expect, it } from "vitest";
import type { ScheduleEntry } from "../../types";
import { BACK_FROM_DAYS, CLIENTS_PER_READ, backFrom, backFromRange, clientBatches, monthReadToday, type BackFromInput } from "./back-from";
import { TZ, at, booking } from "./fixtures";

/** Today is Monday Nov 9 2026; the slot is that Monday. */
const TODAY = "2026-11-09";
const hers = (day: string, over: Partial<ScheduleEntry> = {}) => booking(day, "08:00", { clientId: "c-judy", clientName: "Judy Smith", ...over });
const input = (over: Partial<BackFromInput> = {}): BackFromInput => ({
  slotDay: TODAY,
  today: TODAY,
  studioId: "westlake",
  clientId: "c-judy",
  bookings: [],
  monthRead: false,
  tz: TZ,
  ...over,
});

describe("the read", () => {
  it("from the day after the slot to today + 30, clients 30 at a time", () => {
    expect(BACK_FROM_DAYS).toBe(30);
    expect(CLIENTS_PER_READ).toBe(30);
    expect(backFromRange("2026-11-10", TODAY)).toEqual({ from: "2026-11-11", to: "2026-12-09" });
    const batches = clientBatches([...Array.from({ length: 65 }, (_, i) => `c${i}`), "c1", null, ""]);
    expect(batches.map((b) => b.length)).toEqual([30, 30, 5]);
  });

  it("the month was read in full today: the lease's last whole-month pull is in today's block", () => {
    const now = at(TODAY, "10:00").getTime();
    expect(monthReadToday(at(TODAY, "00:30").getTime(), now, TZ)).toBe(true);
    expect(monthReadToday(at("2026-11-08", "23:30").getTime(), now, TZ)).toBe(false);
    expect(monthReadToday(null, now, TZ)).toBe(false);
  });
});

describe("backFrom", () => {
  it("can't tell until the read comes back from the server", () => {
    expect(backFrom(input({ bookings: null }))).toEqual({ kind: "cant-tell" });
  });

  it("booked again, when every day before it was read", () => {
    // Inside the next 7 days: read, whatever the month.
    expect(backFrom(input({ bookings: [hers("2026-11-12")] }))).toEqual({ kind: "booked-again", day: "2026-11-12" });
    // Further out, only once the month was read in full today.
    expect(backFrom(input({ bookings: [hers("2026-11-23")], monthRead: true }))).toEqual({ kind: "booked-again", day: "2026-11-23" });
  });

  it("next booking on file, when an earlier one could be missing", () => {
    expect(backFrom(input({ bookings: [hers("2026-11-23")] }))).toEqual({ kind: "next-on-file", day: "2026-11-23" });
  });

  it("not booked again: through today + 30 once the month was read, otherwise through the last of the next 7 days", () => {
    expect(backFrom(input({ monthRead: true }))).toEqual({ kind: "none-30", through: "2026-12-09" });
    expect(backFrom(input())).toEqual({ kind: "none-7", through: "2026-11-15" });
  });

  it("a booking between today and the slot is never read, so a 'none' is about the days after the slot", () => {
    // Today Sat Nov 7; her Thursday Nov 12 slot is open; she is booked Monday Nov 9.
    const sat = input({ today: "2026-11-07", slotDay: "2026-11-12", bookings: [hers("2026-11-09")] });
    expect(backFrom(sat)).toEqual({ kind: "none-7", through: "2026-11-13" });
    expect(backFrom({ ...sat, monthRead: true })).toEqual({ kind: "none-30", through: "2026-12-07" });
  });

  it("the slot on the window's last day, with the month unread: no day after it was read, so it can't tell", () => {
    expect(backFrom(input({ slotDay: "2026-11-15" }))).toEqual({ kind: "cant-tell" });
    expect(backFrom(input({ slotDay: "2026-11-15", monthRead: true }))).toEqual({ kind: "none-30", through: "2026-12-09" });
  });

  it("keeps only her live bookings at this studio, after the slot, inside the horizon; the earliest wins", () => {
    const b = [
      hers("2026-11-12", { status: "Cancelled" }),
      hers("2026-11-12", { studioId: "solon" }),
      hers("2026-11-12", { clientName: "Unavailable" }),
      hers("2026-11-12", { clientId: "c-other" }),
      hers(TODAY),
      hers("2026-12-10"),
      hers("2026-11-20"),
      hers("2026-11-14"),
    ];
    expect(backFrom(input({ bookings: b, monthRead: true }))).toEqual({ kind: "booked-again", day: "2026-11-14" });
  });
});
