import { describe, expect, it } from "vitest";
import type { ScheduleEntry } from "../../types";
import { foldSummary } from "./fold";
import { normalizeMark } from "./marks";
import { linesFor, nextDays, timesWithRoom, type NextDaysInput } from "./next-days";
import { usualWeek } from "./usual";
import { MONDAYS, PAT_WEEK, SUNDAY_RUN, TRAINERS, TZ, WHOLE_WINDOW, at, booking, monday, pat, sam, standingWeek } from "./fixtures";

/**
 * Today is Monday Nov 9 2026, 6:00 AM at the studio: the next 7 days are
 * Mon Nov 9 to Sun Nov 15. Monday 8:00 reads Always full (the fixture's
 * eight weeks), and Judy is Sam's Monday 8:00 regular.
 */
const TODAY = "2026-11-09";
const NOW = at(TODAY, "06:00");
const usual = usualWeek(foldSummary({ studioId: "westlake", tz: TZ, now: SUNDAY_RUN, bookings: MONDAYS.flatMap(monday), coverage: WHOLE_WINDOW, trainers: TRAINERS, weeks: [standingWeek(), PAT_WEEK], previous: null })).times;

const judy = { id: "r1", weekday: 1, start: "08:00", clientId: "c-judy", clientName: "Judy Smith" };
const SAM = standingWeek({ final: { hours: [{ weekday: 1, from: "07:00", to: "10:00" }], regulars: [judy] } });
const judyAt8 = (over: Partial<ScheduleEntry> = {}) => sam(TODAY, "08:00", { clientId: "c-judy", clientName: "Judy Smith", ...over });
const ordinary = () => [sam(TODAY, "07:00"), judyAt8(), pat(TODAY, "08:00"), sam(TODAY, "09:00")];

const input = (over: Partial<NextDaysInput> = {}): NextDaysInput => ({
  today: TODAY,
  now: NOW,
  tz: TZ,
  read: "ready",
  connected: true,
  bookings: ordinary(),
  docs: [SAM, PAT_WEEK],
  trainers: TRAINERS,
  usual,
  marks: null,
  ...over,
});

const kinds = (n: ReturnType<typeof nextDays>) => n.lines.map((l) => [l.dateKey, l.key, l.reasons.map((r) => r.kind)]);

describe("when it can't tell", () => {
  it("says nothing until the server has answered, and nothing for a studio not linked", () => {
    for (const read of ["loading", "failed", "offline"] as const) expect(nextDays(input({ read }))).toMatchObject({ state: read, lines: [] });
    expect(nextDays(input({ connected: false }))).toMatchObject({ state: "unconnected", lines: [] });
  });

  it("an ordinary Monday, every regular booked and every usual time full: nothing opened up", () => {
    expect(nextDays(input()).lines).toEqual([]);
  });
});

describe("1. a regular who isn't booked", () => {
  it("is the line's first reason, with who has room and her name behind a tap", () => {
    const n = nextDays(input({ bookings: [sam(TODAY, "07:00"), pat(TODAY, "08:00"), sam(TODAY, "09:00")] }));
    expect(kinds(n)).toEqual([[TODAY, "1-0800", ["regular-open", "usually-full"]]]);
    expect(n.lines[0]).toMatchObject({ usuallyFull: true, bookedNow: 1, room: { count: 1, with: ["t-sam"] }, trainerIds: ["t-sam"] });
    expect(n.lines[0].clients).toEqual([{ clientId: "c-judy", clientName: "Judy Smith", trainerId: "t-sam", reason: "regular-open" }]);
  });

  it("booked somewhere else: moved", () => {
    const moved = sam("2026-11-10", "09:30", { clientId: "c-judy", clientName: "Judy Smith", movedFromDay: TODAY, movedFromStart: at(TODAY, "08:00") });
    const n = nextDays(input({ bookings: [sam(TODAY, "07:00"), pat(TODAY, "08:00"), sam(TODAY, "09:00"), moved] }));
    expect(n.lines[0].reasons[0]).toMatchObject({ kind: "regular-moved", finding: { movedTo: { dateKey: "2026-11-10", start: "09:30" } } });
  });

  it("a regular's cancelled booking is said once, as the regular", () => {
    const n = nextDays(input({ bookings: [sam(TODAY, "07:00"), judyAt8({ status: "Cancelled", cancelledAt: at("2026-11-06", "10:00") }), pat(TODAY, "08:00"), sam(TODAY, "09:00")] }));
    expect(kinds(n)).toEqual([[TODAY, "1-0800", ["regular-open", "usually-full"]]]);
    expect(n.lines[0].clients).toHaveLength(1);
  });

  it("a regular of someone who no longer works here is not listed", () => {
    const n = nextDays(input({ bookings: [sam(TODAY, "07:00"), pat(TODAY, "08:00"), sam(TODAY, "09:00")], worksHere: (id) => id !== "t-sam" }));
    expect(n.lines).toEqual([]);
  });

  it("a slot earlier today is past: no line", () => {
    const n = nextDays(input({ now: at(TODAY, "08:05"), bookings: [sam(TODAY, "07:00"), pat(TODAY, "08:00"), sam(TODAY, "09:00")] }));
    expect(n.lines).toEqual([]);
  });

  it("a trainer whose document id and sign-in id differ is checked by the trainer id", () => {
    const kim = standingWeek({ id: "uid-kim", trainerUid: "uid-kim", trainerId: "t-kim", trainerName: "Kim Ray", final: { hours: [{ weekday: 1, from: "07:00", to: "10:00" }], regulars: [{ ...judy, clientId: "c-ann", clientName: "Ann Lee" }] } });
    const annWithKim = booking(TODAY, "08:00", { trainerId: "t-kim", trainerName: "Kim Ray", clientId: "c-ann", clientName: "Ann Lee" });
    const n = nextDays(input({ docs: [SAM, PAT_WEEK, kim], bookings: [...ordinary(), annWithKim], trainers: [...TRAINERS, { id: "t-kim", name: "Kim Ray" }] }));
    // Ann is booked with Kim as usual: nothing at 8:00. Kim is free at 9:00, which reads Always full.
    expect(kinds(n)).toEqual([[TODAY, "1-0900", ["usually-full"]]]);
    expect(n.lines[0].room).toEqual({ count: 1, with: ["t-kim"] });
  });
});

