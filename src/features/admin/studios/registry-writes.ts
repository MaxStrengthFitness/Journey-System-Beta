/**
 * THE REGISTRY'S WRITES — the Firestore half of registry.ts's plans.
 *
 * Moved out of the All locations screen in the Admins room (Sep 28 2026),
 * when that one long page became Admins → Studios (a list grouped by what
 * Journey knows, a page per studio, and Franchises of their own). The writes
 * themselves are unchanged:
 *
 *   - a plan from registry.ts is applied as ONE batch, and a null in a plan
 *     means "remove this field" (the plans are pure and must not import
 *     Firestore sentinels to say so);
 *   - deleting a studio takes it out of every franchise that lists it FIRST,
 *     then deletes the document, so a failure half way never leaves a
 *     franchise pointing at nothing (the orphan fix);
 *   - moving a studio rewrites both sides of the link, or neither.
 */
import { deleteDoc, deleteField, doc, updateDoc, writeBatch } from "firebase/firestore";
import { db } from "../../../firebase";
import type { FranchiseNetwork, Studio } from "../../../types";
import { deleteStudioPlan, linkPlan, unlinkPlan, type RegistryWrite } from "./registry";
import { studioPatchPayload } from "./studio-writes";
import type { StudioForm } from "./StudioDetailsForm";

/** Applies a plan from registry.ts as one atomic batch. */
export async function applyPlan(writes: RegistryWrite[]): Promise<void> {
  if (writes.length === 0) return;
  const batch = writeBatch(db);
  for (const w of writes) {
    const payload: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(w.data)) {
      payload[key] = value === null ? deleteField() : value;
    }
    batch.update(doc(db, w.collection, w.id), payload);
  }
  await batch.commit();
}

/**
 * Only the fields the details form rendered and the person changed reach
 * this — the diff, never the whole studio (features/admin/README.md). The
 * conversions live in studio-writes.ts, shared with My Studio → Studio.
 */
export async function saveStudioDetails(studioId: string, patch: Partial<StudioForm>): Promise<void> {
  await updateDoc(doc(db, "studios", studioId), studioPatchPayload(patch));
}

/** Out of every franchise first, then the studio itself. */
export async function deleteStudio(networks: FranchiseNetwork[], studioId: string): Promise<void> {
  await applyPlan(deleteStudioPlan(networks, studioId));
  await deleteDoc(doc(db, "studios", studioId));
}

/** Moves a studio to another franchise (or none), both sides of the link at once. */
export async function moveStudioToNetwork(
  studio: Pick<Studio, "id" | "networkId">,
  networks: FranchiseNetwork[],
  networkId: string | null,
): Promise<void> {
  if (!studio.id) return;
  const current = networks.find((n) => n.id === studio.networkId);
  const writes: RegistryWrite[] = [];
  if (current) writes.push(...unlinkPlan(current, studio.id));
  if (networkId) {
    const next = networks.find((n) => n.id === networkId);
    if (next) writes.push(...linkPlan(next, studio.id));
  }
  await applyPlan(writes);
}
