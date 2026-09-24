import { describe, expect, it } from "vitest";
import {
  OCCUPATION_SUGGESTIONS,
  activitySentence,
  isRetiredClient,
  isRetirementTitle,
  nextPedigreeHistory,
  recreationSentence,
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

describe("isRetiredClient", () => {
  it("reads the toggle, or an old occupation that was really a retirement status", () => {
    expect(isRetiredClient({ isRetired: true, occupation: "Teacher / Educator" })).toBe(true);
    expect(isRetiredClient({ occupation: "Retired (Active Lifestyle)" })).toBe(true);
    expect(isRetiredClient({ isRetired: false, occupation: "Teacher / Educator" })).toBe(false);
    expect(isRetiredClient({})).toBe(false);
    expect(isRetiredClient(null)).toBe(false);
  });
});

describe("activitySentence and recreationSentence", () => {
  it("says the level and what it means", () => {
    expect(activitySentence("Moderate")).toBe("Moderate · An active hobby a few times a week");
    expect(activitySentence("Manual Labor")).toBe("Physical job · Their work is the workout");
    expect(activitySentence("")).toBeNull();
    expect(activitySentence(undefined)).toBeNull();
  });

  it("keeps what they do exactly as typed", () => {
    expect(recreationSentence({ activityLevel: "Moderate", recreationActivities: ["Pickleball", "Walking", "Gardening"] })).toBe(
      "Moderate · Pickleball, Walking, Gardening",
    );
    expect(recreationSentence({ recreationActivities: ["tai chi", "Pickleball"] })).toBe("tai chi, Pickleball");
    expect(recreationSentence({ activityLevel: "High" })).toBe("High");
    expect(recreationSentence({})).toBe("Not recorded yet");
    expect(recreationSentence({ recreationActivities: ["  "] })).toBe("Not recorded yet");
  });
});

describe("OCCUPATION_SUGGESTIONS", () => {
  it("offers every old title but the two that were a retirement status", () => {
    expect(OCCUPATION_SUGGESTIONS).toContain("Teacher / Educator");
    expect(OCCUPATION_SUGGESTIONS.some((t) => t.startsWith("Retired ("))).toBe(false);
    expect(OCCUPATION_SUGGESTIONS).toHaveLength(OCCUPATIONS.length - 2);
  });
});
