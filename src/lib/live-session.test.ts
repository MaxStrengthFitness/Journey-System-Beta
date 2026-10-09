import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  LIVE_SESSION_KEY,
  findMyLiveSession,
  isAnotherTrainersSession,
  isOpenSession,
  lastSignOfLife,
  myTrainerIds,
  openSessionElsewhereWords,
  ownSessionName,
  pickOpenSession,
  rememberedTarget,
  resumeSession,
  resumeTarget,
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
    // Ordinary capitalisation since the bar stopped drawing capitals (type
    // and depth, Oct 4 2026), as every Start session button says it.
    expect(liveSessionTabLabel(undefined)).toBe("Start session");
  });
});

/* ------------------------------------------------------------------ *
 * The open session's way back (the open session round, Oct 9 2026)
 * ------------------------------------------------------------------ */

describe("an open session is found and brought back (Oct 9 2026)", () => {
  const openMine = { id: "o1", status: "In-Progress", trainerId: "t1", isUnassigned: true, ...fresh };

  it("isOpenSession: no client yet, and only while unassigned", () => {
    expect(isOpenSession(openMine)).toBe(true);
    expect(isOpenSession({ ...openMine, clientId: "c1" })).toBe(false);
    expect(isOpenSession({ id: "x", status: "In-Progress", trainerId: "t1" })).toBe(false);
    expect(isOpenSession(null)).toBe(false);
  });

  it("findMyLiveSession finds this trainer's own open session, so the Session tab appears", () => {
    expect(findMyLiveSession([openMine], "t1")?.id).toBe("o1");
    // Another trainer's open session is not mine, and an abandoned one is not live.
    expect(findMyLiveSession([{ ...openMine, trainerId: "t2" }], "t1")).toBeUndefined();
    expect(findMyLiveSession([{ ...openMine, ...stale }], "t1")).toBeUndefined();
    // A session with neither a client nor the open mark is still left out.
    expect(findMyLiveSession([{ id: "z", status: "In-Progress", trainerId: "t1", ...fresh }], "t1")).toBeUndefined();
  });

  it("the tab says Open session for it", () => {
    expect(liveSessionTabLabel(openMine)).toBe("Open session");
  });

  it("resumeTarget: the tab takes the trainer back into the open session, with no client", () => {
    expect(resumeTarget({ selectedHasSession: false, selectedClientId: null, mine: openMine })).toEqual({
      kind: "open",
      sessionId: "o1",
    });
    // Even from a client's profile with no session of hers running.
    expect(resumeTarget({ selectedHasSession: false, selectedClientId: "c9", mine: openMine })).toEqual({
      kind: "open",
      sessionId: "o1",
    });
  });

  it("resumeTarget keeps the client sessions' answers", () => {
    const clientMine = { id: "s1", status: "In-Progress", trainerId: "t1", clientId: "c1", ...fresh };
    expect(resumeTarget({ selectedHasSession: true, selectedClientId: "c1", mine: openMine })).toEqual({ kind: "here" });
    expect(resumeTarget({ selectedHasSession: false, selectedClientId: "c9", mine: undefined })).toEqual({ kind: "here" });
    expect(resumeTarget({ selectedHasSession: false, selectedClientId: null, mine: clientMine })).toEqual({
      kind: "client",
      clientId: "c1",
    });
    expect(resumeTarget({ selectedHasSession: false, selectedClientId: null, mine: undefined })).toEqual({ kind: "device" });
  });

  it("rememberedTarget follows a live open session the device remembered, and nothing stale", () => {
    expect(rememberedTarget("o1", openMine)).toEqual({ kind: "open", sessionId: "o1" });
    expect(rememberedTarget("s1", { status: "In-Progress", clientId: "c1", ...fresh })).toEqual({
      kind: "client",
      clientId: "c1",
    });
    expect(rememberedTarget("o1", { ...openMine, ...stale })).toBeNull();
    expect(rememberedTarget("o1", { ...openMine, status: "Completed" })).toBeNull();
    expect(rememberedTarget("o1", null)).toBeNull();
    expect(rememberedTarget("z", { status: "In-Progress", ...fresh })).toBeNull();
  });

  it("rememberedTarget: an open session at another studio is elsewhere, said and not followed", () => {
    const atSolon = { ...openMine, hostedAtStudioId: "solon" };
    expect(rememberedTarget("o1", atSolon, { activeStudioId: "solon" })).toEqual({ kind: "open", sessionId: "o1" });
    expect(rememberedTarget("o1", atSolon, { activeStudioId: "westlake" })).toEqual({
      kind: "elsewhere",
      studioId: "solon",
    });
    // A client's session is read by its client, from any studio.
    expect(
      rememberedTarget("s1", { status: "In-Progress", clientId: "c1", hostedAtStudioId: "solon", ...fresh }, { activeStudioId: "westlake" }),
    ).toEqual({ kind: "client", clientId: "c1" });
    expect(openSessionElsewhereWords("Solon")).toBe("Your open session is at Solon. Switch to Solon to go back to it.");
    expect(openSessionElsewhereWords(null)).toContain("another studio");
  });

  it("ownSessionName: what sign-out and the new-version line are given", () => {
    expect(ownSessionName(undefined)).toBeNull();
    // An open session has no client: "" is "your open session" in both sentences.
    expect(ownSessionName(openMine)).toBe("");
    expect(ownSessionName({ ...openMine, isUnassigned: false, clientId: "c1", clientName: " Jane Doe " })).toBe("Jane Doe");
    expect(ownSessionName({ ...openMine, isUnassigned: false, clientId: "c1" })).toBe("a client");
  });
});

