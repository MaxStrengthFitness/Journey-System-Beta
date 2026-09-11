/**
 * INBODY — the pure part.
 *
 *   - the entry form's fields, in the order the InBody 270S prints them,
 *     and the checks that catch a typo before it becomes someone's history
 *   - the summary the client document carries (first scan against latest)
 *   - the words, changes and trend points the screens show
 *
 * Tested in scans.test.ts. Nothing here imports Firebase.
 */

import {
  INBODY_SEGMENTS,
  type InBodyHeadline,
  type InBodyMeasures,
  type InBodyScan,
  type InBodySegment,
  type InBodySegmentLean,
  type InBodySource,
  type InBodySummary,
} from "./types";

export const DEFAULT_DEVICE = "InBody 270S";

/** Every number on the form except the segmental block. */
export type MeasureKey = Exclude<keyof InBodyMeasures, "segmentalLean">;

export interface MeasureField {
  key: MeasureKey;
  /** As printed on the result sheet. */
  label: string;
  /** "" for BMI, which the sheet prints without one. */
  unit: "lb" | "%" | "kcal" | "kg/m²" | "°" | "";
  min: number;
  max: number;
  decimals: number;
  required: boolean;
  /** headline: always on the form. more: behind "More from the printout". */
  group: "headline" | "more";
}

/**
 * The printout's order: Muscle-Fat Analysis (weight, muscle, fat), Obesity
 * Analysis (percent body fat, BMI), phase angle, then the body-composition
 * and research numbers. Ranges are wide on purpose — they only stop a slip
 * of the finger (1724 for 172.4), not an unusual body.
 */
export const MEASURE_FIELDS: MeasureField[] = [
  { key: "weightLb", label: "Weight", unit: "lb", min: 50, max: 550, decimals: 1, required: true, group: "headline" },
  { key: "skeletalMuscleMassLb", label: "Skeletal Muscle Mass", unit: "lb", min: 15, max: 250, decimals: 1, required: true, group: "headline" },
  { key: "bodyFatMassLb", label: "Body Fat Mass", unit: "lb", min: 1, max: 450, decimals: 1, required: true, group: "headline" },
  { key: "percentBodyFat", label: "Percent Body Fat", unit: "%", min: 2, max: 75, decimals: 1, required: true, group: "headline" },
  { key: "bmi", label: "BMI", unit: "", min: 10, max: 80, decimals: 1, required: false, group: "headline" },
  { key: "phaseAngle", label: "Whole Body Phase Angle", unit: "°", min: 1, max: 15, decimals: 1, required: false, group: "headline" },
  { key: "totalBodyWaterLb", label: "Total Body Water", unit: "lb", min: 20, max: 350, decimals: 1, required: false, group: "more" },
  { key: "dryLeanMassLb", label: "Dry Lean Mass", unit: "lb", min: 5, max: 150, decimals: 1, required: false, group: "more" },
  { key: "fatFreeMassLb", label: "Fat Free Mass", unit: "lb", min: 30, max: 450, decimals: 1, required: false, group: "more" },
  { key: "basalMetabolicRateKcal", label: "Basal Metabolic Rate", unit: "kcal", min: 500, max: 5000, decimals: 0, required: false, group: "more" },
  { key: "smi", label: "SMI", unit: "kg/m²", min: 2, max: 20, decimals: 1, required: false, group: "more" },
];

export const FIELD_BY_KEY: Record<MeasureKey, MeasureField> = Object.fromEntries(
  MEASURE_FIELDS.map((f) => [f.key, f]),
) as Record<MeasureKey, MeasureField>;

export const SEGMENT_LABELS: Record<InBodySegment, string> = {
  rightArm: "Right arm",
  leftArm: "Left arm",
  trunk: "Trunk",
  rightLeg: "Right leg",
  leftLeg: "Left leg",
};

const SEGMENT_LB = { min: 0.5, max: 150 };
const SEGMENT_PCT = { min: 20, max: 300 };

/* ------------------------------------------------------------------ *
 * Small helpers
 * ------------------------------------------------------------------ */

const round = (n: number, decimals: number) => {
  const f = 10 ** decimals;
  // `|| 0` turns -0 into 0, so a change of -0.04 reads as "no change".
  return Math.round(n * f) / f || 0;
};

