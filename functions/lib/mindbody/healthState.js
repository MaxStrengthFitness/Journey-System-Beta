"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recordHealthEvent = recordHealthEvent;
const firestore_1 = require("firebase-admin/firestore");
/**
 * Records a health event and recomputes the system/health status.
 *
 * Status derivation priority order:
 * 1. offline (if webhookSubscriptionActive is false)
 * 2. error (if signature failures > 0)
 * 3. error (if dlq depth > 10)
 * 4. error (if no recent success > 5 minutes)
 * 5. degraded (if dlq depth 1-10)
 * 6. degraded (if success > 60 seconds ago)
 * 7. healthy
 *
 * @throws {RangeError} If dlq depth is invalid or hydrationLatencyMs is invalid.
 */
async function recordHealthEvent(firestore, event) {
    if (event.type === 'dlq_depth_changed') {
        if (!Number.isInteger(event.depth) || event.depth < 0) {
            throw new RangeError('depth must be a non-negative integer');
        }
    }
    else if (event.type === 'webhook_success') {
        if (!Number.isInteger(event.hydrationLatencyMs) || event.hydrationLatencyMs < 0) {
            throw new RangeError('hydrationLatencyMs must be a non-negative integer');
        }
    }
    const docRef = firestore.collection('system').doc('health');
    await firestore.runTransaction(async (transaction) => {
        const sn = await transaction.get(docRef);
        let data = {
            status: 'healthy',
            lastSuccessfulEventAt: null,
            lastFailureAt: null,
            dlqDepth: 0,
            signatureFailures24h: 0,
            webhookSubscriptionActive: true,
            hydrationP95LatencyMs: 0
        };
        if (sn.exists) {
            const existing = sn.data();
            data = Object.assign(Object.assign({}, data), existing);
        }
        const now = Date.now();
        const nowTimestamp = firestore_1.Timestamp.fromMillis(now);
        switch (event.type) {
            case 'webhook_success':
                data.lastSuccessfulEventAt = nowTimestamp;
                data.hydrationP95LatencyMs = event.hydrationLatencyMs;
                break;
            case 'webhook_failure':
                data.lastFailureAt = nowTimestamp;
                break;
            case 'signature_failure':
                data.signatureFailures24h += 1;
                break;
            case 'subscription_status':
                data.webhookSubscriptionActive = event.active;
                break;
            case 'dlq_depth_changed':
                data.dlqDepth = event.depth;
                break;
        }
        const successAgeMs = data.lastSuccessfulEventAt
            ? now - data.lastSuccessfulEventAt.toMillis()
            : Infinity;
        if (!data.webhookSubscriptionActive) {
            data.status = 'offline';
        }
        else if (data.signatureFailures24h > 0) {
            data.status = 'error';
        }
        else if (data.dlqDepth > 10) {
            data.status = 'error';
        }
        else if (successAgeMs > 5 * 60 * 1000) {
            data.status = 'error';
        }
        else if (data.dlqDepth >= 1 && data.dlqDepth <= 10) {
            data.status = 'degraded';
        }
        else if (successAgeMs > 60 * 1000) {
            data.status = 'degraded';
        }
        else {
            data.status = 'healthy';
        }
        const finalData = Object.assign(Object.assign({}, data), { updatedAt: firestore_1.FieldValue.serverTimestamp() });
        // cast needed because mock transaction expects Record<string, unknown>
        transaction.set(docRef, finalData);
    });
}
//# sourceMappingURL=healthState.js.map