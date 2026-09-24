import { describe, it, expect } from "vitest";
import {
  changeBetween,
  changeTone,
  checkDraft,
  draftFromScan,
  emptyDraft,
  formatCalledChange,
  formatChange,
  formatMeasure,
  parseNumber,
  reportInBody,
  scanFromDoc,
  sortScans,
  summarizeScans,
  summarySentence,
  trendPoints,
} from "./scans";
import type { InBodyScan } from "./types";
import { DEFAULT_INBODY_VARIATION, normalizeInBodyVariation } from "./variation";

const TODAY = "2026-09-11";
const V = DEFAULT_INBODY_VARIATION;

/** A realistic printout: 172.4 lb, 68.1 lb muscle, 53.8 lb fat (31.2%). */
function filled(overrides: Partial<Record<string, string>> = {}) {
  const d = emptyDraft("2026-09-02");
  Object.assign(d.values, {
    weightLb: "172.4",
    skeletalMuscleMassLb: "68.1",
    bodyFatMassLb: "53.8",
    percentBodyFat: "31.2",
    bmi: "27.8",
    ...overrides,
  });
  return d;
}

function scan(id: string, testedAt: string, w: number, smm: number, bfm: number, pbf: number): InBodyScan {
  return {
    id,
    testedAt,
    device: "InBody 270S",
    source: "manual",
    studioId: "s",
    enteredBy: "t",
    enteredByName: "T",
    weightLb: w,
    skeletalMuscleMassLb: smm,
    bodyFatMassLb: bfm,
    percentBodyFat: pbf,
    bmi: null,
    totalBodyWaterLb: null,
    dryLeanMassLb: null,
    fatFreeMassLb: null,
    basalMetabolicRateKcal: null,
    smi: null,
    phaseAngle: null,
    segmentalLean: null,
  };
}

describe("the entry form", () => {
  it("reads numbers the way people type them", () => {
    expect(parseNumber(" 172.4 ")).toBe(172.4);
    expect(parseNumber("1,650")).toBe(1650);
    expect(parseNumber("")).toBeNull();
    expect(parseNumber("17a")).toBe("invalid");
  });

  it("saves a clean printout, rounded to the sheet's precision", () => {
    const d = filled({ basalMetabolicRateKcal: "1,512.4" });
    d.segments.trunk = { lb: "48.26", pct: "98.1" };
    const check = checkDraft(d, TODAY);
    expect(check.problems).toEqual({});
    expect(check.warnings).toEqual([]);
    expect(check.result?.testedAt).toBe("2026-09-02");
    expect(check.result?.measures.weightLb).toBe(172.4);
    expect(check.result?.measures.basalMetabolicRateKcal).toBe(1512);
    expect(check.result?.measures.phaseAngle).toBeNull();
    expect(check.result?.measures.segmentalLean).toEqual({ trunk: { lb: 48.3, pctOfIdeal: 98.1 } });
  });

  it("requires the four headline numbers and a real, past date", () => {
    const d = emptyDraft("2026-09-12");
    const check = checkDraft(d, TODAY);
    expect(check.result).toBeNull();
    expect(check.problems).toMatchObject({
      testedAt: "The test date can't be in the future.",
      weightLb: "Required",
      skeletalMuscleMassLb: "Required",
      bodyFatMassLb: "Required",
      percentBodyFat: "Required",
    });
    expect(checkDraft({ ...filled(), testedAt: "2026-02-30" }, TODAY).problems.testedAt).toBe(
      "Enter the test date from the printout.",
    );
  });

  it("stops a slip of the finger", () => {
    const check = checkDraft(filled({ weightLb: "1724", phaseAngle: "58" }), TODAY);
    expect(check.problems.weightLb).toBe("Between 50 lb and 550 lb");
    expect(check.problems.phaseAngle).toBe("Between 1° and 15°");
  });

  it("won't save muscle and fat that add up to more than the person", () => {
    const check = checkDraft(filled({ skeletalMuscleMassLb: "120" }), TODAY);
    expect(check.problems.skeletalMuscleMassLb).toMatch(/more than their weight/);
    expect(checkDraft(filled({ bodyFatMassLb: "180" }), TODAY).problems.bodyFatMassLb).toBe(
      "Can't be as much as their weight",
    );
  });

  it("warns, without blocking, when numbers the sheet ties together disagree", () => {
    const check = checkDraft(filled({ percentBodyFat: "13.2", fatFreeMassLb: "128.6" }), TODAY);
    expect(check.result).not.toBeNull();
    expect(check.warnings).toHaveLength(2);
    expect(check.warnings[0]).toMatch(/about 31\.2%/);
    expect(check.warnings[1]).toMatch(/about 118\.6 lb/);
  });

  it("asks for a segment's pounds when only its percentage is filled", () => {
    const d = filled();
    d.segments.leftArm = { lb: "", pct: "96" };
    expect(checkDraft(d, TODAY).problems.leftArm).toBe("Enter the pounds too");
  });

  it("round-trips a stored scan into the form", () => {
    const s = { ...scan("a", "2026-01-15", 176.2, 65.8, 58.9, 33.4), bmi: 28.4, segmentalLean: { trunk: { lb: 47.1, pctOfIdeal: null } } };
    const d = draftFromScan(s);
    expect(d.values.weightLb).toBe("176.2");
    expect(d.values.bmi).toBe("28.4");
    expect(d.values.smi).toBe("");
    expect(d.segments.trunk).toEqual({ lb: "47.1", pct: "" });
    expect(checkDraft(d, TODAY).result?.measures.bmi).toBe(28.4);
  });
});

