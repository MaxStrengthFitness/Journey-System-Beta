"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mindbodyWebhook = void 0;
exports.handleMindbodyWebhook = handleMindbodyWebhook;
const firestore_1 = require("firebase-admin/firestore");
const https_1 = require("firebase-functions/v2/https");
const params_1 = require("firebase-functions/params");
const verifySignature_1 = require("./verifySignature");
const healthState_1 = require("./healthState");
const idempotency_1 = require("./idempotency");
let studiosCache = null;
let lastCacheUpdate = 0;
async function getStudioIdFromMindbodySite(firestore, siteId) {
    const now = Date.now();
    if (!studiosCache || now - lastCacheUpdate > 60000) { // Cache for 1 minute
        studiosCache = {};
        const snap = await firestore.collection('studios').get();
        snap.forEach(doc => {
            const data = doc.data();
            if (data.mindbodySiteId) {
                studiosCache[String(data.mindbodySiteId)] = doc.id;
            }
        });
        lastCacheUpdate = now;
    }
    return studiosCache[String(siteId)];
}
/**
 * Handles incoming Mindbody webhooks.
 * Validates the signature, ensures uniqueness via idempotency checks,
 * and updates client records directly in Firestore.
 */
async function handleMindbodyWebhook(deps, req) {
    const signature = req.signatureHeader || '';
    // 1. Strict Verification Guard
    if (!(0, verifySignature_1.verifyMindbodySignature)(req.rawBody, signature, deps.webhookSecret)) {
        await (0, healthState_1.recordHealthEvent)(deps.firestore, { type: 'signature_failure' });
        return { statusCode: 401 };
    }
    let parsed;
    try {
        parsed = JSON.parse(req.rawBody);
    }
    catch (e) {
        return { statusCode: 400 };
    }
    // We use messageId or eventId as the tracking event ID.
    const eventId = typeof parsed.messageId === 'string' ? parsed.messageId : (typeof parsed.eventId === 'string' ? parsed.eventId : undefined);
    const eventType = typeof parsed.eventId === 'string' ? parsed.eventId : (typeof parsed.eventName === 'string' ? parsed.eventName : 'unknown_event');
    if (typeof eventId !== 'string' || !eventId.trim()) {
        return { statusCode: 400 };
    }
    // 2. Idempotency Check
    try {
        const { wasNew } = await (0, idempotency_1.tryRecordEvent)(deps.firestore, eventId, eventType);
        if (!wasNew) {
            // Return 200 to satisfy Mindbody retry loop for duplicates
            return { statusCode: 200 };
        }
    }
    catch (e) {
        console.error("Idempotency check failed", e);
        return { statusCode: 500 };
    }
    // 3. Payload Mapping & Upsert
    try {
        // Navigate potentially nested payload structures
        const payloadData = parsed.eventData
            || parsed.eventInstance
            || parsed;
        // Safely extract required fields
        const clientId = typeof payloadData.clientId === 'string' || typeof payloadData.clientId === 'number'
            ? payloadData.clientId
            : (typeof parsed.clientId === 'string' || typeof parsed.clientId === 'number'
                ? parsed.clientId
                : undefined);
        const siteId = typeof payloadData.siteId === 'string' || typeof payloadData.siteId === 'number'
            ? payloadData.siteId
            : (typeof parsed.siteId === 'string' || typeof parsed.siteId === 'number'
                ? parsed.siteId
                : undefined);
        if (clientId) {
            const updates = {};
            // Extract Active Membership Status / Tier Name
            if (typeof payloadData.membershipStatus === 'string')
                updates.membershipStatus = payloadData.membershipStatus;
            if (typeof payloadData.tierName === 'string')
                updates.packageTier = payloadData.tierName;
            if (typeof payloadData.activeMembership === 'boolean' || typeof payloadData.activeMembership === 'string')
                updates.activeMembership = payloadData.activeMembership;
            // Last Visited Timestamp
            if (typeof payloadData.lastVisited === 'string')
                updates.lastSessionDate = payloadData.lastVisited;
            // Prebooked Schedule Arrays
            if (Array.isArray(payloadData.prebookedSchedules))
                updates.prebookedSchedules = payloadData.prebookedSchedules;
            if (Array.isArray(payloadData.upcomingBookings))
                updates.upcomingBookings = payloadData.upcomingBookings;
            // Extract mindbody_name if given to help match
            if (typeof payloadData.firstName === 'string' || typeof payloadData.lastName === 'string') {
                updates.mindbody_name = `${typeof payloadData.firstName === 'string' ? payloadData.firstName : ''} ${typeof payloadData.lastName === 'string' ? payloadData.lastName : ''}`.trim();
            }
            if (siteId) {
                const studioId = await getStudioIdFromMindbodySite(deps.firestore, siteId);
                if (studioId) {
                    updates.homeStudioId = studioId;
                }
            }
            // Execute an atomic Firestore set() operation with { merge: true }
            const clientDocId = String(clientId);
            const clientRef = deps.firestore.collection('clients').doc(clientDocId);
            await clientRef.set(updates, { merge: true });
        }
        return { statusCode: 200 };
        // 4. Resiliency & Edge Errors
    }
    catch (error) {
        console.error("Webhook processing error:", { error: String(error) });
        await (0, healthState_1.recordHealthEvent)(deps.firestore, { type: 'webhook_failure' });
        // Catch errors without silently swallowing them
        return { statusCode: 500 };
    }
}
const mindbodyWebhookSecret = (0, params_1.defineSecret)('MINDBODY_WEBHOOK_SECRET');
let firestoreInstance = null;
/**
 * The expected public entry point for Mindbody webhooks.
 * Wires the pure HTTP handler logic to Firebase, Pub/Sub, and secret parameters.
 * Lazy initialization is used for external clients.
 */
exports.mindbodyWebhook = (0, https_1.onRequest)({ secrets: [mindbodyWebhookSecret], cors: false, region: 'us-central1', maxInstances: 100, timeoutSeconds: 10 }, async (req, res) => {
    if (!firestoreInstance) {
        firestoreInstance = (0, firestore_1.getFirestore)();
    }
    const payloadBuffer = req.rawBody; // req.rawBody is a Buffer natively in firebase-functions
    const rawBodyStr = payloadBuffer.toString('utf8');
    const deps = {
        firestore: firestoreInstance,
        webhookSecret: mindbodyWebhookSecret.value(),
    };
    const webhookReq = {
        rawBody: rawBodyStr,
        signatureHeader: req.header('x-mindbody-signature'),
    };
    const response = await handleMindbodyWebhook(deps, webhookReq);
    res.status(response.statusCode).send(response.body || '');
});
//# sourceMappingURL=index.js.map