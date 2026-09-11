/**
 * Who may record and remove InBody scans — the same answers firestore.rules
 * gives (inbodyWritable and the inbodyScans delete rule), so the app never
 * offers a button the database will refuse.
 *
 *   Record or correct: anyone who can edit the client — works at or leads
 *     the client's home studio — and administrators.
 *   Remove: whoever entered the scan, the studio's leaders, administrators.
 *
 * Reading follows the client: anyone who can open the profile sees the card.
 */

import type { Trainer } from "../../types";
import { leadsStudio, worksAt } from "../renewals/permissions";
import type { InBodyScan } from "./types";

const SUPER = new Set(["Admin", "Founder", "Overseer"]);

type TrainerLike = Pick<
  Trainer,
  "role" | "primaryHomeStudioId" | "accessibleStudioIds" | "activeGuestStudioIds" | "ownedStudioIds"
>;

export function canRecordInBody(t: TrainerLike | null | undefined, studioId: string | null | undefined): boolean {
  return Boolean(t && (SUPER.has(t.role) || worksAt(t, studioId) || leadsStudio(t, studioId)));
}

export function canRemoveInBodyScan(
  t: TrainerLike | null | undefined,
  uid: string | null | undefined,
  scan: Pick<InBodyScan, "enteredBy">,
  studioId: string | null | undefined,
): boolean {
  if (!t || !canRecordInBody(t, studioId)) return false;
  return (Boolean(uid) && scan.enteredBy === uid) || SUPER.has(t.role) || leadsStudio(t, studioId);
}
