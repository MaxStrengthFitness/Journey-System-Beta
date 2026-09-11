import { describe, it, expect } from "vitest";
import {
  DEFAULT_PACKAGES,
  DEFAULT_RENEWAL_SETTINGS,
  buildPackageNameIndex,
  newPackageTier,
  normalizeMindbodyName,
  normalizeRenewalSettings,
  sessionsPerPayment,
  validateRenewalSettings,
} from "./settings";

describe("normalizeRenewalSettings", () => {
  it("gives a studio that never saved anything the defaults", () => {
    expect(normalizeRenewalSettings(undefined)).toEqual(DEFAULT_RENEWAL_SETTINGS);
    expect(normalizeRenewalSettings({})).toEqual(DEFAULT_RENEWAL_SETTINGS);
  });

  it("keeps what a studio saved and fills in the rest", () => {
    const s = normalizeRenewalSettings({ conversationAtSessionsLeft: 12, payAsYouGoCountsAs: "lost" });
    expect(s.conversationAtSessionsLeft).toBe(12);
    expect(s.payAsYouGoCountsAs).toBe("lost");
    expect(s.chargeWarnDays).toBe(30);
    expect(s.packages).toEqual(DEFAULT_PACKAGES);
  });

  it("replaces nonsense with the default rather than trusting it", () => {
    const s = normalizeRenewalSettings({
      conversationAtSessionsLeft: -3,
      chargeWarnDays: "30",
      breakDays: 2,
      horizonMonths: Number.NaN,
      pauseDuringAwayEvents: "yes",
    });
    expect(s.conversationAtSessionsLeft).toBe(10);
    expect(s.chargeWarnDays).toBe(30);
    expect(s.breakDays).toBe(14);
    expect(s.horizonMonths).toBe(3);
    expect(s.pauseDuringAwayEvents).toBe(true);
  });

  it("drops a package with no name or no sessions, and keeps the rest", () => {
    const s = normalizeRenewalSettings({
      packages: [
        { key: "committed", label: "Committed", months: 12, payments: 12, sessions: 96, ratePerSession: 60, paymentAmount: 480, prepayRatePerSession: 57, mindbodyNames: ["96 PIF"] },
        { label: "", sessions: 10 },
        { label: "Broken", sessions: 0 },
      ],
    });
    expect(s.packages.map((p) => p.key)).toEqual(["committed"]);
  });

  it("never leaves a studio with an empty package table", () => {
    expect(normalizeRenewalSettings({ packages: [] }).packages).toEqual(DEFAULT_PACKAGES);
  });

  it("keeps package keys unique", () => {
    const s = normalizeRenewalSettings({
      packages: [
        { key: "x", label: "A", sessions: 10, payments: 1, ratePerSession: 50 },
        { key: "x", label: "B", sessions: 20, payments: 2, ratePerSession: 50 },
      ],
    });
    expect(s.packages.map((p) => p.key)).toEqual(["x", "x-2"]);
  });

  it("works out a missing payment amount from the rate", () => {
    const s = normalizeRenewalSettings({
      packages: [{ key: "k", label: "K", sessions: 96, payments: 12, ratePerSession: 60 }],
    });
    expect(s.packages[0].paymentAmount).toBe(480);
    expect(s.packages[0].prepayRatePerSession).toBe(60);
  });

  it("an explicitly empty extra-sessions list stays empty", () => {
    expect(normalizeRenewalSettings({ extraSessionNames: [] }).extraSessionNames).toEqual([]);
  });
});

describe("Mindbody names", () => {
  it("ignores capitals, extra spaces and the kind of dash", () => {
    expect(normalizeMindbodyName("  48 sessions – 2x  WEEK ")).toBe(
      normalizeMindbodyName("48 Sessions - 2X Week"),
    );
  });

  it("matches the names on AJ's screenshots to the right packages", () => {
    const index = buildPackageNameIndex(DEFAULT_RENEWAL_SETTINGS);
    expect(index.tierFor("48 Sessions - 2X Week")?.key).toBe("trial");
    expect(index.tierFor("144 PIF")?.key).toBe("transformed");
    expect(index.isExtraSessions("Session Comp")).toBe(true);
  });

  it("does not match a name that merely contains a package's number", () => {
    const index = buildPackageNameIndex(DEFAULT_RENEWAL_SETTINGS);
    expect(index.tierFor("148 Sessions - 2X Week")).toBeNull();
    expect(index.tierFor("48 Sessions")).toBeNull();
    expect(index.tierFor(undefined)).toBeNull();
  });
});

describe("validateRenewalSettings", () => {
  it("is happy with the defaults", () => {
    expect(validateRenewalSettings(DEFAULT_RENEWAL_SETTINGS)).toEqual([]);
  });

  it("names a Mindbody name claimed by two packages", () => {
    const s = {
      ...DEFAULT_RENEWAL_SETTINGS,
      packages: [
        { ...DEFAULT_PACKAGES[0], mindbodyNames: ["Shared"] },
        { ...DEFAULT_PACKAGES[1], mindbodyNames: ["shared "] },
      ],
    };
    expect(validateRenewalSettings(s).join(" ")).toContain('"shared "');
  });

  it("asks for a price and a name on a new package", () => {
    const s = { ...DEFAULT_RENEWAL_SETTINGS, packages: [...DEFAULT_PACKAGES, newPackageTier(DEFAULT_PACKAGES)] };
    const problems = validateRenewalSettings(s).join(" ");
    expect(problems).toContain("needs a name");
    expect(problems).toContain("price per session");
  });

  it("refuses a threshold outside its range", () => {
    const s = { ...DEFAULT_RENEWAL_SETTINGS, breakDays: 3 };
    expect(validateRenewalSettings(s)[0]).toContain("between 7 and 90");
  });
});

describe("sessionsPerPayment", () => {
  it("is 8 on every default package", () => {
    expect(DEFAULT_PACKAGES.map(sessionsPerPayment)).toEqual([8, 8, 8]);
  });
});
