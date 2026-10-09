import { describe, expect, it } from "vitest";
import {
  OPEN_SESSION_GUARD_MS,
  OPEN_SESSION_REFUSED,
  isSecondTap,
  openSessionPayload,
  runningOpenSessionId,
} from "./start";

const STAMP = { __server: true };
const facts = {
  trainer: { id: "t-doc", fullName: "Jane Coach", initials: "JC" },
  uid: "uid-coach",
  studioId: "solon",
  date: "2026-10-09",
  nowIso: "2026-10-09T13:04:00.000Z",
  stamp: STAMP,
};

describe("the open session's start (the open session round, Oct 9 2026)", () => {
  it("is an open session with no client and an EMPTY list: the floor is not today's list", () => {
    const p = openSessionPayload(facts);
    expect(p).toMatchObject({
      isUnassigned: true,
      status: "In-Progress",
      hostedAtStudioId: "solon",
      date: "2026-10-09",
      sessionMachineIds: [],
      sessionNumber: 0,
      isCrossTrain: false,
    });
    expect(p).not.toHaveProperty("clientId");
    expect(p).not.toHaveProperty("routineId");
  });

  it("runs its timer from the iPad's clock and carries a heartbeat, as a client Start does", () => {
    const p = openSessionPayload(facts);
    expect(p.clientStartTime).toBe("2026-10-09T13:04:00.000Z");
    expect(p.lastHeartbeatAt).toBe(STAMP);
    expect(p.startTime).toBe(STAMP);
    expect(p.createdAt).toBe(STAMP);
    expect(p).toMatchObject({ pausedAt: null, totalPausedMs: 0 });
  });

  it("is signed as a client Start signs it: who started it is the trainer document's id, as trainerId is", () => {
    // Every other writer and reader of startedByTrainerId uses the trainer
    // document's id (a client Start, a take-over, the trainer rollups, My
    // Profile); no rule pins it to the sign-in uid.
    const p = openSessionPayload(facts);
    expect(p).toMatchObject({
      trainerId: "t-doc",
      trainerName: "Jane Coach",
      trainerInitials: "JC",
      startedByTrainerId: "t-doc",
    });
  });

  it("falls back to the uid and to '??' rather than writing nothing, and never writes undefined", () => {
    const p = openSessionPayload({ ...facts, trainer: { id: null, fullName: undefined, initials: "" } });
    expect(p).toMatchObject({
      trainerId: "uid-coach",
      startedByTrainerId: "uid-coach",
      trainerName: "",
      trainerInitials: "??",
    });
    for (const [key, value] of Object.entries(p)) expect(value, key).not.toBeUndefined();
  });

  it("seeds no machine and writes no weight: nothing in it names a machine or a load", () => {
    const text = JSON.stringify(openSessionPayload(facts));
    expect(text).not.toMatch(/weight|reps|Leg Press|LEG PRESS|Hip Ab/i);
  });
});

describe("a second tap", () => {
  it("inside the window opens the session just started; after it, a tap is a new Start", () => {
    expect(isSecondTap(null, 1000)).toBe(false);
    expect(isSecondTap({ at: 1000 }, 1000 + OPEN_SESSION_GUARD_MS - 1)).toBe(true);
    expect(isSecondTap({ at: 1000 }, 1000 + OPEN_SESSION_GUARD_MS)).toBe(false);
  });
});

describe("the refusal", () => {
  it("says what happened and what to do, in plain words", () => {
    expect(OPEN_SESSION_REFUSED).toContain("didn't start");
    expect(OPEN_SESSION_REFUSED).not.toMatch(/firestore|firebase|error|permission/i);
  });
});

describe("Open session while the trainer's own is running goes back to it", () => {
  const now = Date.parse("2026-10-09T14:00:00.000Z");
  const fresh = { lastHeartbeatAt: new Date(now - 60_000) };
  const open = { id: "o1", status: "In-Progress", trainerId: "t-doc", isUnassigned: true, ...fresh };
  const myIds = ["t-doc", "uid-coach"];
  const base = { myIds, lastStartedId: null, rememberedId: null, now };

  it("finds the trainer's live open session in the studio's stream, whoever's iPad started it", () => {
    // Past the double-tap window, nothing remembered: the stream is what says so.
    expect(runningOpenSessionId({ ...base, stream: [open] })).toBe("o1");
  });

  it("a client's session, another trainer's open session or an abandoned one is not it", () => {
    expect(runningOpenSessionId({ ...base, stream: [{ ...open, isUnassigned: false, clientId: "c1" }] })).toBeNull();
    expect(runningOpenSessionId({ ...base, stream: [{ ...open, trainerId: "t-other" }] })).toBeNull();
    const abandoned = { ...open, lastHeartbeatAt: new Date(now - 2 * 60 * 60_000) };
    expect(runningOpenSessionId({ ...base, stream: [abandoned] })).toBeNull();
  });

  it("the one this iPad just started counts while its write is still on the iPad (offline)", () => {
    expect(runningOpenSessionId({ ...base, stream: [], lastStartedId: "o2", rememberedId: "o2" })).toBe("o2");
    // Forgotten by the device (discarded, refused, finished here): start a new one.
    expect(runningOpenSessionId({ ...base, stream: [], lastStartedId: "o2", rememberedId: null })).toBeNull();
    expect(runningOpenSessionId({ ...base, stream: [], lastStartedId: "o2", rememberedId: "s9" })).toBeNull();
  });

  it("once the stream says it ended, it is not running: assigned, finished, taken over", () => {
    const remembered = { ...base, lastStartedId: "o1", rememberedId: "o1" };
    expect(runningOpenSessionId({ ...remembered, stream: [{ ...open, status: "Completed", isUnassigned: false, clientId: "c1" }] })).toBeNull();
    expect(runningOpenSessionId({ ...remembered, stream: [{ ...open, status: "Completed" }] })).toBeNull();
    expect(runningOpenSessionId({ ...remembered, stream: [{ ...open, trainerId: "t-other" }] })).toBeNull();
  });
});
