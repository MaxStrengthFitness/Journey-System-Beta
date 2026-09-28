import { describe, expect, it } from "vitest";
import type { ScheduleEntry } from "../../types";
import {
  SIZE_CEILING_BYTES,
  SKIP_ABOVE_BYTES,
  WINDOW_WEEKS,
  coverageMonths,
  foldSummary,
  foldWindow,
  storedBytes,
  type FoldInput,
} from "./fold";
import { cellFor, readSummary, summaryForWrite, type OpeningsSummary } from "./summary-doc";
import { usualWeek } from "./usual";
import { buildDemoWeek } from "../demo-mode/week";
import {
  MONDAYS,
  PAT_WEEK,
  SAM_WEEK,
  SUNDAY_RUN,
  TRAINERS,
  TZ,
  WHOLE_WINDOW,
  at,
  booking,
  monday,
  pat,
  readInFull,
  sam,
  standingWeek,
} from "./fixtures";

const everyMonday = () => MONDAYS.flatMap(monday);

const input = (over: Partial<FoldInput> = {}): FoldInput => ({
  studioId: "westlake",
  tz: TZ,
  now: SUNDAY_RUN,
  bookings: everyMonday(),
  coverage: WHOLE_WINDOW,
  trainers: TRAINERS,
  weeks: [SAM_WEEK, PAT_WEEK],
  previous: null,
  ...over,
});

/** The cell at a time in the week of a Monday, read back as the screen reads it. */
const cell = (s: OpeningsSummary, key: string, mondayOf: string) => cellFor(s, key, MONDAYS.indexOf(mondayOf));
const names = (s: OpeningsSummary, keys: readonly string[]) => keys.map((k) => s.who[k]?.n);
const idx = (m: string) => String(MONDAYS.indexOf(m));

describe("the window", () => {
  it("is the eight Monday-to-Saturday weeks ended by the studio's today: on a Sunday, the week just ended", () => {
    const w = foldWindow("2026-11-08", TZ);
    expect(w.mondays).toEqual(MONDAYS);
    expect(w.mondays).toHaveLength(WINDOW_WEEKS);
    expect([w.first, w.last]).toEqual(["2026-09-14", "2026-11-07"]);
  });

  it("on a Wednesday it starts with last week, and on a Saturday too (today isn't over)", () => {
    expect(foldWindow("2026-11-04", TZ).mondays[0]).toBe("2026-10-26");
    expect(foldWindow("2026-11-07", TZ).mondays[0]).toBe("2026-10-26");
    expect(foldWindow("2026-11-09", TZ).mondays[0]).toBe("2026-11-02");
  });

  it("reads the studio's own midnights across the clock change (Sun Nov 1 2026)", () => {
    const w = foldWindow("2026-11-08", TZ);
    expect(w.start.toISOString()).toBe("2026-09-14T04:00:00.000Z"); // midnight EDT
    expect(w.end.toISOString()).toBe("2026-11-08T04:59:59.999Z"); // the end of Saturday, EST
    expect(coverageMonths(w)).toEqual(["2026-09", "2026-10", "2026-11"]);
  });

  it("takes today from the studio's clock, never UTC's", () => {
    // 04:30 UTC on Sunday is still 11:30 PM Saturday in the studio: Saturday isn't over.
    const s = foldSummary(input({ now: new Date("2026-11-08T04:30:00Z") }));
    expect(s.weeks[0].m).toBe("2026-10-26");
  });
});

