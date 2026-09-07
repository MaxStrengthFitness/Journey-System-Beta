import { describe, expect, it } from "vitest";
import {
  MAX_HEADING_CHARS,
  classify,
  countWords,
  looksHardWrapped,
  normalise,
  orderFromFilename,
  parseDoc,
  parseGlossary,
  parseQuickReference,
  titleFromFilename,
  unwrap,
} from "./parse";

describe("normalise", () => {
  it("strips the CRLF every file in the corpus uses", () => {
    expect(normalise("a\r\nb")).toBe("a\nb");
    expect(normalise("a\rb")).toBe("a\nb");
  });

  it("collapses the double space after a full stop", () => {
    // A .docx legacy that shows as a visible gap on a narrow screen.
    expect(normalise("Done.  Next.")).toBe("Done. Next.");
  });

  it("leaves a single space alone", () => {
    expect(normalise("Done. Next.")).toBe("Done. Next.");
  });

  it("replaces a non-breaking space, which does not wrap", () => {
    expect(normalise("a b")).toBe("a b");
  });
});

describe("looksHardWrapped", () => {
  it("detects the one folder converted at 80 columns", () => {
    const wrapped = Array.from({ length: 12 }, () => "x".repeat(78));
    expect(looksHardWrapped(wrapped)).toBe(true);
  });

  it("does not touch the normal one-paragraph-per-line files", () => {
    const prose = Array.from({ length: 12 }, () => "x".repeat(600));
    expect(looksHardWrapped(prose)).toBe(false);
  });

  it("refuses to guess from a handful of lines", () => {
    expect(looksHardWrapped(["x".repeat(78), "x".repeat(78)])).toBe(false);
  });
});

describe("unwrap", () => {
  it("rejoins a sentence split across lines", () => {
    expect(
      unwrap(["When working with clients who have chronic pain", "attributable to overuse, ask first."]),
    ).toEqual(["When working with clients who have chronic pain attributable to overuse, ask first."]);
  });

  it("starts a new paragraph after a full stop", () => {
    expect(unwrap(["One sentence ends here.", "another begins"])).toEqual([
      "One sentence ends here.",
      "another begins",
    ]);
  });

  it("does not swallow a heading into the paragraph above", () => {
    // A capitalised line is a new block even when the line above did not end
    // in punctuation — otherwise every section title joins its predecessor.
    expect(unwrap(["a trailing clause with no stop", "Considerations for Setup"])).toEqual([
      "a trailing clause with no stop",
      "Considerations for Setup",
    ]);
  });

  it("keeps a bullet on its own line", () => {
    expect(unwrap(["intro with no stop", " • first item"])).toEqual([
      "intro with no stop",
      "• first item",
    ]);
  });
});

describe("classify", () => {
  it("reads a bullet from its glyph", () => {
    expect(classify(" • Quadriceps – Knee Extension", 5)).toBe("bullet");
    expect(classify("● something", 5)).toBe("bullet");
  });

  it("treats an ALL-CAPS line as a section break", () => {
    expect(classify("LOAD UP:", 5)).toBe("heading");
    expect(classify("POSTURE", 5)).toBe("heading");
  });

  it("treats a short unpunctuated line as a subheading", () => {
    expect(classify("Considerations for Setup", 5)).toBe("subheading");
  });

  it("REGRESSION: fails toward body, never toward heading", () => {
    // A paragraph wrongly shown as a heading is loud and obviously broken; a
    // heading shown as body is merely plain. Every ambiguous case goes to body.
    expect(classify("x".repeat(MAX_HEADING_CHARS + 1), 5)).toBe("body");
    expect(classify("This is a sentence.", 5)).toBe("body");
    expect(classify("A short clause,", 5)).toBe("body");
    expect(classify("we do not ever let the weight rest at the top of it", 5)).toBe("body");
  });

  it("does not mistake a short sentence for a heading", () => {
    expect(classify("Ultimately we are looking for a smooth change.", 5)).toBe("body");
  });
});

describe("parseDoc", () => {
  const essay = [
    "Exercise Performance",
    "Turnaround Technique (Change of Direction)",
    "Proper turnaround performance varies depending on the characteristics of the start and endpoints of an exercise and whether stops are used.",
    "LOWER TURNAROUND",
    "Reduce speed as the weight approaches the start point during the negative enough to ensure a minimized impact on the joint.",
  ].join("\r\n");

  it("reads the module label and the title off the first two lines", () => {
    const doc = parseDoc(essay, "fallback");
    expect(doc.moduleLabel).toBe("Exercise Performance");
    expect(doc.title).toBe("Turnaround Technique (Change of Direction)");
  });

  it("does not count the title lines as body", () => {
    const doc = parseDoc(essay, "fallback");
    expect(doc.blocks).toHaveLength(3);
    expect(doc.blocks[0].kind).toBe("body");
    expect(doc.blocks[1].kind).toBe("heading");
  });

  it("estimates a reading time, never below a minute", () => {
    expect(parseDoc(essay, "f").readingMinutes).toBe(1);
    const long = ["Title", "Sub", Array.from({ length: 1000 }, () => "word").join(" ")].join("\n");
    expect(parseDoc(long, "f").readingMinutes).toBe(5);
  });

  it("treats a single opening line as the title with no module", () => {
    const doc = parseDoc("Just A Title\nSome body text that goes on for a while here.", "f");
    expect(doc.moduleLabel).toBeUndefined();
    expect(doc.title).toBe("Just A Title");
  });

  it("drops page markers left by the conversion", () => {
    const doc = parseDoc("Module\nTitle\npg 1 of 2\nReal body content that is long enough to be prose.", "f");
    expect(doc.blocks.map((b) => b.text)).not.toContain("pg 1 of 2");
  });

  it("survives an empty file rather than throwing", () => {
    const doc = parseDoc("   \n\n  ", "Fallback Title");
    expect(doc.title).toBe("Fallback Title");
    expect(doc.blocks).toEqual([]);
  });
});

