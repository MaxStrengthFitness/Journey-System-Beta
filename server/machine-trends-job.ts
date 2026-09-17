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
 * MACHINE FIT (Sep 17 2026). The same run builds the company tier of machine
 * fit from every studio's machineFit index (src/features/machine-fit/
 * company.ts): an anonymous `fit` block on each machineTrends document — what
 * the Setup screen falls back on at a studio too new to speak for itself —
 * and the administrators-only Kaizen report at kaizenReports/{machineId}.
 * If that step fails, last week's blocks are carried over and the reports are
 * left as they were: a failed read is unknown, never empty.
 *
 * READS PER RUN: every client (the trends use the active ones; a past
 * client's settings are still evidence of how a body fits a machine) + logs
 * in the window + the small machineFit indexes + 0 sessions. Machines are not
 * read at all: the machine ids come from the logs and the indexes.
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
import { buildCompany, type CompanyBuild, type CompanyClientRecord } from "../src/features/machine-fit/company.ts";
import type { CompanyFitBlock } from "../src/features/machine-fit/fit-index.ts";
import { readStudioFitDocs } from "./machine-fit-company.ts";

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
  /** Machine fit: machines with a company block, the clients in them, and the Kaizen reports written. null when that step failed. */
  fit: { machines: number; clients: number; reports: number; rowsSkipped: number } | null;
}

/** What machineTrends/{machineId} holds. */
export interface MachineTrendDocument extends MachineTrend {
  /** Machine fit's company tier: anonymous height × gender cells. Absent until a studio has set-ups on this machine. */
  fit?: CompanyFitBlock;
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
  /** machineId → clients · sets, so a list screen needs no per-machine read. `fitClients` is the company fit block's count. */
  machines: Record<string, { clients: number; sets: number; sessions: number; fitClients?: number }>;
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

  // 1. Clients. The trends use the ACTIVE ones (height and home studio are what
  //    the breakdowns need) exactly as before. Machine fit uses everyone: a
  //    past client's seat is still evidence of where that build sits. Only
  //    the fields either step reads are fetched.
  const clientsSnap = await db
    .collection("clients")
    .select("isActive", "height", "homeStudioId", "gender", "wingspan", "weight", "dateOfBirth", "age", "inbodySummary", "machineStats")
    .get();
  const clients = new Map<string, TrendClientInput>();
  const fitClients: (CompanyClientRecord & { id: string })[] = [];
  clientsSnap.docs.forEach((d) => {
    const c = d.data() as Record<string, unknown>;
    const height = typeof c.height === "string" ? c.height : null;
    const homeStudioId = typeof c.homeStudioId === "string" ? c.homeStudioId : null;
    if (c.isActive === true) clients.set(d.id, { id: d.id, height, homeStudioId, isActive: true });
    fitClients.push({
      id: d.id,
      height,
      homeStudioId,
      gender: typeof c.gender === "string" ? c.gender : null,
      wingspan: typeof c.wingspan === "string" ? c.wingspan : null,
      weight: typeof c.weight === "string" || typeof c.weight === "number" ? c.weight : null,
      dateOfBirth: typeof c.dateOfBirth === "string" ? c.dateOfBirth : null,
      age: typeof c.age === "number" ? c.age : null,
      inbodySummary: (c.inbodySummary as CompanyClientRecord["inbodySummary"]) ?? null,
      machineStats: (c.machineStats as CompanyClientRecord["machineStats"]) ?? null,
    });
  });
  log(`${clients.size} active clients (${fitClients.length} on record).`);

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

  // 4. What is there now: the ids (to retire what has gone) and last week's
  //    fit blocks (to carry over if the fit step below fails). One list read
  //    of the small collection, as before.
  const existingSnap = await db.collection("machineTrends").select("fit").get();
  const previousFit: Record<string, CompanyFitBlock> = {};
  existingSnap.docs.forEach((d) => {
    const fit = d.get("fit") as CompanyFitBlock | undefined;
    if (fit && typeof fit === "object") previousFit[d.id] = fit;
  });

