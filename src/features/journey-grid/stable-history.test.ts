import { describe, expect, it } from "vitest";
import { Timestamp } from "firebase/firestore";
import { sameSet, stableHistory } from "./stable-history";

const set = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  sessionId: "s0",
  machineId: "m-leg-press",
  weight: "120",
  reps: "9",
  machineSettings: { seat: "4" },
  createdAt: Timestamp.fromMillis(1_000),
  ...extra,
});

describe("stableHistory: a keystroke today never rebuilds the past (R10)", () => {
  it("hands back the same array when the past sets are the same, even as new objects (the listener's echo)", () => {
    const prev = [set("a"), set("b")];
    const next = [set("a"), set("b")];
    expect(stableHistory(prev, next)).toBe(prev);
  });

  it("takes the new array when a past set really changed, or one came or went", () => {
    const prev = [set("a"), set("b")];
    expect(stableHistory(prev, [set("a"), set("b", { weight: "122" })])).not.toBe(prev);
    expect(stableHistory(prev, [set("a")])).not.toBe(prev);
    expect(stableHistory(prev, [set("a"), set("b", { machineSettings: { seat: "5" } })])).not.toBe(prev);
    expect(stableHistory(prev, [set("a"), set("b", { createdAt: Timestamp.fromMillis(2_000) })])).not.toBe(prev);
    expect(stableHistory(null, prev)).toBe(prev);
  });

  it("compares a set's fields, one level into a map", () => {
    expect(sameSet(set("a"), set("a"))).toBe(true);
    expect(sameSet(set("a"), set("a", { outcome: "performed" }))).toBe(false);
    expect(sameSet(set("a", { nested: { deep: { x: 1 } } }), set("a", { nested: { deep: { x: 1 } } }))).toBe(false);
  });
});
