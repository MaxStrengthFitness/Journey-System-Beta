import { describe, expect, it } from "vitest";
import type { ClientEvent, ExerciseLog } from "../../types";
import {
  BREAK_MIN_GAP_DAYS,
  addDays,
  awayEventFor,
  buildCalendar,
  buildList,
  computeCadence,
  daysBetween,
  describeRange,
  describeSpan,
  describeSpanAdjective,
  findGaps,
  isBackfilledSession,
  keyToOrdinal,
  ordinalToKey,
  perWeekLabel,
  qualityOf,
  routineLetter,
  routineNamer,
  sessionDayKey,
  summarizeSession,
  toTimelineEvents,
  toVisitDays,
  volumeDeltas,
  weekdayOf,
  weightUpsBySession,
  type HistorySession,
} from "./model";

const NY = "America/New_York";

/** A completed session on a given day, with no start instant (so `date` decides). */
const on = (date: string, extra: Partial<HistorySession> = {}): HistorySession =>
  ({
    id: `s-${date}-${Math.random().toString(36).slice(2, 7)}`,
    clientId: "c1",
    hostedAtStudioId: "solon",
    clientHomeStudioId: "solon",
    isCrossTrain: false,
    sessionType: "Standard",
    sessionNumber: 0,
    date,
    trainerInitials: "AR",
    status: "Completed",
    ...extra,
  }) as HistorySession;

/** Visits every `step` days from `start` for `count` visits. */
const every = (start: string, step: number, count: number) =>
  Array.from({ length: count }, (_, i) => on(addDays(start, i * step)));

const log = (sessionId: string, machineId: string, extra: Partial<ExerciseLog> = {}): ExerciseLog => ({
  sessionId,
  machineId,
  weight: "100",
  reps: "8",
  ...extra,
});

describe("day keys", () => {
  it("round-trips ordinals and counts days across month, year and DST lines", () => {
    expect(ordinalToKey(keyToOrdinal("2026-03-08"))).toBe("2026-03-08");
    expect(daysBetween("2026-02-27", "2026-03-02")).toBe(3);
    expect(daysBetween("2025-12-30", "2026-01-02")).toBe(3);
    // US daylight saving starts Mar 8 2026 — a local-Date subtraction would give 0.958.
    expect(daysBetween("2026-03-07", "2026-03-09")).toBe(2);
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
  });

  it("knows the weekday, Sunday first", () => {
    expect(weekdayOf("2026-09-10")).toBe(4); // a Thursday
    expect(weekdayOf("2026-02-01")).toBe(0); // a Sunday
  });
});

describe("sessionDayKey — which day a session happened on", () => {
  it("uses the start instant in studio time, not the UTC date the live flow stores", () => {
    // 7:30 PM Eastern on Jan 15 is 00:30 UTC on Jan 16, which is what `date` holds.
    const s = on("2026-01-16", {
      startTime: { seconds: Date.UTC(2026, 0, 16, 0, 30) / 1000, nanoseconds: 0 },
    });
    expect(sessionDayKey(s, NY)).toBe("2026-01-15");
  });

  it("falls back to the typed date for imports, which have no start time", () => {
    expect(sessionDayKey(on("2025-03-04", { legacy_filemaker_id: "FM-1" }), NY)).toBe("2025-03-04");
    expect(sessionDayKey(on("3/4/2025"), NY)).toBe("2025-03-04");
  });

  it("ignores any start time on a legacy import", () => {
    const s = on("2025-03-04", {
      trainerInitials: "Chart",
      startTime: "2025-03-05T03:00:00.000Z",
    });
    expect(sessionDayKey(s, NY)).toBe("2025-03-04");
  });

  it("keeps a backfilled session on the chosen day and recognises its placeholder time", () => {
    const s = on("2025-03-04", { startTime: "2025-03-04T12:00:00.000Z" });
    expect(sessionDayKey(s, NY)).toBe("2025-03-04");
    expect(isBackfilledSession(s)).toBe(true);
    expect(isBackfilledSession(on("2025-03-04"))).toBe(false);
  });

  it("returns null for a session nobody dated", () => {
    expect(sessionDayKey(on(""), NY)).toBeNull();
    const { days, undated } = toVisitDays([on(""), on("2026-01-05")], NY);
    expect(days.map((d) => d.key)).toEqual(["2026-01-05"]);
    expect(undated).toHaveLength(1);
  });

  it("keeps sessions it cannot place off the calendar: typo years, 1900s, the future", () => {
    const { days, undated } = toVisitDays(
      [on("0026-02-03"), on("1900-01-01"), on("2027-03-04"), on("2026-09-01")],
      NY,
      "2026-09-10",
    );
    expect(days.map((d) => d.key)).toEqual(["2026-09-01"]);
    expect(undated.map((s) => s.date)).toEqual(["0026-02-03", "1900-01-01", "2027-03-04"]);
  });

  it("does not let a future-dated typo switch off an ongoing break", () => {
    const { days } = toVisitDays([on("2026-07-01"), on("2027-03-04")], NY, "2026-09-10");
    const c = computeCadence(days, "2026-09-10");
    expect(c.onBreak).toBe(true);
    expect(c.daysSinceLast).toBe(71);
  });

  it("groups two sessions on one day into one visit", () => {
    const { days } = toVisitDays([on("2026-01-05"), on("2026-01-05"), on("2026-01-08")], NY);
    expect(days.map((d) => [d.key, d.sessions.length])).toEqual([
      ["2026-01-05", 2],
      ["2026-01-08", 1],
    ]);
  });
});

