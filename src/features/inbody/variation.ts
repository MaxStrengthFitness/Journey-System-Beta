/**
 * INBODY — what counts as a change (client codex, Sep 2026; AJ's decision 8).
 *
 * An InBody scanner does not read the same body the same way twice. A
 * test–retest study of three InBody models found that a real change had to
 * clear roughly 2.1–2.7 points of body fat, 3.3–5.3 lb of fat mass and
 * 3.5–5.1 lb of fat-free mass before it could be told apart from the machine
 * itself (VARIATION_SOURCE). Before this round every screen called any
 * difference a change: "+1.2 lb muscle" was proof on the renewals pipeline and
 * a green number on the progress report the client takes home. A confident
 * wrong number is worse than a missing one (CLAUDE.md), so:
 *
 *   - each studio has its own numbers, `studios/{id}.inbodyVariation`, set on
 *     My Studio → Studio, with Max Strength's defaults when it has none;
 *   - a change SMALLER than the number is "within the scanner's normal
 *     variation" and no screen calls it up, down, better or worse. A change
 *     equal to the number or bigger is called (|change| >= variation);
 *   - a client is always read against their HOME studio's numbers, wherever
 *     the screen is opened, so one client never reads two ways;
 *   - weight has no number: it is a scale reading, and no screen tones it.
 *
 * This is the ONE answer. Every reader goes through `callChange` (the InBody
 * card, the progress report, the Renewal Brief, the renewal card, the
 * Operations pipeline's proof line and its upgrade filter). What is STORED
 * never changes: `clients/{id}.inbodySummary` and the nightly
 * `renewal.proof.inbody` keep the raw changes, so lowering a studio's numbers
 * brings a hidden change straight back.
 *
 * Tested in variation.test.ts. Nothing here imports Firebase or React.
 */

import type { MeasureKey } from "./scans";
import type { StoredInBodyVariation } from "./types";

/** The measures that have a variation: the three a sentence ever names. */
export type VariationKey = "skeletalMuscleMassLb" | "bodyFatMassLb" | "percentBodyFat";

export const VARIATION_KEYS: readonly VariationKey[] = ["skeletalMuscleMassLb", "bodyFatMassLb", "percentBodyFat"];

/** A studio's numbers, always complete: every key is filled from the defaults. */
export type InBodyVariation = Readonly<Record<VariationKey, number>>;

/**
 * Max Strength's defaults (AJ, Sep 24 2026). Fat mass and body fat are the
 * CAUTIOUS end of the study's range: the studios' 270S is a portable scanner
 * like the study's InBody 230, and a missed small change is better than
 * calling noise progress. The study did not measure skeletal muscle: 3.5 lb
 * is AJ's figure, the low end of the study's fat-free-mass range. It is a
 * judgement, not a measured bound.
 */
export const DEFAULT_INBODY_VARIATION: InBodyVariation = Object.freeze({
  skeletalMuscleMassLb: 3.5,
  bodyFatMassLb: 5.3,
  percentBodyFat: 2.7,
});

/** What a studio may set. Anything outside reads as the default. */
export const VARIATION_LIMITS: Readonly<Record<VariationKey, { min: number; max: number }>> = Object.freeze({
  skeletalMuscleMassLb: { min: 0.5, max: 10 },
  bodyFatMassLb: { min: 0.5, max: 15 },
  percentBodyFat: { min: 0.5, max: 6 },
});

/** How the My Studio panel names each number, and its unit. */
export const VARIATION_FIELDS: Readonly<Record<VariationKey, { label: string; unit: "lb" | "points" }>> = Object.freeze({
  skeletalMuscleMassLb: { label: "Skeletal muscle", unit: "lb" },
  bodyFatMassLb: { label: "Body fat mass", unit: "lb" },
  percentBodyFat: { label: "Body fat %", unit: "points" },
});

