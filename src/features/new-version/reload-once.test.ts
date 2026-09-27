import { describe, expect, it } from "vitest";
import {
  noteReload,
  PLACE_FRESH_MS,
  PLACE_KEY,
  RELOAD_AGAIN_AFTER_MS,
  rememberPlace,
  takePlace,
  triedAlready,
  type SessionStorageLike,
} from "./reload-once";

function memory(): SessionStorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

const broken: SessionStorageLike = {
  getItem: () => {
    throw new Error("SecurityError");
  },
  setItem: () => {
    throw new Error("QuotaExceededError");
  },
  removeItem: () => {
    throw new Error("SecurityError");
  },
};

const known = (v: string) => ["clients", "profile", "workouts"].includes(v);

describe("the loop guard", () => {
  it("allows the first reload for a version", () => {
    expect(triedAlready(memory(), "b2", 1_000)).toBe(false);
  });

  it("holds a second reload for the same version for ten minutes", () => {
    const s = memory();
    noteReload(s, "b2", 1_000);
    expect(triedAlready(s, "b2", 1_000 + RELOAD_AGAIN_AFTER_MS - 1)).toBe(true);
    expect(triedAlready(s, "b2", 1_000 + RELOAD_AGAIN_AFTER_MS)).toBe(false);
  });

  it("does not hold a reload for a different version", () => {
    const s = memory();
    noteReload(s, "b2", 1_000);
    expect(triedAlready(s, "b3", 2_000)).toBe(false);
  });

  it("does not trust a record from the future (a clock set back)", () => {
    const s = memory();
    noteReload(s, "b2", 10_000);
    expect(triedAlready(s, "b2", 5_000)).toBe(false);
  });

  it("allows one reload when storage cannot be used, and throws nothing", () => {
    expect(() => noteReload(broken, "b2", 1)).not.toThrow();
    expect(triedAlready(broken, "b2", 2)).toBe(false);
    expect(triedAlready(null, "b2", 2)).toBe(false);
  });

  it("ignores a record it cannot read", () => {
    const s = memory();
    s.setItem("journey:new-version:reload", "{not json");
    expect(triedAlready(s, "b2", 1)).toBe(false);
  });
});

describe("where you were", () => {
  it("comes back once, to the same person, within two minutes", () => {
    const s = memory();
    rememberPlace(s, { view: "profile", clientId: "c1" }, "uid-a", 1_000);
    expect(takePlace(s, "uid-a", 1_000 + PLACE_FRESH_MS, known)).toEqual({ view: "profile", clientId: "c1" });
    expect(takePlace(s, "uid-a", 1_000 + PLACE_FRESH_MS, known)).toBeNull();
  });

  it("is never someone else's place, and is forgotten on the way", () => {
    const s = memory();
    rememberPlace(s, { view: "profile", clientId: "c1" }, "uid-a", 1_000);
    expect(takePlace(s, "uid-b", 1_500, known)).toBeNull();
    expect(s.data.has(PLACE_KEY)).toBe(false);
  });

  it("is not a place from long ago", () => {
    const s = memory();
    rememberPlace(s, { view: "profile", clientId: "c1" }, "uid-a", 1_000);
    expect(takePlace(s, "uid-a", 1_000 + PLACE_FRESH_MS + 1, known)).toBeNull();
  });

  it("is not a screen this version does not know", () => {
    const s = memory();
    rememberPlace(s, { view: "planner", clientId: null }, "uid-a", 1_000);
    expect(takePlace(s, "uid-a", 1_500, known)).toBeNull();
  });

  it("may have no client", () => {
    const s = memory();
    rememberPlace(s, { view: "clients", clientId: null }, "uid-a", 1_000);
    expect(takePlace(s, "uid-a", 1_500, known)).toEqual({ view: "clients", clientId: null });
  });

  it("is nothing when storage cannot be used, and throws nothing", () => {
    expect(() => rememberPlace(broken, { view: "profile", clientId: "c1" }, "uid-a", 1)).not.toThrow();
    expect(takePlace(broken, "uid-a", 2, known)).toBeNull();
    expect(takePlace(null, "uid-a", 2, known)).toBeNull();
  });
});
