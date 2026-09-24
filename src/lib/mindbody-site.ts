/**
 * WHICH JOURNEY RECORD IS MINDBODY CLIENT X ON SITE S?
 *
 * Mindbody only promises a client id is unique within ONE site. MSF has two —
 * 29068 (Westlake, Strongsville, Willoughby) and 5746957 (Solon) — and both
 * numbered from 100000001: on Sep 23 2026 the collision check found 43 ids
 * naming a DIFFERENT PERSON at each site. `clients/{X}` has no site in it, so
 * whoever arrived first holds the plain number.
 *
 * The client-identity round (Sep 23 2026, docs/rounds/2026-09-23-client-
 * identity.md) keeps every existing record where it is and gives the SECOND
 * person their own: `clients/{S}-{X}`. The rule, in order:
 *
 *   1. `clients/S-X` exists                 → that is them.
 *   2. `clients/X` is on site S, or its site
 *      is unknown                           → that is them (a sibling studio
 *                                             on the same site is a visitor).
 *   3. `clients/X` is on the OTHER site      → it is someone else: S-X, made
 *                                             if it does not exist yet.
 *   4. `clients/X` does not exist            → X, made — a new client keeps
 *                                             the plain number, as always.
 *
 * Every writer follows it: the schedule sync (mindbody-api-sync.ts), the
 * Limbo release (mindbody-limbo.ts), the server's cross-site check
 * (server/auth.ts) and the webhook (functions/src/mindbody — a separate
 * package, so it carries a copy; keep them in step).
 *
 * The qualified id has a dash in it, so `mindbodyIdOf` (lib/mindbody-id.ts)
 * never mistakes it for a Mindbody number: a record's Mindbody id is always
 * the `mindbodyClientId` field, and its site is `mindbodySiteId` (written on
 * every record this rule creates) or, failing that, its home studio's.
 */

type StudioSite = { id?: string; mindbodySiteId?: string | number | null };
type ClientSiteFields = {
  homeStudioId?: string | null;
  mindbodySiteId?: string | number | null;
};

const trimmed = (v: unknown): string => (v == null ? "" : String(v).trim());

/** `clients/{site}-{mindbodyClientId}` — the second person's record. */
export function siteQualifiedClientId(site: string | number, mindbodyClientId: string | number): string {
  return `${trimmed(site)}-${trimmed(mindbodyClientId)}`;
}

/** The Mindbody site a client record belongs to, or null when unknown. */
export function siteOfClient(
  client: ClientSiteFields | null | undefined,
  studios: readonly StudioSite[],
): string | null {
  if (!client) return null;
  const own = trimmed(client.mindbodySiteId);
  if (own) return own;
  const home = client.homeStudioId;
  if (typeof home !== "string" || !home) return null;
  return trimmed(studios.find((s) => s.id === home)?.mindbodySiteId) || null;
}

/**
 * The site a client record belongs to, when that is a POSITIVE mismatch with
 * `site`; null when it matches or either side is unknown.
 */
export function otherSiteOf(
  client: ClientSiteFields | null | undefined,
  site: string | number | null | undefined,
  studios: readonly StudioSite[],
): string | null {
  const theirs = siteOfClient(client, studios);
  const ours = trimmed(site);
  return theirs && ours && theirs !== ours ? theirs : null;
}

/**
 * The rule above, over what the caller has read. `plain` is the record at
 * `clients/X`: null when it does not exist. Returns the record to use and
 * whether it has to be made.
 */
export function chooseClientDoc(args: {
  mindbodyClientId: string | number;
  site: string | number;
  qualifiedExists: boolean;
  plain: ClientSiteFields | null;
  studios: readonly StudioSite[];
}): { docId: string; create: boolean } {
  const x = trimmed(args.mindbodyClientId);
  const qualified = siteQualifiedClientId(args.site, x);
  if (args.qualifiedExists) return { docId: qualified, create: false };
  if (!args.plain) return { docId: x, create: true };
  if (otherSiteOf(args.plain, args.site, args.studios)) return { docId: qualified, create: true };
  return { docId: x, create: false };
}