describe("foldSummary — an ordinary eight weeks", () => {
  const s = foldSummary(input());

  it("is the document the screen checks, with a week per Monday, newest first", () => {
    expect(s).toMatchObject({ v: 1, tz: TZ, row: 30, since: "2026-09-14", builtAt: SUNDAY_RUN.toISOString() });
    expect(s.weeks.map((w) => w.m)).toEqual(MONDAYS);
    expect(s.weeks[0].d["1"]).toEqual({ n: 4, j: 1 });
    // A Tuesday nothing is booked on is open with nothing, and judged.
    expect(s.weeks[0].d["2"]).toEqual({ n: 0, j: 1 });
  });

  it("names every trainer a time names, in name order", () => {
    expect(Object.values(s.who)).toEqual([
      { id: "t-pat", n: "Pat Moss" },
      { id: "t-sam", n: "Sam Lee" },
    ]);
  });

  it("works out each week's word with the one rule", () => {
    for (const m of MONDAYS) {
      expect(cell(s, "1-0700", m)).toMatchObject({ word: "room", booked: 1 });
      expect(cell(s, "1-0730", m)).toMatchObject({ word: "none", booked: 0 });
      expect(cell(s, "1-0800", m)).toMatchObject({ word: "full", booked: 2 });
      expect(cell(s, "1-0900", m)).toMatchObject({ word: "full", booked: 1 });
      expect(cell(s, "1-0930", m)).toMatchObject({ word: "none" });
      expect(names(s, cell(s, "1-0800", m)!.inKeys)).toEqual(["Pat Moss", "Sam Lee"]);
      expect(names(s, cell(s, "1-0900", m)!.inKeys)).toEqual(["Sam Lee"]);
    }
    // After 10:00 nobody is in and nothing is booked: nothing stored, "nobody in" read back.
    expect(s.cells["1-1000"]).toBeUndefined();
    expect(cell(s, "1-1000", MONDAYS[0])).toMatchObject({ word: "out", booked: 0 });
  });

  it("the week the clocks go back reads 8:00 as 8:00 on both sides", () => {
    expect(cell(s, "1-0800", "2026-10-26")).toEqual(cell(s, "1-0800", "2026-11-02"));
    expect(s.cells["1-0700"]?.[idx("2026-11-02")]).toBeDefined();
  });

  it("keeps the agreed weeks in force, by short key", () => {
    const keyOf = (id: string) => Object.entries(s.who).find(([, w]) => w.id === id)![0];
    expect(s.agreed[keyOf("t-sam")]).toEqual([{ from: "2026-09-01", to: null, blocks: ["1-0700-1000"] }]);
  });

  it("carries no client names or ids", () => {
    const text = JSON.stringify(s);
    expect(text).not.toMatch(/Client \d|"c\d+"/);
  });

  it("is written with nothing undefined, and reads back to itself", () => {
    const written = summaryForWrite(s);
    const walk = (v: unknown): void => {
      expect(v).not.toBeUndefined();
      if (v && typeof v === "object") for (const x of Object.values(v)) walk(x);
    };
    walk(written);
    expect(JSON.stringify(written)).not.toContain('"to":null');
    const back = readSummary(JSON.parse(JSON.stringify(written)));
    expect(back.state).toBe("ok");
    if (back.state === "ok") expect(back.summary).toEqual(s);
  });
});

