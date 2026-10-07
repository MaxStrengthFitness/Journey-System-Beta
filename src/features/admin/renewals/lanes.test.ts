import { describe, expect, it } from "vitest";
import { homeRecord, inPipelineWindow, leftOutAsInactive, mayHaveLane, renewalLane, type RenewalLaneContext } from "./lanes";
import { DEFAULT_RENEWAL_SETTINGS } from "../../renewals/settings";
import type { RenewalCycle, RenewalSnapshot } from "../../renewals/types";
import type { Client } from "../../../types";

const TODAY = "2026-10-06";
const STUDIO = "solon";

function snap(over: Partial<RenewalSnapshot> = {}): RenewalSnapshot {
  return {
    version: 2,
    cycleKey: "c-1",
    renewalOnBooks: null,
    situation: "on-track",
    sessionsLeft: 20,
    sessionsLeftSource: "mindbody",
    sessionsOnHand: 20,
    paymentsLeft: 0,
    paymentMode: "prepaid",
    pacePerWeek: 2,
    runOutDate: null,
    lastVisitDate: "2026-10-03",
    nextBookingDate: "2026-10-08",
    conversationDue: false,
    chargeWarning: false,
    focusDate: null,
    flags: [],
    ...over,
  } as RenewalSnapshot;
}

const client = (id: string, renewal: RenewalSnapshot | null, over: Partial<Client> = {}): Client =>
  ({ id, firstName: id, lastName: "Test", isActive: true, homeStudioId: STUDIO, ...(renewal ? { renewal } : {}), ...over }) as Client;

function ctx(over: Partial<RenewalLaneContext> = {}): RenewalLaneContext {
  return { studioId: STUDIO, settings: DEFAULT_RENEWAL_SETTINGS, today: TODAY, inactiveMarks: new Map(), inactiveDays: 90, ...over };
}

const cycle = (over: Partial<RenewalCycle>): RenewalCycle =>
  ({ clientId: "x", clientName: "X", cycleKey: "c-1", packageKey: null, chargeDate: null, ...over }) as RenewalCycle;

// 8 left at a quarter a week: runs out next May, far past the three-month horizon.
const slow = snap({ sessionsLeft: 8, pacePerWeek: 0.25, runOutDate: "2027-05-18", focusDate: "2027-05-18", conversationDue: true });

