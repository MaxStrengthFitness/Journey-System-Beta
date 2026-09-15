/**
 * THE MINDBODY ID OF A CLIENT — one answer, used everywhere.
 *
 * Master Sync round (Sep 2026). This rule used to live in
 * features/renewals/job-plan.ts, and every screen repeated its own half of it
 * (`client.mindbodyClientId || client.mindbodyId`). Two field names exist
 * because the webhook writes `mindbodyClientId` and older app paths wrote
 * `mindbodyId`, so a client made by the webhook showed a blank "Mindbody ID"
 * on screens that read only the older name. job-plan.ts re-exports this.
 *
 * A Mindbody client's document id IS their Mindbody id (CLAUDE.md), but only
 * a numeric one is trusted as such: a Firestore auto-id belongs to a client
 * Mindbody has never heard of, and asking about it would spend calls on
 * nothing. Never a name: a client is never looked up by name.
 */

/** The fields this rule reads — narrow, so any client-shaped object fits. */
export interface MindbodyIdSource {
  id?: string | null;
  mindbodyClientId?: string | number | null;
  mindbodyId?: string | number | null;
  provisional?: boolean | null;
  supersededById?: string | null;
  migratedTo?: string | null;
}

/**
 * The Mindbody id to ask about, or null when there is none to ask.
 *
 * Null for a temporary profile (it has no Mindbody counterpart yet) and for a
 * record merged away into another one (the survivor is the one to sync).
 */
export function mindbodyIdOf(client: MindbodyIdSource | null | undefined): string | null {
  if (!client) return null;
  if (client.provisional || client.supersededById || client.migratedTo) return null;
  const explicit = String(client.mindbodyClientId || client.mindbodyId || "").trim();
  if (explicit) return /^[A-Za-z0-9_-]{1,40}$/.test(explicit) ? explicit : null;
  const docId = String(client.id || "").trim();
  return /^\d{1,20}$/.test(docId) ? docId : null;
}
