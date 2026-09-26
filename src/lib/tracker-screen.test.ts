import { describe, expect, it } from "vitest";
import { trackerScreen } from "./tracker-screen";

const base = { isPostSessionMode: false, hasPostSessionSnapshot: false, isPreSessionMode: false, hasClient: true, hasCurrentSession: false };

describe("trackerScreen", () => {
  it("shows the briefing when a client is chosen and nothing is running", () => {
    expect(trackerScreen({ ...base, isPreSessionMode: true })).toBe("briefing");
  });

  it("shows the tracker while a session is running", () => {
    expect(trackerScreen({ ...base, hasCurrentSession: true })).toBe("tracker");
    // The stream may not have caught up with a fresh session yet; a running session still wins.
    expect(trackerScreen({ ...base, hasCurrentSession: true, isPreSessionMode: true })).toBe("tracker");
  });

  it("keeps the post-session screen up after Finish, even once the stream says nothing is running", () => {
    // The bug: Finish clears the current session, then the sessions stream
    // flips pre-session mode on. The briefing must not win that race.
    expect(trackerScreen({ ...base, isPostSessionMode: true, hasPostSessionSnapshot: true, isPreSessionMode: true })).toBe("post-session");
    expect(trackerScreen({ ...base, isPostSessionMode: true, hasPostSessionSnapshot: true })).toBe("post-session");
  });

  it("stays on the post-session screen even if the client selection is gone", () => {
    expect(trackerScreen({ ...base, isPostSessionMode: true, hasPostSessionSnapshot: true, hasClient: false })).toBe("post-session");
  });

  it("post-session mode without a snapshot falls through to the normal rule", () => {
    expect(trackerScreen({ ...base, isPostSessionMode: true, isPreSessionMode: true })).toBe("briefing");
  });

  it("draws nothing with no client and no session", () => {
    expect(trackerScreen({ ...base, hasClient: false })).toBe("none");
  });

  it("watches another trainer's session rather than offering a briefing or nothing (Sep 26 2026)", () => {
    expect(trackerScreen({ ...base, hasWatchedSession: true, isPreSessionMode: true })).toBe("watch");
    // An open session watched with no client chosen is still a screen.
    expect(trackerScreen({ ...base, hasWatchedSession: true, hasClient: false })).toBe("watch");
  });

  it("records its own session over anything watched, and keeps a finished session's screen first", () => {
    expect(trackerScreen({ ...base, hasWatchedSession: true, hasCurrentSession: true })).toBe("tracker");
    expect(trackerScreen({ ...base, hasWatchedSession: true, isPostSessionMode: true, hasPostSessionSnapshot: true })).toBe("post-session");
  });
});
