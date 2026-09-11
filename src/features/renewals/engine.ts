/**
 * RENEWALS — the engine. One pure function, buildRenewalSnapshot(), turns a
 * client's Mindbody package data and Journey attendance into the snapshot the
 * screens read (clients/{id}.renewal).
 *
 * THE MODEL — TWO CLOCKS (docs/business/renewals.md)
 *
 *   Billing clock: a payment every 4 weeks for a fixed number of payments.
 *     When the last one is made, the contract auto-renews.
 *   Session clock: 8 sessions arrive with each payment, and they NEVER expire.
 *
 * A client who trains exactly twice a week finishes both clocks together.
 * Anyone else drifts, predictably from their pace: at 1.5 visits a week a
 * Committed client still holds 24 sessions when the auto-renew charges. That
 * collision is what this engine exists to see coming.
 *
 * WHERE EACH NUMBER COMES FROM
 *   - Sessions on hand: the client's Mindbody pricing options (remaining
 *     sessions), counting only names the studio's package table recognizes.
 *   - Payments still to come: Mindbody's scheduled autopay charges on the
 *     current contract, else estimated from the contract's dates.
 *   - Billing ends: the contract's end date in Mindbody, else estimated.
 *   - Pace: visit days over the last 8 weeks, from synced bookings and
 *     Journey workouts, not counting Vacation / Snowbird / Medical time.
 *
 * RULES THIS FILE KEEPS
 *   - A confident wrong number is worse than a missing one. Anything
 *     estimated says so (…Source: "estimate"); anything unknown is null and
 *     `dataGaps` says what is missing, in words.
 *   - Every threshold is either a studio setting or a named constant below
 *     with its minimum sample.
 *   - Dates, never countdowns: the snapshot stores "2026-11-14", so it only
 *     changes when something about the client changes.
 *   - No Firebase import: the nightly job and the browser run this same code.
 */

import type { Client, MindbodyContract, MindbodyService } from "../../types";
import { addDays, daysBetween, keyOf, toTimelineEvents } from "../client-history/model";
import { CATEGORY_BY_KEY } from "../subjective-report/questions";
import { toDateSafe } from "../../lib/mindbody-dates";
import { buildPackageNameIndex, sessionsPerPayment, type PackageNameIndex } from "./settings";
import type {
  PackageTier,
  RenewalFlag,
  RenewalProof,
  RenewalSettings,
  RenewalSituation,
  RenewalSnapshot,
} from "./types";

export const ENGINE_VERSION = 1;

/** Days in one billing period: payments are every 4 weeks. */
export const BILLING_PERIOD_DAYS = 28;
/** Pace looks back 8 weeks — long enough to be steady, short enough to be current. */
export const PACE_WINDOW_DAYS = 56;
/** Below 3 weeks of observable time there is no pace yet, only a guess. */
export const MIN_PACE_WINDOW_DAYS = 21;
/** "Runs out" only counts when it is at least 2 weeks before billing ends. */
export const RUN_OUT_MARGIN_DAYS = 14;
/** "Nothing booked" looks this far ahead. */
export const NO_BOOKING_DAYS = 14;
/** Cancellations and no-shows are counted over this many days... */
export const MISSED_WINDOW_DAYS = 30;
/** ...and flagged from this many. */
export const MISSED_MIN = 2;
/** "My renewals" covers clients a trainer coached this recently. */
export const COACH_WINDOW_DAYS = 60;
/**
 * A package's outcome is attributed to whoever coached the most visits over
 * this window — long enough to still see a lapsed client's last months.
 */
export const PRIMARY_TRAINER_WINDOW_DAYS = 90;
/** "Rough patch": of the last 4 sessions with a check-in... */
export const ROUGH_PATCH_LOOKBACK = 4;
/** ...this many were wiped out or low energy / mood. */
export const ROUGH_PATCH_MIN = 2;
/** Proof of consistency looks at the last 12 weeks... */
export const PROOF_WEEKS = 12;
/** ...and says nothing with fewer than 4 observable weeks. */
export const MIN_PROOF_WEEKS = 4;
/** A machine counts toward "stronger on X of Y" once logged this many times. */
export const MIN_MACHINE_SESSIONS = 3;
/** "Stronger on X of Y machines" needs at least this many machines. */
export const MIN_MACHINES_FOR_PROOF = 3;
/** A 90-day check-in is due once a package has run this long. */
export const CHECK_IN_DUE_DAYS = 90;

/* ------------------------------------------------------------------ *
 * Inputs
 * ------------------------------------------------------------------ */

