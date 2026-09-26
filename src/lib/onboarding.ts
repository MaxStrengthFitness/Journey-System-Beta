/**
 * THE PRE-LAUNCH SYNC — who counts, decided without a network.
 *
 * The cost plan (docs/rounds/2026-09-26-cost-plan.md, Part B). A few days
 * before a studio moves onto Journey, `scripts/onboard-studio.ts` brings every
 * client who matters up to date with Mindbody in one careful run, so launch
 * day's Hub has real names, real visit counts and real packages rather than
 * stubs. This module is the half that decides; the script reads, calls and
 * writes.
 *
 * WHO COUNTS (AJ, Sep 26 2026): anyone booked in the next 30 days, plus anyone
 * who trained in the last 6 months. Everyone else - the long-gone, the leads -
 * is synced the first time they are booked, by the nightly job.
 *
 * They are found from ONE appointments pull over the window, not by asking
 * about every client Mindbody holds (the shared site holds every lead since
 * the studios opened). Mindbody does not return a booking cancelled early, so
 * a client whose only booking was cancelled is, rightly, not in the list; a
 * row still marked Cancelled is dropped here as well.
 *
 * PURE MODULE - no Firestore, no network. Dates are the studio's day keys
 * ("YYYY-MM-DD"), as Mindbody's wall-clock times read.
 */

/** Months back that count as "trained recently" (AJ: six). */
export const ONBOARD_MONTHS_BACK = 6;
/** Days ahead that count as "booked soon" (AJ: thirty). */
export const ONBOARD_DAYS_AHEAD = 30;

/** The fields of a Mindbody appointment this module reads. */
export interface ScopeAppointment {
  Id?: string | number;
  ClientId?: string | number;
  Client?: { Id?: string | number } | null;
  LocationId?: string | number;
  Location?: { Id?: string | number } | null;
  StartDateTime?: string;
  Status?: string;
}

export interface ScopeEntry {
  mindbodyClientId: string;
  /** The last day they had a booking on or before today, when they had one. */
  lastSeen: string | null;
  /** The first booking after today, when there is one. */
  nextBooking: string | null;
  /** Bookings in the window, for the report. */
  bookings: number;
  /** Why they count: trained recently, booked soon, or both. */
  reasons: Array<"trained" | "booked">;
}

const trimmed = (v: unknown): string => (v == null ? "" : String(v).trim());

/** "2026-09-26" + n days, on the calendar (no clock involved). */
export function addDays(dayKey: string, n: number): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

/** "2026-09-26" minus n calendar months, clamped to the month's last day. */
export function monthsBefore(dayKey: string, n: number): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  const firstOfTarget = new Date(Date.UTC(y, m - 1 - n, 1));
  const lastDay = new Date(
    Date.UTC(firstOfTarget.getUTCFullYear(), firstOfTarget.getUTCMonth() + 1, 0),
  ).getUTCDate();
  firstOfTarget.setUTCDate(Math.min(d, lastDay));
  return firstOfTarget.toISOString().slice(0, 10);
}

/**
 * The window, cut into pieces of at most `maxDays` days, so no one request
 * asks Mindbody for half a year at once (its limit on a range is not
 * documented; a month at a time is what the live pull already asks for).
 * Inclusive day keys, in order, covering every day exactly once.
 */
export function windowChunks(
  from: string,
  to: string,
  maxDays = 31,
): Array<{ start: string; end: string }> {
  const out: Array<{ start: string; end: string }> = [];
  if (!from || !to || from > to || maxDays < 1) return out;
  let start = from;
  while (start <= to) {
    const endCandidate = addDays(start, maxDays - 1);
    const end = endCandidate < to ? endCandidate : to;
    out.push({ start, end });
    start = addDays(end, 1);
  }
  return out;
}

/** The window AJ asked for, around a studio's today. */
export function onboardWindow(
  today: string,
  monthsBack = ONBOARD_MONTHS_BACK,
  daysAhead = ONBOARD_DAYS_AHEAD,
): { from: string; to: string } {
  return { from: monthsBefore(today, monthsBack), to: addDays(today, daysAhead) };
}

export function appointmentClientId(a: ScopeAppointment): string {
  return trimmed(a?.Client?.Id ?? a?.ClientId);
}

