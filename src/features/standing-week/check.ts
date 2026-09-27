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
 *   moved      the regular's slot went somewhere Journey can PROVE: Mindbody
 *              moved that very booking (`movedFromStart`), or she is booked
 *              at her time with another trainer, or her booking for the slot
 *              was cancelled and a REAL rebook followed that Monday–Sunday
 *              week — the trainer's slot is free
 *   open       the regular isn't booked for it — the slot is free
 *   taken      another client is booked with the trainer in the slot
 *
 * A REAL REBOOK is the Changes list's rule, which the client calendar reads
 * too (admin/changes/changes.ts, `isRealRebook`; AJ, Sep 26 2026): the other
 * booking first appeared around or after the cancellation, and had not
 * already happened by then. Any other booking that week is NOT called her
 * reschedule — a twice-a-week client's standing Thursday was booked all
 * along, and "booked Thursday instead" would be a confident wrong claim. So
 * without proof, the slot is simply open. A cancelled booking is no booking.
 * Only the days read are judged: nothing here claims she "isn't booked that
 * week", only that she isn't booked FOR THE SLOT.
 *
 * WHOSE BOOKING. The schedule sync writes a trainer's id when it matched the
 * Mindbody staff member to a Journey trainer, and only the staff member's
 * name when it didn't (lib/mindbody-api-sync.ts); the webhook also keeps the
 * Mindbody staff id (`mindbodyStaffId`). So, in order: where the booking and
 * the trainer both carry a Mindbody staff id, that decides; else the
 * booking's trainer id; else the name. A booking that names no staff member
 * (the sync's "{studio} Rotation") is nobody's in particular: it may keep a
 * slot, but it never takes one. The client is matched by id when the sync
 * linked one, else by name — the Overview's rule again.
 *
 * A NAME THAT DOESN'T MATCH PROVES NOTHING. The sync already tried the
 * trainer's exact full name before it fell back to the staff member's own
 * (Journey "Sam Lee", Mindbody "Samuel Lee"), so a booking with no trainer id
 * whose name differs is as likely the trainer's as anyone's. At the
 * regular's own slot and time it keeps the slot, like a Rotation booking,
 * rather than calling the trainer's whole week moved: a confident wrong
 * claim is worse than silence (CLAUDE.md).
 *
 * THE STUDIO ROTATION (AJ, Sep 27 2026). "Some studios use a 'studio
 * rotation' to book Wednesdays and Saturdays and rotate a trainer each week
 * ... any client can schedule that day on mind body and then whatever
 * trainer works that day can just move those sessions to them." A regular
 * booked "{studio} Rotation" at her time is as usual: never moved, never
 * taken, never a Free slot.
 *
 * AWAY. A trainer's days away (week.ts) are not checked at all: no open,
 * moved or taken, no Free slot, and not counted among the slots. The panel
 * says once that they are away (`awayThisWeek`), which is the whole story:
 * there is nothing to fill while they are gone.
 *
 * ONE BOOKING, ONE CLAIM. A booking that kept one agreed slot as usual never
 * explains another; a rebook named as one slot's move is never named for a
 * second; and another regular's own booking at a shared time never "takes"
 * the slot. Past slots earlier today are simply open, like any other (AJ:
 * "Unbooked slots are just open").
 *
 * WHEN IT SAYS NOTHING. A failed or unfinished read, or a studio whose
 * Mindbody isn't connected, gives a state and no findings: an unread day is
 * "can't tell", never "open". An answer only this iPad's cache gave is not a
 * read (server-read.ts): offline, the check says so in its own sentence.
 *
 * PURE MODULE.
 */
import type { ScheduleEntry } from "../../types";
import { formatStudioDate, studioDateKey, toDate, zonedHM } from "../../lib/studio-time";
import { scheduleStart } from "../../lib/schedule-window";
import { isRealRebook } from "../admin/changes/changes";
import { addDays, weekdayOf } from "../studio-tasks/recurrence";
import { minutesToClock } from "../relay/board/now-context";
import type { ServerRead } from "./server-read";
import { awayOn, minutesOf, type StandingWeekDoc } from "./week";

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

export type WeekCheckState = "ready" | "loading" | "failed" | "offline" | "unconnected" | "nothing-agreed";

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
  /** Whether the bookings were read (server-read.ts): only "ready" is an answer. */
  read: ServerRead;
  /** The studio's Mindbody is linked (or it is the Demo studio, whose week is seeded). */
  connected: boolean;
  /** Each trainer's Mindbody staff id, by trainers/{id}: where a booking carries one too, it decides whose booking it is. */
  staffIds?: Readonly<Record<string, string>>;
}