/**
 * The citation the panel shows under its numbers. Checked against the
 * paper's abstract (Sep 24 2026): minimal difference for body fat
 * 2.12–2.73 %, fat mass 1.49–2.39 kg, fat-free mass 1.60–2.32 kg.
 */
export const VARIATION_SOURCE =
  "Max Strength's defaults come from a test–retest study of three InBody models (McLester et al., Journal of Clinical Densitometry, 2020): the smallest real change was 2.1–2.7 points of body fat, 3.3–5.3 lb of fat mass and 3.5–5.1 lb of fat-free mass. The defaults take the cautious end for fat. The study did not measure skeletal muscle: its default, 3.5 lb, is the low end of the fat-free-mass range.";

const round1 = (n: number) => Math.round(n * 10) / 10;

/** A stored number this studio may use, rounded to one decimal, or null. */
function cleanValue(value: unknown, key: VariationKey): number | null {
  const { min, max } = VARIATION_LIMITS[key];
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) return null;
  return round1(value);
}

/**
 * Whatever is stored, as numbers every screen can trust. Field by field: a
 * number inside its limits is kept; a missing, malformed or out-of-range one
 * takes the default. One bad save can never make a studio's scans read as
 * all change or all noise.
 */
export function normalizeInBodyVariation(raw: unknown): InBodyVariation {
  const stored = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out = {} as Record<VariationKey, number>;
  for (const key of VARIATION_KEYS) out[key] = cleanValue(stored[key], key) ?? DEFAULT_INBODY_VARIATION[key];
  return Object.freeze(out);
}

type StudioLike = { id?: string; inbodyVariation?: StoredInBodyVariation | null | unknown } | null | undefined;

/** A studio's numbers; the defaults for a studio that never set any, or no studio. */
export function inbodyVariationOf(studio: StudioLike): InBodyVariation {
  return normalizeInBodyVariation(studio?.inbodyVariation);
}

/** True when the studio has saved at least one number of its own that is in range. */
export function hasOwnVariation(studio: StudioLike): boolean {
  const raw = studio?.inbodyVariation;
  if (!raw || typeof raw !== "object") return false;
  return VARIATION_KEYS.some((key) => cleanValue((raw as Record<string, unknown>)[key], key) !== null);
}

/** The numbers for one studio id, out of the studios the app already holds. */
export function variationForStudio(
  studios: readonly StudioLike[] | null | undefined,
  studioId: string | null | undefined,
): InBodyVariation {
  if (!studioId || !studios) return DEFAULT_INBODY_VARIATION;
  return inbodyVariationOf(studios.find((s) => s?.id === studioId) ?? null);
}

/** The studio ids a client carries — all `variationStudioIdOf` looks at. */
export type ClientStudioIds = { homeStudioId?: string | null; studioId?: string | null };

/**
 * Which studio's numbers a client is read against: their home studio, then
 * the older `studioId` — the order the rules and `fordStudioIdOf` use. Null
 * when the client names no studio (the defaults apply).
 */
export function variationStudioIdOf(client: ClientStudioIds | null | undefined): string | null {
  if (!client) return null;
  return client.homeStudioId || client.studioId || null;
}

/**
 * A client's numbers, out of the studios the app already holds: their home
 * studio's (`variationStudioIdOf`), else Max Strength's defaults. It takes
 * the CLIENT, never a studio id, so no screen can hand it the studio the
 * iPad is in — the renewals pipeline, the Brief, the renewal card, the
 * progress report and the InBody card all read one client the same way.
 */
export function variationForClient(
  studios: readonly StudioLike[] | null | undefined,
  client: ClientStudioIds | null | undefined,
): InBodyVariation {
  return variationForStudio(studios, variationStudioIdOf(client));
}

/** The number a change has to reach, or null for a measure that has none (weight among them). */
export function thresholdFor(key: MeasureKey, v: InBodyVariation): number | null {
  switch (key) {
    case "skeletalMuscleMassLb":
    case "bodyFatMassLb":
    case "percentBodyFat":
      return v[key];
    default:
      return null;
  }
}

