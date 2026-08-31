import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../firebase", () => ({ db: { __fake: true } }));

const getCountFromServer = vi.fn();

vi.mock("firebase/firestore", () => ({
  collection: (_db: unknown, path: string) => ({ __collection: path }),
  query: (coll: any, ...constraints: any[]) => ({ ...coll, constraints }),
  where: (field: string, op: string, value: unknown) => ({ field, op, value }),
  getCountFromServer: (...args: any[]) => getCountFromServer(...args),
}));

import {
  getCompletedSessionCount,
  invalidateSessionCount,
  __resetSessionCountCache,
} from "./session-count-cache";

const ok = (count: number) => ({ data: () => ({ count }) });

describe("getCompletedSessionCount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetSessionCountCache();
  });

  it("reads once and serves the cache thereafter", async () => {
    getCountFromServer.mockResolvedValue(ok(12));

    expect(await getCompletedSessionCount("c1")).toBe(12);
    expect(await getCompletedSessionCount("c1")).toBe(12);
    expect(await getCompletedSessionCount("c1")).toBe(12);

    expect(getCountFromServer).toHaveBeenCalledTimes(1);
  });

  it("collapses concurrent callers onto ONE query", async () => {
    // This is the 429 fix. A snapshot storm used to fire one aggregation query
    // per snapshot; now the in-flight promise is shared.
    let resolve!: (v: any) => void;
    getCountFromServer.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );

    const all = Promise.all([
      getCompletedSessionCount("c1"),
      getCompletedSessionCount("c1"),
      getCompletedSessionCount("c1"),
      getCompletedSessionCount("c1"),
    ]);
    resolve(ok(7));

    expect(await all).toEqual([7, 7, 7, 7]);
    expect(getCountFromServer).toHaveBeenCalledTimes(1);
  });

  it("keeps separate counts per client", async () => {
    getCountFromServer
      .mockResolvedValueOnce(ok(3))
      .mockResolvedValueOnce(ok(9));

    expect(await getCompletedSessionCount("c1")).toBe(3);
    expect(await getCompletedSessionCount("c2")).toBe(9);
    expect(await getCompletedSessionCount("c1")).toBe(3);
    expect(getCountFromServer).toHaveBeenCalledTimes(2);
  });

  it("re-reads after invalidation", async () => {
    getCountFromServer.mockResolvedValueOnce(ok(3)).mockResolvedValueOnce(ok(4));

    expect(await getCompletedSessionCount("c1")).toBe(3);
    invalidateSessionCount("c1");
    expect(await getCompletedSessionCount("c1")).toBe(4);
    expect(getCountFromServer).toHaveBeenCalledTimes(2);
  });

  it("stops querying after a quota error and serves the last known value", async () => {
    getCountFromServer.mockResolvedValueOnce(ok(5));
    expect(await getCompletedSessionCount("c1")).toBe(5);

    const quota = Object.assign(new Error("Quota exceeded"), {
      code: "resource-exhausted",
    });
    getCountFromServer.mockRejectedValue(quota);

    // Forced past the cache, this one hits the error...
    expect(await getCompletedSessionCount("c1", { force: true })).toBe(5);
    // ...and subsequent calls do not even try, so the console stops flooding.
    expect(await getCompletedSessionCount("c1", { force: true })).toBe(5);
    expect(await getCompletedSessionCount("c2", { force: true })).toBeNull();
    expect(getCountFromServer).toHaveBeenCalledTimes(2);
  });

  it("returns null rather than 0 when the count cannot be determined", async () => {
    // A caller must never mistake "unknown" for "this client has no sessions"
    // and write a 0 over a real count.
    getCountFromServer.mockRejectedValue(new Error("offline"));
    expect(await getCompletedSessionCount("c-new")).toBeNull();
  });

  it("ignores an empty client id", async () => {
    expect(await getCompletedSessionCount("")).toBeNull();
    expect(getCountFromServer).not.toHaveBeenCalled();
  });
});