/** One day of attendance, already on the studio's calendar. */
export interface AttendanceRow {
  /** YYYY-MM-DD, the studio's day. */
  day: string;
  kind: "visit" | "cancelled" | "no-show" | "booked";
  trainerId?: string | null;
}

/** How a recent session felt: the post-session tap and the briefing check-in. */
export interface SessionFeelRow {
  day: string;
  clientFeel?: string | null;
  energyLevel?: string | null;
  mood?: string | null;
}

export interface RenewalEngineInput {
  client: Client;
  settings: RenewalSettings;
  /** The studio's today, YYYY-MM-DD. */
  today: string;
  attendance: AttendanceRow[];
  sessionFeel?: SessionFeelRow[];
  /** machineId -> name, for "biggest gain". */
  machineNames?: Record<string, string>;
  /**
   * The first day this studio's bookings were synced into Journey. Before it,
   * attendance is UNKNOWN, not zero. Null when nothing has been synced.
   */
  attendanceSince: string | null;
  /** Reuse one index per studio when building many snapshots. */
  nameIndex?: PackageNameIndex;
  /**
   * The last visit an earlier snapshot saw (`renewal.lastVisitDate`). The
   * nightly job reads a fixed 90-day window of bookings, so without this a
   * client's last visit would be forgotten once it aged out of the window.
   */
  lastVisitHint?: string | null;
}

/* ------------------------------------------------------------------ *
 * Small helpers
 * ------------------------------------------------------------------ */

/**
 * The calendar day of a Mindbody date. Mindbody's dates mean a day, stored as
 * UTC midnight, so the day is read in UTC (lib/mindbody-dates.ts explains the
 * trap). Accepts Timestamps, Dates, ISO strings and bare "YYYY-MM-DD".
 */
