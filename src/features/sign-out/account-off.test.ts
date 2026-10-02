import { describe, expect, it } from "vitest";
import { isSwitchedOff, switchOffConsequences, switchOffPatch, switchedOffWhat } from "./account-off";

describe("a former trainer's account, switched off (Oct 2 2026)", () => {
  it("is switched off only when the record says so; absent means on", () => {
    expect(isSwitchedOff({ isActive: false })).toBe(true);
    expect(isSwitchedOff({ isActive: true })).toBe(false);
    expect(isSwitchedOff({})).toBe(false);
    expect(isSwitchedOff(null)).toBe(false);
  });

  it("writes the flag, who and when, and nothing that would lose their name", () => {
    expect(switchOffPatch({ uid: "uid-admin", name: "  Head Office  " }, "2026-10-02T15:00:00.000Z")).toEqual({
      isActive: false,
      switchedOffAt: "2026-10-02T15:00:00.000Z",
      switchedOffBy: { uid: "uid-admin", name: "Head Office" },
    });
  });

  it("says what happens, and records it in a sentence", () => {
    expect(switchOffConsequences("Dana Ortiz")[0]).toBe("Dana Ortiz is signed out and can't open Journey again, on any iPad.");
    expect(switchedOffWhat("Dana Ortiz", true)).toContain("Switched Dana Ortiz's account off");
    expect(switchedOffWhat("Dana Ortiz", false)).toBe("Switched Dana Ortiz's account back on.");
  });
});