describe("foldSummary — which days count", () => {
  it("a week read only in part: the days not read in full don't count, however many bookings they hold", () => {
    const s = foldSummary(input({ coverage: readInFull("2026-09-01", "2026-11-30", ["2026-10-12", "2026-10-13"]) }));
    expect(s.weeks[3].m).toBe("2026-10-12");
    expect(s.weeks[3].d["1"]).toEqual({ n: 4, x: "r" });
    expect(s.weeks[3].d["3"]).toEqual({ n: 0, j: 1 });
    expect(cell(s, "1-0800", "2026-10-12")).toBeNull();
    expect(s.cells["1-0800"][idx("2026-10-12")]).toBeUndefined();
  });

  it("no record at all: no day counts, and nothing is said about any time", () => {
    const s = foldSummary(input({ coverage: new Map() }));
    expect(s.since).toBeNull();
    expect(s.cells).toEqual({});
    expect(s.weeks.every((w) => Object.values(w.d).every((d) => d.x === "r"))).toBe(true);
  });

  it("the closure test: a holiday Monday whose bookings were all cancelled in good time is closed", () => {
    const holiday = "2026-10-12";
    const bookings = everyMonday().map((b) =>
      b.startTime.getTime() >= at(holiday, "00:00").getTime() && b.startTime.getTime() < at(holiday, "23:59").getTime()
        ? { ...b, status: "Cancelled" as const, cancelledAt: at("2026-10-09", "10:00") }
        : b,
    );
    const s = foldSummary(input({ bookings }));
    expect(s.weeks[3].d["1"]).toEqual({ n: 0, x: "c" });
    expect(cell(s, "1-0800", holiday)).toBeNull();
  });

  it("Demo Mode: every day holding a demo booking counts without a record", () => {
    const s = foldSummary(input({ coverage: new Map(), isDemo: true }));
    expect(s.weeks[0].d["1"]).toEqual({ n: 4, j: 1 });
    expect(s.since).toBe("2026-09-14");
    // The fixture books only Mondays: the other days hold no demo booking, so they don't count.
    expect(s.weeks[0].d["2"]).toEqual({ n: 0, x: "r" });
    // Eight weeks of demo bookings: all eight weeks count.
    expect(usualWeek(s).weeksCounted).toBe(8);
  });

  it("Demo Mode, the first Sunday after a seed: only the days from the seed count, never the empty weeks before it", () => {
    // The seeder lays the week down from its own day forward (demo-mode/week.ts): here a Wednesday in the window's newest week.
    const seed = "2026-11-04";
    const bookings: ScheduleEntry[] = buildDemoWeek(seed).map((b) => ({
      id: b.id,
      clientId: b.clientKey,
      clientName: b.clientKey,
      trainerId: `t-${b.trainerKey}`,
      trainerName: b.trainerKey,
      studioId: "demo-studio",
      startTime: new Date(b.startIso),
      endTime: new Date(b.endIso),
      status: b.cancelled ? "Cancelled" : "Scheduled",
    })) as ScheduleEntry[];
    const s = foldSummary(input({ studioId: "demo-studio", isDemo: true, coverage: new Map(), bookings, weeks: [], trainers: [] }));
    const u = usualWeek(s);
    expect(u.weeksCounted).toBe(1);
    expect(u.enough).toBe(false);
    expect(s.since).toBe("2026-11-02");
    // Monday and Tuesday of the seed's week, and every day before it, hold no demo booking.
    expect(s.weeks[0].d["1"]).toEqual({ n: 0, x: "r" });
    expect(s.weeks[0].d["2"]).toEqual({ n: 0, x: "r" });
    expect(s.weeks[0].d["3"]).toMatchObject({ n: 1 });
    expect(s.weeks[0].d["3"].x).toBeUndefined();
    for (const w of s.weeks.slice(1)) expect(Object.values(w.d).every((d) => d.x === "r" && d.n === 0)).toBe(true);
  });

  it("Demo Mode: a Reset starts over, so last Sunday's since isn't carried", () => {
    const previous = { ...foldSummary(input()), since: "2026-08-03" };
    expect(foldSummary(input({ isDemo: true, coverage: new Map(), previous })).since).toBe("2026-09-14");
  });

  it("since is the first Monday with a counted day, carried from last Sunday's when older", () => {
    expect(foldSummary(input({ coverage: readInFull("2026-10-01", "2026-11-30") })).since).toBe("2026-09-28");
    const previous = { ...foldSummary(input()), since: "2026-08-03" };
    expect(foldSummary(input({ previous })).since).toBe("2026-08-03");
  });
});

