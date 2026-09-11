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

const MB_BASE = "https://api.mindbodyonline.com/public/v6";

// Tokens expire after 60 minutes; they are refreshed at 55 for safety.
const tokenCache: Record<string, { token: string; expiresAt: number }> = {};

export function mindbodyConfigured(): boolean {
  return Boolean(
    process.env.MINDBODY_API_KEY &&
      process.env.MINDBODY_SOURCE_NAME &&
      process.env.MINDBODY_SOURCE_PASSWORD,
  );
}

export async function getMindbodyToken(siteId: string): Promise<string> {
  const now = Date.now();
  const cached = tokenCache[siteId];
  if (cached && cached.expiresAt > now) {
    return cached.token;
  }

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
