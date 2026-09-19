/**
 * ATTENTION — what a leader has DONE about a row on the Overview. Pure.
 *
 * Operations overhaul, Sep 2026. The Overview's rows are claims with proof:
 * "no visit in 23 days", "pain on the Dial, left shoulder". This module is
 * the other half — the leader's answer to a claim — and it lives beside the
 * studio, never on the client's record or the trainer's note:
 *
 *   studios/{s}/watchlist/{clientId}       the attendance dispositions:
 *                                          snooze ("remind me again on this
 *                                          date") or dismiss ("I know why they
 *                                          are out"). AJ, Sep 19.
 *   studios/{s}/acknowledgements/{key}     "someone saw this": an incident, a
 *                                          critical note, a pain report. One
 *                                          document per source, keyed by it,
 *                                          so a NEW incident on the same
 *                                          client surfaces again.
 *
 * THE BACK-AGAIN RULE (AJ): "if a dismissed client books again, the app
 * flags that they have booked again — closing the loop, and a genuinely
 * nice moment for a trainer to catch." A dismissed client whose nightly
 * snapshot now shows a booking or a visit after the dismissal is shown once
 * as back; "Got it" deletes the disposition and the client is watched
 * normally again.
 */
import type { Client } from "../../../types";
import { clientDisplayName } from "../../../lib/client-name";
import type { RenewalSnapshot } from "../../renewals/types";

/* ------------------------------------------------------------------ *
 * The documents
 * ------------------------------------------------------------------ */

export interface WatchlistEntry {
  clientId: string;
  /** `YYYY-MM-DD` — the row comes back on this day. */
  snoozedUntil: string | null;
  /** `YYYY-MM-DD` — the day it was taken off the list. */
  dismissedAt: string | null;
  dismissedBy: string | null;
  dismissedByName: string | null;
  /** The snapshot's answers on the day of the dismissal, so "since then" can be judged. */
  lastVisitAtDismissal: string | null;
  nextBookingAtDismissal: string | null;
  updatedAt?: unknown;
}

export type AckKind = "incident" | "note" | "pain" | "drop";

export interface Acknowledgement {
  sourceKind: AckKind;
  clientId: string;
  acknowledgedAt: unknown;
  acknowledgedBy: string;
  acknowledgedByName: string;
}

/** The document id for one acknowledged thing. */
export const ackKey = (kind: AckKind, sourceId: string): string => `${kind}:${sourceId}`;

/* ------------------------------------------------------------------ *
 * The watchlist
 * ------------------------------------------------------------------ */

export type WatchState = "watching" | "snoozed" | "dismissed";

export function watchState(entry: WatchlistEntry | undefined, today: string): WatchState {
  if (!entry) return "watching";
  if (entry.snoozedUntil && entry.snoozedUntil > today) return "snoozed";
  if (entry.dismissedAt) return "dismissed";
  return "watching";
}

export interface WatchedSplit<T> {
  shown: T[];
  snoozed: T[];
  dismissed: T[];
}

/** Rows a leader has already answered come out of the list; the rest stay. */
export function splitWatched<T extends { clientId: string }>(
  rows: T[],
  watchlist: ReadonlyMap<string, WatchlistEntry>,
  today: string,
): WatchedSplit<T> {
  const out: WatchedSplit<T> = { shown: [], snoozed: [], dismissed: [] };
  for (const row of rows) {
    const state = watchState(watchlist.get(row.clientId), today);
    if (state === "snoozed") out.snoozed.push(row);
    else if (state === "dismissed") out.dismissed.push(row);
    else out.shown.push(row);
  }
  return out;
}

export interface BackAgainRow {
  clientId: string;
  name: string;
  sentence: string;
  proof: string;
}

const shortDate = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
};

/**
 * Dismissed clients who have booked or visited since. Judged against the
 * snapshot as it stood when they were dismissed, so a booking that was
 * already on the books then does not count as "back".
 */
