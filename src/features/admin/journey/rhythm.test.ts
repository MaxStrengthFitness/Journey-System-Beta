import { describe, expect, it } from "vitest";
import type { RenewalSnapshot } from "../../renewals/types";
import { MIN_RHYTHM_VISITS, gapWords, rhythmFromSnapshot, rhythmFromVisits, rhythmProof } from "./rhythm";

const TODAY = "2026-09-28";

describe("rhythmFromVisits — the research's rule", () => {
  it("is the median of her last six gaps in the last twelve weeks", () => {
    // Every 3 or 4 days since mid-August.
    const days = ["2026-08-15", "2026-08-19", "2026-08-22", "2026-08-26", "2026-08-29", "2026-09-02", "2026-09-05", "2026-09-09", "2026-09-12", "2026-09-16"];
    const r = rhythmFromVisits(days, TODAY);
    expect(r.measured).toBe(true);
    if (!r.measured) return;
    expect(r.rhythm.gaps).toEqual([3, 4, 3, 4, 3, 4]);
    expect(r.rhythm.gapDays).toBe(3.5);
    expect(r.rhythm.words).toBe("every 3–4 days");
    expect(rhythmProof(r.rhythm)).toBe("last 6 gaps 3, 4, 3, 4, 3, 4 days");
  });

  it("needs six visits spanning four weeks: below that it is too new to judge, never a guess", () => {
    const five = ["2026-09-01", "2026-09-08", "2026-09-15", "2026-09-22", "2026-09-25"];
    expect(rhythmFromVisits(five, TODAY)).toEqual({ measured: false, visits: 5, why: `5 of ${MIN_RHYTHM_VISITS} visits in the last 12 weeks` });
    const tight = ["2026-09-10", "2026-09-12", "2026-09-14", "2026-09-16", "2026-09-18", "2026-09-20"];
    expect(rhythmFromVisits(tight, TODAY)).toMatchObject({ measured: false, why: "6 visits, but over less than 4 weeks" });
  });

  it("forgets visits older than twelve weeks, and counts a day once", () => {
    const old = ["2026-05-01", "2026-05-08", "2026-05-15", "2026-05-22", "2026-05-29", "2026-06-05", "2026-09-20", "2026-09-20"];
    expect(rhythmFromVisits(old, TODAY)).toMatchObject({ measured: false, visits: 1 });
  });
});

describe("rhythmFromSnapshot — what a screen can say without her history", () => {
  const snap = (pacePerWeek: number | null, weeksObserved: number | null) => ({ pacePerWeek, proof: { weeksObserved, weeksAttended: weeksObserved } }) as unknown as RenewalSnapshot;

  it("turns last night's pace into a usual gap, held to the same minimum on an estimate", () => {
    const r = rhythmFromSnapshot(snap(2, 12));
    expect(r.measured).toBe(true);
    if (!r.measured) return;
    expect(r.rhythm.gapDays).toBe(3.5);
    expect(r.rhythm.visits).toBe(16);
    expect(rhythmProof(r.rhythm)).toBe("about 2 a week over the last 8 weeks");
    const weekly = rhythmFromSnapshot(snap(1, 8));
    expect(weekly.measured && weekly.rhythm.words).toBe("about once a week");
  });

  it("says why when it can't: no record, no pace, too few weeks, too few visits", () => {
    expect(rhythmFromSnapshot(null)).toMatchObject({ measured: false, why: "no nightly record for this client yet" });
    expect(rhythmFromSnapshot(snap(null, 12))).toMatchObject({ measured: false, why: "not enough weeks on record for a pace yet" });
    expect(rhythmFromSnapshot(snap(2, null))).toMatchObject({ measured: false, why: "fewer than 4 weeks of visits on record" });
    // Once a week over four observed weeks is about four visits: under six.
    expect(rhythmFromSnapshot(snap(1, 4))).toMatchObject({ measured: false, visits: 4, why: "about 4 of 6 visits on record" });
    expect(rhythmFromSnapshot(snap(0, 12))).toMatchObject({ measured: false, visits: 0 });
  });
});

describe("gapWords", () => {
  it("says a gap the way a person would", () => {
    expect(gapWords(3.5)).toBe("every 3–4 days");
    expect(gapWords(5)).toBe("every 5 days");
    expect(gapWords(7)).toBe("about once a week");
    expect(gapWords(10)).toBe("about every 10 days");
    expect(gapWords(14)).toBe("about every 2 weeks");
    expect(gapWords(1)).toBe("most days");
  });
});
