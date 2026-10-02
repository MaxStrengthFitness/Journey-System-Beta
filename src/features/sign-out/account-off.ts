/**
 * A FORMER TRAINER'S ACCOUNT, SWITCHED OFF (AJ, Oct 2 2026: "Switching a
 * former trainer's account off — on Change role").
 * PURE: no React, no Firestore.
 *
 * An administrator switches a former trainer's account off from Change role
 * on a studio's Team (Admins dashboard). The trainer record is marked
 * `isActive: false`, signed and dated, and nothing else changes: their past
 * sessions keep their name (sessions name the trainer by id, and the record
 * stays), and who-works-here.ts already leaves an inactive person off every
 * team list.
 *
 * What Journey does with it:
 *   - at sign-in, a switched-off record is refused: the person is signed
 *     straight out with a sentence that says why (useAuthInitialization);
 *   - while signed in, their own record is watched, so switching it off signs
 *     them out on their next screen (the same hook);
 *   - firestore.rules refuse a trainer switching their own account back on
 *     (`isActive` is one of the access fields only someone else may write).
 *
 * What it does NOT do, and what that would take: the Firebase Auth account
 * itself stays enabled, so the person can still prove who they are to
 * Google or Microsoft and reach the database directly with a token. Turning
 * the Auth user off (`admin.auth().updateUser(uid, { disabled: true })`) and
 * revoking their refresh tokens needs the Admin SDK, which means a Cloud
 * Function (a callable `setTrainerAccountEnabled`, administrators only, or
 * a trigger on `trainers/{id}.isActive`), which is out of this round's
 * scope. Until then the rules are what refuse a direct write; reads by a
 * switched-off person are still allowed wherever any signed-in trainer may
 * read (docs/rounds/2026-10-02-atlas-answers/machines.md, item 8).
 */

export interface SwitchedOffBy {
  uid: string;
  name: string;
}

/** True when this trainer record has been switched off. Absent means on. */
export function isSwitchedOff(t: { isActive?: boolean | null } | null | undefined): boolean {
  return t?.isActive === false;
}

/** What the sign-in screen says to someone whose account was switched off. */
export const SWITCHED_OFF_SENTENCE =
  "This account has been switched off, so Journey can't open for it. If you still work at a Max Strength studio, ask your studio leader or head office to switch it back on.";

/** The write that switches an account off: the flag, who, and when. */
export function switchOffPatch(by: SwitchedOffBy, nowIso: string) {
  return {
    isActive: false,
    switchedOffAt: nowIso,
    switchedOffBy: { uid: by.uid, name: by.name.trim().slice(0, 80) || "An administrator" },
  };
}

/** The Activity record's sentence for switching an account off or back on. */
export function switchedOffWhat(personName: string, off: boolean): string {
  const who = personName.trim() || "someone";
  return off
    ? `Switched ${who}'s account off: Journey refuses them, and their past sessions keep their name.`
    : `Switched ${who}'s account back on.`;
}

/** What will happen, in sentences, before the account is switched off. */
export function switchOffConsequences(personName: string): string[] {
  const who = personName.trim() || "They";
  return [
    `${who} is signed out and can't open Journey again, on any iPad.`,
    "Their past sessions, notes and records keep their name.",
    "They leave every studio's team list. You can switch the account back on from the studio's Team.",
  ];
}
