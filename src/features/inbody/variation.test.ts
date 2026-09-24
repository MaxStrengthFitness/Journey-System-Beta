import { describe, it, expect } from "vitest";
import {
  DEFAULT_INBODY_VARIATION,
  VARIATION_KEYS,
  callChange,
  checkVariationForm,
  hasOwnVariation,
  inbodyVariationOf,
  isCalledChange,
  isDefaultVariation,
  normalizeInBodyVariation,
  thresholdFor,
  variationForClient,
  variationForStudio,
  variationRangeText,
  variationStudioIdOf,
  variationToForm,
  variationWrite,
} from "./variation";

const V = DEFAULT_INBODY_VARIATION;

describe("the defaults (AJ, Sep 24 2026)", () => {
  it("are 3.5 lb muscle, 5.3 lb fat mass and 2.7 points of body fat, and nothing for weight", () => {
    expect(V).toEqual({ skeletalMuscleMassLb: 3.5, bodyFatMassLb: 5.3, percentBodyFat: 2.7 });
    expect(VARIATION_KEYS).not.toContain("weightLb");
    expect(Object.isFrozen(V)).toBe(true);
  });
});

describe("reading what a studio stored", () => {
  it("gives the defaults for a studio that never set any", () => {
    expect(normalizeInBodyVariation(undefined)).toEqual(V);
    expect(normalizeInBodyVariation(null)).toEqual(V);
    expect(inbodyVariationOf(null)).toEqual(V);
    expect(inbodyVariationOf({ id: "s1" })).toEqual(V);
  });

  it("keeps each number it can trust and defaults the rest, field by field", () => {
    expect(normalizeInBodyVariation({ skeletalMuscleMassLb: 2 })).toEqual({ ...V, skeletalMuscleMassLb: 2 });
    expect(normalizeInBodyVariation({ skeletalMuscleMassLb: 2.04, percentBodyFat: 1.96 })).toEqual({
      ...V,
      skeletalMuscleMassLb: 2,
      percentBodyFat: 2,
    });
  });

  it("never trusts a nonsense value: out of range, negative, text or NaN reads as the default", () => {
    for (const bad of [-1, 0, 0.4, 99, "3", Number.NaN, Number.POSITIVE_INFINITY, null, {}]) {
      expect(normalizeInBodyVariation({ skeletalMuscleMassLb: bad }).skeletalMuscleMassLb).toBe(3.5);
    }
    // Each measure has its own limits: 12 lb of fat mass is allowed, 12 lb of muscle is not.
    expect(normalizeInBodyVariation({ bodyFatMassLb: 12, skeletalMuscleMassLb: 12 })).toEqual({ ...V, bodyFatMassLb: 12 });
    expect(normalizeInBodyVariation({ percentBodyFat: 7 }).percentBodyFat).toBe(2.7);
  });

  it("knows whether the studio has numbers of its own", () => {
    expect(hasOwnVariation({ inbodyVariation: { skeletalMuscleMassLb: 2, updatedBy: "u" } })).toBe(true);
    expect(hasOwnVariation({ inbodyVariation: { skeletalMuscleMassLb: 99 } })).toBe(false);
    expect(hasOwnVariation({ inbodyVariation: null })).toBe(false);
    expect(hasOwnVariation(null)).toBe(false);
  });

  it("finds a studio's numbers by id, and the defaults for a studio it cannot see", () => {
    const studios = [
      { id: "solon", inbodyVariation: { skeletalMuscleMassLb: 2 } },
      { id: "westlake" },
    ];
    expect(variationForStudio(studios, "solon").skeletalMuscleMassLb).toBe(2);
    expect(variationForStudio(studios, "westlake")).toEqual(V);
    expect(variationForStudio(studios, "nowhere")).toEqual(V);
    expect(variationForStudio(studios, null)).toEqual(V);
    expect(variationForStudio(undefined, "solon")).toEqual(V);
  });

  it("reads a client against their home studio, then the older studioId", () => {
    expect(variationStudioIdOf({ homeStudioId: "solon", studioId: "westlake" })).toBe("solon");
    expect(variationStudioIdOf({ homeStudioId: "", studioId: "westlake" })).toBe("westlake");
    expect(variationStudioIdOf({})).toBeNull();
    expect(variationStudioIdOf(null)).toBeNull();
  });

  it("gives a client their home studio's numbers, whichever studio the screen is in", () => {
    // Westlake's iPad (or its pipeline) opening a Solon client, and a
    // Westlake client, out of the same studios: each reads their OWN home's.
    const studios = [
      { id: "solon", inbodyVariation: { skeletalMuscleMassLb: 2 } },
      { id: "westlake", inbodyVariation: { skeletalMuscleMassLb: 5 } },
    ];
    expect(variationForClient(studios, { homeStudioId: "solon" }).skeletalMuscleMassLb).toBe(2);
    expect(variationForClient(studios, { homeStudioId: "westlake" }).skeletalMuscleMassLb).toBe(5);
    // The older studioId when there is no home studio.
    expect(variationForClient(studios, { homeStudioId: null, studioId: "solon" }).skeletalMuscleMassLb).toBe(2);
    // No studio named, a studio the app cannot see, or no studios yet: the defaults.
    expect(variationForClient(studios, {})).toEqual(V);
    expect(variationForClient(studios, null)).toEqual(V);
    expect(variationForClient(studios, { homeStudioId: "nowhere" })).toEqual(V);
    expect(variationForClient(undefined, { homeStudioId: "solon" })).toEqual(V);
  });
});

