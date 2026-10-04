/**
 * THE FLOOR'S NOTES ON A MACHINE — one list per machine, with dates and a
 * history (notes round, Oct 3 2026; AJ's answer 2A).
 *
 * What a studio knows about the unit in ITS building used to live in three
 * places that asked for the same thing:
 *
 *   "Studio notes"          studios/{s}/machineNotes/{machineId} — one text,
 *                           overwritten on every save, no history
 *   the studio's note       studios/{s}/wiki/machine__{id} — an overlay
 *     on the Catalog        under Execution, the one that could be offered
 *                           to every MSF studio
 *   the unit's note         roster/{id}.studioNotes — a leader's line in
 *                           Local set-up, shown on the Catalog only when the
 *                           first was empty
 *
 * AJ chose to merge them: "one list per machine, with dates and a history,
 * the way client notes became threads". A note is a thread here too — "the
 * pin sticks at 7" → "maintenance came Tuesday" → closed, "Fixed" — so the
 * whole story of a unit is in one place, and a closed note is history, never
 * gone. Stored at studios/{s}/floorNotes/{noteId} (firestore.rules): read and
 * written by the people who work there, the words changed only by their
 * author or a leader, closed by anyone, archived not deleted, offered to
 * every MSF studio one note at a time and shared only by an administrator.
 *
 * NOTHING OLD IS REWRITTEN. The three old stores are read as they are and
 * shown under the list as EARLIER NOTES, read-only, with when and who where
 * they say it, until someone copies one into a dated note: the copy says
 * where it came from (`copiedFrom`), and the earlier one then stops showing,
 * however the copy is changed afterwards. A Catalog note that is shared with
 * (or offered to) every MSF studio keeps showing with its switch, so the
 * studio can always take it back. Nothing here writes the old stores.
 *
 * Pure: no React, no Firebase. `floor-notes.test.ts` pins it.
 */
import { formatStudioDate } from "../../lib/studio-time";
import type { WikiBlock } from "../wiki/studio-wiki";

export interface FloorNoteAuthor {
  id: string;
  name: string;
}

export interface FloorNote {
  id: string;
  machineId: string;
  /** The machine's name when it was written, for whoever reads it away from the machine (the review). */
  machineName?: string;
  /** Which earlier note this one was copied from, when it was. */
  copiedFrom?: EarlierKey;
  body: string;
  /** Null on a note of its own; the root's id on an update. */
  threadId: string | null;
  authorId: string;
  authorName: string;
  createdAt: unknown;
  updatedAt: unknown;
  resolvedAt: unknown;
  resolvedBy: FloorNoteAuthor | null;
  isArchived: boolean;
  /** The offer to every MSF studio (features/machine-db), on a root only. */
  shared?: boolean;
  sharedKeys?: string[];
  studioName?: string;
  shareStatus?: "pending" | "approved" | "declined";
  shareReviewNote?: string;
}

export interface FloorThread {
  id: string;
  root: FloorNote;
  /** Oldest first, under the root. */
  updates: FloorNote[];
  /** The newest thing said on it, ms; 0 when no date reads. */
  lastMs: number;
  closed: boolean;
}

export type EarlierKey = "studio-notes" | "catalog-note" | "unit-note";
export const EARLIER_KEYS: readonly EarlierKey[] = ["studio-notes", "catalog-note", "unit-note"];

/** An older note from one of the three stores the list replaced. Read-only. */
export interface EarlierNote {
  key: EarlierKey;
  /** Where it came from, in the floor's words. */
  label: string;
  text: string;
  by: string | null;
  atMs: number | null;
  /** The Catalog note could be offered to every MSF studio: its id, to keep its switch. */
  wikiDocId?: string;
  /** Its share state, the Catalog note only (ShareToggle reads it). */
  shared?: boolean;
  shareStatus?: "pending" | "approved" | "declined";
  shareReviewNote?: string;
  /** Already copied into a dated note: shown only to keep its share switch. */
  copied: boolean;
}

