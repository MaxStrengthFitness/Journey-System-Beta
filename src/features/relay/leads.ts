/**
 * WHO LEADS THIS STUDIO — for My Studio's leader section (Team), the leader
 * half of Machines and of Studio (everyone who works there reads Studio, the
 * voice review notes of Sep 28 2026; only this answer changes it), and
 * Relay's leader acts (posting a team job, assigning a shift task).
 *
 * Round: Planner rework, Sep 2026. Those are a leader's acts, and
 * firestore.rules allows them to administrators, franchise owners, and the
 * leaders OF THAT STUDIO — a leader role (head trainer, studio leader,
 * studio owner) at their home or an owned studio, or a trainer the studio's
 * leadership gave THE GRANT for it (`managedStudioIds`, My Studio round) —
 * `isStudioOwnerOrHeadTrainer(studioId)` / `trainerLeads`. A head trainer
 * visiting another studio is a trainer there, so the buttons must follow the
 * studio the iPad is standing in, not the role alone — otherwise the screen
 * offers what the database refuses. Inside Demo Mode everyone leads. Renewals
 * already answers exactly this question (renewals/permissions.ts).
 */

import type { Trainer } from "../../types";
import { canManageRenewals } from "../renewals/permissions";

export function leadsHere(t: Trainer | null | undefined, studioId: string | null | undefined): boolean {
  return canManageRenewals(t, studioId);
}
