/**
 * PLANNER NOTES — who may put a note on a client's record, and take one off.
 *
 * The same answers firestore.rules gives for clients/{id}/sharedNotes, so the
 * Planner never offers a Share switch the database will refuse:
 *
 *   Share (write the copy)  whoever can edit the client — works at or leads
 *                           the client's home studio — and administrators.
 *                           The rule reuses inbodyWritable(): a shared plan is
 *                           written onto the record exactly like a scan.
 *   Remove the copy         its author, always (it is theirs to take back);
 *                           the studio's leaders and administrators (someone
 *                           has to be able to take a note off a record).
 *   Read                    whoever can open the client, like InBody scans.
 *
 * PURE MODULE.
 */

import type { Client, Trainer } from "../../../types";
import { canRecordInBody } from "../../inbody/access";
import { leadsStudio } from "../../renewals/permissions";

const SUPER = new Set(["Admin", "Founder", "Overseer"]);

type TrainerLike = Pick<
  Trainer,
  "role" | "primaryHomeStudioId" | "accessibleStudioIds" | "activeGuestStudioIds" | "ownedStudioIds"
>;

/** homeStudioId, falling back to studioId — the rules' studioIdOf(). */
export function clientStudioId(client: Pick<Client, "homeStudioId"> | null | undefined): string | null {
  if (!client) return null;
  return client.homeStudioId || ((client as { studioId?: string }).studioId ?? null) || null;
}

/**
 * Can this trainer put a note on this client's record?
 *
 * `client` is null when the Planner does not have the client's document (a
 * note linked months ago, at a studio no longer loaded). Then the answer is
 * no: the rule would need the client's studio, and the screen cannot promise
 * what it cannot check.
 */
export function canShareOnto(
  t: TrainerLike | null | undefined,
  client: Pick<Client, "homeStudioId"> | null | undefined,
): boolean {
  return Boolean(client) && canRecordInBody(t, clientStudioId(client));
}

/** Can this trainer take a shared note off the client's record? */
export function canRemoveSharedNote(
  t: TrainerLike | null | undefined,
  uid: string | null | undefined,
  note: { authorId: string },
  clientStudio: string | null | undefined,
): boolean {
  if (uid && note.authorId === uid) return true;
  if (!t) return false;
  return SUPER.has(t.role) || leadsStudio(t, clientStudio);
}
