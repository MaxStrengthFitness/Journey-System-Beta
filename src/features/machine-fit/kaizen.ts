/**
 * MACHINE FIT — the Kaizen report: one machine, across every body that uses it.
 *
 * The Setup screen looks at ONE client and asks what people like her use.
 * This looks at ONE machine and asks the questions a head trainer asks:
 *
 *   · where are 5'4" clients set, and where are 5'7" clients?   (BY HEIGHT)
 *   · who is on Seat 3 — how many, how tall, which build?        (BY SETTING)
 *   · does the seat actually follow height on this machine, or
 *     is it set by feel?                                         (LINKS)
 *   · which whole set-ups turn up again and again?               (CLUSTERS)
 *   · is anyone sitting somewhere unusual for their build?       (THE CHECK)
 *
 * ONE BUILDER, TWO SCOPES. The same function runs in the browser over one
 * studio's own clients (live, leaders and up — it names clients, because a
 * leader may see their own) and in the weekly job over every studio (stored
 * at kaizenReports/{machineId}, administrators only — it never names anyone).
 * `buildKaizen` therefore returns the two halves separately: `report` is safe
 * to store, `findings` carries client ids and never leaves the device.
 *
 * SENTENCES, NOT SCORES. Every average, every "most clients use" and every
 * link carries its own minimum sample, and below it the field is `null` — a
 * screen says "not enough data yet". Counts are always present. Nothing here
 * is a grade of a trainer or a studio.
 *
 * Pure: no Firebase, no React. Bundled by the weekly job.
 */

import { NUMERIC_FIELD_SHARE, auditMachine } from "./audit.ts";
import { MIN_FIELD_SUPPORT, countField, medianOfPoints, numericOf, type WeightedPoint } from "./clusters.ts";
import { buildCohort, reachAt } from "./cohort.ts";
import type { FitAuditSubject } from "./fit-index.ts";
import { DEFAULT_MATCH_SPEC, MIN_CLIENTS } from "./match-spec.ts";
import {
  FACTOR_FIELD,
  type Cohort,
  type FieldFlag,
  type FitFactors,
  type FitSample,
  type MatchSpec,
  type NumericFactor,
} from "./types.ts";

/* ------------------------------------------------------------------ *
 * Named minimums and limits
 * ------------------------------------------------------------------ */

/** A link between a body measure and a setting is only tested on this many clients. */
export const LINK_MIN_CLIENTS = 10;
/** |r| at or above this: the setting FOLLOWS the measure closely. */
export const LINK_CLOSE = 0.6;
/** |r| at or above this: it loosely follows. Below it, nothing is claimed. */
export const LINK_LOOSE = 0.35;
/**
 * Weight, wingspan and age all travel with height, so a setting that follows
 * height will "follow" them too — as a shadow. A second measure is only
 * reported when its link is stronger than height's by at least this much (or
 * height has no link at all); otherwise the report would credit weight with
 * what height is doing.
 */
export const SHADOW_MARGIN = 0.1;
/** A height band never spans more than this many inches, however thin the data. */
export const MAX_BAND_INCHES = 4;
/** A thin last band is folded into its neighbour when the two together stay within this. */
export const MAX_MERGED_BAND_INCHES = 6;
/** Values listed per field; the rest are counted under `otherClients`. */
export const MAX_VALUES = 12;
/** Fields reported per machine when the caller does not name them. */
export const MAX_FIELDS = 8;
/** Whole set-ups listed. */
export const MAX_CLUSTERS = 8;
/** A studio "habit" needs the value to be this common at the studio AND elsewhere. */
export const HABIT_SHARE = 0.5;

/** The body measures a link is looked for against. InBody numbers are deliberately not among them. */
export const LINK_FACTORS: readonly NumericFactor[] = ["height", "wingspan", "weight", "age"];

/* ------------------------------------------------------------------ *
 * Shapes
 * ------------------------------------------------------------------ */

/** A sample that knows which studio it came from. */
export interface KaizenSample extends FitSample {
  studioId?: string | null;
}

/** Who a group of clients are. Every average is null under the minimum sample. */
export interface BodyStats {
  clients: number;
  women: number;
  men: number;
  /** Of `clients`, how many have a height on file. */
  withHeight: number;
  avgHeightIn: number | null;
  minHeightIn: number | null;
  maxHeightIn: number | null;
  avgWeightLb: number | null;
  avgAgeYears: number | null;
}

