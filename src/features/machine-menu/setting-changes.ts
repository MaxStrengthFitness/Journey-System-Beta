/**
 * THE MACHINE MENU — the Setting changes list, in words.
 *
 * The folded row at the foot of the card: every row of the client's
 * `machines/{id}/settingHistory` the menu read when it opened (the one read
 * the chart's set-up lane and the Settings heading's "Last changed" share;
 * setting-history.ts parses it), newest first, with no cap of twelve:
 *
 *   - settings and first set-up rows, old → new · reason · who · day. A Save
 *     and its Undo are both listed, honestly; the chart and "Last changed"
 *     net them out, this list does not;
 *   - the WEIGHT rows that moved the STARTING weight ("Starting weight 84 →
 *     80 lb · Weight update · Ana Cole · Feb 20"), because that is the number
 *     the green % counts from (AJ, Oct 4 2026, Q2 (a)). A row that moved only
 *     today's weight is not listed: the Now Bar and the Wrap-up set that one
 *     every session, and the footer says so.
 *
 * It never hides itself: a read that failed says "Couldn't load setting
 * changes" with Try again, and a list read only from this iPad's copy says
 * that too.
 *
 * PURE — no React, no Firestore.
 */
import { formatShortDate } from "../journey-grid/stats";
import { pairsWords, type SettingRow } from "./setting-history";
import { CACHE_ONLY_LINE } from "./timeline-words";

export interface ChangeListRow {
  id: string;
  /** "Seat 4 → 5", "Starting weight 84 → 80 lb", or the row's own words when they couldn't be read. */
  what: string;
  /** "Range of motion · Sam Reyes · Jan 13" — the parts the row holds. */
  detail: string;
}

/** The day a row was saved: "Aug 18", or "Sep 9 2025" in another year. */
function dayWords(day: string | null, today: string): string | null {
  if (!day) return null;
  return `${formatShortDate(day)}${day.slice(0, 4) !== today.slice(0, 4) ? ` ${day.slice(0, 4)}` : ""}`;
}

function whatOf(row: SettingRow): string {
  if (row.kind === "start-weight") {
    const p = row.pairs[0];
    return `Starting weight ${p?.from || "—"} → ${p?.to || "—"} lb`;
  }
  if (row.pairs.length > 0) return pairsWords(row.pairs);
  // A row whose words couldn't be paired is shown as it was written, never guessed at.
  const before = row.oldValue.trim();
  const after = row.newValue.trim();
  if (before || after) return `${before || "—"} → ${after || "—"}`;
  return row.kind === "setup" ? "First set-up" : "Settings changed";
}

/** The list, newest first (a row with no time last). */
export function settingChangeRows(rows: readonly SettingRow[], today: string): ChangeListRow[] {
  return [...rows]
    .sort((a, b) => (b.at ?? -Infinity) - (a.at ?? -Infinity))
    .map((row) => ({
      id: row.id,
      what: whatOf(row),
      detail: [row.reason.trim() || null, row.trainerName, dayWords(row.day, today)].filter(Boolean).join(" · "),
    }));
}

/** The folded row's title: "Setting changes (4)", or with no count while the read is out or failed. */
export function settingChangesTitle(count: number | null): string {
  return count === null ? "Setting changes" : `Setting changes (${count})`;
}

export const SETTING_CHANGES_WORDS = {
  loading: "Loading setting changes…",
  failed: "Couldn't load setting changes",
  none: "No setting changes saved yet.",
  cacheOnly: CACHE_ONLY_LINE,
  /** Where the weights that aren't listed live. */
  foot: "Today's weight is set on the Now Bar and the next session's at the Wrap-up; those aren't listed here.",
} as const;
