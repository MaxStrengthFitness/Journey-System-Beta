"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyMindbodySignature = verifyMindbodySignature;
const crypto = require("node:crypto");
/**
 * Verifies a Mindbody webhook payload signature.
 *
 * @param rawBody - The raw, unmodified JSON string of the request body.
 * @param receivedSignature - The X-Mindbody-Signature header value.
 * @param webhookSecret - The per-subscription client secret.
 * @returns true if the signature is valid, false otherwise (including on empty/whitespace inputs or length mismatches).
 */
function verifyMindbodySignature(rawBody, receivedSignature, webhookSecret) {
    if (!rawBody.trim() || !receivedSignature.trim() || !webhookSecret.trim()) {
        return false;
    }
    const expectedSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(rawBody, 'utf8')
        .digest('base64');
    const expectedBuffer = Buffer.from(expectedSignature);
    const receivedBuffer = Buffer.from(receivedSignature);
    if (expectedBuffer.length !== receivedBuffer.length) {
        return false;
    }
    return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}
//# sourceMappingURL=verifySignature.js.map