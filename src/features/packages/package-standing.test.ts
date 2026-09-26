import { describe, expect, it } from "vitest";
import { DEFAULT_RENEWAL_SETTINGS } from "../renewals/settings";
import { buildRenewalSnapshot } from "../renewals/engine";
import type { RenewalSnapshot } from "../renewals/types";
import type { Client, MindbodyContract, MindbodyService } from "../../types";
import { packageStanding, type StandingInput } from "./package-standing";

const TODAY = "2026-09-24";

function contract(over: Partial<MindbodyContract> & { id: number }): MindbodyContract {
  const { id, ...rest } = over;
  return { clientContractId: id, status: "Active", contractName: "Committed 12 Month EFT", ...rest };
}

function service(id: number, name: string, remaining: number, over: Partial<MindbodyService> = {}): MindbodyService {
  return { serviceId: id, name, count: 8, remaining, activeDate: "2026-08-14", ...over };
}

/** The parts of a snapshot these rules read; the rest is irrelevant here. */
function snap(over: Partial<RenewalSnapshot>): RenewalSnapshot {
  return {
    cycleKey: null,
    packageKey: null,
    packageLabel: null,
    paymentMode: null,
    renewalOnBooks: null,
    situation: "unknown",
    focusDate: null,
    dataGaps: [],
    ...over,
  } as RenewalSnapshot;
}

/** A client Mindbody has been checked for, with nothing on file. */
function input(over: Partial<StandingInput> = {}, client: Partial<StandingInput["client"]> = {}): StandingInput {
  return {
    firstName: "Judy",
    today: TODAY,
    settings: DEFAULT_RENEWAL_SETTINGS,
    coverage: "complete",
    ...over,
    client: {
      mindbodyServicesSyncedAt: "2026-09-23",
      mindbodyCommercialSyncedAt: "2026-09-23",
      ...client,
    },
  };
}

describe("has a package: no door", () => {
  it("when the snapshot names a renewal cycle (the Renewal conversation button is there)", () => {
    const s = packageStanding(input({}, { renewal: snap({ cycleKey: "9001", situation: "on-track" }) }));
    expect(s).toMatchObject({ kind: "has", showDoor: false });
  });

  it("when a contract is running today, even if last night's snapshot hasn't caught up", () => {
    const s = packageStanding(
      input({}, { mindbodyContracts: { "9001": contract({ id: 9001, startDate: "2026-09-01", endDate: "2027-08-01" }) } }),
    );
    expect(s.kind).toBe("has");
  });

  it("when a contract starts later", () => {
    const s = packageStanding(input({}, { mindbodyContracts: { "9002": contract({ id: 9002, startDate: "2026-10-01" }) } }));
    expect(s.kind).toBe("has");
  });

  it("when package sessions are on hand in Mindbody", () => {
    const s = packageStanding(input({}, { mindbodyServices: { a: service(1, "96 PIF", 30, { count: 96 }) } }));
    expect(s.kind).toBe("has");
  });

  it("when the snapshot says paid in full or using banked sessions", () => {
    expect(packageStanding(input({}, { renewal: snap({ paymentMode: "prepaid" }) })).kind).toBe("has");
    expect(packageStanding(input({}, { renewal: snap({ paymentMode: "sessions-only" }) })).kind).toBe("has");
  });

  it("ignores a cancelled contract", () => {
    const s = packageStanding(
      input({}, { mindbodyContracts: { "9003": contract({ id: 9003, status: "Cancelled", startDate: "2026-09-01", cancelledAt: "2026-09-02" }) } }),
    );
    expect(s.kind).not.toBe("has");
  });
});

describe("away: no door", () => {
  it("never pitches to someone on a pause", () => {
    expect(packageStanding(input({}, { renewal: snap({ situation: "away" }) }))).toMatchObject({ kind: "away", showDoor: false });
  });
});

