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
import type { MasterSyncPart, MasterSyncResponse } from "./mindbody-demographics-map";
import { mindbodyIdConflict, mindbodyIdOf } from "./mindbody-id";
import {
  buildMasterSyncPatchWith,
  type MasterSyncFound,
  type MasterSyncPatch,
} from "./mindbody-master-patch";

export type { MasterSyncFound, MasterSyncPatch } from "./mindbody-master-patch";

export type {
  MasterSyncPart,
  MasterSyncResponse,
  MindbodyDemographics,
} from "./mindbody-demographics-map";



/**
 * Everything Master Sync should write for this client — pure. The logic is
 * lib/mindbody-master-patch.ts; this passes the browser's Timestamp.
 *
 * @param stamp what to write for the …SyncedAt / lastPullSyncAt stamps;
 *              defaults to a Timestamp of `now` (runMasterSync passes
 *              serverTimestamp())
 */
export function buildMasterSyncPatch(
  existing: Client,
  res: MasterSyncFound,
  now: Date,
  stamp: unknown = Timestamp.fromDate(now),
): MasterSyncPatch {
  return buildMasterSyncPatchWith(existing, res, now, stamp, (d) => Timestamp.fromDate(d));
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

export type MasterSyncStatus = "ok" | "not-found" | "no-id" | "conflict" | "partial" | "error";

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
  const clash = mindbodyIdConflict(client);
  if (clash) {
    return result(
      "conflict",
      `This record carries two different Mindbody IDs (${clash.ids.join(" and ")}). Nothing was synced — a leader needs to confirm which client this is first.`,
      { mindbodyClientId: id },
    );
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
