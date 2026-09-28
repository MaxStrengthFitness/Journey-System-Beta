/**
 * machineModels/{modelId} — the reads and the one write (Codex R2).
 *
 * The collection is small (one document per maker's model of each MSF
 * movement: tens, not thousands) and every signed-in person may read it, so
 * a screen reads all of it. Administrators write it, whole (`setDoc` with no
 * merge: a note or a dial removed in the editor is removed from the record,
 * and the document never holds anything outside its exact shape).
 */

import { useEffect, useState } from "react";
import { collection, doc, getDocs, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db } from "../../firebase";
import type { MachineModel } from "../../types/machines";
import { modelDocument, type ModelDraft, type ModelWithId } from "./models";

export const MODELS_COLLECTION = "machineModels";

export interface ModelsRead {
  models: ModelWithId[];
  byId: Record<string, ModelWithId>;
  loading: boolean;
  /** The read failed: unknown, never "no models". */
  failed: boolean;
}

function indexOf(models: ModelWithId[]): Record<string, ModelWithId> {
  const out: Record<string, ModelWithId> = {};
  for (const m of models) out[m.id] = m;
  return out;
}

/** Every model, live — for the screens where an administrator edits them. */
export function useMachineModels(enabled = true): ModelsRead {
  const [models, setModels] = useState<ModelWithId[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    const unsub = onSnapshot(
      collection(db, MODELS_COLLECTION),
      (snap) => {
        setModels(snap.docs.map((d) => ({ ...(d.data() as MachineModel), id: d.id })));
        setFailed(false);
        setLoading(false);
      },
      (err) => {
        console.warn("[machine models] read failed", err);
        setFailed(true);
        setLoading(false);
      },
    );
    return () => unsub();
  }, [enabled]);

  return { models, byId: indexOf(models), loading, failed };
}

let cached: Promise<{ models: ModelWithId[]; failed: boolean }> | null = null;

/**
 * Every model, read ONCE per app session — for a screen that only names a
 * model (the How it's used panel). A failed read is remembered as failed
 * for the session, never as "there are none".
 */
export function fetchMachineModels(): Promise<{ models: ModelWithId[]; failed: boolean }> {
  if (!cached) {
    cached = getDocs(collection(db, MODELS_COLLECTION))
      .then((snap) => ({
        models: snap.docs.map((d) => ({ ...(d.data() as MachineModel), id: d.id })),
        failed: false,
      }))
      .catch((err) => {
        console.warn("[machine models] read failed", err);
        return { models: [], failed: true };
      });
  }
  return cached;
}

/** Test seam. */
export function __resetMachineModelsCache() {
  cached = null;
}

/** The once-a-session read, as a hook. */
export function useMachineModelsOnce(enabled: boolean): ModelsRead {
  const [state, setState] = useState<ModelsRead>({ models: [], byId: {}, loading: enabled, failed: false });
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    fetchMachineModels().then((r) => {
      if (live) setState({ models: r.models, byId: indexOf(r.models), loading: false, failed: r.failed });
    });
    return () => {
      live = false;
    };
  }, [enabled]);
  return state;
}

/**
 * Write one model, whole, signed with the Auth uid (the rules pin
 * `updatedBy` to it). The id is the caller's: minted once on create
 * (`modelIdFor`), then kept.
 */
export async function saveMachineModel(id: string, draft: ModelDraft): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Sign in again to save this model.");
  await setDoc(doc(db, MODELS_COLLECTION, id), {
    ...modelDocument(draft),
    updatedAt: serverTimestamp(),
    updatedBy: uid,
  });
  cached = null;
}
