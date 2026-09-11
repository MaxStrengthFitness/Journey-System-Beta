/**
 * INBODY — shared types.
 *
 * Round: Renewals (Sep 2026), Phase 7. See OPERATIONS-RENEWALS-PROPOSAL.md
 * §4.5 and docs/business/data-sources.md.
 *
 * One document per scan at clients/{clientId}/inbodyScans/{scanId}, holding
 * the numbers from one InBody 270S printout. Body composition is health data,
 * so the scans follow the sessions rule (only people who can open the client
 * may read them), never the open progressReports rule.
 *
 * The client document carries a small `inbodySummary` (first scan against
 * the latest) so the nightly renewals job and the Renewal Brief can say
 * "muscle up 2.3 lb since January" without reading every scan.
 *
 * Nothing here imports Firebase.
 */

/** The five bars of the printout's Segmental Lean Analysis. */
export const INBODY_SEGMENTS = ["rightArm", "leftArm", "trunk", "rightLeg", "leftLeg"] as const;
export type InBodySegment = (typeof INBODY_SEGMENTS)[number];

export interface InBodySegmentLean {
  /** Lean mass in the segment, lb. */
  lb: number;
  /** The percentage printed under the bar (100% = enough for their weight). */
  pctOfIdeal: number | null;
}

/** manual: typed from the printout. photo / lookinbody: later rounds. */
export type InBodySource = "manual" | "photo" | "lookinbody";

/** The numbers from one printout, in the printout's own units (lb). */
export interface InBodyMeasures {
  weightLb: number;
  skeletalMuscleMassLb: number;
  bodyFatMassLb: number;
  percentBodyFat: number;
  bmi: number | null;
  totalBodyWaterLb: number | null;
  dryLeanMassLb: number | null;
  fatFreeMassLb: number | null;
  basalMetabolicRateKcal: number | null;
  /** Skeletal Muscle Index, kg/m² — the one metric InBody prints in metric. */
  smi: number | null;
  /** Whole body phase angle, 50 kHz, degrees. */
  phaseAngle: number | null;
  segmentalLean: Partial<Record<InBodySegment, InBodySegmentLean>> | null;
}

/** clients/{clientId}/inbodyScans/{scanId} */
export interface InBodyScan extends InBodyMeasures {
  id?: string;
  /** The test date on the printout, YYYY-MM-DD. */
  testedAt: string;
  /** "InBody 270S". */
  device: string;
  source: InBodySource;
  /** The studio it was entered at. */
  studioId: string;
  /** Firebase uid of whoever typed it in. */
  enteredBy: string;
  enteredByName: string;
  createdAt?: unknown;
  updatedBy?: string | null;
  updatedAt?: unknown;
}

/** The headline numbers, as the summary keeps them. */
export interface InBodyHeadline {
  weightLb: number;
  skeletalMuscleMassLb: number;
  bodyFatMassLb: number;
  percentBodyFat: number;
}

/**
 * clients/{clientId}.inbodySummary — the first scan against the latest.
 * Rewritten by the app whenever a scan is added, corrected or removed.
 * The changes are null until there are two scans.
 */
export interface InBodySummary {
  scanCount: number;
  firstTestedAt: string;
  latestTestedAt: string;
  latest: InBodyHeadline;
  weightLbChange: number | null;
  muscleLbChange: number | null;
  bodyFatLbChange: number | null;
  /** Percentage points. */
  bodyFatPctChange: number | null;
  updatedAt?: unknown;
}
