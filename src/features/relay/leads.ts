/**
 * WHO LEADS THIS STUDIO — for the Planner's leader-only parts.
 *
 * Round: Planner rework, Sep 2026. The Team tab, posting a team job and
 * changing its people are a leader's acts, and firestore.rules allows them to
 * administrators, franchise owners, and the leaders OF THAT STUDIO (home or
 * owned — `isStudioOwnerOrHeadTrainer(studioId)`). A head trainer visiting
 * another studio is a trainer there, so the buttons must follow the studio
 * the iPad is standing in, not the role alone — otherwise the screen offers
 * what the database refuses. Renewals already answers exactly this question.
 */

import type { Trainer } from "../../types";
import { canManageRenewals } from "../renewals/permissions";

export function leadsHere(t: Trainer | null | undefined, studioId: string | null | undefined): boolean {
  return canManageRenewals(t, studioId);
}
