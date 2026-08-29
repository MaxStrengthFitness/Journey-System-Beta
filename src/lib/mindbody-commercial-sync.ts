import { doc, setDoc, serverTimestamp, Timestamp } from "firebase/firestore";
import { db } from "../firebase";
import { MindbodyContract, MindbodyMembership } from "../types";

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
 */

/** Mindbody's pull API sends dates without a zone; treat them as UTC so they
 *  agree with the webhook's true-UTC timestamps and never shift a calendar day. */
function toTimestamp(value: unknown): Timestamp | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const raw = value.trim();
  const normalized = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw) ? raw : `${raw}Z`;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : Timestamp.fromDate(parsed);
}

/** Firestore map keys cannot contain path characters. */
function toMapKey(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const key = String(value).trim();
  if (!key || /[.~*/[\]]/.test(key)) return null;
  return key;
}

/** Maps the server route's contract rows into Firestore records. Exported for tests. */
export function mapContracts(
  rows: any[] | undefined,
  now: unknown,
): Record<string, Partial<MindbodyContract>> {
  const contracts: Record<string, Partial<MindbodyContract>> = {};

  for (const c of rows || []) {
    const key = toMapKey(c.clientContractId);
    if (!key) continue;

    const record: Partial<MindbodyContract> = {
      clientContractId: c.clientContractId,
      status: "Active",
      lastPullSyncAt: now,
    };
    // Only real values are written: an undefined would blow away a field the
    // webhook had already filled in.
    if (c.contractName) record.contractName = String(c.contractName);
    if (c.autopayStatus) record.autopayStatus = String(c.autopayStatus);
    if (c.siteId !== null && c.siteId !== undefined) record.siteId = c.siteId;
    if (
      c.originationLocationId !== null &&
      c.originationLocationId !== undefined
    ) {
      record.originationLocationId = c.originationLocationId;
    }
    const startDate = toTimestamp(c.startDate);
    if (startDate) record.startDate = startDate;
    const endDate = toTimestamp(c.endDate);
    if (endDate) record.endDate = endDate;
    const agreementDate = toTimestamp(c.agreementDate);
    if (agreementDate) record.agreementDate = agreementDate;

    contracts[key] = record;
  }

  return contracts;
}

/** Maps the server route's membership rows into Firestore records. Exported for tests. */
export function mapMemberships(
  rows: any[] | undefined,
  now: unknown,
): Record<string, Partial<MindbodyMembership>> {
  const memberships: Record<string, Partial<MindbodyMembership>> = {};

  for (const m of rows || []) {
    const key = toMapKey(m.membershipId);
    if (!key) continue;

    const record: Partial<MindbodyMembership> = {
      membershipId: m.membershipId,
      // This endpoint returns active memberships only.
      status: "Active",
      cancelledAt: null,
      lastPullSyncAt: now,
    };
    if (m.membershipName) record.membershipName = String(m.membershipName);
    if (m.programName) record.programName = String(m.programName);
    if (m.siteId !== null && m.siteId !== undefined) record.siteId = m.siteId;
    if (typeof m.count === "number") record.sessionCount = m.count;
    if (typeof m.remaining === "number") record.sessionsRemaining = m.remaining;
    const activeDate = toTimestamp(m.activeDate);
    if (activeDate) record.activeDate = activeDate;
    const expirationDate = toTimestamp(m.expirationDate);
    if (expirationDate) record.expirationDate = expirationDate;

    memberships[key] = record;
  }

  return memberships;
}

export interface CommercialSyncResult {
  memberships: number;
  contracts: number;
  /** True when one of the two Mindbody endpoints failed but the other worked. */
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

  const res = await fetch("/api/mindbody/client-commercial", {
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

  return {
    memberships: Object.keys(memberships).length,
    contracts: Object.keys(contracts).length,
    partial: Boolean(payload.partial),
  };
}
