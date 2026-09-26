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
import {
  backoffMs,
  breakerPausedMs,
  isRetryable,
  newBucket,
  recordResult,
  retryAfterMs,
  takeFromBucket,
  tokenKeepUntil,
  NEW_BREAKER,
  type BreakerState,
  type BucketState,
} from "../src/lib/mindbody-throttle.ts";

const MB_BASE = "https://api.mindbodyonline.com/public/v6";

/* ------------------------------------------------------------------ *
 * The floor under every call (Sep 22 2026)
 * ------------------------------------------------------------------ *
 *
 * Until now this file did one `fetch` and, if it failed, logged a warning and
 * returned. At today's volume - a trainer pressing a button - that is
 * survivable. It is not survivable at the volume beta needs: onboarding one
 * 300-client studio is about 1,500 calls, and one 429 in the middle of that
 * loses a client's data in silence, which is the worst shape a failure can
 * have (docs/rounds/2026-09-22-mindbody-sync-plan.md).
 *
 * Three things, in the order a call meets them:
 *
 *   1. A TOKEN BUCKET, so a burst cannot outrun whatever Mindbody's real
 *      per-second limit is. We do not know that limit - the repo only ever
 *      knew the BILLING threshold - so the default is deliberately
 *      conservative and can be raised from the environment once somebody
 *      reads it off the developer portal. It is set high enough that a
 *      trainer pressing Sync (five calls) never waits, and low enough that
 *      the nightly job spends its 600 calls over a couple of minutes.
 *
 *   2. RETRY WITH BACKOFF, on 429, 408 and 5xx only. A 400, 401 or 404 will
 *      not fix itself and retrying one just spends money. `Retry-After` is
 *      honoured when Mindbody sends it, capped so a silly value cannot hang
 *      a request a trainer is waiting on. Jitter, because four concurrent
 *      pulls retrying in lockstep is its own small thundering herd.
 *
 *   3. A CIRCUIT BREAKER per site. A studio with a wrong Site ID, or Mindbody
 *      being down, must not burn the day's allowance discovering that over
 *      and over. After a run of failures the site goes quiet for a minute and
 *      calls fail fast with a clear reason; one call is let through after the
 *      cooldown to see if it is back.
 *
 * The whole thing is bounded by a total deadline, because a person is
 * sometimes on the other end of this. The existing contract is unchanged:
 * `mindbodyGet` still never throws for an HTTP error, and still returns the
 * same flat result shape.
 *
 * Deliberately not counted: a retry does not raise the `calls` figure the
 * pulls report. That number is a BUDGET estimate the nightly job plans
 * against, and inflating it with retries would make the job pull fewer
 * clients precisely when Mindbody is already struggling.
 */

const envNum = (name: string, fallback: number): number => {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw > 0 ? raw : fallback;
};

/** Requests a second, steady state. Conservative until the real limit is known. */
const BUCKET_LIMITS = {
  perSecond: envNum("MINDBODY_RATE_PER_SEC", 5),
  burst: envNum("MINDBODY_RATE_BURST", 10),
};
/** Attempts INCLUDING the first, so 3 means the original plus two retries. */
const MAX_ATTEMPTS = envNum("MINDBODY_MAX_ATTEMPTS", 3);
/** Everything for one call, retries and waiting included. */
const TOTAL_DEADLINE_MS = envNum("MINDBODY_DEADLINE_MS", 15_000);
const BREAKER_LIMITS = {
  fails: envNum("MINDBODY_BREAKER_FAILS", 5),
  cooldownMs: envNum("MINDBODY_BREAKER_COOLDOWN_MS", 60_000),
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, Math.max(0, ms)));

/* The mutable half. Every decision about it lives in lib/mindbody-throttle.ts,
   which is pure and tested; this file only holds the state and does the
   sleeping. One bucket for the process, one breaker per site. */
let bucket: BucketState = newBucket(BUCKET_LIMITS, Date.now());
const breakers: Record<string, BreakerState> = {};

async function takeToken(): Promise<void> {
  for (;;) {
    const r = takeFromBucket(bucket, BUCKET_LIMITS, Date.now());
    bucket = r.state;
    if (r.waitMs === 0) return;
    await sleep(r.waitMs);
  }
}

export interface FloorOutcome {
  response: Response | null;
  /** Set when no response was obtained at all, or the breaker refused. */
  error: string;
  /** 503 when the breaker refused, 0 when the network failed. */
  status: number;
  attempts: number;
}

/**
 * Every call to Mindbody in this process goes through here.
 * `label` is for the log line only.
 */