describe("cadence", () => {
  it("reads a steady twice-a-week client as ~2 a week with no breaks", () => {
    // Mon/Thu for twelve weeks, ending on the last Thursday before "today".
    const sessions = Array.from({ length: 12 }, (_, w) => [
      on(addDays("2026-06-15", w * 7)),
      on(addDays("2026-06-18", w * 7)),
    ]).flat();
    const { days } = toVisitDays(sessions, NY);
    const c = computeCadence(days, "2026-09-06");
    expect(c.sessions).toBe(24);
    expect(c.breaks).toHaveLength(0);
    expect(c.onBreak).toBe(false);
    // Mon→Thu is 3 days and Thu→Mon is 4: the middle gap is 3, the middle half 3–4.
    expect(c.typicalGapDays).toBe(3);
    expect(c.typicalGapRange).toEqual([3, 4]);
    expect(c.perWeekRecent).toBeCloseTo(2, 1);
    expect(perWeekLabel(c.perWeekRecent)).toBe("2");
  });

  it(`calls a gap a break at ${BREAK_MIN_GAP_DAYS} days, not 13`, () => {
    const almost = toVisitDays([on("2026-03-01"), on("2026-03-14")], NY).days;
    const exact = toVisitDays([on("2026-03-01"), on("2026-03-15")], NY).days;
    expect(computeCadence(almost, "2026-03-14").breaks).toHaveLength(0);
    expect(computeCadence(exact, "2026-03-15").breaks).toHaveLength(1);
  });

  it("finds the longest break and ranks breaks newest first", () => {
    const sessions = [
      ...every("2026-01-05", 4, 5), // to Jan 21
      ...every("2026-02-20", 4, 5), // 30-day break, to Mar 8
      ...every("2026-03-25", 4, 4), // 17-day break, to Apr 6
    ];
    const { days } = toVisitDays(sessions, NY);
    const c = computeCadence(days, "2026-04-08");
    expect(c.breaks.map((b) => b.days)).toEqual([17, 30]);
    expect(c.longestBreak).toMatchObject({ from: "2026-01-21", to: "2026-02-20", days: 30 });
    expect(c.typicalGapDays).toBe(4);
    expect(c.typicalGapRange).toEqual([4, 4]);
  });

  it("reports a break that is still going", () => {
    const { days } = toVisitDays(every("2026-06-01", 3, 10), NY); // last visit Jun 28
    const c = computeCadence(days, "2026-07-28");
    expect(c.onBreak).toBe(true);
    expect(c.daysSinceLast).toBe(30);
    expect(c.breaks[0]).toMatchObject({ ongoing: true, from: "2026-06-28", to: "2026-07-28" });
    // Ten visits since Jun 1: measured from the first visit, not over twelve weeks.
    expect(c.perWeekRecent).toBeCloseTo(1.2, 1);
  });

  it("measures a new client over the time they have been coming, not twelve weeks", () => {
    const { days } = toVisitDays([on("2026-09-01"), on("2026-09-04"), on("2026-09-08")], NY);
    const c = computeCadence(days, "2026-09-10");
    // 3 visits over 10 days, not 3 over 12 weeks.
    expect(c.perWeekRecent).toBeCloseTo(2.1, 1);
  });

  it("returns an empty picture for a client with no sessions", () => {
    const c = computeCadence([], "2026-09-10");
    expect(c).toMatchObject({ sessions: 0, first: null, perWeekRecent: null, longestBreak: null, onBreak: false });
    expect(findGaps([], "2026-09-10")).toEqual([]);
  });
});

