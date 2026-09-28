import { describe, expect, it } from "vitest";
import { CARRY_MAX, cleanCarry, cleanFacts, cleanLine, dayLogFromDoc, dayLogHeading, dayLogId, dayLogIsEmpty, dayLogSummary } from "./day-log";

describe("the day log", () => {
  it("is keyed by the person, then the day", () => {
    expect(dayLogId("t-ioreth", "2026-09-28")).toBe("t-ioreth_2026-09-28");
  });

  it("keeps up to three things to carry, trimmed, blanks left out", () => {
    expect(cleanCarry(["  Slow down at the door  ", "", "Ask before I assume", "Set up first", "A fourth"])).toEqual([
      "Slow down at the door",
      "Ask before I assume",
      "Set up first",
    ]);
    expect(cleanCarry(["", "  "])).toEqual([]);
    expect(CARRY_MAX).toBe(3);
  });

  it("keeps one line for yourself only when something is written", () => {
    expect(cleanLine({ what: " Rushed a set-up ", soWhat: "", nowWhat: "Set up before she sits" })).toEqual({
      what: "Rushed a set-up",
      soWhat: "",
      nowWhat: "Set up before she sits",
    });
    expect(cleanLine({ what: "  ", soWhat: "", nowWhat: "" })).toBeNull();
    expect(cleanLine(null)).toBeNull();
    expect(cleanFacts(["Monday, September 28.", "  ", "5 sessions."])).toEqual(["Monday, September 28.", "5 sessions."]);
  });

  it("reads back defensively, and names the day", () => {
    const log = dayLogFromDoc("t-ioreth_2026-09-28", {
      uid: "t-ioreth",
      studioId: "s1",
      day: "2026-09-28",
      facts: ["Monday, September 28.", 7],
      carry: ["Slow down at the door"],
      line: { what: "Covered Rosie", soWhat: "", nowWhat: "Leave the same kind of notes" },
    });
    expect(log).toMatchObject({ facts: ["Monday, September 28."], carry: ["Slow down at the door"], line: { nowWhat: "Leave the same kind of notes" } });
    expect(dayLogFromDoc("x", { uid: "t", day: "yesterday" })).toBeNull();
    expect(dayLogHeading("2026-09-28")).toBe("Monday, September 28");
  });

  it("sums a day up in the trainer's own words first", () => {
    expect(dayLogSummary({ facts: ["Monday.", "5 sessions."], carry: [], line: { what: "", soWhat: "", nowWhat: "Slow down" } })).toBe("Now what: Slow down");
    expect(dayLogSummary({ facts: ["Monday.", "5 sessions."], carry: ["Ask first"], line: null })).toBe("Carried: Ask first");
    expect(dayLogSummary({ facts: ["Monday.", "5 sessions."], carry: [], line: null })).toBe("5 sessions.");
    expect(dayLogIsEmpty({ facts: [], carry: [], line: null })).toBe(true);
  });
});
