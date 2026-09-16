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

/**
 * Two ids on one record that disagree — a reason to refuse a sync, never to
 * pick one. Review round (Sep 2026): the old profile sync fell back to a NAME
 * search when the id lookup found nothing and staged that result's id onto the
 * record, so a client document can carry a namesake's Mindbody id. A
 * one-tap Master Sync from such a record would write the namesake's name,
 * birthday, contact and waiver onto it. Null when the ids agree or only one
 * exists.
 */
export function mindbodyIdConflict(
  client: MindbodyIdSource | null | undefined,
): { ids: string[] } | null {
  if (!client) return null;
  const ids = new Set<string>();
  const docId = String(client.id || "").trim();
  if (/^\d{1,20}$/.test(docId)) ids.add(docId);
  for (const v of [client.mindbodyClientId, client.mindbodyId]) {
    const t = String(v ?? "").trim();
    if (t) ids.add(t);
  }
  return ids.size > 1 ? { ids: [...ids] } : null;
}
