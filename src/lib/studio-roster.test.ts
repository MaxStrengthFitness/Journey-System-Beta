import { describe, expect, it } from "vitest";
import type { Client, ScheduleEntry } from "../types";
import {
  MISSING_RECHECK_MS,
  VISITOR_STALE_MS,
  bookedClientIds,
  chunk,
  isPermissionError,
  isQuotaError,
  mergeRoster,
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
