import { describe, expect, it } from "vitest";
import {
  normalise,
  queryWords,
  scoreEntry,
  searchLearning,
  type LearningSearchEntry,
} from "./search";

const machine = (
  id: string,
  title: string,
  code: string,
  keywords: string[] = [],
): LearningSearchEntry => ({
  ref: { kind: "machine", id },
  group: "catalog",
  title,
  code,
  meta: "Horizontal Push",
  keywords,
});

const ENTRIES: LearningSearchEntry[] = [
  machine("m-chest-press", "Chest Press", "CP", ["Pectoralis Major", "Upper Body — Push"]),
  machine("m-compound-row", "Compound Row", "CR", ["Latissimus Dorsi", "Upper Body — Pull"]),
  machine("m-leg-curl", "Leg Curl", "LC", ["Hamstrings", "Lower Body"]),
  machine("m-leg-press", "Leg Press", "LP", ["Gluteus Maximus", "Quadriceps", "Lower Body"]),
  machine("m-hip-abd", "Hip Abduction", "ABD", ["Gluteus Medius", "Hips"]),
  {
    ref: { kind: "academy-topic", id: "intro-glossary", moduleId: "intro" },
    group: "topics",
    title: "Glossary of terms",
    meta: "Introduction",
  },
  {
    ref: { kind: "academy-glossary", id: "Turnaround" },
    group: "glossary",
    title: "Turnaround",
    meta: "Definition",
  },
  {
    ref: { kind: "studio-page", id: "p1", studioId: "solon" },
    group: "studio",
    title: "How we press at Solon",
    meta: "How we coach",
  },
];

describe("normalise / queryWords", () => {
  it("folds case, accents and punctuation", () => {
    expect(normalise("  Trunk / Spine — Core ")).toBe("trunk spine core");
    expect(normalise("Pâté")).toBe("pate");
    expect(queryWords("  leg   CURL ")).toEqual(["leg", "curl"]);
    expect(queryWords("   ")).toEqual([]);
  });
});

describe("scoreEntry", () => {
  const cp = ENTRIES[0];
  it("ranks an exact catalog code first", () => {
    expect(scoreEntry(cp, ["cp"])).toBe(100);
    expect(scoreEntry(cp, ["chest", "press"])).toBe(90);
    expect(scoreEntry(cp, ["chest"])).toBe(80);
    expect(scoreEntry(cp, ["pre"])).toBe(60);
    expect(scoreEntry(cp, ["pectoralis"])).toBe(10);
  });

  it("needs every word to match somewhere", () => {
    expect(scoreEntry(ENTRIES[2], ["leg", "curl"])).toBeGreaterThan(0);
    expect(scoreEntry(ENTRIES[3], ["leg", "curl"])).toBe(0);
    expect(scoreEntry(cp, [])).toBe(0);
  });
});

describe("searchLearning", () => {
  it("returns nothing for an empty query", () => {
    expect(searchLearning(ENTRIES, "  ")).toEqual([]);
  });

  it("finds machines by muscle, not just by name", () => {
    const res = searchLearning(ENTRIES, "glute");
    expect(res.map((r) => r.group)).toEqual(["catalog"]);
    expect(res[0].hits.map((h) => h.title)).toEqual(["Leg Press", "Hip Abduction"]);
  });

  it("puts groups in a fixed order: machines, studio pages, then the Academy", () => {
    const res = searchLearning(ENTRIES, "press");
    expect(res.map((r) => r.group)).toEqual(["catalog", "studio"]);
    // Title matches rank above the rest; ties keep the studio's order.
    expect(res[0].hits.map((h) => h.title)).toEqual(["Chest Press", "Leg Press"]);
  });

  it("finds a glossary term and the topic that defines terms", () => {
    const res = searchLearning(ENTRIES, "glossary");
    expect(res.map((r) => r.group)).toEqual(["topics"]);
    const turn = searchLearning(ENTRIES, "turnaround");
    expect(turn[0].hits[0].ref).toEqual({ kind: "academy-glossary", id: "Turnaround" });
  });

  it("caps each group and says how many more matched", () => {
    const many: LearningSearchEntry[] = Array.from({ length: 20 }, (_, i) => ({
      ref: { kind: "academy-topic", id: `t${i}`, moduleId: "m" },
      group: "topics",
      title: `Topic ${i}`,
    }));
    const res = searchLearning(many, "topic", 5);
    expect(res[0].hits).toHaveLength(5);
    expect(res[0].more).toBe(15);
  });
});
