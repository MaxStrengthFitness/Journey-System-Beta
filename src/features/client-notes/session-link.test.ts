/**
 * A note's session (FileMaker parity, Oct 1 2026; AJ: "if made within a
 * session it should link that session").
 */
import { describe, expect, it } from "vitest";
import type { WorkoutSession } from "../../types";
import { sessionLinkLabel, sessionLinkOf } from "./session-link";

const session = (over: Partial<WorkoutSession> = {}) =>
  ({ id: "s9", sessionNumber: 12, date: "2026-09-30", status: "Completed", ...over }) as WorkoutSession;

describe("sessionLinkOf", () => {
  it("carries the session's id, number and studio day", () => {
    expect(sessionLinkOf(session())).toEqual({ sessionId: "s9", sessionNumber: 12, sessionDay: "2026-09-30" });
  });

  it("leaves out a number that isn't one, and takes the fallback day when the session has none yet", () => {
    expect(sessionLinkOf(session({ sessionNumber: 0, date: "" }), "2026-10-01")).toEqual({
      sessionId: "s9",
      sessionNumber: null,
      sessionDay: "2026-10-01",
    });
  });

  it("links nothing without a session", () => {
    expect(sessionLinkOf(null)).toEqual({ sessionId: null, sessionNumber: null, sessionDay: null });
    expect(sessionLinkOf({ sessionNumber: 4 })).toEqual({ sessionId: null, sessionNumber: null, sessionDay: null });
  });
});

describe("sessionLinkLabel", () => {
  const today = "2026-10-01";

  it("says the session's number and day past the session-number gate", () => {
    expect(sessionLinkLabel({ sessionId: "s9", sessionNumber: 12, sessionDay: "2026-09-30" }, null, true, today)).toBe(
      "From session #12 · Sep 30",
    );
  });

  it("drops the number for a client whose total isn't known, never quoting Journey's count as hers", () => {
    expect(sessionLinkLabel({ sessionId: "s9", sessionNumber: 3, sessionDay: "2026-09-30" }, null, false, today)).toBe(
      "From the session on Sep 30",
    );
  });

  it("reads an older note's session from the sessions the page holds", () => {
    expect(sessionLinkLabel({ sessionId: "s9" }, session({ date: "2025-12-02" }), true, today)).toBe("From session #12 · Dec 2, 2025");
  });

  it("still says it came from a session when nothing more is known, and nothing for a note not from one", () => {
    expect(sessionLinkLabel({ sessionId: "s9" }, null, true, today)).toBe("From a session");
    expect(sessionLinkLabel({ sessionId: null }, session(), true, today)).toBeNull();
  });
});
