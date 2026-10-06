/**
 * A CLIENT'S MACHINE TOTALS, IN THEIR OWN DOCUMENT (the iPad round, Oct 6 2026).
 *
 * AJ, Oct 5 2026: "we really need our app to run fast on devices like ipads
 * even 10th generation ipads and ipad minis". The perf lab found the open's
 * biggest cost: every open streams the studio's whole roster, and 73% of a
 * client document was two maps the Hub and the Directory never draw:
 *
 *   currentMachineMetrics   the last performed set on each machine (about 6.8 KB)
 *   machineStats            each machine's lifetime rollup (about 3.4 KB)
 *
 * They now live beside the client, in ONE document per client:
 *
 *   clients/{clientId}/machineTotals/current
 *     currentMachineMetrics      { [machineId]: CurrentMachineMetric }
 *     machineStats               { [machineId]: ClientMachineStat }
 *     machineStatsBackfilledAt   the backfill's marker, which goes with machineStats
 *     updatedAt
 *
 * A subcollection of the client, like inbodyScans and sharedNotes: the rules
 * read the client document for who may see it, so moving a client between
 * studios moves this with her and nothing has to be copied; it is read by id
 * (one listener for the client on screen, `getAll` for the nightly and weekly
 * jobs), so no query and no index is asked for.
 *
 * BEFORE, DURING AND AFTER THE MIGRATION. The old fields stay on clients/{id}
 * until scripts/split-client-metrics.ts moves them, and iPads still on the old
 * version keep writing there until they load the new one. So every reader
 * folds the two together with `mergeMachineTotals`, the ONE rule, and the
 * migration writes exactly what that rule says (`planClientSplit`):
 *
 *   currentMachineMetrics   per machine, the later lastPerformedDate wins; an
 *                           unknown date on the new side (a serverTimestamp
 *                           still on its way) or a tie goes to the new side,
 *                           because that is where every new write lands.
 *   machineStats            per machine, timesPerformed is the SUM of the two
 *                           sides, the first* pair comes from the earlier
 *                           firstPerformedDate and the last* pair from the
 *                           later lastPerformedDate (a tie: the new side).
 *
 * Why a sum: nothing ever COPIES a count from one side to the other without
 * deleting it from the first in the same write. Before the migration the old
 * side holds the history and the new side counts what came since; the
 * migration moves the old count over and deletes it in one transaction; an
 * old iPad writing after that counts onto the (now empty) old side again. In
 * every case the two sides are disjoint, so their sum is the count. The whole-
 * history rebuilds (the profile's backfill, the console repair, the
 * duplicate-merge script) write the new side whole AND delete the old side
 * together, for the same reason.
 *
 * Pure: no Firestore here (store.ts writes, useMachineTotals.ts listens).
 */

import type { Client, ClientMachineStat, CurrentMachineMetric } from "../../types";

export const MACHINE_TOTALS_COLLECTION = "machineTotals";
export const MACHINE_TOTALS_DOC_ID = "current";

/** The fields that moved off clients/{id}. */
export const MACHINE_TOTALS_FIELDS = ["currentMachineMetrics", "machineStats", "machineStatsBackfilledAt"] as const;
export type MachineTotalsField = (typeof MACHINE_TOTALS_FIELDS)[number];

/** clients/{clientId}/machineTotals/current, as path segments. */
export function machineTotalsPath(clientId: string): [string, string, string, string] {
  return ["clients", clientId, MACHINE_TOTALS_COLLECTION, MACHINE_TOTALS_DOC_ID];
}

/** The document as stored. Every field is optional: a new client's starts empty. */
export interface MachineTotalsDoc {
  currentMachineMetrics?: Record<string, CurrentMachineMetric>;
  machineStats?: Record<string, ClientMachineStat>;
  machineStatsBackfilledAt?: unknown;
  updatedAt?: unknown;
}

/** The three fields as one side holds them (the client document's, or the totals document's). */
export type MachineTotalsFields = Pick<Client, "currentMachineMetrics" | "machineStats" | "machineStatsBackfilledAt">;

/* ------------------------------------------------------------------ *
 * Writes: which keys go where
 * ------------------------------------------------------------------ */

/** Whether an update key ("machineStats.m-leg-press.timesPerformed", "currentMachineMetrics", ...) belongs to the totals document. */
export function isMachineTotalsKey(key: string): boolean {
  return MACHINE_TOTALS_FIELDS.some((f) => key === f || key.startsWith(`${f}.`));
}

/**
 * Splits one dot-path update object (as the rollups build it for `updateDoc`)
 * into what stays on the client and what goes to the totals document.
 */
export function splitMachineTotalsUpdates(updates: Record<string, unknown>): {
  client: Record<string, unknown>;
  totals: Record<string, unknown>;
} {
  const client: Record<string, unknown> = {};
  const totals: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(updates)) {
    if (isMachineTotalsKey(key)) totals[key] = value;
    else client[key] = value;
  }
  return { client, totals };
}

