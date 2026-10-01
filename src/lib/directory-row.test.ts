import { describe, expect, it } from "vitest";
import { directoryPackageRead } from "./directory-row";

describe("directoryPackageRead", () => {
  it("reads the contract from the renewal snapshot", () => {
    const r = directoryPackageRead({ renewal: { packageLabel: "12-Month", paymentMode: "prepaid", sessionsLeft: 38, nextBookingDate: "2026-09-16" } } as any, "2026-09-13");
    expect(r).toEqual({ membership: "12-Month · paid in full", membershipKnown: true, sessionsLeft: "38 left", sessionsLeftTone: "ok", nextSession: "Sep 16" });
  });
  it("says auto-renews for a monthly package with no count, and low near the end", () => {
    expect(directoryPackageRead({ renewal: { packageLabel: "6-Month", paymentMode: "monthly", autoRenews: true, sessionsLeft: null } } as any).sessionsLeft).toBe("Auto-renews");
    expect(directoryPackageRead({ renewal: { packageLabel: "6-Month", paymentMode: "prepaid", sessionsLeft: 2 } } as any).sessionsLeftTone).toBe("low");
  });
  it("says auto-renews only on her own contract's answer — Mindbody's or a trainer's mark — never on a default (Sep 25 2026)", () => {
    const read = (autoRenewsFrom?: string) =>
      directoryPackageRead({
        renewal: {
          packageLabel: "6-Month",
          paymentMode: "monthly",
          autoRenews: true,
          sessionsLeft: null,
          ...(autoRenewsFrom ? { autoRenewsFrom } : {}),
        },
      } as any).sessionsLeft;
    expect(read("mindbody")).toBe("Auto-renews");
    expect(read("client")).toBe("Auto-renews");
    // A version-1 snapshot: its flag was Mindbody's.
    expect(read()).toBe("Auto-renews");
    for (const from of ["studio", "package", "default"]) expect(read(from), from).toBe("Unknown");
  });
  it("is honest when there is no snapshot", () => {
    const r = directoryPackageRead({ packageTier: "None" } as any);
    expect(r.membership).toBe("No package on file");
    expect(r.sessionsLeft).toBe("Unknown");
    expect(r.nextSession).toBeNull();
    expect(directoryPackageRead({ packageTier: "12-Month" } as any).membership).toBe("12-Month");
  });
});
