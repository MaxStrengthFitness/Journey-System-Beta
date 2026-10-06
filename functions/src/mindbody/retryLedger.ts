import { Firestore, FieldValue } from "firebase-admin/firestore";
import { recordDeadLetter } from "./dlq";

/**
 * Closes the loop between the idempotency gate and the dead-letter queue.
 *
 * THE BUG THIS FIXES: `tryRecordEvent` commits the idempotency record BEFORE
 * the business logic runs. If processing then throws, Mindbody's retry arrives,
 * sees the record, is told "already handled", and the event is lost forever —
 * silently, which is the worst kind.
 *
 * The fix keeps the gate exactly where the integration standards require it,
 * and adds a release valve: on failure we count the attempt, and while the
 * budget holds we DELETE the idempotency record so the next retry is allowed
 * through. Once the budget is spent the record stays (stopping the retry storm)
 * and the event goes to the DLQ where a human can see it.
 *
 * The attempt counter lives in its own collection because Mindbody message ids
 * are unique per event — a counter can never bleed into an unrelated event.
 *
 * Since the speed round (Oct 5 2026, R25) the gate is a CLAIM with an expiry
 * (idempotency.ts), which covers the one failure this ledger cannot see: the
 * platform stopping the function at its timeout, when no catch runs. This
 * ledger still handles every CAUGHT failure, and a dead-lettered event's claim
 * is marked `dead_lettered`, so a stray resend can never take it over once the
 * claim would have run out.
 */

const RETRY_LEDGER = "mindbodyEventRetries";
const EVENT_LOG = "mindbodyEventLog";

/** Total processing attempts allowed before an event is dead-lettered. */
export const MAX_ATTEMPTS = 4;

export type FailureOutcome = {
  /** True when the idempotency record was released for another attempt. */
  willRetry: boolean;
  attempts: number;
};

export async function recordAttemptFailure(
  firestore: Firestore,
  params: {
    messageId: string;
    eventType: string;
    payload: Record<string, unknown>;
    error: unknown;
  },
): Promise<FailureOutcome> {
  const { messageId, eventType, payload } = params;
  const lastError = String(
    (params.error as { message?: string })?.message || params.error || "unknown error",
  ).slice(0, 1000);

  const ledgerRef = firestore.collection(RETRY_LEDGER).doc(messageId);

  const attempts = await firestore.runTransaction(async (transaction) => {
    const snap = await transaction.get(ledgerRef);
    const prior =
      snap.exists && typeof (snap.data() || {}).attempts === "number"
        ? ((snap.data() || {}).attempts as number)
        : 0;
    const next = prior + 1;
    transaction.set(ledgerRef, {
      messageId,
      eventType,
      attempts: next,
      lastError,
      lastFailedAt: FieldValue.serverTimestamp(),
    });
    return next;
  });

  if (attempts < MAX_ATTEMPTS) {
    // Release the gate so Mindbody's next retry is processed instead of being
    // waved through as a duplicate.
    try {
      await firestore.collection(EVENT_LOG).doc(messageId).delete();
    } catch (e) {
      console.error(
        `Mindbody webhook: could not release idempotency record for ${messageId}; the retry will be treated as a duplicate.`,
        e,
      );
    }
    return { willRetry: true, attempts };
  }

  // Budget exhausted. Leave the idempotency record in place (so Mindbody stops
  // retrying an event we cannot process), mark it handled so an expired claim
  // is never taken over, and hand it to the DLQ.
  try {
    await firestore
      .collection(EVENT_LOG)
      .doc(messageId)
      .set({ state: "dead_lettered", level: "error" }, { merge: true });
  } catch (e) {
    console.error(
      `Mindbody webhook: could not mark ${messageId} dead-lettered on its claim; a resend after the claim runs out would try it again.`,
      e,
    );
  }
  await recordDeadLetter(firestore, {
    messageId,
    eventType,
    originalPayload: payload,
    retryCount: attempts,
    lastError,
  });

  return { willRetry: false, attempts };
}

/**
 * Dead-letters an event whose every attempt was stopped before it finished
 * (the platform's timeout runs no catch, so recordAttemptFailure never saw
 * them). Called when the claim reports `exhausted` (idempotency.ts).
 *
 * The DLQ row is written FIRST and the claim marked `dead_lettered` after, so
 * a failure here leaves the claim expired and the next resend tries again:
 * the event is never marked given-up without a row a person can see. Throws
 * when the DLQ write fails, so the caller answers 500.
 */
export async function deadLetterUnfinished(
  firestore: Firestore,
  params: {
    messageId: string;
    eventType: string;
    payload: Record<string, unknown>;
    attempts: number;
  },
): Promise<void> {
  const { messageId, eventType, payload, attempts } = params;
  await recordDeadLetter(firestore, {
    messageId,
    eventType,
    originalPayload: payload,
    retryCount: attempts,
    lastError: "attempt never finished (platform timeout)",
  });
  try {
    await firestore
      .collection(EVENT_LOG)
      .doc(messageId)
      .set({ state: "dead_lettered", level: "error" }, { merge: true });
  } catch (e) {
    console.error(
      `Mindbody webhook: ${messageId} is in the DLQ but its claim was not marked dead-lettered; the next resend will dead-letter it again.`,
      e,
    );
  }
}
