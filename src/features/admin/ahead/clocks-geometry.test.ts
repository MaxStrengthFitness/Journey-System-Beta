import { describe, it, expect } from "vitest";
import { addDays } from "../../client-history/model";
import type { RenewalSnapshot } from "../../renewals/types";
import type { AheadClient, AheadEvent } from "./events";
import { at, axisOf, clockMarks } from "./clocks-geometry";
import { aheadSpan } from "./weeks";

const TODAY = "2026-10-07";
const T = (n: number) => addDays(TODAY, n);
const AXIS = axisOf(aheadSpan(TODAY)); // Oct 5, 182 days

function cl(s: Partial<RenewalSnapshot> | null, events: Partial<AheadEvent>[] = [], over: Partial<AheadClient> = {}): AheadClient {
  return {
    id: "c",
    name: "c",
    client: { id: "c" } as AheadClient["client"],
    snapshot: s
      ? ({ paymentMode: "monthly", autoRenews: true, situation: "on-track", pacePerWeek: 2, runOutDate: T(91), commitmentEnd: T(90), chargeDate: T(90), runOutRange: null, ...s } as RenewalSnapshot)
      : null,
    cycle: null,
    journey: null,
    trainerId: null,
    onTrial: false,
    events: events.map((e) => ({ key: "", clientId: "c", now: false, range: null, sentence: "", proof: "", pair: null, kind: "talk", day: TODAY, ...e })) as AheadEvent[],
    cantPlace: null,
    noPace: false,
    firstDay: null,
    needsNow: false,
    slipping: false,
    ...over,
  };
}

describe("at", () => {
  it("places a day along the 26 weeks, clamped to the ends", () => {
    expect(at("2026-10-05", AXIS)).toBe(0);
    // T(89) is 91 days after Monday Oct 5: half of 182.
    expect(at(T(89), AXIS)).toBe(50);
    expect(at("2026-01-01", AXIS)).toBe(0);
    expect(at("2027-12-01", AXIS)).toBe(100);
  });
});

describe("clockMarks", () => {
  it("draws sessions to their run-out day and the commitment's end as a tick", () => {
    const m = clockMarks(cl({}), AXIS, TODAY);
    expect(m.today).toBe(at(TODAY, AXIS));
    expect(m.bar).toEqual({ from: m.today, to: at(T(91), AXIS) });
    expect(m.end).toBe(at(T(90), AXIS));
    expect(m.endWord).toBe("Renews");
    // A day past a charging end is on track, not banked: no plum.
    expect(m.banked).toBeNull();
    expect(m.gap).toBeNull();
  });

  it("turns the part past a charging end into banked sessions", () => {
    const m = clockMarks(cl({ runOutDate: T(150), situation: "will-bank" }), AXIS, TODAY);
    expect(m.bar).toEqual({ from: m.today, to: at(T(90), AXIS) });
    expect(m.banked).toEqual({ from: at(T(90), AXIS), to: at(T(150), AXIS) });
    // Billing that ends without a charge banks nothing: the sessions carry over.
    const ends = clockMarks(cl({ runOutDate: T(150), autoRenews: false }), AXIS, TODAY);
    expect(ends.banked).toBeNull();
    expect(ends.endWord).toBe("Billing ends");
  });

  it("leaves a gap when the sessions run out well before the end, with the range under it", () => {
    const m = clockMarks(cl({ runOutDate: T(40), runOutRange: { earliest: T(35), latest: T(48) } }, [{ kind: "runs-out", day: T(40) }]), AXIS, TODAY);
    expect(m.gap).toEqual({ from: at(T(40), AXIS), to: at(T(90), AXIS) });
    expect(m.range).toEqual({ from: at(T(35), AXIS), to: at(T(48), AXIS) });
  });

  it("says the run-out day when it falls past the weeks drawn", () => {
    const m = clockMarks(cl({ runOutDate: T(400), commitmentEnd: T(500), chargeDate: T(500) }), AXIS, TODAY);
    expect(m.beyond).toBe(T(400));
    expect(m.bar?.to).toBe(100);
    expect(m.end).toBeNull();
  });

  it("pauses an away client until they're back", () => {
    const m = clockMarks(cl({ situation: "away", awayUntil: T(30), pacePerWeek: null }), AXIS, TODAY);
    expect(m.paused).toEqual({ from: m.today, to: at(T(30), AXIS) });
    expect(m.back).toBe(at(T(30), AXIS));
    expect(m.bar).toBeNull();
    expect(m.end).toBeNull();
  });

  it("marks the talk, the line, and the moments", () => {
    const m = clockMarks(cl({}, [{ kind: "talk", day: T(20) }, { kind: "may-slip", day: T(5) }, { kind: "birthday", day: T(60) }]), AXIS, TODAY);
    expect(m.talk).toBe(at(T(20), AXIS));
    expect(m.slip).toBe(at(T(5), AXIS));
    expect(m.moments).toEqual([at(T(60), AXIS)]);
  });

  it("draws no clocks for a client it can't place, or without a pace", () => {
    const m = clockMarks(cl({}, [], { cantPlace: "No nightly record for this client yet." }), AXIS, TODAY);
    expect(m.bar).toBeNull();
    expect(m.end).toBeNull();
    const noPace = clockMarks(cl({ pacePerWeek: null }), AXIS, TODAY);
    expect(noPace.bar).toBeNull();
    expect(noPace.end).toBe(at(T(90), AXIS));
  });
});
