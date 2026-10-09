// @vitest-environment jsdom
/**
 * THE OPEN SESSION'S START NEVER WAITS (the open session round, Oct 9 2026;
 * finding 2 of docs/rounds/2026-10-09-open-session.md).
 *
 * The Client Directory's Open session awaited `addDoc`, then one `setDoc` per
 * seeded machine, before the screen moved: offline it never moved, and a
 * second tap made a second session. Here the database never answers a write
 * (the iPad offline), and the screen must move anyway, with ONE write issued.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const fs = vi.hoisted(() => ({
  writes: [] as { path: string; data: Record<string, unknown> }[],
  answer: "never" as "never" | "refuse",
  refuse: null as null | ((e: unknown) => void),
  autoId: 0,
  /** The iPad's own copy of a session, by id (getDocFromCache). */
  cached: {} as Record<string, Record<string, unknown>>,
}));

vi.mock("../firebase", () => ({ db: {}, auth: { currentUser: { uid: "uid-coach" } } }));
vi.mock("firebase/firestore", () => ({
  collection: (_db: unknown, path: string) => ({ __path: path }),
  doc: (first: { __path?: string }, ...parts: string[]) => {
    if (first && typeof first.__path === "string" && parts.length === 0) {
      const id = `auto-${++fs.autoId}`;
      return { __path: `${first.__path}/${id}`, id };
    }
    return { __path: parts.join("/"), id: parts[parts.length - 1] };
  },
  setDoc: (ref: { __path: string }, data: Record<string, unknown>) => {
    fs.writes.push({ path: ref.__path, data });
    return new Promise<void>((_, refuse) => {
      if (fs.answer === "refuse") fs.refuse = refuse;
    });
  },
  addDoc: (coll: { __path: string }, data: Record<string, unknown>) => {
    fs.writes.push({ path: `${coll.__path}/added`, data });
    return new Promise(() => {});
  },
  updateDoc: () => new Promise(() => {}),
  getDocFromCache: (ref: { __path: string; id: string }) => {
    const data = fs.cached[ref.id];
    return data
      ? Promise.resolve({ id: ref.id, exists: () => true, data: () => data })
      : Promise.reject(Object.assign(new Error("not in the cache"), { code: "unavailable" }));
  },
  writeBatch: () => {
    throw new Error("Start is one setDoc");
  },
  serverTimestamp: () => ({ __server: true }),
}));

import { useClientMutations } from "./useClientMutations";
import { LIVE_SESSION_KEY, type LiveSessionLike } from "../lib/live-session";
import {
  OPEN_SESSION_GUARD_MS,
  declineStaleOpenSession,
  onOpenSessionRefused,
} from "../features/open-session/start";
import { forgetPersonalMemory } from "../features/sign-out/memory";
import type { Trainer } from "../types";

const trainer = {
  id: "t-doc",
  authUid: "uid-coach",
  fullName: "Jane Coach",
  initials: "JC",
  primaryHomeStudioId: "solon",
} as unknown as Trainer;

let api: ReturnType<typeof useClientMutations>;
const setSelectedClientId = vi.fn();
const setCurrentView = vi.fn();
const onRefused = vi.fn();

const NO_SESSIONS: LiveSessionLike[] = [];

function Probe({ studio = "westlake" as string | null, sessions = NO_SESSIONS }) {
  api = useClientMutations({
    authTrainer: trainer,
    uid: "uid-coach",
    activeStudioId: studio,
    sessions,
    setSelectedClientId,
    setCurrentView,
    onRefused,
  });
  return null;
}

let root: Root;
beforeEach(() => {
  fs.writes = [];
  fs.answer = "never";
  fs.refuse = null;
  fs.autoId = 0;
  fs.cached = {};
  forgetPersonalMemory();
  setSelectedClientId.mockClear();
  setCurrentView.mockClear();
  onRefused.mockClear();
  localStorage.clear();
  vi.spyOn(console, "error").mockImplementation(() => {});
  root = createRoot(document.createElement("div"));
  act(() => root.render(<Probe />));
});
afterEach(() => {
  act(() => root.unmount());
  vi.restoreAllMocks();
});