async function callMindbody(
  site: string,
  label: string,
  send: () => Promise<Response>,
): Promise<FloorOutcome> {
  const paused = breakerPausedMs(breakers[site] || NEW_BREAKER, Date.now());
  if (paused > 0) {
    return {
      response: null,
      status: 503,
      error:
        `Mindbody calls for site ${site} are paused for another ` +
        `${Math.ceil(paused / 1000)}s after repeated failures.`,
      attempts: 0,
    };
  }

  const deadline = Date.now() + TOTAL_DEADLINE_MS;
  let lastError = "";
  let lastStatus = 0;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    await takeToken();
    let res: Response | null = null;
    try {
      res = await send();
    } catch (err: any) {
      /* A network error, not an HTTP one. Worth one more go. */
      lastError = err?.message || String(err);
      lastStatus = 0;
    }

    if (res) {
      if (res.ok || !isRetryable(res.status)) {
        breakers[site] = recordResult(breakers[site] || NEW_BREAKER, res.ok, BREAKER_LIMITS, Date.now());
        return { response: res, status: res.status, error: "", attempts: attempt };
      }
      lastStatus = res.status;
      lastError = `HTTP ${res.status}`;
    }

    if (attempt >= MAX_ATTEMPTS) break;
    const wait =
      (res && retryAfterMs(res.headers.get("retry-after"), Date.now())) ??
      backoffMs(attempt, Math.random());
    if (Date.now() + wait >= deadline) break;
    console.warn(
      `Mindbody ${label} (site ${site}) ${lastError}; retrying in ${wait}ms ` +
        `(attempt ${attempt} of ${MAX_ATTEMPTS}).`,
    );
    await sleep(wait);
  }

  breakers[site] = recordResult(breakers[site] || NEW_BREAKER, false, BREAKER_LIMITS, Date.now());
  if (breakerPausedMs(breakers[site], Date.now()) > 0) {
    console.warn(
      `Mindbody site ${site}: too many failures in a row, pausing calls for ` +
        `${Math.round(BREAKER_LIMITS.cooldownMs / 1000)}s.`,
    );
  }
  return { response: null, status: lastStatus, error: lastError, attempts: MAX_ATTEMPTS };
}


// A token is kept for the life Mindbody gives it, capped at a day
// (tokenKeepUntil, lib/mindbody-throttle.ts), and dropped the moment Mindbody
// refuses it (forgetMindbodyToken). It used to be re-issued every 55 minutes.
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

  /*
   * The token call goes through the floor as well: it is a call like any
   * other, it can be rate-limited like any other, and a token failure takes
   * every call behind it down with it. Its contract is unchanged - unlike
   * mindbodyGet, this one still THROWS, because a caller with no token has
   * nothing useful to do.
   */
  const outcome = await callMindbody(String(siteId), "usertoken/issue", () =>
    fetch(`${MB_BASE}/usertoken/issue`, {
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
    }),
  );

  const response = outcome.response;
  if (!response) {
    console.error("Mindbody Token Error:", outcome.status, outcome.error);
    throw new Error(`Failed to issue Mindbody token: ${outcome.error}`);
  }

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
    expiresAt: tokenKeepUntil(data.Expires, now),
  };

  return data.AccessToken;
}

/**
 * Mindbody refused this token (a 401): forget it, so the next call signs in
 * again. Only when it is still the one cached - a call that started with an
 * older token must not throw away the fresh one another call just got.
 */
export function forgetMindbodyToken(siteId: string, token: string): void {
  if (tokenCache[siteId]?.token === token) delete tokenCache[siteId];
}

/**
 * Any Mindbody request, through the floor (token bucket, retry, breaker).
 * Never throws for an HTTP error, and never returns null: when the floor gave
 * up or the breaker refused, the answer is a synthetic response carrying
 * Mindbody's usual error shape, so a route's existing `!response.ok` handling
 * reads it like any other refusal. For the routes that called `fetch` bare
 * (the cost plan, A4: sign-in, staff, a staff photo, locations).
 */
export async function mindbodyFetch(
  site: string,
  label: string,
  url: string,
  init: RequestInit,
): Promise<Response> {
  const outcome = await callMindbody(String(site), label, () => fetch(url, init));
  if (outcome.response) return outcome.response;
  return new Response(
    JSON.stringify({ Error: { Message: outcome.error || "Mindbody did not answer." } }),
    { status: outcome.status || 503, headers: { "Content-Type": "application/json" } },
  );
}

/**
 * A GET with the Api-Key, the SiteId and - when one can be had - the staff
 * token. A refused token (401) is forgotten and the call made once more with a
 * fresh one. A sign-in that fails still sends the call without a token, as
 * these routes always did: some endpoints answer without one.
 */
export async function mindbodyAuthedFetch(site: string, label: string, url: string): Promise<Response> {
  const apiKey = process.env.MINDBODY_API_KEY || "";
  let response: Response | null = null;
  for (let pass = 0; pass < 2; pass++) {
    let userToken: string | undefined;
    try {
      userToken = await getMindbodyToken(String(site));
    } catch (tokenErr: any) {
      console.warn(`Could not get a Mindbody token for ${label}, proceeding without:`, tokenErr?.message);
    }
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Api-Key": apiKey,
      SiteId: String(site),
    };
    if (userToken) headers.Authorization = userToken;
    response = await mindbodyFetch(site, label, url, { method: "GET", headers });
    if (response.status === 401 && userToken && pass === 0) {
      forgetMindbodyToken(String(site), userToken);
      continue;
    }
    break;
  }
  return response as Response;
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
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) value.forEach((v) => query.append(key, String(v)));
    else query.append(key, String(value));
  }
  /* A refused token (401) is forgotten and the call made once more with a
     fresh one: tokens are now kept for as long as Mindbody says they last
     (the cost plan, A4), so a refusal is how Journey learns one has gone. */
  let outcome: FloorOutcome | null = null;
  for (let pass = 0; pass < 2; pass++) {
    const userToken = await getMindbodyToken(site);
    outcome = await callMindbody(site, path, () =>
      fetch(`${MB_BASE}/${path}?${query.toString()}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "Api-Key": apiKey,
          SiteId: site,
          Authorization: userToken,
        },
      }),
    );
    if (outcome.response?.status === 401 && pass === 0) {
      forgetMindbodyToken(site, userToken);
      continue;
    }
    break;
  }
  const r = outcome!.response;
  /* Out of attempts, or the breaker is open. Still not a throw. */
  if (!r) {
    console.warn(`Mindbody ${path} gave up (Site ${site}):`, outcome!.status, outcome!.error);
    return { ok: false, status: outcome!.status, data: null, error: outcome!.error };
  }
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
