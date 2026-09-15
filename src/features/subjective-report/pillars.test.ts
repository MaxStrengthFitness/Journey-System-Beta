import { describe, expect, it } from "vitest";
import {
  ALL_ASSESSMENT_SECTION_IDS,
  ASSESSMENT_EXTRA_IDS,
  ASSESSMENT_PILLARS,
  NEUTRAL_HIGH,
  NEUTRAL_LOW,
  groupByPillar,
  pillarOf,
  sectionScale,
  sectionTitle,
} from "./pillars";
import { SUBJECTIVE_CATEGORIES } from "./questions";
import { SUBJECTIVE_CATEGORY_KEYS } from "./types";

describe("the three pillars", () => {
  it("are the audit's three, in its order", () => {
    expect(ASSESSMENT_PILLARS.map((p) => p.title)).toEqual([
      "Recovery & Fuel",
      "Physical & Functional",
      "Psychological & Behavioral",
    ]);
  });

  it("list each pillar's areas in the audit's order", () => {
    expect(ASSESSMENT_PILLARS.map((p) => p.sectionIds.map(sectionTitle))).toEqual([
      ["Sleep & Recovery", "Nutrition & Protein", "Protein compliance", "Hydration"],
      ["Energy & Daily Function", "Strength & Physical Confidence", "Pain & Mobility", "Pain map"],
      ["Mental & Emotional Impact", "Consistency & Habits", "Lifestyle Alignment", "Stress anchors"],
    ]);
  });

  it("place every category and every extra area in exactly one pillar", () => {
    const placed = ASSESSMENT_PILLARS.flatMap((p) => p.sectionIds);
    const expected = [...SUBJECTIVE_CATEGORY_KEYS, ...ASSESSMENT_EXTRA_IDS];
    // Exactly once each…
    for (const id of expected) {
      expect(placed.filter((x) => x === id), id).toHaveLength(1);
      expect(pillarOf(id), id).not.toBeNull();
    }
    // …and nothing else.
    expect([...placed].sort()).toEqual([...expected].sort());
    expect([...ALL_ASSESSMENT_SECTION_IDS].sort()).toEqual([...expected].sort());
  });

  it("still covers the whole question bank (no category can drop off screen)", () => {
    const placed = new Set(ASSESSMENT_PILLARS.flatMap((p) => p.sectionIds));
    for (const c of SUBJECTIVE_CATEGORIES) expect(placed.has(c.key), c.key).toBe(true);
    expect(SUBJECTIVE_CATEGORIES).toHaveLength(8);
  });

  it("groups a list by pillar and keeps anything unknown instead of dropping it", () => {
    const items = [...ALL_ASSESSMENT_SECTION_IDS, "mystery"].map((id) => ({ id }));
    const groups = groupByPillar(items);
    expect(groups.map((g) => g.pillar?.id ?? null)).toEqual([
      "recovery-fuel",
      "physical-functional",
      "psych-behavioral",
      null,
    ]);
    expect(groups[0].items.map((i) => i.id)).toEqual(ASSESSMENT_PILLARS[0].sectionIds);
    expect(groups[3].items).toEqual([{ id: "mystery" }]);
    expect(groups.flatMap((g) => g.items)).toHaveLength(items.length);
  });

  it("leaves a pillar empty (not missing) when a search filters its areas out", () => {
    const groups = groupByPillar([{ id: "hydration" }]);
    expect(groups).toHaveLength(3);
    expect(groups.map((g) => g.items.length)).toEqual([1, 0, 0]);
  });
});

describe("the scale ends", () => {
  it("use the bank's words for every area, so no area falls back to neutral wording", () => {
    for (const id of ALL_ASSESSMENT_SECTION_IDS) {
      const s = sectionScale(id);
      expect(s.fromBank, id).toBe(true);
      expect(s.low.length, id).toBeGreaterThan(0);
      expect(s.high.length, id).toBeGreaterThan(0);
    }
  });

  it("describe sleep the way the owner did: under 5 hours vs 7–9 hours", () => {
    const s = sectionScale("sleepRecovery");
    expect(s.low).toBe("Under 5 hours most nights, broken sleep, no routine");
    expect(s.high).toBe("7–9 hours most nights on a steady schedule");
    expect(s.max).toBe(12);
    expect(s.lowerIsBetter).toBe(false);
  });

  it("take protein and hydration ends from the document's days-a-week rule", () => {
    expect(sectionScale("protein").low).toContain("0–1 days a week");
    expect(sectionScale("protein").high).toContain("5–7 days a week");
    expect(sectionScale("hydration").max).toBe(7);
  });

  it("know that less pain and less stress is better", () => {
    expect(sectionScale("pain").lowerIsBetter).toBe(true);
    expect(sectionScale("stress").lowerIsBetter).toBe(true);
    expect(sectionScale("stress").high).toBe("Life feels crushing");
  });

  it("fall back to neutral words for an area with no anchor text", () => {
    const s = sectionScale("not-a-real-area");
    expect(s).toMatchObject({ low: NEUTRAL_LOW, high: NEUTRAL_HIGH, fromBank: false });
  });
});
