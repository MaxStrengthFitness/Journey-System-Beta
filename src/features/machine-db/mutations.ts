/**
 * THE MSF MACHINE DATABASE — the writes.
 *
 * Every one of them lands on a document the studio already owns, under the
 * rule that already governs it:
 *
 *   adopting a machine      studios/{s}/roster       leaders (as before)
 *   offering a machine      studios/{s}/roster       leaders; custom only
 *   offering a note         studios/{s}/wiki         anyone at the studio
 *   offering a tip          studios/{s}/playbook     its author, or a leader
 *   deciding an offer       any of the three         administrators only
 *
 * SHARING WAITS FOR AN ADMINISTRATOR (AJ, Sep 28 2026: sharing with all MSF
 * studios "should submit to admins first for review, we can review in admin
 * dashboard"). Until then one tap put a studio's note, tip or machine in
 * front of every studio. Now the studio OFFERS it (`shareStatus: "pending"`,
 * plus what other studios will need to find it and credit it), and an
 * administrator decides on the Admins dashboard (ShareReviewPanel): shared
 * (`shared: true`, "approved") or not ("declined", with a short note the
 * studio reads). firestore.rules (shareDecisionOk) refuses a studio that
 * tries to publish or decide it itself.
 *
 * Taking it back is still the studio's, and still immediate: an offer
 * withdrawn, or something shared stops being shared (`on` false).
 *
 * Nothing is ever copied anywhere: the studio's own document is marked.
 */

import { deleteField, doc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { auth, db } from "../../firebase";
import type { AdoptionPlan } from "./database";

const uid = () => auth.currentUser?.uid ?? null;

/** Puts a machine from the database on this studio's floor. See planAdoption. */
export async function adoptMachine(studioId: string, plan: Extract<AdoptionPlan, { ok: true }>): Promise<void> {
  // merge: an MSF machine the studio once switched off ("We don't have this")
  // comes back with the local setup it had.
  await setDoc(
    doc(db, "studios", studioId, "roster", plan.machineId),
    { ...plan.entry, updatedAt: serverTimestamp(), updatedBy: uid() },
    { merge: true },
  );
}

/**
 * Offers (on) one of this studio's own machines to the database, or takes it
 * back (off): the offer withdrawn, or the listing ended.
 */
export async function setMachineOffer(
  studioId: string,
  machineId: string,
  on: boolean,
  studioName: string,
): Promise<void> {
  const by = uid();
  await updateDoc(
    doc(db, "studios", studioId, "roster", machineId),
    on
      ? {
          shareStatus: "pending",
          sharedStudioName: studioName.slice(0, 80),
          shareRequestedAt: serverTimestamp(),
          sharedBy: by,
          updatedAt: serverTimestamp(),
          updatedBy: by,
        }
      : { shared: false, shareStatus: deleteField(), updatedAt: serverTimestamp(), updatedBy: by },
  );
}

export interface ShareWhere {
  /** The machine lineages it is about — sharedKeysFor(). */
  keys: string[];
  studioName: string;
}

function offerFields(on: boolean, where: ShareWhere) {
  return on
    ? {
        shareStatus: "pending",
        sharedKeys: where.keys,
        studioName: where.studioName.slice(0, 80),
        shareRequestedAt: serverTimestamp(),
        shareRequestedBy: uid(),
      }
    : { shared: false, sharedKeys: [], shareStatus: deleteField() };
}

/** Offers (or takes back) this studio's note on a machine. */
export async function setNoteOffer(studioId: string, docId: string, on: boolean, where: ShareWhere): Promise<void> {
  await updateDoc(doc(db, "studios", studioId, "wiki", docId), offerFields(on, where));
}

/** Offers (or takes back) a playbook tip. */
export async function setTipOffer(studioId: string, entryId: string, on: boolean, where: ShareWhere): Promise<void> {
  await updateDoc(doc(db, "studios", studioId, "playbook", entryId), offerFields(on, where));
}

/** Which kind of thing an offer is, and so which collection it lives in. */
export type OfferKind = "machine" | "note" | "tip";

const COLLECTION: Record<OfferKind, "roster" | "wiki" | "playbook"> = {
  machine: "roster",
  note: "wiki",
  tip: "playbook",
};

/**
 * An administrator's decision on an offer (the Admins dashboard). Shared: it
 * joins every studio's Catalog under "From other MSF studios" (a note or a
 * tip) or All MSF machines (a machine). Not shared: the studio reads the note
 * beside its switch and may change it and offer it again.
 */
export async function decideOffer(
  kind: OfferKind,
  studioId: string,
  docId: string,
  decision: "share" | "decline",
  note?: string,
): Promise<void> {
  const by = uid();
  if (!by) throw new Error("Sign in again: the app can't tell who is deciding.");
  const reviewed = { shareReviewedBy: by, shareReviewedAt: serverTimestamp() };
  const trimmed = (note ?? "").trim().slice(0, 300);
  await updateDoc(
    doc(db, "studios", studioId, COLLECTION[kind], docId),
    decision === "share"
      ? {
          shared: true,
          shareStatus: "approved",
          ...reviewed,
          ...(trimmed ? { shareReviewNote: trimmed } : { shareReviewNote: deleteField() }),
          ...(kind === "machine" ? { sharedAt: serverTimestamp() } : {}),
        }
      : {
          shared: false,
          shareStatus: "declined",
          ...reviewed,
          ...(trimmed ? { shareReviewNote: trimmed } : { shareReviewNote: deleteField() }),
        },
  );
}
