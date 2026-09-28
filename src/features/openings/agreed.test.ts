import { describe, expect, it } from "vitest";
import type { StandingWeekDoc } from "../standing-week/week";
import {
  blockKey,
  blocksIn,
  blocksOf,
  carryHistory,
  currentVersions,
  normalizeVersions,
  parseBlock,
  rowsCovered,
  takesClientsAt,
  versionOn,
} from "./agreed";

const TZ = "America/New_York";

const doc = (over: Partial<StandingWeekDoc> = {}): StandingWeekDoc => ({
  id: "uid-sam",
  studioId: "westlake",
  trainerUid: "uid-sam",
  trainerId: "t-sam",
  trainerName: "Sam Lee",
  proposed: null,
  final: { hours: [{ weekday: 1, from: "07:00", to: "13:00" }], regulars: [] },
  finalAt: new Date("2026-09-14T15:00:00Z"),
  ...over,
});

describe("blocks", () => {
  it("are stored flat, weekday and both ends", () => {
    expect(blockKey({ weekday: 1, from: "07:00", to: "13:00" })).toBe("1-0700-1300");
    expect(parseBlock("1-0700-1300")).toEqual({ weekday: 1, from: "07:00", to: "13:00" });
    for (const bad of ["1-1300-0700", "7-0700-1300", "1-0760-1300", 5, null]) expect(parseBlock(bad)).toBeNull();
    expect(blocksOf([{ weekday: 2, from: "16:00", to: "19:00" }, { weekday: 1, from: "07:00", to: "13:00" }])).toEqual(["1-0700-1300", "2-1600-1900"]);
  });

  it("a trainer takes clients at a half-hour only when a block covers the whole of it", () => {
    const blocks = [{ weekday: 1, from: "07:00", to: "08:15" }];
    expect(takesClientsAt(blocks, 1, 7 * 60 + 30)).toBe(true);
    expect(takesClientsAt(blocks, 1, 8 * 60)).toBe(false);
    expect(takesClientsAt(blocks, 2, 7 * 60)).toBe(false);
    expect(rowsCovered([{ weekday: 1, from: "06:45", to: "08:00" }], 1)).toEqual([420, 450]);
  });
});

describe("currentVersions", () => {
  it("each agreed week is in force from the studio day it was agreed, by trainers/{id}", () => {
    // Agreed 11:30 PM Eastern on Sep 13 is Sep 14 UTC: the studio's day decides.
    const v = currentVersions([doc({ finalAt: new Date("2026-09-14T03:30:00Z") })], "2026-10-04", TZ);
    expect(v).toEqual({ "t-sam": { from: "2026-09-13", to: null, blocks: ["1-0700-1300"] } });
  });

  it("a trainer whose sign-in id differs from their trainer id is keyed by the trainer id", () => {
    const v = currentVersions([doc({ id: "uid-kim", trainerUid: "uid-kim", trainerId: "t-kim" })], "2026-10-04", TZ);
    expect(Object.keys(v)).toEqual(["t-kim"]);
  });

  it("an agreement whose day can't be read says nothing about the past; a proposal alone is no agreement", () => {
    expect(currentVersions([doc({ finalAt: null })], "2026-10-04", TZ)["t-sam"].from).toBe("2026-10-04");
    expect(currentVersions([doc({ final: null, proposed: { hours: [], regulars: [] } })], "2026-10-04", TZ)).toEqual({});
  });
});