/** A snapshot exactly as the nightly job writes it, from real Mindbody records. */
function engineSnapshot(over: Partial<Client>): RenewalSnapshot {
  const client = {
    id: "c1",
    firstName: "Judy",
    lastName: "Visitor",
    homeStudioId: "westlake",
    isActive: true,
    remainingSessions: 0,
    mindbodyServicesSyncedAt: "2026-09-23",
    mindbodyCommercialSyncedAt: "2026-09-23",
    ...over,
  } as Client;
  return buildRenewalSnapshot({
    client,
    settings: DEFAULT_RENEWAL_SETTINGS,
    today: TODAY,
    attendance: [],
    attendanceSince: "2026-01-01",
  });
}

describe("ended: a door, from snapshots the engine really writes", () => {
  // The contract carries a name the standard table matches, so the engine knows which package it was.
  const ended = (endDate: string, contractName = "96 Sessions - 2X Week") => ({
    mindbodyContracts: { "9001": contract({ id: 9001, contractName, startDate: "2025-08-01", endDate }) },
  });

  it("a contract that ended keeps its cycleKey, and still gets the door", () => {
    const renewal = engineSnapshot(ended("2026-09-15"));
    expect(renewal.cycleKey).toBe("9001");
    expect(renewal.situation).toBe("ended");
    const s = packageStanding(input({}, { ...ended("2026-09-15"), renewal }));
    expect(s).toMatchObject({ kind: "ended", showDoor: true, pricesOnScreen: false });
    expect(s.sentence).toBe("Committed ended Sep 15.");
  });

  it("says 'their package' when the engine couldn't name it", () => {
    const over = ended("2026-09-15", "A contract nobody matched");
    const renewal = engineSnapshot(over);
    expect(renewal.situation).toBe("ended");
    expect(packageStanding(input({}, { ...over, renewal })).sentence).toBe("Their package ended Sep 15.");
  });

  it("a win-back client, lapsed past the studio's window, gets the door too", () => {
    const renewal = engineSnapshot(ended("2026-03-10"));
    expect(renewal.situation).toBe("lapsed");
    const s = packageStanding(input({}, { ...ended("2026-03-10"), renewal }));
    expect(s.kind).toBe("ended");
    expect(s.sentence).toBe("No package since Mar 10.");
  });

  it("an ended contract with a name the studio hasn't matched is 'unknown', worded as such", () => {
    const over = { ...ended("2026-08-03"), mindbodyServices: { m: service(5, "Mystery Pack", 3) } };
    const renewal = engineSnapshot(over);
    expect(renewal.cycleKey).toBe("9001");
    const s = packageStanding(input({ studioName: "Westlake" }, { ...over, renewal }));
    expect(s.kind).toBe("unknown");
    expect(s.sentence).toMatch(/Mystery Pack/);
  });

  it("a live contract whose name isn't matched is still a package: no door", () => {
    const over = {
      mindbodyContracts: { "9002": contract({ id: 9002, contractName: "Odd EFT", startDate: "2026-09-01", endDate: "2027-08-01" }) },
    };
    const renewal = engineSnapshot(over);
    expect(packageStanding(input({}, { ...over, renewal })).kind).toBe("has");
  });

  it("a live, matched package is 'has', whatever else", () => {
    const over = { mindbodyContracts: { "9003": contract({ id: 9003, startDate: "2026-09-01", endDate: "2027-08-01" }) } };
    const renewal = engineSnapshot(over);
    expect(["on-track", "will-bank", "will-run-out", "unknown"]).toContain(renewal.situation);
    expect(packageStanding(input({}, { ...over, renewal })).kind).toBe("has");
  });
});

describe("ended: a door, worded from what Journey knows", () => {
  it("names the package that ended and when", () => {
    const s = packageStanding(
      input({}, { renewal: snap({ situation: "ended", packageLabel: "Committed · 12 months", focusDate: "2026-08-03" }) }),
    );
    expect(s).toMatchObject({ kind: "ended", showDoor: true, pricesOnScreen: false });
    expect(s.sentence).toBe("Committed ended Aug 3.");
  });

  it("says since when, once it has lapsed", () => {
    const s = packageStanding(input({}, { renewal: snap({ situation: "lapsed", focusDate: "2026-05-10" }) }));
    expect(s.sentence).toBe("No package since May 10.");
  });
});