export interface HeightBand {
  /** Whole inches, inclusive: the shortest and tallest client actually in the band. */
  from: number;
  to: number;
  clients: number;
}

export interface BandValue {
  value: string;
  clients: number;
}

export interface FieldBand extends HeightBand {
  /** Clients in the band with THIS field set. */
  withField: number;
  /** Most used value; null under the minimum sample. */
  top: BandValue | null;
  /** The runner-up, when there is one. */
  next: BandValue | null;
  /** Numbered fields only: the middle value. */
  median: number | null;
}

export interface FactorLink {
  factor: NumericFactor;
  /** Clients with both the measure and a numbered value. */
  clients: number;
  /** Pearson correlation, −1…1, two decimals. */
  r: number;
  /** Setting units per ONE unit of the measure (per inch, per lb, per year). */
  slope: number;
}

export interface ValueReport extends BodyStats {
  value: string;
  /** Of the clients with this field set. */
  share: number;
}

export interface FieldReport {
  key: string;
  /** Clients with this field set. */
  clients: number;
  numeric: boolean;
  /** Numbered fields run low → high; anything else, most used first. */
  values: ValueReport[];
  /** Clients on values beyond MAX_VALUES. */
  otherClients: number;
  bands: FieldBand[];
  /** The measures this setting follows, strongest first. Only |r| ≥ LINK_LOOSE. */
  links: FactorLink[];
  /**
   * The measures there were enough clients to TEST, and on how many — so
   * "does not follow height" is a finding with a sample behind it, not a gap.
   */
  tested: { factor: NumericFactor; clients: number }[];
}

export interface ClusterReport extends BodyStats {
  settings: Record<string, string>;
  /** Of every client with anything set on this machine. */
  share: number;
  /** True when the set-up names every field of the machine. */
  complete: boolean;
}

export interface StudioHabit {
  key: string;
  studioValue: string;
  studioClients: number;
  studioOutOf: number;
  /** What the OTHER studios mostly use. */
  elsewhereValue: string;
  elsewhereClients: number;
  elsewhereOutOf: number;
}

export interface StudioFitReport {
  clients: number;
  /** Clients whose set-up could be compared with enough similar clients. */
  checked: number;
  /** Of those, clients with at least one setting nobody similar uses — and nobody has reviewed. */
  unusual: number;
  habits: StudioHabit[];
}

export interface KaizenReport {
  machineId: string;
  /** Clients with anything saved on this machine. */
  onFile: number;
  /** Clients whose settings count as evidence (a value only accepted from a suggestion does not, until trained on). */
  clients: number;
  withHeight: number;
  studios: number;
  fieldKeys: string[];
  fields: Record<string, FieldReport>;
  clusters: ClusterReport[];
  checked: number;
  unusual: number;
  byStudio: Record<string, StudioFitReport>;
}

/** One client with something worth a look. Carries an id: never stored, never sent anywhere. */
export interface SubjectFinding {
  clientId: string;
  studioId: string | null;
  flags: FieldFlag[];
  /** Who she was compared with — the band and the factors, for the sentence. No samples. */
  cohort: Pick<Cohort, "bands" | "used" | "clients" | "ring">;
}

export interface AuditRollup {
  checked: number;
  notChecked: number;
  findings: SubjectFinding[];
  /** studioId ("" when a subject has none) → clients that could be checked. */
  checkedByStudio: Record<string, number>;
}

/* ------------------------------------------------------------------ *
 * Small sums
 * ------------------------------------------------------------------ */

const round = (n: number, places: number) => {
  const f = 10 ** places;
  return Math.round(n * f) / f;
};

function weightedMean(points: readonly WeightedPoint[]): { mean: number; n: number } | null {
  let sum = 0;
  let n = 0;
  for (const p of points) {
    if (!Number.isFinite(p.x) || p.n <= 0) continue;
    sum += p.x * p.n;
    n += p.n;
  }
  return n > 0 ? { mean: sum / n, n } : null;
}

function factorPoints(samples: readonly FitSample[], field: keyof FitFactors): WeightedPoint[] {
  const out: WeightedPoint[] = [];
  for (const s of samples) {
    const x = s.factors[field];
    if (typeof x === "number" && Number.isFinite(x)) out.push({ x, n: s.n });
  }
  return out;
}

