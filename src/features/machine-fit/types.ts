/**
 * MACHINE FIT — shared types.
 *
 * Round: machine fit (Sep 17 2026). Read README.md in this folder first.
 *
 * "Fit" is how a machine is set for a body: Seat 3, Gap 4, Chest pad 2. The
 * question this feature answers is the one a trainer asks on a new client's
 * first day — "where do people built like her usually sit on this?" — and the
 * one a head trainer asks afterwards: "is anyone here sitting somewhere odd?"
 *
 * Nothing in this file imports Firebase or React. Everything the engine does
 * is a function of plain objects, so it is tested on plain objects and the
 * weekly job (server/machine-trends-job.ts) can bundle it.
 *
 * THE ONE VOCABULARY RULE: inside the engine every setting key and value is
 * NORMALISED (machine-trends' normalizeSettingKey / normalizeSettingValue), so
 * the legacy label-keyed settings ("Back Pad": "6") and the catalog's
 * slug-keyed ones ("back-pad": "6") are the same fact. Screens translate back
 * to the machine's own spelling at the edge (ui/field-values.ts).
 */

/* ------------------------------------------------------------------ *
 * A body
 * ------------------------------------------------------------------ */

/** What a client can be matched on. Every one is optional: unknown is null, never 0. */
export interface FitFactors {
  /** Whole inches. */
  heightIn: number | null;
  gender: "m" | "f" | null;
  /** Fingertip to fingertip, whole inches. Optional on the client record. */
  wingspanIn: number | null;
  weightLb: number | null;
  ageYears: number | null;
  /** InBody percent body fat, from client.inbodySummary.latest. */
  bodyFatPct: number | null;
  /** InBody skeletal muscle mass, lb. */
  muscleLb: number | null;
}

export type NumericFactor = "height" | "wingspan" | "weight" | "age" | "bodyFat" | "muscle";
export type FactorKey = NumericFactor | "gender";

export const NUMERIC_FACTORS: readonly NumericFactor[] = [
  "height",
  "wingspan",
  "weight",
  "age",
  "bodyFat",
  "muscle",
];

/** Which property of FitFactors a factor reads. One map, so nothing else spells them. */
export const FACTOR_FIELD: Record<NumericFactor, keyof FitFactors> = {
  height: "heightIn",
  wingspan: "wingspanIn",
  weight: "weightLb",
  age: "ageYears",
  bodyFat: "bodyFatPct",
  muscle: "muscleLb",
};

/* ------------------------------------------------------------------ *
 * How close is "similar"
 * ------------------------------------------------------------------ */

/**
 * One factor's tolerance. The search starts at `base` either side of the
 * client and widens one `step` at a time, at most `maxSteps` times:
 *
 *   height  base 0, step 1, maxSteps 3   →  exact, ±1", ±2", ±3"
 *   weight  base 10, step 10, maxSteps 3 →  ±10 lb, ±20, ±30, ±40
 *
 * "Exact" means nothing for a continuous measure like weight, which is why
 * it has a base and height does not.
 */
export interface FactorTolerance {
  on: boolean;
  base: number;
  step: number;
  maxSteps: number;
}

export interface MatchSpec {
  numeric: Record<NumericFactor, FactorTolerance>;
  /** Same gender only. Clients with no gender on file are left out when this is on. */
  gender: boolean;
  /**
   * The named minimum sample ("sentences, not scores"): the search stops at
   * the first band holding this many distinct clients, and below it no value
   * is ever offered.
   */
  minClients: number;
}

/* ------------------------------------------------------------------ *
 * The evidence
 * ------------------------------------------------------------------ */

/**
 * One body's settings on one machine.
 *
 * A studio row stands for one client (`n` = 1, `clientId` set). A company
 * sample stands for every client in one anonymous cell — same height, same
 * gender, same settings — so `n` is that cell's count and there is no id.
 * The engine treats them alike, which is why both tiers run the same code.
 */
export interface FitSample {
  /** Normalised key → normalised value. */
  settings: Record<string, string>;
  n: number;
  factors: Partial<FitFactors>;
  clientId?: string;
}

/** Where a saved value came from. Stored per field on clientMachineSettings.sources. */
export type SettingSource =
  /** A trainer typed or picked it. */
  | "typed"
  /** A trainer accepted the engine's suggestion and has not changed it. */
  | "suggested"
  /** Copied from the FileMaker chart (quick entry, the shorthand line, or an import). */
  | "legacy";

/* ------------------------------------------------------------------ *
 * What the ladder found
 * ------------------------------------------------------------------ */

export interface Band {
  lo: number;
  hi: number;
}

