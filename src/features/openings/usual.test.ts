import { describe, expect, it } from "vitest";
import { foldSummary } from "./fold";
import type { CellWeek, OpeningsSummary, SummaryDay } from "./summary-doc";
import { usualSentence } from "./present";
import { ALWAYS_MIN_WEEKS, MIN_WEEKS, USUAL_SHARE, atLeastShare, firstWordsOn, largestReached, readsFull, usualTime, usualWeek, weeksAt } from "./usual";
import { MONDAYS, PAT_WEEK, SAM_WEEK, SUNDAY_RUN, TRAINERS, TZ, WHOLE_WINDOW, monday, sam } from "./fixtures";

type Spec = { day?: SummaryDay; cell?: CellWeek };
const F: Spec = { cell: { s: "f", b: 2, i: ["0", "1"] } };
const R: Spec = { cell: { s: "r", b: 1, i: ["0", "1"] } };
const N: Spec = { cell: { s: "n", i: ["0", "1"] } };
const U: Spec = { day: { n: 4, x: "r" } };
const C: Spec = { day: { n: 0, x: "c" } };
const J = (b: number): Spec => ({ day: { n: 4, q: "a" }, cell: { s: "b", b } });

/** A summary whose Monday 8:00 is the given eight weeks, newest first. */
function at8(specs: Spec[]): OpeningsSummary {
  return {
    v: 1,
    builtAt: "2026-11-08T07:00:00.000Z",
    tz: TZ,
    row: 30,
    since: "2026-09-14",
    weeks: specs.map((s, i) => ({ m: MONDAYS[i], d: { "1": s.day ?? { n: 4, j: 1 } } })),
    who: { "0": { id: "t-pat", n: "Pat Moss" }, "1": { id: "t-sam", n: "Sam Lee" } },
    agreed: {},
    cells: { "1-0800": Object.fromEntries(specs.flatMap((s, i) => (s.cell ? [[String(i), s.cell]] : []))) },
  };
}
const word = (specs: Spec[]) => usualTime(at8(specs), "1-0800");

describe("the numbers", () => {
  it("at least 4 weeks, always from 6, usually at 3 in every 4", () => {
    expect([MIN_WEEKS, ALWAYS_MIN_WEEKS, USUAL_SHARE]).toEqual([4, 6, 0.75]);
    expect(atLeastShare(3, 4)).toBe(true);
    expect(atLeastShare(6, 8)).toBe(true);
    expect(atLeastShare(5, 7)).toBe(false);
    expect(atLeastShare(6, 7)).toBe(true);
    expect(atLeastShare(0, 0)).toBe(false);
  });

  it("'usually N booked' is the largest number reached in at least 3 of every 4 counted weeks", () => {
    expect(largestReached([5, 3, 3, 3, 3, 3, 2])).toBe(3);
    expect(largestReached([4, 4, 4, 4, 4, 4, 4, 4])).toBe(4);
    expect(largestReached([1, 0, 0, 0])).toBe(0);
    expect(largestReached([])).toBe(0);
  });
});

