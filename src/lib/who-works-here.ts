/**
 * WHO WORKS HERE — the one answer to "is this person on this studio's team?"
 *
 * Round: voice review follow-up, Sep 27 2026. AJ, asked who the team on
 * My Studio → Team is: "everyone who works there". Before this, the one
 * Team screen built three lists by three rules — People and the initiative
 * counts were the home studio only, Standing weeks was home, "also works at"
 * or a guest, and in Demo Mode Standing weeks listed every real trainer in
 * the company. Every list of the team on My Studio → Team, the initiative
 * counts and the people pickers built on studioRoster, and the standing
 * weeks now ask this file. Two pickers ask a wider question on purpose and
 * keep their own rule: Relay → Notes' "Share with colleagues"
 * (peopleAtStudio, relay/notes/TeamShareCard.tsx) and the @tag list
 * (mentionablePeople, comments/comments.ts). Both also offer the studio's
 * owners, because an owner may read a team share (firestore.rules,
 * writesForStudio) and may be tagged.
 *
 * Someone works at a studio when:
 *
 *   - it is their home studio, one of the studios they also work at
 *     (`accessibleStudioIds` — a floater) or a studio they are a guest at
 *     (`activeGuestStudioIds`). The rules ask the same question
 *     (firestore.rules, trainerWorksAt), and renewals/permissions.ts worksAt
 *     is the same test for one person;
 *   - their account is active and has not been replaced by another
 *     (`isActive: false`, `supersededByUid`);
 *   - they are a person who can use the app: a placeholder or temporary
 *     profile nobody has claimed yet (`pendingClaim`) cannot take a job,
 *     propose a week or answer an initiative, so it is left out — it still
 *     shows on Team's staff list, where it is the studio's to reconcile.
 *     Demo Mode's own seeded trainers are the exception: they are
 *     placeholders by construction (nobody signs in as them) and they ARE
 *     Demo Mode's team.
 *
 * THE REALM RULE (features/demo-mode/access.ts): from inside Demo Mode you
 * see Demo Mode and nothing else; from anywhere else you do not see it at
 * all. So at the demo studio only Demo Mode's own trainers are listed —
 * never the whole company, which is what "everyone works at the demo
 * studio" (an AUTHORISATION answer, standing-week/present.ts worksAt) put
 * on the standing weeks — and at a real studio a demo trainer never is.
 * The standing weeks add one group at the demo studio: a real trainer who
 * has written a practice week there (standing-week/team.ts), so the week
 * they proposed while practising can be agreed.
 *
 * This is membership, not authorisation. Whether the signed-in person may
 * ACT at a studio (Demo Mode lets everyone) is a different question, asked
 * by leadsHere, canTakePartInRenewals and the rules.
 *
 * PURE MODULE.
 */
import { isDemoStudioId } from "../features/demo-mode/is-demo";

/** A trainer document as the lists read it. Every field is optional because Firestore data is not typed. */
export interface TeamMemberLike {
  id?: string;
  primaryHomeStudioId?: string | null;
  accessibleStudioIds?: readonly string[] | null;
  activeGuestStudioIds?: readonly string[] | null;
  isActive?: boolean;
  supersededByUid?: string | null;
  pendingClaim?: boolean;
  /** Demo Mode's DEMO_FLAG, on the seeded trainers. Not on the Trainer type, but on the documents. */
  isDemo?: boolean;
}

/** Home, also works at, or a guest there. Membership only. */
function isMember(t: TeamMemberLike, studioId: string): boolean {
  return (
    t.primaryHomeStudioId === studioId ||
    (t.accessibleStudioIds ?? []).includes(studioId) ||
    (t.activeGuestStudioIds ?? []).includes(studioId)
  );
}

/** Does this person work at this studio? See the header for every clause. */
export function worksHere(t: TeamMemberLike | null | undefined, studioId: string | null | undefined): boolean {
  if (!t || !t.id || !studioId) return false;
  if (!isMember(t, studioId)) return false;
  if (t.isActive === false || t.supersededByUid) return false;
  const demoTrainer = t.isDemo === true;
  // The realm rule, both ways.
  if (isDemoStudioId(studioId) !== demoTrainer) return false;
  // A placeholder nobody has claimed is not someone to list — except Demo Mode's own.
  if (t.pendingClaim && !demoTrainer) return false;
  return true;
}

/** Everyone who works at the studio, in the order given. Empty with no studio. */
export function whoWorksHere<T extends TeamMemberLike>(trainers: readonly T[], studioId: string | null | undefined): T[] {
  if (!studioId) return [];
  return trainers.filter((t) => worksHere(t, studioId));
}
