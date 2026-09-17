/**
 * Machine trends — the pure aggregation behind the weekly job
 * (server/machine-trends-job.ts). Nothing in here touches Firestore, so the
 * cron can bundle it and a screen can import it, and it is tested on plain
 * objects (trends.test.ts).
 *
 * WHAT IT ANSWERS. Not "who lifts the most" (the old leaderboard, which no
 * screen read) but questions about the MACHINE across every client who used
 * it in the window:
 *   · how many clients performed sets on it, and what their best loads look
 *     like as a distribution (min · p25 · median · p75 · max);
 *   · for each setting field (seat, chest pad, …) and each value of it, how
 *     many clients use that value — and, per value, how tall those clients
 *     are, so a screen can say "most clients around 5'7" use chest pad 6";
 *   · the same distribution per studio, so a leader sees their own floor.
 *
 * WHAT IT DELIBERATELY DOES NOT STORE. Per-client rows. A machineTrends
 * document is readable by any signed-in trainer, and clients are studio-
 * scoped; a client's own best on a machine is already on their record
 * (client.machineStats), which is what a screen uses for "you vs everyone".
 *
 * SENTENCES, NOT SCORES. Every median is null below MIN_CLIENTS distinct
 * clients, and the counts are always stored, so a screen can always say
 * "not enough data yet" instead of quoting a number built on two people.
 */

import { isPerformedLog, type OutcomeLog } from "../../lib/set-outcome.ts";

/** Named minimum sample: a median is only written when this many DISTINCT clients contributed. */
export const MIN_CLIENTS = 5;

/** The window the job reads. Old sets don't change; a rolling window keeps the cost flat as history grows. */
export const DEFAULT_WINDOW_DAYS = 90;

/** Setting values longer than this are almost certainly free text (a note), not a position. */
const MAX_VALUE_KEY_LENGTH = 40;

export interface TrendLogInput extends OutcomeLog {
  clientId?: string | null;
  machineId?: string | null;
  sessionId?: string | null;
  weight?: string | number | null;
  machineSettings?: Record<string, unknown> | null;
}

export interface TrendClientInput {
  id: string;
  height?: string | null;
  homeStudioId?: string | null;
  isActive?: boolean | null;
}

export interface Distribution {
  min: number;
  p25: number;
  median: number;
  p75: number;
  max: number;
  avg: number;
}

export interface SettingValueTrend {
  /** Distinct clients whose LATEST setting snapshot in the window used this value. */
  clients: number;
  /** Performed sets logged with this value. */
  sets: number;
  /** Median of those clients' best loads, or null below MIN_CLIENTS. */
  medianBest: number | null;
  /** Height in whole inches → number of clients at that height using this value. Clients with no parseable height are left out. */
  byHeight: Record<string, number>;
}

export interface StudioTrend {
  clients: number;
  sets: number;
  medianBest: number | null;
}

export interface MachineTrend {
  machineId: string;
  /** Distinct clients with at least one performed set in the window. */
  clients: number;
  /** Performed sets in the window. */
  sets: number;
  /** Distinct sessions those sets came from. */
  sessions: number;
  /** Distribution of each client's best load, or null below MIN_CLIENTS. */
  load: Distribution | null;
  /** settingKey → value → trend. Keys and values are normalised (see normalizeSettingKey / normalizeSettingValue). */
  settings: Record<string, Record<string, SettingValueTrend>>;
  /** Height in whole inches → { clients, medianBest }. */
  byHeight: Record<string, StudioTrend>;
  /** Client home studio → trend. Clients with no home studio are counted under "unknown". */
  studios: Record<string, StudioTrend>;
}

export interface MachineTrendsResult {
  machines: Record<string, MachineTrend>;
  /** Sets that were performed but could not be placed: no client, no machine, or an unparseable load. */
  droppedSets: number;
}

/**
 * "5'10\"" → 70. Also accepts 5' 10, 5'10, 5 ft 10, 70 (bare inches, the same
 * fallback AppContent's edit form uses), 5'10.5" → 70 (whole inches).
 * Anything else — "", "tall", "180cm" — is null; the client is simply left out
 * of the height breakdowns, never bucketed wrongly.
 */
