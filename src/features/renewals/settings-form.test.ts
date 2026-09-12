import { describe, it, expect } from "vitest";
import { DEFAULT_RENEWAL_SETTINGS } from "./settings";
import {
  assignNameInForm,
  formToSettings,
  newPackageRow,
  parseNames,
  settingsPatchFromForm,
  settingsToForm,
} from "./settings-form";

describe("settings form", () => {
  it("round-trips the defaults with nothing to fix", () => {
    const { settings, problems } = formToSettings(settingsToForm(DEFAULT_RENEWAL_SETTINGS));
    expect(problems).toEqual([]);
    expect(settings).toEqual(DEFAULT_RENEWAL_SETTINGS);
  });

  it("reads one Mindbody name per line, ignoring blanks and repeats", () => {
    expect(parseNames("144 PIF\n\n  144   pif \r\n144 Sessions - 2X Week\n")).toEqual([
      "144 PIF",
      "144 Sessions - 2X Week",
    ]);
  });

  it("says what is wrong instead of saving a blank or a fraction", () => {
    const form = { ...settingsToForm(DEFAULT_RENEWAL_SETTINGS), breakDays: "", conversationAtSessionsLeft: "9.5" };
    const problems = formToSettings(form).problems.join(" ");
    expect(problems).toContain("A break is");
    expect(problems).toContain("whole number");
  });

  it("accepts a price typed with a dollar sign or a comma", () => {
    const form = settingsToForm(DEFAULT_RENEWAL_SETTINGS);
    form.packages[0] = { ...form.packages[0], paymentAmount: "$1,120" };
    expect(formToSettings(form).settings.packages[0].paymentAmount).toBe(1120);
  });

  it("sends the whole package table when one package changed", () => {
    const form = settingsToForm(DEFAULT_RENEWAL_SETTINGS);
    const edited = {
      ...form,
      packages: form.packages.map((r, i) => (i === 1 ? { ...r, ratePerSession: "58" } : r)),
    };
    const parsed = formToSettings(edited).settings;
    const patch = settingsPatchFromForm({ packages: edited.packages }, parsed);
    expect(Object.keys(patch)).toEqual(["packages"]);
    expect(patch.packages).toHaveLength(3);
    expect(patch.packages![1].ratePerSession).toBe(58);
  });

  it("maps text fields back to their settings names", () => {
    const form = { ...settingsToForm(DEFAULT_RENEWAL_SETTINGS), extraNamesText: "Session Comp\nBuddy Pass", pauseDuringAwayEvents: "no" as const };
    const parsed = formToSettings(form).settings;
    expect(settingsPatchFromForm({ extraNamesText: form.extraNamesText, pauseDuringAwayEvents: "no" }, parsed)).toEqual({
      extraSessionNames: ["Session Comp", "Buddy Pass"],
      pauseDuringAwayEvents: false,
    });
  });

  it("adds a seen name to a package once", () => {
    const form = settingsToForm(DEFAULT_RENEWAL_SETTINGS);
    const once = assignNameInForm(form, "Committed 12 Month EFT", "committed");
    const row = once.packages!.find((r) => r.key === "committed")!;
    expect(row.namesText.split("\n")).toContain("Committed 12 Month EFT");
    const twice = assignNameInForm({ ...form, packages: once.packages! }, "committed 12 month eft", "committed");
    expect(twice.packages!.find((r) => r.key === "committed")!.namesText).toBe(row.namesText);
  });

  it("can put a name on the extra-sessions list", () => {
    const form = settingsToForm(DEFAULT_RENEWAL_SETTINGS);
    expect(assignNameInForm(form, "Buddy Pass", "__extra__").extraNamesText).toBe("Session Comp\nBuddy Pass");
  });

  it("starts a new package with blank prices", () => {
    const row = newPackageRow(settingsToForm(DEFAULT_RENEWAL_SETTINGS));
    expect(row.ratePerSession).toBe("");
    expect(row.key).toBe("package-4");
  });
});
