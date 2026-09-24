import { describe, it, expect } from 'vitest';
import * as crypto from 'node:crypto';
import { signMindbodyPayload, verifyMindbodySignature } from './verifySignature';

describe('verifyMindbodySignature', () => {
  const webhookSecret = 'test_secret_123';
  const rawBody = JSON.stringify({
    messageId: 'msg_123',
    eventId: 'evt_abc',
    eventData: { siteId: 9999 },
    eventInstanceOriginationDateTime: '2023-01-01T12:00:00Z',
  });

  const generateSignature = (body: string, secret: string) =>
    crypto.createHmac('sha256', secret).update(body, 'utf8').digest('base64');

  const validSignature = generateSignature(rawBody, webhookSecret);

  it('valid signature for a known payload + secret -> true', () => {
    expect(verifyMindbodySignature(rawBody, validSignature, webhookSecret)).toBe(true);
  });

  it('tampered body (one character changed), original signature -> false', () => {
    const tamperedBody = rawBody.replace('9999', '9998');
    expect(verifyMindbodySignature(tamperedBody, validSignature, webhookSecret)).toBe(false);
  });

  it('tampered signature (one character changed), original body -> false', () => {
    const altChar = validSignature[0] === 'A' ? 'B' : 'A';
    const tamperedSignature = altChar + validSignature.slice(1);
    expect(verifyMindbodySignature(rawBody, tamperedSignature, webhookSecret)).toBe(false);
  });

  it('empty string for rawBody -> false, does not throw', () => {
    expect(verifyMindbodySignature('', validSignature, webhookSecret)).toBe(false);
  });

  it('empty string for receivedSignature -> false, does not throw', () => {
    expect(verifyMindbodySignature(rawBody, '', webhookSecret)).toBe(false);
  });

  it('empty string for webhookSecret -> false, does not throw', () => {
    expect(verifyMindbodySignature(rawBody, validSignature, '')).toBe(false);
  });

  it('length-mismatched signature buffer -> false, does not throw', () => {
    expect(verifyMindbodySignature(rawBody, validSignature + 'A', webhookSecret)).toBe(false);
  });

  it('Unicode payload (emoji in a client name field) -> verifies correctly', () => {
    const emojiBody = JSON.stringify({ name: 'John Doe 🧑‍🚀' });
    const emojiSignature = generateSignature(emojiBody, webhookSecret);
    expect(verifyMindbodySignature(emojiBody, emojiSignature, webhookSecret)).toBe(true);
  });

  it('whitespace-only inputs -> false, does not throw', () => {
    expect(verifyMindbodySignature('   ', '   ', '   ')).toBe(false);
    expect(verifyMindbodySignature(rawBody, '\t\n', webhookSecret)).toBe(false);
  });

  // Sep 24 2026 -- what Mindbody actually sends (WebhooksDocumentation).
  it('the documented header, sha256={base64}, verifies', () => {
    expect(verifyMindbodySignature(rawBody, `sha256=${validSignature}`, webhookSecret)).toBe(true);
    expect(signMindbodyPayload(rawBody, webhookSecret)).toBe(`sha256=${validSignature}`);
  });

  it('a real-shaped key (44 chars, base64-looking) is used as a UTF-8 string, not decoded', () => {
    const key = 'q3NcR7xk0vJmZs1l4yWbT8uE2pA9dFgH6iKoLnMeQrs=';
    expect(key).toHaveLength(44);
    const header = 'sha256=' + crypto.createHmac('sha256', Buffer.from(key, 'utf8')).update(rawBody, 'utf8').digest('base64');
    expect(verifyMindbodySignature(rawBody, header, key)).toBe(true);
    const decodedKeyHeader = 'sha256=' + crypto.createHmac('sha256', Buffer.from(key, 'base64')).update(rawBody, 'utf8').digest('base64');
    expect(verifyMindbodySignature(rawBody, decodedKeyHeader, key)).toBe(false);
  });

  it('the old "test-signature" back door is shut, with or without a secret', () => {
    expect(verifyMindbodySignature(rawBody, 'test-signature', webhookSecret)).toBe(false);
    expect(verifyMindbodySignature(rawBody, 'test-signature', '')).toBe(false);
  });

  it.skip('Constant-time property: 1000 iterations comparing matching vs. non-matching signatures', () => {
    // This skipped test documents the intent of verifying that constant-time 
    // properties hold during execution (avoiding early return timing leaks).
    const iterations = 1000;
    const mismatches = generateSignature('other_body', webhookSecret);
    
    const startValid = process.hrtime.bigint();
    for (let i = 0; i < iterations; i++) {
        verifyMindbodySignature(rawBody, validSignature, webhookSecret);
    }
    const endValid = process.hrtime.bigint();
    
    const startInvalid = process.hrtime.bigint();
    for (let i = 0; i < iterations; i++) {
        verifyMindbodySignature(rawBody, mismatches, webhookSecret);
    }
    const endInvalid = process.hrtime.bigint();

    const diffValid = Number(endValid - startValid);
    const diffInvalid = Number(endInvalid - startInvalid);
    
    const ratio = diffValid / diffInvalid;
    expect(ratio).toBeGreaterThan(0.8);
    expect(ratio).toBeLessThan(1.2);
  });
});
