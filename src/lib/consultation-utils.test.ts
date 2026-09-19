import { describe, expect, it } from "vitest";
import {
  ACADEMY_STARTING_WEIGHT,
  MACHINE_DICTIONARY,
  calculateStartingWeight,
  statedStartingWeight,
  type Gender,
  type SkillLevel,
} from "./consultation-utils";

/**
 * Accuracy pins against the MSF Academy corpus in docs/msf-academy/.
 *
 * These four tests used to pin a SECOND calculateStartingWeight in
 * data/machine-database.ts that nothing in the app called, while the function
 * every screen does call (this one) had no ceiling at all. They were moved
 * here, onto the live function, in the beta-prep trim (Sep 17 2026) - same
 * rule, same document, the numbers of the heuristic trainers actually see.
 */
describe("calculateStartingWeight respects a stated Academy load", () => {
  const NECK = "CX (4 way neck)";
  const genders: Gender[] = ["Male", "Female"];
  const skills: SkillLevel[] = ["Novice", "Intermediate", "Advanced"];

  // "Most clients will start with 20 pounds, the lightest increment available
  // on this exercise." - Comprehensive Equipment Overview / Cervical Extension
  it("is 20 lb on the Cervical Extension, at any age or level - never more, and never less than the machine can be set to", () => {
    expect(MACHINE_DICTIONARY[NECK]).toBeDefined();
    expect(ACADEMY_STARTING_WEIGHT[NECK]).toEqual({ ceiling: 20, floor: 20 });
    for (const gender of genders) {
      for (const age of [25, 35, 50, 70]) {
        for (const skill of skills) {
          expect(calculateStartingWeight(NECK, gender, age, skill)).toBe(20);
        }
      }
    }
  });

  it("REGRESSION: a young male was given 28 lb as a novice and 46 lb as advanced", () => {
    // 30 base * 1.2 young * 0.8 novice = 28.8 -> 28; * 1.3 advanced = 46.8 -> 46.
    // The tracker seeds a first-time machine as a Novice; the wizards pass the
    // real level. Both now stop at the Academy's 20.
    expect(calculateStartingWeight(NECK, "Male", 35, "Novice")).toBe(20);
    expect(calculateStartingWeight(NECK, "Male", 35, "Advanced")).toBe(20);
  });

  it("leaves machines with no stated load to the heuristic", () => {
    // 100 base * 1.2 young * 0.8 novice = 96
    expect(calculateStartingWeight("Leg Press", "Male", 35, "Novice")).toBe(96);
    // 60 base * 0.8 over-60 * 1.3 advanced = 62.4 -> 62
    expect(calculateStartingWeight("Leg Press", "Female", 70, "Advanced")).toBe(62);
  });

  it("still returns 0 for a machine it does not know", () => {
    expect(calculateStartingWeight("not-a-machine", "Male", 35, "Novice")).toBe(0);
  });

  it("finds the stated load whatever the casing of the machine's name", () => {
    // data/default-machines.ts names it in capitals; the rule must still apply.
    expect(statedStartingWeight("CX (4 WAY NECK)")).toEqual({ ceiling: 20, floor: 20 });
    expect(statedStartingWeight("  cx (4 way neck) ")).toEqual({ ceiling: 20, floor: 20 });
    expect(statedStartingWeight("Leg Press")).toBeUndefined();
  });

  it("KNOWN, left as found: the heuristic's own lookup is exact, so a standard machine's UPPERCASE name gets 0", () => {
    // This is why the tracker's first-time seed has never suggested a weight.
    // If you make the lookup case-insensitive you are turning those
    // suggestions ON for every machine - decide that on purpose, and keep the
    // ceiling test above green.
    expect(calculateStartingWeight("LEG PRESS", "Male", 35, "Novice")).toBe(0);
    expect(calculateStartingWeight("CX (4 WAY NECK)", "Male", 35, "Advanced")).toBe(0);
  });
});
