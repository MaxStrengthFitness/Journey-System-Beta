import { Firestore, FieldValue, Timestamp } from "firebase-admin/firestore";

/**
 * Health events triggered by the webhook lifecycle.
 */
export type HealthEvent =
  | { type: "webhook_success"; hydrationLatencyMs: number }
  | { type: "webhook_failure" }
  | { type: "signature_failure" }
  | { type: "subscription_status"; active: boolean }
  | { type: "dlq_depth_changed"; depth: number };

type HealthDoc = {
  status: "healthy" | "degraded" | "error" | "offline";
  lastSuccessfulEventAt: Timestamp | null;
  lastFailureAt: Timestamp | null;
  dlqDepth: number;
  signatureFailures24h: number;
  webhookSubscriptionActive: boolean;
  hydrationP95LatencyMs: number;
  updatedAt: FieldValue;
};

/**
 * A success within this long of the last recorded one, on a doc that is
 * already healthy, changes nothing a reader shows - so it is not written.
 */
export const HEALTH_QUIET_MS = 60 * 1000;

/**
 * Does this event change what system/health says? (The cost plan, Sep 26
 * 2026, D3a.)
 *
 * Every iPad in the company watches system/health (MindbodyHealthContext),
 * so each write is read once by every connected iPad - and this used to be
 * written on EVERY webhook event, the one bookkeeping write the webhook
 * going live would have added to that fan-out. Now a success that lands
 * within HEALTH_QUIET_MS of the last recorded success, on a doc that stays
 * healthy with nothing else changed, is skipped: at most one write a minute
 * while events stream in, and every change of status still written at once.
 * Failures, signature failures, subscription and DLQ events always write.
 */
export function healthWriteNeeded(
  before: Omit<HealthDoc, "updatedAt"> | null,
  after: Omit<HealthDoc, "updatedAt">,
  event: HealthEvent,
  now: number,
): boolean {
  if (!before || event.type !== "webhook_success") return true;
  if (before.status !== after.status) return true;
  if (after.status !== "healthy") return true;
  if (
    before.dlqDepth !== after.dlqDepth ||
    before.signatureFailures24h !== after.signatureFailures24h ||
    before.webhookSubscriptionActive !== after.webhookSubscriptionActive
  ) {
    return true;
  }
  const last = before.lastSuccessfulEventAt;
  const lastMs = last && typeof last.toMillis === "function" ? last.toMillis() : null;
  return lastMs === null || now - lastMs >= HEALTH_QUIET_MS;
}

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
export async function recordHealthEvent(
  firestore: Firestore,
  event: HealthEvent,
): Promise<void> {
  if (event.type === "dlq_depth_changed") {
    if (!Number.isInteger(event.depth) || event.depth < 0) {
      throw new RangeError("depth must be a non-negative integer");
    }
  } else if (event.type === "webhook_success") {
    if (
      !Number.isInteger(event.hydrationLatencyMs) ||
      event.hydrationLatencyMs < 0
    ) {
      throw new RangeError("hydrationLatencyMs must be a non-negative integer");
    }
  }

  const docRef = firestore.collection("system").doc("health");

  await firestore.runTransaction(async (transaction) => {
    const sn = await transaction.get(docRef);
    let data: Omit<HealthDoc, "updatedAt"> = {
      status: "healthy",
      lastSuccessfulEventAt: null,
      lastFailureAt: null,
      dlqDepth: 0,
      signatureFailures24h: 0,
      webhookSubscriptionActive: true,
      hydrationP95LatencyMs: 0,
    };

    let before: Omit<HealthDoc, "updatedAt"> | null = null;
    if (sn.exists) {
      const existing = sn.data() as Omit<HealthDoc, "updatedAt">;
      data = { ...data, ...existing };
      before = { ...data };
    }

    const now = Date.now();
    const nowTimestamp = Timestamp.fromMillis(now);

    switch (event.type) {
      case "webhook_success":
        data.lastSuccessfulEventAt = nowTimestamp;
        data.hydrationP95LatencyMs = event.hydrationLatencyMs;
        data.webhookSubscriptionActive = true;
        data.signatureFailures24h = 0;
        break;
      case "webhook_failure":
        data.lastFailureAt = nowTimestamp;
        break;
      case "signature_failure":
        data.signatureFailures24h += 1;
        break;
      case "subscription_status":
        data.webhookSubscriptionActive = event.active;
        break;
      case "dlq_depth_changed":
        data.dlqDepth = event.depth;
        break;
    }

    const successAgeMs = data.lastSuccessfulEventAt
      ? now - data.lastSuccessfulEventAt.toMillis()
      : Infinity;

    if (!data.webhookSubscriptionActive) {
      data.status = "offline";
    } else if (data.signatureFailures24h > 0) {
      data.status = "error";
    } else if (data.dlqDepth > 10) {
      data.status = "error";
    } else if (successAgeMs > 5 * 60 * 1000) {
      data.status = "error";
    } else if (data.dlqDepth >= 1 && data.dlqDepth <= 10) {
      data.status = "degraded";
    } else if (successAgeMs > 60 * 1000) {
      data.status = "degraded";
    } else {
      data.status = "healthy";
    }

    if (!healthWriteNeeded(before, data, event, now)) return;

    const finalData: HealthDoc = {
      ...data,
      updatedAt: FieldValue.serverTimestamp(),
    };

    // cast needed because mock transaction expects Record<string, unknown>
    transaction.set(docRef, finalData as unknown as Record<string, unknown>);
  });
}
