import { describe, expect, it } from "vitest";
import { MACHINE_DATABASE, calculateStartingWeight } from "./machine-database";
import { CANONICAL_TO_DB_KEY } from "../features/catalog/machine-identity";

/**
 * Accuracy pins against the MSF Academy corpus in docs/msf-academy/.
 *
 * Round: Academy alignment, Sep 2026. Each test cites the document it holds
 * the app to, so a future edit that drifts from the source fails here rather
 * than reaching a trainer standing at the machine.
 */
describe("the neck machine resolves to the documented exercise", () => {
  const key = CANONICAL_TO_DB_KEY["m-neck"];

  it("is the Cervical Extension record", () => {
    expect(key).toBe("cervical_extension");
  });

  it("requires a hand-off, which the 4-Way Neck record denied", () => {
    // "The Cervical Extension requires an interpersonal transfer of weight
    // (i.e. handoff)" — Comprehensive Equipment Overview / Cervical Extension
    expect(MACHINE_DATABASE[key].requiresHandoff).toBe(true);
    expect(MACHINE_DATABASE["4_way_neck"].requiresHandoff).toBe(false);
  });

  it("carries the never-to-failure rule", () => {
    const text = JSON.stringify(MACHINE_DATABASE[key]).toLowerCase();
    expect(text).toContain("never");
    expect(text).toContain("failure");
  });
});

describe("calculateStartingWeight respects a stated Academy load", () => {
  // "Most clients will start with 20 pounds, the lightest increment available
  // on this exercise." — Comprehensive Equipment Overview / Cervical Extension
  it("never exceeds 20 lb on the Cervical Extension, at any age or level", () => {
    for (const gender of ["Male", "Female"]) {
      for (const age of [25, 35, 50, 70]) {
        for (const skill of ["Novice", "Intermediate", "Advanced"]) {
          const w = calculateStartingWeight("cervical_extension", gender, age, skill);
          expect(w).toBeLessThanOrEqual(20);
        }
      }
    }
  });

  it("REGRESSION: a young male novice used to be given 36 lb", () => {
    expect(calculateStartingWeight("cervical_extension", "Male", 35, "Novice")).toBe(20);
  });

  it("leaves machines with no stated load to the heuristic", () => {
    // 160 base * 1.2 young * 1.0 novice = 192
    expect(calculateStartingWeight("leg_press", "Male", 35, "Novice")).toBe(192);
  });

  it("still returns 0 for a machine it does not know", () => {
    expect(calculateStartingWeight("not-a-machine", "Male", 35, "Novice")).toBe(0);
  });
});

describe("warnings the Academy states are actually present", () => {
  const has = (id: string, needle: string) =>
    JSON.stringify(MACHINE_DATABASE[id]).toLowerCase().includes(needle.toLowerCase());

  it("Leg Curl explains WHY the patella must not sit under the roller", () => {
    // The app carried the rule and truncated the reason mid-sentence.
    expect(has("leg_curl", "hyperextension")).toBe(true);
  });

  it("Lumbar Extension warns that the seat can be too LOW, not only too high", () => {
    // "If the back pad is near or making contact with the cervical spine, the
    // seat is too low." Only the too-high half was carried.
    expect(has("lumbar_extension", "too low")).toBe(true);
  });

  it("Lumbar Extension names the neck risk in the head-throw", () => {
    expect(has("lumbar_extension", "risk to the neck")).toBe(true);
  });

  it("Lateral Raise carries its impingement contraindication", () => {
    // The entry was a stub with no clinicalWarnings at all.
    expect(MACHINE_DATABASE.lateral_raise.clinicalWarnings?.length ?? 0).toBeGreaterThan(0);
    expect(has("lateral_raise", "impingement")).toBe(true);
  });

  it("Lateral Raise says posterior pelvic tilt, as both sources do", () => {
    expect(MACHINE_DATABASE.lateral_raise.executionPosture).toContain("Posterior");
  });
});

describe("numbers that are not in the corpus are not presented as doctrine", () => {
  it("the Lumbar Extension no longer shows an invented gap", () => {
    // "Gap 4-6" appears nowhere in docs/msf-academy/. The Comprehensive
    // Overview deliberately declines to give a number.
    expect(MACHINE_DATABASE.lumbar_extension.setupGap).not.toMatch(/\d\s*-\s*\d/);
  });
});
