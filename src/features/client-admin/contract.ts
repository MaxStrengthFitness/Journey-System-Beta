/**
 * THE CONTRACT, AS ONE STORY — the pure core of the record's Admin section.
 *
 * Client-profile audit (Sep 2026): Admin had become a catch-all — Active
 * Memberships, Pricing Options and Active Contracts listed separately (and
 * partly twice), studio information at the top AND the bottom, and a package
 * tier nobody could trust. Its one real job is the renewal pipeline, so it is
 * rebuilt around three answers:
 *
 *   1. What are they on?        resolveContractTier()
 *   2. How much is left?        the renewal snapshot (features/renewals), read as-is
 *   3. What have they had?      buildContractHistory()
 *
 * TIER. Mindbody does not say "12-month, paid in full"; it says "96 PIF" or
 * "48 Sessions - 2X Week". The renewal engine already matches names against
 * the studio's package table every night, so its snapshot is the first
 * source. When it has nothing, the names are parsed here. And because
 * Mindbody's data is what it is, a coach can LOCK the tier by hand
 * (`client.contractTierOverride`), which always wins and always says so.
 *
 * Dates from Mindbody are UTC days (lib/mindbody-dates.ts).
 */

import { toDateSafe, type FirestoreDateLike } from "../../lib/mindbody-dates";
import type { Client, ContractTierOverride, MindbodyContract, MindbodyService } from "../../types";
import type { RenewalSnapshot } from "../renewals/types";
import { mindbodyDayKey } from "../renewals/engine";
import { studioTodayKey } from "../../lib/studio-time";

export type CommitmentTerm = 6 | 12 | 18;
export type PaymentKind = "monthly" | "pif" | "month-to-month" | "sessions-only";

/** A coach's hand-set tier. Stored on the client; never written by a sync. */
export type { ContractTierOverride };

export type TierSource = "override" | "renewal" | "parsed" | "unknown";

export interface ContractTier {
  term: CommitmentTerm | null;
  payment: PaymentKind | null;
  /** "Committed · 12 months · paid in full". */
  label: string;
  source: TierSource;
  /** Why we think so, in words: "Mindbody pricing option “96 PIF”". */
  evidence: string | null;
}

export const PACKAGE_NAME: Record<CommitmentTerm, string> = {
  6: "The Trial",
  12: "Committed",
  18: "Life Transformed",
};

const SESSIONS_TO_TERM: Record<number, CommitmentTerm> = { 48: 6, 96: 12, 144: 18 };

export const PAYMENT_LABEL: Record<PaymentKind, string> = {
  monthly: "paying every 4 weeks",
  pif: "paid in full",
  "month-to-month": "month-to-month",
  "sessions-only": "billing finished, using banked sessions",
};

