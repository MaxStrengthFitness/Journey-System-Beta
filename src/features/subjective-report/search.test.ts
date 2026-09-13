import { describe, expect, it } from "vitest";
import { matchingSections, sectionMatches } from "./search";
import { SUBJECTIVE_CATEGORY_KEYS } from "./types";

const ALL = [...SUBJECTIVE_CATEGORY_KEYS, "protein", "hydration", "pain", "stress"];

describe("check-in search", () => {
  it("finds every area a word touches", () => {
    expect(matchingSections(ALL, "sleep")).toEqual(["sleepRecovery"]);
    expect(matchingSections(ALL, "meals")).toEqual(["nutritionProtein", "protein"]);
    expect(matchingSections(ALL, "knee")).toEqual(["pain"]);
    expect(matchingSections(ALL, "water")).toEqual(["hydration"]);
  });
  it("is forgiving about case and punctuation, and empty means everything", () => {
    expect(sectionMatches("sleepRecovery", "  SLEEP! ")).toBe(true);
    expect(matchingSections(ALL, "")).toEqual(ALL);
    expect(matchingSections(ALL, "zzzz")).toEqual([]);
  });
});
