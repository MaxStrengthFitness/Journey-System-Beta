/**
 * The finished sessions as one steady list (speed round, Oct 5 2026, R6).
 */
import { describe, expect, it } from "vitest";
import type { WorkoutSession } from "../types";
import { completedSessionsOf } from "./completed-sessions";

const s = (id: string, status: string) => ({ id, status, clientId: `c-${id}` }) as unknown as WorkoutSession;

describe("completedSessionsOf", () => {
  it("keeps only the completed sessions, in order", () => {
    const list = [s("a", "Completed"), s("b", "In-Progress"), s("c", "Completed")];
    expect(completedSessionsOf(list, null).map((x) => x.id)).toEqual(["a", "c"]);
  });

  it("hands back the same list while the finished sessions are the same objects (a heartbeat elsewhere)", () => {
    const a = s("a", "Completed");
    const first = completedSessionsOf([a, s("run", "In-Progress")], null);
    const afterBeat = completedSessionsOf([a, s("run", "In-Progress")], first);
    expect(afterBeat).toBe(first);
  });

  it("moves when a session finishes, is edited, or leaves", () => {
    const a = s("a", "Completed");
    const first = completedSessionsOf([a], null);
    expect(completedSessionsOf([a, s("b", "Completed")], first)).not.toBe(first);
    expect(completedSessionsOf([{ ...a } as WorkoutSession], first)).not.toBe(first);
    expect(completedSessionsOf([], first)).toEqual([]);
  });

  it("an unread stream is no finished sessions, the same empty list each time", () => {
    expect(completedSessionsOf(null, null)).toBe(completedSessionsOf(undefined, null));
  });
});