interface BookingView {
  id: string;
  cancelled: boolean;
  /** The booking's start, the instant: a rebook starts after the cancellation. */
  startAt: Date;
  dateKey: string;
  minutes: number;
  start: string;
  clientId: string | null;
  clientName: string;
  trainerId: string | null;
  trainerName: string;
  /** The Mindbody staff id, where the webhook kept one. */
  staffId: string | null;
  /** When Journey first wrote the row: what tells a real rebook from a standing booking. */
  createdAt: unknown;
  /** Stamped by the pull or the webhook when Journey saw the cancellation. */
  cancelledAt: Date | null;
  /** Where Mindbody moved this booking FROM (the sync's change stamps). */
  movedFrom: { dateKey: string; minutes: number } | null;
}

const staffIdOf = (v: unknown): string | null => {
  const id = typeof v === "number" ? String(v) : typeof v === "string" ? v.trim() : "";
  return id === "" ? null : id;
};

const clockOfHM = (hm: { hour: number; minute: number }) => `${String(hm.hour).padStart(2, "0")}:${String(hm.minute).padStart(2, "0")}`;

function viewOf(entry: ScheduleEntry, index: number, tz?: string): BookingView | null {
  const at = scheduleStart(entry);
  if (!at) return null;
  const dateKey = studioDateKey(at, tz);
  const hm = zonedHM(at, tz);
  if (!dateKey || !hm) return null;
  const was = toDate(entry.movedFromStart ?? null);
  const wasDay = was ? studioDateKey(was, tz) : null;
  const wasHM = was ? zonedHM(was, tz) : null;
  return {
    id: entry.id ?? `row-${index}`,
    cancelled: entry.status === "Cancelled",
    startAt: at,
    dateKey,
    minutes: hm.hour * 60 + hm.minute,
    start: clockOfHM(hm),
    clientId: entry.clientId || null,
    clientName: entry.clientName || "",
    trainerId: entry.trainerId || null,
    trainerName: entry.trainerName || "",
    staffId: staffIdOf((entry as { mindbodyStaffId?: unknown }).mindbodyStaffId),
    createdAt: entry.createdAt ?? null,
    cancelledAt: toDate(entry.cancelledAt ?? null),
    movedFrom: wasDay && wasHM ? { dateKey: wasDay, minutes: wasHM.hour * 60 + wasHM.minute } : null,
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
  /** The trainer's Mindbody staff id, when the roster has one. */
  staffId: string | null;
  clientId: string;
  clientName: string;
}

const near = (a: number, b: number) => Math.abs(a - b) <= SLOT_TOLERANCE_MINUTES;
const norm = (v: string | null | undefined) => (v ?? "").trim().replace(/\s+/g, " ").toLowerCase();

/**
 * The booking's trainer against the slot's (WHOSE BOOKING above):
 *
 *   same      the trainer's, by staff id, trainer id or name
 *   other     provably someone else's: another staff id or trainer id
 *   unknown   nobody's in particular: no staff named (a Rotation booking)
 *   unlinked  a staff member Journey couldn't link, under another name —
 *             proves nothing either way
 */
type Whose = "same" | "other" | "unknown" | "unlinked";

function trainerOf(b: BookingView, s: Slot): Whose {
  if (b.staffId && s.staffId) return b.staffId === s.staffId ? "same" : "other";
  if (b.trainerId) return b.trainerId === s.trainerId ? "same" : "other";
  const name = norm(b.trainerName);
  if (!name || name.endsWith(" rotation")) return "unknown";
  return name === norm(s.trainerName) ? "same" : "unlinked";
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
      // Away that day: nothing of theirs is checked (AJ: "it should block it out").
      if (awayOn(doc.away, dateKey)) continue;
      for (const r of doc.final!.regulars) {
        if (r.weekday !== weekday) continue;
        const minutes = minutesOf(r.start);
        if (minutes === null) continue;
        slots.push({
          dateKey,
          start: r.start,
          minutes,
          trainerId: doc.trainerId,
          trainerName: doc.trainerName,
          staffId: staffIdOf(input.staffIds?.[doc.trainerId]),
          clientId: r.clientId,
          clientName: r.clientName,
        });
      }
    }
  }
  const empty = (state: WeekCheckState): WeekCheck => ({ state, findings: [], slots: slots.length });
  if (agreed.length === 0) return empty("nothing-agreed");
  if (!input.connected) return empty("unconnected");
  if (input.read !== "ready") return empty(input.read);

  const rows = input.bookings.map((b, i) => viewOf(b, i, input.tz)).filter((b): b is BookingView => b !== null);
  const bookings = rows.filter((b) => !b.cancelled);
  const cancellations = rows.filter((b) => b.cancelled);

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

  // Pass 2: what happened to each of the others — only what Journey can prove.
  // A booking named as one slot's move is never named for a second.
  const claimed = new Set(usedAsUsual);
  const findings: SlotFinding[] = [];
  for (const s of unusual) {
    const elsewhere = whereItWent(s, bookings, cancellations, claimed);
    if (elsewhere) claimed.add(elsewhere.id);
    // Someone else in the slot — but never another regular in their own slot at a shared time.
    const other = bookings.find(
      (b) => !usedAsUsual.has(b.id) && trainerOf(b, s) === "same" && b.dateKey === s.dateKey && near(b.minutes, s.minutes) && !isFor(b, s),
    );
    const base = { dateKey: s.dateKey, start: s.start, trainerId: s.trainerId, trainerName: s.trainerName, clientId: s.clientId, clientName: s.clientName };
    const whose = elsewhere ? trainerOf(elsewhere, s) : null;
    const movedTo = elsewhere
      ? { dateKey: elsewhere.dateKey, start: elsewhere.start, trainerName: elsewhere.trainerName, sameTrainer: whose === "same" || whose === "unknown" }
      : undefined;
    if (other) findings.push({ kind: "taken", ...base, takenBy: { clientName: other.clientName || "Another client" }, ...(movedTo ? { movedTo } : {}) });
    else if (movedTo) findings.push({ kind: "moved", ...base, movedTo });
    else findings.push({ kind: "open", ...base });
  }
  findings.sort((a, b) => a.dateKey.localeCompare(b.dateKey) || minutesOf(a.start)! - minutesOf(b.start)! || a.trainerName.localeCompare(b.trainerName));
  return { state: "ready", findings, slots: slots.length };
}

