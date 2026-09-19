/**
 * MACHINE TRENDS — what the screen says.
 *
 * Round: the Machine Trends screen, Sep 19 2026.
 *
 * The weekly job (`server/machine-trends-job.ts`) has written
 * `machineTrends/{machineId}` since the cost round in September, and until now
 * nothing displayed it. The screen it feeds is the one AJ asked for on the
 * project-history audit:
 *
 *   "there is still a form of the leaderboard, its when trainers can view
 *    machines and what clients are at for each setting, i would also like to
 *    see that clients performance or strength increases in relation to their
 *    settings comparatively to other clients"
 *
 * So: per machine, what people are set to, and what they lift at each setting.
 * Never who. `machineTrends/*` carries no client rows by design — it is
 * readable by any signed-in trainer and clients are studio-scoped — and this
 * module cannot invent them.
 *
 * WHY THIS IS A PURE MODULE
 * -------------------------
 * Every number on this screen is a claim about clients, and the house rule is
 * sentences, not scores: a claim below its named minimum sample must read
 * "not enough data yet" rather than a confident wrong number. That rule is
 * worth testing without a DOM, so the decision of what may be said lives here
 * and the component only draws it.
 *
 * THE THREE ANSWERS, AND WHY "UNKNOWN" IS NOT "EMPTY"
 * ---------------------------------------------------
 * A failed read and an absent document look identical to a careless screen,
 * and they mean opposite things: "we could not look" versus "nobody has
 * trained on this". `fetchMachineTrendRead` already distinguishes them, and
 * this module keeps the distinction all the way to the words on the page.
 */

import { MIN_CLIENTS, type Distribution, type MachineTrend } from "./trends";

/**
 * The document as it is READ. `MachineTrend` is the shape the job computes;
 * the job stamps four more fields onto it on the way out (`MachineTrendDocument`
 * in machine-trends-job.ts) and older documents may predate any of them, so
 * every one is optional here.
 */
export interface MachineTrendDoc extends MachineTrend {
  windowDays?: number;
  windowStart?: string;
  windowEnd?: string;
  computedAt?: string;
}

/** What `fetchMachineTrendRead` hands back. */
export interface TrendReadLike {
  trend: MachineTrendDoc | null;
  failed: boolean;
}

export interface SettingValueRow {
  /** The stored value, as the job normalised it ("6", "wide"). */
  value: string;
  /** Clients whose latest snapshot in the window used it. */
  clients: number;
  /** Performed sets logged with it. */
  sets: number;
  /** Median of those clients' best loads — null below MIN_CLIENTS, and then the row says so. */
  medianBest: number | null;
}

export interface SettingGroup {
  /** The normalised storage key ("chest-pad"). */
  key: string;
  /** "Chest pad" — what the row is labelled. */
  label: string;
  /** Clients accounted for across every value of this setting. */
  clients: number;
  /** Busiest value first; ties fall back to the value itself so the order is stable. */
  rows: SettingValueRow[];
}

export interface HeightRow {
  inches: number;
  /** 68 -> 5'8" */
  label: string;
  clients: number;
  medianBest: number | null;
}

export type MachineTrendsView =
  /** The read failed. Unknown is never empty. */
  | { kind: "unreadable" }
  /** The read succeeded and there is no document: nobody trained on this machine in the window. */
  | { kind: "none" }
  /** There is a document, but too few clients to say anything about loads. */
  | {
      kind: "thin";
      clients: number;
      sets: number;
      sessions: number;
      windowDays: number;
      asOf: string | null;
    }
  | {
      kind: "ready";
      clients: number;
      sets: number;
      sessions: number;
      windowDays: number;
      asOf: string | null;
      /** Null when the job could not say — below MIN_CLIENTS it writes null and so do we. */
      load: Distribution | null;
      settings: SettingGroup[];
      heights: HeightRow[];
    };

/** The window the job defaults to, for a document written before it stamped one. */
const ASSUMED_WINDOW_DAYS = 90;

/**
 * "chest-pad" -> "Chest pad". The job normalises keys to lower kebab-case, so
 * this is the whole of it: split, then capitalise the first word only. Not
 * title case — "Back pad" reads like a label, "Back Pad" reads like a heading.
 */
export function settingLabel(key: string): string {
  const words = key.split(/[-_\s]+/).filter(Boolean);
  if (words.length === 0) return key;
  const joined = words.join(" ");
  return joined.charAt(0).toUpperCase() + joined.slice(1);
}

