/**
 * IS MINDBODY'S WEBHOOK STILL ON? - read nightly, said on Operations -> Mindbody.
 *
 * The cost plan (docs/rounds/2026-09-26-cost-plan.md, A7). Client details and
 * packages now arrive "when they change" - by the webhook - and the webhook
 * brings today's changes in seconds. Mindbody switches a subscription off after
 * repeated failed deliveries, and on Sep 26 nobody could say whether it had
 * ever been switched on. So each night the renewals job asks Mindbody's
 * webhooks API for its subscriptions (server/webhook-watch.ts) and keeps the
 * answer at `system/mindbodyWebhook`; this module reads that answer and turns
 * it into one sentence for the screen.
 *
 * Never kept: the subscription's signing key. Only its id, status, event
 * names, when and why its status last changed, and whether it points at
 * Journey's webhook.
 *
 * PURE MODULE - no Firestore, no network.
 */

export interface WatchedSubscription {
  id: string;
  status: string;
  eventIds: string[];
  /** It points at Journey's own webhook function. */
  ours: boolean;
  statusChangedAt: string | null;
  statusChangeMessage: string | null;
}

export interface WebhookWatch {
  /** ISO time of the check. */
  checkedAt: string;
  /** At least one ACTIVE subscription points at Journey's webhook. */
  active: boolean;
  subscriptions: WatchedSubscription[];
  /** When Mindbody could not be asked: its words. The last good answer is kept elsewhere. */
  error?: string | null;
}

const pick = (o: Record<string, unknown>, ...keys: string[]): unknown => {
  for (const k of keys) if (o[k] !== undefined && o[k] !== null) return o[k];
  return undefined;
};

/** Mindbody's list, in whatever envelope it came, as rows. */
export function subscriptionRows(body: unknown): Record<string, unknown>[] {
  if (Array.isArray(body)) return body as Record<string, unknown>[];
  if (body && typeof body === "object") {
    const o = body as Record<string, unknown>;
    const list = pick(o, "items", "Items", "subscriptions", "Subscriptions");
    if (Array.isArray(list)) return list as Record<string, unknown>[];
  }
  return [];
}

/**
 * The subscriptions Mindbody listed, merged across the sites asked (the
 * subscription belongs to the developer account, so each site may list the
 * same one), kept to what is safe to store.
 */
export function watchFrom(bodies: unknown[], webhookPath: string, checkedAt: string): WebhookWatch {
  const byId = new Map<string, WatchedSubscription>();
  for (const body of bodies) {
    for (const row of subscriptionRows(body)) {
      const id = String(pick(row, "subscriptionId", "SubscriptionId", "id", "Id") ?? "").trim();
      if (!id || byId.has(id)) continue;
      const url = String(pick(row, "webhookUrl", "WebhookUrl") ?? "");
      const events = pick(row, "eventIds", "EventIds");
      byId.set(id, {
        id,
        status: String(pick(row, "status", "Status") ?? "Unknown"),
        eventIds: Array.isArray(events) ? events.map(String) : [],
        ours: url.includes(webhookPath),
        statusChangedAt: (pick(row, "statusChangeDate", "StatusChangeDate") as string | undefined) ?? null,
        statusChangeMessage: (pick(row, "statusChangeMessage", "StatusChangeMessage") as string | undefined) ?? null,
      });
    }
  }
  const subscriptions = [...byId.values()];
  return {
    checkedAt,
    active: subscriptions.some((s) => s.ours && s.status.toLowerCase() === "active"),
    subscriptions,
  };
}

/** A check older than this says so: the nightly job has stopped checking. */
export const WATCH_STALE_MS = 48 * 60 * 60 * 1000;

export interface WatchLine {
  tone: "ok" | "info" | "warn" | "alert";
  text: string;
}

function when(iso: string, now: number): string {
  const hours = Math.max(0, Math.floor((now - Date.parse(iso)) / 3_600_000));
  if (hours < 1) return "within the hour";
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

/** The sentence Operations -> Mindbody shows. */
export function watchLine(watch: WebhookWatch | null | undefined, now: number): WatchLine {
  if (!watch || !watch.checkedAt || !Number.isFinite(Date.parse(watch.checkedAt))) {
    return {
      tone: "info",
      text: "Mindbody's webhook subscription has not been checked yet. The nightly job checks it; until then, today's changes are guaranteed only by the 30-minute pull.",
    };
  }
  const checked = when(watch.checkedAt, now);
  if (watch.error) {
    return {
      tone: "warn",
      text: `Mindbody could not be asked about its webhook subscription ${checked} (${watch.error.slice(0, 120)}).`,
    };
  }
  if (now - Date.parse(watch.checkedAt) > WATCH_STALE_MS) {
    return {
      tone: "warn",
      text: `Mindbody's webhook subscription was last checked ${checked}: the nightly check has stopped running.`,
    };
  }
  if (watch.active) {
    const ours = watch.subscriptions.find((s) => s.ours && s.status.toLowerCase() === "active");
    return {
      tone: "ok",
      text: `Mindbody's webhook subscription is active (checked ${checked}, ${ours?.eventIds.length ?? 0} kinds of event): changes reach Journey within seconds, and the 30-minute pull is the safety net.`,
    };
  }
  const ours = watch.subscriptions.find((s) => s.ours);
  const why = ours
    ? ` Mindbody says "${ours.status}"${ours.statusChangeMessage ? `: ${ours.statusChangeMessage.slice(0, 120)}` : ""}.`
    : " Mindbody lists none pointing at Journey.";
  return {
    tone: "alert",
    text: `Mindbody's webhook subscription is not active (checked ${checked}).${why} Changes made in Mindbody reach Journey only through the 30-minute pull until an administrator switches it back on.`,
  };
}
