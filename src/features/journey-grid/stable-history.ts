/**
 * The past sets, kept the SAME array while only today's change (speed round,
 * Oct 5 2026; R10 in its blueprint).
 *
 * The Active Session's grid rows are built from every set the logs listener
 * holds, past sessions and today's together, so a keystroke in today's
 * column (a new `logs` map) rebuilt every row of the grid, its history
 * included, and every row redrew. The rows only need the PAST sets; today's
 * values are read separately (`gridLiveValues`). `stableHistory` hands back
 * the previous array when the past sets are unchanged, so the rows built
 * from it are not rebuilt by a keystroke, or by the listener's echo of a
 * save (which makes new objects for every set with the same values in them).
 */

/** Two field values the same, one level deep: a Timestamp by its millis, a plain map or list by its entries. */
function sameValue(a: unknown, b: unknown, depth = 0): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return false;
  const ta = a as { toMillis?: () => number };
  const tb = b as { toMillis?: () => number };
  if (typeof ta.toMillis === "function" && typeof tb.toMillis === "function") return ta.toMillis() === tb.toMillis();
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (depth >= 1) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const pa = Object.getPrototypeOf(a);
  const pb = Object.getPrototypeOf(b);
  if (!Array.isArray(a) && ((pa !== Object.prototype && pa !== null) || (pb !== Object.prototype && pb !== null))) return false;
  const ka = Object.keys(a as object);
  const kb = Object.keys(b as object);
  if (ka.length !== kb.length) return false;
  for (const k of ka) {
    if (!sameValue((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], depth + 1)) return false;
  }
  return true;
}

/** Whether two sets carry the same fields with the same values. */
export function sameSet(a: object, b: object): boolean {
  if (a === b) return true;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) {
    if (!sameValue((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])) return false;
  }
  return true;
}

/** `prev` itself when `next` holds the same sets in the same order, else `next`. */
export function stableHistory<T extends object>(prev: readonly T[] | null, next: T[]): T[] {
  if (!prev || prev.length !== next.length) return next;
  for (let i = 0; i < next.length; i++) {
    if (!sameSet(prev[i], next[i])) return next;
  }
  return prev as T[];
}