/**
 * A dot-path update as a `set(..., { mergeFields })` write: the same effect as
 * `update()` (each listed path replaced, increments applied, nothing else
 * touched), except that it also CREATES the document when it is not there yet
 * — which `update()` refuses. `mergeFields` are the dot paths as given.
 */
export function mergeWriteOf(dotted: Record<string, unknown>): { data: Record<string, unknown>; mergeFields: string[] } {
  const data: Record<string, unknown> = {};
  const mergeFields: string[] = [];
  for (const [path, value] of Object.entries(dotted)) {
    const parts = path.split(".");
    let node = data;
    for (let i = 0; i < parts.length - 1; i += 1) {
      const next = node[parts[i]];
      // Only a map this function made is descended into; anything else there
      // (a path given twice, as a value and as a parent) is replaced.
      if (!next || typeof next !== "object" || Object.getPrototypeOf(next) !== Object.prototype) {
        node[parts[i]] = {};
      }
      node = node[parts[i]] as Record<string, unknown>;
    }
    node[parts[parts.length - 1]] = value;
    mergeFields.push(path);
  }
  return { data, mergeFields };
}

/* ------------------------------------------------------------------ *
 * Reads: the one merge rule
 * ------------------------------------------------------------------ */

/**
 * An instant as ms, from what a stored date can be: a Firestore Timestamp (or
 * its plain {seconds} form), a Date, an ISO string or a YYYY-MM-DD day (read
 * as noon UTC, so the day never slips). Null when there is nothing to read,
 * including a serverTimestamp the server has not answered yet.
 */
export function whenOf(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.getTime();
  if (typeof value === "string") {
    const day = /^\d{4}-\d{2}-\d{2}$/.test(value.trim()) ? `${value.trim()}T12:00:00.000Z` : value;
    const ms = Date.parse(day);
    return Number.isNaN(ms) ? null : ms;
  }
  if (typeof value === "object") {
    const v = value as { toMillis?: () => number; seconds?: unknown; _seconds?: unknown; nanoseconds?: unknown };
    if (typeof v.toMillis === "function") {
      try {
        const ms = v.toMillis();
        return Number.isFinite(ms) ? ms : null;
      } catch {
        return null;
      }
    }
    const seconds = typeof v.seconds === "number" ? v.seconds : typeof v._seconds === "number" ? v._seconds : null;
    if (seconds !== null) return seconds * 1000 + (typeof v.nanoseconds === "number" ? Math.floor(v.nanoseconds / 1e6) : 0);
  }
  return null;
}

/**
 * Which side's dated entry wins: "old" only when both dates are known and the
 * old one is strictly later. An unknown date on the new side is a write on its
 * way, so the new side wins it.
 */
function laterSide(oldDate: unknown, newDate: unknown): "old" | "new" {
  const o = whenOf(oldDate);
  const n = whenOf(newDate);
  if (n === null) return "new";
  if (o === null) return "new";
  return o > n ? "old" : "new";
}

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

function mergeMetrics(
  older: Record<string, CurrentMachineMetric> | undefined,
  newer: Record<string, CurrentMachineMetric> | undefined,
): Record<string, CurrentMachineMetric> | undefined {
  if (!isRecord(older)) return isRecord(newer) ? newer : undefined;
  if (!isRecord(newer)) return older;
  const out: Record<string, CurrentMachineMetric> = { ...older };
  for (const [machineId, metric] of Object.entries(newer)) {
    const old = older[machineId];
    if (!isRecord(old) || !isRecord(metric)) {
      if (metric !== undefined && metric !== null) out[machineId] = metric;
      continue;
    }
    out[machineId] = laterSide(old.lastPerformedDate, metric.lastPerformedDate) === "old" ? old : metric;
  }
  return out;
}

const dayOrNull = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

function mergeStat(old: ClientMachineStat, neu: ClientMachineStat): ClientMachineStat {
  const out: ClientMachineStat = {};
  const times = (Number(old.timesPerformed) || 0) + (Number(neu.timesPerformed) || 0);
  if (old.timesPerformed !== undefined || neu.timesPerformed !== undefined) out.timesPerformed = times;

  // First: the earlier dated first. A side with no first date never beats one with.
  const oFirst = dayOrNull(old.firstPerformedDate);
  const nFirst = dayOrNull(neu.firstPerformedDate);
  const firstFrom = oFirst && (!nFirst || oFirst < nFirst) ? old : nFirst ? neu : old.firstWeight !== undefined ? old : neu;
  if (firstFrom.firstPerformedDate !== undefined) out.firstPerformedDate = firstFrom.firstPerformedDate;
  if (firstFrom.firstWeight !== undefined) out.firstWeight = firstFrom.firstWeight;

  // Last: the later dated last; a tie, or no dates, goes to the new side when it has a weight.
  const oLast = dayOrNull(old.lastPerformedDate);
  const nLast = dayOrNull(neu.lastPerformedDate);
  const lastFrom = oLast && (!nLast || oLast > nLast) ? old : nLast ? neu : neu.lastWeight !== undefined ? neu : old;
  if (lastFrom.lastPerformedDate !== undefined) out.lastPerformedDate = lastFrom.lastPerformedDate;
  if (lastFrom.lastWeight !== undefined) out.lastWeight = lastFrom.lastWeight;
  return out;
}