export const FLOOR_NOTE_MAX = 2000;

const str = (v: unknown, max = FLOOR_NOTE_MAX) => (typeof v === "string" ? v.slice(0, max) : "");

export function msOf(v: unknown): number | null {
  if (!v) return null;
  if (typeof v === "number") return v;
  if (v instanceof Date) return v.getTime();
  const d = (v as { toDate?: () => Date }).toDate?.();
  return d && !isNaN(d.getTime()) ? d.getTime() : null;
}

/** A stored floor note, or null when it can't be read as one. */
export function floorNoteFromDoc(id: string, d: Record<string, unknown> | undefined): FloorNote | null {
  if (!d) return null;
  const machineId = str(d.machineId, 200).trim();
  const body = str(d.body).trim();
  if (!machineId || !body) return null;
  const rb = d.resolvedBy as Record<string, unknown> | null | undefined;
  return {
    id,
    machineId,
    ...(typeof d.machineName === "string" && d.machineName.trim() ? { machineName: d.machineName.slice(0, 120) } : {}),
    ...((EARLIER_KEYS as readonly unknown[]).includes(d.copiedFrom) ? { copiedFrom: d.copiedFrom as EarlierKey } : {}),
    body,
    threadId: typeof d.threadId === "string" && d.threadId ? d.threadId : null,
    authorId: str(d.authorId, 200),
    authorName: str(d.authorName, 120) || "Someone",
    createdAt: d.createdAt ?? null,
    updatedAt: d.updatedAt ?? null,
    resolvedAt: d.resolvedAt ?? null,
    resolvedBy: rb && typeof rb.id === "string" ? { id: rb.id, name: str(rb.name, 120) } : null,
    isArchived: d.isArchived === true,
    ...(typeof d.shared === "boolean" ? { shared: d.shared } : {}),
    ...(Array.isArray(d.sharedKeys) ? { sharedKeys: d.sharedKeys.filter((k): k is string => typeof k === "string") } : {}),
    ...(typeof d.studioName === "string" ? { studioName: d.studioName } : {}),
    ...(d.shareStatus === "pending" || d.shareStatus === "approved" || d.shareStatus === "declined"
      ? { shareStatus: d.shareStatus }
      : {}),
    ...(typeof d.shareReviewNote === "string" ? { shareReviewNote: d.shareReviewNote } : {}),
  };
}

const writtenMs = (n: FloorNote) => msOf(n.createdAt) ?? msOf(n.updatedAt) ?? 0;

/**
 * One machine's notes as threads: open ones first, newest movement first,
 * then closed ones, newest first. An update whose root isn't here stands as
 * its own thread rather than vanishing; an archived note is left out.
 */
export function floorThreads(notes: readonly FloorNote[], machineId: string): FloorThread[] {
  const mine = notes.filter((n) => n.machineId === machineId && !n.isArchived);
  const roots = new Map<string, FloorNote>();
  for (const n of mine) if (!n.threadId) roots.set(n.id, n);
  const updates = new Map<string, FloorNote[]>();
  for (const n of mine) {
    if (!n.threadId) continue;
    if (roots.has(n.threadId)) {
      const list = updates.get(n.threadId) ?? [];
      list.push(n);
      updates.set(n.threadId, list);
    } else {
      roots.set(n.id, { ...n, threadId: null });
    }
  }
  const threads: FloorThread[] = [...roots.values()].map((root) => {
    const ups = (updates.get(root.id) ?? []).sort((a, b) => writtenMs(a) - writtenMs(b));
    const lastMs = Math.max(writtenMs(root), ...ups.map(writtenMs));
    return { id: root.id, root, updates: ups, lastMs, closed: Boolean(root.resolvedAt) };
  });
  return threads.sort((a, b) => (a.closed === b.closed ? b.lastMs - a.lastMs : a.closed ? 1 : -1));
}