export function tierLabel(term: CommitmentTerm | null, payment: PaymentKind | null): string {
  if (payment === "month-to-month") return "Month-to-month";
  const parts: string[] = [];
  if (term) parts.push(`${PACKAGE_NAME[term]} · ${term} months`);
  if (payment) parts.push(PAYMENT_LABEL[payment]);
  if (parts.length === 0) return "Not known yet";
  const s = parts.join(" · ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Read a tier out of a Mindbody contract or pricing-option name. Returns null
 * when the name says nothing about either the term or the payment.
 *   "144 PIF" → 18 months, paid in full
 *   "48 Sessions - 2X Week" → 6 months, monthly
 *   "12 Month Committed" → 12 months
 *   "Month to Month Unlimited" → month-to-month
 */
export function parseTierFromName(name: string | null | undefined): { term: CommitmentTerm | null; payment: PaymentKind | null } | null {
  const n = String(name ?? "").toLowerCase();
  if (!n.trim()) return null;
  let payment: PaymentKind | null = null;
  let term: CommitmentTerm | null = null;

  if (/\bmonth[\s-]*to[\s-]*month\b|\bm2m\b/.test(n)) payment = "month-to-month";
  else if (/\bpif\b|paid[\s-]*in[\s-]*full|\bprepa(id|y)\b/.test(n)) payment = "pif";

  const months = n.match(/\b(6|12|18)[\s-]*(?:mo\b|mos\b|month)/);
  if (months) term = Number(months[1]) as CommitmentTerm;
  if (!term) {
    const sessions = n.match(/\b(48|96|144)\b/);
    if (sessions) term = SESSIONS_TO_TERM[Number(sessions[1])];
  }
  // "48 Sessions - 2X Week" is the monthly form: 8 sessions arrive per payment.
  if (!payment && term && /\bsessions?\b/.test(n) && /\b2\s*x\b|twice/.test(n)) payment = "monthly";

  if (!term && !payment) return null;
  return { term: payment === "month-to-month" ? null : term, payment };
}

function termFromLabel(label: string | null | undefined): CommitmentTerm | null {
  const m = String(label ?? "").match(/\b(6|12|18)\s*months?\b/i);
  return m ? (Number(m[1]) as CommitmentTerm) : null;
}

const time = (v: FirestoreDateLike) => toDateSafe(v)?.getTime() ?? 0;

/** The active contract that runs longest, else null. */
export function currentContract(client: Pick<Client, "mindbodyContracts"> | null | undefined): MindbodyContract | null {
  const active = Object.values(client?.mindbodyContracts || {}).filter((c) => c.status !== "Cancelled");
  if (active.length === 0) return null;
  return active.sort((a, b) => time(b.endDate) - time(a.endDate) || time(b.startDate) - time(a.startDate))[0];
}

export function resolveContractTier(
  client: (Pick<Client, "mindbodyContracts" | "mindbodyServices"> & {
    renewal?: RenewalSnapshot | null;
    contractTierOverride?: ContractTierOverride | null;
  }) | null | undefined,
): ContractTier {
  const o = client?.contractTierOverride;
  if (o && o.payment) {
    const by = o.setByName ? ` by ${o.setByName}` : "";
    return {
      term: o.payment === "month-to-month" ? null : o.term ?? null,
      payment: o.payment,
      label: tierLabel(o.term ?? null, o.payment),
      source: "override",
      evidence: `Locked${by}${o.note ? ` — “${o.note}”` : ""}`,
    };
  }

  const r = client?.renewal;
  if (r && (r.packageLabel || r.paymentMode)) {
    const term = termFromLabel(r.packageLabel) ?? parseTierFromName(r.packageLabel)?.term ?? null;
    const payment: PaymentKind | null =
      r.paymentMode === "prepaid" ? "pif" : r.paymentMode === "monthly" ? "monthly" : r.paymentMode === "sessions-only" ? "sessions-only" : null;
    if (term || payment) {
      return {
        term,
        payment,
        label: tierLabel(term, payment),
        source: "renewal",
        evidence: r.packageLabel ? `Matched to “${r.packageLabel}” in the studio's package table` : null,
      };
    }
  }

  const contract = currentContract(client);
  const fromContract = parseTierFromName(contract?.contractName);
  if (fromContract) {
    return {
      ...fromContract,
      label: tierLabel(fromContract.term, fromContract.payment),
      source: "parsed",
      evidence: `Read from the Mindbody contract “${contract?.contractName}”`,
    };
  }

  const services = Object.values(client?.mindbodyServices || {}).sort(
    (a, b) => time(b.activeDate ?? b.paymentDate) - time(a.activeDate ?? a.paymentDate),
  );
  for (const s of services) {
    const parsed = parseTierFromName(s.name);
    if (parsed) {
      return {
        ...parsed,
        label: tierLabel(parsed.term, parsed.payment),
        source: "parsed",
        evidence: `Read from the Mindbody pricing option “${s.name}”`,
      };
    }
  }

  return { term: null, payment: null, label: "Not known yet", source: "unknown", evidence: null };
}

/* ------------------------------------------------------------------ *
 * History
 * ------------------------------------------------------------------ */

export type TermStatus = "active" | "upcoming" | "ended" | "cancelled";

export interface ContractTermRow {
  key: string;
  name: string;
  kind: "contract" | "paid-in-full";
  start: Date | null;
  end: Date | null;
  status: TermStatus;
  autoRenews: boolean | null;
  /** Sessions it came with and has left — paid-in-full rows only. */
  sessions: { count: number | null; remaining: number | null } | null;
  /** Bought through the online store / app (Mindbody location 98). */
  boughtOnline: boolean;
  tier: { term: CommitmentTerm | null; payment: PaymentKind | null } | null;
}

/**
 * Compared as DAYS, the way the renewal engine does: a Mindbody date is a UTC
 * day (mindbodyDayKey) and today is the studio's day. Comparing instants made
 * a contract ending Sep 15 read "Ended" at 9pm Eastern on Sep 14. The end day
 * itself still counts as active.
 */
function statusOf(start: Date | null, end: Date | null, cancelled: boolean, today: string): TermStatus {
  if (cancelled) return "cancelled";
  const s = start ? mindbodyDayKey(start) : null;
  const e = end ? mindbodyDayKey(end) : null;
  if (s && s > today) return "upcoming";
  if (e && e < today) return "ended";
  return "active";
}

/**
 * Every package term on record, newest start first: contracts, plus paid-in-
 * full pricing options (a PIF client has no contract). The 8-session
 * pricing options a monthly contract drops in with each payment are NOT
 * terms — they are the contract's payments — so a pricing option joins the
 * history only when its name reads as paid in full.
 */
export function buildContractHistory(
  client: Pick<Client, "mindbodyContracts" | "mindbodyServices"> | null | undefined,
  /** The studio's day, "YYYY-MM-DD" (studioTodayKey). */
  today: string = studioTodayKey(),
): ContractTermRow[] {
  const rows: ContractTermRow[] = [];
  for (const c of Object.values(client?.mindbodyContracts || {})) {
    const start = toDateSafe(c.startDate);
    const end = toDateSafe(c.endDate);
    const autopay = (c.autopayStatus || "").toLowerCase();
    rows.push({
      key: `c-${c.clientContractId}`,
      name: c.contractName || "Contract (name not synced)",
      kind: "contract",
      start,
      end,
      status: statusOf(start, end, c.status === "Cancelled", today),
      autoRenews: typeof c.isAutoRenewing === "boolean" ? c.isAutoRenewing : autopay ? autopay === "active" : null,
      sessions: null,
      boughtOnline: String(c.originationLocationId ?? "") === "98",
      tier: parseTierFromName(c.contractName),
    });
  }
  for (const s of Object.values(client?.mindbodyServices || {}) as MindbodyService[]) {
    const tier = parseTierFromName(s.name);
    if (tier?.payment !== "pif") continue;
    const start = toDateSafe(s.activeDate ?? s.paymentDate);
    const end = toDateSafe(s.expirationDate);
    const remaining = typeof s.remaining === "number" ? s.remaining : null;
    const used = remaining === 0;
    rows.push({
      key: `s-${s.serviceId}`,
      name: s.name || "Paid in full",
      kind: "paid-in-full",
      start,
      end,
      status: used ? "ended" : statusOf(start, end, false, today),
      autoRenews: null,
      sessions: { count: typeof s.count === "number" ? s.count : null, remaining },
      boughtOnline: false,
      tier,
    });
  }
  const rank: Record<TermStatus, number> = { upcoming: 0, active: 1, ended: 2, cancelled: 3 };
  return rows.sort(
    (a, b) =>
      rank[a.status] - rank[b.status] ||
      (b.start?.getTime() ?? 0) - (a.start?.getTime() ?? 0),
  );
}

/** Pricing options that still hold sessions — the "on hand" list in the fine print. */
export function sessionsOnHand(
  client: Pick<Client, "mindbodyServices"> | null | undefined,
): { key: string; name: string; remaining: number; count: number | null }[] {
  return (Object.values(client?.mindbodyServices || {}) as MindbodyService[])
    .filter((s) => typeof s.remaining === "number" && s.remaining > 0)
    .map((s) => ({
      key: String(s.serviceId),
      name: s.name || "Pricing option",
      remaining: s.remaining as number,
      count: typeof s.count === "number" ? s.count : null,
    }))
    .sort((a, b) => b.remaining - a.remaining);
}

/**
 * Can this client train at `studioId` today? Their home studio, or a studio a
 * leader approved for cross-training. Null when either side is unknown.
 */
export function crossStudioClearance(
  client: Pick<Client, "homeStudioId" | "approvedCrossTrainStudioIds"> | null | undefined,
  studioId: string | null | undefined,
): "home" | "approved" | "not-approved" | null {
  if (!client?.homeStudioId || !studioId) return null;
  if (client.homeStudioId === studioId) return "home";
  return (client.approvedCrossTrainStudioIds || []).includes(studioId) ? "approved" : "not-approved";
}