function mergeStats(
  older: Record<string, ClientMachineStat> | undefined,
  newer: Record<string, ClientMachineStat> | undefined,
): Record<string, ClientMachineStat> | undefined {
  if (!isRecord(older)) return isRecord(newer) ? newer : undefined;
  if (!isRecord(newer)) return older;
  const out: Record<string, ClientMachineStat> = { ...older };
  for (const [machineId, stat] of Object.entries(newer)) {
    const old = older[machineId];
    if (!isRecord(stat)) continue;
    out[machineId] = isRecord(old) ? mergeStat(old, stat) : stat;
  }
  return out;
}

/** The three fields as one side holds them, and nothing else. */
export function machineTotalsFieldsOf(data: Partial<MachineTotalsFields> | Record<string, unknown> | null | undefined): MachineTotalsFields {
  const d = (data ?? {}) as Record<string, unknown>;
  const out: MachineTotalsFields = {};
  if (isRecord(d.currentMachineMetrics)) out.currentMachineMetrics = d.currentMachineMetrics as MachineTotalsFields["currentMachineMetrics"];
  if (isRecord(d.machineStats)) out.machineStats = d.machineStats as MachineTotalsFields["machineStats"];
  if (d.machineStatsBackfilledAt !== undefined && d.machineStatsBackfilledAt !== null) out.machineStatsBackfilledAt = d.machineStatsBackfilledAt;
  return out;
}

/**
 * THE rule: the client document's old fields folded with the totals
 * document's. Either side may be absent. Only fields at least one side has are
 * returned, so spreading the result over a client never adds an empty map.
 */
export function mergeMachineTotals(
  onClient: Partial<MachineTotalsFields> | Record<string, unknown> | null | undefined,
  inTotals: MachineTotalsDoc | Record<string, unknown> | null | undefined,
): MachineTotalsFields {
  const old = machineTotalsFieldsOf(onClient);
  const neu = machineTotalsFieldsOf(inTotals);
  const out: MachineTotalsFields = {};
  const metrics = mergeMetrics(old.currentMachineMetrics, neu.currentMachineMetrics);
  if (metrics) out.currentMachineMetrics = metrics;
  const stats = mergeStats(old.machineStats, neu.machineStats);
  if (stats) out.machineStats = stats;
  const marker = neu.machineStatsBackfilledAt ?? old.machineStatsBackfilledAt;
  if (marker !== undefined) out.machineStatsBackfilledAt = marker;
  return out;
}

/* ------------------------------------------------------------------ *
 * The client on screen
 * ------------------------------------------------------------------ */

/**
 * What is known about one client's totals document:
 *   loading   not answered yet (or only the iPad's cache, which had nothing)
 *   ready     it exists (from the server or the cache)
 *   missing   the server says there is none (not migrated, never written)
 *   failed    the read failed: unknown, never "none"
 */
export type MachineTotalsState = "loading" | "ready" | "missing" | "failed";

export interface MachineTotalsRead {
  state: MachineTotalsState;
  /** The document's data when it exists; kept through a later failure. */
  data: MachineTotalsDoc | null;
  /**
   * Whether `data` is the whole document: false while "loading" holds only
   * what this iPad wrote itself and the server has not answered (an offline
   * Finish creates the document locally with nothing but its own paths), and
   * kept through a failure. Absent means whole.
   */
  complete?: boolean;
}

const STATES = new WeakMap<object, { state: MachineTotalsState; held: boolean }>();

/**
 * The client with its totals folded in, and the totals' state remembered for
 * that object (machineTotalsStateOf). With no document, the client's own old
 * fields stand: before the migration that is the whole story.
 */
export function withMachineTotals<C extends object>(client: C, read: MachineTotalsRead): C {
  const merged = read.data ? ({ ...client, ...mergeMachineTotals(client as Record<string, unknown>, read.data) } as C) : ({ ...client } as C);
  STATES.set(merged, { state: read.state, held: read.state === "failed" && !!read.data && read.complete !== false });
  return merged;
}

/**
 * The state of the totals folded into this client object. "unmerged" for a
 * client that never went through `withMachineTotals` (a list row, a test):
 * its own fields are all it has, as before the split.
 */
