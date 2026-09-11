import { doc, setDoc, serverTimestamp, Timestamp, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import { MindbodyContract, MindbodyMembership, MindbodyService } from "../types";
import { authedFetch } from "./authed-fetch";
import {
  mapContractRecords,
  mapMembershipRecords,
  mapServiceRecords,
} from "./mindbody-commercial-map";

/**
 * Pulls a client's Mindbody contracts and active memberships and mirrors them
 * onto the client document, using the same `mindbodyContracts` /
 * `mindbodyMemberships` maps the `clientContract.*` and
 * `clientMembershipAssignment.*` webhooks write.
 *
 * Why this exists: those webhooks only fire on future changes and only reach
 * the live project, so existing clients -- and every non-live environment --
 * would otherwise show an empty Admin panel forever.
 *
 * The write is additive by design. It creates and refreshes records but never
 * marks anything cancelled: `activeclientmemberships` returns only what is
 * currently active, so treating an absent record as cancelled would wrongly
 * void a membership any time the API returned a partial or paginated result.
 * Cancellations stay the webhook's job.
 *
 * Pricing options (`mindbodyServices`, Renewals round, Sep 2026) are the one
 * exception: that map is REPLACED on each successful pull, because it holds
 * the client's session balance and a used-up pricing option that drops out of
 * Mindbody's list must not keep counting. See lib/mindbody-commercial-map.ts.
 */

const toFirestoreTimestamp = (d: Date) => Timestamp.fromDate(d);

/** Maps the server route's contract rows into Firestore records. Exported for tests. */
export function mapContracts(
  rows: any[] | undefined,
  now: unknown,
): Record<string, Partial<MindbodyContract>> {
  return mapContractRecords(rows, now, toFirestoreTimestamp) as Record<
    string,
    Partial<MindbodyContract>
  >;
}

/** Maps the server route's membership rows into Firestore records. Exported for tests. */
export function mapMemberships(
  rows: any[] | undefined,
  now: unknown,
): Record<string, Partial<MindbodyMembership>> {
  return mapMembershipRecords(rows, now, toFirestoreTimestamp) as Record<
    string,
    Partial<MindbodyMembership>
  >;
}

/** Maps the server route's pricing-option rows into Firestore records. Exported for tests. */
export function mapServices(
  rows: any[] | undefined,
  now: unknown,
): Record<string, Partial<MindbodyService>> {
  return mapServiceRecords(rows, now, toFirestoreTimestamp) as Record<
    string,
    Partial<MindbodyService>
  >;
}

export interface CommercialSyncResult {
  memberships: number;
  contracts: number;
  /** Pricing options written; null when that Mindbody call failed (nothing was written). */
  services: number | null;
  /** True when one of the Mindbody endpoints failed but another worked. */
  partial: boolean;
}

export async function syncClientCommercialData(params: {
  /** Firestore document id of the client to write to. */
  clientDocId: string;
  /** The home studio's Mindbody site id. */
  siteId: string | number;
  /** The client's Mindbody id. */
  mindbodyClientId: string | number;
}): Promise<CommercialSyncResult> {
  const { clientDocId, siteId, mindbodyClientId } = params;

  const res = await authedFetch("/api/mindbody/client-commercial", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      siteId: String(siteId),
      mindbodyClientId: String(mindbodyClientId),
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}) as { error?: string });
    throw new Error(
      err.error || "MindBody did not return contracts for this client.",
    );
  }

  const payload = (await res.json()) as {
    contracts?: any[];
    memberships?: any[];
    /** Absent from an older server; null when that call failed. */
    services?: any[] | null;
    partial?: boolean;
  };

  const now = serverTimestamp();
  const contracts = mapContracts(payload.contracts, now);
  const memberships = mapMemberships(payload.memberships, now);

  const updates: Record<string, unknown> = {
    mindbodyCommercialSyncedAt: now,
  };
  if (Object.keys(contracts).length > 0) updates.mindbodyContracts = contracts;
  if (Object.keys(memberships).length > 0) {
    updates.mindbodyMemberships = memberships;
  }

  // merge:true deep-merges nested maps, so other contracts, other memberships
  // and every webhook-written field on this document survive untouched.
  await setDoc(doc(db, "clients", clientDocId), updates, { merge: true });

  // Replaced, not merged — and only when the pricing-option call worked.
  let serviceCount: number | null = null;
  if (Array.isArray(payload.services)) {
    const services = mapServices(payload.services, now);
    await updateDoc(doc(db, "clients", clientDocId), {
      mindbodyServices: services,
      mindbodyServicesSyncedAt: now,
    });
    serviceCount = Object.keys(services).length;
  }

  return {
    memberships: Object.keys(memberships).length,
    contracts: Object.keys(contracts).length,
    services: serviceCount,
    partial: Boolean(payload.partial),
  };
}