describe("the usual word", () => {
  it("Always full: full in every judged week, with at least 6 judged", () => {
    expect(word([F, F, F, F, F, F, F, F])).toMatchObject({ word: "always-full", judged: 8, full: 8 });
    expect(word([F, F, F, F, F, F, U, U])).toMatchObject({ word: "always-full", judged: 6 });
    // Five of five is usually, never always.
    expect(word([F, F, F, F, F, U, U, U]).word).toBe("usually-full");
    // One week of room and it is no longer "always".
    expect(word([F, F, F, F, F, F, F, R]).word).toBe("usually-full");
  });

  it("Usually full, Usually has room, Mixed", () => {
    expect(word([F, F, F, F, F, F, R, R])).toMatchObject({ word: "usually-full", full: 6 });
    expect(word([R, N, N, R, N, N, F, F])).toMatchObject({ word: "usually-room", room: 6, nobodyBooked: 4 });
    expect(word([F, F, F, F, R, R, R, R])).toMatchObject({ word: "mixed", full: 4, room: 4 });
    expect(word([F, F, F, R, U, U, U, U])).toMatchObject({ word: "usually-full", judged: 4 });
  });

  it("N booked: at least 4 counted, fewer than 4 judged", () => {
    const t = word([J(5), J(3), J(3), J(3), J(3), J(3), J(2), U]);
    expect(t).toMatchObject({ word: "booked", why: "unjudged", counted: 7, judged: 0, usuallyBooked: 3, reachedIn: 6 });
  });

  it("N booked with nobody usually in: a trainer booked outside every agreed week is no hot or cold spot", () => {
    const out: Spec = { cell: { s: "o", b: 1 } };
    expect(word([out, out, out, out, out, out, F, F])).toMatchObject({ word: "booked", why: "nobody-in", usuallyBooked: 1 });
  });

  it("Rotation: on the rotation with nobody in, and never 'more booked than in'", () => {
    const rota: Spec = { cell: { s: "o", b: 5, r: 5 } };
    // Nobody's usual week is missing on a rotation Saturday: those weeks aren't outnumbered.
    expect(word([rota, rota, rota, rota, rota, rota, rota, U])).toMatchObject({ word: "rotation", rotationWeeks: 7, usuallyRotation: 5, outnumbered: 0 });
    // A trainer booked outside their agreed week still is.
    const outside: Spec = { cell: { s: "o", b: 1 } };
    expect(word([outside, outside, outside, outside, F, F, F, F]).outnumbered).toBe(4);
    // Rotation beside a booking of a trainer with no week in then: someone's week may be missing.
    const mixed: Spec = { cell: { s: "o", b: 3, r: 2 } };
    expect(word([mixed, mixed, mixed, mixed, F, F, F, F]).outnumbered).toBe(4);
  });

  it("not enough weeks yet; blank when nothing was booked and nobody in, every week judged", () => {
    expect(word([F, F, F, U, U, U, U, U])).toMatchObject({ word: "not-enough", counted: 3 });
    expect(word([U, U, U, U, U, U, U, U])).toMatchObject({ word: "not-enough", counted: 0 });
    expect(word([{}, {}, {}, {}, {}, U, U, C])).toMatchObject({ word: "blank", counted: 5 });
    // Blank even below four weeks: there is nothing to wait for.
    expect(word([{}, {}, U, U, U, U, U, U]).word).toBe("blank");
  });

  it("an empty time on days that couldn't be judged is none booked, never blank: who was in isn't known", () => {
    const unjudgedEmpty: Spec = { day: { n: 4, q: "a" } };
    expect(word(Array(8).fill(unjudgedEmpty))).toMatchObject({ word: "booked", why: "unjudged", counted: 8, judged: 0, usuallyBooked: 0 });
    // Below four counted, it is "not enough", not blank.
    expect(word([unjudgedEmpty, unjudgedEmpty, U, U, U, U, U, U]).word).toBe("not-enough");
    // One unjudged week among judged empty ones is enough to withhold "nobody in".
    expect(word([{}, {}, {}, {}, {}, {}, {}, unjudgedEmpty]).word).not.toBe("blank");
  });

  it("the sheet: cancellations, late ones, more booked than in, and who is usually in", () => {
    const cancelled: Spec = { cell: { s: "f", b: 3, c: 1, l: 1, i: ["1"] } };
    const early: Spec = { cell: { s: "r", b: 1, c: 1, i: ["0", "1"] } };
    const t = word([cancelled, cancelled, early, F, F, F, { cell: { s: "f", b: 1, i: ["1"] } }, { cell: { s: "f", b: 1, i: ["1"] } }]);
    expect(t).toMatchObject({ cancelledWeeks: 3, lateWeeks: 2, outnumbered: 2 });
    // Sam in every week; Pat in 4 of 8, not usually.
    expect(t.usuallyIn).toEqual(["t-sam"]);
    expect(t.usuallyInCount).toBe(1);
  });

  it("names every week's day and why it didn't count or couldn't be judged", () => {
    const weeks = weeksAt(at8([F, U, C, { day: { n: 4, q: "p" }, cell: { s: "b", b: 1 } }, J(2), F, F, F]), "1-0800");
    expect(weeks.slice(0, 5).map((w) => [w.day, w.verdict, w.judged, w.notJudged])).toEqual([
      ["2026-11-02", "counted", true, null],
      ["2026-10-26", "unread", false, null],
      ["2026-10-19", "closed", false, null],
      ["2026-10-12", "counted", false, "unplaced"],
      ["2026-10-05", "counted", false, "unagreed"],
    ]);
    expect(weeks[2].dayBooked).toBe(0);
    expect(readsFull("usually-full")).toBe(true);
    expect(readsFull("mixed")).toBe(false);
  });
});

