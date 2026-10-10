import { describe, expect, it } from "vitest";
import { buildWeekAgenda, visibleRange, weekDays } from "./selectors";
import type { CalendarSession } from "./types";

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

describe("buildWeekAgenda (the rooms round, Oct 10 2026)", () => {
  /** A booking at a wall-clock time in the studio's zone (the suite runs at America/New_York). */
  const at = (y: number, m: number, d: number, h: number, min: number, over: Partial<CalendarSession>): CalendarSession => {
    const start = new Date(y, m - 1, d, h, min);
    return { id: `${d}-${h}-${min}-${over.clientName}`, clientName: "Client", trainerId: null, trainerName: "", start, end: new Date(start.getTime() + 30 * 60000), durationMin: 30, ...over };
  };
  const rank = (id: string | null) => (id === null ? 99 : id === "me" ? 0 : id === "a" ? 1 : 2);

  it("lays the week's seven days out, each its bookings by start time, never an Unavailable", () => {
    const sessions = [
      at(2026, 9, 15, 9, 30, { clientName: "Zed", trainerId: "b" }),
      at(2026, 9, 15, 9, 30, { clientName: "Amy", trainerId: "b" }),
      at(2026, 9, 15, 9, 30, { clientName: "Kim", trainerId: "me" }),
      at(2026, 9, 15, 9, 30, { clientName: "Lou", trainerId: null }),
      at(2026, 9, 15, 8, 0, { clientName: "Ann", trainerId: "a" }),
      at(2026, 9, 15, 11, 0, { clientName: "Unavailable", trainerId: "a", isUnavailability: true }),
      at(2026, 9, 17, 10, 15, { clientName: "Tia", trainerId: "a" }),
    ];
    const days = buildWeekAgenda(local(2026, 9, 15), sessions, rank, local(2026, 9, 15));
    expect(days.map((d) => d.key)).toEqual(["2026-09-13", "2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18", "2026-09-19"]);
    const tue = days[2];
    expect(tue.isToday).toBe(true);
    expect(tue.weekday).toBe("Tuesday");
    expect(tue.count).toBe(5);
    expect(tue.slots.map((s) => s.label)).toEqual(["8 AM", "9:30 AM"]);
    // Yours first, then the studio's order, then by name, Unassigned last.
    expect(tue.slots[1].items.map((s) => s.clientName)).toEqual(["Kim", "Amy", "Zed", "Lou"]);
    expect(days[4].slots.map((s) => s.label)).toEqual(["10:15 AM"]);
    expect(days[0].count).toBe(0);
    expect(days[0].slots).toEqual([]);
  });
});
