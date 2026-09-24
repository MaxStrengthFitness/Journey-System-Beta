import { describe, expect, it } from "vitest";
import { CLINICAL_FLAGS_MATRIX } from "../../../data/clinical-matrix";
import type { PainPoint } from "../../subjective-report/types";
import { pronounsOf } from "../kit/pronouns";
import { FLAG_REGIONS, SPOTS, figureLabel, figureMarks, regionRows, type FigureRegion } from "./figure-map";
import type { PainReading } from "./pulse-read";

const NOW = new Date(2027, 2, 24, 12);
const her = pronounsOf({ gender: "Female" });

const point = (over: Partial<PainPoint>): PainPoint => ({
  id: over.id ?? "p1",
  region: "knee",
  side: "right",
  type: "joint",
  severity: 3,
  frequency: "occasional",
  aggravatingMachineIds: [],
  linkedJournalEntryIds: [],
  status: "active",
  ...over,
});

const reading = (
  spots: Array<{ p: PainPoint; word?: string; prev?: { word: string; day: string } | null }>,
): PainReading => ({
  spots: spots.map((s) => ({ point: s.p, word: s.word ?? "Mild", prev: s.prev ?? null })),
  reviewedNone: spots.length === 0,
  day: "2027-03-10",
  source: "report",
});

const rows = (flagIds: string[], pain: PainReading | null = null, machines = new Map<string, { name: string }>()) =>
  regionRows({ flagIds, pain, machinesById: machines, pronouns: her, now: NOW });

describe("where each flag sits", () => {
  it("places EVERY clinical flag, and every place it names has a spot", () => {
    for (const f of CLINICAL_FLAGS_MATRIX) {
      expect(FLAG_REGIONS, f.id).toHaveProperty(f.id);
      for (const region of FLAG_REGIONS[f.id])
        expect(SPOTS[region as FigureRegion], `${f.id} → ${region}`).toBeDefined();
    }
  });

  it("puts a flag's diamond on the midline and her ring on the side she named", () => {
    const marks = figureMarks({ flagIds: ["joint-tka"], painSpots: [point({ side: "right" })] });
    expect(marks).toContainEqual(expect.objectContaining({ kind: "onfile", view: "front", x: 60, y: 203, r: 0 }));
    expect(marks).toContainEqual(expect.objectContaining({ kind: "told", view: "front", x: 49, y: 203, r: 8 }));
  });

  it("draws nothing for an arm flag and says why", () => {
    expect(figureMarks({ flagIds: ["gen-elbow-wrist"], painSpots: [] })).toEqual([]);
    const elbow = rows(["gen-elbow-wrist"]).find((r) => r.region === "elbow")!;
    expect(elbow.sentences).toContain("No side on file, so it isn't drawn.");
    expect(elbow.drawn).toBe(false);
  });

  it("puts a centre-line spot on the midline, and both sides as two rings", () => {
    expect(figureMarks({ flagIds: [], painSpots: [point({ region: "neck", side: "center" })] })).toEqual([
      expect.objectContaining({ x: 60, y: 41, r: 7 }),
    ]);
    expect(figureMarks({ flagIds: [], painSpots: [point({ region: "shoulder", side: "both" })] })).toHaveLength(2);
  });

  it("gives a resolved spot no ring", () => {
    expect(figureMarks({ flagIds: [], painSpots: [point({ status: "resolved" })] })).toEqual([]);
  });

  it("draws the glutes and hamstrings on the back, client's right on the viewer's right", () => {
    const [mark] = figureMarks({ flagIds: [], painSpots: [point({ region: "glute", side: "right" })] });
    expect(mark).toMatchObject({ view: "back", x: 71 });
  });

  it("names what is marked on each view for a screen reader", () => {
    const marks = figureMarks({ flagIds: ["joint-tka"], painSpots: [point({})] });
    expect(figureLabel("front", marks, her)).toBe(
      "Front of the body: a watch-out on file at the knee; she told us about the knee",
    );
    expect(figureLabel("back", marks, her)).toBe("Back of the body, nothing marked");
  });
});

