import { Firestore, FieldValue } from 'firebase-admin/firestore';

export type DlqDoc = {
  messageId: string;
  eventType: string;
  originalPayload: Record<string, unknown>;
  firstSeenAt: FieldValue;
  retryCount: number;
  lastError: string;
  resolvedAt?: any; // Only typing it for future UI consumers
};

/**
 * Persists a webhook event into the dead letter queue (DLQ) after retry budget is exhausted.
 *
 * - On first write (new messageId): Creates the document and sets `firstSeenAt` to server time.
 * - On subsequent writes (same messageId): Preserves `firstSeenAt`, `eventType`, and 
 *   `originalPayload` from the initial write, updating only `retryCount` and `lastError`.
 * - `resolvedAt` is explicitly NOT this module's concern; it is never written here.
 *
 * @throws {TypeError} If messageId, eventType, or lastError are empty/whitespace.
 * @throws {TypeError} If originalPayload is not a plain object.
 * @throws {RangeError} If retryCount is not a non-negative integer.
 */
export async function recordDeadLetter(
  firestore: Firestore,
  params: {
    messageId: string;
    eventType: string;
    originalPayload: Record<string, unknown>;
    retryCount: number;
    lastError: string;
  }
): Promise<void> {
  const { messageId, eventType, originalPayload, retryCount, lastError } = params;

  if (!messageId || !messageId.trim() || !eventType || !eventType.trim() || !lastError || !lastError.trim()) {
    throw new TypeError('messageId, eventType, and lastError must be non-empty');
  }

  if (!Number.isInteger(retryCount) || retryCount < 0) {
    throw new RangeError('retryCount must be a non-negative integer');
  }

  if (!originalPayload || Object.prototype.toString.call(originalPayload) !== '[object Object]') {
    throw new TypeError('originalPayload must be a plain object');
  }

  const docRef = firestore.collection('mindbodyDLQ').doc(messageId);

  await firestore.runTransaction(async (transaction) => {
    const doc = await transaction.get(docRef);

    if (doc.exists) {
      const existingData = doc.data() || {};
      transaction.set(docRef, {
        ...existingData,
        retryCount,
        lastError
      });
    } else {
      const newData = {
        messageId,
        eventType,
        originalPayload,
        firstSeenAt: FieldValue.serverTimestamp(),
        retryCount,
        lastError
      };
      transaction.set(docRef, newData);
    }
  });
}