export function bodyStats(samples: readonly FitSample[], minClients: number = MIN_CLIENTS): BodyStats {
  let clients = 0;
  let women = 0;
  let men = 0;
  for (const s of samples) {
    clients += s.n;
    if (s.factors.gender === "f") women += s.n;
    else if (s.factors.gender === "m") men += s.n;
  }
  const heights = factorPoints(samples, "heightIn");
  const h = weightedMean(heights);
  const w = weightedMean(factorPoints(samples, "weightLb"));
  const a = weightedMean(factorPoints(samples, "ageYears"));
  const enoughHeights = !!h && h.n >= minClients;
  return {
    clients,
    women,
    men,
    withHeight: h?.n ?? 0,
    avgHeightIn: enoughHeights ? round(h.mean, 1) : null,
    minHeightIn: enoughHeights ? Math.min(...heights.map((p) => p.x)) : null,
    maxHeightIn: enoughHeights ? Math.max(...heights.map((p) => p.x)) : null,
    avgWeightLb: w && w.n >= minClients ? Math.round(w.mean) : null,
    avgAgeYears: a && a.n >= minClients ? Math.round(a.mean) : null,
  };
}

/* ------------------------------------------------------------------ *
 * Height bands
 * ------------------------------------------------------------------ */

/**
 * The finest bands the data supports. Walks up from the shortest client,
 * closing a band as soon as it holds `minClients` — so where the studio has
 * plenty of 5'4" clients the band IS 5'4", and out in the tails it widens.
 * A band is closed at MAX_BAND_INCHES whether or not it filled: a "band" from
 * 4'10" to 5'6" would not be saying anything about height. Thin bands are
 * kept and shown as "not enough data yet", never hidden and never padded.
 */
export function heightBands(
  samples: readonly FitSample[],
  minClients: number = MIN_CLIENTS,
  maxWidth: number = MAX_BAND_INCHES,
): HeightBand[] {
  const perInch = new Map<number, number>();
  for (const s of samples) {
    const h = s.factors.heightIn;
    if (typeof h !== "number" || !Number.isFinite(h)) continue;
    perInch.set(h, (perInch.get(h) ?? 0) + s.n);
  }
  const inches = [...perInch.keys()].sort((a, b) => a - b);
  const bands: HeightBand[] = [];
  let open: HeightBand | null = null;
  for (const inch of inches) {
    if (open && inch - open.from + 1 > maxWidth) {
      bands.push(open);
      open = null;
    }
    if (!open) open = { from: inch, to: inch, clients: 0 };
    open.to = inch;
    open.clients += perInch.get(inch) ?? 0;
    if (open.clients >= minClients) {
      bands.push(open);
      open = null;
    }
  }
  if (open) {
    const last = bands[bands.length - 1];
    if (last && open.clients < minClients && open.to - last.from + 1 <= MAX_MERGED_BAND_INCHES) {
      last.to = open.to;
      last.clients += open.clients;
    } else {
      bands.push(open);
    }
  }
  return bands;
}

const inBand = (s: FitSample, band: HeightBand) =>
  typeof s.factors.heightIn === "number" && s.factors.heightIn >= band.from && s.factors.heightIn <= band.to;

/* ------------------------------------------------------------------ *
 * Links
 * ------------------------------------------------------------------ */

/**
 * Does a numbered setting follow a body measure? Pearson's r over the clients
 * who have both, each anonymous cell weighted by its count.
 *
 * Returns null — "not tested" — under LINK_MIN_CLIENTS, or when either side
 * does not vary (everyone the same height, or everyone on the same notch:
 * there is no line to draw). Settings are notches, not a continuous measure,
 * so r is read in three broad bands (close / loose / none) and never quoted
 * to a trainer as a number.
 */
export function linkOf(samples: readonly FitSample[], key: string, factor: NumericFactor): FactorLink | null {
  const field = FACTOR_FIELD[factor];
  let n = 0;
  let sx = 0;
  let sy = 0;
  const pairs: { x: number; y: number; n: number }[] = [];
  for (const s of samples) {
    const x = s.factors[field];
    const raw = s.settings[key];
    if (typeof x !== "number" || !Number.isFinite(x) || raw === undefined) continue;
    const y = numericOf(raw);
    if (y === null) continue;
    pairs.push({ x, y, n: s.n });
    n += s.n;
    sx += x * s.n;
    sy += y * s.n;
  }
  if (n < LINK_MIN_CLIENTS) return null;
  const mx = sx / n;
  const my = sy / n;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const p of pairs) {
    sxx += p.n * (p.x - mx) ** 2;
    syy += p.n * (p.y - my) ** 2;
    sxy += p.n * (p.x - mx) * (p.y - my);
  }
  if (sxx <= 0 || syy <= 0) return null;
  const r = sxy / Math.sqrt(sxx * syy);
  return { factor, clients: n, r: round(r, 2), slope: round(sxy / sxx, 3) };
}