/** The words of a Catalog note (wiki overlay), as plain text. */
export function blocksText(blocks: readonly WikiBlock[] | null | undefined): string {
  if (!Array.isArray(blocks)) return "";
  return blocks
    .map((b) => {
      const anyB = b as unknown as Record<string, unknown>;
      if (typeof anyB.text === "string") return anyB.text;
      if (Array.isArray(anyB.items)) return (anyB.items as unknown[]).filter((x) => typeof x === "string").map((x) => `• ${x}`).join("\n");
      return "";
    })
    .map((t) => t.trim())
    .filter(Boolean)
    .join("\n");
}

const norm = (t: string) => t.replace(/\s+/g, " ").trim().toLowerCase();

/**
 * The older notes to show under the list, each once, in the order a reader
 * would want them (the Catalog note, the Studio notes, the unit's note). One
 * already copied into a dated note — it says so, or its words are already a
 * note on the list — is left out, except a Catalog note shared with (or
 * offered to) every MSF studio, which stays, marked copied, for its switch.
 */
export function earlierNotes(
  input: {
    studioNotes?: { text: string; by?: string | null; at?: unknown } | null;
    catalogNote?: {
      id: string;
      blocks: readonly WikiBlock[];
      by?: string | null;
      at?: unknown;
      shared?: boolean;
      shareStatus?: "pending" | "approved" | "declined";
      shareReviewNote?: string;
    } | null;
    unitNote?: string | null;
  },
  threads: readonly FloorThread[],
): EarlierNote[] {
  const said = new Set<string>();
  const claimed = new Set<EarlierKey>();
  for (const t of threads) {
    for (const n of [t.root, ...t.updates]) {
      said.add(norm(n.body));
      if (n.copiedFrom) claimed.add(n.copiedFrom);
    }
  }
  const out: EarlierNote[] = [];
  const seen = new Set<string>();
  const add = (e: Omit<EarlierNote, "copied">, keepWhenCopied = false) => {
    const k = norm(e.text);
    if (!k || seen.has(k)) return;
    seen.add(k);
    const copied = claimed.has(e.key) || said.has(k);
    if (copied && !keepWhenCopied) return;
    out.push({ ...e, copied });
  };
  const c = input.catalogNote;
  if (c) {
    const offered = c.shared === true || c.shareStatus === "pending";
    add(
      {
        key: "catalog-note",
        label: "The studio's note on the Catalog",
        text: blocksText(c.blocks),
        by: c.by ?? null,
        atMs: msOf(c.at),
        wikiDocId: c.id,
        ...(typeof c.shared === "boolean" ? { shared: c.shared } : {}),
        ...(c.shareStatus ? { shareStatus: c.shareStatus } : {}),
        ...(c.shareReviewNote ? { shareReviewNote: c.shareReviewNote } : {}),
      },
      offered,
    );
  }
  if (input.studioNotes) {
    add({
      key: "studio-notes",
      label: "Studio notes",
      text: input.studioNotes.text.trim(),
      by: input.studioNotes.by ?? null,
      atMs: msOf(input.studioNotes.at),
    });
  }
  if (input.unitNote) add({ key: "unit-note", label: "The unit's note (Local set-up)", text: input.unitNote.trim(), by: null, atMs: null });
  return out;
}

/** The open notes on a machine, as the session's machine sheet reads them: words only, newest first. */
export function openFloorLines(threads: readonly FloorThread[]): { text: string; latest: string | null; by: string; atMs: number }[] {
  return threads
    .filter((t) => !t.closed)
    .map((t) => {
      const last = t.updates[t.updates.length - 1] ?? null;
      return { text: t.root.body, latest: last ? last.body : null, by: (last ?? t.root).authorName, atMs: t.lastMs };
    });
}

/** When, in the studio's day: "Oct 3", or "Oct 3, 2025" from another year; "" when no date reads. */
export function whenWords(ms: number | null, nowMs: number): string {
  if (!ms) return "";
  const year = (t: number) => formatStudioDate(new Date(t), { year: "numeric" });
  const sameYear = year(ms) === year(nowMs);
  return formatStudioDate(
    new Date(ms),
    sameYear ? { month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" },
  );
}
