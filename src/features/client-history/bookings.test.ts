import { describe, expect, it } from "vitest";
import type { ScheduleEntry } from "../../types";
import { loggedSessions } from "../../lib/booking-state";
import { wallClockToInstant } from "../../lib/studio-time";
import {
  bookingLayer,
  bookingLine,
  bookingLines,
  bookingTrainerName,
  bookingsReadFrom,
  isStampedCancellation,
  type BookingLayerInput,
  type BookingMark,
} from "./bookings";
import { buildCalendar, computeCadence, toVisitDays, type HistorySession } from "./model";

const NY = "America/New_York";

/** Eastern wall clock → the instant, daylight saving and all. */
const at = (day: string, hm: string) => wallClockToInstant(`${day}T${hm}:00`, NY)!;

/* Thursday Sep 24 2026, 10:00 AM Eastern. */
const TODAY = "2026-09-24";
const NOW = at(TODAY, "10:00");

function row(over: Partial<ScheduleEntry> & { id: string; day?: string; hm?: string }): ScheduleEntry {
  const { day = "2026-09-29", hm = "15:00", ...rest } = over;
  const start = at(day, hm);
  return {
    clientId: "c1",
    clientName: "Helen Marsh",
    trainerId: "t1",
    trainerName: "Giovanni Rossi",
    studioId: "solon",
    startTime: start,
    endTime: new Date(start.getTime() + 30 * 60_000),
    status: "Scheduled",
    serviceName: "Strength 30",
    source: "MindBody",
    createdAt: null,
    ...rest,
  };
}

const layer = (rows: ScheduleEntry[], over: Partial<BookingLayerInput> = {}) =>
  bookingLayer({ rows, now: NOW, tz: NY, logged: null, ...over });

const kinds = (marks: BookingMark[]) => marks.map((m) => `${m.kind}@${m.day}`);

describe("bookingLayer — booked days still to come", () => {
  it("draws a booking whose start is later than now, today's later bookings included", () => {
    const { marks } = layer([
      row({ id: "later-today", day: TODAY, hm: "15:00" }),
      row({ id: "next-week", day: "2026-09-29" }),
    ]);
    expect(kinds(marks)).toEqual(["booked@2026-09-24", "booked@2026-09-29"]);
    expect(marks[0].trainer).toBe("Giovanni");
  });

  it("adds nothing for a booking already past — the visit layer speaks for past days", () => {
    const { marks } = layer([
      row({ id: "this-morning", day: TODAY, hm: "08:00" }),
      row({ id: "last-week", day: "2026-09-17" }),
    ]);
    expect(marks).toEqual([]);
  });

  it("reads a booking on a day she already trained as done, not still to come (booking-state)", () => {
    const trained = [
      { id: "s1", clientId: "c1", status: "Completed", date: TODAY, startTime: at(TODAY, "08:00").toISOString() },
    ] as unknown as HistorySession[];
    const { marks } = layer([row({ id: "double", day: TODAY, hm: "15:00" })], { logged: loggedSessions(trained, NY) });
    expect(marks).toEqual([]);
  });

  it("buckets by the studio's day, not UTC's — an 8:30 PM Eastern booking is not tomorrow", () => {
    const { marks } = layer([row({ id: "late", day: "2026-09-29", hm: "20:30" })]);
    expect(marks[0].day).toBe("2026-09-29");
  });

  it("draws a restored booking as booked: its cancellation stamp was cleared", () => {
    const { marks } = layer([row({ id: "back", status: "Scheduled", cancelledAt: null, cancelSource: null })]);
    expect(kinds(marks)).toEqual(["booked@2026-09-29"]);
  });
});