/**
 * Where the regular's slot went, when Journey can prove it — else nothing,
 * and the slot is simply open. In order of certainty:
 *
 *   1. Mindbody moved that very booking out of the slot (`movedFromStart`).
 *   2. She is booked at her time that day, with another trainer.
 *   3. Her booking for the slot was cancelled (a stamped cancellation), and
 *      another booking that Monday–Sunday week first appeared around or
 *      after it and starts after it (`isRealRebook`).
 *
 * A booking already keeping one of her other agreed slots, or already named
 * as another slot's move, is never this one's: one booking, one claim.
 */
function whereItWent(s: Slot, bookings: BookingView[], cancellations: BookingView[], used: Set<string>): BookingView | null {
  const free = bookings.filter((b) => !used.has(b.id) && isFor(b, s));
  const moved = free.find((b) => b.movedFrom && b.movedFrom.dateKey === s.dateKey && near(b.movedFrom.minutes, s.minutes));
  if (moved) return moved;
  const withAnother = free.find((b) => b.dateKey === s.dateKey && near(b.minutes, s.minutes));
  if (withAnother) return withAnother;
  const cancelled = cancellations.find((c) => isFor(c, s) && c.dateKey === s.dateKey && near(c.minutes, s.minutes) && c.cancelledAt);
  if (!cancelled) return null;
  const monday = mondayOf(s.dateKey);
  const sunday = addDays(monday, 6);
  return (
    free
      .filter((b) => b.dateKey >= monday && b.dateKey <= sunday && isRealRebook({ createdAt: b.createdAt, startTime: b.startAt }, cancelled.cancelledAt))
      .sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.minutes - b.minutes)[0] ?? null
  );
}

export interface AwayNotice {
  trainerId: string;
  trainerName: string;
  from: string;
  to: string;
}

/**
 * Who is away in the window, once each, by name: every range of days away
 * that overlaps today and the days after it. From every week given, agreed
 * or not — being away needs no agreement.
 */
export function awayThisWeek(docs: readonly StandingWeekDoc[], today: string, days = CHECK_DAYS): AwayNotice[] {
  const last = addDays(today, days - 1);
  const out: AwayNotice[] = [];
  for (const d of docs) {
    for (const r of d.away ?? []) {
      if (r.to < today || r.from > last) continue;
      out.push({ trainerId: d.trainerId, trainerName: d.trainerName, from: r.from, to: r.to });
    }
  }
  return out.sort((a, b) => a.trainerName.localeCompare(b.trainerName) || a.from.localeCompare(b.from));
}

/** "Sam is away Mon, Sep 28 – Fri, Oct 2." — or "until", when it began before today; "on", for one day. */
export function awaySentence(n: AwayNotice, today: string, tz?: string): string {
  const who = firstName(n.trainerName) || "A trainer";
  if (n.from === n.to) return `${who} is away on ${dayLabel(n.from, tz)}.`;
  if (n.from < today) return `${who} is away until ${dayLabel(n.to, tz)}.`;
  return `${who} is away ${dayLabel(n.from, tz)} – ${dayLabel(n.to, tz)}.`;
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
    case "offline":
      return "Can't tell: this iPad can't reach the week's bookings just now, so nothing here says a slot is open. It checks again once it's back online.";
    case "ready":
      return check.slots === 0
        ? "No agreed regular falls in the next seven days."
        : `All ${check.slots} agreed ${check.slots === 1 ? "slot is" : "slots are"} booked as usual for the next seven days.`;
  }
}