describe("carryHistory — the versions kept", () => {
  const A = { from: "2026-09-01", to: null, blocks: ["1-0600-1200"] };

  it("the first run knows only the current version, from the day it was agreed", () => {
    const h = carryHistory(null, { "t-sam": { from: "2026-09-14", to: null, blocks: ["1-0700-1300"] } }, { keepFrom: "2026-08-10", previousBuilt: null });
    expect(h).toEqual({ "t-sam": [{ from: "2026-09-14", to: null, blocks: ["1-0700-1300"] }] });
  });

  it("an agreed week changed mid-window: the old version is closed the day before, and kept", () => {
    const h = carryHistory({ "t-sam": [A] }, { "t-sam": { from: "2026-10-14", to: null, blocks: ["1-0800-1400"] } }, { keepFrom: "2026-08-24", previousBuilt: "2026-10-11" });
    expect(h["t-sam"]).toEqual([
      { from: "2026-09-01", to: "2026-10-13", blocks: ["1-0600-1200"] },
      { from: "2026-10-14", to: null, blocks: ["1-0800-1400"] },
    ]);
    expect(versionOn(h["t-sam"], "2026-10-12")?.blocks).toEqual(["1-0600-1200"]);
    expect(versionOn(h["t-sam"], "2026-10-14")?.blocks).toEqual(["1-0800-1400"]);
    expect(versionOn(h["t-sam"], "2026-08-31")).toBeNull();
  });

  it("the same blocks agreed again keep the older start", () => {
    const h = carryHistory({ "t-sam": [A] }, { "t-sam": { from: "2026-10-14", to: null, blocks: ["1-0600-1200"] } }, { keepFrom: "2026-08-24", previousBuilt: "2026-10-11" });
    expect(h["t-sam"]).toEqual([{ from: "2026-09-01", to: null, blocks: ["1-0600-1200"] }]);
  });

  it("a week that is gone is closed on the day last Sunday's summary was built", () => {
    const h = carryHistory({ "t-sam": [A] }, {}, { keepFrom: "2026-08-24", previousBuilt: "2026-10-11" });
    expect(h["t-sam"]).toEqual([{ from: "2026-09-01", to: "2026-10-11", blocks: ["1-0600-1200"] }]);
    // Without a build day there is no last day Journey saw it: it drops.
    expect(carryHistory({ "t-sam": [A] }, {}, { keepFrom: "2026-08-24", previousBuilt: null })).toEqual({});
  });

  it("versions that ended before the window drop off", () => {
    const old = { from: "2026-06-01", to: "2026-07-31", blocks: ["1-0500-0900"] };
    const h = carryHistory({ "t-sam": [old, { ...A, from: "2026-08-01" }] }, { "t-sam": { from: "2026-08-01", to: null, blocks: ["1-0600-1200"] } }, { keepFrom: "2026-08-24", previousBuilt: "2026-10-11" });
    expect(h["t-sam"]).toEqual([{ from: "2026-08-01", to: null, blocks: ["1-0600-1200"] }]);
  });

  it("a new hire's first agreement starts their history; nothing before it", () => {
    const h = carryHistory({ "t-sam": [A] }, { "t-sam": { ...A }, "t-new": { from: "2026-10-20", to: null, blocks: ["2-0900-1500"] } }, { keepFrom: "2026-08-24", previousBuilt: "2026-10-18" });
    expect(h["t-new"]).toEqual([{ from: "2026-10-20", to: null, blocks: ["2-0900-1500"] }]);
    expect(versionOn(h["t-new"], "2026-10-19")).toBeNull();
    expect(blocksIn(versionOn(h["t-new"], "2026-10-20"))).toEqual([{ weekday: 2, from: "09:00", to: "15:00" }]);
  });

  it("stored versions are read safely: malformed ones left out, overlaps trimmed", () => {
    expect(
      normalizeVersions([
        { from: "2026-09-01", to: null, blocks: ["1-0600-1200", "junk"] },
        { from: "2026-10-01", to: null, blocks: [] },
        { from: "bad", to: null, blocks: [] },
        { from: "2026-10-05", to: "2026-10-01", blocks: [] },
        null,
      ]),
    ).toEqual([
      { from: "2026-09-01", to: "2026-09-30", blocks: ["1-0600-1200"] },
      { from: "2026-10-01", to: null, blocks: [] },
    ]);
  });
});
