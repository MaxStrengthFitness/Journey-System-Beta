/**
 * YOUR WEEK'S READ COMES FROM THE SERVER (Openings round, phase 11, Sep 27
 * 2026).
 *
 * The proposal: "an answer from the iPad's cache says can't read". Your week
 * asks `fetchSessionsInRange` for `fromServer: true` (YourWeek.render.test.ts
 * holds that), and this holds the other half: with it set, the read is
 * `getDocsFromServer` and never falls back to `getDocs` — which, with the
 * persistent cache, an offline iPad would answer from whatever it last saw.
 * Without it, the read Hours, Insights and Overview have always made.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const reads = vi.hoisted(() => ({
  getDocs: vi.fn(async () => ({ docs: [] as unknown[], size: 0 })),
  getDocsFromServer: vi.fn(async () => ({
    docs: [{ id: "s1", data: () => ({ trainerId: "t1" }) }],
    size: 1,
  })),
}));

vi.mock("../../firebase", () => ({ db: {}, auth: { currentUser: null } }));
vi.mock("firebase/firestore", () => ({
  Timestamp: { fromMillis: (ms: number) => ({ ms }) },
  collection: () => ({}),
  query: (...a: unknown[]) => a,
  where: () => ({}),
  orderBy: () => ({}),
  limit: () => ({}),
  getDocs: reads.getDocs,
  getDocsFromServer: reads.getDocsFromServer,
}));

import { fetchSessionsInRange } from "../admin/sessions-range";

beforeEach(() => {
  reads.getDocs.mockClear();
  reads.getDocsFromServer.mockClear();
});

describe("the sessions read Your week makes", () => {
  it("asks the server only, when told to", async () => {
    const result = await fetchSessionsInRange({ studioId: "solon", startMs: 0, fromServer: true });
    expect(reads.getDocsFromServer).toHaveBeenCalledTimes(1);
    expect(reads.getDocs).not.toHaveBeenCalled();
    expect(result.sessions[0]?.id).toBe("s1");
    expect(result.truncated).toBe(false);
  });

  it("keeps the read Hours, Insights and Overview make when not told to", async () => {
    await fetchSessionsInRange({ studioId: "solon", startMs: 0 });
    expect(reads.getDocs).toHaveBeenCalledTimes(1);
    expect(reads.getDocsFromServer).not.toHaveBeenCalled();
  });

  it("fails rather than falling back to the cache when the server can't be reached", async () => {
    reads.getDocsFromServer.mockRejectedValueOnce(Object.assign(new Error("offline"), { code: "unavailable" }));
    await expect(fetchSessionsInRange({ studioId: "solon", startMs: 0, fromServer: true })).rejects.toThrow("offline");
    expect(reads.getDocs).not.toHaveBeenCalled();
  });
});