describe("resumeSession: the Session tab, wired (Oct 9 2026)", () => {
  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const openMine = { id: "o1", status: "In-Progress", trainerId: "t1", isUnassigned: true, ...fresh };
  const base = { selectedHasSession: false, selectedClientId: null, mine: undefined, activeStudioId: "solon", rememberedId: null, now };
  function moves(read: Record<string, unknown> | null = null) {
    const calls: string[] = [];
    return {
      calls,
      io: {
        readSession: vi.fn(async () => read as never),
        selectClient: (id: string | null) => void calls.push(`select:${id}`),
        show: (view: string) => void calls.push(`show:${view}`),
        elsewhere: (studioId: string) => void calls.push(`elsewhere:${studioId}`),
      },
    };
  }

  it("the stream's open session: the device is pointed at it, no client is selected, then the session shows", async () => {
    store.set(LIVE_SESSION_KEY, "o-old");
    const m = moves();
    await resumeSession({ ...base, mine: openMine }, m.io);
    expect(store.get(LIVE_SESSION_KEY)).toBe("o1");
    expect(m.calls).toEqual(["select:null", "show:workouts"]);
    expect(m.io.readSession).not.toHaveBeenCalled();
  });

  it("the stream's client session selects the client", async () => {
    const m = moves();
    await resumeSession({ ...base, mine: { id: "s1", status: "In-Progress", trainerId: "t1", clientId: "c1", ...fresh } }, m.io);
    expect(m.calls).toEqual(["select:c1", "show:workouts"]);
  });

  it("nothing in the stream: the remembered open session, read by its id, is followed while live and here", async () => {
    store.set(LIVE_SESSION_KEY, "o1");
    const m = moves({ ...openMine, hostedAtStudioId: "solon" });
    await resumeSession({ ...base, rememberedId: "o1" }, m.io);
    expect(m.io.readSession).toHaveBeenCalledWith("o1");
    expect(m.calls).toEqual(["select:null", "show:workouts"]);
    expect(store.get(LIVE_SESSION_KEY)).toBe("o1");
  });

  it("an abandoned remembered session is forgotten, never followed", async () => {
    store.set(LIVE_SESSION_KEY, "o1");
    const m = moves({ ...openMine, ...stale, hostedAtStudioId: "solon" });
    await resumeSession({ ...base, rememberedId: "o1" }, m.io);
    expect(m.calls).toEqual(["show:client-directory"]);
    expect(store.has(LIVE_SESSION_KEY)).toBe(false);
  });

  it("a remembered open session at another studio is said and kept, and the Directory opens", async () => {
    store.set(LIVE_SESSION_KEY, "o1");
    const m = moves({ ...openMine, hostedAtStudioId: "westlake" });
    await resumeSession({ ...base, rememberedId: "o1" }, m.io);
    expect(m.calls).toEqual(["elsewhere:westlake", "show:client-directory"]);
    expect(store.get(LIVE_SESSION_KEY)).toBe("o1");
  });

  it("a read that fails changes nothing on the device; the client on screen stays", async () => {
    store.set(LIVE_SESSION_KEY, "o1");
    const m = moves();
    m.io.readSession.mockRejectedValueOnce(new Error("offline"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    await resumeSession({ ...base, rememberedId: "o1", selectedClientId: "c9" }, m.io);
    expect(m.calls).toEqual(["show:workouts"]);
    expect(store.get(LIVE_SESSION_KEY)).toBe("o1");
  });
});

describe("pickOpenSession: which open session this iPad records (Oct 9 2026)", () => {
  const at = (minsAgo: number) => ({ lastHeartbeatAt: new Date(now - minsAgo * 60_000) });
  const old = { id: "old", status: "In-Progress", trainerId: "t1", isUnassigned: true, ...at(20) };
  const just = { id: "new", status: "In-Progress", trainerId: "t1", isUnassigned: true, ...at(0) };
  const theirs = { id: "theirs", status: "In-Progress", trainerId: "t2", isUnassigned: true, ...at(1) };

  it("the one the device remembers wins over an older one the stream lists first (a second Open session)", () => {
    expect(pickOpenSession([old, just], { myIds: ["t1"], rememberedId: "new", now }).mine?.id).toBe("new");
  });

  it("the one on screen stays on screen", () => {
    expect(pickOpenSession([old, just], { myIds: ["t1"], onScreenId: "old", rememberedId: "new", now }).mine?.id).toBe("old");
  });

  it("with nothing remembered, the newest live one of mine", () => {
    expect(pickOpenSession([old, just], { myIds: ["t1"], now }).mine?.id).toBe("new");
  });

  it("an abandoned one of mine is never taken up without asking (Sep 24 2026), even remembered", () => {
    // It used to be mine when it was all there was, so a refused Start, or an
    // Assign with an old one left over, put typed sets into yesterday's session.
    const abandoned = { ...old, ...stale };
    // It comes back as `stale`, so the Active Session can ask (the whole-branch review, Oct 9 2026).
    expect(pickOpenSession([abandoned], { myIds: ["t1"], now })).toEqual({ mine: null, watch: null, stale: abandoned });
    expect(pickOpenSession([abandoned], { myIds: ["t1"], rememberedId: "old", now })).toEqual({ mine: null, watch: null, stale: abandoned });
    // Beside another trainer's, it is not the one watched either.
    expect(pickOpenSession([abandoned, theirs], { myIds: ["t1"], now })).toEqual({ mine: null, watch: theirs, stale: abandoned });
    // The one on screen stays, however long its pause.
    expect(pickOpenSession([abandoned], { myIds: ["t1"], onScreenId: "old", now }).mine?.id).toBe("old");
  });

  it("another trainer's is watched, never recorded; one being taken over here is mine", () => {
    expect(pickOpenSession([theirs], { myIds: ["t1"], now })).toEqual({ mine: null, watch: theirs, stale: null });
    expect(pickOpenSession([theirs], { myIds: ["t1"], settlingId: "theirs", now }).mine?.id).toBe("theirs");
    // A remembered id never makes another trainer's session mine.
    expect(pickOpenSession([theirs], { myIds: ["t1"], rememberedId: "theirs", now }).mine).toBeNull();
  });

  it("a stale one is raised only when nothing of mine is live, and never another trainer's", () => {
    const abandoned = { ...old, ...stale };
    // A live one of mine is recorded; the stale one is not raised beside it.
    expect(pickOpenSession([abandoned, just], { myIds: ["t1"], now })).toEqual({ mine: just, watch: null, stale: null });
    // Another trainer's abandoned open session is not mine to be asked about.
    expect(pickOpenSession([{ ...theirs, ...stale }], { myIds: ["t1"], now }).stale).toBeNull();
  });

  it("watching: the one on screen first (it was taken over elsewhere), else the first", () => {
    const other = { ...theirs, id: "theirs-2" };
    expect(pickOpenSession([theirs, other], { myIds: ["t1"], onScreenId: "theirs-2", now }).watch?.id).toBe("theirs-2");
    expect(pickOpenSession([], { myIds: ["t1"], now })).toEqual({ mine: null, watch: null, stale: null });
  });
});
