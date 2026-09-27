import { describe, expect, it } from "vitest";
import { brokenPanelWords, brokenScreenWords, newVersionLine } from "./words";

describe("newVersionLine", () => {
  const CLEAR = { onSessionScreen: false, ownSessionClientName: null, sending: false };

  it("says when it will load, and offers Load now", () => {
    expect(newVersionLine(CLEAR)).toEqual({
      text: "A new version of Journey is ready. It loads by itself next time you're on the Hub.",
      offerLoad: true,
    });
  });

  it("is never drawn on the Active Session", () => {
    expect(newVersionLine({ ...CLEAR, onSessionScreen: true })).toBeNull();
    expect(newVersionLine({ ...CLEAR, onSessionScreen: true, ownSessionClientName: "Sam" })).toBeNull();
  });

  it("waits for the trainer's own session by name, with nothing to press", () => {
    expect(newVersionLine({ ...CLEAR, ownSessionClientName: "Sam Rivera" })).toEqual({
      text: "A new version of Journey is ready. It will load after your session with Sam Rivera.",
      offerLoad: false,
    });
    expect(newVersionLine({ ...CLEAR, ownSessionClientName: " " })?.text).toContain("your session with a client.");
  });

  it("waits for saves still sending, with nothing to press", () => {
    expect(newVersionLine({ ...CLEAR, sending: true })).toEqual({
      text: "A new version of Journey is ready. It will load once this iPad's saves reach the studio's records.",
      offerLoad: false,
    });
  });
});

describe("brokenScreenWords", () => {
  it("says what it is doing while it asks and while it loads", () => {
    expect(brokenScreenWords({ phase: "checking" }, null)).toEqual({
      text: "Checking for a new version of Journey…",
      action: null,
    });
    expect(brokenScreenWords({ phase: "loading", cause: "new-version" }, null)).toEqual({
      text: "Loading the new version of Journey…",
      action: null,
    });
    expect(brokenScreenWords({ phase: "loading", cause: "not-loaded" }, null)).toEqual({
      text: "Loading this screen again…",
      action: null,
    });
  });

  describe("a new version is live", () => {
    it("offers the new version when only typing, a draft or a recent try held it", () => {
      for (const reason of ["typing", "note-draft", "just-reloaded"] as const) {
        expect(brokenScreenWords({ phase: "wait", cause: "new-version", reason }, null)).toEqual({
          text: "This screen is part of a newer version of Journey.",
          action: "load",
        });
      }
    });

    it("waits for the trainer's session by name", () => {
      expect(brokenScreenWords({ phase: "wait", cause: "new-version", reason: "own-session" }, "Sam")).toEqual({
        text: "This screen is part of a newer version of Journey, which will load after your session with Sam.",
        action: null,
      });
    });

    it("waits for saves still sending", () => {
      expect(brokenScreenWords({ phase: "wait", cause: "new-version", reason: "sending" }, null)).toEqual({
        text: "This screen is part of a newer version of Journey, which will load once this iPad's saves reach the studio's records.",
        action: null,
      });
    });

    it("waits for the connection, and may be asked again", () => {
      expect(brokenScreenWords({ phase: "wait", cause: "new-version", reason: "offline" }, null)).toEqual({
        text: "This screen is part of a newer version of Journey, which will load when the connection is back.",
        action: "retry",
      });
    });
  });

  describe("the same version, or no answer", () => {
    it("blames the connection and offers Try again", () => {
      expect(brokenScreenWords({ phase: "wait", cause: "not-loaded", reason: "offline" }, null)).toEqual({
        text: "This screen couldn't be loaded. The iPad may be offline.",
        action: "retry",
      });
      expect(brokenScreenWords({ phase: "wait", cause: "not-loaded", reason: "typing" }, null)).toEqual({
        text: "This screen couldn't be loaded.",
        action: "retry",
      });
    });

    it("waits for the trainer's session, with nothing to press", () => {
      expect(brokenScreenWords({ phase: "wait", cause: "not-loaded", reason: "own-session" }, "")).toEqual({
        text: "This screen couldn't be loaded. It will load after your session with a client.",
        action: null,
      });
    });
  });
});

describe("brokenPanelWords", () => {
  it("says when Pulse will open, and never offers a reload inside a session", () => {
    expect(brokenPanelWords("Pulse", true)).toBe(
      "Pulse is part of a newer version of Journey. It will open after this session.",
    );
    expect(brokenPanelWords("Pulse", false)).toBe(
      "Pulse couldn't be loaded on this iPad just now. It will open after this session.",
    );
  });
});
