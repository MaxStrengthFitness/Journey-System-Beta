import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { firstSentences, hasMoreThanFirstSentences } from "./first-sentences";

describe("firstSentences", () => {
  it("returns the first whole sentence", () => {
    expect(firstSentences("Stop at 90° at the bottom turn. She says it clicks.", 0)).toBe(
      "Stop at 90° at the bottom turn.",
    );
  });

  it("adds whole sentences until the line reaches the minimum", () => {
    const body = "Right knee. Stop at 90° at the bottom turn. She says it clicks on the way up.";
    expect(firstSentences(body, 5)).toBe("Right knee.");
    expect(firstSentences(body, 20)).toBe("Right knee. Stop at 90° at the bottom turn.");
    expect(firstSentences(body, 500)).toBe(body);
  });

  it("never cuts mid-sentence and never adds an ellipsis", () => {
    const body =
      "Keep the seat at 6 and the pad high, because her left shoulder catches if the handles start low, and she won't say so. Otherwise normal.";
    const out = firstSentences(body, 10);
    expect(out.endsWith(".")).toBe(true);
    expect(out).not.toContain("…");
    expect(body.startsWith(out)).toBe(true);
  });

  it("returns the whole text when it has no sentence end", () => {
    expect(firstSentences("No lunges, no deep knee bend", 90)).toBe("No lunges, no deep knee bend");
    expect(firstSentences("  prefers mornings  ", 0)).toBe("prefers mornings");
  });

  it("does not end a sentence at a common abbreviation or an initial", () => {
    expect(firstSentences("Use a pad, e.g. the blue one, behind her back. Then go.", 0)).toBe(
      "Use a pad, e.g. the blue one, behind her back.",
    );
    expect(firstSentences("Dr. Patel cleared her in March. No limits now.", 0)).toBe(
      "Dr. Patel cleared her in March.",
    );
    expect(firstSentences("Pain on the R. side of the knee. Watch the turn.", 0)).toBe(
      "Pain on the R. side of the knee.",
    );
  });

  it("does not end a sentence inside a number or at a list marker", () => {
    expect(firstSentences("2.5 lb jumps only. Ask first.", 0)).toBe("2.5 lb jumps only.");
    expect(firstSentences("1. Seat at 6. 2. Pad high.", 0)).toBe("1. Seat at 6.");
    expect(firstSentences("Seat at 6. 2) Pad high.", 0)).toBe("Seat at 6.");
  });

  it("does not end a sentence where the next word is lower case or a number", () => {
    // An abbreviation it does not know, and a question inside quotes: the
    // word after the mark says the sentence goes on.
    expect(firstSentences("Train her at 7 a.m. only, never after work. Fine otherwise.", 0)).toBe(
      "Train her at 7 a.m. only, never after work.",
    );
    expect(firstSentences("Cleared by her P.T. last week. No limits now.", 0)).toBe(
      "Cleared by her P.T. last week.",
    );
    expect(firstSentences("See Fig. 2 for the seat. Then set the pad.", 0)).toBe("See Fig. 2 for the seat.");
    for (const n of [0, 20]) {
      expect(firstSentences('Ask "does it pinch?" before every set. Then go.', n)).toBe(
        'Ask "does it pinch?" before every set.',
      );
    }
  });

  it("does not cut a sentence at an unknown abbreviation past the minimum either", () => {
    const body =
      "Right knee clicks at the bottom. Keep the seat at 6 and the pad high, stop at 90° at the bottom turn, as her P.T. said last week. Otherwise normal.";
    // The premise: the old cut would have landed past 90 characters, where a
    // short line looks complete.
    expect(body.indexOf("P.T.")).toBeGreaterThan(90);
    expect(firstSentences(body, 90)).toBe(
      "Right knee clicks at the bottom. Keep the seat at 6 and the pad high, stop at 90° at the bottom turn, as her P.T. said last week.",
    );
  });

  it("still ends at a line break, whatever the next line starts with", () => {
    expect(firstSentences("Right knee.\nno lunges this week", 0)).toBe("Right knee.");
  });

  it("keeps closing quotes and stacked marks with their sentence", () => {
    expect(firstSentences('She said "no more squats." Fine by us.', 0)).toBe('She said "no more squats."');
    expect(firstSentences("Really?! Yes. Then more.", 0)).toBe("Really?!");
    expect(firstSentences("She’s fine (for now.) Recheck in May.", 0)).toBe("She’s fine (for now.)");
  });

  it("does not stop at a trailing-off, so it never prints an ellipsis it did not finish", () => {
    expect(firstSentences("Fine… then not. Next week.", 0)).toBe("Fine… then not.");
    expect(firstSentences("She was fine... then not. Next week.", 0)).toBe("She was fine... then not.");
  });

  it("reads a line break as the end of a sentence", () => {
    expect(firstSentences("Right knee\nNo lunges\nNo deep bend", 0)).toBe("Right knee");
    expect(firstSentences("Right knee\nNo lunges\nNo deep bend", 12)).toBe("Right knee\nNo lunges");
    expect(firstSentences("Right knee\n\nNo lunges", 12)).toBe("Right knee\n\nNo lunges");
  });

  it("is empty for empty input", () => {
    expect(firstSentences("", 10)).toBe("");
    expect(firstSentences("   ", 10)).toBe("");
    expect(firstSentences(null, 10)).toBe("");
    expect(firstSentences(undefined)).toBe("");
  });

  it("is always a prefix of the trimmed text", () => {
    const samples = [
      "Critical. Leg Press, right knee: stop at 90° at the bottom turn.",
      "She'll tell you she's fine. She isn't — ask about the hip.",
      "No end mark at all",
      "A.B.C. then more. And more!",
      "Line one\nLine two. Line three?",
      "  padded.   ",
    ];
    for (const s of samples) {
      for (const n of [0, 5, 20, 90, 500]) {
        expect(s.trim().startsWith(firstSentences(s, n)), `${JSON.stringify(s)} @${n}`).toBe(true);
      }
    }
  });

  it("says when it left something out", () => {
    expect(hasMoreThanFirstSentences("One. Two.", 0)).toBe(true);
    expect(hasMoreThanFirstSentences("One. Two.", 100)).toBe(false);
    expect(hasMoreThanFirstSentences("", 0)).toBe(false);
  });
});

describe("first-sentences.ts has no regex lookbehind", () => {
  it("never parses a pattern older iPadOS Safari refuses", () => {
    // Older iPadOS Safari throws while PARSING `(?<=` / `(?<!`, which fails the
    // whole module (KNOWN-TRAPS → React, tests, dates and tooling).
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(here, "first-sentences.ts"), "utf8");
    expect(src).not.toContain("(?<");
  });
});
