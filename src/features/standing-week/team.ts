/**
 * THE STANDING WEEKS ON MY STUDIO → TEAM (voice-review round, Sep 27 2026).
 *
 * Who is listed, and whether the studio's bookings can be checked at all.
 * The list is the studio's trainers BY NAME, never ranked (recognition,
 * never ranking): a leader finds whose proposal is waiting from the line
 * above the list, not from the order of the people in it.
 *
 * PURE MODULE.
 */
import type { Studio, Trainer } from "../../types";
import { isDemoStudioId } from "../demo-mode/is-demo";
import { worksAt } from "./present";
import { weekStatus, type StandingWeekDoc, type WeekStatus } from "./week";

export interface TeamWeekRow {
  /** The document's id: the trainer's Auth uid. */
  uid: string;
  /** trainers/{id} — what a booking's trainerId carries. */
  trainerId: string;
  name: string;
  doc: StandingWeekDoc | null;
  status: WeekStatus;
  /** False for a week whose trainer no longer works at the studio. */
  onStaff: boolean;
}

/** A trainer document as the list reads it. `isActive` is not on the type, but some documents carry it. */
type TrainerLike = Pick<Trainer, "id" | "fullName" | "primaryHomeStudioId" | "accessibleStudioIds" | "activeGuestStudioIds"> &
  Partial<Pick<Trainer, "authUid" | "supersededByUid" | "pendingClaim">> & { isActive?: boolean };

/** The uid a trainer's standing week is kept under: the Auth uid (CLAUDE.md), which older accounts keep in `authUid`. */
export const uidOf = (t: Pick<Trainer, "id"> & Partial<Pick<Trainer, "authUid">>): string => t.authUid || t.id;

/**
 * Everyone who works at the studio, by name, each with their week — then
 * any week left behind by someone who no longer works here, so a leader can
 * clear it. A placeholder nobody has claimed yet has no one to propose, and
 * a superseded account has been replaced, so neither is listed.
 */
export function teamWeeks(trainers: readonly TrainerLike[], docs: readonly StandingWeekDoc[], studioId: string | null): TeamWeekRow[] {
  if (!studioId) return [];
  const byUid = new Map(docs.map((d) => [d.id, d]));
  const byTrainerId = new Map(docs.filter((d) => d.trainerId).map((d) => [d.trainerId, d]));
  const used = new Set<string>();

  const staff = trainers
    .filter((t) => t.id && worksAt(t, studioId) && t.isActive !== false && !t.supersededByUid && !t.pendingClaim)
    .map((t): TeamWeekRow => {
      const doc = byUid.get(uidOf(t)) ?? byTrainerId.get(t.id) ?? null;
      if (doc) used.add(doc.id);
      return { uid: doc?.id ?? uidOf(t), trainerId: t.id, name: t.fullName?.trim() || doc?.trainerName || "A trainer", doc, status: weekStatus(doc), onStaff: true };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const leftBehind = docs
    .filter((d) => !used.has(d.id))
    .map((d): TeamWeekRow => ({ uid: d.id, trainerId: d.trainerId, name: d.trainerName || "A trainer", doc: d, status: weekStatus(d), onStaff: false }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return [...staff, ...leftBehind];
}

/** The people whose proposal is waiting to be agreed, by name. */
export function waitingOnALeader(rows: readonly TeamWeekRow[]): TeamWeekRow[] {
  return rows.filter((r) => r.onStaff && (r.status === "proposed" || r.status === "changed"));
}

/** "Sam and Ann proposed a week to agree." — nothing when nobody is waiting. */
export function waitingSentence(rows: readonly TeamWeekRow[]): string | null {
  const waiting = waitingOnALeader(rows).map((r) => r.name.trim().split(/\s+/)[0] || r.name);
  if (waiting.length === 0) return null;
  const names =
    waiting.length === 1 ? waiting[0] : waiting.length === 2 ? `${waiting[0]} and ${waiting[1]}` : `${waiting.slice(0, -1).join(", ")} and ${waiting[waiting.length - 1]}`;
  return `${names} ${waiting.length === 1 ? "has" : "have"} a week waiting to be agreed.`;
}

/**
 * The studio's bookings come from Mindbody, so the week can be checked only
 * where Mindbody is linked. A studio deliberately without it ("offline"), or
 * one whose Site ID is blank, is told so instead of being shown every slot
 * as open. The Demo studio's week is seeded, so it can be checked.
 */
export function bookingsKnown(studio: Pick<Studio, "id"> & Partial<Pick<Studio, "mindbodySiteId" | "mindbodyMode">> | null | undefined): boolean {
  if (!studio) return false;
  if (isDemoStudioId(studio.id)) return true;
  return String(studio.mindbodySiteId ?? "").trim() !== "" && studio.mindbodyMode !== "offline";
}
