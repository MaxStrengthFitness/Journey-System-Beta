/**
 * NOTE THREADS — a note is a thread, not a fact.
 *
 * Notes round, Sep 20 2026. AJ's brief: "something opens — fell down the
 * stairs, can't do overhead movements — runs for a while, and then either
 * closes ('all healed up') or deepens ('actually I have an MRI on the
 * 31st')." Before this round every one of those was a separate note, so a
 * shoulder's story was scattered down a timeline in the order it was typed.
 *
 * ONE NOTE, A SPINE OF UPDATES. An update is an ordinary `journalEntries`
 * document carrying `threadId` — the root note's id. There is no second
 * collection and no denormalised copy: exactly the shape a trainer focus
 * already uses for its check-ins (`focusId`), for the same reason. The
 * thread and the client's timeline are the same records.
 *
 * WHAT LIVES ON THE ROOT, and only there:
 *   • the mattering window (AJ: "timing lives on the thread, not on each
 *     entry") — so `mattering.ts` is asked about the root and nothing else;
 *   • the loudness;
 *   • `resolvedAt`, which closes the whole thread.
 * An update carries a body, an author and a time. That is the whole model.
 *
 * CONTRADICTING A NOTE ADDS TO IT. If a note says "can't do overhead" and
 * the client does it fine, the trainer adds "performed overhead, seemed
 * okay" — they do not close it. AJ's reasoning, and the reason this is
 * stated here rather than left to the UI: the good outcome may have
 * happened BECAUSE of the note — the trainer was careful. Closing would
 * delete the reason it went well and the next trainer would never see it.
 * A thread accumulates evidence; closing is a deliberate, separate act.
 *
 * THE THREE ZONES (`zoneOf`) are not a status anyone sets. They fall out of
 * the timing the trainer already picked in the composer, which is AJ's
 * decision on Sep 20: no second vocabulary to keep in sync with the first.
 *
 *   OPEN      live, and something you could ask about today: a dated window
 *             that is current or still coming, or an "always" note that
 *             shouts (Heads up / Critical) and therefore waits for someone
 *             to resolve it — "no overhead until the shoulder's cleared".
 *   STANDING  quiet but true: an "always" note at plain loudness. A bad
 *             shoulder the regular trainer has known for two years.
 *   RESOLVED  someone closed it, or its window ran out on its own.
 *
 * Reading a standard "always" note as standing context rather than an open
 * thread is the same call `needsReview` already makes in mattering.ts: a
 * note that never shouted has nothing to retire.
 *
 * Pure — no React, no Firestore, no clock of its own. The writes are in
 * `thread-write.ts`.
 */
import type { JournalEntry } from "../../types/journal";
import { toDate } from "../../types/journal";
import { choiceOf, nextOccurrence, shapeOf } from "./mattering";

export type ThreadZone = "open" | "standing" | "resolved";

export const THREAD_ZONES: readonly ThreadZone[] = ["open", "standing", "resolved"];

export interface ThreadZoneMeta {
  id: ThreadZone;
  /** The heading over the zone. */
  label: string;
  /** One line under it — what belongs here and why. */
  blurb: string;
}

export const THREAD_ZONE_META: Record<ThreadZone, ThreadZoneMeta> = {
  open: {
    id: "open",
    label: "Open",
    blurb: "Live — things you could ask about today.",
  },
  standing: {
    id: "standing",
    label: "Standing context",
    blurb: "Quiet but true. Known, not news.",
  },
  resolved: {
    id: "resolved",
    label: "Resolved",
    blurb: "Closed or run out. Kept, and findable.",
  },
};

export interface NoteThread {
  /** The root note's id — the thread's id everywhere else in the app. */
  id: string;
  root: JournalEntry;
  /** Updates attached to the root, OLDEST first: the spine, read top to bottom. */
  updates: JournalEntry[];
  /** The root then its updates — what a card renders in order. */
  entries: JournalEntry[];
  /** The newest thing that happened: the last update, else the root itself. */
  lastActivityAt: Date | null;
  /**
   * The last time anything about the thread CHANGED — an update, or an edit
   * to any of its entries. What a dismissal is measured against, because
   * "any update brings it back for everyone" has to cover a note whose
   * wording was corrected as well as one with something new hung off it.
   */
  lastTouchedAt: Date | null;
  /** Someone closed it. A thread whose window merely ran out is not this. */
  isResolved: boolean;
}

/** The thread an entry belongs to: its own id for a root, `threadId` for an update. */
export function rootIdOf(entry: Pick<JournalEntry, "id" | "threadId">): string {
  const parent = typeof entry.threadId === "string" ? entry.threadId.trim() : "";
  return parent || entry.id;
}

