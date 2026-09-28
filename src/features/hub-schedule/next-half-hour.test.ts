/**
 * The Next 30 minutes (hub cherry round): who is due across the floor, on
 * today only, while the day runs; never a booking that is over (AJ, Hub
 * question 2); soonest first, yours first at the same time.
 */
import { describe, expect, it } from "vitest";
import type { HubCardState } from "../../lib/hub-card-state";
import type { Span } from "./grid-model";
import { NEXT_WINDOW_MIN, nextHalfHour, stripOpen, type NextCandidate } from "./next-half-hour";

const t = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const span = (from: string, to: string): Span => ({ from: t(from), to: t(to) });
const c = (item: string, from: string, to: string, state: HubCardState = "live", mine = false, order = 1): NextCandidate<string> => ({
  item,
  span: span(from, to),
  state,
  mine,
  order,
});

describe("when the strip is on screen", () => {
  const day = [span("06:00", "06:30"), span("12:00", "12:30"), span("18:30", "19:00")];

  it("from half an hour before the first booking until the last one ends", () => {
    expect(NEXT_WINDOW_MIN).toBe(30);
    expect(stripOpen(day, t("05:29"))).toBe(false);
    expect(stripOpen(day, t("05:30"))).toBe(true);
    // A quiet gap keeps the row: nothing moves under the trainer's finger.
    expect(stripOpen(day, t("15:00"))).toBe(true);
    expect(stripOpen(day, t("18:59"))).toBe(true);
    expect(stripOpen(day, t("19:00"))).toBe(false);
  });

  it("never on another day, and never on a day with nothing booked", () => {
    expect(stripOpen(day, null)).toBe(false);
    expect(stripOpen([], t("09:00"))).toBe(false);
  });
});

describe("who is on it", () => {
  const now = t("09:24");

  it("everyone whose slot overlaps the next half hour, and nobody after it", () => {
    const on = nextHalfHour(
      [
        c("belladonna", "09:30", "10:00"),
        c("targon", "10:00", "10:45"),
        c("hamfast", "09:00", "09:30", "in-session"),
        c("late", "09:15", "09:45"),
        c("edge", "09:54", "10:24"),
      ],
      now,
    );
    expect(on.map((x) => [x.item, x.when])).toEqual([
      ["hamfast", "in-session"],
      ["late", "now"],
      ["belladonna", "soon"],
    ]);
  });

  it("never a booking that is over: done, not logged, or nothing to claim", () => {
    const on = nextHalfHour(
      [c("done", "09:00", "09:30", "done"), c("missed", "09:00", "09:30", "not-logged"), c("past", "09:00", "09:30", "past"), c("finished", "08:30", "09:00")],
      now,
    );
    expect(on).toEqual([]);
  });

  it("soonest first; at the same time yours first, then the grid's columns left to right", () => {
    const on = nextHalfHour([c("damrod's", "09:30", "10:00", "live", false, 3), c("beregond's", "09:30", "10:00", "live", false, 2), c("yours", "09:30", "10:00", "live", true, 0)], now);
    expect(on.map((x) => x.item)).toEqual(["yours", "beregond's", "damrod's"]);
  });

  it("a session opened a few minutes early is in session, not 'soon'", () => {
    expect(nextHalfHour([c("early", "09:30", "10:00", "in-session")], now)[0].when).toBe("in-session");
  });
});
