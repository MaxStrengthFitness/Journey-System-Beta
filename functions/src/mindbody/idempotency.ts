import { Firestore, FieldValue, Timestamp } from 'firebase-admin/firestore';

/**
 * THE IDEMPOTENCY GATE: one document per Mindbody message, `mindbodyEventLog/{messageId}`.
 *
 * WHY A CLAIM, NOT A RECORD (the speed round, Oct 5 2026, R25).
 * The gate used to write a finished record BEFORE the work ran. A caught error
 * released it (retryLedger.ts), but a platform kill at the function's timeout
 * runs no catch: the record stayed, Mindbody's retry was answered "already
 * handled", and the event was lost without a trace.
 *
 * Now the gate writes a CLAIM: `state: "processing"` with `claimExpiresAt`
 * CLAIM_MS ahead. The handler marks it `done` (markEventDone) once the work
 * has committed.
 *
 *   no document                        -> claim it, process         (wasNew)
 *   processing, claim still live       -> a duplicate in flight     (not new)
 *   processing, claim expired          -> the last attempt died; take it over
 *   done / dead_lettered / no state    -> already handled           (not new)
 *
 * A document with no `state` was written by the old gate, which only ever
 * wrote after deciding to process, so it reads as handled.
 *
 * Mindbody's delivery rules (Webhooks documentation, read Oct 5 2026): a 2xx
 * within 10 seconds, else a resend every 15 minutes for 3 hours, and an event
 * may arrive more than once. The function's own timeout is 10 seconds, so a
 * claim of 2 minutes has always run out by the time the first resend comes,
 * and is still long enough that a duplicate arriving while the first attempt
 * is working is answered as a duplicate rather than run twice at once.
 *
 * Every document carries `expiresAt` 30 days out; a TTL policy on that field
 * deletes it (the policy is configuration, set once with gcloud).
 */

export const EVENT_LOG = 'mindbodyEventLog';

/** How long an attempt holds the claim before a resend may take it over. */
export const CLAIM_MS = 2 * 60 * 1000;

/** How long a processed event is remembered: the TTL policy deletes it after. */
export const EVENT_LOG_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type EventState = 'processing' | 'done' | 'dead_lettered';

export type ClaimDecision = 'claim' | 'take_over' | 'duplicate';

function millisOf(value: unknown): number | null {
  const v = value as { toMillis?: () => number } | null | undefined;
  if (v && typeof v.toMillis === 'function') {
    const ms = v.toMillis();
    return Number.isFinite(ms) ? ms : null;
  }
  return null;
}

/**
 * Pure: what the gate does with this message, given its log document (or
 * undefined when there is none) and the time now.
 */
export function claimDecision(
  existing: Record<string, unknown> | undefined,
  nowMs: number,
): ClaimDecision {
  if (!existing) return 'claim';
  if (existing.state !== 'processing') return 'duplicate';
  const expiresMs = millisOf(existing.claimExpiresAt);
  // A processing claim with no readable expiry can never be released by
  // time, so it is treated as expired: losing an event is the worse failure.
  if (expiresMs === null || nowMs >= expiresMs) return 'take_over';
  return 'duplicate';
}

export type ClaimResult = {
  /** True when this attempt holds the claim and must do the work. */
  wasNew: boolean;
  /** True when an earlier attempt's claim had run out and this one took it. */
  takenOver?: boolean;
  /** Which attempt this is, counting the one that was taken over. */
  attempt?: number;
};

/**
 * Claims a Mindbody event for processing. One transaction, so two deliveries
 * of the same message at the same moment cannot both be told to proceed.
 *
 * @param metadata - Optional metadata, such as hydrationLatencyMs.
 * @returns { wasNew: true } when the caller must process the event.
 * @throws TypeError if messageId or eventType are empty or whitespace-only.
 */
export async function tryRecordEvent(
  firestore: Firestore,
  messageId: string,
  eventType: string,
  metadata?: { hydrationLatencyMs?: number }
): Promise<ClaimResult> {
  if (!messageId || !messageId.trim() || !eventType || !eventType.trim()) {
    throw new TypeError('messageId and eventType must be non-empty');
  }

  const docRef = firestore.collection(EVENT_LOG).doc(messageId);

  return firestore.runTransaction(async (transaction) => {
    const doc = await transaction.get(docRef);
    const existing = doc.exists
      ? ((doc.data() as Record<string, unknown> | undefined) ?? {})
      : undefined;
    const now = Date.now();
    const decision = claimDecision(existing, now);

    if (decision === 'duplicate') return { wasNew: false };

    if (decision === 'take_over') {
      const prior = typeof existing?.attempts === 'number' ? existing.attempts : 1;
      const attempt = prior + 1;
      // Cast: the mock transaction takes Record<string, unknown>.
      transaction.set(
        docRef,
        {
          state: 'processing',
          claimExpiresAt: Timestamp.fromMillis(now + CLAIM_MS),
          attempts: attempt,
          takenOverAt: FieldValue.serverTimestamp(),
        } as unknown as Record<string, unknown>,
        { merge: true },
      );
      return { wasNew: true, takenOver: true, attempt };
    }

    const data: Record<string, unknown> = {
      messageId,
      eventType,
      state: 'processing',
      attempts: 1,
      processedAt: FieldValue.serverTimestamp(),
      claimExpiresAt: Timestamp.fromMillis(now + CLAIM_MS),
      expiresAt: Timestamp.fromMillis(now + EVENT_LOG_TTL_MS),
    };
    if (metadata?.hydrationLatencyMs !== undefined) {
      data.hydrationLatencyMs = metadata.hydrationLatencyMs;
    }
    transaction.set(docRef, data);
    return { wasNew: true, attempt: 1 };
  });
}

/**
 * Marks a claimed event handled, once its work has committed. Also stamps the
 * studio the event was about, when the handler knew one, so Operations ->
 * Mindbody's per-studio log (`where studioId ==, orderBy processedAt`) finds
 * it. Never throws: the work is already done, and a failed mark only means a
 * duplicate delivery after the claim runs out would apply the same newest-wins writes
 * again.
 */
export async function markEventDone(
  firestore: Firestore,
  messageId: string,
  fields: { studioId?: string | null; hydrationLatencyMs?: number } = {},
): Promise<boolean> {
  const data: Record<string, unknown> = {
    state: 'done',
    processedAt: FieldValue.serverTimestamp(),
  };
  if (typeof fields.studioId === 'string' && fields.studioId) data.studioId = fields.studioId;
  if (
    typeof fields.hydrationLatencyMs === 'number' &&
    Number.isFinite(fields.hydrationLatencyMs) &&
    fields.hydrationLatencyMs >= 0
  ) {
    data.hydrationLatencyMs = Math.round(fields.hydrationLatencyMs);
  }
  try {
    await firestore.collection(EVENT_LOG).doc(messageId).set(data, { merge: true });
    return true;
  } catch (error) {
    console.error(
      `Mindbody webhook: event ${messageId} was applied but not marked done; a duplicate delivery after the claim runs out would apply it again.`,
      { error: String(error) },
    );
    return false;
  }
}
