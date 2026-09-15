import { describe, expect, it } from "vitest";
import {
  isRetirementTitle,
  nextPedigreeHistory,
  pedigreeTrail,
  workProfileOf,
  workSentence,
  WORK_PROFILES,
} from "./life";
import { OCCUPATIONS } from "../../data/occupational-matrix";

describe("workProfileOf", () => {
  it("a coach's pick wins", () => {
    expect(workProfileOf({ occupation: "Software Developer / IT", workProfile: "heavy" })?.id).toBe("heavy");
  });
  it("every non-retirement title on the old list lands in a category", () => {
    for (const o of OCCUPATIONS) {
      if (isRetirementTitle(o.title)) continue;
      expect(workProfileOf({ occupation: o.title }), o.title).not.toBeNull();
    }
  });
  it("reads free text by keyword, and admits when it can't", () => {
    expect(workProfileOf({ occupation: "Electrician" })?.id).toBe("heavy");
    expect(workProfileOf({ occupation: "Owner, landscaping company" })?.id).toBe("high-stress");
    expect(workProfileOf({ occupation: "Astronaut" })).toBeNull();
    expect(workProfileOf({ occupation: "" })).toBeNull();
  });
  it("category ids are unique", () => {
    expect(new Set(WORK_PROFILES.map((p) => p.id)).size).toBe(WORK_PROFILES.length);
  });
});

describe("workSentence", () => {
  it("keeps the previous work when retired", () => {
    expect(workSentence({ occupation: "Software Developer / IT", isRetired: true })).toBe(
      "Retired — was seated / desk (Software Developer / IT)",
    );
    expect(workSentence({ occupation: "Retired (Active Lifestyle)", isRetired: true })).toBe("Retired");
    expect(workSentence({ occupation: "Teacher / Educator" })).toBe("On their feet (Teacher / Educator)");
    expect(workSentence({})).toBe("Work not recorded yet");
  });
});

describe("nextPedigreeHistory", () => {
  const at = "2026-09-15T12:00:00.000Z";
  it("adds one dated step, seeding the old level as step one", () => {
    expect(nextPedigreeHistory([], "Novice", "Intermediate", at, "AJ")).toEqual([
      { level: "Novice", at: "" },
      { level: "Intermediate", at, byName: "AJ" },
    ]);
  });
  it("is built from the saved history, so a second change replaces the first", () => {
    const saved = [{ level: "Novice", at: "2026-01-01T00:00:00Z" }];
    const once = nextPedigreeHistory(saved, "Novice", "Intermediate", at);
    const twice = nextPedigreeHistory(saved, "Novice", "Advanced", at);
    expect(once).toHaveLength(2);
    expect(twice).toHaveLength(2);
    expect(twice[1].level).toBe("Advanced");
    expect(nextPedigreeHistory(saved, "Novice", "Novice", at)).toEqual(saved);
  });
  it("starts clean for a client with no level yet", () => {
    expect(nextPedigreeHistory(undefined, undefined, "Novice", at)).toEqual([{ level: "Novice", at }]);
  });
});

describe("pedigreeTrail", () => {
  it("needs two steps to be a trail", () => {
    expect(pedigreeTrail([{ level: "Novice", at: "" }])).toBeNull();
    expect(pedigreeTrail([{ level: "Novice", at: "" }, { level: "Intermediate", at: "2026-06-15T12:00:00Z" }])).toMatch(
      /^Novice → Intermediate \(Jun 2026\)$/,
    );
  });
});
