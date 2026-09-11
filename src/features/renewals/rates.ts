/**
 * RENEWALS — outcomes counted up, for the leader-only panel in Operations →
 * Renewals (proposal §4.2). Pure; tested in rates.test.ts.
 *
 * A package counts in the quarter it closed (`closedOn` on its cycle).
 * "Kept" is renewed + upgraded + downgraded, plus pay-as-you-go when the
 * studio's setting says so. Per-trainer numbers need MIN_TRAINER_OUTCOMES
 * before they show, and they are context, not a verdict — the same care the
 * Insights tab takes with return rate. Per-trainer rates are for studio
 * leaders only (AJ, Sep 10 2026).
 */

import type { PayAsYouGoCountsAs, RenewalOutcome, RenewalSettings } from "./types";

export const MIN_TRAINER_OUTCOMES = 5;

export interface OutcomeRow {
  cycleKey: string;
  outcome: RenewalOutcome | null | undefined;
  packageKey?: string | null;
  primaryTrainerId?: string | null;
  closedOn?: string | null;
  studioId?: string;
}

export interface OutcomeTally {
  /** Closed packages with an outcome recorded. */
  total: number;
  renewed: number;
  upgraded: number;
  downgraded: number;
  payAsYouGo: number;
  lost: number;
  kept: number;
  /** kept ÷ total, 0–1. Null with nothing recorded. */
  keptRate: number | null;
}

export function isKept(outcome: RenewalOutcome | null | undefined, settings: Pick<RenewalSettings, "payAsYouGoCountsAs">): boolean {
  if (outcome === "renewed" || outcome === "upgraded" || outcome === "downgraded") return true;
  if (outcome === "pay-as-you-go") return settings.payAsYouGoCountsAs === "retained";
  return false;
}

/**
 * A studio's pay-as-you-go rule, or — across several studios — a lookup from
 * each row to its own studio's rule.
 */
export type PaygRule = Pick<RenewalSettings, "payAsYouGoCountsAs"> | ((row: OutcomeRow) => PayAsYouGoCountsAs);

const ruleFor = (rule: PaygRule, row: OutcomeRow) =>
  typeof rule === "function" ? { payAsYouGoCountsAs: rule(row) } : rule;

export function tallyOutcomes(rows: OutcomeRow[], settings: PaygRule): OutcomeTally {
  const t: OutcomeTally = { total: 0, renewed: 0, upgraded: 0, downgraded: 0, payAsYouGo: 0, lost: 0, kept: 0, keptRate: null };
  for (const r of rows) {
    switch (r.outcome) {
      case "renewed":
        t.renewed++;
        break;
      case "upgraded":
        t.upgraded++;
        break;
      case "downgraded":
        t.downgraded++;
        break;
      case "pay-as-you-go":
        t.payAsYouGo++;
        break;
      case "lost":
        t.lost++;
        break;
      default:
        continue;
    }
    t.total++;
    if (isKept(r.outcome, ruleFor(settings, r))) t.kept++;
  }
  t.keptRate = t.total > 0 ? t.kept / t.total : null;
  return t;
}

export interface TallyGroup {
  /** The group's key; null for "not known" (no package, no trainer). */
  key: string | null;
  tally: OutcomeTally;
}

/** Rows grouped by `keyOf`, biggest group first. */
export function groupTallies(
  rows: OutcomeRow[],
  keyOf: (r: OutcomeRow) => string | null | undefined,
  settings: PaygRule,
): TallyGroup[] {
  const groups = new Map<string | null, OutcomeRow[]>();
  for (const r of rows) {
    if (!r.outcome) continue;
    const k = keyOf(r) || null;
    const list = groups.get(k) ?? [];
    list.push(r);
    groups.set(k, list);
  }
  return Array.from(groups.entries())
    .map(([key, list]) => ({ key, tally: tallyOutcomes(list, settings) }))
    .sort(
      (a, b) =>
        b.tally.total - a.tally.total ||
        Number(a.key === null) - Number(b.key === null) ||
        String(a.key ?? "").localeCompare(String(b.key ?? "")),
    );
}

/** "82%", or "—" with nothing recorded. */
export function rateText(t: Pick<OutcomeTally, "keptRate">): string {
  return t.keptRate === null ? "—" : `${Math.round(t.keptRate * 100)}%`;
}

/** Whether a trainer's numbers are enough to show. */
export function enoughToShow(t: Pick<OutcomeTally, "total">): boolean {
  return t.total >= MIN_TRAINER_OUTCOMES;
}

/* ------------------------------------------------------------------ *
 * Quarters
 * ------------------------------------------------------------------ */

export interface Quarter {
  /** "2026-Q3". */
  key: string;
  /** "Jul–Sep 2026". */
  label: string;
  /** YYYY-MM-DD, inclusive. */
  from: string;
  to: string;
}

const QUARTER_LABELS = ["Jan–Mar", "Apr–Jun", "Jul–Sep", "Oct–Dec"];
const QUARTER_ENDS = ["03-31", "06-30", "09-30", "12-31"];

function quarterAt(year: number, q: number): Quarter {
  const startMonth = String(q * 3 + 1).padStart(2, "0");
  return {
    key: `${year}-Q${q + 1}`,
    label: `${QUARTER_LABELS[q]} ${year}`,
    from: `${year}-${startMonth}-01`,
    to: `${year}-${QUARTER_ENDS[q]}`,
  };
}

export function quarterOf(day: string): Quarter {
  const year = Number(day.slice(0, 4));
  const month = Number(day.slice(5, 7));
  return quarterAt(year, Math.floor((month - 1) / 3));
}

/** This quarter and the `count - 1` before it, newest first. */
export function recentQuarters(today: string, count: number): Quarter[] {
  const out: Quarter[] = [];
  let year = Number(today.slice(0, 4));
  let q = Math.floor((Number(today.slice(5, 7)) - 1) / 3);
  for (let i = 0; i < count; i++) {
    out.push(quarterAt(year, q));
    q--;
    if (q < 0) {
      q = 3;
      year--;
    }
  }
  return out;
}