export function machineTotalsStateOf(client: object | null | undefined): MachineTotalsState | "unmerged" {
  if (!client) return "loading";
  return STATES.get(client)?.state ?? "unmerged";
}

/**
 * Whether a screen may act on this client's totals as an answer (Start's
 * prefilled weights, the profile's backfill, Finish's first and last pairs):
 * the document arrived whole, or the server said there is none, or this is a
 * client the totals were never folded into. Loading is unknown, and so is a
 * failed read with nothing held; a failure that still holds a whole answer
 * from before (a listener error mid-session) is known, as it was a moment ago.
 */
export function machineTotalsKnown(client: object | null | undefined): boolean {
  if (client && STATES.get(client)?.held) return true;
  const s = machineTotalsStateOf(client);
  return s === "ready" || s === "missing" || s === "unmerged";
}

/* ------------------------------------------------------------------ *
 * The migration (scripts/split-client-metrics.ts) and the lab's --split
 * ------------------------------------------------------------------ */

export interface ClientSplitPlan {
  /** What the totals document should hold for the three fields (replacing them whole). */
  totals: MachineTotalsFields;
  /** The fields to delete from the client document. */
  clientDeletes: MachineTotalsField[];
  /**
   * The client's lastSessionDate moved forward to the last day a machine was
   * performed, when that day is later (or there is none): the Directory's
   * "Last in" read that day off currentMachineMetrics, which is leaving.
   */
  lastSessionDate: string | null;
  /** Nothing to do: the client holds none of the fields. */
  done: boolean;
}

/** The latest studio day any machine was performed on, from either map. */
export function latestMachineDay(
  totals: MachineTotalsFields,
  dayOf: (value: unknown) => string | null,
): string | null {
  let best: string | null = null;
  const consider = (day: string | null) => {
    if (day && /^\d{4}-\d{2}-\d{2}$/.test(day) && (!best || day > best)) best = day;
  };
  for (const m of Object.values(totals.currentMachineMetrics ?? {})) consider(m ? dayOf(m.lastPerformedDate) : null);
  for (const s of Object.values(totals.machineStats ?? {})) consider(s ? dayOrNull(s.lastPerformedDate) : null);
  return best;
}

/**
 * One client's move: what the totals document becomes (the merge rule over
 * the client's old fields and whatever the app already wrote there) and which
 * old fields come off the client. Run twice, the second plan is `done`.
 * `today` keeps a lastSessionDate from ever landing in the future.
 */
export function planClientSplit(
  clientData: Record<string, unknown>,
  totalsData: MachineTotalsDoc | Record<string, unknown> | null | undefined,
  options: { dayOf: (value: unknown) => string | null; today: string },
): ClientSplitPlan {
  const clientDeletes = MACHINE_TOTALS_FIELDS.filter((f) => clientData[f] !== undefined);
  const totals = mergeMachineTotals(clientData, totalsData);
  if (clientDeletes.length === 0) return { totals, clientDeletes, lastSessionDate: null, done: true };
  const machineDay = latestMachineDay(machineTotalsFieldsOf(clientData), options.dayOf);
  // Only ever forward: a lastSessionDate stored as a Timestamp or a Date is
  // read as its studio day, and one that can't be read is left alone.
  const raw = clientData.lastSessionDate;
  const present = raw !== undefined && raw !== null && raw !== "";
  const current = !present ? null : typeof raw === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : options.dayOf(raw);
  const lastSessionDate =
    machineDay && machineDay <= options.today && (!present || (current !== null && machineDay > current)) ? machineDay : null;
  return { totals, clientDeletes, lastSessionDate, done: false };
}

/**
 * A plan as the two writes the migration makes in one transaction: the totals
 * document's fields REPLACED whole by the merged ones (so the document ends
 * up exactly as the merge rule reads it), and the old fields deleted from the
 * client. `ops` are the SDK's sentinels (FieldValue.delete / serverTimestamp).
 */
export function splitWritesOf(
  plan: ClientSplitPlan,
  ops: { delete: () => unknown; serverTimestamp: () => unknown },
): {
  totals: { data: Record<string, unknown>; mergeFields: string[] } | null;
  client: Record<string, unknown> | null;
} {
  if (plan.done) return { totals: null, client: null };
  const data: Record<string, unknown> = {};
  for (const f of MACHINE_TOTALS_FIELDS) if (plan.totals[f] !== undefined) data[f] = plan.totals[f];
  data.updatedAt = ops.serverTimestamp();
  const client: Record<string, unknown> = {};
  for (const f of plan.clientDeletes) client[f] = ops.delete();
  if (plan.lastSessionDate) client.lastSessionDate = plan.lastSessionDate;
  return { totals: { data, mergeFields: Object.keys(data) }, client };
}
