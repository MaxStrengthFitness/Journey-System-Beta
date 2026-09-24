/**
 * FORD writes.
 *
 * Every function here is deliberately small and total: it either writes or it
 * swallows the error and tells the caller. Nothing in FORD is allowed to block
 * a trainer — a failed detail is a lost sentence, and a hard-failed save
 * during a set is a lost client. That asymmetry decides every catch below.
 *
 * The rollup on `clients/{id}.fordSummary` is written after the detail lands
 * and is fire-and-forget. It is a rendering cache, so drift is cosmetic and
 * self-heals on the next save; the subcollection is always the truth.
 */

import {
  collection,
  getDoc,
  getDocs,
  query,
  where,
  limit,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db } from "../../firebase";
import { handleFirestoreError, OperationType } from "../../lib/firestore-errors";
import type { Client } from "../../types";
import {
  type ClientFordSummary,
  type FordDraft,
  type FordEntry,
  type FordGestureStatus,
  type FordOpportunity,
  type FordPillar,
} from "./types";
import { fordStudioIdOf, summariseFord } from "./ford-rollup";

/**
 * The studio every FORD writer stamps and every per-client read filters on.
 * Defined beside the rollup (pure, tested there); exported here because this
 * is where a writer looks for it.
 */
export { fordStudioIdOf };

/** Same cap as useClientFord's stream: a runaway guard, not a window. */
const SUMMARY_READ_LIMIT = 500;

/**
 * The longest detail the FORD rules accept (`body.size() <= 2000` on create
 * and update). A journal note may be 5,000, so a capture that starts as a
 * note (the composer's FORD mode) checks this before it is sent.
 */
export const FORD_BODY_MAX = 2000;

export interface FordAuthor {
  /** The Auth uid. The rules pin authorId to it, same as the journal. */
  id: string;
  initials: string;
  fullName: string;
}

/** `clients/{clientId}/ford` — the one path this feature owns. */
export function fordCollection(clientId: string) {
  return collection(db, "clients", clientId, "ford");
}

function fordDoc(clientId: string, fordId: string) {
  return doc(db, "clients", clientId, "ford", fordId);
}

/* ------------------------------------------------------------------ */
/* CREATE                                                              */
/* ------------------------------------------------------------------ */

/**
 * Save a detail.
 *
 * `pillar` may be null. That is not a defect to be validated away — it is the
 * floor path: a trainer mid-set types the sentence and saves, and the category
 * is chosen thirty seconds later at teardown. Requiring a pillar here would
 * put a decision between hearing the thing and recording it, which is exactly
 * how details get lost.
 */
export async function createFordEntry(
  clientId: string,
  studioId: string,
  author: FordAuthor,
  draft: FordDraft,
): Promise<string | null> {
  const body = (draft.body || "").trim();
  if (!clientId || !body) return null;

  const occurred = draft.occurredAt ?? new Date();

  const payload = {
    clientId,
    studioId: studioId || "",
    pillar: draft.pillar ?? null,
    body,
    subject: draft.subject?.trim() || null,
    isPinned: draft.isPinned ?? false,
    eventDate: draft.eventDate ? Timestamp.fromDate(draft.eventDate) : null,
    recurrence: draft.recurrence ?? "none",
    /* When it matters — the same three fields a note carries, so mattering.ts
       can answer about a detail without knowing what it is (types.ts). */
    effectiveFrom: draft.effectiveFrom ? Timestamp.fromDate(draft.effectiveFrom) : null,
    effectiveUntil: draft.effectiveUntil ? Timestamp.fromDate(draft.effectiveUntil) : null,
    repeat: draft.repeat ?? null,
    reviewedAt: null,
    opportunity: draft.opportunity ?? null,
    // Client-side Timestamp, never serverTimestamp() — see types.ts.
    occurredAt: Timestamp.fromDate(occurred),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    authorId: author.id,
    authorName: author.fullName,
    authorInitials: author.initials,
    origin: draft.origin ?? "profile",
    sessionId: draft.sessionId ?? null,
    isArchived: false,
  };

  try {
    const ref = await addDoc(fordCollection(clientId), payload);
    void refreshFordSummary(clientId, payload.studioId);
    return ref.id;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, "ford");
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* UPDATE                                                              */
/* ------------------------------------------------------------------ */

export type FordPatch = Partial<
  Pick<
    FordEntry,
    | "pillar"
    | "body"
    | "subject"
    | "isPinned"
    | "recurrence"
    | "opportunity"
    | "repeat"
  >
> & {
  eventDate?: Date | null;
  occurredAt?: Date | null;
  effectiveFrom?: Date | null;
  effectiveUntil?: Date | null;
  resolvedAt?: Date | null;
};

export async function updateFordEntry(
  clientId: string,
  fordId: string,
  patch: FordPatch,
): Promise<boolean> {
  const next: Record<string, unknown> = { updatedAt: serverTimestamp() };

  if (patch.pillar !== undefined) next.pillar = patch.pillar;
  if (patch.body !== undefined) next.body = patch.body.trim();
  if (patch.subject !== undefined) next.subject = patch.subject?.trim() || null;
  if (patch.isPinned !== undefined) next.isPinned = patch.isPinned;
  if (patch.repeat !== undefined) next.repeat = patch.repeat;
  if (patch.effectiveFrom !== undefined)
    next.effectiveFrom = patch.effectiveFrom ? Timestamp.fromDate(patch.effectiveFrom) : null;
  if (patch.effectiveUntil !== undefined)
    next.effectiveUntil = patch.effectiveUntil ? Timestamp.fromDate(patch.effectiveUntil) : null;
  if (patch.resolvedAt !== undefined)
    next.resolvedAt = patch.resolvedAt ? Timestamp.fromDate(patch.resolvedAt) : null;
  if (patch.recurrence !== undefined) next.recurrence = patch.recurrence;
  if (patch.opportunity !== undefined) next.opportunity = patch.opportunity;
  if (patch.eventDate !== undefined) {
    next.eventDate = patch.eventDate ? Timestamp.fromDate(patch.eventDate) : null;
  }
  if (patch.occurredAt !== undefined && patch.occurredAt) {
    next.occurredAt = Timestamp.fromDate(patch.occurredAt);
  }

  try {
    await updateDoc(fordDoc(clientId, fordId), next);
    void refreshFordSummary(clientId);
    return true;
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, "ford");
    return false;
  }
}

