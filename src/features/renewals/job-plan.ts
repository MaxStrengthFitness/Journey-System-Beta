/**
 * RENEWALS — the nightly job's decisions, kept pure so they can be tested.
 *
 * server/renewals-job.ts does the reading and writing; this file decides:
 *   - which studios the job may ask Mindbody about at all (only those that
 *     have gone live - `studioIsLive`),
 *   - which clients are worth a Mindbody pull tonight (the API is metered:
 *     $0.002 a call on the pricing page AJ sent, Sep 26 2026), and
 *   - which Mindbody names this studio uses, for the settings screen.
 *
 * PACKAGES WHEN A SALE HAPPENS (the cost plan, Sep 26 2026, Part C). AJ ranked
 * packages and sessions remaining "only when a sale happens". Before it, every
 * client near a renewal was pulled weekly and everyone else - past clients
 * included - monthly, up to 300 a night company-wide, whether or not anything
 * had changed. Now a client is pulled when:
 *
 *   0  Mindbody told us something changed: a contract, membership or sale
 *      event marked them (`mindbodyCommercialChangedAt`, written by the
 *      webhook) after their last pull;
 *   1  they are near the end of a package and train TODAY - the renewal
 *      conversation is the one moment the number is used, and Mindbody's
 *      "remaining" goes down with every visit, so it is asked for fresh that
 *      morning, at most weekly. "Near the end" is Journey's own count-down:
 *      sessions left at the last pull, less the sessions Journey logged since,
 *      at or under the studio's conversation threshold. The count-down only
 *      decides WHEN to ask; the number on screen is always Mindbody's (AJ
 *      approved this exception, Sep 26);
 *   2  they are active and have never been pulled;
 *   3  they are active and were last pulled a month ago - the net under a
 *      sale no event reported.
 *
 * A past client (no visit or booking in the window) is never polled: a sale
 * event or a new booking wakes them.
 */

import { mindbodyDayKey } from "./engine";
import { daysBetween } from "../client-history/model";
import { normalizeMindbodyName, type PackageNameIndex } from "./settings";
import type { Client } from "../../types";
import { mindbodyIdOf } from "../../lib/mindbody-id";
import { toDateSafe } from "../../lib/mindbody-dates";
import type { RenewalNamesSeen, RenewalSnapshot } from "./types";

/** Near the end of a package, the morning-of pull waits at least this long between pulls. */
export const NEAR_END_REFRESH_DAYS = 7;
/** An active client's packages are re-read this often when nothing said they changed. */
export const STALE_AFTER_DAYS = 30;
/** Two calls a client: contracts and pricing options. */
export const CALLS_PER_PULL = 2;

/**
 * May the nightly job ask Mindbody about this studio's clients?
 *
 * Only once the studio has gone live: its Journey cutover date is set and is
 * today or tomorrow or already past. Before that, a studio's clients are
 * brought in deliberately, at a pace AJ chooses, by scripts/onboard-studio.ts
 * (AJ, Sep 26 2026: "we don't randomly sync all of our clients and have a big
 * Mindbody bill"). The date is on My Studio -> Studio ("Journey cutover date").
 */
export function studioIsLive(cutover: unknown, tomorrow: string): boolean {
  if (typeof cutover !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(cutover)) return false;
  return cutover <= tomorrow;
}

/**
 * Sessions Journey logged (completed) after `sinceDay`, the day of the last
 * pull - the count-down's input. Days are the sessions' own day keys.
 */
export function sessionsLoggedSince(
  sessions: ReadonlyArray<{ date?: unknown; status?: unknown }>,
  sinceDay: string | null,
): number {
  if (!sinceDay) return 0;
  let n = 0;
  for (const s of sessions) {
    if (s.status !== "Completed") continue;
    const day = typeof s.date === "string" ? s.date.slice(0, 10) : null;
    if (day && day > sinceDay) n++;
  }
  return n;
}

/**
 * The Mindbody id to ask about, or null when there is none to ask. The rule
 * lives in lib/mindbody-id.ts (Master Sync round) so every screen shares it;
 * re-exported here for the nightly job and its tests.
 */
export { mindbodyIdOf };

/**
 * Should tonight's run pull this client from Mindbody, and how urgently?
 * Returns null for "no", else a rank: lower goes first (the header's list).
 */
export function pullRank(params: {
  client: Client;
  /** The snapshot built from what is already stored. */
  current: RenewalSnapshot;
  today: string;
  /** A live booking today, in the studio's day. */
  bookedToday?: boolean;
  /** Sessions Journey logged since the last pull (sessionsLoggedSince). */
  loggedSincePull?: number;
  /** The studio's "start the conversation at (sessions left)". */
  conversationAt?: number;
}): number | null {
  const { client, current, today } = params;
  if (!mindbodyIdOf(client)) return null;
  const pulled = mindbodyDayKey(client.mindbodyServicesSyncedAt);
  const age = pulled ? daysBetween(pulled, today) : null;
  const active = Boolean(current.lastVisitDate || current.nextBookingDate);

  // 0. Mindbody said so: a sale, contract or membership event since the last pull.
  const changedAt = toDateSafe(client.mindbodyCommercialChangedAt);
  const pulledAt = toDateSafe(client.mindbodyServicesSyncedAt);
  if (changedAt && (!pulledAt || changedAt.getTime() > pulledAt.getTime())) return 0;

  // 1. Near the end of a package, in the building today.
  if (params.bookedToday && age !== null && age >= NEAR_END_REFRESH_DAYS && current.sessionsLeft != null) {
    const threshold = params.conversationAt ?? 0;
    const projected = current.sessionsLeft - Math.max(0, params.loggedSincePull ?? 0);
    if (current.conversationDue || projected <= threshold) return 1;
  }

  // 2. Never pulled, and training here.
  if (age === null) return active ? 2 : null;

  // 3. A month since the last pull, and still training here.
  if (active && age >= STALE_AFTER_DAYS) return 3;
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

/**
 * Tonight's pull order: by rank, then — within a rank — the nearest renewal
 * first, so the clients whose conversation is closest never wait behind
 * everyone else as the studio grows.
 */
export function pullOrder(
  a: { rank: number; focusDate: string | null },
  b: { rank: number; focusDate: string | null },
  today: string,
): number {
  const near = (d: string | null) => (d ? Math.abs(daysBetween(today, d)) : Number.MAX_SAFE_INTEGER);
  return a.rank - b.rank || near(a.focusDate) - near(b.focusDate);
}
