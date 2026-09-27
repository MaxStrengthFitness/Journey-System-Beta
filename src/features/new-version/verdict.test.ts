import { describe, expect, it } from "vitest";
import { whenToLoad, type LoadFacts, type LoadMoment } from "./verdict";

const CLEAR: LoadFacts = {
  serverAnswered: true,
  onSessionScreen: false,
  ownSessionClientName: null,
  sending: false,
  typing: false,
  noteDraft: false,
  triedAlready: false,
};

const MOMENTS: LoadMoment[] = ["hub", "tap", "broken-screen", "broken-session-screen"];

describe("whenToLoad", () => {
  it("loads at once when nothing is at risk, at every moment", () => {
    for (const moment of MOMENTS) expect(whenToLoad(moment, CLEAR)).toEqual({ load: "now" });
  });

  it("never reloads without a fresh answer from the server, whoever asks", () => {
    for (const moment of MOMENTS) {
      expect(whenToLoad(moment, { ...CLEAR, serverAnswered: false })).toEqual({ load: "wait", reason: "offline" });
    }
  });

  it("never reloads on the Active Session, not even for a tap", () => {
    for (const moment of ["hub", "tap", "broken-screen"] as const) {
      expect(whenToLoad(moment, { ...CLEAR, onSessionScreen: true })).toEqual({ load: "wait", reason: "session-screen" });
    }
  });

  it("waits for the trainer's own open session, from any screen", () => {
    for (const moment of ["hub", "tap", "broken-screen"] as const) {
      expect(whenToLoad(moment, { ...CLEAR, ownSessionClientName: "Sam" })).toEqual({ load: "wait", reason: "own-session" });
    }
  });

  it("an open session with no name on it still counts", () => {
    expect(whenToLoad("hub", { ...CLEAR, ownSessionClientName: "" })).toEqual({ load: "wait", reason: "own-session" });
  });

  it("waits for saves still sending, whoever asks", () => {
    for (const moment of MOMENTS) {
      expect(whenToLoad(moment, { ...CLEAR, sending: true })).toEqual({ load: "wait", reason: "sending" });
    }
  });

  it("waits for typing when it loads by itself; a tap asks the app's own question instead", () => {
    expect(whenToLoad("hub", { ...CLEAR, typing: true })).toEqual({ load: "wait", reason: "typing" });
    expect(whenToLoad("broken-screen", { ...CLEAR, typing: true })).toEqual({ load: "wait", reason: "typing" });
    expect(whenToLoad("tap", { ...CLEAR, typing: true })).toEqual({ load: "now" });
  });

  it("waits for a session note draft when it loads by itself", () => {
    expect(whenToLoad("hub", { ...CLEAR, noteDraft: true })).toEqual({ load: "wait", reason: "note-draft" });
    expect(whenToLoad("broken-screen", { ...CLEAR, noteDraft: true })).toEqual({ load: "wait", reason: "note-draft" });
    expect(whenToLoad("tap", { ...CLEAR, noteDraft: true })).toEqual({ load: "now" });
  });

  it("does not loop: once per version in ten minutes by itself, but a person may ask again", () => {
    expect(whenToLoad("hub", { ...CLEAR, triedAlready: true })).toEqual({ load: "wait", reason: "just-reloaded" });
    expect(whenToLoad("broken-screen", { ...CLEAR, triedAlready: true })).toEqual({ load: "wait", reason: "just-reloaded" });
    expect(whenToLoad("broken-session-screen", { ...CLEAR, triedAlready: true })).toEqual({
      load: "wait",
      reason: "just-reloaded",
    });
    expect(whenToLoad("tap", { ...CLEAR, triedAlready: true })).toEqual({ load: "now" });
  });

  describe("the Active Session's own screen could not open", () => {
    it("reloads although the session screen is showing and the session is open: nothing is recording here", () => {
      expect(
        whenToLoad("broken-session-screen", { ...CLEAR, onSessionScreen: true, ownSessionClientName: "Sam" }),
      ).toEqual({ load: "now" });
    });

    it("reloads over the session's note draft, which the reload keeps and the session restores", () => {
      expect(whenToLoad("broken-session-screen", { ...CLEAR, onSessionScreen: true, noteDraft: true })).toEqual({
        load: "now",
      });
    });

    it("still waits for a save that is sending", () => {
      expect(whenToLoad("broken-session-screen", { ...CLEAR, onSessionScreen: true, sending: true })).toEqual({
        load: "wait",
        reason: "sending",
      });
    });
  });

  it("says the most important reason first", () => {
    const everything: LoadFacts = {
      serverAnswered: false,
      onSessionScreen: true,
      ownSessionClientName: "Sam",
      sending: true,
      typing: true,
      noteDraft: true,
      triedAlready: true,
    };
    expect(whenToLoad("hub", everything)).toEqual({ load: "wait", reason: "offline" });
    expect(whenToLoad("hub", { ...everything, serverAnswered: true })).toEqual({ load: "wait", reason: "session-screen" });
    expect(whenToLoad("hub", { ...everything, serverAnswered: true, onSessionScreen: false })).toEqual({
      load: "wait",
      reason: "own-session",
    });
  });
});
