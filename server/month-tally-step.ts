/**
 * THE NIGHT'S MONTH TALLY (speed round, Oct 5 2026; R27): step 6 of the
 * nightly renewals job, run at the end of each studio's second look.
 *
 * Hours and Insights read one small document per studio per month instead of
 * the studio's raw sessions (src/features/admin/month-tally/month-tally.ts is
 * the pure half and says why). For the current month and the four before
 * it, this writes
 *
 *   studios/{s}/watch/hours-YYYY-MM      Hours' counts
 *   studios/{s}/watch/sessions-YYYY-MM   the month's sessions as short lines
 *
 * from ONE read of the studio's sessions: the query Hours and Insights make
 * (hosted at the studio, `createdAt` since the oldest month's first day less
 * one), on the (hostedAtStudioId, createdAt) index that already exists, with
 * only the fields the sums use (`select`). Not the job's by-client read: that
 * one follows the studio's own clients wherever they train, and Hours counts
 * the sessions trained HERE, visitors and clients without a home studio
 * included. Closed days only (to the studio's yesterday); the screen adds
 * today with a small live read.
 *
 * Its own catch: a failure here leaves last night's documents, which the
 * screens then treat as too old and read raw. Nothing here can take the
 * snapshots, the outcomes or the client states down. Contacts nobody.
 */
import { FieldValue, Timestamp, type Firestore } from "firebase-admin/firestore";
import type { WorkoutSession } from "../src/types.ts";
import { addDays } from "../src/features/client-history/model.ts";
import { studioDayBoundsForKey } from "../src/lib/studio-time.ts";
import {
  LIVE_MARGIN_MS,
  MAX_DIGEST_BYTES,
  approximateBytes,
  digestRow,
  encodeMonth,
  hoursDocId,
  hoursMonthDoc,
  monthsKept,
  sessionsDocId,
  type DigestRow,
} from "../src/features/admin/month-tally/month-tally.ts";

/** Only what the sums, medians and distinct counts read. */
export const MONTH_TALLY_FIELDS = [
  "date",
  "createdAt",
  "startTime",
  "clientStartTime",
  "endTime",
  "totalPausedMs",
  "status",
  "trainerId",
  "trainerInitials",
  "clientId",
  "notes",
  "dose",
  "clientFeel",
  "postFeel",
  "isCrossTrain",
  "sessionNumber",
  "sessionMachineIds",
] as const;

export interface MonthTallyStudio {
  id: string;
  name: string;
  tz: string;
  /** The studio's day as the job runs. */
  today: string;
}

export interface MonthTallyResult {
  sessionsRead: number;
  monthsWritten: number;
  /** Months whose lines were too long to keep: the screens read those raw. */
  tooBig: number;
}

export async function runMonthTally(input: {
  db: Firestore;
  studio: MonthTallyStudio;
  /** When the job's read begins (now). */
  now: Date;
  dryRun: boolean;
  log: (line: string) => void;
}): Promise<MonthTallyResult> {
  const { db, studio, now, dryRun, log } = input;
  const months = monthsKept(studio.today);
  const oldest = months[months.length - 1];
  const throughDay = addDays(studio.today, -1);
  const readFromMs = studioDayBoundsForKey(addDays(`${oldest}-01`, -1), studio.tz).start.getTime();
  // The live read begins before both the night's read and today, so nothing
  // logged meanwhile falls between them; what the night counted from that
  // stretch is listed (lateIds) and left out of the live read.
  const liveFromMs = Math.min(now.getTime() - LIVE_MARGIN_MS, studioDayBoundsForKey(studio.today, studio.tz).start.getTime());

  const snap = await db
    .collection("sessions")
    .where("hostedAtStudioId", "==", studio.id)
    .where("createdAt", ">=", Timestamp.fromMillis(readFromMs))
    .orderBy("createdAt", "desc")
    .select(...MONTH_TALLY_FIELDS)
    .get();

  const byMonth = new Map<string, DigestRow[]>(months.map((m) => [m, []]));
  let sessionsRead = 0;
  for (const d of snap.docs) {
    sessionsRead += 1;
    const row = digestRow(d.id, d.data() as WorkoutSession);
    // Closed days only, and only the kept months; logged at or after the
    // oldest month's window (the query's range, held here too).
    if (!row || row.day > throughDay || row.createdMs < readFromMs) continue;
    byMonth.get(row.day.slice(0, 7))?.push(row);
  }

  const run = { throughDay, liveFromMs };
  let tooBig = 0;
  const writes: Array<{ path: string; data: Record<string, unknown> }> = [];
  for (const month of months) {
    const rows = byMonth.get(month) ?? [];
    const hours = hoursMonthDoc(month, rows, { ...run, tz: studio.tz });
    let lines: Record<string, unknown> = { ...encodeMonth(month, rows, run) };
    if (approximateBytes(lines as never) > MAX_DIGEST_BYTES) {
      tooBig += 1;
      lines = { v: lines.v, month, throughDay, liveFromMs, lateIds: [], trainers: [], clients: [], machines: [], rows: [], count: rows.length, tooBig: true };
    }
    const stamp = { studioId: studio.id, computedAt: FieldValue.serverTimestamp() };
    writes.push({ path: `studios/${studio.id}/watch/${hoursDocId(month)}`, data: { ...hours, ...stamp } });
    writes.push({ path: `studios/${studio.id}/watch/${sessionsDocId(month)}`, data: { ...lines, ...stamp } });
  }

  if (!dryRun) {
    // Ten documents, one batch: the months of one night stand or fall together.
    const batch = db.batch();
    for (const w of writes) batch.set(db.doc(w.path), w.data);
    await batch.commit();
  }
  log(
    `${studio.name}: the month tally ${dryRun ? "would count" : "counted"} ${sessionsRead} session${sessionsRead === 1 ? "" : "s"} ` +
      `over ${months.length} months, to ${throughDay}${tooBig > 0 ? `; ${tooBig} month${tooBig === 1 ? " was" : "s were"} too long to keep, so Insights reads ${tooBig === 1 ? "it" : "them"} raw` : ""}.`,
  );
  return { sessionsRead, monthsWritten: dryRun ? 0 : months.length, tooBig };
}
