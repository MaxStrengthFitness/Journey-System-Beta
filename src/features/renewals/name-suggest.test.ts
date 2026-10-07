import { describe, it, expect } from "vitest";
import { suggestName, suggestionTarget, suggestionWords, waitingLine, waitingNames } from "./name-suggest";
import { assignNameInForm, formToSettings, nameWontFitInForm, settingsToForm } from "./settings-form";
import { buildPackageNameIndex, DEFAULT_RENEWAL_SETTINGS, normalizeRenewalSettings } from "./settings";
import type { RenewalNamesSeen } from "./types";

const settings = DEFAULT_RENEWAL_SETTINGS;
const key = (name: string, kind?: "contract" | "pricing-option") => {
  const s = suggestName(name, settings, kind);
  return s === null ? null : s.kind === "extra" ? "extra" : s.packageKey;
};

describe("suggestName on Strongsville's real names (Oct 6 2026)", () => {
  it("reads sessions and months against the studio's own table", () => {
    expect(key("48 Sessions w/ Roll Over")).toBe("trial");
    expect(key("SV 6 Months/48 Sessions PIF")).toBe("trial");
    expect(key("SV 18 Months/144 Sessions PIF")).toBe("transformed");
    expect(key("144 Sessions w/ Roll Over")).toBe("transformed");
    expect(key("96 Sessions w/ Roll Over")).toBe("committed");
    expect(key("SV 12 Months/96 Sessions PIF")).toBe("committed");
    expect(key("SV 12 Month Committed EFT", "contract")).toBe("committed");
    expect(key("144 Prepay")).toBe("transformed");
    expect(key("144 PIF")).toBe("transformed");
  });

  it("notes paid in full and roll over", () => {
    expect(suggestName("SV 6 Months/48 Sessions PIF", settings)).toEqual({
      kind: "package", packageKey: "trial", label: "The Trial", paidInFull: true, rollOver: false,
    });
    const roll = suggestName("144 Sessions w/ Roll Over", settings)!;
    expect(suggestionWords(roll)).toBe("Life Transformed · sessions roll over");
    expect(suggestionWords(suggestName("SV 18 Months/144 Sessions Paid in Full", settings)!)).toBe("Life Transformed · paid in full");
  });

  it("reads complimentary and won sessions as extra sessions, on a pricing option only", () => {
    expect(key("Session Comp")).toBe("extra");
    expect(key("SV Session Comp")).toBe("extra");
    expect(key("Complimentary Session")).toBe("extra");
    expect(key("Contest Winner - 2 Free Sessions")).toBe("extra");
    expect(key("Referral Bonus Session")).toBe("extra");
    expect(key("Session Comp", "contract")).toBeNull();
    expect(suggestionTarget(suggestName("Session Comp", settings)!)).toBe("__extra__");
  });

  it("never files a package that mentions its bonus as extra sessions", () => {
    // A prepay comes with two free workouts: the name may say so.
    expect(key("SV 18 Months/144 Sessions PIF + 2 Free")).toBeNull();
    expect(key("48 Sessions PIF w/ Bonus")).toBeNull();
    expect(key("Comp 6 Month")).toBeNull();
  });

  it("reads a hyphen between the number and its word", () => {
    expect(key("SV 6-Month/48-Session PIF")).toBe("trial");
  });

  it("suggests nothing when unsure", () => {
    expect(key("Free Intro Session")).toBeNull();
    expect(key("Single Session")).toBeNull();
    expect(key("Consultation")).toBeNull();
    expect(key("Month to Month Unlimited")).toBeNull();
    expect(key("8 Sessions")).toBeNull(); // one payment's worth is no package
    expect(key("SV 12 Months/48 Sessions")).toBeNull(); // the two disagree
    expect(key("48 Sessions / 96 Sessions")).toBeNull();
    expect(key("Personal Training")).toBeNull();
    expect(key("")).toBeNull();
  });

  it("follows a studio's own table, and says nothing when two packages fit", () => {
    const twoTwelves = normalizeRenewalSettings({
      packages: [
        ...DEFAULT_RENEWAL_SETTINGS.packages,
        { label: "Committed Once a Week", months: 12, payments: 12, sessions: 48, ratePerSession: 60 },
      ],
    });
    expect(suggestName("SV 12 Months", twoTwelves)).toBeNull();
    expect(suggestName("48 Sessions", twoTwelves)).toBeNull();
    expect((suggestName("SV 12 Months/48 Sessions", twoTwelves) as any).label).toBe("Committed Once a Week");
  });
});

describe("waitingNames", () => {
  const seen: RenewalNamesSeen = {
    names: {
      a: { name: "48 Sessions - 2X Week", kind: "pricing-option", clients: 30 }, // already matched
      b: { name: "48 Sessions w/ Roll Over", kind: "pricing-option", clients: 41 },
      c: { name: "SV 18 Months/144 Sessions PIF", kind: "pricing-option", clients: 12 },
      d: { name: "Single Session", kind: "pricing-option", clients: 3 },
      e: { name: "Session Comp", kind: "pricing-option", clients: 9 }, // already an extra
      f: { name: "SV 12 Month Committed EFT", kind: "contract", clients: 12 },
    },
  };
  it("lists the unmatched names, most clients first, each with its suggestion", () => {
    const w = waitingNames(seen, settings);
    expect(w.map((x) => [x.name, x.suggestion ? suggestionTarget(x.suggestion) : null])).toEqual([
      ["48 Sessions w/ Roll Over", "trial"],
      ["SV 12 Month Committed EFT", "committed"],
      ["SV 18 Months/144 Sessions PIF", "transformed"],
      ["Single Session", null],
    ]);
    expect(waitingLine(w)).toBe("4 names waiting");
    expect(waitingLine([])).toBeNull();
    expect(waitingNames(null, settings)).toEqual([]);
  });
});

describe("confirming suggestions in the settings form (the panel's path)", () => {
  it("adds each confirmed name to its package or the extras, and the engine then reads it", () => {
    let form = settingsToForm(settings);
    for (const name of ["48 Sessions w/ Roll Over", "SV 18 Months/144 Sessions PIF", "SV Session Comp"]) {
      form = { ...form, ...assignNameInForm(form, name, suggestionTarget(suggestName(name, settings)!)) };
    }
    const saved = formToSettings(form).settings;
    // And they survive the cleaning every read does.
    const index = buildPackageNameIndex(normalizeRenewalSettings(saved));
    expect(index.tierFor("48 sessions w/ roll over")?.key).toBe("trial");
    expect(index.tierFor("SV 18 Months/144 Sessions PIF")?.key).toBe("transformed");
    expect(index.isExtraSessions("SV Session Comp")).toBe(true);
    // The original settings are untouched.
    expect(settings.packages[0].mindbodyNames).not.toContain("48 Sessions w/ Roll Over");
  });

  it("knows when a list is full, so a name is never dropped silently on save", () => {
    const full = settingsToForm({ ...settings, extraSessionNames: Array.from({ length: 40 }, (_, i) => `Comp ${i}`) });
    expect(nameWontFitInForm(full, "Won Session", "__extra__")).toBe(true);
    // Already there: adding it changes nothing, so it "fits".
    expect(nameWontFitInForm(full, "Comp 3", "__extra__")).toBe(false);
    expect(nameWontFitInForm(full, "48 Sessions w/ Roll Over", "trial")).toBe(false);
    expect(nameWontFitInForm(full, "Old", "gone")).toBe(true);
  });
});