describe("foldSummary — cancellations", () => {
  /** Pat's 8:00 that Monday cancelled; Pat keeps a 7:30 that day, so Pat was in. */
  const cancelledPat = (m: string, cancelledAt: Date | null, keepsAnother = true) => [
    ...everyMonday().map((b) => (b.trainerId === "t-pat" && b.startTime.getTime() === at(m, "08:00").getTime() ? { ...b, status: "Cancelled" as const, cancelledAt } : b)),
    ...(keepsAnother ? [pat(m, "07:30")] : []),
  ];

  it("a trainer whose only booking that day was cancelled in good time may not have worked: not in", () => {
    const s = foldSummary(input({ bookings: cancelledPat("2026-10-19", at("2026-10-16", "09:00"), false) }));
    expect(cell(s, "1-0800", "2026-10-19")).toMatchObject({ word: "full", booked: 1, cancelled: 1 });
    expect(names(s, cell(s, "1-0800", "2026-10-19")!.inKeys)).toEqual(["Sam Lee"]);
  });

  it("the old sweep's unstamped cancellation: not booked, and not counted as a cancellation", () => {
    const s = foldSummary(input({ bookings: cancelledPat("2026-10-19", null) }));
    expect(cell(s, "1-0800", "2026-10-19")).toMatchObject({ word: "room", booked: 1, cancelled: 0, late: 0 });
  });

  it("a stamp later than its start: not booked, a cancellation, never a late one", () => {
    const s = foldSummary(input({ bookings: cancelledPat("2026-10-26", at("2026-10-27", "09:00")) }));
    expect(cell(s, "1-0800", "2026-10-26")).toMatchObject({ word: "room", booked: 1, cancelled: 1, late: 0 });
  });

  it("a cancellation exactly 24 hours before is on time; a minute less is late, and still booked", () => {
    const onTime = foldSummary(input({ bookings: cancelledPat("2026-09-28", at("2026-09-27", "08:00")) }));
    expect(cell(onTime, "1-0800", "2026-09-28")).toMatchObject({ word: "room", booked: 1, cancelled: 1, late: 0 });
    const late = foldSummary(input({ bookings: cancelledPat("2026-09-21", at("2026-09-20", "08:01")) }));
    expect(cell(late, "1-0800", "2026-09-21")).toMatchObject({ word: "full", booked: 2, cancelled: 1, late: 1 });
  });
});

describe("foldSummary — rotation, and bookings Journey can't place", () => {
  it("a rotation booking takes a free trainer's place without saying whose", () => {
    const s = foldSummary(input({ bookings: [...everyMonday(), booking("2026-11-02", "07:00", { trainerId: undefined, trainerName: "Westlake Rotation" })] }));
    expect(cell(s, "1-0700", "2026-11-02")).toMatchObject({ word: "full", booked: 2, rotation: 1 });
  });

  it("a rotation Saturday with nobody in: how many were booked, nothing more", () => {
    const rota = Array.from({ length: 5 }, () => booking("2026-11-07", "09:00", { trainerId: undefined, trainerName: "Westlake Rotation" }));
    const s = foldSummary(input({ bookings: [...everyMonday(), ...rota] }));
    expect(cell(s, "6-0900", "2026-11-02")).toEqual({ word: "out", booked: 5, rotation: 5, cancelled: 0, late: 0, inKeys: [] });
  });

  it("a trainer without an agreed week, free between bookings: the day can't be judged", () => {
    const kim = [booking("2026-10-05", "07:00", { trainerId: "t-kim", trainerName: "Kim Ray" }), booking("2026-10-05", "09:00", { trainerId: "t-kim", trainerName: "Kim Ray" })];
    const s = foldSummary(input({ bookings: [...everyMonday(), ...kim] }));
    expect(s.weeks[4].d["1"]).toEqual({ n: 6, q: "a" });
    expect(cell(s, "1-0800", "2026-10-05")).toEqual({ word: "booked", booked: 2, rotation: 0, cancelled: 0, late: 0, inKeys: [] });
    // Nothing is claimed about 7:30, where Kim was probably free.
    expect(cell(s, "1-0730", "2026-10-05")).toMatchObject({ word: "booked", booked: 0 });
    // The other Mondays are judged as ever.
    expect(cell(s, "1-0800", "2026-10-12")).toMatchObject({ word: "full" });
  });

  it("a booking Journey can't place: the day can't be judged", () => {
    const s = foldSummary(input({ bookings: [...everyMonday(), booking("2026-11-02", "07:30", { trainerId: undefined, trainerName: "Samuel Lee" })] }));
    expect(s.weeks[0].d["1"]).toEqual({ n: 5, q: "p" });
    expect(cell(s, "1-0730", "2026-11-02")).toMatchObject({ word: "booked", booked: 1 });
  });

  it("an Unavailable block is never a booking, but it takes its trainer out for the time it covers", () => {
    const block = sam("2026-11-02", "09:30", { clientName: "Unavailable", clientId: undefined });
    const s = foldSummary(input({ bookings: [...everyMonday(), block] }));
    expect(s.weeks[0].d["1"]).toEqual({ n: 4, j: 1 });
    // Sam was the only one in at 9:30, and his block took him out: nobody in, never "nobody booked".
    expect(cell(s, "1-0930", "2026-11-02")).toMatchObject({ word: "out", booked: 0, inKeys: [] });
    // Another Monday, no block: Sam in and free.
    expect(cell(s, "1-0930", "2026-10-26")).toMatchObject({ word: "none", booked: 0 });
    // A cancelled block blocks nothing.
    const cancelled = foldSummary(input({ bookings: [...everyMonday(), { ...block, status: "Cancelled" }] }));
    expect(cell(cancelled, "1-0930", "2026-11-02")).toMatchObject({ word: "none", booked: 0 });
  });
});

