/**
 * MACHINE FIT — reading a body off a client record.
 *
 * Everything a client can be matched on, parsed once, in one place. The
 * record stores these the way a trainer typed them ("5'7\"", "148 lbs",
 * "Female"), so every reader that wants a NUMBER comes through here.
 *
 * The rule that matters: UNKNOWN IS NULL, NEVER A GUESS. A client with no
 * height is left out of height matching; she is not quietly treated as
 * average. (The profile used to pass `parseInt(client.weight || "150")` around
 * — a 150 lb default that looks like data. Nothing here does that.)
 *
 * Pure: imported by the screens and by the weekly job.
 */

import { parseHeightInches } from "../machine-trends/trends.ts";
import type { FitFactors } from "./types.ts";

export { parseHeightInches };

/** What the engine reads from a client document. A subset, so tests and the job pass plain objects. */
export interface FitClientInput {
  id?: string | null;
  height?: string | null;
  /** Fingertip to fingertip. Stored like height: "66", "66 in" or 5'6". */
  wingspan?: string | null;
  weight?: string | number | null;
  gender?: string | null;
  dateOfBirth?: string | null;
  age?: number | null;
  inbodySummary?: {
    latest?: {
      weightLb?: number | null;
      percentBodyFat?: number | null;
      skeletalMuscleMassLb?: number | null;
    } | null;
  } | null;
}

export const NO_FACTORS: FitFactors = {
  heightIn: null,
  gender: null,
  wingspanIn: null,
  weightLb: null,
  ageYears: null,
  bodyFatPct: null,
  muscleLb: null,
};

/** Wingspans run the same range as heights, and are typed the same ways. */
export function parseWingspanInches(text: string | null | undefined): number | null {
  return parseHeightInches(text);
}

/** "148", "148 lbs", "148.5", 148 → pounds. Anything outside 50–700 is a typo, not a weight. */
export function parsePounds(value: string | number | null | undefined): number | null {
  if (value == null || value === "") return null;
  const n =
    typeof value === "number"
      ? value
      : parseFloat(String(value).trim().replace(/,/g, ""));
  if (!Number.isFinite(n) || n < 50 || n > 700) return null;
  return Math.round(n);
}

/** "Male", "M", "male " → "m"; "Female", "f" → "f"; anything else is null and matches nobody by gender. */
export function parseGender(value: string | null | undefined): "m" | "f" | null {
  const g = (value || "").trim().toLowerCase();
  if (!g) return null;
  if (g === "m" || g === "male" || g === "man") return "m";
  if (g === "f" || g === "female" || g === "woman") return "f";
  return null;
}

/**
 * Whole years from a date of birth.
 *
 * Reads the yyyy-mm-dd at the front of the string as plain numbers — never
 * `new Date("1960-05-04")`, which is UTC midnight and lands on May 3rd in
 * Eastern (the date trap in CLAUDE.md). Mindbody sends "1960-05-04T00:00:00";
 * a trainer types "1960-05-04"; both start the same way.
 */
export function ageFromBirthDate(dateOfBirth: string | null | undefined, now: Date): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec((dateOfBirth || "").trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  let age = now.getFullYear() - y;
  const beforeBirthday = now.getMonth() + 1 < mo || (now.getMonth() + 1 === mo && now.getDate() < d);
  if (beforeBirthday) age -= 1;
  return age >= 5 && age <= 110 ? age : null;
}

function positive(n: unknown): number | null {
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : null;
}

/** Everything matchable about one client. `now` only matters for age. */
export function factorsOf(client: FitClientInput | null | undefined, now: Date = new Date()): FitFactors {
  if (!client) return NO_FACTORS;
  const latest = client.inbodySummary?.latest ?? null;
  const typedAge =
    typeof client.age === "number" && client.age >= 5 && client.age <= 110 ? Math.floor(client.age) : null;
  return {
    heightIn: parseHeightInches(client.height),
    gender: parseGender(client.gender),
    wingspanIn: parseWingspanInches(client.wingspan),
    // A scan is measured, the profile field is typed from memory: the scan wins.
    weightLb: parsePounds(positive(latest?.weightLb)) ?? parsePounds(client.weight),
    ageYears: ageFromBirthDate(client.dateOfBirth, now) ?? typedAge,
    bodyFatPct: positive(latest?.percentBodyFat),
    muscleLb: positive(latest?.skeletalMuscleMassLb),
  };
}

/** 67 → 5'7" */
export function formatInches(inches: number): string {
  const ft = Math.floor(inches / 12);
  return `${ft}'${inches - ft * 12}"`;
}
