/**
 * MASTER SYNC — one tap brings a client up to date with Mindbody.
 *
 * Master Sync round (Sep 2026). The owner's audit: city, state, postal code,
 * country, membership status, "client since", first appointment, total
 * visits and the liability waiver weren't reaching the profile; the waiver
 * read "unsigned" while Mindbody had it signed; and "Sync from Mindbody"
 * fetched a fraction of what Mindbody knows. This replaces the scattered
 * sync buttons with one: POST /api/mindbody/client-master-sync (server.ts)
 * fetches everything, and this file writes it.
 *
 * THE RULES (CLAUDE.md, and the owner's approval of this change):
 *   - Mindbody owns people, bookings and contracts. The fields below are
 *     Mindbody's and are refreshed whenever Mindbody has a value. A blank
 *     from Mindbody never blanks a field: it means "Mindbody didn't say".
 *   - Coach-owned fields (nickname, notes, FORD, goals, clinical,
 *     occupation…) and `renewal` (the nightly job's; the rules refuse it) are
 *     never in the patch. Nor is `isActive` — Mindbody's flag goes to
 *     `mindbodyActive` — nor `homeStudioId`, which decides who may read the
 *     client.
 *   - Only the diff is written. A value that hasn't changed is left out.
 *   - A part that couldn't be read is unknown, never empty: it writes
 *     nothing. Pricing options are REPLACED (only when read); contracts and
 *     memberships MERGE (lib/mindbody-commercial-sync.ts, shared).
 *   - The client is looked up by Mindbody id on its home studio's site.
 *     Never by name.
 *
 * Two writes at most: the maps (setDoc merge) and everything else in one
 * updateDoc, which also replaces the pricing-option map.
 */

import { doc, serverTimestamp, setDoc, Timestamp, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import type { Client, Studio } from "../types";
import { authedFetch } from "./authed-fetch";
import { buildCommercialWrites } from "./mindbody-commercial-sync";
import { toDateSafe, type FirestoreDateLike } from "./mindbody-dates";
import {
  joinAddress,
  MINDBODY_NOTES_MAX,
  type MasterSyncPart,
  type MasterSyncResponse,
} from "./mindbody-demographics-map";
import { mindbodyIdOf } from "./mindbody-id";

export type {
  MasterSyncPart,
  MasterSyncResponse,
  MindbodyDemographics,
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
 * Everything Master Sync should write for this client — pure.
 *
 * @param existing the client as the app holds it now
 * @param res      the route's found answer
 * @param now      the moment of the sync (mindbodyMasterSyncedAt)
 * @param stamp    what to write for the …SyncedAt / lastPullSyncAt stamps;
 *                 defaults to a Timestamp of `now` (runMasterSync passes
 *                 serverTimestamp())
 */
export function buildMasterSyncPatch(
  existing: Client,
  res: MasterSyncFound,
  now: Date,
  stamp: unknown = Timestamp.fromDate(now),
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
    patch[field] = Timestamp.fromDate(date);
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
  const writes = buildCommercialWrites(commercial, stamp);
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

/* ------------------------------------------------------------------ *
 * Plain English
 * ------------------------------------------------------------------ */

const PART_NAMES: Record<MasterSyncPart, string> = {
  contracts: "contracts",
  memberships: "memberships",
  services: "pricing options",
  visits: "the visit count",
};

function listOf(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/* ------------------------------------------------------------------ *
 * The one call the profile makes
 * ------------------------------------------------------------------ */

export type MasterSyncStatus = "ok" | "not-found" | "no-id" | "partial" | "error";

export interface MasterSyncResult {
  status: MasterSyncStatus;
  /** Client fields that changed (see MasterSyncPatch.changedFields). Empty unless ok / partial. */
  changedFields: string[];
  /** One sentence for a toast. */
  message: string;
  /** Parts Mindbody couldn't give this time (visits included). */
  failed: MasterSyncPart[];
  /** The Mindbody id asked about, when there was one. */
  mindbodyClientId: string | null;
}

export async function runMasterSync(params: {
  client: Client;
  /** The studios the caller can see; the client's home studio names the site. */
  studios: Studio[];
  /** For tests. */
  now?: Date;
}): Promise<MasterSyncResult> {
  const { client, studios } = params;
  const result = (
    status: MasterSyncStatus,
    message: string,
    extra: Partial<MasterSyncResult> = {},
  ): MasterSyncResult => ({
    status,
    message,
    changedFields: [],
    failed: [],
    mindbodyClientId: null,
    ...extra,
  });

  const id = mindbodyIdOf(client);
  if (!id) {
    return result(
      "no-id",
      client?.provisional
        ? "This is a temporary profile — link it to the client's Mindbody record first."
        : "This client has no Mindbody ID yet, so there's nothing to sync.",
    );
  }
  if (!client.id) {
    return result("error", "This client hasn't been saved yet.", { mindbodyClientId: id });
  }

  // Only ever the client's OWN home studio's site: another studio's site
  // returns another studio's records.
  const home = (studios || []).find((s) => s.id === client.homeStudioId);
  const studioName = home?.name || "this client's home studio";
  const siteId = String(home?.mindbodySiteId ?? "").trim();
  if (!siteId) {
    return result(
      "error",
      `${home?.name || "This client's home studio"} has no Mindbody Site ID set, so Journey can't reach Mindbody for it.`,
      { mindbodyClientId: id },
    );
  }

  let payload: MasterSyncResponse;
  try {
    const res = await authedFetch("/api/mindbody/client-master-sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ siteId, mindbodyClientId: id }),
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      return result("error", err.error || "Mindbody didn't answer. Try again in a minute.", {
        mindbodyClientId: id,
      });
    }
    payload = (await res.json()) as MasterSyncResponse;
  } catch {
    return result("error", "Couldn't reach Mindbody — check the connection and try again.", {
      mindbodyClientId: id,
    });
  }

  if (!payload || payload.found !== true) {
    return result("not-found", `Mindbody has no client with ID ${id} at ${studioName}.`, {
      mindbodyClientId: id,
    });
  }

  const now = params.now ?? new Date();
  const built = buildMasterSyncPatch(client, payload, now, serverTimestamp());

  try {
    const ref = doc(db, "clients", client.id);
    // Maps first; the flat write carries mindbodyMasterSyncedAt, so it goes
    // last and only lands when everything before it did.
    if (built.mergeMaps) await setDoc(ref, built.mergeMaps, { merge: true });
    await updateDoc(ref, built.patch);
  } catch (e: any) {
    return result(
      "error",
      `Mindbody answered, but Journey couldn't save it${e?.message ? ` (${e.message})` : ""}.`,
      { mindbodyClientId: id },
    );
  }

  const failed = Array.isArray(payload.failed) ? payload.failed : [];
  const n = built.changedFields.length;
  const commercialFailed = failed.filter((p) => p !== "visits");
  if (payload.partial || commercialFailed.length > 0) {
    const parts = commercialFailed.length
      ? listOf(commercialFailed.map((p) => PART_NAMES[p]))
      : "some Mindbody records";
    return result("partial", `Synced, but ${parts} couldn't be read — try again later.`, {
      changedFields: built.changedFields,
      failed,
      mindbodyClientId: id,
    });
  }

  return result(
    "ok",
    n === 0
      ? "Up to date with Mindbody — nothing had changed."
      : `Up to date with Mindbody — ${n} field${n === 1 ? "" : "s"} refreshed.`,
    { changedFields: built.changedFields, failed, mindbodyClientId: id },
  );
}