/**
 * File an untagged capture.
 *
 * The one-tap move at teardown. Separate from `updateFordEntry` only so the
 * call site reads like what the trainer is doing.
 */
export function tagFordEntry(
  clientId: string,
  fordId: string,
  pillar: FordPillar,
): Promise<boolean> {
  return updateFordEntry(clientId, fordId, { pillar });
}

/** Archive, never delete. A detail about someone's family is not ours to destroy. */
export async function archiveFordEntry(
  clientId: string,
  fordId: string,
): Promise<boolean> {
  try {
    await updateDoc(fordDoc(clientId, fordId), {
      isArchived: true,
      updatedAt: serverTimestamp(),
    });
    void refreshFordSummary(clientId);
    return true;
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, "ford");
    return false;
  }
}

/**
 * The exception to archive-never-delete: a capture typed by mistake and
 * discarded in the same breath, before it was ever filed. Only reachable from
 * the teardown sweep, and only for an untagged entry.
 */
export async function discardUntaggedCapture(
  clientId: string,
  fordId: string,
): Promise<boolean> {
  try {
    await deleteDoc(fordDoc(clientId, fordId));
    void refreshFordSummary(clientId);
    return true;
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, "ford");
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* THE GESTURE                                                         */
/* ------------------------------------------------------------------ */

/** Promote a detail to something the team intends to do. */
export function promoteToOpportunity(
  clientId: string,
  fordId: string,
  idea: string,
  opts: { plannedFor?: Date | null; owner?: { id: string; name: string } | null } = {},
): Promise<boolean> {
  const opportunity: FordOpportunity = {
    idea: idea.trim(),
    status: opts.owner ? "planned" : "idea",
    ownerTrainerId: opts.owner?.id ?? null,
    ownerName: opts.owner?.name ?? null,
    plannedFor: opts.plannedFor ? Timestamp.fromDate(opts.plannedFor) : null,
    doneAt: null,
    outcome: null,
  };
  return updateFordEntry(clientId, fordId, { opportunity });
}

/**
 * Move a gesture along.
 *
 * `outcome` is what actually happened, and it is the reason this feature is
 * worth anything a year from now: "took the dinner bill at Giovanni's, she
 * cried" is the institutional memory a new trainer inherits.
 */
export function setGestureStatus(
  clientId: string,
  fordId: string,
  current: FordOpportunity,
  status: FordGestureStatus,
  extras: { owner?: { id: string; name: string } | null; outcome?: string } = {},
): Promise<boolean> {
  const opportunity: FordOpportunity = {
    ...current,
    status,
    ownerTrainerId:
      extras.owner === undefined ? current.ownerTrainerId : extras.owner?.id ?? null,
    ownerName:
      extras.owner === undefined ? current.ownerName : extras.owner?.name ?? null,
    doneAt: status === "done" ? Timestamp.fromDate(new Date()) : null,
    outcome: extras.outcome !== undefined ? extras.outcome.trim() || null : current.outcome,
  };
  return updateFordEntry(clientId, fordId, { opportunity });
}

/* ------------------------------------------------------------------ */
/* THE ROLLUP                                                          */
/* ------------------------------------------------------------------ */

/**
 * Recompute `clients/{id}.fordSummary` from the subcollection.
 *
 * One extra read and one extra write per save. That is the price of every
 * client list in the app being able to show "Anniversary in 12 days" without
 * touching the subcollection, and it is worth paying. Failures are swallowed:
 * a stale chip is cosmetic, and the next save fixes it.
 *
 * The read names the client's studio (client codex, phase 1). Unfiltered, the
 * rules refused it for every role below franchise owner, so a trainer's save
 * never refreshed the rollup — only an administrator's did. `studioId` is the
 * stamp the detail was written with; the update paths do not have it, so it
 * is read off the client document (one more read, on a path that is already
 * fire-and-forget).
 */
export async function refreshFordSummary(
  clientId: string,
  studioId?: string,
): Promise<ClientFordSummary | null> {
  try {
    let studio = studioId || "";
    if (!studio) {
      const client = await getDoc(doc(db, "clients", clientId));
      studio = client.exists() ? fordStudioIdOf(client.data() as Client) : "";
    }
    // No studio, no scope the rules would accept: leave the cache alone.
    if (!studio) return null;
    const snap = await getDocs(
      query(
        fordCollection(clientId),
        where("studioId", "==", studio),
        limit(SUMMARY_READ_LIMIT),
      ),
    );
    const entries = snap.docs.map(
      (d) => ({ id: d.id, ...(d.data() as object) }) as FordEntry,
    );
    const summary = summariseFord(entries);
    await updateDoc(doc(db, "clients", clientId), { fordSummary: summary });
    return summary;
  } catch {
    /* cosmetic — never surfaced, never retried */
    return null;
  }
}
