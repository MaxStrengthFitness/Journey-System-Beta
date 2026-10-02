/**
 * THE VIEW CHIPS — All · Mine · Kaizen · In today — and the sort each one
 * remembers. Pure apart from the storage it is handed: views.test.ts.
 *
 * Research-directory §6 (Direction A) and §7: the lenses that belong to a
 * TRAINER sit above the list as chips with live counts. Leaders' lenses
 * (not in lately, running low) stay in Operations.
 *
 * MINE is the one rule every screen asks (src/lib/mine.ts, the Atlas answers,
 * Oct 2 2026): booked with you (in the bookings the app holds, the next
 * eight days), or coached by you in the last 60 days (the nightly record's
 * coachIds). Labelled "My clients", and said in one line under the chips.
 * The Kaizen Roster has its own chip; a top trainer or a session long ago no
 * longer makes a client yours.
 */
import type { Client } from "../../types";
import { isMine as isMineByRule, mineDefinition } from "../../lib/mine";
import type { DirectoryRow } from "./row";
import { isSortKey, type SortDir, type SortSpec } from "./buckets";
import { daysBetween } from "../client-history/model";
import { markHolds, pastInactiveLine, type InactiveMark } from "../admin/journey/inactive";

export type ViewId = "all" | "mine" | "kaizen" | "today";

export const VIEWS: ReadonlyArray<{ id: ViewId; label: string }> = [
  { id: "all", label: "All" },
  { id: "mine", label: "My clients" },
  { id: "kaizen", label: "Kaizen" },
  { id: "today", label: "In today" },
];

export const MINE_DEFINITION = mineDefinition("clients");

export const TODAY_DEFINITION = "In today: everyone booked at this studio today, earliest first. Start opens the session.";

/** Is this client one of the signed-in trainer's? See the header for the rule. */
export function isMine(row: Pick<DirectoryRow, "client" | "bookedWithMe">, myIds: ReadonlyArray<string>): boolean {
  return isMineByRule(row.client as Client, myIds, { bookedWithMe: row.bookedWithMe });
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
/* Inactive: out of the way, never deleted (Oct 1 2026)                */
/* ------------------------------------------------------------------ */

/**
 * How a row is inactive, or null when she isn't (the inactive round, Oct 1
 * 2026; AJ: active > MIA > inactive). All leaves an inactive client out by
 * default, behind the "Inactive N" chip; a search still finds her, with the
 * word on her row. The Journey's rule (admin/journey/states.ts) on the row's
 * own facts, which are the facts the Journey reads:
 *
 *   manual      a leader's mark that still holds (no visit after the day it
 *               was made), unless she is booked: a booking makes her active;
 *   automatic   a known last visit past the studio's Inactive line
 *               (`inactiveDays`), nothing booked as read, last night's record
 *               there and not Away: never off what can't be judged;
 *   mindbody    Mindbody itself says she is inactive (the row's own
 *               "Inactive" badge since the directory round).
 */
export type InactiveHow = "manual" | "automatic" | "mindbody";

export function inactiveHow(
  row: Pick<DirectoryRow, "client" | "lastIn" | "next">,
  mark: Pick<InactiveMark, "day"> | null,
  today: string,
  inactiveDays: number,
): InactiveHow | null {
  const client = row.client as Client;
  if (client.isActive === false) return "mindbody";
  const lastVisit = row.lastIn.state === "known" ? row.lastIn.day : null;
  if (row.next.state === "booked") return null;
  if (mark && markHolds(mark, lastVisit)) return "manual";
  const record = client.renewal as { situation?: unknown } | undefined;
  if (!record || record.situation === "away" || !lastVisit) return null;
  return pastInactiveLine(daysBetween(lastVisit, today), row.next.state === "none", inactiveDays) ? "automatic" : null;
}

export const INACTIVE_DEFINITION = (inactiveDays: number) =>
  `Inactive: marked inactive by a leader, past the studio’s ${inactiveDays}-day line with nothing booked, or inactive in Mindbody. Out of the way, never deleted; a booking makes her active again.`;

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
