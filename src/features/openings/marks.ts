/**
 * MARKS: HOW A PERSON DISAGREES (Openings, docs/rounds/2026-09-27-openings.md,
 * "Marks: how a person disagrees", and the data, part 3).
 *
 *   studios/{studioId}/openingsMarks/{weekday-HHMM}        e.g. "1-0800"
 *     weekday   1-6 (Monday to Saturday)
 *     time      "08:00"
 *     mark      "full" | "room"      -> Always full · Usually has room
 *     note      optional, up to MAX_MARK_NOTE characters
 *     by        { id: the Auth uid, name }
 *     at        the server's time
 *
 * A mark is a person's word on a time, in the grid's own words: "Always
 * full" (AJ's "that spot's just always taken") or "Usually has room". It
 * sits BESIDE the numbers and never replaces them. What it changes:
 *
 *   Always full        counts as usually full for the next 7 days, and is
 *                      never offered as a new regular time
 *   Usually has room   is offered, with the mark and the numbers shown
 *
 * When the bookings clearly disagree (room in at least USUAL_SHARE of the
 * judged weeks against an "Always full" mark, or the reverse), the sheet
 * says so first. After MARK_REVIEW_DAYS (as notes do) the sheet asks "Still
 * true?"; the mark keeps working while it waits, and nothing drops on its
 * own.
 *
 * Anyone who works at the studio may set, change or remove a mark, always as
 * themselves (the rules pin `by.id` to the sign-in id and `at` to the
 * server's time). One mark per time.
 *
 * PURE MODULE. The only writer is ui/marks-store.ts (`saveMark`, `keepMark`,
 * `removeMark`), from a time's sheet (ui/MarkThisTime.tsx).
 */
import { studioDateKey, toDate, type DateLike } from "../../lib/studio-time";
import { isClock, minutesOf } from "../standing-week/week";
import { ROW_MINUTES, parseTimeKey, timeKey, type TimeKey } from "./rows";
import { MIN_WEEKS, atLeastShare, readsFull, type UsualTime, type UsualWord } from "./usual";

/** `studios/{studioId}/openingsMarks/{time key}`. */
export const MARKS_COLLECTION = "openingsMarks";
/** A mark comes up for review after this many days. */
export const MARK_REVIEW_DAYS = 60;
export const MAX_MARK_NOTE = 200;

export type MarkWord = "full" | "room";

export interface OpeningsMark {
  /** The time key, which is also the document id. */
  id: TimeKey;
  weekday: number;
  time: string;
  mark: MarkWord;
  note: string;
  by: { id: string; name: string };
  /** The server's time, once it has one. */
  at: Date | null;
}

/** "1-0800" for weekday 1 and "08:00": the document id the rules require. */
export function markId(weekday: number, time: string): TimeKey | null {
  const minutes = minutesOf(time);
  if (minutes === null || minutes % ROW_MINUTES !== 0 || weekday < 1 || weekday > 6 || !Number.isInteger(weekday)) return null;
  return timeKey(weekday, minutes);
}

/** A stored mark, read safely: null for anything the rules would have refused. */
export function normalizeMark(id: string, raw: unknown): OpeningsMark | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Record<string, unknown>;
  if (typeof d.weekday !== "number" || typeof d.time !== "string" || !isClock(d.time)) return null;
  if (markId(d.weekday, d.time) !== id) return null;
  if (d.mark !== "full" && d.mark !== "room") return null;
  const by = d.by as { id?: unknown; name?: unknown } | null | undefined;
  if (!by || typeof by.id !== "string" || by.id === "") return null;
  return {
    id,
    weekday: d.weekday,
    time: d.time,
    mark: d.mark,
    note: typeof d.note === "string" ? d.note.slice(0, MAX_MARK_NOTE) : "",
    by: { id: by.id, name: typeof by.name === "string" ? by.name : "" },
    at: toDate(d.at as DateLike),
  };
}

/** The studio's marks by time, from the collection read whole. */
export function marksByTime(docs: readonly { id: string; data: unknown }[]): Map<TimeKey, OpeningsMark> {
  const out = new Map<TimeKey, OpeningsMark>();
  for (const doc of docs) {
    const m = normalizeMark(doc.id, doc.data);
    if (m) out.set(m.id, m);
  }
  return out;
}

/**
 * A mark ready to write, without `at` (the writer adds the server's time):
 * the note trimmed and left out when empty, nothing undefined.
 */
export function markForWrite(input: { key: TimeKey; mark: MarkWord; note?: string; by: { id: string; name: string } }): {
  weekday: number;
  time: string;
  mark: MarkWord;
  note?: string;
  by: { id: string; name: string };
} | null {
  const t = parseTimeKey(input.key);
  if (!t || !input.by.id) return null;
  const note = (input.note ?? "").trim().slice(0, MAX_MARK_NOTE);
  const hh = String(Math.floor(t.row / 60)).padStart(2, "0");
  const mm = String(t.row % 60).padStart(2, "0");
  return { weekday: t.weekday, time: `${hh}:${mm}`, mark: input.mark, ...(note ? { note } : {}), by: { id: input.by.id, name: input.by.name } };
}

/** Whole studio days since the mark was set or kept, or null before the server has stamped it. */
export function markAgeDays(mark: Pick<OpeningsMark, "at">, today: string, tz: string): number | null {
  const day = mark.at ? studioDateKey(mark.at, tz) : null;
  if (!day) return null;
  const [y1, m1, d1] = day.split("-").map(Number);
  const [y2, m2, d2] = today.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

/** "Marked 64 days ago. Still true?" once MARK_REVIEW_DAYS have passed. */
export function needsReview(mark: Pick<OpeningsMark, "at">, today: string, tz: string): boolean {
  const age = markAgeDays(mark, today, tz);
  return age !== null && age >= MARK_REVIEW_DAYS;
}

/** Counts as usually full for the next 7 days: the numbers say so, or it is marked Always full. */
export function countsAsFull(usual: UsualWord | null | undefined, mark: OpeningsMark | null | undefined): boolean {
  return mark?.mark === "full" || readsFull(usual);
}

/**
 * Offered as a new regular time: it reads Usually has room or is marked so,
 * and it neither reads nor is marked Always full.
 */
export function offerable(usual: UsualWord | null | undefined, mark: OpeningsMark | null | undefined): boolean {
  if (mark?.mark === "full" || usual === "always-full") return false;
  return mark?.mark === "room" || usual === "usually-room";
}

/**
 * When the bookings clearly disagree with a mark, what they say instead:
 * room in at least USUAL_SHARE of at least MIN_WEEKS judged weeks against
 * "Always full", or full in as many against "Usually has room".
 */
export function disagreement(usual: UsualTime, mark: OpeningsMark | null | undefined): "room" | "full" | null {
  if (!mark || usual.judged < MIN_WEEKS) return null;
  if (mark.mark === "full" && atLeastShare(usual.room, usual.judged)) return "room";
  if (mark.mark === "room" && atLeastShare(usual.full, usual.judged)) return "full";
  return null;
}
