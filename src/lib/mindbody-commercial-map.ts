/**
 * MINDBODY COMMERCIAL DATA — the pure mapping, shared by the browser and the
 * server.
 *
 * Round: Renewals, Phase 0 (Sep 2026). Moved out of mindbody-commercial-sync.ts
 * so the nightly renewals job (server/, firebase-admin) and the Sync button
 * (browser, firebase web SDK) write exactly the same records. Nothing here
 * imports Firebase: the caller passes the function that turns a Date into its
 * SDK's Timestamp.
 *
 * Two hops, one file:
 *   1. Mindbody's API objects (PascalCase)  -> the route's rows (camelCase)
 *      contractRowFromApi / membershipRowFromApi / serviceRowFromApi
 *   2. the route's rows -> Firestore records on the client document
 *      mapContractRecords / mapMembershipRecords / mapServiceRecords
 *
 * WHAT A "SERVICE" IS. Mindbody calls a package of sessions a client holds a
 * pricing option; its API calls it a ClientService. At MSF a paid-in-full
 * client holds one ("144 PIF", 109 of 144 left) and a monthly client gets a
 * new 8-session one with each payment ("48 Sessions - 2X Week"). Complimentary
 * sessions arrive the same way ("Session Comp", 2). Remaining sessions live
 * here, not on the contract — AJ's account screenshots, Sep 11 2026.
 */

/* ------------------------------------------------------------------ *
 * Dates
 * ------------------------------------------------------------------ */

/**
 * Mindbody's pull API sends dates without a zone. They are read as UTC so they
 * agree with the webhook's true-UTC timestamps and never shift a calendar day
 * (see lib/mindbody-dates.ts for the matching display rule).
 */
export function parseMindbodyInstant(value: unknown): Date | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const raw = value.trim();
  const normalized = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw) ? raw : `${raw}Z`;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Firestore map keys cannot contain path characters. */
export function toMapKey(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const key = String(value).trim();
  if (!key || /[.~*/[\]]/.test(key)) return null;
  return key;
}

function numberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * 1. Mindbody API -> route rows
 * ------------------------------------------------------------------ */

export interface AutopayEventRow {
  scheduleDate: string | null;
  chargeAmount: number | null;
  paymentMethod: string;
}

export interface ContractRow {
  clientContractId: unknown;
  contractName: string;
  agreementDate: string | null;
  startDate: string | null;
  endDate: string | null;
  autopayStatus: string;
  originationLocationId: unknown;
  siteId: unknown;
  /** Undefined when Mindbody did not send the list at all. */
  upcomingAutopayEvents?: AutopayEventRow[];
}

export interface MembershipRow {
  membershipId: unknown;
  membershipName: string;
  activeDate: string | null;
  expirationDate: string | null;
  count: number | null;
  remaining: number | null;
  programName: string;
  siteId: unknown;
}

export interface ServiceRow {
  serviceId: unknown;
  name: string;
  count: number | null;
  remaining: number | null;
  activeDate: string | null;
  expirationDate: string | null;
  paymentDate: string | null;
  current: boolean | null;
  /** A refunded pricing option. Not sessions anyone can use. */
  returned: boolean;
  programName: string;
  siteId: unknown;
}

export function contractRowFromApi(c: any, site: string | number): ContractRow {
  const row: ContractRow = {
    // Mindbody's ClientContract `Id` IS the clientContractId the webhook keys
    // on, so pull-synced and webhook-synced records land on the same entry.
    clientContractId: c?.Id,
    contractName: c?.ContractName || "",
    agreementDate: c?.AgreementDate || null,
    startDate: c?.StartDate || null,
    endDate: c?.EndDate || null,
    // The pull API exposes AutopayStatus, not the webhook's boolean
    // isAutoRenewing, so it is reported under its own name and never
    // overwrites a value a webhook already supplied.
    autopayStatus: c?.AutopayStatus || "",
    originationLocationId: c?.OriginationLocationId ?? null,
    siteId: c?.SiteId ?? Number(site),
  };
  if (Array.isArray(c?.UpcomingAutopayEvents)) {
    // The scheduled charges. Kept since Sep 2026: the last one is when the
    // package's billing ends, which is half of a renewal.
    row.upcomingAutopayEvents = c.UpcomingAutopayEvents.map((e: any) => ({
      scheduleDate: e?.ScheduleDate || null,
      chargeAmount: numberOrNull(e?.ChargeAmount),
      paymentMethod: typeof e?.PaymentMethod === "string" ? e.PaymentMethod : "",
    }));
  }
  return row;
}

