/**
 * WHO CAN DO WHAT IN LEARNING — mirrors of the rules, for the buttons.
 *
 * Round: Learning + Planner, Sep 2026.
 *
 * A button the rules will refuse is worse than no button: the trainer taps
 * it, fills in a page, and gets "permission denied" at the end. Before this
 * round the Academy showed "New page" to anyone `isStudioLeader` called a
 * leader — which includes Owner and FranchiseOwner — while the rule for
 * studios/{s}/wiki pages accepts only super admins and the studio's own
 * StudioOwner / HeadTrainer / StudioLeader. Franchise owners saw the button
 * and could never use it.
 *
 * Each function here names the rule it mirrors. If the rule changes, this
 * file changes with it, in the same commit.
 *
 * PURE MODULE — no React, no Firestore.
 */

import type { Trainer } from "../../types";

type TrainerLike =
  | (Pick<Trainer, "role" | "primaryHomeStudioId" | "ownedStudioIds"> &
      Partial<Pick<Trainer, "accessibleStudioIds" | "activeGuestStudioIds">>)
  | null
  | undefined;

const SUPER_ROLES = new Set(["Admin", "Founder", "Overseer"]);
const STUDIO_LEADER_ROLES = new Set(["StudioOwner", "HeadTrainer", "StudioLeader"]);
const FRANCHISE_ROLES = new Set(["FranchiseOwner", "Owner"]);

/** firestore.rules isSuperAdmin(). */
export function isSuperRole(trainer: TrainerLike): boolean {
  return Boolean(trainer?.role && SUPER_ROLES.has(trainer.role));
}

/**
 * firestore.rules isStudioOwnerOrHeadTrainerOnly(studioId): a studio-leader
 * role, AT that studio (home or owned). Franchise owners are not in it.
 */
export function leadsStudioPerRules(trainer: TrainerLike, studioId: string | null | undefined): boolean {
  if (!trainer || !studioId || !trainer.role || !STUDIO_LEADER_ROLES.has(trainer.role)) return false;
  return (
    trainer.primaryHomeStudioId === studioId || (trainer.ownedStudioIds ?? []).includes(studioId)
  );
}

/**
 * firestore.rules isTrainerOfStudioOnly(studioId): the studio is their home,
 * one they can reach, or one they are a guest at.
 */
export function worksAtStudioPerRules(trainer: TrainerLike, studioId: string | null | undefined): boolean {
  if (!trainer || !studioId) return false;
  return (
    trainer.primaryHomeStudioId === studioId ||
    (trainer.accessibleStudioIds ?? []).includes(studioId) ||
    (trainer.activeGuestStudioIds ?? []).includes(studioId)
  );
}

/**
 * firestore.rules writesForStudio(studioId): machine notes, the upkeep log,
 * playbook tips, studio notes on pages, and comments. Someone who works at or
 * runs the studio, a franchise owner, or a super admin.
 */
export function writesForStudioPerRules(trainer: TrainerLike, studioId: string | null | undefined): boolean {
  if (!trainer || !studioId) return false;
  return (
    isSuperRole(trainer) ||
    Boolean(trainer.role && FRANCHISE_ROLES.has(trainer.role)) ||
    leadsStudioPerRules(trainer, studioId) ||
    worksAtStudioPerRules(trainer, studioId)
  );
}

/**
 * May write the studio's own pages (studios/{s}/wiki, kind "page").
 * Rule: isSuperAdmin() || isStudioOwnerOrHeadTrainer(studioId).
 */
export function canWriteStudioPages(trainer: TrainerLike, studioId: string | null | undefined): boolean {
  if (!studioId) return false;
  return isSuperRole(trainer) || leadsStudioPerRules(trainer, studioId);
}
