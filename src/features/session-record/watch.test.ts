import { describe, expect, it } from "vitest";
import { firstOpenMachine, machinesDone, sessionMachineList, takeOverWords, watchWords, whoStartedIt } from "./watch";
import type { LiveSet } from "../journey-grid";

const set = (over: Partial<LiveSet>): LiveSet => ({
  weight: 120,
  reps: null,
  seconds: null,
  isTSC: false,
  quality: null,
  ...over,
});

describe("watchWords", () => {
  it("names who is running the session, and says nothing here changes it", () => {
    const w = watchWords({ runner: "JC", takenFromHere: false, online: true });
    expect(w.line).toBe(
      "JC is running this session on another iPad. You're watching: it updates as each set is saved, and nothing here changes it.",
    );
    expect(w.offline).toBeNull();
  });

  it("tells the iPad a session was taken from who took it", () => {
    expect(watchWords({ runner: "AJ", takenFromHere: true, online: true }).line).toBe(
      "AJ took over this session on another iPad. You're watching it now: it updates as each set is saved.",
    );
  });

  it("says what is on screen may be behind while offline", () => {
    expect(watchWords({ runner: "JC", takenFromHere: false, online: false }).offline).toBe(
      "Offline: what you see may be behind what has been saved.",
    );
  });

  it("never prints blank initials", () => {
    expect(watchWords({ runner: "  ", takenFromHere: false, online: true }).line).toMatch(/^Another trainer is running/);
  });
});

describe("takeOverWords", () => {
  it("asks plainly, with watching as the safe answer", () => {
    const w = takeOverWords({ runner: "JC", clientFirstName: "Judy" });
    expect(w.title).toBe("Take over this session?");
    expect(w.question).toBe(
      "JC is running Judy's session on another iPad. If you take it over, you record the rest and finish it, and the session is yours. JC's iPad switches to watching. The session still shows who started it.",
    );
    expect(w.leaveLabel).toBe("Take over");
    expect(w.stayLabel).toBe("Keep watching");
  });

  it("reads right with nothing to name", () => {
    const w = takeOverWords({ runner: "", clientFirstName: "" });
    expect(w.question).toBe(
      "Another trainer is running this session on another iPad. If you take it over, you record the rest and finish it, and the session is yours. Their iPad switches to watching. The session still shows who started it.",
    );
  });

  it("never uses developer words", () => {
    const all = [
      watchWords({ runner: "JC", takenFromHere: false, online: false }),
      watchWords({ runner: "JC", takenFromHere: true, online: true }),
    ]
      .map((w) => `${w.line} ${w.offline ?? ""}`)
      .concat(Object.values(takeOverWords({ runner: "JC", clientFirstName: "Judy" })))
      .join(" ");
    expect(all).not.toMatch(/firestore|firebase|null|undefined|error|document|sync/i);
  });
});

describe("sessionMachineList", () => {
  const routines = [{ id: "rA", machineIds: ["m1", "m2"] }];

  it("follows the session's own list, which the trainer's iPad rewrites on every add or move", () => {
    expect(sessionMachineList({ sessionMachineIds: ["m2", "m9"], routineId: "rA" }, routines, ["f1"])).toEqual(["m2", "m9"]);
  });

  it("falls back to the routine for an older session", () => {
    expect(sessionMachineList({ routineId: "rA" }, routines, ["f1"])).toEqual(["m1", "m2"]);
  });

  it("runs the floor for a Free session, and nothing for a routine not loaded yet", () => {
    expect(sessionMachineList({}, routines, ["f1", "f2"])).toEqual(["f1", "f2"]);
    expect(sessionMachineList({ routineId: "rZ" }, routines, ["f1"])).toEqual([]);
  });
});

describe("where the trainer is, and how far along", () => {
  const ids = ["m1", "m2", "m3"];

  it("is the first machine without a count and a quality", () => {
    expect(firstOpenMachine(ids, { m1: set({ reps: 12, quality: 2 }), m2: set({ reps: 10 }) })).toBe("m2");
  });

  it("passes a practice or skipped machine, and a timed hold with its seconds", () => {
    expect(
      firstOpenMachine(ids, {
        m1: set({ outcome: "skipped" }),
        m2: set({ isTSC: true, seconds: 90, quality: 2 }),
      }),
    ).toBe("m3");
  });

  it("is the first machine once everything is done, and nothing with no machines", () => {
    const all = { m1: set({ reps: 1, quality: 2 }), m2: set({ reps: 1, quality: 2 }), m3: set({ reps: 1, quality: 2 }) };
    expect(firstOpenMachine(ids, all)).toBe("m1");
    expect(firstOpenMachine([], {})).toBeNull();
  });

  it("counts machines logged as the session bar does", () => {
    expect(
      machinesDone(ids, {
        m1: set({ reps: 12 }),
        m2: set({ outcome: "practice" }),
        m3: set({ weight: 90 }),
      }),
    ).toBe(2);
  });
});

describe("whoStartedIt", () => {
  const trainers = [
    { id: "t-jc", initials: "JC" },
    { id: "t-aj", initials: "AJ" },
  ];

  it("is one trainer until a take-over", () => {
    expect(whoStartedIt({ trainerId: "t-jc", trainerInitials: "JC", startedByTrainerId: "t-jc" }, trainers)).toEqual({
      starter: "JC",
      runner: "JC",
      changedHands: false,
    });
    // A session from before startedByTrainerId was only ever one trainer's.
    expect(whoStartedIt({ trainerId: "t-jc", trainerInitials: "JC" }, trainers).changedHands).toBe(false);
  });

  it("names the starter and the trainer who has it after a take-over", () => {
    expect(whoStartedIt({ trainerId: "t-aj", trainerInitials: "AJ", startedByTrainerId: "t-jc" }, trainers)).toEqual({
      starter: "JC",
      runner: "AJ",
      changedHands: true,
    });
  });

  it("never guesses a starter the roster cannot name", () => {
    expect(whoStartedIt({ trainerId: "t-aj", trainerInitials: "AJ", startedByTrainerId: "t-gone" }, trainers)).toEqual({
      starter: null,
      runner: "AJ",
      changedHands: true,
    });
  });
});
