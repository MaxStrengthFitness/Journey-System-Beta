import { describe, expect, it } from "vitest";
import index from "./content/index.json";
import cards from "./content/cards.json";
import glossary from "./content/glossary.json";
import intro from "./content/intro.json";
import programming from "./content/programming.json";
import performance from "./content/performance.json";
import { MACHINE_ANATOMY } from "../../data/machine-anatomy-map";

/**
 * The generated content is committed, so it can drift from the corpus without
 * anything noticing. These hold the SHAPE the app relies on and the few facts
 * that would silently break a screen — not the prose, which is the studio's to
 * change.
 *
 * `useAcademyContent.ts` asserts the JSON into its types because TypeScript
 * widens a JSON import's string literals; this file is the other half of that
 * bargain.
 */

const BLOCK_KINDS = new Set(["heading", "subheading", "bullet", "body"]);

describe("the index", () => {
  it("carries every module the screen offers", () => {
    expect(index.modules.length).toBeGreaterThanOrEqual(10);
    for (const m of index.modules) {
      expect(m.id).toBeTruthy();
      expect(m.title).toBeTruthy();
      expect(m.blurb).toBeTruthy();
      expect(m.topics.length).toBeGreaterThan(0);
    }
  });

  it("has a unique id for every module and topic", () => {
    // Ids key React lists and the loader map; a duplicate would drop a topic.
    const moduleIds = index.modules.map((m) => m.id);
    expect(new Set(moduleIds).size).toBe(moduleIds.length);
    const topicIds = index.modules.flatMap((m) => m.topics.map((t) => t.id));
    expect(new Set(topicIds).size).toBe(topicIds.length);
  });

  it("gives every topic a reading time of at least a minute", () => {
    for (const m of index.modules) {
      for (const t of m.topics) {
        expect(t.readingMinutes).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it("is not empty — a failed build would produce a valid but useless file", () => {
    expect(index.totalWords).toBeGreaterThan(50_000);
  });
});

describe("module files match the index", () => {
  const pairs: [string, { topics: { id: string }[] }][] = [
    ["intro", intro],
    ["programming", programming],
    ["performance", performance],
  ];

  for (const [id, file] of pairs) {
    it(`${id} has the same topics the index promises`, () => {
      const fromIndex = index.modules.find((m) => m.id === id);
      expect(fromIndex).toBeDefined();
      expect(file.topics.map((t) => t.id).sort()).toEqual(
        fromIndex!.topics.map((t) => t.id).sort(),
      );
    });
  }

  it("only emits block kinds the renderer knows how to draw", () => {
    for (const t of [...intro.topics, ...programming.topics, ...performance.topics]) {
      for (const b of t.blocks) {
        expect(BLOCK_KINDS.has(b.kind)).toBe(true);
        expect(b.text.length).toBeGreaterThan(0);
      }
    }
  });

  it("REGRESSION: Exercise Performance is in teaching order, not alphabetical", () => {
    // "10 - Warm-up" sorts between 1 and 2 under a string sort.
    const titles = performance.topics.map((t) => t.title);
    expect(titles[0]).toContain("EIH");
    expect(titles[titles.length - 1]).toContain("Warm-up");
  });

  it("Programming carries BOTH halves of the split module", () => {
    // Parts 1-5 live under Academy/, parts 6-7 in a top-level folder with the
    // same name. Reading one directory silently loses the A/B routine rules.
    const titles = programming.topics.map((t) => t.title).join(" | ");
    expect(titles).toContain("Novice Level Trainees");
    expect(titles).toContain("AB Routines");
  });
});

describe("the per-machine cards", () => {
  it("has one for every machine the Academy documents", () => {
    expect(cards.cards.length).toBe(18);
  });

  it("maps every card to a machine the app actually knows", () => {
    // A card pointing at an id the anatomy map has never heard of would render
    // a dead link from the Catalog.
    for (const c of cards.cards) {
      expect(c.machineId).toBeTruthy();
      expect(MACHINE_ANATOMY[c.machineId as string]).toBeDefined();
    }
  });

  it("does not map two cards onto one machine", () => {
    const ids = cards.cards.map((c) => c.machineId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps the section skeleton the cards are written to", () => {
    const lp = cards.cards.find((c) => c.abbr === "LP");
    const headings = lp!.sections.map((s) => s.heading);
    expect(headings).toContain("Target Muscles");
    expect(headings).toContain("Considerations for Setup");
    expect(headings).toContain("Posture / Get Set");
  });

  it("did not swallow the setup detail into one blob", () => {
    const lp = cards.cards.find((c) => c.abbr === "LP");
    const setup = lp!.sections.find((s) => s.heading === "Considerations for Setup");
    expect(setup!.items.length).toBeGreaterThan(5);
  });

  it("points the neck card at the Cervical Extension", () => {
    // Cx is the Academy's abbreviation for Cervical Extension, and m-neck now
    // resolves to that record rather than the un-sourced 4-Way Neck one.
    expect(cards.cards.find((c) => c.abbr === "Cx")?.machineId).toBe("m-neck");
  });
});

describe("the glossary", () => {
  it("parsed a real number of terms", () => {
    expect(glossary.glossary.length).toBeGreaterThan(40);
  });

  it("split the term from the definition rather than keeping the line whole", () => {
    const concentric = glossary.glossary.find((e) => e.term === "Concentric");
    expect(concentric).toBeDefined();
    expect(concentric!.definition).toContain("lifting phase");
    expect(concentric!.definition).not.toContain("Concentric -");
  });

  it("has no term long enough to be a stray sentence", () => {
    for (const e of glossary.glossary) {
      expect(e.term.length).toBeLessThanOrEqual(60);
      expect(e.definition.length).toBeGreaterThan(0);
    }
  });
});
