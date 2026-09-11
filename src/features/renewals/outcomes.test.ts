import { describe, it, expect } from "vitest";
import { closedOnFor, isSuccessor, outcomeCandidate, outcomePatch, renewalKind } from "./outcomes";
import { pickContracts, renewalOnTheBooks } from "./engine";
import { buildPackageNameIndex, DEFAULT_RENEWAL_SETTINGS } from "./settings";
import type { MindbodyContract } from "../../types";
import type { RenewalSnapshot } from "./types";

const TODAY = "2026-09-11";
const S = DEFAULT_RENEWAL_SETTINGS;

function snap(over: Partial<RenewalSnapshot>): RenewalSnapshot {
  return {
    version: 1,
    cycleKey: "A",
    renewalOnBooks: null,
    clientContractId: "A",
    packageKey: "committed",
    packageLabel: "Committed · 12 months",
    paymentMode: "monthly",
    billingStart: "2025-10-10",
    chargeDate: "2026-09-30",
    chargeDateSource: "mindbody",
    autoRenews: true,
    sessionsLeft: 6,
    sessionsLeftSource: "mindbody",
    sessionsOnHand: 6,
    paymentsLeft: 0,
    pacePerWeek: 2,
    runOutDate: "2026-09-30",
    bankedAtCharge: 0,
    situation: "on-track",
    conversationDue: true,
    chargeWarning: false,
    focusDate: "2026-09-30",
    flags: [],
    proof: { weeksAttended: null, weeksObserved: null, machinesImproved: null, machinesTracked: null, bestGain: null, inbody: null },
    awayUntil: null,
    awayReason: null,
    lastVisitDate: "2026-09-10",
    nextBookingDate: null,
    coachIds: [],
    primaryTrainerId: "t1",
    dataGaps: [],
    ...over,
  };
}

describe("what kind of renewal", () => {
  it("compares commitment lengths", () => {
    expect(renewalKind(S, "committed", "transformed")).toBe("upgraded");
    expect(renewalKind(S, "committed", "trial")).toBe("downgraded");
    expect(renewalKind(S, "committed", "committed")).toBe("renewed");
    expect(renewalKind(S, "committed", null)).toBe("renewed");
  });

  it("dates a closing by when the package ended, or today if it closed early", () => {
    expect(closedOnFor({ focusDate: "2026-08-02" }, TODAY)).toBe("2026-08-02");
    expect(closedOnFor({ focusDate: "2026-11-02" }, TODAY)).toBe(TODAY);
    expect(closedOnFor(null, TODAY)).toBe(TODAY);
  });
});

