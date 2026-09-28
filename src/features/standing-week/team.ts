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
import { worksHere } from "../../lib/who-works-here";
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
 *
 * The practice studio adds one group: anyone who has written a week there.
 * Demo Mode lets everyone act (present.ts worksAt, the rules' trainerWorksAt),
 * so a real trainer practising there may propose a week on My Profile, and
 * it is theirs to have agreed — listed on the team, never as someone who "no
 * longer works at Demo Studio". Only people WITH a practice week are added,
 * so the list never becomes the whole company (the realm rule).
 */
export function teamWeeks(trainers: readonly TrainerLike[], docs: readonly StandingWeekDoc[], studioId: string | null): TeamWeekRow[] {
  if (!studioId) return [];
  const demo = isDemoStudioId(studioId);
  const byUid = new Map(docs.map((d) => [d.id, d]));
  const byTrainerId = new Map(docs.filter((d) => d.trainerId).map((d) => [d.trainerId, d]));
  const used = new Set<string>();

  const practisesHere = (t: TrainerLike): boolean =>
    demo &&
    Boolean(t.id) &&
    t.isActive !== false &&
    !t.supersededByUid &&
    !t.pendingClaim &&
    (byUid.has(uidOf(t)) || byTrainerId.has(t.id));

  const listed = trainers
    // Everyone who works there (AJ): the one rule, lib/who-works-here.ts. Not
    // present.ts's worksAt, which answers "may this person act here" and says
    // yes to everyone at the Demo studio — as a list, that was the whole company.
    .filter((t) => worksHere(t, studioId) || practisesHere(t));
  // A week found by its trainer id (an older account's) is never one that is
  // another listed person's own week: two rows would claim one document, and
  // agreeing it from the wrong row would point it at the wrong bookings.
  const listedUids = new Set(listed.map(uidOf));
  const weekOf = (t: TrainerLike): StandingWeekDoc | null => {
    const own = byUid.get(uidOf(t));
    if (own) return own;
    const byId = byTrainerId.get(t.id);
    return byId && !listedUids.has(byId.id) ? byId : null;
  };

  const staff = listed
    .map((t): TeamWeekRow => {
      const doc = weekOf(t);
      if (doc) used.add(doc.id);
      return { uid: doc?.id ?? uidOf(t), trainerId: t.id, name: t.fullName?.trim() || doc?.trainerName || "A trainer", doc, status: weekStatus(doc), onStaff: true };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  // At the practice studio nobody is told they no longer work there: a week
  // whose trainer document isn't loaded is still someone practising.
  const leftBehind = docs
    .filter((d) => !used.has(d.id))
    .map((d): TeamWeekRow => ({ uid: d.id, trainerId: d.trainerId, name: d.trainerName || "A trainer", doc: d, status: weekStatus(d), onStaff: demo }))
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