describe("Open session's Start (the open session round, Oct 9 2026)", () => {
  it("issues ONE write and moves the screen in the same tap, though the database never answers", () => {
    act(() => api.startOpenSession());
    expect(fs.writes).toHaveLength(1);
    expect(fs.writes[0].path).toBe("sessions/auto-1");
    // The screen moved, with no client: nothing waited on the write.
    expect(setSelectedClientId).toHaveBeenCalledWith(null);
    expect(setCurrentView).toHaveBeenCalledWith("workouts");
  });

  it("seeds no sets and no ghost weight: nothing is written to exerciseLogs", () => {
    act(() => api.startOpenSession());
    expect(fs.writes.some((w) => w.path.startsWith("exerciseLogs"))).toBe(false);
    expect(fs.writes[0].data).toMatchObject({ sessionMachineIds: [] });
  });

  it("writes the session a client Start would, with no client, at this iPad's studio", () => {
    act(() => api.startOpenSession());
    expect(fs.writes[0].data).toMatchObject({
      isUnassigned: true,
      status: "In-Progress",
      hostedAtStudioId: "westlake",
      trainerId: "t-doc",
      trainerInitials: "JC",
      trainerName: "Jane Coach",
      startedByTrainerId: "t-doc",
      lastHeartbeatAt: { __server: true },
    });
    expect(typeof fs.writes[0].data.clientStartTime).toBe("string");
  });

  it("is remembered by the device, so the Session tab can bring the trainer back", () => {
    act(() => api.startOpenSession());
    expect(localStorage.getItem(LIVE_SESSION_KEY)).toBe("auto-1");
  });

  it("a second tap makes no second session: it opens the one just started", () => {
    act(() => api.startOpenSession());
    act(() => api.startOpenSession());
    expect(fs.writes).toHaveLength(1);
    expect(setCurrentView).toHaveBeenCalledTimes(2);
    expect(localStorage.getItem(LIVE_SESSION_KEY)).toBe("auto-1");
  });

  it("says it is starting, for the Directory's button", () => {
    expect(api.startingOpenSession).toBe(false);
    act(() => api.startOpenSession());
    expect(api.startingOpenSession).toBe(true);
  });

  it("a refusal is said in a toast, and the device forgets the session", async () => {
    fs.answer = "refuse";
    act(() => api.startOpenSession());
    expect(setCurrentView).toHaveBeenCalledWith("workouts");
    await act(async () => {
      fs.refuse?.(Object.assign(new Error("refused"), { code: "permission-denied" }));
      await Promise.resolve();
    });
    expect(onRefused).toHaveBeenCalledTimes(1);
    expect(onRefused.mock.calls[0][0]).toContain("didn't start");
    expect(localStorage.getItem(LIVE_SESSION_KEY)).toBeNull();
  });

  it("a refusal the Active Session holding the session says (its typed sets are kept) is not said twice", async () => {
    fs.answer = "refuse";
    const heard: string[] = [];
    const off = onOpenSessionRefused((id) => {
      heard.push(id);
      return true;
    });
    act(() => api.startOpenSession());
    await act(async () => {
      fs.refuse?.(new Error("refused"));
      await Promise.resolve();
    });
    off();
    expect(heard).toEqual(["auto-1"]);
    expect(onRefused).not.toHaveBeenCalled();
  });

  it("with no studio on the iPad, writes nothing and says so (an open session elsewhere could not be found again)", () => {
    act(() => root.render(<Probe studio={null} />));
    act(() => api.startOpenSession());
    expect(fs.writes).toHaveLength(0);
    expect(setCurrentView).not.toHaveBeenCalled();
    expect(onRefused.mock.calls[0][0]).toContain("Choose a studio first");
  });
});

