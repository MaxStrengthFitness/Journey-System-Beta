import { describe, expect, it } from "vitest";
import { LEG_PRESS_HISTORY, TODAY } from "./fixtures";
import { SETTING_CHANGES_WORDS, settingChangeRows, settingChangesTitle } from "./setting-changes";
import { UNDO_REASON, parseSettingHistory } from "./setting-history";

const rows = parseSettingHistory(LEG_PRESS_HISTORY, "avery");

describe("the Setting changes list", () => {
  it("lists every settings row and the starting-weight change, newest first, old → new · reason · who · day", () => {
    const list = settingChangeRows(rows, TODAY);
    expect(list.map((r) => `${r.what} · ${r.detail}`)).toEqual([
      "Back pad 3 → 2 · Comfort or fit · Theo Marsh · Aug 18",
      "Starting weight 84 → 80 lb · Weight update · Ana Cole · Feb 20",
      "Seat 4 → 5 · Range of motion · Sam Reyes · Jan 13",
      "Seat — → 4, Back pad — → 3, Foot plate — → High · Initial setup · Sam Reyes · Sep 9 2025",
    ]);
  });

  it("leaves out a WEIGHT row that moved only today's weight", () => {
    const only = parseSettingHistory(
      [{ id: "w", clientId: "avery", timestamp: "2026-09-01T10:00:00-04:00", changeType: "WEIGHT", oldValue: "Current: 92", newValue: "Current: 94", reason: "Weight update" }],
      "avery",
    );
    expect(settingChangeRows(only, TODAY)).toEqual([]);
  });

  it("lists a Save and its Undo both, honestly", () => {
    const withUndo = parseSettingHistory(
      [
        ...LEG_PRESS_HISTORY,
        { id: "s", clientId: "avery", timestamp: "2026-10-01T10:00:00-04:00", changeType: "SETTINGS", oldValue: "Seat: 5", newValue: "Seat: 6", reason: "Comfort or fit", trainerName: "Ana Cole" },
        { id: "u", clientId: "avery", timestamp: "2026-10-01T10:00:05-04:00", changeType: "SETTINGS", oldValue: "Seat: 6", newValue: "Seat: 5", reason: UNDO_REASON, trainerName: "Ana Cole" },
      ],
      "avery",
    );
    const list = settingChangeRows(withUndo, TODAY);
    expect(list.slice(0, 2).map((r) => `${r.what} · ${r.detail}`)).toEqual([
      "Seat 6 → 5 · Undone · Ana Cole · Oct 1",
      "Seat 5 → 6 · Comfort or fit · Ana Cole · Oct 1",
    ]);
  });

  it("shows a row whose words can't be paired as it was written, never guessed at", () => {
    const odd = parseSettingHistory([{ id: "x", clientId: "avery", changeType: "MASS_APPLY", oldValue: "", newValue: "standards" }], "avery");
    expect(settingChangeRows(odd, TODAY)).toEqual([{ id: "x", what: "— → standards", detail: "" }]);
  });

  it("titles the row with its count, and says where the weights that aren't listed live", () => {
    expect(settingChangesTitle(4)).toBe("Setting changes (4)");
    expect(settingChangesTitle(null)).toBe("Setting changes");
    expect(SETTING_CHANGES_WORDS.foot).toBe(
      "Today's weight is set on the Now Bar and the next session's at the Wrap-up; those aren't listed here.",
    );
    expect(SETTING_CHANGES_WORDS.failed).toBe("Couldn't load setting changes");
    expect(Object.values(SETTING_CHANGES_WORDS).join("\n")).not.toMatch(/\b(her|she|his|he)\b/i);
  });
});
