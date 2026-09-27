/**
 * THE WEEK CHECK — the coming seven studio days' Mindbody bookings against
 * each trainer's AGREED standing week (voice-review round, Sep 27 2026).
 *
 * AJ: "checking actual MyBody bookings against the standing template and
 * flagging for discrepancies ... if one of their eight o'clocks on Monday is
 * going out on vacation for a couple of weeks, that's going to let the
 * studio leader or head trainers know ... this person's going to have an open
 * slot for these times. You should probably look to fill this."
 *
 * For each agreed regular slot in the window:
 *
 *   as usual   the regular is booked with that trainer within 15 minutes of
 *              the slot (or with no trainer matched: nothing proves it isn't
 *              theirs) — nothing is said
 *   moved      the regular is booked elsewhere that Monday–Sunday week, on
 *              another day, time or trainer — the trainer's slot is free
 *   open       the regular isn't booked for it — the slot is free
 *   taken      another client is booked with the trainer in the slot
 *
 * Monday–Sunday is the Overview's reschedule rule (admin/changes/changes.ts),
 * so the two screens agree on what a move is. A cancelled booking is no
 * booking. Only the days read are judged: nothing here claims she "isn't
 * booked that week", only that she isn't booked FOR THE SLOT.
 *
 * WHOSE BOOKING. The schedule sync writes a trainer's id when it matched the
 * Mindbody staff member to a Journey trainer, and only the staff member's
 * name when it didn't (lib/mindbody-api-sync.ts). So an id decides when
 * there is one and the name when there isn't, and a booking that names no
 * staff member (the sync's "{studio} Rotation") is nobody's in particular:
 * it may keep a slot, but it never takes one. The client is matched by id
 * when the sync linked one, else by name — the Overview's rule again.
 *
 * WHEN IT SAYS NOTHING. A failed or unfinished read, or a studio whose
 * Mindbody isn't connected, gives a state and no findings: an unread day is
 * "can't tell", never "open".
 *
 * PURE MODULE.
 */
import type { ScheduleEntry } from "../../types";
import { formatStudioDate, studioDateKey, zonedHM } from "../../lib/studio-time";
import { scheduleStart } from "../../lib/schedule-window";
import { addDays, weekdayOf } from "../studio-tasks/recurrence";
import { minutesToClock } from "../relay/board/now-context";
import { minutesOf, type StandingWeekDoc } from "./week";

/** How far a booking may start from the slot and still be the slot. */
export const SLOT_TOLERANCE_MINUTES = 15;
export const CHECK_DAYS = 7;

export type SlotKind = "open" | "moved" | "taken";

export interface SlotFinding {
  kind: SlotKind;
  /** The slot: its studio day and its "HH:MM". */
  dateKey: string;
  start: string;
  trainerId: string;
  trainerName: string;
  clientId: string;
  clientName: string;
  /** Where the regular is booked instead, that Monday–Sunday week. */
  movedTo?: { dateKey: string; start: string; trainerName: string; sameTrainer: boolean };
  /** Who is booked in the slot instead. */
  takenBy?: { clientName: string };
}

export type WeekCheckState = "ready" | "loading" | "failed" | "unconnected" | "nothing-agreed";

export interface WeekCheck {
  state: WeekCheckState;
  findings: SlotFinding[];
  /** Agreed regular slots in the window — the denominator a sentence may name. */
  slots: number;
}

export interface WeekCheckInput {
  docs: StandingWeekDoc[];
  /** The window's bookings, cancellations included (they are dropped here). */
  bookings: ScheduleEntry[];
  /** The studio's day, YYYY-MM-DD. */
  today: string;
  days?: number;
  tz?: string;
  read: "ready" | "loading" | "failed";
  /** The studio's Mindbody is linked (or it is the Demo studio, whose week is seeded). */
  connected: boolean;
}

interface BookingView {
  id: string;
  dateKey: string;
  minutes: number;
  start: string;
  clientId: string | null;
  clientName: string;
  trainerId: string | null;
  trainerName: string;
}

function viewOf(entry: ScheduleEntry, index: number, tz?: string): BookingView | null {
  if (entry.status === "Cancelled") return null;
  const at = scheduleStart(entry);
  if (!at) return null;
  const dateKey = studioDateKey(at, tz);
  const hm = zonedHM(at, tz);
  if (!dateKey || !hm) return null;
  const minutes = hm.hour * 60 + hm.minute;
  return {
    id: entry.id ?? `row-${index}`,
    dateKey,
    minutes,
    start: `${String(hm.hour).padStart(2, "0")}:${String(hm.minute).padStart(2, "0")}`,
    clientId: entry.clientId || null,
    clientName: entry.clientName || "",
    trainerId: entry.trainerId || null,
    trainerName: entry.trainerName || "",
  };
}

/** The Monday that starts dateKey's week. */
export function mondayOf(dateKey: string): string {
  const dow = weekdayOf(dateKey);
  return addDays(dateKey, dow === 0 ? -6 : 1 - dow);
}

interface Slot {
  dateKey: string;
  start: string;
  minutes: number;
  trainerId: string;
  trainerName: string;
  clientId: string;
  clientName: string;
}

const near = (a: number, b: number) => Math.abs(a - b) <= SLOT_TOLERANCE_MINUTES;
const norm = (v: string | null | undefined) => (v ?? "").trim().replace(/\s+/g, " ").toLowerCase();

/** The booking's trainer against the slot's: see WHOSE BOOKING above. */
function trainerOf(b: BookingView, s: Slot): "same" | "other" | "unknown" {
  if (b.trainerId) return b.trainerId === s.trainerId ? "same" : "other";
  const name = norm(b.trainerName);
  if (!name || name.endsWith(" rotation")) return "unknown";
  return name === norm(s.trainerName) ? "same" : "other";
}

