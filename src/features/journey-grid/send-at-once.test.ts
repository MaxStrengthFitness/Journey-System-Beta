import { describe, expect, it } from "vitest";
import { sendsAtOnce } from "./send-at-once";

describe("sendsAtOnce", () => {
  it("waits on a keystroke in the reps, seconds or weight field", () => {
    expect(sendsAtOnce({ reps: 1 })).toBe(false);
    expect(sendsAtOnce({ reps: 12 })).toBe(false);
    expect(sendsAtOnce({ repsR: 9 })).toBe(false);
    expect(sendsAtOnce({ seconds: 45 })).toBe(false);
    expect(sendsAtOnce({ weight: 150 })).toBe(false);
    expect(sendsAtOnce({ weight: null })).toBe(false);
  });

  it("sends a quality mark at once, on either side, including taking one off", () => {
    expect(sendsAtOnce({ quality: 3 })).toBe(true);
    expect(sendsAtOnce({ qualityR: 1 })).toBe(true);
    expect(sendsAtOnce({ quality: 2 })).toBe(true);
  });

  it("sends practice, skip and clearing either at once", () => {
    expect(sendsAtOnce({ outcome: "practice" })).toBe(true);
    expect(sendsAtOnce({ outcome: "skipped", skipReason: "pain_injury", skipNote: "left knee" })).toBe(true);
    expect(sendsAtOnce({ outcome: null, skipReason: null, skipNote: null })).toBe(true);
  });

  it("sends the unit switch and the stopwatch's seconds at once", () => {
    expect(sendsAtOnce({ isTSC: false })).toBe(true);
    expect(sendsAtOnce({ isTSC: true, seconds: 72 })).toBe(true);
  });
});