export function appointmentLocationId(a: ScopeAppointment): string {
  return trimmed(a?.Location?.Id ?? a?.LocationId);
}

/**
 * Everyone who counts at one studio, from the appointments of its site.
 *
 * @param locationId the studio's Mindbody location. On a site shared with
 *   other studios it is required (the caller refuses to run without it), and
 *   only that location's bookings count. On a site of its own, null takes
 *   every booking.
 */
export function scopeFromAppointments(
  appointments: readonly ScopeAppointment[],
  opts: { today: string; locationId: string | null },
): ScopeEntry[] {
  const byClient = new Map<string, ScopeEntry>();
  const wantLocation = trimmed(opts.locationId) || null;
  for (const a of appointments || []) {
    const id = appointmentClientId(a);
    if (!id) continue;
    if (trimmed(a.Status).toLowerCase() === "cancelled") continue;
    if (wantLocation && appointmentLocationId(a) !== wantLocation) continue;
    const day = trimmed(a.StartDateTime).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    let entry = byClient.get(id);
    if (!entry) {
      entry = { mindbodyClientId: id, lastSeen: null, nextBooking: null, bookings: 0, reasons: [] };
      byClient.set(id, entry);
    }
    entry.bookings += 1;
    if (day <= opts.today) {
      if (!entry.lastSeen || day > entry.lastSeen) entry.lastSeen = day;
    } else if (!entry.nextBooking || day < entry.nextBooking) {
      entry.nextBooking = day;
    }
  }
  for (const entry of byClient.values()) {
    if (entry.lastSeen) entry.reasons.push("trained");
    if (entry.nextBooking) entry.reasons.push("booked");
  }
  return [...byClient.values()].sort((a, b) =>
    a.mindbodyClientId.localeCompare(b.mindbodyClientId, "en", { numeric: true }),
  );
}

/** What the run will do for one client, before it asks Mindbody anything. */
export type OnboardPlan =
  | { action: "skip"; reason: "already-synced" | "done-this-run" | "conflict" }
  | { action: "sync"; create: boolean };

/**
 * @param record the Journey record the two-site rule chose, or null when there
 *   is none and one would be made
 * @param resumed the client finished in an earlier, interrupted run
 * @param conflict the record carries two different Mindbody ids
 *   (lib/mindbody-id.ts mindbodyIdConflict) - nothing is synced onto it, as the
 *   profile's Sync refuses too
 */
export function planClient(args: {
  record: { mindbodyMasterSyncedAt?: unknown } | null;
  resumed: boolean;
  conflict: boolean;
  resync: boolean;
}): OnboardPlan {
  if (args.resumed) return { action: "skip", reason: "done-this-run" };
  if (!args.record) return { action: "sync", create: true };
  if (args.conflict) return { action: "skip", reason: "conflict" };
  const synced =
    typeof args.record.mindbodyMasterSyncedAt === "string" && args.record.mindbodyMasterSyncedAt !== "";
  if (synced && !args.resync) return { action: "skip", reason: "already-synced" };
  return { action: "sync", create: false };
}

/**
 * A brand-new record for a client in scope that Journey has never seen: the
 * same shape the schedule pull makes (lib/mindbody-api-sync.ts,
 * buildCanonicalClientPayload), named from what Mindbody's client lookup said.
 * Master Sync's patch is written straight after, so everything else it knows
 * lands on top. `now` is the caller's SDK timestamp.
 */
export function newClientRecord(args: {
  mindbodyClientId: string;
  siteId: string;
  studioId: string;
  firstName: string | null;
  lastName: string | null;
  now: unknown;
}): Record<string, unknown> {
  const first = trimmed(args.firstName);
  const last = trimmed(args.lastName);
  return {
    firstName: first || "Mindbody",
    lastName: last || `Client ${args.mindbodyClientId}`,
    mindbodyClientId: args.mindbodyClientId,
    mindbodySiteId: trimmed(args.siteId),
    mindbody_name: `${first} ${last}`.trim(),
    homeStudioId: args.studioId,
    isActive: true,
    height: "",
    remainingSessions: 0,
    sessionCount: 0,
    completedSessions: 0,
    createdAt: args.now,
    mindbodySyncedAt: args.now,
    createdBy: "mindbody:onboard",
    isMindbodyStub: false,
  };
}
