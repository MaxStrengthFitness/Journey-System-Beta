import { describe, expect, it } from "vitest";
import {
  buildContractHistory,
  crossStudioClearance,
  parseTierFromName,
  resolveContractTier,
  sessionsOnHand,
  tierLabel,
} from "./contract";

const ts = (iso: string) => ({ toDate: () => new Date(iso) });

describe("parseTierFromName", () => {
  it("reads the studio's real Mindbody names", () => {
    expect(parseTierFromName("144 PIF")).toEqual({ term: 18, payment: "pif" });
    expect(parseTierFromName("48 Sessions - 2X Week")).toEqual({ term: 6, payment: "monthly" });
    expect(parseTierFromName("96 Sessions - 2x week")).toEqual({ term: 12, payment: "monthly" });
  });
  it("reads months and month-to-month", () => {
    expect(parseTierFromName("12 Month Committed")).toEqual({ term: 12, payment: null });
    expect(parseTierFromName("Month to Month")).toEqual({ term: null, payment: "month-to-month" });
    expect(parseTierFromName("18-mo Paid in Full")).toEqual({ term: 18, payment: "pif" });
  });
  it("says nothing about names that say nothing", () => {
    expect(parseTierFromName("Session Comp")).toBeNull();
    expect(parseTierFromName("")).toBeNull();
    expect(parseTierFromName(undefined)).toBeNull();
    // 480 is not 48
    expect(parseTierFromName("480 dollar credit")).toBeNull();
  });
});

describe("tierLabel", () => {
  it("names the package and how it is paid", () => {
    expect(tierLabel(12, "pif")).toBe("Committed · 12 months · paid in full");
    expect(tierLabel(6, "monthly")).toBe("The Trial · 6 months · paying every 4 weeks");
    expect(tierLabel(null, "month-to-month")).toBe("Month-to-month");
    expect(tierLabel(null, null)).toBe("Not known yet");
  });
});

describe("resolveContractTier", () => {
  it("a coach's lock always wins, and says who", () => {
    const t = resolveContractTier({
      contractTierOverride: { term: 18, payment: "pif", setAt: "2026-09-15T12:00:00Z", setByName: "AJ", note: "prepaid at the desk" },
      renewal: { packageLabel: "Committed · 12 months", paymentMode: "monthly" } as never,
    });
    expect(t).toMatchObject({ term: 18, payment: "pif", source: "override" });
    expect(t.evidence).toBe("Locked by AJ — “prepaid at the desk”");
  });

  it("then the renewal engine's match", () => {
    const t = resolveContractTier({ renewal: { packageLabel: "Committed · 12 months", paymentMode: "prepaid" } as never });
    expect(t).toMatchObject({ term: 12, payment: "pif", source: "renewal" });
  });

  it("then the contract name, then pricing options", () => {
    expect(
      resolveContractTier({
        mindbodyContracts: { a: { clientContractId: "a", status: "Active", contractName: "96 Sessions - 2X Week" } },
      }),
    ).toMatchObject({ term: 12, payment: "monthly", source: "parsed" });
    expect(
      resolveContractTier({
        mindbodyServices: {
          x: { serviceId: "x", name: "Session Comp", activeDate: ts("2026-09-01T00:00:00Z") },
          y: { serviceId: "y", name: "144 PIF", activeDate: ts("2026-01-01T00:00:00Z") },
        },
      }),
    ).toMatchObject({ term: 18, payment: "pif", source: "parsed" });
  });

  it("is honest when nothing says", () => {
    expect(resolveContractTier({})).toMatchObject({ source: "unknown", label: "Not known yet" });
    expect(resolveContractTier(null).source).toBe("unknown");
  });
});

describe("buildContractHistory", () => {
  const now = new Date("2026-09-15T12:00:00Z");
  const client = {
    mindbodyContracts: {
      old: { clientContractId: "old", status: "Active" as const, contractName: "48 Sessions - 2X Week", startDate: ts("2025-01-10T00:00:00Z"), endDate: ts("2025-06-30T00:00:00Z") },
      cur: { clientContractId: "cur", status: "Active" as const, contractName: "96 Sessions - 2X Week", startDate: ts("2025-07-01T00:00:00Z"), endDate: ts("2026-06-01T00:00:00Z"), autopayStatus: "Active", originationLocationId: 98 },
      nxt: { clientContractId: "nxt", status: "Active" as const, contractName: "96 Sessions - 2X Week", startDate: ts("2026-10-01T00:00:00Z") },
      gone: { clientContractId: "gone", status: "Cancelled" as const, contractName: "Month to Month", startDate: ts("2024-01-01T00:00:00Z") },
    },
    mindbodyServices: {
      p1: { serviceId: "p1", name: "8 sessions", remaining: 3, count: 8 },
      p2: { serviceId: "p2", name: "144 PIF", remaining: 0, count: 144, activeDate: ts("2023-01-01T00:00:00Z") },
    },
  };

  it("lists terms upcoming, active, ended, cancelled — newest first within each", () => {
    const rows = buildContractHistory(client, now);
    expect(rows.map((r) => `${r.key}:${r.status}`)).toEqual([
      "c-nxt:upcoming",
      "c-cur:ended",
      "c-old:ended",
      "s-p2:ended",
      "c-gone:cancelled",
    ]);
    expect(rows[0]).toMatchObject({ key: "c-nxt", status: "upcoming" });
    expect(rows.find((r) => r.key === "c-cur")).toMatchObject({ autoRenews: true, boughtOnline: true, tier: { term: 12 } });
    expect(rows.find((r) => r.key === "s-p2")).toMatchObject({ kind: "paid-in-full", sessions: { count: 144, remaining: 0 } });
    expect(rows.some((r) => r.key === "s-p1")).toBe(false);
    expect(rows[rows.length - 1].status).toBe("cancelled");
  });

  it("orders ended terms by start, newest first", () => {
    const ended = buildContractHistory(client, now).filter((r) => r.status === "ended").map((r) => r.key);
    expect(ended).toEqual(["c-cur", "c-old", "s-p2"]);
  });
});

describe("sessionsOnHand / crossStudioClearance", () => {
  it("lists pricing options that still hold sessions", () => {
    expect(
      sessionsOnHand({
        mindbodyServices: {
          a: { serviceId: "a", name: "Session Comp", remaining: 2, count: 2 },
          b: { serviceId: "b", name: "96 PIF", remaining: 40, count: 96 },
          c: { serviceId: "c", name: "old", remaining: 0 },
        },
      }).map((s) => s.name),
    ).toEqual(["96 PIF", "Session Comp"]);
  });

  it("clears a visiting client only where a leader approved it", () => {
    const c = { homeStudioId: "solon", approvedCrossTrainStudioIds: ["westlake"] };
    expect(crossStudioClearance(c, "solon")).toBe("home");
    expect(crossStudioClearance(c, "westlake")).toBe("approved");
    expect(crossStudioClearance(c, "willoughby")).toBe("not-approved");
    expect(crossStudioClearance(c, null)).toBeNull();
  });
});
