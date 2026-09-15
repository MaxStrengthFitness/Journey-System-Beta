import { describe, expect, it } from "vitest";
import { commonFlags, flagsByCategory, searchFlags, selectedFlags, COMMON_CATEGORY } from "./flag-search";
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
