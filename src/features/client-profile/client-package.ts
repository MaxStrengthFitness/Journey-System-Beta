/**
 * WHICH PACKAGE, HOW MANY LEFT — one answer for the profile header.
 *
 * Mindbody is the system of record for what a client bought, but it reaches
 * this app three different ways, each with a different freshness:
 *
 *   1. `client.mindbodyMemberships`  — the API pull sync. Carries the real
 *      `sessionsRemaining` when the membership is session-based.
 *   2. `schedules[].mindbodyPass`    — the pass snapshot Mindbody attaches to
 *      a booking. Written at booking time, so it is the freshest count the
 *      moment a client books, and stale the moment they use a session
 *      without booking through Mindbody.
 *   3. `client.mindbodyContracts`    — the contract webhooks. Names and dates
 *      only; never a count.
 *
 * The app's own `remainingSessions` / `packageTier` are the fallback, for
 * clients Mindbody has never described (test clients, the legacy import).
 *
 * The rule (AJ, Sep 5 2026): Mindbody first, app field as fallback, and
 * between the two Mindbody counts take whichever was written most recently.
 */

import type { Client, MindbodyContract, MindbodyMembership, ScheduleEntry } from "../../types";

export type PackageSource = "mindbody-membership" | "mindbody-pass" | "mindbody-contract" | "app" | "none";

export interface PackageSummary {
  /** "6-Month Package", "10 Session Pack", or the app's packageTier. Null when unknown. */
  label: string | null;
  /** Sessions left, or null when nothing reported a count. */
  remaining: number | null;
  /** Sessions the package started with, when known. */
  total: number | null;
  source: PackageSource;
  /** Epoch ms of the record the count came from (for "as of"). */
  asOf: number | null;
  /** True when the label/count came from Mindbody (rendered as synced data). */
  fromMindbody: boolean;
  /** True when the client has an active auto-renewing contract. */
  autoRenews: boolean;
}

const toMillis = (v: unknown): number | null => {
  if (!v) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.getTime();
  const anyV = v as { toMillis?: () => number; toDate?: () => Date; seconds?: number };
  if (typeof anyV.toMillis === "function") return anyV.toMillis();
  if (typeof anyV.toDate === "function") return anyV.toDate().getTime();
  if (typeof anyV.seconds === "number") return anyV.seconds * 1000;
  if (typeof v === "string") {
    const t = new Date(v).getTime();
    return Number.isNaN(t) ? null : t;
  }
  return null;
};

const asCount = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseInt(String(v), 10);
  return Number.isFinite(n) ? n : null;
};

function activeMemberships(client: Client): MindbodyMembership[] {
  return Object.values(client.mindbodyMemberships || {}).filter((m) => m && m.status === "Active");
}

function activeContracts(client: Client): MindbodyContract[] {
  return Object.values(client.mindbodyContracts || {}).filter((c) => c && c.status === "Active");
}

/** Newest active contract by start date (falls back to sync time). */
function primaryContract(client: Client): MindbodyContract | null {
  const list = activeContracts(client);
  if (!list.length) return null;
  return [...list].sort(
    (a, b) => (toMillis(b.startDate) ?? toMillis(b.lastSyncAt) ?? 0) - (toMillis(a.startDate) ?? toMillis(a.lastSyncAt) ?? 0),
  )[0];
}

export function resolvePackage(client: Client | null | undefined, upcoming: ScheduleEntry[] = []): PackageSummary {
  const none: PackageSummary = {
    label: null,
    remaining: null,
    total: null,
    source: "none",
    asOf: null,
    fromMindbody: false,
    autoRenews: false,
  };
  if (!client) return none;

  const contract = primaryContract(client);
  const autoRenews = !!(contract?.isAutoRenewing || (contract?.autopayStatus || "").toLowerCase() === "active");

  /* ---- 1. membership with a count (pull sync) ---- */
  let membershipHit: { m: MindbodyMembership; remaining: number; at: number } | null = null;
  for (const m of activeMemberships(client)) {
    const remaining = asCount(m.sessionsRemaining);
    if (remaining === null) continue;
    const at = toMillis(m.lastPullSyncAt) ?? toMillis(m.lastSyncAt) ?? toMillis(m.assignedAt) ?? 0;
    if (!membershipHit || at > membershipHit.at) membershipHit = { m, remaining, at };
  }

  /* ---- 2. pass snapshot on the newest booking ---- */
  let passHit: { remaining: number; total: number | null; at: number } | null = null;
  for (const s of upcoming) {
    const remaining = asCount(s.mindbodyPass?.sessionsRemaining);
    if (remaining === null) continue;
    const at = toMillis(s.createdAt) ?? toMillis(s.startTime) ?? 0;
    if (!passHit || at > passHit.at) passHit = { remaining, total: asCount(s.mindbodyPass?.sessionsTotal), at };
  }

  const mindbodyLabel =
    membershipHit?.m.membershipName ||
    membershipHit?.m.programName ||
    contract?.contractName ||
    activeMemberships(client).find((m) => m.membershipName)?.membershipName ||
    null;

  if (membershipHit || passHit) {
    // Freshest count wins. A booking made after the last pull knows about
    // sessions the pull does not; a pull after the booking knows about
    // walk-in redemptions the booking snapshot does not.
    const usePass = !!passHit && (!membershipHit || passHit.at > membershipHit.at);
    if (usePass && passHit) {
      return {
        label: mindbodyLabel,
        remaining: passHit.remaining,
        total: passHit.total,
        source: "mindbody-pass",
        asOf: passHit.at || null,
        fromMindbody: true,
        autoRenews,
      };
    }
    if (membershipHit) {
      return {
        label: mindbodyLabel,
        remaining: membershipHit.remaining,
        total: asCount(membershipHit.m.sessionCount),
        source: "mindbody-membership",
        asOf: membershipHit.at || null,
        fromMindbody: true,
        autoRenews,
      };
    }
  }

  /* ---- 3. a contract with no count: name from Mindbody, count from the app ---- */
  const appRemaining = asCount(client.remainingSessions);
  if (mindbodyLabel) {
    return {
      label: mindbodyLabel,
      remaining: appRemaining,
      total: null,
      source: "mindbody-contract",
      asOf: toMillis(contract?.lastSyncAt) ?? toMillis(client.mindbodyCommercialSyncedAt),
      fromMindbody: true,
      autoRenews,
    };
  }

  /* ---- 4. the app's own fields ---- */
  const tier = client.packageTier && client.packageTier !== "None" ? client.packageTier : null;
  if (appRemaining !== null || tier) {
    return {
      label: tier,
      remaining: appRemaining,
      total: null,
      source: "app",
      asOf: null,
      fromMindbody: false,
      autoRenews: false,
    };
  }

  return none;
}

/** "12 left", "Unlimited", or null. Auto-renewing contracts with no count read as unlimited. */
export function remainingLabel(pkg: PackageSummary): string | null {
  if (pkg.remaining !== null) return `${pkg.remaining} left`;
  if (pkg.autoRenews) return "Auto-renews";
  return null;
}
