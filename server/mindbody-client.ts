/**
 * The server's one door to the Mindbody Public API.
 *
 * Round: Renewals, Phase 0 (Sep 2026). `getMindbodyToken` moved here from
 * server.ts unchanged, so the web service and the nightly renewals job
 * (server/cron-renewals.ts) share one token cache and one set of credentials.
 * Nothing in this file writes to Mindbody: every call is a GET, and the app
 * never suspends, renews or edits a contract (the proposal's rule — when a
 * client will bank sessions, a leader adjusts the contract in Mindbody).
 *
 * Metering: Mindbody bills calls over 1,000 a day (about a third of a cent
 * each). The web routes spend calls when a person presses a button; the
 * nightly job budgets its own (server/renewals-job.ts).
 */

import {
  contractRowFromApi,
  membershipRowFromApi,
  selectServiceRows,
  serviceRowFromApi,
  type ContractRow,
  type MembershipRow,
  type ServiceRow,
} from "../src/lib/mindbody-commercial-map.ts";
import {
  demographicsFromApi,
  pickRequestedClient,
  visitsTotalFrom,
  VISITS_START_DATE,
  type MasterSyncPart,
  type MasterSyncResponse,
} from "../src/lib/mindbody-demographics-map.ts";
import { DEFAULT_TIME_ZONE, studioTodayKey } from "../src/lib/studio-time.ts";

const MB_BASE = "https://api.mindbodyonline.com/public/v6";

// Tokens expire after 60 minutes; they are refreshed at 55 for safety.
const tokenCache: Record<string, { token: string; expiresAt: number }> = {};
// Calls that start together share one token request instead of each issuing one.
const tokenInFlight: Record<string, Promise<string> | undefined> = {};

export function mindbodyConfigured(): boolean {
  return Boolean(
    process.env.MINDBODY_API_KEY &&
      process.env.MINDBODY_SOURCE_NAME &&
      process.env.MINDBODY_SOURCE_PASSWORD,
  );
}

export async function getMindbodyToken(siteId: string): Promise<string> {
  const cached = tokenCache[siteId];
  if (cached && cached.expiresAt > Date.now()) {
    return cached.token;
  }
  const pending = tokenInFlight[siteId];
  if (pending) return pending;
  const request = issueMindbodyToken(siteId);
  tokenInFlight[siteId] = request;
  try {
    return await request;
  } finally {
    tokenInFlight[siteId] = undefined;
  }
}

