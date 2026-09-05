/**
 * REPORT — everything the dashboard renders, computed once per generate.
 *
 * `buildReport` is pure: it takes the raw records the hook fetched plus the
 * reference data the profile already has (machines, trainers) and returns
 * one object. The dashboard is then a plain function of that object, which
 * is what makes it possible to render the whole thing in the harness with
 * synthetic data and to test the numbers without a browser.
 */

import type { Client, ClinicalIncident, ExerciseLog, Machine, Trainer, WorkoutSession } from "../../types";
import { getBroadMuscleGroup } from "../../lib/clinical-review-utils";
import { buildFacts, dayMs, factsInRange } from "./facts";
import {
  correlationMatrix,
  detectPlateaus,
  formHeatmap,
  monthlyTrend,
  summarize,
  weeklyTrend,
  withBaselines,
  type IndexedFact,
} from "./analytics";
import { coverageInsights, correlationInsights, formInsights, plateauInsights, rankInsights, volumeInsights } from "./insights";
import type { Correlation, Heatmap, Insight, MachinePlateau, RangePreset, ReportRange, SessionFact, SetFact, Summary, WeekBucket } from "./types";

export interface ReportInput {
  client: Client;
  machines: Machine[];
  trainers: Trainer[];
  sessions: WorkoutSession[];
  logs: ExerciseLog[];
  incidents: ClinicalIncident[];
  range: ReportRange;
  timeZone?: string;
}

export interface Report {
  range: ReportRange;
  generatedAt: number;
  clientFirstName: string;
  /** Facts inside the range, oldest → newest, with baseline indexes. */
  facts: IndexedFact[];
  sets: SetFact[];
  summary: Summary;
  /** Same-length window immediately before the range, for the KPI deltas. Null for all-time. */
  prior: Summary | null;
  /** Chart buckets — weekly up to ~26 weeks, monthly beyond. */
  weeks: WeekBucket[];
  trendPeriod: "week" | "month";
  correlations: Correlation[];
  heatmap: Heatmap;
  heatmapPeriod: "week" | "month";
  plateaus: MachinePlateau[];
  insights: Insight[];
  /** Everything, not just the top eight — the "all findings" drawer. */
  allInsights: Insight[];
  machineName: (id: string) => string;
}

/* ------------------------------------------------------------------ *
 * Range helpers
 * ------------------------------------------------------------------ */

export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function shiftIso(iso: string, days: number): string {
  const d = new Date(dayMs(iso));
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function rangeForPreset(preset: RangePreset, to = todayIso()): ReportRange {
  switch (preset) {
    case "30d":
      return { preset, from: shiftIso(to, -29), to };
    case "90d":
      return { preset, from: shiftIso(to, -89), to };
    case "6m":
      return { preset, from: shiftIso(to, -182), to };
    case "12m":
      return { preset, from: shiftIso(to, -364), to };
    case "all":
      return { preset, from: null, to };
    default:
      return { preset: "custom", from: shiftIso(to, -29), to };
  }
}

/** The window of equal length immediately before `range`, or null for all-time. */
export function priorRange(range: ReportRange): ReportRange | null {
  if (!range.from) return null;
  const span = Math.round((dayMs(range.to) - dayMs(range.from)) / 86_400_000) + 1;
  return { preset: "custom", from: shiftIso(range.from, -span), to: shiftIso(range.from, -1) };
}

export function rangeLabel(range: ReportRange): string {
  switch (range.preset) {
    case "30d":
      return "Last 30 days";
    case "90d":
      return "Last 90 days";
    case "6m":
      return "Last 6 months";
    case "12m":
      return "Last 12 months";
    case "all":
      return "All time";
    default:
      return range.from ? `${range.from} → ${range.to}` : "Custom";
  }
}

/* ------------------------------------------------------------------ */

export function buildReport(input: ReportInput): Report {
  const { client, machines, trainers, sessions, logs, incidents, range } = input;
  const byId = new Map(machines.filter((m) => !!m.id).map((m) => [m.id as string, m]));
  const machineName = (id: string) => byId.get(id)?.fullName || byId.get(id)?.name || id;
  const machineGroup = (id: string) => getBroadMuscleGroup(byId.get(id)?.anatomicalRegion, byId.get(id)?.name || id);
  void trainers;

  // Facts over EVERYTHING fetched (so rest days and the trailing baselines
  // are computed against sessions just before the range, not from a cold
  // start), then cut to the range.
  const all = buildFacts(sessions, logs, incidents, { timeZone: input.timeZone });
  const indexedAll = withBaselines(all.facts);
  const facts = factsInRange(indexedAll, range.from, range.to);
  const sets = factsInRange(all.sets, range.from, range.to);

  const summary = summarize(facts);
  const prior = (() => {
    const p = priorRange(range);
    if (!p) return null;
    const pf = factsInRange(all.facts, p.from, p.to);
    return pf.length ? summarize(pf) : null;
  })();

  const weeklyBuckets = weeklyTrend(facts);
  const trendPeriod: "week" | "month" = weeklyBuckets.length > 26 ? "month" : "week";
  const weeks = trendPeriod === "week" ? weeklyBuckets : monthlyTrend(facts);
  const correlations = correlationMatrix(facts);
  const heatmapPeriod: "week" | "month" = summary.spanDays <= 98 ? "week" : "month";
  const heatmap = formHeatmap(sets, { period: heatmapPeriod, machineName, machineGroup });
  const plateaus = detectPlateaus(sets, { machineName, machineGroup });

  const firstName = client.firstName || "This client";
  const allInsights = [
    ...correlationInsights(correlations, firstName),
    ...plateauInsights(plateaus),
    ...formInsights(heatmap, summary, firstName),
    ...volumeInsights(weeklyBuckets, summary, firstName),
    ...coverageInsights(summary),
  ];

  return {
    range,
    generatedAt: Date.now(),
    clientFirstName: firstName,
    facts,
    sets,
    summary,
    prior,
    weeks,
    trendPeriod,
    correlations,
    heatmap,
    heatmapPeriod,
    plateaus,
    insights: rankInsights(allInsights, 8),
    allInsights: rankInsights(allInsights, 100),
    machineName,
  };
}

/** Helper for the KPI tiles: relative change of a metric vs the prior window. */
export function deltaPct(current: number | null, prior: number | null): number | null {
  if (current === null || prior === null || prior === 0) return null;
  return ((current - prior) / Math.abs(prior)) * 100;
}

export type { SessionFact };