describe("buildCalendar", () => {
  const events: ClientEvent[] = [
    { id: "e1", date: "2025-12-22", endDate: "2026-01-04", title: "Florida", type: "Snowbird", priority: "Low" },
    { id: "e2", date: "2026-02-03", title: "90-day report", type: "Progress Report", priority: "Medium" },
  ];

  const build = () => {
    const sessions = [
      ...every("2025-11-10", 4, 10), // Nov 10 → Dec 16
      ...every("2026-01-20", 3, 9), // after a 35-day break; Jan 20 → Feb 13
    ];
    const { days } = toVisitDays(sessions, NY);
    const cadence = computeCadence(days, "2026-02-15");
    return buildCalendar({ days, events: toTimelineEvents(events), cadence, today: "2026-02-15" });
  };

  it("covers first visit → today, newest year first, months in reading order", () => {
    const years = build();
    expect(years.map((y) => y.year)).toEqual([2026, 2025]);
    expect(years[0].months.map((m) => m.shortName)).toEqual(["Jan", "Feb"]);
    expect(years[1].months.map((m) => m.shortName)).toEqual(["Nov", "Dec"]);
  });

  it("lays every month out as six Sunday-first weeks", () => {
    const [y2026, y2025] = build();
    for (const m of [...y2026.months, ...y2025.months]) expect(m.cells).toHaveLength(42);
    const feb = y2026.months[1];
    expect(feb.cells[0]?.day).toBe(1); // Feb 1 2026 is a Sunday
    const nov = y2025.months[0];
    expect(nov.cells.slice(0, 6).every((c) => c === null)).toBe(true); // Nov 1 2025 is a Saturday
    expect(nov.cells[6]?.day).toBe(1);
  });

  it("marks visits, the days before the first one, breaks, away days and the future", () => {
    const [y2026, y2025] = build();
    const cell = (months: typeof y2026.months, key: string) =>
      months.flatMap((m) => m.cells).find((c) => c?.key === key)!;

    expect(cell(y2025.months, "2025-11-09").state).toBe("before");
    expect(cell(y2025.months, "2025-11-10").state).toBe("visit");
    expect(cell(y2025.months, "2025-11-11").state).toBe("rest");
    // The 35-day gap Dec 16 → Jan 20: the snowbird trip explains part of it.
    expect(cell(y2025.months, "2025-12-18").state).toBe("break");
    expect(cell(y2025.months, "2025-12-25").state).toBe("away");
    expect(cell(y2026.months, "2026-01-10").state).toBe("break");
    expect(cell(y2026.months, "2026-02-15").isToday).toBe(true);
    expect(cell(y2026.months, "2026-02-16").state).toBe("future");
    expect(cell(y2026.months, "2026-02-03").hasMarker).toBe(true);
  });

  it("totals each month and year and counts breaks that touch a year", () => {
    const [y2026, y2025] = build();
    expect(y2025.sessions).toBe(10);
    expect(y2026.sessions).toBe(9);
    expect(y2026.months[0].sessions).toBe(4); // Jan 20, 23, 26, 29
    expect(y2025.breakCount).toBe(1);
    expect(y2026.breakCount).toBe(1);
    expect(y2025.months[1].events.map((e) => e.title)).toEqual(["Florida"]);
  });

  it("draws nothing for a client with no visits", () => {
    expect(
      buildCalendar({ days: [], events: [], cadence: computeCadence([], "2026-09-10"), today: "2026-09-10" }),
    ).toEqual([]);
  });
});