describe("the job's candidates", () => {
  it("records an upgrade already signed while the current package runs", () => {
    const c = outcomeCandidate({
      stored: snap({}),
      next: snap({ renewalOnBooks: { cycleKey: "B", packageKey: "transformed", startsOn: "2026-10-01" } }),
      settings: S,
      today: TODAY,
    });
    expect(c).toEqual({
      cycleKey: "A",
      outcome: "upgraded",
      packageKey: "committed",
      nextCycleKey: "B",
      nextPackageKey: "transformed",
      closedOn: TODAY,
    });
  });

  it("records a renewal when a newer package takes over", () => {
    const c = outcomeCandidate({
      stored: snap({ focusDate: "2026-09-09" }),
      next: snap({ cycleKey: "B", billingStart: "2026-09-10", focusDate: "2027-09-08" }),
      settings: S,
      today: TODAY,
    });
    expect(c).toMatchObject({ cycleKey: "A", outcome: "renewed", nextCycleKey: "B", closedOn: "2026-09-09" });
  });

  it("ignores the engine switching to an OLDER contract as new data arrives", () => {
    const stored = snap({});
    const older = snap({ cycleKey: "Z", billingStart: "2024-10-10" });
    expect(isSuccessor(stored, older, TODAY)).toBe(false);
    expect(outcomeCandidate({ stored, next: older, settings: S, today: TODAY })).toBeNull();
  });

  it("without start dates, trusts a package change only near the old package's end", () => {
    const next = snap({ cycleKey: "B", billingStart: null });
    expect(isSuccessor(snap({ billingStart: null, focusDate: "2026-10-01" }), next, TODAY)).toBe(true);
    expect(isSuccessor(snap({ billingStart: null, focusDate: "2027-03-01" }), next, TODAY)).toBe(false);
  });

  it("records lost when the studio's rule fires, but not for history older than the lapsed list", () => {
    const lapsed = snap({ situation: "lapsed", focusDate: "2026-07-20", paymentMode: null });
    expect(outcomeCandidate({ stored: lapsed, next: lapsed, settings: S, today: TODAY })).toMatchObject({
      cycleKey: "A",
      outcome: "lost",
      closedOn: "2026-07-20",
    });
    const ancient = snap({ situation: "lapsed", focusDate: "2025-01-20" });
    expect(outcomeCandidate({ stored: ancient, next: ancient, settings: S, today: TODAY })).toBeNull();
  });

  it("takes back a lost when the client comes back on the same package", () => {
    const c = outcomeCandidate({
      stored: snap({ situation: "lapsed" }),
      next: snap({ situation: "ended" }),
      settings: S,
      today: TODAY,
    });
    expect(c).toMatchObject({ cycleKey: "A", outcome: null });
  });

  it("says nothing on an ordinary night", () => {
    expect(outcomeCandidate({ stored: snap({}), next: snap({}), settings: S, today: TODAY })).toBeNull();
  });
});

describe("what the job writes", () => {
  const lost = { cycleKey: "A", outcome: "lost" as const, packageKey: "committed", nextCycleKey: null, nextPackageKey: null, closedOn: "2026-07-20" };

  it("never overwrites a leader's outcome", () => {
    expect(outcomePatch(lost, { outcome: "pay-as-you-go", outcomeBy: "leader-uid" })).toBeNull();
  });

  it("writes a new outcome, and not the same one twice", () => {
    expect(outcomePatch(lost, null)).toEqual({
      outcome: "lost",
      outcomeBy: "job",
      nextCycleKey: null,
      nextPackageKey: null,
      closedOn: "2026-07-20",
    });
    expect(outcomePatch(lost, { outcome: "lost", outcomeBy: "job", nextCycleKey: null })).toBeNull();
  });

  it("replaces its own lost with a renewal when the client comes back with a new package", () => {
    const renewed = { ...lost, outcome: "renewed" as const, nextCycleKey: "B", nextPackageKey: "committed", closedOn: TODAY };
    expect(outcomePatch(renewed, { outcome: "lost", outcomeBy: "job", nextCycleKey: null })?.outcome).toBe("renewed");
  });

  it("only takes back its own lost", () => {
    const clear = { ...lost, outcome: null, closedOn: null };
    expect(outcomePatch(clear, { outcome: "lost", outcomeBy: "job" })?.outcome).toBeNull();
    expect(outcomePatch(clear, { outcome: "renewed", outcomeBy: "job" })).toBeNull();
    expect(outcomePatch(clear, null)).toBeNull();
  });
});

describe("a renewal on the books", () => {
  it("is a later contract starting after today while the current one runs", () => {
    const index = buildPackageNameIndex(S);
    const contracts: Record<string, MindbodyContract> = {
      "1": { clientContractId: 1, status: "Active", contractName: "96 Sessions - 2X Week", startDate: "2025-10-10", endDate: "2026-09-30" } as any,
      "2": { clientContractId: 2, status: "Active", contractName: "144 Sessions - 2X Week", startDate: "2026-10-01", endDate: "2028-03-01" } as any,
    };
    const pick = pickContracts(contracts, TODAY, index);
    expect(renewalOnTheBooks(pick)).toEqual({ cycleKey: "2", packageKey: "transformed", startsOn: "2026-10-01" });
    expect(renewalOnTheBooks(pickContracts({ "1": contracts["1"] }, TODAY, index))).toBeNull();
  });
});
