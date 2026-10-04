/**
 * WHAT A CHANGE AT A STUDIO SAYS IN THE ACTIVITY RECORD — the sentences for
 * the studio page's own edits (Sep 28 2026, the Activity record).
 * PURE: no React, no Firestore.
 *
 * A change an administrator makes at a studio from its page is an
 * `assisted-change` at that studio: its details (the same form My Studio →
 * Studio uses, so only the fields that changed arrive here) and its
 * franchise. The keys of before and after are the words a person reads, so
 * the record reads as it was written.
 */
import type { FranchiseNetwork, Studio } from "../../../types";
import { studioToForm, type StudioForm } from "../../admin/studios/StudioDetailsForm";
import { andList } from "../activity/activity";

/** Each field of the details form, as the record names it: a label, and the word in a sentence. */
const FIELD_WORDS: Record<keyof StudioForm, { label: string; word: string }> = {
  name: { label: "Name", word: "name" },
  contactEmail: { label: "Business email", word: "business email" },
  phone: { label: "Phone", word: "phone" },
  address: { label: "Address", word: "address" },
  timezone: { label: "Time zone", word: "time zone" },
  mindbodySiteId: { label: "Mindbody Site ID", word: "Mindbody Site ID" },
  mindbodyLocationId: { label: "Mindbody location", word: "Mindbody location" },
  locationType: { label: "Location type", word: "location type" },
  mindbodyMode: { label: "Mindbody", word: "Mindbody link" },
  journeyCutoverDate: { label: "Journey cutover date", word: "Journey cutover date" },
};

export interface StudioRecord {
  what: string;
  before: Record<string, string | null>;
  after: Record<string, string | null>;
}

const orNull = (v: unknown): string | null => {
  const s = v === undefined || v === null ? "" : String(v).trim();
  return s ? s : null;
};

/** The entry for a details save: the fields that changed, before and after. Null when nothing did. */
export function detailsRecord(studio: Studio, patch: Partial<StudioForm>): StudioRecord | null {
  const keys = (Object.keys(patch) as (keyof StudioForm)[]).filter((k) => k in FIELD_WORDS);
  if (keys.length === 0) return null;
  const was = studioToForm(studio);
  const before: Record<string, string | null> = {};
  const after: Record<string, string | null> = {};
  for (const k of keys) {
    before[FIELD_WORDS[k].label] = orNull(was[k]);
    after[FIELD_WORDS[k].label] = orNull(patch[k]);
  }
  const name = studio.name || "the studio";
  return {
    what: `Changed ${name}'s ${andList(keys.map((k) => FIELD_WORDS[k].word))}.`,
    before,
    after,
  };
}

/** The entry for a studio moved between franchises (or out of one). Null when nothing moved. */
export function franchiseRecord(
  studio: Studio,
  networks: readonly FranchiseNetwork[],
  toNetworkId: string | null,
): StudioRecord | null {
  const fromId = studio.networkId ?? null;
  if ((fromId ?? null) === (toNetworkId ?? null)) return null;
  const nameOf = (id: string | null) => (id ? networks.find((n) => n.id === id)?.name ?? "a franchise no longer listed" : null);
  const from = nameOf(fromId);
  const to = nameOf(toNetworkId);
  const name = studio.name || "the studio";
  const what = !from
    ? `Moved ${name} into ${to} (it was in no franchise).`
    : !to
      ? `Took ${name} out of ${from}: it is independent now.`
      : `Moved ${name} from ${from} to ${to}.`;
  return { what, before: { Franchise: from }, after: { Franchise: to } };
}