describe("bookingLayer — cancellations Journey saw happen", () => {
  it("never draws an unstamped Cancelled row: the old sweep cancelled every past booking", () => {
    const oldSweep = [
      row({ id: "a", day: "2026-08-04", status: "Cancelled" }),
      row({ id: "b", day: "2026-08-06", status: "Cancelled", cancelledAt: null }),
      // Even a future one: no stamp, no claim.
      row({ id: "c", day: "2026-10-06", status: "Cancelled" }),
    ];
    expect(layer(oldSweep).marks).toEqual([]);
    expect(oldSweep.some(isStampedCancellation)).toBe(false);
  });

  it("draws a stamped one on the day the session was FOR", () => {
    const { marks } = layer([
      row({ id: "gone", day: "2026-09-16", status: "Cancelled", cancelledAt: at("2026-09-14", "07:12"), cancelSource: "mindbody" }),
    ]);
    expect(kinds(marks)).toEqual(["cancelled@2026-09-16"]);
    expect(marks[0].to).toBeNull();
    expect(bookingLine(marks[0], 2026, { tz: NY })).toBe("Sep 16 · cancelled");
  });

  it("reads it as a reschedule when the other booking that week appeared with the cancellation", () => {
    const { marks } = layer([
      row({ id: "gone", day: "2026-09-23", status: "Cancelled", cancelledAt: at("2026-09-22", "18:00"), cancelSource: "sweep" }),
      row({ id: "rebook", day: "2026-09-25", hm: "09:00", createdAt: at("2026-09-22", "18:00") }),
    ]);
    const cancelled = marks.find((m) => m.kind === "cancelled")!;
    expect(cancelled.to?.day).toBe("2026-09-25");
    expect(bookingLine(cancelled, 2026, { tz: NY })).toBe("Sep 23 · cancelled, rebooked Fri Sep 25");
    // The rebooked day is itself still to come.
    expect(kinds(marks)).toEqual(["cancelled@2026-09-23", "booked@2026-09-25"]);
  });

  it("never calls her standing booking a rebook (AJ, Sep 26: only a real rebook)", () => {
    // A Tue/Thu client cancels Tuesday. Her Thursday was booked weeks ago.
    const { marks } = layer([
      row({ id: "tue", day: "2026-09-29", status: "Cancelled", cancelledAt: at("2026-09-28", "12:00") }),
      row({ id: "thu", day: "2026-10-01", createdAt: at("2026-09-01", "07:30") }),
    ]);
    const cancelled = marks.find((m) => m.kind === "cancelled")!;
    expect(cancelled.to).toBeNull();
    expect(bookingLine(cancelled, 2026, { tz: NY })).toBe("Sep 29 · cancelled");
    // Thursday is still drawn: booked, as it always was.
    expect(kinds(marks)).toEqual(["cancelled@2026-09-29", "booked@2026-10-01"]);
  });

  it("counts the new slot booked a few hours before the old one was cancelled (the desk books first)", () => {
    const { marks } = layer([
      row({ id: "tue", day: "2026-09-29", status: "Cancelled", cancelledAt: at("2026-09-28", "12:00") }),
      row({ id: "wed", day: "2026-09-30", createdAt: at("2026-09-28", "09:30") }),
    ]);
    expect(bookingLine(marks.find((m) => m.kind === "cancelled")!, 2026, { tz: NY })).toBe(
      "Sep 29 · cancelled, rebooked Wed Sep 30",
    );
    // A day before is her standing booking, not this one's rebook.
    const earlier = layer([
      row({ id: "tue", day: "2026-09-29", status: "Cancelled", cancelledAt: at("2026-09-28", "12:00") }),
      row({ id: "wed", day: "2026-09-30", createdAt: at("2026-09-27", "09:30") }),
    ]).marks;
    expect(earlier.find((m) => m.kind === "cancelled")!.to).toBeNull();
  });

  it("claims no rebook when it cannot tell when the other booking appeared", () => {
    const { marks } = layer([
      row({ id: "tue", day: "2026-09-29", status: "Cancelled", cancelledAt: at("2026-09-28", "12:00") }),
      row({ id: "thu", day: "2026-10-01", createdAt: null }),
    ]);
    expect(marks.find((m) => m.kind === "cancelled")!.to).toBeNull();
  });

  it("never names a booking that was already over when she cancelled: nobody rebooks into the past", () => {
    // A Tue/Thu client cancels Thursday on Wednesday evening. Tuesday is the
    // only other booking that week, and it had happened.
    const { marks } = layer([
      row({ id: "tue", day: "2026-09-15" }),
      row({ id: "thu", day: "2026-09-17", status: "Cancelled", cancelledAt: at("2026-09-16", "18:00") }),
    ]);
    const cancelled = marks.find((m) => m.kind === "cancelled")!;
    expect(cancelled.to).toBeNull();
    expect(bookingLine(cancelled, 2026, { tz: NY })).toBe("Sep 17 · cancelled");
  });

  it("still names an earlier day she moved to before it came round", () => {
    // Cancelled Friday's session on Monday morning, and booked Tuesday instead.
    const { marks } = layer(
      [
        row({ id: "fri", day: "2026-09-25", status: "Cancelled", cancelledAt: at("2026-09-21", "09:00") }),
        row({ id: "tue", day: "2026-09-22", createdAt: at("2026-09-21", "09:00") }),
      ],
      { now: at("2026-09-21", "10:00") },
    );
    const cancelled = marks.find((m) => m.kind === "cancelled")!;
    expect(bookingLine(cancelled, 2026, { tz: NY })).toBe("Sep 25 · cancelled, rebooked Tue Sep 22");
  });

  it("a booking the week after does not make it a reschedule", () => {
    const { marks } = layer([
      row({ id: "gone", day: "2026-09-23", status: "Cancelled", cancelledAt: at("2026-09-22", "18:00") }),
      row({ id: "next", day: "2026-09-29" }),
    ]);
    expect(marks.find((m) => m.kind === "cancelled")?.to).toBeNull();
  });

  it("a cancelled morning rebooked for the afternoon says the new time", () => {
    const { marks } = layer([
      row({ id: "am", day: "2026-09-29", hm: "09:00", status: "Cancelled", cancelledAt: at("2026-09-24", "08:00") }),
      row({ id: "pm", day: "2026-09-29", hm: "15:00", createdAt: at("2026-09-24", "08:00") }),
    ]);
    const cancelled = marks.find((m) => m.kind === "cancelled")!;
    expect(bookingLine(cancelled, 2026, { tz: NY })).toBe("Sep 29 · cancelled, rebooked 3:00 PM");
    // Soonest first: the cancelled 9:00 before the 3:00 still booked.
    expect(kinds(marks)).toEqual(["cancelled@2026-09-29", "booked@2026-09-29"]);
  });
});

