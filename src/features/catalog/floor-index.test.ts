import { describe, expect, it } from "vitest";
import { flagLineOf, floorSentence, floorStateOf, presetLine, presetOf } from "./floor-index";

describe("the floor's four states", () => {
  it("is unreadable when a read failed, even while something else still loads", () => {
    expect(floorStateOf({ loading: true, failed: true, count: 0 })).toBe("unreadable");
    expect(floorStateOf({ loading: false, failed: true, count: 12 })).toBe("unreadable");
  });

  it("is loading until the list and the catalog have both answered", () => {
    // A roster that arrives before the catalog is short of its catalog machines.
    expect(floorStateOf({ loading: true, failed: false, count: 5 })).toBe("loading");
  });

  it("is empty when read and nothing is on it, ready when something is", () => {
    expect(floorStateOf({ loading: false, failed: false, count: 0 })).toBe("empty");
    expect(floorStateOf({ loading: false, failed: false, count: 20 })).toBe("ready");
  });
});

describe("a unit's preset", () => {
  const legPress = {
    dials: [
      { key: "gap", label: "Gap" },
      { key: "seat-angle", label: "Seat Angle" },
      { key: "shoulder-pads", label: "Shoulder Pads" },
      { key: "seat-distance", label: "Seat Distance" },
    ],
    dialDefaults: { gap: "4" },
  };

  it("reads the studio's own setup first, by label", () => {
    const p = presetOf(legPress, {
      settingOptions: ["Gap", "Seat Angle", "Shoulder Pads", "Seat Distance"],
      standardSettings: { Gap: "3", "Seat Angle": "P2", "Shoulder Pads": "3", "Seat Distance": "8" },
    });
    expect(p.state).toBe("set");
    expect(presetLine(p)).toBe("Gap 3 · Seat Angle P2 · Shoulder Pads 3 · Seat Distance 8");
  });

  it("falls back to the unit's dial defaults, and counts what is not set", () => {
    const p = presetOf(legPress, null);
    expect(p.state).toBe("partial");
    expect(presetLine(p)).toBe("Gap 4 · 3 not set");
  });

  it("matches a studio label to a dial however it was spelled", () => {
    const p = presetOf(legPress, { settingOptions: ["gap"], standardSettings: { GAP: "5" } });
    expect(presetLine(p)).toBe("gap 5");
  });

  it("says a unit with dials and no numbers has none yet, never a guess", () => {
    expect(presetLine(presetOf({ dials: legPress.dials }, {}))).toBe("No numbers set for this unit yet");
  });

  it("says when no dial is recorded at all", () => {
    expect(presetLine(presetOf({}, null))).toBe("No dials recorded for this unit");
  });

  it("ignores a blank value rather than showing an empty dial", () => {
    const p = presetOf({ dials: [{ key: "gap", label: "Gap" }] }, { standardSettings: { Gap: "  " } });
    expect(p.state).toBe("none");
  });
});

describe("the floor in one sentence", () => {
  it("says how many, in walking order, and what needs noticing", () => {
    expect(floorSentence({ count: 20, outOfService: 1, flagged: 2 })).toBe(
      "20 machines in walking order · 1 out of service · 2 flagged",
    );
    expect(floorSentence({ count: 1, outOfService: 0, flagged: 0 })).toBe("1 machine in walking order");
  });

  it("says nothing about flags while they load, and says so when they failed", () => {
    expect(floorSentence({ count: 3, outOfService: 0, flagged: null })).toBe("3 machines in walking order");
    expect(floorSentence({ count: 3, outOfService: 0, flagged: null, flagsFailed: true })).toBe(
      "3 machines in walking order · flags couldn't be read",
    );
  });
});

describe("a flag, as the page says it", () => {
  it("names who by first name, when in the studio's zone, and the note", () => {
    // 12:52 UTC is 8:52 AM Eastern on Sep 27 2026.
    const line = flagLineOf(
      { note: "  Seat pin sticks. ", by: { name: "Bergil Guard" }, at: Date.UTC(2026, 8, 27, 12, 52) },
      "America/New_York",
    );
    expect(line).toEqual({ who: "Bergil", when: "Sep 27, 8:52 AM", note: "Seat pin sticks." });
  });

  it("never invents a time or a name it does not have", () => {
    expect(flagLineOf({ note: "Loose pad", by: { name: "" }, at: 0 })).toEqual({
      who: "a trainer",
      when: null,
      note: "Loose pad",
    });
  });
});