export function membershipRowFromApi(m: any, site: string | number): MembershipRow {
  return {
    membershipId: m?.Id,
    membershipName: m?.Name || "",
    activeDate: m?.ActiveDate || null,
    expirationDate: m?.ExpirationDate || null,
    count: m?.Count ?? null,
    remaining: m?.Remaining ?? null,
    programName: m?.Program?.Name || "",
    siteId: m?.SiteId ?? Number(site),
  };
}

export function serviceRowFromApi(s: any, site: string | number): ServiceRow {
  return {
    serviceId: s?.Id,
    name: s?.Name || "",
    count: numberOrNull(s?.Count),
    remaining: numberOrNull(s?.Remaining),
    activeDate: s?.ActiveDate || null,
    expirationDate: s?.ExpirationDate || null,
    paymentDate: s?.PaymentDate || null,
    current: typeof s?.Current === "boolean" ? s.Current : null,
    returned: s?.Returned === true,
    programName: s?.Program?.Name || "",
    siteId: s?.SiteId ?? Number(site),
  };
}

/**
 * Which pricing options are worth storing.
 *
 * A monthly client gains a new 8-session pricing option every four weeks, so
 * after two years the list runs to dozens, nearly all used up. Kept: every one
 * with sessions left (those ARE the balance), plus the few most recent — even
 * when used up they say which package the client is on. Returned pricing
 * options (refunds) are dropped: they are not sessions anyone can use.
 */
export function selectServiceRows(rows: ServiceRow[], keepRecent = 4): ServiceRow[] {
  const usable = rows.filter((r) => toMapKey(r.serviceId) && !r.returned);
  const withSessions = usable.filter((r) => (r.remaining ?? 0) > 0);
  const byRecency = [...usable].sort((a, b) =>
    (b.activeDate ?? b.paymentDate ?? "").localeCompare(a.activeDate ?? a.paymentDate ?? ""),
  );
  const keep = new Map<string, ServiceRow>();
  for (const r of withSessions) keep.set(toMapKey(r.serviceId)!, r);
  for (const r of byRecency.slice(0, keepRecent)) keep.set(toMapKey(r.serviceId)!, r);
  return Array.from(keep.values());
}

/* ------------------------------------------------------------------ *
 * 2. Route rows -> Firestore records
 * ------------------------------------------------------------------ */

/** Turns a Date into the calling SDK's Timestamp (or leaves it a Date). */
export type ToTimestamp = (d: Date) => unknown;

function ts(value: unknown, toTs: ToTimestamp): unknown | null {
  const d = parseMindbodyInstant(value);
  return d ? toTs(d) : null;
}

