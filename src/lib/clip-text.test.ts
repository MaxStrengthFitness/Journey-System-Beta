import { describe, expect, it } from "vitest";
import { clipText } from "./clip-text";

describe("clipText", () => {
  it("leaves short text alone and cuts long text to the length", () => {
    expect(clipText("Leg Press", 20)).toBe("Leg Press");
    expect(clipText("Leg Press", 3)).toBe("Leg");
  });

  it("never ends in half an emoji", () => {
    const flexed = "Strong 💪"; // "Strong " and the flexed-biceps emoji
    expect(clipText(flexed, 8)).toBe("Strong ");
    expect(clipText(flexed, 9)).toBe(flexed);
    expect(clipText(flexed, 8).length).toBeLessThanOrEqual(8);
  });
});