  // 5. Machine fit's company tier. Caught: the trends must not be lost to it.
  let company: CompanyBuild | null = null;
  try {
    company = buildCompany(await readStudioFitDocs(db, log), fitClients, now);
    const blockIds = Object.keys(company.blocks);
    log(
      `Machine fit: ${blockIds.length} machines, ` +
        `${blockIds.reduce((sum, id) => sum + company!.blocks[id].clients, 0)} client set-ups pooled` +
        (company.rowsSkipped ? `, ${company.rowsSkipped} rows skipped (client not at that studio)` : "") +
        `; ${Object.keys(company.reports).length} Kaizen reports.`,
    );
  } catch (err) {
    log(`Machine fit step FAILED — last week's blocks are kept, reports untouched. ${err instanceof Error ? err.message : String(err)}`);
  }
  const blocks: Record<string, CompanyFitBlock> = company ? company.blocks : previousFit;

  // A machine gets a document when it has sets in the window OR a fit block:
  // a machine everyone is set up on but nobody used this quarter still has
  // something to say to the Setup screen.
  const documentIds = [...new Set([...machineIds, ...Object.keys(blocks)])].sort();
  const retire = existingSnap.docs.map((d) => d.id).filter((id) => id !== "_summary" && !documentIds.includes(id));

  const computedAt = now.toISOString();
  const emptyTrend = (machineId: string): MachineTrend => ({
    machineId,
    clients: 0,
    sets: 0,
    sessions: 0,
    load: null,
    settings: {},
    byHeight: {},
    studios: {},
  });
  const summaryDoc: MachineTrendsSummaryDocument = {
    windowDays,
    windowStart,
    windowEnd,
    computedAt,
    machines: Object.fromEntries(
      documentIds.map((id) => {
        const m = machines[id] ?? emptyTrend(id);
        const entry: MachineTrendsSummaryDocument["machines"][string] = { clients: m.clients, sets: m.sets, sessions: m.sessions };
        if (blocks[id]) entry.fitClients = blocks[id].clients;
        return [id, entry];
      }),
    ),
  };

  const writes: Array<(batch: WriteBatch) => void> = [];
  for (const id of documentIds) {
    const doc: MachineTrendDocument = { ...(machines[id] ?? emptyTrend(id)), windowDays, windowStart, windowEnd, computedAt };
    if (blocks[id]) doc.fit = blocks[id];
    writes.push((batch) => batch.set(db.collection("machineTrends").doc(id), doc));
  }
  for (const id of retire) {
    writes.push((batch) => batch.delete(db.collection("machineTrends").doc(id)));
  }
  writes.push((batch) => batch.set(db.collection("machineTrends").doc("_summary"), summaryDoc));

  // 6. The Kaizen reports (administrators only). Replaced whole; a machine
  //    nobody is set up on any more loses its report. Skipped entirely when
  //    the fit step failed — an old report is better than none.
  let reportsRetired = 0;
  if (company) {
    const reportsSnap = await db.collection("kaizenReports").select().get();
    const reportIds = Object.keys(company.reports);
    for (const id of reportIds) {
      const report = company.reports[id];
      writes.push((batch) => batch.set(db.collection("kaizenReports").doc(id), report));
    }
    for (const d of reportsSnap.docs) {
      if (d.id === "_summary" || company.reports[d.id]) continue;
      reportsRetired += 1;
      writes.push((batch) => batch.delete(d.ref));
    }
    const kaizenSummary = company.summary;
    writes.push((batch) => batch.set(db.collection("kaizenReports").doc("_summary"), kaizenSummary));
  }

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
    `Done${dryRun ? " (dry run — nothing written)" : ""}. ${documentIds.length} machine documents ${dryRun ? "would be" : ""} written, ` +
      `${retire.length} retired` +
      (company ? `; ${Object.keys(company.reports).length} Kaizen reports, ${reportsRetired} retired.` : "."),
  );

  return {
    windowDays,
    windowStart,
    windowEnd,
    clientsRead: clients.size,
    logsRead: logs.length,
    droppedSets,
    machinesWritten: documentIds.length,
    machinesRetired: retire.length,
    fit: company
      ? {
          machines: Object.keys(company.blocks).length,
          clients: Object.values(company.blocks).reduce((sum, b) => sum + b.clients, 0),
          reports: Object.keys(company.reports).length,
          rowsSkipped: company.rowsSkipped,
        }
      : null,
  };
}