describe("buildList", () => {
  it("runs newest first and writes each break in where it happened", () => {
    const sessions = [on("2026-03-02"), on("2026-03-05"), on("2026-03-24"), on("2026-04-02")];
    const { days, undated } = toVisitDays(sessions, NY);
    const cadence = computeCadence(days, "2026-04-03");
    const { months, ongoing } = buildList({ days, undated, events: [], cadence });

    expect(ongoing).toBeNull();
    expect(months.map((m) => m.key)).toEqual(["2026-04", "2026-03"]);
    const march = months[1].items.map((i) => (i.kind === "session" ? i.dayKey : `break:${i.gap.days}`));
    expect(march).toEqual(["2026-03-24", "break:19", "2026-03-05", "2026-03-02"]);
  });

  it("puts the days since the last visit on the first session of each day only", () => {
    const sessions = [on("2026-03-02"), on("2026-03-06"), on("2026-03-06")];
    const { days, undated } = toVisitDays(sessions, NY);
    const { months } = buildList({ days, undated, events: [], cadence: computeCadence(days, "2026-03-07") });
    const gaps = months[0].items.map((i) => (i.kind === "session" ? i.gapDays : "x"));
    expect(gaps).toEqual([4, null, null]);
  });

  it("numbers completed sessions from the history length, or down from the client's count", () => {
    const sessions = [on("2026-03-02"), on("2026-03-05", { status: "In-Progress" }), on("2026-03-09")];
    const { days, undated } = toVisitDays(sessions, NY);
    const cadence = computeCadence(days, "2026-03-10");
    const numbers = (anchor?: number) =>
      buildList({ days, undated, events: [], cadence, numberAnchor: anchor }).months[0].items.map((i) =>
        i.kind === "session" ? i.number : "x",
      );
    expect(numbers()).toEqual([2, null, 1]);
    // 212 completed on the client, only these loaded: the newest is #212, not #2.
    expect(numbers(212)).toEqual([212, null, 211]);
  });

  it("files undated sessions last and surfaces an ongoing break with its reason", () => {
    const events = toTimelineEvents([
      { id: "v", date: "2026-08-01", endDate: "2026-08-20", title: "Italy", type: "Vacation", priority: "Low" },
    ]);
    const { days, undated } = toVisitDays([on("2026-07-28"), on("")], NY);
    const cadence = computeCadence(days, "2026-08-25");
    const { months, ongoing } = buildList({ days, undated, events, cadence });
    expect(months[months.length - 1].key).toBe("undated");
    expect(ongoing?.gap).toMatchObject({ ongoing: true, days: 28 });
    expect(ongoing?.away?.title).toBe("Italy");
  });
});

describe("awayEventFor", () => {
  it("picks the away event that overlaps a gap most, and ignores other event types", () => {
    const events = toTimelineEvents([
      { id: "a", date: "2026-01-02", title: "Doctor", type: "Medical", priority: "High" },
      { id: "b", date: "2026-01-05", endDate: "2026-01-25", title: "Cruise", type: "Vacation", priority: "Low" },
      { id: "c", date: "2026-01-06", endDate: "2026-01-30", title: "Report", type: "Progress Report", priority: "Low" },
    ]);
    const gap = { from: "2026-01-01", to: "2026-01-28", days: 27, ongoing: false };
    expect(awayEventFor(gap, events)?.title).toBe("Cruise");
    expect(awayEventFor({ ...gap, from: "2026-03-01", to: "2026-03-20" }, events)).toBeNull();
  });
});

describe("summarizeSession", () => {
  it("counts machines once, skips placeholders, and treats an unrated set as completed", () => {
    const logs = [
      log("s1", "leg-press", { repQuality: 3 }),
      log("s1", "pulldown"),
      log("s1", "chest-press", { repQuality: 1, side: "Left" }),
      log("s1", "chest-press", { repQuality: 3, side: "Right" }),
      log("s1", "lumbar", { weight: "0", reps: "0", seconds: "0" }), // "Log past session" placeholder
    ];
    const s = summarizeSession(logs);
    expect(s.machines).toBe(3);
    expect([s.max, s.done, s.poor]).toEqual([1, 1, 1]); // chest press shows its Left set
    // Volume counts both chest-press sides: 4 real sets × 100 × 8.
    expect(s.volume).toBe(3200);
  });

  it("maps out-of-range legacy quality to completed", () => {
    expect(qualityOf(log("s", "m", { repQuality: 7 as never }))).toBe(2);
    expect(qualityOf(log("s", "m"))).toBe(2);
  });
});

describe("weightUpsBySession", () => {
  it("counts machines heavier than last time, and never across a session it cannot see", () => {
    const logs = new Map<string, ExerciseLog[]>([
      ["a", [log("a", "m1", { weight: "100" }), log("a", "m2", { weight: "50" })]],
      ["b", [log("b", "m1", { weight: "105" }), log("b", "m2", { weight: "50" })]],
      // "c" is not loaded
      ["d", [log("d", "m1", { weight: "115" })]],
    ]);
    const ups = weightUpsBySession(["a", "b", "c", "d"], logs);
    expect(ups.get("a")).toBe(0);
    expect(ups.get("b")).toBe(1);
    expect(ups.has("c")).toBe(false);
    // Compared with "b" it would be +1, but "c" may have been 115 already.
    expect(ups.get("d")).toBe(0);
  });
});