export function mindbodyDayKey(value: unknown): string | null {
  if (typeof value === "string") {
    const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return value;
  }
  const d = toDateSafe(value as any);
  if (!d) return null;
  return keyOf(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

function maxKey(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

function minKey(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a < b ? a : b;
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** "Nov 14" — for flag sentences. */
export function shortDate(key: string | null): string {
  if (!key) return "";
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
  });
}

/* ------------------------------------------------------------------ *
 * Away time
 * ------------------------------------------------------------------ */

interface AwayRange {
  from: string;
  to: string;
  reason: string;
}

function awayRanges(client: Client): AwayRange[] {
  return toTimelineEvents(client.events)
    .filter((e) => e.away)
    .map((e) => ({ from: e.from, to: e.to, reason: e.type }));
}

function isAwayOn(day: string, ranges: AwayRange[]): boolean {
  return ranges.some((r) => r.from <= day && day <= r.to);
}

/** Days in [from, to] covered by away time. */
function awayDaysBetween(from: string, to: string, ranges: AwayRange[]): number {
  if (ranges.length === 0 || from > to) return 0;
  let n = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) if (isAwayOn(d, ranges)) n++;
  return n;
}

export interface AwayState {
  away: boolean;
  until: string | null;
  reason: string | null;
}

/**
 * Is the client away today? A Vacation / Snowbird / Medical event covering
 * today (when the studio lets those pause the clocks), or the profile's MIA
 * pause — the Retention Status switch, read again after the old dashboard was
 * deleted.
 */
export function awayState(client: Client, settings: RenewalSettings, today: string): AwayState {
  if (settings.pauseDuringAwayEvents) {
    const now = awayRanges(client).find((r) => r.from <= today && today <= r.to);
    if (now) return { away: true, until: now.to, reason: now.reason };
  }
  const meta = client.retentionMeta;
  if (meta?.excludedFromMIA) {
    const until = mindbodyDayKey(meta.autoIncludeAfter) ?? null;
    if (!until || until > today) {
      return {
        away: true,
        until,
        reason: meta.excludedReason?.trim() || "Paused from tracking",
      };
    }
  }
  return { away: false, until: null, reason: null };
}

/* ------------------------------------------------------------------ *
 * Mindbody package data
 * ------------------------------------------------------------------ */

interface ContractView {
  contract: MindbodyContract;
  id: string;
  start: string | null;
  end: string | null;
  tier: PackageTier | null;
}

function contractView(c: MindbodyContract, index: PackageNameIndex): ContractView {
  const cancelledEnd = c.status === "Cancelled" ? mindbodyDayKey(c.cancelledAt) : null;
  return {
    contract: c,
    id: String(c.clientContractId),
    start: mindbodyDayKey(c.startDate),
    end: minKey(mindbodyDayKey(c.endDate), cancelledEnd),
    tier: index.tierFor(c.contractName),
  };
}

export interface ContractPick {
  /** Running today. */
  current: ContractView | null;
  /** The most recent one that has ended (for "ended" / "lapsed"). */
  lastEnded: ContractView | null;
  /** One that starts after today — a renewal already on the books. */
  upcoming: ContractView | null;
}

/**
 * A newer contract already signed while the current one runs — a renewal on
 * the books. Its start must be after the current contract's, so a stray old
 * contract never reads as a renewal.
 */
export function renewalOnTheBooks(
  pick: Pick<ContractPick, "current" | "upcoming">,
): { cycleKey: string; packageKey: string | null; startsOn: string } | null {
  const { current, upcoming } = pick;
  if (!current || !upcoming || upcoming.id === current.id || !upcoming.start) return null;
  if (current.start && upcoming.start <= current.start) return null;
  return { cycleKey: upcoming.id, packageKey: upcoming.tier?.key ?? null, startsOn: upcoming.start };
}

/**
 * Which contract is the client on? The pull API returns every contract a
 * client ever held, all marked active, so "current" means: started on or
 * before today and not yet ended. A package the studio recognizes wins over
 * one it doesn't; then the latest start.
 */
export function pickContracts(
  contracts: Record<string, MindbodyContract> | undefined,
  today: string,
  index: PackageNameIndex,
): ContractPick {
  const views = Object.values(contracts ?? {})
    .filter((c) => c && c.clientContractId !== undefined && c.clientContractId !== null)
    .map((c) => contractView(c, index));

  const byPreference = (a: ContractView, b: ContractView) =>
    Number(Boolean(b.tier)) - Number(Boolean(a.tier)) || (b.start ?? "").localeCompare(a.start ?? "");

  const current = views
    .filter(
      (v) =>
        v.contract.status !== "Cancelled" &&
        (!v.start || v.start <= today) &&
        (!v.end || v.end >= today),
    )
    .sort(byPreference)[0] ?? null;

  const lastEnded = views
    .filter((v) => v.end && v.end < today)
    .sort((a, b) => (b.end ?? "").localeCompare(a.end ?? ""))[0] ?? null;

  const upcoming = views
    .filter((v) => v.contract.status !== "Cancelled" && v.start && v.start > today)
    .sort((a, b) => (a.start ?? "").localeCompare(b.start ?? ""))[0] ?? null;

  return { current, lastEnded, upcoming };
}

export interface SessionBalance {
  /** Sessions on recognized pricing options: package names plus extra-sessions names. */
  onHand: number;
  /** The same, on package pricing options only (complimentary sessions excluded). */
  packageOnHand: number;
  /**
   * The pricing option that says which package the client is on: the most
   * recent one with sessions left, else the most recent one.
   */
  packageService: { service: MindbodyService; tier: PackageTier } | null;
  unmatched: Array<{ name: string; remaining: number }>;
  expired: Array<{ name: string; remaining: number; expired: string }>;
}

export function sessionBalance(
  services: Record<string, MindbodyService> | undefined,
  index: PackageNameIndex,
  today: string,
): SessionBalance {
  let onHand = 0;
  let packageOnHand = 0;
  const packageServices: Array<{ service: MindbodyService; tier: PackageTier; day: string; remaining: number }> = [];
  const unmatched: SessionBalance["unmatched"] = [];
  const expired: SessionBalance["expired"] = [];

  for (const s of Object.values(services ?? {})) {
    if (!s) continue;
    const remaining = typeof s.remaining === "number" && s.remaining > 0 ? s.remaining : 0;
    const tier = index.tierFor(s.name);
    const extra = !tier && index.isExtraSessions(s.name);
    if (tier || extra) {
      onHand += remaining;
      const exp = mindbodyDayKey(s.expirationDate);
      if (remaining > 0 && exp && exp < today) {
        expired.push({ name: s.name || "A pricing option", remaining, expired: exp });
      }
    } else if (remaining > 0) {
      unmatched.push({ name: s.name || "An unnamed pricing option", remaining });
    }
    if (tier) {
      packageOnHand += remaining;
      const day = mindbodyDayKey(s.activeDate) ?? mindbodyDayKey(s.paymentDate) ?? "";
      packageServices.push({ service: s, tier, day, remaining });
    }
  }
  packageServices.sort(
    (a, b) => Number(b.remaining > 0) - Number(a.remaining > 0) || b.day.localeCompare(a.day),
  );
  const top = packageServices[0];
  return {
    onHand,
    packageOnHand,
    packageService: top ? { service: top.service, tier: top.tier } : null,
    unmatched,
    expired,
  };
}

/* ------------------------------------------------------------------ *
 * Pace
 * ------------------------------------------------------------------ */

export interface PaceResult {
  /** Visits a week, to the nearest quarter. Null below the minimum window. */
  perWeek: number | null;
  windowStart: string | null;
  observedDays: number;
  visits: number;
}

/**
 * Visits a week over the last 8 weeks, not counting away time. The window
 * never reaches back before the studio's bookings were synced (unknown is not
 * zero), nor before the current package started (a new client's first weeks
 * are their whole history). Rounded to a quarter — nobody's habit is known to
 * two decimal places, and a steadier number keeps the snapshot from changing
 * for no reason.
 */
export function computePace(params: {
  visitDays: string[];
  today: string;
  attendanceSince: string | null;
  billingStart: string | null;
  away: AwayRange[];
  pauseDuringAway: boolean;
}): PaceResult {
  const { visitDays, today, attendanceSince, billingStart, away, pauseDuringAway } = params;
  if (!attendanceSince || attendanceSince > today) {
    return { perWeek: null, windowStart: null, observedDays: 0, visits: 0 };
  }
  let windowStart = addDays(today, -(PACE_WINDOW_DAYS - 1));
  windowStart = maxKey(windowStart, attendanceSince)!;
  if (billingStart) windowStart = maxKey(windowStart, billingStart)!;
  const totalDays = daysBetween(windowStart, today) + 1;
  const awayDays = pauseDuringAway ? awayDaysBetween(windowStart, today, away) : 0;
  const observedDays = totalDays - awayDays;
  const visits = new Set(visitDays.filter((d) => d >= windowStart && d <= today)).size;
  if (observedDays < MIN_PACE_WINDOW_DAYS) {
    return { perWeek: null, windowStart, observedDays, visits };
  }
  const raw = visits / (observedDays / 7);
  return { perWeek: Math.round(raw * 4) / 4, windowStart, observedDays, visits };
}

/* ------------------------------------------------------------------ *
 * Proof — the evidence a renewal conversation leans on
 * ------------------------------------------------------------------ */

export function proofFor(params: {
  client: Client;
  visitDays: Set<string>;
  today: string;
  attendanceSince: string | null;
  away: AwayRange[];
  machineNames?: Record<string, string>;
}): RenewalProof {
  const { client, visitDays, today, attendanceSince, away, machineNames } = params;

  // Consistency: weeks with a visit, of the last 12 observable weeks.
  let weeksAttended: number | null = null;
  let weeksObserved: number | null = null;
  if (attendanceSince) {
    let attended = 0;
    let observed = 0;
    for (let w = 0; w < PROOF_WEEKS; w++) {
      const end = addDays(today, -7 * w);
      const start = addDays(end, -6);
      if (start < attendanceSince) break;
      if (awayDaysBetween(start, end, away) === 7) continue;
      observed++;
      for (let d = start; d <= end; d = addDays(d, 1)) {
        if (visitDays.has(d)) {
          attended++;
          break;
        }
      }
    }
    if (observed >= MIN_PROOF_WEEKS) {
      weeksAttended = attended;
      weeksObserved = observed;
    }
  }

  // Strength: first logged weight against the latest, per machine.
  let tracked = 0;
  let improved = 0;
  let bestGain: RenewalProof["bestGain"] = null;
  for (const [machineId, stat] of Object.entries(client.machineStats ?? {})) {
    const first = stat?.firstWeight;
    const last = stat?.lastWeight;
    if (!(typeof first === "number" && first > 0 && typeof last === "number" && last > 0)) continue;
    if ((stat.timesPerformed ?? 0) < MIN_MACHINE_SESSIONS) continue;
    tracked++;
    if (last > first) {
      improved++;
      const pct = Math.round(((last - first) / first) * 100);
      const name = machineNames?.[machineId];
      if (name && (!bestGain || pct > bestGain.pct)) bestGain = { machineId, machineName: name, pct };
    }
  }

  // Written by the app beside the scans (features/inbody). Still checked
  // field by field: the document is data, and a hand edit shouldn't crash
  // the nightly job.
  const summary = client.inbodySummary;
  const inbody =
    summary && typeof summary.muscleLbChange === "number" && typeof summary.bodyFatPctChange === "number"
      ? {
          muscleLbChange: summary.muscleLbChange,
          bodyFatPctChange: summary.bodyFatPctChange,
          since: String(summary.firstTestedAt ?? ""),
        }
      : null;

  return {
    weeksAttended,
    weeksObserved,
    machinesImproved: tracked >= MIN_MACHINES_FOR_PROOF ? improved : null,
    machinesTracked: tracked >= MIN_MACHINES_FOR_PROOF ? tracked : null,
    bestGain: tracked >= MIN_MACHINES_FOR_PROOF ? bestGain : null,
    inbody,
  };
}

/* ------------------------------------------------------------------ *
 * The snapshot
 * ------------------------------------------------------------------ */

function paymentsLeftFromEvents(
  contract: MindbodyContract,
  today: string,
  chargeDate: string | null,
): number | null {
  if (!Array.isArray(contract.upcomingAutopayEvents)) return null;
  return contract.upcomingAutopayEvents.filter((e) => {
    const day = mindbodyDayKey(e?.scheduleDate);
    return day !== null && day > today && (!chargeDate || day <= chargeDate);
  }).length;
}

function paymentsLeftFromDates(
  billingStart: string | null,
  chargeDate: string | null,
  tier: PackageTier | null,
  today: string,
): number | null {
  if (!billingStart || (!tier && !chargeDate)) return null;
  let left = 0;
  for (let k = 0; k < 240; k++) {
    if (tier && k >= tier.payments) break;
    const due = addDays(billingStart, k * BILLING_PERIOD_DAYS);
    if (chargeDate && due > chargeDate) break;
    if (due > today) left++;
  }
  return left;
}

export function buildRenewalSnapshot(input: RenewalEngineInput): RenewalSnapshot {
  const { client, settings, today, attendance, attendanceSince } = input;
  const index = input.nameIndex ?? buildPackageNameIndex(settings);
  const dataGaps: string[] = [];
  const flags: RenewalFlag[] = [];

  /* ---- Attendance ---- */
  const visitDays = new Set(
    attendance.filter((a) => a.kind === "visit" && a.day <= today).map((a) => a.day),
  );
  const hint =
    typeof input.lastVisitHint === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(input.lastVisitHint) &&
    input.lastVisitHint <= today
      ? input.lastVisitHint
      : null;
  const lastVisitDate = maxKey(Array.from(visitDays).sort().pop() ?? null, hint);
  const nextBookingDate =
    attendance
      .filter((a) => a.kind === "booked" && a.day >= today)
      .map((a) => a.day)
      .sort()[0] ?? null;
  const coachSince = addDays(today, -COACH_WINDOW_DAYS);
  const coachIds = Array.from(
    new Set(
      attendance
        .filter((a) => a.kind === "visit" && a.day >= coachSince && a.day <= today && a.trainerId)
        .map((a) => String(a.trainerId))
        .filter((id) => id && id !== "legacy-trainer"),
    ),
  ).sort();
  const primaryTrainerId = primaryTrainerOf(attendance, addDays(today, -PRIMARY_TRAINER_WINDOW_DAYS), today);
  if (!attendanceSince) {
    dataGaps.push("No bookings have been synced for this studio yet, so pace can't be measured.");
  }

  /* ---- Away ---- */
  const away = awayRanges(client);
  const awayNow = awayState(client, settings, today);

  /* ---- Mindbody package data ---- */
  const servicesSynced = Boolean(client.mindbodyServicesSyncedAt);
  const balance = sessionBalance(client.mindbodyServices, index, today);
  const contracts = pickContracts(client.mindbodyContracts, today, index);
  // A renewal already on the books (starting after today) counts as the
  // package: the client has renewed, and its clock is the one that matters.
  const current = contracts.current ?? contracts.upcoming;

  if (!client.mindbodyCommercialSyncedAt && !servicesSynced && !current) {
    dataGaps.push("Nothing has been pulled from Mindbody for this client yet.");
  } else if (!servicesSynced) {
    dataGaps.push("Pricing options (the session balance) haven't been pulled from Mindbody yet.");
  } else if (
    !current &&
    !contracts.lastEnded &&
    !balance.packageService &&
    client.mindbodyCommercialSyncedAt
  ) {
    dataGaps.push("Mindbody shows no package for this client.");
  }
  for (const u of balance.unmatched) {
    dataGaps.push(
      `"${u.name}" (${plural(u.remaining, "session")}) isn't matched to a package in Renewal settings, so it isn't counted.`,
    );
  }
  // Only worth saying when nothing else identified the package: once a
  // pricing option's name is matched, the contract's name adds nothing.
  if (current && !current.tier && current.contract.contractName && !balance.packageService) {
    dataGaps.push(
      `Contract "${current.contract.contractName}" isn't matched to a package in Renewal settings.`,
    );
  }

  const tier: PackageTier | null = current?.tier ?? balance.packageService?.tier ?? null;
  // No contract running, but package sessions still on hand: paid in full,
  // or billing already finished and the client is using banked sessions.
  const sessionsOnly = !current && balance.packageOnHand > 0 && balance.packageService !== null;
  const isPif =
    balance.packageService !== null &&
    (balance.packageService.service.count ?? 0) >= balance.packageService.tier.sessions;
  const paymentMode: RenewalSnapshot["paymentMode"] = current
    ? "monthly"
    : sessionsOnly
      ? isPif
        ? "prepaid"
        : "sessions-only"
      : null;

  /* ---- Billing clock ---- */
  const billingStart = current
    ? current.start
    : sessionsOnly && isPif
      ? mindbodyDayKey(balance.packageService!.service.activeDate)
      : null;
  let chargeDate: string | null = null;
  let chargeDateSource: RenewalSnapshot["chargeDateSource"] = null;
  if (current) {
    const end = mindbodyDayKey(current.contract.endDate);
    if (end) {
      chargeDate = end;
      chargeDateSource = "mindbody";
    } else {
      const events = (current.contract.upcomingAutopayEvents ?? [])
        .map((e) => mindbodyDayKey(e?.scheduleDate))
        .filter((d): d is string => Boolean(d))
        .sort();
      if (events.length > 0) {
        chargeDate = addDays(events[events.length - 1], BILLING_PERIOD_DAYS - 1);
        chargeDateSource = "estimate";
      } else if (current.start && tier) {
        chargeDate = addDays(current.start, tier.payments * BILLING_PERIOD_DAYS - 1);
        chargeDateSource = "estimate";
      }
    }
  }
  const autoRenews =
    current && typeof current.contract.isAutoRenewing === "boolean"
      ? current.contract.isAutoRenewing
      : null;

  /* ---- Session clock ---- */
  const sessionsOnHand: number | null = servicesSynced ? balance.onHand : null;
  let paymentsLeft: number | null = null;
  let sessionsLeft: number | null = null;
  let sessionsLeftSource: RenewalSnapshot["sessionsLeftSource"] = null;

  if (current) {
    const fromEvents = paymentsLeftFromEvents(current.contract, today, chargeDate);
    const fromDates = paymentsLeftFromDates(current.start, chargeDate, tier, today);
    paymentsLeft = fromEvents ?? fromDates;
    if (sessionsOnHand !== null && paymentsLeft !== null) {
      if (paymentsLeft === 0) sessionsLeft = sessionsOnHand;
      else if (tier) sessionsLeft = sessionsOnHand + paymentsLeft * sessionsPerPayment(tier);
      if (sessionsLeft !== null) sessionsLeftSource = fromEvents !== null ? "mindbody" : "estimate";
    } else if (
      sessionsOnHand === null &&
      tier &&
      current.start &&
      attendanceSince &&
      current.start >= attendanceSince
    ) {
      // No pricing options on file, but Journey has seen the whole package:
      // the package's sessions minus the visits since it began.
      const used = Array.from(visitDays).filter((d) => d >= current.start!).length;
      sessionsLeft = Math.max(0, tier.sessions - used);
      sessionsLeftSource = "estimate";
    }
  } else if (sessionsOnly && sessionsOnHand !== null) {
    sessionsLeft = sessionsOnHand;
    sessionsLeftSource = "mindbody";
    paymentsLeft = 0;
  }

  /* ---- Pace and projections ---- */
  const pace = computePace({
    visitDays: Array.from(visitDays),
    today,
    attendanceSince,
    // A renewal starting next week must not blank the pace: only a package
    // that has already begun bounds the window.
    billingStart: current?.start && current.start <= today ? current.start : null,
    away,
    pauseDuringAway: settings.pauseDuringAwayEvents,
  });
  const perWeek = pace.perWeek;

  let runOutDate: string | null = null;
  if (sessionsLeft !== null && perWeek !== null && perWeek > 0) {
    let date = addDays(today, Math.ceil((sessionsLeft / perWeek) * 7));
    // Away time ahead uses no sessions: push the date past it.
    if (settings.pauseDuringAwayEvents) date = addDays(date, awayDaysBetween(today, date, away));
    runOutDate = date;
  }

  let bankedAtCharge: number | null = null;
  if (chargeDate && sessionsLeft !== null && perWeek !== null && chargeDate >= today) {
    const days =
      daysBetween(today, chargeDate) -
      (settings.pauseDuringAwayEvents ? awayDaysBetween(today, chargeDate, away) : 0);
    bankedAtCharge = Math.max(0, Math.round(sessionsLeft - perWeek * (Math.max(0, days) / 7)));
  }

  /* ---- Has the package ended? ---- */
  // Nothing running and no package sessions left: it ended when the last
  // contract did — or later, at the last visit, if they kept coming in (a
  // used-up paid-in-full package, drop-ins, sessions bought some other way).
  // Someone still walking in is never "lapsed".
  let endedOn: string | null = null;
  if (!current && !sessionsOnly && (contracts.lastEnded || balance.packageService)) {
    endedOn = maxKey(contracts.lastEnded?.end ?? null, lastVisitDate);
  }

  /* ---- Situation ---- */
  let situation: RenewalSituation;
  if (awayNow.away) {
    // Snowbirds are not churn (AJ): away wins over everything.
    situation = "away";
  } else if (endedOn && balance.unmatched.length > 0) {
    // Sessions on hand on a pricing option the studio hasn't matched: maybe
    // the next package, maybe drop-ins. The app can't tell, so it says so
    // (the data gap names the option) rather than calling them ended or lost.
    situation = "unknown";
  } else if (endedOn) {
    situation = daysBetween(endedOn, today) > settings.lostAfterDays ? "lapsed" : "ended";
  } else if (!tier || sessionsLeft === null) {
    situation = "unknown";
  } else if (
    paymentMode === "monthly" &&
    bankedAtCharge !== null &&
    bankedAtCharge >= settings.chargeWarnMinBanked
  ) {
    situation = "will-bank";
  } else if (
    paymentMode === "monthly" &&
    runOutDate &&
    chargeDate &&
    runOutDate < addDays(chargeDate, -RUN_OUT_MARGIN_DAYS)
  ) {
    situation = "will-run-out";
  } else {
    situation = "on-track";
  }

  // The next package already signed while this one runs: the conversation
  // happened and went well, so nobody should be prompted to start it.
  const renewalOnBooks = renewalOnTheBooks(contracts);
  const conversationDue =
    sessionsLeft !== null &&
    sessionsLeft <= settings.conversationAtSessionsLeft &&
    situation !== "lapsed" &&
    situation !== "away" &&
    !renewalOnBooks;
  const chargeWarning =
    situation === "will-bank" &&
    chargeDate !== null &&
    chargeDate >= today &&
    daysBetween(today, chargeDate) <= settings.chargeWarnDays;

  // When the package effectively ends: the pipeline's sort key and horizon.
  let focusDate: string | null;
  if (endedOn) focusDate = endedOn;
  else if (paymentMode === "monthly") focusDate = minKey(chargeDate, runOutDate);
  else if (paymentMode) focusDate = runOutDate;
  else focusDate = null;
  // A conversation that's due must be findable in the pipeline even with no
  // pace to project a run-out date from (paid in full, no recent visits).
  if (!focusDate && conversationDue) focusDate = lastVisitDate ?? today;

  /* ---- Flags, each with its evidence ---- */
  if (current && /suspend/i.test(current.contract.autopayStatus ?? "")) {
    flags.push({ code: "autopay-suspended", text: "Autopay is suspended in Mindbody." });
  }
  const live = situation !== "lapsed" && situation !== "away";
  if (live && attendanceSince) {
    const horizon = addDays(today, NO_BOOKING_DAYS);
    if (!nextBookingDate || nextBookingDate > horizon) {
      flags.push({
        code: "no-future-booking",
        text: `Nothing booked in the next ${NO_BOOKING_DAYS} days.`,
      });
    }
    const since = addDays(today, -MISSED_WINDOW_DAYS);
    const missed = attendance.filter(
      (a) => (a.kind === "cancelled" || a.kind === "no-show") && a.day >= since && a.day <= today,
    ).length;
    if (missed >= MISSED_MIN) {
      flags.push({
        code: "missed-sessions",
        text: `${plural(missed, "cancellation or no-show", "cancellations or no-shows")} in the last ${MISSED_WINDOW_DAYS} days.`,
      });
    }
    if (lastVisitDate) {
      const gap = daysBetween(lastVisitDate, today);
      if (gap >= settings.breakDays) {
        flags.push({
          code: "on-break",
          text: `No visit in ${gap} days (last ${shortDate(lastVisitDate)}).`,
        });
      }
    } else if (daysBetween(attendanceSince, today) >= settings.breakDays && (tier || current)) {
      flags.push({ code: "on-break", text: `No visit on record since ${shortDate(attendanceSince)}.` });
    }
  }
  const feel = (input.sessionFeel ?? [])
    .filter((f) => f.day <= today && (f.clientFeel || f.energyLevel || f.mood))
    .sort((a, b) => b.day.localeCompare(a.day))
    .slice(0, ROUGH_PATCH_LOOKBACK);
  if (feel.length >= ROUGH_PATCH_MIN) {
    const rough = feel.filter(
      (f) => f.clientFeel === "Wiped Out" || f.energyLevel === "low" || f.mood === "low",
    ).length;
    if (rough >= ROUGH_PATCH_MIN) {
      flags.push({
        code: "rough-patch",
        text: `${rough} of the last ${feel.length} sessions: wiped out, or low energy or mood.`,
      });
    }
  }
  const snap = client.subjectiveSnapshot;
  if (snap && Array.isArray(snap.redCategories) && snap.redCategories.length > 0) {
    const names = snap.redCategories.map((k) => CATEGORY_BY_KEY[k]?.title ?? k).join(", ");
    const when = typeof snap.date === "string" && snap.date ? ` (${shortDate(snap.date.slice(0, 10))})` : "";
    flags.push({ code: "check-in-red", text: `Red on the last 90-day check-in${when}: ${names}.` });
  }
  if (billingStart && live && daysBetween(billingStart, today) >= CHECK_IN_DUE_DAYS) {
    const lastCheckIn = typeof snap?.date === "string" ? snap.date.slice(0, 10) : null;
    if (!lastCheckIn || lastCheckIn < billingStart) {
      flags.push({ code: "no-report-this-cycle", text: "No 90-day check-in yet on this package." });
    }
  }
  for (const e of balance.expired) {
    flags.push({
      code: "expired-sessions",
      text: `${plural(e.remaining, "session")} on "${e.name}", which Mindbody shows as expired ${shortDate(e.expired)}. Extend it in Mindbody so they can be booked.`,
    });
  }

  /* ---- Which cycle this is ---- */
  const cycleKey = current
    ? current.id
    : sessionsOnly && isPif
      ? `pif-${String(balance.packageService!.service.serviceId)}`
      : contracts.lastEnded
        ? contracts.lastEnded.id
        : balance.packageService && isPif
          ? `pif-${String(balance.packageService.service.serviceId)}`
          : null;
  const packageLabel = tier
    ? `${tier.label} · ${tier.months} months${paymentMode === "prepaid" ? " · paid in full" : ""}`
    : null;

  if (client.provisional) {
    dataGaps.unshift("Temporary profile — there is no Mindbody record to read yet.");
  }

  return {
    version: ENGINE_VERSION,
    cycleKey,
    renewalOnBooks,
    clientContractId: current ? current.id : contracts.lastEnded?.id ?? null,
    packageKey: tier?.key ?? null,
    packageLabel,
    paymentMode,
    billingStart,
    chargeDate,
    chargeDateSource,
    autoRenews,
    sessionsLeft,
    sessionsLeftSource,
    sessionsOnHand,
    paymentsLeft,
    pacePerWeek: perWeek,
    runOutDate,
    bankedAtCharge,
    situation,
    conversationDue,
    chargeWarning,
    focusDate,
    flags,
    proof: proofFor({
      client,
      visitDays,
      today,
      attendanceSince,
      away: settings.pauseDuringAwayEvents ? away : [],
      machineNames: input.machineNames,
    }),
    awayUntil: awayNow.away ? awayNow.until : null,
    awayReason: awayNow.away ? awayNow.reason : null,
    lastVisitDate,
    nextBookingDate,
    coachIds,
    primaryTrainerId,
    dataGaps: Array.from(new Set(dataGaps)),
  };
}

/**
 * The trainer who coached the most of these visits — one per day per
 * trainer, so a booking and its workout don't count twice — with the more
 * recent breaking a tie. Null when no visit in the window names a trainer.
 */
export function primaryTrainerOf(attendance: AttendanceRow[], since: string, until: string): string | null {
  const days = new Map<string, Set<string>>();
  for (const a of attendance) {
    if (a.kind !== "visit" || !a.trainerId || a.day < since || a.day > until) continue;
    const id = String(a.trainerId);
    if (!id || id === "legacy-trainer") continue;
    const set = days.get(id) ?? new Set<string>();
    set.add(a.day);
    days.set(id, set);
  }
  let best: { id: string; count: number; last: string } | null = null;
  for (const [id, set] of days) {
    const last = Array.from(set).sort().pop() ?? "";
    const better =
      !best ||
      set.size > best.count ||
      (set.size === best.count && (last > best.last || (last === best.last && id < best.id)));
    if (better) best = { id, count: set.size, last };
  }
  return best?.id ?? null;
}

/**
 * True when two snapshots say the same thing — the nightly job writes only
 * the ones that changed. computedAt is ignored.
 */
export function sameSnapshot(a: RenewalSnapshot | null | undefined, b: RenewalSnapshot | null | undefined): boolean {
  if (!a || !b) return a === b;
  const strip = (s: RenewalSnapshot) => {
    const { computedAt, ...rest } = s;
    return rest;
  };
  return stableStringify(strip(a)) === stableStringify(strip(b));
}

/** JSON with sorted keys and no undefined — for "did anything change?" checks. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(",")}}`;
}
