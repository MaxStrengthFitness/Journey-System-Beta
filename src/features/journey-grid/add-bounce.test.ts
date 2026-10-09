import { describe, expect, it } from "vitest";
import { FLOOR_ADD_BOUNCE_MS, isBounceAdd } from "./add-bounce";

describe("one tap, one machine (the FileMaker floor's +, Oct 9 2026)", () => {
  it("the first add is never a bounce", () => {
    expect(isBounceAdd(null, "leg-press", 1_000)).toBe(false);
  });

  it("another machine inside the window is the same tap landing again", () => {
    const last = { id: "rear-delt", at: 1_000 };
    expect(isBounceAdd(last, "leg-press", 1_000)).toBe(true);
    expect(isBounceAdd(last, "leg-press", 1_000 + FLOOR_ADD_BOUNCE_MS - 1)).toBe(true);
  });

  it("another machine once the window has passed is a new add", () => {
    const last = { id: "rear-delt", at: 1_000 };
    expect(isBounceAdd(last, "leg-press", 1_000 + FLOOR_ADD_BOUNCE_MS)).toBe(false);
    expect(isBounceAdd(last, "leg-press", 5_000)).toBe(false);
  });

  it("the same machine again is not a bounce (it is already in today's list)", () => {
    expect(isBounceAdd({ id: "leg-press", at: 1_000 }, "leg-press", 1_010)).toBe(false);
  });

  it("a clock that went backwards never holds an add", () => {
    expect(isBounceAdd({ id: "rear-delt", at: 5_000 }, "leg-press", 1_000)).toBe(false);
  });
});
