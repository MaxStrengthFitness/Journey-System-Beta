import { describe, expect, it, vi } from "vitest";

vi.mock("../../firebase", () => ({ db: {} }));

import { MAX_STUDIOS_COMPARED, outcomeStudioKey } from "./useOutcomes";

const ids = (n: number) => Array.from({ length: n }, (_, i) => `s${String(i).padStart(3, "0")}`);

describe("outcomeStudioKey (speed round, Oct 5 2026)", () => {
  it("reads every studio up to the limit, in id order, without duplicates", () => {
    expect(outcomeStudioKey(["b", "a", "b", ""])).toBe("a,b");
  });

  it("past the limit, the studio on screen is still read", () => {
    const all = ids(40);
    const keep = all[39];
    const key = outcomeStudioKey(all, keep).split(",");
    expect(key).toHaveLength(MAX_STUDIOS_COMPARED);
    expect(key).toContain(keep);
  });

  it("a studio on screen already inside the cut changes nothing", () => {
    const all = ids(40);
    expect(outcomeStudioKey(all, all[0])).toBe(outcomeStudioKey(all));
  });

  it("a studio on screen that isn't in the list is not added", () => {
    expect(outcomeStudioKey(["a", "b"], "z")).toBe("a,b");
  });
});