/**
 *   none    there is no change to judge (one scan, or a missing number)
 *   within  smaller than the studio's number, or no change at all
 *   up/down a change the scanner can tell apart from itself
 */
export type ChangeCall = "none" | "within" | "up" | "down";

/** Rounding on a stored change must not push 3.5 below 3.5. */
const EPSILON = 1e-9;

export function callChange(key: MeasureKey, delta: number | null | undefined, v: InBodyVariation): ChangeCall {
  if (typeof delta !== "number" || !Number.isFinite(delta)) return "none";
  if (delta === 0) return "within";
  const threshold = thresholdFor(key, v);
  if (threshold !== null && Math.abs(delta) < threshold - EPSILON) return "within";
  return delta > 0 ? "up" : "down";
}

/** True for a change a screen may name: up or down, beyond the studio's number. */
export function isCalledChange(key: MeasureKey, delta: number | null | undefined, v: InBodyVariation): boolean {
  const call = callChange(key, delta, v);
  return call === "up" || call === "down";
}

export function isDefaultVariation(v: InBodyVariation): boolean {
  return VARIATION_KEYS.every((key) => v[key] === DEFAULT_INBODY_VARIATION[key]);
}

/* ------------------------------------------------------------------ *
 * The My Studio form (InBodyVariationPanel)
 * ------------------------------------------------------------------ */

/** What the three inputs hold. */
export type VariationForm = Record<VariationKey, string>;

export function variationToForm(v: InBodyVariation): VariationForm {
  return {
    skeletalMuscleMassLb: String(v.skeletalMuscleMassLb),
    bodyFatMassLb: String(v.bodyFatMassLb),
    percentBodyFat: String(v.percentBodyFat),
  };
}

/** "Between 0.5 and 10 lb", "Between 0.5 and 6 points". */
export function variationRangeText(key: VariationKey): string {
  const { min, max } = VARIATION_LIMITS[key];
  return `Between ${min} and ${max} ${VARIATION_FIELDS[key].unit}`;
}

export interface VariationFormCheck {
  /** The numbers to save, rounded to one decimal — null while anything is wrong. */
  value: InBodyVariation | null;
  /** Why a number can't be saved, in words. */
  problems: Partial<Record<VariationKey, string>>;
}

export function checkVariationForm(form: VariationForm): VariationFormCheck {
  const problems: Partial<Record<VariationKey, string>> = {};
  const out = {} as Record<VariationKey, number>;
  for (const key of VARIATION_KEYS) {
    const text = String(form[key] ?? "").trim();
    const n = text === "" ? Number.NaN : Number(text);
    if (text === "") problems[key] = "Enter a number";
    else if (!Number.isFinite(n)) problems[key] = "Enter a number";
    else {
      const { min, max } = VARIATION_LIMITS[key];
      if (n < min || n > max) problems[key] = variationRangeText(key);
      else out[key] = round1(n);
    }
  }
  return Object.keys(problems).length > 0 ? { value: null, problems } : { value: Object.freeze(out), problems };
}

/**
 * The one write: the whole map with who saved it, or — when every number is
 * back on Max Strength's defaults — the field removed, so the studio follows
 * the defaults from then on (and an absent field keeps meaning "defaults").
 * `now` and `remove` are serverTimestamp() and deleteField(), passed in so
 * this stays pure. `uid` is the Auth uid, never the trainer document's id.
 */
export function variationWrite(
  v: InBodyVariation,
  uid: string,
  sentinels: { now: unknown; remove: unknown },
): { inbodyVariation: unknown } {
  if (isDefaultVariation(v)) return { inbodyVariation: sentinels.remove };
  return {
    inbodyVariation: {
      skeletalMuscleMassLb: v.skeletalMuscleMassLb,
      bodyFatMassLb: v.bodyFatMassLb,
      percentBodyFat: v.percentBodyFat,
      updatedBy: uid,
      updatedAt: sentinels.now,
    },
  };
}