export interface Cohort {
  samples: FitSample[];
  /**
   * Everyone the ladder COULD have reached — the band at its last step,
   * whether or not the search stopped earlier. Suggestions never read it (the
   * tightest trustworthy band is the point). The audit does: before it calls
   * a value rare it checks that the value is still rare out here, so that
   * "none of the 6 clients her exact height use Gap 4" cannot outvote "one
   * client in ten, of every height, uses Gap 4".
   */
  wide: FitSample[];
  /** Distinct clients (Σ n). */
  clients: number;
  /** Which widening step produced this: 0 is the tightest. */
  ring: number;
  /** True when `clients` reached the spec's minimum. */
  enough: boolean;
  /** The band each factor was held to at that ring. */
  bands: Partial<Record<NumericFactor, Band>>;
  /** Every ring tried, tightest first — the evidence sheet shows this. */
  ladder: { ring: number; clients: number }[];
  /** Factors that actually took part in the match. */
  used: FactorKey[];
  /** Switched on, but THIS client has no value for them, so they could not be used. */
  missing: FactorKey[];
}

export type FitTier = "studio" | "company";

/* ------------------------------------------------------------------ *
 * A suggestion
 * ------------------------------------------------------------------ */

export type Strength =
  /** Most similar clients agree, and the values are seen together. Eligible for "accept strong". */
  | "strong"
  /** Enough clients, but they are split, or the full combination is rare. Offered, never bulk-accepted. */
  | "fair";

export interface FieldPick {
  key: string;
  value: string;
  /** Clients in the (conditioned) cohort using this value… */
  support: number;
  /** …out of this many who have any value for the field. */
  outOf: number;
  /**
   * The earlier picks this one was chosen GIVEN — the cluster part. Empty for
   * the first pick, and for a pick made after the cohort got too thin to keep
   * conditioning.
   */
  given: Record<string, string>;
  strength: Strength;
  /**
   * True when the value is what nearly everyone uses whatever their build
   * ("Gap 0"), found when the similar-client band was too thin to say anything.
   */
  universal?: boolean;
}

export interface ClusterSuggestion {
  tier: FitTier;
  cohort: Cohort;
  picks: FieldPick[];
  /** Clients in the cohort whose settings agree with EVERY pick (on the fields they have set). */
  seenTogether: number;
  strength: Strength;
  /** The trainer's own values the picks were conditioned on. */
  pinned: Record<string, string>;
  /**
   * "band": conditioned inside the similar-client band. "all": the band held
   * too few clients at the pinned value, so the link was read across every
   * height ("whoever sits at Seat 3 mostly uses Pad 2").
   */
  pinnedScope: "band" | "all" | "none";
}

/** Why nothing is offered — always a sentence's worth, never silence. */
export interface NoSuggestion {
  tier: FitTier | null;
  cohort: Cohort | null;
  reason:
    /** Nothing on her record to match on (no height, or every factor switched on is missing). */
    | "no-height"
    /** Read fine, and nobody is set up on this machine. */
    | "no-data"
    /** Fewer similar clients than the minimum. */
    | "thin"
    /** Enough similar clients, but no two of them share a value. */
    | "no-agreement"
    /** Neither tier could be READ. Unknown — never "nobody". */
    | "unknown";
}

export type SuggestionResult =
  | ({ ok: true } & ClusterSuggestion)
  | ({ ok: false } & NoSuggestion);

/* ------------------------------------------------------------------ *
 * The audit
 * ------------------------------------------------------------------ */

export type FlagLevel =
  /** Nobody similar sits here. Drawn as the plum mark; counted on the Setup segment. */
  | "rare"
  /** Few similar clients sit here. A faint dot inside the row; never counted anywhere. */
  | "uncommon";

export interface ValueShare {
  value: string;
  clients: number;
}

export interface FieldFlag {
  kind: "value";
  key: string;
  value: string;
  level: FlagLevel;
  /** Similar clients using this exact value. */
  clients: number;
  /** Similar clients with any value for the field. */
  outOf: number;
  /** What similar clients use instead, most common first. */
  distribution: ValueShare[];
  /** Numeric fields only: the middle of what similar clients use. */
  median?: number;
}

export interface ComboFlag {
  kind: "combo";
  keys: [string, string];
  values: [string, string];
  level: "uncommon";
  /** Clients using each value on its own. */
  each: [number, number];
  /** Clients with both fields set. */
  outOf: number;
}

export type FitFlag = FieldFlag | ComboFlag;

/** A trainer's "this is right for her". Tied to the value: change the value and it lapses. */
export interface FitAck {
  value: string;
  by: string;
  byName: string;
  at: string;
  note?: string;
}

export interface MachineAudit {
  tier: FitTier | null;
  cohort: Cohort | null;
  flags: FitFlag[];
  /** Flags a trainer has already reviewed at the current value. Shown in the evidence, never marked. */
  acknowledged: FitFlag[];
  /** Fields that could not be checked: fewer than the minimum similar clients have them set. */
  unchecked: string[];
  /** "unknown": neither tier could be read — not the same as too few similar clients. */
  state: "checked" | "no-height" | "not-enough" | "unknown";
}
