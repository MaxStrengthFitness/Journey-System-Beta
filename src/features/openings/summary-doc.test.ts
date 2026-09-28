import { describe, expect, it } from "vitest";
import {
  OPENINGS_WATCH_ID,
  STALE_DAYS,
  SUMMARY_VERSION,
  cellFor,
  cellForWrite,
  historyOf,
  isEmptyCell,
  isStale,
  readSummary,
  summaryForWrite,
  type OpeningsSummary,
} from "./summary-doc";

const summary = (over: Partial<OpeningsSummary> = {}): OpeningsSummary => ({
  v: 1,
  builtAt: "2026-11-08T07:00:00.000Z",
  tz: "America/New_York",
  row: 30,
  since: "2026-09-14",
  weeks: [
    { m: "2026-11-02", d: { "1": { n: 4, j: 1 }, "2": { n: 3, q: "a" }, "3": { n: 5, x: "r" } } },
    { m: "2026-10-26", d: { "1": { n: 0, x: "c" } } },
  ],
  who: { "0": { id: "t-pat", n: "Pat Moss" }, "1": { id: "t-sam", n: "Sam Lee" } },
  agreed: { "1": [{ from: "2026-09-01", to: null, blocks: ["1-0700-1000"] }] },
  cells: { "1-0800": { "0": { s: "f", b: 2, i: ["0", "1"] } } },
  ...over,
});

describe("the stored summary", () => {
  it("lives at studios/{s}/watch/openings, version 1", () => {
    expect(OPENINGS_WATCH_ID).toBe("openings");
    expect(SUMMARY_VERSION).toBe(1);
    expect(STALE_DAYS).toBe(8);
  });

  it("stores a cell tersely: zero counts and an empty list left out", () => {
    expect(cellForWrite({ word: "room", booked: 1, rotation: 0, cancelled: 0, late: 0, inKeys: ["0"] })).toEqual({ s: "r", b: 1, i: ["0"] });
    expect(cellForWrite({ word: "out", booked: 0, rotation: 0, cancelled: 0, late: 0, inKeys: [] })).toEqual({ s: "o" });
    expect(isEmptyCell({ s: "o" }, true)).toBe(true);
    expect(isEmptyCell({ s: "b" }, false)).toBe(true);
    expect(isEmptyCell({ s: "b" }, true)).toBe(false);
    expect(isEmptyCell({ s: "o", c: 1 }, true)).toBe(false);
  });

  it("puts back the cell a counted week leaves out, and none for a week that didn't count", () => {
    const s = summary();
    expect(cellFor(s, "1-0800", 0)).toEqual({ word: "full", booked: 2, rotation: 0, cancelled: 0, late: 0, inKeys: ["0", "1"] });
    expect(cellFor(s, "1-0900", 0)).toMatchObject({ word: "out", booked: 0 });
    expect(cellFor(s, "2-0900", 0)).toMatchObject({ word: "booked", booked: 0 });
    expect(cellFor(s, "3-0900", 0)).toBeNull();
    expect(cellFor(s, "1-0800", 1)).toBeNull();
    expect(cellFor(s, "1-0800", 5)).toBeNull();
    expect(cellFor(s, "bad", 0)).toBeNull();
  });

  it("writes nothing undefined, and a running version without its `to`", () => {
    const written = summaryForWrite(summary({ cells: { "1-0800": { "0": { s: "f", b: undefined } } } }));
    expect(JSON.stringify(written)).not.toContain("undefined");
    expect(written.agreed["1"][0]).toEqual({ from: "2026-09-01", blocks: ["1-0700-1000"] });
    expect(Object.keys(written.cells["1-0800"]["0"])).toEqual(["s"]);
  });

  it("carries the agreed weeks back by trainers/{id}", () => {
    expect(historyOf(summary())).toEqual({ "t-sam": [{ from: "2026-09-01", to: null, blocks: ["1-0700-1000"] }] });
  });
});

describe("readSummary", () => {
  it("never built is none; another version, or not a summary, is unreadable", () => {
    expect(readSummary(undefined)).toEqual({ state: "none" });
    expect(readSummary(null)).toEqual({ state: "none" });
    expect(readSummary({ ...summary(), v: 2 })).toEqual({ state: "unreadable" });
    expect(readSummary("text")).toEqual({ state: "unreadable" });
    expect(readSummary({ ...summary(), builtAt: "never" })).toEqual({ state: "unreadable" });
    expect(readSummary({ ...summary(), weeks: [{ m: "bad", d: {} }] })).toEqual({ state: "unreadable" });
  });

  it("reads a Firestore Timestamp's built time", () => {
    const r = readSummary({ ...summary(), builtAt: { toDate: () => new Date("2026-11-08T07:00:00Z") } });
    expect(r.state === "ok" && r.summary.builtAt).toBe("2026-11-08T07:00:00.000Z");
  });

  it("leaves out anything malformed inside, rather than guessing", () => {
    const r = readSummary({
      ...summary(),
      who: { "0": { id: "t-pat", n: "Pat Moss" }, "1": { id: "t-sam", n: "Sam Lee" }, "2": { n: "No id" } },
      cells: {
        "1-0800": { "0": { s: "f", b: 2, i: ["0", "1", "9"] }, "1": { s: "?" }, "9": { s: "f" } },
        "1-0815": { "0": { s: "f" } },
        "7-0800": { "0": { s: "f" } },
        "1-0900": { "0": { s: "r", b: -1, c: 1.5 } },
      },
      agreed: { "1": [{ from: "2026-09-01", blocks: ["1-0700-1000", "junk"] }], "9": [{ from: "2026-09-01", blocks: [] }] },
    });
    expect(r.state).toBe("ok");
    if (r.state !== "ok") return;
    expect(Object.keys(r.summary.who)).toEqual(["0", "1"]);
    expect(r.summary.cells).toEqual({ "1-0800": { "0": { s: "f", b: 2, i: ["0", "1"] } }, "1-0900": { "0": { s: "r" } } });
    expect(r.summary.agreed).toEqual({ "1": [{ from: "2026-09-01", to: null, blocks: ["1-0700-1000"] }] });
  });

  it("a counted day without its judged mark is read as not judged", () => {
    const r = readSummary({ ...summary(), weeks: [{ m: "2026-11-02", d: { "1": { n: 4 } } }] });
    expect(r.state === "ok" && r.summary.weeks[0].d["1"]).toEqual({ n: 4 });
  });
});

describe("isStale", () => {
  it("a summary more than eight days old shows its date plainly", () => {
    const s = summary();
    expect(isStale(s, new Date("2026-11-16T06:59:00Z"))).toBe(false);
    expect(isStale(s, new Date("2026-11-16T07:01:00Z"))).toBe(true);
    expect(isStale({ builtAt: "never" }, new Date())).toBe(true);
  });
});
