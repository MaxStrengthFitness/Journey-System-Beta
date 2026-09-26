import { describe, expect, it } from "vitest";
import {
  findMyLiveSession,
  isAnotherTrainersSession,
  lastSignOfLife,
  myTrainerIds,
  takeOverPatch,
  liveSessionTabLabel,
  sessionDayWords,
  splitInProgress,
  staleSessionStartedLine,
} from "./live-session";
import { isSessionValid } from "./utils";

const now = Date.now();
const fresh = { lastHeartbeatAt: new Date(now - 30_000) };
const stale = { lastHeartbeatAt: new Date(now - 90 * 60_000) };

describe("the staleness rule (isSessionValid)", () => {
  // A fixed instant, so the boundary is exact rather than racing the clock.
  const at = Date.UTC(2026, 8, 24, 13, 0);
  const minutesAgo = (m: number) => new Date(at - m * 60_000);

  it("calls an In-Progress session live until its heartbeat is 60 minutes old", () => {
    expect(isSessionValid({ status: "In-Progress", lastHeartbeatAt: minutesAgo(59) }, at)).toBe(true);
    expect(isSessionValid({ status: "In-Progress", lastHeartbeatAt: minutesAgo(60) }, at)).toBe(false);
    expect(isSessionValid({ status: "In-Progress", lastHeartbeatAt: minutesAgo(60 * 24) }, at)).toBe(false);
  });

  it("falls back to createdAt when there is no heartbeat", () => {
    expect(isSessionValid({ status: "In-Progress", createdAt: minutesAgo(5) }, at)).toBe(true);
    expect(isSessionValid({ status: "In-Progress", createdAt: minutesAgo(61) }, at)).toBe(false);
  });

  it("the heartbeat outranks an old createdAt — a long session that is still being logged is live", () => {
    expect(
      isSessionValid({ status: "In-Progress", createdAt: minutesAgo(200), lastHeartbeatAt: minutesAgo(2) }, at),
    ).toBe(true);
  });

  it("a session with no clock yet (its server write still pending) reads as live", () => {
    expect(isSessionValid({ status: "In-Progress", lastHeartbeatAt: null, createdAt: null }, at)).toBe(true);
  });

  it("says nothing about sessions that are not In-Progress", () => {
    expect(isSessionValid({ status: "Completed", lastHeartbeatAt: minutesAgo(9999) }, at)).toBe(true);
    expect(isSessionValid(null, at)).toBe(false);
  });
});

describe("splitInProgress — the one answer to 'which session is running?'", () => {
  const at = Date.UTC(2026, 8, 24, 13, 0);
  const minutesAgo = (m: number) => new Date(at - m * 60_000);

  it("the reported bug: yesterday's abandoned session is stale, never live", () => {
    const yesterday = { id: "y", status: "In-Progress", lastHeartbeatAt: minutesAgo(60 * 22) };
    const split = splitInProgress([yesterday], at);
    expect(split.live).toBeNull();
    expect(split.stale.map((s) => s.id)).toEqual(["y"]);
  });

  it("keeps the live session when an abandoned one sits beside it", () => {
    const split = splitInProgress(
      [
        { id: "old", status: "In-Progress", lastHeartbeatAt: minutesAgo(60 * 22) },
        { id: "now", status: "In-Progress", lastHeartbeatAt: minutesAgo(3) },
        { id: "done", status: "Completed", lastHeartbeatAt: minutesAgo(1) },
      ],
      at,
    );
    expect(split.live?.id).toBe("now");
    expect(split.stale.map((s) => s.id)).toEqual(["old"]);
  });

  it("orders by sign of life, newest first, whatever order the stream gave", () => {
    const split = splitInProgress(
      [
        { id: "a", status: "In-Progress", lastHeartbeatAt: minutesAgo(40) },
        { id: "b", status: "In-Progress", lastHeartbeatAt: minutesAgo(10) },
        { id: "s1", status: "In-Progress", lastHeartbeatAt: minutesAgo(60 * 48) },
        { id: "s2", status: "In-Progress", lastHeartbeatAt: minutesAgo(90) },
      ],
      at,
    );
    expect(split.live?.id).toBe("b");
    expect(split.stale.map((s) => s.id)).toEqual(["s2", "s1"]);
  });

  it("a session written a moment ago (clock pending) counts as the newest", () => {
    expect(lastSignOfLife({ lastHeartbeatAt: null, createdAt: null }, at)).toBe(at);
    const split = splitInProgress(
      [
        { id: "earlier", status: "In-Progress", lastHeartbeatAt: minutesAgo(5) },
        { id: "just-started", status: "In-Progress", lastHeartbeatAt: null, createdAt: null },
      ],
      at,
    );
    expect(split.live?.id).toBe("just-started");
  });

  it("nothing In-Progress is nothing at all", () => {
    expect(splitInProgress([{ id: "c", status: "Completed" }], at)).toEqual({ live: null, stale: [] });
    expect(splitInProgress([], at)).toEqual({ live: null, stale: [] });
  });
});

