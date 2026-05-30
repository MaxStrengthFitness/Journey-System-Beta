import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as crypto from 'node:crypto';
import { handleMindbodyWebhook, WebhookRequest, WebhookDeps, PUBSUB_TOPIC } from './index';
import { recordHealthEvent } from './healthState';
import { Firestore } from 'firebase-admin/firestore';

vi.mock('./healthState', () => ({
  recordHealthEvent: vi.fn(),
}));

function signForTest(body: string, secret: string) {
  return crypto.createHmac('sha256', secret).update(body, 'utf8').digest('base64');
}

const mockSecret = 'test_secret_123';

function createValidEnvelope(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    messageId: 'msg-f47ac10b-58cc-4372-a567-0e02b2c3d479',
    eventId: 'evt-appointmentBooking-created',
    eventSchemaVersion: 1,
    eventInstanceOriginationDateTime: '2024-01-01T12:00:00Z',
    eventData: { siteId: 99999, appointmentId: 12345 },
    ...overrides,
  });
}

describe('handleMindbodyWebhook', () => {
  let deps: WebhookDeps;
  let publishSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    publishSpy = vi.fn().mockResolvedValue('pubsub-msg-1') as any;
    deps = {
      firestore: {} as Firestore,
      publishMessage: publishSpy as any,
      webhookSecret: mockSecret,
    };
  });

  it('1. Valid signature + valid envelope -> publishes and returns 200', async () => {
    const rawBody = createValidEnvelope();
    const signatureHeader = signForTest(rawBody, mockSecret);
    const req: WebhookRequest = { rawBody, signatureHeader };

    const response = await handleMindbodyWebhook(deps, req);

    expect(response.statusCode).toBe(200);
    expect(publishSpy).toHaveBeenCalledTimes(1);
    expect(publishSpy).toHaveBeenCalledWith(
      PUBSUB_TOPIC,
      Buffer.from(rawBody, 'utf8'),
      { messageId: 'msg-f47ac10b-58cc-4372-a567-0e02b2c3d479' }
    );
  });

  it('2. Invalid signature -> no publish, signature_failure health event, returns 401', async () => {
    const rawBody = createValidEnvelope();
    const req: WebhookRequest = { rawBody, signatureHeader: 'bad_sig' };

    const response = await handleMindbodyWebhook(deps, req);

    expect(response.statusCode).toBe(401);
    expect(publishSpy).not.toHaveBeenCalled();
    expect(recordHealthEvent).toHaveBeenCalledWith(deps.firestore, { type: 'signature_failure' });
  });

  it('3. Missing signature header -> no publish, signature_failure health event, returns 401', async () => {
    const rawBody = createValidEnvelope();
    const req: WebhookRequest = { rawBody, signatureHeader: undefined };

    const response = await handleMindbodyWebhook(deps, req);

    expect(response.statusCode).toBe(401);
    expect(publishSpy).not.toHaveBeenCalled();
    expect(recordHealthEvent).toHaveBeenCalledWith(deps.firestore, { type: 'signature_failure' });
  });

  it('4. Valid signature, malformed JSON -> no publish, NO health event, returns 400', async () => {
    const rawBody = '{ bad json';
    const signatureHeader = signForTest(rawBody, mockSecret);
    const req: WebhookRequest = { rawBody, signatureHeader };

    const response = await handleMindbodyWebhook(deps, req);

    expect(response.statusCode).toBe(400);
    expect(publishSpy).not.toHaveBeenCalled();
    expect(recordHealthEvent).not.toHaveBeenCalled();
  });

  it('5. Valid signature, missing messageId -> returns 400', async () => {
    const rawBody = createValidEnvelope({ messageId: undefined });
    const signatureHeader = signForTest(rawBody, mockSecret);
    const req: WebhookRequest = { rawBody, signatureHeader };

    const response = await handleMindbodyWebhook(deps, req);

    expect(response.statusCode).toBe(400);
  });

  it('6. Valid signature, missing eventId -> returns 400', async () => {
    const rawBody = createValidEnvelope({ eventId: undefined });
    const signatureHeader = signForTest(rawBody, mockSecret);
    const req: WebhookRequest = { rawBody, signatureHeader };

    const response = await handleMindbodyWebhook(deps, req);

    expect(response.statusCode).toBe(400);
  });

  it('7. Valid signature, missing origination date -> returns 400', async () => {
    const rawBody = createValidEnvelope({ eventInstanceOriginationDateTime: undefined });
    const signatureHeader = signForTest(rawBody, mockSecret);
    const req: WebhookRequest = { rawBody, signatureHeader };

    const response = await handleMindbodyWebhook(deps, req);

    expect(response.statusCode).toBe(400);
  });

  it('8. Valid signature, publish throws -> webhook_failure health event, returns 500', async () => {
    publishSpy.mockRejectedValue(new Error('Pub/Sub unavailable'));
    const rawBody = createValidEnvelope();
    const signatureHeader = signForTest(rawBody, mockSecret);
    const req: WebhookRequest = { rawBody, signatureHeader };

    const response = await handleMindbodyWebhook(deps, req);

    expect(response.statusCode).toBe(500);
    expect(recordHealthEvent).toHaveBeenCalledWith(deps.firestore, { type: 'webhook_failure' });
  });

  it('9. Two valid calls with the SAME messageId -> both publish (testing idempotency is offloaded)', async () => {
    const rawBody = createValidEnvelope();
    const signatureHeader = signForTest(rawBody, mockSecret);
    const req: WebhookRequest = { rawBody, signatureHeader };

    const response1 = await handleMindbodyWebhook(deps, req);
    const response2 = await handleMindbodyWebhook(deps, req);

    expect(response1.statusCode).toBe(200);
    expect(response2.statusCode).toBe(200);
    expect(publishSpy).toHaveBeenCalledTimes(2);
  });

  it('10. messageId attribute exactly matches body messageId', async () => {
    const myMsgId = 'custom-msg-id-123';
    const rawBody = createValidEnvelope({ messageId: myMsgId });
    const signatureHeader = signForTest(rawBody, mockSecret);
    const req: WebhookRequest = { rawBody, signatureHeader };

    await handleMindbodyWebhook(deps, req);

    const callArgs = publishSpy.mock.calls[0];
    expect(callArgs[2]).toEqual({ messageId: myMsgId });
  });
});
