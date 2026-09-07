/**
 * Executes the merge planned in reconcile.ts.
 *
 * Everything about WHY the order is what it is lives in reconcile.ts. This
 * file is the Firestore mechanics: query, chunk, write, report progress.
 *
 * Two properties it must have, and does:
 *
 *   · IDEMPOTENT. Every step queries for the OLD id, so a second run finds
 *     nothing left to do. The honest recovery from a failure half way is to
 *     press the button again.
 *   · INTERRUPTIBLE. The temporary record is tombstoned last, so a crash
 *     leaves a profile that is still visibly temporary and still reconcilable
 *     rather than a tombstone pointing at history that never moved.
 */

import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "../../../firebase";
import type { Client, Trainer } from "../../../types";
import {
  CLIENT_COMPOSITE_ID_COLLECTION,
  CLIENT_REFERENCE_FIELDS,
  checkMerge,
  survivorPatch,
  tombstonePatch,
} from "./reconcile";

/** Firestore caps a batch at 500 writes; leave room for the odd extra. */
const BATCH_LIMIT = 400;

export interface MergeProgress {
  step: string;
  label: string;
  moved: number;
}

export interface MergeResult {
  moved: Record<string, number>;
  total: number;
}

async function repointField(
  collectionName: string,
  field: string,
  fromId: string,
  toId: string,
): Promise<number> {
  const snap = await getDocs(
    query(collection(db, collectionName), where(field, "==", fromId)),
  );
  if (snap.empty) return 0;

  let written = 0;
  for (let i = 0; i < snap.docs.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    for (const d of snap.docs.slice(i, i + BATCH_LIMIT)) {
      batch.update(d.ref, { [field]: toId });
      written += 1;
    }
    await batch.commit();
  }
  return written;
}

/**
 * clientMachineSettings is keyed `{clientId}_{machineId}`, so its documents
 * are re-keyed rather than patched.
 *
 * A setting already present under the surviving client's key WINS and the
 * temporary one is dropped. That direction is deliberate: the real record's
 * settings were adjusted by a coach against the client's actual history,
 * whereas a temporary record's were typed during an outage. Overwriting the
 * former with the latter would silently undo real coaching.
 */
async function rekeyMachineSettings(
  fromId: string,
  toId: string,
): Promise<number> {
  const snap = await getDocs(
    query(
      collection(db, CLIENT_COMPOSITE_ID_COLLECTION),
      where("clientId", "==", fromId),
    ),
  );
  let moved = 0;
  for (const d of snap.docs) {
    const data = d.data() as Record<string, unknown> & { machineId?: string };
    const machineId = data.machineId ?? d.id.slice(fromId.length + 1);
    if (!machineId) continue;
    const targetId = `${toId}_${machineId}`;
    const targetRef = doc(db, CLIENT_COMPOSITE_ID_COLLECTION, targetId);
    const existing = await getDoc(targetRef);
    if (!existing.exists()) {
      await setDoc(targetRef, { ...data, clientId: toId });
      moved += 1;
    }
    await deleteDoc(d.ref);
  }
  return moved;
}

/**
 * A tracked client keeps its place on every trainer's Kaizen Roster.
 *
 * The roster is an array of objects on the trainer document, so it cannot be
 * queried on — the trainers are read in full instead, which is fine at this
 * collection's size and is what the app already does everywhere else.
 * De-duplicated, because a trainer could plausibly be tracking both records.
 */
async function repointKaizenRosters(
  fromId: string,
  toId: string,
): Promise<number> {
  const snap = await getDocs(collection(db, "trainers"));
  let touched = 0;
  for (const d of snap.docs) {
    const t = d.data() as Trainer;
    const roster = t.kaizenRoster;
    if (!Array.isArray(roster) || !roster.some((e) => e?.clientId === fromId)) {
      continue;
    }
    const seen = new Set<string>();
    const next = roster
      .map((e) => (e?.clientId === fromId ? { ...e, clientId: toId } : e))
      .filter((e) => {
        const key = e?.clientId ?? "";
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    await updateDoc(d.ref, { kaizenRoster: next });
    touched += 1;
  }
  return touched;
}

export async function mergeProvisionalClient(
  temp: Client,
  survivor: Client,
  onProgress?: (p: MergeProgress) => void,
): Promise<MergeResult> {
  const problem = checkMerge(temp, survivor);
  if (problem) throw new Error(problem.message);

  const fromId = temp.id!;
  const toId = survivor.id!;
  const moved: Record<string, number> = {};
  let total = 0;

  const report = (step: string, label: string, n: number) => {
    moved[step] = n;
    total += n;
    onProgress?.({ step, label, moved: n });
  };

  for (const ref of CLIENT_REFERENCE_FIELDS) {
    const n = await repointField(ref.collection, ref.field, fromId, toId);
    report(`${ref.collection}.${ref.field}`, `Repointed ${ref.collection}`, n);
  }

  report(
    CLIENT_COMPOSITE_ID_COLLECTION,
    "Re-keyed machine settings",
    await rekeyMachineSettings(fromId, toId),
  );

  report(
    "kaizenRoster",
    "Updated Kaizen Rosters",
    await repointKaizenRosters(fromId, toId),
  );

  // The survivor learns where its history came from BEFORE the temporary
  // record is tombstoned, so an interruption between the two leaves a
  // traceable pair rather than an orphaned tombstone.
  await updateDoc(doc(db, "clients", toId), survivorPatch(fromId));
  report("survivor", "Recorded the merge on the surviving record", 1);

  await updateDoc(doc(db, "clients", fromId), tombstonePatch(toId));
  report("tombstone", "Marked the temporary profile merged", 1);

  return { moved, total };
}
