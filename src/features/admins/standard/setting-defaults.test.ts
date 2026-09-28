import { describe, expect, it } from "vitest";
import { SETTINGS } from "../../studio-settings";
import {
  defaultsRecord,
  fieldProblem,
  formOf,
  formProblem,
  ownLine,
  pairProblem,
  patchOf,
  settingName,
  unusableStored,
  whoSetsTheirOwn,
} from "./setting-defaults";

describe("Studio defaults: the form", () => {
  it("shows each stored default in its box, and an unset one empty", () => {
    const form = formOf({ quietFloorSessions: 3, driftMultiple: 2.5, weeklyMaintenanceDay: null, deepCleanDays: 99999 });
    expect(form.quietFloorSessions).toBe("3");
    expect(form.driftMultiple).toBe("2.5");
    // A weekday's none is its own value, never "not set".
    expect(form.weeklyMaintenanceDay).toBe("none");
    // Out of range is not usable: empty, and said beside the box.
    expect(form.deepCleanDays).toBe("");
    expect(unusableStored({ deepCleanDays: 99999, quietFloorSessions: 3 })).toEqual({ deepCleanDays: "99999" });
    expect(formOf(null).lapsedDays).toBe("");
    expect(Object.keys(formOf(null))).toHaveLength(SETTINGS.length);
  });

  it("writes only what changed, a cleared box taken back to the app's value", () => {
    expect(patchOf({ quietFloorSessions: "3", lapsedDays: "", weeklyMaintenanceDay: "1" })).toEqual({
      quietFloorSessions: 3,
      lapsedDays: "clear",
      weeklyMaintenanceDay: 1,
    });
    expect(patchOf({ weeklyMaintenanceDay: "none" })).toEqual({ weeklyMaintenanceDay: null });
    expect(() => patchOf({ wipeAfterSessions: "2.5" })).toThrow("Wipe after: Enter a number between 1 and 20 (a whole number).");
  });

  it("says a box's problem in words", () => {
    expect(fieldProblem("lapsedDays", "7")).toBe("Enter a number between 14 and 365 (a whole number).");
    expect(fieldProblem("driftMultiple", "2.25")).toBe("Enter a number between 1.2 and 5 (one decimal place at most).");
    expect(fieldProblem("lapsedDays", "")).toBeNull();
  });

  it("keeps Settling in after New, reading an empty box as the app's value", () => {
    const form = formOf(null);
    expect(pairProblem(form)).toBeNull();
    expect(pairProblem({ ...form, newMax: "30" })).toBe(
      "Settling in must end after New: New runs to session 30, so Settling in has to be more than 30.",
    );
    expect(pairProblem({ ...form, newMax: "30", settlingMax: "40" })).toBeNull();
    expect(formProblem({ ...form, lapsedDays: "7" })).toBe("Lapsed after: Enter a number between 14 and 365 (a whole number).");
  });
});

describe("Studio defaults: the Activity record", () => {
  it("says one change in a sentence, from what to what", () => {
    expect(defaultsRecord({ quietFloorSessions: 3 }, null)).toEqual({
      what: "Set Max Strength's default for “A quiet floor” to 3.",
      before: { "A quiet floor": "not set (the app's 2)" },
      after: { "A quiet floor": "3" },
    });
    expect(defaultsRecord({ lapsedDays: "clear" }, { lapsedDays: 60 })).toEqual({
      what: "Took Max Strength's default for “Lapsed after” back to the app's 45.",
      before: { "Lapsed after": "60" },
      after: { "Lapsed after": "not set (the app's 45)" },
    });
    expect(defaultsRecord({ weeklyMaintenanceDay: 1 }, null)!.what).toBe("Set Max Strength's default for “Weekly maintenance on” to Monday.");
  });

  it("names several changes together, and a setting whose label only reads after the one above it by a name of its own", () => {
    expect(defaultsRecord({ driftMinDays: 10, lapsedDays: 60 }, null)!.what).toBe(
      "Changed 2 of Max Strength's studio defaults: “Drifting's shortest wait” and “Lapsed after”.",
    );
    expect(settingName("driftMinDays")).toBe("Drifting's shortest wait");
    expect(defaultsRecord({}, null)).toBeNull();
  });
});

describe("Studio defaults: who sets their own", () => {
  const studios = [
    { id: "edoras", name: "Edoras" },
    { id: "dol-amroth", name: "Dol Amroth", deepCleanIntervalDays: 7 },
    { id: "pelargir", name: "Pelargir" },
    { id: "lossarnach", name: "Lossarnach" },
  ];

  it("counts a studio's own usable values, and the deep clean still kept on the studio", () => {
    const own = whoSetsTheirOwn(studios, {
      edoras: { state: "ok", values: { quietFloorSessions: 1, lapsedDays: 9999 } },
      "dol-amroth": { state: "ok", values: null },
      pelargir: { state: "failed" },
      lossarnach: { state: "ok", values: { quietFloorSessions: 4 } },
    });
    expect(own.byKey.quietFloorSessions).toEqual(["Edoras", "Lossarnach"]);
    // Not usable: it doesn't count as the studio's own.
    expect(own.byKey.lapsedDays).toEqual([]);
    expect(own.byKey.deepCleanDays).toEqual(["Dol Amroth"]);
    // Couldn't read: named, never counted as following the default.
    expect(own.failed).toEqual(["Pelargir"]);
    expect(own.loading).toBe(false);
    expect(whoSetsTheirOwn(studios, {}).loading).toBe(true);
  });

  it("says it quietly", () => {
    expect(ownLine([])).toBeNull();
    expect(ownLine(["Edoras"])).toBe("Edoras sets its own.");
    expect(ownLine(["Edoras", "Pelargir"])).toBe("Edoras and Pelargir set their own.");
    expect(ownLine(["A", "B", "C", "D"])).toBe("4 studios set their own.");
  });
});
