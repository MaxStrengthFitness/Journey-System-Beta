import { describe, it, expect } from "vitest";
import { addDays } from "../../client-history/model";
import { APP_LINES, driftLine, journeyOf, type JourneyInput } from "../journey/states";
import type { RenewalSnapshot } from "../../renewals/types";
import { lineStateAt, nextLineCrossing } from "./line-crossing";

const TODAY = "2026-10-07";
const T = (n: number) => addDays(TODAY, n);
const LINES = APP_LINES; // Lapsed 45, Inactive 90, Drifting twice the gap (at least 7)
const BREAK = 14;

describe("lineStateAt", () => {
  it("reads the lines in journeyOf's order: Inactive, Lapsed, At risk, Drifting", () => {
    const p = { driftDays: 8, breakDays: BREAK, lines: LINES };
    expect(lineStateAt(7, p)).toBeNull();
    expect(lineStateAt(8, p)).toBe("drifting");
    expect(lineStateAt(14, p)).toBe("at-risk");
    expect(lineStateAt(45, p)).toBe("lapsed");
    expect(lineStateAt(90, p)).toBe("inactive");
    // No usual gap measured: no Drifting, as journeyOf.
    expect(lineStateAt(10, { ...p, driftDays: null })).toBeNull();
  });
});

describe("nextLineCrossing", () => {
  const base = { breakDays: BREAK, lines: LINES, today: TODAY, until: T(30) };

  it("is the next line with its day", () => {
    // Last came 6 days ago, drifts at 8: in two days.
    expect(nextLineCrossing({ ...base, driftDays: 8, lastVisit: T(-6) })).toEqual({ line: "drifting", day: T(2) });
    // Already drifting (10 days): At risk at 14.
    expect(nextLineCrossing({ ...base, driftDays: 8, lastVisit: T(-10) })).toEqual({ line: "at-risk", day: T(4) });
    // At risk (20 days): Lapsed at 45.
    expect(nextLineCrossing({ ...base, driftDays: 8, lastVisit: T(-20) })).toEqual({ line: "lapsed", day: T(25) });
  });

  it("goes straight to At risk when the drift line falls past the break line", () => {
    // A usual gap of 10 days drifts at 20, past the studio's 14.
    expect(nextLineCrossing({ ...base, driftDays: 20, lastVisit: T(-3) })).toEqual({ line: "at-risk", day: T(11) });
  });

  it("says nothing past the bookings Journey can see, with no last visit, or for a visit after today", () => {
    // Lapsed would be T(31): one day past the 30 Journey can see.
    expect(nextLineCrossing({ ...base, driftDays: 8, lastVisit: T(-14) })).toBeNull();
    expect(nextLineCrossing({ ...base, driftDays: 8, lastVisit: null })).toBeNull();
    expect(nextLineCrossing({ ...base, driftDays: 8, lastVisit: T(1) })).toBeNull();
  });

  it("never names a line crossed today or before", () => {
    // Drifts exactly today: the next is At risk.
    expect(nextLineCrossing({ ...base, driftDays: 8, lastVisit: T(-8) })).toEqual({ line: "at-risk", day: T(6) });
  });

  it("agrees with journeyOf, day by day, for a client with nothing booked", () => {
    const snapshot = { situation: "on-track", pacePerWeek: 2 } as RenewalSnapshot;
    for (const gap of [2, 3.5, 5, 7, 9, 12]) {
      for (const ago of [0, 3, 6, 9, 13, 20, 40, 44, 60, 89]) {
        const lastVisit = T(-ago);
        const input = (today: string): JourneyInput => ({
          active: true,
          snapshot,
          lastVisit,
          next: { state: "none", day: null },
          quotableTotal: 200,
          today,
          breakDays: BREAK,
          nightlyStale: false,
          lines: LINES,
          rhythm: { measured: true, rhythm: { gapDays: gap, visits: 8, words: "", source: "visits", pacePerWeek: null, gaps: [] } },
        });
        const now = journeyOf(input(TODAY)).state;
        let expected: { line: string; day: string } | null = null;
        for (let d = 1; d <= 30; d++) {
          const s = journeyOf(input(T(d))).state;
          if (s !== now) {
            expected = { line: s, day: T(d) };
            break;
          }
        }
        const got = nextLineCrossing({ ...base, driftDays: driftLine(gap, LINES), lastVisit });
        expect(got, `gap ${gap}, last came ${ago} days ago`).toEqual(expected);
      }
    }
  });
});
