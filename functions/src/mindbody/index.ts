import { Firestore, getFirestore } from 'firebase-admin/firestore';
import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { verifyMindbodySignature } from './verifySignature';
import { recordHealthEvent } from './healthState';
import { tryRecordEvent } from './idempotency';

export type WebhookRequest = {
  rawBody: string;
  signatureHeader: string | undefined;
};

export type WebhookResponse = {
  statusCode: 200 | 400 | 401 | 500;
  body?: string;
};

export type WebhookDeps = {
  firestore: Firestore;
  webhookSecret: string;
};

/**
 * Handles incoming Mindbody webhooks.
 * Validates the signature, ensures uniqueness via idempotency checks,
 * and updates client records directly in Firestore.
 */
export async function handleMindbodyWebhook(
  deps: WebhookDeps,
  req: WebhookRequest
): Promise<WebhookResponse> {
  const signature = req.signatureHeader || '';
  
  // 1. Strict Verification Guard
  if (!verifyMindbodySignature(req.rawBody, signature, deps.webhookSecret)) {
    await recordHealthEvent(deps.firestore, { type: 'signature_failure' });
    return { statusCode: 401 };
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(req.rawBody);
  } catch (e) {
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
    const { wasNew } = await tryRecordEvent(deps.firestore, eventId, eventType);
    if (!wasNew) {
      // Return 200 to satisfy Mindbody retry loop for duplicates
      return { statusCode: 200 };
    }
  } catch (e) {
    // If idempotency fails unexpectedly, log it, but wait, usually we should return 500
    console.error("Idempotency check failed", e);
    return { statusCode: 500 };
  }

  // 3. Payload Mapping & Upsert
  try {
    // Navigate potentially nested payload structures
    const payloadData = (parsed.eventData as Record<string, unknown> | undefined)
      || (parsed.eventInstance as Record<string, unknown> | undefined)
      || parsed;
    
    // Safely extract required fields
    const clientId = typeof payloadData.clientId === 'string' || typeof payloadData.clientId === 'number'
      ? payloadData.clientId
      : (typeof parsed.clientId === 'string' || typeof parsed.clientId === 'number'
          ? parsed.clientId
          : undefined);
    
    if (clientId) {
      const updates: Record<string, unknown> = {};
      
      // Extract Active Membership Status / Tier Name
      if (typeof payloadData.membershipStatus === 'string') updates.membershipStatus = payloadData.membershipStatus;
      if (typeof payloadData.tierName === 'string') updates.packageTier = payloadData.tierName;
      if (typeof payloadData.activeMembership === 'boolean' || typeof payloadData.activeMembership === 'string') updates.activeMembership = payloadData.activeMembership;
      
      // Last Visited Timestamp
      if (typeof payloadData.lastVisited === 'string') updates.lastSessionDate = payloadData.lastVisited;
      
      // Prebooked Schedule Arrays
      if (Array.isArray(payloadData.prebookedSchedules)) updates.prebookedSchedules = payloadData.prebookedSchedules;
      if (Array.isArray(payloadData.upcomingBookings)) updates.upcomingBookings = payloadData.upcomingBookings;

      // Extract mindbody_name if given to help match
      if (typeof payloadData.firstName === 'string' || typeof payloadData.lastName === 'string') {
         updates.mindbody_name = `${typeof payloadData.firstName === 'string' ? payloadData.firstName : ''} ${typeof payloadData.lastName === 'string' ? payloadData.lastName : ''}`.trim();
      }

      // Execute an atomic Firestore set() operation with { merge: true }
      const clientDocId = String(clientId);
      const clientRef = deps.firestore.collection('clients').doc(clientDocId);
      
      await clientRef.set(updates, { merge: true });
    }

    return { statusCode: 200 };
    
  // 4. Resiliency & Edge Errors
  } catch (error) {
    console.error("Webhook processing error:", { error: String(error) });
    
    await recordHealthEvent(deps.firestore, { type: 'webhook_failure' });
    
    // Catch errors without silently swallowing them
    return { statusCode: 500 };
  }
}

const mindbodyWebhookSecret = defineSecret('MINDBODY_WEBHOOK_SECRET');
let firestoreInstance: Firestore | null = null;

/**
 * The expected public entry point for Mindbody webhooks.
 * Wires the pure HTTP handler logic to Firebase, Pub/Sub, and secret parameters.
 * Lazy initialization is used for external clients.
 */
export const mindbodyWebhook = onRequest(
  { secrets: [mindbodyWebhookSecret], cors: false, region: 'us-central1', maxInstances: 100, timeoutSeconds: 10 },
  async (req, res) => {
    if (!firestoreInstance) {
      firestoreInstance = getFirestore();
    }

    const payloadBuffer = req.rawBody; // req.rawBody is a Buffer natively in firebase-functions
    const rawBodyStr = payloadBuffer.toString('utf8');

    const deps: WebhookDeps = {
      firestore: firestoreInstance,
      webhookSecret: mindbodyWebhookSecret.value(),
    };

    const webhookReq: WebhookRequest = {
      rawBody: rawBodyStr,
      signatureHeader: req.header('x-mindbody-signature'),
    };

    const response = await handleMindbodyWebhook(deps, webhookReq);
    res.status(response.statusCode).send(response.body || '');
  }
);
