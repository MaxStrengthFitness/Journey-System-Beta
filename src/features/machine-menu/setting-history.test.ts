import { describe, expect, it } from "vitest";
import { LEG_PRESS_HISTORY } from "./fixtures";
import {
  UNDO_REASON,
  cancelledRowIds,
  labelKey,
  lastChange,
  lastChangedLine,
  netChanges,
  pairsWords,
  parseSettingHistory,
  parseSettingPairs,
  placeRows,
  typedReason,
  type SettingHistoryDoc,
} from "./setting-history";

const row = (over: SettingHistoryDoc): SettingHistoryDoc => ({
  clientId: "c1",
  changeType: "SETTINGS",
  trainerName: "Sam Reyes",
  ...over,
});

describe("reading a row's words", () => {
  it("pairs each dial's old and new value, an empty dial as empty", () => {
    expect(parseSettingPairs("Seat: —, Back pad: 3", "Seat: 4, Back pad: 2")).toEqual([
      { label: "Seat", from: "", to: "4" },
      { label: "Back pad", from: "3", to: "2" },
    ]);
  });

  it("keeps a value with a comma in it whole", () => {
    expect(parseSettingPairs("Handle: Low, wide, Seat: 4", "Handle: High, narrow, Seat: 4")).toEqual([
      { label: "Handle", from: "Low, wide", to: "High, narrow" },
      { label: "Seat", from: "4", to: "4" },
    ]);
  });

  it("never guesses at a row it can't read", () => {
    expect(parseSettingPairs("Mass-applied", "standards")).toBeNull();
    expect(parseSettingPairs("Seat: 4", "Seat: 5, Back pad: 2")).toBeNull();
    expect(parseSettingPairs("Seat: 4", "Back pad: 2")).toBeNull();
    expect(parseSettingPairs("", "Seat: 4")).toBeNull();
  });

  it("compares labels without case or punctuation", () => {
    expect(labelKey("Back Pad")).toBe(labelKey("back-pad"));
  });
});

describe("parseSettingHistory", () => {
  it("keeps settings and set-up rows, and a WEIGHT row only when it moves the starting weight", () => {
    const rows = parseSettingHistory(
      [
        ...LEG_PRESS_HISTORY,
        row({ id: "w2", changeType: "WEIGHT", timestamp: "2026-03-01T10:00:00-05:00", oldValue: "Current: 92", newValue: "Current: 94", reason: "Weight update" }),
        row({ id: "w3", changeType: "WEIGHT", timestamp: "2026-03-02T10:00:00-05:00", oldValue: "Start: 80, Current: 94", newValue: "Start: 80, Current: 96" }),
      ],
      "avery",
    );
    // w2 and w3 move only today's weight: left out.
    expect(rows.map((r) => [r.id, r.kind])).toEqual([
      ["h1", "setup"],
      ["h2", "settings"],
      ["h3", "start-weight"],
      ["h4", "settings"],
    ]);
    expect(rows[2].pairs).toEqual([{ label: "Starting weight", from: "84", to: "80" }]);
    expect(rows[1]).toMatchObject({ day: "2026-01-13", reason: "Range of motion", trainerName: "Sam Reyes", isUndo: false });
  });

  it("reads a starting weight set for the first time ('None' is no weight)", () => {
    const [r] = parseSettingHistory([
      row({ id: "w", changeType: "WEIGHT", timestamp: "2026-03-01T10:00:00-05:00", oldValue: "Start: None, Current: None", newValue: "Start: 80, Current: 80" }),
    ]);
    expect(r.pairs).toEqual([{ label: "Starting weight", from: "", to: "80" }]);
  });

  it("puts a row with no time first, keeps it for the list, and skips another client's row", () => {
    const rows = parseSettingHistory(
      [
        row({ id: "late", timestamp: "2026-05-01T10:00:00-04:00", oldValue: "Seat: 4", newValue: "Seat: 5" }),
        row({ id: "old", oldValue: "Seat: 3", newValue: "Seat: 4" }),
        row({ id: "x", clientId: "other", timestamp: "2026-05-02T10:00:00-04:00", oldValue: "Seat: 1", newValue: "Seat: 2" }),
      ],
      "c1",
    );
    expect(rows.map((r) => [r.id, r.at === null])).toEqual([
      ["old", true],
      ["late", false],
    ]);
  });

  it("reads the studio's day for a row saved late in the evening", () => {
    const [r] = parseSettingHistory([row({ id: "r", timestamp: "2026-09-09T02:30:00.000Z", oldValue: "Seat: 4", newValue: "Seat: 5" })]);
    expect(r.day).toBe("2026-09-08");
  });
});