/** Contract records, keyed by clientContractId. Only real values are written. */
export function mapContractRecords(
  rows: any[] | undefined,
  now: unknown,
  toTs: ToTimestamp,
): Record<string, Record<string, unknown>> {
  const contracts: Record<string, Record<string, unknown>> = {};
  for (const c of rows || []) {
    const key = toMapKey(c?.clientContractId);
    if (!key) continue;
    const record: Record<string, unknown> = {
      clientContractId: c.clientContractId,
      status: "Active",
      lastPullSyncAt: now,
    };
    // An undefined would blow away a field the webhook had already filled in.
    if (c.contractName) record.contractName = String(c.contractName);
    if (c.autopayStatus) record.autopayStatus = String(c.autopayStatus);
    if (c.siteId !== null && c.siteId !== undefined) record.siteId = c.siteId;
    if (c.originationLocationId !== null && c.originationLocationId !== undefined) {
      record.originationLocationId = c.originationLocationId;
    }
    const startDate = ts(c.startDate, toTs);
    if (startDate) record.startDate = startDate;
    const endDate = ts(c.endDate, toTs);
    if (endDate) record.endDate = endDate;
    const agreementDate = ts(c.agreementDate, toTs);
    if (agreementDate) record.agreementDate = agreementDate;
    // An empty list is a real answer ("nothing scheduled") and replaces an
    // old one; a missing list says nothing and is left alone.
    if (Array.isArray(c.upcomingAutopayEvents)) {
      record.upcomingAutopayEvents = c.upcomingAutopayEvents
        .map((e: any) => ({
          scheduleDate: ts(e?.scheduleDate, toTs),
          chargeAmount: numberOrNull(e?.chargeAmount),
          paymentMethod: typeof e?.paymentMethod === "string" ? e.paymentMethod : "",
        }))
        .filter((e: { scheduleDate: unknown }) => e.scheduleDate !== null);
    }
    contracts[key] = record;
  }
  return contracts;
}

/** Membership records, keyed by membershipId. */
export function mapMembershipRecords(
  rows: any[] | undefined,
  now: unknown,
  toTs: ToTimestamp,
): Record<string, Record<string, unknown>> {
  const memberships: Record<string, Record<string, unknown>> = {};
  for (const m of rows || []) {
    const key = toMapKey(m?.membershipId);
    if (!key) continue;
    const record: Record<string, unknown> = {
      membershipId: m.membershipId,
      // This endpoint returns active memberships only.
      status: "Active",
      cancelledAt: null,
      lastPullSyncAt: now,
    };
    if (m.membershipName) record.membershipName = String(m.membershipName);
    if (m.programName) record.programName = String(m.programName);
    if (m.siteId !== null && m.siteId !== undefined) record.siteId = m.siteId;
    if (typeof m.count === "number") record.sessionCount = m.count;
    if (typeof m.remaining === "number") record.sessionsRemaining = m.remaining;
    const activeDate = ts(m.activeDate, toTs);
    if (activeDate) record.activeDate = activeDate;
    const expirationDate = ts(m.expirationDate, toTs);
    if (expirationDate) record.expirationDate = expirationDate;
    memberships[key] = record;
  }
  return memberships;
}

/**
 * Pricing-option records, keyed by the ClientService id.
 *
 * Unlike contracts and memberships this map is REPLACED on every successful
 * pull, never merged: a used-up pricing option that drops out of the list
 * must not linger with its old balance, or the app would count sessions the
 * client no longer has. A failed pull writes nothing at all — unknown, not
 * empty.
 */
export function mapServiceRecords(
  rows: any[] | undefined,
  now: unknown,
  toTs: ToTimestamp,
): Record<string, Record<string, unknown>> {
  const services: Record<string, Record<string, unknown>> = {};
  for (const s of rows || []) {
    const key = toMapKey(s?.serviceId);
    if (!key) continue;
    const record: Record<string, unknown> = {
      serviceId: s.serviceId,
      name: typeof s.name === "string" ? s.name : "",
      count: numberOrNull(s.count),
      remaining: numberOrNull(s.remaining),
      lastPullSyncAt: now,
    };
    if (typeof s.current === "boolean") record.current = s.current;
    if (s.programName) record.programName = String(s.programName);
    if (s.siteId !== null && s.siteId !== undefined) record.siteId = s.siteId;
    const activeDate = ts(s.activeDate, toTs);
    if (activeDate) record.activeDate = activeDate;
    const expirationDate = ts(s.expirationDate, toTs);
    if (expirationDate) record.expirationDate = expirationDate;
    const paymentDate = ts(s.paymentDate, toTs);
    if (paymentDate) record.paymentDate = paymentDate;
    services[key] = record;
  }
  return services;
}