/** True when this entry is an update on someone else's thread, not a note of its own. */
export function isThreadUpdate(entry: Pick<JournalEntry, "id" | "threadId">): boolean {
  return rootIdOf(entry) !== entry.id;
}

/**
 * Every entry that is a note in its own right. For the screens that still
 * read a flat list — the timeline, the search, the Overview's panels — so an
 * update never renders twice: once inside its thread and once on its own.
 */
export function withoutThreadUpdates<T extends Pick<JournalEntry, "id" | "threadId">>(
  entries: readonly T[],
): T[] {
  return entries.filter((e) => !isThreadUpdate(e));
}

const timeOf = (e: JournalEntry): number => toDate(e.occurredAt)?.getTime() ?? 0;

/**
 * Group a flat list of entries into threads.
 *
 * An update whose root is not in the list — archived, or older than the read
 * window — becomes a root of its own rather than disappearing. Losing a note
 * because its parent scrolled out of range is exactly the failure this
 * collection is built to avoid.
 */
export function assembleThreads(entries: readonly JournalEntry[]): NoteThread[] {
  const byId = new Map<string, JournalEntry>();
  for (const e of entries) if (e.id) byId.set(e.id, e);

  const updatesByRoot = new Map<string, JournalEntry[]>();
  const roots: JournalEntry[] = [];

  for (const e of entries) {
    if (!e.id) continue;
    const rootId = rootIdOf(e);
    if (rootId === e.id || !byId.has(rootId)) {
      roots.push(e);
      continue;
    }
    const list = updatesByRoot.get(rootId);
    if (list) list.push(e);
    else updatesByRoot.set(rootId, [e]);
  }

  return roots.map((root) => {
    const updates = (updatesByRoot.get(root.id) ?? []).slice().sort((a, b) => timeOf(a) - timeOf(b));
    const last = updates.length ? updates[updates.length - 1] : root;
    const entries = [root, ...updates];
    let touched = 0;
    for (const e of entries) {
      touched = Math.max(touched, toDate(e.updatedAt)?.getTime() ?? 0, toDate(e.occurredAt)?.getTime() ?? 0);
    }
    return {
      id: root.id,
      root,
      updates,
      entries,
      lastActivityAt: toDate(last.occurredAt),
      lastTouchedAt: touched ? new Date(touched) : null,
      isResolved: Boolean(root.resolvedAt),
    };
  });
}

/**
 * Which zone a thread sits in on a given studio day. See the header: the
 * zone is derived from the root's timing and loudness, never stored.
 */
export function zoneOf(
  thread: Pick<NoteThread, "root">,
  today: string,
  tz?: string,
): ThreadZone {
  const root = thread.root;
  if (root.resolvedAt || root.isArchived) return "resolved";

  const shape = shapeOf(root, tz);
  if (shape === "day") {
    // A yearly note comes round again, so it is never spent.
    return nextOccurrence(root, today, tz) ? "open" : "resolved";
  }
  if (shape === "range") {
    const until = choiceOf(root, tz).until;
    return until && until < today ? "resolved" : "open";
  }
  // ALWAYS: it shouts and waits to be closed, or it is simply true.
  return root.importance === "standard" ? "standing" : "open";
}

/** Loudest first, then whatever moved most recently. */
const LOUDNESS_RANK: Record<string, number> = { critical: 0, elevated: 1, standard: 2 };

/**
 * A zone's order: Critical leads even when it is an "always" note (AJ,
 * Sep 20), then Heads up, then by the last thing that happened on the
 * thread. A thread with a fresh update outranks one that has sat still.
 */
export function sortThreads(threads: readonly NoteThread[]): NoteThread[] {
  return threads.slice().sort((a, b) => {
    const rank = (LOUDNESS_RANK[a.root.importance] ?? 3) - (LOUDNESS_RANK[b.root.importance] ?? 3);
    if (rank !== 0) return rank;
    return (b.lastActivityAt?.getTime() ?? 0) - (a.lastActivityAt?.getTime() ?? 0);
  });
}

/** Threads by zone, each already sorted. Every zone is present, even empty. */
export function threadsByZone(
  threads: readonly NoteThread[],
  today: string,
  tz?: string,
): Record<ThreadZone, NoteThread[]> {
  const out: Record<ThreadZone, NoteThread[]> = { open: [], standing: [], resolved: [] };
  for (const t of threads) out[zoneOf(t, today, tz)].push(t);
  for (const zone of THREAD_ZONES) out[zone] = sortThreads(out[zone]);
  return out;
}

/** "1 update" · "4 updates". Null when the thread is still just the note. */
export function updateCountLabel(thread: Pick<NoteThread, "updates">): string | null {
  const n = thread.updates.length;
  if (n === 0) return null;
  return n === 1 ? "1 update" : `${n} updates`;
}