async function issueMindbodyToken(siteId: string): Promise<string> {
  const now = Date.now();

  const apiKey = process.env.MINDBODY_API_KEY;
  const sourceName = process.env.MINDBODY_SOURCE_NAME;
  const sourcePassword = process.env.MINDBODY_SOURCE_PASSWORD;

  if (!apiKey || !sourceName || !sourcePassword) {
    throw new Error(
      "MINDBODY_API_KEY, MINDBODY_SOURCE_NAME, and MINDBODY_SOURCE_PASSWORD must be set in .env",
    );
  }

  const response = await fetch(`${MB_BASE}/usertoken/issue`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Api-Key": apiKey,
      SiteId: String(siteId),
    },
    body: JSON.stringify({
      Username: `_${sourceName}`,
      Password: sourcePassword,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Mindbody Token Error:", response.status, errorText);
    throw new Error(`Failed to issue Mindbody token: ${errorText}`);
  }

  const data = await response.json();
  if (!data.AccessToken) {
    throw new Error("No AccessToken in Mindbody token response");
  }

  tokenCache[siteId] = {
    token: data.AccessToken,
    expiresAt: now + 55 * 60 * 1000,
  };

  return data.AccessToken;
}

/** Flat rather than a union: without strictNullChecks, `!r.ok` would not narrow one. */
export interface MindbodyResult {
  ok: boolean;
  status: number;
  data: any;
  error: string;
}

/** One authenticated GET against the Public API. Never throws for an HTTP error. */
export async function mindbodyGet(
  site: string,
  path: string,
  params: Record<string, string | number | boolean | Array<string | number>>,
): Promise<MindbodyResult> {
  const apiKey = process.env.MINDBODY_API_KEY;
  if (!apiKey) return { ok: false, status: 500, data: null, error: "MINDBODY_API_KEY is not set." };
  const userToken = await getMindbodyToken(site);
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) value.forEach((v) => query.append(key, String(v)));
    else query.append(key, String(value));
  }
  const r = await fetch(`${MB_BASE}/${path}?${query.toString()}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "Api-Key": apiKey,
      SiteId: site,
      Authorization: userToken,
    },
  });
  if (!r.ok) {
    const text = await r.text();
    console.warn(`Mindbody ${path} failed (Site ${site}):`, r.status, text.slice(0, 300));
    return { ok: false, status: r.status, data: null, error: text };
  }
  return { ok: true, status: r.status, data: await r.json(), error: "" };
}

export interface CommercialPull {
  /** null when that call failed — unknown, never "none". */
  contracts: ContractRow[] | null;
  memberships: MembershipRow[] | null;
  services: ServiceRow[] | null;
  /** Mindbody calls this pull spent. */
  calls: number;
  /** The first error text, when any call failed. */
  error: string;
}

/**
 * A client's contracts, pricing options and (optionally) memberships.
 *
 * Fetched independently: a client can hold contracts but no pricing option,
 * and one endpoint failing must not blank the others.
 */
export async function pullClientCommercial(
  site: string,
  clientId: string,
  options: { memberships?: boolean } = {},
): Promise<CommercialPull> {
  const wantMemberships = options.memberships !== false;
  const [contractsRes, servicesRes, membershipsRes] = await Promise.all([
    mindbodyGet(site, "client/clientcontracts", { ClientId: clientId, Limit: 100 }),
    mindbodyGet(site, "client/clientservices", { ClientId: clientId, Limit: 200 }),
    wantMemberships
      ? mindbodyGet(site, "client/activeclientmemberships", { ClientId: clientId, Limit: 100 })
      : Promise.resolve(null),
  ]);

  const contracts = contractsRes.ok
    ? (contractsRes.data?.Contracts || []).map((c: any) => contractRowFromApi(c, site))
    : null;
  const services = servicesRes.ok
    ? selectServiceRows(
        (servicesRes.data?.ClientServices || []).map((s: any) => serviceRowFromApi(s, site)),
      )
    : null;
  const memberships =
    membershipsRes && membershipsRes.ok
      ? (membershipsRes.data?.ClientMemberships || []).map((m: any) =>
          membershipRowFromApi(m, site),
        )
      : null;

  const failures = [contractsRes, servicesRes, membershipsRes].filter(
    (r): r is MindbodyResult => Boolean(r && !r.ok),
  );
  return {
    contracts,
    memberships,
    services,
    calls: wantMemberships ? 3 : 2,
    error: failures[0]?.error ?? "",
  };
}

/**
 * Lifetime visits at the site, or null — best-effort.
 *
 * One call (GET client/clientvisits, Limit=1): only the pagination total is
 * read. Visits up to today (the studio's Eastern day). Mindbody's total
 * counts every visit record in the range — late cancels and no-shows
 * included — so it can differ a little from the number the webhook sends
 * (ClientNumberOfVisitsAtSite). Any failure, or an answer without a total,
 * is null: unknown, and the stored count is left alone.
 */
export async function pullClientVisitTotal(
  site: string,
  clientId: string,
  today: string = studioTodayKey(new Date(), DEFAULT_TIME_ZONE),
): Promise<number | null> {
  try {
    const r = await mindbodyGet(site, "client/clientvisits", {
      ClientId: clientId,
      StartDate: VISITS_START_DATE,
      EndDate: today,
      Limit: 1,
    });
    return r.ok ? visitsTotalFrom(r.data) : null;
  } catch (err) {
    console.warn(`Mindbody client/clientvisits threw (Site ${site}):`, String(err).slice(0, 300));
    return null;
  }
}

export interface MasterPull {
  /** null when the client lookup itself failed — unknown, not "not found". */
  response: MasterSyncResponse | null;
  /** The lookup's error text when response is null. */
  error: string;
  /** Mindbody's HTTP status for a failed lookup. */
  status: number;
  /** Mindbody calls this pull spent. */
  calls: number;
}

/**
 * Master Sync (Sep 2026): everything Mindbody knows about one client.
 *
 * 1. GET client/clients by id ONLY, inactive clients included (or a client
 *    Mindbody marks inactive would read as "not found"). Never by name. Not
 *    found → stop: nothing else is asked, nothing else is spent.
 * 2. In parallel: contracts, pricing options and memberships
 *    (pullClientCommercial) and the lifetime visit count. Each part that
 *    fails comes back null and is listed in `failed`; the rest still land.
 *
 * Five Mindbody calls for a found client, one for a missing one.
 */
export async function pullClientMaster(site: string, clientId: string): Promise<MasterPull> {
  const lookup = await mindbodyGet(site, "client/clients", {
    ClientIds: [clientId],
    IncludeInactive: true,
    Limit: 10,
  });
  if (!lookup.ok) {
    return { response: null, error: lookup.error, status: lookup.status, calls: 1 };
  }
  const raw = pickRequestedClient(lookup.data?.Clients, clientId);
  if (!raw) {
    return {
      response: {
        found: false,
        mindbodyClientId: clientId,
        siteId: site,
        fetchedAt: new Date().toISOString(),
      },
      error: "",
      status: 200,
      calls: 1,
    };
  }

  const [commercial, visits] = await Promise.all([
    pullClientCommercial(site, clientId),
    pullClientVisitTotal(site, clientId),
  ]);

  const failed: MasterSyncPart[] = [];
  if (!commercial.contracts) failed.push("contracts");
  if (!commercial.memberships) failed.push("memberships");
  if (!commercial.services) failed.push("services");
  const partial = failed.length > 0;
  if (visits === null) failed.push("visits");

  return {
    response: {
      found: true,
      mindbodyClientId: clientId,
      siteId: site,
      demographics: demographicsFromApi(raw),
      commercial: {
        contracts: commercial.contracts,
        memberships: commercial.memberships,
        services: commercial.services,
        partial,
      },
      visits,
      partial,
      failed,
      fetchedAt: new Date().toISOString(),
    },
    error: commercial.error,
    status: 200,
    calls: 1 + commercial.calls + 1,
  };
}
