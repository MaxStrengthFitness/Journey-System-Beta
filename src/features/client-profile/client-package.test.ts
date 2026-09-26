import { describe, it, expect } from "vitest";
import { remainingLabel, resolvePackage } from "./client-package";
import type { Client, MindbodyContract, ScheduleEntry } from "../../types";

const baseClient = (extra: Partial<Client> = {}): Client =>
  ({
    firstName: "Judy",
    lastName: "Daus",
    homeStudioId: "solon",
    height: "",
    isActive: true,
    remainingSessions: 4,
    ...extra,
  }) as Client;

const booking = (extra: Partial<ScheduleEntry> = {}): ScheduleEntry =>
  ({
    clientName: "Judy Daus",
    trainerName: "AJ",
    studioId: "solon",
    startTime: "2026-09-08T14:00:00Z",
    endTime: "2026-09-08T14:30:00Z",
    status: "Scheduled",
    serviceName: "Strength 30",
    source: "MindBody",
    createdAt: "2026-09-03T12:00:00Z",
    ...extra,
  }) as ScheduleEntry;

describe("resolvePackage", () => {
  it("uses the Mindbody membership count when that is all there is", () => {
    const pkg = resolvePackage(
      baseClient({
        mindbodyMemberships: {
          "1": { membershipId: 1, membershipName: "6-Month Package", status: "Active", sessionsRemaining: 12, sessionCount: 48, lastPullSyncAt: "2026-09-04T10:00:00Z" },
        },
      }),
    );
    expect(pkg.source).toBe("mindbody-membership");
    expect(pkg.label).toBe("6-Month Package");
    expect(pkg.remaining).toBe(12);
    expect(pkg.total).toBe(48);
    expect(pkg.fromMindbody).toBe(true);
  });

  it("prefers the booking's pass snapshot when it is newer than the last pull", () => {
    const pkg = resolvePackage(
      baseClient({
        mindbodyMemberships: {
          "1": { membershipId: 1, membershipName: "6-Month Package", status: "Active", sessionsRemaining: 12, lastPullSyncAt: "2026-09-01T10:00:00Z" },
        },
      }),
      [booking({ createdAt: "2026-09-03T12:00:00Z", mindbodyPass: { sessionsRemaining: 11, sessionsTotal: 48 } })],
    );
    expect(pkg.source).toBe("mindbody-pass");
    expect(pkg.remaining).toBe(11);
    expect(pkg.label).toBe("6-Month Package");
  });

  it("prefers the pull when it is newer than the booking", () => {
    const pkg = resolvePackage(
      baseClient({
        mindbodyMemberships: {
          "1": { membershipId: 1, membershipName: "6-Month Package", status: "Active", sessionsRemaining: 9, lastPullSyncAt: "2026-09-05T10:00:00Z" },
        },
      }),
      [booking({ createdAt: "2026-09-03T12:00:00Z", mindbodyPass: { sessionsRemaining: 11 } })],
    );
    expect(pkg.source).toBe("mindbody-membership");
    expect(pkg.remaining).toBe(9);
  });

  it("ignores cancelled memberships", () => {
    const pkg = resolvePackage(
      baseClient({
        mindbodyMemberships: {
          "1": { membershipId: 1, membershipName: "Old Pack", status: "Cancelled", sessionsRemaining: 3 },
        },
      }),
    );
    expect(pkg.source).toBe("app");
    expect(pkg.remaining).toBe(4);
  });

  it("names the contract and counts from the app when Mindbody has no count", () => {
    const pkg = resolvePackage(
      baseClient({
        mindbodyContracts: {
          "77": { clientContractId: 77, contractName: "12-Month Autopay", status: "Active", isAutoRenewing: true, startDate: "2026-01-01T00:00:00Z" },
        },
      }),
    );
    expect(pkg.source).toBe("mindbody-contract");
    expect(pkg.label).toBe("12-Month Autopay");
    expect(pkg.remaining).toBe(4);
    expect(pkg.autoRenews).toBe(true);
  });

  /*
   * Auto-renew is on at some studios and not at others (AJ, Sep 24 2026), and
   * an active autopay only means the monthly payments are running.
   */
  it("takes auto-renew from Mindbody's flag alone, never from autopay", () => {
    const renews = (contract: Partial<MindbodyContract>) =>
      resolvePackage(
        baseClient({
          mindbodyContracts: {
            "77": { clientContractId: 77, contractName: "12-Month Autopay", status: "Active", startDate: "2026-01-01T00:00:00Z", ...contract },
          },
        }),
      ).autoRenews;
    expect(renews({ isAutoRenewing: true })).toBe(true);
    expect(renews({ isAutoRenewing: false, autopayStatus: "Active" })).toBe(false);
    expect(renews({ autopayStatus: "Active" })).toBeNull();
    expect(renews({})).toBeNull();
  });

  it("falls back to the app's own package tier and remaining count", () => {
    const pkg = resolvePackage(baseClient({ packageTier: "6-Month", remainingSessions: 7 }));
    expect(pkg).toMatchObject({ source: "app", label: "6-Month", remaining: 7, fromMindbody: false, autoRenews: null });
  });

  it("treats packageTier 'None' as no label", () => {
    const pkg = resolvePackage(baseClient({ packageTier: "None", remainingSessions: 2 }));
    expect(pkg.label).toBeNull();
    expect(pkg.remaining).toBe(2);
  });

  it("returns 'none' for a client with nothing at all", () => {
    const pkg = resolvePackage(baseClient({ remainingSessions: undefined as unknown as number }));
    expect(pkg.source).toBe("none");
    expect(remainingLabel(pkg)).toBeNull();
  });
});

describe("remainingLabel", () => {
  it("reads the count, or auto-renewal, or nothing", () => {
    expect(remainingLabel({ remaining: 12, autoRenews: false } as any)).toBe("12 left");
    expect(remainingLabel({ remaining: 12, autoRenews: null } as any)).toBe("12 left");
    expect(remainingLabel({ remaining: null, autoRenews: true } as any)).toBe("Auto-renews");
    expect(remainingLabel({ remaining: null, autoRenews: false } as any)).toBeNull();
  });

  it("claims no auto-renewal Mindbody hasn't flagged, even with autopay running", () => {
    const pkg = resolvePackage(
      baseClient({
        remainingSessions: undefined as unknown as number,
        mindbodyContracts: {
          "77": { clientContractId: 77, contractName: "12-Month Autopay", status: "Active", autopayStatus: "Active", startDate: "2026-01-01T00:00:00Z" },
        },
      }),
    );
    expect(pkg).toMatchObject({ source: "mindbody-contract", remaining: null, autoRenews: null });
    expect(remainingLabel(pkg)).toBeNull();
  });
});