/* ------------------------------------------------------------------ *
 * One field
 * ------------------------------------------------------------------ */

function isNumericField(samples: readonly FitSample[], key: string): boolean {
  const { counts, total } = countField(samples, key);
  if (total === 0) return false;
  let numeric = 0;
  for (const [value, n] of counts) if (numericOf(value) !== null) numeric += n;
  return numeric / total >= NUMERIC_FIELD_SHARE;
}

function topTwo(samples: readonly FitSample[], key: string): { top: BandValue | null; next: BandValue | null; total: number } {
  const { counts, total } = countField(samples, key);
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  return {
    top: ranked[0] ? { value: ranked[0][0], clients: ranked[0][1] } : null,
    next: ranked[1] ? { value: ranked[1][0], clients: ranked[1][1] } : null,
    total,
  };
}

export function fieldReport(
  key: string,
  samples: readonly FitSample[],
  bands: readonly HeightBand[],
  minClients: number = MIN_CLIENTS,
): FieldReport {
  const withField = samples.filter((s) => s.settings[key] !== undefined);
  const { counts, total } = countField(withField, key);
  const numeric = isNumericField(withField, key);

  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  const kept = ranked.slice(0, MAX_VALUES);
  const otherClients = ranked.slice(MAX_VALUES).reduce((sum, [, n]) => sum + n, 0);
  if (numeric) {
    // A seat table reads 1, 2, 3…; a word that strayed in goes last.
    kept.sort((a, b) => (numericOf(a[0]) ?? Infinity) - (numericOf(b[0]) ?? Infinity));
  }
  const values: ValueReport[] = kept.map(([value, n]) => ({
    value,
    share: total > 0 ? round(n / total, 3) : 0,
    ...bodyStats(
      withField.filter((s) => s.settings[key] === value),
      minClients,
    ),
  }));

  const fieldBands: FieldBand[] = bands.map((band) => {
    const here = withField.filter((s) => inBand(s, band));
    const { top, next, total: n } = topTwo(here, key);
    const enough = n >= minClients;
    const points: WeightedPoint[] = [];
    if (numeric) {
      for (const s of here) {
        const x = numericOf(s.settings[key]);
        if (x !== null) points.push({ x, n: s.n });
      }
    }
    return {
      ...band,
      withField: n,
      top: enough ? top : null,
      next: enough ? next : null,
      median: enough && numeric ? medianOfPoints(points) : null,
    };
  });

  const links: FactorLink[] = [];
  const tested: FieldReport["tested"] = [];
  if (numeric) {
    const found: FactorLink[] = [];
    for (const factor of LINK_FACTORS) {
      const link = linkOf(withField, key, factor);
      if (!link) continue;
      tested.push({ factor, clients: link.clients });
      if (Math.abs(link.r) >= LINK_LOOSE) found.push(link);
    }
    const height = found.find((l) => l.factor === "height");
    for (const link of found) {
      const shadow = height && link.factor !== "height" && Math.abs(link.r) < Math.abs(height.r) + SHADOW_MARGIN;
      if (!shadow) links.push(link);
    }
    links.sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
  }

  return { key, clients: total, numeric, values, otherClients, bands: fieldBands, links, tested };
}

/* ------------------------------------------------------------------ *
 * Whole set-ups
 * ------------------------------------------------------------------ */

const signatureFor = (settings: Record<string, string>, fieldKeys: readonly string[]) =>
  fieldKeys
    .filter((k) => settings[k] !== undefined)
    .map((k) => `${k}=${settings[k]}`)
    .join(";");