describe("2. a cancellation nobody rebooked", () => {
  const patCancelled = (over: Partial<ScheduleEntry> = {}) => pat(TODAY, "08:00", { status: "Cancelled", cancelledAt: at("2026-11-06", "10:00"), ...over });

  it("works with no agreed week at all: cancellations only", () => {
    const n = nextDays(input({ docs: [], bookings: [sam(TODAY, "07:00"), judyAt8(), patCancelled(), sam(TODAY, "09:00")] }));
    expect(n.agreedAny).toBe(false);
    expect(kinds(n)).toEqual([[TODAY, "1-0800", ["cancellation"]]]);
    expect(n.lines[0]).toMatchObject({ room: null, bookedNow: 1 });
    expect(n.lines[0].reasons[0]).toMatchObject({ kind: "cancellation", cancelledOn: "2026-11-06", trainerId: "t-pat" });
  });

  it("with the weeks agreed, the time's room is said beside it", () => {
    const n = nextDays(input({ bookings: [sam(TODAY, "07:00"), judyAt8(), patCancelled(), sam(TODAY, "09:00")] }));
    expect(kinds(n)).toEqual([[TODAY, "1-0800", ["cancellation", "usually-full"]]]);
    expect(n.lines[0].room).toEqual({ count: 1, with: ["t-pat"] });
  });

  it("a late cancellation ahead is room like any other", () => {
    const n = nextDays(input({ bookings: [sam(TODAY, "07:00"), judyAt8(), patCancelled({ cancelledAt: at(TODAY, "05:30") }), sam(TODAY, "09:00")] }));
    expect(n.lines[0].room?.count).toBe(1);
  });

  it("the old sweep's unstamped cancellation says nothing of its own", () => {
    const n = nextDays(input({ docs: [], bookings: [sam(TODAY, "07:00"), judyAt8(), patCancelled({ cancelledAt: null }), sam(TODAY, "09:00")] }));
    expect(n.lines).toEqual([]);
  });

  it("the real-rebook boundary: a booking into the time that came with the cancellation took it back", () => {
    const cancelledAt = at("2026-11-06", "10:00");
    const refill = (hoursBefore: number) => pat(TODAY, "08:00", { createdAt: new Date(cancelledAt.getTime() - hoursBefore * 3_600_000) });
    const bob = { clientId: "c-bob", clientName: "Bob Hart" };
    const withRefill = (b: ScheduleEntry) => nextDays(input({ docs: [], bookings: [sam(TODAY, "07:00"), judyAt8(), patCancelled({ cancelledAt, ...bob }), b, sam(TODAY, "09:00")] }));
    // Booked into it after the cancellation, or up to 12 hours before it (the desk books the new slot first).
    expect(withRefill(refill(-2)).lines).toEqual([]);
    expect(withRefill(refill(12)).lines).toEqual([]);
    // A booking Journey saw more than 12 hours before is someone's standing one: the cancelled place is still open.
    expect(kinds(withRefill(refill(12 + 1 / 60)))).toEqual([[TODAY, "1-0800", ["cancellation"]]]);
    // Her own rebook on another day doesn't take this time back.
    const herRebook = pat("2026-11-11", "10:00", { ...bob, createdAt: new Date(cancelledAt.getTime() + 60_000) });
    expect(withRefill(herRebook).lines).toHaveLength(1);
  });
});

