import { describe, expect, it } from "vitest";
import { EFFORT_MIN_RATED, effortTrend, type EffortFactLike } from "./effort-trend";
import type { DialValue } from "../../types";

/** One workout a day from Sep 1, oldest first: a number is a tap, "d" the untouched default. */
function facts(...efforts: (number | "d" | null)[]): EffortFactLike[] {
  return efforts.map((e, i) => {
    const day = new Date(2026, 8, 1 + i);
    return {
      date: `2026-09-${String(1 + i).padStart(2, "0")}`,
      dayMs: day.getTime(),
      effort: e === null ? null : e === "d" ? { value: 0 as DialValue, defaulted: true } : { value: e as DialValue, defaulted: false },
    };
  });
}

describe("effort, lately", () => {
  it("says not enough data yet below the named sample, and that defaults don't count", () => {
    const t = effortTrend(facts(0, 1, 0, "d", "d", null, 1), "Judy");
    expect(t.status).toBe("not-enough");
    expect(t.rated).toBe(4);
    expect(t.sentence).toBe(`Not enough data yet: 4 of the ${EFFORT_MIN_RATED} rated workouts this needs. 2 left at As expected without a tap don't count.`);
  });

  it("says her effort has been lower lately, from tapped ratings only", () => {
    const t = effortTrend(facts(1, 0, 1, 0, 0, -1, -1, 0, -2), "Judy");
    expect(t.status).toBe("declining");
    expect(t.sentence).toBe("Judy's effort has been lower lately: 3 of her last 4 rated workouts were below what was expected. Worth a conversation.");
  });

  it("never counts a default toward a decline", () => {
    // Plenty of untouched defaults at the end, and nothing tapped below As expected.
    const t = effortTrend(facts(1, 1, 1, 1, 1, 1, "d", "d", "d", "d"), "Judy");
    expect(t.status).not.toBe("declining");
  });

  it("recognises pushing hard lately", () => {
    const t = effortTrend(facts(0, 0, 0, 0, 0, 1, 2, 0, 1, 1), "Judy");
    expect(t.status).toBe("pushing");
    expect(t.sentence).toBe("Judy has been pushing hard lately: 4 of her last 5 workouts were marked Pushed hard or Gave everything.");
  });

  it("a default in her last five counts as not pushing", () => {
    const t = effortTrend(facts(0, 0, 0, 0, 0, 1, 2, "d", "d", "d"), "Judy");
    expect(t.status).toBe("steady");
  });

  it("otherwise says it is about where it usually is", () => {
    const t = effortTrend(facts(0, 0, 1, 0, -1, 0, 0), "Judy");
    expect(t.status).toBe("steady");
    expect(t.sentence).toBe("Judy's effort has been about where it usually is across her 7 rated workouts.");
    // Words, never the Dial's numbers.
    expect(t.sentence).not.toMatch(/[-+]\d|average|score/);
  });
});
