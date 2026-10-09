import { describe, expect, it } from "vitest";
import { notSetWords, setupButtonOf } from "./setup-button";

/* The Now Bar's settings button (the open session round, Oct 9 2026; AJ's
   "2a"): "Set up · 2 not set" on a first time, the settings themselves once
   set, and never a count off a settings read that hasn't answered. */

const FLY = { name: "Chest Fly", settings: { G: "1" }, settingLabels: { G: "Gap" } };

describe("setupButtonOf", () => {
  it("says Set up and how many are not set on a first time, even with the machine's own gap on the rail", () => {
    const b = setupButtonOf({ ...FLY, dialsNotSet: 2, firstSetup: true });
    expect(b).toMatchObject({ kind: "setup", notSet: 2, words: "Set up · 2 not set" });
    expect(b!.aria).toBe("Set up Chest Fly: 2 not set. Opens the machine card on the first one.");
  });

  it("says the settings themselves once set, each with its full name, in the rail's order", () => {
    const b = setupButtonOf({
      name: "Chest Fly",
      settings: { G: "1", S: "12", B: "3" },
      settingLabels: { G: "Gap", S: "Seat", B: "Back pad" },
      dialsNotSet: 0,
      firstSetup: false,
    });
    expect(b).toMatchObject({ kind: "settings", notSet: 0, words: "Gap 1 · Seat 12 · Back pad 3" });
    expect(b!.kind === "settings" && b!.pairs).toEqual([
      ["Gap", "1"],
      ["Seat", "12"],
      ["Back pad", "3"],
    ]);
  });

  it("adds what is still empty once the settings are known", () => {
    const b = setupButtonOf({ name: "Chest Fly", settings: { S: "12" }, settingLabels: { S: "Seat" }, dialsNotSet: 1, firstSetup: false });
    expect(b!.words).toBe("Seat 12 · 1 not set");
  });

  it("never counts off a settings read that hasn't answered: the rail's own words, or Settings", () => {
    expect(setupButtonOf({ ...FLY, dialsNotSet: 2 })).toMatchObject({ kind: "settings", words: "Gap 1", notSet: 0 });
    expect(setupButtonOf({ name: "Leg Press", dialsNotSet: 3 })).toMatchObject({ kind: "settings", words: "Settings", notSet: 0 });
  });

  it("is no button for a machine with no dials and nothing on file", () => {
    expect(setupButtonOf({ name: "Neck", dialsNotSet: 0, firstSetup: true })).toBeNull();
    expect(setupButtonOf({ name: "Neck" })).toBeNull();
  });

  it("says the machine's standard gap alone when nothing else is to fill", () => {
    expect(setupButtonOf({ ...FLY, dialsNotSet: 0, firstSetup: true })).toMatchObject({ kind: "settings", words: "Gap 1" });
  });

  it("says a count in few words", () => {
    expect(notSetWords(2)).toBe("2 not set");
  });
});