describe("volumeDeltas", () => {
  it("compares with the last session on the same routine, not the one before", () => {
    // The live flow writes routineId only — that is the key.
    const a1 = on("2026-03-02", { id: "a1", routineId: "rA" });
    const b1 = on("2026-03-05", { id: "b1", routineId: "rB" });
    const a2 = on("2026-03-09", { id: "a2", routineId: "rA" });
    const logs = new Map<string, ExerciseLog[]>([
      ["a1", [log("a1", "m1", { weight: "100", reps: "10" })]], // 1000
      ["b1", [log("b1", "m9", { weight: "300", reps: "10" })]], // 3000
      ["a2", [log("a2", "m1", { weight: "110", reps: "10" })]], // 1100
    ]);
    const deltas = volumeDeltas([a2, b1, a1], logs);
    expect(deltas.get("a2")).toEqual({ pct: 10, against: "rA" });
    expect(deltas.has("b1")).toBe(false); // no earlier B
    expect(deltas.has("a1")).toBe(false);
  });

  it("falls back to routineName on documents that carry the name instead", () => {
    const a1 = on("2026-03-02", { id: "a1", routineName: "Routine A" });
    const b1 = on("2026-03-05", { id: "b1", routineName: "Routine B" });
    const a2 = on("2026-03-09", { id: "a2", routineName: "Routine A" });
    const logs = new Map<string, ExerciseLog[]>([
      ["a1", [log("a1", "m1", { weight: "100", reps: "10" })]],
      ["b1", [log("b1", "m9", { weight: "300", reps: "10" })]],
      ["a2", [log("a2", "m1", { weight: "90", reps: "10" })]],
    ]);
    expect(volumeDeltas([a2, b1, a1], logs).get("a2")?.pct).toBe(-10);
  });

  it("says nothing when the earlier session's sets are not loaded", () => {
    const a1 = on("2026-03-02", { id: "a1", routineName: "Routine A" });
    const a2 = on("2026-03-09", { id: "a2", routineName: "Routine A" });
    const deltas = volumeDeltas([a2, a1], new Map([["a2", [log("a2", "m1")]]]));
    expect(deltas.size).toBe(0);
  });
});

describe("routineNamer", () => {
  it("names a session's routine from its id, then from its own name", () => {
    const nameOf = routineNamer([{ id: "rA", name: "Routine A" }, { id: "rB", name: "Routine B" }]);
    expect(nameOf(on("2026-03-02", { routineId: "rB" }))).toBe("Routine B");
    expect(nameOf(on("2026-03-02", { routineName: "Routine A" }))).toBe("Routine A");
    expect(nameOf(on("2026-03-02", { routineId: "deleted" }))).toBeNull();
    expect(routineLetter(nameOf(on("2026-03-02", { routineId: "rA" })))).toBe("A");
  });
});

describe("routineLetter", () => {
  it("reads lettered routines and nothing else", () => {
    expect(routineLetter("Routine A")).toBe("A");
    expect(routineLetter("routine b")).toBe("B");
    expect(routineLetter("B")).toBe("B");
    expect(routineLetter("Back Focus")).toBeNull();
    expect(routineLetter(undefined)).toBeNull();
  });
});

describe("words", () => {
  it("says spans the way a trainer would", () => {
    expect(describeSpan(1)).toBe("1 day");
    expect(describeSpan(13)).toBe("13 days");
    expect(describeSpan(35)).toBe("5 weeks");
    expect(describeSpan(120)).toBe("4 months");
    expect(describeSpanAdjective(21)).toBe("3-week");
    expect(describeSpanAdjective(13)).toBe("13-day");
    expect(describeSpanAdjective(1)).toBe("1-day");
  });

  it("adds years to a range only when they are not this year", () => {
    expect(describeRange("2026-01-05", "2026-02-09", 2026)).toBe("Jan 5 – Feb 9");
    expect(describeRange("2025-12-20", "2026-01-27", 2026)).toBe("Dec 20, 2025 – Jan 27, 2026");
    expect(describeRange("2025-03-03", "2025-03-17", 2026)).toBe("Mar 3 – Mar 17, 2025");
    expect(describeRange("2024-12-19", "2025-03-18", 2026, true)).toBe("Dec 19 ’24 – Mar 18 ’25");
  });
});
