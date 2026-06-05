"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const crypto = require("node:crypto");
const verifySignature_1 = require("./verifySignature");
(0, vitest_1.describe)('verifyMindbodySignature', () => {
    const webhookSecret = 'test_secret_123';
    const rawBody = JSON.stringify({
        messageId: 'msg_123',
        eventId: 'evt_abc',
        eventData: { siteId: 9999 },
        eventInstanceOriginationDateTime: '2023-01-01T12:00:00Z',
    });
    const generateSignature = (body, secret) => crypto.createHmac('sha256', secret).update(body, 'utf8').digest('base64');
    const validSignature = generateSignature(rawBody, webhookSecret);
    (0, vitest_1.it)('valid signature for a known payload + secret -> true', () => {
        (0, vitest_1.expect)((0, verifySignature_1.verifyMindbodySignature)(rawBody, validSignature, webhookSecret)).toBe(true);
    });
    (0, vitest_1.it)('tampered body (one character changed), original signature -> false', () => {
        const tamperedBody = rawBody.replace('9999', '9998');
        (0, vitest_1.expect)((0, verifySignature_1.verifyMindbodySignature)(tamperedBody, validSignature, webhookSecret)).toBe(false);
    });
    (0, vitest_1.it)('tampered signature (one character changed), original body -> false', () => {
        const altChar = validSignature[0] === 'A' ? 'B' : 'A';
        const tamperedSignature = altChar + validSignature.slice(1);
        (0, vitest_1.expect)((0, verifySignature_1.verifyMindbodySignature)(rawBody, tamperedSignature, webhookSecret)).toBe(false);
    });
    (0, vitest_1.it)('empty string for rawBody -> false, does not throw', () => {
        (0, vitest_1.expect)((0, verifySignature_1.verifyMindbodySignature)('', validSignature, webhookSecret)).toBe(false);
    });
    (0, vitest_1.it)('empty string for receivedSignature -> false, does not throw', () => {
        (0, vitest_1.expect)((0, verifySignature_1.verifyMindbodySignature)(rawBody, '', webhookSecret)).toBe(false);
    });
    (0, vitest_1.it)('empty string for webhookSecret -> false, does not throw', () => {
        (0, vitest_1.expect)((0, verifySignature_1.verifyMindbodySignature)(rawBody, validSignature, '')).toBe(false);
    });
    (0, vitest_1.it)('length-mismatched signature buffer -> false, does not throw', () => {
        (0, vitest_1.expect)((0, verifySignature_1.verifyMindbodySignature)(rawBody, validSignature + 'A', webhookSecret)).toBe(false);
    });
    (0, vitest_1.it)('Unicode payload (emoji in a client name field) -> verifies correctly', () => {
        const emojiBody = JSON.stringify({ name: 'John Doe 🧑‍🚀' });
        const emojiSignature = generateSignature(emojiBody, webhookSecret);
        (0, vitest_1.expect)((0, verifySignature_1.verifyMindbodySignature)(emojiBody, emojiSignature, webhookSecret)).toBe(true);
    });
    (0, vitest_1.it)('whitespace-only inputs -> false, does not throw', () => {
        (0, vitest_1.expect)((0, verifySignature_1.verifyMindbodySignature)('   ', '   ', '   ')).toBe(false);
        (0, vitest_1.expect)((0, verifySignature_1.verifyMindbodySignature)(rawBody, '\t\n', webhookSecret)).toBe(false);
    });
    vitest_1.it.skip('Constant-time property: 1000 iterations comparing matching vs. non-matching signatures', () => {
        // This skipped test documents the intent of verifying that constant-time 
        // properties hold during execution (avoiding early return timing leaks).
        const iterations = 1000;
        const mismatches = generateSignature('other_body', webhookSecret);
        const startValid = process.hrtime.bigint();
        for (let i = 0; i < iterations; i++) {
            (0, verifySignature_1.verifyMindbodySignature)(rawBody, validSignature, webhookSecret);
        }
        const endValid = process.hrtime.bigint();
        const startInvalid = process.hrtime.bigint();
        for (let i = 0; i < iterations; i++) {
            (0, verifySignature_1.verifyMindbodySignature)(rawBody, mismatches, webhookSecret);
        }
        const endInvalid = process.hrtime.bigint();
        const diffValid = Number(endValid - startValid);
        const diffInvalid = Number(endInvalid - startInvalid);
        const ratio = diffValid / diffInvalid;
        (0, vitest_1.expect)(ratio).toBeGreaterThan(0.8);
        (0, vitest_1.expect)(ratio).toBeLessThan(1.2);
    });
});
//# sourceMappingURL=verifySignature.test.js.map