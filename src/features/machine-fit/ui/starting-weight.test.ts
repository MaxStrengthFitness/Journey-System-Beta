import { describe, expect, it } from "vitest";
import {
  START_STEP_LB,
  STARTING_WEIGHT_WORDS,
  canStepStart,
  invalidWords,
  keepWords,
  onFileWords,
  startCorrection,
  startLabels,
  stepStart,
  wasWords,
} from "./starting-weight";

describe("Correct the starting weight: the control's state", () => {
  it("shows the number on file until something is typed or stepped", () => {
    expect(startCorrection(undefined, 84)).toEqual({ shown: "84", state: "same", value: null, was: null });
    expect(startCorrection(undefined, 37.5).shown).toBe("37.5");
  });

  it("says what it was once the box differs, and gives the corrected weight", () => {
    expect(startCorrection("80", 84)).toEqual({ shown: "80", state: "changed", value: 80, was: "was 84 lb" });
    // Typed back to the same number, written another way: nothing to correct.
    expect(startCorrection("84.0", 84)).toMatchObject({ state: "same", value: null, was: null });
  });

  it("calls a box that holds no weight what it is, so nothing is written over the number on file", () => {
    for (const typed of ["", "0", "-4", "heavy", "2001"]) {
      expect(startCorrection(typed, 84)).toMatchObject({ shown: typed, state: "invalid", value: null, was: "was 84 lb" });
    }
  });
});

describe("Correct the starting weight: stepping", () => {
  it("moves 2 lb a tap, from what the box shows", () => {
    expect(START_STEP_LB).toBe(2);
    expect(stepStart("84", 84, 1)).toBe("86");
    expect(stepStart("84", 84, -1)).toBe("82");
    expect(stepStart("37.5", 40, -1)).toBe("35.5");
    expect(stepStart("80.3", 84, 1)).toBe("82.3"); // no floating-point tail
  });

  it("steps from the number on file when the box holds no weight", () => {
    expect(stepStart("", 84, 1)).toBe("86");
    expect(stepStart("heavy", 84, -1)).toBe("82");
  });

  it("never goes to 0 or below, nor past the heaviest load the box takes", () => {
    expect(stepStart("2", 84, -1)).toBeNull();
    expect(stepStart("1", 84, -1)).toBeNull();
    expect(canStepStart("2", 84, -1)).toBe(false);
    expect(stepStart("3", 84, -1)).toBe("1");
    expect(stepStart("1999", 84, 1)).toBeNull();
    expect(canStepStart("1998", 84, 1)).toBe(true);
  });
});

describe("Correct the starting weight: the words", () => {
  const all = [
    ...Object.values(STARTING_WEIGHT_WORDS),
    onFileWords(84),
    keepWords(84),
    wasWords(84),
    invalidWords(84),
    ...Object.values(startLabels("Leg Press")),
  ];

  it("says it in plain studio English", () => {
    expect(onFileWords(84)).toBe("Starting weight 84 lb");
    expect(keepWords(84)).toBe("Keep 84 lb");
    expect(invalidWords(84)).toBe("Type the weight in pounds. Until then the starting weight stays 84 lb.");
    expect(startLabels("Leg Press")).toEqual({
      group: "Correct the starting weight on Leg Press",
      open: "Correct the starting weight on Leg Press",
      input: "Leg Press starting weight in pounds",
      down: "Leg Press: starting weight 2 lb lighter",
      up: "Leg Press: starting weight 2 lb heavier",
    });
  });

  it("never guesses a client's gender and never coaches a progression", () => {
    for (const words of all) {
      expect(words).not.toMatch(/\b(her|hers|she|him|his|he)\b/i);
      expect(words).not.toMatch(/\b(should|next weight|ready|increase to|First in Journey)\b/i);
    }
  });
});
