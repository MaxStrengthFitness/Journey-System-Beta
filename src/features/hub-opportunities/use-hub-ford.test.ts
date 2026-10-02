/**
 * The Hub's FORD, read once per studio visit (wave 2 hub): what the engine is
 * handed in each state, the visit's one read held (and let go at sign-out,
 * for another studio or a new studio day), and the window's instants at the
 * studio's midnights. Run with TZ=America/New_York (it passes in any zone).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FordEntry } from "../ford/types";
import type { HubFordRead, HubFordWindow } from "../ford/hub-read";

const { fetchHubFord } = vi.hoisted(() => ({
  fetchHubFord: vi.fn<(studioId: string, window: HubFordWindow) => Promise<HubFordRead>>(),
}));
vi.mock("../ford/hub-read", () => ({ fetchHubFord }));

import { forgetPersonalMemory } from "../sign-out/memory";
import { heldHubFord, hubFordOf, hubFordWindow, loadHubFord } from "./use-hub-ford";

const detail = (id: string, clientId: string): FordEntry => ({ id, clientId, studioId: "westlake", body: `Detail ${id}` }) as FordEntry;
const ready = (details: FordEntry[], over: Partial<HubFordRead> = {}): HubFordRead => ({ status: "ready", details, fromCache: false, ...over }) as HubFordRead;

beforeEach(() => {
  fetchHubFord.mockReset();
  forgetPersonalMemory();
});

describe("what the engine is handed", () => {
  it("nothing at all when there is no read to make, or no answer yet", () => {
    expect(hubFordOf(null, false)).toEqual({ status: "off" });
    expect(hubFordOf(null, true)).toEqual({ status: "loading" });
  });

  it("a read answer: each client's own details, and [] for a client with none", () => {
    const got = hubFordOf(ready([detail("f1", "hamfast"), detail("f2", "hamfast"), detail("f3", "rosie")]), true);
    expect(got.status).toBe("ready");
    expect(got.fordFor?.("hamfast")?.map((e) => e.id)).toEqual(["f1", "f2"]);
    expect(got.fordFor?.("melilot")).toEqual([]);
  });

  it("a partial answer: what was read is real, silence is unknown", () => {
    const got = hubFordOf(ready([detail("f1", "hamfast")], { status: "partial" }), true);
    expect(got.fordFor?.("hamfast")).toHaveLength(1);
    expect(got.fordFor?.("melilot")).toBeNull();
  });

  it("a failed read: every client unknown, never 'nothing to ask about'", () => {
    const got = hubFordOf({ status: "failed", details: [], fromCache: false }, true);
    expect(got.status).toBe("failed");
    expect(got.fordFor?.("hamfast")).toBeNull();
  });

  it("a refused read: FORD is another studio's to read, so nothing is said either way", () => {
    expect(hubFordOf({ status: "denied", details: [], fromCache: false }, true)).toEqual({ status: "off" });
  });
});

describe("one read per studio visit", () => {
  it("reads once, and the next visit to the Hub the same day reuses it", async () => {
    fetchHubFord.mockResolvedValue(ready([detail("f1", "hamfast")]));
    const first = await loadHubFord("westlake", "2026-09-28");
    const again = await loadHubFord("westlake", "2026-09-28");
    expect(again).toBe(first);
    expect(fetchHubFord).toHaveBeenCalledTimes(1);
    expect(heldHubFord("westlake", "2026-09-28")).toBe(first);
  });

  it("shares a read already on its way", async () => {
    fetchHubFord.mockResolvedValue(ready([]));
    await Promise.all([loadHubFord("westlake", "2026-09-28"), loadHubFord("westlake", "2026-09-28")]);
    expect(fetchHubFord).toHaveBeenCalledTimes(1);
  });

  it("reads again for another studio, or a new studio day, holding only the newest visit", async () => {
    fetchHubFord.mockResolvedValue(ready([]));
    await loadHubFord("westlake", "2026-09-28");
    await loadHubFord("solon", "2026-09-28");
    await loadHubFord("solon", "2026-09-29");
    expect(fetchHubFord.mock.calls.map(([s]) => s)).toEqual(["westlake", "solon", "solon"]);
    expect(heldHubFord("westlake", "2026-09-28")).toBeNull();
    expect(heldHubFord("solon", "2026-09-29")).not.toBeNull();
  });

  it("never holds a failure, or an answer this iPad's cache gave alone: the next visit asks again", async () => {
    fetchHubFord.mockResolvedValueOnce({ status: "failed", details: [], fromCache: false });
    fetchHubFord.mockResolvedValueOnce(ready([], { fromCache: true }));
    fetchHubFord.mockResolvedValueOnce(ready([]));
    await loadHubFord("westlake", "2026-09-28");
    expect(heldHubFord("westlake", "2026-09-28")).toBeNull();
    await loadHubFord("westlake", "2026-09-28");
    expect(heldHubFord("westlake", "2026-09-28")).toBeNull();
    await loadHubFord("westlake", "2026-09-28");
    expect(heldHubFord("westlake", "2026-09-28")).not.toBeNull();
    expect(fetchHubFord).toHaveBeenCalledTimes(3);
  });

  it("forgets the visit at sign-out, and never holds a read that lands after it for the next person", async () => {
    fetchHubFord.mockResolvedValue(ready([detail("f1", "hamfast")]));
    await loadHubFord("westlake", "2026-09-28");
    forgetPersonalMemory();
    expect(heldHubFord("westlake", "2026-09-28")).toBeNull();

    let land: (r: HubFordRead) => void = () => {};
    fetchHubFord.mockReturnValueOnce(new Promise<HubFordRead>((r) => (land = r)));
    const pending = loadHubFord("westlake", "2026-09-28");
    forgetPersonalMemory();
    land(ready([detail("f1", "hamfast")]));
    await pending;
    expect(heldHubFord("westlake", "2026-09-28")).toBeNull();
  });
});

describe("the window, at the studio's midnights", () => {
  it("asks between Eastern midnights, whatever the iPad's zone", () => {
    const w = hubFordWindow("2026-09-28");
    expect(w.datedFrom.toISOString()).toBe("2026-09-20T04:00:00.000Z");
    expect(w.datedUntil.toISOString()).toBe("2026-10-12T04:00:00.000Z");
    expect(w.notedFrom.toISOString()).toBe("2026-09-14T04:00:00.000Z");
    expect(w.followUpFrom?.toISOString()).toBe("2026-07-30T04:00:00.000Z");
  });
});
