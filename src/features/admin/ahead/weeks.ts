/**
 * AHEAD — the events laid out by week: the run of weeks with the quiet
 * stretches folded, the strip above it, the counts line, the lenses, and the
 * week a trainer has a pile of talks. Pure: weeks.test.ts.
 *
 * Weeks run Monday to Sunday in the studio's day, as Week and Hours count
 * them (week/review.ts `mondayOf`). This week is always drawn, even with
 * nothing in it; any other run of empty weeks is one "All clear" line, the
 * way a client's history draws a break between sessions (AJ, Oct 7 2026: a
 * leader who sees a week is clear should see what comes next right below it).
 */

import { addDays, daysBetween } from "../../client-history/model";
import { mondayOf } from "../week/review";
import { monthOf } from "../month/month";
import { KIND_GROUP, type AheadClient, type AheadEvent, type AheadGroup } from "./events";

/** How far ahead Ahead draws: 26 weeks, about six months. */
export const AHEAD_WEEKS = 26;
/** The counts line looks this far ahead: the weeks a leader can still act in. */
export const COUNT_WEEKS = 8;
/** A trainer with this many talks in one week has a pile: the week's heading says so. */
export const PILE_UP_TALKS = 3;

export interface AheadSpan {
  /** This week's Monday. */
  first: string;
  /** The last day drawn: a Sunday. */
  until: string;
  weeks: number;
}

export function aheadSpan(today: string, weeks: number = AHEAD_WEEKS): AheadSpan {
  const first = mondayOf(today);
  return { first, until: addDays(first, weeks * 7 - 1), weeks };
}

export interface AheadWeek {
  index: number;
  monday: string;
  sunday: string;
  events: AheadEvent[];
}

/** The events by week, from this week's Monday. Events outside the span are left out. */
export function weeksOf(events: readonly AheadEvent[], span: AheadSpan): AheadWeek[] {
  const weeks: AheadWeek[] = Array.from({ length: span.weeks }, (_, index) => {
    const monday = addDays(span.first, index * 7);
    return { index, monday, sunday: addDays(monday, 6), events: [] };
  });
  for (const e of events) {
    const index = Math.floor(daysBetween(span.first, e.day) / 7);
    if (index >= 0 && index < span.weeks) weeks[index].events.push(e);
  }
  return weeks;
}

export type RunItem =
  | { kind: "week"; week: AheadWeek }
  | { kind: "clear"; from: string; to: string; weeks: number };

export interface RunMonth {
  /** `YYYY-MM`, the month of the weeks' Mondays. */
  month: string;
  items: RunItem[];
  counts: GroupCounts;
}

/**
 * The weeks under their months, each run of empty weeks folded into one
 * clear line inside its month. This week (index 0) is never folded.
 */
export function runOf(weeks: readonly AheadWeek[]): RunMonth[] {
  const months: RunMonth[] = [];
  for (const week of weeks) {
    const month = monthOf(week.monday);
    let m = months[months.length - 1];
    if (!m || m.month !== month) {
      m = { month, items: [], counts: { talk: 0, date: 0, watch: 0, moment: 0 } };
      months.push(m);
    }
    addCounts(m.counts, groupCounts(week.events));
    if (week.events.length > 0 || week.index === 0) {
      m.items.push({ kind: "week", week });
      continue;
    }
    const last = m.items[m.items.length - 1];
    if (last && last.kind === "clear") {
      last.to = week.sunday;
      last.weeks += 1;
    } else {
      m.items.push({ kind: "clear", from: week.monday, to: week.sunday, weeks: 1 });
    }
  }
  return months;
}

/* ------------------------------------------------------------------ *
 * Counts
 * ------------------------------------------------------------------ */

export type GroupCounts = Record<AheadGroup, number>;

export function groupCounts(events: readonly AheadEvent[]): GroupCounts {
  const c: GroupCounts = { talk: 0, date: 0, watch: 0, moment: 0 };
  for (const e of events) c[KIND_GROUP[e.kind]] += 1;
  return c;
}

