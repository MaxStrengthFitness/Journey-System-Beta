/**
 * Who may see and do what with renewals — the same answers firestore.rules
 * gives, so a button is never offered that the database will refuse.
 *
 *   Trainers (Life Transformers): the renewal chip and card on clients they
 *     can open, and logging a conversation.
 *   Studio leaders (StudioLeader, HeadTrainer, StudioOwner) of THIS studio:
 *     all of the above, plus the Operations → Renewals pipeline, stage, lead
 *     and outcome, the studio's renewal settings, and per-trainer renewal
 *     rates (AJ, Sep 10: rates are for studio leaders only).
 *   Franchise owners and administrators: everything, at every studio.
 *
 * See docs/business/roles-and-permissions.md.
 */

import type { Trainer } from "../../types";
import { hasRunOfDemo } from "../demo-mode/access";

const SUPER = new Set(["Admin", "Founder", "Overseer"]);
const FRANCHISE = new Set(["FranchiseOwner", "Owner"]);
const LEADER = new Set(["StudioLeader", "HeadTrainer", "StudioOwner"]);

type TrainerLike = Pick<
  Trainer,
  "role" | "primaryHomeStudioId" | "accessibleStudioIds" | "activeGuestStudioIds" | "ownedStudioIds"
> &
  Partial<Pick<Trainer, "managedStudioIds">>;

export function isEveryStudioRole(t: TrainerLike | null | undefined): boolean {
  return Boolean(t && (SUPER.has(t.role) || FRANCHISE.has(t.role)));
}

/** Works at this studio (home, accessible or guest). Mirrors trainerWorksAt(). */
export function worksAt(t: TrainerLike | null | undefined, studioId: string | null | undefined): boolean {
  if (!t || !studioId) return false;
  return (
    t.primaryHomeStudioId === studioId ||
    (t.accessibleStudioIds ?? []).includes(studioId) ||
    (t.activeGuestStudioIds ?? []).includes(studioId)
  );
}

/**
 * Runs this studio. Mirrors trainerLeads(): a studio-leader role at their
 * home or an owned studio -- or, since the My Studio round (Sep 2026), any
 * trainer the studio's leadership has granted `managedStudioIds` for it.
 */
export function leadsStudio(t: TrainerLike | null | undefined, studioId: string | null | undefined): boolean {
  if (!t || !studioId) return false;
  if ((t.managedStudioIds ?? []).includes(studioId)) return true;
  if (!LEADER.has(t.role)) return false;
  return t.primaryHomeStudioId === studioId || (t.ownedStudioIds ?? []).includes(studioId);
}

/**
 * The pipeline, stage / lead / outcome, settings and per-trainer rates.
 *
 * The demo clause is authorisation only -- everyone has the run of Demo Mode
 * (features/demo-mode/access.ts). Membership above is untouched, so the team
 * lists built by filtering all trainers through worksAt() still show Demo
 * Mode's own three trainers rather than the whole company.
 */
export function canManageRenewals(t: TrainerLike | null | undefined, studioId: string | null | undefined): boolean {
  return isEveryStudioRole(t) || leadsStudio(t, studioId) || hasRunOfDemo(t, studioId);
}

/** Reading a studio's renewal cycles and settings, and logging a conversation. */
export function canTakePartInRenewals(t: TrainerLike | null | undefined, studioId: string | null | undefined): boolean {
  return canManageRenewals(t, studioId) || worksAt(t, studioId);
}
