/**
 * MASTER SYNC'S PATCH — what a sync writes onto a client, with no Firebase SDK.
 *
 * Moved out of lib/mindbody-master-sync.ts and lib/mindbody-commercial-sync.ts
 * (the cost plan, Sep 26 2026, B1 - the Sep 22 sync plan's "first build
 * step"). Those modules import the browser SDK, so a script or job running on
 * firebase-admin could not use them, and a second copy of this logic would
 * drift from the first - the drift that produced the Sep 21 audit. The two
 * modules keep their names and signatures and call in here, passing the
 * browser's Timestamp; the pre-launch sync passes firebase-admin's. The 32
 * Master Sync tests import `buildMasterSyncPatch` by name and are the proof
 * that nothing moved but the code.
 *
 * THE RULES are the ones at the top of lib/mindbody-master-sync.ts: Mindbody's
 * fields only, never a coach's; a blank never blanks; only the diff; a part
 * that could not be read writes nothing.
 *
 * PURE MODULE - no Firestore, no network. Types only from ../types.
 */

import type { Client } from "../types";
import {
  mapContractRecords,
  mapMembershipRecords,
  mapServiceRecords,
  type ToTimestamp,
} from "./mindbody-commercial-map";
import { toDateSafe, type FirestoreDateLike } from "./mindbody-dates";
import {
  joinAddress,
  MINDBODY_NOTES_MAX,
  type MasterSyncResponse,
} from "./mindbody-demographics-map";

/** The found branch of the route's answer. */
export type MasterSyncFound = Extract<MasterSyncResponse, { found: true }>;