describe("bookingLayer — moves", () => {
  it("marks the day a moved booking LEFT, and says where it lives now", () => {
    const { marks } = layer([
      row({
        id: "m",
        day: "2026-09-22",
        movedFromDay: "2026-09-18",
        movedFromStart: at("2026-09-18", "15:00"),
        movedAt: at("2026-09-16", "12:00"),
      }),
    ]);
    expect(kinds(marks)).toEqual(["moved@2026-09-18"]);
    expect(marks[0].to?.day).toBe("2026-09-22");
    expect(bookingLine(marks[0], 2026, { tz: NY })).toBe("Sep 18 · moved to Tue Sep 22");
  });

  it("a moved booking still to come is booked on its new day as well", () => {
    const { marks } = layer([
      row({ id: "m", day: "2026-10-01", movedFromDay: "2026-09-29", movedFromStart: at("2026-09-29", "15:00") }),
    ]);
    expect(kinds(marks)).toEqual(["moved@2026-09-29", "booked@2026-10-01"]);
  });

  it("a new time on the same day is not a move: the day still has her booking", () => {
    const { marks } = layer([
      row({ id: "m", day: "2026-09-18", hm: "16:00", movedFromDay: "2026-09-18", movedFromStart: at("2026-09-18", "15:00") }),
    ]);
    expect(marks).toEqual([]);
  });
});