describe("foldSummary — agreed weeks over time", () => {
  it("an agreed week changed mid-window: the old version is kept, and each day reads the one in force", () => {
    const first = foldSummary(input({ now: new Date("2026-10-11T07:00:00Z"), weeks: [standingWeek({ hours: [{ weekday: 1, from: "06:00", to: "10:00" }] }), PAT_WEEK] }));
    const changed = standingWeek({ finalAt: at("2026-10-14", "12:00") });
    const s = foldSummary(input({ weeks: [changed, PAT_WEEK], previous: first }));
    const samKey = Object.entries(s.who).find(([, w]) => w.id === "t-sam")![0];
    expect(s.agreed[samKey]).toEqual([
      { from: "2026-09-01", to: "2026-10-13", blocks: ["1-0600-1000"] },
      { from: "2026-10-14", to: null, blocks: ["1-0700-1000"] },
    ]);
    // Sam took clients at 6:00 then, so 6:00 had room; since Oct 14 nobody is in then.
    expect(cell(s, "1-0600", "2026-10-12")).toMatchObject({ word: "none" });
    expect(names(s, cell(s, "1-0600", "2026-10-12")!.inKeys)).toEqual(["Sam Lee"]);
    expect(cell(s, "1-0600", "2026-10-19")).toMatchObject({ word: "out" });
  });

  it("without last Sunday's summary, today's week is never applied before the day it was agreed", () => {
    const s = foldSummary(input({ weeks: [standingWeek({ finalAt: at("2026-10-14", "12:00") }), PAT_WEEK] }));
    // Before Oct 14 Sam had bookings and no agreed week: those Mondays can't be judged.
    expect(s.weeks[3].d["1"]).toEqual({ n: 4, q: "a" });
    expect(s.weeks[2].d["1"]).toEqual({ n: 4, j: 1 });
  });

  it("a new hire: the days before their first agreement can't be judged, the days after can", () => {
    const kimBookings = ["2026-10-12", "2026-10-19", "2026-10-26", "2026-11-02"].map((m) => booking(m, "07:30", { trainerId: "t-kim", trainerName: "Kim Ray" }));
    const kim = standingWeek({ id: "uid-kim", trainerUid: "uid-kim", trainerId: "t-kim", trainerName: "Kim Ray", finalAt: at("2026-10-20", "12:00") });
    const s = foldSummary(input({ bookings: [...everyMonday(), ...kimBookings], trainers: [...TRAINERS, { id: "t-kim", name: "Kim Ray" }], weeks: [SAM_WEEK, PAT_WEEK, kim] }));
    expect(s.weeks[2].d["1"]).toEqual({ n: 5, q: "a" }); // Oct 19
    expect(s.weeks[1].d["1"]).toEqual({ n: 5, j: 1 }); // Oct 26
    expect(s.weeks[5].d["1"]).toEqual({ n: 4, j: 1 }); // Sep 28, before Kim's first booking
    expect(cell(s, "1-0730", "2026-10-26")).toMatchObject({ word: "room", booked: 1 });
  });

  it("a trainer whose document id and sign-in id differ is placed by the trainer id", () => {
    const kim = standingWeek({ id: "uid-kim", trainerUid: "uid-kim", trainerId: "t-kim", trainerName: "Kim Ray" });
    const s = foldSummary(input({ bookings: [booking("2026-11-02", "07:00", { trainerId: "t-kim", trainerName: "Kim Ray" })], weeks: [kim], trainers: [] }));
    expect(s.weeks[0].d["1"]).toEqual({ n: 1, j: 1 });
    expect(names(s, cell(s, "1-0730", "2026-11-02")!.inKeys)).toEqual(["Kim Ray"]);
  });

  it("names someone who has left from last Sunday's summary", () => {
    const gone = { ...foldSummary(input()), who: { "0": { id: "t-gone", n: "Jo Gone" } }, agreed: { "0": [{ from: "2026-09-01", to: null, blocks: ["1-0700-1000"] }] } };
    const s = foldSummary(input({ previous: gone, bookings: [...everyMonday(), booking("2026-11-02", "08:30", { trainerId: "t-gone", trainerName: "" })] }));
    expect(Object.values(s.who).find((w) => w.id === "t-gone")?.n).toBe("Jo Gone");
  });
});

