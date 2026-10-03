import { describe, expect, it } from "vitest";
import type { RenewalSnapshot } from "../renewals/types";
import { headerContractWords, headerDay, headerRenewalWords } from "./header-renewal";

const snap = (over: Partial<RenewalSnapshot>): RenewalSnapshot =>
  ({ version: 2, paymentMode: "monthly", chargeDate: "2026-11-14", chargeDateSource: "mindbody", autoRenews: true, renewalOnBooks: null, ...over }) as RenewalSnapshot;

describe("the header's renewal words (Oct 2 2026)", () => {
  it("says Renews on only for a contract that renews", () => {
    expect(headerRenewalWords(snap({}))).toBe("Renews on Nov 14, 2026");
    expect(headerRenewalWords(snap({ autoRenews: false }))).toBe("Billing ends Nov 14, 2026");
    expect(headerRenewalWords(snap({ autoRenews: null }))).toBe("Payments finish Nov 14, 2026");
    expect(headerRenewalWords(snap({ chargeDateSource: "estimate" }))).toBe("Renews on Nov 14, 2026 (est.)");
  });

  it("says when a package already signed starts", () => {
    expect(headerRenewalWords(snap({ renewalOnBooks: { cycleKey: "c", packageKey: null, startsOn: "2026-12-01" } }))).toBe(
      "Renewed · next starts Dec 1, 2026",
    );
  });

  it("says nothing for paid in full, banked sessions, no snapshot or no date", () => {
    expect(headerRenewalWords(snap({ paymentMode: "prepaid" }))).toBeNull();
    expect(headerRenewalWords(snap({ paymentMode: "sessions-only" }))).toBeNull();
    expect(headerRenewalWords(snap({ chargeDate: null }))).toBeNull();
    expect(headerRenewalWords(null)).toBeNull();
    expect(headerDay("2026-13-01")).toBeNull();
  });
});

describe("the header's renewal words before the nightly snapshot", () => {
  const billing = (over: Record<string, unknown> = {}) => ({
    mindbodyContracts: {
      "77": { status: "Active", autopayStatus: "Active", endDate: "2027-08-16", ...over },
      "76": { status: "Active", autopayStatus: "Inactive", endDate: "2026-03-17" },
    },
  });

  it("reads the billing contract's end, and says Renews on only when Mindbody or a trainer says so", () => {
    expect(headerContractWords(billing() as never, "2026-10-02")).toBe("Contract ends Aug 16, 2027");
    expect(headerContractWords(billing({ isAutoRenewing: true }) as never, "2026-10-02")).toBe("Renews on Aug 16, 2027");
    expect(headerContractWords(billing({ isAutoRenewing: false }) as never, "2026-10-02")).toBe("Billing ends Aug 16, 2027");
    expect(
      headerContractWords({ ...billing(), autoRenewMark: { renews: true, contractId: "77" } } as never, "2026-10-02"),
    ).toBe("Renews on Aug 16, 2027");
  });

  it("says nothing with no contract billing, or one already over", () => {
    expect(headerContractWords({ mindbodyContracts: {} } as never, "2026-10-02")).toBeNull();
    expect(headerContractWords(billing() as never, "2027-09-01")).toBeNull();
  });
});
