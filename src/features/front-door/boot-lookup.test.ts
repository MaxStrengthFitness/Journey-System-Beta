import { describe, expect, it } from "vitest";
import { TIMED_OUT, accessChanged, answerCounts, levelOf, pickerWaits, raise, trainerFromDoc, withTimeout } from "./boot-lookup";

describe("what is known about a list", () => {
  it("only grows: the cache never unconfirms the server", () => {
    expect(raise("unknown", "cache")).toBe("cache");
    expect(raise("cache", "server")).toBe("server");
    expect(raise("server", "cache")).toBe("server");
    expect(raise("cache", "unknown")).toBe("cache");
  });

  it("an empty answer from the cache alone is not an answer", () => {
    expect(answerCounts(0, true)).toBe(false);
    expect(answerCounts(0, false)).toBe(true);
    expect(answerCounts(3, true)).toBe(true);
    expect(levelOf(true)).toBe("cache");
    expect(levelOf(false)).toBe("server");
  });
});

describe("the picker waits rather than guess", () => {
  it("while the studios haven't answered", () => {
    expect(pickerWaits({ studiosKnown: false, networksKnown: true, mine: 2 })).toBe(true);
  });
  it("while none are yours and the networks haven't answered", () => {
    expect(pickerWaits({ studiosKnown: true, networksKnown: false, mine: 0 })).toBe(true);
  });
  it("not when your studios are there, networks or not", () => {
    expect(pickerWaits({ studiosKnown: true, networksKnown: false, mine: 1 })).toBe(false);
    expect(pickerWaits({ studiosKnown: true, networksKnown: true, mine: 0 })).toBe(false);
  });
});

describe("did the person's access change", () => {
  const base = { role: "LifeTransformer", primaryHomeStudioId: "westlake", accessibleStudioIds: ["westlake"], fullName: "A" };
  it("a role, a studio or switching off is a change", () => {
    expect(accessChanged(base, { ...base, role: "StudioLeader" })).toBe(true);
    expect(accessChanged(base, { ...base, accessibleStudioIds: ["westlake", "solon"] })).toBe(true);
    expect(accessChanged(base, { ...base, isActive: false })).toBe(true);
    expect(accessChanged(base, { ...base, managedStudioIds: ["solon"] })).toBe(true);
  });
  it("a name or a photo is not", () => {
    expect(accessChanged(base, { ...base, fullName: "B", photoURL: "x" })).toBe(false);
  });
  it("a missing list and an empty one are the same", () => {
    expect(accessChanged({ ...base, activeGuestStudioIds: [] }, base)).toBe(false);
  });
  it("nothing held yet is a change", () => {
    expect(accessChanged(null, base)).toBe(true);
  });
});

describe("a trainer record", () => {
  it("always has a role", () => {
    expect(trainerFromDoc<{ id: string; role: string }>("u1", { fullName: "A" })).toEqual({ id: "u1", fullName: "A", role: "LifeTransformer" });
    expect(trainerFromDoc<{ role: string }>("u1", { role: "StudioLeader" }).role).toBe("StudioLeader");
  });
});

describe("withTimeout", () => {
  it("answers with the promise when it is quick, TIMED_OUT when it isn't", async () => {
    await expect(withTimeout(Promise.resolve(4), 50)).resolves.toBe(4);
    await expect(withTimeout(new Promise(() => {}), 5)).resolves.toBe(TIMED_OUT);
    await expect(withTimeout(Promise.reject(new Error("x")), 50)).resolves.toBe(TIMED_OUT);
  });
});
