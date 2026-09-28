/**
 * The nightly marks, read once per studio visit (wave 2 hub): what the engine
 * is handed in each state — only fresh, readable marks speak, and only about
 * the clients they name — and the visit's one read held, let go at sign-out,
 * for another studio or a new studio day.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getDoc } = vi.hoisted(() => ({ getDoc: vi.fn() }));
vi.mock("../../firebase", () => ({ db: { name: "db" } }));
vi.mock("firebase/firestore", () => ({
  doc: (...path: unknown[]) => ({ path: path.slice(1).join("/") }),
  getDoc,
}));

import { forgetPersonalMemory } from "../sign-out/memory";
import { fetchHubMarks, heldHubMarks, hubMarksOf, loadHubMarks, type HubMarksFetch } from "./use-hub-marks";

const NOW = new Date("2026-09-28T13:00:00Z");
const MARKS = { computedAt: new Date("2026-09-28T07:10:00Z"), allStars: [{ clientId: "hamfast", weeksWithVisit: 25, perWeek: 2 }] };
const found = (data: unknown = MARKS, fromCache = false): HubMarksFetch => ({ status: "found", data, fromCache });
const snap = (data: unknown | null, fromCache = false) => ({ exists: () => data !== null, data: () => data, metadata: { fromCache } });

beforeEach(() => {
  getDoc.mockReset();
  forgetPersonalMemory();
});

describe("what the engine is handed", () => {
  it("nothing without a read, or before its answer", () => {
    expect(hubMarksOf(null, false, NOW)).toEqual({ status: "off" });
    expect(hubMarksOf(null, true, NOW)).toEqual({ status: "loading" });
  });

  it("last night's marks: her word, and nothing about anyone they don't name", () => {
    const got = hubMarksOf(found(), true, NOW);
    expect(got.status).toBe("ready");
    expect(got.allStarOf?.("hamfast")).toEqual({ clientId: "hamfast", weeksIn: 25, perWeek: 2 });
    expect(got.allStarOf?.("rosie")).toBeNull();
  });

  it("missing, stale, unreadable or failed: nothing at all", () => {
    expect(hubMarksOf({ status: "none", fromCache: false }, true, NOW)).toEqual({ status: "none" });
    expect(hubMarksOf(found({ ...MARKS, computedAt: new Date("2026-09-20T07:00:00Z") }), true, NOW)).toEqual({ status: "stale" });
    expect(hubMarksOf(found({ allStars: [] }), true, NOW)).toEqual({ status: "unreadable" });
    expect(hubMarksOf({ status: "failed" }, true, NOW)).toEqual({ status: "unreadable" });
  });
});

describe("the read", () => {
  it("is one document by id: studios/{s}/watch/hubMarks", async () => {
    getDoc.mockResolvedValue(snap(MARKS));
    expect(await fetchHubMarks("westlake")).toEqual({ status: "found", data: MARKS, fromCache: false });
    expect(getDoc).toHaveBeenCalledWith({ path: "studios/westlake/watch/hubMarks" });
  });

  it("tells 'none' from a failure, and says when only the cache answered", async () => {
    getDoc.mockResolvedValueOnce(snap(null));
    expect(await fetchHubMarks("westlake")).toEqual({ status: "none", fromCache: false });
    getDoc.mockResolvedValueOnce(snap(MARKS, true));
    expect(await fetchHubMarks("westlake")).toEqual({ status: "found", data: MARKS, fromCache: true });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    getDoc.mockRejectedValueOnce(Object.assign(new Error("no"), { code: "permission-denied" }));
    expect(await fetchHubMarks("westlake")).toEqual({ status: "failed" });
    warn.mockRestore();
  });
});

describe("one read per studio visit", () => {
  it("reads once, and the next visit to the Hub the same day reuses it", async () => {
    getDoc.mockResolvedValue(snap(MARKS));
    const first = await loadHubMarks("westlake", "2026-09-28");
    expect(await loadHubMarks("westlake", "2026-09-28")).toBe(first);
    expect(getDoc).toHaveBeenCalledTimes(1);
  });

  it("holds the server's 'none' for the day, and never a failure or the cache's answer alone", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    getDoc.mockRejectedValueOnce(new Error("unavailable"));
    await loadHubMarks("westlake", "2026-09-28");
    expect(heldHubMarks("westlake", "2026-09-28")).toBeNull();
    getDoc.mockResolvedValueOnce(snap(MARKS, true));
    await loadHubMarks("westlake", "2026-09-28");
    expect(heldHubMarks("westlake", "2026-09-28")).toBeNull();
    getDoc.mockResolvedValueOnce(snap(null));
    await loadHubMarks("westlake", "2026-09-28");
    expect(heldHubMarks("westlake", "2026-09-28")).toEqual({ status: "none", fromCache: false });
    warn.mockRestore();
  });

  it("reads again for another studio or a new studio day, and forgets at sign-out", async () => {
    getDoc.mockResolvedValue(snap(MARKS));
    await loadHubMarks("westlake", "2026-09-28");
    await loadHubMarks("westlake", "2026-09-29");
    await loadHubMarks("solon", "2026-09-29");
    expect(getDoc).toHaveBeenCalledTimes(3);
    expect(heldHubMarks("westlake", "2026-09-29")).toBeNull();
    forgetPersonalMemory();
    expect(heldHubMarks("solon", "2026-09-29")).toBeNull();
  });
});
