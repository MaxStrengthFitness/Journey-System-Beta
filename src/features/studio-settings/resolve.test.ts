/**
 * THE STUDIO SETTINGS' ONE ANSWER — the studio's own, then Max Strength's
 * default, then the app's; an unusable value is skipped, never bent into one
 * nobody chose (Sep 28 2026).
 */
import { describe, expect, it } from "vitest";
import { SETTINGS } from "./registry";
import { formatSetting, inactiveProblem, parseSetting, resolveAll, resolveSetting, usable } from "./resolve";

describe("resolveSetting", () => {
  it("takes the studio's own first, then head office's, then the app's", () => {
    expect(resolveSetting("quietFloorSessions", { studio: { quietFloorSessions: 3 }, company: { quietFloorSessions: 1 } })).toEqual({
      key: "quietFloorSessions",
      value: 3,
      source: "studio",
    });
    expect(resolveSetting("quietFloorSessions", { studio: {}, company: { quietFloorSessions: 1 } })).toMatchObject({ value: 1, source: "company" });
    expect(resolveSetting("quietFloorSessions", { studio: null, company: null })).toMatchObject({ value: 2, source: "app" });
  });

  it("skips a value that isn't usable instead of bending it", () => {
    // Out of range, the wrong type, a fraction where a whole number belongs.
    expect(resolveSetting("lapsedDays", { studio: { lapsedDays: 5 }, company: { lapsedDays: 60 } })).toMatchObject({ value: 60, source: "company" });
    expect(resolveSetting("lapsedDays", { studio: { lapsedDays: "45" }, company: null })).toMatchObject({ value: 45, source: "app" });
    expect(resolveSetting("driftMinDays", { studio: { driftMinDays: 7.5 }, company: null })).toMatchObject({ value: 7, source: "app" });
    // A multiple keeps one decimal place.
    expect(resolveSetting("driftMultiple", { studio: { driftMultiple: 2.5 }, company: null })).toMatchObject({ value: 2.5, source: "studio" });
    expect(resolveSetting("driftMultiple", { studio: { driftMultiple: 2.55 }, company: null })).toMatchObject({ value: 2, source: "app" });
  });

  it("reads the studio's deep clean from its own document until the settings hold one", () => {
    expect(resolveSetting("deepCleanDays", { studio: null, company: { deepCleanDays: 10 }, studioDoc: { deepCleanIntervalDays: 7 } })).toMatchObject({
      value: 7,
      source: "studio",
    });
    expect(resolveSetting("deepCleanDays", { studio: { deepCleanDays: 3 }, company: null, studioDoc: { deepCleanIntervalDays: 7 } })).toMatchObject({
      value: 3,
      source: "studio",
    });
    expect(resolveSetting("deepCleanDays", { studio: null, company: { deepCleanDays: 10 }, studioDoc: {} })).toMatchObject({ value: 10, source: "company" });
  });

  it("answers when an InBody scan is due: the studio's, head office's, or the app's 50 (FileMaker parity, Oct 1 2026)", () => {
    expect(resolveSetting("inbodyEverySessions", { studio: null, company: null })).toMatchObject({ value: 50, source: "app" });
    expect(resolveSetting("inbodyEverySessions", { studio: null, company: { inbodyEverySessions: 40 } })).toMatchObject({ value: 40, source: "company" });
    expect(resolveSetting("inbodyEverySessions", { studio: { inbodyEverySessions: 24 }, company: { inbodyEverySessions: 40 } })).toMatchObject({
      value: 24,
      source: "studio",
    });
    // Under four sessions, over two hundred, or a fraction: skipped, never bent.
    expect(resolveSetting("inbodyEverySessions", { studio: { inbodyEverySessions: 2 }, company: { inbodyEverySessions: 300 } })).toMatchObject({
      value: 50,
      source: "app",
    });
    expect(resolveSetting("inbodyEverySessions", { studio: { inbodyEverySessions: 30.5 }, company: null })).toMatchObject({ value: 50, source: "app" });
  });

  it("lets a weekday be none on purpose", () => {
    expect(resolveSetting("weeklyMaintenanceDay", { studio: { weeklyMaintenanceDay: null }, company: { weeklyMaintenanceDay: 1 } })).toMatchObject({
      value: null,
      source: "studio",
    });
    expect(resolveSetting("weeklyMaintenanceDay", { studio: {}, company: { weeklyMaintenanceDay: 1 } })).toMatchObject({ value: 1, source: "company" });
    expect(resolveSetting("weeklyMaintenanceDay", { studio: { weeklyMaintenanceDay: 9 }, company: null })).toMatchObject({ value: null, source: "app" });
  });
});