describe("netting, Save and Undo", () => {
  const save = row({ id: "s", timestamp: "2026-09-03T10:00:00-04:00", oldValue: "Seat: 4", newValue: "Seat: 5", reason: "Comfort or fit" });
  const undo = row({ id: "u", timestamp: "2026-09-03T10:00:09-04:00", oldValue: "Seat: 5", newValue: "Seat: 4", reason: UNDO_REASON });

  it("nets each dial's first old value against its last new one", () => {
    const rows = parseSettingHistory([
      save,
      row({ id: "t", timestamp: "2026-09-04T10:00:00-04:00", oldValue: "Seat: 5, Back pad: 3", newValue: "Seat: 6, Back pad: 2" }),
    ]);
    expect(netChanges(rows)).toEqual([
      { label: "Seat", from: "4", to: "6" },
      { label: "Back pad", from: "3", to: "2" },
    ]);
  });

  it("nets a Save and its Undo to nothing, and pairs them", () => {
    const rows = parseSettingHistory([save, undo]);
    expect(netChanges(rows)).toEqual([]);
    expect([...cancelledRowIds(rows)].sort()).toEqual(["s", "u"]);
    expect(rows[1].isUndo).toBe(true);
  });

  it("never pairs an Undo that doesn't exactly reverse the Save", () => {
    const partial = row({ id: "p", timestamp: "2026-09-03T10:00:09-04:00", oldValue: "Seat: 5", newValue: "Seat: 3", reason: UNDO_REASON });
    expect(cancelledRowIds(parseSettingHistory([save, partial])).size).toBe(0);
  });

  it("leaves the starting weight out of the dials' netting", () => {
    expect(netChanges(parseSettingHistory(LEG_PRESS_HISTORY))).toEqual([
      { label: "Seat", from: "", to: "5" },
      { label: "Back pad", from: "", to: "2" },
      { label: "Foot plate", from: "", to: "High" },
    ]);
  });
});

describe("Last changed", () => {
  const rows = parseSettingHistory(LEG_PRESS_HISTORY);

  it("says the newest change that still stands", () => {
    expect(lastChange(rows)?.id).toBe("h4");
    expect(lastChangedLine(rows, { today: "2026-10-04" })).toBe("Last changed Aug 18 · Back pad 3 → 2");
  });

  it("skips a Save and its Undo together", () => {
    const more = parseSettingHistory([
      ...LEG_PRESS_HISTORY,
      row({ id: "s", timestamp: "2026-09-20T10:00:00-04:00", oldValue: "Seat: 5", newValue: "Seat: 6", reason: "Comfort or fit" }),
      row({ id: "u", timestamp: "2026-09-20T10:00:05-04:00", oldValue: "Seat: 6", newValue: "Seat: 5", reason: UNDO_REASON }),
    ]);
    expect(lastChangedLine(more, { today: "2026-10-04" })).toBe("Last changed Aug 18 · Back pad 3 → 2");
  });

  it("says the year when it isn't this one, and says so when there is nothing, or the read failed", () => {
    expect(lastChangedLine(rows, { today: "2027-02-01" })).toBe("Last changed Aug 18 2026 · Back pad 3 → 2");
    expect(lastChangedLine([], { today: "2026-10-04" })).toBe("No settings saved yet");
    expect(lastChangedLine(null, { today: "2026-10-04" })).toBe("Changes couldn't be loaded");
    expect(lastChangedLine(rows, { today: "2026-10-04", failed: true })).toBe("Changes couldn't be loaded");
  });

  it("knows a typed reason from the writer's default", () => {
    expect(typedReason({ reason: "Comfort or fit" })).toBe("Comfort or fit");
    expect(typedReason({ reason: "Settings update" })).toBeNull();
    expect(typedReason({ reason: "Initial setup" })).toBeNull();
    expect(typedReason({ reason: "  " })).toBeNull();
    expect(pairsWords([{ label: "Seat", from: "", to: "4" }])).toBe("Seat — → 4");
  });
});

describe("placeRows: where a change falls among the sessions", () => {
  const cols = [
    { day: "2026-09-01", loggedAt: null, loggedDay: null },
    { day: "2026-09-08", loggedAt: Date.parse("2026-09-08T10:05:00-04:00"), loggedDay: "2026-09-08" },
    { day: "2026-09-15", loggedAt: Date.parse("2026-09-20T12:00:00-04:00"), loggedDay: "2026-09-20" },
  ];
  const at = (iso: string) => parseSettingHistory([row({ id: iso, timestamp: iso, oldValue: "Seat: 4", newValue: "Seat: 5" })]);

  it("sits between the sessions either side of its day", () => {
    expect(placeRows(at("2026-09-04T09:00:00-04:00"), cols)[0]).toMatchObject({ gap: 1, sameDayUnsure: false });
    expect(placeRows(at("2026-08-01T09:00:00-04:00"), cols)[0]).toMatchObject({ gap: 0 });
    expect(placeRows(at("2026-09-30T09:00:00-04:00"), cols)[0]).toMatchObject({ gap: 3 });
  });

  it("goes before or after a same-day session by the set's own write time, both ways", () => {
    expect(placeRows(at("2026-09-08T10:00:00-04:00"), cols)[0]).toMatchObject({ gap: 1, sameDayUnsure: false });
    expect(placeRows(at("2026-09-08T10:30:00-04:00"), cols)[0]).toMatchObject({ gap: 2, sameDayUnsure: false });
  });

  it("can't tell which came first when the set was entered on another day, or has no time", () => {
    expect(placeRows(at("2026-09-15T10:00:00-04:00"), cols)[0]).toMatchObject({ gap: 2, sameDayUnsure: true });
    expect(placeRows(at("2026-09-01T10:00:00-04:00"), cols)[0]).toMatchObject({ gap: 0, sameDayUnsure: true });
  });

  it("leaves a row with no time to the list", () => {
    const rows = parseSettingHistory([row({ id: "x", oldValue: "Seat: 4", newValue: "Seat: 5" })]);
    expect(placeRows(rows, cols)).toEqual([]);
  });
});
