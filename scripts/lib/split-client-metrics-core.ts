/**
 * The work of scripts/split-client-metrics.ts, apart from the connection so a
 * test can drive it against a fake database (src/features/machine-totals/
 * split-run.test.ts). Read the script's header first.
 *
 * Per client, in a transaction with up to `chunk` others: read the client and
 * its totals document, plan the move with the app's own rule (planClientSplit:
 * the merge every reader already uses, so nothing a screen shows changes),
 * then write the totals document's three fields whole and delete them from
 * the client. A client already moved has nothing to plan and is skipped,
 * which is what makes a second run, or a run after an interrupted one, safe.
 */
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import {
  MACHINE_TOTALS_FIELDS,
  machineTotalsPath,
  planClientSplit,
  splitWritesOf,
} from "../../src/features/machine-totals/totals.ts";
import { DEFAULT_TIME_ZONE, isValidTimeZone, studioDateKey, studioTodayKey } from "../../src/lib/studio-time.ts";

export interface SplitRunOptions {
  db: Firestore;
  /** Write. Without it nothing is written: the run reads and reports. */
  commit: boolean;
  /** One studio's home clients; all clients when absent. */
  studioId?: string | null;
  /** Stop after this many clients that needed moving (a gradual run). */
  limit?: number | null;
  /** Clients per transaction. */
  chunk?: number;
  log?: (line: string) => void;
  now?: Date;
  /**
   * Called after each committed transaction with what its clients held
   * before (the three fields and lastSessionDate, and the totals document
   * as it was): the script writes them to backups/, a restore point beside
   * PITR. Never called on a dry run.
   */
  record?: (moved: SplitRecord[]) => void;
}

/** One moved client, as it was before the move. */
export interface SplitRecord {
  clientId: string;
  /** The client's fields the move deletes or changes, as they were. */
  client: Record<string, unknown>;
  /** The totals document as it was (null: there was none). */
  totals: Record<string, unknown> | null;
}

export interface SplitRunSummary {
  scanned: number;
  /** Clients that still held at least one of the fields. */
  toMove: number;
  /** Of those, moved by this run (0 on a dry run). */
  moved: number;
  /** Clients that already had a totals document the app wrote (merged, never overwritten). */
  hadTotalsDoc: number;
  /** Clients whose lastSessionDate moves forward to their last machine day. */
  lastSessionMoved: number;
  /** Bytes of the three fields (as JSON) leaving the client documents. */
  bytesMoved: number;
  /** Clients whose transaction failed (left as they were; run again). */
  failed: number;
}

const DEFAULT_CHUNK = 20;

function jsonBytes(value: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(value) ?? "", "utf8");
  } catch {
    return 0;
  }
}