export function clusterReports(
  samples: readonly FitSample[],
  fieldKeys: readonly string[],
  minClients: number = MIN_CLIENTS,
): ClusterReport[] {
  const groups = new Map<string, FitSample[]>();
  let everyone = 0;
  for (const s of samples) {
    const signature = signatureFor(s.settings, fieldKeys);
    if (!signature) continue;
    everyone += s.n;
    const list = groups.get(signature);
    if (list) list.push(s);
    else groups.set(signature, [s]);
  }
  const out: ClusterReport[] = [];
  for (const [, list] of groups) {
    const stats = bodyStats(list, minClients);
    // One client's set-up is not a pattern — and listing it would be listing her.
    if (stats.clients < MIN_FIELD_SUPPORT) continue;
    const settings: Record<string, string> = {};
    for (const k of fieldKeys) if (list[0].settings[k] !== undefined) settings[k] = list[0].settings[k];
    out.push({
      ...stats,
      settings,
      share: everyone > 0 ? round(stats.clients / everyone, 3) : 0,
      complete: fieldKeys.every((k) => settings[k] !== undefined),
    });
  }
  return out.sort((a, b) => b.clients - a.clients).slice(0, MAX_CLUSTERS);
}

/* ------------------------------------------------------------------ *
 * The check, for everyone at once
 * ------------------------------------------------------------------ */

const FULL: FitFactors = {
  heightIn: null,
  gender: null,
  wingspanIn: null,
  weightLb: null,
  ageYears: null,
  bodyFatPct: null,
  muscleLb: null,
};

export interface AuditEveryoneArgs {
  fieldKeys: readonly string[];
  subjects: readonly FitAuditSubject[];
  /** The evidence pool. Each subject is compared with everyone in it BUT herself. */
  evidence: readonly FitSample[];
  spec?: MatchSpec;
  fieldSteps?: Record<string, number | undefined>;
}

/**
 * The Setup screen's passive check, run once per client on this machine.
 * Exactly the same rules (auditMachine), the same leave-yourself-out, the
 * same reviews honoured — so a client listed here shows the same plum mark
 * when her profile is opened, and one marked "right for this client" there is
 * not listed here.
 *
 * Only `rare` single-value flags count. "Uncommon" is a faint dot on the
 * Setup screen and is counted nowhere; it is counted nowhere here either.
 *
 * COST. With height on (the default) the pool for each client is cut to the
 * heights her ladder can reach before the cohort is built, so the whole pass
 * is near-linear instead of clients × clients.
 */
export function auditEveryone({
  fieldKeys,
  subjects,
  evidence,
  spec = DEFAULT_MATCH_SPEC,
  fieldSteps,
}: AuditEveryoneArgs): AuditRollup {
  const heightOn = spec.numeric.height.on;
  const reach = heightOn ? reachAt(spec, "height", spec.numeric.height.maxSteps) : 0;
  const byInch = new Map<number, FitSample[]>();
  if (heightOn) {
    for (const s of evidence) {
      const h = s.factors.heightIn;
      if (typeof h !== "number") continue;
      const list = byInch.get(h);
      if (list) list.push(s);
      else byInch.set(h, [s]);
    }
  }

  let checked = 0;
  let notChecked = 0;
  const findings: SubjectFinding[] = [];
  const checkedByStudio: Record<string, number> = {};
  for (const subject of subjects) {
    const target: FitFactors = { ...FULL, ...subject.factors };
    let pool: readonly FitSample[] = evidence;
    if (heightOn && typeof target.heightIn === "number") {
      const near: FitSample[] = [];
      for (let h = Math.floor(target.heightIn - reach); h <= Math.ceil(target.heightIn + reach); h += 1) {
        const list = byInch.get(h);
        if (list) near.push(...list);
      }
      pool = near;
    }
    const cohort = buildCohort(pool, target, spec, { excludeClientId: subject.clientId });
    const audit = auditMachine({
      fieldKeys,
      settings: subject.settings,
      cohort,
      tier: "studio",
      minClients: spec.minClients,
      acks: subject.acks,
      fieldSteps,
    });
    if (audit.state !== "checked") {
      notChecked += 1;
      continue;
    }
    checked += 1;
    const studioKey = subject.studioId ?? "";
    checkedByStudio[studioKey] = (checkedByStudio[studioKey] ?? 0) + 1;
    const rare = audit.flags.filter((f): f is FieldFlag => f.kind === "value" && f.level === "rare");
    if (rare.length > 0) {
      findings.push({
        clientId: subject.clientId,
        studioId: subject.studioId ?? null,
        flags: rare,
        cohort: { bands: cohort.bands, used: cohort.used, clients: cohort.clients, ring: cohort.ring },
      });
    }
  }
  return { checked, notChecked, findings, checkedByStudio };
}

/* ------------------------------------------------------------------ *
 * Studio habits
 * ------------------------------------------------------------------ */

