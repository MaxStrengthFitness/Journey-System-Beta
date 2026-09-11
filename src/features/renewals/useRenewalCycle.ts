/**
 * Renewal cycles and conversations: live reads and the writes.
 *
 *   studios/{studioId}/renewals/{cycleKey}                 one per package term
 *   studios/{studioId}/renewals/{cycleKey}/touches/{id}    one per conversation
 *
 * One document per conversation, not an array on the cycle: several trainers
 * write, and a shared array would let two iPads overwrite each other (the
 * lesson from initiative submissions). The cycle keeps only the latest of
 * each field, for lists.
 */

import { useEffect, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  writeBatch,
} from "firebase/firestore";
import { auth, db } from "../../firebase";
import { conversationWrites, type ConversationDraft } from "./conversation";
import type { RenewalCycle, RenewalOutcome, RenewalSnapshot, RenewalStage, RenewalTouch } from "./types";

export function cycleRef(studioId: string, cycleKey: string) {
  return doc(db, "studios", studioId, "renewals", cycleKey);
}

/** A cycle key is a Firestore document id: no slashes, not too long. */
export function isUsableCycleKey(key: string | null | undefined): key is string {
  return typeof key === "string" && /^[A-Za-z0-9_-]{1,120}$/.test(key);
}

export function useRenewalCycle(
  studioId: string | null | undefined,
  cycleKey: string | null | undefined,
): { cycle: RenewalCycle | null; loading: boolean } {
  const [cycle, setCycle] = useState<RenewalCycle | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    setCycle(null);
    if (!studioId || !isUsableCycleKey(cycleKey)) return;
    setLoading(true);
    return onSnapshot(
      cycleRef(studioId, cycleKey),
      (snap) => {
        setCycle(snap.exists() ? (snap.data() as RenewalCycle) : null);
        setLoading(false);
      },
      () => {
        // Not readable (another studio's client) or offline: nothing to show.
        setCycle(null);
        setLoading(false);
      },
    );
  }, [studioId, cycleKey]);
  return { cycle, loading };
}

export type TouchRow = RenewalTouch & { id: string };

export function useRenewalTouches(
  studioId: string | null | undefined,
  cycleKey: string | null | undefined,
  enabled = true,
): { touches: TouchRow[]; loading: boolean; error: string | null } {
  const [touches, setTouches] = useState<TouchRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setTouches([]);
    setError(null);
    if (!enabled || !studioId || !isUsableCycleKey(cycleKey)) return;
    setLoading(true);
    return onSnapshot(
      query(collection(cycleRef(studioId, cycleKey), "touches"), orderBy("at", "desc"), limit(30)),
      (snap) => {
        setTouches(snap.docs.map((d) => ({ ...(d.data() as RenewalTouch), id: d.id })));
        setLoading(false);
      },
      (err) => {
        console.warn("[renewals] conversations read failed:", err);
        setError("Couldn't load the conversation history.");
        setLoading(false);
      },
    );
  }, [studioId, cycleKey, enabled]);
  return { touches, loading, error };
}

function signedInUid(): string {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("You're signed out. Sign in again to save.");
  return uid;
}

/** Logs one conversation: a new touch, and the cycle's latest-of-each fields, in one batch. */
export async function logRenewalConversation(params: {
  studioId: string;
  cycleKey: string;
  clientId: string;
  clientName: string;
  snapshot: Pick<RenewalSnapshot, "packageKey" | "chargeDate"> | null;
  draft: ConversationDraft;
  authorName: string;
}): Promise<void> {
  const uid = signedInUid();
  const { touch, cycle } = conversationWrites({ ...params, authorId: uid });
  const ref = cycleRef(params.studioId, params.cycleKey);
  const batch = writeBatch(db);
  batch.set(doc(collection(ref, "touches")), { ...touch, at: serverTimestamp() });
  batch.set(
    ref,
    { ...cycle, lastTouchAt: serverTimestamp(), touchCount: increment(1) },
    { merge: true },
  );
  await batch.commit();
}

/** A leader's change to a cycle: stage, who is leading, the outcome, or clearing "needs a leader". */
export async function updateCycleAsLeader(
  studioId: string,
  cycleKey: string,
  base: Pick<RenewalCycle, "clientId" | "clientName" | "cycleKey">,
  patch: Partial<{
    stage: RenewalStage;
    leadTrainerId: string | null;
    needsLeader: boolean;
    outcome: RenewalOutcome | null;
  }>,
): Promise<void> {
  const uid = signedInUid();
  const extra: Record<string, unknown> = {};
  if ("outcome" in patch) {
    extra.outcomeAt = patch.outcome ? serverTimestamp() : null;
    extra.outcomeBy = patch.outcome ? uid : null;
  }
  await setDoc(
    cycleRef(studioId, cycleKey),
    { ...base, ...patch, ...extra, updatedAt: serverTimestamp(), updatedBy: uid },
    { merge: true },
  );
}

/** A leader removes a conversation logged by mistake. */
export async function deleteRenewalTouch(studioId: string, cycleKey: string, touchId: string): Promise<void> {
  await deleteDoc(doc(collection(cycleRef(studioId, cycleKey), "touches"), touchId));
}