describe("renewalLane — the one rule the Pipeline, Today, Week and Month count by", () => {
  it("puts a client too slow for the old date window in Talk now", () => {
    expect(inPipelineWindow(slow, DEFAULT_RENEWAL_SETTINGS, TODAY)).toBe(false);
    expect(renewalLane(client("nora", slow), null, ctx())).toBe("talk-now");
    // And one with no date at all, whose conversation is due.
    expect(renewalLane(client("ivan", snap({ sessionsLeft: 6, conversationDue: true })), null, ctx())).toBe("talk-now");
  });

  it("leaves a visitor and a client with no record out", () => {
    expect(homeRecord(client("v", slow, { homeStudioId: "westlake" }), STUDIO)).toBeNull();
    expect(renewalLane(client("v", slow, { homeStudioId: "westlake" }), null, ctx())).toBeNull();
    expect(renewalLane(client("n", null), null, ctx())).toBeNull();
    expect(renewalLane({ ...client("x", slow), id: undefined } as unknown as Client, null, ctx())).toBeNull();
  });

  it("takes an Inactive client out of Before the charge, Talk now and Coming up", () => {
    const marked = ctx({ inactiveMarks: new Map([["nora", { day: "2026-10-04" }]]) });
    // Marked by a leader, with no visit since: out. Nothing booked ahead, as the mark needs.
    const quiet = snap({ ...slow, nextBookingDate: null });
    expect(renewalLane(client("nora", quiet), null, marked)).toBeNull();
    // Booked ahead is never Inactive.
    expect(renewalLane(client("nora", slow), null, marked)).toBe("talk-now");
    // A visit after the day she was marked: the mark no longer holds.
    expect(renewalLane(client("nora", snap({ ...quiet, lastVisitDate: "2026-10-05" })), null, marked)).toBe("talk-now");
    // Past the studio's Inactive line with nothing booked.
    const gone = snap({ ...quiet, lastVisitDate: "2026-07-08" });
    expect(renewalLane(client("g", gone), null, ctx())).toBeNull();
    expect(renewalLane(client("g", snap({ ...gone, lastVisitDate: "2026-07-09" })), null, ctx())).toBe("talk-now");
    expect(renewalLane(client("g", gone), null, ctx({ inactiveDays: 120 }))).toBe("talk-now");
    // Mindbody's own flag.
    expect(renewalLane(client("m", slow, { isActive: false }), null, ctx())).toBeNull();
    // Before the charge and Coming up too.
    const charge = snap({ situation: "will-bank", chargeWarning: true, focusDate: "2026-10-20", nextBookingDate: null, lastVisitDate: "2026-06-01" });
    expect(renewalLane(client("c", { ...charge, lastVisitDate: "2026-10-01" }), null, ctx())).toBe("before-charge");
    expect(renewalLane(client("c", charge), null, ctx())).toBeNull();
    const coming = snap({ focusDate: "2026-11-20", nextBookingDate: null, lastVisitDate: "2026-06-01" });
    expect(renewalLane(client("u", { ...coming, lastVisitDate: "2026-10-01" }), null, ctx())).toBe("coming-up");
    expect(renewalLane(client("u", coming), null, ctx())).toBeNull();
  });

  it("leaves Lapsed and Away untouched by the Inactive rule", () => {
    const lapsed = snap({ situation: "lapsed", focusDate: "2026-06-01", lastVisitDate: "2026-05-20", nextBookingDate: null });
    expect(renewalLane(client("l", lapsed, { isActive: false }), null, ctx())).toBe("lapsed");
    // Recorded as lost before the lost rule: on Lapsed, Inactive or not.
    const ended = snap({ situation: "ended", focusDate: "2026-09-20", lastVisitDate: "2026-06-01", nextBookingDate: null });
    expect(renewalLane(client("e", ended), null, ctx())).toBeNull();
    expect(renewalLane(client("e", ended), cycle({ outcome: "lost" }), ctx())).toBe("lapsed");
    const away = snap({ situation: "away", focusDate: "2026-12-01", awayUntil: "2027-03-01" });
    const marked = ctx({ inactiveMarks: new Map([["a", { day: "2026-10-04" }]]) });
    expect(renewalLane(client("a", { ...away, nextBookingDate: null }), null, marked)).toBe("away");
  });

  it("keeps Away as it was: only a package ending in the old window, except for Month", () => {
    const away = (focusDate: string | null) => client("a", snap({ situation: "away", focusDate, awayUntil: "2027-04-01" }));
    expect(renewalLane(away("2026-12-01"), null, ctx())).toBe("away");
    expect(renewalLane(away("2026-04-10"), null, ctx())).toBe("away");
    expect(renewalLane(away("2027-05-01"), null, ctx())).toBeNull();
    expect(renewalLane(away("2026-03-01"), null, ctx())).toBeNull();
    expect(renewalLane(away(null), null, ctx())).toBeNull();
    expect(renewalLane(away("2027-05-01"), null, ctx(), { awayWindow: false })).toBe("away");
  });

  it("still lets a conversation decide: renewed is done, decided leaves Talk now", () => {
    expect(renewalLane(client("n", slow), cycle({ outcome: "renewed" }), ctx())).toBeNull();
    expect(renewalLane(client("n", slow), cycle({ stage: "decided" } as Partial<RenewalCycle>), ctx())).toBeNull();
  });
});

describe("mayHaveLane — whose conversations to read", () => {
  it("is every home client a lane could hold, Inactive ones included, so a lost one still reaches Lapsed", () => {
    const ended = snap({ situation: "ended", focusDate: "2026-09-20", lastVisitDate: "2026-06-01", nextBookingDate: null });
    expect(mayHaveLane(client("e", ended), ctx())).toBe(true);
    expect(mayHaveLane(client("n", slow), ctx())).toBe(true);
    expect(mayHaveLane(client("q", snap({ focusDate: "2027-06-01" })), ctx())).toBe(false);
    expect(mayHaveLane(client("v", slow, { homeStudioId: "westlake" }), ctx())).toBe(false);
    expect(mayHaveLane(client("r", snap({ ...slow, renewalOnBooks: { cycleKey: "n", packageKey: null, startsOn: "2026-11-01" } })), ctx())).toBe(false);
  });
});

describe("leftOutAsInactive — Month's list", () => {
  it("is Inactive and not on Lapsed or Away", () => {
    const marked = ctx({ inactiveMarks: new Map([["n", { day: "2026-10-04" }]]) });
    const quiet = snap({ ...slow, nextBookingDate: null });
    expect(leftOutAsInactive(client("n", quiet), null, marked)).toBe(true);
    expect(leftOutAsInactive(client("n", slow), null, marked)).toBe(false);
    expect(leftOutAsInactive(client("n", snap({ situation: "unknown" }), { isActive: false }), null, ctx())).toBe(true);
    const lapsed = snap({ situation: "lapsed", focusDate: "2026-06-01", lastVisitDate: "2026-05-20", nextBookingDate: null });
    expect(leftOutAsInactive(client("l", lapsed), null, ctx())).toBe(false);
    // A visitor is not this studio's to leave out: the home check comes first.
    expect(leftOutAsInactive(client("v", quiet, { homeStudioId: "westlake", isActive: false }), null, ctx())).toBe(false);
  });
});