describe("stored scans", () => {
  it("leaves out a document missing its date or a headline number", () => {
    expect(scanFromDoc("x", { testedAt: "2026-01-15", weightLb: 170, skeletalMuscleMassLb: 66, bodyFatMassLb: 50 })).toBeNull();
    expect(scanFromDoc("x", { weightLb: 170, skeletalMuscleMassLb: 66, bodyFatMassLb: 50, percentBodyFat: 29 })).toBeNull();
    const ok = scanFromDoc("x", {
      testedAt: "2026-01-15",
      weightLb: 170,
      skeletalMuscleMassLb: 66,
      bodyFatMassLb: 50,
      percentBodyFat: 29.4,
      segmentalLean: { trunk: { lb: 47 }, leftArm: { pct: 90 } },
    });
    expect(ok?.bmi).toBeNull();
    expect(ok?.device).toBe("InBody 270S");
    expect(ok?.segmentalLean).toEqual({ trunk: { lb: 47, pctOfIdeal: null } });
  });
});

describe("the summary on the client", () => {
  const jan = scan("a", "2026-01-15", 176.2, 65.8, 58.9, 33.4);
  const may = scan("b", "2026-05-20", 173.0, 67.0, 55.6, 32.1);
  const sep = scan("c", "2026-09-02", 172.4, 68.1, 53.8, 31.2);

  it("compares the first scan with the latest, whatever order they arrive in", () => {
    expect(summarizeScans([sep, jan, may])).toEqual({
      scanCount: 3,
      firstTestedAt: "2026-01-15",
      latestTestedAt: "2026-09-02",
      latest: { weightLb: 172.4, skeletalMuscleMassLb: 68.1, bodyFatMassLb: 53.8, percentBodyFat: 31.2 },
      weightLbChange: -3.8,
      muscleLbChange: 2.3,
      bodyFatLbChange: -5.1,
      bodyFatPctChange: -2.2,
    });
  });

  it("has no changes with one scan, and nothing with none", () => {
    const one = summarizeScans([jan]);
    expect(one?.muscleLbChange).toBeNull();
    expect(summarySentence(one as any, TODAY, V)).toBe("One scan so far, Jan 15.");
    expect(summarizeScans([])).toBeNull();
  });

  // Client codex, Sep 2026 (AJ's decision 8): before this round the sentence
  // read "Since Jan 15: muscle up 2.3 lb, body fat down 2.2 points." Both of
  // those are inside Max Strength's default variation (3.5 lb, 2.7 points).
  it("calls nothing a change that sits inside the studio's variation", () => {
    expect(summarySentence(summarizeScans([jan, sep]) as any, TODAY, V)).toBe(
      "Since Jan 15: no change bigger than the scanner's normal variation.",
    );
  });

  it("names a change beyond it, and says the other one is within it", () => {
    const stronger = scan("d", "2026-09-02", 172.4, 69.8, 53.8, 31.2); // +4.0 lb, −2.2 pts
    expect(summarySentence(summarizeScans([jan, stronger]) as any, TODAY, V)).toBe(
      "Since Jan 15: muscle up 4.0 lb; body fat within the scanner's normal variation.",
    );
    const leaner = scan("e", "2026-09-02", 172.4, 66.9, 50.0, 30.4); // +1.1 lb, −3.0 pts
    expect(summarySentence(summarizeScans([jan, leaner]) as any, TODAY, V)).toBe(
      "Since Jan 15: body fat down 3.0 points; muscle within the scanner's normal variation.",
    );
  });

  it("says the old sentence when the studio's own numbers are smaller", () => {
    const tight = normalizeInBodyVariation({ skeletalMuscleMassLb: 2, percentBodyFat: 2 });
    expect(summarySentence(summarizeScans([jan, sep]) as any, TODAY, tight)).toBe(
      "Since Jan 15: muscle up 2.3 lb, body fat down 2.2 points.",
    );
  });

  it("keeps two scans on one day in the order they were entered", () => {
    const early = { ...scan("z", "2026-09-02", 172, 68, 54, 31.4), createdAt: { seconds: 100 } };
    const late = { ...scan("a", "2026-09-02", 172.4, 68.1, 53.8, 31.2), createdAt: { seconds: 200 } };
    expect(sortScans([late, early]).map((s) => s.id)).toEqual(["z", "a"]);
  });
});