describe("bookingLayer — how far ahead", () => {
  it("names the latest day any mark sits on", () => {
    expect(layer([]).lastDay).toBeNull();
    expect(
      layer([row({ id: "a", day: "2026-09-29" }), row({ id: "b", day: "2026-11-03", hm: "11:00" })]).lastDay,
    ).toBe("2026-11-03");
  });
});

describe("bookingTrainerName", () => {
  const roster = new Map([["t1", "Giovanni Rossi"]]);
  it("uses the roster's name for a linked trainer, as the rest of the tab does", () => {
    expect(bookingTrainerName({ trainerId: "t1", trainerName: "G. Rossi (MB)" }, roster)).toBe("Giovanni");
  });
  it("falls back to the name Mindbody sent", () => {
    expect(bookingTrainerName({ trainerId: undefined, trainerName: "Sara Lopez" }, roster)).toBe("Sara");
  });
  it("names nobody for the pull's no-staff placeholder, or an empty name", () => {
    expect(bookingTrainerName({ trainerName: "Solon Rotation" })).toBeNull();
    expect(bookingTrainerName({ trainerName: "  " })).toBeNull();
    expect(bookingLine(layer([row({ id: "x", trainerId: undefined, trainerName: "Solon Rotation" })]).marks[0], 2026, { tz: NY })).toBe(
      "Tue Sep 29 · 3:00 PM · booked",
    );
  });
});

describe("bookingsReadFrom — where the one read starts", () => {
  const days = (keys: string[]) => keys.map((key) => ({ key, sessions: [] }));
  it("reads from the Monday on or before the first day the calendar draws", () => {
    // First visit Sep 10; the calendar draws from Tue Sep 1, whose week began Mon Aug 31.
    expect(bookingsReadFrom(days(["2026-09-10", "2026-09-17"]))).toBe("2026-08-31");
    // Jun 1 2026 is a Monday: its own week's start.
    expect(bookingsReadFrom(days(["2026-06-01"]))).toBe("2026-06-01");
  });
  it("reads nothing when the calendar draws nothing", () => {
    expect(bookingsReadFrom([])).toBeNull();
  });
});

describe("bookingLines — the words under a month", () => {
  it("writes each kind the way the month writes its events", () => {
    const { marks } = layer([
      row({ id: "m", day: "2026-09-22", movedFromDay: "2026-09-18", movedFromStart: at("2026-09-18", "15:00") }),
      row({ id: "c", day: "2026-09-20", hm: "10:00", status: "Cancelled", cancelledAt: at("2026-09-19", "09:00") }),
      row({ id: "b", day: "2026-09-28" }),
    ]);
    expect(bookingLines(marks, 2026, NY).map((l) => l.text)).toEqual([
      "Sep 18 · moved to Tue Sep 22",
      "Sep 20 · cancelled",
      "Mon Sep 28 · 3:00 PM · booked with Giovanni",
    ]);
  });

  it("gives two changes on one day their times, so they are not the same line twice", () => {
    const { marks } = layer([
      row({ id: "a", day: "2026-09-21", hm: "09:00", status: "Cancelled", cancelledAt: at("2026-09-20", "09:00") }),
      row({ id: "b", day: "2026-09-21", hm: "15:00", status: "Cancelled", cancelledAt: at("2026-09-20", "09:00") }),
    ]);
    expect(bookingLines(marks, 2026, NY).map((l) => l.text)).toEqual([
      "Sep 21 · 9:00 AM · cancelled",
      "Sep 21 · 3:00 PM · cancelled",
    ]);
  });

  it("names the year of a day that is not in the month card's year", () => {
    const { marks } = layer(
      [row({ id: "m", day: "2027-01-05", movedFromDay: "2026-12-30", movedFromStart: at("2026-12-30", "15:00") })],
      { now: at("2026-12-20", "10:00") },
    );
    expect(bookingLines(marks, 2026, NY)[0].text).toBe("Dec 30 · moved to Tue Jan 5, 2027");
    expect(bookingLines(marks, 2027, NY)[1].text).toBe("Tue Jan 5 · 3:00 PM · booked with Giovanni");
  });
});

