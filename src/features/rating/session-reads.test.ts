import { describe, expect, it } from "vitest";
import { doseOf, effortOf, readinessDial, regionDial } from "./session-reads";

describe("session reads — the Dial with its legacy fallback", () => {
  it("effort: a tap, the untouched default told apart, and nothing before the rating existed", () => {
    expect(effortOf({ effort: 1 })).toEqual({ value: 1, defaulted: false });
    expect(effortOf({ effort: 0, effortDefaulted: true })).toEqual({ value: 0, defaulted: true });
    expect(effortOf({})).toBeNull();
    expect(effortOf(null)).toBeNull();
    // The legacy dose is a different question and is never read as effort.
    expect(effortOf({ dose: 2 } as any)).toBeNull();
  });

  it("dose: the Dial wins, then the legacy feel, then null", () => {
    expect(doseOf({ dose: 1, clientFeel: "Wiped Out" })).toBe(1);
    expect(doseOf({ dose: 0 })).toBe(0);
    expect(doseOf({ clientFeel: "Wiped Out" })).toBe(-2);
    expect(doseOf({ clientFeel: "Energized" })).toBe(1);
    expect(doseOf({})).toBeNull();
    expect(doseOf(null)).toBeNull();
  });

  it("readiness: the Dial wins, then the legacy words; recovery has no legacy", () => {
    expect(readinessDial({ readiness: { sleep: 2 }, sleepQuality: "poor" }, "sleep")).toBe(2);
    expect(readinessDial({ sleepQuality: "poor" }, "sleep")).toBe(-1);
    expect(readinessDial({ stressLevel: 5 }, "stress")).toBe(-2);
    expect(readinessDial({ energyLevel: "high" }, "energy")).toBe(1);
    expect(readinessDial({ energyLevel: "high" }, "recovery")).toBeNull();
    // An explicit centre tap is a stored 0 and must not fall through to legacy.
    expect(readinessDial({ readiness: { sleep: 0 }, sleepQuality: "poor" }, "sleep")).toBe(0);
    expect(readinessDial(undefined, "sleep")).toBeNull();
  });

  it("regions: the Dial, else the two-state word", () => {
    expect(regionDial({ dial: -2, state: "prime" })).toBe(-2);
    expect(regionDial({ state: "stiff" })).toBe(-1);
    expect(regionDial({ state: "prime" })).toBe(1);
  });
});
