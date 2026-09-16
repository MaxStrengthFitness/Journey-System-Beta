import { describe, expect, it } from "vitest";
import { DIAL_VALUES, MASTERY_SCALE } from "../rating/dial";
import {
  FOUR_PS,
  UNRATED_SCORE,
  dialFromRank,
  dialFromScore,
  masteryWord,
  masteryWordForScore,
  rankFromDial,
  rankFromScore,
  scoreFromDial,
  scoreFromRank,
  statusFromRank,
  talkingPointFor,
  toneFromRank,
  withDial,
} from "./four-ps";

describe("the 4 P's on the Dial — rank ↔ dial", () => {
  it("maps −2…+2 onto 1…5 and back", () => {
    expect(DIAL_VALUES.map(rankFromDial)).toEqual([1, 2, 3, 4, 5]);
    expect([1, 2, 3, 4, 5].map(dialFromRank)).toEqual([-2, -1, 0, 1, 2]);
  });

  it("an absent, zero or out-of-range rank is not rated", () => {
    expect(dialFromRank(null)).toBeNull();
    expect(dialFromRank(undefined)).toBeNull();
    expect(dialFromRank(0)).toBeNull();
    expect(dialFromRank(6)).toBeNull();
    expect(dialFromRank(NaN)).toBeNull();
  });
});

describe("the stored score", () => {
  it("is the rank × 20, as every older report wrote it", () => {
    expect([1, 2, 3, 4, 5].map((r) => scoreFromRank(r as 1))).toEqual([20, 40, 60, 80, 100]);
    expect([20, 40, 60, 80, 100].map(rankFromScore)).toEqual([1, 2, 3, 4, 5]);
  });

  it("reads an old report's default 80 as Strong — what its trainer left standing", () => {
    expect(rankFromScore(80)).toBe(4);
    expect(masteryWordForScore(80)).toBe("Strong");
  });

  it("zero, missing or garbage is not rated, never a default", () => {
    expect(rankFromScore(UNRATED_SCORE)).toBeNull();
    expect(rankFromScore(undefined)).toBeNull();
    expect(rankFromScore(null)).toBeNull();
    expect(rankFromScore(NaN)).toBeNull();
    expect(rankFromScore(-40)).toBeNull();
    expect(dialFromScore(0)).toBeNull();
    expect(masteryWordForScore(0)).toBe(MASTERY_SCALE.untouched);
  });

  it("lands an odd hand-edited value on the nearest rank, clamped", () => {
    expect(rankFromScore(50)).toBe(3);
    expect(rankFromScore(7)).toBe(1);
    expect(rankFromScore(140)).toBe(5);
  });

  it("a cleared dial stores not-rated; a tap stores the position", () => {
    expect(scoreFromDial(null)).toBe(UNRATED_SCORE);
    expect(scoreFromDial(1)).toBe(80);
    expect(scoreFromDial(-2)).toBe(20);
  });
});

describe("derived status and words", () => {
  it("≤2 red · 3 black · ≥4 green · unrated black", () => {
    expect(statusFromRank(1)).toBe("red");
    expect(statusFromRank(2)).toBe("red");
    expect(statusFromRank(3)).toBe("black");
    expect(statusFromRank(4)).toBe("green");
    expect(statusFromRank(5)).toBe("green");
    expect(statusFromRank(null)).toBe("black");
  });

  it("prints the mastery word, never the number", () => {
    expect([1, 2, 3, 4, 5].map((r) => masteryWord(r as 1))).toEqual([...MASTERY_SCALE.words]);
    expect(masteryWord(null)).toBe("Not rated");
    for (const r of [1, 2, 3, 4, 5]) expect(masteryWord(r as 1)).not.toMatch(/\d/);
  });

  it("colours by urgency, worst on the left, none when unrated", () => {
    expect([1, 2, 3, 4, 5].map((r) => toneFromRank(r as 1))).toEqual(["alert", "warn", "live", "ok", "ok-strong"]);
    expect(toneFromRank(null)).toBe("none");
  });

  it("picks the talking point with the old thresholds", () => {
    expect(talkingPointFor("pace", 5)).toMatch(/Masterful/);
    expect(talkingPointFor("pace", 4)).toMatch(/Mostly controlled/);
    expect(talkingPointFor("pace", 3)).toMatch(/Mostly controlled/);
    expect(talkingPointFor("pace", 2)).toMatch(/fast, segmented/);
    expect(talkingPointFor("pace", 1)).toMatch(/fast, segmented/);
    expect(talkingPointFor("pace", null)).toMatch(/Mostly controlled/);
  });
});

describe("withDial", () => {
  const entry = {
    score: 80,
    note: "Keep the chin tucked",
    talkingPoints: [
      { id: "a", text: "One", status: "black" as const },
      { id: "b", text: "Two", status: "black" as const },
    ],
  };

  it("writes the score and derives every talking point's status", () => {
    const next = withDial(entry, -2);
    expect(next.score).toBe(20);
    expect(next.talkingPoints.map((t) => t.status)).toEqual(["red", "red"]);
    expect(next.note).toBe("Keep the chin tucked");
    // A new object, never the old one edited in place.
    expect(entry.score).toBe(80);
    expect(entry.talkingPoints[0].status).toBe("black");
  });

  it("green from Strong, black from Solid, not-rated from a cleared dial", () => {
    expect(withDial(entry, 1).talkingPoints[0].status).toBe("green");
    expect(withDial(entry, 0).talkingPoints[0].status).toBe("black");
    const cleared = withDial(entry, null);
    expect(cleared.score).toBe(UNRATED_SCORE);
    expect(cleared.talkingPoints[0].status).toBe("black");
  });

  it("copes with a P that was never written", () => {
    expect(withDial(undefined, 2)).toEqual({ score: 100, note: "", talkingPoints: [] });
  });

  it("names the four P's in the report's order", () => {
    expect(FOUR_PS).toEqual(["posture", "pace", "path", "purpose"]);
  });
});
