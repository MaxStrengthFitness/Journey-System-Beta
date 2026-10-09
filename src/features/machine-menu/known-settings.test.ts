import { beforeEach, describe, expect, it } from "vitest";
import { forgetPersonalMemory } from "../sign-out/memory";
import { KNOWN_SETTINGS_KEYS, knownSettings, noteKnownSettings } from "./known-settings";

beforeEach(() => forgetPersonalMemory());

describe("what this iPad last knew of a client's settings on a machine (the toast's Undo)", () => {
  it("keeps the newest map per client and machine, as a copy", () => {
    expect(knownSettings("avery", "leg-press")).toBeNull();
    const map = { seat: "12" };
    noteKnownSettings("avery", "leg-press", map);
    map.seat = "99";
    noteKnownSettings("avery", "chest-fly", { gap: "1" });
    expect(knownSettings("avery", "leg-press")).toEqual({ seat: "12" });
    noteKnownSettings("avery", "leg-press", { seat: "12", backPad: "3" });
    expect(knownSettings("avery", "leg-press")).toEqual({ seat: "12", backPad: "3" });
    expect(knownSettings("sam", "leg-press")).toBeNull();
  });

  it("notes nothing for no client (an open session's ghost record), and forgets at sign-out", () => {
    noteKnownSettings("", "leg-press", { seat: "4" });
    expect(knownSettings("", "leg-press")).toBeNull();
    noteKnownSettings("avery", "leg-press", { seat: "4" });
    forgetPersonalMemory();
    expect(knownSettings("avery", "leg-press")).toBeNull();
  });

  it("keeps only the newest pairs, so a shared iPad never grows it for days", () => {
    for (let i = 0; i <= KNOWN_SETTINGS_KEYS; i++) noteKnownSettings(`c${i}`, "leg-press", { seat: String(i) });
    expect(knownSettings("c0", "leg-press")).toBeNull();
    expect(knownSettings(`c${KNOWN_SETTINGS_KEYS}`, "leg-press")).toEqual({ seat: String(KNOWN_SETTINGS_KEYS) });
  });
});
