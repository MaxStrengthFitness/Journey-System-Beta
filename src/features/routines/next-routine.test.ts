import { describe, expect, it } from "vitest";
import { completedNewestFirst, lastUsedDay, nextRoutine, usedLastSentence } from "./next-routine";
import type { Routine, WorkoutSession } from "../../types";

const A = { id: "rA", name: "Routine A", machineIds: [] } as unknown as Routine;
const B = { id: "rB", name: "Routine B", machineIds: [] } as unknown as Routine;
const s = (id: string, date: string, routineId: string | null, status = "Completed") =>
  ({ id, date, routineId, status }) as unknown as WorkoutSession;

describe("nextRoutine: the Active Session's alternation", () => {
  it("has nothing for a client with no routines yet (the session starts a new Routine A)", () => {
    expect(nextRoutine([], null, true)).toBeNull();
  });

  it("runs A when B is off, whatever ran last", () => {
    expect(nextRoutine([A, B], "rA", false)).toBe(A);
    expect(nextRoutine([A, B], "rB", false)).toBe(A);
  });

  it("alternates strictly with B on: after A comes B, after anything else A", () => {
    expect(nextRoutine([A, B], "rA", true)).toBe(B);
    expect(nextRoutine([A, B], "rB", true)).toBe(A);
    expect(nextRoutine([A, B], null, true)).toBe(A);
    expect(nextRoutine([A, B], "gone", true)).toBe(A);
  });

  it("falls back to the first routine when there is no A, as the session does", () => {
    expect(nextRoutine([B], "rB", true)).toBe(B);
  });
});

describe("completedNewestFirst and lastUsedDay", () => {
  const sessions = [
    s("1", "2026-09-10", "rA"),
    s("2", "2026-09-22", "rB"),
    s("3", "2026-09-17", "rA"),
    s("4", "2026-09-24", "rA", "In-Progress"),
  ];

  it("orders completed sessions by their own day, newest first, leaving out one still running", () => {
    expect(completedNewestFirst(sessions).map((x) => x.id)).toEqual(["2", "3", "1"]);
  });

  it("finds the day each routine was last used, from completed sessions only", () => {
    expect(lastUsedDay(sessions, "rA")).toBe("2026-09-17");
    expect(lastUsedDay(sessions, "rB")).toBe("2026-09-22");
    expect(lastUsedDay(sessions, "rC")).toBeNull();
    expect(lastUsedDay(sessions, null)).toBeNull();
  });
});

describe("usedLastSentence", () => {
  it("says the day, without the year this year", () => {
    expect(usedLastSentence("2026-09-22", "2026-09-26")).toBe("Used last on Sep 22");
  });

  it("adds the year when it isn't this year", () => {
    expect(usedLastSentence("2025-12-30", "2026-01-05")).toBe("Used last on Dec 30, 2025");
  });

  it("says today plainly", () => {
    expect(usedLastSentence("2026-09-26", "2026-09-26")).toBe("Used today");
  });

  it("says nothing when Journey has no session on the routine", () => {
    expect(usedLastSentence(null, "2026-09-26")).toBeNull();
  });

  it("never moves a plain day back a day across time zones", () => {
    expect(usedLastSentence("2026-03-01", "2026-09-26")).toBe("Used last on Mar 1");
  });
});
