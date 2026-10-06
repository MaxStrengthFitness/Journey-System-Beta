import { describe, expect, it } from "vitest";
import {
  LIST_SEEN_PREFIX,
  TIMED_OUT,
  accessChanged,
  answerCounts,
  cacheAnswerUsable,
  levelOf,
  listAnswerCounts,
  listSeen,
  markListSeen,
  pickerWaits,
  raise,
  trainerFromDoc,
  withTimeout,
} from "./boot-lookup";

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

describe("the iPad's copy of a list (the review's fix)", () => {
  it("counts only after the server has answered in full here before", () => {
    expect(cacheAnswerUsable("studios", 4, false)).toBe(false);
    expect(cacheAnswerUsable("studios", 4, true)).toBe(true);
    expect(cacheAnswerUsable("networks", 0, true)).toBe(false);
  });
  it("never takes one trainer record for the team", () => {
    expect(cacheAnswerUsable("trainers", 1, true)).toBe(false);
    expect(cacheAnswerUsable("trainers", 2, true)).toBe(true);
  });
  it("the server's answer always counts, empty included", () => {
    expect(listAnswerCounts("trainers", 0, false, false)).toBe(true);
    expect(listAnswerCounts("trainers", 1, true, true)).toBe(false);
  });
  it("remembers a whole answer in storage, and storage that throws is simply no", () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    expect(listSeen(storage, "studios")).toBe(false);
    markListSeen(storage, "studios");
    expect(store.get(LIST_SEEN_PREFIX + "studios")).toBe("1");
    expect(listSeen(storage, "studios")).toBe(true);
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(listSeen(broken, "studios")).toBe(false);
    expect(() => markListSeen(broken, "studios")).not.toThrow();
  });
});
