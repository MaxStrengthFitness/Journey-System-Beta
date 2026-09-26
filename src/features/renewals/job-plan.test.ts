import { describe, it, expect } from "vitest";
import {
  mindbodyIdOf,
  namesSeenFrom,
  pullOrder,
  pullRank,
  sessionsLoggedSince,
  studioIsLive,
  unmatchedNames,
} from "./job-plan";
import { buildPackageNameIndex, DEFAULT_RENEWAL_SETTINGS } from "./settings";
import type { Client } from "../../types";
import type { RenewalSnapshot } from "./types";

const TODAY = "2026-09-11";

const base = { id: "100001", firstName: "A", lastName: "B", homeStudioId: "s", height: "", isActive: true, remainingSessions: 0 } as Client;

function snap(over: Partial<RenewalSnapshot>): RenewalSnapshot {
  return { focusDate: null, lastVisitDate: null, nextBookingDate: null, ...over } as RenewalSnapshot;
}

describe("pullRank - packages when a sale happens (the cost plan, Part C)", () => {
  it("never pulls a temporary profile or a merged-away record", () => {
    expect(pullRank({ client: { ...base, provisional: true }, current: snap({}), today: TODAY })).toBeNull();
    expect(mindbodyIdOf({ ...base, supersededById: "x" })).toBeNull();
  });

  it("pulls first a client Mindbody said changed since the last pull", () => {
    const client = {
      ...base,
      mindbodyServicesSyncedAt: "2026-09-01T10:00:00.000Z",
      mindbodyCommercialChangedAt: "2026-09-10T15:00:00.000Z",
    } as Client;
    expect(pullRank({ client, current: snap({}), today: TODAY })).toBe(0);
    // A change the last pull already read is not news.
    const read = { ...client, mindbodyServicesSyncedAt: "2026-09-10T16:00:00.000Z" } as Client;
    expect(pullRank({ client: read, current: snap({}), today: TODAY })).toBeNull();
    // Even a past client: the sale woke them.
    const never = { ...base, mindbodyCommercialChangedAt: "2026-09-10T15:00:00.000Z" } as Client;
    expect(pullRank({ client: never, current: snap({}), today: TODAY })).toBe(0);
  });

  it("pulls a client near the end of a package the morning they train, at most weekly", () => {
    const client = { ...base, mindbodyServicesSyncedAt: "2026-09-01" } as Client;
    const near = snap({ sessionsLeft: 14, lastVisitDate: "2026-09-10" });
    // Mindbody said 14 on Sep 1; Journey has logged 5 since: about 9 left, under a threshold of 10.
    expect(pullRank({ client, current: near, today: TODAY, bookedToday: true, loggedSincePull: 5, conversationAt: 10 })).toBe(1);
    // Not in today: it waits for a day they are.
    expect(pullRank({ client, current: near, today: TODAY, bookedToday: false, loggedSincePull: 5, conversationAt: 10 })).toBeNull();
    // Pulled three days ago: not again yet.
    const recent = { ...base, mindbodyServicesSyncedAt: "2026-09-08" } as Client;
    expect(pullRank({ client: recent, current: near, today: TODAY, bookedToday: true, loggedSincePull: 5, conversationAt: 10 })).toBeNull();
  });

  it("leaves a client far from the end alone on the days they train", () => {
    const client = { ...base, mindbodyServicesSyncedAt: "2026-09-01" } as Client;
    const far = snap({ sessionsLeft: 40, lastVisitDate: "2026-09-10" });
    expect(pullRank({ client, current: far, today: TODAY, bookedToday: true, loggedSincePull: 3, conversationAt: 10 })).toBeNull();
  });

  it("takes the snapshot's own 'conversation due' too", () => {
    const client = { ...base, mindbodyServicesSyncedAt: "2026-09-01" } as Client;
    const due = snap({ sessionsLeft: 12, conversationDue: true, lastVisitDate: "2026-09-10" });
    expect(pullRank({ client, current: due, today: TODAY, bookedToday: true, loggedSincePull: 0, conversationAt: 10 })).toBe(1);
  });

  it("pulls a never-pulled client who trains here, and never a quiet one", () => {
    expect(pullRank({ client: base, current: snap({ lastVisitDate: "2026-09-10" }), today: TODAY })).toBe(2);
    expect(pullRank({ client: base, current: snap({ nextBookingDate: "2026-09-14" }), today: TODAY })).toBe(2);
    expect(pullRank({ client: base, current: snap({}), today: TODAY })).toBeNull();
  });

  it("re-reads an active client after a month, and never a past one on a timer", () => {
    const client = { ...base, mindbodyServicesSyncedAt: "2026-08-01" } as Client;
    expect(pullRank({ client, current: snap({ lastVisitDate: "2026-09-10" }), today: TODAY })).toBe(3);
    expect(pullRank({ client, current: snap({}), today: TODAY })).toBeNull();
    const fresh = { ...base, mindbodyServicesSyncedAt: "2026-09-01" } as Client;
    expect(pullRank({ client: fresh, current: snap({ lastVisitDate: "2026-09-10" }), today: TODAY })).toBeNull();
  });

  it("asks Mindbody only about ids it can know", () => {
    expect(mindbodyIdOf({ ...base, id: "100001" })).toBe("100001");
    expect(mindbodyIdOf({ ...base, id: "Xk3pQ9aB2cD4eF6gH8iJ" })).toBeNull();
    expect(mindbodyIdOf({ ...base, id: "Xk3pQ9aB2cD4eF6gH8iJ", mindbodyClientId: "A-77" } as Client)).toBe("A-77");
  });

  it("pulls the nearest renewal first within a rank", () => {
    const rows = [
      { rank: 0, focusDate: "2026-12-20" },
      { rank: 1, focusDate: "2026-09-12" },
      { rank: 0, focusDate: "2026-09-20" },
      { rank: 0, focusDate: "2026-08-30" },
    ];
    expect(rows.sort((a, b) => pullOrder(a, b, TODAY)).map((r) => r.focusDate)).toEqual([
      "2026-09-20",
      "2026-08-30",
      "2026-12-20",
      "2026-09-12",
    ]);
  });
});