describe("resolveAll", () => {
  it("keeps Settling in after New, falling back together when a layer breaks it", () => {
    const broken = resolveAll({ studio: { newMax: 30, settlingMax: 24 }, company: { newMax: 8, settlingMax: 20 } });
    expect([broken.newMax.value, broken.settlingMax.value]).toEqual([8, 20]);
    expect(broken.newMax.source).toBe("company");
    // Without the studio's layer, the app's New (10) and head office's Settling in (12) agree.
    const mixed = resolveAll({ studio: { newMax: 30 }, company: { settlingMax: 12 } });
    expect([mixed.newMax.value, mixed.settlingMax.value]).toEqual([10, 12]);
    expect([mixed.newMax.source, mixed.settlingMax.source]).toEqual(["app", "company"]);
    // Broken at every layer: the app's own pair.
    const allBroken = resolveAll({ studio: { newMax: 30, settlingMax: 20 }, company: { newMax: 20, settlingMax: 12 } });
    expect([allBroken.newMax.value, allBroken.settlingMax.value]).toEqual([10, 24]);
    expect(allBroken.newMax.source).toBe("app");
    const fine = resolveAll({ studio: { newMax: 5, settlingMax: 12 }, company: null });
    expect([fine.newMax.value, fine.settlingMax.value, fine.newMax.source]).toEqual([5, 12, "studio"]);
  });

  it("answers every setting in the registry, each with a reader", () => {
    const all = resolveAll({ studio: null, company: null });
    for (const def of SETTINGS) {
      expect(all[def.key]).toMatchObject({ key: def.key, value: def.appDefault, source: "app" });
      expect(def.readers.length).toBeGreaterThan(0);
      // The app's own default is always usable, or the fallback would be a lie.
      expect(usable(def, def.appDefault)).toBe(def.appDefault);
    }
  });
});

describe("parseSetting and formatSetting", () => {
  it("turns an editor's text into a value, a clear, or a sentence", () => {
    expect(parseSetting("quietFloorSessions", "3")).toEqual({ value: 3 });
    expect(parseSetting("quietFloorSessions", "  ")).toEqual({ clear: true });
    expect(parseSetting("quietFloorSessions", "13")).toEqual({ error: "Enter a number between 0 and 12 (a whole number)." });
    expect(parseSetting("driftMultiple", "2.5")).toEqual({ value: 2.5 });
    expect(parseSetting("weeklyMaintenanceDay", "none")).toEqual({ value: null });
    expect(parseSetting("weeklyMaintenanceDay", "1")).toEqual({ value: 1 });
  });

  it("shows a weekday by its name", () => {
    expect(formatSetting("weeklyMaintenanceDay", 1)).toBe("Monday");
    expect(formatSetting("weeklyMaintenanceDay", null)).toBe("None");
    expect(formatSetting("lapsedDays", 45)).toBe("45");
  });
});

describe("Inactive after Lapsed (the inactive round, Oct 1 2026)", () => {
  it("is 90 days by default, past the Lapsed line", () => {
    const all = resolveAll({ studio: null, company: null });
    expect(all.inactiveDays).toEqual({ key: "inactiveDays", value: 90, source: "app" });
    expect(all.lapsedDays.value).toBe(45);
  });

  it("takes a studio's own Inactive when it is past the Lapsed line", () => {
    const all = resolveAll({ studio: { inactiveDays: 120 }, company: { inactiveDays: 100 } });
    expect(all.inactiveDays).toMatchObject({ value: 120, source: "studio" });
  });

  it("skips an Inactive that isn't past Lapsed, never bending it, and the next layer answers", () => {
    // The studio's 60 isn't past its own Lapsed of 60: head office's 100 answers.
    const a = resolveAll({ studio: { lapsedDays: 60, inactiveDays: 60 }, company: { inactiveDays: 100 } });
    expect(a.lapsedDays).toMatchObject({ value: 60, source: "studio" });
    expect(a.inactiveDays).toMatchObject({ value: 100, source: "company" });
    // Head office's 50 isn't past the Lapsed of 60 either: the app's 90.
    const b = resolveAll({ studio: { lapsedDays: 60 }, company: { inactiveDays: 50 } });
    expect(b.inactiveDays).toMatchObject({ value: 90, source: "app" });
    // An out-of-range value is skipped as any other is.
    expect(resolveAll({ studio: { inactiveDays: 10 }, company: null }).inactiveDays).toMatchObject({ value: 90, source: "app" });
  });

  it("drops the pair together when nothing beneath is past a late Lapsed line", () => {
    // A studio's Lapsed of 120 with no Inactive past it anywhere: the pair beneath the studio's.
    const a = resolveAll({ studio: { lapsedDays: 120 }, company: { lapsedDays: 50, inactiveDays: 80 } });
    expect(a.lapsedDays).toMatchObject({ value: 50, source: "company" });
    expect(a.inactiveDays).toMatchObject({ value: 80, source: "company" });
    // And the app's own pair when that one breaks the rule too.
    const b = resolveAll({ studio: { lapsedDays: 120 }, company: { lapsedDays: 100 } });
    expect(b.lapsedDays).toMatchObject({ value: 45, source: "app" });
    expect(b.inactiveDays).toMatchObject({ value: 90, source: "app" });
  });

  it("says why a pair can't stand, in words", () => {
    expect(inactiveProblem(45, 90)).toBeNull();
    expect(inactiveProblem(60, 60)).toBe("Inactive has to come after Lapsed: Lapsed is at 60 days, so Inactive has to be more than 60.");
    expect(inactiveProblem(null, 90)).toBeNull();
  });
});
