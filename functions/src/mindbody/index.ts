import { Firestore, getFirestore } from 'firebase-admin/firestore';
import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { PubSub } from '@google-cloud/pubsub';
import { verifyMindbodySignature } from './verifySignature';
import { recordHealthEvent } from './healthState';

export const PUBSUB_TOPIC = 'mindbody-events';

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
  publishMessage: (
    topic: string,
    data: Buffer,
    attributes: Record<string, string>
  ) => Promise<string>;
  webhookSecret: string;
};

/**
 * Handles incoming Mindbody webhooks.
 * Validates the signature, ensures the payload contains required envelope fields,
 * and publishes the event durably to Pub/Sub for downstream processing.
 * 
 * Returns:
 * - 200: Successfully enqueued to Pub/Sub
 * - 400: Malformed JSON or missing required envelope fields
 * - 401: Invalid signature
 * - 500: Unexpected error publishing to Pub/Sub
 */
export async function handleMindbodyWebhook(
  deps: WebhookDeps,
  req: WebhookRequest
): Promise<WebhookResponse> {
  const signature = req.signatureHeader || '';
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

  if (
    typeof parsed.messageId !== 'string' || !parsed.messageId.trim() ||
    typeof parsed.eventId !== 'string' || !parsed.eventId.trim() ||
    typeof parsed.eventInstanceOriginationDateTime !== 'string' || !parsed.eventInstanceOriginationDateTime.trim()
  ) {
    return { statusCode: 400 };
  }

  try {
    await deps.publishMessage(
      PUBSUB_TOPIC,
      Buffer.from(req.rawBody, 'utf8'),
      { messageId: parsed.messageId }
    );
    return { statusCode: 200 };
  } catch (e) {
    await recordHealthEvent(deps.firestore, { type: 'webhook_failure' });
    return { statusCode: 500 };
  }
}

const mindbodyWebhookSecret = defineSecret('MINDBODY_WEBHOOK_SECRET');
let firestoreInstance: Firestore | null = null;
let pubsubInstance: PubSub | null = null;

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
    if (!pubsubInstance) {
      pubsubInstance = new PubSub();
    }

    const payloadBuffer = req.rawBody; // req.rawBody is a Buffer natively in firebase-functions
    const rawBodyStr = payloadBuffer.toString('utf8');

    const deps: WebhookDeps = {
      firestore: firestoreInstance,
      publishMessage: async (topic, data, attributes) => {
        return await pubsubInstance!.topic(topic).publishMessage({ data, attributes });
      },
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