describe("Open session while the trainer's own open session is running (Oct 9 2026)", () => {
  const T0 = Date.parse("2026-10-09T14:00:00.000Z");
  const later = T0 + OPEN_SESSION_GUARD_MS + 60_000;
  let clock = T0;
  beforeEach(() => {
    clock = T0;
    vi.spyOn(Date, "now").mockImplementation(() => clock);
  });

  it("past the double-tap window, goes back to the running one and writes nothing", () => {
    const running = {
      id: "o-running",
      status: "In-Progress",
      trainerId: "t-doc",
      isUnassigned: true,
      lastHeartbeatAt: new Date(T0 - 60_000),
    };
    act(() => root.render(<Probe sessions={[running]} />));
    clock = later;
    act(() => api.startOpenSession());
    expect(fs.writes).toHaveLength(0);
    expect(localStorage.getItem(LIVE_SESSION_KEY)).toBe("o-running");
    expect(setSelectedClientId).toHaveBeenCalledWith(null);
    expect(setCurrentView).toHaveBeenCalledWith("workouts");
  });

  it("the one just started, still only on the iPad (offline), is gone back to after the window too", () => {
    act(() => api.startOpenSession());
    clock = later;
    act(() => api.startOpenSession());
    expect(fs.writes).toHaveLength(1);
    expect(setCurrentView).toHaveBeenCalledTimes(2);
  });

  it("once it has ended (assigned and completed), the next tap starts a new one", () => {
    act(() => api.startOpenSession());
    const ended = { id: "auto-1", status: "Completed", trainerId: "t-doc", clientId: "c1", isUnassigned: false };
    act(() => root.render(<Probe sessions={[ended]} />));
    clock = later;
    act(() => api.startOpenSession());
    expect(fs.writes).toHaveLength(2);
    expect(localStorage.getItem(LIVE_SESSION_KEY)).toBe("auto-2");
  });

  it("after a studio switch, the one just started at the other studio is not followed: a new one starts here (the review, Oct 9 2026)", () => {
    act(() => api.startOpenSession());
    act(() => root.render(<Probe studio="solon" />));
    clock = later;
    act(() => api.startOpenSession());
    expect(fs.writes).toHaveLength(2);
    expect(fs.writes[1].data).toMatchObject({ hostedAtStudioId: "solon" });
  });

  it("after a reload, offline, goes back to the open session the device remembers, read from the iPad's own copy", async () => {
    localStorage.setItem(LIVE_SESSION_KEY, "o-before");
    fs.cached["o-before"] = { status: "In-Progress", trainerId: "t-doc", isUnassigned: true, hostedAtStudioId: "westlake", lastHeartbeatAt: null };
    await act(async () => {
      api.startOpenSession();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fs.writes).toHaveLength(0);
    expect(localStorage.getItem(LIVE_SESSION_KEY)).toBe("o-before");
    expect(setCurrentView).toHaveBeenCalledWith("workouts");
  });

  it("after a reload, a remembered session the iPad doesn't hold, or one that isn't an open session here, is no reason not to start", async () => {
    localStorage.setItem(LIVE_SESSION_KEY, "o-gone");
    await act(async () => {
      api.startOpenSession();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fs.writes).toHaveLength(1);
    localStorage.setItem(LIVE_SESSION_KEY, "c-sess");
    fs.cached["c-sess"] = { status: "In-Progress", trainerId: "t-doc", clientId: "c1", hostedAtStudioId: "westlake" };
    act(() => root.unmount());
    root = createRoot(document.createElement("div"));
    act(() => root.render(<Probe />));
    await act(async () => {
      api.startOpenSession();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fs.writes).toHaveLength(2);
  });

  it("an abandoned open session of the trainer's is gone back to, so the screen can ask; once left, a new one starts", () => {
    const abandoned = {
      id: "o-old",
      status: "In-Progress",
      trainerId: "t-doc",
      isUnassigned: true,
      lastHeartbeatAt: new Date(T0 - 2 * 60 * 60_000),
    };
    act(() => root.render(<Probe sessions={[abandoned]} />));
    act(() => api.startOpenSession());
    expect(fs.writes).toHaveLength(0);
    expect(localStorage.getItem(LIVE_SESSION_KEY)).toBe("o-old");
    declineStaleOpenSession("o-old");
    act(() => api.startOpenSession());
    expect(fs.writes).toHaveLength(1);
  });

  it("another trainer's open session is no reason not to start one", () => {
    const theirs = {
      id: "o-theirs",
      status: "In-Progress",
      trainerId: "t-other",
      isUnassigned: true,
      lastHeartbeatAt: new Date(T0 - 60_000),
    };
    act(() => root.render(<Probe sessions={[theirs]} />));
    act(() => api.startOpenSession());
    expect(fs.writes).toHaveLength(1);
  });
});