/** 68 -> `5'8"`. Anything that is not a sane human height comes back as plain inches. */
export function heightLabel(inches: number): string {
  if (!Number.isFinite(inches) || inches < 12 || inches > 96) return `${inches}`;
  const feet = Math.floor(inches / 12);
  const rest = inches % 12;
  return `${feet}'${rest}"`;
}

function sortedSettingRows(values: Record<string, { clients: number; sets: number; medianBest: number | null }>): SettingValueRow[] {
  return Object.entries(values)
    .map(([value, v]) => ({
      value,
      clients: v.clients ?? 0,
      sets: v.sets ?? 0,
      medianBest: typeof v.medianBest === "number" ? v.medianBest : null,
    }))
    .sort((a, b) => (b.clients - a.clients) || a.value.localeCompare(b.value));
}

/**
 * Decide what this machine's page may say.
 *
 * `MIN_CLIENTS` is the gate for the load distribution, and it is the SAME
 * constant the job uses to decide whether to write one — so this is belt and
 * braces rather than a second opinion: a document from a future job that
 * loosened its own gate still cannot make this screen state a load for four
 * people.
 */
export function presentMachineTrends(read: TrendReadLike | null | undefined): MachineTrendsView {
  if (!read || read.failed) return { kind: "unreadable" };
  const doc = read.trend;
  if (!doc) return { kind: "none" };

  const clients = Number(doc.clients) || 0;
  const sets = Number(doc.sets) || 0;
  const sessions = Number(doc.sessions) || 0;
  const windowDays = Number(doc.windowDays) > 0 ? Number(doc.windowDays) : ASSUMED_WINDOW_DAYS;
  const asOf = typeof doc.computedAt === "string" && doc.computedAt ? doc.computedAt : null;

  // A document with no sets at all still exists when the machine has set-ups
  // recorded (the fit block keeps it alive). That is "nobody trained on it",
  // which is what "none" means to a reader, so say that rather than showing a
  // page of zeroes.
  if (sets === 0 && clients === 0) return { kind: "none" };

  if (clients < MIN_CLIENTS) {
    return { kind: "thin", clients, sets, sessions, windowDays, asOf };
  }

  const settings: SettingGroup[] = Object.entries(doc.settings ?? {})
    .map(([key, values]) => {
      const rows = sortedSettingRows(values ?? {});
      return {
        key,
        label: settingLabel(key),
        clients: rows.reduce((acc, r) => acc + r.clients, 0),
        rows,
      };
    })
    .filter((g) => g.rows.length > 0)
    .sort((a, b) => (b.clients - a.clients) || a.key.localeCompare(b.key));

  const heights: HeightRow[] = Object.entries(doc.byHeight ?? {})
    .map(([inches, v]) => ({
      inches: Number(inches),
      label: heightLabel(Number(inches)),
      clients: Number(v?.clients) || 0,
      medianBest: typeof v?.medianBest === "number" ? v.medianBest : null,
    }))
    .filter((h) => Number.isFinite(h.inches) && h.clients > 0)
    .sort((a, b) => a.inches - b.inches);

  return {
    kind: "ready",
    clients,
    sets,
    sessions,
    windowDays,
    asOf,
    load: doc.load ?? null,
    settings,
    heights,
  };
}

/**
 * The opening sentence. Plain studio English, no adjectives, and the window is
 * part of the claim — "12 clients" means nothing without "in the last 90 days".
 */
export function headlineFor(view: MachineTrendsView): string {
  switch (view.kind) {
    case "unreadable":
      return "This machine's usage could not be loaded.";
    case "none":
      return "Nobody has trained on this machine recently.";
    case "thin":
      return `${view.clients} ${view.clients === 1 ? "client has" : "clients have"} trained on this machine in the last ${view.windowDays} days — not enough to say anything about loads yet.`;
    case "ready":
      return `${view.clients} clients, ${view.sets} sets, ${view.sessions} sessions in the last ${view.windowDays} days.`;
  }
}

/**
 * The load sentence, or null when there is nothing honest to say. Quartiles
 * rather than an average alone: "half of them are between 90 and 150" is the
 * shape a trainer can use when they are standing at the stack.
 */
export function loadSentence(load: Distribution | null): string | null {
  if (!load) return null;
  const n = (x: number) => Math.round(x);
  return `Best loads run from ${n(load.min)} to ${n(load.max)} lb. Half of these clients are between ${n(load.p25)} and ${n(load.p75)}, and the middle one is at ${n(load.median)}.`;
}

/** What a medianBest cell says when the job withheld it. */
export const WITHHELD_LABEL = `fewer than ${MIN_CLIENTS}`;