describe("usualWeek", () => {
  const s = foldSummary({ studioId: "westlake", tz: TZ, now: SUNDAY_RUN, bookings: MONDAYS.flatMap(monday), coverage: WHOLE_WINDOW, trainers: TRAINERS, weeks: [SAM_WEEK, PAT_WEEK], previous: null });

  it("the grid runs from the earliest to the latest time anyone was booked or in", () => {
    const w = usualWeek(s);
    expect(w.rows).toEqual([420, 450, 480, 510, 540, 570]);
    expect(w.times.size).toBe(6 * 6);
    expect(w).toMatchObject({ weeksCounted: 8, enough: true, since: "2026-09-14" });
  });

  it("reads each time's word from the fold", () => {
    const w = usualWeek(s);
    expect(w.times.get("1-0800")).toMatchObject({ word: "always-full", judged: 8 });
    expect(w.times.get("1-0700")).toMatchObject({ word: "usually-room", room: 8, nobodyBooked: 0 });
    expect(w.times.get("1-0730")).toMatchObject({ word: "usually-room", nobodyBooked: 8 });
    expect(w.times.get("2-0800")?.word).toBe("blank");
    expect(w.times.get("1-0800")?.usuallyIn).toEqual(["t-pat", "t-sam"]);
  });

  it("before any week is agreed, an empty half-hour between bookings is 'none booked', never 'nobody in' (the proposal's Kim)", () => {
    const unagreed = foldSummary({
      studioId: "westlake",
      tz: TZ,
      now: SUNDAY_RUN,
      bookings: MONDAYS.flatMap((d) => [sam(d, "07:00"), sam(d, "08:00"), sam(d, "09:00")]),
      coverage: WHOLE_WINDOW,
      trainers: TRAINERS,
      weeks: [],
      previous: null,
    });
    const w = usualWeek(unagreed);
    for (const key of ["1-0730", "1-0830"]) {
      const t = w.times.get(key)!;
      expect(t).toMatchObject({ word: "booked", why: "unjudged", counted: 8, judged: 0, usuallyBooked: 0 });
      expect(usualSentence(t)).not.toContain("nobody in");
      expect(usualSentence(t)).toBe(`Monday ${key === "1-0730" ? "7:30" : "8:30"} AM · Usually none booked (booked in 0 of the last 8 Mondays). Room can't be judged yet: not every trainer's week is agreed.`);
    }
    expect(w.times.get("1-0800")).toMatchObject({ word: "booked", usuallyBooked: 1 });
    // With the weeks agreed, a time nobody is in is blank again.
    expect(usualWeek(s).times.get("2-0800")?.word).toBe("blank");
  });

  it("before any week is read in full, there is no grid", () => {
    const empty = foldSummary({ studioId: "westlake", tz: TZ, now: SUNDAY_RUN, bookings: [], coverage: new Map(), trainers: [], weeks: [], previous: null });
    expect(usualWeek(empty)).toMatchObject({ rows: [], weeksCounted: 0, enough: false, since: null });
  });
});

describe("firstWordsOn", () => {
  it("the first words can come once four weeks are counted, a week each Sunday", () => {
    // Built early Sunday Oct 18 with two weeks counted: Oct 25 adds one, Nov 1 the fourth.
    expect(firstWordsOn("2026-10-18T06:00:00.000Z", 2, TZ)).toBe("2026-11-01");
    expect(firstWordsOn("2026-10-18T06:00:00.000Z", 3, TZ)).toBe("2026-10-25");
    expect(firstWordsOn("2026-10-18T06:00:00.000Z", 0, TZ)).toBe("2026-11-15");
    expect(firstWordsOn("2026-10-18T06:00:00.000Z", 4, TZ)).toBeNull();
    // A summary built by hand midweek waits for the Sunday after it.
    expect(firstWordsOn("2026-10-21T16:00:00.000Z", 3, TZ)).toBe("2026-10-25");
  });
});
