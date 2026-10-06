/**
 * WHEN THE PROFILE READS A CLIENT'S HISTORY AGAIN (speed round, Oct 5 2026).
 *
 * The Journey grid, the Activity Archive's calendar and the machine menu all
 * draw from ONE page of the client's newest sessions and their sets, read by
 * ClientProfileView. Until this round that page was read again every time
 * the trainer came back to Journey from another tab: fifty sessions and
 * their sets, on every return, to show what was already on screen.
 *
 * Now the page is read once per client, and again only when something says
 * her record changed:
 *
 *   - a session of hers that was In-Progress is no longer (it was finished
 *     or discarded, on this iPad or a second one): `inProgressLeft`, fed by
 *     the profile's live In-Progress listener;
 *   - the Activity Archive's own live listener saw a session added, edited
 *     or removed, or its pop-up saved sets (`historySignature`);
 *   - the last read was not the server's whole answer (only the cache, or
 *     it failed): `shouldReadHistory`;
 *   - the In-Progress listener itself failed: nothing would say a session
 *     finished, so every return to Journey or the Archive reads again, as
 *     before this round (`watchFailed`).
 *
 * So a session finished on a second iPad still reaches the grid, and a
 * trainer walking between Journey and Programming costs nothing.
 *
 * A read after a change REPLACES what it covers rather than only adding to
 * it (`mergeHistoryPage`, `mergeHistoryLogs`): a session deleted in the
 * Archive leaves the grid, and a machine removed from a session takes its
 * sets with it. Older pages the trainer scrolled back through are kept.
 *
 * Pure: no React, no Firestore. history-freshness.test.ts.
 */
import type { ExerciseLog, WorkoutSession } from "../../types";
import { parseSessionDate } from "../../lib/utils";

export type HistoryReadState = "ready" | "cache-only" | "failed" | null;

/**
 * How many of her newest sessions the Archive's signature covers: the
 * profile's first page (SESSION_PAGE in ClientProfileView), the part a
 * read replaces. Load full history widening the Archive's window is not a
 * change to it.
 */
export const HISTORY_SIGNATURE_SPAN = 50;

/**
 * Whether the fetch effect should read the first page now.
 *
 *  - Nothing reads it while neither tab that draws it is open and nobody
 *    asked (the machine menu's `ensureHistory` asks from elsewhere).
 *  - An explicit ask (`asked`: Try again, or the machine menu) always reads.
 *  - Otherwise: when this client has no whole answer yet, or her record
 *    changed since the last read began.
 */
export function shouldReadHistory(input: {
  /** Journey or the Activity Archive is the open tab. */
  tabDrawsIt: boolean;
  /** Someone asked for the page from outside those tabs, or asked again. */
  asked: boolean;
  /** This client's last answer, or null when she has none. */
  read: HistoryReadState;
  /** Her record changed after the last read began. */
  changedSinceRead: boolean;
  /** The live In-Progress listener failed: a change can't be seen, so it is assumed. */
  watchFailed?: boolean;
}): boolean {
  if (input.asked) return true;
  if (!input.tabDrawsIt) return false;
  if (input.read !== "ready") return true;
  if (input.watchFailed) return true;
  return input.changedSinceRead;
}

/**
 * True when a session that was In-Progress for this client is not any more:
 * finished, or discarded, here or on another iPad. A session appearing is
 * not a change to the history the grid draws (an In-Progress session is not
 * on it); one leaving is.
 */
export function inProgressLeft(before: readonly string[], now: readonly string[]): boolean {
  if (before.length === 0) return false;
  const still = new Set(now);
  return before.some((id) => !still.has(id));
}

const stampOf = (v: unknown): string => {
  if (v == null) return "";
  const t = v as { seconds?: unknown; nanoseconds?: unknown; toMillis?: () => number };
  if (typeof t.seconds === "number") return `${t.seconds}.${typeof t.nanoseconds === "number" ? t.nanoseconds : 0}`;
  if (typeof t.toMillis === "function") return String(t.toMillis());
  if (v instanceof Date) return String(v.getTime());
  return String(v);
};

/**
 * What the Archive's live list says about her record, as one string: which
 * sessions, in what state, last edited when. Two equal signatures mean the
 * page the profile holds still describes her record.
 */
export function historySignature(
  sessions: ReadonlyArray<{ id?: string; status?: unknown; editedAt?: unknown; editCount?: unknown; date?: unknown }>,
): string {
  return sessions
    .map((s) => `${s.id ?? ""}:${String(s.status ?? "")}:${String(s.date ?? "")}:${stampOf(s.editedAt)}:${String(s.editCount ?? "")}`)
    .sort()
    .join("|");
}

const byDateDesc = (a: WorkoutSession, b: WorkoutSession) => parseSessionDate(b.date) - parseSessionDate(a.date);

/**
 * The first page, merged into what the profile holds.
 *
 * `whole` is true when the server answered (not the cache alone). Then the
 * page is the truth for the span it covers: a session the profile held
 * that is newer than the page's oldest, and not on the page, is gone from
 * her record and leaves (`removed`). A page shorter than `pageSize` is her
 * whole record. Older pages scrolled back through are kept as they were.
 * Without `whole`, nothing is taken away: a cache answer may be partial.
 */
export function mergeHistoryPage(
  prev: readonly WorkoutSession[],
  page: readonly WorkoutSession[],
  opts: { whole: boolean; pageSize: number },
): { sessions: WorkoutSession[]; removed: string[] } {
  const onPage = new Set(page.map((s) => s.id).filter(Boolean) as string[]);
  const removed: string[] = [];
  if (opts.whole) {
    const allOfHer = page.length < opts.pageSize;
    const oldest = page.length > 0 ? Math.min(...page.map((s) => parseSessionDate(s.date))) : Number.POSITIVE_INFINITY;
    for (const s of prev) {
      if (!s.id || onPage.has(s.id)) continue;
      if (allOfHer || parseSessionDate(s.date) > oldest) removed.push(s.id);
    }
  }
  const gone = new Set(removed);
  const merged = new Map<string, WorkoutSession>();
  for (const s of prev) if (s.id && !gone.has(s.id)) merged.set(s.id, s);
  for (const s of page) if (s.id) merged.set(s.id, s);
  return { sessions: Array.from(merged.values()).sort(byDateDesc), removed };
}

/**
 * The page's sets, merged into what the profile holds. When the server
 * answered every chunk (`whole`), the page's sessions take exactly the sets
 * just read (a set deleted in the Archive leaves); a removed session's sets
 * leave with it. Otherwise the new sets are only added.
 */
export function mergeHistoryLogs(
  prev: readonly ExerciseLog[],
  pageSessionIds: readonly string[],
  logs: readonly ExerciseLog[],
  opts: { whole: boolean; removed?: readonly string[] },
): ExerciseLog[] {
  const removed = new Set(opts.removed ?? []);
  const replaced = opts.whole ? new Set(pageSessionIds) : new Set<string>();
  const merged = new Map<string, ExerciseLog>();
  for (const l of prev) {
    if (!l.id) continue;
    if (l.sessionId && (removed.has(l.sessionId) || replaced.has(l.sessionId))) continue;
    merged.set(l.id, l);
  }
  for (const l of logs) if (l.id) merged.set(l.id, l);
  return Array.from(merged.values());
}
