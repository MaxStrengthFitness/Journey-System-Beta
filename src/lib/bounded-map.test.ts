import { describe, expect, it } from "vitest";
import { getBounded, setBounded } from "./bounded-map";

describe("a Map kept to its last N keys", () => {
  it("lets the oldest go past the bound, and a use makes a key the newest", () => {
    const m = new Map<string, number>();
    setBounded(m, "a", 1, 3);
    setBounded(m, "b", 2, 3);
    setBounded(m, "c", 3, 3);
    expect(getBounded(m, "a")).toBe(1); // a is now the newest
    setBounded(m, "d", 4, 3);
    expect([...m.keys()]).toEqual(["c", "a", "d"]);
    expect(getBounded(m, "b")).toBeUndefined();
  });
  it("replacing a key keeps one entry for it", () => {
    const m = new Map<string, number>();
    setBounded(m, "a", 1, 2);
    setBounded(m, "a", 2, 2);
    expect([...m.entries()]).toEqual([["a", 2]]);
  });
});
