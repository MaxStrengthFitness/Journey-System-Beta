/**
 * THE HUB'S DAY SUMMARY (calm Hub round, Sep 28 2026). Pure: day-summary.test.ts.
 *
 * AJ on the Blueprints page (Sep 27): the top bar "is very jumbled". So the
 * summary says less, in one vocabulary:
 *
 *   - the WEEK STRIP (Mindbody's Keep: "the week strip with each day's
 *     count"): each day's bookings, and one small dot when the day holds
 *     something to celebrate. A day with nothing booked shows no number:
 *     zero is left out, never drawn as "0";
 *   - the FAMILY CHIPS: the Opportunities list's own five filters, in its
 *     order and with its words ("Celebrate 3"), so the two layers read the
 *     same. A tap lights the matching cards on the grid (the spotlight) and
 *     the bar says what it is showing, in words.
 */
import type { ScheduleEntry } from "../../types";
import { isStaffBlock } from "../../lib/booking-state";
import { studioDateKey } from "../../lib/studio-time";
import { weekdayOf } from "../client-history/model";
import { FILTERS, hasFamily, type MomentFamily, type MomentKind, type RunSheetEntry } from "../hub-opportunities/moments-today";

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export interface StripDay {
  /** The studio day, "yyyy-mm-dd". */
  key: string;
  /** "Mon". */
  weekday: string;
  /** Day of the month. */
  date: number;
  /** Bookings that day, or null when there are none (zero is left out). */
  count: number | null;
  /** The day holds a milestone or a birthday worth saying. */
  celebrate: boolean;
  isToday: boolean;
}

/** Sessions booked on each day: never a cancellation, never Mindbody's "Unavailable". */
export function countsByDay(schedules: ReadonlyArray<ScheduleEntry>, tz?: string): ReadonlyMap<string, number> {
  const out = new Map<string, number>();
  for (const b of schedules) {
    if (!b || b.status === "Cancelled" || isStaffBlock(b)) continue;
    const day = studioDateKey(b.startTime, tz);
    if (!day) continue;
    out.set(day, (out.get(day) ?? 0) + 1);
  }
  return out;
}

export function stripDays(
  dayKeys: ReadonlyArray<string>,
  todayKey: string,
  counts: ReadonlyMap<string, number>,
  celebrateOn: (dayKey: string) => boolean,
): StripDay[] {
  return dayKeys.map((key) => {
    const n = counts.get(key) ?? 0;
    return {
      key,
      weekday: WEEKDAY[weekdayOf(key)] ?? "",
      date: Number(key.slice(8, 10)),
      count: n > 0 ? n : null,
      celebrate: n > 0 && celebrateOn(key),
      isToday: key === todayKey,
    };
  });
}

/* ------------------------------------------------------------------ */
/* The chips and the spotlight                                         */
/* ------------------------------------------------------------------ */

/** The Opportunities list's own filters, less "All": one vocabulary on both layers. */
export const SUMMARY_FAMILIES: ReadonlyArray<{ id: MomentFamily; label: string }> = FILTERS.filter(
  (f): f is { id: MomentFamily; label: string } => f.id !== "all",
);

export interface SummaryChip {
  id: MomentFamily;
  label: string;
  count: number;
}

/** A chip per family with anyone in it that day, in the list's order. */
export function summaryChips(entries: ReadonlyArray<RunSheetEntry>): SummaryChip[] {
  return SUMMARY_FAMILIES.map((f) => ({ ...f, count: entries.filter((e) => hasFamily(e, f.id)).length })).filter((c) => c.count > 0);
}

const KIND_WORDS: Record<MomentKind, [string, string]> = {
  critical: ["to read first", "to read first"],
  waiver: ["waiver to sign", "waivers to sign"],
  pulse: ["Pulse flag", "Pulse flags"],
  consult: ["consult", "consults"],
  "early-session": ["new face", "new faces"],
  "first-with-trainer": ["first with their trainer", "first with their trainer"],
  back: ["back after a break", "back after a break"],
  milestone: ["milestone", "milestones"],
  birthday: ["birthday", "birthdays"],
  renew: ["renewal talk", "renewal talks"],
};

const FAMILY_WORDS: Record<MomentFamily, string> = {
  "read-first": "to read first",
  watch: "to watch",
  welcome: "to welcome",
  celebrate: "to celebrate",
  renew: "for a renewal talk",
};

/**
 * What the spotlight shows, in words: "3 to celebrate: 2 birthdays, 1
 * milestone". The first number counts CLIENTS; the parts count what each has.
 */
export function spotWords(entries: ReadonlyArray<RunSheetEntry>, family: MomentFamily): string {
  const people = entries.filter((e) => hasFamily(e, family));
  const kinds = new Map<MomentKind, number>();
  for (const e of people) {
    for (const m of e.moments) if (m.family === family) kinds.set(m.kind, (kinds.get(m.kind) ?? 0) + 1);
  }
  const head = `${people.length} ${FAMILY_WORDS[family]}`;
  if (kinds.size <= 1 && (family === "read-first" || family === "renew")) return head;
  const parts = [...kinds.entries()].map(([k, n]) => `${n} ${KIND_WORDS[k][n === 1 ? 0 : 1]}`);
  return parts.length > 0 ? `${head}: ${parts.join(", ")}` : head;
}