describe("parseQuickReference", () => {
  const card = [
    "LP – Quick Reference Guide",
    "This is an abbreviated version of the understanding required of a MSF Exercise Practitioner.",
    "Target Muscles",
    " • Quadriceps – Knee Extension",
    " • Gluteus Maximus – Hip Extension",
    "Synergists",
    " • Hamstrings",
    "Considerations for Setup",
    " • Determine seat back position: default to P2 for most.",
  ].join("\r\n");

  it("keeps the card's own skeleton", () => {
    const qrg = parseQuickReference(card, "f");
    expect(qrg.title).toBe("LP – Quick Reference Guide");
    expect(qrg.sections.map((s) => s.heading)).toEqual([
      "About this card",
      "Target Muscles",
      "Synergists",
      "Considerations for Setup",
    ]);
  });

  it("puts the items under their own heading", () => {
    const qrg = parseQuickReference(card, "f");
    const targets = qrg.sections.find((s) => s.heading === "Target Muscles");
    expect(targets?.items).toEqual([
      "Quadriceps – Knee Extension",
      "Gluteus Maximus – Hip Extension",
    ]);
  });

  it("does not drop the preamble that sits before any heading", () => {
    const qrg = parseQuickReference(card, "f");
    expect(qrg.sections[0].items[0]).toContain("abbreviated version");
  });
});

describe("parseGlossary", () => {
  it("splits a term from its definition", () => {
    const entries = parseGlossary(
      "Concentric - the positive or lifting phase of a repetition.",
    );
    expect(entries).toEqual([
      { term: "Concentric", definition: "the positive or lifting phase of a repetition." },
    ]);
  });

  it("splits on the FIRST separator, not the last", () => {
    // Definitions are full of their own dashes.
    const [e] = parseGlossary(
      "Eccentric - the negative phase - during which the muscle lengthens.",
    );
    expect(e.term).toBe("Eccentric");
    expect(e.definition).toBe("the negative phase - during which the muscle lengthens.");
  });

  it("handles the en dash the corpus actually uses", () => {
    const [e] = parseGlossary("Turnaround – the change of direction.");
    expect(e.term).toBe("Turnaround");
  });

  it("skips a line that is not an entry", () => {
    expect(
      parseGlossary("This is an introductory paragraph with no term structure at all"),
    ).toEqual([]);
  });

  it("does not treat a long lead-in as a term", () => {
    const long = `${"x".repeat(80)} - a definition`;
    expect(parseGlossary(long)).toEqual([]);
  });
});

describe("titleFromFilename", () => {
  it("drops the Academy prefix and the module repetition", () => {
    expect(
      titleFromFilename("Academy - Exercise Performance 6 - Turnaround Technique.txt"),
    ).toBe("Turnaround Technique");
  });

  it("corrects the filename typos rather than showing them", () => {
    expect(
      titleFromFilename("Academy - Benefits of Restistance Training 1 - Why Resistance Training_.txt"),
    ).toBe("Why Resistance Training");
    expect(titleFromFilename("Exercise Substitues.txt")).toBe("Exercise Substitutes");
  });

  it("leaves a plain filename alone", () => {
    expect(titleFromFilename("Research.txt")).toBe("Research");
  });
});

describe("orderFromFilename", () => {
  it("REGRESSION: 10 sorts after 2, not between 1 and 2", () => {
    const names = [
      "Academy - Exercise Performance 10 - Warm-up Considerations.txt",
      "Academy - Exercise Performance 2 - Components of a Repetition.txt",
      "Academy - Exercise Performance 1 - EIH.txt",
    ];
    expect([...names].sort((a, b) => orderFromFilename(a) - orderFromFilename(b))).toEqual([
      names[2],
      names[1],
      names[0],
    ]);
  });

  it("finds the number even when the module name is misspelled", () => {
    expect(
      orderFromFilename("Academy - Benefits of Restistance Training 1 - Why Resistance Training_.txt"),
    ).toBe(1);
  });

  it("sends an unnumbered file to the end", () => {
    expect(orderFromFilename("Research.txt")).toBe(999);
  });
});

describe("countWords", () => {
  it("counts words, not characters", () => {
    expect(countWords("one two three")).toBe(3);
  });

  it("is zero for nothing", () => {
    expect(countWords("   ")).toBe(0);
  });
});
