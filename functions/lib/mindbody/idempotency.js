"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tryRecordEvent = tryRecordEvent;
const firestore_1 = require("firebase-admin/firestore");
/**
 * Attempts to record a Mindbody event in the idempotency log.
 * Uses a Firestore transaction to ensure atomic read-or-create.
 *
 * @param firestore - The injected Firestore instance.
 * @param messageId - The unique message ID from Mindbody.
 * @param eventType - The type of event (e.g., 'appointmentBooking.cancelled').
 * @param metadata - Optional metadata, such as hydrationLatencyMs.
 * @returns A promise resolving to { wasNew: boolean }. true if recorded, false if duplicate.
 * @throws TypeError if messageId or eventType are empty or whitespace-only.
 */
async function tryRecordEvent(firestore, messageId, eventType, metadata) {
    if (!messageId || !messageId.trim() || !eventType || !eventType.trim()) {
        throw new TypeError('messageId and eventType must be non-empty');
    }
    const docRef = firestore.collection('mindbodyEventLog').doc(messageId);
    return firestore.runTransaction(async (transaction) => {
        const doc = await transaction.get(docRef);
        if (doc.exists) {
            return { wasNew: false };
        }
        const expiresAtMillis = Date.now() + 30 * 24 * 60 * 60 * 1000;
        const data = {
            messageId,
            eventType,
            processedAt: firestore_1.FieldValue.serverTimestamp(),
            expiresAt: firestore_1.Timestamp.fromMillis(expiresAtMillis)
        };
        if ((metadata === null || metadata === void 0 ? void 0 : metadata.hydrationLatencyMs) !== undefined) {
            data.hydrationLatencyMs = metadata.hydrationLatencyMs;
        }
        // Cast needed because mock transaction expects Record<string, unknown> 
        // but actual SDK takes DocumentData.
        transaction.set(docRef, data);
        return { wasNew: true };
    });
}
//# sourceMappingURL=idempotency.js.map