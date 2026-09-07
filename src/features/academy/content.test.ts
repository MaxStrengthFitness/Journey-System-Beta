import { describe, expect, it } from "vitest";
import index from "./content/index.json";
import cards from "./content/cards.json";
import cues from "./content/cues.json";
import scripts from "./content/scripts.json";
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

describe("the cue phrasebook", () => {
  it("found the real moments, not one blob", () => {
    expect(cues.cues.length).toBeGreaterThanOrEqual(10);
  });

  it("carries a usable number of phrases to say", () => {
    const phrases = cues.cues.reduce((n, m) => n + m.phrases.length, 0);
    expect(phrases).toBeGreaterThan(80);
  });

  it("REGRESSION: a cue is not promoted to a moment heading", () => {
    // "Slow and controlled" is the same shape as "Speed of Motion". If shape
    // decided, it would become an empty section instead of a phrase.
    const speed = cues.cues.find((m) => m.moment.startsWith("Speed of Motion"));
    expect(speed).toBeDefined();
    expect(speed!.phrases).toContain("Slow and controlled");
  });

  it("keeps the long headings that carry a list of machines", () => {
    const lower = cues.cues.filter((m) => m.moment.startsWith("Lower Turnaround"));
    expect(lower.length).toBeGreaterThanOrEqual(2);
  });

  it("has no moment with nothing under it", () => {
    for (const m of cues.cues) {
      expect(m.phrases.length + m.notes.length).toBeGreaterThan(0);
    }
  });
});

describe("the per-machine scripts", () => {
  it("covers all twenty machines across the three workouts", () => {
    expect(scripts.scripts.length).toBe(20);
    expect(new Set(scripts.scripts.map((s) => s.workout)).size).toBe(3);
  });

  it("maps every script to a machine the app knows", () => {
    for (const s of scripts.scripts) {
      expect(s.machineId).toBeTruthy();
      expect(MACHINE_ANATOMY[s.machineId as string]).toBeDefined();
    }
  });

  it("covers the two machines that have NO quick reference card", () => {
    // 19 comprehensive overviews, 18 cards. For the Lateral Raise and the
    // Triceps Extension the script is the app's only spoken instruction.
    const carded = new Set(cards.cards.map((c) => c.machineId));
    const scripted = new Set(scripts.scripts.map((s) => s.machineId));
    expect(carded.has("m-lateral-raise")).toBe(false);
    expect(scripted.has("m-lateral-raise")).toBe(true);
    expect(carded.has("m-tricep-ext")).toBe(false);
    expect(scripted.has("m-tricep-ext")).toBe(true);
  });

  it("kept each machine whole rather than splitting it at a page break", () => {
    const ids = scripts.scripts.map((s) => s.machineId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("separates spoken lines from instructor actions", () => {
    const lp = scripts.scripts.find((s) => s.abbr === "LP")!;
    const all = lp.beats.flatMap((b) => b.lines);
    expect(all.some((l) => l.spoken)).toBe(true);
    expect(all.some((l) => !l.spoken)).toBe(true);
  });

  it("keeps the beats the scripts are written in", () => {
    const lp = scripts.scripts.find((s) => s.abbr === "LP")!;
    const beats = lp.beats.map((b) => b.beat).join(" | ");
    expect(beats).toContain("SETUP");
    expect(beats).toContain("UPPER TURN");
  });

  it("strips the quote marks once a line is marked spoken", () => {
    for (const s of scripts.scripts) {
      for (const b of s.beats) {
        for (const l of b.lines) {
          expect(l.text.startsWith("\u201C")).toBe(false);
        }
      }
    }
  });
});

describe("the modules added in the second pass", () => {
  it("carries the consultation, further reading and summaries", () => {
    const ids = index.modules.map((m) => m.id);
    expect(ids).toContain("consultation");
    expect(ids).toContain("further");
    expect(ids).toContain("summary");
  });

  it("REGRESSION: Further Reading has the largest document in the corpus", () => {
    // MSF Fundamentals of High Intensity Exercise, 6,386 words. It sits loose
    // at the root of Academy/ and the first build walked past it.
    const further = index.modules.find((m) => m.id === "further")!;
    const titles = further.topics.map((t) => t.title).join(" | ");
    expect(titles).toContain("Fundamentals of High Intensity Exercise");
  });

  it("lists the modules in teaching order", () => {
    const ns = index.modules.map((m) => m.n);
    expect(ns).toEqual([...ns].sort((a, b) => a - b));
  });
});
