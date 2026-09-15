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

/** The route's commercial rows. A list that is null (or absent) couldn't be read. */
export interface CommercialPayload {
  contracts?: any[] | null;
  memberships?: any[] | null;
  services?: any[] | null;
}

export interface CommercialWrites {
  /**
   * For setDoc(..., { merge: true }): contracts and memberships deep-merge
   * into what the webhook wrote. null when neither list could be read.
   */
  merge: Record<string, unknown> | null;
  /** For updateDoc: the whole pricing-option map. null when that call failed. */
  services: Record<string, Partial<MindbodyService>> | null;
  contracts: Record<string, Partial<MindbodyContract>>;
  memberships: Record<string, Partial<MindbodyMembership>>;
}

/**
 * What a commercial pull writes — shared by the Sync button below and by
 * Master Sync (lib/mindbody-master-sync.ts), so both land the same records.
 *
 * `mindbodyCommercialSyncedAt` is stamped only when the contract list was
 * read: the renewal engine takes a stamp with no contracts to mean "Mindbody
 * shows no package", which a failed read must not say. An empty map is left
 * out rather than written, so it can't look authoritative.
 */
export function buildCommercialWrites(payload: CommercialPayload, stamp: unknown): CommercialWrites {
  const contractsKnown = Array.isArray(payload.contracts);
  const membershipsKnown = Array.isArray(payload.memberships);
  const contracts = mapContracts(payload.contracts ?? undefined, stamp);
  const memberships = mapMemberships(payload.memberships ?? undefined, stamp);

  let merge: Record<string, unknown> | null = null;
  if (contractsKnown || membershipsKnown) {
    merge = {};
    if (contractsKnown) merge.mindbodyCommercialSyncedAt = stamp;
    if (Object.keys(contracts).length > 0) merge.mindbodyContracts = contracts;
    if (Object.keys(memberships).length > 0) merge.mindbodyMemberships = memberships;
    if (Object.keys(merge).length === 0) merge = null;
  }

  const services = Array.isArray(payload.services) ? mapServices(payload.services, stamp) : null;
  return { merge, services, contracts, memberships };
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
  // This route sends [] for a list it couldn't read, so both lists count as
  // read here (unchanged behaviour); Master Sync's route sends null instead.
  const writes = buildCommercialWrites(
    {
      contracts: payload.contracts ?? [],
      memberships: payload.memberships ?? [],
      services: payload.services,
    },
    now,
  );
  const { contracts, memberships } = writes;

  // merge:true deep-merges nested maps, so other contracts, other memberships
  // and every webhook-written field on this document survive untouched.
  if (writes.merge) {
    await setDoc(doc(db, "clients", clientDocId), writes.merge, { merge: true });
  }

  // Replaced, not merged — and only when the pricing-option call worked.
  let serviceCount: number | null = null;
  if (writes.services) {
    await updateDoc(doc(db, "clients", clientDocId), {
      mindbodyServices: writes.services,
      mindbodyServicesSyncedAt: now,
    });
    serviceCount = Object.keys(writes.services).length;
  }

  return {
    memberships: Object.keys(memberships).length,
    contracts: Object.keys(contracts).length,
    services: serviceCount,
    partial: Boolean(payload.partial),
  };
}
