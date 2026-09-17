/**
 * THE VAULT — leadership notes: incidents and partners.
 *
 * Round: Relay, Sep 2026. AJ's document asks for "a secure area to log and
 * track incidents regarding clients, training sessions, or staff members"
 * and "a repository to store contact information, referral codes, and
 * partnership details for local businesses". Neither belongs in a trainer's
 * private notes (they leave with the trainer) nor on a client's record
 * (every trainer reads that). So: studios/{s}/vault/{id}, readable and
 * writable only by the studio's leaders, franchise owners and
 * administrators — enforced in firestore.rules, not here.
 *
 * Firestore rules apply to whole documents, which is exactly why this is
 * its own collection: nothing a trainer may read sits in the same document.
 */
import type { CareActor } from "./machine-care";

export type VaultKind = "incident" | "partner";

export const VAULT_KIND_LABEL: Record<VaultKind, string> = {
  incident: "Incident",
  partner: "Partner",
};

export const VAULT_TITLE_MAX = 160;
export const VAULT_BODY_MAX = 5000;

export interface VaultEntry {
  id: string;
  studioId: string;
  kind: VaultKind;
  title: string;
  body: string;
  /** Incidents: the day it happened. Partners: unused. YYYY-MM-DD. */
  onDate: string | null;
  /** Incidents: who was involved, free text (staff or clients). Partners: a contact line. */
  people: string;
  /** Incidents: open until the follow-up is done. */
  status: "open" | "closed";
  createdBy: CareActor;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface VaultDraft {
  kind: VaultKind;
  title: string;
  body: string;
  onDate: string | null;
  people: string;
}

export function blankVaultDraft(kind: VaultKind, todayKey: string): VaultDraft {
  return { kind, title: "", body: "", onDate: kind === "incident" ? todayKey : null, people: "" };
}

export function vaultProblem(d: VaultDraft): string | null {
  if (!d.title.trim()) return d.kind === "incident" ? "Say what happened, in a line." : "Name the business or the person.";
  if (d.title.length > VAULT_TITLE_MAX) return `Keep the title under ${VAULT_TITLE_MAX} characters.`;
  if (d.body.length > VAULT_BODY_MAX) return `Keep it under ${VAULT_BODY_MAX} characters.`;
  if (d.onDate && !/^\d{4}-\d{2}-\d{2}$/.test(d.onDate)) return "That isn't a date.";
  return null;
}

export function vaultFields(d: VaultDraft, studioId: string, createdBy: CareActor): Omit<VaultEntry, "id" | "createdAt" | "updatedAt"> {
  return {
    studioId,
    kind: d.kind,
    title: d.title.trim().slice(0, VAULT_TITLE_MAX),
    body: d.body.trim().slice(0, VAULT_BODY_MAX),
    onDate: d.kind === "incident" ? d.onDate : null,
    people: d.people.trim().slice(0, 500),
    status: "open",
    createdBy,
  };
}

export function vaultFromDoc(id: string, d: Record<string, unknown>): VaultEntry {
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
  const by = d.createdBy as CareActor | undefined;
  return {
    id,
    studioId: str(d.studioId, 200),
    kind: d.kind === "partner" ? "partner" : "incident",
    title: str(d.title, VAULT_TITLE_MAX) || "Untitled",
    body: str(d.body, VAULT_BODY_MAX),
    onDate: typeof d.onDate === "string" ? d.onDate : null,
    people: str(d.people, 500),
    status: d.status === "closed" ? "closed" : "open",
    createdBy: by && typeof by.id === "string" ? { id: by.id, name: String(by.name ?? "") } : { id: "", name: "" },
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}

/** Incidents newest first, open before closed; partners by name. */
export function sortVault(list: VaultEntry[]): VaultEntry[] {
  return [...list].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "incident" ? -1 : 1;
    if (a.kind === "incident") {
      if (a.status !== b.status) return a.status === "open" ? -1 : 1;
      return (b.onDate ?? "").localeCompare(a.onDate ?? "") || a.title.localeCompare(b.title);
    }
    return a.title.localeCompare(b.title);
  });
}
