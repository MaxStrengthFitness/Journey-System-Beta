/**
 * WHO OPERATIONS → SETUP → ANNOUNCEMENTS LETS THIS PERSON ADDRESS.
 *
 * A studio's leader addresses the studios they run; an owner adds their
 * network; administrators everyone. That was three lines in the shell until
 * Oct 1 2026, when an administrator inside Demo Mode found the composer
 * starting on "Everyone" and offering every real studio: a practice notice
 * one tap from every trainer's bell.
 *
 * THE REALM RULE (`features/demo-mode/access.ts`): from inside Demo Mode you
 * see Demo Mode and nothing else; from anywhere else you do not see it at all.
 * So inside Demo Mode the only audience is Demo Mode itself — one studio,
 * fixed, no "Everyone", no network — and the list of live notices is only the
 * ones addressed to it. Outside, the demo studio is never offered.
 */

import { DEMO_STUDIO_ID } from "../../demo-mode/constants";
import { isDemoStudioId } from "../../demo-mode/is-demo";
import { studiosInRealm } from "../../demo-mode/access";
import type { AnnouncementScope } from "./audience";

export interface AnnouncementReach<S> {
  studios: S[];
  scopes: AnnouncementScope[];
  /** False hides the network option: no network is offered. */
  networks: boolean;
  /** Set inside Demo Mode: the audience is this studio and the picker is not drawn. */
  fixedStudioId?: string;
}

export function announcementReach<S extends { id?: string; isDemo?: boolean }>({
  isAdmin,
  isOwnerTier,
  allStudios,
  readable,
  activeStudioId,
}: {
  isAdmin: boolean;
  isOwnerTier: boolean;
  /** Every studio the app knows. */
  allStudios: S[];
  /** The studios this person's Operations spans. */
  readable: S[];
  /** The studio the app is standing in, which decides the realm. */
  activeStudioId: string | null | undefined;
}): AnnouncementReach<S> {
  if (isDemoStudioId(activeStudioId ?? null)) {
    return {
      studios: studiosInRealm(allStudios, activeStudioId),
      scopes: ["studio"],
      networks: false,
      fixedStudioId: DEMO_STUDIO_ID,
    };
  }
  return {
    studios: studiosInRealm(isAdmin ? allStudios : readable, activeStudioId),
    scopes: isAdmin ? ["universal", "network", "studio"] : isOwnerTier ? ["network", "studio"] : ["studio"],
    networks: true,
  };
}

/**
 * Whether a notice is addressed to this one studio by name — what the live
 * list shows inside Demo Mode. A notice to everyone or to a network is a real
 * one and is not shown there.
 */
export function addressedTo(
  a: { targetScope?: string; targetStudioIds?: string[]; targetId?: string; studioId?: string },
  studioId: string,
): boolean {
  if (a.targetScope && a.targetScope !== "studio") return false;
  return (
    Boolean(a.targetStudioIds?.includes(studioId)) ||
    a.targetId === studioId ||
    a.studioId === studioId
  );
}