describe("studioIsLive (AJ, Sep 26: no syncing a studio's clients before it goes live)", () => {
  it("is live from the day before its cutover", () => {
    expect(studioIsLive("2026-11-01", "2026-11-01")).toBe(true);
    expect(studioIsLive("2026-10-15", "2026-11-01")).toBe(true);
    expect(studioIsLive("2026-11-02", "2026-11-01")).toBe(false);
  });

  it("is not live with no cutover date, or one it cannot read", () => {
    expect(studioIsLive(null, "2026-11-01")).toBe(false);
    expect(studioIsLive(undefined, "2026-11-01")).toBe(false);
    expect(studioIsLive("Nov 1", "2026-11-01")).toBe(false);
  });
});

describe("sessionsLoggedSince", () => {
  it("counts completed sessions after the pull's day", () => {
    const sessions = [
      { date: "2026-09-01", status: "Completed" },
      { date: "2026-09-02", status: "Completed" },
      { date: "2026-09-05", status: "In-Progress" },
      { date: "2026-09-08T10:00:00", status: "Completed" },
      { status: "Completed" },
    ];
    expect(sessionsLoggedSince(sessions, "2026-09-01")).toBe(2);
    expect(sessionsLoggedSince(sessions, null)).toBe(0);
  });
});

describe("names seen", () => {
  it("counts each client once per name, and finds the ones nobody claims", () => {
    const clients = [
      {
        ...base,
        id: "1",
        mindbodyContracts: { a: { clientContractId: 1, status: "Active", contractName: "Committed 12 Month EFT" } },
        mindbodyServices: {
          x: { serviceId: 1, name: "96 Sessions - 2X Week" },
          y: { serviceId: 2, name: "96 Sessions - 2X Week" },
        },
      },
      { ...base, id: "2", mindbodyServices: { z: { serviceId: 3, name: "96 sessions - 2x week" } } },
    ] as Client[];
    const names = namesSeenFrom(clients);
    const pricing = Object.values(names).find((n) => n.kind === "pricing-option")!;
    expect(pricing.clients).toBe(2);
    const unmatched = unmatchedNames(names, buildPackageNameIndex(DEFAULT_RENEWAL_SETTINGS));
    expect(unmatched.map((n) => n.name)).toEqual(["Committed 12 Month EFT"]);
  });
});
