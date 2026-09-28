/**
 * Your own column, in words (hub cherry round): how many, from when to when,
 * and on today how many are still to go — never "done", which is the cards'
 * to say (done means logged).
 */
import { describe, expect, it } from "vitest";
import type { Span } from "./grid-model";
import { yourDay, yourDayWords } from "./your-day";

const t = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const span = (from: string, to: string): Span => ({ from: t(from), to: t(to) });
const MORNING = [span("06:00", "06:30"), span("06:30", "07:00"), span("09:30", "10:00"), span("11:30", "12:00")];

describe("your day in words", () => {
  it("says how many and from when to when, on any day", () => {
    expect(yourDayWords({ spans: MORNING, nowMin: null })).toBe("4 sessions · 6:00 AM – 12:00 PM");
    expect(yourDayWords({ spans: [span("09:30", "10:00")], nowMin: null })).toBe("1 session · 9:30 – 10:00 AM");
  });

  it("on today, says how many are still to go while some are and some aren't", () => {
    expect(yourDayWords({ spans: MORNING, nowMin: t("09:24") })).toBe("4 sessions · 6:00 AM – 12:00 PM · 2 to go");
    // The one under way is still to go.
    expect(yourDay({ spans: MORNING, nowMin: t("09:45") })?.toGo).toBe("2 to go");
  });

  it("says nothing about 'to go' before the first or after the last: over is not done", () => {
    expect(yourDay({ spans: MORNING, nowMin: t("05:30") })?.toGo).toBeNull();
    expect(yourDay({ spans: MORNING, nowMin: t("13:00") })?.toGo).toBeNull();
  });

  it("gives its parts, so a narrow head can leave the span out", () => {
    expect(yourDay({ spans: MORNING, nowMin: t("09:24") })).toEqual({ count: "4 sessions", span: "6:00 AM – 12:00 PM", toGo: "2 to go" });
  });

  it("with nothing booked, says nothing (the head says what every head says)", () => {
    expect(yourDay({ spans: [], nowMin: t("09:24") })).toBeNull();
    expect(yourDayWords({ spans: [{ from: t("10:00"), to: t("10:00") }], nowMin: null })).toBeNull();
  });
});