/**
 * Where one studio's usual value differs from everyone else's — on settings
 * that do NOT follow height. (On a height-driven setting two studios differ
 * because their clients do; the height-matched check above is the fair test
 * there.) Both sides need the minimum sample and a clear majority, so this
 * is "Westlake mostly uses Gap 2, the others mostly use Gap 0" — a different
 * machine, a different habit, or a different way of writing the same thing —
 * and never a ranking.
 */
export function studioHabits(
  studioId: string,
  samples: readonly KaizenSample[],
  fields: Record<string, FieldReport>,
  minClients: number = MIN_CLIENTS,
): StudioHabit[] {
  const here = samples.filter((s) => s.studioId === studioId);
  const elsewhere = samples.filter((s) => s.studioId !== studioId);
  const out: StudioHabit[] = [];
  for (const [key, field] of Object.entries(fields)) {
    if (field.links.some((l) => l.factor === "height")) continue;
    const a = topTwo(here, key);
    const b = topTwo(elsewhere, key);
    if (!a.top || !b.top || a.total < minClients || b.total < minClients) continue;
    if (a.top.value === b.top.value) continue;
    if (a.top.clients / a.total < HABIT_SHARE || b.top.clients / b.total < HABIT_SHARE) continue;
    out.push({
      key,
      studioValue: a.top.value,
      studioClients: a.top.clients,
      studioOutOf: a.total,
      elsewhereValue: b.top.value,
      elsewhereClients: b.top.clients,
      elsewhereOutOf: b.total,
    });
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * The report
 * ------------------------------------------------------------------ */

/** The fields worth reporting when nobody names them: held by more than one client, most used first. */
export function deriveFieldKeys(samples: readonly FitSample[]): string[] {
  const counts = new Map<string, number>();
  for (const s of samples) for (const k of Object.keys(s.settings)) counts.set(k, (counts.get(k) ?? 0) + s.n);
  return [...counts.entries()]
    .filter(([, n]) => n >= MIN_FIELD_SUPPORT)
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .slice(0, MAX_FIELDS)
    .map(([k]) => k);
}

export interface BuildKaizenArgs {
  machineId: string;
  /** Verified evidence (fit-index samplesFromFitDoc), every studio in scope. */
  samples: readonly KaizenSample[];
  /** What is on file for each client (fit-index subjectsFromFitDoc). Omit to skip the check. */
  subjects?: readonly FitAuditSubject[];
  /** The machine's fields, normalised, in display order. Derived from the data when omitted (the job has no catalog). */
  fieldKeys?: readonly string[];
  spec?: MatchSpec;
  fieldSteps?: Record<string, number | undefined>;
}

export function buildKaizen({
  machineId,
  samples,
  subjects = [],
  fieldKeys,
  spec = DEFAULT_MATCH_SPEC,
  fieldSteps,
}: BuildKaizenArgs): { report: KaizenReport; findings: SubjectFinding[] } {
  const min = spec.minClients;
  const keys = fieldKeys && fieldKeys.length > 0 ? [...fieldKeys] : deriveFieldKeys(samples);
  const bands = heightBands(samples, min);
  const fields: Record<string, FieldReport> = {};
  for (const key of keys) fields[key] = fieldReport(key, samples, bands, min);

  const rollup = auditEveryone({ fieldKeys: keys, subjects, evidence: samples, spec, fieldSteps });

  const studioIds = new Set<string>();
  for (const s of samples) if (s.studioId) studioIds.add(s.studioId);
  for (const s of subjects) if (s.studioId) studioIds.add(s.studioId);

  // Per studio only when there is more than one: a single studio's report IS the studio.
  const byStudio: Record<string, StudioFitReport> = {};
  if (studioIds.size > 1) {
    for (const studioId of [...studioIds].sort()) {
      byStudio[studioId] = {
        clients: subjects.filter((s) => s.studioId === studioId).length,
        checked: rollup.checkedByStudio[studioId] ?? 0,
        unusual: rollup.findings.filter((f) => f.studioId === studioId).length,
        habits: studioHabits(studioId, samples, fields, min),
      };
    }
  }

  const everyone = bodyStats(samples, min);
  return {
    report: {
      machineId,
      onFile: subjects.length,
      clients: everyone.clients,
      withHeight: everyone.withHeight,
      studios: studioIds.size,
      fieldKeys: keys,
      fields,
      clusters: clusterReports(samples, keys, min),
      checked: rollup.checked,
      unusual: rollup.findings.length,
      byStudio,
    },
    findings: rollup.findings,
  };
}
