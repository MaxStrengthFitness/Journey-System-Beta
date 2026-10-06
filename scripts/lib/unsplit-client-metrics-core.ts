/**
 * The work of scripts/unsplit-client-metrics.ts (the way back from
 * scripts/split-client-metrics.ts), apart from the connection so a test can
 * drive it against a fake database (src/features/machine-totals/
 * unsplit-run.test.ts). Read the script's header first.
 *
 * Per client, in a transaction with up to `chunk` others: read the client and
 * its totals document. A client with no totals document has nothing to copy
 * back and is skipped. Otherwise the client's three fields are set to the
 * app's own merge of both sides (mergeMachineTotals: newer last sets kept,
 * counts ADDED), and the totals document is deleted in the same transaction.
 * Deleting it is what keeps the counts right: the merge sums
 * timesPerformed across the two sides, so copying back without the delete
 * would count every session twice. Run twice, the second run finds no totals
 * documents and copies nothing.
 */
import type { Firestore } from "firebase-admin/firestore";
import { MACHINE_TOTALS_FIELDS, machineTotalsPath, mergeMachineTotals } from "../../src/features/machine-totals/totals.ts";

export interface UnsplitRunOptions {
  db: Firestore;
  /** Write. Without it nothing is written: the run reads and reports. */
  commit: boolean;
  /** One studio's home clients; all clients when absent. */
  studioId?: string | null;
  /** Stop after this many clients that had a totals document. */
  limit?: number | null;
  /** Clients per transaction. */
  chunk?: number;
  log?: (line: string) => void;
  /**
   * Called after each committed transaction with what its clients held
   * before (the client's three fields and the totals document): the script
   * writes them to backups/. Never called on a dry run.
   */
  record?: (copied: UnsplitRecord[]) => void;
}

/** One client copied back, as it was before. */
export interface UnsplitRecord {
  clientId: string;
  /** The client's three fields as they were (absent ones left out). */
  client: Record<string, unknown>;
  /** The totals document as it was, deleted by the run. */
  totals: Record<string, unknown>;
}

export interface UnsplitRunSummary {
  /** Client documents read. */
  scanned: number;
  /** Clients that had a totals document (to copy back). */
  toCopy: number;
  /** Of those, copied back by this run (0 on a dry run). */
  copied: number;
  /** Clients whose transaction failed (left as they were; run again). */
  failed: number;
}

const DEFAULT_CHUNK = 20;

export async function runClientUnsplit(options: UnsplitRunOptions): Promise<UnsplitRunSummary> {
  const { db, commit } = options;
  const log = options.log ?? ((line: string) => console.log(line));
  const chunk = Math.max(1, Math.min(options.chunk ?? DEFAULT_CHUNK, 200));
  const summary: UnsplitRunSummary = { scanned: 0, toCopy: 0, copied: 0, failed: 0 };

  // Every client id (streamed, ids only); whether a totals document exists is
  // read by id in each chunk, so no collection-group query and no index.
  const base = db.collection("clients");
  const query = (options.studioId ? base.where("homeStudioId", "==", options.studioId) : base).select("homeStudioId");
  const ids: string[] = [];
  for await (const d of query.stream() as AsyncIterable<{ id: string }>) {
    summary.scanned += 1;
    ids.push(d.id);
  }
  log(`${summary.scanned} client${summary.scanned === 1 ? "" : "s"} read.`);

  for (let at = 0; at < ids.length; at += chunk) {
    if (options.limit && summary.toCopy >= options.limit) break;
    const part = ids.slice(at, at + chunk);
    const clientRefs = part.map((id) => db.collection("clients").doc(id));
    const totalsRefs = part.map((id) => db.doc(machineTotalsPath(id).join("/")));
    let found = 0;
    let records: UnsplitRecord[] = [];
    const room = () => (options.limit ? options.limit - summary.toCopy : Infinity);
    const work = async (
      read: (refs: unknown[]) => Promise<Array<{ exists: boolean; data: () => Record<string, unknown> | undefined }>>,
      write: ((p: { clientRef: unknown; totalsRef: unknown; fields: Record<string, unknown> }) => void) | null,
    ) => {
      found = 0;
      records = [];
      const snaps = await read([...clientRefs, ...totalsRefs]);
      const limitHere = room();
      part.forEach((id, i) => {
        if (found >= limitHere) return;
        const c = snaps[i];
        const t = snaps[part.length + i];
        if (!c?.exists || !t?.exists) return;
        const clientData = c.data() ?? {};
        const totalsData = t.data() ?? {};
        const merged = mergeMachineTotals(clientData, totalsData) as Record<string, unknown>;
        const fields: Record<string, unknown> = {};
        for (const f of MACHINE_TOTALS_FIELDS) if (merged[f] !== undefined) fields[f] = merged[f];
        found += 1;
        if (write) {
          const before: Record<string, unknown> = {};
          for (const f of MACHINE_TOTALS_FIELDS) if (clientData[f] !== undefined) before[f] = clientData[f];
          records.push({ clientId: id, client: before, totals: totalsData });
          write({ clientRef: clientRefs[i], totalsRef: totalsRefs[i], fields });
        }
      });
    };

    try {
      if (commit) {
        await db.runTransaction(async (tx) => {
          await work(
            (refs) => tx.getAll(...(refs as Parameters<typeof tx.getAll>)) as never,
            ({ clientRef, totalsRef, fields }) => {
              if (Object.keys(fields).length > 0) tx.update(clientRef as never, fields);
              tx.delete(totalsRef as never);
            },
          );
        });
        if (records.length > 0) options.record?.(records);
        summary.copied += found;
      } else {
        await work((refs) => db.getAll(...(refs as Parameters<typeof db.getAll>)) as never, null);
      }
      summary.toCopy += found;
    } catch (err) {
      summary.failed += part.length;
      log(`  clients ${at + 1}-${at + part.length}: ${commit ? "not copied back" : "not read"} (${(err as Error)?.message ?? err}). Run again: copied clients are skipped.`);
    }
    if ((at / chunk) % 10 === 9) log(`  ${Math.min(at + chunk, ids.length)} / ${ids.length}`);
  }
  return summary;
}

/** The summary in plain words. */
export function unsplitSummaryLines(s: UnsplitRunSummary, commit: boolean): string[] {
  return [
    `${commit ? "Copied back" : "Would copy back"}: ${commit ? s.copied : s.toCopy} of ${s.scanned} clients had a machine totals document${commit ? " (now deleted)" : ""}.`,
    s.failed > 0 ? `Failed and left as they were: ${s.failed}. Run again; copied clients are skipped.` : "No failures.",
  ];
}
