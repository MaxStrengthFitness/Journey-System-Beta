/**
 * WHO MAY OPEN OPERATIONS — and where anyone else is sent.
 *
 * Sign-out round, Sep 24 2026. Until now the only check was on the trainer
 * menu: the App Mode switch showed Operations to studio leaders and above,
 * and to everyone inside Demo Mode. The route and the Operations shell
 * checked nothing, so anything else that put `admin-dashboard` on the screen
 * opened it for anybody:
 *
 *  - a sign-out that left the view in place, handing a leader's Operations to
 *    the Life Transformer who signed in next;
 *  - Demo Mode, where everyone may open Operations: open it there, pick a real
 *    studio, and the Operations button on the bottom bar opened that studio's.
 *
 * Now the menu, the route and the shell all ask this one question, and the
 * route asks it again on every change of person or studio. The Firestore
 * rules remain the real enforcement; this makes the screens agree with them.
 */

import type { Trainer, View } from "../../types";
import { isStudioLeader } from "../../lib/permissions";
import { hasRunOfDemo } from "../demo-mode/access";

/**
 * Studio leaders and above anywhere (head trainer and above, AJ, Sep 18), and
 * inside Demo Mode everyone — "full access" is the point of the practice
 * studio (AJ, Sep 20). The grant (`managedStudioIds`) is deliberately not
 * here: it opens My Studio's leader sections, not Operations
 * (docs/business/roles-and-permissions.md).
 */
export function mayOpenOperations(
  trainer: Trainer | null | undefined,
  activeStudioId: string | null | undefined,
): boolean {
  return isStudioLeader(trainer ?? null) || hasRunOfDemo(trainer, activeStudioId);
}

/** The app mode switch in the trainer menu: Trainer, or Operations / Admin. */
export type AppMode = "trainer" | "admin";

/** Where the app is: the screen, and which bottom bar is under it. */
export interface AppPlace {
  view: View;
  appMode: AppMode;
}

/** What the person in front of the iPad may open, right now, at this studio. */
export interface PlaceAccess {
  /** `mayOpenOperations` for the signed-in trainer and the active studio. */
  operations: boolean;
  /** The Admins dashboard: administrators and the founder. */
  admins: boolean;
}

/** The Hub, in trainer mode: where anyone is sent from a screen that is shut. */
export const HUB_PLACE: AppPlace = { view: "clients", appMode: "trainer" };

/**
 * The place this person may actually be in. Returns `place` itself when
 * nothing needs to change, so a caller can tell "allowed" by identity.
 *
 *  - Operations without leave to open it → the Hub, trainer mode.
 *  - The Admins dashboard without leave → the Hub, trainer mode.
 *  - Admin mode on any other screen with leave to neither → trainer mode on
 *    the same screen: the Operations bar goes, the screen stays.
 */
export function guardPlace(place: AppPlace, access: PlaceAccess): AppPlace {
  if (place.view === "admin-dashboard" && !access.operations) return HUB_PLACE;
  if (place.view === "admins-dashboard" && !access.admins) return HUB_PLACE;
  if (place.appMode === "admin" && !access.operations && !access.admins) {
    return { view: place.view, appMode: "trainer" };
  }
  return place;
}
