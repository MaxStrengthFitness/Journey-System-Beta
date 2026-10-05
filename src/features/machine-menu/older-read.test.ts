import { afterEach, describe, expect, it, vi } from "vitest";
import { forgetPersonalMemory } from "../sign-out/memory";
import { averyAll } from "./fixtures";
import {
  OLDER_PAGE,
  hasOlderToRead,
  joinLogsToSessions,
  logsWindowIds,
  newestFirst,
  nextOlderSessionIds,
  olderSetsFor,
  readOlderSets,
  rememberOlderSets,
} from "./older-read";
import type { TimelineLogInput } from "./timeline-model";

const all = averyAll();
/** The session's window: the 30 newest ids (#41–#70; the running session isn't in this list). */
const windowIds = new Set(newestFirst(all.sessions).slice(0, OLDER_PAGE).map((s) => s.id));

afterEach(() => forgetPersonalMemory());

describe("choosing what Load older reads", () => {
  it("orders by the session's own day, newest first, never by when a set was typed", () => {
    const sessions = [
      { id: "a", date: "2026-03-02", sessionNumber: 2 },
      { id: "b", date: "2026-09-02 10:30", sessionNumber: 9 },
      { id: "c", date: "6/1/2026", sessionNumber: 5 },
    ];
    expect(newestFirst(sessions).map((s) => s.id)).toEqual(["b", "c", "a"]);
  });

  it("takes the next 30 sessions whose sets haven't been read, 30 at a time", () => {
    const first = nextOlderSessionIds(all.sessions, windowIds);
    expect(first).toHaveLength(30);
    expect(first[0]).toBe("s-2026-03-13"); // #40, just older than the window (a visit on other machines)
    expect(first.some((id) => windowIds.has(id))).toBe(false);
    const read = new Set([...windowIds, ...first]);
    const second = nextOlderSessionIds(all.sessions, read);
    expect(second).toHaveLength(10);
    expect(hasOlderToRead(all.sessions, new Set([...read, ...second]))).toBe(false);
    expect(hasOlderToRead(all.sessions, read)).toBe(true);
  });

  it("never asks for more than Firestore's 30 in one query", () => {
    expect(nextOlderSessionIds(all.sessions, new Set(), 50)).toHaveLength(30);
    expect(nextOlderSessionIds(all.sessions, new Set(), 5)).toHaveLength(5);
  });
});

describe("the tracker's window: every past column the grid draws has its sets (§F 6)", () => {
  const ids = Array.from({ length: 40 }, (_, i) => `s${40 - i}`); // newest first

  it("gives the past sessions 30 places when nothing is running", () => {
    const w = logsWindowIds(ids, null);
    expect(w.past).toEqual(ids.slice(0, 30));
    expect(w.ids).toEqual(w.past);
  });

  it("gives them 29 when the running session takes the first place, so the query still asks for 30", () => {
    const running = ids[0];
    const w = logsWindowIds(ids, running);
    expect(w.ids).toHaveLength(OLDER_PAGE);
    expect(w.ids[0]).toBe(running);
    expect(w.past).toEqual(ids.slice(1, 30));
    expect(w.past).not.toContain(running);
  });

  it("keeps a running session the sessions list hasn't caught up with, rather than slicing it off the end", () => {
    const w = logsWindowIds(ids, "just-started");
    expect(w.ids[0]).toBe("just-started");
    expect(w.ids).toHaveLength(OLDER_PAGE);
    expect(w.past).toEqual(ids.slice(0, 29));
  });

  it("skips empty and repeated ids, and takes fewer than 30 when there are fewer", () => {
    expect(logsWindowIds(["a", "", null, "b", "a", undefined], "b")).toEqual({ ids: ["b", "a"], past: ["a"] });
    expect(logsWindowIds([], null)).toEqual({ ids: [], past: [] });
  });
});

describe("joining sets to their sessions' days", () => {
  it("gives each set its session's day and drops a set whose session isn't known", () => {
    const logs: TimelineLogInput[] = [
      { sessionId: "s-2026-10-01", machineId: "leg-press", weight: "100", reps: "11" },
      { sessionId: "unknown", machineId: "leg-press", weight: "100", reps: "11" },
    ];
    expect(joinLogsToSessions(logs, all.sessions).map((l) => [l.sessionId, l.day])).toEqual([["s-2026-10-01", "2026-10-01"]]);
  });

  it("filters Start's placeholders by outcome: kept in a finished session, dropped in an unfinished one", () => {
    const sessions = [
      { id: "done", date: "2026-09-01", status: "Completed" },
      { id: "open", date: "2026-09-08", status: "In-Progress" },
    ];
    const logs: TimelineLogInput[] = [
      { sessionId: "done", machineId: "m", weight: "80", outcome: "not_reached" },
      { sessionId: "open", machineId: "m", weight: "80" },
      { sessionId: "open", machineId: "n", weight: "80", reps: "9" },
    ];
    expect(joinLogsToSessions(logs, sessions).map((l) => `${l.sessionId}/${l.machineId}`)).toEqual(["done/m", "open/n"]);
  });
});

describe("readOlderSets: the injected query", () => {
  it("asks once for the next ids and hands back what came", async () => {
    const fetchSets = vi.fn(async (ids: string[]) => all.logs.filter((l) => ids.includes(l.sessionId)));
    const read = await readOlderSets(fetchSets, all.sessions, windowIds);
    expect(fetchSets).toHaveBeenCalledTimes(1);
    expect(fetchSets.mock.calls[0][0]).toHaveLength(30);
    expect(read.ids).toHaveLength(30);
    expect(read.logs.length).toBeGreaterThan(0);
    expect(read.logs.every((l) => read.ids.includes(l.sessionId))).toBe(true);
  });

  it("reads nothing when everything is read, and lets a failure reach the caller", async () => {
    const everything = new Set(all.sessions.map((s) => s.id));
    const none = vi.fn(async () => []);
    expect(await readOlderSets(none, all.sessions, everything)).toEqual({ ids: [], logs: [] });
    expect(none).not.toHaveBeenCalled();
    await expect(readOlderSets(async () => Promise.reject(new Error("offline")), all.sessions, windowIds)).rejects.toThrow("offline");
  });

  it("keeps only the sets of the sessions it asked for", async () => {
    const read = await readOlderSets(async () => all.logs, all.sessions, windowIds);
    expect(read.logs.every((l) => read.ids.includes(l.sessionId))).toBe(true);
  });
});

describe("the per-client memory", () => {
  it("keeps every machine's older sets for the rest of the session, one copy each", () => {
    const logs = all.logs.filter((l) => l.sessionId === "s-2026-03-12");
    rememberOlderSets("avery", { ids: ["s-2026-03-12"], logs });
    rememberOlderSets("avery", { ids: ["s-2026-03-12"], logs });
    const kept = olderSetsFor("avery");
    expect([...kept.ids]).toEqual(["s-2026-03-12"]);
    expect(kept.logs).toHaveLength(logs.length);
    expect(olderSetsFor("someone-else").logs).toEqual([]);
  });

  it("is forgotten at sign-out", () => {
    rememberOlderSets("avery", { ids: ["x"], logs: [] });
    forgetPersonalMemory();
    expect(olderSetsFor("avery").ids.size).toBe(0);
  });
});
