/**
 * SYNC ON FIRST BOOKING — who the nightly job brings up to date with Mindbody.
 *
 * The cost plan (docs/rounds/2026-09-26-cost-plan.md, B5). The pre-launch sync
 * covers everyone booked in the next 30 days or seen in the last 6 months; after
 * launch, everyone else arrives by booking: a new client, a lapsed one coming
 * back, a lead's first session. Each night the renewals job Master-Syncs anyone
 * booked TODAY or TOMORROW who has never been synced, so by the time they walk
 * in the Hub has their name, their visit count and their package.
 *
 * NEVER-SYNCED ONLY. There is no re-sync on a timer: AJ ranked client details
 * "only when it changes" (the webhook's client.updated, the profile's Sync) and
 * packages "when a sale happens" (Part C), and a visit count only has to be
 * known once - it decides whether Journey holds the whole story, which does not
 * change after the first sync.
 *
 * A same-day booking by someone never synced gets their name from the schedule
 * pull and their sync the next night; until then their history reads "unknown"
 * (lib/prior-history.ts), never "New".
 *
 * PURE MODULE - no Firestore, no network.
 */

import { mindbodyIdConflict, mindbodyIdOf, type MindbodyIdSource } from "./mindbody-id";

/** Default nightly budget, in clients: 5 Mindbody calls each. */
export const DEFAULT_FIRST_SYNC_MAX = 60;

export interface FirstSyncClient extends MindbodyIdSource {
  mindbodyMasterSyncedAt?: unknown;
  provisional?: boolean;
}

/**
 * Should tonight's job Master-Sync this client?
 *
 * @param bookedDays the studio days ("YYYY-MM-DD") of this client's LIVE
 *   bookings (cancelled ones left out by the caller)
 * @param today the studio's today; tomorrow is the next calendar day
 */
export function needsFirstSync(client: FirstSyncClient | null | undefined, bookedDays: readonly string[], today: string, tomorrow: string): boolean {
  if (!client) return false;
  if (typeof client.mindbodyMasterSyncedAt === "string" && client.mindbodyMasterSyncedAt !== "") return false;
  if (!mindbodyIdOf(client)) return false;
  if (mindbodyIdConflict(client)) return false;
  return bookedDays.some((d) => d === today || d === tomorrow);
}

/** Today's bookings first, then tomorrow's; a stable order inside each. */
export function firstSyncOrder<T extends { firstDay: string; id: string }>(a: T, b: T): number {
  return a.firstDay.localeCompare(b.firstDay) || a.id.localeCompare(b.id);
}
