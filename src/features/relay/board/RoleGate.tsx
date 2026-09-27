import type { ReactNode } from "react";
import type { Trainer } from "../../../types";
import { leadsHere } from "../leads";

/**
 * ROLE GATE — who sees a Relay surface.
 *
 * Round: Relay, Sep 2026. One tier above the floor:
 *
 *   leads    studio leaders and head trainers OF THE STUDIO THE iPAD IS IN
 *            (relay/leads.ts, the same answer the teamJobs rules give).
 *
 * There was a second, "network" (franchise owners and the company), for
 * Relay's Network tab. That moved to Operations → All my studios in the
 * voice-review round (Sep 27 2026), which asks admin/network/
 * network-actions.ts instead.
 *
 * Hiding a surface is a convenience, never the security boundary: the rules
 * decide what anyone can read or write. This just keeps a trainer from being
 * offered a button that would be refused.
 */
export type RelayTier = "leads";

/** Whether the trainer reaches a tier here. One tier today; the name stays for the call sites. */
export function reachesTier(
  trainer: Trainer | null | undefined,
  studioId: string | null | undefined,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  tier: RelayTier,
): boolean {
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
