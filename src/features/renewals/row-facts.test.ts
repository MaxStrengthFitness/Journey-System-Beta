import { describe, expect, it } from "vitest";
import {
  MAX_ROW_SIGNALS,
  endLine,
  leftNowLine,
  packageLine,
  planUndecided,
  renewalRowFacts,
  rowSignals,
  saidNotRenewing,
  talkedLine,
  touchHeadline,
} from "./row-facts";
import { DEFAULT_RENEWAL_SETTINGS } from "./settings";
import type { RenewalCycle, RenewalSnapshot } from "./types";

const TODAY = "2026-10-07";

const snap = (over: Partial<RenewalSnapshot> = {}): RenewalSnapshot =>
  ({
    version: 3,
    cycleKey: "9001",
    renewalOnBooks: null,
    clientContractId: "9001",
    packageKey: "committed",
    packageLabel: "Committed · 12 months",
    paymentMode: "monthly",
    billingStart: "2026-01-01",
    chargeDate: "2027-01-29",
    chargeDateSource: "mindbody",
    autoRenews: true,
    sessionsLeft: 52,
    sessionsLeftSource: "mindbody",
    sessionsOnHand: 20,
    paymentsLeft: 4,
    pacePerWeek: 1.5,
    runOutDate: null,
    bankedAtCharge: 23,
    situation: "will-bank",
    conversationDue: false,
    chargeWarning: false,
    focusDate: "2027-01-29",
    flags: [],
    proof: { weeksAttended: null, weeksObserved: null, machinesImproved: null, machinesTracked: null, bestGain: null, inbody: null },
    awayUntil: null,
    awayReason: null,
    lastVisitDate: "2026-10-05",
    nextBookingDate: "2026-10-09",
    coachIds: [],
    primaryTrainerId: "t1",
    dataGaps: [],
    commitmentEnd: "2027-01-29",
    commitmentEndSource: "mindbody",
    ledger: { carriedIn: 9, thisContract: 11, toCome: 32, extra: 2, total: 54, source: "mindbody", asOf: "2026-10-06" },
    projection: {
      endsOn: "2027-01-29",
      endsOnSource: "mindbody",
      booked: 3,
      bookedThrough: "2026-10-30",
      paceWeeks: 13,
      pacePerWeek: 1.5,
      leftAtEnd: 23,
      leftAtEndLow: 13,
      leftAtEndHigh: 32,
      runOutDate: null,
    },
    rate: { perSession: 54, payment: 432, source: "mindbody", packageRate: 60, special: true },
    signals: { paceRecent: 1.5, pacePrior: 1.5, paceTrend: "steady", totalSessions: 318, totalSessionsBasis: "confirmed", suggestedPackageKey: "committed" },
    ...over,
  }) as RenewalSnapshot;

const cycle = (over: Partial<RenewalCycle> = {}): RenewalCycle =>
  ({
    clientId: "c1",
    clientName: "Nora Reyes",
    cycleKey: "9001",
    stage: "talking",
    latestLeaning: null,
    latestConcerns: [],
    latestInterestedIn: null,
    needsLeader: false,
    lastTouchAt: null,
    lastTouchBy: null,
    lastTouchByName: null,
    ...over,
  }) as RenewalCycle;

// A Firestore-like timestamp the studio-time helpers read.
const at = (iso: string) => ({ toDate: () => new Date(iso) });

describe("the row, cell by cell", () => {
  it("says the package with its rate, and 'special' when Mindbody charges differently", () => {
    expect(packageLine(snap())).toBe("Committed · 12 months · at $54 a session (special)");
    expect(packageLine(snap({ rate: { perSession: 60, payment: 480, source: "package", packageRate: 60, special: false } }))).toBe(
      "Committed · 12 months · at $60 a session",
    );
    expect(packageLine(snap({ paymentMode: "prepaid", rate: { perSession: 57, payment: null, source: "package", packageRate: 57, special: false } }))).toBe(
      "Committed · 12 months · paid in full · at $57 a session",
    );
    expect(packageLine(snap({ packageLabel: null, rate: null }))).toBe("Package not recognized");
    expect(packageLine(snap({ packageLabel: null, rate: null, situation: "unknown" }))).toBe("No Mindbody data yet");
  });

  it("says when the commitment ends with the decided auto-renew answer", () => {
    expect(endLine(snap(), TODAY)).toBe("Auto-renews Jan 29, 2027");
    expect(endLine(snap({ autoRenews: false }), TODAY)).toBe("Ends Jan 29, 2027");
    expect(endLine(snap({ autoRenews: null }), TODAY)).toBe("Commitment ends Jan 29, 2027");
    expect(endLine(snap({ paymentMode: "prepaid", commitmentEnd: "2026-12-03", commitmentEndSource: "estimate" }), TODAY)).toBe("Ends around Dec 3");
    expect(endLine(snap({ paymentMode: "sessions-only", commitmentEnd: null, chargeDate: null }), TODAY)).toBe("Payments finished");
    // A version-2 snapshot: the charge date stands in for a monthly contract.
    expect(endLine(snap({ commitmentEnd: undefined, chargeDate: "2026-11-14", chargeDateSource: "estimate" }), TODAY)).toBe("Auto-renews around Nov 14");
  });

  it("says sessions left part by part, and the plain count without a ledger", () => {
    expect(leftNowLine(snap())).toBe("52 left: 9 rolled over · 11 this contract · 32 to come · +2 extra");
    expect(leftNowLine(snap({ ledger: null, sessionsLeft: 12, sessionsLeftSource: "estimate" }))).toBe("12 left (estimated)");
    expect(leftNowLine(snap({ ledger: null, sessionsLeft: null }))).toBe("Sessions left not known");
  });

  it("says who last talked, when and what they heard; a failed read is 'Couldn't check'", () => {
    expect(talkedLine(null, TODAY)).toBe("Nobody has talked to them yet");
    expect(talkedLine(null, TODAY, true)).toBe("Couldn't check");
    const talked = cycle({ lastTouchAt: at("2026-10-03T15:00:00Z"), lastTouchByName: "Jen Park", latestLeaning: "unsure", latestConcerns: ["price"] });
    expect(talkedLine(talked, TODAY)).toBe("Talked Oct 3 · Jen · Unsure — price");
    // A cycle that answered is never "Couldn't check", even when another chunk failed.
    expect(talkedLine(cycle(), TODAY, true)).toBe("Nobody has talked to them yet");
  });
});

