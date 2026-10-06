import { describe, expect, it } from "vitest";
import type { Client, ScheduleEntry } from "../types";
import {
  rosterFromSnapshot,
  MISSING_RECHECK_MS,
  VISITOR_STALE_MS,
  bookedClientIds,
  chunk,
  isPermissionError,
  isQuotaError,
  STUDIO_ROSTER_LIMIT,
  mergeRoster,
  rosterCutWords,
  rosterIsCut,
  visitorIdsToFetch,
} from "./studio-roster";

const booking = (clientId: unknown) => ({ id: `b-${String(clientId)}`, clientId }) as unknown as ScheduleEntry;
const client = (id: string, extra: Partial<Client> = {}) => ({ id, firstName: id, ...extra }) as Client;
const empty = () => ({ fetchedAt: new Map<string, number>(), missingAt: new Map<string, number>(), inFlight: new Set<string>() });

describe("bookedClientIds", () => {
  it("keeps each named client once, trimmed, and skips bookings with no client", () => {
    const ids = bookedClientIds([booking("100"), booking(" 100 "), booking(null), booking(""), booking(200)]);
    expect(ids).toEqual(["100", "200"]);
  });
});

describe("visitorIdsToFetch", () => {
  const NOW = 1_000_000_000;

  it("never reads a client the studio listener already holds", () => {
    expect(visitorIdsToFetch(["a", "b", "c"], new Set(["a", "c"]), empty(), NOW)).toEqual(["b"]);
  });

  it("does not re-read a visitor read recently, and does once it goes stale", () => {
    const state = empty();
    state.fetchedAt.set("v", NOW - 1000);
    expect(visitorIdsToFetch(["v"], new Set(), state, NOW)).toEqual([]);
    state.fetchedAt.set("v", NOW - VISITOR_STALE_MS - 1);
    expect(visitorIdsToFetch(["v"], new Set(), state, NOW)).toEqual(["v"]);
  });

  it("asks about a missing client again only after the recheck period", () => {
    const state = empty();
    state.missingAt.set("m", NOW - 1000);
    expect(visitorIdsToFetch(["m"], new Set(), state, NOW)).toEqual([]);
    state.missingAt.set("m", NOW - MISSING_RECHECK_MS - 1);
    expect(visitorIdsToFetch(["m"], new Set(), state, NOW)).toEqual(["m"]);
  });

  it("skips ids already being read, and caps one pass", () => {
    const state = empty();
    state.inFlight.add("x");
    expect(visitorIdsToFetch(["x", "y"], new Set(), state, NOW)).toEqual(["y"]);
    const many = Array.from({ length: 50 }, (_, i) => `id${i}`);
    expect(visitorIdsToFetch(many, new Set(), empty(), NOW, 12)).toHaveLength(12);
  });
});

describe("chunk", () => {
  it("splits into query-sized pieces", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 10)).toEqual([]);
  });
});

describe("mergeRoster", () => {
  it("adds visitors the studio does not hold, and the studio's copy wins", () => {
    const merged = mergeRoster(
      [client("a", { nickname: "live" }), client("b")],
      [client("a", { nickname: "fetched" }), client("v")],
    );
    expect(merged.map((c) => c.id).sort()).toEqual(["a", "b", "v"]);
    expect(merged.find((c) => c.id === "a")?.nickname).toBe("live");
  });
});

describe("error shapes", () => {
  it("recognises quota and permission errors by code or message", () => {
    expect(isQuotaError({ code: "resource-exhausted" })).toBe(true);
    expect(isQuotaError(new Error("Quota exceeded."))).toBe(true);
    expect(isQuotaError(new Error("nope"))).toBe(false);
    expect(isPermissionError({ code: "permission-denied" })).toBe(true);
    expect(isPermissionError(new Error("Missing or insufficient permissions."))).toBe(true);
    expect(isPermissionError(null)).toBe(false);
  });
});

describe("the roster's cut (hub fixes, Oct 1 2026): never silent", () => {
  it("is cut only at the limit", () => {
    expect(rosterIsCut(STUDIO_ROSTER_LIMIT - 1)).toBe(false);
    expect(rosterIsCut(STUDIO_ROSTER_LIMIT)).toBe(true);
    expect(rosterIsCut(0)).toBe(false);
    expect(rosterIsCut(Number.NaN)).toBe(false);
  });

  it("says so in words, with the number", () => {
    expect(rosterCutWords()).toBe("This studio has more than 1,500 clients on file, and this list holds 1,500 of them. Search by name finds anyone it's missing.");
  });
});
describe("rosterFromSnapshot", () => {
  const docsOf = (rows: Array<{ id: string; firstName: string }>) =>
    rows.map(({ id, ...data }) => ({ id, data: () => data }));
  const first = rosterFromSnapshot(docsOf([{ id: "a", firstName: "Ann" }, { id: "b", firstName: "Bea" }]), null, new Map(), []);

  it("converts every document on the first answer", () => {
    expect(first.list.map((c) => [c.id, c.firstName])).toEqual([["a", "Ann"], ["b", "Bea"]]);
  });

  it("rebuilds only the documents the snapshot changed, in the snapshot's order", () => {
    const next = rosterFromSnapshot(docsOf([{ id: "a", firstName: "Ann" }, { id: "b", firstName: "Beatrice" }, { id: "c", firstName: "Cy" }]), new Set(["b", "c"]), first.byId, first.list);
    expect(next.list[0]).toBe(first.list[0]);
    expect(next.list[1]).not.toBe(first.list[1]);
    expect(next.list.map((c) => c.firstName)).toEqual(["Ann", "Beatrice", "Cy"]);
  });

  it("drops a removed document, and gives back the same list when nothing changed", () => {
    const removed = rosterFromSnapshot(docsOf([{ id: "b", firstName: "Bea" }]), new Set(["a"]), first.byId, first.list);
    expect(removed.list.map((c) => c.id)).toEqual(["b"]);
    expect(removed.list[0]).toBe(first.list[1]);
    const same = rosterFromSnapshot(docsOf([{ id: "a", firstName: "Ann" }, { id: "b", firstName: "Bea" }]), new Set(), first.byId, first.list);
    expect(same.list).toBe(first.list);
  });

  it("never reuses a client it has not held (a new document in a change list it wasn't named in)", () => {
    const next = rosterFromSnapshot(docsOf([{ id: "z", firstName: "Zed" }]), new Set(), first.byId, first.list);
    expect(next.list[0].firstName).toBe("Zed");
  });
});