export async function runClientSplit(options: SplitRunOptions): Promise<SplitRunSummary> {
  const { db, commit } = options;
  const log = options.log ?? ((line: string) => console.log(line));
  const now = options.now ?? new Date();
  const chunk = Math.max(1, Math.min(options.chunk ?? DEFAULT_CHUNK, 200));
  const summary: SplitRunSummary = { scanned: 0, toMove: 0, moved: 0, hadTotalsDoc: 0, lastSessionMoved: 0, bytesMoved: 0, failed: 0 };

  // Each studio's own day (all four are Eastern today; a new one may not be).
  const zones = new Map<string, string>();
  for (const s of (await db.collection("studios").select("timezone").get()).docs) {
    const tz = s.get("timezone");
    zones.set(s.id, isValidTimeZone(tz) ? tz : DEFAULT_TIME_ZONE);
  }
  const zoneOf = (data: Record<string, unknown>) => zones.get(String(data.homeStudioId ?? "")) ?? DEFAULT_TIME_ZONE;

  // Who still holds a field. Streamed, and only ids kept, so a company of any
  // size fits in memory; each client is read again inside its transaction.
  const base = db.collection("clients");
  const query = (options.studioId ? base.where("homeStudioId", "==", options.studioId) : base).select(
    "homeStudioId",
    ...MACHINE_TOTALS_FIELDS,
  );
  const ids: string[] = [];
  for await (const d of query.stream() as AsyncIterable<{ id: string; data: () => Record<string, unknown> }>) {
    summary.scanned += 1;
    const data = d.data() ?? {};
    if (MACHINE_TOTALS_FIELDS.some((f) => data[f] !== undefined)) ids.push(d.id);
    if (options.limit && ids.length >= options.limit) break;
  }
  summary.toMove = ids.length;
  log(`${summary.scanned} client${summary.scanned === 1 ? "" : "s"} read; ${ids.length} still hold the machine maps${options.limit ? ` (stopped at --limit ${options.limit})` : ""}.`);

  const ops = { delete: () => FieldValue.delete(), serverTimestamp: () => FieldValue.serverTimestamp() };

  for (let at = 0; at < ids.length; at += chunk) {
    const part = ids.slice(at, at + chunk);
    const clientRefs = part.map((id) => db.collection("clients").doc(id));
    const totalsRefs = part.map((id) => db.doc(machineTotalsPath(id).join("/")));
    const tally = { moved: 0, hadTotalsDoc: 0, lastSessionMoved: 0, bytesMoved: 0 };
    let records: SplitRecord[] = [];
    const work = async (read: (refs: unknown[]) => Promise<Array<{ exists: boolean; data: () => Record<string, unknown> | undefined }>>, write: ((p: { clientRef: unknown; totalsRef: unknown; w: ReturnType<typeof splitWritesOf> }) => void) | null) => {
      tally.moved = 0;
      tally.hadTotalsDoc = 0;
      tally.lastSessionMoved = 0;
      tally.bytesMoved = 0;
      records = [];
      const snaps = await read([...clientRefs, ...totalsRefs]);
      part.forEach((_, i) => {
        const c = snaps[i];
        const t = snaps[part.length + i];
        if (!c?.exists) return;
        const clientData = c.data() ?? {};
        const totalsData = t?.exists ? t.data() ?? {} : null;
        const tz = zoneOf(clientData);
        const plan = planClientSplit(clientData, totalsData, {
          dayOf: (v) => studioDateKey(v as never, tz),
          today: studioTodayKey(now, tz),
        });
        if (plan.done) return;
        const w = splitWritesOf(plan, ops);
        tally.moved += 1;
        if (totalsData) tally.hadTotalsDoc += 1;
        if (plan.lastSessionDate) tally.lastSessionMoved += 1;
        for (const f of plan.clientDeletes) tally.bytesMoved += jsonBytes(clientData[f]);
        if (write) {
          const before: Record<string, unknown> = {};
          for (const f of [...plan.clientDeletes, "lastSessionDate"]) if (clientData[f] !== undefined) before[f] = clientData[f];
          records.push({ clientId: part[i], client: before, totals: totalsData });
        }
        write?.({ clientRef: clientRefs[i], totalsRef: totalsRefs[i], w });
      });
    };

    try {
      if (commit) {
        await db.runTransaction(async (tx) => {
          await work(
            (refs) => tx.getAll(...(refs as Parameters<typeof tx.getAll>)) as never,
            ({ clientRef, totalsRef, w }) => {
              if (!w.totals || !w.client) return;
              tx.set(totalsRef as never, w.totals.data, { mergeFields: w.totals.mergeFields });
              tx.update(clientRef as never, w.client);
            },
          );
        });
        // What this transaction's clients held, now that it has committed.
        if (records.length > 0) options.record?.(records);
      } else {
        await work((refs) => db.getAll(...(refs as Parameters<typeof db.getAll>)) as never, null);
      }
      summary.moved += commit ? tally.moved : 0;
      summary.hadTotalsDoc += tally.hadTotalsDoc;
      summary.lastSessionMoved += tally.lastSessionMoved;
      summary.bytesMoved += tally.bytesMoved;
    } catch (err) {
      summary.failed += part.length;
      log(`  clients ${at + 1}-${at + part.length}: ${commit ? "not moved" : "not read"} (${(err as Error)?.message ?? err}). Run again: moved clients are skipped.`);
    }
    if ((at / chunk) % 10 === 9) log(`  ${Math.min(at + chunk, ids.length)} / ${ids.length}`);
  }
  return summary;
}

/** The summary in plain words, with the per-open saving it implies. */
export function splitSummaryLines(s: SplitRunSummary, commit: boolean): string[] {
  const kb = (b: number) => `${Math.round(b / 1024).toLocaleString("en-US")} KB`;
  const per = s.toMove > 0 ? s.bytesMoved / s.toMove : 0;
  return [
    `${commit ? "Moved" : "Would move"}: ${commit ? s.moved : s.toMove} of ${s.scanned} clients (${kb(s.bytesMoved)} of machine maps as JSON, about ${kb(per)} a client).`,
    `Already had a totals document the app wrote (merged, newer values kept): ${s.hadTotalsDoc}.`,
    `lastSessionDate moved forward to the last machine day (the Directory's "Last in"): ${s.lastSessionMoved}.`,
    s.failed > 0 ? `Failed and left as they were: ${s.failed}. Run again; moved clients are skipped.` : "No failures.",
  ];
}