describe("calling a change", () => {
  it("calls a change equal to the variation, and not one a hair under it", () => {
    expect(callChange("skeletalMuscleMassLb", 3.49, V)).toBe("within");
    expect(callChange("skeletalMuscleMassLb", 3.5, V)).toBe("up");
    expect(callChange("skeletalMuscleMassLb", -3.5, V)).toBe("down");
    expect(callChange("percentBodyFat", -2.6, V)).toBe("within");
    expect(callChange("percentBodyFat", -2.7, V)).toBe("down");
    expect(callChange("bodyFatMassLb", 5.2, V)).toBe("within");
    expect(callChange("bodyFatMassLb", 5.3, V)).toBe("up");
  });

  it("is not fooled by floating point: a change that IS the variation is called", () => {
    // 33.4 − 30.7 is 2.6999999999999993, and 58.9 − 53.6 is 5.299999999999997.
    expect(callChange("percentBodyFat", 30.7 - 33.4, V)).toBe("down");
    expect(callChange("bodyFatMassLb", 53.6 - 58.9, V)).toBe("down");
  });

  it("says 'none' with nothing to judge, and 'within' for no change at all", () => {
    expect(callChange("skeletalMuscleMassLb", null, V)).toBe("none");
    expect(callChange("skeletalMuscleMassLb", undefined, V)).toBe("none");
    expect(callChange("skeletalMuscleMassLb", Number.NaN, V)).toBe("none");
    expect(callChange("skeletalMuscleMassLb", 0, V)).toBe("within");
  });

  it("gives weight and the other measures no variation, so their change is never hidden", () => {
    expect(thresholdFor("weightLb", V)).toBeNull();
    expect(thresholdFor("phaseAngle", V)).toBeNull();
    expect(callChange("weightLb", 20, V)).toBe("up");
    expect(callChange("weightLb", -0.2, V)).toBe("down");
    expect(isCalledChange("weightLb", 0, V)).toBe(false);
  });

  it("follows the studio's own numbers", () => {
    const tight = normalizeInBodyVariation({ skeletalMuscleMassLb: 1 });
    expect(isCalledChange("skeletalMuscleMassLb", 1.2, V)).toBe(false);
    expect(isCalledChange("skeletalMuscleMassLb", 1.2, tight)).toBe(true);
    expect(thresholdFor("skeletalMuscleMassLb", tight)).toBe(1);
  });
});

describe("the My Studio form", () => {
  it("starts from the numbers in force", () => {
    expect(variationToForm(V)).toEqual({ skeletalMuscleMassLb: "3.5", bodyFatMassLb: "5.3", percentBodyFat: "2.7" });
  });

  it("accepts numbers inside the limits, rounded to one decimal", () => {
    const check = checkVariationForm({ skeletalMuscleMassLb: " 2.04 ", bodyFatMassLb: "4", percentBodyFat: "2.25" });
    expect(check.problems).toEqual({});
    expect(check.value).toEqual({ skeletalMuscleMassLb: 2, bodyFatMassLb: 4, percentBodyFat: 2.3 });
  });

  it("says why a number can't be saved, and saves nothing", () => {
    const check = checkVariationForm({ skeletalMuscleMassLb: "12", bodyFatMassLb: "", percentBodyFat: "two" });
    expect(check.value).toBeNull();
    expect(check.problems).toEqual({
      skeletalMuscleMassLb: "Between 0.5 and 10 lb",
      bodyFatMassLb: "Enter a number",
      percentBodyFat: "Enter a number",
    });
    expect(variationRangeText("percentBodyFat")).toBe("Between 0.5 and 6 points");
    expect(checkVariationForm({ ...variationToForm(V), bodyFatMassLb: "0.2" }).problems).toEqual({
      bodyFatMassLb: "Between 0.5 and 15 lb",
    });
  });

  it("writes the whole map with who saved it, the Auth uid", () => {
    const own = { ...V, skeletalMuscleMassLb: 2 };
    expect(variationWrite(own, "uid-lead", { now: "NOW", remove: "DELETE" })).toEqual({
      inbodyVariation: {
        skeletalMuscleMassLb: 2,
        bodyFatMassLb: 5.3,
        percentBodyFat: 2.7,
        updatedBy: "uid-lead",
        updatedAt: "NOW",
      },
    });
  });

  it("removes the field when every number is back on the defaults, so the studio follows them", () => {
    expect(isDefaultVariation(V)).toBe(true);
    expect(isDefaultVariation({ ...V, percentBodyFat: 2.6 })).toBe(false);
    expect(variationWrite({ ...V }, "uid-lead", { now: "NOW", remove: "DELETE" })).toEqual({ inbodyVariation: "DELETE" });
  });

  it("never writes undefined (Firestore refuses it)", () => {
    const write = variationWrite({ ...V, bodyFatMassLb: 4 }, "uid-lead", { now: "NOW", remove: "DELETE" });
    const map = write.inbodyVariation as Record<string, unknown>;
    expect(Object.keys(map).sort()).toEqual(
      ["bodyFatMassLb", "percentBodyFat", "skeletalMuscleMassLb", "updatedAt", "updatedBy"].sort(),
    );
    expect(Object.values(map).every((v) => v !== undefined)).toBe(true);
  });
});
