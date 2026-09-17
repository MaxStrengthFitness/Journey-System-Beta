import type { ReactNode } from "react";
import type { Trainer } from "../../../types";
import { isEveryStudioRole } from "../../renewals/permissions";
import { leadsHere } from "../leads";

/**
 * ROLE GATE — who sees a Relay surface.
 *
 * Round: Relay, Sep 2026. Two tiers above the floor:
 *
 *   leads    studio leaders and head trainers OF THE STUDIO THE iPAD IS IN
 *            (planner/leads.ts, the same answer the teamJobs rules give);
 *   network  franchise owners, founders and administrators — the people whose
 *            role reaches every studio.
 *
 * Hiding a surface is a convenience, never the security boundary: the rules
 * decide what anyone can read or write. This just keeps a trainer from being
 * offered a button that would be refused.
 */
export type RelayTier = "leads" | "network";

export function reachesTier(
  trainer: Trainer | null | undefined,
  studioId: string | null | undefined,
  tier: RelayTier,
): boolean {
  if (tier === "network") return isEveryStudioRole(trainer);
  return leadsHere(trainer, studioId);
}

export function RoleGate({
  trainer,
  studioId,
  tier,
  children,
  otherwise = null,
}: {
  trainer: Trainer | null | undefined;
  studioId: string | null | undefined;
  tier: RelayTier;
  children: ReactNode;
  otherwise?: ReactNode;
}) {
  return <>{reachesTier(trainer, studioId, tier) ? children : otherwise}</>;
}
