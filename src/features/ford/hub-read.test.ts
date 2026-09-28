/**
 * The Hub's one FORD read (wave 2 hub): the query's exact shape — ONE
 * collection group query, the studio on every branch, the three reasons and
 * the guard rail — and what an answer is: whole, partial at the guard, from
 * this iPad's cache, failed or refused. Never an empty list for a failure.
 * The rules half is tests/firestore.rules.test.ts, "wave 2 hub".
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Node = { op: string; args: unknown[] };
const { getDocs } = vi.hoisted(() => ({ getDocs: vi.fn() }));
vi.mock("../../firebase", () => ({ db: { name: "db" } }));
vi.mock("firebase/firestore", () => {
  const node = (op: string) => (...args: unknown[]): Node => ({ op, args });
  return {
    collectionGroup: node("collectionGroup"),
    query: node("query"),
    where: node("where"),
    and: node("and"),
    or: node("or"),
    limit: node("limit"),
    getDocs,
  };
});

import { HUB_FORD_GUARD, fetchHubFord, hubFordQuery, type HubFordWindow } from "./hub-read";

const WINDOW: HubFordWindow = {
  datedFrom: new Date("2026-09-27T04:00:00Z"),
  datedUntil: new Date("2026-10-12T04:00:00Z"),
  notedFrom: new Date("2026-09-14T04:00:00Z"),
};

const docs = (n: number, fromCache = false) => ({
  docs: Array.from({ length: n }, (_, i) => ({ id: `f${i}`, data: () => ({ clientId: `c${i}`, studioId: "westlake", body: `Detail ${i}` }) })),
  metadata: { fromCache },
});

beforeEach(() => getDocs.mockReset());

describe("the query", () => {
  it("is one collection group query: the studio, then the three reasons, capped at the guard rail", () => {
    const q = hubFordQuery("westlake", WINDOW) as unknown as Node;
    expect(q.op).toBe("query");
    const [source, filter, cap] = q.args as Node[];
    expect(source).toEqual({ op: "collectionGroup", args: [{ name: "db" }, "ford"] });
    expect(cap).toEqual({ op: "limit", args: [HUB_FORD_GUARD] });
    expect(filter.op).toBe("and");
    const [studio, reasons] = filter.args as Node[];
    expect(studio).toEqual({ op: "where", args: ["studioId", "==", "westlake"] });
    expect(reasons.op).toBe("or");
    expect(reasons.args).toEqual([
      { op: "where", args: ["recurrence", "==", "annual"] },
      {
        op: "and",
        args: [
          { op: "where", args: ["eventDate", ">=", WINDOW.datedFrom] },
          { op: "where", args: ["eventDate", "<", WINDOW.datedUntil] },
        ],
      },
      { op: "where", args: ["occurredAt", ">=", WINDOW.notedFrom] },
    ]);
  });
});

describe("the answer", () => {
  it("is the details with their document ids, whole below the guard rail", async () => {
    getDocs.mockResolvedValue(docs(3));
    const read = await fetchHubFord("westlake", WINDOW);
    expect(read.status).toBe("ready");
    expect(read.details.map((d) => [d.id, d.clientId])).toEqual([
      ["f0", "c0"],
      ["f1", "c1"],
      ["f2", "c2"],
    ]);
    expect(read.fromCache).toBe(false);
  });

  it("is partial at the guard rail, and says when only this iPad's cache answered", async () => {
    getDocs.mockResolvedValue(docs(HUB_FORD_GUARD, true));
    const read = await fetchHubFord("westlake", WINDOW);
    expect(read.status).toBe("partial");
    expect(read.fromCache).toBe(true);
  });

  it("is 'failed' or 'denied', never an empty list that looks like an answer", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    getDocs.mockRejectedValueOnce(Object.assign(new Error("unavailable"), { code: "unavailable" }));
    expect(await fetchHubFord("westlake", WINDOW)).toEqual({ status: "failed", details: [], fromCache: false });
    getDocs.mockRejectedValueOnce(Object.assign(new Error("no"), { code: "permission-denied" }));
    expect((await fetchHubFord("westlake", WINDOW)).status).toBe("denied");
    warn.mockRestore();
  });
});
