import { describe, expect, it } from "vitest";
import { findMyLiveSession, liveSessionTabLabel } from "./live-session";

const now = Date.now();
const fresh = { lastHeartbeatAt: new Date(now - 30_000) };
const stale = { lastHeartbeatAt: new Date(now - 90 * 60_000) };

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
  });
});

describe("liveSessionTabLabel", () => {
  it("names the client by first name", () => {
    expect(liveSessionTabLabel({ clientName: "Judy Daus" })).toBe("Session · Judy");
    expect(liveSessionTabLabel({ clientName: "" })).toBe("Active Session");
    expect(liveSessionTabLabel(undefined)).toBe("Start Session");
  });
});
