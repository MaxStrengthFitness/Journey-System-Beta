/**
 * JOB MEMORY (Oct 1 2026) — the two helpers that keep the Render cron jobs
 * inside their 512 MB instances as the company grows, and that let Render's
 * log say how much room is left.
 *
 * Before this, the weekly machine-trends job and the nightly renewals job
 * each read the whole company into memory at once - every client, every set
 * of 90 days, every booking and workout of four months - and would have run
 * out of memory at somewhere between 430 and 1,100 active clients company-wide
 * (the four studios had about 700). The rule since: a job reads ONE studio at
 * a time, asks only for the fields it uses (`select`), lets that studio's
 * documents go before the next, and keeps company-wide sums as small running
 * totals, never as the documents they came from (docs/KNOWN-TRAPS.md, "Jobs
 * read per studio with select").
 *
 *   eachDoc(query)   a query's documents one at a time as they arrive (the
 *                    Admin SDK's stream), for the one read that must cover
 *                    the whole company: the window's sets.
 *   memoryWatch()    the most heap the job has used since the last line, as a
 *                    line for the log: "Solon: memory peak 41.2 MB heap ...".
 */

import type { DocumentData, Query, QueryDocumentSnapshot } from "firebase-admin/firestore";

/** The cron jobs' Render plan, "Starter": 0.5 CPU, 512 MB (render.yaml). */
export const INSTANCE_MB = 512;

const MB = 1024 * 1024;
const mb = (bytes: number): string => (bytes / MB).toFixed(1);

/**
 * A query's documents one at a time as they arrive, never the whole answer in
 * memory at once: one query, one read of each document, exactly as `get()`
 * would make it, in the same order.
 */
export async function* eachDoc<T = DocumentData>(query: Query<T>): AsyncGenerator<QueryDocumentSnapshot<T>> {
  for await (const doc of query.stream() as AsyncIterable<QueryDocumentSnapshot<T>>) yield doc;
}

export interface MemoryWatch {
  /** Note the heap now. Cheap: call it inside loops. */
  sample(): void;
  /** The peak since the last line, as a log line; starts the next window. */
  line(label: string): string;
  /** The highest heap seen in the whole run, in MB. */
  runPeakMb(): number;
}

export function memoryWatch(): MemoryWatch {
  let windowPeak = 0;
  let runPeak = 0;
  const sample = () => {
    const used = process.memoryUsage().heapUsed;
    if (used > windowPeak) windowPeak = used;
    if (used > runPeak) runPeak = used;
  };
  return {
    sample,
    line(label: string) {
      sample();
      const { rss } = process.memoryUsage();
      const text = `${label}: memory peak ${mb(windowPeak)} MB heap used (process ${mb(rss)} MB now; the instance has ${INSTANCE_MB} MB).`;
      windowPeak = 0;
      return text;
    },
    runPeakMb: () => Number(mb(runPeak)),
  };
}
