/**
 * The weekly machine-trends job. Render runs it through
 * server/cron-machine-trends.ts; scripts/run-machine-trends.ts runs the same
 * code from the PC (dry run by default).
 *
 * It REPLACES the nightly leaderboard job (server/leaderboard-cron.ts, removed
 * in the cost round, Sep 2026). That job read every exercise log ever written,
 * every night, to rank clients by load — and nothing in the app read the
 * result any more. This one answers the question AJ actually asked: how is a
 * MACHINE used across every client, and which settings do clients like this
 * one tend to use.
 *
 * FIXED WINDOW. Only sets from the last WINDOW_DAYS (default 90) are read,
 * with one range query on exerciseLogs.createdAt, so the cost stays flat as
 * history grows. Old sets do not change; nothing is lost by not re-reading
 * them. The aggregation itself is src/features/machine-trends/trends.ts.
 *
 * WHAT IT WRITES. One document per machine at machineTrends/{machineId}, plus
 * machineTrends/_summary listing them, so a screen lists every machine with
 * one read and opens one machine with one more. Per-client rows are never
 * written — see the trends module's header for why.
 *
 * READS PER RUN: active clients + logs in the window + 0 sessions. Machines
 * are not read at all: the machine ids come from the logs.
 *
 * NOTHING HERE CONTACTS ANYONE.
 */

import { Timestamp, type Firestore, type WriteBatch } from "firebase-admin/firestore";
import {
  DEFAULT_WINDOW_DAYS,
  buildMachineTrends,
  type MachineTrend,
  type TrendClientInput,
  type TrendLogInput,
} from "../src/features/machine-trends/trends.ts";

const DAY_MS = 86_400_000;
const BATCH_LIMIT = 400;

export interface MachineTrendsRunOptions {
  db: Firestore;
  /** Compute everything, write nothing. */
  dryRun?: boolean;
  /** Days of sets to read. Default DEFAULT_WINDOW_DAYS. */
  windowDays?: number;
  now?: Date;
  log?: (line: string) => void;
}

export interface MachineTrendsRunSummary {
  windowDays: number;
  windowStart: string;
  windowEnd: string;
  clientsRead: number;
  logsRead: number;
  droppedSets: number;
  machinesWritten: number;
  /** Machines that had a trends document last time but no sets this window; their documents are deleted. */
  machinesRetired: number;
}

/** What machineTrends/{machineId} holds. */
export interface MachineTrendDocument extends MachineTrend {
  windowDays: number;
  /** YYYY-MM-DD, UTC days: the window is a rolling count of days, not studio days. */
  windowStart: string;
  windowEnd: string;
  computedAt: string;
}

export interface MachineTrendsSummaryDocument {
  windowDays: number;
  windowStart: string;
  windowEnd: string;
  computedAt: string;
  /** machineId → clients · sets, so a list screen needs no per-machine read. */
  machines: Record<string, { clients: number; sets: number; sessions: number }>;
}

async function commitInBatches(db: Firestore, writes: Array<(batch: WriteBatch) => void>) {
  for (let i = 0; i < writes.length; i += BATCH_LIMIT) {
    const batch = db.batch();
    writes.slice(i, i + BATCH_LIMIT).forEach((w) => w(batch));
    await batch.commit();
  }
}

