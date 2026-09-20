/**
 * THE NEXT THREE DAYS — what is coming, day by day. Pure.
 *
 * Operations overhaul, Sep 2026. AJ (Sep 19): "a lot of the studio leaders
 * really only can handle so much on their plate, so they're really only
 * looking the next three days in advance, and really sticking to making
 * sure they have all of that locked down — any schedule changes, cancelled
 * appointments, injured or regressing clients, an anniversary coming up,
 * critical notes."
 *
 * The three days are the next three WITH bookings (a studio closed on
 * Sunday gets Mon · Tue · Wed, not Sun · Mon · Tue); if fewer than three
 * days ahead have anything booked, the calendar days fill in. Each day
 * carries: bookings, changes already recorded against it, moments falling
 * on it, and how many of the people booked carry a live critical note or
 * open incident — so the leader knows who to brief before they walk in.
 *
 * "Not booked ahead" is the other side of the same worry: active clients
 * whose nightly snapshot says nothing is on the books after their last
 * visit. Read straight from the flag the renewals engine already sets.
 */
import type { Client, ScheduleEntry } from "../../../types";
import { clientDisplayName } from "../../../lib/client-name";
import { studioDateKey } from "../../../lib/studio-time";
import { addDays } from "../../client-history/model";
import type { RenewalSnapshot } from "../../renewals/types";

export interface NextDay {
  day: string;
  /** "Tomorrow", else the weekday: "Mon". */
  label: string;
  /** "Sep 21" */
  dateLabel: string;
  booked: number;
  clients: number;
  changes: number;
  moments: number;
  /** People booked that day with a live critical note, open incident or recent pain. */
  hot: number;
  hotNames: string[];
}

const weekdayLabel = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
};
const dateLabel = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
};

export interface NextDaysInput {
  weekEntries: ScheduleEntry[];
  changesByDay: Record<string, number>;
  momentsByDay: Record<string, number>;
  /** Client ids with something live on the pain-and-notes panel. */
  hotClientIds: ReadonlySet<string>;
  clients: Client[];
  today: string;
  count?: number;
  /** How far ahead to look for days with bookings. */
  lookaheadDays?: number;
  tz?: string;
}

export function nextDays(input: NextDaysInput): NextDay[] {
  const { today, tz } = input;
  const count = input.count ?? 3;
  const lookahead = input.lookaheadDays ?? 7;
  const names = new Map(input.clients.filter((c) => c.id).map((c) => [c.id as string, clientDisplayName(c, "A client")]));

  // Live bookings by day.
  const byDay = new Map<string, ScheduleEntry[]>();
  for (const e of input.weekEntries) {
    if (e.status === "Cancelled") continue;
    const day = studioDateKey(e.startTime, tz);
    if (!day || day <= today) continue;
    const list = byDay.get(day) ?? [];
    list.push(e);
    byDay.set(day, list);
  }

  const candidates: string[] = [];
  for (let i = 1; i <= lookahead; i += 1) candidates.push(addDays(today, i));
  const withBookings = candidates.filter((d) => (byDay.get(d)?.length ?? 0) > 0);
  const chosen = withBookings.slice(0, count);
  // Fill from the calendar when the schedule ahead is thin.
  for (const d of candidates) {
    if (chosen.length >= count) break;
    if (!chosen.includes(d)) chosen.push(d);
  }
  chosen.sort();

  return chosen.map((day) => {
    const entries = byDay.get(day) ?? [];
    const clientIds = new Set<string>();
    const hot = new Set<string>();
    for (const e of entries) {
      const key = e.clientId || e.mindbodyClientId || e.clientName || "?";
      clientIds.add(key);
      if (e.clientId && input.hotClientIds.has(e.clientId)) hot.add(e.clientId);
    }
    return {
      day,
      label: day === addDays(today, 1) ? "Tomorrow" : weekdayLabel(day),
      dateLabel: dateLabel(day),
      booked: entries.length,
      clients: clientIds.size,
      changes: input.changesByDay[day] ?? 0,
      moments: input.momentsByDay[day] ?? 0,
      hot: hot.size,
      hotNames: [...hot].map((id) => names.get(id) ?? "A client").sort(),
    };
  });
}

/* ------------------------------------------------------------------ *
 * Not booked ahead
 * ------------------------------------------------------------------ */

export interface NotBookedRow {
  clientId: string;
  name: string;
  /** "Last visit Sep 12" or "No visit on record". */
  proof: string;
  lastVisit: string | null;
}

export interface NotBookedAhead {
  count: number;
  rows: NotBookedRow[];
  /** Live clients the flag could have been set on. */
  measured: number;
}

const LIVE = new Set<RenewalSnapshot["situation"]>(["on-track", "will-bank", "will-run-out", "ended"]);

export const NOT_BOOKED_ROWS_SHOWN = 6;

/** Active clients the nightly job flagged with nothing booked ahead, most recently seen first. */
export function notBookedAhead(clients: Client[], rowsShown = NOT_BOOKED_ROWS_SHOWN): NotBookedAhead {
  const rows: NotBookedRow[] = [];
  let measured = 0;
  for (const c of clients) {
    const s = c.renewal as RenewalSnapshot | undefined;
    if (!c.id || !s || c.isActive === false || !LIVE.has(s.situation)) continue;
    measured += 1;
    if (!s.flags.some((f) => f.code === "no-future-booking")) continue;
    rows.push({
      clientId: c.id,
      name: clientDisplayName(c, "A client"),
      proof: s.lastVisitDate ? `Last visit ${dateLabel(s.lastVisitDate)}.` : "No visit on record.",
      lastVisit: s.lastVisitDate,
    });
  }
  rows.sort((a, b) => (b.lastVisit ?? "").localeCompare(a.lastVisit ?? "") || a.name.localeCompare(b.name));
  return { count: rows.length, rows: rows.slice(0, rowsShown), measured };
}
