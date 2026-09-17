/**
 * Rebuilds every studio's machine-fit index (studios/{s}/machineFit/{machineId})
 * from the record it is a copy of: clientMachineSettings, filed under each
 * client's home studio. scripts/rebuild-machine-fit.ts runs it from the PC.
 *
 * The planning is src/features/machine-fit/rebuild.ts (pure, tested). This
 * file only reads and writes.
 *
 * READS PER RUN: every client (two fields) + every clientMachineSettings
 * document + one list per studio. It is a maintenance run, not a screen —
 * once after deploying the round, and again whenever the index is in doubt.
 *
 * NOTHING HERE CONTACTS ANYONE.
 */

import { FieldValue, type Firestore, type WriteBatch } from "firebase-admin/firestore";
import { planRebuild, type SettingsDocInput } from "../src/features/machine-fit/rebuild.ts";

const BATCH_LIMIT = 200;

export interface FitRebuildOptions {
  db: Firestore;
  dryRun?: boolean;
  log?: (line: string) => void;
  now?: Date;
}

export interface FitRebuildSummary {
  clientsRead: number;
  settingsRead: number;
  studios: number;
  documentsWritten: number;
  documentsRemoved: number;
  rows: number;
  noStudio: number;
  empty: number;
}

function millisOf(value: unknown): number {
  if (!value) return 0;
  if (typeof value === "number") return value;
  if (typeof (value as { toMillis?: unknown }).toMillis === "function") return (value as { toMillis(): number }).toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

interface QueuedWrite {
  run: (batch: WriteBatch) => void;
  bytes: number;
}

/** A commit may carry 10 MiB; an index document for a big studio is tens of KB. Cut by size as well as count. */
const BATCH_BYTES = 4 * 1024 * 1024;

async function commitInBatches(db: Firestore, writes: QueuedWrite[]) {
  let batch = db.batch();
  let count = 0;
  let bytes = 0;
  for (const w of writes) {
    if (count > 0 && (count >= BATCH_LIMIT || bytes + w.bytes > BATCH_BYTES)) {
      await batch.commit();
      batch = db.batch();
      count = 0;
      bytes = 0;
    }
    w.run(batch);
    count += 1;
    bytes += w.bytes;
  }
  if (count > 0) await batch.commit();
}

export async function rebuildMachineFit(options: FitRebuildOptions): Promise<FitRebuildSummary> {
  const { db } = options;
  const dryRun = Boolean(options.dryRun);
  const log = options.log ?? ((line: string) => console.log(`[machine-fit] ${line}`));
  const now = options.now ?? new Date();

  const clientsSnap = await db.collection("clients").select("homeStudioId").get();
  const homeStudioOf = new Map<string, string | null>();
  clientsSnap.docs.forEach((d) => {
    const home = d.get("homeStudioId");
    homeStudioOf.set(d.id, typeof home === "string" && home ? home : null);
  });
  log(`${homeStudioOf.size} clients.`);

  const settingsSnap = await db
    .collection("clientMachineSettings")
    .select("clientId", "machineId", "settings", "sources", "fitAcks", "updatedAt")
    .get();
  const docs: SettingsDocInput[] = settingsSnap.docs.map((d) => {
    const data = d.data() as Record<string, unknown>;
    return {
      clientId: typeof data.clientId === "string" ? data.clientId : null,
      machineId: typeof data.machineId === "string" ? data.machineId : null,
      settings: (data.settings as Record<string, unknown>) ?? null,
      sources: (data.sources as SettingsDocInput["sources"]) ?? null,
      fitAcks: (data.fitAcks as SettingsDocInput["fitAcks"]) ?? null,
      updatedAtMs: millisOf(data.updatedAt),
    };
  });
  log(`${docs.length} saved machine set-ups.`);

  const plan = planRebuild(docs, homeStudioOf);
  log(
    `${plan.rows} rows across ${plan.studios.size} studios; ${plan.noStudio} skipped (client has no home studio), ` +
      `${plan.empty} skipped (nothing usable set).`,
  );

  const writes: QueuedWrite[] = [];
  let documentsWritten = 0;
  let documentsRemoved = 0;
  const rebuiltAt = now.toISOString();

  const studiosSnap = await db.collection("studios").select().get();
  const studioIds = new Set<string>([...studiosSnap.docs.map((d) => d.id), ...plan.studios.keys()]);

  for (const studioId of [...studioIds].sort()) {
    const machines = plan.studios.get(studioId) ?? new Map();
    const col = db.collection("studios").doc(studioId).collection("machineFit");
    const existing = await col.select().get();
    for (const d of existing.docs) {
      if (machines.has(d.id)) continue;
      documentsRemoved += 1;
      writes.push({ run: (batch) => batch.delete(d.ref), bytes: 0 });
    }
    let studioRows = 0;
    for (const [machineId, rows] of machines) {
      documentsWritten += 1;
      studioRows += Object.keys(rows).length;
      // Written WHOLE: this is the one writer allowed to replace every row.
      writes.push({
        run: (batch) =>
          batch.set(col.doc(machineId), { machineId, studioId, rows, rebuiltAt, updatedAt: FieldValue.serverTimestamp() }),
        bytes: JSON.stringify(rows).length,
      });
    }
    if (machines.size > 0 || existing.size > 0) {
      log(`  ${studioId}: ${machines.size} machines, ${studioRows} rows${existing.size ? ` (had ${existing.size} documents)` : ""}.`);
    }
  }

  if (!dryRun) await commitInBatches(db, writes);
  log(
    `Done${dryRun ? " (dry run — nothing written)" : ""}. ${documentsWritten} documents ${dryRun ? "would be " : ""}written, ` +
      `${documentsRemoved} removed.`,
  );

  return {
    clientsRead: homeStudioOf.size,
    settingsRead: docs.length,
    studios: plan.studios.size,
    documentsWritten,
    documentsRemoved,
    rows: plan.rows,
    noStudio: plan.noStudio,
    empty: plan.empty,
  };
}
