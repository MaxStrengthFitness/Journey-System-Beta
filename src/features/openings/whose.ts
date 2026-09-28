/**
 * WHOSE BOOKING IT IS (Openings, docs/rounds/2026-09-27-openings.md, "Whose
 * booking it is").
 *
 * The standing week check's own rule, so Openings and the check can't
 * disagree: `trainerOf` in standing-week/check.ts, exported and reused, not
 * copied. In order:
 *
 *   1. A "{studio} Rotation" booking is the rotation's: booked, but for
 *      nobody in particular. It takes one free trainer's place without
 *      saying whose (AJ: rotation is context).
 *   2. The booking's trainer id, when the sync matched the staff member to a
 *      Journey trainer at this studio: that trainer's (trainers/{id}, what
 *      a standing week's `trainerId` carries, never the sign-in id).
 *   3. The Mindbody staff id, only as a positive match, and only for a
 *      trainer whose Mindbody link is on this studio's site (`staffIdsAt`).
 *   4. The same staff name.
 *
 * A name that differs proves nothing, and neither does a booking that names
 * no staff member: Journey can't place it with any trainer, and a day that
 * holds one can't be judged for room (room.ts). Two trainers who answer to
 * the same name are no answer either, unless one staff id picks one out.
 *
 * PURE MODULE: the Sunday job imports it.
 */
import type { ScheduleEntry } from "../../types";
import { isRotationName, trainerOf } from "../standing-week/check";

/** A trainer as the placing rule reads them. */
export interface TrainerRef {
  /** trainers/{id}: what a booking's `trainerId` carries. */
  id: string;
  name: string;
  /** Their Mindbody staff id at this studio's site (`staffIdsAt`), when known. */
  staffId?: string | null;
}

export type Place = { kind: "trainer"; trainerId: string } | { kind: "rotation" } | { kind: "unplaced" };

const staffIdOf = (v: unknown): string | null => {
  const id = typeof v === "number" ? String(v) : typeof v === "string" ? v.trim() : "";
  return id === "" ? null : id;
};

/** The trainers a studio's bookings are placed among, from its trainer list and `staffIdsAt`. */
export function trainerRefs(
  trainers: readonly { id?: string; name?: string | null }[],
  staffIds: Readonly<Record<string, string>> = {},
): TrainerRef[] {
  return trainers
    .filter((t): t is { id: string; name?: string | null } => typeof t.id === "string" && t.id !== "")
    .map((t) => ({ id: t.id, name: typeof t.name === "string" ? t.name : "", staffId: staffIdOf(staffIds[t.id]) }));
}

/** Where a booking goes: a trainer, the rotation, or nowhere Journey can prove. */
export function placeBooking(
  entry: Pick<ScheduleEntry, "trainerId" | "trainerName"> & { mindbodyStaffId?: unknown },
  trainers: readonly TrainerRef[],
): Place {
  if (isRotationName(entry.trainerName)) return { kind: "rotation" };
  const trainerId = typeof entry.trainerId === "string" ? entry.trainerId.trim() : "";
  // The id decides, exactly as trainerOf lets it: matched at this studio by the sync.
  if (trainerId) return { kind: "trainer", trainerId };
  const view = { trainerName: entry.trainerName ?? "", trainerId: null, staffId: staffIdOf(entry.mindbodyStaffId) };
  const same = trainers.filter((t) => trainerOf(view, { trainerId: t.id, trainerName: t.name, staffId: t.staffId ?? null }) === "same");
  if (same.length === 1) return { kind: "trainer", trainerId: same[0].id };
  if (same.length > 1 && view.staffId) {
    const byStaffId = same.filter((t) => t.staffId === view.staffId);
    if (byStaffId.length === 1) return { kind: "trainer", trainerId: byStaffId[0].id };
  }
  return { kind: "unplaced" };
}
