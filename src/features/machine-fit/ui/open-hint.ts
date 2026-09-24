/**
 * MACHINE FIT — "open her Setup on Check".
 *
 * Operations → Machine fit lists clients whose set-up is worth a look; tapping
 * one opens her profile. The profile already resumes wherever its stored
 * location says (profile-nav's writeStoredLocation), so the screen that sends
 * the leader there writes Programming → Setup. This is the second half: the
 * Setup screen normally opens on "Set up" while anything prescribed is still
 * empty, and a leader arriving from the report wants "Check".
 *
 * One value per client in sessionStorage, read ONCE and removed, so it can
 * never outlive the tap that set it. Storage throws in a private window and
 * is absent in the harness: every access is wrapped, and failing simply means
 * the screen opens the way it always does.
 */

import type { SetupMode } from "./setup-draft";

/** Exported for sign-out, which clears these one-shot handoffs (features/sign-out). */
export const PREFIX = "msf_fit_open_mode:";

export function writeSetupHint(clientId: string | null | undefined, mode: SetupMode): void {
  if (!clientId) return;
  try {
    window.sessionStorage.setItem(PREFIX + clientId, mode);
  } catch {
    /* nothing to do: the Setup screen opens on its own default */
  }
}

export function takeSetupHint(clientId: string | null | undefined): SetupMode | null {
  if (!clientId) return null;
  try {
    const raw = window.sessionStorage.getItem(PREFIX + clientId);
    if (raw === null) return null;
    window.sessionStorage.removeItem(PREFIX + clientId);
    return raw === "check" || raw === "setup" || raw === "quick" ? raw : null;
  } catch {
    return null;
  }
}