function addCounts(into: GroupCounts, more: GroupCounts): void {
  for (const k of Object.keys(more) as AheadGroup[]) into[k] += more[k];
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "3 talks · 2 renewal dates · 1 to watch · 1 moment"; the empty string for nothing. */
export function countsWords(c: GroupCounts): string {
  return [
    c.talk ? plural(c.talk, "talk", "talks") : null,
    c.date ? plural(c.date, "renewal date", "renewal dates") : null,
    c.watch ? `${c.watch} to watch` : null,
    c.moment ? plural(c.moment, "moment", "moments") : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

export interface HeadlineCounts {
  talks: number;
  charges: number;
  runsOut: number;
  maySlip: number;
  moments: number;
}

/**
 * The counts line: clients, not events, with something of each kind in the
 * next eight weeks. A client counts once per kind.
 */
export function headlineCounts(clients: readonly AheadClient[], span: AheadSpan, weeks: number = COUNT_WEEKS): HeadlineCounts {
  const until = addDays(span.first, weeks * 7 - 1);
  const has = (c: AheadClient, kinds: readonly string[]) => c.events.some((e) => e.day <= until && kinds.includes(e.kind));
  const n = (kinds: readonly string[]) => clients.filter((c) => has(c, kinds)).length;
  return {
    talks: n(["talk-now", "talk"]),
    charges: n(["charge-window"]),
    runsOut: n(["runs-out"]),
    maySlip: n(["may-slip"]),
    moments: n(["birthday", "anniversary"]),
  };
}

/**
 * The trainers with a pile of talks in these events: three or more of their
 * clients' talks in one week. A count of work, for the leader who can start
 * one early; never a ranking (only the pile is said, and never who has fewest).
 */
export function pileUps(
  events: readonly AheadEvent[],
  trainerOf: (clientId: string) => string | null,
  min: number = PILE_UP_TALKS,
): Array<{ trainerId: string; talks: number }> {
  const by = new Map<string, number>();
  for (const e of events) {
    if (KIND_GROUP[e.kind] !== "talk") continue;
    const t = trainerOf(e.clientId);
    if (t) by.set(t, (by.get(t) ?? 0) + 1);
  }
  return Array.from(by, ([trainerId, talks]) => ({ trainerId, talks }))
    .filter((p) => p.talks >= min)
    .sort((a, b) => b.talks - a.talks || a.trainerId.localeCompare(b.trainerId));
}

/* ------------------------------------------------------------------ *
 * The strip: one small bar a week, tapped by month
 * ------------------------------------------------------------------ */

export interface StripWeek {
  index: number;
  monday: string;
  talk: number;
  date: number;
  watch: number;
}

export interface StripMonth {
  month: string;
  /** The first week index in the month, and how many weeks it spans. */
  first: number;
  weeks: number;
}

export function stripOf(weeks: readonly AheadWeek[]): { weeks: StripWeek[]; months: StripMonth[]; max: number } {
  const out: StripWeek[] = weeks.map((w) => {
    const c = groupCounts(w.events);
    return { index: w.index, monday: w.monday, talk: c.talk, date: c.date, watch: c.watch };
  });
  const months: StripMonth[] = [];
  for (const w of weeks) {
    const month = monthOf(w.monday);
    const last = months[months.length - 1];
    if (last && last.month === month) last.weeks += 1;
    else months.push({ month, first: w.index, weeks: 1 });
  }
  const max = Math.max(1, ...out.map((w) => w.talk + w.date + w.watch));
  return { weeks: out, months, max };
}

/* ------------------------------------------------------------------ *
 * Lenses
 * ------------------------------------------------------------------ */

export type AheadLens = "all" | "talks" | "charges" | "runs-out" | "may-slip" | "trial" | "moments";

const LENS_KINDS: Record<Exclude<AheadLens, "all" | "trial">, readonly string[]> = {
  talks: ["talk-now", "talk"],
  charges: ["charge-window", "charge"],
  "runs-out": ["runs-out"],
  "may-slip": ["may-slip"],
  moments: ["birthday", "anniversary"],
};

/** The lenses, in the order of the chips. `trialLabel` is the studio's shortest package's own name. */
export function aheadLenses(trialLabel: string | null): Array<{ id: AheadLens; label: string }> {
  return [
    { id: "all", label: "All" },
    { id: "talks", label: "Talks" },
    { id: "charges", label: "At a charge" },
    { id: "runs-out", label: "Runs out early" },
    { id: "may-slip", label: "May slip" },
    ...(trialLabel ? [{ id: "trial" as const, label: trialLabel }] : []),
    { id: "moments", label: "Moments" },
  ];
}

export function eventInLens(e: AheadEvent, c: AheadClient | undefined, lens: AheadLens): boolean {
  if (lens === "all") return true;
  if (lens === "trial") return Boolean(c?.onTrial) && KIND_GROUP[e.kind] !== "moment";
  return LENS_KINDS[lens].includes(e.kind);
}

export function clientInLens(c: AheadClient, lens: AheadLens): boolean {
  if (lens === "all") return true;
  if (lens === "trial") return c.onTrial;
  if (lens === "may-slip") return c.slipping || c.events.some((e) => e.kind === "may-slip");
  return c.events.some((e) => LENS_KINDS[lens].includes(e.kind));
}

/* ------------------------------------------------------------------ *
 * The Clients view's groups
 * ------------------------------------------------------------------ */

export interface ClientGroups {
  /** Talk now, inside the charge window, a line crossed within a week, or slipping today. */
  now: AheadClient[];
  /** Something to decide in the weeks drawn, soonest first. */
  coming: AheadClient[];
  /** Nothing to decide in the weeks drawn. */
  quiet: AheadClient[];
  /** The dates can't be placed: each with the reason. */
  cantPlace: AheadClient[];
}

const byFirstDay = (a: AheadClient, b: AheadClient) =>
  (a.firstDay ?? "9999").localeCompare(b.firstDay ?? "9999") || a.name.localeCompare(b.name);

export function clientGroups(clients: readonly AheadClient[]): ClientGroups {
  const cantPlace = clients.filter((c) => c.cantPlace !== null).sort((a, b) => a.name.localeCompare(b.name));
  const placed = clients.filter((c) => c.cantPlace === null);
  return {
    now: placed.filter((c) => c.needsNow).sort(byFirstDay),
    coming: placed.filter((c) => !c.needsNow && c.firstDay !== null).sort(byFirstDay),
    quiet: placed.filter((c) => !c.needsNow && c.firstDay === null).sort((a, b) => a.name.localeCompare(b.name)),
    cantPlace,
  };
}
