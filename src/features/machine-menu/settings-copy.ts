/**
 * THE MACHINE MENU — telling a settings copy from a note a trainer wrote.
 *
 * Every settings save files a copy into the client's journal
 * (equipment/mutations.ts `saveSettings`, through `fileToJournal`):
 *
 *   body        "Leg Press — Seat 4 → 5. Range of motion"
 *   kind        "equipment", category null, machineId set
 *   occurredAt  device time, a moment after the settingHistory row's timestamp
 *
 * A hand-typed Set-up note stores exactly the same kind and category
 * (`storedKindOf("coaching", "Setup")`), so neither field can tell them
 * apart, and a test on the words ("contains →") would hide a real note such
 * as "Seat 4 -> 5 helps the knee". So a copy is recognised only by an EXACT
 * REBUILD: from a settingHistory row's old values, new values and stored
 * reason, the body the writer would have produced, equal to the entry's
 * body, AND the entry's `occurredAt` within two minutes of the row's
 * `timestamp` (both device time; today's writer sets them seconds apart).
 *
 * A recognised copy is listed under Setting changes, never as a note and
 * never in a count. When the history wasn't read (it failed, or hasn't
 * answered), nothing is recognised and nothing is hidden: a copy shown as a
 * note is a small untidiness, a hidden note is a lost one.
 *
 * PURE — no React, no Firestore.
 */
import { toDate } from "../../lib/studio-time";
import { isDialRow, pairsWords, type SettingRow } from "./setting-history";

/** How far a copy's `occurredAt` may sit from its row's `timestamp`. */
export const COPY_WINDOW_MS = 2 * 60 * 1000;

/** The fields of a journal entry this reads. */
export interface CopyCandidate {
  body?: string | null;
  kind?: string | null;
  category?: string | null;
  occurredAt?: unknown;
}

/**
 * The body `saveSettings` writes for a row:
 * `${machineName} — ${label} ${old} → ${new}[, …]. ${reason}`. Null for a row
 * that isn't about the dials, or whose words couldn't be read.
 */
export function rebuildCopyBody(row: SettingRow, machineName: string): string | null {
  if (!isDialRow(row) || row.pairs.length === 0 || !machineName.trim()) return null;
  return `${machineName} — ${pairsWords(row.pairs)}. ${row.reason}`.trim();
}

/**
 * Is this journal entry a copy of a settings save? `rows` null means the
 * history wasn't read: then never. `machineNames` takes every name the copy
 * might have been written under (the floor's name and the catalog's).
 */
export function isSettingsCopy(
  entry: CopyCandidate | null | undefined,
  rows: readonly SettingRow[] | null | undefined,
  machineNames: string | readonly string[],
): boolean {
  if (!entry || !rows || rows.length === 0) return false;
  if (entry.kind !== "equipment" || (entry.category !== null && entry.category !== undefined)) return false;
  const at = toDate(entry.occurredAt as never)?.getTime();
  if (at === undefined) return false;
  const body = (entry.body ?? "").trim();
  if (!body) return false;
  const names = (typeof machineNames === "string" ? [machineNames] : [...machineNames]).filter((n) => !!n?.trim());
  for (const row of rows) {
    if (row.at === null || Math.abs(at - row.at) > COPY_WINDOW_MS) continue;
    for (const name of names) {
      if (rebuildCopyBody(row, name) === body) return true;
    }
  }
  return false;
}

/** The entries that are not settings copies, in the order given. */
export function withoutSettingsCopies<T extends CopyCandidate>(
  entries: readonly T[],
  rows: readonly SettingRow[] | null | undefined,
  machineNames: string | readonly string[],
): T[] {
  if (!rows) return [...entries];
  return entries.filter((e) => !isSettingsCopy(e, rows, machineNames));
}
