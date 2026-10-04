/**
 * WHAT STUDIOS HAVE OFFERED TO EVERY MSF STUDIO — the pure half of the
 * Admins dashboard's review (AJ, Sep 28 2026: sharing "should submit to
 * admins first for review, we can review in admin dashboard").
 *
 * An offer is a studio's own document marked `shareStatus: "pending"`: its
 * own machine (roster), its note on a machine (wiki overlay), a playbook
 * tip, or one of the floor's dated notes on a machine (floorNotes, Oct 3 2026). This turns each into one row an administrator can read whole and
 * decide. The studio is the one the PATH names, never a field the writer
 * filled in (the same rule as the credit on a shared item, hooks.ts).
 */

import { isDemoStudioId } from "../demo-mode/is-demo";
import type { OfferKind } from "./mutations";

export interface ShareOffer {
  kind: OfferKind;
  /** From the document's path: studios/{studioId}/… */
  studioId: string;
  docId: string;
  title: string;
  /** What the studio wrote, whole, in reading order. */
  lines: string[];
  /** The name the studio offered it under, when it gave one. */
  studioName: string | null;
  /** The Auth uid of whoever offered it. */
  offeredBy: string | null;
  offeredAt: unknown;
}

export const KIND_LABEL: Record<OfferKind, string> = {
  machine: "Their own machine",
  note: "A note on a machine",
  tip: "A tip",
  floor: "A floor note on a machine",
};

/** studios/{studioId}/{collection}/{docId} → studioId; anything else → null. */
export function studioIdFromPath(path: string): string | null {
  const parts = path.split("/");
  return parts.length === 4 && parts[0] === "studios" && parts[1] ? parts[1] : null;
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const strList = (v: unknown): string[] => (Array.isArray(v) ? v.map(str).filter((x): x is string => x !== null) : []);

function machineLines(def: Record<string, unknown>): string[] {
  const out: string[] = [];
  const pattern = str(def.movementPattern);
  if (pattern) out.push(`Movement: ${pattern.replace(/_/g, " ")}`);
  const note = str(def.clinicalNote);
  if (note) out.push(`Clinical note: ${note}`);
  const warnings = strList(def.clinicalWarnings);
  if (warnings.length) out.push(`Warnings: ${warnings.join("; ")}`);
  const not = strList(def.contraindicatedFor);
  if (not.length) out.push(`Not for: ${not.join("; ")}`);
  const cues = strList((def.execution as Record<string, unknown> | undefined)?.keyCues);
  if (cues.length) out.push(`Key cues: ${cues.join("; ")}`);
  return out;
}

function noteLines(blocks: unknown): string[] {
  if (!Array.isArray(blocks)) return [];
  return blocks
    .map((b) => {
      const block = (b ?? {}) as { kind?: unknown; text?: unknown };
      const text = str(block.text);
      if (!text) return null;
      return block.kind === "bullet" ? `• ${text}` : text;
    })
    .filter((x): x is string => x !== null);
}

/** One offer from one document, or null when the document isn't one. */
export function offerFrom(kind: OfferKind, path: string, docId: string, data: Record<string, unknown>): ShareOffer | null {
  if (data.shareStatus !== "pending" || data.shared === true) return null;
  const studioId = studioIdFromPath(path);
  // Never an offer from Demo Mode (the realm rule, Oct 2 2026).
  if (!studioId || isDemoStudioId(studioId)) return null;
  if (kind === "machine") {
    const def = (data.definition ?? {}) as Record<string, unknown>;
    return {
      kind,
      studioId,
      docId,
      title: str(def.name) ?? str(data.machineId) ?? docId,
      lines: machineLines(def),
      studioName: str(data.sharedStudioName),
      offeredBy: str(data.sharedBy),
      offeredAt: data.shareRequestedAt ?? null,
    };
  }
  if (kind === "floor") {
    // Only a note of its own, still open: an update or a closed note is not offered.
    const body = str(data.body);
    if (!body || data.threadId || data.resolvedAt || data.isArchived === true) return null;
    return {
      kind,
      studioId,
      docId,
      title: str(data.machineName) ?? str(data.machineId) ?? docId,
      lines: [body],
      studioName: str(data.studioName),
      offeredBy: str(data.shareRequestedBy) ?? str(data.authorId),
      offeredAt: data.shareRequestedAt ?? null,
    };
  }
  if (kind === "note") {
    return {
      kind,
      studioId,
      docId,
      title: str(data.title) ?? docId,
      lines: noteLines(data.blocks),
      studioName: str(data.studioName),
      offeredBy: str(data.shareRequestedBy) ?? str(data.authorId),
      offeredAt: data.shareRequestedAt ?? null,
    };
  }
  const lines: string[] = [];
  const situation = str(data.situation);
  if (situation) lines.push(`When: ${situation}`);
  const tried = str(data.tried);
  if (tried) lines.push(`Tried: ${tried}`);
  const worked = str(data.worked);
  if (worked) lines.push(`What worked: ${worked}`);
  return {
    kind,
    studioId,
    docId,
    title: str(data.title) ?? docId,
    lines,
    studioName: str(data.studioName),
    offeredBy: str(data.shareRequestedBy) ?? str(data.authorId),
    offeredAt: data.shareRequestedAt ?? null,
  };
}

function millisOf(v: unknown): number {
  if (!v) return 0;
  if (typeof v === "number") return v;
  if (v instanceof Date) return v.getTime();
  const t = v as { toMillis?: () => number; seconds?: number };
  if (typeof t.toMillis === "function") return t.toMillis();
  if (typeof t.seconds === "number") return t.seconds * 1000;
  return 0;
}

/** The oldest offer first: a queue, answered in the order it was asked. */
export function byOldestOffer(a: ShareOffer, b: ShareOffer): number {
  return millisOf(a.offeredAt) - millisOf(b.offeredAt) || a.title.localeCompare(b.title);
}
