/**
 * RENEWALS — the nightly job's decisions, kept pure so they can be tested.
 *
 * server/renewals-job.ts does the reading and writing; this file decides:
 *   - which clients are worth a Mindbody pull tonight (the API is metered:
 *     1,000 calls a day free, then about a third of a cent each), and
 *   - which Mindbody names this studio uses, for the settings screen.
 */

import { mindbodyDayKey } from "./engine";
import { daysBetween } from "../client-history/model";
import { normalizeMindbodyName, type PackageNameIndex } from "./settings";
import type { Client } from "../../types";
import type { RenewalNamesSeen, RenewalSnapshot } from "./types";

/** Near a renewal, data older than this is refreshed. */
export const NEAR_WINDOW_DAYS = 120;
export const NEAR_WINDOW_REFRESH_DAYS = 7;
/** Everyone else is refreshed this often. */
export const STALE_AFTER_DAYS = 30;
/** Two calls a client: contracts and pricing options. */
export const CALLS_PER_PULL = 2;

/** The Mindbody id to ask about, or null when there is none to ask. */
export function mindbodyIdOf(client: Client): string | null {
  if (client.provisional || client.supersededById || client.migratedTo) return null;
  const id = String(client.mindbodyClientId || client.mindbodyId || client.id || "").trim();
  return /^[A-Za-z0-9_-]{1,40}$/.test(id) ? id : null;
}

/**
 * Should tonight's run pull this client from Mindbody, and how urgently?
 * Returns null for "no", else a rank: lower goes first.
 *
 *   0  near a renewal (inside 120 days) and not pulled this week
 *   1  never pulled, and active: a visit or a booking in the window
 *   2  not pulled for a month
 *   3  never pulled, and quiet
 */
export function pullRank(params: {
  client: Client;
  /** The snapshot built from what is already stored. */
  current: RenewalSnapshot;
  today: string;
}): number | null {
  const { client, current, today } = params;
  if (!mindbodyIdOf(client)) return null;
  const pulled = mindbodyDayKey(client.mindbodyServicesSyncedAt);
  const age = pulled ? daysBetween(pulled, today) : null;
  const active = Boolean(current.lastVisitDate || current.nextBookingDate);

  if (age === null) return active ? 1 : 3;
  if (
    current.focusDate &&
    daysBetween(today, current.focusDate) <= NEAR_WINDOW_DAYS &&
    age >= NEAR_WINDOW_REFRESH_DAYS
  ) {
    return 0;
  }
  if (age >= STALE_AFTER_DAYS) return 2;
  return null;
}

/**
 * Every contract and pricing-option name at a studio, with how many clients
 * hold it. The settings screen lists the ones no package claims.
 */
export function namesSeenFrom(clients: Client[]): RenewalNamesSeen["names"] {
  const names: RenewalNamesSeen["names"] = {};
  const add = (raw: unknown, kind: "contract" | "pricing-option", clientId: string, counted: Set<string>) => {
    if (typeof raw !== "string" || !raw.trim()) return;
    const key = `${kind}:${normalizeMindbodyName(raw)}`.replace(/[.~*/[\]]/g, "_").slice(0, 150);
    const mark = `${key}|${clientId}`;
    if (counted.has(mark)) return;
    counted.add(mark);
    const entry = names[key] ?? { name: raw.trim(), kind, clients: 0 };
    entry.clients += 1;
    names[key] = entry;
  };
  const counted = new Set<string>();
  for (const c of clients) {
    const id = c.id ?? "";
    for (const k of Object.values(c.mindbodyContracts ?? {})) add(k?.contractName, "contract", id, counted);
    for (const s of Object.values(c.mindbodyServices ?? {})) add(s?.name, "pricing-option", id, counted);
  }
  return names;
}

/** Only the names that no package (or the extra-sessions list) claims. */
export function unmatchedNames(
  names: RenewalNamesSeen["names"],
  index: PackageNameIndex,
): RenewalNamesSeen["names"][string][] {
  return Object.values(names)
    .filter((n) => !index.tierFor(n.name) && !index.isExtraSessions(n.name))
    .sort((a, b) => b.clients - a.clients);
}