describe("the signals", () => {
  it("says at most two, the most telling first", () => {
    const s = snap({
      nextBookingDate: null,
      signals: { paceRecent: 0.5, pacePrior: 2, paceTrend: "down", totalSessions: 318, totalSessionsBasis: "confirmed", suggestedPackageKey: "transformed" },
    });
    const out = rowSignals(s, DEFAULT_RENEWAL_SETTINGS, TODAY);
    expect(out).toHaveLength(MAX_ROW_SIGNALS);
    expect(out[0]).toContain("Coming less");
    expect(out[1]).toBe("Nothing booked · last came Oct 5");
  });

  it("names a package that fits their pace better, never the one they're on", () => {
    const fits = snap({ signals: { paceRecent: 2, pacePrior: 2, paceTrend: "steady", totalSessions: null, totalSessionsBasis: null, suggestedPackageKey: "transformed" } });
    expect(rowSignals(fits, DEFAULT_RENEWAL_SETTINGS, TODAY)[0]).toMatch(/^At their pace, .+ fits best$/);
    expect(rowSignals(snap(), DEFAULT_RENEWAL_SETTINGS, TODAY)).toEqual(["318 sessions in all", "Next booked Oct 9"]);
  });

  it("doesn't say 'Nothing booked' for a client who is away or lapsed", () => {
    expect(rowSignals(snap({ situation: "away", nextBookingDate: null, signals: null }), DEFAULT_RENEWAL_SETTINGS, TODAY)).toEqual([]);
  });
});

describe("the whole row", () => {
  it("puts every cell together, with the working behind the (i)", () => {
    const f = renewalRowFacts({ snapshot: snap(), cycle: null, settings: DEFAULT_RENEWAL_SETTINGS, today: TODAY, trainerName: "Jen Park", proof: "Came 30 of 34 weeks." });
    expect(f.trainer).toBe("Jen Park");
    expect(f.atEnd).toBe("About 23 left when the commitment ends Jan 29, 2027 (13–32)");
    expect(f.plan).toBeNull();
    expect(f.why).toEqual([
      "At the end: 52 left, 3 booked, then 1.5× a week for 13 weeks.",
      "Sessions left from Mindbody, Oct 6.",
      "The package table says $60 a session; Mindbody charges this client differently.",
      "Came 30 of 34 weeks.",
    ]);
  });

  it("says the plan with who set it", () => {
    const f = renewalRowFacts({
      snapshot: snap(),
      cycle: cycle({ plan: { choice: "upgrade", packageKey: "transformed", note: "", byUid: "u", byName: "Jen Park", at: at("2026-10-06T15:00:00Z") } }),
      settings: DEFAULT_RENEWAL_SETTINGS,
      today: TODAY,
    });
    expect(f.plan).toMatch(/^Upgrading to .+ · Jen, Oct 6$/);
    expect(f.trainer).toBeNull();
  });
});

describe("the plan filters", () => {
  const plan = (choice: string) => ({ choice, byUid: "u", byName: "Jen", at: null }) as RenewalCycle["plan"];
  it("'Plan: not decided' holds no plan and 'Not decided yet'", () => {
    expect(planUndecided(null)).toBe(true);
    expect(planUndecided(cycle({ plan: plan("undecided") }))).toBe(true);
    expect(planUndecided(cycle({ plan: plan("let-renew") }))).toBe(false);
    expect(planUndecided(cycle({ plan: plan("not-renewing") }))).toBe(false);
  });

  it("'Not renewing' holds the plan, or the latest conversation when no plan says otherwise", () => {
    expect(saidNotRenewing(cycle({ plan: plan("not-renewing") }))).toBe(true);
    expect(saidNotRenewing(cycle({ latestLeaning: "not-renewing" }))).toBe(true);
    expect(saidNotRenewing(cycle({ latestLeaning: "not-renewing", plan: plan("renew-same") }))).toBe(false);
    expect(saidNotRenewing(cycle({ latestLeaning: "unsure" }))).toBe(false);
    expect(saidNotRenewing(null)).toBe(false);
  });
});

describe("a touch in the history", () => {
  it("reads a plan change as the plan, and a conversation as its leaning", () => {
    expect(touchHeadline({ leaning: "renewing", concerns: [], kind: "plan", plan: { choice: "upgrade", packageKey: "transformed" } })).toBe("Plan: Upgrading");
    expect(touchHeadline({ leaning: "unsure", concerns: ["price", "schedule"] })).toBe("Unsure — price, schedule");
  });
});
