import { describe, expect, it } from "vitest";
import { LATE_CANCEL_WORDS, mayTakeBackLateCancel, sessionsAndLateCancels } from "./late-cancels";

describe("late cancels (Atlas answers, Oct 2 2026)", () => {
  it("are tallied beside the visits, never inside them", () => {
    expect(sessionsAndLateCancels(40, 2)).toBe("40 sessions · 2 late cancels");
    expect(sessionsAndLateCancels(1, 1)).toBe("1 session · 1 late cancel");
    expect(sessionsAndLateCancels(40, 0)).toBe("40 sessions");
    // Unknown late cancels claim nothing either way; an unknown count says nothing.
    expect(sessionsAndLateCancels(40, null)).toBe("40 sessions");
    expect(sessionsAndLateCancels(null, 2)).toBeNull();
  });

  it("are taken back by a leader, or by whoever made the mark", () => {
    const mark = { markedBy: { id: "uid-sam" } };
    expect(mayTakeBackLateCancel(mark, "uid-sam", false)).toBe(true);
    expect(mayTakeBackLateCancel(mark, "uid-pip", false)).toBe(false);
    expect(mayTakeBackLateCancel(mark, "uid-pip", true)).toBe(true);
    expect(mayTakeBackLateCancel({ markedBy: null }, "uid-pip", false)).toBe(false);
    expect(mayTakeBackLateCancel(null, "uid-pip", true)).toBe(false);
  });

  it("say what happened in one set of words", () => {
    expect(LATE_CANCEL_WORDS).toBe("Late cancel · session taken");
  });
});
