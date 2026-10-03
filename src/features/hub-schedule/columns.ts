/**
 * WHICH COLUMN A BOOKING GOES IN (hub fixes, Oct 1 2026). Pure: columns.test.ts.
 *
 * AJ, on the Screen Atlas's list of what looks off on the Hub: "these very
 * much need to be addressed." The Hub used to find a booking's column by the
 * trainer's NAME as well as the id, down to a first name alone, so two
 * Chrises could swap columns; and a booking whose staff name was blank or a
 * placeholder ("Select…") was counted in the day's sessions but drawn in no
 * column at all.
 *
 * The rule now, the standing week check's own order (standing-week/check.ts,
 * WHOSE BOOKING; KNOWN-TRAPS "Staff ids are per site on schedule rows too"):
 *
 *   1. A "{studio} Rotation" booking is nobody's in particular: Unassigned.
 *   2. The booking's trainer id decides (the sync and the webhook matched the
 *      Mindbody staff member to a Journey trainer AT THIS STUDIO), when that
 *      trainer is one the Hub knows.
 *   3. With no trainer id, the Mindbody staff id, only as a positive match
 *      and only for a trainer whose staff id is this studio's site's
 *      (`staffIdsAt`): staff ids are numbered per site.
 *   4. Anything else is Unassigned — never matched by a name.
 *
 * Nothing counted is ever dropped: every client booking lands in a trainer's
 * column or in Unassigned, the last column, which shows only when it holds
 * something. Mindbody's "Unavailable" (a trainer's blocked time, never a
 * booking: isStaffBlock) goes in its trainer's column, and is left off the
 * grid when it is nobody's.
 *
 * Which trainers have a column: on a day with bookings, every trainer with a
 * client booking that day (a trainer hidden from the calendar still gets a
 * column for a booking of theirs, so it is never dropped); on an empty day,
 * the studio's visible trainers. Yours first.
 */
import { isStaffBlock } from "../../lib/booking-state";
import { isRotationName } from "../standing-week/check";

/** The Unassigned column's id. No trainer document has it. */
export const UNASSIGNED_ID = "__unassigned__";

export interface ColumnTrainer {
  id?: string;
  isVisibleOnCalendar?: boolean;
  primaryHomeStudioId?: string | null;
  accessibleStudioIds?: string[] | null;
  activeGuestStudioIds?: string[] | null;
}

export interface ColumnBooking {
  trainerId?: unknown;
  trainerName?: string | null;
  mindbodyStaffId?: unknown;
  studioId?: string | null;
  clientName?: string | null;
}

const idOf = (v: unknown): string | null => {
  const id = typeof v === "number" ? String(v) : typeof v === "string" ? v.trim() : "";
  return id === "" ? null : id;
};

/**
 * The column a booking goes in: a trainer's id, UNASSIGNED_ID, or null for
 * Mindbody's "Unavailable" with no trainer (not a booking; drawn nowhere).
 *
 * @param trainerIds the trainers the Hub knows (trainers/{id}).
 * @param staffIds each trainer's Mindbody staff id at this studio's site, by
 *   trainer id (`staffIdsAt`).
 */
export function columnIdOf(
  b: ColumnBooking,
  trainerIds: ReadonlySet<string>,
  staffIds: Readonly<Record<string, string>> = {},
): string | null {
  const fallback = isStaffBlock(b) ? null : UNASSIGNED_ID;
  if (isRotationName(b.trainerName)) return fallback;
  const trainerId = idOf(b.trainerId);
  if (trainerId) return trainerIds.has(trainerId) ? trainerId : fallback;
  const staffId = idOf(b.mindbodyStaffId);
  if (staffId) {
    const matches = Object.keys(staffIds).filter((t) => staffIds[t] === staffId && trainerIds.has(t));
    // One trainer, or it proves nothing: two trainers claiming one staff id
    // is a roster to fix, not a column to guess.
    if (matches.length === 1) return matches[0];
  }
  return fallback;
}

/**
 * The staff name an Unassigned card may say ("Booked with Samuel Lee"):
 * Mindbody's own, whole, or nothing for a blank or a placeholder ("Select a
 * staff member") — a placeholder is not somebody.
 */