describe("the region list", () => {
  it("says both sources for a knee, each with its source and date", () => {
    const [knee] = rows(
      ["joint-tka"],
      reading([
        {
          p: point({ aggravatingMachineIds: ["m-leg"], note: "Seat too close" }),
          prev: { word: "Moderate", day: "2026-09-16" },
        },
      ]),
      new Map([["m-leg", { name: "Leg Press" }]]),
    );
    expect(knee.meta).toBe("on file + she told us");
    expect(knee.sentences).toEqual([
      "On file: Total Knee Replacement (TKA).",
      "The flag doesn't record a side, so the diamond sits on the midline.",
      "She told us: right knee, Mild (Pulse, Mar 10), Moderate on Sep 16, 2026.",
      "Brought on by Leg Press.",
      "“Seat too close”",
    ]);
  });

  it("lists the whole-body flags and any id the clinical list does not have", () => {
    const whole = rows(["gen-blood-pressure", "not-a-flag"]).find((r) => r.region === "whole")!;
    expect(whole.label).toBe("Whole body");
    expect(whole.sentences).toEqual([
      "On file: High blood pressure — managed.",
      "It doesn't belong to one spot, so it isn't drawn.",
      "Not in the studio's clinical list: not-a-flag.",
    ]);
  });

  it("orders both, then on file, then told, head to foot within each; whole body last", () => {
    const list = rows(
      ["gen-knee", "gen-neck", "gen-balance"],
      reading([{ p: point({ region: "ankle", side: "left" }) }, { p: point({ id: "k" }) }]),
    );
    expect(list.map((r) => r.region)).toEqual(["knee", "neck", "ankle", "whole"]);
  });

  it("uses her pronoun, and 'they' when Mindbody has no gender", () => {
    const told = regionRows({
      flagIds: [],
      pain: reading([{ p: point({}) }]),
      machinesById: new Map(),
      pronouns: pronounsOf({}),
      now: NOW,
    })[0];
    expect(told.meta).toBe("they told us");
    expect(told.sentences[0]).toMatch(/^They told us: right knee, Mild/);
  });

  it("says what was tapped at the door when the track hands it in", () => {
    const [knee] = regionRows({
      flagIds: [],
      pain: null,
      machinesById: new Map(),
      door: new Map([["knee", { k: 3, n: 12, latest: { word: "Stiff", day: "2027-03-20" } }]]),
      pronouns: her,
      now: NOW,
    });
    expect(knee.meta).toBe("at the door");
    expect(knee.sentences).toEqual(["At the door: “Stiff” on Mar 20 · tapped at 3 of her last 12 sessions."]);
  });

  it("says one session plainly at the door", () => {
    const [knee] = regionRows({
      flagIds: [],
      pain: null,
      machinesById: new Map(),
      door: new Map([["knee", { k: 1, n: 1, latest: { word: "Pain", day: "2027-03-20" } }]]),
      pronouns: her,
      now: NOW,
    });
    expect(knee.sentences).toEqual(["At the door: “Pain” on Mar 20 · tapped at her one session in these six months."]);
  });

  it("says the count is of her sessions run in Journey when imported or logged ones were left out", () => {
    const row = (taps: { k: number; n: number }) =>
      regionRows({
        flagIds: [],
        pain: null,
        machinesById: new Map(),
        door: new Map([["knee", { ...taps, runOnly: true, latest: { word: "Stiff", day: "2027-03-20" } }]]),
        pronouns: her,
        now: NOW,
      })[0];
    expect(row({ k: 2, n: 5 }).sentences).toEqual([
      "At the door: “Stiff” on Mar 20 · tapped at 2 of her last 5 sessions run in Journey.",
    ]);
    expect(row({ k: 1, n: 1 }).sentences).toEqual([
      "At the door: “Stiff” on Mar 20 · tapped at her one session run in Journey in these six months.",
    ]);
  });
});