describe("foldSummary — how long a booking is", () => {
  it("a 60-minute booking fills both its half-hours, and one at 8:15 fills 8:00 and 8:30", () => {
    const bookings: ScheduleEntry[] = [
      ...MONDAYS.slice(1).flatMap(monday),
      sam("2026-11-02", "07:00"),
      sam("2026-11-02", "08:00"),
      pat("2026-11-02", "08:00"),
      sam("2026-11-02", "09:00", { minutes: 60 }),
      pat("2026-11-02", "08:15"),
    ];
    const s = foldSummary(input({ bookings }));
    expect(cell(s, "1-0930", "2026-11-02")).toMatchObject({ word: "full", booked: 1 });
    expect(cell(s, "1-0800", "2026-11-02")).toMatchObject({ word: "full", booked: 3 });
    expect(cell(s, "1-0830", "2026-11-02")).toMatchObject({ word: "room", booked: 1 });
  });
});

describe("the size ceiling", () => {
  it("counts the bytes the way Firestore does", () => {
    expect(storedBytes({ a: "x" }, false)).toBe(2 + 2);
    expect(storedBytes({ a: 1, b: [true, null] }, false)).toBe(2 + 8 + 2 + 1 + 1);
    expect(storedBytes("é", false)).toBe(3);
    expect(SKIP_ABOVE_BYTES).toBe(2 * SIZE_CEILING_BYTES);
  });

  it("a busy studio (eight trainers, every half-hour booked, six days, eight weeks) stays under the ceiling", () => {
    const people = Array.from({ length: 8 }, (_, i) => ({ id: `t-${i}`, name: `Trainer Number${i} Longname` }));
    const hours = [1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, from: "05:30", to: "20:00" }));
    const weeks = people.map((p) => standingWeek({ id: `uid-${p.id}`, trainerUid: `uid-${p.id}`, trainerId: p.id, trainerName: p.name, hours }));
    const bookings: ScheduleEntry[] = [];
    for (const m of MONDAYS) {
      for (let d = 0; d < 6; d += 1) {
        const day = new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1, Number(m.slice(8, 10)) + d)).toISOString().slice(0, 10);
        for (let min = 330; min < 1200; min += 30) {
          const clock = `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
          for (const p of people.slice(0, 7)) bookings.push(booking(day, clock, { trainerId: p.id, trainerName: p.name, ...(min % 90 === 0 ? { status: "Cancelled" as const, cancelledAt: at(day, "06:00") } : {}) }));
        }
      }
    }
    const s = foldSummary(input({ bookings, weeks, trainers: people }));
    const bytes = storedBytes(summaryForWrite(s));
    expect(Object.keys(s.cells).length).toBeGreaterThan(150);
    expect(bytes).toBeLessThan(SIZE_CEILING_BYTES);
  });
});