export function isDateKey(s: unknown): s is string {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

/** "172.4", " 1,650 " → numbers; "" → null; anything else → "invalid". */
export function parseNumber(raw: string | null | undefined): number | null | "invalid" {
  const s = String(raw ?? "").trim().replace(/,/g, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : "invalid";
}

/** "Jan 15", or "Jan 15, 2025" when the year differs from `today`'s. */
export function scanDateLabel(key: string, today?: string): string {
  if (!isDateKey(key)) return key;
  const [y, m, d] = key.split("-").map(Number);
  const sameYear = today ? today.slice(0, 4) === key.slice(0, 4) : false;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

/* ------------------------------------------------------------------ *
 * The entry form
 * ------------------------------------------------------------------ */

export interface InBodyDraft {
  testedAt: string;
  device: string;
  values: Record<MeasureKey, string>;
  segments: Record<InBodySegment, { lb: string; pct: string }>;
}

export function emptyDraft(today: string): InBodyDraft {
  return {
    testedAt: today,
    device: DEFAULT_DEVICE,
    values: Object.fromEntries(MEASURE_FIELDS.map((f) => [f.key, ""])) as Record<MeasureKey, string>,
    segments: Object.fromEntries(INBODY_SEGMENTS.map((s) => [s, { lb: "", pct: "" }])) as InBodyDraft["segments"],
  };
}

export function draftFromScan(scan: InBodyScan): InBodyDraft {
  const draft = emptyDraft(scan.testedAt);
  draft.device = scan.device || DEFAULT_DEVICE;
  for (const f of MEASURE_FIELDS) {
    const v = scan[f.key];
    draft.values[f.key] = typeof v === "number" ? String(v) : "";
  }
  for (const seg of INBODY_SEGMENTS) {
    const s = scan.segmentalLean?.[seg];
    if (s) draft.segments[seg] = { lb: String(s.lb), pct: s.pctOfIdeal === null ? "" : String(s.pctOfIdeal) };
  }
  return draft;
}

export interface DraftCheck {
  /** What to save — null while anything blocks saving. */
  result: { testedAt: string; device: string; measures: InBodyMeasures } | null;
  /** Why a field can't be saved. Keys: "testedAt", a MeasureKey, or a segment name. */
  problems: Record<string, string>;
  /**
   * Numbers that disagree with each other. Probably a typo, but it is their
   * printout: shown, never blocking.
   */
  warnings: string[];
}

function rangeText(f: { min: number; max: number }, unit: string): string {
  const u = unit === "%" || unit === "°" ? unit : unit ? ` ${unit}` : "";
  return `Between ${f.min}${u} and ${f.max}${u}`;
}

export function checkDraft(draft: InBodyDraft, today: string): DraftCheck {
  const problems: Record<string, string> = {};
  const warnings: string[] = [];

  const testedAt = draft.testedAt.trim();
  if (!isDateKey(testedAt)) problems.testedAt = "Enter the test date from the printout.";
  else if (testedAt > today) problems.testedAt = "The test date can't be in the future.";
  else if (testedAt < "2000-01-01") problems.testedAt = "Check the year on the printout.";

  const device = draft.device.trim().slice(0, 40) || DEFAULT_DEVICE;

  const values = {} as Record<MeasureKey, number | null>;
  for (const f of MEASURE_FIELDS) {
    const n = parseNumber(draft.values[f.key]);
    values[f.key] = null;
    if (n === null) {
      if (f.required) problems[f.key] = "Required";
    } else if (n === "invalid") {
      problems[f.key] = "Enter a number";
    } else if (n < f.min || n > f.max) {
      problems[f.key] = rangeText(f, f.unit);
    } else {
      values[f.key] = round(n, f.decimals);
    }
  }

  // The three headline numbers have to fit inside each other.
  const w = values.weightLb;
  const smm = values.skeletalMuscleMassLb;
  const bfm = values.bodyFatMassLb;
  if (w !== null && bfm !== null && bfm >= w) {
    problems.bodyFatMassLb = "Can't be as much as their weight";
  } else if (w !== null && smm !== null && bfm !== null && smm + bfm >= w) {
    problems.skeletalMuscleMassLb = "Muscle and fat together come to more than their weight — check both";
  }

  // Cross-checks the sheet itself guarantees, within rounding.
  if (w !== null && bfm !== null && bfm < w) {
    const pbf = values.percentBodyFat;
    const expectedPbf = (bfm / w) * 100;
    if (pbf !== null && Math.abs(pbf - expectedPbf) > 1) {
      warnings.push(
        `Percent Body Fat is Body Fat Mass ÷ Weight — about ${expectedPbf.toFixed(1)}% with these numbers. Check the printout.`,
      );
    }
    const lean = w - bfm;
    const ffm = values.fatFreeMassLb;
    if (ffm !== null && Math.abs(ffm - lean) > 1.5) {
      warnings.push(`Fat Free Mass is Weight − Body Fat Mass — about ${lean.toFixed(1)} lb with these numbers.`);
    }
    const tbw = values.totalBodyWaterLb;
    const dlm = values.dryLeanMassLb;
    if (tbw !== null && dlm !== null && Math.abs(tbw + dlm - lean) > 1.5) {
      warnings.push(
        `Total Body Water plus Dry Lean Mass is usually Weight − Body Fat Mass — about ${lean.toFixed(1)} lb with these numbers.`,
      );
    }
  }

  const segmentalLean: Partial<Record<InBodySegment, InBodySegmentLean>> = {};
  for (const seg of INBODY_SEGMENTS) {
    const lb = parseNumber(draft.segments[seg].lb);
    const pct = parseNumber(draft.segments[seg].pct);
    if (lb === null && pct === null) continue;
    if (lb === null) {
      problems[seg] = "Enter the pounds too";
    } else if (lb === "invalid" || pct === "invalid") {
      problems[seg] = "Enter a number";
    } else if (lb < SEGMENT_LB.min || lb > SEGMENT_LB.max) {
      problems[seg] = rangeText(SEGMENT_LB, "lb");
    } else if (pct !== null && (pct < SEGMENT_PCT.min || pct > SEGMENT_PCT.max)) {
      problems[seg] = rangeText(SEGMENT_PCT, "%");
    } else {
      segmentalLean[seg] = { lb: round(lb, 1), pctOfIdeal: pct === null ? null : round(pct, 1) };
    }
  }

  if (Object.keys(problems).length > 0) return { result: null, problems, warnings };

  const measures: InBodyMeasures = {
    weightLb: values.weightLb as number,
    skeletalMuscleMassLb: values.skeletalMuscleMassLb as number,
    bodyFatMassLb: values.bodyFatMassLb as number,
    percentBodyFat: values.percentBodyFat as number,
    bmi: values.bmi,
    totalBodyWaterLb: values.totalBodyWaterLb,
    dryLeanMassLb: values.dryLeanMassLb,
    fatFreeMassLb: values.fatFreeMassLb,
    basalMetabolicRateKcal: values.basalMetabolicRateKcal,
    smi: values.smi,
    phaseAngle: values.phaseAngle,
    segmentalLean: Object.keys(segmentalLean).length > 0 ? segmentalLean : null,
  };
  return { result: { testedAt, device, measures }, problems, warnings };
}

/* ------------------------------------------------------------------ *
 * Reading a stored scan
 * ------------------------------------------------------------------ */

const numOrNull = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/**
 * A Firestore document as an InBodyScan, or null when it lacks a date or one
 * of the four headline numbers (a half-written or hand-edited document is
 * left out rather than drawn as a zero).
 */
export function scanFromDoc(id: string, raw: Record<string, unknown> | undefined): InBodyScan | null {
  if (!raw || !isDateKey(raw.testedAt)) return null;
  const weightLb = numOrNull(raw.weightLb);
  const skeletalMuscleMassLb = numOrNull(raw.skeletalMuscleMassLb);
  const bodyFatMassLb = numOrNull(raw.bodyFatMassLb);
  const percentBodyFat = numOrNull(raw.percentBodyFat);
  if (weightLb === null || skeletalMuscleMassLb === null || bodyFatMassLb === null || percentBodyFat === null) return null;

  let segmentalLean: InBodyScan["segmentalLean"] = null;
  if (raw.segmentalLean && typeof raw.segmentalLean === "object") {
    const out: Partial<Record<InBodySegment, InBodySegmentLean>> = {};
    for (const seg of INBODY_SEGMENTS) {
      const s = (raw.segmentalLean as Record<string, any>)[seg];
      const lb = numOrNull(s?.lb);
      if (lb !== null) out[seg] = { lb, pctOfIdeal: numOrNull(s?.pctOfIdeal) };
    }
    segmentalLean = Object.keys(out).length > 0 ? out : null;
  }

  const source: InBodySource =
    raw.source === "photo" || raw.source === "lookinbody" ? raw.source : "manual";
  return {
    id,
    testedAt: raw.testedAt,
    device: typeof raw.device === "string" && raw.device ? raw.device : DEFAULT_DEVICE,
    source,
    studioId: typeof raw.studioId === "string" ? raw.studioId : "",
    enteredBy: typeof raw.enteredBy === "string" ? raw.enteredBy : "",
    enteredByName: typeof raw.enteredByName === "string" ? raw.enteredByName : "",
    createdAt: raw.createdAt,
    updatedBy: typeof raw.updatedBy === "string" ? raw.updatedBy : null,
    updatedAt: raw.updatedAt,
    weightLb,
    skeletalMuscleMassLb,
    bodyFatMassLb,
    percentBodyFat,
    bmi: numOrNull(raw.bmi),
    totalBodyWaterLb: numOrNull(raw.totalBodyWaterLb),
    dryLeanMassLb: numOrNull(raw.dryLeanMassLb),
    fatFreeMassLb: numOrNull(raw.fatFreeMassLb),
    basalMetabolicRateKcal: numOrNull(raw.basalMetabolicRateKcal),
    smi: numOrNull(raw.smi),
    phaseAngle: numOrNull(raw.phaseAngle),
    segmentalLean,
  };
}

/* ------------------------------------------------------------------ *
 * Order, summary, changes
 * ------------------------------------------------------------------ */

type Dated = Pick<InBodyScan, "testedAt"> & { id?: string; createdAt?: unknown };

function createdMillis(s: Dated): number {
  const c = s.createdAt as { toMillis?: () => number; seconds?: number } | undefined;
  if (c && typeof c.toMillis === "function") return c.toMillis();
  if (c && typeof c.seconds === "number") return c.seconds * 1000;
  return Number.MAX_SAFE_INTEGER; // not yet written: newest
}

/** Oldest first. Two scans on one day keep the order they were entered. */
export function sortScans<T extends Dated>(scans: T[]): T[] {
  return [...scans].sort(
    (a, b) =>
      a.testedAt.localeCompare(b.testedAt) ||
      createdMillis(a) - createdMillis(b) ||
      String(a.id ?? "").localeCompare(String(b.id ?? "")),
  );
}

export function headlineOf(s: InBodyHeadline): InBodyHeadline {
  return {
    weightLb: s.weightLb,
    skeletalMuscleMassLb: s.skeletalMuscleMassLb,
    bodyFatMassLb: s.bodyFatMassLb,
    percentBodyFat: s.percentBodyFat,
  };
}

/** Rounded to the field's precision; null when either side is missing. */
export function changeBetween(
  from: Partial<InBodyMeasures> | null | undefined,
  to: Partial<InBodyMeasures> | null | undefined,
  key: MeasureKey,
): number | null {
  const a = from?.[key];
  const b = to?.[key];
  if (typeof a !== "number" || typeof b !== "number") return null;
  return round(b - a, FIELD_BY_KEY[key].decimals);
}

/** What clients/{id}.inbodySummary should say, given every scan. Null with none. */
export function summarizeScans(
  scans: Array<Dated & InBodyHeadline>,
): Omit<InBodySummary, "updatedAt"> | null {
  const list = sortScans(scans.filter((s) => isDateKey(s.testedAt)));
  if (list.length === 0) return null;
  const first = list[0];
  const latest = list[list.length - 1];
  const two = list.length >= 2;
  const d = (key: keyof InBodyHeadline) => (two ? changeBetween(first, latest, key) : null);
  return {
    scanCount: list.length,
    firstTestedAt: first.testedAt,
    latestTestedAt: latest.testedAt,
    latest: headlineOf(latest),
    weightLbChange: d("weightLb"),
    muscleLbChange: d("skeletalMuscleMassLb"),
    bodyFatLbChange: d("bodyFatMassLb"),
    bodyFatPctChange: d("percentBodyFat"),
  };
}

/* ------------------------------------------------------------------ *
 * Words
 * ------------------------------------------------------------------ */

/** "172.4 lb", "31.2%", "5.8°", "1,650 kcal", "27.4" (BMI). "—" when missing. */
export function formatMeasure(value: number | null | undefined, key: MeasureKey): string {
  if (typeof value !== "number") return "—";
  const f = FIELD_BY_KEY[key];
  const n = value.toLocaleString("en-US", { minimumFractionDigits: f.decimals, maximumFractionDigits: f.decimals });
  if (f.unit === "%" || f.unit === "°") return `${n}${f.unit}`;
  return f.unit ? `${n} ${f.unit}` : n;
}

/** "+2.3 lb", "−1.8 pts" (percent body fat moves in points), "no change". */
export function formatChange(delta: number | null, key: MeasureKey): string {
  if (delta === null) return "";
  if (delta === 0) return "no change";
  const f = FIELD_BY_KEY[key];
  const sign = delta > 0 ? "+" : "−";
  const n = Math.abs(delta).toLocaleString("en-US", { minimumFractionDigits: f.decimals, maximumFractionDigits: f.decimals });
  const unit = f.unit === "%" ? " pts" : f.unit === "°" ? "°" : f.unit ? ` ${f.unit}` : "";
  return `${sign}${n}${unit}`;
}

export type ChangeTone = "good" | "watch" | "neutral";

const MORE_IS_BETTER = new Set<MeasureKey>(["skeletalMuscleMassLb", "dryLeanMassLb", "fatFreeMassLb", "smi", "phaseAngle"]);
const LESS_IS_BETTER = new Set<MeasureKey>(["bodyFatMassLb", "percentBodyFat"]);

/**
 * Muscle up and fat down are good news. Weight is neither: for most of the
 * studio's clients, holding weight while muscle replaces fat is the win.
 */
export function changeTone(key: MeasureKey, delta: number | null): ChangeTone {
  if (!delta) return "neutral";
  if (MORE_IS_BETTER.has(key)) return delta > 0 ? "good" : "watch";
  if (LESS_IS_BETTER.has(key)) return delta < 0 ? "good" : "watch";
  return "neutral";
}

/** "Since Jan 15: muscle up 2.3 lb, body fat down 1.8 points." */
export function summarySentence(summary: InBodySummary | null | undefined, today?: string): string | null {
  if (!summary || !isDateKey(summary.firstTestedAt)) return null;
  const since = scanDateLabel(summary.firstTestedAt, today);
  if (summary.scanCount < 2 || summary.muscleLbChange === null || summary.bodyFatPctChange === null) {
    return `One scan so far, ${since}.`;
  }
  const part = (word: string, delta: number, unit: string) =>
    delta === 0 ? `${word} unchanged` : `${word} ${delta > 0 ? "up" : "down"} ${Math.abs(delta).toFixed(1)} ${unit}`;
  return `Since ${since}: ${part("muscle", summary.muscleLbChange, "lb")}, ${part(
    "body fat",
    summary.bodyFatPctChange,
    "points",
  )}.`;
}

/* ------------------------------------------------------------------ *
 * Trends and the progress report
 * ------------------------------------------------------------------ */

export interface TrendPoint {
  date: string;
  value: number;
}

/** The last `max` values of one number, oldest first (the printout shows 8). */
export function trendPoints(scans: InBodyScan[], key: MeasureKey, max = 12): TrendPoint[] {
  return sortScans(scans)
    .filter((s) => typeof s[key] === "number")
    .map((s) => ({ date: s.testedAt, value: s[key] as number }))
    .slice(-max);
}

export interface ReportInBody {
  /** The latest scan on or before the report's date. */
  latest: InBodyScan;
  /** Their first scan, when the latest isn't it. */
  first: InBodyScan | null;
  /** The scan before the latest, when there is one. */
  previous: InBodyScan | null;
  count: number;
}

/** What a progress report dated `reportDate` shows. Null with no scan by then. */
export function reportInBody(scans: InBodyScan[], reportDate: string): ReportInBody | null {
  const list = sortScans(scans).filter((s) => s.testedAt <= reportDate);
  if (list.length === 0) return null;
  const latest = list[list.length - 1];
  return {
    latest,
    first: list.length >= 2 ? list[0] : null,
    previous: list.length >= 2 ? list[list.length - 2] : null,
    count: list.length,
  };
}
