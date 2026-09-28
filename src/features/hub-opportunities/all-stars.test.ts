/**
 * All stars (hub cherry round; AJ, Hub question 6): twice a week on
 * average, in at least 9 of every 10 weeks, for the last 26 weeks — and
 * only where Journey holds every visit in that window. Anything short of
 * that is "can't tell", which no screen turns into a guess.
 */
import { describe, expect, it } from "vitest";
import { NO_WINDOW, WHOLE_STORY, ownedWindow } from "../../lib/history-claims";
import { addDays } from "../client-history/model";
import {
  ALL_STARS_LABEL,
  ALL_STAR_MIN_WEEKS,
  ALL_STAR_PER_WEEK,
  ALL_STAR_WEEKS,
  allStarStanding,
  allStarWindow,
  allStarWords,
  type AllStarInput,
} from "./all-stars";

const TODAY = "2026-09-28";
const { from: WINDOW_FROM, to: WINDOW_TO } = allStarWindow(TODAY);
const LONG_AGO = "2025-01-01";

/**
 * Visits in the window: `perWeek` visits in each week, for the weeks not
 * skipped. Week 0 is the week ending yesterday.
 */
function visits(perWeek: number | ((week: number) => number), skip: number[] = []): string[] {
  const out: string[] = [];
  for (let w = 0; w < ALL_STAR_WEEKS; w++) {
    if (skip.includes(w)) continue;
    const n = typeof perWeek === "function" ? perWeek(w) : perWeek;
    const end = addDays(WINDOW_TO, -7 * w);
    for (let i = 0; i < n; i++) out.push(addDays(end, -2 * i));
  }
  return out;
}

const ask = (over: Partial<AllStarInput> = {}) =>
  allStarStanding({ asOf: TODAY, visitDays: visits(2), recordsFrom: LONG_AGO, owned: WHOLE_STORY, ...over });

describe("the rule", () => {
  it("is 26 weeks, 24 of them with a visit, twice a week", () => {
    expect([ALL_STAR_WEEKS, ALL_STAR_MIN_WEEKS, ALL_STAR_PER_WEEK]).toEqual([26, 24, 2]);
    expect(ALL_STARS_LABEL).toBe("All stars");
    expect(WINDOW_TO).toBe("2026-09-27");
    expect(WINDOW_FROM).toBe("2026-03-30");
  });

  it("twice a week, every week of the last 26: an all star", () => {
    expect(ask()).toEqual({ standing: "all-star", weeksIn: 26, perWeek: 2, from: WINDOW_FROM, to: WINDOW_TO });
  });

  it("a two-week holiday keeps the name: that is what 'almost every week' is for", () => {
    expect(ask({ visitDays: visits(2, [5, 6]) })).toMatchObject({ standing: "all-star", weeksIn: 24, perWeek: 2 });
  });

  it("three weeks away is short of 9 in every 10", () => {
    expect(ask({ visitDays: visits(2, [5, 6, 12]) })).toEqual({ standing: "not-yet" });
  });

  it("once a week, every week, is a regular, not an all star", () => {
    expect(ask({ visitDays: visits(1) })).toEqual({ standing: "not-yet" });
  });

  it("'on average' is to the nearest quarter, as the renewals pace is", () => {
    // Two single weeks in 26: 50 visits over 26 weeks, 1.92 a week, about twice.
    expect(ask({ visitDays: visits((w) => (w === 3 || w === 9 ? 1 : 2)) })).toMatchObject({ standing: "all-star", perWeek: 2 });
    // Six single weeks: 46 over 26, 1.77 a week, about 1.75.
    expect(ask({ visitDays: visits((w) => (w < 6 ? 1 : 2)) })).toEqual({ standing: "not-yet" });
  });

  it("two sessions on one day are one visit", () => {
    const doubled = visits(1).flatMap((d) => [d, d]);
    expect(ask({ visitDays: doubled })).toEqual({ standing: "not-yet" });
  });

  it("today doesn't count (a session not logged yet never decides it), nor a day before the window", () => {
    // The three newest weeks empty: today's visit does not fill one.
    expect(ask({ visitDays: [...visits(2, [0, 1, 2]), TODAY] })).toEqual({ standing: "not-yet" });
    // The three oldest weeks empty: visits just before the window do not fill one.
    const before = [addDays(WINDOW_FROM, -1), addDays(WINDOW_FROM, -3)];
    expect(ask({ visitDays: [...visits(2, [23, 24, 25]), ...before] })).toEqual({ standing: "not-yet" });
  });
});

describe("the migration: only where Journey holds every visit in the window", () => {
  it("a studio that moved onto Journey inside the window: can't tell, however often she came", () => {
    const owned = ownedWindow({ coverage: "partial", cutover: "2026-07-01" });
    expect(ask({ owned })).toEqual({ standing: "cant-tell", reason: "window-not-owned" });
  });

  it("a long-standing client whose studio moved over before the window: judged on Journey's weeks", () => {
    const owned = ownedWindow({ coverage: "partial", cutover: "2026-01-05" });
    expect(ask({ owned }).standing).toBe("all-star");
  });

  it("nobody has said what Journey holds: can't tell", () => {
    expect(ask({ owned: NO_WINDOW })).toEqual({ standing: "cant-tell", reason: "window-not-owned" });
  });

  it("visits read from a record that starts inside the window, or from nowhere known: can't tell", () => {
    expect(ask({ recordsFrom: "2026-06-01" })).toEqual({ standing: "cant-tell", reason: "records-too-short" });
    expect(ask({ recordsFrom: null })).toEqual({ standing: "cant-tell", reason: "records-too-short" });
  });
});

describe("the words", () => {
  it("say the name with its proof, and never who isn't one", () => {
    expect(allStarWords(ask())).toBe("All star: in 26 of the last 26 weeks, about twice a week.");
    expect(allStarWords(ask({ visitDays: visits(3) }))).toBe("All star: in 26 of the last 26 weeks, about three times a week.");
    expect(allStarWords(ask({ visitDays: visits(1) }))).toBeNull();
    expect(allStarWords(ask({ owned: NO_WINDOW }))).toBeNull();
  });
});
