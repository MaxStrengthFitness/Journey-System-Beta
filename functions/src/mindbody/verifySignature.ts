import * as crypto from "node:crypto";

/**
 * Verifies a Mindbody webhook payload signature.
 *
 * Mindbody's documented method (developers.mindbodyonline.com/
 * WebhooksDocumentation, "Validating a webhook"): HMAC-SHA-256 of the raw
 * request body, UTF-8, keyed with the subscription's `messageSignatureKey`
 * AS A UTF-8 STRING, base64-encoded, sent as `X-Mindbody-Signature:
 * sha256={base64}`.
 *
 * Sep 24 2026. Until now this function compared against the bare base64 with
 * no `sha256=` prefix and base64-DECODED a 44-character key first, so every
 * real Mindbody event failed the length check and was answered 401; Mindbody
 * then deactivated the subscriptions for "too many failed message delivery
 * attempts". The only events it ever accepted (Aug 7-20, typed
 * "clientUpdated") came from the app's own test button. It also accepted the
 * literal header "test-signature" from anyone, which let any caller write to
 * production through the webhook. Both are gone.
 *
 * The prefix is optional on the way in, so a bare base64 signature made with
 * the same key and method still verifies.
 *
 * @param rawBody - The raw, unmodified JSON string of the request body.
 * @param receivedSignature - The X-Mindbody-Signature header value.
 * @param webhookSecret - The subscription's messageSignatureKey.
 * @returns true only for a signature made with this key over this body.
 */
export function verifyMindbodySignature(
  rawBody: string,
  receivedSignature: string,
  webhookSecret: string,
): boolean {
  if (!rawBody.trim() || !receivedSignature.trim()) return false;
  if (!webhookSecret || !webhookSecret.trim()) return false;

  const received = receivedSignature.trim().replace(/^sha256=/i, "");
  const expected = signMindbodyPayload(rawBody, webhookSecret).replace(/^sha256=/, "");

  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);
  if (expectedBuffer.length !== receivedBuffer.length) return false;
  return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}

/** The header value Mindbody would send for this body: `sha256={base64}`. */
export function signMindbodyPayload(rawBody: string, webhookSecret: string): string {
  const hash = crypto
    .createHmac("sha256", Buffer.from(webhookSecret, "utf8"))
    .update(rawBody, "utf8")
    .digest("base64");
  return `sha256=${hash}`;
}