export function staffLabel(name: string | null | undefined): string | null {
  const n = (name ?? "").trim().replace(/\s+/g, " ");
  if (!n || /^select\b/i.test(n) || /unavailab/i.test(n)) return null;
  return n;
}

/** On the calendar at this studio: visible, and home, also works here, or a guest. */
export function worksHereOnCalendar(t: ColumnTrainer, studioId: string | null | undefined): boolean {
  if (t.isVisibleOnCalendar === false) return false;
  if (!studioId) return true;
  return (
    t.primaryHomeStudioId === studioId ||
    (t.accessibleStudioIds ?? []).includes(studioId) ||
    (t.activeGuestStudioIds ?? []).includes(studioId)
  );
}

export interface ColumnPlan<T> {
  /** The trainers with a column, in order: yours first. */
  trainers: T[];
  /** Client bookings with no trainer's column: the Unassigned column shows when this is above 0. */
  unassigned: number;
  /** The column of each booking handed in (same order); null: not drawn. */
  columnOf: Array<string | null>;
}

/**
 * The day's columns.
 *
 * @param bookings the day's bookings at this studio, cancellations already out.
 * @param selfId the signed-in trainer's id (trainers/{id}): their column first.
 */
export function planColumns<T extends ColumnTrainer>(input: {
  trainers: readonly T[];
  bookings: readonly ColumnBooking[];
  studioId?: string | null;
  staffIds?: Readonly<Record<string, string>>;
  selfId?: string | null;
}): ColumnPlan<T> {
  const { trainers, studioId = null, staffIds = {}, selfId = null } = input;
  const byId = new Map<string, T>();
  for (const t of trainers) if (t.id) byId.set(String(t.id), t);
  const ids = new Set(byId.keys());

  const here = (b: ColumnBooking) => !studioId || !b.studioId || b.studioId === studioId;
  const columnOf = input.bookings.map((b) => (here(b) ? columnIdOf(b, ids, staffIds) : null));

  const booked = new Set<string>();
  let unassigned = 0;
  input.bookings.forEach((b, i) => {
    const col = columnOf[i];
    if (col === null || isStaffBlock(b)) return;
    if (col === UNASSIGNED_ID) unassigned += 1;
    else booked.add(col);
  });

  let list: T[] =
    booked.size > 0 || unassigned > 0
      ? trainers.filter((t) => t.id && booked.has(String(t.id)))
      : trainers.filter((t) => worksHereOnCalendar(t, studioId));
  // A day whose only bookings are Unassigned still shows the studio's trainers.
  if (list.length === 0 && unassigned > 0) list = trainers.filter((t) => worksHereOnCalendar(t, studioId));

  const me = selfId ? list.findIndex((t) => String(t.id) === String(selfId)) : -1;
  if (me > 0) list = [list[me], ...list.filter((_, i) => i !== me)];

  // A staff block goes in its trainer's column only when that trainer has one.
  const shown = new Set(list.map((t) => String(t.id)));
  const placed = columnOf.map((c) => (c === null || c === UNASSIGNED_ID || shown.has(c) ? c : null));
  return { trainers: list, unassigned, columnOf: placed };
}

/**
 * THE ORDER OF THE DAY'S COLUMNS (AJ, Oct 3 2026: "it should always show
 * that day's sessions first, prioritizing the trainer logged in if they have
 * sessions, but if not always show the trainer with sessions first"). A day
 * whose bookings were all on the studio rotation listed six empty trainers
 * and put the one column with sessions, Unassigned, last.
 *
 *   1. yours, when it has sessions;
 *   2. every other column with sessions, Unassigned included, in the order
 *      they came;
 *   3. the empty columns, yours first among them.
 */
export function orderColumnsBySessions<C extends { id: string; isMe: boolean; count: number }>(cols: readonly C[]): C[] {
  const busy = cols.filter((c) => c.count > 0);
  const empty = cols.filter((c) => c.count === 0);
  const meFirst = (list: C[]) => [...list.filter((c) => c.isMe), ...list.filter((c) => !c.isMe)];
  return [...meFirst(busy), ...meFirst(empty)];
}
