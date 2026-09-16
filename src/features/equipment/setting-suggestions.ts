/**
 * SMART SETTING SUGGESTIONS — a starting point for a machine a client has
 * never been set up on. Never a pre-fill.
 *
 * The owner's rule (client-profile audit, Sep 2026): "it should never prefill,
 * it should just suggest a starting point and offer tips if it can." So every
 * function here returns a SENTENCE's worth of evidence, and the Settings card
 * shows it under an empty field with a "Use" button the trainer has to tap.
 *
 * Two sources, both already paid for:
 *   1. The weekly machine-trends job (server/machine-trends-job.ts) stores,
 *      per machine, per setting, per value, how many clients use it AND how
 *      tall those clients are. "Around 5'7" here, the most common chest pad is 6"
 *      is one document read per machine.
 *   2. The catalog's body-type columns (shorter / taller stature), written by
 *      the MSF Academy evaluators — a tip, not a number.
 *
 * Sentences, not scores: a height suggestion needs MIN_CLIENTS distinct
 * clients inside the height band, or it says nothing.
 */

import {
  MIN_CLIENTS,
  normalizeSettingKey,
  normalizeSettingValue,
  type MachineTrend,
} from "../machine-trends/trends";
import type { BodyTypeAdjustments } from "../../types/machines";

export { parseHeightInches } from "../machine-trends/trends";

/** ± inches around the client's height that count as "around" it. */
export const HEIGHT_BAND_INCHES = 2;

export interface SettingSuggestion {
  /** The value to offer, in the field's own spelling where we can find it. */
  value: string;
  /** Clients in the height band who use this value. */
  clients: number;
  /** Clients in the height band with any value for this setting. */
  bandClients: number;
  /** "5'7\"" — the client's height, for the sentence. */
  heightLabel: string;
}

/** 67 → 5'7" */
export function formatHeight(inches: number): string {
  const ft = Math.floor(inches / 12);
  return `${ft}'${inches - ft * 12}"`;
}

/**
 * Turn a stored value key back into something a trainer would type: "6_5" →
 * "6.5", and an enum option is matched to its own spelling ("b" → "B").
 */
export function displayValue(valueKey: string, options?: readonly string[] | null): string {
  if (options && options.length) {
    const hit = options.find((o) => normalizeSettingValue(o) === valueKey);
    if (hit) return hit;
  }
  if (/^\d+_\d+$/.test(valueKey)) return valueKey.replace("_", ".");
  const spaced = valueKey.replace(/_/g, " ");
  // Short letter codes are positions ("b", "p3") and read upper-case on the machine.
  return spaced.length <= 3 ? spaced.toUpperCase() : spaced;
}

/**
 * The value most clients of about this height use for one setting, or null
 * when the band holds fewer than MIN_CLIENTS clients (or the trend is absent).
 * `fieldKeys` are tried in order — a field is stored under its legacy label
 * ("Seat") or its catalog slug ("seat"), and the job normalises both.
 */
export function suggestFromTrend(
  trend: Pick<MachineTrend, "settings"> | null | undefined,
  fieldKeys: readonly string[],
  heightInches: number | null,
  options?: readonly string[] | null,
  band: number = HEIGHT_BAND_INCHES,
): SettingSuggestion | null {
  if (!trend || heightInches === null) return null;
  let values: MachineTrend["settings"][string] | undefined;
  for (const k of fieldKeys) {
    const nk = normalizeSettingKey(k);
    if (nk && trend.settings?.[nk]) {
      values = trend.settings[nk];
      break;
    }
  }
  if (!values) return null;

  let bandClients = 0;
  let best: { key: string; clients: number; overall: number } | null = null;
  for (const [valueKey, v] of Object.entries(values)) {
    let inBand = 0;
    for (const [h, count] of Object.entries(v.byHeight || {})) {
      const hn = Number(h);
      if (Number.isFinite(hn) && Math.abs(hn - heightInches) <= band) inBand += Number(count) || 0;
    }
    if (inBand <= 0) continue;
    bandClients += inBand;
    const overall = Number(v.clients) || 0;
    if (!best || inBand > best.clients || (inBand === best.clients && overall > best.overall)) {
      best = { key: valueKey, clients: inBand, overall };
    }
  }
  // The band needs MIN_CLIENTS people, and the offered value more than one of
  // them — a single client's choice is an anecdote, not a starting point.
  if (!best || bandClients < MIN_CLIENTS || best.clients < 2) return null;
  return {
    value: displayValue(best.key, options),
    clients: best.clients,
    bandClients,
    heightLabel: formatHeight(heightInches),
  };
}

export type StatureBand = "shorter" | "taller" | "average";

/**
 * The catalog's baseline is "roughly 5'9" male / 5'4" female"
 * (types/machines.ts UniversalBaseline). Three inches either side of it is a
 * body-type column; inside that the baseline itself applies.
 */
export function statureBand(heightInches: number | null, gender?: string | null): StatureBand | null {
  if (heightInches === null) return null;
  const g = (gender || "").trim().toLowerCase();
  const baseline = g.startsWith("m") ? 69 : g.startsWith("f") ? 64 : 66.5;
  if (heightInches <= baseline - 3) return "shorter";
  if (heightInches >= baseline + 3) return "taller";
  return "average";
}

/** The catalog's tip for this client's stature, joined into one line, or null. */
export function statureTip(
  adjustments: Partial<BodyTypeAdjustments> | null | undefined,
  band: StatureBand | null,
): string | null {
  if (!adjustments || !band || band === "average") return null;
  const col = band === "shorter" ? adjustments.shorterStature : adjustments.tallerStature;
  if (!col) return null;
  const parts = [col.seatAdjustment, col.padHandlePlacement, col.specialNotes]
    .map((p) => (p || "").trim())
    .filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}
