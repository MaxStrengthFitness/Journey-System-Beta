import { describe, expect, it } from "vitest";
import {
  NO_FACTORS,
  ageFromBirthDate,
  factorsOf,
  formatInches,
  parseGender,
  parsePounds,
  parseWingspanInches,
} from "./factors";
import { DEFAULT_MATCH_SPEC, activeFactors, widest, withFactor } from "./match-spec";

const SEP_17 = new Date(2026, 8, 17, 12, 0, 0);

describe("reading a body off a client record", () => {
  it("parses what trainers actually type", () => {
    expect(parsePounds("148")).toBe(148);
    expect(parsePounds("148.6 lbs")).toBe(149);
    expect(parsePounds(212)).toBe(212);
    expect(parsePounds("1,200")).toBeNull(); // a typo, not a weight
    expect(parsePounds("")).toBeNull();
    expect(parsePounds("heavy")).toBeNull();

    expect(parseGender("Female")).toBe("f");
    expect(parseGender(" m ")).toBe("m");
    expect(parseGender("Other")).toBeNull();
    expect(parseGender(undefined)).toBeNull();

    expect(parseWingspanInches("66")).toBe(66);
    expect(parseWingspanInches('5\'6"')).toBe(66);
    expect(parseWingspanInches("long")).toBeNull();
    expect(formatInches(66)).toBe("5'6\"");
  });

  it("works out age from the date parts, never from a UTC midnight", () => {
    expect(ageFromBirthDate("1960-05-04", SEP_17)).toBe(66);
    expect(ageFromBirthDate("1960-12-25", SEP_17)).toBe(65); // birthday still to come
    expect(ageFromBirthDate("1960-09-17T00:00:00", SEP_17)).toBe(66); // Mindbody's form, on the day
    expect(ageFromBirthDate("1960-09-18", SEP_17)).toBe(65);
    expect(ageFromBirthDate("05/04/1960", SEP_17)).toBeNull();
    expect(ageFromBirthDate("2030-01-01", SEP_17)).toBeNull();
  });

  it("unknown is null, never a default", () => {
    expect(factorsOf(null)).toEqual(NO_FACTORS);
    expect(factorsOf({ height: "", weight: "" }, SEP_17)).toEqual(NO_FACTORS);
  });

  it("prefers the measured InBody weight to the typed one, and reads body fat and muscle from the scan", () => {
    const f = factorsOf(
      {
        height: "5'7\"",
        wingspan: "68",
        weight: "150",
        gender: "Female",
        dateOfBirth: "1971-03-02",
        inbodySummary: { latest: { weightLb: 156.4, percentBodyFat: 31.2, skeletalMuscleMassLb: 52.1 } },
      },
      SEP_17,
    );
    expect(f).toEqual({
      heightIn: 67,
      gender: "f",
      wingspanIn: 68,
      weightLb: 156,
      ageYears: 55,
      bodyFatPct: 31.2,
      muscleLb: 52.1,
    });
  });

  it("falls back to the typed age when there is no date of birth", () => {
    expect(factorsOf({ age: 47 }, SEP_17).ageYears).toBe(47);
    expect(factorsOf({ age: 470 }, SEP_17).ageYears).toBeNull();
  });
});

describe("the match spec", () => {
  it("defaults to height alone: exact, then up to 3 inches", () => {
    expect(activeFactors(DEFAULT_MATCH_SPEC)).toEqual(["height"]);
    expect(widest(DEFAULT_MATCH_SPEC.numeric.height)).toBe(3);
    expect(DEFAULT_MATCH_SPEC.minClients).toBe(5);
  });

  it("edits one factor without touching the rest, and keeps the ladder bounded", () => {
    const spec = withFactor(DEFAULT_MATCH_SPEC, "wingspan", { on: true, maxSteps: 40 });
    expect(spec.numeric.wingspan).toMatchObject({ on: true, maxSteps: 6 });
    expect(spec.numeric.height).toEqual(DEFAULT_MATCH_SPEC.numeric.height);
    expect(DEFAULT_MATCH_SPEC.numeric.wingspan.on).toBe(false); // the default is not mutated
    expect(activeFactors({ ...spec, gender: true })).toEqual(["height", "wingspan", "gender"]);
  });
});