function isFor(b: BookingView, s: Slot): boolean {
  return b.clientId ? b.clientId === s.clientId : b.clientName !== "" && norm(b.clientName) === norm(s.clientName);
}

export function checkWeek(input: WeekCheckInput): WeekCheck {
  const days = input.days ?? CHECK_DAYS;
  const agreed = input.docs.filter((d) => d.final && d.trainerId);
  const slots: Slot[] = [];
  for (let i = 0; i < days; i += 1) {
    const dateKey = addDays(input.today, i);
    const weekday = weekdayOf(dateKey);
    for (const doc of agreed) {
      for (const r of doc.final!.regulars) {
        if (r.weekday !== weekday) continue;
        const minutes = minutesOf(r.start);
        if (minutes === null) continue;
        slots.push({ dateKey, start: r.start, minutes, trainerId: doc.trainerId, trainerName: doc.trainerName, clientId: r.clientId, clientName: r.clientName });
      }
    }
  }
  const empty = (state: WeekCheckState): WeekCheck => ({ state, findings: [], slots: slots.length });
  if (agreed.length === 0) return empty("nothing-agreed");
  if (!input.connected) return empty("unconnected");
  if (input.read !== "ready") return empty(input.read);

  const bookings = input.bookings.map((b, i) => viewOf(b, i, input.tz)).filter((b): b is BookingView => b !== null);

  // Pass 1: every slot kept as usual, and the bookings that kept them.
  const usedAsUsual = new Set<string>();
  const unusual: Slot[] = [];
  for (const s of slots) {
    const kept = bookings.find(
      (b) => !usedAsUsual.has(b.id) && isFor(b, s) && b.dateKey === s.dateKey && near(b.minutes, s.minutes) && trainerOf(b, s) !== "other",
    );
    if (kept) usedAsUsual.add(kept.id);
    else unusual.push(s);
  }

  // Pass 2: what happened to each of the others.
  const findings: SlotFinding[] = [];
  for (const s of unusual) {
    const monday = mondayOf(s.dateKey);
    const sunday = addDays(monday, 6);
    const elsewhere = bookings
      .filter((b) => !usedAsUsual.has(b.id) && isFor(b, s) && b.dateKey >= monday && b.dateKey <= sunday)
      .sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.minutes - b.minutes)[0];
    const other = bookings.find((b) => trainerOf(b, s) === "same" && b.dateKey === s.dateKey && near(b.minutes, s.minutes) && !isFor(b, s));
    const base = { dateKey: s.dateKey, start: s.start, trainerId: s.trainerId, trainerName: s.trainerName, clientId: s.clientId, clientName: s.clientName };
    const movedTo = elsewhere
      ? { dateKey: elsewhere.dateKey, start: elsewhere.start, trainerName: elsewhere.trainerName, sameTrainer: trainerOf(elsewhere, s) !== "other" }
      : undefined;
    if (other) findings.push({ kind: "taken", ...base, takenBy: { clientName: other.clientName || "Another client" }, ...(movedTo ? { movedTo } : {}) });
    else if (movedTo) findings.push({ kind: "moved", ...base, movedTo });
    else findings.push({ kind: "open", ...base });
  }
  findings.sort((a, b) => a.dateKey.localeCompare(b.dateKey) || minutesOf(a.start)! - minutesOf(b.start)! || a.trainerName.localeCompare(b.trainerName));
  return { state: "ready", findings, slots: slots.length };
}

/** A finding whose trainer has the time free: the slot to fill. */
export function isFreeSlot(f: SlotFinding): boolean {
  return f.kind === "open" || f.kind === "moved";
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

export function dayLabel(dateKey: string, tz?: string): string {
  return formatStudioDate(`${dateKey}T12:00:00`, { weekday: "short", month: "short", day: "numeric" }, tz);
}

export function timeLabel(clock: string): string {
  const m = minutesOf(clock);
  return m === null ? clock : minutesToClock(m);
}

/** One sentence per finding. Facts only: nothing here says what to do. */
export function findingSentence(f: SlotFinding, tz?: string): string {
  const trainer = firstName(f.trainerName);
  const when = `${dayLabel(f.dateKey, tz)} at ${timeLabel(f.start)}`;
  const instead = f.movedTo
    ? `${f.clientName} is booked ${f.movedTo.sameTrainer ? "" : `with ${firstName(f.movedTo.trainerName)} `}on ${dayLabel(f.movedTo.dateKey, tz)} at ${timeLabel(f.movedTo.start)} instead.`
    : `${f.clientName} isn't booked for it.`;
  if (f.kind === "taken") return `${f.takenBy!.clientName} is booked in ${f.clientName}'s ${when} slot with ${trainer}. ${instead}`;
  return `${trainer}'s ${when} is open: ${instead}`;
}

/** What the panel says when it has no findings to list. */
export function stateSentence(check: WeekCheck): string {
  switch (check.state) {
    case "nothing-agreed":
      return "No standing week is agreed yet. Once a leader agrees one, its slots are checked against the week's bookings here.";
    case "unconnected":
      return "Mindbody isn't connected for this studio, so the week can't be checked against bookings.";
    case "loading":
      return "Reading the week's bookings…";
    case "failed":
      return "The week's bookings couldn't be read just now, so nothing here says a slot is open. It tries again on its own.";
    case "ready":
      return check.slots === 0
        ? "No agreed regular falls in the next seven days."
        : `All ${check.slots} agreed ${check.slots === 1 ? "slot is" : "slots are"} booked as usual for the next seven days.`;
  }
}
