/**
 * FROM OTHER MSF STUDIOS — what other studios shared about a machine.
 *
 * Round: Learning + Planner, Sep 2026. Two things a studio can share about a
 * machine, each with its own "Share with all MSF studios" switch:
 *
 *   a note   the studio's own note on the machine page (studios/{s}/wiki,
 *            kind "overlay") — "ours sits two notches lower than the card"
 *   a tip    a playbook entry about the machine (studios/{s}/playbook) —
 *            "shoulder pain at the top of the pull: neutral grip, slow 10/10"
 *
 * Both are read with one collection-group query each, filed under the
 * machine's lineage key (see database.ts), and neither can carry a client:
 * the rules refuse `clientId` on both collections, which is what makes it
 * safe to show them to every studio.
 *
 * PURE MODULE — no React, no Firestore.
 */

import type { WikiBlock } from "../wiki/studio-wiki";

export interface NetworkTip {
  kind: "tip";
  id: string;
  studioId: string;
  studioName: string;
  title: string;
  situation: string;
  tried: string;
  worked: string;
  /** "Worked for me too", from trainers at the sharing studio. */
  confirmations: number;
  authorName: string;
  updatedAt: unknown;
}

export interface NetworkNote {
  kind: "note";
  id: string;
  studioId: string;
  studioName: string;
  blocks: WikiBlock[];
  authorName: string;
  updatedAt: unknown;
}

export type NetworkItem = NetworkTip | NetworkNote;

const str = (v: unknown, max = 4000) => (typeof v === "string" ? v.slice(0, max) : "");

/**
 * The studio a collection-group document belongs to: its path. Only a
 * trainer at that studio can write under it, so the path can't be faked; the
 * document's own `studioId` field could be, and is read only when no path is
 * known.
 */
function studioOf(d: Record<string, unknown>, fromPath: string | null): string {
  return fromPath || str(d.studioId, 200) || "";
}

/** A shared playbook entry, or null when it should not be shown. */
export function tipFromDoc(id: string, fromPath: string | null, d: Record<string, unknown> | undefined): NetworkTip | null {
  if (!d || d.shared !== true || d.retiredAt) return null;
  const title = str(d.title, 200).trim();
  const worked = str(d.worked).trim();
  if (!title || !worked) return null;
  const confirms = d.confirmations && typeof d.confirmations === "object" ? Object.keys(d.confirmations).length : 0;
  const studioId = studioOf(d, fromPath);
  if (!studioId) return null;
  return {
    kind: "tip",
    id,
    studioId,
    studioName: str(d.studioName, 80).trim() || "Another studio",
    title,
    situation: str(d.situation).trim(),
    tried: str(d.tried).trim(),
    worked,
    confirmations: confirms,
    authorName: str(d.authorName, 80).trim(),
    updatedAt: d.updatedAt ?? d.createdAt,
  };
}

const BLOCK_KINDS = new Set(["heading", "bullet", "para"]);

/** A shared machine note (a wiki overlay on a machine), or null. */
export function noteFromWikiDoc(
  id: string,
  fromPath: string | null,
  d: Record<string, unknown> | undefined,
): NetworkNote | null {
  if (!d || d.shared !== true || d.retiredAt) return null;
  if (d.kind !== "overlay" || d.targetType !== "machine") return null;
  const blocks = Array.isArray(d.blocks)
    ? (d.blocks as unknown[])
        .filter(
          (b): b is WikiBlock =>
            Boolean(b) &&
            typeof (b as WikiBlock).text === "string" &&
            BLOCK_KINDS.has((b as WikiBlock).kind) &&
            (b as WikiBlock).text.trim() !== "",
        )
        .slice(0, 60)
    : [];
  if (blocks.length === 0) return null;
  const studioId = studioOf(d, fromPath);
  if (!studioId) return null;
  return {
    kind: "note",
    id,
    studioId,
    studioName: str(d.studioName, 80).trim() || "Another studio",
    blocks,
    authorName: str(d.updatedByName, 80).trim() || str(d.authorName, 80).trim(),
    updatedAt: d.updatedAt ?? d.createdAt,
  };
}

function millis(v: unknown): number {
  const t = v as { toMillis?: () => number; seconds?: number } | null;
  if (!t) return 0;
  if (typeof t.toMillis === "function") return t.toMillis();
  if (typeof t.seconds === "number") return t.seconds * 1000;
  return 0;
}

/**
 * What the section shows: other studios only (this studio's own note and
 * tips are already on the page), the studios' notes before their tips,
 * newest first, and never so many that the section becomes the page.
 */
export function networkItems(items: NetworkItem[], ownStudioId: string | null, limit = 24): NetworkItem[] {
  const seen = new Set<string>();
  const others = items.filter((i) => {
    const key = `${i.kind}:${i.studioId}:${i.id}`;
    if (seen.has(key) || i.studioId === ownStudioId) return false;
    seen.add(key);
    return true;
  });
  return others
    .sort(
      (a, b) =>
        (a.kind === b.kind ? 0 : a.kind === "note" ? -1 : 1) || millis(b.updatedAt) - millis(a.updatedAt),
    )
    .slice(0, limit);
}

/** "From Westlake and Solon", "From 4 studios". */
export function studiosLine(items: NetworkItem[]): string {
  const names = Array.from(new Set(items.map((i) => i.studioName)));
  if (names.length === 0) return "";
  if (names.length === 1) return `From ${names[0]}`;
  if (names.length === 2) return `From ${names[0]} and ${names[1]}`;
  return `From ${names.length} studios`;
}