export function backAgain(watchlist: ReadonlyMap<string, WatchlistEntry>, clients: Client[], today: string): BackAgainRow[] {
  const byId = new Map(clients.filter((c) => c.id).map((c) => [c.id as string, c]));
  const rows: BackAgainRow[] = [];
  for (const entry of watchlist.values()) {
    if (watchState(entry, today) !== "dismissed" || !entry.dismissedAt) continue;
    const client = byId.get(entry.clientId);
    const s = client?.renewal as RenewalSnapshot | undefined;
    if (!client || !s) continue;
    const name = clientDisplayName(client, "A client");
    const bookedSince =
      s.nextBookingDate && s.nextBookingDate >= today && s.nextBookingDate !== entry.nextBookingAtDismissal;
    const visitedSince = s.lastVisitDate && s.lastVisitDate > entry.dismissedAt && s.lastVisitDate !== entry.lastVisitAtDismissal;
    if (!bookedSince && !visitedSince) continue;
    rows.push({
      clientId: entry.clientId,
      name,
      sentence: visitedSince
        ? `Back — visited ${shortDate(s.lastVisitDate as string)}${bookedSince ? `, and booked again ${shortDate(s.nextBookingDate as string)}` : ""}.`
        : `Back — booked again for ${shortDate(s.nextBookingDate as string)}.`,
      proof: `Taken off the list ${shortDate(entry.dismissedAt)}${entry.dismissedByName ? ` by ${entry.dismissedByName}` : ""}.`,
    });
  }
  rows.sort((a, b) => a.name.localeCompare(b.name));
  return rows;
}

/** The disposition written when a leader dismisses, from the snapshot as it stands. */
export function dismissal(
  clientId: string,
  client: Client | undefined,
  me: { id: string; name: string },
  today: string,
): WatchlistEntry {
  const s = client?.renewal as RenewalSnapshot | undefined;
  return {
    clientId,
    snoozedUntil: null,
    dismissedAt: today,
    dismissedBy: me.id,
    dismissedByName: me.name,
    lastVisitAtDismissal: s?.lastVisitDate ?? null,
    nextBookingAtDismissal: s?.nextBookingDate ?? null,
  };
}

export function snooze(clientId: string, untilDay: string): WatchlistEntry {
  return {
    clientId,
    snoozedUntil: untilDay,
    dismissedAt: null,
    dismissedBy: null,
    dismissedByName: null,
    lastVisitAtDismissal: null,
    nextBookingAtDismissal: null,
  };
}

/* ------------------------------------------------------------------ *
 * Acknowledgements
 * ------------------------------------------------------------------ */

export interface Acknowledgeable {
  /** One key per underlying thing; the row is acknowledged when every key is. */
  ackKeys: string[];
}

export function isAcknowledged(row: Acknowledgeable, acks: ReadonlySet<string>): boolean {
  return row.ackKeys.length > 0 && row.ackKeys.every((k) => acks.has(k));
}

/** The rows still waiting, and how many were put away. */
export function pendingAcks<T extends Acknowledgeable>(rows: T[], acks: ReadonlySet<string>): { pending: T[]; acknowledged: number } {
  const pending: T[] = [];
  let acknowledged = 0;
  for (const row of rows) {
    if (isAcknowledged(row, acks)) acknowledged += 1;
    else pending.push(row);
  }
  return { pending, acknowledged };
}

/** Every key an "acknowledge all" would write, deduplicated, skipping what is already done. */
export function keysToAcknowledge(rows: Acknowledgeable[], acks: ReadonlySet<string>): string[] {
  const out = new Set<string>();
  for (const row of rows) for (const k of row.ackKeys) if (!acks.has(k)) out.add(k);
  return [...out];
}

/** The kind is the part of the key before the first colon. */
export function kindOfKey(key: string): AckKind {
  const kind = key.slice(0, key.indexOf(":"));
  return kind === "incident" || kind === "note" || kind === "pain" || kind === "drop" ? kind : "note";
}
