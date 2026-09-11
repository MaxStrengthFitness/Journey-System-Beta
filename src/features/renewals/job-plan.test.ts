import { describe, it, expect } from "vitest";
import { mindbodyIdOf, namesSeenFrom, pullOrder, pullRank, unmatchedNames } from "./job-plan";
import { buildPackageNameIndex, DEFAULT_RENEWAL_SETTINGS } from "./settings";
import type { Client } from "../../types";
import type { RenewalSnapshot } from "./types";

const TODAY = "2026-09-11";

const base = { id: "100001", firstName: "A", lastName: "B", homeStudioId: "s", height: "", isActive: true, remainingSessions: 0 } as Client;

function snap(over: Partial<RenewalSnapshot>): RenewalSnapshot {
  return { focusDate: null, lastVisitDate: null, nextBookingDate: null, ...over } as RenewalSnapshot;
}

describe("pullRank", () => {
  it("never pulls a temporary profile or a merged-away record", () => {
    expect(pullRank({ client: { ...base, provisional: true }, current: snap({}), today: TODAY })).toBeNull();
    expect(mindbodyIdOf({ ...base, supersededById: "x" })).toBeNull();
  });

  it("puts a client near their renewal first, when their data is a week old", () => {
    const client = { ...base, mindbodyServicesSyncedAt: "2026-09-01" };
    expect(pullRank({ client, current: snap({ focusDate: "2026-11-01" }), today: TODAY })).toBe(0);
    expect(pullRank({ client, current: snap({ focusDate: "2027-06-01" }), today: TODAY })).toBeNull();
  });

  it("pulls a never-pulled active client before a quiet one", () => {
    expect(pullRank({ client: base, current: snap({ lastVisitDate: "2026-09-10" }), today: TODAY })).toBe(1);
    expect(pullRank({ client: base, current: snap({}), today: TODAY })).toBe(3);
  });

  it("treats a package that ended long ago as history, not 'near'", () => {
    const client = { ...base, mindbodyServicesSyncedAt: "2026-09-01" };
    expect(pullRank({ client, current: snap({ focusDate: "2026-07-01" }), today: TODAY })).toBe(0);
    expect(pullRank({ client, current: snap({ focusDate: "2024-07-01" }), today: TODAY })).toBeNull();
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

  it("refreshes anyone after a month", () => {
    const client = { ...base, mindbodyServicesSyncedAt: "2026-08-01" };
    expect(pullRank({ client, current: snap({}), today: TODAY })).toBe(2);
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