/* ------------------------------------------------------------------ *
 * The calendar, with her bookings laid on it
 * ------------------------------------------------------------------ */

const visit = (date: string): HistorySession =>
  ({ id: `s-${date}`, clientId: "c1", status: "Completed", date, trainerInitials: "GR" }) as unknown as HistorySession;

function calendar(rows: ScheduleEntry[], today = TODAY, now = NOW) {
  const { days } = toVisitDays([visit("2026-08-25"), visit("2026-09-15"), visit("2026-09-22")], NY, today);
  const cadence = computeCadence(days, today);
  return buildCalendar({ days, events: [], cadence, today, bookings: bookingLayer({ rows, now, tz: NY, logged: null }) });
}

const cellOf = (years: ReturnType<typeof calendar>, key: string) =>
  years.flatMap((y) => y.months).flatMap((m) => m.cells).find((c) => c?.key === key)!;

describe("buildCalendar with bookings", () => {
  it("runs forward to the month of her last booking, so next month shows", () => {
    const years = calendar([row({ id: "nov", day: "2026-11-03", hm: "11:00" })]);
    expect(years[0].months.map((m) => m.shortName)).toEqual(["Aug", "Sep", "Oct", "Nov"]);
    const nov = years[0].months[3];
    expect(nov.ahead).toBe(true);
    expect(nov.booked).toBe(1);
    expect(nov.bookings.map((m) => m.day)).toEqual(["2026-11-03"]);
    expect(cellOf(years, "2026-11-03")).toMatchObject({ state: "future", booked: true });
  });

  it("still ends at today's month with nothing booked ahead", () => {
    const years = calendar([row({ id: "old", day: "2026-09-15", hm: "09:00" })]);
    expect(years[0].months.map((m) => m.shortName)).toEqual(["Aug", "Sep"]);
    expect(years[0].booked).toBe(0);
  });

  it("marks today when she is booked later today", () => {
    const today = cellOf(calendar([row({ id: "pm", day: TODAY, hm: "15:00" })]), TODAY);
    expect(today).toMatchObject({ isToday: true, booked: true, state: "rest" });
  });

  it("keeps a visit's fill on a day that also carries a cancellation", () => {
    const years = calendar([
      row({ id: "am", day: "2026-09-22", hm: "08:00", status: "Cancelled", cancelledAt: at("2026-09-21", "20:00") }),
    ]);
    expect(cellOf(years, "2026-09-22")).toMatchObject({ state: "visit", cancelled: true, booked: false });
    expect(years[0].cancelled).toBe(1);
  });

  it("marks the day a booking left, and never an unstamped cancellation", () => {
    const years = calendar([
      row({ id: "m", day: "2026-09-22", hm: "16:00", movedFromDay: "2026-09-18", movedFromStart: at("2026-09-18", "15:00") }),
      row({ id: "old-sweep", day: "2026-09-08", status: "Cancelled" }),
    ]);
    expect(cellOf(years, "2026-09-18")).toMatchObject({ moved: true, cancelled: false });
    expect(cellOf(years, "2026-09-08")).toMatchObject({ moved: false, cancelled: false, bookings: [] });
    expect(years[0].moved).toBe(1);
    expect(years[0].cancelled).toBe(0);
  });

  it("draws a year that has not started yet when she is booked in it", () => {
    const years = calendar(
      [row({ id: "jan", day: "2027-01-05" })],
      "2026-12-20",
      at("2026-12-20", "10:00"),
    );
    expect(years.map((y) => [y.year, y.ahead, y.booked])).toEqual([
      [2027, true, 1],
      [2026, false, 0],
    ]);
    expect(years[0].months.map((m) => m.shortName)).toEqual(["Jan"]);
  });
});