describe("3. a usually-full time with room", () => {
  it("nothing is booked with a trainer who usually takes clients then", () => {
    const n = nextDays(input({ bookings: [sam(TODAY, "07:00"), judyAt8(), sam(TODAY, "09:00")] }));
    expect(kinds(n)).toEqual([[TODAY, "1-0800", ["usually-full"]]]);
    expect(n.lines[0]).toMatchObject({ room: { count: 1, with: ["t-pat"] }, trainerIds: ["t-pat"] });
  });

  it("not when the trainer is away, has left, or the rotation took the place", () => {
    const bookings = [sam(TODAY, "07:00"), judyAt8(), sam(TODAY, "09:00")];
    const away = standingWeek({ ...PAT_WEEK, away: [{ id: "a1", from: TODAY, to: "2026-11-13" }] });
    expect(nextDays(input({ bookings, docs: [SAM, away] })).lines).toEqual([]);
    expect(nextDays(input({ bookings, worksHere: (id) => id !== "t-pat" })).lines).toEqual([]);
    const rota = booking(TODAY, "08:00", { trainerId: undefined, trainerName: "Westlake Rotation" });
    expect(nextDays(input({ bookings: [...bookings, rota] })).lines).toEqual([]);
  });

  it("not when a booking Journey can't place sits at that time: it could be Pat's", () => {
    const unplaced = booking(TODAY, "08:00", { trainerId: undefined, trainerName: "Patricia Moss" });
    expect(nextDays(input({ bookings: [sam(TODAY, "07:00"), judyAt8(), unplaced, sam(TODAY, "09:00")] })).lines).toEqual([]);
  });

  it("an Unavailable block is not a booking: Pat still has room", () => {
    const block = pat(TODAY, "08:00", { clientName: "Unavailable", clientId: undefined });
    expect(kinds(nextDays(input({ bookings: [sam(TODAY, "07:00"), judyAt8(), block, sam(TODAY, "09:00")] })))).toEqual([[TODAY, "1-0800", ["usually-full"]]]);
  });

  it("a time marked Always full counts as usually full; a time that reads room doesn't", () => {
    const mark = normalizeMark("1-0930", { weekday: 1, time: "09:30", mark: "full", by: { id: "uid-jo", name: "Jo" }, at: new Date() })!;
    const n = nextDays(input({ marks: new Map([["1-0930", mark]]) }));
    expect(kinds(n)).toEqual([[TODAY, "1-0930", ["usually-full"]]]);
    expect(n.lines[0].mark?.mark).toBe("full");
    // 7:00 reads Usually has room: its room is no news.
    expect(nextDays(input({ bookings: [judyAt8(), pat(TODAY, "08:00"), sam(TODAY, "09:00")] })).lines).toEqual([]);
  });
});

describe("narrowing, and the Wrap-up's times with room", () => {
  const n = nextDays(input({ bookings: [sam(TODAY, "07:00"), pat(TODAY, "08:00"), sam(TODAY, "09:00")] }));

  it("With Sam keeps the lines about Sam; Anyone keeps all", () => {
    expect(linesFor(n.lines, "t-sam")).toHaveLength(1);
    expect(linesFor(n.lines, "t-pat")).toHaveLength(0);
    expect(linesFor(n.lines, null)).toHaveLength(1);
  });

  it("lists every half-hour ahead with room, and marks room that is there this week only", () => {
    const bookings = [sam(TODAY, "07:00"), pat(TODAY, "08:00"), sam(TODAY, "09:00")];
    const times = timesWithRoom(input({ bookings }), "t-sam", n.lines);
    expect(times.map((t) => [t.row, t.thisWeekOnly])).toEqual([
      [450, false],
      [480, true],
      [510, false],
      [570, false],
    ]);
    // Anyone: Pat's free 7:00 and 7:30 too.
    expect(timesWithRoom(input({ bookings }), null, n.lines).map((t) => t.row)).toEqual([420, 450, 480, 510, 570]);
    expect(timesWithRoom(input({ bookings, read: "offline" }), null)).toEqual([]);
  });
});
