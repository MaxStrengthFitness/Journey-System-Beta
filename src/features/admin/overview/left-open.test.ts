import { describe, expect, it } from "vitest";
import type { WorkoutSession } from "../../../types";
import { leftOpenHeading, leftOpenSessions } from "./left-open";

const NOW = Date.parse("2026-10-02T15:00:00-04:00");
const s = (id: string, over: Partial<WorkoutSession> = {}): WorkoutSession =>
  ({ id, clientId: `c-${id}`, clientName: `Client ${id}`, hostedAtStudioId: "westlake", status: "In-Progress", trainerInitials: "SG", ...over }) as WorkoutSession;

describe("sessions left open (the Atlas answers, Oct 2 2026)", () => {
  it("lists In-Progress sessions an hour past their last sign of life, the Hub's own rule", () => {
    const rows = leftOpenSessions(
      [
        s("stale", { lastHeartbeatAt: Date.parse("2026-10-02T09:40:00-04:00"), sessionMachineIds: ["a", "b", "c"], startedByTrainerId: "t-sam" }),
        s("live", { lastHeartbeatAt: NOW - 10 * 60_000 }),
        s("done", { status: "Completed", createdAt: Date.parse("2026-09-30T09:00:00-04:00") }),
        s("old", { createdAt: Date.parse("2026-09-29T08:00:00-04:00") }),
      ],
      NOW,
      { trainerNameOf: (id) => (id === "t-sam" ? "Sam Gamgee" : null), tz: "America/New_York" },
    );
    expect(rows.map((r) => r.id)).toEqual(["stale", "old"]);
    expect(rows[0]).toMatchObject({ clientId: "c-stale", clientName: "Client stale", trainer: "Sam Gamgee", machines: 3 });
    expect(rows[0].detail).toBe("Started by Sam \u00b7 last active 9:40 AM \u00b7 3 machines logged");
    expect(rows[1].detail).toBe("Started by SG \u00b7 last active Tue 8:00 AM \u00b7 no machines logged");
  });

  it("says how many in a heading", () => {
    expect(leftOpenHeading(1)).toBe("A session was left open");
    expect(leftOpenHeading(3)).toBe("3 sessions were left open");
  });
});
