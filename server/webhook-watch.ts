/**
 * Once a night: is Mindbody's webhook subscription still on?
 *
 * The cost plan (Sep 26 2026, A7). Asks Mindbody's webhooks API for Journey's
 * subscriptions - one GET per Mindbody site, through the same floor as every
 * other call - and keeps what is safe to keep at `system/mindbodyWebhook`
 * (src/lib/webhook-watch.ts decides what that is; never the signing key).
 * Operations -> Mindbody reads it. Run by server/cron-renewals.ts after the
 * renewals job; a failure here never fails that job.
 *
 * When Mindbody cannot be asked, only the time and the error are written, so
 * the last good answer stays beside them and the screen says it is unsure.
 */

import type { Firestore } from "firebase-admin/firestore";
import { mindbodyFetch } from "./mindbody-client.ts";
import { watchFrom, type WebhookWatch } from "../src/lib/webhook-watch.ts";

const PUSH_API = "https://mb-api.mindbodyonline.com/push/api/v1/subscriptions";
/** The path of Journey's webhook function, as register-webhook.js subscribes it. */
const WEBHOOK_PATH = "/mindbodyWebhook";

export async function checkWebhookSubscriptions(
  db: Firestore,
  options: { dryRun?: boolean; log?: (line: string) => void } = {},
): Promise<WebhookWatch | null> {
  const log = options.log ?? ((line: string) => console.log(`[webhook-watch] ${line}`));
  const apiKey = process.env.MINDBODY_API_KEY;
  if (!apiKey) {
    log("MINDBODY_API_KEY is not set: the webhook subscription was not checked.");
    return null;
  }
  const studios = await db.collection("studios").get();
  const sites = [
    ...new Set(
      studios.docs.map((d) => String(d.get("mindbodySiteId") ?? "").trim()).filter((s) => s !== ""),
    ),
  ];
  const bodies: unknown[] = [];
  const errors: string[] = [];
  for (const site of sites) {
    const r = await mindbodyFetch(site, "push/subscriptions", PUSH_API, {
      method: "GET",
      headers: { "Content-Type": "application/json", "Api-Key": apiKey, SiteId: site },
    });
    if (!r.ok) {
      errors.push(`site ${site}: HTTP ${r.status}`);
      continue;
    }
    // An answer Journey cannot read is an error, never "no subscription":
    // that would raise a false alarm on Operations -> Mindbody.
    const body = await r.json().catch(() => undefined);
    if (body === undefined || body === null) errors.push(`site ${site}: an answer Journey could not read`);
    else bodies.push(body);
  }
  const checkedAt = new Date().toISOString();
  const ref = db.doc("system/mindbodyWebhook");
  if (bodies.length === 0) {
    const error = errors[0] ?? "no Mindbody site is configured";
    log(`Could not ask Mindbody about the webhook subscription (${error}).`);
    if (!options.dryRun) await ref.set({ checkedAt, error }, { merge: true });
    return null;
  }
  const watch = { ...watchFrom(bodies, WEBHOOK_PATH, checkedAt), error: null };
  log(
    watch.active
      ? `Webhook subscription active (${watch.subscriptions.length} listed).`
      : `NO active webhook subscription for Journey (${watch.subscriptions.map((s) => `${s.id}: ${s.status}`).join(", ") || "none listed"}).`,
  );
  if (!options.dryRun) await ref.set(watch);
  return watch;
}