export async function runMachineTrends(options: MachineTrendsRunOptions): Promise<MachineTrendsRunSummary> {
  const { db } = options;
  const log = options.log ?? ((line: string) => console.log(`[machine-trends] ${line}`));
  const now = options.now ?? new Date();
  const dryRun = Boolean(options.dryRun);
  const windowDays =
    Number.isFinite(options.windowDays) && (options.windowDays as number) > 0
      ? Math.floor(options.windowDays as number)
      : DEFAULT_WINDOW_DAYS;

  const since = new Date(now.getTime() - windowDays * DAY_MS);
  const windowStart = since.toISOString().slice(0, 10);
  const windowEnd = now.toISOString().slice(0, 10);
  log(`Window: ${windowStart} → ${windowEnd} (${windowDays} days)${dryRun ? " — DRY RUN" : ""}.`);

  // 1. Active clients: height and home studio are what the breakdowns need.
  const clientsSnap = await db.collection("clients").where("isActive", "==", true).get();
  const clients = new Map<string, TrendClientInput>();
  clientsSnap.docs.forEach((d) => {
    const c = d.data() as Record<string, unknown>;
    clients.set(d.id, {
      id: d.id,
      height: typeof c.height === "string" ? c.height : null,
      homeStudioId: typeof c.homeStudioId === "string" ? c.homeStudioId : null,
      isActive: true,
    });
  });
  log(`${clients.size} active clients.`);

  // 2. The window's sets, oldest first, so the LAST settings snapshot per client is the current one.
  //    createdAt is a Timestamp on every writer but one (LogPastSessionDialog wrote an ISO string until
  //    this round); a string never matches a Timestamp range, so those old rows are simply outside the window.
  const logsSnap = await db
    .collection("exerciseLogs")
    .where("createdAt", ">=", Timestamp.fromDate(since))
    .orderBy("createdAt", "asc")
    .get();
  const logs: TrendLogInput[] = logsSnap.docs.map((d) => d.data() as TrendLogInput);
  log(`${logs.length} exercise logs in the window.`);

  // 3. Aggregate — pure, tested.
  const { machines, droppedSets } = buildMachineTrends(logs, clients);
  const machineIds = Object.keys(machines).sort();
  log(`${machineIds.length} machines with performed sets; ${droppedSets} sets dropped (no client, machine or load).`);

  // 4. Retire documents for machines that had no sets this window, so a stale
  //    trend never outlives its window. One list read of the small collection.
  const existingSnap = await db.collection("machineTrends").select().get();
  const retire = existingSnap.docs.map((d) => d.id).filter((id) => id !== "_summary" && !machines[id]);

  const computedAt = now.toISOString();
  const summaryDoc: MachineTrendsSummaryDocument = {
    windowDays,
    windowStart,
    windowEnd,
    computedAt,
    machines: Object.fromEntries(
      machineIds.map((id) => [id, { clients: machines[id].clients, sets: machines[id].sets, sessions: machines[id].sessions }]),
    ),
  };

  const writes: Array<(batch: WriteBatch) => void> = [];
  for (const id of machineIds) {
    const doc: MachineTrendDocument = { ...machines[id], windowDays, windowStart, windowEnd, computedAt };
    writes.push((batch) => batch.set(db.collection("machineTrends").doc(id), doc));
  }
  for (const id of retire) {
    writes.push((batch) => batch.delete(db.collection("machineTrends").doc(id)));
  }
  writes.push((batch) => batch.set(db.collection("machineTrends").doc("_summary"), summaryDoc));

  if (!dryRun) await commitInBatches(db, writes);

  for (const id of machineIds.slice(0, 12)) {
    const m = machines[id];
    const settingKeys = Object.keys(m.settings);
    log(
      `  ${id}: ${m.clients} clients, ${m.sets} sets` +
        (m.load ? `, median best ${m.load.median} lb` : `, median withheld (under the minimum sample)`) +
        (settingKeys.length ? `, settings: ${settingKeys.join(", ")}` : ""),
    );
  }
  if (machineIds.length > 12) log(`  … and ${machineIds.length - 12} more.`);

  log(
    `Done${dryRun ? " (dry run — nothing written)" : ""}. ${machineIds.length} machine documents ${dryRun ? "would be" : ""} written, ` +
      `${retire.length} retired.`,
  );

  return {
    windowDays,
    windowStart,
    windowEnd,
    clientsRead: clients.size,
    logsRead: logs.length,
    droppedSets,
    machinesWritten: machineIds.length,
    machinesRetired: retire.length,
  };
}
