/**
 * HOME'S TAKE IT, SNOOZE AND DISMISS — a small stored mark per item.
 * PURE: no React, no Firestore (home-marks-store.ts reads and writes).
 *
 * The Admins room's second wave (Sep 28 2026; AJ "all yes" to "small records
 * for Home's Take it, Snooze and Dismiss"). One document per mark, shared by
 * every administrator:
 *
 *   adminHome/{itemKey}  { state: taken | snoozed | dismissed, by: { uid, name },
 *                          until?: yyyy-mm-dd, reason?: string, at }
 *
 * THE KEY IS THE CONDITION. An item's key is its kind and a short hash of
 * what exactly needs doing (needs.ts, `condition`: the studios failing, the
 * reports still new), so a mark holds for that condition and no other: when
 * another report arrives, or another studio starts failing, the key changes
 * and the item is back. So:
 *
 *   taken       the item stays on Home, saying who took it
 *   snoozed     set aside until its day comes (the studio's day)
 *   dismissed   set aside, with the reason the dismiss asked for
 *
 * and nothing is ever hidden without a way back: what is set aside is listed
 * under the items, each with Bring it back. "Couldn't check" is never marked:
 * it isn't a thing to do, it is Home saying it doesn't know.
 *
 * A mark whose condition has ended is stale, and Home removes it once every
 * read behind that kind of item has answered (staleMarkKeys).
 */
import { addDays } from "../launches/checklist";
import { dayLabel } from "../studios/stages";
import type { NeedItem } from "./needs";

export type HomeMarkState = "taken" | "snoozed" | "dismissed";

export interface HomeMark {
  key: string;
  state: HomeMarkState;
  byUid: string;
  byName: string;
  /** yyyy-mm-dd: a snooze ends when this day comes. */
  until: string | null;
  reason: string | null;
  at: number | null;
}

/** The three reasons a dismiss offers first; a person may write their own. */
export const DISMISS_REASONS: readonly string[] = ["Already handled", "Not a problem", "Someone else has it"];

export const REASON_MAX = 200;

/** A short, stable hash of a string (djb2, in base 36): the same condition, the same key. */
export function hashText(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/** The document id a mark on this item is kept under. */
export function itemKey(item: Pick<NeedItem, "id" | "condition">): string {
  return `${item.id}--${hashText(item.condition)}`;
}

/** The kind of item a key belongs to. */
export function kindOfKey(key: string): string {
  const i = key.lastIndexOf("--");
  return i > 0 ? key.slice(0, i) : key;
}

/** Only things to do are marked: "Couldn't check" never is. */
export function isMarkable(item: Pick<NeedItem, "id">): boolean {
  return item.id !== "unknown";
}

function millis(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (v instanceof Date) return v.getTime();
  const ts = v as { toMillis?: () => number; toDate?: () => Date };
  if (typeof ts.toMillis === "function") return ts.toMillis();
  if (typeof ts.toDate === "function") return ts.toDate().getTime();
  return null;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** One stored document as a mark, or null when it isn't one. */
export function toHomeMark(key: string, raw: unknown): HomeMark | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as { state?: unknown; by?: { uid?: unknown; name?: unknown } | null; until?: unknown; reason?: unknown; at?: unknown };
  if (d.state !== "taken" && d.state !== "snoozed" && d.state !== "dismissed") return null;
  const until = typeof d.until === "string" && DAY.test(d.until) ? d.until : null;
  if (d.state === "snoozed" && !until) return null;
  return {
    key,
    state: d.state,
    byUid: typeof d.by?.uid === "string" ? d.by.uid : "",
    byName: typeof d.by?.name === "string" && d.by.name.trim() ? d.by.name.trim() : "An administrator",
    until,
    reason: typeof d.reason === "string" && d.reason.trim() ? d.reason.trim() : null,
    at: millis(d.at),
  };
}

export interface MarkedNeed {
  item: NeedItem;
  key: string;
  /** The mark that applies now: a snooze whose day has come no longer does. */
  mark: HomeMark | null;
}

/** Which items Home shows and which are set aside, given the marks and the studio's today. */
export function sortNeeds(
  items: readonly NeedItem[],
  marks: Readonly<Record<string, HomeMark>>,
  today: string,
): { shown: MarkedNeed[]; setAside: MarkedNeed[] } {
  const shown: MarkedNeed[] = [];
  const setAside: MarkedNeed[] = [];
  for (const item of items) {
    const key = itemKey(item);
    const mark = isMarkable(item) ? (marks[key] ?? null) : null;
    if (mark?.state === "dismissed") setAside.push({ item, key, mark });
    else if (mark?.state === "snoozed" && mark.until && mark.until > today) setAside.push({ item, key, mark });
    else shown.push({ item, key, mark: mark?.state === "taken" ? mark : null });
  }
  return { shown, setAside };
}

/**
 * The marks to remove: a condition that has ended (no item has its key), or a
 * snooze whose day has come — but only for a kind of item whose reads all
 * answered (`settled`), so a read that failed never costs anybody their mark.
 */
export function staleMarkKeys(
  marks: Readonly<Record<string, HomeMark>>,
  items: readonly NeedItem[],
  settled: ReadonlySet<string>,
  today: string,
): string[] {
  const live = new Set(items.filter(isMarkable).map(itemKey));
  return Object.values(marks)
    .filter((m) => settled.has(kindOfKey(m.key)))
    .filter((m) => !live.has(m.key) || (m.state === "snoozed" && m.until !== null && m.until <= today))
    .map((m) => m.key);
}

/** The day a snooze ends: tomorrow, or a week from today. */
export function snoozeUntil(today: string, choice: "tomorrow" | "week"): string {
  return addDays(today, choice === "tomorrow" ? 1 : 7);
}

/** A mark in words: "Taken by Ada Admin", "Snoozed until Tue, Sep 29, 2026 by …", "Dismissed by …: Not a problem". */
export function markWords(mark: HomeMark): string {
  if (mark.state === "taken") return `Taken by ${mark.byName}`;
  if (mark.state === "snoozed") return `Snoozed until ${mark.until ? dayLabel(mark.until) : "later"} by ${mark.byName}`;
  return `Dismissed by ${mark.byName}${mark.reason ? `: ${mark.reason}` : ""}`;
}