describe("words and trends", () => {
  it("formats values and changes in the sheet's units", () => {
    expect(formatMeasure(172.4, "weightLb")).toBe("172.4 lb");
    expect(formatMeasure(31.2, "percentBodyFat")).toBe("31.2%");
    expect(formatMeasure(1512, "basalMetabolicRateKcal")).toBe("1,512 kcal");
    expect(formatMeasure(27.8, "bmi")).toBe("27.8");
    expect(formatMeasure(null, "smi")).toBe("—");
    expect(formatChange(2.3, "skeletalMuscleMassLb")).toBe("+2.3 lb");
    expect(formatChange(-2.2, "percentBodyFat")).toBe("−2.2 pts");
    expect(formatChange(0, "weightLb")).toBe("no change");
  });

  it("calls muscle up and fat down good news, and weight neither", () => {
    expect(changeTone("skeletalMuscleMassLb", 4.1, V)).toBe("good");
    expect(changeTone("skeletalMuscleMassLb", -3.5, V)).toBe("watch");
    expect(changeTone("percentBodyFat", 2.8, V)).toBe("watch");
    expect(changeTone("bodyFatMassLb", -5.3, V)).toBe("good");
    expect(changeTone("weightLb", -3.8, V)).toBe("neutral");
    expect(changeTone("weightLb", -30, V)).toBe("neutral");
    expect(changeBetween({ weightLb: 170.04 }, { weightLb: 170 }, "weightLb")).toBe(0);
  });

  it("gives a change inside the variation no colour, at the studio's own numbers", () => {
    expect(changeTone("skeletalMuscleMassLb", 2.3, V)).toBe("neutral");
    expect(changeTone("percentBodyFat", 1.1, V)).toBe("neutral");
    expect(changeTone("bodyFatMassLb", -5, V)).toBe("neutral");
    const tight = normalizeInBodyVariation({ skeletalMuscleMassLb: 2 });
    expect(changeTone("skeletalMuscleMassLb", 2.3, tight)).toBe("good");
  });

  it("keeps the number and withholds only the call", () => {
    expect(formatCalledChange(1.2, "skeletalMuscleMassLb", V)).toBe("+1.2 lb · within normal variation");
    expect(formatCalledChange(-2.2, "percentBodyFat", V)).toBe("−2.2 pts · within normal variation");
    expect(formatCalledChange(4.1, "skeletalMuscleMassLb", V)).toBe("+4.1 lb");
    expect(formatCalledChange(-5.3, "bodyFatMassLb", V)).toBe("−5.3 lb");
    // Weight has no variation: its change is always shown plainly.
    expect(formatCalledChange(-0.4, "weightLb", V)).toBe("−0.4 lb");
    expect(formatCalledChange(0, "skeletalMuscleMassLb", V)).toBe("no change");
    expect(formatCalledChange(null, "skeletalMuscleMassLb", V)).toBe("");
  });

  it("draws the last few scans, oldest first", () => {
    const scans = [3, 1, 2].map((m) => scan(String(m), `2026-0${m}-01`, 170 + m, 66, 50, 29));
    expect(trendPoints(scans, "weightLb", 2)).toEqual([
      { date: "2026-02-01", value: 172 },
      { date: "2026-03-01", value: 173 },
    ]);
  });

  it("gives a progress report the scans up to its own date", () => {
    const scans = [
      scan("a", "2026-01-15", 176.2, 65.8, 58.9, 33.4),
      scan("b", "2026-05-20", 173, 67, 55.6, 32.1),
      scan("c", "2026-09-02", 172.4, 68.1, 53.8, 31.2),
    ];
    const june = reportInBody(scans, "2026-06-01");
    expect(june?.latest.id).toBe("b");
    expect(june?.first?.id).toBe("a");
    expect(june?.previous?.id).toBe("a");
    expect(reportInBody(scans, "2025-12-01")).toBeNull();
    expect(reportInBody(scans.slice(0, 1), TODAY)?.first).toBeNull();
  });
});
