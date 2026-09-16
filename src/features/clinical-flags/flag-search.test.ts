import { describe, expect, it } from "vitest";
import { commonFlags, conditionDetail, flagsByCategory, searchFlags, selectedFlags, COMMON_CATEGORY, TONE_BADGE, TONE_ORDER } from "./flag-search";
import { CLINICAL_FLAGS_MATRIX } from "../../data/clinical-matrix";

describe("the matrix", () => {
  it("has unique ids and a common-constraints group", () => {
    const ids = CLINICAL_FLAGS_MATRIX.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(commonFlags().length).toBeGreaterThanOrEqual(6);
    expect(commonFlags().every((f) => f.tone === "modify")).toBe(true);
  });
});

describe("searchFlags", () => {
  it("finds a condition by the words trainers use", () => {
    expect(searchFlags("shoulder").map((f) => f.id)).toEqual(expect.arrayContaining(["gen-shoulder", "soft-rotator"]));
    expect(searchFlags("knee replacement")[0].id).toBe("joint-tka");
    expect(searchFlags("blood pressure").map((f) => f.id)).toEqual(expect.arrayContaining(["cv-hypertension", "gen-blood-pressure"]));
  });
  it("ranks a name match above an alias match", () => {
    const r = searchFlags("hip");
    expect(r[0].id).toBe("gen-hip");
  });
  it("returns nothing for nothing", () => {
    expect(searchFlags("   ")).toEqual([]);
    expect(searchFlags("zzzz")).toEqual([]);
  });
});

describe("flagsByCategory / selectedFlags", () => {
  it("puts common constraints first", () => {
    expect(flagsByCategory()[0].category).toBe(COMMON_CATEGORY);
  });
  it("sorts the selection most serious first and keeps unknown ids", () => {
    const s = selectedFlags(["gen-knee", "cv-hypertension", "legacy-id"]);
    expect(s[0].id).toBe("cv-hypertension");
    expect(s.map((f) => f.id)).toContain("legacy-id");
  });
});

describe("the browse list (Sep 16 redesign)", () => {
  it("lists every group most serious first", () => {
    for (const g of flagsByCategory()) {
      const ranks = g.flags.map((f) => TONE_ORDER[f.tone]);
      expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    }
    const cardio = flagsByCategory().find((g) => g.category.startsWith("Cardiovascular"))!;
    expect(cardio.flags[0].tone).toBe("alert");
  });
  it("keeps every flag once", () => {
    const n = flagsByCategory().reduce((sum, g) => sum + g.flags.length, 0);
    expect(n).toBe(CLINICAL_FLAGS_MATRIX.length);
  });
  it("keeps what the name drops as a detail line", () => {
    expect(conditionDetail("Spondylolisthesis (Grade 2 or higher)")).toBe("Grade 2 or higher");
    expect(conditionDetail("Glaucoma")).toBeNull();
    expect(conditionDetail("A (one) / B (two)")).toBe("one · two");
    const spondy = searchFlags("spondylolisthesis")[0];
    expect(spondy.name).toBe("Spondylolisthesis");
    expect(spondy.detail).toBe("Grade 2 or higher");
  });
  it("badges only the exceptions, with short words", () => {
    expect(TONE_BADGE.modify).toBeNull();
    expect(TONE_BADGE.alert!.short.length).toBeLessThanOrEqual(5);
    expect(TONE_BADGE.caution!.short.length).toBeLessThanOrEqual(5);
  });
});