export function parseHeightInches(height: string | null | undefined): number | null {
  if (typeof height !== "string") return null;
  const text = height.trim().toLowerCase();
  if (!text) return null;

  const feetInches = text.match(/^(\d{1,2})\s*(?:'|ft|feet)\s*(\d{1,2}(?:\.\d+)?)?\s*(?:"|in|inches)?$/);
  if (feetInches) {
    const feet = Number(feetInches[1]);
    const inches = feetInches[2] ? Number(feetInches[2]) : 0;
    if (feet < 3 || feet > 8 || inches >= 12) return null;
    return Math.round(feet * 12 + inches);
  }

  const bare = text.match(/^(\d{2,3})(?:\.\d+)?\s*(?:"|in|inches)?$/);
  if (bare) {
    const inches = Number(bare[1]);
    if (inches < 36 || inches > 96) return null;
    return inches;
  }

  return null;
}

/**
 * Setting keys arrive two ways: the old app-wide machine list keyed them by
 * label ("Seat", "Chest Pad") and the newer machine model by slug
 * ("chest-pad"). Both become "chest-pad" so one machine's snapshots are
 * counted together. Also a safe Firestore map key.
 */
export function normalizeSettingKey(key: string): string {
  return key
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_VALUE_KEY_LENGTH);
}

/**
 * "6", " 6 ", "Seat 6" → "6"; "6.5" → "6.5"; "B" → "b". A value that is just
 * the field's own name plus a number keeps the number, so "Seat 6" under the
 * key "seat" counts with "6". Empty, "-" or over-long values are null and
 * are not counted as a position.
 */
export function normalizeSettingValue(value: unknown, key?: string): string | null {
  if (value == null) return null;
  let text = String(value).trim().toLowerCase().replace(/\s+/g, " ");
  if (!text || text === "-" || text === "—" || text === "n/a" || text === "none") return null;
  if (key) {
    const label = key.trim().toLowerCase();
    if (label && text.startsWith(label + " ")) text = text.slice(label.length + 1).trim();
  }
  text = text.replace(/[^a-z0-9.\- ]+/g, "").trim().replace(/ /g, "_");
  // A number is ONE value however it was typed: "2.", "2.0" and "02" are 2,
  // "3.50" is 3.5. Left as typed they were different values to every count —
  // and "2." became "2_", which is not a number at all (machine fit, Sep 17).
  if (/^-?(?:\d+\.?\d*|\.\d+)$/.test(text)) {
    const n = Number(text);
    if (Number.isFinite(n)) text = String(n);
  }
  if (!text || text.length > MAX_VALUE_KEY_LENGTH) return null;
  // Firestore map keys: "." is fine in a map literal, but keep keys plain anyway.
  return text.replace(/\./g, "_");
}

export function parseLoad(weight: unknown): number | null {
  if (weight == null || weight === "") return null;
  const n = typeof weight === "number" ? weight : parseFloat(String(weight));
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * p;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function distributionOf(values: number[]): Distribution | null {
  if (values.length < MIN_CLIENTS) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return {
    min: sorted[0],
    p25: round1(percentile(sorted, 0.25)),
    median: round1(percentile(sorted, 0.5)),
    p75: round1(percentile(sorted, 0.75)),
    max: sorted[sorted.length - 1],
    avg: round1(sorted.reduce((a, b) => a + b, 0) / sorted.length),
  };
}

export function medianOrNull(values: number[]): number | null {
  const d = distributionOf(values);
  return d ? d.median : null;
}

interface ClientOnMachine {
  best: number;
  sets: number;
  /** The most recent (by input order — the job passes logs oldest first) settings snapshot. */
  settings: Record<string, string>;
  heightIn: number | null;
  studioId: string;
}

/**
 * Build the trends from performed sets. `logs` should already be limited to the
 * window (the job's one range query) and ordered oldest → newest, so the last
 * settings snapshot seen per client is their current one.
 */
export function buildMachineTrends(
  logs: readonly TrendLogInput[],
  clients: ReadonlyMap<string, TrendClientInput>,
): MachineTrendsResult {
  const perMachine = new Map<string, Map<string, ClientOnMachine>>();
  const sessionsPerMachine = new Map<string, Set<string>>();
  const setValuesPerMachine = new Map<string, Map<string, Map<string, number>>>();
  let droppedSets = 0;

  for (const log of logs) {
    if (!isPerformedLog(log)) continue;
    const clientId = log.clientId ?? null;
    const machineId = log.machineId ?? null;
    const load = parseLoad(log.weight);
    if (!clientId || !machineId || load == null) {
      droppedSets += 1;
      continue;
    }

    let byClient = perMachine.get(machineId);
    if (!byClient) {
      byClient = new Map();
      perMachine.set(machineId, byClient);
    }
    const client = clients.get(clientId);
    let row = byClient.get(clientId);
    if (!row) {
      row = {
        best: 0,
        sets: 0,
        settings: {},
        heightIn: parseHeightInches(client?.height),
        studioId: client?.homeStudioId || "unknown",
      };
      byClient.set(clientId, row);
    }
    row.sets += 1;
    if (load > row.best) row.best = load;

    const snapshot = normalizeSnapshot(log.machineSettings);
    if (snapshot) row.settings = snapshot;

    if (log.sessionId) {
      let sessions = sessionsPerMachine.get(machineId);
      if (!sessions) {
        sessions = new Set();
        sessionsPerMachine.set(machineId, sessions);
      }
      sessions.add(log.sessionId);
    }

    if (snapshot) {
      let perKey = setValuesPerMachine.get(machineId);
      if (!perKey) {
        perKey = new Map();
        setValuesPerMachine.set(machineId, perKey);
      }
      for (const [key, value] of Object.entries(snapshot)) {
        let perValue = perKey.get(key);
        if (!perValue) {
          perValue = new Map();
          perKey.set(key, perValue);
        }
        perValue.set(value, (perValue.get(value) ?? 0) + 1);
      }
    }
  }

  const machines: Record<string, MachineTrend> = {};
  for (const [machineId, byClient] of perMachine) {
    const rows = [...byClient.values()];
    const bests = rows.map((r) => r.best);

    const settings: Record<string, Record<string, SettingValueTrend>> = {};
    const setCounts = setValuesPerMachine.get(machineId) ?? new Map<string, Map<string, number>>();
    const clientsByKeyValue = new Map<string, Map<string, ClientOnMachine[]>>();
    for (const row of rows) {
      for (const [key, value] of Object.entries(row.settings)) {
        let perValue = clientsByKeyValue.get(key);
        if (!perValue) {
          perValue = new Map();
          clientsByKeyValue.set(key, perValue);
        }
        const list = perValue.get(value) ?? [];
        list.push(row);
        perValue.set(value, list);
      }
    }
    for (const [key, perValue] of clientsByKeyValue) {
      const out: Record<string, SettingValueTrend> = {};
      for (const [value, list] of perValue) {
        const byHeight: Record<string, number> = {};
        for (const r of list) {
          if (r.heightIn == null) continue;
          const k = String(r.heightIn);
          byHeight[k] = (byHeight[k] ?? 0) + 1;
        }
        out[value] = {
          clients: list.length,
          sets: setCounts.get(key)?.get(value) ?? 0,
          medianBest: medianOrNull(list.map((r) => r.best)),
          byHeight,
        };
      }
      settings[key] = out;
    }

    const byHeight: Record<string, StudioTrend> = {};
    const heightGroups = new Map<number, ClientOnMachine[]>();
    for (const r of rows) {
      if (r.heightIn == null) continue;
      const list = heightGroups.get(r.heightIn) ?? [];
      list.push(r);
      heightGroups.set(r.heightIn, list);
    }
    for (const [inches, list] of heightGroups) {
      byHeight[String(inches)] = {
        clients: list.length,
        sets: list.reduce((a, r) => a + r.sets, 0),
        medianBest: medianOrNull(list.map((r) => r.best)),
      };
    }

    const studios: Record<string, StudioTrend> = {};
    const studioGroups = new Map<string, ClientOnMachine[]>();
    for (const r of rows) {
      const list = studioGroups.get(r.studioId) ?? [];
      list.push(r);
      studioGroups.set(r.studioId, list);
    }
    for (const [studioId, list] of studioGroups) {
      studios[studioId] = {
        clients: list.length,
        sets: list.reduce((a, r) => a + r.sets, 0),
        medianBest: medianOrNull(list.map((r) => r.best)),
      };
    }

    machines[machineId] = {
      machineId,
      clients: rows.length,
      sets: rows.reduce((a, r) => a + r.sets, 0),
      sessions: sessionsPerMachine.get(machineId)?.size ?? 0,
      load: distributionOf(bests),
      settings,
      byHeight,
      studios,
    };
  }

  return { machines, droppedSets };
}

/** A log's settings snapshot with every key and value normalised; null when nothing usable is in it. */
export function normalizeSnapshot(raw: Record<string, unknown> | null | undefined): Record<string, string> | null {
  if (!raw || typeof raw !== "object") return null;
  const out: Record<string, string> = {};
  for (const [rawKey, rawValue] of Object.entries(raw)) {
    const key = normalizeSettingKey(rawKey);
    if (!key) continue;
    const value = normalizeSettingValue(rawValue, rawKey);
    if (value == null) continue;
    out[key] = value;
  }
  return Object.keys(out).length ? out : null;
}
