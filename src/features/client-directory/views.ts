/**
 * THE VIEW CHIPS — All · Mine · Kaizen · In today — and the sort each one
 * remembers. Pure apart from the storage it is handed: views.test.ts.
 *
 * Research-directory §6 (Direction A) and §7: the lenses that belong to a
 * TRAINER sit above the list as chips with live counts. Leaders' lenses
 * (not in lately, running low) stay in Operations.
 *
 * MINE has no single field, so it is said in one line under the chips:
 * Relay's rule for "their clients" (`isMyClient`: the nightly record's
 * coachIds — coached in the last 60 days — or any session the trainer has
 * logged in Journey, or her top trainer), plus the nightly record's
 * primaryTrainerId (most visits in the last 90 days), plus anyone booked
 * with them in the bookings the app holds, plus their Kaizen Roster. The
 * research asked for "trained by me in the last 90 days"; the data can say
 * 60 days, or ever in Journey, but not exactly 90 — so the line says what it
 * is. The window is one of AJ's open questions.
 */
import type { Client } from "../../types";
import { isMyClient } from "../relay/board/mine";
import type { DirectoryRow } from "./row";
import { isSortKey, type SortDir, type SortSpec } from "./buckets";

export type ViewId = "all" | "mine" | "kaizen" | "today";

export const VIEWS: ReadonlyArray<{ id: ViewId; label: string }> = [
  { id: "all", label: "All" },
  { id: "mine", label: "Mine" },
  { id: "kaizen", label: "Kaizen" },
  { id: "today", label: "In today" },
];

export const MINE_DEFINITION =
  "Mine: clients you\u2019ve coached (the nightly record\u2019s last 60 days, or any session you\u2019ve logged in Journey), anyone booked with you in the next 8 days, and your Kaizen Roster.";

export const TODAY_DEFINITION = "In today: everyone booked at this studio today, earliest first. Start opens the session.";

/** Is this client one of the signed-in trainer's? See the header for the rule. */
export function isMine(row: Pick<DirectoryRow, "client" | "bookedWithMe" | "kaizen">, myIds: ReadonlyArray<string>): boolean {
  if (row.bookedWithMe || row.kaizen) return true;
  const client = row.client as Client;
  for (const id of myIds) {
    if (!id) continue;
    if (isMyClient(client, id)) return true;
    if (client.renewal?.primaryTrainerId === id) return true;
  }
  return false;
}

export function inView(row: DirectoryRow, view: ViewId, myIds: ReadonlyArray<string>): boolean {
  switch (view) {
    case "all":
      return true;
    case "mine":
      return isMine(row, myIds);
    case "kaizen":
      return !!row.kaizen;
    case "today":
      return !!row.today;
  }
}

export function viewCounts(rows: ReadonlyArray<DirectoryRow>, myIds: ReadonlyArray<string>): Record<ViewId, number> {
  const out: Record<ViewId, number> = { all: 0, mine: 0, kaizen: 0, today: 0 };
  for (const row of rows) {
    out.all += 1;
    if (isMine(row, myIds)) out.mine += 1;
    if (row.kaizen) out.kaizen += 1;
    if (row.today) out.today += 1;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* The sort a trainer chose, remembered on this iPad                   */
/* ------------------------------------------------------------------ */

/**
 * The directory opens on Last in, most recent first — research's
 * recommendation, and AJ's first open question (default sort).
 */
export const DEFAULT_SORT: SortSpec = { key: "lastIn", dir: "desc" };
/** In today reads by the clock. */
export const TODAY_SORT: SortSpec = { key: "time", dir: "asc" };

export const SORT_STORE_PREFIX = "journey.directory.sort.";

/** The part of the Web Storage interface used here. */
export interface SortStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * The sort this trainer last chose on this iPad, or the default. Kept in
 * local storage per trainer, NOT on the trainer document (that would be a
 * Firestore structure change); a sign-out clears local storage
 * (features/sign-out), so it lasts while they are signed in here.
 */
export function readSavedSort(storage: SortStorage | null | undefined, trainerId: string | null | undefined): SortSpec {
  if (!storage || !trainerId) return DEFAULT_SORT;
  try {
    const raw = storage.getItem(`${SORT_STORE_PREFIX}${trainerId}`);
    if (!raw) return DEFAULT_SORT;
    const v = JSON.parse(raw) as { key?: unknown; dir?: unknown };
    if (isSortKey(v.key) && v.key !== "time" && (v.dir === "asc" || v.dir === "desc")) return { key: v.key, dir: v.dir as SortDir };
  } catch {
    // Private window, blocked storage or a value from an older build: the default.
  }
  return DEFAULT_SORT;
}

export function saveSort(storage: SortStorage | null | undefined, trainerId: string | null | undefined, spec: SortSpec): void {
  if (!storage || !trainerId || spec.key === "time") return;
  try {
    storage.setItem(`${SORT_STORE_PREFIX}${trainerId}`, JSON.stringify(spec));
  } catch {
    // Storage full or refused: the sort still applies for this visit.
  }
}

/** The browser's local storage, or null where touching it throws. */
export function browserStorage(): SortStorage | null {
  try {
    return typeof window !== "undefined" && window.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
}
