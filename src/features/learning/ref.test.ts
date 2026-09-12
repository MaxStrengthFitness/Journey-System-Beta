import { describe, expect, it } from "vitest";
import {
  LEARNING_ID_MAX,
  LEARNING_TITLE_MAX,
  learningRefKey,
  learningRefLabel,
  learningSectionOf,
  parseLearningRef,
  refForWikiTarget,
  sameLearningRef,
  toStoredLearningRef,
} from "./ref";

describe("learning refs", () => {
  it("reads back every kind it writes", () => {
    const refs = [
      { kind: "machine", id: "m-leg-press" },
      { kind: "academy-card", id: "cp" },
      { kind: "academy-script", id: "upper-body-cp" },
      { kind: "academy-overview", id: "chest-press" },
      { kind: "academy-module", id: "summary" },
      { kind: "academy-topic", id: "a1-glossary", moduleId: "a1" },
      { kind: "academy-topic", id: "a1-glossary" },
      { kind: "academy-cueing" },
      { kind: "academy-glossary", id: "Turnaround" },
      { kind: "academy-glossary" },
      { kind: "studio-page", id: "abc123", studioId: "solon" },
    ] as const;
    for (const ref of refs) {
      const stored = toStoredLearningRef(ref, "A title");
      expect(stored).not.toBeNull();
      expect(parseLearningRef(stored)).toEqual({ ...ref, title: "A title" });
    }
  });

  it("refuses what it cannot open rather than guessing", () => {
    expect(parseLearningRef(null)).toBeNull();
    expect(parseLearningRef("machine:m-leg-press")).toBeNull();
    expect(parseLearningRef({ kind: "client", id: "123" })).toBeNull();
    expect(parseLearningRef({ kind: "machine" })).toBeNull();
    expect(parseLearningRef({ kind: "machine", id: "   " })).toBeNull();
    expect(parseLearningRef({ kind: "machine", id: 42 })).toBeNull();
    expect(parseLearningRef({ kind: "machine", id: "x".repeat(LEARNING_ID_MAX + 1) })).toBeNull();
    expect(parseLearningRef({ kind: "machine", id: "m-\u0000leg" })).toBeNull();
    // A studio page is only openable by its own studio, so it must say which.
    expect(parseLearningRef({ kind: "studio-page", id: "abc" })).toBeNull();
  });

  it("drops keys it does not know and trims the title", () => {
    const parsed = parseLearningRef({
      kind: "machine",
      id: " m-leg-press ",
      title: "  Leg   Press ",
      clientId: "123",
    });
    expect(parsed).toEqual({ kind: "machine", id: "m-leg-press", title: "Leg Press" });
  });

  it("caps a long title rather than refusing the link", () => {
    const parsed = parseLearningRef({ kind: "machine", id: "m-x", title: "t".repeat(400) });
    expect(parsed?.title?.length).toBe(LEARNING_TITLE_MAX);
    expect(parsed?.title?.endsWith("…")).toBe(true);
  });

  it("writes no undefined values (Firestore refuses them)", () => {
    const stored = toStoredLearningRef({ kind: "academy-topic", id: "t1" });
    expect(stored).toEqual({ kind: "academy-topic", id: "t1" });
    expect(Object.values(stored as object).every((v) => v !== undefined)).toBe(true);
  });

  it("keys identify the page, not its description", () => {
    expect(learningRefKey({ kind: "academy-topic", id: "t1", moduleId: "a1" })).toBe(
      learningRefKey({ kind: "academy-topic", id: "t1" }),
    );
    expect(
      sameLearningRef(
        { kind: "studio-page", id: "p1", studioId: "solon" },
        { kind: "studio-page", id: "p1", studioId: "westlake" },
      ),
    ).toBe(false);
    expect(sameLearningRef({ kind: "machine", id: "m-ext" }, null)).toBe(false);
    expect(learningRefKey({ kind: "academy-cueing" })).toBe("academy-cueing");
  });

  it("knows which section a ref opens in", () => {
    expect(learningSectionOf({ kind: "machine", id: "m-ext" })).toBe("catalog");
    expect(learningSectionOf({ kind: "studio-page", id: "p", studioId: "s" })).toBe("academy");
    expect(learningSectionOf({ kind: "academy-glossary" })).toBe("academy");
  });

  it("labels a link by its saved title, or by what kind of page it is", () => {
    expect(learningRefLabel({ kind: "machine", id: "m-ext", title: "Leg Extension" })).toBe(
      "Leg Extension",
    );
    expect(learningRefLabel({ kind: "academy-card", id: "cp" })).toBe("Quick reference card");
    expect(learningRefLabel({ kind: "academy-glossary", id: "Turnaround" })).toBe(
      "Glossary: Turnaround",
    );
  });

  it("maps the studio wiki's overlay targets onto refs", () => {
    expect(refForWikiTarget("machine", "m-ext")).toEqual({ kind: "machine", id: "m-ext" });
    expect(refForWikiTarget("topic", "a1-x")).toEqual({ kind: "academy-topic", id: "a1-x" });
    expect(refForWikiTarget("card", "cp")).toEqual({ kind: "academy-card", id: "cp" });
    expect(refForWikiTarget("script", "s")).toEqual({ kind: "academy-script", id: "s" });
    expect(refForWikiTarget("overview", "o")).toEqual({ kind: "academy-overview", id: "o" });
  });
});