export interface MasterSyncPatch {
  /** Flat fields for one updateDoc, including the pricing-option map when it was read. */
  patch: Record<string, unknown>;
  /** Contracts / memberships for setDoc(..., { merge: true }); null when there's nothing to merge. */
  mergeMaps: Record<string, unknown> | null;
  /** The pricing-option map (already inside `patch`); null when that call failed. */
  replaceServices: Record<string, unknown> | null;
  /**
   * Client fields whose value actually changed, in a stable order. Bookkeeping
   * stamps (…SyncedAt) are not counted; the three maps are counted when any
   * record in them changed.
   */
  changedFields: string[];
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
  services: Record<string, Record<string, unknown>> | null;
  contracts: Record<string, Record<string, unknown>>;
  memberships: Record<string, Record<string, unknown>>;
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
export function commercialWritesFrom(
  payload: CommercialPayload,
  stamp: unknown,
  toTs: ToTimestamp,
): CommercialWrites {
  const contractsKnown = Array.isArray(payload.contracts);
  const membershipsKnown = Array.isArray(payload.memberships);
  const contracts = mapContractRecords(payload.contracts ?? undefined, stamp, toTs);
  const memberships = mapMembershipRecords(payload.memberships ?? undefined, stamp, toTs);

  let merge: Record<string, unknown> | null = null;
  if (contractsKnown || membershipsKnown) {
    merge = {};
    if (contractsKnown) merge.mindbodyCommercialSyncedAt = stamp;
    if (Object.keys(contracts).length > 0) merge.mindbodyContracts = contracts;
    if (Object.keys(memberships).length > 0) merge.mindbodyMemberships = memberships;
    if (Object.keys(merge).length === 0) merge = null;
  }

  const services = Array.isArray(payload.services) ? mapServiceRecords(payload.services, stamp, toTs) : null;
  return { merge, services, contracts, memberships };
}

/* ------------------------------------------------------------------ *
 * Comparing what's stored with what Mindbody sent
 * ------------------------------------------------------------------ */

function isDateLike(v: unknown): boolean {
  return (
    v instanceof Date ||
    (typeof v === "object" &&
      v !== null &&
      (typeof (v as any).toDate === "function" || typeof (v as any).seconds === "number"))
  );
}

function millisOf(v: unknown): number | null {
  return toDateSafe(v as FirestoreDateLike)?.getTime() ?? null;
}

/** Deep equality that treats Timestamps / Dates by instant and null ≡ absent. */
function sameValue(a: unknown, b: unknown): boolean {
  if ((a === null || a === undefined) && (b === null || b === undefined)) return true;
  if (isDateLike(a) || isDateLike(b)) {
    const ma = millisOf(a);
    return ma !== null && ma === millisOf(b);
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((x, i) => sameValue(x, b[i]));
  }
  if (typeof a === "object" && typeof b === "object" && a !== null && b !== null) {
    const keys = new Set([...Object.keys(a as object), ...Object.keys(b as object)]);
    for (const k of keys) {
      if (!sameValue((a as any)[k], (b as any)[k])) return false;
    }
    return true;
  }
  return a === b;
}

/** Fields rewritten on every pull that say nothing about the record itself. */
const RECORD_STAMPS = new Set(["lastPullSyncAt", "lastSyncAt", "updatedAt"]);

/**
 * Would writing `incoming` change `existing`? Merge semantics compare only the
 * fields being written; replace semantics also count a record that disappears.
 */
function mapChanges(
  existing: Record<string, any> | null | undefined,
  incoming: Record<string, Record<string, unknown>>,
  mode: "merge" | "replace",
): boolean {
  const before = existing && typeof existing === "object" ? existing : {};
  for (const [key, record] of Object.entries(incoming)) {
    const old = before[key];
    if (!old || typeof old !== "object") return true;
    for (const [field, value] of Object.entries(record)) {
      if (RECORD_STAMPS.has(field)) continue;
      if (!sameValue(old[field], value)) return true;
    }
    if (mode === "replace") {
      for (const field of Object.keys(old)) {
        if (RECORD_STAMPS.has(field)) continue;
        if (!(field in record) && old[field] !== null && old[field] !== undefined) return true;
      }
    }
  }
  if (mode === "replace") {
    for (const key of Object.keys(before)) if (!(key in incoming)) return true;
  }
  return false;
}

/* ------------------------------------------------------------------ *
 * The patch
 * ------------------------------------------------------------------ */

const NAME_MAX = 49; // firestore.rules isValidClient: size() < 50

function usableName(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t && t.length <= NAME_MAX ? t : null;
}

function usableText(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t : null;
}

/**
 * Everything Master Sync should write for this client — pure, and free of any
 * Firebase SDK, so the browser (lib/mindbody-master-sync.ts) and a script or
 * job on firebase-admin (scripts/onboard-studio.ts) write the same fields.
 *
 * @param existing the client as it is stored now
 * @param res      the route's found answer
 * @param now      the moment of the sync (mindbodyMasterSyncedAt)
 * @param stamp    what to write for the …SyncedAt / lastPullSyncAt stamps
 * @param toTs     turns a Date into the caller's SDK's Timestamp
 */
export function buildMasterSyncPatchWith(
  existing: Client,
  res: MasterSyncFound,
  now: Date,
  stamp: unknown,
  toTs: ToTimestamp,
): MasterSyncPatch {
  const patch: Record<string, unknown> = {};
  const changed: string[] = [];
  const before = (existing ?? {}) as Record<string, any>;
  const d = res.demographics ?? ({} as MasterSyncFound["demographics"]);

  const setIfChanged = (field: string, value: unknown) => {
    if (value === null || value === undefined) return;
    if (sameValue(before[field], value)) return;
    patch[field] = value;
    changed.push(field);
  };
  const setTimestampIfChanged = (field: string, iso: unknown): boolean => {
    const date = typeof iso === "string" ? toDateSafe(iso) : null;
    if (!date) return false;
    if (millisOf(before[field]) === date.getTime()) return false;
    patch[field] = toTs(date);
    changed.push(field);
    return true;
  };

  // Identity. Both names: the webhook writes one, older screens read the other.
  const id = String(res.mindbodyClientId || d.mindbodyClientId || "").trim();
  if (id) {
    setIfChanged("mindbodyClientId", id);
    setIfChanged("mindbodyId", id);
  }

  // Person-facts.
  setIfChanged("firstName", usableName(d.firstName));
  setIfChanged("lastName", usableName(d.lastName));
  setIfChanged("email", usableText(d.email));
  setIfChanged("phone", usableText(d.phone));
  const dob = usableText(d.dateOfBirth);
  setIfChanged("dateOfBirth", dob && /^\d{4}-\d{2}-\d{2}$/.test(dob) ? dob : null);
  setIfChanged("gender", usableText(d.gender));
  setIfChanged("address", joinAddress(usableText(d.addressLine1), usableText(d.addressLine2)));
  setIfChanged("city", usableText(d.city));
  setIfChanged("addressState", usableText(d.state));
  setIfChanged("postalCode", usableText(d.postalCode));
  setIfChanged("country", usableText(d.country));
  setIfChanged("emergencyContactName", usableText(d.emergencyContactName));
  setIfChanged("emergencyContactPhone", usableText(d.emergencyContactPhone));
  setIfChanged("emergencyContactRelationship", usableText(d.emergencyContactRelationship));
  const photo = usableText(d.photoUrl);
  setIfChanged("photoUrl", photo && /^https:\/\//i.test(photo) ? photo : null);
  const notes = usableText(d.notes);
  setIfChanged("mindbodyNotes", notes ? notes.slice(0, MINDBODY_NOTES_MAX) : null);

  // Status.
  setIfChanged("mindbodyStatus", usableText(d.status));
  setIfChanged("mindbodyActive", typeof d.active === "boolean" ? d.active : null);
  setIfChanged("isProspect", typeof d.isProspect === "boolean" ? d.isProspect : null);
  const home = d.homeLocationId;
  if ((typeof home === "number" && Number.isFinite(home)) || (typeof home === "string" && home.trim())) {
    if (String(before.mindbodyHomeLocationId ?? "") !== String(home).trim()) {
      patch.mindbodyHomeLocationId = typeof home === "string" ? home.trim() : home;
      changed.push("mindbodyHomeLocationId");
    }
  }

  // Dates.
  setTimestampIfChanged("mindbodyCreatedAt", d.createdAt);
  const firstApptWritten = setTimestampIfChanged("firstAppointmentDate", d.firstAppointmentDate);
  const source = before.firstAppointmentDateSource;
  // Mindbody said it, so it is no longer an inference ("pull-sync:…" /
  // "backfill:…", see Client.firstAppointmentDateSource). An absent source
  // already means authoritative, so an unchanged date leaves it alone. The
  // marker is bookkeeping: not counted as a refreshed field.
  if (firstApptWritten ? source !== "mindbody" : Boolean(source) && source !== "mindbody") {
    if (firstApptWritten || toDateSafe((d.firstAppointmentDate ?? null) as FirestoreDateLike)) {
      patch.firstAppointmentDateSource = "mindbody";
    }
  }

  // The waiver — only when Mindbody said something about it.
  if (d.liability && typeof d.liability.isReleased === "boolean") {
    setIfChanged("isLiabilityReleased", d.liability.isReleased);
    if (d.liability.isReleased) setTimestampIfChanged("liabilityAgreementDate", d.liability.agreementDate);
  }

  // Lifetime visits — only when known.
  if (typeof res.visits === "number" && Number.isFinite(res.visits) && res.visits >= 0) {
    setIfChanged("clientsNumberOfVisitsAtSite", res.visits);
  }

  // Commercial: the same records the Sync button writes.
  const commercial = res.commercial ?? { contracts: null, memberships: null, services: null, partial: true };
  const writes = commercialWritesFrom(commercial, stamp, toTs);
  if (Object.keys(writes.contracts).length > 0 && mapChanges(before.mindbodyContracts, writes.contracts, "merge")) {
    changed.push("mindbodyContracts");
  }
  if (
    Object.keys(writes.memberships).length > 0 &&
    mapChanges(before.mindbodyMemberships, writes.memberships, "merge")
  ) {
    changed.push("mindbodyMemberships");
  }
  if (writes.services) {
    patch.mindbodyServices = writes.services;
    patch.mindbodyServicesSyncedAt = stamp;
    if (mapChanges(before.mindbodyServices, writes.services, "replace")) changed.push("mindbodyServices");
  }

  patch.mindbodyMasterSyncedAt = now.toISOString();

  return {
    patch,
    mergeMaps: writes.merge,
    replaceServices: writes.services,
    changedFields: changed,
  };
}

