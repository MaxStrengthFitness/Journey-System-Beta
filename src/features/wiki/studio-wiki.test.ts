import { describe, expect, it } from "vitest";
import {
  isOverlayFor,
  pagesInSection,
  parseBlocks,
  readingMinutes,
  searchStudioWiki,
  serialiseBlocks,
  targetDocId,
  validateDraft,
  whenLabel,
  type StudioWikiDoc,
  type StudioWikiDraft,
} from "./studio-wiki";

/**
 * The pure half of the studio wiki. Everything here runs without Firestore and
 * without a DOM, which is the whole reason studio-wiki.ts has no imports.
 */

function makeDoc(over: Partial<StudioWikiDoc> = {}): StudioWikiDoc {
  return {
    id: "d1",
    studioId: "s1",
    kind: "page",
    title: "How we run a first session",
    blocks: [{ kind: "para", text: "Start with the consultation." }],
    machineIds: [],
    tags: [],
    authorId: "t1",
    authorName: "AJ",
    section: "method",
    ...over,
  };
}

describe("targetDocId", () => {
  it("is deterministic, so two trainers editing one machine converge", () => {
    expect(targetDocId("machine", "chest-press")).toBe(
      targetDocId("machine", "chest-press"),
    );
  });

  it("never produces a slash, which Firestore would read as a path", () => {
    expect(targetDocId("topic", "module 3 / turnarounds")).not.toContain("/");
  });

  it("keeps different targets apart even after slugging", () => {
    expect(targetDocId("machine", "Chest Press")).not.toBe(
      targetDocId("card", "Chest Press"),
    );
  });

  it("falls back rather than producing an empty id", () => {
    expect(targetDocId("machine", "///")).toBe("machine__unknown");
  });
});

describe("parseBlocks / serialiseBlocks", () => {
  it("reads the two conventions people already know", () => {
    expect(parseBlocks("## Setup\n- lower the seat\nWatch the knee.")).toEqual([
      { kind: "heading", text: "Setup" },
      { kind: "bullet", text: "lower the seat" },
      { kind: "para", text: "Watch the knee." },
    ]);
  });

  it("accepts the bullet character iPadOS autocorrect produces", () => {
    expect(parseBlocks("• two notches lower")).toEqual([
      { kind: "bullet", text: "two notches lower" },
    ]);
  });

  it("drops blank lines rather than storing empty blocks", () => {
    expect(parseBlocks("one\n\n\ntwo")).toHaveLength(2);
  });

  it("round-trips, so an admin who saves and re-opens sees what they typed", () => {
    const body = "## Setup\n- lower the seat\nWatch the knee.";
    expect(serialiseBlocks(parseBlocks(body))).toBe(body);
  });

  it("survives an empty body without throwing", () => {
    expect(parseBlocks("")).toEqual([]);
    expect(serialiseBlocks([])).toBe("");
  });
});

describe("validateDraft", () => {
  const base: StudioWikiDraft = {
    kind: "page",
    title: "Front desk script",
    body: "Answer within three rings.",
    section: "operations",
  };

  it("passes a real draft", () => {
    expect(validateDraft(base)).toEqual([]);
  });

  it("wants a title someone could search for", () => {
    expect(validateDraft({ ...base, title: "x" }).map((p) => p.field)).toContain(
      "title",
    );
  });

  it("wants at least one line of content", () => {
    expect(validateDraft({ ...base, body: "   \n\n" }).map((p) => p.field)).toContain(
      "body",
    );
  });

  it("accepts a very short answer — the minimums are gentle on purpose", () => {
    expect(validateDraft({ ...base, body: "Two notches lower." })).toEqual([]);
  });

  it("requires a section on a page but not on an overlay", () => {
    expect(
      validateDraft({ ...base, section: undefined }).map((p) => p.field),
    ).toContain("section");
    expect(
      validateDraft({
        kind: "overlay",
        title: "Chest Press",
        body: "Two notches lower.",
        targetType: "machine",
        targetId: "chest-press",
      }),
    ).toEqual([]);
  });
});