describe("none: the only answer that says 'no package'", () => {
  it("says when Mindbody was checked", () => {
    const s = packageStanding(input());
    expect(s).toMatchObject({ kind: "none", showDoor: true, pricesOnScreen: true });
    expect(s.sentence).toBe("Mindbody showed no package for Judy when it was last checked, Sep 23.");
  });

  it("is not thrown off by complimentary sessions (a prospect on free workouts)", () => {
    const s = packageStanding(input({}, { mindbodyServices: { c: service(9, "Session Comp", 2, { count: 2 }) } }));
    expect(s.kind).toBe("none");
  });

  it("keeps prices off the post-session screen unless Journey holds the client's whole story", () => {
    expect(packageStanding(input({ coverage: "partial" })).pricesOnScreen).toBe(false);
    expect(packageStanding(input({ coverage: "unknown" })).pricesOnScreen).toBe(false);
    expect(packageStanding(input({ coverage: "partial" })).showDoor).toBe(true);
  });

  it("never calls anyone new or first", () => {
    for (const cov of ["complete", "partial", "unknown"] as const) {
      expect(packageStanding(input({ coverage: cov })).sentence).not.toMatch(/\bnew\b|first/i);
    }
  });
});

describe("unknown: a door with the reason, never 'no package'", () => {
  it("before Mindbody has been checked at all", () => {
    const s = packageStanding(input({}, { mindbodyServicesSyncedAt: undefined, mindbodyCommercialSyncedAt: undefined }));
    expect(s).toMatchObject({ kind: "unknown", showDoor: true, pricesOnScreen: false });
    expect(s.sentence).toBe("Journey hasn't checked Mindbody for Judy's package yet.");
  });

  it("before the session balance has come through", () => {
    const s = packageStanding(input({}, { mindbodyServicesSyncedAt: undefined }));
    expect(s.sentence).toBe("Mindbody's session balance for Judy hasn't come through yet.");
  });

  it("when a Mindbody name isn't matched to one of the studio's packages", () => {
    const s = packageStanding(
      input({ studioName: "Westlake" }, { mindbodyServices: { a: service(1, "96 Sess Special", 40) } }),
    );
    expect(s.kind).toBe("unknown");
    expect(s.sentence).toBe("Mindbody shows “96 Sess Special” for Judy, which isn't matched to one of Westlake's packages yet.");
  });

  it("when the account is on the other Mindbody site", () => {
    const s = packageStanding(input({ studioSiteId: "29068" }, { mindbodySiteId: "5746957" }));
    expect(s.kind).toBe("unknown");
    expect(s.sentence).toMatch(/other Mindbody site/);
  });

  it("is 'none' when the site matches or isn't known", () => {
    expect(packageStanding(input({ studioSiteId: "29068" }, { mindbodySiteId: "29068" })).kind).toBe("none");
    expect(packageStanding(input({ studioSiteId: null }, { mindbodySiteId: "5746957" })).kind).toBe("none");
  });

  it("while the package table hasn't loaded, because a name may be one it knows", () => {
    const s = packageStanding(input({ settings: null }));
    expect(s.kind).toBe("unknown");
    expect(s.sentence).toBe("Journey couldn't check Judy's package just now.");
  });

  it("when an ended contract is on record but the snapshot hasn't said so", () => {
    const s = packageStanding(
      input({}, { mindbodyContracts: { "8": contract({ id: 8, startDate: "2025-01-01", endDate: "2026-01-01" }) } }),
    );
    expect(s.kind).toBe("unknown");
    expect(s.sentence).toBe("Journey can't tell yet whether Judy has a package.");
  });

  it("for a temporary profile, which may see prices", () => {
    const s = packageStanding(input({ coverage: "unknown" }, { provisional: true, mindbodyServicesSyncedAt: undefined }));
    expect(s).toMatchObject({ kind: "unknown", showDoor: true, pricesOnScreen: true });
    expect(s.sentence).toBe("A temporary profile: Mindbody has no account for Judy yet.");
  });

  it("uses a neutral word when there is no first name", () => {
    const s = packageStanding(input({ firstName: "" }, { mindbodyServicesSyncedAt: undefined, mindbodyCommercialSyncedAt: undefined }));
    expect(s.sentence).toBe("Journey hasn't checked Mindbody for this client's package yet.");
  });
});