describe("the words for a stale session", () => {
  const today = "2026-09-24";

  it("names the day its sets are recorded under the way a person would", () => {
    expect(sessionDayWords({ date: "2026-09-24" }, today)).toBe("today");
    expect(sessionDayWords({ date: "2026-09-23" }, today)).toBe("yesterday");
    expect(sessionDayWords({ date: "2026-09-21" }, today)).toBe("Mon, Sep 21");
    expect(sessionDayWords({ date: "2025-12-30" }, today)).toBe("Tue, Dec 30, 2025");
  });

  it("yesterday across a month and a year boundary", () => {
    expect(sessionDayWords({ date: "2026-08-31" }, "2026-09-01")).toBe("yesterday");
    expect(sessionDayWords({ date: "2025-12-31" }, "2026-01-01")).toBe("yesterday");
  });

  it("falls back to the start instant when the session has no day, and to nothing at all", () => {
    // 9:04 AM Eastern on Sep 23.
    expect(sessionDayWords({ startTime: new Date("2026-09-23T13:04:00Z") }, today)).toBe("yesterday");
    expect(sessionDayWords({}, today)).toBeNull();
  });

  it("says when and by whom it started, and leaves out what it cannot know", () => {
    expect(
      staleSessionStartedLine(
        { date: "2026-09-23", startTime: new Date("2026-09-23T13:04:00Z"), trainerInitials: "JC" },
        today,
      ),
    ).toBe("Started yesterday at 9:04 AM by JC.");
    expect(staleSessionStartedLine({ date: "2026-09-21", trainerInitials: "JC" }, today)).toBe(
      "Started on Mon, Sep 21 by JC.",
    );
    expect(staleSessionStartedLine({}, today)).toBe("");
  });
});

describe("findMyLiveSession", () => {
  it("returns the caller's own live session regardless of which client is selected", () => {
    const s = findMyLiveSession(
      [
        { id: "a", status: "Completed", trainerId: "t1", clientId: "c1", ...fresh },
        { id: "b", status: "In-Progress", trainerId: "t2", clientId: "c2", ...fresh },
        { id: "c", status: "In-Progress", trainerId: "t1", clientId: "c3", ...fresh },
      ],
      "t1",
    );
    expect(s?.id).toBe("c");
  });

  it("ignores another trainer's session and sessions with a dead heartbeat", () => {
    expect(
      findMyLiveSession(
        [
          { id: "b", status: "In-Progress", trainerId: "t2", clientId: "c2", ...fresh },
          { id: "d", status: "In-Progress", trainerId: "t1", clientId: "c4", ...stale },
        ],
        "t1",
      ),
    ).toBeUndefined();
  });

  it("returns nothing without a trainer", () => {
    expect(findMyLiveSession([{ id: "c", status: "In-Progress", trainerId: "t1", clientId: "c3" }], null)).toBeUndefined();
    expect(findMyLiveSession([{ id: "c", status: "In-Progress", trainerId: "t1", clientId: "c3" }], [])).toBeUndefined();
  });

  it("finds a session recorded under any of the caller's ids (older accounts differ)", () => {
    const s = findMyLiveSession(
      [{ id: "c", status: "In-Progress", trainerId: "uid-1", clientId: "c3", ...fresh }],
      ["t-doc", "uid-1"],
    );
    expect(s?.id).toBe("c");
  });
});

describe("whose session is this (session record, Sep 26 2026)", () => {
  it("collects every id the person's sessions may carry, once each", () => {
    expect(myTrainerIds({ id: "t-doc", authUid: "uid-1", claimedFromId: "placeholder" }, "uid-1")).toEqual([
      "t-doc",
      "uid-1",
      "placeholder",
    ]);
    expect(myTrainerIds(null, "uid-1")).toEqual(["uid-1"]);
    expect(myTrainerIds(undefined, undefined)).toEqual([]);
  });

  it("is another trainer's when someone else runs it", () => {
    expect(isAnotherTrainersSession({ trainerId: "t2" }, ["t1", "uid-1"])).toBe(true);
  });

  it("is mine under any of my ids, from any iPad", () => {
    expect(isAnotherTrainersSession({ trainerId: "t1" }, ["t1", "uid-1"])).toBe(false);
    expect(isAnotherTrainersSession({ trainerId: "uid-1" }, ["t1", "uid-1"])).toBe(false);
  });

  it("never locks anyone out when it cannot tell: no trainer on the session, or no one signed in it knows", () => {
    expect(isAnotherTrainersSession({ trainerId: "" }, ["t1"])).toBe(false);
    expect(isAnotherTrainersSession({}, ["t1"])).toBe(false);
    expect(isAnotherTrainersSession({ trainerId: "t2" }, [])).toBe(false);
    expect(isAnotherTrainersSession(null, ["t1"])).toBe(false);
  });
});

describe("takeOverPatch", () => {
  const me = { id: "t-aj", fullName: "AJ Jurgens", initials: "AJ" };

  it("makes the session the new trainer's and keeps who started it", () => {
    expect(takeOverPatch({ trainerId: "t-jc", startedByTrainerId: "t-jc" }, me)).toEqual({
      trainerId: "t-aj",
      trainerName: "AJ Jurgens",
      trainerInitials: "AJ",
    });
  });

  it("records the starter on a session from before startedByTrainerId", () => {
    expect(takeOverPatch({ trainerId: "t-jc" }, me)).toEqual({
      trainerId: "t-aj",
      trainerName: "AJ Jurgens",
      trainerInitials: "AJ",
      startedByTrainerId: "t-jc",
    });
  });

  it("never replaces the starter on a second take-over", () => {
    expect(takeOverPatch({ trainerId: "t-other", startedByTrainerId: "t-jc" }, me).startedByTrainerId).toBeUndefined();
  });

  it("writes no undefined, which Firestore refuses", () => {
    const patch = takeOverPatch({}, { id: "t-aj" });
    expect(Object.values(patch).every((v) => v !== undefined)).toBe(true);
    expect(patch).toEqual({ trainerId: "t-aj", trainerName: "", trainerInitials: "??" });
  });
});

describe("liveSessionTabLabel", () => {
  it("names the client by first name", () => {
    expect(liveSessionTabLabel({ clientName: "Judy Daus" })).toBe("Session · Judy");
    expect(liveSessionTabLabel({ clientName: "" })).toBe("Active Session");
    expect(liveSessionTabLabel(undefined)).toBe("Start Session");
  });
});