describe("searchStudioWiki", () => {
  const docs = [
    makeDoc({ id: "a", title: "Shoulder pain on the compound row", tags: ["shoulder"] }),
    makeDoc({ id: "b", title: "Front desk script", section: "operations" }),
    makeDoc({
      id: "c",
      kind: "overlay",
      title: "Chest Press",
      targetType: "machine",
      targetId: "chest-press",
      blocks: [{ kind: "para", text: "Ours sits two notches lower." }],
    }),
  ];

  it("returns everything for an empty term", () => {
    expect(searchStudioWiki(docs, "")).toHaveLength(3);
  });

  it("ranks a title match above a body match", () => {
    const hits = searchStudioWiki(docs, "shoulder");
    expect(hits[0].doc.id).toBe("a");
  });

  it("requires every word to land somewhere", () => {
    expect(searchStudioWiki(docs, "shoulder banana")).toHaveLength(0);
  });

  it("filters by kind", () => {
    expect(searchStudioWiki(docs, "", { kind: "overlay" })).toHaveLength(1);
  });

  it("finds a machine's overlay by machineId even with no machineIds array", () => {
    const hits = searchStudioWiki(docs, "", { machineId: "chest-press" });
    expect(hits.map((h) => h.doc.id)).toEqual(["c"]);
  });

  it("hides retired docs unless asked", () => {
    const retired = [...docs, makeDoc({ id: "z", retiredAt: new Date() })];
    expect(searchStudioWiki(retired, "")).toHaveLength(3);
    expect(searchStudioWiki(retired, "", { includeRetired: true })).toHaveLength(4);
  });
});

describe("isOverlayFor / pagesInSection", () => {
  it("matches only the exact target", () => {
    const overlay = makeDoc({
      kind: "overlay",
      targetType: "machine",
      targetId: "chest-press",
    });
    expect(isOverlayFor(overlay, "machine", "chest-press")).toBe(true);
    expect(isOverlayFor(overlay, "card", "chest-press")).toBe(false);
    expect(isOverlayFor(overlay, "machine", "leg-press")).toBe(false);
  });

  it("never treats a page as an overlay", () => {
    expect(isOverlayFor(makeDoc(), "machine", "chest-press")).toBe(false);
  });

  it("lists live pages of one section, alphabetically", () => {
    const docs = [
      makeDoc({ id: "b", title: "Bravo" }),
      makeDoc({ id: "a", title: "Alpha" }),
      makeDoc({ id: "r", title: "Retired", retiredAt: new Date() }),
      makeDoc({ id: "o", title: "Other section", section: "operations" }),
    ];
    expect(pagesInSection(docs, "method").map((d) => d.title)).toEqual([
      "Alpha",
      "Bravo",
    ]);
  });
});

describe("whenLabel", () => {
  it("handles a Firestore Timestamp", () => {
    const stamp = { toDate: () => new Date("2026-09-12T00:00:00Z") };
    expect(whenLabel(stamp)).not.toBe("");
  });

  it("handles a Date and an ISO string", () => {
    expect(whenLabel(new Date("2026-09-12T00:00:00Z"))).not.toBe("");
    expect(whenLabel("2026-09-12T00:00:00Z")).not.toBe("");
  });

  /* serverTimestamp() resolves to null locally, between the optimistic render
     and the server's answer. "Updated Invalid Date" is worse than no date. */
  it("returns empty rather than a placeholder for the unknown cases", () => {
    expect(whenLabel(null)).toBe("");
    expect(whenLabel(undefined)).toBe("");
    expect(whenLabel("not a date")).toBe("");
    expect(whenLabel({})).toBe("");
  });

  it("does not throw when toDate() itself throws", () => {
    const bad = {
      toDate: () => {
        throw new Error("nope");
      },
    };
    expect(whenLabel(bad)).toBe("");
  });
});

describe("readingMinutes", () => {
  it("never reports zero minutes for a page with words in it", () => {
    expect(readingMinutes([{ kind: "para", text: "one line" }])).toBe(1);
  });
});
